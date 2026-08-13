/**
 * Tier 2 — worktree racing against real git (DESIGN.md §13.6, §11.1).
 *
 * `race.mjs` injects everything that touches git, which is what makes its decision logic
 * unit-testable. It is also what makes those unit tests blind to the only questions that
 * matter here: does `git worktree add --detach` actually accept these arguments, does
 * `--force` removal actually leave the administrative area clean, does `merge --ff-only`
 * actually fast-forward, and does `--numstat` actually emit what `parseNumstat` expects.
 *
 * Every one of those contracts belongs to git, not to us. HANDOFF.md's closing lesson is
 * exactly this: `claudeArgs` was unit-tested, and the defect lived in another program's
 * parsing of the array it built.
 *
 * No network, no API, no money. Just git.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { defaultRunner } from '../../scripts/plugins.mjs';
import { applyWinner, createWorktrees, parseNumstat, removeWorktrees, worktreeName } from '../../scripts/race.mjs';

/** @type {string[]} */
const temporaryDirs = [];

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * @param {string} cwd
 * @param {string[]} argv
 * @returns {string}
 */
function git(cwd, argv) {
  return execFileSync('git', argv, { cwd, stdio: 'pipe', encoding: 'utf8' }).trim();
}

/**
 * A real git repository with one commit.
 * @returns {string}
 */
function makeRepo() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dare-race-integration-'));
  temporaryDirs.push(dir);
  git(dir, ['init', '--quiet']);
  // Not `--initial-branch`: it arrived in git 2.28 and this suite found a machine without it
  // on its first run. `symbolic-ref` has worked forever and works before the first commit.
  git(dir, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
  git(dir, ['config', 'user.email', 'test@example.invalid']);
  git(dir, ['config', 'user.name', 'Integration Test']);
  // Local config only, so a contributor's global commit.gpgsign cannot hang the suite on a
  // passphrase prompt.
  git(dir, ['config', 'commit.gpgsign', 'false']);
  writeFileSync(path.join(dir, 'a.txt'), 'one\n', 'utf8');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '--quiet', '-m', 'initial']);
  return dir;
}

/**
 * @param {string} repo
 * @param {string} suffix
 * @returns {string}
 */
function worktreeParent(repo, suffix) {
  const parentDir = path.join(path.dirname(repo), `${path.basename(repo)}-${suffix}`);
  temporaryDirs.push(parentDir);
  return parentDir;
}

describe('worktrees against real git', () => {
  it('creates detached worktrees at the base commit, and removes every one', () => {
    const repo = makeRepo();
    const base = git(repo, ['rev-parse', 'HEAD']);
    const parentDir = worktreeParent(repo, 'worktrees');

    const created = createWorktrees({ cwd: repo, run: defaultRunner, n: 3, base, parentDir });
    assert.deepEqual(created.problems, []);
    assert.deepEqual(
      created.worktrees.map((worktree) => path.basename(worktree.dir)),
      [worktreeName(1), worktreeName(2), worktreeName(3)],
    );

    // Detached on purpose: a candidate that is not on a branch cannot move one.
    for (const worktree of created.worktrees) {
      assert.equal(git(worktree.dir, ['rev-parse', 'HEAD']), base);
      assert.throws(() => git(worktree.dir, ['symbolic-ref', 'HEAD']), 'a candidate must not be on a branch');
    }
    assert.equal(git(repo, ['worktree', 'list']).split('\n').length, 4);

    const removed = removeWorktrees({ cwd: repo, run: defaultRunner, worktrees: created.worktrees });
    assert.deepEqual(removed.problems, []);
    assert.equal(removed.removed.length, 3);
    // The failure this guards: `git worktree add` refuses a directory it already knows about,
    // so one leaked worktree breaks every later race and blames a directory rather than the
    // race that left it behind.
    assert.equal(git(repo, ['worktree', 'list']).split('\n').length, 1);
  });

  it('lets a later race reuse the same names, which is the real cost of a leak', () => {
    const repo = makeRepo();
    const base = git(repo, ['rev-parse', 'HEAD']);
    const parentDir = worktreeParent(repo, 'reuse');

    const first = createWorktrees({ cwd: repo, run: defaultRunner, n: 2, base, parentDir });
    removeWorktrees({ cwd: repo, run: defaultRunner, worktrees: first.worktrees });
    const second = createWorktrees({ cwd: repo, run: defaultRunner, n: 2, base, parentDir });
    assert.deepEqual(second.problems, []);
    assert.equal(second.worktrees.length, 2);
    removeWorktrees({ cwd: repo, run: defaultRunner, worktrees: second.worktrees });
  });

  it('fast-forwards the main tree onto a candidate commit', () => {
    const repo = makeRepo();
    const base = git(repo, ['rev-parse', 'HEAD']);
    const parentDir = worktreeParent(repo, 'winner');

    const created = createWorktrees({ cwd: repo, run: defaultRunner, n: 1, base, parentDir });
    const candidate = created.worktrees[0];
    writeFileSync(path.join(candidate.dir, 'a.txt'), 'one\ntwo\n', 'utf8');
    writeFileSync(path.join(candidate.dir, 'b.txt'), 'new\n', 'utf8');
    git(candidate.dir, ['add', '-A']);
    git(candidate.dir, ['commit', '--quiet', '--no-verify', '-m', 'candidate 1']);
    const commit = git(candidate.dir, ['rev-parse', 'HEAD']);

    const merged = applyWinner({ cwd: repo, run: defaultRunner, commit });
    assert.equal(merged.ok, true, merged.detail);
    assert.equal(git(repo, ['rev-parse', 'HEAD']), commit);
    assert.equal(readFileSync(path.join(repo, 'b.txt'), 'utf8'), 'new\n');
    // A pointer move, not a merge commit nobody reviewed.
    assert.equal(git(repo, ['rev-list', '--count', `${base}..HEAD`]), '1');

    removeWorktrees({ cwd: repo, run: defaultRunner, worktrees: created.worktrees });
  });

  it('refuses to merge a commit that does not descend from the main tree', () => {
    // The whole safety argument for `--ff-only`. If the main tree has moved, the merge must
    // fail loudly rather than invent a merge commit.
    const repo = makeRepo();
    const base = git(repo, ['rev-parse', 'HEAD']);
    const parentDir = worktreeParent(repo, 'diverged');

    const created = createWorktrees({ cwd: repo, run: defaultRunner, n: 1, base, parentDir });
    const candidate = created.worktrees[0];
    writeFileSync(path.join(candidate.dir, 'a.txt'), 'candidate\n', 'utf8');
    git(candidate.dir, ['add', '-A']);
    git(candidate.dir, ['commit', '--quiet', '--no-verify', '-m', 'candidate']);
    const commit = git(candidate.dir, ['rev-parse', 'HEAD']);

    writeFileSync(path.join(repo, 'a.txt'), 'main moved\n', 'utf8');
    git(repo, ['add', '-A']);
    git(repo, ['commit', '--quiet', '--no-verify', '-m', 'main moved']);

    const merged = applyWinner({ cwd: repo, run: defaultRunner, commit });
    assert.equal(merged.ok, false);
    assert.equal(merged.detail.length > 0, true, 'a refused merge must say why');

    removeWorktrees({ cwd: repo, run: defaultRunner, worktrees: created.worktrees });
  });
});

describe('parseNumstat against real git output', () => {
  it("agrees with git's own arithmetic", () => {
    // Cross-checked against `--shortstat`, which git computes independently of `--numstat`.
    const repo = makeRepo();
    writeFileSync(path.join(repo, 'a.txt'), 'one\ntwo\nthree\n', 'utf8');
    writeFileSync(path.join(repo, 'b.txt'), 'x\ny\n', 'utf8');
    git(repo, ['add', '-A']);
    git(repo, ['commit', '--quiet', '--no-verify', '-m', 'second']);

    const parsed = parseNumstat(git(repo, ['diff', '--numstat', 'HEAD~1', 'HEAD']));
    const shortstat = git(repo, ['diff', '--shortstat', 'HEAD~1', 'HEAD']);

    const files = Number(/(\d+) files? changed/.exec(shortstat)?.[1] ?? -1);
    const insertions = Number(/(\d+) insertions?/.exec(shortstat)?.[1] ?? 0);
    const deletions = Number(/(\d+) deletions?/.exec(shortstat)?.[1] ?? 0);

    assert.equal(parsed.filesChanged, files, `numstat says ${parsed.filesChanged} files, shortstat says ${shortstat}`);
    assert.equal(parsed.linesChanged, insertions + deletions, `against: ${shortstat}`);
  });

  it('counts a real binary file as a changed file with no measurable lines', () => {
    // The documented understatement, confirmed against git rather than against a fixture
    // someone typed to match the documentation.
    const repo = makeRepo();
    writeFileSync(path.join(repo, 'blob.bin'), Buffer.from([0, 1, 2, 0, 255, 0]));
    git(repo, ['add', '-A']);
    git(repo, ['commit', '--quiet', '--no-verify', '-m', 'binary']);

    const raw = git(repo, ['diff', '--numstat', 'HEAD~1', 'HEAD']);
    assert.equal(raw.startsWith('-\t-\t'), true, `git no longer marks binaries with dashes: ${raw}`);
    assert.deepEqual(parseNumstat(raw), { filesChanged: 1, linesChanged: 0 });
  });

  it('reads an empty diff as no change', () => {
    const repo = makeRepo();
    assert.deepEqual(parseNumstat(git(repo, ['diff', '--numstat', 'HEAD', 'HEAD'])), {
      filesChanged: 0,
      linesChanged: 0,
    });
  });
});

// The defect that made racing useless, reproduced against real git before it was fixed. The
// unit tests in test/race.test.mjs assert the argv this builds; whether `git stash push
// --include-untracked` actually clears a tree enough for `merge --ff-only` to proceed is git's
// contract, not ours, and that is exactly the distinction tier 2 exists for.
describe('landing a winner on the dirty tree a race actually finds', () => {
  it('fast-forwards anyway, and leaves the ungated changes in the stash rather than in the tree', () => {
    const repo = makeRepo();
    const parentDir = worktreeParent(repo, 'dirty');
    const base = git(repo, ['rev-parse', 'HEAD']);
    const created = createWorktrees({ cwd: repo, run: defaultRunner, n: 1, base, parentDir });
    const worktree = created.worktrees[0];

    // The candidate does its work from the base commit, exactly as a real one does.
    writeFileSync(path.join(worktree.dir, 'winner.txt'), 'candidate work\n', 'utf8');
    git(worktree.dir, ['add', '-A']);
    git(worktree.dir, ['commit', '--quiet', '--no-verify', '-m', 'candidate 1']);
    const commit = git(worktree.dir, ['rev-parse', 'HEAD']);

    // Meanwhile the main tree looks how it looked in the live run: a tracked file modified and
    // untracked gate debris sitting beside it.
    writeFileSync(path.join(repo, 'a.txt'), 'one\ntwo\n', 'utf8');
    writeFileSync(path.join(repo, 'debris.txt'), 'stryker\n', 'utf8');

    const applied = applyWinner({ cwd: repo, run: defaultRunner, commit });

    assert.equal(applied.ok, true, applied.detail);
    assert.equal(git(repo, ['rev-parse', 'HEAD']), commit);
    assert.equal(readFileSync(path.join(repo, 'winner.txt'), 'utf8'), 'candidate work\n');
    // The ungated edit is gone from the tree and recoverable from the stash.
    assert.equal(readFileSync(path.join(repo, 'a.txt'), 'utf8'), 'one\n');
    assert.equal(git(repo, ['stash', 'list']).includes('set aside before landing a race winner'), true);

    removeWorktrees({ cwd: repo, run: defaultRunner, worktrees: created.worktrees });
  });

  it('restores the tree when the merge fails for a reason stashing cannot fix', () => {
    const repo = makeRepo();
    writeFileSync(path.join(repo, 'a.txt'), 'one\ntwo\n', 'utf8');

    const applied = applyWinner({ cwd: repo, run: defaultRunner, commit: 'not-a-commit' });

    assert.equal(applied.ok, false);
    assert.equal(applied.detail.includes('restored'), true, applied.detail);
    // The operator's tree is exactly as they left it, and there is no stash to go looking for.
    assert.equal(readFileSync(path.join(repo, 'a.txt'), 'utf8'), 'one\ntwo\n');
    assert.equal(git(repo, ['stash', 'list']), '');
  });

  // The benign neighbour: the clean-tree path must not gain a stash it never needed.
  it('leaves a clean tree untouched, with nothing stashed', () => {
    const repo = makeRepo();
    const parentDir = worktreeParent(repo, 'clean');
    const base = git(repo, ['rev-parse', 'HEAD']);
    const created = createWorktrees({ cwd: repo, run: defaultRunner, n: 1, base, parentDir });
    const worktree = created.worktrees[0];
    writeFileSync(path.join(worktree.dir, 'winner.txt'), 'candidate work\n', 'utf8');
    git(worktree.dir, ['add', '-A']);
    git(worktree.dir, ['commit', '--quiet', '--no-verify', '-m', 'candidate 1']);
    const commit = git(worktree.dir, ['rev-parse', 'HEAD']);

    const applied = applyWinner({ cwd: repo, run: defaultRunner, commit });

    assert.equal(applied.ok, true, applied.detail);
    assert.equal(applied.detail, `fast-forwarded to ${commit}`);
    assert.equal(git(repo, ['stash', 'list']), '');

    removeWorktrees({ cwd: repo, run: defaultRunner, worktrees: created.worktrees });
  });
});
