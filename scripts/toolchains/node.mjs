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

import { command } from './shared.mjs';

/** Where the unit runner is told to leave its machine-readable report. */
export const UNIT_REPORT = 'test-report.json';

/** Where the e2e runner's report is looked for. */
export const E2E_REPORT = 'e2e-report.json';

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
