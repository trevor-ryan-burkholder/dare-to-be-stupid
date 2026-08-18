/**
 * What each cold role was actually handed, and what it may never be (DESIGN.md §6.1, BORROWED R44).
 *
 * **The discipline this makes machine-readable.** Panel and Oracle independence rests partly on
 * `not supplied`: the Driver does not place Builder history, workflow synthesis, or held-out cases
 * into a cold role's context. `AGENTS.md` is emphatic that this is a *discipline about what the
 * driver hands over*, not a filesystem wall — and a discipline with no record is one a refactor can
 * break while every template-string test stays green. Somebody adds a helpful line to a reviewer
 * prompt, the assertions still pass because they check the template renders, and the panel has
 * quietly been reading the builder's log ever since.
 *
 * So prompt assembly declares the **class** of every input it composes, a per-role policy refuses
 * the forbidden ones **before** the child is spawned, and the surviving declaration is archived as a
 * sanitized manifest: role, specification revision, class, digest, byte count. Never the bytes. A
 * verifier holding the assembled prompt can recompute every digest; the manifest storing them again
 * would be a second copy of the thing it exists to describe.
 *
 * **What this does not claim, stated because the distinction is the whole of §6.1.** It proves only
 * the deliberate prompt and brief channel. It says nothing about what a role can *read from the
 * repository* — a reviewer with tools can open any file in the candidate, and F15 / item 69 owns
 * that different question. Describing this as preventing a role from reading something would be
 * writing `not supplied` as though it were `driver-owned`, which is the exact confusion the
 * invariant warns about.
 */

import { createHash } from 'node:crypto';

/**
 * The kinds of thing that can go into a role's context.
 *
 * Named rather than inferred: the point is that a caller has to *say* what it is adding, so adding
 * something new without classifying it is a failure at the door instead of a silent inclusion.
 */
export const INPUT_CLASSES = /** @type {const} */ ([
  'specification',
  'system-prompt',
  'template',
  'brief',
  'candidate-evidence',
  'builder-log',
  'iteration-history',
  'workflow-synthesis',
  'oracle-cases',
  'panel-transcript',
  'lesson-history',
]);

/** @typedef {(typeof INPUT_CLASSES)[number]} InputClass */
/**
 * @typedef {{ role: string, specification: string | null,
 *   inputs: { class: InputClass, digest: string, bytes: number }[] }} RoleSupplyManifest
 */

/**
 * What each role may never receive, and why.
 *
 * Stated as a deny list rather than an allow list, deliberately. An allow list would silently
 * forbid every class somebody adds later, which sounds safer and is not: the failure would be a
 * role starved of something it needs, discovered as a bad verdict rather than as a refusal. A deny
 * list fails loudly on exactly the classes independence depends on, and an unclassified input is
 * already refused by `classify` before this table is consulted.
 *
 * @type {Record<string, { forbidden: InputClass[], why: string }>}
 */
export const ROLE_SUPPLY_POLICY = {
  // The cold panel. Its verdict is only worth something if it was formed without knowing an agent
  // wrote the code, how many times, or what the last reviewer said.
  review: {
    forbidden: ['builder-log', 'iteration-history', 'workflow-synthesis', 'panel-transcript', 'oracle-cases'],
    why: 'a reviewer that knows how the code was produced is no longer judging the code',
  },
  // PRD-only, by construction. Cases authored from the implementation test the implementation.
  'oracle-author': {
    forbidden: ['builder-log', 'iteration-history', 'workflow-synthesis', 'candidate-evidence', 'panel-transcript'],
    why: 'held-out cases written from the candidate are not held out from anything',
  },
  // The builder may not see the cases it will be judged by, nor the panel's reasoning about them.
  builder: {
    forbidden: ['oracle-cases', 'panel-transcript'],
    why: 'a builder that can read the held-out cases can satisfy them without satisfying the requirement',
  },
  // One narrow question about one element. Scope is the safety property here.
  'security-escalation': {
    forbidden: ['builder-log', 'iteration-history', 'oracle-cases', 'panel-transcript'],
    why: 'a scoped question answered from the whole run is not a scoped question',
  },
};

/** Thrown when a role is offered an input class its policy forbids. */
export class SupplyBoundaryError extends Error {
  /**
   * @param {string} role
   * @param {InputClass[]} offered
   * @param {string} why
   */
  constructor(role, offered, why) {
    super(
      `the ${role} role was offered ${offered.join(', ')}, which its supply policy forbids: ${why}. Refusing ` +
        'before the child is spawned, because a cold role that has already read something cannot unread it.',
    );
    this.name = 'SupplyBoundaryError';
    /** @type {string} */
    this.role = role;
    /** @type {InputClass[]} */
    this.offered = offered;
  }
}

/**
 * One manifest entry: what class of thing, how much of it, and a digest a verifier can recompute.
 *
 * @param {InputClass} inputClass
 * @param {string} text
 * @returns {{ class: InputClass, digest: string, bytes: number }}
 */
export function classify(inputClass, text) {
  if (!INPUT_CLASSES.includes(inputClass)) {
    throw new SupplyBoundaryError(
      'unknown',
      [inputClass],
      `${JSON.stringify(inputClass)} is not a declared input class, and an input nobody classified cannot be ` +
        'checked against any policy',
    );
  }
  const body = typeof text === 'string' ? text : '';
  return {
    class: inputClass,
    digest: `sha256:${createHash('sha256').update(body, 'utf8').digest('hex').slice(0, 32)}`,
    bytes: Buffer.byteLength(body, 'utf8'),
  };
}

/**
 * Refuse a supply the role's policy forbids, then describe what it did receive.
 *
 * The refusal happens **before** the spawn, which is the only place it can: a cold role that has
 * already read something cannot unread it, so a check performed on the way out would be a record of
 * a boundary that had already been crossed.
 *
 * A role with no policy entry is unconstrained and still gets a manifest. That is deliberate — the
 * builder-facing phases are not cold, and inventing prohibitions for them would be enforcing a rule
 * nobody stated.
 *
 * @param {{ role: string, specification?: string | null,
 *   supply: { class: InputClass, text: string }[] }} invocation
 * @returns {RoleSupplyManifest}
 * @throws {SupplyBoundaryError}
 */
export function roleSupplyManifest(invocation) {
  const inputs = invocation.supply.map((entry) => classify(entry.class, entry.text));
  const policy = ROLE_SUPPLY_POLICY[invocation.role];
  if (policy !== undefined) {
    const offered = policy.forbidden.filter((forbidden) => inputs.some((input) => input.class === forbidden));
    if (offered.length > 0) throw new SupplyBoundaryError(invocation.role, offered, policy.why);
  }
  return {
    role: invocation.role,
    // The specification revision from item 66, so a manifest says which document the invocation was
    // held to rather than merely which bytes it received.
    specification: invocation.specification ?? null,
    inputs,
  };
}
