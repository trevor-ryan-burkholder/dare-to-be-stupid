/**
 * The assumptions log — what the builder decided that nobody asked it to (DESIGN.md §8.3).
 *
 * Karpathy's first principle: models make wrong assumptions on your behalf and run along with
 * them without checking. The stated remedy is to ask for clarification, which is incompatible
 * with an unattended loop — there is nobody to ask, and a builder that stalls waiting for an
 * answer burns the stall limit. The translation that works here is that the builder may not
 * silently pick an interpretation. It must **record** it, and the record reaches the reviewer,
 * who can check "you assumed X; the PRD says Y". An unstated assumption is a thing that
 * defaults to pass, and nothing here is allowed to default to pass.
 *
 * ## Why there is a citation bar, and why it is the whole design
 *
 * `lessons.mjs` records the failure this shares: *"a model asked that question will always
 * produce something, and a store full of confident generalities is worse than an empty one,
 * because it gets injected into every later brief."* An assumptions log is worse than that,
 * because it reaches the **reviewer** — the one component whose starvation is the reason the
 * architecture exists. Fill it with "I assumed the user wants this to be fast" and the panel is
 * reading noise at panel prices.
 *
 * So it takes the same bar `validateLesson` sets by rejecting a lesson with no trigger:
 * **an assumption citing nothing is discarded, not recorded.** Every entry names the PRD id or
 * the brief line that was ambiguous. That is not bookkeeping — a citation is the only thing
 * that makes an assumption checkable, because the reviewer's next move is to go and read the
 * thing cited and see whether it says what the builder thought it said.
 *
 * ## The three outcomes, and why they differ
 *
 * - **No block at all** is fine, and will be the common case. Most iterations resolve nothing
 *   ambiguous, and requiring a block would guarantee filler on every one of them.
 * - **A malformed block fails the iteration.** This is a machine-parsed output contract, and
 *   the rule everywhere else in this codebase is that unparseable output is a failure rather
 *   than an absence. A block that will not parse is not evidence there were no assumptions.
 * - **An uncited entry inside a valid block is discarded**, and the discard is *counted and
 *   reported* rather than dropped quietly — a log that silently sheds entries reads exactly
 *   like a log nothing was written to.
 *
 * The driver appends; the builder never writes the file. The store is driver-owned and §6
 * denies every write under `.dare` positionally, which is what stops this becoming a channel a
 * builder can use to talk to its own auditor unsupervised.
 *
 * This module reads no clock. `iteration` is passed in.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Driver-owned. Protected by the `.dare/**` invariant (§6) with no rule of its own. */
export const ASSUMPTIONS_FILE = 'assumptions.json';

/** Bumped when a field's meaning changes. */
const ASSUMPTIONS_VERSION = 1;

/** How many assumptions one reviewer prompt carries before it summarises the remainder. */
export const REVIEWER_CAP = 20;

/** Thrown when the log cannot be read or written. */
export class AssumptionsError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'AssumptionsError';
  }
}

/** @typedef {{ iteration: number, cites: string, ambiguity: string, assumed: string }} Assumption */

/** @typedef {{ version: number, entries: Assumption[] }} AssumptionsLog */

/**
 * @typedef {{
 *   assumptions: { cites: string, ambiguity: string, assumed: string }[],
 *   discarded: number,
 *   malformed: string
 * }} ParsedAssumptions
 */

/**
 * Read the builder's closing message for an assumptions block.
 *
 * The last fenced block wins, for the reason `parseCapabilityDeclaration` uses: a model that
 * echoes the example from its own instructions must not have the echo beat its answer.
 *
 * @param {string} raw the builder's final message
 * @returns {ParsedAssumptions} `malformed` is empty when nothing was wrong
 */
export function parseAssumptions(raw) {
  /** @type {ParsedAssumptions} */
  const none = { assumptions: [], discarded: 0, malformed: '' };

  const blocks = [...raw.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)].map((match) => match[1]);
  const candidates = blocks.filter((block) => block.includes('"assumptions"'));
  // An absent block is the common case and is not a failure. Most iterations resolve nothing
  // ambiguous, and requiring a block on every one would guarantee filler.
  if (candidates.length === 0) return none;

  const block = candidates[candidates.length - 1];
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(block);
  } catch (error) {
    return { ...none, malformed: `the assumptions block is not valid json: ${/** @type {Error} */ (error).message}` };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ...none, malformed: 'the assumptions block is not a json object' };
  }
  const list = /** @type {Record<string, unknown>} */ (parsed).assumptions;
  if (!Array.isArray(list)) {
    return { ...none, malformed: 'the assumptions block has no "assumptions" array' };
  }

  /** @type {{ cites: string, ambiguity: string, assumed: string }[]} */
  const kept = [];
  let discarded = 0;
  for (const entry of list) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      discarded += 1;
      continue;
    }
    const record = /** @type {Record<string, unknown>} */ (entry);
    const cites = typeof record.cites === 'string' ? record.cites.trim() : '';
    const ambiguity = typeof record.ambiguity === 'string' ? record.ambiguity.trim() : '';
    const assumed = typeof record.assumed === 'string' ? record.assumed.trim() : '';
    // The citation bar. An assumption that cites nothing cannot be checked against anything,
    // which makes it an opinion arriving in the reviewer's context at reviewer prices. An
    // assumption with no content is the same problem wearing a citation.
    if (cites === '' || assumed === '') {
      discarded += 1;
      continue;
    }
    kept.push({ cites, ambiguity, assumed });
  }
  return { assumptions: kept, discarded, malformed: '' };
}

/**
 * Read the log.
 *
 * Degrades the way the lesson store degrades, not the way the ratchet does. An unreadable
 * assumptions log cannot make a wrong build look right — it is context handed to a reviewer
 * whose verdict already defaults to fail — so losing it costs information rather than
 * correctness. It throws only on damage it cannot interpret, because silently treating a
 * future schema as empty would discard a real log.
 *
 * @param {string} dareDir
 * @returns {AssumptionsLog}
 * @throws {AssumptionsError}
 */
export function readAssumptions(dareDir) {
  const file = path.join(dareDir, ASSUMPTIONS_FILE);
  if (!existsSync(file)) return { version: ASSUMPTIONS_VERSION, entries: [] };
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new AssumptionsError(`${file} could not be parsed: ${/** @type {Error} */ (error).message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AssumptionsError(`${file} is not an object.`);
  }
  const record = /** @type {Record<string, unknown>} */ (parsed);
  if (record.version !== ASSUMPTIONS_VERSION) {
    throw new AssumptionsError(
      `${file} has version ${JSON.stringify(record.version)}; this build reads ${ASSUMPTIONS_VERSION}.`,
    );
  }
  if (!Array.isArray(record.entries)) throw new AssumptionsError(`${file} has no entries array.`);
  return { version: ASSUMPTIONS_VERSION, entries: /** @type {Assumption[]} */ (record.entries) };
}

/**
 * Append this iteration's assumptions. Append-only: nothing here rewrites or removes an
 * earlier entry, because the value of the log is that it shows what was believed *at the time*.
 *
 * @param {string} dareDir
 * @param {number} iteration
 * @param {{ cites: string, ambiguity: string, assumed: string }[]} assumptions
 * @returns {AssumptionsLog} the log as it now stands
 * @throws {AssumptionsError}
 */
export function appendAssumptions(dareDir, iteration, assumptions) {
  const log = readAssumptions(dareDir);
  const next = {
    version: ASSUMPTIONS_VERSION,
    entries: [...log.entries, ...assumptions.map((assumption) => ({ iteration, ...assumption }))],
  };
  const file = path.join(dareDir, ASSUMPTIONS_FILE);
  try {
    mkdirSync(dareDir, { recursive: true });
    const temporary = `${file}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    renameSync(temporary, file);
  } catch (error) {
    throw new AssumptionsError(`${file} could not be written: ${/** @type {Error} */ (error).message}`);
  }
  return next;
}

/**
 * Render the log for a reviewer prompt.
 *
 * Empty produces an empty string rather than a heading with nothing under it: a section
 * announcing "assumptions" and listing none invites a reviewer to wonder what it is missing.
 *
 * Capped, and the cap announces itself for the same reason the Build Brief's do — a list
 * showing twenty of sixty reads exactly like a list of twenty.
 *
 * @param {Assumption[]} entries
 * @returns {string}
 */
export function renderAssumptions(entries) {
  if (entries.length === 0) return '';
  const shown = entries.slice(-REVIEWER_CAP);
  const lines = [
    'The builder recorded these assumptions where the specification was ambiguous. Each names what',
    'it was reading. Check them: an assumption that contradicts what it cites is a defect in the',
    'work, whatever the code does. They are not requirements and they do not decide your verdict.',
    '',
  ];
  for (const entry of shown) {
    lines.push(`- iteration ${entry.iteration}, on ${entry.cites}: assumed ${entry.assumed}`);
    if (entry.ambiguity !== '') lines.push(`  (ambiguity: ${entry.ambiguity})`);
  }
  if (entries.length > shown.length) {
    lines.push(`- ...and ${entries.length - shown.length} earlier assumption(s), not shown here.`);
  }
  return lines.join('\n');
}
