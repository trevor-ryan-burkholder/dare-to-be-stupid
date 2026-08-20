/**
 * Tier 3 — the builder's assumptions contract, against a real `claude -p`. **Spends money.**
 *
 * `parseAssumptions` is unit-tested against strings this repository wrote, which is exactly the
 * position `claudeArgs` was in before the argv defect: correct about the thing it controls, and
 * silent about the thing it does not. What this file checks is the half no assertion about the
 * parser can reach — **whether a real builder, handed the prompt `builderSystemPrompt` composes,
 * actually emits a block the parser accepts, and refrains from emitting one when nothing is
 * ambiguous.** Since 0.246.0 that prompt is assembled from `producer-authority.md` and two code
 * addenda (§8.5) rather than read from one file; the bytes are held identical by tier 1, and this
 * is the tier that can say whether a model still behaves the same way when handed them.
 *
 * Three things can go wrong here and none is visible from tier 1:
 *
 * 1. The model emits prose where the template asked for json, so every ambiguity is lost.
 * 2. The model emits a block on *every* iteration because being asked implies an expectation,
 *    which is the `lessons.mjs` failure arriving through a new door — and it reaches the
 *    reviewer, at reviewer prices.
 * 3. The model cites nothing, so everything it reports is discarded and the log stays empty
 *    while appearing to work.
 *
 * **This has never been run.** It was written alongside A9 and deliberately not executed; the
 * session that added it was not permitted to spend. Run it before trusting the contract:
 *
 *     MEESEEKS_LIVE=1 npm run test:live
 *
 * Expect a few cents and under a minute. If (2) is what happens, the fix is in the template
 * rather than the parser — tighten "emit no block at all if nothing was ambiguous".
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseAssumptions } from '../../scripts/assumptions.mjs';
import { builderSystemPrompt, spawnClaude } from '../../scripts/driver.mjs';

const ARMED = process.env.MEESEEKS_LIVE === '1';

/** Generous: a live round trip includes model latency nobody here controls. */
const LIVE_TIMEOUT = 180_000;

/** The cheapest model that still exercises the same spawn path. */
const CHEAP_MODEL = 'claude-haiku-4-5-20251001';

/**
 * Ask a builder-shaped child to answer without letting it touch the repository.
 *
 * `phase: 'reality-check'` rather than `'builder'` on purpose: this checks an *output*
 * contract, and there is no reason to hand a test child dangerous mode to do it.
 *
 * @param {string} prompt
 * @returns {Promise<import('../../scripts/driver.mjs').ClaudeResult>}
 */
async function askBuilder(prompt) {
  return await spawnClaude({
    prompt,
    systemPrompt: builderSystemPrompt(process.cwd()),
    model: CHEAP_MODEL,
    phase: 'reality-check',
    cwd: process.cwd(),
    env: process.env,
  });
}

describe('tier 3 — the assumptions output contract', { timeout: LIVE_TIMEOUT }, () => {
  it('is armed, or fails rather than skipping', () => {
    // A green tick for a suite that made no API call is a lie the reader takes for coverage.
    assert.equal(ARMED, true, 'set MEESEEKS_LIVE=1 to run tier 3; it spends real money');
  });

  it('emits a parseable, cited block when the specification is genuinely ambiguous', async () => {
    if (!ARMED) return;
    const result = await askBuilder(
      [
        'Do not write any files. This is a dry run and you are answering about one requirement only.',
        '',
        'PRD-2.4: "A request for an expired short link must not return the original URL."',
        '',
        'The requirement does not say which status code an expired link returns. Decide, then give',
        'your one or two lines as usual.',
      ].join('\n'),
    );
    assert.equal(result.ok, true, `the child failed: ${result.raw}`);

    const parsed = parseAssumptions(result.text);
    assert.equal(parsed.malformed, '', `the block did not parse: ${parsed.malformed}`);
    assert.equal(parsed.assumptions.length >= 1, true, 'no assumption survived the citation bar');
    assert.equal(
      parsed.assumptions.every((assumption) => assumption.cites.includes('2.4')),
      true,
      'an assumption did not cite the requirement it was about',
    );
  });

  it('emits no block at all when nothing is ambiguous', async () => {
    if (!ARMED) return;
    // The failure mode that matters more than the first. A model that answers because it was
    // asked fills the log with generalities, and the log reaches the reviewer.
    const result = await askBuilder(
      [
        'Do not write any files. This is a dry run.',
        '',
        'PRD-1.1: "GET /health returns 200 with the body {\\"status\\":\\"ok\\"} and no other fields."',
        '',
        'Nothing about this requirement is ambiguous. Give your one or two lines as usual.',
      ].join('\n'),
    );
    assert.equal(result.ok, true, `the child failed: ${result.raw}`);
    assert.deepEqual(
      parseAssumptions(result.text).assumptions,
      [],
      'the builder invented an assumption for an unambiguous requirement',
    );
  });
});
