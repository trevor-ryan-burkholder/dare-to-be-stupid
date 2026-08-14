/**
 * Test-ID extraction and the ratchet itself.
 *
 * Reading a test report is no longer this file's job. Detection and the per-format parsers
 * live in `scripts/reporters/` (DESIGN.md §11), so widening the loop to a runner that is not
 * vitest or Playwright never means editing the module that owns the termination guarantee.
 * What stays here is the *policy* over those normalised records — which statuses count as
 * evidence — because that is a ratchet question rather than a format one.
 *
 * The guarantees the reporters make, restated because everything below depends on them:
 *
 *   - An unrecognised report shape throws {@link ReportFormatError}. It does not return an
 *     empty set. Callers must treat a throw as a failed gate (CLAUDE.md: nothing defaults
 *     to pass).
 *   - An unknown per-test status throws, naming the value.
 *   - When one ID appears more than once, the worst status wins. A duplicate test name must
 *     never let a passing entry mask a failing one.
 *   - A report that parses cleanly but contains zero tests returns an empty set rather than
 *     throwing — "no test files" is a real state, and refusing to advance on it belongs to
 *     this module rather than to a parser.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { collapseByWorstStatus, parseReport } from './reporters/index.mjs';

/** @typedef {import('./reporters/index.mjs').ReportFormatError} ReportFormatError */
/** @typedef {import('./reporters/index.mjs').TestStatus} TestStatus */
/** @typedef {import('./reporters/index.mjs').TestRecord} TestRecord */
/** @typedef {import('./reporters/index.mjs').Runner} Runner */
/** @typedef {import('./reporters/index.mjs').ParsedReport} ParsedReport */

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
// DESIGN.md §1.2: `.meeseeks/state.json` holds every test ID that has *ever* passed. If an
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
 * Read `.meeseeks/state.json`.
 *
 * A missing file is a first run and yields {@link emptyState}. Anything else that goes
 * wrong throws: an unreadable or malformed ratchet must stop the run, because continuing
 * from an empty passing set would silently discard every ID ever earned.
 *
 * @param {string} meeseeksDir the `.meeseeks` directory
 * @returns {RatchetState}
 * @throws {RatchetStateError}
 */
export function loadState(meeseeksDir) {
  const file = path.join(meeseeksDir, STATE_FILE);
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
 * Write `.meeseeks/state.json` atomically, so a crash mid-write cannot corrupt the ratchet.
 * The passing set is sorted, which keeps diffs of the file readable.
 *
 * @param {string} meeseeksDir the `.meeseeks` directory
 * @param {RatchetState} state
 * @returns {string} the path written
 */
export function saveState(meeseeksDir, state) {
  mkdirSync(meeseeksDir, { recursive: true });
  const file = path.join(meeseeksDir, STATE_FILE);
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
 * **Except when nothing was collected at all, which is not a regression and must not be read
 * as one.** Dogfood run 6 ended with all 75 protected ids "regressing" simultaneously and the
 * tree hard-reset, because the builder switched its suite back to `node --test` and the vitest
 * report came back structurally empty — `numTotalTests: 0`, "No test suite found in file". Not
 * one test failed. The runner collected nothing, every id was absent, and absent compared
 * equal to regressed.
 *
 * The distinction is available and was simply not passed in: the driver already separates
 * `passing` from `nonPassing` while parsing the report. `collected` is their total, so
 * `collected === 0` means *the report contained no tests whatsoever*, which is a broken
 * collector and not evidence about the code. `collected > 0` with nothing passing is the real
 * catastrophe and still resets, so §1.2's guarantee is kept rather than traded away.
 *
 * Omitting `collected` preserves the old ordering, which is the conservative direction for a
 * caller that forgets: it keeps monotonicity's promise rather than quietly declining to reset.
 * A structural test asserts the driver supplies it.
 *
 * @param {RatchetState} state
 * @param {Iterable<string>} nowPassing ids that passed this iteration
 * @param {{ commit?: string | null, collected?: number }} [iteration]
 *        `collected` is how many test ids the report yielded at all, passing or not
 * @returns {RatchetDecision}
 */
export function evaluateIteration(state, nowPassing, iteration = {}) {
  const after = new Set(nowPassing);
  const { regressions, gained } = diffAgainstRatchet(state.passing, after);

  if (iteration.collected === 0 && after.size === 0) {
    return {
      action: 'reject',
      reason:
        'The test report contained no tests at all, so nothing can be concluded about the code. This is a ' +
        'collection failure, not a regression: the ids the ratchet holds are absent rather than failing, and ' +
        'resetting the tree over a runner that produced no output would destroy work to punish a fault it did ' +
        'not commit. Check that the suite is one the unit gate can collect.',
    };
  }

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
 * The file a test id came from. Ids are `<path>::<suite> > <name>`.
 *
 * @param {string} id
 * @returns {string} empty when the id carries no path
 */
export function testFilePath(id) {
  const at = id.indexOf('::');
  return at <= 0 ? '' : id.slice(0, at);
}

/** Suffixes that mark a file as the test for a sibling source file. */
const TEST_SUFFIXES = [
  // node / web: foo.test.ts, foo.spec.tsx
  { pattern: /\.(?:test|spec)(\.[cm]?[jt]sx?)$/, replace: '$1' },
  // python: test_foo.py and foo_test.py
  { pattern: /(^|\/)test_([^/]+\.py)$/, replace: '$1$2' },
  { pattern: /_test(\.py)$/, replace: '$1' },
  // go: foo_test.go
  { pattern: /_test(\.go)$/, replace: '$1' },
  // .NET: FooTests.cs — case-sensitive on purpose, the same reason `isTestEvidence` is
  { pattern: /Tests?(\.(?:cs|fs|vb))$/, replace: '$1' },
];

/**
 * The source file a test file is the test *for*, by naming convention.
 *
 * **This is the load-bearing guess and it is deliberately narrow.** A regressed test id names a
 * *test* file, but the change that broke it is almost always in *source*, so restoring the test
 * alone would put back the assertion and leave the defect. Convention is the only mapping
 * available without running a coverage tool, and `foo.test.ts` ↔ `foo.ts` is the one convention
 * that holds across every ecosystem this project targets.
 *
 * Being wrong here is cheap **because nothing trusts it**: the caller restores this set, then
 * re-runs the suite and checks the regressed ids actually came back. A wrong guess fails that
 * check and falls through to the full reset. A guess nobody verified would be a different
 * proposition entirely.
 *
 * @param {string} testPath
 * @returns {string[]} candidates, empty when the path matches no convention
 */
export function sourceSiblings(testPath) {
  const found = [];
  for (const { pattern, replace } of TEST_SUFFIXES) {
    if (!pattern.test(testPath)) continue;
    const candidate = testPath.replace(pattern, replace);
    if (candidate !== testPath) found.push(candidate);
  }
  // **The cross-tree convention, measured missing on 14 August.** The first live scoped restore
  // regressed `test/parse.test.ts`, whose colocated sibling `test/parse.ts` does not exist — the
  // source lives at `src/parse.ts`, because that repository (like most) splits `test/` from
  // `src/`. The guess restored only the test file, verification correctly said the ids did not
  // come back, and the full reset ran. The fallback made the miss cheap; this makes the guess
  // hit. Wrong extra candidates stay cheap for the same two reasons they always were: the caller
  // intersects with the files the iteration actually changed, and then verifies by re-running.
  for (const candidate of [...found]) {
    const crossTree = candidate.replace(/^tests?\//, 'src/');
    if (crossTree !== candidate) found.push(crossTree);
  }
  return found;
}

/**
 * The narrowest set of paths whose restoration could undo this regression.
 *
 * **Why this exists, measured:** `ship1` hard-reset twice, and each reset discarded the run's
 * *largest* builder spends — 7.5M and 7.7M tokens, ~10% of a 150M ceiling — because a hard reset
 * is whole-tree and the regression was one parser. Everything else that iteration built went with
 * it. The resets were correct; the *scope* was the only thing wrong.
 *
 * So: intersect the files this iteration actually changed with the files implicated by the
 * regressed ids — the test files themselves and their source siblings. **The intersection is what
 * makes this safe to attempt**: a file the iteration never touched cannot be the cause, and
 * restoring it would revert somebody else's work for no reason.
 *
 * Returns an empty list when nothing is implicated, which the caller must read as *"no scoped
 * restore is available"* and **not** as *"nothing needs restoring"*. Those are different facts and
 * this project has paid for confusing them.
 *
 * @param {string[]} regressions ids that stopped passing
 * @param {string[]} changedFiles paths changed since the last ratchet-advancing commit
 * @returns {string[]} sorted, deduplicated
 */
export function scopedRestorePaths(regressions, changedFiles) {
  const changed = new Set(changedFiles);
  /** @type {Set<string>} */
  const implicated = new Set();
  for (const id of regressions) {
    const file = testFilePath(id);
    if (file === '') continue;
    for (const candidate of [file, ...sourceSiblings(file)]) {
      if (changed.has(candidate)) implicated.add(candidate);
    }
  }
  return [...implicated].sort();
}

/**
 * Restore specific paths from a commit, leaving the rest of the tree alone.
 *
 * The scoped counterpart to `hardReset`. It is **not** a replacement for it: the caller attempts
 * this, verifies the regression is actually gone, and falls back to the full reset when it is
 * not. `--` separates the commit from the paths so a path that looks like a ref cannot be read
 * as one.
 *
 * @param {{ cwd: string, commit: string | null, paths: string[] }} options
 * @returns {void}
 * @throws {RatchetStateError} when there is nothing to restore to, no paths, or git refuses
 */
export function restorePaths(options) {
  const { cwd, commit, paths } = options;
  if (typeof commit !== 'string' || commit.length === 0) {
    throw new RatchetStateError(
      'restorePaths was asked to restore from no commit. The ratchet has no recorded good state to return to.',
    );
  }
  if (paths.length === 0) {
    throw new RatchetStateError('restorePaths was given no paths. An empty restore is not a smaller restore.');
  }
  try {
    execFileSync('git', ['checkout', commit, '--', ...paths], { cwd, stdio: 'pipe' });
  } catch (error) {
    const stderr = /** @type {{ stderr?: Buffer }} */ (error).stderr;
    throw new RatchetStateError(
      `git checkout ${commit} -- ${paths.join(' ')} failed in ${cwd}: ` +
        `${stderr ? stderr.toString().trim() : /** @type {Error} */ (error).message}`,
    );
  }
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
