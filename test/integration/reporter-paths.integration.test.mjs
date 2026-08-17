/**
 * Tier 2 — every banked test definition is in the repository (REVIEW F20, DESIGN.md §11).
 *
 * The unit suite proves the containment rules against constructed paths. What it cannot prove is
 * the claim the ratchet actually makes: that a test which earned durable credit is a file **a clean
 * clone of the deliverable contains**. That is a statement about git and about the filesystem, so
 * it is asserted against a real repository, a real `git clone`, and real absolute paths of the kind
 * vitest emits — which is exactly the shape the reproduction used to smuggle
 * `../tmp/outside.test.js` into the ratchet.
 *
 * No network, no API, no money.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { extractTestIds } from '../../scripts/ratchet.mjs';

/** @type {string[]} */
const temporaryDirs = [];

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** @param {string} cwd @param {string[]} args @returns {string} */
function git(cwd, args) {
  return execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf8' }).trim();
}

/**
 * A repository with two test files, and a clean clone of it.
 *
 * @returns {{ origin: string, clone: string, outside: string }}
 */
function repoAndClone() {
  const parent = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-reporter-int-'));
  temporaryDirs.push(parent);
  const origin = path.join(parent, 'origin');
  mkdirSync(path.join(origin, 'test', 'deep nested'), { recursive: true });
  git(path.dirname(origin), ['init', '--quiet', 'origin']);
  git(origin, ['config', 'user.email', 'test@example.com']);
  git(origin, ['config', 'user.name', 'test']);
  writeFileSync(path.join(origin, 'test', 'math.test.js'), '// arithmetic\n', 'utf8');
  writeFileSync(path.join(origin, 'test', 'deep nested', 'café.test.js'), '// unicode and a space\n', 'utf8');
  git(origin, ['add', '-A']);
  git(origin, ['commit', '--quiet', '-m', 'two tests']);

  const clone = path.join(parent, 'clone');
  git(parent, ['clone', '--quiet', origin, clone]);

  // A test file that exists on this machine and is deliberately *not* in the deliverable.
  const outside = path.join(parent, 'outside.test.js');
  writeFileSync(outside, '// not in the repository\n', 'utf8');
  return { origin, clone, outside };
}

/**
 * A vitest-shaped report naming absolute files, which is what vitest actually emits.
 *
 * @param {string[]} files
 * @returns {string}
 */
const vitestReport = (files) =>
  JSON.stringify({
    numTotalTests: files.length,
    testResults: files.map((file) => ({
      name: file,
      assertionResults: [{ ancestorTitles: ['suite'], title: 'works', status: 'passed' }],
    })),
  });

describe('every credited test definition is present in a clean clone', () => {
  it('banks ids whose files the clone really contains', async () => {
    const { clone } = repoAndClone();
    const ids = extractTestIds(
      vitestReport([path.join(clone, 'test', 'math.test.js'), path.join(clone, 'test', 'deep nested', 'café.test.js')]),
      { rootDir: clone },
    );
    assert.equal(ids.size, 2, [...ids].join(' | '));
    for (const id of ids) {
      const file = id.split('::')[0];
      assert.equal(file.startsWith('..'), false, `${id} names a file outside the deliverable`);
      assert.equal(path.posix.isAbsolute(file), false, `${id} is an absolute identity`);
      assert.equal(existsSync(path.join(clone, file)), true, `${id} names a file the clone does not contain`);
    }
    // And the ids are the paths a reader would expect, spaces and Unicode intact.
    assert.deepStrictEqual(
      [...ids].sort(),
      ['test/deep nested/café.test.js::suite > works', 'test/math.test.js::suite > works'],
    );
  });

  it('refuses a real file on this machine that the deliverable does not contain', async () => {
    // The reproduction against real paths: the file exists, the runner named it, and it is still
    // not part of the candidate. Durable credit for it could never be reproduced from the clone.
    const { clone, outside } = repoAndClone();
    assert.equal(existsSync(outside), true, 'the fixture did not create the outside file');
    assert.throws(() => extractTestIds(vitestReport([outside]), { rootDir: clone }), /outside the repository/);
  });

  it('refuses the origin\'s copy when the clone is what is being judged', async () => {
    // Two real repositories with the same relative path. Only the one under review counts.
    const { origin, clone } = repoAndClone();
    assert.throws(
      () => extractTestIds(vitestReport([path.join(origin, 'test', 'math.test.js')]), { rootDir: clone }),
      /outside the repository/,
    );
  });

  it('refuses the whole report when one result names an outside file', async () => {
    // Fail-closed rather than per-record: a report that names a file outside the candidate is a
    // report whose provenance is unknown, and silently banking the rest would keep the credit that
    // the refusal exists to withhold.
    const { clone, outside } = repoAndClone();
    assert.throws(
      () => extractTestIds(vitestReport([path.join(clone, 'test', 'math.test.js'), outside]), { rootDir: clone }),
      /outside the repository/,
    );
  });
});
