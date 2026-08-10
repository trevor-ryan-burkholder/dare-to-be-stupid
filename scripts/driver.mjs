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
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { compileBrief, writeBrief } from './brief.mjs';
import { loadConfig } from './config.mjs';
import { hasMeaningfulHistory, historyContext } from './history.mjs';
import { integrityGate } from './integrity.mjs';
import {
  addLesson,
  findResolvedStruggles,
  markLessonsUsed,
  parseLessonExtraction,
  readLessons,
  saveLessons,
  selectLessons,
} from './lessons.mjs';
import { hasFrontend, installQualityPlugins } from './plugins.mjs';
import { applyWinner, createWorktrees, removeWorktrees, selectWinner, shouldRace } from './race.mjs';
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
 * @typedef {{
 *   id: string, status: 'pass' | 'fail', severity: string, confidence: number,
 *   evidence: string | null, detail: string, repairHint: string, actionable: boolean
 * }} AdvisoryFinding
 */
/**
 * @typedef {{
 *   verdict: 'pass' | 'fail', requirements: RequirementVerdict[],
 *   advisories: AdvisoryFinding[], problems: string[]
 * }} ReviewerReport
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
// Reviewer ownership (DESIGN.md §1.1)
// ---------------------------------------------------------------------------

/**
 * Turn an ownership pattern into a matcher. `*` matches any run of characters; every other
 * character is literal, so `DoD-2-security` means that id and nothing adjacent to it.
 *
 * @param {string} pattern
 * @returns {RegExp}
 */
function ownershipMatcher(pattern) {
  // Split on the wildcard, then escape each literal segment. Doing it this way rather
  // than through a placeholder character means no input can be mistaken for the placeholder.
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}$`);
}

/**
 * @typedef {{
 *   assignments: { reviewer: string, ids: string[] }[],
 *   uncovered: string[],
 *   shared: { id: string, reviewers: string[] }[]
 * }} OwnershipPlan
 */

/**
 * Split the required ids across the panel.
 *
 * DESIGN.md §1.1 asks for a heterogeneous panel — a security auditor, a correctness auditor
 * and a design auditor, each owning the lines it is expert in. Three generalists each
 * re-adjudicating all of it is a different thing wearing the same name: it costs three full
 * reads and produces three shallow opinions per line instead of one expert one.
 *
 * Assignment is deterministic and total. Every id lands with at least one *active* reviewer
 * or it appears in `uncovered`, and an uncovered id stops the run before a single reviewer
 * is spawned — an id nobody was asked about would otherwise pass by never being judged,
 * which is the exact failure the parser exists to prevent.
 *
 * @param {string[]} requiredIds
 * @param {{ reviewers: string[], ownership: Record<string, string[]> }} options
 * @returns {OwnershipPlan}
 */
export function ownershipPlan(requiredIds, options) {
  const ids = [...new Set(requiredIds)].sort();
  const matchers = new Map(
    options.reviewers.map((reviewer) => [reviewer, (options.ownership[reviewer] ?? []).map(ownershipMatcher)]),
  );

  /** @type {Map<string, string[]>} */
  const owned = new Map(options.reviewers.map((reviewer) => [reviewer, []]));
  /** @type {string[]} */
  const uncovered = [];
  /** @type {{ id: string, reviewers: string[] }[]} */
  const shared = [];

  for (const id of ids) {
    /** @type {string[]} */
    const owners = [];
    for (const reviewer of options.reviewers) {
      if ((matchers.get(reviewer) ?? []).some((matcher) => matcher.test(id))) owners.push(reviewer);
    }
    if (owners.length === 0) {
      uncovered.push(id);
      continue;
    }
    // Two owners is legal but never the default: it is a second cold read of the same line,
    // which is worth paying for only when an operator has decided it is.
    if (owners.length > 1) shared.push({ id, reviewers: owners });
    for (const owner of owners) (owned.get(owner) ?? []).push(id);
  }

  return {
    assignments: options.reviewers.map((reviewer) => ({ reviewer, ids: owned.get(reviewer) ?? [] })),
    uncovered,
    shared,
  };
}

/**
 * Refuse a run whose panel does not cover the specification.
 *
 * This fires before review, not during it. An id with no owner is not a reviewer's mistake
 * to make — it is a configuration that cannot produce a verdict, and discovering that after
 * paying for a panel of whole-repository reads is discovering it too late.
 *
 * @param {string[]} requiredIds
 * @param {{ reviewers: string[], ownership: Record<string, string[]> }} options
 * @returns {OwnershipPlan}
 * @throws {DriverError}
 */
export function assertOwnershipCovers(requiredIds, options) {
  const plan = ownershipPlan(requiredIds, options);
  if (plan.uncovered.length > 0) {
    throw new DriverError(
      `no reviewer owns ${plan.uncovered.join(', ')}. Every PRD requirement and DoD line must be owned by an active ` +
        'reviewer before the panel runs (DESIGN.md §1.1); an unowned id would ship having never been judged. Add a ' +
        'pattern to `ownership` in .dare/config.json, or add the reviewer that owns it to `reviewers`.',
    );
  }
  const empty = plan.assignments.filter((assignment) => assignment.ids.length === 0).map((a) => a.reviewer);
  if (empty.length > 0) {
    throw new DriverError(
      `reviewer ${empty.join(', ')} owns none of the required ids. A panel member with nothing to judge spends a whole ` +
        'cold read of the repository on nothing; remove it from `reviewers`, or give it ids in `ownership`.',
    );
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Reviewer output (DESIGN.md §4)
// ---------------------------------------------------------------------------

/** Evidence must be a real `path/file.ext:LINE`, not a gesture at one. */
const EVIDENCE_PATTERN = /^[^\s:]+\.[A-Za-z0-9]+:\d+$/;

/** Ids in this shape are advisory findings, not specification compliance (DESIGN.md §4.1). */
const ADVISORY_ID_PATTERN = /^advisory[-:]/i;

/** Severities an advisory finding may declare, weakest first. */
const ADVISORY_SEVERITIES = ['trivial', 'minor', 'major', 'critical'];

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
 * Read one advisory finding.
 *
 * Advisory findings are the one place a number is allowed to influence anything, and the
 * influence is deliberately small: they never touch the verdict, they only decide whether a
 * suggestion is worth handing to the next builder iteration. Requirement compliance stays
 * deterministic (DESIGN.md §4.1).
 *
 * A finding is *actionable* only with a real `file:line` and a confidence at or above the
 * configured threshold. Everything else is recorded and ignored — a low-confidence hunch
 * fed back as work is how a loop spends its remaining budget chasing an opinion.
 *
 * @param {Record<string, unknown>} record
 * @param {string} id
 * @param {number} minConfidence
 * @returns {AdvisoryFinding}
 */
function readAdvisory(record, id, minConfidence) {
  const evidence = typeof record.evidence === 'string' && EVIDENCE_PATTERN.test(record.evidence)
    ? record.evidence
    : null;
  const rawConfidence = Number(record.confidence);
  // An absent or unreadable confidence is zero, not a default pass. The reviewer that
  // declines to say how sure it is has said how sure it is.
  const confidence = Number.isFinite(rawConfidence) && rawConfidence >= 0 && rawConfidence <= 1 ? rawConfidence : 0;
  const severity =
    typeof record.severity === 'string' && ADVISORY_SEVERITIES.includes(record.severity.toLowerCase())
      ? record.severity.toLowerCase()
      : 'minor';
  const status = record.status === 'pass' ? 'pass' : 'fail';

  return {
    id,
    status: /** @type {'pass' | 'fail'} */ (status),
    severity,
    confidence,
    evidence,
    detail: typeof record.detail === 'string' ? record.detail : '',
    repairHint: typeof record.repairHint === 'string' ? record.repairHint : '',
    actionable: status === 'fail' && evidence !== null && confidence >= minConfidence,
  };
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
 *   - Every id this reviewer *owns* must have an entry. A missing entry invalidates the
 *     audit rather than being treated as not applicable.
 *   - The reviewer's own top-level `verdict` is advisory. The verdict returned here is
 *     computed from the entries, so a reviewer that says pass over a failing entry does
 *     not get to.
 *
 * Entries whose id is in the `advisory-*` shape are the one exception, and they are held to
 * one side: they carry severity and confidence, and they cannot move the verdict in either
 * direction (DESIGN.md §4.1).
 *
 * @param {string} raw the reviewer's stdout
 * @param {{ requiredIds: string[], minConfidence?: number }} options the ids this reviewer owns
 * @returns {ReviewerReport}
 */
export function parseReviewerReport(raw, options) {
  const required = [...new Set(options.requiredIds)];
  const requiredSet = new Set(required);
  const minConfidence = typeof options.minConfidence === 'number' ? options.minConfidence : 0.7;
  /** @type {string[]} */
  const problems = [];
  /** @type {AdvisoryFinding[]} */
  const advisories = [];

  const parsed = extractJsonObject(raw);
  if (parsed === null) {
    return {
      verdict: 'fail',
      requirements: [],
      advisories,
      problems: ['reviewer output could not be parsed as JSON; unparseable output is a fail (DESIGN.md §4)'],
    };
  }

  const entries = /** @type {Record<string, unknown>} */ (parsed).requirements;
  if (!Array.isArray(entries)) {
    return {
      verdict: 'fail',
      requirements: [],
      advisories,
      problems: ['reviewer output has no `requirements` array'],
    };
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
    // A required id in the advisory shape is still required. Compliance wins the tie, so a
    // reviewer cannot demote a DoD line by renaming it.
    if (ADVISORY_ID_PATTERN.test(id) && !requiredSet.has(id)) {
      advisories.push(readAdvisory(record, id, minConfidence));
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

  return { verdict, requirements, advisories, problems };
}

/**
 * The panel is unanimous or the run continues (DESIGN.md §1.1, §10 `requireUnanimous`).
 *
 * With ownership in force each member answers a different question, so the panel's verdict
 * is the conjunction of specialists rather than a vote of generalists. `requiredIds` is
 * re-checked here against the union of what came back: ownership is asserted before the
 * panel runs, but a reviewer that returns a truncated report would otherwise leave an id
 * unjudged, and an unjudged id must never read as a pass.
 *
 * @param {ReviewerReport[]} reports
 * @param {{ requireUnanimous: boolean, requiredIds?: string[] }} options
 * @returns {{ verdict: 'pass' | 'fail', failing: string[], advisories: AdvisoryFinding[] }}
 */
export function combinePanel(reports, options) {
  if (reports.length === 0) {
    return { verdict: 'fail', failing: ['no reviewer returned a report'], advisories: [] };
  }

  /** @type {string[]} */
  const failing = [];
  /** @type {Set<string>} */
  const judged = new Set();
  /** @type {AdvisoryFinding[]} */
  const advisories = [];

  for (const report of reports) {
    for (const entry of report.requirements) {
      judged.add(entry.id);
      if (entry.status === 'fail') failing.push(`${entry.id}: ${entry.detail || 'no detail given'}`);
    }
    for (const problem of report.problems) failing.push(problem);
    for (const advisory of report.advisories) advisories.push(advisory);
  }

  /** @type {string[]} */
  const unjudged = [...new Set(options.requiredIds ?? [])].filter((id) => !judged.has(id)).sort();
  for (const id of unjudged) {
    failing.push(`${id} was judged by no member of the panel; an unjudged id cannot pass (DESIGN.md §1.1)`);
  }

  // A member that reported a problem has not returned a clean pass, whatever its own
  // verdict says. Disqualifying the *member* rather than vetoing the whole panel is what
  // keeps `requireUnanimous` meaningful: veto everything on any finding and the setting
  // could never change an outcome, which would make it dead configuration.
  const passes = reports.filter((report) => report.verdict === 'pass' && report.problems.length === 0).length;
  const enough = options.requireUnanimous ? passes === reports.length : passes > reports.length / 2;

  // Advisory findings never appear here. They are suggestions with a number attached, and a
  // number must not be able to hold a compliant build back or push a failing one through.
  return {
    verdict: enough && unjudged.length === 0 ? 'pass' : 'fail',
    failing: [...new Set(failing)],
    advisories: advisories
      .filter((advisory) => advisory.actionable)
      .sort(
        (a, b) =>
          ADVISORY_SEVERITIES.indexOf(b.severity) - ADVISORY_SEVERITIES.indexOf(a.severity) ||
          b.confidence - a.confidence ||
          a.id.localeCompare(b.id),
      ),
  };
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

/**
 * @typedef {{
 *   ok: boolean, text: string, costUsd: number, tokens: number, raw: string, exhausted?: boolean
 * }} ClaudeResult
 */

/**
 * Signals that a child did not fail on the merits but ran out of allowance.
 *
 * On a subscription the binding constraint is not money, it is the rate-limit window. A
 * run does not get expensive, it stalls partway through — so this has to be distinguished
 * from a child that ran and disagreed, or the loop mistakes a wall for a verdict.
 */
const EXHAUSTION_PATTERN =
  /\b(?:rate[ _-]?limit|usage[ _-]?limit|quota|too many requests|429|limit reached|resets? at)\b/i;

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
  if (parsed === null) {
    return { ok: false, text: '', costUsd: 0, tokens: 0, raw: stdout, exhausted: EXHAUSTION_PATTERN.test(stdout) };
  }

  const record = /** @type {Record<string, any>} */ (parsed);
  const usage = record.usage ?? {};
  const tokens =
    (Number(usage.input_tokens) || 0) +
    (Number(usage.output_tokens) || 0) +
    (Number(usage.cache_creation_input_tokens) || 0) +
    (Number(usage.cache_read_input_tokens) || 0);

  const ok = record.is_error === false && typeof record.result === 'string';
  return {
    ok,
    text: typeof record.result === 'string' ? record.result : '',
    costUsd: Number(record.total_cost_usd) || 0,
    tokens,
    raw: stdout,
    exhausted: !ok && EXHAUSTION_PATTERN.test(stdout),
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
 * What each phase is allowed to do, in one table so a new phase cannot inherit a blanket
 * permission bypass by being written next to one that has it.
 *
 * Only the builder gets `--dangerously-skip-permissions`. It is the one phase whose job is
 * arbitrary: install packages, run tools, restructure a tree. Everything else has a narrow
 * job and gets exactly the tools for it — the document phases write, the reading phases
 * cannot write at all. A reviewer that can edit the code it is auditing is not a cold read.
 *
 * @type {Record<string, { dangerous: boolean, allowedTools: string[] }>}
 */
export const PHASE_PERMISSIONS = {
  builder: { dangerous: true, allowedTools: [] },
  prd: { dangerous: false, allowedTools: ['Read', 'Glob', 'Grep', 'Write', 'Edit'] },
  design: { dangerous: false, allowedTools: ['Read', 'Glob', 'Grep', 'Write', 'Edit'] },
  review: { dangerous: false, allowedTools: ['Read', 'Glob', 'Grep'] },
  'reality-check': { dangerous: false, allowedTools: ['Read', 'Glob', 'Grep'] },
  // Reads the evidence it was handed and answers with a sentence or with null. It has no
  // reason to write, and lesson memory is driver-owned precisely so that it cannot.
  'lesson-extractor': { dangerous: false, allowedTools: ['Read', 'Glob', 'Grep'] },
};

/**
 * @param {string} phase
 * @returns {{ dangerous: boolean, allowedTools: string[] }}
 * @throws {DriverError} for a phase with no declared policy
 */
export function permissionsFor(phase) {
  const policy = PHASE_PERMISSIONS[phase];
  if (policy === undefined) {
    // Fail closed: an undeclared phase must not quietly default to the builder's powers.
    throw new DriverError(
      `no permission policy declared for phase ${JSON.stringify(phase)}. Add one to PHASE_PERMISSIONS ` +
        'rather than letting a new phase inherit whatever the last one had.',
    );
  }
  return policy;
}

/**
 * The environment a child runs with.
 *
 * Carries the re-entrancy marker, which is the whole point: without it a builder that
 * shells out to the driver starts a nested run and `assertNotNested` never sees it. The
 * guard hook only catches the slash command, so this is the other half of the defence
 * rather than a duplicate of it.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {Record<string, string | undefined>}
 */
export function childEnvironment(env) {
  return { ...env, [REENTRANCY_ENV]: '1' };
}

/**
 * Build the argv for a `claude -p` child.
 *
 * The prompt is deliberately **not** here. It travels on stdin, and the reason is a bug
 * that shipped: `--allowedTools` is variadic, so a prompt appended after it was parsed as
 * one more tool name and the child died with "Input must be provided either through stdin
 * or as a prompt argument". That killed every phase except `builder` — the only one whose
 * permission flag takes no operand — so no PRD was ever authored and no reviewer ever
 * answered. Reordering argv would fix today's flag and re-arm the same trap for the next
 * one. A prompt on stdin is not an operand of anything.
 *
 * It also retires two quieter hazards: `ARG_MAX` for a prompt carrying a whole template
 * plus the PRD, and a prompt that happens to begin with `--`.
 *
 * @param {{ model: string, systemPrompt?: string, phase: string }} options
 * @returns {string[]}
 */
export function claudeArgs(options) {
  const policy = permissionsFor(options.phase);
  const args = ['-p', '--output-format', 'json', '--settings', CHILD_SETTINGS, '--model', options.model];
  if (options.systemPrompt !== undefined && options.systemPrompt.length > 0) {
    args.push('--append-system-prompt', options.systemPrompt);
  }
  if (policy.dangerous) args.push('--dangerously-skip-permissions');
  else if (policy.allowedTools.length > 0) args.push('--allowedTools', ...policy.allowedTools);
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

/** @typedef {{ applied: boolean, detail: string, tokens: number, costUsd: number }} RaceOutcome */

/**
 * @typedef {{
 *   build: (brief: string) => ClaudeResult,
 *   review: (reviewer: string, ids: string[]) => ClaudeResult,
 *   realityCheck: () => ClaudeResult,
 *   extractLesson?: (evidence: string) => ClaudeResult,
 *   race?: (objective: import('./brief.mjs').Objective, iteration: number) => RaceOutcome,
 *   history?: (findings: string[]) => import('./brief.mjs').HistoryNote[],
 *   changedFiles?: () => string[],
 *   gates: () => { ok: boolean, results: GateResult[] },
 *   readTestReports: () => unknown[],
 *   commit: (message: string) => string,
 *   diffStat: () => string,
 *   ship: (iteration: number) => void,
 *   now: () => string,
 *   log: (line: string) => void,
 *   event?: (event: import('./style.mjs').StyleEvent) => void,
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
 * The phase order is the spec's, and the order is the point: build, gates, ratchet, review,
 * ship. Gates before review because they are free. Ratchet before review because a
 * regression ends the iteration whatever a reviewer would have said about the rest of it.
 *
 * What the builder receives each time round is a *compiled brief* rather than an
 * accumulated conversation (DESIGN.md §8.1). The loop carries an objective — one record
 * saying what to do and why it is what to do — and every iteration renders that objective,
 * the ratchet, the selected lessons and any history into a document that is archived before
 * it is sent. The run's memory lives in the driver's artifacts, not in a child's context.
 *
 * @param {{
 *   config: DareConfig,
 *   dareDir: string,
 *   rootDir: string,
 *   requiredIds: string[],
 *   task: string,
 *   gateNames?: string[],
 *   effects: Effects,
 * }} options
 * @returns {RunOutcome}
 */
export function driveRun(options) {
  const { config, dareDir, rootDir, requiredIds, effects } = options;

  // Settled before anything is spawned. An id no reviewer owns cannot be judged, and a
  // panel that cannot judge every id cannot produce a pass — finding that out after paying
  // for three whole-repository reads is finding it out too late (DESIGN.md §1.1).
  const panelPlan = assertOwnershipCovers(requiredIds, {
    reviewers: config.reviewers,
    ownership: config.ownership,
  });

  /** @type {RunProgress} */
  let progress = { iteration: 0, spentTokens: 0, stalledIterations: 0, bestGateScore: 0, bestPassingCount: 0 };
  let costUsd = 0;
  let builderTokens = 0;
  let builderRuns = 0;

  /** @type {import('./brief.mjs').Objective} */
  let objective = {
    kind: 'initial',
    headline: options.task,
    reason: 'this is the first iteration; nothing has been built, gated or judged yet',
  };

  /** @type {import('./lessons.mjs').IterationRecord[]} */
  const iterationHistory = [];
  /** Failures a lesson has already been attempted for, so none is paid for twice. */
  const lessonsAttempted = new Set();

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

  /**
   * Terminate on an infrastructure failure rather than a verdict.
   *
   * The work in the tree is committed first. Leaving it uncommitted would strand the run:
   * the next preflight refuses a dirty tree, so the operator would have to clean up by hand
   * before resuming. The ratchet is deliberately not advanced — this commit is a resting
   * place, not a verified good state, so `lastGoodCommit` still points at the last commit
   * that actually passed.
   *
   * @param {ClaudeResult} result
   * @param {number} iteration
   * @param {string} what
   * @returns {RunOutcome}
   */
  const landCleanly = (result, iteration, what) => {
    effects.commit(`dare: stopped during ${what} at iteration ${iteration} (work in progress)`);
    return result.exhausted
      ? finish('BUDGET', `the ${what} ran out of allowance mid-iteration; the tree is committed and the run can resume`)
      : finish('ABORTED', `the ${what} failed and returned no usable output: ${result.raw.slice(0, 400)}`);
  };

  /**
   * Everything an objective says, as one string, for keyword matching.
   *
   * @param {import('./brief.mjs').Objective} current
   * @returns {string}
   */
  const objectiveText = (current) =>
    [
      current.headline,
      current.reason,
      ...(current.gateFailures ?? []).map((gate) => `${gate.name} ${gate.detail}`),
      ...(current.regressions ?? []),
      ...(current.findings ?? []),
    ].join('\n');

  /**
   * Extract at most one lesson, from the oldest struggle not yet attempted.
   *
   * Every failure path here is a shrug. Lesson memory is advisory (DESIGN.md §13.8): it
   * informs a later brief and nothing else, so a broken extractor, an unparseable answer or
   * a store that will not write must never be able to end a run that is otherwise fine.
   *
   * @returns {void}
   */
  const maybeExtractLesson = () => {
    if (!config.lessons.enabled || effects.extractLesson === undefined) return;
    try {
      const struggle = findResolvedStruggles(iterationHistory).find((entry) => !lessonsAttempted.has(entry.key));
      if (struggle === undefined) return;
      lessonsAttempted.add(struggle.key);

      const evidence = [
        `Failure: ${struggle.key}`,
        `First observed on iteration ${struggle.introduced}; still failing after ${struggle.attempts} iteration(s).`,
        `Passing again as of iteration ${struggle.resolved}.`,
        '',
        'Files touched by each attempt, in order:',
        ...struggle.changed.map(
          (files, index) => `- attempt ${index + 1}: ${files.join(', ') || '(no files recorded)'}`,
        ),
      ].join('\n');

      const result = effects.extractLesson(evidence);
      // Charged but not acted on: this runs while an iteration is closing and returns void,
      // so it has no way to end the run. The spend still counts, and `shouldContinue` sees
      // it at the top of the next iteration — one step later than the other five sites.
      charge(result);
      if (!result.ok) return;

      const candidate = parseLessonExtraction(result.text);
      if (candidate === null) return;

      const { store, problem } = readLessons(dareDir);
      if (problem !== null) effects.log(problem);
      // The evidence is the driver's, not the extractor's. It saw those iteration numbers
      // because they were handed to it, and it has no way to know them independently.
      const outcome = addLesson(store, {
        ...candidate,
        evidence: { introduced: struggle.introduced, resolved: struggle.resolved, tests: candidate.evidence.tests },
      });
      if (outcome.added === null) return;
      saveLessons(dareDir, outcome.store);
      effects.log(`lesson ${outcome.added.id} recorded: ${outcome.added.lesson}`);
    } catch (error) {
      effects.log(`lesson extraction was skipped: ${/** @type {Error} */ (error).message}`);
    }
  };

  /**
   * Close out an iteration: record what failed, consider a lesson, and score progress.
   *
   * @param {number} iteration
   * @param {string[]} failures stable keys, so the same failure reads the same next time
   * @param {number} score
   * @param {number} passingCount
   * @returns {void}
   */
  const closeIteration = (iteration, failures, score, passingCount) => {
    iterationHistory.push({ iteration, failures, changed: effects.changedFiles?.() ?? [] });
    maybeExtractLesson();
    progress = recordProgress(progress, { gateScore: score, passingCount });
  };

  /**
   * Charge one child's spend to the run, and say whether the ceiling is now breached.
   *
   * The ceiling used to be read only by `shouldContinue`, between iterations. A child's cost
   * is not knowable until it returns, so one iteration could spend arbitrarily far past the
   * limit before anything looked: an observed run ended `2100900 of 1000000`. Charging here
   * and testing immediately bounds the overshoot to a single child rather than a whole
   * iteration.
   *
   * This is deliberately not called a cap, and `tokenCeiling` is not one. Nothing can price
   * a child before running it, so the guarantee available is "stops at the first opportunity
   * after the ceiling is crossed", not "never exceeds it".
   *
   * @param {{ tokens: number, costUsd: number }} result
   * @returns {boolean} true when the ceiling is now breached
   */
  const charge = (result) => {
    progress = { ...progress, spentTokens: progress.spentTokens + result.tokens };
    costUsd += result.costUsd;
    return progress.spentTokens >= config.tokenCeiling;
  };

  /** Worded exactly as `shouldContinue` words it, so the two exits read the same. */
  const ceilingReason = () => `token ceiling reached: ${progress.spentTokens} of ${config.tokenCeiling}`;

  for (;;) {
    const permission = shouldContinue(progress, config);
    if (!permission.continue) return finish(permission.state, permission.reason);

    const iterationNumber = progress.iteration + 1;
    effects.event?.({ kind: 'iteration', number: iterationNumber, total: config.maxIterations });
    effects.event?.({ kind: 'airtime', fractionLeft: airtimeRemaining(progress, config).fractionLeft });

    // ---- The brief: compile it, archive it, then hand it over ------------
    const stored = readLessons(dareDir);
    if (stored.problem !== null) effects.log(stored.problem);
    const relevant = config.lessons.enabled
      ? selectLessons(
          stored.store,
          { text: objectiveText(objective), tests: objective.regressions ?? [] },
          { limit: config.lessons.maxPerBrief },
        )
      : [];
    if (relevant.length > 0) {
      saveLessons(
        dareDir,
        markLessonsUsed(
          stored.store,
          relevant.map((lesson) => lesson.id),
        ),
      );
    }

    const brief = compileBrief({
      iteration: iterationNumber,
      chaos: config.chaos,
      objective,
      protectedTests: loadState(dareDir).passing,
      lessons: relevant,
      history: effects.history?.(objective.findings ?? []) ?? [],
      gates: options.gateNames ?? [],
    });
    writeBrief(dareDir, iterationNumber, brief);

    // ---- Phase 2: build, or race out of a stall (DESIGN.md §13.6) --------
    const raceDecision = shouldRace({
      config,
      progress,
      averageBuilderTokens: builderRuns === 0 ? undefined : Math.round(builderTokens / builderRuns),
    });
    let raced = false;
    if (raceDecision.race && effects.race !== undefined) {
      const outcome = effects.race(objective, iterationNumber);
      const exhausted = charge(outcome);
      effects.log(`race: ${outcome.detail}`);
      raced = outcome.applied;
      if (exhausted) return finish('BUDGET', ceilingReason());
    }

    if (!raced) {
      const built = effects.build(brief);
      builderTokens += built.tokens;
      builderRuns += 1;
      const exhausted = charge(built);
      // A child that failed is reported as a failure, not as a budget death: the run needs
      // to know which of the two it was, and the failure is the more specific answer.
      if (!built.ok) return landCleanly(built, iterationNumber, 'builder');
      if (exhausted) return finish('BUDGET', ceilingReason());
    }

    // ---- Phase 3: gates -------------------------------------------------
    const gateOutcome = effects.gates();
    const score = gateScore(gateOutcome.results);
    const failedGates = gateOutcome.results.filter((result) => !result.ok);

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
      effects.event?.({ kind: 'reset', regressions: decision.regressions.length });
      effects.log(`regression: ${decision.regressions.join(', ')}`);
      objective = {
        kind: 'regression',
        headline: 'Restore the tests listed below. Change nothing else.',
        reason:
          `the ratchet is monotonic and ${decision.regressions.length} test(s) that passed earlier no longer pass, ` +
          'so the tree was reset to the last commit that held them',
        regressions: decision.regressions,
      };
      closeIteration(iterationNumber, decision.regressions, score, state.passing.length);
      continue;
    }

    if (decision.action === 'reject') {
      effects.log(decision.reason);
      objective = {
        kind: 'no-tests',
        headline: `${options.task}\n\nBefore anything else: make the test suite run and pass.`,
        reason:
          'no test passed on the previous iteration. An empty result is not evidence that nothing regressed, so the ' +
          'ratchet cannot advance on it and nothing else can be judged. Check the runner before rewriting the ' +
          'tests: the gate collects them with `npx vitest run`, so a suite written for a runner vitest cannot ' +
          'collect reports zero tests however green `npm test` looks',
      };
      closeIteration(iterationNumber, ['ratchet:no-passing-tests'], score, 0);
      continue;
    }

    if (!gateOutcome.ok) {
      effects.log(`gates failed: ${failedGates.map((result) => result.name).join(', ')}`);
      objective = {
        kind: 'gates',
        headline: 'Make these gates pass. Nothing else this iteration.',
        reason:
          `${failedGates.length} gate(s) failed on iteration ${iterationNumber}. Gates run before the audit because ` +
          'they are free and deterministic, and there is no reason to pay for a cold read of something that does ' +
          'not compile',
        gateFailures: failedGates.map((result) => ({ name: result.name, detail: result.detail })),
      };
      closeIteration(
        iterationNumber,
        failedGates.map((result) => `gate:${result.name}`),
        score,
        passing.size,
      );
      continue;
    }

    // ---- Phase 5: review ------------------------------------------------
    // Each member is asked only about the ids it owns, and must return every one of them.
    /** @type {ReviewerReport[]} */
    const reports = [];
    for (const { reviewer, ids } of panelPlan.assignments) {
      const result = effects.review(reviewer, ids);
      const exhausted = charge(result);
      // A reviewer that died is not a reviewer that found problems. Scoring it as a
      // failing audit would hand the builder "output could not be parsed" as though it
      // were a finding, and burn the remaining iterations against a wall.
      if (!result.ok) return landCleanly(result, iterationNumber, `${reviewer} audit`);
      // Ending here abandons the reviewers that have not run. That is correct: a panel is
      // only unanimous if every member answered, so a partial panel cannot ship anyway.
      if (exhausted) return finish('BUDGET', ceilingReason());
      reports.push(
        parseReviewerReport(result.text, { requiredIds: ids, minConfidence: config.advisory.minConfidence }),
      );
    }
    const panel = combinePanel(reports, { requireUnanimous: config.requireUnanimous, requiredIds });

    // ---- Phase 6: ship, or bank the progress and hand the findings back ---
    const commit = effects.commit(
      panel.verdict === 'pass'
        ? `dare: iteration ${iterationNumber}`
        : `dare: iteration ${iterationNumber} (review outstanding)`,
    );
    const advanced = evaluateIteration(state, passing, { commit });
    if (advanced.action === 'advance') saveState(dareDir, advanced.state);

    if (panel.verdict === 'pass') {
      effects.event?.({ kind: 'ship', iteration: iterationNumber });
      effects.ship(iterationNumber);
      return finish('SHIPPED', `panel unanimous on ${requiredIds.length} requirement(s)`);
    }

    effects.log(`review outstanding: ${panel.failing.length} finding(s)`);
    objective = {
      kind: 'review',
      headline: 'Address the audit findings below.',
      reason:
        `the panel returned ${panel.failing.length} outstanding finding(s) on iteration ${iterationNumber}, and a ` +
        'run ships only when every member passes on every id it owns',
      findings: panel.failing,
      advisories: panel.advisories.map((advisory) => ({
        id: advisory.id,
        severity: advisory.severity,
        confidence: advisory.confidence,
        evidence: advisory.evidence,
        detail: advisory.detail,
        repairHint: advisory.repairHint,
      })),
    };
    closeIteration(
      iterationNumber,
      reports.flatMap((report) =>
        report.requirements.filter((entry) => entry.status === 'fail').map((entry) => `requirement:${entry.id}`),
      ),
      score,
      passing.size,
    );

    // ---- §13.3 reality-check circuit-breaker ----------------------------
    if (progress.stalledIterations === config.realityCheck.after) {
      const verdict = effects.realityCheck();
      const exhausted = charge(verdict);
      if (verdict.ok && /unbuildable/i.test(verdict.text)) {
        mkdirSync(dareDir, { recursive: true });
        writeFileSync(path.join(dareDir, 'reality-check.md'), verdict.text, 'utf8');
        return finish('ABORTED', 'the reality check found this PRD is not buildable with the code present');
      }
      if (exhausted) return finish('BUDGET', ceilingReason());
    }
  }
}

// ===========================================================================
// Keeping run state out of the target repository's history
// ===========================================================================

/** The ignore stanza a target repository needs. */
const DARE_IGNORE = [
  '',
  '# dare machine state. Never commit these: a hard reset would revert the ratchet to an',
  '# older state.json and silently drop test ids it had already earned.',
  '.dare/state.json',
  '.dare/lessons.json',
  '.dare/briefs/',
  '.dare/red-evidence.json',
  '.dare/bloopers.log',
  '.dare/test-report.json',
  '.dare/e2e-report.json',
  '.dare/playwright-installed',
  '.dare/reality-check.md',
  '',
  '# .dare/config.json is deliberately NOT ignored. It is the run settings, not machine',
  '# state, and keeping it in version control makes a run reproducible from the repo.',
  '',
  '# The driver commits with `git add -A` every iteration.',
  'node_modules/',
  '',
].join('\n');

/**
 * What `.gitignore` should become, or null when it already covers `.dare/`.
 *
 * This is the fix for a genuine hole rather than tidiness. The driver commits with
 * `git add -A`. If `.dare/state.json` were tracked, a hard reset to `lastGoodCommit` would
 * restore an *older* ratchet file, and the run would carry on having quietly forgotten
 * test ids it had already earned — a monotonicity violation with no visible symptom.
 *
 * @param {string} existing current contents, or '' when there is no .gitignore
 * @returns {string | null}
 */
export function dareIgnoreUpdate(existing) {
  // The ratchet file is the one that must never be tracked, so it is the one to test for.
  // A blanket `.dare/` counts too — someone who ignored the whole directory has already
  // covered the case, even though this stanza no longer writes it that way.
  const covered = existing
    .split('\n')
    .map((line) => line.trim())
    .some(
      (line) =>
        line === '.dare/state.json' ||
        line === '/.dare/state.json' ||
        line === '.dare/' ||
        line === '.dare' ||
        line === '/.dare' ||
        line === '/.dare/',
    );
  if (covered) return null;
  const separator = existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
  return `${existing}${separator}${DARE_IGNORE}`;
}

/**
 * @param {string} cwd
 * @returns {boolean} true when the file was changed
 */
export function ensureDareIgnored(cwd) {
  const file = path.join(cwd, '.gitignore');
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const updated = dareIgnoreUpdate(existing);
  if (updated === null) return false;
  writeFileSync(file, updated, 'utf8');
  return true;
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
 * The validation commands DoD line 3 requires a CI workflow to actually run.
 *
 * Matching is on the command text of `run:` steps. It is regex over YAML rather than a
 * parsed document because parsing YAML would mean a runtime dependency, and the question
 * being asked is narrow enough to answer without one: does any step in any workflow invoke
 * this class of command. A workflow that calls a script which calls the real command will
 * read as missing, which errs toward failing a gate — the correct direction.
 *
 * @type {{ name: string, pattern: RegExp }[]}
 */
const CI_REQUIRED_COMMANDS = [
  { name: 'build', pattern: /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?build\b/ },
  { name: 'lint', pattern: /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?lint\b|\beslint\b/ },
  { name: 'types', pattern: /\btypecheck\b|\btype-check\b|\btsc\b/ },
  { name: 'unit', pattern: /\bvitest\b|\bjest\b|node\s+--test\b|\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b/ },
  { name: 'e2e', pattern: /\bplaywright\b|\bcypress\b|\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test:)?e2e\b/ },
];

/**
 * Does this repository have CI that runs the validation set, or only a file that says CI?
 *
 * The presence check this replaces passed on an empty workflow. That is not a hypothetical:
 * a builder under pressure to satisfy a gate named `ci` will write the smallest file that
 * makes the gate stop complaining, and the smallest file that satisfies "a YAML file exists
 * under .github/workflows" runs nothing at all.
 *
 * @param {string} cwd
 * @returns {{ workflows: string[], covered: string[], missing: string[] }}
 */
export function inspectCiWorkflows(cwd) {
  const workflowDir = path.join(cwd, '.github', 'workflows');
  const workflows = existsSync(workflowDir)
    ? readdirSync(workflowDir).filter((name) => /\.ya?ml$/.test(name)).sort()
    : [];

  /** @type {string[]} */
  const steps = [];
  for (const name of workflows) {
    try {
      const contents = readFileSync(path.join(workflowDir, name), 'utf8');
      // `run:` may be a single line or a block scalar; take the whole file's text for the
      // command search and rely on the patterns being specific enough to mean something.
      steps.push(contents);
    } catch {
      // A workflow that cannot be read contributes no coverage, which fails the gate.
    }
  }
  const text = steps.join('\n');

  const covered = CI_REQUIRED_COMMANDS.filter((command) => command.pattern.test(text)).map((c) => c.name);
  const missing = CI_REQUIRED_COMMANDS.filter((command) => !covered.includes(command.name)).map((c) => c.name);
  return { workflows, covered, missing };
}

/**
 * The health endpoint's path, as it appears in the source, or null.
 *
 * @param {string} cwd
 * @returns {string | null}
 */
export function findHealthPath(cwd) {
  /** @type {string | null} */
  let found = null;
  anySourceMatches(cwd, 0, (contents) => {
    const match = contents.match(/['"`](\/(?:health|healthz|_health))\b/);
    if (match === null) return false;
    found = match[1];
    return true;
  });
  return found;
}

/**
 * The command that starts this application, or null when it declares none.
 *
 * @param {string} cwd
 * @returns {string | null}
 */
export function startCommand(cwd) {
  const manifest = path.join(cwd, 'package.json');
  if (!existsSync(manifest)) return null;
  try {
    const scripts = JSON.parse(readFileSync(manifest, 'utf8')).scripts ?? {};
    return typeof scripts.start === 'string' && scripts.start.trim() !== '' ? 'npm start' : null;
  } catch {
    return null;
  }
}

/** Where the health probe lives, resolved against this file so it works from any cwd. */
const HEALTH_PROBE = fileURLToPath(new URL('./health-probe.mjs', import.meta.url));

/**
 * Judge DoD line 4's observability half.
 *
 * Two checks with deliberately different strengths, and the difference is worth stating.
 *
 * The health endpoint is checked by *asking it*, whenever the repository declares a way to
 * start itself. "A source file contains the string /health" is satisfied by a route
 * registered after the 404 handler, by a handler that throws, and by a server that cannot
 * boot — all of which a request catches and a grep does not.
 *
 * Structured logging stays a static check, and that is a decision rather than an omission:
 * the behavioural version would be to run the application and inspect its stdout for
 * structure, which is neither cheap nor deterministic. Log output depends on level
 * configuration, on whether anything happened to log during the probe window, and on
 * transports that may write somewhere other than stdout. A logger call in source is the
 * honest proxy, and it is recorded here as a proxy rather than dressed up as evidence.
 *
 * @param {string} cwd
 * @param {{ run?: import('./plugins.mjs').Runner, probeTimeoutMs?: number }} [options]
 * @returns {GateResult}
 */
export function observabilityGate(cwd, options = {}) {
  const hasLogger = anySourceMatches(cwd, 0, (contents) =>
    /\b(pino|winston|bunyan|structuredLog|logger\.(info|warn|error))\b/.test(contents),
  );
  const healthPath = findHealthPath(cwd);

  if (!hasLogger || healthPath === null) {
    /** @type {string[]} */
    const missing = [];
    if (!hasLogger) missing.push('structured logging');
    if (healthPath === null) missing.push('health endpoint');
    return { name: 'observability', ok: false, status: 1, detail: `missing: ${missing.join(', ')}` };
  }

  const start = startCommand(cwd);
  if (options.run === undefined || start === null) {
    // Nothing declares how to start this application, so there is nothing to ask. The
    // static finding stands, and says so rather than claiming it was probed.
    return {
      name: 'observability',
      ok: true,
      status: 0,
      detail: `structured logging present; ${healthPath} declared but not probed (no start script)`,
    };
  }

  const timeout = options.probeTimeoutMs ?? 30_000;
  const probe = options.run(
    process.execPath,
    [HEALTH_PROBE, '--command', start, '--path', healthPath, '--timeout', String(timeout)],
    { cwd },
  );
  const detail = (probe.stdout || probe.stderr || `exit ${probe.status}`).trim();
  return {
    name: 'observability',
    ok: probe.ok,
    status: probe.ok ? 0 : 1,
    detail: probe.ok ? `structured logging present; ${detail}` : `health probe failed: ${detail}`,
  };
}

/**
 * The DoD gates that are a fact about the repository rather than an exit code
 * (DESIGN.md §4 lines 3 and 4).
 *
 * @param {string} cwd
 * @param {{ run?: import('./plugins.mjs').Runner, probeTimeoutMs?: number }} [options]
 * @returns {GateResult[]}
 */
export function staticGates(cwd, options = {}) {
  const ci = inspectCiWorkflows(cwd);

  const readme = isSubstantial(path.join(cwd, 'README.md'), 200);
  const contract = isSubstantial(path.join(cwd, 'docs', 'api-contract.md'), 200);

  const ciOk = ci.workflows.length > 0 && ci.missing.length === 0;

  return [
    {
      name: 'ci',
      ok: ciOk,
      status: ciOk ? 0 : 1,
      detail: ciOk
        ? `${ci.workflows.length} workflow(s) running ${ci.covered.join(', ')}`
        : ci.workflows.length === 0
          ? 'no workflow under .github/workflows'
          : `workflows exist but never run: ${ci.missing.join(', ')}`,
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
    observabilityGate(cwd, options),
    // The gates judge the builder; this one judges the gates. `npm run lint` is only worth
    // running while `lint` still means something, and the builder writes what it means.
    integrityGate(cwd),
  ];
}

/** Playwright config file names, any of which means the repo intends to run e2e. */
const PLAYWRIGHT_CONFIGS = [
  'playwright.config.js',
  'playwright.config.ts',
  'playwright.config.mjs',
  'playwright.config.cjs',
];

/**
 * @param {string} cwd
 * @returns {boolean}
 */
export function playwrightConfigPresent(cwd) {
  return PLAYWRIGHT_CONFIGS.some((name) => existsSync(path.join(cwd, name)));
}

/**
 * Install the browser the e2e gate needs, once.
 *
 * Provisioning is DESIGN.md §3.5's job — "the run installs vitest, Playwright browsers and
 * the quality plugins itself" — but it cannot happen before the loop, because on a
 * greenfield repository the Playwright config does not exist until the builder writes it.
 * So this runs before the gates each iteration and is a no-op until there is something to
 * provision for, then a no-op forever after.
 *
 * @param {{ cwd: string, dareDir: string, run: import('./plugins.mjs').Runner }} options
 * @returns {{ installed: boolean, detail: string }}
 */
export function ensurePlaywrightBrowsers(options) {
  const { cwd, dareDir, run } = options;
  if (!playwrightConfigPresent(cwd)) return { installed: false, detail: 'no playwright config yet' };
  const marker = path.join(dareDir, 'playwright-installed');
  if (existsSync(marker)) return { installed: false, detail: 'browsers already provisioned' };
  const result = run('npx', ['playwright', 'install', 'chromium'], { cwd });
  if (!result.ok) {
    return { installed: false, detail: `playwright install failed: ${(result.stderr || result.stdout).trim()}` };
  }
  mkdirSync(dareDir, { recursive: true });
  writeFileSync(marker, 'chromium\n', 'utf8');
  return { installed: true, detail: 'installed chromium for the e2e gate' };
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
 * The builder's system prompt, plus visual direction when there is a UI to direct.
 *
 * Two things make this a function rather than a string. The condition is re-asked every
 * iteration, because a greenfield repository has no frontend until the builder writes one —
 * the same mistake that kept the design gate disarmed for whole runs (DESIGN.md §5.1). And
 * both builder call sites go through here, so the raced builder and the ordinary one cannot
 * drift apart on what they were told.
 *
 * Guidance is *appended*, never inherited. A `claude -p` child picks up whatever skills the
 * operator happens to have installed, which would make a build depend on the machine it ran
 * on; what the builder was told is decided here, and versioned with the plugin.
 *
 * @param {string} cwd
 * @returns {string}
 */
export function builderSystemPrompt(cwd) {
  const base = template('builder-system.md');
  if (!hasFrontend(cwd)) return base;
  return `${base}\n\n---\n\n${template('frontend-direction.md')}`;
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
 * @param {{ cwd: string, env?: Record<string, string | undefined>, input?: string }} options
 * @returns {{ ok: boolean, status: number, stdout: string, stderr: string }}
 */
function shell(command, args, options) {
  try {
    const stdout = execFileSync(command, args, {
      cwd: options.cwd,
      // Defaults to this process's environment, so gates and git calls are unaffected.
      env: options.env ?? process.env,
      // Only the Claude children send anything; gates and git calls pass no input and are
      // left on the inherited stdin they have always had.
      ...(options.input === undefined ? {} : { input: options.input }),
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
 * The runner is injectable so that the two properties that matter about a child — the
 * permissions it is given and the environment it inherits — can be asserted without one
 * being spawned. Both have been wrong before, and neither is visible in a run's output.
 *
 * @param {{ prompt: string, model: string, systemPrompt?: string, phase: string, cwd: string,
 *   env: Record<string, string | undefined>,
 *   run?: (command: string, args: string[],
 *     options: { cwd: string, env?: Record<string, string | undefined>, input?: string }) =>
 *     { ok: boolean, status: number, stdout: string, stderr: string } }} options
 * @returns {ClaudeResult}
 */
export function spawnClaude(options) {
  const args = claudeArgs(options);
  const run = options.run ?? shell;
  // Every Claude child carries the re-entrancy marker. This is the half of the no-nesting
  // rule the guard hook cannot enforce: the hook sees tool calls, not our own children.
  // The prompt goes on stdin rather than in argv; see `claudeArgs` for the bug that cost.
  const result = run('claude', args, {
    cwd: options.cwd,
    env: childEnvironment(options.env),
    input: options.prompt,
  });
  if (!result.ok && result.stdout.trim() === '') {
    return { ok: false, text: '', costUsd: 0, tokens: 0, raw: result.stderr };
  }
  return parseClaudeEnvelope(result.stdout);
}

/**
 * The line printed before a child starts.
 *
 * Its job is to say that silence is expected. A phase that prints its name and then nothing
 * for nine minutes reads as a hang, and an operator who kills it loses the run.
 *
 * @param {string} phase
 * @param {string} model
 * @returns {string}
 */
export function childStartLine(phase, model) {
  return `${phase}: ${model} running, no output until it returns`;
}

/**
 * The line printed once a child returns. Names the phase again, because the start line may
 * be minutes and several screens back.
 *
 * @param {string} phase
 * @param {{ ok: boolean, tokens: number }} result
 * @param {number} seconds
 * @returns {string}
 */
export function childEndLine(phase, result, seconds) {
  return `${phase}: ${result.ok ? 'returned' : 'failed'} after ${seconds}s, ${result.tokens} tokens`;
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

  /**
   * Run one `claude -p` child, bracketed by the only progress an operator ever gets.
   *
   * Children are spawned with `execFileSync`, so the event loop is blocked for the whole
   * call: a periodic tick is impossible without making the entire driver async, which is a
   * rewrite rather than a fix. What is possible is the information that was actually
   * missing — which phase started, on which model, that nothing will print until it
   * returns, and how long it took once it has. An observed design phase sat silent for nine
   * and a half minutes, indistinguishable from a hung process, and the cheapest wrong
   * response to that is killing a run that was working.
   *
   * Unstyled on purpose: this is progress, and progress that lies about its own timing is
   * worse than none.
   *
   * @param {Parameters<typeof spawnClaude>[0]} options
   * @returns {ReturnType<typeof spawnClaude>}
   */
  const runChild = (options) => {
    write(verbatim(childStartLine(options.phase, options.model)));
    const startedAt = Date.now();
    const result = spawnClaude(options);
    write(verbatim(childEndLine(options.phase, result, Math.round((Date.now() - startedAt) / 1000))));
    return result;
  };

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

  // Measured before the run commits anything of its own. A repository that was empty when
  // dare arrived never has history worth quoting back at a builder, however many commits
  // dare goes on to add — those are the builder's own work, restated (DESIGN.md §8.2).
  const greenfield = !hasMeaningfulHistory({ cwd, run: shell });

  write(banner({ mode }));

  // Before anything is written, so the very first commit cannot stage machine state.
  if (ensureDareIgnored(cwd)) write(verbatim('added dare machine state to .gitignore'));

  /**
   * Commit what a phase produced.
   *
   * An interrupt between phases would otherwise strand the work: the PRD lands untracked,
   * preflight refuses the dirty tree, and the operator cannot simply resume. Observed on
   * the first real run, which was stopped after phase 0 and left `?? PRD.md` behind.
   *
   * @param {string} message
   */
  const commitPhase = (message) => {
    shell('git', ['add', '-A'], { cwd });
    shell('git', ['commit', '--no-verify', '-m', message], { cwd });
  };

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
    const authored = runChild({
      prompt: `${template('prd-author.md')}\n\n---\n\nThe idea:\n\n${idea}`,
      model: config.prdModel,
      phase: 'prd',
      cwd,
      env,
    });
    if (!authored.ok) {
      write(verbatim(`PRD authoring failed: ${authored.raw.slice(0, 800)}`));
      write(stamp('ABORTED', { mode }));
      return 1;
    }
    if (!existsSync(prdPath)) writeFileSync(prdPath, authored.text, 'utf8');
  }

  commitPhase('dare: author PRD.md');
  if (confirmPrd) {
    write(verbatim('PRD.md is written and committed. Review it, then re-run without --confirm-prd.'));
    return 0;
  }

  const prd = readFileSync(prdPath, 'utf8');
  const requiredIds = requiredIdsFor(prd);

  // ---- Phase 1: design + quality plugins --------------------------------
  write(verbatim('designing'));
  const designed = runChild({
    prompt: `${template('architect.md')}\n\n---\n\nPRD.md:\n\n${prd}`,
    model: config.designModel,
    phase: 'design',
    cwd,
    env,
  });
  if (!designed.ok) {
    write(verbatim(`design phase failed: ${designed.raw.slice(0, 800)}`));
    write(stamp('ABORTED', { mode }));
    return 1;
  }

  const provisioning = installQualityPlugins({ cwd, plugins: config.qualityPlugins, runner: shell });
  for (const warning of provisioning.warnings) write(verbatim(warning));

  commitPhase('dare: design documents');

  // ---- Phases 2-6: the loop ---------------------------------------------
  const unitReport = path.join(dareDir, UNIT_REPORT);
  const e2eReport = path.join(dareDir, E2E_REPORT);

  /** Every gate, named for the brief, so a builder is never surprised by one. */
  const gateNames = [
    ...commandGates(dareDir).map((gate) => `${gate.name}: ${gate.command.join(' ')}`),
    ...provisioning.gates.map(
      (gate) =>
        `quality:${gate.plugin}: ${gate.command.join(' ')}${gate.frontendOnly ? ' (armed once this repo renders a UI)' : ''}`,
    ),
    'ci: a workflow under .github/workflows that actually runs build, lint, types, unit and e2e',
    'docs: README.md and docs/api-contract.md, neither a stub',
    'observability: structured logging in source, and a health endpoint that answers when the app is started',
    'red-evidence: every newly passing test must have been seen failing first',
  ];

  /**
   * Gate one tree.
   *
   * Parameterised by directory rather than closed over `cwd`, because a raced candidate is
   * gated exactly like the main tree — in its own worktree, writing its own reports. The
   * one thing that stays the main tree's is the ratchet: `previousPassing` is read from the
   * driver's `.dare`, never from a candidate's, so no candidate can influence what counts
   * as a regression (DESIGN.md §13.6).
   *
   * @param {string} dir
   * @returns {{ ok: boolean, results: GateResult[], passing: Set<string> }}
   */
  const gateTree = (dir) => {
    const treeDare = path.join(dir, '.dare');
    // Arming is a question about the code, so it is asked where the code is, every
    // iteration. Resolving it once at provisioning time asked it of a repository holding a
    // PRD and nothing else, so the answer was always "no frontend" and the design gate never
    // armed on a greenfield build (DESIGN.md §5.1).
    const treeGates = [
      ...commandGates(treeDare),
      ...provisioning.gates
        .filter((gate) => !gate.frontendOnly || hasFrontend(dir))
        .map((gate) => ({ name: `quality:${gate.plugin}`, command: gate.command, required: true })),
    ];
    const browsers = ensurePlaywrightBrowsers({ cwd: dir, dareDir: treeDare, run: shell });
    if (browsers.installed) write(verbatim(browsers.detail));
    const commandResults = runGates(treeGates, { cwd: dir, run: shell });
    const previousPassing = loadState(dareDir).passing;

    /** @type {Set<string>} */
    const passing = new Set();
    /** @type {Set<string>} */
    const nonPassing = new Set();
    for (const file of [path.join(treeDare, UNIT_REPORT), path.join(treeDare, E2E_REPORT)]) {
      if (!existsSync(file)) continue;
      try {
        for (const test of parseReport(readFileSync(file, 'utf8'), { rootDir: dir }).tests) {
          (test.status === 'passed' ? passing : nonPassing).add(test.id);
        }
      } catch {
        // The ratchet reports this failure itself; the gate does not need to guess.
      }
    }
    const red = recordRedEvidence(treeDare, nonPassing);
    const results = [
      ...commandResults.results,
      ...staticGates(dir, { run: shell }),
      redEvidenceGate({ previousPassing, passing, redSeen: red }),
    ];
    return { ok: results.every((result) => result.ok), results, passing };
  };

  /**
   * Which files this iteration touched, committed or not.
   *
   * Used only as evidence for whether two repair attempts were materially different
   * (`lessons.mjs`). A gate-failing iteration has not committed anything yet, so the
   * uncommitted answer is the true one; a committed iteration has a clean tree, so the last
   * commit is.
   *
   * @returns {string[]}
   */
  const changedFiles = () => {
    const dirty = shell('git', ['diff', '--name-only', 'HEAD'], { cwd }).stdout.split('\n').filter(Boolean);
    const untracked = shell('git', ['ls-files', '--others', '--exclude-standard'], { cwd })
      .stdout.split('\n')
      .filter(Boolean);
    if (dirty.length > 0 || untracked.length > 0) return [...new Set([...dirty, ...untracked])].sort();
    return shell('git', ['diff', '--name-only', 'HEAD~1', 'HEAD'], { cwd }).stdout.split('\n').filter(Boolean).sort();
  };

  /**
   * Run one race (DESIGN.md §13.6).
   *
   * Whether to race at all was decided by `shouldRace` before this was called. This part is
   * mechanism: isolated worktrees, one builder each, gates on every candidate, a
   * deterministic winner, and cleanup on every path out — including the paths where nothing
   * won and the paths that threw.
   *
   * @param {import('./brief.mjs').Objective} objective
   * @param {number} iteration
   * @returns {RaceOutcome}
   */
  const runRace = (objective, iteration) => {
    const base = shell('git', ['rev-parse', 'HEAD'], { cwd }).stdout.trim();
    const parentDir = path.join(os.tmpdir(), `dare-race-${process.pid}-${iteration}`);
    mkdirSync(parentDir, { recursive: true });
    const created = createWorktrees({ cwd, run: shell, n: config.race.n, base, parentDir });
    for (const problem of created.problems) write(verbatim(problem));

    let tokens = 0;
    let costUsd = 0;
    try {
      if (created.worktrees.length === 0) {
        return { applied: false, detail: 'no worktree could be created; the ordinary path continues', tokens, costUsd };
      }

      const ratchetPassing = loadState(dareDir).passing;
      /** @type {import('./race.mjs').Candidate[]} */
      const candidates = [];

      for (const worktree of created.worktrees) {
        const candidateBrief = compileBrief({
          iteration,
          chaos: config.chaos,
          objective,
          protectedTests: ratchetPassing,
          gates: gateNames,
          raceCandidate: { index: worktree.index, of: created.worktrees.length },
        });
        writeBrief(dareDir, iteration, candidateBrief, worktree.index);

        const built = runChild({
          prompt: candidateBrief,
          model: config.builderModel,
          systemPrompt: builderSystemPrompt(cwd),
          phase: 'builder',
          cwd: worktree.dir,
          env,
        });
        tokens += built.tokens;
        costUsd += built.costUsd;
        if (!built.ok) {
          candidates.push({ ...worktree, commit: null, gates: [], regressions: [], filesChanged: 0 });
          continue;
        }

        shell('git', ['add', '-A'], { cwd: worktree.dir });
        shell('git', ['commit', '--no-verify', '-m', `dare: race candidate ${worktree.index} (iteration ${iteration})`], {
          cwd: worktree.dir,
        });
        const commit = shell('git', ['rev-parse', 'HEAD'], { cwd: worktree.dir }).stdout.trim();
        const gated = gateTree(worktree.dir);
        candidates.push({
          ...worktree,
          commit: commit === base ? null : commit,
          gates: gated.results,
          regressions: ratchetPassing.filter((id) => !gated.passing.has(id)),
          filesChanged: shell('git', ['diff', '--name-only', `${base}..HEAD`], { cwd: worktree.dir })
            .stdout.split('\n')
            .filter(Boolean).length,
        });
      }

      const selection = selectWinner(candidates);
      if (selection.winner === null || selection.winner.commit === null) {
        return { applied: false, detail: selection.reason, tokens, costUsd };
      }
      const merged = applyWinner({ cwd, run: shell, commit: selection.winner.commit });
      return { applied: merged.ok, detail: `${selection.reason}; ${merged.detail}`, tokens, costUsd };
    } finally {
      const cleaned = removeWorktrees({ cwd, run: shell, worktrees: created.worktrees });
      for (const problem of cleaned.problems) write(verbatim(problem));
      rmSync(parentDir, { recursive: true, force: true });
    }
  };

  /** @type {RunOutcome} */
  let outcome;
  try {
    outcome = driveRun({
    config,
    dareDir,
    rootDir: cwd,
    requiredIds,
    gateNames,
    task: `Build what PRD.md specifies. Every gate listed below must pass from the first iteration, so a missing script is a failing gate rather than an excuse.`,
    effects: {
      build: (brief) =>
        runChild({
          prompt: brief,
          model: config.builderModel,
          systemPrompt: builderSystemPrompt(cwd),
          phase: 'builder',
          cwd,
          env,
        }),
      review: (reviewer, ids) =>
        runChild({
          prompt: [
            `You are the ${reviewer} auditor, one member of a panel of ${config.reviewers.length}.`,
            '',
            'You own the ids below and must return exactly one entry for each of them. The other',
            'auditors own the rest. Do not adjudicate theirs, and do not assume anyone will cover',
            'yours — an id you leave out invalidates this audit.',
            '',
            ...ids.map((id) => `- ${id}`),
            '',
            'Read PRD.md, the documents under docs/, and the repository. Then return your report.',
          ].join('\n'),
          model: config.reviewerModel,
          systemPrompt: template('reviewer-system.md'),
          phase: 'review',
          cwd,
          env,
        }),
      realityCheck: () =>
        runChild({
          prompt:
            'Read PRD.md and the repository. Answer one question: is this PRD buildable with the code present, or ' +
            'is the loop chasing an impossible spec? Begin your answer with the single word buildable or unbuildable, ' +
            'then give your reasons.',
          model: config.reviewerModel,
          phase: 'reality-check',
          cwd,
          env,
        }),
      extractLesson: (evidence) =>
        runChild({
          prompt: `${template('lesson-extractor.md')}\n\n---\n\nThe evidence:\n\n${evidence}`,
          model: config.lessonModel,
          phase: 'lesson-extractor',
          cwd,
          env,
        }),
      race: runRace,
      history: (findings) => historyContext({ cwd, run: shell, findings, greenfield }),
      changedFiles,
      gates: () => {
        const gated = gateTree(cwd);
        return { ok: gated.ok, results: gated.results };
      },
      readTestReports: () =>
        [unitReport, e2eReport].filter((file) => existsSync(file)).map((file) => readFileSync(file, 'utf8')),
      commit: (message) => {
        // Re-asserted here rather than once before the loop: a hard reset can land on a
        // commit that predates the stanza, which would quietly un-ignore the ratchet and
        // start committing it again.
        ensureDareIgnored(cwd);
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
      event: (styleEvent) => write(render(styleEvent, { mode })),
      },
    });
  } catch (error) {
    // A ratchet that cannot be read, a reset git refuses, a report that will not parse —
    // all of them end the run, and none of them should reach the operator as a stack trace.
    write(verbatim(`${/** @type {Error} */ (error).name}: ${/** @type {Error} */ (error).message}`));
    write(render({ kind: 'terminal', state: 'ABORTED' }, { mode }));
    write(stamp('ABORTED', { mode }));
    return 1;
  }

  write(render({ kind: 'terminal', state: outcome.state }, { mode }));
  write(stamp(outcome.state, { mode }));
  write(
    verbatim(
      `${outcome.state}: ${outcome.reason}\niterations: ${outcome.iterations}  tokens: ${outcome.spentTokens}  ` +
        `cost: $${outcome.costUsd.toFixed(4)}  passing: ${outcome.passing.length}`,
    ),
  );
  return outcome.state === 'SHIPPED' ? 0 : 1;
}

const invokedDirectly =
  typeof process.argv[1] === 'string' && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  process.exitCode = main(process.argv.slice(2));
}
