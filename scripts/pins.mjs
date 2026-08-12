/**
 * Pins — the second and third monotonic properties (DESIGN.md §4.3).
 *
 * The ratchet is monotonic on **test ids**: an id that has passed may never fail again. That
 * closes oscillation on the one property the loop can measure for free. It says nothing about
 * two others that degrade just as quietly.
 *
 * **Security elements (A4).** SCAFFOLD-CEGIS (arXiv 2603.08520) reports that security degrades
 * *gradually across iterations* through specification drift — 43.7% of ten-round chains ended
 * more vulnerable than baseline — and, importantly, that adding a static security gate made it
 * **worse**, 12.5% to 20.8%, because static rules cannot see removed defensive logic. Dare has
 * exactly the shape they measured: `npm audit` plus a security auditor, per iteration, with no
 * memory. Their fix is the mechanism already at the centre of this design, pointed at a
 * different property.
 *
 * **Requirements (A8).** A requirement a cold reviewer passed with `file:line` evidence is
 * re-argued from scratch on every later panel, and the panel is the most expensive thing in
 * the loop. Pinning it to its evidence lets the pass carry until the evidence changes.
 *
 * Both are the same shape — an id, a `file:line`, a fingerprint, and a rule for when the pin
 * stops being trustworthy — which is why they live in one module. What differs is the
 * consequence, and the difference is the whole design:
 *
 * | | fingerprint | when it stops matching |
 * |---|---|---|
 * | security element | the **snippet**, normalised | escalate; may become a regression |
 * | requirement | the whole **file** | unpin and re-review; never a failure by itself |
 *
 * ## Why a security pin escalates instead of resetting
 *
 * Re-verification is a substring search over code the builder may reformat at any chaos level
 * above 1. "Ambiguity is a fail" would convert a formatter run into a hard reset plus a
 * regression objective the builder **cannot satisfy** — it is told to restore something that
 * was never removed, and under monotonicity a false pin is unremovable. That is not a strict
 * design; it is a run that cannot terminate.
 *
 * So the authority that pins is the authority that unpins. A cheap check runs every iteration
 * and costs nothing. Only when it fails does one security-reviewer call, scoped to that single
 * element, decide between three answers:
 *
 * - **removed** → regression. Hard reset, regression objective, nothing else proceeds.
 * - **moved** → re-pin at the new location. No reset.
 * - **cannot tell** → quarantine: recorded, surfaced to the operator, excluded from further
 *   re-verification.
 * - **never was one** → retract, with a reason. Added after an audit found a `DoD-2-security` pin
 *   citing `if (intent.kind === 'usage-error') {` — an argv branch. The other three answers all
 *   presuppose the pinned thing *was* a control, so a false pin could only ever be quarantined,
 *   and quarantine blocks `SHIPPED` forever. The escape §4.3 promised solved "where did the guard
 *   go" and had no answer to "that was never a guard". Retracted rather than deleted: the entry
 *   and its reason remain, because protection that silently stops existing is indistinguishable
 *   from protection that was never there.
 *
 * One targeted call is cheaper than a wrong hard reset by an order of magnitude, and it
 * preserves "ambiguity is not a pass" — because **quarantine is not a pass**. It is a recorded
 * loss of protection, and a run may not reach `SHIPPED` while any element is quarantined. That
 * converts dropped protection from something a run absorbs silently into something it has to
 * resolve, and it is the whole difference between this and a threshold that drifts.
 *
 * ## Why a requirement pin is fail-closed in the other direction
 *
 * A carried pass is a review that did not happen. So invalidation is deliberately eager: any
 * change to the evidenced file unpins, ambiguity unpins rather than carries, and an evidence
 * target that cannot be resolved at all is a **failure** rather than a carried pass. The Ralph
 * design where the *builder* marks its own stories complete is exactly what this must not
 * become, and the distance between the two is that nothing here is written by a builder — the
 * store is driver-owned and the guard hook denies every write under `.dare` positionally.
 *
 * This module reads no clock and runs no command. `pinnedAt` is an iteration number, passed in.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Driver-owned. Protected by the `.dare/**` invariant (§6) with no rule of its own. */
export const PINS_FILE = 'pins.json';

/** Bumped when a field's meaning changes. */
const PINS_VERSION = 1;

/** Thrown when the pin store cannot be trusted. */
export class PinsError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'PinsError';
  }
}

/**
 * @typedef {{
 *   id: string,
 *   evidence: string,
 *   file: string,
 *   line: number,
 *   snippet: string,
 *   fingerprint: string,
 *   pinnedAt: number,
 *   status: 'active' | 'quarantined' | 'retracted',
 *   reason: string
 * }} SecurityPin
 */

/**
 * @typedef {{
 *   id: string,
 *   evidence: string,
 *   file: string,
 *   fingerprint: string,
 *   pinnedAt: number
 * }} RequirementPin
 */

/** @typedef {{ version: number, security: SecurityPin[], requirements: RequirementPin[] }} PinStore */

/** @returns {PinStore} */
export function emptyPins() {
  return { version: PINS_VERSION, security: [], requirements: [] };
}

/**
 * Collapse a snippet to the form that survives reformatting.
 *
 * Whitespace runs become one space and the ends are trimmed, so an indentation change, a
 * re-wrapped line or a prettier pass does not read as a removed guard. Nothing else is
 * normalised: renaming a variable, reordering arguments or changing a comparison **should**
 * break the match, because those are edits to the guard rather than to its formatting, and
 * a normaliser clever enough to see through them would also see through its removal.
 *
 * @param {string} text
 * @returns {string}
 */
export function normaliseSnippet(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * @param {string} text
 * @returns {string} `sha256:` followed by the hex digest
 */
export function fingerprint(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

/**
 * Split a reviewer's `path/file.ts:41` into its parts.
 *
 * The reviewer contract already requires this shape and `parseReviewerReport` already flips a
 * pass whose evidence does not have it, so anything arriving here has been through that check.
 * It is re-checked anyway: a pin built from an unparseable location would be permanently
 * unverifiable, which under monotonicity means permanently unsatisfiable.
 *
 * @param {string} evidence
 * @returns {{ file: string, line: number }}
 * @throws {PinsError}
 */
export function parseEvidence(evidence) {
  const match = /^(.+):(\d+)$/.exec(evidence.trim());
  if (match === null) {
    throw new PinsError(`evidence ${JSON.stringify(evidence)} is not a file:line location, so it cannot be pinned.`);
  }
  return { file: match[1], line: Number(match[2]) };
}

/**
 * Pin a defensive element the security reviewer cited.
 *
 * The snippet is the *evidenced line's* text rather than the whole file, because the claim
 * being pinned is "this guard exists" and not "this file is unchanged". A whole-file
 * fingerprint would unpin on every unrelated edit, which is correct for a requirement and
 * useless for a guard.
 *
 * @param {{ id: string, evidence: string, snippet: string, iteration: number }} input
 * @returns {SecurityPin}
 * @throws {PinsError}
 */
export function pinSecurityElement(input) {
  const { file, line } = parseEvidence(input.evidence);
  const snippet = normaliseSnippet(input.snippet);
  if (snippet.length === 0) {
    throw new PinsError(
      `${input.id} cited ${input.evidence} but the line is empty, so there is nothing to re-verify. ` +
        'A pin that can never match is a permanent false regression.',
    );
  }
  return {
    id: input.id,
    evidence: input.evidence,
    file,
    line,
    snippet,
    fingerprint: fingerprint(snippet),
    pinnedAt: input.iteration,
    status: 'active',
    reason: '',
  };
}

/**
 * Pin a requirement a cold reviewer passed, keyed to the file its evidence named.
 *
 * @param {{ id: string, evidence: string, contents: string, iteration: number }} input
 * @returns {RequirementPin}
 * @throws {PinsError}
 */
export function pinRequirement(input) {
  const { file } = parseEvidence(input.evidence);
  return {
    id: input.id,
    evidence: input.evidence,
    file,
    fingerprint: fingerprint(input.contents),
    pinnedAt: input.iteration,
  };
}

/**
 * Is a pinned guard still there?
 *
 * Deliberately cheap — a normalised substring search over one file, no audit, no model. It
 * answers `present` or `ambiguous` and never `removed`, because this check cannot tell the
 * difference between a deleted guard and a rewritten one. Deciding that is what the scoped
 * reviewer call is for, and it only happens when this returns `ambiguous`.
 *
 * The search is over the whole file rather than the recorded line, so a guard that moved down
 * twenty lines still verifies for free.
 *
 * @param {SecurityPin} pin
 * @param {(file: string) => string | null} readSource returns null when the file is gone
 * @returns {'present' | 'ambiguous'}
 */
export function verifySecurityPin(pin, readSource) {
  if (pin.status === 'quarantined' || pin.status === 'retracted') return 'present';
  const contents = readSource(pin.file);
  if (contents === null) return 'ambiguous';
  return normaliseSnippet(contents).includes(pin.snippet) ? 'present' : 'ambiguous';
}

/**
 * May a requirement's earlier cold pass be carried forward?
 *
 * @param {RequirementPin} pin
 * @param {(file: string) => string | null} readSource
 * @returns {'carry' | 'unpin' | 'fail'}
 */
export function verifyRequirementPin(pin, readSource) {
  const contents = readSource(pin.file);
  // An evidence target that no longer resolves is a fail, never a carried pass. The pass was
  // granted *because* something was at that path; nothing being there now is the strongest
  // possible reason to stop trusting it, not a reason to shrug.
  if (contents === null) return 'fail';
  return fingerprint(contents) === pin.fingerprint ? 'carry' : 'unpin';
}

/**
 * Retract a pin that should never have existed.
 *
 * **The fourth answer, and it was missing.** The escalation could say `moved`, `removed` or
 * `unknown` — three answers that all presuppose the pinned thing *was* a security element. An
 * audit of this project's first `SHIPPED` found a `DoD-2-security` pin citing
 * `if (intent.kind === 'usage-error') {` — an argv branch, not a control. Under monotonicity
 * that pin was permanent: nothing could re-verify it as a guard, because it never was one, and
 * the only available verdicts would have quarantined it forever and blocked every future ship.
 *
 * `DESIGN.md` §4.3 predicted this exact hazard — *"a false pin under monotonicity is unremovable
 * and turns a formatter run into an objective the builder cannot satisfy"* — and supplied an
 * escape for the wrong failure. Escalation solves *"where did the guard go"*. It had no answer to
 * *"that was never a guard"*.
 *
 * **Retracted, not deleted.** The record stays, with its reason, for the same argument that makes
 * quarantine visible: a protection that silently stops existing is indistinguishable from one
 * that was never there. A retracted pin no longer blocks `SHIPPED` — that is the point of it —
 * so the entry is the only evidence the claim was ever made and withdrawn.
 *
 * The authority is unchanged and that is what keeps this from being an escape hatch. Only the
 * scoped cold reviewer may retract, exactly as only it may re-pin; the builder cannot ask for
 * this and cannot reach the file.
 *
 * @param {SecurityPin} pin
 * @param {string} reason
 * @returns {SecurityPin}
 * @throws {PinsError} when no reason is given
 */
export function retractPin(pin, reason) {
  if (typeof reason !== 'string' || reason.trim() === '') {
    throw new PinsError(
      `${pin.id} cannot be retracted without a reason. A pin withdrawn silently is indistinguishable ` +
        'from protection that quietly stopped being checked.',
    );
  }
  return { ...pin, status: 'retracted', reason };
}

/**
 * Move a security pin to quarantine: a recorded loss of protection.
 *
 * @param {SecurityPin} pin
 * @param {string} reason what the scoped reviewer could not determine
 * @returns {SecurityPin}
 * @throws {PinsError}
 */
export function quarantinePin(pin, reason) {
  if (reason.trim().length === 0) {
    throw new PinsError(`${pin.id} cannot be quarantined without a reason; an unexplained gap is not a record.`);
  }
  return { ...pin, status: 'quarantined', reason };
}

/**
 * Re-pin a guard the scoped reviewer found at a new location.
 *
 * @param {SecurityPin} pin
 * @param {{ evidence: string, snippet: string, iteration: number }} found
 * @returns {SecurityPin}
 * @throws {PinsError}
 */
export function repinSecurityElement(pin, found) {
  return pinSecurityElement({
    id: pin.id,
    evidence: found.evidence,
    snippet: found.snippet,
    iteration: found.iteration,
  });
}

/**
 * Why this run may not ship yet.
 *
 * Quarantine is not free and this is where that is enforced. A quarantined element is a piece
 * of protection the run knows it has lost track of, and shipping over it would be the run
 * absorbing dropped security silently — which is the failure the whole item exists to prevent.
 *
 * @param {PinStore} pins
 * @returns {string[]} one line per blocker, sorted; empty when nothing blocks
 */
export function shippingBlockers(pins) {
  return pins.security
    .filter((pin) => pin.status === 'quarantined')
    .map((pin) => `${pin.id} at ${pin.evidence} is quarantined: ${pin.reason}`)
    .sort();
}

/**
 * Read the pin store.
 *
 * Fails the way the ratchet fails rather than the way the lesson store fails, and the
 * distinction is the point. An unreadable lesson store degrades to no lessons, because it
 * cannot make a wrong build look right. An unreadable pin store **can**: continuing without it
 * silently discards every recorded guard and every carried pass, and the run would look
 * healthier for having lost them.
 *
 * @param {string} dareDir
 * @returns {PinStore}
 * @throws {PinsError}
 */
export function readPins(dareDir) {
  const file = path.join(dareDir, PINS_FILE);
  if (!existsSync(file)) return emptyPins();
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new PinsError(`${file} could not be parsed: ${/** @type {Error} */ (error).message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new PinsError(`${file} is not an object.`);
  }
  const record = /** @type {Record<string, unknown>} */ (parsed);
  if (record.version !== PINS_VERSION) {
    throw new PinsError(`${file} has version ${JSON.stringify(record.version)}; this build reads ${PINS_VERSION}.`);
  }
  if (!Array.isArray(record.security) || !Array.isArray(record.requirements)) {
    throw new PinsError(`${file} must carry a security array and a requirements array.`);
  }
  return {
    version: PINS_VERSION,
    security: /** @type {SecurityPin[]} */ (record.security),
    requirements: /** @type {RequirementPin[]} */ (record.requirements),
  };
}

/**
 * Write the pin store atomically.
 *
 * @param {string} dareDir
 * @param {PinStore} pins
 * @returns {string} the path written
 * @throws {PinsError}
 */
export function writePins(dareDir, pins) {
  const file = path.join(dareDir, PINS_FILE);
  const ordered = {
    version: PINS_VERSION,
    security: [...pins.security].sort((a, b) => a.id.localeCompare(b.id) || a.evidence.localeCompare(b.evidence)),
    requirements: [...pins.requirements].sort((a, b) => a.id.localeCompare(b.id)),
  };
  try {
    mkdirSync(dareDir, { recursive: true });
    const temporary = `${file}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(ordered, null, 2)}\n`, 'utf8');
    renameSync(temporary, file);
  } catch (error) {
    throw new PinsError(`${file} could not be written: ${/** @type {Error} */ (error).message}`);
  }
  return file;
}

/** @typedef {{ finding: 'removed' | 'moved' | 'unknown' | 'never-was', evidence: string | null, snippet: string, detail: string }} EscalationVerdict */

/**
 * Read the scoped security reviewer's answer about one element.
 *
 * Fail-closed here means `unknown`, not `removed`, and the distinction is deliberate. An
 * unparseable answer is not evidence that a guard was deleted, and treating it as one would
 * hard-reset the tree and hand the builder a regression objective it cannot satisfy — the
 * exact failure the escalation path exists to avoid. `unknown` is not a pass either: it
 * quarantines, and a quarantined element blocks `SHIPPED`. So the run cannot ship over an
 * answer nobody could read, and it also cannot be destroyed by one.
 *
 * A `moved` verdict missing its new location is downgraded to `unknown` for the same reason:
 * "it moved, I will not say where" leaves nothing to re-pin, and inventing a location would
 * make the next re-verification a coin toss.
 *
 * @param {string} raw the child's final message
 * @returns {EscalationVerdict}
 */
export function parseSecurityEscalation(raw) {
  /** @type {(detail: string) => EscalationVerdict} */
  const unknown = (detail) => ({ finding: 'unknown', evidence: null, snippet: '', detail });

  const blocks = [...raw.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)].map((match) => match[1]);
  // Last block first, so an echoed example never beats the answer — the same rule
  // `parseCapabilityDeclaration` follows, and for the same reason.
  for (const block of blocks.reverse()) {
    /** @type {unknown} */
    let parsed;
    try {
      parsed = JSON.parse(block);
    } catch {
      continue;
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
    const record = /** @type {Record<string, unknown>} */ (parsed);
    const detail = typeof record.detail === 'string' ? record.detail : '';
    if (record.finding === 'removed') return { finding: 'removed', evidence: null, snippet: '', detail };
    if (record.finding === 'moved') {
      const evidence = typeof record.evidence === 'string' ? record.evidence.trim() : '';
      const snippet = typeof record.snippet === 'string' ? record.snippet.trim() : '';
      if (evidence === '' || snippet === '') {
        return unknown(`the reviewer said the element moved but did not say where: ${detail}`);
      }
      return { finding: 'moved', evidence, snippet, detail };
    }
    // The fourth answer. Requires a reason, because a retraction with no argument is the one
    // shape a builder could hope to launder a real guard through - and unlike the other three
    // this verdict removes protection from the monotonic set rather than relocating it.
    if (record.finding === 'never-was') {
      return detail === ''
        ? unknown('the reviewer said the element was never a security control but gave no reason')
        : { finding: 'never-was', evidence: null, snippet: '', detail };
    }
    if (record.finding === 'unknown') return unknown(detail === '' ? 'the reviewer could not tell' : detail);
    return unknown(`the reviewer returned an unrecognised finding ${JSON.stringify(record.finding)}`);
  }
  return unknown('the escalation output could not be parsed as a json verdict');
}
