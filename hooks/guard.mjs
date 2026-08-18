#!/usr/bin/env node
/**
 * PreToolUse guard hook — the limit that survives `--dangerously-skip-permissions`.
 *
 * DESIGN.md §6. The builder runs with permissions off; PreToolUse hooks fire regardless
 * of permission mode, which makes this the only reliable place to put a limit.
 *
 * Blocked categories, and nothing else:
 *   1. protected-state    — any write to any path under `.meeseeks/`, **while inside a run**.
 *      A run does not write the state or evidence it is judged by. Outside a run there is
 *      no constrained process, and the operator may edit their own configuration from
 *      wherever they like — including from inside Claude Code, which is the only place some
 *      of them work. See {@link insideRun}.
 *   2. protected-guard    — a write to this file, or to the manifest that registers it,
 *      while inside a run. A run does not edit the rule that constrains it.
 *   3. protected-settings — a write to `.claude/settings.json` or `.claude/settings.local.json`
 *      while inside a run. Those files participate in hook precedence, and
 *      `{"disableAllHooks": true}` written there is the guard's own kill switch: every
 *      later child would spawn unguarded (PLAN item 28).
 *   4. unresolvable-write — a shell write whose destination cannot be resolved before the
 *      command runs (an unexpanded variable, an unresolvable `cd`, a symlink that resolves
 *      to nothing, nesting too deep to analyse), while inside a run. Uncertainty resolves
 *      toward deny; nothing defaults to pass.
 *   5. git-history        — `git push --force`, `rebase`, `filter-branch`, `reflog expire`.
 *      Recovery stays possible.
 *   6. rm-recursive       — recursive `rm` outside the temp directory.
 *   7. nested-meeseeks    — a builder invoking `/meeseeks`. CLAUDE.md invariant "No nesting";
 *      DESIGN.md §13.6 requires this at the hook as well as at the driver.
 *   8. git-clean          — `git clean` that is not a dry run, while inside a run. `.meeseeks/`
 *      is gitignored, so `git clean -x/-fdx` destroys the ratchet and evidence while naming no
 *      protected path for the write detector to catch.
 *
 * Categories 1–4 and 8 are scoped to a run. Categories 5–7 are refused to everyone: none of
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
 *   - Shell commands are judged in two layers, fail-closed. First a *write-position* detector:
 *     the tokenizer captures redirection targets, `tee`/`cp`/`mv`/`install` destinations,
 *     in-place-edit operands and the rest of the writer table below, resolves each against the
 *     directory the command would actually run in, and denies the ones that land on a protected
 *     path — the precise, per-technique verdict. Beneath it sits a *textual floor*: a command
 *     whose text names a protected family defaults to DENY, and a carve-out re-allows only what
 *     it can positively prove is a read (`cat .meeseeks/state.json`) or a data mention
 *     (`echo ".meeseeks/x is protected"`). A write technique the position detector does not
 *     model — a pipe into a shell, a glued interpreter flag, `tar -C .meeseeks` — still names
 *     the path, so the floor denies it. R24 had only the first layer and enumerated writes,
 *     which allowed every technique it had not thought of; the floor restores the any-mention
 *     rule R24 removed, demoted from the whole judgement to a net beneath the detector.
 *   - Both sides of every path comparison go through realpath (deepest existing ancestor
 *     for paths that do not exist yet), so a symlink into a protected tree is caught, and
 *     on case-insensitive platforms the comparison casefolds — comparison only, never
 *     construction. A realpath that fails inside a run is a deny, not an allow.
 *   - Heredoc bodies are data and are blanked before scanning — unless the heredoc feeds a
 *     shell or an interpreter, in which case the body is code and is scanned as code. The
 *     command substitutions inside an unquoted heredoc body execute regardless of the
 *     receiver, so those are extracted and scanned in every case.
 *   - `--force-with-lease` / `--force-if-includes` are treated as `--force`: same category.
 *   - Recursive `rm` is blocked with or without `-f`; `-r` alone is equally destructive.
 *   - A malformed payload is a deny, not an allow. A guard that fails open on a broken
 *     harness is not a guard (CLAUDE.md: nothing defaults to pass).
 */

import { lstatSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** @typedef {{ value: string, hasExpansion: boolean, quoted?: boolean }} Token */
/** @typedef {{ target: Token, segment: number }} Redirect */
/** @typedef {{ body: string, receiver: string[], quoted: boolean }} Heredoc */
/**
 * @typedef {{
 *   segments: Token[][],
 *   substitutions: string[],
 *   redirects: Redirect[],
 *   heredocs: Heredoc[],
 * }} ParsedCommand
 */
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

/**
 * The two settings files that participate in hook precedence, textually: a `.claude`
 * segment followed immediately by one of the two basenames. Used only on strings that
 * cannot be resolved as paths (an unexpanded `$VAR`, interpreter code); resolvable paths
 * go through {@link isProtectedSettingsPath}.
 */
const SETTINGS_TEXT_RE = /(^|[^\w.-])\.claude[\\/]+settings(\.local)?\.json(?![\w.-])/;

/** The `/meeseeks` slash command as a standalone word. */
const SLASH_MEESEEKS_RE = /(^|\s)\/meeseeks(\s|$)/;

/** Path-shaped substrings inside a string that is not itself a single path. */
const PATHISH_RE = /[\w./\\~-]+/g;

/**
 * Casefold for COMPARISON only — never for path construction. win32 (NTFS) per R23, and
 * darwin as well: APFS defaults to case-insensitive and is named in R23's own rationale, so
 * confining the fold to the letter of "win32" would leave the bypass open on the platform
 * the finding cites. The residual (a case-insensitive NTFS mount seen from Linux, e.g. WSL's
 * /mnt/c) is recorded rather than guessed at: platform detection cannot see per-mount
 * case-sensitivity.
 */
const CASEFOLD = process.platform === 'win32' || process.platform === 'darwin';

/**
 * @param {string} value
 * @returns {string} the comparison form of a path or path-shaped string
 */
function fold(value) {
  return CASEFOLD ? value.toLowerCase() : value;
}

// ---------------------------------------------------------------------------
// Shell tokenizer
// ---------------------------------------------------------------------------

/**
 * Pull `$(...)` and backtick bodies out of a flat string.
 *
 * Used on the body of an unquoted heredoc: the body is data to its receiver, but the shell
 * expands command substitutions in it *before* the receiver ever sees it, so those inner
 * commands run no matter what the receiver is.
 *
 * @param {string} text
 * @returns {string[]}
 */
function extractSubstitutions(text) {
  /** @type {string[]} */
  const found = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === '$' && text[i + 1] === '(') {
      let depth = 0;
      let end = text.length;
      for (let j = i + 1; j < text.length; j += 1) {
        if (text[j] === '(') depth += 1;
        else if (text[j] === ')') {
          depth -= 1;
          if (depth === 0) {
            end = j;
            break;
          }
        }
      }
      found.push(text.slice(i + 2, end));
      i = end + 1;
      continue;
    }
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      found.push(end === -1 ? text.slice(i + 1) : text.slice(i + 1, end));
      i = end === -1 ? text.length : end + 1;
      continue;
    }
    i += 1;
  }
  return found;
}

/**
 * Split a shell command into segments of tokens, quote-aware.
 *
 * Segments break on `;`, newline, `&&`, `||`, `|` and `&`, so every pipeline stage and
 * chained command is inspected as its own invocation. Output-redirection targets (`>`,
 * `>>`, `>|`, `&>`) are captured in `redirects` with the ordinal of the segment they
 * belong to — they are write destinations, and dropping them was how `echo x > file` once
 * hid the whole attack in the discarded half. Input redirections are consumed and
 * discarded: a read is not a write. Heredoc bodies are captured in `heredocs` with their
 * receiving command, and are *not* fed back into the token stream — a document written
 * through a heredoc is data, not command position. Command substitutions and subshell
 * bodies are collected in `substitutions` so callers can re-run the rules over them.
 *
 * This is not a shell. It is deliberately conservative: anything it cannot resolve is
 * marked `hasExpansion`, and callers treat unresolvable write destinations as denied.
 *
 * @param {string} command
 * @returns {ParsedCommand}
 */
export function tokenizeCommand(command) {
  /** @type {Token[][]} */
  const segments = [];
  /** @type {string[]} */
  const substitutions = [];
  /** @type {Redirect[]} */
  const redirects = [];
  /** @type {Heredoc[]} */
  const heredocs = [];
  /** @type {Token[]} */
  let tokens = [];
  /** @type {Token | null} */
  let cur = null;
  /**
   * What the next completed token is: an ordinary operand (null), a write-redirect target,
   * a discarded input-redirect target, or a heredoc delimiter.
   * @type {null | { kind: 'write' | 'discard' | 'heredoc', stripTabs?: boolean }}
   */
  let pendingTarget = null;
  /** @type {{ delim: string, quoted: boolean, stripTabs: boolean, receiver: string[] }[]} */
  let pendingHeredocs = [];

  function open() {
    if (!cur) cur = { value: '', hasExpansion: false };
    return cur;
  }
  function endToken() {
    if (cur) {
      if (pendingTarget !== null) {
        if (pendingTarget.kind === 'write') {
          redirects.push({ target: cur, segment: segments.length });
        } else if (pendingTarget.kind === 'heredoc') {
          pendingHeredocs.push({
            delim: cur.value,
            quoted: cur.quoted === true,
            stripTabs: pendingTarget.stripTabs === true,
            receiver: tokens.map((token) => token.value),
          });
        }
        // 'discard' — an input redirection target; a read, not a write.
        pendingTarget = null;
        cur = null;
        return;
      }
      tokens.push(cur);
    }
    cur = null;
  }
  function endSegment() {
    endToken();
    // A redirect operator whose target never arrived (`echo >` at end of segment) names
    // no file; there is nothing to judge.
    pendingTarget = null;
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
      const token = open();
      token.value += command[i + 1] ?? '';
      // A backslash-escaped heredoc delimiter (`<<\EOF`) suppresses expansion like quotes do.
      token.quoted = true;
      i += 2;
      continue;
    }

    if (ch === "'") {
      const end = command.indexOf("'", i + 1);
      const token = open();
      token.value += end === -1 ? command.slice(i + 1) : command.slice(i + 1, end);
      token.quoted = true;
      i = end === -1 ? command.length : end + 1;
      continue;
    }

    if (ch === '"') {
      const token = open();
      token.quoted = true;
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

    if (ch === '(' && ((tokens.length === 0 && cur === null) || pendingTarget !== null)) {
      // A subshell in command position, or a process substitution as a redirect target
      // (`> (…)` after `>(`-ish forms) — either way the body is executable and is scanned
      // as a command of its own.
      const { inner, end } = readParens(i);
      substitutions.push(inner);
      pendingTarget = null;
      i = end + 1;
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

    if (ch === '\n') {
      // The segment ends first — endToken inside endSegment is what queues a heredoc whose
      // delimiter ran straight into this newline — and then the queued bodies are consumed,
      // each up to its delimiter line, and kept out of the token stream: body text must
      // never be mistaken for command position.
      endSegment();
      i += 1;
      for (const pending of pendingHeredocs) {
        /** @type {string[]} */
        const lines = [];
        let terminated = false;
        while (i < command.length) {
          const nl = command.indexOf('\n', i);
          const line = nl === -1 ? command.slice(i) : command.slice(i, nl);
          i = nl === -1 ? command.length : nl + 1;
          const candidate = pending.stripTabs ? line.replace(/^\t+/, '') : line;
          if (candidate === pending.delim) {
            terminated = true;
            break;
          }
          lines.push(line);
        }
        // An unterminated heredoc swallows the rest of the input as data — which is what a
        // real shell feeds the receiver too.
        void terminated;
        const body = lines.join('\n');
        if (!pending.quoted) {
          // The shell expands an unquoted body before the receiver sees it, so command
          // substitutions inside it execute regardless of who is reading.
          for (const inner of extractSubstitutions(body)) substitutions.push(inner);
        }
        heredocs.push({ body, receiver: pending.receiver, quoted: pending.quoted });
      }
      pendingHeredocs = [];
      continue;
    }

    if (ch === ';' || ch === '|' || ch === '&') {
      endSegment();
      i += 1;
      continue;
    }

    if (ch === '>' || ch === '<') {
      // `2>file` — the fd number belongs to the redirection, not to the operands.
      // `cur` is mutated by open()/endToken(), so control-flow narrowing does not
      // describe it here; the cast restores the declared type.
      const pendingToken = /** @type {Token | null} */ (cur);
      if (pendingToken !== null && /^\d+$/.test(pendingToken.value)) cur = null;
      endToken();

      if (ch === '<') {
        if (command[i + 1] === '<' && command[i + 2] === '<') {
          // Herestring: the word is data fed to stdin. Its substitutions were already
          // collected by the quote/`$(` branches when the word is parsed.
          i += 3;
          pendingTarget = { kind: 'discard' };
          continue;
        }
        if (command[i + 1] === '<') {
          // Heredoc. `<<-` strips leading tabs when matching the delimiter.
          i += 2;
          let stripTabs = false;
          if (command[i] === '-') {
            stripTabs = true;
            i += 1;
          }
          pendingTarget = { kind: 'heredoc', stripTabs };
          continue;
        }
        // Plain input redirection, or `<&` fd duplication: a read either way.
        i += 1;
        if (command[i] === '&') i += 1;
        pendingTarget = { kind: 'discard' };
        continue;
      }

      // The `>` family: `>`, `>>`, `>|`, `>&file`, and `2>&1`-style fd duplication.
      i += 1;
      /** @type {'write' | 'discard'} */
      let kind = 'write';
      if (command[i] === '>') i += 1;
      else if (command[i] === '|') i += 1;
      else if (command[i] === '&') {
        i += 1;
        let j = i;
        while (j < command.length && /\d/.test(command[j])) j += 1;
        if (j > i && (j >= command.length || ' \t\n;|&<>'.includes(command[j]))) {
          // `>&2` — duplicating onto an fd, not opening a file.
          kind = 'discard';
        }
      }
      pendingTarget = { kind };
      continue;
    }

    open().value += ch;
    i += 1;
  }

  endSegment();
  return { segments, substitutions, redirects, heredocs };
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** Wrapper words that precede the real command without changing what it does. */
const COMMAND_WRAPPERS = new Set(['sudo', 'command', 'nohup', 'env', 'time']);

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
    if (COMMAND_WRAPPERS.has(value)) {
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
 * The same prefix-stripping over plain strings, for a heredoc's recorded receiver.
 * @param {string[]} words
 * @returns {string} the receiving program's basename, or `''`.
 */
function effectiveCommandWord(words) {
  let i = 0;
  while (
    i < words.length &&
    (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]) || COMMAND_WRAPPERS.has(words[i]))
  ) {
    i += 1;
  }
  return i < words.length ? path.posix.basename(words[i].replaceAll('\\', '/')) : '';
}

/**
 * Does a filesystem entry exist at this path — the entry itself, not what it points at?
 *
 * `existsSync` follows symlinks, which is the wrong question here: a *dangling* symlink is
 * an entry a write can travel through (the write creates the target), and `existsSync`
 * reports it absent.
 *
 * @param {string} candidate
 * @returns {boolean}
 */
function entryExists(candidate) {
  try {
    lstatSync(candidate);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a path for comparison: realpath of its deepest existing ancestor, with the
 * not-yet-existing remainder rejoined. This is the components phase's containment pattern
 * (`scripts/driver.mjs`), brought to the guard by R23: a candidate that does not exist yet
 * still has to be judged by where a write to it would actually land.
 *
 * Returns `null` when realpath fails — a dangling symlink, a symlink loop, an unreadable
 * ancestor. Callers inside a run treat `null` as deny: a path that cannot be resolved
 * cannot be proven safe, and the guard does not default to allow.
 *
 * @param {string} resolved an absolute path
 * @returns {string | null}
 */
function realpathForCompare(resolved) {
  let ancestor = resolved;
  /** @type {string[]} */
  const remainder = [];
  while (!entryExists(ancestor)) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor) return resolved; // no existing ancestor at all — textual is all there is
    remainder.unshift(path.basename(ancestor));
    ancestor = parent;
  }
  try {
    return path.join(realpathSync(ancestor), ...remainder);
  } catch {
    return null;
  }
}

/**
 * @param {string} candidate an absolute path
 * @returns {boolean} does any whole segment of it name the runtime directory?
 */
function hasMeeseeksSegment(candidate) {
  return candidate.split(/[\\/]/).some((segment) => fold(segment) === '.meeseeks');
}

/**
 * Does this path land anywhere inside a `.meeseeks` directory?
 *
 * Resolved first, so `..` cannot walk into one and a relative path is judged against the
 * working directory the tool call actually ran in — and then resolved again through
 * realpath, so a symlink into the directory is caught too (R23). Depth is not bounded:
 * `.meeseeks/briefs/iter-004.md` is as protected as `.meeseeks/state.json`, and a directory the
 * driver has not invented yet is protected on the day it appears.
 *
 * Matching is on whole path segments, so a sibling named `.meeseeks-notes` is untouched.
 * On case-insensitive platforms the segment comparison casefolds — see {@link fold}.
 *
 * Three realpath layers, each closing a different bypass:
 *   - the candidate's textual resolution (`src/../.meeseeks/x`),
 *   - the candidate's realpath (`innocent-link/x` where the link points into `.meeseeks`),
 *   - the protected root's realpath (`.meeseeks` itself a symlink, written through its target).
 * A realpath that fails yields `true`: this predicate is only consulted for writes inside a
 * run, and inside a run an unresolvable path is a deny.
 *
 * @param {string} candidate
 * @param {string} cwd
 * @returns {boolean}
 */
export function isProtectedStatePath(candidate, cwd) {
  if (candidate.length === 0) return false;
  const resolved = path.resolve(cwd, candidate);
  if (hasMeeseeksSegment(resolved)) return true;
  const real = realpathForCompare(resolved);
  if (real === null) return true;
  if (hasMeeseeksSegment(real)) return true;
  const root = path.join(cwd, '.meeseeks');
  if (entryExists(root)) {
    /** @type {string} */
    let realRoot;
    try {
      realRoot = realpathSync(root);
    } catch {
      return true;
    }
    if (fold(real) === fold(realRoot) || fold(real).startsWith(fold(realRoot + path.sep))) return true;
  }
  return false;
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
 * The crash-net fallback (PLAN item 37): `hooks.json` chains `guard.mjs || guard-fallback.cjs`,
 * so the fallback is a **deciding** link of the guard — inside a run it emits the deny itself.
 * A deciding file left writable is the exact hole `protected-guard` exists to close, so it joins
 * the guarded set. Missing it was a real defect the item-37 hostile panel caught.
 */
const GUARD_FALLBACK = path.join(path.dirname(GUARD_FILE), 'guard-fallback.cjs');
/** The realpath side of the same names, so a symlinked install cannot dodge the compare. */
const GUARD_FILE_REAL = realpathForCompare(GUARD_FILE) ?? GUARD_FILE;
const GUARD_MANIFEST_REAL = realpathForCompare(GUARD_MANIFEST) ?? GUARD_MANIFEST;
const GUARD_FALLBACK_REAL = realpathForCompare(GUARD_FALLBACK) ?? GUARD_FALLBACK;

/**
 * Every path that is the guard, in both its as-named and realpath forms. Defined once and used by
 * both {@link isProtectedGuardPath} and {@link matchProtectedText}: two copies of this list drifted
 * apart is how the fallback would have been added to one check and not the other.
 */
const GUARD_TARGETS = [
  GUARD_FILE,
  GUARD_MANIFEST,
  GUARD_FALLBACK,
  GUARD_FILE_REAL,
  GUARD_MANIFEST_REAL,
  GUARD_FALLBACK_REAL,
].map(fold);

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
 * Compared on both the literal and realpath forms of both sides (R23), casefolded on
 * case-insensitive platforms, and a candidate whose realpath fails counts as the guard:
 * the predicate is only consulted for writes inside a run, where unresolvable is deny.
 *
 * @param {string} candidate
 * @param {string} cwd
 * @returns {boolean}
 */
export function isProtectedGuardPath(candidate, cwd) {
  if (candidate.length === 0) return false;
  const resolved = path.resolve(cwd, candidate);
  if (GUARD_TARGETS.includes(fold(resolved))) return true;
  const real = realpathForCompare(resolved);
  if (real === null) return true;
  return GUARD_TARGETS.includes(fold(real));
}

/**
 * Is this path one of the two settings files that can switch every hook off?
 *
 * PLAN item 28: the hooks system honors `disableAllHooks`, and the target repository's own
 * `.claude/settings.json` and `.claude/settings.local.json` participate in its precedence. A
 * builder writing `{"disableAllHooks": true}` into either is a one-line unguarding of every
 * later child. The rule is positional like `protected-state` — a `.claude` segment directly
 * holding one of the two basenames, at any depth, so the repository's own file, a
 * subdirectory's, and the operator's `~/.claude/settings.json` are all covered — and it is
 * scoped to a run for the same reason: outside a run these are ordinary files the operator
 * edits freely.
 *
 * Realpath on both sides, like the other two predicates, and unresolvable is deny.
 *
 * @param {string} candidate
 * @param {string} cwd
 * @returns {boolean}
 */
export function isProtectedSettingsPath(candidate, cwd) {
  if (candidate.length === 0) return false;
  const resolved = path.resolve(cwd, candidate);
  if (isSettingsShaped(resolved)) return true;
  const real = realpathForCompare(resolved);
  if (real === null) return true;
  if (isSettingsShaped(real)) return true;
  for (const name of SETTINGS_BASENAMES) {
    const root = path.join(cwd, '.claude', name);
    if (!entryExists(root)) continue;
    /** @type {string} */
    let realRoot;
    try {
      realRoot = realpathSync(root);
    } catch {
      return true;
    }
    if (fold(real) === fold(realRoot)) return true;
  }
  return false;
}

const SETTINGS_BASENAMES = ['settings.json', 'settings.local.json'];

/**
 * @param {string} candidate an absolute path
 * @returns {boolean} is the final segment one of the settings basenames, directly under `.claude`?
 */
function isSettingsShaped(candidate) {
  const parts = candidate.split(/[\\/]/);
  if (parts.length < 2) return false;
  const base = fold(parts[parts.length - 1]);
  const parent = fold(parts[parts.length - 2]);
  return parent === '.claude' && SETTINGS_BASENAMES.includes(base);
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
 * How many levels of nested executable bodies (`$(...)`, `sh -c`, subshells, heredocs fed
 * to shells) the scan follows before declaring the command unanalysable. Inside a run,
 * unanalysable is denied; outside a run the scan simply stops.
 */
const MAX_SCAN_DEPTH = 5;

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

/**
 * @param {string} shown the path as the command spelled it
 * @returns {string}
 */
function protectedStateReason(shown) {
  return (
    `${shown} is inside the .meeseeks runtime directory. It holds the ratchet, the configuration, the RED ` +
    'evidence, the archived briefs and the test reports — the state and evidence a run is judged by, which the ' +
    'run does not write (DESIGN.md §6). Reading it is fine; writing it from a run is not.'
  );
}

/**
 * @param {string} shown
 * @returns {string}
 */
function protectedGuardReason(shown) {
  return (
    `${shown} is the guard hook deciding this call. A run does not edit the rule that ` +
    'constrains it (CLAUDE.md invariant, DESIGN.md §6). Outside a run it is an ordinary file.'
  );
}

/**
 * @param {string} shown
 * @returns {string}
 */
function protectedSettingsReason(shown) {
  return (
    `${shown} is a Claude Code settings file. It participates in hook precedence, and ` +
    '{"disableAllHooks": true} written there would switch the guard off for every later child — ' +
    'the guard\'s own kill switch (DESIGN.md §6, PLAN item 28). Outside a run it is an ordinary file.'
  );
}

// ---------------------------------------------------------------------------
// Protected writes — the shell write detector (R24)
// ---------------------------------------------------------------------------

/**
 * Commands whose path operands they modify, and how their operands are found.
 *
 * `strict: true` means an operand that cannot be resolved (an unexpanded variable, an
 * unknown working directory) is denied inside a run: these commands *create or overwrite
 * content*, which is exactly what forging evidence or writing a kill switch requires.
 * `strict: false` covers deletion and metadata: destructive, but unable to plant content —
 * and their unresolvable forms (`rm -f "$TMPFILE"`) are everyday build hygiene. Resolvable
 * operands of either class landing on a protected path are denied identically.
 *
 * `dest: 'last'` judges only the final operand (plus a `-t`/`--target-directory` value);
 * `dest: 'all'` judges every operand; `skipFirst` drops a leading non-path operand (a
 * chmod mode, a chown owner).
 *
 * @type {Record<string, {
 *   dest: 'last' | 'all',
 *   strict: boolean,
 *   valued?: string[],
 *   skipFirst?: boolean,
 *   sources?: 'lenient',
 *   requiresInPlace?: boolean,
 * }>}
 */
const WRITER_COMMANDS = {
  tee: { dest: 'all', strict: true },
  cp: { dest: 'last', strict: true, valued: ['-t', '--target-directory'] },
  install: { dest: 'last', strict: true, valued: ['-t', '--target-directory', '-m', '-o', '-g'] },
  mv: { dest: 'last', strict: true, valued: ['-t', '--target-directory'], sources: 'lenient' },
  rsync: { dest: 'last', strict: true, valued: ['-e'] },
  ln: { dest: 'last', strict: true, valued: ['-t', '--target-directory'] },
  sed: { dest: 'all', strict: true, valued: ['-e', '--expression', '-f', '--file'], requiresInPlace: true },
  perl: { dest: 'all', strict: true, valued: ['-e', '-E'], requiresInPlace: true },
  ruby: { dest: 'all', strict: true, valued: ['-e'], requiresInPlace: true },
  rm: { dest: 'all', strict: false },
  rmdir: { dest: 'all', strict: false },
  unlink: { dest: 'all', strict: false },
  shred: { dest: 'all', strict: false, valued: ['-n', '--iterations'] },
  touch: { dest: 'all', strict: false },
  truncate: { dest: 'all', strict: false, valued: ['-s', '--size'] },
  mkdir: { dest: 'all', strict: false, valued: ['-m', '--mode'] },
  mkfifo: { dest: 'all', strict: false, valued: ['-m'] },
  mknod: { dest: 'all', strict: false, valued: ['-m'] },
  chmod: { dest: 'all', strict: false, skipFirst: true },
  chown: { dest: 'all', strict: false, skipFirst: true },
  chgrp: { dest: 'all', strict: false, skipFirst: true },
};

/**
 * git subcommands that mutate the worktree or the index. `git add .meeseeks/x` stages
 * driver state toward a commit that a later checkout would replay as this run's verdict —
 * the components phase refuses tracked `.meeseeks/` for exactly that reason — and
 * `git checkout -- path` / `git restore path` overwrite the worktree copy.
 */
const GIT_WRITE_SUBCOMMANDS = new Set(['add', 'rm', 'mv', 'restore', 'checkout', 'clean']);

/** Interpreters whose `-c`/`-e` string arguments are code, not data. */
const CODE_STRING_FLAGS = /** @type {Record<string, string[]>} */ ({
  python: ['-c'],
  python2: ['-c'],
  python3: ['-c'],
  node: ['-e', '--eval', '-p', '--print'],
  perl: ['-e', '-E'],
  ruby: ['-e'],
});

/** The awk family: the first non-flag operand is the program text. */
const AWK_NAMES = new Set(['awk', 'gawk', 'mawk', 'nawk']);

/** Programs that take a whole command as a `-c` argument. */
const SHELL_INVOKERS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);

/** Interpreters a heredoc can feed a program to. */
const HEREDOC_INTERPRETERS = new Set(['python', 'python2', 'python3', 'node', 'perl', 'ruby']);

/**
 * Match a string that cannot be resolved as a path — an unexpanded `$VAR` operand, a chunk
 * of interpreter code — against the three protected families, textually.
 *
 * @param {string} text
 * @param {string} cwd
 * @returns {Deny | null}
 */
function matchProtectedText(text, cwd) {
  if (MEESEEKS_DIR_RE.test(fold(text))) return deny('protected-state', protectedStateReason(text));
  if (SETTINGS_TEXT_RE.test(fold(text))) return deny('protected-settings', protectedSettingsReason(text));
  for (const candidate of text.match(PATHISH_RE) ?? []) {
    // Path-shaped substrings only, resolved and compared — never a realpath-failure deny
    // here, because a fragment of prose is not a path a write travels through.
    const resolved = path.resolve(cwd, candidate);
    if (GUARD_TARGETS.includes(fold(resolved))) return deny('protected-guard', protectedGuardReason(candidate));
  }
  return null;
}

/**
 * Judge one write destination.
 *
 * @param {Token} token
 * @param {string | null} eff the effective working directory, `null` when a `cd` made it unknowable
 * @param {string} cwd the payload's working directory, for textual comparisons
 * @param {boolean} strict deny unresolvable targets (content writers) or let them pass (deleters)
 * @returns {Deny | null}
 */
function judgeWriteTarget(token, eff, cwd, strict) {
  const value = token.value;
  if (value.length === 0 && !token.hasExpansion) return null;
  if (token.hasExpansion) {
    const textual = matchProtectedText(value, cwd);
    if (textual) return textual;
    if (strict) {
      return deny(
        'unresolvable-write',
        `Write target "${value}" cannot be resolved before the command runs; unresolvable write targets are denied inside a run (DESIGN.md §6).`,
      );
    }
    return null;
  }
  const expanded = value.startsWith('~') ? path.join(os.homedir(), value.slice(1)) : value;
  if (eff === null && !path.isAbsolute(expanded)) {
    const textual = matchProtectedText(value, cwd);
    if (textual) return textual;
    if (strict) {
      return deny(
        'unresolvable-write',
        `Write target "${value}" is relative to a working directory this command changed to a value that cannot ` +
          'be resolved; unresolvable write targets are denied inside a run (DESIGN.md §6).',
      );
    }
    return null;
  }
  const resolved = path.resolve(eff ?? cwd, expanded);
  const real = realpathForCompare(resolved);
  if (real === null) {
    return deny(
      'unresolvable-write',
      `Write target ${value} resolves through a link that cannot be resolved; unresolvable write targets are ` +
        'denied inside a run (DESIGN.md §6).',
    );
  }
  if (isProtectedGuardPath(resolved, cwd)) return deny('protected-guard', protectedGuardReason(value));
  if (isProtectedStatePath(resolved, cwd)) return deny('protected-state', protectedStateReason(value));
  if (isProtectedSettingsPath(resolved, cwd)) return deny('protected-settings', protectedSettingsReason(value));
  return null;
}

/**
 * Split a writer command's arguments into flags and operands, consuming valued flags.
 *
 * @param {Token[]} rest tokens after the command word
 * @param {string[]} valued flags that consume the next token
 * @returns {{ operands: Token[], flags: string[] }}
 */
function splitOperands(rest, valued) {
  /** @type {Token[]} */
  const operands = [];
  /** @type {string[]} */
  const flags = [];
  let endOfFlags = false;
  for (let i = 0; i < rest.length; i += 1) {
    const value = rest[i].value;
    if (!endOfFlags && value === '--') {
      endOfFlags = true;
      continue;
    }
    if (!endOfFlags && value.startsWith('-') && value.length > 1 && !rest[i].hasExpansion) {
      flags.push(value);
      if (valued.includes(value)) i += 1; // the flag's value is not a path operand
      continue;
    }
    operands.push(rest[i]);
  }
  return { operands, flags };
}

/**
 * The write destinations of one command segment, judged in place.
 *
 * @param {Token[]} seg tokens after {@link stripPrefixes}
 * @param {string | null} eff effective working directory
 * @param {string} cwd
 * @returns {Deny | null}
 */
function judgeSegmentWrites(seg, eff, cwd) {
  if (seg.length === 0) return null;
  const name = commandName(seg);
  const rest = seg.slice(1);

  if (name === 'eval') {
    // eval's arguments are a command. Literal ones are recursed by executableBodies; one
    // that cannot be read here cannot be read anywhere, and inside a run that is a deny.
    if (rest.some((token) => token.hasExpansion)) {
      return deny(
        'unresolvable-write',
        'eval of a value that cannot be resolved before the command runs; unresolvable commands are denied inside a run (DESIGN.md §6).',
      );
    }
    return null;
  }

  if (name === 'xargs') {
    // xargs feeds its child operands from stdin, which no static rule can see. A child
    // from the writer table therefore has unresolvable write targets by construction.
    const inner = innerXargsSegment(rest);
    if (inner.length > 0) {
      const innerName = commandName(inner);
      if (innerName in WRITER_COMMANDS || innerName === 'git') {
        return deny(
          'unresolvable-write',
          `xargs ${innerName} takes its targets from stdin, which cannot be resolved before the command runs; ` +
            'unresolvable write targets are denied inside a run (DESIGN.md §6).',
        );
      }
    }
    return null;
  }

  if (name === 'dd') {
    for (const token of rest) {
      if (token.value.startsWith('of=') || (token.hasExpansion && fold(token.value).startsWith('of='))) {
        const target = { value: token.value.slice(3), hasExpansion: token.hasExpansion };
        const verdict = judgeWriteTarget(target, eff, cwd, true);
        if (verdict) return verdict;
      }
    }
    return null;
  }

  if (name === 'curl' || name === 'wget') {
    // A download is a content write to wherever its output flag points. Under the blunt
    // rule `curl -o .meeseeks/x` was denied by mention; the writer table has to keep it
    // denied by position. (curl's bare -O takes no value and writes the URL basename, which
    // cannot contain a separator; wget's -O takes the target.)
    const outFlags = name === 'curl' ? ['-o', '--output', '--output-dir'] : ['-O', '--output-document', '-P', '--directory-prefix'];
    for (let i = 0; i < rest.length; i += 1) {
      const value = rest[i].value;
      if (outFlags.includes(value) && i + 1 < rest.length) {
        const verdict = judgeWriteTarget(rest[i + 1], eff, cwd, true);
        if (verdict) return verdict;
        continue;
      }
      for (const flag of outFlags) {
        if (flag.startsWith('--') && value.startsWith(`${flag}=`)) {
          const target = { value: value.slice(flag.length + 1), hasExpansion: rest[i].hasExpansion };
          const verdict = judgeWriteTarget(target, eff, cwd, true);
          if (verdict) return verdict;
        }
      }
    }
    return null;
  }

  if (name === 'git') {
    const { sub, operands } = gitWriteOperands(seg);
    if (GIT_WRITE_SUBCOMMANDS.has(sub)) {
      for (const operand of operands) {
        const verdict = judgeWriteTarget(operand, eff, cwd, false);
        if (verdict) return verdict;
      }
    }
    return null;
  }

  const codeFlags = CODE_STRING_FLAGS[name];
  if (codeFlags !== undefined) {
    // A `-c`/`-e` string is a program: code, not data. The guard cannot parse Python, so
    // the code is matched textually against the protected families — the asymmetric choice,
    // because a program that names the protected path is at worst a false positive and a
    // program that writes it unseen is a forged ratchet.
    for (let i = 0; i < rest.length; i += 1) {
      if (codeFlags.includes(rest[i].value) && i + 1 < rest.length) {
        const verdict = matchProtectedText(rest[i + 1].value, cwd);
        if (verdict) return verdict;
      }
    }
  }

  if (AWK_NAMES.has(name)) {
    const { operands } = splitOperands(rest, ['-F', '-v', '-f']);
    if (operands.length > 0) {
      const verdict = matchProtectedText(operands[0].value, cwd);
      if (verdict) return verdict;
    }
    return null;
  }

  const writer = WRITER_COMMANDS[name];
  if (writer === undefined) return null;
  if (writer.requiresInPlace === true && !hasInPlaceFlag(rest)) return null;

  const { operands } = splitOperands(rest, writer.valued ?? []);
  const targets = writer.skipFirst === true ? operands.slice(1) : operands;
  if (targets.length === 0) return null;

  // `-t DIR` names the destination out of order; splitOperands consumed it, so re-find it.
  const tValue = valuedFlagValue(rest, writer.valued ?? []);
  if (tValue !== null && (writer.dest === 'last' || name === 'ln')) {
    const verdict = judgeWriteTarget(tValue, eff, cwd, writer.strict);
    if (verdict) return verdict;
    // With -t, every operand is a source being copied *into* the target directory; for mv
    // the sources are also removed, judged leniently below.
    if (writer.sources === 'lenient') {
      for (const source of targets) {
        const verdict2 = judgeWriteTarget(source, eff, cwd, false);
        if (verdict2) return verdict2;
      }
    }
    return null;
  }

  if (writer.dest === 'all') {
    for (const target of targets) {
      const verdict = judgeWriteTarget(target, eff, cwd, writer.strict);
      if (verdict) return verdict;
    }
    return null;
  }

  // dest: 'last' — the final operand is written; for mv the earlier ones are removed.
  if (name === 'rsync' && targets[targets.length - 1].value.includes(':')) return null; // remote destination
  const verdict = judgeWriteTarget(targets[targets.length - 1], eff, cwd, writer.strict);
  if (verdict) return verdict;
  if (writer.sources === 'lenient') {
    for (const source of targets.slice(0, -1)) {
      const verdict2 = judgeWriteTarget(source, eff, cwd, false);
      if (verdict2) return verdict2;
    }
  }
  return null;
}

/**
 * @param {Token[]} rest
 * @returns {boolean} does this argument list carry an in-place-edit flag (`-i`, `-i.bak`, `-pi`, `--in-place`)?
 */
function hasInPlaceFlag(rest) {
  return rest.some(
    (token) =>
      !token.hasExpansion &&
      token.value.startsWith('-') &&
      (token.value.startsWith('--in-place') || /^-[A-Za-z0-9]*i/.test(token.value)),
  );
}

/**
 * The value of a `-t`/`--target-directory` style flag, in either spelling.
 * @param {Token[]} rest
 * @param {string[]} valued
 * @returns {Token | null}
 */
function valuedFlagValue(rest, valued) {
  for (let i = 0; i < rest.length; i += 1) {
    const value = rest[i].value;
    if ((value === '-t' || value === '--target-directory') && valued.includes(value) && i + 1 < rest.length) {
      return rest[i + 1];
    }
    if (value.startsWith('--target-directory=')) {
      return { value: value.slice('--target-directory='.length), hasExpansion: rest[i].hasExpansion };
    }
  }
  return null;
}

/**
 * The command xargs would run: its arguments after xargs's own flags.
 * @param {Token[]} rest
 * @returns {Token[]}
 */
function innerXargsSegment(rest) {
  const valued = ['-n', '-I', '-d', '-L', '-P', '-s', '-a', '-E'];
  let i = 0;
  while (i < rest.length) {
    const value = rest[i].value;
    if (!value.startsWith('-') || value === '--') {
      if (value === '--') i += 1;
      break;
    }
    i += valued.includes(value) ? 2 : 1;
  }
  return rest.slice(i);
}

/**
 * `git`'s write-relevant operands: the subcommand and its non-flag arguments.
 * @param {Token[]} segment tokens starting at `git`
 * @returns {{ sub: string, operands: Token[] }}
 */
function gitWriteOperands(segment) {
  let i = 1;
  while (i < segment.length) {
    const value = segment[i].value;
    if (!value.startsWith('-')) break;
    if (GIT_VALUE_OPTS.has(value)) i += 2;
    else i += 1;
  }
  if (i >= segment.length) return { sub: '', operands: [] };
  const sub = segment[i].value;
  /** @type {Token[]} */
  const operands = [];
  for (const token of segment.slice(i + 1)) {
    if (token.value === '--') continue;
    if (token.value.startsWith('-') && !token.hasExpansion) continue;
    operands.push(token);
  }
  return { sub, operands };
}

/**
 * The effective working directory after this segment, given the one before it.
 *
 * `cd` inside a chain moves every later relative path — `cd .meeseeks && echo x > state.json`
 * never spells the protected path in the write itself. A `cd` whose destination cannot be
 * resolved makes the directory unknowable, and later relative writes are judged as
 * unresolvable rather than assumed safe.
 *
 * @param {Token[]} seg tokens after {@link stripPrefixes}
 * @param {string | null} eff
 * @param {string} cwd
 * @returns {string | null}
 */
function applyCd(seg, eff, cwd) {
  const name = commandName(seg);
  if (name !== 'cd' && name !== 'pushd') return name === 'popd' ? null : eff;
  if (seg.length === 1) return os.homedir();
  const arg = seg[1];
  if (arg.hasExpansion || arg.value === '-') return null;
  const expanded = arg.value.startsWith('~') ? path.join(os.homedir(), arg.value.slice(1)) : arg.value;
  if (eff === null && !path.isAbsolute(expanded)) return null;
  return path.resolve(eff ?? cwd, expanded);
}

/**
 * Refuse a shell command that *writes* into a protected location.
 *
 * The detector works by write position, not by mention: redirection targets, the writer
 * table's destinations, in-place edits, `git add`-family operands, interpreter code
 * strings and heredoc bodies fed to interpreters. Reads and mentions pass — a command
 * whose *data* names `.meeseeks/state.json` is not a write to it — and everything that
 * cannot be resolved to a judgeable path inside a run is denied rather than assumed safe.
 *
 * @param {ParsedCommand} parsed
 * @param {string} cwd
 * @returns {Decision}
 */
function checkProtectedWrites(parsed, cwd) {
  /** @type {Map<number, Redirect[]>} */
  const byOrdinal = new Map();
  for (const redirect of parsed.redirects) {
    const list = byOrdinal.get(redirect.segment) ?? [];
    list.push(redirect);
    byOrdinal.set(redirect.segment, list);
  }

  /** @type {string | null} */
  let eff = cwd;
  for (let ord = 0; ord <= parsed.segments.length; ord += 1) {
    for (const redirect of byOrdinal.get(ord) ?? []) {
      const verdict = judgeWriteTarget(redirect.target, eff, cwd, true);
      if (verdict) return verdict;
    }
    if (ord === parsed.segments.length) break;
    const seg = stripPrefixes(parsed.segments[ord]);
    const verdict = judgeSegmentWrites(seg, eff, cwd);
    if (verdict) return verdict;
    eff = applyCd(seg, eff, cwd);
  }

  for (const heredoc of parsed.heredocs) {
    const receiver = effectiveCommandWord(heredoc.receiver);
    if (HEREDOC_INTERPRETERS.has(receiver)) {
      // The body is a program about to run. Shell receivers are recursed with the full
      // rules by executableBodies; interpreters get the textual match, same as `-c`.
      const verdict = matchProtectedText(heredoc.body, cwd);
      if (verdict) return verdict;
    }
  }

  return ALLOW;
}

// ---------------------------------------------------------------------------
// The textual floor (default-deny) and its safe carve-out
// ---------------------------------------------------------------------------
//
// R24 replaced the old any-mention rule (`MEESEEKS_DIR_RE.test(command)`) with position-only
// judging, and in doing so inverted the risk posture the wrong way: it enumerated *write*
// positions and allowed everything else, so any write technique the tokenizer did not model
// was ALLOWED — a pipe-to-shell, a glued interpreter flag, `tar -C .meeseeks`. That is
// fail-open, against "nothing defaults to pass".
//
// The floor puts the safety net back. Inside a run, a Bash command whose TEXT names a
// protected family defaults to DENY. `checkProtectedWrites` above stays as the precise,
// position-based layer that produces exact per-technique verdicts; it runs first. The floor
// runs after it, and its carve-out re-allows only a command it can positively prove is a read
// or a data mention. A technique the tokenizer has never heard of, that names the path, still
// denies. The carve-out is a whitelist on purpose: a command it cannot classify is not proven
// safe, and the floor's deny stands. Fail closed.

/**
 * Commands that read their path operands and never write one. A protected path named as an
 * operand of one of these is being read, and reading driver state is allowed (DESIGN.md §6).
 * `echo`/`printf` and the boolean/no-op builtins are here too: their arguments are data, not
 * destinations. The set is a whitelist — a command not on it, naming a protected path, is not
 * proven safe.
 *
 * The membership rule is strict: a command belongs here only if it **cannot** write to an
 * arbitrary path through *any* operand. That excludes two shapes a hostile re-attack proved
 * were over-allowed:
 *   - an **operand** output file — `sort -o FILE`, `xxd -r … OUTFILE`, `uniq IN OUT` (its
 *     second operand). These cannot be told from a read by a flag scan, so the commands are
 *     removed outright. `hexdump` stays (no outfile); use it for a hex read of a protected path.
 *   - a **flag** output file on a command that is otherwise a reader — `less -o FILE`,
 *     `sdiff -o FILE`, `tree -o FILE`, and any future one. These are caught by
 *     {@link hasUnrecognizedOutputFlag}: a member carrying an unrecognized `-o`/`--output`/
 *     `--write` flag is not carved out. So the reader stays in the set for its ordinary read
 *     form, and its write form still denies.
 * `sed` is deliberately absent — it writes via `w`/`W`/`s///w` regardless of `-i`, which cannot
 * be cheaply and soundly proven absent; see {@link isSafeReadCommand}.
 */
const READ_ONLY_COMMANDS = new Set([
  'cat', 'tac', 'nl', 'head', 'tail', 'less', 'more', 'most', 'wc', 'od', 'hexdump',
  'strings', 'cksum', 'sum', 'md5sum', 'sha1sum', 'sha224sum', 'sha256sum', 'sha384sum',
  'sha512sum', 'b2sum', 'grep', 'egrep', 'fgrep', 'zgrep', 'zcat', 'rg', 'ag', 'ack', 'diff',
  'diff3', 'sdiff', 'cmp', 'comm', 'stat', 'file', 'ls', 'dir', 'vdir', 'readlink', 'realpath',
  'basename', 'dirname', 'cut', 'column', 'fold', 'fmt', 'pr', 'expand',
  'unexpand', 'tr', 'rev', 'look', 'join', 'paste', 'base64', 'base32', 'du', 'tree', 'jq',
  'echo', 'printf', 'pwd', 'true', 'false', 'test', '[',
]);

/**
 * Flag shapes that name an output file: `-o`, `-O`, `--output`/`--output-*`/`--out-*`, and
 * `--write`/`--write-*`. Short `-w` is deliberately **not** here — among the readers in
 * {@link READ_ONLY_COMMANDS} it is overwhelmingly a width/wrap option (`od -w`, `fold -w`,
 * `base64 -w`) writing to stdout, and no reader in the set writes a file through `-w`. A future
 * reader that did would be caught only if it also used `--write`; that residual is recorded
 * rather than papered over with a false-deny of every width read.
 */
const OUTPUT_FLAG_RE = /^-[oO]$|^--out(put)?($|[-=])|^--write($|[-=])/;

/**
 * For a reader in {@link READ_ONLY_COMMANDS}, the flags matching {@link OUTPUT_FLAG_RE} that are
 * in fact read-only for that command — a stdout separator, a format string, a display option,
 * never an arbitrary output file. Presence of *only* these does not block the carve-out; any
 * other output-shaped flag does. The map is small on purpose: an unrecognized output flag fails
 * closed (deny the read of a protected path), which costs a benign re-read at worst, whereas a
 * mis-whitelisted write is a forged ratchet.
 */
const READ_ONLY_OUTPUT_FLAGS = new Map([
  // `-o` here names only-matching, a format, a separator, an offset or a display mode — never a
  // file. `less`/`sdiff`/`tree` are deliberately absent: their `-o` opens an output file, so the
  // net catches them. A reader missing from this map only loses a benign `-o` read (fail closed).
  ['grep', new Set(['-o'])],
  ['egrep', new Set(['-o'])],
  ['fgrep', new Set(['-o'])],
  ['zgrep', new Set(['-o'])],
  ['rg', new Set(['-o'])],
  ['ag', new Set(['-o'])],
  ['ack', new Set(['-o', '--output'])],
  ['column', new Set(['-o'])],
  ['pr', new Set(['-o'])],
  ['join', new Set(['-o'])],
  ['od', new Set(['-o'])],
  ['strings', new Set(['-o'])],
  ['ls', new Set(['-o'])],
  ['dir', new Set(['-o'])],
  ['vdir', new Set(['-o'])],
  ['cut', new Set(['--output-delimiter'])],
  ['comm', new Set(['--output-delimiter'])],
]);

/** @type {Set<string>} */
const NO_OUTPUT_FLAG_EXCEPTIONS = new Set();

/**
 * Does a reader carry an output-shaped flag this guard does not positively recognize as
 * read-only? If so it is not proven a read, and the floor's deny stands (fail closed on an
 * unrecognized flag). An unresolved flag (`$FLAG`) is left to the position layer and not
 * treated as a positive output signal here.
 * @param {string} name
 * @param {Token[]} rest tokens after the command word
 * @returns {boolean}
 */
function hasUnrecognizedOutputFlag(name, rest) {
  const allowed = READ_ONLY_OUTPUT_FLAGS.get(name) ?? NO_OUTPUT_FLAG_EXCEPTIONS;
  for (const token of rest) {
    if (token.hasExpansion) continue;
    const flag = token.value.split('=', 1)[0];
    if (!OUTPUT_FLAG_RE.test(flag)) continue;
    if (allowed.has(flag)) continue;
    return true;
  }
  return false;
}

/**
 * git subcommands that only read — the positive allowlist that replaced "any subcommand not in
 * the write set is a read". That old default was fail-open inside the carve-out: `git config -f
 * FILE key value` writes an arbitrary named file, and `config` is in neither write set, so it was
 * waved through as a read. Anything not positively here is not a safe read → the floor denies it.
 * `config` is handled separately by {@link isGitSafeRead}, because only its pure `--get`/`--list`
 * forms read.
 */
const GIT_READ_SUBCOMMANDS = new Set([
  'log', 'show', 'status', 'diff', 'cat-file', 'ls-files', 'ls-tree', 'rev-parse', 'rev-list',
  'describe', 'blame', 'grep', 'shortlog', 'whatchanged',
]);

/** `git config` query flags: the only forms that read rather than write. */
const GIT_CONFIG_READ_FLAGS = new Set([
  '--get', '--get-all', '--get-regexp', '--get-urlmatch', '--list', '-l',
]);

/**
 * `git config` flags that write, or that name a file to write. `-f`/`--file` points config at an
 * arbitrary file — the reported hole — and the mutating flags edit it. Any of these disqualifies
 * the command from the read carve-out even alongside a `--get`.
 */
const GIT_CONFIG_WRITE_FLAGS = new Set([
  '-f', '--file', '-e', '--edit', '--add', '--unset', '--unset-all', '--replace-all',
  '--rename-section', '--remove-section',
]);

/**
 * Is this `git` invocation a pure read, for the carve-out? A worktree-mutating subcommand
 * (denied upstream by the position layer, `clean` by {@link checkGitClean}) is not; `config` is
 * a read only as a pure `--get`/`--list` with no file or edit flag; every other subcommand is a
 * read only if it is positively in {@link GIT_READ_SUBCOMMANDS}.
 * @param {Token[]} seg tokens after {@link stripPrefixes}
 * @returns {boolean}
 */
function isGitSafeRead(seg) {
  const { sub, args } = gitSubcommand(seg);
  if (sub === 'config') {
    if (args.some((a) => GIT_CONFIG_WRITE_FLAGS.has(a) || a.startsWith('--file='))) return false;
    return args.some((a) => GIT_CONFIG_READ_FLAGS.has(a));
  }
  return GIT_READ_SUBCOMMANDS.has(sub);
}

/** `find` primaries that act rather than read: any of them makes a `find` a writer. */
const FIND_WRITE_ACTIONS = new Set([
  '-exec', '-execdir', '-ok', '-okdir', '-delete', '-fprint', '-fprintf', '-fprint0', '-fls',
]);

/**
 * Copy/link commands whose write destination is judged upstream by {@link checkProtectedWrites}.
 * A protected operand that survives to the floor is therefore a source being read (`cp
 * .meeseeks/state.json /tmp/backup.json`, `dd if=.meeseeks/state.json of=/tmp/copy.json`, a
 * symlink whose target is only referenced).
 */
const SOURCE_READ_COMMANDS = new Set(['cp', 'install', 'rsync', 'ln', 'dd']);

/**
 * Does this token's text name a protected path (any `.meeseeks` depth, a settings file, or the
 * guard), by the same textual match the floor uses on the whole command?
 * @param {Token} token
 * @param {string} cwd
 * @returns {boolean}
 */
function tokenNamesProtected(token, cwd) {
  return matchProtectedText(token.value, cwd) !== null;
}

/**
 * A shell or interpreter that takes its program from stdin — a bare `sh`, `python3`, `node`,
 * with no `-c`/`-e` code flag and no script-file operand. A pipe or input redirection can feed
 * such a stage a protected write the guard cannot see (`echo '… > .meeseeks/x' | sh`,
 * `cat .meeseeks/x | sh`, `sh < .meeseeks/script`), so once any protected path is named in the
 * command such a stage cannot be proven safe. A `-c`/`-e` body, by contrast, is recursed with
 * the full rules by {@link executableBodies}; a script-file operand runs a committed file whose
 * *name* is judged like any other operand.
 * @param {Token[]} seg
 * @returns {boolean}
 */
function isStdinExecutor(seg) {
  const name = commandName(seg);
  const isShell = SHELL_INVOKERS.has(name);
  const isInterp = HEREDOC_INTERPRETERS.has(name);
  if (!isShell && !isInterp) return false;
  const codeFlags = CODE_STRING_FLAGS[name] ?? [];
  let endFlags = false;
  for (const token of seg.slice(1)) {
    const v = token.value;
    if (!endFlags && v === '--') {
      endFlags = true;
      continue;
    }
    if (!endFlags && v.startsWith('-') && v.length > 1) {
      // A code flag means the program is an argument, not stdin. The shell `-c` form and the
      // interpreter short forms (`-c`, `-e`, `-p`, `-E`) — glued (`-c'code'`) or spaced — count.
      if (isShell && /^-[A-Za-z]*c$/.test(v)) return false;
      if (isInterp && (codeFlags.includes(v) || /^-[cepE]/.test(v))) return false;
      continue;
    }
    // A non-flag token is a script/program file to run — not stdin.
    return false;
  }
  return true;
}

/**
 * For a shell invoker that is not a stdin executor (it has a spaced `-c BODY`, or a script-file
 * operand), is every protected mention confined to the `-c` body — the one token
 * {@link executableBodies} recurses with the full rules? A mention anywhere else in the segment
 * is not covered by that recursion and is not proven safe.
 * @param {Token[]} seg
 * @param {string} cwd
 * @returns {boolean}
 */
function shellWrapperMentionsOnlyInBody(seg, cwd) {
  const flagIdx = seg.findIndex((token) => /^-[A-Za-z]*c$/.test(token.value));
  const bodyIdx = flagIdx === -1 ? -1 : flagIdx + 1;
  for (let i = 0; i < seg.length; i += 1) {
    if (i === bodyIdx) continue;
    if (tokenNamesProtected(seg[i], cwd)) return false;
  }
  return true;
}

/**
 * Given a segment that names a protected path (or that runs inside a protected directory a `cd`
 * moved into), is it a command that only reads?
 *
 * `cp`/`ln`/`dd`/`install`/`rsync` have their write destination judged upstream, so a protected
 * operand surviving to here is a read source. A reader in {@link READ_ONLY_COMMANDS} is a read
 * only when it carries no unrecognized output flag (`less -o FILE`, `sdiff -o FILE` write).
 * `find` reads unless it carries a write action. A `git` invocation reads only as a positively
 * allowlisted subcommand ({@link isGitSafeRead}). Everything else — `tar`, `sed`, `python3`, an
 * unknown program — is not proven a read.
 *
 * `sed` is intentionally not carved out: it writes via `w`/`W`/`s///w` (and executes via `e`)
 * regardless of `-i`, none of which the position layer sees, and none cheaply provable absent
 * from an arbitrary script. Denying `sed` naming a protected path is the acceptable fail-closed
 * side; `hexdump`/`cat`/`grep` remain for reads.
 * @param {string} name
 * @param {Token[]} seg
 * @param {Token[]} rest
 * @returns {boolean}
 */
function isSafeReadCommand(name, seg, rest) {
  if (READ_ONLY_COMMANDS.has(name)) return !hasUnrecognizedOutputFlag(name, rest);
  if (SOURCE_READ_COMMANDS.has(name)) return true;
  if (name === 'cd' || name === 'pushd' || name === 'popd') return true;
  if (name === 'find') return !rest.some((token) => FIND_WRITE_ACTIONS.has(token.value));
  if (name === 'git') return isGitSafeRead(seg);
  return false;
}

/**
 * Is one command segment provably safe despite the command naming a protected path?
 *
 * @param {Token[]} seg tokens after {@link stripPrefixes}
 * @param {string | null} eff effective working directory tracked across `cd`
 * @param {string} cwd
 * @returns {boolean}
 */
function segmentIsSafe(seg, eff, cwd) {
  if (seg.length === 0) return true;
  const name = commandName(seg);
  const rest = seg.slice(1);

  if (isStdinExecutor(seg)) return false;
  if (SHELL_INVOKERS.has(name)) return shellWrapperMentionsOnlyInBody(seg, cwd);

  // After a `cd` into `.meeseeks`, a relative operation lands inside it without naming it.
  // checkProtectedWrites denies the known writers accounting for that cd; an unrecognized
  // command is denied here rather than assumed to be a read.
  const insideProtected = eff !== null && hasMeeseeksSegment(eff);
  if (insideProtected && !isSafeReadCommand(name, seg, rest)) return false;

  const namesProtected = seg.some((token) => tokenNamesProtected(token, cwd));
  if (!namesProtected) return true;
  return isSafeReadCommand(name, seg, rest);
}

/**
 * The carve-out: can every protected mention in this command be proven to sit in a read, a
 * data slot, or a body that is recursed? Returns false — leaving the floor's deny to stand —
 * the moment one cannot.
 * @param {ParsedCommand} parsed
 * @param {string} cwd
 * @returns {boolean}
 */
function isProvablySafe(parsed, cwd) {
  // A redirect target is a write destination, never a read. checkProtectedWrites denies a
  // protected one before the floor runs; re-check defensively.
  for (const redirect of parsed.redirects) {
    if (tokenNamesProtected(redirect.target, cwd)) return false;
  }
  /** @type {string | null} */
  let eff = cwd;
  for (const raw of parsed.segments) {
    const seg = stripPrefixes(raw);
    if (!segmentIsSafe(seg, eff, cwd)) return false;
    eff = applyCd(seg, eff, cwd);
  }
  for (const heredoc of parsed.heredocs) {
    const receiver = effectiveCommandWord(heredoc.receiver);
    if (SHELL_INVOKERS.has(receiver) || HEREDOC_INTERPRETERS.has(receiver)) {
      // The body is code fed to a shell or interpreter; if it names a protected path it cannot
      // be proven safe here. A data-sink heredoc body is data — a mention in it is not a write.
      if (matchProtectedText(heredoc.body, cwd) !== null) return false;
    }
  }
  return true;
}

/**
 * The textual floor. Inside a run, a Bash command whose TEXT names a protected family defaults
 * to DENY; the carve-out re-allows only a command it can positively prove is a read or a data
 * mention. This is the restored any-mention floor R24 removed, demoted from the whole rule to
 * a net beneath the position detector.
 * @param {ParsedCommand} parsed
 * @param {string} command
 * @param {string} cwd
 * @returns {Decision}
 */
function checkProtectedFloor(parsed, command, cwd) {
  const named = matchProtectedText(command, cwd);
  if (named === null) return ALLOW;
  if (isProvablySafe(parsed, cwd)) return ALLOW;
  return named;
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

const GIT_CLEAN_REASON =
  'git clean removes untracked and ignored files, and the .meeseeks runtime directory is gitignored: ' +
  'git clean -x/-fdx destroys the ratchet and the RED evidence a run is judged by, naming no protected ' +
  'path for the position detector to catch (DESIGN.md §6). Only a dry run (-n/--dry-run) is allowed ' +
  'inside a run; outside a run it is the operator\'s to run.';

/**
 * Refuse any `git clean` inside a run that is not a dry run. It names no protected path
 * textually, so the floor cannot catch it; scoping it safely is not worth the risk during a
 * run. The recursion in {@link checkBashCommand} carries this into wrapped and piped shells.
 * @param {Token[][]} segments
 * @returns {Decision}
 */
function checkGitClean(segments) {
  for (const raw of segments) {
    const segment = stripPrefixes(raw);
    if (commandName(segment) !== 'git') continue;
    const { sub, args } = gitSubcommand(segment);
    if (sub !== 'clean') continue;
    const dryRun = args.some(
      (a) => a === '-n' || a === '--dry-run' || (/^-[A-Za-z]+$/.test(a) && a.includes('n')),
    );
    if (!dryRun) return deny('git-clean', GIT_CLEAN_REASON);
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
  'This is a TEXT match, not a detected invocation: the rule scans command position, including the body of any heredoc ' +
  'fed to a shell, because a heredoc can carry a script. A document written through a heredoc is data and no longer trips ' +
  'it — but if prose in command position did, reword rather than reach for the rule: it is not weakened to make ' +
  'commit messages easier.';

/**
 * A run is nested when something *invokes* the slash command — not when a string happens
 * to contain it.
 *
 * The first version denied any token equal to the slash command anywhere in the line, and
 * it caught a heredoc that merely mentioned the command in a code comment. Prose is not an
 * invocation. So the rule is command position: the first word of a segment, or an argument
 * to `claude`, where the argument really is the prompt. Heredoc bodies are data unless they
 * feed a shell, in which case they are recursed as commands and this rule runs over them
 * again.
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
 * Fail-closed on a malformed depth: an unreadable or partially numeric marker grants no exception.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {boolean}
 */
function boxPermitted(env) {
  const armed = env[BOX_MARKER_ENV];
  if (armed === undefined || armed === '') return false;
  const marker = env[DEPTH_MARKER_ENV];
  if (marker !== undefined && marker !== '' && !/^(0|[1-9]\d*)$/.test(marker)) return false;
  const depth = Number(marker ?? '0');
  if (!Number.isSafeInteger(depth)) return false;
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
    let segment = stripPrefixes(raw);
    // `xargs sh -c '...'` is the same wrapper one layer out.
    if (commandName(segment) === 'xargs') {
      segment = innerXargsSegment(segment.slice(1));
    }
    if (segment.length < 2 || !SHELL_INVOKERS.has(commandName(segment))) continue;
    const flag = segment.findIndex((token) => /^-[A-Za-z]*c$/.test(token.value));
    if (flag === -1 || flag + 1 >= segment.length) continue;
    inner.push(segment[flag + 1].value);
  }
  return inner;
}

/**
 * Every string in this command that is itself a command: substitutions and subshells,
 * `sh -c` arguments, `eval` arguments, heredoc bodies fed to a shell.
 *
 * @param {ParsedCommand} parsed
 * @returns {string[]}
 */
function executableBodies(parsed) {
  const bodies = [...parsed.substitutions, ...wrappedCommands(parsed.segments)];
  for (const raw of parsed.segments) {
    const segment = stripPrefixes(raw);
    if (commandName(segment) === 'eval' && segment.length > 1) {
      if (segment.slice(1).every((token) => !token.hasExpansion)) {
        bodies.push(segment.slice(1).map((token) => token.value).join(' '));
      }
      // An eval with expansion is denied inside a run by judgeSegmentWrites; outside a run
      // there is nothing resolvable to scan.
    }
  }
  for (const heredoc of parsed.heredocs) {
    if (SHELL_INVOKERS.has(effectiveCommandWord(heredoc.receiver))) {
      bodies.push(heredoc.body);
    }
  }
  return bodies;
}

/**
 * Run every Bash rule over one command string, recursing into executable bodies.
 *
 * The write detector (`protected-state`, `protected-guard`, `protected-settings`,
 * `unresolvable-write`) is conditional on being inside a run. History destruction and
 * recursive removal are refused to everyone, because neither becomes reasonable merely
 * because a human asked for it in this session.
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
 * @param {{ insideRun?: boolean, env?: Record<string, string | undefined>, depth?: number }} [options]
 *   defaults to inside a run and to the real environment, both of which are the deny side
 * @returns {Decision}
 */
export function checkBashCommand(command, cwd, options = {}) {
  // Defaults to "inside a run", which is the deny-side default. A caller that forgets to
  // say where it is gets the stricter answer, not the looser one.
  const running = options.insideRun ?? true;
  // Defaults to the real environment, so production behaviour is unchanged and only a test has
  // to say which environment it means.
  const env = options.env ?? process.env;
  const depth = options.depth ?? 0;
  const parsed = tokenizeCommand(command);
  const checks = [
    // The position detector runs first, so a recognized write keeps its precise per-technique
    // verdict and reason. The floor is the net beneath it: it only decides a command the
    // detector already allowed. checkGitClean sits between them because git clean names no path.
    running ? checkProtectedWrites(parsed, cwd) : ALLOW,
    running ? checkGitClean(parsed.segments) : ALLOW,
    running ? checkProtectedFloor(parsed, command, cwd) : ALLOW,
    checkNestedRun(parsed.segments, env),
    checkGitHistory(parsed.segments),
    checkRecursiveRemove(parsed.segments, cwd),
  ];
  for (const result of checks) {
    if (result.decision === 'deny') return result;
  }
  const bodies = executableBodies(parsed);
  if (bodies.length > 0 && depth >= MAX_SCAN_DEPTH) {
    // Inside a run, a command nested past what the scan can follow is denied rather than
    // waved through half-read. Outside a run the scan just stops: the universal rules ran
    // over everything reachable, and an operator is not the accused.
    return running
      ? deny(
          'unresolvable-write',
          `Command nesting deeper than ${MAX_SCAN_DEPTH} levels cannot be analysed; unanalysable commands are denied inside a run (DESIGN.md §6).`,
        )
      : ALLOW;
  }
  for (const inner of bodies) {
    // The environment travels into nested commands too. A permission that evaporated one level
    // down would deny a command the top level had just allowed, for no reason a reader could see.
    const result = checkBashCommand(inner, cwd, { insideRun: running, env, depth: depth + 1 });
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
    if (value.length === 0) continue;
    // Resolvability first, so a dangling symlink denies as what it is rather than as
    // whichever protected family happens to be checked first.
    if (realpathForCompare(path.resolve(cwd, value)) === null) {
      return deny(
        'unresolvable-write',
        `${value} resolves through a link that cannot be resolved; inside a run an unresolvable write target ` +
          'is denied (DESIGN.md §6).',
      );
    }
    if (isProtectedGuardPath(value, cwd)) {
      return deny('protected-guard', protectedGuardReason(value));
    }
    if (isProtectedStatePath(value, cwd)) {
      return deny(
        'protected-state',
        `${value} is inside the .meeseeks runtime directory. A run does not write the state or evidence it is ` +
          'judged by (DESIGN.md §6). Reading it is fine; the Read tool is not hooked.',
      );
    }
    if (isProtectedSettingsPath(value, cwd)) {
      return deny('protected-settings', protectedSettingsReason(value));
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
 * The provenance prefix on every denial (R25b). An injection-hardened builder is told to treat
 * text arriving in its transcript as untrusted; a denial with no stated origin reads exactly
 * like the injected noise it has been hardened against, and gets discarded the same way. Naming
 * the origin as automated policy is what lets the builder obey its own guard. The verbatim
 * denial content rides unstyled beneath it.
 */
const PROVENANCE = '[from the meeseeks guard — automated policy, not user input]';

/**
 * Render a decision as the hook's stdout. Allow prints nothing.
 *
 * **Denial dampening (R25c) was cut from this slice and is deliberately not here.** Counting
 * denials across separate hook processes needs shared state on disk, and the item-37 hostile
 * panel showed that giving the guard a filesystem-write primitive on its denial path opens a
 * symlink confused-deputy write — the guard, which is not itself guarded, following a
 * builder-planted symlink to corrupt protected state. Verbosity is not worth handing the guard
 * that primitive. Dampening returns as its own item, storing state where the builder cannot
 * reach it (`DESIGN.md`/`PLAN.md`).
 *
 * @param {Decision} decision
 * @returns {string}
 */
export function renderDecision(decision) {
  if (decision.decision === 'allow') return '';
  return `${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `${PROVENANCE} [meeseeks:${decision.rule}] ${decision.reason}`,
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
