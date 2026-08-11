/**
 * The Playwright JSON reporter.
 *
 * Two things make this format different from vitest's, and both are load-bearing.
 *
 * Suites nest. Playwright emits one suite per file and then one per `describe`, so the title
 * path has to be collected on the way down. The file-level suite's title is the path rather
 * than a test name, which is why it is excluded from the titles.
 *
 * The same spec runs once per project. Two entries that differ only by browser are two
 * different results, so `projectName` becomes the third component of the id. Collapsing them
 * would let a test passing on chromium mask the same test failing on webkit.
 *
 * `flaky` is carried through as its own status rather than mapped onto `passed`. A test that
 * failed and then passed on retry has not proven anything, and the ratchet's caller is where
 * that policy belongs.
 *
 * Tested against real committed reporter output in `test/fixtures/` (CLAUDE.md, DESIGN.md §11).
 */

import path from 'node:path';

import { ReportFormatError, makeId, normaliseStatus, toPosixRelative } from './shared.mjs';

/** @typedef {import('./shared.mjs').TestRecord} TestRecord */

/**
 * Playwright's `tests[].status`, which describes the whole test including retries.
 * @type {Record<string, import('./shared.mjs').TestStatus>}
 */
const PLAYWRIGHT_STATUS = {
  expected: 'passed',
  unexpected: 'failed',
  flaky: 'flaky',
  skipped: 'skipped',
};

/**
 * @param {Record<string, unknown>} report
 * @returns {boolean}
 */
function detect(report) {
  const config = report.config;
  return (
    Array.isArray(report.suites) &&
    config !== null &&
    typeof config === 'object' &&
    typeof (/** @type {Record<string, unknown>} */ (config).rootDir) === 'string'
  );
}

/**
 * @param {Record<string, any>} suite
 * @param {string[]} titles
 * @param {{ spec: Record<string, any>, titles: string[] }[]} out
 */
function collectSpecs(suite, titles, out) {
  for (const spec of suite.specs ?? []) out.push({ spec, titles });
  for (const child of suite.suites ?? []) collectSpecs(child, [...titles, String(child.title ?? '')], out);
}

/**
 * @param {Record<string, any>} report
 * @param {string} rootDir
 * @returns {TestRecord[]}
 */
function parse(report, rootDir) {
  const configRoot = report.config.rootDir;
  /** @type {{ spec: Record<string, any>, titles: string[] }[]} */
  const collected = [];
  for (const fileSuite of report.suites) {
    if (fileSuite === null || typeof fileSuite !== 'object') {
      throw new ReportFormatError('playwright suites entry is not an object.');
    }
    collectSpecs(fileSuite, [], collected);
  }

  /** @type {TestRecord[]} */
  const tests = [];
  for (const { spec, titles } of collected) {
    if (typeof spec.file !== 'string' || typeof spec.title !== 'string') {
      throw new ReportFormatError('playwright spec is missing a string `file` or `title`.');
    }
    const relative = toPosixRelative(rootDir, path.resolve(configRoot, spec.file));
    const specTests = spec.tests;
    if (!Array.isArray(specTests)) {
      throw new ReportFormatError(`playwright spec ${relative} has no \`tests\` array.`);
    }
    for (const test of specTests) {
      const project = typeof test?.projectName === 'string' ? test.projectName : '';
      const id = makeId(relative, [...titles, spec.title], project);
      tests.push({ id, status: normaliseStatus(PLAYWRIGHT_STATUS, test?.status, 'playwright', id) });
    }
  }
  return tests;
}

/** @type {import('./index.mjs').Reporter} */
export const playwrightReporter = { name: 'playwright', detect, parse };
