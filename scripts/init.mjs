#!/usr/bin/env node
/**
 * `meeseeks init` — scaffold `.meeseeks/config.json` and report preflight (DESIGN.md §3.5).
 *
 * Named `init.mjs` rather than DESIGN.md §7's `init.js`: CLAUDE.md hard constraint 3
 * requires ESM, and the `.mjs` extension guarantees it even when the plugin is loaded
 * from a cache directory that does not carry this package manifest.
 *
 * Exit code is the contract. 0 means a run may start; 1 means it may not.
 * `commands/meeseeks.md` shells here before it shells to the driver, so a half-configured
 * unattended run never begins.
 */

import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { initConfig, loadConfig } from './config.mjs';
import { formatPreflight, runPreflight } from './preflight.mjs';

/**
 * @param {string[]} argv
 * @param {string} cwd
 * @returns {{ yes: boolean, cwd: string, scaffoldOnly: boolean }}
 */
export function parseArgs(argv, cwd) {
  return {
    yes: argv.includes('--yes') || argv.includes('-y'),
    scaffoldOnly: argv.includes('--scaffold-only'),
    cwd,
  };
}

/**
 * @param {string[]} argv
 * @param {{ log?: (line: string) => void, cwd?: string, interactive?: boolean }} [io]
 * @returns {Promise<number>} process exit code
 */
export async function main(argv, io = {}) {
  const log = io.log ?? ((/** @type {string} */ line) => process.stdout.write(`${line}\n`));
  const { yes, cwd, scaffoldOnly } = parseArgs(argv, io.cwd ?? process.cwd());
  const meeseeksDir = path.join(cwd, '.meeseeks');

  if (scaffoldOnly) {
    const { created, path: file } = initConfig(meeseeksDir);
    log(created ? `created ${file}` : `${file} already exists, left alone`);
    return 0;
  }

  // Read here rather than inside preflight, because preflight is deliberately configuration-free
  // apart from `checkConfig` and a bad config file must still produce its own named failure
  // rather than an unrelated one about sandboxing.
  let wantsSandbox = false;
  try {
    wantsSandbox = loadConfig(meeseeksDir).sandbox.enabled;
  } catch {
    // `checkConfig` reports an unreadable config as itself. A run that cannot read its settings
    // has a larger problem than whether it asked to be sandboxed.
  }

  const result = await runPreflight({
    cwd,
    yes,
    interactive: io.interactive ?? process.stdout.isTTY === true,
    meeseeksDir,
    sandbox: wantsSandbox,
  });
  log(formatPreflight(result));
  return result.ok ? 0 : 1;
}

// **`pathToFileURL`, not string concatenation.** `file://${process.argv[1]}` is not a URL for any
// path needing percent-encoding — a space, a `#`, anything non-ASCII — and it is never one on
// Windows, where argv[1] is `C:\...` while `import.meta.url` is `file:///C:/...`. When the
// comparison fails this file runs `main` for nobody: it prints nothing and **exits 0**, and
// `commands/meeseeks.md` reads a zero exit as "preflight passed" and shells straight to the driver.
// Every one of the thirteen refusals is bypassed, silently, on a plugin installed to a path with a
// space in it — which `~/.claude/plugins/cache/` under a user's real name routinely is.
//
// Reproduced 20 August 2026 by copying this tree to a directory named `plug in` and running it in a
// non-git directory: no output, exit 0, where the same file at an unspaced path printed all thirteen
// checks and failed four. `driver.mjs`, `configure.mjs` and `health-probe.mjs` already guard
// themselves this way; this was the one that did not.
if (typeof process.argv[1] === 'string' && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = await main(process.argv.slice(2));
}
