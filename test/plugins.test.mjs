/**
 * Tests for quality-plugin auto-install (DESIGN.md §5).
 *
 * The install and detect commands are driven through an injected runner that records what
 * it was asked to do, so the decisions under test — install or skip, abort or warn, gate
 * armed or not — are exercised without reaching the network.
 *
 * Frontend detection moved to `test/capabilities.test.mjs` along with the code.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { OPENAPI_DOC } from '../scripts/driver.mjs';
import {
  DETECT_TIMEOUT_MS,
  defaultRunner,
  INSTALL_TIMEOUT_MS,
  KNOWN_PLUGINS,
  PLUGIN_VERSIONS,
  PluginInstallError,
  installQualityPlugins,
  resolvePlugin,
} from '../scripts/plugins.mjs';

/** @type {string[]} */
const temporaryDirs = [];

/**
 * @param {Record<string, string>} [files]
 * @returns {string}
 */
function makeProject(files = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-plugins-'));
  temporaryDirs.push(dir);
  for (const [relative, contents] of Object.entries(files)) {
    const full = path.join(dir, relative);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, contents, 'utf8');
  }
  return dir;
}

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * A runner that answers from a table and records every invocation.
 *
 * @param {Record<string, { ok: boolean, status?: number, stdout?: string, stderr?: string }>} table
 *        keyed by the joined command line
 * @returns {{ runner: import('../scripts/plugins.mjs').Runner, calls: string[] }}
 */
function fakeRunner(table) {
  /** @type {string[]} */
  const calls = [];
  /** @type {import('../scripts/plugins.mjs').Runner} */
  const runner = (command, args) => {
    const line = [command, ...args].join(' ');
    calls.push(line);
    const answer = table[line] ?? { ok: false, status: 127, stderr: 'command not found' };
    return {
      ok: answer.ok,
      status: answer.status ?? (answer.ok ? 0 : 1),
      stdout: answer.stdout ?? '',
      stderr: answer.stderr ?? '',
    };
  };
  return { runner, calls };
}

const DETECT = 'npx --no-install impeccable --version';
const INSTALL = `npx -y impeccable@${PLUGIN_VERSIONS.impeccable} install`;

describe('installQualityPlugins', () => {
  it('installs a plugin that is not present yet', async () => {
    const cwd = makeProject({ 'index.html': '<!doctype html>\n' });
    const { runner, calls } = fakeRunner({ [DETECT]: { ok: false }, [INSTALL]: { ok: true } });
    const result = await installQualityPlugins({ cwd, plugins: ['impeccable'], runner });
    assert.deepStrictEqual(result.installed, ['impeccable']);
    assert.deepStrictEqual(result.skipped, []);
    assert.deepStrictEqual(calls, [DETECT, INSTALL]);
  });

  it('skips a plugin that is already installed, and does not run the installer', async () => {
    const cwd = makeProject({ 'index.html': '<!doctype html>\n' });
    const { runner, calls } = fakeRunner({ [DETECT]: { ok: true, stdout: '1.0.0' } });
    const result = await installQualityPlugins({ cwd, plugins: ['impeccable'], runner });
    assert.deepStrictEqual(result.skipped, ['impeccable']);
    assert.deepStrictEqual(result.installed, []);
    assert.deepStrictEqual(calls, [DETECT]);
  });

  it('carries the gate with its arming condition rather than resolving it', async () => {
    const cwd = makeProject({ 'index.html': '<!doctype html>\n' });
    const { runner } = fakeRunner({ [DETECT]: { ok: true } });
    const result = await installQualityPlugins({ cwd, plugins: ['impeccable'], runner });
    assert.deepStrictEqual(result.gates, [
      {
        plugin: 'impeccable',
        command: ['npx', `impeccable@${PLUGIN_VERSIONS.impeccable}`, 'detect', '--json', 'src/'],
        capability: 'web-ui',
        interpret: 'design-slop',
      },
    ]);
  });

  it('still carries a frontend-only gate on a repository that has no frontend yet', async () => {
    // The bug this defends against shipped, and it silently disabled the design gate for
    // every greenfield run. Provisioning happens once, after the design phase and before the
    // builder has written a line, so the repository is a PRD and some docs. Resolving
    // `hasFrontend` there answers "no" for a React application that does not exist yet, and
    // the gate never armed for the rest of the run.
    //
    // The decision now belongs to the caller, which re-asks each iteration against the tree
    // as it actually is. DESIGN.md §5.1's carve-out is unchanged - a genuine non-UI project
    // still skips - it is only decided at a moment when the answer can be true.
    const cwd = makeProject({ 'PRD.md': '# Build a React dashboard\n' });
    const { runner } = fakeRunner({ [DETECT]: { ok: true } });
    const result = await installQualityPlugins({ cwd, plugins: ['impeccable'], runner });
    assert.deepStrictEqual(result.gates, [
      {
        plugin: 'impeccable',
        command: ['npx', `impeccable@${PLUGIN_VERSIONS.impeccable}`, 'detect', '--json', 'src/'],
        capability: 'web-ui',
        interpret: 'design-slop',
      },
    ]);
    assert.deepStrictEqual(result.warnings, []);
  });

  it('marks a plugin that inspects any codebase as not frontend-only', async () => {
    const cwd = makeProject({ 'package.json': '{"name":"api"}\n' });
    const { runner } = fakeRunner({ ['npx --no-install knip --version']: { ok: true } });
    const result = await installQualityPlugins({ cwd, plugins: ['knip'], runner });
    assert.equal(result.gates.length, 1);
    assert.equal(result.gates[0].capability, undefined);
  });

  it('warns rather than aborting when an optional detector will not install', async () => {
    // semgrep needs python3 and a reachable registry. Neither is worth killing a run over,
    // and unlike impeccable it does not carry a definition-of-done line on its own.
    const cwd = makeProject({ 'package.json': '{"name":"api"}\n' });
    const { runner } = fakeRunner({
      ['semgrep --version']: { ok: false },
      ['python3 -m pip install --user --quiet semgrep']: { ok: false, stderr: 'no python3' },
    });
    const result = await installQualityPlugins({ cwd, plugins: ['semgrep'], runner });
    assert.deepStrictEqual(result.gates, []);
    assert.equal(result.warnings.length, 1);
    assert.equal(result.warnings[0].includes('semgrep'), true);
  });

  it('aborts when a required plugin will not install', async () => {
    const cwd = makeProject({ 'index.html': '<!doctype html>\n' });
    const { runner } = fakeRunner({ [DETECT]: { ok: false }, [INSTALL]: { ok: false, stderr: 'network is down' } });
    await assert.rejects(
      () => installQualityPlugins({ cwd, plugins: ['impeccable'], runner }),
      (error) =>
        error instanceof PluginInstallError &&
        error.message.includes('network is down') &&
        error.message.includes('definition-of-done'),
    );
  });

  it('refuses a plugin it does not know how to install', async () => {
    const cwd = makeProject();
    const { runner, calls } = fakeRunner({});
    await assert.rejects(() => installQualityPlugins({ cwd, plugins: ['mystery-plugin'], runner }), PluginInstallError);
    assert.deepStrictEqual(calls, [], 'must not shell out before it knows what it is running');
  });

  it('does nothing when no plugins are configured', async () => {
    const { runner, calls } = fakeRunner({});
    const result = await installQualityPlugins({ cwd: makeProject(), plugins: [], runner });
    assert.deepStrictEqual(result, { installed: [], skipped: [], warnings: [], gates: [] });
    assert.deepStrictEqual(calls, []);
  });
});

describe('resolvePlugin', () => {
  it('returns the spec for a known plugin', () => {
    assert.equal(resolvePlugin('impeccable'), KNOWN_PLUGINS.impeccable);
  });

  it('names the plugins it does know', () => {
    assert.throws(
      () => resolvePlugin('nope'),
      (error) => error instanceof PluginInstallError && error.message.includes('impeccable'),
    );
  });

  it('marks impeccable required and frontend-only', () => {
    assert.equal(KNOWN_PLUGINS.impeccable.required, true);
    // REVIEW F13: armed by the run's monotonic capability set, not by a detector on the current tree.
    assert.equal(KNOWN_PLUGINS.impeccable.capability, 'web-ui');
  });
});

// R18. The API-shaped oracle's plumbing: a schema-driven fuzzer, armed by the `api`
// capability, degrading to a warning like knip and semgrep rather than blocking a run.
describe('the schemathesis plugin', () => {
  const spec = KNOWN_PLUGINS.schemathesis;

  it('is optional, so an unprovisionable Python tool warns rather than ending a run', () => {
    assert.equal(spec.required, false);
  });

  it('is armed by the api capability, which is now the only arming mechanism', () => {
    assert.equal(spec.capability, 'api');
  });

  // Every element of this argv was executed against schemathesis 3.39.16, which is the rule
  // HANDOFF.md's argv defect bought: a correct-looking array is worth nothing until the other
  // binary has parsed it. A well-formed schema exits 0; one with an invalid parameter type
  // exits 1.
  it('runs --dry-run, which is what lets it be a gate with no application running', () => {
    assert.deepStrictEqual(spec.gate, ['schemathesis', 'run', '--dry-run', '-c', 'all', 'docs/openapi.yaml']);
  });

  it('reads the one canonical schema path, so the docs gate and the fuzzer cannot drift', () => {
    assert.equal(spec.gate?.includes(OPENAPI_DOC), true, `${spec.gate?.join(' ')} does not name ${OPENAPI_DOC}`);
  });

  it('installs the same way semgrep does, which is the precedent for a Python gate', () => {
    assert.deepStrictEqual(spec.install, [
      'python3',
      '-m',
      'pip',
      'install',
      '--user',
      '--quiet',
      `schemathesis==${PLUGIN_VERSIONS.schemathesis}`,
    ]);
  });
});

describe('provisioning commands have a deadline (REVIEW F41)', () => {
  /** @param {{ cwd: string, timeoutMs?: number }[]} seen @returns {import('../scripts/plugins.mjs').Runner} */
  const recording = (seen) => (command, args, options) => {
    seen.push(options);
    // Detected and already present, so the install branch is only reached where a test wants it.
    return { ok: true, status: 0, stdout: '1.0.0', stderr: '' };
  };

  it('bounds detection, which is meant to answer instantly', async () => {
    // **Provisioning had no deadline at all.** It runs before the loop and before the operator's
    // wall clock, so `npx --no-install` resolving an unreachable registry hung the whole run with no
    // gate result and no receipt — an unattended run started at midnight would still be sitting
    // there in the morning.
    /** @type {{ cwd: string, timeoutMs?: number }[]} */
    const seen = [];
    await installQualityPlugins({ cwd: '/tmp', plugins: ['knip'], runner: recording(seen) });
    assert.equal(seen.length > 0, true, 'no command was run, so nothing was bounded');
    for (const options of seen) {
      assert.equal(options.timeoutMs, DETECT_TIMEOUT_MS, 'a detection ran without a deadline');
    }
  });

  it('bounds installation, with the longer ceiling a real download needs', async () => {
    /** @type {{ cwd: string, timeoutMs?: number }[]} */
    const seen = [];
    let call = 0;
    await installQualityPlugins({
      cwd: '/tmp',
      plugins: ['knip'],
      runner: (command, args, options) => {
        seen.push(options);
        call += 1;
        // Absent on detection, so the install branch runs.
        return call === 1
          ? { ok: false, status: 1, stdout: '', stderr: 'not found' }
          : { ok: true, status: 0, stdout: 'installed', stderr: '' };
      },
    });
    assert.equal(seen.length >= 2, true, `expected a detect and an install, saw ${seen.length}`);
    assert.equal(seen[0].timeoutMs, DETECT_TIMEOUT_MS);
    assert.equal(seen[1].timeoutMs, INSTALL_TIMEOUT_MS);
  });

  it('gives installation the longer of the two, because only it may legitimately take minutes', () => {
    // Asserted as values so an edit that quietly drops the install ceiling to the detect one — which
    // would fail every real download — is a test failure rather than a broken overnight run.
    assert.equal(DETECT_TIMEOUT_MS, 60_000);
    assert.equal(INSTALL_TIMEOUT_MS, 10 * 60_000);
    assert.equal(INSTALL_TIMEOUT_MS > DETECT_TIMEOUT_MS, true);
  });

  it('passes the deadline through to the real runner', () => {
    // The wiring, not the constant. `defaultRunner` translates it into `execFileSync`'s own timeout,
    // which kills the child rather than merely giving up on waiting for it.
    const source = readFileSync(new URL('../scripts/plugins.mjs', import.meta.url), 'utf8');
    const runner = source.slice(source.indexOf('export function defaultRunner('), source.indexOf('export function resolvePlugin'));
    assert.equal(runner.includes('timeout: options.timeoutMs'), true, 'the runner ignores the deadline it is given');
  });
});


describe('a provisioning deadline that fires is reported as a deadline (REVIEW F41)', () => {
  // **The ceilings landed and the caller discarded the verdict.** `timedOut` was never read, so a
  // detection that hung for its full 60s was indistinguishable from "the tool is not installed" —
  // and the code escalated straight into a ten-minute install attempt. The operator saw eleven
  // minutes of silence and then `exit 1`: the hang the deadline exists to prevent, wearing the
  // report of a missing package.

  /** @param {{ detectTimedOut?: boolean, installTimedOut?: boolean }} shape */
  const runner = (shape) => {
    /** @type {string[][]} */
    const calls = [];
    /** @type {import('../scripts/plugins.mjs').Runner} */
    const run = (command, args) => {
      calls.push([command, ...args]);
      const install = calls.length > 1;
      if (!install && shape.detectTimedOut === true) {
        return { ok: false, status: 1, stdout: '', stderr: '', timedOut: true };
      }
      if (install && shape.installTimedOut === true) {
        return { ok: false, status: 1, stdout: '', stderr: '', timedOut: true };
      }
      return install
        ? { ok: true, status: 0, stdout: 'installed', stderr: '' }
        : { ok: false, status: 1, stdout: '', stderr: 'not found' };
    };
    return { run, calls };
  };

  it('does not escalate a hung detection into an install', async () => {
    const { run, calls } = runner({ detectTimedOut: true });

    const result = await installQualityPlugins({ cwd: '/tmp', plugins: ['knip'], runner: run });

    assert.equal(calls.length, 1, `a hung detection still triggered an install: ${JSON.stringify(calls)}`);
    assert.deepStrictEqual(result.installed, []);
    assert.equal(result.warnings.length, 1, JSON.stringify(result.warnings));
    assert.equal(result.warnings[0].includes('did not finish within'), true, result.warnings[0]);
    assert.equal(result.warnings[0].includes('not read as absent'), true, result.warnings[0]);
  });

  it('reports a hung install as a deadline rather than as an exit code', async () => {
    const { run } = runner({ installTimedOut: true });

    const result = await installQualityPlugins({ cwd: '/tmp', plugins: ['knip'], runner: run });

    assert.deepStrictEqual(result.installed, []);
    assert.equal(result.warnings[0].includes('did not finish within'), true, result.warnings[0]);
    assert.equal(result.warnings[0].includes('exit 1'), false, 'a timeout was reported as an ordinary failure');
  });

  it('still installs when nothing timed out, which is the ordinary path', async () => {
    // The neighbour. Reading `timedOut` must not make an honest absence look like a hang.
    const { run, calls } = runner({});

    const result = await installQualityPlugins({ cwd: '/tmp', plugins: ['knip'], runner: run });

    assert.equal(calls.length, 2, JSON.stringify(calls));
    assert.deepStrictEqual(result.installed, ['knip']);
    assert.deepStrictEqual(result.warnings, []);
  });
});

describe('a detect-only plugin (PLAN item 29)', () => {
  const GITLEAKS_DETECT = 'gitleaks version';
  const GITLEAKS_GATE = [
    'gitleaks',
    'dir',
    '--report-format',
    'json',
    '--report-path',
    '-',
    '--redact',
    '--no-banner',
    '.',
  ];

  it('contributes its gate when the binary is present', async () => {
    const cwd = makeProject({ 'package.json': '{"name":"app"}\n' });
    const { runner, calls } = fakeRunner({ [GITLEAKS_DETECT]: { ok: true, stdout: '8.30.1' } });
    const result = await installQualityPlugins({ cwd, plugins: ['gitleaks'], runner });
    assert.deepStrictEqual(result.gates, [
      { plugin: 'gitleaks', command: GITLEAKS_GATE, interpret: 'gitleaks' },
    ]);
    assert.deepStrictEqual(result.warnings, []);
    // Detected and therefore not installed — and nothing else was run.
    assert.deepStrictEqual(calls, [GITLEAKS_DETECT]);
    assert.deepStrictEqual(result.skipped, ['gitleaks']);
  });

  it('warns and contributes no gate when the binary is absent, without inventing an installer', async () => {
    // The gate must not survive the absence. A gate whose command is not on PATH fails with
    // "command not found" every iteration, which reads to a builder as a defect in its own code.
    const cwd = makeProject({ 'package.json': '{"name":"app"}\n' });
    const { runner, calls } = fakeRunner({ [GITLEAKS_DETECT]: { ok: false } });
    const result = await installQualityPlugins({ cwd, plugins: ['gitleaks'], runner });
    assert.deepStrictEqual(result.gates, []);
    assert.deepStrictEqual(result.installed, []);
    // Exactly one command ran: the detection. No install was attempted or guessed.
    assert.deepStrictEqual(calls, [GITLEAKS_DETECT]);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /^quality plugin gitleaks is not installed and has no cross-platform install command/);
    // Silence is the failure mode here: a check that vanishes reads exactly like one that passed.
    assert.match(result.warnings[0], /this run has no gitleaks gate/);
  });

  it('refuses to register a required plugin that has no installer', async () => {
    // A required plugin contributes a definition-of-done line. One that cannot be provisioned when
    // absent would let a run reach its gates having silently dropped that line, which is the shape
    // DESIGN.md section 5 refuses. Caught at resolution rather than at gate time.
    const contradiction = { ...KNOWN_PLUGINS.gitleaks, required: true };
    const original = KNOWN_PLUGINS.gitleaks;
    try {
      /** @type {Record<string, unknown>} */ (KNOWN_PLUGINS).gitleaks = contradiction;
      assert.throws(
        () => resolvePlugin('gitleaks'),
        (error) => error instanceof PluginInstallError && error.message.includes('required with no install command'),
      );
    } finally {
      /** @type {Record<string, unknown>} */ (KNOWN_PLUGINS).gitleaks = original;
    }
  });

  it('is registered optional, with no capability, and named as detect-only', () => {
    // Asserted as values because each one is a decision: optional because it cannot be installed,
    // uncapability'd because a committed credential is a defect in every project shape, and
    // `install: null` because no cross-platform argv exists.
    const spec = resolvePlugin('gitleaks');
    assert.equal(spec.required, false);
    assert.equal(spec.capability, undefined);
    assert.equal(spec.install, null);
    assert.equal(spec.interpret, 'gitleaks');
    // `detect`, not `dir`, is what a version check must not be: the subcommand gitleaks removed.
    assert.deepStrictEqual(spec.detect, ['gitleaks', 'version']);
    assert.equal(spec.gate?.includes('detect'), false);
  });
});

describe('every installer the Driver runs is version pinned (PLAN item 29)', () => {
  it('pins each install argv to the version the registry declares', () => {
    // Structural, not per-plugin: a new plugin added without a pin fails this without anybody
    // remembering to extend a list. That is the same failure mode the guard hook's positional rule
    // exists for -- an enumeration defaults each new entry to the unsafe side.
    for (const [name, spec] of Object.entries(KNOWN_PLUGINS)) {
      if (spec.install === null) continue;
      const pin = /** @type {Record<string, string>} */ (PLUGIN_VERSIONS)[name];
      assert.equal(
        typeof pin,
        'string',
        `${name} has an install command but no entry in PLUGIN_VERSIONS, so it resolves whatever is ` +
          'newest at run time and two runs a week apart are judged by different tools.',
      );
      const pinned = spec.install.filter((part) => part.includes(`@${pin}`) || part.includes(`==${pin}`));
      assert.equal(pinned.length, 1, `${name}'s install argv does not pin ${pin}: ${spec.install.join(' ')}`);
    }
  });

  it('pins impeccable in its gate as well as its installer', () => {
    // Pinning one and not the other is worse than pinning neither: `install` puts skills into the
    // project while the gate resolves the CLI through npx's own cache, so an unpinned gate can run
    // a different version from the one installed minutes earlier -- while reading as reproducible.
    const spec = resolvePlugin('impeccable');
    const pin = PLUGIN_VERSIONS.impeccable;
    assert.equal(/** @type {string[]} */ (spec.gate).includes(`impeccable@${pin}`), true);
    assert.equal(/** @type {string[]} */ (spec.install).includes(`impeccable@${pin}`), true);
  });

  it('has no pin for the detect-only plugin, because nothing installs it', () => {
    assert.equal(resolvePlugin('gitleaks').install, null);
    assert.equal(Object.hasOwn(PLUGIN_VERSIONS, 'gitleaks'), false);
  });
});

describe('defaultRunner reports a fired deadline as one (REVIEW F41)', () => {
  it('distinguishes a killed command from a command that exited non-zero', () => {
    // The exported fallback flattened both into `{ ok: false }` with no `timedOut`, which made
    // `installQualityPlugins`' timeout branch unreachable through it — a sixty-second hang read as
    // "the tool is not installed", then escalated into a ten-minute install attempt. Production
    // injects the Driver's bounded `shell` and was never affected; an exported contract that is
    // wrong for the one caller who does not override it is a defect waiting for its second caller.
    /** `defaultRunner` is synchronous; the `Runner` type allows async, so the narrowing is stated. */
    const sync = (/** @type {string[]} */ argv, /** @type {number} */ timeoutMs) =>
      /** @type {import('../scripts/plugins.mjs').RunResult} */ (
        /** @type {unknown} */ (defaultRunner('sh', argv, { cwd: process.cwd(), timeoutMs }))
      );

    const timedOut = sync(['-c', 'sleep 5'], 300);
    assert.equal(timedOut.ok, false);
    assert.equal(timedOut.timedOut, true);

    // The neighbour, and it is the whole assertion: an ordinary failure must **not** claim to have
    // timed out, or every failed detection would escalate as a hang.
    const failed = sync(['-c', 'exit 3'], 30_000);
    assert.equal(failed.ok, false);
    assert.equal(failed.status, 3);
    assert.equal(failed.timedOut, undefined);

    const passed = sync(['-c', 'echo fine'], 30_000);
    assert.equal(passed.ok, true);
    assert.equal(passed.timedOut, undefined);
  });
});
