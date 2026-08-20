/**
 * Tier 2 — the machine-state boundary is positional, and git agrees (REVIEW F9, DESIGN.md §7).
 *
 * **The list was always one artifact behind.** The driver promised to keep its own state out of the
 * target's history and implemented that promise as a hand-maintained enumeration of filenames.
 * `state.json`, `outcome.json`, `run.json` and the per-run archive were each added *after* a live
 * run had already committed them — three of those by the person who had documented the hazard that
 * morning — and when Codex looked, `oracle.json`, `capabilities.json` and the mutation sandbox's
 * `stryker.config.json` were still missing. Every artifact added since has been trackable until
 * somebody remembered, and a run that tracks its own `.meeseeks/` also makes the *next* preflight
 * refuse the repository.
 *
 * A unit test can only assert what the stanza *says*. Whether git *agrees* — whether
 * `.meeseeks/*` really excludes a nested directory, whether the negation for `config.json` really
 * survives, whether `git add -A` really stages nothing else — is git's contract, not ours, and
 * §11.1 is unambiguous about where that has to be checked.
 *
 * No network, no API call. Real git.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { ensureMeeseeksIgnored } from '../../scripts/driver.mjs';

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
 * What `git add -A` actually stages, which is the only oracle that answers the question asked.
 *
 * **Not `git check-ignore`.** That command exits 0 when a pattern *matches*, and a negation is a
 * pattern — so `check-ignore -q .meeseeks/config.json` succeeds against the carve-out and reports
 * the file as ignored when it is precisely the file that is not. Staging is the behaviour the
 * finding is about, so staging is what is measured.
 *
 * @param {string} root
 * @returns {string[]} sorted repo-relative paths
 */
function stagedByAddAll(root) {
  git(root, ['add', '-A']);
  return git(root, ['diff', '--cached', '--name-only'])
    .split('\n')
    .filter((line) => line !== '')
    .sort();
}

/**
 * Everything the driver, its modules, and the tools it invokes write under `.meeseeks/` — plus an
 * artifact nobody has invented yet, which is the case the enumeration could never cover.
 */
const WRITERS = [
  'state.json',
  'pins.json',
  'lessons.json',
  'red-evidence.json',
  'bloopers.log',
  'assumptions.json',
  'review.json',
  'outcome.json',
  'run.json',
  'lock.json',
  'launch.json',
  'specification.json',
  'oracle.json',
  'capabilities.json',
  'gate-skip.json',
  'stryker.config.json',
  'reality-check.md',
  'test-report.json',
  'briefs/iter-001.md',
  'runs/0001/outcome.json',
  'oracle-scratch/case-1/input.csv',
  'an-artifact-added-next-year.json',
  'some/deeply/nested/future/thing.bin',
];

/** A repository whose `.meeseeks/` holds every writer's output. @returns {string} */
function materialised() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-ignore-'));
  temporaryDirs.push(root);
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'test']);
  writeFileSync(path.join(root, 'README.md'), '# The deliverable\n');
  mkdirSync(path.join(root, '.meeseeks'), { recursive: true });
  writeFileSync(path.join(root, '.meeseeks', 'config.json'), '{"maxIterations":1}\n');
  for (const relative of WRITERS) {
    const full = path.join(root, '.meeseeks', relative);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, 'machine state\n');
  }
  // Caches the tools a gate invokes leave behind, which end the same way if they are tracked.
  mkdirSync(path.join(root, 'node_modules', 'dep'), { recursive: true });
  writeFileSync(path.join(root, 'node_modules', 'dep', 'index.js'), 'module.exports = 1;\n');
  mkdirSync(path.join(root, '.hypothesis'), { recursive: true });
  writeFileSync(path.join(root, '.hypothesis', 'examples.db'), 'x\n');
  writeFileSync(path.join(root, 'run.log'), 'the operator redirected the run here\n');
  return root;
}

describe('git add -A stages the deliverable and nothing the driver owns', () => {
  it('stages only the deliverable and the deliberate config carve-out', async () => {
    // F9's acceptance line, entire: materialise every writer, run `git add -A`, and see what git
    // was prepared to commit into the product being built.
    const root = materialised();
    assert.equal(ensureMeeseeksIgnored(root), true, 'the driver wrote no stanza at all');
    const staged = stagedByAddAll(root);
    assert.deepStrictEqual(
      staged,
      ['.gitignore', '.meeseeks/config.json', 'README.md'],
      `unexpected staging:\n${staged.join('\n')}`,
    );
  });

  it('will not stage an artifact nobody has invented yet, without naming it anywhere', async () => {
    // The property the enumeration could not have. Both of these are inside `.meeseeks/` and
    // neither appears in any list in this repository.
    const root = materialised();
    ensureMeeseeksIgnored(root);
    const staged = stagedByAddAll(root);
    for (const relative of ['an-artifact-added-next-year.json', 'some/deeply/nested/future/thing.bin']) {
      assert.equal(staged.includes(`.meeseeks/${relative}`), false, `${relative} was staged`);
    }
  });

  it('will not stage the three artifacts the enumeration was still missing', async () => {
    // `oracle.json`, `capabilities.json` and `stryker.config.json`, named in REVIEW F9. The held-out
    // oracle case files are the sharpest of the three: tracked, the target's own history would carry
    // the cases the builder is never shown.
    const root = materialised();
    ensureMeeseeksIgnored(root);
    const staged = stagedByAddAll(root);
    for (const relative of ['oracle.json', 'capabilities.json', 'stryker.config.json', 'oracle-scratch/case-1/input.csv']) {
      assert.equal(staged.includes(`.meeseeks/${relative}`), false, `${relative} was staged`);
    }
  });

  it('keeps the operator-owned config trackable, which is the one carve-out', async () => {
    // `.meeseeks/*` rather than `.meeseeks/`, and this is the assertion that proves the difference
    // matters: git will not descend into an excluded *directory*, so a negation for a child of one
    // is inert. Excluding the contents is what makes the carve-out effective, and only git can say
    // so.
    const root = materialised();
    ensureMeeseeksIgnored(root);
    assert.equal(stagedByAddAll(root).includes('.meeseeks/config.json'), true, 'the settings file was ignored');
  });

  it('leaves an existing blanket .meeseeks/ rule alone, because it already covers everything', async () => {
    // The benign neighbour. A repository whose operator already ignored the whole directory has
    // handled this, and rewriting their file every run would be noise.
    const root = materialised();
    writeFileSync(path.join(root, '.gitignore'), '.meeseeks/\nnode_modules/\n');
    assert.equal(ensureMeeseeksIgnored(root), false, 'a covered repository was rewritten anyway');
  });

  it('repairs a .gitignore written by an older build that enumerated names', async () => {
    // The self-correcting half, against real git: a repository carrying the old enumeration gains
    // the positional rule rather than keeping an incomplete list forever.
    const root = materialised();
    writeFileSync(
      path.join(root, '.gitignore'),
      ['.meeseeks/state.json', '.meeseeks/outcome.json', 'node_modules/', ''].join('\n'),
    );
    assert.equal(ensureMeeseeksIgnored(root), true, 'an older stanza was left incomplete');
    const staged = stagedByAddAll(root);
    assert.deepStrictEqual(staged, ['.gitignore', '.meeseeks/config.json', 'README.md'], staged.join('\n'));
  });
});
