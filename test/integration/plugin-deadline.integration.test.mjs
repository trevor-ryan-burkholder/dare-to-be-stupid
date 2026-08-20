/**
 * Tier 2 — a resistant provisioning command through the real bounded shell (REVIEW F41).
 *
 * **What the unit tests cannot reach.** `test/plugins.test.mjs` drives `installQualityPlugins` with
 * immediate injected runners, so it proves the branch *shape*: given `timedOut`, a required plugin
 * throws and an optional one warns. It cannot prove that a `timedOut` ever arrives — that a real
 * process which ignores polite termination is actually forced down that path, that it settles inside
 * the ceiling, and that its descendants are gone afterwards. F41 is explicit that this is the gap:
 * *"mechanism wiring does not substitute for the external-process contract this finding exists to
 * test."*
 *
 * So the runner here is the **real `shell`** from the driver — the same bounded one production
 * injects — pointed at a local script that backgrounds a sleeper and then hangs. Two things are
 * substituted and neither is the mechanism: *which command* runs, because the registry's commands
 * are real tools this test must not invoke, and the *ceiling value*, because the production detect
 * ceiling is sixty seconds and a sixty-second test is one nobody runs. The ceiling that was
 * **handed over** is asserted to be the production constant, so the propagation half stays real.
 *
 * The sleeper is the point. Its parent shell exits immediately, so the pid it writes belongs to a
 * process nothing is waiting for — the shape that survives a kill aimed only at the direct child.
 *
 * No network, no package registry, no money.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { DETECT_TIMEOUT_MS, INSTALL_TIMEOUT_MS, PluginInstallError, installQualityPlugins } from '../../scripts/plugins.mjs';
import { shell } from '../../scripts/driver.mjs';

/** A ceiling short enough to run, long enough that a healthy command would finish inside it. */
const TEST_CEILING_MS = 1_500;

/** How long after the ceiling the process must be gone. */
const GRACE_MS = 8_000;

/** @type {string[]} */
const dirs = [];
/** @type {number[]} */
const sleepers = [];

afterEach(() => {
  // A test for leaks that leaks would be its own joke.
  while (sleepers.length > 0) {
    const pid = sleepers.pop();
    if (pid === undefined) continue;
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Already gone, which is the outcome under test.
    }
  }
  while (dirs.length > 0) rmSync(String(dirs.pop()), { recursive: true, force: true });
});

/** @param {number} pid @returns {boolean} `ps` rather than `kill(0)`: a zombie answers `kill(0)`. */
function alive(pid) {
  const state = String(spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' }).stdout).trim();
  return state !== '' && !state.startsWith('Z');
}

/** @param {number} pid @param {number} timeoutMs @returns {boolean} */
function died(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!alive(pid)) return true;
  }
  return false;
}

/** @param {string} file @returns {number} */
function sleeperPid(file) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const pid = Number(readFileSync(file, 'utf8').trim());
      if (Number.isInteger(pid) && pid > 0) return pid;
    } catch {
      // Not written yet; the shell backgrounds it, so this is a real race.
    }
  }
  throw new Error(`the sleeper never wrote ${file}, so this test proved nothing`);
}

/**
 * A runner that sends every provisioning command to a resistant script through the real `shell`.
 *
 * @param {{ pidFile: string, seen: { command: string, timeoutMs: number | undefined }[] }} record
 */
function resistantRunner(record) {
  return (/** @type {string} */ command, /** @type {string[]} */ _args, /** @type {any} */ options) => {
    record.seen.push({ command, timeoutMs: options.timeoutMs });
    // The sleeper detaches from the shell that starts it and then the shell hangs, so the ceiling
    // has something to fire against and something is left behind when it does.
    const script = `sh -c 'echo $$ > ${record.pidFile}; exec sleep 600' & sleep 600`;
    return shell('sh', ['-c', script], { cwd: options.cwd, timeoutMs: TEST_CEILING_MS });
  };
}

/** @returns {{ dir: string, pidFile: string }} */
function workspace() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-plugin-deadline-'));
  dirs.push(dir);
  return { dir, pidFile: path.join(dir, 'sleeper.pid') };
}

describe('a resistant provisioning command, through the real bounded shell (REVIEW F41)', () => {
  it('kills a required plugin detector that ignores its deadline, and leaves no descendant', async () => {
    const { dir, pidFile } = workspace();
    /** @type {{ command: string, timeoutMs: number | undefined }[]} */
    const seen = [];
    const started = Date.now();

    await assert.rejects(
      () => installQualityPlugins({ cwd: dir, plugins: ['impeccable'], runner: resistantRunner({ pidFile, seen }) }),
      (error) => error instanceof PluginInstallError && /did not finish within/.test(error.message),
    );

    // Settled inside the ceiling plus grace, rather than whenever the sleeper happened to exit.
    assert.equal(Date.now() - started < TEST_CEILING_MS + GRACE_MS, true, 'the deadline did not bound the wait');

    // The propagation half: the ceiling handed to the runner is production's, not the test's.
    assert.equal(seen.length, 1);
    assert.equal(seen[0].timeoutMs, DETECT_TIMEOUT_MS);

    // And the descendant is gone, which is the half no injected double can show.
    const pid = sleeperPid(pidFile);
    sleepers.push(pid);
    assert.equal(died(pid, GRACE_MS), true, `the sleeper ${pid} outlived the provisioning timeout`);
  });

  it('reports a timed-out required plugin as a timeout, never as an absent tool', async () => {
    // The distinction F41 requires. A detection that hangs says nothing about whether the tool is
    // present, and reading it as absent escalates straight into a ten-minute install attempt.
    const { dir, pidFile } = workspace();
    await assert.rejects(
      () => installQualityPlugins({ cwd: dir, plugins: ['impeccable'], runner: resistantRunner({ pidFile, seen: [] }) }),
      (error) => {
        const message = error instanceof Error ? error.message : '';
        return /says nothing about whether the tool is present/.test(message) && !/not installed/.test(message);
      },
    );
    const pid = sleeperPid(pidFile);
    sleepers.push(pid);
    assert.equal(died(pid, GRACE_MS), true);
  });

  it('warns and proceeds for an optional plugin, only after the command has settled', async () => {
    const { dir, pidFile } = workspace();
    const started = Date.now();
    const result = await installQualityPlugins({
      cwd: dir,
      plugins: ['knip'],
      runner: resistantRunner({ pidFile, seen: [] }),
    });
    assert.equal(Date.now() - started < TEST_CEILING_MS + GRACE_MS, true);
    assert.equal(result.warnings.some((line) => /did not finish within/.test(line)), true, result.warnings.join('; '));
    // Proceeded: no gate was contributed by a plugin whose detection never answered.
    assert.equal(result.gates.some((gate) => gate.plugin === 'knip'), false);
    const pid = sleeperPid(pidFile);
    sleepers.push(pid);
    assert.equal(died(pid, GRACE_MS), true, 'an optional timeout proceeded while its descendant was still running');
  });

  it('leaves the ordinary neighbours alone: a present tool is skipped and a failing install is fatal', async () => {
    // Without these the cases above would be satisfied by an implementation that timed out on
    // everything, which is a wall rather than a deadline.
    const { dir } = workspace();
    const present = await installQualityPlugins({
      cwd: dir,
      plugins: ['impeccable'],
      runner: () => ({ ok: true, status: 0, stdout: '4.0.4', stderr: '' }),
    });
    assert.deepEqual(present.skipped, ['impeccable']);
    assert.deepEqual(present.warnings, []);

    await assert.rejects(
      () =>
        installQualityPlugins({
          cwd: dir,
          plugins: ['impeccable'],
          runner: (/** @type {string} */ _c, /** @type {string[]} */ args) =>
            args.includes('--version')
              ? { ok: false, status: 1, stdout: '', stderr: 'not found' }
              : { ok: false, status: 1, stdout: '', stderr: 'registry said no' },
        }),
      (error) => error instanceof PluginInstallError && !/did not finish within/.test(error.message),
    );
  });

  it('hands the install step its own, longer ceiling', async () => {
    // Detection is short because it asks a tool already present for its version; installation is
    // long because it may genuinely download. Both are ceilings on a hang rather than budgets, and
    // handing the install the detect ceiling would fail every real download.
    const { dir, pidFile } = workspace();
    /** @type {{ command: string, timeoutMs: number | undefined }[]} */
    const seen = [];
    const runner = resistantRunner({ pidFile, seen });
    await installQualityPlugins({
      cwd: dir,
      plugins: ['knip'],
      runner: (/** @type {string} */ command, /** @type {string[]} */ args, /** @type {any} */ options) =>
        args.includes('--version')
          ? { ok: false, status: 1, stdout: '', stderr: 'absent' }
          : runner(command, args, options),
    });
    assert.equal(seen.length, 1, 'the install step never ran');
    assert.equal(seen[0].timeoutMs, INSTALL_TIMEOUT_MS);
    const pid = sleeperPid(pidFile);
    sleepers.push(pid);
    assert.equal(died(pid, GRACE_MS), true);
  });
});
