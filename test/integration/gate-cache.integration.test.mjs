/**
 * Tier 2 — the gate-skip workspace hash against **real git**. Needs `git`; no network, no API,
 * no money.
 *
 * `workspaceHash` is unit-tested with a `run` double, and that proves the hashing arithmetic but
 * nothing about whether `git ls-files -z` and `git ls-files --others --exclude-standard -z`
 * actually return what R35 depends on: every first-party file, and *not* the ignored ones. That
 * contract belongs to the git binary, which is this tier's whole reason for existing
 * (`DESIGN.md` §11.1, the argv defect).
 *
 * What it must establish, because the skip decision rests on all of it:
 *
 *   1. the same tree hashes to the same value twice (a skip is only safe if the hash is stable);
 *   2. editing a tracked source file changes the hash (the RE-RUN signal fires);
 *   3. a gitignored file — the `.meeseeks/` machine state and `node_modules` the driver never
 *      wants in the hash — does not change it, so an iteration that only rewrote machine state is
 *      correctly seen as unchanged;
 *   4. a git failure yields `null`, so uncertainty re-runs rather than reading as an empty tree.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { after, describe, it } from 'node:test';

import { workspaceHash } from '../../scripts/gate-cache.mjs';

const execFileAsync = promisify(execFile);

/** @type {string[]} */
const temporaryDirs = [];
after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * A real git working tree with one committed source file, a `.gitignore` that ignores
 * `.meeseeks/` and `node_modules/`, and a `run` seam over the real `git` binary — the same shape
 * the driver hands `workspaceHash`.
 *
 * @returns {{ root: string, run: (command: string, args: string[], options: { cwd: string }) => Promise<{ ok: boolean, stdout: string }> }}
 */
function repo() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-gatecache-'));
  temporaryDirs.push(root);
  const git = (/** @type {string[]} */ args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git(['init', '--quiet']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'test']);
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeFileSync(path.join(root, 'src/index.js'), 'export const answer = 42;\n');
  writeFileSync(path.join(root, '.gitignore'), '.meeseeks/\nnode_modules/\n');
  git(['add', '-A']);
  git(['commit', '--quiet', '-m', 'initial']);
  /** @param {string} command @param {string[]} args @param {{ cwd: string }} options */
  const run = async (command, args, options) => {
    try {
      const { stdout } = await execFileAsync(command, args, { cwd: options.cwd });
      return { ok: true, stdout };
    } catch {
      return { ok: false, stdout: '' };
    }
  };
  return { root, run };
}

describe('workspaceHash against real git', () => {
  it('is stable across two reads of the same tree', async () => {
    const { root, run } = repo();
    const first = await workspaceHash({ cwd: root, run });
    const second = await workspaceHash({ cwd: root, run });
    assert.match(/** @type {string} */ (first), /^sha256:[0-9a-f]{64}$/);
    assert.equal(second, first);
  });

  it('changes when a tracked source file is edited', async () => {
    const { root, run } = repo();
    const before = await workspaceHash({ cwd: root, run });
    writeFileSync(path.join(root, 'src/index.js'), 'export const answer = 43;\n');
    const afterEdit = await workspaceHash({ cwd: root, run });
    assert.notEqual(afterEdit, before);
  });

  it('changes when a new untracked source file appears', async () => {
    const { root, run } = repo();
    const before = await workspaceHash({ cwd: root, run });
    writeFileSync(path.join(root, 'src/extra.js'), 'export const extra = true;\n');
    const afterAdd = await workspaceHash({ cwd: root, run });
    assert.notEqual(afterAdd, before);
  });

  it('does NOT change when only gitignored machine state changes', async () => {
    // The whole point: an iteration that rewrote `.meeseeks/state.json` and a `node_modules`
    // cache, but touched no first-party source, must read as unchanged so a deterministic gate
    // can be carried. Ignored files are outside git's first-party view and outside the hash.
    const { root, run } = repo();
    const before = await workspaceHash({ cwd: root, run });
    mkdirSync(path.join(root, '.meeseeks'), { recursive: true });
    writeFileSync(path.join(root, '.meeseeks/state.json'), '{"iteration":7}\n');
    mkdirSync(path.join(root, 'node_modules/dep'), { recursive: true });
    writeFileSync(path.join(root, 'node_modules/dep/index.js'), 'module.exports = 1;\n');
    const afterMachineState = await workspaceHash({ cwd: root, run });
    assert.equal(afterMachineState, before);
  });

  // The three below are the boundary REVIEW F14 needs proved before this hash can be reused as a
  // *candidate workspace identity*: a verdict sealed to it must not survive a deletion, a symlink
  // retarget, or a path that cannot be read.
  it('changes when a tracked source file is deleted', async () => {
    const { root, run } = repo();
    const before = await workspaceHash({ cwd: root, run });
    rmSync(path.join(root, 'src/index.js'));
    // git still lists the path from the index, and reading it fails, so the tree is one this
    // cannot claim to have measured. `null` never matches, which is the fail-closed direction.
    assert.equal(await workspaceHash({ cwd: root, run }), null);
    assert.notEqual(before, null);
  });

  it('changes when a symlink is retargeted at different bytes', { skip: process.platform === 'win32' }, async () => {
    const { root, run } = repo();
    writeFileSync(path.join(root, 'a.txt'), 'one\n');
    writeFileSync(path.join(root, 'b.txt'), 'two\n');
    symlinkSync(path.join(root, 'a.txt'), path.join(root, 'link.txt'));
    const before = await workspaceHash({ cwd: root, run });
    rmSync(path.join(root, 'link.txt'));
    symlinkSync(path.join(root, 'b.txt'), path.join(root, 'link.txt'));
    assert.notEqual(await workspaceHash({ cwd: root, run }), before);
  });

  it('reads a symlink to nowhere as an unmeasurable tree rather than as an empty file', { skip: process.platform === 'win32' }, async () => {
    const { root, run } = repo();
    symlinkSync(path.join(root, 'does-not-exist.txt'), path.join(root, 'dangling.txt'));
    assert.equal(await workspaceHash({ cwd: root, run }), null);
  });

  it('returns null when git cannot run — uncertainty, not an empty tree', async () => {
    const { root } = repo();
    // A run seam that always fails stands in for a broken/absent git. The hash must be null so the
    // caller re-runs every gate rather than skipping on a listing it never got.
    const brokenRun = async () => ({ ok: false, stdout: '' });
    assert.equal(await workspaceHash({ cwd: root, run: brokenRun }), null);
  });
});
