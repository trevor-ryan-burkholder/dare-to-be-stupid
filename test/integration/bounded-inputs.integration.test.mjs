/**
 * Tier 2 — the operator's own specification is bounded before anything reads it (REVIEW F19).
 *
 * **`captureSpecification` reads `PRD.md` under `READ_LIMITS.specification`, and it is not the first
 * read.** When the operator names a file other than `PRD.md`, the driver copies it into place first,
 * and that copy read it whole — so an oversized specification died there, unbounded, before the
 * limit written for exactly this artifact could refuse it by name. A unit test of `readBounded`
 * cannot see that: the defect is which call the production path makes first.
 *
 * Real git, canned children. No network, no API call.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { READ_LIMITS } from '../../scripts/bounded-read.mjs';
import { main } from '../../scripts/driver.mjs';
import { OUTCOME_FILE } from '../../scripts/outcome.mjs';

/** @type {string[]} */
const temporaryDirs = [];

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** @param {string} root @param {string[]} args @returns {string} */
function git(root, args) {
  return execFileSync('git', args, { cwd: root, stdio: 'pipe', encoding: 'utf8' }).trim();
}

/** @param {string} body @returns {string} the repository root */
function repoWithSpec(body) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-bounded-'));
  temporaryDirs.push(root);
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'test']);
  writeFileSync(path.join(root, '.gitignore'), '.meeseeks/\nnode_modules/\n*.log\n');
  mkdirSync(path.join(root, 'spec'), { recursive: true });
  writeFileSync(path.join(root, 'spec', 'SOURCE.md'), body, 'utf8');
  mkdirSync(path.join(root, '.meeseeks'), { recursive: true });
  writeFileSync(
    path.join(root, '.meeseeks', 'config.json'),
    JSON.stringify({ maxIterations: 1, tokenCeiling: 1000, costCeiling: 1, qualityPlugins: [] }),
  );
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'spec']);
  return root;
}

/** @param {string} root @returns {Promise<{ code: number, logs: string[], phases: string[] }>} */
async function run(root) {
  /** @type {string[]} */
  const logs = [];
  /** @type {string[]} */
  const phases = [];
  const code = await main(['spec/SOURCE.md', '--yes', '--confirm-prd'], {
    cwd: root,
    env: { ...process.env, MEESEEKS_RUNNING: undefined, MEESEEKS_STYLE: 'plain' },
    log: (/** @type {string} */ line) => logs.push(line),
    spawn: /** @type {any} */ ((/** @type {{ phase: string }} */ options) => {
      phases.push(options.phase);
      return { ok: true, text: 'done', costUsd: 0, tokens: 1, raw: '{}' };
    }),
  });
  return { code, logs, phases };
}

const REQUIREMENTS = '# Thing\n\n## Requirements\n\nPRD-1.1 It exists.\n';

describe('an oversized specification is refused by name', () => {
  it('refuses before copying it, and says which artifact and how big', async () => {
    const root = repoWithSpec(`${REQUIREMENTS}${'x'.repeat(READ_LIMITS.specification)}`);

    const { code, logs, phases } = await run(root);

    assert.equal(code, 1);
    const all = logs.join('\n');
    assert.equal(all.includes(path.join('spec', 'SOURCE.md')), true, all.slice(-600));
    assert.equal(all.includes(String(READ_LIMITS.specification)), true, 'the limit was not named');
    assert.equal(all.includes('refused rather than'), true, all.slice(-600));
    // Nothing was spawned: the refusal costs no money, which is the point of bounding at the door.
    assert.deepStrictEqual(phases, []);
    // And it did not land in the tree on the way to being refused.
    assert.equal(existsSync(path.join(root, 'PRD.md')), false, 'the oversized document was copied anyway');
  });

  it('names the refusal in the terminal receipt, not only on stdout', async () => {
    // stdout has already proved unreliable for this project; the receipt is the durable half.
    const root = repoWithSpec(`${REQUIREMENTS}${'x'.repeat(READ_LIMITS.specification)}`);

    await run(root);

    const receipt = JSON.parse(readFileSync(path.join(root, '.meeseeks', OUTCOME_FILE), 'utf8'));
    assert.equal(receipt.state, 'ABORTED');
    assert.equal(receipt.phase, 'prd authoring');
    assert.equal(receipt.reason.includes('SOURCE.md'), true, receipt.reason);
  });

  it('accepts an ordinary specification, which is every real one', async () => {
    // The neighbour. A limit nothing can reach is the same as no limit; a limit everything reaches
    // is a product that does not run.
    const root = repoWithSpec(REQUIREMENTS);

    const { code } = await run(root);

    assert.equal(code, 0, 'an ordinary specification was refused');
    assert.equal(readFileSync(path.join(root, 'PRD.md'), 'utf8'), REQUIREMENTS);
  });
});
