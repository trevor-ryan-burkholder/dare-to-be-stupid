/**
 * The blocked-question artifact: a question as OUTPUT, never as interrupt (PLAN.md item 50).
 *
 * **The gap this closes.** `scripts/assumptions.mjs` already covers *"I was unsure, so I chose and
 * said so"* — a builder records a cited assumption and the cold panel checks it. What nothing
 * covered is *"I cannot choose at all"*, which ends today as `STALLED — 6 iterations with no gate
 * improvement`. That is a **diagnosis, not a question**, and the genuinely useful sentence the run
 * already knows is thrown away: *"PRD-3.2 requires sending email; no provider credential exists here
 * and I may not invent one. (a) stub transport, (b) credential in config, or (c) drop it?"*
 *
 * **It never blocks. Ever.** Unattended operation is the product, and a run waiting on a human at
 * three in the morning is strictly worse than `STALLED`, which at least terminates and reports. A
 * question is an **output of a terminal state**, never a pause inside one. Nothing here waits, reads
 * stdin, or has a timeout, because there is nothing to wait for.
 *
 * **The answer is written into the specification, not typed at a prompt.** The operator edits
 * `PRD.md`, `DOD.md` or the config and re-runs — the existing path, and the better one: an answer
 * typed at a prompt evaporates, while an answer written into the spec is durable, versioned, and
 * reusable. A question improves the specification rather than merely this run.
 *
 * **Only the Driver may emit one, and only at a terminal state.** There is deliberately no "ask"
 * verb for a builder. Given one it would be used: models offload difficulty, and a builder declines
 * hard things whenever a decline is available (case J). An asking builder would also breach the
 * `builder cannot judge its own work` boundary by letting the thing under review set the terms of
 * its own review.
 *
 * **A question citing nothing is discarded, and the discard is counted.** Same bar as
 * `validateLesson` and the assumptions citation rule. An uncited question is confident vapour
 * arriving at the operator in the moment they are least able to check it — but a *silent* discard
 * would be worse than either, so the count travels in the artifact and in the report.
 *
 * **A `SHIPPED` run emits none.** A machine that always has a question has stopped meaning anything
 * by it. That is a property of the state rather than a rule applied on top of it: the question is
 * derived from the terminal receipt, and `SHIPPED` produces nothing to derive.
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';

/** Where the question is written. Machine state: driver-owned, positionally guarded, never tracked. */
export const QUESTION_FILE = 'question.json';

/** Thrown when a question cannot be written. Never downgraded to "no question". */
export class QuestionError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'QuestionError';
  }
}

/**
 * @typedef {{ id: string, kind: 'requirement' | 'gate' | 'finding' | 'phase' }} Citation
 */

/**
 * @typedef {{
 *   state: 'STALLED' | 'BUDGET' | 'ABORTED',
 *   blocking: string,
 *   tried: string[],
 *   decision: string,
 *   options: string[],
 *   citations: Citation[],
 * }} BlockedQuestion
 */

/**
 * The decisions each terminal state actually presents.
 *
 * Enumerated rather than phrased freely, because **an option list is answerable and a paragraph is
 * not**. These are the decisions the *operator* holds — every one of them is a change to the
 * specification, the budget or the configuration, which is the only place an answer can be durable.
 *
 * Deliberately short. A list that tries to cover every case stops being a list somebody reads.
 */
const DECISIONS = {
  BUDGET: {
    decision: 'The run ran out of budget before it could satisfy the specification. What should change?',
    options: [
      'Raise the budget and re-run, if the remaining work is genuinely that large.',
      'Narrow PRD.md, so the run is spending on what you actually want first.',
      'Split the specification into two runs with their own done-bars.',
    ],
  },
  STALLED: {
    decision: 'The run stopped making progress against these requirements. Which is true of them?',
    options: [
      'They are correct and the run needs a capability it does not have — name it in the config.',
      'They are ambiguous as written and the builder cannot choose — make them decidable in PRD.md.',
      'They are not worth their cost — remove them from PRD.md.',
    ],
  },
  ABORTED: {
    decision: 'The run could not continue. The blocking fact is above; what should change before a re-run?',
    options: [
      'Repair the environment or configuration the failure names, then re-run.',
      'Change PRD.md if the failure shows the specification asked for something impossible here.',
    ],
  },
};

/**
 * Build a question from a terminal receipt and what the run knows.
 *
 * Pure: no filesystem, no clock. The caller decides where it goes, which is what makes every hostile
 * case below assertable without a run.
 *
 * @param {{ state: string, reason: string, phase?: string }} receipt the terminal receipt
 * @param {{ requirements?: string[], gates?: string[], findings?: string[], tried?: string[] }} [context]
 * @returns {{ ok: true, question: BlockedQuestion } | { ok: false, discarded: string }}
 */
export function buildQuestion(receipt, context = {}) {
  // Derived from the state rather than decided alongside it, so a SHIPPED run cannot emit one by
  // some other path acquiring the ability to call this.
  if (receipt.state === 'SHIPPED') {
    return { ok: false, discarded: 'a shipped run has nothing to ask; a machine that always has a question means nothing by it' };
  }
  if (!Object.hasOwn(DECISIONS, receipt.state)) {
    return { ok: false, discarded: `terminal state ${JSON.stringify(receipt.state)} has no defined question` };
  }

  /** @type {Citation[]} */
  const citations = [
    ...(context.requirements ?? []).map((id) => ({ id, kind: /** @type {const} */ ('requirement') })),
    ...(context.gates ?? []).map((id) => ({ id, kind: /** @type {const} */ ('gate') })),
    ...(context.findings ?? []).map((id) => ({ id, kind: /** @type {const} */ ('finding') })),
  ].filter((citation) => typeof citation.id === 'string' && citation.id.trim() !== '');

  // The phase is a citation of last resort: it names *where* the run stopped even when nothing
  // finer is known, which is still something an operator can act on. It is not a substitute for a
  // requirement id, so it is only used when nothing else survived.
  if (citations.length === 0 && typeof receipt.phase === 'string' && receipt.phase.trim() !== '') {
    citations.push({ id: receipt.phase.trim(), kind: 'phase' });
  }

  if (citations.length === 0) {
    return {
      ok: false,
      discarded:
        'the question cites nothing — no requirement, gate, finding or phase — so the operator cannot check it. ' +
        'An uncited question is confident vapour arriving when it is least verifiable.',
    };
  }

  const { decision, options } = DECISIONS[/** @type {keyof typeof DECISIONS} */ (receipt.state)];
  return {
    ok: true,
    question: {
      state: /** @type {'STALLED' | 'BUDGET' | 'ABORTED'} */ (receipt.state),
      blocking: receipt.reason,
      // What was already tried, so the operator is not told to attempt what the run just attempted.
      tried: (context.tried ?? []).filter((line) => typeof line === 'string' && line.trim() !== ''),
      decision,
      options,
      citations,
    },
  };
}

/**
 * Render a question for the final report.
 *
 * Plain text and unstyled, like every failure path here.
 *
 * @param {BlockedQuestion} question
 * @returns {string}
 */
export function renderQuestion(question) {
  const lines = [
    'A decision is needed before a re-run can do better:',
    '',
    `  blocked by: ${question.blocking}`,
    `  concerning: ${question.citations.map((c) => `${c.id} (${c.kind})`).join(', ')}`,
  ];
  if (question.tried.length > 0) {
    lines.push('  already tried:');
    for (const line of question.tried) lines.push(`    - ${line}`);
  }
  lines.push('', `  ${question.decision}`);
  for (const [index, option] of question.options.entries()) {
    lines.push(`    (${String.fromCharCode(97 + index)}) ${option}`);
  }
  lines.push('', '  Answer by editing PRD.md, DOD.md or the config and re-running. An answer written');
  lines.push('  into the specification is durable and reusable; one typed at a prompt is neither.');
  return lines.join('\n');
}

/**
 * Say something, and never let saying it cost the artifact.
 *
 * **The log is a courtesy; the file is the artifact.** Found by a pre-existing case — "files the
 * receipt even when the logger is the thing that broke" — which this module broke by assuming a
 * logger works. It does not always: the terminal writer is exactly what a crashing run may have
 * lost, and that is the run most in need of a question. A throwing logger must not take the file
 * down with it, and must not take down the handler reporting that it threw either.
 *
 * @param {((line: string) => void) | undefined} log
 * @param {string} line
 */
function say(log, line) {
  try {
    log?.(line);
  } catch {
    // Deliberately silent, and this is the one place that is right: there is no channel left to
    // report a broken channel on. The artifact is already on disk, which is the durable half.
  }
}

/**
 * Write the question, or record that one was discarded.
 *
 * @param {string} meeseeksDir the driver's own directory
 * @param {{ state: string, reason: string, phase?: string }} receipt
 * @param {{ requirements?: string[], gates?: string[], findings?: string[], tried?: string[] }} context
 * @param {{ now: () => string, log?: (line: string) => void }} io
 * @returns {{ written: boolean, discarded: number }}
 */
export function writeQuestion(meeseeksDir, receipt, context, io) {
  const built = buildQuestion(receipt, context);
  if (!built.ok) {
    // Counted and reported, never dropped quietly. A discard is a fact about this run — and about
    // the authoring gate that let an unanswerable state reach the loop.
    const discarded = receipt.state === 'SHIPPED' ? 0 : 1;
    if (discarded === 1) say(io.log, `no question was emitted: ${built.discarded}`);
    return { written: false, discarded };
  }
  const file = path.join(meeseeksDir, QUESTION_FILE);
  try {
    writeFileSync(file, `${JSON.stringify({ at: io.now(), ...built.question }, null, 2)}\n`, 'utf8');
  } catch (error) {
    throw new QuestionError(`could not write ${QUESTION_FILE}: ${/** @type {Error} */ (error).message}`);
  }
  say(io.log, renderQuestion(built.question));
  return { written: true, discarded: 0 };
}
