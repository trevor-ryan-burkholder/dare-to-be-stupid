/**
 * Tests for reporter-path containment (DESIGN.md §11, REVIEW F20).
 *
 * **The ratchet's identity is a path, and nothing checked that the path was in the repository.**
 * `toPosixRelative` resolved a reported file and subtracted the root without ever asking whether
 * the answer was inside it, so a Vitest-shaped passing result naming `/tmp/outside.test.js` under
 * root `/repo` parsed into the ratchet id `../tmp/outside.test.js::suite > works` — durable credit
 * for a test whose defining file is not part of the candidate at all, and which a clean clone could
 * never reproduce.
 *
 * The runner is not the enemy: a misconfigured `include`, a globally installed fixture, or a
 * monorepo layout is enough to produce one. Every hostile shape below therefore has a benign
 * neighbour, because a validator that refused ordinary paths would break every real report.
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { extractTestIds } from '../scripts/ratchet.mjs';
import { ReportFormatError, toPosixRelative } from '../scripts/reporters/shared.mjs';

/** @type {string[]} */
const temporaryDirs = [];

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** A root that does not exist on disk, so only the lexical rules are in play. */
const ABSTRACT_ROOT = path.join(os.tmpdir(), 'meeseeks-no-such-root', 'repo');

/**
 * A vitest-shaped report naming one file.
 *
 * @param {string} file
 * @returns {string}
 */
const vitestReport = (file) =>
  JSON.stringify({
    numTotalTests: 1,
    testResults: [{ name: file, assertionResults: [{ ancestorTitles: ['suite'], title: 'works', status: 'passed' }] }],
  });

/**
 * A playwright-shaped report naming one file.
 *
 * @param {string} file
 * @returns {string}
 */
const playwrightReport = (file) =>
  JSON.stringify({
    config: { rootDir: '/repo', projects: [{ name: 'chromium' }] },
    suites: [
      {
        title: 'a suite',
        specs: [
          {
            title: 'works',
            file,
            ok: true,
            tests: [{ projectName: 'chromium', status: 'expected', results: [{ status: 'passed' }] }],
          },
        ],
        suites: [],
      },
    ],
  });

describe('a reported path outside the repository is refused', () => {
  it('refuses the exact reproduction: an absolute path outside the root, from vitest', () => {
    assert.throws(
      () => extractTestIds(vitestReport('/tmp/outside.test.js'), { rootDir: '/repo' }),
      /outside the repository/,
    );
  });

  it('refuses the same shape from playwright', () => {
    assert.throws(
      () => extractTestIds(playwrightReport('/tmp/outside.spec.js'), { rootDir: '/repo' }),
      /outside the repository/,
    );
  });

  it('refuses a traversing relative path', () => {
    assert.throws(() => toPosixRelative(ABSTRACT_ROOT, '../outside.test.js'), ReportFormatError);
    assert.throws(() => toPosixRelative(ABSTRACT_ROOT, 'test/../../outside.test.js'), ReportFormatError);
  });

  it('refuses a drive-qualified path on every platform', () => {
    // A POSIX `path.resolve` would fold `C:\x` into an ordinary filename inside the root, so this
    // has to be refused by shape rather than by resolution.
    assert.throws(() => toPosixRelative(ABSTRACT_ROOT, 'C:\\tests\\outside.test.js'), /drive-qualified/);
    assert.throws(() => toPosixRelative(ABSTRACT_ROOT, 'D:/tests/outside.test.js'), /drive-qualified/);
  });

  it('refuses a UNC path in either spelling', () => {
    assert.throws(() => toPosixRelative(ABSTRACT_ROOT, '\\\\server\\share\\outside.test.js'), /UNC/);
    assert.throws(() => toPosixRelative(ABSTRACT_ROOT, '//server/share/outside.test.js'), /UNC/);
  });

  it('refuses a case-variant root, which is only the same directory on some filesystems', () => {
    assert.throws(() => toPosixRelative('/repo', '/REPO/test/a.test.js'), /outside the repository/);
  });

  it('refuses the root directory itself, which defines no test', () => {
    assert.throws(() => toPosixRelative(ABSTRACT_ROOT, '.'), ReportFormatError);
  });

  it('refuses a result that names no file at all', () => {
    assert.throws(() => toPosixRelative(ABSTRACT_ROOT, ''), /names no file/);
    assert.throws(() => toPosixRelative(ABSTRACT_ROOT, '   '), /names no file/);
  });

  it('refuses a symlink inside the repository that points out of it', { skip: process.platform === 'win32' }, () => {
    // The case no string check can see, and the reason containment is asked twice.
    const parent = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-reporter-'));
    temporaryDirs.push(parent);
    const root = path.join(parent, 'repo');
    mkdirSync(path.join(root, 'test'), { recursive: true });
    writeFileSync(path.join(parent, 'outside.test.js'), '// not in the repo\n', 'utf8');
    symlinkSync(path.join(parent, 'outside.test.js'), path.join(root, 'test', 'shortcut.test.js'));
    assert.throws(() => toPosixRelative(root, 'test/shortcut.test.js'), /resolves outside the repository/);
  });

  it('accepts a symlink that stays inside the repository', { skip: process.platform === 'win32' }, () => {
    // The benign neighbour: an in-repo alias is an ordinary file, and the id stays the lexical one
    // so adding this check changed nothing that already worked.
    const parent = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-reporter-'));
    temporaryDirs.push(parent);
    const root = path.join(parent, 'repo');
    mkdirSync(path.join(root, 'test'), { recursive: true });
    writeFileSync(path.join(root, 'test', 'real.test.js'), '// real\n', 'utf8');
    symlinkSync(path.join(root, 'test', 'real.test.js'), path.join(root, 'test', 'alias.test.js'));
    assert.equal(toPosixRelative(root, 'test/alias.test.js'), 'test/alias.test.js');
  });

  it('refuses every path when the root itself cannot be resolved but the file can', () => {
    // Fail-closed: an unresolvable root is not evidence that a file is inside it.
    const parent = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-reporter-'));
    temporaryDirs.push(parent);
    writeFileSync(path.join(parent, 'a.test.js'), '// real\n', 'utf8');
    const missingRoot = path.join(parent, 'not-a-directory');
    assert.throws(() => toPosixRelative(missingRoot, path.join(parent, 'a.test.js')), ReportFormatError);
  });
});

describe('contained paths keep deterministic identities', () => {
  it('accepts an ordinary relative path', () => {
    assert.equal(toPosixRelative(ABSTRACT_ROOT, 'test/math.test.js'), 'test/math.test.js');
  });

  it('accepts an absolute path inside the root, which is what vitest actually emits', () => {
    assert.equal(toPosixRelative(ABSTRACT_ROOT, path.join(ABSTRACT_ROOT, 'test', 'math.test.js')), 'test/math.test.js');
  });

  it('keeps spaces exactly', () => {
    assert.equal(toPosixRelative(ABSTRACT_ROOT, 'test/my tests/a b.test.js'), 'test/my tests/a b.test.js');
  });

  it('keeps leading and trailing whitespace in a filename, which is part of the name', () => {
    assert.equal(toPosixRelative(ABSTRACT_ROOT, 'test/ padded .test.js'), 'test/ padded .test.js');
  });

  it('keeps Unicode without folding it', () => {
    // Two distinct files on a case- and normalisation-sensitive filesystem must stay two ids.
    assert.equal(toPosixRelative(ABSTRACT_ROOT, 'test/café.test.js'), 'test/café.test.js');
    assert.notEqual(toPosixRelative(ABSTRACT_ROOT, 'test/CAFÉ.test.js'), toPosixRelative(ABSTRACT_ROOT, 'test/café.test.js'));
  });

  it('normalises platform separators to posix, so an id does not depend on the host', () => {
    assert.equal(toPosixRelative(ABSTRACT_ROOT, path.join('test', 'math.test.js')), 'test/math.test.js');
  });

  it('accepts a nonexistent generated path on the lexical rule alone', () => {
    // The stated policy: runners report virtual and generated files, and a path that does not exist
    // cannot be a symlink escape. What it can never be is outside.
    const parent = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-reporter-'));
    temporaryDirs.push(parent);
    assert.equal(toPosixRelative(parent, 'virtual/generated.test.js'), 'virtual/generated.test.js');
  });

  it('never produces an id that leaves the repository, whatever it was given', () => {
    // The property, stated once over everything above: no `..`, never absolute.
    for (const candidate of ['test/a.test.js', 'a.test.js', path.join(ABSTRACT_ROOT, 'deep', 'b.test.js')]) {
      const relative = toPosixRelative(ABSTRACT_ROOT, candidate);
      assert.equal(relative.startsWith('..'), false, relative);
      assert.equal(path.posix.isAbsolute(relative), false, relative);
    }
  });
});
