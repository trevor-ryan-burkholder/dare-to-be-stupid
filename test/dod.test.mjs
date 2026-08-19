/**
 * `DOD.md`, the operator's additive done-bar (PLAN.md item 48; tier table in item 49).
 *
 * **The refusals are the feature.** A done-bar that launders vagueness into a checklist is worse
 * than none, because it looks like rigour while failing nothing. So the happy path runs against a
 * realistic committed bar, and most of the cases below are things this reader will not accept.
 *
 * The one it deliberately does *not* attempt is judging whether a criterion claiming to be
 * panel-judgeable really states an observation. No parser can separate "feels premium" from "the
 * mark reads as one silhouette at 16px" — both are prose, and what divides them is a judgment. What
 * is refused here is refused deterministically; what cannot be decided is not pretended at.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { DOD_TIERS, DodError, dodIds, parseDod } from '../scripts/dod.mjs';

const ENTERPRISE = readFileSync(new URL('./fixtures/dod/enterprise.md', import.meta.url), 'utf8');

describe('parseDod reads a realistic done-bar', () => {
  const criteria = parseDod(ENTERPRISE);

  it('finds every criterion, with ids that slot into the panel contract', () => {
    assert.deepEqual(dodIds(criteria), ['DOD-1', 'DOD-2', 'DOD-3', 'DOD-4']);
  });

  it('keeps each declared tier, because the two are decided by different things', () => {
    // A deterministic criterion is settled by a script; a panel-judgeable one by a cold reviewer on
    // cited evidence. Collapsing them would send one to the wrong judge.
    assert.deepEqual(
      criteria.map((criterion) => criterion.tier),
      ['deterministic', 'deterministic', 'panel-judgeable', 'panel-judgeable'],
    );
  });

  it('separates the statement from the observation that would falsify it', () => {
    assert.equal(criteria[0].statement, 'The production bundle stays under 200KB gzipped');
    assert.equal(criteria[0].observation, '`npm run size` exits non-zero above the budget');
  });

  it('ignores prose, headings and quotes around the criteria', () => {
    // An operator writing a done-bar writes sentences around it. A reader that took those for
    // criteria would invent a bar nobody set.
    assert.equal(criteria.length, 4);
  });
});

describe('a criterion nobody can decide is refused by name', () => {
  it('refuses one that declares itself unfalsifiable, naming the id and the line', () => {
    // The half that pays. It stops being "we do not do that" and becomes a sentence the operator
    // can act on, raised before a builder is handed something it can never satisfy.
    assert.throws(
      () => parseDod('**DOD-1** (unfalsifiable) — It feels premium. Observation: none.\n'),
      (error) =>
        error instanceof DodError &&
        error.message.includes('DOD-1 declares itself unfalsifiable') &&
        error.message.includes('line 1'),
    );
  });

  it('keeps `unfalsifiable` in the vocabulary so the refusal is about the criterion', () => {
    // Omitting the tier would make an author's honest admission parse as a *typo*, and the operator
    // would be told their spelling was wrong rather than that their criterion decides nothing.
    assert.equal(DOD_TIERS.includes('unfalsifiable'), true);
    assert.throws(
      () => parseDod('**DOD-1** (vibes) — It feels premium. Observation: none.\n'),
      (error) => error instanceof DodError && error.message.includes('which is not one of'),
    );
  });

  it('refuses a criterion that names no observation at all', () => {
    // Every criterion must say what would prove it false, or nothing can ever fail it.
    assert.throws(
      () => parseDod('**DOD-1** (panel-judgeable) — The dashboard is fast.\n'),
      (error) => error instanceof DodError && error.message.includes('names no observation'),
    );
  });

  it('accepts a panel-judgeable criterion, which is the benign neighbour', () => {
    // The refusal has to be a filter and not a wall: a criterion a cold reviewer can settle on
    // evidence is exactly how code requirements already work.
    const criteria = parseDod(
      '**DOD-1** (panel-judgeable) — The empty state explains what to do next. Observation: a reviewer ' +
        'reads it and cites the copy by file:line.\n',
    );
    assert.equal(criteria.length, 1);
    assert.equal(criteria[0].tier, 'panel-judgeable');
  });

  it('accepts a deterministic criterion, which is the other benign neighbour', () => {
    const criteria = parseDod('**DOD-1** (deterministic) — Coverage stays above 80%. Observation: `npm run coverage` exits 1 below it.\n');
    assert.equal(criteria[0].tier, 'deterministic');
  });
});

describe('parseDod fails closed', () => {
  /** @type {[string, string, string][]} */
  const refusals = [
    ['', 'is empty', 'an empty file'],
    ['   \n\n', 'is empty', 'whitespace'],
    ['# Done bar\n\nNothing here yet.\n', 'declares no criteria', 'prose with no criteria'],
    ['**DOD-1** the bundle is small\n', 'looks like a criterion and does not parse', 'a criterion with no tier'],
    ['**DOD-1** (deterministic) — Observation: it exits 1.\n', 'states nothing before its observation', 'an empty statement'],
    [
      '**DOD-1** (deterministic) — A. Observation: x.\n**DOD-1** (deterministic) — B. Observation: y.\n',
      'appears more than once',
      'a duplicated id',
    ],
  ];
  for (const [input, message, label] of refusals) {
    it(`refuses ${label}`, () => {
      assert.throws(
        () => parseDod(input),
        (error) => error instanceof DodError && error.message.includes(message),
      );
    });
  }

  it('refuses a malformed criterion rather than skipping it', () => {
    // Skipping would silently drop part of the bar the operator believes they set, and the run
    // would report a done-bar it was never actually held to.
    assert.throws(
      () => parseDod(
        '**DOD-1** (deterministic) — A. Observation: x.\n**DOD-2** this one is broken\n',
      ),
      (error) => error instanceof DodError && error.message.includes('line 2'),
    );
  });
});
