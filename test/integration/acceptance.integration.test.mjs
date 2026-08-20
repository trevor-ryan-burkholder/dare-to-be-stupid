/**
 * Tier 2 — a run writes the acceptance edge it claims (REVIEW F22, PLAN item 76).
 *
 * **The module is unit-tested; that is not the finding.** F22 is that nothing *persisted* which
 * deterministic checks passed on which exact bytes — gate results are transient and the reports are
 * deliberately excluded from the archive — so an operator could establish that Meeseeks said
 * `SHIPPED`, read the panel, and reconstruct nothing in between. A receipt module nothing writes
 * would leave that exactly where it was, and this repository's recurring defect is precisely a
 * correct primitive with no caller.
 *
 * So this drives the real `main` with canned children and reads the file off disk.
 *
 * Real git, canned children. No network, no API call.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { ACCEPTANCE_FILE } from '../../scripts/acceptance-file.mjs';
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

/** @returns {string} */
function repo() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-acceptance-'));
  temporaryDirs.push(root);
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'test']);
  writeFileSync(path.join(root, 'PRD.md'), '# Thing\n\n## Requirements\n\nPRD-1.1 It exists.\n');
  writeFileSync(path.join(root, '.gitignore'), '.meeseeks/\nnode_modules/\n*.log\n');
  mkdirSync(path.join(root, '.meeseeks'), { recursive: true });
  writeFileSync(
    path.join(root, '.meeseeks', 'config.json'),
    JSON.stringify({ maxIterations: 1, tokenCeiling: 2000, costCeiling: 1, qualityPlugins: [] }),
  );
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'prd']);
  return root;
}

/**
 * @param {string} root @param {{ modelUsage?: Record<string, unknown> }} [envelope]
 * @returns {Promise<{ code: number, logs: string[] }>}
 */
async function run(root, envelope = {}) {
  /** @type {string[]} */
  const logs = [];
  const code = await main(['PRD.md', '--yes'], {
    cwd: root,
    env: { ...process.env, MEESEEKS_RUNNING: undefined, MEESEEKS_STYLE: 'plain' },
    log: (/** @type {string} */ line) => logs.push(line),
    spawn: /** @type {any} */ ((/** @type {{ phase: string, model: string }} */ options) => {
      const text =
        options.phase === 'design'
          ? 'Designed.\n\n```json\n{"capabilities": ["cli"]}\n```\n'
          : options.phase === 'review'
            ? JSON.stringify({ requirements: [{ id: 'PRD-1.1', status: 'pass', evidence: 'PRD.md:1', detail: 'ok' }] , attackAccount: 'Called the handler directly to bypass the role check, replayed an expired session cookie, and sent a negative quantity to the order endpoint. All three were rejected.' })
            : 'built';
      // The real `spawnClaude` derives `observedModels` from the envelope; an injected spawn has to
      // state it, and stating it is what lets this fixture model a substitution.
      const models = envelope.modelUsage ?? { [options.model]: {} };
      return {
        ok: true,
        text,
        costUsd: 0,
        tokens: 1,
        raw: '{}',
        observedModels: { observed: Object.keys(models) },
      };
    }),
  });
  return { code, logs };
}

describe('a run that never reaches a panel writes no acceptance claim', () => {
  // **The receipt is written where the loop reaches a terminal state, and it refuses to be
  // approximate.** A run whose gates never pass never convenes a panel, so there is no F14 tree seal
  // — and a claim with no subject is an opinion. The correct behaviour is a *logged refusal* beside
  // an ordinary terminal receipt, never a partial acceptance that a later reader treats as
  // provenance, and never an exception that destroys the run's own answer.
  //
  // The populated-receipt cases live at the loop, in `test/driver.test.mjs`, because reaching a
  // panel with canned children requires injecting the gate results — and doing that here would mean
  // asserting against a fixture rather than against the run.

  it('logs why, keeps the terminal receipt, and writes no acceptance file', async () => {
    const root = repo();

    const { logs } = await run(root);

    assert.equal(existsSync(path.join(root, '.meeseeks', 'outcome.json')), true, 'the run lost its terminal receipt');
    assert.equal(existsSync(path.join(root, '.meeseeks', ACCEPTANCE_FILE)), false, 'an incomplete acceptance was written');
    const said = logs.join('\n');
    assert.equal(said.includes('no acceptance receipt'), true, said.slice(-500));
    // And it says *which* field was missing, so the gap is actionable rather than mysterious.
    assert.equal(said.includes('subject.tree'), true, said.slice(-500));
  });

  it('still records every invocation, so the ledger is not lost with the claim', async () => {
    // The supply store is what the receipt reads back. A run that cannot make a claim must still
    // leave the evidence that would have supported one.
    const root = repo();

    await run(root);

    const store = JSON.parse(readFileSync(path.join(root, '.meeseeks', 'supply.json'), 'utf8'));
    assert.equal(store.entries.length > 0, true, 'no invocation was recorded');
    for (const entry of store.entries) {
      assert.equal(typeof entry.requestedModel, 'string');
      const tagged = Array.isArray(entry.models?.observed) || typeof entry.models?.unavailable === 'string';
      assert.equal(tagged, true, `${entry.role} recorded an untagged observation`);
    }
  });
});
