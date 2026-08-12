/**
 * `.dare/run.json` — what this run was, written once at the start (DESIGN.md §7.1).
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
 * `.dare/config.json` holds only models, counts and booleans, so embedding it would be
 * harmless; hashing it stays harmless after someone adds a field that is not. The hash still
 * answers the question worth asking — "was this the same configuration as that run?"
 *
 * **Nothing is inferred.** Every value is passed in. No clock is read here and no command is
 * run here, and a missing field throws rather than defaulting, because a manifest that quietly
 * says `"unknown"` is worse than no manifest: it looks like evidence.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { ASSUMPTIONS_FILE } from './assumptions.mjs';

/** Driver-owned. Protected by the `.dare/**` invariant (§6) with no rule of its own. */
export const RUN_MANIFEST = 'run.json';

/** Where a finished run's artifacts are moved when the next one starts. */
export const RUN_ARCHIVE_DIR = 'runs';

/**
 * What belongs to one run, and is therefore destroyed by the next one.
 *
 * Establishing this list was the whole of the work, because the two accounts previously
 * written down were both wrong. `.dare` state is **not** replaced per run — `state.json` is
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
 * Deliberately absent: the unit and e2e reports. Those are rewritten every *iteration*, so
 * they are already transient within a run, and archiving the last one would preserve an
 * arbitrary moment while implying it was the run's.
 */
const PER_RUN_ARTIFACTS = [RUN_MANIFEST, 'briefs', 'reality-check.md', ASSUMPTIONS_FILE, 'review.json'];

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
 * Write `.dare/run.json` atomically.
 *
 * @param {string} dareDir
 * @param {RunManifest} manifest
 * @returns {string} the path written
 * @throws {RunManifestError} when the file cannot be written
 */
export function writeRunManifest(dareDir, manifest) {
  const file = path.join(dareDir, RUN_MANIFEST);
  try {
    mkdirSync(dareDir, { recursive: true });
    const temporary = `${file}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    renameSync(temporary, file);
  } catch (error) {
    throw new RunManifestError(`${file} could not be written: ${/** @type {Error} */ (error).message}`);
  }
  return file;
}

/**
 * The next free archive slot under `.dare/runs/`.
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
 * Move the previous run's artifacts into `.dare/runs/NNN/` before this one starts.
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
 * @param {string} dareDir
 * @returns {string | null} the archive directory, or null when there was nothing to archive
 * @throws {RunManifestError}
 */
export function archivePreviousRun(dareDir) {
  const present = PER_RUN_ARTIFACTS.filter((name) => existsSync(path.join(dareDir, name)));
  if (present.length === 0) return null;

  const archiveRoot = path.join(dareDir, RUN_ARCHIVE_DIR);
  try {
    mkdirSync(archiveRoot, { recursive: true });
    const target = path.join(archiveRoot, nextArchiveSlot(archiveRoot));
    mkdirSync(target, { recursive: true });
    for (const name of present) renameSync(path.join(dareDir, name), path.join(target, name));
    return target;
  } catch (error) {
    throw new RunManifestError(
      `the previous run's artifacts could not be archived under ${archiveRoot}: ` +
        `${/** @type {Error} */ (error).message}. Refusing to continue, because starting would ` +
        'overwrite them.',
    );
  }
}
