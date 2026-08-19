/**
 * Preflight (DESIGN.md §3.5).
 *
 * The goal is that the only things an operator does are install the plugin, be in a repo,
 * and run `/meeseeks`. Everything else is either checked and explained here, or installed by
 * the run itself. Preflight runs *before* the driver and fails loud rather than starting a
 * half-configured unattended run.
 *
 * Every check reports `ok`, a human `detail`, and a `fix`. All checks are attempted even
 * after one fails, so the operator sees every problem at once rather than discovering them
 * one restart at a time. A check that cannot be performed is a failure, never a skip.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  COMPATIBILITY_EVIDENCE,
  SUPPORTED_FLOOR,
  VERIFIED_THROUGH,
  classifyClaudeVersion,
  versionText,
} from './claude-compat.mjs';

import { ConfigError, initConfig, riskyRemoteWord } from './config.mjs';
import { parseErd, unmentionedEntities } from './erd.mjs';
import { RUN_LOCK_FILE, pidIsAlive, readRunLock } from './run-lock.mjs';
import { blockingFindings, formatFindings, scanAgentSurface } from './security-scan.mjs';

/** @typedef {{ name: string, ok: boolean, blocking: boolean, detail: string, fix: string }} CheckResult */
/** @typedef {(command: string, args: string[]) => { ok: boolean, stdout: string, stderr: string }} Probe */

/** DESIGN.md §3.5 and CLAUDE.md hard constraint 2: matches impeccable's floor. */
export const MINIMUM_NODE = '22.12.0';

/**
 * Compare dotted numeric versions without pulling in semver.
 *
 * Prerelease and build metadata are ignored rather than ordered: `22.12.0-rc.1` compares
 * equal to `22.12.0`. This check asks whether the runtime is at least a given version, not
 * whether it is a final release, and half-implementing semver precedence here would be a
 * subtle wrong answer instead of an honest simplification.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} negative when a < b
 */
export function compareVersions(a, b) {
  const parse = (/** @type {string} */ value) =>
    value
      .replace(/^v/, '')
      .split(/[-+]/)[0]
      .split('.')
      .map((part) => Number.parseInt(part, 10))
      .map((part) => (Number.isNaN(part) ? 0 : part));
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * Default probe: really shells out, read-only.
 * @param {string} cwd
 * @returns {Probe}
 */
export function defaultProbe(cwd) {
  return (command, args) => {
    try {
      const stdout = execFileSync(command, args, { cwd, stdio: 'pipe', encoding: 'utf8' });
      return { ok: true, stdout, stderr: '' };
    } catch (error) {
      const failure = /** @type {{ stdout?: string, stderr?: string, message: string }} */ (error);
      return { ok: false, stdout: failure.stdout ?? '', stderr: failure.stderr ?? failure.message };
    }
  };
}

/**
 * @param {string} name
 * @param {boolean} ok
 * @param {string} detail
 * @param {string} fix
 * @param {boolean} [blocking]
 * @returns {CheckResult}
 */
function check(name, ok, detail, fix, blocking = true) {
  return { name, ok, blocking, detail, fix };
}

/**
 * @param {string} nodeVersion
 * @returns {CheckResult}
 */
export function checkNodeVersion(nodeVersion) {
  return check(
    'node-version',
    compareVersions(nodeVersion, MINIMUM_NODE) >= 0,
    `node ${nodeVersion} (minimum ${MINIMUM_NODE})`,
    `Install Node ${MINIMUM_NODE} or newer; it is the floor for the driver and for impeccable.`,
  );
}

/**
 * Is the Claude Code on this PATH one this build has been shown to work with? (REVIEW F28)
 *
 * **It used to ask only whether the binary was callable.** Every version passed, including one the
 * repository itself records as incompatible — an ancestor npm binary at 2.1.136 that has never heard
 * of `--safe-mode`. The driver's behaviour rests on versioned external contracts, so an unverified
 * binary does not fail here; it fails four hours later, having spent money, when a role rejects a
 * flag or returns a differently shaped envelope.
 *
 * Both directions refuse, and the refusal names the executable, what it said, what the policy is and
 * how to change it. `scripts/claude-compat.mjs` owns the bounds and the evidence for them.
 *
 * **This is a compatibility gate, not capability proof.** It says a version is in a range that was
 * measured. It does not establish that this particular binary is the one a later role will resolve,
 * which is the sealed-identity half of F28 and is not in this slice.
 *
 * @param {Probe} probe
 * @returns {CheckResult}
 */
export function checkClaudeCli(probe) {
  const result = probe('claude', ['--version']);
  if (!result.ok) {
    return check(
      'claude-cli',
      false,
      `claude could not be run: ${result.stderr.trim()}`,
      'Install the Claude Code CLI and sign in; the driver spawns `claude -p` children and inherits that auth.',
    );
  }
  const verdict = classifyClaudeVersion(result.stdout);
  if (!verdict.ok) {
    return check(
      'claude-cli',
      false,
      // The identity of what was actually run, because "claude" is a PATH lookup and the operator
      // may have three of them. `which` is probed rather than assumed; an unknown path is reported
      // as unknown rather than omitted.
      `${verdict.reason} (${resolvedClaudePath(probe)})\n${COMPATIBILITY_EVIDENCE.map((line) => `  ${line}`).join('\n')}`,
      verdict.fix,
    );
  }
  return check(
    'claude-cli',
    true,
    `claude ${versionText(verdict.version)} (supported ${SUPPORTED_FLOOR} through ${VERIFIED_THROUGH})`,
    'Install the Claude Code CLI and sign in; the driver spawns `claude -p` children and inherits that auth.',
  );
}

/**
 * Which `claude` the shell would actually run.
 *
 * Reported with a refusal and nowhere else. A version complaint about "claude" is unactionable on a
 * host with a shadowed binary, which is the shape of the incident this finding cites.
 *
 * @param {Probe} probe
 * @returns {string}
 */
function resolvedClaudePath(probe) {
  const found = probe('sh', ['-c', 'command -v claude']);
  const resolved = found.ok ? found.stdout.trim() : '';
  return resolved === '' ? 'path unknown' : resolved;
}

/**
 * Can this host actually sandbox, when the operator has asked for one?
 *
 * **R19's load-bearing half is the refusal, not the sandbox.** The recorded failure mode is an
 * agent on a kernel where bubblewrap failed *asking to rerun unsandboxed* — and a sandbox that
 * can be declined by the thing it contains is not a sandbox. The driver therefore refuses on the
 * builder's behalf, before the run starts, rather than letting a child proceed unprotected.
 *
 * It has to be checked here because it cannot be checked later. `claude --help` states that in
 * `-p` mode **settings that fail validation are silently ignored**, so a sandbox declaration the
 * CLI would not honour disappears without a word — the guard's own eleven-version history, where
 * unit tests were green and the hook was reaching nobody, repeated with a different key.
 *
 * Only `bubblewrap` is probed, and only on Linux. macOS sandboxes with seatbelt, which is part
 * of the operating system and has nothing to install; Windows is not a supported host for this.
 * A missing probe answer is a failure, never a pass — an unknown sandbox is not a sandbox.
 *
 * Skipped entirely when the operator has not armed it, because a host with no bubblewrap is a
 * perfectly ordinary host for a run that never asked to be sandboxed.
 *
 * @param {Probe} probe
 * @param {boolean} wanted whether `sandbox.enabled` is set
 * @param {string} [platform]
 * @returns {CheckResult}
 */
export function checkSandboxAvailable(probe, wanted, platform = process.platform) {
  if (!wanted) {
    return check('sandbox', true, 'not requested; the guard hook is the only limit in force', '');
  }
  if (platform === 'darwin') {
    return check('sandbox', true, 'macOS seatbelt, which ships with the operating system', '');
  }
  if (platform !== 'linux') {
    return check(
      'sandbox',
      false,
      `sandbox.enabled is set, but this build knows of no sandbox for ${platform}`,
      'Unset sandbox.enabled, or run on Linux or macOS. The driver will not start a child unsandboxed after being asked for one.',
    );
  }
  const result = probe('bwrap', ['--version']);
  return check(
    'sandbox',
    result.ok,
    result.ok
      ? `bubblewrap present: ${result.stdout.trim()}`
      : 'sandbox.enabled is set and bubblewrap is not installed, so a child would run unsandboxed',
    'Install bubblewrap (`apt install bubblewrap`), or unset sandbox.enabled. The driver refuses the ' +
      'fallback on the builder\'s behalf: a sandbox that can be declined is not a sandbox.',
  );
}

/**
 * @param {Probe} probe
 * @returns {CheckResult}
 */
export function checkGitRepository(probe) {
  const result = probe('git', ['rev-parse', '--is-inside-work-tree']);
  const ok = result.ok && result.stdout.trim() === 'true';
  return check(
    'git-repository',
    ok,
    ok ? 'inside a git work tree' : 'not inside a git work tree',
    'Run `meeseeks` from inside a git repository; the ratchet resets to commits and cannot work without one.',
  );
}

/**
 * The ratchet resets to commits. A repository with no commits has nothing to reset *to*,
 * and the failure would otherwise surface mid-run as a refused reset after the builder had
 * already broken something — the worst possible moment to discover it.
 *
 * @param {Probe} probe
 * @returns {CheckResult}
 */
export function checkHasCommits(probe) {
  const result = probe('git', ['rev-parse', 'HEAD']);
  const ok = result.ok && /^[0-9a-f]{7,}$/.test(result.stdout.trim());
  return check(
    'has-commits',
    ok,
    ok ? `HEAD is ${result.stdout.trim().slice(0, 7)}` : 'the repository has no commits',
    'Make an initial commit first. The ratchet resets to a commit, and an empty history gives it nothing to hold.',
  );
}

/**
 * Is this porcelain line Meeseeks's own run state rather than the operator's work?
 *
 * `git status --porcelain` emits two status characters, a space, then the path.
 *
 * @param {string} line
 * @returns {boolean}
 */
function isMeeseeksOwned(line) {
  const target = line.slice(3).trim().replace(/^"|"$/g, '');
  return target === '.meeseeks' || target === '.meeseeks/' || target.startsWith('.meeseeks/');
}

/**
 * The check exists to stop the ratchet's `git reset --hard` from destroying work the
 * operator has not committed. `.meeseeks/` is not that work — it is the run's own state, which
 * preflight scaffolds itself.
 *
 * Counting it made preflight unpassable: the first run writes `.meeseeks/config.json`, and
 * every run after that failed on the file the previous run had created. An untracked
 * `.meeseeks/` is also safe from `reset --hard`, which leaves untracked files alone.
 *
 * @param {Probe} probe
 * @returns {CheckResult}
 */
export function checkCleanWorkingTree(probe) {
  const result = probe('git', ['status', '--porcelain']);
  if (!result.ok) {
    return check('clean-working-tree', false, `git status failed: ${result.stderr.trim()}`, 'Ensure git works here.');
  }
  const dirty = result.stdout
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .filter((line) => !isMeeseeksOwned(line));
  return check(
    'clean-working-tree',
    dirty.length === 0,
    dirty.length === 0 ? 'working tree is clean' : `${dirty.length} uncommitted change(s)`,
    'Commit or stash first. The ratchet performs `git reset --hard`, which destroys uncommitted work.',
  );
}

/**
 * @param {Probe} probe
 * @returns {CheckResult}
 */
export function checkRemoteIsNotProduction(probe) {
  const result = probe('git', ['remote', '-v']);
  const urls = result.ok
    ? [
        ...new Set(
          result.stdout
            .split('\n')
            .map((line) => line.split(/\s+/)[1])
            .filter((url) => typeof url === 'string' && url.length > 0),
        ),
      ]
    : [];
  if (urls.length === 0) {
    return check('safe-remote', true, 'no remote configured', 'Nothing to do; a local-only repo is fine.');
  }
  for (const url of urls) {
    const word = riskyRemoteWord(url);
    if (word !== null) {
      return check(
        'safe-remote',
        false,
        `remote ${url} contains ${JSON.stringify(word)}`,
        'Point meeseeks at a throwaway repository. It is pre-production only and never runs against anything with users.',
      );
    }
  }
  return check('safe-remote', true, `${urls.length} remote(s), none look like production`, 'Nothing to do.');
}

/**
 * Reachability of the npm registry. Needed because the run installs vitest, Playwright
 * browsers and the quality plugins itself (DESIGN.md §3.5).
 *
 * @param {Probe} probe
 * @returns {CheckResult}
 */
export function checkNetwork(probe) {
  const result = probe('npm', ['ping', '--silent']);
  return check(
    'network',
    result.ok,
    result.ok ? 'npm registry reachable' : `npm registry unreachable: ${result.stderr.trim() || 'no response'}`,
    'Restore network access; the run provisions vitest, Playwright and the quality plugins itself.',
  );
}

/**
 * Scaffolds `.meeseeks/config.json` when it is absent — the one check that fixes itself.
 *
 * @param {string} meeseeksDir
 * @returns {CheckResult}
 */
export function checkConfig(meeseeksDir) {
  try {
    const { created, path: file } = initConfig(meeseeksDir);
    return check('config', true, created ? `scaffolded ${file}` : `loaded ${file}`, 'Nothing to do.');
  } catch (error) {
    const message = error instanceof ConfigError ? error.message : /** @type {Error} */ (error).message;
    return check('config', false, message, 'Fix or delete .meeseeks/config.json and let `meeseeks init` scaffold a fresh one.');
  }
}

/**
 * Is the run's own state directory tracked by git?
 *
 * **Measured, and the symptom was almost invisible.** A dogfood target had `.meeseeks/` committed
 * during staging. The operator then rewrote `config.json` — uncapped ceilings, more iterations —
 * and relaunched after a `git reset --hard`. The reset silently restored the *committed* config,
 * and the run executed with the old settings; the only visible sign was the iteration count in
 * the banner. `.gitignore` cannot help a file that is already tracked, and the driver's own
 * `ensureMeeseeksIgnored` was defeated the same way.
 *
 * Tracked state also means every iteration's `git add -A` commits the ratchet, the reports and
 * the archived briefs — and every hard reset reverts them, which is the archive-destruction
 * failure family (0.105.0) wearing new clothes.
 *
 * **Blocking, because every run in such a repository misbehaves**, and the fix is one command.
 *
 * The one check that accepts an asynchronous probe as well as the plain one, because the
 * driver's direct-launch path runs it through the async `shell` while preflight proper still
 * uses `defaultProbe`. `await` passes a plain result through unchanged.
 *
 * @param {(command: string, args: string[]) => ReturnType<Probe> | Promise<ReturnType<Probe>>} probe
 * @returns {Promise<CheckResult>}
 */
export async function checkStateNotTracked(probe) {
  const result = await probe('git', ['ls-files', '.meeseeks']);
  if (!result.ok) {
    // No git or not a repository: `git-repository` reports that properly; this check has no
    // opinion of its own about a tree git cannot describe.
    return check('state-not-tracked', true, 'git could not list files here; see git-repository', 'Nothing to do.');
  }
  const tracked = result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return check(
    'state-not-tracked',
    tracked.length === 0,
    tracked.length === 0
      ? 'the run state directory is not tracked'
      : `.meeseeks/ is tracked (${tracked.length} file(s), e.g. ${tracked[0]}). Every hard reset will revert ` +
          'the ratchet and the configuration to stale copies, and every iteration will commit run state',
    'Run: git rm -r --cached .meeseeks && git commit -m "untrack run state" - the files stay on disk.',
  );
}

/**
 * Is another driver already running against this repository?
 *
 * Measured on 13 August 2026: two drivers on one tree, each able to `git reset --hard` it and
 * commit over the other, and the second run's result was void. The re-entrancy guard does not
 * cover this — it refuses a *nested* run, which is a different thing.
 *
 * **A lock whose pid is alive refuses the run; a lock whose pid is dead is stale and does not.**
 * That asymmetry is the whole design. HANDOFF names the trap in it: "is this pid alive" is not
 * the same question as "is this pid *my* driver" once a reboot recycles pids, and there is no
 * portable way to ask the second one. So this can refuse a run that should have started. The
 * cost of that is one `rm` on a path the message names; the cost of the other mistake was an
 * entire run whose log means nothing. Refusing is the cheap error, and a stale lock left by a
 * killed driver clears itself rather than locking the repository forever.
 *
 * @param {string} meeseeksDir
 * @param {{ isAlive?: (pid: number) => boolean, self?: number }} [options]
 * @returns {CheckResult}
 */
export function checkNoConcurrentRun(meeseeksDir, options = {}) {
  const isAlive = options.isAlive ?? pidIsAlive;
  const self = options.self ?? process.pid;
  const lockPath = path.join('.meeseeks', RUN_LOCK_FILE);
  /** @type {ReturnType<typeof readRunLock>} */
  let lock;
  try {
    lock = readRunLock(meeseeksDir);
  } catch (error) {
    // Unreadable is not free. See `readRunLock`: a lock that will not parse is not evidence
    // that nobody holds one.
    return check('no-concurrent-run', false, /** @type {Error} */ (error).message, `Delete ${lockPath} if no driver is running.`);
  }
  if (lock === null) return check('no-concurrent-run', true, 'no other driver holds this repository', 'Nothing to do.');
  if (lock.pid === self) {
    return check('no-concurrent-run', true, `this process (${self}) already holds the lock`, 'Nothing to do.');
  }
  if (!isAlive(lock.pid)) {
    return check(
      'no-concurrent-run',
      true,
      `a previous driver (pid ${lock.pid}${lock.startedAt === '' ? '' : `, started ${lock.startedAt}`}) left a stale lock; it is not running`,
      'Nothing to do.',
    );
  }
  return check(
    'no-concurrent-run',
    false,
    `driver pid ${lock.pid}${lock.startedAt === '' ? '' : `, started ${lock.startedAt}`} is still running against this repository`,
    `Wait for it, or stop it and check the kill took — SIGTERM has failed to stop a driver here and -9 did. ` +
      `Then delete ${lockPath} if it remains.`,
  );
}

/**
 * The static half of the safety story (DESIGN.md §3.6).
 *
 * @param {string} cwd
 * @returns {CheckResult}
 */
export function checkAgentSurface(cwd) {
  const { findings, filesScanned } = scanAgentSurface(cwd);
  const blocking = blockingFindings(findings);
  const warnings = findings.filter((finding) => finding.severity === 'warn');
  const summary =
    blocking.length === 0
      ? `scanned ${filesScanned} file(s), no blocking findings` +
        (warnings.length > 0 ? `\n${formatFindings(warnings)}` : '')
      : `scanned ${filesScanned} file(s)\n${formatFindings(findings)}`;
  return check(
    'agent-surface',
    blocking.length === 0,
    summary,
    'Remove the offending hook, instruction, MCP entry or credential. meeseeks runs unattended with permissions ' +
      'skipped, so it trusts this repository completely.',
  );
}

/**
 * The premise, acknowledged (DESIGN.md §3.5, final row).
 *
 * @param {{ yes: boolean, interactive: boolean }} options
 * @returns {CheckResult}
 */
export function checkDangerAcknowledged(options) {
  return check(
    'danger-acknowledged',
    options.yes,
    options.yes
      ? '--dangerously-skip-permissions acknowledged'
      : 'the builder runs with --dangerously-skip-permissions and this run has not been acknowledged',
    options.interactive
      ? 'Confirm when prompted, or pass --yes.'
      : 'Pass --yes. Unattended runs cannot ask, and the guard hook is the only limit that remains.',
  );
}

/**
 * Where an ERD lives, if there is one.
 *
 * A convention (`ERD.md` beside the PRD) or a config key, in that order of cheapness: a file the
 * operator can see beats a setting they have to remember. Returns `null` when neither exists, which
 * is the ordinary case — an ERD is optional and its absence is not a finding.
 *
 * @param {string} cwd
 * @param {string | undefined} configured the `erd` config key, if set
 * @returns {string | null} an absolute path, or null
 */
export function erdPath(cwd, configured) {
  if (typeof configured === 'string' && configured.trim() !== '') {
    return path.isAbsolute(configured) ? configured : path.join(cwd, configured);
  }
  const conventional = path.join(cwd, 'ERD.md');
  return existsSync(conventional) ? conventional : null;
}

/**
 * Does the ERD agree with the specification it refines?
 *
 * **You do not build against an inconsistent specification.** An ERD that names an entity the PRD
 * never mentions is the diagram inventing a requirement, and finding that out four iterations in
 * costs four iterations — so it is caught at the door.
 *
 * Three outcomes, and the middle one is the ordinary one. No ERD: nothing to check, and the check
 * says so rather than passing silently, because a run that quietly ignored a misspelled `erd` path
 * would report a clean preflight and gate nothing. An unreadable ERD: blocking, because an input
 * this run is meant to be held to must not be half-read. An over-reaching ERD: blocking, naming the
 * entities.
 *
 * **What this does not check is a contradiction in *content*.** The PRD is prose and the ERD is a
 * diagram; nothing deterministic compares "orders may not be deleted once shipped" against a
 * cardinality. The item asks for it and the honest position is that only the over-reach half is
 * mechanically decidable — the rest belongs to the design auditor, which reads both.
 *
 * @param {string} cwd
 * @param {string | null} specificationText the PRD's text, or null when there is not one yet
 * @param {string | undefined} configured the `erd` config key
 * @param {{ readFile?: (file: string) => string }} [io]
 * @returns {CheckResult}
 */
export function checkErdConsistency(cwd, specificationText, configured, io = {}) {
  const read = io.readFile ?? ((file) => readFileSync(file, 'utf8'));
  const file = erdPath(cwd, configured);
  if (file === null) {
    return check('erd', true, 'no ERD supplied; the schema is not gated', 'Nothing to do.', false);
  }
  /** @type {import('./erd.mjs').Erd} */
  let erd;
  try {
    erd = parseErd(read(file));
  } catch (error) {
    return check(
      'erd',
      false,
      `${path.relative(cwd, file)} could not be read: ${/** @type {Error} */ (error).message}`,
      'Fix the diagram, or remove it. A schema gate cannot be built from a diagram nobody can read.',
    );
  }
  if (typeof specificationText !== 'string' || specificationText.trim() === '') {
    // A check that cannot run is a failure, not a skip. An ERD is an input this run would be gated
    // on, and admitting one nothing has been able to validate is how a run ends up enforcing a
    // schema nobody asked for. The remedy names both ways out, because either is legitimate.
    return check(
      'erd',
      false,
      `${path.relative(cwd, file)} was supplied, but there is no specification to check it against`,
      'Supply the PRD this ERD refines, or remove the ERD. An ERD is a refinement of a specification, ' +
        'and there is nothing to refine yet.',
    );
  }
  const unmentioned = unmentionedEntities(erd, specificationText);
  if (unmentioned.length > 0) {
    return check(
      'erd',
      false,
      `the ERD declares ${unmentioned.join(', ')}, which the specification never mentions`,
      'Name them in the PRD, or remove them from the ERD. An entity that exists only in the diagram is ' +
        'the diagram inventing a requirement, and the run would be gated on something nobody asked for.',
    );
  }
  return check(
    'erd',
    true,
    `${path.relative(cwd, file)}: ${erd.entities.length} entities, ${erd.relationships.length} relationships`,
    'Nothing to do.',
  );
}

/**
 * Run every preflight check.
 *
 * @param {{
 *   cwd: string,
 *   yes?: boolean,
 *   interactive?: boolean,
 *   nodeVersion?: string,
 *   probe?: Probe,
 *   meeseeksDir?: string,
 *   sandbox?: boolean,
 *   specification?: string | null,
 *   erd?: string,
 * }} options
 * @returns {Promise<{ ok: boolean, checks: CheckResult[], failures: CheckResult[] }>}
 */
export async function runPreflight(options) {
  const cwd = options.cwd;
  const probe = options.probe ?? defaultProbe(cwd);
  const meeseeksDir = options.meeseeksDir ?? path.join(cwd, '.meeseeks');

  const checks = [
    checkNodeVersion(options.nodeVersion ?? process.versions.node),
    checkClaudeCli(probe),
    checkGitRepository(probe),
    checkHasCommits(probe),
    checkCleanWorkingTree(probe),
    checkRemoteIsNotProduction(probe),
    checkNetwork(probe),
    checkConfig(meeseeksDir),
    checkNoConcurrentRun(meeseeksDir),
    await checkStateNotTracked(probe),
    checkSandboxAvailable(probe, options.sandbox ?? false),
    checkAgentSurface(cwd),
    checkErdConsistency(cwd, options.specification ?? null, options.erd),
    checkDangerAcknowledged({ yes: options.yes ?? false, interactive: options.interactive ?? false }),
  ];

  const failures = checks.filter((result) => !result.ok && result.blocking);
  return { ok: failures.length === 0, checks, failures };
}

/**
 * Render a preflight result for a terminal. Plain and unstyled: this is failure output
 * (DESIGN.md §9).
 *
 * @param {{ ok: boolean, checks: CheckResult[], failures: CheckResult[] }} result
 * @returns {string}
 */
export function formatPreflight(result) {
  const lines = result.checks.map((entry) => `${entry.ok ? 'ok  ' : 'FAIL'} ${entry.name}: ${entry.detail}`);
  if (result.failures.length > 0) {
    lines.push('', 'preflight failed. Fix these before starting a run:');
    for (const failure of result.failures) lines.push(`  ${failure.name}: ${failure.fix}`);
  }
  return lines.join('\n');
}
