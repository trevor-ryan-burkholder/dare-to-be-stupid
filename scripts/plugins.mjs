/**
 * Quality-plugin auto-install (DESIGN.md §5).
 *
 * Phase 1 installs a curated set of plugins so their hooks and skills are live for every
 * later build iteration. Failing to install a *required* plugin aborts the run: a plugin
 * that contributes a definition-of-done line cannot be silently dropped, because the run
 * would then ship having never checked that line (DESIGN.md §5, §4 line 5).
 *
 * Commands are injected rather than hard-called, so the tests drive the real decision
 * logic — which plugin, required or optional, install or skip, gate armed or not — without
 * reaching the network. What is *not* injected is the frontend detection, which reads a
 * real directory tree, because that is the part with a wrong answer worth catching.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/** @typedef {{ ok: boolean, status: number, stdout: string, stderr: string }} RunResult */
/** @typedef {(command: string, args: string[], options: { cwd: string }) => RunResult} Runner */
/**
 * @typedef {{
 *   name: string, required: boolean, frontendOnly: boolean,
 *   detect: string[], install: string[], gate: string[] | null, note: string
 * }} PluginSpec
 */

/** Thrown when a required quality plugin cannot be provisioned. */
export class PluginInstallError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'PluginInstallError';
  }
}

/**
 * Plugins this build knows how to provision. An unknown name is an error rather than a
 * best-effort `npx <name>`: guessing an install command for an arbitrary string is how a
 * run ends up executing something nobody chose.
 * @type {Record<string, PluginSpec>}
 */
export const KNOWN_PLUGINS = {
  impeccable: {
    name: 'impeccable',
    required: true,
    frontendOnly: true,
    detect: ['npx', '--no-install', 'impeccable', '--version'],
    install: ['npx', '-y', 'impeccable', 'install'],
    gate: ['npx', 'impeccable', 'detect', 'src/'],
    note: 'frontend design-slop detector; deterministic rules, JSON output, exit codes (DESIGN.md §5.1)',
  },
};

/** Dependency names that mean the repo renders a user interface. */
const FRONTEND_DEPENDENCIES = [
  'react',
  'react-dom',
  'vue',
  'svelte',
  '@sveltejs/kit',
  'next',
  'nuxt',
  'astro',
  'solid-js',
  'preact',
  '@angular/core',
  'lit',
  'remix',
  '@remix-run/react',
];

/** Extensions that only exist in a user interface. */
const FRONTEND_EXTENSIONS = new Set(['.jsx', '.tsx', '.vue', '.svelte', '.astro']);

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'out', 'coverage', '.next', '.nuxt', 'vendor']);

/**
 * Default runner: really shells out.
 * @type {Runner}
 */
export function defaultRunner(command, args, options) {
  try {
    const stdout = execFileSync(command, args, { cwd: options.cwd, stdio: 'pipe', encoding: 'utf8' });
    return { ok: true, status: 0, stdout, stderr: '' };
  } catch (error) {
    const failure = /** @type {{ status?: number, stdout?: string, stderr?: string, message: string }} */ (error);
    return {
      ok: false,
      status: typeof failure.status === 'number' ? failure.status : 1,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? failure.message,
    };
  }
}

/**
 * Does this repository render a user interface?
 *
 * DESIGN.md §5.1 caveat 1: impeccable's detector is about UI, so on a pure API, backend or
 * CLI project the design-slop gate is *skipped, not failed*. Skipping a gate is otherwise
 * forbidden; this is the one case the spec carves out, and it only holds when there is
 * genuinely nothing to look at.
 *
 * @param {string} root
 * @returns {boolean}
 */
export function hasFrontend(root) {
  if (existsSync(path.join(root, 'index.html'))) return true;

  const manifest = path.join(root, 'package.json');
  if (existsSync(manifest)) {
    try {
      const parsed = JSON.parse(readFileSync(manifest, 'utf8'));
      const declared = {
        ...(parsed.dependencies ?? {}),
        ...(parsed.devDependencies ?? {}),
        ...(parsed.peerDependencies ?? {}),
      };
      if (FRONTEND_DEPENDENCIES.some((dependency) => dependency in declared)) return true;
    } catch {
      // A malformed package.json is not evidence of a frontend. Keep looking.
    }
  }

  /**
   * @param {string} dir
   * @param {number} depth
   * @returns {boolean}
   */
  function walk(dir, depth) {
    if (depth > 6) return false;
    /** @type {import('node:fs').Dirent[]} */
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (walk(path.join(dir, entry.name), depth + 1)) return true;
        continue;
      }
      if (entry.isFile() && FRONTEND_EXTENSIONS.has(path.extname(entry.name))) return true;
    }
    return false;
  }
  return walk(root, 0);
}

/**
 * @param {string} name
 * @returns {PluginSpec}
 * @throws {PluginInstallError}
 */
export function resolvePlugin(name) {
  const spec = KNOWN_PLUGINS[name];
  if (spec === undefined) {
    throw new PluginInstallError(
      `${JSON.stringify(name)} is not a quality plugin this build knows how to install. ` +
        `Known plugins: ${Object.keys(KNOWN_PLUGINS).join(', ')}. Refusing to guess an install command.`,
    );
  }
  return spec;
}

/**
 * Install the configured quality plugins, idempotently.
 *
 * @param {{ cwd: string, plugins: string[], runner?: Runner }} options
 * @returns {{
 *   installed: string[], skipped: string[], warnings: string[],
 *   gates: { plugin: string, command: string[] }[]
 * }}
 * @throws {PluginInstallError} when a required plugin cannot be provisioned
 */
export function installQualityPlugins(options) {
  const { cwd, plugins } = options;
  const run = options.runner ?? defaultRunner;

  /** @type {string[]} */
  const installed = [];
  /** @type {string[]} */
  const skipped = [];
  /** @type {string[]} */
  const warnings = [];
  /** @type {{ plugin: string, command: string[] }[]} */
  const gates = [];

  for (const name of plugins) {
    const spec = resolvePlugin(name);

    const present = run(spec.detect[0], spec.detect.slice(1), { cwd });
    if (present.ok) {
      skipped.push(spec.name);
    } else {
      const result = run(spec.install[0], spec.install.slice(1), { cwd });
      if (!result.ok) {
        const detail = (result.stderr || result.stdout || `exit ${result.status}`).trim();
        if (spec.required) {
          throw new PluginInstallError(
            `required quality plugin ${spec.name} failed to install: ${detail}. It contributes a definition-of-done ` +
              'line, and a run that silently drops it would ship having never checked that line (DESIGN.md §5).',
          );
        }
        warnings.push(`optional quality plugin ${spec.name} failed to install and was skipped: ${detail}`);
        continue;
      }
      installed.push(spec.name);
    }

    if (spec.gate === null) continue;
    if (spec.frontendOnly && !hasFrontend(cwd)) {
      warnings.push(
        `${spec.name}'s gate is not armed: no frontend detected, and its detector only inspects UI (DESIGN.md §5.1).`,
      );
      continue;
    }
    gates.push({ plugin: spec.name, command: spec.gate });
  }

  return { installed, skipped, warnings, gates };
}
