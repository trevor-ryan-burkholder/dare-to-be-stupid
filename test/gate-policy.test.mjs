/**
 * Tests for the capability-to-gate table (DESIGN.md §4.2).
 *
 * The danger here is the opposite of everywhere else in this codebase. Elsewhere the failure
 * mode is a gate that passes when it should not; here it is a gate that never runs, which is
 * worse — a failing gate is visible and a missing one is not.
 *
 * So the assertions are about *absence*: which gates disappear for which project shapes, that
 * nothing disappears without a reason attached, and that the table covers every gate the
 * policy filters. That last one is why the completeness test builds its gate list from the
 * real toolchain registry rather than from a list retyped here. It is deliberately *not* a
 * claim about every gate the loop can produce: see `STATIC_GATES` for the two that bypass the
 * policy entirely, and why listing them here would be wrong rather than merely redundant.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CAPABILITY_ORDER } from '../scripts/capabilities.mjs';
import { GATE_POLICY, applicableGates, gateApplies } from '../scripts/gate-policy.mjs';
import { GATE_OPERATIONS } from '../scripts/toolchains/index.mjs';

/**
 * The gates that are not toolchain operations: static checks and the ratchet's own.
 *
 * **Policy-filtered gates only.** `GATE_POLICY` answers "does this gate apply to a project of this
 * shape", so a gate that never passes through `applicableGates` has nothing to declare and must not
 * be listed here. Two do not: `test-stability` (REVIEW F30) and `report-freshness` (REVIEW F32) are
 * appended to the result list unconditionally, because a flaky test and an uncleared report path are
 * facts about the attempt rather than about the project. Adding either to the table would claim a
 * capability condition that does not exist.
 */
const STATIC_GATES = ['ci', 'docs', 'observability', 'integrity', 'red-evidence'];

describe('the gate table', () => {
  it('names every gate the loop can produce', () => {
    // Built from the real registry, not retyped, so adding a toolchain operation without a
    // policy entry fails here rather than silently defaulting.
    for (const name of [...GATE_OPERATIONS, ...STATIC_GATES]) {
      assert.equal(Object.hasOwn(GATE_POLICY, name), true, `${name} has no entry in GATE_POLICY`);
    }
  });

  it('gives every entry a reason worth reading', () => {
    for (const [name, rule] of Object.entries(GATE_POLICY)) {
      assert.equal(typeof rule.why, 'string');
      assert.equal(rule.why.trim().length > 30, true, `${name}'s reason is too thin to audit`);
    }
  });

  it('only conditions gates on capabilities that exist', () => {
    for (const [name, rule] of Object.entries(GATE_POLICY)) {
      if (rule.appliesTo === null) continue;
      assert.equal(rule.appliesTo.length > 0, true, `${name} has an empty capability list, which would skip always`);
      for (const capability of rule.appliesTo) {
        assert.equal(CAPABILITY_ORDER.includes(capability), true, `${name} requires unknown capability ${capability}`);
      }
    }
  });

  it('conditions exactly three gates, and the rest are universal', () => {
    // Deliberately asserted as a whole. Every future addition to this list is a gate that
    // some project will not be checked by, so it should be hard to add one by accident.
    //
    // `oracle` joined at 0.72.0, and the addition is deliberate rather than incidental: the
    // held-out cases invoke a program with argv and compare its stdout, which is a CLI shape.
    // Arming it on an api or a library would be a gate that cannot pass rather than a check
    // that does anything — §4.2's defect class, which this repository has hit seven times.
    const conditional = Object.entries(GATE_POLICY)
      .filter(([, rule]) => rule.appliesTo !== null)
      .map(([name]) => name)
      .sort();
    assert.deepEqual(conditional, ['e2e', 'observability', 'oracle']);
  });
});

describe('gateApplies', () => {
  it('runs a universal gate whatever the project is', () => {
    for (const capabilities of [['library'], ['cli'], ['web-ui'], CAPABILITY_ORDER]) {
      assert.equal(gateApplies('build', capabilities).applies, true);
      assert.equal(gateApplies('unit', capabilities).applies, true);
      assert.equal(gateApplies('security-audit', capabilities).applies, true);
    }
  });

  it('runs e2e for a browser project and not for a command-line one', () => {
    assert.equal(gateApplies('e2e', ['web-ui']).applies, true);
    assert.equal(gateApplies('e2e', ['desktop-ui']).applies, true);
    assert.equal(gateApplies('e2e', ['cli']).applies, false);
    assert.equal(gateApplies('e2e', ['library', 'persistent-storage']).applies, false);
  });

  it('runs e2e when a project is several things and one of them has a screen', () => {
    assert.equal(gateApplies('e2e', ['api', 'persistent-storage', 'web-ui']).applies, true);
  });

  it('runs observability for something that listens and not for something that exits', () => {
    assert.equal(gateApplies('observability', ['api']).applies, true);
    assert.equal(gateApplies('observability', ['network-service']).applies, true);
    assert.equal(gateApplies('observability', ['cli']).applies, false);
    assert.equal(gateApplies('observability', ['library']).applies, false);
    // A pure front end has no health endpoint of its own either.
    assert.equal(gateApplies('observability', ['web-ui']).applies, false);
  });

  it('explains a skip in terms of what the project is not', () => {
    const verdict = gateApplies('e2e', ['cli']);
    assert.equal(verdict.applies, false);
    assert.equal(verdict.why.includes('web-ui'), true);
    assert.equal(verdict.why.includes('desktop-ui'), true);
    assert.equal(verdict.why.includes('browser'), true);
  });

  it('names the capability that kept a conditional gate armed', () => {
    assert.equal(gateApplies('e2e', ['web-ui', 'api']).why.includes('web-ui'), true);
  });

  it('runs an unrecognised gate rather than skipping it', () => {
    // The safe direction. A gate added without a table entry runs everywhere; the
    // completeness test above is what stops that being permanent.
    const verdict = gateApplies('quality:impeccable', ['cli']);
    assert.equal(verdict.applies, true);
    assert.equal(verdict.why.includes('default'), true);
  });

  it('is not fooled by a name inherited from Object.prototype', () => {
    const verdict = gateApplies('constructor', ['cli']);
    assert.equal(verdict.applies, true);
    assert.equal(verdict.why.includes('default'), true);
  });

  it('skips every conditional gate for a project with no capabilities, rather than throwing', () => {
    // `resolveCapabilities` already refuses an empty set, so this state should be unreachable.
    // If it ever happens, skipping loudly is still better than crashing a run mid-iteration —
    // and every universal gate keeps running.
    assert.equal(gateApplies('e2e', []).applies, false);
    assert.equal(gateApplies('build', []).applies, true);
  });
});

describe('applicableGates', () => {
  const gates = [
    { name: 'build', command: ['npm', 'run', 'build'] },
    { name: 'unit', command: ['npx', 'vitest', 'run'] },
    { name: 'e2e', command: ['npx', 'playwright', 'test'] },
    { name: 'observability', command: [] },
  ];

  it('keeps the applicable gates in order and returns the rest as skips', () => {
    const result = applicableGates(gates, ['cli']);
    assert.deepEqual(
      result.gates.map((gate) => gate.name),
      ['build', 'unit'],
    );
    assert.deepEqual(
      result.skipped.map((skip) => skip.name),
      ['e2e', 'observability'],
    );
  });

  it('carries a reason on every skip, so none of them is silent', () => {
    for (const skip of applicableGates(gates, ['library']).skipped) {
      assert.equal(typeof skip.reason, 'string');
      assert.equal(skip.reason.trim().length > 0, true, `${skip.name} was skipped without saying why`);
    }
  });

  it('keeps the whole list for a project that is everything', () => {
    const result = applicableGates(gates, ['web-ui', 'api']);
    assert.equal(result.gates.length, 4);
    assert.deepEqual(result.skipped, []);
  });

  it('preserves the gate objects untouched, not just their names', () => {
    // The driver runs these. A filter that rebuilt them could quietly drop `required`.
    const result = applicableGates(gates, ['web-ui', 'api']);
    assert.deepEqual(result.gates, gates);
  });

  it('returns empty lists for an empty gate list', () => {
    assert.deepEqual(applicableGates([], ['cli']), { gates: [], skipped: [] });
  });
});
