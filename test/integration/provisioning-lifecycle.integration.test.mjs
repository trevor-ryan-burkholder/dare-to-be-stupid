/**
 * Tier 2 — a pre-loop hang produces a terminal receipt and releases the lock (REVIEW F41, F44).
 *
 * Both findings end at the same unproven sentence. F41: *"a timed-out required plugin aborts with a
 * durable Phase-1 receipt"*. F44: *"the required full-Driver fixture has not yet shown that a
 * timed-out pre-loop Git helper produces the durable terminal receipt and releases the run lock, so
 * lifecycle closure evidence remains incomplete."*
 *
 * The mechanisms are proven separately — `plugin-deadline` shows the ceiling fires and the
 * descendants die, `git-deadline` shows the same for a resistant clean filter. What neither can show
 * is what happens **afterwards**, because both call a helper directly and the receipt and the lock
 * belong to `main`. That is the gap: a run that bounds its hang and then exits without a receipt,
 * still holding the repository, has converted an infinite hang into a silent one.
 *
 * So this drives the real `main` over a real repository and asks three questions of the aftermath:
 * did it exit non-zero, is there a durable `outcome.json`, and is the lock gone. The neighbour — an
 * ordinary run that reaches a builder — is what stops this passing against a `main` that refuses
 * everything before it starts.
 *
 * Real git, real files, real processes. No network, no API, no money.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { main } from '../../scripts/driver.mjs';
import { OUTCOME_FILE } from '../../scripts/outcome.mjs';
import { RUN_LOCK_FILE } from '../../scripts/run-lock.mjs';

/** @type {string[]} */
const dirs = [];
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** @param {string} root @param {string[]} args */
const git = (root, args) => execFileSync('git', args, { cwd: root, stdio: 'pipe', encoding: 'utf8' }).trim();

/**
 * A committed repository a run could legitimately start in.
 *
 * @param {{ stallSeconds?: number }} [options] when given, a repository-local clean filter that
 *   never returns in time — F44's verified reproduction, which a Builder can install itself with
 *   unrestricted Bash before the Driver's own Git calls run
 * @returns {string}
 */
function repo(options = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-lifecycle-'));
  dirs.push(root);
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'test@example.invalid']);
  git(root, ['config', 'user.name', 'test']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  writeFileSync(path.join(root, 'PRD.md'), '# Thing\n\n## Requirements\n\nPRD-1.1 It exists.\n', 'utf8');
  writeFileSync(path.join(root, '.gitignore'), '.meeseeks/\n', 'utf8');
  // Scaffolded rather than left to `meeseeks init`: an unconfigured repository is refused before
  // anything this test is about, and a run that never starts writes no receipt for a reason that
  // has nothing to do with a hang. One iteration and no quality plugins, so the only long thing in
  // the run is the Git helper under test.
  mkdirSync(path.join(root, '.meeseeks'), { recursive: true });
  writeFileSync(
    path.join(root, '.meeseeks', 'config.json'),
    JSON.stringify({ maxIterations: 1, tokenCeiling: 1000, costCeiling: 1, qualityPlugins: [] }),
    'utf8',
  );
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'prd']);

  if (options.stallSeconds !== undefined) {
    git(root, ['config', 'filter.stall.clean', `sleep ${options.stallSeconds}`]);
    writeFileSync(path.join(root, '.gitattributes'), 'payload.txt filter=stall\n', 'utf8');
    writeFileSync(path.join(root, 'payload.txt'), 'staged through the stalling filter\n', 'utf8');
  }
  return root;
}

/** A child that answers instantly, so nothing here depends on a model. */
const spawn = async () => ({ ok: true, text: 'done', costUsd: 0, tokens: 0, raw: '{}' });

/** @param {string} root @returns {Promise<{ code: number, logs: string[] }>} */
async function drive(root) {
  /** @type {string[]} */
  const logs = [];
  const code = await main(['PRD.md', '--yes'], {
    cwd: root,
    env: { ...process.env, MEESEEKS_RUNNING: undefined, MEESEEKS_STYLE: 'plain' },
    log: (/** @type {string} */ line) => logs.push(line),
    spawn: /** @type {any} */ (spawn),
  });
  return { code, logs };
}

/** @param {string} root @returns {boolean} */
const lockHeld = (root) => existsSync(path.join(root, '.meeseeks', RUN_LOCK_FILE));

/** @param {string} root @returns {Record<string, unknown> | null} */
function receipt(root) {
  const file = path.join(root, '.meeseeks', OUTCOME_FILE);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8'));
}

describe('a run that ends before its loop still closes properly (REVIEW F41, F44)', () => {
  it('leaves a durable receipt and no lock when a Git helper never returns', { timeout: 300_000 }, async () => {
    // F44's reproduction, driven through the whole product rather than through `git()` alone. The
    // filter sleeps far past every ceiling the run has, so if any Driver-owned Git call reaches it
    // unbounded the run cannot finish — and if the bound fires but the aftermath is missing, the
    // run finishes silently while still holding the repository.
    const root = repo({ stallSeconds: 600 });
    const { code } = await drive(root);

    assert.notEqual(code, 0, 'a run whose Git helper hung reported success');
    const written = receipt(root);
    assert.notEqual(written, null, 'the run ended with no durable receipt, so nothing recorded what happened');
    assert.equal(typeof written?.state, 'string');
    assert.equal(String(written?.reason).length > 0, true, 'the receipt states no reason');
    assert.equal(lockHeld(root), false, 'the run kept the repository lock after ending');
  });

  it('leaves a receipt and no lock on an ordinary run too, so the case above is about the hang', async () => {
    // The neighbour, and it is what makes the assertions above mean anything: a `main` that refused
    // every repository before starting would satisfy all three of them.
    const root = repo();
    const { code } = await drive(root);

    const written = receipt(root);
    assert.notEqual(written, null, 'an ordinary run left no receipt either, so the case above proved nothing');
    assert.equal(lockHeld(root), false);
    // Its state is whatever the run legitimately reached with an instant stub child; what matters
    // here is that the artifact exists and the lock is gone, not which terminal state it names.
    assert.equal(typeof code, 'number');
  });

  it('releases the lock even when the run is started twice in a row', async () => {
    // The property the two cases above only imply. A lock left behind is invisible until the *next*
    // run, which is hours later and unattended — so the check that actually matters is whether a
    // second run can start at all.
    const root = repo({ stallSeconds: 600 });
    await drive(root);
    assert.equal(lockHeld(root), false);
    const second = await drive(root);
    assert.equal(
      second.logs.some((line) => /another run (already )?holds|lock/i.test(line) && /held|owner|busy/i.test(line)),
      false,
      `the second run was refused by a stale lock: ${second.logs.slice(-5).join(' | ')}`,
    );
  });
});
