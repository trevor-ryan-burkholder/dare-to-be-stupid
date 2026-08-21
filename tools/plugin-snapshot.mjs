/**
 * Stage the candidate as the plugin a loader would actually install (REVIEW F21).
 *
 * **Every release gate in this repository reads the working tree; the loader does not.** Claude Code
 * installs a plugin into `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/` and reads it
 * from *there* — `installed_plugins.json` records that `installPath` and pins a `gitCommitSha`
 * beside it. So `release-check` and `slice-check` can both be green about bytes no loader will ever
 * open, which is exactly F21's complaint: the checks never exercise the installed snapshot.
 *
 * Four other findings end in a canary against that snapshot — F25's withheld command, F27's role
 * tools, F28's compatibility floor, F29's reviewer isolation — and all four were batched behind
 * machinery that did not exist. This is the machinery.
 *
 * **It never touches the operator's `~/.claude`.** The loader accepts `--plugin-dir <path>`, so a
 * disposable copy in a temporary directory is loadable without installing anything, without a
 * marketplace, and without disturbing a single plugin the operator actually uses. Measured against
 * `claude` 2.1.235 on 18 August 2026: a staged copy of this repository loaded and answered.
 *
 * **The surface comes from `isShipped`, not from a list here.** `release-check.mjs` already owns the
 * question "which bytes does the loader read", and a second answer would drift from the first — the
 * enumeration defect this project has paid for repeatedly. Adding a shipped directory therefore
 * extends the snapshot automatically.
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { SHIPPED_PATHS, isShipped } from './release-check.mjs';

/** @param {string[]} args @param {string} cwd @returns {string} */
function git(args, cwd) {
  return execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf8' }).trim();
}

/**
 * Every shipped file in the tree, repository-relative and sorted.
 *
 * Walked from disk rather than from `git ls-files`, deliberately: the snapshot must be the bytes a
 * loader would read *now*, including an uncommitted edit. A candidate that is green only because
 * the gate looked at HEAD is the whole failure family this repository keeps finding.
 *
 * @param {string} root
 * @returns {string[]}
 */
export function shippedFiles(root) {
  /** @type {string[]} */
  const found = [];
  /** @param {string} relative */
  const walk = (relative) => {
    const full = path.join(root, relative);
    /** @type {import('node:fs').Dirent[]} */
    let entries;
    try {
      entries = readdirSync(full, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile() && isShipped(child)) found.push(child);
    }
  };
  for (const dir of SHIPPED_PATHS) walk(dir);
  return found.sort();
}

/**
 * Copy the shipped surface into `dest`, and report what was staged.
 *
 * @param {{ root: string, dest: string }} options
 * @returns {Map<string, string>} repository-relative path to git blob hash, as staged
 */
export function stageSnapshot(options) {
  const files = shippedFiles(options.root);
  if (files.length === 0) {
    // Nothing to stage is never "staged nothing successfully": a loader given an empty directory
    // has no plugin, and a harness that reported success here would prove the opposite of F21.
    throw new Error(`no shipped files under ${options.root}; there is no plugin snapshot to stage`);
  }
  /** @type {Map<string, string>} */
  const staged = new Map();
  for (const relative of files) {
    const target = path.join(options.dest, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(path.join(options.root, relative), target);
    staged.set(relative, git(['hash-object', target], options.dest));
  }
  return staged;
}

/**
 * Compare a staged snapshot against the tree it claims to be a copy of.
 *
 * Hashes the *staged* files rather than trusting the copy, because "I wrote it correctly" is the
 * assumption this whole harness exists to stop making.
 *
 * @param {{ root: string, dest: string }} options
 * @returns {string[]} differences, empty when the snapshot is the candidate
 */
export function verifySnapshot(options) {
  /** @type {string[]} */
  const problems = [];
  const expected = new Map(shippedFiles(options.root).map((file) => [file, git(['hash-object', file], options.root)]));
  for (const [file, hash] of expected) {
    /** @type {string} */
    let staged;
    try {
      statSync(path.join(options.dest, file));
      staged = git(['hash-object', path.join(options.dest, file)], options.dest);
    } catch {
      problems.push(`${file}: missing from the snapshot`);
      continue;
    }
    if (staged !== hash) problems.push(`${file}: the snapshot holds different bytes than the candidate`);
  }
  for (const file of shippedFiles(options.dest)) {
    if (!expected.has(file)) problems.push(`${file}: present in the snapshot and not in the candidate`);
  }
  return problems;
}

// `fileURLToPath`, never `new URL(...).pathname`: on Windows the pathname of a file URL is
// `/C:/…`, which never equals a `path.resolve`d argv, so this guard would silently never run and
// the CLI would exit having done nothing (REVIEW F21).
const invokedDirectly =
  typeof process.argv[1] === 'string' && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const dest = process.argv[2];
  if (dest === undefined) {
    process.stderr.write('usage: node tools/plugin-snapshot.mjs <destination>\n');
    process.exitCode = 1;
  } else {
    const staged = stageSnapshot({ root: process.cwd(), dest });
    const problems = verifySnapshot({ root: process.cwd(), dest });
    for (const problem of problems) process.stderr.write(`${problem}\n`);
    process.stdout.write(`staged ${staged.size} shipped file(s) into ${dest}\n`);
    if (problems.length > 0) process.exitCode = 1;
  }
}
