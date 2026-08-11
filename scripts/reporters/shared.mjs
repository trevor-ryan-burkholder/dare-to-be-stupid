/**
 * What every reporter needs and none of them should re-invent (DESIGN.md §11).
 *
 * This file holds the parts of report parsing that are *not* about any one format: the error
 * type, the normalised record shape, and the id construction. A new reporter imports these
 * and supplies only what is genuinely format-specific — which is the whole point of splitting
 * `ratchet.mjs` apart. If a second copy of `makeId` ever appears, two runners will disagree
 * about what a test is called and the ratchet will read a rename as a regression.
 *
 * Nothing here is permitted to guess. §11 names extraction the component most likely to fail
 * *silently*, so an unrecognised anything throws rather than degrading to an empty result.
 */

import path from 'node:path';

/** @typedef {'passed' | 'failed' | 'skipped' | 'flaky'} TestStatus */
/** @typedef {{ id: string, status: TestStatus }} TestRecord */

/** Thrown when a report cannot be understood. Never swallowed, never downgraded. */
export class ReportFormatError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'ReportFormatError';
  }
}

export const ID_SEPARATOR = '::';
export const TITLE_SEPARATOR = ' > ';

/**
 * @param {string} rootDir
 * @param {string} filePath absolute, or relative to `rootDir`
 * @returns {string} posix-separated path relative to `rootDir`
 */
export function toPosixRelative(rootDir, filePath) {
  const absolute = path.resolve(rootDir, filePath);
  return path.relative(rootDir, absolute).split(path.sep).join('/');
}

/**
 * The id shape, chosen to be stable across runs and unique within one:
 *
 *   <repo-relative posix path>::<title path joined by " > ">[::<project>]
 *
 *   test/math.test.js::arithmetic > edge cases > handles zero
 *   tests/checkout.spec.js::cart > totals > sums line items::chromium
 *
 * The project component exists because Playwright runs the same spec once per project, and
 * two entries that differ only by browser are two different results. A runner with no notion
 * of projects passes an empty string and gets the two-part form.
 *
 * @param {string} file
 * @param {string[]} titles
 * @param {string} project empty when the runner has no notion of projects
 * @returns {string}
 */
export function makeId(file, titles, project) {
  const base = `${file}${ID_SEPARATOR}${titles.join(TITLE_SEPARATOR)}`;
  return project === '' ? base : `${base}${ID_SEPARATOR}${project}`;
}

/**
 * Map one runner's status vocabulary onto ours, or refuse.
 *
 * A reporter that grows a new status must be handled deliberately. Mapping an unknown value
 * onto `passed` would admit it to the ratchet; onto `failed` would fire a hard reset on a
 * word nobody has read yet. Throwing is the only answer that does not silently decide.
 *
 * @param {Record<string, TestStatus>} table
 * @param {unknown} status
 * @param {string} runner
 * @param {string} id
 * @returns {TestStatus}
 * @throws {ReportFormatError}
 */
export function normaliseStatus(table, status, runner, id) {
  if (typeof status === 'string' && Object.hasOwn(table, status)) return table[status];
  throw new ReportFormatError(
    `${runner} reported status ${JSON.stringify(status)} for ${id}, which this parser does not know. ` +
      'Refusing to guess whether it passed.',
  );
}
