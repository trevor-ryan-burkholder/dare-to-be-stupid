#!/usr/bin/env node
/**
 * PreToolUse guard hook — the limit that survives `--dangerously-skip-permissions`.
 *
 * DESIGN.md §6. The builder runs with permissions off; PreToolUse hooks fire regardless
 * of permission mode, which makes this the only reliable place to put a limit.
 *
 * Blocked categories, and nothing else:
 *   1. protected-state — any mutation of any path under `.meeseeks/`, **while inside a run**.
 *      A run does not write the state or evidence it is judged by. Outside a run there is
 *      no constrained process, and the operator may edit their own configuration from
 *      wherever they like — including from inside Claude Code, which is the only place some
 *      of them work. See {@link insideRun}.
 *   2. git-history    — `git push --force`, `rebase`, `filter-branch`, `reflog expire`.
 *      Recovery stays possible.
 *   3. rm-recursive   — recursive `rm` outside the temp directory.
 *   4. nested-meeseeks    — a builder invoking `/meeseeks`. CLAUDE.md invariant "No nesting";
 *      DESIGN.md §13.6 requires this at the hook as well as at the driver.
 *
 * Only category 1 is scoped to a run. The other three are refused to everyone: none of
 * them becomes reasonable merely because a human asked for it in this session.
 *
 * Everything else is allowed. That restraint is the plugin.
 *
 * Contract: reads the PreToolUse payload as JSON on stdin. On deny it prints a
 * `hookSpecificOutput` block carrying `permissionDecision: "deny"` and a reason. On allow
 * it prints nothing, leaving the decision to the rest of the permission stack rather than
 * stamping an "allow" over it. Exit code is 0 either way.
 *
 * Scope assumptions, recorded rather than guessed at silently:
 *   - The protected set is the whole `.meeseeks/` tree, not an enumerated list of basenames.
 *     Enumeration left `red-evidence.json` writable, and that file is what makes
 *     RED-before-GREEN mean anything: a builder that can write it can manufacture the proof
 *     that its own test was once failing.
 *   - Reads are not blocked, because `hooks.json` matches only the mutating tools. Bash is
 *     the exception and is refused outright: a shell cannot be split into reads and writes
 *     without a whitelist that fails open.
 *   - `--force-with-lease` / `--force-if-includes` are treated as `--force`: same category.
 *   - Recursive `rm` is blocked with or without `-f`; `-r` alone is equally destructive.
 *   - A malformed payload is a deny, not an allow. A guard that fails open on a broken
 *     harness is not a guard (CLAUDE.md: nothing defaults to pass).
 */

import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

/**
 * A `.meeseeks` path component on its own. The whole runtime directory is protected.
 *
 * This used to be an enumerated list of three basenames — `state.json`, `config.json`,
 * `lessons.json`. Enumeration was the bug, and `red-evidence.json` is the proof of it: that
 * file records which tests were ever observed failing, and RED-before-GREEN is the rule
 * stopping a builder claiming credit for a test that has only ever been green. A builder
 * able to write it can mint the evidence used to judge it. Nor was it alone — the archived
 * Build Briefs are the only record of what was actually asked for, and the test reports are
 * what the ratchet reads to decide whether anything regressed. Neither was on the list, and
 * every future driver-owned artifact would have had to be remembered onto it.
 *
 * The rule is now positional rather than nominal: anything under a `.meeseeks` directory is
 * state or evidence owned by the driver, and the process being judged does not write it.
 */
const MEESEEKS_DIR_RE = /(^|[^\w.-])\.meeseeks(?![\w.-])/;

/** The `/meeseeks` slash command as a standalone word. */
const SLASH_MEESEEKS_RE = /(^|\s)\/meeseeks(\s|$)/;

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
 * Does this path land anywhere inside a `.meeseeks` directory?
 *
 * Resolved first, so `..` cannot walk into one and a relative path is judged against the
 * working directory the tool call actually ran in. Depth is not bounded: `.meeseeks/briefs/
 * iter-004.md` and `.meeseeks/reports/unit.json` are as protected as `.meeseeks/state.json`, and a
 * directory the driver has not invented yet is protected on the day it appears.
 *
 * Matching is on whole path segments, so a sibling named `.meeseeks-notes` is untouched.
 *
 * @param {string} candidate
 * @param {string} cwd
 * @returns {boolean}
 */
export function isProtectedStatePath(candidate, cwd) {
  if (candidate.length === 0) return false;
  const resolved = path.resolve(cwd, candidate);
  return resolved.split(/[\\/]/).includes('.meeseeks');
}

/**
 * This file, and the manifest that registers it.
 *
 * Resolved from `import.meta.url` rather than named, so the rule is **self-referential**: it
 * protects whichever copy of the guard is actually deciding, wherever it was loaded from. A
 * literal path would be an enumeration, and enumeration is the defect this repository has paid
 * for repeatedly.
 */
const GUARD_FILE = fileURLToPath(import.meta.url);
const GUARD_MANIFEST = path.join(path.dirname(GUARD_FILE), 'hooks.json');

/**
 * Is this path the guard itself?
 *
 * `CLAUDE.md`'s invariant reads *"the guard hook is not editable by what it guards"*. That was
 * true of `.meeseeks/` and **false of the guard**: the positional rule protected the run's evidence
 * and nothing protected the file deciding what a run may do. A builder holding
 * `--dangerously-skip-permissions` could rewrite its own constraint, and no required id would
 * have noticed.
 *
 * **For an ordinary target this rule never fires** — the guard lives in an install cache well
 * outside the repository under test, so no path in that tree resolves to it. It exists for the
 * one case where the repository under test *is* the plugin, which is the case that has to be
 * safe before the loop is ever pointed at this repository.
 *
 * @param {string} candidate
 * @param {string} cwd
 * @returns {boolean}
 */
export function isProtectedGuardPath(candidate, cwd) {
  if (candidate.length === 0) return false;
  const resolved = path.resolve(cwd, candidate);
  return resolved === GUARD_FILE || resolved === GUARD_MANIFEST;
}

/**
 * The environment variable the driver stamps on every `claude -p` child it spawns
 * (`childEnvironment` in `scripts/driver.mjs`). Kept as a literal rather than imported so
 * the hook has no dependency on the driver: hooks run from an install cache and must work
 * even when nothing else of the plugin is loadable.
 */
const RUN_MARKER_ENV = 'MEESEEKS_RUNNING';

/**
 * The `--give-them-the-box` markers, restated here rather than imported.
 *
 * This hook has no imports from `scripts/` on purpose — it must load in a fresh process with
 * nothing resolved but `node:` builtins — so the names are duplicated. They are duplicated
 * *knowingly*: if `driver.mjs` ever renames them, `test/guard.test.mjs` fails, which is the
 * cheapest available alarm for a constant that has to agree across a process boundary.
 */
const BOX_MARKER_ENV = 'MEESEEKS_GIVE_THEM_THE_BOX';
const DEPTH_MARKER_ENV = 'MEESEEKS_RUN_DEPTH';
const MAX_BOX_DEPTH = 2;

/**
 * Is this tool call happening inside a run?
 *
 * The protected files are protected *from a run*, not from the person who owns the
 * repository. `DESIGN.md` §6 says they are "not editable by the process they constrain",
 * and the process being constrained is the run — a builder that can rewrite the ratchet,
 * its configuration or its lesson store is not constrained by any of them.
 *
 * An operator is not that process. Before this distinction existed the rule was
 * unconditional, which meant nobody could change `.meeseeks/config.json` from inside Claude
 * Code at any time, and `HANDOFF.md`'s own instruction to delete a useless
 * `.meeseeks/lessons.json` was impossible to carry out. The fix for that must not be "ask the
 * human to leave the agent and run a command", because a plugin that offloads its own work
 * onto a terminal has not done the work.
 *
 * The marker is sound in the direction that matters. The driver sets it in the environment
 * of the `claude` child; PreToolUse hooks inherit that environment, which is verified live
 * rather than assumed. A builder cannot clear it: the hook's environment comes from the
 * `claude` process the driver spawned, not from any shell the builder can run.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {boolean}
 */
export function insideRun(env) {
  const marker = env[RUN_MARKER_ENV];
  return marker !== undefined && marker !== '';
}

const PROTECTED_REASON =
  'references the .meeseeks runtime directory. It holds the ratchet, the configuration, the RED evidence, the ' +
  'archived briefs and the test reports — the state and evidence a run is judged by, which the run does not ' +
  'write (DESIGN.md §6). Read them with the Read tool, which is not hooked.';

/**
 * Refuse a shell command that touches the runtime directory at all.
 *
 * A shell is not statically analysable into reads and writes, and every attempt to try is a
 * whitelist that fails open on the case nobody thought of — `cp`, `tee`, `sed -i`, `>`,
 * `mv`, a heredoc, `python -c`. So the whole directory is off limits from Bash inside a run,
 * reads included, and the collateral is deliberate: the Read tool is not matched by
 * `hooks.json`, so reading `.meeseeks` remains possible by the route that cannot also write it.
 *
 * The builder does not need the shell route regardless. Its brief arrives in the prompt,
 * not from disk.
 *
 * @param {string} command
 * @param {Token[][]} segments
 * @returns {Decision}
 */
function checkProtectedState(command, segments) {
  if (MEESEEKS_DIR_RE.test(command)) {
    return deny('protected-state', `Command ${PROTECTED_REASON}`);
  }
  for (const segment of segments) {
    for (const token of segment) {
      if (MEESEEKS_DIR_RE.test(token.value)) {
        return deny('protected-state', `Command ${PROTECTED_REASON}`);
      }
    }
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
  'meeseeks does not spawn meeseeks. Nested runs are blocked at the driver and at the hook (CLAUDE.md invariant, DESIGN.md §13.6). ' +
  'This is a TEXT match, not a detected invocation: the rule scans command position including heredoc bodies, so a commit ' +
  'message or a here-doc that merely mentions the command is refused too. That is deliberate - a heredoc can carry a script - ' +
  'and it has now caught an operator writing prose about this project three times. If that is what happened, reword rather ' +
  'than reach for the rule: it is not weakened to make commit messages easier.';

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
/**
 * Has the operator armed `--give-them-the-box`, and is there room left under the cap?
 *
 * **This is the only rule on this page that a human can switch off, and it is switched off by a
 * flag they typed rather than by anything a builder can reach.** The driver arms `BOX_MARKER_ENV`
 * into the environment it hands every child, so this hook sees the same fact from the same place
 * the driver's own `assertNotNested` sees it. A permission that lived in only one of the two
 * enforcement points would be the worst of both: a rule that looks absolute and is not.
 *
 * Everything else on this page is untouched by it. `.meeseeks/` stays protected, git history
 * stays protected, recursive removal stays refused. **The mode permits one thing.**
 *
 * Fail-closed on a malformed depth: an unreadable marker counts as the top of the stack rather
 * than as room to spare.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {boolean}
 */
function boxPermitted(env) {
  const armed = env[BOX_MARKER_ENV];
  if (armed === undefined || armed === '') return false;
  const parsed = Number.parseInt(env[DEPTH_MARKER_ENV] ?? '0', 10);
  const depth = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  return depth < MAX_BOX_DEPTH;
}

/**
 * @param {Token[][]} segments
 * @param {Record<string, string | undefined>} [env]
 * @returns {Decision}
 */
function checkNestedRun(segments, env = process.env) {
  if (boxPermitted(env)) return ALLOW;
  return checkNestedRunStrict(segments);
}

/**
 * @param {Token[][]} segments
 * @returns {Decision}
 */
function checkNestedRunStrict(segments) {
  for (const raw of segments) {
    const segment = stripPrefixes(raw);
    if (segment.length === 0) continue;

    const name = commandName(segment);
    const first = segment[0].value;
    if (name === 'meeseeks' || first === '/meeseeks' || SLASH_MEESEEKS_RE.test(first)) {
      return deny('nested-meeseeks', NESTED_REASON);
    }

    if (name !== 'claude') continue;
    for (const token of segment.slice(1)) {
      if (token.value === '/meeseeks' || SLASH_MEESEEKS_RE.test(token.value)) {
        return deny('nested-meeseeks', NESTED_REASON);
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
 * A Bash command naming the guard itself.
 *
 * Every token is resolved as a path and compared, rather than pattern-matched: the rule is
 * positional like `protected-state`, and for anything other than this repository no token can
 * resolve to it. Reads are refused along with writes for the same reason `protected-state`
 * refuses `cat .meeseeks/config.json` — a shell string cannot be told apart from a write reliably,
 * and a rule that fails open on the first heredoc is worse than a blunt one. The Read tool is
 * not hooked, so reading the guard is still available by the ordinary route.
 *
 * @param {string} command
 * @param {Token[][]} segments
 * @param {string} cwd
 * @returns {Decision}
 */
function checkProtectedGuard(command, segments, cwd) {
  // The raw string as well as the tokens, because `tokenizeCommand` **drops redirection
  // targets** so they are not mistaken for operands — and `echo '' > guard.mjs` puts the whole
  // attack in the target. `protected-state` tests the raw command for the same reason.
  for (const candidate of command.match(/[\w./\\~-]+/g) ?? []) {
    if (isProtectedGuardPath(candidate, cwd)) {
      return deny(
        'protected-guard',
        `${candidate} is the guard hook deciding this call. A run does not edit the rule that ` +
          'constrains it (CLAUDE.md invariant, DESIGN.md §6). Outside a run it is an ordinary file.',
      );
    }
  }
  for (const segment of segments) {
    for (const token of segment) {
      if (isProtectedGuardPath(token.value, cwd)) {
        return deny(
          'protected-guard',
          `${token.value} is the guard hook deciding this call. A run does not edit the rule that ` +
            'constrains it (CLAUDE.md invariant, DESIGN.md §6). Outside a run it is an ordinary file.',
        );
      }
    }
  }
  return ALLOW;
}

/**
 * Run every Bash rule over one command string, recursing into command substitutions.
 *
 * `protected-state` is conditional on being inside a run. History destruction and recursive
 * removal are refused to everyone, because neither becomes reasonable merely because a human
 * asked for it in this session.
 *
 * **`nested-meeseeks` used to be in that second group and no longer is.** It is refused to
 * everyone *by default*, and permitted — to a depth of two — when the operator has passed
 * `--give-them-the-box`, which the driver arms into the environment every child inherits. That
 * mode is unsupported, loud, and exists because the canon's whole moral is a Meeseeks who cannot
 * finish summoning another; a joke that only ever prints a refusal is one nobody sees happen.
 * It relaxes **that rule and nothing else**.
 *
 * @param {string} command
 * @param {string} cwd
 * @param {{ insideRun?: boolean, env?: Record<string, string | undefined> }} [options] defaults
 *   to inside a run and to the real environment, both of which are the deny side
 * @returns {Decision}
 */
export function checkBashCommand(command, cwd, options = {}) {
  // Defaults to "inside a run", which is the deny-side default. A caller that forgets to
  // say where it is gets the stricter answer, not the looser one.
  const running = options.insideRun ?? true;
  // Defaults to the real environment, so production behaviour is unchanged and only a test has
  // to say which environment it means.
  const env = options.env ?? process.env;
  const { segments, substitutions } = tokenizeCommand(command);
  const checks = [
    running ? checkProtectedState(command, segments) : ALLOW,
    running ? checkProtectedGuard(command, segments, cwd) : ALLOW,
    checkNestedRun(segments, env),
    checkGitHistory(segments),
    checkRecursiveRemove(segments, cwd),
  ];
  for (const result of checks) {
    if (result.decision === 'deny') return result;
  }
  for (const inner of [...substitutions, ...wrappedCommands(segments)]) {
    // The environment travels into nested commands too. A permission that evaporated one level
    // down would deny a command the top level had just allowed, for no reason a reader could see.
    const result = checkBashCommand(inner, cwd, { insideRun: running, env });
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
    if (isProtectedGuardPath(value, cwd)) {
      return deny(
        'protected-guard',
        `${value} is the guard hook deciding this call. A run does not edit the rule that constrains it ` +
          '(CLAUDE.md invariant, DESIGN.md §6). Outside a run it is an ordinary file.',
      );
    }
    if (isProtectedStatePath(value, cwd)) {
      return deny(
        'protected-state',
        `${value} is inside the .meeseeks runtime directory. A run does not write the state or evidence it is ` +
          'judged by (DESIGN.md §6). Reading it is fine; the Read tool is not hooked.',
      );
    }
  }
  return ALLOW;
}

/**
 * Decide a single PreToolUse payload.
 *
 * `options.env` is how the guard tells a run from an operator; it defaults to this
 * process's environment, which is the one the hook actually inherits from the `claude`
 * child the driver spawned.
 *
 * @param {unknown} payload
 * @param {{ cwd?: string, env?: Record<string, string | undefined> }} [options]
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
  const running = insideRun(options.env ?? process.env);
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
    return checkBashCommand(command, cwd, { insideRun: running });
  }

  return running ? checkToolPaths(toolInput ?? {}, cwd) : ALLOW;
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
      permissionDecisionReason: `[meeseeks:${decision.rule}] ${decision.reason}`,
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
  // **stdout carries the protocol; stderr carries the news.** A denial inside a `claude -p` child
  // is currently invisible to the run that spawned it — case J could not tell whether its builder
  // declined to nest or was refused, because the only record of a refusal lives in a conversation
  // the driver never sees. One line on stderr costs nothing, cannot affect the decision, and gives
  // the driver something to surface.
  //
  // **Whether it reaches the driver is unverified**, because that depends on how Claude Code
  // forwards a hook's stderr, and this repository has no way to test it without a live run. If it
  // never arrives, nothing changes; if it does, a previously invisible event becomes visible.
  if (decision.decision === 'deny') {
    process.stderr.write(`meeseeks-guard: denied [${decision.rule}] ${decision.reason}\n`);
  }
  process.exitCode = 0;
}

const invokedDirectly =
  typeof process.argv[1] === 'string' && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) await main();
