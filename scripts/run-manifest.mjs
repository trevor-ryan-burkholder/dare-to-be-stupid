/**
 * `.meeseeks/run.json` — what this run was, written once at the start (DESIGN.md §7.1).
 *
 * A run can end four hours later on a machine nobody is watching, and the first question
 * afterwards is always some version of *what was this, exactly*: which plugin build, which
 * models, which toolchain, which capabilities, which commit did it start from. Reconstructing
 * that from a transcript is guesswork, and reconstructing it from the working tree is worse,
 * because the run changed the working tree.
 *
 * Three properties, and the third is the one to defend.
 *
 * **It records, it does not decide.** Nothing in this codebase reads `run.json` back. That is
 * deliberate, and it is why there is no reader function here: the strongest available
 * guarantee that a manifest's *contents* never influence a run is that no code path can
 * consult them. Failing to *write* one may fail a run — an artifact the operator was promised
 * and did not get is a real fault — but what is in it decides nothing.
 *
 * **No secrets.** The configuration is recorded as a hash rather than embedded. Today
 * `.meeseeks/config.json` holds only models, counts and booleans, so embedding it would be
 * harmless; hashing it stays harmless after someone adds a field that is not. The hash still
 * answers the question worth asking — "was this the same configuration as that run?"
 *
 * **Nothing is inferred.** Every value is passed in. No clock is read here and no command is
 * run here, and a missing field throws rather than defaulting, because a manifest that quietly
 * says `"unknown"` is worse than no manifest: it looks like evidence.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { ASSUMPTIONS_FILE } from './assumptions.mjs';
import { CAPABILITY_MANIFEST } from './capabilities.mjs';
import { JOURNAL_FILE } from './journal.mjs';
import { LAUNCH_RECEIPT_FILE } from './launch.mjs';
import { ACCEPTANCE_FILE } from './acceptance-file.mjs';
import { ORACLE_FILE } from './oracle.mjs';
import { SUPPLY_FILE } from './role-supply.mjs';
import { SPECIFICATION_FILE } from './specification.mjs';

/** Driver-owned. Protected by the `.meeseeks/**` invariant (§6) with no rule of its own. */
export const RUN_MANIFEST = 'run.json';

/** Where a finished run's artifacts are moved when the next one starts. */
export const RUN_ARCHIVE_DIR = 'runs';

/**
 * What belongs to one run, and is therefore destroyed by the next one.
 *
 * Establishing this list was the whole of the work, because the two accounts previously
 * written down were both wrong. `.meeseeks` state is **not** replaced per run — `state.json` is
 * loaded and carried forward, which is how the ratchet survives a run boundary, and
 * `lessons.json`, `red-evidence.json` and `bloopers.log` all persist deliberately. But the
 * briefs do **not** merely accumulate either. Iteration numbering lives in `progress`, which
 * the driver initialises to zero in memory at the top of every run, so a second run writes
 * `briefs/iter-001.md` **over** the first run's. They collide, one file at a time, and the
 * loss is silent because the replacement looks exactly like the original.
 *
 * So this list is short and every entry earned its place:
 *
 * - `run.json` — overwritten wholesale, and it is the only record of what a run *was*.
 * - `briefs/` — collides by number, per above. The archived brief is the only record of what
 *   the builder was actually asked on the iteration a run went wrong.
 * - `reality-check.md` — overwritten, and it is the reasoning behind an `ABORTED`.
 * - `outcome.json` — overwritten wholesale, and it is the only durable record of how a run ended.
 * - `assumptions.json` — **appended**, which is a different fault with a worse consequence.
 *   Nothing is destroyed; instead entries accumulate keyed by `iteration`, and iteration
 *   numbering restarts every run, so a second run's `iteration: 2` lands beside the first's
 *   indistinguishably. That log is handed to the **cold reviewer** (§8.3) so it can check "you
 *   assumed X, the PRD says Y", so the cost is not a confused operator — it is a panel
 *   reasoning about assumptions the current builder never made, against code that may no longer
 *   exist. Observed in dogfood run 3, whose reviewers were given run 2's three assumptions.
 *
 * - `review.json` — the panel's verdicts. Added after an audit of the first `SHIPPED` this
 *   project produced reported that it *"could not verify the unanimous-panel claim at all — the
 *   evidence for it is not in the repo"*. It belongs to one run for the same reason the briefs
 *   do: iteration numbering restarts, so a second run's verdicts would append beside the first's
 *   with no way to tell them apart.
 *
 * Deliberately absent from *this* list: the unit and e2e reports. Those are rewritten every
 * *iteration*, so they are already transient within a run, and archiving the last one would
 * preserve an arbitrary moment while implying it was the run's.
 *
 * **That reasoning held while nothing named an attempt, and no longer does** (REVIEW F22). The
 * receipt's gates now carry an `attempt` and the digests of the report bytes each one read, so
 * there is a way to ask whether the file on disk *is* the sealed one instead of assuming it.
 * {@link archiveSealedReports} archives it only when the digests agree — which is not a softening
 * of the rule above but its enforcement: an unmatched report is still an arbitrary moment, and it
 * is still left behind.
 */
const PER_RUN_ARTIFACTS = [
  RUN_MANIFEST,
  'briefs',
  'reality-check.md',
  ASSUMPTIONS_FILE,
  // **The lifecycle journal** (PLAN item 58). Three shipped statements already said this file was
  // archived — the item's own candidate, the driver comment at the read site, and the sentence
  // `previousRunDiagnosis` prints to the operator — and none of them was true. Nothing resets it,
  // so a second run appended its events beside the first's indistinguishably, and `journalSeq`
  // restarts at zero every run, so one file held two runs' sequences. A forensic record that merges
  // two runs answers the one question it exists for with the wrong run's history.
  JOURNAL_FILE,
  'review.json',
  'outcome.json',
  // The launch receipt (REVIEW F26). Per-run by construction — it records one run's launch
  // observation and pre-loop staging — so a second run would otherwise overwrite the only copy of
  // the first one's provenance, which is the exact failure archiving exists to prevent.
  LAUNCH_RECEIPT_FILE,
  // The captured specification revision (REVIEW F12): per-run by construction, and the record a
  // later reader needs in order to say which document that run was judged against.
  SPECIFICATION_FILE,
  // The held-out oracle store (REVIEW F8). Per-run because its cases are authored from *one* PRD:
  // a store that survived into the next run would let the one gate judged against the
  // specification rather than the implementation execute a previous objective's cases and report a
  // clean pass over nothing.
  ORACLE_FILE,
  // The resolved capability set (REVIEW F13). Per-run, and this is **the escape for a monotonic
  // property**. Within a run the set only grows, so a builder cannot delete `index.html` to remove
  // the gate that judges its UI. Across runs it must be able to shrink, or a project that genuinely
  // stopped being a web UI would carry an unsatisfiable design gate forever — a temporary
  // experiment made permanent, which is exactly what `CLAUDE.md` says to design for *before*
  // enforcing monotonicity. A new run re-resolves from the architect's fresh declaration against
  // the captured specification, and the previous run's manifest is archived rather than lost, so
  // the removal is deliberate, independently made, and leaves durable evidence.
  CAPABILITY_MANIFEST,
  // The acceptance receipt (REVIEW F22). Per-run by construction — it is a claim about one
  // candidate tree — so a second run overwriting it would replace the evidence for the first run's
  // acceptance with evidence for a different one.
  ACCEPTANCE_FILE,
  // The cold-role supply record (PLAN item 77). Per-run by construction — it accumulates one entry
  // per role invocation and nothing resets it — so a second run would otherwise append its
  // invocations beside the first's with no way to tell them apart, which is the fault
  // `assumptions.json` is listed here for.
  SUPPLY_FILE,
];

/** The manifest's own schema version, bumped when a field's meaning changes. */
const MANIFEST_VERSION = 1;

/** Thrown when a run manifest cannot be built or written. */
export class RunManifestError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'RunManifestError';
  }
}

/**
 * @typedef {{
 *   version: number,
 *   startedAt: string,
 *   startCommit: string,
 *   plugin: { name: string, version: string },
 *   configHash: string,
 *   models: Record<string, string>,
 *   effort: Record<string, string>,
 *   toolchain: { name: string, detected: boolean, evidence: string },
 *   capabilities: { declared: string[], detected: string[], resolved: string[] },
 *   tools: Record<string, string>
 * }} RunManifest
 */

/**
 * Stable JSON: object keys sorted at every depth, so two equivalent configurations hash the
 * same however they were written or merged.
 *
 * @param {unknown} value
 * @returns {string}
 */
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(/** @type {Record<string, unknown>} */ (value))
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
}

/**
 * A hash of the effective configuration.
 *
 * Answers "was this the same configuration as that run?" without carrying whatever the config
 * happens to contain by the time someone reads it.
 *
 * @param {unknown} config
 * @returns {string} `sha256:` followed by the hex digest
 */
export function configHash(config) {
  return `sha256:${createHash('sha256').update(canonical(config)).digest('hex')}`;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {string}
 */
function requireNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new RunManifestError(
      `run manifest field ${field} must be a non-empty string; got ${JSON.stringify(value)}. Recording ` +
        '"unknown" would look like evidence, so this is a failure rather than a default.',
    );
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {Record<string, string>}
 */
function requireStringMap(value, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new RunManifestError(`run manifest field ${field} must be an object; got ${JSON.stringify(value)}.`);
  }
  const entries = Object.entries(/** @type {Record<string, unknown>} */ (value)).map(
    /** @returns {[string, string]} */
    ([key, entry]) => [key, requireNonEmptyString(entry, `${field}.${key}`)],
  );
  return Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : 1)));
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {string[]}
 */
function requireStringList(value, field) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new RunManifestError(
      `run manifest field ${field} must be an array of strings; got ${JSON.stringify(value)}.`,
    );
  }
  return [...value];
}

/**
 * Assemble the manifest. Pure: every value is supplied by the caller.
 *
 * @param {{
 *   startedAt: string,
 *   startCommit: string,
 *   pluginName: string,
 *   pluginVersion: string,
 *   config: unknown,
 *   models: Record<string, string>,
 *   effort: Record<string, string>,
 *   toolchain: { name: string, detected: boolean, evidence: string },
 *   capabilities: { declared: string[], detected: string[], capabilities: string[] },
 *   tools: Record<string, string>
 * }} input
 * @returns {RunManifest}
 * @throws {RunManifestError}
 */
export function buildRunManifest(input) {
  const toolchain = input.toolchain;
  if (toolchain === null || typeof toolchain !== 'object' || typeof toolchain.detected !== 'boolean') {
    throw new RunManifestError(
      `run manifest field toolchain must carry a boolean "detected"; got ${JSON.stringify(toolchain)}.`,
    );
  }
  const capabilities = input.capabilities;
  if (capabilities === null || typeof capabilities !== 'object') {
    throw new RunManifestError('run manifest field capabilities must be an object.');
  }

  return {
    version: MANIFEST_VERSION,
    startedAt: requireNonEmptyString(input.startedAt, 'startedAt'),
    startCommit: requireNonEmptyString(input.startCommit, 'startCommit'),
    plugin: {
      name: requireNonEmptyString(input.pluginName, 'pluginName'),
      version: requireNonEmptyString(input.pluginVersion, 'pluginVersion'),
    },
    configHash: configHash(input.config),
    models: requireStringMap(input.models, 'models'),
    effort: requireStringMap(input.effort, 'effort'),
    toolchain: {
      name: requireNonEmptyString(toolchain.name, 'toolchain.name'),
      detected: toolchain.detected,
      evidence: requireNonEmptyString(toolchain.evidence, 'toolchain.evidence'),
    },
    capabilities: {
      declared: requireStringList(capabilities.declared, 'capabilities.declared'),
      detected: requireStringList(capabilities.detected, 'capabilities.detected'),
      resolved: requireStringList(capabilities.capabilities, 'capabilities.capabilities'),
    },
    tools: requireStringMap(input.tools, 'tools'),
  };
}

/**
 * Write `.meeseeks/run.json` atomically.
 *
 * @param {string} meeseeksDir
 * @param {RunManifest} manifest
 * @returns {string} the path written
 * @throws {RunManifestError} when the file cannot be written
 */
export function writeRunManifest(meeseeksDir, manifest) {
  const file = path.join(meeseeksDir, RUN_MANIFEST);
  try {
    mkdirSync(meeseeksDir, { recursive: true });
    const temporary = `${file}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    renameSync(temporary, file);
  } catch (error) {
    throw new RunManifestError(`${file} could not be written: ${/** @type {Error} */ (error).message}`);
  }
  return file;
}

/**
 * The next free archive slot under `.meeseeks/runs/`.
 *
 * Numbered rather than timestamped, for the reason nothing else in this module reads a clock:
 * an integer is derived from what is on disk, needs no argument, and sorts correctly when
 * printed. `001` also survives a machine whose clock moved, which a timestamped directory
 * quietly does not.
 *
 * Existing names that are not three-digit numbers are ignored rather than errored on. An
 * operator who renamed an archive to `runs/the-one-that-shipped` has done something
 * reasonable, and refusing to start a run over it would be this module deciding how somebody
 * organises their own evidence.
 *
 * @param {string} archiveRoot
 * @returns {string} a three-digit slot name
 */
function nextArchiveSlot(archiveRoot) {
  /** @type {string[]} */
  let existing;
  try {
    existing = readdirSync(archiveRoot);
  } catch {
    return '001';
  }
  const used = existing.map((name) => (/^\d{3}$/.test(name) ? Number(name) : 0));
  return String(Math.max(0, ...used) + 1).padStart(3, '0');
}

/**
 * The report files whose bytes the previous run's receipt actually names (REVIEW F22).
 *
 * `results.gates[].reports` and `results.reports` digest report bytes, and the archive excluded
 * those bytes — so an auditor walking the receipt found an edge with nothing to resolve it to. This
 * closes that, and it closes it **conditionally**, which is the whole design.
 *
 * A report on disk at archive time is the *last* iteration's. For a run that shipped, that is the
 * sealed attempt's, and archiving it preserves exactly what the receipt claims. For a run that
 * stalled, it is whatever the last iteration produced, and the receipt may name different bytes —
 * so the digests are compared and a report that does not match is **left behind**. That is the
 * original exclusion's rule, enforced rather than assumed: an unmatched report is an arbitrary
 * moment, and archiving it would imply it was the run's.
 *
 * @param {string} meeseeksDir
 * @returns {string[]} the report filenames worth archiving beside the receipt
 */
export function archiveSealedReports(meeseeksDir) {
  /** @type {unknown} */
  let receipt;
  try {
    receipt = JSON.parse(readFileSync(path.join(meeseeksDir, ACCEPTANCE_FILE), 'utf8'));
  } catch {
    // No receipt, or an unreadable one. There is nothing naming these bytes, so there is nothing to
    // preserve them *as* — the exclusion stands untouched.
    return [];
  }
  const claimed = new Set(
    Array.isArray(/** @type {any} */ (receipt)?.results?.reports) ? /** @type {any} */ (receipt).results.reports : [],
  );
  // A short-circuit, not a rule: an empty claim set matches nothing in the loop below either, so
  // removing this changes no outcome and no test can tell. It is here to skip a directory read on
  // a run that named no reports, and it is labelled so nobody later mistakes it for a guard.
  if (claimed.size === 0) return [];

  /** @type {string[]} */
  const sealed = [];
  for (const name of readdirSync(meeseeksDir)) {
    if (!name.endsWith('.json') && !name.endsWith('.trx')) continue;
    if (PER_RUN_ARTIFACTS.includes(name)) continue;
    /** @type {string} */
    let bytes;
    try {
      bytes = readFileSync(path.join(meeseeksDir, name), 'utf8');
    } catch {
      continue;
    }
    // The same digest the receipt was built with, or the comparison is between two different
    // measurements of the same file and would disagree for a reason that is nobody's fault.
    if (claimed.has(`sha256:${createHash('sha256').update(bytes, 'utf8').digest('hex').slice(0, 32)}`)) {
      sealed.push(name);
    }
  }
  return sealed;
}

/**
 * Move the previous run's artifacts into `.meeseeks/runs/NNN/` before this one starts.
 *
 * **It moves; it never reads.** The no-reader guarantee above is about a manifest's *contents*
 * influencing a run, and `renameSync` does not open the file. Nothing here parses, inspects or
 * branches on anything inside what it archives — which is also why archiving lives in this
 * module rather than beside the driver's other startup work: the property is easier to keep
 * true where the reason for it is written down.
 *
 * Called once, before anything of this run's is written. A missing artifact is skipped rather
 * than invented, so a first run archives nothing and says so by returning null, and a run that
 * died before its design phase leaves only what it managed to produce.
 *
 * Failure to archive **fails the run**, on the same argument §7.1 makes about failing to write
 * a manifest: the alternative is destroying the previous run's evidence and continuing, which
 * is the outcome archiving exists to prevent.
 *
 * @param {string} meeseeksDir
 * @returns {string | null} the archive directory, or null when there was nothing to archive
 * @throws {RunManifestError}
 */
export function archivePreviousRun(meeseeksDir) {
  const present = [
    ...PER_RUN_ARTIFACTS.filter((name) => existsSync(path.join(meeseeksDir, name))),
    ...archiveSealedReports(meeseeksDir),
  ];
  if (present.length === 0) return null;

  const archiveRoot = path.join(meeseeksDir, RUN_ARCHIVE_DIR);
  try {
    mkdirSync(archiveRoot, { recursive: true });
    const target = path.join(archiveRoot, nextArchiveSlot(archiveRoot));
    mkdirSync(target, { recursive: true });
    for (const name of present) renameSync(path.join(meeseeksDir, name), path.join(target, name));
    return target;
  } catch (error) {
    throw new RunManifestError(
      `the previous run's artifacts could not be archived under ${archiveRoot}: ` +
        `${/** @type {Error} */ (error).message}. Refusing to continue, because starting would ` +
        'overwrite them.',
    );
  }
}
