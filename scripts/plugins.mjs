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
 * `reaped` carries the pids of leaked descendants the real shell killed after a timeout
 * (`sweepLeakedGroup` in `driver.mjs`). Optional, because every test double and
 * `defaultRunner` omit it, and absent means no sweep was possible rather than nothing found.
 *
 * @typedef {{ ok: boolean, status: number, stdout: string, stderr: string, timedOut?: boolean, reaped?: number[] }} RunResult
 */
/**
 * A runner may answer synchronously (every test double does) or with a promise (the driver's
 * real `shell` does, since the async conversion); consumers `await` the call either way.
 *
 * `env`, when given, is the **complete** environment for the child, already merged by the caller
 * over the run's own. The real `shell` defaults to `process.env` when it is absent, so a runner
 * that ignores it silently drops whatever a gate needed — which is why it is in the contract rather
 * than left to whichever implementation happens to support it.
 *
 * @typedef {(command: string, args: string[], options: { cwd: string, timeoutMs?: number, env?: Record<string, string | undefined> }) => RunResult | Promise<RunResult>} Runner
 */
/**
 * @typedef {{
 *   name: string, required: boolean, capability?: string,
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
    // Armed by the run's `web-ui` capability rather than by a detector run against the current tree
    // (REVIEW F13). The old `frontendOnly` flag re-asked "does this repo render a UI" on every gate
    // pass, so a builder deleting `index.html` deleted the gate that judged its design work.
    capability: 'web-ui',
    detect: ['npx', '--no-install', 'impeccable', '--version'],
    install: ['npx', '-y', 'impeccable', 'install'],
    gate: ['npx', 'impeccable', 'detect', 'src/'],
    note: 'frontend design-slop detector; deterministic rules, JSON output, exit codes (DESIGN.md §5.1)',
  },
  knip: {
    name: 'knip',
    required: false,
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
  schemathesis: {
    name: 'schemathesis',
    required: false,
    // R18. Armed by the `api` capability, the way `impeccable` should eventually be armed by
    // `web-ui` (BORROWED.md R7) rather than by the ad-hoc `frontendOnly` flag beside it.
    capability: 'api',
    detect: ['schemathesis', '--version'],
    // Python, like semgrep, which is exactly what the plugin registry exists for: an optional
    // gate that degrades to a warning when the tool cannot be provisioned.
    install: ['python3', '-m', 'pip', 'install', '--user', '--quiet', 'schemathesis'],
    // **`--dry-run`, and that is the whole reason this can be a gate at all.** It validates the
    // schema and exercises data generation *without making a request*, so it needs no running
    // application - and a gate that needed one would have to start it, which is the deploy's
    // job and is off by default. Verified against schemathesis 3.39.16 rather than read: a
    // well-formed schema exits 0 and one with an invalid parameter type exits 1.
    //
    // What it therefore does and does not check, stated so nobody reads more into a green:
    // it proves the contract is machine-valid and that inputs can be generated from it. It
    // does **not** prove the application conforms to it - that is the live half, and it needs
    // a running app this gate does not have.
    gate: ['schemathesis', 'run', '--dry-run', '-c', 'all', 'docs/openapi.yaml'],
    note: 'schema-driven property fuzzer over the OpenAPI contract; validates generation without a live app (DESIGN.md §5, BORROWED.md R18)',
  },
  semgrep: {
    name: 'semgrep',
    required: false,
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
    // **A deadline, because provisioning had none** (REVIEW F41). This runs before the loop and
    // before the operator's wall clock, so a registry that never answers hung the whole run with no
    // gate result and no receipt. `execFileSync` kills the child when the timeout fires and throws,
    // which lands in the same failure shape the caller already handles.
    const stdout = execFileSync(command, args, {
      cwd: options.cwd,
      stdio: 'pipe',
      encoding: 'utf8',
      ...(options.env === undefined ? {} : { env: options.env }),
      ...(options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
    });
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
 * How long a provisioning command may take before it is a failure rather than a wait.
 *
 * **Provisioning had no deadline at all** (REVIEW F41). `npx --no-install` resolving a registry, a
 * `pip install` against an unreachable index, a package manager waiting on a lock another process
 * holds — any of them can hang, and this runs *before* the loop, before the wall clock the operator
 * configured, and before anything that would report it. An unattended run started at midnight would
 * still be sitting there in the morning with no gate result and no receipt.
 *
 * Detection is short because it is meant to answer instantly: it asks a tool already on the machine
 * for its version. Installation is long because it may genuinely download. Both are ceilings on a
 * hang, not budgets anybody should be spending.
 */
export const DETECT_TIMEOUT_MS = 60_000;
/** @see DETECT_TIMEOUT_MS */
export const INSTALL_TIMEOUT_MS = 10 * 60_000;

/**
 * Install the configured quality plugins, idempotently.
 *
 * @param {{ cwd: string, plugins: string[], runner?: Runner }} options
 * @returns {Promise<{
 *   installed: string[], skipped: string[], warnings: string[],
 *   gates: { plugin: string, command: string[], capability?: string }[]
 * }>}
 * @throws {PluginInstallError} when a required plugin cannot be provisioned
 */
export async function installQualityPlugins(options) {
  const { cwd, plugins } = options;
  const run = options.runner ?? defaultRunner;

  /** @type {string[]} */
  const installed = [];
  /** @type {string[]} */
  const skipped = [];
  /** @type {string[]} */
  const warnings = [];
  /** @type {{ plugin: string, command: string[], capability?: string }[]} */
  const gates = [];

  for (const name of plugins) {
    const spec = resolvePlugin(name);

    const present = await run(spec.detect[0], spec.detect.slice(1), { cwd, timeoutMs: DETECT_TIMEOUT_MS });
    // **A deadline that fires is not an ordinary absence** (REVIEW F41). The ceilings were added and
    // the *caller* then discarded `timedOut`, so a detection that hung for its full 60s was read as
    // "the tool is not installed" and escalated straight into a ten-minute install attempt. The
    // operator saw eleven minutes of silence and then `exit 1`, which is the hang the deadline was
    // added to prevent, wearing the report of a missing package.
    if (present.timedOut === true) {
      const stalled =
        `detecting quality plugin ${spec.name} did not finish within ${DETECT_TIMEOUT_MS}ms and was killed. ` +
        'A detection that hangs says nothing about whether the tool is present, so it is not read as absent';
      if (spec.required) throw new PluginInstallError(`${stalled}, and ${spec.name} is required (DESIGN.md §5).`);
      warnings.push(`${stalled}; ${spec.name} is optional and was skipped.`);
      continue;
    }
    if (present.ok) {
      skipped.push(spec.name);
    } else {
      const result = await run(spec.install[0], spec.install.slice(1), { cwd, timeoutMs: INSTALL_TIMEOUT_MS });
      if (result.timedOut === true) {
        const stalled =
          `installing quality plugin ${spec.name} did not finish within ${INSTALL_TIMEOUT_MS}ms and was killed`;
        if (spec.required) {
          throw new PluginInstallError(
            `${stalled}. It contributes a definition-of-done line, and a run that silently drops it would ship ` +
              'having never checked that line (DESIGN.md §5).',
          );
        }
        warnings.push(`${stalled}; ${spec.name} is optional and was skipped.`);
        continue;
      }
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
    // The capability is carried, not resolved. Provisioning happens once, before the builder
    // has written a line; asking "does this repo have a frontend" here asks it of a
    // directory containing a PRD and nothing else, and the answer is always no. That
    // disarmed the design gate for every greenfield run — which is the entire use case.
    // The caller re-asks each iteration, against the tree as it actually is.
    // Spread rather than always present, so a gate with no capability keeps exactly the shape
    // it has always had. `capability: undefined` is a different object from no key at all, and
    // the callers that compare these are asserting values rather than truthiness.
    gates.push({
      plugin: spec.name,
      command: spec.gate,
      ...(spec.capability === undefined ? {} : { capability: spec.capability }),
    });
  }

  return { installed, skipped, warnings, gates };
}
