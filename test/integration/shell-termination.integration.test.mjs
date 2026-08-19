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
import { setTimeout } from 'node:timers';

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

  it('sweeps the descendants of a flooding child that was given no ceiling at all', async () => {
    // **The gap F2's acceptance names, and it survived the first repair** (REVIEW F2, re-baselined
    // at 0.208.0). The ownership pre-image was sampled only when a `timeoutMs` was supplied, on the
    // reasoning that a command with no ceiling cannot time out — but the 64MB cap sweeps through the
    // *same* pre-image, so without one `sweepLeakedGroup` returned `[]` and every descendant of a
    // flooding child survived. The direct child still died, so the leak was invisible from the
    // result: only the operating system knew.
    //
    // No `timeoutMs` here, deliberately. The cap must force the verdict on its own.
    const dir = scratch();
    const sleeper = script(dir, 'sleeper.mjs', SLEEPER);
    const firehose = script(dir, 'firehose.mjs', resistant({ flood: true }));
    const selfPid = path.join(dir, 'self.pid');
    const grandPid = path.join(dir, 'grand.pid');

    const result = await shell(process.execPath, [firehose, selfPid, grandPid, sleeper], { cwd: dir });

    assert.equal(result.ok, false);
    assert.equal(result.timedOut, false, 'a command with no ceiling reported a timeout');

    const child = pidFrom(selfPid);
    const grandchild = pidFrom(grandPid);
    toClean.push(child, grandchild);
    assert.equal(died(child, 10_000), true, `the flooding child ${child} survived the cap`);
    assert.equal(died(grandchild, 10_000), true, `the descendant ${grandchild} outlived a cap with no ceiling`);
    // Reported, not silently reaped — and reported *at all*, which is what the pre-image bought.
    assert.equal(Array.isArray(result.reaped), true, 'the overflow path swept nothing without a ceiling');
    assert.equal(/** @type {number[]} */ (result.reaped).includes(grandchild), true, String(result.reaped));
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

describe('one timed-out call does not reap a concurrent sibling (REVIEW F33)', { concurrency: 1, skip: process.platform === 'win32' }, () => {
  /**
   * **Why the existing bystander case could not see this.** It starts its bystander *before* the
   * target's snapshot, so the bystander is in `before` and the subtraction protects it for free.
   * The Panel's shape is the opposite: reviewers start under `Promise.all`, so reviewer A samples
   * the group before B and C exist, and every one of them lands in `after` minus `before`. When A
   * times out, its sweep classified its own colleagues as leaked descendants and killed them — one
   * reviewer's failure manufacturing failures in the cold reviewers whose independence is the whole
   * point of running a panel.
   *
   * So the sibling here is born *after* the timing-out call has taken its snapshot, and it is still
   * running when the sweep fires.
   */

  /** A sibling that takes its time and then reports, so its survival is provable rather than assumed. */
  const PATIENT = `
import { setTimeout as later } from 'node:timers';
later(() => process.stdout.write('sibling-finished'), 4_000);
`;

  /**
   * A sibling whose **leader exits immediately** while a grandchild keeps the pipe open.
   *
   * This is the shape that falsified the previous repair. The sibling's `shell` call is still in
   * flight — waiting for EOF on a pipe the grandchild holds — but its direct child is gone, so a
   * parentage-based owner lookup finds no live subtree for it. The grandchild has been reparented,
   * is absent from the other call's pre-spawn snapshot, and therefore reads as that call's leaked
   * descendant. It was killed, and the sibling settled hundreds of milliseconds into work meant to
   * last seconds.
   */
  const ORPHANED_SIBLING = `
import { spawn } from 'node:child_process';
const [holder] = process.argv.slice(2);
// The grandchild inherits stdout, so the pipe stays open after this leader exits.
spawn(process.execPath, [holder], { stdio: ['ignore', 'inherit', 'inherit'] });
`;

  const PIPE_HOLDER = `
import { setTimeout as later } from 'node:timers';
later(() => { process.stdout.write('sibling-finished'); }, 4_000);
`;

  it('protects a sibling whose own leader has already exited (REVIEW F33, reopened)', async () => {
    // **Ownership must survive the owner.** The previous mechanism reconstructed it from parentage
    // at sweep time, and parentage is exactly what a reparented grandchild no longer has. A process
    // group is a kernel fact: the grandchild keeps the pgid its leader had, so the timed-out call's
    // group kill cannot reach it however long its leader has been dead.
    const dir = scratch();
    const grandPid = path.join(dir, 'grand.pid');
    const sleeper = script(dir, 'sleeper.mjs', SLEEPER);
    const holder = script(dir, 'holder.mjs', PIPE_HOLDER);
    const orphaning = script(dir, 'orphaning.mjs', ORPHANED_SIBLING);

    // A: backgrounds a descendant of its own and is killed at 2s, after B exists.
    const timingOut = shell(
      'sh',
      ['-c', `${JSON.stringify(process.execPath)} ${JSON.stringify(sleeper)} ${JSON.stringify(grandPid)} & exec sleep 30`],
      { cwd: dir, timeoutMs: 2_000 },
    );

    // B: born after A's spawn, and its leader exits within milliseconds while its grandchild keeps
    // the call alive. Nothing about B is discoverable by parentage by the time A is swept.
    await new Promise((resolve) => {
      setTimeout(resolve, 400);
    });
    const sibling = shell(process.execPath, [orphaning, holder], { cwd: dir, timeoutMs: 30_000 });

    const [killed, survivor] = await Promise.all([timingOut, sibling]);

    assert.equal(killed.timedOut, true, 'the first call did not time out, so nothing was swept');
    assert.equal(
      survivor.stdout.includes('sibling-finished'),
      true,
      `the orphaned sibling's work was reaped by the timed-out call: ${JSON.stringify(survivor.stdout)}`,
    );
    assert.equal(survivor.timedOut, false, 'the sibling reports a timeout it never had');

    // And F2 is intact: the timed-out call's own descendant is still taken.
    const grand = pidFrom(grandPid);
    toClean.push(grand);
    assert.equal(died(grand, 10_000), true, `the timed-out call's descendant ${grand} survived`);
  });

  it('lets the sibling finish while the timed-out call and its descendants are gone', async () => {
    const dir = scratch();
    const grandPid = path.join(dir, 'grand.pid');
    const sleeper = script(dir, 'sleeper.mjs', SLEEPER);
    const patient = script(dir, 'patient.mjs', PATIENT);

    // A: snapshots now, backgrounds a descendant, and is killed at 2s — after B exists.
    const timingOut = shell(
      'sh',
      // `exec` so the shell *becomes* the sleep: the call then leaks exactly one descendant, which
      // is what makes the reaped count below a statement about ownership rather than about how many
      // processes `sh` happens to fork.
      ['-c', `${JSON.stringify(process.execPath)} ${JSON.stringify(sleeper)} ${JSON.stringify(grandPid)} & exec sleep 30`],
      { cwd: dir, timeoutMs: 2_000 },
    );

    // B: born ~400ms later, so it is absent from A's snapshot and present in the group at the sweep.
    await new Promise((resolve) => {
      setTimeout(resolve, 400);
    });
    const sibling = shell(process.execPath, [patient], { cwd: dir, timeoutMs: 30_000 });

    const [killed, survivor] = await Promise.all([timingOut, sibling]);

    assert.equal(killed.timedOut, true, 'the first call did not time out, so nothing swept');
    assert.equal(survivor.ok, true, `the sibling was reaped by the timed-out call: ${survivor.stderr}`);
    assert.equal(survivor.stdout.includes('sibling-finished'), true, survivor.stdout);
    assert.equal(survivor.timedOut, false, 'the sibling reports a timeout it never had');

    // And F2 is intact: the timed-out call's own descendant is still taken.
    const grand = pidFrom(grandPid);
    toClean.push(grand);
    assert.equal(died(grand, 10_000), true, `the leaked descendant ${grand} survived`);
    assert.equal((killed.reaped ?? []).includes(grand), true, `the sweep did not report it: ${JSON.stringify(killed.reaped)}`);
    assert.deepStrictEqual(
      killed.reaped,
      [grand],
      'the sweep took something that was not its own descendant',
    );
  });

  it('holds in the other order too, with the older call the one that dies', async () => {
    // The neighbour. Here the survivor predates the snapshot, so subtraction alone would protect
    // it — which is exactly why the original test passed while the defect was live. Asserted so
    // the sibling exclusion cannot be "fixed" in a way that breaks the case that already worked.
    const dir = scratch();
    const patient = script(dir, 'patient.mjs', PATIENT);

    const sibling = shell(process.execPath, [patient], { cwd: dir, timeoutMs: 30_000 });
    await new Promise((resolve) => {
      setTimeout(resolve, 400);
    });
    const timingOut = shell('sh', ['-c', 'sleep 30'], { cwd: dir, timeoutMs: 2_000 });

    const [survivor, killed] = await Promise.all([sibling, timingOut]);
    assert.equal(killed.timedOut, true);
    assert.equal(survivor.ok, true, `the older sibling was reaped: ${survivor.stderr}`);
    assert.equal(survivor.stdout.includes('sibling-finished'), true, survivor.stdout);
  });
});
