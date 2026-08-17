/**
 * Tests for per-attempt test-report freshness (REVIEW F16).
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
 */

import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { clearReports, collectReports } from '../scripts/reports.mjs';

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
    assert.deepStrictEqual(collectReports([unit]).contents, []);
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
    const collected = collectReports([unit, e2e]);
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
    const collected = collectReports([unit]);
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
    const collected = collectReports([unit, e2e]);
    assert.deepStrictEqual(collected.contents, ['{"unit":1}']);
    assert.deepStrictEqual(collected.missing, [e2e]);
  });

  it('refuses a directory standing where a report should be', () => {
    const dir = scratch();
    const target = path.join(dir, 'unit.json');
    mkdirSync(target, { recursive: true });
    const collected = collectReports([target]);
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
    const collected = collectReports([target]);
    assert.deepStrictEqual(collected.contents, []);
    assert.deepStrictEqual(collected.irregular, [target]);
  });

  it('refuses a dangling symlink for the same reason', { skip: process.platform === 'win32' }, () => {
    const dir = scratch();
    const target = path.join(dir, 'unit.json');
    symlinkSync(path.join(dir, 'nothing-here.json'), target);
    assert.deepStrictEqual(collectReports([target]).contents, []);
  });

  it('returns nothing at all when no report paths are expected', () => {
    assert.deepStrictEqual(collectReports([]), { contents: [], produced: [], missing: [], irregular: [] });
  });
});
