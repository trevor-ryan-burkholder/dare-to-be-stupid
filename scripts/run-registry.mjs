/**
 * The per-user register of running Drivers (`DESIGN.md` §6.6, `REVIEW.md` F42).
 *
 * `scripts/ancestry.mjs` answers *"is any of my ancestors a run?"* and needs somewhere to look it
 * up. This is that place, and two properties decide where it lives.
 *
 * **Outside every repository.** F42's attack points the nested run at *another* repository, where
 * the parent's lock and `.meeseeks/` are irrelevant. A register kept inside the target tree would
 * be looking in the wrong place by construction.
 *
 * **Under a `.meeseeks` path component.** The guard's `MEESEEKS_DIR_RE` is positional — *any* path
 * segment named `.meeseeks`, at any depth — so `~/.meeseeks/runs/1234.json` inherits the protection
 * that already covers a repository's own state directory. No new guard rule and nothing new to
 * remember, which matters: §6 records that enumeration was the original defect, and a register the
 * guard had to be told about separately would be that defect's second chance.
 *
 * ## Registration is best-effort; reading it is not
 *
 * A Driver that cannot write its entry logs and continues, because a home directory that is
 * read-only is an operator's problem rather than a security event, and refusing to start would turn
 * a permissions quirk into an outage.
 *
 * **One measured caveat, recorded rather than defended against.** `mkdirSync` is synchronous, and on
 * a pathological path it can *block* rather than fail: measured on WSL, a target under `/proc`
 * never returns. A synchronous filesystem call cannot be given a deadline, so there is nothing to
 * add here — what there is instead is the honest statement that `HOME` pointing somewhere
 * pathological hangs registration, and that no realistic home does this. It was found by a fixture
 * that chose such a path to be "unwritable", hung the whole suite, and taught the lesson that
 * unwritable-in-the-abstract is not unwritable the way an operator's home is. A Driver that cannot *read* the register reports **unknown**
 * rather than empty — an unreadable register is not evidence that nothing is running, and §4's rule
 * applies here exactly as it does to a gate.
 *
 * ## Entries are pruned by liveness, not by age
 *
 * A run killed with `SIGKILL` writes no farewell, so stale entries are ordinary rather than
 * exceptional. Age would be the wrong test — a legitimate run lasts hours — so an entry is stale
 * when its pid is no longer running. That check is injected for the same reason everything here is:
 * a test cannot stage a dead pid it does not control.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** The register's location beneath the operator's home directory. */
export const REGISTRY_SEGMENTS = ['.meeseeks', 'runs'];

/** @param {string} home @returns {string} */
export function registryDir(home) {
  return path.join(home, ...REGISTRY_SEGMENTS);
}

/**
 * @typedef {{ pid: number, depth: number, startedAt: string, root: string }} RunEntry
 */

/**
 * Record this Driver as running.
 *
 * @param {{ home: string, pid: number, depth: number, startedAt: string, root: string,
 *   log?: (line: string) => void }} run
 * @returns {boolean} whether the entry was written
 */
export function registerRun(run) {
  const dir = registryDir(run.home);
  try {
    mkdirSync(dir, { recursive: true });
    // Written whole rather than appended to a shared file: two runs starting at once must not have
    // to agree about anything, and a per-pid file makes concurrent registration a non-event.
    writeFileSync(
      path.join(dir, `${run.pid}.json`),
      `${JSON.stringify({ pid: run.pid, depth: run.depth, startedAt: run.startedAt, root: run.root }, null, 2)}\n`,
      'utf8',
    );
    return true;
  } catch (error) {
    // Best-effort, and said out loud. A read-only home is an operator's problem; refusing to start
    // would turn a permissions quirk into an outage, and the ancestry check degrades to reporting
    // what it can see rather than to reporting something false.
    run.log?.(
      `could not register this run at ${dir} (${error instanceof Error ? error.message : error}), so a nested run ` +
        'started from inside it may not be recognised by ancestry',
    );
    return false;
  }
}

/**
 * Remove this Driver's entry.
 *
 * @param {{ home: string, pid: number }} run
 */
export function deregisterRun(run) {
  try {
    rmSync(path.join(registryDir(run.home), `${run.pid}.json`), { force: true });
  } catch {
    // A run that cannot clean up after itself leaves a stale entry, and a stale entry is pruned by
    // liveness on the next read. There is nothing to report and nothing to fail.
  }
}

/**
 * @typedef {{ known: false } | { known: true, runs: RunEntry[] }} RegistryView
 */

/**
 * Every live registered run.
 *
 * @param {{ home: string, alive: (pid: number) => boolean }} options
 * @returns {RegistryView}
 */
export function readRegistry(options) {
  const dir = registryDir(options.home);
  // An absent register is a genuine "nothing is running" — the first run on a machine has not
  // created it yet. That is different from one that exists and cannot be read.
  if (!existsSync(dir)) return { known: true, runs: [] };

  /** @type {string[]} */
  let files;
  try {
    files = readdirSync(dir);
  } catch {
    return { known: false };
  }

  /** @type {RunEntry[]} */
  const runs = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    /** @type {unknown} */
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
    } catch {
      // One unreadable entry is not the whole register. It is skipped rather than fataling, and it
      // is skipped rather than counted: an entry nobody can read authorizes nothing.
      continue;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) continue;
    const entry = /** @type {Record<string, unknown>} */ (parsed);
    if (typeof entry.pid !== 'number' || !Number.isInteger(entry.pid) || entry.pid <= 0) continue;
    if (typeof entry.depth !== 'number' || !Number.isInteger(entry.depth) || entry.depth < 0) continue;
    // Pruned by liveness rather than by age. A run killed with SIGKILL writes no farewell, and a
    // legitimate run lasts hours — so "old" is not the question, "still there" is.
    if (!options.alive(entry.pid)) {
      try {
        rmSync(path.join(dir, file), { force: true });
      } catch {
        // Losing the prune costs nothing: the liveness check above already excluded it.
      }
      continue;
    }
    runs.push({
      pid: entry.pid,
      depth: entry.depth,
      startedAt: typeof entry.startedAt === 'string' ? entry.startedAt : '',
      root: typeof entry.root === 'string' ? entry.root : '',
    });
  }
  return { known: true, runs };
}

/**
 * A lookup of registered depth by pid, for {@link import('./ancestry.mjs').depthFromAncestry}.
 *
 * @param {RegistryView} view
 * @returns {(pid: number) => number | null}
 */
export function depthLookup(view) {
  if (!view.known) return () => null;
  const byPid = new Map(view.runs.map((run) => [run.pid, run.depth]));
  return (pid) => byPid.get(pid) ?? null;
}
