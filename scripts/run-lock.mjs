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
 *
 * **The first version of this file did not actually exclude anybody, and that is REVIEW F1.**
 * It read the lock in one call and overwrote it in another, so two contenders that both observed
 * an absent lock both "claimed" it and the second silently replaced the first. Winning is now one
 * atomic filesystem operation — an exclusive create, `O_CREAT|O_EXCL`, which the kernel resolves
 * for exactly one caller — and everything else in here exists to keep the two recovery paths from
 * reopening that hole:
 *
 * - **Stale recovery is an explicit retry, never part of the claim.** A lock is reclaimed only
 *   after its recorded owner has been established dead, and only by the one contender that wins a
 *   second atomic operation first — an exclusive create of the takeover claim, `mkdir` before
 *   0.182.0. Without that serialization two
 *   contenders reading the same dead lock would each remove it and each create their own, which is
 *   the original defect wearing a different hat.
 * - **Only the owner may clear it.** Each acquisition carries a unique token; `releaseRunLock`
 *   removes the file only when the token on disk is the one it was handed. A contender that lost,
 *   or a run that aborted before winning, therefore cannot delete the winner's lock.
 *
 * Nothing here defaults to free: an unreadable lock, a lock with no owner token, a lost race and a
 * takeover somebody else finished first all refuse the run and name the file to delete.
 *
 * **The takeover claim was itself unreclaimable, and that is REVIEW F34.** It was a bare directory
 * named from the *stale* lock's token, and F1's argument for why an orphan was harmless — "the next
 * stale lock is a different token, so the name never recurs" — assumed the stale lock always gets
 * replaced. Kill a reclaimer between winning the directory and replacing the lock and neither
 * happens: the same stale token stays on disk, every later contender computes the same path, gets
 * `EEXIST`, and reads it as a live reclaimer. Measured: one `kill -9` and three successive cohorts
 * were all refused while no driver was running anywhere. A recoverable stale lock became a
 * permanent denial of service needing manual filesystem repair.
 *
 * So the claim now carries the same thing the lock carries — **an owner identity with a liveness
 * rule** — and the recovery is symmetric with the lock's own:
 *
 * - The claim is a *file* created with the same exclusive `wx` primitive, holding the reclaimer's
 *   pid and token. Winning it is still one atomic operation, so serialization is unchanged.
 * - A claim whose recorded pid is **dead** is abandoned, and is swept by an atomic `rename` that
 *   exactly one contender can win — the sweep needs its own arbitration or it is the original
 *   defect a third time. The sweeper then retries the whole acquisition.
 * - **Only the owner may clear it**, exactly as for the lock. The old code dropped the directory
 *   unconditionally on the way out, which with a reclaimable claim would let a slow straggler
 *   delete the claim of the contender that replaced it.
 *
 * Two states stay refusals rather than becoming sweeps, and the refusals name the path: a claim
 * file that will not parse (the microsecond window between creating it and writing it, so it may
 * belong to something alive), and a *directory* at the claim path, which only a driver before
 * 0.182.0 can have written and which may still be a live reclaimer of that older version.
 */

import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** The lock's filename inside `.meeseeks/`. */
export const RUN_LOCK_FILE = 'lock.json';

/** @typedef {{ pid: number, startedAt: string, token: string }} RunLock */

/**
 * Who is currently reclaiming one specific stale lock (REVIEW F34).
 *
 * The same three fields as the lock, for the same three reasons: `pid` answers whether the claim is
 * abandoned, `token` answers whether a claim is *ours* to clear, and `startedAt` is what an operator
 * reads when deciding whether to intervene.
 *
 * @typedef {{ pid: number, startedAt: string, token: string }} TakeoverClaim
 */

/**
 * How many times acquisition may sweep an abandoned claim and try again.
 *
 * Each pass either wins, refuses, or removes exactly one abandoned claim, and abandoned claims are
 * finite — so this is a backstop against a pathology rather than an expected retry count. Running
 * out is a refusal, because "I gave up looking" is not evidence the repository is free.
 */
const TAKEOVER_ATTEMPTS = 4;

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
 * The file whose exclusive creation authorises reclaiming one specific stale lock.
 *
 * Named from the stale lock's own token, so it is scoped to one stale generation: a claim for some
 * *other* dead owner must never block this reclaim. That much was always true. What was not is the
 * part F34 found — the name recurs for as long as the stale lock does, so "the next stale lock is a
 * different token" is only an argument about claims that got cleaned up, and says nothing about the
 * one left by a reclaimer that died before replacing the lock. The contents are what answer that
 * now; see `readTakeoverClaim`.
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
 * Create the takeover claim, or say that somebody got there first.
 *
 * The same `wx` primitive as the lock, and for the same reason: the kernel resolves it for exactly
 * one caller. A directory would serialize just as well, which is what this used to be — but a
 * directory cannot say *who* holds it, and F34 is entirely about that missing sentence.
 *
 * Exported for the same reason `takeoverLockPath` is, and it is the stronger of the two reasons: a
 * test that must arrange a *genuine* abandoned claim has to write one the way production writes one.
 * Hand-rolling the JSON in a fixture would make the test agree with a remembered format rather than
 * with this function, and it would keep agreeing after the format changed.
 *
 * @param {string} meeseeksDir
 * @param {string} staleToken the token of the lock being reclaimed
 * @param {TakeoverClaim} claim
 * @returns {boolean} true when this call created it
 */
export function claimTakeover(meeseeksDir, staleToken, claim) {
  return createTakeoverExclusively(takeoverLockPath(meeseeksDir, staleToken), claim);
}

/**
 * @param {string} file
 * @param {TakeoverClaim} claim
 * @returns {boolean} true when this call created it
 */
function createTakeoverExclusively(file, claim) {
  try {
    writeFileSync(file, `${JSON.stringify(claim, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    return true;
  } catch (error) {
    if (/** @type {{ code?: string }} */ (error).code === 'EEXIST') return false;
    throw error;
  }
}

/**
 * Who is reclaiming, from a claim that already exists.
 *
 * **Throws rather than guessing**, on the same argument as `readRunLock`: a claim that will not
 * parse is not evidence that nobody is reclaiming. Two shapes reach this and both are refusals the
 * caller names a path for:
 *
 * - A **directory**, which only a driver before 0.182.0 can have written. It may still be a live
 *   reclaimer of that version, and there is nothing in it to prove otherwise.
 * - A **file that will not parse**, which is the microsecond between the exclusive create and the
 *   write landing. Sweeping that would be sweeping something that is probably alive, and two live
 *   reclaimers is the defect the serialization exists to prevent.
 *
 * Neither is the failure F34 reported: a crashed reclaimer leaves a *complete* claim naming a pid
 * that is gone, and that one is swept without asking anybody.
 *
 * @param {string} file
 * @param {string} shown how to name the file in operator-facing text
 * @returns {{ state: 'gone' } | { state: 'nameless' } | { state: 'held', claim: TakeoverClaim }}
 *   `gone` and `nameless` are different facts and the caller does different things with them: a
 *   claim that vanished may mean the repository is free, while an empty one still occupies the path
 *   and has to be swept or it blocks every later contender forever.
 */
function readTakeoverClaim(file, shown) {
  /** @type {import('node:fs').Stats} */
  let stats;
  try {
    stats = lstatSync(file);
  } catch {
    // Swept or released between the failed create and this read. Not an error and not a refusal:
    // the repository may be free now, so the caller looks again.
    return { state: 'gone' };
  }
  if (stats.isDirectory()) {
    throw new Error(
      `${shown} is a directory. A driver before 0.182.0 was reclaiming this repository's stale lock and could ` +
        'not record which process it was, so nothing here can say whether that driver is still running. ' +
        'Delete it if none is.',
    );
  }
  const raw = readFileSync(file, 'utf8');
  // **Empty is a crash, not corruption, and the difference decides whether this is recoverable.**
  // The claim is created and written by one synchronous `writeFileSync`, so a zero-length claim can
  // only be a process that died between the two — a process that is therefore gone. Refusing it
  // would be a fresh permanent denial of service of exactly the shape F34 reported, reachable by
  // the very window this repair introduced. A non-empty file that will not parse is different: it
  // is damage nobody here can explain, and guessing about it is how evidence gets laundered.
  if (raw.trim() === '') return { state: 'nameless' };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `${shown} exists but could not be read as JSON (${/** @type {Error} */ (error).message}). It records which ` +
        'driver is reclaiming this repository, so a run cannot safely start while it is unreadable. Delete it if ' +
        'no driver is running.',
      { cause: error },
    );
  }
  if (typeof parsed?.pid !== 'number' || !Number.isInteger(parsed.pid) || typeof parsed?.token !== 'string' || parsed.token === '') {
    throw new Error(
      `${shown} does not name the driver that is reclaiming this repository, so nothing can say whether that ` +
        'driver is still running. Delete it if none is.',
    );
  }
  return {
    state: 'held',
    claim: {
      pid: parsed.pid,
      startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : '',
      token: parsed.token,
    },
  };
}

/**
 * Remove an abandoned claim, if this contender is the one that gets to.
 *
 * **The sweep needs its own arbitration.** Several contenders can read the same dead claim in the
 * same instant, and if each simply deleted it they would each go on to reclaim — which is F1 for the
 * third time, one level down. `rename` is atomic and the source can only be moved once, so exactly
 * one caller succeeds and the rest are told to look again. The destination carries the sweeper's own
 * token so two sweepers never aim at one name.
 *
 * **And it must check what it actually moved, which the first version of this repair did not.**
 * `rename` names a *path*, not the file that was read from it. Between deciding a claim is abandoned
 * and moving it, another contender can sweep the same claim and create its own — so the rename lands
 * on a **live** claim, its owner is displaced without knowing, and two reclaimers proceed against one
 * stale lock. That is the double-take the whole module exists to prevent, reintroduced by its own
 * recovery path; three independent reviewers of the repair found it before it was committed.
 *
 * Moving the file gives a stable handle to the exact bytes that were moved, so reading it back
 * settles the question no path-based check can. A mismatch is put back and reported as a loss: this
 * contender then re-reads from scratch rather than proceeding on a judgement it now knows was made
 * about a different file.
 *
 * @param {string} file
 * @param {string} shown how to name the file in operator-facing text
 * @param {string | null} abandonedToken the token of the claim this caller judged abandoned, or
 *   null when it was empty and named nobody — then only an equally nameless file may be removed
 * @param {string} token the sweeping contender's own token
 * @returns {boolean} true when this call removed exactly the claim it judged abandoned
 */
function sweepAbandonedTakeover(file, shown, abandonedToken, token) {
  const swept = `${file}.abandoned-${createHash('sha256').update(token).digest('hex').slice(0, 16)}`;
  try {
    renameSync(file, swept);
  } catch {
    return false;
  }
  /** @type {ReturnType<typeof readTakeoverClaim> | null} */
  let moved = null;
  try {
    moved = readTakeoverClaim(swept, shown);
  } catch {
    // Left null deliberately. See below: an unreadable answer loses arbitration.
  }
  // **Only an exact match is removed** (REVIEW F39). The first version of this guard treated a
  // failed read as a match, on the reasoning that something unreadable here was unreadable in place
  // too. It is not: between the original read and this rename another process can replace the JSON
  // claim with a *pre-0.182.0 takeover directory*, which `readTakeoverClaim` refuses rather than
  // parses — so the failure path deleted a live legacy reclaimer's claim and let both drivers
  // reclaim the same stale lock. Every other outcome, including a read that throws and a file that
  // vanished, loses this pass.
  const isTheOneJudged =
    moved !== null &&
    (abandonedToken === null
      ? moved.state === 'nameless'
      : moved.state === 'held' && moved.claim.token === abandonedToken);
  if (!isTheOneJudged) {
    // Not the claim that was judged abandoned. Put it back and take nothing from this pass.
    try {
      renameSync(swept, file);
    } catch {
      // Could not restore — something already occupies the path. **Quarantined rather than
      // deleted**: what is under `swept` is unidentified, and this contender has no standing to
      // destroy it. It blocks nobody there, and it is named so an operator can see it.
    }
    return false;
  }
  rmSync(swept, { recursive: true, force: true });
  return true;
}

/**
 * Drop the takeover claim — but only if this token is what is actually holding it.
 *
 * Symmetric with `releaseRunLock`, and newly load-bearing. While the claim was an anonymous
 * directory this was an unconditional delete, which was safe only because nothing could ever
 * legitimately replace it. Now a contender that swept an abandoned claim can be holding one of its
 * own by the time a straggler unwinds, and a straggler that deleted it would hand the same stale
 * lock to two reclaimers at once.
 *
 * Nothing in here throws: this runs on the way out of a failed acquisition, and a complaint about
 * housekeeping must not replace the real reason the run ended.
 *
 * Exported for the same reason `releaseRunLock` is, and tested the same way. The window this guard
 * covers — a foreign claim occupying the path while a contender unwinds — cannot be arranged from
 * outside `acquireRunLock`, so a behavioural test can only reach the token-matches branch. Review
 * proved that by mutation: replacing this body with an unconditional remove left both tiers green.
 *
 * @param {string} file
 * @param {string} token
 * @returns {void}
 */
export function releaseTakeoverClaim(file, token) {
  try {
    const held = readTakeoverClaim(file, file);
    if (held.state !== 'held' || held.claim.token !== token) return;
    rmSync(file, { force: true });
  } catch {
    // Gone already, or not provably ours. Either way it is not this contender's to remove.
  }
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

  const lost = () =>
    refused(
      'another driver claimed this repository first',
      `Wait for it to finish, or delete ${lockName} if no driver is running.`,
    );

  // Bounded, because one pass can end by *removing an abandoned claim* rather than by deciding
  // anything (REVIEW F34), and a sweep that is not followed by another attempt would refuse a
  // repository it just finished freeing. Every other outcome returns from inside the loop.
  for (let attempt = 0; attempt < TAKEOVER_ATTEMPTS; attempt += 1) {
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
    if (held === null) return createLockExclusively(meeseeksDir, mine) ? { ok: true, lock: mine } : lost();
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
    const takeoverName = path.join('.meeseeks', path.basename(takeover));
    if (!claimTakeover(meeseeksDir, held.token, { pid: mine.pid, startedAt: mine.startedAt, token: mine.token })) {
      /** @type {ReturnType<typeof readTakeoverClaim>} */
      let reclaimer;
      try {
        reclaimer = readTakeoverClaim(takeover, takeoverName);
      } catch (error) {
        return refused(/** @type {Error} */ (error).message, `Delete ${takeoverName} if no driver is running.`);
      }
      // Swept or released between the failed create and this read; the repository may be free now.
      if (reclaimer.state === 'gone') continue;
      // Empty: created by a process that died before it could write, so it names nobody and is
      // abandoned by construction. It still occupies the path, so it is swept rather than skipped —
      // skipping it would spin until the attempt bound and refuse a repository nothing holds.
      if (reclaimer.state === 'nameless') {
        sweepAbandonedTakeover(takeover, takeoverName, null, mine.token);
        continue;
      }
      // **It may be this contender's own claim, and refusing that is a repository nobody can take.**
      // A claim is created and then verified, and a *different* contender's sweep can rename it away
      // in between. The sweep restores what it finds it did not judge, so the claim comes back owned
      // by whoever made it — while its owner, having read `gone`, looked again. On that next pass the
      // create fails against its own restored claim, and reading it finds a live pid because the
      // live pid is this process. Without the token check the contender refuses *itself*, every
      // other contender refuses the live claim it can see, and the round ends with zero winners and
      // a claim file that blocks the repository until somebody deletes it by hand: the denial of
      // service F34 is about, reached through the repair for F34.
      //
      // Safe because the token is a fresh UUID per acquisition, so a claim carrying it cannot have
      // been written by anybody else. Proceeding is not a second reclaimer, it is the same one
      // continuing — and the reclaim below re-verifies the claim and the lock before touching either.
      //
      // Found by the F34 cohort race failing about one run in ten with every contender refused. The
      // interleaving is rare; the state it leaves is permanent.
      if (reclaimer.claim.token !== mine.token) {
        if (isAlive(reclaimer.claim.pid)) {
          return refused(
            `another driver is already reclaiming the stale lock left by ${describeHolder(held)}: ` +
              `${describeHolder(reclaimer.claim)} holds ${takeoverName}`,
            `Wait for it to finish, or delete ${takeoverName} and ${lockName} if no driver is running.`,
          );
        }
        // **The claim is abandoned too** (REVIEW F34). Its owner died between winning it and
        // replacing the lock, so the stale token — and therefore this exact path — recurs for every
        // later contender. Sweeping is arbitrated in its own right, and whoever loses the sweep
        // looks again rather than refusing: by then the repository may be genuinely free.
        sweepAbandonedTakeover(takeover, takeoverName, reclaimer.claim.token, mine.token);
        continue;
      }
    }
    // **The claim was created; confirm it is still ours before touching the lock.** A contender that
    // judged an earlier claim abandoned can rename this one away in the instant after it appears,
    // and it would then be two reclaimers rather than one against the same stale lock. The sweep
    // puts a displaced claim back, so the check below is what makes that restoration mean something:
    // whichever of the two is not holding the claim on disk stops here.
    try {
      const ours = readTakeoverClaim(takeover, takeoverName);
      if (ours.state !== 'held' || ours.claim.token !== mine.token) continue;
    } catch (error) {
      return refused(/** @type {Error} */ (error).message, `Delete ${takeoverName} if no driver is running.`);
    }
    try {
      // Re-read inside the takeover, because winning the claim says nothing about what happened
      // before it: a contender that reclaimed this same stale lock, released the claim and is now
      // running would otherwise have its live lock deleted by a straggler. Only the exact file
      // established stale is removed, and anything else refuses.
      /** @type {RunLock | null} */
      let current;
      try {
        current = readRunLock(meeseeksDir);
      } catch (error) {
        return refused(/** @type {Error} */ (error).message, `Delete ${lockName} if no driver is running.`);
      }
      if (current === null) return createLockExclusively(meeseeksDir, mine) ? { ok: true, lock: mine } : lost();
      if (current.token !== held.token) {
        return refused(
          `${describeHolder(current)} reclaimed this repository first`,
          `Wait for it to finish, or delete ${lockName} if no driver is running.`,
        );
      }
      rmSync(lockFile(meeseeksDir), { force: true });
      return createLockExclusively(meeseeksDir, mine) ? { ok: true, lock: mine } : lost();
    } finally {
      releaseTakeoverClaim(takeover, mine.token);
    }
  }

  // Every pass swept an abandoned claim and found another one. Nothing here defaults to free.
  return refused(
    `gave up after ${TAKEOVER_ATTEMPTS} attempts to reclaim a stale lock; each one found another abandoned ` +
      'takeover claim, which should not be possible unless something is creating them continuously',
    `Delete ${lockName} and any ${path.join('.meeseeks', `${RUN_LOCK_FILE}.takeover-*`)} if no driver is running.`,
  );
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
