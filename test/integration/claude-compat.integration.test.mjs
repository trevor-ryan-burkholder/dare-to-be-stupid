/**
 * Tier 2 — a real PATH with a real shadowing binary on it (REVIEW F28).
 *
 * **What a unit test cannot reach.** `test/claude-compat.test.mjs` proves the classification: which
 * strings are refused and why. What it cannot show is that the refusal happens against the binary
 * the *shell would actually run*, before anything is created, spawned or written — and that is the
 * whole finding. `checkClaudeCli` used to accept any executable that exited zero, so a stale binary
 * first on PATH passed the door and failed hours later when a role rejected `--safe-mode`.
 *
 * So this puts an executable script called `claude` at the front of a real `PATH`, runs the real
 * `runPreflight` with the real `defaultProbe`, and checks the verdict and the tree.
 *
 * Real processes and real git. No network, no API, no money.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { SUPPORTED_FLOOR, VERIFIED_THROUGH } from '../../scripts/claude-compat.mjs';
import { defaultProbe, runPreflight } from '../../scripts/preflight.mjs';

/** @type {string[]} */
const temporaryDirs = [];

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** @param {string} root @param {string[]} args @returns {string} */
function git(root, args) {
  return execFileSync('git', args, { cwd: root, stdio: 'pipe', encoding: 'utf8' }).trim();
}

/** A committed repository a run could legitimately start in. @returns {string} */
function repo() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-compat-'));
  temporaryDirs.push(root);
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'test']);
  writeFileSync(path.join(root, 'PRD.md'), '# Thing\n\n## Requirements\n\nPRD-1.1 It exists.\n');
  writeFileSync(path.join(root, '.gitignore'), '.meeseeks/\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'prd']);
  return root;
}

/**
 * A shell script named `claude` that reports whatever it is told to, first on a real PATH.
 *
 * A script rather than a stub function, because the thing under test is what `defaultProbe` finds
 * by executing `claude` — a fake passed in as an argument would prove nothing about resolution.
 *
 * @param {string} versionOutput @returns {{ dir: string, env: NodeJS.ProcessEnv }}
 */
function shadowingClaude(versionOutput) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-fake-bin-'));
  temporaryDirs.push(dir);
  const file = path.join(dir, 'claude');
  writeFileSync(file, `#!/bin/sh\nprintf '%s\\n' ${JSON.stringify(versionOutput)}\n`, 'utf8');
  chmodSync(file, 0o755);
  return { dir, env: { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH ?? ''}` } };
}

/**
 * `runPreflight` with a probe that resolves commands against a chosen PATH.
 *
 * @param {string} cwd @param {NodeJS.ProcessEnv} env
 * @returns {Promise<{ ok: boolean, checks: any[], failures: any[] }>}
 */
function preflightWith(cwd, env) {
  const inherited = process.env.PATH;
  process.env.PATH = env.PATH;
  try {
    return runPreflight({ cwd, yes: true, probe: defaultProbe(cwd) });
  } finally {
    process.env.PATH = inherited;
  }
}

/** @param {any[]} checks @returns {any} */
const cli = (checks) => checks.find((entry) => entry.name === 'claude-cli');

describe('an unverified Claude Code refuses at the door', () => {
  it('refuses a binary older than the policy floor, before anything is created', async () => {
    // The reproduction. `2.1.136` is the version this repository records as having never heard of
    // `--safe-mode`; the old check accepted it because it exited zero.
    const root = repo();
    const { env } = shadowingClaude('2.1.136 (Claude Code)');

    const result = await preflightWith(root, env);

    assert.equal(result.ok, false, 'preflight passed on a binary recorded as incompatible');
    const verdict = cli(result.checks);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.detail.includes('older than'), true, verdict.detail);
    assert.equal(verdict.detail.includes(SUPPORTED_FLOOR), true, verdict.detail);
    // No **run** state was created on the way to the refusal, and no tracked file moved. The
    // scaffolded `config.json` is preflight's own documented job — `meeseeks init` is where a config
    // comes from — so the honest assertion names the artifacts that mean a run began: the lock, the
    // run manifest, the receipt.
    for (const artifact of ['lock.json', 'run.json', 'outcome.json']) {
      assert.equal(existsSync(path.join(root, '.meeseeks', artifact)), false, `${artifact} was created before the refusal`);
    }
    assert.deepStrictEqual(
      existsSync(path.join(root, '.meeseeks')) ? readdirSync(path.join(root, '.meeseeks')) : [],
      ['config.json'],
      'preflight left something behind other than the config it exists to scaffold',
    );
    assert.equal(git(root, ['status', '--porcelain']), '', 'a tracked file changed before the refusal');
  });

  it('names the executable it actually resolved, not the word claude', async () => {
    // Unactionable otherwise: a host with three `claude` binaries gets a complaint about a name.
    const root = repo();
    const { dir, env } = shadowingClaude('2.1.136');

    const verdict = cli((await preflightWith(root, env)).checks);

    assert.equal(verdict.detail.includes(path.join(dir, 'claude')), true, verdict.detail);
  });

  it('refuses a binary newer than anything measured, and says how to widen the policy', async () => {
    const root = repo();
    const { env } = shadowingClaude('99.0.0 (Claude Code)');

    const verdict = cli((await preflightWith(root, env)).checks);

    assert.equal(verdict.ok, false);
    assert.equal(verdict.detail.includes('newer than'), true, verdict.detail);
    assert.equal(verdict.fix.includes('test:live'), true, verdict.fix);
  });

  it('refuses a binary whose version output is not a version', async () => {
    // A wrapper script that prints a banner is not a Claude Code, and an unreadable answer is not
    // evidence of a compatible one.
    const root = repo();
    const { env } = shadowingClaude('company-wrapper v3 (contact IT)');

    const verdict = cli((await preflightWith(root, env)).checks);

    assert.equal(verdict.ok, false);
    assert.equal(verdict.detail.includes('not a version'), true, verdict.detail);
  });

  it('accepts a binary inside the policy, which is the ordinary host', async () => {
    // The neighbour. A gate that refused every version would be indistinguishable from a broken
    // install, and it would stop the product working at all.
    const root = repo();
    const { env } = shadowingClaude(`${VERIFIED_THROUGH} (Claude Code)`);

    const verdict = cli((await preflightWith(root, env)).checks);

    assert.equal(verdict.ok, true, verdict.detail);
    assert.equal(verdict.detail.includes(VERIFIED_THROUGH), true, verdict.detail);
    assert.equal(verdict.detail.includes(SUPPORTED_FLOOR), true, 'the supported range is not reported');
  });

  it('prints the evidence for the policy it is enforcing', async () => {
    // A version gate that cannot be checked becomes folklore the first time it inconveniences
    // somebody. The refusal carries the measurements the bounds come from.
    const root = repo();
    const { env } = shadowingClaude('2.1.136');

    const verdict = cli((await preflightWith(root, env)).checks);

    assert.equal(verdict.detail.includes('2.1.136 — recorded incompatible'), true, verdict.detail);
    assert.equal(verdict.detail.includes('full npm run test:live passed'), true, verdict.detail);
  });

  it('leaves the fake binary directory holding nothing but the fake', () => {
    // Housekeeping asserted rather than assumed: a stray executable named `claude` left on a
    // developer's disk is a bad afternoon.
    const { dir } = shadowingClaude('2.1.234');
    assert.deepStrictEqual(readdirSync(dir), ['claude']);
  });
});
