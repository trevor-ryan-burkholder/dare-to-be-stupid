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

import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { loadConfig } from './config.mjs';
import { installQualityPlugins } from './plugins.mjs';
import {
  evaluateIteration,
  extractTestIds,
  formatBlooperRecord,
  hardReset,
  loadState,
  parseReport,
  saveState,
} from './ratchet.mjs';
import { banner, render, stamp, styleMode, verbatim } from './style.mjs';

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
 * Settings forced on every child.
 *
 * A child inherits the operator's active output style. Verified live: with a persona style
 * set, a `claude -p` child asked only for the name field of package.json answered in that
 * persona. For the reviewer that is a correctness bug rather than a cosmetic one — its
 * output is machine-parsed, and CLAUDE.md's invariant is that the style layer may not
 * inform reviewer JSON. For the builder it is worse in a quieter way: a persona in the
 * system prompt changes what gets written.
 *
 * The driver applies the Junkion voice itself, at render, from `style.mjs`. Children speak
 * plainly.
 */
const CHILD_SETTINGS = JSON.stringify({ outputStyle: 'default' });

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
  const args = ['-p', '--output-format', 'json', '--settings', CHILD_SETTINGS, '--model', options.model];
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
 *   readTestReports: () => unknown[],
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
      if (config.extractTests) {
        // Every runner's report contributes ids. A repo with both a unit suite and an
        // e2e suite has two, and the ratchet must hold both or it protects half the work.
        passing = new Set();
        for (const report of effects.readTestReports()) {
          for (const id of extractTestIds(report, { rootDir })) passing.add(id);
        }
      } else {
        passing = new Set(loadState(dareDir).passing);
      }
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

// ===========================================================================
// Phase 3 gate definitions (DESIGN.md §2, §4)
// ===========================================================================

/** Where the driver expects each runner to leave its JSON report. */
export const UNIT_REPORT = 'test-report.json';
export const E2E_REPORT = 'e2e-report.json';
export const RED_EVIDENCE = 'red-evidence.json';

/**
 * The gates that are just an exit code.
 *
 * The unit gate writes its reporter output where the ratchet will look for it, because a
 * run whose tests passed but produced no machine-readable report gives the ratchet nothing
 * to hold — and the ratchet is what makes the loop terminate.
 *
 * @param {string} dareDir
 * @returns {Gate[]}
 */
export function commandGates(dareDir) {
  const unitOut = path.join(dareDir, UNIT_REPORT);
  return [
    { name: 'build', command: ['npm', 'run', 'build'], required: true },
    { name: 'lint', command: ['npm', 'run', 'lint'], required: true },
    { name: 'types', command: ['npm', 'run', 'typecheck'], required: true },
    { name: 'unit', command: ['npx', 'vitest', 'run', '--reporter=json', `--outputFile=${unitOut}`], required: true },
    { name: 'e2e', command: ['npx', 'playwright', 'test'], required: true },
    { name: 'security-audit', command: ['npm', 'audit', '--audit-level=high'], required: true },
  ];
}

/**
 * @param {string} file
 * @param {number} minimumBytes
 * @returns {boolean} true when the file exists and is not a stub
 */
function isSubstantial(file, minimumBytes) {
  if (!existsSync(file)) return false;
  try {
    return readFileSync(file, 'utf8').replace(/\s+/g, ' ').trim().length >= minimumBytes;
  } catch {
    return false;
  }
}

/**
 * @param {string} dir
 * @param {number} depth
 * @param {(contents: string) => boolean} predicate
 * @returns {boolean}
 */
function anySourceMatches(dir, depth, predicate) {
  if (depth > 6 || !existsSync(dir)) return false;
  /** @type {import('node:fs').Dirent[]} */
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'dist', 'build', 'coverage'].includes(entry.name)) continue;
      if (anySourceMatches(full, depth + 1, predicate)) return true;
      continue;
    }
    if (!entry.isFile() || !/\.(mjs|cjs|js|jsx|ts|tsx|vue|svelte|py|go|rb)$/.test(entry.name)) continue;
    try {
      if (predicate(readFileSync(full, 'utf8'))) return true;
    } catch {
      continue;
    }
  }
  return false;
}

/**
 * The DoD gates that are a fact about the repository rather than an exit code
 * (DESIGN.md §4 lines 3 and 4).
 *
 * @param {string} cwd
 * @returns {GateResult[]}
 */
export function staticGates(cwd) {
  const workflowDir = path.join(cwd, '.github', 'workflows');
  const workflows = existsSync(workflowDir)
    ? readdirSync(workflowDir).filter((name) => /\.ya?ml$/.test(name))
    : [];

  const readme = isSubstantial(path.join(cwd, 'README.md'), 200);
  const contract = isSubstantial(path.join(cwd, 'docs', 'api-contract.md'), 200);

  const hasLogger = anySourceMatches(cwd, 0, (contents) =>
    /\b(pino|winston|bunyan|structuredLog|logger\.(info|warn|error))\b/.test(contents),
  );
  const hasHealth = anySourceMatches(cwd, 0, (contents) => /['"`]\/(health|healthz|_health)\b/.test(contents));

  return [
    {
      name: 'ci',
      ok: workflows.length > 0,
      status: workflows.length > 0 ? 0 : 1,
      detail: workflows.length > 0 ? `${workflows.length} workflow(s)` : 'no workflow under .github/workflows',
    },
    {
      name: 'docs',
      ok: readme && contract,
      status: readme && contract ? 0 : 1,
      detail:
        readme && contract
          ? 'README.md and docs/api-contract.md present and non-stub'
          : `missing or stubbed: ${[!readme && 'README.md', !contract && 'docs/api-contract.md']
              .filter(Boolean)
              .join(', ')}`,
    },
    {
      name: 'observability',
      ok: hasLogger && hasHealth,
      status: hasLogger && hasHealth ? 0 : 1,
      detail:
        hasLogger && hasHealth
          ? 'structured logging and a health endpoint found'
          : `missing: ${[!hasLogger && 'structured logging', !hasHealth && 'health endpoint']
              .filter(Boolean)
              .join(', ')}`,
    },
  ];
}

// ---------------------------------------------------------------------------
// red-evidence (DESIGN.md §8)
// ---------------------------------------------------------------------------

/**
 * Test ids that have been observed *not* passing at some point in this run.
 *
 * @param {string} dareDir
 * @returns {Set<string>}
 */
export function loadRedEvidence(dareDir) {
  const file = path.join(dareDir, RED_EVIDENCE);
  if (!existsSync(file)) return new Set();
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    /** @type {unknown[]} */
    const seen = Array.isArray(parsed.seenFailing) ? parsed.seenFailing : [];
    return new Set(seen.filter((id) => typeof id === 'string').map(String));
  } catch {
    // Unreadable evidence is no evidence. Every new test is then unproven, which fails
    // the gate loudly rather than quietly crediting tests that were never red.
    return new Set();
  }
}

/**
 * @param {string} dareDir
 * @param {Iterable<string>} nonPassing
 * @returns {Set<string>}
 */
export function recordRedEvidence(dareDir, nonPassing) {
  const seen = loadRedEvidence(dareDir);
  for (const id of nonPassing) seen.add(id);
  mkdirSync(dareDir, { recursive: true });
  writeFileSync(
    path.join(dareDir, RED_EVIDENCE),
    `${JSON.stringify({ seenFailing: [...seen].sort() }, null, 2)}\n`,
    'utf8',
  );
  return seen;
}

/**
 * RED before GREEN. A test that has only ever been green is unproven: it may assert
 * nothing, or assert something that was already true. This is the structural version of
 * that rule — it kills tautological tests before review rather than after, when they have
 * already cost an iteration.
 *
 * @param {{ previousPassing: Iterable<string>, passing: Iterable<string>, redSeen: Iterable<string> }} options
 * @returns {GateResult}
 */
export function redEvidenceGate(options) {
  const before = new Set(options.previousPassing);
  const red = new Set(options.redSeen);
  const unproven = [...new Set(options.passing)].filter((id) => !before.has(id) && !red.has(id)).sort();
  return {
    name: 'red-evidence',
    ok: unproven.length === 0,
    status: unproven.length === 0 ? 0 : 1,
    detail:
      unproven.length === 0
        ? 'every newly passing test was seen failing first'
        : `never observed failing, so unproven: ${unproven.join(', ')}`,
  };
}

// ===========================================================================
// CLI
// ===========================================================================

/**
 * @param {string[]} argv
 * @returns {{ input: string, yes: boolean, confirmPrd: boolean }}
 */
export function parseDriverArgs(argv) {
  const flags = new Set(argv.filter((argument) => argument.startsWith('--')));
  const positional = argv.filter((argument) => !argument.startsWith('--'));
  return {
    input: positional.join(' ').trim(),
    yes: flags.has('--yes'),
    confirmPrd: flags.has('--confirm-prd'),
  };
}

/**
 * Read a prompt template that ships with the plugin.
 * @param {string} name
 * @returns {string}
 */
function template(name) {
  return readFileSync(new URL(`../templates/${name}`, import.meta.url), 'utf8');
}

/**
 * Every id the reviewer must return an entry for: the PRD's own numbering plus the five
 * DoD lines (DESIGN.md §4).
 *
 * @param {string} prd
 * @returns {string[]}
 */
export function requiredIdsFor(prd) {
  const prdIds = [...new Set([...prd.matchAll(/\bPRD-\d+\.\d+\b/g)].map((match) => match[0]))].sort();
  return [
    ...prdIds,
    'DoD-1-requirements',
    'DoD-2-security',
    'DoD-3-ci',
    'DoD-4-docs-observability',
    'DoD-5-design',
  ];
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd: string }} options
 * @returns {{ ok: boolean, status: number, stdout: string, stderr: string }}
 */
function shell(command, args, options) {
  try {
    const stdout = execFileSync(command, args, {
      cwd: options.cwd,
      stdio: 'pipe',
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    return { ok: true, status: 0, stdout, stderr: '' };
  } catch (error) {
    const failure = /** @type {{ status?: number, stdout?: string, stderr?: string, message: string }} */ (error);
    return {
      ok: false,
      status: typeof failure.status === 'number' ? failure.status : 1,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? failure.message,
    };
  }
}

/**
 * Spawn one `claude -p` child and read its envelope.
 *
 * @param {{ prompt: string, model: string, systemPrompt?: string, dangerous?: boolean, cwd: string }} options
 * @returns {ClaudeResult}
 */
function spawnClaude(options) {
  const args = claudeArgs(options);
  const result = shell('claude', args, { cwd: options.cwd });
  if (!result.ok && result.stdout.trim() === '') {
    return { ok: false, text: '', costUsd: 0, tokens: 0, raw: result.stderr };
  }
  return parseClaudeEnvelope(result.stdout);
}

/**
 * @param {string[]} argv
 * @param {{ cwd?: string, env?: Record<string, string | undefined>, log?: (line: string) => void }} [io]
 * @returns {number} process exit code
 */
export function main(argv, io = {}) {
  const cwd = io.cwd ?? process.cwd();
  const env = io.env ?? process.env;
  const write = io.log ?? ((/** @type {string} */ line) => process.stdout.write(`${line}\n`));
  const mode = styleMode(env);

  try {
    assertNotNested(env);
  } catch (error) {
    write(verbatim(/** @type {Error} */ (error).message));
    return 1;
  }

  const dareDir = path.join(cwd, '.dare');
  /** @type {DareConfig} */
  let config;
  try {
    config = loadConfig(dareDir, { env });
  } catch (error) {
    // Failure output is verbatim and unstyled (DESIGN.md §9), and a missing or broken
    // config must read as an instruction, not a stack trace.
    write(verbatim(/** @type {Error} */ (error).message));
    return 1;
  }
  const { input, confirmPrd } = parseDriverArgs(argv);
  /** @type {Record<string, string | undefined>} */
  const childEnv = { ...env, [REENTRANCY_ENV]: '1' };

  write(banner({ mode }));

  // ---- Phase 0: ideate --------------------------------------------------
  const prdPath = path.join(cwd, 'PRD.md');
  if (input !== '' && existsSync(path.resolve(cwd, input))) {
    write(verbatim(`using ${input}`));
    if (path.resolve(cwd, input) !== prdPath) writeFileSync(prdPath, readFileSync(path.resolve(cwd, input), 'utf8'));
  } else {
    const idea =
      input !== ''
        ? input
        : config.dareMe.enabled
          ? 'Invent a small, genuinely useful project that can be built and tested unattended, then specify it.'
          : '';
    if (idea === '') {
      write(verbatim('no PRD, no idea, and dareMe is disabled. Nothing to build.'));
      return 1;
    }
    write(verbatim('authoring PRD.md'));
    const authored = spawnClaude({
      prompt: `${template('prd-author.md')}\n\n---\n\nThe idea:\n\n${idea}`,
      model: config.prdModel,
      dangerous: true,
      cwd,
    });
    if (!authored.ok) {
      write(verbatim(`PRD authoring failed: ${authored.raw.slice(0, 800)}`));
      write(stamp('ABORTED', { mode }));
      return 1;
    }
    if (!existsSync(prdPath)) writeFileSync(prdPath, authored.text, 'utf8');
    if (confirmPrd) {
      write(verbatim(`PRD.md written. Review it, then re-run without --confirm-prd.`));
      return 0;
    }
  }

  const prd = readFileSync(prdPath, 'utf8');
  const requiredIds = requiredIdsFor(prd);

  // ---- Phase 1: design + quality plugins --------------------------------
  write(verbatim('designing'));
  const designed = spawnClaude({
    prompt: `${template('architect.md')}\n\n---\n\nPRD.md:\n\n${prd}`,
    model: config.designModel,
    dangerous: true,
    cwd,
  });
  if (!designed.ok) {
    write(verbatim(`design phase failed: ${designed.raw.slice(0, 800)}`));
    write(stamp('ABORTED', { mode }));
    return 1;
  }

  const provisioning = installQualityPlugins({ cwd, plugins: config.qualityPlugins, runner: shell });
  for (const warning of provisioning.warnings) write(verbatim(warning));

  // ---- Phases 2-6: the loop ---------------------------------------------
  const unitReport = path.join(dareDir, UNIT_REPORT);
  const e2eReport = path.join(dareDir, E2E_REPORT);
  const gates = [
    ...commandGates(dareDir),
    ...provisioning.gates.map((gate) => ({ name: 'design-slop', command: gate.command, required: true })),
  ];

  const outcome = driveRun({
    config,
    dareDir,
    rootDir: cwd,
    requiredIds,
    task: `Build what PRD.md specifies. Scope budget: chaos ${config.chaos}.`,
    effects: {
      build: (task) =>
        spawnClaude({
          prompt: task,
          model: config.builderModel,
          systemPrompt: template('builder-system.md'),
          dangerous: true,
          cwd,
        }),
      review: (reviewer) =>
        spawnClaude({
          prompt: `You are the ${reviewer} auditor. Audit this repository now and return your report.`,
          model: config.reviewerModel,
          systemPrompt: template('reviewer-system.md'),
          cwd,
        }),
      realityCheck: () =>
        spawnClaude({
          prompt:
            'Read PRD.md and the repository. Answer one question: is this PRD buildable with the code present, or ' +
            'is the loop chasing an impossible spec? Begin your answer with the single word buildable or unbuildable, ' +
            'then give your reasons.',
          model: config.reviewerModel,
          cwd,
        }),
      gates: () => {
        const commandResults = runGates(gates, { cwd, run: shell });
        const previousPassing = loadState(dareDir).passing;
        /** @type {Set<string>} */
        const passing = new Set();
        /** @type {Set<string>} */
        const nonPassing = new Set();
        for (const file of [unitReport, e2eReport]) {
          if (!existsSync(file)) continue;
          try {
            for (const test of parseReport(readFileSync(file, 'utf8'), { rootDir: cwd }).tests) {
              (test.status === 'passed' ? passing : nonPassing).add(test.id);
            }
          } catch {
            // The ratchet reports this failure itself; the gate does not need to guess.
          }
        }
        const red = recordRedEvidence(dareDir, nonPassing);
        const results = [
          ...commandResults.results,
          ...staticGates(cwd),
          redEvidenceGate({ previousPassing, passing, redSeen: red }),
        ];
        return { ok: results.every((result) => result.ok), results };
      },
      readTestReports: () =>
        [unitReport, e2eReport].filter((file) => existsSync(file)).map((file) => readFileSync(file, 'utf8')),
      commit: (message) => {
        shell('git', ['add', '-A'], { cwd });
        shell('git', ['commit', '--no-verify', '-m', message], { cwd });
        return shell('git', ['rev-parse', 'HEAD'], { cwd }).stdout.trim();
      },
      diffStat: () => shell('git', ['diff', '--stat', 'HEAD~1'], { cwd }).stdout.trim(),
      ship: (iteration) => {
        const tag = `dare/iter-${String(iteration).padStart(3, '0')}`;
        shell('git', ['tag', '-f', tag], { cwd });
        shell('git', ['tag', '-f', 'dare/GRAND-PRIZE'], { cwd });
        if (config.deploy.enabled && config.deploy.command !== '') {
          const parts = config.deploy.command.split(' ').filter((part) => part.length > 0);
          const deployed = shell(parts[0], parts.slice(1), { cwd });
          if (!deployed.ok) write(verbatim(`deploy failed: ${deployed.stderr.trim()}`));
        }
      },
      now: () => new Date().toISOString(),
      log: (line) => write(verbatim(line)),
    },
  });

  write(render({ kind: 'terminal', state: outcome.state }, { mode }));
  write(stamp(outcome.state, { mode }));
  write(
    verbatim(
      `${outcome.state}: ${outcome.reason}\niterations: ${outcome.iterations}  tokens: ${outcome.spentTokens}  ` +
        `cost: $${outcome.costUsd.toFixed(4)}  passing: ${outcome.passing.length}`,
    ),
  );
  void childEnv;
  return outcome.state === 'SHIPPED' ? 0 : 1;
}

const invokedDirectly =
  typeof process.argv[1] === 'string' && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  process.exitCode = main(process.argv.slice(2));
}
