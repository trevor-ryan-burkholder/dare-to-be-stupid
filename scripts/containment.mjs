/**
 * Prove the sandbox **confines**, rather than that its settings were accepted.
 *
 * `DESIGN.md` §3.5 and PLAN item 84. Print mode silently ignores settings that fail validation, so
 * acceptance has never been evidence; and measurement on 20 August 2026 showed the gap is wider
 * than that. On a host with bubblewrap and socat installed, `failIfUnavailable` is satisfied — it
 * checks that the *dependencies exist*, not that the sandbox *started* — while a kernel that
 * refuses `unshare(CLONE_NEWUSER)` leaves the command running unsandboxed. A child observed itself
 * doing exactly that and said so: *"the sandboxed run failed first with `apply-seccomp:
 * unshare(CLONE_NEWUSER): Invalid argument`; I disabled the sandbox to get this real result."*
 *
 * That is R19's recorded failure mode — an agent on a kernel where bubblewrap failed rerunning
 * unsandboxed — reproduced. A settings key cannot close it, because the settings were honoured;
 * the sandbox simply did not work. Only an observation can.
 *
 * So the run performs one positive control before it trusts a sandbox: it writes two canary files,
 * denies reading one of them, and asks a real child to read both.
 *
 * **The control is the load-bearing half.** A probe that only checked the denied file would pass
 * whenever the child declined to try — a model saying "I won't do that" is indistinguishable from a
 * kernel saying "you may not", and the safer-looking answer is the wrong one. Requiring the
 * *allowed* file to come back proves the child really attempted a read and that reads work at all.
 * Anything else is inconclusive, and inconclusive refuses.
 */

import { randomBytes } from 'node:crypto';

/** How the probe's two files are told apart in the child's reply. */
export const CANARY_PREFIX = 'MEESEEKS-CANARY';

/**
 * A fresh pair of sentinels.
 *
 * Random per run, never a constant: a fixed string would appear in this repository's own source and
 * in every transcript, so a child that had merely *seen* it could satisfy the probe without reading
 * anything. These are secrets in the only sense that matters here — knowing one is the evidence.
 *
 * @returns {{ denied: string, allowed: string }}
 */
export function canarySentinels() {
  return {
    denied: `${CANARY_PREFIX}-DENIED-${randomBytes(8).toString('hex')}`,
    allowed: `${CANARY_PREFIX}-ALLOWED-${randomBytes(8).toString('hex')}`,
  };
}

/**
 * The settings a containment probe child runs under.
 *
 * `filesystem.denyRead` is measured to work on this platform: the denied path is reported as
 * *No such file or directory* rather than as a permission error, so the sandbox masks existence
 * rather than disclosing it. The name and nesting were read out of the CLI binary rather than
 * guessed, the same way the `sandbox` key itself was.
 *
 * @param {{ hooks: unknown, deniedDir: string }} options
 * @returns {Record<string, unknown>}
 */
export function containmentProbeSettings({ hooks, deniedDir }) {
  return {
    hooks,
    sandbox: {
      enabled: true,
      failIfUnavailable: true,
      allowUnsandboxedCommands: false,
      filesystem: { denyRead: [deniedDir] },
    },
  };
}

/**
 * Judge what the child came back with.
 *
 * Three outcomes, and only one of them lets a run proceed. Separated from the spawn so the decision
 * is testable without a child: the spawn is the part that cannot be unit-tested, and the judgment is
 * the part that must never be wrong.
 *
 * @param {{ text: string, ok: boolean }} result the child's envelope
 * @param {{ denied: string, allowed: string }} sentinels
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function containmentVerdict(result, sentinels) {
  if (!result.ok) {
    return { ok: false, reason: 'the containment probe child did not return a usable answer' };
  }
  // Checked first, because it is the one that means "the sandbox is not confining this run" rather
  // than "the probe could not tell". A leak is never inconclusive.
  if (result.text.includes(sentinels.denied)) {
    return {
      ok: false,
      reason:
        'a child read a file the sandbox was told to deny, so the declared sandbox is not confining ' +
        'this run. Settings were accepted and enforcement did not happen — on some kernels bubblewrap ' +
        'fails at startup and commands run unsandboxed regardless',
    };
  }
  if (!result.text.includes(sentinels.allowed)) {
    return {
      ok: false,
      reason:
        'the containment probe is inconclusive: the child did not return the file it was allowed to ' +
        'read, so nothing here shows it attempted a read at all. A probe that cannot tell a refusal ' +
        'from a kernel denial has not established containment',
    };
  }
  return { ok: true };
}
