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

import { RUN_LOCK_FILE, acquireRunLock, readRunLock, releaseRunLock, takeoverLockPath } from '../scripts/run-lock.mjs';

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

  it('refuses when another contender is already reclaiming that same stale lock', () => {
    // The serialization, without which two contenders reading one dead lock would each remove it
    // and each create their own -- the original defect wearing a different hat.
    const meeseeksDir = makeMeeseeksDir();
    acquireRunLock(meeseeksDir, { pid: 4242, startedAt: 'a', token: 'dead-owner' });
    mkdirSync(takeoverLockPath(meeseeksDir, 'dead-owner'));
    const refused = acquireRunLock(meeseeksDir, { pid: 99, isAlive: () => false });
    assert.equal(refused.ok, false);
    assert.equal(refused.ok === false ? refused.detail.includes('reclaiming') : false, true);
    // And it took nothing while refusing.
    assert.equal(readRunLock(meeseeksDir)?.token, 'dead-owner');
  });

  // The benign neighbour. Refusing every takeover is not passing: an orphan left by a contender
  // that died mid-reclaim names a token that will never appear again, so it must block nothing.
  it('is not blocked by an orphaned takeover directory for some other stale lock', () => {
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
