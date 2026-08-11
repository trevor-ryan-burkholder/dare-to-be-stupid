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
 * @typedef {{ kind: 'command', command: string[] }
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
 * @returns {Operation}
 * @throws {ToolchainError} on an empty command, which would otherwise exit 0 and read as a pass
 */
export function command(argv) {
  if (!Array.isArray(argv) || argv.length === 0 || argv.some((part) => typeof part !== 'string' || part === '')) {
    throw new ToolchainError(
      `a toolchain operation must be a non-empty list of non-empty strings; got ${JSON.stringify(argv)}. ` +
        'An empty command runs nothing and exits zero, which a gate cannot tell from a pass.',
    );
  }
  return { kind: 'command', command: [...argv] };
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
