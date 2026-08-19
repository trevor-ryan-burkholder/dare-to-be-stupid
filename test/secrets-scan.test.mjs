/**
 * Tests for the gitleaks report parser and its gate evidence (PLAN.md item 29).
 *
 * The happy paths are asserted against REAL committed gitleaks 8.30.1 output
 * (`test/fixtures/gitleaks/`), per the fixture-over-mocks rule this repo holds for anything that
 * parses another binary's output. That rule paid immediately here: gitleaks removed the `detect`
 * subcommand, so an argv written from memory would have been wrong at the first real run, and the
 * default configuration allowlists AWS's own documented example key, so the obvious fixture secret
 * would have produced an empty report that read as a clean pass.
 *
 * The deny paths use small inline JSON, because you cannot capture *malformed* output from a
 * working gitleaks — the point there is this parser's own robustness.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  gitleaksEvidence,
  parseGitleaksFindings,
  SECRETS_OUTPUT_LIMIT,
  SECRETS_RENDER_LIMIT,
  SecretsError,
} from '../scripts/secrets-scan.mjs';

const LEAKS = readFileSync(new URL('./fixtures/gitleaks/gitleaks-8.30.1-leaks.json', import.meta.url), 'utf8');
const CLEAN = readFileSync(new URL('./fixtures/gitleaks/gitleaks-8.30.1-clean.json', import.meta.url), 'utf8');

describe('parseGitleaksFindings against real gitleaks 8.30.1 output', () => {
  it('reads the rule, the file and the line out of a real finding', () => {
    const findings = parseGitleaksFindings(LEAKS);
    assert.deepEqual(
      findings.map((finding) => [finding.ruleId, finding.file, finding.startLine]),
      [['github-pat', 'src/config.js', 1]],
    );
  });

  it('never carries the credential, or who committed it, off the report', () => {
    // `Secret`, `Match`, `Author`, `Email` and `Commit` are all present in gitleaks' own shape and
    // all deliberately dropped here. The first two are the credential; the rest are personal data a
    // gate has no business copying into a model's context.
    const [finding] = parseGitleaksFindings(LEAKS);
    assert.deepEqual(Object.keys(finding).sort(), ['description', 'file', 'fingerprint', 'ruleId', 'startLine']);
  });

  it('reads a real clean report as an empty finding list', () => {
    assert.deepEqual(parseGitleaksFindings(CLEAN), []);
  });
});

describe('parseGitleaksFindings fails closed', () => {
  /** @type {[string, string][]} */
  const bad = [
    ['not json at all', 'was not valid JSON'],
    ['{"findings":[]}', 'was not an array'],
    ['[3]', 'is not an object'],
    ['[{"File":"a.js"}]', 'has no RuleID'],
    ['[{"RuleID":"github-pat"}]', 'has no File'],
    ['[{"RuleID":"","File":"a.js"}]', 'has no RuleID'],
  ];
  for (const [input, message] of bad) {
    it(`refuses ${JSON.stringify(input.slice(0, 30))} rather than reading it as no secrets`, () => {
      assert.throws(
        () => parseGitleaksFindings(input),
        (error) => error instanceof SecretsError && error.message.includes(message),
      );
    });
  }
});

describe('gitleaksEvidence turns one scan into a gate result', () => {
  it('fails on a real finding and names the rule and location without the secret', () => {
    const { ok, detail } = gitleaksEvidence({ stdout: LEAKS, status: 1 });
    assert.equal(ok, false);
    assert.match(detail, /committed secrets found by gitleaks \(1\):/);
    assert.match(detail, /- github-pat at src\/config\.js:1: Uncovered a GitHub Personal Access Token/);
    assert.match(detail, /Remove the credential from the tree and rotate it/);
    assert.equal(detail.includes('REDACTED'), false);
  });

  it('passes a real clean scan', () => {
    assert.deepEqual(gitleaksEvidence({ stdout: CLEAN, status: 0 }), {
      ok: true,
      detail: 'gitleaks found no committed secrets',
    });
  });

  it('refuses an empty report, because a missing target exits 1 exactly like a found secret', () => {
    // Measured against the real binary: `gitleaks dir ... /nonexistent` exits 1 with an empty
    // stdout and an FTL line on stderr. The status alone cannot tell that from a real finding, so
    // trusting it would report a scan that never happened as a scan that found something, and
    // trusting the empty report would call the tree clean. Neither is true.
    const { ok, detail } = gitleaksEvidence({
      stdout: '',
      status: 1,
      stderr: 'FTL stat /nonexistent-xyz: no such file or directory',
    });
    assert.equal(ok, false);
    assert.match(detail, /no report at all, so it is not known whether this tree was scanned/);
    assert.match(detail, /no such file or directory$/);
  });

  it('refuses a status that contradicts the report, in both directions', () => {
    const missed = gitleaksEvidence({ stdout: LEAKS, status: 0 });
    assert.equal(missed.ok, false);
    assert.match(missed.detail, /exited 0 while reporting 1 finding\(s\)/);

    const phantom = gitleaksEvidence({ stdout: CLEAN, status: 1 });
    assert.equal(phantom.ok, false);
    assert.match(phantom.detail, /exited 1 while reporting 0 finding\(s\)/);
  });

  it('refuses output past the interpretation limit rather than truncating it', () => {
    const { ok, detail } = gitleaksEvidence({ stdout: 'x'.repeat(SECRETS_OUTPUT_LIMIT + 1), status: 0 });
    assert.equal(ok, false);
    assert.match(detail, /Refused rather than truncated/);
  });

  it('states that it stopped listing rather than letting a long list read as complete', () => {
    const one = JSON.parse(LEAKS)[0];
    const many = JSON.stringify(Array.from({ length: SECRETS_RENDER_LIMIT + 4 }, () => one));
    const { ok, detail } = gitleaksEvidence({ stdout: many, status: 1 });
    assert.equal(ok, false);
    assert.match(detail, /- \.\.\. and 4 more, not shown/);
  });
});
