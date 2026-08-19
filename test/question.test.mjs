/**
 * The blocked-question artifact (PLAN.md item 50).
 *
 * The properties under test are refusals more than emissions: a `SHIPPED` run must emit nothing, an
 * uncited question must be discarded and counted, and no path may let a builder produce one or wait
 * on one. A question that is merely *present* is not the feature; a question that is answerable and
 * cannot become an interrupt is.
 */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { buildQuestion, QUESTION_FILE, renderQuestion, writeQuestion } from '../scripts/question.mjs';

/** @type {string[]} */
const dirs = [];
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** @returns {string} */
const tempDir = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-question-'));
  dirs.push(dir);
  return dir;
};

const STALLED = { state: 'STALLED', reason: '6 iterations with no gate improvement', phase: 'loop' };

describe('a question is derived from the terminal state', () => {
  it('asks an answerable question about the requirements that blocked', () => {
    const built = buildQuestion(STALLED, {
      requirements: ['PRD-3.2'],
      tried: ['3 repair iterations against PRD-3.2', 'hard reset to the last green tree'],
    });
    assert.equal(built.ok, true);
    const question = /** @type {{ ok: true, question: any }} */ (built).question;
    assert.equal(question.state, 'STALLED');
    assert.equal(question.blocking, '6 iterations with no gate improvement');
    assert.deepStrictEqual(question.citations, [{ id: 'PRD-3.2', kind: 'requirement' }]);
    // An option list is answerable and a paragraph is not, so options are asserted as a list.
    assert.equal(question.options.length, 3);
    assert.deepStrictEqual(question.tried, [
      '3 repair iterations against PRD-3.2',
      'hard reset to the last green tree',
    ]);
  });

  it('emits nothing at all for a shipped run', () => {
    // The benign neighbour, and the reason it matters: a machine that always has a question has
    // stopped meaning anything by it.
    const built = buildQuestion({ state: 'SHIPPED', reason: 'every requirement passed' }, { requirements: ['PRD-1.1'] });
    assert.equal(built.ok, false);
    assert.match(/** @type {{ ok: false, discarded: string }} */ (built).discarded, /shipped run has nothing to ask/);
  });

  it('asks a different question of a budget ending than of a stall', () => {
    // Same artifact, different decision. Telling an operator whose run ran out of money to make the
    // requirements decidable is advice about the wrong problem.
    const budget = buildQuestion({ state: 'BUDGET', reason: 'ceiling reached at iteration 4' }, { requirements: ['PRD-1.1'] });
    const stalled = buildQuestion(STALLED, { requirements: ['PRD-1.1'] });
    assert.equal(budget.ok, true);
    assert.equal(stalled.ok, true);
    assert.notEqual(
      /** @type {any} */ (budget).question.decision,
      /** @type {any} */ (stalled).question.decision,
    );
    assert.match(/** @type {any} */ (budget).question.options.join(' '), /Raise the budget/);
  });

  it('cites gates and findings, not only requirements', () => {
    const built = buildQuestion(STALLED, { gates: ['gate:types'], findings: ['advisory-security-1'] });
    assert.deepStrictEqual(/** @type {any} */ (built).question.citations, [
      { id: 'gate:types', kind: 'gate' },
      { id: 'advisory-security-1', kind: 'finding' },
    ]);
  });
});

describe('a question citing nothing is discarded', () => {
  it('refuses one with no requirement, gate, finding or phase', () => {
    // Same bar as validateLesson and the assumptions citation rule. An uncited question reaches the
    // operator exactly when they are least able to check it.
    const built = buildQuestion({ state: 'STALLED', reason: 'something went wrong' }, {});
    assert.equal(built.ok, false);
    assert.match(/** @type {{ ok: false, discarded: string }} */ (built).discarded, /cites nothing/);
  });

  it('refuses one whose citations are all empty strings', () => {
    const built = buildQuestion({ state: 'STALLED', reason: 'x' }, { requirements: ['', '   '], gates: [] });
    assert.equal(built.ok, false);
  });

  it('falls back to the phase, which names where the run stopped', () => {
    // Coarser than a requirement id and still actionable. Used only when nothing finer survived, so
    // it cannot mask a run that had ids and dropped them.
    const built = buildQuestion({ state: 'ABORTED', reason: 'the Oracle store would not parse', phase: 'oracle' }, {});
    assert.equal(built.ok, true);
    assert.deepStrictEqual(/** @type {any} */ (built).question.citations, [{ id: 'oracle', kind: 'phase' }]);
  });

  it('prefers a real citation over the phase when both exist', () => {
    const built = buildQuestion({ ...STALLED, phase: 'loop' }, { requirements: ['PRD-3.2'] });
    assert.deepStrictEqual(/** @type {any} */ (built).question.citations, [{ id: 'PRD-3.2', kind: 'requirement' }]);
  });

  it('counts a discard rather than dropping it quietly', () => {
    // A silent discard is worse than either emitting or refusing: the operator learns nothing, and
    // neither does anyone auditing the authoring gate that let this state reach the loop.
    /** @type {string[]} */
    const logged = [];
    const result = writeQuestion(tempDir(), { state: 'STALLED', reason: 'x' }, {}, {
      now: () => '2026-08-19T00:00:00.000Z',
      log: (line) => logged.push(line),
    });
    assert.deepStrictEqual(result, { written: false, discarded: 1 });
    assert.match(logged.join('\n'), /no question was emitted: .*cites nothing/);
  });

  it('does not count a shipped run as a discard, because it was never a question', () => {
    const result = writeQuestion(tempDir(), { state: 'SHIPPED', reason: 'ok' }, {}, { now: () => 'now' });
    assert.deepStrictEqual(result, { written: false, discarded: 0 });
  });
});

describe('the artifact', () => {
  it('is written under the driver-owned directory and reads back as what was built', () => {
    const dir = tempDir();
    const result = writeQuestion(dir, STALLED, { requirements: ['PRD-3.2'], tried: ['two repairs'] }, {
      now: () => '2026-08-19T12:00:00.000Z',
    });
    assert.deepStrictEqual(result, { written: true, discarded: 0 });
    const written = JSON.parse(readFileSync(path.join(dir, QUESTION_FILE), 'utf8'));
    assert.equal(written.at, '2026-08-19T12:00:00.000Z');
    assert.equal(written.state, 'STALLED');
    assert.deepStrictEqual(written.citations, [{ id: 'PRD-3.2', kind: 'requirement' }]);
    assert.deepStrictEqual(written.tried, ['two repairs']);
  });

  it('writes nothing at all for a shipped run', () => {
    const dir = tempDir();
    writeQuestion(dir, { state: 'SHIPPED', reason: 'ok' }, { requirements: ['PRD-1.1'] }, { now: () => 'now' });
    assert.equal(existsSync(path.join(dir, QUESTION_FILE)), false);
  });

  it('still writes the file when the logger is the thing that broke', () => {
    // Found by a pre-existing outcome case rather than predicted: this module assumed a logger
    // works. The terminal writer is exactly what a crashing run may have lost, and that is the run
    // most in need of a question. The log is a courtesy; the file is the artifact.
    const dir = tempDir();
    const result = writeQuestion(dir, STALLED, { requirements: ['PRD-3.2'] }, {
      now: () => '2026-08-19T00:00:00.000Z',
      log: () => {
        throw new Error('the terminal is gone');
      },
    });
    assert.deepStrictEqual(result, { written: true, discarded: 0 });
    assert.equal(existsSync(path.join(dir, QUESTION_FILE)), true);
  });

  it('still counts a discard when the logger is broken', () => {
    const result = writeQuestion(tempDir(), { state: 'STALLED', reason: 'x' }, {}, {
      now: () => 'now',
      log: () => {
        throw new Error('the terminal is gone');
      },
    });
    assert.deepStrictEqual(result, { written: false, discarded: 1 });
  });

  it('renders an option list an operator can answer, and says where the answer goes', () => {
    const built = buildQuestion(STALLED, { requirements: ['PRD-3.2'], tried: ['two repairs'] });
    const rendered = renderQuestion(/** @type {any} */ (built).question);
    assert.match(rendered, /blocked by: 6 iterations with no gate improvement/);
    assert.match(rendered, /concerning: PRD-3\.2 \(requirement\)/);
    assert.match(rendered, /already tried:\n {4}- two repairs/);
    assert.match(rendered, /\(a\) /);
    assert.match(rendered, /\(c\) /);
    // The answer is durable because it goes into the specification, not into a prompt.
    assert.match(rendered, /Answer by editing PRD\.md, DOD\.md or the config and re-running/);
  });
});

describe('a question can never become an interrupt', () => {
  const RAW = readFileSync(new URL('../scripts/question.mjs', import.meta.url), 'utf8');
  /**
   * The module's **code**, with comments removed.
   *
   * The first draft of the scan below failed on `question.mjs`'s own docstring, which says
   * "nothing here waits, reads stdin, or has a timeout" — prose explaining the rule, read as a
   * breach of it. A positional test that cannot tell an implementation from an explanation of one
   * punishes the comment that makes the rule legible, so this strips them and scans what runs.
   */
  const SOURCE = RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('reads no input and waits for nothing', () => {
    // Positional, because no return value can show it. Unattended operation is the product: a run
    // pausing for a human at three in the morning is strictly worse than STALLED, which at least
    // terminates and reports.
    for (const forbidden of ['stdin', 'createInterface', 'readline', 'prompt(', 'setTimeout', 'await ']) {
      assert.equal(SOURCE.includes(forbidden), false, `question.mjs contains ${forbidden}, which could make it wait`);
    }
  });

  it('exports nothing a builder could call to ask', () => {
    // There is deliberately no "ask" verb. Given one a builder would use it -- models offload
    // difficulty, and a builder declines hard things whenever a decline is available (case J).
    const exported = [...RAW.matchAll(/^export (?:function|const|class) (\w+)/gm)].map((m) => m[1]);
    assert.deepStrictEqual(exported.sort(), ['QUESTION_FILE', 'QuestionError', 'buildQuestion', 'renderQuestion', 'writeQuestion']);
    assert.equal(
      exported.some((name) => /^ask/i.test(name)),
      false,
      'an ask verb exists, which is the one thing a builder must not be able to reach',
    );
  });

  it('is reachable only from a terminal state, because the state is its only input', () => {
    // buildQuestion takes a terminal receipt. There is no shape of call that produces a question
    // mid-iteration, so "only at a terminal state" is a property of the signature rather than a rule
    // applied on top of it.
    const built = buildQuestion({ state: 'RUNNING', reason: 'iteration 3' }, { requirements: ['PRD-1.1'] });
    assert.equal(built.ok, false);
    assert.match(/** @type {{ ok: false, discarded: string }} */ (built).discarded, /has no defined question/);
  });
});
