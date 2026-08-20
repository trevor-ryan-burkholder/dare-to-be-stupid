/**
 * Claim consistency (`scripts/claims.mjs`, PLAN item 49, DESIGN §3.8.5).
 *
 * The cases that matter here are the **near-agreements** and the **near-contradictions**: `42` and
 * `42.0` are one value, `42 percent` and `0.42 ratio` are a question for a person, and `42` and
 * `43` under one unit are a contradiction no reading reconciles. A suite that only proved the
 * obvious contradiction fails would pass against a module that flagged everything.
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { CLAIMS_MANIFEST, ClaimError, claimsGate, inspectClaims, normalizeValue, parseClaims } from '../scripts/claims.mjs';

/** @type {string[]} */
const temporaryDirs = [];
after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** @param {Record<string, string>} files @returns {string} */
function treeWith(files) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-claims-'));
  temporaryDirs.push(dir);
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), body, 'utf8');
  }
  return dir;
}

/** @param {Partial<import('../scripts/claims.mjs').Claim>[]} claims */
const manifest = (claims) => JSON.stringify({ version: 1, claims });

/** @param {Partial<import('../scripts/claims.mjs').Claim>} [overrides] */
const claim = (overrides = {}) => ({
  id: 'CL1',
  value: '42',
  unit: 'percent',
  statedIn: 'manuscript/03.md',
  ...overrides,
});

/** @param {Partial<import('../scripts/claims.mjs').Claim>[]} claims */
const treeClaiming = (claims) =>
  treeWith({ 'manuscript/03.md': '# Findings\n', [CLAIMS_MANIFEST]: manifest(claims) });

describe('normalizeValue', () => {
  it('reads numbers numerically, so three spellings of one figure agree', () => {
    // Reporting these as a contradiction would train an author to distrust the gate, which is a
    // worse outcome than the check not existing.
    const forms = ['42', '42.0', '+42', ' 42 ', '4.2e1'];
    assert.equal(new Set(forms.map(normalizeValue)).size, 1);
    assert.equal(normalizeValue('42'), 'number:42');
  });

  it('keeps genuinely different numbers apart', () => {
    assert.notEqual(normalizeValue('42'), normalizeValue('43'));
    assert.notEqual(normalizeValue('42'), normalizeValue('42.5'));
    assert.notEqual(normalizeValue('42'), normalizeValue('-42'));
  });

  it('folds case and whitespace for text values, where capitalization is formatting', () => {
    assert.equal(normalizeValue('Rising  Sharply'), normalizeValue('rising sharply'));
    assert.notEqual(normalizeValue('rising'), normalizeValue('falling'));
  });

  it('never turns a blank into a zero', () => {
    // `Number('')` is 0. The manifest rejects blanks before this, and the guard stays because a
    // silent zero is precisely the wrong answer nothing downstream could notice.
    assert.equal(normalizeValue('   '), 'text:');
    assert.notEqual(normalizeValue('   '), normalizeValue('0'));
  });
});

describe('parseClaims', () => {
  it('reads a well-formed manifest, and an empty one is well-formed', () => {
    assert.deepEqual(parseClaims(manifest([])), []);
    assert.deepEqual(parseClaims(manifest([claim()])), [claim()]);
  });

  it('allows a duplicate id, because deciding what a duplicate means is the whole job', () => {
    // The deliberate asymmetry with the citation manifest, which refuses one. Two citations under
    // one id is a bookkeeping error; two claims under one id is the subject of this module.
    assert.equal(parseClaims(manifest([claim(), claim({ value: '43' })])).length, 2);
  });

  it('refuses every shape that is not a manifest', () => {
    /** @type {[string, RegExp][]} */
    const cases = [
      ['{ not json', /not valid JSON/],
      ['[]', /must be a JSON object/],
      ['{"claims":[]}', /must declare "version": 1/],
      ['{"version":1}', /must declare a "claims" array/],
      ['{"version":1,"claims":[7]}', /claim 0 is not an object/],
    ];
    for (const [text, expected] of cases) {
      assert.throws(() => parseClaims(text), (error) => error instanceof ClaimError && expected.test(error.message), text);
    }
  });

  it('requires a unit, and says why an absent one cannot be defaulted', () => {
    const { unit, ...withoutUnit } = claim();
    assert.equal(unit, 'percent');
    assert.throws(
      () => parseClaims(manifest([withoutUnit])),
      (error) => error instanceof ClaimError && /two values are only comparable under a stated unit/.test(error.message),
    );
  });
});

describe('inspectClaims', () => {
  it('reports one id stated once as consistent', () => {
    assert.deepEqual(inspectClaims([claim()]), { contradicted: [], referred: [], consistent: 1 });
  });

  it('reports a restatement of the same figure as consistent, not as a duplicate', () => {
    assert.deepEqual(inspectClaims([claim(), claim({ value: '42.0', statedIn: 'manuscript/05.md' })]), {
      contradicted: [],
      referred: [],
      consistent: 1,
    });
  });

  it('contradicts one id given two values under one unit', () => {
    const report = inspectClaims([claim(), claim({ value: '43' })]);
    assert.deepEqual(report.contradicted, [{ id: 'CL1', unit: 'percent', values: ['number:42', 'number:43'] }]);
    assert.equal(report.consistent, 0);
  });

  it('refers one id stated in two units rather than converting between them', () => {
    // `42 percent` and `0.42 ratio` may be the same number. Converting arbitrary units is the
    // guessing this codebase refuses everywhere, so a person decides.
    const report = inspectClaims([claim(), claim({ value: '0.42', unit: 'ratio' })]);
    assert.deepEqual(report.referred, [{ id: 'CL1', units: ['percent', 'ratio'] }]);
    assert.deepEqual(report.contradicted, []);
    assert.equal(report.consistent, 0);
  });

  it('still contradicts within a unit when a third entry uses another unit', () => {
    // The ordering that matters. Deferring the whole id to review because one entry was in other
    // units would let a genuine conflict hide behind an unrelated one.
    const report = inspectClaims([claim(), claim({ value: '43' }), claim({ value: '0.42', unit: 'ratio' })]);
    assert.deepEqual(report.contradicted, [{ id: 'CL1', unit: 'percent', values: ['number:42', 'number:43'] }]);
    assert.deepEqual(report.referred, []);
  });

  it('treats units case- and whitespace-insensitively, because a unit is a label', () => {
    assert.deepEqual(inspectClaims([claim({ unit: 'Percent' }), claim({ unit: ' percent ' })]).referred, []);
    assert.equal(inspectClaims([claim({ unit: 'Percent' }), claim({ unit: ' percent ' })]).consistent, 1);
  });

  it('keeps separate ids separate', () => {
    const report = inspectClaims([claim(), claim({ id: 'CL2', value: '43' })]);
    assert.deepEqual(report.contradicted, []);
    assert.equal(report.consistent, 2);
  });
});

describe('claimsGate', () => {
  it('fails an absent manifest, and names the honest alternative', () => {
    const gate = claimsGate(treeWith({ 'manuscript/03.md': '# a\n' }));
    assert.equal(gate.ok, false);
    assert.equal(gate.status, 1);
    assert.match(gate.detail, /"claims": \[\]/);
  });

  it('passes an empty manifest', () => {
    const gate = claimsGate(treeWith({ [CLAIMS_MANIFEST]: manifest([]) }));
    assert.equal(gate.ok, true);
    assert.match(gate.detail, /0 claims internally consistent/);
  });

  it('fails a contradiction and names both values', () => {
    const gate = claimsGate(treeClaiming([claim(), claim({ value: '43' })]));
    assert.equal(gate.ok, false);
    assert.equal(gate.status, 1);
    assert.match(gate.detail, /CL1 is assigned 2 different values in "percent": number:42 vs number:43/);
  });

  it('passes a referral, reports it, and does not call it correctness', () => {
    const gate = claimsGate(treeClaiming([claim(), claim({ value: '0.42', unit: 'ratio' })]));
    assert.equal(gate.ok, true);
    assert.equal(gate.status, 0);
    assert.match(gate.detail, /1 referred to review .* CL1 \(percent, ratio\)/);
    assert.match(gate.detail, /consistency, not correctness/);
  });

  it('fails a claim whose statedIn is not a readable file in this tree', () => {
    assert.match(claimsGate(treeClaiming([claim({ statedIn: 'manuscript/gone.md' })])).detail, /cannot be read/);
    for (const statedIn of ['/etc/passwd', '../outside.md', 'a/../../b.md']) {
      const gate = claimsGate(treeClaiming([claim({ statedIn })]));
      assert.equal(gate.ok, false, statedIn);
      assert.match(gate.detail, /escapes the repository|cannot be read/);
    }
  });

  it('does not require the value to appear in the prose that states it', () => {
    // Deliberate. `42%` in the manifest is legitimately "forty-two percent" in the chapter, and a
    // presence check would either be trivially evaded or would fail honest writing.
    const gate = claimsGate(
      treeWith({ 'manuscript/03.md': 'Adoption reached forty-two percent.\n', [CLAIMS_MANIFEST]: manifest([claim()]) }),
    );
    assert.equal(gate.ok, true);
  });
});
