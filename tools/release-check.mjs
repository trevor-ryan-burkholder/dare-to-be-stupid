#!/usr/bin/env node
/**
 * Refuses to let a shipped change go out without a version bump.
 *
 * Claude Code installs a plugin into a cache directory keyed by **version** and reads it
 * from there. An update at an unchanged version resolves to the existing folder and reuses
 * the old code, while pushing, reinstalling and reloading all report success. The symptom
 * is a fix that appears not to work — indistinguishable from a wrong fix, and this repo has
 * lost hours to it twice.
 *
 * The check is mechanical, so it belongs in a command rather than in someone's memory:
 * find the commit that introduced the current version, then ask whether any shipped file
 * has changed since.
 *
 * Lives in `tools/` rather than `scripts/` on purpose. `scripts/` is shipped and loaded at
 * runtime, so a checker living there would demand a bump every time the checker itself
 * changed — which is exactly the sort of rule nobody obeys for long.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * Directories the plugin loader actually reads. `package.json` is deliberately absent: it
 * carries the version that must agree, but editing a dev script in it changes nothing the
 * loader sees.
 */
export const SHIPPED_PATHS = ['hooks', 'scripts', 'commands', 'templates', 'output-styles', '.claude-plugin'];

/**
 * @param {string} file repo-relative path
 * @returns {boolean}
 */
export function isShipped(file) {
  return SHIPPED_PATHS.some((dir) => file === dir || file.startsWith(`${dir}/`));
}

/** @typedef {{ ok: boolean, problems: string[] }} ReleaseVerdict */

/**
 * Decide whether this working state may be released as-is.
 *
 * @param {{ changedFiles: string[], pluginVersion: string, packageVersion: string }} input
 * @returns {ReleaseVerdict}
 */
export function evaluateRelease(input) {
  /** @type {string[]} */
  const problems = [];

  if (input.pluginVersion !== input.packageVersion) {
    problems.push(
      `version mismatch: .claude-plugin/plugin.json is ${input.pluginVersion} but package.json is ` +
        `${input.packageVersion}. They must agree, or the installed copy is labelled wrongly.`,
    );
  }

  const shipped = input.changedFiles.filter(isShipped).sort();
  if (shipped.length > 0) {
    problems.push(
      `${shipped.length} shipped file(s) changed since version ${input.pluginVersion} was introduced, ` +
        'but the version was not bumped. The install cache is keyed by version, so this change would ' +
        'never reach anyone who already has it installed:\n' +
        shipped.map((file) => `  ${file}`).join('\n'),
    );
  }

  return { ok: problems.length === 0, problems };
}

/** @typedef {(args: string[]) => string} Git */

/**
 * @param {string} cwd
 * @returns {Git}
 */
export function defaultGit(cwd) {
  return (args) => execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf8' });
}

/**
 * Files changed since the commit that introduced this version.
 *
 * The pickaxe finds where the current version string first appeared, which is exactly the
 * bump commit. If it cannot be found the check fails rather than passing — an unknown
 * baseline is not evidence that nothing changed.
 *
 * A version that appears nowhere in committed history is a bump that has not been
 * committed yet — which is the correct state to be in, not an error. Returning `null`
 * says so. Refusing here would mean the check fails precisely when someone has just done
 * the right thing, which is how a gate teaches people to bypass it.
 *
 * @param {{ git: Git, version: string }} options
 * @returns {{ baseline: string | null, changedFiles: string[] }}
 */
export function changesSinceVersion(options) {
  const needle = `"version": "${options.version}"`;
  const found = options.git(['log', '-1', '--format=%H', '-S', needle, '--', '.claude-plugin/plugin.json']).trim();
  if (found === '') return { baseline: null, changedFiles: [] };
  // Against the working tree, not `..HEAD`. Comparing commits would call an uncommitted
  // shipped edit "ok", and this check is most useful run *before* committing. Untracked
  // files count too: a brand-new script is the most shipped thing there is.
  const changed = options.git(['diff', '--name-only', found]).trim();
  const untracked = options.git(['ls-files', '--others', '--exclude-standard']).trim();
  const files = [...changed.split('\n'), ...untracked.split('\n')].filter((file) => file !== '');
  return { baseline: found, changedFiles: [...new Set(files)] };
}

/**
 * @param {{ cwd?: string, log?: (line: string) => void, git?: Git }} [io]
 * @returns {number} process exit code
 */
export function main(io = {}) {
  const cwd = io.cwd ?? path.resolve(fileURLToPath(new URL('../', import.meta.url)));
  const log = io.log ?? ((/** @type {string} */ line) => process.stdout.write(`${line}\n`));
  const git = io.git ?? defaultGit(cwd);

  const pluginVersion = JSON.parse(readFileSync(path.join(cwd, '.claude-plugin/plugin.json'), 'utf8')).version;
  const packageVersion = JSON.parse(readFileSync(path.join(cwd, 'package.json'), 'utf8')).version;

  const changes = changesSinceVersion({ git, version: pluginVersion });
  const verdict = evaluateRelease({ changedFiles: changes.changedFiles, pluginVersion, packageVersion });

  if (verdict.ok) {
    log(
      changes.baseline === null
        ? `ok: version ${pluginVersion} is a bump that has not been committed yet`
        : `ok: version ${pluginVersion}, no shipped file changed since ${changes.baseline.slice(0, 7)}`,
    );
    return 0;
  }

  for (const problem of verdict.problems) log(problem);
  log('');
  log('Bump the version in .claude-plugin/plugin.json and package.json together.');
  return 1;
}

const invokedDirectly = typeof process.argv[1] === 'string' && process.argv[1].endsWith('release-check.mjs');
if (invokedDirectly) process.exitCode = main();
