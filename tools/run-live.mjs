#!/usr/bin/env node
/**
 * Run the live tier against the `claude` the **driver** would spawn.
 *
 * `npm run` prepends every ancestor `node_modules/.bin` to `PATH`. On 13 August 2026 that was
 * found to mean `npm run test:live` was exercising `~/dev/node_modules/.bin/claude` — Claude Code
 * **2.1.136**, a stale copy installed as a dependency two directories above this repository —
 * while `scripts/driver.mjs` spawns whatever `claude` the operator's shell resolves, here
 * **2.1.228**. Ninety-two patch versions apart, and the older one rejects `--safe-mode`.
 *
 * So the tier whose entire justification is *"anything whose contract is owned by a different
 * binary needs one live check"* was checking a different binary than the product runs. Every
 * green result it reported described software nobody executes.
 *
 * This strips the injected entries and hands the rest through. It is a **node** wrapper rather
 * than a shell pipeline in `package.json` because contributors are on WSL, macOS and Windows
 * (`CLAUDE.md` hard constraint 4), and `tr`/`grep` are not a portable way to edit a PATH.
 *
 * It repairs the resolution; it does not hide the problem. `test/live/binary-identity.live.test.mjs`
 * still asserts the identity and still fails loudly if a shadow survives — because a harness that
 * quietly corrects itself teaches nobody, and the next person to add a flag would rediscover this
 * from scratch.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const separator = path.delimiter;

/** Entries npm injected, which the operator's shell would never have. */
const injected = (entry) => entry.split(/[\\/]/).includes('node_modules');

const cleaned = (process.env.PATH ?? '')
  .split(separator)
  .filter((entry) => entry !== '' && !injected(entry))
  .join(separator);

const child = spawn(
  process.execPath,
  ['--test', '--test-concurrency=1', 'test/live/*.test.mjs'],
  { stdio: 'inherit', env: { ...process.env, PATH: cleaned } },
);

child.on('exit', (code, signal) => {
  // A signal is not a pass. Reporting 0 for a killed suite is the shape of lie this tier exists
  // to refuse.
  process.exitCode = signal !== null ? 1 : (code ?? 1);
});
