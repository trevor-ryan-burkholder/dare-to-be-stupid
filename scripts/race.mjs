/**
 * Worktree racing — the escape maneuver (DESIGN.md §13.6).
 *
 * When a loop stalls it is usually not because the builder is slow. It is because one
 * approach is wrong and every iteration is a variation on it. Racing spends tokens to buy
 * *divergence*: several builders attempt the same objective in isolated worktrees, the
 * gates judge them, and the winner is merged.
 *
 * The shape of this matters more than the mechanism, so it is stated plainly:
 *
 *   - **Off by default, and stalled-only when on.** Racing every iteration multiplies the
 *     bill by `n` for a loop that is already converging. It arms after `race.after`
 *     consecutive stalled iterations and disarms the moment something improves.
 *   - **The budget wins.** If the remaining allowance will not cover `n` builders with room
 *     to spare, the race is refused and the ordinary path continues. A run that dies
 *     mid-race has spent `n` times as much to reach the same place.
 *   - **No vote.** The winner is chosen by gate results; ties break on lines changed, then
 *     files changed, then candidate order. There is nothing here for a model to adjudicate,
 *     and asking one to choose between candidates the gates could not separate would be
 *     adding judgement exactly where determinism was available.
 *   - **The driver keeps the ratchet.** Candidates work in their own worktrees, where
 *     `.dare/` is untracked and therefore absent. No candidate can read or advance the
 *     ratchet; only the main driver does, and only once a winner has been merged.
 *
 * Everything that touches git is injected, so the decisions above are tested without a
 * worktree in sight.
 */

import path from 'node:path';

/** @typedef {import('./plugins.mjs').Runner} Runner */
/** @typedef {import('./driver.mjs').GateResult} GateResult */

/**
 * @typedef {{
 *   index: number, dir: string, commit: string | null,
 *   gates: GateResult[], regressions: string[], filesChanged: number, linesChanged: number
 * }} Candidate
 */

/**
 * How much headroom to demand beyond the estimated cost. A race that exhausts the ceiling
 * on its final candidate has bought nothing: the winner still needs an iteration to merge,
 * gate and review.
 */
const BUDGET_HEADROOM = 1.5;

/**
 * What to assume a builder costs before one has been observed. Deliberately not small — the
 * failure to avoid is racing on an allowance that turns out to be too thin.
 */
const ASSUMED_BUILDER_TOKENS = 200_000;

/**
 * Should this iteration be raced?
 *
 * @param {{
 *   config: { race: { enabled: boolean, n: number, after: number }, tokenCeiling: number, maxIterations: number },
 *   progress: { stalledIterations: number, spentTokens: number, iteration: number },
 *   averageBuilderTokens?: number
 * }} options
 * @returns {{ race: boolean, reason: string }}
 */
export function shouldRace(options) {
  const { config, progress } = options;
  if (!config.race.enabled) return { race: false, reason: 'racing is disabled' };
  if (progress.stalledIterations < config.race.after) {
    return {
      race: false,
      reason: `${progress.stalledIterations} stalled iteration(s); racing arms at ${config.race.after}`,
    };
  }

  const iterationsLeft = config.maxIterations - progress.iteration;
  if (iterationsLeft < 2) {
    return {
      race: false,
      reason: `${iterationsLeft} iteration(s) left; a race needs one to run and one to land the winner`,
    };
  }

  const estimate = options.averageBuilderTokens ?? ASSUMED_BUILDER_TOKENS;
  const needed = Math.ceil(config.race.n * estimate * BUDGET_HEADROOM);
  const tokensLeft = config.tokenCeiling - progress.spentTokens;
  if (tokensLeft < needed) {
    return {
      race: false,
      reason:
        `racing ${config.race.n} builders needs about ${needed} tokens including headroom and ${tokensLeft} remain; ` +
        'the ordinary path continues',
    };
  }

  return { race: true, reason: `${progress.stalledIterations} stalled iteration(s) and budget for ${config.race.n}` };
}

/**
 * Pick the winner from raced candidates.
 *
 * Viability is absolute: every gate passing and nothing regressed. A candidate that
 * regressed a protected test is not a near miss to be ranked below the others, it is
 * disqualified — merging it would hand the main tree a regression the ratchet then has to
 * reset back out of, which is a worse position than never having raced.
 *
 * @param {Candidate[]} candidates
 * @returns {{ winner: Candidate | null, reason: string, viable: number }}
 */
export function selectWinner(candidates) {
  const viable = candidates.filter(
    (candidate) =>
      candidate.commit !== null && candidate.regressions.length === 0 && candidate.gates.every((gate) => gate.ok),
  );

  if (viable.length === 0) {
    return {
      winner: null,
      reason: 'no candidate passed every gate without a regression; all were discarded',
      viable: 0,
    };
  }
  if (viable.length === 1) {
    return { winner: viable[0], reason: `candidate ${viable[0].index} was the only viable one`, viable: 1 };
  }

  // The gates could not separate them, so the tie-break is the smallest change that achieved
  // it, then candidate order. Every key is a property of the work rather than an opinion
  // about it, which is what keeps a model out of this decision.
  //
  // Lines first, files second. This used to be files only, while the documentation above
  // claimed "diff size" — so a one-file 1500-line rewrite beat a three-file 15-line surgical
  // fix, which is the opposite of what the tie-break exists to prefer. File count survives as
  // the second key because it still says something: given equal churn, the change that
  // touched fewer places is the more contained one.
  const sorted = [...viable].sort(
    (a, b) => a.linesChanged - b.linesChanged || a.filesChanged - b.filesChanged || a.index - b.index,
  );
  return {
    winner: sorted[0],
    reason:
      `${viable.length} candidates passed every gate; candidate ${sorted[0].index} won on the smallest diff ` +
      `(${sorted[0].linesChanged} line(s) across ${sorted[0].filesChanged} file(s))`,
    viable: viable.length,
  };
}

/**
 * Measure a candidate's diff from `git diff --numstat`.
 *
 * Numstat rather than `--shortstat` because it is one record per file in a fixed
 * tab-separated shape, so both keys come from one call and neither is a regex over prose.
 *
 * Binary files report `-` for both counts. They are counted as a changed *file* with zero
 * changed *lines*, which is the one place this measure understates: a candidate that swapped a
 * large binary asset reads as cheaper than one that edited ten lines. That is accepted rather
 * than papered over — these are builds of source, the case is rare, and inventing a line count
 * for a blob would be worse than recording that there is not one.
 *
 * @param {string} stdout
 * @returns {{ filesChanged: number, linesChanged: number }}
 */
export function parseNumstat(stdout) {
  let filesChanged = 0;
  let linesChanged = 0;
  for (const raw of stdout.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.trim() === '') continue;
    filesChanged += 1;
    const match = line.match(/^(\d+|-)\t(\d+|-)\t/);
    // A line that does not match contributes its file and no lines. It cannot be dropped
    // entirely: an unmeasured file that vanishes from the count makes a candidate look smaller
    // than it is, which is exactly the bug this function was written to fix.
    if (match === null) continue;
    if (match[1] !== '-') linesChanged += Number(match[1]);
    if (match[2] !== '-') linesChanged += Number(match[2]);
  }
  return { filesChanged, linesChanged };
}

/**
 * @param {number} index
 * @returns {string} the directory name for a candidate's worktree
 */
export function worktreeName(index) {
  return `dare-race-${String(index).padStart(2, '0')}`;
}

/**
 * Create `n` detached worktrees at the current commit.
 *
 * Detached on purpose: a candidate that is not on a branch cannot move one, so an
 * interrupted race cannot leave the repository pointing somewhere unexpected.
 *
 * @param {{ cwd: string, run: Runner, n: number, base: string, parentDir: string }} options
 * @returns {{ worktrees: { index: number, dir: string }[], problems: string[] }}
 */
export function createWorktrees(options) {
  /** @type {{ index: number, dir: string }[]} */
  const worktrees = [];
  /** @type {string[]} */
  const problems = [];

  for (let index = 1; index <= options.n; index += 1) {
    const dir = path.join(options.parentDir, worktreeName(index));
    const result = options.run('git', ['worktree', 'add', '--detach', dir, options.base], { cwd: options.cwd });
    if (!result.ok) {
      problems.push(`worktree ${index} could not be created: ${(result.stderr || result.stdout).trim()}`);
      continue;
    }
    worktrees.push({ index, dir });
  }
  return { worktrees, problems };
}

/**
 * Remove every worktree a race created.
 *
 * Called on every path out of a race, including the failing ones. A leaked worktree is not
 * cosmetic: `git worktree add` refuses a directory it already knows about, so one abandoned
 * race makes every later race fail to start, and the failure names a directory rather than
 * the race that left it behind.
 *
 * @param {{ cwd: string, run: Runner, worktrees: { index: number, dir: string }[] }} options
 * @returns {{ removed: string[], problems: string[] }}
 */
export function removeWorktrees(options) {
  /** @type {string[]} */
  const removed = [];
  /** @type {string[]} */
  const problems = [];

  for (const worktree of options.worktrees) {
    const result = options.run('git', ['worktree', 'remove', '--force', worktree.dir], { cwd: options.cwd });
    if (result.ok) {
      removed.push(worktree.dir);
      continue;
    }
    problems.push(`worktree ${worktree.dir} could not be removed: ${(result.stderr || result.stdout).trim()}`);
  }
  // Prune whatever the removals could not, so a stale administrative entry does not block
  // the next race even when a directory survived.
  options.run('git', ['worktree', 'prune'], { cwd: options.cwd });
  return { removed, problems };
}

/**
 * Fast-forward the main tree onto the winning candidate's commit.
 *
 * `--ff-only` is the whole safety argument. The main tree has not moved while the race ran,
 * so the winner's commit descends from it and the merge is a pointer move. If that is ever
 * untrue the merge fails loudly instead of inventing a merge commit nobody reviewed.
 *
 * @param {{ cwd: string, run: Runner, commit: string }} options
 * @returns {{ ok: boolean, detail: string }}
 */
export function applyWinner(options) {
  const result = options.run('git', ['merge', '--ff-only', options.commit], { cwd: options.cwd });
  return {
    ok: result.ok,
    detail: result.ok ? `fast-forwarded to ${options.commit}` : (result.stderr || result.stdout).trim(),
  };
}
