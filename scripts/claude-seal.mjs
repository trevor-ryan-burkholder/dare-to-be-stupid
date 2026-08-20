/**
 * The sealed Claude binary identity (`DESIGN.md` §3.5.1, `PLAN.md` item 83).
 *
 * A version check answers *"is the CLI on PATH compatible?"* once, at preflight. It does not answer
 * the question a four-hour unattended run actually depends on: **is the binary this role is about to
 * spawn the same binary preflight measured?** Those come apart in five ways, and every one of them
 * has happened to somebody:
 *
 * 1. a PATH shadow inserted after preflight, so a later role resolves a different file;
 * 2. an atomic byte replacement that still reports the same version;
 * 3. a symlink retargeted to a different executable;
 * 4. a background auto-update, which the CLI's own documentation says takes effect on the **next
 *    launch** — and a run launches many separate children;
 * 5. a launcher whose own bytes never change while the entrypoint it delegates to does.
 *
 * So the run resolves **one canonical target**, fingerprints it, and every later Driver-owned probe
 * and role executes *that path* rather than performing another PATH lookup — with the fingerprint
 * recomputed immediately before each spawn. A change of any kind refuses before the next child,
 * because a child that can redirect later roles into a different contract has escaped the version
 * policy entirely.
 *
 * ## Identity is install-form-specific, and an unbounded closure is refused
 *
 * A native executable is one artifact and one fingerprint. A **symlink** is a pointer, so the seal
 * binds the resolved target — retargeting it is a change even when the link's own bytes are
 * untouched. A **script** launcher delegates, so the seal must also bind whatever it delegates to;
 * its bytes staying identical while its entrypoint is swapped is failure mode 5.
 *
 * **If that closure cannot be bounded, the install form is refused rather than approximately
 * sealed.** This is the uncomfortable half and it is deliberate: a seal that covers *some* of what
 * gets executed reports the same success as one that covers all of it, and item 83's own wording is
 * that inventing precision would be no better than the absent check.
 *
 * ## Everything here is injected
 *
 * No filesystem call, no clock and no subprocess is reached for directly. That is not testability
 * for its own sake — the failure modes above are *races and swaps*, and a test can only stage them
 * by controlling what each read returns.
 */

import { createHash } from 'node:crypto';
import path from 'node:path';

/** How a resolved target is invoked, which decides what its identity has to cover. */
export const INSTALL_FORMS = ['executable', 'symlink', 'script'];

/** Thrown when a target cannot be sealed, or a seal cannot be verified. */
export class SealError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'SealError';
  }
}

/**
 * @typedef {{
 *   read: (file: string) => Buffer | string,
 *   realpath: (file: string) => string,
 *   resolve: (command: string) => string | null
 * }} SealIo
 */

/**
 * @typedef {{ path: string, realPath: string, form: string, version: string,
 *   closure: { file: string, digest: string }[] }} Seal
 */

/** @param {Buffer | string} bytes @returns {string} */
function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/**
 * The entrypoint a script launcher delegates to, as an absolute path, or `null` when the script
 * delegates to nothing this can bound.
 *
 * **Deliberately narrow.** It recognizes the one shape npm-installed CLIs actually use — a shebang
 * script whose body executes a sibling file by relative path — and returns `null` for anything
 * else. A cleverer parser would be guessing about a shell program, and a wrong guess here seals the
 * wrong file while reporting success. `null` is not a failure at this layer; {@link sealTarget}
 * decides what to do with it, and what it does is refuse.
 *
 * @param {string} script the launcher's contents
 * @param {string} from the launcher's own absolute path, for resolving a relative delegation
 * @returns {string | null}
 */
export function delegatedEntrypoint(script, from) {
  const body = script.split('\n').slice(0, 40).join('\n');
  // `exec node "$basedir/../lib/cli.js"`, `import('../lib/cli.js')`, `require("../lib/cli.js")`,
  // and the bare `node ./cli.mjs` form. One pattern, anchored on the quote characters, because an
  // unquoted path with a space in it is not a shape this can read and must fall through to null.
  const match = body.match(/['"]([^'"\s]*\.(?:js|mjs|cjs))['"]/);
  if (match === null) return null;
  const target = match[1].replace(/^\$\{?basedir\}?\//, '').replace(/^\$basedir\//, '');
  if (target === '') return null;
  return path.isAbsolute(target) ? target : path.resolve(path.dirname(from), target);
}

/**
 * Resolve, classify and fingerprint the canonical target once.
 *
 * @param {string} command the command a PATH lookup would find, normally `claude`
 * @param {string} version what that target reported, measured by the caller under the sealed
 *   controls — passed in rather than probed, because this module runs no subprocess
 * @param {SealIo} io
 * @returns {Seal}
 * @throws {SealError} when the target is missing, or its invocation closure cannot be bounded
 */
export function sealTarget(command, version, io) {
  const resolved = io.resolve(command);
  if (resolved === null || resolved === '') {
    throw new SealError(`${command} is not on PATH, so there is no target to seal`);
  }

  /** @type {string} */
  let realPath;
  try {
    realPath = io.realpath(resolved);
  } catch (error) {
    throw new SealError(`${resolved} cannot be resolved to a real path: ${error instanceof Error ? error.message : error}`);
  }

  /** @type {Buffer | string} */
  let contents;
  try {
    contents = io.read(realPath);
  } catch (error) {
    throw new SealError(`${realPath} cannot be read, so it cannot be fingerprinted: ${error instanceof Error ? error.message : error}`);
  }

  /** @type {{ file: string, digest: string }[]} */
  const closure = [{ file: realPath, digest: digest(contents) }];
  const text = typeof contents === 'string' ? contents : contents.toString('utf8');
  const isScript = text.startsWith('#!');
  const form = isScript ? 'script' : resolved === realPath ? 'executable' : 'symlink';

  if (isScript) {
    const entrypoint = delegatedEntrypoint(text, realPath);
    if (entrypoint === null) {
      // Refused, not approximated. A launcher whose delegation this cannot read is a launcher whose
      // executed code can change while the seal reports success — which is the whole failure this
      // module exists to catch, arriving through the one door left open.
      throw new SealError(
        `${realPath} is a script launcher whose delegated entrypoint could not be identified, so its invocation ` +
          'closure cannot be bounded. The compatibility policy refuses this install form rather than recording an ' +
          'approximate seal; install the native executable, or point the run at the delegated file directly.',
      );
    }
    /** @type {Buffer | string} */
    let delegated;
    try {
      delegated = io.read(entrypoint);
    } catch (error) {
      throw new SealError(
        `${realPath} delegates to ${entrypoint}, which cannot be read: ${error instanceof Error ? error.message : error}`,
      );
    }
    closure.push({ file: entrypoint, digest: digest(delegated) });
  }

  return { path: resolved, realPath, form, version, closure };
}

/**
 * Re-measure a sealed target and say whether it is still the same thing.
 *
 * Called immediately before **every** role spawn, not once. The window this closes is the interval
 * between two children, and there is one of those after every iteration.
 *
 * @param {Seal} seal
 * @param {string} version what the target reports now
 * @param {SealIo} io
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function verifySeal(seal, version, io) {
  // Re-resolved rather than reused. A PATH shadow inserted after sealing changes what `claude`
  // means, and a check that skipped straight to the sealed path would never see it — which is
  // precisely the state an attacker wants: the seal intact and a different binary being run.
  /** @type {string | null} */
  let resolved;
  try {
    resolved = io.resolve('claude');
  } catch (error) {
    return { ok: false, reason: `claude could not be resolved: ${error instanceof Error ? error.message : error}` };
  }
  if (resolved === null || resolved === '') return { ok: false, reason: 'claude is no longer on PATH' };
  if (resolved !== seal.path) {
    return { ok: false, reason: `claude now resolves to ${resolved}, not the sealed ${seal.path}` };
  }

  /** @type {string} */
  let realPath;
  try {
    realPath = io.realpath(resolved);
  } catch (error) {
    return { ok: false, reason: `${resolved} cannot be resolved to a real path: ${error instanceof Error ? error.message : error}` };
  }
  if (realPath !== seal.realPath) {
    return { ok: false, reason: `${resolved} now points at ${realPath}, not the sealed ${seal.realPath}` };
  }

  if (version !== seal.version) {
    return { ok: false, reason: `the sealed target now reports ${version}, not ${seal.version}` };
  }

  // Every file in the closure, in the order it was sealed. A launcher whose own bytes are identical
  // while its entrypoint changed is failure mode 5, and checking only the first entry misses it.
  for (const entry of seal.closure) {
    /** @type {Buffer | string} */
    let contents;
    try {
      contents = io.read(entry.file);
    } catch (error) {
      return { ok: false, reason: `${entry.file} can no longer be read: ${error instanceof Error ? error.message : error}` };
    }
    const now = digest(contents);
    if (now !== entry.digest) {
      return {
        ok: false,
        reason: `${entry.file} has different contents than when it was sealed (${entry.digest} became ${now}), so a ` +
          'byte replacement reporting the same version has happened',
      };
    }
  }

  return { ok: true };
}

/**
 * The environment controls every Driver-owned Claude invocation carries.
 *
 * Item 83 cannot close until background auto-update is suppressed and live-proven, and the reason
 * is mechanical rather than cautious: the CLI documents that an update takes effect on the **next
 * launch**, and a run launches a child per role per iteration. Without this, a run that passed
 * preflight at one version can spend its second half on another, and {@link verifySeal} would
 * correctly refuse — turning a silent contract change into a hard stop mid-run. Suppressing the
 * update is what makes the seal a guarantee rather than an alarm.
 *
 * **The operator cannot override these**, which is stated here because it is the one place somebody
 * would reasonably try: a run whose binary changes underneath it is not a preference.
 *
 * @returns {Record<string, string>}
 */
export function sealedControls() {
  return {
    DISABLE_AUTOUPDATER: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  };
}
