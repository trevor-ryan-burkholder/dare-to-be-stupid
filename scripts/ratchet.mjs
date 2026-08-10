/**
 * Test-ID extraction for the ratchet.
 *
 * DESIGN.md §11 names this the component most likely to fail *silently*: if a reporter
 * format shifts, extraction quietly yields fewer IDs and the ratchet stops protecting
 * anything while still reporting success. Every decision below is made in that light.
 *
 *   - An unrecognised report shape throws {@link ReportFormatError}. It does not return an
 *     empty set. Callers must treat a throw as a failed gate (CLAUDE.md: nothing defaults
 *     to pass).
 *   - An unknown per-test status throws, naming the value. A reporter that grows a new
 *     status must be handled deliberately, not silently dropped.
 *   - When one ID appears more than once, the worst status wins. A duplicate test name
 *     must never let a passing entry mask a failing one.
 *   - A report that parses cleanly but contains zero tests returns an empty set rather
 *     than throwing — "no test files" is a real state. The ratchet (slice 3) is
 *     responsible for refusing to advance on an empty set; see DESIGN.md §11.
 *
 * ID shape, chosen to be stable across runs and unique within one:
 *
 *   <repo-relative posix path>::<title path joined by " > ">[::<project>]
 *
 *   test/math.test.js::arithmetic > edge cases > handles zero
 *   tests/checkout.spec.js::cart > totals > sums line items::chromium
 *
 * The project component exists because Playwright runs the same spec once per project,
 * and two entries that differ only by browser are two different results.
 */

import path from 'node:path';

/** @typedef {'passed' | 'failed' | 'skipped' | 'flaky'} TestStatus */
/** @typedef {{ id: string, status: TestStatus }} TestRecord */
/** @typedef {'vitest' | 'playwright'} Runner */
/** @typedef {{ runner: Runner, tests: TestRecord[] }} ParsedReport */

/** Thrown when a report cannot be understood. Never swallowed, never downgraded. */
export class ReportFormatError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'ReportFormatError';
  }
}

const ID_SEPARATOR = '::';
const TITLE_SEPARATOR = ' > ';

/**
 * Worst-first. Used to collapse duplicate IDs and to keep a failure visible.
 * @type {TestStatus[]}
 */
const SEVERITY = ['failed', 'flaky', 'skipped', 'passed'];

/**
 * vitest's `assertionResults[].status`. `todo` and `pending` are tests that never ran, so
 * they collapse onto `skipped`; neither is evidence of anything.
 * @type {Record<string, TestStatus>}
 */
const VITEST_STATUS = {
  passed: 'passed',
  failed: 'failed',
  skipped: 'skipped',
  pending: 'skipped',
  todo: 'skipped',
};

/**
 * Playwright's `tests[].status`, which describes the whole test including retries.
 * `flaky` means it failed and then passed; it is deliberately *not* mapped to `passed`
 * (see {@link extractTestIds}).
 * @type {Record<string, TestStatus>}
 */
const PLAYWRIGHT_STATUS = {
  expected: 'passed',
  unexpected: 'failed',
  flaky: 'flaky',
  skipped: 'skipped',
};

/**
 * @param {string} rootDir
 * @param {string} filePath absolute, or relative to `rootDir`
 * @returns {string} posix-separated path relative to `rootDir`
 */
function toPosixRelative(rootDir, filePath) {
  const absolute = path.resolve(rootDir, filePath);
  return path.relative(rootDir, absolute).split(path.sep).join('/');
}

/**
 * @param {string} file
 * @param {string[]} titles
 * @param {string} project empty when the runner has no notion of projects
 * @returns {string}
 */
function makeId(file, titles, project) {
  const base = `${file}${ID_SEPARATOR}${titles.join(TITLE_SEPARATOR)}`;
  return project === '' ? base : `${base}${ID_SEPARATOR}${project}`;
}

/**
 * @param {Record<string, TestStatus>} table
 * @param {unknown} status
 * @param {string} runner
 * @param {string} id
 * @returns {TestStatus}
 */
function normaliseStatus(table, status, runner, id) {
  if (typeof status === 'string' && Object.hasOwn(table, status)) return table[status];
  throw new ReportFormatError(
    `${runner} reported status ${JSON.stringify(status)} for ${id}, which this parser does not know. ` +
      'Refusing to guess whether it passed.',
  );
}

/**
 * Which runner produced this report, or `null` if neither did.
 * @param {unknown} report
 * @returns {Runner | null}
 */
export function detectRunner(report) {
  if (report === null || typeof report !== 'object') return null;
  const candidate = /** @type {Record<string, unknown>} */ (report);
  if (Array.isArray(candidate.testResults) && typeof candidate.numTotalTests === 'number') return 'vitest';
  const config = candidate.config;
  if (
    Array.isArray(candidate.suites) &&
    config !== null &&
    typeof config === 'object' &&
    typeof (/** @type {Record<string, unknown>} */ (config).rootDir) === 'string'
  ) {
    return 'playwright';
  }
  return null;
}

/**
 * @param {Record<string, any>} report
 * @param {string} rootDir
 * @returns {TestRecord[]}
 */
function parseVitest(report, rootDir) {
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

/**
 * Playwright nests one suite per file, then one per `describe`. The file-level suite's
 * title is the path, not a test name, so it is excluded from the title path.
 *
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
function parsePlaywright(report, rootDir) {
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

/**
 * Collapse repeated IDs, keeping the worst status seen. A duplicate test name must never
 * let a passing entry hide a failing one.
 *
 * @param {TestRecord[]} tests
 * @returns {Map<string, TestStatus>}
 */
export function collapseByWorstStatus(tests) {
  /** @type {Map<string, TestStatus>} */
  const worst = new Map();
  for (const { id, status } of tests) {
    const seen = worst.get(id);
    if (seen === undefined || SEVERITY.indexOf(status) < SEVERITY.indexOf(seen)) worst.set(id, status);
  }
  return worst;
}

/**
 * Parse a vitest or Playwright JSON report into normalised test records.
 *
 * @param {unknown} input the report, as an object or as the raw JSON text
 * @param {{ rootDir: string }} options `rootDir` is the repo root every id is relative to
 * @returns {ParsedReport}
 * @throws {ReportFormatError} when the report cannot be understood
 */
export function parseReport(input, options) {
  const rootDir = options?.rootDir;
  if (typeof rootDir !== 'string' || rootDir.length === 0) {
    throw new ReportFormatError('parseReport requires a rootDir; ids must be relative to something stable.');
  }

  /** @type {unknown} */
  let report = input;
  if (typeof input === 'string') {
    try {
      report = JSON.parse(input);
    } catch (error) {
      throw new ReportFormatError(`report is not valid JSON: ${/** @type {Error} */ (error).message}`);
    }
  }

  const runner = detectRunner(report);
  if (runner === null) {
    throw new ReportFormatError(
      'report matches neither the vitest nor the Playwright JSON reporter. Refusing to return an empty id set, ' +
        'which would silently disable the ratchet (DESIGN.md §11).',
    );
  }

  const known = /** @type {Record<string, any>} */ (report);
  return { runner, tests: runner === 'vitest' ? parseVitest(known, rootDir) : parsePlaywright(known, rootDir) };
}

/**
 * The IDs the ratchet cares about: tests that actually passed.
 *
 * `flaky` is excluded by default. A test that failed and then passed on a retry has not
 * proven anything, and admitting it to the ratchet would arm a hard reset that fires on
 * noise — the ratchet's termination guarantee depends on regressions being real.
 *
 * @param {unknown} input the report, as an object or as the raw JSON text
 * @param {{ rootDir: string, statuses?: TestStatus[] }} options
 * @returns {Set<string>}
 * @throws {ReportFormatError} when the report cannot be understood
 */
export function extractTestIds(input, options) {
  const wanted = new Set(options?.statuses ?? ['passed']);
  const { tests } = parseReport(input, options);
  /** @type {Set<string>} */
  const ids = new Set();
  for (const [id, status] of collapseByWorstStatus(tests)) {
    if (wanted.has(status)) ids.add(id);
  }
  return ids;
}
