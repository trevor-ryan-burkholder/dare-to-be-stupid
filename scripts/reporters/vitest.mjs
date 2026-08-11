/**
 * The vitest JSON reporter (`vitest run --reporter=json`).
 *
 * Shape, as far as this cares: a top-level `numTotalTests` and `testResults`, one entry per
 * file, each holding `assertionResults` with a `title`, an `ancestorTitles` chain and a
 * `status`. Everything else in the report is ignored, deliberately — the fewer fields this
 * depends on, the fewer ways a vitest release can silently break the ratchet.
 *
 * Tested against real committed reporter output in `test/fixtures/`, never against a
 * hand-written approximation of it (CLAUDE.md, DESIGN.md §11).
 */

import { ReportFormatError, makeId, normaliseStatus, toPosixRelative } from './shared.mjs';

/** @typedef {import('./shared.mjs').TestRecord} TestRecord */

/**
 * `todo` and `pending` are tests that never ran, so they collapse onto `skipped`; neither is
 * evidence of anything.
 * @type {Record<string, import('./shared.mjs').TestStatus>}
 */
const VITEST_STATUS = {
  passed: 'passed',
  failed: 'failed',
  skipped: 'skipped',
  pending: 'skipped',
  todo: 'skipped',
};

/**
 * @param {Record<string, unknown>} report
 * @returns {boolean}
 */
function detect(report) {
  return Array.isArray(report.testResults) && typeof report.numTotalTests === 'number';
}

/**
 * @param {Record<string, any>} report
 * @param {string} rootDir
 * @returns {TestRecord[]}
 */
function parse(report, rootDir) {
  /** @type {TestRecord[]} */
  const tests = [];
  for (const file of report.testResults) {
    if (file === null || typeof file !== 'object' || typeof file.name !== 'string') {
      throw new ReportFormatError('vitest testResults entry has no string `name`; cannot build stable ids.');
    }
    const relative = toPosixRelative(rootDir, file.name);
    const assertions = file.assertionResults;
    if (!Array.isArray(assertions)) {
      throw new ReportFormatError(`vitest file entry ${relative} has no \`assertionResults\` array.`);
    }
    for (const assertion of assertions) {
      if (assertion === null || typeof assertion !== 'object' || typeof assertion.title !== 'string') {
        throw new ReportFormatError(`vitest assertion in ${relative} has no string \`title\`.`);
      }
      const ancestors = Array.isArray(assertion.ancestorTitles) ? assertion.ancestorTitles.map(String) : [];
      const id = makeId(relative, [...ancestors, assertion.title], '');
      tests.push({ id, status: normaliseStatus(VITEST_STATUS, assertion.status, 'vitest', id) });
    }
  }
  return tests;
}

/** @type {import('./index.mjs').Reporter} */
export const vitestReporter = { name: 'vitest', detect, parse };
