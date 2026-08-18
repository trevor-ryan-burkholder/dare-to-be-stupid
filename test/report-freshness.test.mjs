/**
 * Tests for `reportFreshnessGateResult` (REVIEW F32).
 *
 * The sibling of `test/stability-gate.test.mjs`, and for the same structural reason: F16 gave the
 * run a way to *withhold* report evidence, and withholding alone is not a verdict. An attempt whose
 * evidence was withheld and whose remaining gates all passed would read as a clean iteration that
 * merely collected nothing — which is how a run reaches `SHIPPED` over a workspace that could not
 * tell this attempt's output from the last one's.
 *
 * So the refusal has two halves. `scripts/reports.mjs` withholds; this makes the attempt fail. This
 * file tests the second half in isolation; `test/reports.test.mjs` tests the first;
 * `test/integration/report-freshness.integration.test.mjs` proves the real `gateTree` composes both.
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';

import { UNCLEARED_PATH_LIMIT, reportFreshnessGateResult } from '../scripts/driver.mjs';

const ROOT = path.join(path.sep, 'work', 'candidate');

/** @param {string} name @returns {string} */
const report = (name) => path.join(ROOT, '.meeseeks', name);

describe('reportFreshnessGateResult', () => {
  it('is null when every declared report path was cleared, which is every ordinary attempt', () => {
    // The benign neighbour, first. A gate that fires on the ordinary path is not a gate.
    assert.equal(reportFreshnessGateResult([], ROOT), null);
  });

  it('fails the attempt by name when one path could not be cleared', () => {
    const result = reportFreshnessGateResult([report('test-report.json')], ROOT);
    assert.notEqual(result, null);
    assert.equal(/** @type {{ name: string }} */ (result).name, 'report-freshness');
    assert.equal(/** @type {{ ok: boolean }} */ (result).ok, false);
    assert.equal(/** @type {{ status: number }} */ (result).status, 1);
  });

  it('names the paths relative to the tree they belong to', () => {
    // Absolute paths in a builder's brief leak a temporary worktree's location and say nothing the
    // builder can act on. The relative path is the one that matches what it sees.
    const result = reportFreshnessGateResult([report('test-report.json')], ROOT);
    const detail = /** @type {{ detail: string }} */ (result).detail;
    assert.equal(detail.includes(path.join('.meeseeks', 'test-report.json')), true, detail);
    assert.equal(detail.includes(ROOT), false, 'the absolute path reached the brief');
  });

  it('says that no evidence was read, because that is the consequence the reader must know', () => {
    const detail = /** @type {{ detail: string }} */ (reportFreshnessGateResult([report('e2e-report.json')], ROOT))
      .detail;
    assert.equal(detail.includes('No test evidence'), true, detail);
    assert.equal(detail.includes("previous attempt's"), true, detail);
  });

  it('sorts and de-duplicates, so the same failure reads the same way twice', () => {
    const result = reportFreshnessGateResult(
      [report('e2e-report.json'), report('test-report.json'), report('e2e-report.json')],
      ROOT,
    );
    const detail = /** @type {{ detail: string }} */ (result).detail;
    assert.equal(
      detail.endsWith(`${path.join('.meeseeks', 'e2e-report.json')}, ${path.join('.meeseeks', 'test-report.json')}`),
      true,
      detail,
    );
  });

  it('counts the rest rather than listing a hundred paths into a brief', () => {
    const many = Array.from({ length: UNCLEARED_PATH_LIMIT + 3 }, (_unused, index) =>
      report(`report-${String(index).padStart(3, '0')}.json`),
    );
    const detail = /** @type {{ detail: string }} */ (reportFreshnessGateResult(many, ROOT)).detail;
    assert.equal(detail.includes('and 3 more'), true, detail);
    assert.equal(detail.startsWith(`${UNCLEARED_PATH_LIMIT + 3} declared test-report path(s)`), true, detail);
    assert.equal(detail.includes('report-022.json'), false, 'the cap did not hold');
  });
});
