/**
 * Tier 2 — the human checkpoint, driven through the real `main` (REVIEW F24).
 *
 * `--confirm-prd` is the only deliberate review boundary before unattended work begins, and the
 * shipped command hid it: the `argument-hint` omitted it and the instructions said exactly two flags
 * may accompany an input, so the feature worked only for an operator who already knew an
 * undocumented spelling. `test/plugin-manifest.test.mjs` owns the command contract statically. What
 * it cannot show is the *behaviour* the command now advertises — that the first invocation stops
 * after committing `PRD.md`, and that the accepted run named as the continuation does not pay to
 * author the intent again.
 *
 * Real git, canned children. No network, no API call.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { main } from '../../scripts/driver.mjs';

/** @type {string[]} */
const temporaryDirs = [];

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** @param {string} root @param {string[]} args @returns {string} */
function git(root, args) {
  return execFileSync('git', args, { cwd: root, stdio: 'pipe', encoding: 'utf8' }).trim();
}

/** A repository with no PRD, so an idea has to be authored into one. @returns {string} */
function repoWithoutPrd() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-confirm-'));
  temporaryDirs.push(root);
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'test']);
  writeFileSync(path.join(root, '.gitignore'), '.meeseeks/\nnode_modules/\n*.log\n');
  writeFileSync(path.join(root, 'README.md'), '# nothing yet\n');
  mkdirSync(path.join(root, '.meeseeks'), { recursive: true });
  writeFileSync(
    path.join(root, '.meeseeks', 'config.json'),
    JSON.stringify({ maxIterations: 1, tokenCeiling: 1000, costCeiling: 1, qualityPlugins: [] }),
  );
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'empty repository']);
  return root;
}

const AUTHORED_PRD = '# The thing\n\n## Requirements\n\nPRD-1.1 It prints the time.\n';

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
      // The PRD author writes the document, which is what the checkpoint exists to let a human read.
      if (options.phase === 'prd') writeFileSync(path.join(options.cwd, 'PRD.md'), AUTHORED_PRD, 'utf8');
      const text =
        options.phase === 'design'
          ? 'Designed.\n\n```json\n{"capabilities": ["cli"]}\n```\n'
          : options.phase === 'prd'
            ? AUTHORED_PRD
            : 'done';
      return { ok: true, text, costUsd: 0, tokens: 1, raw: '{}' };
    }),
  });
  return { code, logs, phases };
}

describe('--confirm-prd stops after the document, and says how to continue', () => {
  it('commits PRD.md and spawns no phase after authoring it', async () => {
    const root = repoWithoutPrd();
    const { code, phases } = await run(root, ['a small cli that prints the time', '--yes', '--confirm-prd']);

    assert.equal(code, 0, 'the checkpoint is a deliberate stop, not a failure');
    assert.equal(existsSync(path.join(root, 'PRD.md')), true, 'nothing was written for the human to read');
    assert.equal(readFileSync(path.join(root, 'PRD.md'), 'utf8'), AUTHORED_PRD);
    // Committed, not merely written: the accepted run starts from what git holds.
    assert.equal(git(root, ['status', '--porcelain']), '', 'the PRD was left uncommitted');

    for (const later of ['design', 'oracle-author', 'builder', 'review']) {
      assert.equal(phases.includes(later), false, `the ${later} phase ran past the checkpoint: ${phases.join(', ')}`);
    }
  });

  it('names the exact continuation rather than telling the operator to remove a flag', async () => {
    // The old message said only "re-run without --confirm-prd". A literal no-input or repeated-idea
    // rerun enters the improvisation branch and spends a PRD-model call before retaining the file
    // that was just approved, so the wording is the defect, not a nicety.
    const root = repoWithoutPrd();
    const { logs } = await run(root, ['a small cli that prints the time', '--yes', '--confirm-prd']);
    const all = logs.join('\n');
    assert.equal(all.includes('/meeseeks ./PRD.md'), true, all.slice(-800));
    assert.equal(all.includes('not a resumed session'), true, all.slice(-800));
  });

  it('does not author the intent again when the accepted run names the file', async () => {
    // The half that costs money if it is wrong.
    const root = repoWithoutPrd();
    await run(root, ['a small cli that prints the time', '--yes', '--confirm-prd']);
    const approved = readFileSync(path.join(root, 'PRD.md'), 'utf8');

    const second = await run(root, ['PRD.md', '--yes']);
    assert.equal(second.phases.includes('prd'), false, `intent was re-authored: ${second.phases.join(', ')}`);
    assert.equal(readFileSync(path.join(root, 'PRD.md'), 'utf8'), approved, 'the approved document was rewritten');
  });

  it('runs the whole pipeline when the flag is absent, which is the ordinary shape', async () => {
    // The neighbour. A checkpoint that fired without being asked for would stop every run.
    const root = repoWithoutPrd();
    const { phases } = await run(root, ['a small cli that prints the time', '--yes']);
    assert.equal(phases.includes('design'), true, `the run stopped early without the flag: ${phases.join(', ')}`);
  });
});
