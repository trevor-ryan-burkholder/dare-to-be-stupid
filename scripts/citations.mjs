/**
 * The citation resolver (`DESIGN.md` §3.8.4, `PLAN.md` item 49).
 *
 * Item 49's flagship prose gate, and the one that makes an artifact job *checkable* rather than
 * merely produced. It answers exactly one question, deterministically:
 *
 * > **Does the quoted text really appear in the source it names, and in the manuscript that
 * > claims to use it?**
 *
 * ## What it does not answer, stated here because the temptation is constant
 *
 * It does **not** prove the source supports the claim. It does not prove the claim is true. It
 * does not prove the source is credible, current, or relevant. Those are the cold panel's
 * judgment, on evidence, and no result from this module may be rendered as though it settled
 * them. The honest sentence is *the quotation is faithful and traceable* — never *verified*.
 *
 * That distinction is why this gate is **driver-owned and in-process** rather than a check the
 * builder writes. A builder asked to make a citation gate pass writes a lenient resolver; a
 * builder asked to make a citation gate pass that it cannot edit writes accurate citations.
 *
 * ## Why the manifest is declared and its absence is a failure
 *
 * A prose artifact that cites nothing is legitimate — fiction, a design document, a plan. But
 * *"this artifact cites nothing"* is a claim somebody makes, not a fact inferred from a missing
 * file, and the two are indistinguishable from outside. An absent manifest therefore fails and
 * says how to fix it; an **empty** manifest passes and records that the artifact declared it
 * cites nothing. This is the same declared-not-detected rule §3.8.2 applies to the toolchain,
 * for the same reason: a silence and a statement are different, and only one of them is
 * evidence.
 *
 * ## Fail-closed, everywhere
 *
 * A missing source package, a malformed one, a digest that does not match the bytes it claims
 * to describe, an unreadable manuscript file, a duplicate citation id — every one of these is a
 * **failure**, not a skip and not a pass with a note. The reason is §4's rule and it is sharper
 * here than usual: an unfetchable source is the exact shape of a fabricated one, so a resolver
 * that shrugs at it certifies precisely the artifact it exists to catch.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** The artifact's declaration of every source it quotes. Repository-relative. */
export const CITATION_MANIFEST = 'citations.json';

/** Where a captured source package lives, relative to the repository root. */
export const SOURCE_DIR = 'sources';

/**
 * Collapse runs of whitespace and trim.
 *
 * **Whitespace only, and the restraint is the point.** Prose wraps, so a quotation that is one
 * line in the source and three in the manuscript is the same quotation and must match. Anything
 * further — folding case, stripping punctuation, normalizing quotation marks — starts letting
 * genuine misquotes through, and a misquote is the failure this gate exists to catch. Two texts
 * that differ only in where the lines break are the same text; two that differ in a word are not.
 *
 * @param {string} text
 * @returns {string}
 */
export function normalize(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/** Thrown when the citation manifest cannot be read as a manifest. */
export class CitationError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'CitationError';
  }
}

/**
 * @typedef {{ id: string, source: string, locator: string, quote: string, usedIn: string }} Citation
 */

/**
 * Read and validate the manifest.
 *
 * Every field is required and must be a non-empty string. An optional field here would be a
 * citation that resolves against less than it claimed, and the omission would be invisible.
 *
 * @param {string} text the manifest's bytes
 * @returns {Citation[]}
 * @throws {CitationError} on anything that is not a well-formed manifest
 */
export function parseManifest(text) {
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new CitationError(`${CITATION_MANIFEST} is not valid JSON: ${error instanceof Error ? error.message : error}`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new CitationError(`${CITATION_MANIFEST} must be a JSON object with a "citations" array`);
  }
  const record = /** @type {Record<string, unknown>} */ (parsed);
  if (record.version !== 1) {
    throw new CitationError(`${CITATION_MANIFEST} must declare "version": 1; got ${JSON.stringify(record.version)}`);
  }
  if (!Array.isArray(record.citations)) {
    throw new CitationError(`${CITATION_MANIFEST} must declare a "citations" array, even when it is empty`);
  }

  /** @type {Citation[]} */
  const citations = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const [index, entry] of record.citations.entries()) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new CitationError(`citation ${index} is not an object`);
    }
    const fields = /** @type {Record<string, unknown>} */ (entry);
    /** @type {Record<string, string>} */
    const checked = {};
    for (const name of ['id', 'source', 'locator', 'quote', 'usedIn']) {
      const value = fields[name];
      if (typeof value !== 'string' || value.trim() === '') {
        throw new CitationError(
          `citation ${index} needs a non-empty string "${name}"; got ${JSON.stringify(value)}. ` +
            'Every field is required: a citation missing one resolves against less than it claims to.',
        );
      }
      checked[name] = value;
    }
    // A duplicate id is refused rather than deduplicated, because two entries under one id is a
    // manifest whose author believed two different things, and picking either is a guess.
    if (seen.has(checked.id)) throw new CitationError(`citation id ${JSON.stringify(checked.id)} is declared twice`);
    seen.add(checked.id);
    citations.push(/** @type {Citation} */ (/** @type {unknown} */ (checked)));
  }
  return citations;
}

/**
 * @typedef {{ id: string, origin: string, retrievedAt: string, digest: string, text: string }} SourcePackage
 */

/**
 * Read a captured source package and check its bytes against the digest it carries.
 *
 * The digest is not ceremony. A source package is *retained evidence* — the version the artifact
 * was written against — and a captured text that no longer matches its own digest has either
 * been edited after capture or was never captured correctly. Either way the artifact's claim to
 * be traceable is void, and this is the only place that can notice.
 *
 * @param {string} root the repository root
 * @param {string} id the source id a citation names
 * @returns {{ ok: true, source: SourcePackage } | { ok: false, reason: string }}
 */
export function loadSourcePackage(root, id) {
  // Refused before it is joined. A source id is manifest data, so `../../etc/passwd` is reachable
  // from it, and this runs inside the operator's repository.
  if (id.includes('/') || id.includes('\\') || id.includes('..') || path.isAbsolute(id)) {
    return { ok: false, reason: `source id ${JSON.stringify(id)} is not a plain name` };
  }
  const file = path.join(root, SOURCE_DIR, `${id}.json`);
  /** @type {string} */
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return {
      ok: false,
      reason: `source ${JSON.stringify(id)} has no captured package at ${SOURCE_DIR}/${id}.json, so the quotation cannot be checked against anything`,
    };
  }
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { ok: false, reason: `source ${JSON.stringify(id)} is not valid JSON: ${error instanceof Error ? error.message : error}` };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: `source ${JSON.stringify(id)} is not a source package object` };
  }
  const fields = /** @type {Record<string, unknown>} */ (parsed);
  /** @type {Record<string, string>} */
  const checked = {};
  for (const name of ['id', 'origin', 'retrievedAt', 'digest', 'text']) {
    const value = fields[name];
    if (typeof value !== 'string' || value === '') {
      return { ok: false, reason: `source ${JSON.stringify(id)} needs a non-empty string "${name}"` };
    }
    checked[name] = value;
  }
  if (checked.id !== id) {
    return { ok: false, reason: `source ${JSON.stringify(id)} declares itself ${JSON.stringify(checked.id)}` };
  }
  const actual = `sha256:${createHash('sha256').update(checked.text, 'utf8').digest('hex')}`;
  if (actual !== checked.digest) {
    return {
      ok: false,
      reason: `source ${JSON.stringify(id)} does not match its own digest; the captured text was changed after capture (declared ${checked.digest}, actual ${actual})`,
    };
  }
  return { ok: true, source: /** @type {SourcePackage} */ (/** @type {unknown} */ (checked)) };
}

/**
 * @typedef {{ id: string, ok: boolean, reason: string }} CitationResult
 */

/**
 * Check one citation against its source and against the manuscript that claims to use it.
 *
 * The second half is what stops the manifest drifting away from the prose. Without it an author
 * could delete a paragraph and leave its citation behind, and every check would still pass while
 * the artifact no longer said the thing the source was cited for.
 *
 * @param {string} root
 * @param {Citation} citation
 * @returns {CitationResult}
 */
export function resolveCitation(root, citation) {
  const loaded = loadSourcePackage(root, citation.source);
  if (!loaded.ok) return { id: citation.id, ok: false, reason: loaded.reason };

  const quote = normalize(citation.quote);
  if (!normalize(loaded.source.text).includes(quote)) {
    return {
      id: citation.id,
      ok: false,
      reason: `the quoted text does not appear in source ${JSON.stringify(citation.source)} at all; this is a misquote, not a locator disagreement`,
    };
  }

  // Refused before it is joined, for the reason the source id is: this is manifest data naming a
  // path inside the operator's repository.
  if (path.isAbsolute(citation.usedIn) || citation.usedIn.split(/[\\/]/).includes('..')) {
    return { id: citation.id, ok: false, reason: `usedIn ${JSON.stringify(citation.usedIn)} escapes the repository` };
  }
  /** @type {string} */
  let manuscript;
  try {
    manuscript = readFileSync(path.join(root, citation.usedIn), 'utf8');
  } catch {
    return { id: citation.id, ok: false, reason: `usedIn ${JSON.stringify(citation.usedIn)} cannot be read` };
  }
  if (!normalize(manuscript).includes(quote)) {
    return {
      id: citation.id,
      ok: false,
      reason: `the quoted text does not appear in ${JSON.stringify(citation.usedIn)}; the manifest has drifted from the artifact`,
    };
  }

  // The locator is **recorded, not verified**, and saying so is load-bearing. Checking that a
  // quotation really sits at "§3.2" needs a structural model of the source that a captured text
  // does not carry, so this gate requires the locator to be stated and does not claim to have
  // confirmed it. Reporting otherwise would be the exact overclaim this module's header refuses.
  return {
    id: citation.id,
    ok: true,
    reason: `quotation is faithful to source ${JSON.stringify(citation.source)} and present in ${JSON.stringify(citation.usedIn)}; locator ${JSON.stringify(citation.locator)} recorded, not verified`,
  };
}

/**
 * The gate the driver runs. In-process and driver-owned, so a builder cannot soften it.
 *
 * @param {string} root
 * @returns {{ name: string, ok: boolean, status: number, detail: string }}
 */
export function citationsGate(root) {
  /** @type {string} */
  let raw;
  try {
    raw = readFileSync(path.join(root, CITATION_MANIFEST), 'utf8');
  } catch {
    return {
      name: 'citations',
      ok: false,
      status: 1,
      detail:
        `no ${CITATION_MANIFEST} at the repository root. An artifact that cites nothing is legitimate, but ` +
        `that is a claim rather than a missing file: declare {"version": 1, "citations": []} and the gate passes.`,
    };
  }

  /** @type {import('./citations.mjs').Citation[]} */
  let citations;
  try {
    citations = parseManifest(raw);
  } catch (error) {
    return { name: 'citations', ok: false, status: 1, detail: error instanceof Error ? error.message : String(error) };
  }

  if (citations.length === 0) {
    return { name: 'citations', ok: true, status: 0, detail: 'the artifact declares that it cites nothing' };
  }

  const results = citations.map((citation) => resolveCitation(root, citation));
  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    return {
      name: 'citations',
      ok: false,
      status: 1,
      detail: failed.map((result) => `${result.id}: ${result.reason}`).join('; '),
    };
  }
  return {
    name: 'citations',
    ok: true,
    status: 0,
    detail:
      `${results.length} quotation${results.length === 1 ? '' : 's'} faithful to the sources cited and present in ` +
      'the artifact. This is traceability, not support: whether each source bears the claim it is cited for is a ' +
      'question for review.',
  };
}
