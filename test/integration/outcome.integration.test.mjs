/**
 * Tier 2 — every terminal exit after the run-start boundary leaves one receipt (REVIEW F10).
 *
 * **Why no unit test can hold this.** The writer is unit-tested in `test/outcome.test.mjs`; what
 * F10 actually reported is that it was *never called* on several paid failure paths. The "one door"
 * was one door into `driveRun`, so a PRD child that failed, a design phase that failed, an Oracle
 * that would not parse or a component that aborted printed `ABORTED` and returned with nothing
 * durable written at all. That is a property of where the call sits inside `main`, and every unit
 * test of the loop injects the effects that would exercise it — the same shape as the guard hook,
 * whose logic was correct for eleven versions while nothing proved it was invoked.
 *
 * A parent component correctly fails closed on a missing receipt. Its operator then cannot recover
 * the child's state or its spend from the artifact that promised both, which is the cost.
 *
 * Real git, canned children. No network, no API call.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { main } from '../../scripts/driver.mjs';
import { OUTCOME_FILE } from '../../scripts/outcome.mjs';
import { QUESTION_FILE } from '../../scripts/question.mjs';
import { RUN_ARCHIVE_DIR } from '../../scripts/run-manifest.mjs';

/** @type {string[]} */
const temporaryDirs = [];

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

const PRD = '# Thing\n\n## Requirements\n\nPRD-1.1 It exists.\n';

/** @param {string} root @param {string[]} args @returns {string} */
function git(root, args) {
  return execFileSync('git', args, { cwd: root, stdio: 'pipe', encoding: 'utf8' }).trim();
}

/** @param {Record<string, unknown>} [config] @returns {string} */
function repo(config = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-outcome-int-'));
  temporaryDirs.push(root);
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'test']);
  writeFileSync(path.join(root, 'PRD.md'), PRD);
  writeFileSync(path.join(root, '.gitignore'), '.meeseeks/\nnode_modules/\n*.log\n');
  mkdirSync(path.join(root, '.meeseeks'), { recursive: true });
  writeFileSync(
    path.join(root, '.meeseeks', 'config.json'),
    JSON.stringify({ maxIterations: 1, tokenCeiling: 1000, costCeiling: 1, qualityPlugins: [], ...config }),
  );
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'prd']);
  return root;
}

/**
 * A canned child that answers every phase plausibly, except the one told to fail.
 *
 * @param {{ fail?: string }} [options]
 * @returns {any}
 */
function cannedSpawn(options = {}) {
  return (/** @type {{ phase: string }} */ spawned) => {
    if (spawned.phase === options.fail) {
      return { ok: false, text: '', costUsd: 0.01, tokens: 25, raw: 'the child refused' };
    }
    const text =
      spawned.phase === 'design'
        ? 'Designed.\n\n```json\n{"capabilities": ["cli"]}\n```\n'
        : spawned.phase === 'review'
          ? JSON.stringify({ requirements: [{ id: 'PRD-1.1', status: 'pass', evidence: 'PRD.md:1', detail: 'ok' }] , attackAccount: 'Called the handler directly to bypass the role check, replayed an expired session cookie, and sent a negative quantity to the order endpoint. All three were rejected.' })
          : 'built';
    return { ok: true, text, costUsd: 0, tokens: 0, raw: '{}' };
  };
}

/**
 * @param {string} root @param {string[]} argv @param {any} spawn
 * @returns {Promise<{ code: number, logs: string[] }>}
 */
async function run(root, argv, spawn) {
  /** @type {string[]} */
  const logs = [];
  const code = await main(argv, {
    cwd: root,
    env: { ...process.env, MEESEEKS_RUNNING: undefined, MEESEEKS_STYLE: 'plain' },
    log: (/** @type {string} */ line) => logs.push(line),
    spawn,
  });
  return { code, logs };
}

/** @param {string} root @returns {any} */
function receipt(root) {
  const file = path.join(root, '.meeseeks', OUTCOME_FILE);
  assert.equal(existsSync(file), true, `no ${OUTCOME_FILE}: this run left no durable record of how it ended`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

describe('a run that dies before the loop still files a receipt', () => {
  it('records a failed design phase, with the phase and the spend that was already paid', async () => {
    // The reproduction. Before this the design failure printed ABORTED and returned; `.meeseeks/`
    // held a `run.json` saying what the run was and nothing at all saying how it ended.
    const root = repo();
    const { code } = await run(root, ['PRD.md', '--yes'], cannedSpawn({ fail: 'design' }));

    assert.equal(code, 1);
    const written = receipt(root);
    assert.equal(written.state, 'ABORTED');
    assert.equal(written.phase, 'design');
    assert.equal(written.reason, 'design phase failed');
    assert.equal(written.version, 1);
    assert.equal(typeof written.endedAt, 'string');
    // Spend is what was actually handed to children, not an invented number.
    assert.equal(typeof written.spentTokens, 'number');
    assert.equal(written.spentTokens >= 0, true);
    // And nothing the run never established is claimed.
    assert.equal('iterations' in written, false, 'a pre-loop abort reported an iteration count it never had');
  });

  it('records the deliberate stop of --confirm-prd as a stop rather than a failure', async () => {
    // Not every terminal exit is a failure. A run that stopped where the operator asked it to must
    // leave a receipt that says so, or a parent reading receipts cannot tell it from a crash.
    const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-outcome-confirm-'));
    temporaryDirs.push(root);
    git(root, ['init', '--quiet']);
    git(root, ['config', 'user.email', 'test@example.com']);
    git(root, ['config', 'user.name', 'test']);
    writeFileSync(path.join(root, '.gitignore'), '.meeseeks/\n');
    mkdirSync(path.join(root, '.meeseeks'), { recursive: true });
    writeFileSync(
      path.join(root, '.meeseeks', 'config.json'),
      JSON.stringify({ maxIterations: 1, tokenCeiling: 1000, costCeiling: 1, qualityPlugins: [] }),
    );
    writeFileSync(path.join(root, 'README.md'), '# empty\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '--quiet', '-m', 'no prd']);

    const { code } = await run(root, ['a small cli that prints the time', '--yes', '--confirm-prd'], cannedSpawn());

    const written = receipt(root);
    if (code === 0) {
      assert.equal(written.state, 'STALLED');
      assert.equal(written.phase, 'prd authoring');
      assert.equal(written.reason.includes('--confirm-prd'), true, written.reason);
    } else {
      // The PRD phase can refuse for its own reasons on a canned child; the property under test is
      // that *whatever* happened, it is on disk with a phase attached rather than only in stdout.
      assert.equal(written.state, 'ABORTED');
      assert.equal(typeof written.phase, 'string');
      assert.notEqual(written.phase, '');
    }
  });

  it('lets the loop write the specific answer, and does not let a later path overwrite it', async () => {
    // The at-most-once rule, end to end. A run that reaches the loop gets the loop's terminal state,
    // and every outer path on the way out finds the receipt already filed.
    const root = repo();
    await run(root, ['PRD.md', '--yes'], cannedSpawn());

    const written = receipt(root);
    assert.equal(written.phase, 'loop', 'a pre-loop writer overwrote the loop’s own answer');
    assert.equal(['SHIPPED', 'STALLED', 'BUDGET', 'ABORTED'].includes(written.state), true, written.state);
    // The loop's receipt carries what only the loop knows.
    assert.equal(typeof written.iterations, 'number');
    assert.equal(Array.isArray(written.passing), true);
  });

  it('preserves the previous run’s receipt when this one is refused at the door', async () => {
    // **REVIEW F10, reopened.** Archiving ran *after* the launch check, on the reasoning that a
    // refused launch should disturb nothing — but a refusal now files its own `outcome.json`, so it
    // overwrote the previous run's receipt before anything could preserve it. The ordering was
    // contradictory the moment `releasing` started writing.
    const root = repo();
    await run(root, ['PRD.md', '--yes'], cannedSpawn({ fail: 'design' }));
    const first = receipt(root);
    assert.equal(first.phase, 'design');

    // A launch refusal: a dirty tree is what preflight revalidation exists to catch.
    writeFileSync(path.join(root, 'PRD.md'), '# changed under the run\n');
    await run(root, ['PRD.md', '--yes'], cannedSpawn());

    // Whatever the second run recorded, the first run's receipt is *somewhere*, not gone.
    const archives = path.join(root, '.meeseeks', 'runs');
    assert.equal(existsSync(archives), true, 'nothing was archived');
    const preserved = readdirSync(archives)
      .map((slot) => path.join(archives, slot, OUTCOME_FILE))
      .filter((file) => existsSync(file))
      .map((file) => JSON.parse(readFileSync(file, 'utf8')));
    assert.equal(
      preserved.some((entry) => entry.phase === 'design'),
      true,
      `the earlier receipt was overwritten rather than archived: ${JSON.stringify(preserved)}`,
    );
  });

  it('leaves no temp file behind, so a reader never finds half a receipt', async () => {
    // The atomic write, observed at the end of a real run rather than asserted about the writer.
    const root = repo();
    await run(root, ['PRD.md', '--yes'], cannedSpawn({ fail: 'design' }));
    const leftovers = readdirSync(path.join(root, '.meeseeks')).filter((name) => name.endsWith('.tmp'));
    assert.deepStrictEqual(leftovers, []);
  });

  it('files one receipt per run, replacing the previous run’s rather than accumulating', async () => {
    // Two runs against one repository. The second must leave its own answer, not the first's, and
    // exactly one file — a directory of receipts would make "the terminal state" ambiguous.
    const root = repo();
    await run(root, ['PRD.md', '--yes'], cannedSpawn({ fail: 'design' }));
    assert.equal(receipt(root).phase, 'design');

    await run(root, ['PRD.md', '--yes'], cannedSpawn());
    const second = receipt(root);
    assert.equal(second.phase, 'loop', 'the second run did not replace the first run’s receipt');
    const receipts = readdirSync(path.join(root, '.meeseeks')).filter((name) => name.startsWith(OUTCOME_FILE));
    assert.deepStrictEqual(receipts, [OUTCOME_FILE]);
  });
});

describe('an unexpected throw after the lock is still a run that ended (REVIEW F10, reopened)', () => {
  /**
   * A child transport that dies rather than returning a failure envelope.
   *
   * The distinction is the whole finding. A child that *returns* `ok: false` is a handled failure
   * and always filed a receipt; a child that **throws** — a spawn that cannot allocate, a stream
   * that closes mid-parse, a bug in an option validator — escaped `main` entirely. There is no
   * enumeration of the reasons an `await` in that region can throw, which is why the guard is
   * positional rather than a list of the ones anybody has seen.
   *
   * @param {string} phase @returns {any}
   */
  const throwingSpawn = (phase) => (/** @type {{ phase: string }} */ spawned) => {
    if (spawned.phase === phase) throw new Error('the child transport died');
    return cannedSpawn()(spawned);
  };

  it('files an ABORTED receipt naming the failure, rather than escaping with nothing', async () => {
    const root = repo();
    const { code } = await run(root, ['PRD.md', '--yes'], throwingSpawn('design'));

    assert.equal(code, 1);
    const written = receipt(root);
    assert.equal(written.state, 'ABORTED');
    assert.equal(written.phase, 'pre-loop');
    assert.equal(written.reason, 'Error: the child transport died');
    assert.equal(written.version, 1);
    // The spend already paid is recorded, and an iteration count the run never reached is not.
    assert.equal(typeof written.spentTokens, 'number');
    assert.equal('iterations' in written, false);
  });

  it('gives the repository back, so the next run is not refused by a dead process', async () => {
    // The other half, and the one an operator feels first. A lock left by a crashed driver names a
    // pid that is gone, so the next run can reclaim it — but reclaiming is the recovery path, not
    // the ordinary one, and a driver that exits normally must not leave work for it.
    const root = repo();
    await run(root, ['PRD.md', '--yes'], throwingSpawn('design'));

    assert.equal(existsSync(path.join(root, '.meeseeks', 'lock.json')), false, 'the crashed run kept the repository');
  });

  it('does not relabel a handled failure that already knew its own phase', async () => {
    // The neighbour. A backstop that swallowed ordinary refusals would replace six specific phases
    // with one useless word, and every receipt would say the run crashed somewhere.
    const root = repo();
    await run(root, ['PRD.md', '--yes'], cannedSpawn({ fail: 'design' }));

    const written = receipt(root);
    assert.equal(written.phase, 'design');
    assert.equal(written.reason, 'design phase failed');
  });

  it('lets a crash before the lock escape, because no run had started', async () => {
    // The bound on the guard. Before the lock nothing owns the repository, so there is no run to
    // file a receipt for and writing one would claim a run that never began. A non-array argv
    // throws on the first line of the entry point, which is as early as a crash can be.
    //
    // Worth stating because the first attempt at this case was wrong: a logger that throws does
    // *not* crash before the lock, because nothing writes a line until after acquisition. It
    // exercised the guard while claiming to bound it.
    const root = repo();
    await assert.rejects(
      () =>
        main(/** @type {any} */ (null), {
          cwd: root,
          env: { ...process.env, MEESEEKS_RUNNING: undefined, MEESEEKS_STYLE: 'plain' },
          log: () => {},
          spawn: cannedSpawn(),
        }),
      TypeError,
    );
    assert.equal(
      existsSync(path.join(root, '.meeseeks', OUTCOME_FILE)),
      false,
      'a receipt was filed for a run that never started',
    );
  });

  it('files the receipt even when the logger is the thing that broke', async () => {
    // A crash *after* the lock whose cause is the reporting channel itself. The durable record is
    // the half that survives the process, so it must not depend on stdout still working — the
    // handler reports and writes separately for exactly this case.
    const root = repo();
    let lines = 0;
    const code = await main(['PRD.md', '--yes'], {
      cwd: root,
      env: { ...process.env, MEESEEKS_RUNNING: undefined, MEESEEKS_STYLE: 'plain' },
      log: () => {
        lines += 1;
        throw new Error('the terminal went away');
      },
      spawn: cannedSpawn(),
    });

    assert.equal(lines > 0, true, 'nothing was ever logged, so the logger was not the failure');
    assert.equal(code, 1);
    const written = receipt(root);
    assert.equal(written.state, 'ABORTED');
    assert.equal(written.reason, 'Error: the terminal went away');
  });
});

describe('an archive refusal does not destroy the receipt it refused to preserve (REVIEW F10, reopened)', () => {
  // **Codex's reproduction, driven through the real `main`.** A prior `SHIPPED` marker, a
  // `.meeseeks/runs` that is a regular file so `archivePreviousRun` cannot work, and the run's
  // `ABORTED` receipt landed on top of the `SHIPPED` one. The refusal exists to keep that record and
  // the very next line destroyed it.

  /** @param {string} root @param {string} state */
  function priorRun(root, state) {
    writeFileSync(
      path.join(root, '.meeseeks', OUTCOME_FILE),
      JSON.stringify({ version: 1, endedAt: '2026-08-18T00:00:00.000Z', state, reason: 'the previous run', phase: 'loop' }),
    );
  }

  /** @param {string} root @returns {string[]} */
  const preserved = (root) =>
    readdirSync(path.join(root, '.meeseeks')).filter((name) => name.startsWith(`${OUTCOME_FILE}.unarchived-`));

  it('keeps the previous SHIPPED receipt when the archive cannot run', async () => {
    const root = repo();
    priorRun(root, 'SHIPPED');
    // A regular file where the archive directory must be: `mkdirSync` fails with ENOTDIR, which is
    // an ordinary disk-shape fault rather than anything simulated.
    writeFileSync(path.join(root, '.meeseeks', RUN_ARCHIVE_DIR), 'not a directory\n');

    const { code, logs } = await run(root, ['PRD.md', '--yes'], cannedSpawn());
    const all = logs.join('\n');

    assert.equal(code, 1, all.slice(-600));
    assert.equal(all.includes('could not be archived'), true, all.slice(-900));

    // This run's answer is at the canonical path...
    const written = receipt(root);
    assert.equal(written.state, 'ABORTED');
    assert.equal(written.reason, 'the previous run could not be archived');

    // ...and the previous run's is still on disk, under a name an operator can find.
    const kept = preserved(root);
    assert.equal(kept.length, 1, `the SHIPPED receipt was destroyed: ${readdirSync(path.join(root, '.meeseeks')).join(', ')}`);
    const older = JSON.parse(readFileSync(path.join(root, '.meeseeks', kept[0]), 'utf8'));
    assert.equal(older.state, 'SHIPPED');
    assert.equal(older.reason, 'the previous run');
    assert.equal(all.includes('rather than overwritten'), true, all.slice(-900));
  });

  it('archives normally and preserves nothing when the directory is usable', async () => {
    // The neighbour. An ordinary second run moves the previous receipt into `runs/`, which is the
    // record archiving exists to keep — and must not also leave a second copy beside it.
    const root = repo();
    priorRun(root, 'SHIPPED');

    const { logs } = await run(root, ['PRD.md', '--yes'], cannedSpawn());

    assert.equal(logs.join('\n').includes('archived the previous run to'), true, logs.join('\n').slice(-600));
    assert.deepStrictEqual(preserved(root), []);
    const archived = readdirSync(path.join(root, '.meeseeks', RUN_ARCHIVE_DIR));
    assert.equal(archived.length >= 1, true, archived.join(', '));
    assert.equal(
      JSON.parse(readFileSync(path.join(root, '.meeseeks', RUN_ARCHIVE_DIR, archived[0], OUTCOME_FILE), 'utf8')).state,
      'SHIPPED',
    );
  });
});

describe('a non-shipped ending leaves a question, not only a diagnosis (PLAN item 50)', () => {
  /** @param {string} root @returns {any | null} */
  const question = (root) => {
    const file = path.join(root, '.meeseeks', QUESTION_FILE);
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  };

  it('writes an answerable question beside the receipt when a run dies before the loop', async () => {
    // The gap this closes: the receipt already said ABORTED and named the phase. What it could not
    // say is what the operator should now change, which is the only thing that makes a re-run
    // different from the run that just failed.
    const root = repo();
    await run(root, ['PRD.md', '--yes'], cannedSpawn({ fail: 'design' }));
    const asked = question(root);
    assert.notEqual(asked, null, 'a failed run left no question, so the operator has a diagnosis and no decision');
    assert.equal(asked.state, 'ABORTED');
    // Cited, or it would have been discarded. A crash knows the phase and nothing finer, and saying
    // so is honest rather than inventing a requirement id it never established.
    assert.equal(asked.citations.length > 0, true);
    // An option list is answerable; a paragraph is not.
    assert.equal(Array.isArray(asked.options) && asked.options.length > 0, true);
  });

  it('says in the run output where the answer goes, because an answer at a prompt evaporates', async () => {
    const root = repo();
    const { logs } = await run(root, ['PRD.md', '--yes'], cannedSpawn({ fail: 'design' }));
    assert.match(logs.join('\n'), /Answer by editing PRD\.md, DOD\.md or the config and re-running/);
  });

  it('never waits: the run still returns a terminal code with the question written', async () => {
    // The property the whole design turns on. A question is an output of a terminal state, never a
    // pause inside one — a run holding at three in the morning is strictly worse than ABORTED.
    const root = repo();
    const { code } = await run(root, ['PRD.md', '--yes'], cannedSpawn({ fail: 'design' }));
    assert.equal(code, 1);
    assert.notEqual(question(root), null);
  });
});
