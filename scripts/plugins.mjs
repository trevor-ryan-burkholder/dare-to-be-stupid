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
 * reaching the network.
 *
 * Frontend detection used to live here. It is now one detector among ten in
 * `capabilities.mjs` (DESIGN.md §3.7), because "does this repo render a UI" turned out to be
 * the first instance of a general question — what is this project, and which gates therefore
 * apply — rather than a fact about quality plugins.
 */

import { execFileSync } from 'node:child_process';

/**
 * `timedOut` is optional: the provisioning runners here call short-lived commands that cannot
 * hang on a remote machine, and requiring the field of every double would be bookkeeping. The
 * driver's real `shell` always sets it, and every consumer tests it for `true` rather than for
 * truthiness.
 *
 * @typedef {{ ok: boolean, status: number, stdout: string, stderr: string, timedOut?: boolean }} RunResult
 */
/** @typedef {(command: string, args: string[], options: { cwd: string, timeoutMs?: number }) => RunResult} Runner */
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
  knip: {
    name: 'knip',
    required: false,
    frontendOnly: false,
    detect: ['npx', '--no-install', 'knip', '--version'],
    install: ['npm', 'install', '--save-dev', '--no-audit', '--no-fund', 'knip'],
    // Deliberately narrowed to files and dependencies. knip's unused-*exports* analysis is
    // its noisy half: on a young codebase an export with no caller yet is ordinary, and a
    // gate that fails an honest repository costs a whole iteration. An unused file or an
    // unused declared dependency is almost never a false positive, and both are exactly the
    // gold-plating the builder brief already forbids without anything checking.
    gate: ['npx', 'knip', '--include', 'files,dependencies'],
    note: 'dead file and unused dependency detector; enforces the no-gold-plating rule the builder brief states',
  },
  semgrep: {
    name: 'semgrep',
    required: false,
    frontendOnly: false,
    detect: ['semgrep', '--version'],
    install: ['python3', '-m', 'pip', 'install', '--user', '--quiet', 'semgrep'],
    // `security-audit` is `npm audit`, which only ever inspects declared dependencies. It
    // has nothing to say about the code the builder wrote thirty seconds ago. This is the
    // detector half of DESIGN.md §14's open question, and a detector rather than a fourth
    // reviewer on purpose: the panel already supplies opinions, and opinions can be charmed.
    gate: ['semgrep', '--config', 'p/security-audit', '--error', '--quiet'],
    note: 'static analysis over first-party source; rules-based, exit codes (DESIGN.md §14)',
  },
};

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
 *   gates: { plugin: string, command: string[], frontendOnly: boolean }[]
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
  /** @type {{ plugin: string, command: string[], frontendOnly: boolean }[]} */
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
    // `frontendOnly` is carried, not resolved. Provisioning happens once, before the builder
    // has written a line; asking "does this repo have a frontend" here asks it of a
    // directory containing a PRD and nothing else, and the answer is always no. That
    // disarmed the design gate for every greenfield run — which is the entire use case.
    // The caller re-asks each iteration, against the tree as it actually is.
    gates.push({ plugin: spec.name, command: spec.gate, frontendOnly: spec.frontendOnly });
  }

  return { installed, skipped, warnings, gates };
}
