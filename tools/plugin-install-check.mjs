/**
 * Install the committed candidate the way a loader does, and check what actually resolves (F21).
 *
 * **Every other gate here reads the working tree; the loader reads an install.** Claude Code copies
 * a plugin into `<root>/plugins/cache/<marketplace>/<plugin>/<version>/` and records the path, the
 * version and a `gitCommitSha` in `installed_plugins.json`. `release-check` and `slice-check` can
 * both be green about bytes no loader will ever open, and `CLAUDE.md` documents two silent traps on
 * top of that: a marketplace that reports success without refetching, and a cache directory keyed by
 * a version that did not change. This performs the install and then interrogates it.
 *
 * **It is free and offline.** The marketplace source is a *bare clone of this repository* on local
 * disk, so nothing is fetched from a network and no model is invoked. Total runtime is a few
 * seconds.
 *
 * **It cannot touch the operator's plugins, and it proves that rather than claiming it.**
 * `CLAUDE_CONFIG_DIR` is the complete redirect — measured, and the reason it is the one used:
 * `CLAUDE_CODE_PLUGIN_CACHE_DIR` moves the plugin root but *not* the user settings file, so
 * `claude plugin marketplace add` under it writes `extraKnownMarketplaces` into the operator's real
 * `~/.claude/settings.json`. That happened once during this work. Two things follow: the
 * marketplace is registered by writing `known_marketplaces.json` directly into the disposable root
 * rather than by `marketplace add`, and the operator's settings file is hashed before and after.
 *
 * **What it checks is chosen against three measured false greens.** `plugin list` reports a plugin
 * healthy while reading the *marketplace clone*, so a renamed cache directory does not fail it. The
 * loader never checks that a hook command's file exists, so a deleted `guard.mjs` still shows
 * `Hooks (1)`. And `claude plugin validate` validates the *marketplace* manifest when one is
 * present and never opens `plugin.json`. None of those three is asked here. What is asked is the
 * registry's own record, the installed bytes, and where the module graph actually resolves from.
 *
 *   node tools/plugin-install-check.mjs [--keep]
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { operatorPath } from './operator-path.mjs';
import { isShipped } from './release-check.mjs';

const MARKETPLACE = 'meeseeks';
const PLUGIN = 'meeseeks';

/** @param {string} message @returns {never} */
function refuse(message) {
  process.stderr.write(`REFUSED: ${message}\n`);
  process.exit(1);
}

/** @param {string} line */
function say(line) {
  process.stdout.write(`${line}\n`);
}

/**
 * @param {string} command @param {string[]} args
 * @param {{ cwd?: string, env?: Record<string, string | undefined>, allowFailure?: boolean }} [options]
 * @returns {string}
 */
function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: options.cwd ?? process.cwd(),
      env: /** @type {any} */ (options.env ?? baseEnv),
      stdio: 'pipe',
      encoding: 'utf8',
      timeout: 300_000,
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    if (options.allowFailure === true) return '';
    const failure = /** @type {{ stdout?: string, stderr?: string, message: string }} */ (error);
    return refuse(`${command} ${args.join(' ')} failed: ${(failure.stderr || failure.stdout || failure.message).trim().slice(0, 600)}`);
  }
}

/** @param {string} file @returns {string} */
const digestOf = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

/**
 * Every shipped file in a commit, mapped to its blob hash.
 *
 * Read from the commit rather than from disk, because the install carries *HEAD* — a working-tree
 * edit is not in it, and comparing the install against the working tree would report a difference
 * the install could not possibly have.
 *
 * @param {string} gitDir @param {string} commit
 * @returns {Map<string, string>}
 */
function shippedAtCommit(gitDir, commit) {
  /** @type {Map<string, string>} */
  const tree = new Map();
  for (const line of run('git', ['--git-dir', gitDir, 'ls-tree', '-r', commit]).split('\n')) {
    if (line.trim() === '') continue;
    const [meta, file] = line.split('\t');
    const parts = meta.split(/\s+/);
    if (parts[1] !== 'blob') continue;
    if (isShipped(file)) tree.set(file, parts[2]);
  }
  return tree;
}

/** @param {string} root @returns {string[]} files under `root`, root-relative */
function filesUnder(root) {
  /** @type {string[]} */
  const found = [];
  /** @param {string} relative */
  const walk = (relative) => {
    for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const child = relative === '' ? entry.name : path.posix.join(relative, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile()) found.push(child);
    }
  };
  walk('');
  return found;
}

/**
 * The environment every command here runs under, with npm's `node_modules/.bin` entries removed.
 *
 * **Measured the hard way: this check resolved 2.1.136 the first time it ran under `npm run`** — the
 * ancestor binary this repository records as having never heard of `--safe-mode` — and then reported
 * on an install that binary had performed. `tools/run-live.mjs` has repaired the same defect for the
 * live tier since 13 August 2026; `operator-path.mjs` is now the one answer both use.
 */
const baseEnv = { ...process.env, PATH: operatorPath(process.env.PATH) };

const keep = process.argv.includes('--keep');
const repo = process.cwd();
const settingsFile = path.join(os.homedir(), '.claude', 'settings.json');
const settingsBefore = digestOf(settingsFile);
const realRegistry = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json');
const realBefore = digestOf(realRegistry);

const head = run('git', ['rev-parse', 'HEAD']).trim();
const declared = JSON.parse(readFileSync(path.join(repo, '.claude-plugin', 'plugin.json'), 'utf8')).version;
const cli = run('claude', ['--version']).trim();
// **Which binary, not just which version** (REVIEW F28: "path plus a self-reported version is not
// sufficient identity" — and a version with no path is less than that). A shadowed `claude` is the
// scenario the finding is about, and this check met one on its first run.
const cliPath = run('sh', ['-c', 'command -v claude'], { allowFailure: true }).trim() || '(path unknown)';
say(`checking ${PLUGIN}@${MARKETPLACE} ${declared} at ${head.slice(0, 12)} against ${cli} at ${cliPath}`);

// A working tree that differs from HEAD is not a failure — but the install carries HEAD, so saying
// which bytes were checked is the difference between evidence and a comforting number.
const dirty = run('git', ['status', '--porcelain']).split('\n').filter((line) => line.trim() !== '' && !line.startsWith('?? '));
if (dirty.length > 0) say(`  note: ${dirty.length} uncommitted change(s); this checks HEAD, which is what an install carries`);

const scratch = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-install-check-'));
const configDir = path.join(scratch, 'config');
const pluginRoot = path.join(configDir, 'plugins');
const bare = path.join(scratch, 'candidate.git');
/** @type {Record<string, string | undefined>} */
const isolated = { ...baseEnv, CLAUDE_CONFIG_DIR: configDir };

try {
  mkdirSync(pluginRoot, { recursive: true });
  run('git', ['clone', '--quiet', '--bare', repo, bare]);

  // Registered by writing the file, not by `marketplace add`: see the header. A `lastUpdated` is
  // required by the loader's own schema, and its absence is reported as a corrupt configuration.
  writeFileSync(
    path.join(pluginRoot, 'known_marketplaces.json'),
    `${JSON.stringify(
      {
        [MARKETPLACE]: {
          source: { source: 'git', url: bare },
          installLocation: path.join(pluginRoot, 'marketplaces', MARKETPLACE),
          lastUpdated: new Date(0).toISOString(),
        },
      },
      null,
      1,
    )}\n`,
    'utf8',
  );

  run('claude', ['plugin', 'marketplace', 'update', MARKETPLACE], { cwd: scratch, env: isolated });
  run('claude', ['plugin', 'install', `${PLUGIN}@${MARKETPLACE}`], { cwd: scratch, env: isolated });

  // ---- what the registry recorded -----------------------------------------
  const registry = JSON.parse(readFileSync(path.join(pluginRoot, 'installed_plugins.json'), 'utf8'));
  const entries = registry?.plugins?.[`${PLUGIN}@${MARKETPLACE}`];
  if (!Array.isArray(entries) || entries.length !== 1) refuse(`the registry did not record exactly one install: ${JSON.stringify(entries)}`);
  const [record] = entries;
  if (record.version !== declared) refuse(`the loader resolved version ${record.version}; the manifest declares ${declared}`);
  if (record.gitCommitSha !== head) refuse(`the loader pinned ${record.gitCommitSha}; HEAD is ${head}`);
  if (path.basename(record.installPath) !== declared) {
    refuse(`the install path is not keyed by version: ${record.installPath}`);
  }
  say(`  registry ... version ${record.version}, commit ${String(record.gitCommitSha).slice(0, 12)}, path keyed by version`);

  // ---- the installed bytes -------------------------------------------------
  const expected = shippedAtCommit(bare, head);
  if (expected.size === 0) refuse('HEAD carries no shipped files, so there is nothing to have installed');
  /** @type {string[]} */
  const problems = [];
  for (const [file, blob] of expected) {
    const target = path.join(record.installPath, file);
    const actual = run('git', ['hash-object', target], { allowFailure: true }).trim();
    if (actual === '') problems.push(`${file}: missing from the install`);
    else if (actual !== blob) problems.push(`${file}: the install holds different bytes than ${head.slice(0, 12)}`);
  }
  for (const file of filesUnder(record.installPath)) {
    if (isShipped(file) && !expected.has(file)) problems.push(`${file}: present in the install and not in the commit`);
  }
  if (problems.length > 0) refuse(`the installed snapshot is not the candidate:\n  ${problems.slice(0, 10).join('\n  ')}`);
  say(`  bytes ... ${expected.size} shipped file(s) identical to ${head.slice(0, 12)}`);

  // ---- where the module graph actually resolves from ------------------------
  //
  // The check the false greens cannot fake. `plugin list` reads the marketplace clone and `details`
  // never opens a hook file, but a module graph cannot lie about where it loaded from: importing the
  // installed driver under `NODE_V8_COVERAGE` records every script URL Node resolved.
  const coverage = path.join(scratch, 'coverage');
  run(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(`file://${path.join(record.installPath, 'scripts', 'driver.mjs')}`)});`], {
    cwd: scratch,
    env: { ...isolated, NODE_V8_COVERAGE: coverage },
  });
  /** @type {string[]} */
  const resolved = [];
  for (const name of readdirSync(coverage)) {
    for (const script of JSON.parse(readFileSync(path.join(coverage, name), 'utf8')).result ?? []) {
      const url = String(script.url ?? '');
      // `[eval1]` is this probe's own entry point, not a module the plugin resolved.
      if (url.startsWith('file://') && !url.endsWith('[eval1]')) resolved.push(url.slice('file://'.length));
    }
  }
  if (resolved.length === 0) refuse('the coverage probe recorded no modules, so it established nothing');
  const strays = resolved.filter((file) => !file.startsWith(record.installPath));
  if (strays.length > 0) refuse(`the installed plugin resolved ${strays.length} module(s) outside its install path:\n  ${strays.slice(0, 5).join('\n  ')}`);
  say(`  resolution ... ${resolved.length} module(s), all under the install path, none from this checkout`);

  // ---- the guard, from the installed copy ----------------------------------
  //
  // Not "is a hook declared" — the loader answers that without opening the file. This runs the
  // installed hook and requires it to deny, because a guard that is present and inert is the
  // eleven-version failure this repository already paid for.
  const probe = {
    session_id: '00000000-0000-4000-8000-000000000000',
    transcript_path: '/dev/null',
    cwd: scratch,
    permission_mode: 'bypassPermissions',
    hook_event_name: 'PreToolUse',
    tool_name: 'Write',
    tool_input: { file_path: path.join(scratch, '.meeseeks', 'state.json'), content: 'x' },
  };
  /** @type {string} */
  let answered;
  try {
    answered = execFileSync(process.execPath, [path.join(record.installPath, 'hooks', 'guard.mjs')], {
      cwd: scratch,
      env: /** @type {any} */ ({ ...isolated, MEESEEKS_RUNNING: '1' }),
      input: JSON.stringify(probe),
      stdio: 'pipe',
      encoding: 'utf8',
      timeout: 60_000,
    });
  } catch (error) {
    const failure = /** @type {{ stdout?: string }} */ (error);
    answered = failure.stdout ?? '';
  }
  /** @type {any} */
  let verdict;
  try {
    verdict = JSON.parse(answered);
  } catch {
    refuse(`the installed guard did not answer with JSON: ${answered.trim().slice(0, 300)}`);
  }
  const decision = verdict?.hookSpecificOutput?.permissionDecision;
  if (decision !== 'deny') {
    refuse(`the installed guard allowed a write under .meeseeks/ from inside a run: ${JSON.stringify(verdict).slice(0, 300)}`);
  }
  say(`  guard ... the installed hook denied a write under .meeseeks/ from inside a run`);

  // ---- the contracts the installed code carries (REVIEW F27, F28) ----------
  //
  // **This is the question `CLAUDE.md` says to ask before debugging anything else.** A repair can be
  // committed, pushed, reinstalled and reloaded while the loader keeps running the previous build,
  // and every symptom is indistinguishable from a wrong fix. Importing the *installed* modules and
  // asking them directly is the only answer that cannot be fooled: these are the bytes a run uses.
  const installedDriver = await import(`file://${path.join(record.installPath, 'scripts', 'driver.mjs')}`);
  const installedCompat = await import(`file://${path.join(record.installPath, 'scripts', 'claude-compat.mjs')}`);

  // F27: available tools are modelled apart from approved ones, in the installed copy.
  for (const [phase, policy] of Object.entries(installedDriver.PHASE_PERMISSIONS)) {
    const argv = installedDriver.claudeArgs({ model: 'm', phase });
    const at = argv.indexOf('--tools');
    if (policy.availableTools === null) {
      if (at !== -1) refuse(`the installed ${phase} policy restricts a role that must stay unrestricted`);
      continue;
    }
    if (at === -1) refuse(`the installed ${phase} policy passes no availability control`);
    if (argv[at + 1] !== policy.availableTools.join(',')) {
      refuse(`the installed ${phase} policy offers ${JSON.stringify(argv[at + 1])}, not its declared set`);
    }
    const approved = argv.indexOf('--allowedTools');
    if (approved !== -1 && at > approved) refuse(`the installed ${phase} argv puts --tools after the variadic --allowedTools`);
    if (!argv.includes('--strict-mcp-config')) refuse(`the installed ${phase} argv leaves the inherited MCP surface open`);
  }
  const authorArgv = installedDriver.claudeArgs({ model: 'm', phase: 'oracle-author' });
  if (authorArgv[authorArgv.indexOf('--tools') + 1] !== '') {
    refuse('the installed oracle author does not get the empty toolset that makes it held out');
  }
  say(`  role tools ... ${Object.keys(installedDriver.PHASE_PERMISSIONS).length} phase policies, oracle author at --tools ""`);

  // The guard, carried in the argv a real child receives, expanded to *this install*. `CLAUDE.md`
  // names this the invariant most likely to break: registering the hook in the manifest covers the
  // operator's own sessions, and a `claude -p` child does not load those. For eleven versions every
  // builder ran unguarded while the guard's unit tests stayed green.
  const settingsAt = authorArgv.indexOf('--settings');
  if (settingsAt === -1) refuse('the installed argv carries no --settings, so a child would run without the guard');
  const childSettings = String(authorArgv[settingsAt + 1]);
  if (!childSettings.includes(record.installPath)) {
    refuse('the installed argv hands children a guard path outside the install, so the loaded copy is not the one guarding');
  }
  if (!childSettings.includes('guard.mjs')) refuse('the installed argv hands children no guard command');
  say('  guard registration ... children receive the installed guard by absolute path');

  // F28: the installed compatibility policy is self-consistent, and what it says about this host.
  const floor = installedCompat.parseClaudeVersion(installedCompat.SUPPORTED_FLOOR);
  const ceiling = installedCompat.parseClaudeVersion(installedCompat.VERIFIED_THROUGH);
  if (floor === null || ceiling === null) refuse('the installed compatibility policy does not parse its own bounds');
  if (installedCompat.compareVersions(floor, ceiling) > 0) {
    refuse(`the installed policy floor ${installedCompat.SUPPORTED_FLOOR} is above its ceiling ${installedCompat.VERIFIED_THROUGH}`);
  }
  const cited = installedCompat.COMPATIBILITY_EVIDENCE.join('\n');
  for (const bound of [installedCompat.SUPPORTED_FLOOR, installedCompat.VERIFIED_THROUGH]) {
    if (!cited.includes(bound)) refuse(`the installed policy names ${bound} without citing evidence for it`);
  }
  // Reported, not enforced. Whether this host's CLI is inside the admitted range is a fact about
  // the machine, and the operator may hold a ceiling deliberately — as they are holding 2.1.235.
  // Failing here would turn their decision into a broken release check.
  const hostVerdict = installedCompat.classifyClaudeVersion(cli);
  say(
    `  compatibility ... policy ${installedCompat.SUPPORTED_FLOOR}-${installedCompat.VERIFIED_THROUGH}; ` +
      `this host's CLI is ${hostVerdict.ok ? 'inside it' : `OUTSIDE it — ${hostVerdict.reason}`}`,
  );

  // ---- and the operator's own configuration --------------------------------
  if (digestOf(settingsFile) !== settingsBefore) refuse(`this check modified ${settingsFile}, which it must never do`);
  if (digestOf(realRegistry) !== realBefore) refuse(`this check modified ${realRegistry}, which it must never do`);
  say('  isolation ... the operator’s settings and plugin registry are byte-identical');

  say(`\nok: ${PLUGIN}@${MARKETPLACE} ${declared} installs from ${head.slice(0, 12)} and resolves to the installed bytes`);
} finally {
  if (keep) say(`  kept ${scratch}`);
  else rmSync(scratch, { recursive: true, force: true });
}
