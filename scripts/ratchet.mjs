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

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
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

// ===========================================================================
// The ratchet
//
// DESIGN.md §1.2: `.dare/state.json` holds every test ID that has *ever* passed. If an
// iteration drops one, the driver hard-resets, the regression becomes the next build
// task, and nothing else proceeds. This is the single mechanism that turns an infinite
// loop into a terminating one.
//
// The load-bearing invariant (CLAUDE.md): a test ID that has ever passed may never be
// allowed to fail again, and no code path may remove an ID from the passing set without a
// `git reset --hard` plus a regression task. Concretely, that means:
//
//   - {@link recordAdvance} unions. It never assigns, never filters, never subtracts.
//     Handed a smaller set than it holds, it still keeps everything.
//   - {@link loadState} refuses to invent an empty ratchet. A missing file is a genuine
//     first run; a corrupt or unrecognised one throws, because silently starting from
//     zero would erase every ID ever earned and the run would look healthy doing it.
//   - An iteration with zero passing tests never advances the ratchet. "No tests ran" is
//     not evidence that nothing regressed (DESIGN.md §11).
//
// This module decides. It does not run the loop: committing, feeding the regression task
// back to the builder, and appending the blooper reel belong to the driver (slice 5).
// {@link hardReset} is the one exception, because the reset is the ratchet's own act.
// ===========================================================================

/** @typedef {{ version: 1, iteration: number, passing: string[], lastGoodCommit: string | null }} RatchetState */
/** @typedef {{ action: 'advance', gained: string[], state: RatchetState }} AdvanceDecision */
/** @typedef {{ action: 'reset', regressions: string[], task: string, target: string | null, reason: string }} ResetDecision */
/** @typedef {{ action: 'reject', reason: string }} RejectDecision */
/** @typedef {AdvanceDecision | ResetDecision | RejectDecision} RatchetDecision */

const STATE_VERSION = 1;
const STATE_FILE = 'state.json';

/** Thrown when ratchet state cannot be trusted. Never downgraded to an empty ratchet. */
export class RatchetStateError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'RatchetStateError';
  }
}

/**
 * The state of a run that has not recorded anything yet.
 * @returns {RatchetState}
 */
export function emptyState() {
  return { version: STATE_VERSION, iteration: 0, passing: [], lastGoodCommit: null };
}

/**
 * @param {unknown} value
 * @param {string} file
 * @returns {RatchetState}
 */
function validateState(value, file) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new RatchetStateError(`${file} is not a JSON object.`);
  }
  const record = /** @type {Record<string, unknown>} */ (value);
  if (record.version !== STATE_VERSION) {
    throw new RatchetStateError(
      `${file} has version ${JSON.stringify(record.version)}; this build understands version ${STATE_VERSION}. ` +
        'Refusing to guess, because guessing wrong empties the ratchet.',
    );
  }
  if (typeof record.iteration !== 'number' || !Number.isInteger(record.iteration) || record.iteration < 0) {
    throw new RatchetStateError(`${file} has a non-integer or negative iteration: ${JSON.stringify(record.iteration)}.`);
  }
  if (!Array.isArray(record.passing) || record.passing.some((id) => typeof id !== 'string')) {
    throw new RatchetStateError(`${file} has a passing set that is not an array of strings.`);
  }
  if (record.lastGoodCommit !== null && typeof record.lastGoodCommit !== 'string') {
    throw new RatchetStateError(`${file} has a lastGoodCommit that is neither a string nor null.`);
  }
  return {
    version: STATE_VERSION,
    iteration: record.iteration,
    passing: [.../** @type {string[]} */ (record.passing)],
    lastGoodCommit: record.lastGoodCommit,
  };
}

/**
 * Read `.dare/state.json`.
 *
 * A missing file is a first run and yields {@link emptyState}. Anything else that goes
 * wrong throws: an unreadable or malformed ratchet must stop the run, because continuing
 * from an empty passing set would silently discard every ID ever earned.
 *
 * @param {string} dareDir the `.dare` directory
 * @returns {RatchetState}
 * @throws {RatchetStateError}
 */
export function loadState(dareDir) {
  const file = path.join(dareDir, STATE_FILE);
  /** @type {string} */
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return emptyState();
    throw new RatchetStateError(`${file} could not be read: ${/** @type {Error} */ (error).message}`);
  }
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new RatchetStateError(`${file} is not valid JSON: ${/** @type {Error} */ (error).message}`);
  }
  return validateState(parsed, file);
}

/**
 * Write `.dare/state.json` atomically, so a crash mid-write cannot corrupt the ratchet.
 * The passing set is sorted, which keeps diffs of the file readable.
 *
 * @param {string} dareDir the `.dare` directory
 * @param {RatchetState} state
 * @returns {string} the path written
 */
export function saveState(dareDir, state) {
  mkdirSync(dareDir, { recursive: true });
  const file = path.join(dareDir, STATE_FILE);
  const temporary = `${file}.tmp`;
  const payload = {
    version: STATE_VERSION,
    iteration: state.iteration,
    passing: [...state.passing].sort(),
    lastGoodCommit: state.lastGoodCommit,
  };
  writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  renameSync(temporary, file);
  return file;
}

/**
 * What changed between the ratchet's passing set and this iteration's.
 *
 * @param {Iterable<string>} everPassed
 * @param {Iterable<string>} nowPassing
 * @returns {{ regressions: string[], gained: string[] }} both sorted
 */
export function diffAgainstRatchet(everPassed, nowPassing) {
  const before = new Set(everPassed);
  const after = new Set(nowPassing);
  const regressions = [...before].filter((id) => !after.has(id)).sort();
  const gained = [...after].filter((id) => !before.has(id)).sort();
  return { regressions, gained };
}

/**
 * The monotonic step. Unions the passing set — it cannot shrink, whatever it is handed.
 *
 * Callers must not reach for this to "correct" the ratchet downward. Removing an ID is
 * only ever legitimate alongside a hard reset and a regression task, and that path goes
 * through {@link evaluateIteration}.
 *
 * @param {RatchetState} state
 * @param {{ passing: Iterable<string>, commit?: string | null }} iteration
 * @returns {RatchetState}
 */
export function recordAdvance(state, iteration) {
  const union = new Set(state.passing);
  for (const id of iteration.passing) union.add(id);
  return {
    version: STATE_VERSION,
    iteration: state.iteration + 1,
    passing: [...union].sort(),
    lastGoodCommit: iteration.commit ?? state.lastGoodCommit,
  };
}

/**
 * The plain-language task handed back to the builder after a regression. Deliberately
 * literal: this text ends up in a build prompt, and DESIGN.md §8 requires regressions to
 * outrank everything else the builder might otherwise do.
 *
 * @param {string[]} regressions
 * @returns {string}
 */
export function formatRegressionTask(regressions) {
  const list = [...regressions].sort().map((id) => `- ${id}`).join('\n');
  return [
    'Restore these tests. They passed on an earlier iteration and do not pass now.',
    'Change nothing else. Do not add features, do not refactor, do not adjust unrelated files.',
    '',
    list,
  ].join('\n');
}

/**
 * One record for the blooper reel (DESIGN.md §13.2). The timestamp is passed in rather
 * than read from a clock, so the record is a pure function of its inputs.
 *
 * @param {{ iteration: number, regressions: string[], diffStat: string, at: string }} event
 * @returns {{ at: string, iteration: number, regressions: string[], diffStat: string }}
 */
export function formatBlooperRecord(event) {
  return {
    at: event.at,
    iteration: event.iteration,
    regressions: [...event.regressions].sort(),
    diffStat: event.diffStat,
  };
}

/**
 * Decide what an iteration's results mean for the ratchet.
 *
 * Order is deliberate. Regressions are checked first, so an iteration that both gains new
 * passing tests and loses an old one is still a reset — DESIGN.md §8, regressions outrank
 * everything. Only then is an empty result rejected.
 *
 * @param {RatchetState} state
 * @param {Iterable<string>} nowPassing ids that passed this iteration
 * @param {{ commit?: string | null }} [iteration]
 * @returns {RatchetDecision}
 */
export function evaluateIteration(state, nowPassing, iteration = {}) {
  const after = new Set(nowPassing);
  const { regressions, gained } = diffAgainstRatchet(state.passing, after);

  if (regressions.length > 0) {
    return {
      action: 'reset',
      regressions,
      task: formatRegressionTask(regressions),
      target: state.lastGoodCommit,
      reason:
        `${regressions.length} test${regressions.length === 1 ? '' : 's'} that previously passed no longer pass. ` +
        'The ratchet is monotonic: nothing else proceeds until they are restored.',
    };
  }

  if (after.size === 0) {
    return {
      action: 'reject',
      reason:
        'No tests passed this iteration. An empty result is not evidence that nothing regressed, so the ratchet ' +
        'does not advance on it (DESIGN.md §11).',
    };
  }

  return { action: 'advance', gained, state: recordAdvance(state, { passing: after, commit: iteration.commit }) };
}

/**
 * Perform the ratchet's hard reset.
 *
 * @param {{ cwd: string, commit: string | null }} options
 * @returns {void}
 * @throws {RatchetStateError} when there is nothing to reset to, or git refuses
 */
export function hardReset(options) {
  const { cwd, commit } = options;
  if (typeof commit !== 'string' || commit.length === 0) {
    throw new RatchetStateError(
      'hardReset was asked to reset to no commit. The ratchet has no recorded good state to return to.',
    );
  }
  try {
    execFileSync('git', ['reset', '--hard', commit], { cwd, stdio: 'pipe' });
  } catch (error) {
    const stderr = /** @type {{ stderr?: Buffer }} */ (error).stderr;
    throw new RatchetStateError(
      `git reset --hard ${commit} failed in ${cwd}: ${stderr ? stderr.toString().trim() : /** @type {Error} */ (error).message}`,
    );
  }
}
