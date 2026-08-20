/**
 * Walk one archived run's acceptance receipt against a clean clone (`REVIEW.md` F22).
 *
 * Usage:
 *
 *     node tools/acceptance-audit.mjs <runDir> <cloneDir>
 *
 * `runDir` is one archived run — the shape `run-manifest.mjs` writes under `.meeseeks/runs/<slot>/`.
 * `cloneDir` is a fresh clone of the published repository.
 *
 * **The point of the separation is the auditor's position.** They hold the archived run and a clone
 * and nothing else: no working tree from the run, no gate output, no memory of what was checked.
 * Every edge this resolves is one they can resolve for themselves, which is what F22's acceptance
 * bullet asks for — and every edge it *cannot* is printed as `digest-only` rather than omitted.
 *
 * Exit 0 when every required edge resolves, 1 otherwise. Not a gate in the loop; a command a
 * reviewer runs against a shipped run.
 */

import { execFileSync } from 'node:child_process';
import process from 'node:process';

import { auditAcceptance } from '../scripts/audit.mjs';

/** @type {(command: string, args: string[], options: { cwd: string }) => { ok: boolean, stdout: string }} */
const run = (command, args, options) => {
  try {
    return { ok: true, stdout: execFileSync(command, args, { cwd: options.cwd, encoding: 'utf8', stdio: 'pipe' }) };
  } catch (error) {
    return { ok: false, stdout: String(/** @type {{ stdout?: string }} */ (error).stdout ?? '') };
  }
};

const [runDir, cloneDir] = process.argv.slice(2);
if (runDir === undefined || cloneDir === undefined) {
  process.stdout.write('usage: node tools/acceptance-audit.mjs <runDir> <cloneDir>\n');
  process.exit(2);
}

const result = await auditAcceptance({ runDir, cloneDir, run });
for (const edge of result.edges) {
  process.stdout.write(`${edge.state.padEnd(11)} ${edge.edge}\n            ${edge.detail}\n`);
}
process.stdout.write(`\n${result.ok ? 'ok' : 'FAILED'}: ${result.summary}\n`);
process.exit(result.ok ? 0 : 1);
