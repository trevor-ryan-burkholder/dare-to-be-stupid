/**
 * Corrupt-state quarantine (DESIGN.md §4.3, BORROWED R26).
 *
 * Meeseeks reads three files back as *decisions*: the ratchet (`state.json`), the pin store
 * (`pins.json`) and the red-evidence store (`red-evidence.json`). When one of them cannot be
 * parsed, the reader that owns it returns the strictest interpretation — a throw for the ratchet
 * and pins, "no evidence" for red-evidence. This module is the other half of that: the corrupt
 * bytes are preserved, never repaired in place, and the event is announced. A corruption that was
 * quietly swallowed is indistinguishable from a file that was always empty, which is the exact
 * failure R26 exists to close.
 *
 * Two modes, because "preserve the bytes" means different things for the two kinds of reader.
 * For a file whose strict interpretation is a **throw** (the ratchet, the pin store), the bytes are
 * preserved by being **left in place** (`keepInPlace`): the throw is a persistent wall that must
 * refuse every subsequent run, and moving the file would let the next read see `ENOENT` and start
 * from a clean slate — losing the ratchet or the pin store, the fail-open this feature closes. For
 * a file whose strict value is a safe empty (`red-evidence.json`), the bytes are **moved aside** so
 * the original is gone before the next write can overwrite it; the strict empty value is returned
 * on this read and the next alike.
 *
 * The rename is a *positional* neighbour of the file it preserves — `<name>.corrupt-<stamp>` beside
 * `<name>` — so the operator finds the evidence where they lost it. `renameSync` is atomic and
 * `existsSync` guards both the source and a stamp collision, so a second corruption in the same
 * millisecond cannot clobber the first. The stamp is a millisecond integer, not an ISO string, on
 * purpose: an ISO timestamp carries colons, and a colon is not a legal filename character on
 * Windows, where contributors run.
 *
 * The clock lives here and only here. The ratchet and pin modules state that they read no clock,
 * because their *decisions* must be pure; this feature's only clock read is a filename stamp on an
 * error path, and it is kept out of those modules by living in this one. Callers may inject `now`
 * (Date.now shape) to make the quarantine filename deterministic under test; absent it, this
 * module's own `Date.now` supplies it.
 */

import { existsSync, renameSync } from 'node:fs';

/**
 * Move a corrupt decision file aside so its bytes are preserved, and announce it.
 *
 * Best-effort on the move itself and never throwing: a rename that fails (the file vanished, or
 * the directory is read-only) still returns to the caller so the caller's strict interpretation
 * governs. What must not happen is a corruption passing unrecorded, so every path logs.
 *
 * @param {string} file absolute path to the file that would not parse
 * @param {{ now?: number, log?: (line: string) => void, keepInPlace?: boolean }} [options]
 *   `now` is an injectable millisecond clock (Date.now shape) used only to name the quarantine
 *   file; `log` receives the announcement (defaults to stderr, unstyled, per §9).
 *   `keepInPlace` is the mode for files whose strict interpretation is a **throw** (the ratchet,
 *   the pin store): the file must NOT be moved, because the throw is a persistent wall that must
 *   refuse *every* subsequent run until the operator resolves it — moving it aside would let the
 *   next read see `ENOENT` and return a clean slate, the exact fail-open R26 exists to close. In
 *   that mode the bytes are preserved by being left exactly where they are, and the corruption is
 *   only announced. The default (move) is for a file whose strict value is a safe empty
 *   (`red-evidence.json`), where the original must go so the next write cannot overwrite it.
 * @returns {string | null} the path the file was moved to, or null when it was left in place or
 *   could not be moved
 */
export function quarantineCorruptFile(file, options = {}) {
  const log = options.log ?? ((line) => process.stderr.write(`${line}\n`));
  if (!existsSync(file)) {
    log(
      `meeseeks: ${file} could not be parsed and no longer exists to quarantine; ` +
        'reading the strictest interpretation.',
    );
    return null;
  }
  if (options.keepInPlace) {
    // Left where it is on purpose: the reader's strict interpretation is a throw, and the throw is
    // only a wall while the file stays put and re-throws on every read. Moving it would let the
    // next run start from a clean slate — losing the ratchet's protection or the pin store — which
    // is the fail-open this feature exists to prevent. The bytes are preserved by not touching them.
    log(
      `meeseeks: ${file} could not be parsed; left in place and reading the strictest interpretation. ` +
        'Every run will refuse until it is resolved — nothing was repaired or defaulted silently.',
    );
    return null;
  }
  const stamp = typeof options.now === 'number' && Number.isFinite(options.now) ? options.now : Date.now();
  let target = `${file}.corrupt-${stamp}`;
  // A same-millisecond collision is essentially impossible on this path, but the second corruption
  // must not silently overwrite the first — that would defeat the point of preserving evidence.
  let counter = 1;
  while (existsSync(target)) {
    target = `${file}.corrupt-${stamp}-${counter}`;
    counter += 1;
  }
  try {
    renameSync(file, target);
  } catch (error) {
    log(
      `meeseeks: ${file} could not be parsed and could not be moved aside ` +
        `(${/** @type {Error} */ (error).message}); leaving it in place and reading the strictest interpretation.`,
    );
    return null;
  }
  log(
    `meeseeks: ${file} could not be parsed; quarantined to ${target}. ` +
      'Reading the strictest interpretation — nothing was repaired in place or defaulted silently.',
  );
  return target;
}
