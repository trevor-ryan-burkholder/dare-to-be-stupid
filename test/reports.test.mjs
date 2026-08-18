/**
 * Tests for per-attempt test-report freshness (REVIEW F16, REVIEW F32).
 *
 * The expected report paths are fixed, so a gate that crashed, timed out, or failed before writing
 * left the *previous* attempt's report on disk and everything downstream read it as this attempt's
 * evidence. Codex's reproduction is the worst instance: the scoped restore's verification gate
 * failed and wrote nothing, the previous passing report confirmed the restore, and the Driver
 * skipped the full reset over source that still said `broken`.
 *
 * The guarantee asserted here is deliberately the boring one: remove the artifacts first, and
 * require a regular file afterwards. Absence then *means* "this attempt produced nothing", rather
 * than being something to infer from a clock whose granularity is a filesystem property.
 *
 * **F32 is the branch that repair did not treat as a failure.** `clearReports` already reported the
 * paths it could not remove, and every caller logged them and carried on. A report that *survives*
 * the clear is the previous attempt's, so the removal-then-presence argument above does not hold for
 * it — and an old passing report that a locked filesystem preserved through an exit-zero gate is the
 * same laundering F16 exists to stop, arriving by the one door F16 left open. Collection now takes
 * the clear's outcome as an argument, so a caller cannot read a report without saying whether the
 * path it came from was cleared first.
 */

import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { extractTestIds } from '../scripts/ratchet.mjs';
import { clearReports, collectReports } from '../scripts/reports.mjs';

/**
 * A real vitest reporter payload in which one test passes.
 *
 * Written out rather than referenced as a constant so the hostile case can show what the surviving
 * file would have banked: the defect is not "an unreadable file was read", it is "a perfectly good
 * report from the *previous* attempt was credited to this one".
 */
const STALE_PASSING = JSON.stringify({
  numTotalTests: 1,
  testResults: [
    { name: 'src/a.test.js', assertionResults: [{ ancestorTitles: ['a'], title: 'passes', status: 'passed' }] },
  ],
});

/**
 * The outcome of a clear in which every one of these paths went away.
 *
 * A function rather than a constant, because the outcome is **bound to the paths**: collection
 * treats a path the record does not account for as uncleared, so a shared `{cleared: [], stuck: []}`
 * would refuse every attempt. That is the contract, not an inconvenience.
 *
 * @param {string[]} files
 * @returns {{ cleared: string[], stuck: string[] }}
 */
const clearedAll = (files) => ({ cleared: [...files], stuck: [] });

/** @type {string[]} */
const temporaryDirs = [];

after(() => {
  for (const dir of temporaryDirs) {
    try {
      chmodSync(dir, 0o755);
    } catch {
      // Only the one test that removes a permission needs this; the rest are ordinary.
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

/** @returns {string} */
function scratch() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-reports-'));
  temporaryDirs.push(dir);
  return dir;
}

describe('clearReports', () => {
  it('removes the artifacts an attempt is about to rewrite', () => {
    const dir = scratch();
    const unit = path.join(dir, 'test-report.json');
    writeFileSync(unit, '{"stale":true}', 'utf8');
    assert.deepStrictEqual(clearReports([unit]).stuck, []);
    assert.deepStrictEqual(collectReports([unit], clearedAll([unit])).contents, []);
  });

  it('says nothing about a path that was never there, which is the first attempt of every run', () => {
    const dir = scratch();
    assert.deepStrictEqual(clearReports([path.join(dir, 'absent.json')]).stuck, []);
  });

  it('removes a directory left where a report belongs', () => {
    // A tool that created a directory at the report path would otherwise leave it there for every
    // later attempt to trip over.
    const dir = scratch();
    const target = path.join(dir, 'test-report.json');
    mkdirSync(target, { recursive: true });
    assert.deepStrictEqual(clearReports([target]).stuck, []);
  });
});

describe('collectReports', () => {
  it('reads exactly the reports that are there', () => {
    const dir = scratch();
    const unit = path.join(dir, 'unit.json');
    const e2e = path.join(dir, 'e2e.json');
    writeFileSync(unit, '{"unit":1}', 'utf8');
    writeFileSync(e2e, '{"e2e":1}', 'utf8');
    const collected = collectReports([unit, e2e], clearedAll([unit, e2e]));
    assert.deepStrictEqual(collected.contents, ['{"unit":1}', '{"e2e":1}']);
    assert.deepStrictEqual(collected.produced, [unit, e2e]);
    assert.deepStrictEqual(collected.missing, []);
    assert.deepStrictEqual(collected.irregular, []);
  });

  // The whole mechanism, in one assertion: cleared and not rewritten reads as nothing produced.
  it('reads nothing after a clear that no attempt followed', () => {
    const dir = scratch();
    const unit = path.join(dir, 'unit.json');
    writeFileSync(unit, '{"from":"the previous attempt"}', 'utf8');
    clearReports([unit]);
    const collected = collectReports([unit], clearedAll([unit]));
    assert.deepStrictEqual(collected.contents, []);
    assert.deepStrictEqual(collected.missing, [unit]);
  });

  it('names a missing report rather than silently returning fewer', () => {
    // A caller that only saw a shorter array could not tell "the e2e suite reported nothing" from
    // "there is no e2e suite", and those need different answers.
    const dir = scratch();
    const unit = path.join(dir, 'unit.json');
    const e2e = path.join(dir, 'e2e.json');
    writeFileSync(unit, '{"unit":1}', 'utf8');
    const collected = collectReports([unit, e2e], clearedAll([unit, e2e]));
    assert.deepStrictEqual(collected.contents, ['{"unit":1}']);
    assert.deepStrictEqual(collected.missing, [e2e]);
  });

  it('refuses a directory standing where a report should be', () => {
    const dir = scratch();
    const target = path.join(dir, 'unit.json');
    mkdirSync(target, { recursive: true });
    const collected = collectReports([target], clearedAll([target]));
    assert.deepStrictEqual(collected.contents, []);
    assert.deepStrictEqual(collected.irregular, [target]);
  });

  it('refuses a symlink where a report should be, whatever it points at', { skip: process.platform === 'win32' }, () => {
    // `lstat`, not `stat`. A symlink at the report path is not a report this attempt wrote, and
    // reading through it would be reading whatever somebody else arranged.
    const dir = scratch();
    const real = path.join(dir, 'elsewhere.json');
    const target = path.join(dir, 'unit.json');
    writeFileSync(real, '{"passing":"from somewhere else"}', 'utf8');
    symlinkSync(real, target);
    const collected = collectReports([target], clearedAll([target]));
    assert.deepStrictEqual(collected.contents, []);
    assert.deepStrictEqual(collected.irregular, [target]);
  });

  it('refuses a dangling symlink for the same reason', { skip: process.platform === 'win32' }, () => {
    const dir = scratch();
    const target = path.join(dir, 'unit.json');
    symlinkSync(path.join(dir, 'nothing-here.json'), target);
    assert.deepStrictEqual(collectReports([target], clearedAll([target])).contents, []);
  });

  it('returns nothing at all when no report paths are expected', () => {
    assert.deepStrictEqual(collectReports([], clearedAll([])), {
      contents: [],
      produced: [],
      missing: [],
      irregular: [],
      uncleared: [],
    });
  });
});

describe('a report path that could not be cleared (REVIEW F32)', () => {
  it('refuses every report of the attempt, and the survivor was one that would have banked', () => {
    // The reproduction, on a real filesystem. A read-only parent directory is what a POSIX host
    // has instead of Windows' locked handle: `unlink` is governed by the directory's write bit, so
    // the file survives while staying a perfectly readable regular file full of passing tests.
    const dir = scratch();
    const unit = path.join(dir, 'test-report.json');
    writeFileSync(unit, STALE_PASSING, 'utf8');
    chmodSync(dir, 0o555);
    const cleared = clearReports([unit]);
    if (cleared.stuck.length === 0) {
      // Root ignores the mode bits, so the condition this case needs could not be created. **Failed
      // rather than skipped**, on the same argument the live tier is armed by an environment
      // variable and fails without it: a green tick for a case that never ran is a lie the reader
      // takes for coverage. The neighbour below covers the same refusal without needing
      // permissions, so what is lost here is specifically the *readable survivor* — the shape a
      // Windows locked handle produces — and that is worth being told about rather than skipping.
      chmodSync(dir, 0o755);
      assert.fail(
        'this process can unlink from a read-only directory (running as root?), so a surviving readable report ' +
          'cannot be created and this case proved nothing. Run tier 1 as an ordinary user.',
      );
    }
    assert.deepStrictEqual(cleared.stuck, [unit]);
    assert.deepStrictEqual(cleared.cleared, []);

    // What the defect was worth: the survivor parses, and the id it yields is exactly the kind the
    // ratchet banks. Asserted before the refusal so the refusal is visibly the only thing stopping it.
    assert.deepStrictEqual(
      [...extractTestIds(readFileSync(unit, 'utf8'), { rootDir: dir })],
      ['src/a.test.js::a > passes'],
    );

    const collected = collectReports([unit], cleared);
    assert.deepStrictEqual(collected.contents, []);
    assert.deepStrictEqual(collected.produced, []);
    assert.deepStrictEqual(collected.uncleared, [unit]);
    // Not "missing" and not "irregular": the file is there and it is a regular file. Reporting it
    // as either would describe the wrong fault to whoever has to fix the filesystem.
    assert.deepStrictEqual(collected.missing, []);
    assert.deepStrictEqual(collected.irregular, []);
    chmodSync(dir, 0o755);
  });

  it('refuses the paths that cleared cleanly too, because a partial view is the worse answer', () => {
    // Deliberately broad. Ids are collapsed across every report by worst status, so a surviving
    // report adds passes the other files cannot contradict; and refusing only the stuck path would
    // hand the ratchet a set missing every id that path owned, which reads as a mass regression and
    // resets the tree. One re-run costs an iteration. A false reset costs the iteration's work.
    const dir = scratch();
    const unit = path.join(dir, 'unit.json');
    const e2e = path.join(dir, 'e2e.json');
    writeFileSync(unit, STALE_PASSING, 'utf8');
    writeFileSync(e2e, '{"e2e":1}', 'utf8');
    const collected = collectReports([unit, e2e], { cleared: [e2e], stuck: [unit] });
    assert.deepStrictEqual(collected.contents, []);
    assert.deepStrictEqual(collected.produced, []);
    assert.deepStrictEqual(collected.uncleared, [unit]);
  });

  it('collects normally once the same path clears, so the refusal is about this attempt only', () => {
    // The benign neighbour the refusal must not eat. Refusing everything is not passing.
    const dir = scratch();
    const unit = path.join(dir, 'unit.json');
    writeFileSync(unit, '{"stale":true}', 'utf8');
    const cleared = clearReports([unit]);
    assert.deepStrictEqual(cleared.stuck, []);
    writeFileSync(unit, STALE_PASSING, 'utf8');
    const collected = collectReports([unit], cleared);
    assert.deepStrictEqual(collected.contents, [STALE_PASSING]);
    assert.deepStrictEqual(collected.produced, [unit]);
    assert.deepStrictEqual(collected.uncleared, []);
  });

  it('refuses to collect at all when handed no clear outcome', () => {
    // A caller that never cleared cannot say whether what it is about to read is its own. The
    // typecheck rejects this shape; the throw is here for the caller the typecheck does not see.
    const dir = scratch();
    const unit = path.join(dir, 'unit.json');
    writeFileSync(unit, STALE_PASSING, 'utf8');
    assert.throws(
      // @ts-expect-error deliberately calling with the argument the contract requires omitted
      () => collectReports([unit]),
      /clear outcome/,
    );
  });

  it('refuses a clear outcome whose lists are not lists of paths', () => {
    // Malformed is not evidence of an empty stuck list, for the same reason an unparseable
    // reviewer verdict is not a pass. Both halves are checked: a record with a legible `stuck` and
    // an illegible `cleared` cannot say which paths it accounted for, so it accounts for none.
    const dir = scratch();
    const unit = path.join(dir, 'unit.json');
    writeFileSync(unit, STALE_PASSING, 'utf8');
    const bad = [
      { cleared: [], stuck: null },
      { cleared: [], stuck: 'unit.json' },
      { cleared: [], stuck: [7] },
      { cleared: null, stuck: [] },
      { cleared: 'unit.json', stuck: [] },
      { stuck: [] },
      { cleared: [] },
      {},
      null,
    ];
    for (const record of bad) {
      assert.throws(
        // @ts-expect-error deliberately malformed clear outcomes
        () => collectReports([unit], record),
        /clear outcome/,
        `${JSON.stringify(record)} was accepted as a clear outcome`,
      );
    }
  });
});

describe('the clear outcome is bound to the paths being collected (REVIEW F32)', () => {
  it('refuses a path the clear outcome says nothing about', () => {
    // Without this the required argument would be a gesture: any record at all would satisfy the
    // signature, and a caller could hand in last iteration's outcome, or another tree's, and read
    // whatever was on disk. "Required" has to mean "required to be about *these* paths".
    const dir = scratch();
    const unit = path.join(dir, 'unit.json');
    const e2e = path.join(dir, 'e2e.json');
    writeFileSync(unit, STALE_PASSING, 'utf8');
    writeFileSync(e2e, '{"e2e":1}', 'utf8');
    const collected = collectReports([unit, e2e], clearedAll([e2e]));
    assert.deepStrictEqual(collected.contents, []);
    assert.deepStrictEqual(collected.uncleared, [unit]);
  });

  it('accepts an outcome that accounts for more paths than are being collected', () => {
    // The benign neighbour. A toolchain that declares three reports and a caller reading two of
    // them is not a mismatch; only an *unaccounted* path is.
    const dir = scratch();
    const unit = path.join(dir, 'unit.json');
    const e2e = path.join(dir, 'e2e.json');
    writeFileSync(unit, STALE_PASSING, 'utf8');
    const collected = collectReports([unit], clearedAll([unit, e2e]));
    assert.deepStrictEqual(collected.contents, [STALE_PASSING]);
    assert.deepStrictEqual(collected.uncleared, []);
  });

  it('refuses a real removal failure that no permission bit can be talked out of', () => {
    // The root-proof half. `chmod` cannot create a stuck path for a process that ignores the mode
    // bits, but a path too long for the filesystem makes `rmSync` throw for anybody — so this case
    // exercises the *production* `clearReports` failure branch in every environment, including the
    // one where the readable-survivor case above cannot run.
    const dir = scratch();
    const unreachable = path.join(dir, `${'y'.repeat(300)}.json`);
    const cleared = clearReports([unreachable]);
    assert.deepStrictEqual(cleared.stuck, [unreachable]);
    assert.deepStrictEqual(cleared.cleared, []);
    const collected = collectReports([unreachable], cleared);
    assert.deepStrictEqual(collected.contents, []);
    assert.deepStrictEqual(collected.uncleared, [unreachable]);
    // And specifically not "missing", which is the answer an ordinary absent report gets. The two
    // are opposite instructions: one says this attempt produced nothing, the other says nobody
    // knows what is there.
    assert.deepStrictEqual(collected.missing, []);
  });
});
