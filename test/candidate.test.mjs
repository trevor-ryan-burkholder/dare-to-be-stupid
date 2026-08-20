/**
 * Where a run's gates execute inside its candidate (PLAN item 146).
 *
 * The candidate is a worktree of the **whole repository**. For a top-level run its root and the
 * project are the same directory, which is why this distinction went unnoticed: every test wrote
 * them as equal because for every tested run they were.
 *
 * `candidateProjectDir` is pure, so it belongs here rather than in the tier-2 candidate fixture —
 * the materialization needs real git, the arithmetic does not.
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';

import { candidateProjectDir } from '../scripts/candidate.mjs';

describe('the directory a candidate’s gates run in', () => {
  it('is the candidate root for a top-level run, where the prefix is empty', () => {
    // The neighbour. A correction that moved a top-level run's gates would be a regression wearing
    // the shape of a fix, and every run this repository has ever made is a top-level run.
    assert.equal(candidateProjectDir('/tmp/meeseeks-candidate-77', ''), '/tmp/meeseeks-candidate-77');
  });

  it('is the component’s own directory for a nested run', () => {
    // **The defect the first real boxed component run found.** Gates launched at the candidate root
    // ran against a tree with no `package.json` — `npm error path
    // /tmp/meeseeks-candidate-14477/package.json` — for build, lint, types, ci, docs, knip and
    // security-audit, every iteration, until the run stalled having never gated the code it wrote.
    assert.equal(
      candidateProjectDir('/tmp/meeseeks-candidate-77', 'packages/textstats/'),
      path.join('/tmp/meeseeks-candidate-77', 'packages/textstats'),
    );
  });

  it('does not leave the separator git puts on the end of a prefix', () => {
    // `git rev-parse --show-prefix` answers `packages/textstats/`. A joined path carrying a trailing
    // separator is the kind of difference that surfaces much later as a mismatched string compare.
    const joined = candidateProjectDir('/tmp/c', 'a/b/');
    assert.equal(joined.endsWith(path.sep), false, joined);
    assert.equal(joined, path.join('/tmp/c', 'a/b'));
  });

  it('keeps the candidate root out of a nested run’s reach by construction', () => {
    // The joined path is *inside* the candidate, never beside it. Stated as an assertion because a
    // prefix is data from git and a leading separator would otherwise escape the candidate.
    const joined = candidateProjectDir('/tmp/meeseeks-candidate-77', '/etc/');
    assert.equal(joined.startsWith('/tmp/meeseeks-candidate-77'), true, joined);
  });
});
