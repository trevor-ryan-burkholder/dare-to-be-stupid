/**
 * Tests for the size boundary on decision-bearing reads (REVIEW F19).
 *
 * The shell caps each output stream at 64MB and prompt submission has a character budget, but
 * several file-backed inputs were read whole before either applied: the operator's PRD, generated
 * test reports, reviewer evidence, and every tracked file hashed for workspace identity. A gate the
 * target controls writes reports under `.meeseeks/`, so "arbitrarily large" is reachable by the
 * thing being judged. The cost is an overnight run dying without a bounded terminal transition,
 * which is the one outcome item 64's receipt exists to prevent.
 *
 * The two halves are asserted separately because they answer differently: contents are **refused**
 * above a limit, and hashes have **no limit** and are streamed.
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import {
  ArtifactTooLargeError,
  READ_LIMITS,
  hashFileStreaming,
  measure,
  readBounded,
  readBoundedAsync,
} from '../scripts/bounded-read.mjs';

/** @type {string[]} */
const temporaryDirs = [];

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** @returns {string} */
function scratch() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-bounded-'));
  temporaryDirs.push(dir);
  return dir;
}

/** @param {string} dir @param {string} name @param {number} bytes @returns {string} */
function fileOf(dir, name, bytes) {
  const file = path.join(dir, name);
  writeFileSync(file, 'x'.repeat(bytes), 'utf8');
  return file;
}

describe('readBounded', () => {
  it('reads a file under the limit unchanged', () => {
    const file = fileOf(scratch(), 'small.json', 64);
    assert.equal(readBounded(file, 1024), 'x'.repeat(64));
  });

  it('reads a file exactly at the limit, because the boundary is inclusive', () => {
    // The neighbour that keeps this from being a limit nobody can reach. Off-by-one here would
    // refuse a legitimate artifact and be indistinguishable, to an operator, from the attack.
    const file = fileOf(scratch(), 'exact.json', 512);
    assert.equal(readBounded(file, 512).length, 512);
  });

  it('refuses one byte over, naming the artifact and both sizes', () => {
    const file = fileOf(scratch(), 'over.json', 513);
    assert.throws(
      () => readBounded(file, 512),
      (/** @type {unknown} */ error) => {
        assert.equal(error instanceof ArtifactTooLargeError, true);
        const refusal = /** @type {ArtifactTooLargeError} */ (error);
        assert.equal(refusal.size, 513);
        assert.equal(refusal.limit, 512);
        assert.equal(refusal.message.includes(file), true, refusal.message);
        assert.equal(refusal.message.includes('refused rather than'), true, refusal.message);
        return true;
      },
    );
  });

  it('refuses rather than truncating, which is the whole policy', () => {
    // A truncated report parses to fewer tests and a truncated document reads as a shorter one.
    // Either would be evidence nobody produced, so nothing here degrades to a short string.
    const file = fileOf(scratch(), 'huge.json', 4096);
    /** @type {string | null} */
    let returned = null;
    try {
      returned = readBounded(file, 100);
    } catch {
      // The refusal, which is what this asserts. `returned` staying null is the evidence.
    }
    assert.equal(returned, null, `a partial read of ${String(returned).length} bytes was returned instead of a refusal`);
  });

  it('does not degrade a missing file to empty evidence', () => {
    assert.throws(() => readBounded(path.join(scratch(), 'absent.json'), 1024));
  });

  it('bounds a file whose size could not be measured first', () => {
    // `stat` failing while `read` succeeds is a race, not a licence. The post-read check is the one
    // that cannot be skipped, so it is asserted against a path `measure` refuses to size.
    const dir = scratch();
    mkdirSync(path.join(dir, 'a-directory'), { recursive: true });
    assert.equal(measure(path.join(dir, 'a-directory')), null, 'the fixture no longer exercises the unmeasured path');
    assert.throws(() => readBounded(path.join(dir, 'a-directory'), 512));
  });

  it('measures a regular file and refuses to size anything else', () => {
    const dir = scratch();
    assert.equal(measure(fileOf(dir, 'm.json', 7)), 7);
    assert.equal(measure(path.join(dir, 'nope.json')), null);
  });

  it('applies the same rule off the main thread', async () => {
    const dir = scratch();
    assert.equal((await readBoundedAsync(fileOf(dir, 'ok.json', 32), 1024)).length, 32);
    await assert.rejects(() => readBoundedAsync(fileOf(dir, 'big.json', 2048), 1024), ArtifactTooLargeError);
  });

  it('gives each artifact class a limit an honest project cannot reach', () => {
    // Asserted as values rather than described, so a later edit that quietly drops one to a
    // reachable size fails here rather than in an overnight run.
    assert.equal(READ_LIMITS.specification, 4 * 1024 * 1024);
    assert.equal(READ_LIMITS.report, 32 * 1024 * 1024);
    assert.equal(READ_LIMITS.evidence, 4 * 1024 * 1024);
    assert.equal(READ_LIMITS.record, 16 * 1024 * 1024);
    // The largest committed reporter fixture, for scale: the report limit is orders above it.
    const fixture = readFileSync(new URL('./fixtures/reporters/vitest-4.1.10-run1.json', import.meta.url));
    assert.equal(fixture.length < READ_LIMITS.report / 1000, true, `fixture is ${fixture.length} bytes`);
  });
});

describe('hashFileStreaming', () => {
  it('agrees with the digest of the whole file, which is what makes it a drop-in', async () => {
    // The property that matters for the gate cache: switching to streaming must not change any
    // workspace identity, or every gate re-runs once for no reason.
    const file = fileOf(scratch(), 'blob.bin', 300_000);
    const whole = createHash('sha256').update(readFileSync(file)).digest('hex');
    assert.equal(await hashFileStreaming(file), whole);
  });

  it('hashes a file far larger than any read limit, because hashing has no limit', async () => {
    // The deliberate asymmetry. Refusing to hash a big file would make workspace identity — and so
    // the gate cache and the F14 verdict seal — unavailable on a repository that is merely large.
    const file = fileOf(scratch(), 'enormous.bin', READ_LIMITS.evidence + 1024);
    const digest = await hashFileStreaming(file);
    assert.equal(typeof digest, 'string');
    assert.equal(/** @type {string} */ (digest).length, 64);
  });

  it('answers null for a file it cannot read, which is not a digest', async () => {
    assert.equal(await hashFileStreaming(path.join(scratch(), 'absent.bin')), null);
  });

  it('answers null for a dangling symlink rather than hashing nothing', { skip: process.platform === 'win32' }, async () => {
    const dir = scratch();
    symlinkSync(path.join(dir, 'nowhere.bin'), path.join(dir, 'link.bin'));
    assert.equal(await hashFileStreaming(path.join(dir, 'link.bin')), null);
  });
});
