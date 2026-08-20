/**
 * Claim consistency (`DESIGN.md` §3.8.5, `PLAN.md` item 49).
 *
 * The second deterministic prose check, and the one whose value is entirely in what it refuses to
 * do. It answers: **does this artifact assign two different values to the same claim?**
 *
 * ## The line, and why it is drawn exactly here
 *
 * Item 49 asks for *machine-readable* contradiction detection while *differently worded semantic*
 * claims remain cold-panel work. That is not a limitation being apologized for — it is the
 * boundary that keeps this check trustworthy. A gate that tried to decide whether "adoption
 * roughly doubled" contradicts "usage rose 40%" would be a language model wearing an exit code,
 * and its verdicts would be indistinguishable from noise. So this module compares **declared
 * values under declared units**, and everything else it hands to review by name.
 *
 * Three outcomes, and the middle one is the interesting one:
 *
 * - **consistent** — one id, one normalized value, one unit. Nothing to say.
 * - **contradicted** — one id, one unit, two different values. This is a real contradiction that
 *   no reading can reconcile, and it fails the gate.
 * - **referred** — one id, two different *units*. `42 percent` and `0.42 ratio` may be the same
 *   number or may not, and converting between arbitrary units is exactly the guessing this
 *   codebase refuses. It is reported to the panel rather than judged here, and it does **not**
 *   fail the gate, because failing on a possibly-equal pair would make the check unusable and
 *   teach an author to flatten every unit into prose where nothing can see it.
 *
 * ## What it does not check, stated rather than implied
 *
 * It does not check that a claim's value appears in the manuscript that states it. A value
 * written `42%` in the manifest is legitimately written *"forty-two percent"* in prose, and a
 * presence check would either be trivially evaded or would fail honest writing. `statedIn` is
 * required to name a **readable file**, so a claim points somewhere real; whether the prose there
 * says the number in words is a question for review.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

/** The artifact's declaration of every value it asserts. Repository-relative. */
export const CLAIMS_MANIFEST = 'claims.json';

/** Thrown when the claims manifest cannot be read as a manifest. */
export class ClaimError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'ClaimError';
  }
}

/**
 * @typedef {{ id: string, value: string, unit: string, statedIn: string }} Claim
 */

/**
 * Reduce a declared value to what two declarations must share to be the same value.
 *
 * Numbers are compared **numerically**, so `42`, `42.0` and `+42` are one value — a manifest that
 * called the same figure two of those things has not contradicted itself, and reporting it as a
 * contradiction would train authors to distrust the gate. Everything else is compared as
 * whitespace-folded, case-folded text: unlike a *quotation*, where case is meaning, a declared
 * value's capitalization is formatting.
 *
 * @param {string} value
 * @returns {string} a canonical form; equal forms are the same value
 */
export function normalizeValue(value) {
  const collapsed = value.replace(/\s+/g, ' ').trim();
  // `Number('')` is 0 and `Number(' ')` is 0, which would collapse every blank into a zero. The
  // manifest rejects blanks before this is reached, and the guard stays anyway because a silent
  // zero is exactly the kind of wrong answer nothing downstream could notice.
  if (collapsed !== '' && Number.isFinite(Number(collapsed))) return `number:${Number(collapsed)}`;
  return `text:${collapsed.toLowerCase()}`;
}

/**
 * Read and validate the manifest. Every field required, for the reason the citation manifest
 * requires all of its own: an optional one is a claim asserting less than it appears to.
 *
 * Duplicate ids are **allowed here and refused there**, and the difference is the point. Two
 * citations under one id is a bookkeeping error. Two *claims* under one id is the entire subject
 * of this module — it is either a restatement or a contradiction, and deciding which is the job.
 *
 * @param {string} text
 * @returns {Claim[]}
 * @throws {ClaimError}
 */
export function parseClaims(text) {
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new ClaimError(`${CLAIMS_MANIFEST} is not valid JSON: ${error instanceof Error ? error.message : error}`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ClaimError(`${CLAIMS_MANIFEST} must be a JSON object with a "claims" array`);
  }
  const record = /** @type {Record<string, unknown>} */ (parsed);
  if (record.version !== 1) {
    throw new ClaimError(`${CLAIMS_MANIFEST} must declare "version": 1; got ${JSON.stringify(record.version)}`);
  }
  if (!Array.isArray(record.claims)) {
    throw new ClaimError(`${CLAIMS_MANIFEST} must declare a "claims" array, even when it is empty`);
  }

  /** @type {Claim[]} */
  const claims = [];
  for (const [index, entry] of record.claims.entries()) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new ClaimError(`claim ${index} is not an object`);
    }
    const fields = /** @type {Record<string, unknown>} */ (entry);
    /** @type {Record<string, string>} */
    const checked = {};
    for (const name of ['id', 'value', 'unit', 'statedIn']) {
      const field = fields[name];
      if (typeof field !== 'string' || field.trim() === '') {
        throw new ClaimError(
          `claim ${index} needs a non-empty string "${name}"; got ${JSON.stringify(field)}. ` +
            'A unit is required even when it is "count" or "none": two values are only comparable ' +
            'under a stated unit, and an absent one would be silently treated as agreement.',
        );
      }
      checked[name] = field;
    }
    claims.push(/** @type {Claim} */ (/** @type {unknown} */ (checked)));
  }
  return claims;
}

/**
 * @typedef {{
 *   contradicted: { id: string, unit: string, values: string[] }[],
 *   referred: { id: string, units: string[] }[],
 *   consistent: number
 * }} ClaimReport
 */

/**
 * Sort every id into contradicted, referred, or consistent.
 *
 * @param {Claim[]} claims
 * @returns {ClaimReport}
 */
export function inspectClaims(claims) {
  /** @type {Map<string, Claim[]>} */
  const byId = new Map();
  for (const claim of claims) {
    const existing = byId.get(claim.id);
    if (existing === undefined) byId.set(claim.id, [claim]);
    else existing.push(claim);
  }

  /** @type {{ id: string, unit: string, values: string[] }[]} */
  const contradicted = [];
  /** @type {{ id: string, units: string[] }[]} */
  const referred = [];
  let consistent = 0;

  for (const [id, group] of byId) {
    const units = [...new Set(group.map((claim) => claim.unit.trim().toLowerCase()))].sort();
    // Checked before the units branch. An id that contradicts itself **within** a unit is a real
    // contradiction whether or not some third entry also used a different unit — deferring the
    // whole id to review because one entry was in other units would let a genuine conflict hide
    // behind an unrelated one.
    /** @type {Set<string>} */
    const conflicting = new Set();
    for (const unit of units) {
      const values = [
        ...new Set(
          group.filter((claim) => claim.unit.trim().toLowerCase() === unit).map((claim) => normalizeValue(claim.value)),
        ),
      ].sort();
      if (values.length > 1) {
        contradicted.push({ id, unit, values });
        conflicting.add(unit);
      }
    }
    if (conflicting.size > 0) continue;
    if (units.length > 1) {
      referred.push({ id, units });
      continue;
    }
    consistent += 1;
  }

  return { contradicted, referred, consistent };
}

/**
 * The gate the driver runs. In-process and driver-owned, for the reason the citation gate is.
 *
 * @param {string} root
 * @returns {{ name: string, ok: boolean, status: number, detail: string }}
 */
export function claimsGate(root) {
  /** @type {string} */
  let raw;
  try {
    raw = readFileSync(path.join(root, CLAIMS_MANIFEST), 'utf8');
  } catch {
    return {
      name: 'claims',
      ok: false,
      status: 1,
      detail:
        `no ${CLAIMS_MANIFEST} at the repository root. An artifact that asserts no values is legitimate, but ` +
        `that is a claim rather than a missing file: declare {"version": 1, "claims": []} and the gate passes.`,
    };
  }

  /** @type {Claim[]} */
  let claims;
  try {
    claims = parseClaims(raw);
  } catch (error) {
    return { name: 'claims', ok: false, status: 1, detail: error instanceof Error ? error.message : String(error) };
  }

  // A claim must point somewhere real. This is not a check that the prose says the number — a
  // value written `42%` here is legitimately written "forty-two percent" there — it is a check
  // that the manifest is about this artifact at all.
  /** @type {string[]} */
  const unreadable = [];
  for (const claim of claims) {
    if (path.isAbsolute(claim.statedIn) || claim.statedIn.split(/[\\/]/).includes('..')) {
      unreadable.push(`${claim.id}: statedIn ${JSON.stringify(claim.statedIn)} escapes the repository`);
      continue;
    }
    try {
      readFileSync(path.join(root, claim.statedIn), 'utf8');
    } catch {
      unreadable.push(`${claim.id}: statedIn ${JSON.stringify(claim.statedIn)} cannot be read`);
    }
  }

  const report = inspectClaims(claims);
  /** @type {string[]} */
  const failures = [
    ...report.contradicted.map(
      (entry) =>
        `${entry.id} is assigned ${entry.values.length} different values in ${JSON.stringify(entry.unit)}: ` +
        entry.values.join(' vs '),
    ),
    ...unreadable,
  ];
  if (failures.length > 0) return { name: 'claims', ok: false, status: 1, detail: failures.join('; ') };

  // Referred entries do not fail. They are the honest half of the boundary: `42 percent` and
  // `0.42 ratio` may be the same number, converting between arbitrary units is guessing, and a
  // gate that failed here would teach authors to write the figure in prose where nothing sees it.
  const referral =
    report.referred.length === 0
      ? ''
      : `; ${report.referred.length} referred to review for stating one claim in more than one unit: ` +
        report.referred.map((entry) => `${entry.id} (${entry.units.join(', ')})`).join(', ');
  return {
    name: 'claims',
    ok: true,
    status: 0,
    detail:
      `${report.consistent} claim${report.consistent === 1 ? '' : 's'} internally consistent${referral}. ` +
      'This is consistency, not correctness: whether each value is right is a question for review.',
  };
}
