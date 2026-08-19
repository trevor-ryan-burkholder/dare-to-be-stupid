/**
 * The receipt that says what was accepted, on which bytes, by which checks (REVIEW F22, item 76).
 *
 * **What a `SHIPPED` currently proves, and what it does not.** `run.json` records what a run *was*,
 * `review.json` what the panel *said*, `outcome.json` how it *ended*. Gate results are transient —
 * built in memory by `runGates` and never persisted — and the reports are deliberately excluded from
 * the per-run archive. So an operator can establish that Meeseeks said `SHIPPED` and can read the
 * panel, and cannot reconstruct **which deterministic checks passed on which exact bytes**. The
 * first `SHIPPED` this project produced was audited and the auditor's complaint was precisely that.
 *
 * **A typed assertion, not a bag of digests.** One claim, bound to one immutable subject: the
 * candidate tree seal (F14) and the commit that carries it. The claim's *resolved inputs* — the
 * specification revision, the sanitized configuration, the plugin and CLI identities, the required
 * gate roster — are separated from its *results*, so a reader can tell what the run was held to from
 * what it achieved. That separation is borrowed from in-toto's subject/predicate split and SLSA's
 * input/result distinction; **this claims neither conformance, requires no signature, and adds no
 * attestation framework.**
 *
 * **Nothing here defaults to complete.** A required field that is missing, malformed, or filled with
 * a placeholder makes the receipt *incomplete*, and an incomplete receipt cannot describe an
 * acceptance. That is the same rule the rest of the loop runs on: an absence of evidence is not
 * evidence, and a receipt that quietly degrades to "unknown" would be worse than no receipt, because
 * a later reader would treat it as provenance.
 *
 * **Model identity is tagged, and the tag is load-bearing.** Every role invocation records the model
 * this driver *requested* and, separately, the identifiers the vendor *observed* serving it. A
 * configured alias is not evidence that the requested model answered. Where the vendor reported
 * nothing the receipt says `unavailable` **with a reason** — which preserves forensic completeness
 * and can never satisfy a model-identity claim, an attribution, or a matched comparison.
 */

import { createHash } from 'node:crypto';

/** The receipt's own schema version. A verifier refuses anything it does not know. */
export const ACCEPTANCE_VERSION = 1;

/** The one claim this receipt is allowed to make. A verifier refuses any other. */
export const ACCEPTANCE_CLAIM = 'meeseeks.acceptance/v1';

/**
 * @typedef {{ observed: string[] } | { unavailable: string }} Tagged
 * @typedef {{
 *   role: string, requestedModel: string, requestedEffort: string | null,
 *   models: Tagged, supplyDigest: string | null
 * }} RoleInvocation
 * @typedef {{ name: string, ok: boolean, status: number, detailDigest: string }} GateRecord
 */

/** Thrown when a receipt cannot be built or does not verify. */
export class AcceptanceError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'AcceptanceError';
  }
}

/** @param {string} text @returns {string} */
export function digest(text) {
  return `sha256:${createHash('sha256').update(String(text), 'utf8').digest('hex').slice(0, 32)}`;
}

/**
 * Is this a usable identity string, or an absence wearing one?
 *
 * `''`, `'unknown'` and `'null'` are the shapes a placeholder takes when somebody wanted a field
 * filled. Each is refused, because a receipt whose identity reads `unknown` looks like evidence at a
 * glance and is not.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isIdentity(value) {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  return text !== '' && !['unknown', 'null', 'undefined', 'n/a', 'none'].includes(text.toLowerCase());
}

/** @param {unknown} value @returns {value is Tagged} */
function isTagged(value) {
  const tag = /** @type {{ observed?: unknown, unavailable?: unknown }} */ (value ?? {});
  if (Array.isArray(tag.observed)) return tag.observed.every((name) => isIdentity(name)) && tag.observed.length > 0;
  return isIdentity(tag.unavailable);
}

/**
 * Build the acceptance receipt, or refuse and say which field made it incomplete.
 *
 * @param {{
 *   subject: { tree: string, commit: string | null },
 *   inputs: { specification: string, config: string, plugin: string, cli: string, gateRoster: string[] },
 *   results: {
 *     terminal: string, gates: GateRecord[], panelDigest: string | null,
 *     ratchetPassing: number, reports: string[], oracle: string | null, deploy: string | null,
 *   },
 *   invocations: RoleInvocation[],
 *   ledgerLapses: string[],
 *   at: string,
 * }} input
 * @returns {Record<string, unknown>}
 * @throws {AcceptanceError}
 */
export function buildAcceptanceReceipt(input) {
  /** @type {string[]} */
  const missing = [];
  /** @param {string} field @param {unknown} value */
  const require = (field, value) => {
    if (!isIdentity(value)) missing.push(field);
  };

  // The subject. A claim with no subject is an opinion, and the tree seal is what makes the rest of
  // the receipt about *these* bytes rather than about whatever is on disk when somebody reads it.
  require('subject.tree', input.subject?.tree);
  require('inputs.specification', input.inputs?.specification);
  require('inputs.config', input.inputs?.config);
  require('inputs.plugin', input.inputs?.plugin);
  require('inputs.cli', input.inputs?.cli);
  require('results.terminal', input.results?.terminal);
  require('at', input.at);

  const roster = input.inputs?.gateRoster;
  if (!Array.isArray(roster) || roster.length === 0) missing.push('inputs.gateRoster');

  const gates = input.results?.gates;
  if (!Array.isArray(gates)) missing.push('results.gates');
  else {
    for (const [index, gate] of gates.entries()) {
      if (!isIdentity(gate?.name)) missing.push(`results.gates[${index}].name`);
      if (typeof gate?.ok !== 'boolean') missing.push(`results.gates[${index}].ok`);
      // **The exit status is a number or it is nothing** (REVIEW F22, reopened). It was written
      // through unchecked, so a receipt whose status had been replaced by a string verified clean —
      // and a reader cannot tell a gate that exited 1 from one whose result was edited.
      if (!Number.isInteger(gate?.status)) missing.push(`results.gates[${index}].status`);
      if (!isIdentity(gate?.detailDigest)) missing.push(`results.gates[${index}].detailDigest`);
    }
    // **A gate absent from the roster is not a gate that failed**, and the receipt must keep the two
    // apart or "everything required passed" becomes unfalsifiable.
    const ran = new Set(gates.map((gate) => gate?.name));
    for (const required of Array.isArray(roster) ? roster : []) {
      if (!ran.has(required)) missing.push(`results.gates: ${required} is in the roster and has no result`);
    }
  }

  // **Every field the receipt states must be *stated*, not coerced** (REVIEW F22, reopened). Each of
  // these was written through a `? :` that turned a deleted or corrupted value into a default, so a
  // verifier that rebuilds the receipt rebuilt the *default* and reported the result complete.
  if (!Number.isInteger(input.results?.ratchetPassing) || Number(input.results?.ratchetPassing) < 0) {
    missing.push('results.ratchetPassing');
  }
  if (!Array.isArray(input.results?.reports)) missing.push('results.reports');
  if (!Array.isArray(input.ledgerLapses)) missing.push('ledgerLapses');

  // **What `SHIPPED` additionally has to be able to show.** A terminal state that claims the work
  // shipped is a claim about a commit an independent panel passed, so a receipt carrying that word
  // without either is not incomplete evidence for a weaker claim — it is a complete-looking receipt
  // for a claim nothing supports. Every other terminal state is honest without them.
  if (input.results?.terminal === 'SHIPPED') {
    if (!isIdentity(input.subject?.commit)) missing.push('subject.commit: a SHIPPED receipt names the commit that shipped');
    if (!isIdentity(input.results?.panelDigest)) {
      missing.push('results.panelDigest: a SHIPPED receipt names the panel record that authorised it');
    }
    const failed = (Array.isArray(gates) ? gates : [])
      .filter((gate) => Array.isArray(roster) && roster.includes(gate?.name) && gate?.ok !== true)
      .map((gate) => gate?.name);
    if (failed.length > 0) {
      missing.push(`results.gates: a SHIPPED receipt cannot carry a failed required gate (${failed.join(', ')})`);
    }
  }

  const invocations = input.invocations;
  if (!Array.isArray(invocations)) missing.push('invocations');
  else if (invocations.length === 0) {
    // **An empty ledger is not a run that spawned nothing.** A run that reached a terminal state
    // spawned children by construction, so an empty list means the store could not be read — and
    // `recordedInvocations` returns `[]` for exactly that. Accepting it produced a *complete*
    // `SHIPPED` receipt on which `modelIdentityHolds` then reported that model identity held,
    // vacuously, which is the one claim F22 says an absence of vendor evidence must never satisfy.
    missing.push('invocations: none were recorded, and a run that reached a terminal state spawned children');
  } else {
    for (const [index, invocation] of invocations.entries()) {
      if (!isIdentity(invocation?.role)) missing.push(`invocations[${index}].role`);
      if (!isIdentity(invocation?.requestedModel)) missing.push(`invocations[${index}].requestedModel`);
      // Tagged, and an untagged value is missing rather than assumed absent: the difference between
      // "the vendor reported nothing" and "nobody recorded whether it did" is the whole point.
      if (!isTagged(invocation?.models)) missing.push(`invocations[${index}].models`);
    }
  }

  if (missing.length > 0) {
    throw new AcceptanceError(
      `the acceptance receipt is incomplete and was not written: ${missing.join(', ')}. An incomplete receipt ` +
        'describes no acceptance — a missing identity is not an unknown one, and a reader would treat it as provenance.',
    );
  }

  return {
    version: ACCEPTANCE_VERSION,
    claim: ACCEPTANCE_CLAIM,
    at: input.at,
    subject: { tree: input.subject.tree, commit: isIdentity(input.subject.commit) ? input.subject.commit : null },
    inputs: {
      specification: input.inputs.specification,
      config: input.inputs.config,
      plugin: input.inputs.plugin,
      cli: input.inputs.cli,
      gateRoster: [...input.inputs.gateRoster].sort(),
    },
    results: {
      terminal: input.results.terminal,
      gates: input.results.gates
        .map((gate) => ({ name: gate.name, ok: gate.ok, status: gate.status, detailDigest: gate.detailDigest }))
        .sort((a, b) => (a.name < b.name ? -1 : 1)),
      panelDigest: isIdentity(input.results.panelDigest) ? input.results.panelDigest : null,
      ratchetPassing: input.results.ratchetPassing,
      // The report bytes the gate results were read from. An empty list is honest for a run whose
      // suite produced none, and is a different fact from a run that never looked — which cannot
      // reach here, because a run with no gate results has no roster to satisfy.
      reports: [...input.results.reports].sort(),
      oracle: isIdentity(input.results.oracle) ? input.results.oracle : null,
      deploy: isIdentity(input.results.deploy) ? input.results.deploy : null,
    },
    // **Gaps in the ledger, named as gaps** — not smuggled into `invocations` wearing a placeholder
    // model. `role-supply.mjs` writes a lapse when it finds a store it cannot read, precisely so a
    // later verifier cannot confuse "nothing was recorded" with "nothing happened", and the receipt
    // is that later verifier. A lapse is a statement about the ledger, not about a model, so it gets
    // its own field and `modelIdentityHolds` refuses while any exists.
    ledgerLapses: [...input.ledgerLapses],
    invocations: input.invocations.map((invocation) => ({
      role: invocation.role,
      requestedModel: invocation.requestedModel,
      requestedEffort: isIdentity(invocation.requestedEffort) ? invocation.requestedEffort : null,
      models: invocation.models,
      supplyDigest: isIdentity(invocation.supplyDigest) ? invocation.supplyDigest : null,
    })),
  };
}

/**
 * Read a receipt back the way an auditor would, and refuse anything it cannot stand behind.
 *
 * @param {unknown} value the parsed receipt
 * @param {{ tree?: string, claim?: string }} [expect] the subject an auditor is asking about
 * @returns {{ ok: true, receipt: Record<string, unknown> } | { ok: false, reason: string }}
 */
export function verifyAcceptanceReceipt(value, expect = {}) {
  const receipt = /** @type {Record<string, any>} */ (value ?? {});
  if (receipt.version !== ACCEPTANCE_VERSION) {
    return { ok: false, reason: `unknown receipt schema ${JSON.stringify(receipt.version)}; this build reads ${ACCEPTANCE_VERSION}` };
  }
  const claim = expect.claim ?? ACCEPTANCE_CLAIM;
  if (receipt.claim !== claim) {
    return { ok: false, reason: `unknown claim type ${JSON.stringify(receipt.claim)}; this build reads ${claim}` };
  }
  // Rebuilt rather than spot-checked: the same completeness rule that refused to write it refuses to
  // accept it, so a field deleted or corrupted on disk fails here exactly as it would have there.
  /** @type {Record<string, unknown>} */
  let canonical;
  try {
    canonical = buildAcceptanceReceipt({
      subject: receipt.subject ?? {},
      inputs: receipt.inputs ?? {},
      results: receipt.results ?? {},
      invocations: receipt.invocations ?? [],
      ledgerLapses: receipt.ledgerLapses ?? [],
      at: receipt.at,
    });
  } catch (error) {
    return { ok: false, reason: /** @type {Error} */ (error).message };
  }
  // **And the rebuilt receipt is compared with the stored one** (REVIEW F22, reopened). Rebuilding
  // and then discarding the result checked only that the fields the builder *requires* survived: a
  // stored receipt could carry an extra field nobody wrote, a value the builder would have
  // normalised differently, or an ordering the canonical form does not have, and still verify. What
  // an auditor needs is that this file is exactly the receipt this build would write for these
  // facts, and nothing else.
  const stored = JSON.stringify(receipt);
  const rebuilt = JSON.stringify(canonical);
  if (stored !== rebuilt) {
    return {
      ok: false,
      reason:
        'the receipt on disk is not the canonical form of the facts it states. Something between writing and reading ' +
        'it added, removed or reordered a field, and a receipt that is not byte-for-byte what this build would write ' +
        'for these facts cannot be read as provenance.',
    };
  }
  if (expect.tree !== undefined && receipt.subject?.tree !== expect.tree) {
    return {
      ok: false,
      reason: `this receipt is about ${receipt.subject?.tree}, not ${expect.tree}. A receipt for other bytes ` +
        'establishes nothing about these ones',
    };
  }
  // The canonical value, not the stored one. They are equal here by construction; returning the
  // rebuilt object is what makes that a property of the return value rather than of this comment.
  return { ok: true, receipt: canonical };
}

/**
 * Does this receipt support a claim that the *requested* model served an invocation?
 *
 * Separate from verification on purpose. An `unavailable` observation keeps the receipt complete —
 * forensically it is the honest answer — but it can never satisfy a model-identity gate, an
 * attribution, or a matched comparison, and a caller that needs one has to ask.
 *
 * @param {Record<string, any>} receipt
 * @returns {{ ok: boolean, unmatched: string[] }}
 */
export function modelIdentityHolds(receipt) {
  /** @type {string[]} */
  const unmatched = [];
  const invocations = receipt.invocations ?? [];
  // Nothing to check is not a check that passed. An empty ledger cannot support a model-identity
  // claim about invocations nobody recorded.
  if (invocations.length === 0) {
    return { ok: false, unmatched: ['no invocation was recorded, so no model identity can be established'] };
  }
  // A ledger with a hole in it cannot support a claim about *every* invocation, whatever the entries
  // that survived say.
  for (const lapse of receipt.ledgerLapses ?? []) unmatched.push(`the invocation ledger is not continuous: ${lapse}`);
  for (const invocation of invocations) {
    const models = invocation.models ?? {};
    if (!Array.isArray(models.observed)) {
      unmatched.push(`${invocation.role}: ${models.unavailable ?? 'no observation recorded'}`);
      continue;
    }
    if (!models.observed.includes(invocation.requestedModel)) {
      unmatched.push(`${invocation.role}: requested ${invocation.requestedModel}, served by ${models.observed.join(', ')}`);
    }
  }
  return { ok: unmatched.length === 0, unmatched };
}
