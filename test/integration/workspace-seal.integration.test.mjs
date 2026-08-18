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
  // The test file this harness's report names, on disk (REVIEW F35). Ratchet credit now requires
  // the defining file to exist in the candidate, so a fixture reporting a pass for a file it never
  // created is modelling the forged-identity case rather than an ordinary iteration.
  mkdirSync(path.join(root, 'test'), { recursive: true });
  writeFileSync(path.join(root, 'test', 'a.test.js'), '// the definition the report names\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'reviewed bytes']);
  return root;
}

/**
 * Drive one iteration against a real tree, with the real workspace hash.
 *
 * @param {string} root
 * @param {{ onReview?: () => void, onDeploy?: () => void | Promise<void> }} [hooks]
 * @returns {Promise<{ outcome: import('../../scripts/driver.mjs').RunOutcome, committed: string[],
 *   shipped: number, shippedCommit: string | null, logs: string[] }>}
 */
async function driveOnce(root, hooks = {}) {
  /** @type {string[]} */
  const logs = [];
  /** @type {string[]} */
  const committed = [];
  let shipped = 0;
  /** @type {string | null} */
  let shippedCommit = null;
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
      // Real git, asked the real question (REVIEW F31): is the tree this commit holds the tree that
      // was reviewed?
      verifyPublication: async () => {
        const status = await shell('git', ['status', '--porcelain'], { cwd: root });
        if (!status.ok) return { ok: false, detail: 'git could not describe the tree' };
        const dirty = status.stdout.split('\n').filter((line) => line.trim() !== '');
        // `head` is reported because the caller re-runs this after the deploy and compares it to
        // the commit it verified (REVIEW F38); `ok` alone cannot answer "did HEAD move".
        const head = git(root, ['rev-parse', 'HEAD']);
        return dirty.length === 0
          ? { ok: true, detail: 'clean', head }
          : { ok: false, detail: `${dirty.length} path(s) uncommitted after the commit`, head };
      },
      // The real thing, over the real tree.
      workspaceIdentity: () => workspaceHash({ cwd: root, run: shell }),
      // **Production `shell`, not `execFileSync`** (REVIEW F31). `execFileSync` *throws* on a failed
      // command; `shell` *returns* a result the caller has to inspect. A fixture built on the
      // throwing one cannot exercise the branch where a failure is silently ignored, which is
      // exactly why this file did not catch the publication hole it was written to guard.
      commit: async (message) => {
        committed.push(message);
        const added = await shell('git', ['add', '-A'], { cwd: root });
        if (!added.ok) throw new Error(`git add failed: ${added.stderr}`);
        const staged = await shell('git', ['diff', '--cached', '--name-only'], { cwd: root });
        if (staged.stdout.trim() !== '') {
          const done = await shell('git', ['commit', '--no-verify', '-m', message], { cwd: root });
          if (!done.ok) throw new Error(`git commit failed: ${done.stderr}`);
        }
        return git(root, ['rev-parse', 'HEAD']);
      },
      diffStat: () => ' 1 file changed',
      // A real deploy is an arbitrary operator command with write access to the repository, which
      // is the whole of REVIEW F38.
      deploy: async () => {
        await hooks.onDeploy?.();
        return { ok: true, detail: 'deployed' };
      },
      ship: (_iteration, commit) => {
        shipped += 1;
        shippedCommit = commit;
      },
      now: () => '2026-08-17T00:00:00.000Z',
      log: (line) => logs.push(line),
    },
  });
  return { outcome, committed, shipped, shippedCommit, logs };
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

// ---------------------------------------------------------------------------
// Git publication must succeed before anything is published (REVIEW F31)
// ---------------------------------------------------------------------------

/**
 * Drive one iteration whose commit genuinely fails partway, using real git.
 *
 * The failure is injected the way it happens: `git add` succeeds and writes the index, and the
 * index lock then exists when `git commit` runs, so git refuses for its own reasons rather than
 * because a double said so. This is the shape the old fixture could not reach, because it committed
 * through `execFileSync` — which throws — instead of production `shell`, which returns a result the
 * caller must inspect.
 *
 * @param {string} root
 * @param {{ failOn: 'add' | 'commit' | 'tag' }} options
 * @returns {Promise<{ outcome: import('../../scripts/driver.mjs').RunOutcome, shipped: number, deploys: number, logs: string[] }>}
 */
async function drivePublication(root, options) {
  /** @type {string[]} */
  const logs = [];
  let shipped = 0;
  let deploys = 0;
  const lock = path.join(root, '.git', 'index.lock');
  const outcome = await driveRun({
    config: { ...defaultConfig(), maxIterations: 1, stallLimit: 3, reviewers: ['correctness'] },
    meeseeksDir: path.join(root, '.meeseeks'),
    rootDir: root,
    requiredIds: ['PRD-1.1'],
    task: 'build the thing',
    effects: {
      build: () => {
        writeFileSync(path.join(root, 'src', 'built.js'), 'export const built = true;\n');
        return { ok: true, text: 'built', costUsd: 0, tokens: 1, raw: '' };
      },
      review: () => ({
        ok: true,
        costUsd: 0,
        tokens: 1,
        raw: '',
        text: JSON.stringify({
          requirements: [{ id: 'PRD-1.1', status: 'pass', evidence: 'src/a.js:1', detail: 'found it' }],
        }),
      }),
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
      workspaceIdentity: () => workspaceHash({ cwd: root, run: shell }),
      verifyPublication: async () => {
        const status = await shell('git', ['status', '--porcelain'], { cwd: root });
        if (!status.ok) return { ok: false, detail: 'git could not describe the tree' };
        const dirty = status.stdout.split('\n').filter((line) => line.trim() !== '');
        return dirty.length === 0
          ? { ok: true, detail: 'clean' }
          : { ok: false, detail: `${dirty.length} path(s) uncommitted after the commit` };
      },
      commit: async (message) => {
        if (options.failOn === 'add') writeFileSync(lock, '');
        const added = await shell('git', ['add', '-A'], { cwd: root });
        if (!added.ok) throw new Error(`git add failed: ${added.stderr.trim().slice(0, 200)}`);
        // Real git, refusing for its own reason: the index lock exists when commit runs.
        if (options.failOn === 'commit') writeFileSync(lock, '');
        const staged = await shell('git', ['diff', '--cached', '--name-only'], { cwd: root });
        if (staged.stdout.trim() !== '') {
          const done = await shell('git', ['commit', '--no-verify', '-m', message], { cwd: root });
          if (!done.ok) throw new Error(`git commit failed: ${done.stderr.trim().slice(0, 200)}`);
        }
        return git(root, ['rev-parse', 'HEAD']);
      },
      diffStat: () => ' 1 file changed',
      deploy: () => {
        deploys += 1;
        return { ok: true, detail: 'deployed' };
      },
      ship: async () => {
        if (options.failOn === 'tag') throw new Error('git could not write the iteration tag');
        shipped += 1;
      },
      now: () => '2026-08-17T00:00:00.000Z',
      log: (line) => logs.push(line),
    },
  });
  return { outcome, shipped, deploys, logs };
}

describe('a failed git publication cannot reach deploy, tag or SHIPPED', () => {
  it('does not ship when the commit fails after staging', async () => {
    const root = repo();
    const head = git(root, ['rev-parse', 'HEAD']);
    let outcome;
    try {
      outcome = await drivePublication(root, { failOn: 'commit' });
    } catch (error) {
      // A commit that could not happen ends the run; whether it surfaces as a thrown effect or a
      // terminal outcome, the property under test is that nothing was published.
      outcome = { outcome: { state: 'ABORTED' }, shipped: 0, deploys: 0, logs: [String(error)] };
    }
    assert.notEqual(outcome.outcome.state, 'SHIPPED');
    assert.equal(outcome.shipped, 0, 'a tag was written over a commit that failed');
    assert.equal(outcome.deploys, 0, 'a deploy ran on a commit that failed');
    assert.equal(git(root, ['rev-parse', 'HEAD']), head, 'HEAD moved despite the commit failing');
    assert.equal(git(root, ['tag', '--list']).includes('GRAND-PRIZE'), false);
  });

  it('does not ship when the staging step itself fails', async () => {
    const root = repo();
    const head = git(root, ['rev-parse', 'HEAD']);
    let shipped = 0;
    try {
      const driven = await drivePublication(root, { failOn: 'add' });
      shipped = driven.shipped;
      assert.notEqual(driven.outcome.state, 'SHIPPED');
    } catch {
      // Thrown effect, same property.
    }
    assert.equal(shipped, 0);
    assert.equal(git(root, ['rev-parse', 'HEAD']), head);
  });

  it('does not report SHIPPED when the tag cannot be written', async () => {
    // A tag that failed leaves a run claiming SHIPPED with no artifact anyone can inspect — the
    // audit that could not verify the first SHIPPED, repeated.
    const root = repo();
    const driven = await drivePublication(root, { failOn: 'tag' });
    assert.equal(driven.outcome.state, 'ABORTED', driven.logs.join('\n').slice(-400));
    assert.match(driven.outcome.reason, /could not be published/);
  });

  it('withholds the ship when the tree is still dirty after the commit', async () => {
    // The seal says the working bytes are the reviewed ones; this says git actually holds them. A
    // commit that silently left a reviewed path behind is not the reviewed tree.
    const root = repo();
    let shipped = 0;
    const outcome = await driveRun({
      config: { ...defaultConfig(), maxIterations: 1, stallLimit: 3, reviewers: ['correctness'] },
      meeseeksDir: path.join(root, '.meeseeks'),
      rootDir: root,
      requiredIds: ['PRD-1.1'],
      task: 'build the thing',
      effects: {
        build: () => {
          writeFileSync(path.join(root, 'src', 'built.js'), 'export const built = true;\n');
          return { ok: true, text: 'built', costUsd: 0, tokens: 1, raw: '' };
        },
        review: () => ({
          ok: true,
          costUsd: 0,
          tokens: 1,
          raw: '',
          text: JSON.stringify({
            requirements: [{ id: 'PRD-1.1', status: 'pass', evidence: 'src/a.js:1', detail: 'found it' }],
          }),
        }),
        realityCheck: () => ({ ok: true, text: 'buildable', costUsd: 0, tokens: 1, raw: '' }),
        gates: () => ({ ok: true, results: [{ name: 'mutation', ok: true, status: 0, detail: 'no survivors' }] }),
        readTestReports: () => [
          {
            numTotalTests: 1,
            testResults: [
              { name: 'test/a.test.js', assertionResults: [{ ancestorTitles: [], title: 'works', status: 'passed' }] },
            ],
          },
        ],
        checkSpecification: () => ({ ok: true, digest: 'sha256:spec', detail: 'PRD.md unchanged' }),
        workspaceIdentity: () => workspaceHash({ cwd: root, run: shell }),
        // The real question, answered honestly against a tree that was never fully committed.
        verifyPublication: async () => {
          const status = await shell('git', ['status', '--porcelain'], { cwd: root });
          const dirty = status.stdout.split('\n').filter((line) => line.trim() !== '');
          return dirty.length === 0
            ? { ok: true, detail: 'clean' }
            : { ok: false, detail: `${dirty.length} path(s) uncommitted after the commit` };
        },
        // Commits only the tracked change, deliberately leaving the builder's new file behind.
        commit: async (message) => {
          await shell('git', ['add', 'src/a.js'], { cwd: root });
          await shell('git', ['commit', '--no-verify', '--allow-empty', '-m', message], { cwd: root });
          return git(root, ['rev-parse', 'HEAD']);
        },
        diffStat: () => ' 1 file changed',
        ship: () => {
          shipped += 1;
        },
        now: () => '2026-08-17T00:00:00.000Z',
        log: () => {},
      },
    });
    assert.notEqual(outcome.state, 'SHIPPED');
    assert.equal(shipped, 0, 'a tag was written over a tree git did not hold');
  });

  // The benign neighbour: published commit, sealed identity, deploy and tag all converge.
  it('ships when the commit really lands and the tree is clean', async () => {
    const root = repo();
    const driven = await driveOnce(root);
    assert.equal(driven.outcome.state, 'SHIPPED', driven.logs.join('\n').slice(-600));
    assert.equal(driven.shipped, 1);
    assert.equal(git(root, ['status', '--porcelain']), '', 'the shipped tree was not clean');
  });
});

describe('a deploy cannot move what gets tagged (REVIEW F38)', () => {
  // The deploy is an arbitrary operator command that runs *after* the publication check and after
  // the ship-time mutation gate, with full write access to the repository. Only specification drift
  // was rechecked afterwards, and `ship()` tagged implicit `HEAD` — so a deploy could commit its own
  // source and receive both tags and a `SHIPPED` over bytes no gate and no reviewer had seen. F31's
  // false-completion class, one step later in the pipeline.

  it('withholds the ship when the deploy commits without touching the working tree', async () => {
    // The case only the HEAD comparison can catch: an empty commit leaves the working tree byte
    // identical, so the sealed identity still matches and the tree is still clean. Everything the
    // pipeline checked before the deploy still says yes, and the tag would name the wrong commit.
    const root = repo();
    const driven = await driveOnce(root, {
      onDeploy: () => {
        git(root, ['commit', '--allow-empty', '--no-verify', '-m', 'deploy: a commit nobody reviewed']);
      },
    });

    const all = driven.logs.join('\n');
    assert.notEqual(driven.outcome.state, 'SHIPPED');
    assert.equal(driven.shipped, 0, 'a tag was written over a commit the deploy created');
    assert.equal(driven.shippedCommit, null);
    assert.equal(all.includes('the deploy moved HEAD from the reviewed commit'), true, all.slice(-900));
    // The deploy's commit is left alone: this withholds a claim, it does not repair the repository.
    assert.equal(git(root, ['log', '-1', '--format=%s']), 'deploy: a commit nobody reviewed');
  });

  it('withholds the ship when the deploy commits changed source', async () => {
    const root = repo();
    const driven = await driveOnce(root, {
      onDeploy: () => {
        writeFileSync(path.join(root, 'src', 'a.js'), 'export const a = "written by the deploy";\n');
        git(root, ['add', '-A']);
        git(root, ['commit', '--no-verify', '-m', 'deploy: edited source']);
      },
    });

    assert.notEqual(driven.outcome.state, 'SHIPPED');
    assert.equal(driven.shipped, 0, 'bytes the deploy wrote were tagged as reviewed');
    assert.equal(
      driven.logs.join('\n').includes('cannot ship:'),
      true,
      driven.logs.join('\n').slice(-900),
    );
    assert.equal(readFileSync(path.join(root, 'src', 'a.js'), 'utf8').includes('written by the deploy'), true);
  });

  it('withholds the ship when the deploy leaves the tree dirty', async () => {
    const root = repo();
    const driven = await driveOnce(root, {
      onDeploy: () => {
        writeFileSync(path.join(root, 'src', 'a.js'), 'export const a = "uncommitted deploy edit";\n');
      },
    });

    assert.notEqual(driven.outcome.state, 'SHIPPED');
    assert.equal(driven.shipped, 0);
    assert.equal(driven.logs.join('\n').includes('cannot ship:'), true, driven.logs.join('\n').slice(-900));
  });

  it('ships a clean deploy, and tags exactly the commit that was reviewed', async () => {
    // The neighbour. Withholding every ship is not a guarantee, it is a broken product: an ordinary
    // deploy that touches nothing must still reach SHIPPED, and the tag must name the reviewed
    // commit explicitly rather than whatever `HEAD` happens to be by then.
    const root = repo();
    const driven = await driveOnce(root, { onDeploy: () => {} });

    assert.equal(driven.outcome.state, 'SHIPPED', driven.logs.join('\n').slice(-900));
    assert.equal(driven.shipped, 1);
    assert.equal(driven.shippedCommit, git(root, ['rev-parse', 'HEAD']), 'the tag did not name the reviewed commit');
    assert.deepStrictEqual(driven.committed, ['meeseeks: iteration 1']);
  });
});
