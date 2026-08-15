/**
 * Tests for the impeccable `detect --json` parser (PLAN.md item 42, R29).
 *
 * The happy path is asserted against REAL committed impeccable 4.0.4 output
 * (`test/fixtures/impeccable/`), per the fixture-over-mocks rule this repo holds for anything that
 * parses another binary's output. The deny paths use small inline JSON, because you cannot capture
 * *malformed* output from a working impeccable — the point there is the parser's own robustness.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { parseImpeccableFindings, SlopError } from '../scripts/design-slop.mjs';

const FIXTURE = readFileSync(new URL('./fixtures/impeccable/slop-findings.json', import.meta.url), 'utf8');

describe('parseImpeccableFindings against real impeccable 4.0.4 output', () => {
  it('partitions the real capture into two primary and one advisory finding', () => {
    const { primary, advisory } = parseImpeccableFindings(FIXTURE);
    assert.deepEqual(primary.map((f) => f.antipattern).sort(), ['bounce-easing', 'overused-font']);
    assert.deepEqual(advisory.map((f) => f.antipattern), ['em-dash-overuse']);
  });

  it('partitions on advisory===true, not severity — the trap only a real capture reveals', () => {
    const { primary, advisory } = parseImpeccableFindings(FIXTURE);
    // em-dash-overuse reports severity 'warning' AND advisory true. Splitting on severity would
    // misfile it as gate-failing; the flag is the discriminator, matching impeccable's isAdvisory.
    assert.equal(advisory.length, 1);
    assert.equal(advisory[0].antipattern, 'em-dash-overuse');
    assert.equal(advisory[0].severity, 'warning');
    assert.equal(advisory[0].advisory, true);
    assert.equal(primary.every((f) => f.advisory === false), true);
  });

  it('extracts the load-bearing fields of a primary finding', () => {
    const { primary } = parseImpeccableFindings(FIXTURE);
    const font = primary.find((f) => f.antipattern === 'overused-font');
    if (font === undefined) throw new Error('fixture no longer contains the overused-font finding');
    assert.equal(font.file, 'slop.html');
    assert.equal(font.line, 3);
    assert.equal(font.severity, 'warning');
    assert.equal(font.category, 'slop');
    assert.equal(font.snippet, 'font-family: Arial');
    assert.equal(font.advisory, false);
  });
});

describe('parseImpeccableFindings fails closed', () => {
  it('treats "the tool ran and found nothing" ([]) as an empty result, not a failure', () => {
    const { primary, advisory } = parseImpeccableFindings('[]\n');
    assert.deepEqual(primary, []);
    assert.deepEqual(advisory, []);
  });

  it('throws on empty stdout, which is no answer rather than no findings', () => {
    // The distinction that matters: `''` is "the tool produced nothing" and must not read as `[]`.
    assert.throws(() => parseImpeccableFindings(''), SlopError);
  });

  it('throws on output that is not valid JSON', () => {
    assert.throws(() => parseImpeccableFindings('not json at all'), SlopError);
  });

  it('throws when the top level is not an array', () => {
    assert.throws(() => parseImpeccableFindings('{"findings": []}'), SlopError);
  });

  it('throws on a finding missing its antipattern id', () => {
    assert.throws(() => parseImpeccableFindings('[{"file": "a.html"}]'), SlopError);
  });

  it('throws on a finding missing its file', () => {
    assert.throws(() => parseImpeccableFindings('[{"antipattern": "overused-font"}]'), SlopError);
  });

  it('reads only literal true as advisory, so a truthy non-true stays primary (fail-closed)', () => {
    // Misreading advisory as primary over-reports (safe); the reverse hides a failure, so anything
    // that is not the literal `true` is counted primary.
    const { primary, advisory } = parseImpeccableFindings('[{"antipattern":"x","file":"a","advisory":"true"}]');
    assert.equal(primary.length, 1);
    assert.equal(advisory.length, 0);
    assert.equal(primary[0].advisory, false);
  });
});
