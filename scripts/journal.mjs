/**
 * The lifecycle journal: what a killed run leaves behind about its own progress (PLAN.md item 58).
 *
 * ## Narrowed by an experiment, not designed from the item
 *
 * The item proposed run, phase, iteration, child, gate, panel and terminal events. Four of those
 * seven are already answerable from artifacts that exist — `launch.json` says the run started and
 * against which tree, `specification.json` which revision it is held to, `capabilities.json` what
 * design concluded, `supply.json` what each cold role was handed, `briefs/` how many iterations
 * *started*. Re-recording them here would be a second authority for the same fact, which is worse
 * than no journal: two records that can disagree, and nothing saying which is right.
 *
 * What a kill-boundary experiment showed **no** artifact answers:
 *
 * 1. **Whether the last iteration settled.** Three briefs mean three iterations began. Nothing says
 *    whether the third one's gates ran, whether its panel returned, or whether it died between them.
 * 2. **Which child was in flight.** The log's last line named it; the tree did not.
 * 3. **That two different boundaries are distinguishable at all.** A run killed before the design
 *    child started and one killed after the specification was captured left byte-identical
 *    directories, having made real progress in between.
 *
 * So this records exactly those: phase entry, child lifecycle, and iteration settlement. Nothing
 * else. An event type that another artifact already establishes does not belong here.
 *
 * ## What it is not
 *
 * **The Driver never reads it to decide anything.** It is forensics. The moment a decision depends
 * on it, it becomes terminal-state authority by accident — which the item forbids and which would
 * put a second, unreviewed answer beside `outcome.json`.
 *
 * It records no model deltas, no reasoning, no tool chatter, no prompt or response text. An event is
 * a transition and its identity, never its content: a journal that accumulated what children *said*
 * would be an unbounded log of untrusted text in a driver-owned file.
 *
 * ## Append-only, line-oriented, and survivable
 *
 * One JSON object per line, appended with `O_APPEND` so a concurrent writer cannot interleave a
 * partial record, and never rewritten. A crash mid-write costs the last line and nothing before it —
 * which is the property that makes it worth reading after exactly the event it exists to describe.
 * A reader that hits an unparseable line stops there and says so, rather than skipping it: a gap in
 * the middle of a history is not a history.
 */

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Where the journal lives. Machine state: driver-owned, positionally guarded, never tracked. */
export const JOURNAL_FILE = 'events.ndjson';

/** Thrown when the journal cannot be read. Never downgraded to "no history". */
export class JournalError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'JournalError';
  }
}

/**
 * The transitions this journal records, and only these.
 *
 * Deliberately short, and each one earned its place by being unanswerable from another artifact.
 * Adding a kind means showing the same thing: that nothing on disk already says it.
 */
export const EVENT_KINDS = [
  'phase-entered',
  'child-started',
  'child-settled',
  'iteration-started',
  'iteration-settled',
];

/** How long a single recorded value may be. A journal is a history, not a transcript. */
const VALUE_LIMIT = 200;

/**
 * @typedef {{
 *   seq: number, at: string, kind: string,
 *   subject: string, iteration: number | null, detail: string | null,
 * }} JournalEvent
 */

/**
 * Append one transition.
 *
 * **Never throws into the run.** A journal that could end a run would be a forensic aid that costs
 * the thing it exists to explain — and it is written on the crash path, where the filesystem is
 * exactly what may already have failed. A write that cannot happen is reported through `io.log` and
 * the run continues.
 *
 * @param {string} meeseeksDir
 * @param {{ kind: string, subject: string, iteration?: number | null, detail?: string | null }} event
 * @param {{ now: () => string, seq: () => number, log?: (line: string) => void }} io
 * @returns {boolean} whether the line was written
 */
export function recordEvent(meeseeksDir, event, io) {
  if (!EVENT_KINDS.includes(event.kind)) {
    // Refused rather than recorded. An unknown kind in a forensic record is a reader guessing at
    // what a writer meant, and the whole value here is that a reader does not have to.
    io.log?.(`journal: refusing unknown event kind ${JSON.stringify(event.kind)}`);
    return false;
  }
  /** @param {unknown} value */
  const bounded = (value) => (typeof value === 'string' ? value.slice(0, VALUE_LIMIT) : null);
  /** @type {JournalEvent} */
  const record = {
    seq: io.seq(),
    at: io.now(),
    kind: event.kind,
    subject: bounded(event.subject) ?? '',
    iteration: typeof event.iteration === 'number' ? event.iteration : null,
    detail: bounded(event.detail ?? null),
  };
  try {
    appendFileSync(path.join(meeseeksDir, JOURNAL_FILE), `${JSON.stringify(record)}\n`, { encoding: 'utf8', flag: 'a' });
    return true;
  } catch (error) {
    io.log?.(`journal: could not record ${event.kind}: ${/** @type {Error} */ (error).message}`);
    return false;
  }
}

/**
 * Read the journal back.
 *
 * **A truncated last line is expected and is not corruption.** A crash mid-append leaves a partial
 * record, and that is the ordinary shape of the file this exists to produce; refusing to read it
 * would make the journal useless at exactly the moment it matters. A malformed line anywhere
 * *earlier* is different — it means a write interleaved or the file was edited — and that is a
 * refusal, because a gap in the middle of a history is not a history.
 *
 * @param {string} meeseeksDir
 * @returns {JournalEvent[]}
 * @throws {JournalError} on a malformed line that is not the last
 */
export function readJournal(meeseeksDir) {
  const file = path.join(meeseeksDir, JOURNAL_FILE);
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, 'utf8').split('\n');
  /** @type {JournalEvent[]} */
  const events = [];
  for (const [index, line] of lines.entries()) {
    if (line.trim() === '') continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      // The last non-empty line may be a half-written record. Anything before it may not.
      if (lines.slice(index + 1).every((rest) => rest.trim() === '')) break;
      throw new JournalError(
        `the journal has a malformed record at line ${index + 1}, which is not the last. A history with a ` +
          'gap in the middle is not a history, so this is refused rather than read around.',
      );
    }
    events.push(parsed);
  }
  return events;
}

/**
 * What the journal says about where a run stopped.
 *
 * This is the question the experiment showed nothing could answer: an iteration that started and
 * never settled, and the child that was in flight when everything stopped.
 *
 * @param {JournalEvent[]} events
 * @returns {{ unsettledIteration: number | null, inFlight: string[], lastPhase: string | null }}
 */
export function unsettled(events) {
  /** @type {Set<number>} */
  const started = new Set();
  /** @type {Set<number>} */
  const settled = new Set();
  /** @type {Map<string, number>} */
  const openChildren = new Map();
  /** @type {string | null} */
  let lastPhase = null;

  for (const event of events) {
    if (event.kind === 'phase-entered') lastPhase = event.subject;
    if (event.kind === 'iteration-started' && typeof event.iteration === 'number') started.add(event.iteration);
    if (event.kind === 'iteration-settled' && typeof event.iteration === 'number') settled.add(event.iteration);
    if (event.kind === 'child-started') openChildren.set(event.subject, (openChildren.get(event.subject) ?? 0) + 1);
    if (event.kind === 'child-settled') {
      const open = (openChildren.get(event.subject) ?? 0) - 1;
      if (open <= 0) openChildren.delete(event.subject);
      else openChildren.set(event.subject, open);
    }
  }

  const open = [...started].filter((iteration) => !settled.has(iteration)).sort((a, b) => a - b);
  return {
    // The *first* unsettled iteration, not the highest. A later one settling while an earlier one
    // did not would mean the loop skipped it, and reporting the highest would hide that.
    unsettledIteration: open.length === 0 ? null : open[0],
    inFlight: [...openChildren.keys()].sort(),
    lastPhase,
  };
}

/**
 * What the previous run's journal says, for an operator starting the next one.
 *
 * **Diagnosis, not resumption.** Item 36's disposition is explicit — no daemon, no resume path — and
 * nothing here replays anything or touches the run lock. What it does is stop the journal being a
 * file only a forensic reader with a JSON parser ever sees: the run already knows the useful
 * sentence, and `question.json` exists because discarding that sentence is a habit worth breaking.
 *
 * **The discriminator is the terminal receipt, not the journal.** A run that ended normally leaves
 * `outcome.json`, and its journal may well show an unsettled iteration — the last line races the
 * terminal write, and that is expected rather than alarming. A run with **no** receipt and unsettled
 * work in its journal is one that died, and that is the only case worth a sentence.
 *
 * @param {{ events: JournalEvent[], hadTerminalReceipt: boolean }} previous
 * @returns {string | null} a line for the operator, or null when there is nothing to say
 */
export function previousRunDiagnosis(previous) {
  if (previous.hadTerminalReceipt) return null;
  if (previous.events.length === 0) return null;
  const state = unsettled(previous.events);
  if (state.unsettledIteration === null && state.inFlight.length === 0) return null;

  const where =
    state.unsettledIteration === null
      ? `during the ${state.lastPhase ?? 'unknown'} phase`
      : `during iteration ${state.unsettledIteration}`;
  const flight =
    state.inFlight.length === 0
      ? 'with no child running'
      : `with ${state.inFlight.join(' and ')} still running`;
  return (
    `the previous run left no terminal receipt: it stopped ${where}, ${flight}. ` +
    'That work is not resumed — this is a fresh run — and its journal is archived with it.'
  );
}
