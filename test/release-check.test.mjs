/**
 * Tests for the release check.
 *
 * The failure this guards against is silent: a shipped change published at an unchanged
 * version never reaches anyone who already installed the plugin, while every command
 * involved reports success. This repo lost hours to it twice, which is why the check
 * exists and why it fails closed when it cannot establish a baseline.
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  SHIPPED_PATHS,
  changesSinceVersion,
  evaluateRelease,
  isShipped,
  main,
  statedHandoffVersion,
} from '../tools/release-check.mjs';
import { FINGERPRINT_FILES, isFingerprintPath } from '../tools/slice-check.mjs';

describe('statedHandoffVersion', () => {
  it('reads the version out of the real header shape', () => {
    const text = ['# START HERE — handoff', '', '**State:** `main` at `0.89.0`. Measured at 0.89.0.', ''].join('\n');
    assert.deepStrictEqual(statedHandoffVersion(text), { version: '0.89.0', reason: '' });
  });

  it('skips the branch name, which is also in backticks', () => {
    // `main` is not `x.y.z`, and the pattern is what excludes it rather than its position.
    assert.equal(statedHandoffVersion('**State:** `main` at `1.2.3`.').version, '1.2.3');
  });

  it('finds a version the paragraph wrapped onto a later line', () => {
    // The header is a wrapped paragraph in the real file, and a reflow must not read as a
    // missing header.
    const text = ['**State:** working tree at', 'version `0.90.1` today.', '', 'Something else.'].join('\n');
    assert.equal(statedHandoffVersion(text).version, '0.90.1');
  });

  it('stops at the blank line, so a later version elsewhere is not mistaken for the header', () => {
    const text = ['**State:** `main` at `0.89.0`.', '', 'History: released `0.12.0` in June.'].join('\n');
    assert.equal(statedHandoffVersion(text).version, '0.89.0');
  });

  it('refuses a file with no State line, and says which', () => {
    const answer = statedHandoffVersion('# handoff\n\nSome prose at `0.89.0`.\n');
    assert.equal(answer.version, null);
    assert.equal(answer.reason.includes('no **State:** line'), true, answer.reason);
  });

  it('refuses a State line that names no version', () => {
    const answer = statedHandoffVersion('**State:** `main`, in good shape.\n');
    assert.equal(answer.version, null);
    assert.equal(answer.reason.includes('names no'), true, answer.reason);
  });

  it('refuses an empty file rather than treating it as agreement', () => {
    assert.equal(statedHandoffVersion('').version, null);
  });
});

describe('isShipped', () => {
  const shipped = [
    'hooks/guard.mjs',
    'scripts/driver.mjs',
    'commands/meeseeks.md',
    'templates/reviewer-system.md',
    'output-styles/meeseeks.md',
    'skills/mr-meeseeks/SKILL.md',
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
      'skills',
      '.claude-plugin',
    ]);
  });
});

describe('the slice fingerprint uses the same loader boundary', () => {
  it('covers every loader path the release gate covers', () => {
    for (const file of [
      'hooks/guard.mjs',
      'scripts/driver.mjs',
      'commands/meeseeks.md',
      'templates/reviewer-system.md',
      'output-styles/meeseeks.md',
      'skills/mr-meeseeks/SKILL.md',
      '.claude-plugin/plugin.json',
      '.claude-plugin/marketplace.json',
    ]) {
      assert.equal(isFingerprintPath(file), true, file);
    }
  });

  it('also binds release metadata, without widening to repository documentation', () => {
    assert.deepStrictEqual(FINGERPRINT_FILES, ['package.json', 'package-lock.json']);
    assert.equal(isFingerprintPath('package.json'), true);
    assert.equal(isFingerprintPath('package-lock.json'), true);
    assert.equal(isFingerprintPath('README.md'), false);
    assert.equal(isFingerprintPath('test/release-check.test.mjs'), false);
  });
});

describe('evaluateRelease', () => {
  // Every case names `handoffVersion` explicitly. The field is required rather than optional
  // precisely so a caller cannot forget it and get a pass by omission - a missing header is
  // the failure this check was added for.
  const versions = { pluginVersion: '0.1.2', packageVersion: '0.1.2', handoffVersion: '0.1.2' };

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

  it('fails a skill-only change, which previously bypassed the version gate', () => {
    const verdict = evaluateRelease({ ...versions, changedFiles: ['skills/mr-meeseeks/SKILL.md'] });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.problems[0].includes('skills/mr-meeseeks/SKILL.md'), true, verdict.problems[0]);
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
    const verdict = evaluateRelease({
      pluginVersion: '0.1.2',
      packageVersion: '0.1.1',
      handoffVersion: '0.1.2',
      changedFiles: [],
    });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.problems[0].includes('version mismatch'), true);
  });

  // The header went stale by fourteen versions once, then by three more (0.86.0-0.88.0)
  // directly under its own warning not to. Both directions are asserted, because a check that
  // only fires one way is half a gate.
  it('fails when HANDOFF.md is behind the manifests', () => {
    const verdict = evaluateRelease({
      pluginVersion: '0.1.2',
      packageVersion: '0.1.2',
      handoffVersion: '0.1.1',
      changedFiles: [],
    });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.problems.length, 1);
    assert.equal(verdict.problems[0].includes('HANDOFF.md says the tree is at 0.1.1'), true, verdict.problems[0]);
    assert.equal(verdict.problems[0].includes('manifests say 0.1.2'), true, verdict.problems[0]);
  });

  it('fails when HANDOFF.md is ahead of the manifests', () => {
    // The likelier direction after this gate exists: the header is updated first and the bump
    // is forgotten. It is exactly as wrong and gets exactly the same refusal.
    const verdict = evaluateRelease({
      pluginVersion: '0.1.2',
      packageVersion: '0.1.2',
      handoffVersion: '0.2.0',
      changedFiles: [],
    });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.problems[0].includes('HANDOFF.md says the tree is at 0.2.0'), true, verdict.problems[0]);
  });

  it('passes when HANDOFF.md agrees, and says nothing about it', () => {
    const verdict = evaluateRelease({ ...versions, changedFiles: [] });
    assert.deepStrictEqual(verdict, { ok: true, problems: [] });
  });

  it('fails when the header could not be read at all, and repeats the reason', () => {
    // Nothing defaults to pass. An unreadable header is not evidence of a correct one.
    const verdict = evaluateRelease({
      pluginVersion: '0.1.2',
      packageVersion: '0.1.2',
      handoffVersion: null,
      handoffReason: 'HANDOFF.md has no **State:** line, so the version it claims cannot be read',
      changedFiles: [],
    });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.problems[0].includes('no **State:** line'), true, verdict.problems[0]);
    assert.equal(
      verdict.problems[0].includes('A header that cannot be checked is not a header that is right'),
      true,
      verdict.problems[0],
    );
  });

  it('reports both problems at once', () => {
    const verdict = evaluateRelease({
      pluginVersion: '0.1.2',
      packageVersion: '0.1.1',
      handoffVersion: '0.1.2',
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
    assert.match(lines[0], /^ok: version \d+\.\d+\.\d+, no shipped file changed since abc1234, and HANDOFF\.md agrees$/);
  });

  // `main` reads the real `HANDOFF.md` from the real repository root, so this passing is also
  // a statement that this repository's own header currently agrees with its manifests. That
  // is a deliberate exception to the note below: agreement between two files in the tree is a
  // property of the tree right now, not a property of an unfinished change.
  it("refuses when HANDOFF.md's header disagrees, against a tree where it does not", () => {
    /** @type {string[]} */
    const lines = [];
    const git = (/** @type {string[]} */ args) => (args[0] === 'log' ? 'abc1234\n' : '\n');
    // A directory with manifests at a version and a HANDOFF.md at another. Written rather
    // than mocked, because the point is that `main` reads the file off disk.
    const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-release-'));
    try {
      mkdirSync(path.join(dir, '.claude-plugin'));
      writeFileSync(path.join(dir, '.claude-plugin/plugin.json'), JSON.stringify({ version: '9.9.9' }));
      writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '9.9.9' }));
      writeFileSync(path.join(dir, 'HANDOFF.md'), '# handoff\n\n**State:** `main` at `9.9.8`. Stale.\n');
      assert.equal(main({ cwd: dir, log: (line) => lines.push(line), git }), 1);
      const said = lines.join('\n');
      assert.equal(said.includes('HANDOFF.md says the tree is at 9.9.8'), true, said);
      assert.equal(said.includes('manifests say 9.9.9'), true, said);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses a tree whose HANDOFF.md is missing entirely', () => {
    /** @type {string[]} */
    const lines = [];
    const git = (/** @type {string[]} */ args) => (args[0] === 'log' ? 'abc1234\n' : '\n');
    const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-release-'));
    try {
      mkdirSync(path.join(dir, '.claude-plugin'));
      writeFileSync(path.join(dir, '.claude-plugin/plugin.json'), JSON.stringify({ version: '9.9.9' }));
      writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '9.9.9' }));
      assert.equal(main({ cwd: dir, log: (line) => lines.push(line), git }), 1);
      assert.equal(lines.join('\n').includes('no **State:** line'), true, lines.join('\n'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Deliberately not asserted here: whether *this* repository is releasable right now.
  // That would turn `npm test` red during ordinary work on a shipped file — not a defect,
  // just a bump not yet made — and a suite that is red while you are mid-change is one
  // people learn to ignore. `npm run release-check` is the gate for that, on purpose.
});
