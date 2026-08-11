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
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Driver-owned. Protected by the `.dare/**` invariant (§6) with no rule of its own. */
export const RUN_MANIFEST = 'run.json';

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
