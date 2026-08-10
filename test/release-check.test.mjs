/**
 * Tests for the release check.
 *
 * The failure this guards against is silent: a shipped change published at an unchanged
 * version never reaches anyone who already installed the plugin, while every command
 * involved reports success. This repo lost hours to it twice, which is why the check
 * exists and why it fails closed when it cannot establish a baseline.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SHIPPED_PATHS, changesSinceVersion, evaluateRelease, isShipped, main } from '../tools/release-check.mjs';

describe('isShipped', () => {
  const shipped = [
    'hooks/guard.mjs',
    'scripts/driver.mjs',
    'commands/dare.md',
    'templates/reviewer-system.md',
    'output-styles/junkion.md',
    '.claude-plugin/plugin.json',
    '.claude-plugin/marketplace.json',
  ];
  for (const file of shipped) {
    it(`counts ${file}`, () => {
      assert.equal(isShipped(file), true);
    });
  }

  const notShipped = [
    'README.md',
    'DESIGN.md',
    'CLAUDE.md',
    'HANDOFF.md',
    'package.json',
    'eslint.config.mjs',
    'jsconfig.json',
    'test/driver.test.mjs',
    'test/fixtures/reporters/provenance.json',
    'tools/release-check.mjs',
  ];
  for (const file of notShipped) {
    it(`ignores ${file}`, () => {
      assert.equal(isShipped(file), false);
    });
  }

  it('ignores a path that merely starts with the same letters', () => {
    assert.equal(isShipped('scripts-notes/x.md'), false);
    assert.equal(isShipped('hooksy/x.mjs'), false);
  });

  it('names every directory the loader reads', () => {
    assert.deepStrictEqual(SHIPPED_PATHS, [
      'hooks',
      'scripts',
      'commands',
      'templates',
      'output-styles',
      '.claude-plugin',
    ]);
  });
});

describe('evaluateRelease', () => {
  const versions = { pluginVersion: '0.1.2', packageVersion: '0.1.2' };

  it('passes when nothing shipped changed', () => {
    const verdict = evaluateRelease({ ...versions, changedFiles: ['README.md', 'test/driver.test.mjs'] });
    assert.deepStrictEqual(verdict, { ok: true, problems: [] });
  });

  it('passes when nothing changed at all', () => {
    assert.equal(evaluateRelease({ ...versions, changedFiles: [] }).ok, true);
  });

  it('fails when a shipped file changed, and names it', () => {
    const verdict = evaluateRelease({ ...versions, changedFiles: ['README.md', 'scripts/driver.mjs'] });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.problems[0].includes('scripts/driver.mjs'), true);
    assert.equal(verdict.problems[0].includes('README.md'), false, 'must not blame a doc');
  });

  it('counts every shipped file, sorted', () => {
    const verdict = evaluateRelease({
      ...versions,
      changedFiles: ['scripts/driver.mjs', 'hooks/guard.mjs', 'docs/x.md'],
    });
    const problem = verdict.problems[0];
    assert.equal(problem.includes('2 shipped file(s)'), true);
    assert.equal(problem.indexOf('hooks/guard.mjs') < problem.indexOf('scripts/driver.mjs'), true);
  });

  it('fails when the two manifests disagree about the version', () => {
    const verdict = evaluateRelease({ pluginVersion: '0.1.2', packageVersion: '0.1.1', changedFiles: [] });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.problems[0].includes('version mismatch'), true);
  });

  it('reports both problems at once', () => {
    const verdict = evaluateRelease({
      pluginVersion: '0.1.2',
      packageVersion: '0.1.1',
      changedFiles: ['hooks/guard.mjs'],
    });
    assert.equal(verdict.problems.length, 2);
  });
});

describe('changesSinceVersion', () => {
  /**
   * @param {Record<string, string>} table keyed by the joined git argv
   * @returns {import('../tools/release-check.mjs').Git}
   */
  const fakeGit = (table) => (args) => {
    const answer = table[args.join(' ')];
    if (answer === undefined) throw new Error(`unexpected git call: ${args.join(' ')}`);
    return answer;
  };

  const LOG = 'log -1 --format=%H -S "version": "0.1.2" -- .claude-plugin/plugin.json';

  const UNTRACKED = 'ls-files --others --exclude-standard';

  it('finds the bump commit and lists what changed after it', () => {
    const git = fakeGit({
      [LOG]: 'abc1234\n',
      'diff --name-only abc1234': 'README.md\nscripts/driver.mjs\n',
      [UNTRACKED]: '\n',
    });
    assert.deepStrictEqual(changesSinceVersion({ git, version: '0.1.2' }), {
      baseline: 'abc1234',
      changedFiles: ['README.md', 'scripts/driver.mjs'],
    });
  });

  it('compares against the working tree, so an uncommitted shipped edit still counts', () => {
    // `..HEAD` would call this ok, and this check is most useful run before committing.
    const git = fakeGit({ [LOG]: 'abc1234\n', 'diff --name-only abc1234': 'hooks/guard.mjs\n', [UNTRACKED]: '\n' });
    assert.deepStrictEqual(changesSinceVersion({ git, version: '0.1.2' }).changedFiles, ['hooks/guard.mjs']);
  });

  it('counts an untracked shipped file, which is the most shipped thing there is', () => {
    const git = fakeGit({ [LOG]: 'abc1234\n', 'diff --name-only abc1234': '\n', [UNTRACKED]: 'scripts/new.mjs\n' });
    assert.deepStrictEqual(changesSinceVersion({ git, version: '0.1.2' }).changedFiles, ['scripts/new.mjs']);
  });

  it('does not report the same file twice', () => {
    const git = fakeGit({
      [LOG]: 'abc1234\n',
      'diff --name-only abc1234': 'hooks/guard.mjs\n',
      [UNTRACKED]: 'hooks/guard.mjs\n',
    });
    assert.deepStrictEqual(changesSinceVersion({ git, version: '0.1.2' }).changedFiles, ['hooks/guard.mjs']);
  });

  it('reports no changes rather than one empty filename', () => {
    const git = fakeGit({ [LOG]: 'abc1234\n', 'diff --name-only abc1234': '\n', [UNTRACKED]: '\n' });
    assert.deepStrictEqual(changesSinceVersion({ git, version: '0.1.2' }).changedFiles, []);
  });

  it('reports a version absent from history as a bump not yet committed', () => {
    // This is the correct state, not an error: someone has just bumped and not committed.
    // Refusing here would fail exactly when the right thing was done.
    const git = fakeGit({ [LOG]: '\n' });
    assert.deepStrictEqual(changesSinceVersion({ git, version: '0.1.2' }), {
      baseline: null,
      changedFiles: [],
    });
  });
});

describe('the command', () => {
  it('passes and says so when the bump is not committed yet', () => {
    /** @type {string[]} */
    const lines = [];
    assert.equal(main({ log: (line) => lines.push(line), git: () => '' }), 0);
    assert.equal(lines[0].includes('has not been committed yet'), true);
  });

  it('still refuses a shipped change at an already-released version', () => {
    /** @type {string[]} */
    const lines = [];
    const git = (/** @type {string[]} */ args) => {
      if (args[0] === 'log') return 'abc1234\n';
      if (args[0] === 'ls-files') return '\n';
      return 'hooks/guard.mjs\n';
    };
    assert.equal(main({ log: (line) => lines.push(line), git }), 1);
    assert.equal(lines.join('\n').includes('hooks/guard.mjs'), true);
  });

  it('reports the version and baseline when a run is releasable', () => {
    /** @type {string[]} */
    const lines = [];
    const git = (/** @type {string[]} */ args) => (args[0] === 'log' ? 'abc1234\n' : '\n');
    assert.equal(main({ log: (line) => lines.push(line), git }), 0);
    // The shape, not the number: hard-coding the version makes this fail on every bump,
    // which teaches whoever is bumping to edit tests reflexively.
    assert.match(lines[0], /^ok: version \d+\.\d+\.\d+, no shipped file changed since abc1234$/);
  });

  // Deliberately not asserted here: whether *this* repository is releasable right now.
  // That would turn `npm test` red during ordinary work on a shipped file — not a defect,
  // just a bump not yet made — and a suite that is red while you are mid-change is one
  // people learn to ignore. `npm run release-check` is the gate for that, on purpose.
});
