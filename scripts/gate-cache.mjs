/**
 * Gate-skip on an unchanged workspace (DESIGN.md §4, BORROWED.md R35, PLAN.md item 43).
 *
 * A stuck builder re-pays for the same failing gates every iteration: it changes nothing the
 * gate cares about, the deterministic gate fails again identically, and the run has spent minutes
 * and tokens to re-learn a fact it already knew. This module attacks that thrash class with a
 * single, deliberately narrow optimisation: **when a deterministic gate failed last iteration and
 * the first-party source tree is byte-identical since that failure, do not re-run the gate. Carry
 * the previous failure forward and increment an attempt counter instead.**
 *
 * It is an optimisation over *deterministic* gates, and every line of it is biased toward
 * re-running rather than skipping, because a skipped gate that should have run is a silent pass —
 * the one thing `CLAUDE.md`'s "nothing defaults to pass" forbids. The safety argument is exactly
 * one sentence: a matching workspace hash means the builder changed no git-visible file, so a
 * deterministic function of those files produces the identical result, so the gate still fails.
 * The moment that premise is uncertain — the hash cannot be computed, git errors, there is no
 * recorded prior failure, or the gate's inputs are not bounded by the source tree — the gate runs.
 *
 * One input the eligible gates read is deliberately outside the hash: `node_modules` is gitignored,
 * so a dependency change that never touches a tracked file leaves the hash unchanged. This is a
 * liveness gap, not a safety one — the cache carries **only failures**, so the worst it can do is
 * keep a run red that a fresh `npm ci` might have turned green, never the reverse. A silent pass is
 * impossible in this direction; a lingering-failure is the accepted cost of a bounded, cheap hash.
 *
 * Four rules make the bias real, and each has a test:
 *
 * 1. **Only a prior FAILURE is ever carried.** The cache stores failures only; a passing gate has
 *    no entry, so it is always re-run. Skipping a pass could hide a regression, and pass-carrying
 *    is the panel/ratchet's job, not this cache's.
 * 2. **Uncertainty re-runs.** A null hash (git failed, a file could not be read) or a missing prior
 *    entry means the gate runs. Nothing is skipped on a guess.
 * 3. **Never skip on an iteration that could ship.** Guaranteed structurally: a carried failure is
 *    emitted as a failed result, so any iteration with a skip is red, so it is not a ship
 *    candidate. A ship candidate has every gate freshly green because a skip forces red.
 * 4. **The eligible set is a small allow-list, not a deny-list.** A gate not named in
 *    {@link SKIPPABLE_GATES} always runs. Adding a new gate therefore defaults to re-running, the
 *    safe direction, the same way the capability table defaults to universal.
 *
 * No runtime dependencies: `node:crypto` for the content hash, `node:fs`/`node:path`, and the same
 * injected `git` seam `changedSince` already uses.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';

import { READ_LIMITS, hashFileStreaming, measure, readBounded } from './bounded-read.mjs';
import path from 'node:path';

/** The driver-owned cache file, under `.meeseeks/` and therefore positionally guarded (§6). */
export const GATE_SKIP_FILE = 'gate-skip.json';

/** The schema version of {@link GATE_SKIP_FILE}. A mismatch is treated as no cache — re-run. */
const CACHE_VERSION = 1;

/**
 * Gates whose result is a pure, self-contained function of the first-party source tree, so a
 * byte-identical tree provably reproduces the same verdict.
 *
 * This is an **allow-list on purpose**: a gate not named here always re-runs, which is the safe
 * direction. The notable exclusions, and why each one is out:
 *
 * - **`security-audit`** reads a remote advisory database whose contents change over time
 *   independent of the workspace. Its inputs are not bounded by the source tree, so a matching
 *   hash is not proof its result is unchanged — R35's "a gate whose inputs can't be bounded →
 *   re-run".
 * - **`unit`** and **`e2e`** produce the test reports the ratchet and red-evidence read back as
 *   decisions. Skipping them would leave stale evidence on disk for other phases to consume; a
 *   fresh run each iteration keeps that evidence current. The token cost of re-running is the
 *   price of never handing the ratchet a report this iteration did not produce.
 * - **`mutation`** already has its own change-detector (`changedSince`) and runs in the
 *   conditional second pass, not the first-pass command list this cache wraps.
 * - **operator/overlay gates** (e.g. `operator:release-check`) shell out to arbitrary commands
 *   whose inputs cannot be bounded, so they are never eligible.
 *
 * `build`, `lint` and `types` are left: each reads source and answers pass/fail, and nothing
 * downstream consumes anything but that answer.
 *
 * @type {ReadonlySet<string>}
 */
export const SKIPPABLE_GATES = new Set(['build', 'lint', 'types']);

/**
 * @typedef {{ workspaceHash: string | null, detail: string, status: number, attempts: number }} GateFailureRecord
 *   A single carried failure. `workspaceHash` is the tree hash at the run that produced it — `null`
 *   when the hash was uncomputable, which can never match a later hash and so never allows a skip.
 *   `attempts` counts how many iterations this exact failure has been observed on this hash.
 */

/**
 * @typedef {{ version: number, gates: Record<string, GateFailureRecord> }} GateCache
 */

/**
 * A content hash of the first-party source tree, from git's own view of the working tree.
 *
 * "First-party" is git's answer, not ours: tracked files plus untracked-but-not-ignored files —
 * exactly the pair `changedSince` uses, so `node_modules`, build output and the volatile
 * `.meeseeks/` machine state are excluded because git ignores them. The hash folds each file's
 * path and current on-disk content into one sha256, so it changes iff a builder changed a
 * git-visible file. Reading a file's bytes, rather than trusting a mtime, is what makes the
 * "byte-identical" claim literal.
 *
 * **Returns `null` on any uncertainty** — a failed `git ls-files`, a path that cannot be read —
 * because a hash that cannot be computed is not evidence the tree is unchanged, and the caller
 * must then re-run every gate. This is the fail-safe direction and the whole reason the return is
 * nullable rather than throwing an empty string that could accidentally match.
 *
 * The `run` seam is the same git double `changedSince` uses; only `ok` and `stdout` are read, so
 * the driver's full `shell` and any lighter test double both satisfy it.
 *
 * @param {{ cwd: string, run: (command: string, args: string[], options: { cwd: string }) =>
 *   { ok: boolean, stdout: string } | Promise<{ ok: boolean, stdout: string }> }} options
 * @returns {Promise<string | null>} `sha256:<hex>` or `null` when the tree cannot be hashed
 */
export async function workspaceHash(options) {
  const { cwd, run } = options;
  /** @param {{ ok: boolean, stdout: string }} result */
  const paths = (result) =>
    result.ok
      ? result.stdout
          .split('\0')
          // No `.trim()`: `-z` gives NUL-delimited paths, so a path with legitimate leading or
          // trailing whitespace must survive intact. The empty trailing segment is dropped below.
          .filter((entry) => entry !== '')
      : null;

  const tracked = paths(await run('git', ['ls-files', '-z'], { cwd }));
  // A failed listing is uncertainty, not an empty tree. Degrading to "no files" here would let a
  // git failure read as "nothing changed" and skip every gate — the exact silent pass this guards.
  if (tracked === null) return null;
  const untracked = paths(await run('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd }));
  if (untracked === null) return null;

  const unique = [...new Set([...tracked, ...untracked])].sort();
  const master = createHash('sha256');
  for (const relative of unique) {
    const absolute = path.join(cwd, relative);
    // **Streamed, not buffered** (REVIEW F19). This used to read every tracked file whole, so a
    // repository holding one large blob copied it into memory purely to hash it — and workspace
    // identity is computed on the decision path, every iteration. Streaming costs a 64KB buffer
    // per file regardless of its size, and there is no reason to bound hashing: refusing to hash a
    // large file would make the gate cache and the F14 verdict seal unavailable on a repository
    // that is merely big, which is a worse failure than the one being fixed.
    const size = measure(absolute);
    const perFile = await hashFileStreaming(absolute);
    if (perFile === null || size === null) {
      // A file git named but node cannot read — a symlink to nowhere, a submodule directory, a
      // file deleted in the microsecond since `ls-files`. The tree is not one we can hash, so the
      // whole hash is void and every gate re-runs.
      return null;
    }
    // Path and length framed so that renaming a file, or a file boundary shifting, cannot collide
    // with a different tree.
    master.update(relative, 'utf8');
    master.update('\0');
    master.update(String(size));
    master.update('\0');
    master.update(perFile);
    master.update('\n');
  }
  return `sha256:${master.digest('hex')}`;
}

/**
 * Read `.meeseeks/gate-skip.json`.
 *
 * A missing, unreadable, unparseable, wrong-version or malformed file all degrade to an **empty**
 * cache. That is the safe direction here and the inverse of the ratchet's: forgetting a prior
 * failure only ever causes a gate to *re-run*, never to be wrongly skipped. So unlike `state.json`
 * this does not throw — losing the cache costs one gate run, not a silent pass.
 *
 * @param {string} meeseeksDir the `.meeseeks` directory
 * @returns {GateCache}
 */
export function loadGateCache(meeseeksDir) {
  const empty = { version: CACHE_VERSION, gates: {} };
  const file = path.join(meeseeksDir, GATE_SKIP_FILE);
  if (!existsSync(file)) return empty;
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(readBounded(file, READ_LIMITS.record));
  } catch {
    return empty;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return empty;
  const record = /** @type {Record<string, unknown>} */ (parsed);
  if (record.version !== CACHE_VERSION) return empty;
  if (record.gates === null || typeof record.gates !== 'object' || Array.isArray(record.gates)) return empty;
  /** @type {Record<string, GateFailureRecord>} */
  const gates = {};
  for (const [name, value] of Object.entries(/** @type {Record<string, unknown>} */ (record.gates))) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) continue;
    const entry = /** @type {Record<string, unknown>} */ (value);
    const hashOk = entry.workspaceHash === null || typeof entry.workspaceHash === 'string';
    const detailOk = typeof entry.detail === 'string';
    const statusOk = typeof entry.status === 'number' && Number.isInteger(entry.status);
    const attemptsOk = typeof entry.attempts === 'number' && Number.isInteger(entry.attempts) && entry.attempts >= 0;
    // A single malformed entry is dropped, not the whole cache: a dropped entry re-runs its gate,
    // the safe direction, and keeping the rest preserves the other gates' carries.
    if (!hashOk || !detailOk || !statusOk || !attemptsOk) continue;
    gates[name] = {
      workspaceHash: /** @type {string | null} */ (entry.workspaceHash),
      detail: /** @type {string} */ (entry.detail),
      status: /** @type {number} */ (entry.status),
      attempts: /** @type {number} */ (entry.attempts),
    };
  }
  return { version: CACHE_VERSION, gates };
}

/**
 * Write `.meeseeks/gate-skip.json` atomically, so a kill mid-write cannot corrupt it.
 *
 * @param {string} meeseeksDir the `.meeseeks` directory
 * @param {GateCache} cache
 * @returns {string} the path written
 */
export function saveGateCache(meeseeksDir, cache) {
  mkdirSync(meeseeksDir, { recursive: true });
  const file = path.join(meeseeksDir, GATE_SKIP_FILE);
  const temporary = `${file}.tmp`;
  const payload = { version: CACHE_VERSION, gates: cache.gates };
  writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  renameSync(temporary, file);
  return file;
}

/**
 * @typedef {{ name: string, command: string[], required: boolean }} PlannableGate
 */

/**
 * @typedef {{ name: string, detail: string, status: number, attempts: number }} SkippedGate
 *   A gate whose previous failure is being carried forward. `attempts` is already incremented for
 *   this iteration.
 */

/**
 * Split the gate list into the ones to run and the ones to carry (skip).
 *
 * A gate is carried iff **all** hold: it is in {@link SKIPPABLE_GATES}; the current hash is known
 * (non-null); there is a recorded prior failure for it; that record's hash is known; and the two
 * hashes are equal. Any failure of any clause runs the gate. This is a pure function so the whole
 * skip decision is testable without a filesystem.
 *
 * @param {{ gates: PlannableGate[], cache: GateCache, currentHash: string | null }} options
 * @returns {{ toRun: PlannableGate[], skipped: SkippedGate[] }}
 */
export function planGateRun(options) {
  const { gates, cache, currentHash } = options;
  /** @type {PlannableGate[]} */
  const toRun = [];
  /** @type {SkippedGate[]} */
  const skipped = [];
  for (const gate of gates) {
    const entry = cache.gates[gate.name];
    const canSkip =
      SKIPPABLE_GATES.has(gate.name) &&
      currentHash !== null &&
      entry !== undefined &&
      entry.workspaceHash !== null &&
      entry.workspaceHash === currentHash;
    if (canSkip) {
      skipped.push({ name: gate.name, detail: entry.detail, status: entry.status, attempts: entry.attempts + 1 });
    } else {
      toRun.push(gate);
    }
  }
  return { toRun, skipped };
}

/**
 * The cache after an iteration: failures recorded, passes cleared, carries incremented.
 *
 * Pure, so the whole update rule is testable without a filesystem. It records failures **only for
 * skippable gates** — a non-skippable failing gate is never carried, so storing it would be dead
 * weight — and it deletes any entry whose gate passed, which is how "never skip a pass" is kept:
 * a passing gate leaves no record to carry next time.
 *
 * @param {{ cache: GateCache, currentHash: string | null,
 *   ranResults: { name: string, ok: boolean, status: number, detail?: string }[],
 *   skipped: SkippedGate[] }} options
 * @returns {GateCache}
 */
export function updateGateCache(options) {
  const { cache, currentHash, ranResults, skipped } = options;
  /** @type {Record<string, GateFailureRecord>} */
  const gates = { ...cache.gates };
  // Carried gates keep their hash/detail/status; only the attempt count moves, and it was already
  // incremented by planGateRun so the stored count matches what the operator was shown.
  for (const skip of skipped) {
    const prior = cache.gates[skip.name];
    if (prior === undefined) continue;
    gates[skip.name] = { ...prior, attempts: skip.attempts };
  }
  for (const result of ranResults) {
    if (result.ok) {
      // A pass clears the record. This is load-bearing: it is why a gate that passed can never be
      // carried on a later iteration, because there is nothing left to carry.
      delete gates[result.name];
      continue;
    }
    if (!SKIPPABLE_GATES.has(result.name)) continue;
    const prior = cache.gates[result.name];
    gates[result.name] = {
      workspaceHash: currentHash,
      detail: result.detail ?? '',
      status: result.status,
      attempts: (prior?.attempts ?? 0) + 1,
    };
  }
  return { version: CACHE_VERSION, gates };
}
