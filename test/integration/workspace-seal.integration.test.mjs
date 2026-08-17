/**
 * Tier 2 — a verdict is sealed to the bytes it was formed over (REVIEW F14, DESIGN.md §4).
 *
 * **The reproduction is a concurrent write, and it does not need a hostile double.** Gates and the
 * Panel inspect the live working tree; after the Panel returned, the loop ran `git add -A` and
 * committed whatever bytes existed at that later moment. Codex had a reviewer read `src/a.js` as
 * `reviewed bytes`, a concurrent write change it to `changed after review`, and `driveRun` commit
 * the latter and return `SHIPPED` — a cold verdict authorising code no reviewer and no
 * deterministic gate ever saw. A successful Builder can leave background descendants, and an
 * operator's editor writes to the same tree.
 *
 * The unit suite drives that through an injected identity, which proves the *decision*. What it
 * cannot prove is that the real hash, over a real git working tree, notices a real file appearing
 * while a real reviewer runs — whether git's first-party view and the loop's seal agree about what
 * counts as the candidate. So this drives `driveRun` against a real repository with the real
 * `workspaceHash`, and lets the canned reviewer write into the tree it is reviewing: the background
 * writer, made deterministic.
 *
 * The children are canned, so this costs nothing. The git and the hashing are real.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { defaultConfig } from '../../scripts/config.mjs';
import { driveRun, shell } from '../../scripts/driver.mjs';
import { workspaceHash } from '../../scripts/gate-cache.mjs';

/** @type {string[]} */
const temporaryDirs = [];

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** @param {string} root @param {string[]} args @returns {string} */
function git(root, args) {
  return execFileSync('git', args, { cwd: root, stdio: 'pipe', encoding: 'utf8' }).trim();
}

/** A real repository holding one reviewed source file. @returns {string} */
function repo() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-seal-'));
  temporaryDirs.push(root);
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'test']);
  writeFileSync(path.join(root, '.gitignore'), '.meeseeks/\nnode_modules/\n');
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeFileSync(path.join(root, 'src', 'a.js'), 'export const reviewed = "reviewed bytes";\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'reviewed bytes']);
  return root;
}

/**
 * Drive one iteration against a real tree, with the real workspace hash.
 *
 * @param {string} root
 * @param {{ onReview?: () => void }} [hooks]
 * @returns {Promise<{ outcome: import('../../scripts/driver.mjs').RunOutcome, committed: string[], shipped: number, logs: string[] }>}
 */
async function driveOnce(root, hooks = {}) {
  /** @type {string[]} */
  const logs = [];
  /** @type {string[]} */
  const committed = [];
  let shipped = 0;
  const outcome = await driveRun({
    config: { ...defaultConfig(), maxIterations: 1, stallLimit: 3, reviewers: ['correctness'] },
    meeseeksDir: path.join(root, '.meeseeks'),
    rootDir: root,
    requiredIds: ['PRD-1.1'],
    task: 'build the thing',
    effects: {
      build: () => {
        // A builder that writes, because a real one does and `git commit` refuses an empty commit.
        // This lands *before* the identity is captured, which is exactly where a builder's own
        // changes belong.
        writeFileSync(path.join(root, 'src', 'built.js'), 'export const built = true;\n');
        return { ok: true, text: 'built', costUsd: 0, tokens: 1, raw: '' };
      },
      review: () => {
        // The concurrent write, fired from inside the reviewer's own window.
        hooks.onReview?.();
        return {
          ok: true,
          costUsd: 0,
          tokens: 1,
          raw: '',
          text: JSON.stringify({
            requirements: [{ id: 'PRD-1.1', status: 'pass', evidence: 'src/a.js:1', detail: 'found it' }],
          }),
        };
      },
      realityCheck: () => ({ ok: true, text: 'buildable', costUsd: 0, tokens: 1, raw: '' }),
      gates: () => ({
        ok: true,
        results: [
          { name: 'lint', ok: true, status: 0, detail: 'passed' },
          { name: 'mutation', ok: true, status: 0, detail: 'no survivors' },
        ],
      }),
      readTestReports: () => [
        {
          numTotalTests: 1,
          testResults: [
            { name: 'test/a.test.js', assertionResults: [{ ancestorTitles: [], title: 'works', status: 'passed' }] },
          ],
        },
      ],
      checkSpecification: () => ({ ok: true, digest: 'sha256:spec', detail: 'PRD.md unchanged' }),
      // The real thing, over the real tree.
      workspaceIdentity: () => workspaceHash({ cwd: root, run: shell }),
      commit: (message) => {
        committed.push(message);
        execFileSync('git', ['add', '-A'], { cwd: root, stdio: 'pipe' });
        execFileSync('git', ['commit', '--no-verify', '-m', message], { cwd: root, stdio: 'pipe' });
        return git(root, ['rev-parse', 'HEAD']);
      },
      diffStat: () => ' 1 file changed',
      ship: () => {
        shipped += 1;
      },
      now: () => '2026-08-17T00:00:00.000Z',
      log: (line) => logs.push(line),
    },
  });
  return { outcome, committed, shipped, logs };
}

describe('a real write during a real review cannot reach the commit', () => {
  it('discards the verdict when a reviewer-era write edits a tracked file', async () => {
    // Codex's reproduction, byte for byte.
    const root = repo();
    const head = git(root, ['rev-parse', 'HEAD']);
    const driven = await driveOnce(root, {
      onReview: () => writeFileSync(path.join(root, 'src', 'a.js'), 'export const reviewed = "changed after review";\n'),
    });

    const all = driven.logs.join('\n');
    assert.notEqual(driven.outcome.state, 'SHIPPED');
    assert.equal(all.includes('changed while the panel was reading it'), true, all.slice(-900));
    assert.deepStrictEqual(driven.committed, [], 'bytes no reviewer saw were committed under that verdict');
    assert.equal(driven.shipped, 0);
    assert.equal(git(root, ['rev-parse', 'HEAD']), head, 'the tree was committed anyway');
    // Never swept, never repaired: the surprise is still on disk for the operator to look at.
    assert.equal(readFileSync(path.join(root, 'src', 'a.js'), 'utf8').includes('changed after review'), true);
  });

  it('discards the verdict when a reviewer-era write adds an untracked file', async () => {
    // An untracked addition is inside git's first-party view, so `git add -A` would have committed
    // it under the verdict exactly as an edit would.
    const root = repo();
    const driven = await driveOnce(root, {
      onReview: () => writeFileSync(path.join(root, 'src', 'sneaky.js'), 'export const sneaky = true;\n'),
    });
    assert.notEqual(driven.outcome.state, 'SHIPPED');
    assert.deepStrictEqual(driven.committed, []);
    assert.equal(existsSync(path.join(root, 'src', 'sneaky.js')), true, 'the refusal deleted the surprise');
  });

  it('discards the verdict when a reviewer-era write deletes a tracked file', async () => {
    const root = repo();
    const driven = await driveOnce(root, { onReview: () => rmSync(path.join(root, 'src', 'a.js')) });
    assert.notEqual(driven.outcome.state, 'SHIPPED');
    assert.deepStrictEqual(driven.committed, []);
  });

  it('discards the verdict when a reviewer-era write retargets a symlink', { skip: process.platform === 'win32' }, async () => {
    const root = repo();
    writeFileSync(path.join(root, 'src', 'b.js'), 'export const other = 2;\n');
    execFileSync('ln', ['-s', path.join(root, 'src', 'a.js'), path.join(root, 'src', 'link.js')]);
    git(root, ['add', '-A']);
    git(root, ['commit', '--quiet', '-m', 'a link']);
    const driven = await driveOnce(root, {
      onReview: () => {
        rmSync(path.join(root, 'src', 'link.js'));
        execFileSync('ln', ['-s', path.join(root, 'src', 'b.js'), path.join(root, 'src', 'link.js')]);
      },
    });
    assert.notEqual(driven.outcome.state, 'SHIPPED');
    assert.deepStrictEqual(driven.committed, []);
  });

  it('does not notice a write that only touches ignored machine state', async () => {
    // The boundary, stated as a test: `.meeseeks/` is driver-owned and gitignored, and the driver
    // writes there during every review. A seal that fired on its own bookkeeping would discard
    // every verdict this product ever forms.
    const root = repo();
    const driven = await driveOnce(root, {
      onReview: () => {
        mkdirSync(path.join(root, 'node_modules', 'dep'), { recursive: true });
        writeFileSync(path.join(root, 'node_modules', 'dep', 'index.js'), 'module.exports = 1;\n');
      },
    });
    assert.equal(driven.logs.join('\n').includes('changed while the panel'), false, driven.logs.join('\n').slice(-900));
    assert.equal(driven.outcome.state, 'SHIPPED');
  });

  // The benign neighbour that matters most: an ordinary iteration where nothing writes during the
  // review must reach its commit and its tag, or the product cannot ship at all.
  it('ships normally when nothing writes during the review', async () => {
    const root = repo();
    const driven = await driveOnce(root);
    assert.equal(driven.outcome.state, 'SHIPPED', driven.logs.join('\n').slice(-900));
    assert.equal(driven.shipped, 1);
    assert.equal(driven.committed.length, 1, driven.committed.join(' | '));
    // And the receipt says which bytes it was about.
    assert.match(String(driven.outcome.workspace), /^sha256:[0-9a-f]{64}$/);
  });
});
