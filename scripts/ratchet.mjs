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
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { READ_LIMITS, readBounded } from './bounded-read.mjs';
import { quarantineCorruptFile } from './quarantine.mjs';
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

/**
 * @typedef {{ version: 1, iteration: number, passing: string[], lastGoodCommit: string | null,
 *   definitions?: Record<string, string>, reports?: Record<string, string> }} RatchetState
 *
 * `definitions` maps a test file's repository-relative path to a digest of its bytes at the moment
 * ids from it earned credit (REVIEW F17). `passing` stays exactly what it was — the append-only
 * historical record that an id once passed — because the finding is explicit that the two must not
 * be conflated: rewriting the monotonic record when a definition changes would destroy history to
 * express a fact about the present.
 *
 * Optional, so a state file written before 0.191.0 loads unchanged. An absent digest is not
 * evidence that the definition is the one that earned the credit, so `changedDefinitions` treats it
 * as changed and asks for red evidence again — one re-observation, once, on upgrade.
 */
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
  return { version: STATE_VERSION, iteration: 0, passing: [], lastGoodCommit: null, definitions: {}, reports: {} };
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
  // Definition digests (REVIEW F17). Optional, so a state file written before 0.191.0 loads
  // unchanged. A malformed map is dropped rather than throwing: it is an *additional* fact about
  // credit, and losing it costs one re-observation per file, while refusing to run over it would
  // strand a repository on a field that did not exist a version ago. Losing it is safe in the
  // right direction — an absent digest reads as "changed", which withholds credit rather than
  // granting it.
  const digests = record.definitions;
  const definitions =
    digests !== null && typeof digests === 'object' && !Array.isArray(digests)
      ? Object.fromEntries(
          Object.entries(/** @type {Record<string, unknown>} */ (digests)).filter(
            ([file, digest]) => typeof file === 'string' && typeof digest === 'string',
          ),
        )
      : {};
  // Report ownership (PLAN item 95). Optional and dropped when malformed, on exactly the reasoning
  // above: an id whose owner is unknown is treated as *measured*, which is the conservative
  // direction — it can still be read as a regression, and losing the map costs a reset that would
  // have been avoided rather than granting anything.
  const owners = record.reports;
  const reports =
    owners !== null && typeof owners === 'object' && !Array.isArray(owners)
      ? Object.fromEntries(
          Object.entries(/** @type {Record<string, unknown>} */ (owners)).filter(
            ([id, name]) => typeof id === 'string' && typeof name === 'string',
          ),
        )
      : {};
  return {
    version: STATE_VERSION,
    iteration: record.iteration,
    passing: [.../** @type {string[]} */ (record.passing)],
    lastGoodCommit: record.lastGoodCommit,
    definitions: /** @type {Record<string, string>} */ (definitions),
    reports: /** @type {Record<string, string>} */ (reports),
  };
}

/**
 * Read `.meeseeks/state.json`.
 *
 * A missing file is a first run and yields {@link emptyState}. Anything else that goes
 * wrong throws: an unreadable or malformed ratchet must stop the run, because continuing
 * from an empty passing set would silently discard every ID ever earned.
 *
 * **The throw is the strictest interpretation, and it is kept, not weakened (R26).** For the
 * ratchet, "strictest" is *refuse to run* — returning an empty passing set would be reading a
 * corrupt file as a clean slate, exactly the fail-open this stops. What R26 adds is quarantine:
 * corrupt bytes are moved aside to `<name>.corrupt-<stamp>` and the event announced, so the
 * corruption is preserved as evidence rather than left to be overwritten and so the operator is
 * told, before the throw halts the run. A read that fails at the OS level (not ENOENT) is not a
 * content corruption and is not quarantined — there may be nothing coherent to move.
 *
 * @param {string} meeseeksDir the `.meeseeks` directory
 * @param {{ now?: number, log?: (line: string) => void }} [quarantine] injected clock/log for the
 *   corrupt-file quarantine; both default inside {@link quarantineCorruptFile}
 * @returns {RatchetState}
 * @throws {RatchetStateError}
 */
export function loadState(meeseeksDir, quarantine = {}) {
  const file = path.join(meeseeksDir, STATE_FILE);
  /** @type {string} */
  let raw;
  try {
    // **Bounded before allocation** (REVIEW F19). The ratchet is monotonic state on the decision
    // path, and a file grown outside the hook's tool-call boundary — by a test process, a background
    // child, or an operator — forces an unbounded read here before anything can judge it.
    raw = readBounded(file, READ_LIMITS.record);
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return emptyState();
    throw new RatchetStateError(`${file} could not be read: ${/** @type {Error} */ (error).message}`);
  }
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    quarantineCorruptFile(file, { ...quarantine, keepInPlace: true });
    throw new RatchetStateError(`${file} is not valid JSON: ${/** @type {Error} */ (error).message}`);
  }
  try {
    return validateState(parsed, file);
  } catch (error) {
    // Valid JSON in a shape this build cannot trust — a wrong version, a passing set that is not an
    // array of strings. That is corruption of the decision, not a first run, so it quarantines and
    // then re-throws the validator's own message unchanged.
    quarantineCorruptFile(file, { ...quarantine, keepInPlace: true });
    throw error;
  }
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
    // Sorted by path for the same reason `passing` is: this file is read in diffs (REVIEW F17).
    definitions: Object.fromEntries(Object.entries(state.definitions ?? {}).sort(([a], [b]) => (a < b ? -1 : 1))),
    // Which report produced each banked id (PLAN item 95), sorted for the same reason.
    reports: Object.fromEntries(Object.entries(state.reports ?? {}).sort(([a], [b]) => (a < b ? -1 : 1))),
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
 * @param {{ passing: Iterable<string>, commit?: string | null, definitions?: Record<string, string>,
 *   credited?: Iterable<string>, reports?: Record<string, string> }} iteration
 *        `credited` is the subset that earned ratchet credit; `passing` is everything the reports
 *        said passed. They differ when a definition changed (REVIEW F17), and the difference must
 *        not become a regression — so regressions are computed from `passing` and banking from
 *        `credited`.
 * @returns {RatchetState}
 */
export function recordAdvance(state, iteration) {
  // **Banked from `credited`, not from everything that passed** (REVIEW F17). An id whose defining
  // file changed still *passes* — it is simply not vouched for by history any more, so it must be
  // observed failing again before it earns credit. Handing it to the ratchet anyway would let a
  // rewritten assertion inherit the old bytes' protection, which is the finding.
  const union = new Set(state.passing);
  for (const id of iteration.credited ?? iteration.passing) union.add(id);
  return {
    version: STATE_VERSION,
    iteration: state.iteration + 1,
    passing: [...union].sort(),
    lastGoodCommit: iteration.commit ?? state.lastGoodCommit,
    // The bytes that earned this credit (REVIEW F17). Merged rather than replaced, so a file whose
    // tests did not run this iteration keeps the digest it was credited under instead of losing it.
    definitions: { ...(state.definitions ?? {}), ...(iteration.definitions ?? {}) },
    // Which report produced each id (PLAN item 95). Merged for the same reason the digests are: an
    // id whose report did not run this iteration keeps the owner it was banked under.
    reports: { ...(state.reports ?? {}), ...(iteration.reports ?? {}) },
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
 * Ids the ratchet holds that **nothing measured** this attempt (PLAN item 95).
 *
 * **Absent is not failing, and a partial absence is the case nobody had covered.** `collected === 0`
 * already stops a whole-report collection failure from reading as a mass regression. What it cannot
 * see is one report of several going missing: the other report keeps `collected` comfortably
 * non-zero, so every id the missing one used to bank is absent from `passing` and compares equal to
 * regressed. `driveRun` then hard-resets the tree, the verification gate re-runs the same
 * non-producing gate, and the run repeats it to the ceiling. Reproduced end to end: 30 e2e ids
 * reported as regressions, the iteration's work destroyed, `repeated regression: … (2 times)`, run
 * burned to `BUDGET`.
 *
 * **A regression has to be attributable.** An id is unmeasured when the report that banked it was
 * not produced this attempt — so the answer needs the ownership the state now records, and an id
 * with no recorded owner is treated as measured, because "nobody knows" must not become "nothing to
 * see". That direction costs a reset that could have been avoided; the other direction hides a real
 * regression.
 *
 * An unmeasured id keeps its ratchet protection and blocks nothing. Whatever gate failed to produce
 * the report is what fails the iteration.
 *
 * @param {{ previousPassing: Iterable<string>, nowPassing: Iterable<string>,
 *   owners: Record<string, string>, produced: Iterable<string> }} attempt
 *        `owners` maps a banked id to the report name that produced it; `produced` is the report
 *        names this attempt actually collected
 * @returns {string[]} sorted
 */
export function unmeasuredIds(attempt) {
  const now = new Set(attempt.nowPassing);
  const producedNames = new Set(attempt.produced);
  /** @type {string[]} */
  const unmeasured = [];
  for (const id of new Set(attempt.previousPassing)) {
    if (now.has(id)) continue;
    const owner = attempt.owners[id];
    if (typeof owner !== 'string' || owner === '') continue;
    if (!producedNames.has(owner)) unmeasured.push(id);
  }
  return unmeasured.sort();
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
 * @param {{ commit?: string | null, collected?: number, definitions?: Record<string, string>,
 *   credited?: Iterable<string>, reports?: Record<string, string>,
 *   unmeasured?: Iterable<string> }} [iteration]
 *        `collected` is how many test ids the report yielded at all, passing or not; `unmeasured`
 *        is what {@link unmeasuredIds} answered for this attempt, which is excluded from the
 *        regression comparison and from credit alike
 * @returns {RatchetDecision}
 */
export function evaluateIteration(state, nowPassing, iteration = {}) {
  const after = new Set(nowPassing);
  // **Unmeasured ids are not compared** (PLAN item 95). They are absent because the report that
  // banked them was not produced, not because they failed, and resetting the tree over that
  // destroys the iteration's work to punish a fault it did not commit — then repeats, because the
  // verification gate re-runs the same non-producing gate. They keep their protection and are not
  // credited either: nothing here observed them.
  const unmeasured = new Set(iteration.unmeasured ?? []);
  const held = unmeasured.size === 0 ? state.passing : [...state.passing].filter((id) => !unmeasured.has(id));
  const { regressions, gained } = diffAgainstRatchet(held, after);

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

  return {
    action: 'advance',
    gained,
    state: recordAdvance(state, {
      passing: after,
      commit: iteration.commit,
      definitions: iteration.definitions,
      credited: iteration.credited,
      reports: iteration.reports,
    }),
  };
}

/**
 * A digest of a test file's bytes, as the ratchet records them.
 *
 * **Raw bytes, and the choice is deliberate rather than lazy** (REVIEW F17 asks for it explicitly).
 * Normalising first — stripping whitespace, reformatting — would decide that some edits are
 * cosmetic, and that decision is unrecoverable in the wrong direction: a normaliser that treats a
 * semantic change as formatting silently preserves credit for a weakened test, which is the defect.
 * Raw bytes err the other way. A formatter run over the suite costs one re-observation per touched
 * file and nothing else, because a changed definition is *withheld* from current credit rather than
 * failed or reset.
 *
 * @param {string} rootDir
 * @param {string} file repository-relative
 * @returns {string | null} null when the file cannot be read, which is not evidence it is unchanged
 */
export function definitionDigest(rootDir, file) {
  try {
    // Bounded (REVIEW F19). A test file over this size is pathological, and the failure direction is
    // safe: `null` reads as "changed", which withholds credit rather than granting it.
    return createHash('sha256').update(readBounded(path.resolve(rootDir, file), READ_LIMITS.evidence)).digest('hex').slice(0, 32);
  } catch {
    return null;
  }
}

/**
 * Ids whose defining file is not the one that earned their credit.
 *
 * **The hole this closes.** A test identity is a path, a title chain and an optional project. The
 * ratchet stored only those strings, so replacing the assertions inside a test while keeping its
 * name was indistinguishable from the original test continuing to pass — Codex banked
 * `test/a.test.js::protects behavior`, presented a replacement definition under the same id, and
 * `evaluateIteration` answered `advance`. A stable name preserved credit for behaviour nobody was
 * checking any more.
 *
 * What the caller does with this is the other half, and it is deliberately narrow: a changed
 * definition stops being *vouched for by history*, so it needs fresh red evidence before it earns
 * current credit again. It is **not** removed from `passing` and it does **not** count as a
 * regression — that would rewrite the monotonic record to express a fact about the present, which
 * the finding explicitly refuses. Legitimate strengthening therefore regains credit the ordinary
 * way: the new definition is observed failing, and it is credited again.
 *
 * @param {Iterable<string>} ids
 * @param {string} rootDir
 * @param {Record<string, string> | undefined} recorded digests from the state file
 * @returns {Set<string>}
 */
export function changedDefinitions(ids, rootDir, recorded) {
  const known = recorded ?? {};
  /** @type {Map<string, boolean>} */
  const verdict = new Map();
  /** @type {Set<string>} */
  const changed = new Set();
  for (const id of ids) {
    const file = testFilePath(id);
    if (file === '') continue;
    let differs = verdict.get(file);
    if (differs === undefined) {
      const was = known[file];
      const now = definitionDigest(rootDir, file);
      // Unknown or unreadable is treated as changed. Neither is evidence that the bytes that
      // earned the credit are the bytes on disk, and nothing defaults to credited.
      differs = was === undefined || now === null || now !== was;
      verdict.set(file, differs);
    }
    if (differs) changed.add(id);
  }
  return changed;
}

/**
 * The subset of `ids` whose defining file is an existing regular file inside the candidate.
 *
 * **Why credit needs this and parsing does not** (REVIEW F35). `toPosixRelative` falls back to a
 * lexically contained path when `realpathSync` fails, which closes F20's escaping-path half but
 * says nothing about whether the definition is *in* the candidate. A runner can therefore report a
 * passing test whose file does not exist, and the monotonic ratchet can bank an id no clean clone
 * can execute or inspect — durable acceptance evidence for something that is not there.
 *
 * The check belongs at the credit boundary rather than in the parser. A report naming a file this
 * checkout does not have is still a *readable report*: refusing to parse it would turn a missing
 * definition into a collection failure, and "the runner produced nothing" and "one of these tests
 * is not in the repository" need opposite responses. Parsing keeps its meaning; only banking is
 * withheld.
 *
 * `lstat`, not `stat`: a symlink at a test path is not a definition the candidate contains, for the
 * same reason a symlinked report is not a report this attempt wrote. Anything that cannot be
 * resolved is withheld, because nothing defaults to credited.
 *
 * @param {Iterable<string>} ids
 * @param {string} rootDir
 * @returns {{ credited: Set<string>, withheld: string[] }} `withheld` is sorted, for a stable log
 */
export function fileBackedIds(ids, rootDir) {
  /** @type {Set<string>} */
  const credited = new Set();
  /** @type {string[]} */
  const withheld = [];
  /** @type {Map<string, boolean>} */
  const seen = new Map();
  for (const id of ids) {
    const file = testFilePath(id);
    if (file === '') {
      // No path component at all: nothing to resolve, so nothing to credit.
      withheld.push(id);
      continue;
    }
    let backed = seen.get(file);
    if (backed === undefined) {
      try {
        backed = lstatSync(path.resolve(rootDir, file)).isFile();
      } catch {
        backed = false;
      }
      seen.set(file, backed);
    }
    if (backed) credited.add(id);
    else withheld.push(id);
  }
  return { credited, withheld: withheld.sort() };
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
