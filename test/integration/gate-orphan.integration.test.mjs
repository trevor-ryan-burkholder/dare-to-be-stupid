/**
 * Tier 2 — a timed-out gate does not leave its descendants running (DESIGN.md §11.1).
 *
 * The defect, measured and recorded in `HANDOFF.md` ("the real hang"): `execFileSync`'s
 * timeout signals the direct child and nothing else. A gate that backgrounds a dev server, a
 * watcher, or a test runner leaves that grandchild alive after the kill, holding its port and
 * its memory against every later iteration. `health-probe.mjs` has always signalled a process
 * **group** for its own child; gates never did.
 *
 * Nothing in `test/driver.test.mjs` can see this. Those tests drive `runGates` through an
 * injected double, so they prove the driver *reports* a timeout — they cannot prove that a
 * real process died, because what happens to an orphan after a kill is the operating system's
 * contract, not ours. That is §11.1's rule: an assertion about the array you build says
 * nothing about what the callee does with it.
 *
 * The grandchild here writes its own pid to a file and then sleeps for ten minutes. Its parent
 * shell exits immediately. So the pid in the file is a process nothing is waiting for, in the
 * driver's own process group, which is precisely the shape that used to survive.
 *
 * No network, no API, no money. Just node, a shell, and a process that refuses to leave.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { runGates, shell } from '../../scripts/driver.mjs';

/** @type {number[]} */
const toClean = [];

afterEach(() => {
  // A test that leaks the process it is testing for leaks would be its own joke. Belt and
  // braces: if an assertion failed, the sleeper is still out there.
  while (toClean.length > 0) {
    const pid = toClean.pop();
    if (pid === undefined) continue;
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Already gone, which is the outcome the test wants anyway.
    }
  }
});

/**
 * Is this pid a process that is still running?
 *
 * **Not `process.kill(pid, 0)`, and the first version of this file used it and failed.** A pid
 * killed with `SIGKILL` whose parent has already exited is re-parented and becomes a zombie
 * until something reaps it, and `kill(pid, 0)` succeeds against a zombie: the process is dead
 * and the pid-table entry is not. Measured here — `kill(0)` said `ALIVE` for a pid `ps` was
 * no longer listing at all, milliseconds apart. So a test written on `kill(0)` races the
 * reaper and reports a working sweep as a leak.
 *
 * `ps` is the honest oracle because it reports the state. `Z` is dead.
 *
 * @param {number} pid
 * @returns {boolean}
 */
function alive(pid) {
  const out = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' });
  const state = String(out.stdout).trim();
  if (state === '') return false;
  return !state.startsWith('Z');
}

/**
 * Wait for a pid to stop being a running process.
 *
 * Polled rather than asserted once, because `SIGKILL` is delivered asynchronously: the sweep
 * returns as soon as the signal is *queued*, and the kernel tears the process down after that.
 * A single check immediately afterwards is a race, and a flaky tier-2 test is worse than none.
 *
 * @param {number} pid
 * @param {number} timeoutMs
 * @returns {boolean} whether it died inside the window
 */
function died(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!alive(pid)) return true;
  }
  return false;
}

/**
 * Wait for the pid file the grandchild writes, then read it.
 *
 * Polled rather than assumed: the shell backgrounds the sleeper, so there is a real race
 * between the driver reaching its timeout and the sleeper reaching its first line.
 *
 * @param {string} file
 * @returns {number}
 */
function grandchildPid(file) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const pid = Number(readFileSync(file, 'utf8').trim());
      if (Number.isInteger(pid) && pid > 0) return pid;
    } catch {
      // Not written yet.
    }
  }
  throw new Error(`the grandchild never wrote ${file}, so this test proved nothing`);
}

/**
 * A gate whose own process exits at once and which leaves one descendant behind for ten
 * minutes. Spelled through `sh -c` because that is how a real leak arrives — a build script
 * that starts a server and returns.
 *
 * @param {string} pidFile
 * @returns {string[]}
 */
function leaksAGrandchild(pidFile) {
  const sleeper =
    `require("fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); ` + 'setTimeout(() => {}, 600000)';
  return ['sh', '-c', `${JSON.stringify(process.execPath)} -e ${JSON.stringify(sleeper)} & echo gate-started`];
}

describe('a timed-out gate takes its leaked descendants with it', { skip: process.platform === 'win32' }, () => {
  it('kills a grandchild that outlived the gate, and names it in the detail', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-orphan-'));
    const pidFile = path.join(dir, 'sleeper.pid');
    try {
      const started = Date.now();
      const outcome = runGates([{ name: 'leaky', command: leaksAGrandchild(pidFile), required: true }], {
        cwd: dir,
        run: shell,
        timeoutMs: 4000,
      });
      const elapsed = Date.now() - started;

      // The gate command finishes in milliseconds. It is the grandchild holding the write end
      // of the pipe that keeps `execFileSync` reading, so this must be the ceiling firing and
      // not the command running to completion.
      assert.equal(outcome.ok, false, 'a gate that had to be killed is not a passing gate');
      assert.equal(outcome.results.length, 1);
      assert.match(outcome.results[0].detail, /did not finish within 4000ms and was killed/);
      assert.equal(elapsed < 60_000, true, `the gate ran for ${elapsed}ms, so nothing bounded it`);

      const pid = grandchildPid(pidFile);
      toClean.push(pid);

      // The assertion the whole file exists for. Before this change the sleeper was still
      // running here, re-parented away from the driver and invisible to it.
      assert.equal(died(pid, 10_000), true, `the grandchild ${pid} survived the gate timeout`);

      // And it is reported, not silently reaped. An operator reading a gate failure needs to
      // know a process was killed on their behalf.
      assert.match(outcome.results[0].detail, /Killed 1 leaked descendant/);
      assert.equal(outcome.results[0].detail.includes(String(pid)), true, outcome.results[0].detail);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Blocking everything is not passing, and killing everything is not sweeping. A gate that
  // simply runs long and is killed must not take unrelated processes in the driver's group
  // with it — the sweep is a set difference, and this is the half that proves the subtraction
  // is real rather than the whole group being signalled.
  it('leaves a process that was already there before the gate started', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-orphan-'));
    try {
      // A bystander in the driver's own process group, started before any gate runs. Nothing
      // detaches it, so it shares the group the sweep samples — which is the only reason this
      // test can distinguish a set difference from a blanket group signal.
      //
      // `stdio: 'ignore'` rather than the driver's `shell`, and that is not a shortcut: with a
      // pipe, `execFileSync` waits for EOF and the sleeper holds the write end, so calling
      // `shell` here with no ceiling would block this test for ten minutes. That is the same
      // mechanism the file is about, arriving from the other side.
      const bystanderFile = path.join(dir, 'bystander.pid');
      const bystanderCommand = leaksAGrandchild(bystanderFile);
      spawnSync(bystanderCommand[0], bystanderCommand.slice(1), { cwd: dir, stdio: 'ignore' });
      const keep = grandchildPid(bystanderFile);
      toClean.push(keep);
      assert.equal(alive(keep), true, 'the bystander died before the gate under test even ran');

      const victimFile = path.join(dir, 'victim.pid');
      const outcome = runGates([{ name: 'leaky', command: leaksAGrandchild(victimFile), required: true }], {
        cwd: dir,
        run: shell,
        timeoutMs: 4000,
      });
      const victim = grandchildPid(victimFile);
      toClean.push(victim);

      assert.equal(outcome.ok, false);
      assert.equal(died(victim, 10_000), true, `the gate's own leak ${victim} survived`);
      assert.equal(alive(keep), true, `the sweep killed a bystander ${keep} the gate never started`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
