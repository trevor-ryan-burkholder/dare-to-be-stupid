/**
 * Tests for the run lock (DESIGN.md §3.5).
 *
 * The defect this exists for was measured, not imagined. On 13 August 2026 `ps` showed three
 * driver processes, two of them with the same `cwd`: run 14 had been sent SIGTERM and had not
 * died, and run 15 launched into the same tree. Two independent drivers were then mutating one
 * repository, each able to `git reset --hard` it, rewrite `.dare/` and commit over the other.
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

/** @returns {string} a fresh `.dare` directory */
function makeDareDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dare-run-lock-'));
  temporaryDirs.push(dir);
  const dareDir = path.join(dir, '.dare');
  mkdirSync(dareDir, { recursive: true });
  return dareDir;
}

describe('readRunLock', () => {
  it('returns null when no run has claimed the repository', () => {
    assert.equal(readRunLock(makeDareDir()), null);
  });

  it('round-trips the pid and the start time it was given', () => {
    const dareDir = makeDareDir();
    claimRunLock(dareDir, { pid: 4242, startedAt: '2026-08-13T10:00:00.000Z' });
    assert.deepStrictEqual(readRunLock(dareDir), { pid: 4242, startedAt: '2026-08-13T10:00:00.000Z' });
  });

  // Nothing defaults to pass, and that rule has a direction here: a lock that cannot be read
  // is not evidence that nobody holds one. Throwing sends the question to the caller, which
  // refuses the run and tells the operator which file to delete.
  it('throws on a lock it cannot parse, rather than reporting the repository free', () => {
    const dareDir = makeDareDir();
    writeFileSync(path.join(dareDir, RUN_LOCK_FILE), '{not json', 'utf8');
    assert.throws(() => readRunLock(dareDir), /lock\.json/);
  });

  it('throws on a lock with no usable pid, for the same reason', () => {
    const dareDir = makeDareDir();
    writeFileSync(path.join(dareDir, RUN_LOCK_FILE), JSON.stringify({ startedAt: 'now' }), 'utf8');
    assert.throws(() => readRunLock(dareDir), /pid/);
  });
});

describe('claimRunLock and clearRunLock', () => {
  it('writes a lock a second process can read', () => {
    const dareDir = makeDareDir();
    claimRunLock(dareDir, { pid: 7, startedAt: '2026-08-13T10:00:00.000Z' });
    const raw = JSON.parse(readFileSync(path.join(dareDir, RUN_LOCK_FILE), 'utf8'));
    assert.equal(raw.pid, 7);
  });

  it('replaces an existing lock rather than failing on it', () => {
    // The caller decides whether taking over is allowed; this function only records who holds
    // it. Refusing here would put the policy in two places.
    const dareDir = makeDareDir();
    claimRunLock(dareDir, { pid: 1, startedAt: 'a' });
    claimRunLock(dareDir, { pid: 2, startedAt: 'b' });
    assert.deepStrictEqual(readRunLock(dareDir), { pid: 2, startedAt: 'b' });
  });

  it('clears the lock, so the next run finds the repository free', () => {
    const dareDir = makeDareDir();
    claimRunLock(dareDir, { pid: 9, startedAt: 'a' });
    clearRunLock(dareDir);
    assert.equal(readRunLock(dareDir), null);
  });

  it('clears a lock that is not there without complaining', () => {
    // A driver that died before claiming still runs its exit path, and an exception thrown
    // while cleaning up would replace the real reason a run ended.
    const dareDir = makeDareDir();
    clearRunLock(dareDir);
    assert.equal(readRunLock(dareDir), null);
  });
});
