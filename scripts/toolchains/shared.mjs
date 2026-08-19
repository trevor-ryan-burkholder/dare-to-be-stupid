/**
 * The vocabulary a toolchain adapter speaks (DESIGN.md §3.8).
 *
 * One idea carries this file: **an operation a toolchain cannot perform must say so, and must
 * not return a command that trivially succeeds.** A toolchain whose compiler already rejects
 * type errors has no separate typecheck step — but "no separate step" and "typechecking
 * passed" are different claims, and a gate that cannot tell them apart is the silent pass this
 * whole codebase is built to refuse.
 *
 * So an operation is either a command to run or an explicit, reasoned refusal. There is no
 * third state, and in particular there is no empty command list.
 */

/**
 * `env` is present only when the command needs one, and carries **only** the variables the
 * operation itself decides. It is merged over the run's environment by the runner rather than
 * replacing it, because a gate stripped of PATH cannot find the binary it was told to run.
 *
 * @typedef {{ kind: 'command', command: string[], env?: Record<string, string> }
 *   | { kind: 'not-applicable', reason: string }} Operation
 */

/** Thrown when a toolchain cannot be resolved or is malformed. */
export class ToolchainError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'ToolchainError';
  }
}

/**
 * @param {string[]} argv the command and its arguments
 * @param {Record<string, string>} [env] variables this command needs in its environment
 * @returns {Operation}
 * @throws {ToolchainError} on an empty command, which would otherwise exit 0 and read as a pass,
 *         or on an environment that is not entirely strings
 */
export function command(argv, env) {
  if (!Array.isArray(argv) || argv.length === 0 || argv.some((part) => typeof part !== 'string' || part === '')) {
    throw new ToolchainError(
      `a toolchain operation must be a non-empty list of non-empty strings; got ${JSON.stringify(argv)}. ` +
        'An empty command runs nothing and exits zero, which a gate cannot tell from a pass.',
    );
  }
  if (env === undefined) return { kind: 'command', command: [...argv] };
  // **Validated rather than trusted, and fail-closed.** An environment is how a test command is
  // told where to write the report the ratchet reads, so a variable that arrives as `undefined`
  // does not produce a slightly different command — it produces a runner that writes nowhere, a
  // gate that exits zero, and a report the driver reads as "no tests at all". That failure is
  // silent by construction, which is the reason this refuses instead of coercing.
  if (typeof env !== 'object' || env === null || Array.isArray(env)) {
    throw new ToolchainError(
      `a toolchain operation environment must be a plain object; got ${JSON.stringify(env)}.`,
    );
  }
  const entries = Object.entries(env);
  if (entries.length === 0) {
    throw new ToolchainError(
      'a toolchain operation environment must not be empty. Omit the argument instead, so that ' +
        '"this command needs no environment" and "the environment was computed and came out empty" ' +
        'stay distinguishable to a reader.',
    );
  }
  for (const [key, value] of entries) {
    if (key === '' || typeof value !== 'string' || value === '') {
      throw new ToolchainError(
        `a toolchain operation environment must map non-empty names to non-empty strings; ` +
          `got ${JSON.stringify(key)} -> ${JSON.stringify(value)}.`,
      );
    }
  }
  return { kind: 'command', command: [...argv], env: { ...env } };
}

/**
 * @param {string} reason why this toolchain has no such step — shown to the operator and put
 *        in the build brief, so it has to read as an explanation rather than a shrug
 * @returns {Operation}
 * @throws {ToolchainError} when no reason is given
 */
export function notApplicable(reason) {
  if (typeof reason !== 'string' || reason.trim() === '') {
    throw new ToolchainError(
      'a not-applicable operation must carry a reason. An unexplained skip is indistinguishable from an ' +
        'oversight, and the operator reading the gate list has no way to judge which it is.',
    );
  }
  return { kind: 'not-applicable', reason: reason.trim() };
}
