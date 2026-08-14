/**
 * Components — driver-delegated sub-runs in worktrees (PLAN item 24).
 *
 * The one gain nesting buys that nothing flat reaches is per-subtree toolchains:
 * `resolveToolchain` is one-per-run, so a polyglot repository is inexpressible without this.
 * Each declared component is handed to a **whole nested driver** — its own toolchain detection,
 * its own gates, its own ratchet, its own cold panel — running in a git worktree on the branch
 * `meeseeks/component-<name>`, and the parent consumes nothing but the branch and the child's
 * `outcome.json`.
 *
 * The shape is stated plainly, because every piece of it is a refusal:
 *
 *   - **The config declares, the flag permits.** `components` in `.meeseeks/config.json` says
 *     *what* the components are; the permission to nest at all is `--give-them-the-box`, typed
 *     by the operator per session. A configured component without the flag refuses the run
 *     before any child is paid for. Config cannot smuggle the permission.
 *   - **A child's config never contains `components`.** The depth cap is the braces; this is
 *     the belt. `writeComponentChildConfig` throws rather than writes if the key is present.
 *   - **Outcome consumption is fail-closed.** A missing, unreadable or stateless
 *     `outcome.json` is a failed component, and anything short of `SHIPPED` ends the parent
 *     `ABORTED` naming the component and its terminal state. Continuing without the component
 *     is a recorded option, not the default.
 *   - **A component's `SHIPPED` is a pre-filter**, exactly as the panel carry is. The parent's
 *     own gates and FULL cold panel still judge the merged whole. Never a substitute.
 *
 * Everything that touches git is injected, exactly as `race.mjs` does it, and the merge *is*
 * the race machinery: `applyWinner`, already tier-2 tested, fast-forwards the parent onto the
 * component branch.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { defaultConfig } from './config.mjs';

/** @typedef {import('./plugins.mjs').Runner} Runner */
/** @typedef {import('./config.mjs').ComponentConfig} ComponentConfig */

/** Thrown when the component machinery must not proceed. */
export class ComponentError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'ComponentError';
  }
}

/**
 * @param {string} name a validated component name
 * @returns {string} the directory name for the component's worktree
 */
export function componentWorktreeName(name) {
  return `meeseeks-component-${name}`;
}

/**
 * @param {string} name a validated component name
 * @returns {string} the branch the component's worktree is created on
 */
export function componentBranch(name) {
  return `meeseeks/component-${name}`;
}

/**
 * Does this path look like a worktree the component phase created?
 *
 * Matched on the directory name `createComponentWorktree` is handed — `meeseeks-component-` plus
 * a name the config validator accepted — rather than on the parent directory, for the same
 * reason the race sweep matches basenames: a sweep must still recognise a worktree whose parent
 * was renamed or partially cleaned. The name grammar here is the validator's, so a worktree from
 * an older config is still recognised as ours.
 *
 * @param {string} worktreePath
 * @returns {boolean}
 */
function looksLikeComponentWorktree(worktreePath) {
  return /^meeseeks-component-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path.basename(worktreePath));
}

/**
 * Remove component worktrees left behind by a previous run, before starting any component.
 *
 * A mirror of `sweepRaceWorktrees`, and for the identical reason: cleanup on the way out covers
 * every ordinary ending and none of the important one. A driver killed with `-9` mid-component
 * leaves the worktree registered, and `git worktree add` refuses a path git already knows about
 * — so one abandoned component would break every later run of the same configuration, with an
 * error naming a directory rather than the run that left it. Self-healing at the start is the
 * shape that survives, and the run-lock's one-driver-per-repository rule is what makes it safe:
 * the driver claims the lock before this phase begins, so at the moment this runs, no live
 * driver can own a component worktree here.
 *
 * A list that cannot be read is reported as a problem, not treated as an empty list.
 *
 * @param {{ cwd: string, run: Runner }} options
 * @returns {Promise<{ removed: string[], problems: string[] }>}
 */
export async function sweepComponentWorktrees(options) {
  /** @type {string[]} */
  const removed = [];
  /** @type {string[]} */
  const problems = [];

  const listed = await options.run('git', ['worktree', 'list', '--porcelain'], { cwd: options.cwd });
  if (!listed.ok) {
    problems.push(`could not list worktrees before the component phase: ${(listed.stderr || listed.stdout).trim()}`);
    return { removed, problems };
  }

  const stale = listed.stdout
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length).trim())
    .filter((entry) => entry.length > 0 && looksLikeComponentWorktree(entry));

  for (const entry of stale) {
    const result = await options.run('git', ['worktree', 'remove', '--force', entry], { cwd: options.cwd });
    if (result.ok) {
      removed.push(entry);
      continue;
    }
    problems.push(`abandoned component worktree ${entry} could not be removed: ${(result.stderr || result.stdout).trim()}`);
  }

  // Always, even when nothing was listed: an entry whose directory is already gone is invisible
  // to the loop above and still refuses the next `worktree add` on that path.
  await options.run('git', ['worktree', 'prune'], { cwd: options.cwd });
  return { removed, problems };
}

/**
 * Refuse a component whose `.meeseeks` state is tracked at the parent's HEAD.
 *
 * The component's worktree is a checkout of HEAD, so a **committed** `<dir>/.meeseeks/` file
 * materialises inside it before the child ever runs — and a committed `outcome.json` saying
 * `SHIPPED` would then be read as this run's verdict for a child that refused at its own
 * preflight and built nothing. The parent's root-level tracked-state check does not see
 * component subtrees, so this one exists. Tracked run state is a measured-in-the-wild family
 * (`checkStateNotTracked`), not a hypothetical.
 *
 * Fail-closed: a listing that cannot be produced is a refusal, not an empty list — the driver
 * is well past the is-this-even-git checks by the time components run, so a failing `ls-files`
 * here is a surprise, and a surprise is not evidence that nothing is tracked.
 *
 * @param {{ cwd: string, run: Runner, dir: string }} options
 * @returns {Promise<{ ok: boolean, detail: string }>}
 */
export async function checkComponentStateNotTracked(options) {
  // Git pathspecs use forward slashes on every platform; the validator already refused
  // absolute paths and `..` segments, so this is only a dialect normalisation.
  const pathspec = `${options.dir.split(/[\\/]+/).filter(Boolean).join('/')}/.meeseeks`;
  const result = await options.run('git', ['ls-files', '--', pathspec], { cwd: options.cwd });
  if (!result.ok) {
    return {
      ok: false,
      detail: `tracked state could not be checked (git ls-files -- ${pathspec} failed: ${(result.stderr || result.stdout).trim()}); refusing rather than assuming it is clean`,
    };
  }
  const tracked = result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (tracked.length > 0) {
    return {
      ok: false,
      detail:
        `${pathspec} is tracked (${tracked.length} file(s), e.g. ${tracked[0]}). A committed outcome.json ` +
        'would be read as the child\'s verdict for a run that never happened. ' +
        `Run: git rm -r --cached ${pathspec} && git commit -m "untrack component state" - the files stay on disk.`,
    };
  }
  return { ok: true, detail: '' };
}

/**
 * Create one component worktree, on its branch, at the parent's current HEAD.
 *
 * On a **branch**, where race candidates are detached — the difference is the point. A race
 * candidate must not be able to move a ref; a component's whole product *is* a ref the parent
 * can fast-forward onto, so the branch is the handover. `-B` rather than `-b`, so a branch a
 * previous run left behind is reset to today's HEAD instead of refusing the run: the sweep has
 * already cleared any worktree that could have it checked out.
 *
 * @param {{ cwd: string, run: Runner, name: string, dir: string }} options
 * @returns {Promise<{ ok: boolean, branch: string, detail: string }>}
 */
export async function createComponentWorktree(options) {
  const branch = componentBranch(options.name);
  const result = await options.run('git', ['worktree', 'add', '-B', branch, options.dir, 'HEAD'], {
    cwd: options.cwd,
  });
  if (!result.ok) return { ok: false, branch, detail: (result.stderr || result.stdout).trim() };
  return { ok: true, branch, detail: '' };
}

/**
 * The floor under a derived token ceiling. Zero would mean **no ceiling** — the same falsy trap
 * `childBudget` names for dollars — so a parent that has already overspent hands its child a
 * ceiling that stops it at once rather than one that never stops it at all.
 */
const MIN_CHILD_TOKEN_CEILING = 1;

/** The dollar floor, the same number and the same argument as `childBudget`'s. */
const MIN_CHILD_COST_CEILING_USD = 0.0001;

/** The wall-clock floor. A child must always have a deadline that can fire. */
const MIN_CHILD_DEADLINE_MS = 1;

/**
 * @typedef {{ maxIterations: number, tokenCeiling: number, costCeiling: number, deadlineMs: number }} ComponentChildConfig
 */

/**
 * Derive the config the parent writes into a component's `.meeseeks/config.json`.
 *
 * **Only what is derived is written.** The child's own `loadConfig` merges this over the full
 * defaults, so everything unstated — models, reviewers, plugins, effort — is the stock
 * configuration rather than a copy of the parent's. Copying the parent's file wholesale was
 * considered and refused: it would carry `deploy` (a whole-app property no component may
 * exercise) and it would carry `components` itself, which is the exact key this function exists
 * to never write.
 *
 * - **Ceilings are the parent's remainder**, so a component cannot spend money the run does not
 *   have. A parent with a ceiling switched off (`0`) hands `0` on — no ceiling, deliberately,
 *   because inventing a limit the operator switched off is the same defect as dropping one they
 *   set. A parent that has already overspent hands the floor rather than zero, because zero
 *   means *unlimited* and an overspent run is the last one that should say it.
 * - **The deadline is the parent's remaining clock** when one is armed — a component inherits
 *   the time the run actually has left, not a fresh allowance. With no parent clock armed the
 *   box default applies, which in practice cannot be reached from the driver (components
 *   require `--give-them-the-box`, and the box always arms a clock) and exists so this function
 *   has an answer for every input rather than a precondition.
 * - **`maxIterations` is the stock default**, written explicitly so a per-component override
 *   later is a one-line change here. Deliberately not the parent's: a parent tuned for a long
 *   flat run would otherwise hand every component that same allowance.
 *
 * @param {{ tokenCeiling: number, costCeiling: number, deadlineMs: number }} parent
 * @param {{ spentTokens: number, spentUsd: number, elapsedMs: number, boxDeadlineMs: number }} options
 * @returns {ComponentChildConfig}
 */
export function componentChildConfig(parent, options) {
  const tokenCeiling =
    parent.tokenCeiling === 0
      ? 0
      : Math.max(MIN_CHILD_TOKEN_CEILING, Math.round(parent.tokenCeiling - options.spentTokens));
  const costCeiling =
    parent.costCeiling === 0
      ? 0
      : // Four decimals for the same reason `childBudget` keeps four: the cost scale is cents,
        // and more precision would claim an accuracy the upstream accounting does not have.
        Math.max(MIN_CHILD_COST_CEILING_USD, Number((parent.costCeiling - options.spentUsd).toFixed(4)));
  const deadlineMs =
    parent.deadlineMs > 0
      ? Math.max(MIN_CHILD_DEADLINE_MS, Math.round(parent.deadlineMs - options.elapsedMs))
      : options.boxDeadlineMs;
  return { maxIterations: defaultConfig().maxIterations, tokenCeiling, costCeiling, deadlineMs };
}

/**
 * Write a component child's `.meeseeks/config.json`, refusing to smuggle nesting.
 *
 * **The belt beside the depth cap's braces.** `MAX_BOX_DEPTH` bounds how deep nesting can go;
 * this bounds how nesting can be *asked for*: never through a file a parent writes. A config
 * carrying `components` here would hand a nested run a further generation of nested runs that
 * no operator typed a flag for, so the presence of the key — whatever its value, an empty list
 * included — is refused before a byte is written.
 *
 * Written atomically, the way `writeConfig` writes the real one: a child driver must never read
 * half a file.
 *
 * @param {string} meeseeksDir the child's `.meeseeks` directory
 * @param {ComponentChildConfig} config
 * @returns {string} the path written
 */
export function writeComponentChildConfig(meeseeksDir, config) {
  if (Object.hasOwn(config, 'components')) {
    throw new ComponentError(
      'a component config may never contain a components key: nesting is permitted per level by the ' +
        "operator's --give-them-the-box, and a file must not carry that permission downward",
    );
  }
  mkdirSync(meeseeksDir, { recursive: true });
  const file = path.join(meeseeksDir, 'config.json');
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  renameSync(temporary, file);
  return file;
}

/**
 * Read a component's `outcome.json`, fail-closed.
 *
 * A component that recorded nothing did not ship — a missing file, unreadable file, unparseable
 * JSON, or a record with no terminal state are all the same answer, each with its own sentence
 * so the operator knows which one happened. The spends are clamped at zero exactly as
 * `parseClaudeEnvelope` clamps an envelope's: a negative number here would be a refund nothing
 * earned, and nothing decrements the bill.
 *
 * @param {string} file absolute path to the child's `.meeseeks/outcome.json`
 * @returns {{ ok: true, state: string, spentTokens: number, costUsd: number } | { ok: false, detail: string }}
 */
export function readComponentOutcome(file) {
  /** @type {string} */
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (error) {
    return {
      ok: false,
      detail: `${file} could not be read (${/** @type {Error} */ (error).message}); a component that recorded no outcome did not ship`,
    };
  }
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { ok: false, detail: `${file} is not valid JSON: ${/** @type {Error} */ (error).message}` };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, detail: `${file} does not hold an outcome record; got ${JSON.stringify(parsed)}` };
  }
  const record = /** @type {Record<string, unknown>} */ (parsed);
  if (typeof record.state !== 'string' || record.state.trim() === '') {
    return { ok: false, detail: `${file} records no terminal state; a stateless outcome is not evidence of shipping` };
  }
  const count = (/** @type {unknown} */ value) => Math.max(0, Number(value) || 0);
  return { ok: true, state: record.state, spentTokens: count(record.spentTokens), costUsd: count(record.costUsd) };
}

/**
 * The argv a component's nested driver is spawned with.
 *
 * `--yes` because nobody is watching a nested run's prompts, and `--give-them-the-box` because
 * the child *is* the box: the parent only reaches this point when the operator typed the flag,
 * and the child re-arms the same machinery — depth counting, the wall clock, the cap at two —
 * that the flag arms everywhere else.
 *
 * @param {string} driver absolute path to `scripts/driver.mjs`
 * @param {string} spec the component's spec: a PRD path relative to its dir, or a quoted idea
 * @returns {string[]}
 */
export function componentDriverArgs(driver, spec) {
  return [driver, spec, '--yes', '--give-them-the-box'];
}

/**
 * Run one component's nested driver as a real process, streaming its stdout line by line.
 *
 * This is the default for the driver's `io.runComponent` seam — injectable for the same reason
 * `io.spawn` is, so tier 2 can fake the child driver while the worktree, config and merge halves
 * run against real git. The child's stdout is the parent's only live window into a nested run,
 * so it is forwarded a line at a time rather than collected: a component is minutes of work, and
 * output that arrives only at the end is indistinguishable from a hang while it matters.
 *
 * The exit code is reported, not judged. The parent's verdict comes from the child's
 * `outcome.json`, fail-closed, because an exit code cannot say *which* terminal state was
 * reached and a crashed child leaves no outcome to read — which is already the failing answer.
 *
 * @param {{
 *   driver: string, spec: string, cwd: string,
 *   env: Record<string, string | undefined>,
 *   onLine: (line: string) => void,
 * }} options
 * @returns {Promise<{ code: number | null, detail: string }>} `detail` carries the tail of
 *   stderr, for the operator reading a component that died without an outcome; empty otherwise
 */
export function runComponentDriver(options) {
  return new Promise((resolve) => {
    /** @type {import('node:child_process').ChildProcess} */
    let child;
    try {
      child = spawn(process.execPath, componentDriverArgs(options.driver, options.spec), {
        cwd: options.cwd,
        env: options.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      resolve({ code: null, detail: /** @type {Error} */ (error).message });
      return;
    }

    let pending = '';
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (/** @type {string} */ chunk) => {
      pending += chunk;
      let newline = pending.indexOf('\n');
      while (newline !== -1) {
        options.onLine(pending.slice(0, newline).replace(/\r$/, ''));
        pending = pending.slice(newline + 1);
        newline = pending.indexOf('\n');
      }
    });

    // The tail only. stderr from a healthy child driver is quiet; from a crashed node process it
    // is a stack trace, and the last two thousand characters are the ones that name the error.
    let stderrTail = '';
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (/** @type {string} */ chunk) => {
      stderrTail = (stderrTail + chunk).slice(-2000);
    });

    // Both events can fire for one child — a failed spawn raises 'error' and may still 'close' —
    // and a promise resolves once, so the guard keeps the pending-line flush from narrating a
    // child that has already been reported dead.
    let settled = false;
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      resolve({ code: null, detail: error.message });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      if (pending !== '') options.onLine(pending.replace(/\r$/, ''));
      resolve({ code, detail: stderrTail.trim() });
    });
  });
}
