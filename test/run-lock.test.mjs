/**
 * Tests for the run lock (DESIGN.md §3.5).
 *
 * The defect this exists for was measured, not imagined. On 13 August 2026 `ps` showed three
 * driver processes, two of them with the same `cwd`: run 14 had been sent SIGTERM and had not
 * died, and run 15 launched into the same tree. Two independent drivers were then mutating one
 * repository, each able to `git reset --hard` it, rewrite `.meeseeks/` and commit over the other.
 * Run 15's result was void and nothing could be concluded from its log.
 *
 * §13.6's re-entrancy guard does not cover this. It refuses a *nested* run — a builder invoking
 * the slash command — which is a different thing entirely, and nothing looked for this one.
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { RUN_LOCK_FILE, claimRunLock, clearRunLock, readRunLock } from '../scripts/run-lock.mjs';

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

describe('readRunLock', () => {
  it('returns null when no run has claimed the repository', () => {
    assert.equal(readRunLock(makeMeeseeksDir()), null);
  });

  it('round-trips the pid and the start time it was given', () => {
    const meeseeksDir = makeMeeseeksDir();
    claimRunLock(meeseeksDir, { pid: 4242, startedAt: '2026-08-13T10:00:00.000Z' });
    assert.deepStrictEqual(readRunLock(meeseeksDir), { pid: 4242, startedAt: '2026-08-13T10:00:00.000Z' });
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
    writeFileSync(path.join(meeseeksDir, RUN_LOCK_FILE), JSON.stringify({ startedAt: 'now' }), 'utf8');
    assert.throws(() => readRunLock(meeseeksDir), /pid/);
  });
});

describe('claimRunLock and clearRunLock', () => {
  it('writes a lock a second process can read', () => {
    const meeseeksDir = makeMeeseeksDir();
    claimRunLock(meeseeksDir, { pid: 7, startedAt: '2026-08-13T10:00:00.000Z' });
    const raw = JSON.parse(readFileSync(path.join(meeseeksDir, RUN_LOCK_FILE), 'utf8'));
    assert.equal(raw.pid, 7);
  });

  it('replaces an existing lock rather than failing on it', () => {
    // The caller decides whether taking over is allowed; this function only records who holds
    // it. Refusing here would put the policy in two places.
    const meeseeksDir = makeMeeseeksDir();
    claimRunLock(meeseeksDir, { pid: 1, startedAt: 'a' });
    claimRunLock(meeseeksDir, { pid: 2, startedAt: 'b' });
    assert.deepStrictEqual(readRunLock(meeseeksDir), { pid: 2, startedAt: 'b' });
  });

  it('clears the lock, so the next run finds the repository free', () => {
    const meeseeksDir = makeMeeseeksDir();
    claimRunLock(meeseeksDir, { pid: 9, startedAt: 'a' });
    clearRunLock(meeseeksDir);
    assert.equal(readRunLock(meeseeksDir), null);
  });

  it('clears a lock that is not there without complaining', () => {
    // A driver that died before claiming still runs its exit path, and an exception thrown
    // while cleaning up would replace the real reason a run ended.
    const meeseeksDir = makeMeeseeksDir();
    clearRunLock(meeseeksDir);
    assert.equal(readRunLock(meeseeksDir), null);
  });
});
