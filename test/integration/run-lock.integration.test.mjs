/**
 * Tier 2 — the run lock against real concurrency and the real driver (DESIGN.md §3.5, §11.1).
 *
 * **The reason this tier exists, restated by REVIEW F1.** `test/run-lock.test.mjs` proves the
 * decision logic: who is refused, what is reclaimed, who may clear what. Every one of those
 * assertions passed against the *old* lock too, which read the file in one call and overwrote it
 * in another — and could therefore hand one repository to two drivers, depending on scheduling.
 * A single-process test cannot see that, because a single process never interleaves with itself.
 * The only thing that can hold the guarantee is more than one operating-system process arriving
 * at the same directory at the same moment, which is what runs below.
 *
 * The second half drives the real `main` with canned children, because "acquired atomically" is
 * only half of F1: the lock has to be taken *before* the first child is paid for and before any
 * tracked file moves. That is a property of where the call sits in the driver, and it is exactly
 * the property eleven versions of green unit tests missed about the guard hook.
 *
 * No network, no API, no money. Real node processes and real git.
 */

import assert from 'node:assert/strict';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { promisify } from 'node:util';

import { main } from '../../scripts/driver.mjs';
import { RUN_LOCK_FILE, acquireRunLock, readRunLock, releaseRunLock } from '../../scripts/run-lock.mjs';

const execFileAsync = promisify(execFile);

/** @type {string[]} */
const temporaryDirs = [];

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** @param {string} prefix @returns {string} */
function makeTempDir(prefix) {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirs.push(dir);
  return dir;
}

/** The module under test, as an absolute URL a spawned process can import. */
const runLockModule = new URL('../../scripts/run-lock.mjs', import.meta.url).href;

/**
 * A contender: an independent process that waits for a shared moment and then tries to take one
 * directory.
 *
 * The wait is what makes this a race rather than a queue. Spawning is slow and uneven — the first
 * child would otherwise have won and released before the last one had finished starting — so every
 * contender is handed the same wall-clock instant and spins until it arrives.
 */
const contenderSource = `
import { acquireRunLock } from ${JSON.stringify(runLockModule)};
const [dir, startAt] = process.argv.slice(2);
while (Date.now() < Number(startAt)) { /* spin to the shared start */ }
const result = acquireRunLock(dir);
process.stdout.write(JSON.stringify({ ok: result.ok, pid: process.pid, token: result.ok ? result.lock.token : null }));
`;

/** @returns {string} the path to a contender script */
function writeContender() {
  const dir = makeTempDir('meeseeks-run-lock-contender-');
  const file = path.join(dir, 'contender.mjs');
  writeFileSync(file, contenderSource, 'utf8');
  return file;
}

/**
 * Race `count` real processes at one directory and report what each of them said.
 *
 * @param {{ script: string, meeseeksDir: string, count: number }} options
 * @returns {Promise<{ ok: boolean, pid: number, token: string | null }[]>}
 */
async function race(options) {
  // Enough lead time for every child to have reached its spin loop. Too little and the race
  // degenerates into a queue, which would pass for the wrong reason.
  const startAt = Date.now() + 500;
  const running = [];
  for (let index = 0; index < options.count; index += 1) {
    running.push(
      new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [options.script, options.meeseeksDir, String(startAt)], { stdio: 'pipe' });
        let out = '';
        let err = '';
        child.stdout.on('data', (chunk) => {
          out += chunk;
        });
        child.stderr.on('data', (chunk) => {
          err += chunk;
        });
        child.on('error', reject);
        child.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(`contender exited ${code}: ${err}`));
            return;
          }
          resolve(JSON.parse(out));
        });
      }),
    );
  }
  return Promise.all(running);
}

/** @returns {Promise<number>} the pid of a process that has certainly finished */
async function deadPid() {
  const child = spawn(process.execPath, ['-e', '0'], { stdio: 'ignore' });
  const pid = /** @type {number} */ (child.pid);
  await new Promise((resolve) => child.on('close', resolve));
  return pid;
}

describe('two real processes cannot both take one repository', () => {
  it('gives the directory to exactly one contender, over repeated rounds', async () => {
    const script = writeContender();
    // Repeated, because a race that happened to serialize once would be indistinguishable from a
    // lock that works. Six contenders is more than the two the incident produced.
    for (let round = 0; round < 5; round += 1) {
      const meeseeksDir = path.join(makeTempDir('meeseeks-run-lock-race-'), '.meeseeks');
      const results = await race({ script, meeseeksDir, count: 6 });
      const winners = results.filter((result) => result.ok);
      assert.equal(winners.length, 1, `round ${round}: ${winners.length} contenders won one directory`);
      // And the file on disk belongs to that one winner, not to the last writer.
      assert.equal(readRunLock(meeseeksDir)?.token, winners[0].token);
      assert.equal(readRunLock(meeseeksDir)?.pid, winners[0].pid);
    }
  });

  it('gives a stale repository to exactly one reclaimer, over repeated rounds', async () => {
    // The recovery path is the one that reopens the hole if it is written as check-then-write:
    // every contender sees the same dead owner, and every contender is entitled to take over.
    const script = writeContender();
    for (let round = 0; round < 5; round += 1) {
      const meeseeksDir = path.join(makeTempDir('meeseeks-run-lock-stale-'), '.meeseeks');
      mkdirSync(meeseeksDir, { recursive: true });
      const gone = await deadPid();
      writeFileSync(
        path.join(meeseeksDir, RUN_LOCK_FILE),
        JSON.stringify({ pid: gone, startedAt: '2026-08-13T10:00:00.000Z', token: `stale-${round}` }),
        'utf8',
      );
      const results = await race({ script, meeseeksDir, count: 6 });
      const winners = results.filter((result) => result.ok);
      assert.equal(winners.length, 1, `round ${round}: ${winners.length} contenders reclaimed one stale lock`);
      assert.equal(readRunLock(meeseeksDir)?.token, winners[0].token);
    }
  });

  it('leaves a live owner untouched when a real second process is refused', async () => {
    const script = writeContender();
    const meeseeksDir = path.join(makeTempDir('meeseeks-run-lock-live-'), '.meeseeks');
    // Held by this test process, which is unambiguously alive.
    const held = acquireRunLock(meeseeksDir, { pid: process.pid, startedAt: 'a', token: 'the-test-process' });
    assert.equal(held.ok, true);
    const before = readFileSync(path.join(meeseeksDir, RUN_LOCK_FILE), 'utf8');
    const results = await race({ script, meeseeksDir, count: 4 });
    assert.deepStrictEqual(
      results.map((result) => result.ok),
      [false, false, false, false],
    );
    assert.equal(readFileSync(path.join(meeseeksDir, RUN_LOCK_FILE), 'utf8'), before);
  });

  it('does not let a process that never acquired the lock clear somebody else’s', async () => {
    // The other half of the ownership rule, across a real process boundary: a contender that
    // acquired in another process is the owner, and this one holds no token that matches.
    const meeseeksDir = path.join(makeTempDir('meeseeks-run-lock-owner-'), '.meeseeks');
    mkdirSync(meeseeksDir, { recursive: true });
    await execFileAsync(process.execPath, [
      '--input-type=module',
      '-e',
      `import { acquireRunLock } from ${JSON.stringify(runLockModule)};\n` +
        `const r = acquireRunLock(${JSON.stringify(meeseeksDir)});\n` +
        'if (!r.ok) process.exit(3);\n',
    ]);
    const owner = readRunLock(meeseeksDir);
    assert.equal(typeof owner?.token, 'string');
    assert.equal(releaseRunLock(meeseeksDir, 'a token this process invented'), false);
    assert.deepStrictEqual(readRunLock(meeseeksDir), owner);
    // And the real owner's token still works, so refusing everything is not what happened.
    assert.equal(releaseRunLock(meeseeksDir, /** @type {string} */ (owner?.token)), true);
    assert.equal(readRunLock(meeseeksDir), null);
  });
});

/**
 * A repository the driver will accept: one commit, a PRD, ignored run state, and a config that
 * keeps the loop short.
 *
 * @returns {string}
 */
function repoForDriver() {
  const root = makeTempDir('meeseeks-run-lock-driver-');
  const git = (/** @type {string[]} */ args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git(['init', '--quiet']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'test']);
  writeFileSync(path.join(root, 'PRD.md'), '# Thing\n\n## Requirements\n\nPRD-1.1 It exists.\n');
  writeFileSync(path.join(root, '.gitignore'), '.meeseeks/\nnode_modules/\n*.log\n');
  mkdirSync(path.join(root, '.meeseeks'), { recursive: true });
  writeFileSync(
    path.join(root, '.meeseeks', 'config.json'),
    JSON.stringify({ maxIterations: 1, tokenCeiling: 1000, costCeiling: 1 }),
  );
  git(['add', '-A']);
  git(['commit', '--quiet', '-m', 'prd']);
  return root;
}

/** @param {string[]} prompts @returns {any} */
function cannedSpawn(prompts) {
  return (/** @type {{ phase: string, prompt: string }} */ options) => {
    prompts.push(options.phase);
    const text =
      options.phase === 'design' ? 'Designed.\n\n```json\n{"capabilities": ["cli"]}\n```\n' : 'done';
    return { ok: true, text, costUsd: 0, tokens: 0, raw: '{}' };
  };
}

/** @param {string} root @returns {string[]} */
function porcelain(root) {
  return execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter((line) => line !== '');
}

/** @param {string} root @returns {string} */
function head(root) {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
}

describe('the driver takes the repository before it does anything to it', () => {
  it('refuses a second driver before a child is spawned and before a tracked file moves', async () => {
    // F1's second acceptance line. The old driver claimed the lock only after PRD authoring,
    // design authoring, the quality-plugin install and a commit -- so a second launch paid for
    // two children and rewrote the tree before anything noticed.
    const root = repoForDriver();
    const meeseeksDir = path.join(root, '.meeseeks');
    const before = head(root);
    // Held by this test process, which is alive for as long as the assertion takes.
    acquireRunLock(meeseeksDir, { pid: process.pid, startedAt: '2026-08-13T10:00:00.000Z', token: 'the-first-driver' });

    /** @type {string[]} */
    const logs = [];
    /** @type {string[]} */
    const prompts = [];
    const code = await main(['PRD.md', '--yes'], {
      cwd: root,
      env: { ...process.env, MEESEEKS_RUNNING: undefined, MEESEEKS_STYLE: 'plain' },
      log: (/** @type {string} */ line) => logs.push(line),
      spawn: cannedSpawn(prompts),
    });

    const all = logs.join('\n');
    assert.equal(code, 1);
    assert.equal(all.includes(String(process.pid)), true, all.slice(-600));
    assert.equal(all.includes('lock.json'), true, 'the refusal must name the file to delete');
    assert.equal(prompts.length, 0, 'a refused run must spawn no children at all');
    assert.deepStrictEqual(porcelain(root), [], 'a refused run must not touch the working tree');
    assert.equal(head(root), before, 'a refused run must not commit');
    // And it did not take the lock it was refused.
    assert.equal(readRunLock(meeseeksDir)?.token, 'the-first-driver');
  });

  it('reclaims a dead driver’s lock and runs, then gives the repository back', async () => {
    // The benign neighbour, and F1's third acceptance line: refusing every second launch would
    // pass the test above while making a repository unusable after any crash.
    const root = repoForDriver();
    const meeseeksDir = path.join(root, '.meeseeks');
    const gone = await deadPid();
    writeFileSync(
      path.join(meeseeksDir, RUN_LOCK_FILE),
      JSON.stringify({ pid: gone, startedAt: '2026-08-13T10:00:00.000Z', token: 'a-killed-driver' }),
      'utf8',
    );

    /** @type {string[]} */
    const logs = [];
    /** @type {string[]} */
    const prompts = [];
    await main(['PRD.md', '--yes'], {
      cwd: root,
      env: { ...process.env, MEESEEKS_RUNNING: undefined, MEESEEKS_STYLE: 'plain' },
      log: (/** @type {string} */ line) => logs.push(line),
      spawn: cannedSpawn(prompts),
    });

    assert.equal(prompts.length > 0, true, `a reclaimed repository must actually run: ${logs.join('\n').slice(-600)}`);
    // Released by its owner on the way out, so the next run finds the repository free.
    assert.equal(existsSync(path.join(meeseeksDir, RUN_LOCK_FILE)), false, 'the run kept the lock it finished with');
  });

  it('gives the repository back when a pre-loop phase refuses', async () => {
    // `--confirm-prd` returns 0 from the middle of the pre-loop phases, which is downstream of
    // the acquisition and upstream of the loop's own finally. Before this repair that region had
    // no release at all, because the lock was not taken until after it.
    const root = repoForDriver();
    const meeseeksDir = path.join(root, '.meeseeks');
    /** @type {string[]} */
    const prompts = [];
    const code = await main(['PRD.md', '--yes', '--confirm-prd'], {
      cwd: root,
      env: { ...process.env, MEESEEKS_RUNNING: undefined, MEESEEKS_STYLE: 'plain' },
      log: () => {},
      spawn: cannedSpawn(prompts),
    });
    assert.equal(code, 0);
    assert.equal(existsSync(path.join(meeseeksDir, RUN_LOCK_FILE)), false, '--confirm-prd leaked the run lock');
  });
});
