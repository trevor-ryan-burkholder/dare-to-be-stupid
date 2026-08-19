/**
 * Tier 2 — a report path that could not be cleared fails the attempt, driven through the real
 * `main` (REVIEW F32). Needs real `git` and real `node`; no network, no API, no money.
 *
 * **Why this cannot be a tier 1 test.** `collectReports` refusing a stuck attempt is unit-tested,
 * and `reportFreshnessGateResult` is unit-tested, and neither proves the two are *composed* — that
 * `gateTree` records what the clear failed to remove, that the record survives the gap between the
 * gate phase and the effect that reads the reports, and that the resulting failure reaches the
 * roster and the brief. Every tier 1 test of the loop injects `readTestReports`, which is precisely
 * the seam this finding lives behind. That is the shape of the guard defect: correct code that
 * nothing proved was ever called.
 *
 * **How the stuck path is made, and why it is real.** POSIX governs `unlink` by the *parent*
 * directory's write bit, so the reproduction here is a read-only directory standing at a declared
 * report path with a file inside it: `rmSync` can list it and cannot empty it, `clearReports`
 * genuinely reports it as stuck, and `.meeseeks/` itself stays writable so the run proceeds
 * normally in every other respect. `test/reports.test.mjs` owns the other half — a surviving
 * readable regular file full of passing tests — which is the Windows locked-handle shape and cannot
 * be produced inside a live `.meeseeks/` without also locking the state the driver must write.
 *
 * The exit-zero half is not simulated either: an operator gate writes a genuine passing vitest
 * report and exits zero, which before this repair was enough to have its ids read as the attempt's.
 *
 * **Where the hazard lives moved with the subject** (REVIEW F14). Gates now run in a materialized
 * candidate worktree, so the declared report paths are that worktree's and not the main tree's — and
 * the stuck path has to be created there, by something running inside a gate, because nothing else
 * can reach it. The worktree is reused across iterations and `git clean -ffd` leaves ignored paths
 * alone, so a hazard an early iteration plants is still there for the next one's `clearReports`,
 * which is exactly the "the previous attempt left this" shape the finding describes.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { candidateDirFor } from '../../scripts/candidate.mjs';
import { main } from '../../scripts/driver.mjs';

/** @type {string[]} */
const temporaryDirs = [];

/** The candidate worktree this process's runs materialize into (REVIEW F14). */
const CANDIDATE = candidateDirFor(process.pid);

/**
 * Give the stuck path its permissions back and remove the worktree.
 *
 * Called after every run that plants one, not only at the end of the file: the candidate directory
 * is per-process, so a leftover unremovable path would make the *next* case in this file fail for a
 * reason that has nothing to do with what it is testing.
 */
function freeCandidate() {
  try {
    chmodSync(path.join(CANDIDATE, '.meeseeks', 'e2e-report.json'), 0o755);
  } catch {
    // Only the refused case creates it.
  }
  rmSync(CANDIDATE, { recursive: true, force: true });
}

after(() => {
  freeCandidate();
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** A real vitest reporter payload with one passing test, written by a gate that exits zero. */
const SEEDED_REPORT = JSON.stringify({
  numTotalTests: 1,
  testResults: [
    { name: 'src/a.test.js', assertionResults: [{ ancestorTitles: ['a'], title: 'passes', status: 'passed' }] },
  ],
});

/** The id that report yields, and the one that must never be credited to a refused attempt. */
const SEEDED_ID = 'src/a.test.js::a > passes';

/**
 * A repository whose gates include one that writes a passing unit report and exits zero.
 *
 * The toolchain is the provisional node default, so the declared report paths are
 * `.meeseeks/test-report.json` and `.meeseeks/e2e-report.json`. The real toolchain gates all fail
 * against a tree with no project files, which is fine and deliberate: what is under test is whether
 * the *evidence* is admitted, not whether the gates pass.
 *
 * @param {{ stick?: boolean, symlink?: boolean }} [options] `stick` makes `e2e-report.json`
 *   genuinely unremovable; `symlink` makes the seeding gate plant the report behind a symlink
 *   instead of writing it directly, which is the shape the deleted second reader followed
 * @returns {string}
 */
function repoWithSeededReport(options = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-freshness-'));
  temporaryDirs.push(root);
  const git = (/** @type {string[]} */ args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git(['init', '--quiet']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'test']);
  writeFileSync(path.join(root, 'PRD.md'), '# Thing\n\n## Requirements\n\nPRD-1.1 It exists.\n');
  writeFileSync(path.join(root, '.gitignore'), '.meeseeks/\nnode_modules/\n*.log\n');
  mkdirSync(path.join(root, '.meeseeks'), { recursive: true });
  writeFileSync(
    path.join(root, '.meeseeks', 'config.json'),
    JSON.stringify({
      // Three, because the hazard is planted from *inside* a gate and therefore lands one iteration
      // before the clear it defeats: iteration 1 plants, iteration 2's clear fails, iteration 3's
      // brief is where the builder is told which gate explains it.
      maxIterations: options.stick === true ? 3 : 2,
      tokenCeiling: 1000,
      costCeiling: 1,
      extraGates: [
        {
          name: 'seed-report',
          command:
            options.stick === true
              ? [
                  'node',
                  '-e',
                  // **Plants first, seeds after.** On the first iteration it creates a directory
                  // `rmSync` can enter and cannot empty at a declared report path, and writes no
                  // report at all — so nothing is credited before the hazard exists. From the next
                  // iteration on the hazard is already there, `clearReports` fails on it, and *this*
                  // gate then writes a genuine passing report that must never be admitted.
                  'const fs = require("node:fs"), p = require("node:path"); ' +
                    'const stuck = process.argv[2]; ' +
                    'if (fs.existsSync(stuck)) { fs.writeFileSync(process.argv[1], process.argv[3]); ' +
                    'fs.writeFileSync(process.argv[4], fs.readFileSync(process.argv[1], "utf8")); } ' +
                    'else { fs.mkdirSync(stuck, { recursive: true }); ' +
                    'fs.writeFileSync(p.join(stuck, "held-open"), "the previous attempt left this here\\n"); ' +
                    'fs.chmodSync(stuck, 0o555); }',
                  path.join('.meeseeks', 'test-report.json'),
                  path.join('.meeseeks', 'e2e-report.json'),
                  SEEDED_REPORT,
                  // Written back to the main tree by absolute path, because the candidate worktree
                  // this gate runs in is torn down when the run ends — and `git worktree remove`
                  // deletes what it can before it meets the unremovable path, so reading the report
                  // back afterwards is a race this test must not depend on.
                  path.join(root, 'seed-proof.json'),
                ]
              : options.symlink === true
                ? [
                    'node',
                    '-e',
                    // The `rmSync` matters: the real unit gate runs first and vitest writes its
                    // `--outputFile` even when it fails, so the declared path is already occupied by
                    // a regular file by the time this gate replaces it with the link.
                    //
                    // The proof is written to an absolute path in the *main* tree, because the
                    // candidate worktree the gate is running in is deleted when the run ends and a
                    // test that cannot show the link was planted proves nothing about refusing it.
                    'const fs = require("node:fs"); fs.writeFileSync(process.argv[1], process.argv[3]); ' +
                      'fs.rmSync(process.argv[2], { force: true }); ' +
                      'fs.symlinkSync(require("node:path").basename(process.argv[1]), process.argv[2]); ' +
                      'fs.writeFileSync(process.argv[4], JSON.stringify({ ' +
                      'link: fs.lstatSync(process.argv[2]).isSymbolicLink(), ' +
                      'resolves: fs.readFileSync(process.argv[2], "utf8") }));',
                    path.join('.meeseeks', 'elsewhere.json'),
                    path.join('.meeseeks', 'test-report.json'),
                    SEEDED_REPORT,
                    path.join(root, 'symlink-proof.json'),
                  ]
                : [
                    'node',
                    '-e',
                    'require("node:fs").writeFileSync(process.argv[1], process.argv[2]);',
                    path.join('.meeseeks', 'test-report.json'),
                    SEEDED_REPORT,
                  ],
        },
      ],
    }),
  );
  git(['add', '-A']);
  git(['commit', '--quiet', '-m', 'prd']);
  return root;
}

/** @param {string[]} prompts @returns {any} */
function cannedSpawn(prompts) {
  return (/** @type {{ phase: string, prompt: string }} */ options) => {
    prompts.push(`${options.phase} ${options.prompt}`);
    const text =
      options.phase === 'design'
        ? 'Designed.\n\n```json\n{"capabilities": ["cli"]}\n```\n'
        : 'done';
    return { ok: true, text, costUsd: 0, tokens: 0, raw: '{}' };
  };
}

/**
 * @param {string} root
 * @returns {Promise<{ logs: string[], prompts: string[], all: string }>}
 */
async function run(root) {
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
  return { logs, prompts, all: logs.join('\n') };
}

/** @param {string} root @returns {{ seenFailing: string[], baseline: string[] } | null} */
function redEvidence(root) {
  const file = path.join(root, '.meeseeks', 'red-evidence.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

describe('an uncleared report path fails the attempt through the real gateTree', () => {
  it('refuses an exit-zero gate’s report and assigns it no authority at all', async () => {
    const root = repoWithSeededReport({ stick: true });
    const { all, prompts } = await run(root);
    const stuck = path.join(CANDIDATE, '.meeseeks', 'e2e-report.json');
    // The gate that exited zero really did write a real passing report into the subject, which is
    // what makes the absence asserted later a *refusal* rather than a gate that never ran. Proved
    // from the copy the gate itself wrote into the main tree, for the reason recorded beside it.
    const proofFile = path.join(root, 'seed-proof.json');
    const seeded = existsSync(proofFile) ? readFileSync(proofFile, 'utf8') : '';

    // The condition has to be real or the case proves nothing, and root ignores the mode bits.
    // **Failed rather than skipped**, on the same argument that arms the live tier by environment
    // variable and fails without it: a green tick for a case that never ran is a lie the reader
    // takes for coverage. The symlink case below covers the driver-side composition without
    // needing permissions, so a root environment still proves the wiring — it loses only the
    // unremovable-path half. Checked after the run, because the gate that plants it runs inside the
    // candidate and nothing outside the run can reach that directory beforehand.
    assert.equal(existsSync(stuck), true, 'the seeding gate never planted the stuck path');
    try {
      rmSync(stuck, { force: true, recursive: true });
      assert.fail(
        'this process can empty a read-only directory (running as root?), so a stuck report path cannot be ' +
          'created and this case proved nothing. Run tier 2 as an ordinary user.',
      );
    } catch (error) {
      // Good: the path is genuinely unremovable, which is what `clearReports` found. An assertion
      // failure is rethrown rather than swallowed by the catch that expects EACCES.
      if (/** @type {{ code?: string }} */ (error).code === 'ERR_ASSERTION') throw error;
    }
    freeCandidate();

    // 1. The gate exists, ran, and failed by name.
    assert.equal(all.includes('report-freshness'), true, `the gate never reached the roster:\n${all.slice(0, 4000)}`);
    assert.equal(
      all.split('\n').some((line) => line.startsWith('gates failed:') && line.includes('report-freshness')),
      true,
      'the refusal never counted as a gate failure',
    );

    // 2. The stuck path is named, for the operator who is the only one who can free it.
    assert.equal(
      all.includes(`could not clear the previous report at ${path.join('.meeseeks', 'e2e-report.json')}`),
      true,
      'the stuck path was withheld from the operator',
    );
    assert.equal(all.includes('refusing every test report this attempt'), true, all.slice(-2000));

    // 3. **No report-consuming authority was assigned.** The gate that exited zero really did write
    //    a real passing report — assert that first, so the absence below is a refusal rather than a
    //    gate that never ran — and the run recorded nothing derived from it.
    assert.equal(seeded, SEEDED_REPORT, 'the seeding gate did not run, so this proves nothing about refusal');
    // **The seeded id, specifically.** The earlier shape of this assertion demanded no red evidence
    // at all, which was true only while the hazard existed before the first gate run. It is planted
    // from inside a gate now (REVIEW F14), so iteration 1 is an ordinary attempt that produced no
    // report and honestly recorded an empty baseline. What must never happen is that an id from a
    // *refused* report becomes durable evidence, and that is what is asserted.
    const evidence = redEvidence(root) ?? { seenFailing: [], baseline: [] };
    assert.equal(
      evidence.baseline.includes(SEEDED_ID),
      false,
      `a refused attempt's id reached the red-evidence baseline: ${evidence.baseline.join(', ')}`,
    );
    assert.equal(
      evidence.seenFailing.includes(SEEDED_ID),
      false,
      `a refused attempt's id was recorded as observed failing: ${evidence.seenFailing.join(', ')}`,
    );
    // Absent is the ordinary outcome here — the ratchet only writes when it advances, and a refused
    // attempt never does — so both shapes are accepted and only a banked id is refused.
    const stateFile = path.join(root, '.meeseeks', 'state.json');
    assert.deepStrictEqual(
      existsSync(stateFile) ? (JSON.parse(readFileSync(stateFile, 'utf8')).passing ?? []) : [],
      [],
      'the ratchet banked an id from a report this attempt could not prove it produced',
    );

    // 4. The builder is told which gate failed rather than being sent after the runner.
    const secondBrief = prompts.filter((entry) => entry.startsWith('builder ')).at(-1) ?? '';
    assert.notEqual(secondBrief, '', 'no builder brief to inspect');
    assert.equal(
      secondBrief.includes('report-freshness'),
      true,
      `the brief blamed the collection without naming the gate that explains it:\n${secondBrief.slice(-1500)}`,
    );
  });

  it('never lets a symlinked report path reach red evidence, however it got there', {
    skip: process.platform === 'win32',
  }, async () => {
    // **The second reader, deleted.** `gateTree` used to read the declared report paths itself with
    // `existsSync` plus `readFileSync`, which *follows a symlink*, while `readTestReports` refused
    // the same path through `collectReports`'s `lstat`. Two report-consuming authorities over one
    // artifact, disagreeing inside a single attempt, and the one that followed the link was the one
    // that writes red evidence. Found by adversarial review of the F32 repair, not by F32 itself.
    //
    // This case needs no permissions, so it is the driver-side composition proof that survives a
    // root environment, where the unremovable-path case above cannot run.
    const root = repoWithSeededReport({ symlink: true });
    const { all } = await run(root);

    // The gate really did plant the link, or this proves nothing. Read from the proof the gate wrote
    // into the main tree, because the candidate worktree it planted the link in is deleted when the
    // run ends (REVIEW F14) — the observation has to be made from inside the run.
    const proofFile = path.join(root, 'symlink-proof.json');
    assert.equal(existsSync(proofFile), true, 'the seeding gate never ran inside the candidate');
    const proof = JSON.parse(readFileSync(proofFile, 'utf8'));
    assert.equal(proof.link, true, 'the seeding gate did not create the symlink');
    assert.equal(
      proof.resolves,
      SEEDED_REPORT,
      'the link does not resolve to a readable passing report, so nothing was tempted',
    );

    const evidence = redEvidence(root);
    assert.deepStrictEqual(
      evidence === null ? [] : evidence.baseline,
      [],
      'a symlinked report path reached the authority that writes red evidence',
    );
    assert.equal(all.includes('report-freshness'), false, 'a symlink is irregular, not uncleared');
  });

  it('admits the same report when the same paths clear, so the refusal is about the fault only', async () => {
    // The benign neighbour. Identical repository, identical exit-zero gate, nothing stuck: the
    // report is read, the ids reach red evidence, and no freshness failure appears. Refusing
    // everything is not passing.
    const root = repoWithSeededReport();
    const { all } = await run(root);

    assert.equal(all.includes('report-freshness'), false, `the gate fired on a clean attempt:\n${all.slice(0, 3000)}`);
    assert.equal(all.includes('could not clear the previous report'), false, all.slice(0, 2000));
    const evidence = redEvidence(root);
    assert.notEqual(evidence, null, 'no red evidence was recorded from a perfectly ordinary attempt');
    assert.deepStrictEqual(
      /** @type {{ baseline: string[] }} */ (evidence).baseline,
      [SEEDED_ID],
      'the report was collected but its ids never reached the authority that consumes them',
    );
  });
});
