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

import { dotnetToolchain } from './dotnet.mjs';
import { E2E_REPORT, UNIT_REPORT, nodeToolchain } from './node.mjs';
import { ToolchainError } from './shared.mjs';

/** @typedef {import('./shared.mjs').Operation} Operation */

/**
 * @typedef {'restore' | 'build' | 'lint' | 'types' | 'unit' | 'e2e' | 'security-audit'
 *   | 'mutation'} OperationName
 */

/**
 * @typedef {{ root: string, dareDir: string, changedFiles?: string[] }} OperationContext
 *
 * `changedFiles` is measured against the last **ratchet-advancing** commit rather than the
 * last iteration, and that is not a detail. A regression iteration changes nothing but the
 * repair, so a diff against the previous iteration would hand a scoped gate an empty set and
 * it would report a clean pass over nothing.
 */

/**
 * @typedef {{
 *   name: string,
 *   detect: (root: string) => string | null,
 *   operations: Record<OperationName, (context: OperationContext) => Operation>,
 *   startCommand: (root: string) => string | null,
 *   reports: string[],
 *   ci: { operation: OperationName, pattern: RegExp }[]
 * }} Toolchain
 *
 * `reports` names the files this toolchain's test operations write, relative to `.dare`. It
 * exists because the driver used to hardcode node's two filenames, so a toolchain writing
 * anything else produced a report nobody read — and a report nobody reads is indistinguishable
 * from a run in which no test passed, which is exactly how both live runs on 10 August 2026
 * ended at `passing: 0`.
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

/**
 * Operations that run in a **second pass**, and only when every gate in the first one passed.
 *
 * This is the whole of the ordering change, and it exists because mutation testing does not
 * fit the flat model. It is slow enough that running it beside `build` on an iteration that
 * does not compile is waste, and its verdict is not monotonic the way the rest of Phase 3 is:
 * surviving-mutant counts vary with which files changed, so two green iterations can disagree
 * without either being wrong.
 *
 * A failure in the first pass therefore costs nothing extra. A conditional gate is still a
 * gate — it fails the iteration exactly as any other does — it simply is not asked until
 * asking is worth the time.
 *
 * @type {OperationName[]}
 */
export const CONDITIONAL_GATE_OPERATIONS = ['mutation'];

export { E2E_REPORT, ToolchainError, UNIT_REPORT };

/**
 * Every toolchain this build can drive, **in detection order**, and the order is now
 * load-bearing in a way it was not while there was only one entry.
 *
 * `detectToolchain` returns the first match, so a repository holding both a `package.json` and
 * a `.csproj` resolves to node. That is the common shape of a .NET service with a JavaScript
 * frontend, and resolving it to node is a **guess**, not a finding — the two detectors are not
 * disjoint and neither is wrong on its own evidence.
 *
 * §3.8 predicted this exact moment: *"Node is the default because it is the only
 * implementation. When a second one lands that stops being obvious, and the answer is §3.7's:
 * the architect declares it and detection confirms."* **That declaration is not built.** Until
 * it is, a mixed repository is driven by the node toolchain and nothing says so out loud,
 * which is the one silent thing in this module.
 *
 * Node stays first regardless, because reversing the order would trade a rare wrong answer for
 * a common one: far more repositories carry an incidental `package.json` than carry an
 * incidental `.csproj`.
 *
 * @type {Toolchain[]}
 */
export const TOOLCHAINS = [nodeToolchain, dotnetToolchain];

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
 * `alternatives` holds every *other* toolchain that also matched, and it exists because the
 * second toolchain has landed and made the comment above load-bearing. A tree with both a
 * `package.json` and a `.csproj` resolves to node — the array order — and used to say nothing
 * about it. The resolution is unchanged and still deterministic; what is no longer silent is
 * that a choice was made. The architect declaration this file asks for is still the real fix,
 * and an operator cannot ask for it while the ambiguity is invisible.
 *
 * @param {string} root
 * @returns {{ toolchain: Toolchain, evidence: string,
 *             alternatives: { toolchain: Toolchain, evidence: string }[] } | null}
 */
export function detectToolchain(root) {
  /** @type {{ toolchain: Toolchain, evidence: string }[]} */
  const matched = [];
  for (const toolchain of TOOLCHAINS) {
    const evidence = toolchain.detect(root);
    if (evidence !== null) matched.push({ toolchain, evidence });
  }
  if (matched.length === 0) return null;
  // First match still wins, and deterministically. What changes is that the losers are
  // reported: a tree holding both a `package.json` and a `.csproj` resolved to node with
  // nothing said, and "silently" is the whole of the complaint. Same rule as a skipped gate.
  return { ...matched[0], alternatives: matched.slice(1) };
}

/**
 * The toolchain to drive this tree with, detected or defaulted.
 *
 * @param {string} root
 * @returns {{ toolchain: Toolchain, evidence: string, detected: boolean,
 *             alternatives: { toolchain: Toolchain, evidence: string }[] }}
 */
export function resolveToolchain(root) {
  const found = detectToolchain(root);
  if (found !== null) {
    // The ambiguity travels in `evidence` because that is the field the driver already prints
    // and the run manifest already records. A field nobody displays would document the problem
    // to no audience.
    const also = found.alternatives.map((entry) => `${entry.toolchain.name} (${entry.evidence})`);
    const evidence =
      also.length === 0
        ? found.evidence
        : `${found.evidence}; also matched ${also.join(', ')} - first match wins, so declare the ` +
          'toolchain if this tree is not a node project';
    return { toolchain: found.toolchain, evidence, detected: true, alternatives: found.alternatives };
  }
  return {
    toolchain: DEFAULT_TOOLCHAIN,
    evidence: `nothing detected; defaulted to ${DEFAULT_TOOLCHAIN.name}`,
    detected: false,
    alternatives: [],
  };
}

/**
 * Turn a toolchain's operations into the Phase-3 gate list.
 *
 * @param {Toolchain} toolchain
 * @param {OperationContext} context
 * @param {OperationName[]} [operations] which pass to build; defaults to the first
 * @returns {{
 *   gates: { name: string, command: string[], required: boolean }[],
 *   skipped: { name: string, reason: string }[]
 * }}
 * @throws {ToolchainError} when the toolchain does not implement a gate operation
 */
export function gatesFor(toolchain, context, operations = GATE_OPERATIONS) {
  /** @type {{ name: string, command: string[], required: boolean }[]} */
  const gates = [];
  /** @type {{ name: string, reason: string }[]} */
  const skipped = [];

  for (const name of operations) {
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
