/**
 * `DOD.md`: the operator's additive done-bar (PLAN.md item 48; tier table in item 49).
 *
 * **The third input, beside the PRD and the ERD.** The PRD says what to build, the ERD says what the
 * data looks like, and this says what *done* means. Factoring the bar out of the PRD makes an
 * enterprise done-bar authorable once and reusable across targets.
 *
 * ## Additive only, and that is the load-bearing law
 *
 * A `DOD.md` criterion can make a ship **harder**, never easier. It may not suppress a finding,
 * relax a gate, waive a security pin, or soften quarantine-is-not-a-pass. That is not a policy bolted
 * on top — it follows from constitutional supremacy (`CONSTITUTION.md`): a done-bar sits *beneath*
 * the invariants, so it may only add. It rides in the **panel** contract as gating requirements a
 * cold reviewer must clear, never as a builder instruction the builder could self-certify.
 *
 * ## Why the tier is declared rather than detected
 *
 * Item 49's table sorts criteria into deterministic, panel-judgeable, and unfalsifiable — and the
 * last is refused at authoring. **No parser can make that call.** "Feels premium" and "the mark reads
 * as one silhouette at 16px" are both prose; what separates them is whether an observation exists
 * that would prove them false, which is a judgment. Judgments in this system belong to a cold role,
 * not to a regular expression.
 *
 * So the criterion **declares its own tier**, and this reader enforces what a machine actually can:
 * that the declaration is present, is one of the tiers that exist, names an observation, and is not
 * the tier nobody may ship. A criterion declaring itself `unfalsifiable` is refused **by name and by
 * line** — actionable, and raised before a builder is handed something it cannot satisfy, rather
 * than eight iterations later, which is this project's most expensive defect class.
 *
 * The harder half — deciding that a criterion *claiming* to be panel-judgeable states no real
 * observation — is an authoring role's job and is not attempted here. What this refuses, it refuses
 * deterministically; what it cannot decide, it does not pretend to.
 */

/** Thrown when a done-bar cannot be trusted. Never downgraded to "no extra criteria". */
export class DodError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'DodError';
  }
}

/**
 * The tiers a criterion may declare (item 49's table).
 *
 * `unfalsifiable` is listed **because it must be refusable by name**. Omitting it would make an
 * author's honest admission parse as an unknown tier, and the operator would be told their spelling
 * was wrong rather than that their criterion decides nothing.
 */
export const DOD_TIERS = ['deterministic', 'panel-judgeable', 'unfalsifiable'];

/** The tiers a run may actually be held to. */
const ADMISSIBLE = new Set(['deterministic', 'panel-judgeable']);

/**
 * @typedef {{
 *   id: string,
 *   tier: 'deterministic' | 'panel-judgeable',
 *   statement: string,
 *   observation: string,
 * }} DodCriterion
 */

/**
 * One criterion line: `**DOD-1** (tier) — statement. Observation: how it would be falsified.`
 *
 * Deliberately the same shape as a PRD requirement line, because an operator writing both should not
 * have to learn two formats, and because the ids slot straight into the panel's existing requirement
 * contract.
 */
const CRITERION_RE = /^\*\*(DOD-\d+)\*\*\s*\(([^)]+)\)\s*[—-]\s*(.+)$/;

/** How the observation is separated from the statement. */
const OBSERVATION_RE = /^(.*?)\s*Observation:\s*(.+)$/i;

/**
 * Parse a `DOD.md`.
 *
 * @param {string} text
 * @returns {DodCriterion[]}
 * @throws {DodError} when the done-bar cannot be trusted
 */
export function parseDod(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new DodError('the done-bar is empty. A file that adds no criteria is not a done-bar; remove it instead.');
  }
  /** @type {DodCriterion[]} */
  const criteria = [];
  /** @type {Set<string>} */
  const seen = new Set();

  for (const [index, raw] of text.split('\n').entries()) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#') || line.startsWith('>')) continue;
    if (!line.startsWith('**DOD-')) continue;
    const where = `line ${index + 1}`;

    const match = CRITERION_RE.exec(line);
    if (match === null) {
      // Fail closed. A line beginning `**DOD-` was meant to be a criterion, and skipping a
      // malformed one silently drops part of the bar the operator believes they set.
      throw new DodError(
        `${where}: ${JSON.stringify(line.slice(0, 80))} looks like a criterion and does not parse. ` +
          'The shape is `**DOD-1** (tier) — statement. Observation: what would prove it false.`',
      );
    }
    const [, id, declaredTier, body] = match;
    const tier = declaredTier.trim().toLowerCase();

    if (seen.has(id)) {
      throw new DodError(`${where}: ${id} appears more than once, so the bar is ambiguous about what it requires`);
    }
    seen.add(id);

    if (!DOD_TIERS.includes(tier)) {
      throw new DodError(
        `${where}: ${id} declares tier ${JSON.stringify(declaredTier.trim())}, which is not one of ` +
          `${DOD_TIERS.join(', ')}.`,
      );
    }
    if (!ADMISSIBLE.has(tier)) {
      // Refused by name and by line, which is the whole point of the filter. It stops being "we do
      // not do that" and becomes a sentence the operator can act on.
      throw new DodError(
        `${where}: ${id} declares itself ${tier}, so nobody can decide it — not a gate, not the panel, ` +
          'not you. Rewrite it to name an observation that would prove it false, or remove it. A done-bar ' +
          'that launders vagueness into a checklist is worse than none, because it looks like rigour ' +
          'while failing nothing.',
      );
    }

    const split = OBSERVATION_RE.exec(body.trim());
    if (split === null) {
      throw new DodError(
        `${where}: ${id} names no observation. Every criterion must say what would prove it false, ` +
          'or nothing can ever fail it. Add `Observation: ...` to the line.',
      );
    }
    // Trailing punctuation is stripped from both halves, not one. An operator writes two sentence
    // fragments and the reader should not make them differ: a first draft trimmed the statement and
    // not the observation, so two values the author had written identically came out unequal.
    const statement = split[1].trim().replace(/[.;]$/, '');
    const observation = split[2].trim().replace(/[.;]$/, '');
    if (statement === '') {
      throw new DodError(`${where}: ${id} states nothing before its observation`);
    }
    if (observation === '') {
      throw new DodError(`${where}: ${id} has an empty observation`);
    }
    criteria.push({ id, tier: /** @type {'deterministic' | 'panel-judgeable'} */ (tier), statement, observation });
  }

  if (criteria.length === 0) {
    throw new DodError(
      'the done-bar declares no criteria. An empty bar is not additive, it is decoration — remove the ' +
        'file rather than shipping one that adds nothing.',
    );
  }
  return criteria;
}

/**
 * The ids a `DOD.md` contributes to the panel's required set.
 *
 * @param {DodCriterion[]} criteria
 * @returns {string[]}
 */
export function dodIds(criteria) {
  return criteria.map((criterion) => criterion.id).sort();
}
