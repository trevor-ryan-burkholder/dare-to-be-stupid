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
      ? 'no gate script, tsconfig or source file weakens the gates'
      : report.findings.join('; '),
  };
}
