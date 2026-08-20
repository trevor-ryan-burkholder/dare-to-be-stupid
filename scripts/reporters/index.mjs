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
import { trxReporter } from './trx.mjs';
import { vitestReporter } from './vitest.mjs';

/** @typedef {import('./shared.mjs').TestStatus} TestStatus */
/** @typedef {import('./shared.mjs').TestRecord} TestRecord */

/**
 * Widen this union when adding a reporter. It is written out rather than derived from
 * {@link REPORTERS} because a derived type would let a typo in a `name` become a new valid
 * runner instead of a type error.
 * @typedef {'vitest' | 'playwright' | 'trx'} Runner
 */

/**
 * @typedef {{
 *   name: Runner,
 *   kind?: 'json',
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
 * Formats that are not JSON, and are therefore detected on the **raw text** before anything
 * tries to parse it.
 *
 * The order matters and it is not arbitrary. `parseReport` used to begin with `JSON.parse`,
 * so a TRX file would have died as *"report is not valid JSON"* — a true sentence and a
 * useless one, naming the wrong fault and sending the reader to look for a corrupt file rather
 * than an unregistered format. Raw detection runs first so the answer is "this is TRX" rather
 * than "this is not JSON".
 *
 * A raw reporter needs no `rootDir`: its ids are not paths. See `trx.mjs` for why that is a
 * property of the format rather than a shortcut.
 *
 * @typedef {{
 *   name: Runner,
 *   kind: 'raw',
 *   detect: (raw: string) => boolean,
 *   parse: (raw: string) => TestRecord[]
 * }} RawReporter
 *
 * @type {RawReporter[]}
 */
export const RAW_REPORTERS = [trxReporter];

/**
 * How many test records one report may declare (REVIEW F19).
 *
 * **A byte ceiling does not bound what a parser allocates from those bytes.** `READ_LIMITS.report`
 * caps a report at 32MB, and 32MB of `{"t":"x","s":"passed"}` is on the order of a million records
 * — each of which becomes an id string, an entry in a `Set`, a line in monotonic ratchet state, and
 * a digest. The amplification is downstream of the read, so the read's limit cannot see it.
 *
 * 200,000 is far above any real suite and far below the point where the ratchet's own state stops
 * being a file anybody can read. A monorepo running 50,000 tests is comfortably inside it.
 *
 * **It refuses rather than truncating**, which F19 states directly: *do not silently truncate
 * evidence.* A report parsed down to its first 200,000 records would advance the ratchet on a
 * subset and record the rest as regressions on the next run.
 */
export const MAX_REPORT_TESTS = 200_000;

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
 * @throws {ReportFormatError} when the report cannot be understood, or declares more records than
 *   {@link MAX_REPORT_TESTS}
 */
export function parseReport(input, options) {
  const rootDir = options?.rootDir;
  if (typeof rootDir !== 'string' || rootDir.length === 0) {
    throw new ReportFormatError('parseReport requires a rootDir; ids must be relative to something stable.');
  }

  // Raw formats first, so a TRX file is identified as TRX rather than dying as "not valid
  // JSON" — a true sentence that names the wrong fault and sends the reader looking for a
  // corrupt file instead of an unregistered format.
  if (typeof input === 'string') {
    const raw = rawReporterFor(input);
    if (raw !== null) return bounded(raw.name, raw.parse(input));
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
      'report matches none of the known reporters (' +
        [...REPORTERS, ...RAW_REPORTERS].map((entry) => entry.name).join(', ') +
        '). Refusing ' +
        'to return an empty id set, which would silently disable the ratchet (DESIGN.md §11).',
    );
  }

  const reporter = /** @type {Reporter} */ (REPORTERS.find((entry) => entry.name === runner));
  return bounded(runner, reporter.parse(/** @type {Record<string, any>} */ (report), rootDir));
}

/**
 * Refuse a report that declares more records than the ratchet will carry.
 *
 * Applied to **every** reporter through one door, raw formats included, for the reason
 * `spawnClaude` checks its budget at one door: a format added later cannot forget it.
 *
 * The honest scope, stated because the alternative is an overclaim: this bounds what enters
 * monotonic state, not what `JSON.parse` allocated getting here. A synchronous parse cannot be
 * interrupted partway, so the byte ceiling is the only bound on that step, and this is the bound on
 * everything after it — the id set, the state file, the per-id digests, and the brief that renders
 * them.
 *
 * @param {Runner} runner
 * @param {TestRecord[]} tests
 * @returns {ParsedReport}
 * @throws {ReportFormatError}
 */
function bounded(runner, tests) {
  if (tests.length > MAX_REPORT_TESTS) {
    throw new ReportFormatError(
      `the ${runner} report declares ${tests.length} test records, above the ${MAX_REPORT_TESTS} this build ` +
        'will carry. Refusing rather than truncating: a report parsed down to its first records would advance ' +
        'the ratchet on a subset and record every dropped id as a regression on the next run.',
    );
  }
  return { runner, tests };
}

/**
 * The first raw reporter that recognises this text, or null.
 *
 * Separate from `detectRunner` rather than folded into it, because the two answer questions
 * about different things — one about a parsed object, one about bytes — and a single function
 * taking `unknown` would have to guess which it was handed.
 *
 * @param {string} raw
 * @returns {RawReporter | null}
 */
function rawReporterFor(raw) {
  for (const reporter of RAW_REPORTERS) {
    if (reporter.detect(raw)) return reporter;
  }
  return null;
}
