/**
 * Deriving a deploy command from a declared target (DESIGN.md §10.2).
 *
 * The argv is the whole feature: an operator who supplies a host instead of a command is trusting
 * this file to write the one they would have written. Every case here is a way that goes wrong
 * silently — a deploy that reports success and serves the wrong thing.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEPLOY_TARGET_KINDS,
  DeployTargetError,
  VERIFIED_DEPLOY_TARGETS,
  deployCommandFor,
} from '../scripts/deploy-target.mjs';

/** @param {Partial<import('../scripts/deploy-target.mjs').DeployTarget>} [over] */
const target = (over = {}) => ({
  kind: 'ssh-static',
  host: '203.0.113.10',
  user: 'root',
  dir: 'dist',
  path: '/var/www/preview',
  ...over,
});

describe('deployCommandFor', () => {
  it('copies the contents of the build directory, not the directory itself', () => {
    // **The trailing slash is the contract.** `rsync dist/ host:/path/` puts the contents in
    // `path`; `rsync dist host:/path/` creates `path/dist`. The second is almost never meant, and
    // its symptom is a smoke check 404 against a deploy that reported success.
    const argv = deployCommandFor(target());
    assert.equal(argv.includes('dist/'), true, argv.join(' '));
    assert.equal(argv.includes('dist'), false, argv.join(' '));
    assert.equal(argv.includes('root@203.0.113.10:/var/www/preview/'), true, argv.join(' '));
  });

  it('does not double a slash the operator already wrote', () => {
    // `dist/` and `/var/www/preview/` are both natural things to type, and `dist//` is not a path
    // rsync treats the same way.
    const argv = deployCommandFor(target({ dir: 'dist/', path: '/var/www/preview/' }));
    assert.equal(argv.includes('dist/'), true, argv.join(' '));
    assert.equal(argv.includes('root@203.0.113.10:/var/www/preview/'), true, argv.join(' '));
    assert.equal(argv.some((part) => part.includes('//')), false, argv.join(' '));
  });

  it('runs ssh in batch mode, because an unattended run cannot answer a prompt', () => {
    // A passphrase or host-key question is indistinguishable from a hung deploy — `runDeploy`'s own
    // timeout message says exactly that. Failing at once is the difference between a named error
    // and ten minutes burned against the ceiling.
    const argv = deployCommandFor(target());
    const dash = argv.indexOf('-e');
    assert.notEqual(dash, -1, argv.join(' '));
    assert.match(argv[dash + 1], /BatchMode=yes/);
  });

  it('mirrors rather than accumulates, so a removed file stops being served', () => {
    // Without `--delete` a file the build stopped emitting stays on the host, and the smoke checks
    // pass against a page nothing in the candidate produced.
    assert.equal(deployCommandFor(target()).includes('--delete'), true);
  });

  it('honours a user other than root', () => {
    const argv = deployCommandFor(target({ user: 'deploy' }));
    assert.equal(argv.includes('deploy@203.0.113.10:/var/www/preview/'), true, argv.join(' '));
  });

  it('refuses a kind it has no argv for, and names the ones it has', () => {
    // Refused rather than approximated: a typo is otherwise indistinguishable from a profile that
    // does not exist, which is the reasoning `resolveToolchain` already uses for toolchain names.
    assert.throws(
      () => deployCommandFor(target({ kind: 'ssh-statik' })),
      (error) => error instanceof DeployTargetError && /not one this build knows/.test(error.message) && /ssh-static/.test(error.message),
    );
  });

  it('claims a profile verified only where a real host proved it', () => {
    // **This case used to assert the list was empty, and it was written to fail exactly when it
    // did.** `ssh-static` was unit-tested and unproven; on 20 August 2026 the derived argv ran
    // against a real droplet, exited 0, and the host answered 200 on `/` and `/health` with the
    // bytes that had been pushed. It graduated in that commit and not before.
    //
    // What is held now is the invariant rather than the membership: every verified kind must be one
    // this build can actually emit, so a name cannot be marked proven and then quietly renamed or
    // dropped from the argv table while the claim survives.
    assert.deepEqual(VERIFIED_DEPLOY_TARGETS, ['ssh-static']);
    for (const kind of VERIFIED_DEPLOY_TARGETS) {
      assert.equal(DEPLOY_TARGET_KINDS.includes(kind), true, `${kind} is verified but this build has no argv for it`);
    }
  });
});
