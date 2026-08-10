#!/usr/bin/env node
/**
 * PreToolUse guard hook — the limit that survives `--dangerously-skip-permissions`.
 *
 * DESIGN.md §6. The builder runs with permissions off; PreToolUse hooks fire regardless
 * of permission mode, which makes this the only reliable place to put a limit.
 *
 * Blocked categories, and nothing else:
 *   1. protected-state — anything touching `.dare/state.json` or `.dare/config.json`.
 *      The ratchet is not editable by the process it constrains.
 *   2. git-history    — `git push --force`, `rebase`, `filter-branch`, `reflog expire`.
 *      Recovery stays possible.
 *   3. rm-recursive   — recursive `rm` outside the temp directory.
 *   4. nested-dare    — a builder invoking `/dare`. CLAUDE.md invariant "No nesting";
 *      DESIGN.md §13.6 requires this at the hook as well as at the driver.
 *
 * Everything else is allowed. That restraint is the plugin.
 *
 * Contract: reads the PreToolUse payload as JSON on stdin. On deny it prints a
 * `hookSpecificOutput` block carrying `permissionDecision: "deny"` and a reason. On allow
 * it prints nothing, leaving the decision to the rest of the permission stack rather than
 * stamping an "allow" over it. Exit code is 0 either way.
 *
 * Scope assumptions, recorded rather than guessed at silently:
 *   - DESIGN.md §6 says "blocks exactly" those file names, so `.dare/bloopers.log` and the
 *     rest of `.dare/` stay writable despite §13.2's parenthetical. §6 is the normative list.
 *   - `--force-with-lease` / `--force-if-includes` are treated as `--force`: same category.
 *   - Recursive `rm` is blocked with or without `-f`; `-r` alone is equally destructive.
 *   - A malformed payload is a deny, not an allow. A guard that fails open on a broken
 *     harness is not a guard (CLAUDE.md: nothing defaults to pass).
 */

import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** @typedef {{ value: string, hasExpansion: boolean }} Token */
/** @typedef {{ decision: 'allow' }} Allow */
/** @typedef {{ decision: 'deny', rule: string, reason: string }} Deny */
/** @typedef {Allow | Deny} Decision */

/** @type {Allow} */
const ALLOW = { decision: 'allow' };

/**
 * @param {string} rule
 * @param {string} reason
 * @returns {Deny}
 */
function deny(rule, reason) {
  return { decision: 'deny', rule, reason };
}

/**
 * Tool-input keys that carry a filesystem path: `file_path`, `notebook_path`, `path`,
 * `filePath`. Matching on the suffix rather than an enumerated list means a tool that
 * later arrives with a new `*_path` key is covered on the day it ships. Keys that hold
 * file *contents* are deliberately not inspected — a document may mention the path.
 */
const PATH_KEY_RE = /(^|_)path$|Path$/;

/** Basenames that are off limits when they sit directly inside a `.dare` directory. */
const PROTECTED_BASENAMES = new Set(['state.json', 'config.json']);

/** `.dare/state.json` or `.dare/config.json`, either separator, not part of a longer name. */
const PROTECTED_LITERAL_RE = /(^|[^\w.-])\.dare[\\/](state|config)\.json(?![\w.-])/;

/** A `.dare` path component on its own. */
const DARE_DIR_RE = /(^|[^\w.-])\.dare(?![\w.-])/;

/** A bare `state.json` / `config.json`, used only in combination with DARE_DIR_RE. */
const PROTECTED_BASENAME_RE = /(^|[^\w.-])(state|config)\.json(?![\w.-])/;

/** The `/dare` slash command as a standalone word. */
const SLASH_DARE_RE = /(^|\s)\/dare(\s|$)/;

// ---------------------------------------------------------------------------
// Shell tokenizer
// ---------------------------------------------------------------------------

/**
 * Split a shell command into segments of tokens, quote-aware.
 *
 * Segments break on `;`, newline, `&&`, `||`, `|` and `&`, so every pipeline stage and
 * chained command is inspected as its own invocation. Redirection targets are dropped so
 * they are not mistaken for operands. Command substitutions are collected separately so
 * callers can re-run the rules over their bodies.
 *
 * This is not a shell. It is deliberately conservative: anything it cannot resolve is
 * marked `hasExpansion`, and callers treat unresolvable operands as denied.
 *
 * @param {string} command
 * @returns {{ segments: Token[][], substitutions: string[] }}
 */
export function tokenizeCommand(command) {
  /** @type {Token[][]} */
  const segments = [];
  /** @type {string[]} */
  const substitutions = [];
  /** @type {Token[]} */
  let tokens = [];
  /** @type {Token | null} */
  let cur = null;

  function open() {
    if (!cur) cur = { value: '', hasExpansion: false };
    return cur;
  }
  function endToken() {
    if (cur) tokens.push(cur);
    cur = null;
  }
  function endSegment() {
    endToken();
    if (tokens.length > 0) segments.push(tokens);
    tokens = [];
  }

  /**
   * Read a balanced `(...)` group starting at the opening paren.
   * @param {number} openIndex
   * @returns {{ inner: string, end: number }} `end` is the index of the closing paren.
   */
  function readParens(openIndex) {
    let depth = 0;
    for (let j = openIndex; j < command.length; j += 1) {
      if (command[j] === '(') depth += 1;
      else if (command[j] === ')') {
        depth -= 1;
        if (depth === 0) return { inner: command.slice(openIndex + 1, j), end: j };
      }
    }
    return { inner: command.slice(openIndex + 1), end: command.length };
  }

  let i = 0;
  while (i < command.length) {
    const ch = command[i];

    if (ch === '\\') {
      open().value += command[i + 1] ?? '';
      i += 2;
      continue;
    }

    if (ch === "'") {
      const end = command.indexOf("'", i + 1);
      open().value += end === -1 ? command.slice(i + 1) : command.slice(i + 1, end);
      i = end === -1 ? command.length : end + 1;
      continue;
    }

    if (ch === '"') {
      const token = open();
      i += 1;
      while (i < command.length && command[i] !== '"') {
        if (command[i] === '\\') {
          token.value += command[i + 1] ?? '';
          i += 2;
          continue;
        }
        if (command[i] === '$' && command[i + 1] === '(') {
          const { inner, end } = readParens(i + 1);
          substitutions.push(inner);
          token.hasExpansion = true;
          i = end + 1;
          continue;
        }
        if (command[i] === '`') {
          const end = command.indexOf('`', i + 1);
          substitutions.push(end === -1 ? command.slice(i + 1) : command.slice(i + 1, end));
          token.hasExpansion = true;
          i = end === -1 ? command.length : end + 1;
          continue;
        }
        if (command[i] === '$') token.hasExpansion = true;
        token.value += command[i];
        i += 1;
      }
      i += 1;
      continue;
    }

    if (ch === '$' && command[i + 1] === '(') {
      const { inner, end } = readParens(i + 1);
      substitutions.push(inner);
      open().hasExpansion = true;
      i = end + 1;
      continue;
    }

    if (ch === '`') {
      const end = command.indexOf('`', i + 1);
      substitutions.push(end === -1 ? command.slice(i + 1) : command.slice(i + 1, end));
      open().hasExpansion = true;
      i = end === -1 ? command.length : end + 1;
      continue;
    }

    if (ch === '$') {
      const token = open();
      token.hasExpansion = true;
      token.value += ch;
      i += 1;
      continue;
    }

    if (ch === ' ' || ch === '\t' || ch === '\r') {
      endToken();
      i += 1;
      continue;
    }

    if (command.slice(i, i + 2) === '&&' || command.slice(i, i + 2) === '||') {
      endSegment();
      i += 2;
      continue;
    }

    if (ch === ';' || ch === '|' || ch === '\n' || ch === '&') {
      endSegment();
      i += 1;
      continue;
    }

    if (ch === '>' || ch === '<') {
      // `2>file` — the fd number belongs to the redirection, not to the operands.
      // `cur` is mutated by open()/endToken(), so control-flow narrowing does not
      // describe it here; the cast restores the declared type.
      const pending = /** @type {Token | null} */ (cur);
      if (pending !== null && /^\d+$/.test(pending.value)) cur = null;
      endToken();
      i += 1;
      while (i < command.length && (command[i] === '>' || command[i] === '&')) i += 1;
      while (i < command.length && (command[i] === ' ' || command[i] === '\t')) i += 1;
      // Consume the redirection target and discard it.
      const before = tokens.length;
      while (i < command.length && !' \t\n;|&<>'.includes(command[i])) {
        open().value += command[i];
        i += 1;
      }
      cur = null;
      tokens.length = before;
      continue;
    }

    open().value += ch;
    i += 1;
  }

  endSegment();
  return { segments, substitutions };
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/**
 * Drop leading `VAR=value` assignments and privilege/wrapper prefixes so the real
 * command word is the first token.
 * @param {Token[]} segment
 * @returns {Token[]}
 */
function stripPrefixes(segment) {
  let i = 0;
  while (i < segment.length) {
    const value = segment[i].value;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(value)) {
      i += 1;
      continue;
    }
    if (value === 'sudo' || value === 'command' || value === 'nohup') {
      i += 1;
      continue;
    }
    break;
  }
  return segment.slice(i);
}

/**
 * @param {Token[]} segment
 * @returns {string} the invoked program's basename, or `''` for an empty segment.
 */
function commandName(segment) {
  if (segment.length === 0) return '';
  return path.posix.basename(segment[0].value.replaceAll('\\', '/'));
}

/**
 * Does this path point at `.dare/state.json` or `.dare/config.json`?
 * @param {string} candidate
 * @param {string} cwd
 * @returns {boolean}
 */
export function isProtectedStatePath(candidate, cwd) {
  if (candidate.length === 0) return false;
  const resolved = path.resolve(cwd, candidate);
  if (!PROTECTED_BASENAMES.has(path.basename(resolved))) return false;
  return path.basename(path.dirname(resolved)) === '.dare';
}

const PROTECTED_REASON =
  'references .dare/state.json or .dare/config.json. The ratchet is not editable by the process it constrains (DESIGN.md §6).';

/**
 * @param {string} command
 * @param {Token[][]} segments
 * @returns {Decision}
 */
function checkProtectedState(command, segments) {
  if (PROTECTED_LITERAL_RE.test(command)) {
    return deny('protected-state', `Command ${PROTECTED_REASON}`);
  }
  for (const segment of segments) {
    for (const token of segment) {
      if (PROTECTED_LITERAL_RE.test(token.value)) {
        return deny('protected-state', `Command ${PROTECTED_REASON}`);
      }
    }
  }
  // `cd .dare && echo {} > state.json` never spells the protected path out in full.
  if (DARE_DIR_RE.test(command) && PROTECTED_BASENAME_RE.test(command)) {
    return deny('protected-state', `Command ${PROTECTED_REASON}`);
  }
  return ALLOW;
}

/** git global options that take a separate value argument. */
const GIT_VALUE_OPTS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path']);

/**
 * @param {Token[]} segment tokens after {@link stripPrefixes}
 * @returns {{ sub: string, args: string[] }} `sub` is `''` when there is no subcommand.
 */
function gitSubcommand(segment) {
  let i = 1;
  while (i < segment.length) {
    const value = segment[i].value;
    if (!value.startsWith('-')) break;
    if (GIT_VALUE_OPTS.has(value)) i += 2;
    else i += 1;
  }
  if (i >= segment.length) return { sub: '', args: [] };
  return { sub: segment[i].value, args: segment.slice(i + 1).map((t) => t.value) };
}

/**
 * @param {string[]} args
 * @returns {boolean}
 */
function hasForceFlag(args) {
  return args.some(
    (a) =>
      a === '--force' ||
      a === '--force-with-lease' ||
      a === '--force-if-includes' ||
      a.startsWith('--force-with-lease=') ||
      (/^-[A-Za-z]+$/.test(a) && a.includes('f')),
  );
}

const GIT_REASON = 'is blocked so recovery stays possible (DESIGN.md §6).';

/**
 * @param {Token[][]} segments
 * @returns {Decision}
 */
function checkGitHistory(segments) {
  for (const raw of segments) {
    const segment = stripPrefixes(raw);
    if (commandName(segment) !== 'git') continue;
    const { sub, args } = gitSubcommand(segment);
    if (sub === 'push' && hasForceFlag(args)) return deny('git-history', `Force push ${GIT_REASON}`);
    if (sub === 'rebase') return deny('git-history', `git rebase ${GIT_REASON}`);
    if (sub === 'filter-branch') return deny('git-history', `git filter-branch ${GIT_REASON}`);
    if (sub === 'reflog' && args[0] === 'expire') return deny('git-history', `git reflog expire ${GIT_REASON}`);
  }
  return ALLOW;
}

/**
 * Roots under which recursive deletion is permitted.
 * @returns {string[]}
 */
function tempRoots() {
  return [...new Set([path.resolve('/tmp'), path.resolve(os.tmpdir())])];
}

/**
 * @param {string} resolved
 * @returns {boolean} true only for paths strictly *inside* a temp root.
 */
function isInsideTemp(resolved) {
  return tempRoots().some((root) => resolved.startsWith(root + path.sep));
}

/**
 * @param {Token[][]} segments
 * @param {string} cwd
 * @returns {Decision}
 */
function checkRecursiveRemove(segments, cwd) {
  for (const raw of segments) {
    const segment = stripPrefixes(raw);
    if (commandName(segment) !== 'rm') continue;

    let recursive = false;
    let endOfFlags = false;
    /** @type {Token[]} */
    const operands = [];
    for (const token of segment.slice(1)) {
      const value = token.value;
      if (!endOfFlags && value === '--') {
        endOfFlags = true;
        continue;
      }
      if (!endOfFlags && value.startsWith('--')) {
        if (value === '--recursive') recursive = true;
        continue;
      }
      if (!endOfFlags && /^-[A-Za-z]+$/.test(value)) {
        if (value.includes('r') || value.includes('R')) recursive = true;
        continue;
      }
      operands.push(token);
    }

    if (!recursive || operands.length === 0) continue;

    for (const operand of operands) {
      if (operand.hasExpansion) {
        return deny(
          'rm-recursive',
          `Recursive rm target "${operand.value}" cannot be resolved before the command runs; unresolvable targets are denied (DESIGN.md §6).`,
        );
      }
      const expanded = operand.value.startsWith('~')
        ? path.join(os.homedir(), operand.value.slice(1))
        : operand.value;
      const resolved = path.resolve(cwd, expanded);
      if (!isInsideTemp(resolved)) {
        return deny('rm-recursive', `Recursive rm outside the temp directory is blocked: ${resolved} (DESIGN.md §6).`);
      }
    }
  }
  return ALLOW;
}

const NESTED_REASON =
  'dare does not spawn dare. Nested runs are blocked at the driver and at the hook (CLAUDE.md invariant, DESIGN.md §13.6).';

/** Programs that take a whole command, or a whole prompt, as an argument. */
const SHELL_INVOKERS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);

/**
 * A run is nested when something *invokes* the slash command — not when a string happens
 * to contain it.
 *
 * The first version denied any token equal to the slash command anywhere in the line, and
 * it caught a heredoc that merely mentioned the command in a code comment. Prose is not an
 * invocation. So the rule is command position: the first word of a segment, or an argument
 * to `claude`, where the argument really is the prompt.
 *
 * The remaining trade-off is deliberate. A document whose *line* begins with the slash
 * command, written through a heredoc, is still refused. Writing files that way is rare —
 * the Write tool is the normal path — and erring toward refusing a nested run is the
 * correct direction to err in.
 *
 * @param {Token[][]} segments
 * @returns {Decision}
 */
function checkNestedDare(segments) {
  for (const raw of segments) {
    const segment = stripPrefixes(raw);
    if (segment.length === 0) continue;

    const name = commandName(segment);
    const first = segment[0].value;
    if (name === 'dare' || first === '/dare' || SLASH_DARE_RE.test(first)) {
      return deny('nested-dare', NESTED_REASON);
    }

    if (name !== 'claude') continue;
    for (const token of segment.slice(1)) {
      if (token.value === '/dare' || SLASH_DARE_RE.test(token.value)) {
        return deny('nested-dare', NESTED_REASON);
      }
    }
  }
  return ALLOW;
}

/**
 * `bash -c "..."` hides a whole command inside an argument, where no rule that keys off
 * the command word can see it. Every rule was blind to this, not only the nesting one:
 * `bash -c "rm -rf /etc"` reads as an invocation of `bash`.
 *
 * @param {Token[][]} segments
 * @returns {string[]} command strings carried as arguments
 */
function wrappedCommands(segments) {
  /** @type {string[]} */
  const inner = [];
  for (const raw of segments) {
    const segment = stripPrefixes(raw);
    if (segment.length < 2 || !SHELL_INVOKERS.has(commandName(segment))) continue;
    const flag = segment.findIndex((token) => token.value === '-c');
    if (flag === -1 || flag + 1 >= segment.length) continue;
    inner.push(segment[flag + 1].value);
  }
  return inner;
}

/**
 * Run every Bash rule over one command string, recursing into command substitutions.
 * @param {string} command
 * @param {string} cwd
 * @returns {Decision}
 */
export function checkBashCommand(command, cwd) {
  const { segments, substitutions } = tokenizeCommand(command);
  const checks = [
    checkProtectedState(command, segments),
    checkNestedDare(segments),
    checkGitHistory(segments),
    checkRecursiveRemove(segments, cwd),
  ];
  for (const result of checks) {
    if (result.decision === 'deny') return result;
  }
  for (const inner of [...substitutions, ...wrappedCommands(segments)]) {
    const result = checkBashCommand(inner, cwd);
    if (result.decision === 'deny') return result;
  }
  return ALLOW;
}

/**
 * Path-carrying keys on a non-Bash tool input.
 * @param {Record<string, unknown>} toolInput
 * @param {string} cwd
 * @returns {Decision}
 */
function checkToolPaths(toolInput, cwd) {
  for (const [key, value] of Object.entries(toolInput)) {
    if (typeof value !== 'string') continue;
    if (!PATH_KEY_RE.test(key)) continue;
    if (isProtectedStatePath(value, cwd)) {
      return deny(
        'protected-state',
        `${value} is ratchet state. It is not editable by the process it constrains (DESIGN.md §6).`,
      );
    }
  }
  return ALLOW;
}

/**
 * Decide a single PreToolUse payload.
 * @param {unknown} payload
 * @param {{ cwd?: string }} [options]
 * @returns {Decision}
 */
export function evaluate(payload, options = {}) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return deny(
      'malformed-payload',
      'PreToolUse payload was not a JSON object. A guard that fails open is not a guard.',
    );
  }
  const record = /** @type {Record<string, unknown>} */ (payload);
  const cwd =
    typeof record.cwd === 'string' && record.cwd.length > 0 ? record.cwd : (options.cwd ?? process.cwd());
  const toolName = typeof record.tool_name === 'string' ? record.tool_name : '';
  const toolInput =
    record.tool_input !== null && typeof record.tool_input === 'object' && !Array.isArray(record.tool_input)
      ? /** @type {Record<string, unknown>} */ (record.tool_input)
      : null;

  if (toolName === 'Bash') {
    const command = toolInput === null ? undefined : toolInput.command;
    if (typeof command !== 'string') {
      return deny(
        'malformed-payload',
        'Bash payload carried no command string. A guard that fails open is not a guard.',
      );
    }
    return checkBashCommand(command, cwd);
  }

  return checkToolPaths(toolInput ?? {}, cwd);
}

/**
 * Render a decision as the hook's stdout. Allow prints nothing.
 * @param {Decision} decision
 * @returns {string}
 */
export function renderDecision(decision) {
  if (decision.decision === 'allow') return '';
  return `${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `[dare:${decision.rule}] ${decision.reason}`,
    },
  })}\n`;
}

/**
 * @param {NodeJS.ReadableStream} stream
 * @returns {Promise<string>}
 */
async function readStdin(stream) {
  /** @type {Buffer[]} */
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const raw = await readStdin(process.stdin);
  /** @type {Decision} */
  let decision;
  try {
    decision = evaluate(JSON.parse(raw));
  } catch {
    decision = deny(
      'malformed-payload',
      'PreToolUse payload was not valid JSON. A guard that fails open is not a guard.',
    );
  }
  const out = renderDecision(decision);
  if (out.length > 0) process.stdout.write(out);
  process.exitCode = 0;
}

const invokedDirectly =
  typeof process.argv[1] === 'string' && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) await main();
