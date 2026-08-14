/**
 * Tests for preflight (DESIGN.md §3.5).
 *
 * Preflight is the last point at which a human is still in the loop. After it passes, a
 * process runs unattended with permissions skipped. So the properties worth proving are
 * that each check really fails when it should, that a failure is *blocking* rather than
 * advisory, and that every check still runs after one has failed — an operator should see
 * every problem in one pass, not discover the next one on the next attempt.
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import {
  MINIMUM_NODE,
  checkCleanWorkingTree,
  checkDangerAcknowledged,
  checkHasCommits,
  checkNoConcurrentRun,
  checkStateNotTracked,
  checkNodeVersion,
  checkRemoteIsNotProduction,
  checkSandboxAvailable,
  compareVersions,
  formatPreflight,
  runPreflight,
} from '../scripts/preflight.mjs';
import { RUN_LOCK_FILE, claimRunLock } from '../scripts/run-lock.mjs';

/** @type {string[]} */
const temporaryDirs = [];

/** @returns {string} */
function makeTempDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-preflight-'));
  temporaryDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * A probe where everything a healthy machine would answer, answers.
 * @type {Record<string, { ok: boolean, stdout?: string, stderr?: string }>}
 */
const HEALTHY = {
  'git ls-files .meeseeks': { ok: true, stdout: '' },
  'claude --version': { ok: true, stdout: '2.1.226 (Claude Code)\n' },
  'git rev-parse --is-inside-work-tree': { ok: true, stdout: 'true\n' },
  'git rev-parse HEAD': { ok: true, stdout: 'a1b2c3d4e5f67890abcdef1234567890abcdef12\n' },
  'git status --porcelain': { ok: true, stdout: '' },
  'git remote -v': { ok: true, stdout: 'origin\tgit@github.com:example/throwaway.git (fetch)\n' },
  'npm ping --silent': { ok: true, stdout: '' },
};

/**
 * @param {Record<string, { ok: boolean, stdout?: string, stderr?: string }>} [overrides]
 * @returns {import('../scripts/preflight.mjs').Probe}
 */
function probeWith(overrides = {}) {
  const table = { ...HEALTHY, ...overrides };
  return (command, args) => {
    const answer = table[[command, ...args].join(' ')] ?? { ok: false, stderr: 'not found' };
    return { ok: answer.ok, stdout: answer.stdout ?? '', stderr: answer.stderr ?? '' };
  };
}

/**
 * @param {{
 *   probe?: import('../scripts/preflight.mjs').Probe,
 *   yes?: boolean,
 *   nodeVersion?: string,
 *   cwd?: string,
 * }} [options]
 */
async function preflight(options = {}) {
  const cwd = options.cwd ?? makeTempDir();
  return await runPreflight({
    cwd,
    meeseeksDir: path.join(cwd, '.meeseeks'),
    probe: options.probe ?? probeWith(),
    yes: options.yes ?? true,
    nodeVersion: options.nodeVersion ?? '22.12.0',
  });
}

/**
 * @param {Awaited<ReturnType<typeof runPreflight>>} result
 * @returns {string[]}
 */
function failedNames(result) {
  return result.failures.map((failure) => failure.name).sort();
}

describe('a healthy machine passes', () => {
  it('reports ok with no failures', async () => {
    const result = await preflight();
    assert.equal(result.ok, true);
    assert.deepStrictEqual(failedNames(result), []);
  });

  it('runs every check named in DESIGN.md §3.5', async () => {
    assert.deepStrictEqual(
      (await preflight()).checks.map((entry) => entry.name),
      [
        'node-version',
        'claude-cli',
        'git-repository',
        'has-commits',
        'clean-working-tree',
        'safe-remote',
        'network',
        'config',
        'no-concurrent-run',
        'state-not-tracked',
        'sandbox',
        'agent-surface',
        'danger-acknowledged',
      ],
    );
  });

  it('scaffolds .meeseeks/config.json on the way through', async () => {
    const config = (await preflight({ cwd: makeTempDir() })).checks.find((entry) => entry.name === 'config');
    assert.equal(config?.ok, true);
    assert.equal(config?.detail.startsWith('scaffolded '), true);
  });
});

describe('each check fails on its own', () => {
  /** @type {[Parameters<typeof preflight>[0], string][]} */
  const cases = [
    [{ nodeVersion: '20.11.0' }, 'node-version'],
    [{ probe: probeWith({ 'claude --version': { ok: false, stderr: 'not found' } }) }, 'claude-cli'],
    [{ probe: probeWith({ 'git rev-parse --is-inside-work-tree': { ok: false } }) }, 'git-repository'],
    [{ probe: probeWith({ 'git rev-parse HEAD': { ok: false, stderr: 'unknown revision' } }) }, 'has-commits'],
    [{ probe: probeWith({ 'git rev-parse HEAD': { ok: true, stdout: '\n' } }) }, 'has-commits'],
    [{ probe: probeWith({ 'git status --porcelain': { ok: true, stdout: ' M src/app.ts\n' } }) }, 'clean-working-tree'],
    [
      {
        probe: probeWith({
          'git remote -v': { ok: true, stdout: 'origin\tgit@github.com:acme/production-api.git (fetch)\n' },
        }),
      },
      'safe-remote',
    ],
    [{ probe: probeWith({ 'npm ping --silent': { ok: false, stderr: 'ENOTFOUND' } }) }, 'network'],
    [{ yes: false }, 'danger-acknowledged'],
  ];
  for (const [options, name] of cases) {
    it(`fails ${name}`, async () => {
      const result = await preflight(options);
      assert.equal(result.ok, false);
      assert.deepStrictEqual(failedNames(result), [name]);
    });
  }

  it('fails when the repository carries a committed credential', async () => {
    const cwd = makeTempDir();
    writeFileSync(path.join(cwd, 'keys.ts'), `const id = "AKIA${'QWERTYUIOPASDFGH'}";\n`, 'utf8');
    assert.deepStrictEqual(failedNames(await preflight({ cwd })), ['agent-surface']);
  });

  it('fails when .meeseeks/config.json cannot be understood', async () => {
    const cwd = makeTempDir();
    const meeseeksDir = path.join(cwd, '.meeseeks');
    const first = await preflight({ cwd });
    assert.equal(first.ok, true);
    writeFileSync(path.join(meeseeksDir, 'config.json'), '{ not json', 'utf8');
    assert.deepStrictEqual(failedNames(await preflight({ cwd })), ['config']);
  });
});

describe('every failure is reported at once', () => {
  it('does not stop at the first one', async () => {
    const result = await preflight({
      nodeVersion: '18.0.0',
      yes: false,
      probe: probeWith({
        'claude --version': { ok: false, stderr: 'not found' },
        'git status --porcelain': { ok: true, stdout: '?? junk\n' },
      }),
    });
    assert.deepStrictEqual(failedNames(result), [
      'claude-cli',
      'clean-working-tree',
      'danger-acknowledged',
      'node-version',
    ]);
  });

  it('every failure carries a fix and is blocking', async () => {
    for (const failure of (await preflight({ nodeVersion: '18.0.0', yes: false })).failures) {
      assert.equal(failure.fix.length > 0, true, `${failure.name} has no fix`);
      assert.equal(failure.blocking, true, `${failure.name} is not blocking`);
    }
  });
});

describe('individual checks', () => {
  it('accepts exactly the minimum node version', () => {
    assert.equal(checkNodeVersion(MINIMUM_NODE).ok, true);
    assert.equal(checkNodeVersion('22.11.9').ok, false);
    assert.equal(checkNodeVersion('24.14.1').ok, true);
  });

  it('treats a repository with no remote as safe', () => {
    const result = checkRemoteIsNotProduction(probeWith({ 'git remote -v': { ok: true, stdout: '' } }));
    assert.equal(result.ok, true);
    assert.equal(result.detail, 'no remote configured');
  });

  it('does not count its own run state, or preflight could never pass twice', () => {
    // The first run scaffolds .meeseeks/config.json. Counting that made every subsequent run
    // fail on the file the previous run had created, so /meeseeks refused after attempt one.
    const result = checkCleanWorkingTree(
      probeWith({ 'git status --porcelain': { ok: true, stdout: '?? .meeseeks/\n' } }),
    );
    assert.equal(result.ok, true);
    assert.equal(result.detail, 'working tree is clean');
  });

  it('ignores every path under .meeseeks/ but nothing else', () => {
    const result = checkCleanWorkingTree(
      probeWith({
        'git status --porcelain': {
          ok: true,
          stdout: '?? .meeseeks/\n M .meeseeks/state.json\n?? .meeseeks/bloopers.log\n M src/app.ts\n',
        },
      }),
    );
    assert.equal(result.ok, false);
    assert.equal(result.detail, '1 uncommitted change(s)');
  });

  it('is not fooled by a path that merely starts with the same letters', () => {
    const result = checkCleanWorkingTree(
      probeWith({ 'git status --porcelain': { ok: true, stdout: '?? .meeseeksdevil/notes.md\n' } }),
    );
    assert.equal(result.ok, false);
  });

  it('counts the uncommitted changes it found', () => {
    const result = checkCleanWorkingTree(
      probeWith({ 'git status --porcelain': { ok: true, stdout: ' M a\n?? b\n M c\n' } }),
    );
    assert.equal(result.ok, false);
    assert.equal(result.detail, '3 uncommitted change(s)');
  });

  it('refuses a repository with no commits, because a reset needs somewhere to go', () => {
    // Otherwise this surfaces mid-run as a refused hard reset, after the builder has
    // already broken something - the worst possible moment to find out.
    const result = checkHasCommits(probeWith({ 'git rev-parse HEAD': { ok: false, stderr: 'unknown revision' } }));
    assert.equal(result.ok, false);
    assert.equal(result.detail, 'the repository has no commits');
    assert.equal(result.fix.includes('initial commit'), true);
  });

  it('accepts a repository that has one', () => {
    assert.equal(checkHasCommits(probeWith()).ok, true);
  });

  it('explains that an unattended run cannot be asked to confirm', () => {
    const result = checkDangerAcknowledged({ yes: false, interactive: false });
    assert.equal(result.ok, false);
    assert.equal(result.fix.includes('--yes'), true);
  });
});

describe('compareVersions', () => {
  const cases = [
    ['22.12.0', '22.12.0', 0],
    ['22.11.0', '22.12.0', -1],
    ['22.12.1', '22.12.0', 1],
    ['v24.14.1', '22.12.0', 1],
    ['23.0.0', '22.12.0', 1],
    // Prerelease metadata is deliberately ignored rather than ordered; see compareVersions.
    ['22.12.0-rc.1', '22.12.0', 0],
    ['9.0.0', '22.12.0', -1],
  ];
  for (const [a, b, expected] of cases) {
    it(`${a} vs ${b} -> ${expected}`, () => {
      assert.equal(Math.sign(compareVersions(String(a), String(b))), expected);
    });
  }
});

describe('formatPreflight', () => {
  it('marks each check and lists the fixes for the failures', async () => {
    const rendered = formatPreflight(await preflight({ yes: false }));
    assert.equal(rendered.includes('ok   node-version:'), true);
    assert.equal(rendered.includes('FAIL danger-acknowledged:'), true);
    assert.equal(rendered.includes('preflight failed. Fix these before starting a run:'), true);
  });

  it('lists no fixes when everything passed', async () => {
    assert.equal(formatPreflight(await preflight()).includes('preflight failed'), false);
  });
});

// Measured on 13 August 2026, and it destroyed a run. `ps` showed three driver processes, two
// of them with the same `cwd`: run 14 had been sent SIGTERM and had not died, and run 15
// launched into the same tree. Two drivers were then mutating one repository, each able to
// `git reset --hard` it and commit over the other. Run 15's result is void.
describe('checkStateNotTracked', () => {
  it('passes when git tracks nothing under .meeseeks', async () => {
    const result = await checkStateNotTracked(probeWith());
    assert.equal(result.ok, true);
  });

  it('blocks when the state directory is tracked, and names the first file', async () => {
    // Measured: a dogfood target with .meeseeks committed ran with a stale config after a
    // git reset --hard silently restored the committed copy. The only visible symptom was the
    // iteration count in the banner. Gitignore cannot help a file that is already tracked.
    const result = await checkStateNotTracked(
      probeWith({ 'git ls-files .meeseeks': { ok: true, stdout: '.meeseeks/config.json\n.meeseeks/state.json\n' } }),
    );
    assert.equal(result.ok, false);
    assert.equal(result.blocking, true);
    assert.equal(result.detail.includes('.meeseeks/config.json'), true, result.detail);
    assert.equal(result.fix.includes('git rm -r --cached'), true, result.fix);
  });

  it('defers to the git-repository check when git cannot answer', async () => {
    // No opinion about a tree git cannot describe: reporting "tracked state" from a failed
    // listing would be inventing a finding.
    const result = await checkStateNotTracked(probeWith({ 'git ls-files .meeseeks': { ok: false, stderr: 'not a repo' } }));
    assert.equal(result.ok, true);
  });
});

describe('checkNoConcurrentRun', () => {
  /** @returns {string} a fresh `.meeseeks` directory */
  function makeMeeseeksDir() {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-preflight-lock-'));
    temporaryDirs.push(dir);
    const meeseeksDir = path.join(dir, '.meeseeks');
    mkdirSync(meeseeksDir, { recursive: true });
    return meeseeksDir;
  }

  it('passes when nothing holds the repository', () => {
    const result = checkNoConcurrentRun(makeMeeseeksDir(), { isAlive: () => true });
    assert.equal(result.ok, true);
    assert.equal(result.detail, 'no other driver holds this repository');
  });

  it('blocks when the recorded driver is still alive, and names its pid', () => {
    const meeseeksDir = makeMeeseeksDir();
    claimRunLock(meeseeksDir, { pid: 4242, startedAt: '2026-08-13T10:00:00.000Z' });
    const result = checkNoConcurrentRun(meeseeksDir, { isAlive: () => true, self: 1 });
    assert.equal(result.ok, false);
    assert.equal(result.blocking, true);
    assert.equal(result.detail.includes('4242'), true, result.detail);
    assert.equal(result.detail.includes('2026-08-13T10:00:00.000Z'), true, result.detail);
  });

  // A pidfile left by a killed driver must not lock the repository forever. `kill -TERM`
  // failed to stop a driver here and `-9` worked, so the killed-driver case is the common one
  // rather than the exotic one.
  it('treats a lock whose process is gone as stale, and lets the run start', () => {
    const meeseeksDir = makeMeeseeksDir();
    claimRunLock(meeseeksDir, { pid: 4242, startedAt: '2026-08-13T10:00:00.000Z' });
    const result = checkNoConcurrentRun(meeseeksDir, { isAlive: () => false, self: 1 });
    assert.equal(result.ok, true);
    assert.equal(result.detail.includes('stale'), true, result.detail);
  });

  it('does not block a process on its own lock', () => {
    const meeseeksDir = makeMeeseeksDir();
    claimRunLock(meeseeksDir, { pid: 99, startedAt: 'x' });
    assert.equal(checkNoConcurrentRun(meeseeksDir, { isAlive: () => true, self: 99 }).ok, true);
  });

  // Nothing defaults to pass, and the direction matters: a lock that will not parse is not
  // evidence that nobody holds one.
  it('blocks on a lock it cannot read, rather than reporting the repository free', () => {
    const meeseeksDir = makeMeeseeksDir();
    writeFileSync(path.join(meeseeksDir, RUN_LOCK_FILE), '{not json', 'utf8');
    const result = checkNoConcurrentRun(meeseeksDir, { isAlive: () => false });
    assert.equal(result.ok, false);
    assert.equal(result.fix.includes(path.join('.meeseeks', RUN_LOCK_FILE)), true, result.fix);
  });
});

// R19. The load-bearing half is the refusal, not the sandbox: the recorded failure mode is an
// agent on a kernel where bubblewrap failed asking to rerun unsandboxed, and a sandbox that can
// be declined by the thing it contains is not a sandbox.
describe('checkSandboxAvailable', () => {
  /** @param {boolean} ok @returns {import('../scripts/preflight.mjs').Probe} */
  const bwrap = (ok) => () => ({ ok, status: ok ? 0 : 127, stdout: ok ? 'bubblewrap 0.8.0' : '', stderr: 'not found' });

  it('passes and says nothing is in force when no sandbox was asked for', () => {
    // A host with no bubblewrap is a perfectly ordinary host for a run that never asked.
    const result = checkSandboxAvailable(bwrap(false), false, 'linux');
    assert.equal(result.ok, true);
    assert.equal(result.detail.includes('not requested'), true, result.detail);
  });

  it('passes on Linux when bubblewrap is there, and names the version it found', () => {
    const result = checkSandboxAvailable(bwrap(true), true, 'linux');
    assert.equal(result.ok, true);
    assert.equal(result.detail.includes('bubblewrap 0.8.0'), true, result.detail);
  });

  // The assertion this whole check exists for.
  it('FAILS the run when a sandbox was asked for and the host cannot provide one', () => {
    const result = checkSandboxAvailable(bwrap(false), true, 'linux');
    assert.equal(result.ok, false);
    assert.equal(result.detail.includes('would run unsandboxed'), true, result.detail);
    assert.equal(result.fix.includes('apt install bubblewrap'), true, result.fix);
  });

  it('accepts macOS without probing, because seatbelt ships with the operating system', () => {
    const probing = () => {
      throw new Error('macOS must not be probed for bubblewrap');
    };
    const result = checkSandboxAvailable(probing, true, 'darwin');
    assert.equal(result.ok, true);
    assert.equal(result.detail.includes('seatbelt'), true, result.detail);
  });

  it('refuses a platform it knows no sandbox for, rather than assuming one', () => {
    // An unknown sandbox is not a sandbox. Nothing here defaults to protected.
    const result = checkSandboxAvailable(bwrap(true), true, 'win32');
    assert.equal(result.ok, false);
    assert.equal(result.detail.includes('win32'), true, result.detail);
  });
});
