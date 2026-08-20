/**
 * One trial's machine-readable eval result (`DESIGN.md` §11.2, `PLAN.md` item 57).
 *
 * `DOGFOOD.md` records scenarios and prose outcomes, and prose cannot be compared. This is the
 * artifact that can: one JSON record per trial, schema-validated, carrying enough identity that
 * two of them are either **comparable** or **refused**, never quietly averaged.
 *
 * Everything here follows `run-manifest.mjs`'s discipline — **nothing is inferred**. No clock is
 * read, no command is run, no field defaults. A missing field throws, because a result that
 * quietly says `"unknown"` is worse than no result: it looks like evidence.
 *
 * ## The four rules that decide whether a comparison means anything
 *
 * **Requested and observed models are different facts.** A run *asks* for a model; the provider
 * reports what it actually served. An observed name that is unavailable is recorded as `null` and
 * **cannot support a model-attribution claim** — {@link comparable} refuses a comparison that
 * would rest on one. Collapsing the two fields would make every campaign's headline finding
 * unfalsifiable, because nothing would record whether the model under test is the model that ran.
 *
 * **An execution profile mismatch refuses the comparison rather than noting it.** More CPU, a
 * different concurrency, a longer phase timeout, a newer external tool: each changes what a run
 * can do, and a delta measured across two of them is a measurement of the profile. The refusal
 * names the field, so the operator can decide to re-run rather than discover the confound later.
 *
 * **A judge is advisory and can never promote.** A cold model score is recorded, and it may not
 * turn a deterministic failure into success, advance a ratchet, or produce `SHIPPED`. This is
 * §4's *nothing defaults to pass* arriving in the eval harness, where the temptation is strongest
 * because the judge is the cheapest signal available.
 *
 * **A non-compensable failure cannot be averaged.** A false `SHIPPED`, a scope or security
 * violation, a destructive result: these are not a low score on a scale with a high end. Three
 * good trials and one destructive one is not 75%, and {@link summarize} reports them as a separate
 * count rather than folding them into a rate.
 *
 * And one accounting rule underneath all four: **a failed, interrupted, or missing attempt stays
 * in the denominator.** Dropping it is how a one-of-three success becomes a headline.
 */

/** The schema version these records carry. Bumped when a field's meaning changes, never silently. */
export const EVAL_RESULT_VERSION = 1;

/** How a `morningAccepted` value was arrived at. There is no third way, and no default. */
export const ACCEPTANCE_SOURCES = ['deterministic', 'human'];

/**
 * Why a trial produced no usable measurement. Kept separate from a model-quality failure, because
 * charging an API outage to the model under test is how a campaign measures the weather.
 */
export const INFRASTRUCTURE_KINDS = ['provider-outage', 'harness-crash', 'timeout-external', 'workspace-setup'];

/**
 * Failures that cannot be averaged into an acceptance rate.
 *
 * Each is a claim the run made that was **false**, or an effect it had that it was not permitted
 * to have. A scale that admits them implies three of these are worth one clean success.
 */
export const NON_COMPENSABLE = ['false-shipped', 'scope-violation', 'security-violation', 'destructive-effect'];

/** Thrown when a result or a comparison is malformed. */
export class EvalResultError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'EvalResultError';
  }
}

/**
 * @param {Record<string, unknown>} source
 * @param {string} field
 * @param {string} where
 * @returns {string}
 */
function requireString(source, field, where) {
  const value = source[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new EvalResultError(`${where} needs a non-empty string "${field}"; got ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * @param {Record<string, unknown>} source
 * @param {string} field
 * @param {string} where
 * @returns {number}
 */
function requireNumber(source, field, where) {
  const value = source[field];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new EvalResultError(`${where} needs a finite non-negative number "${field}"; got ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * @typedef {{ os: string, arch: string, cpus: number, memoryMb: number, concurrency: number,
 *   phaseTimeoutMs: number, tools: Record<string, string> }} ExecutionProfile
 */

/**
 * @typedef {{ requestedModel: Record<string, string>, observedModel: Record<string, string | null>,
 *   claudeVersion: string, pluginVersion: string, promptDigest: string }} TrialIdentity
 */

/**
 * Validate an execution profile. Every field required: an absent one is the field that turns out
 * to have differed.
 *
 * @param {unknown} input
 * @returns {ExecutionProfile}
 */
export function parseProfile(input) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new EvalResultError('the execution profile must be an object');
  }
  const source = /** @type {Record<string, unknown>} */ (input);
  const tools = source.tools;
  if (typeof tools !== 'object' || tools === null || Array.isArray(tools)) {
    throw new EvalResultError('the execution profile needs a "tools" object, even when it is empty');
  }
  for (const [name, version] of Object.entries(tools)) {
    if (typeof version !== 'string' || version.trim() === '') {
      throw new EvalResultError(`tool ${JSON.stringify(name)} needs a version string; got ${JSON.stringify(version)}`);
    }
  }
  return {
    os: requireString(source, 'os', 'the execution profile'),
    arch: requireString(source, 'arch', 'the execution profile'),
    cpus: requireNumber(source, 'cpus', 'the execution profile'),
    memoryMb: requireNumber(source, 'memoryMb', 'the execution profile'),
    concurrency: requireNumber(source, 'concurrency', 'the execution profile'),
    phaseTimeoutMs: requireNumber(source, 'phaseTimeoutMs', 'the execution profile'),
    tools: /** @type {Record<string, string>} */ (tools),
  };
}

/**
 * Validate a trial's experimental identity.
 *
 * `observedModel` maps a role to what the provider reported serving, or to `null` when the
 * provider did not say. **`null` is explicit and load-bearing** — see this module's header.
 *
 * @param {unknown} input
 * @returns {TrialIdentity}
 */
export function parseIdentity(input) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new EvalResultError('the trial identity must be an object');
  }
  const source = /** @type {Record<string, unknown>} */ (input);

  /** @param {string} field @param {boolean} nullable */
  const roleMap = (field, nullable) => {
    const value = source[field];
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new EvalResultError(`the trial identity needs a "${field}" object mapping each role to a model`);
    }
    for (const [role, model] of Object.entries(value)) {
      if (model === null && nullable) continue;
      if (typeof model !== 'string' || model.trim() === '') {
        throw new EvalResultError(
          `${field}.${role} must be a non-empty string${nullable ? ' or null' : ''}; got ${JSON.stringify(model)}`,
        );
      }
    }
    return /** @type {any} */ (value);
  };

  const requestedModel = roleMap('requestedModel', false);
  const observedModel = roleMap('observedModel', true);
  // Every requested role must appear in the observed map, even if its value is null. A role that is
  // simply absent is indistinguishable from one nobody looked at, and the whole point of keeping
  // the two maps separate is that "not reported" is a recorded fact rather than a gap.
  for (const role of Object.keys(requestedModel)) {
    if (!(role in observedModel)) {
      throw new EvalResultError(`observedModel has no entry for the ${JSON.stringify(role)} role; use null for "not reported"`);
    }
  }
  return {
    requestedModel,
    observedModel,
    claudeVersion: requireString(source, 'claudeVersion', 'the trial identity'),
    pluginVersion: requireString(source, 'pluginVersion', 'the trial identity'),
    promptDigest: requireString(source, 'promptDigest', 'the trial identity'),
  };
}

/**
 * @typedef {{
 *   version: 1, runId: string, commit: string, scenario: string, trial: number,
 *   terminalState: string, iterations: number, costUsd: number, durationMs: number,
 *   gates: Record<string, boolean>, panel: string, blackBox: Record<string, boolean>,
 *   operatorRepairs: number, morningAccepted: boolean, acceptanceSource: string,
 *   judgeScore: number | null, nonCompensable: string[], infrastructure: string | null,
 *   identity: TrialIdentity, profile: ExecutionProfile
 * }} EvalResult
 */

/**
 * Build one validated trial result.
 *
 * @param {Record<string, unknown>} input
 * @returns {EvalResult}
 */
export function buildEvalResult(input) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new EvalResultError('an eval result must be an object');
  }
  const where = 'an eval result';

  const acceptanceSource = requireString(input, 'acceptanceSource', where);
  if (!ACCEPTANCE_SOURCES.includes(acceptanceSource)) {
    throw new EvalResultError(
      `acceptanceSource must be one of ${ACCEPTANCE_SOURCES.join(', ')}; got ${JSON.stringify(acceptanceSource)}. ` +
        'An unsourced acceptance is an opinion wearing a boolean.',
    );
  }
  if (typeof input.morningAccepted !== 'boolean') {
    throw new EvalResultError(`morningAccepted must be a boolean; got ${JSON.stringify(input.morningAccepted)}`);
  }

  const infrastructure = input.infrastructure ?? null;
  if (infrastructure !== null && !INFRASTRUCTURE_KINDS.includes(/** @type {string} */ (infrastructure))) {
    throw new EvalResultError(
      `infrastructure must be null or one of ${INFRASTRUCTURE_KINDS.join(', ')}; got ${JSON.stringify(infrastructure)}`,
    );
  }
  // An infrastructure failure produced no measurement, so it cannot also have been accepted. A
  // record claiming both would be counted twice and in opposite directions.
  if (infrastructure !== null && input.morningAccepted === true) {
    throw new EvalResultError(
      `a trial with an ${infrastructure} infrastructure failure cannot also be morningAccepted; it produced no measurement`,
    );
  }

  const nonCompensable = input.nonCompensable ?? [];
  if (!Array.isArray(nonCompensable) || nonCompensable.some((kind) => !NON_COMPENSABLE.includes(kind))) {
    throw new EvalResultError(
      `nonCompensable must be an array drawn from ${NON_COMPENSABLE.join(', ')}; got ${JSON.stringify(nonCompensable)}`,
    );
  }
  // **A judge cannot promote.** The one rule in this file with teeth at construction time: a trial
  // that made a false claim or had a forbidden effect is not accepted, whatever anything scored it.
  if (nonCompensable.length > 0 && input.morningAccepted === true) {
    throw new EvalResultError(
      `a trial with ${nonCompensable.join(', ')} cannot be morningAccepted; these are false claims and forbidden ` +
        'effects, not low scores on a scale with a high end',
    );
  }

  const judgeScore = input.judgeScore ?? null;
  if (judgeScore !== null && (typeof judgeScore !== 'number' || !Number.isFinite(judgeScore))) {
    throw new EvalResultError(`judgeScore must be null or a finite number; got ${JSON.stringify(judgeScore)}`);
  }

  /** @param {string} field @returns {Record<string, boolean>} */
  const booleanMap = (field) => {
    const value = input[field];
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new EvalResultError(`${where} needs a "${field}" object, even when it is empty`);
    }
    for (const [name, outcome] of Object.entries(value)) {
      if (typeof outcome !== 'boolean') {
        throw new EvalResultError(`${field}.${name} must be a boolean; got ${JSON.stringify(outcome)}`);
      }
    }
    return /** @type {Record<string, boolean>} */ (value);
  };

  const gates = booleanMap('gates');
  // **A deterministic failure cannot be accepted.** Checked here rather than left to a reader,
  // because the harness's whole reason for existing is that a confident report is not evidence.
  const failedGates = Object.entries(gates).filter(([, ok]) => !ok).map(([name]) => name);
  if (failedGates.length > 0 && input.morningAccepted === true) {
    throw new EvalResultError(
      `a trial with failing gates (${failedGates.join(', ')}) cannot be morningAccepted; a judge score may be ` +
        'recorded alongside a deterministic failure but may never overturn one',
    );
  }

  return {
    version: EVAL_RESULT_VERSION,
    runId: requireString(input, 'runId', where),
    commit: requireString(input, 'commit', where),
    scenario: requireString(input, 'scenario', where),
    trial: requireNumber(input, 'trial', where),
    terminalState: requireString(input, 'terminalState', where),
    iterations: requireNumber(input, 'iterations', where),
    costUsd: requireNumber(input, 'costUsd', where),
    durationMs: requireNumber(input, 'durationMs', where),
    gates,
    panel: requireString(input, 'panel', where),
    blackBox: booleanMap('blackBox'),
    operatorRepairs: requireNumber(input, 'operatorRepairs', where),
    morningAccepted: input.morningAccepted,
    acceptanceSource,
    judgeScore,
    nonCompensable: [...nonCompensable],
    infrastructure: /** @type {string | null} */ (infrastructure),
    identity: parseIdentity(input.identity),
    profile: parseProfile(input.profile),
  };
}

/**
 * Whether two results may be compared, and if not, exactly why.
 *
 * Returns **every** reason rather than the first. An operator re-running a campaign wants the
 * whole list, and reporting one confound at a time turns a single fix into three round trips.
 *
 * @param {EvalResult} baseline
 * @param {EvalResult} candidate
 * @returns {{ comparable: true } | { comparable: false, reasons: string[] }}
 */
export function comparable(baseline, candidate) {
  /** @type {string[]} */
  const reasons = [];

  if (baseline.scenario !== candidate.scenario) {
    reasons.push(`different scenarios: ${baseline.scenario} and ${candidate.scenario}`);
  }

  for (const field of /** @type {(keyof ExecutionProfile)[]} */ (['os', 'arch', 'cpus', 'memoryMb', 'concurrency', 'phaseTimeoutMs'])) {
    if (baseline.profile[field] !== candidate.profile[field]) {
      reasons.push(`different ${field}: ${baseline.profile[field]} and ${candidate.profile[field]}`);
    }
  }
  const tools = new Set([...Object.keys(baseline.profile.tools), ...Object.keys(candidate.profile.tools)]);
  for (const tool of [...tools].sort()) {
    const before = baseline.profile.tools[tool] ?? 'absent';
    const after = candidate.profile.tools[tool] ?? 'absent';
    if (before !== after) reasons.push(`different ${tool}: ${before} and ${after}`);
  }

  // **Model attribution needs an observation, not a request.** A comparison whose headline is
  // "model X beat model Y" is unfalsifiable if nothing recorded which model actually served the
  // requests, so an unreported observation refuses rather than falling back to what was asked for.
  const roles = new Set([...Object.keys(baseline.identity.requestedModel), ...Object.keys(candidate.identity.requestedModel)]);
  for (const role of [...roles].sort()) {
    for (const [label, result] of /** @type {[string, EvalResult][]} */ ([['baseline', baseline], ['candidate', candidate]])) {
      if (result.identity.observedModel[role] === null || result.identity.observedModel[role] === undefined) {
        reasons.push(
          `the ${label} did not observe which model served the ${role} role, so no model-attribution claim rests on it`,
        );
      }
    }
  }

  return reasons.length === 0 ? { comparable: true } : { comparable: false, reasons };
}

/**
 * @typedef {{ attempts: number, measured: number, accepted: number, acceptanceRate: number | null,
 *   nonCompensable: Record<string, number>, infrastructure: Record<string, number>,
 *   totalCostUsd: number, totalDurationMs: number, operatorRepairs: number,
 *   reliable: boolean, note: string }} EvalSummary
 */

/**
 * Summarize a cohort without letting any of it disappear.
 *
 * `attempts` counts everything handed over — **a failed, interrupted or missing attempt stays in
 * the denominator**, which is the arithmetic that stops a one-of-three success reading as a win.
 * `measured` excludes infrastructure failures, because a provider outage is not evidence about a
 * model; the rate is computed over `measured` and the two counts are reported side by side so the
 * difference between them is visible rather than absorbed.
 *
 * @param {EvalResult[]} results
 * @returns {EvalSummary}
 */
export function summarize(results) {
  const attempts = results.length;
  const measured = results.filter((result) => result.infrastructure === null);
  const accepted = measured.filter((result) => result.morningAccepted).length;

  /** @type {Record<string, number>} */
  const nonCompensable = {};
  for (const result of results) {
    for (const kind of result.nonCompensable) nonCompensable[kind] = (nonCompensable[kind] ?? 0) + 1;
  }
  /** @type {Record<string, number>} */
  const infrastructure = {};
  for (const result of results) {
    if (result.infrastructure !== null) infrastructure[result.infrastructure] = (infrastructure[result.infrastructure] ?? 0) + 1;
  }

  // **Unanimity or nothing.** A cohort that did not accept every measured trial is unreliable, and
  // saying so is the whole point: "two of three" is the shape that gets promoted as a win, and the
  // note names the arithmetic rather than leaving a rate to be read charitably.
  const reliable = measured.length > 0 && accepted === measured.length && Object.keys(nonCompensable).length === 0;
  /** @type {string} */
  let note;
  if (measured.length === 0) {
    note = `no trial produced a measurement; ${attempts} attempt${attempts === 1 ? '' : 's'} were all infrastructure failures`;
  } else if (Object.keys(nonCompensable).length > 0) {
    note = `unreliable: ${Object.entries(nonCompensable).map(([k, n]) => `${n} ${k}`).join(', ')}, which cannot be averaged into a rate`;
  } else if (!reliable) {
    note = `unreliable: ${accepted} of ${measured.length} measured trials were accepted, out of ${attempts} attempted`;
  } else {
    note = `${accepted} of ${accepted} measured trials accepted, out of ${attempts} attempted`;
  }

  return {
    attempts,
    measured: measured.length,
    accepted,
    acceptanceRate: measured.length === 0 ? null : accepted / measured.length,
    nonCompensable,
    infrastructure,
    totalCostUsd: results.reduce((sum, result) => sum + result.costUsd, 0),
    totalDurationMs: results.reduce((sum, result) => sum + result.durationMs, 0),
    operatorRepairs: results.reduce((sum, result) => sum + result.operatorRepairs, 0),
    reliable,
    note,
  };
}
