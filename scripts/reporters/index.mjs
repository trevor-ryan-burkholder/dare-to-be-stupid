/**
 * The reporter registry (DESIGN.md §11).
 *
 * One place that knows which test-report formats exist, and nothing else that does. Before
 * this, detection and both parsers lived inline in `ratchet.mjs`, so widening the loop to a
 * runner that is not vitest or Playwright meant editing the module that owns the ratchet's
 * termination guarantee. That is a bad place to be doing exploratory work.
 *
 * **Adding a format is three edits and no thinking:** write `scripts/reporters/<name>.mjs`
 * exporting a {@link Reporter}, push it onto {@link REPORTERS}, and widen the `Runner` union
 * below. Nothing in `ratchet.mjs` moves.
 *
 * What must not change while doing that — every one of these has a test, and each is here
 * because §11 names extraction the component most likely to fail *silently*:
 *
 *   - **Unidentifiable throws.** A report matching no reporter is a {@link ReportFormatError},
 *     never an empty id set. An empty set reads exactly like a green run with no regressions.
 *   - **Malformed throws.** Bad JSON, a missing `name`, an absent assertions array — all throw,
 *     naming what was wrong.
 *   - **An unknown status throws**, naming the value. A runner that grows a status must be
 *     handled deliberately.
 *   - **Empty does not throw.** A report that parses cleanly and contains zero tests returns
 *     zero records, because "no test files" is a real state and not a parse failure. Refusing
 *     to *advance the ratchet* on it is the ratchet's job, and it does refuse — this is not a
 *     gap, it is the split of responsibility, and both live runs on 10 August 2026 hit it.
 *
 * Detection order is the array's order and the predicates are disjoint, so it does not matter
 * today. It is still first-match-wins rather than assert-exactly-one, because a future format
 * that is a superset of another should be resolved by putting it first, not by crashing.
 */

import { playwrightReporter } from './playwright.mjs';
import { ReportFormatError } from './shared.mjs';
import { vitestReporter } from './vitest.mjs';

/** @typedef {import('./shared.mjs').TestStatus} TestStatus */
/** @typedef {import('./shared.mjs').TestRecord} TestRecord */

/**
 * Widen this union when adding a reporter. It is written out rather than derived from
 * {@link REPORTERS} because a derived type would let a typo in a `name` become a new valid
 * runner instead of a type error.
 * @typedef {'vitest' | 'playwright'} Runner
 */

/**
 * @typedef {{
 *   name: Runner,
 *   detect: (report: Record<string, unknown>) => boolean,
 *   parse: (report: Record<string, any>, rootDir: string) => TestRecord[]
 * }} Reporter
 */

/** @typedef {{ runner: Runner, tests: TestRecord[] }} ParsedReport */

export { ReportFormatError };

/**
 * Every format this build can read, in detection order.
 * @type {Reporter[]}
 */
export const REPORTERS = [vitestReporter, playwrightReporter];

/**
 * Worst-first. Used to collapse duplicate ids and to keep a failure visible.
 * @type {TestStatus[]}
 */
const SEVERITY = ['failed', 'flaky', 'skipped', 'passed'];

/**
 * Which runner produced this report, or `null` if none of them did.
 * @param {unknown} report
 * @returns {Runner | null}
 */
export function detectRunner(report) {
  if (report === null || typeof report !== 'object' || Array.isArray(report)) return null;
  const candidate = /** @type {Record<string, unknown>} */ (report);
  for (const reporter of REPORTERS) {
    if (reporter.detect(candidate)) return reporter.name;
  }
  return null;
}

/**
 * Collapse repeated ids, keeping the worst status seen. A duplicate test name must never let
 * a passing entry hide a failing one.
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
 * Parse a test report into normalised records, whichever runner wrote it.
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
      `report matches none of the known reporters (${REPORTERS.map((entry) => entry.name).join(', ')}). Refusing ` +
        'to return an empty id set, which would silently disable the ratchet (DESIGN.md §11).',
    );
  }

  const reporter = /** @type {Reporter} */ (REPORTERS.find((entry) => entry.name === runner));
  return { runner, tests: reporter.parse(/** @type {Record<string, any>} */ (report), rootDir) };
}
