/**
 * Tests for the run lock (DESIGN.md §3.5, REVIEW F1).
 *
 * The defect this exists for was measured, not imagined. On 13 August 2026 `ps` showed three
 * driver processes, two of them with the same `cwd`: run 14 had been sent SIGTERM and had not
 * died, and run 15 launched into the same tree. Two independent drivers were then mutating one
 * repository, each able to `git reset --hard` it, rewrite `.meeseeks/` and commit over the other.
 * Run 15's result was void and nothing could be concluded from its log.
 *
 * §13.6's re-entrancy guard does not cover this. It refuses a *nested* run — a builder invoking
 * the slash command — which is a different thing entirely, and nothing looked for this one.
 *
 * **And the first lock did not lock.** Codex F1: reading the lock and writing it were separate
 * calls, and the write replaced whatever it found, so two contenders that both saw an absent lock
 * both "won". These tests are the single-process half of that repair — the decision logic, the
 * refusals and the ownership rule. The half a single process cannot prove, that the operation is
 * genuinely atomic against a real concurrent one, is `test/integration/run-lock.integration.test.mjs`.
 */

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import {
  RUN_LOCK_FILE,
  acquireRunLock,
  claimTakeover,
  pidIsAlive,
  readRunLock,
  releaseRunLock,
  takeoverLockPath,
} from '../scripts/run-lock.mjs';

/** Real liveness for every pid except the invented dead owner the fixtures install. */
const DEAD_OWNER_PID = 4242;
/** @param {number} pid @returns {boolean} */
const realLiveness = (pid) => pid !== DEAD_OWNER_PID && pidIsAlive(pid);

/** @type {string[]} */
const temporaryDirs = [];

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** @returns {string} a fresh `.meeseeks` directory */
function makeMeeseeksDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-run-lock-'));
  temporaryDirs.push(dir);
  const meeseeksDir = path.join(dir, '.meeseeks');
  mkdirSync(meeseeksDir, { recursive: true });
  return meeseeksDir;
}

/** @param {string} meeseeksDir @returns {string} */
function rawLock(meeseeksDir) {
  return readFileSync(path.join(meeseeksDir, RUN_LOCK_FILE), 'utf8');
}

describe('readRunLock', () => {
  it('returns null when no run has claimed the repository', () => {
    assert.equal(readRunLock(makeMeeseeksDir()), null);
  });

  it('round-trips the pid, start time and owner token it was given', () => {
    const meeseeksDir = makeMeeseeksDir();
    acquireRunLock(meeseeksDir, { pid: 4242, startedAt: '2026-08-13T10:00:00.000Z', token: 'owner-a' });
    assert.deepStrictEqual(readRunLock(meeseeksDir), {
      pid: 4242,
      startedAt: '2026-08-13T10:00:00.000Z',
      token: 'owner-a',
    });
  });

  // Nothing defaults to pass, and that rule has a direction here: a lock that cannot be read
  // is not evidence that nobody holds one. Throwing sends the question to the caller, which
  // refuses the run and tells the operator which file to delete.
  it('throws on a lock it cannot parse, rather than reporting the repository free', () => {
    const meeseeksDir = makeMeeseeksDir();
    writeFileSync(path.join(meeseeksDir, RUN_LOCK_FILE), '{not json', 'utf8');
    assert.throws(() => readRunLock(meeseeksDir), /lock\.json/);
  });

  it('throws on a lock with no usable pid, for the same reason', () => {
    const meeseeksDir = makeMeeseeksDir();
    writeFileSync(path.join(meeseeksDir, RUN_LOCK_FILE), JSON.stringify({ startedAt: 'now', token: 't' }), 'utf8');
    assert.throws(() => readRunLock(meeseeksDir), /pid/);
  });

  // The owner token is what makes "only the owner may clear it" enforceable. A lock without one
  // cannot be released safely or reclaimed safely, so it is refused rather than guessed at.
  it('throws on a lock with no owner token, which is every lock written before 0.165.0', () => {
    const meeseeksDir = makeMeeseeksDir();
    writeFileSync(path.join(meeseeksDir, RUN_LOCK_FILE), JSON.stringify({ pid: 7, startedAt: 'a' }), 'utf8');
    assert.throws(() => readRunLock(meeseeksDir), /token/);
  });

  it('throws on an empty owner token, which is the same missing evidence spelled differently', () => {
    const meeseeksDir = makeMeeseeksDir();
    writeFileSync(path.join(meeseeksDir, RUN_LOCK_FILE), JSON.stringify({ pid: 7, startedAt: 'a', token: '' }), 'utf8');
    assert.throws(() => readRunLock(meeseeksDir), /token/);
  });
});

describe('acquireRunLock takes a free repository', () => {
  it('wins, and writes a lock a second process can read', () => {
    const meeseeksDir = makeMeeseeksDir();
    const acquired = acquireRunLock(meeseeksDir, { pid: 7, startedAt: '2026-08-13T10:00:00.000Z' });
    assert.equal(acquired.ok, true);
    assert.equal(acquired.ok === true ? acquired.lock.pid : -1, 7);
    assert.equal(readRunLock(meeseeksDir)?.pid, 7);
  });

  it('creates the state directory when the target has never held a run', () => {
    // A first run on a fresh target reaches the lock before anything else has had a reason to
    // create `.meeseeks/`, and an ENOENT there would refuse a repository nobody is using.
    const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-run-lock-fresh-'));
    temporaryDirs.push(root);
    const meeseeksDir = path.join(root, '.meeseeks');
    assert.equal(acquireRunLock(meeseeksDir).ok, true);
    assert.equal(existsSync(path.join(meeseeksDir, RUN_LOCK_FILE)), true);
  });

  it('gives every acquisition its own token', () => {
    // Reuse would let one run's release delete another run's lock, which is the ownership rule
    // undone by the mechanism meant to enforce it.
    const first = acquireRunLock(makeMeeseeksDir());
    const second = acquireRunLock(makeMeeseeksDir());
    assert.equal(first.ok && second.ok ? first.lock.token !== second.lock.token : false, true);
  });

  it('records a token that is actually on disk, not only in the returned value', () => {
    const meeseeksDir = makeMeeseeksDir();
    const acquired = acquireRunLock(meeseeksDir);
    assert.equal(acquired.ok === true ? readRunLock(meeseeksDir)?.token : '', acquired.ok === true ? acquired.lock.token : 'x');
  });
});

describe('acquireRunLock refuses a repository somebody else holds', () => {
  it('refuses when the recorded owner is alive, naming the pid and a fix', () => {
    const meeseeksDir = makeMeeseeksDir();
    acquireRunLock(meeseeksDir, { pid: 4242, startedAt: '2026-08-13T10:00:00.000Z', token: 'owner-a' });
    const second = acquireRunLock(meeseeksDir, { pid: 99, isAlive: () => true });
    assert.equal(second.ok, false);
    assert.equal(second.ok === false ? second.detail.includes('4242') : false, true);
    assert.equal(second.ok === false ? second.fix.includes('lock.json') : false, true);
  });

  // The defect itself, in one assertion. The old `claimRunLock` wrote over whatever it found.
  it('leaves the live owner\'s lock exactly as it was', () => {
    const meeseeksDir = makeMeeseeksDir();
    acquireRunLock(meeseeksDir, { pid: 4242, startedAt: '2026-08-13T10:00:00.000Z', token: 'owner-a' });
    const before = rawLock(meeseeksDir);
    acquireRunLock(meeseeksDir, { pid: 99, isAlive: () => true });
    assert.equal(rawLock(meeseeksDir), before);
    assert.equal(readRunLock(meeseeksDir)?.token, 'owner-a');
  });

  it('refuses on a lock it cannot read, rather than taking a repository on unreadable evidence', () => {
    const meeseeksDir = makeMeeseeksDir();
    writeFileSync(path.join(meeseeksDir, RUN_LOCK_FILE), '{not json', 'utf8');
    const refused = acquireRunLock(meeseeksDir, { isAlive: () => false });
    assert.equal(refused.ok, false);
    assert.equal(refused.ok === false ? refused.detail.includes('lock.json') : false, true);
    assert.equal(rawLock(meeseeksDir), '{not json');
  });

  it('refuses a lock with no owner token instead of reclaiming it', () => {
    // Fail closed on missing-required evidence: without a token nothing can prove who may clear
    // it, so taking it would be a guess dressed as a recovery.
    const meeseeksDir = makeMeeseeksDir();
    writeFileSync(path.join(meeseeksDir, RUN_LOCK_FILE), JSON.stringify({ pid: 7, startedAt: 'a' }), 'utf8');
    const refused = acquireRunLock(meeseeksDir, { isAlive: () => false });
    assert.equal(refused.ok, false);
    assert.equal(refused.ok === false ? refused.detail.includes('token') : false, true);
  });
});

describe('acquireRunLock reclaims a stale lock, as an explicit retry', () => {
  it('takes a repository whose recorded driver is gone', () => {
    // A pidfile left by a killed driver must not lock the repository forever. `kill -TERM`
    // failing to stop a driver is exactly how the incident on 13 August started.
    const meeseeksDir = makeMeeseeksDir();
    acquireRunLock(meeseeksDir, { pid: 4242, startedAt: '2026-08-13T10:00:00.000Z', token: 'dead-owner' });
    const reclaimed = acquireRunLock(meeseeksDir, { pid: 99, startedAt: 'b', token: 'new-owner', isAlive: () => false });
    assert.equal(reclaimed.ok, true);
    assert.deepStrictEqual(readRunLock(meeseeksDir), { pid: 99, startedAt: 'b', token: 'new-owner' });
  });

  it('leaves no takeover directory behind after reclaiming', () => {
    const meeseeksDir = makeMeeseeksDir();
    acquireRunLock(meeseeksDir, { pid: 4242, startedAt: 'a', token: 'dead-owner' });
    acquireRunLock(meeseeksDir, { pid: 99, token: 'new-owner', isAlive: () => false });
    assert.equal(existsSync(takeoverLockPath(meeseeksDir, 'dead-owner')), false);
  });

  it('refuses when a live contender is already reclaiming that same stale lock', () => {
    // The serialization, without which two contenders reading one dead lock would each remove it
    // and each create their own -- the original defect wearing a different hat.
    //
    // **The claim is written by production code and names a process that is genuinely running**
    // (REVIEW F34). This case used to `mkdirSync` the path and assert the refusal mentioned
    // "reclaiming", which after 0.182.0 it still would -- from the *legacy directory* branch, about
    // a driver from an older version. It would have gone on passing while proving nothing about a
    // live reclaimer, which is the shape of test that let F34 through in the first place.
    const meeseeksDir = makeMeeseeksDir();
    acquireRunLock(meeseeksDir, { pid: DEAD_OWNER_PID, startedAt: 'a', token: 'dead-owner' });
    claimTakeover(meeseeksDir, 'dead-owner', { pid: process.pid, startedAt: 'b', token: 'a-live-reclaimer' });
    const refused = acquireRunLock(meeseeksDir, { pid: 99, isAlive: realLiveness });
    assert.equal(refused.ok, false);
    assert.equal(refused.ok === false ? refused.detail.includes('already reclaiming') : false, true);
    assert.equal(
      refused.ok === false ? refused.detail.includes(`driver pid ${process.pid}`) : false,
      true,
      'the refusal must name the process that is holding the claim, or the operator cannot check it',
    );
    // And it took nothing while refusing.
    assert.equal(readRunLock(meeseeksDir)?.token, 'dead-owner');
    assert.equal(existsSync(takeoverLockPath(meeseeksDir, 'dead-owner')), true, 'a live claim was cleared');
  });

  // The benign neighbour. Refusing every takeover is not passing: a claim for some *other* dead
  // owner is scoped to a stale generation this contender is not reclaiming, so it must block
  // nothing. (The original rationale here — that an orphan's token "never appears again" — is the
  // reasoning REVIEW F34 disproved for the *same* token; it is only true across generations.)
  it('is not blocked by an orphaned takeover claim for some other stale lock', () => {
    const meeseeksDir = makeMeeseeksDir();
    acquireRunLock(meeseeksDir, { pid: 4242, startedAt: 'a', token: 'dead-owner' });
    mkdirSync(takeoverLockPath(meeseeksDir, 'a-token-from-some-older-run'));
    const reclaimed = acquireRunLock(meeseeksDir, { pid: 99, token: 'new-owner', isAlive: () => false });
    assert.equal(reclaimed.ok, true);
    assert.equal(readRunLock(meeseeksDir)?.token, 'new-owner');
  });

  it('refuses rather than removing a lock that changed hands while the takeover was being won', () => {
    // Inside the takeover the lock is read *again*, because winning the takeover directory says
    // nothing about what happened before it. Without that second read, a straggler would delete
    // the lock of the driver that reclaimed the repository first and is now running.
    //
    // `isAlive` is the seam that makes the race deterministic: it is consulted after the first
    // read and before the takeover, so a side effect there lands in exactly the window under
    // test. Nothing in production passes a function like this; the window is real, the
    // reproduction is arranged.
    const meeseeksDir = makeMeeseeksDir();
    acquireRunLock(meeseeksDir, { pid: 4242, startedAt: 'a', token: 'dead-owner' });
    const reclaimedByAnother = () => {
      writeFileSync(
        path.join(meeseeksDir, RUN_LOCK_FILE),
        JSON.stringify({ pid: 500, startedAt: 'b', token: 'the-reclaimer' }),
        'utf8',
      );
      return false;
    };
    const straggler = acquireRunLock(meeseeksDir, { pid: 1000, isAlive: reclaimedByAnother });
    assert.equal(straggler.ok, false);
    assert.equal(straggler.ok === false ? straggler.detail.includes('reclaimed this repository first') : false, true);
    assert.equal(readRunLock(meeseeksDir)?.token, 'the-reclaimer');
  });

  it('still refuses a live owner when a takeover directory happens to exist', () => {
    // Staleness is established before any takeover is attempted, and a live pid ends the
    // question. An orphaned directory is not permission to touch a lock somebody is holding.
    const meeseeksDir = makeMeeseeksDir();
    acquireRunLock(meeseeksDir, { pid: 4242, startedAt: 'a', token: 'live-owner' });
    mkdirSync(takeoverLockPath(meeseeksDir, 'live-owner'));
    assert.equal(acquireRunLock(meeseeksDir, { isAlive: () => true }).ok, false);
    assert.equal(readRunLock(meeseeksDir)?.token, 'live-owner');
  });
});

describe('releaseRunLock lets only the owner give the repository back', () => {
  it('clears the lock when the token matches, so the next run finds the repository free', () => {
    const meeseeksDir = makeMeeseeksDir();
    const acquired = acquireRunLock(meeseeksDir, { pid: 9, startedAt: 'a' });
    assert.equal(releaseRunLock(meeseeksDir, acquired.ok === true ? acquired.lock.token : 'x'), true);
    assert.equal(readRunLock(meeseeksDir), null);
  });

  // F1's fourth acceptance line: a process that did not acquire the lock cannot clear another
  // process's lock. An aborting loser runs its exit path exactly as a winner does.
  it('refuses to clear a lock some other owner holds, and leaves the file intact', () => {
    const meeseeksDir = makeMeeseeksDir();
    acquireRunLock(meeseeksDir, { pid: 9, startedAt: 'a', token: 'the-winner' });
    const before = rawLock(meeseeksDir);
    assert.equal(releaseRunLock(meeseeksDir, 'the-loser'), false);
    assert.equal(rawLock(meeseeksDir), before);
    assert.equal(readRunLock(meeseeksDir)?.token, 'the-winner');
  });

  it('clears a lock that is not there without complaining', () => {
    // A driver that died before acquiring still runs its exit path, and an exception thrown
    // while cleaning up would replace the real reason a run ended.
    const meeseeksDir = makeMeeseeksDir();
    assert.equal(releaseRunLock(meeseeksDir, 'whatever'), false);
    assert.equal(readRunLock(meeseeksDir), null);
  });

  it('leaves an unreadable lock alone instead of throwing or deleting it', () => {
    const meeseeksDir = makeMeeseeksDir();
    writeFileSync(path.join(meeseeksDir, RUN_LOCK_FILE), '{not json', 'utf8');
    assert.equal(releaseRunLock(meeseeksDir, 'whatever'), false);
    assert.equal(rawLock(meeseeksDir), '{not json');
  });

  it('lets the repository be taken again after its owner gives it back', () => {
    const meeseeksDir = makeMeeseeksDir();
    const first = acquireRunLock(meeseeksDir, { pid: 1, startedAt: 'a' });
    releaseRunLock(meeseeksDir, first.ok === true ? first.lock.token : 'x');
    const second = acquireRunLock(meeseeksDir, { pid: 2, startedAt: 'b', isAlive: () => true });
    assert.equal(second.ok, true);
    assert.equal(readRunLock(meeseeksDir)?.pid, 2);
  });
});

describe('a reclaimer that died mid-takeover (REVIEW F34)', () => {
  /**
   * The state a `kill -9` between winning the claim and replacing the lock leaves behind.
   *
   * Written through `claimTakeover`, the same function production calls, so the fixture cannot
   * drift from the format the code reads. A hand-rolled JSON blob here would agree with a shape
   * rather than with the module, which is how F31, F33 and F34 each survived their first repair.
   *
   * @param {string} meeseeksDir @param {string} staleToken @param {number} pid
   */
  function abandonedClaim(meeseeksDir, staleToken, pid) {
    claimTakeover(meeseeksDir, staleToken, { pid, startedAt: 'when it started', token: 'the-reclaimer-that-died' });
  }

  /** A pid that is certainly not running: this process's own, negated, is never a live pid. */
  const DEAD_RECLAIMER_PID = 2 ** 31 - 1;

  it('does not block the next contender, which is the denial of service F34 reported', () => {
    // The reproduction. Before the repair every later cohort was told "another driver is already
    // reclaiming" for as long as the stale lock survived -- and it survived forever, because the
    // one thing that would have replaced it was the reclaimer that died. Measured against the
    // unrepaired module: three successive cohorts refused while nothing was running anywhere.
    const meeseeksDir = makeMeeseeksDir();
    acquireRunLock(meeseeksDir, { pid: DEAD_OWNER_PID, startedAt: 'a', token: 'dead-owner' });
    abandonedClaim(meeseeksDir, 'dead-owner', DEAD_RECLAIMER_PID);

    const reclaimed = acquireRunLock(meeseeksDir, { pid: 99, startedAt: 'b', token: 'new-owner', isAlive: realLiveness });

    assert.equal(reclaimed.ok, true);
    assert.deepStrictEqual(readRunLock(meeseeksDir), { pid: 99, startedAt: 'b', token: 'new-owner' });
    assert.equal(existsSync(takeoverLockPath(meeseeksDir, 'dead-owner')), false, 'the abandoned claim was not swept');
  });

  it('recovers again when the very next owner also dies mid-takeover', () => {
    // Once, by luck, is not a recovery rule. The second stale generation reuses a different token
    // and therefore a different claim path, so this also proves the sweep leaves no residue that
    // the next generation trips over.
    const meeseeksDir = makeMeeseeksDir();
    acquireRunLock(meeseeksDir, { pid: DEAD_OWNER_PID, startedAt: 'a', token: 'first-dead-owner' });
    abandonedClaim(meeseeksDir, 'first-dead-owner', DEAD_RECLAIMER_PID);
    const first = acquireRunLock(meeseeksDir, { pid: 98, token: 'second-owner', isAlive: realLiveness });
    assert.equal(first.ok, true);

    abandonedClaim(meeseeksDir, 'second-owner', DEAD_RECLAIMER_PID);
    const second = acquireRunLock(meeseeksDir, { pid: 97, token: 'third-owner', isAlive: (pid) => pid !== 98 && realLiveness(pid) });

    assert.equal(second.ok, true);
    assert.equal(readRunLock(meeseeksDir)?.token, 'third-owner');
    assert.equal(existsSync(takeoverLockPath(meeseeksDir, 'second-owner')), false);
  });

  it('refuses a claim file that will not parse, rather than sweeping something that may be alive', () => {
    // The one window the identity cannot cover: between the exclusive create and the write landing.
    // An unreadable claim is not evidence that nobody is reclaiming -- the same rule `readRunLock`
    // applies to an unreadable lock -- so this refuses and names the path instead of guessing.
    const meeseeksDir = makeMeeseeksDir();
    acquireRunLock(meeseeksDir, { pid: DEAD_OWNER_PID, startedAt: 'a', token: 'dead-owner' });
    writeFileSync(takeoverLockPath(meeseeksDir, 'dead-owner'), '{ half a fi', 'utf8');

    const refused = acquireRunLock(meeseeksDir, { pid: 99, isAlive: realLiveness });

    assert.equal(refused.ok, false);
    assert.equal(refused.ok === false ? refused.detail.includes('could not be read as JSON') : false, true);
    assert.equal(
      refused.ok === false ? refused.fix.includes('lock.json.takeover-') : false,
      true,
      'a refusal the operator cannot act on is the denial of service again, politely worded',
    );
    assert.equal(readRunLock(meeseeksDir)?.token, 'dead-owner', 'it took something while refusing');
  });

  it('refuses a claim that names no process, for the same reason', () => {
    const meeseeksDir = makeMeeseeksDir();
    acquireRunLock(meeseeksDir, { pid: DEAD_OWNER_PID, startedAt: 'a', token: 'dead-owner' });
    writeFileSync(takeoverLockPath(meeseeksDir, 'dead-owner'), JSON.stringify({ startedAt: 'a' }), 'utf8');

    const refused = acquireRunLock(meeseeksDir, { pid: 99, isAlive: realLiveness });

    assert.equal(refused.ok, false);
    assert.equal(refused.ok === false ? refused.detail.includes('does not name the driver') : false, true);
  });

  it('refuses a takeover directory left by a driver before 0.182.0, and says which version wrote it', () => {
    // The upgrade case. A directory cannot record who holds it, so it may still be a live reclaimer
    // of the older version; sweeping it would put two reclaimers on one stale lock. Refuse, and name
    // the path so the operator has a one-line fix rather than the old cryptic loop.
    const meeseeksDir = makeMeeseeksDir();
    acquireRunLock(meeseeksDir, { pid: DEAD_OWNER_PID, startedAt: 'a', token: 'dead-owner' });
    mkdirSync(takeoverLockPath(meeseeksDir, 'dead-owner'));

    const refused = acquireRunLock(meeseeksDir, { pid: 99, isAlive: realLiveness });

    assert.equal(refused.ok, false);
    assert.equal(refused.ok === false ? refused.detail.includes('is a directory') : false, true);
    assert.equal(refused.ok === false ? refused.detail.includes('before 0.182.0') : false, true);
    assert.equal(refused.ok === false ? refused.fix.includes('lock.json.takeover-') : false, true);
  });

  it('refuses rather than looping when every attempt finds another abandoned claim', () => {
    // Fail-closed on the pathology. The bounded retry exists because a pass can end by removing an
    // abandoned claim rather than by deciding anything; running out of passes is not evidence that
    // the repository is free. `isAlive` is the seam that plants a fresh claim each pass -- nothing
    // in production behaves like this, and the point is that even then nothing is handed out.
    const meeseeksDir = makeMeeseeksDir();
    acquireRunLock(meeseeksDir, { pid: DEAD_OWNER_PID, startedAt: 'a', token: 'dead-owner' });
    let planted = 0;
    const refused = acquireRunLock(meeseeksDir, {
      pid: 99,
      token: 'never-wins',
      isAlive: (pid) => {
        if (pid === DEAD_OWNER_PID) {
          planted += 1;
          abandonedClaim(meeseeksDir, 'dead-owner', DEAD_RECLAIMER_PID);
          return false;
        }
        return realLiveness(pid);
      },
    });

    assert.equal(refused.ok, false);
    assert.equal(refused.ok === false ? refused.detail.includes('gave up after') : false, true);
    assert.equal(planted, 4, 'the retry bound moved without this test noticing');
    assert.equal(readRunLock(meeseeksDir)?.token, 'dead-owner', 'the lock was handed out on the give-up path');
  });

  it('does not sweep a live claim that replaced the abandoned one it read', () => {
    // **The defect this repair introduced, found by reviewing it before it was committed.** `rename`
    // names a path, not the file that was read from it. Between judging a claim abandoned and moving
    // it, another contender can sweep that same claim and create its own — so the rename lands on a
    // *live* claim, displaces an owner that never finds out, and puts two reclaimers on one stale
    // lock. That is the double-take the module exists to prevent, arriving through its own recovery.
    //
    // `isAlive` is the seam that makes the window deterministic: it is consulted with the abandoned
    // claim's pid immediately before the sweep, so a side effect there lands exactly where the race
    // does. Nothing in production passes a function like this; the window is real, the timing is
    // arranged.
    const meeseeksDir = makeMeeseeksDir();
    acquireRunLock(meeseeksDir, { pid: DEAD_OWNER_PID, startedAt: 'a', token: 'dead-owner' });
    abandonedClaim(meeseeksDir, 'dead-owner', DEAD_RECLAIMER_PID);
    const claimPath = takeoverLockPath(meeseeksDir, 'dead-owner');
    let replaced = 0;

    const result = acquireRunLock(meeseeksDir, {
      pid: 99,
      token: 'the-displacer',
      isAlive: (pid) => {
        if (pid === DEAD_RECLAIMER_PID && replaced === 0) {
          // Another contender swept the abandoned claim and took one of its own, right here.
          replaced += 1;
          rmSync(claimPath, { force: true });
          claimTakeover(meeseeksDir, 'dead-owner', { pid: process.pid, startedAt: 'b', token: 'the-live-one' });
          return false;
        }
        return realLiveness(pid);
      },
    });

    assert.equal(replaced, 1, 'the window was never reached, so this proves nothing');
    assert.equal(result.ok, false, 'a contender reclaimed past a live claim it had displaced');
    const survivor = JSON.parse(readFileSync(claimPath, 'utf8'));
    assert.equal(survivor.token, 'the-live-one', 'the live claim was swept by a contender that never read it');
    assert.equal(readRunLock(meeseeksDir)?.token, 'dead-owner', 'the stale lock was taken while two reclaimers ran');
  });

  it('treats a zero-length claim as the crash that produced it, rather than bricking on it', () => {
    // The claim is created and written by one synchronous call, so an empty one is a process that
    // died between them and is therefore gone. Refusing it would be a fresh permanent denial of
    // service of exactly the shape F34 reported — reachable through the window this repair opened.
    const meeseeksDir = makeMeeseeksDir();
    acquireRunLock(meeseeksDir, { pid: DEAD_OWNER_PID, startedAt: 'a', token: 'dead-owner' });
    writeFileSync(takeoverLockPath(meeseeksDir, 'dead-owner'), '', 'utf8');

    const reclaimed = acquireRunLock(meeseeksDir, { pid: 99, token: 'new-owner', isAlive: realLiveness });

    assert.equal(reclaimed.ok, true);
    assert.equal(readRunLock(meeseeksDir)?.token, 'new-owner');
    assert.equal(existsSync(takeoverLockPath(meeseeksDir, 'dead-owner')), false);
  });

  it('leaves a live contender’s claim alone while refusing, so no straggler can clear it', () => {
    // Only the owner may clear the claim, exactly as for the lock. Before the claim carried a token
    // it was dropped unconditionally on the way out, which was safe only while nothing could
    // legitimately replace it -- and the sweep makes replacement legitimate.
    const meeseeksDir = makeMeeseeksDir();
    acquireRunLock(meeseeksDir, { pid: DEAD_OWNER_PID, startedAt: 'a', token: 'dead-owner' });
    claimTakeover(meeseeksDir, 'dead-owner', { pid: process.pid, startedAt: 'b', token: 'the-live-one' });

    assert.equal(acquireRunLock(meeseeksDir, { pid: 99, isAlive: realLiveness }).ok, false);

    const claim = JSON.parse(readFileSync(takeoverLockPath(meeseeksDir, 'dead-owner'), 'utf8'));
    assert.equal(claim.token, 'the-live-one', 'the refused contender cleared a claim that was not its own');
  });
});
