/**
 * The run lock — one driver per repository (DESIGN.md §3.5).
 *
 * Found by being bitten on 13 August 2026. `ps` showed three driver processes, two of them
 * with the same `cwd`: run 14 had been sent SIGTERM and had not died, and run 15 launched into
 * the same tree anyway. Two independent drivers were then mutating one repository, each able to
 * `git reset --hard` it, rewrite `.meeseeks/` and commit over the other. Run 15's result was void.
 *
 * §13.6's re-entrancy guard does not cover this and was never meant to: it refuses a *nested*
 * run, a builder invoking the slash command. Two operators — or one operator twice — starting
 * independent drivers on one directory is a different failure and nothing looked for it.
 *
 * The lock lives under `.meeseeks/`, so §6's positional rule already protects it: a process marked
 * `MEESEEKS_RUNNING` may not write anything there at any depth, which means a builder cannot forge
 * or clear it. Outside a run it is an ordinary file the operator may delete, and the refusal
 * message says so by name — a lock nobody can clear is a repository nobody can use.
 */

import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** The lock's filename inside `.meeseeks/`. */
export const RUN_LOCK_FILE = 'lock.json';

/** @typedef {{ pid: number, startedAt: string }} RunLock */

/**
 * Who currently holds the repository, or `null` when nobody does.
 *
 * **Throws rather than returning null on a lock it cannot read.** The two answers are not
 * interchangeable: a file that will not parse is not evidence that nobody holds a lock, and
 * reporting the repository free on unreadable evidence is the shape of defect this project
 * keeps finding. The caller turns the throw into a refusal naming the file to delete.
 *
 * @param {string} meeseeksDir
 * @returns {RunLock | null}
 */
export function readRunLock(meeseeksDir) {
  const file = path.join(meeseeksDir, RUN_LOCK_FILE);
  if (!existsSync(file)) return null;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(
      `${path.join('.meeseeks', RUN_LOCK_FILE)} exists but could not be read as JSON ` +
        `(${/** @type {Error} */ (error).message}). It records which driver owns this repository, ` +
        'so a run cannot safely start while it is unreadable. Delete it if no driver is running.',
      { cause: error },
    );
  }
  if (typeof parsed?.pid !== 'number' || !Number.isInteger(parsed.pid)) {
    throw new Error(
      `${path.join('.meeseeks', RUN_LOCK_FILE)} has no usable pid, so it cannot say whether a driver ` +
        'is still running. Delete it if none is.',
    );
  }
  return { pid: parsed.pid, startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : '' };
}

/**
 * Record that this process owns the repository.
 *
 * Replaces an existing lock rather than refusing one. Whether taking over is *allowed* is
 * preflight's decision; putting the policy here as well would put it in two places, and the
 * two would eventually disagree.
 *
 * Written through a temporary file and renamed, so a reader never sees a half-written lock.
 *
 * @param {string} meeseeksDir
 * @param {RunLock} lock
 * @returns {void}
 */
export function claimRunLock(meeseeksDir, lock) {
  const file = path.join(meeseeksDir, RUN_LOCK_FILE);
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
  renameSync(temporary, file);
}

/**
 * Release the repository.
 *
 * Silent when there is nothing to clear: a driver that died before claiming still runs its
 * exit path, and an exception thrown while cleaning up would replace the real reason the run
 * ended with a complaint about housekeeping.
 *
 * @param {string} meeseeksDir
 * @returns {void}
 */
export function clearRunLock(meeseeksDir) {
  rmSync(path.join(meeseeksDir, RUN_LOCK_FILE), { force: true });
}

/**
 * Is that process still there?
 *
 * Signal 0 performs the permission and existence checks without delivering anything. `EPERM`
 * means the process exists and belongs to somebody else, which still counts as alive — the
 * question is whether something is running, not whether we could kill it.
 *
 * @param {number} pid
 * @returns {boolean}
 */
export function pidIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return /** @type {{ code?: string }} */ (error).code === 'EPERM';
  }
}
