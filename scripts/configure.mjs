#!/usr/bin/env node
/**
 * `node scripts/configure.mjs` — the operator's config wizard (DESIGN.md §10).
 *
 * Hand-authored JSON was the whole interface to `.meeseeks/config.json`: the schema lived in
 * the reader's memory and a typo cost a preflight round-trip to discover. This walks the
 * commonly-set groups as prompts instead. It owns **no** validation rule of its own — it
 * builds a plain object and hands it to `validateConfig`, so the wizard and the driver can
 * never disagree about what a valid config is.
 *
 * What it refuses to do, each on purpose:
 *
 * - **Run under `MEESEEKS_RUNNING`.** A process inside a run may not reshape the config that
 *   constrains it, and the check here is load-bearing rather than decorative: the guard hook
 *   travels with Claude Code tool calls, and a builder shelling out to this script in a plain
 *   subprocess would meet no hook at all. The refusal fires before any prompt and before any
 *   read of the target config.
 * - **Write on any failure path.** EOF mid-dialogue, a validation error re-prompting cannot
 *   repair, an unreadable or malformed existing file — all exit non-zero with nothing
 *   written. Nothing defaults to written.
 * - **Touch keys it does not ask about.** The existing file is the baseline and answers are
 *   merged over it, so `extraGates`, `effort` and anything else unasked ride through
 *   untouched, byte-for-byte in value.
 *
 * The one displayed promise: whatever is written for an asked key was either typed at its
 * prompt or shown in its brackets. A blank answer keeps the bracketed value — including a
 * value the validator is about to refuse, because silently repairing what the operator wrote
 * is worse than naming it and asking again.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';

import { ConfigError, defaultConfig, validateConfig, writeConfig } from './config.mjs';
import { REENTRANCY_ENV } from './driver.mjs';

/**
 * The dialogue seam. `ask` resolves the operator's answer, or `null` when input has ended —
 * ctrl-d on a terminal, an exhausted answer script in tests. `write` emits one line. Tests
 * inject both, so no test ever touches a tty.
 *
 * @typedef {{ ask: (question: string) => Promise<string | null>, write: (line: string) => void }} DialogueIo
 */

/** @typedef {'budgets' | 'loop' | 'race' | 'oracle' | 'deploy' | 'components'} GroupName */

/**
 * One numeric prompt's outcome. `typed: false` means blank kept what the brackets showed,
 * carried as-is even when it is unparseable garbage from the existing file — the validator,
 * not the wizard, is the one that gets to refuse it by name.
 *
 * @typedef {{ typed: true, value: number } | { typed: false, value: unknown }} NumberAnswer
 */

/** Thrown when input ends mid-dialogue. Caught in `main`; never crosses the process boundary. */
class InputEnded extends Error {
  constructor() {
    super('input ended before the dialogue finished');
    this.name = 'InputEnded';
  }
}

/**
 * @param {DialogueIo} io
 * @param {string} question
 * @returns {Promise<string>}
 */
async function ask(io, question) {
  const answer = await io.ask(question);
  if (answer === null) throw new InputEnded();
  return answer;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function display(value) {
  return value === undefined ? '' : JSON.stringify(value);
}

/**
 * Read one key out of a nested section, tolerating a section that is missing or is not an
 * object at all — `undefined` in both cases, so the prompt falls back to the default.
 *
 * @param {Record<string, unknown>} merged
 * @param {string} section
 * @param {string} key
 * @returns {unknown}
 */
function nestedValue(merged, section, key) {
  const value = merged[section];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return /** @type {Record<string, unknown>} */ (value)[key];
}

/**
 * Ask for a number. Blank keeps the bracketed value; anything unparseable re-prompts rather
 * than becoming NaN or silently keeping the default while claiming to accept the input. Only
 * *parseability* is judged here — range, integrality and meaning belong to `validateConfig`,
 * whose rules this file never restates.
 *
 * @param {DialogueIo} io
 * @param {string} label
 * @param {unknown} current the merged view's value, `undefined` when the key is unset
 * @param {number} fallback the scaffold default shown when there is nothing to keep
 * @returns {Promise<NumberAnswer>}
 */
async function askNumber(io, label, current, fallback) {
  const shown = current !== undefined ? current : fallback;
  for (;;) {
    const raw = (await ask(io, `${label} [${display(shown)}]: `)).trim();
    if (raw === '') return { typed: false, value: shown };
    const value = Number(raw);
    if (Number.isFinite(value)) return { typed: true, value };
    io.write(`not a number: ${JSON.stringify(raw)}`);
  }
}

/**
 * A number inside a list entry being built, where blank has no meaning: there is no existing
 * value to keep, so an empty answer re-prompts like an unparseable one.
 *
 * @param {DialogueIo} io
 * @param {string} label
 * @returns {Promise<number>}
 */
async function askEntryNumber(io, label) {
  for (;;) {
    const raw = (await ask(io, `${label}: `)).trim();
    if (raw !== '') {
      const value = Number(raw);
      if (Number.isFinite(value)) return value;
    }
    io.write(`not a number: ${JSON.stringify(raw)}`);
  }
}

/**
 * Ask yes or no. Blank keeps the bracketed value; anything else re-prompts, because a "maybe"
 * silently read as either answer is the wizard deciding for the operator.
 *
 * @param {DialogueIo} io
 * @param {string} label
 * @param {unknown} current
 * @param {boolean} fallback
 * @returns {Promise<{ value: unknown }>}
 */
async function askBoolean(io, label, current, fallback) {
  const shown = current !== undefined ? current : fallback;
  for (;;) {
    const raw = (await ask(io, `${label} (y/n) [${display(shown)}]: `)).trim().toLowerCase();
    if (raw === '') return { value: shown };
    if (raw === 'y' || raw === 'yes' || raw === 'true') return { value: true };
    if (raw === 'n' || raw === 'no' || raw === 'false') return { value: false };
    io.write(`answer y or n: ${JSON.stringify(raw)}`);
  }
}

/**
 * @param {DialogueIo} io
 * @param {string} label
 * @param {unknown} current
 * @param {string} fallback
 * @returns {Promise<unknown>}
 */
async function askString(io, label, current, fallback) {
  const shown = current !== undefined ? current : fallback;
  const raw = (await ask(io, `${label} [${display(shown)}]: `)).trim();
  return raw === '' ? shown : raw;
}

/**
 * @param {DialogueIo} io
 * @param {Record<string, unknown>} merged
 * @param {import('./config.mjs').MeeseeksConfig} defaults
 * @returns {Promise<Record<string, unknown>>}
 */
async function collectBudgets(io, merged, defaults) {
  io.write('budgets');
  /** @type {Record<string, unknown>} */
  const patch = {};
  patch.maxIterations = (await askNumber(io, 'maxIterations', merged.maxIterations, defaults.maxIterations)).value;
  patch.tokenCeiling = (await askNumber(io, 'tokenCeiling', merged.tokenCeiling, defaults.tokenCeiling)).value;
  patch.costCeiling = (await askNumber(io, 'costCeiling', merged.costCeiling, defaults.costCeiling)).value;
  // Asked in minutes — the unit the `--deadline` flag speaks — and stored as `deadlineMs`.
  // A blank keeps the stored milliseconds untouched rather than surviving a round trip
  // through minutes, so no floating-point detour can move a value the operator never typed.
  // A typed answer is rounded to the nearest millisecond, which is the storage granularity.
  const storedMs = merged.deadlineMs;
  const shownMinutes = typeof storedMs === 'number' ? storedMs / 60_000 : storedMs;
  const deadline = await askNumber(io, 'deadline in minutes (0 for none)', shownMinutes, defaults.deadlineMs / 60_000);
  patch.deadlineMs = deadline.typed
    ? Math.round(deadline.value * 60_000)
    : storedMs !== undefined
      ? storedMs
      : defaults.deadlineMs;
  return patch;
}

/**
 * @param {DialogueIo} io
 * @param {Record<string, unknown>} merged
 * @param {import('./config.mjs').MeeseeksConfig} defaults
 * @returns {Promise<Record<string, unknown>>}
 */
async function collectLoopShape(io, merged, defaults) {
  io.write('loop shape');
  /** @type {Record<string, unknown>} */
  const patch = {};
  patch.chaos = (await askNumber(io, 'chaos', merged.chaos, defaults.chaos)).value;
  patch.stallLimit = (await askNumber(io, 'stallLimit', merged.stallLimit, defaults.stallLimit)).value;
  return patch;
}

/**
 * @param {DialogueIo} io
 * @param {Record<string, unknown>} merged
 * @param {import('./config.mjs').MeeseeksConfig} defaults
 * @returns {Promise<Record<string, unknown>>}
 */
async function collectRace(io, merged, defaults) {
  io.write('race');
  /** @type {Record<string, unknown>} */
  const patch = {};
  const enabled = await askBoolean(io, 'race.enabled', nestedValue(merged, 'race', 'enabled'), defaults.race.enabled);
  patch.enabled = enabled.value;
  if (enabled.value === true) {
    patch.n = (await askNumber(io, 'race.n', nestedValue(merged, 'race', 'n'), defaults.race.n)).value;
    patch.after = (await askNumber(io, 'race.after', nestedValue(merged, 'race', 'after'), defaults.race.after)).value;
  }
  return patch;
}

/**
 * @param {DialogueIo} io
 * @param {Record<string, unknown>} merged
 * @param {import('./config.mjs').MeeseeksConfig} defaults
 * @returns {Promise<Record<string, unknown>>}
 */
async function collectOracle(io, merged, defaults) {
  io.write('oracle');
  const enabled = await askBoolean(io, 'oracle.enabled', nestedValue(merged, 'oracle', 'enabled'), defaults.oracle.enabled);
  return { enabled: enabled.value };
}

/**
 * Collect `deploy.command` one argument per prompt into an argv array — never by splitting a
 * string on whitespace, which is exactly §10.1's mangling trap: `ssh box 'cd /srv && ./x'`
 * split on spaces arrives as six tokens that mean something else. A blank first answer keeps
 * the current command when one exists; a blank later answer finishes the array. There is no
 * way to empty a non-empty list from here — that is a hand edit, not a blank.
 *
 * @param {DialogueIo} io
 * @param {unknown} current
 * @returns {Promise<string[] | undefined>} the replacement argv, or `undefined` to keep what is there
 */
async function collectCommand(io, current) {
  if (Array.isArray(current) && current.length > 0) {
    io.write(`deploy.command is ${JSON.stringify(current)}; blank keeps it, anything typed starts a replacement`);
  } else {
    io.write('deploy.command: one argument per prompt, blank to finish');
  }
  /** @type {string[]} */
  const args = [];
  for (;;) {
    // Pushed exactly as typed: an argument may legitimately contain spaces, and trimming
    // would be the wizard quietly rewriting the operator's input. Only the finish test trims.
    const raw = await ask(io, `deploy.command[${args.length}]: `);
    if (raw.trim() === '') return args.length === 0 ? undefined : args;
    args.push(raw);
  }
}

/**
 * Smoke checks as `{ path, status }` entries until a blank path. Same keep-or-replace
 * semantics as {@link collectCommand}.
 *
 * @param {DialogueIo} io
 * @param {unknown} current
 * @returns {Promise<{ path: string, status: number }[] | undefined>}
 */
async function collectSmoke(io, current) {
  if (Array.isArray(current) && current.length > 0) {
    io.write(`deploy.smoke is ${JSON.stringify(current)}; blank keeps it, anything typed starts a replacement`);
  } else {
    io.write('deploy.smoke: one check per entry, blank path to finish');
  }
  /** @type {{ path: string, status: number }[]} */
  const checks = [];
  for (;;) {
    const rawPath = (await ask(io, `deploy.smoke[${checks.length}].path: `)).trim();
    if (rawPath === '') return checks.length === 0 ? undefined : checks;
    const status = await askEntryNumber(io, `deploy.smoke[${checks.length}].status`);
    checks.push({ path: rawPath, status });
  }
}

/**
 * @param {DialogueIo} io
 * @param {Record<string, unknown>} merged
 * @param {import('./config.mjs').MeeseeksConfig} defaults
 * @returns {Promise<Record<string, unknown>>}
 */
async function collectDeploy(io, merged, defaults) {
  io.write('deploy');
  /** @type {Record<string, unknown>} */
  const patch = {};
  const enabled = await askBoolean(io, 'deploy.enabled', nestedValue(merged, 'deploy', 'enabled'), defaults.deploy.enabled);
  patch.enabled = enabled.value;
  // Nothing more is asked of a section that is switched off, mirroring the validator: the
  // baseline's other deploy keys ride through unchanged underneath this patch.
  if (enabled.value !== true) return patch;
  const command = await collectCommand(io, nestedValue(merged, 'deploy', 'command'));
  if (command !== undefined) patch.command = command;
  patch.url = await askString(io, 'deploy.url', nestedValue(merged, 'deploy', 'url'), defaults.deploy.url);
  const smoke = await collectSmoke(io, nestedValue(merged, 'deploy', 'smoke'));
  if (smoke !== undefined) patch.smoke = smoke;
  patch.timeoutMs = (await askNumber(io, 'deploy.timeoutMs', nestedValue(merged, 'deploy', 'timeoutMs'), defaults.deploy.timeoutMs)).value;
  return patch;
}

/**
 * Component entries until a blank name, with the reminder the spec demands: declaring a
 * component is only half a decision, because running one still requires
 * `--give-them-the-box` typed at launch — the wizard configures, it cannot permit.
 *
 * @param {DialogueIo} io
 * @param {Record<string, unknown>} merged
 * @returns {Promise<{ name: string, dir: string, spec: string }[] | undefined>}
 */
async function collectComponents(io, merged) {
  io.write('components');
  io.write('a configured component still requires --give-them-the-box typed at launch; the wizard configures, it cannot permit');
  const current = merged.components;
  if (Array.isArray(current) && current.length > 0) {
    io.write(`components is ${JSON.stringify(current)}; blank keeps it, anything typed starts a replacement`);
  } else {
    io.write('components: one { name, dir, spec } entry per component, blank name to finish');
  }
  /** @type {{ name: string, dir: string, spec: string }[]} */
  const entries = [];
  for (;;) {
    const name = (await ask(io, `components[${entries.length}].name: `)).trim();
    if (name === '') return entries.length === 0 ? undefined : entries;
    const dir = (await ask(io, `components[${entries.length}].dir: `)).trim();
    const spec = (await ask(io, `components[${entries.length}].spec: `)).trim();
    entries.push({ name, dir, spec });
  }
}

/**
 * Lay a group's answers over the merged object's nested section. An existing object section
 * is spread underneath so unasked keys inside it survive; an existing non-object value is
 * replaced, because there is nothing inside it to preserve and every key in the patch was
 * either typed at a prompt or shown in its brackets.
 *
 * @param {Record<string, unknown>} merged
 * @param {string} key
 * @param {Record<string, unknown>} patch
 */
function applySection(merged, key, patch) {
  if (Object.keys(patch).length === 0) return;
  const existing = merged[key];
  const base =
    existing !== null && typeof existing === 'object' && !Array.isArray(existing)
      ? /** @type {Record<string, unknown>} */ (existing)
      : {};
  merged[key] = { ...base, ...patch };
}

/** The prompt groups, in the order the spec gives them. */
const GROUP_ORDER = /** @type {GroupName[]} */ (['budgets', 'loop', 'race', 'oracle', 'deploy', 'components']);

/** Which group each top-level config key is asked in. Unlisted keys are never asked. */
const GROUP_FOR_KEY = new Map([
  ['maxIterations', 'budgets'],
  ['tokenCeiling', 'budgets'],
  ['costCeiling', 'budgets'],
  ['deadlineMs', 'budgets'],
  ['chaos', 'loop'],
  ['stallLimit', 'loop'],
  ['race', 'race'],
  ['oracle', 'oracle'],
  ['deploy', 'deploy'],
  ['components', 'components'],
]);

/**
 * Which prompt group a `ConfigError` belongs to, or `null` when re-prompting cannot repair it
 * — an unasked key like `extraGates`, or a file that is not an object at all. Every message
 * `validateConfig` produces leads with the offending key path, so the first identifier is the
 * routing fact; a message that leads with anything else routes nowhere and exits non-zero.
 *
 * @param {string} message
 * @returns {GroupName | null}
 */
export function groupForConfigError(message) {
  const match = /^([A-Za-z][A-Za-z0-9]*)/.exec(message);
  if (match === null) return null;
  return /** @type {GroupName | undefined} */ (GROUP_FOR_KEY.get(match[1])) ?? null;
}

/**
 * Run one group's prompts over the current merged object and return the next one. Called once
 * per group on the way through, and again for a single group when validation names one of its
 * keys — with the merged object as it now stands, so the brackets show the answers already
 * given rather than sending the operator back to the file's original values.
 *
 * @param {GroupName} group
 * @param {DialogueIo} io
 * @param {Record<string, unknown>} merged
 * @param {import('./config.mjs').MeeseeksConfig} defaults
 * @returns {Promise<Record<string, unknown>>}
 */
async function runGroup(group, io, merged, defaults) {
  const next = { ...merged };
  switch (group) {
    case 'budgets':
      Object.assign(next, await collectBudgets(io, merged, defaults));
      break;
    case 'loop':
      Object.assign(next, await collectLoopShape(io, merged, defaults));
      break;
    case 'race':
      applySection(next, 'race', await collectRace(io, merged, defaults));
      break;
    case 'oracle':
      applySection(next, 'oracle', await collectOracle(io, merged, defaults));
      break;
    case 'deploy':
      applySection(next, 'deploy', await collectDeploy(io, merged, defaults));
      break;
    case 'components': {
      const entries = await collectComponents(io, merged);
      if (entries !== undefined) next.components = entries;
      break;
    }
  }
  return next;
}

/**
 * The real-stdin seam over `node:readline/promises`, used only when no `ask` is injected.
 *
 * Lines are buffered rather than asked for with `rl.question`, and the difference is not a
 * refinement: `rl.question` only captures a line that arrives while it is pending, so piped
 * input — `printf '12\n...' | node scripts/configure.mjs` — floods the interface in one
 * chunk, every line past the pending question is dropped, and a fully-answered dialogue
 * reads as a false EOF. Buffering serves the tty and the pipe with the same code.
 *
 * `ask` resolves `null` once the interface closes with nothing buffered — ctrl-d, or a pipe
 * running out of lines. A close that left the promise pending forever would let the process
 * fall off the event loop and exit zero, an aborted dialogue reading as a completed one;
 * `main` turns the `null` into a non-zero exit with nothing written.
 *
 * @param {{ input?: NodeJS.ReadableStream, output?: NodeJS.WritableStream }} [streams]
 * @returns {{ ask: (question: string) => Promise<string | null>, close: () => void }}
 */
export function terminalIo(streams = {}) {
  const output = streams.output ?? process.stdout;
  const rl = createInterface({ input: streams.input ?? process.stdin, output });
  /** @type {string[]} */
  const buffered = [];
  /** @type {((line: string | null) => void) | null} */
  let waiting = null;
  let closed = false;
  rl.on('line', (line) => {
    if (waiting !== null) {
      const resolve = waiting;
      waiting = null;
      resolve(line);
    } else {
      buffered.push(line);
    }
  });
  rl.once('close', () => {
    closed = true;
    if (waiting !== null) {
      const resolve = waiting;
      waiting = null;
      resolve(null);
    }
  });
  return {
    ask: (question) => {
      output.write(question);
      if (buffered.length > 0) return Promise.resolve(/** @type {string} */ (buffered.shift()));
      if (closed) return Promise.resolve(null);
      return new Promise((resolve) => {
        waiting = resolve;
      });
    },
    close: () => rl.close(),
  };
}

/**
 * @param {string[]} argv
 * @param {{
 *   ask?: (question: string) => Promise<string | null>,
 *   write?: (line: string) => void,
 *   cwd?: string,
 *   env?: Record<string, string | undefined>,
 * }} [io]
 * @returns {Promise<number>} process exit code
 */
export async function main(argv, io = {}) {
  const write = io.write ?? ((/** @type {string} */ line) => process.stdout.write(`${line}\n`));
  const env = io.env ?? process.env;
  const cwd = io.cwd ?? process.cwd();

  // Before any prompt and before any read of the target config. The empty string counts as
  // unset, exactly as `assertNotNested` in the driver reads the same marker.
  if (env[REENTRANCY_ENV] !== undefined && env[REENTRANCY_ENV] !== '') {
    write(`a meeseeks run is in progress (${REENTRANCY_ENV} is set): a process inside a run may not reshape the config that constrains it.`);
    return 1;
  }

  const unknown = argv.filter((argument) => argument !== '--show');
  if (unknown.length > 0) {
    write(`unknown argument${unknown.length === 1 ? '' : 's'}: ${unknown.join(' ')}. The only flag is --show.`);
    return 1;
  }
  const show = argv.includes('--show');

  const meeseeksDir = path.join(cwd, '.meeseeks');
  const file = path.join(meeseeksDir, 'config.json');

  /** @type {Record<string, unknown>} */
  let baseline = {};
  /** @type {string | null} */
  let raw = null;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') {
      write(`${file} could not be read: ${/** @type {Error} */ (error).message}`);
      return 1;
    }
  }
  if (raw !== null) {
    /** @type {unknown} */
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      // Refused rather than treated as absent: rebuilding over a file that failed to parse
      // would overwrite whatever it was trying to say. Repairing broken JSON is a hand edit.
      write(`${file} is not valid JSON: ${/** @type {Error} */ (error).message}`);
      return 1;
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      write(`${file} does not contain a JSON object; got ${JSON.stringify(parsed)}`);
      return 1;
    }
    baseline = /** @type {Record<string, unknown>} */ (parsed);
  }

  if (show) {
    // The file merged over defaults, through the validator — the config as written, not as a
    // run would see it: run-time env overrides (MEESEEKS_CHAOS and kin) are applied at launch
    // by `loadConfig` and deliberately not here. Printed as bare JSON so it can be piped;
    // never prompts, never writes.
    try {
      write(JSON.stringify(validateConfig(baseline), null, 2));
      return 0;
    } catch (error) {
      if (!(error instanceof ConfigError)) throw error;
      write(error.message);
      return 1;
    }
  }

  const defaults = defaultConfig();
  /** @type {Record<string, unknown>} */
  let merged = { ...baseline };

  const terminal = io.ask === undefined ? terminalIo() : null;
  /** @type {DialogueIo} */
  const dialogue = { ask: io.ask ?? (/** @type {NonNullable<ReturnType<typeof terminalIo>>} */ (terminal)).ask, write };

  try {
    write(`configuring ${file}`);
    for (const group of GROUP_ORDER) {
      merged = await runGroup(group, dialogue, merged, defaults);
    }

    // The final act before writing. A failure names the key; when the key belongs to a group
    // this wizard asks, that one group runs again over the answers so far. Two exits are
    // honest, non-zero, and write nothing: an error no group can be routed to at all, and an
    // error that survives a full re-prompt **byte-identical** — the group's prompts cannot
    // reach the offending key (an unknown key inside a section, a poisoned key behind a
    // disabled `enabled`), so asking the same questions again would repeat the same sentence
    // forever with ctrl-d as the only door out. Identical-after-a-round is the detector
    // because it needs no knowledge of which keys a group asks: a typed repair changes the
    // message, a blank round against an unreachable key cannot.
    /** @type {string | null} */
    let previousFailure = null;
    for (;;) {
      try {
        validateConfig(merged);
        break;
      } catch (error) {
        if (!(error instanceof ConfigError)) throw error;
        write(error.message);
        const group = groupForConfigError(error.message);
        if (group === null) {
          write('nothing was written.');
          return 1;
        }
        if (error.message === previousFailure) {
          write(
            `re-prompting ${group} did not repair this: no prompt in that group reaches the ` +
              `offending key. Edit ${file} by hand; nothing was written.`,
          );
          return 1;
        }
        previousFailure = error.message;
        merged = await runGroup(group, dialogue, merged, defaults);
      }
    }

    // The merged object is written, not the validator's return: `validateConfig` fills every
    // default in, and materialising thirty keys the operator never touched would pin today's
    // defaults into their file and bury the keys they actually chose. What is written is the
    // baseline plus the dialogue — which is also what makes the unasked keys survive
    // byte-for-byte.
    const written = writeConfig(meeseeksDir, /** @type {import('./config.mjs').MeeseeksConfig} */ (/** @type {unknown} */ (merged)));
    write(`wrote ${written}`);
    return 0;
  } catch (error) {
    if (error instanceof InputEnded) {
      write('input ended before the dialogue finished; nothing was written.');
      return 1;
    }
    throw error;
  } finally {
    terminal?.close();
  }
}

const invokedDirectly =
  typeof process.argv[1] === 'string' && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  process.exitCode = await main(process.argv.slice(2));
}
