#!/usr/bin/env node
/**
 * The loop (DESIGN.md §2, §3).
 *
 * The driver lives outside any Claude Code session because it has to: the ratchet needs
 * state that survives processes, and the reviewer needs a process with no build framing.
 * A loop living inside a session can do neither.
 *
 * Everything with a side effect — spawning `claude -p`, running a gate, touching git — is
 * injected. That is not for the tests' convenience; it is so the loop's decisions can be
 * driven through every terminal state without a run costing money, and so a wrong decision
 * shows up as a failing assertion rather than as an hour of unattended building.
 *
 * Three rules run through all of it:
 *   - Nothing defaults to pass. A gate that cannot run, a reviewer whose output will not
 *     parse, a missing requirement entry — all fail.
 *   - Regressions outrank everything. The ratchet is consulted before the reviewer, and a
 *     reset ends the iteration.
 *   - Gates run before review, because they are free and deterministic and there is no
 *     reason to spend a panel of cold reads on something that does not compile.
 */

import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  evaluateIteration,
  extractTestIds,
  formatBlooperRecord,
  hardReset,
  loadState,
  saveState,
} from './ratchet.mjs';

/** @typedef {import('./config.mjs').DareConfig} DareConfig */
/** @typedef {'SHIPPED' | 'STALLED' | 'BUDGET' | 'ABORTED'} TerminalState */
/** @typedef {{ name: string, command: string[], required: boolean }} Gate */
/** @typedef {{ name: string, ok: boolean, status: number, detail: string }} GateResult */
/**
 * @typedef {{ id: string, status: 'pass' | 'fail', evidence: string | null, detail: string }} RequirementVerdict
 */
/**
 * @typedef {{ verdict: 'pass' | 'fail', requirements: RequirementVerdict[], problems: string[] }} ReviewerReport
 */

/** Environment marker used to refuse nested runs (DESIGN.md §13.6). */
export const REENTRANCY_ENV = 'DARE_RUNNING';

/** Thrown when a run must not start or must not continue. */
export class DriverError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'DriverError';
  }
}

// ---------------------------------------------------------------------------
// Re-entrancy
// ---------------------------------------------------------------------------

/**
 * dare never spawns dare. Enforced here *and* in the guard hook, because either one alone
 * has a hole: the hook only sees tool calls, and the driver only sees its own children.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {void}
 * @throws {DriverError}
 */
export function assertNotNested(env) {
  if (env[REENTRANCY_ENV] !== undefined && env[REENTRANCY_ENV] !== '') {
    throw new DriverError(
      'a dare run is already in progress in this process tree. Nested runs are refused at the driver and at the ' +
        'guard hook (DESIGN.md §13.6): they re-enter and exhaust memory long before they finish anything.',
    );
  }
}

// ---------------------------------------------------------------------------
// Reviewer output (DESIGN.md §4)
// ---------------------------------------------------------------------------

/** Evidence must be a real `path/file.ext:LINE`, not a gesture at one. */
const EVIDENCE_PATTERN = /^[^\s:]+\.[A-Za-z0-9]+:\d+$/;

/**
 * Pull a JSON object out of model output, which may arrive bare, fenced, or wrapped in
 * prose. Returns null rather than throwing, because the caller turns that into a `fail`.
 *
 * @param {string} text
 * @returns {unknown}
 */
export function extractJsonObject(text) {
  const trimmed = text.trim();
  /** @type {string[]} */
  const candidates = [trimmed];

  const fenced = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n?```/);
  if (fenced !== null) candidates.push(fenced[1]);

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) candidates.push(trimmed.slice(firstBrace, lastBrace + 1));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      // Try the next shape.
    }
  }
  return null;
}

/**
 * Parse and *judge* a reviewer's output.
 *
 * The parser is where the adversarial framing is actually enforced, so it is deliberately
 * hostile (DESIGN.md §4):
 *
 *   - Output that will not parse is a fail. Not a retry, not a shrug.
 *   - A requirement marked `pass` with no evidence, or with evidence that is not a real
 *     `file:line`, is flipped to `fail` before anything is counted.
 *   - Every required id must have an entry. A missing entry invalidates the audit rather
 *     than being treated as not applicable.
 *   - The reviewer's own top-level `verdict` is advisory. The verdict returned here is
 *     computed from the entries, so a reviewer that says pass over a failing entry does
 *     not get to.
 *
 * @param {string} raw the reviewer's stdout
 * @param {{ requiredIds: string[] }} options every PRD requirement and DoD line
 * @returns {ReviewerReport}
 */
export function parseReviewerReport(raw, options) {
  const required = [...new Set(options.requiredIds)];
  /** @type {string[]} */
  const problems = [];

  const parsed = extractJsonObject(raw);
  if (parsed === null) {
    return {
      verdict: 'fail',
      requirements: [],
      problems: ['reviewer output could not be parsed as JSON; unparseable output is a fail (DESIGN.md §4)'],
    };
  }

  const entries = /** @type {Record<string, unknown>} */ (parsed).requirements;
  if (!Array.isArray(entries)) {
    return { verdict: 'fail', requirements: [], problems: ['reviewer output has no `requirements` array'] };
  }

  /** @type {RequirementVerdict[]} */
  const requirements = [];
  /** @type {Set<string>} */
  const seen = new Set();

  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      problems.push('a requirement entry is not an object');
      continue;
    }
    const record = /** @type {Record<string, unknown>} */ (entry);
    const id = typeof record.id === 'string' ? record.id : '';
    if (id === '') {
      problems.push('a requirement entry has no id');
      continue;
    }
    const evidence = typeof record.evidence === 'string' && record.evidence.length > 0 ? record.evidence : null;
    const detail = typeof record.detail === 'string' ? record.detail : '';
    let status = record.status === 'pass' ? 'pass' : 'fail';

    if (status === 'pass' && evidence === null) {
      status = 'fail';
      problems.push(`${id} was marked pass with no evidence; flipped to fail (DESIGN.md §4)`);
    } else if (status === 'pass' && !EVIDENCE_PATTERN.test(evidence ?? '')) {
      status = 'fail';
      problems.push(
        `${id} was marked pass with evidence ${JSON.stringify(evidence)}, which is not a file:line citation; ` +
          'flipped to fail (DESIGN.md §4)',
      );
    }

    if (seen.has(id)) {
      problems.push(`${id} appears more than once; the worst entry stands`);
      const existing = requirements.find((item) => item.id === id);
      if (existing !== undefined && status === 'fail') {
        existing.status = 'fail';
        existing.evidence = evidence;
        existing.detail = detail;
      }
      continue;
    }

    seen.add(id);
    requirements.push({ id, status: /** @type {'pass' | 'fail'} */ (status), evidence, detail });
  }

  for (const id of required) {
    if (seen.has(id)) continue;
    problems.push(`${id} has no entry; a missing entry invalidates the audit (DESIGN.md §4)`);
    requirements.push({ id, status: 'fail', evidence: null, detail: 'no entry returned by the reviewer' });
  }

  if (requirements.length === 0) problems.push('reviewer returned no requirement entries at all');
  const verdict = requirements.length > 0 && requirements.every((entry) => entry.status === 'pass') ? 'pass' : 'fail';

  return { verdict, requirements, problems };
}

/**
 * The panel is unanimous or the run continues (DESIGN.md §1.1, §10 `requireUnanimous`).
 *
 * @param {ReviewerReport[]} reports
 * @param {{ requireUnanimous: boolean }} options
 * @returns {{ verdict: 'pass' | 'fail', failing: string[] }}
 */
export function combinePanel(reports, options) {
  if (reports.length === 0) return { verdict: 'fail', failing: ['no reviewer returned a report'] };

  /** @type {string[]} */
  const failing = [];
  for (const report of reports) {
    for (const entry of report.requirements) {
      if (entry.status === 'fail') failing.push(`${entry.id}: ${entry.detail || 'no detail given'}`);
    }
    for (const problem of report.problems) failing.push(problem);
  }

  // A member that reported a problem has not returned a clean pass, whatever its own
  // verdict says. Disqualifying the *member* rather than vetoing the whole panel is what
  // keeps `requireUnanimous` meaningful: veto everything on any finding and the setting
  // could never change an outcome, which would make it dead configuration.
  const passes = reports.filter((report) => report.verdict === 'pass' && report.problems.length === 0).length;
  const enough = options.requireUnanimous ? passes === reports.length : passes > reports.length / 2;

  return { verdict: enough ? 'pass' : 'fail', failing: [...new Set(failing)] };
}

// ---------------------------------------------------------------------------
// Gates (DESIGN.md §2 phase 3)
// ---------------------------------------------------------------------------

/**
 * Run the deterministic gates. Exit codes only, no model involved.
 *
 * A gate that cannot run is a failure, not a skip. The single exception the spec allows —
 * `gate:design-slop` on a project with no user interface — is handled upstream by not
 * arming the gate at all (`plugins.mjs`), so anything reaching here must run.
 *
 * @param {Gate[]} gates
 * @param {{ cwd: string, run: import('./plugins.mjs').Runner }} options
 * @returns {{ ok: boolean, results: GateResult[] }}
 */
export function runGates(gates, options) {
  /** @type {GateResult[]} */
  const results = [];
  for (const gate of gates) {
    if (gate.command.length === 0) {
      results.push({
        name: gate.name,
        ok: false,
        status: -1,
        detail: 'gate has no command; a gate that cannot run is a failure',
      });
      continue;
    }
    const outcome = options.run(gate.command[0], gate.command.slice(1), { cwd: options.cwd });
    results.push({
      name: gate.name,
      ok: outcome.ok,
      status: outcome.status,
      detail: outcome.ok ? 'passed' : (outcome.stderr || outcome.stdout || `exit ${outcome.status}`).trim(),
    });
  }
  return { ok: results.every((result) => result.ok), results };
}

/**
 * How many gates passed. Used for stall detection: an iteration that improves nothing
 * measurable is a stalled iteration (DESIGN.md §10 `stallLimit`).
 *
 * @param {GateResult[]} results
 * @returns {number}
 */
export function gateScore(results) {
  return results.filter((result) => result.ok).length;
}

// ---------------------------------------------------------------------------
// Budget and stall (DESIGN.md §10, §13.5)
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   iteration: number, spentTokens: number, stalledIterations: number,
 *   bestGateScore: number, bestPassingCount: number
 * }} RunProgress
 */

/**
 * Decide whether the loop may run another iteration.
 *
 * @param {RunProgress} progress
 * @param {DareConfig} config
 * @returns {{ continue: true } | { continue: false, state: TerminalState, reason: string }}
 */
export function shouldContinue(progress, config) {
  if (progress.spentTokens >= config.tokenCeiling) {
    return {
      continue: false,
      state: 'BUDGET',
      reason: `token ceiling reached: ${progress.spentTokens} of ${config.tokenCeiling}`,
    };
  }
  if (progress.iteration >= config.maxIterations) {
    return {
      continue: false,
      state: 'BUDGET',
      reason: `iteration limit reached: ${progress.iteration} of ${config.maxIterations}`,
    };
  }
  if (progress.stalledIterations >= config.stallLimit) {
    return {
      continue: false,
      state: 'STALLED',
      reason: `${progress.stalledIterations} iterations with no gate improvement (limit ${config.stallLimit})`,
    };
  }
  return { continue: true };
}

/**
 * Did this iteration improve anything measurable?
 *
 * Improvement is either a gate that now passes and did not before, or a test id the
 * ratchet did not hold. Anything else is a stalled iteration, however busy it looked.
 *
 * @param {RunProgress} progress
 * @param {{ gateScore: number, passingCount: number }} iteration
 * @returns {RunProgress}
 */
export function recordProgress(progress, iteration) {
  const improved = iteration.gateScore > progress.bestGateScore || iteration.passingCount > progress.bestPassingCount;
  return {
    ...progress,
    iteration: progress.iteration + 1,
    stalledIterations: improved ? 0 : progress.stalledIterations + 1,
    bestGateScore: Math.max(progress.bestGateScore, iteration.gateScore),
    bestPassingCount: Math.max(progress.bestPassingCount, iteration.passingCount),
  };
}

/**
 * Broadcast minutes remaining (DESIGN.md §13.5). Cosmetic, but reads the real budget.
 *
 * @param {RunProgress} progress
 * @param {DareConfig} config
 * @returns {{ iterationsLeft: number, tokensLeft: number, fractionLeft: number }}
 */
export function airtimeRemaining(progress, config) {
  const iterationsLeft = Math.max(0, config.maxIterations - progress.iteration);
  const tokensLeft = Math.max(0, config.tokenCeiling - progress.spentTokens);
  const byIterations = config.maxIterations === 0 ? 0 : iterationsLeft / config.maxIterations;
  const byTokens = config.tokenCeiling === 0 ? 0 : tokensLeft / config.tokenCeiling;
  return { iterationsLeft, tokensLeft, fractionLeft: Math.min(byIterations, byTokens) };
}

// ---------------------------------------------------------------------------
// claude -p children (DESIGN.md §3)
// ---------------------------------------------------------------------------

/** @typedef {{ ok: boolean, text: string, costUsd: number, tokens: number, raw: string }} ClaudeResult */

/**
 * Read what a `claude -p --output-format json` envelope actually carries.
 *
 * Verified against claude 2.1.226: `result` holds the text, `is_error` the outcome,
 * `total_cost_usd` the spend and `usage` the token counts. Budget accounting reads these
 * rather than estimating, because an estimate that drifts low never trips the ceiling.
 *
 * @param {string} stdout
 * @returns {ClaudeResult}
 */
export function parseClaudeEnvelope(stdout) {
  const parsed = extractJsonObject(stdout);
  if (parsed === null) return { ok: false, text: '', costUsd: 0, tokens: 0, raw: stdout };

  const record = /** @type {Record<string, any>} */ (parsed);
  const usage = record.usage ?? {};
  const tokens =
    (Number(usage.input_tokens) || 0) +
    (Number(usage.output_tokens) || 0) +
    (Number(usage.cache_creation_input_tokens) || 0) +
    (Number(usage.cache_read_input_tokens) || 0);

  return {
    ok: record.is_error === false && typeof record.result === 'string',
    text: typeof record.result === 'string' ? record.result : '',
    costUsd: Number(record.total_cost_usd) || 0,
    tokens,
    raw: stdout,
  };
}

/**
 * Build the argv for a `claude -p` child.
 *
 * `--dangerously-skip-permissions` is applied only to build children. The reviewer is a
 * cold read with no reason to touch anything, and the ideate and design phases write
 * documents; none of them get it (DESIGN.md §7).
 *
 * @param {{ prompt: string, model: string, systemPrompt?: string, dangerous?: boolean }} options
 * @returns {string[]}
 */
export function claudeArgs(options) {
  const args = ['-p', '--output-format', 'json', '--model', options.model];
  if (options.systemPrompt !== undefined && options.systemPrompt.length > 0) {
    args.push('--append-system-prompt', options.systemPrompt);
  }
  if (options.dangerous === true) args.push('--dangerously-skip-permissions');
  args.push(options.prompt);
  return args;
}

// ---------------------------------------------------------------------------
// The blooper reel (DESIGN.md §13.2)
// ---------------------------------------------------------------------------

/**
 * Append one hard-reset record. Written by the driver, never by a builder.
 *
 * @param {string} dareDir
 * @param {{ iteration: number, regressions: string[], diffStat: string, at: string }} event
 * @returns {string} the path written
 */
export function appendBlooper(dareDir, event) {
  mkdirSync(dareDir, { recursive: true });
  const file = path.join(dareDir, 'bloopers.log');
  appendFileSync(file, `${JSON.stringify(formatBlooperRecord(event))}\n`, 'utf8');
  return file;
}

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   build: (task: string) => ClaudeResult,
 *   review: (reviewer: string) => ClaudeResult,
 *   realityCheck: () => ClaudeResult,
 *   gates: () => { ok: boolean, results: GateResult[] },
 *   readTestReport: () => unknown,
 *   commit: (message: string) => string,
 *   diffStat: () => string,
 *   ship: (iteration: number) => void,
 *   now: () => string,
 *   log: (line: string) => void,
 * }} Effects
 */

/**
 * @typedef {{
 *   state: TerminalState, reason: string, iterations: number,
 *   spentTokens: number, costUsd: number, passing: string[]
 * }} RunOutcome
 */

/**
 * Drive a run to a terminal state.
 *
 * The phase order is the spec's, and the order is the point: build, gates, ratchet,
 * review, ship. Gates before review because they are free. Ratchet before review because a
 * regression ends the iteration whatever a reviewer would have said about the rest of it.
 *
 * @param {{
 *   config: DareConfig,
 *   dareDir: string,
 *   rootDir: string,
 *   requiredIds: string[],
 *   task: string,
 *   effects: Effects,
 * }} options
 * @returns {RunOutcome}
 */
export function driveRun(options) {
  const { config, dareDir, rootDir, requiredIds, effects } = options;

  /** @type {RunProgress} */
  let progress = { iteration: 0, spentTokens: 0, stalledIterations: 0, bestGateScore: 0, bestPassingCount: 0 };
  let costUsd = 0;
  let task = options.task;

  /**
   * @param {TerminalState} state
   * @param {string} reason
   * @returns {RunOutcome}
   */
  const finish = (state, reason) => ({
    state,
    reason,
    iterations: progress.iteration,
    spentTokens: progress.spentTokens,
    costUsd,
    passing: loadState(dareDir).passing,
  });

  for (;;) {
    const permission = shouldContinue(progress, config);
    if (!permission.continue) return finish(permission.state, permission.reason);

    const iterationNumber = progress.iteration + 1;
    effects.log(`iteration ${iterationNumber}`);

    // ---- Phase 2: build -------------------------------------------------
    const built = effects.build(task);
    progress = { ...progress, spentTokens: progress.spentTokens + built.tokens };
    costUsd += built.costUsd;
    if (!built.ok) {
      return finish('ABORTED', `the builder process failed and returned no usable output: ${built.raw.slice(0, 400)}`);
    }

    // ---- Phase 3: gates -------------------------------------------------
    const gateOutcome = effects.gates();
    const score = gateScore(gateOutcome.results);

    // ---- Phase 4: ratchet ----------------------------------------------
    /** @type {Set<string>} */
    let passing;
    try {
      passing = config.extractTests
        ? extractTestIds(effects.readTestReport(), { rootDir })
        : new Set(loadState(dareDir).passing);
    } catch (error) {
      // An unreadable report is not evidence that nothing regressed.
      return finish('ABORTED', `test report could not be read: ${/** @type {Error} */ (error).message}`);
    }

    const state = loadState(dareDir);
    const decision = evaluateIteration(state, passing, { commit: null });

    if (decision.action === 'reset') {
      appendBlooper(dareDir, {
        iteration: iterationNumber,
        regressions: decision.regressions,
        diffStat: effects.diffStat(),
        at: effects.now(),
      });
      if (decision.target !== null) hardReset({ cwd: rootDir, commit: decision.target });
      effects.log(`regression: ${decision.regressions.join(', ')}`);
      task = decision.task;
      progress = recordProgress(progress, { gateScore: score, passingCount: state.passing.length });
      continue;
    }

    if (decision.action === 'reject') {
      effects.log(decision.reason);
      task = `${options.task}\n\nNo tests passed on the previous iteration. Make the suite run and pass before anything else.`;
      progress = recordProgress(progress, { gateScore: score, passingCount: 0 });
      continue;
    }

    if (!gateOutcome.ok) {
      const failed = gateOutcome.results.filter((result) => !result.ok);
      effects.log(`gates failed: ${failed.map((result) => result.name).join(', ')}`);
      task = [
        'These gates failed. Fix them before anything else.',
        '',
        ...failed.map((result) => `- ${result.name}: ${result.detail}`),
      ].join('\n');
      progress = recordProgress(progress, { gateScore: score, passingCount: passing.size });
      continue;
    }

    // ---- Phase 5: review ------------------------------------------------
    const reports = config.reviewers.map((reviewer) => {
      const result = effects.review(reviewer);
      progress = { ...progress, spentTokens: progress.spentTokens + result.tokens };
      costUsd += result.costUsd;
      // A reviewer process that failed produces no report, and no report is a fail.
      return parseReviewerReport(result.ok ? result.text : '', { requiredIds });
    });
    const panel = combinePanel(reports, { requireUnanimous: config.requireUnanimous });

    // ---- Phase 6: ship, or bank the progress and hand the findings back ---
    const commit = effects.commit(
      panel.verdict === 'pass'
        ? `dare: iteration ${iterationNumber}`
        : `dare: iteration ${iterationNumber} (review outstanding)`,
    );
    const advanced = evaluateIteration(state, passing, { commit });
    if (advanced.action === 'advance') saveState(dareDir, advanced.state);

    if (panel.verdict === 'pass') {
      effects.ship(iterationNumber);
      return finish('SHIPPED', `panel unanimous on ${requiredIds.length} requirement(s)`);
    }

    effects.log(`review outstanding: ${panel.failing.length} finding(s)`);
    task = ['The audit found these outstanding. Address them.', '', ...panel.failing.map((item) => `- ${item}`)].join(
      '\n',
    );
    progress = recordProgress(progress, { gateScore: score, passingCount: passing.size });

    // ---- §13.3 reality-check circuit-breaker ----------------------------
    if (progress.stalledIterations === config.realityCheck.after) {
      const verdict = effects.realityCheck();
      progress = { ...progress, spentTokens: progress.spentTokens + verdict.tokens };
      costUsd += verdict.costUsd;
      if (verdict.ok && /unbuildable/i.test(verdict.text)) {
        mkdirSync(dareDir, { recursive: true });
        writeFileSync(path.join(dareDir, 'reality-check.md'), verdict.text, 'utf8');
        return finish('ABORTED', 'the reality check found this PRD is not buildable with the code present');
      }
    }
  }
}
