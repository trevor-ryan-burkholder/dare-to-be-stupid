/**
 * The corrupt-state quarantine helper (BORROWED R26). The readers that own each decision file
 * exercise it in place (ratchet, pins, red-evidence tests); this covers its own edge cases: a
 * same-stamp collision must not clobber the first evidence, a vanished file must not crash, and the
 * stamp must be filename-safe.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { quarantineCorruptFile } from '../scripts/quarantine.mjs';

/** @type {string[]} */
const temporaryDirs = [];

/** @returns {string} */
function makeTempDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-quarantine-'));
  temporaryDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

describe('quarantineCorruptFile', () => {
  it('moves the file aside to a timestamped sibling and returns the new path', () => {
    const dir = makeTempDir();
    const file = path.join(dir, 'state.json');
    writeFileSync(file, 'corrupt bytes', 'utf8');
    /** @type {string[]} */
    const logged = [];
    const target = quarantineCorruptFile(file, { now: 1700000000000, log: (line) => logged.push(line) });
    assert.equal(target, path.join(dir, 'state.json.corrupt-1700000000000'));
    assert.deepStrictEqual(readdirSync(dir).sort(), ['state.json.corrupt-1700000000000']);
    assert.equal(readFileSync(/** @type {string} */ (target), 'utf8'), 'corrupt bytes');
    assert.equal(logged.length, 1);
    assert.match(logged[0], /quarantined to/);
  });

  it('does not clobber an earlier quarantine sharing the same millisecond stamp', () => {
    const dir = makeTempDir();
    const file = path.join(dir, 'state.json');

    writeFileSync(file, 'first corruption', 'utf8');
    const first = quarantineCorruptFile(file, { now: 42, log: () => {} });
    writeFileSync(file, 'second corruption', 'utf8');
    const second = quarantineCorruptFile(file, { now: 42, log: () => {} });

    assert.equal(first, path.join(dir, 'state.json.corrupt-42'));
    assert.equal(second, path.join(dir, 'state.json.corrupt-42-1'));
    // Both sets of evidence survive, distinct.
    assert.equal(readFileSync(/** @type {string} */ (first), 'utf8'), 'first corruption');
    assert.equal(readFileSync(/** @type {string} */ (second), 'utf8'), 'second corruption');
  });

  it('returns null and announces when there is nothing to move aside', () => {
    const dir = makeTempDir();
    const file = path.join(dir, 'gone.json');
    /** @type {string[]} */
    const logged = [];
    const target = quarantineCorruptFile(file, { now: 1, log: (line) => logged.push(line) });
    assert.equal(target, null);
    assert.equal(logged.length, 1);
    assert.match(logged[0], /no longer exists to quarantine/);
  });

  it('uses a filename-safe millisecond stamp, never a colon-bearing ISO string', () => {
    const dir = makeTempDir();
    const file = path.join(dir, 'pins.json');
    writeFileSync(file, 'x', 'utf8');
    const target = /** @type {string} */ (quarantineCorruptFile(file, { now: 1700000000000, log: () => {} }));
    assert.equal(path.basename(target).includes(':'), false);
  });

  it('keepInPlace leaves the file untouched and only announces, so a throw stays a persistent wall', () => {
    // For the ratchet and pins the strict interpretation is a throw; moving the file would let the
    // next read see ENOENT and return a clean slate. keepInPlace preserves the bytes by not
    // touching them, so every subsequent read re-throws.
    const dir = makeTempDir();
    const file = path.join(dir, 'state.json');
    writeFileSync(file, '{ corrupt', 'utf8');
    /** @type {string[]} */
    const logged = [];
    const target = quarantineCorruptFile(file, { now: 1, keepInPlace: true, log: (line) => logged.push(line) });
    assert.equal(target, null);
    assert.deepStrictEqual(readdirSync(dir).sort(), ['state.json'], 'the file was moved despite keepInPlace');
    assert.equal(readFileSync(file, 'utf8'), '{ corrupt');
    assert.match(logged[0], /left in place/);
  });
});
