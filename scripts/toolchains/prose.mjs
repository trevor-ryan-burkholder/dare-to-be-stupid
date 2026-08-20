/**
 * The prose/artifact toolchain (`DESIGN.md` §3.8, §3.8.3; `PLAN.md` item 49).
 *
 * This is the substrate that lets the spine drive *"write me a book about…"* or *"research
 * this and make a report…"* without the spine learning what a book is. The ratchet parses
 * reporter JSON into ids and holds those ids monotonic — it has no concept of a "test", only
 * of ids that passed. A gate is any command with an exit code. So an artifact whose
 * deterministic checks emit reporter JSON drives the existing machine unchanged, and the whole
 * of the work lands here, at the toolchain layer.
 *
 * ## It never detects, and that is the design rather than a gap
 *
 * Every other adapter recognizes itself from an artifact: a `package.json`, a `.csproj`. A
 * prose project has no such thing. A directory of markdown is a manuscript, a documentation
 * site, a notes folder, or this repository — the evidence does not distinguish them, and item
 * 49's instruction was explicit: **do not sniff.** A detector built on "there is a `.md` here"
 * would claim a finding it does not have, and the cost is not symmetric. Failing to detect a
 * prose project means the operator declares it; wrongly detecting one means a real application
 * silently loses `build`, `types`, `e2e` and `security-audit` and ships with four gates having
 * never run.
 *
 * So {@link proseToolchain.detect} returns `null` unconditionally, and this toolchain is
 * reachable **only** through `config.toolchain` (§3.8.2) — which is why that declaration was
 * built first and why this file could not exist before it.
 *
 * ## What is deterministic here, and what is not
 *
 * For code, *does it pass* is objective. For prose, **structure and traceability** are
 * objective — a section exists, a citation's quoted text really appears at the locator it
 * names, a manifest does not assign two conflicting normalized values to one claim id — while
 * **source support, factual truth and quality** require judgment. The guarantee weakens from
 * *provably correct* to *provably structurally sound and traceable, plus cold factuality and
 * quality judgments*. That is still far better than an unverified writing agent, and a run
 * must never dress the second as the first: no operation in this file may report that a
 * citation **resolving** proves the claim it supports.
 *
 * ## Why the unit runner is vitest and not node's own
 *
 * `extractTestIds` parses three formats and has committed fixtures for each: vitest JSON,
 * Playwright JSON, and .NET TRX. Node's built-in runner emits none of them. Item 49's claim of
 * *zero parser work* is only true through a runner the ratchet already reads, so the checks
 * are ordinary vitest files over the artifact directory and each check is a test id the
 * ratchet then holds monotonic — a chapter that once passed may never silently regress.
 *
 * ## Four operations decline, loudly
 *
 * A manuscript is not compiled, has no type system, and has no browser flow. Those are stated
 * with {@link notApplicable} rather than omitted, because §3.8's rule is that a gate list which
 * silently shrinks from six entries to two reads exactly like a job that never needed the other
 * four. `security-audit` does **not** decline: the checks are real JavaScript with real
 * dependencies, and that dependency surface is as exploitable in a manuscript repository as
 * anywhere else.
 */

import path from 'node:path';

import { UNIT_REPORT } from './node.mjs';
import { command, notApplicable } from './shared.mjs';

/** @type {import('./index.mjs').Toolchain} */
export const proseToolchain = {
  name: 'prose',

  /**
   * Never. See this file's header: there is no artifact that distinguishes a prose project
   * from any other repository containing markdown, and inventing one would misclassify real
   * applications into a toolchain with four gates missing.
   *
   * Returning `null` here is not a stub. It is the same refusal `notApplicable` encodes for
   * operations, applied to detection: *this cannot be determined* and *this was determined to
   * be absent* are different claims, and only the honest one is available.
   *
   * @returns {null}
   */
  detect() {
    return null;
  },

  operations: {
    // The checks are vitest files, so their dependencies have to be present before they run.
    // Not gated, for the same reason node's is not (§3.8).
    restore: () => command(['npm', 'ci']),

    build: () =>
      notApplicable(
        'a manuscript is not compiled; there is no build step whose failure would mean anything about the ' +
          'artifact, and a command that trivially succeeds would be indistinguishable from one that checked',
      ),

    // Declined rather than guessed. `vale` is the obvious prose linter and its argv has not
    // been run here — the .NET adapter's header is about exactly this, and it cost that
    // adapter two wrong commands. Prose style belongs in the checks suite regardless, where it
    // is a ratcheted id rather than a pass/fail whose result nothing remembers.
    lint: () =>
      notApplicable(
        'no prose linter is verified for this adapter; vale and markdownlint are per-project installs whose ' +
          'command lines have not been run here, and an unverified command is worse than a declared gap. ' +
          'Style and word-count floors belong in the checks suite, where the ratchet holds them',
      ),

    types: () =>
      notApplicable('prose has no type system, so there is no static check to run over the artifact'),

    /**
     * The checks-as-tests suite. Identical argv to node's, deliberately: it is the same runner
     * writing the same report to the same place, and the ratchet reads it with no parser change.
     * What differs is what the tests assert about — an artifact rather than a program.
     *
     * @param {{ meeseeksDir: string }} context
     */
    unit: ({ meeseeksDir }) =>
      command(['npx', 'vitest', 'run', '--reporter=json', `--outputFile=${path.join(meeseeksDir, UNIT_REPORT)}`]),

    e2e: () =>
      notApplicable(
        'there is no application to drive; an artifact has no runtime, and the end-to-end gate is ' +
          'capability-armed (§4.2) rather than universal',
      ),

    // Not declined. The checks are real JavaScript with real dependencies, and a vulnerable
    // transitive package is exactly as real here as in an application.
    'security-audit': () => command(['npm', 'audit', '--audit-level=high']),

    mutation: () =>
      notApplicable(
        'mutation testing perturbs source to see whether tests notice; the subject here is an artifact rather ' +
          'than a program, and mutating the checks would measure the checks rather than the writing',
      ),
  },

  /**
   * Nothing to start. An artifact has no runtime, so the health probe passes on its static
   * finding and states that it did not probe, rather than being handed a command that fails.
   *
   * @returns {null}
   */
  startCommand() {
    return null;
  },

  // One report, because `e2e` is declined and a declined operation must not name one: the
  // driver would look for a file nothing writes, and finding it absent is not evidence.
  reports: [UNIT_REPORT],

  reportOwners: { [UNIT_REPORT]: 'unit' },

  // Only the two operations that produce a command. An operation with no command string has no
  // pattern a workflow could match, which is why the four declines are absent here too.
  ci: [
    { operation: 'unit', pattern: /\bvitest\s+run\b/ },
    { operation: 'security-audit', pattern: /\bnpm\s+audit\b/ },
  ],
};
