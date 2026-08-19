/**
 * Tier 2 — the immutable candidate, against real git (REVIEW F14).
 *
 * **Every claim this module makes is a claim about git's behaviour**, so none of them can be settled
 * by a double. That a temporary index leaves the repository's own index alone, that `git add -A`
 * into it includes untracked-but-not-ignored files and excludes ignored ones, that a tree object is
 * the same name for the same bytes and a different one for different bytes, that `checkout --force`
 * replaces tracked files and leaves ignored ones — all of it is the contract of another program.
 * `scripts/candidate.mjs` is a thin arrangement of those facts and would be worth nothing if any of
 * them were different.
 *
 * Real git. No network, no API, no money.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import {
  candidateDirFor,
  materializeCandidate,
  removeCandidate,
  resolveGitDir,
  shareToolCaches,
  snapshotIndexFor,
  sweepCandidateWorktrees,
  workingTreeMatchesCandidate,
  writeSnapshotTree,
} from '../../scripts/candidate.mjs';
import { shell } from '../../scripts/driver.mjs';

/** @type {string[]} */
const temporaryDirs = [];

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** @param {string} root @param {string[]} args @returns {string} */
const git = (root, args) => execFileSync('git', args, { cwd: root, stdio: 'pipe', encoding: 'utf8' }).trim();

/** @returns {string} */
function scratch() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-candidate-test-'));
  temporaryDirs.push(dir);
  return dir;
}

/** A repository with one tracked file, one untracked file and one ignored directory. @returns {string} */
function repo() {
  const root = path.join(scratch(), 'work');
  mkdirSync(root, { recursive: true });
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'test']);
  writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n.meeseeks/\n');
  writeFileSync(path.join(root, 'tracked.js'), 'export const tracked = 1;\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'base']);
  writeFileSync(path.join(root, 'untracked.js'), 'export const untracked = 2;\n');
  mkdirSync(path.join(root, 'node_modules', 'dep'), { recursive: true });
  writeFileSync(path.join(root, 'node_modules', 'dep', 'index.js'), 'module.exports = 3;\n');
  mkdirSync(path.join(root, '.meeseeks'), { recursive: true });
  writeFileSync(path.join(root, '.meeseeks', 'state.json'), '{"passing":[]}');
  return root;
}

/** @param {string} root @param {number} [iteration] */
const materialize = (root, iteration = 1) =>
  materializeCandidate({ cwd: root, run: shell, dir: path.join(path.dirname(root), 'meeseeks-candidate-9'), iteration });

describe('writeSnapshotTree', () => {
  it('stages into its own index and leaves the repository’s alone', async () => {
    // **The property that keeps a run from wrecking the operator's repository.** Staging into
    // `.git/index` would leave everything staged after every iteration and would race with the
    // commit the loop makes at the end of one.
    const root = repo();
    const before = git(root, ['status', '--porcelain']);

    const gitDir = await resolveGitDir({ cwd: root, run: shell });
    assert.equal(typeof gitDir, 'string');
    const written = await writeSnapshotTree({ cwd: root, run: shell, gitDir: /** @type {string} */ (gitDir) });

    assert.equal(written.ok, true, JSON.stringify(written));
    assert.equal(git(root, ['status', '--porcelain']), before, 'the repository index moved');
    assert.equal(existsSync(snapshotIndexFor(/** @type {string} */ (gitDir))), true, 'no temporary index was written');
  });

  it('includes untracked files and excludes ignored ones, which is what a commit will do', async () => {
    const root = repo();
    const gitDir = /** @type {string} */ (await resolveGitDir({ cwd: root, run: shell }));
    const written = await writeSnapshotTree({ cwd: root, run: shell, gitDir });
    assert.equal(written.ok, true);

    const listed = git(root, ['ls-tree', '-r', '--name-only', /** @type {any} */ (written).tree]).split('\n');
    assert.deepStrictEqual(listed.sort(), ['.gitignore', 'tracked.js', 'untracked.js']);
  });

  it('names the same bytes the same way and different bytes differently', async () => {
    // What makes the pre-commit check an equality rather than another sample.
    const root = repo();
    const gitDir = /** @type {string} */ (await resolveGitDir({ cwd: root, run: shell }));
    const first = await writeSnapshotTree({ cwd: root, run: shell, gitDir });
    const again = await writeSnapshotTree({ cwd: root, run: shell, gitDir });
    assert.equal(/** @type {any} */ (first).tree, /** @type {any} */ (again).tree);

    writeFileSync(path.join(root, 'tracked.js'), 'export const tracked = 99;\n');
    const changed = await writeSnapshotTree({ cwd: root, run: shell, gitDir });
    assert.notEqual(/** @type {any} */ (changed).tree, /** @type {any} */ (first).tree);
  });

  it('forgets a deleted file rather than carrying it from the previous snapshot', async () => {
    // The index is rebuilt from nothing every time. A reused one keeps the deleted entry, and the
    // subject would then contain bytes the working copy does not have.
    const root = repo();
    const gitDir = /** @type {string} */ (await resolveGitDir({ cwd: root, run: shell }));
    await writeSnapshotTree({ cwd: root, run: shell, gitDir });
    rmSync(path.join(root, 'untracked.js'));
    const after_ = await writeSnapshotTree({ cwd: root, run: shell, gitDir });

    const listed = git(root, ['ls-tree', '-r', '--name-only', /** @type {any} */ (after_).tree]).split('\n');
    assert.equal(listed.includes('untracked.js'), false, listed.join(', '));
  });

  it('refuses rather than naming a tree when the repository is not one', async () => {
    const dir = scratch();
    assert.equal(await resolveGitDir({ cwd: dir, run: shell }), null);
    const made = await materializeCandidate({ cwd: dir, run: shell, dir: path.join(dir, 'wt'), iteration: 1 });
    assert.equal(made.ok, false);
    assert.equal(/** @type {any} */ (made).detail.includes('not a git repository'), true);
  });
});

describe('materializeCandidate', () => {
  it('checks out the snapshot into a worktree the main tree cannot reach', async () => {
    const root = repo();
    const made = await materialize(root);
    assert.equal(made.ok, true, JSON.stringify(made));
    const ready = /** @type {any} */ (made);
    temporaryDirs.push(ready.dir);

    assert.equal(readFileSync(path.join(ready.dir, 'tracked.js'), 'utf8'), 'export const tracked = 1;\n');
    assert.equal(readFileSync(path.join(ready.dir, 'untracked.js'), 'utf8'), 'export const untracked = 2;\n');
    assert.equal(existsSync(path.join(ready.dir, 'node_modules')), false, 'an ignored path entered the subject');
    assert.equal(ready.dir.startsWith(root), false, 'the subject is inside the tree being judged');
    await removeCandidate({ cwd: root, run: shell, dir: ready.dir });
  });

  it('gives the subject a `.meeseeks/` for its gates to write reports into', async () => {
    // **Found by the first test that let a real gate write a real report into a real candidate**
    // (PLAN item 95). `.meeseeks/` is ignored, so a checkout never creates it — and a runner told
    // `--outputFile=<candidate>/.meeseeks/test-report.json` writes nothing, exits zero, and the loop
    // reads "the test report contained no tests at all" on every iteration forever. Every earlier
    // tier-2 suite injects `readTestReports` and could not see it.
    const root = repo();
    const made = /** @type {any} */ (await materialize(root));
    temporaryDirs.push(made.dir);

    const stateDir = path.join(made.dir, '.meeseeks');
    assert.equal(existsSync(stateDir), true, 'a gate writing a report into the candidate would write nothing');
    writeFileSync(path.join(stateDir, 'test-report.json'), '{"numTotalTests":0}');
    assert.equal(existsSync(path.join(stateDir, 'test-report.json')), true);
    await removeCandidate({ cwd: root, run: shell, dir: made.dir });
  });

  it('leaves the main tree unchanged, including its branch', async () => {
    const root = repo();
    const head = git(root, ['rev-parse', 'HEAD']);
    const branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const status = git(root, ['status', '--porcelain']);

    const made = await materialize(root);
    temporaryDirs.push(/** @type {any} */ (made).dir);

    assert.equal(git(root, ['rev-parse', 'HEAD']), head, 'the snapshot commit moved the branch');
    assert.equal(git(root, ['rev-parse', '--abbrev-ref', 'HEAD']), branch);
    assert.equal(git(root, ['status', '--porcelain']), status);
    await removeCandidate({ cwd: root, run: shell, dir: /** @type {any} */ (made).dir });
  });

  it('a write to the main tree after materializing does not reach the subject', async () => {
    // **The whole point, in one case.** The background writer F14 describes writes here; the thing
    // being judged is over there.
    const root = repo();
    const made = /** @type {any} */ (await materialize(root));
    temporaryDirs.push(made.dir);

    writeFileSync(path.join(root, 'tracked.js'), 'export const tracked = "swapped";\n');
    assert.equal(readFileSync(path.join(made.dir, 'tracked.js'), 'utf8'), 'export const tracked = 1;\n');
    await removeCandidate({ cwd: root, run: shell, dir: made.dir });
  });

  it('reuses one worktree across iterations, replacing tracked bytes and keeping the caches', async () => {
    // A fresh worktree per iteration would throw away the gate cache and the installed browsers,
    // turning an optimization into a per-iteration reinstall. Ignored files survive the checkout.
    const root = repo();
    const first = /** @type {any} */ (await materialize(root, 1));
    temporaryDirs.push(first.dir);
    mkdirSync(path.join(first.dir, '.meeseeks'), { recursive: true });
    writeFileSync(path.join(first.dir, '.meeseeks', 'gate-cache.json'), '{"kept":true}');

    writeFileSync(path.join(root, 'tracked.js'), 'export const tracked = 2;\n');
    const second = /** @type {any} */ (await materialize(root, 2));

    assert.equal(second.dir, first.dir, 'a second worktree was created');
    assert.notEqual(second.tree, first.tree);
    assert.equal(readFileSync(path.join(second.dir, 'tracked.js'), 'utf8'), 'export const tracked = 2;\n');
    assert.equal(readFileSync(path.join(second.dir, '.meeseeks', 'gate-cache.json'), 'utf8'), '{"kept":true}');
    await removeCandidate({ cwd: root, run: shell, dir: second.dir });
  });

  it('drops an untracked file a previous iteration’s gate left in the subject', async () => {
    // A gate that writes a new file into the subject must not have it counted as part of the next
    // iteration's candidate, which would be bytes the working copy never had.
    const root = repo();
    const first = /** @type {any} */ (await materialize(root, 1));
    temporaryDirs.push(first.dir);
    writeFileSync(path.join(first.dir, 'gate-output.txt'), 'left behind\n');

    const second = /** @type {any} */ (await materialize(root, 2));
    assert.equal(existsSync(path.join(second.dir, 'gate-output.txt')), false);
    await removeCandidate({ cwd: root, run: shell, dir: second.dir });
  });
});

describe('shareToolCaches', () => {
  it('links an ignored cache that exists, so the subject can run its gates', async () => {
    const root = repo();
    const made = /** @type {any} */ (await materialize(root));
    temporaryDirs.push(made.dir);

    const shared = shareToolCaches({ cwd: root, dir: made.dir, caches: ['node_modules/', '.hypothesis/'] });
    assert.deepStrictEqual(shared.linked, ['node_modules']);
    assert.deepStrictEqual(shared.problems, []);
    assert.equal(lstatSync(path.join(made.dir, 'node_modules')).isSymbolicLink(), true);
    assert.equal(readFileSync(path.join(made.dir, 'node_modules', 'dep', 'index.js'), 'utf8'), 'module.exports = 3;\n');
    await removeCandidate({ cwd: root, run: shell, dir: made.dir });
  });

  it('leaves a cache the subject already has of its own alone', async () => {
    // A repository that vendors its dependencies as tracked files has them *in* the candidate.
    // Replacing that directory with a link would change the bytes being judged.
    const root = repo();
    const made = /** @type {any} */ (await materialize(root));
    temporaryDirs.push(made.dir);
    mkdirSync(path.join(made.dir, 'node_modules'), { recursive: true });
    writeFileSync(path.join(made.dir, 'node_modules', 'vendored.js'), 'vendored\n');

    shareToolCaches({ cwd: root, dir: made.dir, caches: ['node_modules/'] });
    assert.equal(lstatSync(path.join(made.dir, 'node_modules')).isSymbolicLink(), false);
    assert.equal(existsSync(path.join(made.dir, 'node_modules', 'vendored.js')), true);
    await removeCandidate({ cwd: root, run: shell, dir: made.dir });
  });

  it('links nothing for a cache the main tree does not have', async () => {
    const root = repo();
    const made = /** @type {any} */ (await materialize(root));
    temporaryDirs.push(made.dir);
    assert.deepStrictEqual(shareToolCaches({ cwd: root, dir: made.dir, caches: ['.hypothesis/'] }).linked, []);
    await removeCandidate({ cwd: root, run: shell, dir: made.dir });
  });

  it('refuses a traversing or absolute cache name outright', () => {
    const root = repo();
    const shared = shareToolCaches({ cwd: root, dir: root, caches: ['../escape/', '/etc/', ''] });
    assert.deepStrictEqual(shared.linked, []);
    assert.deepStrictEqual(shared.problems, []);
  });
});

describe('workingTreeMatchesCandidate', () => {
  it('says yes when nothing wrote to the repository while it was being judged', async () => {
    const root = repo();
    const made = /** @type {any} */ (await materialize(root));
    temporaryDirs.push(made.dir);

    const held = await workingTreeMatchesCandidate({ cwd: root, run: shell, tree: made.tree });
    assert.equal(held.ok, true, held.detail);
    assert.equal(held.tree, made.tree);
    await removeCandidate({ cwd: root, run: shell, dir: made.dir });
  });

  it('says no, and names both trees, when something did', async () => {
    const root = repo();
    const made = /** @type {any} */ (await materialize(root));
    temporaryDirs.push(made.dir);
    writeFileSync(path.join(root, 'tracked.js'), 'export const tracked = "later";\n');

    const held = await workingTreeMatchesCandidate({ cwd: root, run: shell, tree: made.tree });
    assert.equal(held.ok, false);
    assert.notEqual(held.tree, made.tree);
    assert.equal(held.detail.includes(made.tree), true, held.detail);
    assert.equal(held.detail.includes('Discarding the verdict'), true, held.detail);
    await removeCandidate({ cwd: root, run: shell, dir: made.dir });
  });

  it('is unmoved by a write to an ignored path, which is not part of the candidate', async () => {
    // The neighbour. `.meeseeks/` is written constantly by the run itself; a check that fired on it
    // would discard every verdict.
    const root = repo();
    const made = /** @type {any} */ (await materialize(root));
    temporaryDirs.push(made.dir);
    writeFileSync(path.join(root, '.meeseeks', 'state.json'), '{"passing":["a"]}');

    assert.equal((await workingTreeMatchesCandidate({ cwd: root, run: shell, tree: made.tree })).ok, true);
    await removeCandidate({ cwd: root, run: shell, dir: made.dir });
  });
});

describe('removeCandidate and the sweep', () => {
  it('removes the worktree and the directory with it', async () => {
    const root = repo();
    const made = /** @type {any} */ (await materialize(root));
    const removed = await removeCandidate({ cwd: root, run: shell, dir: made.dir });

    assert.equal(removed.removed, true, removed.detail);
    assert.equal(existsSync(made.dir), false);
    assert.equal(git(root, ['worktree', 'list', '--porcelain']).includes(made.dir), false);
  });

  it('sweeps a candidate worktree an earlier run abandoned, and only those', async () => {
    // Self-healing at the start, because cleanup on the way out cannot survive SIGKILL. Named
    // positionally — `meeseeks-candidate-<pid>` — so an operator's own worktree is never touched.
    const root = repo();
    const abandoned = path.join(path.dirname(root), 'meeseeks-candidate-4242');
    const operators = path.join(path.dirname(root), 'my-own-worktree');
    git(root, ['worktree', 'add', '--detach', abandoned, 'HEAD']);
    git(root, ['worktree', 'add', '--detach', operators, 'HEAD']);
    temporaryDirs.push(operators);

    const swept = await sweepCandidateWorktrees({ cwd: root, run: shell });

    assert.deepStrictEqual(swept.problems, []);
    assert.equal(swept.removed.length, 1, swept.removed.join(', '));
    assert.equal(swept.removed[0].endsWith('meeseeks-candidate-4242'), true, swept.removed[0]);
    assert.equal(existsSync(abandoned), false);
    assert.equal(existsSync(operators), true, 'the sweep took a worktree that was not its own');
  });

  it('removes the temporary index a killed run left behind', async () => {
    const root = repo();
    const gitDir = /** @type {string} */ (await resolveGitDir({ cwd: root, run: shell }));
    await writeSnapshotTree({ cwd: root, run: shell, gitDir });
    assert.equal(existsSync(snapshotIndexFor(gitDir)), true);

    await sweepCandidateWorktrees({ cwd: root, run: shell });
    assert.equal(existsSync(snapshotIndexFor(gitDir)), false);
  });

  it('names the worktree by the process that owns it', () => {
    // One run per repository is the lock's guarantee; one directory per *process* is what keeps two
    // runs in two repositories on one machine from colliding.
    assert.notEqual(candidateDirFor(1), candidateDirFor(2));
    assert.equal(path.basename(candidateDirFor(4242)), 'meeseeks-candidate-4242');
  });
});
