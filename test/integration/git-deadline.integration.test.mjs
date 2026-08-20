/**
 * Tier 2 — a Git helper cannot hang an unattended run (REVIEW F44).
 *
 * **Git is not a short local syscall just because it usually is.** It runs repository-configured
 * clean and smudge filters, `fsmonitor` hooks, signing with its pinentry, and credential helpers —
 * and the Builder has unrestricted Bash, so it can add a `.gitattributes` or a repository-local
 * config entry before the Driver's final commit. Codex reproduced it with a clean filter of
 * `sleep 30`: a `git add` ran past every ceiling the product has, because Driver-owned Git calls
 * carried none. Nothing else could fire — no timer, no forced kill, no descendant cleanup, no
 * terminal receipt, no lock release — while the helper stayed alive.
 *
 * The filter here is the same shape and deliberately hostile: a target could write exactly this.
 *
 * Real git, real processes. No network, no API call.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { GIT_OPERATION_TIMEOUT_MS, TERMINATION_GRACE_MS, git } from '../../scripts/driver.mjs';

/** @type {string[]} */
const temporaryDirs = [];

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** @param {string} root @param {string[]} args @returns {string} */
function plainGit(root, args) {
  return execFileSync('git', args, { cwd: root, stdio: 'pipe', encoding: 'utf8' }).trim();
}

/**
 * A repository whose own configuration makes `git add` call a command that never returns.
 *
 * @param {{ sleepSeconds: number }} options
 * @returns {string}
 */
function repoWithResistantFilter(options) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-git-deadline-'));
  temporaryDirs.push(root);
  plainGit(root, ['init', '--quiet']);
  plainGit(root, ['config', 'user.email', 'test@example.com']);
  plainGit(root, ['config', 'user.name', 'test']);
  // Repository-local, exactly as a target could set it.
  plainGit(root, ['config', 'filter.stall.clean', `sleep ${options.sleepSeconds}`]);
  writeFileSync(path.join(root, '.gitattributes'), 'payload.txt filter=stall\n', 'utf8');
  writeFileSync(path.join(root, 'payload.txt'), 'anything at all\n', 'utf8');
  return root;
}

describe('a Driver-owned Git call is bounded like every other command', () => {
  it('returns within the ceiling when a clean filter never comes back', { timeout: 120_000 }, async () => {
    // The reproduction. Before this, `git add` here ran for the filter's full lifetime with no
    // ceiling at all; the assertion is that the Driver's own bound is what ends it.
    const root = repoWithResistantFilter({ sleepSeconds: 90 });
    const attributes = plainGit(root, ['check-attr', 'filter', 'payload.txt']);
    assert.equal(attributes.includes('filter: stall'), true, `the fixture did not arm the filter: ${attributes}`);

    const started = Date.now();
    // A short ceiling so the bound is provable in seconds; the production default is pinned below.
    const result = await git(['add', '-A'], { cwd: root, timeoutMs: 2_000 });
    const elapsed = Date.now() - started;

    assert.equal(result.timedOut, true, `a stalled filter was not reported as a timeout: ${result.stderr}`);
    assert.equal(result.ok, false);
    // Bounded by the Driver, not by the filter finishing on its own.
    assert.equal(
      elapsed < 2_000 + TERMINATION_GRACE_MS + 15_000,
      true,
      `git add returned after ${elapsed}ms; the bound is the ceiling plus ${TERMINATION_GRACE_MS} and slack`,
    );
  });

  it('bounds every Driver-owned Git call by default, at a value nothing legitimate reaches', () => {
    // The ceiling that actually ships. A test that only ever passes its own short bound would prove
    // the mechanism and say nothing about production, which is the shape this repository keeps
    // finding: a correct primitive nobody uses with the real value.
    assert.equal(GIT_OPERATION_TIMEOUT_MS, 120_000);
    const source = readFileSync(new URL('../../scripts/driver.mjs', import.meta.url), 'utf8');
    assert.equal(
      /shell\('git'/.test(source.replace("shell('git', [...GIT_NON_INTERACTIVE_ARGS", '')),
      false,
      'a Driver-owned Git call bypasses the bounded door',
    );
  });

  it('takes the stalled helper with it rather than leaving it running', { timeout: 120_000 }, async () => {
    // **The half process ownership had to land first for** (REVIEW F33). The filter is a grandchild
    // of the Driver: `git` spawns it, and killing `git` alone would leave it holding the pipe. It is
    // in the invocation's process group, so the group kill reaches it.
    const root = repoWithResistantFilter({ sleepSeconds: 90 });

    const result = await git(['add', '-A'], { cwd: root, timeoutMs: 2_000 });

    assert.equal(result.timedOut, true);
    const survivors = execFileSync('sh', ['-c', 'ps -eo args= | grep -c "[s]leep 90" || true'], { encoding: 'utf8' }).trim();
    assert.equal(survivors, '0', `${survivors} stalled filter process(es) outlived the bounded git call`);
  });

  it('refuses to wait for a signing prompt, because nobody is at the keyboard', { timeout: 60_000 }, async () => {
    // Signing is disabled for Driver-owned commits, so a repository that demands it cannot hold an
    // unattended run open on a pinentry. The commit must simply succeed unsigned.
    const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-git-sign-'));
    temporaryDirs.push(root);
    plainGit(root, ['init', '--quiet']);
    plainGit(root, ['config', 'user.email', 'test@example.com']);
    plainGit(root, ['config', 'user.name', 'test']);
    plainGit(root, ['config', 'commit.gpgSign', 'true']);
    plainGit(root, ['config', 'gpg.program', '/bin/false']);
    writeFileSync(path.join(root, 'a.txt'), 'x\n', 'utf8');

    assert.equal((await git(['add', '-A'], { cwd: root })).ok, true);
    const committed = await git(['commit', '-m', 'unsigned on purpose'], { cwd: root });

    assert.equal(committed.ok, true, `a repository demanding a signature blocked the commit: ${committed.stderr}`);
    assert.equal(committed.timedOut, false);
  });

  it('leaves an ordinary repository exactly as fast as before', { timeout: 60_000 }, async () => {
    // The neighbour. A ceiling nothing reaches must cost nothing: this is the shape of every real
    // Git call the Driver makes.
    const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-git-plain-'));
    temporaryDirs.push(root);
    plainGit(root, ['init', '--quiet']);
    plainGit(root, ['config', 'user.email', 'test@example.com']);
    plainGit(root, ['config', 'user.name', 'test']);
    writeFileSync(path.join(root, 'a.txt'), 'x\n', 'utf8');

    const started = Date.now();
    assert.equal((await git(['add', '-A'], { cwd: root })).ok, true);
    assert.equal((await git(['commit', '-m', 'ordinary'], { cwd: root })).ok, true);
    const head = await git(['rev-parse', 'HEAD'], { cwd: root });

    assert.equal(head.ok, true);
    assert.match(head.stdout.trim(), /^[0-9a-f]{40}$/);
    assert.equal(Date.now() - started < 30_000, true, 'an ordinary repository paid the ceiling');
  });

  it('reports an ordinary Git failure as a failure, not as a timeout', { timeout: 60_000 }, async () => {
    // The discriminator F44 asks for: a helper that never returns and a command that simply fails
    // send an operator to different places, so they must not read the same.
    const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-git-fail-'));
    temporaryDirs.push(root);
    plainGit(root, ['init', '--quiet']);

    const result = await git(['rev-parse', 'HEAD'], { cwd: root });

    assert.equal(result.ok, false, 'a repository with no commits reported a HEAD');
    assert.equal(result.timedOut, false, 'an ordinary Git failure was reported as a timeout');
  });
});
