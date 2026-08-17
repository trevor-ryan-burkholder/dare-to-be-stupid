/**
 * Tier 2 — the ceiling and the output cap are hard bounds (DESIGN.md §11.1, REVIEW F2).
 *
 * **The measured defect.** A child that trapped `SIGTERM` and exited of its own accord one second
 * later was run with `timeoutMs: 100`. `shell` reported a timeout — and returned after 1,018 ms.
 * Both termination paths sent `SIGTERM` and then waited for a cooperative `exit`, so a child that
 * traps or ignores the signal would have defeated the watchdog indefinitely while the log told the
 * operator it had been killed after a stated time. The 64MB cap had the identical shape, and the
 * ceiling could not rescue it: overflow owns the verdict, and neither branch could force.
 *
 * None of that is visible to a unit test. Whether `SIGKILL` actually ends a process that ignores
 * `SIGTERM`, and whether its descendants really go with it, are claims about the operating system.
 * `§11.1`: an assertion about the array you build says nothing about what the callee does with it.
 *
 * No network, no API, no money. Real processes.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { TERMINATION_GRACE_MS, shell } from '../../scripts/driver.mjs';

/** @type {number[]} */
const toClean = [];
/** @type {string[]} */
const dirsToClean = [];

// `after`, not `afterEach`, and `concurrency: 1` on every suite below. Sibling tests in one
// suite can run concurrently, and a shared per-test teardown then deletes the *next* test's
// fixtures out from under it — measured here, as a cooperative child that "exited in 57ms"
// because its script file had just been removed by its neighbour's cleanup. Each test owns real
// processes and real files, so they are cleaned once, at the end, and never run in parallel.
after(() => {
  // A test for leaked processes that leaks processes would be its own joke.
  while (toClean.length > 0) {
    const pid = toClean.pop();
    if (pid === undefined) continue;
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Already gone, which is the outcome the test wanted anyway.
    }
  }
  while (dirsToClean.length > 0) rmSync(String(dirsToClean.pop()), { recursive: true, force: true });
});

/**
 * Is this pid a running process?
 *
 * **Not `process.kill(pid, 0)`.** A `SIGKILL`ed pid whose parent has exited becomes a zombie until
 * something reaps it, and `kill(pid, 0)` succeeds against a zombie — so a test written on it races
 * the reaper and reports a working kill as a leak. `ps` reports the state, and `Z` is dead.
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
 * Polled rather than asserted once, because `SIGKILL` is delivered asynchronously: the call
 * returns when the signal is queued and the kernel tears the process down after that. A single
 * check immediately afterwards is a race, and a flaky tier-2 test is worse than none.
 *
 * @param {number} pid
 * @param {number} timeoutMs
 * @returns {boolean}
 */
function died(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!alive(pid)) return true;
  }
  return false;
}

/**
 * Read a pid a fixture wrote, waiting for it to appear.
 *
 * @param {string} file
 * @returns {number}
 */
function pidFrom(file) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const pid = Number(readFileSync(file, 'utf8').trim());
      if (Number.isInteger(pid) && pid > 0) return pid;
    } catch {
      // Not written yet.
    }
  }
  throw new Error(`nothing wrote ${file}, so this test proved nothing`);
}

/** A scratch directory for one test's fixtures. @returns {string} */
function scratch() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-terminate-'));
  dirsToClean.push(dir);
  return dir;
}

/**
 * @param {string} dir
 * @param {string} name
 * @param {string} source
 * @returns {string}
 */
function script(dir, name, source) {
  const file = path.join(dir, name);
  writeFileSync(file, source, 'utf8');
  return file;
}

/** A descendant that outlives its parent unless something kills it. */
const SLEEPER = `
import { writeFileSync } from 'node:fs';
writeFileSync(process.argv[2], String(process.pid));
setTimeout(() => {}, 600_000);
`;

/**
 * A child that refuses to die politely, leaves one descendant behind, and optionally floods
 * stdout past the 64MB cap on its way.
 *
 * @param {{ flood: boolean }} options
 * @returns {string}
 */
const resistant = (options) => `
import { writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
// The whole point: asked to stop, it declines.
process.on('SIGTERM', () => {});
const [selfPidFile, grandPidFile, sleeper] = process.argv.slice(2);
spawn(process.execPath, [sleeper, grandPidFile], { stdio: 'ignore' });
writeFileSync(selfPidFile, String(process.pid));
${
  options.flood
    ? `const block = 'x'.repeat(1024 * 1024);
for (let written = 0; written < 70; written += 1) process.stdout.write(block);`
    : ''
}
setTimeout(() => {}, 600_000);
`;

describe('a child that ignores SIGTERM is still bounded', { concurrency: 1, skip: process.platform === 'win32' }, () => {
  it('returns within the ceiling plus the documented grace, and reports a timeout', async () => {
    const dir = scratch();
    const sleeper = script(dir, 'sleeper.mjs', SLEEPER);
    const stubborn = script(dir, 'stubborn.mjs', resistant({ flood: false }));
    const selfPid = path.join(dir, 'self.pid');
    const grandPid = path.join(dir, 'grand.pid');

    const started = Date.now();
    const result = await shell(process.execPath, [stubborn, selfPid, grandPid, sleeper], {
      cwd: dir,
      timeoutMs: 1000,
    });
    const elapsed = Date.now() - started;

    // Before this repair the call waited for an `exit` this child never sends, so the bound is
    // the assertion: the ceiling, the grace, and a scheduling allowance.
    assert.equal(
      elapsed < 1000 + TERMINATION_GRACE_MS + 5000,
      true,
      `shell returned after ${elapsed}ms; the bound is 1000 + ${TERMINATION_GRACE_MS} + slack`,
    );
    assert.equal(result.timedOut, true);
    assert.equal(result.ok, false);
    assert.equal(result.status, 1);
  });

  it('leaves neither the resistant child nor its descendants alive', async () => {
    const dir = scratch();
    const sleeper = script(dir, 'sleeper.mjs', SLEEPER);
    const stubborn = script(dir, 'stubborn.mjs', resistant({ flood: false }));
    const selfPid = path.join(dir, 'self.pid');
    const grandPid = path.join(dir, 'grand.pid');

    const result = await shell(process.execPath, [stubborn, selfPid, grandPid, sleeper], {
      cwd: dir,
      timeoutMs: 1000,
    });

    const child = pidFrom(selfPid);
    const grandchild = pidFrom(grandPid);
    toClean.push(child, grandchild);
    assert.equal(died(child, 10_000), true, `the resistant child ${child} outlived its own ceiling`);
    assert.equal(died(grandchild, 10_000), true, `the descendant ${grandchild} outlived the sweep`);
    // Reported rather than silently reaped: an operator reading a killed command needs to know
    // processes were ended on their behalf.
    assert.equal(Array.isArray(result.reaped), true, 'the timeout path stopped sweeping');
    assert.equal(/** @type {number[]} */ (result.reaped).includes(grandchild), true, String(result.reaped));
  });
});

describe(
  'the output cap is bounded the same way, and keeps its own verdict',
  { concurrency: 1, skip: process.platform === 'win32' },
  () => {
  it('settles a flooding child that ignores SIGTERM, as overflow rather than timeout', async () => {
    const dir = scratch();
    const sleeper = script(dir, 'sleeper.mjs', SLEEPER);
    const firehose = script(dir, 'firehose.mjs', resistant({ flood: true }));
    const selfPid = path.join(dir, 'self.pid');
    const grandPid = path.join(dir, 'grand.pid');

    const started = Date.now();
    // A ceiling far beyond anything this test should need, so that reaching a verdict at all
    // proves the *cap* forced it. The child would otherwise sit here for ten minutes.
    const result = await shell(process.execPath, [firehose, selfPid, grandPid, sleeper], {
      cwd: dir,
      timeoutMs: 120_000,
    });
    const elapsed = Date.now() - started;

    assert.equal(elapsed < 60_000, true, `shell returned after ${elapsed}ms, so the cap did not force anything`);
    // Overflow owns the verdict. `timedOut` is what `runDeploy`'s operator messaging keys on, and
    // a buffer failure reported as a timeout would send an operator after the wrong problem.
    assert.equal(result.timedOut, false, 'the cap\'s verdict was replaced by the ceiling\'s');
    assert.equal(result.ok, false);
    assert.equal(result.stdout.length <= 64 * 1024 * 1024, true, 'the cap did not cap');

    const child = pidFrom(selfPid);
    const grandchild = pidFrom(grandPid);
    toClean.push(child, grandchild);
    assert.equal(died(child, 10_000), true, `the flooding child ${child} survived the cap`);
    assert.equal(died(grandchild, 10_000), true, `the descendant ${grandchild} survived the cap`);
  });
});

describe('the benign neighbours the grace period must not disturb', { concurrency: 1, skip: process.platform === 'win32' }, () => {
  it('returns as soon as a cooperative child exits, without paying the grace', async () => {
    // The whole grace period exists for children that refuse. A child that accepts `SIGTERM` must
    // still settle on its own exit, or every timeout in the product would cost five extra seconds.
    const dir = scratch();
    const polite = script(
      dir,
      'polite.mjs',
      `process.on('SIGTERM', () => process.exit(7));\nsetTimeout(() => {}, 600_000);\n`,
    );
    const started = Date.now();
    const result = await shell(process.execPath, [polite], { cwd: dir, timeoutMs: 500 });
    const elapsed = Date.now() - started;
    assert.equal(result.timedOut, true);
    assert.equal(
      elapsed < 500 + TERMINATION_GRACE_MS,
      true,
      `a cooperative child cost the full grace: ${elapsed}ms`,
    );
  });

  it('does not let a forced kill reach into the next command', async () => {
    // **The defect the escalation introduced, and the reason this file exists at both tiers.**
    // The sweep is an argument to `settle`, so it runs before `settle` can decline a second call
    // — and after a forced kill there is always a second call, because the child's `exit` arrives
    // once the promise has resolved and the next command has already been spawned. Measured
    // before the guard: every other `shell` call in a process returned in 14ms with its child
    // killed before it could run a line, because a stale process-group snapshot made a perfectly
    // innocent child look like a survivor of the previous timeout.
    const dir = scratch();
    const sleeper = script(dir, 'sleeper.mjs', SLEEPER);
    const stubborn = script(dir, 'stubborn.mjs', resistant({ flood: false }));
    const first = await shell(
      process.execPath,
      [stubborn, path.join(dir, 'self.pid'), path.join(dir, 'grand.pid'), sleeper],
      { cwd: dir, timeoutMs: 1000 },
    );
    assert.equal(first.timedOut, true, 'the fixture did not actually force a kill');
    toClean.push(pidFrom(path.join(dir, 'self.pid')), pidFrom(path.join(dir, 'grand.pid')));

    const second = await shell(process.execPath, ['-e', 'process.stdout.write("innocent")'], {
      cwd: dir,
      timeoutMs: 30_000,
    });
    assert.deepStrictEqual(
      { ok: second.ok, status: second.status, stdout: second.stdout, timedOut: second.timedOut },
      { ok: true, status: 0, stdout: 'innocent', timedOut: false },
    );
  });

  it('reports an ordinary failure as a failure, not as a timeout', async () => {
    const dir = scratch();
    const result = await shell(process.execPath, ['-e', 'process.exit(3)'], { cwd: dir, timeoutMs: 30_000 });
    assert.equal(result.ok, false);
    assert.equal(result.status, 3);
    assert.equal(result.timedOut, false);
  });

  it('reports an ordinary success as a success', async () => {
    const dir = scratch();
    const result = await shell(process.execPath, ['-e', 'process.stdout.write("fine")'], {
      cwd: dir,
      timeoutMs: 30_000,
    });
    assert.deepStrictEqual(
      { ok: result.ok, status: result.status, stdout: result.stdout, timedOut: result.timedOut },
      { ok: true, status: 0, stdout: 'fine', timedOut: false },
    );
  });

  it('does not read a child that kills itself with SIGTERM as a timeout', async () => {
    // The discriminator, kept honest: `timedOut` is set by the ceiling firing and by nothing
    // else, so the exit signal is never consulted for it.
    const dir = scratch();
    const result = await shell(process.execPath, ['-e', 'process.kill(process.pid, "SIGTERM")'], {
      cwd: dir,
      timeoutMs: 30_000,
    });
    assert.equal(result.ok, false);
    assert.equal(result.timedOut, false);
  });

  it('leaves a process that was already running before the command started', async () => {
    // Blocking everything is not passing. The sweep works by subtraction, and a bystander in the
    // driver's own process group must survive a command that timed out beside it.
    const dir = scratch();
    const sleeper = script(dir, 'sleeper.mjs', SLEEPER);
    const bystanderPid = path.join(dir, 'bystander.pid');
    // `stdio: 'ignore'`, and it is not tidiness. A backgrounded process inherits the shell's
    // stdout pipe and holds it open for its whole life, so a piped `spawnSync` here waits for the
    // sleeper's ten minutes rather than for `sh` — the exact failure this whole file is about,
    // reproduced by the fixture written to test it.
    const bystander = spawnSync(
      'sh',
      ['-c', `${JSON.stringify(process.execPath)} ${JSON.stringify(sleeper)} ${JSON.stringify(bystanderPid)} &`],
      { stdio: 'ignore' },
    );
    assert.equal(bystander.status, 0);
    const pid = pidFrom(bystanderPid);
    toClean.push(pid);

    const stubborn = script(dir, 'stubborn.mjs', resistant({ flood: false }));
    await shell(process.execPath, [stubborn, path.join(dir, 'self.pid'), path.join(dir, 'grand.pid'), sleeper], {
      cwd: dir,
      timeoutMs: 1000,
    });
    toClean.push(pidFrom(path.join(dir, 'self.pid')), pidFrom(path.join(dir, 'grand.pid')));

    assert.equal(alive(pid), true, `the sweep killed a bystander (${pid}) it did not start`);
  });
});
