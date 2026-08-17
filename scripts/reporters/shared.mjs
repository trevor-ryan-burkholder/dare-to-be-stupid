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

import { realpathSync } from 'node:fs';
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
 * Resolved repository roots, so a report with thousands of records costs one `realpath` per root.
 *
 * @type {Map<string, string | null>}
 */
const realRoots = new Map();

/** @param {string} rootDir @returns {string | null} */
function realRoot(rootDir) {
  if (!realRoots.has(rootDir)) {
    try {
      realRoots.set(rootDir, realpathSync(rootDir));
    } catch {
      realRoots.set(rootDir, null);
    }
  }
  return realRoots.get(rootDir) ?? null;
}

/** @param {string} value @returns {boolean} */
function escapes(value) {
  return value === '' || value.startsWith('..') || path.isAbsolute(value);
}

/**
 * A test's file, proved to be inside the repository being judged (REVIEW F20).
 *
 * **This used to resolve and subtract without ever asking whether the answer was inside the tree.**
 * A Vitest-shaped passing result naming `/tmp/outside.test.js` under root `/repo` parsed happily
 * into the ratchet id `../tmp/outside.test.js::suite > works` — durable credit for a test whose
 * defining file is not part of the candidate repository at all, and which a clean clone could never
 * reproduce. The runner is not the enemy here; a misconfigured `include`, a globally installed
 * fixture, or a monorepo path is enough.
 *
 * Containment is checked twice, because one check cannot see what the other can:
 *
 * - **Lexically**, on the resolved path, which catches `..`, an absolute path outside the root, and
 *   a case-variant root on a case-sensitive filesystem. Drive-qualified and UNC prefixes are
 *   refused by shape on every platform, because a report is a document that can have been written
 *   anywhere and a POSIX `path.resolve` would fold `C:\x` into an ordinary filename.
 * - **Through `realpath`**, when the path exists, which is the only way to see a symlink inside the
 *   repository pointing out of it.
 *
 * **A path that does not exist is accepted on the lexical check alone**, and that is a deliberate,
 * stated policy rather than an oversight: runners report virtual and generated files, and a
 * nonexistent path cannot be a symlink escape. What it can never be is *outside* — the identity
 * this returns never begins with `..` and is never absolute.
 *
 * The returned id stays the **lexical** relative path even when `realpath` resolved elsewhere, so
 * adding this check changed no existing id: a plain file resolves to itself, and only a symlinked
 * one would have differed.
 *
 * @param {string} rootDir
 * @param {string} filePath absolute, or relative to `rootDir`
 * @returns {string} posix-separated path relative to `rootDir`
 * @throws {ReportFormatError} when the path does not identify a file inside `rootDir`
 */
export function toPosixRelative(rootDir, filePath) {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    throw new ReportFormatError(`a test result names no file (${JSON.stringify(filePath)}), so it identifies nothing`);
  }
  if (/^[A-Za-z]:[\\/]/.test(filePath)) {
    throw new ReportFormatError(
      `a test result names the drive-qualified path ${JSON.stringify(filePath)}, which is not a file inside the ` +
        'repository being judged',
    );
  }
  if (/^[\\/]{2}/.test(filePath)) {
    throw new ReportFormatError(
      `a test result names the UNC path ${JSON.stringify(filePath)}, which is not a file inside the repository ` +
        'being judged',
    );
  }
  const absolute = path.resolve(rootDir, filePath);
  const relative = path.relative(rootDir, absolute);
  if (escapes(relative)) {
    throw new ReportFormatError(
      `a test result names ${JSON.stringify(filePath)}, which is outside the repository being judged. A test whose ` +
        'defining file is not in the candidate cannot hold ratchet credit, because a clean clone cannot reproduce it',
    );
  }
  /** @type {string} */
  let real;
  try {
    real = realpathSync(absolute);
  } catch {
    // Nonexistent: generated or virtual, and covered by the lexical check above.
    return relative.split(path.sep).join('/');
  }
  const root = realRoot(rootDir);
  if (root === null) {
    throw new ReportFormatError(
      `the repository root ${rootDir} could not be resolved, so no test path can be proved to be inside it`,
    );
  }
  if (escapes(path.relative(root, real))) {
    throw new ReportFormatError(
      `a test result names ${JSON.stringify(filePath)}, which resolves outside the repository being judged`,
    );
  }
  return relative.split(path.sep).join('/');
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
