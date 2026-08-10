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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { defaultConfig } from '../scripts/config.mjs';
import {
  DriverError,
  airtimeRemaining,
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
  claudeArgs,
  combinePanel,
  driveRun,
  extractJsonObject,
  gateScore,
  parseClaudeEnvelope,
  parseReviewerReport,
  recordProgress,
  runGates,
  shouldContinue,
} from '../scripts/driver.mjs';
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
    });
  });

  it('still fails on a reported problem even when every member said pass', () => {
    const suspicious = {
      verdict: /** @type {'pass'} */ ('pass'),
      requirements: /** @type {import('../scripts/driver.mjs').RequirementVerdict[]} */ ([]),
      problems: ['id missing'],
    };
    assert.equal(combinePanel([suspicious], { requireUnanimous: true }).verdict, 'fail');
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

describe('claudeArgs', () => {
  it('asks for json and pins the model', () => {
    assert.deepStrictEqual(claudeArgs({ prompt: 'do it', model: 'claude-sonnet-5' }), [
      '-p',
      '--output-format',
      'json',
      '--settings',
      '{"outputStyle":"default"}',
      '--model',
      'claude-sonnet-5',
      'do it',
    ]);
  });

  it('forces the default output style on every child', () => {
    // Verified live: a child inherits the operator's active output style, and a reviewer
    // narrating in a persona corrupts the JSON the parser depends on. CLAUDE.md: the style
    // layer may not inform reviewer JSON.
    for (const options of [
      { prompt: 'x', model: 'm' },
      { prompt: 'x', model: 'm', dangerous: true },
      { prompt: 'x', model: 'm', systemPrompt: 'be hostile' },
    ]) {
      const args = claudeArgs(options);
      const at = args.indexOf('--settings');
      assert.notEqual(at, -1, 'child was not given a settings override');
      assert.deepStrictEqual(JSON.parse(args[at + 1]), { outputStyle: 'default' });
    }
  });

  it('puts every flag before the prompt, so the prompt is never read as one', () => {
    const args = claudeArgs({ prompt: 'do it', model: 'm', systemPrompt: 's', dangerous: true });
    assert.equal(args[args.length - 1], 'do it');
  });

  it('skips permissions only when asked, which is only for build children', () => {
    assert.equal(claudeArgs({ prompt: 'x', model: 'm' }).includes('--dangerously-skip-permissions'), false);
    assert.equal(
      claudeArgs({ prompt: 'x', model: 'm', dangerous: true }).includes('--dangerously-skip-permissions'),
      true,
    );
  });

  it('appends a system prompt when one is given', () => {
    assert.equal(claudeArgs({ prompt: 'x', model: 'm', systemPrompt: 'be hostile' }).includes('be hostile'), true);
  });
});

// ---------------------------------------------------------------------------
// Re-entrancy and the blooper reel
// ---------------------------------------------------------------------------

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
   */
  function run(overrides, configOverrides = {}, seedPassing = []) {
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
      requiredIds: ['PRD-1.1'],
      task: 'build the thing',
      effects: effectsWith(overrides),
    });
    return { outcome, dareDir, root };
  }

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

  it('hands the failing gate names back as the next build task', () => {
    /** @type {string[]} */
    const tasks = [];
    run(
      {
        readTestReports: () => [ONE_PASSING],
        gates: () => ({ ok: false, results: [{ name: 'typecheck', ok: false, status: 1, detail: 'TS2339' }] }),
        build: (task) => {
          tasks.push(task);
          return { ok: true, text: '', costUsd: 0, tokens: 1, raw: '' };
        },
      },
      { maxIterations: 2 },
    );
    assert.equal(tasks[0], 'build the thing');
    assert.equal(tasks[1].includes('typecheck: TS2339'), true);
  });

  it('hands the regression task back after a reset', () => {
    /** @type {string[]} */
    const tasks = [];
    run(
      {
        readTestReports: () => [{ numTotalTests: 0, testResults: [] }],
        build: (task) => {
          tasks.push(task);
          return { ok: true, text: '', costUsd: 0, tokens: 1, raw: '' };
        },
      },
      { maxIterations: 2 },
      ['test/a.test.js::works'],
    );
    assert.equal(tasks[1].startsWith('Restore these tests.'), true);
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
      commandGates('/repo/.dare').map((gate) => gate.name),
      ['build', 'lint', 'types', 'unit', 'e2e', 'security-audit'],
    );
  });

  it('points the unit reporter at the file the ratchet reads', () => {
    const unit = commandGates('/repo/.dare').find((gate) => gate.name === 'unit');
    assert.equal(unit?.command.includes('--outputFile=/repo/.dare/test-report.json'), true);
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

  it('fails all three on an empty repository', () => {
    assert.deepStrictEqual(
      staticGates(repoWith({})).map((gate) => [gate.name, gate.ok]),
      [
        ['ci', false],
        ['docs', false],
        ['observability', false],
      ],
    );
  });

  it('passes ci only when a workflow file exists', () => {
    const named = (/** @type {string} */ dir) => staticGates(dir).find((gate) => gate.name === 'ci');
    assert.equal(named(repoWith({ '.github/workflows/ci.yml': 'on: push' }))?.ok, true);
    assert.equal(named(repoWith({ '.github/workflows/notes.txt': 'x' }))?.ok, false);
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
  it('adds .dare/ to a .gitignore that does not cover it', () => {
    const updated = dareIgnoreUpdate('node_modules/\n');
    assert.notEqual(updated, null);
    assert.equal(String(updated).includes('\n.dare/\n'), true);
    assert.equal(String(updated).startsWith('node_modules/\n'), true);
  });

  it('adds a newline first when the file does not end in one', () => {
    assert.equal(String(dareIgnoreUpdate('node_modules/')).startsWith('node_modules/\n'), true);
  });

  it('handles an absent .gitignore', () => {
    assert.equal(String(dareIgnoreUpdate('')).includes('.dare/'), true);
  });

  const alreadyCovered = ['.dare/\n', '.dare\n', '/.dare/\n', 'node_modules/\n.dare/\nbuild/\n', '  .dare/  \n'];
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
    git(['add', '-A']);
    assert.equal(git(['diff', '--cached', '--name-only']).includes('.dare/'), false);
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
