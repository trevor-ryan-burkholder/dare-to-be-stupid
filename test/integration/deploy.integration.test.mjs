/**
 * Tier 2 — the deploy command's ceiling, against a real process (DESIGN.md §10.1, §11.1).
 *
 * The unit tests in `test/driver.test.mjs` drive `runDeploy` with an injected shell, so they
 * prove it *reports* a timeout correctly. They cannot prove one ever *happens*: the kill
 * behind the shell's ceiling is the operating system's contract, and §11.1's whole argument
 * is that an assertion about the array you build says nothing about what the callee does
 * with it. So this spawns a command that genuinely never returns and waits for the kill.
 *
 * The hazard being defended: before 0.79.0 nothing bounded the deploy command. `tokenCeiling`
 * and `costCeiling` bind children that return, and `runSmoke` carries its own deadline, so an
 * `ssh` sitting on a passphrase prompt no unattended run can answer would stall the driver
 * indefinitely, with the run looking identical to one doing useful work.
 *
 * No network, no API, no money. Just node and a process that sleeps.
 */

import assert from 'node:assert/strict';
import os from 'node:os';
import { describe, it } from 'node:test';

import { runDeploy } from '../../scripts/driver.mjs';

/**
 * A command that never finishes on its own, spelled without a shell so there is no shell to
 * outlive the kill. Ten minutes, which is far longer than any assertion below waits.
 *
 * @returns {string[]}
 */
function neverReturns() {
  return [process.execPath, '-e', 'setTimeout(() => {}, 600000)'];
}

/**
 * @param {{ command: string[], timeoutMs: number }} parts
 * @returns {import('../../scripts/config.mjs').DeployConfig}
 */
function deployConfig(parts) {
  return {
    enabled: true,
    command: parts.command,
    url: 'http://127.0.0.1:1',
    smoke: [{ path: '/health', status: 200 }],
    timeoutMs: parts.timeoutMs,
  };
}

describe('the deploy command is bounded by a real timeout', () => {
  it('kills a command that never returns, and says so rather than reporting an ordinary failure', async () => {
    const started = Date.now();
    const result = await runDeploy(deployConfig({ command: neverReturns(), timeoutMs: 1500 }), { cwd: os.tmpdir() });
    const elapsed = Date.now() - started;

    assert.equal(result.ok, false);
    assert.match(result.detail, /did not finish within 1500ms and was killed/);
    // The command asks for ten minutes. Anything under a fraction of that proves the ceiling
    // fired rather than the command finishing early for some other reason.
    assert.equal(elapsed < 30_000, true, `the deploy ran for ${elapsed}ms, so nothing killed it`);
  });

  it('never reaches the smoke checks, because there is no host to ask', async () => {
    // The smoke url points at port 1, which nothing serves. If the probe ran at all this
    // would come back describing a connection failure instead of the timeout.
    const result = await runDeploy(deployConfig({ command: neverReturns(), timeoutMs: 1500 }), { cwd: os.tmpdir() });
    assert.equal(/smoke/i.test(result.detail), false, `the smoke probe ran anyway: ${result.detail}`);
  });

  // The benign neighbour. A ceiling that also killed commands which finish would make the
  // feature unusable, and a test proving only the deny half proves only that it blocks
  // everything.
  it('leaves a command that finishes inside the ceiling alone', async () => {
    const result = await runDeploy(
      deployConfig({ command: [process.execPath, '-e', 'process.exit(0)'], timeoutMs: 30_000 }),
      { cwd: os.tmpdir() },
    );
    // The deploy itself succeeded, so the failure that comes back is the smoke check against
    // a port nothing is listening on — which is the proof it got that far.
    assert.equal(result.ok, false);
    assert.equal(/did not finish within/.test(result.detail), false, `the ceiling killed a command that exited: ${result.detail}`);
  });

  // The detector's benign neighbour, and it is not hypothetical. A child the ceiling killed
  // and a command that terminates itself both die by SIGTERM, so a detector keyed on the exit
  // signal would call a deploy script's own `kill` a timeout and send the operator looking
  // for a hung ssh that never existed. Only the ceiling's own timer may set `timedOut`.
  it('does not call a command that terminates itself a timeout', async () => {
    const result = await runDeploy(
      deployConfig({
        command: [process.execPath, '-e', 'process.kill(process.pid, "SIGTERM")'],
        timeoutMs: 30_000,
      }),
      { cwd: os.tmpdir() },
    );
    assert.equal(result.ok, false);
    assert.equal(/did not finish within/.test(result.detail), false, `a self-terminating command was reported as a timeout: ${result.detail}`);
  });

  it('reports a command that runs and fails as a failure rather than as a timeout', async () => {
    const result = await runDeploy(
      deployConfig({ command: [process.execPath, '-e', 'process.stderr.write("host key verification failed"); process.exit(7)'], timeoutMs: 30_000 }),
      { cwd: os.tmpdir() },
    );
    assert.equal(result.ok, false);
    assert.equal(result.detail, 'the deploy command failed: host key verification failed');
  });
});
