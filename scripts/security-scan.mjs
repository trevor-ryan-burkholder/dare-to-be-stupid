/**
 * Agent-config security scan (DESIGN.md §3.6).
 *
 * The guard hook is *runtime* safety. This is the static, pre-run half. `meeseeks` runs
 * `--dangerously-skip-permissions` unattended, which means it trusts the repo it is
 * pointed at: a poisoned `CLAUDE.md`, a malicious PreToolUse hook, a rogue MCP server or
 * a committed credential could hijack or exfiltrate through the builder long before the
 * guard hook ever fires.
 *
 * Built in rather than shelled out to a scanner package, because this repo takes no
 * runtime dependencies and a required preflight gate should not depend on the network
 * being up or on a registry version being what it was yesterday.
 *
 * Findings carry a severity. Only `block` aborts the run; `warn` is reported and the run
 * continues. Matched secrets are never echoed back — a scanner that prints the credential
 * it found has just written it to your terminal scrollback and your CI log.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/** @typedef {'block' | 'warn'} Severity */
/** @typedef {{ severity: Severity, rule: string, file: string, line: number, detail: string }} Finding */

/** Directories never worth scanning: not ours, enormous, or both. */
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.cache',
  'vendor',
  '__pycache__',
  '.venv',
  'venv',
  'target',
]);

/** Anything larger is a build artefact or a dataset, not an agent surface. */
const MAX_FILE_BYTES = 512 * 1024;

/**
 * Credential shapes. Each entry names what it matches so the finding is actionable
 * without quoting the value.
 * @type {{ rule: string, pattern: RegExp, what: string }[]}
 */
const SECRET_PATTERNS = [
  { rule: 'secret-aws-access-key', pattern: /\bAKIA[0-9A-Z]{16}\b/g, what: 'an AWS access key id' },
  { rule: 'secret-anthropic-key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/g, what: 'an Anthropic API key' },
  { rule: 'secret-openai-key', pattern: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}\b/g, what: 'an OpenAI API key' },
  { rule: 'secret-github-token', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g, what: 'a GitHub token' },
  { rule: 'secret-slack-token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, what: 'a Slack token' },
  { rule: 'secret-google-key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g, what: 'a Google API key' },
  {
    rule: 'secret-private-key',
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
    what: 'a private key block',
  },
  {
    rule: 'secret-assigned-credential',
    // **This scanner's entire scope is JSON — `.mcp.json`, `.claude/settings*`, `hooks.json` —
    // and the previous pattern could not match JSON.** It required the key name to be followed
    // immediately by `:` or `=`, but in JSON the key carries its own closing quote first, so
    // `"api_key": "abcdefghijklmnop1234"` was invisible. Verified against the real
    // `scanAgentSurface`: an MCP server declaring `"API_KEY": "<26 chars>"` in its `env` produced
    // no secret finding at all. Unquoted `.env`, YAML and shell assignments were missed for the
    // same reason.
    //
    // Quotes are now optional on both sides, and two details in the value are load-bearing —
    // both found by existing tests when a first draft widened this too far:
    //
    //   - **No `$`, `{` or `}`**, so `"API_KEY": "${MY_KEY}"` does not match. Referencing an
    //     environment variable is the *correct* pattern, and flagging it would train an operator
    //     to ignore this rule.
    //   - **No `.`**, so `const apiKey = process.env.API_KEY` does not match. Reading a key from
    //     the environment is the thing this rule wants people to do. A real secret rarely needs a
    //     dot inside a sixteen-character run; a JWT segment has none.
    //
    // And the separator is `[ \t]*` rather than `\s*` **because `\s` crosses newlines**: with
    // `\s*`, an empty `API_KEY=` on one line swallowed the *next* line as its value, which is
    // how `.env.example` — a file of deliberately empty placeholders — reported a hard-coded
    // credential.
    pattern:
      /["']?\b(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|password)\b["']?[ \t]*[:=][ \t]*["']?[A-Za-z0-9_\-/+=]{16,}["']?/gi,
    what: 'a hard-coded credential assignment',
  },
];

/**
 * Shell shapes that have no business in a hook or an MCP launch command.
 * @type {{ rule: string, pattern: RegExp, detail: string }[]}
 */
const DANGEROUS_COMMAND_PATTERNS = [
  {
    rule: 'hook-remote-execution',
    pattern: /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba|z|k)?sh\b/i,
    detail: 'downloads a script and pipes it straight into a shell',
  },
  {
    rule: 'hook-encoded-execution',
    pattern: /\bbase64\b[^\n|]*(?:-d|--decode)[^\n|]*\|\s*(?:ba|z|k)?sh\b/i,
    detail: 'decodes base64 and pipes it into a shell',
  },
  {
    rule: 'hook-reverse-shell',
    pattern: /\b(?:nc|ncat|netcat)\b\s+[^\n]*\s-\w*e\w*\b/i,
    detail: 'opens a reverse shell',
  },
  {
    rule: 'hook-credential-read',
    pattern: /(?:~|\$HOME)\/\.(?:ssh|aws|config\/gcloud)\b|\bid_rsa\b|\.netrc\b/,
    detail: 'reads credential material from the home directory',
  },
  {
    rule: 'hook-exfiltration',
    pattern: /\bcurl\b[^\n]*(?:-X\s*POST|--data|-d\s)[^\n]*\$\{?[A-Z_]*(?:KEY|TOKEN|SECRET|PASSWORD)/,
    detail: 'posts an environment secret to a remote host',
  },
];

/**
 * Instruction-file shapes that indicate prompt injection aimed at the builder.
 * @type {{ rule: string, pattern: RegExp, detail: string }[]}
 */
const INJECTION_PATTERNS = [
  {
    rule: 'injection-override',
    pattern:
      /\b(?:ignore|disregard|forget)\b[^.\n]{0,40}\b(?:previous|prior|earlier|above|all)\b[^.\n]{0,20}\binstructions?\b/i,
    detail: 'tells the agent to ignore its instructions',
  },
  { rule: 'injection-exfiltration', pattern: /\bexfiltrat(?:e|ing|ion)\b/i, detail: 'names exfiltration' },
  {
    rule: 'injection-send-secrets',
    pattern:
      /\b(?:send|post|upload|transmit)\b[^.\n]{0,60}\b(?:key|token|secret|credential|env)\w*\b[^.\n]{0,40}https?:\/\//i,
    detail: 'instructs the agent to send credentials to a remote host',
  },
  {
    rule: 'injection-remote-execution',
    pattern: /\b(?:curl|wget)\b[^\n|]*\|\s*(?:ba|z|k)?sh\b/i,
    detail: 'instructs the agent to pipe a download into a shell',
  },
];

/** Files whose contents are instructions to an agent. */
const INSTRUCTION_FILES = new Set(['claude.md', 'agents.md', 'gemini.md', '.cursorrules', 'copilot-instructions.md']);

/**
 * Walk a directory tree, skipping build output and anything too large to be a config.
 *
 * @param {string} root
 * @returns {string[]} repo-relative posix paths, sorted
 */
export function listScannableFiles(root) {
  /** @type {string[]} */
  const found = [];
  /** @param {string} dir */
  function walk(dir) {
    /** @type {import('node:fs').Dirent[]} */
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        if (statSync(full).size > MAX_FILE_BYTES) continue;
      } catch {
        continue;
      }
      found.push(path.relative(root, full).split(path.sep).join('/'));
    }
  }
  walk(root);
  return found.sort();
}

/**
 * @param {string} contents
 * @returns {boolean} true when the file looks binary
 */
function looksBinary(contents) {
  return contents.slice(0, 1024).includes('\u0000');
}

/**
 * Report a credential without reproducing it.
 * @param {string} match
 * @returns {string}
 */
function redact(match) {
  return `${match.slice(0, 4)}… (${match.length} characters)`;
}

/**
 * @param {string} contents
 * @param {number} index
 * @returns {number} 1-based line number
 */
function lineAt(contents, index) {
  let line = 1;
  for (let i = 0; i < index && i < contents.length; i += 1) {
    if (contents[i] === '\n') line += 1;
  }
  return line;
}

/**
 * Pull every string out of a parsed settings/MCP document, wherever it is nested.
 *
 * @param {unknown} value
 * @param {string[]} out
 */
function collectCommandStrings(value, out) {
  if (typeof value === 'string') {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectCommandStrings(entry, out);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const entry of Object.values(value)) collectCommandStrings(entry, out);
  }
}

/**
 * @param {string} relative
 * @returns {boolean}
 */
function isInstructionFile(relative) {
  const base = path.basename(relative).toLowerCase();
  return INSTRUCTION_FILES.has(base) || (relative.startsWith('.claude/') && relative.endsWith('.md'));
}

/**
 * @param {string} relative
 * @returns {boolean}
 */
function isAgentConfig(relative) {
  const base = path.basename(relative).toLowerCase();
  if (base === '.mcp.json' || base === 'mcp.json') return true;
  return relative.startsWith('.claude/') && (base.startsWith('settings') || base === 'hooks.json');
}

/**
 * Scan a repository's own agent surface.
 *
 * @param {string} root repository root
 * @returns {{ findings: Finding[], filesScanned: number }}
 */
export function scanAgentSurface(root) {
  /** @type {Finding[]} */
  const findings = [];
  let filesScanned = 0;

  for (const relative of listScannableFiles(root)) {
    /** @type {string} */
    let contents;
    try {
      contents = readFileSync(path.join(root, relative), 'utf8');
    } catch {
      continue;
    }
    if (looksBinary(contents)) continue;
    filesScanned += 1;

    for (const { rule, pattern, what } of SECRET_PATTERNS) {
      for (const match of contents.matchAll(pattern)) {
        findings.push({
          severity: 'block',
          rule,
          file: relative,
          line: lineAt(contents, match.index ?? 0),
          detail: `looks like ${what}: ${redact(match[0])}`,
        });
      }
    }

    if (isInstructionFile(relative)) {
      for (const { rule, pattern, detail } of INJECTION_PATTERNS) {
        const match = pattern.exec(contents);
        if (match !== null) {
          findings.push({
            severity: 'block',
            rule,
            file: relative,
            line: lineAt(contents, match.index),
            detail: `instruction file ${detail}`,
          });
        }
      }
    }

    if (!isAgentConfig(relative)) continue;

    /** @type {unknown} */
    let parsed;
    try {
      parsed = JSON.parse(contents);
    } catch {
      findings.push({
        severity: 'block',
        rule: 'agent-config-unparseable',
        file: relative,
        line: 1,
        detail: 'agent configuration is not valid JSON, so its hooks and servers cannot be reviewed',
      });
      continue;
    }

    /** @type {string[]} */
    const strings = [];
    collectCommandStrings(parsed, strings);
    for (const command of strings) {
      for (const { rule, pattern, detail } of DANGEROUS_COMMAND_PATTERNS) {
        if (!pattern.test(command)) continue;
        findings.push({
          severity: 'block',
          rule,
          file: relative,
          line: lineAt(contents, Math.max(contents.indexOf(command), 0)),
          detail: `agent configuration ${detail}`,
        });
      }
    }

    const base = path.basename(relative).toLowerCase();
    if (base !== '.mcp.json' && base !== 'mcp.json') continue;
    const servers =
      parsed !== null && typeof parsed === 'object'
        ? /** @type {Record<string, unknown>} */ (parsed).mcpServers
        : undefined;
    const names = servers !== null && typeof servers === 'object' ? Object.keys(servers ?? {}) : [];
    if (names.length > 0) {
      findings.push({
        severity: 'warn',
        rule: 'mcp-servers-present',
        file: relative,
        line: 1,
        detail: `run will trust ${names.length} MCP server${names.length === 1 ? '' : 's'}: ${names.sort().join(', ')}`,
      });
    }
  }

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule));
  return { findings, filesScanned };
}

/**
 * @param {Finding[]} findings
 * @returns {Finding[]} only the ones that abort the run
 */
export function blockingFindings(findings) {
  return findings.filter((finding) => finding.severity === 'block');
}

/**
 * Render findings for a terminal. Plain and literal — this is failure output, and
 * DESIGN.md §9 keeps failure output unstyled.
 *
 * @param {Finding[]} findings
 * @returns {string}
 */
export function formatFindings(findings) {
  return findings
    .map((f) => `${f.severity.toUpperCase()} ${f.file}:${f.line} [${f.rule}] ${f.detail}`)
    .join('\n');
}
