/**
 * Tier 2 — the scoped restore against **real git**. Needs `git`; no network, no API, no money.
 *
 * `scopedRestorePaths` is pure and unit-tested, and that proves nothing about whether
 * `git checkout <commit> -- <paths>` does what this design assumes: return exactly those paths
 * and leave every other working-tree change alone. That contract belongs to a different binary,
 * which is this tier's whole reason for existing (`DESIGN.md` §11.1, the argv defect).
 *
 * What it must establish, because the design rests on all three:
 *
 *   1. the implicated paths come back to their committed content
 *   2. **every other change survives** — the entire point is not discarding the iteration
 *   3. an untracked file the iteration created is untouched, because `git checkout -- <path>`
 *      has nothing to say about a path that was never committed
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { RatchetStateError, restorePaths, scopedRestorePaths } from '../../scripts/ratchet.mjs';

/** @type {string[]} */
const temporaryDirs = [];

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * A repository with one commit holding known content.
 *
 * `git init` without `--initial-branch`: that flag needs git 2.28 and this project has already
 * been bitten by a host running 2.25. The branch name is irrelevant here anyway.
 *
 * @returns {{ root: string, commit: string }}
 */
function repoWithGoodCommit() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-scoped-'));
  temporaryDirs.push(root);
  const git = (/** @type {string[]} */ args) =>
    execFileSync('git', args, { cwd: root, stdio: 'pipe' }).toString().trim();
  git(['init', '--quiet']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'test']);
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeFileSync(path.join(root, 'src/csv.ts'), 'export const parse = () => "good";\n');
  writeFileSync(path.join(root, 'src/csv.test.ts'), 'test("good", () => {});\n');
  writeFileSync(path.join(root, 'src/summarize.ts'), 'export const mean = () => 0;\n');
  git(['add', '-A']);
  git(['commit', '--quiet', '-m', 'good state']);
  return { root, commit: git(['rev-parse', 'HEAD']) };
}

describe('the scoped restore against real git', () => {
  it('returns the implicated paths and keeps every other change', () => {
    const { root, commit } = repoWithGoodCommit();
    // The `ship1` shape: one parser broke a ratcheted test, and the same iteration also did
    // unrelated work that a whole-tree reset would have destroyed.
    writeFileSync(path.join(root, 'src/csv.ts'), 'export const parse = () => "broken";\n');
    writeFileSync(path.join(root, 'src/summarize.ts'), 'export const mean = () => 42;\n');

    const paths = scopedRestorePaths(
      ['src/csv.test.ts::parseCsv > an unterminated quote at EOF'],
      ['src/csv.ts', 'src/summarize.ts'],
    );
    assert.deepEqual(paths, ['src/csv.ts'], 'the test file was unchanged, so only the source is implicated');

    restorePaths({ cwd: root, commit, paths });

    assert.equal(readFileSync(path.join(root, 'src/csv.ts'), 'utf8').includes('good'), true, 'implicated path');
    assert.equal(
      readFileSync(path.join(root, 'src/summarize.ts'), 'utf8').includes('42'),
      true,
      'unrelated work was discarded, which is the whole defect this exists to fix',
    );
  });

  it('leaves an untracked file the iteration created alone', () => {
    // `git checkout <commit> -- <path>` has nothing to say about a path that was never
    // committed. Asserted rather than assumed, because a scoped restore that quietly deleted
    // new work would be worse than the full reset it replaces.
    const { root, commit } = repoWithGoodCommit();
    writeFileSync(path.join(root, 'src/csv.ts'), 'export const parse = () => "broken";\n');
    writeFileSync(path.join(root, 'src/new-module.ts'), 'export const added = 1;\n');

    restorePaths({ cwd: root, commit, paths: ['src/csv.ts'] });

    assert.equal(existsSync(path.join(root, 'src/new-module.ts')), true, 'a new file was destroyed');
    assert.equal(readFileSync(path.join(root, 'src/csv.ts'), 'utf8').includes('good'), true);
  });

  it('refuses a path git does not know, rather than reporting a restore that did not happen', () => {
    // Fail-closed. `git checkout` exits non-zero on an unknown pathspec, and the caller reads a
    // throw as "the scoped restore is unavailable" and falls back to the full reset.
    const { root, commit } = repoWithGoodCommit();
    assert.throws(
      () => restorePaths({ cwd: root, commit, paths: ['src/never-existed.ts'] }),
      RatchetStateError,
    );
  });
});
