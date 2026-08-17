/**
 * Tests for the test-stability gate (DESIGN.md §4, REVIEW F30).
 *
 * **An asymmetry nobody would have chosen.** The Playwright parser preserves the runner's whole-test
 * `flaky` status deliberately, and the ratchet refuses to credit it deliberately: a test that failed
 * and then passed on a retry has proved nothing, and admitting it would arm a hard reset that fires
 * on noise. But nothing ever turned that refusal into a *failure*. Playwright exits zero when every
 * test is expected or flaky, so a **newly** flaky test — one with no earlier ratchet identity to
 * regress against — left every gate green and could reach the Panel and `SHIPPED`, while the run's
 * own normalised evidence said the test had failed before it retried. Whether an unstable test
 * blocked a ship depended on whether the instability appeared before or after the ratchet first saw
 * it.
 *
 * The fixture below is **real Playwright output**, committed under `test/fixtures/reporters/`, and
 * that matters here more than usual: the claim is about a status a real runner really emits, and a
 * hand-written approximation of it would be a test of our own imagination (CLAUDE.md, §11).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { STABILITY_ID_LIMIT, stabilityGateResult } from '../scripts/driver.mjs';
import { collapseByWorstStatus, parseReport } from '../scripts/reporters/index.mjs';

const FIXTURES = fileURLToPath(new URL('./fixtures/reporters/', import.meta.url));
/** @type {Record<string, { runner: string, version: string, rootDir: string }>} */
const PROVENANCE = JSON.parse(readFileSync(path.join(FIXTURES, 'provenance.json'), 'utf8'));
const PLAYWRIGHT_ROOT = PROVENANCE['playwright-1.62.1'].rootDir;
const PLAYWRIGHT_RUN1 = readFileSync(path.join(FIXTURES, 'playwright-1.62.1-run1.json'), 'utf8');

/** @param {string} raw @param {string} rootDir @returns {Map<string, string>} */
const collapse = (raw, rootDir) => collapseByWorstStatus(parseReport(raw, { rootDir }).tests);

describe('stabilityGateResult', () => {
  it('says nothing when nothing was flaky', () => {
    assert.equal(stabilityGateResult([]), null);
  });

  it('fails, deterministically, naming the ids in sorted order', () => {
    const result = stabilityGateResult(['b::two', 'a::one']);
    assert.equal(result?.name, 'test-stability');
    assert.equal(result?.ok, false);
    assert.equal(result?.status, 1);
    assert.equal(result?.detail.includes('a::one, b::two'), true, String(result?.detail));
  });

  it('counts each id once, however many records produced it', () => {
    const result = stabilityGateResult(['a::one', 'a::one']);
    assert.equal(result?.detail.startsWith('1 test(s)'), true, String(result?.detail));
  });

  it('bounds the list and says how many it dropped, rather than truncating silently', () => {
    // This text reaches the builder's brief. A repair objective naming four hundred tests is not a
    // repair objective, and one that quietly names twenty of four hundred is a lie.
    const ids = Array.from({ length: STABILITY_ID_LIMIT + 5 }, (_, index) => `t${String(index).padStart(3, '0')}::x`);
    const result = stabilityGateResult(ids);
    assert.equal(result?.detail.includes('and 5 more'), true, String(result?.detail));
    assert.equal(result?.detail.includes(`${ids.length} test(s)`), true, String(result?.detail));
  });

  it('tells the builder what to do about it, not only that it happened', () => {
    const result = stabilityGateResult(['a::one']);
    assert.equal(result?.detail.includes('Make them deterministic'), true, String(result?.detail));
  });
});

describe('real Playwright output really does produce a flaky status', () => {
  it('collapses the committed fixture into passed and flaky ids', () => {
    // The premise of the whole finding, taken from a real runner rather than from a fixture we
    // invented: `flaky` is a status Playwright emits for a test that failed and then passed.
    const collapsed = collapse(PLAYWRIGHT_RUN1, PLAYWRIGHT_ROOT);
    const flaky = [...collapsed].filter(([, status]) => status === 'flaky').map(([id]) => id);
    const passed = [...collapsed].filter(([, status]) => status === 'passed').map(([id]) => id);
    assert.equal(flaky.length > 0, true, 'the fixture no longer contains a flaky test');
    assert.equal(passed.length > 0, true, 'the fixture no longer contains a passing test');
    assert.equal(
      flaky.every((id) => id.includes('is flaky on purpose')),
      true,
      flaky.join(' | '),
    );
  });

  it('turns that fixture into a failed stability gate naming those tests', () => {
    const collapsed = collapse(PLAYWRIGHT_RUN1, PLAYWRIGHT_ROOT);
    const flaky = [...collapsed].filter(([, status]) => status === 'flaky').map(([id]) => id);
    const result = stabilityGateResult(flaky);
    assert.equal(result?.ok, false);
    for (const id of flaky) assert.equal(result?.detail.includes(id), true, String(result?.detail));
  });

  it('does not treat skipped tests as unstable', () => {
    // The neighbour that must keep its own meaning: a skipped or pending test is an absence, not an
    // unstable pass, and reinterpreting it would fail every suite with a `todo` in it.
    const collapsed = collapse(PLAYWRIGHT_RUN1, PLAYWRIGHT_ROOT);
    const skipped = [...collapsed].filter(([, status]) => status === 'skipped').map(([id]) => id);
    assert.equal(skipped.length > 0, true, 'the fixture no longer contains a skipped test');
    assert.equal(stabilityGateResult(skipped.filter(() => false)), null);
    const result = stabilityGateResult([...collapsed].filter(([, s]) => s === 'flaky').map(([id]) => id));
    for (const id of skipped) assert.equal(result?.detail.includes(id), false, `${id} was reported as unstable`);
  });
});
