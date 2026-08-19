/**
 * The `PATH` the operator's own shell has, with npm's injections removed.
 *
 * **Measured on 13 August 2026, and it silently changed which program was under test.** `npm run`
 * prepends every ancestor `node_modules/.bin` to `PATH`, so `npm run test:live` was exercising
 * `~/dev/node_modules/.bin/claude` — Claude Code **2.1.136**, which has never heard of
 * `--safe-mode` — while `scripts/driver.mjs` spawns whatever `claude` the operator's shell resolves.
 * The green result described software nobody executes.
 *
 * `tools/run-live.mjs` has repaired that for the live tier since. This exists because a **second**
 * tool then needed the same answer: `tools/plugin-install-check.mjs` resolved 2.1.136 the first time
 * it ran under `npm run`, which is the same defect arriving in a new place. Two implementations of
 * "which claude would the driver use" would eventually disagree, and the one that disagreed quietly
 * would be the one deciding a release.
 *
 * It repairs resolution; it does not hide the problem.
 * `test/live/binary-identity.live.test.mjs` still asserts the identity and still fails loudly if a
 * shadow survives, because a harness that quietly corrects itself teaches nobody.
 */

import path from 'node:path';

/**
 * Is this a directory npm injected rather than one the operator's shell carries?
 *
 * Matched on a path *segment*, so `/home/me/node_modules/.bin` goes and `/opt/node_modules_tools`
 * — a directory that merely starts with the same letters — stays.
 *
 * @param {string} entry
 * @returns {boolean}
 */
export function isNpmInjected(entry) {
  return entry.split(/[\\/]/).includes('node_modules');
}

/**
 * @param {string | undefined} value the `PATH` to clean, usually `process.env.PATH`
 * @param {string} [separator] the platform's delimiter; injected for tests
 * @returns {string}
 */
export function operatorPath(value, separator = path.delimiter) {
  return (value ?? '')
    .split(separator)
    .filter((entry) => entry !== '' && !isNpmInjected(entry))
    .join(separator);
}
