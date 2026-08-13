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

import { appendAssumptions, parseAssumptions, readAssumptions, renderAssumptions } from './assumptions.mjs';
import { compileBrief, writeBrief } from './brief.mjs';
import {
  hasFrontend,
  parseCapabilityDeclaration,
  resolveCapabilities,
  writeCapabilityManifest,
} from './capabilities.mjs';
import { loadConfig } from './config.mjs';
import { checkContextBudget, measurePrompt } from './context-budget.mjs';
import { applicableGates, gateApplies } from './gate-policy.mjs';
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
import { OracleError, parseOracleCases, resolveArtifactCommand, runOracle, writeOracle } from './oracle.mjs';
import { checkNoConcurrentRun } from './preflight.mjs';
import { RUN_LOCK_FILE, claimRunLock, clearRunLock } from './run-lock.mjs';
import { installQualityPlugins } from './plugins.mjs';
import {
  applyWinner,
  createWorktrees,
  parseNumstat,
  removeWorktrees,
  selectWinner,
  shouldRace,
  stallHypothesis,
  sweepRaceWorktrees,
} from './race.mjs';
import { parseReport } from './reporters/index.mjs';
import {
  evaluateIteration,
  extractTestIds,
  formatBlooperRecord,
  hardReset,
  loadState,
  saveState,
} from './ratchet.mjs';
import {
  normaliseSnippet,
  parseEvidence,
  parseSecurityEscalation,
  pinRequirement,
  pinSecurityElement,
  quarantinePin,
  retractPin,
  readPins,
  repinSecurityElement,
  shippingBlockers,
  verifyRequirementPin,
  verifySecurityPin,
  writePins,
} from './pins.mjs';
import { RUN_MANIFEST, archivePreviousRun, buildRunManifest, writeRunManifest } from './run-manifest.mjs';
import { banner, render, stamp, styleMode, verbatim } from './style.mjs';
import { MUTATION_CONFIG, MUTATION_CONFIG_CONTENTS } from './toolchains/node.mjs';
import { CONDITIONAL_GATE_OPERATIONS, gatesFor, resolveToolchain } from './toolchains/index.mjs';

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

/** Where the panel's verdict is written. Machine state: driver-owned, never tracked. */
export const REVIEW_RECORD = 'review.json';

/**
 * What a run *ended* as, written by `finish` on every terminal path.
 *
 * `run.json` (§7.1) records what a run was at its start and is written once after the design
 * phase. Nothing recorded the ending, so the terminal state existed only in stdout — and run 4
 * proved that stdout is not durable: its log lived in the tree, `git add -A` tracked it, and the
 * ratchet's own reset reverted it. The result had to be reconstructed from `.dare/`, `git log`
 * and the reflog.
 */
export const OUTCOME_FILE = 'outcome.json';

/**
 * Persist what the panel actually decided.
 *
 * **The loop shipped a project and left no record of why.** An independent audit of the first
 * `SHIPPED` this project ever produced reported: *"I could not verify the unanimous-panel claim
 * at all — the evidence for it is not in the repo."* All that existed was `dare/GRAND-PRIZE`, an
 * unannotated lightweight tag on a commit named "iteration 2". No per-requirement verdicts, no
 * unanimity record, nothing an auditor could disagree with.
 *
 * That is a hole in the product's central claim. §1.1 exists because a cold hostile panel judges
 * better than the builder; if the judgement is not written down, "the panel passed it" is an
 * assertion by the thing being audited. `reality-check.md` is persisted, and it only ever explains
 * an `ABORTED` — the loop recorded its excuses and not its verdicts.
 *
 * Appended rather than overwritten, because the interesting sequence is how a panel's findings
 * move across iterations, and run 5's 5 → 4 → 3 convergence was visible only in a log that a
 * later reset could have destroyed.
 *
 * @param {string} dareDir
 * @param {{ iteration: number, verdict: string, requireUnanimous: boolean, requiredIds: string[],
 *           failing: string[], reviewers: unknown[], advisories: unknown[] }} entry
 * @returns {string} the path written
 */
export function recordPanelVerdict(dareDir, entry) {
  const file = path.join(dareDir, REVIEW_RECORD);
  /** @type {{ version: number, panels: unknown[] }} */
  let store = { version: 1, panels: [] };
  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8'));
      if (parsed !== null && typeof parsed === 'object' && Array.isArray(parsed.panels)) {
        store = { version: 1, panels: parsed.panels };
      }
    } catch {
      // A corrupt record is evidence lost, not a reason to stop: this file decides nothing.
      // It is rebuilt from this panel onward rather than aborting a healthy run.
    }
  }
  store.panels.push(entry);
  mkdirSync(dareDir, { recursive: true });
  writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  return file;
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
 * A gate that never *finishes* is the same failure by a slower route, and `timeoutMs` is what
 * bounds it. A test suite holding an open handle, a dev server a gate started and never
 * reaped, a browser run waiting on a selector that will not arrive — each blocks the driver's
 * event loop exactly as a hung child does, and none of them is visible while it happens.
 *
 * @param {Gate[]} gates
 * @param {{ cwd: string, run: import('./plugins.mjs').Runner, timeoutMs?: number }} options
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
    /**
     * What a failing gate actually said, from **both** streams.
     *
     * This was `stderr || stdout`, and that `||` cost a diagnosis. Two `npm warn Unknown user
     * config` lines are non-empty, so on any machine with a stray `.npmrc` key **stdout is
     * discarded entirely** — and stdout is where Stryker prints its mutation report, where
     * vitest prints its failures, where most tools put the answer. Dogfood run 14's mutation
     * failure reached the operator as nothing but two npm warnings.
     *
     * It is the same defect 0.53.0 and 0.66.0 each fixed one layer of: the diagnosis existed and
     * was unreachable on the path that needed it. Fixed here at the source rather than in the
     * renderer, so the brief handed to the builder gains it too.
     *
     * Both streams are labelled when both are present, because an error on stderr and a report
     * on stdout are different claims and concatenating them unlabelled invents a third.
     *
     * @param {{ status: number, stdout: string, stderr: string }} result
     * @returns {string}
     */
    const failureDetail = (result) => {
      const out = result.stdout.trim();
      const err = result.stderr.trim();
      if (out !== '' && err !== '') return `stderr:\n${err}\n\nstdout:\n${out}`;
      return out || err || `exit ${result.status}`;
    };
    const outcome = options.run(gate.command[0], gate.command.slice(1), {
      cwd: options.cwd,
      // Absent unless supplied, so every existing caller and test double keeps the unbounded
      // wait gates had before 0.81.0. `main` always supplies it.
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    });
    // A killed gate is distinguished from one that ran and failed, and the distinction is not
    // cosmetic: this detail is copied into the brief the builder is handed. Told `exit 1` for
    // a suite that hung, a builder goes hunting a broken assertion that does not exist. The
    // gate still fails, because a gate that cannot finish is a gate that cannot run.
    // A reaped list is named rather than swallowed. A gate that leaked a dev server and had it
    // killed is a different diagnosis from one that merely ran long, and the pids are what an
    // operator would otherwise have to go find in `ps`. Empty means the sweep ran and the gate
    // left nothing behind, which is also worth saying.
    const reaped = outcome.reaped ?? [];
    const swept =
      reaped.length === 0 ? '' : ` Killed ${reaped.length} leaked descendant(s) it left behind: ${reaped.join(', ')}.`;
    const detail =
      outcome.timedOut === true
        ? `gate ${gate.name} did not finish within ${options.timeoutMs}ms and was killed. Nothing it printed is a result.${swept}`
        : failureDetail(outcome);
    results.push({
      name: gate.name,
      ok: outcome.ok,
      status: outcome.status,
      detail: outcome.ok ? 'passed' : detail,
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
 *   iteration: number, spentTokens: number, spentUsd: number, stalledIterations: number,
 *   bestGateScore: number, bestPassingCount: number
 * }} RunProgress
 *
 * `spentUsd` sits beside `spentTokens` rather than outside the record, because a limit the
 * loop cannot read is not a limit. It used to be a bare `let` in `driveRun`, which is why
 * nothing could stop a run on cost.
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
  // Checked separately, because tokens are a bad proxy for money and the first dogfood run
  // measured how bad: 20,223,215 tokens cost $9.43, or $0.47 per million, because cache reads
  // dominated the count. The same token figure at uncached input rates would have been an
  // order of magnitude more. A token ceiling bounds *work*; only a cost ceiling bounds spend,
  // and an operator who sets one has said something the other cannot express.
  if (progress.spentUsd >= config.costCeiling) {
    return {
      continue: false,
      state: 'BUDGET',
      reason: `cost ceiling reached: $${progress.spentUsd.toFixed(4)} of $${config.costCeiling}`,
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
 * @returns {{ iterationsLeft: number, tokensLeft: number, usdLeft: number, fractionLeft: number }}
 */
export function airtimeRemaining(progress, config) {
  const iterationsLeft = Math.max(0, config.maxIterations - progress.iteration);
  const tokensLeft = Math.max(0, config.tokenCeiling - progress.spentTokens);
  const usdLeft = Math.max(0, config.costCeiling - progress.spentUsd);
  const byIterations = config.maxIterations === 0 ? 0 : iterationsLeft / config.maxIterations;
  const byTokens = config.tokenCeiling === 0 ? 0 : tokensLeft / config.tokenCeiling;
  // The tightest of the three, so the counter reports the limit that will actually end the
  // run rather than the most flattering one.
  const byUsd = config.costCeiling === 0 ? 0 : usdLeft / config.costCeiling;
  return { iterationsLeft, tokensLeft, usdLeft, fractionLeft: Math.min(byIterations, byTokens, byUsd) };
}

/**
 * The lowest allowance worth handing a child, in dollars.
 *
 * A child spawned with `0` is the dangerous case: a falsy amount is exactly the shape a
 * command-line parser is most likely to read as "unset", which would hand an out-of-money run
 * an *unbounded* child. So the floor is a real, tiny number that stops a child at once rather
 * than a zero that might not stop it at all.
 */
const MIN_CHILD_BUDGET_USD = 0.0001;

/**
 * What one child is allowed to spend, derived from what the run has left.
 *
 * **The defect this closes** (`BORROWED.md` R16, case D): `tokenCeiling` and `costCeiling` are
 * read off a returned envelope, so both bind a child that **came back**. A child in flight was
 * bounded only by `childTimeoutMs`, and the overshoot bound was therefore "one child" — which
 * run 6 priced at 14M tokens, and one measured builder spent **ten times the ceiling** before
 * returning. Accounting cannot bound a thing it can only see afterwards.
 *
 * `--max-budget-usd` is the in-flight bound the accounting cannot be. The envelope's own
 * `total_cost_usd` stays authoritative for what the run has spent; this only stops the child.
 *
 * **Only the dollar half is derived, and only the dollar half is on by default.** There is no
 * honest arithmetic from a token or dollar ceiling to a number of agentic turns, and this
 * project does not ship thresholds it cannot justify — `gateTimeoutMs` is labelled a guess in
 * its own comment rather than dressed as a measurement. So `--max-turns` is an operator lever
 * (`maxChildTurns`, default `0` = not passed) rather than an invented constant.
 *
 * The stop is approximate, by the flag's own documentation, and a child stopped mid-write
 * returns not-ok — which the loop already treats as a builder failure, the correct path.
 *
 * @param {{ costCeiling: number, maxChildTurns: number }} config
 * @param {number} spentUsd what the run has already spent
 * @returns {{ maxBudgetUsd: number, maxTurns?: number }}
 */
export function childBudget(config, spentUsd) {
  const left = config.costCeiling - spentUsd;
  // Four decimals because the flag takes dollars and a child's cost is measured in cents; more
  // precision would be a claim about accuracy the upstream stop does not have.
  const maxBudgetUsd = Math.max(MIN_CHILD_BUDGET_USD, Number(left.toFixed(4)));
  return config.maxChildTurns > 0 ? { maxBudgetUsd, maxTurns: config.maxChildTurns } : { maxBudgetUsd };
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
const CHILD_OUTPUT_STYLE = 'default';

/** The plugin's own hook registration — the single declaration of what the guard matches. */
const HOOKS_MANIFEST = fileURLToPath(new URL('../hooks/hooks.json', import.meta.url));

/** The plugin root, resolved so it carries no trailing separator. */
const PLUGIN_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

/**
 * The settings forced on every child: the default output style, and **the guard hook**.
 *
 * The guard has to be handed over explicitly, and finding out why cost this project every
 * dogfood run it has ever performed. `hooks/hooks.json` registers the guard for the
 * *operator's* Claude Code sessions. A `claude -p` child does not load it — measured on
 * 12 August 2026, a child stamped `DARE_RUNNING=1` overwrote `.dare/state.json` through
 * both Write and Bash, in dangerous and non-dangerous mode, reporting
 * `permission_denials: []`. The SessionStart half of the same plugin surface *did* reach
 * that child, which is what made the gap invisible: the plugin was demonstrably loaded.
 *
 * So every run since the guard was written has built with no guard at all. §6 says a
 * PreToolUse hook "fires regardless of permission mode", and that is true — it was never
 * the permission mode. The hook was never registered for the process it was meant to fence.
 *
 * The registration is **read from the manifest rather than restated here**, because two
 * copies of one matcher drift, and a driver denying less than the installed plugin would
 * report nothing while doing it.
 *
 * Every failure path throws. A child spawned without a guard is precisely the defect this
 * function exists to close, and `--settings` is silently ignored in `-p` mode when it fails
 * validation — so a malformed blob would drop the guard *and* the output style without a
 * word. Nothing here may degrade to a warning.
 *
 * @returns {string} the JSON for `--settings`
 */
function childSettings() {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(HOOKS_MANIFEST, 'utf8'));
  } catch (error) {
    throw new DriverError(
      `the guard hook registration at ${HOOKS_MANIFEST} could not be read (${error instanceof Error ? error.message : String(error)}). ` +
        'Refusing to spawn a child: the guard is the only limit that survives --dangerously-skip-permissions (DESIGN.md §6).',
    );
  }
  // `${CLAUDE_PLUGIN_ROOT}` is expanded by the plugin loader and by nothing else. Left in a
  // settings blob it names no file, the hook cannot run, and a hook that cannot run does not
  // deny — which fails open, silently, in the one place that must not.
  const hooks = JSON.parse(JSON.stringify(manifest.hooks).split('${CLAUDE_PLUGIN_ROOT}').join(PLUGIN_ROOT));
  const entries = hooks?.PreToolUse;
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new DriverError(`${HOOKS_MANIFEST} declares no PreToolUse hook, so a child would run unguarded`);
  }
  for (const entry of entries) {
    for (const hook of entry.hooks ?? []) {
      const command = String(hook.command ?? '');
      const script = command.slice(command.indexOf('"') + 1, command.lastIndexOf('"'));
      if (script === '' || !existsSync(script)) {
        throw new DriverError(`the guard hook command names no file on disk: ${command}`);
      }
    }
  }
  return JSON.stringify({ outputStyle: CHILD_OUTPUT_STYLE, hooks });
}

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
  // One question about one pinned defensive element: was it removed, was it moved, or can you
  // not tell. Read-only for the same reason every reviewer is — it reports, it does not fix,
  // and a child that could restore the guard itself would be judging its own repair.
  'security-escalation': { dangerous: false, allowedTools: ['Read', 'Glob', 'Grep'] },
  // **No tools at all, and that is the whole point of the phase existing.**
  //
  // The oracle author writes acceptance cases from the PRD *before any code exists* (§4.6), and
  // its independence is the only thing it has. It ran as `review` until an audit noticed it was a
  // persona this table never declared — and the consequence was worse than the tidiness point.
  // `review` carries `Read`, `Glob` and `Grep`, and the driver authors the oracle **if the store
  // is missing**, which includes a *resumed* tree where the implementation already exists. An
  // author able to read `src/` writes cases against the code it is supposed to be independent of,
  // which is the entire property gone, silently, on exactly the runs where nobody would look.
  //
  // Its input is the PRD, handed to it in the prompt. It needs to open nothing. Declaring the
  // empty set makes the held-out property structural rather than a fact about which directory the
  // run happened to start from.
  'oracle-author': { dangerous: false, allowedTools: [] },
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

/** Tools that can change a tree. A phase holding none of these has nothing for a guard to deny. */
const MUTATING_TOOLS = new Set(['Bash', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

/**
 * May this phase run in `--safe-mode`?
 *
 * **The problem.** Every `claude -p` child inherits the operator's installed-plugin SessionStart
 * injections, the project `MEMORY.md`, `userEmail` and git status — measured on 12 August, in the
 * repository *and in an empty temp directory*. Asked without tools, a child quoted this machine's
 * memory line back verbatim. Worse than context: the injected text carries **imperative
 * behavioural instructions**, and a live child once obeyed those instead of the driver's prompt,
 * answering *"What would you like me to focus on today?"* to a prompt asking for one word. §5.0
 * called this open; it is wider than "the operator's skill surface".
 *
 * It matters most at the cold panel, whose starvation is the reason the architecture exists
 * (§1.1). A reviewer handed the operator's memory is not the cold read this design promises.
 *
 * **Why it cannot simply be applied everywhere.** `--safe-mode` disables hooks — **including a
 * hook handed to it explicitly in `--settings`.** Measured: a child given safe mode *and* the
 * 0.59.0 guard still overwrote `.dare/state.json` with `permission_denials: []`. Safe mode and
 * the guard are mutually exclusive, so any phase that can write must keep the guard instead.
 * (`--bare` is not an alternative: it refuses OAuth and demands `ANTHROPIC_API_KEY`.)
 *
 * So the split is by **write capability**, and it is derived from `PHASE_PERMISSIONS` rather than
 * listed here — a hardcoded list is the enumeration defect §6 already paid for once. A phase
 * added later with write tools keeps the guard automatically; one added read-only gets the
 * isolation automatically.
 *
 * @param {string} phase
 * @returns {boolean}
 */
export function isColdPhase(phase) {
  const policy = permissionsFor(phase);
  if (policy.dangerous) return false;
  return policy.allowedTools.every((tool) => !MUTATING_TOOLS.has(tool));
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
 * @param {{ model: string, systemPrompt?: string, phase: string, effort?: string,
 *   maxBudgetUsd?: number, maxTurns?: number }} options
 * @returns {string[]}
 */
export function claudeArgs(options) {
  const policy = permissionsFor(options.phase);
  const args = ['-p', '--output-format', 'json', '--settings', childSettings(), '--model', options.model];
  // The in-flight budget bound (`childBudget`). Placed here, before the variadic
  // `--allowedTools`, for the reason the whole function is arranged around: anything after
  // that flag is read as one more tool name.
  //
  // Both are omitted when absent rather than passed as `0`, because a caller that did not ask
  // for a bound must get the behaviour it has always had. `--max-budget-usd` is documented in
  // `claude --help`; **`--max-turns` is not, in 2.1.228, and is accepted anyway** — probed
  // against the real binary, which answers "Input must be provided" for it and "unknown
  // option" for a flag that genuinely does not exist. An undocumented flag is a weaker
  // contract than a documented one, which is exactly why it is off by default.
  if (options.maxBudgetUsd !== undefined) args.push('--max-budget-usd', String(options.maxBudgetUsd));
  if (options.maxTurns !== undefined) args.push('--max-turns', String(options.maxTurns));
  // Reasoning effort, per phase. Verified against a live child rather than read from help
  // text: `low` and `max` are both accepted by `claude -p` and visibly move the thinking-token
  // count. It is placed before the variadic `--allowedTools` for the same reason the prompt is
  // on stdin — anything after that flag is read as one more tool name, which is the defect that
  // killed every phase but `builder` and bought this repository its live tier (§11.1).
  if (options.effort !== undefined && options.effort !== '') args.push('--effort', options.effort);
  // Isolation for the read-only phases, and only those. See `isColdPhase`: safe mode disables
  // hooks including the guard, so a phase that can write must keep the guard instead.
  if (isColdPhase(options.phase)) args.push('--safe-mode');
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
 *   capabilities?: () => string[],
 *   toolchainGuidance?: () => { name: string, guidance: string } | undefined,
 *   changedFiles?: () => string[],
 *   readSource?: (file: string) => string | null,
 *   securityEscalation?: (pin: import('./pins.mjs').SecurityPin) => ClaudeResult,
 *   gates: () => { ok: boolean, results: GateResult[] },
 *   shipTimeMutation?: () => { ok: boolean, detail: string },
 *   readTestReports: () => unknown[],
 *   commit: (message: string) => string,
 *   diffStat: () => string,
 *   deploy?: () => { ok: boolean, detail: string },
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
 *   unitCommand?: string | null,
 *   gateNames?: string[],
 *   alreadySpent?: { tokens: number, costUsd: number },
 *   effects: Effects,
 * }} options
 *
 * `alreadySpent` carries what Phase 0 and Phase 1 cost, because they run before this function
 * exists and their spend is otherwise invisible to it. Without it the ceiling restarts at zero
 * when the loop begins, and a run configured for 2M tokens can spend the PRD phase, the design
 * phase, and then 2M more. Observed: a design child spent 2,965,864 tokens against a 2,000,000
 * ceiling while the airtime counter reported the full budget remaining.
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

  // Seeded from what the pre-loop phases already spent, not from zero. `shouldContinue` runs
  // before the first builder, so a ceiling already exhausted by Phase 0 and Phase 1 ends the
  // run here rather than buying a whole extra budget's worth of iterations.
  /** @type {RunProgress} */
  let progress = {
    iteration: 0,
    spentTokens: options.alreadySpent?.tokens ?? 0,
    spentUsd: options.alreadySpent?.costUsd ?? 0,
    stalledIterations: 0,
    bestGateScore: 0,
    bestPassingCount: 0,
  };

  // Read once and carried, like the ratchet state. An unreadable pin store throws out of
  // `driveRun` rather than degrading to no pins: continuing would silently discard every
  // recorded guard and every carried pass, and the run would look healthier for the loss.
  const pins = readPins(dareDir);
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
  const finish = (state, reason) => {
    const outcome = {
      state,
      reason,
      iterations: progress.iteration,
      spentTokens: progress.spentTokens,
      costUsd: progress.spentUsd,
      passing: loadState(dareDir).passing,
    };
    // Every terminal path funnels through here, so this is the one door that a state added
    // later cannot forget — the same argument the context budget uses for living inside
    // `spawnClaude`.
    //
    // `run.json` records what a run *was*, at its start. Nothing recorded how it **ended**,
    // and the terminal state lived only in stdout. Dogfood run 4 is the proof that this is not
    // hypothetical: its log was inside the tree, `git add -A` tracked it, and the ratchet's own
    // `git reset --hard` reverted it — worse, git *replaces* the file, so the shell's open
    // descriptor pointed at an unlinked inode and every line after the reset went nowhere. That
    // run's terminal state had to be reconstructed from `.dare/`, `git log` and the reflog.
    //
    // Writing it here puts the answer inside the one directory a run may not edit and the
    // ratchet never rewrites. Failing to write it does **not** fail the run: this is forensics,
    // and destroying a completed run's result because its receipt could not be filed would be
    // the wrong way round. The failure is reported instead.
    try {
      writeFileSync(
        path.join(dareDir, OUTCOME_FILE),
        `${JSON.stringify({ version: 1, endedAt: effects.now(), ...outcome }, null, 2)}\n`,
        'utf8',
      );
    } catch (error) {
      effects.log(`could not write ${OUTCOME_FILE}: ${/** @type {Error} */ (error).message}`);
    }
    return outcome;
  };

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
      const outcome = addLesson(
        store,
        {
          ...candidate,
          evidence: { introduced: struggle.introduced, resolved: struggle.resolved, tests: candidate.evidence.tests },
        },
        // Grounding: a lesson may say anything about the project it watched, but it may not
        // invent a gate of this loop's. Run 6 stored one that did, and it was false throughout.
        { gateNames: options.gateNames },
      );
      if (outcome.added === null && outcome.reason.includes('calls')) effects.log(`lesson discarded: ${outcome.reason}`);
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
    progress = {
      ...progress,
      spentTokens: progress.spentTokens + result.tokens,
      spentUsd: progress.spentUsd + result.costUsd,
    };
    return progress.spentTokens >= config.tokenCeiling || progress.spentUsd >= config.costCeiling;
  };

  /**
   * Worded exactly as `shouldContinue` words it, so the two exits read the same — and naming
   * whichever ceiling actually fired, because "budget" without the reason sends an operator to
   * change the wrong number.
   */
  const ceilingReason = () =>
    progress.spentUsd >= config.costCeiling
      ? `cost ceiling reached: $${progress.spentUsd.toFixed(4)} of $${config.costCeiling}`
      : `token ceiling reached: ${progress.spentTokens} of ${config.tokenCeiling}`;

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
      // Re-asked every iteration rather than resolved once, for the same reason the design
      // gate's arming is: detection answers about the tree as it is now, and the tree changes
      // under it. The declared half is stable; the detected half is not.
      capabilities: effects.capabilities?.() ?? [],
      toolchain: effects.toolchainGuidance?.(),
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

      // ---- Phase 2c: the assumptions log (DESIGN.md §8.3) ---------------
      // A second output contract on the builder's only return channel. Unparseable output is
      // a failure rather than an absence here as everywhere else: a block that will not parse
      // is not evidence that nothing was assumed.
      const declared = parseAssumptions(built.text);
      if (declared.malformed !== '') {
        effects.log(`builder assumptions block rejected: ${declared.malformed}`);
        objective = {
          kind: 'review',
          headline: 'Your assumptions block could not be read. Emit valid json, or emit none at all.',
          reason:
            `the builder emitted an assumptions block that could not be parsed on iteration ${iterationNumber} ` +
            `(${declared.malformed}). An unreadable block is not evidence that nothing was assumed, so the ` +
            'iteration cannot be judged on it',
          findings: [declared.malformed],
        };
        // The ratchet count is the previous one, because this fails before any test report is
        // read. Reporting zero here would look like a run that lost every passing test.
        closeIteration(iterationNumber, ['assumptions:malformed'], 0, loadState(dareDir).passing.length);
        continue;
      }
      if (declared.discarded > 0) {
        // Announced rather than dropped quietly. A log that silently sheds entries reads
        // exactly like a log nothing was written to.
        effects.log(`discarded ${declared.discarded} assumption(s) that cited nothing or assumed nothing`);
      }
      if (declared.assumptions.length > 0) {
        appendAssumptions(dareDir, iterationNumber, declared.assumptions);
        effects.log(`recorded ${declared.assumptions.length} assumption(s) for the audit`);
      }
    }

    // ---- Phase 3: gates -------------------------------------------------
    const gateOutcome = effects.gates();
    const score = gateScore(gateOutcome.results);
    const failedGates = gateOutcome.results.filter((result) => !result.ok);

    // Reported the moment they are known, not only in the gate-failure branch far below, because
    // the ratchet's reset and reject paths `continue` before ever reaching it. Dogfood run 6 is
    // what that cost: the unit gate collected nothing, the ratchet read every absent id as a
    // regression, and the operator's log said `regression:` followed by 75 test names and **not
    // one word about a failing gate**. The cause was one line the loop already knew and did not
    // print. A diagnosis that exists but is unreachable on the path that needs it is not a
    // diagnosis.
    if (failedGates.length > 0) {
      effects.log(`gates failed: ${failedGates.map((result) => result.name).join(', ')}`);
      for (const line of formatGateFailure(failedGates)) effects.log(line);
    }

    // ---- Phase 4: ratchet ----------------------------------------------
    /** @type {Set<string>} */
    let passing;
    // How many tests the reports contained at all, whatever their status. The ratchet needs it
    // to tell "the runner collected nothing" from "everything failed", which are the same input
    // — an empty passing set — and opposite conclusions. Run 6 reset 75 ids over the first.
    let collected = 0;
    try {
      if (config.extractTests) {
        // Every runner's report contributes ids. A repo with both a unit suite and an
        // e2e suite has two, and the ratchet must hold both or it protects half the work.
        passing = new Set();
        for (const report of effects.readTestReports()) {
          collected += parseReport(report, { rootDir }).tests.length;
          for (const id of extractTestIds(report, { rootDir })) passing.add(id);
        }
      } else {
        passing = new Set(loadState(dareDir).passing);
        // Not report-derived, so it is not a collection failure and must not read as one.
        collected = passing.size;
      }
    } catch (error) {
      // An unreadable report is not evidence that nothing regressed.
      return finish('ABORTED', `test report could not be read: ${/** @type {Error} */ (error).message}`);
    }

    const state = loadState(dareDir);
    const decision = evaluateIteration(state, passing, { commit: null, collected });

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
          `tests: the gate collects them with \`${options.unitCommand ?? 'the toolchain unit command'}\`, so a suite ` +
          'written for a runner that command cannot collect reports zero tests however green your own test ' +
          'script looks',
      };
      closeIteration(iterationNumber, ['ratchet:no-passing-tests'], score, 0);
      continue;
    }

    if (!gateOutcome.ok) {
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

    // ---- Phase 4b: pinned security elements (DESIGN.md §4.3) ------------
    // The ratchet is monotonic on test ids and blind to defensive logic, which SCAFFOLD-CEGIS
    // measures degrading gradually across iterations. This is the same mechanism pointed at
    // that property. The cheap check runs every iteration; only an ambiguous answer costs a
    // scoped reviewer call, and only a reviewer may say "removed".
    if (pins.security.length > 0) {
      if (effects.readSource === undefined || effects.securityEscalation === undefined) {
        // Pins exist and nothing can check them. Continuing would carry every recorded guard
        // forward unverified, which is the silent loss of protection this exists to prevent.
        return finish('ABORTED', 'security elements are pinned but this run cannot re-verify them');
      }
      const readSource = effects.readSource;
      const escalate = effects.securityEscalation;
      /** @type {string[]} */
      const removedElements = [];
      let pinsChanged = false;

      for (const [index, pin] of pins.security.entries()) {
        if (verifySecurityPin(pin, readSource) === 'present') continue;
        effects.log(`pinned security element ${pin.id} at ${pin.evidence} did not re-verify; asking`);
        const call = escalate(pin);
        const exhausted = charge(call);
        const verdict = call.ok
          ? parseSecurityEscalation(call.text)
          : { finding: /** @type {const} */ ('unknown'), evidence: null, snippet: '', detail: `the escalation failed: ${call.raw}` };

        if (verdict.finding === 'removed') {
          removedElements.push(`${pin.id} at ${pin.evidence}`);
        } else if (verdict.finding === 'moved') {
          pins.security[index] = repinSecurityElement(pin, {
            evidence: verdict.evidence ?? pin.evidence,
            snippet: verdict.snippet,
            iteration: iterationNumber,
          });
          pinsChanged = true;
          effects.log(`pinned security element ${pin.id} moved to ${verdict.evidence}; re-pinned`);
        } else if (verdict.finding === 'never-was') {
          // The pin was wrong when it was created. Retracted rather than quarantined, because a
          // quarantine blocks SHIPPED forever and nothing can re-verify a guard that never
          // existed. The record and its reason stay: a protection that silently stops existing
          // is indistinguishable from one that was never there.
          pins.security[index] = retractPin(pin, verdict.detail);
          pinsChanged = true;
          effects.log(`pinned security element ${pin.id} retracted, it was never a control: ${verdict.detail}`);
        } else {
          pins.security[index] = quarantinePin(pin, verdict.detail);
          pinsChanged = true;
          // Surfaced rather than absorbed. A quarantined element blocks SHIPPED below, so the
          // run has to resolve it rather than carrying an unknown quietly to the end.
          effects.log(`pinned security element ${pin.id} quarantined: ${verdict.detail}`);
        }
        if (exhausted) {
          if (pinsChanged) writePins(dareDir, pins);
          return finish('BUDGET', ceilingReason());
        }
      }
      if (pinsChanged) writePins(dareDir, pins);

      if (removedElements.length > 0) {
        // The same path as a dropped test id, and deliberately so: this is a regression in a
        // property the run had already established.
        const target = loadState(dareDir).lastGoodCommit;
        if (target !== null) hardReset({ cwd: rootDir, commit: target });
        effects.log(`security regression: ${removedElements.join(', ')}`);
        objective = {
          kind: 'regression',
          headline: 'Restore the defensive code listed below. Change nothing else.',
          reason:
            `a cold security reviewer confirmed ${removedElements.length} previously verified defensive ` +
            'element(s) were removed. Security is monotonic here for the same reason tests are: it degrades ' +
            'gradually across iterations and no single iteration looks wrong',
          regressions: removedElements,
        };
        closeIteration(iterationNumber, removedElements, score, passing.size);
        continue;
      }
    }

    // ---- Phase 5: review ------------------------------------------------
    // Each member is asked only about the ids it owns, and must return every one of them.

    // A8's carry (`BRIEF.md` A8, deferred half). A requirement a cold reviewer already passed
    // with `file:line` evidence, whose evidenced file has not changed since, does not need
    // arguing again on an iteration that is going to fail anyway.
    //
    // **It is a pre-filter, never a replacement, and that is the load-bearing half.** A8's own
    // wording is that *the full panel still runs before a `SHIPPED` verdict*, and the reason is
    // concrete: carry enough ids and a whole reviewer is skipped, and run 10's ship was saved by
    // the **design** auditor noticing an inert `bin` that no requirement asked about. A run that
    // shipped without that reviewer looking at the final tree would have carried away the one
    // thing this architecture has that no gate can do. So a narrowed panel that says `pass`
    // buys nothing but speed on the way to a full panel, which then decides.
    const carriedPins =
      effects.readSource === undefined || !config.panelCarry.enabled
        ? []
        : pins.requirements.filter((pin) => verifyRequirementPin(pin, /** @type {(f: string) => string | null} */ (effects.readSource)) === 'carry');
    const plan = narrowedPanelPlan(panelPlan.assignments, carriedPins, requiredIds);

    /**
     * Run one panel over a set of assignments.
     *
     * @param {{ reviewer: string, ids: string[] }[]} assignments
     * @returns {{ done: true, reports: ReviewerReport[] } | { done: false, outcome: RunOutcome }}
     */
    const runPanel = (assignments) => {
      /** @type {ReviewerReport[]} */
      const collected = [];
      for (const { reviewer, ids } of assignments) {
        const result = effects.review(reviewer, ids);
        const exhausted = charge(result);
        // A reviewer that died is not a reviewer that found problems. Scoring it as a
        // failing audit would hand the builder "output could not be parsed" as though it
        // were a finding, and burn the remaining iterations against a wall.
        if (!result.ok) return { done: false, outcome: landCleanly(result, iterationNumber, `${reviewer} audit`) };
        // Ending here abandons the reviewers that have not run. That is correct: a panel is
        // only unanimous if every member answered, so a partial panel cannot ship anyway.
        if (exhausted) return { done: false, outcome: finish('BUDGET', ceilingReason()) };
        collected.push(
          parseReviewerReport(result.text, { requiredIds: ids, minConfidence: config.advisory.minConfidence }),
        );
      }
      return { done: true, reports: collected };
    };

    const first = runPanel(plan.assignments);
    if (!first.done) return first.outcome;
    /** @type {ReviewerReport[]} */
    let reports = plan.carried.length === 0 ? first.reports : [...first.reports, carriedReport(plan.carried)];
    let panel = combinePanel(reports, { requireUnanimous: config.requireUnanimous, requiredIds });

    if (plan.narrowed && panel.verdict === 'pass') {
      // The pre-filter said yes, so the answer now costs what it always cost. Nothing that
      // reaches a ship decision was carried.
      effects.log(`panel carry: ${plan.carried.length} requirement(s) were carried, and the full panel now runs before any ship`);
      const full = runPanel(panelPlan.assignments);
      if (!full.done) return full.outcome;
      reports = full.reports;
      panel = combinePanel(reports, { requireUnanimous: config.requireUnanimous, requiredIds });
    } else if (plan.narrowed) {
      effects.log(`panel carry: skipped re-review of ${plan.carried.length} requirement(s) whose evidence has not changed`);
    }

    // Written before anything acts on it, so a record exists whichever way the run then goes.
    recordPanelVerdict(dareDir, {
      iteration: iterationNumber,
      verdict: panel.verdict,
      requireUnanimous: config.requireUnanimous,
      requiredIds,
      failing: panel.failing,
      reviewers: reports,
      advisories: panel.advisories,
    });

    // ---- Phase 5b: record what this panel established (DESIGN.md §4.3) --
    // Only passes with a real file:line are pinned, which is not an extra rule — the parser
    // has already flipped any pass whose evidence is missing or shapeless.
    if (effects.readSource !== undefined) {
      const readSource = effects.readSource;
      let pinsChanged = false;

      // A8's fail-closed half. A requirement whose evidence target has vanished fails, whatever
      // the panel just said: the pass was granted because something was at that path.
      /** @type {string[]} */
      const lostEvidence = [];
      for (const pin of pins.requirements) {
        if (verifyRequirementPin(pin, readSource) === 'fail') lostEvidence.push(`${pin.id} (${pin.evidence})`);
      }
      // Anything whose evidence merely changed is dropped rather than carried, so the next
      // panel re-establishes it from scratch. Ambiguity unpins; it never carries.
      const stillValid = pins.requirements.filter((pin) => verifyRequirementPin(pin, readSource) === 'carry');
      if (stillValid.length !== pins.requirements.length) {
        pins.requirements = stillValid;
        pinsChanged = true;
      }

      for (const report of reports) {
        for (const entry of report.requirements) {
          if (entry.status !== 'pass' || entry.evidence === null) continue;
          const contents = readSource(parseEvidence(entry.evidence).file);
          if (contents === null) continue;
          const isSecurity = panelPlan.assignments.some(
            (assignment) => assignment.reviewer === 'security' && assignment.ids.includes(entry.id),
          );
          if (isSecurity) {
            const line = contents.split('\n')[parseEvidence(entry.evidence).line - 1] ?? '';
            if (normaliseSnippet(line).length === 0) continue;
            if (pins.security.some((pin) => pin.id === entry.id && pin.evidence === entry.evidence)) continue;
            pins.security.push(
              pinSecurityElement({
                id: entry.id,
                evidence: entry.evidence,
                snippet: line,
                iteration: iterationNumber,
              }),
            );
          } else {
            if (pins.requirements.some((pin) => pin.id === entry.id)) continue;
            pins.requirements.push(
              pinRequirement({ id: entry.id, evidence: entry.evidence, contents, iteration: iterationNumber }),
            );
          }
          pinsChanged = true;
        }
      }
      if (pinsChanged) writePins(dareDir, pins);

      if (lostEvidence.length > 0) {
        // Not a reset and not a pass. The panel's own verdict is overridden downward, which is
        // the only direction a pin is ever allowed to move a verdict.
        effects.log(`evidence lost for ${lostEvidence.length} previously passed requirement(s)`);
        panel.verdict = 'fail';
        panel.failing = [
          ...panel.failing,
          ...lostEvidence.map(
            (entry) => `${entry}: the file this requirement was passed on no longer exists, so the pass cannot stand`,
          ),
        ];
      }
    }

    // ---- Phase 6: ship, or bank the progress and hand the findings back ---
    const commit = effects.commit(
      panel.verdict === 'pass'
        ? `dare: iteration ${iterationNumber}`
        : `dare: iteration ${iterationNumber} (review outstanding)`,
    );
    const advanced = evaluateIteration(state, passing, { commit, collected });
    if (advanced.action === 'advance') saveState(dareDir, advanced.state);

    // Quarantine is not free, and this is the whole of what makes that true rather than a
    // slogan. A quarantined element is protection the run knows it has lost track of, and
    // shipping over it is the run absorbing dropped security silently (DESIGN.md §4.3).
    const blockers = shippingBlockers(pins);
    if (panel.verdict === 'pass' && blockers.length > 0) {
      effects.log(`cannot ship: ${blockers.length} quarantined security element(s)`);
      objective = {
        kind: 'review',
        headline: 'Restore or replace the quarantined defensive code below, so it can be verified again.',
        reason:
          `the panel passed, but ${blockers.length} pinned security element(s) are quarantined: a cold reviewer ` +
          'could not tell whether they were removed or moved. A quarantined element is a recorded loss of ' +
          'protection, and a run may not ship while one stands',
        findings: blockers,
      };
      closeIteration(iterationNumber, blockers, score, passing.size);
      continue;
    }

    // A panel that passed is a judgement about the code. It is not evidence that the suite the
    // judgement leaned on can fail at all, and the first SHIPPED this project produced had none.
    let sensitivity = suiteSensitivityEvidence(gateOutcome, loadRedEvidence(dareDir));

    // The driver runs the mutation gate itself rather than asking for something impossible.
    //
    // **The contradiction this removes** (0.56.0, measured in run 9 at 7.5M tokens and about
    // $6 of entirely wasted iteration): the objective below says *"prove the test suite can
    // fail"* and names the escape — *"changing any first-party source makes the mutation gate
    // apply again"* — while chaos 1 in the same brief says *"every changed line must trace
    // directly to this objective"*. On an already-correct tree those point in opposite
    // directions: no surgical edit to `src/` traces to "prove your tests can fail". Run 9's
    // builder did the only other reasonable thing and wrote another test, and `TEST_LIKE_RE`
    // means a test file can never arm the mutation gate. The instruction had no legal move.
    //
    // It is asked **only here** — after a passing panel, once, at the moment the answer is
    // worth paying for — and never on an ordinary iteration, where per-file scoping already
    // costs what it should.
    if (panel.verdict === 'pass' && !sensitivity.proven && effects.shipTimeMutation !== undefined) {
      const attempt = effects.shipTimeMutation();
      effects.log(`ship-time mutation: ${attempt.detail}`);
      if (attempt.ok) sensitivity = { proven: true, how: attempt.detail };
      else sensitivity = { proven: false, how: attempt.detail };
    }

    if (panel.verdict === 'pass' && !sensitivity.proven) {
      effects.log(`cannot ship: ${sensitivity.how}`);
      objective = {
        kind: 'review',
        headline: 'Prove the test suite can fail before this ships.',
        reason:
          `the panel passed, but ${sensitivity.how}. A suite nothing has shown to be capable of failing ` +
          'cannot support a claim that the work is done, so the ship is withheld rather than the ' +
          'iteration failed. Changing any first-party source makes the mutation gate apply again',
        findings: [sensitivity.how],
      };
      closeIteration(iterationNumber, ['ship:unproven-suite'], score, passing.size);
      continue;
    }

    if (panel.verdict === 'pass') {
      // The deploy runs **here**, in front of the ship, and that position is the whole fix.
      // Until 0.63.0 it lived inside `ship()` — after the dare/GRAND-PRIZE tag was already
      // written — and its failure was printed and ignored, so a run could announce a grand
      // prize having deployed nothing. A deploy that cannot withhold the tag is not evidence
      // about the tag (DESIGN.md §10.1).
      const deployed = effects.deploy?.() ?? { ok: true, detail: 'no deploy configured' };
      if (!deployed.ok) {
        // Withheld, not failed — the same shape as the unproven-suite check above. A blinking
        // network or a box that is down is not a reason to `git reset --hard` a tree that
        // just passed a unanimous panel. The work stands; the claim that it is deployed does
        // not.
        effects.log(`cannot ship: ${deployed.detail}`);
        objective = {
          kind: 'review',
          headline: 'The deploy did not come up clean.',
          reason:
            `the panel passed, but ${deployed.detail}. A ship is a claim that this runs where it was ` +
            'sent, so the ship is withheld rather than the iteration failed',
          findings: [deployed.detail],
        };
        closeIteration(iterationNumber, ['ship:deploy'], score, passing.size);
        continue;
      }
      if (deployed.detail !== 'no deploy configured') effects.log(deployed.detail);
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

/**
 * Every `.dare/` path that must never be tracked.
 *
 * `pins.json` and `assumptions.json` were missing from this list, and `pins.json` is the
 * serious one. `CLAUDE.md` names three monotonic properties, and that file holds **two** of
 * them — pinned security elements and cold-passed requirements. Tracked, a
 * `git reset --hard` to `lastGoodCommit` restores an older copy, so a pin earned since that
 * commit is silently gone and a recorded quarantine along with it. That is the exact failure
 * the comment below has always described for `state.json`, in the file where the invariant
 * says a false negative is unrecoverable.
 *
 * Found by reading a real repository's `git ls-files .dare` before deliberately triggering a
 * hard reset. Both files were tracked there.
 */
export const DARE_IGNORED_PATHS = [
  '.dare/state.json',
  '.dare/lessons.json',
  '.dare/briefs/',
  '.dare/red-evidence.json',
  '.dare/bloopers.log',
  '.dare/test-report.json',
  '.dare/e2e-report.json',
  '.dare/playwright-installed',
  '.dare/reality-check.md',
  '.dare/pins.json',
  '.dare/assumptions.json',
  '.dare/review.json',
  // Added at 0.68.0 and its ignore entry forgotten until 0.77.0, which is §4.3's defect
  // reproduced by the person who documented it: an artifact tracked by git is restored by
  // `git reset --hard`, so the record of how a run ended would be replaced by an older run's.
  '.dare/outcome.json',
  // The run lock. Tracking it would be worse than pointless: a `git reset --hard` would restore
  // some other run's pid into the file this run is holding, and the next run would then refuse
  // to start on the word of a process that has not existed for days.
  `.dare/${RUN_LOCK_FILE}`,
  // The run manifest, missing until 0.86.0 — the third instance of this exact defect after
  // `state.json` and `outcome.json`, and the first found by watching a live run rather than by
  // reading. `?? .dare/run.json` sat in the target's `git status` one `git add -A` from being
  // committed into the repository the run is supposed to be shipping.
  `.dare/${RUN_MANIFEST}`,
  // Not `.dare/` state, and here for a reason measured in dogfood run 4. The operator redirects
  // the run's output into the repository — `DOGFOOD.md` said to — so `git add -A` tracked it, and
  // the hard reset in iteration 2 **reverted the log to its state at `lastGoodCommit`**. That
  // destroys the record of the reset itself. Worse, git replaces the file rather than truncating
  // it, so the shell's open descriptor was left pointing at an unlinked inode and *every line
  // written afterwards went nowhere* — the run's terminal state is unrecoverable. Ignored, the
  // log is never tracked, the reset never touches it, and the descriptor survives.
  '*.log',
];

/** The explanation that goes above them. */
const DARE_IGNORE_HEADER = [
  '',
  '# dare machine state. Never commit these: a hard reset would revert them to an older copy',
  '# and silently drop protection already earned - test ids from state.json, and the pinned',
  '# security elements and cold-passed requirements from pins.json.',
];

/** Written only when the file does not already mention the settings carve-out. */
const DARE_IGNORE_CONFIG_NOTE = [
  '',
  '# .dare/config.json is deliberately NOT ignored. It is the run settings, not machine',
  '# state, and keeping it in version control makes a run reproducible from the repo.',
];

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
  const lines = existing.split('\n').map((line) => line.trim());

  // A blanket `.dare/` covers everything — someone who ignored the whole directory has already
  // handled the case, even though this stanza no longer writes it that way.
  if (['.dare/', '.dare', '/.dare', '/.dare/'].some((form) => lines.includes(form))) return null;

  // Every path is checked, not just the ratchet. Testing only for `state.json` meant a
  // repository written by an older build kept its incomplete stanza **forever**: the check
  // passed, nothing was appended, and `pins.json` stayed trackable. An all-or-nothing check on
  // a list that later grows is a check that stops covering its own list.
  const missing = DARE_IGNORED_PATHS.filter((entry) => !lines.includes(entry) && !lines.includes(`/${entry}`));
  const needsNodeModules = !lines.includes('node_modules/') && !lines.includes('node_modules');
  if (missing.length === 0 && !needsNodeModules) return null;

  /** @type {string[]} */
  const stanza = [];
  if (missing.length > 0) stanza.push(...DARE_IGNORE_HEADER, ...missing);
  if (missing.length > 0 && !existing.includes('.dare/config.json is deliberately NOT ignored')) {
    stanza.push(...DARE_IGNORE_CONFIG_NOTE);
  }
  if (needsNodeModules) {
    stanza.push('', '# The driver commits with `git add -A` every iteration.', 'node_modules/');
  }
  stanza.push('');

  const separator = existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
  return `${existing}${separator}${stanza.join('\n')}`;
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

/** Where the RED evidence lives. The runner report paths belong to the toolchain (§3.8). */
export const RED_EVIDENCE = 'red-evidence.json';

/**
 * The gates that are just an exit code.
 *
 * The commands themselves come from the resolved toolchain (§3.8) rather than being written
 * here, so that teaching the loop a second stack is a new adapter and not an edit to the
 * driver. The unit gate writes its reporter output where the ratchet will look for it,
 * because a run whose tests passed but produced no machine-readable report gives the ratchet
 * nothing to hold — and the ratchet is what makes the loop terminate.
 *
 * A toolchain that declares an operation not-applicable produces no gate for it. That is the
 * one sanctioned way a gate can be absent, it requires a stated reason, and the reason is
 * surfaced by {@link gateSummary} rather than being swallowed.
 *
 * @param {string} root the tree being gated
 * @param {string} dareDir where that tree's reports are written
 * @returns {Gate[]}
 */
export function commandGates(root, dareDir) {
  return gatesFor(resolveToolchain(root).toolchain, { root, dareDir }).gates;
}

/**
 * The second gate pass: gates that run only once every gate in the first pass has passed.
 *
 * The ordering is the whole of A5's change. Mutation testing is slow, and running it beside
 * `build` on an iteration that does not compile spends minutes to learn nothing. Its verdict
 * is also not monotonic the way the rest of Phase 3 is — surviving-mutant counts vary with
 * which files changed — so it does not belong in the flat list where every entry is comparable.
 *
 * @param {string} root
 * @param {string} dareDir
 * @param {string[] | undefined} changedFiles measured from the last ratchet-advancing commit,
 *   or `undefined` when no such commit exists yet — a distinction the consuming gate reports as
 *   a different sentence, because "no baseline" and "nothing changed" are different facts
 * @returns {{ gates: Gate[], skipped: { name: string, reason: string }[] }}
 */
export function conditionalCommandGates(root, dareDir, changedFiles) {
  return gatesFor(
    resolveToolchain(root).toolchain,
    { root, dareDir, changedFiles },
    CONDITIONAL_GATE_OPERATIONS,
  );
}

/**
 * Files changed since the last commit the ratchet advanced on.
 *
 * Measured from there rather than from the previous iteration, and the difference decides
 * whether a scoped gate means anything: a regression iteration changes only the repair, so a
 * diff against the last iteration would hand the gate an almost empty set and it would report
 * a clean pass over nothing. The ratchet-advancing commit is the last point the run agreed the
 * code was good, which is the honest baseline for "what has this run put at risk since".
 *
 * A missing baseline yields an empty list rather than the whole tree. The gate that consumes
 * it declines on an empty set with a stated reason, which is a louder and more accurate
 * outcome than mutating an entire repository on iteration 1.
 *
 * @param {{ cwd: string, since: string | null, run?: typeof shell }} options
 * @returns {string[]}
 */
export function changedSince(options) {
  if (options.since === null) return [];
  const run = options.run ?? shell;
  /** @param {{ ok: boolean, stdout: string }} result */
  const lines = (result) =>
    result.ok
      ? result.stdout
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line !== '')
      : [];
  const tracked = lines(run('git', ['diff', '--name-only', options.since, '--'], { cwd: options.cwd }));
  // `git diff` lists tracked changes only, and gates run **before** the iteration's commit —
  // so until 0.64.0 every brand-new file an iteration created was invisible here. A builder
  // that satisfied its objective by adding a module drew the same "nothing changed since the
  // last ratchet-advancing commit" as one that did nothing, and the mutation gate declined
  // over work sitting in the tree. Found in dogfood run 9, where the objective was "prove the
  // suite can fail" and the builder's answer was a new test file nothing counted.
  //
  // `--exclude-standard` so ignored files stay ignored: `node_modules` and build output are
  // not this iteration's work, and mutating them is not a thing anybody wants.
  const untracked = lines(run('git', ['ls-files', '--others', '--exclude-standard'], { cwd: options.cwd }));
  // A failed listing degrades to fewer files rather than none: the gate then scopes to less
  // and says so, which is the recoverable direction. Losing the tracked half because the
  // second command failed would be the loud one.
  return [...new Set([...tracked, ...untracked])];
}

/**
 * Write the driver-owned mutation configuration.
 *
 * It lives under `.dare/` because the builder must not be able to weaken it, and it exists at
 * all because Stryker has no `--thresholds.*` flag: `thresholds.break` defaults to null, and a
 * run with surviving mutants then exits 0. Measured, not assumed — see `node.mjs`.
 *
 * @param {string} dareDir
 * @returns {string} the path written
 */
export function writeMutationConfig(dareDir) {
  mkdirSync(dareDir, { recursive: true });
  const file = path.join(dareDir, MUTATION_CONFIG);
  writeFileSync(file, `${JSON.stringify(MUTATION_CONFIG_CONTENTS, null, 2)}\n`, 'utf8');
  return file;
}

/**
 * The gate commands, written into the architect's prompt.
 *
 * `templates/architect.md` tells the architect: *"The test gates you write into `CLAUDE.md` are
 * the gates the run will actually execute. Do not list one you cannot run."* **That sentence was
 * false**, and dogfood run 6 is what it cost. The design phase received `architect.md` plus the
 * PRD and nothing else — no toolchain, no gate list — so the architect could not know the unit
 * gate collects with vitest. Reading a PRD that said the tool was satisfiable with the Node
 * standard library, it wrote a `CLAUDE.md` forbidding every dependency **including vitest by
 * name**, which the builder then treated as binding. The builder flagged the contradiction in
 * writing on iteration 1 and predicted the outcome; six iterations later the suite was reverted
 * to `node --test`, the report collected nothing, and 75 protected ids were destroyed.
 *
 * A promise the loop makes to the architect has to be one the loop keeps. Supplying the resolved
 * commands is the whole of the fix: the architect cannot forbid what it can see is required.
 *
 * @param {{ name: string, command: string[] }[]} gates
 * @returns {string} empty when there are no gates to describe
 */
export function architectGateFragment(gates) {
  if (gates.length === 0) return '';
  const lines = gates.map((gate) => `- \`${gate.name}\`: \`${gate.command.join(' ')}\``);
  const unit = gates.find((gate) => gate.name === 'unit');
  return [
    '## The gates this run will actually execute',
    '',
    'Resolved for this repository, before you design anything. These are the commands the loop',
    'runs verbatim — they are not suggestions, and nothing you write changes them.',
    '',
    ...lines,
    '',
    unit === undefined
      ? 'This toolchain declines the unit gate, so no test ids are collected at all.'
      : `**Test ids come only from \`${unit.command.join(' ')}\`.** A suite that command cannot ` +
        'collect scores zero however the project defines its own test script, and the ratchet ' +
        'cannot advance on zero.',
    '',
    '**Do not write a CLAUDE.md that forbids what these commands require.** A project rule',
    'banning the dependency the unit gate runs on cannot be satisfied and cannot be escaped: the',
    'builder will obey your document, the gate will collect nothing, and the run will make no',
    'progress. If a rule and a gate conflict, the gate wins, so do not write the rule.',
  ].join('\n');
}

/**
 * Iteration 1's objective, which has to carry one fact the brief already states elsewhere.
 *
 * **Which runner the unit gate collects with has now been missed on every greenfield scenario
 * this project has ever run** — twice on 10 August 2026 and again on run 6, where a builder
 * spent 978 seconds and 14 million tokens writing a correct `node --test` suite that the gate
 * collected nothing from. Each miss costs a whole iteration, and the loop recovers only on the
 * next one, via the `no-tests` objective.
 *
 * The brief does say it. It says it well, in the toolchain section — third bullet, between the
 * one about defining npm scripts and the one about module systems. That placement is the
 * defect: it is the single most consequential sentence in the brief and it reads like trivia
 * about layout. So iteration 1's objective now names the command too. Repetition is cheap; an
 * iteration is not.
 *
 * The command is derived from the resolved toolchain rather than written here, so a second
 * toolchain gets a true sentence instead of a Node one.
 *
 * @param {string | null} unitCommand the unit gate's command line, or null when it has none
 * @returns {string}
 */
export function firstIterationTask(unitCommand) {
  const base =
    'Build what PRD.md specifies. Every gate listed below must pass from the first iteration, ' +
    'so a missing script is a failing gate rather than an excuse.';
  if (unitCommand === null || unitCommand === '') return base;
  return (
    `${base} Test ids come only from \`${unitCommand}\`: a suite that command cannot collect ` +
    'scores zero however green your own test script looks, and the ratchet cannot advance on zero.'
  );
}

/**
 * @param {string} root
 * @param {string} dareDir
 * @returns {string | null} the unit gate's command line, or null when the toolchain declines it
 */
export function unitGateCommand(root, dareDir) {
  const found = gateSummary(root, dareDir).gates.find((gate) => gate.name === 'unit');
  return found === undefined ? null : found.command.join(' ');
}

/**
 * Every gate a toolchain will run, and every operation it has declined, with reasons.
 *
 * Two lists rather than one because they are read for different purposes: the gates go to the
 * builder as work it must satisfy, and the skips go to the operator as claims to check. A
 * skip that never reaches either audience is a silent one.
 *
 * @param {string} root
 * @param {string} dareDir
 * @returns {{ toolchain: string, detected: boolean, evidence: string, gates: Gate[], skipped: { name: string, reason: string }[] }}
 */
export function gateSummary(root, dareDir) {
  const resolved = resolveToolchain(root);
  const { gates, skipped } = gatesFor(resolved.toolchain, { root, dareDir });
  return {
    toolchain: resolved.toolchain.name,
    detected: resolved.detected,
    evidence: resolved.evidence,
    gates,
    skipped,
  };
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
 * Does this repository have CI that runs the validation set, or only a file that says CI?
 *
 * The presence check this replaces passed on an empty workflow. That is not a hypothetical:
 * a builder under pressure to satisfy a gate named `ci` will write the smallest file that
 * makes the gate stop complaining, and the smallest file that satisfies "a YAML file exists
 * under .github/workflows" runs nothing at all.
 *
 * Which commands count comes from the resolved toolchain (§3.8), and that is a fix rather
 * than a tidy-up. The list used to live here and accepted `node --test` for the unit step
 * while the unit *gate* ran `npx vitest run` — so a workflow could satisfy CI with a runner
 * the gate cannot collect from. One source now, and a test asserting each pattern matches its
 * own operation's command.
 *
 * The required list is then filtered by the same capability table as the gates themselves
 * (§4.2), and that filter is a defect fix observed live. `toolchain.ci` requires a Playwright
 * step unconditionally, so on an api/persistent-storage project — one whose `e2e` *gate* had
 * just been declined as inapplicable, with a written reason printed to the operator — the `ci`
 * gate went on demanding a browser runner the project has no use for. It cannot be satisfied
 * honestly, so a builder satisfies it dishonestly: dogfood run 2's `.dare/assumptions.json`
 * records the builder reasoning about exactly this contradiction and resolving it with
 * `npx playwright test` under `continue-on-error: true`, which run 3's cold panel then reported
 * as "a step that always reports success by construction". The loop manufactured the defect it
 * caught. This is the same shape as the bug §4.2 was written to fix, surviving in the CI
 * command list because item 5 filtered the gate table and not this.
 *
 * `capabilities` is optional and omitting it filters nothing, which is the safe direction: a
 * caller that forgets over-applies CI rather than silently dropping a required step. Passing
 * `[]` is a different statement — a project with no capabilities at all — and does filter.
 *
 * @param {string} cwd
 * @param {readonly string[] | null} [capabilities] the resolved set (§3.7), or null for no filter
 * @returns {{ workflows: string[], covered: string[], missing: string[],
 *            excluded: { operation: string, why: string }[] }}
 */
export function inspectCiWorkflows(cwd, capabilities = null) {
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

  const declared = resolveToolchain(cwd).toolchain.ci;

  /** @type {{ operation: string, why: string }[]} */
  const excluded = [];
  const required = declared.filter((entry) => {
    if (capabilities === null) return true;
    const verdict = gateApplies(entry.operation, capabilities);
    if (!verdict.applies) excluded.push({ operation: entry.operation, why: verdict.why });
    return verdict.applies;
  });

  const covered = required.filter((entry) => entry.pattern.test(text)).map((entry) => entry.operation);
  const missing = required.filter((entry) => !covered.includes(entry.operation)).map((entry) => entry.operation);
  return { workflows, covered, missing, excluded };
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
 * Asked of the toolchain (§3.8), because "how do I start this" has no answer that is true of
 * every stack — and a health probe pointed at the wrong start command reports a dead service
 * that is merely unstarted.
 *
 * @param {string} cwd
 * @returns {string | null}
 */
export function startCommand(cwd) {
  return resolveToolchain(cwd).toolchain.startCommand(cwd);
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
 * @param {{ run?: import('./plugins.mjs').Runner, probeTimeoutMs?: number,
 *          capabilities?: readonly string[] | null }} [options]
 *        `capabilities` filters which CI steps are required, exactly as it filters the gates
 *        themselves; omitting it requires all of them. See `inspectCiWorkflows`.
 * @returns {GateResult[]}
 */
/**
 * The held-out oracle as a gate (A3, `DESIGN.md` §4.6 — now written).
 *
 * Off unless `oracle.enabled`, because a case that invents a requirement the specification does
 * not decide becomes a gate the builder cannot satisfy — and it cannot tell an invention from a
 * real requirement. Staged rather than imposed until a run has measured it.
 *
 * Every failure is a failure. A missing store, an unreadable one, and a project with no declared
 * entry point all fail with the reason named; none of them declines. The store is only missing if
 * authoring did not happen, which is a driver fault the operator needs to see rather than a
 * condition to shrug at.
 *
 * @param {string} cwd
 * @param {string} dareDir
 * @param {{ run?: import('./plugins.mjs').Runner }} [options]
 * @returns {GateResult}
 */
export function oracleGate(cwd, dareDir, options = {}) {
  const command = resolveArtifactCommand(cwd);
  if (command === null) {
    return {
      name: 'oracle',
      ok: false,
      status: 1,
      detail:
        'no runnable entry point: package.json declares no `bin`, so there is nothing for the held-out ' +
        'cases to invoke. A declared bin is what a user actually runs, and a build whose bin is absent ' +
        'or inert passes every other gate here (run 10).',
    };
  }
  return runOracle({ dareDir, root: cwd, command, run: options.run ?? shell });
}

/**
 * @param {string} cwd
 * @param {{ run?: import('./plugins.mjs').Runner, capabilities?: string[] | null, probeTimeoutMs?: number, dareDir?: string, oracle?: boolean }} [options]
 * @returns {GateResult[]}
 */
export function staticGates(cwd, options = {}) {
  const ci = inspectCiWorkflows(cwd, options.capabilities ?? null);

  const readme = isSubstantial(path.join(cwd, 'README.md'), 200);
  const contract = isSubstantial(path.join(cwd, 'docs', 'api-contract.md'), 200);

  const ciOk = ci.workflows.length > 0 && ci.missing.length === 0;

  // A requirement that was dropped is reported next to the ones that were met. An operator
  // reading `running build, lint, types, unit` has no way to tell a project that needs four
  // steps from one that needs five and is being let off the fifth.
  const notRequired =
    ci.excluded.length > 0
      ? `; not required here: ${ci.excluded.map((entry) => `${entry.operation} (${entry.why})`).join('; ')}`
      : '';

  return [
    {
      name: 'ci',
      ok: ciOk,
      status: ciOk ? 0 : 1,
      detail: ciOk
        ? `${ci.workflows.length} workflow(s) running ${ci.covered.join(', ')}${notRequired}`
        : ci.workflows.length === 0
          ? 'no workflow under .github/workflows'
          : `workflows exist but never run: ${ci.missing.join(', ')}${notRequired}`,
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
    // A3. Present only when armed *and* the driver supplied a `.dare` to read from. Both are
    // required rather than one, because an oracle with nowhere to read from would report a clean
    // pass over nothing, and this is the one gate whose entire value is being independent of
    // everything the builder wrote.
    ...(options.oracle === true && options.dareDir !== undefined
      ? [oracleGate(cwd, options.dareDir, options)]
      : []),
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
 * **It also declines when the `e2e` gate does not apply**, which was observed rather than
 * reasoned: dogfood run 3 logged `installed chromium for the e2e gate` one line after logging
 * that the e2e gate does not apply to that project. It downloaded a browser to satisfy a gate it
 * had already decided not to run — because the only question asked was whether a Playwright config
 * exists, and one existed for a reason that has since been fixed (the `ci` gate demanded a
 * Playwright step from a browserless project, §4.2). Harmless, but it is minutes and disk spent on
 * nothing, and it is the §4.2 provisioning seam paying out exactly as predicted.
 *
 * `capabilities` is optional, and omitting it provisions as before. That is the safe direction
 * here for the opposite reason to the CI filter: a missing browser makes a gate that *does* apply
 * fail on its absence, so over-provisioning wastes time while under-provisioning fails a run.
 *
 * @param {{ cwd: string, dareDir: string, run: import('./plugins.mjs').Runner,
 *          capabilities?: readonly string[] | null }} options
 * @returns {{ installed: boolean, detail: string }}
 */
export function ensurePlaywrightBrowsers(options) {
  const { cwd, dareDir, run } = options;
  const capabilities = options.capabilities ?? null;
  if (capabilities !== null) {
    const verdict = gateApplies('e2e', capabilities);
    if (!verdict.applies) return { installed: false, detail: `no browser needed: ${verdict.why}` };
  }
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
 * Has anything demonstrated that this suite is capable of failing?
 *
 * **The first `SHIPPED` this project produced had no such demonstration.** Its
 * `red-evidence.json` recorded `seenFailing: []` — all 79 credited ids admitted by the
 * first-gating baseline, not one ever observed red — and on the very iteration that shipped the
 * mutation gate declined, because no first-party source had changed since the last ratchet
 * advance. **Both mechanisms that exist to prove a suite bites were absent from the iteration
 * that made the claim.** An independent audit had to mutate the code itself to establish what
 * the loop should have established.
 *
 * That is not an accusation against the tests — 15 of 15 mutations were killed, so they were
 * good. It is that `SHIPPED` asserted something nothing had checked.
 *
 * Two proofs are accepted, and either is enough:
 *
 * - **the mutation gate passed**, which is direct evidence the tests are sensitive to the code;
 * - **something was observed failing**, which is weaker but non-vacuous — a suite that has gone
 *   red is a suite that can.
 *
 * The per-id form — *every* credited id must have red history — is deliberately **not** required.
 * That is the red-evidence deadlock 0.39.0 removed: a greenfield project whose tests pass first
 * time can never produce it, and a bar no correct project can clear is the defect class this
 * codebase keeps rediscovering. This is a floor, and it is honest about being one.
 *
 * It blocks the *ship*, never the iteration, and it is satisfiable by ordinary work: the mutation
 * gate declines only when an iteration changed no first-party source, so the next iteration that
 * touches anything runs it.
 *
 * @param {{ results: GateResult[] }} gateOutcome this iteration's gate results
 * @param {{ seenFailing: Set<string> }} redEvidence
 * @returns {{ proven: boolean, how: string }}
 */
/**
 * The failing gates' own output, for the operator's log.
 *
 * 0.53.0 made a failing gate's **name** reach the log, arguing that a diagnosis which exists
 * but is unreachable on the path that needs it is not a diagnosis. The detail never followed,
 * and that omission cost two dogfood runs. `gates failed: mutation` was the entire record while
 * the actual event was Stryker dying with `ERR_MODULE_NOT_FOUND: Cannot find package
 * 'typescript'` — a crash, not a surviving mutant, and a completely different repair.
 *
 * The output was not lost, exactly: it went into the *next* iteration's brief. But a run that
 * ends `BUDGET` has no next brief, so the final iteration's failure is unrecoverable, and the
 * operator watching the log sees a gate name repeating and no reason. Both runs read as "the
 * builder cannot satisfy the mutation gate" when the truth was "the gate never ran".
 *
 * Verbatim and unstyled, per §9. Capped per gate, because a compiler can emit thousands of
 * lines — and the cap **announces itself**, on the Build Brief's rule: a log showing ten of
 * forty lines reads exactly like a log with ten lines. An empty detail is reported rather than
 * rendered as a blank, because a gate that failed and explained nothing is precisely the shape
 * that hid the crash.
 *
 * @param {GateResult[]} failed
 * @param {number} [maxLines] per gate
 * @returns {string[]}
 */
export function formatGateFailure(failed, maxLines = 60) {
  /** @type {string[]} */
  const out = [];
  for (const gate of failed) {
    const detail = String(gate.detail ?? '');
    if (detail.trim() === '') {
      out.push(`  ${gate.name}: exited ${gate.status} with no output`);
      continue;
    }
    const lines = detail.split('\n');
    out.push(`  ${gate.name}:`);
    for (const line of lines.slice(0, maxLines)) out.push(`    ${line}`);
    if (lines.length > maxLines) out.push(`    ... ${lines.length - maxLines} more line(s) not shown`);
  }
  return out;
}

/**
 * The panel plan with already-carried requirements removed, plus what was carried.
 *
 * **Two refusals to narrow, and both are the point.**
 *
 * *Nothing left to ask.* If every required id is carried, the panel is run in full. A run that
 * shipped without a single fresh cold read, purely on pins recorded earlier, would have replaced
 * the architecture's one irreplaceable component with a cache.
 *
 * *A reviewer emptied.* A reviewer whose ids are all carried is dropped from the narrowed pass,
 * which is exactly the saving — and exactly why the caller re-runs the full panel before any
 * ship. Run 10's ship was saved by the **design** auditor spotting an inert `bin`, which no
 * requirement asked about.
 *
 * @param {{ reviewer: string, ids: string[] }[]} assignments
 * @param {import('./pins.mjs').RequirementPin[]} carriedPins
 * @param {string[]} requiredIds
 * @returns {{ assignments: { reviewer: string, ids: string[] }[], carried: import('./pins.mjs').RequirementPin[], narrowed: boolean }}
 */
export function narrowedPanelPlan(assignments, carriedPins, requiredIds) {
  const carried = carriedPins.filter((pin) => requiredIds.includes(pin.id));
  if (carried.length === 0 || carried.length >= requiredIds.length) {
    return { assignments, carried: [], narrowed: false };
  }
  const carriedIds = new Set(carried.map((pin) => pin.id));
  const narrowedAssignments = assignments
    .map((assignment) => ({ reviewer: assignment.reviewer, ids: assignment.ids.filter((id) => !carriedIds.has(id)) }))
    .filter((assignment) => assignment.ids.length > 0);
  // Every reviewer emptied at once, with ids still uncarried somewhere: an ownership map that
  // does not cover what it should. Fail safe by not narrowing rather than by shipping a panel
  // of nobody.
  if (narrowedAssignments.length === 0) return { assignments, carried: [], narrowed: false };
  return { assignments: narrowedAssignments, carried, narrowed: true };
}

/**
 * The carried requirements, shaped as a reviewer report so `combinePanel` needs no special case.
 *
 * These are not new judgements and must never read as one. Each is a **prior cold-panel pass**,
 * with the evidence that earned it, whose evidenced file `verifyRequirementPin` has just
 * confirmed unchanged. Any change to that file unpins; a missing target is a fail, never a
 * carried pass (`BRIEF.md` A8).
 *
 * @param {import('./pins.mjs').RequirementPin[]} carried
 * @returns {ReviewerReport}
 */
export function carriedReport(carried) {
  return {
    verdict: 'pass',
    requirements: carried.map((pin) => ({
      id: pin.id,
      status: /** @type {'pass'} */ ('pass'),
      evidence: pin.evidence,
      detail: `carried from the cold pass at iteration ${pin.pinnedAt}; ${pin.evidence} has not changed since`,
    })),
    advisories: [],
    problems: [],
  };
}

/**
 * Which files a ship-time mutation run should mutate, and whether it can run at all.
 *
 * **Scoped to what this run changed, not to the whole tree, and that is a correction to the
 * proposal in `HANDOFF.md` bought by measuring it.** The proposal was to mutate the entire
 * first-party tree once at ship time. Measured against Stryker 9.6.1 on a nine-module fixture:
 * one module with no tests at all scores `0.00` and **fails** the gate when mutated alone —
 * and passes at **84.85% overall, exit 0**, when mutated alongside eight well-tested
 * neighbours. `thresholds.break` is a *percentage*, so a whole-tree run dilutes: the more
 * well-tested code a repository already has, the less the run's own work has to prove.
 *
 * That is precisely the laundering the proposal told us to check for — *"that it cannot become
 * a way for a run to ship on a mutation pass it never earned on its own changes"* — and the
 * whole-tree form fails the check. It bites hardest in improve mode, where iteration 1 changes
 * three files in a repository of five hundred and gets no scoped mutation at all, because
 * iteration 1 has no ratchet baseline to diff against.
 *
 * The run's own diff has neither problem. It is never empty when the run did anything, it
 * cannot be diluted by code the run did not write, and on a greenfield run it *is* the whole
 * tree, because the run wrote the whole tree.
 *
 * @param {{ changedFiles: string[] }} input
 * @returns {{ can: boolean, reason: string }}
 */
export function shipTimeMutationScope(input) {
  if (input.changedFiles.length === 0) {
    // Not a pass. A run that changed nothing since its own start commit has produced nothing
    // for a mutation run to be evidence about, and "there was nothing to check" must never be
    // spelled the same way as "the check passed".
    return { can: false, reason: 'this run has changed no file since it started, so there is nothing of its own to mutate' };
  }
  return { can: true, reason: `mutating the ${input.changedFiles.length} file(s) this run changed` };
}

/**
 * @param {{ results: GateResult[] }} gateOutcome
 * @param {{ seenFailing: Set<string> }} redEvidence
 * @returns {{ proven: boolean, how: string }}
 */
export function suiteSensitivityEvidence(gateOutcome, redEvidence) {
  const mutation = gateOutcome.results.find((result) => result.name === 'mutation');
  if (mutation !== undefined && mutation.ok) {
    return { proven: true, how: 'the mutation gate passed, so the tests are sensitive to the code' };
  }
  if (redEvidence.seenFailing.size > 0) {
    return {
      proven: true,
      how: `${redEvidence.seenFailing.size} test(s) have been observed failing, so the suite can go red`,
    };
  }
  return {
    proven: false,
    how:
      'nothing has demonstrated that these tests can fail: none has been observed red, and the mutation ' +
      'gate did not run and pass on this iteration',
  };
}

/**
 * Test ids that have been observed *not* passing at some point in this run.
 *
 * @param {string} dareDir
 * @returns {{ seenFailing: Set<string>, baseline: Set<string>, established: boolean }}
 */
export function loadRedEvidence(dareDir) {
  const file = path.join(dareDir, RED_EVIDENCE);
  const empty = { seenFailing: new Set(), baseline: new Set(), established: false };
  if (!existsSync(file)) return empty;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    /** @param {unknown} value */
    const ids = (value) =>
      new Set((Array.isArray(value) ? value : []).filter((id) => typeof id === 'string').map(String));
    return {
      seenFailing: ids(parsed.seenFailing),
      baseline: ids(parsed.baseline),
      // A file that exists at all means the baseline moment has passed, even if the array is
      // empty — a project whose first gating found zero tests still had its first gating.
      established: true,
    };
  } catch {
    // Unreadable evidence is no evidence. Every new test is then unproven, which fails
    // the gate loudly rather than quietly crediting tests that were never red.
    return empty;
  }
}

/**
 * @param {string} dareDir
 * @param {Iterable<string>} nonPassing
 * @param {Iterable<string>} [passing] recorded as the baseline on the first gating only
 * @returns {{ seenFailing: Set<string>, baseline: Set<string>, established: boolean }}
 */
export function recordRedEvidence(dareDir, nonPassing, passing = []) {
  const evidence = loadRedEvidence(dareDir);
  for (const id of nonPassing) evidence.seenFailing.add(id);

  // The baseline is written exactly once, the first time this project is gated at all, and it
  // is the escape from an unsatisfiable objective rather than a convenience. See
  // `redEvidenceGate` for why it has to exist and what still guards the ids it admits.
  const baseline = evidence.established ? evidence.baseline : new Set(passing);

  mkdirSync(dareDir, { recursive: true });
  writeFileSync(
    path.join(dareDir, RED_EVIDENCE),
    `${JSON.stringify({ seenFailing: [...evidence.seenFailing].sort(), baseline: [...baseline].sort() }, null, 2)}\n`,
    'utf8',
  );
  return { seenFailing: evidence.seenFailing, baseline, established: true };
}

/**
 * RED before GREEN. A test that has only ever been green is unproven: it may assert
 * nothing, or assert something that was already true. This is the structural version of
 * that rule — it kills tautological tests before review rather than after, when they have
 * already cost an iteration.
 *
 * **The first gating of a project is exempt, and the exemption is the fix for an unsatisfiable
 * objective rather than a softening.** Measured on 11 August 2026: a builder wrote a complete
 * application whose 83 tests all passed on the first gate run. With no `previousPassing` and no
 * `redSeen`, every one was "unproven", the gate failed, and the objective handed back was
 * *"make these gates pass"* — which the builder **cannot satisfy**, because it cannot make an
 * already-green test have been red in the past. Four iterations of that and the run ends
 * `STALLED` without ever reaching a reviewer. It is the same shape as the `e2e` gate failing a
 * CLI forever for having no browser config (§4.2): a gate reporting the absence of something
 * that could not exist.
 *
 * So the ids present at the very first gating are recorded as a **baseline** in
 * `.dare/red-evidence.json`, written exactly once, and admitted. Every id added afterwards
 * needs real red history, which is where satisficing actually happens — a builder under
 * pressure adds a green test to lift a score, and that is still caught.
 *
 * **What guards the baseline instead**, because it is a genuine weakening and must not be left
 * unguarded: `gate-integrity`'s assertion check (§4) rejects truthiness-only assertions
 * deterministically, and the conditional mutation pass (§4.4) fails a test insensitive to the
 * code it covers. Neither needs history. The baseline trades a guarantee that could not be
 * satisfied for two that can.
 *
 * @param {{ previousPassing: Iterable<string>, passing: Iterable<string>, redSeen: Iterable<string>,
 *   baseline?: Iterable<string> }} options
 * @returns {GateResult}
 */
export function redEvidenceGate(options) {
  const before = new Set(options.previousPassing);
  const red = new Set(options.redSeen);
  const baseline = new Set(options.baseline ?? []);
  const unproven = [...new Set(options.passing)]
    .filter((id) => !before.has(id) && !red.has(id) && !baseline.has(id))
    .sort();
  const baselined = [...new Set(options.passing)].filter((id) => baseline.has(id)).length;
  return {
    name: 'red-evidence',
    // Reports; does not fail. See this function's header for why blocking deadlocked the
    // ratchet, and `unprovenIds` for where the deterrent actually lives now.
    ok: true,
    status: 0,
    detail:
      unproven.length > 0
        ? `${unproven.length} test(s) never observed failing, so earning no ratchet credit: ${unproven.join(', ')}`
        : baselined > 0
          ? `every newly passing test was seen failing first; ${baselined} in the first-gating baseline, ` +
            'which red evidence cannot cover and mutation and assertion checks do'
          : 'every newly passing test was seen failing first',
  };
}

/**
 * The ids a report contains that have no red history, and therefore earn no ratchet credit.
 *
 * This is where RED-before-GREEN actually bites, and it is what `DESIGN.md` §8 always said it
 * was: *"a test that has only ever been green is treated as unproven and doesn't count toward
 * the ratchet."* It never said the gate fails the iteration.
 *
 * Making it fail was a deadlock, measured on 11 August 2026 across four iterations. A builder
 * that writes code and its tests in the *same child* produces tests that already pass by the
 * time gates run — `seenFailing: 0` after four iterations. So every id added after the first
 * gating was permanently unproven, red-evidence failed, the iteration failed, and **the ratchet
 * could not advance** — which left `previousPassing` empty, which is what made them unproven.
 * Circular, and it explains why every run this project has ever performed ended `passing: 0`.
 *
 * The deterrent survives the change and is arguably sharper: an unproven test earns **no
 * protection**, so a fake green test cannot inflate the ratchet, and the iteration is not
 * blocked on evidence that could not exist. The shape of a fake test is caught deterministically
 * elsewhere — `gate-integrity`'s assertion check (§4) and the conditional mutation pass (§4.4).
 *
 * @param {{ passing: Iterable<string>, previousPassing: Iterable<string>,
 *   redSeen: Iterable<string>, baseline?: Iterable<string> }} options
 * @returns {Set<string>} the ids to withhold from the ratchet
 */
export function unprovenIds(options) {
  const before = new Set(options.previousPassing);
  const red = new Set(options.redSeen);
  const baseline = new Set(options.baseline ?? []);
  return new Set(
    [...new Set(options.passing)].filter((id) => !before.has(id) && !red.has(id) && !baseline.has(id)),
  );
}

// ===========================================================================
// CLI
// ===========================================================================

/**
 * @param {string[]} argv
 * @returns {{ input: string, yes: boolean, confirmPrd: boolean, improve: boolean }}
 */
export function parseDriverArgs(argv) {
  const flags = new Set(argv.filter((argument) => argument.startsWith('--')));
  const positional = argv.filter((argument) => !argument.startsWith('--'));
  return {
    input: positional.join(' ').trim(),
    yes: flags.has('--yes'),
    confirmPrd: flags.has('--confirm-prd'),
    // Improve mode (§2.1). The other three input shapes are all product-shaped — a PRD to
    // build, an idea to specify, or nothing at all — and none of them can express "this
    // repository already exists, find what is wrong with it". In improve mode the positional
    // argument is not a PRD path and not an idea: it is an optional area to focus on.
    improve: flags.has('--improve'),
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
 * A template with `{{name}}` placeholders filled in.
 *
 * The security-escalation prompt was a string literal in this file until an audit pointed out
 * that every other persona reads from `templates/` and `CLAUDE.md` calls those "the
 * highest-leverage artifacts in the repo" — so one persona's wording was quietly exempt from the
 * rule that its wording is product code, reviewed and versioned like any other.
 *
 * **An unsubstituted placeholder throws.** A prompt reaching a child with a literal
 * `{{snippet}}` in it would ask about nothing, and the child would answer about nothing — most
 * likely `unknown`, which is the verdict that records a loss of protection and blocks a ship.
 * Failing here makes that a startup error rather than a quarantine nobody can explain.
 *
 * @param {string} name
 * @param {Record<string, string>} values
 * @returns {string}
 */
export function renderTemplate(name, values) {
  let text = template(name);
  for (const [key, value] of Object.entries(values)) text = text.split(`{{${key}}}`).join(value);
  const leftover = text.match(/\{\{[a-zA-Z]+\}\}/);
  if (leftover !== null) {
    throw new DriverError(`${name} still contains ${leftover[0]} after substitution; the prompt would ask about nothing`);
  }
  return text;
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
  // The runner sentence is derived, not written down. An audit found this file and the
  // `no-tests` objective both hardcoding vitest while `firstIterationTask` correctly derived it
  // — three places stating one contract, two of them wrong for any toolchain but Node. On .NET
  // the `no-tests` copy was worse than stale: it gave wrong runner advice at the exact moment
  // the builder was being corrected for using the wrong runner.
  //
  // Every greenfield failure this project has recorded is this sentence (§8, run 6's 978
  // seconds and 14M tokens on a `node --test` suite the gate collected nothing from), so it is
  // now stated once, from `gateSummary`, and rendered.
  const base = renderTemplate('builder-system.md', runnerLines(cwd));
  if (!hasFrontend(cwd)) return base;
  return `${base}\n\n---\n\n${template('frontend-direction.md')}`;
}

/**
 * The two runner sentences, from the toolchain that will actually run.
 *
 * A gate the toolchain declines contributes an honest sentence saying so rather than being
 * omitted: a list that silently shrinks from two entries to one reads exactly like a project
 * that only ever had one, which is §3.8's rule about declined operations.
 *
 * @param {string} cwd
 * @returns {{ unitLine: string, e2eLine: string }}
 */
function runnerLines(cwd) {
  /** @param {string} name @param {string} what */
  const line = (name, what) => {
    const gate = gateSummary(cwd, path.join(cwd, '.dare')).gates.find((g) => g.name === name);
    const command = gate === undefined ? null : gate.command.join(' ');
    return command === null
      ? `- ${what} are not collected on this toolchain, so none can enter the ratchet`
      : `- ${what} are collected by \`${command}\``;
  };
  return { unitLine: line('unit', 'unit tests'), e2eLine: line('e2e', 'browser tests') };
}

/**
 * The guidance fragment for a toolchain, or an empty string when none is written.
 *
 * Empty rather than throwing, and the brief *announces* the emptiness rather than omitting the
 * section: a brief that silently carries guidance for one toolchain and not another reads, to
 * the next person, as a stack that had no idioms worth knowing. Same argument as a skipped
 * gate (§3.8) — the absence has to be visible to be judged.
 *
 * Unlike `builderSystemPrompt`, this rides in the **Build Brief** rather than the system
 * prompt, because it is about the objective's stack rather than about the builder's standing
 * contract — and because the brief is archived, so what a builder was told about its toolchain
 * is recoverable afterwards.
 *
 * @param {string} name the resolved toolchain's name
 * @returns {string}
 */
export function toolchainGuidance(name) {
  try {
    return template(`toolchain-${name}.md`);
  } catch {
    return '';
  }
}

/**
 * This plugin's own version, read from the manifest that Claude Code's loader keys its
 * install cache on — so a manifest recording 0.16.0 is evidence the 0.16.0 build ran, which
 * is exactly the confusion CLAUDE.md's "Releasing" section exists to prevent.
 *
 * @returns {string}
 */
export function pluginVersion() {
  const manifest = fileURLToPath(new URL('../.claude-plugin/plugin.json', import.meta.url));
  return JSON.parse(readFileSync(manifest, 'utf8')).version;
}

/** The binaries whose versions are worth recording, and how to ask each one. */
const VERSION_PROBES = [
  { tool: 'node', argv: ['node', '--version'] },
  { tool: 'npm', argv: ['npm', '--version'] },
  { tool: 'git', argv: ['git', '--version'] },
  { tool: 'claude', argv: ['claude', '--version'] },
];

/**
 * What the tools on this machine call themselves.
 *
 * A probe that fails contributes no key. Recording `"unknown"` would put a string in the
 * manifest that reads like a version and is not one; an absent key says plainly that nobody
 * managed to ask.
 *
 * @param {import('./plugins.mjs').Runner} run
 * @param {string} cwd
 * @returns {Record<string, string>}
 */
export function toolVersions(run, cwd) {
  /** @type {Record<string, string>} */
  const versions = {};
  for (const probe of VERSION_PROBES) {
    const result = run(probe.argv[0], probe.argv.slice(1), { cwd });
    const text = (result.stdout || '').trim();
    if (result.ok && text !== '') versions[probe.tool] = text.split('\n')[0];
  }
  return versions;
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
    // Added at 0.60.0, and bought with a ship. Dogfood run 9's panel found that an
    // unterminated quote makes the binary report statistics over half its input at exit 0.
    // Three reviewers found it independently, each ran it, each wrote `fail` citing
    // `src/csv.ts:21` — and the run shipped `panel unanimous on 15 requirement(s)`, because
    // no *required* id covered it. The PRD says nothing about unterminated quotes and the
    // code satisfies every requirement the PRD does state, so the only channel left was
    // `advisory-`, and §4.1 forbids an advisory from moving the verdict.
    //
    // 0.58.0's widened remit worked exactly as written. What was missing was somewhere for
    // the answer to land where it could block. This id is that place, and it is required
    // rather than advisory because the question it asks — does this program ever confidently
    // report a wrong answer — is the definition of done, not a note attached to it.
    'DoD-6-adversarial-input',
  ];
}

/**
 * `timedOut` is optional because most seams that accept a `run` double — `changedSince`'s git
 * diff, the gate runners — call commands that cannot hang on a remote machine, and requiring
 * the field of every test double would be bookkeeping rather than safety. The real `shell`
 * always sets it, and `runDeploy` tests it for `true` rather than for truthiness.
 *
 * `reaped` is the pids of leaked descendants killed after a timeout (see `sweepLeakedGroup`).
 * Optional for the same reason, and empty is different from absent: `[]` means the sweep ran
 * and found nothing, absent means no sweep was possible.
 *
 * @typedef {{ ok: boolean, status: number, stdout: string, stderr: string, timedOut?: boolean, reaped?: number[] }} ShellResult
 */

/**
 * Every pid sharing this process's process group, or `null` when that cannot be established.
 *
 * `null` is load-bearing and is not an empty set. The caller uses this to decide what to
 * **kill**, so an unreadable answer must mean "sweep nothing" rather than "nothing is there".
 * The same reasoning as nothing-defaults-to-pass, pointed the other way: nothing defaults to
 * killable.
 *
 * Windows has no process groups, so this returns `null` there and the sweep is a no-op — the
 * same degradation `health-probe.mjs` already takes for its own group signal.
 *
 * `ps` is itself a child in this group and would appear in the second snapshot as a process
 * that was not in the first. It is excluded by name rather than left to the `ESRCH` catch,
 * because by the time we parse the output `execFileSync` has reaped it and its pid is free
 * for reuse — a microsecond-wide window in which the catch would not fire and the kill would
 * land on whatever inherited the number.
 *
 * @returns {Set<number> | null}
 */
function processGroupMembers() {
  if (process.platform === 'win32') return null;
  try {
    const out = execFileSync('ps', ['-eo', 'pid=,pgid=,comm='], {
      stdio: 'pipe',
      encoding: 'utf8',
      timeout: 10_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    /** @type {{ pid: number, pgid: number, comm: string }[]} */
    const rows = [];
    for (const line of out.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 3) continue;
      const pid = Number(parts[0]);
      const pgid = Number(parts[1]);
      if (!Number.isInteger(pid) || !Number.isInteger(pgid)) continue;
      rows.push({ pid, pgid, comm: parts.slice(2).join(' ') });
    }
    const self = rows.find((row) => row.pid === process.pid);
    if (self === undefined) return null;
    return new Set(rows.filter((row) => row.pgid === self.pgid && row.comm !== 'ps').map((row) => row.pid));
  } catch {
    return null;
  }
}

/**
 * Kill whatever joined this process group while a command was running, and report it.
 *
 * **The defect this closes** (`HANDOFF.md`, "the real hang"): `execFileSync`'s timeout signals
 * the direct child and nothing else. A gate that backgrounds a dev server, a watcher or a test
 * runner leaves that grandchild alive after the kill, holding its port and its memory against
 * every later iteration — measured, with the grandchild still running after the timeout fired.
 * `health-probe.mjs` has always done this properly for its own child by signalling a **process
 * group**; gates never did.
 *
 * **Why the group is found by subtraction rather than by `detached: true`.** The obvious fix is
 * to spawn each gate into its own group and signal that. It was measured and rejected: a
 * detached child does not receive the `SIGINT` a terminal sends to its foreground process
 * group, so Ctrl-C would stop reaching gates. That trades a rare orphan — one that only appears
 * after a 45-minute ceiling — for a common one, on the operator's most-used control. `spawnSync`
 * does honour `detached` (undocumented, and verified), so the option was available and is not
 * taken.
 *
 * A leaked grandchild **inherits the driver's own process group**, because nothing detached it.
 * So the membership of that group, sampled before the command and again after it, differs by
 * exactly the command's survivors. No signals move, and Ctrl-C behaves as it always has.
 *
 * Called only on a **timeout**, which is narrower than it could be and deliberately so: the
 * deploy starts a server and then probes it, so a sweep on the success path would kill the
 * thing the smoke check is about to talk to.
 *
 * @param {Set<number> | null} before membership sampled before the command started
 * @returns {number[]} pids killed, newest-arrival order not guaranteed
 */
function sweepLeakedGroup(before) {
  if (before === null) return [];
  const after = processGroupMembers();
  if (after === null) return [];
  /** @type {number[]} */
  const killed = [];
  for (const pid of after) {
    if (pid === process.pid || before.has(pid)) continue;
    try {
      process.kill(pid, 'SIGKILL');
      killed.push(pid);
    } catch {
      // Already gone between the snapshot and the signal. Not an error: the sweep's job is
      // that nothing survives, not that it personally did the killing.
    }
  }
  return killed;
}

/**
 * Really shell out. Exported for tier 2 only.
 *
 * Every unit test drives the gate runners through an injected double, which is what makes the
 * loop's decisions testable without spending anything — and is exactly why no unit test can
 * see this function's behaviour. The orphan sweep is a claim about what the operating system
 * does to processes after `execFileSync` gives up, so it can only be checked against real
 * ones. `§11.1`'s argument, again: an assertion about the array you build says nothing about
 * what the callee does with it.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd: string, env?: Record<string, string | undefined>, input?: string, timeoutMs?: number }} options
 * @returns {ShellResult}
 */
export function shell(command, args, options) {
  // Only sampled when a ceiling exists, because the sweep only runs when one fires. A caller
  // with no timeout cannot time out, so the `ps` would be pure cost.
  const before = options.timeoutMs === undefined ? null : processGroupMembers();
  try {
    const stdout = execFileSync(command, args, {
      cwd: options.cwd,
      // Defaults to this process's environment, so gates and git calls are unaffected.
      env: options.env ?? process.env,
      // Only the Claude children send anything; gates and git calls pass no input and are
      // left on the inherited stdin they have always had.
      ...(options.input === undefined ? {} : { input: options.input }),
      // Absent by default, so every existing caller keeps the unbounded wait it has always
      // had. Only the deploy asks for a ceiling, because only the deploy runs a command
      // whose other end is a machine that can decide to say nothing forever.
      ...(options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
      stdio: 'pipe',
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    return { ok: true, status: 0, stdout, stderr: '', timedOut: false };
  } catch (error) {
    const failure = /** @type {{ status?: number, code?: string, signal?: string, stdout?: string, stderr?: string, message: string }} */ (
      error
    );
    // `ETIMEDOUT`, and nothing else, for the same reason the `timedOut` flag below uses it: a
    // command that failed on its own merits took its children with it or never had any, and
    // sweeping the group after an ordinary non-zero exit would kill processes this driver
    // never started.
    const timedOut = options.timeoutMs !== undefined && failure.code === 'ETIMEDOUT';
    return {
      ok: false,
      // A killed child reports `status: null`, so without the flag a timeout arrives here as
      // a plain `exit 1` and reads as a command that ran and failed. Those need opposite
      // responses from an operator and must not be collapsed into one message.
      status: typeof failure.status === 'number' ? failure.status : 1,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? failure.message,
      // `ETIMEDOUT`, and nothing else, measured against a real `execFileSync` rather than
      // assumed. `killed` is undefined here — that flag belongs to the asynchronous API, and
      // the first version of this line used it and silently never fired. `signal` is no good
      // either: a command that kills *itself* with SIGTERM reports `signal: 'SIGTERM'` and
      // must not be read as a timeout. The error code is the only exact discriminator.
      timedOut,
      // Absent rather than empty when no sweep ran, so a reader can tell "swept, found
      // nothing" from "never looked".
      ...(timedOut ? { reaped: sweepLeakedGroup(before) } : {}),
    };
  }
}

/**
 * Run the configured deploy and check that what came up answers correctly.
 *
 * Separate from `main()` so it can be driven by an injected shell. Until 0.79.0 this was a
 * closure inside the effects object, which meant the only way to exercise it was to compose
 * it by hand — and the one thing nobody composed by hand was a command that never returns.
 *
 * Credentials reach the command through the operator's environment (`shell` passes
 * `process.env`) and the driver runs it in its own process, so nothing about the deploy ever
 * enters a prompt. That is an invariant, not an accident (DESIGN.md §10.1).
 *
 * @param {import('./config.mjs').DeployConfig} deploy
 * @param {{ cwd: string, log?: (line: string) => void, shell?: (command: string, args: string[], options: { cwd: string, timeoutMs?: number }) => ShellResult }} options
 * @returns {{ ok: boolean, detail: string }}
 */
export function runDeploy(deploy, options) {
  if (!deploy.enabled) return { ok: true, detail: 'no deploy configured' };
  const log = options.log ?? (() => {});
  const run = options.shell ?? shell;
  const [command, ...args] = deploy.command;
  log(`deploying: ${command} ${args.join(' ')}`);
  const deployed = run(command, args, { cwd: options.cwd, timeoutMs: deploy.timeoutMs });
  if (!deployed.ok) {
    if (deployed.timedOut === true) {
      return {
        ok: false,
        detail:
          `the deploy command did not finish within ${deploy.timeoutMs}ms and was killed: ${command} ${args.join(' ')}. ` +
          'An unattended run cannot answer a prompt, so a passphrase or a host-key question looks exactly like this',
      };
    }
    return { ok: false, detail: `the deploy command failed: ${deployed.stderr.trim() || `exit ${deployed.status}`}` };
  }
  const probeArgs = ['--url', deploy.url];
  for (const check of deploy.smoke) probeArgs.push('--expect', `${check.path}=${check.status}`);
  log(`smoke: ${deploy.smoke.length} check(s) against ${deploy.url}`);
  const smoked = run('node', [HEALTH_PROBE, ...probeArgs], { cwd: options.cwd });
  // Exit code, like every other check here. A non-zero probe is a failure whatever it
  // printed, and an empty stdout still fails rather than defaulting to pass.
  if (!smoked.ok) return { ok: false, detail: smoked.stdout.trim() || 'the smoke check failed and said nothing' };
  return { ok: true, detail: smoked.stdout.trim() || 'smoke checks passed' };
}

/**
 * Run the mutation gate once, at ship time, over what this run itself changed.
 *
 * Called from exactly one place — a passing panel with no other evidence that the suite can
 * fail — and never on an ordinary iteration. See `shipTimeMutationScope` for why the scope is
 * the run's diff rather than the whole tree, which is a measured correction to the proposal.
 *
 * Everything here fails closed. No scope, no toolchain command, a declined gate, a crash: all
 * of them return `ok: false`. The one thing this must never do is convert "the check could not
 * run" into "the suite is proven", which is the shape §4 refuses everywhere else.
 *
 * @param {string} cwd
 * @param {string} dareDir the driver's own directory in that tree
 * @param {string} startCommit the commit this run began at
 * @param {number} timeoutMs the gate ceiling, so a slow mutation run is a named failure
 * @returns {{ ok: boolean, detail: string }}
 */
export function shipTimeMutation(cwd, dareDir, startCommit, timeoutMs) {
  if (startCommit === '') {
    return { ok: false, detail: 'no start commit was recorded for this run, so its own changes cannot be identified' };
  }
  const changedFiles = changedSince({ cwd, since: startCommit, run: shell });
  const scope = shipTimeMutationScope({ changedFiles });
  if (!scope.can) return { ok: false, detail: scope.reason };

  writeMutationConfig(dareDir);
  const built = conditionalCommandGates(cwd, dareDir, changedFiles);
  const gate = built.gates.find((candidate) => candidate.name === 'mutation');
  if (gate === undefined) {
    // The toolchain declined — `dotnet` declines mutation rather than guessing Stryker.NET's
    // command line — or every changed file was test-like. Either way nothing was measured.
    const declined = built.skipped.find((candidate) => candidate.name === 'mutation');
    return { ok: false, detail: `the mutation gate could not run at ship time: ${declined?.reason ?? 'no reason given'}` };
  }
  const outcome = runGates([gate], { cwd, run: shell, timeoutMs });
  const result = outcome.results[0];
  return outcome.ok
    ? { ok: true, detail: `${scope.reason}: every mutant was caught, so the suite is sensitive to this run's code` }
    : { ok: false, detail: `${scope.reason}: ${result?.detail ?? 'the gate failed and said nothing'}` };
}

/**
 * Spawn one `claude -p` child and read its envelope.
 *
 * The runner is injectable so that the two properties that matter about a child — the
 * permissions it is given and the environment it inherits — can be asserted without one
 * being spawned. Both have been wrong before, and neither is visible in a run's output.
 *
 * @param {{ prompt: string, model: string, systemPrompt?: string, phase: string, effort?: string, cwd: string,
 *   env: Record<string, string | undefined>, contextLimit?: number, timeoutMs?: number,
 *   maxBudgetUsd?: number, maxTurns?: number,
 *   run?: (command: string, args: string[],
 *     options: { cwd: string, env?: Record<string, string | undefined>, input?: string, timeoutMs?: number }) =>
 *     ShellResult }} options
 * @returns {ClaudeResult}
 */
export function spawnClaude(options) {
  // The context budget is checked here rather than at any call site, for the reason
  // `builderSystemPrompt` gives for being a function: every child in the loop passes through
  // this one door, so a phase added later cannot forget the check. Refusing before `run`
  // means an oversized prompt costs no money and no wall-clock (DESIGN.md §3.9).
  const budget = checkContextBudget({
    phase: options.phase,
    parts: { systemPrompt: options.systemPrompt, prompt: options.prompt },
    limit: options.contextLimit,
  });
  if (!budget.ok) return { ok: false, text: '', costUsd: 0, tokens: 0, raw: budget.detail };

  const args = claudeArgs(options);
  const run = options.run ?? shell;
  // Every Claude child carries the re-entrancy marker. This is the half of the no-nesting
  // rule the guard hook cannot enforce: the hook sees tool calls, not our own children.
  // The prompt goes on stdin rather than in argv; see `claudeArgs` for the bug that cost.
  const result = run('claude', args, {
    cwd: options.cwd,
    env: childEnvironment(options.env),
    input: options.prompt,
    // Absent unless the caller supplies one, so a test double that omits it keeps the
    // unbounded wait every child had before 0.80.0. `main` always supplies it.
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
  // Checked before the stdout test below, and the order is the whole point. A child killed
  // mid-stream can leave a partial envelope on stdout, and `result.stdout.trim() !== ''`
  // would send that fragment to the parser — which might well parse it, and report whatever
  // half a verdict looks like. A killed child has no verdict. A fragment of one is not a
  // smaller verdict, it is a different one, and nothing here defaults to pass.
  if (result.timedOut === true) {
    return {
      ok: false,
      text: '',
      costUsd: 0,
      tokens: 0,
      raw:
        `the ${options.phase} child did not return within ${options.timeoutMs}ms and was killed. ` +
        'Nothing it may have written was read, because a killed child has no verdict',
    };
  }
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
 * It also carries the measured prompt size, which is the cheap half of the context budget
 * (DESIGN.md §3.9). The budget check catches a runaway; this catches the slope leading to
 * one, by putting the number in the log every time so a reader can see it climb. Characters,
 * not tokens, and said so — there is no tokenizer here and an estimate would read as a
 * measurement.
 *
 * Since 0.80.0 it also names the ceiling, and that is the only thing an operator can act on
 * while the event loop is blocked: it converts "is this hung?" — unanswerable — into "has it
 * been longer than the number in the line?", which is arithmetic. The operator's report was
 * that a run would sit for hours before anyone said anything; nobody could have known sooner,
 * because nothing on screen said when silence stops being normal.
 *
 * @param {string} phase
 * @param {string} model
 * @param {number} characters the prompt and system prompt, measured
 * @param {number} [timeoutMs] the ceiling after which the child is killed
 * @returns {string}
 */
export function childStartLine(phase, model, characters, timeoutMs) {
  const base = `${phase}: ${model} running on ${characters} characters of prompt, no output until it returns`;
  return timeoutMs === undefined ? base : `${base}, killed after ${formatDuration(timeoutMs)}`;
}

/**
 * Milliseconds as something a person can hold in their head while watching a log.
 *
 * @param {number} milliseconds
 * @returns {string}
 */
export function formatDuration(milliseconds) {
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes < 60) return remainder === 0 ? `${minutes}m` : `${minutes}m${remainder}s`;
  const hours = Math.floor(minutes / 60);
  const leftoverMinutes = minutes % 60;
  return leftoverMinutes === 0 ? `${hours}h` : `${hours}h${leftoverMinutes}m`;
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
   * Dollars handed to children so far, for deriving the *next* child's in-flight allowance.
   *
   * `driveRun` owns `RunProgress` and this function cannot see it, but it does not need to:
   * every child spawns through `runChild` below, so summing here sums the same envelopes.
   * The alternative — threading `RunProgress` out through every effect signature — would put
   * the ceiling's arithmetic in two places that could disagree, which is worse than a local
   * total that cannot.
   */
  let handedOutUsd = 0;

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
    const measured = measurePrompt({ systemPrompt: options.systemPrompt, prompt: options.prompt });
    write(verbatim(childStartLine(options.phase, options.model, measured.characters, config.childTimeoutMs)));
    const startedAt = Date.now();
    const allowance = childBudget(config, handedOutUsd);
    const result = spawnClaude({
      ...options,
      contextLimit: config.contextBudget.maxCharacters,
      // Supplied here rather than at each call site, for the same reason the context budget
      // is checked inside `spawnClaude`: every child in the loop passes through this one
      // door, so a phase added later cannot forget the ceiling.
      timeoutMs: config.childTimeoutMs,
      ...allowance,
    });
    // Counted here because **every** child in the loop passes through this function — the
    // authoring phases, the design phase, the builder, the panel, and each race candidate.
    // So this total is the run's total, summed over the same envelopes `driveRun` charges
    // against the ceiling; it is not a second opinion about spend, it is the same arithmetic
    // reaching the place that needs it before the next child is spawned rather than after.
    handedOutUsd += result.costUsd;
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
  const { input, confirmPrd, improve } = parseDriverArgs(argv);

  // What Phase 0 and Phase 1 cost. These run before `driveRun` exists, so without carrying
  // them the ceiling silently restarts at zero when the loop begins — the defect the first
  // dogfood run exposed, where a design child spent 2,965,864 tokens against a 2,000,000
  // ceiling and the airtime counter reported the full budget remaining.
  const preLoop = { tokens: 0, costUsd: 0 };

  /**
   * Charge a pre-loop child and say whether the ceiling is now exhausted.
   *
   * Checked between the two phases as well as after them, so the overshoot here is bounded to
   * one child exactly as it is inside the loop. Nothing can price a child before running it,
   * so one child past the line is the best available guarantee — see §3.5.
   *
   * @param {ClaudeResult} result
   * @returns {boolean}
   */
  const chargePreLoop = (result) => {
    preLoop.tokens += result.tokens;
    preLoop.costUsd += result.costUsd;
    return preLoop.tokens >= config.tokenCeiling;
  };

  /** @param {string} phase */
  const preLoopBudgetEnd = (phase) => {
    write(verbatim(`token ceiling reached during ${phase}: ${preLoop.tokens} of ${config.tokenCeiling}`));
    write(stamp('BUDGET', { mode }));
  };

  // Measured before the run commits anything of its own. A repository that was empty when
  // dare arrived never has history worth quoting back at a builder, however many commits
  // dare goes on to add — those are the builder's own work, restated (DESIGN.md §8.2).
  const greenfield = !hasMeaningfulHistory({ cwd, run: shell });

  write(banner({ mode }));

  // Before anything is written, so the very first commit cannot stage machine state.
  if (ensureDareIgnored(cwd)) write(verbatim('added dare machine state to .gitignore'));

  // Before this run writes any artifact of its own, because the collision it prevents is
  // silent: iteration numbering restarts at 1 every run, so `briefs/iter-001.md` would be
  // overwritten by a replacement that looks exactly like the original (DESIGN.md §7.2).
  try {
    const archived = archivePreviousRun(dareDir);
    if (archived !== null) write(verbatim(`archived the previous run to ${path.relative(cwd, archived)}`));
  } catch (error) {
    // Continuing here would destroy the evidence archiving exists to keep, which is a worse
    // outcome than not starting.
    write(verbatim(/** @type {Error} */ (error).message));
    return 1;
  }

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
  if (improve) {
    // Improve mode refuses a repository with no history rather than authoring against nothing.
    // An improvement author handed an empty tree has nothing to ground a requirement in, and
    // ungrounded requirements are this project's most expensive defect class: the builder
    // cannot satisfy them, the stall counter climbs, and the run ends without anyone able to
    // say which line was impossible. `hasMeaningfulHistory` is the existing, tested signal for
    // "there is prior work here", and it is used as the proxy rather than a second detector.
    if (greenfield) {
      write(
        verbatim(
          'improve mode needs a repository that already exists, and this one has no meaningful history. ' +
            'Give a PRD or an idea instead.',
        ),
      );
      return 1;
    }
    write(verbatim(input === '' ? 'authoring PRD.md from this repository' : `authoring PRD.md from this repository, focused on: ${input}`));
    const authored = runChild({
      prompt:
        `${template('improve-author.md')}\n\n---\n\n` +
        (input === ''
          ? 'No area was named. Examine the repository as a whole.'
          : `Focus your examination here, and say so if the ground truth leads elsewhere:\n\n${input}`),
      model: config.prdModel,
      // The `prd` phase already carries Read, Glob and Grep, which is exactly what an author
      // grounding requirements in real `file:line` evidence needs. A new phase would have
      // meant a new permissions entry and a new effort key for the same capability.
      phase: 'prd',
      effort: config.effort['prd'],
      cwd,
      env,
    });
    if (!authored.ok) {
      write(verbatim(`improvement authoring failed: ${authored.raw.slice(0, 800)}`));
      write(stamp('ABORTED', { mode }));
      return 1;
    }
    if (chargePreLoop(authored)) {
      preLoopBudgetEnd('improvement authoring');
      return 1;
    }
    if (!existsSync(prdPath)) writeFileSync(prdPath, authored.text, 'utf8');
  } else if (input !== '' && existsSync(path.resolve(cwd, input))) {
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
      effort: config.effort['prd'],
      cwd,
      env,
    });
    if (!authored.ok) {
      write(verbatim(`PRD authoring failed: ${authored.raw.slice(0, 800)}`));
      write(stamp('ABORTED', { mode }));
      return 1;
    }
    if (chargePreLoop(authored)) {
      preLoopBudgetEnd('PRD authoring');
      return 1;
    }
    if (!existsSync(prdPath)) writeFileSync(prdPath, authored.text, 'utf8');
  }

  commitPhase(improve ? 'dare: author PRD.md from the existing repository' : 'dare: author PRD.md');
  if (confirmPrd) {
    write(verbatim('PRD.md is written and committed. Review it, then re-run without --confirm-prd.'));
    return 0;
  }

  const prd = readFileSync(prdPath, 'utf8');
  const requiredIds = requiredIdsFor(prd);

  // ---- Phase 0b: the held-out oracle (A3) -------------------------------
  //
  // Authored here, from the PRD alone, **before the design phase and before any code exists**.
  // That position is the whole point: every other check in this loop is downstream of the
  // builder, and this is the one artifact judged against the specification rather than against
  // the implementation. A child that has seen the code cannot write it.
  //
  // Authored if missing rather than only on a fresh run, so a resumed tree gets one too — the
  // alternative is a gate that fails forever on any repository started before this version.
  //
  // Failure to author **ends the run**. A gate armed with nothing would report a clean pass over
  // nothing, and this is the one gate whose entire value is independence.
  if (config.oracle.enabled && !existsSync(path.join(dareDir, 'oracle.json'))) {
    write(verbatim('authoring held-out acceptance cases from the PRD'));
    const authored = runChild({
      prompt: `${template('oracle-author.md')}\n\n---\n\nPRD.md:\n\n${prd}`,
      model: config.reviewerModel,
      phase: 'oracle-author',
      effort: config.effort['oracle-author'],
      cwd,
      env,
    });
    if (!authored.ok) {
      write(verbatim(`oracle authoring failed: ${authored.raw.slice(0, 800)}`));
      write(stamp('ABORTED', { mode }));
      return 1;
    }
    try {
      const cases = parseOracleCases(authored.text);
      writeOracle(dareDir, cases);
      write(verbatim(`held out ${cases.length} acceptance case(s); the builder is never shown them`));
    } catch (error) {
      const why = error instanceof OracleError ? error.message : String(error);
      write(verbatim(`oracle authoring returned nothing usable: ${why}`));
      write(stamp('ABORTED', { mode }));
      return 1;
    }
  }

  // ---- Phase 1: design + quality plugins --------------------------------
  write(verbatim('designing'));
  const designed = runChild({
    prompt: `${template('architect.md')}\n\n---\n\n${architectGateFragment(gateSummary(cwd, dareDir).gates)}\n\n---\n\nPRD.md:\n\n${prd}`,
    model: config.designModel,
    phase: 'design',
      effort: config.effort['design'],
    cwd,
    env,
  });
  if (!designed.ok) {
    write(verbatim(`design phase failed: ${designed.raw.slice(0, 800)}`));
    write(stamp('ABORTED', { mode }));
    return 1;
  }
  // Charged, but not an early exit. If this blew the ceiling, `driveRun` ends the run BUDGET
  // on its first `shouldContinue` — after the run manifest has been written, which is an
  // artifact the operator was promised. One exit path, and the forensic record survives.
  chargePreLoop(designed);

  // The architect is the only thing that can say what this project is, because at this moment
  // the repository holds a PRD and some design documents and no code — every detector answers
  // "no" for an application nobody has written yet (DESIGN.md §3.7).
  /** @type {import('./capabilities.mjs').Capability[]} */
  let declaredCapabilities;
  try {
    declaredCapabilities = parseCapabilityDeclaration(designed.text);
  } catch (error) {
    write(verbatim(`design phase did not say what this project is: ${/** @type {Error} */ (error).message}`));
    write(stamp('ABORTED', { mode }));
    return 1;
  }

  /**
   * The resolved capability set, recomputed and re-recorded on demand.
   *
   * Not cached: `declared` is fixed for the run, but `detected` describes the tree as it is
   * right now and the builder changes the tree every iteration. The manifest is rewritten
   * each time so `.dare/capabilities.json` is a current answer rather than a first one.
   *
   * @returns {string[]}
   */
  const runCapabilities = () => {
    const resolved = resolveCapabilities({ root: cwd, declared: declaredCapabilities });
    writeCapabilityManifest(dareDir, resolved);
    return resolved.capabilities;
  };
  write(verbatim(`this project is: ${runCapabilities().join(', ')}`));

  const provisioning = installQualityPlugins({ cwd, plugins: config.qualityPlugins, runner: shell });
  for (const warning of provisioning.warnings) write(verbatim(warning));

  commitPhase('dare: design documents');

  // ---- Phases 2-6: the loop ---------------------------------------------
  // Whatever the resolved toolchain says it writes, not node's two filenames. Hardcoding
  // those meant a toolchain writing anything else produced a report nobody read, and an
  // unread report is indistinguishable from a run in which nothing passed.
  const reportFiles = (/** @type {string} */ dir) =>
    resolveToolchain(dir).toolchain.reports.map((name) => path.join(dir, '.dare', name));

  const toolchainGates = gateSummary(cwd, dareDir);
  write(verbatim(`toolchain: ${toolchainGates.toolchain} (${toolchainGates.evidence})`));
  // A declined operation is announced rather than merely omitted. A gate list that quietly
  // shrinks reads exactly like one that was always that short (DESIGN.md §3.8).
  for (const skip of toolchainGates.skipped) {
    write(verbatim(`gate ${skip.name} not run: ${skip.reason}`));
  }

  // ---- The run manifest (DESIGN.md §7.1) ---------------------------------
  // Written once, here, because this is the first moment every field exists: the toolchain is
  // resolved and the architect has declared. Nothing reads it back — see run-manifest.mjs for
  // why that absence is the point rather than an omission.
  const resolvedToolchain = resolveToolchain(cwd);
  const capabilityRecord = resolveCapabilities({ root: cwd, declared: declaredCapabilities });
  // Captured once, into a name, because two things read it now: the run manifest below and
  // the ship-time mutation scope. Asking git twice would invite the two to disagree after the
  // first commit of the run, which is exactly when the scope stops being empty.
  const runStartCommit = shell('git', ['rev-parse', 'HEAD'], { cwd }).stdout.trim();
  writeRunManifest(
    dareDir,
    buildRunManifest({
      startedAt: new Date().toISOString(),
      startCommit: runStartCommit,
      pluginName: 'dare-to-be-stupid',
      pluginVersion: pluginVersion(),
      config,
      models: {
        builder: config.builderModel,
        reviewer: config.reviewerModel,
        design: config.designModel,
        prd: config.prdModel,
        style: config.styleModel,
        lesson: config.lessonModel,
      },
      // Recorded for the same reason `models` is: two runs are only comparable if what drove
      // them is written down. Effort changes how hard each child thinks, so a run whose
      // reviewer sat at `high` and one whose reviewer sat at `max` are different experiments,
      // and nothing else on disk would say so.
      effort: { ...config.effort },
      toolchain: {
        name: resolvedToolchain.toolchain.name,
        detected: resolvedToolchain.detected,
        evidence: resolvedToolchain.evidence,
      },
      capabilities: capabilityRecord,
      tools: toolVersions(shell, cwd),
    }),
  );

  /**
   * Every gate, named for the brief, so a builder is never surprised by one.
   *
   * Filtered by the capability table (§4.2), because telling a builder to satisfy a gate that
   * will not run is worse than saying nothing: it spends an iteration writing Playwright specs
   * for a command-line tool. The skips are listed too, with their reasons — a builder that
   * cannot see why e2e is absent will helpfully add it back.
   */
  const briefCapabilities = runCapabilities();
  const describedGates = [
    ...toolchainGates.gates.map((gate) => ({ name: gate.name, text: `${gate.name}: ${gate.command.join(' ')}` })),
    ...provisioning.gates.map((gate) => ({
      name: `quality:${gate.plugin}`,
      text: `quality:${gate.plugin}: ${gate.command.join(' ')}${gate.frontendOnly ? ' (armed once this repo renders a UI)' : ''}`,
    })),
    {
      name: 'ci',
      text: 'ci: a workflow under .github/workflows that actually runs build, lint, types, unit and e2e',
    },
    { name: 'docs', text: 'docs: README.md and docs/api-contract.md, neither a stub' },
    {
      name: 'observability',
      text: 'observability: structured logging in source, and a health endpoint that answers when the app is started',
    },
    { name: 'red-evidence', text: 'red-evidence: every newly passing test must have been seen failing first' },
  ];
  const applicableNames = applicableGates(describedGates, briefCapabilities);
  const gateNames = [
    ...applicableNames.gates.map((gate) => gate.text),
    // Both kinds of absence are declared. A toolchain skip means "this stack has no such
    // step"; a capability skip means "this project is not that shape". Neither is silent.
    ...toolchainGates.skipped.map((skip) => `${skip.name}: not run - ${skip.reason}`),
    ...applicableNames.skipped.map((skip) => `${skip.name}: does not apply - ${skip.reason}`),
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
    //
    // Capabilities come from the main tree, never from a raced candidate's. A candidate must
    // not be able to change which gates it is judged by (DESIGN.md §13.6), and the same
    // argument that keeps the ratchet out of a worktree applies here.
    const capabilities = runCapabilities();
    const applicable = applicableGates(
      [
        ...commandGates(dir, treeDare),
        ...provisioning.gates
          .filter((gate) => !gate.frontendOnly || hasFrontend(dir))
          .map((gate) => ({ name: `quality:${gate.plugin}`, command: gate.command, required: true })),
      ],
      capabilities,
    );
    for (const skip of applicable.skipped) write(verbatim(`gate ${skip.name} does not apply: ${skip.reason}`));
    const browsers = ensurePlaywrightBrowsers({ cwd: dir, dareDir: treeDare, run: shell, capabilities });
    if (browsers.installed) write(verbatim(browsers.detail));
    const commandResults = runGates(applicable.gates, { cwd: dir, run: shell, timeoutMs: config.gateTimeoutMs });

    // ---- the conditional second pass (DESIGN.md §4.4) -------------------
    // Only when every gate in the first pass passed. A failure above costs nothing extra,
    // which is the whole of the ordering change: mutation testing is slow, and running it on
    // an iteration that does not compile spends minutes to learn what `build` already said.
    if (commandResults.ok) {
      // `undefined` when there is no ratchet-advancing commit yet, rather than the empty list
      // `changedSince` would return. The consuming gate declines either way and the two reasons
      // it gives are different sentences, because "I have no baseline" and "nothing changed" are
      // different facts — see the mutation entry in `toolchains/node.mjs`.
      const lastGood = loadState(dareDir).lastGoodCommit;
      const changedFiles = lastGood === null ? undefined : changedSince({ cwd: dir, since: lastGood, run: shell });
      writeMutationConfig(treeDare);
      const second = conditionalCommandGates(dir, treeDare, changedFiles);
      for (const skip of second.skipped) write(verbatim(`gate ${skip.name} declined: ${skip.reason}`));
      const secondApplicable = applicableGates(second.gates, capabilities);
      for (const skip of secondApplicable.skipped) {
        write(verbatim(`gate ${skip.name} does not apply: ${skip.reason}`));
      }
      const secondResults = runGates(secondApplicable.gates, { cwd: dir, run: shell, timeoutMs: config.gateTimeoutMs });
      commandResults.results.push(...secondResults.results);
      commandResults.ok = secondResults.ok;
    }

    const previousPassing = loadState(dareDir).passing;

    /** @type {Set<string>} */
    const passing = new Set();
    /** @type {Set<string>} */
    const nonPassing = new Set();
    for (const file of reportFiles(dir)) {
      if (!existsSync(file)) continue;
      try {
        for (const test of parseReport(readFileSync(file, 'utf8'), { rootDir: dir }).tests) {
          (test.status === 'passed' ? passing : nonPassing).add(test.id);
        }
      } catch {
        // The ratchet reports this failure itself; the gate does not need to guess.
      }
    }
    // Passing ids are handed over too, because the first gating of a project has to record
    // what it found as a baseline: those tests have no "before" to have been red in.
    const red = recordRedEvidence(treeDare, nonPassing, [...passing]);
    const evidence = { previousPassing, passing, redSeen: red.seenFailing, baseline: red.baseline };
    const results = [
      ...commandResults.results,
      // The static gates are filtered by the same table as the command gates. `observability`
      // is the one that moves: a CLI has no health endpoint to answer, and the gate was
      // failing it for not having one.
      //
      // `ci` stays universal — the validation set has to run somewhere — but *which* steps it
      // demands is filtered by the same capabilities, which is why they are passed in as well
      // as applied outside. Without that, a browserless project could not satisfy `ci` at all.
      ...applicableGates(
        staticGates(dir, { run: shell, capabilities, dareDir: treeDare, oracle: config.oracle.enabled }),
        capabilities,
      ).gates,
      redEvidenceGate(evidence),
    ];
    // Withheld rather than blocked. An unproven test earns no protection from the ratchet,
    // which is the deterrent §8 always described; failing the iteration on it deadlocked the
    // run instead, because the evidence it demanded could not be produced.
    const unproven = unprovenIds(evidence);
    const credited = new Set([...passing].filter((id) => !unproven.has(id)));
    return { ok: results.every((result) => result.ok), results, passing: credited };
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
    // Before creating anything, clear whatever a killed race left registered. Cleanup on the
    // way out cannot cover `-9`, and `git worktree add` refuses a path git already knows about,
    // so without this one abandoned race breaks every later race in the repository.
    const swept = sweepRaceWorktrees({ cwd, run: shell });
    for (const entry of swept.removed) write(verbatim(`race: removed an abandoned worktree at ${entry}`));
    for (const problem of swept.problems) write(verbatim(`race: ${problem}`));
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
          capabilities: runCapabilities(),
          raceCandidate: {
            index: worktree.index,
            of: created.worktrees.length,
            hypothesis: stallHypothesis(worktree.index),
          },
        });
        writeBrief(dareDir, iteration, candidateBrief, worktree.index);

        const built = runChild({
          prompt: candidateBrief,
          model: config.builderModel,
          systemPrompt: builderSystemPrompt(cwd),
          phase: 'builder',
      effort: config.effort['builder'],
          cwd: worktree.dir,
          env,
        });
        tokens += built.tokens;
        costUsd += built.costUsd;
        if (!built.ok) {
          candidates.push({
            ...worktree,
            commit: null,
            gates: [],
            regressions: [],
            filesChanged: 0,
            linesChanged: 0,
          });
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
          ...parseNumstat(shell('git', ['diff', '--numstat', `${base}..HEAD`], { cwd: worktree.dir }).stdout),
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

  // One driver per repository (DESIGN.md §3.5). Checked here as well as in preflight, because
  // preflight runs in a *different process* — the `init` entry point — and the operator also
  // launches this file directly, which is exactly what the two-driver incident on 13 August
  // 2026 looked like in `ps`. The window between that check and this claim is milliseconds;
  // the window it closes was hours.
  const concurrent = checkNoConcurrentRun(dareDir);
  if (!concurrent.ok) {
    write(verbatim(`${concurrent.detail}\n${concurrent.fix}`));
    return 1;
  }
  claimRunLock(dareDir, { pid: process.pid, startedAt: new Date().toISOString() });

  /** @type {RunOutcome} */
  let outcome;
  try {
    outcome = driveRun({
    config,
    dareDir,
    rootDir: cwd,
    requiredIds,
    gateNames,
    alreadySpent: preLoop,
    task: firstIterationTask(unitGateCommand(cwd, dareDir)),
    // The same command, threaded so the `no-tests` objective names what the gate actually runs
    // rather than a Node-shaped guess. Three places state this contract; all three now derive it.
    unitCommand: unitGateCommand(cwd, dareDir),
    effects: {
      build: (brief) =>
        runChild({
          prompt: brief,
          model: config.builderModel,
          systemPrompt: builderSystemPrompt(cwd),
          phase: 'builder',
      effort: config.effort['builder'],
          cwd,
          env,
        }),
      // Reads one file from the tree for pin re-verification. Returns null rather than
      // throwing on a missing file, because "the file is gone" is an answer the caller has a
      // rule for and an exception is not.
      readSource: (file) => {
        try {
          return readFileSync(path.join(cwd, file), 'utf8');
        } catch {
          return null;
        }
      },
      // One cold child, one element, three possible answers and nothing else. Scoped this
      // tightly because the alternative to asking is a hard reset on a formatter run, and
      // because a broad question here would re-audit the repository at panel prices every
      // time somebody reindented a file.
      securityEscalation: (pin) =>
        runChild({
          prompt: renderTemplate('security-escalation.md', { evidence: pin.evidence, snippet: pin.snippet }),
          model: config.reviewerModel,
          phase: 'security-escalation',
      effort: config.effort['security-escalation'],
          cwd,
          env,
        }),
      // Re-read per call rather than captured once, because the builder appends to it between
      // iterations and a stale copy would show the panel an older run's reasoning.
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
            // Supplied, not sealed (§6.1). The log is driver-owned and the builder cannot write
            // it; what it buys the reviewer is the ability to check "you assumed X, the PRD says
            // Y", which is a defect no amount of reading the code would surface.
            ...(() => {
              /** @type {string} */
              let rendered;
              try {
                rendered = renderAssumptions(readAssumptions(dareDir).entries);
              } catch (error) {
                // Degrades like the lesson store, not like the ratchet. This is context for a
                // reviewer whose verdict already defaults to fail, so losing it costs
                // information rather than correctness, and a corrupt hint file must not kill a
                // healthy run.
                write(verbatim(`assumptions log unreadable, continuing without it: ${/** @type {Error} */ (error).message}`));
                rendered = '';
              }
              return rendered === '' ? [] : ['', rendered];
            })(),
          ].join('\n'),
          model: config.reviewerModel,
          systemPrompt: template('reviewer-system.md'),
          phase: 'review',
      effort: config.effort['review'],
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
      effort: config.effort['reality-check'],
          cwd,
          env,
        }),
      extractLesson: (evidence) =>
        runChild({
          prompt: `${template('lesson-extractor.md')}\n\n---\n\nThe evidence:\n\n${evidence}`,
          model: config.lessonModel,
          phase: 'lesson-extractor',
      effort: config.effort['lesson-extractor'],
          cwd,
          env,
        }),
      race: runRace,
      capabilities: runCapabilities,
      // Selected by *detected* toolchain rather than by anything declared, so the guidance
      // matches the commands the gates will actually run.
      toolchainGuidance: () => {
        const name = resolveToolchain(cwd).toolchain.name;
        return { name, guidance: toolchainGuidance(name) };
      },
      history: (findings) => historyContext({ cwd, run: shell, findings, greenfield }),
      changedFiles,
      gates: () => {
        const gated = gateTree(cwd);
        return { ok: gated.ok, results: gated.results };
      },
      shipTimeMutation: () => shipTimeMutation(cwd, dareDir, runStartCommit, config.gateTimeoutMs),
      readTestReports: () =>
        reportFiles(cwd)
          .filter((file) => existsSync(file))
          .map((file) => readFileSync(file, 'utf8')),
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
        // Annotated, not bare. An audit of the first SHIPPED found only an unannotated tag and
        // could not verify the claim behind it; a tag that carries no reason is not evidence.
        shell(
          'git',
          [
            'tag',
            '-f',
            '-a',
            'dare/GRAND-PRIZE',
            '-m',
            `SHIPPED: panel ${config.requireUnanimous ? 'unanimous' : 'majority'} on ` +
              `${requiredIds.length} requirement(s). Verdicts in .dare/${REVIEW_RECORD}.`,
          ],
          { cwd },
        );
      },
      // Deploy is **not** part of `ship`. It runs before the ship decision so a failure can
      // withhold the tag; see the call site in `driveRun`. The body lives in `runDeploy` so
      // it can be driven by an injected shell (DESIGN.md §10.1).
      deploy: () => runDeploy(config.deploy, { cwd, log: (line) => write(verbatim(line)) }),
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
  } finally {
    // Released on every path out, including the ABORTED one above. A lock left behind by a run
    // that ended normally would refuse the next run for no reason — and unlike a lock left by a
    // killed driver, that one would not clear itself, because this pid really is alive right up
    // until the process exits.
    clearRunLock(dareDir);
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
