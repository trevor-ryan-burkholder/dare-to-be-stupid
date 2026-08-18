/**
 * The specification a run is held to, captured once and checked afterwards (REVIEW F12).
 *
 * **Stable IDs do not preserve stable intent, and that was the hole.** The Driver read `PRD.md`
 * once, derived `requiredIds` from it, and then kept only those strings. The Builder has
 * unrestricted repository writes; the cold Panel is later told to read the *live* `PRD.md`; and the
 * post-Panel commit stages every live path. Nothing ever compared the specification's bytes with
 * the version the requirement set and the held-out Oracle were derived from.
 *
 * Codex demonstrated the consequence: a Builder replaced the *text* of `PRD-1.1` with an easier
 * requirement while keeping the ID, gates passed, the report passed, and `driveRun` returned
 * `SHIPPED` — with the mutated PRD still authoritative. An independent Panel had faithfully
 * certified the wrong specification. Every other guarantee in this system is downstream of *which
 * document* is being judged, so a run that cannot say which one it is judging has no guarantees at
 * all.
 *
 * What this module owns is deliberately narrow: capture the canonical revision before any role
 * reads it, and answer "is the working copy still that revision" for anyone who asks. The
 * *response* to drift belongs to the Driver, because ending a run is a Driver decision.
 *
 * **The digest is of the exact bytes**, not of a parse. A byte that changes nothing a parser would
 * notice still changes the document a reviewer reads, and F12's own acceptance line is "changes one
 * byte".
 *
 * Nothing here defaults to pass. A record that is missing, unreadable, malformed or truncated
 * throws, because a run that cannot establish which specification it captured cannot establish that
 * the working copy still matches it — and "I could not check" is not "it is fine".
 */

import { createHash } from 'node:crypto';
import { existsSync, renameSync, writeFileSync } from 'node:fs';

import { READ_LIMITS, readBounded } from './bounded-read.mjs';
import path from 'node:path';

/** Where the captured revision lives inside `.meeseeks/`. */
export const SPECIFICATION_FILE = 'specification.json';

/** The record's own schema version, bumped when a field's meaning changes. */
const RECORD_VERSION = 1;

/** @typedef {{ version: number, file: string, digest: string, bytes: number, capturedAt: string }} SpecificationRevision */

/** Thrown when a specification revision cannot be established. */
export class SpecificationError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'SpecificationError';
  }
}

/**
 * The canonical digest of a specification's exact bytes.
 *
 * @param {string} contents
 * @returns {string} `sha256:<hex>`
 */
export function specificationDigest(contents) {
  return `sha256:${createHash('sha256').update(contents, 'utf8').digest('hex')}`;
}

/**
 * Capture the revision this run is held to.
 *
 * Returns the bytes as well as the record, so the caller derives requirement IDs from *the thing it
 * just digested* rather than from a second read of a file that could have changed in between. That
 * is not paranoia about a millisecond; it is the difference between an identity and a coincidence.
 *
 * @param {{ meeseeksDir: string, root: string, file?: string, now?: () => string }} options
 * @returns {{ revision: SpecificationRevision, contents: string }}
 */
export function captureSpecification(options) {
  const file = options.file ?? 'PRD.md';
  const full = path.join(options.root, file);
  let contents;
  try {
    // Bounded (REVIEW F19): the specification is operator-supplied and prompt-bound.
    contents = readBounded(full, READ_LIMITS.specification);
  } catch (error) {
    throw new SpecificationError(
      `the specification ${file} could not be read (${/** @type {Error} */ (error).message}), so this run has ` +
        'nothing to be held to.',
    );
  }
  /** @type {SpecificationRevision} */
  const revision = {
    version: RECORD_VERSION,
    file,
    digest: specificationDigest(contents),
    bytes: Buffer.byteLength(contents, 'utf8'),
    capturedAt: options.now === undefined ? new Date().toISOString() : options.now(),
  };
  const target = path.join(options.meeseeksDir, SPECIFICATION_FILE);
  const temporary = `${target}.tmp`;
  // Written through a temporary file and renamed, so a reader never sees half a record — the same
  // discipline the run lock takes, for the same reason.
  writeFileSync(temporary, `${JSON.stringify(revision, null, 2)}\n`, 'utf8');
  renameSync(temporary, target);
  return { revision, contents };
}

/**
 * The revision this run captured.
 *
 * Throws rather than returning null on anything it cannot establish. The two answers are not
 * interchangeable: an absent or unreadable record is not evidence that the specification is
 * unchanged, and treating it as one would restore the defect this module exists for.
 *
 * @param {string} meeseeksDir
 * @returns {SpecificationRevision}
 */
export function readSpecification(meeseeksDir) {
  const target = path.join(meeseeksDir, SPECIFICATION_FILE);
  if (!existsSync(target)) {
    throw new SpecificationError(
      `${path.join('.meeseeks', SPECIFICATION_FILE)} is missing, so this run cannot say which specification it ` +
        'was started against.',
    );
  }
  let parsed;
  try {
    // Bounded (REVIEW F19, reopened). Driver-owned, but under `.meeseeks/` in a repository the
    // operator also edits, and it is parsed on the decision path every iteration.
    parsed = JSON.parse(readBounded(target, READ_LIMITS.record));
  } catch (error) {
    throw new SpecificationError(
      `${path.join('.meeseeks', SPECIFICATION_FILE)} could not be read as JSON ` +
        `(${/** @type {Error} */ (error).message}). It records which specification this run is held to.`,
    );
  }
  const file = typeof parsed?.file === 'string' && parsed.file !== '' ? parsed.file : '';
  const digest = typeof parsed?.digest === 'string' && parsed.digest !== '' ? parsed.digest : '';
  if (file === '' || digest === '') {
    throw new SpecificationError(
      `${path.join('.meeseeks', SPECIFICATION_FILE)} names no specification file and digest, so it establishes ` +
        'no revision.',
    );
  }
  return {
    version: typeof parsed.version === 'number' ? parsed.version : 0,
    file,
    digest,
    bytes: typeof parsed.bytes === 'number' ? parsed.bytes : 0,
    capturedAt: typeof parsed.capturedAt === 'string' ? parsed.capturedAt : '',
  };
}

/**
 * Is the working copy still the revision this run captured?
 *
 * @param {{ meeseeksDir: string, root: string }} options
 * @returns {{ ok: boolean, digest: string, detail: string }}
 */
export function verifySpecification(options) {
  const revision = readSpecification(options.meeseeksDir);
  const full = path.join(options.root, revision.file);
  let contents;
  try {
    // Bounded (REVIEW F19): the specification is operator-supplied and prompt-bound.
    contents = readBounded(full, READ_LIMITS.specification);
  } catch {
    return {
      ok: false,
      digest: revision.digest,
      detail:
        `${revision.file} is the specification this run was started against and it can no longer be read. ` +
        'A run cannot be judged against a document that is not there.',
    };
  }
  const current = specificationDigest(contents);
  if (current === revision.digest) return { ok: true, digest: revision.digest, detail: `${revision.file} unchanged` };
  return {
    ok: false,
    digest: revision.digest,
    detail:
      `${revision.file} has changed since this run captured it: ${revision.digest} became ${current}. ` +
      'Requirement ids are stable across an edit like this and intent is not, so the panel would be judging a ' +
      'different finish line from the one the run started against. Review the change; if it is the objective you ' +
      'want, commit it and start a new run, which authors a fresh oracle and fresh review evidence against it.',
  };
}
