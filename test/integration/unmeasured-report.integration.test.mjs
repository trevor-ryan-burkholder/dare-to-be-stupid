/**
 * Tier 2 — one report going missing is not a mass regression (PLAN item 95).
 *
 * **The livelock this reproduces, and why `collected === 0` does not cover it.** That guard sees a
 * *whole* collection failure: the report contained no tests, so nothing can be concluded. What it
 * cannot see is one report of several going missing. The other report keeps `collected` comfortably
 * non-zero, so every id the missing one used to bank is absent from `passing` and compares equal to
 * regressed. `driveRun` hard-resets the tree, the verification gate re-runs the same non-producing
 * gate, and it repeats every iteration to the ceiling. Measured before the repair: 30 e2e ids
 * reported as regressions, `src/core.js` returned to its previous content, `repeated regression: …
 * (2 times)`, run burned to `BUDGET`.
 *
 * **Why the runners are counterfeit and that is not a shortcut.** The property under test belongs to
 * the loop: what it concludes when a declared report stops appearing. Reaching that conclusion needs
 * a *passing unit gate* — `saveState` is gated on it — and the real one is `npx vitest`, whose
 * presence would make this test about an installed dependency instead. So `npx` is a script first on
 * `PATH` that writes a real vitest-shaped report and exits zero, and stops writing the e2e one after
 * the first iteration. Everything downstream of that — the toolchain, the gate roster, `gateTree`,
 * `collectReports`, the reporters, the ratchet, the reset — is the real thing.
 *
 * Real git, real node, counterfeit runners. No network, no API call.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { main } from '../../scripts/driver.mjs';

/** @type {string[]} */
const temporaryDirs = [];
const originalPath = process.env.PATH;

after(() => {
  process.env.PATH = originalPath;
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** @param {string} root @param {string[]} args @returns {string} */
const git = (root, args) => execFileSync('git', args, { cwd: root, stdio: 'pipe', encoding: 'utf8' }).trim();

const UNIT_ID = 'test/core.test.js::core > works';
const E2E_ID = 'e2e/flow.spec.ts::flow > works';

/** @param {string} name @param {string} title @returns {string} */
const vitestReport = (name, title) =>
  JSON.stringify({
    numTotalTests: 1,
    testResults: [{ name, assertionResults: [{ ancestorTitles: [title.split(' > ')[0]], title: title.split(' > ')[1], status: 'passed' }] }],
  });

/**
 * A counterfeit `npx` that answers the two runners this toolchain reaches for.
 *
 * `vitest` always writes its report. `playwright` writes one only while a marker file is absent,
 * which is how the second iteration models a gate that ran and produced nothing — a crash, a
 * timeout, a browser that would not start. Both exit zero, because the property under test is what
 * the *loop* concludes from a missing report and not what it concludes from a failing gate.
 *
 * @returns {string} the directory to put first on PATH
 */
function counterfeitRunners() {
  const bin = path.join(mkdtempSync(path.join(os.tmpdir(), 'meeseeks-unmeasured-bin-')), 'bin');
  temporaryDirs.push(path.dirname(bin));
  mkdirSync(bin, { recursive: true });
  writeFileSync(path.join(bin, 'npx'), npxScript({ e2eReport: E2E_PASSING, e2eExit: 0, stopAfterFirst: true }), { mode: 0o755 });
  return bin;
}

/**
 * The counterfeit's body, parameterised by what the e2e runner does on its second call.
 *
 * **Paths are relative to the runner's own working directory, which is the candidate worktree.**
 * Since REVIEW F14 gates run in a snapshot rather than in the repository, so a fixture writing to an
 * absolute path in the main tree writes somewhere nothing will look. The marker lives beside the
 * report in the candidate's ignored `.meeseeks/`, which survives the checkout between iterations —
 * the same property that makes the worktree reusable at all.
 *
 * @param {{ e2eReport: string, e2eExit: number, stopAfterFirst: boolean }} e2e
 * @returns {string}
 */
function npxScript(e2e) {
  return [
    '#!/bin/sh',
    'tool="$1"',
    'if [ "$tool" = "vitest" ]; then',
    '  for arg in "$@"; do',
    '    case "$arg" in --outputFile=*) out="${arg#--outputFile=}";; esac',
    '  done',
    `  [ -n "$out" ] && printf '%s' ${JSON.stringify(vitestReport('test/core.test.js', 'core > works'))} > "$out"`,
    '  exit 0',
    'fi',
    'if [ "$tool" = "playwright" ]; then',
    '  if [ -e .meeseeks/e2e-has-run-once ]; then',
    e2e.stopAfterFirst
      ? '    exit 0'
      : `    printf '%s' ${JSON.stringify(e2e.e2eReport)} > .meeseeks/e2e-report.json
    exit ${e2e.e2eExit}`,
    '  fi',
    `  printf '%s' ${JSON.stringify(vitestReport('e2e/flow.spec.ts', 'flow > works'))} > .meeseeks/e2e-report.json`,
    '  : > .meeseeks/e2e-has-run-once',
    '  exit 0',
    'fi',
    'exit 0',
  ].join('\n');
}

/** The e2e report the neighbour case writes on its second call: the same test, failing. */
const E2E_PASSING = JSON.stringify({
  numTotalTests: 1,
  testResults: [
    { name: 'e2e/flow.spec.ts', assertionResults: [{ ancestorTitles: ['flow'], title: 'works', status: 'failed' }] },
  ],
});

/**
 * A repository whose toolchain declares both reports and whose capability set arms the e2e gate.
 *
 * @returns {string}
 */
function repo() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-unmeasured-'));
  temporaryDirs.push(root);
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'test']);
  writeFileSync(path.join(root, 'PRD.md'), '# Thing\n\n## Requirements\n\nPRD-1.1 It exists.\n');
  writeFileSync(path.join(root, '.gitignore'), '.meeseeks/\nnode_modules/\n');
  // A package.json makes the node toolchain the detected one rather than the provisional default.
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'thing', version: '1.0.0', private: true }));
  // An index.html so `web-ui` is detected and the e2e gate is armed: without it the e2e report is
  // never produced at all and there is no ownership to lose.
  writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>thing</title>\n');
  mkdirSync(path.join(root, 'test'), { recursive: true });
  writeFileSync(path.join(root, 'test', 'core.test.js'), '// the definition the unit report names\n');
  mkdirSync(path.join(root, 'e2e'), { recursive: true });
  writeFileSync(path.join(root, 'e2e', 'flow.spec.ts'), '// the definition the e2e report names\n');
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeFileSync(path.join(root, 'src', 'core.js'), 'export const core = "first";\n');
  mkdirSync(path.join(root, '.meeseeks'), { recursive: true });
  writeFileSync(
    path.join(root, '.meeseeks', 'config.json'),
    JSON.stringify({ maxIterations: 3, tokenCeiling: 100000, costCeiling: 10, qualityPlugins: [] }),
  );
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'base']);
  return root;
}

/** @param {string} root @returns {Promise<{ logs: string[], all: string }>} */
async function run(root) {
  /** @type {string[]} */
  const logs = [];
  await main(['PRD.md', '--yes'], {
    cwd: root,
    env: { ...process.env, MEESEEKS_RUNNING: undefined, MEESEEKS_STYLE: 'plain' },
    log: (/** @type {string} */ line) => logs.push(line),
    spawn: /** @type {any} */ ((/** @type {{ phase: string, cwd: string }} */ options) => {
      if (options.phase === 'builder') {
        // A builder that writes, so a reset would have something visible to throw away.
        writeFileSync(path.join(options.cwd, 'src', 'core.js'), 'export const core = "second";\n');
      }
      const text =
        options.phase === 'design'
          ? 'Designed.\n\n```json\n{"capabilities": ["web-ui", "cli"]}\n```\n'
          : options.phase === 'review'
            ? JSON.stringify({ requirements: [{ id: 'PRD-1.1', status: 'pass', evidence: 'src/core.js:1', detail: 'ok' }] , attackAccount: 'Called the handler directly to bypass the role check, replayed an expired session cookie, and sent a negative quantity to the order endpoint. All three were rejected.' })
            : 'built';
      return { ok: true, text, costUsd: 0, tokens: 0, raw: '{}' };
    }),
  });
  return { logs, all: logs.join('\n') };
}

/** @param {string} root @returns {any} */
const state = (root) => {
  const file = path.join(root, '.meeseeks', 'state.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
};

describe('a report that stopped being produced is not a regression', () => {
  it('banks which report produced each id, holds them when it disappears, and does not reset', async () => {
    const root = repo();
    process.env.PATH = `${counterfeitRunners()}${path.delimiter}${originalPath ?? ''}`;

    const { all } = await run(root);

    // The premise: the runners really did run and the ratchet really did bank both ids from two
    // different reports. Without this the rest proves nothing about attribution.
    const banked = state(root);
    assert.notEqual(banked, null, `the ratchet never advanced:\n${all.slice(-2500)}`);
    assert.equal(banked.passing.includes(UNIT_ID), true, JSON.stringify(banked.passing));
    assert.equal(banked.passing.includes(E2E_ID), true, JSON.stringify(banked.passing));
    assert.equal(banked.reports[E2E_ID], 'e2e-report.json', JSON.stringify(banked.reports));
    assert.equal(banked.reports[UNIT_ID], 'test-report.json', JSON.stringify(banked.reports));

    // The repair: the e2e report stops appearing, and its ids are named as unmeasured rather than
    // counted as regressions.
    assert.equal(
      all.includes('were not measured this attempt'),
      true,
      `the loop never distinguished unmeasured from regressed:\n${all.slice(-2500)}`,
    );
    assert.equal(all.includes(E2E_ID), true, all.slice(-2000));

    // The livelock: no reset, no repeated regression, and the builder's work is still on disk.
    assert.equal(all.includes('repeated regression'), false, all.slice(-2000));
    assert.equal(
      all.split('\n').some((line) => line.startsWith('regression:') || line.includes('no longer pass')),
      false,
      `an unmeasured id was read as a regression:\n${all.slice(-2500)}`,
    );
    assert.equal(readFileSync(path.join(root, 'src', 'core.js'), 'utf8'), 'export const core = "second";\n');
    // And the id it could not measure keeps its protection rather than being dropped.
    assert.equal(state(root).passing.includes(E2E_ID), true);
  });

  it('still resets when the report is produced and the test genuinely goes away', async () => {
    // **The neighbour, and the one that keeps the ratchet a ratchet.** Same repository, same
    // counterfeit runners, except the e2e runner keeps writing a report — and writes one with the
    // test failing. Nothing about the iteration changed but that, and the answer flips.
    const root = repo();
    const bin = path.join(mkdtempSync(path.join(os.tmpdir(), 'meeseeks-unmeasured-bin-')), 'bin');
    temporaryDirs.push(path.dirname(bin));
    mkdirSync(bin, { recursive: true });
    writeFileSync(path.join(bin, 'npx'), npxScript({ e2eReport: E2E_PASSING, e2eExit: 1, stopAfterFirst: false }), {
      mode: 0o755,
    });
    process.env.PATH = `${bin}${path.delimiter}${originalPath ?? ''}`;

    const { all } = await run(root);

    assert.equal(state(root)?.reports?.[E2E_ID], 'e2e-report.json', 'the first iteration never banked the e2e id');
    assert.equal(
      all.includes('were not measured this attempt'),
      false,
      `a produced report was treated as unmeasured:\n${all.slice(-2500)}`,
    );
    assert.equal(all.includes('hard reset: 1 regression(s)'), true, `the genuine regression stopped resetting:\n${all.slice(-2500)}`);
    assert.equal(all.includes(`regression: ${E2E_ID}`), true, all.slice(-2000));
  });
});
