/**
 * Tests for the terminal receipt writer (REVIEW F10).
 *
 * Two properties, and they fail in different ways. **Universality**: a run that dies before the
 * loop is still a paid run, and it used to leave nothing durable — a parent component correctly
 * refuses to trust a child with no receipt, and its operator then cannot recover the child's state
 * or its spend from the artifact that promised both. **Atomicity**: the previous writer overwrote
 * the file in place, so a kill during that write destroyed the only record of a completed run and
 * left truncated JSON a reader cannot tell from a run that ended badly.
 *
 * The universality half is a property of *where the writer is called from*, which no unit test can
 * see; `test/integration/outcome.integration.test.mjs` drives the real `main` for that. This file
 * owns the writer itself.
 */

import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { OUTCOME_FILE, writeRunOutcome } from '../scripts/outcome.mjs';

/** @type {string[]} */
const temporaryDirs = [];

after(() => {
  for (const dir of temporaryDirs) {
    try {
      chmodSync(dir, 0o755);
    } catch {
      // Only the permission case needs it.
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

/** @returns {string} */
function scratch() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-outcome-'));
  temporaryDirs.push(dir);
  return dir;
}

/** @param {string[]} lines @returns {{ now: () => string, log: (line: string) => void }} */
const io = (lines) => ({ now: () => '2026-08-18T00:00:00.000Z', log: (line) => lines.push(line) });

/** @param {string} dir @returns {any} */
const receiptIn = (dir) => JSON.parse(readFileSync(path.join(dir, OUTCOME_FILE), 'utf8'));

describe('writeRunOutcome', () => {
  it('writes a parseable receipt carrying the terminal state and its reason', () => {
    const dir = scratch();
    /** @type {string[]} */
    const logs = [];
    assert.equal(writeRunOutcome(dir, { state: 'ABORTED', reason: 'the PRD child failed', phase: 'prd authoring' }, io(logs)), true);
    assert.deepStrictEqual(receiptIn(dir), {
      version: 1,
      endedAt: '2026-08-18T00:00:00.000Z',
      state: 'ABORTED',
      reason: 'the PRD child failed',
      phase: 'prd authoring',
    });
    assert.deepStrictEqual(logs, []);
  });

  it('omits what the run never established rather than writing zero for it', () => {
    // F10 asks for known spend recorded honestly and unavailable usage not invented. A pre-loop
    // abort has no iteration count; `0` would be a claim, and `null` a workspace nobody can look up.
    const dir = scratch();
    writeRunOutcome(dir, { state: 'ABORTED', reason: 'no idea to improve on', phase: 'improvement authoring' }, io([]));
    const written = receiptIn(dir);
    assert.equal('iterations' in written, false);
    assert.equal('passing' in written, false);
    assert.equal('workspace' in written, false);
  });

  it('records spend when it is known, because that money was already paid', () => {
    const dir = scratch();
    writeRunOutcome(
      dir,
      { state: 'BUDGET', reason: 'token ceiling reached during PRD authoring', phase: 'prd authoring', spentTokens: 4200, costUsd: 0.75 },
      io([]),
    );
    const written = receiptIn(dir);
    assert.equal(written.spentTokens, 4200);
    assert.equal(written.costUsd, 0.75);
    assert.equal(written.state, 'BUDGET');
  });

  it('creates the state directory when a run died before anything else made it', () => {
    const parent = scratch();
    const dir = path.join(parent, 'never-made', '.meeseeks');
    assert.equal(writeRunOutcome(dir, { state: 'ABORTED', reason: 'early', phase: 'launch' }, io([])), true);
    assert.equal(receiptIn(dir).reason, 'early');
  });

  it('writes at most once, so the first answer is the decided one', () => {
    // The loop's own `finish` and the outer exception handler can both be reached on the way out of
    // one run. A later generic ABORTED must not overwrite the specific state already reached.
    const dir = scratch();
    const written = { done: false };
    assert.equal(
      writeRunOutcome(dir, { state: 'SHIPPED', reason: 'panel unanimous', phase: 'loop' }, { ...io([]), written }),
      true,
    );
    assert.equal(
      writeRunOutcome(dir, { state: 'ABORTED', reason: 'an exception on the way out', phase: 'loop' }, { ...io([]), written }),
      false,
      'a second write overwrote the decided terminal state',
    );
    assert.equal(receiptIn(dir).state, 'SHIPPED');
    assert.equal(receiptIn(dir).reason, 'panel unanimous');
  });

  it('leaves the previous complete receipt when the write cannot land', () => {
    // The interruption property, from the outside: what a reader can ever observe is the old
    // complete record or nothing — never half of one. A read-only directory is the reachable way to
    // make the write fail on a POSIX host; the atomicity itself is `rename`, asserted below.
    const dir = scratch();
    writeRunOutcome(dir, { state: 'SHIPPED', reason: 'the run that finished', phase: 'loop' }, io([]));
    chmodSync(dir, 0o555);
    /** @type {string[]} */
    const logs = [];
    const wrote = writeRunOutcome(dir, { state: 'ABORTED', reason: 'the run that could not file', phase: 'loop' }, io(logs));
    chmodSync(dir, 0o755);

    if (wrote) {
      // Root ignores the mode bits. Said out loud rather than passed, on the same argument that
      // arms the live tier by environment variable: a green tick for a case that never ran is a lie.
      assert.fail('this process can write to a read-only directory (running as root?), so the failure path never ran');
    }
    assert.equal(receiptIn(dir).state, 'SHIPPED', 'a failed write destroyed the previous complete receipt');
    assert.equal(logs.length, 1, logs.join('\n'));
    assert.equal(logs[0].includes(`could not write ${OUTCOME_FILE}`), true, logs[0]);
  });

  it('never leaves a temp file behind on the ordinary path', () => {
    // The atomicity mechanism, asserted rather than assumed: the write goes to a temp name and is
    // renamed into place, so a reader never sees a partially written receipt.
    const dir = scratch();
    writeRunOutcome(dir, { state: 'STALLED', reason: 'nothing improved', phase: 'loop' }, io([]));
    assert.deepStrictEqual(readdirSync(dir), [OUTCOME_FILE]);
  });

  it('replaces a truncated receipt from an older writer rather than being confused by it', () => {
    // What the previous in-place writer could leave behind. The new writer overwrites it whole.
    const dir = scratch();
    writeFileSync(path.join(dir, OUTCOME_FILE), '{"version":1,"state":"SHIP', 'utf8');
    assert.equal(writeRunOutcome(dir, { state: 'ABORTED', reason: 'the next run', phase: 'loop' }, io([])), true);
    assert.equal(receiptIn(dir).state, 'ABORTED');
  });

  it('does not latch the run shut when the write failed (REVIEW F10, reopened)', () => {
    // **At-most-once must mean at most one *decision*, not at most one attempt.** The flag used to
    // be set before the write, so a transient failure on the first exit path latched the run: every
    // later path — including `main`'s crash guard, which exists precisely to file a receipt —
    // declined to try, and the run ended with no durable record at all. That is the outcome the
    // finding is about, reached through the guard written to prevent it.
    const blocked = scratch();
    mkdirSync(path.join(blocked, OUTCOME_FILE), { recursive: true });
    const written = { done: false };
    /** @type {string[]} */
    const logs = [];

    assert.equal(
      writeRunOutcome(blocked, { state: 'ABORTED', reason: 'first exit', phase: 'design' }, { ...io(logs), written }),
      false,
    );
    assert.equal(written.done, false, 'a failed attempt latched the flag');

    // A later exit path, on a directory that works, still gets to record the run's answer.
    const usable = scratch();
    assert.equal(
      writeRunOutcome(usable, { state: 'ABORTED', reason: 'later exit', phase: 'loop' }, { ...io(logs), written }),
      true,
    );
    assert.equal(written.done, true);
    assert.equal(receiptIn(usable).reason, 'later exit');
  });

  it('still refuses a second writer once one has succeeded, which is the rule being defended', () => {
    // The neighbour. Relaxing the latch must not let a generic outer handler overwrite the loop's
    // own specific terminal state — that is what at-most-once was for.
    const dir = scratch();
    const written = { done: false };
    assert.equal(writeRunOutcome(dir, { state: 'SHIPPED', reason: 'the loop decided', phase: 'loop' }, { ...io([]), written }), true);
    assert.equal(
      writeRunOutcome(dir, { state: 'ABORTED', reason: 'an outer handler', phase: 'pre-loop' }, { ...io([]), written }),
      false,
    );
    assert.equal(receiptIn(dir).reason, 'the loop decided');
    assert.equal(receiptIn(dir).state, 'SHIPPED');
  });

  it('reports a write failure without throwing, because forensics must not end a run', () => {
    // A directory where the file should be: the write fails and the caller keeps its terminal state.
    const dir = scratch();
    mkdirSync(path.join(dir, OUTCOME_FILE), { recursive: true });
    /** @type {string[]} */
    const logs = [];
    assert.doesNotThrow(() => writeRunOutcome(dir, { state: 'SHIPPED', reason: 'done', phase: 'loop' }, io(logs)));
    assert.equal(logs.length, 1);
    assert.equal(existsSync(path.join(dir, OUTCOME_FILE)), true);
  });
});
