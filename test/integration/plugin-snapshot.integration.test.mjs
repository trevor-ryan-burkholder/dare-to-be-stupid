/**
 * Tier 2 — the installed snapshot is the candidate (REVIEW F21).
 *
 * **Every release gate here reads the working tree; the loader does not.** Claude Code installs a
 * plugin into a version-keyed cache directory and reads it from there, so `release-check` and
 * `slice-check` can both be green about bytes no loader will ever open. That is F21: the checks
 * never exercise the installed snapshot, and the two silent traps `CLAUDE.md` documents — a
 * marketplace that reports success without refetching, and a cache directory keyed by a version
 * that did not change — are both invisible to a working-tree check.
 *
 * This tier proves the half that needs no binary and no money: that a staged snapshot is byte-for-
 * byte the candidate, that it carries the whole loader surface rather than a remembered list of it,
 * and that tampering with the copy is detected. The loader actually *accepting* those bytes is
 * `test/live/plugin-loader.live.test.mjs`, which needs a real `claude`.
 *
 * Real git and a real filesystem. No network, no API, no money.
 */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { SHIPPED_PATHS, isShipped } from '../../tools/release-check.mjs';
import { shippedFiles, stageSnapshot, verifySnapshot } from '../../tools/plugin-snapshot.mjs';

/** @type {string[]} */
const temporaryDirs = [];

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

/** @returns {string} */
function scratch() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-snapshot-'));
  temporaryDirs.push(dir);
  return dir;
}

describe('a staged plugin snapshot is the candidate, byte for byte', () => {
  it('stages every shipped file and nothing else', () => {
    const dest = scratch();

    const staged = stageSnapshot({ root: ROOT, dest });

    assert.equal(staged.size > 0, true, 'nothing was staged');
    for (const file of staged.keys()) {
      assert.equal(isShipped(file), true, `${file} is not part of the loader surface`);
      assert.equal(existsSync(path.join(dest, file)), true, `${file} was recorded but not copied`);
    }
    // The manifest that makes it a plugin at all, rather than a directory of scripts.
    assert.equal(existsSync(path.join(dest, '.claude-plugin', 'plugin.json')), true);
    assert.deepStrictEqual(verifySnapshot({ root: ROOT, dest }), []);
  });

  it('derives the surface from the release gate rather than from a second list', () => {
    // **The enumeration defect, refused positionally.** A snapshot that carried its own list of
    // directories would drift from `release-check`'s the first time somebody shipped a new one —
    // and the drift would be silent, because both would still pass. `isShipped` is the only answer
    // to "what does the loader read", so adding a directory extends this snapshot automatically.
    const staged = shippedFiles(ROOT);
    const roots = new Set(staged.map((file) => file.split('/')[0]));
    for (const dir of roots) {
      assert.equal(SHIPPED_PATHS.includes(dir), true, `${dir} was staged but is not a shipped path`);
    }
    // And every shipped directory that exists in the tree is represented, so the walk is not
    // quietly skipping one.
    for (const dir of SHIPPED_PATHS) {
      if (!existsSync(path.join(ROOT, dir))) continue;
      assert.equal(
        staged.some((file) => file === dir || file.startsWith(`${dir}/`)),
        true,
        `${dir} exists in the tree and contributed nothing to the snapshot`,
      );
    }
  });

  it('detects a snapshot whose bytes are not the candidate', () => {
    // The reproduction of what F21 is about, in miniature: a snapshot that *looks* installed and
    // holds something else. A harness that could not tell would be the same false comfort as a
    // release check that reads the working tree.
    const dest = scratch();
    stageSnapshot({ root: ROOT, dest });
    const target = path.join(dest, 'scripts', 'driver.mjs');
    writeFileSync(target, `${readFileSync(target, 'utf8')}\n// an edit the candidate does not have\n`, 'utf8');

    const problems = verifySnapshot({ root: ROOT, dest });

    assert.equal(problems.length, 1, JSON.stringify(problems));
    assert.equal(problems[0], 'scripts/driver.mjs: the snapshot holds different bytes than the candidate');
  });

  it('detects a file missing from the snapshot', () => {
    const dest = scratch();
    stageSnapshot({ root: ROOT, dest });
    rmSync(path.join(dest, 'scripts', 'driver.mjs'));

    assert.deepStrictEqual(verifySnapshot({ root: ROOT, dest }), ['scripts/driver.mjs: missing from the snapshot']);
  });

  it('detects a file the snapshot has and the candidate does not', () => {
    // The direction that matters for a *cache* directory: a stale artifact from an earlier version
    // left behind in the install path is exactly the trap `CLAUDE.md` documents.
    const dest = scratch();
    stageSnapshot({ root: ROOT, dest });
    writeFileSync(path.join(dest, 'scripts', 'left-over.mjs'), 'export const stale = true;\n', 'utf8');

    assert.deepStrictEqual(verifySnapshot({ root: ROOT, dest }), [
      'scripts/left-over.mjs: present in the snapshot and not in the candidate',
    ]);
  });

  it('refuses to report success on an empty tree', () => {
    // Nothing staged is never "staged nothing successfully". A loader given an empty directory has
    // no plugin, and a harness that passed here would prove the opposite of what it exists for.
    assert.throws(() => stageSnapshot({ root: scratch(), dest: scratch() }), /no shipped files/);
  });
});
