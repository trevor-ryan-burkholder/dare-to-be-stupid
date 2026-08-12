/**
 * The Node toolchain — npm scripts, vitest, Playwright, `npm audit`.
 *
 * Every command here was lifted unchanged from `commandGates` in `driver.mjs`, and that is
 * deliberate: extracting an interface is only safe if the first implementation through it
 * behaves identically to what it replaced. If any argv below has drifted, the extraction
 * broke something, and the test asserting the exact six commands will say so.
 *
 * The one thing that is *not* a straight lift is the CI patterns, and it is a correction the
 * plan called for. `CI_REQUIRED_COMMANDS` used to accept `node --test` and `jest` for the unit
 * step while the unit *gate* ran `npx vitest run --reporter=json`. Those disagree, and the
 * disagreement is not academic: both live runs on 10 August 2026 built correct `node:test`
 * suites, declared `"test": "node --test"`, and drew "No test suite found" from the gate — a
 * report of zero tests — while a CI workflow doing the same thing would have been waved
 * through. A workflow now has to name the runner the gate actually collects.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { command, notApplicable } from './shared.mjs';

/** Where the unit runner is told to leave its machine-readable report. */
export const UNIT_REPORT = 'test-report.json';

/** Where the e2e runner's report is looked for. */
export const E2E_REPORT = 'e2e-report.json';

/**
 * The mutation runner's configuration, written by the driver into `.dare/` and therefore
 * beyond the builder's reach (§6).
 *
 * This file is not a convenience. Stryker exposes no `--thresholds.*` flag — verified against
 * `stryker run --help` at 9.6.1, which exposes `--dashboard.*` but nothing for thresholds — and
 * `thresholds.break` defaults to `null`, meaning **surviving mutants exit 0**. Measured: a
 * fixture with two survivors exited 0 with no config, and exited 1 with this one. So the
 * failure condition of the gate lives in a file, and if that file were the project's then the
 * builder would own whether the gate can fail at all — which is the defect that deferred the
 * held-out oracle. Passing a driver-owned config positionally to `stryker run` is what keeps
 * the threshold out of the builder's hands.
 */
export const MUTATION_CONFIG = 'stryker.config.json';

/**
 * Its contents.
 *
 * **This was `break: 100`, and the reasoning for it was good and still lost to a measurement.**
 * The argument was that the gate's question is "did any mutant on the changed code survive", not
 * "is the score good enough", because a percentage is a threshold that can drift and §13 rejects
 * drifting thresholds by name.
 *
 * What refuted it: the first time this gate ever actually ran — it could not run at all until the
 * runner-resolution fix, so `100` had never been tested against anything — a module consisting of
 * one two-branch function with two tests that genuinely exercise both branches scored **83.33**
 * and failed. The survivor was an `EqualityOperator` mutation, `a < 0` → `a <= 0`, which a correct
 * suite need not kill and which says nothing about whether the tests prove anything.
 *
 * So `100` was not a strict gate, it was an **unsatisfiable** one — the defect class that has cost
 * this project more than any other, and the reason three separate gates blocked dogfood run 3. A
 * gate no correct repository can pass does not enforce quality; it stops the loop and teaches the
 * builder to delete tests.
 *
 * `60` is a floor, chosen to catch the failure this gate exists for — a suite insensitive to its
 * own code — while tolerating the survivors that ordinary correct code produces. `high`/`low` only
 * colour the report. The drift objection is answered by ownership rather than by the number: this
 * file is written by the driver into `.dare/`, so the builder cannot negotiate it, and moving it
 * takes a commit here with a measurement attached. **If you change it, record what you measured.**
 */
export const MUTATION_CONFIG_CONTENTS = { thresholds: { high: 80, low: 60, break: 60 } };

/** Files worth mutating: first-party source, never the tests that would be mutated into lies. */
const MUTABLE_RE = /\.[cm]?[jt]sx?$/;
const TEST_LIKE_RE = /(^|\/)(?:__tests__|test|tests|spec|e2e)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/;

/** @type {import('./index.mjs').Toolchain} */
export const nodeToolchain = {
  name: 'node',

  /**
   * @param {string} root
   * @returns {string | null}
   */
  detect(root) {
    return existsSync(path.join(root, 'package.json')) ? 'file package.json' : null;
  },

  operations: {
    // Not wired into the gates, and that is a decision rather than an omission. `npm ci`
    // deletes `node_modules` and reinstalls from the lockfile; running it before every
    // iteration would add minutes to each one and would change behaviour, which this
    // extraction is not allowed to do. The slot exists because a toolchain that cannot
    // express "restore dependencies" cannot describe .NET or Rust at all.
    restore: () => command(['npm', 'ci']),
    build: () => command(['npm', 'run', 'build']),
    lint: () => command(['npm', 'run', 'lint']),
    types: () => command(['npm', 'run', 'typecheck']),
    /** @param {{ dareDir: string }} context */
    unit: ({ dareDir }) =>
      command(['npx', 'vitest', 'run', '--reporter=json', `--outputFile=${path.join(dareDir, UNIT_REPORT)}`]),
    e2e: () => command(['npx', 'playwright', 'test']),
    'security-audit': () => command(['npm', 'audit', '--audit-level=high']),

    // Every element of this argv has been executed against Stryker 9.6.1 rather than read
    // from documentation, which is the rule HANDOFF.md's argv defect bought: the flags are
    // `run <configFile>`, `--testRunner`, `--mutate` (comma separated, verified with two
    // files), `--reporters` and `--logLevel`.
    /** @param {{ dareDir: string, changedFiles?: string[] }} context */
    mutation: ({ dareDir, changedFiles }) => {
      const mutable = (changedFiles ?? []).filter((file) => MUTABLE_RE.test(file) && !TEST_LIKE_RE.test(file));
      if (mutable.length === 0) {
        // Not a pass and not a skip of the gate — a statement that this iteration changed no
        // mutable source. Mutating an empty set would exit 0 and read exactly like a run in
        // which every mutant died.
        return notApplicable(
          'no first-party source changed since the last ratchet-advancing commit, so there is nothing to mutate',
        );
      }
      // `-p` twice, and both are load-bearing. Stryker resolves test-runner plugins relative
      // to its **own** installation, and `npx --yes @stryker-mutator/core` puts that
      // installation in npm's npx cache, where the project's `@stryker-mutator/vitest-runner`
      // is invisible — even when the project has it in `node_modules`, as dogfood run 3's did.
      // The result was `Cannot find TestRunner plugin "vitest". In fact, no TestRunner plugins
      // were loaded`, an uncaught StrykerError, and a gate that **no project could ever pass**:
      // the runner is never installed because this loop provisions through npx, and installing
      // it locally does not help because that is not where Stryker looks. It ended run 3 twice.
      //
      // Naming both packages puts the plugin in the same sandbox as the core that looks for it.
      // Measured against Stryker 9.6.x on a project with vitest and no Stryker at all: the
      // plugin loads, mutants run (5 killed, 1 survived), the runner finds the *project's*
      // vitest, and the driver-owned threshold still forces the failing exit code.
      return command([
        'npx',
        '--yes',
        '-p',
        '@stryker-mutator/core',
        '-p',
        '@stryker-mutator/vitest-runner',
        'stryker',
        'run',
        path.join(dareDir, MUTATION_CONFIG),
        '--testRunner',
        'vitest',
        '--mutate',
        mutable.join(','),
        '--reporters',
        'clear-text',
        '--logLevel',
        'error',
      ]);
    },
  },

  /**
   * The command that starts this application, or null when it declares none.
   *
   * @param {string} root
   * @returns {string | null}
   */
  startCommand(root) {
    const manifest = path.join(root, 'package.json');
    if (!existsSync(manifest)) return null;
    try {
      const scripts = JSON.parse(readFileSync(manifest, 'utf8')).scripts ?? {};
      return typeof scripts.start === 'string' && scripts.start.trim() !== '' ? 'npm start' : null;
    } catch {
      return null;
    }
  },

  // The files the test operations above write, relative to `.dare`. The driver reads exactly
  // these; nothing here is inferred from a filename convention.
  reports: [UNIT_REPORT, E2E_REPORT],

  // Which operations a CI workflow must be seen to run, and how to recognise each one.
  //
  // Matching is regex over the workflow's text rather than a parsed document, because parsing
  // YAML would mean a runtime dependency and the question is narrow enough to answer without
  // one: does any step invoke this class of command. A workflow that calls a script which
  // calls the real command reads as missing, which errs toward failing a gate — the correct
  // direction.
  //
  // `unit` and `e2e` name their runners. Accepting `npm test` here would re-open the exact
  // hole described at the top of this file, because `"test"` can be wired to anything.
  ci: [
    { operation: 'build', pattern: /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?build\b/ },
    { operation: 'lint', pattern: /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?lint\b|\beslint\b/ },
    { operation: 'types', pattern: /\btypecheck\b|\btype-check\b|\btsc\b/ },
    { operation: 'unit', pattern: /\bvitest\b/ },
    { operation: 'e2e', pattern: /\bplaywright\b/ },
  ],
};
