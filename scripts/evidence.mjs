/**
 * Reviewer citations, resolved against the tree that was actually reviewed (REVIEW F6).
 *
 * **"Evidence required" had quietly become "evidence-shaped text required."** DESIGN.md §4 says a
 * `pass` requires the reviewer to personally locate the code and cite `path/file.ts:LINE`, and the
 * parser enforced the *shape* of that string and nothing else. It never established that the path
 * was inside the repository under review, that the file existed, or that the line did. A one-entry
 * report citing `does/not/exist.ts:999999` parsed with no problems at all: `parseReviewerReport`
 * returned `verdict: "pass"` and `combinePanel` agreed. Downstream pinning was best-effort by
 * design — a missing file skipped the pin, an out-of-range line pinned the whole file — so nothing
 * between the reviewer and `SHIPPED` ever asked whether the citation was real.
 *
 * A hallucinated, stale, traversal-based or out-of-range citation could therefore satisfy the cold
 * Panel contract, which is the central invariant inverted: nothing defaults to pass, and a location
 * nobody can open is not evidence that anything was located.
 *
 * This module is the boundary. It is deliberately filesystem-aware and deliberately separate from
 * `parseReviewerReport`, which stays pure: the parser judges a *document*, and only the Driver
 * knows which tree the document is supposed to describe.
 *
 * **What it refuses, and why each is its own rule rather than a consequence of another:**
 *
 * - an absolute path, because it names a file outside the review's frame of reference even when
 *   one happens to be there;
 * - a `..` segment, before any resolution, because a traversal that lands back inside the root is
 *   still a citation about somewhere else;
 * - a resolved path outside the root, which is what catches a symlink inside the repository
 *   pointing out of it — the case no string check can see;
 * - anything that is not a readable regular file, so a directory cannot stand in for a line of
 *   code;
 * - a line that is zero, negative, past the end of the file, or blank. A blank line is the one
 *   people argue about: it is refused because "the code is at line 42" is a claim about code, and
 *   an empty line is the cheapest possible way for a plausible number to be wrong.
 *
 * The line number stays a *locator*. Content identity remains the durable pin (`pins.mjs`), and
 * nothing here changes that — a file whose contents move a line down has not lost its evidence.
 */

import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

/** @typedef {{ ok: true, file: string, line: number } | { ok: false, reason: string }} Resolution */

/**
 * Split a citation into its path and its line.
 *
 * The last colon separates them, so a path that somehow contains one still parses the way a reader
 * would read it. A citation with no colon, or with a line that is not a plain positive integer, is
 * not a citation.
 *
 * @param {string} citation
 * @returns {{ file: string, line: number } | null}
 */
export function splitCitation(citation) {
  const at = citation.lastIndexOf(':');
  if (at <= 0 || at === citation.length - 1) return null;
  const file = citation.slice(0, at);
  const rawLine = citation.slice(at + 1);
  if (!/^\d+$/.test(rawLine)) return null;
  const line = Number(rawLine);
  if (!Number.isSafeInteger(line)) return null;
  return { file, line };
}

/**
 * Is this path repository-relative and free of traversal?
 *
 * Checked on the raw string, before anything touches the disk. `path.isAbsolute` is
 * platform-dependent, so a POSIX driver would not recognise `C:\x` as absolute — both shapes are
 * refused explicitly, because a report is a document that can have come from anywhere.
 *
 * @param {string} file
 * @returns {string} the empty string when it is acceptable, otherwise the reason it is not
 */
export function citationPathProblem(file) {
  if (file === '') return 'the citation names no file';
  if (path.isAbsolute(file) || file.startsWith('/') || file.startsWith('\\')) {
    return 'the citation is an absolute path; evidence must be relative to the repository being reviewed';
  }
  if (/^[A-Za-z]:[\\/]/.test(file)) {
    return 'the citation is a drive-qualified absolute path; evidence must be relative to the repository being reviewed';
  }
  const segments = file.split(/[\\/]/);
  if (segments.includes('..')) {
    return 'the citation traverses out of the repository with `..`';
  }
  return '';
}

/**
 * Resolve one citation against the tree that was reviewed.
 *
 * @param {string} root the exact repository root the reviewer read
 * @param {string} citation `path/file.ext:LINE`
 * @returns {Resolution}
 */
export function resolveCitation(root, citation) {
  const split = splitCitation(citation);
  if (split === null) return { ok: false, reason: 'the citation is not a `path/file.ext:LINE` location' };
  const pathProblem = citationPathProblem(split.file);
  if (pathProblem !== '') return { ok: false, reason: pathProblem };
  if (split.line < 1) return { ok: false, reason: `line ${split.line} is not a line number` };

  // `realpathSync` on both sides, so a symlinked repository root compares against itself rather
  // than against the path it happens to be reached by. A root that cannot be resolved is a refusal
  // and not a pass: an unreadable tree is not evidence that the citation is fine.
  let realRoot;
  try {
    realRoot = realpathSync(root);
  } catch {
    return { ok: false, reason: `the reviewed repository root ${root} could not be resolved` };
  }
  // Separators normalised to this platform's, so a citation authored on Windows resolves on a
  // POSIX driver and the other way round. Contributors run this on WSL, macOS and Windows, and a
  // reviewer's `src\app.ts` is the same location as `src/app.ts` — treating it as a filename
  // containing a backslash would refuse real evidence. Traversal is already refused above, on the
  // raw string and by segment, so this cannot open one.
  const resolved = path.resolve(realRoot, split.file.split(/[\\/]/).join(path.sep));

  let real;
  try {
    real = realpathSync(resolved);
  } catch {
    return { ok: false, reason: 'no such file in the repository under review' };
  }
  // The containment check happens *after* `realpathSync`, which is the whole point: a symlink
  // inside the repository pointing outside it passes every string test and fails this one.
  const relative = path.relative(realRoot, real);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    return { ok: false, reason: 'the citation resolves outside the repository under review' };
  }

  let stats;
  try {
    stats = statSync(real);
  } catch {
    return { ok: false, reason: 'no such file in the repository under review' };
  }
  if (!stats.isFile()) return { ok: false, reason: 'the citation names something that is not a regular file' };

  let contents;
  try {
    contents = readFileSync(real, 'utf8');
  } catch {
    return { ok: false, reason: 'the cited file could not be read' };
  }
  const lines = contents.split('\n');
  // A trailing newline produces a final empty element that is not a line anyone can cite.
  const count = lines.length > 0 && lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
  if (split.line > count) {
    return { ok: false, reason: `line ${split.line} is past the end of the file, which has ${count} line(s)` };
  }
  if (lines[split.line - 1].trim() === '') {
    return { ok: false, reason: `line ${split.line} is blank, so it cites no code` };
  }
  return { ok: true, file: split.file, line: split.line };
}
