/**
 * Tier 3 — the in-flight budget flags, against a real `claude -p`. **This tier spends money.**
 *
 * `BORROWED.md` R16 and case D: `tokenCeiling` and `costCeiling` are read off a returned
 * envelope, so both bind a child that **came back**. One measured builder spent ten times the
 * ceiling before returning, and run 6 priced a single child at 14M tokens. `--max-budget-usd`
 * is the in-flight bound the accounting cannot be.
 *
 * This file exists because `CLAUDE.md` says it must: the flags live in `claudeArgs`, and that
 * array's meaning belongs to another binary. `test/driver.test.mjs` proves the array we build.
 * It cannot prove that `claude` **stops** for it — which is the entire claim being made — and
 * the argv defect that bought this tier was exactly a correct array another program read
 * differently.
 *
 * Two distinct questions, and both must be asked:
 *
 *   1. does an ordinary child still work with the flags present? A bound so tight that every
 *      child dies would "pass" a naive check of question 2 while breaking every run.
 *   2. does a deliberately tiny bound actually stop one?
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { childBudget, spawnClaude } from '../../scripts/driver.mjs';

const ARMED = process.env.DARE_LIVE === '1';

/** Generous: a live round trip includes model latency nobody here controls. */
const LIVE_TIMEOUT = 180_000;

/** The cheapest model that still exercises the same spawn path. */
const CHEAP_MODEL = 'claude-haiku-4-5-20251001';

describe('the in-flight budget bound reaches a real child', { skip: ARMED ? false : 'DARE_LIVE is not set' }, () => {
  it('lets an ordinary child through when the allowance is ample', { timeout: LIVE_TIMEOUT }, () => {
    // The half that stops this file from "passing" by breaking everything. A flag that killed
    // every child would satisfy the refusal test below and destroy every run.
    const result = spawnClaude({
      prompt: 'Reply with exactly the word: pineapple. No punctuation, no explanation.',
      model: CHEAP_MODEL,
      phase: 'reality-check',
      cwd: process.cwd(),
      env: process.env,
      ...childBudget({ costCeiling: 50, maxChildTurns: 0 }, 0),
    });
    assert.equal(result.ok, true, `an amply-funded child was refused: ${result.raw.slice(0, 800)}`);
    assert.equal(result.text.toLowerCase().includes('pineapple'), true, result.text);
  });

  it('stops a child whose allowance is spent, and does not report a verdict', { timeout: LIVE_TIMEOUT }, () => {
    // The floor `childBudget` hands an out-of-money run: 0.0001 dollars, which no real call can
    // fit inside. What is asserted is the *loop's* contract, not a message — a child that could
    // not run must arrive as not-ok, which the driver already treats as a builder failure.
    // Nothing defaults to pass, least of all a child that never got to think.
    const allowance = childBudget({ costCeiling: 10, maxChildTurns: 0 }, 10);
    assert.deepStrictEqual(allowance, { maxBudgetUsd: 0.0001 }, 'the floor moved; this test is asserting the wrong thing');

    const result = spawnClaude({
      prompt: 'Write a detailed thousand-word essay about the history of the pineapple.',
      model: CHEAP_MODEL,
      phase: 'reality-check',
      cwd: process.cwd(),
      env: process.env,
      ...allowance,
    });

    assert.equal(
      result.ok,
      false,
      `a child bounded at $${allowance.maxBudgetUsd} completed anyway, so the flag does not bound spend: ` +
        `${result.text.slice(0, 400)}`,
    );
    // A stopped child has no verdict, and half a verdict is not a smaller one. The parser must
    // not have handed back text as though the child had answered.
    assert.equal(result.text, '', `a stopped child returned text: ${result.text.slice(0, 400)}`);
  });

  it('accepts the undocumented turn cap, or says plainly that it does not', { timeout: LIVE_TIMEOUT }, () => {
    // `--max-turns` is absent from `claude --help` in 2.1.228 and accepted by the parser
    // anyway — probed against the binary, which answers "Input must be provided" for it and
    // "unknown option" for a flag that genuinely does not exist. It is off by default for
    // exactly that reason, and this is the check that will notice the day it disappears.
    const result = spawnClaude({
      prompt: 'Reply with exactly the word: pineapple. No punctuation, no explanation.',
      model: CHEAP_MODEL,
      phase: 'reality-check',
      cwd: process.cwd(),
      env: process.env,
      ...childBudget({ costCeiling: 50, maxChildTurns: 20 }, 0),
    });
    assert.equal(
      result.raw.includes("unknown option '--max-turns'"),
      false,
      'claude no longer accepts --max-turns; maxChildTurns must be retired rather than left to fail runs',
    );
    assert.equal(result.ok, true, `--max-turns broke an ordinary child: ${result.raw.slice(0, 800)}`);
  });
});
