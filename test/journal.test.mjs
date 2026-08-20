/**
 * The lifecycle journal (PLAN.md item 58).
 *
 * The journal exists to answer three questions a kill-boundary experiment showed no artifact could:
 * whether the last iteration settled, which child was in flight, and whether two different stopping
 * points are distinguishable at all. The cases below are mostly about those, and about the two ways
 * a forensic record fails — by lying about a gap, and by costing the run it exists to explain.
 */

import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import {
  EVENT_KINDS,
  JOURNAL_FILE,
  JournalError,
  previousRunDiagnosis,
  readJournal,
  recordEvent,
  unsettled,
} from '../scripts/journal.mjs';

/** @type {string[]} */
const dirs = [];
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** @returns {string} */
const tempDir = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-journal-'));
  dirs.push(dir);
  return dir;
};

/** @param {string} dir @returns {{ record: (event: any) => boolean, logs: string[] }} */
function writer(dir) {
  let seq = 0;
  /** @type {string[]} */
  const logs = [];
  return {
    logs,
    record: (event) =>
      recordEvent(dir, event, {
        now: () => `2026-08-19T00:00:0${seq}.000Z`,
        seq: () => (seq += 1),
        log: (line) => logs.push(line),
      }),
  };
}

describe('the journal records transitions and nothing else', () => {
  it('records only the kinds the experiment showed were unanswerable', () => {
    // Each kind earned its place by being unrecoverable from another artifact. A run's start, its
    // specification, its capabilities and its supply are all on disk already; re-recording them here
    // would be a second authority for the same fact.
    assert.deepStrictEqual(EVENT_KINDS, [
      'phase-entered',
      'child-started',
      'child-settled',
      'iteration-started',
      'iteration-settled',
    ]);
  });

  it('refuses an unknown kind rather than recording it', () => {
    // An unknown kind in a forensic record is a reader guessing at what a writer meant, and not
    // having to guess is the entire value.
    const dir = tempDir();
    const { record, logs } = writer(dir);
    assert.equal(record({ kind: 'model-delta', subject: 'builder' }), false);
    assert.equal(existsSync(path.join(dir, JOURNAL_FILE)), false);
    assert.match(logs.join('\n'), /refusing unknown event kind "model-delta"/);
  });

  it('writes one JSON object per line, in sequence', () => {
    const dir = tempDir();
    const { record } = writer(dir);
    record({ kind: 'phase-entered', subject: 'design' });
    record({ kind: 'iteration-started', subject: 'loop', iteration: 1 });
    const lines = readFileSync(path.join(dir, JOURNAL_FILE), 'utf8').trim().split('\n');
    assert.equal(lines.length, 2);
    assert.deepStrictEqual(
      lines.map((line) => JSON.parse(line).seq),
      [1, 2],
    );
    assert.equal(JSON.parse(lines[1]).iteration, 1);
  });

  it('bounds every recorded value, because a history is not a transcript', () => {
    // A journal that accumulated what children said would be an unbounded log of untrusted text in
    // a driver-owned file.
    const dir = tempDir();
    const { record } = writer(dir);
    record({ kind: 'child-settled', subject: 'builder', detail: 'x'.repeat(5000) });
    const event = JSON.parse(readFileSync(path.join(dir, JOURNAL_FILE), 'utf8').trim());
    assert.equal(event.detail.length, 200);
  });

  it('never throws into the run when it cannot write', () => {
    // It is written on the crash path, where the filesystem is exactly what may already have
    // failed. A forensic aid that ends the run it exists to explain is worse than no aid.
    const dir = tempDir();
    chmodSync(dir, 0o500);
    try {
      const { record, logs } = writer(dir);
      assert.equal(record({ kind: 'phase-entered', subject: 'design' }), false);
      assert.match(logs.join('\n'), /could not record phase-entered/);
    } finally {
      chmodSync(dir, 0o700);
    }
  });
});

describe('reading a journal a crash interrupted', () => {
  it('reads a half-written last line as the end, because that is the ordinary shape', () => {
    // A crash mid-append leaves a partial record. Refusing to read it would make the journal
    // useless at exactly the moment it matters.
    const dir = tempDir();
    const { record } = writer(dir);
    record({ kind: 'phase-entered', subject: 'design' });
    writeFileSync(path.join(dir, JOURNAL_FILE), `${readFileSync(path.join(dir, JOURNAL_FILE), 'utf8')}{"seq":2,"kind":"child-st`);
    const events = readJournal(dir);
    assert.equal(events.length, 1);
    assert.equal(events[0].kind, 'phase-entered');
  });

  it('refuses a malformed line that is not the last, because a gap is not a history', () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, JOURNAL_FILE), '{"seq":1,"kind":"phase-entered"}\nnot json\n{"seq":3,"kind":"child-started"}\n');
    assert.throws(
      () => readJournal(dir),
      (error) => error instanceof JournalError && error.message.includes('line 2, which is not the last'),
    );
  });

  it('reads an absent journal as no history rather than failing', () => {
    assert.deepStrictEqual(readJournal(tempDir()), []);
  });
});

describe('unsettled answers the question no artifact could', () => {
  /** @param {any[]} kinds @returns {any[]} */
  const events = (kinds) => kinds.map((event, index) => ({ seq: index + 1, at: '', detail: null, iteration: null, ...event }));

  it('names an iteration that started and never settled', () => {
    // Three briefs mean three iterations began. Only this says the third one never finished.
    const result = unsettled(
      events([
        { kind: 'iteration-started', subject: 'loop', iteration: 1 },
        { kind: 'iteration-settled', subject: 'loop', iteration: 1 },
        { kind: 'iteration-started', subject: 'loop', iteration: 2 },
      ]),
    );
    assert.equal(result.unsettledIteration, 2);
  });

  it('reports nothing unsettled when every iteration finished', () => {
    const result = unsettled(
      events([
        { kind: 'iteration-started', subject: 'loop', iteration: 1 },
        { kind: 'iteration-settled', subject: 'loop', iteration: 1 },
      ]),
    );
    assert.equal(result.unsettledIteration, null);
  });

  it('names the first unsettled iteration, not the highest', () => {
    // A later iteration settling while an earlier one did not means the loop skipped it, and
    // reporting the highest would hide exactly that.
    const result = unsettled(
      events([
        { kind: 'iteration-started', subject: 'loop', iteration: 1 },
        { kind: 'iteration-started', subject: 'loop', iteration: 2 },
        { kind: 'iteration-settled', subject: 'loop', iteration: 2 },
        // A third, also unsettled. With only one open iteration 'first' and 'highest' are the same
        // number, so the case discriminated nothing -- a mutation reading the highest survived it.
        { kind: 'iteration-started', subject: 'loop', iteration: 3 },
      ]),
    );
    assert.equal(result.unsettledIteration, 1);
  });

  it('names the child that was in flight when everything stopped', () => {
    const result = unsettled(
      events([
        { kind: 'child-started', subject: 'builder' },
        { kind: 'child-settled', subject: 'builder' },
        { kind: 'child-started', subject: 'review' },
      ]),
    );
    assert.deepStrictEqual(result.inFlight, ['review']);
  });

  it('handles concurrent children of one kind, which the panel really has', () => {
    // Three reviewers run at once. One settling must not clear the other two.
    const result = unsettled(
      events([
        { kind: 'child-started', subject: 'review' },
        { kind: 'child-started', subject: 'review' },
        { kind: 'child-started', subject: 'review' },
        { kind: 'child-settled', subject: 'review' },
      ]),
    );
    assert.deepStrictEqual(result.inFlight, ['review']);
  });

  it('clears a child kind only once every one of them settled', () => {
    const result = unsettled(
      events([
        { kind: 'child-started', subject: 'review' },
        { kind: 'child-started', subject: 'review' },
        { kind: 'child-settled', subject: 'review' },
        { kind: 'child-settled', subject: 'review' },
      ]),
    );
    assert.deepStrictEqual(result.inFlight, []);
  });

  it('distinguishes two stopping points that left identical directories', () => {
    // The third finding: a run killed before the design child started and one killed after the
    // specification was captured left byte-identical `.meeseeks/` directories, having made real
    // progress in between.
    const before = unsettled(events([{ kind: 'phase-entered', subject: 'specification' }]));
    const after = unsettled(
      events([
        { kind: 'phase-entered', subject: 'specification' },
        { kind: 'phase-entered', subject: 'design' },
        { kind: 'child-started', subject: 'design' },
      ]),
    );
    assert.equal(before.lastPhase, 'specification');
    assert.deepStrictEqual(before.inFlight, []);
    assert.equal(after.lastPhase, 'design');
    assert.deepStrictEqual(after.inFlight, ['design']);
  });
});

describe('what the previous run left, said to the next operator', () => {
  /** @param {any[]} kinds @returns {any[]} */
  const events = (kinds) => kinds.map((event, index) => ({ seq: index + 1, at: '', detail: null, iteration: null, ...event }));

  const DIED_MID_ITERATION = events([
    { kind: 'phase-entered', subject: 'loop' },
    { kind: 'iteration-started', subject: 'loop', iteration: 3 },
    { kind: 'child-started', subject: 'builder' },
  ]);

  it('says nothing when the previous run ended normally', () => {
    // The discriminator is the receipt, not the journal. A run that ended cleanly may well show an
    // unsettled iteration -- the journal's last line races the terminal write -- and that is
    // expected rather than alarming.
    assert.equal(previousRunDiagnosis({ events: DIED_MID_ITERATION, hadTerminalReceipt: true }), null);
  });

  it('says nothing when there was no previous run at all', () => {
    assert.equal(previousRunDiagnosis({ events: [], hadTerminalReceipt: false }), null);
  });

  it('says nothing when a receiptless run had settled everything anyway', () => {
    // A run killed between its last settlement and its terminal write has nothing outstanding, and
    // announcing it would train the operator to ignore the line.
    const settled = events([
      { kind: 'iteration-started', subject: 'loop', iteration: 1 },
      { kind: 'iteration-settled', subject: 'loop', iteration: 1 },
    ]);
    assert.equal(previousRunDiagnosis({ events: settled, hadTerminalReceipt: false }), null);
  });

  it('names the iteration and the child when a run died with work outstanding', () => {
    const line = previousRunDiagnosis({ events: DIED_MID_ITERATION, hadTerminalReceipt: false });
    assert.match(String(line), /left no terminal receipt/);
    assert.match(String(line), /stopped during iteration 3/);
    assert.match(String(line), /with builder still running/);
  });

  it('falls back to the phase when a run died before any iteration', () => {
    const line = previousRunDiagnosis({
      events: events([{ kind: 'phase-entered', subject: 'design' }, { kind: 'child-started', subject: 'design' }]),
      hadTerminalReceipt: false,
    });
    assert.match(String(line), /stopped during the design phase/);
    assert.match(String(line), /with design still running/);
  });

  it('says plainly that nothing is resumed, because that is the one thing it must not imply', () => {
    // Item 36's disposition forbids a resume path. A diagnosis that read as an offer to continue
    // would be worse than silence.
    const line = previousRunDiagnosis({ events: DIED_MID_ITERATION, hadTerminalReceipt: false });
    assert.match(String(line), /That work is not resumed \u2014 this is a fresh run/);
  });
});

describe('the journal answers about one run (PLAN item 58)', () => {
  // Three shipped statements said this file was archived with its run: the item's own candidate,
  // the driver comment at the read site, and the sentence `previousRunDiagnosis` prints to the
  // operator. None was true. `journalSeq` restarts at zero every run, so one file held two runs'
  // sequences and `unsettled` merged them — and the consequence is a **wrong diagnosis**, not
  // untidiness: the earlier run's history answers a question asked about the later one.

  /** @param {number} seq @param {string} kind @param {string} subject @param {number | null} iteration */
  const event = (seq, kind, subject, iteration = null) => ({
    seq,
    kind,
    subject,
    iteration,
    detail: null,
    at: '2026-08-20T00:00:00.000Z',
  });

  it('reports the killed run alone correctly', () => {
    // The truth this must preserve: a run that finished iteration 1 and died in iteration 2 with a
    // builder still running.
    const killed = [
      event(1, 'iteration-started', 'loop', 1),
      event(2, 'child-started', 'builder'),
      event(3, 'child-settled', 'builder'),
      event(4, 'iteration-settled', 'loop', 1),
      event(5, 'iteration-started', 'loop', 2),
      event(6, 'child-started', 'builder'),
    ];
    assert.deepEqual(unsettled(killed), { unsettledIteration: 2, inFlight: ['builder'], lastPhase: null });
  });

  it('is masked entirely once a completed earlier run is merged into it', () => {
    // **The defect, executed — and note which way round it goes.** A first draft of this case put a
    // *completed* run second and found no masking, because the later run's `iteration-settled 1`
    // settles the earlier run's iteration 1 too. The damaging order is the other one: the earlier
    // run settled iteration 1, the later run died *inside* its own iteration 1, and the earlier
    // settle now answers for the later start.
    const completed = [
      event(1, 'iteration-started', 'loop', 1),
      event(2, 'child-started', 'builder'),
      event(3, 'child-settled', 'builder'),
      event(4, 'iteration-settled', 'loop', 1),
    ];
    const died = [event(1, 'iteration-started', 'loop', 1), event(2, 'child-started', 'builder')];

    assert.deepEqual(unsettled(died), { unsettledIteration: 1, inFlight: ['builder'], lastPhase: null });
    // Merged, the run that died reports nothing unsettled at all: the strongest claim the journal
    // makes, erased by a run that finished hours earlier.
    assert.equal(unsettled([...completed, ...died]).unsettledIteration, null);
    // The in-flight child **does** survive the merge, and that is not luck — it is ordering. An
    // earlier run's events always precede a later run's in the appended file, so its
    // `child-settled` is consumed before the later `child-started` ever arrives and cannot cancel
    // it. Worth pinning: the obvious symmetry with the iteration case does not hold, and a reader
    // assuming it would look for a bug that is not there.
    assert.deepEqual(unsettled([...completed, ...died]).inFlight, ['builder']);
    assert.deepEqual(unsettled([...completed, event(5, 'child-settled', 'builder'), ...died]).inFlight, ['builder']);
  });

  it('needed the archive precisely because iteration-settled is now emitted', () => {
    // Worth stating plainly, because it inverts the usual order. Before this slice the driver
    // emitted no `iteration-settled` at all, so the masking above was **unreachable** — a merged
    // journal could not settle anything. Emitting the event is what makes the archive necessary
    // rather than merely tidy: the fix to one half created the need for the other.
    const withoutSettles = [
      event(1, 'iteration-started', 'loop', 1),
      event(2, 'child-started', 'builder'),
      event(3, 'child-settled', 'builder'),
    ];
    const died = [event(1, 'iteration-started', 'loop', 1), event(2, 'child-started', 'builder')];
    assert.equal(unsettled([...withoutSettles, ...died]).unsettledIteration, 1, 'no settle, so nothing to mask');
  });

  it('names the phase a killed run was in, rather than the unknown phase', () => {
    // `lastPhase` comes only from `phase-entered`, and nothing emitted one — so every diagnosis in
    // the product said "the unknown phase", including for a kill inside the forty-five-minute gate
    // window. The reader was reading for a fact the writer never recorded.
    const inGates = [event(1, 'iteration-started', 'loop', 1), event(2, 'phase-entered', 'gates', 1)];
    assert.equal(unsettled(inGates).lastPhase, 'gates');
  });

  it('still says nothing about a phase it was never told about', () => {
    // The neighbour: `phase-entered` must be the source of this, not an inference from whatever
    // event happened last. A run killed before any phase was entered has an unknown phase, and
    // saying so is correct.
    const early = [event(1, 'iteration-started', 'loop', 1), event(2, 'child-started', 'builder')];
    assert.equal(unsettled(early).lastPhase, null);
  });
});
