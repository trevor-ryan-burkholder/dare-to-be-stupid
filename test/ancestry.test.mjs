/**
 * Nesting depth from process ancestry (`scripts/ancestry.mjs`, REVIEW F42, DESIGN §6.6).
 *
 * The bypass this closes is one command: `env -u MEESEEKS_RUNNING node …/driver.mjs`. Every
 * hardening on the recognized nested path sits behind an `if` on that variable, and a Builder with
 * Bash owns it. What a Builder does not own is who its parents are.
 *
 * So the cases here are about **disagreement**: what happens when the environment's account and the
 * ancestry's account differ, and in which direction. A module that agreed with the environment
 * whenever the environment was confident would pass a naive suite and close nothing.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MAX_ANCESTRY_DEPTH, ancestorPids, depthFromAncestry, reconcileDepth } from '../scripts/ancestry.mjs';

/** A process tree as a child→parent map. @param {Record<number, number>} tree */
const io = (tree) => ({ ppidOf: (/** @type {number} */ pid) => tree[pid] ?? null });

describe('ancestorPids', () => {
  it('walks to the top of the tree, nearest first', () => {
    assert.deepEqual(ancestorPids(50, io({ 50: 40, 40: 30, 30: 1 })), [40, 30, 1]);
  });

  it('stops at a process with no parent', () => {
    assert.deepEqual(ancestorPids(50, io({ 50: 40 })), [40]);
    assert.deepEqual(ancestorPids(50, io({})), []);
  });

  it('stops rather than looping on a cycle', () => {
    // A pid table is not a tree this code controls, and an unbounded walk is a hang in the one
    // place that must never hang: before the run starts.
    assert.deepEqual(ancestorPids(50, io({ 50: 40, 40: 50 })), [40]);
    assert.deepEqual(ancestorPids(50, io({ 50: 50 })), []);
  });

  it('is bounded even on a chain that never ends', () => {
    const endless = { ppidOf: (/** @type {number} */ pid) => pid + 1 };
    assert.equal(ancestorPids(1000, endless).length, MAX_ANCESTRY_DEPTH);
  });

  it('ends the chain when a pid vanishes mid-walk', () => {
    // A process that exited between two reads cannot be a registered ancestor of one that is still
    // running, so stopping loses nothing — and throwing here would abort a legitimate start.
    const flaky = {
      ppidOf: (/** @type {number} */ pid) => {
        if (pid === 40) throw new Error('ESRCH');
        return pid === 50 ? 40 : null;
      },
    };
    assert.deepEqual(ancestorPids(50, flaky), [40]);
  });
});

describe('depthFromAncestry', () => {
  it('reports top level when no ancestor is a registered run', () => {
    assert.deepEqual(depthFromAncestry([40, 30, 1], () => null), { depth: 0, via: null });
  });

  it('reports one deeper than the registered ancestor, and names it', () => {
    assert.deepEqual(depthFromAncestry([40, 30, 1], (pid) => (pid === 30 ? 0 : null)), { depth: 1, via: 30 });
    assert.deepEqual(depthFromAncestry([40, 30, 1], (pid) => (pid === 30 ? 1 : null)), { depth: 2, via: 30 });
  });

  it('takes the nearest registered ancestor, not the furthest', () => {
    // An intermediate Driver that failed to register would otherwise let a grandchild inherit its
    // grandparent's depth and appear a generation shallower than it is. The nearest match is the
    // deepest position this process can prove it is below.
    assert.deepEqual(
      depthFromAncestry([40, 30, 1], (pid) => (pid === 40 ? 1 : pid === 30 ? 0 : null)),
      { depth: 2, via: 40 },
    );
  });
});

describe('reconcileDepth', () => {
  it('agrees when both accounts agree', () => {
    assert.deepEqual(reconcileDepth({ depth: 0, via: null }, 0), { ok: true });
    assert.deepEqual(reconcileDepth({ depth: 2, via: 30 }, 2), { ok: true });
  });

  it('refuses the F42 bypass: ancestry says nested, the environment says top level', () => {
    // `env -u MEESEEKS_RUNNING node …/driver.mjs`, performed. This is the entire point of the
    // module, and the refusal names the run it is nested inside rather than asserting abstractly.
    const verdict = reconcileDepth({ depth: 1, via: 4242 }, 0);
    assert.equal(verdict.ok, false);
    assert.match(verdict.ok === false ? verdict.reason : '', /descendant of run 4242/);
    assert.match(verdict.ok === false ? verdict.reason : '', /A run marker was cleared/);
  });

  it('permits a claim of greater depth than ancestry can corroborate', () => {
    // **The asymmetry is the threat model, not a compromise.** Claiming a *shallower* depth buys an
    // attacker the nesting cap and the ticket check; claiming a *deeper* one buys nothing, because
    // depth only ever restricts.
    //
    // The first version refused this too, on a symmetry argument. The integration suite refuted it
    // within one run: a legitimately authorized component holds a redeemed ticket for depth one and
    // its parent may be unregistered through nobody's fault — a read-only home, a host where
    // registration is unavailable — so refusing here turns best-effort registration into a hard
    // dependency and breaks every boxed run on such a host.
    assert.deepEqual(reconcileDepth({ depth: 0, via: null }, 1), { ok: true });
    assert.deepEqual(reconcileDepth({ depth: 1, via: 30 }, 2), { ok: true });
  });

  it('still refuses the shallower direction at every depth, which is the one that buys something', () => {
    // The neighbour for the case above: permitting one direction must not have permitted both.
    for (const [ancestry, claimed] of [[1, 0], [2, 0], [2, 1], [3, 1]]) {
      const verdict = reconcileDepth({ depth: ancestry, via: 4242 }, claimed);
      assert.equal(verdict.ok, false, `ancestry ${ancestry} against a claim of ${claimed} was permitted`);
    }
  });

  it('does not contradict anything when ancestry is unknown', () => {
    // Windows, where the walk is unavailable (item 65). Reporting `unknown` rather than zero is the
    // difference between a truth and a claim: a zero here would be this module inventing the very
    // fact it exists to check, and it would refuse every legitimate boxed component on that host.
    assert.deepEqual(reconcileDepth({ depth: 'unknown' }, 0), { ok: true });
    assert.deepEqual(reconcileDepth({ depth: 'unknown' }, 2), { ok: true });
  });
});
