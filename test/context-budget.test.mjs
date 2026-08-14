/**
 * Tests for the context budget (DESIGN.md §3.9).
 *
 * The property under test is unusual for this repository: everything else here refuses to
 * let a missing signal read as a *pass*, and this refuses to let a missing signal read as
 * *health*. A prompt that grew from four thousand characters to four hundred thousand across
 * twelve iterations produces no exception and no exit code — the builder is simply worse, and
 * nothing says so.
 *
 * So the assertions are about the two things that can go wrong with such a check: it can fail
 * to fire, and it can fire and then quietly repair the problem by truncating. The second is
 * worse, because a shortened prompt is a different task handed over without saying so.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_MAX_PROMPT_CHARACTERS,
  checkContextBudget,
  measurePrompt,
  promptGrowthNote,
} from '../scripts/context-budget.mjs';

describe('measurePrompt', () => {
  it('totals every part and reports each one', () => {
    const measured = measurePrompt({ systemPrompt: 'abcde', prompt: 'xy' });
    assert.equal(measured.characters, 7);
    assert.deepEqual(measured.parts, [
      { label: 'systemPrompt', characters: 5 },
      { label: 'prompt', characters: 2 },
    ]);
  });

  it('orders parts largest first, so the reader sees what grew', () => {
    const measured = measurePrompt({ small: 'a', huge: 'x'.repeat(50), middling: 'yy' });
    assert.deepEqual(
      measured.parts.map((part) => part.label),
      ['huge', 'middling', 'small'],
    );
  });

  it('breaks an exact tie on the label, so identical inputs render identically', () => {
    // A verdict that reorders between runs on the same input cannot be diffed, and diffing
    // two runs is the only way anyone will ever find which part started growing.
    const measured = measurePrompt({ zebra: 'xxxx', alpha: 'yyyy' });
    assert.deepEqual(
      measured.parts.map((part) => part.label),
      ['alpha', 'zebra'],
    );
  });

  it('drops absent and empty parts rather than reporting them as zero', () => {
    // A breakdown listing five entries of which three are 0 buries the one that matters.
    const measured = measurePrompt({ prompt: 'abc', systemPrompt: undefined, extra: '' });
    assert.deepEqual(measured.parts, [{ label: 'prompt', characters: 3 }]);
    assert.equal(measured.characters, 3);
  });

  it('counts nothing as nothing', () => {
    assert.deepEqual(measurePrompt({}), { characters: 0, parts: [] });
  });
});

describe('checkContextBudget', () => {
  it('passes a prompt inside the budget, and says how far inside', () => {
    const verdict = checkContextBudget({ phase: 'builder', parts: { prompt: 'x'.repeat(100) }, limit: 500 });
    assert.equal(verdict.ok, true);
    assert.equal(verdict.characters, 100);
    assert.equal(verdict.limit, 500);
    assert.equal(verdict.detail, '');
  });

  it('passes a prompt of exactly the budget', () => {
    // The limit is a ceiling the prompt may reach, not one it must stay under. Off by one
    // here would fail a run for a prompt an operator deliberately sized to fit.
    const verdict = checkContextBudget({ phase: 'builder', parts: { prompt: 'x'.repeat(64) }, limit: 64 });
    assert.equal(verdict.ok, true);
  });

  it('fails one character over, rather than rounding in the run’s favour', () => {
    const verdict = checkContextBudget({ phase: 'builder', parts: { prompt: 'x'.repeat(65) }, limit: 64 });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.characters, 65);
  });

  it('names the phase, both totals and the largest part in its detail', () => {
    const verdict = checkContextBudget({
      phase: 'reviewer:security',
      parts: { prompt: 'p'.repeat(30), systemPrompt: 's'.repeat(80) },
      limit: 50,
    });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.detail.includes('reviewer:security'), true);
    assert.equal(verdict.detail.includes('110 characters'), true);
    assert.equal(verdict.detail.includes('50 character budget'), true);
    assert.equal(verdict.detail.includes('systemPrompt 80, prompt 30'), true);
  });

  it('returns the parts on the failing verdict, not only in the prose', () => {
    // The detail line is for the operator. The structured parts are what a caller could act
    // on, and dropping them would make the verdict readable and useless.
    const verdict = checkContextBudget({ phase: 'builder', parts: { a: 'xx', b: 'yyyy' }, limit: 1 });
    assert.deepEqual(verdict.parts, [
      { label: 'b', characters: 4 },
      { label: 'a', characters: 2 },
    ]);
  });

  it('never truncates: an over-budget verdict changes no input', () => {
    // This is the whole reason the item says "do not trim silently". A truncated prompt is
    // not a smaller task, it is a different one, and nothing in the run would record the
    // substitution. The check is allowed to refuse and is not allowed to edit.
    const parts = { prompt: 'x'.repeat(200), systemPrompt: 'y'.repeat(200) };
    const before = { ...parts };
    const verdict = checkContextBudget({ phase: 'builder', parts, limit: 10 });
    assert.equal(verdict.ok, false);
    assert.deepEqual(parts, before);
    assert.equal(verdict.detail.includes('nothing was truncated'), true);
  });

  it('uses the documented default when no limit is given', () => {
    const verdict = checkContextBudget({ phase: 'builder', parts: { prompt: 'x' } });
    assert.equal(verdict.limit, DEFAULT_MAX_PROMPT_CHARACTERS);
    assert.equal(DEFAULT_MAX_PROMPT_CHARACTERS, 400_000);
  });

  for (const [label, limit] of /** @type {[string, unknown][]} */ ([
    ['zero', 0],
    ['negative', -1],
    ['not a number', 'lots'],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['null', null],
  ])) {
    it(`throws on a ${label} limit rather than skipping the check`, () => {
      // A budget check that disables itself on a malformed configuration is precisely the
      // silent degradation it exists to catch, arriving through the door marked "config".
      assert.throws(
        () => checkContextBudget({ phase: 'builder', parts: { prompt: 'x' }, limit: /** @type {number} */ (limit) }),
        TypeError,
      );
    });
  }

  it('treats an explicit undefined limit as absent, not as malformed', () => {
    // `options.limit` arrives as undefined from every caller that has nothing to say about
    // it, and refusing that would make the default unreachable.
    const verdict = checkContextBudget({ phase: 'builder', parts: { prompt: 'x' }, limit: undefined });
    assert.equal(verdict.limit, DEFAULT_MAX_PROMPT_CHARACTERS);
  });
});

describe('promptGrowthNote', () => {
  const BASE = { first: 18496, current: 41412, iteration: 2, limit: 400000, maxIterations: 25 };

  it('says nothing about ship1 real growth, because the trajectory clears the run', () => {
    // The measured case: 18,496 -> 41,412 in one iteration is 2.2x and looks alarming, but at
    // that rate the budget is 17 iterations away and the run is capped at 12. Reporting it
    // would be noise, and a warning that fires on ordinary growth is a warning nobody reads.
    assert.equal(promptGrowthNote({ ...BASE, maxIterations: 12 }), '');
  });

  it('speaks when the budget arrives inside the run', () => {
    const note = promptGrowthNote({ first: 100000, current: 200000, iteration: 2, limit: 400000, maxIterations: 25 });
    assert.equal(note.includes('at iteration 4'), true, note);
    assert.equal(note.includes('capped at 25'), true, note);
    assert.equal(note.includes('100000 per iteration'), true, note);
  });

  it('is silent on one data point, because that is an opinion and not a trend', () => {
    assert.equal(promptGrowthNote({ ...BASE, iteration: 1 }), '');
  });

  it('is silent when the prompt is shrinking or flat', () => {
    assert.equal(promptGrowthNote({ ...BASE, current: 18496 }), '');
    assert.equal(promptGrowthNote({ ...BASE, current: 9000 }), '');
  });

  it('is silent when the prompt is already over budget, which is a different problem', () => {
    // `checkContextBudget` refuses that prompt outright. A projection toward a line already
    // crossed would be a second, quieter report of a failure that already spoke.
    assert.equal(promptGrowthNote({ ...BASE, current: 400000 }), '');
    assert.equal(promptGrowthNote({ ...BASE, current: 500000 }), '');
  });

  it('refuses to project from a first measurement of zero', () => {
    assert.equal(promptGrowthNote({ ...BASE, first: 0 }), '');
  });

  it('rounds the projected iteration up, so the warning never arrives late', () => {
    // 1 character per iteration short of the budget must not round down into "next iteration".
    const note = promptGrowthNote({ first: 1000, current: 2000, iteration: 2, limit: 3500, maxIterations: 10 });
    assert.equal(note.includes('at iteration 4'), true, note);
  });
});
