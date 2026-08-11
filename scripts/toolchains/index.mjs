/**
 * The toolchain registry (DESIGN.md §3.8).
 *
 * Everything the loop knew about *how to build a thing* used to be six hard-coded npm and npx
 * command lines inside `driver.mjs`, plus a second, quietly different set of assumptions
 * inside CI inspection. This is the seam those two shared, pulled out and given a contract.
 *
 * A toolchain answers a fixed list of questions and no others: how to detect itself, how to
 * restore dependencies, build, lint, statically check, unit test, end-to-end test, audit
 * dependencies, start the application, and what its CI must be seen to run.
 *
 * Three properties are load-bearing.
 *
 * **A missing step is stated, not faked.** `notApplicable` in `./shared.mjs` exists so a
 * toolchain whose compiler subsumes typechecking can say exactly that. It cannot return
 * `true`, and it cannot return an empty command, because both are indistinguishable from a
 * step that ran and passed.
 *
 * **A skipped operation is reported.** {@link gatesFor} returns the skips alongside the gates.
 * A gate list that silently shrinks from six entries to four looks identical to one that
 * always had four, and the operator has no way to notice.
 *
 * **CI is derived from the same table as the gates.** Before this, `commandGates` ran
 * `npx vitest run` while CI inspection accepted `node --test`. Now both come from one
 * toolchain, and a test asserts that each CI pattern matches the very command string its own
 * operation produces — so the two cannot disagree by construction rather than by vigilance.
 */

import { E2E_REPORT, UNIT_REPORT, nodeToolchain } from './node.mjs';
import { ToolchainError } from './shared.mjs';

/** @typedef {import('./shared.mjs').Operation} Operation */

/**
 * @typedef {'restore' | 'build' | 'lint' | 'types' | 'unit' | 'e2e' | 'security-audit'} OperationName
 */

/** @typedef {{ root: string, dareDir: string }} OperationContext */

/**
 * @typedef {{
 *   name: string,
 *   detect: (root: string) => string | null,
 *   operations: Record<OperationName, (context: OperationContext) => Operation>,
 *   startCommand: (root: string) => string | null,
 *   ci: { operation: OperationName, pattern: RegExp }[]
 * }} Toolchain
 */

/**
 * The operations that become Phase-3 gates, in the order they run. Cheap and broad first: a
 * build failure makes every later gate's output noise.
 *
 * `restore` is deliberately absent — it is part of the contract because a toolchain that
 * cannot express "restore dependencies" cannot describe .NET or Rust, but wiring it as a gate
 * would reinstall dependencies before every iteration.
 *
 * @type {OperationName[]}
 */
export const GATE_OPERATIONS = ['build', 'lint', 'types', 'unit', 'e2e', 'security-audit'];

export { E2E_REPORT, ToolchainError, UNIT_REPORT };

/**
 * Every toolchain this build can drive, in detection order.
 * @type {Toolchain[]}
 */
export const TOOLCHAINS = [nodeToolchain];

/**
 * The toolchain used when detection finds nothing.
 *
 * A greenfield run has no `package.json` on iteration 1 — the repository is a PRD and some
 * design documents — so detection is honestly empty at exactly the moment the gates are first
 * assembled. Refusing to pick would abort every greenfield run, and greenfield is the primary
 * use case.
 *
 * Node is the default because it is the only implementation. When a second one lands this
 * stops being obvious, and the answer is the same one capabilities reached (§3.7): the
 * architect declares it and detection confirms. Do not quietly leave this as "whichever is
 * first in the array".
 */
const DEFAULT_TOOLCHAIN = nodeToolchain;

/**
 * Which toolchain this tree looks like, with the evidence, or null.
 *
 * @param {string} root
 * @returns {{ toolchain: Toolchain, evidence: string } | null}
 */
export function detectToolchain(root) {
  for (const toolchain of TOOLCHAINS) {
    const evidence = toolchain.detect(root);
    if (evidence !== null) return { toolchain, evidence };
  }
  return null;
}

/**
 * The toolchain to drive this tree with, detected or defaulted.
 *
 * @param {string} root
 * @returns {{ toolchain: Toolchain, evidence: string, detected: boolean }}
 */
export function resolveToolchain(root) {
  const found = detectToolchain(root);
  if (found !== null) return { ...found, detected: true };
  return {
    toolchain: DEFAULT_TOOLCHAIN,
    evidence: `nothing detected; defaulted to ${DEFAULT_TOOLCHAIN.name}`,
    detected: false,
  };
}

/**
 * Turn a toolchain's operations into the Phase-3 gate list.
 *
 * @param {Toolchain} toolchain
 * @param {OperationContext} context
 * @returns {{
 *   gates: { name: string, command: string[], required: boolean }[],
 *   skipped: { name: string, reason: string }[]
 * }}
 * @throws {ToolchainError} when the toolchain does not implement a gate operation
 */
export function gatesFor(toolchain, context) {
  /** @type {{ name: string, command: string[], required: boolean }[]} */
  const gates = [];
  /** @type {{ name: string, reason: string }[]} */
  const skipped = [];

  for (const name of GATE_OPERATIONS) {
    const produce = toolchain.operations[name];
    if (typeof produce !== 'function') {
      throw new ToolchainError(
        `toolchain ${JSON.stringify(toolchain.name)} does not implement the ${JSON.stringify(name)} operation. ` +
          'Every gate operation must be present — declare it not-applicable with a reason rather than omitting ' +
          'it, because an absent key and a deliberate skip read the same to a caller.',
      );
    }
    const operation = produce(context);
    if (operation.kind === 'not-applicable') {
      skipped.push({ name, reason: operation.reason });
      continue;
    }
    gates.push({ name, command: operation.command, required: true });
  }

  return { gates, skipped };
}
