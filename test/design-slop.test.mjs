/**
 * Tests for the impeccable `detect --json` parser (PLAN.md item 42, R29).
 *
 * The happy path is asserted against REAL committed impeccable 4.0.4 output
 * (`test/fixtures/impeccable/`), per the fixture-over-mocks rule this repo holds for anything that
 * parses another binary's output. The deny paths use small inline JSON, because you cannot capture
 * *malformed* output from a working impeccable — the point there is the parser's own robustness.
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

/** @type {string[]} */
const temporaryDirs = [];
after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

import {
  designSlopEvidence,
  parseImpeccableFindings,
  SLOP_OUTPUT_LIMIT,
  SLOP_RENDER_LIMIT,
  SLOP_SNIPPET_LIMIT,
  SlopError,
} from '../scripts/design-slop.mjs';

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

describe('designSlopEvidence turns one detect run into a gate result', () => {
  // Derived from the real capture by filtering it, never by inventing findings: the shapes stay
  // impeccable 4.0.4's own. `advisoryOnly` is what a clean-but-chatty page really produces.
  const ALL = JSON.parse(FIXTURE);
  const advisoryOnly = JSON.stringify(ALL.filter((/** @type {{advisory?: boolean}} */ f) => f.advisory === true));
  const primaryOnly = JSON.stringify(ALL.filter((/** @type {{advisory?: boolean}} */ f) => f.advisory !== true));

  it('fails on primary findings and names each one with its rule and location', () => {
    const { ok, detail } = designSlopEvidence({ stdout: FIXTURE, status: 2 });
    assert.equal(ok, false);
    assert.match(detail, /design-slop findings that fail this gate \(2\):/);
    assert.match(detail, /- overused-font at slop\.html:3:/);
    assert.match(detail, /- bounce-easing at slop\.html:7:/);
  });

  it('records advisory findings in the same detail without giving them gate authority', () => {
    // The whole point of the partition. `em-dash-overuse` reports severity "warning" and is
    // advisory; a gate that failed on it would fail a run over punctuation.
    const { ok, detail } = designSlopEvidence({ stdout: advisoryOnly, status: 0 });
    assert.equal(ok, true);
    assert.match(detail, /^no gate-failing design findings\n/);
    assert.match(detail, /advisory findings, recorded but not gate-failing \(1\):/);
    assert.match(detail, /- em-dash-overuse at slop\.html:/);
  });

  it('says so plainly when impeccable found nothing at all', () => {
    assert.deepEqual(designSlopEvidence({ stdout: '[]', status: 0 }), {
      ok: true,
      detail: 'impeccable found nothing, primary or advisory',
    });
  });

  it('refuses a status that contradicts the stream, in both directions', () => {
    // impeccable exits 2 exactly when primary findings exist. A disagreement means the status and
    // the stdout came from different runs — a wrapper swallowing output, a redirect, a moved
    // contract — and resolving it either way converts an unknown into a verdict.
    const clean = designSlopEvidence({ stdout: primaryOnly, status: 0 });
    assert.equal(clean.ok, false);
    assert.match(clean.detail, /exited 0 while reporting 2 primary and 0 advisory findings/);

    const noisy = designSlopEvidence({ stdout: advisoryOnly, status: 2 });
    assert.equal(noisy.ok, false);
    assert.match(noisy.detail, /exited 2 while reporting 0 primary and 1 advisory findings/);
  });

  it('refuses an empty stream rather than reading it as a clean pass', () => {
    const { ok, detail } = designSlopEvidence({ stdout: '   \n', status: 0, stderr: 'impeccable: bad flag' });
    assert.equal(ok, false);
    assert.match(detail, /produced no output at all/);
    // The stderr travels, because "no output" and "no output, and here is why" are debugged
    // very differently.
    assert.match(detail, /impeccable: bad flag$/);
  });

  it('refuses output past the interpretation limit rather than truncating it', () => {
    const { ok, detail } = designSlopEvidence({ stdout: 'x'.repeat(SLOP_OUTPUT_LIMIT + 1), status: 0 });
    assert.equal(ok, false);
    assert.match(detail, /over the 1048576-byte limit/);
    assert.match(detail, /Refused rather than truncated/);
  });

  it('carries a parse failure through as a failure, never as "no findings"', () => {
    const { ok, detail } = designSlopEvidence({ stdout: '{"not":"an array"}', status: 0 });
    assert.equal(ok, false);
    assert.match(detail, /could not be trusted: impeccable --json output was not an array/);
  });

  it('states that it stopped listing rather than letting a long list read as complete', () => {
    const one = JSON.parse(primaryOnly)[0];
    const many = JSON.stringify(Array.from({ length: SLOP_RENDER_LIMIT + 3 }, () => one));
    const { ok, detail } = designSlopEvidence({ stdout: many, status: 2 });
    assert.equal(ok, false);
    assert.equal(detail.split('\n').filter((line) => line.startsWith('  - ')).length, SLOP_RENDER_LIMIT + 1);
    assert.match(detail, /- \.\.\. and 3 more, not shown$/);
  });
});

describe('the parser holds against the version the gate actually resolves', () => {
  // `slop-findings.json` came from the **Claude Code plugin** at 4.0.4. The gate runs
  // `npx impeccable@<pin> detect --json`, which resolves from **npm**, whose newest impeccable is
  // 3.6.0 — there is no 4.0.4 there at all. A parser proved only against 4.0.4 was proved against
  // a version no run will ever execute. This capture is the real published CLI's output.
  const FIXTURE_360 = readFileSync(new URL('./fixtures/impeccable/slop-findings-3.6.0.json', import.meta.url), 'utf8');
  const FIXTURE_QUALITY = readFileSync(new URL('./fixtures/impeccable/slop-findings-3.6.0-quality.json', import.meta.url), 'utf8');

  it('partitions 3.6.0 output on the same rule, with advisory omitted rather than false', () => {
    // The version difference that matters: 3.6.0 omits `advisory` entirely on a primary finding
    // instead of emitting `false`. The strict `=== true` test treats an absent flag as primary,
    // which is the fail-closed direction and the reason it survives the change.
    const { primary, advisory } = parseImpeccableFindings(FIXTURE_360);
    assert.deepEqual(primary.map((f) => f.antipattern), ['overused-font']);
    assert.deepEqual(advisory.map((f) => f.antipattern), ['em-dash-overuse']);
    // Still severity "warning" on the advisory one, so severity is still not the discriminator.
    assert.equal(advisory[0].severity, 'warning');
  });

  it('carries the snippet, because every finding of one rule shares its description', () => {
    // Captured from the gate's **exact** pinned command — `npx impeccable@3.6.0 detect --json` —
    // against a deliberately sloppy page (PLAN item 42, Slice B1 residual). impeccable's
    // `description` is per-rule boilerplate; the snippet is the only part that says *what* failed.
    const { detail } = designSlopEvidence({ stdout: FIXTURE_QUALITY, status: 2 });
    assert.match(detail, /\[Primary font: inter\]/);
    assert.match(detail, /\[Purple\/violet accent colors detected\]/);
    assert.match(detail, /\[3\.3:1 \(need 4\.5:1\) — text #000000 on #764ba2\]/);
  });

  it('bounds a snippet rather than reproducing whatever another program emitted', () => {
    const long = JSON.stringify([{ antipattern: 'x', name: 'X', description: 'd', severity: 'warning', category: 'slop', file: 'a.html', line: 0, snippet: 'S'.repeat(400) }]);
    const { detail } = designSlopEvidence({ stdout: long, status: 2 });
    assert.equal(detail.includes('S'.repeat(SLOP_SNIPPET_LIMIT)), true, detail);
    assert.equal(detail.includes('S'.repeat(SLOP_SNIPPET_LIMIT + 1)), false, 'the snippet was not bounded');
    // Truncation is visible, for the same reason the finding list says when it stops at 25.
    assert.match(detail, /…\]/);
  });

  it('keeps a finding impeccable reported twice, rather than deciding which one was real', () => {
    // The capture contains a **byte-identical** `low-contrast` pair. De-duplicating another tool's
    // output would be this repository choosing which of its findings counted, and the count the
    // gate reports has to be the count the tool produced.
    const { primary } = parseImpeccableFindings(FIXTURE_QUALITY);
    assert.equal(primary.length, 4);
    assert.deepEqual(
      primary.map((finding) => finding.antipattern),
      ['low-contrast', 'low-contrast', 'overused-font', 'ai-color-palette'],
    );
  });

  it('treats a quality-category finding as primary, since category is not the discriminator', () => {
    // Every earlier fixture is category `slop`. `low-contrast` is `quality`, and it still fails the
    // gate — `advisory` decides, and on this capture it is absent on all four, which the strict
    // `=== true` test reads as primary. That is the fail-closed direction.
    const { primary, advisory } = parseImpeccableFindings(FIXTURE_QUALITY);
    assert.equal(advisory.length, 0);
    assert.equal(primary.some((finding) => finding.category === 'quality'), true);
  });

  it('renders a 3.6.0 run into the same gate verdict shape', () => {
    // Exit 2 with primary findings is the contract `designSlopEvidence` requires the stream to
    // agree with, and it was observed from the real 3.6.0 CLI rather than read from documentation.
    const { ok, detail } = designSlopEvidence({ stdout: FIXTURE_360, status: 2 });
    assert.equal(ok, false);
    assert.match(detail, /design-slop findings that fail this gate \(1\):/);
    assert.match(detail, /advisory findings, recorded but not gate-failing \(1\):/);
  });
});

describe('a design gate that scanned nothing has not passed (feature audit, item 158)', () => {
  // **Reproduced against the pinned 3.6.0 CLI.** The gate argv ends in a hardcoded `src/`, and
  // `web-ui` is armed from *dependencies* — react, vue, svelte — not from a directory. In a project
  // whose interface lives anywhere else, impeccable prints a warning on stderr, `[]` on stdout, and
  // exits **0**; `designSlopEvidence` read that as "found nothing, primary or advisory" and passed a
  // required gate having examined zero files.
  //
  // This module's own rule is that an empty stream is not evidence of a clean pass. It was bypassed
  // because the emptiness arrived as a well-formed empty *array* rather than an empty stream.
  const GATE = ['npx', 'impeccable@3.6.0', 'detect', '--json', 'src/'];

  it('refuses when the directory it was pointed at is not in the tree', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'slop-nosrc-'));
    temporaryDirs.push(root);
    mkdirSync(path.join(root, 'app'), { recursive: true });
    const { ok, detail } = designSlopEvidence({ stdout: '[]', status: 0, cwd: root, command: GATE });
    assert.equal(ok, false);
    assert.match(detail, /does not exist in this tree/);
    assert.match(detail, /src\//);
  });

  it('accepts an empty finding list when the directory really was there', () => {
    // **The neighbour, and it is the whole difference.** "Found nothing" is a legitimate pass; only
    // "looked nowhere" is not, and the two are the same bytes on stdout.
    const root = mkdtempSync(path.join(os.tmpdir(), 'slop-src-'));
    temporaryDirs.push(root);
    mkdirSync(path.join(root, 'src'), { recursive: true });
    const { ok, detail } = designSlopEvidence({ stdout: '[]', status: 0, cwd: root, command: GATE });
    assert.equal(ok, true, detail);
    assert.match(detail, /found nothing/);
  });

  it('does not treat a trailing flag as a missing directory', () => {
    // A future argv ending in `--json` must not be read as a path that is not there.
    const root = mkdtempSync(path.join(os.tmpdir(), 'slop-flag-'));
    temporaryDirs.push(root);
    const { ok } = designSlopEvidence({ stdout: '[]', status: 0, cwd: root, command: ['npx', 'impeccable', 'detect', '--json'] });
    assert.equal(ok, true);
  });

  it('keeps the old behaviour for a caller that supplies no tree', () => {
    // Every existing caller and test passes only `{ stdout, status }`. A refusal they cannot act on
    // would be a regression dressed as a fix.
    const { ok } = designSlopEvidence({ stdout: '[]', status: 0 });
    assert.equal(ok, true);
  });
});
