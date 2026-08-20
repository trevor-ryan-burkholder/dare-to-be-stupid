/**
 * Derive a deploy command from a declared target, so an operator supplies a host rather than argv.
 *
 * `deploy.command` asks the operator to write the whole invocation — `["rsync", "-az", "--delete",
 * "-e", "ssh -o BatchMode=yes", "dist/", "root@1.2.3.4:/var/www/preview/"]` — and every part of that
 * is a place to get it subtly wrong. The trailing slashes alone change what rsync copies, and a
 * missing `BatchMode` turns a passphrase prompt into a run that hangs until its timeout kills it.
 *
 * **A named profile is not a guess.** `templates/toolchain-prose.md` declined to invent `vale`'s
 * argv because "an unverified command is worse than a declared gap", and the same rule binds here:
 * a profile is admitted only once it has been run against a real host, and an unknown `kind` is
 * refused by name rather than falling back to something plausible. A typo is otherwise
 * indistinguishable from no profile at all — the reasoning `resolveToolchain` already uses.
 *
 * **Nothing here ever holds a credential**, and that is the property that keeps this out of PLAN
 * item 106's territory. `ssh` authenticates using the operator's own key and agent, exactly as it
 * would if they had typed the command; no secret enters a role's environment, argv, prompt or
 * receipts, and no capability is minted for anyone. The Driver runs a command; it is not granted
 * access to anything.
 */

/** A `kind` this build has an argv for. Unknown kinds are refused rather than approximated. */
export const DEPLOY_TARGET_KINDS = ['ssh-static'];

/**
 * Profiles that have been proven against a real host, and therefore may be relied upon.
 *
 * A profile graduates here in the same commit as the run that proves it, never on an argument that
 * the command looks right — the same rule that moves the compatibility ceiling.
 *
 * **`ssh-static`, 20 August 2026.** Run against a real DigitalOcean droplet (Ubuntu 22.04.5) already
 * serving `/srv/preview/site`: the derived argv exited 0, and the host then answered **200** on `/`
 * and on `/health` with exactly the bytes that had been pushed. The command executed was the one
 * {@link deployCommandFor} produces rather than a hand-written equivalent, because a profile proved
 * by a different command than it emits is not proved at all.
 *
 * @type {string[]}
 */
export const VERIFIED_DEPLOY_TARGETS = ['ssh-static'];

/** A target this build cannot turn into a command. */
export class DeployTargetError extends Error {}

/**
 * @typedef {{ kind: string, host: string, user: string, dir: string, path: string }} DeployTarget
 */

/**
 * The argv a declared target becomes.
 *
 * @param {DeployTarget} target
 * @returns {string[]}
 * @throws {DeployTargetError} for a kind this build has no argv for
 */
export function deployCommandFor(target) {
  if (!DEPLOY_TARGET_KINDS.includes(target.kind)) {
    throw new DeployTargetError(
      `deploy.target.kind ${JSON.stringify(target.kind)} is not one this build knows. ` +
        `Known kinds: ${DEPLOY_TARGET_KINDS.join(', ')}. A kind is refused rather than guessed at, because a ` +
        'typo would otherwise be indistinguishable from a profile that does not exist.',
    );
  }

  // **The trailing slashes are the contract, not formatting.** `rsync dist/ remote:/path/` copies
  // the *contents* of `dist` into `path`; `rsync dist remote:/path/` copies the directory itself and
  // yields `/path/dist`. The second is almost never what an operator meant, and the symptom is a
  // smoke check 404 with a deploy that reported success.
  const source = `${trimSlash(target.dir)}/`;
  const destination = `${target.user}@${target.host}:${trimSlash(target.path)}/`;

  return [
    'rsync',
    '-az',
    // The preview host mirrors the build output. Without this a file the build stopped emitting
    // stays served, and the smoke checks pass against a page nothing in the candidate produced.
    '--delete',
    '-e',
    // **`BatchMode=yes` is load-bearing.** An unattended run cannot answer a passphrase or a
    // host-key question, and `runDeploy` already says so in its own timeout message: those prompts
    // look exactly like a hung deploy. Failing immediately is the difference between a named error
    // and ten wasted minutes.
    'ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new',
    source,
    destination,
  ];
}

/** @param {string} value @returns {string} */
function trimSlash(value) {
  return value.replace(/\/+$/, '');
}
