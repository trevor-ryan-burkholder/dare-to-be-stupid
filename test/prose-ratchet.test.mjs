/**
 * An artifact's checks reaching the ratchet (`PLAN.md` item 49, `DESIGN.md` §3.8.3).
 *
 * Item 49 makes one claim that decides whether the whole prose job type is real: **an artifact
 * whose deterministic checks emit reporter JSON drives the existing machine unchanged** — same
 * extraction, same ratchet, same monotonicity, no parser change. This file is that claim, checked
 * against real vitest output from real checks run over a real two-chapter manuscript rather than
 * against an approximation of what such output would look like.
 *
 * The pair of fixtures is the argument. The green run is a finished artifact; the regressed run is
 * the **same suite** after chapter 2 was replaced with a TODO stub. If the second one does not
 * cost the ratchet exactly the ids whose checks broke, then a chapter can silently rot while the
 * loop reports progress — which is the failure mode the ratchet exists for, arriving through a
 * door nobody had checked.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { diffAgainstRatchet, extractTestIds, recordAdvance } from '../scripts/ratchet.mjs';

/** @param {string} name */
const fixture = (name) => readFileSync(new URL(`./fixtures/prose/${name}`, import.meta.url), 'utf8');

/** The root the fixtures were produced under; vitest emits absolute paths. */
const ROOT_DIR = JSON.parse(fixture('provenance.json'))['vitest-4.1.11-artifact'].rootDir;

const GREEN = fixture('vitest-4.1.11-artifact-green.json');
const REGRESSED = fixture('vitest-4.1.11-artifact-regressed.json');

describe('an artifact suite through the existing reporter path', () => {
  it('extracts every check as an id, with no parser change and no prose-specific branch', () => {
    // The ids are ordinary vitest ids — a repo-relative file path and the full test name. Nothing
    // in `extractTestIds` knows this suite is about a manuscript, which is item 49's whole point.
    assert.deepEqual(
      [...extractTestIds(GREEN, { rootDir: ROOT_DIR })].sort(),
      [
        'checks/structure.check.js::manuscript structure > chapter 1 exists and clears its word floor',
        'checks/structure.check.js::manuscript structure > chapter 2 exists and clears its word floor',
        'checks/structure.check.js::manuscript structure > every chapter opens with a level-one heading',
        'checks/structure.check.js::manuscript structure > no chapter still carries a placeholder',
      ],
    );
  });

  it('loses exactly the two ids whose checks the regressed chapter broke', () => {
    const green = extractTestIds(GREEN, { rootDir: ROOT_DIR });
    const after = extractTestIds(REGRESSED, { rootDir: ROOT_DIR });
    assert.equal(green.size, 4);
    assert.deepEqual(
      [...green].filter((id) => !after.has(id)).sort(),
      [
        'checks/structure.check.js::manuscript structure > chapter 2 exists and clears its word floor',
        'checks/structure.check.js::manuscript structure > no chapter still carries a placeholder',
      ],
    );
    // And the two that had nothing to do with chapter 2 are untouched, so the loss is attributable
    // rather than a suite-wide collapse that would say nothing about which chapter rotted.
    assert.equal(after.has('checks/structure.check.js::manuscript structure > chapter 1 exists and clears its word floor'), true);
    assert.equal(
      after.has('checks/structure.check.js::manuscript structure > every chapter opens with a level-one heading'),
      true,
    );
  });

  it('reports the regressed chapter to the ratchet as a regression, which is the whole guarantee', () => {
    // A chapter that once passed may never be allowed to silently fail again. This is that
    // sentence, executed against a real manuscript rather than asserted about one.
    const green = extractTestIds(GREEN, { rootDir: ROOT_DIR });
    const banked = recordAdvance(
      { version: 1, iteration: 1, passing: [], lastGoodCommit: null },
      { passing: green, credited: green },
    );
    const { regressions } = diffAgainstRatchet(banked.passing, extractTestIds(REGRESSED, { rootDir: ROOT_DIR }));
    assert.deepEqual(
      regressions,
      [
        'checks/structure.check.js::manuscript structure > chapter 2 exists and clears its word floor',
        'checks/structure.check.js::manuscript structure > no chapter still carries a placeholder',
      ],
    );
  });

  it('reports no regression when the artifact is unchanged, so the guarantee is not vacuous', () => {
    // The benign neighbour. A ratchet that reported a regression on every iteration would pass the
    // case above while being useless, and it would hard-reset a healthy run forever.
    const green = extractTestIds(GREEN, { rootDir: ROOT_DIR });
    const banked = recordAdvance(
      { version: 1, iteration: 1, passing: [], lastGoodCommit: null },
      { passing: green, credited: green },
    );
    assert.deepEqual(diffAgainstRatchet(banked.passing, green).regressions, []);
  });
});
