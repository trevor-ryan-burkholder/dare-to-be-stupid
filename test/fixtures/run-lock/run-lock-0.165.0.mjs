/**
 * The run lock exactly as version 0.165.0 shipped it, kept as a fixture (REVIEW F39).
 *
 * **Committed verbatim from `git show e38ac8e:scripts/run-lock.mjs`, and not to be repaired.** It is
 * the *other side* of a mixed-version race: a plugin is installed into a version-keyed cache
 * directory, so a machine that has not updated keeps running this code against the same repository
 * a current driver reclaims. Its takeover claim is an anonymous **directory**, which is the whole of
 * F34 and the reason F39's deletion-of-an-unidentified-replacement mattered — a current contender
 * that deleted this claim would let both drivers reclaim one stale lock.
 *
 * Reconstructing this from memory in the test would have been the mistake `AGENTS.md` names about
 * reporter fixtures: an approximation of another program's behaviour proves things about the
 * approximation. This is the real bytes.
 */

import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** The lock's filename inside `.meeseeks/`. */
export const RUN_LOCK_FILE = 'lock.json';

/** @typedef {{ pid: number, startedAt: string, token: string }} RunLock */

/**
 * The result of trying to take the repository.
 *
 * A discriminated union rather than a nullable lock, because the caller must print *why* it was
 * refused — "some other driver has it" and "the file on disk is gibberish" need different fixes.
 *
 * @typedef {{ ok: true, lock: RunLock } | { ok: false, detail: string, fix: string }} Acquisition
 */

/** @param {string} meeseeksDir @returns {string} */
function lockFile(meeseeksDir) {
  return path.join(meeseeksDir, RUN_LOCK_FILE);
}

/** How the lock is named in operator-facing text: the path they would delete. */
const lockName = path.join('.meeseeks', RUN_LOCK_FILE);

/**
 * Who currently holds the repository, or `null` when nobody does.
 *
 * **Throws rather than returning null on a lock it cannot read.** The two answers are not
 * interchangeable: a file that will not parse is not evidence that nobody holds a lock, and
 * reporting the repository free on unreadable evidence is the shape of defect this project
 * keeps finding. The caller turns the throw into a refusal naming the file to delete.
 *
 * **The owner token is required, not optional.** It is what makes "only the owner may clear it"
 * enforceable, so a lock without one cannot be reasoned about: it cannot be released safely and it
 * cannot be reclaimed safely. The only file that can be in that state is one written by a driver
 * before 0.165.0, which by definition is not running any more — so refusing and naming the file is
 * the cheap error, exactly as it is for a lock that will not parse.
 *
 * @param {string} meeseeksDir
 * @returns {RunLock | null}
 */
export function readRunLock(meeseeksDir) {
  const file = lockFile(meeseeksDir);
  if (!existsSync(file)) return null;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(
      `${lockName} exists but could not be read as JSON ` +
        `(${/** @type {Error} */ (error).message}). It records which driver owns this repository, ` +
        'so a run cannot safely start while it is unreadable. Delete it if no driver is running.',
      { cause: error },
    );
  }
  if (typeof parsed?.pid !== 'number' || !Number.isInteger(parsed.pid)) {
    throw new Error(
      `${lockName} has no usable pid, so it cannot say whether a driver ` +
        'is still running. Delete it if none is.',
    );
  }
  if (typeof parsed?.token !== 'string' || parsed.token === '') {
    throw new Error(
      `${lockName} carries no owner token, so nothing can prove who is allowed to clear it. ` +
        'A driver before 0.165.0 wrote it and is no longer running. Delete it.',
    );
  }
  return {
    pid: parsed.pid,
    startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : '',
    token: parsed.token,
  };
}

/**
 * Create the lock file, or say that somebody got there first.
 *
 * `wx` is `O_CREAT | O_EXCL`: the kernel creates the file for exactly one caller and hands every
 * other one `EEXIST`. This is the whole exclusion mechanism, and it is deliberately the *only*
 * way to win — there is no path in this module that writes the lock over an existing one.
 *
 * @param {string} meeseeksDir
 * @param {RunLock} lock
 * @returns {boolean} true when this call created it
 */
function createLockExclusively(meeseeksDir, lock) {
  try {
    writeFileSync(lockFile(meeseeksDir), `${JSON.stringify(lock, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    return true;
  } catch (error) {
    if (/** @type {{ code?: string }} */ (error).code === 'EEXIST') return false;
    throw error;
  }
}

/**
 * @param {string} detail
 * @param {string} fix
 * @returns {Acquisition}
 */
function refused(detail, fix) {
  return { ok: false, detail, fix };
}

/** @param {RunLock} lock @returns {string} */
function describeHolder(lock) {
  return `driver pid ${lock.pid}${lock.startedAt === '' ? '' : `, started ${lock.startedAt}`}`;
}

/**
 * The directory whose creation authorises reclaiming one specific stale lock.
 *
 * Named from the stale lock's own token, so it is single-use: a takeover that dies half way leaves
 * an empty directory that can never block a later one, because the next stale lock is a different
 * token. Empty directories are also invisible to git — nothing tracks a directory — so an orphan
 * cannot be swept into a commit the way five previous `.meeseeks/` artifacts were.
 *
 * Exported because it names a real artifact this module can leave under `.meeseeks/`, and because
 * the property worth testing — that a takeover already in flight refuses rather than racing — can
 * only be set up by a caller that can name it. The token is hashed rather than used directly: it
 * arrives from a file on disk, and a token of `../../somewhere` would otherwise be a path.
 *
 * @param {string} meeseeksDir
 * @param {string} staleToken
 * @returns {string}
 */
export function takeoverLockPath(meeseeksDir, staleToken) {
  const digest = createHash('sha256').update(staleToken).digest('hex').slice(0, 32);
  return path.join(meeseeksDir, `${RUN_LOCK_FILE}.takeover-${digest}`);
}

/**
 * Take the repository, or explain who has it.
 *
 * Winning is one atomic operation and nothing else. Everything below the first line is the
 * recovery story: reading who holds it, refusing a live owner, and — only for a dead one — the
 * serialized retry that reclaims it.
 *
 * The options exist for tests and for a caller that wants to supply its own clock; `pid`,
 * `startedAt` and `token` all default to this process's real answer, and the token defaults to a
 * fresh UUID because a reused one would let a previous run's release delete this run's lock.
 *
 * @param {string} meeseeksDir
 * @param {{ pid?: number, startedAt?: string, token?: string, isAlive?: (pid: number) => boolean }} [options]
 * @returns {Acquisition}
 */
export function acquireRunLock(meeseeksDir, options = {}) {
  const isAlive = options.isAlive ?? pidIsAlive;
  /** @type {RunLock} */
  const mine = {
    pid: options.pid ?? process.pid,
    startedAt: options.startedAt ?? new Date().toISOString(),
    token: options.token ?? randomUUID(),
  };
  // The state directory is the lock's home, and a first run on a fresh target reaches here before
  // anything else has had a reason to create it.
  mkdirSync(meeseeksDir, { recursive: true });

  if (createLockExclusively(meeseeksDir, mine)) return { ok: true, lock: mine };

  /** @type {RunLock | null} */
  let held;
  try {
    held = readRunLock(meeseeksDir);
  } catch (error) {
    return refused(/** @type {Error} */ (error).message, `Delete ${lockName} if no driver is running.`);
  }
  // Released between the create and the read — the previous owner finished in that window. One
  // retry, and a second `EEXIST` is somebody else winning rather than a reason to try harder.
  if (held === null) {
    return createLockExclusively(meeseeksDir, mine)
      ? { ok: true, lock: mine }
      : refused(
          'another driver claimed this repository first',
          `Wait for it to finish, or delete ${lockName} if no driver is running.`,
        );
  }
  if (isAlive(held.pid)) {
    return refused(
      `${describeHolder(held)} is still running against this repository`,
      'Wait for it, or stop it and check the kill took — SIGTERM has failed to stop a driver here and -9 did. ' +
        `Then delete ${lockName} if it remains.`,
    );
  }

  // Stale: the recorded owner is gone. Reclaiming it is a *retry*, and the retry is serialized, so
  // that two contenders reading the same dead lock cannot each remove it and each create their own.
  const takeover = takeoverLockPath(meeseeksDir, held.token);
  try {
    mkdirSync(takeover);
  } catch (error) {
    if (/** @type {{ code?: string }} */ (error).code === 'EEXIST') {
      return refused(
        `another driver is already reclaiming the stale lock left by ${describeHolder(held)}`,
        `Wait for it to finish, or delete ${lockName} if no driver is running.`,
      );
    }
    throw error;
  }
  try {
    // Re-read inside the takeover, because winning the directory says nothing about what happened
    // before it: a contender that reclaimed this same stale lock, released the takeover and is now
    // running would otherwise have its live lock deleted by a straggler. Only the exact file
    // established stale is removed, and anything else refuses.
    /** @type {RunLock | null} */
    let current;
    try {
      current = readRunLock(meeseeksDir);
    } catch (error) {
      return refused(/** @type {Error} */ (error).message, `Delete ${lockName} if no driver is running.`);
    }
    if (current === null) {
      return createLockExclusively(meeseeksDir, mine)
        ? { ok: true, lock: mine }
        : refused(
            'another driver claimed this repository first',
            `Wait for it to finish, or delete ${lockName} if no driver is running.`,
          );
    }
    if (current.token !== held.token) {
      return refused(
        `${describeHolder(current)} reclaimed this repository first`,
        `Wait for it to finish, or delete ${lockName} if no driver is running.`,
      );
    }
    rmSync(lockFile(meeseeksDir), { force: true });
    return createLockExclusively(meeseeksDir, mine)
      ? { ok: true, lock: mine }
      : refused(
          'another driver claimed this repository first',
          `Wait for it to finish, or delete ${lockName} if no driver is running.`,
        );
  } finally {
    // Safe to drop, because a later winner of this same directory re-reads and refuses rather than
    // removing whatever is there. Left behind on a crash it is an empty directory git never sees.
    rmSync(takeover, { recursive: true, force: true });
  }
}

/**
 * Release the repository — but only if this token is what is actually holding it.
 *
 * Silent when there is nothing to clear, and silent when the lock belongs to somebody else. A
 * driver that died before acquiring still runs its exit path, an aborting contender still unwinds,
 * and neither may remove the lock of the run that won. An exception thrown while cleaning up would
 * also replace the real reason the run ended with a complaint about housekeeping, so nothing in
 * here throws.
 *
 * @param {string} meeseeksDir
 * @param {string} token the token from this run's own `acquireRunLock`
 * @returns {boolean} true when this call removed the lock
 */
export function releaseRunLock(meeseeksDir, token) {
  /** @type {RunLock | null} */
  let held;
  try {
    held = readRunLock(meeseeksDir);
  } catch {
    // Unreadable, and therefore not provably ours. Deleting it would be the exact move this
    // module refuses everywhere else.
    return false;
  }
  if (held === null || held.token !== token) return false;
  try {
    rmSync(lockFile(meeseeksDir), { force: true });
  } catch {
    return false;
  }
  return true;
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
