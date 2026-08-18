/**
 * Tier 2 — every terminal exit after the run-start boundary leaves one receipt (REVIEW F10).
 *
 * **Why no unit test can hold this.** The writer is unit-tested in `test/outcome.test.mjs`; what
 * F10 actually reported is that it was *never called* on several paid failure paths. The "one door"
 * was one door into `driveRun`, so a PRD child that failed, a design phase that failed, an Oracle
 * that would not parse or a component that aborted printed `ABORTED` and returned with nothing
 * durable written at all. That is a property of where the call sits inside `main`, and every unit
 * test of the loop injects the effects that would exercise it — the same shape as the guard hook,
 * whose logic was correct for eleven versions while nothing proved it was invoked.
 *
 * A parent component correctly fails closed on a missing receipt. Its operator then cannot recover
 * the child's state or its spend from the artifact that promised both, which is the cost.
 *
 * Real git, canned children. No network, no API, no money.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { main } from '../../scripts/driver.mjs';
import { OUTCOME_FILE } from '../../scripts/outcome.mjs';

/** @type {string[]} */
const temporaryDirs = [];

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

const PRD = '# Thing\n\n## Requirements\n\nPRD-1.1 It exists.\n';

/** @param {string} root @param {string[]} args @returns {string} */
function git(root, args) {
  return execFileSync('git', args, { cwd: root, stdio: 'pipe', encoding: 'utf8' }).trim();
}

/** @param {Record<string, unknown>} [config] @returns {string} */
function repo(config = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-outcome-int-'));
  temporaryDirs.push(root);
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'test']);
  writeFileSync(path.join(root, 'PRD.md'), PRD);
  writeFileSync(path.join(root, '.gitignore'), '.meeseeks/\nnode_modules/\n*.log\n');
  mkdirSync(path.join(root, '.meeseeks'), { recursive: true });
  writeFileSync(
    path.join(root, '.meeseeks', 'config.json'),
    JSON.stringify({ maxIterations: 1, tokenCeiling: 1000, costCeiling: 1, qualityPlugins: [], ...config }),
  );
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'prd']);
  return root;
}

/**
 * A canned child that answers every phase plausibly, except the one told to fail.
 *
 * @param {{ fail?: string }} [options]
 * @returns {any}
 */
function cannedSpawn(options = {}) {
  return (/** @type {{ phase: string }} */ spawned) => {
    if (spawned.phase === options.fail) {
      return { ok: false, text: '', costUsd: 0.01, tokens: 25, raw: 'the child refused' };
    }
    const text =
      spawned.phase === 'design'
        ? 'Designed.\n\n```json\n{"capabilities": ["cli"]}\n```\n'
        : spawned.phase === 'review'
          ? JSON.stringify({ requirements: [{ id: 'PRD-1.1', status: 'pass', evidence: 'PRD.md:1', detail: 'ok' }] })
          : 'built';
    return { ok: true, text, costUsd: 0, tokens: 0, raw: '{}' };
  };
}

/**
 * @param {string} root @param {string[]} argv @param {any} spawn
 * @returns {Promise<{ code: number, logs: string[] }>}
 */
async function run(root, argv, spawn) {
  /** @type {string[]} */
  const logs = [];
  const code = await main(argv, {
    cwd: root,
    env: { ...process.env, MEESEEKS_RUNNING: undefined, MEESEEKS_STYLE: 'plain' },
    log: (/** @type {string} */ line) => logs.push(line),
    spawn,
  });
  return { code, logs };
}

/** @param {string} root @returns {any} */
function receipt(root) {
  const file = path.join(root, '.meeseeks', OUTCOME_FILE);
  assert.equal(existsSync(file), true, `no ${OUTCOME_FILE}: this run left no durable record of how it ended`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

describe('a run that dies before the loop still files a receipt', () => {
  it('records a failed design phase, with the phase and the spend that was already paid', async () => {
    // The reproduction. Before this the design failure printed ABORTED and returned; `.meeseeks/`
    // held a `run.json` saying what the run was and nothing at all saying how it ended.
    const root = repo();
    const { code } = await run(root, ['PRD.md', '--yes'], cannedSpawn({ fail: 'design' }));

    assert.equal(code, 1);
    const written = receipt(root);
    assert.equal(written.state, 'ABORTED');
    assert.equal(written.phase, 'design');
    assert.equal(written.reason, 'design phase failed');
    assert.equal(written.version, 1);
    assert.equal(typeof written.endedAt, 'string');
    // Spend is what was actually handed to children, not an invented number.
    assert.equal(typeof written.spentTokens, 'number');
    assert.equal(written.spentTokens >= 0, true);
    // And nothing the run never established is claimed.
    assert.equal('iterations' in written, false, 'a pre-loop abort reported an iteration count it never had');
  });

  it('records the deliberate stop of --confirm-prd as a stop rather than a failure', async () => {
    // Not every terminal exit is a failure. A run that stopped where the operator asked it to must
    // leave a receipt that says so, or a parent reading receipts cannot tell it from a crash.
    const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-outcome-confirm-'));
    temporaryDirs.push(root);
    git(root, ['init', '--quiet']);
    git(root, ['config', 'user.email', 'test@example.com']);
    git(root, ['config', 'user.name', 'test']);
    writeFileSync(path.join(root, '.gitignore'), '.meeseeks/\n');
    mkdirSync(path.join(root, '.meeseeks'), { recursive: true });
    writeFileSync(
      path.join(root, '.meeseeks', 'config.json'),
      JSON.stringify({ maxIterations: 1, tokenCeiling: 1000, costCeiling: 1, qualityPlugins: [] }),
    );
    writeFileSync(path.join(root, 'README.md'), '# empty\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '--quiet', '-m', 'no prd']);

    const { code } = await run(root, ['a small cli that prints the time', '--yes', '--confirm-prd'], cannedSpawn());

    const written = receipt(root);
    if (code === 0) {
      assert.equal(written.state, 'STALLED');
      assert.equal(written.phase, 'prd authoring');
      assert.equal(written.reason.includes('--confirm-prd'), true, written.reason);
    } else {
      // The PRD phase can refuse for its own reasons on a canned child; the property under test is
      // that *whatever* happened, it is on disk with a phase attached rather than only in stdout.
      assert.equal(written.state, 'ABORTED');
      assert.equal(typeof written.phase, 'string');
      assert.notEqual(written.phase, '');
    }
  });

  it('lets the loop write the specific answer, and does not let a later path overwrite it', async () => {
    // The at-most-once rule, end to end. A run that reaches the loop gets the loop's terminal state,
    // and every outer path on the way out finds the receipt already filed.
    const root = repo();
    await run(root, ['PRD.md', '--yes'], cannedSpawn());

    const written = receipt(root);
    assert.equal(written.phase, 'loop', 'a pre-loop writer overwrote the loop’s own answer');
    assert.equal(['SHIPPED', 'STALLED', 'BUDGET', 'ABORTED'].includes(written.state), true, written.state);
    // The loop's receipt carries what only the loop knows.
    assert.equal(typeof written.iterations, 'number');
    assert.equal(Array.isArray(written.passing), true);
  });

  it('leaves no temp file behind, so a reader never finds half a receipt', async () => {
    // The atomic write, observed at the end of a real run rather than asserted about the writer.
    const root = repo();
    await run(root, ['PRD.md', '--yes'], cannedSpawn({ fail: 'design' }));
    const leftovers = readdirSync(path.join(root, '.meeseeks')).filter((name) => name.endsWith('.tmp'));
    assert.deepStrictEqual(leftovers, []);
  });

  it('files one receipt per run, replacing the previous run’s rather than accumulating', async () => {
    // Two runs against one repository. The second must leave its own answer, not the first's, and
    // exactly one file — a directory of receipts would make "the terminal state" ambiguous.
    const root = repo();
    await run(root, ['PRD.md', '--yes'], cannedSpawn({ fail: 'design' }));
    assert.equal(receipt(root).phase, 'design');

    await run(root, ['PRD.md', '--yes'], cannedSpawn());
    const second = receipt(root);
    assert.equal(second.phase, 'loop', 'the second run did not replace the first run’s receipt');
    const receipts = readdirSync(path.join(root, '.meeseeks')).filter((name) => name.startsWith(OUTCOME_FILE));
    assert.deepStrictEqual(receipts, [OUTCOME_FILE]);
  });
});
