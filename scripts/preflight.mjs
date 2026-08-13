/**
 * Preflight (DESIGN.md §3.5).
 *
 * The goal is that the only things an operator does are install the plugin, be in a repo,
 * and run `/dare`. Everything else is either checked and explained here, or installed by
 * the run itself. Preflight runs *before* the driver and fails loud rather than starting a
 * half-configured unattended run.
 *
 * Every check reports `ok`, a human `detail`, and a `fix`. All checks are attempted even
 * after one fails, so the operator sees every problem at once rather than discovering them
 * one restart at a time. A check that cannot be performed is a failure, never a skip.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { ConfigError, initConfig, riskyRemoteWord } from './config.mjs';
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
 * @param {Probe} probe
 * @returns {CheckResult}
 */
export function checkClaudeCli(probe) {
  const result = probe('claude', ['--version']);
  return check(
    'claude-cli',
    result.ok,
    result.ok ? `claude ${result.stdout.trim()}` : `claude could not be run: ${result.stderr.trim()}`,
    'Install the Claude Code CLI and sign in; the driver spawns `claude -p` children and inherits that auth.',
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
    'Run `dare` from inside a git repository; the ratchet resets to commits and cannot work without one.',
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
 * Is this porcelain line dare's own run state rather than the operator's work?
 *
 * `git status --porcelain` emits two status characters, a space, then the path.
 *
 * @param {string} line
 * @returns {boolean}
 */
function isDareOwned(line) {
  const target = line.slice(3).trim().replace(/^"|"$/g, '');
  return target === '.dare' || target === '.dare/' || target.startsWith('.dare/');
}

/**
 * The check exists to stop the ratchet's `git reset --hard` from destroying work the
 * operator has not committed. `.dare/` is not that work — it is the run's own state, which
 * preflight scaffolds itself.
 *
 * Counting it made preflight unpassable: the first run writes `.dare/config.json`, and
 * every run after that failed on the file the previous run had created. An untracked
 * `.dare/` is also safe from `reset --hard`, which leaves untracked files alone.
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
    .filter((line) => !isDareOwned(line));
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
        'Point dare at a throwaway repository. It is pre-production only and never runs against anything with users.',
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
 * Scaffolds `.dare/config.json` when it is absent — the one check that fixes itself.
 *
 * @param {string} dareDir
 * @returns {CheckResult}
 */
export function checkConfig(dareDir) {
  try {
    const { created, path: file } = initConfig(dareDir);
    return check('config', true, created ? `scaffolded ${file}` : `loaded ${file}`, 'Nothing to do.');
  } catch (error) {
    const message = error instanceof ConfigError ? error.message : /** @type {Error} */ (error).message;
    return check('config', false, message, 'Fix or delete .dare/config.json and let `dare init` scaffold a fresh one.');
  }
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
 * @param {string} dareDir
 * @param {{ isAlive?: (pid: number) => boolean, self?: number }} [options]
 * @returns {CheckResult}
 */
export function checkNoConcurrentRun(dareDir, options = {}) {
  const isAlive = options.isAlive ?? pidIsAlive;
  const self = options.self ?? process.pid;
  const lockPath = path.join('.dare', RUN_LOCK_FILE);
  /** @type {ReturnType<typeof readRunLock>} */
  let lock;
  try {
    lock = readRunLock(dareDir);
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
    'Remove the offending hook, instruction, MCP entry or credential. dare runs unattended with permissions ' +
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
 * Run every preflight check.
 *
 * @param {{
 *   cwd: string,
 *   yes?: boolean,
 *   interactive?: boolean,
 *   nodeVersion?: string,
 *   probe?: Probe,
 *   dareDir?: string,
 * }} options
 * @returns {{ ok: boolean, checks: CheckResult[], failures: CheckResult[] }}
 */
export function runPreflight(options) {
  const cwd = options.cwd;
  const probe = options.probe ?? defaultProbe(cwd);
  const dareDir = options.dareDir ?? path.join(cwd, '.dare');

  const checks = [
    checkNodeVersion(options.nodeVersion ?? process.versions.node),
    checkClaudeCli(probe),
    checkGitRepository(probe),
    checkHasCommits(probe),
    checkCleanWorkingTree(probe),
    checkRemoteIsNotProduction(probe),
    checkNetwork(probe),
    checkConfig(dareDir),
    checkNoConcurrentRun(dareDir),
    checkAgentSurface(cwd),
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
