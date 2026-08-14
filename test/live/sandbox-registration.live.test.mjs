/**
 * Tier 3 — the sandbox declaration actually reaches a real child. **This tier spends money.**
 *
 * **Why this file has to exist, in R19's own words:** the sandbox's *registration* needs a live
 * test "for the same reason the guard's did — eleven versions of green unit tests once proved
 * nothing about whether the hook was loaded". `test/driver.test.mjs` proves `childSettings`
 * builds a blob containing `sandbox: { enabled: true }`. That is an assertion about a string.
 *
 * And here the string is unusually easy to lose. `claude --help` states outright that in `-p`
 * mode **"settings files that fail validation are silently ignored"**. So a settings blob this
 * CLI dislikes — for any reason, including one unrelated key — is dropped whole, taking the
 * sandbox *and the guard hook* with it, without a word on stdout. That is the failure this
 * project is worst at seeing: a defensive layer that disappears quietly.
 *
 * What is checked, and what deliberately is not:
 *
 *   - **checked:** a child handed the sandboxed settings blob still starts, still answers, and
 *     does not report the blob as invalid. If the CLI ever rejects this shape, every run's guard
 *     goes with it, and this is the check that notices.
 *   - **not checked:** that the kernel actually confines the child. That needs bubblewrap, which
 *     is absent on the machine this was written on, and asserting it here would produce a test
 *     that is green because it never ran. `preflight`'s `checkSandboxAvailable` is what refuses
 *     a run on a host that cannot sandbox; this file is about the declaration reaching the child.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { claudeArgs, spawnClaude } from '../../scripts/driver.mjs';

const ARMED = process.env.MEESEEKS_LIVE === '1';

/** Generous: a live round trip includes model latency nobody here controls. */
const LIVE_TIMEOUT = 180_000;

/** The cheapest model that still exercises the same spawn path. */
const CHEAP_MODEL = 'claude-haiku-4-5-20251001';

/**
 * The settings blob for a given phase, pulled out of the argv the driver would really build.
 *
 * Read from `claudeArgs` rather than from `childSettings` directly, because the question is
 * what a *child* receives, and `claudeArgs` is where the sandbox flag is resolved against the
 * phase.
 *
 * @param {{ phase: string, sandbox: boolean }} options
 * @returns {Record<string, unknown>}
 */
function settingsFor(options) {
  const args = claudeArgs({ model: CHEAP_MODEL, phase: options.phase, sandbox: options.sandbox });
  const at = args.indexOf('--settings');
  assert.notEqual(at, -1, 'the driver built argv with no --settings at all');
  return JSON.parse(String(args[at + 1]));
}

describe('the sandbox declaration reaches a real child', { skip: ARMED ? false : 'MEESEEKS_LIVE is not set' }, () => {
  it('puts the sandbox in the blob a writing phase is handed, beside the guard', () => {
    // Not instead of the guard. R19 is explicit that this is an added floor and never a
    // replaced one, and a blob that gained a sandbox and lost the hook would be a regression
    // wearing the shape of an improvement.
    const blob = settingsFor({ phase: 'builder', sandbox: true });
    assert.deepStrictEqual(blob.sandbox, { enabled: true });
    assert.notEqual(blob.hooks, undefined, 'the guard hook left the settings blob');
  });

  it('leaves a cold phase alone, which runs under --safe-mode anyway', () => {
    const blob = settingsFor({ phase: 'review', sandbox: true });
    assert.equal('sandbox' in blob, false);
  });

  it('omits it entirely when the operator has not armed one', () => {
    const blob = settingsFor({ phase: 'builder', sandbox: false });
    assert.equal('sandbox' in blob, false);
  });

  it('is accepted by a real claude, which still starts and still answers', { timeout: LIVE_TIMEOUT }, async () => {
    // The live half, and the reason unit tests cannot replace it. Print mode silently ignores a
    // settings file that fails validation, so an unrecognised `sandbox` key would take the whole
    // blob down — guard included — and say nothing. A child that answers proves the CLI accepted
    // the shape.
    const result = await spawnClaude({
      prompt: 'Reply with exactly the word: pineapple. No punctuation, no explanation.',
      model: CHEAP_MODEL,
      phase: 'builder',
      sandbox: true,
      cwd: process.cwd(),
      env: process.env,
    });
    assert.equal(result.ok, true, `a sandboxed child failed to start: ${result.raw.slice(0, 800)}`);
    assert.equal(result.text.toLowerCase().includes('pineapple'), true, result.text);
    assert.equal(
      /invalid settings|failed to parse settings|unknown setting/i.test(result.raw),
      false,
      `the CLI complained about the settings blob: ${result.raw.slice(0, 800)}`,
    );
  });
});
