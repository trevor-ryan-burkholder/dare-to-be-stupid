/**
 * Tests for the ratchet (DESIGN.md §1.2).
 *
 * The invariant under test is monotonicity: a test ID that has ever passed may never be
 * allowed to fail again, and no path may drop an ID without a hard reset plus a
 * regression task. Most of what follows is an attempt to make the ratchet lose an ID.
 *
 * `hardReset` is exercised against a real git repository in a temp directory rather than
 * a stubbed command runner — the reset is the ratchet's one destructive act, and a mock
 * would prove only that we can call our own fake.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import {
  RatchetStateError,
  diffAgainstRatchet,
  emptyState,
  evaluateIteration,
  formatBlooperRecord,
  formatRegressionTask,
  hardReset,
  loadState,
  recordAdvance,
  restorePaths,
  saveState,
  scopedRestorePaths,
  sourceSiblings,
  testFilePath,
} from '../scripts/ratchet.mjs';

/** @type {string[]} */
const temporaryDirs = [];

/** @returns {string} */
function makeTempDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-ratchet-'));
  temporaryDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * @param {Partial<import('../scripts/ratchet.mjs').RatchetState>} [overrides]
 * @returns {import('../scripts/ratchet.mjs').RatchetState}
 */
function stateWith(overrides = {}) {
  return { ...emptyState(), ...overrides };
}

// ---------------------------------------------------------------------------
// Monotonicity — the invariant the whole design rests on
// ---------------------------------------------------------------------------

describe('recordAdvance is monotonic', () => {
  it('unions rather than replaces', () => {
    const before = stateWith({ iteration: 3, passing: ['a::1', 'b::2'] });
    const after = recordAdvance(before, { passing: ['b::2', 'c::3'] });
    assert.deepStrictEqual(after.passing, ['a::1', 'b::2', 'c::3']);
  });

  it('keeps every id even when handed a strictly smaller set', () => {
    const before = stateWith({ passing: ['a::1', 'b::2', 'c::3'] });
    const after = recordAdvance(before, { passing: ['a::1'] });
    assert.deepStrictEqual(after.passing, ['a::1', 'b::2', 'c::3']);
  });

  it('keeps every id when handed nothing at all', () => {
    const before = stateWith({ passing: ['a::1', 'b::2'] });
    const after = recordAdvance(before, { passing: [] });
    assert.deepStrictEqual(after.passing, ['a::1', 'b::2']);
  });

  it('never shrinks across a sequence of iterations', () => {
    const iterations = [['a::1'], ['b::2'], [], ['a::1', 'c::3'], ['b::2']];
    let state = emptyState();
    let previousSize = 0;
    for (const passing of iterations) {
      state = recordAdvance(state, { passing });
      assert.equal(state.passing.length >= previousSize, true, `shrank at ${JSON.stringify(passing)}`);
      previousSize = state.passing.length;
    }
    assert.deepStrictEqual(state.passing, ['a::1', 'b::2', 'c::3']);
    assert.equal(state.iteration, 5);
  });

  it('increments the iteration and sorts the passing set', () => {
    const after = recordAdvance(stateWith({ iteration: 7 }), { passing: ['z::1', 'a::1', 'm::1'] });
    assert.deepStrictEqual(after, {
      version: 1,
      iteration: 8,
      passing: ['a::1', 'm::1', 'z::1'],
      lastGoodCommit: null,
    });
  });

  it('records the commit it advanced to, and keeps the old one when none is given', () => {
    const first = recordAdvance(emptyState(), { passing: ['a::1'], commit: 'aaaaaaa' });
    assert.equal(first.lastGoodCommit, 'aaaaaaa');
    assert.equal(recordAdvance(first, { passing: ['b::2'] }).lastGoodCommit, 'aaaaaaa');
    assert.equal(recordAdvance(first, { passing: ['b::2'], commit: 'bbbbbbb' }).lastGoodCommit, 'bbbbbbb');
  });
});

// ---------------------------------------------------------------------------
// diffAgainstRatchet
// ---------------------------------------------------------------------------

describe('diffAgainstRatchet', () => {
  it('names what was lost and what was gained', () => {
    assert.deepStrictEqual(diffAgainstRatchet(['a::1', 'b::2'], ['b::2', 'c::3']), {
      regressions: ['a::1'],
      gained: ['c::3'],
    });
  });

  it('reports nothing when the sets match', () => {
    assert.deepStrictEqual(diffAgainstRatchet(['a::1'], ['a::1']), { regressions: [], gained: [] });
  });

  it('treats an empty current run as losing everything', () => {
    assert.deepStrictEqual(diffAgainstRatchet(['a::1', 'b::2'], []), {
      regressions: ['a::1', 'b::2'],
      gained: [],
    });
  });

  it('sorts both lists', () => {
    assert.deepStrictEqual(diffAgainstRatchet(['z::1', 'a::1'], ['q::1', 'b::1']), {
      regressions: ['a::1', 'z::1'],
      gained: ['b::1', 'q::1'],
    });
  });
});

// ---------------------------------------------------------------------------
// evaluateIteration
// ---------------------------------------------------------------------------

describe('evaluateIteration advances', () => {
  it('accepts a first iteration that passes something', () => {
    const decision = evaluateIteration(emptyState(), ['a::1', 'b::2'], { commit: 'aaaaaaa' });
    assert.deepStrictEqual(decision, {
      action: 'advance',
      gained: ['a::1', 'b::2'],
      state: { version: 1, iteration: 1, passing: ['a::1', 'b::2'], lastGoodCommit: 'aaaaaaa' },
    });
  });

  it('accepts an iteration that only holds the line', () => {
    const decision = evaluateIteration(stateWith({ passing: ['a::1'] }), ['a::1']);
    assert.equal(decision.action, 'advance');
    assert.deepStrictEqual(decision.action === 'advance' ? decision.gained : null, []);
  });

  it('reports exactly what was gained', () => {
    const decision = evaluateIteration(stateWith({ passing: ['a::1'] }), ['a::1', 'c::3', 'b::2']);
    assert.deepStrictEqual(decision.action === 'advance' ? decision.gained : null, ['b::2', 'c::3']);
  });
});

describe('evaluateIteration resets', () => {
  it('demands a reset when a passing test disappears', () => {
    const state = stateWith({ iteration: 4, passing: ['a::1', 'b::2'], lastGoodCommit: 'ccccccc' });
    const decision = evaluateIteration(state, ['b::2']);
    assert.equal(decision.action, 'reset');
    assert.deepStrictEqual(decision.action === 'reset' ? decision.regressions : null, ['a::1']);
    assert.equal(decision.action === 'reset' ? decision.target : null, 'ccccccc');
  });

  it('resets even when the iteration also gained new tests', () => {
    // DESIGN.md §8: regressions outrank everything.
    const state = stateWith({ passing: ['a::1', 'b::2'] });
    const decision = evaluateIteration(state, ['b::2', 'shiny::new', 'another::new']);
    assert.equal(decision.action, 'reset');
    assert.deepStrictEqual(decision.action === 'reset' ? decision.regressions : null, ['a::1']);
  });

  it('lists every lost id when the whole suite vanishes', () => {
    const decision = evaluateIteration(stateWith({ passing: ['b::2', 'a::1'] }), []);
    assert.deepStrictEqual(decision.action === 'reset' ? decision.regressions : null, ['a::1', 'b::2']);
  });

  it('leaves the ratchet state untouched, so no id is dropped by deciding', () => {
    const state = stateWith({ passing: ['a::1', 'b::2'] });
    const snapshot = { ...state, passing: [...state.passing] };
    evaluateIteration(state, ['b::2']);
    assert.deepStrictEqual(state, snapshot);
  });

  it('carries a regression task naming the tests to restore', () => {
    const decision = evaluateIteration(stateWith({ passing: ['a::1', 'b::2'] }), []);
    assert.equal(
      decision.action === 'reset' ? decision.task : '',
      [
        'Restore these tests. They passed on an earlier iteration and do not pass now.',
        'Change nothing else. Do not add features, do not refactor, do not adjust unrelated files.',
        '',
        '- a::1',
        '- b::2',
      ].join('\n'),
    );
  });

  it('says how many regressed, in the singular when there is one', () => {
    const one = evaluateIteration(stateWith({ passing: ['a::1'] }), []);
    assert.equal(one.action === 'reset' ? one.reason.startsWith('1 test that previously passed') : false, true);
    const two = evaluateIteration(stateWith({ passing: ['a::1', 'b::2'] }), []);
    assert.equal(two.action === 'reset' ? two.reason.startsWith('2 tests that previously passed') : false, true);
  });
});

describe('evaluateIteration rejects an empty result', () => {
  it('does not advance when nothing passed and nothing had passed before', () => {
    // "No tests ran" is not evidence that nothing regressed (DESIGN.md §11).
    const decision = evaluateIteration(emptyState(), []);
    assert.equal(decision.action, 'reject');
  });

  it('never returns advance for an empty run, whatever the state', () => {
    for (const state of [emptyState(), stateWith({ iteration: 9 })]) {
      assert.notEqual(evaluateIteration(state, []).action, 'advance');
    }
  });
});

describe('evaluateIteration tells a collection failure from a regression', () => {
  // Dogfood run 6 hard-reset a tree over all 75 of its protected ids. Not one test failed: the
  // builder moved its suite back to `node --test`, the vitest report came back structurally
  // empty ("No test suite found in file"), and every id was absent. Absent compared equal to
  // regressed, so the loop destroyed an iteration's work to punish a fault the code had not
  // committed - and, because the reset branch precedes gate reporting, told the operator
  // "regression" rather than "the runner collected nothing".

  it('rejects rather than resetting when the report contained no tests at all', () => {
    const state = stateWith({ passing: ['a::1', 'b::2'], lastGoodCommit: 'aaaaaaa' });
    const decision = evaluateIteration(state, [], { collected: 0 });
    assert.equal(decision.action, 'reject');
    assert.equal(decision.reason.includes('collection failure'), true, decision.reason);
  });

  it('still resets when tests really did run and the protected ones are gone', () => {
    // The neighbour, and the reason this is a distinction rather than a reordering: a builder
    // that genuinely breaks the whole suite must still be reset. §1.2's guarantee is kept.
    const state = stateWith({ passing: ['a::1', 'b::2'], lastGoodCommit: 'aaaaaaa' });
    const decision = evaluateIteration(state, [], { collected: 7 });
    assert.equal(decision.action, 'reset');
    assert.deepStrictEqual(decision.regressions, ['a::1', 'b::2']);
  });

  it('still resets when some tests collected and only the protected one vanished', () => {
    const state = stateWith({ passing: ['a::1'], lastGoodCommit: 'aaaaaaa' });
    const decision = evaluateIteration(state, ['c::3'], { collected: 1 });
    assert.equal(decision.action, 'reset');
    assert.deepStrictEqual(decision.regressions, ['a::1']);
  });

  it('keeps the old ordering when no count is supplied', () => {
    // The conservative default: a caller that forgets keeps monotonicity's promise rather than
    // quietly declining to reset. The driver is held to supplying it by a separate test.
    const state = stateWith({ passing: ['a::1'], lastGoodCommit: 'aaaaaaa' });
    assert.equal(evaluateIteration(state, []).action, 'reset');
  });
});

// ---------------------------------------------------------------------------
// State persistence — a corrupt ratchet must stop the run, not restart it empty
// ---------------------------------------------------------------------------

describe('loadState', () => {
  it('treats a missing file as a first run', () => {
    assert.deepStrictEqual(loadState(makeTempDir()), {
      version: 1,
      iteration: 0,
      passing: [],
      lastGoodCommit: null,
    });
  });

  it('round-trips a saved state exactly', () => {
    const dir = makeTempDir();
    saveState(dir, {
      version: /** @type {1} */ (1),
      iteration: 12,
      passing: ['b::2', 'a::1'],
      lastGoodCommit: 'abc1234',
    });
    assert.deepStrictEqual(loadState(dir), {
      version: 1,
      iteration: 12,
      passing: ['a::1', 'b::2'],
      lastGoodCommit: 'abc1234',
    });
  });

  const corrupt = [
    ['not json at all', 'text that is not JSON'],
    ['[]', 'an array'],
    ['"a string"', 'a bare string'],
    ['{"version":2,"iteration":0,"passing":[],"lastGoodCommit":null}', 'a version this build does not know'],
    ['{"iteration":0,"passing":[],"lastGoodCommit":null}', 'a missing version'],
    ['{"version":1,"iteration":-1,"passing":[],"lastGoodCommit":null}', 'a negative iteration'],
    ['{"version":1,"iteration":1.5,"passing":[],"lastGoodCommit":null}', 'a fractional iteration'],
    ['{"version":1,"iteration":0,"passing":"a::1","lastGoodCommit":null}', 'a passing set that is not an array'],
    ['{"version":1,"iteration":0,"passing":[1,2],"lastGoodCommit":null}', 'a passing set of non-strings'],
    ['{"version":1,"iteration":0,"passing":[],"lastGoodCommit":7}', 'a numeric lastGoodCommit'],
  ];
  for (const [contents, label] of corrupt) {
    it(`throws rather than starting empty on ${label}`, () => {
      const dir = makeTempDir();
      writeFileSync(path.join(dir, 'state.json'), contents, 'utf8');
      assert.throws(() => loadState(dir), RatchetStateError);
    });
  }

  it('does not silently return an empty ratchet for a corrupt file', () => {
    const dir = makeTempDir();
    writeFileSync(path.join(dir, 'state.json'), '{ broken', 'utf8');
    let result = 'no throw';
    try {
      loadState(dir);
    } catch (error) {
      result = /** @type {Error} */ (error).name;
    }
    assert.equal(result, 'RatchetStateError');
  });
});

describe('saveState', () => {
  it('creates the .meeseeks directory when it does not exist', () => {
    const dir = path.join(makeTempDir(), '.meeseeks');
    saveState(dir, stateWith({ passing: ['a::1'] }));
    assert.deepStrictEqual(loadState(dir).passing, ['a::1']);
  });

  it('leaves no temporary file behind', () => {
    const dir = makeTempDir();
    saveState(dir, stateWith({ passing: ['a::1'] }));
    assert.deepStrictEqual(readdirSync(dir), ['state.json']);
  });

  it('writes sorted, human-diffable json', () => {
    const dir = makeTempDir();
    saveState(dir, stateWith({ iteration: 2, passing: ['z::1', 'a::1'], lastGoodCommit: 'abc1234' }));
    assert.equal(
      readFileSync(path.join(dir, 'state.json'), 'utf8'),
      `${JSON.stringify({ version: 1, iteration: 2, passing: ['a::1', 'z::1'], lastGoodCommit: 'abc1234' }, null, 2)}\n`,
    );
  });

  it('survives being written twice over the same file', () => {
    const dir = makeTempDir();
    saveState(dir, stateWith({ passing: ['a::1'] }));
    saveState(dir, stateWith({ iteration: 1, passing: ['a::1', 'b::2'] }));
    assert.deepStrictEqual(loadState(dir), {
      version: 1,
      iteration: 1,
      passing: ['a::1', 'b::2'],
      lastGoodCommit: null,
    });
  });
});

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

describe('formatRegressionTask', () => {
  it('sorts the ids and tells the builder to change nothing else', () => {
    assert.equal(
      formatRegressionTask(['b::2', 'a::1']),
      [
        'Restore these tests. They passed on an earlier iteration and do not pass now.',
        'Change nothing else. Do not add features, do not refactor, do not adjust unrelated files.',
        '',
        '- a::1',
        '- b::2',
      ].join('\n'),
    );
  });
});

describe('formatBlooperRecord', () => {
  it('records the iteration, the regressed ids and the diff stat, with the given timestamp', () => {
    assert.deepStrictEqual(
      formatBlooperRecord({
        iteration: 7,
        regressions: ['b::2', 'a::1'],
        diffStat: ' 3 files changed, 41 insertions(+), 8 deletions(-)',
        at: '2026-08-10T01:49:52.963Z',
      }),
      {
        at: '2026-08-10T01:49:52.963Z',
        iteration: 7,
        regressions: ['a::1', 'b::2'],
        diffStat: ' 3 files changed, 41 insertions(+), 8 deletions(-)',
      },
    );
  });

  it('reads no clock of its own', () => {
    const once = formatBlooperRecord({ iteration: 1, regressions: [], diffStat: '', at: 'fixed' });
    const twice = formatBlooperRecord({ iteration: 1, regressions: [], diffStat: '', at: 'fixed' });
    assert.deepStrictEqual(once, twice);
  });
});

// ---------------------------------------------------------------------------
// hardReset, against a real repository
// ---------------------------------------------------------------------------

describe('hardReset', () => {
  /**
   * @param {string} cwd
   * @param {string[]} args
   * @returns {string}
   */
  function git(cwd, args) {
    return execFileSync('git', args, { cwd, stdio: 'pipe' }).toString().trim();
  }

  /** @returns {{ dir: string, first: string }} */
  function makeRepo() {
    const dir = makeTempDir();
    // No --initial-branch: it is newer than the oldest git this has to run against, and
    // the branch name is irrelevant to what a hard reset does.
    git(dir, ['init', '--quiet']);
    git(dir, ['config', 'user.email', 'ratchet@example.invalid']);
    git(dir, ['config', 'user.name', 'Ratchet Test']);
    writeFileSync(path.join(dir, 'app.txt'), 'good\n', 'utf8');
    git(dir, ['add', 'app.txt']);
    git(dir, ['commit', '--quiet', '-m', 'good state']);
    const first = git(dir, ['rev-parse', 'HEAD']);
    writeFileSync(path.join(dir, 'app.txt'), 'broken\n', 'utf8');
    git(dir, ['add', 'app.txt']);
    git(dir, ['commit', '--quiet', '-m', 'regression']);
    return { dir, first };
  }

  it('returns the working tree to the recorded good commit', () => {
    const { dir, first } = makeRepo();
    assert.equal(readFileSync(path.join(dir, 'app.txt'), 'utf8'), 'broken\n');
    hardReset({ cwd: dir, commit: first });
    assert.equal(readFileSync(path.join(dir, 'app.txt'), 'utf8'), 'good\n');
    assert.equal(git(dir, ['rev-parse', 'HEAD']), first);
  });

  it('discards uncommitted work in the tree, which is why preflight demands it be clean', () => {
    const { dir, first } = makeRepo();
    writeFileSync(path.join(dir, 'app.txt'), 'uncommitted edit\n', 'utf8');
    hardReset({ cwd: dir, commit: first });
    assert.equal(readFileSync(path.join(dir, 'app.txt'), 'utf8'), 'good\n');
  });

  it('refuses when the ratchet has no recorded good commit, without invoking git', () => {
    // Asserting the message, not just the type: a version that shelled out to
    // `git reset --hard ''` and let git object would also throw RatchetStateError, and
    // that is a different thing from declining to run the reset at all.
    const { dir } = makeRepo();
    for (const commit of [null, '']) {
      assert.throws(
        () => hardReset({ cwd: dir, commit }),
        (error) =>
          error instanceof RatchetStateError &&
          error.message ===
            'hardReset was asked to reset to no commit. The ratchet has no recorded good state to return to.',
      );
    }
  });

  it('throws when git refuses, rather than reporting a reset that did not happen', () => {
    const { dir } = makeRepo();
    assert.throws(() => hardReset({ cwd: dir, commit: 'notacommit' }), RatchetStateError);
  });
});

// ---------------------------------------------------------------------------
// The full loop, end to end over persisted state
// ---------------------------------------------------------------------------

describe('a run across several iterations', () => {
  it('accumulates, catches the regression, and never loses an id', () => {
    const dir = makeTempDir();

    let decision = evaluateIteration(loadState(dir), ['a::1', 'b::2'], { commit: 'commit1' });
    assert.equal(decision.action, 'advance');
    if (decision.action === 'advance') saveState(dir, decision.state);

    decision = evaluateIteration(loadState(dir), ['a::1', 'b::2', 'c::3'], { commit: 'commit2' });
    assert.equal(decision.action, 'advance');
    if (decision.action === 'advance') saveState(dir, decision.state);
    assert.deepStrictEqual(loadState(dir).passing, ['a::1', 'b::2', 'c::3']);

    // The builder breaks b::2 while adding d::4.
    const before = loadState(dir);
    decision = evaluateIteration(before, ['a::1', 'c::3', 'd::4'], { commit: 'commit3' });
    assert.equal(decision.action, 'reset');
    assert.deepStrictEqual(decision.action === 'reset' ? decision.regressions : null, ['b::2']);
    assert.equal(decision.action === 'reset' ? decision.target : null, 'commit2');

    // Nothing is written on a reset, so the passing set on disk is unchanged.
    assert.deepStrictEqual(loadState(dir), before);

    // The regression is fixed; d::4 was thrown away with the reset and is earned again.
    decision = evaluateIteration(loadState(dir), ['a::1', 'b::2', 'c::3', 'd::4'], { commit: 'commit4' });
    assert.equal(decision.action, 'advance');
    if (decision.action === 'advance') saveState(dir, decision.state);

    assert.deepStrictEqual(loadState(dir), {
      version: 1,
      iteration: 3,
      passing: ['a::1', 'b::2', 'c::3', 'd::4'],
      lastGoodCommit: 'commit4',
    });
  });
});

describe('scoping a restore to what a regression implicates', () => {
  it('recovers the file from an id', () => {
    assert.equal(testFilePath('src/csv.test.ts::parseCsv > an unterminated quote'), 'src/csv.test.ts');
  });

  it('returns empty for an id carrying no path, rather than guessing one', () => {
    // Nothing here defaults to pass, and a bare suite name names no file. An empty string is
    // read by `scopedRestorePaths` as "no scoped restore available", never as "nothing to do".
    assert.equal(testFilePath('adds two numbers'), '');
    assert.equal(testFilePath('::orphan > case'), '');
  });

  /** @type {[string, string[]][]} */
  const conventions = [
    ['src/csv.test.ts', ['src/csv.ts']],
    ['src/app.spec.tsx', ['src/app.tsx']],
    ['pkg/util.test.mjs', ['pkg/util.mjs']],
    ['tests/test_parser.py', ['tests/parser.py', 'src/parser.py']],
    ['tests/parser_test.py', ['tests/parser.py', 'src/parser.py']],
    ['internal/csv_test.go', ['internal/csv.go']],
    ['src/PathsTests.cs', ['src/Paths.cs']],
    ['src/PathsTest.cs', ['src/Paths.cs']],
  ];
  for (const [testPath, expected] of conventions) {
    it(`maps ${testPath} to its source sibling`, () => {
      assert.deepEqual(sourceSiblings(testPath), expected);
    });
  }

  it('maps a test in a parallel test tree to its src counterpart', () => {
    // Measured by the first live scoped restore: test/parse.test.ts regressed, its colocated
    // sibling test/parse.ts does not exist, and the source lives at src/parse.ts. The guess
    // restored only the test, verification said the ids did not come back, and the full reset
    // ran. Cross-tree is the convention most repositories actually use.
    assert.deepEqual(sourceSiblings('test/parse.test.ts'), ['test/parse.ts', 'src/parse.ts']);
    assert.deepEqual(sourceSiblings('tests/summarise.test.ts'), ['tests/summarise.ts', 'src/summarise.ts']);
  });

  it('does not cross trees for an already-colocated test', () => {
    assert.deepEqual(sourceSiblings('src/csv.test.ts'), ['src/csv.ts']);
  });

  it('claims nothing for a file that matches no convention', () => {
    // The deny path. A guess with no convention behind it is the shape that would restore an
    // unrelated file, and the verification step would then blame the wrong change.
    assert.deepEqual(sourceSiblings('src/csv.ts'), []);
    assert.deepEqual(sourceSiblings('docs/attest.cs'), []);
  });

  it('intersects with what the iteration actually changed', () => {
    // The intersection is what makes a scoped restore safe to attempt: a file this iteration
    // never touched cannot be the cause, and restoring it would revert unrelated work.
    const paths = scopedRestorePaths(
      ['src/csv.test.ts::parseCsv > quote at EOF'],
      ['src/csv.ts', 'src/csv.test.ts', 'src/summarize.ts', 'README.md'],
    );
    assert.deepEqual(paths, ['src/csv.test.ts', 'src/csv.ts']);
  });

  it('leaves out an implicated file the iteration never touched', () => {
    const paths = scopedRestorePaths(['src/csv.test.ts::parseCsv > x'], ['src/summarize.ts']);
    assert.deepEqual(paths, []);
  });

  it('is empty when nothing is implicated, which is not the same as nothing to restore', () => {
    assert.deepEqual(scopedRestorePaths([], ['src/csv.ts']), []);
    assert.deepEqual(scopedRestorePaths(['no-path-id'], ['src/csv.ts']), []);
  });

  it('deduplicates and sorts across several regressions in one file', () => {
    const paths = scopedRestorePaths(
      ['src/csv.test.ts::a > one', 'src/csv.test.ts::b > two', 'src/cli.test.ts::main > three'],
      ['src/csv.ts', 'src/csv.test.ts', 'src/cli.ts', 'src/cli.test.ts'],
    );
    assert.deepEqual(paths, ['src/cli.test.ts', 'src/cli.ts', 'src/csv.test.ts', 'src/csv.ts']);
  });
});

describe('restorePaths refuses the shapes that are not smaller restores', () => {
  it('refuses no commit', () => {
    assert.throws(() => restorePaths({ cwd: '/repo', commit: null, paths: ['src/csv.ts'] }), RatchetStateError);
  });

  it('refuses an empty path list rather than restoring everything', () => {
    // `git checkout <commit> --` with no paths is not an error to git and not a small restore.
    assert.throws(() => restorePaths({ cwd: '/repo', commit: 'abc123', paths: [] }), RatchetStateError);
  });
});
