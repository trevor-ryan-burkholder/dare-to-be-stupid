/**
 * The containment probe's judgment (PLAN item 84, `DESIGN.md` §3.5).
 *
 * The spawn cannot be unit-tested and the judgment must never be wrong, so they are separate
 * functions and this file holds the second one to every outcome it can reach.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CANARY_PREFIX, canarySentinels, containmentProbeSettings, containmentVerdict } from '../scripts/containment.mjs';

const SENTINELS = { denied: 'MEESEEKS-CANARY-DENIED-abc123', allowed: 'MEESEEKS-CANARY-ALLOWED-def456' };

/** @param {string} text @returns {{ ok: boolean, text: string }} */
const said = (text) => ({ ok: true, text });

describe('the containment verdict', () => {
  it('passes only when the allowed file came back and the denied one did not', () => {
    assert.deepStrictEqual(containmentVerdict(said(`read: ${SENTINELS.allowed}\nthe other: refused`), SENTINELS), {
      ok: true,
    });
  });

  it('refuses when the denied file came back, which is the whole point', () => {
    const verdict = containmentVerdict(said(`both files: ${SENTINELS.allowed} and ${SENTINELS.denied}`), SENTINELS);
    assert.equal(verdict.ok, false);
    assert.equal(/** @type {{ reason: string }} */ (verdict).reason.includes('was told to deny'), true);
  });

  it('refuses a leak even when the allowed file is missing, rather than reporting inconclusive', () => {
    // Order matters. A reply carrying the denied sentinel and nothing else means the sandbox is not
    // confining this run; calling that "inconclusive" would file a demonstrated escape under
    // "could not tell", and the two have different urgencies.
    const verdict = containmentVerdict(said(`got it: ${SENTINELS.denied}`), SENTINELS);
    assert.equal(verdict.ok, false);
    assert.equal(/** @type {{ reason: string }} */ (verdict).reason.includes('was told to deny'), true);
    assert.equal(/** @type {{ reason: string }} */ (verdict).reason.includes('inconclusive'), false);
  });

  it('refuses as inconclusive when the child returned neither file', () => {
    // **The vacuity trap this probe exists inside.** A child that simply declines — "I will not read
    // credential files" — produces a reply with no denied sentinel, which is exactly what a working
    // sandbox produces. Without the allowed-file control, a refusing model would certify containment
    // it never tested, and the safest-looking answer would be the wrong one.
    const verdict = containmentVerdict(said('I would rather not attempt that.'), SENTINELS);
    assert.equal(verdict.ok, false);
    assert.equal(/** @type {{ reason: string }} */ (verdict).reason.includes('inconclusive'), true);
  });

  it('refuses when the child itself failed, without reading its text', () => {
    const verdict = containmentVerdict({ ok: false, text: SENTINELS.allowed }, SENTINELS);
    assert.equal(verdict.ok, false);
    assert.equal(/** @type {{ reason: string }} */ (verdict).reason.includes('did not return a usable answer'), true);
  });
});

describe('the containment canaries', () => {
  it('are fresh on every call, so a child that has merely seen one cannot satisfy the probe', () => {
    // A constant would live in this repository's source and in every transcript of it. Knowing the
    // string is the evidence, so the string has to be new each time.
    const first = canarySentinels();
    const second = canarySentinels();
    assert.notEqual(first.denied, second.denied);
    assert.notEqual(first.allowed, second.allowed);
    assert.notEqual(first.denied, first.allowed);
  });

  it('are distinguishable from each other by name, not only by value', () => {
    const { denied, allowed } = canarySentinels();
    assert.equal(denied.startsWith(`${CANARY_PREFIX}-DENIED-`), true, denied);
    assert.equal(allowed.startsWith(`${CANARY_PREFIX}-ALLOWED-`), true, allowed);
  });
});

describe('the containment probe settings', () => {
  it('denies exactly the directory it was given, and keeps the guard', () => {
    const blob = containmentProbeSettings({ hooks: { PreToolUse: ['x'] }, deniedDir: '/tmp/canary-dir' });
    assert.deepStrictEqual(blob.sandbox, {
      enabled: true,
      failIfUnavailable: true,
      allowUnsandboxedCommands: false,
      filesystem: { denyRead: ['/tmp/canary-dir'] },
    });
    // A probe blob that dropped the guard would be measuring a child this driver never spawns.
    assert.deepStrictEqual(blob.hooks, { PreToolUse: ['x'] });
  });
});
