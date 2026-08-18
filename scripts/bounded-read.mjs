/**
 * Size boundaries for the files a decision is made from (DESIGN.md §11, REVIEW F19).
 *
 * **What was unbounded.** The shell boundary caps each output stream at 64MB and prompt submission
 * has a character budget, but several file-backed inputs were read whole, synchronously, before
 * either protection applied: the operator's PRD, generated test reports, reviewer evidence files,
 * the review package, and every tracked file hashed for workspace identity. A gate the target
 * controls can write an arbitrarily large report under `.meeseeks/` and the Driver would allocate
 * and parse it on the decision path; a large repository blob was copied whole into memory merely to
 * hash it.
 *
 * The cost is availability and forensic integrity rather than a wrong answer: an overnight run dies
 * without a bounded terminal transition, which is the one thing item 64's receipt exists to prevent.
 *
 * **Two different problems, two different answers.**
 *
 * A file whose *contents* become evidence is refused above its limit. `stat` first, and refuse
 * before allocating, naming the artifact and both sizes — never truncate. A truncated report is a
 * report that parses to fewer tests, and silently reading fewer tests is exactly the evidence
 * laundering the rest of this project exists to stop. Nothing degrades to empty, and nothing
 * degrades to passing.
 *
 * A file that is only *hashed* has no size limit at all, because there is no reason for one: it is
 * streamed, so a 2GB blob costs a 64KB buffer. Refusing to hash a large file would make workspace
 * identity — and therefore the gate cache and the F14 verdict seal — unavailable on repositories
 * that are merely big, which is a worse failure than the one being fixed.
 */

import { createHash } from 'node:crypto';
import { closeSync, createReadStream, openSync, readSync, statSync } from 'node:fs';

/**
 * Limits by artifact class, in bytes.
 *
 * **Chosen from what the consumer can actually use, not from a round number.** The prompt-bound
 * artifacts are capped near the context budget that would reject them anyway, so the refusal
 * arrives with a size in it instead of as a truncated brief. Reports are capped an order of
 * magnitude above the largest committed fixture. None of these is reachable by an honest project;
 * they exist so that a dishonest or broken one fails with a sentence rather than an OOM.
 */
export const READ_LIMITS = {
  /** The operator's PRD, and anything else whose text is handed to a model. */
  specification: 4 * 1024 * 1024,
  /** A test runner's report. `vitest-4.1.10-run1.json` is under 8KB; this is 32MB. */
  report: 32 * 1024 * 1024,
  /** A source file a reviewer cited, read back to check the citation resolves. */
  evidence: 4 * 1024 * 1024,
  /** A driver-owned decision record under `.meeseeks/`. */
  record: 16 * 1024 * 1024,
};

/** Thrown when a decision-bearing artifact is too large to read. */
export class ArtifactTooLargeError extends Error {
  /**
   * @param {string} file
   * @param {number} size
   * @param {number} limit
   */
  constructor(file, size, limit) {
    super(
      `${file} is ${size} bytes, over the ${limit}-byte limit for this kind of input. It is refused rather than ` +
        'truncated: a partly read artifact parses to fewer tests, fewer findings or a shorter document, and acting ' +
        'on that would be acting on evidence nobody produced.',
    );
    this.name = 'ArtifactTooLargeError';
    /** @type {string} */
    this.file = file;
    /** @type {number} */
    this.size = size;
    /** @type {number} */
    this.limit = limit;
  }
}

/**
 * The size of a file, or `null` when it cannot be measured.
 *
 * `null` is not zero. A file that cannot be stat'd has an unknown size, and the caller must not
 * read it on the assumption that unknown means small.
 *
 * @param {string} file
 * @returns {number | null}
 */
export function measure(file) {
  try {
    const stats = statSync(file);
    return stats.isFile() ? stats.size : null;
  } catch {
    return null;
  }
}

/**
 * Read a decision-bearing file, refusing it if it is over the limit.
 *
 * The `stat` happens **before** the read, which is the whole point: a check performed after
 * allocation protects nothing. A file that cannot be measured is read anyway and bounded by the
 * limit afterwards — `stat` failing while `read` succeeds is a race, not a licence, and the second
 * check is what keeps it honest.
 *
 * @param {string} file
 * @param {number} limit one of {@link READ_LIMITS}
 * @returns {string}
 * @throws {ArtifactTooLargeError}
 */
export function readBounded(file, limit) {
  const size = measure(file);
  if (size !== null && size > limit) throw new ArtifactTooLargeError(file, size, limit);
  // **Never allocate past the limit** (REVIEW F19, reopened). The first version stat'd and then read
  // the whole file, so a file that grew between the two — or one `stat` could not size — was fully
  // allocated before the refusal, which is the allocation the limit exists to prevent. Reading into
  // a buffer of exactly `limit + 1` makes the ceiling real rather than checked afterwards: one byte
  // over is enough to know, and no more than that is ever held.
  const descriptor = openSync(file, 'r');
  try {
    const buffer = Buffer.allocUnsafe(limit + 1);
    let read = 0;
    while (read < buffer.length) {
      const got = readSync(descriptor, buffer, read, buffer.length - read, null);
      if (got === 0) break;
      read += got;
    }
    if (read > limit) {
      // The exact size if the filesystem will still say; otherwise the fact that matters, which is
      // that it is over. Never a guess presented as a measurement.
      throw new ArtifactTooLargeError(file, measure(file) ?? read, limit);
    }
    return buffer.subarray(0, read).toString('utf8');
  } finally {
    closeSync(descriptor);
  }
}

/**
 * A digest of a file's bytes, computed without holding the file in memory.
 *
 * No size limit, deliberately. Hashing is the one use where a large file costs nothing but time, so
 * refusing it would make workspace identity unavailable on a repository that is merely big — and
 * workspace identity is what the gate cache and the F14 verdict seal are built on.
 *
 * @param {string} file
 * @param {string} [algorithm]
 * @returns {Promise<string | null>} null when the file cannot be read, which is not a digest
 */
export async function hashFileStreaming(file, algorithm = 'sha256') {
  return new Promise((resolve) => {
    const hash = createHash(algorithm);
    const stream = createReadStream(file, { highWaterMark: 64 * 1024 });
    stream.on('error', () => resolve(null));
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * The same read as {@link readBounded}, off the main thread.
 *
 * For callers already in an async path. The size check is identical and happens first.
 *
 * @param {string} file
 * @param {number} limit
 * @returns {Promise<string>}
 * @throws {ArtifactTooLargeError}
 */
export async function readBoundedAsync(file, limit) {
  // Same ceiling, same reason (REVIEW F19, reopened): the bound is enforced by the size of the
  // buffer rather than by a check after the allocation.
  return readBounded(file, limit);
}
