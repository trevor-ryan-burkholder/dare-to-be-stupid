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
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { OPENAPI_DOC } from '../scripts/driver.mjs';
import { KNOWN_PLUGINS, PluginInstallError, installQualityPlugins, resolvePlugin } from '../scripts/plugins.mjs';

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
const INSTALL = 'npx -y impeccable install';

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
      { plugin: 'impeccable', command: ['npx', 'impeccable', 'detect', 'src/'], frontendOnly: true },
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
      { plugin: 'impeccable', command: ['npx', 'impeccable', 'detect', 'src/'], frontendOnly: true },
    ]);
    assert.deepStrictEqual(result.warnings, []);
  });

  it('marks a plugin that inspects any codebase as not frontend-only', async () => {
    const cwd = makeProject({ 'package.json': '{"name":"api"}\n' });
    const { runner } = fakeRunner({ ['npx --no-install knip --version']: { ok: true } });
    const result = await installQualityPlugins({ cwd, plugins: ['knip'], runner });
    assert.equal(result.gates.length, 1);
    assert.equal(result.gates[0].frontendOnly, false);
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
    assert.equal(KNOWN_PLUGINS.impeccable.frontendOnly, true);
  });
});

// R18. The API-shaped oracle's plumbing: a schema-driven fuzzer, armed by the `api`
// capability, degrading to a warning like knip and semgrep rather than blocking a run.
describe('the schemathesis plugin', () => {
  const spec = KNOWN_PLUGINS.schemathesis;

  it('is optional, so an unprovisionable Python tool warns rather than ending a run', () => {
    assert.equal(spec.required, false);
  });

  it('is armed by the api capability rather than by the ad-hoc frontend flag', () => {
    assert.equal(spec.capability, 'api');
    assert.equal(spec.frontendOnly, false);
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
    assert.deepStrictEqual(spec.install, ['python3', '-m', 'pip', 'install', '--user', '--quiet', 'schemathesis']);
  });
});
