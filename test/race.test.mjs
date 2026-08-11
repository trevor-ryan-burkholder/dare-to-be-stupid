/**
 * Tests for worktree racing (DESIGN.md §13.6).
 *
 * Racing is the one feature here that can multiply a run's bill, so the tests that matter
 * most are the ones proving it stays *off*: disabled by default, armed only by a stall,
 * refused when the budget cannot carry it, and never leaving behind the worktrees it made.
 *
 * The selection tests defend the other half. A winner chosen by anything other than gate
 * results would put judgement back in the one place this design keeps it out of.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { defaultConfig } from '../scripts/config.mjs';
import {
  applyWinner,
  createWorktrees,
  parseNumstat,
  removeWorktrees,
  selectWinner,
  shouldRace,
  worktreeName,
} from '../scripts/race.mjs';

/** @type {string[]} */
const temporaryDirs = [];

/** @returns {string} */
function makeTempDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dare-race-'));
  temporaryDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * A runner that really shells out, for the tests that use a real repository.
 * @type {import('../scripts/plugins.mjs').Runner}
 */
const realRunner = (command, args, options) => {
  try {
    const stdout = execFileSync(command, args, { cwd: options.cwd, stdio: 'pipe', encoding: 'utf8' });
    return { ok: true, status: 0, stdout, stderr: '' };
  } catch (error) {
    const failure = /** @type {{ status?: number, stdout?: string, stderr?: string, message: string }} */ (error);
    return {
      ok: false,
      status: failure.status ?? 1,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? failure.message,
    };
  }
};

/** @returns {{ root: string, head: string }} a real repository with one commit */
function makeRepo() {
  const root = makeTempDir();
  const git = (/** @type {string[]} */ args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' }).toString().trim();
  git(['init', '--quiet']);
  git(['config', 'user.email', 'race@example.invalid']);
  git(['config', 'user.name', 'Race Test']);
  writeFileSync(path.join(root, 'app.txt'), 'first\n', 'utf8');
  git(['add', 'app.txt']);
  git(['commit', '--quiet', '-m', 'first']);
  return { root, head: git(['rev-parse', 'HEAD']) };
}

/**
 * @param {Partial<{ enabled: boolean, n: number, after: number }>} race
 * @param {Partial<{ stalledIterations: number, spentTokens: number, iteration: number }>} progress
 * @param {number} [averageBuilderTokens]
 */
function decide(race, progress, averageBuilderTokens) {
  const config = defaultConfig();
  return shouldRace({
    config: { ...config, race: { ...config.race, ...race } },
    progress: { stalledIterations: 0, spentTokens: 0, iteration: 0, ...progress },
    averageBuilderTokens,
  });
}

describe('shouldRace', () => {
  it('refuses when racing is disabled, which is the default', () => {
    assert.equal(defaultConfig().race.enabled, false);
    assert.deepStrictEqual(decide({}, { stalledIterations: 9 }), { race: false, reason: 'racing is disabled' });
  });

  it('refuses while the loop is still making progress', () => {
    // The whole argument for racing is escaping a stall. A converging loop that races is
    // paying n times over for something it was going to get anyway.
    const decision = decide({ enabled: true, after: 2 }, { stalledIterations: 1 });
    assert.equal(decision.race, false);
    assert.equal(decision.reason.includes('arms at 2'), true);
  });

  it('arms once the stall reaches the configured threshold', () => {
    assert.equal(decide({ enabled: true, after: 2 }, { stalledIterations: 2 }, 1000).race, true);
  });

  it('refuses when the token budget cannot carry the candidates', () => {
    const config = defaultConfig();
    const decision = shouldRace({
      config: { ...config, tokenCeiling: 100_000, race: { enabled: true, n: 3, after: 1 } },
      progress: { stalledIterations: 3, spentTokens: 90_000, iteration: 1 },
      averageBuilderTokens: 50_000,
    });
    assert.equal(decision.race, false);
    assert.equal(decision.reason.includes('10000 remain'), true);
  });

  it('demands headroom beyond the bare cost, not merely enough to start', () => {
    // A race that exhausts the ceiling on its last candidate has bought nothing: the
    // winner still needs an iteration to merge, gate and review.
    const config = defaultConfig();
    const bare = shouldRace({
      config: { ...config, tokenCeiling: 300_000, race: { enabled: true, n: 3, after: 1 } },
      progress: { stalledIterations: 3, spentTokens: 0, iteration: 1 },
      averageBuilderTokens: 100_000,
    });
    assert.equal(bare.race, false, 'raced with exactly the bare cost and no headroom');
  });

  it('refuses when there is no iteration left to land the winner in', () => {
    const config = defaultConfig();
    const decision = shouldRace({
      config: { ...config, maxIterations: 10, race: { enabled: true, n: 2, after: 1 } },
      progress: { stalledIterations: 5, spentTokens: 0, iteration: 9 },
      averageBuilderTokens: 1000,
    });
    assert.equal(decision.race, false);
    assert.equal(decision.reason.includes('land the winner'), true);
  });

  it('assumes a builder is expensive before one has been observed', () => {
    // Erring cheap here would race on an allowance that turns out to be too thin.
    const config = defaultConfig();
    const decision = shouldRace({
      config: { ...config, tokenCeiling: 400_000, race: { enabled: true, n: 3, after: 1 } },
      progress: { stalledIterations: 3, spentTokens: 0, iteration: 1 },
    });
    assert.equal(decision.race, false);
  });
});

describe('selectWinner', () => {
  /**
   * @param {number} index
   * @param {Partial<import('../scripts/race.mjs').Candidate>} [overrides]
   * @returns {import('../scripts/race.mjs').Candidate}
   */
  const candidate = (index, overrides = {}) => ({
    index,
    dir: `/tmp/c${index}`,
    commit: `commit${index}`,
    gates: [{ name: 'lint', ok: true, status: 0, detail: 'passed' }],
    regressions: [],
    filesChanged: 3,
    linesChanged: 30,
    ...overrides,
  });

  it('returns nothing when no candidate passed every gate', () => {
    const outcome = selectWinner([
      candidate(1, { gates: [{ name: 'lint', ok: false, status: 1, detail: 'no' }] }),
      candidate(2, { commit: null }),
    ]);
    assert.equal(outcome.winner, null);
    assert.equal(outcome.viable, 0);
    assert.equal(outcome.reason.includes('all were discarded'), true);
  });

  it('disqualifies a candidate that regressed a protected test, however green its gates', () => {
    // Merging it would hand the main tree a regression the ratchet then has to reset back
    // out of, which is a worse position than never having raced.
    const outcome = selectWinner([candidate(1, { regressions: ['test/a.test.js::works'] })]);
    assert.equal(outcome.winner, null);
  });

  it('takes the only viable candidate', () => {
    const outcome = selectWinner([
      candidate(1, { gates: [{ name: 'lint', ok: false, status: 1, detail: 'no' }] }),
      candidate(2),
    ]);
    assert.equal(outcome.winner?.index, 2);
    assert.equal(outcome.viable, 1);
  });

  it('breaks a tie on the smallest diff, with no model involved', () => {
    const outcome = selectWinner([candidate(1, { linesChanged: 900 }), candidate(2, { linesChanged: 20 })]);
    assert.equal(outcome.winner?.index, 2);
    assert.equal(outcome.reason.includes('smallest diff'), true);
    assert.equal(outcome.reason.includes('20 line(s)'), true);
  });

  it('prefers a small change spread over several files to a rewrite of one', () => {
    // The bug this replaces: the sort key was file count while the documentation said diff
    // size, so a one-file 1500-line rewrite beat a three-file 15-line surgical fix — the
    // opposite of what the tie-break exists to prefer.
    const rewrite = candidate(1, { filesChanged: 1, linesChanged: 1500 });
    const surgical = candidate(2, { filesChanged: 3, linesChanged: 15 });
    assert.equal(selectWinner([rewrite, surgical]).winner?.index, 2);
    // Order of arrival must not decide it either.
    assert.equal(selectWinner([surgical, rewrite]).winner?.index, 2);
  });

  it('falls back to file count when the churn is identical', () => {
    // Equal lines, so the more contained change wins: fewer places touched to achieve the
    // same result is the only remaining evidence of restraint.
    const outcome = selectWinner([
      candidate(1, { filesChanged: 9, linesChanged: 40 }),
      candidate(2, { filesChanged: 2, linesChanged: 40 }),
    ]);
    assert.equal(outcome.winner?.index, 2);
  });

  it('breaks a remaining tie on candidate order, so the result is reproducible', () => {
    const outcome = selectWinner([
      candidate(3, { filesChanged: 2, linesChanged: 40 }),
      candidate(1, { filesChanged: 2, linesChanged: 40 }),
    ]);
    assert.equal(outcome.winner?.index, 1);
  });

  it('returns nothing for an empty field', () => {
    assert.equal(selectWinner([]).winner, null);
  });
});

describe('parseNumstat', () => {
  it('sums additions and deletions across files', () => {
    const stdout = ['12\t3\tsrc/a.ts', '0\t40\tsrc/b.ts', '5\t5\ttest/a.test.ts'].join('\n');
    assert.deepEqual(parseNumstat(stdout), { filesChanged: 3, linesChanged: 65 });
  });

  it('reads an empty diff as no change at all', () => {
    assert.deepEqual(parseNumstat(''), { filesChanged: 0, linesChanged: 0 });
    assert.deepEqual(parseNumstat('\n\n'), { filesChanged: 0, linesChanged: 0 });
  });

  it('ignores the trailing newline git always emits', () => {
    assert.deepEqual(parseNumstat('1\t1\tsrc/a.ts\n'), { filesChanged: 1, linesChanged: 2 });
  });

  it('counts a binary file as a changed file with no measurable lines', () => {
    // The one place this measure understates, and it is recorded rather than hidden: a
    // candidate that swapped a large asset reads as cheaper than one that edited ten lines.
    assert.deepEqual(parseNumstat('-\t-\tassets/logo.png'), { filesChanged: 1, linesChanged: 0 });
  });

  it('still counts a file whose counts it cannot read', () => {
    // Dropping the line entirely would make the candidate look smaller than it is, which is
    // the exact failure mode the lines-first tie-break was introduced to fix.
    assert.deepEqual(parseNumstat('garbage without tabs'), { filesChanged: 1, linesChanged: 0 });
  });

  it('handles a rename, whose path contains an arrow', () => {
    assert.deepEqual(parseNumstat('3\t1\tsrc/{old.ts => new.ts}'), { filesChanged: 1, linesChanged: 4 });
  });

  it('tolerates carriage returns, because contributors are on Windows', () => {
    assert.deepEqual(parseNumstat('12\t3\tsrc/a.ts\r\n0\t2\tsrc/b.ts\r\n'), { filesChanged: 2, linesChanged: 17 });
  });
});

describe('worktree lifecycle', () => {
  it('creates the requested number of worktrees at the base commit', () => {
    const { root, head } = makeRepo();
    const parentDir = makeTempDir();
    const created = createWorktrees({ cwd: root, run: realRunner, n: 2, base: head, parentDir });
    assert.deepStrictEqual(created.problems, []);
    assert.equal(created.worktrees.length, 2);
    for (const worktree of created.worktrees) {
      assert.equal(existsSync(path.join(worktree.dir, 'app.txt')), true, `${worktree.dir} is not a checkout`);
    }
    removeWorktrees({ cwd: root, run: realRunner, worktrees: created.worktrees });
  });

  it('removes every worktree it created', () => {
    const { root, head } = makeRepo();
    const parentDir = makeTempDir();
    const created = createWorktrees({ cwd: root, run: realRunner, n: 2, base: head, parentDir });
    const cleaned = removeWorktrees({ cwd: root, run: realRunner, worktrees: created.worktrees });
    assert.deepStrictEqual(cleaned.problems, []);
    assert.equal(cleaned.removed.length, 2);
    for (const worktree of created.worktrees) assert.equal(existsSync(worktree.dir), false);
    assert.equal(realRunner('git', ['worktree', 'list'], { cwd: root }).stdout.trim().split('\n').length, 1);
  });

  it('leaves a repository that can race again', () => {
    // A leaked worktree is not cosmetic: `git worktree add` refuses a directory it already
    // knows about, so one abandoned race breaks every later one.
    const { root, head } = makeRepo();
    const parentDir = makeTempDir();
    const first = createWorktrees({ cwd: root, run: realRunner, n: 1, base: head, parentDir });
    removeWorktrees({ cwd: root, run: realRunner, worktrees: first.worktrees });
    const second = createWorktrees({ cwd: root, run: realRunner, n: 1, base: head, parentDir });
    assert.deepStrictEqual(second.problems, []);
    assert.equal(second.worktrees.length, 1);
    removeWorktrees({ cwd: root, run: realRunner, worktrees: second.worktrees });
  });

  it('reports a worktree it could not create rather than pretending it exists', () => {
    const { root } = makeRepo();
    const created = createWorktrees({
      cwd: root,
      run: realRunner,
      n: 1,
      base: 'not-a-commit',
      parentDir: makeTempDir(),
    });
    assert.deepStrictEqual(created.worktrees, []);
    assert.equal(created.problems.length, 1);
  });

  it('names worktrees predictably', () => {
    assert.equal(worktreeName(1), 'dare-race-01');
    assert.equal(worktreeName(12), 'dare-race-12');
  });
});

describe('applyWinner', () => {
  it('fast-forwards the main tree onto the winner', () => {
    const { root, head } = makeRepo();
    const parentDir = makeTempDir();
    const created = createWorktrees({ cwd: root, run: realRunner, n: 1, base: head, parentDir });
    const worktree = created.worktrees[0];

    writeFileSync(path.join(worktree.dir, 'app.txt'), 'candidate work\n', 'utf8');
    realRunner('git', ['add', '-A'], { cwd: worktree.dir });
    realRunner('git', ['commit', '--no-verify', '-m', 'candidate 1'], { cwd: worktree.dir });
    const commit = realRunner('git', ['rev-parse', 'HEAD'], { cwd: worktree.dir }).stdout.trim();

    const applied = applyWinner({ cwd: root, run: realRunner, commit });
    assert.equal(applied.ok, true, applied.detail);
    assert.equal(realRunner('git', ['rev-parse', 'HEAD'], { cwd: root }).stdout.trim(), commit);
    removeWorktrees({ cwd: root, run: realRunner, worktrees: created.worktrees });
  });

  it('refuses rather than inventing a merge commit nobody reviewed', () => {
    const { root } = makeRepo();
    const applied = applyWinner({ cwd: root, run: realRunner, commit: 'not-a-commit' });
    assert.equal(applied.ok, false);
  });
});
