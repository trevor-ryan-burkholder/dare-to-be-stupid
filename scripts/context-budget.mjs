/**
 * The context budget — what a child is about to be handed, measured before it is spawned
 * (DESIGN.md §3.9).
 *
 * This exists because of the failure mode this codebase is worst at seeing. Meeseeks assembles a
 * builder's input from the Build Brief, the system prompt, the PRD, design documents,
 * retrieved lessons and conditional git history, and that input grows across iterations with
 * nothing looking at it. There is no exception, no exit code and no red line — the builder is
 * simply worse by iteration 12 than it was at iteration 2, and nothing in the run says so.
 * Every other check here refuses to let a missing signal read as a pass; this one refuses to
 * let a missing signal read as *health*.
 *
 * Two decisions are load-bearing and neither is obvious.
 *
 * **It counts characters, and calls them characters.** There is no tokenizer here and there
 * will not be one — hard constraint 1 forbids the dependency, and a hand-rolled estimate is
 * worse than no number at all, because `~48000 tokens` reads as a measurement and is a guess.
 * `.meeseeks/run.json` refuses to write `"unknown"` for the same reason. A character count is
 * exact, is free, and tracks the thing the item is actually about: unbounded growth. It is a
 * proxy for context occupancy and it is labelled as one everywhere it appears.
 *
 * **Over budget fails; it never trims.** The brief allowed either, provided a trim was an
 * explicit written policy rather than a silent one — and on inspection there is nothing here
 * worth trimming. Every list the Build Brief renders is already capped and already announces
 * what it left out (`brief.mjs`). The one uncapped input is raw gate output in a failure
 * `detail`, and trimming that means silently deciding which half of a compiler error the
 * builder is allowed to read. A truncated prompt is not a smaller task; it is a different
 * task, handed over without saying so. So the check refuses, before the child is spawned and
 * therefore before any money is spent, and the refusal names what was largest.
 */

/** @typedef {{ label: string, characters: number }} PromptPart */

/**
 * @typedef {{
 *   ok: boolean,
 *   characters: number,
 *   limit: number,
 *   parts: PromptPart[],
 *   detail: string
 * }} BudgetVerdict
 */

/**
 * The default ceiling, in characters.
 *
 * A Claude context window is on the order of 200,000 tokens. At a deliberately conservative
 * three characters per token — code is denser than prose — that window is somewhere near
 * 600,000 characters. The default sits below it so that the check fires on the run's own
 * growth and names it, rather than arriving later as a provider error that names nothing.
 *
 * The number's job is to catch a runaway, not to maximise utilisation. A healthy Build Brief
 * is a few thousand characters and the builder's system prompt is under ten thousand;
 * anything approaching this figure is a defect somewhere upstream, and finding out which
 * upstream is the point of reporting the parts.
 */
export const DEFAULT_MAX_PROMPT_CHARACTERS = 400_000;

/**
 * Measure the pieces of one child's input, largest first.
 *
 * Empty and absent parts are dropped rather than reported as zero: a verdict listing five
 * things of which three are `0` buries the one that matters.
 *
 * @param {Record<string, string | undefined>} parts label → text
 * @returns {{ characters: number, parts: PromptPart[] }}
 */
export function measurePrompt(parts) {
  /** @type {PromptPart[]} */
  const measured = [];
  for (const [label, text] of Object.entries(parts)) {
    if (text === undefined || text.length === 0) continue;
    measured.push({ label, characters: text.length });
  }
  // Largest first, then by label, so an equal-sized pair renders in the same order every
  // time. A verdict that reorders between identical runs is a verdict nobody can diff.
  measured.sort((a, b) => b.characters - a.characters || a.label.localeCompare(b.label));
  return { characters: measured.reduce((total, part) => total + part.characters, 0), parts: measured };
}

/**
 * Would this child's input fit the budget?
 *
 * Fails closed in the one way that matters: a limit that is not a usable positive number is
 * an error rather than a reason to skip the check. A budget check that quietly disables
 * itself on a malformed configuration is the silent degradation it was built to catch.
 *
 * @param {{ phase: string, parts: Record<string, string | undefined>, limit?: number }} options
 * @returns {BudgetVerdict}
 */
export function checkContextBudget(options) {
  // `undefined` means the caller had nothing to say and gets the default. Anything else is
  // a value and is validated, including `null` — `??` would have quietly accepted a null
  // that reached here from a hand-edited config and applied the default in its place, which
  // is a check silently substituting its own opinion for a malformed instruction.
  const limit = options.limit === undefined ? DEFAULT_MAX_PROMPT_CHARACTERS : options.limit;
  if (!Number.isFinite(limit) || limit < 1) {
    throw new TypeError(`context budget limit must be a positive number; got ${JSON.stringify(options.limit)}`);
  }

  const { characters, parts } = measurePrompt(options.parts);
  if (characters <= limit) {
    return { ok: true, characters, limit, parts, detail: '' };
  }

  const breakdown = parts.map((part) => `${part.label} ${part.characters}`).join(', ');
  return {
    ok: false,
    characters,
    limit,
    parts,
    detail:
      `${options.phase}: prompt is ${characters} characters, over the ${limit} character budget. ` +
      `Largest first: ${breakdown}. Not spawned, and nothing was truncated - a shortened prompt ` +
      'is a different task handed over without saying so. Raise contextBudget.maxCharacters in ' +
      '.meeseeks/config.json if this input is genuinely this large, or find what grew.',
  };
}
