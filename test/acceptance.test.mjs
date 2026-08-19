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
        // A static gate runs no process: `commandDigest: null` says so, and is a different fact from
        // an absent field, which means nobody recorded what produced the result (REVIEW F22).
        { name: 'lint', ok: true, status: 0, detailDigest: digest('passed'), commandDigest: null, attempt: 3, reports: [] },
        {
          name: 'unit',
          ok: true,
          status: 0,
          detailDigest: digest('12 passed'),
          commandDigest: digest('npx vitest run'),
          attempt: 3,
          reports: [digest('the unit report')],
        },
      ],
      panelDigest: 'sha256:panel',
      ratchetPassing: 12,
      reports: [digest('the unit report')],
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
    ledgerLapses: [],
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
            { name: 'lint', ok: true, status: 0, detailDigest: digest('passed'), commandDigest: null, attempt: 3, reports: [] },
            {
              name: 'unit',
              ok: false,
              status: 1,
              detailDigest: digest('3 failed'),
              commandDigest: digest('npx vitest run'),
              attempt: 3,
              reports: [digest('the unit report')],
            },
          ],
        },
      }),
    );

    const unit = /** @type {any} */ (receipt).results.gates.find((/** @type {any} */ g) => g.name === 'unit');
    assert.equal(unit.ok, false);
    assert.equal(unit.status, 1);
  });

  it('refuses an unidentifiable report entry instead of preserving an empty digest', () => {
    const input = complete();
    input.results.gates[1].reports = [null];
    input.results.reports = [null];

    assert.throws(() => buildAcceptanceReceipt(input), /results\.gates\[1\]\.reports\[0\]/);
    assert.throws(() => buildAcceptanceReceipt(input), /results\.reports\[0\]/);
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
    assert.throws(
      () =>
        buildAcceptanceReceipt(
          complete({
            invocations: [
              { ...base, models: { observed: ['claude-sonnet-5'], unavailable: 'the same observation is also absent' } },
            ],
          }),
        ),
      AcceptanceError,
      'both variants of the tagged union were accepted at once',
    );
    assert.throws(
      () =>
        buildAcceptanceReceipt(
          complete({ invocations: [{ ...base, models: { observed: ['claude-sonnet-5'], source: 'untyped-extra' } }] }),
        ),
      AcceptanceError,
      'an extra field made an allegedly typed observation ambiguous',
    );
  });
});

describe('the receipt refuses a ledger it could not read (REVIEW F22, audit)', () => {
  // **An empty invocation list used to build, verify, and satisfy `modelIdentityHolds` vacuously.**
  // A run that reaches a terminal state spawned children by construction, so an empty list means the
  // supply store could not be read — and `recordedInvocations` returns `[]` for exactly that. The
  // result was a *complete* `SHIPPED` receipt on which the strongest check the module offers
  // reported that model identity held, about invocations nobody recorded.

  it('refuses a receipt with no invocations at all', () => {
    assert.throws(() => buildAcceptanceReceipt(complete({ invocations: [] })), /none were recorded/);
  });

  it('does not let an empty ledger satisfy a model-identity claim', () => {
    const verdict = modelIdentityHolds({ invocations: [] });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.unmatched[0].includes('no invocation was recorded'), true, verdict.unmatched[0]);
  });

  it('records a ledger lapse as a gap, not as an invocation wearing a placeholder', () => {
    // **The receipt is the "later verifier" `role-supply.mjs` writes its lapse for.** The first draft
    // pushed it into `invocations` with `requestedModel: 'none'` — and the completeness rule refused
    // it, correctly: `none` is exactly the placeholder shape `isIdentity` exists to reject. A lapse
    // is a statement about the ledger, not about a model, so it gets its own field.
    const receipt = /** @type {any} */ (
      buildAcceptanceReceipt(complete({ ledgerLapses: ['the previous supply store could not be read'] }))
    );

    assert.deepStrictEqual(receipt.ledgerLapses, ['the previous supply store could not be read']);
    assert.equal(receipt.invocations.length, 1, 'the lapse was counted as an invocation');
  });

  it('refuses a model-identity claim while the ledger has a hole in it', () => {
    // Whatever the surviving entries say, a ledger that lost a segment cannot support a claim about
    // *every* invocation the run made.
    const receipt = buildAcceptanceReceipt(complete({ ledgerLapses: ['the previous supply store could not be read'] }));

    const verdict = modelIdentityHolds(receipt);

    assert.equal(verdict.ok, false, 'a run with a lost ledger segment claimed a clean model identity');
    assert.equal(verdict.unmatched[0].includes('not continuous'), true, verdict.unmatched[0]);
  });

  it('still holds when the ledger is continuous, which is every ordinary run', () => {
    // The neighbour: a lapse field that refused everything would make the check useless.
    assert.equal(modelIdentityHolds(buildAcceptanceReceipt(complete())).ok, true);
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

describe('a receipt that cannot survive its own verifier (REVIEW F22, reopened)', () => {
  // **Codex's list, case by case.** Each of these produced `ok: true` before: the verifier rebuilt
  // the receipt and threw the rebuilt object away, and the builder coerced a deleted or corrupted
  // value into a default that the rebuild then reproduced. A receipt that verifies clean after its
  // gate statuses have been replaced by strings is not a proof of anything.

  /** @param {Record<string, any>} [overrides] @returns {any} */
  const written = (overrides = {}) => JSON.parse(JSON.stringify(buildAcceptanceReceipt(complete(overrides))));

  it('refuses a gate status replaced by a string', () => {
    const receipt = written();
    receipt.results.gates[0].status = 'ok';
    const verdict = verifyAcceptanceReceipt(receipt);
    assert.equal(verdict.ok, false);
    assert.equal(/** @type {any} */ (verdict).reason.includes('results.gates[0].status'), true, /** @type {any} */ (verdict).reason);
  });

  it('refuses a missing gate status instead of treating absence as success', () => {
    const receipt = written();
    delete receipt.results.gates[0].status;
    const verdict = verifyAcceptanceReceipt(receipt);
    assert.equal(verdict.ok, false);
    assert.equal(/** @type {any} */ (verdict).reason.includes('results.gates[0].status'), true);
  });

  it('refuses a ratchet count replaced by a string, rather than reading it as zero', () => {
    const receipt = written();
    receipt.results.ratchetPassing = 'twelve';
    assert.equal(verifyAcceptanceReceipt(receipt).ok, false);
  });

  it('refuses a negative ratchet count, which is not a count', () => {
    const receipt = written();
    receipt.results.ratchetPassing = -1;
    assert.equal(verifyAcceptanceReceipt(receipt).ok, false);
  });

  it('refuses a removed panel digest on a SHIPPED receipt', () => {
    const receipt = written();
    delete receipt.results.panelDigest;
    const verdict = verifyAcceptanceReceipt(receipt);
    assert.equal(verdict.ok, false);
    assert.equal(/** @type {any} */ (verdict).reason.includes('panel record that authorised it'), true);
  });

  it('refuses a removed report-digest list', () => {
    // Emptied and removed are different: an empty list is honest for a suite that produced none, and
    // is checked separately below. A *removed* field is a receipt that no longer states the fact.
    const receipt = written();
    delete receipt.results.reports;
    assert.equal(verifyAcceptanceReceipt(receipt).ok, false);
  });

  it('refuses an emptied report-digest list, because the gate results still own those digests', () => {
    // **This was a stated limit one version ago and is a capability now** (PLAN item 126). A flat
    // list nothing else in the file referenced could be emptied after the write and rebuilt to the
    // same emptied form. Every digest is owned by the gate the toolchain declares writes that
    // report, so the flat list is the union of the per-gate ones and a disagreement is an edit.
    const receipt = written();
    receipt.results.reports = [];
    const verdict = verifyAcceptanceReceipt(receipt);
    assert.equal(verdict.ok, false);
    assert.equal(
      /** @type {any} */ (verdict).reason.includes('are not the ones the gate results own'),
      true,
      /** @type {any} */ (verdict).reason,
    );
  });

  it('refuses a digest removed from the gate that owned it', () => {
    // The same check from the other side: emptying the per-gate list while the flat one still names
    // the digest is the same edit, and reads as the same refusal.
    const receipt = written();
    receipt.results.gates.find((/** @type {any} */ gate) => gate.name === 'unit').reports = [];
    assert.equal(verifyAcceptanceReceipt(receipt).ok, false);
  });

  it('refuses a gate whose command identity was removed, and allows one that runs no process', () => {
    // `null` is a legal value — a static gate has no argv — and an absent field is not, because it
    // means nobody recorded what produced the result.
    const receipt = written();
    delete receipt.results.gates[0].commandDigest;
    assert.equal(verifyAcceptanceReceipt(receipt).ok, false);
    assert.equal(verifyAcceptanceReceipt(written()).ok, true, 'a null command digest was refused');
  });

  it('refuses a gate with no attempt, because a result belongs to an iteration', () => {
    const receipt = written();
    delete receipt.results.gates[0].attempt;
    assert.equal(verifyAcceptanceReceipt(receipt).ok, false);
  });

  it('refuses a SHIPPED receipt with no commit, at the door and on the way back in', () => {
    assert.throws(
      () => buildAcceptanceReceipt(complete({ subject: { tree: 'sha256:tree', commit: null } })),
      (/** @type {unknown} */ error) => {
        assert.equal(/** @type {Error} */ (error).message.includes('names the commit that shipped'), true);
        return true;
      },
    );
    const receipt = written();
    receipt.subject.commit = null;
    const verdict = verifyAcceptanceReceipt(receipt);
    assert.equal(verdict.ok, false);
    assert.equal(/** @type {any} */ (verdict).reason.includes('names the commit that shipped'), true);
  });

  it('refuses a SHIPPED receipt carrying a failed required gate', () => {
    // **The one that makes "everything required passed" falsifiable.** A receipt could carry
    // `lint: ok=false` and still verify, so the word `SHIPPED` beside it meant nothing.
    assert.throws(
      () =>
        buildAcceptanceReceipt(
          complete({
            results: {
              ...complete().results,
              gates: [
                { name: 'lint', ok: false, status: 1, detailDigest: digest('failed'), commandDigest: null, attempt: 3, reports: [] },
                {
                  name: 'unit',
                  ok: true,
                  status: 0,
                  detailDigest: digest('12 passed'),
                  commandDigest: digest('npx vitest run'),
                  attempt: 3,
                  reports: [digest('the unit report')],
                },
              ],
            },
          }),
        ),
      (/** @type {unknown} */ error) => {
        assert.equal(error instanceof AcceptanceError, true);
        assert.equal(/** @type {Error} */ (error).message.includes('cannot carry a failed required gate (lint)'), true);
        return true;
      },
    );
  });

  it('lets a non-SHIPPED receipt carry a failed gate, no commit and no panel', () => {
    // **The neighbour, and it is the point of the rule.** A `STALLED` run genuinely has a failed
    // gate, no commit and no panel; refusing to record that would delete the evidence of exactly the
    // runs an operator most needs to read.
    const receipt = buildAcceptanceReceipt(
      complete({
        subject: { tree: 'sha256:tree', commit: null },
        results: {
          ...complete().results,
          terminal: 'STALLED',
          panelDigest: null,
          gates: [
            { name: 'lint', ok: false, status: 1, detailDigest: digest('failed'), commandDigest: null, attempt: 3, reports: [] },
            {
              name: 'unit',
              ok: true,
              status: 0,
              detailDigest: digest('12 passed'),
              commandDigest: digest('npx vitest run'),
              attempt: 3,
              reports: [digest('the unit report')],
            },
          ],
        },
      }),
    );
    assert.equal(verifyAcceptanceReceipt(receipt).ok, true);
  });

  it('refuses a receipt carrying a field this build would not have written', () => {
    // The canonical comparison. Rebuilding and discarding the result checked only that the required
    // fields survived; an auditor needs this file to be exactly what this build writes for these
    // facts, so anything added between writing and reading it is a refusal.
    const receipt = written();
    receipt.results.approvedBy = 'the builder';
    const verdict = verifyAcceptanceReceipt(receipt);
    assert.equal(verdict.ok, false);
    assert.equal(/** @type {any} */ (verdict).reason.includes('not the canonical form'), true, /** @type {any} */ (verdict).reason);
  });

  it('refuses a reordered receipt, because canonical means one form', () => {
    const receipt = written();
    receipt.results.gates = [...receipt.results.gates].reverse();
    assert.equal(verifyAcceptanceReceipt(receipt).ok, false);
  });

  it('returns the canonical receipt rather than the stored object', () => {
    // So the return value *is* the thing that was checked. A caller reading fields off the stored
    // object would be reading whatever survived on disk.
    const receipt = written();
    const verdict = verifyAcceptanceReceipt(receipt);
    assert.equal(verdict.ok, true);
    assert.notEqual(/** @type {any} */ (verdict).receipt, receipt, 'the stored object was handed straight back');
    assert.deepStrictEqual(/** @type {any} */ (verdict).receipt, receipt);
  });

  it('still accepts the receipt it just wrote, which is the whole neighbour', () => {
    assert.equal(verifyAcceptanceReceipt(written()).ok, true);
  });
});
