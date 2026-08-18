#!/usr/bin/env node
/**
 * The slice harness: prove a slice is what it claims to be, then commit exactly those bytes.
 *
 * **Why this exists, and it is not tidiness.** Three defects were introduced by driving the slice
 * loop by hand on 18 August 2026, and two of them reached a commit:
 *
 *   1. `git add -A` swept an unrelated untracked directory into a slice commit.
 *   2. A reviewing agent mutated `scripts/run-lock.mjs` in the working tree between the tier-1 run
 *      and `git add`, so 0.182.0 shipped a gutted guard and a debug `process.stderr.write` while its
 *      commit message described the repair, and its recorded test numbers belonged to other bytes.
 *   3. A scripted edit aborted on a bad anchor and the green suite that followed was read as
 *      confirmation the edit had landed.
 *
 * Every one of those is the same mistake: **treating a green suite as evidence about the artifact.**
 * A suite tells you what the bytes did when they ran. It says nothing about which bytes get
 * committed. So this fingerprints the shipped files, runs the gates, re-fingerprints, and refuses if
 * anything moved underneath — then verifies the index and the commit against the same fingerprints.
 *
 * Usage:
 *   node tools/slice-check.mjs verify              gates + fingerprint stability, no writes
 *   node tools/slice-check.mjs commit -m <file>    verify, stage the named paths, commit, re-verify
 *   node tools/slice-check.mjs commit -m <file> --paths a b c
 *
 * `-m` takes a **file** holding the commit message, not a string: a message written on the command
 * line loses its formatting to the shell and this repository's messages are long-form.
 *
 * Not a shipped file. `tools/` is outside the release surface, so adding to it needs no version
 * bump — which `npm run release-check` will confirm rather than this claiming it.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/** Directories whose contents are shipped, from CLAUDE.md's release rule. */
const SHIPPED_DIRS = ['hooks', 'scripts', 'commands', 'templates', 'output-styles'];
/** Individual shipped files. */
const SHIPPED_FILES = ['.claude-plugin/plugin.json', 'package.json', 'package-lock.json'];

/**
 * Text that should never reach a commit: the fingerprints of the mutation scaffolding that did.
 *
 * Deliberately literal rather than clever. A regression here is somebody's debugging left in, and
 * the shapes it takes are few and recognisable; a subtle matcher would trade the one thing this
 * needs — no false negatives on the known cases — for coverage of cases nobody has seen.
 */
const SCAFFOLDING = [
  /void [A-Za-z_$][\w$]*; void /,
  /process\.stderr\.write\('(?:RELEASE|DEBUG|XXX|TRACE)/,
  /TEMPORARILY/,
  /\bconst isTheOneJudged = true\b/,
];

/** @param {string[]} argv @returns {string} */
function git(argv) {
  return execFileSync('git', argv, { stdio: 'pipe', encoding: 'utf8' }).trim();
}

/** @returns {string[]} every tracked shipped path */
function shippedPaths() {
  const tracked = git(['ls-files']).split('\n').filter(Boolean);
  return tracked.filter(
    (file) => SHIPPED_FILES.includes(file) || SHIPPED_DIRS.some((dir) => file.startsWith(`${dir}/`)),
  );
}

/**
 * Content hashes of the shipped surface as it is on disk right now.
 *
 * @returns {Map<string, string>}
 */
function fingerprint() {
  /** @type {Map<string, string>} */
  const seen = new Map();
  for (const file of shippedPaths()) {
    if (!existsSync(file)) continue;
    seen.set(file, git(['hash-object', file]));
  }
  return seen;
}

/**
 * @param {Map<string, string>} before
 * @param {Map<string, string>} after
 * @returns {string[]} human-readable differences, empty when nothing moved
 */
function drifted(before, after) {
  /** @type {string[]} */
  const problems = [];
  for (const [file, hash] of before) {
    if (!after.has(file)) problems.push(`${file}: disappeared while the gates ran`);
    else if (after.get(file) !== hash) problems.push(`${file}: changed while the gates ran`);
  }
  for (const file of after.keys()) if (!before.has(file)) problems.push(`${file}: appeared while the gates ran`);
  return problems;
}

/** @param {string[]} files @returns {string[]} */
function scaffoldingIn(files) {
  /** @type {string[]} */
  const found = [];
  for (const file of files) {
    if (!existsSync(file)) continue;
    const body = readFileSync(file, 'utf8');
    body.split('\n').forEach((line, index) => {
      for (const pattern of SCAFFOLDING) {
        if (pattern.test(line)) found.push(`${file}:${index + 1}: ${line.trim().slice(0, 120)}`);
      }
    });
  }
  return found;
}

/** @param {string} label @param {string[]} argv */
function run(label, argv) {
  process.stdout.write(`  ${label} ... `);
  try {
    // 64MB, not the 1MB default: a full tier-2 run overruns it, and `execFileSync` reports that
    // overrun as a *command failure* — a harness that cannot tell a big log from a broken gate is
    // worse than no harness.
    execFileSync(argv[0], argv.slice(1), {
      stdio: 'pipe',
      encoding: 'utf8',
      timeout: 30 * 60_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    process.stdout.write('ok\n');
    return true;
  } catch (error) {
    process.stdout.write('FAILED\n');
    const out = /** @type {{ stdout?: string, stderr?: string }} */ (error);
    const combined = `${out.stdout ?? ''}\n${out.stderr ?? ''}`;
    // **Named, not just tailed.** The first version printed the last 3000 characters, which on a
    // tier-2 run is npm's warning banner and nothing else — so a refusal said "it failed" and left
    // the reader to re-run the suite by hand to find out what. A failing gate that cannot say which
    // test failed is the same defect this repository keeps repairing one layer up.
    const named = combined
      .split('\n')
      .filter((line) => /^\s*(✖|not ok |AssertionError|Error:)/.test(line))
      .slice(0, 40);
    if (named.length > 0) process.stdout.write(`${named.join('\n')}\n`);
    else process.stdout.write(`${combined.slice(-3000)}\n`);
    return false;
  }
}

/** @param {string} message @returns {never} */
function refuse(message) {
  process.stdout.write(`\nREFUSED: ${message}\n`);
  process.exit(1);
}

/**
 * Gates, then the fingerprint comparison that is the whole point.
 *
 * @param {{ integration: boolean }} options
 * @returns {Map<string, string>} the verified fingerprint
 */
function verify(options) {
  const before = fingerprint();
  process.stdout.write(`slice-check: ${before.size} shipped file(s) fingerprinted\n`);

  const scaffolding = scaffoldingIn([...before.keys()]);
  if (scaffolding.length > 0) {
    refuse(`shipped files contain debugging scaffolding:\n  ${scaffolding.join('\n  ')}`);
  }

  const gates = [
    ['npm run lint', ['npm', 'run', 'lint']],
    ['npm run typecheck', ['npm', 'run', 'typecheck']],
    ['npm test', ['npm', 'test']],
    ...(options.integration ? [['npm run test:integration', ['npm', 'run', 'test:integration']]] : []),
    ['npm run release-check', ['npm', 'run', 'release-check']],
  ];
  for (const [label, argv] of gates) {
    if (!run(/** @type {string} */ (label), /** @type {string[]} */ (argv))) refuse(`${label} failed`);
  }

  // **After the gates, not before.** This is the check that would have caught 0.182.0: the gates
  // were green and the bytes then changed before `git add`, so the numbers in that commit message
  // described a tree it did not contain.
  const after = fingerprint();
  const moved = drifted(before, after);
  if (moved.length > 0) {
    refuse(
      `the shipped surface changed while the gates ran, so their results describe other bytes:\n  ${moved.join('\n  ')}`,
    );
  }
  process.stdout.write('  shipped bytes unchanged since the fingerprint ... ok\n');
  return after;
}

/**
 * @param {Map<string, string>} verified
 * @param {string[]} paths
 * @param {string} messageFile
 */
function commit(verified, paths, messageFile) {
  if (!existsSync(messageFile)) refuse(`no commit message at ${messageFile}`);
  const message = readFileSync(messageFile, 'utf8').trim();
  if (message === '') refuse(`the commit message at ${messageFile} is empty`);

  // Named paths only. `git add -A` is how an unrelated untracked directory reached a slice commit.
  git(['add', '--', ...paths]);

  const staged = git(['ls-files', '-s', '--', ...paths])
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [meta, file] = line.split('\t');
      return { file, hash: meta.split(' ')[1] };
    });
  for (const entry of staged) {
    const expected = verified.get(entry.file);
    if (expected !== undefined && expected !== entry.hash) {
      refuse(`${entry.file} was staged with bytes the gates never saw`);
    }
  }
  const untracked = git(['status', '--porcelain']).split('\n').filter((line) => line.startsWith('?? '));
  if (untracked.length > 0) {
    process.stdout.write(`  note: ${untracked.length} untracked path(s) left alone: ${untracked.join(', ')}\n`);
  }

  execFileSync('git', ['commit', '--quiet', '-F', messageFile], { stdio: 'inherit' });

  // And the committed tree, because staging correctly and committing correctly are two events.
  for (const [file, hash] of verified) {
    const inHead = execFileSync('git', ['rev-parse', `HEAD:${file}`], { stdio: 'pipe', encoding: 'utf8' }).trim();
    if (inHead !== hash) refuse(`${file} in HEAD is not the file the gates verified`);
  }
  process.stdout.write(`\nCOMMITTED ${git(['log', '--oneline', '-1'])}\n`);
  process.stdout.write('  every shipped file in HEAD matches the fingerprint the gates ran against\n');
}

const argv = process.argv.slice(2);
const mode = argv[0] ?? 'verify';
if (!['verify', 'commit'].includes(mode)) refuse(`unknown mode ${JSON.stringify(mode)}; use verify or commit`);
const skipIntegration = argv.includes('--no-integration');
const verified = verify({ integration: !skipIntegration });

if (mode === 'commit') {
  const at = argv.indexOf('-m');
  if (at === -1 || argv[at + 1] === undefined) refuse('commit needs -m <file holding the message>');
  const pathsAt = argv.indexOf('--paths');
  const paths =
    pathsAt === -1
      ? git(['diff', '--name-only']).split('\n').filter(Boolean)
      : argv.slice(pathsAt + 1).filter((entry) => !entry.startsWith('-'));
  if (paths.length === 0) refuse('nothing to commit');
  process.stdout.write(`\nstaging ${paths.length} path(s): ${paths.join(', ')}\n`);
  commit(verified, paths, path.resolve(argv[at + 1]));
}
