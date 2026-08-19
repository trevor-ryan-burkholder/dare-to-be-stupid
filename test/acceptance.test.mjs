/**
 * Tests for the acceptance receipt (REVIEW F22, PLAN item 76).
 *
 * **The complaint this answers, verbatim from the first audited `SHIPPED`:** an operator can
 * establish that Meeseeks said it, and can read the panel, and cannot reconstruct which
 * deterministic checks passed on which exact bytes. Gate results were transient and the reports were
 * excluded from the archive on purpose, so the acceptance edge simply was not written down.
 *
 * Every case here is about a receipt refusing to be *comfortable*: incomplete rather than
 * approximate, `unavailable` rather than assumed, and about one subject rather than about whatever
 * is on disk when somebody reads it.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ACCEPTANCE_CLAIM,
  ACCEPTANCE_VERSION,
  AcceptanceError,
  buildAcceptanceReceipt,
  digest,
  modelIdentityHolds,
  verifyAcceptanceReceipt,
} from '../scripts/acceptance.mjs';

/** @param {Record<string, any>} [overrides] @returns {any} */
function complete(overrides = {}) {
  return {
    subject: { tree: 'sha256:tree', commit: 'abc123def456' },
    inputs: {
      specification: 'sha256:spec',
      config: 'sha256:config',
      plugin: '0.209.0',
      cli: '2.1.234',
      gateRoster: ['lint', 'unit'],
    },
    results: {
      terminal: 'SHIPPED',
      gates: [
        { name: 'lint', ok: true, status: 0, detailDigest: digest('passed') },
        { name: 'unit', ok: true, status: 0, detailDigest: digest('12 passed') },
      ],
      panelDigest: 'sha256:panel',
      ratchetPassing: 12,
      oracle: 'sha256:oracle',
      deploy: null,
    },
    invocations: [
      {
        role: 'review',
        requestedModel: 'claude-sonnet-5',
        requestedEffort: 'high',
        models: { observed: ['claude-sonnet-5'] },
        supplyDigest: 'sha256:supply',
      },
    ],
    at: '2026-08-19T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildAcceptanceReceipt', () => {
  it('binds one claim to one subject, and separates inputs from results', () => {
    const receipt = buildAcceptanceReceipt(complete());

    assert.equal(receipt.version, ACCEPTANCE_VERSION);
    assert.equal(receipt.claim, ACCEPTANCE_CLAIM);
    assert.deepStrictEqual(receipt.subject, { tree: 'sha256:tree', commit: 'abc123def456' });
    // What the run was held to, apart from what it achieved — the distinction a reader needs to
    // tell "these were the rules" from "this is what happened".
    assert.deepStrictEqual(Object.keys(/** @type {any} */ (receipt).inputs).sort(), [
      'cli',
      'config',
      'gateRoster',
      'plugin',
      'specification',
    ]);
    assert.equal(/** @type {any} */ (receipt).results.terminal, 'SHIPPED');
  });

  it('sorts the roster and the gates, so two receipts for one tree compare', () => {
    const receipt = buildAcceptanceReceipt(
      complete({
        inputs: { ...complete().inputs, gateRoster: ['unit', 'lint'] },
        results: { ...complete().results, gates: [...complete().results.gates].reverse() },
      }),
    );

    assert.deepStrictEqual(/** @type {any} */ (receipt).inputs.gateRoster, ['lint', 'unit']);
    assert.deepStrictEqual(
      /** @type {any} */ (receipt).results.gates.map((/** @type {any} */ gate) => gate.name),
      ['lint', 'unit'],
    );
  });

  it('refuses a receipt with no subject, because a claim with no subject is an opinion', () => {
    assert.throws(() => buildAcceptanceReceipt(complete({ subject: { tree: '', commit: null } })), AcceptanceError);
  });

  it('refuses a placeholder identity, which looks like evidence at a glance', () => {
    // The shapes a field takes when somebody wanted it filled. Each would read as provenance.
    for (const placeholder of ['', 'unknown', 'n/a', 'none', 'null']) {
      assert.throws(
        () => buildAcceptanceReceipt(complete({ inputs: { ...complete().inputs, cli: placeholder } })),
        AcceptanceError,
        `${JSON.stringify(placeholder)} was accepted as a CLI identity`,
      );
    }
  });

  it('names every missing field at once, so a fix is one pass rather than five', () => {
    try {
      buildAcceptanceReceipt(complete({ subject: {}, inputs: { gateRoster: [] }, results: {}, invocations: [] }));
      assert.fail('an empty receipt was accepted');
    } catch (error) {
      const message = /** @type {Error} */ (error).message;
      for (const field of ['subject.tree', 'inputs.specification', 'inputs.gateRoster', 'results.terminal']) {
        assert.equal(message.includes(field), true, `${field} was not reported: ${message}`);
      }
    }
  });

  it('refuses when a required gate has no result, which is not the same as failing', () => {
    // **The distinction the whole roster exists for.** A gate absent from the results and a gate
    // that failed are different facts, and collapsing them makes "everything required passed"
    // unfalsifiable.
    assert.throws(
      () =>
        buildAcceptanceReceipt(
          complete({ inputs: { ...complete().inputs, gateRoster: ['lint', 'unit', 'types'] } }),
        ),
      /types is in the roster and has no result/,
    );
  });

  it('keeps a deliberately failed gate, rather than dropping it to look clean', () => {
    const receipt = buildAcceptanceReceipt(
      complete({
        results: {
          ...complete().results,
          terminal: 'STALLED',
          gates: [
            { name: 'lint', ok: true, status: 0, detailDigest: digest('passed') },
            { name: 'unit', ok: false, status: 1, detailDigest: digest('3 failed') },
          ],
        },
      }),
    );

    const unit = /** @type {any} */ (receipt).results.gates.find((/** @type {any} */ g) => g.name === 'unit');
    assert.equal(unit.ok, false);
    assert.equal(unit.status, 1);
  });

  it('records the requested model and the observed one as different facts', () => {
    // A configured alias is not evidence that the requested model answered. The receipt has to be
    // able to *show* a substitution, which means keeping both.
    const receipt = buildAcceptanceReceipt(
      complete({
        invocations: [
          {
            role: 'review',
            requestedModel: 'claude-sonnet-5',
            requestedEffort: null,
            models: { observed: ['claude-haiku-4-5-20251001'] },
            supplyDigest: null,
          },
        ],
      }),
    );

    const [invocation] = /** @type {any} */ (receipt).invocations;
    assert.equal(invocation.requestedModel, 'claude-sonnet-5');
    assert.deepStrictEqual(invocation.models, { observed: ['claude-haiku-4-5-20251001'] });
  });

  it('accepts an explicit unavailable observation, and refuses an unrecorded one', () => {
    // `unavailable` with a reason keeps the receipt complete — forensically it is the honest answer.
    // An invocation with no `models` field at all is *not* the same thing: nobody recorded whether
    // the vendor reported anything, and that gap must not read as "it reported nothing".
    const base = complete().invocations[0];
    assert.doesNotThrow(() =>
      buildAcceptanceReceipt(complete({ invocations: [{ ...base, models: { unavailable: 'the envelope carried no map' } }] })),
    );
    assert.throws(
      () => buildAcceptanceReceipt(complete({ invocations: [{ ...base, models: undefined }] })),
      AcceptanceError,
    );
    assert.throws(
      () => buildAcceptanceReceipt(complete({ invocations: [{ ...base, models: { observed: [] } }] })),
      AcceptanceError,
      'an empty observation list was accepted as an observation',
    );
  });
});

describe('verifyAcceptanceReceipt', () => {
  it('accepts a complete receipt for the subject it was asked about', () => {
    const receipt = buildAcceptanceReceipt(complete());
    const verdict = verifyAcceptanceReceipt(receipt, { tree: 'sha256:tree' });
    assert.equal(verdict.ok, true, /** @type {any} */ (verdict).reason);
  });

  it('refuses a receipt about different bytes', () => {
    // The whole point of a subject. A receipt for another tree establishes nothing about this one,
    // and an auditor who did not check would be reading somebody else's evidence.
    const verdict = verifyAcceptanceReceipt(buildAcceptanceReceipt(complete()), { tree: 'sha256:other' });
    assert.equal(verdict.ok, false);
    assert.equal(/** @type {any} */ (verdict).reason.includes('establishes nothing about these ones'), true);
  });

  it('refuses an unknown schema version and an unknown claim type', () => {
    const receipt = buildAcceptanceReceipt(complete());
    assert.equal(verifyAcceptanceReceipt({ ...receipt, version: 99 }).ok, false);
    assert.equal(verifyAcceptanceReceipt({ ...receipt, claim: 'something.else/v1' }).ok, false);
  });

  it('refuses a receipt whose field was deleted or corrupted on disk', () => {
    // The same completeness rule that refused to write it refuses to read it, so tampering after
    // the fact fails exactly where authoring would have.
    const receipt = /** @type {any} */ (buildAcceptanceReceipt(complete()));
    const gutted = { ...receipt, inputs: { ...receipt.inputs, specification: 'unknown' } };
    const verdict = verifyAcceptanceReceipt(gutted);
    assert.equal(verdict.ok, false);
    assert.equal(/** @type {any} */ (verdict).reason.includes('inputs.specification'), true);
  });

  it('refuses anything that is not a receipt at all', () => {
    assert.equal(verifyAcceptanceReceipt(null).ok, false);
    assert.equal(verifyAcceptanceReceipt('a string').ok, false);
  });
});

describe('modelIdentityHolds', () => {
  it('holds when every invocation was served by the model it asked for', () => {
    assert.deepStrictEqual(modelIdentityHolds(buildAcceptanceReceipt(complete())), { ok: true, unmatched: [] });
  });

  it('exposes a substitution rather than hiding it behind the selector', () => {
    const receipt = buildAcceptanceReceipt(
      complete({
        invocations: [
          { ...complete().invocations[0], models: { observed: ['claude-haiku-4-5-20251001'] } },
        ],
      }),
    );

    const verdict = modelIdentityHolds(receipt);

    assert.equal(verdict.ok, false);
    assert.equal(verdict.unmatched[0].includes('requested claude-sonnet-5'), true, verdict.unmatched[0]);
    assert.equal(verdict.unmatched[0].includes('served by claude-haiku-4-5-20251001'), true, verdict.unmatched[0]);
  });

  it('refuses to let an unavailable observation stand in for a match', () => {
    // **The clause F22 is most explicit about.** `unavailable` keeps the receipt complete and can
    // never satisfy a model-identity claim: an absence of vendor evidence is not vendor evidence.
    const receipt = buildAcceptanceReceipt(
      complete({
        invocations: [{ ...complete().invocations[0], models: { unavailable: 'the envelope carried no modelUsage map' } }],
      }),
    );

    const verdict = modelIdentityHolds(receipt);

    assert.equal(verdict.ok, false);
    assert.equal(verdict.unmatched[0].includes('no modelUsage map'), true, verdict.unmatched[0]);
  });
});
