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

import { extractTestIds, fileBackedIds } from '../scripts/ratchet.mjs';
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

  it('still parses a nonexistent generated path, because parsing is not crediting', () => {
    // The stated policy, now stated precisely (REVIEW F35). A path that does not exist cannot be a
    // symlink escape, and refusing to *parse* it would turn a missing definition into a collection
    // failure — "the runner produced nothing" and "one of these tests is not in the repository"
    // need opposite responses. So the id is produced, and `fileBackedIds` withholds ratchet credit
    // from it separately. The earlier version of this case asserted the same output while implying
    // the id was therefore acceptable evidence, which is the half F35 refused.
    const parent = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-reporter-'));
    temporaryDirs.push(parent);
    assert.equal(toPosixRelative(parent, 'virtual/generated.test.js'), 'virtual/generated.test.js');
    assert.deepStrictEqual(
      fileBackedIds(['virtual/generated.test.js::generated > works'], parent).credited,
      new Set(),
      'a path that parses is not a path that earns credit',
    );
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

describe('ratchet credit requires a definition this checkout has (REVIEW F35)', () => {
  /** @returns {string} a scratch root */
  function root() {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-backed-'));
    temporaryDirs.push(dir);
    return dir;
  }

  /** @param {string} dir @param {string} relative */
  function file(dir, relative) {
    mkdirSync(path.join(dir, path.dirname(relative)), { recursive: true });
    writeFileSync(path.join(dir, relative), '// a real test file\n', 'utf8');
  }

  it('credits an id whose file is really there', () => {
    // The benign neighbour first: withholding everything is not a guarantee, it is a broken ratchet.
    const dir = root();
    file(dir, 'test/math.test.js');
    const backed = fileBackedIds(['test/math.test.js::arithmetic > adds'], dir);
    assert.deepStrictEqual(backed.credited, new Set(['test/math.test.js::arithmetic > adds']));
    assert.deepStrictEqual(backed.withheld, []);
  });

  it('withholds an id whose file does not exist', () => {
    // The reproduction. A runner reporting a pass for a file the candidate does not contain could
    // bank a durable id that no clean clone can execute or inspect.
    const dir = root();
    const backed = fileBackedIds(['test/absent.test.js::ghost > passes'], dir);
    assert.deepStrictEqual(backed.credited, new Set());
    assert.deepStrictEqual(backed.withheld, ['test/absent.test.js::ghost > passes']);
  });

  it('withholds an id whose path is a directory', () => {
    const dir = root();
    mkdirSync(path.join(dir, 'test', 'suite.test.js'), { recursive: true });
    assert.deepStrictEqual(fileBackedIds(['test/suite.test.js::a > b'], dir).credited, new Set());
  });

  it('withholds an id whose path is a symlink, whatever it points at', { skip: process.platform === 'win32' }, () => {
    // `lstat`, not `stat`: a symlink at a test path is not a definition the candidate contains, for
    // the same reason a symlinked report is not a report this attempt wrote.
    const dir = root();
    file(dir, 'test/real.test.js');
    mkdirSync(path.join(dir, 'test'), { recursive: true });
    symlinkSync(path.join(dir, 'test', 'real.test.js'), path.join(dir, 'test', 'linked.test.js'));
    assert.deepStrictEqual(fileBackedIds(['test/linked.test.js::a > b'], dir).credited, new Set());
    assert.deepStrictEqual(fileBackedIds(['test/real.test.js::a > b'], dir).credited, new Set(['test/real.test.js::a > b']));
  });

  it('withholds an id whose file is deleted between the report and the credit', () => {
    // The report was honest when it was written. Credit is a claim about now.
    const dir = root();
    file(dir, 'test/transient.test.js');
    const id = 'test/transient.test.js::a > b';
    assert.deepStrictEqual(fileBackedIds([id], dir).credited, new Set([id]));
    rmSync(path.join(dir, 'test', 'transient.test.js'));
    assert.deepStrictEqual(fileBackedIds([id], dir).credited, new Set());
  });

  it('withholds an id that names no file at all', () => {
    const dir = root();
    assert.deepStrictEqual(fileBackedIds(['a bare title with no path'], dir).credited, new Set());
  });

  it('keeps stable ids for contained paths written with either separator', () => {
    // The id is posix by construction, so the same definition credits identically however the
    // runner spelled it. Both spellings resolve to one file on this host.
    const dir = root();
    file(dir, 'test/sub/deep.test.js');
    const id = `${toPosixRelative(dir, path.join('test', 'sub', 'deep.test.js'))}::a > b`;
    assert.equal(id, 'test/sub/deep.test.js::a > b');
    assert.deepStrictEqual(fileBackedIds([id], dir).credited, new Set([id]));
  });

  it('separates credited from withheld in one pass, and sorts what it withheld', () => {
    const dir = root();
    file(dir, 'test/here.test.js');
    const backed = fileBackedIds(
      ['test/zz.test.js::z', 'test/here.test.js::a > b', 'test/aa.test.js::a'],
      dir,
    );
    assert.deepStrictEqual(backed.credited, new Set(['test/here.test.js::a > b']));
    assert.deepStrictEqual(backed.withheld, ['test/aa.test.js::a', 'test/zz.test.js::z']);
  });
});
