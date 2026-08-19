/**
 * Tier 2 — every envelope the run bought is charged exactly once (REVIEW F18, DESIGN.md §3.5).
 *
 * **Two holes, and both were in the seam between "a child returned" and "the run knows it".** The
 * Oracle author's result went from `runChild` straight to the parser without ever reaching
 * `chargePreLoop`, so its tokens and dollars were absent from `alreadySpent`, from every ceiling
 * the loop then checked, and from the final bill — a run could begin below a token ceiling that
 * pre-loop work had already crossed. And the parallel Panel charged and adjudicated in one pass, so
 * an early failure returned with the later reviewers' spend unrecorded even though all of them had
 * completed and been paid for.
 *
 * The unit suite drives the Panel arithmetic directly. What it cannot show is the property that
 * actually matters across the whole program: **the run's terminal receipt equals the sum of every
 * envelope any phase returned** — pre-loop and loop, whichever phases a real invocation happens to
 * reach. So this drives the real `main` against real git, with a canned child that hands out a
 * distinct sentinel per phase, and balances the ledger against `.meeseeks/outcome.json`.
 *
 * The children are canned, so this costs nothing.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

/**
 * @param {Record<string, unknown>} extraConfig
 * @returns {string}
 */
function repo(extraConfig = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-spend-'));
  temporaryDirs.push(root);
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'test']);
  writeFileSync(path.join(root, 'PRD.md'), '# Thing\n\n## Requirements\n\nPRD-1.1 It exists.\n');
  writeFileSync(path.join(root, '.gitignore'), '.meeseeks/\nnode_modules/\n*.log\n');
  mkdirSync(path.join(root, '.meeseeks'), { recursive: true });
  writeFileSync(
    path.join(root, '.meeseeks', 'config.json'),
    JSON.stringify({ maxIterations: 1, tokenCeiling: 0, costCeiling: 0, qualityPlugins: [], ...extraConfig }),
  );
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'prd']);
  return root;
}

/**
 * A distinct sentinel per phase, so a missing charge is visible as a specific number rather than
 * as a total that happens to be wrong.
 *
 * @type {Record<string, { tokens: number, costUsd: number }>}
 */
const SENTINEL = {
  prd: { tokens: 1, costUsd: 0.01 },
  'oracle-author': { tokens: 2, costUsd: 0.02 },
  design: { tokens: 4, costUsd: 0.04 },
  'reality-check': { tokens: 8, costUsd: 0.08 },
  builder: { tokens: 16, costUsd: 0.16 },
  review: { tokens: 32, costUsd: 0.32 },
  'security-escalation': { tokens: 64, costUsd: 0.64 },
  'lesson-extractor': { tokens: 128, costUsd: 1.28 },
};

const ORACLE_CASES = '```json\n' + JSON.stringify([{ id: 'O-1', argv: ['--version'], expectExit: 0 }]) + '\n```';

/**
 * @param {{ handed: { phase: string, tokens: number, costUsd: number }[] }} ledger
 * @returns {any}
 */
function cannedSpawn(ledger) {
  return (/** @type {{ phase: string }} */ options) => {
    const usage = SENTINEL[options.phase] ?? { tokens: 256, costUsd: 2.56 };
    ledger.handed.push({ phase: options.phase, ...usage });
    const text =
      options.phase === 'design'
        ? 'Designed.\n\n```json\n{"capabilities": ["cli"]}\n```\n'
        : options.phase === 'oracle-author'
          ? ORACLE_CASES
          : options.phase === 'review'
            ? JSON.stringify({ requirements: [{ id: 'PRD-1.1', status: 'pass', evidence: 'PRD.md:1', detail: 'ok' }] , attackAccount: 'Called the handler directly to bypass the role check, replayed an expired session cookie, and sent a negative quantity to the order endpoint. All three were rejected.' })
            : 'done';
    return { ok: true, text, costUsd: usage.costUsd, tokens: usage.tokens, raw: '{}' };
  };
}

/**
 * @param {string} root
 * @returns {Promise<{ handed: { phase: string, tokens: number, costUsd: number }[], outcome: any, logs: string[] }>}
 */
async function runAndBalance(root) {
  /** @type {string[]} */
  const logs = [];
  /** @type {{ handed: { phase: string, tokens: number, costUsd: number }[] }} */
  const ledger = { handed: [] };
  await main(['PRD.md', '--yes'], {
    cwd: root,
    env: { ...process.env, MEESEEKS_RUNNING: undefined, MEESEEKS_STYLE: 'plain' },
    log: (/** @type {string} */ line) => logs.push(line),
    spawn: cannedSpawn(ledger),
  });
  const file = path.join(root, '.meeseeks', 'outcome.json');
  return { handed: ledger.handed, outcome: JSON.parse(readFileSync(file, 'utf8')), logs };
}

describe('the terminal receipt equals what the run actually bought', () => {
  it('balances every phase a run reached, including the Oracle author', async () => {
    // `oracle.enabled` is off by default, so it is armed here on purpose: the Oracle author is one
    // of the two phases whose spend never reached the ledger at all.
    const root = repo({ oracle: { enabled: true } });
    const balanced = await runAndBalance(root);

    assert.equal(
      balanced.handed.some((entry) => entry.phase === 'oracle-author'),
      true,
      `the oracle author never ran: ${balanced.handed.map((entry) => entry.phase).join(', ')}`,
    );
    const tokens = balanced.handed.reduce((total, entry) => total + entry.tokens, 0);
    const cost = balanced.handed.reduce((total, entry) => total + entry.costUsd, 0);
    assert.equal(
      balanced.outcome.spentTokens,
      tokens,
      `receipt ${balanced.outcome.spentTokens} vs bought ${tokens} across ${balanced.handed.map((e) => e.phase).join(', ')}`,
    );
    assert.equal(Number(balanced.outcome.costUsd.toFixed(6)), Number(cost.toFixed(6)));
  });

  it('balances a run with no Oracle, which is the default shape', async () => {
    // The benign neighbour: the same property must hold for the ordinary configuration, or the
    // repair has only moved the imbalance somewhere else.
    const root = repo();
    const balanced = await runAndBalance(root);
    assert.equal(
      balanced.handed.some((entry) => entry.phase === 'oracle-author'),
      false,
      'the oracle ran with the feature switched off',
    );
    const tokens = balanced.handed.reduce((total, entry) => total + entry.tokens, 0);
    assert.equal(balanced.outcome.spentTokens, tokens, `receipt ${balanced.outcome.spentTokens} vs bought ${tokens}`);
  });

  it('charges the Oracle author before the loop starts, so a ceiling sees it', async () => {
    // The consequence the finding names: pre-loop spend that never reached `alreadySpent` let a
    // run begin below a token ceiling that pre-loop work had already crossed. With a ceiling of 4
    // the PRD (1) plus the oracle (2) plus the design (4) crosses it, and the run must end there
    // rather than paying for a builder.
    const root = repo({ oracle: { enabled: true }, tokenCeiling: 4 });
    const balanced = await runAndBalance(root);
    assert.equal(balanced.outcome.state, 'BUDGET', `${balanced.outcome.state}: ${balanced.outcome.reason}`);
    assert.equal(
      balanced.handed.some((entry) => entry.phase === 'builder'),
      false,
      'a builder was paid for after the ceiling had already been crossed',
    );
  });
});
