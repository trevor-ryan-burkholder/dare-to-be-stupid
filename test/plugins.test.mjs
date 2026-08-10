/**
 * Tests for quality-plugin auto-install (DESIGN.md §5).
 *
 * The install and detect commands are driven through an injected runner that records what
 * it was asked to do, so the decisions under test — install or skip, abort or warn, gate
 * armed or not — are exercised without reaching the network. `hasFrontend` reads real
 * directory trees, because a wrong answer there silently disarms a definition-of-done gate.
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import {
  KNOWN_PLUGINS,
  PluginInstallError,
  hasFrontend,
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
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dare-plugins-'));
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
  it('installs a plugin that is not present yet', () => {
    const cwd = makeProject({ 'index.html': '<!doctype html>\n' });
    const { runner, calls } = fakeRunner({ [DETECT]: { ok: false }, [INSTALL]: { ok: true } });
    const result = installQualityPlugins({ cwd, plugins: ['impeccable'], runner });
    assert.deepStrictEqual(result.installed, ['impeccable']);
    assert.deepStrictEqual(result.skipped, []);
    assert.deepStrictEqual(calls, [DETECT, INSTALL]);
  });

  it('skips a plugin that is already installed, and does not run the installer', () => {
    const cwd = makeProject({ 'index.html': '<!doctype html>\n' });
    const { runner, calls } = fakeRunner({ [DETECT]: { ok: true, stdout: '1.0.0' } });
    const result = installQualityPlugins({ cwd, plugins: ['impeccable'], runner });
    assert.deepStrictEqual(result.skipped, ['impeccable']);
    assert.deepStrictEqual(result.installed, []);
    assert.deepStrictEqual(calls, [DETECT]);
  });

  it('arms the gate when the repo has a frontend', () => {
    const cwd = makeProject({ 'index.html': '<!doctype html>\n' });
    const { runner } = fakeRunner({ [DETECT]: { ok: true } });
    const result = installQualityPlugins({ cwd, plugins: ['impeccable'], runner });
    assert.deepStrictEqual(result.gates, [{ plugin: 'impeccable', command: ['npx', 'impeccable', 'detect', 'src/'] }]);
  });

  it('skips the gate, with a warning, on a project with no user interface', () => {
    // DESIGN.md §5.1 caveat 1 — the one gate the spec allows to be skipped rather than failed.
    const cwd = makeProject({ 'package.json': '{"name":"api","dependencies":{"fastify":"^4"}}\n' });
    const { runner } = fakeRunner({ [DETECT]: { ok: true } });
    const result = installQualityPlugins({ cwd, plugins: ['impeccable'], runner });
    assert.deepStrictEqual(result.gates, []);
    assert.equal(result.warnings.length, 1);
    assert.equal(result.warnings[0].includes('no frontend detected'), true);
  });

  it('aborts when a required plugin will not install', () => {
    const cwd = makeProject({ 'index.html': '<!doctype html>\n' });
    const { runner } = fakeRunner({ [DETECT]: { ok: false }, [INSTALL]: { ok: false, stderr: 'network is down' } });
    assert.throws(
      () => installQualityPlugins({ cwd, plugins: ['impeccable'], runner }),
      (error) =>
        error instanceof PluginInstallError &&
        error.message.includes('network is down') &&
        error.message.includes('definition-of-done'),
    );
  });

  it('refuses a plugin it does not know how to install', () => {
    const cwd = makeProject();
    const { runner, calls } = fakeRunner({});
    assert.throws(() => installQualityPlugins({ cwd, plugins: ['mystery-plugin'], runner }), PluginInstallError);
    assert.deepStrictEqual(calls, [], 'must not shell out before it knows what it is running');
  });

  it('does nothing when no plugins are configured', () => {
    const { runner, calls } = fakeRunner({});
    const result = installQualityPlugins({ cwd: makeProject(), plugins: [], runner });
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

describe('hasFrontend', () => {
  /** @type {[Record<string, string>, string][]} */
  const yes = [
    [{ 'index.html': '<!doctype html>\n' }, 'an index.html'],
    [{ 'package.json': '{"dependencies":{"react":"^19"}}\n' }, 'a react dependency'],
    [{ 'package.json': '{"devDependencies":{"svelte":"^5"}}\n' }, 'a svelte dev dependency'],
    [{ 'package.json': '{"dependencies":{"next":"^15"}}\n' }, 'a next dependency'],
    [{ 'src/components/Button.tsx': 'export const Button = () => null;\n' }, 'a .tsx component'],
    [{ 'app/Page.vue': '<template />\n' }, 'a .vue file'],
  ];
  for (const [files, label] of yes) {
    it(`detects ${label}`, () => {
      assert.equal(hasFrontend(makeProject(files)), true);
    });
  }

  /** @type {[Record<string, string>, string][]} */
  const no = [
    [{ 'package.json': '{"dependencies":{"fastify":"^4"}}\n' }, 'an api server'],
    [{ 'src/cli.ts': 'export const run = () => 0;\n' }, 'a typescript cli'],
    [{ 'main.go': 'package main\n' }, 'a go program'],
    [{}, 'an empty directory'],
    [{ 'package.json': '{ not json\n' }, 'a malformed package.json with nothing else'],
  ];
  for (const [files, label] of no) {
    it(`does not detect a frontend in ${label}`, () => {
      assert.equal(hasFrontend(makeProject(files)), false);
    });
  }

  it('ignores frontend files inside node_modules', () => {
    assert.equal(hasFrontend(makeProject({ 'node_modules/react/index.js': 'x\n', 'src/a.ts': 'x\n' })), false);
  });

  it('ignores a built bundle in dist', () => {
    assert.equal(hasFrontend(makeProject({ 'dist/index.html': '<!doctype html>\n', 'src/a.ts': 'x\n' })), false);
  });
});
