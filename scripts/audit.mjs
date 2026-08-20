/**
 * The clean-clone acceptance traversal (`REVIEW.md` F22, `PLAN.md` items 76 and 126).
 *
 * F22's first acceptance bullet is a sentence about a **person**: *"a clean-clone auditor can start
 * from one `SHIPPED` receipt and resolve every required deterministic and independent-review edge to
 * a matching exact-tree artifact."* Every one of those edges now exists in the record — items 125 and
 * 126 put them there. Nothing walks them.
 *
 * **`PLAN.md` disagrees with itself about whether that matters**, and the disagreement is worth
 * naming rather than quietly resolving: item 126 calls the traversal *"a separate harness"* still to
 * be built, while item 76 calls the same remainder *"not a build task ... an acceptance judgement"*.
 * This repository's own precedent settles it. F20 made a claim of exactly this shape and was closed
 * by a tier-2 clean-clone **test**, not by assertion — because a receipt whose edges nobody has ever
 * resolved is indistinguishable from one whose edges do not resolve.
 *
 * ## What an edge is, and why each is re-derivable here
 *
 * Every check below recomputes a value from the archived run and the clone and compares it to what
 * the receipt claims. None of them trusts a second copy of the same number: the point is that the
 * receipt's fields are *checkable against artifacts*, not that they are internally consistent.
 *
 * ## Two edges are digest-only, and saying so is the honest part
 *
 * `results.gates[].detailDigest` digests gate output that is never persisted, and
 * `results.gates[].reports` digests report bytes that `run-manifest.mjs` deliberately excludes from
 * the archive. There is nothing to resolve them *to*. They are reported as `digest-only` rather than
 * as resolved — a traversal that silently skipped them would report full coverage of a record it had
 * only partly walked, which is the shape §4 refuses.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { ACCEPTANCE_FILE } from './acceptance-file.mjs';
import { digest, verifyAcceptanceReceipt } from './acceptance.mjs';
import { OUTCOME_FILE } from './outcome.mjs';
import { SUPPLY_FILE } from './role-supply.mjs';
import { SPECIFICATION_FILE, specificationDigest } from './specification.mjs';

/** How an edge came out. `digest-only` is a stated boundary, never a pass. */
export const EDGE_STATES = ['resolved', 'mismatch', 'missing', 'digest-only'];

/**
 * @typedef {{ edge: string, state: string, detail: string }} EdgeResult
 * @typedef {{ ok: boolean, edges: EdgeResult[], summary: string }} AuditResult
 */

/**
 * @param {string} file
 * @returns {unknown | null}
 */
function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Resolve every edge of one acceptance receipt against an archived run and a clean clone.
 *
 * @param {{ runDir: string, cloneDir: string,
 *   run: (command: string, args: string[], options: { cwd: string }) => { ok: boolean, stdout: string } |
 *     Promise<{ ok: boolean, stdout: string }> }} options
 *   `runDir` is one archived run's directory — the shape `run-manifest.mjs` writes under
 *   `.meeseeks/runs/<slot>/`. `cloneDir` is a fresh clone of the published repository: the auditor's
 *   whole position is that they hold no artifact from the run except what was archived.
 * @returns {Promise<AuditResult>}
 */
export async function auditAcceptance(options) {
  /** @type {EdgeResult[]} */
  const edges = [];
  /** @param {string} edge @param {string} state @param {string} detail */
  const record = (edge, state, detail) => {
    edges.push({ edge, state, detail });
  };

  const receiptFile = path.join(options.runDir, ACCEPTANCE_FILE);
  const receipt = /** @type {Record<string, any> | null} */ (readJson(receiptFile));
  if (receipt === null) {
    record('receipt', 'missing', `${receiptFile} is absent or unreadable, so there is nothing to traverse`);
    return { ok: false, edges, summary: 'no receipt' };
  }

  // The receipt first, through the same verifier the run used. A traversal that walked the edges of
  // a receipt that does not verify would be resolving fields nobody should trust.
  const verified = verifyAcceptanceReceipt(receipt);
  if (!verified.ok) {
    record('receipt', 'mismatch', `the receipt does not verify: ${verified.reason}`);
    return { ok: false, edges, summary: 'the receipt does not verify' };
  }
  record('receipt', 'resolved', 'schema, claim and canonical form all hold');

  // --- the tree edge -------------------------------------------------------------------------
  const commit = receipt.subject?.commit;
  if (typeof commit !== 'string' || commit === '') {
    record('subject.tree', 'missing', 'the receipt names no commit, so its tree cannot be resolved in a clone');
  } else {
    const shown = await options.run('git', ['rev-parse', `${commit}^{tree}`], { cwd: options.cloneDir });
    const tree = String(shown.stdout ?? '').trim();
    if (!shown.ok || tree === '') {
      record('subject.tree', 'missing', `${commit} is not in the clone, so the reviewed tree cannot be resolved`);
    } else if (tree !== receipt.subject?.tree) {
      record(
        'subject.tree',
        'mismatch',
        `the clone's ${commit} names tree ${tree} and the receipt claims ${receipt.subject?.tree}`,
      );
    } else {
      record('subject.tree', 'resolved', `${commit} names the reviewed tree ${tree}`);
    }
  }

  // --- the specification edge ---------------------------------------------------------------
  const specRecord = /** @type {Record<string, any> | null} */ (readJson(path.join(options.runDir, SPECIFICATION_FILE)));
  if (specRecord === null) {
    record('inputs.specification', 'missing', `${SPECIFICATION_FILE} was not archived with the run`);
  } else {
    const named = specRecord.file;
    const inClone = typeof named === 'string' ? path.join(options.cloneDir, named) : '';
    if (inClone === '' || !existsSync(inClone)) {
      record('inputs.specification', 'missing', `the specification names ${JSON.stringify(named)}, absent from the clone`);
    } else {
      const recomputed = specificationDigest(readFileSync(inClone, 'utf8'));
      if (recomputed !== specRecord.digest) {
        record(
          'inputs.specification',
          'mismatch',
          `${named} in the clone digests ${recomputed} and the run recorded ${specRecord.digest}`,
        );
      } else if (recomputed !== receipt.inputs?.specification) {
        record(
          'inputs.specification',
          'mismatch',
          `the archived specification digests ${recomputed} and the receipt claims ${receipt.inputs?.specification}`,
        );
      } else {
        record('inputs.specification', 'resolved', `${named} in the clone is the document the run was held to`);
      }
    }
  }

  // --- the panel edge ------------------------------------------------------------------------
  const reviewFile = path.join(options.runDir, 'review.json');
  if (receipt.results?.panelDigest === null || receipt.results?.panelDigest === undefined) {
    record('results.panelDigest', 'missing', 'the receipt names no panel record');
  } else if (!existsSync(reviewFile)) {
    record('results.panelDigest', 'missing', 'review.json was not archived, so the panel record cannot be resolved');
  } else {
    const recomputed = digest(readFileSync(reviewFile, 'utf8'));
    if (recomputed !== receipt.results.panelDigest) {
      record(
        'results.panelDigest',
        'mismatch',
        `the archived review.json digests ${recomputed} and the receipt claims ${receipt.results.panelDigest}`,
      );
    } else {
      record('results.panelDigest', 'resolved', 'the archived panel record is the one the receipt names');
    }
  }

  // --- the ratchet edge ----------------------------------------------------------------------
  const outcome = /** @type {Record<string, any> | null} */ (readJson(path.join(options.runDir, OUTCOME_FILE)));
  if (outcome === null) {
    record('results.ratchetPassing', 'missing', `${OUTCOME_FILE} was not archived with the run`);
  } else {
    const passing = Array.isArray(outcome.passing) ? outcome.passing.length : null;
    if (passing === null) {
      record('results.ratchetPassing', 'missing', 'the archived outcome records no passing set');
    } else if (passing !== receipt.results?.ratchetPassing) {
      record(
        'results.ratchetPassing',
        'mismatch',
        `the archived outcome holds ${passing} passing ids and the receipt claims ${receipt.results?.ratchetPassing}`,
      );
    } else {
      record('results.ratchetPassing', 'resolved', `${passing} passing ids, matching the archived outcome`);
    }
  }

  // --- the supply edges ----------------------------------------------------------------------
  const supply = /** @type {any} */ (readJson(path.join(options.runDir, SUPPLY_FILE)));
  const entries = Array.isArray(supply?.invocations) ? supply.invocations : Array.isArray(supply) ? supply : null;
  const claimed = Array.isArray(receipt.invocations) ? receipt.invocations : [];
  const wanted = claimed.filter((entry) => typeof entry?.supplyDigest === 'string' && entry.supplyDigest !== '');
  if (wanted.length === 0) {
    record('invocations.supplyDigest', 'resolved', 'no invocation claims a supply manifest');
  } else if (entries === null) {
    record('invocations.supplyDigest', 'missing', `${SUPPLY_FILE} was not archived, so no supply manifest can be resolved`);
  } else {
    const available = new Map(entries.map((/** @type {any} */ entry) => [digest(JSON.stringify(entry?.manifest ?? entry)), entry]));
    const unresolved = wanted.filter((entry) => !available.has(entry.supplyDigest));
    // **Orphans matter as much as gaps.** An archived manifest no invocation claims is a role whose
    // supply was recorded and whose invocation was not, which is the same ledger hole read from the
    // other side — and `modelIdentityHolds` already refuses a run with a lapse for that reason.
    const claimedDigests = new Set(wanted.map((entry) => entry.supplyDigest));
    const orphans = [...available.keys()].filter((key) => !claimedDigests.has(key));
    if (unresolved.length > 0) {
      record(
        'invocations.supplyDigest',
        'missing',
        `${unresolved.length} invocation(s) claim a supply manifest the archive does not hold`,
      );
    } else if (orphans.length > 0) {
      record(
        'invocations.supplyDigest',
        'mismatch',
        `${orphans.length} archived supply manifest(s) belong to no invocation the receipt records`,
      );
    } else {
      record('invocations.supplyDigest', 'resolved', `${wanted.length} invocation(s) resolve to an archived manifest`);
    }
  }

  // --- the edges that cannot be resolved, named rather than skipped ---------------------------
  const gates = Array.isArray(receipt.results?.gates) ? receipt.results.gates : [];
  if (gates.length > 0) {
    record(
      'results.gates[].detailDigest',
      'digest-only',
      'gate output is not persisted, so these digest an artifact the archive does not hold. They prove a ' +
        'later reader is looking at the same detail only if that detail is produced again.',
    );
    if (gates.some((/** @type {any} */ gate) => Array.isArray(gate?.reports) && gate.reports.length > 0)) {
      record(
        'results.gates[].reports',
        'digest-only',
        'run-manifest.mjs deliberately excludes the unit and e2e report bytes from the archive, so these ' +
          'name bytes an auditor cannot obtain. Archiving the sealed attempt\'s reports would close this.',
      );
    }
  }

  // A `digest-only` edge is neither a pass nor a failure: it is a boundary. It does not make `ok`
  // false, because nothing is wrong — and it is in the report, because a traversal claiming complete
  // coverage of a record it walked only part of would be the overclaim this whole file is against.
  const unresolved = edges.filter((edge) => edge.state === 'missing' || edge.state === 'mismatch');
  const boundary = edges.filter((edge) => edge.state === 'digest-only');
  return {
    ok: unresolved.length === 0,
    edges,
    summary:
      unresolved.length === 0
        ? `every required edge resolved against the clone; ${boundary.length} edge(s) are digest-only and named as such`
        : `${unresolved.length} edge(s) did not resolve: ${unresolved.map((edge) => edge.edge).join(', ')}`,
  };
}
