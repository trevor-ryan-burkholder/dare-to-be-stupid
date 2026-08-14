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
 * @returns {number} process exit code
 */
export function main(argv, io = {}) {
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

  const result = runPreflight({
    cwd,
    yes,
    interactive: io.interactive ?? process.stdout.isTTY === true,
    meeseeksDir,
    sandbox: wantsSandbox,
  });
  log(formatPreflight(result));
  return result.ok ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main(process.argv.slice(2));
}
