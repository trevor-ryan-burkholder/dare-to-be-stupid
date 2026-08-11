/**
 * Which gates apply to which projects (DESIGN.md §4.2).
 *
 * A table, not a rules engine. Every gate the loop can run is named below with one of two
 * verdicts and a written reason, and the reason is the deliverable — a skip nobody can explain
 * is a skip nobody can audit.
 *
 * The problem this solves is real and was costing whole runs. `npx playwright test` ran on
 * every project, including ones with no browser to drive; on a CLI or a library it failed on a
 * missing config rather than on a defect, and since nothing defaults to pass, such a project
 * could never get past Phase 3 at all. The gate was not catching a fault, it was reporting the
 * absence of something the project was never meant to have.
 *
 * Two rules keep this from becoming a way to switch gates off.
 *
 * **Universal is the default.** A gate that is not in the table applies. Adding a gate and
 * forgetting the table makes it run everywhere, which is the safe direction; a test asserts
 * the table is complete, so the omission is still caught — just not by a skipped check.
 *
 * **A conditional gate needs a capability, and capabilities are declared plus detected**
 * (§3.7). The architect cannot make a gate disappear by staying silent: under-declaring is
 * what the declaration prompt warns against, and detection adds back whatever the tree shows.
 */

/** @typedef {import('./capabilities.mjs').Capability} Capability */

/**
 * @typedef {{ appliesTo: Capability[] | null, why: string }} GateRule
 *          `appliesTo: null` means universal. Otherwise the gate runs when the project has any
 *          one of the listed capabilities.
 */

/**
 * Every gate, and why it is universal or conditional.
 *
 * The `why` strings are shown to the operator when a gate is skipped, so they are written to
 * be read by someone deciding whether the skip was correct.
 *
 * @type {Record<string, GateRule>}
 */
export const GATE_POLICY = {
  // --- Universal -----------------------------------------------------------
  // These hold for a library, a CLI, a daemon and a website alike. If one ever needs a
  // condition, that is a sign the gate is doing two jobs and should be split instead.
  build: { appliesTo: null, why: 'anything that ships has to be producible from its source' },
  lint: { appliesTo: null, why: 'every toolchain here has a linter, and its absence is itself a finding' },
  types: { appliesTo: null, why: 'a static check is either configured or the toolchain declares it not-applicable' },
  unit: {
    appliesTo: null,
    why: 'the ratchet is built from unit test ids; a project with none cannot be protected from regressions at all',
  },
  'security-audit': {
    appliesTo: null,
    why: 'a dependency with a known advisory is a defect regardless of what the project does with it',
  },
  ci: { appliesTo: null, why: 'the validation set has to run somewhere other than this loop' },
  docs: {
    appliesTo: null,
    why:
      'every one of these shapes has a public surface a reader needs described - a CLI has its flags, a library ' +
      'its exports, a service its endpoints',
  },
  'red-evidence': {
    appliesTo: null,
    why: 'a test that has only ever been green is unproven whatever the project is',
  },
  integrity: { appliesTo: null, why: 'a gate is only worth running while its configuration still means something' },
  mutation: {
    appliesTo: null,
    why:
      'a test that passes whatever the code does is worthless to every shape of project. This one runs in the ' +
      'conditional second pass rather than beside the others, which is a question of ordering rather than of ' +
      'capability - see CONDITIONAL_GATE_OPERATIONS',
  },

  // --- Conditional ---------------------------------------------------------
  e2e: {
    appliesTo: ['web-ui', 'desktop-ui'],
    why:
      'the end-to-end runner drives a browser. A CLI or library has none, so the gate reports a missing config ' +
      'rather than a defect - and reports it forever, because nothing defaults to pass',
  },
  observability: {
    appliesTo: ['api', 'network-service'],
    why:
      'this gate asks a health endpoint to answer a real request. Only something that listens on a port has one; ' +
      "a CLI's exit code is its health check",
  },
};

/**
 * Does this gate apply to a project with these capabilities?
 *
 * @param {string} gate
 * @param {readonly string[]} capabilities the resolved set (§3.7)
 * @returns {{ applies: boolean, why: string }}
 */
export function gateApplies(gate, capabilities) {
  const rule = Object.hasOwn(GATE_POLICY, gate) ? GATE_POLICY[gate] : undefined;
  if (rule === undefined) {
    // Not a shrug: running an unrecognised gate is the safe direction, and the completeness
    // test is what stops the table quietly falling behind the gate list.
    return { applies: true, why: `${gate} is not in the capability table; gates default to universal` };
  }
  if (rule.appliesTo === null) return { applies: true, why: rule.why };

  const matched = rule.appliesTo.filter((capability) => capabilities.includes(capability));
  if (matched.length > 0) return { applies: true, why: `this project is ${matched.join(', ')}` };
  return { applies: false, why: `this project is none of ${rule.appliesTo.join(', ')}. ${rule.why}` };
}

/**
 * Split a gate list into the ones that apply and the ones that do not.
 *
 * Skips are returned rather than discarded. A gate list that quietly shrinks reads exactly
 * like one that was always that short, and the operator has nothing to disagree with.
 *
 * @template {{ name: string }} T
 * @param {T[]} gates
 * @param {readonly string[]} capabilities
 * @returns {{ gates: T[], skipped: { name: string, reason: string }[] }}
 */
export function applicableGates(gates, capabilities) {
  /** @type {T[]} */
  const kept = [];
  /** @type {{ name: string, reason: string }[]} */
  const skipped = [];
  for (const gate of gates) {
    const verdict = gateApplies(gate.name, capabilities);
    if (verdict.applies) kept.push(gate);
    else skipped.push({ name: gate.name, reason: verdict.why });
  }
  return { gates: kept, skipped };
}
