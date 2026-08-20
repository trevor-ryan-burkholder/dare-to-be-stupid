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

import { execFileSync, spawn as spawnProcess } from 'node:child_process';
import { appendFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { clearInterval, clearTimeout, setInterval, setTimeout } from 'node:timers';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { appendAssumptions, parseAssumptions, readAssumptions, renderAssumptions } from './assumptions.mjs';
import { compileBrief, neutralizeLine, writeBrief } from './brief.mjs';
import {
  hasFrontend,
  parseCapabilityDeclaration,
  resolveCapabilities,
  establishedCapabilities,
  writeCapabilityManifest,
} from './capabilities.mjs';
import {
  ComponentError,
  checkComponentStateNotTracked,
  componentChildConfig,
  componentWorktreeName,
  createComponentWorktree,
  readComponentOutcome,
  runComponentDriver,
  sweepComponentWorktrees,
  writeComponentChildConfig,
} from './components.mjs';
import { DEFAULT_OWNERSHIP, loadConfig } from './config.mjs';
import { checkContextBudget, promptGrowthNote, measurePrompt } from './context-budget.mjs';
import {
  loadGateCache,
  planGateRun,
  saveGateCache,
  updateGateCache,
  workspaceHash,
} from './gate-cache.mjs';
import { applicableGates, gateApplies } from './gate-policy.mjs';
import { hasMeaningfulHistory, historyContext } from './history.mjs';
import { resolveCitation } from './evidence.mjs';
import { blankComments, integrityGate } from './integrity.mjs';
import {
  addLesson,
  findResolvedStruggles,
  markLessonsUsed,
  parseLessonExtraction,
  readLessons,
  saveLessons,
  selectLessons,
} from './lessons.mjs';
import {
  ORACLE_FILE,
  OracleError,
  oracleMatchesSpecification,
  parseOracleCases,
  resolveArtifactCommand,
  runOracle,
  writeOracle,
} from './oracle.mjs';
import { defaultProbe } from './preflight.mjs';
import {
  admitOutputs,
  buildLaunchReceipt,
  changedPaths,
  declaredOutputs,
  describeUnexpected,
  recordPhase,
  revalidateLaunch,
  writeLaunchReceipt,
} from './launch.mjs';
import { ArtifactTooLargeError, READ_LIMITS, readBounded } from './bounded-read.mjs';
import { designSlopEvidence } from './design-slop.mjs';
import { gitleaksEvidence } from './secrets-scan.mjs';
import { OUTCOME_FILE, writeRunOutcome } from './outcome.mjs';
import { dodIds, parseDod } from './dod.mjs';
import { recordEvent } from './journal.mjs';
import { parseErd } from './erd.mjs';
import { schemaEvidence } from './schema.mjs';
import { checkErdConsistency, dodPath, erdPath } from './preflight.mjs';
import { writeQuestion } from './question.mjs';
import { roleSupplyManifest } from './role-supply.mjs';
import { acquireRunLock, releaseRunLock } from './run-lock.mjs';
import {
  candidateDirFor,
  materializeCandidate,
  removeCandidate,
  shareToolCaches,
  sweepCandidateWorktrees,
  workingTreeMatchesCandidate,
  writeSnapshotTree,
  resolveGitDir,
} from './candidate.mjs';
import { captureSpecification, verifySpecification } from './specification.mjs';
import { ACCEPTANCE_FILE } from './acceptance-file.mjs';
import { buildAcceptanceReceipt, digest, verifyAcceptanceReceipt } from './acceptance.mjs';
import {
  NESTING_AUTHORITY_ENV,
  NESTING_TICKET_ENV,
  issueNestingTicket,
  redeemNestingTicket,
} from './nesting.mjs';
import { installQualityPlugins } from './plugins.mjs';
import { blockingFindings, recordSurfaceScan, scanAgentSurface } from './security-scan.mjs';
import { DENIAL_STATE_ENV } from '../hooks/guard.mjs';
import { SUPPLY_FILE, appendSupplyRecord } from './role-supply.mjs';
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
import { collapseByWorstStatus, parseReport } from './reporters/index.mjs';
import { clearReports, collectReports } from './reports.mjs';
import {
  evaluateIteration,
  unmeasuredIds,
  changedDefinitions,
  definitionDigest,
  testFilePath,
  extractTestIds,
  fileBackedIds,
  restorePaths,
  scopedRestorePaths,
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
import { quarantineCorruptFile } from './quarantine.mjs';
import { archivePreviousRun, buildRunManifest, configHash, writeRunManifest } from './run-manifest.mjs';
import { banner, render, stamp, styleMode, verbatim } from './style.mjs';
import { MUTATION_CONFIG, MUTATION_CONFIG_CONTENTS } from './toolchains/node.mjs';
import { CONDITIONAL_GATE_OPERATIONS, gatesFor, resolveToolchain } from './toolchains/index.mjs';

/** @typedef {import('./config.mjs').MeeseeksConfig} MeeseeksConfig */
/** @typedef {'SHIPPED' | 'STALLED' | 'BUDGET' | 'ABORTED'} TerminalState */
/** @typedef {{ name: string, command: string[], required: boolean, env?: Record<string, string>, interpret?: 'design-slop' | 'gitleaks' }} Gate */
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
 *   advisories: AdvisoryFinding[], problems: string[],
 *   unverifiable: string[], attackAccount: string
 * }} ReviewerReport
 */

/** Environment marker used to refuse nested runs (DESIGN.md §6.5). */
export const REENTRANCY_ENV = 'MEESEEKS_RUNNING';

/**
 * How deep the current run is nested. Absent or `0` at the top.
 *
 * Separate from {@link REENTRANCY_ENV} on purpose: that marker answers *"is a run in progress"*
 * and every child carries it. This answers *"how many boxes deep are we"*, which only matters
 * when the operator has explicitly asked for the thing that should not exist.
 */
export const DEPTH_ENV = 'MEESEEKS_RUN_DEPTH';

/** Set only by `--give-them-the-box`. Its presence is the whole of the permission. */
export const BOX_ENV = 'MEESEEKS_GIVE_THEM_THE_BOX';

/**
 * How many boxes deep nesting is allowed to go when it is allowed at all.
 *
 * **Two, and the number is doing real work.** Depth 1 is one nested run, which is the joke.
 * Depth 2 is a nested run that itself nests, which is the joke landing. Past that it stops being
 * comedy and becomes a fork bomb on somebody's laptop: every level multiplies the level above,
 * and each builder is a `claude -p` process holding a token budget. The mountain of Meeseeks is
 * funny because it is animated and nobody's machine is on fire.
 */
export const MAX_BOX_DEPTH = 2;

/** The wall clock `--give-them-the-box` imposes when the operator has not set one. */
export const BOXED_DEADLINE_MS = 1_800_000;

/**
 * Parse the inherited nesting depth without turning corrupt state into permission.
 *
 * Absence is the top-level value. A present marker must be one exact, safely representable,
 * non-negative integer; `parseInt` is deliberately insufficient because it accepts `1garbage`.
 *
 * @param {string | undefined} value
 * @returns {number | null}
 */
function parseRunDepth(value) {
  if (value === undefined || value === '') return 0;
  if (!/^(0|[1-9]\d*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

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
 * Ordinary runs may not spawn meeseeks; boxed component runs need a redeemed ticket. Enforced here
 * and in the guard hook, with the same-user limitations recorded in DESIGN.md §6.5.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {number} the depth established by the redeemed ticket, or zero at top level
 * @throws {DriverError}
 */
export function assertNotNested(env) {
  if (env[REENTRANCY_ENV] === undefined || env[REENTRANCY_ENV] === '') return 0;

  // `--give-them-the-box`: the operator has asked for the thing this architecture refuses, by
  // name, on a command line, in a session they are watching. Nothing else is relaxed — the guard
  // still owns `.meeseeks/`, review is still cold, nothing still defaults to pass — and it is
  // still refused past `MAX_BOX_DEPTH`, because a joke that keeps spawning stops being one to
  // the machine running it.
  // **Permission is a ticket, not a variable** (REVIEW F42). `MEESEEKS_GIVE_THEM_THE_BOX` and
  // `MEESEEKS_RUN_DEPTH` are environment strings, and a Builder with unrestricted Bash can forge the
  // first and reset the second at every generation — both reproduced. So the flag no longer decides
  // anything here on its own: a recognized nested run must redeem a record its parent wrote under
  // `.meeseeks/`, and redemption consumes it so a nonce read out of an inherited environment cannot
  // be used twice. This is not the same-user isolation boundary F42 still requires.
  //
  // Depth comes from that record too. A child cannot declare itself shallower than the ticket it was
  // issued, which is what made the cap resettable.
  /** @type {{ depth: number }} */
  let authorized;
  try {
    authorized = redeemNestingTicket({ authority: env[NESTING_AUTHORITY_ENV], nonce: env[NESTING_TICKET_ENV] });
  } catch (error) {
    throw new DriverError(
      `${/** @type {Error} */ (error).message} Nested runs are refused at the driver and at the guard hook ` +
        '(DESIGN.md §6.5).',
    );
  }
  if (authorized.depth <= MAX_BOX_DEPTH) return authorized.depth;
  throw new DriverError(
    `--give-them-the-box permits nesting to depth ${MAX_BOX_DEPTH}, and this ticket authorizes ${authorized.depth}. ` +
      'Even the box has a bottom.',
  );
}

/**
 * The environment a component sub-run needs in order to prove it was authorized.
 *
 * Issued by the Driver that is about to spawn it, under the operator's flag, and never in response
 * to anything a child asked for. The nonce travels in the environment because that is how a spawned
 * process learns anything; it authorizes nothing on its own.
 *
 * **The cap is applied here as well as at redemption**, which is not redundancy: refusing before the
 * ticket exists means a run that has reached the bottom of the box never spends a spawn to be told
 * so, and the record under `.meeseeks/` never accumulates authority nobody may use.
 *
 * `parentDepth` is the trusted number returned by `assertNotNested`, never the inherited marker.
 * The ticket is the authority for a nested run's depth; consulting the environment again after
 * redemption would let the child reset the cap before this function issued the next ticket.
 *
 * @param {{ meeseeksDir: string, parentDepth: number,
 *   env: Record<string, string | undefined> }} options
 * @returns {Record<string, string | undefined>}
 * @throws {DriverError}
 */
export function authorizedNestingEnv(options) {
  const inherited = options.parentDepth;
  if (!Number.isSafeInteger(inherited) || inherited < 0) {
    throw new DriverError(
      `${DEPTH_ENV} is ${JSON.stringify(options.parentDepth)}, which is not a depth. Refusing to issue nesting ` +
        'authority from a value the redeemed ticket did not establish.',
    );
  }
  const depth = inherited + 1;
  if (depth > MAX_BOX_DEPTH) {
    throw new DriverError(
      `--give-them-the-box permits nesting to depth ${MAX_BOX_DEPTH}, and this child would be ${depth}. ` +
        'Even the box has a bottom.',
    );
  }
  const ticket = issueNestingTicket(options.meeseeksDir, { depth });
  return {
    ...options.env,
    [NESTING_AUTHORITY_ENV]: options.meeseeksDir,
    [NESTING_TICKET_ENV]: ticket.nonce,
  };
}

/**
 * Create the only directory the guard may use for denial counters.
 *
 * The environment is populated only after both path components have been established as real
 * directories and the leaf resolves directly beneath the real `.meeseeks` directory. `O_NOFOLLOW`
 * in the guard protects the counter file; these checks protect the directory ancestors from a
 * pre-existing symlink. They are an activation check, not same-user process isolation: a process
 * already running outside the hook boundary can still race filesystem paths, which is why every
 * later uncertainty in the guard remains fail-verbose.
 *
 * @param {string} cwd
 * @returns {string}
 * @throws {DriverError}
 */
export function establishDenialStateDir(cwd) {
  const meeseeksDir = path.join(cwd, '.meeseeks');
  const dir = path.join(meeseeksDir, 'denials');
  try {
    mkdirSync(dir, { mode: 0o700 });
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'EEXIST') throw error;
  }
  const parent = lstatSync(meeseeksDir);
  const leaf = lstatSync(dir);
  if (parent.isSymbolicLink() || !parent.isDirectory() || leaf.isSymbolicLink() || !leaf.isDirectory()) {
    throw new DriverError(
      'denial dampening requires .meeseeks and .meeseeks/denials to be real directories; a link or non-directory ' +
        'would turn guard bookkeeping into a write outside driver-owned state',
    );
  }
  const realParent = realpathSync(meeseeksDir);
  const realLeaf = realpathSync(dir);
  if (path.dirname(realLeaf) !== realParent) {
    throw new DriverError('denial dampening is off because its state directory resolves outside .meeseeks');
  }
  if (process.platform !== 'win32') {
    const uid = typeof process.getuid === 'function' ? process.getuid() : null;
    if ((uid !== null && (parent.uid !== uid || leaf.uid !== uid)) || (parent.mode & 0o022) !== 0 || (leaf.mode & 0o077) !== 0) {
      throw new DriverError(
        'denial dampening requires driver-owned state: .meeseeks may not be group/other-writable and its denials ' +
          'directory may have no group or other permissions',
      );
    }
  }
  return dir;
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
        'pattern to `ownership` in .meeseeks/config.json, or add the reviewer that owns it to `reviewers`.',
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
 * The shortest attack account this parser will accept behind a `pass` (PLAN.md item 40, R27).
 *
 * **A number, and therefore arbitrary — but the alternative is worse.** Requiring the field at all
 * only forces a reviewer to type something; "I tried to break it and could not" is 34 characters and
 * satisfies any non-empty test. The floor is what makes the requirement bite, and it errs strict
 * because the direction of harm is asymmetric: a genuine account of what you attacked runs to
 * several hundred characters without effort, while a lazy charitable pass is exactly the thing that
 * cannot produce one.
 *
 * Not a list of forbidden phrases. Enumerating "n/a", "none", "nothing" is the same defect the guard
 * hook's positional rule exists to avoid — each new evasion defaults to accepted until somebody
 * remembers to add it.
 */
export const ATTACK_ACCOUNT_MIN = 120;

/**
 * Read the reviewer's account of what it tried to break.
 *
 * @param {Record<string, unknown>} parsed
 * @returns {string} the account, trimmed; empty when absent or unusable
 */
function readAttackAccount(parsed) {
  return typeof parsed.attackAccount === 'string' ? parsed.attackAccount.trim() : '';
}

/**
 * Read the reviewer's declaration of what it could **not** verify.
 *
 * **This channel exists because its absence was being scored as success.** A reviewer that cannot
 * reach a requirement — no runnable artifact, an assertion about a service it cannot call, a claim
 * needing state it was not given — had two options and both were wrong. Marking `fail` reports a
 * defect that may not exist and sends a builder to repair working code. Marking `pass` ships an
 * unexamined requirement. Told that its verdict defaults to fail and that evidence is mandatory, a
 * reviewer takes the second whenever the requirement looks fine, because a plausible `file:line` is
 * always available for code that exists.
 *
 * Naming it is now the third option, and it **fails closed at the driver**: a non-empty list blocks
 * acceptance exactly as a failed requirement does. That is the point. This is not an excuse slot —
 * it converts "I could not check this" from a silent pass into a visible, blocking, repairable fact.
 *
 * @param {Record<string, unknown>} parsed
 * @param {string[]} problems appended to in place when the field itself is malformed
 * @returns {string[]}
 */
function readUnverifiable(parsed, problems) {
  const raw = parsed.unverifiable;
  // Absent is a positive claim — "nothing was beyond me" — and an honest one for a reviewer with a
  // runnable tree. It is not a malformation, because forcing a non-empty list would make fabrication
  // the cheapest way to satisfy the contract.
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    problems.push(
      'reviewer output has an `unverifiable` that is not an array; unparseable output is a fail (DESIGN.md §4)',
    );
    // A malformed field yields a blocking entry rather than an empty list. Returning [] would let a
    // reviewer disable the channel by sending the wrong type, which is the cheapest possible evasion.
    return ['`unverifiable` could not be read'];
  }
  /** @type {string[]} */
  const entries = [];
  for (const [index, entry] of raw.entries()) {
    if (typeof entry !== 'string' || entry.trim() === '') {
      problems.push('unverifiable[' + index + '] is not a non-empty string');
      entries.push('unverifiable[' + index + '] could not be read');
      continue;
    }
    entries.push(entry.trim());
  }
  return entries;
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
      unverifiable: [],
      attackAccount: '',
    };
  }

  const entries = /** @type {Record<string, unknown>} */ (parsed).requirements;
  if (!Array.isArray(entries)) {
    return {
      verdict: 'fail',
      requirements: [],
      advisories,
      problems: ['reviewer output has no `requirements` array'],
      unverifiable: readUnverifiable(/** @type {Record<string, unknown>} */ (parsed), problems),
      attackAccount: readAttackAccount(/** @type {Record<string, unknown>} */ (parsed)),
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
  /** @type {'pass' | 'fail'} */
  let verdict = requirements.length > 0 && requirements.every((entry) => entry.status === 'pass') ? 'pass' : 'fail';

  const unverifiable = readUnverifiable(/** @type {Record<string, unknown>} */ (parsed), problems);
  const attackAccount = readAttackAccount(/** @type {Record<string, unknown>} */ (parsed));

  // Fails closed, and it outranks the requirement tally on purpose. A reviewer that passed every id
  // it could reach and named one it could not has not audited the tree; it has audited part of it,
  // and the part it skipped is the part nobody looked at.
  if (unverifiable.length > 0) {
    verdict = 'fail';
    problems.push(
      'the reviewer could not verify ' + unverifiable.length + ' item(s), which blocks acceptance: ' +
        unverifiable.join('; ') + ' (DESIGN.md §4)',
    );
  }

  // Only a pass has to account for itself. A fail is already a fail, and demanding the paperwork
  // behind one would add noise to the reports that are already doing their job.
  if (verdict === 'pass' && attackAccount.length < ATTACK_ACCOUNT_MIN) {
    verdict = 'fail';
    problems.push(
      attackAccount === ''
        ? 'every requirement passed but the report carries no `attackAccount`; a pass that does not say ' +
          'what was attacked is an unparseable pass (DESIGN.md §4)'
        : 'every requirement passed but the `attackAccount` is ' + attackAccount.length + ' characters, under ' +
          'the ' + ATTACK_ACCOUNT_MIN + ' required; an account too short to describe an attack is not evidence of one',
    );
  }

  return { verdict, requirements, advisories, problems, unverifiable, attackAccount };
}

/**
 * Resolve a parsed report's citations against the tree that was actually reviewed (REVIEW F6).
 *
 * **The boundary between a document and a repository, and it belongs here rather than in the
 * parser.** `parseReviewerReport` judges reviewer output and is deliberately pure — it is the piece
 * every hostile-report test drives, and giving it a filesystem would make those tests depend on a
 * tree. Only the Driver knows which candidate the reviewer was reading, so only the Driver can ask
 * whether the citation resolves inside it.
 *
 * Applied before combination, so an invalid location cannot be counted, recorded, pinned or
 * carried. A `pass` whose citation does not resolve becomes a `fail`: "evidence required" has to
 * mean a location somebody can open, or it means evidence-shaped text.
 *
 * An actionable advisory gets the same boundary pointed a different way. Its evidence is a repair
 * target rather than a compliance claim, so an unresolvable one cannot flip anything to pass — it
 * would instead send the builder to a file that is not there. It stops being actionable and says
 * why.
 *
 * @param {ReviewerReport} report
 * @param {{ root: string }} options the exact repository the reviewer read
 * @returns {ReviewerReport}
 */
export function resolveReportEvidence(report, options) {
  /** @type {string[]} */
  const problems = [...report.problems];
  const requirements = report.requirements.map((entry) => {
    if (entry.status !== 'pass') return entry;
    const resolution = resolveCitation(options.root, entry.evidence ?? '');
    if (resolution.ok) return entry;
    problems.push(
      `${entry.id} was marked pass citing ${JSON.stringify(entry.evidence)}, which does not resolve: ` +
        `${resolution.reason}; flipped to fail (DESIGN.md §4, REVIEW F6)`,
    );
    return { ...entry, status: /** @type {'fail'} */ ('fail') };
  });
  const advisories = report.advisories.map((finding) => {
    if (!finding.actionable) return finding;
    const resolution = resolveCitation(options.root, finding.evidence ?? '');
    if (resolution.ok) return finding;
    problems.push(
      `advisory ${finding.id} cited ${JSON.stringify(finding.evidence)}, which does not resolve: ` +
        `${resolution.reason}; it is recorded but not actionable`,
    );
    return { ...finding, actionable: false };
  });
  /** @type {'pass' | 'fail'} */
  let verdict = requirements.length > 0 && requirements.every((entry) => entry.status === 'pass') ? 'pass' : 'fail';
  // Carried through rather than recomputed. This function re-judges *citations*; it has no view on
  // what the reviewer could not reach, and silently dropping the channel here would undo the block
  // one layer after the parser applied it.
  if (report.unverifiable.length > 0) verdict = 'fail';
  if (verdict === 'pass' && report.attackAccount.length < ATTACK_ACCOUNT_MIN) verdict = 'fail';
  return {
    verdict,
    requirements,
    advisories,
    problems,
    unverifiable: report.unverifiable,
    attackAccount: report.attackAccount,
  };
}

/** Where the panel's verdict is written. Machine state: driver-owned, never tracked. */
export const REVIEW_RECORD = 'review.json';

/**
 * What a run *ended* as, written by `finish` on every terminal path.
 *
 * `run.json` (§7.1) records what a run was at its start and is written once after the design
 * phase. Nothing recorded the ending, so the terminal state existed only in stdout — and run 4
 * proved that stdout is not durable: its log lived in the tree, `git add -A` tracked it, and the
 * ratchet's own reset reverted it. The result had to be reconstructed from `.meeseeks/`, `git log`
 * and the reflog.
 */
export { OUTCOME_FILE } from './outcome.mjs';

/**
 * Persist what the panel actually decided.
 *
 * **The loop shipped a project and left no record of why.** An independent audit of the first
 * `SHIPPED` this project ever produced reported: *"I could not verify the unanimous-panel claim
 * at all — the evidence for it is not in the repo."* All that existed was `meeseeks/GRAND-PRIZE`, an
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
 * @param {string} meeseeksDir
 * @param {{ iteration: number, verdict: string, requireUnanimous: boolean, requiredIds: string[],
 *           failing: string[], reviewers: unknown[], advisories: unknown[],
 *           workspace?: string | null }} entry
 * @returns {string} the path written
 */
export function recordPanelVerdict(meeseeksDir, entry) {
  const file = path.join(meeseeksDir, REVIEW_RECORD);
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
  mkdirSync(meeseeksDir, { recursive: true });
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
 * @returns {Promise<{ ok: boolean, results: GateResult[] }>}
 */
export async function runGates(gates, options) {
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
    const outcome = await options.run(gate.command[0], gate.command.slice(1), {
      cwd: options.cwd,
      // Absent unless supplied, so every existing caller and test double keeps the unbounded
      // wait gates had before 0.81.0. `main` always supplies it.
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      // **Merged over the run's environment, never replacing it.** A gate's declared variables say
      // where to write a report; they are not a sandbox. Handing `shell` the bare pair would drop
      // PATH and the command would not be found — a failure that at least announces itself, unlike
      // the one this exists to fix. Still absent when the gate declares nothing, so `shell` keeps
      // its `process.env` default and no existing caller changes shape.
      ...(gate.env === undefined ? {} : { env: { ...process.env, ...gate.env } }),
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
    // **A gate that names an interpreter is judged by it, not by its exit code** (PLAN item 42).
    // Two things exit-code judging cannot do, and both were live defects: it cannot turn a machine
    // finding stream into evidence a builder can act on, and it cannot see anything at all on a
    // pass, because the branch below discards stdout the moment `ok` is true. impeccable's advisory
    // findings live exactly there.
    //
    // A timeout is never interpreted. Killed output is a fragment of a run that did not finish, and
    // handing a fragment to a parser invites it to succeed on half a document.
    const interpreter = gate.interpret === undefined ? undefined : INTERPRETERS[gate.interpret];
    if (interpreter !== undefined && outcome.timedOut !== true) {
      // The interpreter owns the verdict, both directions. It may fail a gate the command passed —
      // an empty stream, a status contradicting the findings — and that is the point: `exit 0` from
      // a detector that printed nothing is not evidence of a clean pass.
      const judged = interpreter({ stdout: outcome.stdout, status: outcome.status, stderr: outcome.stderr });
      results.push({ name: gate.name, ok: judged.ok, status: outcome.status, detail: judged.detail });
      continue;
    }
    results.push({
      name: gate.name,
      ok: outcome.ok,
      status: outcome.status,
      detail: outcome.ok ? 'passed' : detail + mutationCoverageHint(gate.name, detail),
    });
  }
  return { ok: results.every((result) => result.ok), results };
}

/**
 * Gate output interpreters, by the name a gate declares.
 *
 * A map of named functions rather than a function on the gate itself, because gates are plain data:
 * they are digested into the acceptance receipt, compared by the gate cache, and rendered into the
 * builder's brief. A function field would break all three, and none of them would say so.
 *
 * Deliberately not a general mechanism. There is one interpreter because there is one tool whose
 * useful output is a machine stream rather than an exit code; a second one is a second entry here,
 * not an abstraction built in advance of it.
 *
 * @type {Record<string, (outcome: { stdout: string, status: number, stderr: string }) => { ok: boolean, detail: string }>}
 */
const INTERPRETERS = {
  'design-slop': designSlopEvidence,
  gitleaks: gitleaksEvidence,
  // Bound to the run's ERD, which is why this one is a factory rather than a constant: the other
  // two judge output against fixed rules, and this judges it against the operator's diagram.
  // Registered by `armSchemaInterpreter` once the ERD is known, so a run without one cannot reach
  // an interpreter that would have nothing to compare against.
  'schema-conformance': () => ({ ok: false, detail: 'the schema interpreter was never armed with an ERD' }),
};

/**
 * Point the `schema-conformance` interpreter at this run's ERD.
 *
 * **Fails closed until armed.** The placeholder above returns a failure rather than a pass, so a
 * gate that somehow ran before the diagram was known reports that fact instead of certifying a
 * schema nothing was compared to.
 *
 * @param {import('./erd.mjs').Erd | null} erd
 */
export function armSchemaInterpreter(erd) {
  INTERPRETERS['schema-conformance'] =
    erd === null
      ? () => ({ ok: false, detail: 'the schema interpreter was never armed with an ERD' })
      : (outcome) => schemaEvidence(erd, { ok: outcome.status === 0, ...outcome });
}

/**
 * The sentence a builder needs when Stryker says "No tests were executed" — the `runnerHint`
 * move, applied to the mutation gate.
 *
 * Reproduced against the Tallyho target (attempts 3 and 4, DOGFOOD.md): the vitest runner scopes
 * the dry run to tests RELATED to the mutated files, so when an iteration's changed source is
 * exercised by no unit test at all — a React component covered only by Playwright — vitest
 * executes zero tests and Stryker throws `ConfigError: No tests were executed. … check your
 * configuration.` The configuration is fine; the true fact is *your changed code has no unit
 * coverage*, and a builder sent to "check configuration" burns iterations reinstalling Stryker
 * (attempt 4 stalled on exactly that misdirection, five iterations running). A rule with a
 * reason must say the reason where it fails.
 *
 * @param {string} gateName
 * @param {string} detail
 * @returns {string} a teaching suffix, or the empty string
 */
function mutationCoverageHint(gateName, detail) {
  if (gateName !== 'mutation' || !detail.includes('No tests were executed')) return '';
  return (
    '\n\nWhat this actually means: the mutation runner scopes its dry run to unit tests RELATED to ' +
    "the files this iteration changed, and none of your changed source files are exercised by any unit " +
    'test — so zero tests ran and Stryker aborted. The configuration is fine; the repair is unit tests ' +
    'covering the changed code (an e2e test does not count here: mutation runs the unit runner only).'
  );
}

/**
 * How many flaky ids a stability failure names before it starts counting instead of listing.
 *
 * Bounded because this text reaches the builder's brief: a repair objective naming four hundred
 * tests is not a repair objective.
 */
export const STABILITY_ID_LIMIT = 20;

/**
 * How many uncleared report paths a freshness failure names before it counts instead of listing.
 *
 * Bounded for the same reason as `STABILITY_ID_LIMIT`: this text reaches the builder's brief. The
 * real list is short — a toolchain declares two or three report paths — so the cap is a guard
 * against a future toolchain rather than an expected truncation.
 */
export const UNCLEARED_PATH_LIMIT = 20;

/**
 * One deterministic gate result for report paths this attempt could not clear (REVIEW F32).
 *
 * **F16 removed the reports before an attempt and read back whatever was there afterwards, which
 * makes absence mean "this attempt produced nothing".** That argument holds only for a path the
 * removal reached. `clearReports` always reported the ones it could not remove and the Driver
 * logged them and ran the gate regardless — so an unremovable *old passing* report survived, an
 * exit-zero gate declined to replace it, and F16's own reasoning then certified it as fresh.
 *
 * The refusal has two halves and needs both. `collectReports` withholds the evidence; this makes
 * the attempt **fail**, because a run whose evidence was withheld and whose gates all passed would
 * otherwise read as a clean iteration that merely collected nothing. It is not a passing iteration:
 * the workspace is in a state where the run cannot tell its own output from the last attempt's.
 *
 * @param {string[]} uncleared absolute report paths `clearReports` could not remove
 * @param {string} root the tree they belong to, so the detail names them relatively
 * @returns {GateResult | null} null when every declared report path was cleared
 */
export function reportFreshnessGateResult(uncleared, root) {
  const paths = [...new Set(uncleared)].sort();
  if (paths.length === 0) return null;
  const named = paths.map((file) => path.relative(root, file)).slice(0, UNCLEARED_PATH_LIMIT);
  const more = paths.length - named.length;
  return {
    name: 'report-freshness',
    ok: false,
    status: 1,
    detail:
      `${paths.length} declared test-report path(s) could not be removed before this attempt ran, so anything ` +
      'found at them afterwards may be the previous attempt\'s output rather than this one\'s. No test evidence ' +
      'was read this iteration. Something is holding these paths open, or the directory is not writable — free ' +
      `them and re-run: ${named.join(', ')}${more > 0 ? ` and ${more} more` : ''}`,
  };
}

/**
 * One deterministic gate result for tests that failed and then passed on a retry (REVIEW F30).
 *
 * **The hole this fills is an asymmetry nobody would have chosen.** The Playwright parser preserves
 * the runner's whole-test `flaky` status on purpose, and the ratchet refuses to credit it on
 * purpose — a test that failed and then passed has proved nothing, and admitting it would arm a
 * hard reset that fires on noise. But nothing turned that refusal into a *failure*. Playwright
 * exits zero when every test is expected or flaky, so a **newly** flaky test — one with no earlier
 * ratchet identity to regress against — left every gate green and could reach the Panel and
 * `SHIPPED`, while the run's own normalised evidence said the test had failed before it retried.
 * Acceptance depended on whether the instability appeared before or after the ratchet first saw the
 * test, which is not a property anyone would defend out loud.
 *
 * A previously ratcheted id becoming flaky keeps the stronger treatment it already had: it is
 * absent from the passing set, so it is a regression and a reset, not merely a gate failure.
 *
 * `skipped` and `todo` are untouched. They are absences, not unstable passes, and reinterpreting
 * them here would fail every suite with a pending test in it.
 *
 * @param {Iterable<string>} flakyIds normalised ids whose worst status this attempt was `flaky`
 * @returns {GateResult | null} null when nothing was flaky
 */
export function stabilityGateResult(flakyIds) {
  const ids = [...new Set(flakyIds)].sort();
  if (ids.length === 0) return null;
  const named = ids.slice(0, STABILITY_ID_LIMIT);
  const more = ids.length - named.length;
  return {
    name: 'test-stability',
    ok: false,
    status: 1,
    detail:
      `${ids.length} test(s) in this attempt's reports failed and then passed on a retry, which is not a passing ` +
      'result: nothing here shows the current implementation satisfies them reliably. Make them deterministic — ' +
      'fix the race, the timing assumption or the shared state — or delete them. ' +
      `${named.join(', ')}${more > 0 ? ` and ${more} more` : ''}`,
  };
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
 *   bestGateScore: number, bestGateShare: number, bestPassingCount: number
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
 * @param {MeeseeksConfig} config
 * @param {number} [elapsedMs] wall clock since the run began, checked only when
 *   `config.deadlineMs` is non-zero
 * @returns {{ continue: true } | { continue: false, state: TerminalState, reason: string }}
 */
export function shouldContinue(progress, config, elapsedMs = 0) {
  // **The wall clock, and it is off unless something switched it on.** A run-level time ceiling
  // was considered and refused for ordinary runs — the ceiling is completion or budget. It exists
  // for one case: `--give-them-the-box`, where nesting is permitted and the usual bounds stop
  // being sufficient. Depth is capped at two, but nothing caps how many nested runs a builder
  // starts *within* one iteration, so the reachable work is
  // `iterations x invocations x depth`, and only the middle term has no limit. With the ceilings
  // also switched off for development, that product is unbounded in practice.
  //
  // Checked between iterations, which is where it can be checked: a child that hangs is bounded
  // by `childTimeoutMs`, and ending a run mid-iteration would abandon a tree nothing has judged.
  if (config.deadlineMs > 0 && elapsedMs >= config.deadlineMs) {
    return {
      continue: false,
      state: 'BUDGET',
      reason: `wall-clock deadline reached: ${Math.round(elapsedMs / 1000)}s of ${Math.round(config.deadlineMs / 1000)}s`,
    };
  }
  // **Zero means no ceiling**, the convention `maxChildTurns` already uses. Intended for
  // development and dogfooding on a plan where spend is not the constraint, and deliberately not
  // the default: `BRIEF.md` §E lists hard budget limits among the things to preserve, so this is
  // an operator switching one off in their own configuration rather than a softened default.
  //
  // **The run still terminates**, which is what makes it safe to offer. `maxIterations`, the
  // stall limit and the ratchet are untouched, and they are the mechanisms that bound the loop;
  // the ceilings bound the *bill*. A run with no ceilings ends on completion, on the iteration
  // cap, or on a stall, and cannot run forever.
  if (config.tokenCeiling > 0 && progress.spentTokens >= config.tokenCeiling) {
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
  if (config.costCeiling > 0 && progress.spentUsd >= config.costCeiling) {
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
 * Improvement is a larger *share* of the applicable gates passing than ever before, or a test id
 * the ratchet did not hold. Anything else is a stalled iteration, however busy it looked.
 *
 * **The share, not the count, and the difference is a measured defect.** Gate rosters change
 * size mid-run: capabilities are re-detected every iteration (§3.7) and a toolchain switch
 * declines whole operations — `dotnet` declines `types` and `e2e` by name. Comparing raw counts
 * against a best-ever count then punishes a shrinking roster:
 *
 * ```
 * node   iteration, 4 of 6 gates pass  -> best 4, not stalled
 * dotnet iteration, 3 of 4 gates pass  -> stalled 1   (a better share)
 * dotnet iteration, 4 of 4 gates pass  -> stalled 2   (everything applicable passes)
 * ```
 *
 * **A fully green iteration marched the run toward `STALLED`.** By share those read 0.67, 0.75
 * and 1.0 — two genuine improvements, correctly.
 *
 * The share also keeps the case the count got right: a run that is green every iteration while
 * the panel keeps failing has a share of 1.0 that never rises, so it still stalls. That is why
 * this is a ratio rather than a special case for "everything passes", which would have made such
 * a run immortal.
 *
 * A roster of zero applicable gates scores zero rather than dividing by it — no gates ran, so
 * nothing was demonstrated.
 *
 * @param {RunProgress} progress
 * @param {{ gateScore: number, gateTotal?: number, passingCount: number }} iteration
 *   `gateTotal` is how many gates actually ran; omitted, the score is treated as its own total
 *   so a caller that cannot say degrades to the old count comparison rather than to nonsense
 * @returns {RunProgress}
 */
export function recordProgress(progress, iteration) {
  const total = iteration.gateTotal;
  const share = total !== undefined && total > 0 ? iteration.gateScore / total : 0;
  // A caller that cannot say how many gates ran degrades to the old count comparison rather
  // than to a share of one, which would read every iteration as perfect.
  const gateImproved =
    total === undefined ? iteration.gateScore > progress.bestGateScore : share > progress.bestGateShare;
  const improved = gateImproved || iteration.passingCount > progress.bestPassingCount;
  return {
    ...progress,
    iteration: progress.iteration + 1,
    stalledIterations: improved ? 0 : progress.stalledIterations + 1,
    bestGateScore: Math.max(progress.bestGateScore, iteration.gateScore),
    bestGateShare: Math.max(progress.bestGateShare, share),
    bestPassingCount: Math.max(progress.bestPassingCount, iteration.passingCount),
  };
}

/**
 * Broadcast minutes remaining (DESIGN.md §13.5). Cosmetic, but reads the real budget.
 *
 * @param {RunProgress} progress
 * @param {MeeseeksConfig} config
 * @returns {{ iterationsLeft: number, tokensLeft: number, usdLeft: number, fractionLeft: number }}
 */
export function airtimeRemaining(progress, config) {
  const iterationsLeft = Math.max(0, config.maxIterations - progress.iteration);
  const tokensLeft = Math.max(0, config.tokenCeiling - progress.spentTokens);
  const usdLeft = Math.max(0, config.costCeiling - progress.spentUsd);
  const byIterations = config.maxIterations === 0 ? 0 : iterationsLeft / config.maxIterations;
  // **A disabled ceiling contributes 1, not 0.** Zero means "no ceiling" (see `shouldContinue`),
  // and a limit that can never bind must not be the one the counter reports — reporting 0 would
  // pin the display at "0% of budget remaining" for the whole of an unlimited run. The `*Left`
  // figures above stay 0 for a disabled ceiling because nothing displays them; `fractionLeft` is
  // what reaches an operator.
  const byTokens = config.tokenCeiling === 0 ? 1 : tokensLeft / config.tokenCeiling;
  // The tightest of the three, so the counter reports the limit that will actually end the
  // run rather than the most flattering one.
  const byUsd = config.costCeiling === 0 ? 1 : usdLeft / config.costCeiling;
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
 * @returns {{ maxBudgetUsd?: number, maxTurns?: number }}
 */
export function childBudget(config, spentUsd) {
  // **No cost ceiling means no per-child allowance to derive.** `--max-budget-usd` exists to
  // bound a child against what the *run* has left, and with the ceiling off there is nothing to
  // divide. Passing a number anyway would be inventing a limit the operator switched off; passing
  // `Infinity` would hand the CLI a string it has no reason to accept.
  if (config.costCeiling === 0) {
    return config.maxChildTurns > 0 ? { maxTurns: config.maxChildTurns } : {};
  }
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
 *   ok: boolean, text: string, costUsd: number, tokens: number, raw: string, exhausted?: boolean,
 *   denials?: string[],
 *   supply?: import('./role-supply.mjs').RoleSupplyManifest,
 *   observedModels?: ObservedModels
 * }} ClaudeResult
 *
 * `observedModels` is tagged rather than optional-with-a-default: an envelope that reported nothing
 * says so, and never borrows the requested selector to fill the gap (REVIEW F22).
 *
 * @typedef {{ observed: string[] } | { unavailable: string }} ObservedModels
 *
 * `denials` carries any guard refusals the child's stderr reported. **Case J is why it exists:**
 * that run could not tell whether its builder declined to nest or was refused, because a hook's
 * deny lives in a conversation the driver never sees. The guard now writes one line to stderr on
 * every denial and this is where it lands.
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
  // Clamped at zero, each term and the cost below. A malformed envelope reporting a negative
  // count would otherwise *reduce* the run's totals — `charge()` adds these to `spentTokens`
  // and `spentUsd`, so a negative is not a smaller charge, it is a refund nothing earned.
  // Nothing defaults to pass includes nothing decrements the bill.
  const count = (/** @type {unknown} */ value) => Math.max(0, Number(value) || 0);
  const tokens =
    count(usage.input_tokens) +
    count(usage.output_tokens) +
    count(usage.cache_creation_input_tokens) +
    count(usage.cache_read_input_tokens);

  const ok = record.is_error === false && typeof record.result === 'string';
  return {
    ok,
    text: typeof record.result === 'string' ? record.result : '',
    costUsd: count(record.total_cost_usd),
    tokens,
    raw: stdout,
    exhausted: !ok && EXHAUSTION_PATTERN.test(stdout),
    // **Which model actually served this, as the vendor reported it** (REVIEW F22). The envelope
    // carries a `modelUsage` map keyed by real model identifiers, and nothing was reading it — so
    // every record of "which model did this work" was the *selector this driver asked for*. A
    // configured alias is not evidence that the requested model answered, and a substitution was
    // therefore invisible: `claude-sonnet-5` in the config and something else on the wire would
    // read identically afterwards.
    //
    // Tagged rather than defaulted. An envelope with no usable map is `unavailable` **with a
    // reason**, never the requested selector filled in as though it had been observed — that is the
    // one substitution F22 refuses, because it turns an absence of evidence into a claim.
    observedModels: observedModels(record),
  };
}

/**
 * The model identifiers the vendor reported, or an explicit statement that none were.
 *
 * @param {Record<string, unknown>} record a parsed `claude -p --output-format json` envelope
 * @returns {{ observed: string[] } | { unavailable: string }}
 */
function observedModels(record) {
  const usage = record.modelUsage;
  if (usage === null || typeof usage !== 'object' || Array.isArray(usage)) {
    return { unavailable: 'the envelope carried no modelUsage map' };
  }
  const names = Object.keys(/** @type {Record<string, unknown>} */ (usage)).filter((name) => name !== '');
  if (names.length === 0) return { unavailable: 'the envelope carried an empty modelUsage map' };
  return { observed: names.sort() };
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
 * The driver applies the Meeseeks voice itself, at render, from `style.mjs`. Children speak
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
 * 12 August 2026, a child stamped `MEESEEKS_RUNNING=1` overwrote `.meeseeks/state.json` through
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
function childSettings(sandbox = false) {
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
      // Every quoted path in the command must exist. The command is a chain since item 37 —
      // `node "guard.mjs" || node "guard-fallback.cjs"` — so the old first-quote-to-last-quote
      // slice would span the ` || node ` in the middle and name no file. Validating each quoted
      // segment is also stricter than the single-span check was: a chain whose fallback is
      // missing now refuses to spawn, exactly like a chain whose guard is.
      const scripts = [...command.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
      if (scripts.length === 0) {
        throw new DriverError(`the guard hook command names no file on disk: ${command}`);
      }
      for (const script of scripts) {
        if (!existsSync(script)) {
          throw new DriverError(`the guard hook command names a file that is not on disk: ${script} (in: ${command})`);
        }
      }
    }
  }
  // R19. An OS-level floor **under** the guard, never instead of it. The guard sees tool calls;
  // it cannot see what the code a builder wrote does at runtime, which is the A2 limitation and
  // is the layer a kernel sandbox reaches.
  //
  // The key was read out of the CLI binary rather than guessed: 2.1.228 answers a refused
  // command with *"Set \"sandbox\": {\"enabled\": true} in Claude Code settings"*.
  //
  // **Declared here and verified elsewhere, because print mode will not tell us.** `claude
  // --help` states that in `-p` mode "settings files that fail validation are silently
  // ignored" — so a sandbox key this CLI did not understand would vanish without a word, which
  // is the guard's own eleven-version history repeating with a different key. `preflight.mjs`
  // checks the host can sandbox at all and **refuses the run** rather than letting a child
  // proceed unsandboxed: a sandbox that can be declined is not a sandbox, and one that
  // evaporates quietly is worse than none because it is believed.
  // The hooks system honors a `disableAllHooks` setting whose precedence the target repo's
  // own `.claude/settings.json` and `.claude/settings.local.json` participate in — so a
  // builder that wrote `{"disableAllHooks": true}` there would unguard every later child
  // (PLAN item 28). The guard's `protected-settings` rule denies that write; this line is
  // the other half: the driver STATES the fact in the blob it owns rather than inheriting
  // whatever the tree says. Only the live tier can prove which source the CLI lets win —
  // `test/live/guard-killswitch.live.test.mjs` is that assertion.
  return JSON.stringify({
    outputStyle: CHILD_OUTPUT_STYLE,
    disableAllHooks: false,
    hooks,
    ...(sandbox ? { sandbox: { enabled: true } } : {}),
  });
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
/**
 * **Two questions, not one** (REVIEW F27). `allowedTools` is what may run *without asking*;
 * `availableTools` is what exists in the child's context at all. Conflating them is how the oracle
 * author came to have an empty approval list and a full read-only toolset.
 *
 * `availableTools: null` means the flag is not passed — the builder, and only the builder.
 *
 * @type {Record<string, { dangerous: boolean, allowedTools: string[], availableTools: string[] | null }>}
 */
export const PHASE_PERMISSIONS = {
  // Unrestricted on purpose, and the only role that is. `availableTools: null` means no `--tools`
  // flag at all, which leaves the built-in set exactly as it has always been.
  builder: { dangerous: true, allowedTools: [], availableTools: null },
  prd: {
    dangerous: false,
    allowedTools: ['Read', 'Glob', 'Grep', 'Write', 'Edit'],
    availableTools: ['Read', 'Glob', 'Grep', 'Write', 'Edit'],
  },
  design: {
    dangerous: false,
    allowedTools: ['Read', 'Glob', 'Grep', 'Write', 'Edit'],
    availableTools: ['Read', 'Glob', 'Grep', 'Write', 'Edit'],
  },
  review: { dangerous: false, allowedTools: ['Read', 'Glob', 'Grep'], availableTools: ['Read', 'Glob', 'Grep'] },
  'reality-check': {
    dangerous: false,
    allowedTools: ['Read', 'Glob', 'Grep'],
    availableTools: ['Read', 'Glob', 'Grep'],
  },
  // Reads the evidence it was handed and answers with a sentence or with null. It has no
  // reason to write, and lesson memory is driver-owned precisely so that it cannot.
  'lesson-extractor': {
    dangerous: false,
    allowedTools: ['Read', 'Glob', 'Grep'],
    availableTools: ['Read', 'Glob', 'Grep'],
  },
  // One question about one pinned defensive element: was it removed, was it moved, or can you
  // not tell. Read-only for the same reason every reviewer is — it reports, it does not fix,
  // and a child that could restore the guard itself would be judging its own repair.
  'security-escalation': {
    dangerous: false,
    allowedTools: ['Read', 'Glob', 'Grep'],
    availableTools: ['Read', 'Glob', 'Grep'],
  },
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
  //
  // **And an empty `allowedTools` was never the way to say that** (REVIEW F27). `--allowedTools`
  // changes what is *approved*, not what is *available*, and read-only tools need no approval — so
  // omitting the flag left `Read`, `Glob` and `Grep` reachable, and on a resumed tree the author
  // could open the very implementation its cases are meant to be held out from. The empty set is
  // now said in the flag that means it: `--tools ""`, documented by the CLI as disabling all tools.
  'oracle-author': { dangerous: false, allowedTools: [], availableTools: [] },
};

/**
 * @param {string} phase
 * @returns {{ dangerous: boolean, allowedTools: string[], availableTools: string[] | null }}
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
 * 0.59.0 guard still overwrote `.meeseeks/state.json` with `permission_denials: []`. Safe mode and
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
 * The variables a child needs whatever it is building, on any platform.
 *
 * **Measured, not assumed** (PLAN.md item 56 slice A, 19 Aug 2026). A real `claude -p` child
 * authenticated and answered with `PATH` alone; `HOME` and the rest are here because the *target's*
 * tools need them — npm's cache, git's config, a compiler's temp directory — not because the CLI
 * did. Erring toward keeping a benign name is the safe direction: a missing `TMPDIR` breaks a build
 * loudly, while a leaked credential breaks nothing and is never noticed.
 */
const BASE_ENV_NAMES = [
  'PATH',
  'HOME',
  'SHELL',
  'USER',
  'LOGNAME',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TZ',
  'TMPDIR',
  'TMP',
  'TEMP',
  'TERM',
];

/**
 * Windows necessities. Absent from a POSIX environment, so listing them costs nothing there and
 * omitting them would make a Windows child unable to find its own shell.
 */
const WINDOWS_ENV_NAMES = [
  'SYSTEMROOT',
  'WINDIR',
  'COMSPEC',
  'PATHEXT',
  'APPDATA',
  'LOCALAPPDATA',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'PROGRAMFILES',
  'PROGRAMFILES(X86)',
  'PROGRAMDATA',
  'SYSTEMDRIVE',
  'NUMBER_OF_PROCESSORS',
  'PROCESSOR_ARCHITECTURE',
];

/**
 * How the installed CLI authenticates.
 *
 * **These are ambient credentials and they still cross, deliberately, with the residual recorded.**
 * The parent `claude` process cannot authenticate without whichever of these its provider uses, so
 * removing them removes the run. What F5 wants — that the *Builder's shell* not hold them — is a
 * different boundary from this one: a child process and the Bash it spawns share an environment, and
 * separating them needs `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`, whose provider coverage is unmeasured
 * here and belongs to item 84. Naming them keeps that residual visible instead of letting it hide
 * inside a blanket copy of everything.
 */
const AUTH_ENV_NAMES = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_CUSTOM_HEADERS',
  'CLAUDE_CODE_OAUTH_TOKEN',
  // The provider selectors themselves always cross: they decide which of the sets below is needed,
  // and a run that cannot say which provider it is using cannot authenticate to any of them.
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
];

/**
 * Cloud-provider credentials, carried **only when that provider is the one in use**.
 *
 * The first measurement of the enforced boundary is why this exists. Every synthetic secret and
 * every ambient control variable had stopped crossing, and `AWS_SECRET_ACCESS_KEY` was still
 * present — correctly, if the run authenticates through Bedrock, and as a pure leak otherwise. A
 * machine that has AWS credentials for something entirely unrelated is the ordinary case, not the
 * exceptional one.
 *
 * So the selector decides. `CLAUDE_CODE_USE_BEDROCK` unset means the run is not talking to Bedrock,
 * which means these are not authentication for it — they are somebody else's keys, sitting in an
 * unattended Builder's shell for no reason at all.
 */
const PROVIDER_ENV_NAMES = {
  CLAUDE_CODE_USE_BEDROCK: [
    'AWS_REGION',
    'AWS_DEFAULT_REGION',
    'AWS_PROFILE',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_SESSION_TOKEN',
    'AWS_BEARER_TOKEN_BEDROCK',
    'AWS_CONTAINER_CREDENTIALS_FULL_URI',
    'AWS_CONTAINER_AUTHORIZATION_TOKEN',
  ],
  CLAUDE_CODE_USE_VERTEX: [
    'CLOUD_ML_REGION',
    'GOOGLE_APPLICATION_CREDENTIALS',
    'GOOGLE_CLOUD_PROJECT',
    'ANTHROPIC_VERTEX_PROJECT_ID',
  ],
};

/**
 * Markers this Driver owns by name. They are set by the Driver into the environment it passes here,
 * so they are kept by name rather than by origin — nothing in a process environment records who put
 * a variable there.
 *
 * An operator allowlist may not name any of these, and {@link childEnvironment} refuses one that
 * does. A run whose depth marker or guard marker could be renamed into existence by configuration
 * has no boundary at all.
 */
const DRIVER_OWNED_ENV_NAMES = [
  REENTRANCY_ENV,
  DEPTH_ENV,
  BOX_ENV,
  DENIAL_STATE_ENV,
  NESTING_AUTHORITY_ENV,
  NESTING_TICKET_ENV,
];

/**
 * Every ambient variable that is **not** carried, expressed positionally.
 *
 * This is a keep-list, and that is the whole design. `childEnvironment` used to be
 * `{ ...env, MEESEEKS_RUNNING: '1' }`, which meant every variable defaulted to *crossing* and the
 * only ones that did not were the ones nobody had. A deny-list would have the same defect the guard
 * hook's enumeration had: each new secret a machine acquires is admitted until somebody remembers to
 * add it. Measured against a real child on 19 Aug 2026, a Builder-launched Bash could read a
 * synthetic deploy token, a synthetic database URL, a synthetic AWS secret, and four ambient
 * `CLAUDE_CODE_*`/`MAX_THINKING_TOKENS` control-plane values — every one of which can change
 * retry, resume, model routing, or budget behaviour underneath a sealed role contract.
 */
export const CHILD_ENV_KEPT = Object.freeze([
  ...BASE_ENV_NAMES,
  ...WINDOWS_ENV_NAMES,
  ...AUTH_ENV_NAMES,
  ...DRIVER_OWNED_ENV_NAMES,
]);

/** Thrown when an operator's environment allowlist would breach the boundary it configures. */
export class ChildEnvironmentError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'ChildEnvironmentError';
  }
}

/**
 * Build the environment a `claude -p` child runs in.
 *
 * **A keep-list, since 0.232.0** (REVIEW F5, PLAN item 56). See {@link CHILD_ENV_KEPT} for why the
 * polarity is the whole design and for what a real child was measured reading before it changed.
 *
 * `allowNames` is the operator's escape hatch for a target tool that genuinely needs a variable —
 * names only, never values, and never a name this Driver owns. Values are read from the environment
 * passed in; nothing here reads `process.env` directly, so a test can drive it without a machine.
 *
 * Nothing is logged, persisted, or placed in a receipt. Where a refusal has to name something it
 * names the **variable name**, which is the operator's own configuration text, never the value.
 *
 * @param {Record<string, string | undefined>} env
 * @param {string[]} [allowNames] additional variable names the operator has permitted
 * @returns {Record<string, string | undefined>}
 * @throws {ChildEnvironmentError} when the allowlist names a Driver-owned marker
 */
export function childEnvironment(env, allowNames = []) {
  // **`CI=1` was added here once and reverted the same hour, and the record matters more than
  // the feature.** Ateliers attempt 1's builder hung its whole 30-minute ceiling on what looked
  // like an interactive scaffolder prompt, and forcing the industry-wide `CI=1` "nobody is
  // watching" signal into every child seemed like the positional fix. Tier 3 failed on it —
  // the improve-author child returned zero requirements — and a direct probe confirmed
  // causality: `CI=1 claude -p` returns `"is_error":true` with `duration_api_ms:0` before any
  // API call. The claude CLI itself refuses under CI, so the env route poisons the one process
  // the environment is actually built for. The unattended-scaffolding instruction lives in the
  // node toolchain guidance instead, where the builder can apply it to ITS OWN shell commands
  // without the driver's child inheriting it. This is the argv-defect lesson again: the
  // contract was owned by a different binary, and only the live tier could see it.
  const owned = new Set(DRIVER_OWNED_ENV_NAMES);
  for (const name of allowNames) {
    if (typeof name !== 'string' || name.trim() === '') {
      throw new ChildEnvironmentError(
        'an environment allowlist entry is empty. Names only, and a blank name cannot be one.',
      );
    }
    if (owned.has(name.trim())) {
      throw new ChildEnvironmentError(
        `the environment allowlist names ${JSON.stringify(name.trim())}, which this Driver owns. A run whose ` +
          'guard, depth or nesting marker could be introduced by configuration has no boundary to enforce.',
      );
    }
  }

  const keep = new Set([...CHILD_ENV_KEPT, ...allowNames.map((name) => name.trim())]);
  // A provider's credentials join the keep-list only when its selector says the run uses it. An
  // unset selector is the common case and it is not ambiguous: those keys are for something else.
  for (const [selector, names] of Object.entries(PROVIDER_ENV_NAMES)) {
    const chosen = env[selector];
    if (chosen === undefined || chosen === '' || chosen === '0' || chosen.toLowerCase() === 'false') continue;
    for (const name of names) keep.add(name);
  }
  /** @type {Record<string, string | undefined>} */
  const marked = {};
  for (const name of keep) {
    // Absent stays absent. Writing `undefined` for every name in the keep-list would hand the child
    // a wall of empty variables and make "unset" indistinguishable from "set to nothing" for any
    // tool that checks presence rather than value.
    if (Object.hasOwn(env, name) && env[name] !== undefined) marked[name] = env[name];
  }
  marked[REENTRANCY_ENV] = '1';

  // The depth a *nested* driver would see, and it is counted here because a child's environment
  // is exactly what such a driver would inherit. Only when the box is armed: with the flag
  // absent the key never appears, so an ordinary run's children carry nothing new at all.
  if (marked[BOX_ENV] !== undefined && marked[BOX_ENV] !== '') {
    const depth = parseRunDepth(marked[DEPTH_ENV]);
    // Preserve a malformed value so both the child's guard and any nested Driver refuse it. Turning
    // it into `1` would launder corrupt state into fresh permission before either boundary sees it.
    if (depth !== null) marked[DEPTH_ENV] = String(depth + 1);
  }
  return marked;
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
 *   maxBudgetUsd?: number, maxTurns?: number, sandbox?: boolean }} options
 * @returns {string[]}
 */
export function claudeArgs(options) {
  const policy = permissionsFor(options.phase);
  // Only phases that keep the guard get the sandbox, and the split is *derived* rather than
  // listed — `isColdPhase` already separates read-only phases, which run under `--safe-mode`
  // and would have every customization stripped anyway. A phase added later with write tools
  // is sandboxed automatically, which is the same reason the guard's own split is derived.
  const sandbox = options.sandbox === true && !isColdPhase(options.phase);
  const args = ['-p', '--output-format', 'json', '--settings', childSettings(sandbox), '--model', options.model];
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
  // **Availability, which is a different question from approval** (REVIEW F27). `--allowedTools`
  // decides what may run *without asking*; `--tools` decides what exists in the child's context at
  // all. The table said "no tools" for the oracle author by declaring an empty approval list, and
  // that is not what an empty approval list means: read-only tools are available unapproved, so the
  // author could read `src/` on a resumed tree and write cases against the code it exists to be
  // independent of. `--safe-mode` does not close this either — it strips customizations, and
  // neither the CLI contract nor anything measured here establishes it as an exact tool set.
  //
  // Placed before the variadic `--allowedTools` for the reason everything else here is: a value
  // after that flag is read as one more tool name. `--tools` is itself variadic, which is why it
  // is never last.
  //
  // `null` means *do not pass the flag*, which is the builder and only the builder. An empty array
  // is passed as the CLI's documented `""`, disabling every built-in.
  if (policy.availableTools !== null) {
    args.push('--tools', policy.availableTools.length === 0 ? '' : policy.availableTools.join(','));
    // Inherited MCP servers are a second availability surface the table never described, and a
    // non-builder role broadened by the operator's own MCP configuration is exactly the crossing
    // F27 names. With no `--mcp-config`, this leaves none.
    args.push('--strict-mcp-config');
  }
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
 * @param {string} meeseeksDir
 * @param {{ iteration: number, regressions: string[], diffStat: string, at: string }} event
 * @returns {string} the path written
 */
export function appendBlooper(meeseeksDir, event) {
  mkdirSync(meeseeksDir, { recursive: true });
  const file = path.join(meeseeksDir, 'bloopers.log');
  appendFileSync(file, `${JSON.stringify(formatBlooperRecord(event))}\n`, 'utf8');
  return file;
}

/**
 * How many consecutive iterations a gate must fail before the loop says so.
 *
 * **Three, and two would be wrong.** A gate failing twice is ordinary — a builder working on
 * something else leaves it failing, and that is not a signal. Three consecutive identical
 * failures means the builder is not addressing it at all, which is a different fact.
 */
export const REPEATED_GATE_THRESHOLD = 3;

/**
 * What to tell a builder that has failed the same gate three iterations running.
 *
 * **Measured in case I, and the cost was the entire run.** Eight iterations, 40,000,137 tokens
 * and \$20.45 went to a project that failed `observability` — *"missing: structured logging"* —
 * on **every single one**. Nothing else failed. The gate was correctly armed and the requirement
 * was a line of work; the builder simply never did it, and **no mechanism ever said "you have
 * failed this same thing eight times."**
 *
 * 0.109.0 gave the loop a voice for a repeating *test*. This is the same defect wearing the other
 * hat, and case I is what it costs: a run can spend its entire budget stalled on one static gate
 * while every individual iteration reports its failure correctly and no one is counting.
 *
 * Consecutive, not cumulative. A gate that fails, passes, and fails again is a builder making
 * progress and losing it — a different problem, and the streak resets so this note does not
 * fire for it.
 *
 * @param {Map<string, number>} streaks consecutive failures per gate, *after* this iteration
 * @returns {string} empty when nothing has reached the threshold
 */
export function repeatedGateNote(streaks) {
  const stuck = [...streaks.entries()]
    .filter(([, count]) => count >= REPEATED_GATE_THRESHOLD)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, count]) => `${name} (${count} iterations running)`);
  if (stuck.length === 0) return '';
  return (
    `${stuck.join(', ')} has failed every iteration for some time and is the reason this run is not ` +
    'progressing. Fix it before anything else: no amount of other work can end the run while it fails, ' +
    'and the panel is never reached'
  );
}

/**
 * What to tell a builder that has broken the same test twice.
 *
 * **Measured in `ship1` on 13 August 2026, and it is the reason this exists.** The ratcheted
 * test `parseCsv > an unterminated quote at EOF ends the field at EOF` asserted precisely the
 * behaviour the panel's `DoD-6` called a defect — an EOF flush that pushes a pending record
 * without testing `inQuotes`, losing a data row at exit 0. The builder wrote that test early,
 * encoding the bug as a specification, and the ratchet then made it permanent. Every attempt to
 * satisfy the panel broke it, reset, and destroyed the iteration. Twice, silently: the log said
 * `regression:` and one test name, exactly as it does for a builder that slipped once.
 *
 * **A repeat is a different fact from a first offence** and the loop could not say so. That is
 * this project's named worst failure — a degradation that never reports anything.
 *
 * The note does **not** weaken the ratchet, and could not: a test id is the reporter's test
 * *name*, so the assertions inside an `it(...)` may be rewritten while the id keeps passing,
 * and renaming or deleting it drops the id and reads as a regression like any other.
 * Monotonicity is untouched; what changes is that the builder is no longer expected to
 * rediscover the escape while being reset every time it tries.
 *
 * **The ordering of the two escapes is evidence, not taste, and the first draft had it backwards.**
 * `ship1`'s builder eventually broke its own lock on iteration 11 — and it did **not** rewrite the
 * test. `src/csv.test.ts` was left untouched, still asserting that an unterminated quote at EOF
 * ends the field there; the refusal was added *above* the parser, and the ratchet gained
 * `src/cli.test.ts::main > PRD-2.1: a record left inside an unterminated quote at EOF is refused,
 * not silently merged`. The passing set went 77 → 91. Both the test and the finding were
 * satisfied because they were never actually about the same layer.
 *
 * So the layering move is offered **first** and the rewrite only as a fallback. Leading with
 * "rewrite the assertions" points a stuck builder at the one move that can gut a test while
 * keeping its id green — precisely what A6 and `integrity.mjs` exist to catch — when the safer
 * move usually exists and produces a better design.
 *
 * Counted **within the run**. `bloopers.log` outlives a run, and an identical regression from
 * a run that ended yesterday is not evidence about this one.
 *
 * @param {Map<string, number>} counts regressions seen so far this run, before this reset
 * @param {string[]} regressions the ids that just regressed
 * @returns {string} empty when nothing has regressed before
 */
export function repeatedRegressionNote(counts, regressions) {
  const repeats = regressions
    .filter((id) => (counts.get(id) ?? 0) >= 1)
    .map((id) => `${id} (${(counts.get(id) ?? 0) + 1} times)`);
  if (repeats.length === 0) return '';
  return (
    `${repeats.join(', ')} has now regressed more than once in this run. A test that keeps breaking on the ` +
    'way to satisfying a review finding may itself be asserting the behaviour the finding calls defective. ' +
    'First look for a layer the test does not constrain: a finding about end-to-end behaviour can often be ' +
    'satisfied above the unit the test pins, leaving that unit and its test alone. Only if the finding and ' +
    'the test genuinely contradict each other, rewrite the assertions inside the test. You may not rename or ' +
    'delete it either way: the ratchet keys on the test name, so a renamed or removed test reads as a ' +
    'regression exactly like a broken one'
  );
}

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

/** @typedef {{ applied: boolean, detail: string, tokens: number, costUsd: number }} RaceOutcome */
/** @typedef {{ produced: string[], missing: string[], irregular: string[] }} ReportSources */
/**
 * What a gate result *was*, beside what it said (REVIEW F22, PLAN item 126).
 *
 * `command` is the argv the gate ran, empty for a static gate that runs no process. `reports` are
 * the report file names this gate is declared to write, from the toolchain's `reportOwners` — never
 * inferred from a filename, because the receipt binds a report digest to a gate result through it.
 *
 * @typedef {{ name: string, command: string[], reports: string[] }} GateIdentity
 */

/**
 * Every effect that shells out or spawns a child may now return a promise, because the real
 * implementations in `main` do; the loop awaits each one at its call site. A synchronous
 * double — which is what every unit test injects — satisfies the same signature, since
 * `await` passes a plain value through unchanged.
 *
 * @typedef {{
 *   build: (brief: string) => ClaudeResult | Promise<ClaudeResult>,
 *   review: (reviewer: string, ids: string[]) => ClaudeResult | Promise<ClaudeResult>,
 *   realityCheck: () => ClaudeResult | Promise<ClaudeResult>,
 *   extractLesson?: (evidence: string) => ClaudeResult | Promise<ClaudeResult>,
 *   race?: (objective: import('./brief.mjs').Objective, iteration: number, baselineShare?: number) => RaceOutcome | Promise<RaceOutcome>,
 *   history?: (findings: string[]) => import('./brief.mjs').HistoryNote[] | Promise<import('./brief.mjs').HistoryNote[]>,
 *   capabilities?: () => string[],
 *   toolchainGuidance?: () => { name: string, guidance: string } | undefined,
 *   erd?: () => import('./erd.mjs').Erd | null,
 *   journal?: (kind: string, subject: string, extra?: { iteration?: number | null, detail?: string | null }) => void,
 *   dod?: () => import('./dod.mjs').DodCriterion[],
 *   changedFiles?: () => string[] | Promise<string[]>,
 *   readSource?: (file: string) => string | null,
 *   securityEscalation?: (pin: import('./pins.mjs').SecurityPin) => ClaudeResult | Promise<ClaudeResult>,
 *   gates: () => { ok: boolean, results: GateResult[], identities?: GateIdentity[] }
 *     | Promise<{ ok: boolean, results: GateResult[], identities?: GateIdentity[] }>,
 *   shipTimeMutation?: () => { ok: boolean, detail: string } | Promise<{ ok: boolean, detail: string }>,
 *   checkSpecification: () => { ok: boolean, digest: string, detail: string },
 *   workspaceIdentity: () => string | null | Promise<string | null>,
 *   snapshotCandidate: (iteration: number) =>
 *     { ok: boolean, dir: string, tree: string | null, detail: string }
 *     | Promise<{ ok: boolean, dir: string, tree: string | null, detail: string }>,
 *   candidateSubject: () => string,
 *   candidateStillHolds?: (tree: string) => { ok: boolean, tree: string | null, detail: string }
 *     | Promise<{ ok: boolean, tree: string | null, detail: string }>,
 *   committedTree?: () => string | null | Promise<string | null>,
 *   scanSurface?: typeof scanAgentSurface,
 *   verifyPublication: () => { ok: boolean, detail: string, head?: string | null }
 *     | Promise<{ ok: boolean, detail: string, head?: string | null }>,
 *   readTestReports: () => unknown[],
 *   readReportSources?: () => ReportSources,
 *   supplyLapses?: () => string[],
 *   commit: (message: string) => string | Promise<string>,
 *   diffStat: () => string | Promise<string>,
 *   deploy?: () => { ok: boolean, detail: string } | Promise<{ ok: boolean, detail: string }>,
 *   ship: (iteration: number, commit: string) => void | Promise<void>,
 *   now: () => string,
 *   log: (line: string) => void,
 *   event?: (event: import('./style.mjs').StyleEvent) => void,
 * }} Effects
 */

/**
 * @typedef {{
 *   state: TerminalState, reason: string, iterations: number,
 *   spentTokens: number, costUsd: number, passing: string[],
 *   workspace: string | null
 * }} RunOutcome
 */

export { ACCEPTANCE_FILE } from './acceptance-file.mjs';

/**
 * Write the acceptance receipt atomically, or refuse and say which field made it incomplete.
 *
 * Atomic for `outcome.json`'s reason: a kill mid-write must leave the previous complete record or
 * nothing, never a half-parsed claim about what was accepted.
 *
 * @param {string} meeseeksDir
 * @param {Parameters<typeof buildAcceptanceReceipt>[0]} input
 * @param {{ readBack?: (file: string) => string }} [io] `readBack` exists so a test can hand back
 *   bytes that are not the ones written; the branch it exercises cannot be provoked by timing.
 * @returns {string} the path written
 */
export function writeAcceptanceReceipt(meeseeksDir, input, io = {}) {
  const receipt = buildAcceptanceReceipt(input);
  mkdirSync(meeseeksDir, { recursive: true });
  const file = path.join(meeseeksDir, ACCEPTANCE_FILE);
  const temporary = `${file}.tmp`;
  const body = `${JSON.stringify(receipt, null, 2)}\n`;
  writeFileSync(temporary, body, 'utf8');
  renameSync(temporary, file);
  // **Read back the way an auditor will, before the run walks away from it** (REVIEW F22, reopened).
  // `PLAN.md` claimed the terminal transition verified the receipt and removed an invalid one, and
  // nothing did: `verifyAcceptanceReceipt` had no production caller at all. A receipt is a claim
  // about provenance, so the only honest test of it is the one a reader performs — and a claim that
  // does not survive its own verifier is worse than no claim, because a reader would believe it.
  //
  // A receipt that fails is **removed and the failure thrown**, which the caller reports beside the
  // terminal state exactly as it reports a refusal to write one. The run's answer does not change:
  // this is forensics, and destroying a finished run over its paperwork would be the wrong way
  // round.
  /** @type {unknown} */
  let readBack;
  /** @type {string} */
  let stored;
  try {
    stored = (io.readBack ?? ((/** @type {string} */ target) => readFileSync(target, 'utf8')))(file);
    readBack = JSON.parse(stored);
  } catch (error) {
    rmSync(file, { force: true });
    throw new DriverError(
      `the acceptance receipt could not be read back after writing (${/** @type {Error} */ (error).message}), so it ` +
        'was removed rather than left as a claim nobody can verify',
    );
  }
  const verified = verifyAcceptanceReceipt(readBack, { tree: String(input.subject?.tree ?? '') });
  if (!verified.ok) {
    rmSync(file, { force: true });
    throw new DriverError(`the acceptance receipt did not survive its own verifier and was removed: ${verified.reason}`);
  }
  // **Byte-for-byte against what this call wrote**, which is the one check a later standalone reader
  // cannot make. `verifyAcceptanceReceipt` re-derives the canonical form from the file's own values,
  // so a field that was *emptied* between writing and reading — a report-digest list set to `[]` —
  // rebuilds to the same emptied form and verifies clean. Comparing with the bytes in hand catches
  // it here, at the only moment anything knows what the receipt was supposed to say.
  if (stored !== body) {
    rmSync(file, { force: true });
    throw new DriverError(
      'the acceptance receipt on disk is not the receipt that was written, so it was removed. Something changed the ' +
        'file between the write and the read back.',
    );
  }
  return file;
}

/**
 * Gate results, reduced to what a receipt may carry.
 *
 * The detail is **digested rather than quoted**: it is unbounded, target-influenced text, and F22 is
 * explicit that the receipt must not persist arbitrary raw logs. A digest still proves two runs saw
 * the same result without carrying whatever a failing suite happened to print.
 *
 * **And what the result *was*, not only what it said** (REVIEW F22, PLAN item 126). A record of
 * `name`, `ok`, `status` and a detail digest cannot support a clean-clone reconstruction: it does not
 * identify the command that produced it, the attempt it ran on, or which report bytes belong to it.
 * The argv is digested for the same reason the detail is, and a static gate's empty argv is recorded
 * as the fact it is — `commandDigest: null` means *this gate runs no process*, which is different
 * from nobody having recorded one.
 *
 * @param {GateResult[]} results
 * @param {{ identities: GateIdentity[], reportDigestByName: Record<string, string>, attempt: number }} context
 * @returns {Partial<import('./acceptance.mjs').GateRecord>[]}
 */
export function acceptanceGates(results, context) {
  const byName = new Map(context.identities.map((identity) => [identity.name, identity]));
  return results.map((result) => {
    const identity = byName.get(result.name);
    const owned = (identity?.reports ?? [])
      .map((report) => context.reportDigestByName[report])
      .filter((value) => typeof value === 'string');
    return {
      name: result.name,
      ok: result.ok,
      // Missing is not success. Preserve only a stated integer so the receipt builder can refuse a
      // result whose producer never recorded an exit status instead of laundering it into zero.
      ...(Number.isInteger(result.status) ? { status: result.status } : {}),
      detailDigest: digest(String(result.detail ?? '')),
      // The argv, digested. `null` says this gate runs no process; an identity nobody recorded is a
      // different fact and is refused by the receipt rather than defaulted to either.
      // An identity nobody recorded is left off the record entirely, so the receipt refuses it by
      // name rather than this function inventing one. In production `gateTree` supplies one for
      // every result it returns.
      ...(identity === undefined
        ? {}
        : { commandDigest: identity.command.length === 0 ? null : digest(identity.command.join(' ')) }),
      attempt: context.attempt,
      // Only the reports this gate is *declared* to write and which this attempt actually read.
      reports: [...owned].sort(),
    };
  });
}

/**
 * One gate's detail, digested, or null when that gate did not run.
 *
 * Null is the honest answer for a gate the roster never included — `oracle` is off by default and
 * `deploy` exists only when one is configured — and it is a different fact from a gate that ran and
 * failed, which appears in the roster with `ok: false`.
 *
 * @param {GateResult[]} results @param {string} name
 * @returns {string | null}
 */
export function gateDetailFor(results, name) {
  const found = results.find((result) => result.name === name);
  return found === undefined ? null : digest(String(found.detail ?? ''));
}

/**
 * A digest of the panel's own record, linking the receipt to the verdicts by identity.
 *
 * The record is archived per run; this is the edge naming *which* record. Null when no panel ever
 * wrote one, which is every run that ended before review.
 *
 * @param {string} meeseeksDir
 * @returns {string | null}
 */
export function panelRecordDigest(meeseeksDir) {
  try {
    return digest(readFileSync(path.join(meeseeksDir, REVIEW_RECORD), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Every Claude role invocation this run recorded, as the receipt describes them.
 *
 * Read back from the run's own supply store (PLAN item 77) rather than accumulated in memory: that
 * store is already written at the one door every child passes through, already archived per run,
 * and already carries the sanitized manifest each role received. A second ledger beside it would be
 * a second answer to "what did this run spawn".
 *
 * @param {string} meeseeksDir
 * @returns {{ invocations: import('./acceptance.mjs').RoleInvocation[], lapses: string[] }}
 */
export function recordedInvocations(meeseeksDir) {
  /** @type {any} */
  let store;
  try {
    store = JSON.parse(readFileSync(path.join(meeseeksDir, SUPPLY_FILE), 'utf8'));
  } catch {
    return { invocations: [], lapses: [] };
  }
  /** @type {import('./acceptance.mjs').RoleInvocation[]} */
  const invocations = [];
  /** @type {string[]} */
  const lapses = [];
  for (const entry of Array.isArray(store?.entries) ? store.entries : []) {
    // **A lapse is a record, not a gap to skip past** (REVIEW F22). `appendSupplyRecord` writes one
    // when it finds a store it cannot read, precisely so a later verifier cannot confuse "nothing
    // was recorded" with "nothing happened" — and this loop was dropping it, so a store corrupted
    // halfway through a run produced a *complete* receipt listing only the invocations after the
    // corruption, with nothing anywhere saying earlier ones were lost. The receipt is that later
    // verifier, so it carries the discontinuity as an invocation whose model identity is
    // unavailable, which is the only honest shape for it.
    if (typeof entry?.lapse === 'string' && entry.lapse !== '') {
      lapses.push(entry.lapse);
      continue;
    }
    if (typeof entry?.role !== 'string' || entry.role === '') continue;
    invocations.push({
      role: entry.role,
      requestedModel: typeof entry.requestedModel === 'string' ? entry.requestedModel : '',
      requestedEffort: typeof entry.requestedEffort === 'string' ? entry.requestedEffort : null,
      // Absent is **not** "the vendor reported nothing": a record written before this field existed
      // says nobody looked, and the receipt refuses to read one as the other.
      models: entry.models ?? { unavailable: 'this invocation predates observed-model recording' },
      supplyDigest:
        entry.manifest === undefined || entry.manifest === null ? null : digest(JSON.stringify(entry.manifest)),
    });
  }
  return { invocations, lapses };
}

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
 *   config: MeeseeksConfig,
 *   meeseeksDir: string,
 *   rootDir: string,
 *   requiredIds: string[],
 *   task: string,
 *   unitCommand?: string | null,
 *   gateNames?: string[],
 *   gateRoster?: string[],
 *   alreadySpent?: { tokens: number, costUsd: number },
 *   receipt?: { done: boolean },
 *   identities?: { plugin: string, cli: string, specification: string, config: string },
 *   effects: Effects,
 * }} options
 *
 * `receipt` is the run's at-most-once terminal-receipt flag (REVIEW F10), shared with `main` so the
 * loop's specific answer wins over the outer handler's generic one. Absent in a caller that owns
 * exactly one exit, which is every test that drives `driveRun` directly.
 *
 * `identities` are the four facts an acceptance receipt needs and this function cannot observe
 * (REVIEW F22): the plugin build, the CLI that spawned the children, the specification revision and
 * the sanitized configuration. They are handed in rather than resolved here because `main` already
 * establishes each one at the launch boundary, and a second answer would be a second truth.
 *
 * `alreadySpent` carries what Phase 0 and Phase 1 cost, because they run before this function
 * exists and their spend is otherwise invisible to it. Without it the ceiling restarts at zero
 * when the loop begins, and a run configured for 2M tokens can spend the PRD phase, the design
 * phase, and then 2M more. Observed: a design child spent 2,965,864 tokens against a 2,000,000
 * ceiling while the airtime counter reported the full budget remaining.
 * @returns {Promise<RunOutcome>}
 */
export async function driveRun(options) {
  const { config, meeseeksDir, rootDir, requiredIds, effects } = options;

  // **Required, not optional, and refused rather than defaulted** (REVIEW F12). This loop decides
  // whether a candidate satisfies a specification; a loop that cannot say *which* specification it
  // is judging has nothing to decide. An absent check would have to mean "assume unchanged", which
  // is the defect itself with a shrug attached.
  if (typeof effects.verifyPublication !== 'function') {
    throw new DriverError(
      'driveRun was given no way to verify what a commit published. A run that cannot tell whether the reviewed ' +
        'bytes actually landed cannot deploy or tag them (REVIEW F31).',
    );
  }
  if (typeof effects.workspaceIdentity !== 'function') {
    throw new DriverError(
      'driveRun was given no way to identify the candidate workspace. A verdict that cannot be sealed to the ' +
        'bytes it was formed over authorises whatever happens to be on disk later (REVIEW F14).',
    );
  }
  if (typeof effects.checkSpecification !== 'function') {
    throw new DriverError(
      'driveRun was given no way to check the specification revision. A run that cannot establish which ' +
        'PRD it is judging cannot judge anything (DESIGN.md §4, REVIEW F12).',
    );
  }
  if (typeof effects.snapshotCandidate !== 'function' || typeof effects.candidateSubject !== 'function') {
    throw new DriverError(
      'driveRun was given no way to materialize a candidate. Gates and the panel must judge an immutable subject; ' +
        'sampling a mutable working tree before and after proves only that nothing persisted, not which bytes were ' +
        'visible while they were being read (REVIEW F14).',
    );
  }

  /**
   * The immutable subject this iteration is judging (REVIEW F14).
   *
   * Everything that decides — reports, test definitions, evidence citations, the agent-surface scan
   * — resolves against this. Everything that *repairs* the run resolves against `rootDir`: the
   * ratchet's hard reset, the scoped restore and the commit all act on the tree the operator owns
   * and the one a commit publishes, which the candidate deliberately is not.
   *
   * @returns {string}
   */
  const subject = () => effects.candidateSubject();

  /**
   * Seal a verdict to the bytes it was formed over (REVIEW F14).
   *
   * **The defect this closes was reproduced end to end.** Gates and the Panel inspect the live
   * working tree; after the Panel returned, the loop ran `git add -A` and committed whatever bytes
   * existed at that later moment. A reviewer read `src/a.js` as `reviewed bytes`, a concurrent
   * write changed it to `changed after review`, and `driveRun` committed the latter and returned
   * `SHIPPED` — a cold verdict authorising code no reviewer and no deterministic gate ever saw.
   * That does not need a hostile double: a successful Builder can leave background descendants,
   * and an operator's editor or tooling writes to the same tree.
   *
   * The identity is `workspaceHash`'s: tracked files plus untracked-but-not-ignored ones, hashed
   * from their real bytes. A deletion, a symlink retarget or an unreadable path collapses it to
   * `null`, and `null` never matches — including another `null`, because two things nobody could
   * measure are not evidence of being the same thing.
   *
   * @param {string | null} sealed the identity the verdict was formed over
   * @returns {Promise<boolean>} true when the tree is still those bytes
   */
  const workspaceStillMatches = async (sealed) => {
    if (sealed === null) return false;
    const current = await effects.workspaceIdentity();
    return current !== null && current === sealed;
  };

  /**
   * Has the specification moved under this run?
   *
   * Asked at the two boundaries F12 names: after the builder has written, before the gates and the
   * panel see the tree, and again immediately before a ship. The first catches drift on the
   * iteration that caused it; the second is the terminal boundary, because a ship is a claim about
   * a specific document.
   *
   * @returns {RunOutcome | null} a terminal outcome when the specification has drifted
   */
  const specificationDrift = () => {
    /** @type {{ ok: boolean, digest: string, detail: string }} */
    let checked;
    try {
      checked = effects.checkSpecification();
    } catch (error) {
      // An unreadable record is not evidence that nothing changed.
      return finish('ABORTED', `the specification revision could not be checked: ${/** @type {Error} */ (error).message}`);
    }
    if (checked.ok) return null;
    effects.log(checked.detail);
    return finish('ABORTED', `the specification changed under this run: ${checked.detail}`);
  };

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
    bestGateShare: 0,
    bestPassingCount: 0,
  };

  // Read once and carried, like the ratchet state. An unreadable pin store throws out of
  // `driveRun` rather than degrading to no pins: continuing would silently discard every
  // recorded guard and every carried pass, and the run would look healthier for the loss.
  const pins = readPins(meeseeksDir);
  let builderTokens = 0;
  let builderRuns = 0;

  /**
   * How many times each test id has regressed **in this run**. See `repeatedRegressionNote`.
   *
   * In memory rather than read back from `bloopers.log`, which outlives a run: an identical
   * regression from a run that ended yesterday says nothing about whether this one is stuck.
   *
   * @type {Map<string, number>}
   */
  const regressionCounts = new Map();

  /**
   * Guard refusals the previous iteration's builder received, for the next brief. A fresh
   * child cannot remember being told no; this is how it finds out. See `compileBrief`.
   * @type {string[]}
   */
  let deniedLastIteration = [];

  /**
   * The first iteration's brief length in characters, the baseline for §3.9's growth check.
   * Zero until an iteration sets it: a run that never built a brief has nothing to compare.
   */
  let firstBriefChars = 0;

  /** When this run began, for `config.deadlineMs`. Read through `effects.now()` like every clock here. */
  const startedAtMs = Date.parse(effects.now());

  /**
   * Consecutive failures per gate name, within this run. See `repeatedGateNote`.
   *
   * Cleared on a pass rather than decremented: the question is "is this still broken", and a
   * gate that passes has answered it.
   *
   * @type {Map<string, number>}
   */
  const gateFailureStreaks = new Map();

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
   * The workspace identity the current panel is being formed over (REVIEW F14).
   *
   * Captured after the gates and before the first reviewer, rechecked after every panel and
   * immediately before the commit, and proved again once the commit has landed. Loop-scoped rather
   * than iteration-scoped so `finish` can record which bytes the terminal verdict belongs to.
   *
   * @type {string | null}
   */
  let reviewedWorkspace = null;

  /**
   * What the last panel could not accept, so a terminal question can name it (PLAN item 50).
   *
   * Tracked rather than recomputed at the end: by the time a run finishes, the panel that judged it
   * is gone and its verdict is not re-derivable from the tree. Empty on a run that never reached a
   * panel, which is the honest answer — the question then cites the phase instead.
   *
   * @type {string[]}
   */
  let outstandingFindings = [];

  /**
   * The one attempt the acceptance receipt may describe: a sealed tree and the checks run *on it*.
   *
   * **Three separate variables were three separate facts, and the receipt married the wrong ones.**
   * `reviewedWorkspace` is assigned after the gates and before the panel; the gate results were
   * assigned before them; and five `continue` statements sit in between. So an iteration that gated
   * and then bailed before the panel overwrote the gate results while the seal still pointed at an
   * *earlier* tree, and `finish` published the pair as though they belonged together. Reproduced by
   * an adversarial audit before this shipped: iteration 1 passes both gates on tree A and seals it,
   * iteration 2 fails both on a later tree and never reaches a panel, and the receipt reads tree A
   * with two failing gates — and verifies clean. The damaging polarity is the same bug reversed: the
   * security-regression `continue` is taken only when every gate *passed*, so an all-green list can
   * be bound to a tree those gates never ran against.
   *
   * That is the receipt's entire stated purpose — *which deterministic checks passed on which exact
   * bytes* — returning a wrong answer confidently. One record, assigned once, at the only moment the
   * two are known to describe each other.
   *
   * @type {{ tree: string, commit: string | null, gates: GateResult[], reports: string[],
   *   identities: GateIdentity[], reportDigestByName: Record<string, string>, attempt: number } | null}
   */
  let sealedAttempt = null;

  /**
   * This iteration's gate results and report digests, until a seal makes them an attempt.
   *
   * Declared without an initial value on purpose: the only reader is the seal below, and an empty
   * array there would be a claim that the gates ran and found nothing rather than that they have
   * not run yet.
   *
   * @type {GateResult[] | undefined}
   */
  let iterationGateResults;
  /** @type {string[] | undefined} */
  let iterationReportDigests;
  /**
   * Which report produced each id this attempt (PLAN item 95).
   *
   * Banked with the ratchet's advance so a *later* attempt can say which ids the report that stopped
   * being produced used to own — which is the whole of an attributable regression.
   *
   * @type {Record<string, string>}
   */
  let reportOwners = {};
  /**
   * What each gate result *was* — its argv and the reports it owns (REVIEW F22).
   *
   * Undefined until the first gate run, like `iterationGateResults` beside it: a run that never
   * gated has no identities, and an empty list would say it had none rather than that none were
   * taken.
   *
   * @type {GateIdentity[] | undefined}
   */
  let iterationGateIdentities;
  /** The digest of each report this attempt read, by report name (REVIEW F22). @type {Record<string, string> | undefined} */
  let iterationReportDigestByName;

  /**
   * The deploy this run performed, if it performed one (REVIEW F22).
   *
   * The first draft looked for a gate named `deploy` and there has never been one, so the field was
   * structurally always `null`: a run that deployed successfully produced a receipt indistinguishable
   * from a run with no deploy configured. The deploy is an *effect* called on the ship path, so this
   * records what it returned — including a failure, which is exactly the case an auditor asks about.
   *
   * @type {{ ok: boolean, detail: string } | null}
   */
  let lastDeploy = null;

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
      passing: loadState(meeseeksDir).passing,
      // The workspace identity the last panel was sealed to (REVIEW F14). `null` on every run that
      // never reached a panel, which is the honest answer rather than an empty string that would
      // read as an identity nobody can look up.
      workspace: reviewedWorkspace,
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
    // run's terminal state had to be reconstructed from `.meeseeks/`, `git log` and the reflog.
    //
    // Writing it here puts the answer inside the one directory a run may not edit and the
    // ratchet never rewrites. Failing to write it does **not** fail the run: this is forensics,
    // and destroying a completed run's result because its receipt could not be filed would be
    // the wrong way round. The failure is reported instead.
    // Atomic, and shared with every terminal path outside this loop (REVIEW F10). It used to be a
    // direct overwrite reachable only from here, so a kill mid-write destroyed the only record and
    // every pre-loop abort left none at all.
    writeRunOutcome(meeseeksDir, { ...outcome, phase: 'loop' }, { now: effects.now, log: effects.log, written: options.receipt });
    // **The question, beside the state that produced it** (PLAN item 50). `outcome.json` records how
    // a run ended; it cannot record the decision the operator now has to make. `STALLED — 6
    // iterations with no gate improvement` is a diagnosis, and the run already knows the more useful
    // sentence — what it could not satisfy, what it tried — and was discarding it.
    //
    // Derived from the terminal receipt, so a SHIPPED run emits nothing by construction rather than
    // by a rule applied on top of it. It never blocks and cannot: it takes a finished state and
    // writes a file. Failing to write it does not fail the run, for the same reason the receipt
    // above does not — destroying a completed run's result because its forensics could not be filed
    // would be the wrong way round.
    try {
      writeQuestion(
        meeseeksDir,
        { state: outcome.state, reason: outcome.reason, phase: 'loop' },
        {
          findings: outstandingFindings,
          tried: [
            `${progress.iteration} iteration(s) against this specification`,
            ...(outstandingFindings.length === 0 ? [] : ['a cold panel reviewed the candidate and did not accept it']),
          ],
        },
        { now: effects.now, log: effects.log },
      );
    } catch (failure) {
      effects.log(`could not write the question artifact: ${/** @type {Error} */ (failure).message}`);
    }
    // **The acceptance edge, written beside the terminal state** (REVIEW F22). `outcome.json` says
    // how a run ended; it cannot say which deterministic checks passed on which exact bytes, because
    // gate results are transient and the reports are deliberately not archived. So an operator could
    // establish that Meeseeks said SHIPPED and could read the panel, and could reconstruct nothing
    // in between — which is what the audit of this project's first SHIPPED actually reported.
    //
    // Refusing to *write* it never changes the terminal state: this is forensics, and destroying a
    // finished run because its receipt could not be filed would be the wrong way round. An
    // incomplete receipt is reported and not written, because a partial one would be read as
    // provenance.
    try {
      writeAcceptanceReceipt(meeseeksDir, {
        // Both halves from the one record, so a receipt can only ever describe checks that ran on
        // the tree it names. A run with no sealed attempt has no subject, and the completeness rule
        // below refuses it rather than inventing one.
        subject: { tree: sealedAttempt?.tree ?? '', commit: sealedAttempt?.commit ?? null },
        inputs: {
          specification: options.identities?.specification ?? '',
          config: options.identities?.config ?? '',
          plugin: options.identities?.plugin ?? '',
          cli: options.identities?.cli ?? '',
          gateRoster: options.gateRoster ?? [],
        },
        results: {
          terminal: state,
          gates: acceptanceGates(sealedAttempt?.gates ?? [], {
            identities: sealedAttempt?.identities ?? [],
            reportDigestByName: sealedAttempt?.reportDigestByName ?? {},
            attempt: sealedAttempt?.attempt ?? 0,
          }),
          panelDigest: panelRecordDigest(meeseeksDir),
          ratchetPassing: outcome.passing.length,
          // The evidence the gate results were derived from, bound by bytes rather than by a token
          // nobody issues (REVIEW F16, F22).
          reports: sealedAttempt?.reports ?? [],
          oracle: gateDetailFor(sealedAttempt?.gates ?? [], 'oracle'),
          // From the effect that ran it, not from a gate roster that has never contained one:
          // `gateDetailFor(..., 'deploy')` was structurally always null, so a successful deploy and
          // no deploy at all read identically. A field that cannot be populated is worse than absent.
          deploy: lastDeploy === null ? null : `${lastDeploy.ok ? 'ok' : 'failed'} ${digest(lastDeploy.detail)}`,
        },
        ...(() => {
          // Read once. Twice would be two reads of a file another process could change between
          // them, which is the shape of defect this receipt exists to make visible.
          const ledger = recordedInvocations(meeseeksDir);
          // Both kinds of hole: the ones the store recorded about itself, and the ones no store
          // could record because writing to it is what failed.
          return {
            invocations: ledger.invocations,
            ledgerLapses: [...ledger.lapses, ...(effects.supplyLapses?.() ?? [])],
          };
        })(),
        at: effects.now(),
      });
    } catch (error) {
      effects.log(`no acceptance receipt: ${/** @type {Error} */ (error).message}`);
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
   * @returns {Promise<RunOutcome>}
   */
  const landCleanly = async (result, iteration, what) => {
    await effects.commit(`meeseeks: stopped during ${what} at iteration ${iteration} (work in progress)`);
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
   * @returns {Promise<void>}
   */
  const maybeExtractLesson = async () => {
    if (!config.lessons.enabled || effects.extractLesson === undefined) return;
    try {
      const struggle = findResolvedStruggles(iterationHistory).find((entry) => !lessonsAttempted.has(entry.key));
      if (struggle === undefined) return;
      lessonsAttempted.add(struggle.key);

      // The failure key is a test id and the file lists are builder-chosen paths — untrusted
      // text entering a driver-assembled prompt, so each takes the single-line treatment (R30b).
      const evidence = [
        `Failure: ${neutralizeLine(struggle.key)}`,
        `First observed on iteration ${struggle.introduced}; still failing after ${struggle.attempts} iteration(s).`,
        `Passing again as of iteration ${struggle.resolved}.`,
        '',
        'Files touched by each attempt, in order:',
        ...struggle.changed.map(
          (files, index) => `- attempt ${index + 1}: ${neutralizeLine(files.join(', ') || '(no files recorded)')}`,
        ),
      ].join('\n');

      const result = await effects.extractLesson(evidence);
      // Charged but not acted on: this runs while an iteration is closing and returns void,
      // so it has no way to end the run. The spend still counts, and `shouldContinue` sees
      // it at the top of the next iteration — one step later than the other five sites.
      charge(result);
      if (!result.ok) return;

      const candidate = parseLessonExtraction(result.text);
      if (candidate === null) return;

      const { store, problem } = readLessons(meeseeksDir);
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
      saveLessons(meeseeksDir, outcome.store);
      effects.log(`lesson ${outcome.added.id} recorded: ${outcome.added.lesson}`);
    } catch (error) {
      effects.log(`lesson extraction was skipped: ${/** @type {Error} */ (error).message}`);
    }
  };

  /**
   * How many gates ran in the current iteration, for `recordProgress`'s share comparison.
   * Reset at the top of each iteration so a path that closes before the gates -- a malformed
   * assumptions block, for one -- cannot inherit a previous iteration's roster size.
   */
  let lastGateTotal = 0;

  /** The share of gates the main tree passed last iteration, for the race's viability bar. */
  let lastGateShare = 0;

  /**
   * Close out an iteration: record what failed, consider a lesson, and score progress.
   *
   * @param {number} iteration
   * @param {string[]} failures stable keys, so the same failure reads the same next time
   * @param {number} score
   * @param {number} passingCount
   * @returns {Promise<void>}
   */
  const closeIteration = async (iteration, failures, score, passingCount) => {
    iterationHistory.push({ iteration, failures, changed: (await effects.changedFiles?.()) ?? [] });
    await maybeExtractLesson();
    progress = recordProgress(progress, { gateScore: score, gateTotal: lastGateTotal, passingCount });
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
    // Zero means no ceiling (0.128.0), **and this line is where forgetting that cost a run.**
    // `shouldContinue` was fixed and this mid-iteration check was not, so with both ceilings at
    // zero the first charged child satisfied `spent >= 0` and case J2 died on iteration 1 with
    // "cost ceiling reached: $4.38 of $0" — the exact self-contradictory sentence a fail-closed
    // comparison produces when zero stops meaning what it says. Same rule in both places now.
    return (
      (config.tokenCeiling > 0 && progress.spentTokens >= config.tokenCeiling) ||
      (config.costCeiling > 0 && progress.spentUsd >= config.costCeiling)
    );
  };

  /**
   * Worded exactly as `shouldContinue` words it, so the two exits read the same — and naming
   * whichever ceiling actually fired, because "budget" without the reason sends an operator to
   * change the wrong number.
   */
  const ceilingReason = () =>
    config.costCeiling > 0 && progress.spentUsd >= config.costCeiling
      ? `cost ceiling reached: $${progress.spentUsd.toFixed(4)} of $${config.costCeiling}`
      : `token ceiling reached: ${progress.spentTokens} of ${config.tokenCeiling}`;

  for (;;) {
    const permission = shouldContinue(progress, config, Date.parse(effects.now()) - startedAtMs);
    if (!permission.continue) return finish(permission.state, permission.reason);

    const iterationNumber = progress.iteration + 1;
    effects.journal?.('iteration-started', 'loop', { iteration: iterationNumber });
    effects.event?.({ kind: 'iteration', number: iterationNumber, total: config.maxIterations });
    effects.event?.({ kind: 'airtime', fractionLeft: airtimeRemaining(progress, config).fractionLeft });

    // ---- The brief: compile it, archive it, then hand it over ------------
    const stored = readLessons(meeseeksDir);
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
        meeseeksDir,
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
      protectedTests: loadState(meeseeksDir).passing,
      lessons: relevant,
      history: (await effects.history?.(objective.findings ?? [])) ?? [],
      deniedLastIteration,
      gates: options.gateNames ?? [],
      // Re-asked every iteration rather than resolved once, for the same reason the design
      // gate's arming is: detection answers about the tree as it is now, and the tree changes
      // under it. The declared half is stable; the detected half is not.
      capabilities: effects.capabilities?.() ?? [],
      toolchain: effects.toolchainGuidance?.(),
      // **The declared schema, when the operator supplied one** (PLAN item 47, slice D). Read
      // through an effect like every other gathered fact, so the brief stays a pure function of the
      // run's state and a test can drive it without a diagram on disk.
      //
      // Preflight has already refused an ERD that cannot be parsed or that over-reaches the PRD, so
      // by the time a brief is compiled the only remaining outcomes are a valid diagram or none.
      erd: effects.erd?.() ?? null,
      dod: effects.dod?.() ?? [],
    });
    writeBrief(meeseeksDir, iterationNumber, brief);

    // ---- Phase 2: build, or race out of a stall (DESIGN.md §13.6) --------
    const raceDecision = shouldRace({
      config,
      progress,
      averageBuilderTokens: builderRuns === 0 ? undefined : Math.round(builderTokens / builderRuns),
    });
    let raced = false;
    if (raceDecision.race && effects.race !== undefined) {
      const outcome = await effects.race(objective, iterationNumber, lastGateShare);
      const exhausted = charge(outcome);
      effects.log(`race: ${outcome.detail}`);
      raced = outcome.applied;
      if (exhausted) return finish('BUDGET', ceilingReason());
    }

    // §3.9's silent degradation, given a voice. The brief is the part of a builder's prompt that
    // grows — the system prompt is near constant — so it is what a trajectory is drawn through.
    // Measured before the child is spawned so a warning arrives on the iteration that earned it.
    if (firstBriefChars === 0) firstBriefChars = brief.length;
    const growth = promptGrowthNote({
      first: firstBriefChars,
      current: brief.length,
      iteration: iterationNumber,
      limit: config.contextBudget.maxCharacters,
      maxIterations: config.maxIterations,
    });
    if (growth !== '') effects.log(growth);

    if (!raced) {
      const built = await effects.build(brief);
      deniedLastIteration = built.denials ?? [];
      builderTokens += built.tokens;
      builderRuns += 1;
      const exhausted = charge(built);
      // A child that failed is reported as a failure, not as a budget death: the run needs
      // to know which of the two it was, and the failure is the more specific answer.
      if (!built.ok) return await landCleanly(built, iterationNumber, 'builder');
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
        await closeIteration(iterationNumber, ['assumptions:malformed'], 0, loadState(meeseeksDir).passing.length);
        continue;
      }
      if (declared.recovered) {
        // Accepted, and never quietly. The shape is not the one the template shows, and a
        // builder drifting off a machine-parsed contract is worth seeing in the log before the
        // drift reaches a shape the parser cannot recover at all.
        effects.log('builder assumptions block was not in the documented shape; entries recovered from it');
      }
      if (declared.discarded > 0) {
        // Announced rather than dropped quietly. A log that silently sheds entries reads
        // exactly like a log nothing was written to.
        effects.log(`discarded ${declared.discarded} assumption(s) that cited nothing or assumed nothing`);
      }
      if (declared.assumptions.length > 0) {
        appendAssumptions(meeseeksDir, iterationNumber, declared.assumptions);
        effects.log(`recorded ${declared.assumptions.length} assumption(s) for the audit`);
      }
    }

    // The specification, before anything judges the tree (REVIEW F12). Placed after the build and
    // the race rather than inside either, because both write to the repository and either could
    // have moved the finish line — and placed before the gates so no gate result, ratchet credit
    // or panel verdict is ever attributed to a document the run did not start against.
    const driftedBeforeGates = specificationDrift();
    if (driftedBeforeGates !== null) return driftedBeforeGates;

    // ---- Phase 2d: materialize the candidate (REVIEW F14) ----------------
    //
    // **The bytes stop being a working tree here.** Everything that judges from this point reads a
    // worktree checked out from a content-addressed tree object that no process in the run has a
    // path to. A background writer left by the builder can do what it likes to the main tree: it is
    // no longer writing to the thing being judged, and the pre-commit check below is an equality
    // between two tree object ids rather than another sample of a directory.
    //
    // A failure here ends the run rather than falling back to the live tree. Gating whatever is on
    // disk is exactly the behaviour this replaces, and "the snapshot machinery broke" is not
    // evidence that the live tree is safe to judge.
    const snapshot = await effects.snapshotCandidate(iterationNumber);
    if (!snapshot.ok || snapshot.tree === null) {
      return finish('ABORTED', `the candidate could not be materialized: ${snapshot.detail}`);
    }
    const candidateTree = snapshot.tree;

    // ---- Phase 3: gates -------------------------------------------------
    const commandGateOutcome = await effects.gates();

    // ---- Phase 3b: the reports, read once (REVIEW F16, F20, F30) --------
    //
    // Parsed here rather than in Phase 4, because what they contain has to reach the *gate* results
    // before anything scores, logs or judges them. Each accepted report is parsed once and the
    // records are collapsed across all of them by worst status, so an id that passed in the unit
    // report and was flaky in the e2e one is flaky: two runners disagreeing about one test is not
    // evidence that it passes.
    /** @type {Set<string>} */
    let passing;
    /** @type {Set<string>} */
    const flaky = new Set();
    // How many tests the reports contained at all, whatever their status. The ratchet needs it
    // to tell "the runner collected nothing" from "everything failed", which are the same input
    // — an empty passing set — and opposite conclusions. Run 6 reset 75 ids over the first.
    let collected = 0;
    try {
      if (config.extractTests) {
        // Every runner's report contributes ids. A repo with both a unit suite and an
        // e2e suite has two, and the ratchet must hold both or it protects half the work.
        /** @type {import('./reporters/index.mjs').TestRecord[]} */
        const records = [];
        /** @type {string[]} */
        const readThisAttempt = [];
        const read = effects.readTestReports();
        // Which report each id came from (PLAN item 95), built in the same pass. `produced` is in
        // lockstep with the contents, so index *i* names the report index *i* was read from; a
        // caller that supplies no sources contributes no ownership, and an id with no owner is
        // treated as measured — the direction that costs an avoidable reset rather than one that
        // hides a real regression.
        const producedNames = effects.readReportSources?.().produced ?? [];
        /** @type {Record<string, string>} */
        const owners = {};
        /** @type {Record<string, string>} */
        const byName = {};
        for (const [index, report] of read.entries()) {
          // Digested where the loop actually reads them, rather than re-read later: a receipt that
          // hashed the files again at the terminal transition would describe whatever was on disk by
          // then, which is the substitution F16 exists to prevent.
          readThisAttempt.push(digest(typeof report === 'string' ? report : JSON.stringify(report)));
          const parsed = parseReport(report, { rootDir: subject() });
          collected += parsed.tests.length;
          records.push(...parsed.tests);
          const name = producedNames[index];
          if (name !== undefined) {
            for (const test of parsed.tests) owners[test.id] = name;
            // The same digest, keyed by the report it came from, so a gate result can carry the
            // bytes it produced rather than the receipt carrying a flat list nothing references.
            byName[name] = readThisAttempt[index];
          }
        }
        reportOwners = owners;
        iterationReportDigestByName = byName;
        iterationReportDigests = readThisAttempt;
        /** @type {Set<string>} */
        const reported = new Set();
        for (const [id, status] of collapseByWorstStatus(records)) {
          if (status === 'passed') reported.add(id);
          else if (status === 'flaky') flaky.add(id);
        }
        // **Credit requires a definition this checkout actually has** (REVIEW F35). Reporter
        // normalisation falls back to a lexically contained path when the file cannot be resolved,
        // which keeps an escaping path out but lets a runner report a pass for a file that is not
        // in the candidate — and the monotonic ratchet would bank it, holding durable credit for a
        // test no clean clone can execute. Withheld rather than refused: the report is still
        // readable, and `collected` above keeps counting it, so this cannot be mistaken for the
        // runner having produced nothing.
        const backed = fileBackedIds(reported, subject());
        if (backed.withheld.length > 0) {
          effects.log(
            `withholding ratchet credit from ${backed.withheld.length} passing test(s) whose defining file is not ` +
              `an existing file in this tree: ${backed.withheld.slice(0, 10).join(', ')}` +
              (backed.withheld.length > 10 ? ` and ${backed.withheld.length - 10} more` : ''),
          );
        }
        passing = backed.credited;
      } else {
        passing = new Set(loadState(meeseeksDir).passing);
        // Not report-derived, so it is not a collection failure and must not read as one.
        collected = passing.size;
      }
    } catch (error) {
      // An unreadable report is not evidence that nothing regressed.
      return finish('ABORTED', `test report could not be read: ${/** @type {Error} */ (error).message}`);
    }

    // A retry that eventually passed is not a pass (REVIEW F30). Playwright exits zero when every
    // test is expected or flaky, so without this a newly flaky test — one with no earlier ratchet
    // identity to regress against — left every gate green and could reach the Panel and `SHIPPED`.
    const stability = stabilityGateResult(flaky);
    const gateOutcome =
      stability === null
        ? commandGateOutcome
        : { ok: false, results: [...commandGateOutcome.results, stability] };
    const score = gateScore(gateOutcome.results);
    iterationGateResults = gateOutcome.results;
    // The stability gate is assembled here rather than by `gateTree`, so its identity is too: it
    // runs no process and owns no report, and saying that is not the same as leaving it out.
    iterationGateIdentities = [
      ...(commandGateOutcome.identities ?? []),
      ...(stability === null ? [] : [{ name: stability.name, command: [], reports: [] }]),
    ];
    lastGateTotal = gateOutcome.results.length;
    lastGateShare = lastGateTotal === 0 ? 0 : score / lastGateTotal;
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

    // Consecutive-failure streaks, counted here because this is the one place that sees every
    // gate result on every path — the ratchet's reset and reject branches `continue` below.
    // A gate that ran and passed clears its streak; a gate that did not run this iteration keeps
    // whatever it had, because "not applicable today" is not evidence it was fixed.
    for (const result of gateOutcome.results) {
      if (result.ok) gateFailureStreaks.delete(result.name);
      else gateFailureStreaks.set(result.name, (gateFailureStreaks.get(result.name) ?? 0) + 1);
    }
    const stuckGates = repeatedGateNote(gateFailureStreaks);
    if (stuckGates !== '') effects.log(`stuck gate: ${stuckGates}`);

    // ---- Phase 4: ratchet ----------------------------------------------
    const state = loadState(meeseeksDir);
    // The digests of the files the credited ids came from, recorded with the advance (REVIEW F17)
    // so a later iteration can tell "this definition still protects the behaviour" from "an id with
    // this name once passed".
    // **The definition rule is applied here, where banking happens** (REVIEW F17, reopened). It was
    // computed in `gateTree` and returned as `passing`, and the `gates` effect dropped that field —
    // so the production loop re-derived its own set from the reports and advanced on it. Correct
    // code that nothing called, which is the defect this repository keeps finding; the helpers were
    // green the whole time.
    const redEvidence = loadRedEvidence(meeseeksDir);
    const rewritten = changedDefinitions(passing, subject(), state.definitions);
    // The same comparison, against the digests the *evidence* was recorded under rather than the
    // ones the ratchet credited (REVIEW F17). `changedDefinitions` already reads an absent or
    // unreadable digest as changed, which is the answer that keeps a store written before this
    // field existed from vouching for bytes nobody measured.
    const staleEvidence = changedDefinitions(passing, subject(), redEvidence.definitions);
    const withheld = unprovenIds({
      previousPassing: state.passing,
      passing,
      redSeen: redEvidence.seenFailing,
      baseline: redEvidence.baseline,
      changedDefinitions: rewritten,
      staleEvidence,
    });
    const credited = new Set([...passing].filter((id) => !withheld.has(id)));
    if (withheld.size > 0) {
      effects.log(
        `withholding ratchet credit from ${withheld.size} passing test(s) with no red evidence under their current ` +
          `definition: ${[...withheld].sort().slice(0, 10).join(', ')}` +
          (withheld.size > 10 ? ` and ${withheld.size - 10} more` : ''),
      );
    }
    // Digests are recorded only for what was credited, or a withheld id would stamp the new bytes
    // as the ones that earned it and the next iteration would stop noticing the change.
    /** @type {Record<string, string>} */
    const definitions = {};
    for (const id of credited) {
      const file = testFilePath(id);
      if (file === '' || definitions[file] !== undefined) continue;
      const digest = definitionDigest(subject(), file);
      if (digest !== null) definitions[file] = digest;
    }
    // Regressions from `passing`, banking from `credited`. A withheld id still *passed*, so treating
    // its absence from the credited set as a regression would hard-reset the tree over a test that
    // is working — rewriting the monotonic record to state something about the present, which F17
    // explicitly refuses.
    // **Absent because nothing measured it, or absent because it broke** (PLAN item 95). One report
    // of several going missing leaves `collected` comfortably non-zero from the other, so every id
    // the missing one used to bank is absent from `passing` and compares equal to regressed — and
    // the tree is hard-reset, the verification gate re-runs the same non-producing gate, and the run
    // repeats it to the ceiling. Attributed from the ownership the ratchet banked, so this can only
    // ever exclude ids whose *own* report is not there.
    const unmeasured = unmeasuredIds({
      previousPassing: state.passing,
      nowPassing: passing,
      owners: state.reports ?? {},
      produced: effects.readReportSources?.().produced ?? [],
    });
    if (unmeasured.length > 0) {
      effects.log(
        `${unmeasured.length} protected test(s) were not measured this attempt: the report that banked them was not ` +
          `produced, so they keep their ratchet protection and are not read as regressions — ` +
          `${unmeasured.slice(0, 10).join(', ')}${unmeasured.length > 10 ? ` and ${unmeasured.length - 10} more` : ''}`,
      );
    }
    const decision = evaluateIteration(state, passing, {
      commit: null,
      collected,
      definitions,
      credited,
      reports: reportOwners,
      unmeasured,
    });

    // ---- bank the ids as soon as the suite has proven them -------------
    // **Case I is why this is here.** `saveState` used to be reachable only from Phase 6, after
    // the panel, so an iteration that failed *any* gate recorded nothing. That run held **71
    // passing tests across 8 iterations** and never wrote `state.json` at all — a regression in
    // any of the 71 would have gone unnoticed for the entire run, because the ratchet did not
    // yet exist. The single mechanism that makes the loop terminate was absent exactly while the
    // run was thrashing, which is when it is worth having.
    //
    // Gated on the **unit** gate rather than on all of them, and that is the whole judgement: a
    // passing unit gate means the suite ran and produced a report the ratchet could read, which
    // is the only claim being banked. Whether the docs are stubbed or CI is missing says nothing
    // about whether these tests passed.
    //
    // **`lastGoodCommit` deliberately does not move here.** `commit` is null at this point and
    // `recordAdvance` keeps the previous value, so the reset target stays the last iteration that
    // was good in the full sense. Protection arrives early; the place a reset returns to does
    // not get looser. Phase 6 still advances with a real commit, and the passing set is a union,
    // so the two cannot disagree.
    const unitGate = gateOutcome.results.find((result) => result.name === 'unit');
    if (decision.action === 'advance' && unitGate?.ok === true) {
      saveState(meeseeksDir, decision.state);
    }

    if (decision.action === 'reset') {
      appendBlooper(meeseeksDir, {
        iteration: iterationNumber,
        regressions: decision.regressions,
        diffStat: await effects.diffStat(),
        at: effects.now(),
      });
      // ---- scoped restore before the whole-tree one (DESIGN.md §1.2) -----
      // A hard reset is whole-tree, so it discards everything the iteration built, not only the
      // change that broke something. Measured in `ship1`: two resets threw away the run's two
      // *largest* builder spends, 7.5M and 7.7M tokens, about 10% of a 150M ceiling, because one
      // parser regressed. The resets were right; the scope was the only thing wrong.
      //
      // So the narrow restore is **attempted and then verified**, never trusted. `sourceSiblings`
      // is a naming convention, which is a guess — and a guess is only cheap when something
      // checks it. If the regressed ids do not come back, the full reset runs exactly as before
      // and nothing has been lost but one deterministic gate pass. Nothing defaults to pass here
      // either: a scoped restore that cannot be verified **is** a failed scoped restore.
      let scopedHeld = false;
      const scoped =
        decision.target === null ? [] : scopedRestorePaths(decision.regressions, (await effects.changedFiles?.()) ?? []);
      if (scoped.length > 0 && decision.target !== null) {
        restorePaths({ cwd: rootDir, commit: decision.target, paths: scoped });
        try {
          const back = new Set();
          // **The verification gate's result is read, not discarded** (REVIEW F16). It used to be
          // awaited and thrown away, and the reports were then trusted whatever it had said — so a
          // unit gate that failed and wrote nothing left the *previous* attempt's passing report
          // to confirm the restore. Measured: the Driver logged `scoped restore held`, skipped the
          // full reset, and left `src/core.js` containing `broken`. A restore nothing verified is a
          // failed restore, and a gate that did not pass has verified nothing.
          const verification = await effects.gates();
          const verifiedUnit = verification.results.find((result) => result.name === 'unit');
          if (verifiedUnit?.ok !== true) {
            effects.log(
              `scoped restore not verified: the unit gate ${verifiedUnit === undefined ? 'did not run' : 'failed'} ` +
                'after the restore, so nothing it produced can show the regressed tests came back',
            );
          } else {
            for (const report of effects.readTestReports()) {
              for (const id of extractTestIds(report, { rootDir: subject() })) back.add(id);
            }
            scopedHeld = decision.regressions.every((id) => back.has(id));
          }
        } catch {
          // An unreadable report cannot confirm a restore. Fall through to the full reset.
          scopedHeld = false;
        }
        if (scopedHeld) {
          effects.log(
            `scoped restore held: returned ${scoped.join(', ')} to the last good commit and kept the rest of ` +
              'this iteration',
          );
        } else {
          effects.log(`scoped restore did not return the failing test(s); falling back to the full reset`);
        }
      }
      if (!scopedHeld && decision.target !== null) hardReset({ cwd: rootDir, commit: decision.target });
      effects.event?.({ kind: 'reset', regressions: decision.regressions.length });
      effects.log(`regression: ${decision.regressions.join(', ')}`);
      // Counted before the tally is updated, so the first repeat reads "2 times".
      const repeatNote = repeatedRegressionNote(regressionCounts, decision.regressions);
      for (const id of decision.regressions) {
        regressionCounts.set(id, (regressionCounts.get(id) ?? 0) + 1);
      }
      if (repeatNote !== '') effects.log(`repeated regression: ${repeatNote}`);
      objective = {
        kind: 'regression',
        headline: 'Restore the tests listed below. Change nothing else.',
        reason:
          `the ratchet is monotonic and ${decision.regressions.length} test(s) that passed earlier no longer pass, ` +
          'so the tree was reset to the last commit that held them' +
          (repeatNote === '' ? '' : `. ${repeatNote}`),
        regressions: decision.regressions,
      };
      await closeIteration(iterationNumber, decision.regressions, score, state.passing.length);
      continue;
    }

    if (decision.action === 'reject') {
      effects.log(decision.reason);
      objective = {
        kind: 'no-tests',
        headline: `${options.task}\n\nBefore anything else: make the test suite run and pass.`,
        reason:
          'no test passed on the previous iteration. An empty result is not evidence that nothing regressed, so the ' +
          'ratchet cannot advance on it and nothing else can be judged. ' +
          // **Which sentence follows depends on whether anything already explained the emptiness**
          // (REVIEW F32). Told unconditionally to go and check the runner, a builder whose reports
          // were withheld on purpose — or whose unit gate failed before it could write one — hunts
          // a suite that is fine. That misdirection is dogfood run 6's shape, and a refused attempt
          // reproduces it exactly: the gates below say what happened and this sentence contradicted
          // them.
          (failedGates.length > 0
            ? 'The failing gates below are the explanation for it: fix them first, and do not go looking for a ' +
              'fault in the suite until they pass'
            : 'Check the runner before rewriting the ' +
              `tests: the gate collects them with \`${options.unitCommand ?? 'the toolchain unit command'}\`, so a suite ` +
              'written for a runner that command cannot collect reports zero tests however green your own test ' +
              'script looks'),
        // **The failing gates travel with it** (REVIEW F32). This branch `continue`s before the
        // gate-failure branch below, so a builder handed a reject objective used to be told the
        // runner collected nothing and nothing else — even when a gate had already said exactly
        // why. A refused attempt is the loudest case (the reports were withheld deliberately), but
        // it is the same shape as dogfood run 6, where the unit gate's failure was the whole
        // explanation for an empty collection and never reached the actor who had to respond.
        gateFailures: failedGates.map((result) => ({ name: result.name, detail: result.detail })),
      };
      await closeIteration(iterationNumber, ['ratchet:no-passing-tests'], score, 0);
      continue;
    }

    if (!gateOutcome.ok) {
      objective = {
        kind: 'gates',
        headline: 'Make these gates pass. Nothing else this iteration.',
        reason:
          `${failedGates.length} gate(s) failed on iteration ${iterationNumber}. Gates run before the audit because ` +
          'they are free and deterministic, and there is no reason to pay for a cold read of something that does ' +
          'not compile' +
          // The half that matters. The log line above is for the operator; a builder never reads
          // the log, and case I's builder failed the same gate eight times without once being
          // told it was the same gate.
          (stuckGates === '' ? '' : `. ${stuckGates}`),
        gateFailures: failedGates.map((result) => ({ name: result.name, detail: result.detail })),
      };
      await closeIteration(
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
        const call = await escalate(pin);
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
          if (pinsChanged) writePins(meeseeksDir, pins);
          return finish('BUDGET', ceilingReason());
        }
      }
      if (pinsChanged) writePins(meeseeksDir, pins);

      if (removedElements.length > 0) {
        // The same path as a dropped test id, and deliberately so: this is a regression in a
        // property the run had already established.
        const target = loadState(meeseeksDir).lastGoodCommit;
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
        await closeIteration(iterationNumber, removedElements, score, passing.size);
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
     * Sequential on purpose, and still sequential after the async conversion: reviewers run
     * one after another, in declared order. Parallelising the panel is a separate change with
     * its own constraint (collect all children, then parse and charge in declared order), and
     * it does not ride along with a mechanical rewrite.
     *
     * @param {{ reviewer: string, ids: string[] }[]} assignments
     * @returns {Promise<{ done: true, reports: ReviewerReport[] } | { done: false, outcome: RunOutcome }>}
     */
    const runPanel = async (assignments) => {
      // **Every reviewer runs at once; everything after that happens in declared order.** The
      // panel was sequential until 0.143.0 and it was the run's dominant cost: measured in
      // `ship1`, review was 73% of wall clock, panels held ~25 minutes an iteration while the
      // builders they judged differed by 17x, and one cold read took 1,215 seconds. Parallel
      // recovers `max()` where `sum()` was being paid.
      //
      // The constraint that survives the parallelism is BORROWED.md R21's, verbatim: collect
      // all children, then parse and charge in **declared reviewer order regardless of
      // completion order**. `Promise.all` preserves positions, the map initiates spawns in
      // declared order, and the loop below reads, charges, parses and early-exits in that same
      // order — so given the same three envelopes, every decision this function makes is
      // byte-identical to the sequential version's. A panel whose verdict depends on who
      // finished first would be a different program.
      //
      // What genuinely changed is the overshoot, and it is documented where the ceilings are
      // (`config.mjs`): a failed or budget-breaching reviewer used to stop the *later* ones
      // from ever spawning; now all are already in flight, so the bound on spend past a
      // ceiling grows from one child to children-in-flight — three, during review.
      const settled = await Promise.all(
        assignments.map(({ reviewer, ids }) => effects.review(reviewer, ids)),
      );
      /** @type {ReviewerReport[]} */
      const collected = [];
      // **Conserve first, adjudicate second** (REVIEW F18). Every reviewer runs to completion
      // under `Promise.all`, so every envelope has been *bought* by the time this loop starts —
      // but charging and deciding used to happen together, so an early failure or ceiling exit
      // returned with the later reviewers' spend never recorded. Measured: three reviewers
      // returning 10/20/30 tokens and $1/$2/$3 after a 100-token, $0.01 builder reported an
      // ABORTED outcome of 110 tokens and $1.01, omitting 50 tokens and $5 that had been paid.
      //
      // Charging in array order keeps the per-index answer identical to the old interleaved one:
      // `charges[i]` is the cumulative verdict through reviewer `i`, which is exactly what the
      // combined loop computed there. Declared-order adjudication is unchanged, and a later
      // reviewer still gains no verdict authority from having been charged.
      const charges = settled.map((result) => charge(result));
      for (let i = 0; i < assignments.length; i += 1) {
        const { reviewer, ids } = assignments[i];
        const result = settled[i];
        const exhausted = charges[i];
        // A reviewer that died is not a reviewer that found problems. Scoring it as a
        // failing audit would hand the builder "output could not be parsed" as though it
        // were a finding, and burn the remaining iterations against a wall.
        if (!result.ok) return { done: false, outcome: await landCleanly(result, iterationNumber, `${reviewer} audit`) };
        // Ending here discards the reviewers later in declared order. That is correct: a
        // panel is only unanimous if every member answered, so a partial panel cannot ship.
        if (exhausted) return { done: false, outcome: finish('BUDGET', ceilingReason()) };
        collected.push(
          // Parsed, then resolved against the candidate tree before anything counts it (REVIEW F6).
          // The parser establishes that the citation is a location; only this establishes that it
          // is a location in the repository the reviewer was reading.
          resolveReportEvidence(
            parseReviewerReport(result.text, { requiredIds: ids, minConfidence: config.advisory.minConfidence }),
            { root: subject() },
          ),
        );
      }
      return { done: true, reports: collected };
    };

    // The bytes this panel is about (REVIEW F14). **Not a sample taken here** — it is the tree
    // object the candidate was materialized from, which is the tree the gates ran against and the
    // tree the reviewers are reading right now. Sampling the main working tree at this line is what
    // the reopened finding rejected: the same identity before and after an operation says nothing
    // about which bytes were visible during it, and this identity was never about the main tree.
    reviewedWorkspace = candidateTree;
    // **The seal and the checks become one fact here, or not at all** (REVIEW F22). This is the only
    // line where the tree that was gated and the gates that were run on it are both known and both
    // current; recording them separately is what let the receipt pair a seal with another
    // iteration's results. `commit` is filled in below, once this attempt has one.
    // **No `null` branch here any more, and its absence is the repair** (REVIEW F14, reopened). The
    // identity used to be a hash sampled at this line, so "the tree could not be read" was a state
    // the panel had to be defended against. It is now the tree object the candidate was made from,
    // and a run that could not make one never reached this line: `snapshotCandidate` above ends the
    // run rather than falling back to the live tree. Keeping a dead guard here would read as a check.
    sealedAttempt = {
      tree: reviewedWorkspace,
      commit: null,
      gates: iterationGateResults ?? [],
      reports: iterationReportDigests ?? [],
      // Sealed with the results, for the reason the results are sealed with the tree (REVIEW F22):
      // an identity taken later would describe a different iteration's gates.
      identities: iterationGateIdentities ?? [],
      reportDigestByName: iterationReportDigestByName ?? {},
      attempt: iterationNumber,
    };

    // **The agent surface, rescanned against the exact bytes about to be reviewed** (REVIEW F29).
    //
    // Preflight scans this once, before the run — and the builder has been editing the tree ever
    // since. A `CLAUDE.md`, a `.claude/rules/` file, a hook, a Skill or an MCP entry added during
    // the run is *candidate output*, and the panel is about to read the tree it lives in. The
    // reviewer prompt no longer treats any of it as authority, but a prompt is a discipline and a
    // hostile hook is a mechanism; F29 asks for both, and this is the mechanism half.
    //
    // Placed after the seal and before the first reviewer, so the bytes scanned are the bytes
    // reviewed. Fail-closed: blocking findings end the iteration with those findings as the
    // objective, which is the builder's next instruction rather than a run that dies.
    //
    // **It is a known-pattern scan and nothing more.** It refuses the forms it knows. It is not
    // proof that arbitrary model-visible text in a repository is safe, and describing it that way
    // would be the overclaim §6.1 warns about.
    //
    // The default is the **real scanner**, not a no-op: an effect that silently means "no scan"
    // when a caller omits it is a gate that defaults to pass, and a scan that throws is a scan
    // that did not happen. Both fail closed here.
    /** @type {{ file: string, detail: string }[]} */
    let hostile;
    /** @type {import('./security-scan.mjs').SurfaceScanRecord} */
    let scanRecord = {
      at: effects.now(),
      iteration: iterationNumber,
      // **Bound to the exact reviewed tree** (REVIEW F29). A scan whose subject nobody can name is
      // not evidence: an auditor reading `.meeseeks/` afterwards has to be able to say that the tree
      // that was scanned is the tree the verdict was sealed to, and since REVIEW F14 that identity is
      // a git tree object rather than a description of a directory.
      tree: reviewedWorkspace,
      blocking: false,
      findings: [],
    };
    try {
      const scan = effects.scanSurface ?? scanAgentSurface;
      const scanned = scan(subject());
      scanRecord = { ...scanRecord, findings: scanned.findings };
      hostile = blockingFindings(scanned.findings).map((finding) => ({
        file: finding.file,
        detail: finding.detail,
      }));
    } catch (error) {
      hostile = [{ file: subject(), detail: `the agent-surface scan could not run: ${/** @type {Error} */ (error).message}` }];
      // A scan that threw is a scan that did not happen, and the record says so rather than reading
      // as a clean one.
      scanRecord = { ...scanRecord, error: /** @type {Error} */ (error).message };
    }
    scanRecord.blocking = hostile.length > 0;
    try {
      recordSurfaceScan(meeseeksDir, scanRecord);
    } catch (error) {
      // It records, it does not decide. Losing the account of a healthy run must not end it.
      effects.log(`the agent-surface scan could not be recorded: ${/** @type {Error} */ (error).message}`);
    }
    if (hostile.length > 0) {
      effects.log(`cannot review: the candidate tree carries ${hostile.length} blocking agent-surface finding(s)`);
      for (const finding of hostile) effects.log(`  ${finding.file}: ${finding.detail}`);
      objective = {
        kind: 'review',
        headline: 'The repository instructs the agents that judge it.',
        reason:
          'the gates passed, but the candidate tree contains agent configuration a reviewer would read as ' +
          'instruction — a hook, an instruction file, a Skill or an MCP entry. A panel reading a tree that ' +
          'tells it how to audit is not an independent panel',
        findings: hostile.map((finding) => `${finding.file}: ${finding.detail}`),
      };
      await closeIteration(iterationNumber, ['ship:agent-surface'], score, passing.size);
      continue;
    }

    const first = await runPanel(plan.assignments);
    if (!first.done) return first.outcome;
    if (!(await workspaceStillMatches(reviewedWorkspace))) {
      effects.log('the candidate workspace changed while the panel was reading it; the verdict is discarded');
      objective = {
        kind: 'review',
        headline: 'The tree changed underneath the panel. Nothing was committed.',
        reason:
          'the workspace the reviewers read is not the workspace that exists now, so their verdict is about bytes ' +
          'that are gone. Something wrote to the tree while the panel ran — a background process the last build ' +
          'left behind is the usual cause. The verdict is discarded and the gates run again from scratch',
        findings: ['the candidate workspace changed during review'],
      };
      await closeIteration(iterationNumber, ['ship:workspace-drift'], score, passing.size);
      continue;
    }
    /** @type {ReviewerReport[]} */
    // The carried report gets the same boundary. A carry is a pre-filter, never a substitute for
    // the panel (DESIGN.md §4.3), and a requirement carried on a citation whose file has since
    // gone is not carrying evidence — it is carrying a memory of some.
    let reports =
      plan.carried.length === 0
        ? first.reports
        : [...first.reports, resolveReportEvidence(carriedReport(plan.carried), { root: subject() })];
    let panel = combinePanel(reports, { requireUnanimous: config.requireUnanimous, requiredIds });

    if (plan.narrowed && panel.verdict === 'pass') {
      // The pre-filter said yes, so the answer now costs what it always cost. Nothing that
      // reaches a ship decision was carried.
      effects.log(`panel carry: ${plan.carried.length} requirement(s) were carried, and the full panel now runs before any ship`);
      const full = await runPanel(panelPlan.assignments);
      if (!full.done) return full.outcome;
      if (!(await workspaceStillMatches(reviewedWorkspace))) {
        effects.log('the candidate workspace changed while the full panel was reading it; the verdict is discarded');
        objective = {
          kind: 'review',
          headline: 'The tree changed underneath the panel. Nothing was committed.',
          reason:
            'the workspace the reviewers read is not the workspace that exists now, so their verdict is about bytes ' +
            'that are gone. The verdict is discarded and the gates run again from scratch',
          findings: ['the candidate workspace changed during review'],
        };
        await closeIteration(iterationNumber, ['ship:workspace-drift'], score, passing.size);
        continue;
      }
      reports = full.reports;
      panel = combinePanel(reports, { requireUnanimous: config.requireUnanimous, requiredIds });
    } else if (plan.narrowed) {
      effects.log(`panel carry: skipped re-review of ${plan.carried.length} requirement(s) whose evidence has not changed`);
    }

    // Written before anything acts on it, so a record exists whichever way the run then goes.
    recordPanelVerdict(meeseeksDir, {
      iteration: iterationNumber,
      // Which bytes this verdict is about (REVIEW F14). Without it the record says what was decided
      // and not what it was decided over, which is half a receipt.
      workspace: reviewedWorkspace,
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
          // **By id, not by who reviewed it.** This asked whether a reviewer *named* `security`
          // owned the entry, and `reviewers`/`ownership` are configuration — so a panel
          // configured with one reviewer named anything else made `isSecurity` false for every
          // entry, and A4's security monotonicity switched itself off without a word. Measured
          // in run `panelB`: `DoD-2-security` was filed as an ordinary requirement pin, which is
          // then eligible for the A8 carry, so the one id whose degradation A4 exists to catch
          // became the one nobody re-reads. A defensive mechanism disabled by a config key that
          // never mentions it is the silent-degradation class CLAUDE.md names.
          const isSecurity = isSecurityId(entry.id);
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
      if (pinsChanged) writePins(meeseeksDir, pins);

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

    // Immediately before the commit, because the commit is the moment the bytes stop being a
    // working tree and start being the run's claim about what was reviewed (REVIEW F14).
    if (!(await workspaceStillMatches(reviewedWorkspace))) {
      effects.log('the candidate workspace changed between the panel and the commit; nothing was committed');
      objective = {
        kind: 'review',
        headline: 'The tree changed between the review and the commit. Nothing was committed.',
        reason:
          'the panel judged one set of bytes and a different set was about to be committed under its verdict. ' +
          'Nothing was staged, and the gates run again from scratch',
        findings: ['the candidate workspace changed before the commit'],
      };
      await closeIteration(iterationNumber, ['ship:workspace-drift'], score, passing.size);
      continue;
    }

    // ---- Phase 6: ship, or bank the progress and hand the findings back ---
    const commit = await effects.commit(
      panel.verdict === 'pass'
        ? `meeseeks: iteration ${iterationNumber}`
        : `meeseeks: iteration ${iterationNumber} (review outstanding)`,
    );
    if (sealedAttempt !== null) sealedAttempt.commit = commit;
    // After the commit, prove the tree that landed is the tree that was reviewed. The commit
    // stages the whole working tree, so a working tree still matching the sealed identity is the
    // committed tree matching it — which is what a deploy and a tag are about to assert.
    // **And the tree `HEAD` actually names** (REVIEW F14). The seal above compares the working tree
    // with the candidate; this compares the *commit* with it. They are the same value by
    // construction when nothing went wrong — the commit is made of the staged working tree, and the
    // candidate is a tree object written from those same bytes — so an inequality means the commit
    // published something other than what was judged, whatever the working tree says.
    const landedTree = effects.committedTree === undefined ? null : await effects.committedTree();
    if (landedTree !== null && landedTree !== reviewedWorkspace) {
      effects.log(
        `the commit names tree ${landedTree} and the reviewed candidate was ${reviewedWorkspace}; this commit is ` +
          'not the reviewed tree and will not ship',
      );
      objective = {
        kind: 'review',
        headline: 'The commit does not contain the bytes that were reviewed.',
        reason:
          'the commit landed a different tree object from the one the gates and the panel judged, so it cannot ' +
          'carry that verdict to a deploy or a tag. The gates run again from scratch',
        findings: ['the committed tree is not the candidate tree'],
      };
      await closeIteration(iterationNumber, ['ship:committed-tree'], score, passing.size);
      continue;
    }
    if (!(await workspaceStillMatches(reviewedWorkspace))) {
      effects.log('the workspace changed as the commit landed; this commit is not the reviewed tree and will not ship');
      objective = {
        kind: 'review',
        headline: 'The tree changed as the commit landed, so the commit is not what was reviewed.',
        reason:
          'the commit exists, but its bytes are not the bytes the panel judged, so it cannot carry that verdict to ' +
          'a deploy or a tag. The gates run again from scratch against whatever is there now',
        findings: ['the committed tree is not the reviewed workspace'],
      };
      await closeIteration(iterationNumber, ['ship:workspace-drift'], score, passing.size);
      continue;
    }
    // The seal says the *working* tree is still the reviewed one. This says the working tree is
    // what git actually holds (REVIEW F31): a commit that failed after staging leaves the bytes on
    // disk matching the seal while `HEAD` names an older tree, and deploy and tag would then
    // publish that older tree. A clean worktree after the commit is the evidence that the reviewed
    // bytes are *in* the commit rather than beside it.
    const published = await effects.verifyPublication();
    if (!published.ok) {
      effects.log(`cannot publish: ${published.detail}`);
      objective = {
        kind: 'review',
        headline: 'The commit does not hold the tree that was reviewed.',
        reason:
          `the panel judged this tree, but ${published.detail}. Nothing may be deployed or tagged on a commit ` +
          'that does not contain the reviewed bytes, so the ship is withheld and the gates run again',
        findings: [published.detail],
      };
      await closeIteration(iterationNumber, ['ship:publication'], score, passing.size);
      continue;
    }
    // The same credited set Phase 4 computed (REVIEW F17, reopened). This second advance is what
    // records the commit, and it banked the *full* passing set — so every id Phase 4 had withheld
    // for having no red evidence under its current definition was banked here a moment later.
    const advanced = evaluateIteration(state, passing, {
      commit,
      collected,
      definitions,
      credited,
      reports: reportOwners,
      unmeasured,
    });
    if (advanced.action === 'advance') saveState(meeseeksDir, advanced.state);

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
      await closeIteration(iterationNumber, blockers, score, passing.size);
      continue;
    }

    // A panel that passed is a judgement about the code. It is not evidence that the suite the
    // judgement leaned on can fail at all, and the first SHIPPED this project produced had none.
    let sensitivity = suiteSensitivityEvidence(gateOutcome, loadRedEvidence(meeseeksDir));

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
      const attempt = await effects.shipTimeMutation();
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
      await closeIteration(iterationNumber, ['ship:unproven-suite'], score, passing.size);
      continue;
    }

    if (panel.verdict === 'pass') {
      // The deploy runs **here**, in front of the ship, and that position is the whole fix.
      // Until 0.63.0 it lived inside `ship()` — after the meeseeks/GRAND-PRIZE tag was already
      // written — and its failure was printed and ignored, so a run could announce a grand
      // prize having deployed nothing. A deploy that cannot withhold the tag is not evidence
      // about the tag (DESIGN.md §10.1).
      const deployed = (await effects.deploy?.()) ?? { ok: true, detail: 'no deploy configured' };
      lastDeploy = effects.deploy === undefined ? null : deployed;
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
        await closeIteration(iterationNumber, ['ship:deploy'], score, passing.size);
        continue;
      }
      if (deployed.detail !== 'no deploy configured') effects.log(deployed.detail);
      // The terminal boundary. A ship is a claim about a specific document, and everything
      // between the pre-gate check and here — the panel's own reads, the deploy, the ship-time
      // mutation gate — has had the opportunity to run beside a writer.
      const driftedBeforeShip = specificationDrift();
      if (driftedBeforeShip !== null) return driftedBeforeShip;

      // **The publication subject is re-established after the mutation-capable steps** (REVIEW
      // F38). Everything above proved the *commit* was the reviewed tree — and then two things ran
      // that can write to the repository: the ship-time mutation gate, and the operator's arbitrary
      // deploy command. A deploy that edits and commits tracked source moved `HEAD` off the
      // reviewed commit, and only the specification was rechecked afterwards, so both tags landed
      // on bytes no gate and no reviewer had seen. That is F31's false-completion class arriving
      // one step later in the pipeline.
      //
      // Three questions, because they fail in three different ways: the working tree is still the
      // sealed one, git holds it rather than merely having it on disk, and `HEAD` is still the
      // exact commit that was verified. Any drift withholds the ship rather than failing the
      // iteration — the work stands, the claim about it does not.
      /** @type {string | null} */
      let shipDrift = null;
      if (!(await workspaceStillMatches(reviewedWorkspace))) {
        shipDrift = 'the working tree changed after the deploy, so it is no longer the tree that was reviewed';
      } else {
        const republished = await effects.verifyPublication();
        if (!republished.ok) shipDrift = `after the deploy, ${republished.detail}`;
        else if (typeof republished.head === 'string' && republished.head !== commit) {
          shipDrift =
            `the deploy moved HEAD from the reviewed commit ${commit.slice(0, 12)} to ` +
            `${republished.head.slice(0, 12)}, so a tag here would name a tree nothing reviewed`;
        }
      }
      if (shipDrift !== null) {
        effects.log(`cannot ship: ${shipDrift}`);
        objective = {
          kind: 'review',
          headline: 'The repository moved after the deploy, so the ship would name the wrong tree.',
          reason:
            `the panel passed and the deploy came up, but ${shipDrift}. A ship is a claim about a specific ` +
            'commit, so it is withheld and the gates run again against whatever is there now',
          findings: [shipDrift],
        };
        await closeIteration(iterationNumber, ['ship:post-deploy-drift'], score, passing.size);
        continue;
      }

      effects.event?.({ kind: 'ship', iteration: iterationNumber });
      try {
        // The **explicit** reviewed commit, not whatever `HEAD` names by now (REVIEW F38).
        await effects.ship(iterationNumber, commit);
      } catch (error) {
        // A tag that could not be written is not a ship (REVIEW F31). `SHIPPED` is a claim about an
        // artifact somebody can go and look at, so a failure here ends the run rather than
        // decorating it.
        return finish('ABORTED', `the ship could not be published: ${/** @type {Error} */ (error).message}`);
      }
      return finish('SHIPPED', `panel unanimous on ${requiredIds.length} requirement(s)`);
    }

    effects.log(`review outstanding: ${panel.failing.length} finding(s)`);
    outstandingFindings = panel.failing.map((finding) => String(finding));
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
    await closeIteration(
      iterationNumber,
      reports.flatMap((report) =>
        report.requirements.filter((entry) => entry.status === 'fail').map((entry) => `requirement:${entry.id}`),
      ),
      score,
      passing.size,
    );

    // ---- §13.3 reality-check circuit-breaker ----------------------------
    if (progress.stalledIterations === config.realityCheck.after) {
      const verdict = await effects.realityCheck();
      const exhausted = charge(verdict);
      if (verdict.ok && /unbuildable/i.test(verdict.text)) {
        mkdirSync(meeseeksDir, { recursive: true });
        writeFileSync(path.join(meeseeksDir, 'reality-check.md'), verdict.text, 'utf8');
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
 * Every `.meeseeks/` path that must never be tracked.
 *
 * `pins.json` and `assumptions.json` were missing from this list, and `pins.json` is the
 * serious one. `CLAUDE.md` names three monotonic properties, and that file holds **two** of
 * them — pinned security elements and cold-passed requirements. Tracked, a
 * `git reset --hard` to `lastGoodCommit` restores an older copy, so a pin earned since that
 * commit is silently gone and a recorded quarantine along with it. That is the exact failure
 * the comment below has always described for `state.json`, in the file where the invariant
 * says a false negative is unrecoverable.
 *
 * Found by reading a real repository's `git ls-files .meeseeks` before deliberately triggering a
 * hard reset. Both files were tracked there.
 */
export const MEESEEKS_IGNORED_PATHS = [
  // **Positional, not a list of names** (REVIEW F9). Every artifact this directory has ever gained
  // was trackable until somebody remembered to add it, and five of them were found the expensive
  // way — by watching `git add -A` commit run state into the repository under test, then watching a
  // hard reset restore an older copy of it. `oracle.json`, `capabilities.json` and the mutation
  // sandbox's `stryker.config.json` were still missing when Codex looked, and a run that tracks its
  // own `.meeseeks/` also makes the *next* preflight refuse the repository.
  //
  // `.meeseeks/*` rather than `.meeseeks/`, and the difference is the whole reason this works: git
  // will not descend into an excluded *directory*, so a negation for a child of an excluded
  // directory is inert. Excluding the *contents* keeps the directory itself visible, which is what
  // makes the carve-out below effective.
  //
  // This is the same argument the guard hook's `.meeseeks/` rule already makes about writes
  // (DESIGN.md §6): the rule is a position, so an artifact added tomorrow is covered today.
  '.meeseeks/*',
  // The one deliberate exception. `config.json` is the run's settings rather than its machine
  // state, and an operator who wants a run reproducible from the repository may track it.
  '!.meeseeks/config.json',
  // Not `.meeseeks/` state, and here for a reason measured in dogfood run 4. The operator redirects
  // the run's output into the repository — `DOGFOOD.md` said to — so `git add -A` tracked it, and
  // the hard reset in iteration 2 **reverted the log to its state at `lastGoodCommit`**. That
  // destroys the record of the reset itself. Worse, git replaces the file rather than truncating
  // it, so the shell's open descriptor was left pointing at an unlinked inode and *every line
  // written afterwards went nowhere* — the run's terminal state is unrecoverable. Ignored, the
  // log is never tracked, the reset never touches it, and the descriptor survives.
  '*.log',
];

/** The explanation that goes above them. */
const MEESEEKS_IGNORE_HEADER = [
  '',
  '# meeseeks machine state. Never commit these: a hard reset would revert them to an older copy',
  '# and silently drop protection already earned - test ids from state.json, and the pinned',
  '# security elements and cold-passed requirements from pins.json.',
];

/** Written only when the file does not already mention the settings carve-out. */
const MEESEEKS_IGNORE_CONFIG_NOTE = [
  '',
  '# .meeseeks/config.json is deliberately NOT ignored. It is the run settings, not machine',
  '# state, and keeping it in version control makes a run reproducible from the repo.',
];

/**
 * Directories a gate's tooling creates in the tree, which the driver must never commit.
 *
 * Not the same list as `MEESEEKS_IGNORED_PATHS`: those are the driver's own artifacts, and these
 * belong to tools the driver invokes. Both end the same way if they are tracked — `git add -A`
 * every iteration, then a hard reset restoring an older copy — which is why they share a
 * mechanism even though they have different owners.
 *
 * `.hypothesis/` earned its place by execution: the first ever run of the schemathesis gate
 * left one behind. The list is an enumeration, and enumeration has cost this repository three
 * fixes already, so each entry arrives with the run that found it rather than by guesswork.
 */
export const TOOL_CACHE_PATHS = ['node_modules/', '.hypothesis/'];

/**
 * What `.gitignore` should become, or null when it already covers `.meeseeks/`.
 *
 * This is the fix for a genuine hole rather than tidiness. The driver commits with
 * `git add -A`. If `.meeseeks/state.json` were tracked, a hard reset to `lastGoodCommit` would
 * restore an *older* ratchet file, and the run would carry on having quietly forgotten
 * test ids it had already earned — a monotonicity violation with no visible symptom.
 *
 * @param {string} existing current contents, or '' when there is no .gitignore
 * @returns {string | null}
 */
export function meeseeksIgnoreUpdate(existing) {
  const lines = existing.split('\n').map((line) => line.trim());

  // A blanket `.meeseeks/` covers everything — someone who ignored the whole directory has already
  // handled the case, even though this stanza no longer writes it that way.
  if (['.meeseeks/', '.meeseeks', '/.meeseeks', '/.meeseeks/'].some((form) => lines.includes(form))) return null;

  // Every path is checked, not just the ratchet. Testing only for `state.json` meant a
  // repository written by an older build kept its incomplete stanza **forever**: the check
  // passed, nothing was appended, and `pins.json` stayed trackable. An all-or-nothing check on
  // a list that later grows is a check that stops covering its own list.
  const missing = MEESEEKS_IGNORED_PATHS.filter((entry) => !lines.includes(entry) && !lines.includes(`/${entry}`));
  // Caches a *gate* leaves in the tree, which the driver would then commit with `git add -A`.
  // `node_modules/` was the first; `.hypothesis/` is the second, and it was found the way the
  // first three `.meeseeks/` artifacts were — by execution, when the schemathesis gate was run for
  // the first time and left a `.hypothesis/` directory behind in this very repository. Same
  // defect class as `state.json`, `outcome.json` and `run.json`, arriving from a tool rather
  // than from us: the driver does not commit machine state into the repository under test.
  const missingCaches = TOOL_CACHE_PATHS.filter(
    (entry) => !lines.includes(entry) && !lines.includes(entry.replace(/\/$/, '')),
  );
  if (missing.length === 0 && missingCaches.length === 0) return null;

  /** @type {string[]} */
  const stanza = [];
  if (missing.length > 0) stanza.push(...MEESEEKS_IGNORE_HEADER, ...missing);
  if (missing.length > 0 && !existing.includes('.meeseeks/config.json is deliberately NOT ignored')) {
    stanza.push(...MEESEEKS_IGNORE_CONFIG_NOTE);
  }
  if (missingCaches.length > 0) {
    stanza.push('', '# The driver commits with `git add -A` every iteration.', ...missingCaches);
  }
  stanza.push('');

  const separator = existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
  return `${existing}${separator}${stanza.join('\n')}`;
}

/**
 * @param {string} cwd
 * @returns {boolean} true when the file was changed
 */
export function ensureMeeseeksIgnored(cwd) {
  const file = path.join(cwd, '.gitignore');
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const updated = meeseeksIgnoreUpdate(existing);
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
 * @param {string} meeseeksDir where that tree's reports are written
 * @returns {Gate[]}
 */
export function commandGates(root, meeseeksDir) {
  return gatesFor(resolveToolchain(root).toolchain, { root, meeseeksDir }).gates;
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
 * @param {string} meeseeksDir
 * @param {string[] | undefined} changedFiles measured from the last ratchet-advancing commit,
 *   or `undefined` when no such commit exists yet — a distinction the consuming gate reports as
 *   a different sentence, because "no baseline" and "nothing changed" are different facts
 * @returns {{ gates: Gate[], skipped: { name: string, reason: string }[] }}
 */
export function conditionalCommandGates(root, meeseeksDir, changedFiles) {
  return gatesFor(
    resolveToolchain(root).toolchain,
    { root, meeseeksDir, changedFiles },
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
 * @param {{ cwd: string, since: string | null, run?: import('./plugins.mjs').Runner }} options
 * @returns {Promise<string[]>}
 */
export async function changedSince(options) {
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
  const tracked = lines(await run('git', ['diff', '--name-only', options.since, '--'], { cwd: options.cwd }));
  // `git diff` lists tracked changes only, and gates run **before** the iteration's commit —
  // so until 0.64.0 every brand-new file an iteration created was invisible here. A builder
  // that satisfied its objective by adding a module drew the same "nothing changed since the
  // last ratchet-advancing commit" as one that did nothing, and the mutation gate declined
  // over work sitting in the tree. Found in dogfood run 9, where the objective was "prove the
  // suite can fail" and the builder's answer was a new test file nothing counted.
  //
  // `--exclude-standard` so ignored files stay ignored: `node_modules` and build output are
  // not this iteration's work, and mutating them is not a thing anybody wants.
  const untracked = lines(await run('git', ['ls-files', '--others', '--exclude-standard'], { cwd: options.cwd }));
  // A failed listing degrades to fewer files rather than none: the gate then scopes to less
  // and says so, which is the recoverable direction. Losing the tracked half because the
  // second command failed would be the loud one.
  return [...new Set([...tracked, ...untracked])];
}

/**
 * Write the driver-owned mutation configuration.
 *
 * It lives under `.meeseeks/` because the builder must not be able to weaken it, and it exists at
 * all because Stryker has no `--thresholds.*` flag: `thresholds.break` defaults to null, and a
 * run with surviving mutants then exits 0. Measured, not assumed — see `node.mjs`.
 *
 * **The sandbox lives OUTSIDE the target tree** (`tempDirName`), and Tallyho attempt 3 is why
 * (DOGFOOD.md, machine finding #5): Stryker's default `.stryker-tmp` sits in the repository, and
 * when a mutation run crashed mid-flight it left the sandbox behind — full of `@ts-nocheck`
 * headers Stryker injects by design — where the target's own `eslint .` swept it on the next two
 * iterations. The lint gate billed the builder for machine droppings it never wrote, and the
 * stall counter killed the run. Positional fix, not cleanup: a sandbox that never enters the tree
 * cannot poison a gate, crashed or not. `mkdtemp` (fresh per write) rather than a fixed temp
 * name, for the same reason the guard's counter design was refused — a predictable name in a
 * shared temp dir is a symlink pre-plant target. Leftovers after a crash sit in the OS temp dir,
 * which is janitorial, not correctness.
 *
 * @param {string} meeseeksDir
 * @returns {string} the path written
 */
export function writeMutationConfig(meeseeksDir) {
  mkdirSync(meeseeksDir, { recursive: true });
  const file = path.join(meeseeksDir, MUTATION_CONFIG);
  const contents = {
    ...MUTATION_CONFIG_CONTENTS,
    tempDirName: mkdtempSync(path.join(os.tmpdir(), 'meeseeks-stryker-')),
  };
  writeFileSync(file, `${JSON.stringify(contents, null, 2)}\n`, 'utf8');
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
 * @param {string} meeseeksDir
 * @returns {string | null} the unit gate's command line, or null when the toolchain declines it
 */
export function unitGateCommand(root, meeseeksDir) {
  const found = gateSummary(root, meeseeksDir).gates.find((gate) => gate.name === 'unit');
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
 * @param {string} meeseeksDir
 * @returns {{ toolchain: string, detected: boolean, evidence: string, gates: Gate[], skipped: { name: string, reason: string }[] }}
 */
export function gateSummary(root, meeseeksDir) {
  const resolved = resolveToolchain(root);
  const { gates, skipped } = gatesFor(resolved.toolchain, { root, meeseeksDir });
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
    // **Bounded** (REVIEW F19). This decides a gate — `DoD-4-docs-observability` — over a file the
    // target writes, so "arbitrarily large" is reachable by the thing being judged. The question is
    // a *minimum*, so a document over the limit is certainly not a stub: it is answered `true`
    // without reading it, rather than refused, because refusing would fail a gate on size alone.
    return readBounded(file, READ_LIMITS.evidence).replace(/\s+/g, ' ').trim().length >= minimumBytes;
  } catch (error) {
    if (error instanceof ArtifactTooLargeError) return true;
    return false;
  }
}

/**
 * Directories no source detector descends into: dependency trees, VCS internals, and **generated
 * framework output**. The generated class is the Tallyho smoke's second machine finding: the old
 * health-literal scan matched `.next/required-server-files.js` and `_buildManifest.js` — compiled
 * route tables, not source — so one successful build could keep the observability gate green after
 * the actual route was deleted. A gate wrong in the *passing* direction is the dangerous
 * orientation. `.nuxt` and `.svelte-kit` are the same class for their frameworks, excluded by
 * class rather than waiting to be caught one at a time (the enumeration lesson, again). One list,
 * shared by {@link anySourceMatches} and {@link findRouteFileHealthPath} — two copies would drift.
 */
const SKIPPED_SOURCE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.svelte-kit',
]);

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
      if (SKIPPED_SOURCE_DIRS.has(entry.name)) continue;
      if (anySourceMatches(full, depth + 1, predicate)) return true;
      continue;
    }
    if (!entry.isFile() || !/\.(mjs|cjs|js|jsx|ts|tsx|vue|svelte|py|go|rb)$/.test(entry.name)) continue;
    try {
      // **Bounded, and this is the worst of the unbounded reads** (REVIEW F19): it walks the whole
      // candidate tree and reads every source file whole, so one generated bundle is enough to kill
      // a run inside a gate. A file over the limit is skipped exactly as an unreadable one is, which
      // fails closed — the predicate reports "not found", and the gate fails rather than passes.
      if (predicate(readBounded(full, READ_LIMITS.evidence))) return true;
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
 * honestly, so a builder satisfies it dishonestly: dogfood run 2's `.meeseeks/assumptions.json`
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

/** The URL segments this gate accepts as naming a health endpoint, shared by both detectors. */
const HEALTH_SEGMENTS = new Set(['health', 'healthz', '_health']);

/**
 * A health path declared by file location, for frameworks that route by filesystem.
 *
 * The Tallyho web-ui smoke (DOGFOOD.md, 15 Aug) is why this exists: the builder wrote exactly the
 * endpoint the PRD asked for — `src/app/api/health/route.ts`, the idiomatic Next.js App Router
 * shape — and the literal detector could not see it, because in a filesystem-routed framework the
 * path never appears as a string in source. The observability gate then failed three straight
 * iterations against work that was correct, which is this project's most expensive defect class
 * wearing a gate's clothes.
 *
 * Two conventions, conservatively:
 *   - **App Router:** `…/app/<segments>/<health>/route.{js,jsx,ts,tsx}` — the URL is the segments
 *     after the innermost `app`, with parenthesised route groups dropped (they never appear in
 *     the URL). A dynamic `[param]` segment anywhere in the chain rejects the candidate: a health
 *     endpoint behind a parameter is not deterministically probeable.
 *   - **Pages Router:** `…/pages/<segments>/<health>.{js,ts}` — the URL is the segments after
 *     `pages` with the extension stripped.
 *
 * The final URL segment must be exactly one of {@link HEALTH_SEGMENTS} — the same set the literal
 * detector accepts — so `healthcheck/route.ts` stays a non-match rather than a lucky one.
 *
 * @param {string} cwd
 * @returns {string | null}
 */
export function findRouteFileHealthPath(cwd) {
  /** @type {string | null} */
  let found = null;
  /** @param {string} dir @param {number} depth @param {string[]} rel */
  const walk = (dir, depth, rel) => {
    if (found !== null || depth > 8 || !existsSync(dir)) return;
    /** @type {import('node:fs').Dirent[]} */
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found !== null) return;
      if (entry.isDirectory()) {
        if (SKIPPED_SOURCE_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name), depth + 1, [...rel, entry.name]);
        continue;
      }
      if (!entry.isFile()) continue;
      const appAt = rel.lastIndexOf('app');
      if (appAt !== -1 && /^route\.(m?js|jsx|ts|tsx)$/.test(entry.name)) {
        const segments = rel.slice(appAt + 1).filter((seg) => !/^\(.*\)$/.test(seg));
        if (segments.length === 0) continue;
        if (segments.some((seg) => seg.includes('['))) continue;
        if (!HEALTH_SEGMENTS.has(segments[segments.length - 1])) continue;
        found = `/${segments.join('/')}`;
        return;
      }
      const pagesAt = rel.lastIndexOf('pages');
      const pageMatch = entry.name.match(/^(health|healthz|_health)\.(m?js|ts)$/);
      if (pagesAt !== -1 && pageMatch !== null) {
        const segments = [...rel.slice(pagesAt + 1), pageMatch[1]];
        if (segments.some((seg) => seg.includes('['))) continue;
        found = `/${segments.join('/')}`;
        return;
      }
    }
  };
  walk(cwd, 0, []);
  return found;
}

/**
 * The health endpoint's path, as the source declares it, or null.
 *
 * @param {string} cwd
 * @returns {string | null}
 */
export function findHealthPath(cwd) {
  /** @type {string | null} */
  let found = null;
  anySourceMatches(cwd, 0, (contents) => {
    // **Comments are blanked first, and this repository is why.** Run against its own tree the
    // gate reported `/health` declared — matching a jsdoc line in `health-probe.mjs` that reads
    // *"`/health` establishes that somebody typed it, which is a different claim"*. The file
    // documenting the hazard tripped it. A comment is not a route, and a gate wrong in the
    // *passing* direction is the dangerous orientation: it reports protection nobody has.
    //
    // The behavioural probe below is still the real check when a start command exists; this
    // static match only ever claimed a *declaration*, and a declaration in prose is not one.
    //
    // The optional `/api` prefix is the Tallyho smoke's other lesson: `/api/health` is the single
    // most common spelling — this repository's own PRDs ask for it by name — and the original
    // pattern could not match it.
    const match = blankComments(contents).match(/['"`]((?:\/api)?\/(?:health|healthz|_health))\b/);
    if (match === null) return false;
    found = match[1];
    return true;
  });
  // A repository can declare the endpoint without ever writing its path down: filesystem-routed
  // frameworks put it in a file location instead. Checked second so the literal, when both
  // exist, keeps its long-standing precedence.
  return found ?? findRouteFileHealthPath(cwd);
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
 * The sentence a builder needs when CI "never runs" a step its workflow plainly runs.
 *
 * **This is the fix the CI detectors actually needed.** `unit` and `e2e` are matched by runner
 * name — `vitest`, `playwright` — and not by `npm test`, deliberately: a package script can
 * invoke any runner, and when CI ran `node --test` while the unit gate ran
 * `npx vitest run --reporter=json`, two live runs on 10 August 2026 produced correct suites the
 * gate collected **nothing** from. The narrowness is a measured decision and must stay.
 *
 * What was wrong is that the failure said only *"never run: unit"*. A builder whose workflow
 * contains `npm test` reads that as false, and the obvious repair — adding another test step —
 * fails identically. **On 14 August this nearly caused the pattern to be widened**, which would
 * have reopened the hole those two runs paid for. A rule with a reason should say the reason
 * where it fails, not in a comment nobody in the loop can read.
 *
 * @param {string[]} missing
 * @returns {string}
 */
function runnerHint(missing) {
  const named = missing.filter((operation) => operation === 'unit' || operation === 'e2e');
  if (named.length === 0) return '';
  return (
    `. Name the runner explicitly for ${named.join(' and ')} — a workflow step like \`npm test\` does not ` +
    'count, because a package script can invoke any runner and the gate would collect nothing from a ' +
    'different one'
  );
}

/** Named logging libraries, across the ecosystems the toolchains cover. */
const LOGGING_LIBRARIES = /\b(pino|winston|bunyan|roarr|log4js|structlog|Serilog|ILogger|logging\.getLogger)\b/;

/** A logger-shaped call, whatever it was built with. */
const LOGGER_CALL = /\b(structuredLog|logger\.(info|warn|error|debug))\b/;

/** A hand-rolled record: a serialised object carrying a level, written to a standard stream. */
const HAND_ROLLED = [
  /JSON\.stringify\s*\(/,
  /\blevel\b/,
  /(console\.(log|error|warn)|process\.(stdout|stderr)\.write)/,
];

/**
 * Does this source file do structured logging?
 *
 * **Case I is why this is not one regex of library names.** That run spent **40,000,137 tokens and
 * \$20.45** failing `observability` — *"missing: structured logging"* — on all eight iterations,
 * against a project whose `src/log.ts` read:
 *
 * ```ts
 * export function log(level: LogLevel, event: string, fields = {}): void {
 *   console.error(JSON.stringify({ level, event, timestamp: new Date().toISOString(), ...fields }));
 * }
 * ```
 *
 * JSON, a level, an event, a timestamp, and a test asserting all four. The old detector looked for
 * `pino|winston|bunyan`, a `structuredLog` identifier, or `logger.info` — **three third-party
 * libraries and two call shapes** — so it saw nothing. **A gate that is wrong in the failing
 * direction is invisible as a defect: it reads as the builder failing**, and it cost an entire run.
 *
 * The irony is worth keeping: the old rule could only recognise *dependency-based* loggers, and
 * this plugin's own hard constraint is **no runtime dependencies**. It would have failed its own
 * gate.
 *
 * **The hand-rolled clause is deliberately conjunctive.** Serialising an object is not logging —
 * a CLI that prints a JSON summary would satisfy a looser rule and make the gate free. Requiring
 * a `level` alongside the serialisation and the stream write is what keeps this a check rather
 * than a formality.
 *
 * @param {string} contents
 * @returns {boolean}
 */
export function hasStructuredLogging(contents) {
  if (LOGGING_LIBRARIES.test(contents) || LOGGER_CALL.test(contents)) return true;
  return HAND_ROLLED.every((pattern) => pattern.test(contents));
}

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
 * @returns {Promise<GateResult>}
 */
export async function observabilityGate(cwd, options = {}) {
  const hasLogger = anySourceMatches(cwd, 0, hasStructuredLogging);
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
  const probe = await options.run(
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
 * @param {string} meeseeksDir
 * @param {{ run?: import('./plugins.mjs').Runner, specification?: string }} [options]
 * @returns {Promise<GateResult>}
 */
export async function oracleGate(cwd, meeseeksDir, options = {}) {
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
  return await runOracle({ meeseeksDir, root: cwd, command, specification: options.specification, run: options.run ?? shell });
}

/**
 * The one path an OpenAPI document may live at.
 *
 * **One path, not a list of accepted names.** Three things have to agree about this file — the
 * architect that writes it, the `docs` gate that requires it, and the fuzzer argv in
 * `plugins.mjs` that reads it — and a set of alternatives is three chances for them to drift
 * apart, with the failure being a gate that passes while the fuzzer tests nothing. A project
 * that already keeps its schema elsewhere pays one `git mv`.
 */
export const OPENAPI_DOC = 'docs/openapi.yaml';

/**
 * The project's OpenAPI document, or `null`.
 *
 * Substantiality is checked the same way the prose contract's is, and for the same reason: a
 * two-line `openapi: 3.1.0` stub satisfies a presence check while describing nothing, and a
 * fuzzer handed an empty schema generates nothing and exits 0.
 *
 * @param {string} cwd
 * @returns {string | null} the absolute path, or null
 */
export function openApiDocument(cwd) {
  const file = path.join(cwd, OPENAPI_DOC);
  return isSubstantial(file, 120) ? file : null;
}

/**
 * @param {string} cwd
 * @param {{
 *   run?: import('./plugins.mjs').Runner, capabilities?: string[] | null, probeTimeoutMs?: number,
 *   meeseeksDir?: string, oracle?: boolean, specification?: string
 * }} [options]
 * @returns {Promise<GateResult[]>}
 */
export async function staticGates(cwd, options = {}) {
  const ci = inspectCiWorkflows(cwd, options.capabilities ?? null);

  const readme = isSubstantial(path.join(cwd, 'README.md'), 200);
  const contract = isSubstantial(path.join(cwd, 'docs', 'api-contract.md'), 200);
  // R18. The prose contract has always been required for every shape; for an `api` the
  // **machine-readable** half is required too, and that is the whole of this item's plumbing.
  // A schema-driven fuzzer needs a schema, and the artifact it needs was already mandatory —
  // just not in a form a tool can read. Authored at design time from the PRD, before any code
  // exists, which is the same independence the CLI oracle gets from Phase 0b.
  const wantsOpenApi = (options.capabilities ?? []).includes('api');
  const openApi = wantsOpenApi ? openApiDocument(cwd) : null;

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
          : `workflows exist but never run: ${ci.missing.join(', ')}${notRequired}${runnerHint(ci.missing)}`,
    },
    (() => {
      const missing = [
        !readme && 'README.md',
        !contract && 'docs/api-contract.md',
        wantsOpenApi && openApi === null && `${OPENAPI_DOC} (required for an api: a schema-driven fuzzer needs a schema)`,
      ].filter(Boolean);
      const ok = missing.length === 0;
      const found = openApi === null ? '' : `, ${path.relative(cwd, openApi)}`;
      return {
        name: 'docs',
        ok,
        status: ok ? 0 : 1,
        detail: ok
          ? `README.md and docs/api-contract.md present and non-stub${found}`
          : `missing or stubbed: ${missing.join(', ')}`,
      };
    })(),
    await observabilityGate(cwd, options),
    // The gates judge the builder; this one judges the gates. `npm run lint` is only worth
    // running while `lint` still means something, and the builder writes what it means.
    integrityGate(cwd),
    // A3. Present only when armed *and* the driver supplied a `.meeseeks` to read from. Both are
    // required rather than one, because an oracle with nowhere to read from would report a clean
    // pass over nothing, and this is the one gate whose entire value is being independent of
    // everything the builder wrote.
    ...(options.oracle === true && options.meeseeksDir !== undefined
      ? [await oracleGate(cwd, options.meeseeksDir, options)]
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
 * @param {{ cwd: string, meeseeksDir: string, run: import('./plugins.mjs').Runner,
 *          capabilities?: readonly string[] | null }} options
 * @returns {Promise<{ installed: boolean, detail: string }>}
 */
export async function ensurePlaywrightBrowsers(options) {
  const { cwd, meeseeksDir, run } = options;
  const capabilities = options.capabilities ?? null;
  if (capabilities !== null) {
    const verdict = gateApplies('e2e', capabilities);
    if (!verdict.applies) return { installed: false, detail: `no browser needed: ${verdict.why}` };
  }
  if (!playwrightConfigPresent(cwd)) return { installed: false, detail: 'no playwright config yet' };
  const marker = path.join(meeseeksDir, 'playwright-installed');
  if (existsSync(marker)) return { installed: false, detail: 'browsers already provisioned' };
  const result = await run('npx', ['playwright', 'install', 'chromium'], { cwd });
  if (!result.ok) {
    return { installed: false, detail: `playwright install failed: ${(result.stderr || result.stdout).trim()}` };
  }
  mkdirSync(meeseeksDir, { recursive: true });
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
 * Does this evidence path point at a test rather than at the thing being tested?
 *
 * **The hazard, recorded in `HANDOFF.md` before the carry existed and armed the moment it did.**
 * Run 3 pinned `PRD-3.1` to a *test file*. A requirement pin fingerprints the whole evidenced
 * file, so if that file is `tests/perf.test.js`, the **source** satisfying the requirement can
 * regress while the test file sits untouched, the fingerprint holds, and the requirement is
 * carried without re-review. That note ends *"decide the test-file-evidence case before building
 * the carry"*, and 0.92.0 built the carry without deciding it. This is the decision.
 *
 * A requirement evidenced only by a test is **never carried**. It is still pinned, still
 * invalidated, and still fail-closed when its target vanishes — only the saving is withheld.
 *
 * **Deliberately broad, and the asymmetry is why.** Refusing to carry costs one re-review of one
 * requirement. Wrongly carrying hides a source regression behind an untouched test file for the
 * rest of the run. A pattern that over-matches is therefore the safe direction, and it covers the
 * shapes the toolchains actually produce — `*.test.*` and `*.spec.*`, a `test`/`tests`/`spec`/
 * `__tests__`/`e2e` directory anywhere in the path, and .NET's `*Tests.cs` convention.
 *
 * @param {string} file a repo-relative path from a pin's evidence
 * @returns {boolean}
 */
export function isTestEvidence(file) {
  const normalised = file.replace(/\\/g, '/');
  if (/(^|\/)(?:__tests__|tests?|spec|e2e)\//i.test(normalised)) return true;
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(normalised)) return true;
  // Case-*sensitive*, and preceded by a separator or a lower-case character. .NET's convention
  // is `WidgetTests.cs` or `Api.Tests.cs`, with a capital T. An earlier case-insensitive version
  // of this line ate `src/attest.cs`, which is ordinary source whose name merely ends in the
  // letters. Broad is the safe direction; blind is not.
  return /(?:[a-z0-9]|[._-])Tests?\.(?:cs|fs|vb)$/.test(normalised);
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
  // Three independent refusals, and the third is defence in depth rather than belt-and-braces
  // pedantry. 0.103.0 stopped a security id being *filed* as a requirement pin, but that fix is
  // not retroactive: a store written by an older build still holds one, and carrying it would
  // silently restore the exact cancellation A4 and A8 produced together — the id whose gradual
  // degradation A4 exists to catch becoming the one nobody re-reads. Two mechanisms must now
  // both fail before that can happen again.
  const carried = carriedPins.filter(
    (pin) => requiredIds.includes(pin.id) && !isTestEvidence(pin.file) && !isSecurityId(pin.id),
  );
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
    // Driver-authored, so the two reviewer-accountability fields are answered by the Driver rather
    // than left absent. Nothing is unverifiable about a pin whose evidenced file is byte-identical
    // to the one already reviewed, and the account states the mechanism instead of imitating an
    // attack nobody performed. A carried pass is a pre-filter, never a substitute for the panel
    // (DESIGN.md §4.3), so this cannot become a route to an unexamined ship.
    unverifiable: [],
    attackAccount:
      'Carried pin, not a fresh audit: this requirement passed a cold panel earlier in the run and ' +
      'the file its evidence cites is byte-identical since. The full panel still decides the ship.',
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
 * The strictest interpretation of a corrupt evidence file is already the one this returns — "no
 * evidence", so every newly passing id is unproven and {@link suiteSensitivityEvidence} withholds
 * the ship — so R26's contribution here is only the quarantine, and the interpretation is
 * deliberately unchanged. The quarantine matters even though the return is the same: without it
 * the very next {@link recordRedEvidence} rewrites `red-evidence.json` in place, so a corruption
 * that briefly existed would be **silently overwritten** rather than preserved. Moving the corrupt
 * bytes aside to `<name>.corrupt-<stamp>` before that write is what keeps the evidence.
 *
 * @param {string} meeseeksDir
 * @param {{ now?: number, log?: (line: string) => void }} [quarantine] injected clock/log for the
 *   corrupt-file quarantine; both default inside {@link quarantineCorruptFile}
 * @returns {{ seenFailing: Set<string>, baseline: Set<string>, definitions: Record<string, string>,
 *   established: boolean }}
 */
export function loadRedEvidence(meeseeksDir, quarantine = {}) {
  const file = path.join(meeseeksDir, RED_EVIDENCE);
  const empty = { seenFailing: new Set(), baseline: new Set(), definitions: {}, established: false };
  if (!existsSync(file)) return empty;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    /** @param {unknown} value */
    const ids = (value) =>
      new Set((Array.isArray(value) ? value : []).filter((id) => typeof id === 'string').map(String));
    /** @param {unknown} value @returns {Record<string, string>} */
    const digests = (value) => {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
      /** @type {Record<string, string>} */
      const map = {};
      for (const [file, digest] of Object.entries(/** @type {Record<string, unknown>} */ (value))) {
        if (typeof digest === 'string' && digest !== '') map[file] = digest;
      }
      return map;
    };
    return {
      seenFailing: ids(parsed.seenFailing),
      baseline: ids(parsed.baseline),
      // **Which bytes each piece of evidence was observed under** (REVIEW F17). A store written
      // before this field existed has none, and `changedDefinitions` reads an absent digest as
      // changed — so old evidence stops vouching for anything until it is observed again. That is
      // the correct direction: nobody can say which definition it was recorded against.
      definitions: digests(parsed.definitions),
      // A file that exists at all means the baseline moment has passed, even if the array is
      // empty — a project whose first gating found zero tests still had its first gating.
      established: true,
    };
  } catch {
    // Unreadable evidence is no evidence. Every new test is then unproven, which fails
    // the gate loudly rather than quietly crediting tests that were never red. The corrupt
    // bytes are quarantined first, so they survive the next recordRedEvidence overwrite (R26).
    quarantineCorruptFile(file, quarantine);
    return empty;
  }
}

/**
 * @param {string} meeseeksDir
 * @param {Iterable<string>} nonPassing
 * @param {Iterable<string>} [passing] recorded as the baseline on the first gating only
 * @param {string | null} [rootDir] the candidate tree, for stamping the digest each observation was
 *   made under (REVIEW F17). Omitted only by callers that have no tree to hash, and then the
 *   evidence records no digest — which later reads as unproven rather than as proven.
 * @returns {{ seenFailing: Set<string>, baseline: Set<string>, definitions: Record<string, string>,
 *   established: boolean }}
 */
export function recordRedEvidence(meeseeksDir, nonPassing, passing = [], rootDir = null) {
  const evidence = loadRedEvidence(meeseeksDir);
  for (const id of nonPassing) evidence.seenFailing.add(id);

  // The baseline is written exactly once, the first time this project is gated at all, and it
  // is the escape from an unsatisfiable objective rather than a convenience. See
  // `redEvidenceGate` for why it has to exist and what still guards the ids it admits.
  const baseline = evidence.established ? evidence.baseline : new Set(passing);

  // **Evidence is stamped with the bytes it was observed under** (REVIEW F17). Without this, an id
  // seen failing once kept its exemption from red evidence forever — including after its defining
  // file was rewritten — so a test could be replaced with a weaker one and inherit the credit its
  // predecessor earned. `previousPassing` was scoped to the definition already; `redSeen` and
  // `baseline` were not, and they are the two broader exemptions.
  //
  // Recorded per *file*, matching the ratchet's own `definitions` map, because a defining file is
  // what `changedDefinitions` can compare and an id is not.
  //
  // **Only what was observed in *this* call is stamped**, and getting that wrong would have undone
  // the whole repair: stamping the accumulated `seenFailing` set would refresh the digest of an id
  // observed ten iterations ago whose file has been rewritten since, restoring its exemption with no
  // new observation behind it. The baseline is included exactly once, at establishment, because
  // those ids are being admitted on the strength of the bytes present at the first gating.
  const definitions = { ...evidence.definitions };
  if (rootDir !== null) {
    const observedNow = new Set(nonPassing);
    if (!evidence.established) for (const id of baseline) observedNow.add(id);
    for (const id of observedNow) {
      const file = testFilePath(id);
      if (file === '') continue;
      const digest = definitionDigest(rootDir, file);
      if (digest !== null) definitions[file] = digest;
    }
  }

  mkdirSync(meeseeksDir, { recursive: true });
  // Atomic, the way the ratchet/pins/lessons writers already are (R34). red-evidence is
  // decision-bearing and persists cross-run; a kill mid-write must never leave a half-file, because
  // on misparse the baseline can re-establish and admit tests never seen failing — the fail-open
  // direction, against "nothing defaults to pass".
  const file = path.join(meeseeksDir, RED_EVIDENCE);
  const temporary = `${file}.tmp`;
  writeFileSync(
    temporary,
    `${JSON.stringify(
      { seenFailing: [...evidence.seenFailing].sort(), baseline: [...baseline].sort(), definitions },
      null,
      2,
    )}\n`,
    'utf8',
  );
  renameSync(temporary, file);
  return { seenFailing: evidence.seenFailing, baseline, definitions, established: true };
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
 * `.meeseeks/red-evidence.json`, written exactly once, and admitted. Every id added afterwards
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
 *   baseline?: Iterable<string>, changedDefinitions?: Iterable<string>,
 *   staleEvidence?: Iterable<string> }} options
 * @returns {GateResult}
 */
export function redEvidenceGate(options) {
  const red = new Set(options.redSeen);
  const baseline = new Set(options.baseline ?? []);
  // The same exemption rule as `unprovenIds`, and it has to be the same one: this reports what that
  // withholds, and two answers to "is this proven" would eventually disagree (REVIEW F17).
  const changed = new Set(options.changedDefinitions ?? []);
  const before = new Set([...options.previousPassing].filter((id) => !changed.has(id)));
  // The same three-way scoping `unprovenIds` applies, and it has to be the same one: this reports
  // what that withholds, and two answers to "is this proven" would eventually disagree.
  const stale = new Set(options.staleEvidence ?? []);
  const proven = new Set([...red].filter((id) => !stale.has(id)));
  const admitted = new Set([...baseline].filter((id) => !stale.has(id)));
  const unproven = [...new Set(options.passing)]
    .filter((id) => !before.has(id) && !proven.has(id) && !admitted.has(id))
    .sort();
  const rewritten = [...new Set(options.passing)].filter((id) => changed.has(id)).length;
  const baselined = [...new Set(options.passing)].filter((id) => admitted.has(id)).length;
  return {
    name: 'red-evidence',
    // Reports; does not fail. See this function's header for why blocking deadlocked the
    // ratchet, and `unprovenIds` for where the deterrent actually lives now.
    ok: true,
    status: 0,
    detail:
      unproven.length > 0
        ? `${unproven.length} test(s) never observed failing under their current definition, so earning no ` +
          `ratchet credit: ${unproven.join(', ')}` +
          (rewritten > 0
            ? `. ${rewritten} of the passing tests have a defining file that changed since it earned credit, so ` +
              'history no longer vouches for them (REVIEW F17); observe them failing to credit them again'
            : '')
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
 *   redSeen: Iterable<string>, baseline?: Iterable<string>,
 *   changedDefinitions?: Iterable<string>, staleEvidence?: Iterable<string> }} options
 *   `staleEvidence` are the ids whose red/baseline evidence was recorded under different bytes
 *   than the ones on disk, so that evidence no longer vouches for them (REVIEW F17).
 * @returns {Set<string>} the ids to withhold from the ratchet
 */
export function unprovenIds(options) {
  const red = new Set(options.redSeen);
  const baseline = new Set(options.baseline ?? []);
  // **History vouches for an id only while its definition is the one that earned the credit**
  // (REVIEW F17). A test identity is a path, a title chain and a project; the ratchet stored only
  // those, so replacing the assertions inside a test while keeping its name was indistinguishable
  // from the original test continuing to pass. `previousPassing` was therefore a permanent
  // exemption from red evidence, attached to a string rather than to any bytes.
  //
  // A changed definition simply stops being exempt. It is not removed from `passing` and it is not
  // a regression — that would rewrite the monotonic record to state something about the present,
  // which the finding refuses — it just has to be observed failing again before it earns current
  // credit. Which is also the path for legitimate strengthening, at the cost of one observation.
  const changed = new Set(options.changedDefinitions ?? []);
  const before = new Set([...options.previousPassing].filter((id) => !changed.has(id)));
  // **The other two exemptions are scoped the same way** (REVIEW F17, re-baselined at 0.208.0).
  // Only `previousPassing` was definition-scoped, so an id that had ever been seen failing — or that
  // was present at the first gating — kept its exemption after its defining file was rewritten. A
  // test could therefore be replaced with a weaker one and inherit the credit its predecessor
  // earned, which is the substitution the finding is about. `staleEvidence` names the ids whose
  // recorded observation digest is not the bytes on disk, and it defeats both.
  const stale = new Set(options.staleEvidence ?? []);
  const proven = new Set([...red].filter((id) => !stale.has(id)));
  const admitted = new Set([...baseline].filter((id) => !stale.has(id)));
  return new Set(
    [...new Set(options.passing)].filter((id) => !before.has(id) && !proven.has(id) && !admitted.has(id)),
  );
}

// ===========================================================================
// CLI
// ===========================================================================

/**
 * Read `--deadline=<minutes>` from argv.
 *
 * **Fails closed on anything that is not a number.** A mistyped ceiling that silently became "no
 * ceiling" is the shape of every defect this project keeps finding, so `--deadline=soon` throws
 * rather than defaulting. A bare `--deadline` with no value is the same mistake and gets the same
 * answer.
 *
 * @param {string[]} argv
 * @returns {number | null} minutes, or null when the flag was not given
 * @throws {DriverError} when the flag is present but not a non-negative finite number
 */
function parseDeadlineFlag(argv) {
  const given = argv.find((argument) => argument === '--deadline' || argument.startsWith('--deadline='));
  if (given === undefined) return null;
  const raw = given.startsWith('--deadline=') ? given.slice('--deadline='.length) : '';
  const minutes = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(minutes) || minutes < 0) {
    throw new DriverError(
      `--deadline needs a number of minutes, as --deadline=90; got ${JSON.stringify(raw)}. ` +
        'A ceiling that cannot be read is not a ceiling.',
    );
  }
  return minutes;
}

/**
 * @param {string[]} argv
 * @returns {{ input: string, yes: boolean, confirmPrd: boolean, improve: boolean, giveThemTheBox: boolean,
 *   deadlineMinutes: number | null }}
 */
export function parseDriverArgs(argv) {
  const flags = new Set(argv.filter((argument) => argument.startsWith('--')));
  const positional = argv.filter((argument) => !argument.startsWith('--'));
  // Reject an unknown flag by name rather than dropping it in silence. A mistyped flag —
  // `--deadlin=90`, `--give-the-box`, `--improv` — is the same fail-open shape as a NaN that
  // survives a numeric parse (R31): the ceiling or mode the operator asked for never arms, and
  // nothing says so. The configure wizard already refuses an unknown argv argument by name
  // (`configure.mjs` `main`); the driver did not, so the launch surface that then runs unattended
  // with permissions disabled was the more forgiving of the two. The value carried by `--deadline`
  // stays `parseDeadlineFlag`'s job; this only guards the *name*.
  const known = new Set(['--yes', '--confirm-prd', '--improve', '--give-them-the-box', '--deadline']);
  for (const flag of flags) {
    const name = flag.includes('=') ? flag.slice(0, flag.indexOf('=')) : flag;
    if (!known.has(name)) {
      throw new DriverError(
        `unknown flag: ${flag}. The accepted flags are --yes, --confirm-prd, --improve, ` +
          '--give-them-the-box, and --deadline=<minutes>.',
      );
    }
  }
  return {
    input: positional.join(' ').trim(),
    yes: flags.has('--yes'),
    confirmPrd: flags.has('--confirm-prd'),
    // Improve mode (§2.1). The other three input shapes are all product-shaped — a PRD to
    // build, an idea to specify, or nothing at all — and none of them can express "this
    // repository already exists, find what is wrong with it". In improve mode the positional
    // argument is not a PRD path and not an idea: it is an optional area to focus on.
    improve: flags.has('--improve'),
    // **Deliberately unsupported, and deliberately real.** It permits the one thing every other
    // part of this system refuses: a run inside a run. It exists because the canon's whole moral
    // is that a Meeseeks who cannot finish summons another — and a joke that only ever prints a
    // refusal is a joke nobody gets to see happen.
    //
    // **A flag and never config.** A flag is typed, once, by somebody watching the terminal.
    // Config is read quietly by a machine at three in the morning, and this must never be
    // something a run inherits without a human having said it out loud.
    giveThemTheBox: flags.has('--give-them-the-box'),
    // `--deadline=<minutes>`, the wall clock as a flag rather than a config key, for the same
    // reason `--give-them-the-box` is one: it is a choice about *this* session, made by somebody
    // watching, and thirty minutes is not always enough. `null` means "not given" and is
    // deliberately distinct from `0`, which means "explicitly no deadline" — an operator who
    // types zero has said something, and inheriting a default over it would be ignoring them.
    deadlineMinutes: parseDeadlineFlag(argv),
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
 * @typedef {{ file: string, digest: string, contents: string }} DeliveredSpecification
 */

/**
 * The canonical specification, delivered as bytes rather than as a path (REVIEW F12, reopened).
 *
 * **A cold role's authority may not live on a disk the thing it audits can write.** The Panel used
 * to be told "Read PRD.md". The Builder has unrestricted repository writes, so the before/after
 * digest check closed *persistent* replacement and left transient substitution wide open: replace
 * canonical A with an easier B, let the Panel read B, restore A before the next check. The Panel
 * certifies B; the outcome and the commit name A. Every existing case left the mutation present,
 * which is why they all passed against the hole.
 *
 * Handing over the bytes removes the race rather than narrowing it. There is no window, so there is
 * nothing to sample. The digest travels with them so a reader — human or model — can say which
 * revision it holds, and the delimiters exist because an unfenced document pasted into a prompt is
 * indistinguishable from instructions addressed to the reader.
 *
 * @param {DeliveredSpecification} revision
 * @returns {string}
 */
export function canonicalSpecificationBlock(revision) {
  return [
    `--- BEGIN ${revision.file} — canonical revision ${revision.digest} ---`,
    revision.contents,
    `--- END ${revision.file} ---`,
  ].join('\n');
}

/**
 * One panel member's brief: which ids it owns, and the specification it owns them against.
 *
 * Exported and pure for the reason `builderSystemPrompt` is: the prompt a cold role receives is
 * product code, and a value assembled inline inside a closure can only be tested by reaching it
 * through a whole run. `assumptions` is rendered by the caller because reading that store can fail
 * in a way this function has no business deciding about.
 *
 * @param {{ reviewer: string, panelSize: number, ids: string[],
 *   specification: DeliveredSpecification, assumptions?: string }} options
 * @returns {string}
 */
export function reviewerBrief(options) {
  const assumptions = options.assumptions ?? '';
  return [
    `You are the ${options.reviewer} auditor, one member of a panel of ${options.panelSize}.`,
    '',
    'You own the ids below and must return exactly one entry for each of them. The other',
    'auditors own the rest. Do not adjudicate theirs, and do not assume anyone will cover',
    'yours — an id you leave out invalidates this audit.',
    '',
    ...options.ids.map((id) => `- ${id}`),
    '',
    'The specification you are auditing against is reproduced in full below. It is the',
    'canonical revision this run was started against, captured before any code existed.',
    `Do not read ${options.specification.file} from the repository, and do not treat a copy`,
    'you find there as authoritative: the code you are auditing was written by something with',
    'write access to that file, so the copy on disk is evidence and this one is the contract.',
    '',
    canonicalSpecificationBlock(options.specification),
    '',
    'Read the documents under docs/ and the repository as evidence. Then return your report.',
    // Supplied, not sealed (§6.1). The log is driver-owned and the builder cannot write it; what it
    // buys the reviewer is the ability to check "you assumed X, the specification says Y", which is
    // a defect no amount of reading the code would surface.
    ...(assumptions === '' ? [] : ['', assumptions]),
  ].join('\n');
}

/**
 * The circuit-breaker's question, asked about the canonical specification.
 *
 * It returns no verdict, but it decides whether the loop keeps paying for iterations — and a
 * circuit-breaker asked "is *this* buildable" about a document the builder just rewrote is
 * answering a question nobody asked.
 *
 * @param {DeliveredSpecification} revision
 * @returns {string}
 */
export function realityCheckPrompt(revision) {
  return [
    'The specification is reproduced in full below. It is the canonical revision this run was',
    `started against; do not read ${revision.file} from the repository.`,
    '',
    canonicalSpecificationBlock(revision),
    '',
    'Read the repository. Answer one question: is this specification buildable with the code present, or is',
    'the loop chasing an impossible spec? Begin your answer with the single word buildable or unbuildable,',
    'then give your reasons.',
  ].join('\n');
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
    const gate = gateSummary(cwd, path.join(cwd, '.meeseeks')).gates.find((g) => g.name === name);
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
 * @returns {Promise<Record<string, string>>}
 */
export async function toolVersions(run, cwd) {
  /** @type {Record<string, string>} */
  const versions = {};
  for (const probe of VERSION_PROBES) {
    const result = await run(probe.argv[0], probe.argv.slice(1), { cwd });
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
 * @typedef {{
 *   ok: boolean, status: number, stdout: string, stderr: string,
 *   timedOut?: boolean, overflowed?: boolean, reaped?: number[], denials?: string[]
 * }} ShellResult
 *   `denials` is the guard's refusals, carried on **every** exit status (REVIEW F36). It exists
 *   because `stderr` is discarded on success and a denied tool call does not fail a child, so the
 *   one diagnostic the loop can act on travelled only on the path where it was least needed.
 *   `timedOut` and `overflowed` are **distinct kinds**, not two ways of saying failure
 *   (REVIEW F7). The cap had no field of its own, so a caller could not tell a child that was
 *   killed for flooding from one that merely exited badly — and valid JSON emitted before the
 *   cap fired survives inside the truncated stdout, which is precisely the shape that used to
 *   be reinterpreted as a successful role result.
 */





/**
 * Signal the process group this call owns, falling back to the child alone where groups do not exist.
 *
 * **Ownership is the whole point** (REVIEW F33, reopened). The previous mechanism reconstructed it:
 * snapshot the process group before spawning, subtract concurrent siblings' live subtrees
 * afterwards, kill whatever is left. It failed exactly where it mattered — a sibling's grandchild
 * that outlived its own leader was reparented, belonged to no live subtree, was not in the
 * pre-image, and so read as this call's leak. One reviewer timing out reaped another reviewer's
 * work, hundreds of milliseconds into a five-second job.
 *
 * A group cannot be lost that way. The child is spawned `detached`, so its pgid is its own pid and
 * every descendant inherits it; killing `-pgid` reaches exactly the processes this invocation
 * started and no others, whether or not the leader is still alive to be asked about them.
 *
 * @param {import('node:child_process').ChildProcess} child
 * @param {NodeJS.Signals} signal
 * @returns {void}
 */
function signalOwnedGroup(child, signal) {
  const pid = child.pid;
  if (typeof pid !== 'number') return;
  if (process.platform !== 'win32') {
    try {
      process.kill(-pid, signal);
      return;
    } catch {
      // No such group: the leader is gone and took the group with it, or this platform refused.
      // Fall through to the direct child, which is the most that can be done either way.
    }
  }
  try {
    child.kill(signal);
  } catch {
    // Already gone between the decision and the signal; 'exit' has fired or is about to.
  }
}

/**
 * Who is in the group this call owns, sampled only when it is about to be killed.
 *
 * Reported rather than inferred, and **only on the termination path** — the pre-image this used to
 * take before every spawn cost a `ps` on each of the hundreds of short Git calls a run makes, to
 * describe a sweep that almost never happened.
 *
 * @param {import('node:child_process').ChildProcess} child
 * @returns {number[]}
 */
function ownedGroupMembers(child) {
  const pid = child.pid;
  if (typeof pid !== 'number' || process.platform === 'win32') return [];
  try {
    const out = execFileSync('ps', ['-eo', 'pid=,pgid='], {
      stdio: 'pipe',
      encoding: 'utf8',
      timeout: 10_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    /** @type {number[]} */
    const members = [];
    for (const line of out.split('\n')) {
      const [member, group] = line.trim().split(/\s+/).map(Number);
      if (Number.isInteger(member) && group === pid && member !== pid) members.push(member);
    }
    return members;
  } catch {
    // `ps` is unavailable or refused. The kill below still reaches the group; only the report of
    // what it reached is missing, and an empty list says exactly that.
    return [];
  }
}

/**
 * How many guard denials a shell result carries, and how long each may be.
 *
 * Bounded because this text reaches a builder's brief. A child that hits the same refusal in a loop
 * would otherwise hand the next iteration a wall of identical lines instead of a repair objective.
 */
export const DENIAL_LIMIT = 20;
/** @see DENIAL_LIMIT */
export const DENIAL_LINE_LIMIT = 400;

/** What the guard hook writes when it refuses a tool call. */
const DENIAL_PREFIX = 'meeseeks-guard: denied';

/**
 * The guard refusals in a stream, as their own bounded channel (REVIEW F36).
 *
 * **Why a channel rather than the stderr it came from.** `shell` discards stderr on success, which
 * is deliberate — a successful command's diagnostics are not evidence, and a consumer that learned
 * to read them would be reading whatever a tool happened to warn about. But a denied tool call
 * *does not fail a child*: the model is told no and carries on, so the one message the loop needs is
 * on the one stream it throws away. `spawnClaude` used to search `result.stderr` for it, which
 * worked only for children that also failed — and a child that recovers is the ordinary case.
 *
 * Extracting here keeps both properties: the denial survives every exit status, and ordinary stderr
 * still never becomes output or evidence. Deduplicated, because the same refusal repeated forty
 * times is one fact.
 *
 * @param {string} stream
 * @returns {string[]} at most `DENIAL_LIMIT` lines, each at most `DENIAL_LINE_LIMIT` characters
 */
export function guardDenials(stream) {
  /** @type {string[]} */
  const found = [];
  for (const line of stream.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(DENIAL_PREFIX)) continue;
    const bounded = trimmed.slice(0, DENIAL_LINE_LIMIT);
    if (found.includes(bounded)) continue;
    found.push(bounded);
    if (found.length === DENIAL_LIMIT) break;
  }
  return found;
}

/** The output cap `execFileSync` enforced, kept at the same 64MB now the collection is manual. */
const MAX_SHELL_BUFFER = 64 * 1024 * 1024;

/**
 * How long a child has to exit after `SIGTERM` before it is killed outright (REVIEW F2).
 *
 * **The defect this bounds was measured.** A child that trapped `SIGTERM` and exited of its own
 * accord one second later was run with `timeoutMs: 100`; `shell` reported a timeout and returned
 * after **1,018 ms**. A child that never exits would have defeated the watchdog forever, because
 * every path out of the ceiling and out of the 64MB cap waited on a cooperative `exit` that a
 * resistant child simply does not send. The log promised the operator a kill after a stated time
 * and the promise was not one the code could keep.
 *
 * Five seconds, and the number is a judgement rather than a measurement: long enough for a real
 * gate to flush its reporters and go, short enough that the *documented* bound stays close to the
 * ceiling the operator actually configured. It is a constant rather than a config key because it
 * is not a policy anyone should be tuning per target — a target that needs longer than this to
 * die after being asked is the problem the escalation exists for.
 */
export const TERMINATION_GRACE_MS = 5_000;

/**
 * The ceiling on one local Git operation (REVIEW F44).
 *
 * **Git is not a short local syscall just because it usually is.** It runs repository-configured
 * clean and smudge filters, `fsmonitor` hooks, commit and tag signing with its pinentry, credential
 * helpers — and the Builder has unrestricted Bash and can add `.gitattributes` or repository-local
 * configuration before the Driver's final commit. Codex's reproduction assigned `payload.txt` a
 * clean filter of `sleep 30`; a `git add -A` then ran past every ceiling the product has, because
 * Driver-owned Git calls carried none. Nothing else could fire: no timer, no forced kill, no
 * descendant cleanup, no terminal receipt, no lock release, while the helper stayed alive.
 *
 * Two minutes is a ceiling on a hang and not a budget. A `git add` over a very large tree can take
 * seconds; nothing legitimate here takes minutes, and a run that reached this bound has met a helper
 * that is not coming back.
 */
export const GIT_OPERATION_TIMEOUT_MS = 120_000;

/**
 * Configuration forced on every Driver-owned Git call.
 *
 * Unattended means nothing may wait for a person. Signing is disabled for Driver-owned commits and
 * tags — an operator who wants signed Meeseeks commits needs a bounded non-interactive policy, and
 * F44 says so explicitly rather than leaving a pinentry able to hold a run open forever. The
 * terminal prompt and the askpass helpers are refused for the same reason: a credential prompt with
 * nobody at the keyboard is a hang wearing a question.
 */
export const GIT_NON_INTERACTIVE_ARGS = ['-c', 'commit.gpgSign=false', '-c', 'tag.gpgSign=false'];

/** @type {Record<string, string>} */
export const GIT_NON_INTERACTIVE_ENV = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_ASKPASS: '',
  SSH_ASKPASS: '',
  GIT_PAGER: 'cat',
};


/**
 * Really shell out. Exported for tier 2 only.
 *
 * Every unit test drives the gate runners through an injected double, which is what makes the
 * loop's decisions testable without spending anything — and is exactly why no unit test can
 * see this function's behaviour. The orphan sweep is a claim about what the operating system
 * does to processes after the ceiling gives up on a command, so it can only be checked against
 * real ones. `§11.1`'s argument, again: an assertion about the array you build says nothing
 * about what the callee does with it.
 *
 * Asynchronous since R21 step 1: `spawn` collected into the same `ShellResult` that
 * `execFileSync` used to produce, so a caller awaits the shape it always read. The sync
 * semantics are preserved deliberately, because tier 2 asserts them:
 *
 *   - Completion is exit **and** both pipes reaching EOF. A grandchild that inherited the
 *     write end keeps the wait alive exactly as it kept the synchronous read alive — that is
 *     the mechanism the orphan sweep exists for, and it must not quietly change shape.
 *   - The ceiling bounds that whole wait. When it fires, the direct child gets `SIGTERM`
 *     (the same signal `execFileSync` sent), the group is swept by subtraction, and whatever
 *     output was collected is returned under `timedOut: true`.
 *   - Output is still capped at 64MB per stream; past the cap the child is killed and the
 *     call fails, exactly as `maxBuffer` failed it.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd: string, env?: Record<string, string | undefined>, input?: string, timeoutMs?: number }} options
 * @returns {Promise<ShellResult>}
 */
export function shell(command, args, options) {
  // Sampled before the spawn, which is the half of the subtraction that must precede the command:
  // afterwards there is no way to tell this command's survivors from processes that started
  // meanwhile, which is why it cannot be taken lazily when a sweep turns out to be needed.
  //
  // **Unconditional as of the 0.208.0 candidate** (REVIEW F2). It used to be taken only when a `timeoutMs` was
  // supplied, on the reasoning that a command with no ceiling cannot time out — but the 64MB output
  // cap sweeps through the same pre-image, and with none sampled `sweepLeakedGroup` returns `[]` and
  // every descendant of a flooding child survives. The cost that justified the condition was
  // measured on 18 August 2026 rather than assumed: `ps -eo pid=,pgid=,comm=` is **4.3ms**, about
  // two `git rev-parse` calls, against a run whose iterations are minutes long. Correctness on the
  // overflow path is worth four milliseconds.
  return new Promise((resolve) => {
    /** @type {import('node:child_process').ChildProcess} */
    let child;
    /** What the group kill reached, if one happened. Filled immediately before the kill. */
    /** @type {number[]} */
    let reapedGroup = [];
    try {
      child = spawnProcess(command, args, {
        cwd: options.cwd,
        // Defaults to this process's environment, so gates and git calls are unaffected.
        env: options.env ?? process.env,
        stdio: 'pipe',
        // **Ownership as a kernel fact rather than an inference** (REVIEW F33, reopened). `detached`
        // makes this child a process-group leader, so every descendant it spawns inherits that
        // group and termination can name the group instead of guessing which stray pids belonged to
        // whom. The guessing is what failed: ownership was reconstructed from a pre-spawn snapshot
        // minus the live subtrees of concurrent siblings, and a sibling's grandchild that outlived
        // its own leader — reparented, still holding a pipe — belonged to no live subtree and looked
        // exactly like this call's leak. One reviewer timing out then killed another reviewer's
        // work. A group cannot be lost that way: the grandchild keeps the pgid its leader had.
        //
        // Not on Windows, where there are no POSIX process groups and `process.kill(-pid)` is
        // unsupported; that platform keeps the direct-child kill it already had, and F11 owns the
        // gap.
        detached: process.platform !== 'win32',
      });
    } catch (error) {
      // A spawn that throws synchronously never started anything: nothing to sweep, nothing
      // collected. The sync version reported this as a plain failure and so does this.
      resolve({ ok: false, status: 1, stdout: '', stderr: /** @type {Error} */ (error).message, timedOut: false });
      return;
    }

    /** @type {Buffer[]} */
    const outChunks = [];
    /** @type {Buffer[]} */
    const errChunks = [];
    let outBytes = 0;
    let errBytes = 0;
    let timedOut = false;
    let overflowed = false;
    let exited = false;
    let settled = false;
    // Whether a bounded termination is already in flight. **The first one to start owns the
    // verdict**, which is the rule that survived adding a grace period: before it, the cap could
    // only fire before the ceiling, so `exit` checking overflow first was enough. Now that both
    // paths wait, either could reach the other's window, and `timedOut` is the discriminator
    // `runDeploy`'s operator messaging keys on — it must not change meaning in a race nobody can
    // see.
    let terminating = false;
    /** @type {NodeJS.Timeout | undefined} */
    let timer;
    /** @type {NodeJS.Timeout | undefined} */
    let graceTimer;

    const text = (/** @type {Buffer[]} */ chunks) => Buffer.concat(chunks).toString('utf8');

    /** @param {ShellResult} result */
    const settle = (result) => {
      if (settled) return;
      settled = true;
      // Deregistered before the sweep runs, not after: the sweep is an argument to `settle`, and a
      if (timer !== undefined) clearTimeout(timer);
      if (graceTimer !== undefined) clearTimeout(graceTimer);
      // Close this side of the pipes. On the timed-out path a leaked descendant may still hold
      // the write end, and the sync teardown dropped its read end exactly like this.
      child.stdout?.destroy();
      child.stderr?.destroy();
      child.stdin?.destroy();
      resolve(result);
    };

    const finishTimedOut = () => {
      // **Guarded before the sweep, not inside `settle`.** The sweep is an argument to `settle`,
      // so it runs before `settle` can decline a second call — and after a forced kill there is
      // always a second call, because the child's `exit` event arrives once the promise has
      // already resolved and the *next* command has been spawned. Measured: with the escalation
      // added and this guard missing, every other `shell` call in a process returned in 14ms with
      // its child killed before it could run, because a stale `before` snapshot made that
      // perfectly innocent child look like a survivor of the previous timeout.
      if (settled) return;
      settle({
        ok: false,
        // A killed child reports no exit code, so without the flag a timeout arrives as a
        // plain `exit 1` and reads as a command that ran and failed. Those need opposite
        // responses from an operator and must not be collapsed into one message.
        status: 1,
        stdout: text(outChunks),
        stderr: text(errChunks),
        // Set only by the ceiling firing, and nothing else — a command that kills *itself*
        // with SIGTERM must not be read as a timeout, which is why the exit signal is never
        // consulted for this flag.
        timedOut: true,
        // What the group kill reached, sampled just before it (REVIEW F33). Empty means the group
        // held nothing but the leader, which is the ordinary shape; the killing itself is not
        // conditional on being able to name the members.
        reaped: reapedGroup,
      });
    };

    const finishOverflowed = () => {
      // Same guard, same reason: this one sweeps too now.
      if (settled) return;
      settle({
        ok: false,
        status: 1,
        stdout: text(outChunks),
        stderr: text(errChunks),
        timedOut: false,
        // Its own kind, so no caller has to infer the cap from the absence of a timeout.
        overflowed: true,
        // Swept for the same reason the timeout path is: a gate that backgrounded a dev server
        // and then flooded a stream leaks exactly the same descendants, and the cap is no more
        // able to reap them than the ceiling was. Reported for the same reason and from the same
        // group kill; F11 owns the platform where groups do not exist.
        reaped: reapedGroup,
      });
    };

    /**
     * Ask the child to stop, give it a bounded moment, then insist — and settle either way.
     *
     * **The bug this replaces was that there was no `then`** (REVIEW F2). Both the ceiling and
     * the output cap sent `SIGTERM` and waited for a cooperative `exit` that a child which traps
     * or ignores the signal never sends, so an unattended run could stall forever underneath a
     * log line promising it had been killed. The escalation is `SIGKILL`, which cannot be caught,
     * and the settlement does not wait for the child's permission.
     *
     * The descendants go with it. `finish` sweeps the process group by subtraction, which is how
     * this file has always reached a backgrounded grandchild, and `SIGKILL` on the direct child
     * covers the platform where that sweep cannot run at all.
     *
     * @param {() => void} finish the verdict this termination belongs to
     */
    /**
     * Kill the group when the leader is already gone.
     *
     * The graceful half of `insist` is addressed to a process that no longer exists; what is left is
     * the group its descendants are still in. Before the group existed this path relied on the
     * subtraction sweep, which is why removing that sweep without this left an orphaned gate
     * grandchild alive — caught by the gate-orphan tier-2 fixture, which is exactly the shape it was
     * written for.
     */
    const reapOwnedGroup = () => {
      if (terminating) return;
      terminating = true;
      reapedGroup = ownedGroupMembers(child);
      signalOwnedGroup(child, 'SIGKILL');
    };

    /**
     * Ask the group to stop, give it a bounded moment, then insist — and settle either way.
     *
     * @param {() => void} finish the verdict this termination belongs to
     */
    const insist = (finish) => {
      if (terminating) return;
      terminating = true;
      // Sampled **before the first signal**, which is the only moment the group is both doomed and
      // still nameable. Sampling after the grace reported an empty list for the ordinary case: a
      // descendant that does not trap `SIGTERM` dies on the group's first signal, so by kill time
      // there was nothing left to name and the operator saw "nothing was reaped" about a group that
      // had just been reaped.
      reapedGroup = ownedGroupMembers(child);
      signalOwnedGroup(child, 'SIGTERM');
      graceTimer = setTimeout(() => {
        // The whole group again, so a helper that ignored the first signal cannot outlive the
        // ceiling that bounded its parent.
        signalOwnedGroup(child, 'SIGKILL');
        finish();
      }, TERMINATION_GRACE_MS);
    };

    /**
     * Collect one stream under the cap; past it, kill the child as `maxBuffer` did.
     *
     * @param {NodeJS.ReadableStream | null} stream
     * @param {Buffer[]} chunks
     * @param {(bytes: number) => number} grow returns the new total for the stream
     */
    const collect = (stream, chunks, grow) => {
      stream?.on('data', (/** @type {Buffer} */ chunk) => {
        // `terminating` as well as `overflowed`: output arriving during a ceiling's grace period
        // must not flip the verdict to overflow after the timeout already claimed it.
        if (settled || overflowed || terminating) return;
        const total = grow(chunk.length);
        if (total <= MAX_SHELL_BUFFER) {
          chunks.push(chunk);
          return;
        }
        chunks.push(chunk.subarray(0, chunk.length - (total - MAX_SHELL_BUFFER)));
        overflowed = true;
        if (exited) {
          reapOwnedGroup();
          finishOverflowed();
          return;
        }
        insist(finishOverflowed);
      });
    };
    collect(child.stdout, outChunks, (bytes) => (outBytes += bytes));
    collect(child.stderr, errChunks, (bytes) => (errBytes += bytes));

    // Writing to a child that exits without reading raises EPIPE here; the sync call swallowed
    // that, and a command's refusal to read its stdin is not a result about the command.
    child.stdin?.on('error', () => {});
    // Only the Claude children send anything; gates and git calls pass no input and see EOF at
    // once, which is what the piped-but-unwritten stdin always gave them.
    if (options.input === undefined) child.stdin?.end();
    else child.stdin?.end(options.input);

    child.on('error', (error) => {
      // The command could not be spawned at all — ENOENT, mostly. Same shape the sync call
      // produced: empty stdout, the error message where stderr would be.
      settle({ ok: false, status: 1, stdout: '', stderr: error.message, timedOut: false });
    });

    child.on('exit', () => {
      exited = true;
      // The ceiling or the cap already decided this call's outcome; the exit is what they
      // were waiting on. The ordinary path keeps waiting for 'close' below, because a command
      // is not done being read until both pipes reach EOF.
      //
      // Overflow is checked FIRST, because whichever fired first owns the verdict, and `insist`
      // now guarantees that ordering rather than leaving it to timing: a ceiling that fires
      // inside the cap's grace window cannot start a second termination, and output arriving
      // inside the ceiling's grace window cannot flip `overflowed`. So reaching here with
      // `overflowed` true means the cap claimed it. The sync `execFileSync` reported that
      // doubly-degenerate overlap as a buffer failure, and `timedOut` is the discriminator
      // `runDeploy`'s operator messaging keys on — it must not change meaning in a race the
      // operator cannot see.
      if (overflowed) finishOverflowed();
      else if (timedOut) finishTimedOut();
    });

    child.on('close', (code) => {
      if (timedOut || overflowed) return;
      if (typeof code === 'number' && code === 0) {
        // stderr is discarded on success, which is what the sync call returned. A consumer
        // that needs a successful command's stderr must not learn to expect it here while the
        // injected doubles are the only place it can appear.
        //
        // **Except the guard's refusals, which travel on their own channel** (REVIEW F36). A denied
        // tool call does not fail a child — the model is told no and carries on — so discarding
        // stderr here discarded the only repairable explanation the loop had, on the exit status
        // where it happens most.
        const denied = guardDenials(text(errChunks));
        settle({
          ok: true,
          status: 0,
          stdout: text(outChunks),
          stderr: '',
          timedOut: false,
          ...(denied.length > 0 ? { denials: denied } : {}),
        });
        return;
      }
      settle({
        ok: false,
        // A child killed by a signal reports no exit code and lands on 1, exactly as the
        // sync call's `status: null` did.
        status: typeof code === 'number' ? code : 1,
        stdout: text(outChunks),
        stderr: text(errChunks),
        timedOut: false,
        // Also on the failing path, so `spawnClaude` reads one field rather than two sources that
        // can disagree (REVIEW F36).
        ...(guardDenials(text(errChunks)).length > 0 ? { denials: guardDenials(text(errChunks)) } : {}),
      });
    });

    if (options.timeoutMs !== undefined) {
      // Absent by default, so every caller that supplies no ceiling keeps the unbounded wait
      // it has always had.
      timer = setTimeout(() => {
        timedOut = true;
        // **The leader may already be gone, and the group is why that no longer matters** — a gate
        // whose own process exits at once while a backgrounded grandchild holds the pipe is the
        // measured shape. There is nobody left to ask for a graceful stop, so this goes straight to
        // the group kill rather than paying a grace period on behalf of a dead process.
        if (exited) {
          reapOwnedGroup();
          finishTimedOut();
          return;
        }
        insist(finishTimedOut);
      }, options.timeoutMs);
    }
  });
}

/**
 * Every Driver-owned Git call, bounded and non-interactive (REVIEW F44).
 *
 * One door, for the reason the context budget lives inside `spawnClaude`: twenty call sites each
 * remembering to pass a ceiling is twenty chances to forget, and the one that forgets is the one a
 * hostile `.gitattributes` finds. The ceiling and the non-interactive configuration are applied
 * here, so a Git call added later inherits both.
 *
 * A timeout is reported as a timeout. `shell` already distinguishes it from an ordinary nonzero
 * exit, and callers key their diagnosis on that: "git add failed: exit 1" and "a clean filter never
 * returned" send an operator to different places.
 *
 * @param {string[]} args
 * @param {{ cwd: string, timeoutMs?: number }} options `timeoutMs` exists so a test can prove the
 *   bound in seconds rather than waiting out the production ceiling; no caller in the loop passes
 *   it, and the default is asserted separately so shortening it here could not go unnoticed.
 * @returns {Promise<ShellResult>}
 */
export function git(args, options) {
  return shell('git', [...GIT_NON_INTERACTIVE_ARGS, ...args], {
    cwd: options.cwd,
    env: { ...process.env, ...GIT_NON_INTERACTIVE_ENV },
    timeoutMs: options.timeoutMs ?? GIT_OPERATION_TIMEOUT_MS,
  });
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
 * @param {{ cwd: string, log?: (line: string) => void, shell?: (command: string, args: string[], options: { cwd: string, timeoutMs?: number }) => ShellResult | Promise<ShellResult> }} options
 * @returns {Promise<{ ok: boolean, detail: string }>}
 */
export async function runDeploy(deploy, options) {
  if (!deploy.enabled) return { ok: true, detail: 'no deploy configured' };
  const log = options.log ?? (() => {});
  const run = options.shell ?? shell;
  const [command, ...args] = deploy.command;
  log(`deploying: ${command} ${args.join(' ')}`);
  const deployed = await run(command, args, { cwd: options.cwd, timeoutMs: deploy.timeoutMs });
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
  const smoked = await run('node', [HEALTH_PROBE, ...probeArgs], { cwd: options.cwd });
  // Exit code, like every other check here. A non-zero probe is a failure whatever it
  // printed, and an empty stdout still fails rather than defaulting to pass.
  if (!smoked.ok) return { ok: false, detail: smoked.stdout.trim() || 'the smoke check failed and said nothing' };
  return { ok: true, detail: smoked.stdout.trim() || 'smoke checks passed' };
}

/**
 * Is this a security id, whatever the panel happens to be configured as?
 *
 * Derived from `DEFAULT_OWNERSHIP.security` rather than from the *live* `ownership` map, and that
 * is the whole correction. Which reviewer reads an id is an operator's choice; whether the id is
 * about security is a property of the id. Keying the first to the second let a reconfigured panel
 * turn A4 off silently.
 *
 * Uses the same `*` wildcard the ownership matcher uses, so the two cannot disagree about what a
 * pattern means.
 *
 * @param {string} id
 * @returns {boolean}
 */
export function isSecurityId(id) {
  return DEFAULT_OWNERSHIP.security.some((/** @type {string} */ pattern) => {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').split('\\*').join('.*');
    return new RegExp(`^${escaped}$`).test(id);
  });
}

/**
 * How a quality-plugin gate's arming condition reads in a brief.
 *
 * Empty for a gate that always applies. A gate that is armed by something — a frontend, a
 * capability — says so, because the alternative is a builder reading "every iteration must
 * pass" over a command that will never run against this project.
 *
 * @param {{ capability?: string }} gate
 * @returns {string}
 */
export function armingNote(gate) {
  if (gate.capability !== undefined) return ` (armed only for a ${gate.capability} project)`;
  return '';
}

/**
 * The gates layered over the toolchain's own: provisioned quality plugins, then the operator's.
 *
 * **One origin for two projections, and that is the entire point of the function.** A gate is
 * written down twice in a run — once in the brief that tells the builder what it must pass, and
 * once in the roster that executes — and until 0.107.0 those were assembled independently, by
 * hand, from the same raw inputs. Both directions of divergence have now been observed:
 *
 *   - **described and not run** (0.99.0): a CLI's brief demanded `schemathesis` against an
 *     OpenAPI document, eleven lines above its own statement that the project is not an API. The
 *     gate was correctly filtered at execution, so nothing failed and nothing said anything; the
 *     builder was simply told to gold-plate.
 *   - **run and not described** (caught during 0.107.0, before it shipped): an operator gate
 *     wired only into the executing list would fail an iteration on a rule the brief never
 *     mentioned, arriving as a bare non-zero exit from an unfamiliar command.
 *
 * The second is worse and both come from the same seam. Returning `text` and `command` together
 * makes them structurally incapable of disagreeing about *what a gate is*; the callers still
 * differ about *which gates apply*, which is deliberate. Execution filters on arming conditions,
 * the brief keeps every gate and annotates it — capabilities are re-detected each iteration
 * (§3.7), so a list that silently dropped a not-yet-armed gate would read as one that never had
 * it.
 *
 * Operator gates carry no arming condition. An operator who declared a gate is the arming
 * condition, and there is nothing to detect.
 *
 * @param {{ plugin: string, command: string[], capability?: string, interpret?: 'design-slop' | 'gitleaks' }[]} qualityGates
 * @param {{ name: string, command: string[] }[]} extraGates
 * @returns {{ name: string, command: string[], text: string, capability?: string, interpret?: 'design-slop' | 'gitleaks' }[]}
 */
export function overlayGates(qualityGates, extraGates) {
  return [
    ...qualityGates.map((gate) => ({
      name: `quality:${gate.plugin}`,
      command: gate.command,
      text: `quality:${gate.plugin}: ${gate.command.join(' ')}${armingNote(gate)}`,
      ...(gate.capability === undefined ? {} : { capability: gate.capability }),
      ...(gate.interpret === undefined ? {} : { interpret: gate.interpret }),
    })),
    ...extraGates.map((gate) => ({
      name: `operator:${gate.name}`,
      command: gate.command,
      text: `operator:${gate.name}: ${gate.command.join(' ')}`,
    })),
  ];
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
 * @param {string} meeseeksDir the driver's own directory in that tree
 * @param {string} startCommit the commit this run began at
 * @param {number} timeoutMs the gate ceiling, so a slow mutation run is a named failure
 * @returns {Promise<{ ok: boolean, detail: string }>}
 */
export async function shipTimeMutation(cwd, meeseeksDir, startCommit, timeoutMs) {
  if (startCommit === '') {
    return { ok: false, detail: 'no start commit was recorded for this run, so its own changes cannot be identified' };
  }
  const changedFiles = await changedSince({ cwd, since: startCommit, run: shell });
  const scope = shipTimeMutationScope({ changedFiles });
  if (!scope.can) return { ok: false, detail: scope.reason };

  writeMutationConfig(meeseeksDir);
  const built = conditionalCommandGates(cwd, meeseeksDir, changedFiles);
  const gate = built.gates.find((candidate) => candidate.name === 'mutation');
  if (gate === undefined) {
    // The toolchain declined — `dotnet` declines mutation rather than guessing Stryker.NET's
    // command line — or every changed file was test-like. Either way nothing was measured.
    const declined = built.skipped.find((candidate) => candidate.name === 'mutation');
    return { ok: false, detail: `the mutation gate could not run at ship time: ${declined?.reason ?? 'no reason given'}` };
  }
  const outcome = await runGates([gate], { cwd, run: shell, timeoutMs });
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
 *   maxBudgetUsd?: number, maxTurns?: number, sandbox?: boolean, envAllow?: string[],
 *   supply?: { class: import('./role-supply.mjs').InputClass, text: string }[],
 *   specification?: string | null,
 *   run?: (command: string, args: string[],
 *     options: { cwd: string, env?: Record<string, string | undefined>, input?: string, timeoutMs?: number }) =>
 *     ShellResult | Promise<ShellResult> }} options
 * @returns {Promise<ClaudeResult>}
 */
export async function spawnClaude(options) {
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

  // **The supply boundary, checked at the same one door and for the same reason** (BORROWED R44,
  // PLAN item 77). Panel and Oracle independence rests on `not supplied`: the Driver does not place
  // Builder history, workflow synthesis, or held-out cases into a cold role's context. That is a
  // discipline about what this function is handed, and a discipline with no record is one a
  // refactor breaks while every template-string test stays green.
  //
  // A caller that declares its input classes gets them checked before the child is spawned and a
  // sanitized manifest back. A caller that declares nothing is not silently trusted — there is
  // simply nothing to check, which is why `supply` is threaded from the cold roles first and why
  // `roleSupplyManifest` refuses an unclassified class outright.
  /** @type {ReturnType<typeof roleSupplyManifest> | null} */
  let supply = null;
  if (options.supply !== undefined) {
    try {
      supply = roleSupplyManifest({
        role: options.phase,
        specification: options.specification ?? null,
        supply: options.supply,
      });
    } catch (error) {
      // Refused, not spawned. The failure is the role's, so it reads as a failed child rather than
      // as an exception nobody attributed.
      return { ok: false, text: '', costUsd: 0, tokens: 0, raw: /** @type {Error} */ (error).message };
    }
  }

  const args = claudeArgs(options);
  const run = options.run ?? shell;
  // Every Claude child carries the re-entrancy marker. This is the half of the no-nesting
  // rule the guard hook cannot enforce: the hook sees tool calls, not our own children.
  // The prompt goes on stdin rather than in argv; see `claudeArgs` for the bug that cost.
  const result = await run('claude', args, {
    cwd: options.cwd,
    env: childEnvironment(options.env, options.envAllow ?? []),
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
      ...(supply === null ? {} : { supply }),
    };
  }
  // **From the result's own channel, not from stderr** (REVIEW F36). Reading `result.stderr` worked
  // only for children that also *failed*, because `shell` discards stderr on success — and a child
  // that hits a denial, is told no, and carries on to exit zero is the ordinary case, not the
  // exception. The refusal was therefore erased on exactly the path where it happens most, and the
  // test that covered this injected denial text through a synthetic failed result, so it never
  // touched the production success path at all.
  const denials = result.denials ?? [];

  // The cap, with its own answer (REVIEW F7). Valid JSON emitted *before* 64MB was reached
  // survives inside the truncated stdout, so a flooding child that had already printed a
  // success-shaped envelope would otherwise be read as a role that succeeded. It is not: the
  // output was cut off mid-stream, and half a transcript is a different thing from a short one.
  if (result.overflowed === true) {
    return {
      ok: false,
      text: '',
      costUsd: 0,
      tokens: 0,
      raw:
        `the ${options.phase} child was killed for exceeding the output cap. Its stdout was truncated ` +
        'mid-stream, so nothing in it is a complete answer',
      ...(supply === null ? {} : { supply }),
    };
  }

  // **Process success and envelope success, conjoined** (REVIEW F7). This used to consult
  // `result.ok` only when stdout happened to be empty, so a nonzero, signalled or otherwise failed
  // process that left a parseable envelope had its failure *overwritten* by that envelope's
  // verdict. Measured: `ok:false`, status 9, stderr `process failed`, stdout
  // `{"is_error":false,"result":"claimed success"}` — and `spawnClaude` returned `ok:true` with
  // text `claimed success`. Process failure is boundary evidence the child cannot revoke by
  // describing itself favourably, and laundering it can accept a partial PRD, design declaration,
  // builder response or panel verdict.
  const parsed = parseClaudeEnvelope(result.stdout);
  if (!result.ok) {
    // The envelope is still *read*, and only for what it can honestly supply: what the child cost,
    // which was spent whatever the process then did (REVIEW F18), and whether it stopped because an
    // allowance ran out, which the run needs in order to end BUDGET rather than ABORTED. Its
    // `result` text is discarded, because that is the field authority would come from.
    const detail = result.stdout.trim() === '' ? result.stderr : `${result.stderr}\n${parsed.raw}`.trim();
    return {
      ok: false,
      text: '',
      costUsd: parsed.costUsd,
      tokens: parsed.tokens,
      raw: detail,
      ...(parsed.exhausted === true ? { exhausted: true } : {}),
      ...(denials.length > 0 ? { denials } : {}),
      // **A child that failed still received what it received** (PLAN item 77). Attaching the
      // manifest only to success would leave the record silent about exactly the invocations an
      // incident is about, and item 76's receipt has to bind a model identity to the prompt every
      // invocation was handed — not only the ones that came back.
      ...(supply === null ? {} : { supply }),
    };
  }
  // The manifest travels with the result so the caller can archive it beside the role receipt
  // (PLAN item 77). Attached rather than written here, because `spawnClaude` does not know where
  // this run's state lives and should not learn.
  return { ...parsed, ...(denials.length > 0 ? { denials } : {}), ...(supply === null ? {} : { supply }) };
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
  const base = `${phase}: ${model} running on ${characters} characters of prompt, progress every minute`;
  return timeoutMs === undefined ? base : `${base}, killed after ${formatDuration(timeoutMs)}`;
}

/**
 * How often a running child announces that it is still running.
 *
 * Sixty seconds: rare enough that a twenty-minute reviewer costs twenty lines rather than a
 * scroll of them, frequent enough that "hung" and "working" diverge within a minute of each
 * other. Item 10's whole first commit — the async conversion — exists so this interval can
 * fire at all: under `execFileSync` the event loop was blocked and a timer here was
 * impossible, which is why a design phase once sat silent for nine and a half minutes,
 * indistinguishable from a corpse.
 */
export const HEARTBEAT_MS = 60_000;

/**
 * The line printed while a child is still running.
 *
 * Unstyled and factual, like the bracket lines around it: the phase (the start line may be a
 * screen back), how long so far, and the ceiling — so the reader's question stays arithmetic
 * ("47m of 30m would be a bug; 4m of 30m is a Tuesday") rather than dread.
 *
 * @param {string} phase
 * @param {number} elapsedMs
 * @param {number} [timeoutMs]
 * @returns {string}
 */
export function heartbeatLine(phase, elapsedMs, timeoutMs) {
  const base = `${phase}: still running, ${formatDuration(elapsedMs)} elapsed`;
  return timeoutMs === undefined ? base : `${base} of ${formatDuration(timeoutMs)} allowed`;
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
 * @typedef {{
 *   cwd?: string,
 *   env?: Record<string, string | undefined>,
 *   log?: (line: string) => void,
 *   spawn?: typeof spawnClaude,
 *   runComponent?: typeof runComponentDriver,
 *   heartbeatMs?: number,
 * }} DriverIo `spawn` exists so a test can drive the **real** loop -- real gates, real git, real
 *   `gateTree` -- with canned child envelopes instead of paid ones. Three composition sites
 *   inside this function were unassertable without it (`quality:` and `operator:` gates reaching
 *   the roster, the scoped restore firing, the prompt-growth note), each carrying the shape of
 *   the guard defect: correct code that nothing proved was ever called. Defaults to the real
 *   spawner, so production behaviour is untouched. `runComponent` is the same seam for the
 *   component phase's nested driver, so tier 2 can fake the child driver while the worktree,
 *   config and merge halves run against real git.
 */

/**
 * @typedef {{
 *   releasing: ((code: number, terminal: { state?: 'SHIPPED' | 'STALLED' | 'BUDGET' | 'ABORTED',
 *     reason: string, phase: string }) => number) | null,
 *   phase: string,
 *   cleanup?: (() => Promise<void>) | null,
 * }} CrashGuard
 */

/**
 * The entry point, and the boundary where an unexpected exception still leaves a record.
 *
 * **The last hole in F10's one door.** `driveRun` has its own handler and the pre-loop *refusals*
 * all route through `releasing`, but an unexpected **throw** between winning the lock and entering
 * the loop escaped this function entirely: no receipt, and a lock left behind by a process that is
 * about to exit. That region is long — PRD authoring, design, capability resolution, the Oracle,
 * components, provisioning — and every `await` in it can throw for reasons nobody enumerated. F10's
 * acceptance names "unexpected post-lock exception" explicitly, and wrapping only the one path that
 * had been observed to throw would be the enumeration mistake this repository keeps paying for.
 *
 * **Why a wrapper rather than a `try` around the region.** A lexical `try` would mean re-indenting
 * some sixteen hundred lines, and dozens of them are multi-line template literals whose contents
 * are prompts — mechanical re-indentation would silently rewrite what children are told. The guard
 * state is published instead: the body hands out its own `releasing` the moment it has one, and
 * this handler calls that same shared writer rather than a second copy of it.
 *
 * A crash *before* the lock rethrows untouched. Nothing owns the repository yet, so there is no run
 * to file a receipt for, and inventing one would claim a run that never started.
 *
 * @param {string[]} argv
 * @param {DriverIo} [io]
 * @returns {Promise<number>}
 */
export async function main(argv, io = {}) {
  /** @type {CrashGuard} */
  const crash = { releasing: null, phase: 'pre-loop', cleanup: null };
  try {
    return await runInvocation(argv, io, crash);
  } catch (error) {
    if (crash.releasing === null) throw error;
    const failure = `${/** @type {Error} */ (error).name}: ${/** @type {Error} */ (error).message}`;
    // Reported before the receipt and separately from it: a broken `log` must not be able to stop
    // the durable record, which is the only half of this that survives the process.
    try {
      (io.log ?? ((/** @type {string} */ line) => process.stdout.write(`${line}\n`)))(failure);
    } catch {
      // Nothing to do about a logger that throws. The receipt below is the point.
    }
    // The shared writer: it archives the previous run first, writes at most once — so a loop that
    // already decided keeps its own answer — and gives the repository back.
    return crash.releasing(1, { state: 'ABORTED', reason: failure.slice(0, 800), phase: crash.phase });
  } finally {
    // **The candidate worktree, on every path out including the throwing ones** (REVIEW F14). Its
    // removal is asynchronous — `git worktree remove` — and `releasing` is not, so it cannot live
    // there. Published the same way `releasing` is, for the same reason: the body is too long to
    // wrap in a lexical `try` without re-indenting prompts. A leak is still self-healing, because
    // `SIGKILL` outruns any `finally` and the next run sweeps under the lock.
    if (crash.cleanup !== null && crash.cleanup !== undefined) {
      try {
        await crash.cleanup();
      } catch {
        // A cleanup that throws must not change the run's answer. The sweep at the next start is
        // what actually guarantees the directory goes.
      }
    }
  }
}

/**
 * @param {string[]} argv
 * @param {DriverIo} io
 * @param {CrashGuard} crash published to `main` so an escaping throw can still file a receipt
 * @returns {Promise<number>}
 */
async function runInvocation(argv, io, crash) {
  const cwd = io.cwd ?? process.cwd();
  // When this run began, for handing components the parent's *remaining* wall clock rather
  // than a fresh one. `driveRun` keeps its own start for the loop's deadline; this one exists
  // because the component phase runs before `driveRun` does.
  const startedAtMs = Date.now();
  // Read straight from argv rather than from `parseDriverArgs`, because `assertNotNested` runs
  // before the arguments are parsed and this is the one flag that has to be visible to it.
  // Armed into the environment so the guard hook and every descendant see the same fact from
  // the same place — a permission that lived only in this function would be invisible to the
  // hook that also enforces the rule.
  const boxed = argv.includes('--give-them-the-box');
  // **Where the guard may count denials, and nowhere else** (PLAN item 52). Named by the Driver
  // rather than derived by the guard, because a guard deriving a temporary path is the defect the
  // item-37 hostile panel pulled: the guard is the one component that survives
  // `--dangerously-skip-permissions` and is not itself guarded, so a predictable path is a symlink
  // target. This one is inside `.meeseeks/`, where the guard denies the in-run writes it recognizes.
  // The directory is created after the lock is won — a run that never started writes nothing — and
  // until it exists the guard's open fails and every denial renders in full, which is the direction
  // every uncertainty here takes.
  /** @type {Record<string, string | undefined>} */
  const env = {
    ...(io.env ?? process.env),
    ...(boxed ? { [BOX_ENV]: '1' } : {}),
    // Never inherit an operator- or child-chosen write target. This is populated only after the
    // driver establishes its own directory under the run lock.
    [DENIAL_STATE_ENV]: undefined,
  };
  const write = io.log ?? ((/** @type {string} */ line) => process.stdout.write(`${line}\n`));
  const spawn = io.spawn ?? spawnClaude;
  const heartbeatMs = io.heartbeatMs ?? HEARTBEAT_MS;
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
   * The journal sequence, monotonic within a run.
   *
   * A counter rather than a timestamp: two events in the same millisecond are ordinary, and a
   * forensic reader needs an order rather than a guess at one. Run-scoped, because the file is
   * archived with the run.
   */
  let journalSeq = 0;

  /**
   * One journal line, or none (PLAN item 58).
   *
   * **Forensics, never a decision.** Nothing in this loop reads it back; the moment something did,
   * it would be a second answer beside `outcome.json` and nobody would know which was right. It is
   * also written on the crash path, where the filesystem is exactly what may already have failed, so
   * `recordEvent` reports a failed write and returns rather than throwing into the run.
   *
   * @param {string} kind
   * @param {string} subject
   * @param {{ iteration?: number | null, detail?: string | null }} [extra]
   */
  const journal = (kind, subject, extra = {}) => {
    recordEvent(
      meeseeksDir,
      { kind, subject, iteration: extra.iteration ?? null, detail: extra.detail ?? null },
      {
        now: () => new Date().toISOString(),
        seq: () => (journalSeq += 1),
        log: (line) => write(verbatim(line)),
      },
    );
  };

  /**
   * Run one `claude -p` child, bracketed by the only progress an operator ever gets.
   *
   * Children are awaited one at a time — the loop is still strictly sequential — but the
   * event loop is free while a child runs. A periodic tick is now *possible*; it is
   * deliberately not added here, because this change is the mechanical conversion and
   * nothing else. What the bracket carries is the information that was actually missing —
   * which phase started, on which model, that nothing will print until it returns, and how
   * long it took once it has. An observed design phase sat silent for nine and a half
   * minutes, indistinguishable from a hung process, and the cheapest wrong response to that
   * is killing a run that was working.
   *
   * Unstyled on purpose: this is progress, and progress that lies about its own timing is
   * worse than none.
   *
   * @param {Parameters<typeof spawnClaude>[0]} options
   * @returns {ReturnType<typeof spawnClaude>}
   */
  const runChild = async (options) => {
    // **Declared here as well as at `spawnClaude`, and the duplication is the point** (PLAN item
    // 77). `spawnClaude` is the door every child passes through, including a component's, and its
    // refusal is what makes the boundary real. This is the door every child *in the loop* passes
    // through, and it is the only one that knows where this run's state lives — so the durable
    // record is built here. `roleSupplyManifest` is pure, so the two constructions cannot disagree.
    /** @type {import('./role-supply.mjs').RoleSupplyManifest | null} */
    let manifest = null;
    if (options.supply !== undefined) {
      try {
        manifest = roleSupplyManifest({
          role: options.phase,
          specification: options.specification ?? null,
          supply: options.supply,
        });
      } catch (error) {
        // Refused before anything is spent, and reported as the role's own failure rather than as
        // an exception nobody attributed — the same shape `spawnClaude` returns.
        return { ok: false, text: '', costUsd: 0, tokens: 0, raw: /** @type {Error} */ (error).message };
      }
    }
    const measured = measurePrompt({ systemPrompt: options.systemPrompt, prompt: options.prompt });
    // Recorded **before** the line announcing it, not after. A kill landing between the two would
    // otherwise lose the very transition the journal exists to preserve — which a test caught by
    // killing on that exact line and finding no journal at all.
    journal('child-started', options.phase, { detail: options.model });
    write(verbatim(childStartLine(options.phase, options.model, measured.characters, config.childTimeoutMs)));
    const startedAt = Date.now();
    const allowance = childBudget(config, handedOutUsd);
    // The heartbeat. Cleared in `finally`, because a heartbeat that outlives its child is a
    // lie with a pulse. `io.heartbeatMs` exists for tests, exactly as `io.spawn` does.
    const pulse = setInterval(
      () => write(verbatim(heartbeatLine(options.phase, Date.now() - startedAt, config.childTimeoutMs))),
      heartbeatMs,
    );
    let result;
    try {
      result = await spawn({
      ...options,
      contextLimit: config.contextBudget.maxCharacters,
      // Supplied here rather than at each call site, for the same reason the context budget
      // is checked inside `spawnClaude`: every child in the loop passes through this one
      // door, so a phase added later cannot forget the ceiling.
      timeoutMs: config.childTimeoutMs,
      sandbox: config.sandbox.enabled,
      // Supplied at the same one door and for the same reason (REVIEW F5). A phase added later
      // cannot forget the environment boundary, and cannot be given a wider one by accident.
      envAllow: config.childEnvAllow,
        ...allowance,
      });
    } finally {
      clearInterval(pulse);
      // In `finally`, so a child that threw is settled rather than left in flight forever. An
      // unsettled child is the journal's strongest claim and it must mean "was running when
      // everything stopped", not "failed in a way nobody recorded".
      journal('child-settled', options.phase);
    }
    // Counted here because **every** child in the loop passes through this function — the
    // authoring phases, the design phase, the builder, the panel, and each race candidate.
    // So this total is the run's total, summed over the same envelopes `driveRun` charges
    // against the ceiling; it is not a second opinion about spend, it is the same arithmetic
    // reaching the place that needs it before the next child is spawned rather than after.
    handedOutUsd += result.costUsd;
    write(verbatim(childEndLine(options.phase, result, Math.round((Date.now() - startedAt) / 1000))));
    // Surfaced, once, per child. A guard refusal is the loop's own limit doing its job and the
    // operator has no other way to learn it happened.
    for (const denial of result.denials ?? []) write(verbatim(`${options.phase}: ${denial}`));
    // **The manifest is archived here, at the same one door** (PLAN item 77, consumed by item 76).
    // `spawnClaude` builds it and deliberately does not know where this run's state lives; this
    // function is the only place every child in the loop passes through, so a phase added later
    // cannot forget to record what it was handed.
    //
    // A failure to write is reported and does not end the run: this is evidence for an acceptance
    // receipt, not a decision, and the store itself records its own discontinuity when it finds one.
    //
    // Written *after* the child returns, so it records what a role was actually handed rather than
    // what one was about to be offered — a child `spawnClaude` refuses never received anything.
    //
    // **Every invocation, not only the declaring ones** (REVIEW F22). The store began as a record of
    // what cold roles were *handed*; the acceptance receipt needs what every role was *asked of* and
    // what actually served it, so a phase with no declared supply is recorded with a null manifest
    // rather than not recorded at all. An invocation missing from the ledger is indistinguishable
    // from one that never happened.
    {
      try {
        appendSupplyRecord(meeseeksDir, {
          role: options.phase,
          at: new Date().toISOString(),
          // The driver's pre-loop phases have no iteration, and writing one would state a fact the
          // run had not established.
          iteration: null,
          manifest,
          requestedModel: options.model,
          requestedEffort: options.effort ?? null,
          // Tagged: what the vendor reported, or an explicit statement that it reported nothing.
          // Never the requested selector standing in for an observation.
          models: result.observedModels ?? { unavailable: 'the child returned no envelope to read' },
        });
      } catch (error) {
        // **A write that failed is a hole in the ledger, and the hole has to be recorded somewhere
        // the ledger is not** (REVIEW F22, reopened). This was logged and nothing else, so a single
        // `ENOSPC` or `EACCES` omitted an invocation entirely — and the receipt, which counts
        // invocations to decide whether every model identity can be established, saw a *shorter*
        // ledger with no discontinuity in it and reported itself complete. `appendSupplyRecord`
        // writes its own lapse when the store is unreadable; it cannot write one when writing is
        // what failed, so the fact is held here and handed to the receipt.
        const detail = `the supply record for ${options.phase} could not be written: ${/** @type {Error} */ (error).message}`;
        write(verbatim(detail));
        supplyLapses.push(detail);
      }
    }
    return result;
  };

  if (boxed) {
    // Verbatim and unmissable. Any artifact produced under this flag was produced by a mode
    // nothing else in this system supports, and a reader who does not know that will draw
    // conclusions from it that are not available.
    write(verbatim('--give-them-the-box: nested runs are PERMITTED to depth 2. This is unsupported.'));
    write(verbatim('Everything else still holds: .meeseeks/ is guarded, review is cold, nothing defaults to pass.'));
  }

  let runDepth;
  try {
    runDepth = assertNotNested(env);
    // Downstream guards need the same depth the ticket established. Leaving a child-supplied
    // marker in place here would reintroduce the cap reset after successful redemption.
    if (boxed) env[DEPTH_ENV] = String(runDepth);
  } catch (error) {
    write(verbatim(/** @type {Error} */ (error).message));
    return 1;
  }

  const meeseeksDir = path.join(cwd, '.meeseeks');
  /** @type {MeeseeksConfig} */
  let config;
  try {
    config = loadConfig(meeseeksDir, { env, log: (line) => write(verbatim(line)) });
  } catch (error) {
    // Failure output is verbatim and unstyled (DESIGN.md §9), and a missing or broken
    // config must read as an instruction, not a stack trace.
    write(verbatim(/** @type {Error} */ (error).message));
    return 1;
  }

  // **Nesting arms the wall clock**, and this is the one place a deadline is imposed rather than
  // configured. Permitting a run inside a run removes the assumption the other bounds rely on:
  // depth is capped at two, but nothing caps how many nested runs one iteration starts, so the
  // reachable work is `iterations x invocations x depth` and only the middle term is unbounded.
  // With the ceilings switched off for development — `tokenCeiling: 0` — that product has no
  // limit at all, which is exactly the combination this guards.
  //
  // An operator who set their own `deadlineMs` keeps it. Otherwise thirty minutes, a number
  // chosen to be embarrassing to hit rather than derived from anything.
  /** @type {{ input: string, confirmPrd: boolean, improve: boolean, deadlineMinutes: number | null }} */
  let args;
  try {
    args = parseDriverArgs(argv);
  } catch (error) {
    write(verbatim(/** @type {Error} */ (error).message));
    return 1;
  }
  const { input, confirmPrd, improve } = args;

  // Components are nested runs, and the permission to nest is typed, never configured
  // (PLAN item 24). The config says *what* the components are; only `--give-them-the-box` on
  // this session's command line says they may run, because a flag is typed by somebody watching
  // and config is read quietly by a machine at three in the morning. Checked here beside the
  // tracked-state refusal — a static property of the invocation, refused before any child is
  // paid for.
  if (config.components.length > 0 && !boxed) {
    write(
      verbatim(
        `this configuration declares ${config.components.length} component(s), and every component is a nested ` +
          'meeseeks run. Nesting needs the operator: re-run with --give-them-the-box. ' +
          'The config cannot smuggle that permission, and this run will not borrow it.',
      ),
    );
    return 1;
  }

  // `--deadline=<minutes>` outranks the config, because a flag is this session's instruction and
  // the config is the target's standing one.
  if (args.deadlineMinutes !== null) config.deadlineMs = Math.round(args.deadlineMinutes * 60_000);

  if (boxed) {
    // **Nesting may not be run without a clock, and an explicit zero is refused rather than
    // overridden.** Silently replacing it with the default would ignore a typed instruction
    // without saying so, which is the shape of defect this project keeps finding. Depth is capped
    // at two but nothing caps how many nested runs one iteration starts, so an unbounded nested
    // run is the one combination with no limit at all. `--deadline=720` if twelve hours is what
    // the experiment needs.
    if (args.deadlineMinutes === 0) {
      write(
        verbatim(
          '--deadline=0 asks for no wall clock and --give-them-the-box requires one: nesting is capped in ' +
            'depth but not in how many runs an iteration starts, so this is the one combination with no bound. ' +
            'Give it a number of minutes.',
        ),
      );
      return 1;
    }
    if (config.deadlineMs === 0) {
      // Nothing set one, so the box brings its own. Thirty minutes is chosen to be embarrassing
      // to hit rather than derived from anything.
      config.deadlineMs = BOXED_DEADLINE_MS;
    }
    write(verbatim(`--give-them-the-box: a ${Math.round(config.deadlineMs / 60_000)}-minute wall clock is armed with it.`));
  }

  // ---- One driver per repository (DESIGN.md §3.5, REVIEW F1) -------------
  //
  // **Here, and in one atomic operation.** The previous version checked and claimed in two calls,
  // and did both of them only after the PRD phase, the design phase, the quality-plugin install
  // and a commit — so two launches could pass the same check, pay for two authoring phases and
  // commit over each other before either owned anything. `acquireRunLock` wins by exclusive
  // create or does not win at all; a stale owner is reclaimed by an explicit serialized retry
  // rather than by overwriting.
  //
  // The position is the other half of the repair. Everything with a side effect is downstream of
  // this line: the `.gitignore` write, the previous run's archive, every child, every install and
  // every commit. What is deliberately *upstream* of it is the set of refusals about the
  // *invocation* rather than the repository — the re-entrancy guard, the config load, argument
  // parsing and the components/`--give-them-the-box` rule. A run that was never going to start
  // should not take the repository from one that was, and the nesting refusal in particular must
  // keep its own message: a nested run held off by the *parent's* lock would report the wrong
  // reason, and under `--give-them-the-box` it would refuse work that flag exists to permit.
  // Everything that is a fact about the *repository* is downstream, in the launch revalidation
  // below, because those facts are only authoritative while somebody owns the tree.
  //
  // Preflight checks this too, and that is not redundancy: preflight runs in the `init` entry
  // point, in a different process, and holds nothing while this one starts. Its answer is operator
  // feedback. This one is the decision.
  const runLock = acquireRunLock(meeseeksDir);
  if (!runLock.ok) {
    write(verbatim(`${runLock.detail}\n${runLock.fix}`));
    return 1;
  }

  /**
   * Give the repository back, then hand the exit code on.
   *
   * Every `return` between here and the loop's own `try`/`finally` goes through this, because
   * DESIGN.md §3.5 says the lock is released by its owner *on every path out* and the paths out of
   * the pre-loop phases are numerous — a failed PRD child, an unreadable capability declaration,
   * `--confirm-prd` succeeding, a component aborting. `test/driver.test.mjs` proves no exit escapes
   * it, because an enumeration nobody re-checks is how this project loses guarantees.
   *
   * @param {number} code
   * @returns {number}
   */
  /**
   * The run's at-most-once terminal receipt (REVIEW F10). An invocation becomes a *run* at the line
   * above, where the lock is won; from here every non-crash exit leaves exactly one receipt, and
   * the first answer written is the decided one.
   */
  // Declared above `releasing`, which reads it: the pre-loop exits it now writes a receipt for
  // (REVIEW F10) include the launch refusal, which runs before the phases that spend anything.
  const preLoop = { tokens: 0, costUsd: 0 };

  const outcomeWritten = { done: false };

  /**
   * Move the previous run's artifacts aside, at most once (REVIEW F10, reopened).
   *
   * **The ordering was contradictory the moment `releasing` started writing a receipt.** Archiving
   * ran after the launch check, on the reasoning that a refused launch should disturb nothing — but
   * a refusal now files `outcome.json`, so it overwrote the previous run's receipt before anything
   * could preserve it. The fix is not to move one call: every early exit has the same problem, so
   * the archive happens before any receipt is written, from wherever the exit is taken.
   *
   * A failure here is reported and does not change the terminal state already decided. The ordinary
   * path still refuses to *start* on a failed archive; that check is at its own call site below,
   * where continuing would destroy the evidence archiving exists to keep.
   *
   * @returns {string | null} the archive directory, or null when there was nothing to archive
   */
  let archivedTo = /** @type {string | null} */ (null);
  let archiveAttempted = false;
  /**
   * Whether the previous run's artifacts are still sitting in `.meeseeks/` un-archived.
   *
   * **The flag used to be set before the operation that throws** (REVIEW F10, reopened), so a
   * refusal was permanent for the invocation *and* silent to the receipt writer, which then wrote
   * this run's answer over the very `outcome.json` the refusal was protecting. Marked on success
   * only, so a later exit may try again, and remembered as a fact the writer is told.
   */
  let archiveFailed = false;
  const archiveOnce = () => {
    if (archiveAttempted) return archivedTo;
    try {
      archivedTo = archivePreviousRun(meeseeksDir);
    } catch (error) {
      archiveFailed = true;
      throw error;
    }
    archiveAttempted = true;
    archiveFailed = false;
    return archivedTo;
  };

  /**
   * @param {number} code
   * @param {{ state?: 'SHIPPED' | 'STALLED' | 'BUDGET' | 'ABORTED', reason: string, phase: string }} terminal
   * @returns {number}
   */
  const releasing = (code, terminal) => {
    // **Every paid pre-loop failure leaves a receipt** (REVIEW F10). The one door used to be one
    // door into `driveRun`, so a PRD child that failed, an unreadable declaration, an Oracle that
    // would not parse or a component that aborted printed ABORTED and returned with nothing durable
    // written. A parent component then correctly refuses to trust a child with no receipt — and its
    // operator cannot recover the child's state or its spend from the artifact that promised both.
    //
    // Spend is what is *known*: `preLoop` is the real total handed to children so far. Iterations
    // and the panel identity are omitted rather than zeroed, because a run that never reached the
    // loop has no iteration count and writing one would state a fact it never established.
    // Before the receipt, always (REVIEW F10, reopened). Otherwise an early exit files this run's
    // outcome over the previous run's, which is the record archiving exists to keep.
    try {
      archiveOnce();
    } catch (error) {
      write(verbatim(`could not archive the previous run: ${/** @type {Error} */ (error).message}`));
    }
    writeRunOutcome(
      meeseeksDir,
      {
        state: terminal.state ?? (code === 0 ? 'STALLED' : 'ABORTED'),
        reason: terminal.reason,
        phase: terminal.phase,
        spentTokens: preLoop.tokens,
        costUsd: preLoop.costUsd,
      },
      {
        now: () => new Date().toISOString(),
        log: (line) => write(verbatim(line)),
        written: outcomeWritten,
        // The archive refused, so the previous run's receipt is still at the canonical path and this
        // one may not land on top of it (REVIEW F10, reopened).
        preserve: archiveFailed,
      },
    );
    // **The question, at the pre-loop door too** (PLAN item 50). This is where a design phase, a PRD
    // child, an Oracle store or a component ends a run, and it is the case where an operator most
    // needs to be told what to change: the run never reached an iteration, so there is no gate
    // history to read and the receipt's phase is the only clue it leaves.
    //
    // Cited by phase and nothing finer, because that is what a pre-loop failure knows. Inventing a
    // requirement id here would be the confident vapour the citation bar exists to refuse. Failing
    // to write it never fails the run, for the same reason the receipt above does not.
    try {
      writeQuestion(
        meeseeksDir,
        {
          state: terminal.state ?? (code === 0 ? 'STALLED' : 'ABORTED'),
          reason: terminal.reason,
          phase: terminal.phase,
        },
        { tried: [`the run reached the ${terminal.phase} phase and stopped there`] },
        { now: () => new Date().toISOString(), log: (line) => write(verbatim(line)) },
      );
    } catch (failure) {
      write(verbatim(`could not write the question artifact: ${/** @type {Error} */ (failure).message}`));
    }
    releaseRunLock(meeseeksDir, runLock.lock.token);
    return code;
  };

  // From here an escaping throw is a *run* that crashed rather than an invocation that failed, so
  // `main`'s handler has a receipt to file and a lock to give back. Published as late as the
  // declarations above allow and no later: everything between winning the lock and this line is
  // `const` bindings and closures, with no `await` and nothing that can throw.
  crash.releasing = releasing;

  // ---- The authoritative launch observation (DESIGN.md §3.5, REVIEW F26) --
  //
  // The command runs `init.mjs` and this file as two separate model-directed Bash calls, and
  // `allowed-tools` pre-approves the two it names without removing the launcher's other tools. So
  // preflight's verdict is operator feedback with a shelf life: between it and this line, another
  // tool call, a concurrent operator or an unrelated process can dirty the tree, repoint the
  // remote at something production-shaped, drop a hostile hook into the agent surface, or rewrite
  // the config. Nothing rechecked any of that — before this, the driver's only repeated check was
  // whether `.meeseeks/` was tracked.
  //
  // Reused from `preflight.mjs` rather than reimplemented, because a second answer to "is this
  // remote production-shaped" eventually disagrees with the first one, quietly.
  //
  // **It observes the repository and claims nothing more.** The `claude` binary, its
  // authentication and the network are mutable host state that this snapshot cannot seal; they
  // stay ordinary fail-closed failures where they are used.
  const launch = await revalidateLaunch({
    cwd,
    meeseeksDir,
    sandboxWanted: config.sandbox.enabled,
    // `defaultProbe` is preflight's own read-only, synchronous shell. Synchronous is right here:
    // these are a handful of `git` reads at startup, and there is nothing else for this process
    // to be doing until it knows whether it may proceed.
    probe: defaultProbe(cwd),
  });
  if (!launch.ok) {
    // Verbatim and unstyled, every failure at once (DESIGN.md §9). The receipt for a refusal is
    // this text: nothing is written, because writing would be the very thing the refusal is
    // protecting the repository from.
    write(verbatim(`launch refused at HEAD ${launch.head === '' ? '(unreadable)' : launch.head}`));
    for (const failed of launch.failures) write(verbatim(`${failed.name}: ${failed.detail}\n${failed.fix}`));
    return releasing(1, { reason: 'launch revalidation refused the tree', phase: 'launch' });
  }

  /**
   * What this run observed and what each pre-loop phase was allowed to leave behind.
   *
   * Rebuilt rather than mutated as phases are admitted, and written after the archive below —
   * writing it before would put this run's receipt where `archivePreviousRun` is about to move
   * the *previous* run's, and the archive exists because a second run silently overwriting the
   * first one's evidence has already happened here.
   */
  let receipt = buildLaunchReceipt({ at: new Date().toISOString(), head: launch.head, checks: launch.checks });

  // What Phase 0 and Phase 1 cost. These run before `driveRun` exists, so without carrying
  // them the ceiling silently restarts at zero when the loop begins — the defect the first
  // dogfood run exposed, where a design child spent 2,965,864 tokens against a 2,000,000
  // ceiling and the airtime counter reported the full budget remaining.

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
    return config.tokenCeiling > 0 && preLoop.tokens >= config.tokenCeiling;
  };

  /** @param {string} phase */
  const preLoopBudgetEnd = (phase) => {
    write(verbatim(`token ceiling reached during ${phase}: ${preLoop.tokens} of ${config.tokenCeiling}`));
    write(stamp('BUDGET', { mode }));
  };

  // Measured before the run commits anything of its own. A repository that was empty when
  // meeseeks arrived never has history worth quoting back at a builder, however many commits
  // meeseeks goes on to add — those are the builder's own work, restated (DESIGN.md §8.2).
  const greenfield = !(await hasMeaningfulHistory({ cwd, run: shell }));

  write(banner({ mode }));

  // Before anything is written, so the very first commit cannot stage machine state. Whether it
  // wrote is carried, because `.gitignore` is then a change in the tree that the PRD phase's
  // admission would otherwise refuse — and it is admitted only on the run that actually made it,
  // so a child editing `.gitignore` on any other run is still an unexpected neighbour.
  const wroteIgnore = ensureMeeseeksIgnored(cwd);
  if (wroteIgnore) write(verbatim('added meeseeks machine state to .gitignore'));

  // Before this run writes any artifact of its own, because the collision it prevents is
  // silent: iteration numbering restarts at 1 every run, so `briefs/iter-001.md` would be
  // overwritten by a replacement that looks exactly like the original (DESIGN.md §7.2).
  try {
    const archived = archiveOnce();
    if (archived !== null) write(verbatim(`archived the previous run to ${path.relative(cwd, archived)}`));
  } catch (error) {
    // Continuing here would destroy the evidence archiving exists to keep, which is a worse
    // outcome than not starting.
    write(verbatim(/** @type {Error} */ (error).message));
    return releasing(1, { reason: 'the previous run could not be archived', phase: 'archive' });
  }

  // The first thing this run writes of its own, and only now: the archive above has already
  // moved the previous run's receipt out of the way (DESIGN.md §7.2).
  writeLaunchReceipt(meeseeksDir, receipt);

  /**
   * Commit what a phase produced — and refuse anything it did not declare.
   *
   * An interrupt between phases would otherwise strand the work: the PRD lands untracked,
   * preflight refuses the dirty tree, and the operator cannot simply resume. Observed on
   * the first real run, which was stopped after phase 0 and left `?? PRD.md` behind.
   *
   * **The staging list is explicit, and that is the repair (REVIEW F26).** `git add -A` committed
   * whatever was present at that moment under a message claiming it was Meeseeks document output,
   * so a launcher edit, a concurrent operator's edit, or an off-contract edit by the document
   * child itself became trusted phase provenance. The tree is clean at launch — the observation
   * above insists on it — so every path here belongs to this phase, and a path the phase's
   * template does not declare ends the run.
   *
   * Refusing stages nothing, commits nothing, resets nothing and removes nothing. The surprise
   * stays on disk because it may be the operator's, and a check that destroys what it objects to
   * has stopped being a check.
   *
   * The allowlist is read from the phase's own template, never restated here, so a template that
   * changes what it writes changes what is admitted in the same edit. `template: null` means the
   * phase has no template contract — quality-plugin provisioning writes whatever the tools it
   * installs write. Those paths are enumerated, staged by name and recorded rather than predicted,
   * which is still not `git add -A`.
   *
   * @param {{ phase: string, message: string, template: string | null, extra?: string[] }} options
   * @returns {Promise<boolean>} false when the phase left something it does not declare
   */
  const commitPhase = async (options) => {
    /** @type {string[] | null} */
    let declared = null;
    if (options.template !== null) {
      try {
        declared = [
          ...declaredOutputs({ template: template(options.template), name: options.template }),
          ...(options.extra ?? []),
        ];
      } catch (error) {
        write(verbatim(/** @type {Error} */ (error).message));
        return false;
      }
    }
    /** @type {string[]} */
    let changed;
    try {
      // Through the bounded door: `changedPaths` runs `git status`, which fsmonitor and clean
      // filters reach exactly as `git add` does (REVIEW F44).
      changed = await changedPaths({ run: (command, args) => git(args, { cwd }), cwd });
    } catch (error) {
      // A tree git cannot describe is not an unchanged one, and an exception escaping here would
      // leave the run lock held and reach the operator as a stack trace instead of a verdict.
      write(verbatim(/** @type {Error} */ (error).message));
      return false;
    }
    /** @type {string[]} */
    let staged;
    if (declared === null) {
      staged = changed;
    } else {
      const decision = admitOutputs({ changed, allowed: declared });
      if (!decision.ok) {
        write(verbatim(describeUnexpected({ phase: options.phase, unexpected: decision.unexpected, allowed: declared })));
        return false;
      }
      staged = decision.admitted;
    }
    if (staged.length > 0) {
      // **Observed, not inferred** (REVIEW F26). `shell` resolves `{ ok: false }` rather than
      // throwing, so discarding these two results made a failed pre-loop commit indistinguishable
      // from a successful one: the launch receipt recorded the phase as committed, `commitPhase`
      // returned true, and the run proceeded on a tree that still held the changes. `driveRun`'s
      // own commit closure has checked both since F31; this is the same rule, at the door.
      //
      // `--` so a path that looks like a revision is still a path.
      const added = await git(['add', '--', ...staged], { cwd });
      if (!added.ok) {
        write(verbatim(`${options.phase}: git add failed: ${(added.stderr || added.stdout).trim().slice(0, 400)}`));
        return false;
      }
      // Asked rather than assumed, for the same reason the loop's closure asks: `git commit` exits
      // non-zero when there is nothing staged, and that is an ordinary phase that produced no
      // change rather than a fault. Only a *staged* tree that then fails to commit is a failure.
      const pending = await git(['diff', '--cached', '--name-only'], { cwd });
      if (!pending.ok) {
        write(verbatim(`${options.phase}: git could not list the staged changes: ${(pending.stderr || '').trim().slice(0, 400)}`));
        return false;
      }
      if (pending.stdout.trim() !== '') {
        const committed = await git(['commit', '--no-verify', '-m', options.message], { cwd });
        if (!committed.ok) {
          write(
            verbatim(
              `${options.phase}: git commit failed: ${(committed.stderr || committed.stdout).trim().slice(0, 400)}. ` +
                'The phase is refused rather than recorded, because a receipt naming a commit that did not happen is ' +
                'worse than no receipt',
            ),
          );
          return false;
        }
      }
    }
    receipt = recordPhase(receipt, { phase: options.phase, declared, staged });
    writeLaunchReceipt(meeseeksDir, receipt);
    return true;
  };

  /**
   * A phase that declares no repository output at all, checked without committing anything.
   *
   * The oracle author holds no tools and the reality-check retry holds only read tools, so both
   * should leave the tree exactly as they found it. Asserting that here rather than letting the
   * next document phase discover it keeps the attribution honest: a stray file is reported
   * against the phase that produced it.
   *
   * @param {string} phase
   * @returns {Promise<boolean>}
   */
  const assertWroteNothing = async (phase) => {
    /** @type {string[]} */
    let changed;
    try {
      // Through the bounded door: `changedPaths` runs `git status`, which fsmonitor and clean
      // filters reach exactly as `git add` does (REVIEW F44).
      changed = await changedPaths({ run: (command, args) => git(args, { cwd }), cwd });
    } catch (error) {
      write(verbatim(/** @type {Error} */ (error).message));
      return false;
    }
    if (changed.length === 0) return true;
    write(verbatim(describeUnexpected({ phase, unexpected: changed, allowed: [] })));
    return false;
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
      return releasing(1, { reason: 'no PRD and no idea to improve on', phase: 'improvement authoring' });
    }
    write(verbatim(input === '' ? 'authoring PRD.md from this repository' : `authoring PRD.md from this repository, focused on: ${input}`));
    const authored = await runChild({
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
      return releasing(1, { reason: 'improvement authoring failed', phase: 'improvement authoring' });
    }
    if (chargePreLoop(authored)) {
      preLoopBudgetEnd('improvement authoring');
      return releasing(1, { state: 'BUDGET', reason: 'token ceiling reached during improvement authoring', phase: 'improvement authoring' });
    }
    if (!existsSync(prdPath)) writeFileSync(prdPath, authored.text, 'utf8');
  } else if (input !== '' && existsSync(path.resolve(cwd, input))) {
    write(verbatim(`using ${input}`));
    // **Bounded, because this is the first read of the operator's specification** (REVIEW F19).
    // `captureSpecification` reads it under `READ_LIMITS.specification` a few lines later, but this
    // copy happens first and read it whole — so an oversized PRD died here, unbounded, before the
    // limit that exists for exactly this artifact could refuse it by name.
    if (path.resolve(cwd, input) !== prdPath) {
      /** @type {string} */
      let document;
      try {
        document = readBounded(path.resolve(cwd, input), READ_LIMITS.specification);
      } catch (error) {
        // Named in the receipt, not only on stdout: the refusal says which artifact and how big.
        write(verbatim(/** @type {Error} */ (error).message));
        write(stamp('ABORTED', { mode }));
        return releasing(1, {
          reason: `${/** @type {Error} */ (error).message}`.slice(0, 400),
          phase: 'prd authoring',
        });
      }
      writeFileSync(prdPath, document);
    }
  } else {
    const idea =
      input !== ''
        ? input
        : config.improvise.enabled
          ? 'Invent a small, genuinely useful project that can be built and tested unattended, then specify it.'
          : '';
    if (idea === '') {
      write(verbatim('no PRD, no idea, and improvise is disabled. Nothing to build.'));
      return releasing(1, { reason: 'no PRD, no idea, and improvise is disabled', phase: 'prd authoring' });
    }
    write(verbatim('authoring PRD.md'));
    const authored = await runChild({
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
      return releasing(1, { reason: 'PRD authoring failed', phase: 'prd authoring' });
    }
    if (chargePreLoop(authored)) {
      preLoopBudgetEnd('PRD authoring');
      return releasing(1, { state: 'BUDGET', reason: 'token ceiling reached during PRD authoring', phase: 'prd authoring' });
    }
    if (!existsSync(prdPath)) writeFileSync(prdPath, authored.text, 'utf8');
  }

  // `.gitignore` is admitted only when this run's own `ensureMeeseeksIgnored` wrote it, which is
  // a driver-owned fact rather than something a child could arrange for itself.
  if (
    !(await commitPhase({
      phase: 'prd',
      message: improve ? 'meeseeks: author PRD.md from the existing repository' : 'meeseeks: author PRD.md',
      template: improve ? 'improve-author.md' : 'prd-author.md',
      extra: wroteIgnore ? ['.gitignore'] : [],
    }))
  ) {
    write(stamp('ABORTED', { mode }));
    return releasing(1, { reason: 'the authored PRD could not be committed', phase: 'prd authoring' });
  }
  if (confirmPrd) {
    // Names the exact continuation rather than saying to remove a flag (REVIEW F24). A literal
    // no-input or repeated-idea rerun enters the improvisation branch and spends a PRD-model call
    // before retaining the file that was just approved; pointing at the path is what avoids that.
    write(
      verbatim(
        'PRD.md is written and committed. Read it, edit it if it is wrong, then start the run with ' +
          '`/meeseeks ./PRD.md`. That is a new invocation, not a resumed session, and naming the file is what ' +
          'stops it authoring the intent again.',
      ),
    );
    return releasing(0, { state: 'STALLED', reason: 'stopped after writing PRD.md, as --confirm-prd asks', phase: 'prd authoring' });
  }

  // ---- The specification this run is held to (DESIGN.md §4, REVIEW F12) --
  //
  // Captured here: after the PRD is committed and *before* the oracle, the design phase, the
  // builder or the panel has read a line of it. Stable requirement ids do not preserve stable
  // intent — a builder that rewrote `PRD-1.1`'s text while keeping its id moved the finish line,
  // and an independent panel then faithfully certified the wrong specification, which is measured
  // rather than imagined.
  //
  // The bytes come back from the capture rather than from a second read, so `requiredIds` are
  // derived from exactly the document that was digested. Two reads of one path is how an identity
  // becomes a coincidence.
  /** @type {{ revision: import('./specification.mjs').SpecificationRevision, contents: string }} */
  let specification;
  try {
    specification = captureSpecification({ meeseeksDir, root: cwd, file: path.relative(cwd, prdPath) });
  } catch (error) {
    write(verbatim(/** @type {Error} */ (error).message));
    write(stamp('ABORTED', { mode }));
    return releasing(1, { reason: 'the specification could not be captured', phase: 'specification' });
  }
  write(verbatim(`specification: ${specification.revision.file} at ${specification.revision.digest}`));

  const prd = specification.contents;

  // **The ERD is checked here because here is the first moment both inputs exist** (PLAN item 47).
  // `revalidateLaunch` runs before the specification is captured, and in improve mode before it has
  // been authored at all, so an ERD checked there would be checked against nothing. This is still a
  // refusal of the run rather than a gate result: no builder has been spawned, nothing has been
  // written to the target, and the operator is told at the door instead of four iterations in.
  const erdCheck = checkErdConsistency(cwd, prd, config.erd);
  if (!erdCheck.ok) {
    write(verbatim(`${erdCheck.name}: ${erdCheck.detail}\n${erdCheck.fix}`));
    write(stamp('ABORTED', { mode }));
    return releasing(1, { reason: 'the ERD does not agree with the specification', phase: 'specification' });
  }
  // Reported when there is one, silent when there is not. A line saying "no ERD supplied" on every
  // run of every CLI project is noise, and the check itself is non-blocking in that case.
  if (erdCheck.blocking) write(verbatim(`erd: ${erdCheck.detail}`));

  // **The operator's additive done-bar** (PLAN item 48). Read here, beside the ERD, for the same
  // reason: this is the first moment the specification exists to check it against.
  //
  // **Additive is structural rather than promised.** These ids are *appended* to the required set,
  // and there is no path by which a `DOD.md` removes one — no suppression key, no waiver, no
  // severity override, nothing that reads a criterion and relaxes anything. It can only make a ship
  // harder, which follows from constitutional supremacy: a done-bar sits beneath the invariants
  // (`CONSTITUTION.md`), so it may only add.
  //
  // **Ownership is deliberately not defaulted.** `assertOwnershipCovers` refuses a run whose panel
  // owns none of these, and that refusal is correct rather than friction: a security criterion
  // silently handed to the correctness auditor because it inherited a default is a criterion judged
  // by the wrong reviewer, and nobody would ever know.
  const dodFile = dodPath(cwd, config.dod);
  /** @type {import('./dod.mjs').DodCriterion[]} */
  const dodCriteria = [];
  if (dodFile !== null) {
    try {
      dodCriteria.push(...parseDod(readFileSync(dodFile, 'utf8')));
    } catch (error) {
      // Fail closed. A done-bar that cannot be read is not a done-bar, and treating it as "no extra
      // criteria" would ship a run the operator believes was held to a bar it never saw.
      write(verbatim(`${path.relative(cwd, dodFile)} could not be read: ${/** @type {Error} */ (error).message}`));
      write(stamp('ABORTED', { mode }));
      return releasing(1, { reason: 'the done-bar could not be read', phase: 'specification' });
    }
    write(verbatim(`done-bar: ${path.relative(cwd, dodFile)}, ${dodCriteria.length} criteria`));
  }

  const requiredIds = [...requiredIdsFor(prd), ...dodIds(dodCriteria)];
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
  // Authored when there is no store *for this specification* (REVIEW F8). The previous run's store
  // is archived with that run, so the ordinary second-run case finds nothing here and authors
  // fresh. The digest check is the independent second proof, for the store somebody put back:
  // held-out cases written for a different objective establish nothing about this one, and the one
  // gate whose entire value is independence must not quietly judge a different specification.
  if (config.oracle.enabled && !oracleMatchesSpecification(meeseeksDir, specification.revision.digest)) {
    if (existsSync(path.join(meeseeksDir, ORACLE_FILE))) {
      write(verbatim('the held-out oracle on disk does not belong to this specification; authoring a fresh one'));
    }
    write(verbatim('authoring held-out acceptance cases from the PRD'));
    // Assembled into a value first so the same bytes are both sent and declared (PLAN item 77). A
    // manifest computed from a second construction of "the prompt" would describe something
    // adjacent to what the child read.
    const oracleTemplate = template('oracle-author.md');
    const oraclePrompt = `${oracleTemplate}\n\n---\n\nPRD.md:\n\n${prd}`;
    const authored = await runChild({
      prompt: oraclePrompt,
      model: config.reviewerModel,
      phase: 'oracle-author',
      effort: config.effort['oracle-author'],
      cwd,
      env,
      // **PRD-only, by construction** (PLAN item 77). The policy refuses the candidate, the builder
      // log, iteration history, workflow synthesis and a panel transcript before the child is
      // spawned: cases authored from the implementation test the implementation, which is the one
      // thing a held-out gate cannot be allowed to do.
      supply: [
        { class: 'template', text: oracleTemplate },
        { class: 'specification', text: prd },
      ],
      specification: specification.revision.digest,
    });
    if (!authored.ok) {
      write(verbatim(`oracle authoring failed: ${authored.raw.slice(0, 800)}`));
      write(stamp('ABORTED', { mode }));
      return releasing(1, { reason: 'oracle authoring failed', phase: 'oracle authoring' });
    }
    // **Charged before it is parsed** (REVIEW F18). The oracle author is a paid `claude -p` child
    // like any other, and its result went from `runChild` straight to the parser without ever
    // reaching `chargePreLoop` — so its tokens and dollars were absent from `alreadySpent`, from
    // every ceiling the loop then checked, and from the final bill. A run could begin below a
    // token ceiling that pre-loop work had already crossed.
    if (chargePreLoop(authored)) {
      preLoopBudgetEnd('oracle authoring');
      return releasing(1, { state: 'BUDGET', reason: 'token ceiling reached during oracle authoring', phase: 'oracle authoring' });
    }
    try {
      const cases = parseOracleCases(authored.text);
      writeOracle(meeseeksDir, cases, { specification: specification.revision.digest });
      write(verbatim(`held out ${cases.length} acceptance case(s); the builder is never shown them`));
    } catch (error) {
      const why = error instanceof OracleError ? error.message : String(error);
      write(verbatim(`oracle authoring returned nothing usable: ${why}`));
      write(stamp('ABORTED', { mode }));
      return releasing(1, { reason: 'oracle authoring returned nothing usable', phase: 'oracle authoring' });
    }
    // The oracle author holds no tools at all (`PHASE_PERMISSIONS`), so the tree it leaves must be
    // the tree it found. Checked here rather than left for the design phase to discover, because a
    // stray file reported against the wrong phase is a wrong answer about who wrote it.
    if (!(await assertWroteNothing('oracle-author'))) {
      write(stamp('ABORTED', { mode }));
      return releasing(1, { reason: 'the oracle author wrote to the tree, which it may not do', phase: 'oracle authoring' });
    }
  }

  // ---- Phase 1: design + quality plugins --------------------------------
  write(verbatim('designing'));
  const designed = await runChild({
    prompt: `${template('architect.md')}\n\n---\n\n${architectGateFragment(gateSummary(cwd, meeseeksDir).gates)}\n\n---\n\nPRD.md:\n\n${prd}`,
    model: config.designModel,
    phase: 'design',
      effort: config.effort['design'],
    cwd,
    env,
  });
  if (!designed.ok) {
    write(verbatim(`design phase failed: ${designed.raw.slice(0, 800)}`));
    write(stamp('ABORTED', { mode }));
    return releasing(1, { reason: 'design phase failed', phase: 'design' });
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
    // **One focused retry before the abort, and the arithmetic is the reason.** The run has
    // already paid for the PRD and the whole design phase — measured at several million tokens —
    // and what failed is one json block at the very end of it, most plausibly a capability name
    // the vocabulary does not contain. Regenerating the entire design to repair a word would
    // spend the phase again; a read-only child that looks at the documents just written and
    // answers with only the block costs a fraction of that.
    //
    // The retry child is `reality-check`-shaped on purpose: `Read`/`Glob`/`Grep` and nothing
    // else, because the declaration is supposed to *describe the design*, and a child that could
    // edit the documents while re-declaring would be repairing the evidence to fit its answer.
    // The parse error travels in the prompt so the child knows exactly what was wrong. A second
    // failure aborts exactly as before — this widens nothing about what is accepted.
    const parseError = /** @type {Error} */ (error).message;
    write(verbatim(`design declaration unreadable, asking once more: ${parseError}`));
    const redeclared = await runChild({
      prompt:
        'The design phase for this repository just completed, but its closing capability declaration ' +
        // Child-authored text entering a driver prompt takes the single-line treatment (R30b):
        // an error message quoting the child's own output could otherwise carry forged lines.
        `could not be parsed: ${neutralizeLine(parseError)}\n\n` +
        'Read the design documents under docs/ and PRD.md, and answer with ONLY a fenced json block ' +
        'declaring what this project is - no prose before or after it.',
      model: config.designModel,
      phase: 'reality-check',
      effort: config.effort['reality-check'],
      cwd,
      env,
    });
    chargePreLoop(redeclared);
    try {
      declaredCapabilities = parseCapabilityDeclaration(redeclared.ok ? redeclared.text : '');
    } catch (secondError) {
      write(
        verbatim(
          `design phase did not say what this project is: ${/** @type {Error} */ (secondError).message}`,
        ),
      );
      write(stamp('ABORTED', { mode }));
      return releasing(1, { reason: 'the design declaration could not be read', phase: 'design' });
    }
  }

  /**
   * The resolved capability set, recomputed and re-recorded on demand.
   *
   * Not cached: `declared` is fixed for the run, but `detected` describes the tree as it is
   * right now and the builder changes the tree every iteration. The manifest is rewritten
   * each time so `.meeseeks/capabilities.json` is a current answer rather than a first one.
   *
   * @returns {string[]}
   */
  /** Capabilities already named as lapsed, so the announcement is made once rather than every gate run. */
  const announcedLapses = new Set();
  // **Whether this run has written the manifest yet** (REVIEW F13, reopened). Held here, in the
  // Driver's own memory, because it is the one place a target cannot reach: the guard denies writes
  // under `.meeseeks/`, but a process outside the tool boundary can still delete the file, and an
  // absent manifest on the first call is honest while an absent one afterwards is lost evidence.
  let capabilityManifestWritten = false;
  const runCapabilities = () => {
    // **Monotonic, and loud when it has to be** (REVIEW F13). The set unions the architect's fixed
    // declaration, the current detection, and everything this run already established — so a
    // builder deleting `index.html` can no longer remove the deterministic gate that judges its UI.
    const resolved = resolveCapabilities({
      root: cwd,
      declared: declaredCapabilities,
      established: establishedCapabilities(meeseeksDir, { expected: capabilityManifestWritten }),
    });
    writeCapabilityManifest(meeseeksDir, resolved);
    capabilityManifestWritten = true;
    for (const capability of resolved.lapsed) {
      if (announcedLapses.has(capability)) continue;
      announcedLapses.add(capability);
      write(
        verbatim(
          `capability ${capability} is no longer detected in this tree but stays armed: a gate this run already ` +
            'established as applicable is not dropped because a marker went away. Remove it deliberately, in the ' +
            'specification, rather than by deleting a file',
        ),
      );
    }
    return resolved.capabilities;
  };
  write(verbatim(`this project is: ${runCapabilities().join(', ')}`));

  // Committed **before** provisioning, which is the other half of F26's repair. The design child's
  // contract is `templates/architect.md`'s output table; the quality-plugin install writes whatever
  // the tools it installs write, and one `git add -A` covering both meant neither had provenance.
  // Two commits, each staging an enumerated list, and only the first one is held to a template.
  if (!(await commitPhase({ phase: 'design', message: 'meeseeks: design documents', template: 'architect.md' }))) {
    write(stamp('ABORTED', { mode }));
    return releasing(1, { reason: 'the design documents could not be committed', phase: 'design' });
  }

  // **A throw here used to escape both the receipt and the lock** (REVIEW F10, reopened). A required
  // plugin that cannot be provisioned ends a paid run, and this sits before the loop's own
  // `try`/`finally`, so the run left no `outcome.json` and gave the repository back only because the
  // process exited. Routed through `releasing` like every other pre-loop exit.
  /** @type {Awaited<ReturnType<typeof installQualityPlugins>>} */
  let provisioning;
  try {
    provisioning = await installQualityPlugins({ cwd, plugins: config.qualityPlugins, runner: shell });
  } catch (error) {
    write(verbatim(/** @type {Error} */ (error).message));
    write(stamp('ABORTED', { mode }));
    return releasing(1, {
      reason: `quality-plugin provisioning failed: ${/** @type {Error} */ (error).message}`.slice(0, 400),
      phase: 'quality-plugins',
    });
  }
  for (const warning of provisioning.warnings) write(verbatim(warning));
  // **The boolean is honoured here too** (REVIEW F26). The PRD and design phases both refuse on a
  // failed `commitPhase`; this one discarded it, so an undeclared neighbour or a failed commit left
  // the provisioning changes uncommitted while the run carried on into the loop — and the next
  // phase's `changedPaths` then reported them against whichever phase happened to look next.
  if (!(await commitPhase({ phase: 'quality-plugins', message: 'meeseeks: provision quality plugins', template: null }))) {
    write(stamp('ABORTED', { mode }));
    return releasing(1, { reason: 'the provisioned quality plugins could not be committed', phase: 'quality-plugins' });
  }

  // ---- Phase 1c: components — driver-delegated sub-runs in worktrees (PLAN item 24) ------
  //
  // Between design and the loop, in declared order, strictly sequentially: each component is a
  // whole nested driver run in a worktree on `meeseeks/component-<name>`, and each one's work is
  // fast-forward-merged into this tree before the next begins — so component two builds on
  // component one, and the loop below gates and cold-reads the merged whole. A component's
  // SHIPPED is a pre-filter exactly as the panel carry is, never a substitute.
  //
  // The `boxed` gate was already enforced beside the tracked-state check; reaching here with
  // components means the operator typed the flag, so a wall clock is armed.
  if (config.components.length > 0) {
    try {
      const runComponent = io.runComponent ?? runComponentDriver;
      // The nested driver is this file, resolved from the module rather than trusted from argv,
      // so a component runs the same build whatever launched the parent.
      const nestedDriver = fileURLToPath(import.meta.url);

      // Self-healing at the start, exactly as races are: cleanup on the way out cannot survive
      // SIGKILL, and `git worktree add` refuses a path git already knows about — one abandoned
      // component would otherwise break every later run of this configuration.
      const swept = await sweepComponentWorktrees({ cwd, run: shell });
      for (const entry of swept.removed) write(verbatim(`component: removed an abandoned worktree at ${entry}`));
      for (const problem of swept.problems) write(verbatim(`component: ${problem}`));

      const componentsParent = path.join(os.tmpdir(), `meeseeks-components-${process.pid}`);
      mkdirSync(componentsParent, { recursive: true });
      // The same shape as a race's cleanup: the containing directory goes on every path out, the
      // failing ones included. `git worktree remove` already emptied it of worktrees; this is the
      // shell of the directory itself.
      try {
        for (const component of config.components) {
          // The parent's armed wall clock, consulted before this component pays for anything:
          // deadlines are otherwise enforced between a run's iterations, so a child overshooting
          // in its own pre-loop would let the phase drift past the clock and the next component
          // would still start — against a remaining allowance of nothing.
          if (config.deadlineMs > 0 && Date.now() - startedAtMs >= config.deadlineMs) {
            throw new ComponentError(
              `component ${component.name}: the run's wall clock expired before this component started; ` +
                'a child would inherit a clock that has already run out',
            );
          }
          // Refused before the worktree exists: the worktree is a checkout of HEAD, so a committed
          // `<dir>/.meeseeks/` — a SHIPPED outcome.json above all — would materialise inside it
          // and be read as this run's verdict for a child that never built anything.
          const trackedState = await checkComponentStateNotTracked({ cwd, run: shell, dir: component.dir });
          if (!trackedState.ok) throw new ComponentError(`component ${component.name}: ${trackedState.detail}`);
          const worktreeDir = path.join(componentsParent, componentWorktreeName(component.name));
          const created = await createComponentWorktree({ cwd, run: shell, name: component.name, dir: worktreeDir });
          if (!created.ok) {
            throw new ComponentError(`component ${component.name}: worktree could not be created: ${created.detail}`);
          }
          try {
            const componentCwd = path.join(worktreeDir, component.dir);
            // The config validator's traversal rejections are string-only, and a builder in an
            // earlier iteration can commit an ordinary symlink that sends `dir` outside the
            // worktree — a nested driver, running with the builder's full permissions, in a tree
            // the operator never named. Resolved twice: the deepest existing ancestor before
            // anything is created, so nothing is ever made outside, and the directory itself
            // after, which is the answer that stands.
            const worktreeReal = realpathSync(worktreeDir);
            const contained = (/** @type {string} */ resolved) =>
              resolved === worktreeReal || resolved.startsWith(worktreeReal + path.sep);
            const escape = () =>
              new ComponentError(
                `component ${component.name}: ${component.dir} resolves outside the component worktree ` +
                  '(a symlink in the tree escapes it); a nested driver may not run in a tree the operator never named',
              );
            let ancestor = componentCwd;
            while (!existsSync(ancestor)) ancestor = path.dirname(ancestor);
            if (!contained(realpathSync(ancestor))) throw escape();
            // A greenfield component's directory may not exist at HEAD yet; a child cannot be
            // spawned into a directory that is not there.
            mkdirSync(componentCwd, { recursive: true });
            if (!contained(realpathSync(componentCwd))) throw escape();
            const childStateDir = path.join(componentCwd, '.meeseeks');
            // Ceilings from this run's remainder, the deadline from its remaining clock, and never
            // a `components` key — the writer refuses one, the belt beside the depth cap's braces.
            writeComponentChildConfig(
              childStateDir,
              componentChildConfig(config, {
                spentTokens: preLoop.tokens,
                spentUsd: preLoop.costUsd,
                elapsedMs: Date.now() - startedAtMs,
                boxDeadlineMs: BOXED_DEADLINE_MS,
              }),
            );
            // Belt beside the tracked-state refusal above: whatever already sits at the outcome
            // path is not this child's receipt, and `readComponentOutcome` cannot tell a stale
            // record from a fresh one.
            rmSync(path.join(childStateDir, OUTCOME_FILE), { force: true });
            write(verbatim(`component ${component.name}: nested driver starting in ${component.dir} on ${created.branch}`));
            const finished = await runComponent({
              driver: nestedDriver,
              spec: component.spec,
              cwd: componentCwd,
              // **The one place a nested run is legitimately authorized** (REVIEW F42). The ticket
              // is issued here, by the Driver that is about to spawn the component, under the flag
              // the operator typed — never in response to anything a child asked for. Its depth is
              // this run's redeemed depth plus one, carried as a trusted local number rather than
              // re-read from the environment, so the child cannot reset the cap after redemption.
              env: authorizedNestingEnv({
                meeseeksDir,
                parentDepth: runDepth,
                env: childEnvironment(env, config.childEnvAllow),
              }),
              onLine: (line) => write(verbatim(`component:${component.name}: ${line}`)),
            });

            // Fail-closed: a component that recorded no outcome did not ship, whatever its exit
            // code claimed. The outcome is read before the worktree is removed, because it lives
            // inside the worktree.
            const outcome = readComponentOutcome(path.join(childStateDir, OUTCOME_FILE));
            if (outcome.ok) {
              // Charged into the same pre-loop total the PRD and design phases use, so `driveRun`
              // seeds its ceilings having paid for every component and the next component's own
              // ceilings shrink by what this one spent. `handedOutUsd` too, for the same reason it
              // exists at all: the next child's in-flight allowance must not ignore real spend.
              preLoop.tokens += outcome.spentTokens;
              preLoop.costUsd += outcome.costUsd;
              handedOutUsd += outcome.costUsd;
            }
            if (!outcome.ok) {
              const exit = finished.code === null ? 'no exit code' : `exit code ${finished.code}`;
              // Whatever a child spent before dying without a receipt is real but unknowable —
              // nothing durable records spend until the outcome is written — so the bill says so
              // rather than silently omitting it.
              throw new ComponentError(
                `component ${component.name}: failed (${exit}): ${outcome.detail}; ` +
                  "anything it spent before dying was never recorded and is missing from this run's bill" +
                  (finished.detail === '' ? '' : `\n${finished.detail}`),
              );
            }
            if (outcome.state !== 'SHIPPED') {
              // Ending the run rather than continuing without the component is the default on
              // purpose; softening it to continue-without is a recorded option, not this code.
              throw new ComponentError(
                `component ${component.name}: ended ${outcome.state}, not SHIPPED. ` +
                  'The parent does not build on a component that did not ship.',
              );
            }
            // The applyWinner machinery, exactly as a race winner lands: `--ff-only`, the dirty
            // tree set aside first, nothing merged that was not gated.
            const merged = await applyWinner({
              cwd,
              run: shell,
              commit: created.branch,
              stashLabel: `set aside before landing component ${component.name}`,
            });
            if (!merged.ok) {
              throw new ComponentError(`component ${component.name}: SHIPPED but could not be merged: ${merged.detail}`);
            }
            write(
              verbatim(
                `component ${component.name}: SHIPPED and merged (${merged.detail}); ` +
                  `${outcome.spentTokens} token(s) and $${outcome.costUsd.toFixed(4)} charged to this run`,
              ),
            );
          } finally {
            // On every path out, the failing ones included — a worktree that outlives its component
            // refuses the next run's `worktree add`. The branch survives as the record of the work.
            const cleaned = await removeWorktrees({ cwd, run: shell, worktrees: [{ index: 1, dir: worktreeDir }] });
            for (const problem of cleaned.problems) write(verbatim(`component ${component.name}: ${problem}`));
          }
        }
      } finally {
        rmSync(componentsParent, { recursive: true, force: true });
      }
    } catch (error) {
      // Expected refusals arrive as ComponentError carrying an operator-facing sentence;
      // anything else — an ENOTDIR from a dir that names a committed file, a git wrapper
      // throwing — is a surprise. Both end the run the same verbatim-then-stamp way
      // (DESIGN.md §9) rather than escaping as a stack trace with no verdict, and both
      // release the lock this phase runs under. The worktree and parent-directory cleanups
      // have already run by here: a throw propagates through their `finally`s.
      const failure = /** @type {Error} */ (error);
      write(verbatim(failure instanceof ComponentError ? failure.message : `${failure.name}: ${failure.message}`));
      write(stamp('ABORTED', { mode }));
      return releasing(1, { reason: 'a component sub-run aborted', phase: 'components' });
    }
  }

  // ---- Phases 2-6: the loop ---------------------------------------------
  // Whatever the resolved toolchain says it writes, not node's two filenames. Hardcoding
  // those meant a toolchain writing anything else produced a report nobody read, and an
  // unread report is indistinguishable from a run in which nothing passed.
  const reportFiles = (/** @type {string} */ dir) =>
    resolveToolchain(dir).toolchain.reports.map((name) => path.join(dir, '.meeseeks', name));

  /**
   * What `clearReports` managed to remove, per gated tree (REVIEW F32).
   *
   * The clear happens in `gateTree` and the collection happens in an effect the loop calls
   * afterwards, so the fact has to survive the gap between them. Keyed by tree because a raced
   * candidate gates in its own worktree against its own report paths, and one candidate's locked
   * file must not withhold the main tree's evidence — or the other way round.
   *
   * A tree with no entry is refused rather than defaulted: no recorded clear is not evidence that
   * the paths were clear.
   *
   * @type {Map<string, import('./reports.mjs').ClearOutcome>}
   */
  const clearOutcomes = new Map();

  /**
   * The immutable subject this iteration's gates and Panel are judging (REVIEW F14).
   *
   * **Before the first snapshot this is the main tree**, because the pre-loop phases — the PRD
   * author, the architect, the oracle author — read a repository that no gate result or verdict is
   * attributed to. From the first iteration on it is a worktree checked out from a content-addressed
   * tree object, and `tree` is that object's name: not a hash somebody computed over a directory,
   * but git's own identity for exactly these bytes.
   *
   * @type {{ dir: string, tree: string | null }}
   */
  let candidate = { dir: cwd, tree: null };
  /**
   * Which declared reports the last collection produced, by name (PLAN item 95).
   *
   * Empty until the first `readTestReports`, which is the conservative reading: with nothing
   * produced, nothing is attributable, and an id with no attributable owner is treated as measured.
   *
   * @type {ReportSources}
   */
  let lastReportSources = { produced: [], missing: [], irregular: [] };
  /**
   * Invocations whose supply record could not be written (REVIEW F22, reopened).
   *
   * In memory because the file the record belongs in is the one that could not be written. Handed to
   * the acceptance receipt, which counts invocations and would otherwise read a shorter ledger as a
   * continuous one.
   *
   * @type {string[]}
   */
  const supplyLapses = [];
  const candidateWorktree = candidateDirFor(process.pid);
  /** Removed on every path out, and swept at the start, exactly as a race's worktrees are. */
  let candidateMaterialized = false;
  const releaseCandidate = async () => {
    if (!candidateMaterialized) return;
    candidateMaterialized = false;
    candidate = { dir: cwd, tree: null };
    const removed = await removeCandidate({ cwd, run: shell, dir: candidateWorktree });
    if (!removed.removed && removed.detail !== '') {
      write(verbatim(`the candidate worktree at ${candidateWorktree} could not be removed: ${removed.detail}`));
    }
  };

  // The target is exposed to the guard only after its ancestors are verified as real directories.
  // Failure is not fatal: no env target means the guard renders every denial in full.
  try {
    env[DENIAL_STATE_ENV] = establishDenialStateDir(cwd);
  } catch (error) {
    write(verbatim(`denial dampening is off for this run: ${/** @type {Error} */ (error).message}`));
  }

  crash.cleanup = releaseCandidate;
  // Self-healing at the start, exactly as races and components are: cleanup on the way out cannot
  // survive `SIGKILL`, and `git worktree add` refuses a path git already knows about. Safe here
  // because the run lock is held, so a registered candidate worktree cannot belong to a live run in
  // this repository.
  const sweptCandidates = await sweepCandidateWorktrees({ cwd, run: shell, timeoutMs: GIT_OPERATION_TIMEOUT_MS });
  for (const entry of sweptCandidates.removed) write(verbatim(`candidate: removed an abandoned worktree at ${entry}`));
  for (const problem of sweptCandidates.problems) write(verbatim(`candidate: ${problem}`));

  const toolchainGates = gateSummary(cwd, meeseeksDir);
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
  const runStartCommit = (await git(['rev-parse', 'HEAD'], { cwd })).stdout.trim();
  writeRunManifest(
    meeseeksDir,
    buildRunManifest({
      startedAt: new Date().toISOString(),
      startCommit: runStartCommit,
      pluginName: 'meeseeks',
      pluginVersion: pluginVersion(),
      config,
      models: {
        builder: config.builderModel,
        reviewer: config.reviewerModel,
        design: config.designModel,
        prd: config.prdModel,
        // No `style` (REVIEW F23). The manifest lists only selectors that can actually choose a
        // child; recording an inert one made two runs look different when nothing about them was.
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
      tools: await toolVersions(shell, cwd),
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
  // The operator diagram, for the described roster. Read here as well as at the executing roster
  // because the two are built at different moments; computing it once and sharing it would tie the
  // brief to whatever the tree looked like when the gates ran, which is a different question.
  const erdForBrief = (() => {
    const file = erdPath(cwd, config.erd);
    if (file === null) return null;
    try {
      return parseErd(readFileSync(file, 'utf8'));
    } catch {
      return null;
    }
  })();
  const describedGates = [
    ...toolchainGates.gates.map((gate) => ({ name: gate.name, text: `${gate.name}: ${gate.command.join(' ')}` })),
    // Every overlay gate, armed or not, annotated rather than omitted — see `overlayGates` for
    // the two live defects that produced this shape, and for why the brief and the roster now
    // disagree only about which gates apply and never about what a gate is.
    ...overlayGates(provisioning.gates, config.extraGates).map((gate) => ({
      name: gate.name,
      text: gate.text,
    })),
    {
      name: 'ci',
      text: 'ci: a workflow under .github/workflows that actually runs build, lint, types, unit and e2e',
    },
    { name: 'docs', text: 'docs: README.md and docs/api-contract.md, neither a stub' },
    {
      name: 'observability',
      // The PORT sentence is the Tallyho smoke's third machine finding: the probe always set PORT
      // and polled its own free port, but nothing ever TOLD the builder, so it hardcoded a port and
      // spent two iterations guessing at an invisible contract. A contract the builder cannot read
      // is indistinguishable from a broken gate.
      text:
        'observability: structured logging in source, and a health endpoint that answers when the app is ' +
        'started. The probe starts the app with PORT set to a free port and polls that port, so the start ' +
        'command must honor the PORT environment variable',
    },
    { name: 'red-evidence', text: 'red-evidence: every newly passing test must have been seen failing first' },
    // **Described wherever it is run, or the two lists disagree about what a gate is.** A gate the
    // builder is judged by and never told about arrives as a bare non-zero exit from an unfamiliar
    // command — the "run and not described" divergence `overlayGates` records paying for. Armed by
    // the same two facts as the executing roster, computed from the same two values.
    ...(erdForBrief === null || config.schemaIntrospect.length === 0
      ? []
      : [
          {
            name: 'schema-conformance',
            text:
              'schema-conformance: every entity, key and column in the declared schema must exist in the live ' +
              'schema once migrations have run. Extra tables and columns are fine; omissions are not',
          },
        ]),
  ];
  const applicableNames = applicableGates(describedGates, briefCapabilities);
  // **The roster, as *names*** (REVIEW F22). `gateNames` below is prose for the builder's brief —
  // "build: npm run build", "e2e: does not apply - ..." — and the first draft of the acceptance
  // receipt used it as the required-gate roster. It refused every run, correctly: a sentence is not
  // a gate name, and no result could ever match one. The roster an acceptance claim is about is the
  // set of gates this project is actually held to.
  const gateRoster = applicableNames.gates.map((gate) => gate.name);
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
   * driver's `.meeseeks`, never from a candidate's, so no candidate can influence what counts
   * as a regression (DESIGN.md §13.6).
   *
   * @param {string} dir the tree being gated, and where its reports are written
   * @param {string} [runStateDir] where **run-owned** gate state lives — the gate cache and the red
   *   evidence. It defaults to the gated tree's own `.meeseeks/`, which is what a raced candidate
   *   needs: a candidate's observations are discarded with its worktree and may not reach the run.
   *   The main candidate passes the Driver's directory instead, because since REVIEW F14 that tree
   *   is a snapshot worktree — so leaving this to default would write the run's ratchet evidence
   *   into a directory that is deleted when the run ends, and `driveRun` reads it from the Driver's.
   * @returns {Promise<{ ok: boolean, results: GateResult[], passing: Set<string>,
   *   identities: GateIdentity[] }>}
   */
  const gateTree = async (dir, runStateDir = path.join(dir, '.meeseeks')) => {
    const treeStateDir = path.join(dir, '.meeseeks');
    // **Before anything runs** (REVIEW F16). The expected report paths are fixed, so a gate that
    // crashes, times out, or fails before writing leaves the *previous* attempt's report on disk
    // and everything downstream reads it as this attempt's evidence — which is how a failed
    // verification gate once confirmed a scoped restore that had not held. Removing them first
    // makes absence mean "this attempt produced nothing" rather than something to infer.
    //
    // **What could not be cleared is remembered, not merely announced** (REVIEW F32). Logging the
    // stuck paths and running the gate anyway is how a surviving old passing report kept earning
    // this attempt's authority: absence means "produced nothing" only for a path the removal
    // actually reached. The outcome is keyed by tree because a raced candidate clears its own.
    const cleared = clearReports(reportFiles(dir));
    clearOutcomes.set(dir, cleared);
    for (const file of cleared.stuck) write(verbatim(`could not clear the previous report at ${path.relative(dir, file)}`));
    // Arming is a question about the code, so it is asked where the code is, every
    // iteration. Resolving it once at provisioning time asked it of a repository holding a
    // PRD and nothing else, so the answer was always "no frontend" and the design gate never
    // armed on a greenfield build (DESIGN.md §5.1).
    //
    // Capabilities come from the main tree, never from a raced candidate's. A candidate must
    // not be able to change which gates it is judged by (DESIGN.md §13.6), and the same
    // argument that keeps the ratchet out of a worktree applies here.
    const capabilities = runCapabilities();
    // The operator diagram this iteration is judged against, read once for the roster and the
    // interpreter together so the gate cannot be armed against a different document from the one
    // whose absence would have disarmed it.
    const erdForGate = (() => {
      const file = erdPath(dir, config.erd);
      if (file === null) return null;
      try {
        return parseErd(readFileSync(file, 'utf8'));
      } catch {
        // Refused before the run started; reaching here with a broken diagram means it was edited
        // mid-run. The gate then does not arm, and `schema-conformance` is absent rather than
        // silently passing — an absent gate is visible in the roster the brief carries.
        return null;
      }
    })();
    armSchemaInterpreter(erdForGate);
    const applicable = applicableGates(
      [
        ...commandGates(dir, treeStateDir),
        // The same overlay the brief describes, filtered here to what is actually armed. The
        // prefixes travel with it, so a brief, a gate line and a reviewer all read a failure in
        // `operator:release-check` as a project invariant rather than a toolchain result — two
        // things debugged very differently. Required like everything else: a declared gate that
        // only warns is a comment.
        //
        // One arming question, since 0.190.0 (REVIEW F13). A gate whose capability is absent is
        // not run and not warned about: it does not apply, which is different from failing.
        ...overlayGates(provisioning.gates, config.extraGates)
          // **No `frontendOnly` any more** (REVIEW F13). It filtered the roster through a fresh
          // `hasFrontend(dir)` on the *current* tree, bypassing the run's capability set entirely —
          // so deleting a marker deleted the gate, with no skipped-gate record and no memory that it
          // had ever applied. `impeccable` is armed by `web-ui` like every other conditional gate,
          // and that set is monotonic for the run.
          .filter((gate) => gate.capability === undefined || capabilities.includes(/** @type {any} */ (gate.capability)))
          .map((gate) => ({
            name: gate.name,
            command: gate.command,
            required: true,
            ...(gate.interpret === undefined ? {} : { interpret: gate.interpret }),
          })),
        // **`schema-conformance`, armed by two facts rather than one** (item 47 slice C, §3.6.1).
        // An ERD must be supplied *and* the operator must have declared how to read the live
        // schema; either alone arms nothing. That is not a softening — an ERD supplied with no
        // introspection is refused before the run starts, so reaching here without one means there
        // was no ERD, and there is nothing to conform to.
        //
        // Not capability-gated on `persistent-storage`. Detection answers about the tree as it is
        // *now*, and on iteration 1 of a greenfield run there is no database yet, so a capability
        // filter would disarm the gate for exactly the run that most needs it and re-arm it only
        // once the builder happened to create one. The ERD is the operator's declaration that this
        // target persists data, and a declaration does not evaporate.
        ...(erdForGate === null || config.schemaIntrospect.length === 0
          ? []
          : [
              {
                name: 'schema-conformance',
                command: config.schemaIntrospect,
                required: true,
                interpret: /** @type {const} */ ('schema-conformance'),
              },
            ]),
      ],
      capabilities,
    );
    for (const skip of applicable.skipped) write(verbatim(`gate ${skip.name} does not apply: ${skip.reason}`));
    const browsers = await ensurePlaywrightBrowsers({ cwd: dir, meeseeksDir: treeStateDir, run: shell, capabilities });
    if (browsers.installed) write(verbatim(browsers.detail));

    // ---- gate-skip on an unchanged workspace (R35, DESIGN.md §4) --------
    // A deterministic gate that failed last iteration on a byte-identical source tree will fail
    // again identically, so re-running it spends tokens and minutes to re-learn a known fact. The
    // hash is git's own view of the working tree, and it is `null` on any uncertainty — a failed
    // `git ls-files`, an unreadable file — in which case nothing is skipped and every gate runs.
    // A skip only ever carries a prior FAILURE, so a skipped iteration is red by construction and
    // can never be a ship candidate. See `gate-cache.mjs` for the four safety rules.
    const currentHash = await workspaceHash({ cwd: dir, run: shell });
    const gateCache = loadGateCache(runStateDir);
    const plan = planGateRun({ gates: applicable.gates, cache: gateCache, currentHash });
    for (const carried of plan.skipped) {
      // Visible, per §3.8: a gate that vanished from the run reads exactly like one that was never
      // there. The attempt count and the reason travel with the line so a transcript reader sees
      // both why it was skipped and that the failure is still counting against the run.
      write(
        verbatim(
          `gate ${carried.name} skipped: workspace byte-identical since its last failure; carrying that ` +
            `failure forward without re-running (attempt ${carried.attempts})`,
        ),
      );
    }
    const ran = await runGates(plan.toRun, { cwd: dir, run: shell, timeoutMs: config.gateTimeoutMs });
    // Persist the cache from the first pass only: failures recorded, passes cleared, carries
    // incremented. The second pass's gates are not skippable, so they never enter the cache.
    saveGateCache(runStateDir, updateGateCache({ cache: gateCache, currentHash, ranResults: ran.results, skipped: plan.skipped }));
    // The carried failures rejoin the run as failed results, so downstream sees no difference
    // between a freshly-failed gate and a carried one except the annotation — and the run stays
    // red on them exactly as it would have.
    const carriedResults = plan.skipped.map((carried) => ({
      name: carried.name,
      ok: false,
      status: carried.status,
      detail:
        `${carried.detail}\n\n(carried unchanged from the previous iteration: the source tree is byte-identical, so ` +
        `this gate was not re-run. Attempt ${carried.attempts}.)`,
    }));
    // Merged back into the original gate order, so the brief and the log read in the order the
    // architect declared rather than run-then-skipped. A gate is run XOR carried, and gate names
    // are unique, so no name may appear twice here. If one does — a future un-prefixed operator
    // gate colliding with a toolchain gate, or a gate both run and carried — a name-keyed
    // last-wins merge could silently drop a *failure* and turn "still failing" into "passed". That
    // is the one silent pass this optimisation could open, so it is refused rather than collapsed.
    /** @type {Map<string, GateResult>} */
    const resultByName = new Map();
    for (const result of /** @type {GateResult[]} */ ([...ran.results, ...carriedResults])) {
      if (resultByName.has(result.name)) {
        throw new Error(
          `gate ${result.name} produced two results in one iteration (run and carried, or a duplicate gate ` +
            'name); refusing to merge, because a name-keyed merge could hide a failing gate.',
        );
      }
      resultByName.set(result.name, result);
    }
    /** @type {GateResult[]} */
    const mergedResults = [];
    for (const gate of applicable.gates) {
      const result = resultByName.get(gate.name);
      if (result !== undefined) mergedResults.push(result);
    }
    const commandResults = { ok: mergedResults.every((result) => result.ok), results: mergedResults };

    // ---- the conditional second pass (DESIGN.md §4.4) -------------------
    // Only when every gate in the first pass passed. A failure above costs nothing extra,
    // which is the whole of the ordering change: mutation testing is slow, and running it on
    // an iteration that does not compile spends minutes to learn what `build` already said.
    if (commandResults.ok) {
      // `undefined` when there is no ratchet-advancing commit yet, rather than the empty list
      // `changedSince` would return. The consuming gate declines either way and the two reasons
      // it gives are different sentences, because "I have no baseline" and "nothing changed" are
      // different facts — see the mutation entry in `toolchains/node.mjs`.
      const lastGood = loadState(meeseeksDir).lastGoodCommit;
      const changedFiles = lastGood === null ? undefined : await changedSince({ cwd: dir, since: lastGood, run: shell });
      writeMutationConfig(treeStateDir);
      const second = conditionalCommandGates(dir, treeStateDir, changedFiles);
      for (const skip of second.skipped) write(verbatim(`gate ${skip.name} declined: ${skip.reason}`));
      const secondApplicable = applicableGates(second.gates, capabilities);
      for (const skip of secondApplicable.skipped) {
        write(verbatim(`gate ${skip.name} does not apply: ${skip.reason}`));
      }
      const secondResults = await runGates(secondApplicable.gates, { cwd: dir, run: shell, timeoutMs: config.gateTimeoutMs });
      commandResults.results.push(...secondResults.results);
      commandResults.ok = secondResults.ok;
    }

    const previousPassing = loadState(meeseeksDir).passing;

    // **The refusal, before any report-consuming authority is assigned** (REVIEW F32). What follows
    // records red evidence and decides what this tree may be credited with, and both are
    // authorities. `recordRedEvidence` is the sharper of the two: it writes the baseline **exactly
    // once**, so establishing it from a refused attempt would freeze an empty baseline for the
    // whole project and leave every later id permanently unproven — a gate the builder could not
    // satisfy. So on a stuck path nothing here runs at all, rather than running on empty inputs.
    //
    // **Read through `collectReports`, which used to be the one thing this did not do.** This was a
    // hand-rolled second reader over the same paths — `existsSync` plus `readFileSync`, which
    // *follows a symlink* — so a symlinked report path was refused by `readTestReports` and read
    // here, in the same attempt, by the authority that writes red evidence. Two readers of one
    // artifact will eventually disagree; the fix is to stop having two.
    const collected = collectReports(reportFiles(dir), cleared);
    const freshness = reportFreshnessGateResult(collected.uncleared, dir);

    /** @type {Set<string>} */
    const passing = new Set();
    /** @type {Set<string>} */
    const failed = new Set();
    /** @type {Set<string>} */
    const skipped = new Set();
    for (const report of collected.contents) {
      try {
        for (const test of parseReport(report, { rootDir: dir }).tests) {
          // **Three outcomes, not two** (REVIEW F17). This collapsed everything that was not
          // `passed` into one set and handed it to `recordRedEvidence` as *observed failing* — so a
          // **skipped** test was recorded as red evidence. That inverts the deterrent: a builder
          // could write `it.skip`, let one gate run bank the id as "seen red", then un-skip it and
          // collect ratchet credit for a test nothing ever watched fail. The same one entry also
          // satisfies `suiteSensitivityEvidence`, whose `seenFailing.size > 0` branch is a **ship**
          // gate — so a single skip could stand in for the proof that this suite can go red at all.
          //
          // `flaky` stays evidence, deliberately: a retried test really did fail on an attempt, and
          // F30 already refuses to count it as *passing*. A skip is the one outcome that observed
          // nothing.
          if (test.status === 'passed') passing.add(test.id);
          else if (test.status === 'skipped') skipped.add(test.id);
          else failed.add(test.id);
        }
      } catch {
        // The ratchet reports this failure itself; the gate does not need to guess.
      }
    }
    if (skipped.size > 0) {
      write(
        verbatim(
          `${skipped.size} test(s) were skipped and earn no red evidence: a test nobody ran was not ` +
            'observed failing',
        ),
      );
    }
    // Passing ids are handed over too, because the first gating of a project has to record
    // what it found as a baseline: those tests have no "before" to have been red in.
    // `dir` is handed over so every observation is stamped with the bytes it was made under
    // (REVIEW F17). Without it the evidence records no digest, which later reads as unproven.
    const red = freshness === null ? recordRedEvidence(runStateDir, failed, [...passing], dir) : null;
    // **Which of these ids are still protected by the bytes that earned them** (REVIEW F17). A
    // changed defining file stops history vouching for its ids: they must be observed failing again
    // before they earn current credit. They stay in `passing` and are never a regression.
    const rewritten = changedDefinitions(passing, dir, loadState(meeseeksDir).definitions);
    const evidence =
      red === null
        ? null
        : {
            previousPassing,
            passing,
            redSeen: red.seenFailing,
            baseline: red.baseline,
            changedDefinitions: rewritten,
            // The gate reports exactly what the ratchet withholds, so it needs the same scoping.
            staleEvidence: changedDefinitions(passing, dir, red.definitions),
          };
    const results = [
      // First, because it invalidates everything after it: a reader scanning the failures needs to
      // see that this attempt's evidence was withheld before reading gates judged without it.
      ...(freshness === null ? [] : [freshness]),
      ...commandResults.results,
      // The static gates are filtered by the same table as the command gates. `observability`
      // is the one that moves: a CLI has no health endpoint to answer, and the gate was
      // failing it for not having one.
      //
      // `ci` stays universal — the validation set has to run somewhere — but *which* steps it
      // demands is filtered by the same capabilities, which is why they are passed in as well
      // as applied outside. Without that, a browserless project could not satisfy `ci` at all.
      ...applicableGates(
        await staticGates(dir, {
          run: shell,
          capabilities,
          meeseeksDir: treeStateDir,
          oracle: config.oracle.enabled,
          // Threaded so the held-out gate can refuse cases written from another PRD rather than
          // reporting a clean pass over them (REVIEW F8).
          specification: specification.revision.digest,
        }),
        capabilities,
      ).gates,
      // Judged only where there is evidence to judge. A red-evidence verdict over a refused
      // attempt would be a verdict about nothing, and `report-freshness` has already failed.
      ...(evidence === null ? [] : [redEvidenceGate(evidence)]),
    ];
    // Withheld rather than blocked. An unproven test earns no protection from the ratchet,
    // which is the deterrent §8 always described; failing the iteration on it deadlocked the
    // run instead, because the evidence it demanded could not be produced.
    const unproven = evidence === null ? /** @type {Set<string>} */ (new Set()) : unprovenIds(evidence);
    const credited = new Set([...passing].filter((id) => !unproven.has(id)));
    // **What each result actually was** (REVIEW F22, PLAN item 126). A receipt carrying `name`, `ok`,
    // `status` and a digest of the detail cannot support the clean-clone reconstruction F22 asks for:
    // it does not say which command produced the result, on which attempt, or which report bytes
    // belong to it. The argv is digested rather than quoted for the reason the detail is — it is
    // target-influenced text — and a static gate has no argv, which is recorded as the fact it is
    // rather than as an empty string standing in for one.
    const owners = resolveToolchain(dir).toolchain.reportOwners ?? {};
    /** @type {Map<string, string[]>} */
    const ownedReports = new Map();
    for (const [report, operation] of Object.entries(owners)) {
      ownedReports.set(operation, [...(ownedReports.get(operation) ?? []), report]);
    }
    /** @type {Map<string, string[]>} */
    const argvByName = new Map();
    for (const gate of [...applicable.gates, ...plan.toRun]) argvByName.set(gate.name, gate.command);
    /** @type {GateIdentity[]} */
    const identities = results.map((result) => ({
      name: result.name,
      command: argvByName.get(result.name) ?? [],
      // Only reports this gate is *declared* to write. A gate that owns none owns none; the receipt
      // must not attribute a digest to something that never wrote it.
      reports: ownedReports.get(result.name) ?? [],
    }));
    return { ok: results.every((result) => result.ok), results, passing: credited, identities };
  };

  /**
   * Which files this iteration touched, committed or not.
   *
   * Used only as evidence for whether two repair attempts were materially different
   * (`lessons.mjs`). A gate-failing iteration has not committed anything yet, so the
   * uncommitted answer is the true one; a committed iteration has a clean tree, so the last
   * commit is.
   *
   * @returns {Promise<string[]>}
   */
  const changedFiles = async () => {
    const dirty = (await git(['diff', '--name-only', 'HEAD'], { cwd })).stdout.split('\n').filter(Boolean);
    const untracked = (await git(['ls-files', '--others', '--exclude-standard'], { cwd })).stdout
      .split('\n')
      .filter(Boolean);
    if (dirty.length > 0 || untracked.length > 0) return [...new Set([...dirty, ...untracked])].sort();
    return (await git(['diff', '--name-only', 'HEAD~1', 'HEAD'], { cwd })).stdout.split('\n').filter(Boolean).sort();
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
   * @returns {Promise<RaceOutcome>}
   */
  const runRace = async (objective, iteration, baselineShare = 1) => {
    const base = (await git(['rev-parse', 'HEAD'], { cwd })).stdout.trim();
    const parentDir = path.join(os.tmpdir(), `meeseeks-race-${process.pid}-${iteration}`);
    mkdirSync(parentDir, { recursive: true });
    // Before creating anything, clear whatever a killed race left registered. Cleanup on the
    // way out cannot cover `-9`, and `git worktree add` refuses a path git already knows about,
    // so without this one abandoned race breaks every later race in the repository.
    const swept = await sweepRaceWorktrees({ cwd, run: shell });
    for (const entry of swept.removed) write(verbatim(`race: removed an abandoned worktree at ${entry}`));
    for (const problem of swept.problems) write(verbatim(`race: ${problem}`));
    const created = await createWorktrees({ cwd, run: shell, n: config.race.n, base, parentDir });
    for (const problem of created.problems) write(verbatim(problem));

    let tokens = 0;
    let costUsd = 0;
    try {
      if (created.worktrees.length === 0) {
        return { applied: false, detail: 'no worktree could be created; the ordinary path continues', tokens, costUsd };
      }

      const ratchetPassing = loadState(meeseeksDir).passing;
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
        writeBrief(meeseeksDir, iteration, candidateBrief, worktree.index);

        const candidateSystem = builderSystemPrompt(cwd);
        const built = await runChild({
          prompt: candidateBrief,
          model: config.builderModel,
          systemPrompt: candidateSystem,
          phase: 'builder',
      effort: config.effort['builder'],
          cwd: worktree.dir,
          env,
          // The builder is not cold, and its policy says so: it keeps its own log and history, and
          // is refused only the held-out cases and the panel's reasoning about them. A builder that
          // can read the cases can satisfy them without satisfying the requirement.
          supply: [
            { class: 'system-prompt', text: candidateSystem },
            { class: 'brief', text: candidateBrief },
          ],
          specification: specification.revision.digest,
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

        await git(['add', '-A'], { cwd: worktree.dir });
        await git(['commit', '--no-verify', '-m', `meeseeks: race candidate ${worktree.index} (iteration ${iteration})`], {
          cwd: worktree.dir,
        });
        const commit = (await git(['rev-parse', 'HEAD'], { cwd: worktree.dir })).stdout.trim();
        const gated = await gateTree(worktree.dir);
        candidates.push({
          ...worktree,
          commit: commit === base ? null : commit,
          gates: gated.results,
          regressions: ratchetPassing.filter((id) => !gated.passing.has(id)),
          ...parseNumstat((await git(['diff', '--numstat', `${base}..HEAD`], { cwd: worktree.dir })).stdout),
        });
      }

      const selection = selectWinner(candidates, baselineShare);
      if (selection.winner === null || selection.winner.commit === null) {
        return { applied: false, detail: selection.reason, tokens, costUsd };
      }
      const merged = await applyWinner({ cwd, run: shell, commit: selection.winner.commit });
      return { applied: merged.ok, detail: `${selection.reason}; ${merged.detail}`, tokens, costUsd };
    } finally {
      const cleaned = await removeWorktrees({ cwd, run: shell, worktrees: created.worktrees });
      for (const problem of cleaned.problems) write(verbatim(problem));
      // The candidates' clear records go with their worktrees. Keeping them would grow the map for
      // the length of the run and leave entries naming directories that no longer exist.
      for (const worktree of created.worktrees) clearOutcomes.delete(worktree.dir);
      rmSync(parentDir, { recursive: true, force: true });
    }
  };

  /** @type {RunOutcome} */
  let outcome;
  // Everything after this belongs to the loop, including the lines that report its result. The
  // handler below catches the loop's own throws; this only keeps `main`'s backstop from labelling
  // a late crash with a phase the run had already left.
  crash.phase = 'loop';
  try {
    outcome = await driveRun({
    receipt: outcomeWritten,
    config,
    meeseeksDir,
    rootDir: cwd,
    requiredIds,
    gateNames,
    alreadySpent: preLoop,
    // **The four facts the loop cannot observe** (REVIEW F22). Each is already established here, at
    // the launch boundary, so the acceptance receipt records what this run was actually held to
    // rather than re-deriving it later against a tree that has since moved. The CLI is the one the
    // *children* were spawned with — a plugin version with no CLI identity beside it cannot explain
    // a result that depended on both.
    gateRoster,
    identities: {
      plugin: pluginVersion(),
      cli: (await toolVersions(shell, cwd)).claude ?? '',
      specification: specification.revision.digest,
      config: configHash(config),
    },
    task: firstIterationTask(unitGateCommand(cwd, meeseeksDir)),
    // The same command, threaded so the `no-tests` objective names what the gate actually runs
    // rather than a Node-shaped guess. Three places state this contract; all three now derive it.
    unitCommand: unitGateCommand(cwd, meeseeksDir),
    effects: {
      build: (brief) => {
        const builderSystem = builderSystemPrompt(cwd);
        return runChild({
          prompt: brief,
          model: config.builderModel,
          systemPrompt: builderSystem,
          phase: 'builder',
      effort: config.effort['builder'],
          cwd,
          env,
          supply: [
            { class: 'system-prompt', text: builderSystem },
            { class: 'brief', text: brief },
          ],
          specification: specification.revision.digest,
        });
      },
      // Reads one file from the tree for pin re-verification. Returns null rather than
      // throwing on a missing file, because "the file is gone" is an answer the caller has a
      // rule for and an exception is not.
      readSource: (file) => {
        try {
          // Bounded (REVIEW F19, reopened). A pin's source file is reread to re-verify the pin, so
          // it is decision-bearing and target-controlled — the same class as a report.
          return readBounded(path.join(cwd, file), READ_LIMITS.evidence);
        } catch {
          return null;
        }
      },
      // One cold child, one element, three possible answers and nothing else. Scoped this
      // tightly because the alternative to asking is a hard reset on a formatter run, and
      // because a broad question here would re-audit the repository at panel prices every
      // time somebody reindented a file.
      securityEscalation: (pin) => {
        const escalation = renderTemplate('security-escalation.md', { evidence: pin.evidence, snippet: pin.snippet });
        return runChild({
          prompt: escalation,
          model: config.reviewerModel,
          phase: 'security-escalation',
      effort: config.effort['security-escalation'],
          cwd,
          env,
          // **Scope is the safety property here** (PLAN item 77). One narrow question about one
          // element; the policy refuses the builder log, iteration history, the held-out cases and a
          // panel transcript, because a scoped question answered from the whole run is not a scoped
          // question — and the alternative to asking is a hard reset on a formatter run.
          supply: [{ class: 'candidate-evidence', text: escalation }],
          specification: specification.revision.digest,
        });
      },
      // Re-read per call rather than captured once, because the builder appends to it between
      // iterations and a stale copy would show the panel an older run's reasoning.
      review: (reviewer, ids) => {
        // **The panel is handed the specification, not a path to it** (REVIEW F12, reopened);
        // `reviewerBrief` carries the reasoning. Assembled into a value first so the same bytes are
        // both sent and declared (PLAN item 77) — a manifest computed from a second construction of
        // "the prompt" would describe something adjacent to what the reviewer read.
        const delivered = {
          file: specification.revision.file,
          digest: specification.revision.digest,
          contents: specification.contents,
        };
        const canonicalSpecification = canonicalSpecificationBlock(delivered);
        const brief = reviewerBrief({
          reviewer,
          panelSize: config.reviewers.length,
          ids,
          specification: delivered,
          assumptions: (() => {
            try {
              return renderAssumptions(readAssumptions(meeseeksDir).entries);
            } catch (error) {
              // Degrades like the lesson store, not like the ratchet. This is context for a reviewer
              // whose verdict already defaults to fail, so losing it costs information rather than
              // correctness, and a corrupt hint file must not kill a healthy run.
              write(verbatim(`assumptions log unreadable, continuing without it: ${/** @type {Error} */ (error).message}`));
              return '';
            }
          })(),
        });
        const reviewerSystem = template('reviewer-system.md');
        return runChild({
          prompt: brief,
          model: config.reviewerModel,
          systemPrompt: reviewerSystem,
          phase: 'review',
      effort: config.effort['review'],
          cwd,
          env,
          // **The cold panel declares what it was handed** (PLAN item 77). Independence here rests
          // on `not supplied`, and a discipline with no record is one a refactor breaks while the
          // template tests stay green. The policy refuses builder logs, iteration history, workflow
          // synthesis, a previous panel's transcript and the held-out cases *before* the child is
          // spawned — a cold role that has already read something cannot unread it.
          supply: [
            { class: 'system-prompt', text: reviewerSystem },
            { class: 'specification', text: canonicalSpecification },
            { class: 'brief', text: brief },
          ],
          specification: specification.revision.digest,
        });
      },
      realityCheck: () => {
        // Handed the same canonical bytes, for the same reason (REVIEW F12, reopened).
        const prompt = realityCheckPrompt({
          file: specification.revision.file,
          digest: specification.revision.digest,
          contents: specification.contents,
        });
        return runChild({
          prompt,
          model: config.reviewerModel,
          phase: 'reality-check',
          effort: config.effort['reality-check'],
          cwd,
          env,
          supply: [{ class: 'specification', text: prompt }],
          specification: specification.revision.digest,
        });
      },
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
      journal,
      /**
       * The operator done-bar this run is held to (PLAN item 48).
       *
       * Closed over the criteria parsed once in `main` rather than re-read here, unlike the ERD. The
       * difference is deliberate: the ERD only informs the brief and a gate, so a mid-run correction
       * is harmless, while these ids are already in the panel required set. Re-reading would let the
       * brief describe a bar the panel is not judging.
       *
       * @returns {import('./dod.mjs').DodCriterion[]}
       */
      dod: () => dodCriteria,
      /**
       * The operator's ERD, parsed, or `null` when there is none (PLAN item 47, slice D).
       *
       * Read once per iteration rather than cached for the run, for the same reason capabilities
       * are re-detected: the tree changes underneath, and an operator who corrects a diagram
       * mid-run should not be answered with the one preflight happened to see.
       *
       * Returns `null` on a parse failure rather than throwing, and that is not a swallow —
       * preflight has already refused an unreadable ERD before any child ran, so reaching this with
       * a broken diagram means the operator edited it *during* the run. Failing the iteration for
       * that would destroy work over a file the gate will refuse anyway; the brief simply carries
       * no schema, and `schema-conformance` is the thing that says so.
       */
      erd: () => {
        const file = erdPath(cwd, config.erd);
        if (file === null) return null;
        try {
          return parseErd(readFileSync(file, 'utf8'));
        } catch {
          return null;
        }
      },
      // Selected by *detected* toolchain rather than by anything declared, so the guidance
      // matches the commands the gates will actually run.
      toolchainGuidance: () => {
        const resolved = resolveToolchain(cwd);
        // **The loudest of the three channels that told case C's builder to write Node.** The
        // evidence string and the gate list are one line each; this is a whole page of "here is
        // how you build with npm, vitest and playwright", and a builder handed that writes Node
        // whatever the PRD says. When nothing was detected there is no stack to give guidance
        // about, so it gets guidance about *that* instead.
        const name = resolved.toolchain.name;
        return {
          name,
          guidance: resolved.detected ? toolchainGuidance(name) : toolchainGuidance('undetected'),
        };
      },
      history: (findings) => historyContext({ cwd, run: shell, findings, greenfield }),
      changedFiles,
      gates: async () => {
        const gated = await gateTree(candidate.dir, meeseeksDir);
        return { ok: gated.ok, results: gated.results, identities: gated.identities };
      },
      /**
       * Materialize this iteration's candidate and make it the subject (REVIEW F14).
       *
       * Called by the loop after the builder and before the gates. Everything that *judges* — the
       * deterministic gates, the reports they write, the Panel, evidence resolution, the agent
       * surface scan — reads the worktree this returns. Everything that *repairs* the run — the
       * ratchet's reset, the scoped restore, the commit — stays on the main tree, because that is
       * the tree the operator owns and the one a commit publishes.
       *
       * @param {number} iteration
       * @returns {Promise<{ ok: boolean, dir: string, tree: string | null, detail: string }>}
       */
      snapshotCandidate: async (iteration) => {
        const made = await materializeCandidate({
          cwd,
          run: shell,
          dir: candidateWorktree,
          iteration,
          timeoutMs: GIT_OPERATION_TIMEOUT_MS,
        });
        if (!made.ok) return { ok: false, dir: cwd, tree: null, detail: made.detail };
        candidateMaterialized = true;
        const shared = shareToolCaches({ cwd, dir: made.dir, caches: TOOL_CACHE_PATHS });
        for (const problem of shared.problems) write(verbatim(`candidate: ${problem}`));
        candidate = { dir: made.dir, tree: made.tree };
        return { ok: true, dir: made.dir, tree: made.tree, detail: '' };
      },
      /** The directory the loop must resolve evidence, test definitions and the agent scan against. */
      candidateSubject: () => candidate.dir,
      // **The candidate, like every other deterministic gate** (REVIEW F14). This is a ship gate: its
      // answer decides whether a passing panel becomes a `SHIPPED`, so it must judge the same bytes
      // the panel judged. Pointing it at the snapshot also means the mutants it writes land in a
      // worktree that is deleted at the end of the run rather than in the operator's tree.
      shipTimeMutation: () =>
        shipTimeMutation(candidate.dir, path.join(candidate.dir, '.meeseeks'), runStartCommit, config.gateTimeoutMs),
      // The captured revision, re-read from `.meeseeks/` each time rather than closed over. The
      // record lives where the run may not edit it, and reading it back is what makes the check a
      // check rather than a memory of one.
      checkSpecification: () => verifySpecification({ meeseeksDir, root: cwd }),
      // The candidate's bytes, from git's own view of the working tree (REVIEW F14). The gate cache
      // already needed exactly this pair — tracked plus untracked-not-ignored, hashed from real
      // bytes — so the identity a verdict is sealed to is the one the repository already trusts to
      // decide whether a deterministic gate may be skipped.
      workspaceIdentity: async () => {
        // **Git's own name for the bytes, not a hash somebody computed over a directory** (REVIEW
        // F14). The seal is now an equality between two tree objects: the candidate the Panel judged
        // and the main working tree about to be committed. `workspaceHash` covered the same file set
        // and is still what the gate cache keys on, but a content-addressed object identifier is the
        // thing a commit is *made of*, so the post-commit proof is the same value read back from
        // `HEAD` rather than a second measurement of it.
        const gitDir = await resolveGitDir({ cwd, run: shell });
        if (gitDir === null) return null;
        const written = await writeSnapshotTree({ cwd, run: shell, gitDir, timeoutMs: GIT_OPERATION_TIMEOUT_MS });
        return written.ok ? written.tree : null;
      },
      /**
       * Is the working tree still the candidate the Panel judged, and did the commit land it?
       *
       * @param {string} tree
       * @returns {Promise<{ ok: boolean, tree: string | null, detail: string }>}
       */
      candidateStillHolds: (tree) =>
        workingTreeMatchesCandidate({ cwd, run: shell, tree, timeoutMs: GIT_OPERATION_TIMEOUT_MS }),
      /**
       * The tree object `HEAD` names, for proving a commit landed the reviewed bytes.
       *
       * @returns {Promise<string | null>}
       */
      committedTree: async () => {
        const shown = await git(['rev-parse', 'HEAD^{tree}'], { cwd });
        const tree = shown.stdout.trim();
        return shown.ok && /^[0-9a-f]{40,64}$/.test(tree) ? tree : null;
      },
      // Only what this attempt produced, and only from regular files (REVIEW F16, F32). `gateTree`
      // cleared these paths before the gates ran, so a path that is here now was written by the
      // attempt just finished — **for every path the clear actually reached**, which is why the
      // clear's outcome is required below rather than assumed. One that is a directory or a symlink
      // is refused rather than read, because reading whatever it resolves to would be guessing.
      readTestReports: () => {
        // Fail-closed on a tree nothing cleared (REVIEW F32). Every call site runs after
        // `effects.gates()`, so the entry is always there in practice; the throw exists for the
        // ordering somebody changes later, and the loop reads it as an unreadable report, which is
        // the correct reading — the reports cannot be attributed to an attempt that never began.
        const cleared = clearOutcomes.get(candidate.dir);
        if (cleared === undefined) {
          throw new DriverError(
            'the declared report paths were never cleared for this attempt, so nothing found at them can be read ' +
              "as this attempt's evidence",
          );
        }
        const collected = collectReports(reportFiles(candidate.dir), cleared);
        // Named, not merely withheld. The gate result carries this to the builder; this line
        // carries it to the operator, who is the only one who can go and free the file.
        if (collected.uncleared.length > 0) {
          write(
            verbatim(
              `refusing every test report this attempt: ${collected.uncleared
                .map((file) => path.relative(candidate.dir, file))
                .join(', ')} could not be cleared before the gates ran, so what is there now may be the previous ` +
                "attempt's",
            ),
          );
        }
        for (const file of collected.irregular) {
          write(verbatim(`ignoring ${path.relative(cwd, file)}: a report path that is not a regular file is not a report`));
        }
        // **Which declared reports this attempt actually produced** (PLAN item 95). Stashed here
        // rather than recomputed by a second effect, because a second `collectReports` would read
        // the files again and could disagree with the one the loop is about to parse — and the
        // whole mechanism turns on the two agreeing. `contents` and `produced` are built in
        // lockstep by `collectReports`, so index *i* of what this returns is index *i* of that.
        lastReportSources = {
          produced: collected.produced.map((file) => path.basename(file)),
          missing: collected.missing.map((file) => path.basename(file)),
          irregular: collected.irregular.map((file) => path.basename(file)),
        };
        return collected.contents;
      },
      /** What the last `readTestReports` collected, by report name. @returns {ReportSources} */
      readReportSources: () => lastReportSources,
      /** Invocations whose supply record could not be written (REVIEW F22). @returns {string[]} */
      supplyLapses: () => [...supplyLapses],
      commit: async (message) => {
        // Re-asserted here rather than once before the loop: a hard reset can land on a
        // commit that predates the stanza, which would quietly un-ignore the ratchet and
        // start committing it again.
        ensureMeeseeksIgnored(cwd);
        // **Every step is required to succeed** (REVIEW F31). All three used to run unchecked, and
        // the sha was then read from `rev-parse` whatever had happened — so a commit that failed
        // after staging returned the *previous* commit as this iteration's candidate. The working
        // bytes still matched F14's seal, because the seal hashes the working tree, and deploy and
        // tag then published an older tree under a `SHIPPED`.
        const added = await git(['add', '-A'], { cwd });
        if (!added.ok) throw new DriverError(`git add failed: ${(added.stderr || added.stdout).trim().slice(0, 400)}`);
        // Distinguished from a failure rather than inferred from one: `git commit` exits non-zero
        // when there is nothing staged, which is an ordinary iteration in which the builder changed
        // nothing, not a fault. Asking git what is staged answers the two apart.
        const staged = await git(['diff', '--cached', '--name-only'], { cwd });
        if (!staged.ok) {
          throw new DriverError(`git could not list the staged changes: ${(staged.stderr || '').trim().slice(0, 400)}`);
        }
        if (staged.stdout.trim() !== '') {
          const committed = await git(['commit', '--no-verify', '-m', message], { cwd });
          if (!committed.ok) {
            throw new DriverError(
              `git commit failed: ${(committed.stderr || committed.stdout).trim().slice(0, 400)}. ` +
                'Nothing may be published on a commit that did not happen',
            );
          }
        }
        const head = await git(['rev-parse', 'HEAD'], { cwd });
        const sha = head.stdout.trim();
        if (!head.ok || !/^[0-9a-f]{7,}$/.test(sha)) {
          throw new DriverError(`git could not name HEAD after committing: ${(head.stderr || '').trim().slice(0, 400)}`);
        }
        return sha;
      },
      // What publication may assert about the tree (REVIEW F31). The seal hashes the *working*
      // tree; this asks git whether that tree is what is actually committed. A clean worktree after
      // a commit is the evidence that the reviewed bytes are in the commit rather than beside it.
      verifyPublication: async () => {
        const head = await git(['rev-parse', 'HEAD'], { cwd });
        if (!head.ok || !/^[0-9a-f]{7,}$/.test(head.stdout.trim())) {
          return { ok: false, detail: 'git could not name HEAD, so nothing can be said about what would be published' };
        }
        // Reported, not just validated (REVIEW F38): the caller re-runs this after the deploy and
        // has to compare `HEAD` against the commit it verified, which it cannot do from `ok` alone.
        const sha = head.stdout.trim();
        const status = await git(['status', '--porcelain'], { cwd });
        if (!status.ok) {
          return { ok: false, detail: 'git could not describe the tree, so its cleanliness at publication is unknown' };
        }
        const dirty = status.stdout.split('\n').filter((line) => line.trim() !== '');
        if (dirty.length > 0) {
          return {
            ok: false,
            detail:
              `${dirty.length} path(s) are still uncommitted after the iteration commit, so the commit is not the ` +
              `tree that was reviewed: ${dirty.slice(0, 20).map((line) => line.slice(3)).join(', ')}`,
          };
        }
        return { ok: true, detail: `published ${sha.slice(0, 7)} with a clean tree`, head: sha };
      },
      diffStat: async () => (await git(['diff', '--stat', 'HEAD~1'], { cwd })).stdout.trim(),
      ship: async (iteration, commit) => {
        const tag = `meeseeks/iter-${String(iteration).padStart(3, '0')}`;
        // **Both tags name the reviewed commit explicitly** (REVIEW F38). `git tag -f <name>` with
        // no commit tags whatever `HEAD` happens to be, and by this point the ship-time mutation
        // gate and the operator's deploy have both had the chance to move it. The caller has just
        // re-proved that `HEAD` *is* this commit; naming it anyway is what makes the tag a
        // statement about a specific tree rather than about a moment.
        if (!/^[0-9a-f]{7,}$/.test(commit)) {
          throw new DriverError(`refusing to tag: ${JSON.stringify(commit)} is not a commit this run published`);
        }
        // Both tag operations are required (REVIEW F31). A tag that silently failed to be written
        // leaves a run reporting `SHIPPED` with no artifact identifying what shipped, which is the
        // audit that could not verify the first `SHIPPED` at all, repeated.
        const iterationTag = await git(['tag', '-f', tag, commit], { cwd });
        if (!iterationTag.ok) {
          throw new DriverError(
            `git could not write the iteration tag ${tag}: ${(iterationTag.stderr || '').trim().slice(0, 400)}`,
          );
        }
        // Annotated, not bare. An audit of the first SHIPPED found only an unannotated tag and
        // could not verify the claim behind it; a tag that carries no reason is not evidence.
        const prize = await shell(
          'git',
          [
            'tag',
            '-f',
            '-a',
            'meeseeks/GRAND-PRIZE',
            '-m',
            `SHIPPED: panel ${config.requireUnanimous ? 'unanimous' : 'majority'} on ` +
              `${requiredIds.length} requirement(s). Verdicts in .meeseeks/${REVIEW_RECORD}.`,
            commit,
          ],
          { cwd },
        );
        if (!prize.ok) {
          throw new DriverError(
            `git could not write the meeseeks/GRAND-PRIZE tag: ${(prize.stderr || '').trim().slice(0, 400)}`,
          );
        }
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
    // **An unexpected exception after the lock still leaves a receipt** (REVIEW F10). This was the
    // one terminal path with no durable record at all: a ratchet that would not parse, a reset git
    // refused, a report that would not read — all of them ended a paid run and left the operator
    // nothing but stdout, which dogfood run 4 already proved unreliable. `writeRunOutcome` is
    // at-most-once, so a loop that already decided a state keeps it and this adds nothing.
    writeRunOutcome(
      meeseeksDir,
      {
        state: 'ABORTED',
        reason: `${/** @type {Error} */ (error).name}: ${/** @type {Error} */ (error).message}`.slice(0, 800),
        phase: 'loop',
        spentTokens: preLoop.tokens,
        costUsd: preLoop.costUsd,
      },
      { now: () => new Date().toISOString(), log: (line) => write(verbatim(line)), written: outcomeWritten },
    );
    return 1;
  } finally {
    // Released on every path out, including the ABORTED one above. A lock left behind by a run
    // that ended normally would refuse the next run for no reason — and unlike a lock left by a
    // killed driver, that one would not clear itself, because this pid really is alive right up
    // until the process exits.
    releaseRunLock(meeseeksDir, runLock.lock.token);
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
  process.exitCode = await main(process.argv.slice(2));
}
