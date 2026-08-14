/**
 * Tests for conditional git-history context (DESIGN.md §8.2).
 *
 * The risk this feature carries is not that it fails — it is that it succeeds too often.
 * History in a brief is only worth its tokens when the code predates the run, so most of
 * these tests are about the conditions under which the correct answer is *nothing*.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { citedLocations, commitCount, hasMeaningfulHistory, historyContext } from '../scripts/history.mjs';

/** @type {string[]} */
const temporaryDirs = [];

/** @returns {string} */
function makeTempDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-history-'));
  temporaryDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** @type {import('../scripts/plugins.mjs').Runner} */
const run = (command, args, options) => {
  try {
    const stdout = execFileSync(command, args, { cwd: options.cwd, stdio: 'pipe', encoding: 'utf8' });
    return { ok: true, status: 0, stdout, stderr: '' };
  } catch (error) {
    const failure = /** @type {{ status?: number, stdout?: string, stderr?: string, message: string }} */ (error);
    return {
      ok: false,
      status: failure.status ?? 1,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? failure.message,
    };
  }
};

/**
 * @param {{ file: string, contents: string, message: string }[]} commits
 * @returns {string} the repository root
 */
function makeRepo(commits) {
  const root = makeTempDir();
  const git = (/** @type {string[]} */ args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git(['init', '--quiet']);
  git(['config', 'user.email', 'history@example.invalid']);
  git(['config', 'user.name', 'History Test']);
  for (const commit of commits) {
    const full = path.join(root, commit.file);
    execFileSync('mkdir', ['-p', path.dirname(full)]);
    writeFileSync(full, commit.contents, 'utf8');
    git(['add', '-A']);
    git(['commit', '--quiet', '-m', commit.message]);
  }
  return root;
}

/** Six commits, four of them touching src/auth.ts. */
function matureRepo() {
  return makeRepo([
    { file: 'src/auth.ts', contents: 'line1\n', message: 'add auth' },
    { file: 'src/auth.ts', contents: 'line1\nline2\n', message: 'guard the handler' },
    { file: 'src/auth.ts', contents: 'line1\nline2\nline3\n', message: 'reject anonymous requests' },
    { file: 'README.md', contents: 'docs\n', message: 'document it' },
    { file: 'src/auth.ts', contents: 'line1\nline2\nline3\nline4\n', message: 'handle expiry' },
    { file: 'src/new.ts', contents: 'fresh\n', message: 'add a brand new file' },
  ]);
}

describe('citedLocations', () => {
  it('pulls file and line out of a finding', () => {
    assert.deepStrictEqual(citedLocations(['PRD-1.2: src/auth.ts:41 has no guard']), [
      { file: 'src/auth.ts', lines: [41] },
    ]);
  });

  it('collects several lines in one file, sorted, without repeats', () => {
    assert.deepStrictEqual(citedLocations(['a src/auth.ts:41', 'b src/auth.ts:12', 'c src/auth.ts:41']), [
      { file: 'src/auth.ts', lines: [12, 41] },
    ]);
  });

  it('ignores a finding that cites nothing lookupable', () => {
    assert.deepStrictEqual(citedLocations(['DoD-2-security: no rate limiting anywhere in src/']), []);
    assert.deepStrictEqual(citedLocations(['see the middleware', 'src/auth.ts']), []);
  });

  it('reads a citation wrapped in punctuation', () => {
    assert.deepStrictEqual(citedLocations(['the guard (src/auth.ts:41) is client-side']), [
      { file: 'src/auth.ts', lines: [41] },
    ]);
  });
});

describe('hasMeaningfulHistory', () => {
  it('is false for a repository this run just created', async () => {
    const root = makeRepo([{ file: 'a.txt', contents: 'a\n', message: 'first' }]);
    assert.equal(await commitCount({ cwd: root, run }), 1);
    assert.equal(await hasMeaningfulHistory({ cwd: root, run }), false);
  });

  it('is true once there is a real history behind the code', async () => {
    assert.equal(await hasMeaningfulHistory({ cwd: matureRepo(), run }), true);
  });

  it('is false where git will not answer at all', async () => {
    assert.equal(await hasMeaningfulHistory({ cwd: makeTempDir(), run }), false);
  });
});

describe('historyContext', () => {
  it('returns the commits behind a cited file, and the blame for the cited line', async () => {
    const notes = await historyContext({ cwd: matureRepo(), run, findings: ['PRD-1.1: src/auth.ts:2 is unguarded'] });
    assert.equal(notes.length, 1);
    assert.equal(notes[0].file, 'src/auth.ts');
    assert.equal(notes[0].commits.length, 4);
    assert.equal(notes[0].commits[0].subject, 'handle expiry');
    assert.equal(notes[0].blame.length, 1);
    assert.equal(notes[0].blame[0].startsWith('line 2 last changed in'), true);
  });

  it('says nothing about a file this run created', async () => {
    // One commit means there is no prior intent to respect.
    assert.deepStrictEqual(await historyContext({ cwd: matureRepo(), run, findings: ['PRD-2.1: src/new.ts:1 is wrong'] }), []);
  });

  it('says nothing at all on a greenfield run, however many commits meeseeks has added', async () => {
    // Every commit is the builder's own work. Quoting them back is quoting the builder.
    assert.deepStrictEqual(
      await historyContext({ cwd: matureRepo(), run, findings: ['PRD-1.1: src/auth.ts:2 bad'], greenfield: true }),
      [],
    );
  });

  it('says nothing when the repository has barely any history', async () => {
    const root = makeRepo([
      { file: 'src/auth.ts', contents: 'a\n', message: 'one' },
      { file: 'src/auth.ts', contents: 'b\n', message: 'two' },
    ]);
    assert.deepStrictEqual(await historyContext({ cwd: root, run, findings: ['PRD-1.1: src/auth.ts:1 bad'] }), []);
  });

  it('says nothing when no finding cited a location', async () => {
    assert.deepStrictEqual(await historyContext({ cwd: matureRepo(), run, findings: ['DoD-3-ci: no workflow'] }), []);
  });

  it('caps how many files it will describe', async () => {
    const root = makeRepo(
      ['a', 'b', 'c', 'd'].flatMap((name) => [
        { file: `${name}.ts`, contents: '1\n', message: `add ${name}` },
        { file: `${name}.ts`, contents: '1\n2\n', message: `change ${name}` },
      ]),
    );
    const notes = await historyContext({ cwd: root, run, findings: ['a.ts:1 x', 'b.ts:1 x', 'c.ts:1 x', 'd.ts:1 x'] });
    assert.equal(notes.length, 3);
  });
});
