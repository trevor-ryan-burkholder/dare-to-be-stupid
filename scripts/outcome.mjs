/**
 * The terminal receipt, written once and atomically (DESIGN.md §3.5, REVIEW F10).
 *
 * **Why the file exists at all.** `run.json` records what a run *was*, at its start. Nothing
 * recorded how it **ended**, and the terminal state lived only in stdout. Dogfood run 4 is the
 * proof that this is not hypothetical: its log was inside the tree, `git add -A` tracked it, and the
 * ratchet's own `git reset --hard` reverted it — worse, git *replaces* the file, so the shell's open
 * descriptor pointed at an unlinked inode and every line after the reset went nowhere. That run's
 * terminal state had to be reconstructed from `.meeseeks/`, `git log` and the reflog.
 *
 * **Why it moved out of `driveRun`** (REVIEW F10). The "one door" was one door into the *loop*. A
 * run that died before the loop — a PRD author that failed, an unreadable capability declaration,
 * an Oracle that would not parse, a component that aborted, an unexpected exception after the lock
 * — printed `ABORTED` and returned without leaving any receipt at all. Those are paid failures: a
 * parent component correctly refuses to trust a child with no receipt, and its operator then cannot
 * recover the child's state or its spend from the artifact that promised both. So the writer lives
 * here, where every terminal path can reach it, rather than inside the one phase that always did.
 *
 * **Why atomic.** It was a direct `writeFileSync` over the existing file. A kill during that write
 * destroys the only durable record of a completed run and leaves truncated JSON in its place, which
 * a reader cannot tell from a run that ended badly. Temp-plus-rename means an interrupted write
 * leaves the previous complete receipt or nothing — never half of one. The same rule the ratchet,
 * the pins and the red-evidence store already follow, for the same reason: these are
 * decision-bearing files that outlive the process.
 *
 * **Why failing to write is not failing the run.** This is forensics. Destroying a completed run's
 * result because its receipt could not be filed would be the wrong way round, so a write failure is
 * reported loudly and the terminal state already reached stands.
 */

import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** The receipt's filename inside `.meeseeks/`. */
export const OUTCOME_FILE = 'outcome.json';

/**
 * @typedef {{
 *   state: 'SHIPPED' | 'STALLED' | 'BUDGET' | 'ABORTED',
 *   reason: string,
 *   phase?: string,
 *   iterations?: number,
 *   spentTokens?: number,
 *   costUsd?: number,
 *   passing?: string[],
 *   workspace?: string | null
 * }} TerminalReceipt
 *
 * Everything but `state` and `reason` is optional **and absent rather than zero when unknown**.
 * A pre-loop abort has no iteration count and may have no panel identity; writing `0` and `null`
 * would state facts the run never established, and F10 asks for known spend recorded honestly
 * rather than unavailable usage invented.
 */

/**
 * Write the terminal receipt, atomically, at most once per run.
 *
 * The at-most-once rule matters as much as the atomicity: the loop's own `finish` and the outer
 * exception handler can both be reached on the way out of one run, and the *first* answer is the
 * decided one. A later writer would overwrite a specific terminal state with a generic one.
 *
 * @param {string} meeseeksDir
 * @param {TerminalReceipt} receipt
 * @param {{ now: () => string, log: (line: string) => void, written?: { done: boolean } }} io
 *   `written` is the run's own at-most-once flag; omit it in a caller that owns exactly one exit.
 * @returns {boolean} true when this call wrote the receipt
 */
export function writeRunOutcome(meeseeksDir, receipt, io) {
  if (io.written?.done === true) return false;
  if (io.written !== undefined) io.written.done = true;
  const file = path.join(meeseeksDir, OUTCOME_FILE);
  const temporary = `${file}.tmp`;
  try {
    mkdirSync(meeseeksDir, { recursive: true });
    writeFileSync(temporary, `${JSON.stringify({ version: 1, endedAt: io.now(), ...receipt }, null, 2)}\n`, 'utf8');
    renameSync(temporary, file);
    return true;
  } catch (error) {
    io.log(`could not write ${OUTCOME_FILE}: ${/** @type {Error} */ (error).message}`);
    return false;
  }
}
