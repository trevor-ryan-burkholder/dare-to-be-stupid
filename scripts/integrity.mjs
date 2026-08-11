/**
 * Gate integrity — the gates are not the builder's to weaken (DESIGN.md §4).
 *
 * The ratchet guards *test identity*: an id that has passed may never fail, and a deleted
 * test reads as a regression because its id stops appearing in the passing set. That closes
 * the obvious Goodhart hole, the one where an agent under pressure deletes the failing test.
 *
 * It does not close this one. `commandGates` runs `npm run lint`; the **builder writes what
 * `lint` means**. A builder that defines `"lint": "true"` passes that gate forever, having
 * written nothing but a lie into `package.json`. The same goes for `typecheck`, and
 * `@ts-nocheck` silences a whole file at a stroke. None of it trips a single existing gate.
 *
 * The rule here is deliberately **deny-the-known-cheat rather than allowlist-the-known-tool**.
 * An allowlist of linters looks stricter and is worse: the day a builder reaches for a real
 * tool that is not on the list, the gate fails a correct repository and costs a full
 * iteration. A no-op is recognisable on its own terms and has no honest counterexample —
 * nobody writes `"lint": "true"` meaning it.
 *
 * What this deliberately does *not* judge: whether an unfamiliar command is a good linter.
 * That is a question about the world, and gates that ask questions about the world are the
 * ones that fail the wrong repositories.
 *
 * **The same asymmetry governs the assertion check.** "Tests assert real values, not
 * truthiness" is the DoD's most load-bearing claim, and until v0.21.0 the only thing enforcing
 * it was a reviewer *reading* the tests — an LLM judgement that costs a full iteration every
 * time it fires. The deterministic form belongs here rather than in an ESLint rule, for the
 * reason this whole module exists: the builder writes what `lint` means, so a rule shipped
 * into the project's linter is a rule the project's linter can be configured not to run, and
 * the check would be negotiable by the thing it constrains.
 *
 * It matches only shapes with no honest counterexample — five matchers that assert existence
 * instead of value, and the single-argument `assert(x)`. A two-argument `assert(x, message)`
 * is left alone, comments are blanked before matching, and application source is not scanned
 * at all: `assert(config)` outside a test is a runtime invariant, not a claim about a result.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/** @typedef {{ ok: boolean, findings: string[] }} IntegrityReport */

/**
 * The gate-invoking scripts. These are the ones whose meaning the driver depends on; a
 * `prepublish` or a `format` script may be whatever the repository likes.
 */
export const GATE_SCRIPTS = ['build', 'lint', 'typecheck', 'test', 'e2e'];

/**
 * A script body that runs nothing.
 *
 * `true`, `:` and `exit 0` are the direct forms. A body that is only `echo ...` is the
 * polite form — it prints a sentence about how the gate was not needed and exits 0, which
 * is the same thing wearing a hat. Anything else is treated as real work, including tools
 * this module has never heard of, which is the point.
 *
 * @param {string} body
 * @returns {boolean}
 */
export function isNoOpScript(body) {
  const trimmed = body.trim();
  if (trimmed.length === 0) return true;
  // Split on separators so `echo skipping && true` is judged as a whole.
  const parts = trimmed.split(/&&|\|\||;/).map((part) => part.trim()).filter((part) => part.length > 0);
  if (parts.length === 0) return true;
  return parts.every((part) => /^(true|:|exit\s+0|echo\b[^|]*)$/.test(part));
}

/**
 * Read `package.json` scripts.
 *
 * A missing `package.json` yields no scripts rather than an error: on a greenfield first
 * iteration there is nothing yet, and the `lint` and `types` command gates already fail
 * loudly when `npm run lint` does not exist. This module is not the only thing standing
 * there, so it does not need to invent a failure. An *unparseable* `package.json` is a
 * different matter and throws — that is evidence missing, not evidence absent.
 *
 * @param {string} cwd
 * @returns {Record<string, string>}
 * @throws {SyntaxError} when package.json exists and is not valid JSON
 */
export function readGateScripts(cwd) {
  const file = path.join(cwd, 'package.json');
  if (!existsSync(file)) return {};
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  const scripts = parsed?.scripts;
  if (scripts === null || typeof scripts !== 'object' || Array.isArray(scripts)) return {};
  /** @type {Record<string, string>} */
  const out = {};
  for (const [name, body] of Object.entries(scripts)) {
    if (typeof body === 'string') out[name] = body;
  }
  return out;
}

/**
 * Every `tsconfig*.json` at the repository root that explicitly turns `strict` off.
 *
 * Only an explicit `false` counts. An absent `strict` is not evidence of weakening — it may
 * be inherited through `extends`, and following that chain would mean resolving node module
 * paths for a judgement this gate does not need to make. Turning it off by hand is the
 * signal worth catching, and it is unambiguous.
 *
 * @param {string} cwd
 * @returns {string[]} the offending file names, sorted
 */
export function looseTsconfigs(cwd) {
  /** @type {string[]} */
  const loose = [];
  /** @type {string[]} */
  let entries;
  try {
    entries = readdirSync(cwd);
  } catch {
    return [];
  }
  for (const name of entries.filter((entry) => /^tsconfig(\..+)?\.json$/.test(entry)).sort()) {
    /** @type {unknown} */
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(path.join(cwd, name), 'utf8'));
    } catch {
      // A tsconfig that will not parse is the typecheck gate's problem, not this gate's.
      // Claiming it here would report the same fault twice under two different names.
      continue;
    }
    const options = /** @type {{ compilerOptions?: { strict?: unknown } }} */ (parsed)?.compilerOptions;
    if (options !== undefined && options !== null && options.strict === false) loose.push(name);
  }
  return loose;
}

/** Directories never worth walking for suppressions. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.dare', '.next']);

/**
 * Files carrying a whole-file type suppression.
 *
 * `@ts-nocheck` is singled out from the rest of the suppression family because it is not a
 * targeted escape hatch — it disables checking for an entire file, which makes the types
 * gate green while proving nothing about that file. A line-level `@ts-expect-error` is a
 * documented, narrow claim and stays allowed.
 *
 * @param {string} cwd
 * @param {number} [depth]
 * @returns {string[]} repository-relative paths, sorted
 */
export function nocheckedFiles(cwd, depth = 0) {
  if (depth > 8) return [];
  /** @type {import('node:fs').Dirent[]} */
  let entries;
  try {
    entries = readdirSync(cwd, { withFileTypes: true });
  } catch {
    return [];
  }
  /** @type {string[]} */
  const found = [];
  for (const entry of entries) {
    const full = path.join(cwd, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      found.push(...nocheckedFiles(full, depth + 1).map((child) => path.join(entry.name, child)));
      continue;
    }
    if (!entry.isFile() || !/\.(mjs|cjs|js|jsx|ts|tsx|mts|cts|vue|svelte)$/.test(entry.name)) continue;
    try {
      if (/@ts-nocheck\b/.test(readFileSync(full, 'utf8'))) found.push(entry.name);
    } catch {
      continue;
    }
  }
  return found.sort();
}

/**
 * Which files are tests.
 *
 * Deliberately narrow, and deliberately *only* tests. `assert(x)` in application source is a
 * runtime invariant check and none of this gate's business; the same shape inside a test file
 * is a claim that something happened, which proves nothing about what.
 */
export const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

/** Directory names whose contents are tests whatever the files are called. */
const TEST_DIRS = new Set(['test', 'tests', '__tests__', 'spec', 'e2e']);

/**
 * The matchers that assert existence instead of value.
 *
 * This list is the one in `CLAUDE.md` and in the builder's own contract, and it is short on
 * purpose. Every entry has no honest use as a whole assertion: if the expected value is known
 * — and in a test it always is — then `toBe(expected)` says it, and if it is not known then
 * the test is not testing anything. Anything outside this list is left alone, including
 * matchers this module has never heard of.
 */
const WEAK_MATCHER_RE = /\.(?:not\.)?(toBeTruthy|toBeFalsy|toBeDefined|toBeUndefined|toBeNull)\s*\(\s*\)/g;

/** `assert(` and `assert.ok(`, but not `assert.equal(` and not `myassert(`. */
const BARE_ASSERT_RE = /(?<![\w$])assert(\.ok)?\s*\(/g;

/**
 * Blank out comments, preserving every newline.
 *
 * Without this the gate fails on a file explaining why `toBeTruthy()` is forbidden, which is
 * the most irritating possible false positive: correct code, failed for describing the rule
 * it obeys. Newlines survive so reported line numbers still point at the right line.
 *
 * @param {string} source
 * @returns {string}
 */
export function blankComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replaceAll(/[^\n]/g, ' '))
    .replace(/(^|[^:\\])\/\/[^\n]*/g, (match, lead) => lead + ' '.repeat(match.length - lead.length));
}

/**
 * The argument list of a call, when it has exactly one argument.
 *
 * Balanced rather than regular, so `assert(list.includes(x))` is recognised as one argument
 * while `assert(a, b)` is recognised as two and left alone — the brief names the
 * single-argument form specifically, because a second argument is usually a message and this
 * module does not get to guess about the rest. Unbalanced input returns null and says
 * nothing: an opinion about a file that does not parse belongs to the lint gate.
 *
 * @param {string} source
 * @param {number} openIndex index of the `(`
 * @returns {string | null} the sole argument's text, or null
 */
function soleArgument(source, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    if (character === '(') depth += 1;
    else if (character === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex + 1, index);
    } else if (character === ',' && depth === 1) return null;
  }
  return null;
}

/**
 * Every truthiness-only assertion in one file's source.
 *
 * @param {string} source
 * @returns {{ line: number, snippet: string }[]} in source order
 */
export function weakAssertions(source) {
  const scanned = blankComments(source);
  /** @type {{ line: number, snippet: string }[]} */
  const found = [];

  /** @param {number} index */
  const lineOf = (index) => scanned.slice(0, index).split('\n').length;

  for (const match of scanned.matchAll(WEAK_MATCHER_RE)) {
    found.push({ line: lineOf(match.index), snippet: match[0].slice(1) });
  }

  for (const match of scanned.matchAll(BARE_ASSERT_RE)) {
    const argument = soleArgument(scanned, match.index + match[0].length - 1);
    if (argument === null || argument.trim().length === 0) continue;
    found.push({ line: lineOf(match.index), snippet: `assert${match[1] ?? ''}(${argument.trim()})` });
  }

  return found.sort((a, b) => a.line - b.line || a.snippet.localeCompare(b.snippet));
}

/**
 * Walk the tree for test files carrying truthiness-only assertions.
 *
 * A separate walk from `nocheckedFiles` rather than a shared one, because the two ask
 * different questions of different file sets and folding them together would mean one
 * predicate deciding both.
 *
 * @param {string} cwd
 * @param {string} [prefix] the path this directory sits at, relative to the repository root
 * @param {number} [depth]
 * @returns {string[]} `path:line - snippet`, sorted
 */
export function truthinessAssertions(cwd, prefix = '', depth = 0) {
  if (depth > 8) return [];
  /** @type {import('node:fs').Dirent[]} */
  let entries;
  try {
    entries = readdirSync(cwd, { withFileTypes: true });
  } catch {
    return [];
  }
  /** @type {string[]} */
  const found = [];
  for (const entry of entries) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      found.push(...truthinessAssertions(path.join(cwd, entry.name), relative, depth + 1));
      continue;
    }
    if (!entry.isFile()) continue;
    const inTestDir = relative.split('/').slice(0, -1).some((segment) => TEST_DIRS.has(segment));
    const named = TEST_FILE_RE.test(entry.name);
    if (!named && !(inTestDir && /\.[cm]?[jt]sx?$/.test(entry.name))) continue;
    /** @type {string} */
    let source;
    try {
      source = readFileSync(path.join(cwd, entry.name), 'utf8');
    } catch {
      continue;
    }
    for (const weak of weakAssertions(source)) {
      found.push(`${relative}:${weak.line} - ${weak.snippet}`);
    }
  }
  return found.sort();
}

/**
 * Judge whether the repository has weakened the gates that judge it.
 *
 * @param {string} cwd
 * @returns {IntegrityReport}
 */
export function inspectIntegrity(cwd) {
  /** @type {string[]} */
  const findings = [];

  /** @type {Record<string, string>} */
  let scripts;
  try {
    scripts = readGateScripts(cwd);
  } catch (error) {
    // Unparseable package.json: nothing here can be established, so nothing passes.
    return { ok: false, findings: [`package.json could not be parsed: ${/** @type {Error} */ (error).message}`] };
  }

  for (const name of GATE_SCRIPTS) {
    const body = scripts[name];
    if (body === undefined) continue;
    if (isNoOpScript(body)) {
      findings.push(`npm script ${JSON.stringify(name)} runs nothing: ${JSON.stringify(body)}`);
    }
  }

  for (const file of looseTsconfigs(cwd)) {
    findings.push(`${file} sets compilerOptions.strict to false`);
  }

  for (const file of nocheckedFiles(cwd)) {
    findings.push(`${file} disables type checking for the whole file with @ts-nocheck`);
  }

  for (const weak of truthinessAssertions(cwd)) {
    findings.push(`${weak} asserts existence, not a value`);
  }

  return { ok: findings.length === 0, findings };
}

/**
 * The gate result the driver reports.
 *
 * @param {string} cwd
 * @returns {{ name: string, ok: boolean, status: number, detail: string }}
 */
export function integrityGate(cwd) {
  const report = inspectIntegrity(cwd);
  return {
    name: 'gate-integrity',
    ok: report.ok,
    status: report.ok ? 0 : 1,
    detail: report.ok
      ? 'no gate script, tsconfig, source file or test assertion weakens the gates'
      : report.findings.join('; '),
  };
}
