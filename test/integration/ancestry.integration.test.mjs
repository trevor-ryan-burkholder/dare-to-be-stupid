/**
 * Tier 2 — the marker-clearing bypass, performed against a real Driver (REVIEW F42, DESIGN §6.6).
 *
 * F42's reproduction is one command. A Builder with unrestricted Bash runs
 *
 *     env -u MEESEEKS_RUNNING node /plugin/scripts/driver.mjs PRD.md --yes
 *
 * from inside a run, pointed at **another** repository so the parent's lock is irrelevant, and
 * `assertNotNested` sees no marker and reports top level. Every ticket, nonce and depth cap on the
 * recognized path is behind that check and is never reached.
 *
 * Nothing at tier 1 can show this closed. `test/ancestry.test.mjs` proves the reconciliation given
 * an ancestry; what it cannot supply is a **real** process whose real parent is a registered run —
 * and that is the entire claim, because the whole point is that ancestry is not something the
 * child's environment can state.
 *
 * So this test registers *itself* as a run in a disposable HOME and then spawns a real Driver as its
 * own child. The child's ancestry genuinely contains a registered run, no matter what it is told.
 *
 * Real processes, real files, no network, no API, no money.
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { registerRun, registryDir } from '../../scripts/run-registry.mjs';

/** @type {string[]} */
const dirs = [];
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** @param {string} tag @returns {string} */
function tempDir(tag) {
  const dir = mkdtempSync(path.join(os.tmpdir(), `meeseeks-${tag}-`));
  dirs.push(dir);
  return dir;
}

/** A committed repository the attacking run would point at. @returns {string} */
function victimRepo() {
  const root = tempDir('victim');
  const git = (/** @type {string[]} */ args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git(['init', '--quiet']);
  git(['config', 'user.email', 'test@example.invalid']);
  git(['config', 'user.name', 'test']);
  writeFileSync(path.join(root, 'PRD.md'), '# Thing\n\n## Requirements\n\nPRD-1.1 It exists.\n', 'utf8');
  writeFileSync(path.join(root, '.gitignore'), '.meeseeks/\n', 'utf8');
  // Configured, or the run refuses on the missing config **before** the ancestry check and every
  // case here passes against a Driver that never looked. The provisioning-lifecycle fixture was
  // written without this and proved nothing for exactly that reason.
  mkdirSync(path.join(root, '.meeseeks'), { recursive: true });
  writeFileSync(
    path.join(root, '.meeseeks', 'config.json'),
    JSON.stringify({ maxIterations: 1, tokenCeiling: 1000, costCeiling: 1, qualityPlugins: [] }),
    'utf8',
  );
  git(['add', '-A']);
  git(['commit', '--quiet', '-m', 'prd']);
  return root;
}

const DRIVER = path.resolve('scripts/driver.mjs');

/**
 * A directory holding a fake `claude`, put first on the child Driver's PATH.
 *
 * **Without this the fixture spends money, and it did.** `startDriver` runs the real entrypoint as
 * a real process, so nothing injects a spawn double the way an in-process `main` test can — the
 * child reached its design phase and called the real CLI. Tier 2 is defined as no network, no API
 * and no money (§11.1), and a fixture that quietly makes a paid call has broken the tier's only
 * promise. This is the same technique `claude-compat.integration.test.mjs` uses, for the same
 * reason: what is under test is the Driver, and the CLI is somebody else's program.
 *
 * The version it reports is inside the compatibility policy, or preflight refuses before anything
 * this file is about. The envelope is the shape `spawnClaude` parses.
 *
 * @returns {string}
 */
function fakeClaudeDir() {
  const dir = tempDir('bin');
  const envelope = JSON.stringify({
    is_error: false,
    result: 'stubbed',
    total_cost_usd: 0,
    usage: { input_tokens: 1, output_tokens: 1 },
  });
  const script = [
    '#!/bin/sh',
    'for arg in "$@"; do',
    '  if [ "$arg" = "--version" ]; then echo "2.1.230 (Claude Code)"; exit 0; fi',
    'done',
    `cat <<'ENVELOPE'`,
    envelope,
    'ENVELOPE',
  ].join('\n');
  writeFileSync(path.join(dir, 'claude'), `${script}\n`, 'utf8');
  chmodSync(path.join(dir, 'claude'), 0o755);
  return dir;
}

/**
 * Start a real Driver as a child of this process.
 *
 * @param {{ home: string, cwd: string, env?: Record<string, string | undefined> }} options
 * @returns {{ status: number | null, output: string }}
 */
function startDriver(options) {
  /** @type {Record<string, string>} */
  const env = {};
  for (const [key, value] of Object.entries({ ...process.env, ...options.env })) {
    if (value !== undefined) env[key] = value;
  }
  // The bypass, exactly: no run marker at all.
  delete env.MEESEEKS_RUNNING;
  env.HOME = options.home;
  env.MEESEEKS_STYLE = 'plain';
  // First on PATH, so no case in this file can reach the real CLI. See `fakeClaudeDir`.
  env.PATH = `${fakeClaudeDir()}${path.delimiter}${env.PATH ?? ''}`;

  const result = spawnSync(process.execPath, [DRIVER, 'PRD.md', '--yes'], {
    cwd: options.cwd,
    env,
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

describe('a Driver started from inside a run cannot hide by clearing its marker (REVIEW F42)', () => {
  it('refuses when an ancestor is a registered run, whatever the environment says', { timeout: 120_000 }, () => {
    // This process registers itself, so the child's ancestry genuinely contains a run. Nothing the
    // child is told can change who its parent is — that is the whole mechanism.
    const home = tempDir('home');
    registerRun({ home, pid: process.pid, depth: 0, startedAt: new Date(0).toISOString(), root: '/parent' });

    const started = startDriver({ home, cwd: victimRepo() });
    assert.notEqual(started.status, 0, 'a nested Driver started successfully with its marker cleared');
    assert.match(started.output, /descendant of run/);
    assert.match(started.output, /ancestry is not something a child chooses/);
  });

  it('starts normally when no ancestor is a registered run', { timeout: 120_000 }, () => {
    // The neighbour, and the assertion that stops this being a wall. An ordinary top-level run has
    // the same ancestry shape — it is a child of *something* — and must not be refused for it.
    const home = tempDir('home');
    const started = startDriver({ home, cwd: victimRepo() });
    assert.equal(/descendant of run/.test(started.output), false, started.output.slice(-400));
  });

  it('takes itself off the register when it finishes, so it cannot refuse the next run', { timeout: 180_000 }, () => {
    // **The wall risk, and the only version of it that is integration-level.** An earlier draft here
    // registered a dead pid and checked that a later run still started — which proved nothing,
    // because a *dead* pid can never be an ancestor of a live process, so pruning it could not have
    // affected the lookup either way. Liveness pruning is hygiene, and `test/run-registry.test.mjs`
    // is where it is actually held.
    //
    // What matters here is deregistration: a Driver that finishes and leaves its entry behind has
    // planted a refusal for every later run whose ancestry happens to include a reused pid, and the
    // failure would surface hours later on a machine nobody is watching.
    const home = tempDir('home');
    const first = startDriver({ home, cwd: victimRepo() });
    assert.equal(/descendant of run/.test(first.output), false, first.output.slice(-400));

    // **Both halves, because an empty directory proves neither on its own.** A run that never
    // registered leaves no directory and no entries — identical, from the outside, to one that
    // registered and cleaned up. The directory's existence is the evidence that registration
    // happened at all; its emptiness is the evidence that deregistration did.
    assert.equal(existsSync(registryDir(home)), true, 'the run never registered itself, so its cleanup proves nothing');
    const entries = readdirSync(registryDir(home));
    assert.deepEqual(entries, [], `a finished run left itself on the register: ${entries.join(', ')}`);

    // And the run that follows it starts, which is what the assertion above is protecting.
    const second = startDriver({ home, cwd: victimRepo() });
    assert.equal(/descendant of run/.test(second.output), false, second.output.slice(-400));
  });

  it('reports unknown rather than refusing when the register is unreadable', { timeout: 120_000 }, () => {
    // A home directory that cannot be read is an operator's problem. Refusing there would make the
    // check the reason unattended runs stop working, and the honest report is `unknown`.
    const started = startDriver({ home: '/proc/nonexistent-home', cwd: victimRepo() });
    assert.equal(/descendant of run/.test(started.output), false, started.output.slice(-400));
  });
});
