/**
 * Tier 3 — a real `claude -p` child. **This tier spends money.**
 *
 * It exists because of the defect recorded at the bottom of HANDOFF.md, which is the best
 * argument this repository owns for having a live tier at all. `claudeArgs` was unit-tested
 * and correct: it built the array we meant to build. The defect lived in *another program's
 * parsing* of that array — `--allowedTools` is variadic, the prompt followed it, and the CLI
 * read the prompt as one more tool name. Every phase except `builder` was dead, no PRD was
 * ever authored, and no run could ever ship. No number of assertions about the array would
 * have found it. One live child would have, in seconds.
 *
 * So the rule this tier encodes: **anything whose contract is owned by a different binary
 * needs one live check, not more assertions.**
 *
 * It does not run by default and it does not silently skip. `npm run test:live` without
 * `MEESEEKS_LIVE=1` fails, loudly, saying what it would have cost. A command that quietly passes
 * having done nothing is the exact shape of failure the rest of this codebase refuses.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { claudeArgs, parseClaudeEnvelope, spawnClaude } from '../../scripts/driver.mjs';

const ARMED = process.env.MEESEEKS_LIVE === '1';

/** Generous: a live round trip includes model latency nobody here controls. */
const LIVE_TIMEOUT = 180_000;

/** The cheapest model that still exercises the same spawn path. */
const CHEAP_MODEL = 'claude-haiku-4-5-20251001';

/**
 * @param {string} prompt
 * @returns {import('../../scripts/driver.mjs').ClaudeResult}
 */
function ask(prompt) {
  return spawnClaude({ prompt, model: CHEAP_MODEL, phase: 'reality-check', cwd: process.cwd(), env: process.env });
}

describe('the live tier', () => {
  it('refuses to run unarmed, rather than passing having done nothing', () => {
    // Not `skip`. A green tick for a suite that made no API call is a lie the operator will
    // read as coverage.
    assert.equal(
      ARMED,
      true,
      'the live tier spends real money and is off by default. Re-run with MEESEEKS_LIVE=1 when you mean it: ' +
        'one trivial prompt cost $0.26 on 10 August 2026, mostly cache creation.',
    );
  });
});

describe('a real claude -p child', { skip: ARMED ? false : 'MEESEEKS_LIVE is not set' }, () => {
  it('accepts the argv the driver builds, and answers the prompt', { timeout: LIVE_TIMEOUT }, () => {
    // The regression this whole tier exists for. If the prompt is ever parsed as an operand
    // again, the child exits with "Input must be provided either through stdin or as a prompt
    // argument" and this fails.
    const result = ask('Reply with exactly the word: pineapple. No punctuation, no explanation.');
    assert.equal(result.ok, true, `the child failed: ${result.raw.slice(0, 800)}`);
    assert.equal(result.text.toLowerCase().includes('pineapple'), true, `unexpected answer: ${result.text}`);
  });

  it('returns an envelope carrying the fields budget accounting reads', { timeout: LIVE_TIMEOUT }, () => {
    // Nothing here estimates cost, so these field names are load-bearing. If the CLI renames
    // one, the ceiling silently stops counting and a run overspends without noticing.
    const result = ask('Reply with exactly the word: ok.');
    assert.equal(result.ok, true, result.raw.slice(0, 800));
    assert.equal(Number.isFinite(result.costUsd), true);
    assert.equal(result.costUsd > 0, true, 'a real call that cost nothing means the envelope changed shape');
    assert.equal(Number.isInteger(result.tokens), true);
    assert.equal(result.tokens > 0, true, 'a real call that used no tokens means the usage breakdown moved');
  });

  it('does not inherit the operator output style', { timeout: LIVE_TIMEOUT }, () => {
    // A correctness fix, not a cosmetic one: the reviewer's output is machine-parsed, and a
    // child answering in the operator's persona is a child whose JSON does not parse.
    const result = ask('Reply with exactly the word: plain.');
    assert.equal(result.ok, true, result.raw.slice(0, 800));
    assert.equal(result.text.trim().length < 60, true, `the child editorialised: ${result.text}`);
  });

  it('parses its own envelope through the driver parser, not an approximation', { timeout: LIVE_TIMEOUT }, () => {
    const result = ask('Reply with exactly the word: ok.');
    const reparsed = parseClaudeEnvelope(result.raw);
    assert.equal(reparsed.ok, true);
    assert.equal(reparsed.text, result.text);
  });
});

describe('per-phase reasoning effort reaches a real child', { skip: ARMED ? false : 'MEESEEKS_LIVE is not set' }, () => {
  // `claudeArgs` is the function whose defect bought this tier: `--allowedTools` is variadic,
  // the prompt followed it, and the CLI read the prompt as one more tool name. Every phase but
  // `builder` was dead and no assertion about the array could have found it. `--effort` is a
  // new flag in that same array, owned by the same other binary, so it gets one live check.

  it('accepts every level the config will let an operator write', { timeout: LIVE_TIMEOUT }, () => {
    // Not just one. A level the CLI rejects makes the child exit non-zero on startup, which an
    // unattended run would report as a failed phase rather than as a bad setting.
    for (const effort of ['low', 'medium', 'high', 'xhigh', 'max']) {
      const result = spawnClaude({
        prompt: 'Reply with exactly the word: pineapple. No punctuation, no explanation.',
        model: CHEAP_MODEL,
        phase: 'reality-check',
        effort,
        cwd: process.cwd(),
        env: process.env,
      });
      assert.equal(result.ok, true, `--effort ${effort} was refused: ${result.raw.slice(0, 400)}`);
      assert.equal(result.text.toLowerCase().includes('pineapple'), true, `--effort ${effort}: ${result.text}`);
    }
  });

  it('still works when no effort is given, so the flag is optional rather than required', { timeout: LIVE_TIMEOUT }, () => {
    const result = ask('Reply with exactly the word: pineapple. No punctuation, no explanation.');
    assert.equal(result.ok, true, result.raw.slice(0, 400));
  });
});

describe('cold phases are actually isolated', { skip: ARMED ? false : 'MEESEEKS_LIVE is not set' }, () => {
  // Measured before 0.69.0: a child in the repo AND in an empty temp directory was handed the
  // operator's plugin SessionStart injections and the project MEMORY.md, and quoted this
  // machine's memory line back verbatim when asked without tools. The injected text carries
  // imperative instructions, which a live child once obeyed instead of the driver's prompt.

  /** @param {string} phase @param {string} prompt */
  const askAs = (phase, prompt) =>
    spawnClaude({ prompt, model: CHEAP_MODEL, phase, cwd: process.cwd(), env: process.env });

  it('starves a reviewer of the operator plugin surface', { timeout: LIVE_TIMEOUT }, () => {
    const result = askAs(
      'review',
      'Do not use any tools. Answer only from context already given to you. Does your context ' +
        'contain the exact phrase "You have superpowers"? Answer YES or NO only.',
    );
    assert.equal(result.ok, true, result.raw.slice(0, 400));
    assert.equal(/\bno\b/i.test(result.text), true, `the panel still inherits plugin injections: ${result.text}`);
  });

  it('leaves a reviewer able to work — isolation is not a lobotomy', { timeout: LIVE_TIMEOUT }, () => {
    // The other half. A cold phase that cannot answer is not isolated, it is broken, and the
    // reviewer's output is machine-parsed.
    const result = askAs('review', 'Reply with exactly the word: pineapple. No punctuation, no explanation.');
    assert.equal(result.ok, true, result.raw.slice(0, 400));
    assert.equal(result.text.toLowerCase().includes('pineapple'), true, result.text);
  });

  it('does not isolate the builder, because that would disable its guard', { timeout: LIVE_TIMEOUT }, () => {
    // safe mode disables hooks including one supplied in --settings, so the builder keeping the
    // guard and the builder keeping the operator's context are the same decision.
    assert.equal(claudeArgs({ model: CHEAP_MODEL, phase: 'builder' }).includes('--safe-mode'), false);
  });
});
