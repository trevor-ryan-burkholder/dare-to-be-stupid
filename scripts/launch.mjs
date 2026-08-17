/**
 * The launch boundary — what the driver observed, and what each pre-loop phase is allowed to
 * leave behind (DESIGN.md §3.5, REVIEW F26).
 *
 * **Two separate holes, both closed here.**
 *
 * The first is the gap between the command's preflight and the driver starting. `commands/
 * meeseeks.md` runs `init.mjs` and the driver as two model-directed Bash calls, and Claude Code's
 * `allowed-tools` is documented as a *pre-approval* rather than a restriction on the launcher's
 * tool pool — so nothing but prose stops another tool call, a concurrent operator, or another
 * process changing the repository in between. Preflight's answer is therefore operator feedback
 * with a shelf life, and the driver has to observe the mutable facts itself, under the run lock,
 * before it archives anything, spawns anything, writes anything or commits anything.
 *
 * The checks are *reused* from `preflight.mjs` rather than reimplemented. A second, weaker
 * lookalike of "is this remote production-shaped" is how two answers to one question start
 * disagreeing, and the one that disagrees quietly is always the one that matters.
 *
 * **What this deliberately does not claim.** A repository snapshot says nothing about mutable host
 * state: the `claude` binary, its authentication, and the network can all change after this
 * observation and are checked where they are used. Those remain ordinary fail-closed failures.
 * F28/PLAN item 83 owns CLI identity; this module owns the repository.
 *
 * The second hole is provenance. The PRD and design children hold `Write`/`Edit` over the whole
 * repository even though their templates declare exact output paths, and the phase commit staged
 * `git add -A` — so any change present at that moment, whoever made it, was committed under a
 * message claiming it was Meeseeks document output. An admitted phase compares the *complete*
 * tracked and untracked change set against the template's declared contract and refuses an
 * unexpected neighbour instead of absorbing it. Refusing never cleans, resets or overwrites the
 * surprise: it may be the operator's data, and destroying evidence to make a check pass is the
 * failure this project keeps finding in other shapes.
 */

import path from 'node:path';

import { writeFileSync } from 'node:fs';

import {
  checkAgentSurface,
  checkCleanWorkingTree,
  checkConfig,
  checkRemoteIsNotProduction,
  checkSandboxAvailable,
  checkStateNotTracked,
} from './preflight.mjs';

/** @typedef {import('./preflight.mjs').CheckResult} CheckResult */
/** @typedef {(command: string, args: string[]) => Promise<{ ok: boolean, stdout: string, stderr: string }>} Run */

/** The driver-owned launch receipt inside `.meeseeks/`. */
export const LAUNCH_RECEIPT_FILE = 'launch.json';

/** The receipt's own schema version, bumped when a field's meaning changes. */
const RECEIPT_VERSION = 1;

/**
 * How many paths a receipt records before it starts counting instead of listing.
 *
 * Bounded on purpose: a receipt is forensic metadata, and an unbounded list of every path in a
 * repository is a file nobody reads attached to a decision nobody can check.
 */
export const RECEIPT_PATH_LIMIT = 50;

/**
 * The marker a phase template uses to state, machine-readably, what it may write.
 *
 * **Read from the template rather than restated here, and that is deliberate.** F26 asks for an
 * allowlist "matching its template contract"; a copy of the architect's output table living in a
 * script would match it on the day it was written and drift afterwards, and the drift would be
 * silent in both directions — a new declared output refused as a neighbour, or a removed one still
 * admitted. Deriving it makes the match structural. It also keeps `PRODUCT.md` out of every shipped
 * script, which is a separate invariant: nothing that decides pass or fail may consult that file,
 * and the strongest form of that guarantee is that no code path names it.
 */
export const DECLARED_OUTPUTS_MARKER = 'meeseeks:declared-outputs';

/**
 * What one phase's template says it may leave in the repository.
 *
 * An allowlist, never a required set: `templates/architect.md` makes `docs/openapi.yaml`
 * conditional on the project exposing an HTTP API, so a declared output that does not appear is
 * the template's own condition working. A path that appears and is not declared is the defect.
 *
 * A template with no marker, or with an empty one, throws. Nothing defaults to pass, and this one
 * fails in both directions if it is allowed to be absent: an empty allowlist refuses every run, and
 * a missing one would have to mean "allow anything", which is the `git add -A` this replaces.
 *
 * @param {{ template: string, name: string }} options
 * @returns {string[]}
 */
export function declaredOutputs(options) {
  const match = options.template.match(new RegExp(`<!--\\s*${DECLARED_OUTPUTS_MARKER}([^>]*?)-->`));
  if (match === null) {
    throw new Error(
      `templates/${options.name} declares no <!-- ${DECLARED_OUTPUTS_MARKER} ... --> line, so the paths that ` +
        'phase is allowed to write cannot be established. Refusing rather than committing whatever it produced.',
    );
  }
  const paths = match[1].trim().split(/\s+/).filter((entry) => entry !== '');
  if (paths.length === 0) {
    throw new Error(
      `templates/${options.name} declares an empty ${DECLARED_OUTPUTS_MARKER} list, which would refuse every ` +
        'output that phase is asked to produce. State the paths it writes.',
    );
  }
  return paths;
}

/**
 * Is this path the run's own machine state rather than the target's content?
 *
 * `.meeseeks/` is driver-owned, gitignored on any run past its first, and protected positionally
 * by the guard hook. It is never a phase output and never an unexpected neighbour.
 *
 * @param {string} target
 * @returns {boolean}
 */
function isMachineState(target) {
  return target === '.meeseeks' || target === '.meeseeks/' || target.startsWith('.meeseeks/');
}

/**
 * Every path `git status --porcelain -z` reports, in the order it reported them.
 *
 * **`-z`, because the quoted form is a parser waiting to be wrong.** Without it git escapes any
 * path containing a space, a quote or a non-ASCII byte into a C-style quoted string, and a rename
 * arrives as `old -> new` inside that same escaping. NUL separation removes the escaping entirely:
 * every field is a literal path, and a rename is simply two fields — the destination first, then
 * the source, which is why the status characters have to be read rather than assumed.
 *
 * Both halves of a rename are returned. A phase that renamed a file it was not allowed to touch
 * has changed that file, and reporting only where it landed would admit the move.
 *
 * @param {string} stdout
 * @returns {string[]}
 */
export function parsePorcelain(stdout) {
  const fields = stdout.split('\0').filter((field) => field !== '');
  /** @type {string[]} */
  const paths = [];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    // `XY path`: two status characters and a space. Anything shorter is not an entry.
    if (field.length < 4) continue;
    const status = field.slice(0, 2);
    paths.push(field.slice(3));
    if (status.includes('R') || status.includes('C')) {
      // The source of a rename or copy is the next field, and it is a path this phase touched.
      index += 1;
      if (index < fields.length) paths.push(fields[index]);
    }
  }
  return paths;
}

/**
 * What has changed in the target since the last commit — tracked and untracked, machine state
 * excluded.
 *
 * Ignored files are absent because git omits them, which is the right boundary: `node_modules/`
 * and build output are not phase provenance. A `git status` that fails is a refusal rather than an
 * empty answer — an unreadable tree is not evidence of an unchanged one.
 *
 * **`--untracked-files=all`, and it is load-bearing rather than tidy.** git's default collapses a
 * wholly new directory to a single entry — a greenfield design phase writing `docs/architecture.md`
 * reports `docs/`, which matches no declared path and would have refused every run this feature
 * exists to protect. Measured on the first integration fixture that wrote into a directory the
 * repository did not already have.
 *
 * @param {{ run: Run, cwd: string }} options
 * @returns {Promise<string[]>}
 * @throws {Error} when git cannot describe the tree
 */
export async function changedPaths(options) {
  const result = await options.run('git', ['status', '--porcelain', '-z', '--untracked-files=all']);
  if (!result.ok) {
    throw new Error(
      `git status could not describe this repository (${result.stderr.trim() || 'no output'}), so a phase's ` +
        'output cannot be checked against what it declared. Refusing rather than committing an unexamined tree.',
    );
  }
  return [...new Set(parsePorcelain(result.stdout).filter((target) => !isMachineState(target)))].sort();
}

/**
 * Decide what a phase may commit.
 *
 * @param {{ changed: string[], allowed: string[] }} options
 * @returns {{ ok: boolean, admitted: string[], unexpected: string[] }}
 */
export function admitOutputs(options) {
  const allowed = new Set(options.allowed);
  const admitted = options.changed.filter((target) => allowed.has(target));
  const unexpected = options.changed.filter((target) => !allowed.has(target));
  return { ok: unexpected.length === 0, admitted, unexpected };
}

/**
 * The refusal an unexpected neighbour earns, as an operator-facing sentence.
 *
 * @param {{ phase: string, unexpected: string[], allowed: string[] }} options
 * @returns {string}
 */
export function describeUnexpected(options) {
  const listed = options.unexpected.slice(0, RECEIPT_PATH_LIMIT);
  const more = options.unexpected.length - listed.length;
  return (
    `the ${options.phase} phase changed ${options.unexpected.length} path(s) it does not declare: ` +
    `${listed.join(', ')}${more > 0 ? ` and ${more} more` : ''}. ` +
    `That phase declares ${options.allowed.length === 0 ? 'no repository output at all' : options.allowed.join(', ')}. ` +
    'Nothing was staged, committed, reset or removed — the change is still on disk, because it may be yours.'
  );
}

/**
 * Everything the driver must observe for itself before it touches the repository.
 *
 * Ordered so the cheapest and most likely refusal comes first, but every check runs regardless:
 * an operator who has three problems should learn all three now rather than one restart at a time,
 * which is preflight's own rule and the reason these results are a list.
 *
 * @param {{ cwd: string, meeseeksDir: string, sandboxWanted: boolean, probe: import('./preflight.mjs').Probe }} options
 * @returns {Promise<{ ok: boolean, head: string, checks: CheckResult[], failures: CheckResult[] }>}
 */
export async function revalidateLaunch(options) {
  const headResult = options.probe('git', ['rev-parse', 'HEAD']);
  const head = headResult.ok ? headResult.stdout.trim() : '';
  /** @type {CheckResult[]} */
  const checks = [
    checkCleanWorkingTree(options.probe),
    await checkStateNotTracked(options.probe),
    checkRemoteIsNotProduction(options.probe),
    checkConfig(options.meeseeksDir),
    checkAgentSurface(options.cwd),
    checkSandboxAvailable(options.probe, options.sandboxWanted),
  ];
  const failures = checks.filter((result) => !result.ok);
  return { ok: failures.length === 0, head, checks, failures };
}

/**
 * @typedef {{
 *   version: number,
 *   at: string,
 *   head: string,
 *   checks: { name: string, ok: boolean }[],
 *   phases: { phase: string, declared: string[] | null, staged: string[], truncated: number }[]
 * }} LaunchReceipt
 */

/**
 * Start a receipt from what launch observed.
 *
 * **Names and verdicts only, never a check's `detail`.** Those sentences quote what they found,
 * and `safe-remote` quotes the remote URL — which is exactly where a credential lives when one is
 * embedded in it. The receipt says which checks were made and how they answered; the sentences go
 * to the log, where they always have.
 *
 * @param {{ at: string, head: string, checks: CheckResult[] }} options
 * @returns {LaunchReceipt}
 */
export function buildLaunchReceipt(options) {
  return {
    version: RECEIPT_VERSION,
    at: options.at,
    head: options.head,
    checks: options.checks.map((result) => ({ name: result.name, ok: result.ok })),
    phases: [],
  };
}

/**
 * Record what one pre-loop phase was allowed to leave and what was actually staged.
 *
 * `declared: null` means the phase has no template contract to hold it to — quality-plugin
 * provisioning writes whatever the tools it installs write. Recording the paths is the honest
 * alternative to pretending an allowlist exists, and it is still not `git add -A`: the staging
 * list is enumerated, printed and kept.
 *
 * @param {LaunchReceipt} receipt
 * @param {{ phase: string, declared: string[] | null, staged: string[] }} entry
 * @returns {LaunchReceipt}
 */
export function recordPhase(receipt, entry) {
  const staged = entry.staged.slice(0, RECEIPT_PATH_LIMIT);
  return {
    ...receipt,
    phases: [
      ...receipt.phases,
      {
        phase: entry.phase,
        declared: entry.declared,
        staged,
        truncated: entry.staged.length - staged.length,
      },
    ],
  };
}

/**
 * @param {string} meeseeksDir
 * @param {LaunchReceipt} receipt
 * @returns {void}
 */
export function writeLaunchReceipt(meeseeksDir, receipt) {
  writeFileSync(path.join(meeseeksDir, LAUNCH_RECEIPT_FILE), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
}
