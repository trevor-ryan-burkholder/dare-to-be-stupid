/**
 * Tier 2 — a pre-loop phase may not record a commit that did not happen (REVIEW F26).
 *
 * **`shell` resolves `{ ok: false }` rather than throwing**, so `commitPhase` discarding the results
 * of `git add` and `git commit` was silent: the launch receipt recorded the phase as admitted and
 * committed, the function returned `true`, and the run carried on over a tree that still held the
 * changes. `driveRun`'s own commit closure has checked both since F31; the pre-loop path had not
 * been brought up to that standard, and the existing tier-2 fixtures could not see it because they
 * shell out to a real git that always succeeds.
 *
 * So this makes git genuinely fail. A read-only `.git/objects` is an ordinary disk-permission fault
 * — the kind an unattended overnight run actually meets — and it fails the write half of git while
 * leaving every read working, which is exactly the shape that used to slip through.
 *
 * Real git, canned children. No network, no API call.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { main } from '../../scripts/driver.mjs';
import { LAUNCH_RECEIPT_FILE } from '../../scripts/launch.mjs';
import { OUTCOME_FILE } from '../../scripts/outcome.mjs';

/** @type {string[]} */
const temporaryDirs = [];

after(() => {
  for (const dir of temporaryDirs) {
    // The objects directory is left writable, or the cleanup cannot remove the repository it made.
    try {
      chmodSync(path.join(dir, '.git', 'objects'), 0o755);
    } catch {
      // Already writable, or never created. Either way there is nothing to restore.
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

/** @param {string} root @param {string[]} args @returns {string} */
function git(root, args) {
  return execFileSync('git', args, { cwd: root, stdio: 'pipe', encoding: 'utf8' }).trim();
}

/** A committed repository with a PRD the run will want to copy and commit. @returns {string} */
function repo() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-phase-commit-'));
  temporaryDirs.push(root);
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'test']);
  writeFileSync(path.join(root, '.gitignore'), '.meeseeks/\nnode_modules/\n*.log\n');
  writeFileSync(path.join(root, 'README.md'), '# empty\n');
  mkdirSync(path.join(root, '.meeseeks'), { recursive: true });
  writeFileSync(
    path.join(root, '.meeseeks', 'config.json'),
    JSON.stringify({ maxIterations: 1, tokenCeiling: 1000, costCeiling: 1, qualityPlugins: [] }),
  );
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'base']);
  return root;
}

const AUTHORED = '# The thing\n\n## Requirements\n\nPRD-1.1 It prints the time.\n';

/**
 * @param {string} root @param {string[]} argv
 * @returns {Promise<{ code: number, logs: string[], phases: string[] }>}
 */
async function run(root, argv) {
  /** @type {string[]} */
  const logs = [];
  /** @type {string[]} */
  const phases = [];
  const code = await main(argv, {
    cwd: root,
    env: { ...process.env, MEESEEKS_RUNNING: undefined, MEESEEKS_STYLE: 'plain' },
    log: (/** @type {string} */ line) => logs.push(line),
    spawn: /** @type {any} */ ((/** @type {{ phase: string, cwd: string }} */ options) => {
      phases.push(options.phase);
      if (options.phase === 'prd') writeFileSync(path.join(options.cwd, 'PRD.md'), AUTHORED, 'utf8');
      const text =
        options.phase === 'design' ? 'Designed.\n\n```json\n{"capabilities": ["cli"]}\n```\n' : AUTHORED;
      return { ok: true, text, costUsd: 0, tokens: 1, raw: '{}' };
    }),
  });
  return { code, logs, phases };
}

/** @param {string} root @returns {any} */
function launchReceipt(root) {
  const file = path.join(root, '.meeseeks', LAUNCH_RECEIPT_FILE);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

describe('a phase whose commit failed is refused, not recorded', () => {
  it('refuses the run rather than reporting a phase git never committed', async () => {
    const root = repo();
    // Every read still works; only writing an object fails. The run gets all the way to staging.
    chmodSync(path.join(root, '.git', 'objects'), 0o555);

    const { code, logs } = await run(root, ['a small cli that prints the time', '--yes', '--confirm-prd']);

    assert.equal(code, 1, 'a failed pre-loop commit was reported as success');
    const all = logs.join('\n');
    assert.equal(/prd: git (add|commit) failed/.test(all), true, all.slice(-900));

    // The receipt must not claim the phase. A record naming a commit that did not happen is worse
    // than no record, because a later reader treats it as provenance.
    const receipt = launchReceipt(root);
    const recorded = receipt === null ? [] : (receipt.phases ?? []).map((/** @type {any} */ p) => p.phase);
    assert.equal(recorded.includes('prd'), false, `the receipt recorded an uncommitted phase: ${JSON.stringify(recorded)}`);

    // And the run still ended with a durable answer rather than a stack trace.
    assert.equal(existsSync(path.join(root, '.meeseeks', OUTCOME_FILE)), true, 'no receipt for a failed run');
  });

  it('leaves the tree uncommitted rather than half-recorded', async () => {
    const root = repo();
    chmodSync(path.join(root, '.git', 'objects'), 0o555);

    await run(root, ['a small cli that prints the time', '--yes', '--confirm-prd']);
    chmodSync(path.join(root, '.git', 'objects'), 0o755);

    // git never committed, so HEAD is still the base commit and the PRD is an uncommitted change.
    assert.equal(git(root, ['log', '--oneline']).split('\n').length, 1, 'something was committed after all');
    assert.equal(git(root, ['status', '--porcelain']).includes('PRD.md'), true, 'the PRD vanished rather than staying uncommitted');
  });

  it('commits and records the phase when git works, which is every ordinary run', async () => {
    // The neighbour. Refusing on a healthy repository would stop the product at its first phase.
    const root = repo();

    const { code } = await run(root, ['a small cli that prints the time', '--yes', '--confirm-prd']);

    assert.equal(code, 0, 'the checkpoint is a deliberate stop, not a failure');
    assert.equal(git(root, ['status', '--porcelain']), '', 'the PRD was left uncommitted');
    const receipt = launchReceipt(root);
    assert.notEqual(receipt, null, 'no launch receipt was written');
    const recorded = (receipt.phases ?? []).map((/** @type {any} */ p) => p.phase);
    assert.equal(recorded.includes('prd'), true, `the successful phase was not recorded: ${JSON.stringify(recorded)}`);
  });
});
