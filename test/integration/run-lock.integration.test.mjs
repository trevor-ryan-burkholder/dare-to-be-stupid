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
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { promisify } from 'node:util';

import { main } from '../../scripts/driver.mjs';
import {
  RUN_LOCK_FILE,
  acquireRunLock,
  claimTakeover,
  readRunLock,
  releaseRunLock,
  takeoverLockPath,
} from '../../scripts/run-lock.mjs';

const execFileAsync = promisify(execFile);

/** @type {string[]} */
const temporaryDirs = [];

/**
 * Long-lived spawned processes, killed on the way out whatever happened.
 *
 * **A failing assertion must not hang the tier.** Several cases here start a process that waits to
 * be killed, and an assertion that fires before the kill leaves it running — which keeps the
 * runner's event loop alive and turns one visible failure into a suite that never finishes. A test
 * that cannot fail *legibly* is barely better than one that cannot fail.
 *
 * @type {import('node:child_process').ChildProcess[]}
 */
const lingering = [];

after(() => {
  for (const child of lingering) child.kill('SIGKILL');
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * @template {import('node:child_process').ChildProcess} T
 * @param {T} child @returns {T}
 */
function tracked(child) {
  lingering.push(child);
  return child;
}

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
 *
 * **A winner also holds the lock until every other contender has decided, and that was missing.**
 * A winner that returned immediately had *exited* by the time the next contender checked liveness,
 * so that contender read a lock whose owner was genuinely dead and reclaimed it — correctly. Two
 * `ok: true` results then described two drivers holding the repository one after another, which is
 * the system working, and the assertion could not tell that apart from the simultaneous double-take
 * REVIEW F1 is actually about. Measured on 18 August 2026 by racing both module versions under CPU
 * load, 40 rounds of 6 contenders each: the pre-0.182.0 module produced **12** multi-winner rounds
 * and the repaired one **2**. So the flake was pre-existing and load-sensitive, an idle machine had
 * been hiding it, and it was measuring something other than the invariant in its own name. Holding
 * the lock across the decision window makes every loser's liveness check land on a process that is
 * still running, which is the question this test exists to ask.
 */
const contenderSource = `
import { acquireRunLock } from ${JSON.stringify(runLockModule)};
const [dir, startAt, holdUntil] = process.argv.slice(2);
while (Date.now() < Number(startAt)) { /* spin to the shared start */ }
const result = acquireRunLock(dir);
// A winner stays alive past the moment every other contender has finished deciding. A loser has
// nothing to hold and exits at once.
if (result.ok) { while (Date.now() < Number(holdUntil)) { /* hold the repository */ } }
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
  // Long enough that every loser has run its liveness check against a winner that is still there.
  // Deciding takes microseconds; this is two orders of magnitude of headroom for a loaded machine.
  const holdUntil = startAt + 1500;
  const running = [];
  for (let index = 0; index < options.count; index += 1) {
    running.push(
      new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [options.script, options.meeseeksDir, String(startAt), String(holdUntil)],
          { stdio: 'pipe' },
        );
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

/**
 * A real process that takes the real takeover claim and then waits to be killed.
 *
 * It calls `claimTakeover` — the function `acquireRunLock` itself calls — so the artifact left on
 * disk is the one production writes, not a fixture's idea of it. Then it hangs, so the parent
 * decides the exact moment of death: after the claim exists and before the stale lock is replaced,
 * which is the window REVIEW F34 is about and the one no unit test can hold open.
 */
const reclaimerSource = `
import { claimTakeover } from ${JSON.stringify(runLockModule)};
const [dir, staleToken] = process.argv.slice(2);
claimTakeover(dir, staleToken, { pid: process.pid, startedAt: new Date().toISOString(), token: 'reclaimer-' + process.pid });
process.stdout.write('claimed\\n');
setInterval(() => {}, 1000);
`;

/**
 * Start a real reclaimer, wait until it genuinely holds the claim, and hand it back still running.
 *
 * @param {string} meeseeksDir @param {string} staleToken
 * @returns {Promise<import('node:child_process').ChildProcess>}
 */
async function startReclaimer(meeseeksDir, staleToken) {
  const dir = makeTempDir('meeseeks-run-lock-reclaimer-');
  const file = path.join(dir, 'reclaimer.mjs');
  writeFileSync(file, reclaimerSource, 'utf8');
  const child = tracked(spawn(process.execPath, [file, meeseeksDir, staleToken], { stdio: ['ignore', 'pipe', 'inherit'] }));
  await new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk) => String(chunk).includes('claimed') && resolve(undefined));
    child.on('close', (code) => reject(new Error(`the reclaimer exited ${code} before claiming`)));
  });
  return child;
}

/** @param {import('node:child_process').ChildProcess} child @returns {Promise<void>} */
async function kill9(child) {
  child.kill('SIGKILL');
  await new Promise((resolve) => child.on('close', resolve));
}

/**
 * A stale lock whose recorded owner is a pid that has genuinely exited.
 *
 * @param {string} token @returns {Promise<string>} the `.meeseeks` directory
 */
async function repositoryWithStaleLock(token) {
  const meeseeksDir = path.join(makeTempDir('meeseeks-run-lock-stale-'), '.meeseeks');
  mkdirSync(meeseeksDir, { recursive: true });
  const owner = await deadPid();
  const installed = acquireRunLock(meeseeksDir, { pid: owner, startedAt: new Date().toISOString(), token });
  assert.equal(installed.ok, true, 'the fixture could not install its own stale lock');
  return meeseeksDir;
}

describe('a reclaimer killed mid-takeover does not brick the repository (REVIEW F34)', () => {
  it('lets a later cohort through, and gives the repository to exactly one of them', async () => {
    // The reproduction, with real processes throughout. Against the unrepaired module every
    // contender here is refused with "another driver is already reclaiming" — forever, because the
    // claim was named from the *stale* token and nothing ever replaced the stale lock. One killed
    // recovery turned a reclaimable lock into a permanent denial of service.
    const meeseeksDir = await repositoryWithStaleLock('dead-owner');
    const reclaimer = await startReclaimer(meeseeksDir, 'dead-owner');
    const claim = takeoverLockPath(meeseeksDir, 'dead-owner');

    // The window is real before it is exploited: the claim exists, the stale lock is untouched.
    assert.equal(existsSync(claim), true, 'the reclaimer never took the claim, so nothing is under test');
    assert.equal(readRunLock(meeseeksDir)?.token, 'dead-owner', 'the reclaimer got further than the window');
    await kill9(reclaimer);
    assert.equal(existsSync(claim), true, 'the claim did not survive the kill, so the fixture proves nothing');

    const results = await race({ script: writeContender(), meeseeksDir, count: 5 });

    const winners = results.filter((entry) => entry.ok);
    assert.equal(winners.length, 1, `expected exactly one winner, got ${winners.length}: ${JSON.stringify(results)}`);
    assert.equal(readRunLock(meeseeksDir)?.token, winners[0].token, 'the lock on disk is not the winner’s');
    assert.equal(readRunLock(meeseeksDir)?.pid, winners[0].pid);
    assert.equal(existsSync(claim), false, 'the abandoned claim outlived the reclaim');
  });

  it('still refuses everybody while that reclaimer is alive, then recovers once it is not', async () => {
    // The benign neighbour, and the one that makes the repair mean something. Sweeping an abandoned
    // claim must not become sweeping a claim: a live reclaimer still serializes every contender, or
    // two of them reclaim one stale lock and F1 is back. The same directory then recovers the
    // instant that process is gone, which is the difference between a lock and a brick.
    const meeseeksDir = await repositoryWithStaleLock('dead-owner');
    const reclaimer = await startReclaimer(meeseeksDir, 'dead-owner');
    const script = writeContender();

    const whileAlive = await race({ script, meeseeksDir, count: 3 });
    assert.deepStrictEqual(
      whileAlive.map((entry) => entry.ok),
      [false, false, false],
      'a contender got past a live reclaimer',
    );
    assert.equal(readRunLock(meeseeksDir)?.token, 'dead-owner', 'the stale lock was touched while a reclaimer held it');

    await kill9(reclaimer);
    const afterDeath = await race({ script, meeseeksDir, count: 3 });
    assert.equal(afterDeath.filter((entry) => entry.ok).length, 1, JSON.stringify(afterDeath));
  });
});

/** The 0.165.0 lock, committed verbatim, as an absolute URL a spawned process can import. */
const legacyRunLockModule = new URL('../fixtures/run-lock/run-lock-0.165.0.mjs', import.meta.url).href;

/**
 * A contender running the **pre-0.182.0** module against the same directory.
 *
 * Identical protocol to `contenderSource` — same shared start instant, same hold across the
 * decision window — so the only difference between the two cohorts is which version of the lock
 * they are executing. That is the point: a plugin installs into a version-keyed cache directory, so
 * an un-updated machine keeps running this code against a repository a current driver also wants.
 */
const legacyContenderSource = `
import { acquireRunLock } from ${JSON.stringify(legacyRunLockModule)};
const [dir, startAt, holdUntil] = process.argv.slice(2);
while (Date.now() < Number(startAt)) { /* spin to the shared start */ }
const result = acquireRunLock(dir);
if (result.ok) { while (Date.now() < Number(holdUntil)) { /* hold the repository */ } }
process.stdout.write(JSON.stringify({ ok: result.ok, pid: process.pid, token: result.ok ? result.lock.token : null }));
`;

/**
 * A process that occupies the legacy takeover claim and then waits to be released.
 *
 * The claim a 0.165.0 driver holds mid-reclaim is an **anonymous directory** — it records nothing
 * about who made it, which is F34 — so the on-disk state a live legacy reclaimer leaves is a
 * directory at that path and nothing else. This creates exactly that, using the same `mkdirSync`
 * step the fixture's own takeover begins with, and then stays alive so the window stays open for as
 * long as the test needs. Nothing about the arrangement is more permissive than the real thing: a
 * real legacy driver in that window is also a live process with an anonymous directory on disk.
 */
const legacyClaimHolderSource = `
import { mkdirSync } from 'node:fs';
import { takeoverLockPath } from ${JSON.stringify(legacyRunLockModule)};
const [dir, staleToken] = process.argv.slice(2);
mkdirSync(takeoverLockPath(dir, staleToken));
process.stdout.write('claimed\\n');
setInterval(() => {}, 1000);
`;

/**
 * A 0.165.0 driver that waits for the window to open, takes its directory claim, and says so.
 *
 * Sequenced through files rather than pipes because both sides are already spawned processes and a
 * file is the only channel that needs no plumbing on either end. `mkdirSync` is the first step of
 * the fixture's own takeover, and the path comes from the fixture's `takeoverLockPath`, so what
 * lands on disk is what a legacy driver puts there rather than the test's idea of it.
 */
const legacyWindowSource = `
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { takeoverLockPath } from ${JSON.stringify(legacyRunLockModule)};
const [dir, staleToken, signals] = process.argv.slice(2);
process.stdout.write('ready\\n');
const deadline = Date.now() + 30000;
while (!existsSync(path.join(signals, 'open')) && Date.now() < deadline) { /* wait for the window */ }
if (Date.now() >= deadline) process.exit(3);
// The removal is not the legacy driver's: a 0.165.0 takeover is one \`mkdirSync\`, which needs the
// path free. It stands for the contender that swept the abandoned claim in between, which is the
// only sequence that puts a legacy directory where a JSON claim was — and is exactly the sequence
// F39 describes. What follows it is the legacy module's own step, at the legacy module's own path.
rmSync(takeoverLockPath(dir, staleToken), { force: true });
mkdirSync(takeoverLockPath(dir, staleToken));
writeFileSync(path.join(signals, 'replaced'), '', 'utf8');
setInterval(() => {}, 1000);
`;

/**
 * A current driver that opens the window at exactly the point the sweep is about to happen.
 *
 * `isAlive` is the seam, and it is the module's own documented one — the options exist for tests.
 * It is consulted with the abandoned claim's pid immediately before the sweep, so signalling from
 * inside it lands the legacy replacement precisely between the read and the rename. Nothing about
 * the module under test is altered; only the moment is chosen.
 */
const windowSweeperSource = `
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { acquireRunLock } from ${JSON.stringify(runLockModule)};
const [dir, abandonedPid, signals] = process.argv.slice(2);
let fired = false;
const result = acquireRunLock(dir, {
  token: 'the-current-version',
  isAlive: (pid) => {
    if (pid === Number(abandonedPid) && !fired) {
      fired = true;
      writeFileSync(path.join(signals, 'open'), '', 'utf8');
      const deadline = Date.now() + 30000;
      while (!existsSync(path.join(signals, 'replaced')) && Date.now() < deadline) { /* hold the window */ }
      return false;
    }
    try { process.kill(pid, 0); return true; } catch { return false; }
  },
});
process.stdout.write(JSON.stringify({ ok: result.ok, fired }));
`;

/** @param {string} source @param {string} prefix @returns {string} the path to the script */
function writeScript(source, prefix) {
  const dir = makeTempDir(prefix);
  const file = path.join(dir, 'contender.mjs');
  writeFileSync(file, source, 'utf8');
  return file;
}

/**
 * Race two cohorts of real processes, running two different versions, at one directory.
 *
 * `race` takes a single script; this takes one per cohort and interleaves them, so neither version
 * gets a systematic head start. Everything else — the shared start instant, the hold across the
 * decision window, the reason both exist — is `race`'s, and the duplication is deliberate rather
 * than a parameter on `race`: making `race` take a list of scripts would complicate the function
 * every other test in this file depends on for the sake of one caller.
 *
 * @param {{ scripts: string[], meeseeksDir: string, each: number }} options
 * @returns {Promise<{ ok: boolean, pid: number, token: string | null, version: string }[]>}
 */
async function raceVersions(options) {
  const startAt = Date.now() + 500;
  const holdUntil = startAt + 1500;
  /** @type {Promise<{ ok: boolean, pid: number, token: string | null, version: string }>[]} */
  const running = [];
  for (let index = 0; index < options.each; index += 1) {
    for (const script of options.scripts) {
      running.push(
        new Promise((resolve, reject) => {
          const child = spawn(process.execPath, [script, options.meeseeksDir, String(startAt), String(holdUntil)], {
            stdio: 'pipe',
          });
          let out = '';
          let err = '';
          child.stdout.on('data', (chunk) => {
            out += chunk;
          });
          child.stderr.on('data', (chunk) => {
            err += chunk;
          });
          child.on('close', (code) => {
            if (code !== 0) {
              reject(new Error(`a contender exited ${code}: ${err}`));
              return;
            }
            resolve({ ...JSON.parse(out), version: script });
          });
        }),
      );
    }
  }
  return Promise.all(running);
}

describe('a mixed-version cohort cannot reclaim one stale lock twice (REVIEW F39)', () => {
  it('gives the repository to exactly one driver, whichever version it is running', async () => {
    // **The acceptance evidence F39 asks for, and the reason it has to be tier 2.** The unit tests
    // arrange the read/rename window with an `isAlive` side effect, which proves the arbitration
    // logic and nothing about two *versions* of that logic meeting. Here both are real processes
    // executing real, differently-versioned code at one directory: three current drivers whose
    // claim is an identity-bearing file, three 0.165.0 drivers whose claim is an anonymous
    // directory, all arriving at the same instant on the same stale lock.
    //
    // Against the unrepaired F39 path a current contender deletes the legacy directory on a failed
    // post-rename read, and both cohorts go on to reclaim — which is F1, reached through the
    // recovery built for F34.
    const meeseeksDir = await repositoryWithStaleLock('dead-owner');
    const results = await raceVersions({
      scripts: [writeContender(), writeScript(legacyContenderSource, 'meeseeks-run-lock-legacy-')],
      meeseeksDir,
      each: 3,
    });

    const winners = results.filter((entry) => entry.ok);
    assert.equal(winners.length, 1, `two drivers reclaimed one stale lock: ${JSON.stringify(results)}`);
    // The lock on disk is the winner's, so "exactly one won" is not merely what the losers reported.
    assert.equal(readRunLock(meeseeksDir)?.token, winners[0].token);
    assert.equal(readRunLock(meeseeksDir)?.pid, winners[0].pid);
  });

  it('loses arbitration when a legacy driver replaces the claim inside its own rename window', async () => {
    // **The window F39 is literally about, held open across two real processes.** A current
    // contender reads an abandoned JSON claim, judges its owner dead, and renames it. Between those
    // two steps a 0.165.0 driver can put its *anonymous takeover directory* at the same path — and
    // `readTakeoverClaim` refuses a directory rather than parsing it, so the post-rename read fails.
    // Treating that failure as "the claim I judged" deletes a live legacy reclaimer's arbitration
    // and puts both drivers on one stale lock, which is F1 arriving through F34's own recovery.
    //
    // The window is microseconds wide, so it is *arranged* rather than waited for: the contender is
    // handed an `isAlive` that, on the abandoned claim's pid, signals a separate legacy process and
    // waits for it. Every actor is still real — the directory is created by the committed 0.165.0
    // module in its own process, the sweep runs in another, and the module under test is untouched.
    // `test/run-lock.test.mjs` arranges the same window in one process; what this adds is that the
    // thing being deleted was written by the other version rather than by the test.
    const meeseeksDir = await repositoryWithStaleLock('dead-owner');
    const claim = takeoverLockPath(meeseeksDir, 'dead-owner');
    const abandonedPid = await deadPid();
    claimTakeover(meeseeksDir, 'dead-owner', { pid: abandonedPid, startedAt: 'a', token: 'the-crashed-reclaimer' });

    const signals = makeTempDir('meeseeks-window-');
    const legacy = tracked(
      spawn(process.execPath, [writeScript(legacyWindowSource, 'meeseeks-legacy-window-'), meeseeksDir, 'dead-owner', signals], {
        stdio: ['ignore', 'pipe', 'inherit'],
      }),
    );
    await new Promise((resolve, reject) => {
      legacy.stdout.on('data', (chunk) => String(chunk).includes('ready') && resolve(undefined));
      legacy.on('close', (code) => reject(new Error(`the legacy driver exited ${code} before it was ready`)));
    });

    const sweeper = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [writeScript(windowSweeperSource, 'meeseeks-sweeper-'), meeseeksDir, String(abandonedPid), signals],
        { stdio: ['ignore', 'pipe', 'inherit'] },
      );
      let out = '';
      child.stdout.on('data', (chunk) => {
        out += chunk;
      });
      child.on('close', (code) => (code === 0 ? resolve(JSON.parse(out)) : reject(new Error(`sweeper exited ${code}`))));
    });

    assert.equal(sweeper.fired, true, 'the window was never reached, so this proves nothing');
    assert.equal(sweeper.ok, false, 'a current driver reclaimed past a legacy claim it had displaced');
    assert.equal(existsSync(claim), true, 'the legacy reclaimer’s claim was deleted by a driver that could not read it');
    assert.equal(lstatSync(claim).isDirectory(), true, 'the legacy claim was replaced rather than restored');
    assert.equal(readRunLock(meeseeksDir)?.token, 'dead-owner', 'the stale lock was taken while a legacy reclaimer held it');
    await kill9(legacy);
  });

  it('leaves a live legacy claim alone when it is there from the start', async () => {
    // The same refusal by the shorter route: a directory found at the *initial* read. This is the
    // ordinary way a current driver meets a legacy one, and it must refuse without going near the
    // sweep at all.
    const meeseeksDir = await repositoryWithStaleLock('dead-owner');
    const claim = takeoverLockPath(meeseeksDir, 'dead-owner');
    const holder = tracked(
      spawn(process.execPath, [writeScript(legacyClaimHolderSource, 'meeseeks-legacy-claim-'), meeseeksDir, 'dead-owner'], {
        stdio: ['ignore', 'pipe', 'inherit'],
      }),
    );
    await new Promise((resolve, reject) => {
      holder.stdout.on('data', (chunk) => String(chunk).includes('claimed') && resolve(undefined));
      holder.on('close', (code) => reject(new Error(`the legacy claim holder exited ${code} before claiming`)));
    });
    assert.equal(existsSync(claim), true, 'the legacy claim was never taken, so nothing is under test');

    const results = await race({ script: writeContender(), meeseeksDir, count: 3 });

    assert.deepStrictEqual(
      results.map((entry) => entry.ok),
      [false, false, false],
      `a current driver reclaimed alongside a live legacy one: ${JSON.stringify(results)}`,
    );
    assert.equal(existsSync(claim), true, 'the legacy reclaimer’s claim was deleted');
    assert.equal(readRunLock(meeseeksDir)?.token, 'dead-owner', 'the stale lock was taken while a legacy reclaimer held it');
    await kill9(holder);
  });

  it('still reclaims a stale lock when no legacy driver is anywhere near it', async () => {
    // The benign neighbour. Refusing every stale lock would satisfy the assertion above and make
    // the lock unusable, which is the failure mode `AGENTS.md` names about blocking everything.
    const meeseeksDir = await repositoryWithStaleLock('dead-owner');
    const results = await race({ script: writeContender(), meeseeksDir, count: 3 });
    assert.equal(results.filter((entry) => entry.ok).length, 1, JSON.stringify(results));
  });
});

describe('a crash in the publication seam leaves the repository recoverable (REVIEW F43)', () => {
  /**
   * The seam is two steps: write a complete record to a private name, then `link` it to the
   * canonical one. A `SIGKILL` between them leaves the **staging file** behind and no canonical
   * lock — which is the whole point of the repair, because the old single `writeFileSync(…, 'wx')`
   * left a zero-length *canonical* file that every later contender refused forever.
   *
   * Reproducing that state exactly is what these cases do. Killing a real process precisely between
   * two adjacent syscalls is not something a test can time, and an env-var pause hook would be
   * production code that exists only for a test. What can be reproduced faithfully is the **state a
   * crash leaves**, which is what every later contender actually sees.
   */

  /** @param {string} meeseeksDir @param {string} token @returns {string} the staging path */
  function stagingFileFor(meeseeksDir, token) {
    return path.join(
      meeseeksDir,
      `${RUN_LOCK_FILE}.staging-${createHash('sha256').update(token).digest('hex').slice(0, 16)}`,
    );
  }

  it('recovers with exactly one winner and no manual deletion', async () => {
    const script = writeContender();
    for (let round = 0; round < 3; round += 1) {
      const meeseeksDir = path.join(makeTempDir('meeseeks-seam-'), '.meeseeks');
      mkdirSync(meeseeksDir, { recursive: true });

      // A contender that died after staging and before linking, complete record and all.
      const orphaned = stagingFileFor(meeseeksDir, 'token-of-a-process-that-died');
      writeFileSync(
        orphaned,
        `${JSON.stringify({ pid: await deadPid(), token: 'token-of-a-process-that-died', startedAt: new Date(0).toISOString() }, null, 2)}\n`,
        'utf8',
      );
      assert.equal(existsSync(path.join(meeseeksDir, RUN_LOCK_FILE)), false, 'the seam left a canonical lock');

      const results = await race({ script, meeseeksDir, count: 6 });
      const winners = results.filter((result) => result.ok);
      assert.equal(winners.length, 1, `round ${round}: ${winners.length} contenders won after a seam crash`);
      assert.equal(readRunLock(meeseeksDir)?.token, winners[0].token);
    }
  });

  it('is not blocked by a live creator staging in the same seam', async () => {
    // The neighbour the finding names. A staging file whose creator is **alive** must also not
    // block, and must not be mistaken for something to clear: it is named for that contender's own
    // token, so nobody else reads it or collides with it. A repair that tried to tidy staging
    // litter belonging to somebody else would delete a live creator's record mid-publication.
    const script = writeContender();
    const meeseeksDir = path.join(makeTempDir('meeseeks-seam-live-'), '.meeseeks');
    mkdirSync(meeseeksDir, { recursive: true });
    const live = stagingFileFor(meeseeksDir, 'token-of-a-living-process');
    writeFileSync(
      live,
      `${JSON.stringify({ pid: process.pid, token: 'token-of-a-living-process', startedAt: new Date().toISOString() }, null, 2)}\n`,
      'utf8',
    );

    const results = await race({ script, meeseeksDir, count: 4 });
    assert.equal(results.filter((result) => result.ok).length, 1);
    // Untouched: the winner published its own record and left the stranger's staging file alone.
    assert.equal(existsSync(live), true, "a contender deleted another creator's staging file");
  });

  // **No "a held lock still refuses" case here, and its absence is deliberate.** A first draft added
  // one on the reasoning that the two cases above would otherwise be satisfied by a lock that let
  // everybody in. They would not: both assert *exactly one* winner out of six and four, and a lock
  // that admitted everybody would produce six and four. The draft was also simply wrong — it raced
  // one contender, which **exits** on success, so its lock is a dead owner's and the stale-recovery
  // path correctly hands the repository on. That property already has a home: 'leaves a live owner
  // untouched when a real second process is refused', above, with a holder that is still running.
  // A redundant case encoding a wrong assumption is worse than no case.
});
