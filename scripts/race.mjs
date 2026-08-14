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
 *     `.meeseeks/` is untracked and therefore absent. No candidate can read or advance the
 *     ratchet; only the main driver does, and only once a winner has been merged.
 *
 * Everything that touches git is injected, so the decisions above are tested without a
 * worktree in sight.
 */

import path from 'node:path';

/** @typedef {import('./plugins.mjs').Runner} Runner */
/** @typedef {import('./driver.mjs').GateResult} GateResult */

/**
 * Distinct explanations for why the previous iteration stalled, one per race candidate.
 *
 * **From `BORROWED.md` R9 / `BRIEF.md` C5.** The candidate brief has always told each candidate
 * *"another candidate is trying a different one"*, and nothing made that true: every candidate
 * received the same objective and differed only by sampling. The `raceCandidate` field that
 * would carry a difference carried `{ index, of }`. The seam was built and empty; this fills it.
 *
 * **Fixed and driver-owned rather than authored by a model, and that is deliberate twice over.**
 * `BRIEF.md` section E's do-not-add list is closed and the persona budget was spent on
 * `oracle-author`, so generating these would need a phase this project has decided not to have.
 * And a race is the one place determinism is cheapest to keep: a stall hypothesis chosen by a
 * model is a model with an opinion about a race, one step from a model adjudicating one.
 *
 * They are **stall archetypes**, not diagnoses. Nothing here knows why *this* iteration stalled;
 * what the list provides is that candidate 1 and candidate 2 start from genuinely different
 * places, which is the whole of R9's borrowable idea. The order is stable, so a reader comparing
 * two runs sees the same candidate given the same angle.
 *
 * @type {string[]}
 */
export const STALL_HYPOTHESES = [
  'the previous attempt fixed the symptom the failure named rather than the property behind it, ' +
    'so the same defect survives under a different input. Look for the general rule first.',
  'the previous attempt was too small. Something structural is wrong - a wrong data shape, a ' +
    'missing layer, an abstraction fighting the problem - and no local edit reaches it.',
  'the previous attempt was too large, and something in the diff that was never required broke ' +
    'something that worked. Find the smallest change that satisfies the objective and make only that.',
  'the tests, not the code, are what is wrong here: they assert something the objective does not ' +
    'ask for, or they assert nothing. Read them against the requirement before changing source.',
  'an assumption made earlier is false. Something believed about the framework, the toolchain or ' +
    'the input format does not hold - verify it by executing it rather than by reading.',
  'the failure is in the seams rather than in any one unit: setup, configuration, wiring or ' +
    'ordering between parts that are each individually correct.',
];

/**
 * The hypothesis for one candidate.
 *
 * `index` is the candidate's own number, which `createWorktrees` hands out from 1. It wraps
 * rather than running out: a race wider than the list still gives every candidate an angle, and
 * two candidates sharing one is strictly better than a candidate with none.
 *
 * @param {number} index 1-based candidate number
 * @returns {string}
 */
export function stallHypothesis(index) {
  const span = STALL_HYPOTHESES.length;
  return STALL_HYPOTHESES[(((index - 1) % span) + span) % span];
}


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
 * **Viability is "strictly better than main, and nothing regressed" — changed 14 August, and the
 * change is the whole point of racing at all.** It used to require *every* gate to pass. That bar
 * could not be met in the only situation a race ever arms in: the race is triggered by
 * consecutive **stalls**, and a stall *is* the condition of gates failing, so a candidate had to
 * repair everything at once on a line that had repaired nothing for several iterations. Case I
 * measured the result — two candidates, their own worktrees, gated independently, **both
 * discarded**, and `applyWinner` had still never fired in this project's history.
 *
 * **What did not change is the half that was load-bearing.** A candidate that regressed a
 * protected test is not a near miss to be ranked below the others, it is disqualified — merging it
 * would hand the main tree a regression the ratchet then has to reset back out of, which is a
 * worse position than never having raced. That check is untouched.
 *
 * What replaced the absolute bar is a comparison against where the main tree already is: a
 * candidate must pass a **larger share** of the gates that ran than main does. Strictly larger, so
 * an equal candidate is not merged — churn without progress is not progress. The share rather than
 * the count for the reason `recordProgress` uses one (0.126.0): rosters change size between
 * iterations, and a count punishes a shrinking one.
 *
 * **A fully green candidate is always viable**, whatever main is doing. Demanding that it *beat* a
 * main tree which is also green would refuse the one outcome the loop exists to produce. Anything
 * short of green must be strictly better than main — strictly, so churn without progress is not
 * merged.
 *
 * `baselineShare` defaults to 1, so a caller that does not say where main stands gets the old
 * absolute behaviour: only a green candidate qualifies. **Defaulting to 0 would have been the
 * dangerous direction** — every candidate would beat an unknown baseline.
 *
 * A first draft omitted the green clause and six existing tests caught it: with the default of 1,
 * `share === 1` is not `> 1`, so a candidate passing every gate was refused. The docblock claimed
 * the default reproduced the old behaviour and it did not.
 *
 * @param {Candidate[]} candidates
 * @returns {{ winner: Candidate | null, reason: string, viable: number }}
 */
export function selectWinner(candidates, baselineShare = 1) {
  const share = (/** @type {Candidate} */ candidate) =>
    candidate.gates.length === 0 ? 0 : candidate.gates.filter((gate) => gate.ok).length / candidate.gates.length;

  // A fully green candidate is always mergeable — it is the outcome the whole loop is aiming at,
  // and demanding it *beat* a main tree that is also fully green would refuse the ideal case.
  // Anything short of green has to be strictly better than where main already stands.
  const viable = candidates.filter(
    (candidate) =>
      candidate.commit !== null &&
      candidate.regressions.length === 0 &&
      (share(candidate) === 1 || share(candidate) > baselineShare),
  );

  if (viable.length === 0) {
    return {
      winner: null,
      reason:
        `no candidate beat the main tree (${Math.round(baselineShare * 100)}% of gates passing) without a ` +
        'regression; all were discarded',
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
  return `meeseeks-race-${String(index).padStart(2, '0')}`;
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
 * Does this path look like a worktree a race created?
 *
 * Matched on the directory name `createWorktrees` writes — `meeseeks-race-01` and up — rather than
 * on the parent, so a sweep still recognises one whose parent was renamed or partially cleaned.
 * A worktree of the operator's called `meeseeks-race-07` would be caught by this; that name is ours
 * and the collision is accepted rather than unnoticed.
 *
 * @param {string} worktreePath
 * @returns {boolean}
 */
function looksLikeRaceWorktree(worktreePath) {
  return /^meeseeks-race-\d+$/.test(path.basename(worktreePath));
}

/**
 * Remove race worktrees left behind by a previous run, before starting a new race.
 *
 * **This runs at race *start*, and the timing is the design.** `removeWorktrees` runs on the
 * driver's paths out, which covers every ordinary ending and none of the important one: killing a
 * driver mid-race with `-9` left three worktrees at `/tmp/meeseeks-race-55237-4/` on 13 August 2026,
 * and `git worktree add` refuses a directory it already knows about — so one abandoned race breaks
 * every later race in that repository, and the error names a directory rather than the race that
 * left it behind. No `finally` and no signal handler survives `SIGKILL`, so cleanup at the end
 * cannot be the whole answer. Self-healing at the start is the shape that survives.
 *
 * **The run lock is what makes this safe rather than merely likely to be safe.** One driver per
 * repository (§3.5) means that at the moment a race begins, any race worktree already registered
 * here cannot belong to a live race in this repository — there is no other driver to own it.
 *
 * A list that cannot be read is reported as a problem, not treated as an empty list: "nothing to
 * sweep" and "could not look" are different answers and only one of them is evidence.
 *
 * @param {{ cwd: string, run: Runner }} options
 * @returns {{ removed: string[], problems: string[] }}
 */
export function sweepRaceWorktrees(options) {
  /** @type {string[]} */
  const removed = [];
  /** @type {string[]} */
  const problems = [];

  const listed = options.run('git', ['worktree', 'list', '--porcelain'], { cwd: options.cwd });
  if (!listed.ok) {
    problems.push(`could not list worktrees before racing: ${(listed.stderr || listed.stdout).trim()}`);
    return { removed, problems };
  }

  const stale = listed.stdout
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length).trim())
    .filter((entry) => entry.length > 0 && looksLikeRaceWorktree(entry));

  for (const entry of stale) {
    const result = options.run('git', ['worktree', 'remove', '--force', entry], { cwd: options.cwd });
    if (result.ok) {
      removed.push(entry);
      continue;
    }
    problems.push(`abandoned race worktree ${entry} could not be removed: ${(result.stderr || result.stdout).trim()}`);
  }

  // Always, even when nothing was listed: an entry whose directory is already gone is invisible
  // to the loop above and still refuses the next `worktree add` on that path.
  options.run('git', ['worktree', 'prune'], { cwd: options.cwd });
  return { removed, problems };
}

/**
 * Fast-forward the main tree onto the winning candidate's commit.
 *
 * `--ff-only` is the whole safety argument. The winner's commit descends from the commit the
 * race started at, so the merge is a pointer move. If that is ever untrue the merge fails
 * loudly instead of inventing a merge commit nobody reviewed.
 *
 * **The tree is set aside first, and until 0.83.0 it was not — which made racing unable to land
 * a winner in the one situation it exists for.** Observed live on 13 August 2026: two candidates
 * passed every gate, candidate 1 won on the smallest diff, and git refused with *"Your local
 * changes to the following files would be overwritten by merge: docs/architecture.md"*. The run
 * logged it and continued, so three builders and roughly 7.4M tokens bought nothing, in a form
 * indistinguishable from a race that had no winner.
 *
 * That was not bad luck. A race is armed by a *stalled* iteration, so a dirty tree is the normal
 * state at the moment a winner lands, and the design's promise — *"the main tree has not moved"* —
 * was false in the way that matters: it has not **committed**, and `--ff-only` cares about the
 * working tree, not only the ref.
 *
 * **Why setting aside is right rather than merely convenient.** `createWorktrees` detaches every
 * candidate at `git rev-parse HEAD`, so no candidate ever saw the uncommitted changes and every
 * candidate's gates passed against `base + its own diff`. Landing the winner on top of those
 * changes would produce `base + winner + something nothing gated` — a tree no evidence in the run
 * describes. Keeping them is not the cautious option; it is the one that ships unjudged code.
 *
 * Nothing is destroyed. `git stash push --include-untracked` preserves the lot, ignored paths
 * excepted, which is what keeps `.meeseeks/` — ratchet, pins, briefs — out of it entirely. The stash
 * is **not** popped after a successful merge: re-applying ungated changes on top of the winner
 * rebuilds exactly the tree this avoids, and could conflict with the winner's diff while doing it.
 * It *is* popped when the merge fails anyway, because a failed race must leave the tree as it
 * found it.
 *
 * @param {{ cwd: string, run: Runner, commit: string, stashLabel?: string }} options
 * @returns {{ ok: boolean, detail: string }}
 */
export function applyWinner(options) {
  const status = options.run('git', ['status', '--porcelain'], { cwd: options.cwd });
  if (!status.ok) {
    // Not knowing whether the tree is dirty is not the same as it being clean, and merging on
    // the second reading when the first is what we have is how a race lands on a tree nobody
    // inspected.
    return { ok: false, detail: `the working tree could not be inspected before the merge: ${(status.stderr || status.stdout).trim()}` };
  }
  const changes = status.stdout.split('\n').filter((line) => line.trim().length > 0);
  let stashed = false;
  if (changes.length > 0) {
    const label = options.stashLabel ?? 'set aside before landing a race winner';
    const stash = options.run('git', ['stash', 'push', '--include-untracked', '--message', label], { cwd: options.cwd });
    if (!stash.ok) {
      return {
        ok: false,
        detail:
          `${changes.length} uncommitted change(s) blocked the merge and could not be set aside: ` +
          `${(stash.stderr || stash.stdout).trim()}`,
      };
    }
    stashed = true;
  }

  const merged = options.run('git', ['merge', '--ff-only', options.commit], { cwd: options.cwd });
  if (!merged.ok) {
    const detail = (merged.stderr || merged.stdout).trim();
    if (!stashed) return { ok: false, detail };
    const restored = options.run('git', ['stash', 'pop'], { cwd: options.cwd });
    return {
      ok: false,
      detail: restored.ok
        ? `${detail}; the working tree was restored`
        : `${detail}; the working tree could NOT be restored: ${(restored.stderr || restored.stdout).trim()}`,
    };
  }

  return {
    ok: true,
    detail: stashed
      ? `fast-forwarded to ${options.commit}; ${changes.length} uncommitted change(s) were set aside ` +
        'and left in `git stash` — no candidate was gated with them, so they are not part of what just landed'
      : `fast-forwarded to ${options.commit}`,
  };
}
