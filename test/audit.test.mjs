/**
 * The clean-clone acceptance traversal (`scripts/audit.mjs`, REVIEW F22).
 *
 * F22's first acceptance bullet is a sentence about a person: *a clean-clone auditor can start from
 * one `SHIPPED` receipt and resolve every required edge to a matching exact-tree artifact.* The
 * edges exist in the record. Until now nothing walked them, and a receipt whose edges nobody has
 * ever resolved is indistinguishable from one whose edges do not resolve.
 *
 * Every case here breaks exactly one edge and requires the traversal to name **that** edge. A test
 * asserting only `ok: false` would pass against a traversal that failed everything, which is the
 * failure mode of an auditor nobody can act on.
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { auditAcceptance } from '../scripts/audit.mjs';
import { buildAcceptanceReceipt, digest } from '../scripts/acceptance.mjs';
import { specificationDigest } from '../scripts/specification.mjs';

/** @type {string[]} */
const dirs = [];
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const PRD = '# Thing\n\n## Requirements\n\nPRD-1.1 It exists.\n';
const SPEC_DIGEST = specificationDigest(PRD);
const REVIEW_JSON = JSON.stringify({ reviewer: 'correctness', verdict: 'pass' });
const SUPPLY_MANIFEST = { role: 'review', inputs: [], ambient: { disabled: [], by: '--safe-mode', verified: false } };
const COMMIT = 'abc123def456abc123def456abc123def456abcd';
const TREE = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

/** A clone whose git answers for the reviewed commit. @param {string} [tree] */
const cloneAnswering = (tree = TREE) => ({
  run: (/** @type {string} */ _c, /** @type {string[]} */ args) =>
    args[1] === `${COMMIT}^{tree}` ? { ok: true, stdout: `${tree}\n` } : { ok: false, stdout: '' },
});

/** @param {Record<string, unknown>} [overrides] the receipt fields to disturb */
function receiptFor(overrides = {}) {
  return buildAcceptanceReceipt({
    subject: { tree: TREE, commit: COMMIT },
    inputs: {
      specification: SPEC_DIGEST,
      config: 'sha256:config',
      plugin: '0.256.0',
      cli: '2.1.230',
      gateRoster: ['lint'],
    },
    results: {
      terminal: 'SHIPPED',
      gates: [
        {
          name: 'lint',
          ok: true,
          status: 0,
          detailDigest: digest('passed'),
          commandDigest: digest('npm run lint'),
          attempt: 1,
          reports: [digest('the unit report')],
        },
      ],
      panelDigest: digest(REVIEW_JSON),
      ratchetPassing: 2,
      reports: [digest('the unit report')],
      oracle: null,
      deploy: null,
    },
    invocations: [
      {
        role: 'review',
        requestedModel: 'claude-sonnet-5',
        requestedEffort: 'high',
        models: { observed: ['claude-sonnet-5'] },
        supplyDigest: digest(JSON.stringify(SUPPLY_MANIFEST)),
      },
    ],
    ledgerLapses: [],
    at: '2026-08-20T00:00:00.000Z',
    ...overrides,
  });
}

/**
 * An archived run directory in which every edge resolves.
 *
 * @param {{ receipt?: Record<string, unknown>, spec?: Record<string, unknown> | null, review?: string | null,
 *   outcome?: unknown, supply?: unknown }} [changes]
 * @returns {string}
 */
function runDir(changes = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-audit-'));
  dirs.push(dir);
  const write = (/** @type {string} */ name, /** @type {unknown} */ body) =>
    writeFileSync(path.join(dir, name), typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`, 'utf8');

  write('acceptance.json', changes.receipt ?? receiptFor());
  if (changes.spec !== null) write('specification.json', changes.spec ?? { version: 1, file: 'PRD.md', digest: SPEC_DIGEST });
  if (changes.review !== null) write('review.json', changes.review ?? REVIEW_JSON);
  write('outcome.json', changes.outcome ?? { state: 'SHIPPED', reason: 'done', passing: ['a::1', 'b::2'] });
  write('supply.json', changes.supply ?? { invocations: [{ role: 'review', manifest: SUPPLY_MANIFEST }] });
  return dir;
}

/** A clone directory holding the PRD the run was judged against. @param {string} [prd] */
function cloneDir(prd = PRD) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-clone-'));
  dirs.push(dir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'PRD.md'), prd, 'utf8');
  return dir;
}

/** @param {{ edges: { edge: string, state: string }[] }} result @param {string} edge */
const stateOf = (result, edge) => result.edges.find((entry) => entry.edge === edge)?.state;

describe('auditAcceptance — every edge resolves, or is named', () => {
  it('resolves every required edge of a complete run', async () => {
    // The neighbour, and everything below depends on it: a traversal that failed unconditionally
    // would satisfy every break case while being useless.
    const result = await auditAcceptance({ runDir: runDir(), cloneDir: cloneDir(), ...cloneAnswering() });
    assert.equal(result.ok, true, result.summary);
    assert.equal(stateOf(result, 'receipt'), 'resolved');
    assert.equal(stateOf(result, 'subject.tree'), 'resolved');
    assert.equal(stateOf(result, 'inputs.specification'), 'resolved');
    assert.equal(stateOf(result, 'results.panelDigest'), 'resolved');
    assert.equal(stateOf(result, 'results.ratchetPassing'), 'resolved');
    assert.equal(stateOf(result, 'invocations.supplyDigest'), 'resolved');
  });

  it('names the digest-only edges rather than counting them as resolved', async () => {
    // The honest boundary. Gate output is never persisted and the report bytes are deliberately
    // excluded from the archive, so there is nothing to resolve these *to* — and a traversal that
    // skipped them silently would report complete coverage of a record it walked only part of.
    const result = await auditAcceptance({ runDir: runDir(), cloneDir: cloneDir(), ...cloneAnswering() });
    assert.equal(stateOf(result, 'results.gates[].detailDigest'), 'digest-only');
    assert.equal(stateOf(result, 'results.gates[].reports'), 'digest-only');
    // A boundary is not a failure: it must not make an otherwise clean traversal report failure.
    assert.equal(result.ok, true);
    assert.match(result.summary, /digest-only and named as such/);
  });

  it('fails when the clone does not hold the reviewed commit', async () => {
    const result = await auditAcceptance({
      runDir: runDir(),
      cloneDir: cloneDir(),
      run: () => ({ ok: false, stdout: '' }),
    });
    assert.equal(result.ok, false);
    assert.equal(stateOf(result, 'subject.tree'), 'missing');
  });

  it('fails when the clone holds that commit under a different tree', async () => {
    // The substitution that matters: the commit is there, so a check that only asked "does it exist"
    // would pass while the bytes are somebody else's.
    const result = await auditAcceptance({
      runDir: runDir(),
      cloneDir: cloneDir(),
      ...cloneAnswering('1111111111111111111111111111111111111111'),
    });
    assert.equal(result.ok, false);
    assert.equal(stateOf(result, 'subject.tree'), 'mismatch');
  });

  it('fails when the specification in the clone is not the one the run was held to', async () => {
    const result = await auditAcceptance({
      runDir: runDir(),
      cloneDir: cloneDir('# Thing\n\n## Requirements\n\nPRD-1.1 Something else entirely.\n'),
      ...cloneAnswering(),
    });
    assert.equal(result.ok, false);
    assert.equal(stateOf(result, 'inputs.specification'), 'mismatch');
  });

  it('fails when the archived specification record disagrees with the file it names', async () => {
    // **Two different disagreements, and only one was covered.** The check against the *receipt's*
    // claim catches a rewritten PRD; the check against the *archived record* catches a tampered
    // `specification.json`, where the clone and the receipt still agree with each other. Proved
    // necessary: removing the first check left the whole suite green, because every rewrite case
    // was also caught by the second.
    const tampered = { version: 1, file: 'PRD.md', digest: specificationDigest('# Thing\n\nsomething else\n') };
    const result = await auditAcceptance({
      runDir: runDir({ spec: tampered }),
      cloneDir: cloneDir(),
      ...cloneAnswering(),
    });
    assert.equal(result.ok, false);
    assert.equal(stateOf(result, 'inputs.specification'), 'mismatch');
  });

  it('fails when the specification record was never archived', async () => {
    const result = await auditAcceptance({ runDir: runDir({ spec: null }), cloneDir: cloneDir(), ...cloneAnswering() });
    assert.equal(result.ok, false);
    assert.equal(stateOf(result, 'inputs.specification'), 'missing');
  });

  it('fails when review.json was edited after the receipt named it', async () => {
    const result = await auditAcceptance({
      runDir: runDir({ review: JSON.stringify({ reviewer: 'correctness', verdict: 'pass', note: 'added later' }) }),
      cloneDir: cloneDir(),
      ...cloneAnswering(),
    });
    assert.equal(result.ok, false);
    assert.equal(stateOf(result, 'results.panelDigest'), 'mismatch');
  });

  it('fails when the archived outcome holds a different passing count', async () => {
    const result = await auditAcceptance({
      runDir: runDir({ outcome: { state: 'SHIPPED', reason: 'done', passing: ['a::1'] } }),
      cloneDir: cloneDir(),
      ...cloneAnswering(),
    });
    assert.equal(result.ok, false);
    assert.equal(stateOf(result, 'results.ratchetPassing'), 'mismatch');
  });

  it('fails when an invocation claims a supply manifest the archive does not hold', async () => {
    const result = await auditAcceptance({
      runDir: runDir({ supply: { invocations: [{ role: 'review', manifest: { role: 'review', inputs: ['different'] } }] } }),
      cloneDir: cloneDir(),
      ...cloneAnswering(),
    });
    assert.equal(result.ok, false);
    assert.equal(stateOf(result, 'invocations.supplyDigest'), 'missing');
  });

  it('fails on an orphaned manifest, which is the same hole from the other side', async () => {
    // A recorded supply belonging to no recorded invocation is a role whose supply was written and
    // whose invocation was not. `modelIdentityHolds` already refuses a run for that; so does this.
    const result = await auditAcceptance({
      runDir: runDir({
        supply: {
          invocations: [
            { role: 'review', manifest: SUPPLY_MANIFEST },
            { role: 'oracle-author', manifest: { role: 'oracle-author', inputs: [] } },
          ],
        },
      }),
      cloneDir: cloneDir(),
      ...cloneAnswering(),
    });
    assert.equal(result.ok, false);
    assert.equal(stateOf(result, 'invocations.supplyDigest'), 'mismatch');
  });

  it('refuses to traverse a receipt that does not verify, rather than walking its edges', async () => {
    // Resolving the edges of a receipt nobody should trust would be resolving fields that mean
    // nothing. The traversal stops and says so.
    const broken = { ...receiptFor(), claim: 'meeseeks.acceptance/v1' };
    const result = await auditAcceptance({ runDir: runDir({ receipt: broken }), cloneDir: cloneDir(), ...cloneAnswering() });
    assert.equal(result.ok, false);
    assert.equal(stateOf(result, 'receipt'), 'mismatch');
    assert.equal(result.edges.length, 1, 'the traversal kept walking a receipt it could not trust');
  });

  it('reports an absent receipt as nothing to traverse', async () => {
    const empty = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-audit-empty-'));
    dirs.push(empty);
    const result = await auditAcceptance({ runDir: empty, cloneDir: cloneDir(), ...cloneAnswering() });
    assert.equal(result.ok, false);
    assert.equal(stateOf(result, 'receipt'), 'missing');
  });
});
