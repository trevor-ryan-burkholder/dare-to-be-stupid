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
 *
 * **The branch that repair did not treat as a failure** (REVIEW F32). "Remove first, require
 * presence after" only means something for a path the removal actually reached. `clearReports`
 * always returned the paths it could not remove, and callers logged them and ran the gate anyway —
 * so a locked or otherwise unremovable *old passing* report survived, the gate exited zero without
 * replacing it, and F16's own argument then certified it as this attempt's evidence. That is the
 * laundering F16 exists to stop, arriving through the one door F16 left open.
 *
 * The repair is structural rather than another rule to remember: **collection takes the clear's
 * outcome as a required argument.** A caller cannot read a report without stating whether the path
 * it came from was cleared, and a caller that supplies nothing, or a record that is not a clear
 * outcome, is refused rather than defaulted — a missing answer is not the answer "nothing was
 * stuck". The outcome is **bound to the paths**, too: a path the record does not account for is
 * uncleared, so a clear outcome for some other set cannot be handed in to satisfy the signature.
 * Enumerating the callers instead would have re-opened the moment somebody added the next one,
 * which is exactly how the guard hook's original defect worked.
 *
 * The refusal is **the whole attempt, not the stuck path alone**, and that breadth is deliberate.
 * Ids are collapsed across every report by worst status, so a survivor contributes passes the other
 * files have no way to contradict; and dropping only the stuck path would hand the ratchet a set
 * missing every id that path owned, which reads as a mass regression and resets the tree. Refusing
 * everything costs one re-run. A false reset costs the iteration's work.
 */

import { lstatSync, readFileSync, rmSync } from 'node:fs';

/**
 * @typedef {{ cleared: string[], stuck: string[] }} ClearOutcome
 *   what `clearReports` said about the same paths, for the same attempt
 */

/**
 * Remove the expected report artifacts so that presence afterwards means production.
 *
 * Silent about paths that are not there — the first attempt of a run finds none of them, and a
 * missing file is the state this is trying to reach. A path that cannot be removed is returned so
 * the caller can say so; it is not thrown, because failing a run over a stale artifact it can
 * simply refuse later would be the wrong end to fail at.
 *
 * @param {string[]} files absolute paths the toolchain declares it writes
 * @returns {ClearOutcome}
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
 * @param {unknown} value
 * @returns {value is string[]}
 */
function isPathList(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

/**
 * Which of `files` this attempt cannot vouch for having cleared.
 *
 * Two ways to land here, and they are the same fact. A path the clear **reported stuck** was not
 * removed. A path the clear **says nothing about** was not removed either as far as anyone here
 * knows — and that second case is what makes the argument bind: a clear outcome for some other set
 * of paths is not a clear outcome for these. Without it "required argument" would be a gesture, a
 * caller could satisfy the signature with any record at all, and the guarantee would be nominal.
 *
 * Throws on a record that is not a clear outcome, rather than defaulting. `collectReports` is the
 * last thing standing between a surviving report and the ratchet, and "the caller told me nothing
 * legible" is not evidence that the paths were cleared. The typecheck rejects a missing or
 * mis-shaped argument at build time; this catches the caller the typecheck does not see.
 *
 * @param {string[]} files the paths about to be collected
 * @param {ClearOutcome} cleared
 * @returns {string[]} in `files` order, deduplicated
 */
function unclearedPaths(files, cleared) {
  const record = /** @type {{ cleared?: unknown, stuck?: unknown }} */ (cleared ?? {});
  if (!isPathList(record.stuck) || !isPathList(record.cleared)) {
    throw new Error(
      'collectReports needs the clear outcome for the same attempt: a report cannot be read as this ' +
        "attempt's evidence without knowing whether its path was cleared first (REVIEW F32)",
    );
  }
  const stuck = new Set(record.stuck);
  const accounted = new Set([...record.cleared, ...record.stuck]);
  return [...new Set(files.filter((file) => stuck.has(file) || !accounted.has(file)))];
}

/**
 * Read the reports this attempt produced.
 *
 * @param {string[]} files absolute paths the toolchain declares it writes
 * @param {ClearOutcome} cleared what `clearReports` returned for these same paths, this attempt
 * @returns {{ contents: string[], produced: string[], missing: string[], irregular: string[],
 *   uncleared: string[] }} `uncleared` is non-empty exactly when the attempt was refused, and
 *   every other list is then empty
 */
export function collectReports(files, cleared) {
  const uncleared = unclearedPaths(files, cleared);
  // Refused before a single path is stat'd. Nothing here is this attempt's, and reading the ones
  // that happen to be fresh would produce a partial set that is worse than none (see the header).
  if (uncleared.length > 0) return { contents: [], produced: [], missing: [], irregular: [], uncleared };
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
  return { contents, produced, missing, irregular, uncleared };
}
