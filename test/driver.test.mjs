/**
 * Tests for the loop (DESIGN.md §2, §3, §4).
 *
 * Two things are being defended here.
 *
 * The reviewer parser is the product. DESIGN.md §1.1 exists because a builder satisfices,
 * and the only thing standing between a satisficed build and a `SHIPPED` tag is this
 * parser refusing to be charitable. So most of what follows is an attempt to talk it into
 * a pass it should not give.
 *
 * The loop's ordering is the other. Gates before review, ratchet before review, regression
 * before everything. Those are driven through injected effects, so every terminal state is
 * reachable in a millisecond instead of an hour.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { readAssumptions } from '../scripts/assumptions.mjs';
import { MUTATION_CONFIG_CONTENTS } from '../scripts/toolchains/node.mjs';
import { pinSecurityElement, quarantinePin, readPins, writePins } from '../scripts/pins.mjs';
import { DEFAULT_OWNERSHIP, defaultConfig } from '../scripts/config.mjs';
import {
  DriverError,
  PHASE_PERMISSIONS,
  REENTRANCY_ENV,
  airtimeRemaining,
  childEnvironment,
  permissionsFor,
  commandGates,
  dareIgnoreUpdate,
  architectGateFragment,
  recordPanelVerdict,
  suiteSensitivityEvidence,
  ensureDareIgnored,
  firstIterationTask,
  unitGateCommand,
  ensurePlaywrightBrowsers,
  loadRedEvidence,
  playwrightConfigPresent,
  parseDriverArgs,
  recordRedEvidence,
  redEvidenceGate,
  unprovenIds,
  requiredIdsFor,
  staticGates,
  appendBlooper,
  assertNotNested,
  assertOwnershipCovers,
  claudeArgs,
  formatGateFailure,
  combinePanel,
  inspectCiWorkflows,
  observabilityGate,
  ownershipPlan,
  changedSince,
  spawnClaude,
  writeMutationConfig,
  startCommand,
  driveRun,
  extractJsonObject,
  gateScore,
  childEndLine,
  childStartLine,
  parseClaudeEnvelope,
  parseReviewerReport,
  recordProgress,
  runGates,
  shouldContinue,
} from '../scripts/driver.mjs';
import { builderSystemPrompt } from '../scripts/driver.mjs';
import { loadState, saveState } from '../scripts/ratchet.mjs';

/** @type {string[]} */
const temporaryDirs = [];

/** @returns {string} */
function makeTempDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dare-driver-'));
  temporaryDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * @param {Record<string, unknown>[]} entries
 * @returns {string}
 */
function reviewerJson(entries) {
  return JSON.stringify({ verdict: 'pass', requirements: entries });
}

const GOOD_ENTRY = {
  id: 'PRD-1.1',
  status: 'pass',
  evidence: 'src/api/admin.ts:41',
  detail: 'role guard checks session.role',
};

// ---------------------------------------------------------------------------
// The reviewer parser: nothing defaults to pass
// ---------------------------------------------------------------------------

describe('parseReviewerReport accepts a real pass', () => {
  it('passes when every required id is present with file:line evidence', () => {
    const report = parseReviewerReport(reviewerJson([GOOD_ENTRY]), { requiredIds: ['PRD-1.1'] });
    assert.equal(report.verdict, 'pass');
    assert.deepStrictEqual(report.problems, []);
    assert.deepStrictEqual(report.requirements, [
      { id: 'PRD-1.1', status: 'pass', evidence: 'src/api/admin.ts:41', detail: 'role guard checks session.role' },
    ]);
  });

  it('reads a report wrapped in a fenced code block', () => {
    const raw = `Here is my audit.\n\n\`\`\`json\n${reviewerJson([GOOD_ENTRY])}\n\`\`\`\n`;
    assert.equal(parseReviewerReport(raw, { requiredIds: ['PRD-1.1'] }).verdict, 'pass');
  });

  it('reads a report surrounded by prose', () => {
    const raw = `I reviewed the repository.\n${reviewerJson([GOOD_ENTRY])}\nThat is my report.`;
    assert.equal(parseReviewerReport(raw, { requiredIds: ['PRD-1.1'] }).verdict, 'pass');
  });
});

describe('parseReviewerReport refuses a pass it has not earned', () => {
  /**
   * @param {string} raw
   * @param {string[]} [requiredIds]
   * @returns {string}
   */
  function verdictOf(raw, requiredIds = ['PRD-1.1']) {
    return parseReviewerReport(raw, { requiredIds }).verdict;
  }

  it('fails on output that is not JSON at all', () => {
    assert.equal(verdictOf('Everything looks good to me!'), 'fail');
  });

  it('fails on empty output, which is what a crashed reviewer produces', () => {
    assert.equal(verdictOf(''), 'fail');
  });

  it('says why it could not parse, so the failure is not reported as zero findings', () => {
    // Without this the driver hands the builder "the audit found these outstanding"
    // followed by nothing at all, which reads as success and teaches it nothing.
    const report = parseReviewerReport('Everything looks good to me!', { requiredIds: [] });
    assert.deepStrictEqual(report.problems, [
      'reviewer output could not be parsed as JSON; unparseable output is a fail (DESIGN.md §4)',
    ]);
  });

  it('fails on JSON with no requirements array', () => {
    assert.equal(verdictOf('{"verdict":"pass"}'), 'fail');
  });

  it('fails when the requirements array is empty', () => {
    assert.equal(verdictOf('{"verdict":"pass","requirements":[]}', []), 'fail');
  });

  it('flips a pass with no evidence to fail', () => {
    const report = parseReviewerReport(
      reviewerJson([{ id: 'PRD-1.1', status: 'pass', evidence: null, detail: 'looks fine' }]),
      { requiredIds: ['PRD-1.1'] },
    );
    assert.equal(report.verdict, 'fail');
    assert.equal(report.requirements[0].status, 'fail');
    assert.equal(report.problems[0], 'PRD-1.1 was marked pass with no evidence; flipped to fail (DESIGN.md §4)');
  });

  const notEvidence = [
    ['src/api/admin.ts', 'a path with no line number'],
    ['probably in the auth middleware', 'a gesture at a location'],
    ['the structure suggests it exists', 'a hand wave'],
    ['src/api/admin.ts:', 'a colon with no number'],
    ['41', 'a bare line number'],
  ];
  for (const [evidence, label] of notEvidence) {
    it(`flips a pass to fail when the evidence is ${label}`, () => {
      const report = parseReviewerReport(reviewerJson([{ id: 'PRD-1.1', status: 'pass', evidence, detail: 'x' }]), {
        requiredIds: ['PRD-1.1'],
      });
      assert.equal(report.verdict, 'fail');
      assert.equal(report.requirements[0].status, 'fail');
    });
  }

  it('fails when a required id has no entry, rather than treating it as not applicable', () => {
    const report = parseReviewerReport(reviewerJson([GOOD_ENTRY]), { requiredIds: ['PRD-1.1', 'DoD-2-security'] });
    assert.equal(report.verdict, 'fail');
    assert.deepStrictEqual(
      report.requirements.map((entry) => [entry.id, entry.status]),
      [
        ['PRD-1.1', 'pass'],
        ['DoD-2-security', 'fail'],
      ],
    );
    assert.equal(report.problems[0].includes('DoD-2-security has no entry'), true);
  });

  it('ignores the reviewer own top-level verdict', () => {
    // A reviewer that stamps "pass" over a failing entry does not get to.
    const raw = JSON.stringify({
      verdict: 'pass',
      requirements: [{ id: 'PRD-1.1', status: 'fail', evidence: null, detail: 'no rate limiting' }],
    });
    assert.equal(verdictOf(raw), 'fail');
  });

  it('treats an unrecognised status as fail', () => {
    const raw = reviewerJson([{ id: 'PRD-1.1', status: 'partial', evidence: 'src/a.ts:1', detail: 'mostly' }]);
    assert.equal(verdictOf(raw), 'fail');
  });

  it('keeps the failing entry when an id is reported twice', () => {
    const raw = reviewerJson([
      { id: 'PRD-1.1', status: 'pass', evidence: 'src/a.ts:1', detail: 'fine' },
      { id: 'PRD-1.1', status: 'fail', evidence: null, detail: 'actually missing' },
    ]);
    const report = parseReviewerReport(raw, { requiredIds: ['PRD-1.1'] });
    assert.equal(report.verdict, 'fail');
    assert.deepStrictEqual(
      report.requirements.map((entry) => entry.status),
      ['fail'],
    );
  });

  it('fails a whole report because one entry of many failed', () => {
    const raw = reviewerJson([
      GOOD_ENTRY,
      { id: 'PRD-1.2', status: 'pass', evidence: 'src/b.ts:9', detail: 'ok' },
      { id: 'DoD-2-security', status: 'fail', evidence: null, detail: 'no rate limiting' },
    ]);
    assert.equal(verdictOf(raw, ['PRD-1.1', 'PRD-1.2', 'DoD-2-security']), 'fail');
  });
});

describe('extractJsonObject', () => {
  it('returns null for text containing no object', () => {
    assert.equal(extractJsonObject('no json here'), null);
  });

  it('returns null for a bare array, which is not a report', () => {
    assert.equal(extractJsonObject('[1,2,3]'), null);
  });

  it('reads a bare object', () => {
    assert.deepStrictEqual(extractJsonObject('{"a":1}'), { a: 1 });
  });

  it('prefers the fenced block when prose surrounds it', () => {
    assert.deepStrictEqual(extractJsonObject('before\n```json\n{"a":1}\n```\nafter'), { a: 1 });
  });
});

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

describe('combinePanel', () => {
  /** @param {'pass' | 'fail'} verdict */
  const report = (verdict) => ({
    verdict,
    requirements: [
      verdict === 'pass'
        ? { id: 'PRD-1.1', status: /** @type {'pass'} */ ('pass'), evidence: 'src/a.ts:1', detail: '' }
        : { id: 'PRD-1.1', status: /** @type {'fail'} */ ('fail'), evidence: null, detail: 'missing' },
    ],
    advisories: /** @type {import('../scripts/driver.mjs').AdvisoryFinding[]} */ ([]),
    problems: /** @type {string[]} */ ([]),
  });

  it('passes only when every member passes', () => {
    assert.equal(combinePanel([report('pass'), report('pass')], { requireUnanimous: true }).verdict, 'pass');
  });

  it('fails when one member of three dissents', () => {
    const panel = combinePanel([report('pass'), report('pass'), report('fail')], { requireUnanimous: true });
    assert.equal(panel.verdict, 'fail');
    assert.deepStrictEqual(panel.failing, ['PRD-1.1: missing']);
  });

  it('fails an empty panel, because a run with no judge has not been judged', () => {
    assert.deepStrictEqual(combinePanel([], { requireUnanimous: true }), {
      verdict: 'fail',
      failing: ['no reviewer returned a report'],
      advisories: [],
    });
  });

  it('still fails on a reported problem even when every member said pass', () => {
    const suspicious = {
      verdict: /** @type {'pass'} */ ('pass'),
      requirements: /** @type {import('../scripts/driver.mjs').RequirementVerdict[]} */ ([]),
      advisories: /** @type {import('../scripts/driver.mjs').AdvisoryFinding[]} */ ([]),
      problems: ['id missing'],
    };
    assert.equal(combinePanel([suspicious], { requireUnanimous: true }).verdict, 'fail');
  });

  it('fails when the panel between them never judged a required id', () => {
    // Ownership is asserted before the panel runs, so this is the second line of defence:
    // a reviewer that returns a truncated report leaves an id unjudged, and an unjudged id
    // must never read as a pass.
    const panel = combinePanel([report('pass')], { requireUnanimous: true, requiredIds: ['PRD-1.1', 'DoD-2-security'] });
    assert.equal(panel.verdict, 'fail');
    assert.equal(
      panel.failing.some((finding) => finding.startsWith('DoD-2-security was judged by no member')),
      true,
      `expected an unjudged-id finding, got ${JSON.stringify(panel.failing)}`,
    );
  });

  it('passes when the ids it was asked about were all judged', () => {
    assert.equal(combinePanel([report('pass')], { requireUnanimous: true, requiredIds: ['PRD-1.1'] }).verdict, 'pass');
  });

  it('accepts a majority when unanimity is not required', () => {
    assert.equal(combinePanel([report('pass'), report('pass')], { requireUnanimous: false }).verdict, 'pass');
  });

  it('is the only thing requireUnanimous changes: a dissent that a majority outvotes', () => {
    // The same three reports, decided both ways. If this pair ever agrees, the setting
    // has become dead configuration.
    const panel = [report('pass'), report('pass'), report('fail')];
    assert.equal(combinePanel(panel, { requireUnanimous: true }).verdict, 'fail');
    assert.equal(combinePanel(panel, { requireUnanimous: false }).verdict, 'pass');
  });

  it('does not let a majority outvote a panel where most members failed', () => {
    const panel = [report('pass'), report('fail'), report('fail')];
    assert.equal(combinePanel(panel, { requireUnanimous: false }).verdict, 'fail');
  });

  it('deduplicates findings the whole panel reported', () => {
    const panel = combinePanel([report('fail'), report('fail')], { requireUnanimous: true });
    assert.deepStrictEqual(panel.failing, ['PRD-1.1: missing']);
  });
});

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

describe('runGates', () => {
  /**
   * @param {Record<string, boolean>} table
   * @returns {import('../scripts/plugins.mjs').Runner}
   */
  const runnerFor = (table) => (command, args) => {
    const ok = table[[command, ...args].join(' ')] ?? false;
    return { ok, status: ok ? 0 : 1, stdout: '', stderr: ok ? '' : 'boom' };
  };

  it('passes only when every gate exits zero', () => {
    const outcome = runGates(
      [
        { name: 'lint', command: ['npm', 'run', 'lint'], required: true },
        { name: 'test', command: ['npm', 'test'], required: true },
      ],
      { cwd: '/repo', run: runnerFor({ 'npm run lint': true, 'npm test': true }) },
    );
    assert.equal(outcome.ok, true);
    assert.deepStrictEqual(
      outcome.results.map((r) => [r.name, r.ok]),
      [
        ['lint', true],
        ['test', true],
      ],
    );
  });

  it('fails the set when one gate exits non-zero, and keeps running the rest', () => {
    const outcome = runGates(
      [
        { name: 'lint', command: ['npm', 'run', 'lint'], required: true },
        { name: 'test', command: ['npm', 'test'], required: true },
      ],
      { cwd: '/repo', run: runnerFor({ 'npm run lint': false, 'npm test': true }) },
    );
    assert.equal(outcome.ok, false);
    assert.deepStrictEqual(
      outcome.results.map((r) => [r.name, r.ok]),
      [
        ['lint', false],
        ['test', true],
      ],
    );
    assert.equal(outcome.results[0].detail, 'boom');
  });

  it('fails a gate that has no command, because a gate that cannot run is a failure', () => {
    const outcome = runGates([{ name: 'ci', command: [], required: true }], { cwd: '/repo', run: runnerFor({}) });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.results[0].detail, 'gate has no command; a gate that cannot run is a failure');
  });

  it('counts the passing gates', () => {
    assert.equal(
      gateScore([
        { name: 'a', ok: true, status: 0, detail: '' },
        { name: 'b', ok: false, status: 1, detail: '' },
        { name: 'c', ok: true, status: 0, detail: '' },
      ]),
      2,
    );
  });
});

// ---------------------------------------------------------------------------
// Budget, stall, airtime
// ---------------------------------------------------------------------------

describe('shouldContinue', () => {
  const config = { ...defaultConfig(), maxIterations: 5, stallLimit: 3, tokenCeiling: 1000 };
  const base = { iteration: 0, spentTokens: 0, spentUsd: 0, stalledIterations: 0, bestGateScore: 0, bestPassingCount: 0 };

  it('allows a fresh run', () => {
    assert.deepStrictEqual(shouldContinue(base, config), { continue: true });
  });

  it('ends BUDGET at the token ceiling', () => {
    const result = shouldContinue({ ...base, spentTokens: 1000 }, config);
    assert.equal(result.continue === false ? result.state : '', 'BUDGET');
  });

  it('ends BUDGET at the iteration limit', () => {
    const result = shouldContinue({ ...base, iteration: 5 }, config);
    assert.equal(result.continue === false ? result.state : '', 'BUDGET');
  });

  it('ends STALLED at the stall limit', () => {
    const result = shouldContinue({ ...base, stalledIterations: 3 }, config);
    assert.equal(result.continue === false ? result.state : '', 'STALLED');
  });

  it('checks the token ceiling before the iteration limit', () => {
    const result = shouldContinue({ ...base, iteration: 5, spentTokens: 1000 }, config);
    assert.equal(result.continue === false ? result.state : '', 'BUDGET');
  });
});

describe('recordProgress', () => {
  const base = { iteration: 0, spentTokens: 0, spentUsd: 0, stalledIterations: 2, bestGateScore: 3, bestPassingCount: 10 };

  it('resets the stall counter when a gate newly passes', () => {
    assert.equal(recordProgress(base, { gateScore: 4, passingCount: 10 }).stalledIterations, 0);
  });

  it('resets the stall counter when a new test passes', () => {
    assert.equal(recordProgress(base, { gateScore: 3, passingCount: 11 }).stalledIterations, 0);
  });

  it('counts an iteration that improved nothing as stalled', () => {
    assert.equal(recordProgress(base, { gateScore: 3, passingCount: 10 }).stalledIterations, 3);
  });

  it('counts an iteration that went backwards as stalled', () => {
    assert.equal(recordProgress(base, { gateScore: 1, passingCount: 2 }).stalledIterations, 3);
  });

  it('never lowers the best marks it has seen', () => {
    const next = recordProgress(base, { gateScore: 1, passingCount: 2 });
    assert.equal(next.bestGateScore, 3);
    assert.equal(next.bestPassingCount, 10);
  });
});

describe('airtimeRemaining', () => {
  it('reports whichever budget is closer to running out', () => {
    const config = { ...defaultConfig(), maxIterations: 10, tokenCeiling: 1000 };
    const airtime = airtimeRemaining(
      { iteration: 2, spentTokens: 900, spentUsd: 0, stalledIterations: 0, bestGateScore: 0, bestPassingCount: 0 },
      config,
    );
    assert.deepStrictEqual(airtime, { iterationsLeft: 8, tokensLeft: 100, usdLeft: 50, fractionLeft: 0.1 });
  });

  it('reports the cost budget as the tightest when money is what is running out', () => {
    // Tokens are a bad proxy for money — measured at $0.47/M on the first dogfood run — so the
    // counter has to be able to say "you are nearly out of budget" while tokens look fine.
    const config = { ...defaultConfig(), maxIterations: 10, tokenCeiling: 1_000_000, costCeiling: 10 };
    const airtime = airtimeRemaining(
      { iteration: 1, spentTokens: 1000, spentUsd: 9.5, stalledIterations: 0, bestGateScore: 0, bestPassingCount: 0 },
      config,
    );
    assert.equal(airtime.usdLeft, 0.5);
    assert.equal(airtime.fractionLeft, 0.05);
  });

  it('never goes negative', () => {
    const config = { ...defaultConfig(), maxIterations: 2, tokenCeiling: 100 };
    const airtime = airtimeRemaining(
      { iteration: 9, spentTokens: 900, spentUsd: 0, stalledIterations: 0, bestGateScore: 0, bestPassingCount: 0 },
      config,
    );
    assert.deepStrictEqual(airtime, { iterationsLeft: 0, tokensLeft: 0, usdLeft: 50, fractionLeft: 0 });
  });
});

// ---------------------------------------------------------------------------
// claude -p plumbing
// ---------------------------------------------------------------------------

describe('exhaustion is not a verdict', () => {
  // On a subscription the binding constraint is the rate-limit window, not money. A run
  // does not get expensive, it stalls partway - so a child that ran out of allowance has
  // to be told apart from a child that ran and disagreed.
  it('marks an envelope that reports a rate limit', () => {
    const envelope = JSON.stringify({ is_error: true, result: 'rate limit reached, resets at 14:00' });
    assert.equal(parseClaudeEnvelope(envelope).exhausted, true);
  });

  it('marks raw output that never became an envelope', () => {
    assert.equal(parseClaudeEnvelope('Error: 429 Too Many Requests').exhausted, true);
  });

  it('does not mark an ordinary failure as exhaustion', () => {
    assert.equal(parseClaudeEnvelope('command not found: claude').exhausted, false);
    assert.equal(parseClaudeEnvelope(JSON.stringify({ is_error: true, result: 'boom' })).exhausted, false);
  });

  it('does not mark a successful child as exhausted', () => {
    assert.equal(parseClaudeEnvelope(JSON.stringify({ is_error: false, result: 'fine' })).exhausted, false);
  });
});

describe('parseClaudeEnvelope', () => {
  // Field names taken from a real `claude -p --output-format json` run, version 2.1.226.
  const envelope = JSON.stringify({
    is_error: false,
    result: 'PONG',
    total_cost_usd: 0.2647065,
    usage: { input_tokens: 2, output_tokens: 5, cache_creation_input_tokens: 25474, cache_read_input_tokens: 19663 },
    subtype: 'success',
  });

  it('reads the text, the cost and every token bucket', () => {
    const result = parseClaudeEnvelope(envelope);
    assert.equal(result.ok, true);
    assert.equal(result.text, 'PONG');
    assert.equal(result.costUsd, 0.2647065);
    assert.equal(result.tokens, 2 + 5 + 25474 + 19663);
  });

  it('counts cache tokens, so the ceiling cannot be walked past by caching', () => {
    const cheap = JSON.stringify({ is_error: false, result: 'x', usage: { input_tokens: 1, output_tokens: 1 } });
    assert.equal(parseClaudeEnvelope(cheap).tokens, 2);
  });

  it('is not ok when the envelope reports an error', () => {
    assert.equal(parseClaudeEnvelope(JSON.stringify({ is_error: true, result: 'boom' })).ok, false);
  });

  it('is not ok when stdout is not JSON at all', () => {
    const result = parseClaudeEnvelope('command not found: claude');
    assert.equal(result.ok, false);
    assert.equal(result.raw, 'command not found: claude');
  });
});

describe('claudeArgs and the permission policy', () => {
  it('asks for json and pins the model', () => {
    const args = claudeArgs({ model: 'claude-sonnet-5', phase: 'builder' });
    // The settings blob carries the guard hook as well as the style from 0.59.0, so its
    // exact bytes are asserted by the guard tests below rather than pinned here.
    assert.deepStrictEqual(args.slice(0, 4), ['-p', '--output-format', 'json', '--settings']);
    assert.equal(args[5], '--model');
    assert.equal(args.includes('claude-sonnet-5'), true);
  });

  it('keeps the prompt out of argv entirely, for every phase', () => {
    // The bug this defends against shipped: the prompt was appended straight after
    // `--allowedTools`, which is variadic, so the CLI read it as one more tool name and the
    // child exited with "Input must be provided either through stdin or as a prompt
    // argument". Only `builder` survived, its permission flag taking no operand - so no PRD
    // was authored and no reviewer ever answered, which is every phase that can fail a run.
    //
    // Asserting the prompt is *absent* rather than *last* is the whole point: a position is
    // only safe until the next flag is added after it.
    for (const phase of Object.keys(PHASE_PERMISSIONS)) {
      const args = claudeArgs({ model: 'm', phase });
      assert.equal(args.includes('do it'), false, `${phase} carries the prompt in argv`);
    }
  });

  it('gives dangerous mode to the builder and to nothing else', () => {
    // The builder's job is arbitrary - install packages, run tools, restructure a tree.
    // Every other phase has a narrow job and gets exactly the tools for it.
    for (const phase of Object.keys(PHASE_PERMISSIONS)) {
      const dangerous = claudeArgs({ model: 'm', phase }).includes('--dangerously-skip-permissions');
      assert.equal(dangerous, phase === 'builder', `${phase} has the wrong permission level`);
    }
  });

  it('never lets a reading phase write', () => {
    for (const phase of ['review', 'reality-check']) {
      const tools = PHASE_PERMISSIONS[phase].allowedTools;
      assert.equal(tools.includes('Write'), false, `${phase} can write`);
      assert.equal(tools.includes('Edit'), false, `${phase} can edit`);
      assert.equal(claudeArgs({ model: 'm', phase }).includes('--allowedTools'), true);
    }
  });

  it('lets the document phases write, since writing a document is their job', () => {
    for (const phase of ['prd', 'design']) {
      assert.equal(PHASE_PERMISSIONS[phase].allowedTools.includes('Write'), true);
    }
  });

  it('refuses a phase with no declared policy rather than inheriting one', () => {
    // A new phase written next to the builder must not quietly acquire its powers.
    assert.throws(() => claudeArgs({ model: 'm', phase: 'summariser' }), DriverError);
    assert.throws(() => permissionsFor('anything-new'), DriverError);
  });

  it('gives the lesson extractor a cold read and nothing more', () => {
    // Lesson memory is driver-owned. The extractor reads evidence and answers; it has no
    // reason to write, and the store it feeds is one a builder may not touch either.
    const policy = permissionsFor('lesson-extractor');
    assert.equal(policy.dangerous, false);
    assert.deepStrictEqual(policy.allowedTools, ['Read', 'Glob', 'Grep']);
  });

  it('forces the default output style on every phase', () => {
    for (const phase of Object.keys(PHASE_PERMISSIONS)) {
      const args = claudeArgs({ model: 'm', phase });
      const at = args.indexOf('--settings');
      assert.notEqual(at, -1, `${phase} was given no settings override`);
      assert.equal(JSON.parse(args[at + 1]).outputStyle, 'default');
    }
  });

  // The guard hook is the one limit that survives `--dangerously-skip-permissions`
  // (DESIGN.md §6), and until 0.59.0 the driver never registered it with the children it
  // spawns. It relied on `hooks/hooks.json`, which Claude Code applies to the operator's
  // own sessions — **a `claude -p` child does not load the operator's plugin PreToolUse
  // hooks.** Measured on 12 August 2026: a child stamped `DARE_RUNNING=1` overwrote
  // `.dare/state.json` through both Write and Bash, in dangerous *and* non-dangerous mode,
  // with `permission_denials: []`. The same write is denied the moment the hook arrives in
  // `--settings`.
  //
  // This is the `claudeArgs` defect class landing on the safety mechanism itself: the guard's
  // logic was thoroughly unit-tested and entirely correct, and nothing asserted it was ever
  // *invoked*. The live check in tier 3 is what actually holds this; these assertions only
  // keep the wiring honest.
  describe('the guard hook travels with every child', () => {
    /** @param {string} phase */
    function settingsFor(phase) {
      const args = claudeArgs({ model: 'm', phase });
      return JSON.parse(args[args.indexOf('--settings') + 1]);
    }

    it('registers a PreToolUse guard for every phase, including the read-only ones', () => {
      // Not just the builder. `prd` and `design` hold Write and Edit, so a child of either
      // could rewrite the state it is judged by; the read-only phases carry it because a
      // phase list is a thing that grows.
      for (const phase of Object.keys(PHASE_PERMISSIONS)) {
        const entries = settingsFor(phase).hooks?.PreToolUse;
        assert.equal(Array.isArray(entries) && entries.length > 0, true, `${phase} spawns with no guard`);
      }
    });

    it('takes the matcher from hooks/hooks.json rather than restating it', () => {
      // Two declarations of the same matcher is the `CI_REQUIRED_COMMANDS` drift again: the
      // installed plugin would deny a tool the driver's own children were free to use, and
      // nothing would report the difference.
      const manifest = JSON.parse(readFileSync(new URL('../hooks/hooks.json', import.meta.url), 'utf8'));
      const declared = manifest.hooks.PreToolUse.map((/** @type {{matcher: string}} */ e) => e.matcher);
      const supplied = settingsFor('builder').hooks.PreToolUse.map((/** @type {{matcher: string}} */ e) => e.matcher);
      assert.deepStrictEqual(supplied, declared);
      // Same shape, so a hook added to the manifest reaches the children rather than only
      // the operator's own sessions.
      assert.equal(settingsFor('builder').hooks.PreToolUse.length, manifest.hooks.PreToolUse.length);
    });

    it('resolves the plugin root to a guard that is actually on disk', () => {
      // `${CLAUDE_PLUGIN_ROOT}` is expanded by the plugin loader, and nothing expands it
      // inside a `--settings` blob. Left in place it names no file, the hook cannot run, and
      // a hook that cannot run does not deny — the failure is silent and opens the gate.
      const command = settingsFor('builder').hooks.PreToolUse[0].hooks[0].command;
      assert.equal(command.includes('${CLAUDE_PLUGIN_ROOT}'), false, `unexpanded placeholder: ${command}`);
      const script = command.slice(command.indexOf('"') + 1, command.lastIndexOf('"'));
      assert.equal(existsSync(script), true, `the guard the children are pointed at does not exist: ${script}`);
    });
  });

  it('appends a system prompt when one is given', () => {
    const args = claudeArgs({ model: 'm', phase: 'builder', systemPrompt: 'be hostile' });
    assert.equal(args.includes('be hostile'), true);
  });
});

describe('builderSystemPrompt', () => {
  /** @param {Record<string, string>} files */
  function tree(files) {
    const dir = makeTempDir();
    for (const [relative, contents] of Object.entries(files)) {
      const full = path.join(dir, relative);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, contents, 'utf8');
    }
    return dir;
  }

  it('says nothing about visual direction on a repository with no user interface', () => {
    const prompt = builderSystemPrompt(tree({ 'package.json': '{"name":"cli"}' }));
    assert.equal(prompt.includes('Visual direction'), false);
    assert.equal(prompt.includes('Do not gold-plate'), true, 'the builder brief itself went missing');
  });

  it('appends visual direction once the repository renders a user interface', () => {
    // Guidance a detector cannot supply: impeccable can rule that a choice is wrong, but no
    // deterministic rule can say a choice is distinctive.
    const prompt = builderSystemPrompt(tree({ 'index.html': '<!doctype html>' }));
    assert.equal(prompt.includes('Visual direction'), true);
    assert.equal(prompt.includes('Do not gold-plate'), true, 'the direction replaced the brief instead of joining it');
  });

  it('carries the principles but not a competing workflow', () => {
    // The source skill prescribes brainstorm/explore/plan/critique/build. This loop already
    // owns the process; two processes in one prompt produce a builder that redesigns rather
    // than ships, while the ratchet charges it for every test written on the way.
    const prompt = builderSystemPrompt(tree({ 'index.html': '<!doctype html>' }));
    assert.equal(prompt.includes('Spend boldness in one place'), true);
    assert.equal(/brainstorm a short design plan/i.test(prompt), false);
  });
});

describe('childEnvironment', () => {
  it('marks the child as being inside a run', () => {
    assert.equal(childEnvironment({})[REENTRANCY_ENV], '1');
  });

  it('keeps the rest of the environment, so children still find their tools', () => {
    assert.equal(childEnvironment({ PATH: '/usr/bin', HOME: '/home/x' }).PATH, '/usr/bin');
  });

  it('produces an environment its own guard would refuse', () => {
    // The point of the marker: a builder that shells out to the driver must be refused
    // there, because the guard hook only sees the slash command, never our own children.
    assert.throws(() => assertNotNested(childEnvironment(process.env)), DriverError);
  });

  it('does not mutate the environment it was handed', () => {
    const env = { PATH: '/usr/bin' };
    childEnvironment(env);
    assert.equal(REENTRANCY_ENV in env, false);
  });
});

// ---------------------------------------------------------------------------
// Re-entrancy and the blooper reel
// ---------------------------------------------------------------------------

describe('the re-entrancy marker reaches the child', () => {
  /**
   * @param {string} phase
   * @returns {{ calls: { command: string, args: string[], env: Record<string, string | undefined>,
   *   input: string | undefined }[] }}
   */
  function spawnWithRecorder(phase) {
    /** @type {{ command: string, args: string[], env: Record<string, string | undefined>,
     *   input: string | undefined }[]} */
    const calls = [];
    spawnClaude({
      prompt: 'do it',
      model: 'claude-sonnet-5',
      phase,
      cwd: '/somewhere',
      env: { PATH: '/usr/bin' },
      run: (command, args, options) => {
        calls.push({ command, args, env: options.env ?? {}, input: options.input });
        return { ok: true, status: 0, stdout: JSON.stringify({ is_error: false, result: 'ok' }), stderr: '' };
      },
    });
    return { calls };
  }

  it('delivers the prompt on stdin for every phase, and never in argv', () => {
    // Both halves matter. A prompt missing from argv but also missing from stdin is a child
    // that exits with "Input must be provided", which is the failure this replaced.
    for (const phase of Object.keys(PHASE_PERMISSIONS)) {
      const { calls } = spawnWithRecorder(phase);
      assert.equal(calls[0].input, 'do it', `${phase} did not receive the prompt on stdin`);
      assert.equal(calls[0].args.includes('do it'), false, `${phase} also put the prompt in argv`);
    }
  });

  it('passes the marker in the environment of every phase, not merely computes it', () => {
    // The bug this defends against shipped once: the marker was built and then discarded,
    // because the shell wrapper had no way to carry an environment. `assertNotNested` was
    // therefore unreachable from a child, and the driver half of the no-nesting rule did
    // nothing at all.
    for (const phase of Object.keys(PHASE_PERMISSIONS)) {
      const { calls } = spawnWithRecorder(phase);
      assert.equal(calls.length, 1, `${phase} spawned ${calls.length} children`);
      assert.equal(calls[0].env[REENTRANCY_ENV], '1', `${phase} child did not carry the marker`);
    }
  });

  it('leaves the rest of the environment intact, so the child still finds its tools', () => {
    assert.equal(spawnWithRecorder('builder').calls[0].env.PATH, '/usr/bin');
  });

  it('produces an environment the driver would refuse to start in', () => {
    const inherited = spawnWithRecorder('review').calls[0].env;
    assert.throws(() => assertNotNested(inherited), DriverError);
  });

  it('carries the phase permissions through to the real argv', () => {
    assert.equal(spawnWithRecorder('builder').calls[0].args.includes('--dangerously-skip-permissions'), true);
    for (const phase of Object.keys(PHASE_PERMISSIONS).filter((name) => name !== 'builder')) {
      assert.equal(
        spawnWithRecorder(phase).calls[0].args.includes('--dangerously-skip-permissions'),
        false,
        `${phase} was spawned in dangerous mode`,
      );
    }
  });
});

describe('ownershipPlan', () => {
  const ALL_IDS = [
    'PRD-1.1',
    'PRD-2.3',
    'DoD-1-requirements',
    'DoD-2-security',
    'DoD-3-ci',
    'DoD-4-docs-observability',
    'DoD-5-design',
  ];

  /** @param {Partial<{ reviewers: string[], ownership: Record<string, string[]> }>} [overrides] */
  function planFor(overrides = {}) {
    const config = defaultConfig();
    return ownershipPlan(ALL_IDS, {
      reviewers: overrides.reviewers ?? config.reviewers,
      ownership: overrides.ownership ?? config.ownership,
    });
  }

  it('splits every id across the panel and leaves none unowned', () => {
    const plan = planFor();
    assert.deepStrictEqual(plan.uncovered, []);
    assert.deepStrictEqual(
      plan.assignments.map((assignment) => [assignment.reviewer, assignment.ids]),
      [
        ['security', ['DoD-2-security']],
        ['correctness', ['DoD-1-requirements', 'PRD-1.1', 'PRD-2.3']],
        ['design', ['DoD-3-ci', 'DoD-4-docs-observability', 'DoD-5-design']],
      ],
    );
  });

  it('gives no two reviewers the same id under the default split', () => {
    assert.deepStrictEqual(planFor().shared, []);
  });

  it('reports an id no active reviewer owns', () => {
    // The security auditor is configured but not on the panel, so its line has no owner.
    const plan = planFor({ reviewers: ['correctness', 'design'] });
    assert.deepStrictEqual(plan.uncovered, ['DoD-2-security']);
  });

  it('treats * as a wildcard and everything else as literal', () => {
    const plan = ownershipPlan(['PRD-1.1', 'PRD-1.1-extra', 'XPRD-1.1'], {
      reviewers: ['correctness'],
      ownership: { correctness: ['PRD-*'] },
    });
    assert.deepStrictEqual(plan.assignments[0].ids, ['PRD-1.1', 'PRD-1.1-extra']);
    assert.deepStrictEqual(plan.uncovered, ['XPRD-1.1']);
  });

  it('does not let a regex metacharacter in a pattern match something else', () => {
    // `DoD-1.requirements` would match `DoD-1-requirements` if the dot were left live.
    const plan = ownershipPlan(['DoD-1-requirements'], {
      reviewers: ['correctness'],
      ownership: { correctness: ['DoD-1.requirements'] },
    });
    assert.deepStrictEqual(plan.uncovered, ['DoD-1-requirements']);
  });

  it('allows shared ownership when it is configured, and says which ids are shared', () => {
    const plan = planFor({
      ownership: { security: ['DoD-2-security', 'PRD-*'], correctness: ['PRD-*', 'DoD-1-requirements'], design: ['DoD-3-ci', 'DoD-4-docs-observability', 'DoD-5-design'] },
    });
    assert.deepStrictEqual(plan.uncovered, []);
    assert.deepStrictEqual(
      plan.shared.map((entry) => entry.id),
      ['PRD-1.1', 'PRD-2.3'],
    );
  });
});

describe('assertOwnershipCovers', () => {
  it('returns the plan when the panel covers the specification', () => {
    const config = defaultConfig();
    const plan = assertOwnershipCovers(['PRD-1.1', 'DoD-2-security', 'DoD-1-requirements', 'DoD-3-ci'], {
      reviewers: ['security', 'correctness', 'design'],
      ownership: config.ownership,
    });
    assert.equal(plan.uncovered.length, 0);
  });

  it('throws, naming the id, when nobody owns one', () => {
    assert.throws(
      () => assertOwnershipCovers(['PRD-1.1', 'DoD-9-invented'], defaultConfig()),
      (/** @type {Error} */ error) => error instanceof DriverError && error.message.includes('DoD-9-invented'),
    );
  });

  it('throws when a reviewer on the panel owns nothing at all', () => {
    // A member with no ids is a whole cold read of the repository spent on nothing.
    assert.throws(
      () => assertOwnershipCovers(['PRD-1.1'], { reviewers: ['correctness', 'security'], ownership: defaultConfig().ownership }),
      (/** @type {Error} */ error) => error instanceof DriverError && error.message.includes('security'),
    );
  });
});

describe('advisory findings', () => {
  /**
   * @param {Record<string, unknown>} advisory
   * @param {number} [minConfidence]
   */
  function parseWith(advisory, minConfidence = 0.7) {
    return parseReviewerReport(
      JSON.stringify({ requirements: [{ ...GOOD_ENTRY }, advisory] }),
      { requiredIds: ['PRD-1.1'], minConfidence },
    );
  }

  const CONFIDENT = {
    id: 'advisory-design-4',
    status: 'fail',
    severity: 'minor',
    confidence: 0.9,
    evidence: 'src/foo.ts:91',
    detail: 'the module is doing two things',
    repairHint: 'split the export',
  };

  it('does not let an advisory failure change the verdict', () => {
    // The whole point: PRD and DoD compliance is deterministic, and a finding with a
    // number attached must not be able to hold a compliant build back.
    const report = parseWith(CONFIDENT);
    assert.equal(report.verdict, 'pass');
    assert.deepStrictEqual(report.problems, []);
    assert.deepStrictEqual(
      report.requirements.map((entry) => entry.id),
      ['PRD-1.1'],
    );
  });

  it('keeps a confident, evidenced advisory as actionable', () => {
    const [advisory] = parseWith(CONFIDENT).advisories;
    assert.equal(advisory.actionable, true);
    assert.equal(advisory.severity, 'minor');
    assert.equal(advisory.confidence, 0.9);
    assert.equal(advisory.repairHint, 'split the export');
  });

  it('does not act on an advisory below the configured threshold', () => {
    // A low-confidence hunch fed back as work is how a loop spends its last iterations
    // chasing an opinion.
    assert.equal(parseWith({ ...CONFIDENT, confidence: 0.4 }).advisories[0].actionable, false);
    assert.equal(parseWith({ ...CONFIDENT, confidence: 0.4 }, 0.3).advisories[0].actionable, true);
  });

  it('treats a missing or unreadable confidence as zero', () => {
    assert.equal(parseWith({ ...CONFIDENT, confidence: undefined }).advisories[0].confidence, 0);
    assert.equal(parseWith({ ...CONFIDENT, confidence: 'very' }).advisories[0].confidence, 0);
    assert.equal(parseWith({ ...CONFIDENT, confidence: 7 }).advisories[0].confidence, 0);
  });

  it('will not act on an advisory with no real file:line', () => {
    // Evidence stays mandatory for anything actionable, advisory or not.
    assert.equal(parseWith({ ...CONFIDENT, evidence: null }).advisories[0].actionable, false);
    assert.equal(parseWith({ ...CONFIDENT, evidence: 'somewhere in src/' }).advisories[0].actionable, false);
  });

  it('keeps a required id required even when it wears an advisory name', () => {
    // Otherwise a reviewer could demote a DoD line by renaming it.
    const report = parseReviewerReport(
      JSON.stringify({ requirements: [{ id: 'advisory-2', status: 'fail', evidence: null, detail: 'x' }] }),
      { requiredIds: ['advisory-2'] },
    );
    assert.equal(report.verdict, 'fail');
    assert.deepStrictEqual(report.advisories, []);
    assert.deepStrictEqual(
      report.requirements.map((entry) => entry.id),
      ['advisory-2'],
    );
  });

  it('surfaces only actionable advisories from the panel, worst first', () => {
    const withAdvisories = (/** @type {Record<string, unknown>[]} */ advisories) =>
      parseReviewerReport(JSON.stringify({ requirements: [GOOD_ENTRY, ...advisories] }), {
        requiredIds: ['PRD-1.1'],
      });
    const panel = combinePanel(
      [
        withAdvisories([
          { ...CONFIDENT, id: 'advisory-1', severity: 'minor', confidence: 0.8 },
          { ...CONFIDENT, id: 'advisory-2', severity: 'major', confidence: 0.8 },
          { ...CONFIDENT, id: 'advisory-3', confidence: 0.1 },
        ]),
      ],
      { requireUnanimous: true, requiredIds: ['PRD-1.1'] },
    );
    assert.equal(panel.verdict, 'pass');
    assert.deepStrictEqual(
      panel.advisories.map((advisory) => advisory.id),
      ['advisory-2', 'advisory-1'],
    );
  });
});

describe('assertNotNested', () => {
  it('allows a first run', () => {
    assert.equal(assertNotNested({}), undefined);
  });

  it('allows a run when the marker is empty', () => {
    assert.equal(assertNotNested({ DARE_RUNNING: '' }), undefined);
  });

  it('refuses a nested run', () => {
    assert.throws(() => assertNotNested({ DARE_RUNNING: '1' }), DriverError);
  });
});

describe('appendBlooper', () => {
  it('appends one json line per reset, with the injected timestamp', () => {
    const dir = makeTempDir();
    appendBlooper(dir, { iteration: 3, regressions: ['b::2', 'a::1'], diffStat: ' 2 files changed', at: 'T1' });
    appendBlooper(dir, { iteration: 7, regressions: ['c::3'], diffStat: ' 1 file changed', at: 'T2' });
    const lines = readFileSync(path.join(dir, 'bloopers.log'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.deepStrictEqual(lines, [
      { at: 'T1', iteration: 3, regressions: ['a::1', 'b::2'], diffStat: ' 2 files changed' },
      { at: 'T2', iteration: 7, regressions: ['c::3'], diffStat: ' 1 file changed' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// The loop, driven to each terminal state
// ---------------------------------------------------------------------------

describe('the lines that bracket a child', () => {
  // Children run under execFileSync, so nothing can tick while one is out. These two lines
  // are the whole of the progress an operator gets, which is why their content is asserted
  // exactly rather than for substrings.
  it('warns that silence is expected, and names the model doing the waiting', () => {
    assert.equal(
      childStartLine('design', 'claude-opus-5', 8432),
      'design: claude-opus-5 running on 8432 characters of prompt, no output until it returns',
    );
  });

  it('carries the measured prompt size, so growth is visible before it is fatal', () => {
    // The budget check catches a runaway. This line catches the slope leading to one: the
    // number is in the log every iteration, so a reader can watch it climb. Characters, and
    // said so — there is no tokenizer here and an estimate would read as a measurement.
    assert.equal(childStartLine('builder', 'm', 4).includes('4 characters of prompt'), true);
    assert.equal(childStartLine('builder', 'm', 4).includes('token'), false);
  });

  it('reports elapsed seconds and spend when the child returns', () => {
    assert.equal(
      childEndLine('design', { ok: true, tokens: 120000 }, 570),
      'design: returned after 570s, 120000 tokens',
    );
  });

  it('says failed rather than returned when the child did not succeed', () => {
    // A failed child that reads as "returned" is the same lie as a silent hang.
    assert.equal(childEndLine('review', { ok: false, tokens: 12 }, 3), 'review: failed after 3s, 12 tokens');
  });

  it('names the phase on both lines, since minutes of nothing separate them', () => {
    assert.equal(childStartLine('builder', 'm', 1).startsWith('builder:'), true);
    assert.equal(childEndLine('builder', { ok: true, tokens: 1 }, 1).startsWith('builder:'), true);
  });
});

describe('spawnClaude checks the context budget before it spends anything', () => {
  // The check lives inside spawnClaude rather than at any call site, for the reason
  // builderSystemPrompt is a function: every child passes through this one door, so a phase
  // added later cannot forget it.

  /**
   * @param {number} promptLength
   * @param {number} limit
   */
  function spawnWith(promptLength, limit) {
    /** @type {string[][]} */
    const calls = [];
    const result = spawnClaude({
      prompt: 'x'.repeat(promptLength),
      systemPrompt: 'sys',
      model: 'claude-sonnet-5',
      phase: 'builder',
      cwd: '/repo',
      env: {},
      contextLimit: limit,
      run: (command, args) => {
        calls.push([command, ...args]);
        return { ok: true, status: 0, stdout: JSON.stringify({ result: 'done', is_error: false }), stderr: '' };
      },
    });
    return { calls, result };
  }

  it('does not spawn at all when the prompt is over budget', () => {
    // Refusing after the child has run would cost the full price of the mistake and teach
    // the operator nothing they could not read in the bill.
    const { calls, result } = spawnWith(500, 100);
    assert.deepEqual(calls, []);
    assert.equal(result.ok, false);
    assert.equal(result.tokens, 0);
    assert.equal(result.costUsd, 0);
  });

  it('reports the measurement rather than a bare failure', () => {
    const { result } = spawnWith(500, 100);
    assert.equal(result.raw.includes('builder: prompt is 503 characters'), true);
    assert.equal(result.raw.includes('over the 100 character budget'), true);
  });

  it('counts the system prompt too, since the child is handed both', () => {
    // 'sys' is three characters. A budget that measured only the user prompt would miss the
    // frontend-direction fragment appended to every builder on a UI project.
    const { calls } = spawnWith(98, 100);
    assert.deepEqual(calls, []);
  });

  it('spawns normally when the prompt fits', () => {
    const { calls, result } = spawnWith(50, 100);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'claude');
    assert.equal(result.ok, true);
    assert.equal(result.text, 'done');
  });
});

describe('changedSince', () => {
  // The baseline choice is the load-bearing part of A5. Measured from the last
  // ratchet-advancing commit rather than the last iteration, because a regression iteration
  // changes only the repair — a diff against the previous iteration would hand a scoped gate
  // an almost empty set and it would report a clean pass over nothing.

  it('asks git for names changed since the ratchet-advancing commit', () => {
    /** @type {string[][]} */
    const calls = [];
    const files = changedSince({
      cwd: '/repo',
      since: 'abc123',
      run: (command, args) => {
        calls.push([command, ...args]);
        return { ok: true, status: 0, stdout: 'src/a.ts\nsrc/b.js\n', stderr: '' };
      },
    });
    assert.deepEqual(calls, [
      ['git', 'diff', '--name-only', 'abc123', '--'],
      // Untracked additions are the iteration's work too, and gates run before its commit.
      // `--exclude-standard` keeps node_modules and build output out of it.
      ['git', 'ls-files', '--others', '--exclude-standard'],
    ]);
    assert.deepEqual(files, ['src/a.ts', 'src/b.js']);
  });

  // Found in dogfood run 9. `git diff --name-only` lists tracked changes only, and gates run
  // *before* the iteration's commit — so every brand-new file an iteration creates was
  // invisible here. A builder that satisfied an objective by adding a module got the same
  // "nothing changed since the last ratchet-advancing commit" as one that did nothing, and the
  // mutation gate declined over work that was sitting right there.
  it('includes files the iteration created but has not committed yet', () => {
    /** @type {string[][]} */
    const calls = [];
    const files = changedSince({
      cwd: '/repo',
      since: 'abc123',
      run: (command, args) => {
        calls.push([command, ...args]);
        return args[0] === 'diff'
          ? { ok: true, status: 0, stdout: 'src/a.ts\n', stderr: '' }
          : { ok: true, status: 0, stdout: 'src/brand-new.ts\n', stderr: '' };
      },
    });
    assert.deepEqual(files, ['src/a.ts', 'src/brand-new.ts']);
    assert.equal(calls.length, 2, 'untracked files were never asked about');
  });

  it('does not report the same file twice when it is both changed and listed', () => {
    const files = changedSince({
      cwd: '/repo',
      since: 'abc123',
      run: (_command, args) =>
        args[0] === 'diff'
          ? { ok: true, status: 0, stdout: 'src/a.ts\n', stderr: '' }
          : { ok: true, status: 0, stdout: 'src/a.ts\n', stderr: '' },
    });
    assert.deepEqual(files, ['src/a.ts']);
  });

  it('still returns the tracked changes when the untracked listing fails', () => {
    // Degrading to fewer files is the safe direction: the gate scopes to less and says so.
    // Losing the tracked half because the second command failed would be the loud one.
    const files = changedSince({
      cwd: '/repo',
      since: 'abc123',
      run: (_command, args) =>
        args[0] === 'diff'
          ? { ok: true, status: 0, stdout: 'src/a.ts\n', stderr: '' }
          : { ok: false, status: 1, stdout: '', stderr: 'boom' },
    });
    assert.deepEqual(files, ['src/a.ts']);
  });

  it('returns nothing when there is no baseline, rather than the whole tree', () => {
    // Iteration 1 has no ratchet-advancing commit. Returning everything would mutate an
    // entire repository on the iteration least likely to benefit from it; the gate declines
    // on an empty set with a stated reason instead, which is louder and more accurate.
    let asked = 0;
    const files = changedSince({
      cwd: '/repo',
      since: null,
      run: () => {
        asked += 1;
        return { ok: true, status: 0, stdout: '', stderr: '' };
      },
    });
    assert.deepEqual(files, []);
    assert.equal(asked, 0, 'git was consulted with no baseline to consult it about');
  });

  it('returns nothing when git itself failed', () => {
    // A failed diff is not evidence that nothing changed. It yields an empty list, the gate
    // declines and says so, and no gate reports a pass over an unknown.
    assert.deepEqual(
      changedSince({ cwd: '/repo', since: 'abc', run: () => ({ ok: false, status: 128, stdout: '', stderr: 'bad' }) }),
      [],
    );
  });

  it('drops blank lines rather than passing an empty path to a mutator', () => {
    assert.deepEqual(
      changedSince({
        cwd: '/repo',
        since: 'abc',
        run: () => ({ ok: true, status: 0, stdout: 'src/a.ts\n\n  \n', stderr: '' }),
      }),
      ['src/a.ts'],
    );
  });
});

describe('writeMutationConfig', () => {
  it('writes a config carrying a breaking threshold the builder cannot reach', () => {
    // Stryker has no --thresholds flag and thresholds.break defaults to null, so surviving
    // mutants exit 0. The threshold therefore has to live in a file, and it has to be a file
    // under .dare or the builder owns whether the gate can fail at all.
    //
    // "cannot reach" in this title means cannot *edit*, which is the property. It used to also
    // read as "cannot achieve" - the threshold was 100 - and that turned out to be literally
    // true of correct repositories too. The number lives beside the constant with the
    // measurement that set it; here we assert only that the gate is capable of failing.
    const dareDir = path.join(makeTempDir(), '.dare');
    const file = writeMutationConfig(dareDir);
    assert.equal(file, path.join(dareDir, 'stryker.config.json'));
    const written = JSON.parse(readFileSync(file, 'utf8')).thresholds.break;
    assert.equal(typeof written, 'number');
    assert.equal(written > 0, true, 'a break of 0 or null cannot fail, which is the default this exists to override');
    assert.equal(written, MUTATION_CONFIG_CONTENTS.thresholds.break, 'the driver wrote something other than the constant');
  });

  it('disables the tsconfig preprocessor, which killed the gate outright on a TypeScript tree', () => {
    // Stryker's tsconfig preprocessor dynamically imports `typescript` from **Stryker's own**
    // installation — npm's npx cache — where it is not present. On a TypeScript project whose
    // tsconfig takes that path the gate died with an uncaught ERR_MODULE_NOT_FOUND instead of
    // producing a result, and dogfood run 10 lost three of six iterations to it.
    //
    // 0.43.0's finding for a second package: Stryker resolves from where Stryker lives, not
    // from the project. `-p typescript` does not fix it — measured — because npx siblings are
    // not on Node's ESM resolution path from inside @stryker-mutator/core.
    const dareDir = path.join(makeTempDir(), '.dare');
    const written = JSON.parse(readFileSync(writeMutationConfig(dareDir), 'utf8'));
    assert.equal(written.tsconfigFile, '', 'the preprocessor is armed again and the gate can crash on a TS tree');
  });
});

describe('driveRun', () => {
  /**
   * @param {Partial<import('../scripts/driver.mjs').Effects>} [overrides]
   * @returns {import('../scripts/driver.mjs').Effects}
   */
  function effectsWith(overrides = {}) {
    /** @type {import('../scripts/driver.mjs').ClaudeResult} */
    const ok = { ok: true, text: '', costUsd: 0.01, tokens: 100, raw: '' };
    return {
      build: () => ok,
      review: () => ({ ...ok, text: JSON.stringify({ requirements: [GOOD_ENTRY] }) }),
      realityCheck: () => ({ ...ok, text: 'buildable' }),
      // A ship needs evidence the suite can fail (0.56.0), so the default harness carries a
      // passing mutation gate - the ordinary shipping condition. Tests exercising the withheld
      // path override this.
      gates: () => ({
        ok: true,
        results: [
          { name: 'lint', ok: true, status: 0, detail: 'passed' },
          { name: 'mutation', ok: true, status: 0, detail: 'no survivors' },
        ],
      }),
      readTestReports: () => [{ numTotalTests: 1, testResults: [] }],
      commit: () => 'commit1',
      diffStat: () => ' 1 file changed',
      ship: () => {},
      now: () => '2026-08-10T01:49:52.963Z',
      log: () => {},
      ...overrides,
    };
  }

  /**
   * @param {Partial<import('../scripts/driver.mjs').Effects>} overrides
   * @param {Partial<import('../scripts/config.mjs').DareConfig>} [configOverrides]
   * @param {string[]} [seedPassing]
   * @param {string[]} [requiredIds]
   */
  function run(overrides, configOverrides = {}, seedPassing = [], requiredIds = ['PRD-1.1']) {
    const root = makeTempDir();
    const dareDir = path.join(root, '.dare');
    if (seedPassing.length > 0) {
      // A seeded ratchet means a reset is reachable, and the reset really shells out to
      // git — so the root has to be a real repository with a real commit to return to.
      const git = (/** @type {string[]} */ args) =>
        execFileSync('git', args, { cwd: root, stdio: 'pipe' }).toString().trim();
      git(['init', '--quiet']);
      git(['config', 'user.email', 'driver@example.invalid']);
      git(['config', 'user.name', 'Driver Test']);
      writeFileSync(path.join(root, 'app.txt'), 'good\n', 'utf8');
      git(['add', 'app.txt']);
      git(['commit', '--quiet', '-m', 'good state']);
      saveState(dareDir, {
        version: 1,
        iteration: 1,
        passing: seedPassing,
        lastGoodCommit: git(['rev-parse', 'HEAD']),
      });
    }
    const outcome = driveRun({
      config: { ...defaultConfig(), maxIterations: 5, stallLimit: 3, reviewers: ['correctness'], ...configOverrides },
      dareDir,
      rootDir: root,
      requiredIds,
      task: 'build the thing',
      effects: effectsWith(overrides),
    });
    return { outcome, dareDir, root };
  }

  // 0.63.0. Until then the deploy lived inside `ship()` — after the dare/GRAND-PRIZE tag was
  // already written — and its failure was printed and ignored, so a run could announce a
  // grand prize having deployed nothing (DESIGN.md §10.1).
  describe('a deploy that does not come up withholds the ship', () => {
    /** A report carrying one passing id, so the ratchet can advance and a ship is reachable. */
    const oneGreenTest = () => [
      {
        numTotalTests: 1,
        testResults: [
          { name: 'test/a.test.js', assertionResults: [{ ancestorTitles: [], title: 'works', status: 'passed' }] },
        ],
      },
    ];

    it('ships when no deploy is configured, which is the default', () => {
      // The benign neighbour. A check that blocked every run without a deploy would make the
      // feature mandatory by accident.
      assert.equal(run({ readTestReports: oneGreenTest }).outcome.state, 'SHIPPED');
    });

    it('ships when the deploy and its smoke checks pass', () => {
      const { outcome } = run({
        readTestReports: oneGreenTest,
        deploy: () => ({ ok: true, detail: '2 smoke check(s) passed' }),
      });
      assert.equal(outcome.state, 'SHIPPED');
    });

    it('does not tag when the smoke check fails', () => {
      // The value that matters: `ship` writes the tag, so counting its calls is the only
      // assertion that distinguishes "withheld" from "shipped and complained".
      let shipped = 0;
      const { outcome } = run({
        deploy: () => ({ ok: false, detail: 'smoke: /health expected 200, answered 502' }),
        ship: () => {
          shipped += 1;
        },
      });
      assert.notEqual(outcome.state, 'SHIPPED');
      assert.equal(shipped, 0, 'the tag was written despite a failed deploy');
    });

    it('withholds rather than failing the iteration, so a host being down cannot reset the tree', () => {
      // A blinking network must not `git reset --hard` a tree that just passed a unanimous
      // panel. The run keeps going and asks the builder again; it does not destroy work.
      let builders = 0;
      const { outcome } = run({
        deploy: () => ({ ok: false, detail: 'connection refused' }),
        build: () => {
          builders += 1;
          return { ok: true, text: 'built', costUsd: 0, tokens: 10, raw: '' };
        },
      });
      assert.notEqual(outcome.state, 'SHIPPED');
      assert.equal(builders > 1, true, 'the run stopped instead of iterating after a failed deploy');
    });

    it('carries the deploy failure into the next objective, so the builder is told what broke', () => {
      const { dareDir } = run({ readTestReports: oneGreenTest, deploy: () => ({ ok: false, detail: 'smoke: /api/items expected 200, answered 404' }) });
      const briefs = readdirSync(path.join(dareDir, 'briefs'));
      const text = briefs.map((file) => readFileSync(path.join(dareDir, 'briefs', file), 'utf8')).join('\n');
      assert.match(text, /answered 404/);
    });
  });

  describe('the budget counts what was spent before the loop started', () => {
    // The defect the first dogfood run found. Phase 0 and Phase 1 run in `main`, before
    // driveRun exists, so their spend was invisible to it: a design child spent 2,965,864
    // tokens against a 2,000,000 ceiling and the loop then began its own accounting at zero
    // with the full ceiling available again. The suite was green throughout.

    /**
     * @param {{ tokens: number, costUsd: number }} alreadySpent
     * @param {Partial<import('../scripts/driver.mjs').Effects>} [overrides]
     */
    function runWithSpend(alreadySpent, overrides = {}) {
      const root = makeTempDir();
      let builders = 0;
      const outcome = driveRun({
        config: { ...defaultConfig(), maxIterations: 4, tokenCeiling: 2_000_000, reviewers: ['correctness'] },
        dareDir: path.join(root, '.dare'),
        rootDir: root,
        requiredIds: ['PRD-1.1'],
        task: 'build the thing',
        alreadySpent,
        effects: effectsWith({
          build: () => {
            builders += 1;
            return { ok: true, text: '', costUsd: 0.01, tokens: 100, raw: '' };
          },
          ...overrides,
        }),
      });
      return { outcome, builders };
    }

    it('ends BUDGET without spawning a builder when the pre-loop phases exhausted the ceiling', () => {
      // The exact numbers from the run: 2,965,864 spent against a 2,000,000 ceiling.
      const { outcome, builders } = runWithSpend({ tokens: 2_965_864, costUsd: 12.5 });
      assert.equal(outcome.state, 'BUDGET');
      assert.equal(builders, 0, 'a builder ran on a ceiling that was already exhausted');
    });

    it('names the real total in the reason, not the loop’s own subtotal', () => {
      const { outcome } = runWithSpend({ tokens: 2_965_864, costUsd: 12.5 });
      assert.equal(outcome.reason.includes('2965864'), true);
      assert.equal(outcome.reason.includes('2000000'), true);
    });

    it('reports the pre-loop spend in the outcome, so the final line is honest', () => {
      // `iterations: 0 tokens: … cost: …` is what an operator reads. Reporting only the
      // loop's share understates the bill by the most expensive child in the pipeline.
      const { outcome } = runWithSpend({ tokens: 2_965_864, costUsd: 12.5 });
      assert.equal(outcome.spentTokens >= 2_965_864, true);
      assert.equal(outcome.costUsd >= 12.5, true);
    });

    it('adds loop spend on top of it rather than replacing it', () => {
      const { outcome } = runWithSpend({ tokens: 1000, costUsd: 1 });
      assert.equal(outcome.spentTokens > 1000, true, 'the loop overwrote the pre-loop total');
      assert.equal(outcome.costUsd > 1, true);
    });

    it('still runs normally when nothing was spent before the loop', () => {
      // The benign neighbour. A budget that refuses every run is not a budget.
      // Asserted on *which* limit fired, not merely on the state: exhausting maxIterations
      // is also BUDGET, and a broader assertion would pass for the wrong reason.
      const { outcome, builders } = runWithSpend({ tokens: 0, costUsd: 0 });
      assert.equal(builders > 0, true);
      assert.equal(outcome.reason.includes('token ceiling'), false, `stopped on tokens: ${outcome.reason}`);
    });

    it('treats an absent alreadySpent as zero, so existing callers are unaffected', () => {
      const root = makeTempDir();
      const outcome = driveRun({
        config: { ...defaultConfig(), maxIterations: 1, reviewers: ['correctness'] },
        dareDir: path.join(root, '.dare'),
        rootDir: root,
        requiredIds: ['PRD-1.1'],
        task: 'build the thing',
        effects: effectsWith({}),
      });
      assert.equal(outcome.reason.includes('token ceiling'), false, `stopped on tokens: ${outcome.reason}`);
    });
  });

  describe('the builder assumptions contract', () => {
    // A9. A second output contract on the builder's only return channel, so the failure modes
    // are the parser's: an absence must not read as a failure, and a failure must not read as
    // an absence.

    /** @param {string} text what the builder's final message says */
    function runWithBuilderSaying(text) {
      const root = makeTempDir();
      const dareDir = path.join(root, '.dare');
      const outcome = driveRun({
        config: { ...defaultConfig(), maxIterations: 1, stallLimit: 3, reviewers: ['correctness'] },
        dareDir,
        rootDir: root,
        requiredIds: ['PRD-1.1'],
        task: 'build the thing',
        effects: effectsWith({
          build: () => ({ ok: true, text, costUsd: 0.01, tokens: 100, raw: '' }),
          readTestReports: () => [
            {
              numTotalTests: 1,
              testResults: [
                { name: 'test/a.test.js', assertionResults: [{ ancestorTitles: [], title: 'works', status: 'passed' }] },
              ],
            },
          ],
        }),
      });
      return { outcome, dareDir };
    }

    it('records a cited assumption where the reviewer will see it', () => {
      const { dareDir } = runWithBuilderSaying(
        'Added the handler.\n\n```json\n' +
          JSON.stringify({ assumptions: [{ cites: 'PRD-2.4', assumed: '410 Gone' }] }) +
          '\n```\n',
      );
      assert.deepEqual(readAssumptions(dareDir).entries, [
        { iteration: 1, cites: 'PRD-2.4', ambiguity: '', assumed: '410 Gone' },
      ]);
    });

    it('discards an uncited assumption instead of recording it', () => {
      // The citation bar, end to end. An unverifiable assumption in the auditor's hands is
      // worse than no assumption, because it costs a cold read and cannot be checked.
      const { dareDir } = runWithBuilderSaying(
        'Added the handler.\n\n```json\n' + JSON.stringify({ assumptions: [{ assumed: 'probably json' }] }) + '\n```\n',
      );
      assert.deepEqual(readAssumptions(dareDir).entries, []);
    });

    it('ships normally when the builder says nothing about assumptions', () => {
      // The common case, and the benign neighbour: a contract that punished silence would
      // fail every iteration that had nothing ambiguous to report.
      const { outcome, dareDir } = runWithBuilderSaying('Added the handler.');
      assert.equal(outcome.state, 'SHIPPED');
      assert.deepEqual(readAssumptions(dareDir).entries, []);
    });

    it('fails the iteration on a malformed block rather than treating it as silence', () => {
      // Unparseable output is a failure everywhere else here and is one here. A block that
      // will not parse is not evidence that nothing was assumed.
      const { outcome } = runWithBuilderSaying('Added it.\n\n```json\n{"assumptions": [ }\n```\n');
      assert.notEqual(outcome.state, 'SHIPPED');
    });

    it('never calls a reviewer on an iteration whose assumptions block was malformed', () => {
      // The iteration failed before it was judgeable. Paying for a panel on it would spend a
      // cold read on output the driver already knows it cannot trust.
      const root = makeTempDir();
      let reviewed = 0;
      driveRun({
        config: { ...defaultConfig(), maxIterations: 1, stallLimit: 3, reviewers: ['correctness'] },
        dareDir: path.join(root, '.dare'),
        rootDir: root,
        requiredIds: ['PRD-1.1'],
        task: 'build the thing',
        effects: effectsWith({
          build: () => ({ ok: true, text: '```json\n{"assumptions": [ }\n```', costUsd: 0, tokens: 1, raw: '' }),
          review: () => {
            reviewed += 1;
            return { ok: true, text: JSON.stringify({ requirements: [GOOD_ENTRY] }), costUsd: 0, tokens: 1, raw: '' };
          },
        }),
      });
      assert.equal(reviewed, 0);
    });
  });

  describe('pinned security elements gate the run', () => {
    // The DoD lines this exists to satisfy: a removed guard is caught as a regression, an
    // ambiguous one escalates instead of resetting, and a quarantined one blocks SHIPPED.

    const GUARD = 'if (session.role !== "admin") return res.status(403).end();';

    /**
     * @param {import('../scripts/pins.mjs').PinStore} pins
     * @param {Partial<import('../scripts/driver.mjs').Effects>} overrides
     */
    function runWithPins(pins, overrides) {
      const root = makeTempDir();
      const dareDir = path.join(root, '.dare');
      writePins(dareDir, pins);
      const outcome = driveRun({
        config: { ...defaultConfig(), maxIterations: 2, stallLimit: 3, reviewers: ['correctness'] },
        dareDir,
        rootDir: root,
        requiredIds: ['PRD-1.1'],
        task: 'build the thing',
        // A report with one passing test, so the ratchet advances and the run actually
        // reaches the pin phase. The default harness reports zero ids, which the ratchet
        // correctly rejects before anything below Phase 4 runs.
        effects: effectsWith({
          readTestReports: () => [
            {
              numTotalTests: 1,
              testResults: [
                { name: 'test/a.test.js', assertionResults: [{ ancestorTitles: [], title: 'works', status: 'passed' }] },
              ],
            },
          ],
          ...overrides,
        }),
      });
      return { outcome, dareDir };
    }

    /** @param {string} finding */
    const escalationSaying = (finding, extra = {}) => ({
      ok: true,
      costUsd: 0.5,
      tokens: 900,
      raw: '',
      text: '```json\n' + JSON.stringify({ finding, detail: 'because', ...extra }) + '\n```',
    });

    const activePin = () =>
      pinSecurityElement({ id: 'DoD-2-security', evidence: 'src/a.ts:1', snippet: GUARD, iteration: 1 });

    it('does not ship while an element is quarantined, even on a unanimous panel', () => {
      // Without this, quarantine is a word. With it, a recorded loss of protection is
      // something the run has to resolve rather than absorb.
      const pins = { version: 1, security: [quarantinePin(activePin(), 'could not tell')], requirements: [] };
      const { outcome } = runWithPins(pins, { readSource: () => GUARD, securityEscalation: () => escalationSaying('unknown') });
      assert.notEqual(outcome.state, 'SHIPPED');
    });

    it('ships once the quarantined element is gone from the store', () => {
      // The benign neighbour. A block that never lifts is a stall, not a gate.
      const pins = { version: 1, security: [activePin()], requirements: [] };
      const { outcome } = runWithPins(pins, { readSource: () => GUARD, securityEscalation: () => escalationSaying('unknown') });
      assert.equal(outcome.state, 'SHIPPED');
    });

    it('never asks a reviewer while the cheap check still finds the guard', () => {
      // The economic argument. Re-verification runs every iteration; escalation is the
      // exception, not the routine.
      let asked = 0;
      const pins = { version: 1, security: [activePin()], requirements: [] };
      runWithPins(pins, {
        readSource: () => `some other code\n${GUARD}\n`,
        securityEscalation: () => {
          asked += 1;
          return escalationSaying('unknown');
        },
      });
      assert.equal(asked, 0);
    });

    it('escalates rather than resetting when the guard cannot be found', () => {
      let asked = 0;
      const pins = { version: 1, security: [activePin()], requirements: [] };
      runWithPins(pins, {
        readSource: () => 'the guard is gone\n',
        securityEscalation: () => {
          asked += 1;
          return escalationSaying('unknown');
        },
      });
      assert.equal(asked, 1);
    });

    it('re-pins at the new location when the reviewer says it moved, and does not ship-block', () => {
      const pins = { version: 1, security: [activePin()], requirements: [] };
      const { outcome, dareDir } = runWithPins(pins, {
        readSource: (/** @type {string} */ file) => (file === 'src/moved.ts' ? GUARD : 'gone'),
        securityEscalation: () => escalationSaying('moved', { evidence: 'src/moved.ts:3', snippet: GUARD }),
      });
      assert.equal(readPins(dareDir).security[0].file, 'src/moved.ts');
      assert.equal(readPins(dareDir).security[0].status, 'active');
      assert.equal(outcome.state, 'SHIPPED');
    });

    it('quarantines, and records why, when the reviewer cannot tell', () => {
      const pins = { version: 1, security: [activePin()], requirements: [] };
      const { dareDir } = runWithPins(pins, {
        readSource: () => 'gone',
        securityEscalation: () => escalationSaying('unknown'),
      });
      const stored = readPins(dareDir).security[0];
      assert.equal(stored.status, 'quarantined');
      assert.equal(stored.reason, 'because');
    });

    it('treats an unparseable escalation as unknown, never as a removal', () => {
      // Fail-closed here is quarantine, not a hard reset. An unreadable answer is not
      // evidence a guard was deleted, and resetting on one hands the builder an objective
      // it cannot satisfy.
      const pins = { version: 1, security: [activePin()], requirements: [] };
      const { dareDir } = runWithPins(pins, {
        readSource: () => 'gone',
        securityEscalation: () => ({ ok: true, costUsd: 0, tokens: 1, raw: '', text: 'I am not sure, sorry.' }),
      });
      assert.equal(readPins(dareDir).security[0].status, 'quarantined');
    });

    it('aborts rather than carrying pins forward unverified when nothing can read the tree', () => {
      // A run that cannot re-verify its pins is a run with no security monotonicity at all.
      // Continuing would report the same clean pass as a run that checked everything.
      const pins = { version: 1, security: [activePin()], requirements: [] };
      const { outcome } = runWithPins(pins, {});
      assert.equal(outcome.state, 'ABORTED');
    });
  });

  /** A report where one test passes, so the ratchet has something to hold. */
  const ONE_PASSING = {
    numTotalTests: 1,
    testResults: [
      { name: 'test/a.test.js', assertionResults: [{ ancestorTitles: [], title: 'works', status: 'passed' }] },
    ],
  };

  /**
   * A genuine regression: the runner collected tests, and the protected one is not among them.
   *
   * These cases used to use `{ numTotalTests: 0, testResults: [] }`, which encoded the very
   * ambiguity dogfood run 6 was destroyed by - an empty report means "the collector produced
   * nothing", not "your tests vanished", and resetting on it punishes the builder for a runner
   * fault. The fixture now collects a different test, so the protected id is genuinely absent
   * from a report that worked.
   */
  const COLLECTED_WITHOUT_THE_PROTECTED_ONE = {
    numTotalTests: 1,
    testResults: [
      { name: 'test/b.test.js', assertionResults: [{ ancestorTitles: [], title: 'other', status: 'passed' }] },
    ],
  };

  it('withholds the ship when nothing has shown the suite can fail', () => {
    const { outcome } = run({
      readTestReports: () => [ONE_PASSING],
      gates: () => ({ ok: true, results: [{ name: 'lint', ok: true, status: 0, detail: 'passed' }] }),
    });
    assert.notEqual(outcome.state, 'SHIPPED', 'shipped with no evidence the suite can fail');
  });

  it('ships once the mutation gate has proven the suite', () => {
    // The neighbour that keeps this from being a way to never ship: the default harness carries
    // a passing mutation gate, and that is the ordinary condition.
    assert.equal(run({ readTestReports: () => [ONE_PASSING] }).outcome.state, 'SHIPPED');
  });

  it('ships when the gates pass, nothing regressed and the panel is unanimous', () => {
    let shipped = 0;
    const { outcome } = run({
      readTestReports: () => [ONE_PASSING],
      ship: () => {
        shipped += 1;
      },
    });
    assert.equal(outcome.state, 'SHIPPED');
    assert.equal(shipped, 1);
  });

  it('records the passing tests in the ratchet when it ships', () => {
    const { outcome, dareDir } = run({ readTestReports: () => [ONE_PASSING] });
    assert.deepStrictEqual(outcome.passing, ['test/a.test.js::works']);
    assert.equal(loadState(dareDir).lastGoodCommit, 'commit1');
  });

  it('does not ship when a reviewer withholds evidence', () => {
    const { outcome } = run({
      readTestReports: () => [ONE_PASSING],
      review: () => ({
        ok: true,
        costUsd: 0,
        tokens: 10,
        raw: '',
        text: JSON.stringify({ requirements: [{ id: 'PRD-1.1', status: 'pass', evidence: null, detail: 'fine' }] }),
      }),
    });
    assert.notEqual(outcome.state, 'SHIPPED');
  });

  it('does not ship when a reviewer process dies', () => {
    const { outcome } = run({
      readTestReports: () => [ONE_PASSING],
      review: () => ({ ok: false, costUsd: 0, tokens: 0, raw: 'segfault', text: '' }),
    });
    assert.notEqual(outcome.state, 'SHIPPED');
  });

  it('never calls the reviewer when the gates failed', () => {
    let reviews = 0;
    run(
      {
        readTestReports: () => [ONE_PASSING],
        gates: () => ({ ok: false, results: [{ name: 'lint', ok: false, status: 1, detail: 'boom' }] }),
        review: () => {
          reviews += 1;
          return { ok: true, costUsd: 0, tokens: 0, raw: '', text: '' };
        },
      },
      { maxIterations: 2 },
    );
    assert.equal(reviews, 0, 'gates are free and run first; a panel of cold reads is not');
  });

  it('names the failing gates even when the ratchet resets in the same iteration', () => {
    // Dogfood run 6's operator saw `regression:` followed by 75 test names and not one word
    // about a failing gate, because the reset path `continue`s before the gate-failure branch
    // that does the reporting. The unit gate had collected nothing; the loop knew and did not
    // say. A diagnosis unreachable on the path that needs it is not a diagnosis.
    /** @type {string[]} */
    const logs = [];
    run(
      {
        log: (line) => logs.push(line),
        gates: () => ({
          ok: false,
          results: [{ name: 'unit', ok: false, status: 1, detail: 'no test suite found' }],
        }),
        readTestReports: () => [COLLECTED_WITHOUT_THE_PROTECTED_ONE],
      },
      { maxIterations: 1 },
      ['test/a.test.js::works'],
    );
    assert.equal(
      logs.some((line) => line.includes('gates failed: unit')),
      true,
      `the reset swallowed the gate report: ${JSON.stringify(logs)}`,
    );
    assert.equal(logs.some((line) => line.startsWith('regression:')), true, 'expected a reset too');
  });

  it('hard-resets and writes a blooper when a passing test disappears', () => {
    const { outcome, dareDir } = run(
      { readTestReports: () => [COLLECTED_WITHOUT_THE_PROTECTED_ONE] },
      { maxIterations: 2 },
      ['test/a.test.js::works'],
    );
    const log = readFileSync(path.join(dareDir, 'bloopers.log'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.equal(log[0].regressions[0], 'test/a.test.js::works');
    assert.equal(log[0].at, '2026-08-10T01:49:52.963Z');
    assert.notEqual(outcome.state, 'SHIPPED');
  });

  it('really restores the working tree on a regression, not just the log line', () => {
    // The blooper log and the ratchet state can both look right while the reset never
    // happened. This asserts the file on disk went back to the last good commit.
    const root = makeTempDir();
    const dareDir = path.join(root, '.dare');
    const git = (/** @type {string[]} */ args) =>
      execFileSync('git', args, { cwd: root, stdio: 'pipe' }).toString().trim();
    git(['init', '--quiet']);
    git(['config', 'user.email', 'driver@example.invalid']);
    git(['config', 'user.name', 'Driver Test']);
    writeFileSync(path.join(root, 'app.txt'), 'good\n', 'utf8');
    git(['add', 'app.txt']);
    git(['commit', '--quiet', '-m', 'good state']);
    saveState(dareDir, {
      version: 1,
      iteration: 1,
      passing: ['test/a.test.js::works'],
      lastGoodCommit: git(['rev-parse', 'HEAD']),
    });

    driveRun({
      config: { ...defaultConfig(), maxIterations: 1, reviewers: ['correctness'] },
      dareDir,
      rootDir: root,
      requiredIds: ['PRD-1.1'],
      task: 'build the thing',
      effects: effectsWith({
        readTestReports: () => [COLLECTED_WITHOUT_THE_PROTECTED_ONE],
        build: () => {
          writeFileSync(path.join(root, 'app.txt'), 'broken by the builder\n', 'utf8');
          return { ok: true, text: '', costUsd: 0, tokens: 1, raw: '' };
        },
      }),
    });

    assert.equal(readFileSync(path.join(root, 'app.txt'), 'utf8'), 'good\n');
  });

  it('never loses a ratchet id to a reset', () => {
    const { dareDir } = run(
      { readTestReports: () => [COLLECTED_WITHOUT_THE_PROTECTED_ONE] },
      { maxIterations: 2 },
      ['test/a.test.js::works'],
    );
    assert.deepStrictEqual(loadState(dareDir).passing, ['test/a.test.js::works']);
  });

  it('ends BUDGET when the iteration limit is reached', () => {
    const { outcome } = run(
      {
        readTestReports: () => [ONE_PASSING],
        review: () => ({ ok: true, costUsd: 0, tokens: 1, raw: '', text: '{"requirements":[]}' }),
      },
      { maxIterations: 2, stallLimit: 99, realityCheck: { after: 99 } },
    );
    assert.equal(outcome.state, 'BUDGET');
    assert.equal(outcome.iterations, 2);
  });

  it('ends BUDGET when the token ceiling is reached', () => {
    const { outcome } = run(
      {
        readTestReports: () => [ONE_PASSING],
        review: () => ({ ok: true, costUsd: 0, tokens: 1, raw: '', text: '{"requirements":[]}' }),
      },
      { tokenCeiling: 150, maxIterations: 99, stallLimit: 99, realityCheck: { after: 99 } },
    );
    assert.equal(outcome.state, 'BUDGET');
  });

  it('ends STALLED when nothing improves', () => {
    const { outcome } = run(
      {
        readTestReports: () => [ONE_PASSING],
        review: () => ({ ok: true, costUsd: 0, tokens: 1, raw: '', text: '{"requirements":[]}' }),
      },
      { maxIterations: 99, stallLimit: 2, realityCheck: { after: 99 } },
    );
    assert.equal(outcome.state, 'STALLED');
  });

  it('ends ABORTED when the builder process fails', () => {
    const { outcome } = run({ build: () => ({ ok: false, text: '', costUsd: 0, tokens: 0, raw: 'no auth' }) });
    assert.equal(outcome.state, 'ABORTED');
    assert.equal(outcome.reason.includes('no auth'), true);
  });

  it('ends ABORTED when the test report cannot be read, rather than assuming nothing regressed', () => {
    const { outcome } = run({ readTestReports: () => [{ nonsense: true }] });
    assert.equal(outcome.state, 'ABORTED');
    assert.equal(outcome.reason.includes('test report could not be read'), true);
  });

  it('ends ABORTED when the reality check says the PRD is unbuildable', () => {
    const { outcome, dareDir } = run(
      {
        readTestReports: () => [ONE_PASSING],
        review: () => ({ ok: true, costUsd: 0, tokens: 1, raw: '', text: '{"requirements":[]}' }),
        realityCheck: () => ({
          ok: true,
          costUsd: 0,
          tokens: 1,
          raw: '',
          text: 'This PRD is unbuildable: no database exists.',
        }),
      },
      { maxIterations: 99, stallLimit: 99, realityCheck: { after: 2 } },
    );
    assert.equal(outcome.state, 'ABORTED');
    assert.equal(
      readFileSync(path.join(dareDir, 'reality-check.md'), 'utf8'),
      'This PRD is unbuildable: no database exists.',
    );
  });

  it('carries on when the reality check says the PRD is buildable', () => {
    const { outcome } = run(
      {
        readTestReports: () => [ONE_PASSING],
        review: () => ({ ok: true, costUsd: 0, tokens: 1, raw: '', text: '{"requirements":[]}' }),
        realityCheck: () => ({ ok: true, costUsd: 0, tokens: 1, raw: '', text: 'buildable, keep going' }),
      },
      { maxIterations: 4, stallLimit: 99, realityCheck: { after: 2 } },
    );
    assert.equal(outcome.state, 'BUDGET');
  });

  it('hands the failing gate names back in the next brief', () => {
    /** @type {string[]} */
    const briefs = [];
    run(
      {
        readTestReports: () => [ONE_PASSING],
        gates: () => ({ ok: false, results: [{ name: 'typecheck', ok: false, status: 1, detail: 'TS2339' }] }),
        build: (brief) => {
          briefs.push(brief);
          return { ok: true, text: '', costUsd: 0, tokens: 1, raw: '' };
        },
      },
      { maxIterations: 2 },
    );
    assert.equal(briefs[0].includes('build the thing'), true);
    assert.equal(briefs[1].includes('typecheck'), true);
    assert.equal(briefs[1].includes('TS2339'), true);
    assert.equal(briefs[1].includes('### Failing gates'), true);
  });

  it('re-asks what the project is on every iteration, and puts the answer in the brief', () => {
    // Not resolved once and reused: the declared half is fixed for the run but the detected
    // half describes the tree, and the builder changes the tree every iteration. A brief
    // compiled from a stale answer would describe the project as it was before it existed.
    /** @type {string[]} */
    const briefs = [];
    let asked = 0;
    run(
      {
        readTestReports: () => [ONE_PASSING],
        gates: () => ({ ok: false, results: [{ name: 'typecheck', ok: false, status: 1, detail: 'TS2339' }] }),
        capabilities: () => {
          asked += 1;
          return asked === 1 ? ['api'] : ['api', 'persistent-storage'];
        },
        build: (brief) => {
          briefs.push(brief);
          return { ok: true, text: '', costUsd: 0, tokens: 1, raw: '' };
        },
      },
      { maxIterations: 2 },
    );
    assert.equal(asked, 2);
    assert.equal(briefs[0].includes('## What this project is'), true);
    assert.equal(briefs[0].includes('- persistent-storage'), false);
    assert.equal(briefs[1].includes('- persistent-storage'), true);
  });

  it('compiles a brief with no capability section when nothing supplies one', () => {
    // `capabilities` is an optional effect. A driver assembled without it must still produce
    // a brief rather than throwing on an absent function.
    /** @type {string[]} */
    const briefs = [];
    run(
      {
        readTestReports: () => [ONE_PASSING],
        build: (brief) => {
          briefs.push(brief);
          return { ok: true, text: '', costUsd: 0, tokens: 1, raw: '' };
        },
      },
      { maxIterations: 1 },
    );
    assert.equal(briefs[0].includes('What this project is'), false);
  });

  it('stops at the first child past the ceiling, rather than finishing the iteration', () => {
    // Observed: a run configured for 1000000 ended `2100900 of 1000000`, because the ceiling
    // was only read between iterations and a child's cost is unknown until it returns.
    // One builder child at 900 against a ceiling of 500 must end the run then and there —
    // the reviewers that would have followed it in the same iteration never run.
    let reviews = 0;
    const { outcome } = run(
      {
        // A passing report matters here: without one the run takes the no-tests path and
        // never reaches the panel anyway, so the test would pass with or without the guard.
        readTestReports: () => [ONE_PASSING],
        build: () => ({ ok: true, text: '', costUsd: 0.01, tokens: 900, raw: '' }),
        review: () => {
          reviews += 1;
          return { ok: true, text: JSON.stringify({ requirements: [GOOD_ENTRY] }), costUsd: 0, tokens: 1, raw: '' };
        },
      },
      { tokenCeiling: 500, maxIterations: 5 },
    );
    assert.equal(outcome.state, 'BUDGET');
    assert.equal(outcome.reason, 'token ceiling reached: 900 of 500');
    assert.equal(reviews, 0);
    assert.equal(outcome.spentTokens, 900);
  });

  it('names the runner in the no-tests brief, because a green npm test hides the real cause', () => {
    // Observed against a real run: the builder wrote a correct `node:test` suite, `npm test`
    // passed, and `npx vitest run` collected zero tests from it. Told only that no test
    // passed, a builder rewrites tests that were never wrong. The runner is the fact it
    // cannot discover on its own, so the brief has to carry it.
    /** @type {string[]} */
    const briefs = [];
    run(
      {
        readTestReports: () => [{ numTotalTests: 0, testResults: [] }],
        build: (brief) => {
          briefs.push(brief);
          return { ok: true, text: '', costUsd: 0, tokens: 1, raw: '' };
        },
      },
      { maxIterations: 2 },
    );
    assert.equal(briefs[1].includes('make the test suite run and pass'), true);
    assert.equal(briefs[1].includes('npx vitest run'), true);
  });

  it('hands the regression back in the next brief, above everything else', () => {
    /** @type {string[]} */
    const briefs = [];
    run(
      {
        readTestReports: () => [COLLECTED_WITHOUT_THE_PROTECTED_ONE],
        build: (brief) => {
          briefs.push(brief);
          return { ok: true, text: '', costUsd: 0, tokens: 1, raw: '' };
        },
      },
      { maxIterations: 2 },
      ['test/a.test.js::works'],
    );
    assert.equal(briefs[1].includes('Restore the tests listed below'), true);
    assert.equal(briefs[1].includes('test/a.test.js::works'), true);
    assert.equal(briefs[1].includes('outrank everything else'), true);
  });

  it('archives a brief for every iteration', () => {
    // The brief is the only record of what the builder was actually asked for. A run that
    // ends badly is diagnosed from these; reconstructing them from what it did is guesswork.
    const { dareDir } = run(
      {
        readTestReports: () => [ONE_PASSING],
        gates: () => ({ ok: false, results: [{ name: 'lint', ok: false, status: 1, detail: 'no' }] }),
      },
      { maxIterations: 3 },
    );
    assert.deepStrictEqual(readdirSync(path.join(dareDir, 'briefs')).sort(), [
      'iter-001.md',
      'iter-002.md',
      'iter-003.md',
    ]);
  });

  it('asks each reviewer only about the ids it owns', () => {
    /** @type {[string, string[]][]} */
    const asked = [];
    run(
      {
        readTestReports: () => [ONE_PASSING],
        review: (reviewer, ids) => {
          asked.push([reviewer, ids]);
          return {
            ok: true,
            costUsd: 0,
            tokens: 1,
            raw: '',
            text: JSON.stringify({
              requirements: ids.map((id) => ({ id, status: 'pass', evidence: 'src/a.ts:1', detail: 'found' })),
            }),
          };
        },
      },
      { reviewers: ['security', 'correctness', 'design'] },
      [],
      ['PRD-1.1', 'DoD-1-requirements', 'DoD-2-security', 'DoD-3-ci', 'DoD-4-docs-observability', 'DoD-5-design'],
    );
    assert.deepStrictEqual(asked, [
      ['security', ['DoD-2-security']],
      ['correctness', ['DoD-1-requirements', 'PRD-1.1']],
      ['design', ['DoD-3-ci', 'DoD-4-docs-observability', 'DoD-5-design']],
    ]);
  });

  it('extracts a lesson only after a failure resisted one repair and fell to another', () => {
    // The evidence pattern from DESIGN.md §13.8, driven through the real loop: lint fails,
    // a repair does not fix it, a different repair does. Nothing asks the builder what it
    // learned; the driver notices the shape and pays for one cold extraction.
    let iteration = 0;
    /** @type {string[]} */
    const extractions = [];
    const { dareDir } = run(
      {
        readTestReports: () => [ONE_PASSING],
        gates: () => {
          iteration += 1;
          return iteration <= 2
            ? { ok: false, results: [{ name: 'lint', ok: false, status: 1, detail: 'playwright config unreadable' }] }
            : { ok: true, results: [{ name: 'lint', ok: true, status: 0, detail: 'passed' }] };
        },
        // Different files each attempt, which is what makes the second repair a different
        // one rather than the first one finished.
        changedFiles: () => [`src/attempt-${iteration}.ts`],
        review: () => ({
          ok: true,
          costUsd: 0,
          tokens: 1,
          raw: '',
          text: JSON.stringify({ requirements: [{ id: 'PRD-1.1', status: 'fail', evidence: null, detail: 'missing' }] }),
        }),
        extractLesson: (evidence) => {
          extractions.push(evidence);
          return {
            ok: true,
            costUsd: 0,
            tokens: 5,
            raw: '',
            text: JSON.stringify({
              lesson: 'Read the playwright config before assuming the browser is missing.',
              trigger: ['playwright', 'prd-1.1'],
              scope: ['e2e'],
              evidence: { introduced: 1, resolved: 3, tests: [] },
            }),
          };
        },
      },
      { maxIterations: 4, stallLimit: 9 },
    );

    assert.equal(extractions.length, 1, `expected exactly one extraction, got ${extractions.length}`);
    assert.equal(extractions[0].includes('gate:lint'), true);
    assert.equal(extractions[0].includes('First observed on iteration 1'), true);

    const stored = JSON.parse(readFileSync(path.join(dareDir, 'lessons.json'), 'utf8'));
    assert.equal(stored.version, 1);
    assert.deepStrictEqual(
      stored.lessons.map((/** @type {{ id: string }} */ lesson) => lesson.id),
      ['lesson-0001'],
    );
    // The evidence is the driver's, not the extractor's.
    assert.deepStrictEqual(stored.lessons[0].evidence.introduced, 1);
    assert.deepStrictEqual(stored.lessons[0].evidence.resolved, 3);

    // And it reaches a later brief, because its trigger matches that objective.
    const later = readFileSync(path.join(dareDir, 'briefs', 'iter-004.md'), 'utf8');
    assert.equal(later.includes('Read the playwright config'), true, 'the stored lesson never reached a brief');
  });

  it('does not let a broken lesson extractor end an otherwise healthy run', () => {
    // Lesson memory is advisory. Nothing it does may decide a run.
    const { outcome } = run(
      {
        readTestReports: () => [ONE_PASSING],
        extractLesson: () => {
          throw new Error('the extractor exploded');
        },
      },
      { maxIterations: 2 },
    );
    assert.equal(outcome.state, 'SHIPPED');
  });

  it('races only once the loop has stalled, and skips the ordinary build when a winner lands', () => {
    let builds = 0;
    /** @type {number[]} */
    const raced = [];
    run(
      {
        // Nothing passes, so no iteration improves anything and the stall counter climbs.
        readTestReports: () => [{ numTotalTests: 0, testResults: [] }],
        gates: () => ({ ok: false, results: [{ name: 'lint', ok: false, status: 1, detail: 'no' }] }),
        build: (brief) => {
          builds += 1;
          void brief;
          return { ok: true, text: '', costUsd: 0, tokens: 100, raw: '' };
        },
        race: (objective, iterationNumber) => {
          raced.push(iterationNumber);
          void objective;
          return { applied: true, detail: 'candidate 1 won', tokens: 200, costUsd: 0 };
        },
      },
      { maxIterations: 4, stallLimit: 9, race: { enabled: true, n: 2, after: 1 } },
    );

    // Iteration 1 cannot race: nothing has stalled yet. Iteration 4 cannot either — a race
    // needs one iteration to run and one to land the winner, and there is only one left.
    assert.deepStrictEqual(raced, [2, 3]);
    assert.equal(builds, 2, 'the ordinary builder ran during an iteration a race had already won');
  });

  it('never races while racing is disabled, however long the loop stalls', () => {
    let raced = 0;
    run(
      {
        readTestReports: () => [{ numTotalTests: 0, testResults: [] }],
        gates: () => ({ ok: false, results: [{ name: 'lint', ok: false, status: 1, detail: 'no' }] }),
        race: () => {
          raced += 1;
          return { applied: false, detail: 'should never happen', tokens: 0, costUsd: 0 };
        },
      },
      { maxIterations: 4, stallLimit: 9 },
    );
    assert.equal(raced, 0);
  });

  it('falls back to the ordinary builder when a race produces no winner', () => {
    let builds = 0;
    run(
      {
        readTestReports: () => [{ numTotalTests: 0, testResults: [] }],
        gates: () => ({ ok: false, results: [{ name: 'lint', ok: false, status: 1, detail: 'no' }] }),
        build: () => {
          builds += 1;
          return { ok: true, text: '', costUsd: 0, tokens: 100, raw: '' };
        },
        race: () => ({ applied: false, detail: 'no candidate passed every gate', tokens: 50, costUsd: 0 }),
      },
      { maxIterations: 3, stallLimit: 9, race: { enabled: true, n: 2, after: 1 } },
    );
    assert.equal(builds, 3, 'a race that landed nothing should still leave the iteration a builder');
  });

  it('refuses to start when no reviewer owns a required id', () => {
    // Before the panel, not during it. An unowned id would ship having never been judged,
    // and discovering that after paying for three whole-repository reads is too late.
    assert.throws(
      () =>
        driveRun({
          config: { ...defaultConfig(), reviewers: ['security'] },
          dareDir: makeTempDir(),
          rootDir: makeTempDir(),
          requiredIds: ['PRD-1.1', 'DoD-2-security'],
          task: 'x',
          effects: effectsWith({}),
        }),
      (/** @type {Error} */ error) => error instanceof DriverError && error.message.includes('PRD-1.1'),
    );
  });

  it('lands on BUDGET, not ABORTED, when the builder runs out of allowance', () => {
    /** @type {string[]} */
    const commits = [];
    const { outcome } = run({
      readTestReports: () => [ONE_PASSING],
      build: () => ({ ok: false, text: '', costUsd: 0.2, tokens: 5, raw: 'rate limit reached', exhausted: true }),
      commit: (message) => {
        commits.push(message);
        return 'wip1';
      },
    });
    assert.equal(outcome.state, 'BUDGET');
    assert.equal(outcome.reason.includes('can resume'), true);
    assert.equal(commits.length, 1, 'the work in the tree must be committed before stopping');
    assert.equal(commits[0].includes('work in progress'), true);
  });

  it('commits the tree even when the builder failed for an ordinary reason', () => {
    // Leaving it dirty strands the run: the next preflight refuses a dirty tree.
    /** @type {string[]} */
    const commits = [];
    const { outcome } = run({
      build: () => ({ ok: false, text: '', costUsd: 0, tokens: 0, raw: 'no auth' }),
      commit: (message) => {
        commits.push(message);
        return 'wip1';
      },
    });
    assert.equal(outcome.state, 'ABORTED');
    assert.equal(commits.length, 1);
  });

  it('stops instead of scoring a dead reviewer as a failing audit', () => {
    // Scoring it would hand the builder "output could not be parsed" as though it were a
    // finding, and burn every remaining iteration against a wall that will not move.
    let reviews = 0;
    const { outcome } = run(
      {
        readTestReports: () => [ONE_PASSING],
        review: () => {
          reviews += 1;
          return { ok: false, costUsd: 0, tokens: 0, raw: 'rate limit reached', text: '', exhausted: true };
        },
      },
      { maxIterations: 5 },
    );
    assert.equal(outcome.state, 'BUDGET');
    assert.equal(reviews, 1, 'must not keep calling a reviewer that cannot run');
    assert.equal(outcome.iterations, 0, 'must not burn iterations against the wall');
  });

  it('leaves lastGoodCommit alone when it lands early, so the ratchet stays trustworthy', () => {
    const { dareDir } = run(
      {
        readTestReports: () => [ONE_PASSING],
        review: () => ({ ok: false, costUsd: 0, tokens: 0, raw: 'rate limit', text: '', exhausted: true }),
      },
      { maxIterations: 5 },
      ['test/a.test.js::works'],
    );
    const state = loadState(dareDir);
    assert.notEqual(state.lastGoodCommit, 'wip1');
    assert.deepStrictEqual(state.passing, ['test/a.test.js::works']);
  });

  it('still reports what the run spent when it lands early', () => {
    const { outcome } = run({
      build: () => ({ ok: false, text: '', costUsd: 0.42, tokens: 7, raw: 'rate limit', exhausted: true }),
    });
    assert.equal(outcome.costUsd, 0.42);
    assert.equal(outcome.spentTokens, 7);
  });

  it('accumulates the real cost and tokens the children reported', () => {
    const { outcome } = run(
      {
        readTestReports: () => [ONE_PASSING],
        build: () => ({ ok: true, text: '', costUsd: 0.5, tokens: 40, raw: '' }),
        review: () => ({
          ok: true,
          costUsd: 0.25,
          tokens: 10,
          raw: '',
          text: JSON.stringify({ requirements: [GOOD_ENTRY] }),
        }),
      },
      { maxIterations: 3 },
    );
    assert.equal(outcome.state, 'SHIPPED');
    assert.equal(outcome.costUsd, 0.75);
    assert.equal(outcome.spentTokens, 50);
  });
});

// ---------------------------------------------------------------------------
// The CLI surface and the gates it assembles
// ---------------------------------------------------------------------------

describe('parseDriverArgs', () => {
  it('reads a quoted idea as the input', () => {
    assert.deepStrictEqual(parseDriverArgs(['a', 'todo', 'app']), {
      input: 'a todo app',
      yes: false,
      confirmPrd: false,
    });
  });

  it('reads a path as the input', () => {
    assert.equal(parseDriverArgs(['./PRD.md']).input, './PRD.md');
  });

  it('treats no arguments as no input, which is dare-me mode', () => {
    assert.equal(parseDriverArgs([]).input, '');
  });

  it('keeps flags out of the input', () => {
    assert.deepStrictEqual(parseDriverArgs(['--yes', 'an', 'idea', '--confirm-prd']), {
      input: 'an idea',
      yes: true,
      confirmPrd: true,
    });
  });
});

describe('requiredIdsFor', () => {
  it('finds every PRD id and appends the six DoD lines', () => {
    const prd = 'PRD-1.1 does a thing.\nPRD-2.3 does another.\nPRD-1.2 and one more.';
    assert.deepStrictEqual(requiredIdsFor(prd), [
      'PRD-1.1',
      'PRD-1.2',
      'PRD-2.3',
      'DoD-1-requirements',
      'DoD-2-security',
      'DoD-3-ci',
      'DoD-4-docs-observability',
      'DoD-5-design',
      'DoD-6-adversarial-input',
    ]);
  });

  it('deduplicates an id mentioned more than once', () => {
    assert.deepStrictEqual(requiredIdsFor('PRD-1.1 here and PRD-1.1 again').slice(0, 1), ['PRD-1.1']);
  });

  it('still requires the DoD lines when the PRD has no numbered requirements', () => {
    assert.equal(requiredIdsFor('a prose document').length, 6);
  });

  // Dogfood run 9, 12 August 2026. Three cold reviewers independently found that an
  // unterminated quote makes the shipped binary report statistics over half its input at
  // exit 0. Each ran it. Each wrote `status: fail` with `src/csv.ts:21`. The run shipped
  // `panel unanimous on 15 requirement(s)` anyway, because no *required* id covered the
  // finding — the PRD never mentions unterminated quotes, and the code satisfies every
  // requirement it does mention. So all three filed it as `advisory-`, and §4.1 says an
  // advisory may not move the verdict in either direction.
  //
  // 0.58.0 widened the reviewer's remit to fail exactly this and it worked perfectly. What
  // did not exist was a channel where the answer could block. This id is that channel.
  it('requires an adversarial-input line, because run 9 shipped a wrong answer at exit 0', () => {
    assert.equal(requiredIdsFor('PRD-1.1 x').includes('DoD-6-adversarial-input'), true);
  });

  it('gives the adversarial-input line an owner, or no reviewer is ever asked about it', () => {
    // An uncovered id ends the run before a reviewer is spawned (§1.1), so adding a required
    // id without an owner would turn every run into an abort. Correctness owns it: it is a
    // question about whether the program tells the truth, not about security or design.
    const covered = Object.values(DEFAULT_OWNERSHIP).flat();
    assert.equal(covered.includes('DoD-6-adversarial-input'), true);
  });
});

describe('commandGates', () => {
  it('covers every deterministic gate DESIGN.md phase 3 names', () => {
    assert.deepStrictEqual(
      commandGates('/repo', '/repo/.dare').map((gate) => gate.name),
      ['build', 'lint', 'types', 'unit', 'e2e', 'security-audit'],
    );
  });

  it('points the unit reporter at the file the ratchet reads', () => {
    const unit = commandGates('/repo', '/repo/.dare').find((gate) => gate.name === 'unit');
    assert.equal(unit?.command.includes(`--outputFile=${path.join('/repo/.dare', 'test-report.json')}`), true);
  });

  it('produces the exact commands the extraction was supposed to preserve', () => {
    // The whole safety argument for extracting a toolchain interface is that the first
    // implementation through it behaves identically to the six lines it replaced. Asserting
    // the argv, not just the names, is what makes that checkable rather than asserted.
    assert.deepStrictEqual(
      commandGates('/repo', '/repo/.dare').map((gate) => gate.command),
      [
        ['npm', 'run', 'build'],
        ['npm', 'run', 'lint'],
        ['npm', 'run', 'typecheck'],
        ['npx', 'vitest', 'run', '--reporter=json', `--outputFile=${path.join('/repo/.dare', 'test-report.json')}`],
        ['npx', 'playwright', 'test'],
        ['npm', 'audit', '--audit-level=high'],
      ],
    );
  });

  it('marks every gate required, because none of them is advisory', () => {
    assert.equal(
      commandGates('/repo', '/repo/.dare').every((gate) => gate.required === true),
      true,
    );
  });
});

describe('staticGates', () => {
  /** @param {Record<string, string>} files */
  function repoWith(files) {
    const dir = makeTempDir();
    for (const [relative, contents] of Object.entries(files)) {
      const full = path.join(dir, relative);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, contents, 'utf8');
    }
    return dir;
  }

  const PROSE = 'x'.repeat(400);

  it('fails the evidence gates on an empty repository', () => {
    // gate-integrity is the exception, and deliberately: an empty repository has no
    // package.json, so nothing has been weakened yet. It is not standing there alone -
    // the `lint` and `types` command gates already fail on a repository with no scripts,
    // and reporting the same absence twice under two names would be noise, not rigour.
    assert.deepStrictEqual(
      staticGates(repoWith({})).map((gate) => [gate.name, gate.ok]),
      [
        ['ci', false],
        ['docs', false],
        ['observability', false],
        ['gate-integrity', true],
      ],
    );
  });

  it('fails gate-integrity when the repository stubs out a gate it is judged by', () => {
    const dir = repoWith({ 'package.json': JSON.stringify({ scripts: { lint: 'true' } }) });
    const integrity = staticGates(dir).find((gate) => gate.name === 'gate-integrity');
    assert.equal(integrity?.ok, false);
    assert.equal(integrity?.detail, 'npm script "lint" runs nothing: "true"');
  });

  /** A workflow that really runs the validation set DoD line 3 asks for. */
  const REAL_WORKFLOW = [
    'on: push',
    'jobs:',
    '  check:',
    '    steps:',
    '      - run: npm run build',
    '      - run: npm run lint',
    '      - run: npm run typecheck',
    '      - run: npx vitest run',
    '      - run: npx playwright test',
  ].join('\n');

  it('passes ci when a workflow runs the whole validation set', () => {
    const gate = staticGates(repoWith({ '.github/workflows/ci.yml': REAL_WORKFLOW })).find((g) => g.name === 'ci');
    assert.equal(gate?.ok, true);
    assert.equal(gate?.detail.includes('build'), true);
  });

  it('fails ci for a workflow that exists but runs nothing', () => {
    // The presence check this replaced passed on exactly this file. A builder under
    // pressure to satisfy a gate called `ci` writes the smallest file that quiets it.
    const gate = staticGates(repoWith({ '.github/workflows/ci.yml': 'on: push' })).find((g) => g.name === 'ci');
    assert.equal(gate?.ok, false);
    assert.equal(gate?.detail.includes('never run'), true);
  });

  it('fails ci when the workflow runs some commands but not all of them', () => {
    const partial = ['on: push', 'jobs:', '  check:', '    steps:', '      - run: npm run lint'].join('\n');
    const gate = staticGates(repoWith({ '.github/workflows/ci.yml': partial })).find((g) => g.name === 'ci');
    assert.equal(gate?.ok, false);
    assert.equal(gate?.detail.includes('types'), true, `expected the missing commands named, got ${gate?.detail}`);
  });

  it('fails ci when there is no workflow at all', () => {
    const gate = staticGates(repoWith({ '.github/workflows/notes.txt': 'x' })).find((g) => g.name === 'ci');
    assert.equal(gate?.ok, false);
    assert.equal(gate?.detail, 'no workflow under .github/workflows');
  });

  it('reads the validation set across several workflow files', () => {
    // Splitting lint and tests across two workflows is normal, and is not a failure.
    const dir = repoWith({
      '.github/workflows/lint.yml': 'steps:\n  - run: npm run lint\n  - run: npm run typecheck',
      '.github/workflows/test.yml': 'steps:\n  - run: npm run build\n  - run: npx vitest run\n  - run: npx playwright test',
    });
    assert.equal(staticGates(dir).find((gate) => gate.name === 'ci')?.ok, true);
  });

  it('fails docs when a required document is a stub rather than absent', () => {
    const dir = repoWith({ 'README.md': PROSE, 'docs/api-contract.md': '# TODO\n' });
    const docs = staticGates(dir).find((gate) => gate.name === 'docs');
    assert.equal(docs?.ok, false);
    assert.equal(docs?.detail.includes('docs/api-contract.md'), true);
  });

  it('passes docs when both documents are substantial', () => {
    const dir = repoWith({ 'README.md': PROSE, 'docs/api-contract.md': PROSE });
    assert.equal(staticGates(dir).find((gate) => gate.name === 'docs')?.ok, true);
  });

  it('requires both structured logging and a health endpoint for observability', () => {
    const loggerOnly = repoWith({ 'src/app.ts': 'logger.info("up");' });
    const healthOnly = repoWith({ 'src/app.ts': 'app.get("/health", handler);' });
    const both = repoWith({ 'src/app.ts': 'logger.info("up");\napp.get("/healthz", handler);' });
    assert.equal(staticGates(loggerOnly).find((gate) => gate.name === 'observability')?.ok, false);
    assert.equal(staticGates(healthOnly).find((gate) => gate.name === 'observability')?.ok, false);
    assert.equal(staticGates(both).find((gate) => gate.name === 'observability')?.ok, true);
  });

  it('reports which validation commands a workflow covers', () => {
    const dir = repoWith({ '.github/workflows/ci.yml': REAL_WORKFLOW });
    const inspected = inspectCiWorkflows(dir);
    assert.deepStrictEqual(inspected.workflows, ['ci.yml']);
    assert.deepStrictEqual(inspected.covered, ['build', 'lint', 'types', 'unit', 'e2e']);
    assert.deepStrictEqual(inspected.missing, []);
  });

  it('refuses a workflow whose unit step is a runner the unit gate cannot collect', () => {
    // The contradiction this closes, in full. `CI_REQUIRED_COMMANDS` accepted `node --test`
    // while the unit gate ran `npx vitest run --reporter=json`, so a project could satisfy
    // the ci gate with a suite the ratchet would never see a single id from. That is not
    // hypothetical: both live runs on 10 August 2026 wrote correct `node:test` suites and
    // the gate reported zero tests. Now CI and the gate come from one toolchain table.
    const dir = repoWith({
      '.github/workflows/ci.yml': [
        'steps:',
        '  - run: npm run build',
        '  - run: npm run lint',
        '  - run: npm run typecheck',
        '  - run: node --test',
        '  - run: npx playwright test',
      ].join('\n'),
    });
    const inspected = inspectCiWorkflows(dir);
    assert.deepStrictEqual(inspected.missing, ['unit']);
    assert.equal(staticGates(dir).find((gate) => gate.name === 'ci')?.ok, false);
  });

  /**
   * The whole validation set except the browser step - what an honest api project's CI
   * looks like.
   */
  const BROWSERLESS_WORKFLOW = [
    'on: push',
    'jobs:',
    '  check:',
    '    steps:',
    '      - run: npm run build',
    '      - run: npm run lint',
    '      - run: npm run typecheck',
    '      - run: npx vitest run',
  ].join('\n');

  it('does not require a browser step in CI from a project with no browser', () => {
    // The defect, as observed live. `toolchain.ci` requires Playwright unconditionally, so an
    // api project whose `e2e` gate had just been declined as inapplicable still could not
    // satisfy `ci` - not by any honest workflow. Dogfood run 2's `.dare/assumptions.json`
    // records the builder reasoning about that exact contradiction and resolving it with
    // `npx playwright test` under `continue-on-error: true`; run 3's cold panel then reported
    // that step as one that always succeeds by construction. The loop built the defect it caught.
    const dir = repoWith({ '.github/workflows/ci.yml': BROWSERLESS_WORKFLOW });
    const gate = staticGates(dir, { capabilities: ['api', 'persistent-storage'] }).find((g) => g.name === 'ci');
    assert.equal(gate?.ok, true, `expected ci to pass without a browser step, got: ${gate?.detail}`);
  });

  it('names the requirement it dropped, and why, in the ci detail', () => {
    // A skip nobody can read is a skip nobody can audit. `running build, lint, types, unit`
    // alone does not distinguish a project that needs four steps from one being let off a fifth.
    const dir = repoWith({ '.github/workflows/ci.yml': BROWSERLESS_WORKFLOW });
    const gate = staticGates(dir, { capabilities: ['api'] }).find((g) => g.name === 'ci');
    assert.equal(gate?.detail.includes('not required here: e2e'), true, `got: ${gate?.detail}`);
    assert.equal(gate?.detail.includes('none of web-ui, desktop-ui'), true, `got: ${gate?.detail}`);
  });

  it('still requires the browser step in CI from a project that has a browser', () => {
    // The benign neighbour. A filter that dropped `e2e` for everybody would read exactly like
    // this fix from a green suite, and would have removed the check rather than scoped it.
    const dir = repoWith({ '.github/workflows/ci.yml': BROWSERLESS_WORKFLOW });
    const gate = staticGates(dir, { capabilities: ['web-ui'] }).find((g) => g.name === 'ci');
    assert.equal(gate?.ok, false);
    assert.equal(gate?.detail.includes('never run: e2e'), true, `got: ${gate?.detail}`);
  });

  it('drops only the conditional step, never a universal one', () => {
    // `ci` itself stays universal - the validation set has to run somewhere. What is filtered
    // is which steps it demands, and only the gates §4.2 marks conditional may be dropped.
    const inspected = inspectCiWorkflows(repoWith({ '.github/workflows/ci.yml': 'on: push' }), ['api']);
    assert.deepStrictEqual(inspected.missing, ['build', 'lint', 'types', 'unit']);
    assert.deepStrictEqual(
      inspected.excluded.map((entry) => entry.operation),
      ['e2e'],
    );
  });

  it('requires every step when no capabilities are supplied', () => {
    // The safe direction, asserted rather than assumed: a caller that forgets to thread
    // capabilities over-applies CI. The opposite default would silently drop a required step,
    // and a gate that quietly stops being required is the failure this repo does not get to ship.
    const inspected = inspectCiWorkflows(repoWith({ '.github/workflows/ci.yml': BROWSERLESS_WORKFLOW }));
    assert.deepStrictEqual(inspected.missing, ['e2e']);
    assert.deepStrictEqual(inspected.excluded, []);
  });

  it('treats a project with no capabilities at all as browserless', () => {
    // Distinct from omitting the argument. `[]` is an answer - a CLI or a library - and it
    // filters; `undefined` is the absence of one, and it does not.
    const inspected = inspectCiWorkflows(repoWith({ '.github/workflows/ci.yml': BROWSERLESS_WORKFLOW }), []);
    assert.deepStrictEqual(inspected.missing, []);
    assert.deepStrictEqual(
      inspected.excluded.map((entry) => entry.operation),
      ['e2e'],
    );
  });

  it('passes capabilities at every call site in the driver, not just where a test can reach', () => {
    // The functions above are unit-testable; the wiring is not. `gateTree` lives inside `main`
    // and `driveRun` receives `gates` as an injected effect, so no unit test executes the real
    // call - which means reverting it to `staticGates(dir, { run: shell })` leaves the whole
    // suite green while every browserless project silently goes back to failing `ci` forever.
    // Asserted structurally instead, in the same shape as the run manifest's no-reader test.
    // The first version of this test read the whole source line and passed with the call site
    // reverted, because `applicableGates(staticGates(dir, { run: shell }), capabilities)` still
    // contains the word `capabilities` - just not as an argument to the call being checked. So
    // the arguments are isolated by balancing parentheses. A structural test that matches the
    // wrong text is worse than no test: it reports coverage it does not have.
    const source = readFileSync(new URL('../scripts/driver.mjs', import.meta.url), 'utf8');

    /** @type {string[]} */
    const argumentLists = [];
    const call = 'staticGates(';
    for (let at = source.indexOf(call); at !== -1; at = source.indexOf(call, at + 1)) {
      if (source.slice(0, at).endsWith('export function ')) continue;
      let depth = 0;
      let end = at + call.length - 1;
      do {
        if (source[end] === '(') depth += 1;
        else if (source[end] === ')') depth -= 1;
        end += 1;
      } while (depth > 0 && end < source.length);
      argumentLists.push(source.slice(at + call.length, end - 1));
    }

    assert.equal(argumentLists.length > 0, true, 'staticGates is no longer called from the driver at all');
    for (const args of argumentLists) {
      assert.equal(
        args.includes('capabilities'),
        true,
        `staticGates is called without capabilities, so ci will demand a browser step from a ` +
          `project with no browser: staticGates(${args})`,
      );
    }
  });

  it('finds the start command only when the package really declares one', () => {
    assert.equal(startCommand(repoWith({ 'package.json': '{"scripts":{"start":"node server.js"}}' })), 'npm start');
    assert.equal(startCommand(repoWith({ 'package.json': '{"scripts":{"build":"tsc"}}' })), null);
    assert.equal(startCommand(repoWith({ 'package.json': '{ broken' })), null);
    assert.equal(startCommand(repoWith({})), null);
  });

  it('probes the health endpoint when the application declares how to start', () => {
    // The static check is satisfied by the string being present. This one asks.
    /** @type {string[][]} */
    const invoked = [];
    const dir = repoWith({
      'src/app.ts': 'logger.info("up");\napp.get("/healthz", handler);',
      'package.json': '{"scripts":{"start":"node server.js"}}',
    });
    const gate = observabilityGate(dir, {
      run: (command, args) => {
        invoked.push([command, ...args]);
        return { ok: true, status: 0, stdout: 'health endpoint answered 200', stderr: '' };
      },
    });
    assert.equal(gate.ok, true);
    assert.equal(invoked.length, 1);
    assert.equal(invoked[0].includes('--path'), true);
    assert.equal(invoked[0].includes('/healthz'), true, `probed the wrong path: ${invoked[0].join(' ')}`);
    assert.equal(invoked[0].includes('npm start'), true);
  });

  it('fails observability when the health endpoint does not answer', () => {
    const dir = repoWith({
      'src/app.ts': 'logger.info("up");\napp.get("/health", handler);',
      'package.json': '{"scripts":{"start":"node server.js"}}',
    });
    const gate = observabilityGate(dir, {
      run: () => ({ ok: false, status: 1, stdout: 'health endpoint answered 404', stderr: '' }),
    });
    assert.equal(gate.ok, false);
    assert.equal(gate.detail.includes('404'), true);
  });

  it('says so when it passed observability without probing anything', () => {
    // Honest about being a static finding rather than claiming it asked.
    const dir = repoWith({ 'src/app.ts': 'logger.info("up");\napp.get("/health", handler);' });
    const gate = observabilityGate(dir, { run: () => ({ ok: true, status: 0, stdout: '', stderr: '' }) });
    assert.equal(gate.ok, true);
    assert.equal(gate.detail.includes('not probed'), true);
  });

  it('never reaches the probe when the source has no health endpoint at all', () => {
    let probed = false;
    const dir = repoWith({ 'src/app.ts': 'logger.info("up");', 'package.json': '{"scripts":{"start":"node s.js"}}' });
    const gate = observabilityGate(dir, {
      run: () => {
        probed = true;
        return { ok: true, status: 0, stdout: '', stderr: '' };
      },
    });
    assert.equal(gate.ok, false);
    assert.equal(probed, false, 'started an application to look for a route that is not written');
  });

  it('does not count a health route found inside node_modules', () => {
    const dir = repoWith({
      'node_modules/pkg/index.js': 'logger.info("x");\napp.get("/health", h);',
      'src/app.ts': 'export const x = 1;',
    });
    assert.equal(staticGates(dir).find((gate) => gate.name === 'observability')?.ok, false);
  });
});

describe('red-evidence', () => {
  it('passes when every newly passing test was seen failing first', () => {
    const gate = redEvidenceGate({ previousPassing: ['a::1'], passing: ['a::1', 'b::2'], redSeen: ['b::2'] });
    assert.equal(gate.ok, true);
  });

  it('withholds ratchet credit from a test that has only ever been green', () => {
    const gate = redEvidenceGate({ previousPassing: ['a::1'], passing: ['a::1', 'b::2'], redSeen: [] });
    // Reports, does not block. The deterrent is that b::2 earns no protection, not that the
    // iteration dies — blocking deadlocked the ratchet, measured across four iterations.
    assert.equal(gate.ok, true);
    assert.equal(gate.detail.includes('b::2'), true);
    assert.deepEqual([...unprovenIds({ previousPassing: [], passing: ['a::1', 'b::2'], redSeen: ['a::1'] })], ['b::2']);
  });

  it('never blocks an iteration, whatever it finds', () => {
    // The deadlock in one assertion. Advancing the ratchet requires every gate to pass;
    // red-evidence used to be a gate that could only pass once the ratchet had advanced.
    for (const passing of [[], ['a::1'], ['a::1', 'b::2', 'c::3']]) {
      assert.equal(redEvidenceGate({ previousPassing: [], passing, redSeen: [] }).ok, true);
    }
  });

  it('does not re-judge tests the ratchet already holds', () => {
    assert.equal(redEvidenceGate({ previousPassing: ['a::1'], passing: ['a::1'], redSeen: [] }).ok, true);
  });

  it('names every unproven test, sorted', () => {
    const gate = redEvidenceGate({ previousPassing: [], passing: ['z::1', 'a::1'], redSeen: [] });
    assert.equal(gate.detail.endsWith('a::1, z::1'), true);
  });

  it('accumulates evidence across iterations and survives a reload', () => {
    const dir = makeTempDir();
    assert.deepStrictEqual([...loadRedEvidence(dir).seenFailing], []);
    recordRedEvidence(dir, ['b::2']);
    recordRedEvidence(dir, ['c::3', 'b::2']);
    assert.deepStrictEqual([...loadRedEvidence(dir).seenFailing].sort(), ['b::2', 'c::3']);
  });

  it('treats unreadable evidence as no evidence, so new tests stay unproven', () => {
    const dir = makeTempDir();
    writeFileSync(path.join(dir, 'red-evidence.json'), '{ not json', 'utf8');
    assert.deepStrictEqual([...loadRedEvidence(dir).seenFailing], []);
  });

  describe('the first gating is baselined, or the objective is unsatisfiable', () => {
    // Measured on 11 August 2026: a builder wrote a complete application whose 83 tests all
    // passed on the first gate run. Every one was "unproven", the gate failed, and the
    // objective handed back was "make these gates pass" — which cannot be satisfied, because
    // a builder cannot make an already-green test have been red. Four iterations of that ends
    // STALLED without reaching a reviewer. Same shape as the e2e gate failing a CLI forever.

    it('withholds every id when there is no baseline, but does not block', () => {
      // Both halves of the history are visible here. Blocking is what deadlocked the run;
      // withholding is what §8 always specified.
      const evidence = { previousPassing: [], passing: ['a::1', 'b::2'], redSeen: [] };
      assert.equal(redEvidenceGate(evidence).ok, true);
      assert.deepEqual([...unprovenIds(evidence)].sort(), ['a::1', 'b::2']);
    });

    it('admits the ids present at the first gating', () => {
      const gate = redEvidenceGate({
        previousPassing: [],
        passing: ['a::1', 'b::2'],
        redSeen: [],
        baseline: ['a::1', 'b::2'],
      });
      assert.equal(gate.ok, true);
    });

    it('says how many it admitted and why, rather than reporting a clean pass', () => {
      // A silent exemption is the thing this codebase refuses everywhere else. The detail
      // states the count and names what covers those ids instead.
      const gate = redEvidenceGate({ previousPassing: [], passing: ['a::1'], redSeen: [], baseline: ['a::1'] });
      assert.equal(gate.detail.includes('1 in the first-gating baseline'), true);
      assert.equal(gate.detail.includes('mutation and assertion checks'), true);
    });

    it('still demands red history for anything added after the baseline', () => {
      // Where satisficing actually happens: a builder adds a green test to lift a score. The
      // baseline covers the first batch and nothing else.
      const gate = redEvidenceGate({
        previousPassing: [],
        passing: ['a::1', 'later::9'],
        redSeen: [],
        baseline: ['a::1'],
      });
      assert.equal(gate.ok, true, 'red-evidence must not block; that deadlocked the ratchet');
      assert.equal(gate.detail.includes('later::9'), true);
      assert.equal(gate.detail.includes('a::1'), false, 'a baselined id was reported unproven');
      // The id added later earns no credit; the baselined one keeps it.
      const withheld = unprovenIds({
        previousPassing: [],
        passing: ['a::1', 'later::9'],
        redSeen: [],
        baseline: ['a::1'],
      });
      assert.deepEqual([...withheld], ['later::9']);
    });

    it('writes the baseline exactly once, on the first gating', () => {
      const dir = makeTempDir();
      const first = recordRedEvidence(dir, [], ['a::1', 'b::2']);
      assert.deepStrictEqual([...first.baseline].sort(), ['a::1', 'b::2']);
      // A later gating with more passing tests must not widen it — that would baseline every
      // test ever written and retire the gate.
      const second = recordRedEvidence(dir, [], ['a::1', 'b::2', 'c::3']);
      assert.deepStrictEqual([...second.baseline].sort(), ['a::1', 'b::2']);
      assert.deepStrictEqual([...loadRedEvidence(dir).baseline].sort(), ['a::1', 'b::2']);
    });

    it('counts a first gating that found no tests as having happened', () => {
      // Otherwise the baseline moment slides to whichever later iteration first produced a
      // green suite, which is exactly the widening the previous test forbids.
      const dir = makeTempDir();
      recordRedEvidence(dir, [], []);
      const later = recordRedEvidence(dir, [], ['a::1']);
      assert.deepStrictEqual([...later.baseline], []);
    });
  });
});

// ---------------------------------------------------------------------------
// Run state must never enter the target repository's history
// ---------------------------------------------------------------------------

describe('suiteSensitivityEvidence', () => {
  // The first SHIPPED this project produced had `seenFailing: []` and a mutation gate that
  // declined on the shipping iteration. Both mechanisms that prove a suite bites were absent
  // from the iteration that made the claim, and an independent audit had to mutate the code
  // itself to establish what the loop should have. The tests were good - 15 of 15 mutations
  // killed - which is the point: SHIPPED asserted something nothing had checked.
  const red = (/** @type {string[]} */ ids) => ({ seenFailing: new Set(ids) });
  const gates = (/** @type {{name: string, ok: boolean}[]} */ results) => ({
    results: results.map((r) => ({ ...r, status: r.ok ? 0 : 1, detail: '' })),
  });

  it('accepts a passing mutation gate as direct proof', () => {
    const verdict = suiteSensitivityEvidence(gates([{ name: 'mutation', ok: true }]), red([]));
    assert.equal(verdict.proven, true);
    assert.equal(verdict.how.includes('mutation gate passed'), true);
  });

  it('accepts a test observed failing, which is weaker but not vacuous', () => {
    const verdict = suiteSensitivityEvidence(gates([{ name: 'lint', ok: true }]), red(['a::1']));
    assert.equal(verdict.proven, true);
    assert.equal(verdict.how.includes('observed failing'), true);
  });

  it('reproduces the shipping iteration that had neither', () => {
    // A declined mutation gate produces no result at all, which is exactly how it looked.
    const verdict = suiteSensitivityEvidence(gates([{ name: 'lint', ok: true }]), red([]));
    assert.equal(verdict.proven, false);
    assert.equal(verdict.how.includes('did not run and pass'), true);
  });

  it('does not accept a mutation gate that ran and failed', () => {
    // The neighbour. Surviving mutants are the opposite of proof, and a check that counted any
    // mutation result would have inverted the meaning of the gate.
    assert.equal(suiteSensitivityEvidence(gates([{ name: 'mutation', ok: false }]), red([])).proven, false);
  });
});

describe('recordPanelVerdict', () => {
  // An independent audit of the first SHIPPED this project produced could not verify the claim
  // behind it: "the evidence for it is not in the repo". All that existed was an unannotated
  // dare/GRAND-PRIZE tag on a commit named "iteration 2". The loop persisted reality-check.md,
  // which only ever explains an ABORTED - it recorded its excuses and not its verdicts.

  /** @param {number} iteration @param {string} verdict */
  const entry = (iteration, verdict) => ({
    iteration,
    verdict,
    requireUnanimous: true,
    requiredIds: ['PRD-1.1'],
    failing: verdict === 'pass' ? [] : ['PRD-1.1'],
    reviewers: [{ requirements: [{ id: 'PRD-1.1', verdict }] }],
    advisories: [],
  });

  it('writes the verdict where an auditor can disagree with it', () => {
    const dareDir = path.join(makeTempDir(), '.dare');
    const file = recordPanelVerdict(dareDir, entry(1, 'fail'));
    const stored = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(stored.panels.length, 1);
    assert.equal(stored.panels[0].verdict, 'fail');
    assert.deepStrictEqual(stored.panels[0].failing, ['PRD-1.1']);
    assert.equal(stored.panels[0].requireUnanimous, true);
  });

  it('appends, because the sequence across iterations is the interesting part', () => {
    // Run 5's panel went 5 findings, then 4, then 3. That convergence existed only in a log,
    // and a log is what a hard reset destroyed in run 4.
    const dareDir = path.join(makeTempDir(), '.dare');
    recordPanelVerdict(dareDir, entry(1, 'fail'));
    const file = recordPanelVerdict(dareDir, entry(2, 'pass'));
    const stored = JSON.parse(readFileSync(file, 'utf8'));
    assert.deepStrictEqual(
      stored.panels.map((/** @type {{ iteration: number }} */ p) => p.iteration),
      [1, 2],
    );
  });

  it('rebuilds from a corrupt record rather than killing a healthy run', () => {
    // This file decides nothing, so it degrades like the lesson store and not like the ratchet.
    const dareDir = path.join(makeTempDir(), '.dare');
    mkdirSync(dareDir, { recursive: true });
    writeFileSync(path.join(dareDir, 'review.json'), '{ not json', 'utf8');
    const stored = JSON.parse(readFileSync(recordPanelVerdict(dareDir, entry(3, 'pass')), 'utf8'));
    assert.equal(stored.panels.length, 1);
    assert.equal(stored.panels[0].iteration, 3);
  });

  it('is never tracked by git, so a reset cannot revert the evidence', () => {
    const ignored = String(dareIgnoreUpdate('')).split('\n').map((line) => line.trim());
    assert.equal(ignored.includes('.dare/review.json'), true);
  });
});

describe('the ratchet is told how many tests were collected', () => {
  it('passes collected at every evaluateIteration call site in the driver', () => {
    // Without it the ratchet cannot tell "the runner collected nothing" from "everything
    // failed" - the same empty passing set, opposite conclusions - and run 6 hard-reset 75 ids
    // over the first. The default is deliberately the old behaviour, so a call site that
    // forgets fails silently back into the defect. Asserted structurally, by isolating each
    // call's own arguments, for the same reason the capabilities test does.
    const source = readFileSync(new URL('../scripts/driver.mjs', import.meta.url), 'utf8');

    /** @type {string[]} */
    const argumentLists = [];
    const call = 'evaluateIteration(';
    for (let at = source.indexOf(call); at !== -1; at = source.indexOf(call, at + 1)) {
      let depth = 0;
      let end = at + call.length - 1;
      do {
        if (source[end] === '(') depth += 1;
        else if (source[end] === ')') depth -= 1;
        end += 1;
      } while (depth > 0 && end < source.length);
      argumentLists.push(source.slice(at + call.length, end - 1));
    }

    assert.equal(argumentLists.length > 0, true, 'the driver no longer evaluates the ratchet at all');
    for (const args of argumentLists) {
      assert.equal(
        args.includes('collected'),
        true,
        `evaluateIteration is called without collected, so an uncollectable suite will reset the ` +
          `tree instead of failing the iteration: evaluateIteration(${args})`,
      );
    }
  });
});

describe('architectGateFragment', () => {
  const GATES = [
    { name: 'build', command: ['npm', 'run', 'build'] },
    { name: 'unit', command: ['npx', 'vitest', 'run', '--reporter=json'] },
  ];

  it('gives the architect the commands, verbatim, before it designs anything', () => {
    // architect.md promises "the test gates you write into CLAUDE.md are the gates the run will
    // actually execute". That was false: the design phase received the template and the PRD and
    // nothing else. Run 6's architect therefore wrote a CLAUDE.md forbidding vitest by name, the
    // builder obeyed it, and the unit gate collected nothing for six iterations.
    const fragment = architectGateFragment(GATES);
    assert.equal(fragment.includes('npx vitest run --reporter=json'), true);
    assert.equal(fragment.includes('npm run build'), true);
    assert.equal(fragment.includes('Test ids come only from'), true);
  });

  it('tells the architect not to forbid what the gates require', () => {
    // The specific failure, named. A project rule banning the dependency the unit gate runs on
    // can be neither satisfied nor escaped.
    assert.equal(architectGateFragment(GATES).includes('Do not write a CLAUDE.md that forbids'), true);
  });

  it('says so plainly when a toolchain collects no ids at all', () => {
    // The neighbour: a toolchain that declines the unit operation must not be described as
    // having one, which is what naming vitest unconditionally would have done.
    const fragment = architectGateFragment([{ name: 'build', command: ['dotnet', 'build'] }]);
    assert.equal(fragment.includes('declines the unit gate'), true);
    assert.equal(fragment.includes('vitest'), false);
  });

  it('is empty rather than a heading with nothing under it', () => {
    assert.equal(architectGateFragment([]), '');
  });
});

describe('firstIterationTask', () => {
  it('names the command test ids actually come from', () => {
    // Missed on every greenfield scenario this project has run: 10 August twice, and run 6,
    // where a builder spent 978 seconds and 14M tokens on a correct `node --test` suite the gate
    // collected nothing from. The brief already said it - third bullet of the toolchain section,
    // between npm scripts and module systems - which is the defect. It is the most consequential
    // sentence in the brief and it read like trivia about layout.
    const task = firstIterationTask('npx vitest run --reporter=json');
    assert.equal(task.includes('npx vitest run --reporter=json'), true);
    assert.equal(task.includes('scores zero'), true);
    assert.equal(task.includes('Build what PRD.md specifies'), true, 'lost the original objective');
  });

  it('says nothing about a runner when the toolchain declines the unit gate', () => {
    // The neighbour. A toolchain with no unit operation must not be handed a sentence naming a
    // command that does not exist - which is what hardcoding vitest here would have produced.
    assert.equal(firstIterationTask(null), firstIterationTask(''));
    assert.equal(firstIterationTask(null).includes('Test ids come only from'), false);
    assert.equal(firstIterationTask(null).includes('Build what PRD.md specifies'), true);
  });
});

describe('unitGateCommand', () => {
  it('reads the command from the resolved toolchain rather than assuming node', () => {
    const dir = makeTempDir();
    writeFileSync(path.join(dir, 'package.json'), '{"scripts":{"test":"vitest run"}}', 'utf8');
    const command = unitGateCommand(dir, path.join(dir, '.dare'));
    assert.equal(typeof command, 'string');
    assert.equal(String(command).includes('vitest'), true, `got: ${command}`);
  });
});

describe('dareIgnoreUpdate', () => {
  it('ignores the ratchet state in a .gitignore that does not cover it', () => {
    const updated = dareIgnoreUpdate('node_modules/\n');
    assert.notEqual(updated, null);
    assert.equal(String(updated).includes('\n.dare/state.json\n'), true);
    assert.equal(String(updated).startsWith('node_modules/\n'), true);
  });

  it('leaves the settings file committable, because settings are not machine state', () => {
    // Observed on the first real run: the operator had committed their config, which is a
    // reasonable thing to want in version control. A blanket ignore fights them.
    const ignored = String(dareIgnoreUpdate('')).split('\n').map((line) => line.trim());
    assert.equal(ignored.includes('.dare/config.json'), false, 'settings must stay committable');
    assert.equal(ignored.includes('.dare/state.json'), true, 'machine state must not be');
  });

  it('ignores every machine-state file the driver writes', () => {
    const ignored = String(dareIgnoreUpdate('')).split('\n').map((line) => line.trim());
    for (const file of ['.dare/state.json', '.dare/red-evidence.json', '.dare/bloopers.log']) {
      assert.equal(ignored.includes(file), true, `not ignored: ${file}`);
    }
  });

  it('adds a newline first when the file does not end in one', () => {
    assert.equal(String(dareIgnoreUpdate('node_modules/')).startsWith('node_modules/\n'), true);
  });

  it('handles an absent .gitignore', () => {
    assert.equal(String(dareIgnoreUpdate('')).includes('.dare/state.json'), true);
  });

  it('ignores the pin store, which holds two of the three monotonic properties', () => {
    // The serious one. `pins.json` carries pinned security elements and cold-passed
    // requirements, so tracked, a hard reset to lastGoodCommit restores an older copy and a pin
    // earned since that commit is gone - along with any recorded quarantine, which is what stops
    // a run shipping over lost protection. Found by running `git ls-files .dare` on a real
    // repository before deliberately triggering a reset; it was tracked there.
    const ignored = String(dareIgnoreUpdate('')).split('\n').map((line) => line.trim());
    assert.equal(ignored.includes('.dare/pins.json'), true);
    assert.equal(ignored.includes('.dare/assumptions.json'), true);
  });

  it('ignores logs, because a reset destroys the run’s own record of the reset', () => {
    // Measured in dogfood run 4. The operator's `> run4.log` lived in the repository, `git add -A`
    // tracked it, and the hard reset in iteration 2 reverted it to its content at lastGoodCommit -
    // erasing the evidence of the reset. Worse, git replaced the file rather than truncating it, so
    // the shell's open descriptor pointed at an unlinked inode and every later line went nowhere.
    // The terminal state of that run is unrecoverable.
    const ignored = String(dareIgnoreUpdate('')).split('\n').map((line) => line.trim());
    assert.equal(ignored.includes('*.log'), true);
  });

  it('repairs a stanza written by an older build instead of declaring it covered', () => {
    // The reason the gap survived. The check tested only for `.dare/state.json`, so a repository
    // carrying the old stanza reported "already covered" forever and never received the newer
    // lines. An all-or-nothing check on a list that later grows stops covering its own list.
    const old = ['node_modules/', '.dare/state.json', '.dare/lessons.json', '.dare/briefs/', ''].join('\n');
    const updated = dareIgnoreUpdate(old);
    assert.notEqual(updated, null, 'an incomplete stanza was reported as covered');
    const lines = String(updated).split('\n').map((line) => line.trim());
    assert.equal(lines.includes('.dare/pins.json'), true);
    // And it appends only what was missing rather than restating the whole stanza.
    assert.equal(lines.filter((line) => line === '.dare/state.json').length, 1, 'duplicated an existing entry');
    assert.equal(lines.filter((line) => line === 'node_modules/').length, 1);
  });

  it('adds nothing once every path is present', () => {
    // The neighbour: a repair pass that keeps appending on every run would grow the file without
    // bound, and `ensureDareIgnored` reports "changed" each time it writes.
    const complete = String(dareIgnoreUpdate(''));
    assert.equal(dareIgnoreUpdate(complete), null, 'not idempotent');
  });

  const alreadyCovered = ['.dare/\n', '.dare\n', '/.dare/\n', 'node_modules/\n.dare/\nbuild/\n', '  .dare/  \n'];
  for (const existing of alreadyCovered) {
    it(`leaves ${JSON.stringify(existing)} alone`, () => {
      // Only a blanket ignore is complete coverage. `.dare/state.json` alone is not, and used to
      // be treated as though it were.
      assert.equal(dareIgnoreUpdate(existing), null);
    });
  }

  it('is not fooled by a similarly named entry', () => {
    assert.notEqual(dareIgnoreUpdate('.daredevil/\nmydare/\n'), null);
  });
});

describe('ensureDareIgnored', () => {
  it('writes the stanza once and is then a no-op', () => {
    const dir = makeTempDir();
    assert.equal(ensureDareIgnored(dir), true);
    const first = readFileSync(path.join(dir, '.gitignore'), 'utf8');
    assert.equal(ensureDareIgnored(dir), false);
    assert.equal(readFileSync(path.join(dir, '.gitignore'), 'utf8'), first);
  });

  it('keeps whatever was already there', () => {
    const dir = makeTempDir();
    writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\ndist/\n', 'utf8');
    ensureDareIgnored(dir);
    const contents = readFileSync(path.join(dir, '.gitignore'), 'utf8');
    assert.equal(contents.includes('node_modules/'), true);
    assert.equal(contents.includes('dist/'), true);
    assert.equal(contents.includes('.dare/'), true);
  });

  it('really keeps git from staging the ratchet', () => {
    // The point of the whole exercise: a tracked state.json would be reverted by the
    // ratchet's own hard reset, silently dropping ids it had already earned.
    const dir = makeTempDir();
    const git = (/** @type {string[]} */ args) =>
      execFileSync('git', args, { cwd: dir, stdio: 'pipe' }).toString();
    git(['init', '--quiet']);
    git(['config', 'user.email', 'd@example.invalid']);
    git(['config', 'user.name', 'D']);
    ensureDareIgnored(dir);
    mkdirSync(path.join(dir, '.dare'), { recursive: true });
    writeFileSync(path.join(dir, '.dare', 'state.json'), '{}', 'utf8');
    writeFileSync(path.join(dir, '.dare', 'config.json'), '{}', 'utf8');
    git(['add', '-A']);
    const staged = git(['diff', '--cached', '--name-only']);
    assert.equal(staged.includes('.dare/state.json'), false, 'the ratchet must never be staged');
    assert.equal(staged.includes('.dare/config.json'), true, 'settings should still be committable');
  });
});

// ---------------------------------------------------------------------------
// Playwright provisioning
// ---------------------------------------------------------------------------

describe('ensurePlaywrightBrowsers', () => {
  /** @param {string[]} calls */
  function runnerRecording(calls, ok = true) {
    /** @type {import('../scripts/plugins.mjs').Runner} */
    return (command, args) => {
      calls.push([command, ...args].join(' '));
      return { ok, status: ok ? 0 : 1, stdout: '', stderr: ok ? '' : 'no browser' };
    };
  }

  it('does nothing until the repo has a playwright config', () => {
    const cwd = makeTempDir();
    /** @type {string[]} */
    const calls = [];
    const result = ensurePlaywrightBrowsers({ cwd, dareDir: path.join(cwd, '.dare'), run: runnerRecording(calls) });
    assert.equal(result.installed, false);
    assert.deepStrictEqual(calls, []);
  });

  it('installs chromium once a config appears, then never again', () => {
    const cwd = makeTempDir();
    writeFileSync(path.join(cwd, 'playwright.config.js'), 'module.exports = {};\n', 'utf8');
    /** @type {string[]} */
    const calls = [];
    const dareDir = path.join(cwd, '.dare');
    assert.equal(ensurePlaywrightBrowsers({ cwd, dareDir, run: runnerRecording(calls) }).installed, true);
    assert.deepStrictEqual(calls, ['npx playwright install chromium']);
    assert.equal(ensurePlaywrightBrowsers({ cwd, dareDir, run: runnerRecording(calls) }).installed, false);
    assert.deepStrictEqual(calls, ['npx playwright install chromium'], 'must not reinstall');
  });

  it('downloads no browser for a project whose e2e gate does not apply', () => {
    // Dogfood run 3 logged `installed chromium for the e2e gate` one line after logging that the
    // e2e gate does not apply to that project. A config existed - because the `ci` gate was
    // demanding a Playwright step from a browserless project - and a config was the only question
    // this function asked.
    const cwd = makeTempDir();
    writeFileSync(path.join(cwd, 'playwright.config.js'), 'module.exports = {};\n', 'utf8');
    /** @type {string[]} */
    const calls = [];
    const result = ensurePlaywrightBrowsers({
      cwd,
      dareDir: path.join(cwd, '.dare'),
      run: runnerRecording(calls),
      capabilities: ['api', 'persistent-storage'],
    });
    assert.equal(result.installed, false);
    assert.equal(result.detail.includes('none of web-ui, desktop-ui'), true, result.detail);
    assert.deepStrictEqual(calls, [], 'a browser was downloaded for a gate that will not run');
  });

  it('still downloads the browser for a project whose e2e gate does apply', () => {
    // The neighbour, and the asymmetry worth stating: under-provisioning is the worse error here,
    // because a missing browser fails a gate that genuinely applies. Over-provisioning only wastes
    // minutes, which is why omitting capabilities provisions as before.
    const cwd = makeTempDir();
    writeFileSync(path.join(cwd, 'playwright.config.js'), 'module.exports = {};\n', 'utf8');
    /** @type {string[]} */
    const calls = [];
    const result = ensurePlaywrightBrowsers({
      cwd,
      dareDir: path.join(cwd, '.dare'),
      run: runnerRecording(calls),
      capabilities: ['web-ui'],
    });
    assert.equal(result.installed, true);
    assert.deepStrictEqual(calls, ['npx playwright install chromium']);
  });

  it('does not record success when the install failed', () => {
    const cwd = makeTempDir();
    writeFileSync(path.join(cwd, 'playwright.config.ts'), 'export default {};\n', 'utf8');
    /** @type {string[]} */
    const calls = [];
    const dareDir = path.join(cwd, '.dare');
    const result = ensurePlaywrightBrowsers({ cwd, dareDir, run: runnerRecording(calls, false) });
    assert.equal(result.installed, false);
    assert.equal(result.detail.includes('no browser'), true);
    // A failed install must be retried next iteration, not remembered as done.
    ensurePlaywrightBrowsers({ cwd, dareDir, run: runnerRecording(calls, false) });
    assert.equal(calls.length, 2);
  });

  it('recognises every playwright config filename', () => {
    for (const name of ['playwright.config.js', 'playwright.config.ts', 'playwright.config.mjs', 'playwright.config.cjs']) {
      const cwd = makeTempDir();
      writeFileSync(path.join(cwd, name), '', 'utf8');
      assert.equal(playwrightConfigPresent(cwd), true, name);
    }
    assert.equal(playwrightConfigPresent(makeTempDir()), false);
  });
});

// ---------------------------------------------------------------------------
// Gate failure detail in the operator's log (0.66.0)
// ---------------------------------------------------------------------------

describe('formatGateFailure', () => {
  // 0.53.0 made a failing gate's *name* reach the log, on the argument that a diagnosis which
  // exists but is unreachable is not a diagnosis. The detail never followed it, and that cost
  // two dogfood runs: `gates failed: mutation` was the whole record, while the actual event was
  // Stryker dying with ERR_MODULE_NOT_FOUND. The output existed - it went into the next
  // iteration's brief - but a run that ends BUDGET has no next brief, so the final iteration's
  // failure is unrecoverable.

  it('prints the detail under the name, verbatim', () => {
    const lines = formatGateFailure([{ name: 'mutation', ok: false, status: 1, detail: 'Cannot find package' }]);
    assert.equal(lines.some((line) => line.includes('mutation')), true);
    assert.equal(lines.some((line) => line.includes('Cannot find package')), true);
  });

  it('says how many lines it dropped rather than trimming silently', () => {
    // Same rule as the Build Brief: a log showing ten of forty lines reads exactly like a log
    // with ten lines.
    const detail = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n');
    const lines = formatGateFailure([{ name: 'build', ok: false, status: 1, detail }], 10);
    assert.equal(lines.some((line) => /90 more line/.test(line)), true, 'the truncation was silent');
  });

  it('keeps a short detail whole, with nothing about truncation', () => {
    const lines = formatGateFailure([{ name: 'lint', ok: false, status: 1, detail: 'a\nb' }], 10);
    assert.equal(lines.some((line) => /more line/.test(line)), false);
  });

  it('says so when a failing gate reported nothing at all', () => {
    // An empty detail is itself the finding - a gate that failed and explained nothing is the
    // shape that hid the Stryker crash - so it may not render as an absent line.
    const lines = formatGateFailure([{ name: 'e2e', ok: false, status: 1, detail: '   ' }]);
    assert.equal(lines.join('\n').includes('no output'), true);
  });

  it('returns nothing when nothing failed', () => {
    assert.deepStrictEqual(formatGateFailure([]), []);
  });
});

// ---------------------------------------------------------------------------
// The terminal record (0.68.0)
// ---------------------------------------------------------------------------

describe('.dare/outcome.json', () => {
  /** @param {Partial<import('../scripts/driver.mjs').Effects>} [overrides] */
  function localEffects(overrides = {}) {
    /** @type {import('../scripts/driver.mjs').ClaudeResult} */
    const ok = { ok: true, text: '', costUsd: 0.01, tokens: 100, raw: '' };
    return {
      build: () => ok,
      review: () => ({ ...ok, text: JSON.stringify({ requirements: [{ id: 'PRD-1.1', status: 'pass', evidence: 'a.ts:1', detail: 'd' }] }) }),
      realityCheck: () => ({ ...ok, text: 'buildable' }),
      gates: () => ({ ok: true, results: [{ name: 'mutation', ok: true, status: 0, detail: 'no survivors' }] }),
      readTestReports: () => [{ numTotalTests: 1, testResults: [] }],
      commit: () => 'commit1',
      diffStat: () => ' 1 file changed',
      ship: () => {},
      now: () => '2026-08-10T01:49:52.963Z',
      log: () => {},
      ...overrides,
    };
  }

  // run.json records what a run *was*, at its start. Nothing recorded how it ended, so the
  // terminal state lived only in stdout — and run 4 proved stdout is not durable: its log was
  // inside the tree, `git add -A` tracked it, and the ratchet's own `git reset --hard` reverted
  // it. Worse, git replaces the file rather than truncating, so the shell's descriptor pointed
  // at an unlinked inode and every line after the reset went nowhere. That run's result had to
  // be reconstructed from `.dare/`, `git log` and the reflog.

  /** @param {Partial<import('../scripts/driver.mjs').Effects>} overrides */
  function outcomeOf(overrides) {
    const root = makeTempDir();
    const dareDir = path.join(root, '.dare');
    const result = driveRun({
      config: { ...defaultConfig(), maxIterations: 1, stallLimit: 3, reviewers: ['correctness'] },
      dareDir,
      rootDir: root,
      requiredIds: ['PRD-1.1'],
      task: 'build the thing',
      effects: localEffects(overrides),
    });
    const file = path.join(dareDir, 'outcome.json');
    return { result, written: existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null };
  }

  it('records the terminal state, and the values match what the driver returned', () => {
    const { result, written } = outcomeOf({});
    assert.notEqual(written, null, 'no terminal record was written');
    assert.equal(written.state, result.state);
    assert.equal(written.reason, result.reason);
    assert.equal(written.iterations, result.iterations);
    assert.equal(written.costUsd, result.costUsd);
  });

  it('carries a timestamp from the injected clock, not from a hidden one', () => {
    // Same discipline as the Build Brief: nothing here consults a clock it was not handed.
    const { written } = outcomeOf({ now: () => '2026-08-12T00:00:00.000Z' });
    assert.equal(written.endedAt, '2026-08-12T00:00:00.000Z');
  });

  it('does not fail the run when the record cannot be written', () => {
    // Forensics. Destroying a completed run's result because its receipt could not be filed
    // would be exactly the wrong way round — so the failure is reported, not raised.
    const root = makeTempDir();
    const dareDir = path.join(root, '.dare');
    mkdirSync(dareDir, { recursive: true });
    // A directory where the file must go: the write fails, the run must not.
    mkdirSync(path.join(dareDir, 'outcome.json'), { recursive: true });
    /** @type {string[]} */
    const logged = [];
    const result = driveRun({
      config: { ...defaultConfig(), maxIterations: 1, stallLimit: 3, reviewers: ['correctness'] },
      dareDir,
      rootDir: root,
      requiredIds: ['PRD-1.1'],
      task: 'build the thing',
      effects: localEffects({ log: (line) => logged.push(line) }),
    });
    assert.equal(typeof result.state, 'string', 'the run died over a forensic artifact');
    assert.equal(logged.some((line) => line.includes('outcome.json')), true, 'the failure was silent');
  });
});
