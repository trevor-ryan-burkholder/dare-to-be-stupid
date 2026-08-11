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
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { readAssumptions } from '../scripts/assumptions.mjs';
import { pinSecurityElement, quarantinePin, readPins, writePins } from '../scripts/pins.mjs';
import { defaultConfig } from '../scripts/config.mjs';
import {
  DriverError,
  PHASE_PERMISSIONS,
  REENTRANCY_ENV,
  airtimeRemaining,
  childEnvironment,
  permissionsFor,
  commandGates,
  dareIgnoreUpdate,
  ensureDareIgnored,
  ensurePlaywrightBrowsers,
  loadRedEvidence,
  playwrightConfigPresent,
  parseDriverArgs,
  recordRedEvidence,
  redEvidenceGate,
  requiredIdsFor,
  staticGates,
  appendBlooper,
  assertNotNested,
  assertOwnershipCovers,
  claudeArgs,
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
  const base = { iteration: 0, spentTokens: 0, stalledIterations: 0, bestGateScore: 0, bestPassingCount: 0 };

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
  const base = { iteration: 0, spentTokens: 0, stalledIterations: 2, bestGateScore: 3, bestPassingCount: 10 };

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
      { iteration: 2, spentTokens: 900, stalledIterations: 0, bestGateScore: 0, bestPassingCount: 0 },
      config,
    );
    assert.deepStrictEqual(airtime, { iterationsLeft: 8, tokensLeft: 100, fractionLeft: 0.1 });
  });

  it('never goes negative', () => {
    const config = { ...defaultConfig(), maxIterations: 2, tokenCeiling: 100 };
    const airtime = airtimeRemaining(
      { iteration: 9, spentTokens: 900, stalledIterations: 0, bestGateScore: 0, bestPassingCount: 0 },
      config,
    );
    assert.deepStrictEqual(airtime, { iterationsLeft: 0, tokensLeft: 0, fractionLeft: 0 });
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
    assert.equal(args.slice(0, 5).join(' '), '-p --output-format json --settings {"outputStyle":"default"}');
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
      assert.deepStrictEqual(JSON.parse(args[at + 1]), { outputStyle: 'default' });
    }
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
    assert.deepEqual(calls, [['git', 'diff', '--name-only', 'abc123', '--']]);
    assert.deepEqual(files, ['src/a.ts', 'src/b.js']);
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
    const dareDir = path.join(makeTempDir(), '.dare');
    const file = writeMutationConfig(dareDir);
    assert.equal(file, path.join(dareDir, 'stryker.config.json'));
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).thresholds.break, 100);
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
      gates: () => ({ ok: true, results: [{ name: 'lint', ok: true, status: 0, detail: 'passed' }] }),
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

  it('hard-resets and writes a blooper when a passing test disappears', () => {
    const { outcome, dareDir } = run(
      { readTestReports: () => [{ numTotalTests: 0, testResults: [] }] },
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
        readTestReports: () => [{ numTotalTests: 0, testResults: [] }],
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
      { readTestReports: () => [{ numTotalTests: 0, testResults: [] }] },
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
        readTestReports: () => [{ numTotalTests: 0, testResults: [] }],
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
  it('finds every PRD id and appends the five DoD lines', () => {
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
    ]);
  });

  it('deduplicates an id mentioned more than once', () => {
    assert.deepStrictEqual(requiredIdsFor('PRD-1.1 here and PRD-1.1 again').slice(0, 1), ['PRD-1.1']);
  });

  it('still requires the DoD lines when the PRD has no numbered requirements', () => {
    assert.equal(requiredIdsFor('a prose document').length, 5);
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

  it('fails a test that has only ever been green', () => {
    const gate = redEvidenceGate({ previousPassing: ['a::1'], passing: ['a::1', 'b::2'], redSeen: [] });
    assert.equal(gate.ok, false);
    assert.equal(gate.detail.includes('b::2'), true);
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
    assert.deepStrictEqual([...loadRedEvidence(dir)], []);
    recordRedEvidence(dir, ['b::2']);
    recordRedEvidence(dir, ['c::3', 'b::2']);
    assert.deepStrictEqual([...loadRedEvidence(dir)].sort(), ['b::2', 'c::3']);
  });

  it('treats unreadable evidence as no evidence, so new tests stay unproven', () => {
    const dir = makeTempDir();
    writeFileSync(path.join(dir, 'red-evidence.json'), '{ not json', 'utf8');
    assert.deepStrictEqual([...loadRedEvidence(dir)], []);
  });
});

// ---------------------------------------------------------------------------
// Run state must never enter the target repository's history
// ---------------------------------------------------------------------------

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

  const alreadyCovered = [
    '.dare/state.json\n',
    '.dare/\n',
    '.dare\n',
    '/.dare/\n',
    'node_modules/\n.dare/\nbuild/\n',
    '  .dare/state.json  \n',
  ];
  for (const existing of alreadyCovered) {
    it(`leaves ${JSON.stringify(existing)} alone`, () => {
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
