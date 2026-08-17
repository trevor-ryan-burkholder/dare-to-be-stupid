/**
 * Test reports, bound to the attempt that produced them (REVIEW F16).
 *
 * **A report that is merely *present* is not a report that was *produced*.** The expected paths are
 * fixed — the toolchain declares them and every gate attempt writes to the same ones — so a unit
 * gate that crashed, timed out, or failed before writing anything left the *previous* attempt's
 * passing report on disk, and everything downstream read it as this attempt's evidence.
 *
 * Codex reproduced the worst instance. The ratchet's only permitted escape from a regression is the
 * scoped restore, which is deliberately *verified rather than trusted*: it re-runs the gates and
 * checks that the regressed ids came back. The verification gate failed and wrote no report, the
 * previous passing report was still there, the Driver logged `scoped restore held`, skipped the
 * full reset, and left `src/core.js` containing `broken`. The one mechanism that makes a narrow
 * restore safe had confirmed itself from a file that predated it.
 *
 * The repair here is deliberately the boring one: **remove the expected artifacts before the
 * attempt runs, and require a regular file to be there afterwards.** Absence then means "this
 * attempt produced nothing", which is a fact rather than an inference, and no clock, nonce or
 * mtime comparison is involved — mtime granularity is a filesystem property and a freshness test
 * that can be wrong on a coarse one is worse than none.
 *
 * A path that exists but is not a regular file — a directory a tool created, a dangling symlink —
 * is refused rather than read, for the same reason: it is not evidence, and reading whatever it
 * resolves to would be guessing.
 */

import { lstatSync, readFileSync, rmSync } from 'node:fs';

/**
 * Remove the expected report artifacts so that presence afterwards means production.
 *
 * Silent about paths that are not there — the first attempt of a run finds none of them, and a
 * missing file is the state this is trying to reach. A path that cannot be removed is returned so
 * the caller can say so; it is not thrown, because failing a run over a stale artifact it can
 * simply refuse later would be the wrong end to fail at.
 *
 * @param {string[]} files absolute paths the toolchain declares it writes
 * @returns {{ cleared: string[], stuck: string[] }}
 */
export function clearReports(files) {
  /** @type {string[]} */
  const cleared = [];
  /** @type {string[]} */
  const stuck = [];
  for (const file of files) {
    try {
      rmSync(file, { force: true, recursive: true });
      cleared.push(file);
    } catch {
      stuck.push(file);
    }
  }
  return { cleared, stuck };
}

/**
 * Read the reports this attempt produced.
 *
 * @param {string[]} files absolute paths the toolchain declares it writes
 * @returns {{ contents: string[], produced: string[], missing: string[], irregular: string[] }}
 */
export function collectReports(files) {
  /** @type {string[]} */
  const contents = [];
  /** @type {string[]} */
  const produced = [];
  /** @type {string[]} */
  const missing = [];
  /** @type {string[]} */
  const irregular = [];
  for (const file of files) {
    /** @type {import('node:fs').Stats} */
    let stats;
    try {
      // `lstat`, not `stat`: a symlink where a report should be is not a report this attempt
      // wrote, whatever it points at.
      stats = lstatSync(file);
    } catch {
      missing.push(file);
      continue;
    }
    if (!stats.isFile()) {
      irregular.push(file);
      continue;
    }
    try {
      contents.push(readFileSync(file, 'utf8'));
      produced.push(file);
    } catch {
      irregular.push(file);
    }
  }
  return { contents, produced, missing, irregular };
}
