/**
 * A3 — the held-out oracle (`BRIEF.md` A3, `COMPLETION.md` Phase 1).
 *
 * **Why this exists, in one measurement.** Dogfood run 12 shipped a binary reporting `mean: 0`
 * where the true mean is 1/3, at exit 0. The cold reviewer that passed it was not lazy: it wrote
 * an independent reference parser and summariser *from the PRD and data model* and differentially
 * fuzzed **110,877 cases** against it. It still missed the defect, and it could not have found
 * it — the reference was derived from the same documents, so a property those documents never
 * mention (floating-point associativity) is invisible to *both* implementations equally.
 *
 * **A differential fuzz against a reference built from the same spec is not an independent
 * oracle. It is the same assumption, twice.** Every other check in this design is downstream of
 * the builder: the gates run what the builder wrote, the ratchet protects ids the builder named,
 * and the mutation gate mutates the builder's source against the builder's tests. This is the one
 * artifact written *before* any code exists and never shown to the thing it judges.
 *
 * **Held out means not supplied, and the distinction is §6.1's.** The cases live under `.meeseeks/`,
 * so §6's positional rule makes them driver-owned — a builder may not write them. They are also
 * never rendered into a brief, a system prompt or a review prompt. That second half is a
 * *discipline*, not a barrier: a builder executing arbitrary code can read the file, and this
 * module does not pretend otherwise. Against satisficing — the threat model this whole design
 * aims at — an artifact the builder was never handed is entirely sufficient, because it cannot
 * build to a test it has not been shown.
 *
 * **A3 was deferred on the grounds that "the builder would own whether the gate can fail".** That
 * objection was answered for Stryker at §4.4 by writing the threshold into `.meeseeks/` and passing
 * it positionally. The same move applies here, and the deferral no longer holds.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** @typedef {{ path: string, content: string }} OracleFile */
/**
 * A second invocation this case's output is compared *against*, rather than to a literal.
 *
 * **R17, and item 7 measured why it is needed.** The first armed oracle authored nineteen cases
 * and every one of them asserted an exit code alone — correctly, because `oracle-author.md` says
 * to assert only `expectExit` when the specification does not fix byte-for-byte output, and a
 * PRD almost never fixes JSON formatting. The cost was then measured directly: planting run 12's
 * naive accumulation into that run's tree produced `{"mean": null}` for two finite inputs at exit
 * 0, and **all nineteen cases still passed**. `DoD-6-adversarial-input` asks whether a program
 * ever confidently reports a wrong answer, and the suite meant to answer it independently could
 * not.
 *
 * A relation escapes that rule because it never names an output. It asserts how two runs relate:
 * permute the rows and a summary must not move; duplicate the file and it must not move; feed
 * different data and it must. No reference implementation, so no risk of encoding the same
 * assumption twice — which is exactly how run 12's 110,877-case differential fuzz missed the
 * defect it was built to find.
 *
 * @typedef {{ kind: 'same-stdout' | 'same-exit' | 'differs', files: OracleFile[], argv: string[] }} OracleRelation
 */
/**
 * @typedef {{
 *   id: string, files: OracleFile[], argv: string[],
 *   expectExit: number | null, expectStdout: string | null, relation: OracleRelation | null, why: string
 * }} OracleCase
 */

/** The comparisons a relation case may assert. Anything else is refused rather than guessed. */
export const RELATION_KINDS = ['same-stdout', 'same-exit', 'differs'];

/**
 * Validate a relation block, fail-closed.
 *
 * Absent is fine — most cases are ordinary. Present-but-wrong is an error rather than a silent
 * drop, because a relation quietly discarded is a case that asserts nothing while looking like it
 * asserts something, which is the shape this whole file exists to refuse.
 *
 * @param {string} id
 * @param {unknown} value
 * @returns {OracleRelation | null}
 */
export function parseRelation(id, value) {
  if (value === undefined || value === null) return null;
  const r = /** @type {Record<string, unknown>} */ (value);
  if (typeof r.kind !== 'string' || !RELATION_KINDS.includes(r.kind)) {
    throw new OracleError(`${id} has a relation of unknown kind ${JSON.stringify(r.kind)}. Known: ${RELATION_KINDS.join(', ')}`);
  }
  if (!Array.isArray(r.argv) || r.argv.some((a) => typeof a !== 'string')) {
    throw new OracleError(`${id}'s relation needs an argv array of strings for its second run`);
  }
  const files = Array.isArray(r.files) ? r.files : [];
  for (const file of files) {
    const f = /** @type {Record<string, unknown>} */ (file);
    if (typeof f?.path !== 'string' || typeof f?.content !== 'string') {
      throw new OracleError(`${id}'s relation has a file entry without a string path and content`);
    }
    // Same containment rule as the primary run, and for the same reason.
    if (path.isAbsolute(f.path) || f.path.split(/[\\/]/).includes('..')) {
      throw new OracleError(`${id}'s relation names a file outside its scratch directory: ${f.path}`);
    }
  }
  return {
    kind: /** @type {OracleRelation['kind']} */ (r.kind),
    files: files.map((f) => ({ path: String(/** @type {OracleFile} */ (f).path), content: String(/** @type {OracleFile} */ (f).content) })),
    argv: /** @type {string[]} */ (r.argv),
  };
}

/** The store, driver-owned by §6's positional rule. */
export const ORACLE_FILE = 'oracle.json';

/** Where cases are materialised. Inside `.meeseeks/` so a builder cannot pre-create the inputs. */
const SCRATCH = 'oracle-scratch';

/** Thrown when the oracle cannot be trusted. Never caught into a pass. */
export class OracleError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'OracleError';
  }
}

/**
 * Validate one case. Every failure here is a refusal, never a skip.
 *
 * A case with no expectation at all is the dangerous shape: it executes, asserts nothing, and
 * reports a pass — which is exactly the "test that cannot fail" the mutation gate exists to
 * catch, reproduced inside the check meant to be independent of it.
 *
 * @param {unknown} value
 * @param {number} index
 * @returns {OracleCase}
 */
function requireCase(value, index) {
  const where = `oracle case ${index}`;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new OracleError(`${where} is not an object`);
  }
  const c = /** @type {Record<string, unknown>} */ (value);
  const id = typeof c.id === 'string' && c.id.trim() !== '' ? c.id : null;
  if (id === null) throw new OracleError(`${where} has no id`);
  if (!Array.isArray(c.argv) || c.argv.some((a) => typeof a !== 'string')) {
    throw new OracleError(`${id} has no argv, or an argv entry that is not a string`);
  }
  const files = Array.isArray(c.files) ? c.files : [];
  for (const file of files) {
    const f = /** @type {Record<string, unknown>} */ (file);
    if (typeof f?.path !== 'string' || typeof f?.content !== 'string') {
      throw new OracleError(`${id} has a file entry without a string path and content`);
    }
    // A case that writes outside the scratch directory is refused rather than sanitised: an
    // oracle able to scribble on the tree it judges is not an oracle.
    if (path.isAbsolute(f.path) || f.path.split(/[\\/]/).includes('..')) {
      throw new OracleError(`${id} names a file outside its scratch directory: ${f.path}`);
    }
  }
  const expectExit = typeof c.expectExit === 'number' && Number.isInteger(c.expectExit) ? c.expectExit : null;
  const expectStdout = typeof c.expectStdout === 'string' ? c.expectStdout : null;
  const relation = parseRelation(id, c.relation);
  // A relation is a third way to assert something, so it satisfies the same rule the other two
  // do: a case must be capable of failing. Nothing here defaults to pass.
  if (expectExit === null && expectStdout === null && relation === null) {
    throw new OracleError(
      `${id} expects nothing: a case that asserts neither an exit code, nor stdout, nor a relation cannot fail`,
    );
  }
  return {
    id,
    files: files.map((f) => ({ path: String(/** @type {OracleFile} */ (f).path), content: String(/** @type {OracleFile} */ (f).content) })),
    argv: /** @type {string[]} */ (c.argv),
    expectExit,
    expectStdout,
    relation,
    why: typeof c.why === 'string' ? c.why : '',
  };
}

/**
 * Read the cases a child emitted, from the last fenced json block.
 *
 * Last-to-first, for `parseCapabilityDeclaration`'s reason: a block echoed from the instructions
 * must never win over the answer.
 *
 * @param {string} text
 * @returns {OracleCase[]}
 */
export function parseOracleCases(text) {
  const blocks = [...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)].map((m) => m[1]);
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    /** @type {unknown} */
    let parsed;
    try {
      parsed = JSON.parse(blocks[i]);
    } catch {
      continue;
    }
    const list = Array.isArray(parsed)
      ? parsed
      : /** @type {Record<string, unknown>} */ (parsed)?.cases;
    if (!Array.isArray(list)) continue;
    if (list.length === 0) throw new OracleError('the oracle author returned an empty case list');
    return list.map(requireCase);
  }
  throw new OracleError('no parseable json block of oracle cases was returned');
}

/**
 * @param {string} meeseeksDir
 * @param {OracleCase[]} cases
 * @returns {string} the path written
 */
export function writeOracle(meeseeksDir, cases) {
  if (cases.length === 0) throw new OracleError('refusing to write an empty oracle');
  mkdirSync(meeseeksDir, { recursive: true });
  const file = path.join(meeseeksDir, ORACLE_FILE);
  writeFileSync(file, `${JSON.stringify({ version: 1, cases }, null, 2)}\n`, 'utf8');
  return file;
}

/**
 * @param {string} meeseeksDir
 * @returns {OracleCase[]}
 */
export function readOracle(meeseeksDir) {
  const file = path.join(meeseeksDir, ORACLE_FILE);
  if (!existsSync(file)) throw new OracleError('no held-out cases: the oracle was never authored');
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new OracleError(`the oracle store will not parse: ${/** @type {Error} */ (error).message}`);
  }
  const list = /** @type {Record<string, unknown>} */ (parsed)?.cases;
  if (!Array.isArray(list) || list.length === 0) throw new OracleError('the oracle store holds no cases');
  return list.map(requireCase);
}

/**
 * Judge one executed case.
 *
 * Both expectations are checked when both are present, and stdout is compared after trimming
 * trailing whitespace only — a missing newline is a formatting difference, and failing a correct
 * program over one would be the unsatisfiable-gate defect this repository keeps rediscovering.
 *
 * @param {OracleCase} expected
 * @param {{ status: number, stdout: string }} actual
 * @returns {{ ok: boolean, detail: string }}
 */
export function judgeOracleCase(expected, actual) {
  if (expected.expectExit !== null && actual.status !== expected.expectExit) {
    return { ok: false, detail: `${expected.id}: expected exit ${expected.expectExit}, got ${actual.status}` };
  }
  if (expected.expectStdout !== null && actual.stdout.trimEnd() !== expected.expectStdout.trimEnd()) {
    return {
      ok: false,
      detail: `${expected.id}: stdout differs. expected ${JSON.stringify(expected.expectStdout.trimEnd().slice(0, 200))}, got ${JSON.stringify(actual.stdout.trimEnd().slice(0, 200))}`,
    };
  }
  return { ok: true, detail: `${expected.id}: as expected` };
}

/**
 * Judge a relation: how two runs of the same program must relate to each other.
 *
 * Never compared against a literal, which is the whole point — the assertion holds whatever the
 * program prints, so it survives a specification that does not fix JSON formatting. Trailing
 * whitespace is trimmed on both sides for `judgeOracleCase`'s reason: a missing newline is a
 * formatting difference and failing a correct program over one is the unsatisfiable-gate defect.
 *
 * `differs` is the deny path of the other two, and it earns its place: a program that ignores
 * its input entirely satisfies every same-stdout relation ever written.
 *
 * @param {string} id
 * @param {OracleRelation} relation
 * @param {{ status: number, stdout: string }} first
 * @param {{ status: number, stdout: string }} second
 * @returns {{ ok: boolean, detail: string }}
 */
export function judgeOracleRelation(id, relation, first, second) {
  const a = first.stdout.trimEnd();
  const b = second.stdout.trimEnd();
  if (relation.kind === 'same-exit') {
    return first.status === second.status
      ? { ok: true, detail: `${id}: both runs exited ${first.status}` }
      : { ok: false, detail: `${id}: same-exit violated - first exited ${first.status}, second exited ${second.status}` };
  }
  if (relation.kind === 'same-stdout') {
    return a === b
      ? { ok: true, detail: `${id}: both runs printed the same thing` }
      : {
          ok: false,
          detail:
            `${id}: same-stdout violated - first printed ${JSON.stringify(a.slice(0, 160))}, ` +
            `second printed ${JSON.stringify(b.slice(0, 160))}`,
        };
  }
  return a !== b
    ? { ok: true, detail: `${id}: the two runs differ, as required` }
    : {
        ok: false,
        detail: `${id}: differs violated - both runs printed ${JSON.stringify(a.slice(0, 160))}, so the input was ignored`,
      };
}

/**
 * How to invoke the thing the oracle judges.
 *
 * A CLI's entry point is what `package.json` declares as `bin`, because that is what a user
 * actually runs — and run 10 found a build whose declared `bin` was **inert**, printing nothing
 * and exiting 0 through a real `npm install -g`, while every gate stayed green because each of
 * them invoked `node dist/cli.js` directly. Resolving through `bin` here means the oracle asks
 * the same question a user does.
 *
 * Returns null rather than guessing. A `cli` project with no declared `bin` is a defect the gate
 * should report by name, not paper over by picking a file that looks plausible.
 *
 * @param {string} root
 * @returns {string[] | null}
 */
export function resolveArtifactCommand(root) {
  const manifest = path.join(root, 'package.json');
  if (!existsSync(manifest)) return null;
  /** @type {Record<string, unknown>} */
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(manifest, 'utf8'));
  } catch {
    return null;
  }
  const bin = parsed.bin;
  const relative =
    typeof bin === 'string'
      ? bin
      : bin !== null && typeof bin === 'object'
        ? Object.values(/** @type {Record<string, unknown>} */ (bin)).find((v) => typeof v === 'string')
        : undefined;
  if (typeof relative !== 'string' || relative === '') return null;
  return ['node', path.resolve(root, relative)];
}

/**
 * Run every held-out case against the built artifact.
 *
 * @param {{
 *   meeseeksDir: string, root: string, command: string[],
 *   run: (command: string, args: string[], options: { cwd: string }) =>
 *     { ok: boolean, status: number, stdout: string, stderr: string }
 *     | Promise<{ ok: boolean, status: number, stdout: string, stderr: string }>,
 * }} options
 * @returns {Promise<{ name: string, ok: boolean, status: number, detail: string }>}
 */
export async function runOracle(options) {
  /** @type {OracleCase[]} */
  let cases;
  try {
    cases = readOracle(options.meeseeksDir);
  } catch (error) {
    // Missing, unparseable or empty all fail. An oracle that cannot be read is the one shape
    // that reads exactly like an oracle everything passed.
    return { name: 'oracle', ok: false, status: 1, detail: /** @type {Error} */ (error).message };
  }
  const scratch = path.join(options.meeseeksDir, SCRATCH);
  /** @type {string[]} */
  const failures = [];
  try {
    for (const testCase of cases) {
      rmSync(scratch, { recursive: true, force: true });
      mkdirSync(scratch, { recursive: true });
      for (const file of testCase.files) {
        const target = path.join(scratch, file.path);
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, file.content, 'utf8');
      }
      const [command, ...fixed] = options.command;
      const result = await options.run(command, [...fixed, ...testCase.argv], { cwd: scratch });
      const verdict = judgeOracleCase(testCase, result);
      if (!verdict.ok) failures.push(verdict.detail);

      // R17. The second invocation, in a scratch directory rebuilt from the relation's own
      // files, so neither run can see the other's inputs. Judged even when the first assertion
      // already failed: two independent facts about the program, and suppressing the second
      // would hide a relation violation behind an exit-code mismatch.
      if (testCase.relation !== null) {
        rmSync(scratch, { recursive: true, force: true });
        mkdirSync(scratch, { recursive: true });
        for (const file of testCase.relation.files) {
          const target = path.join(scratch, file.path);
          mkdirSync(path.dirname(target), { recursive: true });
          writeFileSync(target, file.content, 'utf8');
        }
        const second = await options.run(command, [...fixed, ...testCase.relation.argv], { cwd: scratch });
        const related = judgeOracleRelation(testCase.id, testCase.relation, result, second);
        if (!related.ok) failures.push(related.detail);
      }
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  if (failures.length > 0) {
    return {
      name: 'oracle',
      ok: false,
      status: 1,
      detail: `${failures.length} of ${cases.length} held-out case(s) failed - ${failures.join('; ')}`,
    };
  }
  return { name: 'oracle', ok: true, status: 0, detail: `${cases.length} held-out case(s) passed` };
}
