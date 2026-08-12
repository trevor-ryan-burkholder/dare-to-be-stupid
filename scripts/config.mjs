/**
 * `.dare/config.json` — defaults, validation, scaffolding (DESIGN.md §10).
 *
 * Validation is strict on purpose. An unknown key is an error rather than a shrug: a
 * typo'd `maxIteration` that silently keeps the default would let an unattended run
 * behave nothing like the operator asked, and they would have no way to tell.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { DEFAULT_MAX_PROMPT_CHARACTERS } from './context-budget.mjs';

/** @typedef {{ enabled: boolean, command: string }} DeployConfig */
/** @typedef {{ after: number }} RealityCheckConfig */
/** @typedef {{ enabled: boolean }} DareMeConfig */
/** @typedef {{ enabled: boolean, n: number, after: number }} RaceConfig */
/** @typedef {{ minConfidence: number }} AdvisoryConfig */
/** @typedef {{ enabled: boolean, maxPerBrief: number }} LessonsConfig */
/** @typedef {{ maxCharacters: number }} ContextBudgetConfig */
/**
 * @typedef {{
 *   maxIterations: number, stallLimit: number, tokenCeiling: number, costCeiling: number,
 *   reviewers: string[], ownership: Record<string, string[]>, requireUnanimous: boolean,
 *   builderModel: string, reviewerModel: string, designModel: string,
 *   prdModel: string, styleModel: string, lessonModel: string,
 *   qualityPlugins: string[], deploy: DeployConfig, extractTests: boolean,
 *   chaos: number, realityCheck: RealityCheckConfig, dareMe: DareMeConfig, race: RaceConfig,
 *   advisory: AdvisoryConfig, lessons: LessonsConfig, contextBudget: ContextBudgetConfig
 * }} DareConfig
 */

/** Thrown when configuration cannot be trusted. */
export class ConfigError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

const CONFIG_FILE = 'config.json';

/**
 * Who owns which ids (DESIGN.md §1.1).
 *
 * The panel is heterogeneous: three specialists, not three generalists re-reading the whole
 * repository. That only means anything if each one is handed a different question, so
 * ownership is declared here rather than left to the prompt. A `*` matches any run of
 * characters; everything else is literal.
 *
 * The split follows §1.1's own description of the panel. The correctness auditor owns the
 * PRD requirements and the DoD line that aggregates them; the security auditor owns the
 * security line; the design auditor owns the rest of the DoD, which is where CI, docs,
 * observability and design coherence live.
 *
 * @type {Record<string, string[]>}
 */
export const DEFAULT_OWNERSHIP = {
  security: ['DoD-2-security'],
  // `DoD-6-adversarial-input` goes to correctness rather than security: it asks whether the
  // program ever reports a confidently wrong answer, which is a truthfulness question. The
  // reviewer that already executes the binary against the PRD is the one holding the tools
  // to answer it — run 9's correctness auditor found the defect unprompted and had nowhere
  // to file it that counted.
  correctness: ['PRD-*', 'DoD-1-requirements', 'DoD-6-adversarial-input'],
  design: ['DoD-3-ci', 'DoD-4-docs-observability', 'DoD-5-design'],
};

/**
 * The defaults from DESIGN.md §10.
 * @returns {DareConfig}
 */
export function defaultConfig() {
  return {
    maxIterations: 25,
    stallLimit: 4,
    tokenCeiling: 4_000_000,
    // Tokens bound work; only this bounds money, and the two are not interchangeable. The
    // first dogfood run measured 20,223,215 tokens at $9.43 — $0.47 per million, because cache
    // reads dominated the count. The same token figure at uncached input rates would have been
    // an order of magnitude dearer, so no token number can be converted into a bill.
    //
    // Set generously on purpose: it is a backstop against a pathological run rather than a
    // per-run budget, and a default that fired before `tokenCeiling` in ordinary operation
    // would make every run stop for the wrong stated reason.
    costCeiling: 50,
    reviewers: ['security', 'correctness', 'design'],
    ownership: Object.fromEntries(Object.entries(DEFAULT_OWNERSHIP).map(([reviewer, ids]) => [reviewer, [...ids]])),
    requireUnanimous: true,
    builderModel: 'claude-sonnet-5',
    reviewerModel: 'claude-opus-5',
    designModel: 'claude-opus-5',
    prdModel: 'claude-sonnet-5',
    styleModel: 'claude-fable-5',
    lessonModel: 'claude-sonnet-5',
    // impeccable is required and fails a run it cannot provision; knip and semgrep are
    // optional and degrade to a warning, because neither is worth killing a run over on a
    // machine without python3 or a reachable registry (DESIGN.md §5.1).
    qualityPlugins: ['impeccable', 'knip', 'semgrep'],
    deploy: { enabled: false, command: '' },
    extractTests: true,
    chaos: 1,
    realityCheck: { after: 3 },
    dareMe: { enabled: true },
    race: { enabled: false, n: 3, after: 2 },
    advisory: { minConfidence: 0.7 },
    lessons: { enabled: true, maxPerBrief: 3 },
    // Characters, not tokens, and deliberately so — see `context-budget.mjs`. There is no
    // "disabled" setting: a run whose prompt has grown past this needs an operator to decide
    // it is legitimate and raise the number, which is a decision, where switching the check
    // off is a way of not making one.
    contextBudget: { maxCharacters: DEFAULT_MAX_PROMPT_CHARACTERS },
  };
}

/** Reviewer names the panel understands (DESIGN.md §1.1). */
const KNOWN_REVIEWERS = new Set(['security', 'correctness', 'design']);

/**
 * @param {unknown} value
 * @param {string} key
 * @returns {number}
 */
function requirePositiveInteger(value, key) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new ConfigError(`${key} must be a positive integer; got ${JSON.stringify(value)}.`);
  }
  return value;
}

/**
 * A positive amount of money. Not an integer: a ceiling of $2.50 is a reasonable thing to want,
 * and rounding it to $2 or $3 would silently change what the operator asked for.
 *
 * @param {unknown} value
 * @param {string} key
 * @returns {number}
 */
function requirePositiveNumber(value, key) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new ConfigError(`${key} must be a positive, finite number; got ${JSON.stringify(value)}.`);
  }
  return value;
}

/**
 * A confidence, not a count. Advisory findings carry one, and the threshold they are
 * compared against has to live on the same scale.
 *
 * @param {unknown} value
 * @param {string} key
 * @returns {number}
 */
function requireFraction(value, key) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new ConfigError(`${key} must be a number between 0 and 1; got ${JSON.stringify(value)}.`);
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} key
 * @returns {boolean}
 */
function requireBoolean(value, key) {
  if (typeof value !== 'boolean') throw new ConfigError(`${key} must be a boolean; got ${JSON.stringify(value)}.`);
  return value;
}

/**
 * @param {unknown} value
 * @param {string} key
 * @returns {string}
 */
function requireString(value, key) {
  if (typeof value !== 'string') throw new ConfigError(`${key} must be a string; got ${JSON.stringify(value)}.`);
  return value;
}

/**
 * @param {unknown} value
 * @param {string} key
 * @returns {string[]}
 */
function requireStringArray(value, key) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new ConfigError(`${key} must be an array of strings; got ${JSON.stringify(value)}.`);
  }
  return [.../** @type {string[]} */ (value)];
}

/**
 * @param {unknown} value
 * @param {string} key
 * @returns {Record<string, unknown>}
 */
function requireObject(value, key) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConfigError(`${key} must be an object; got ${JSON.stringify(value)}.`);
  }
  return /** @type {Record<string, unknown>} */ (value);
}

/**
 * @param {Record<string, unknown>} source
 * @param {Set<string>} allowed
 * @param {string} where
 */
function rejectUnknownKeys(source, allowed, where) {
  const unknown = Object.keys(source).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new ConfigError(
      `${where} has unknown key${unknown.length === 1 ? '' : 's'} ${unknown.map((k) => JSON.stringify(k)).join(', ')}. ` +
        'Refusing to ignore it: an unattended run would then behave differently from what was asked.',
    );
  }
}

/**
 * Merge a partial config over the defaults and validate the result.
 *
 * @param {unknown} input the parsed contents of `.dare/config.json`
 * @returns {DareConfig}
 * @throws {ConfigError}
 */
export function validateConfig(input) {
  const defaults = defaultConfig();
  const source = requireObject(input ?? {}, 'config');
  rejectUnknownKeys(source, new Set(Object.keys(defaults)), '.dare/config.json');

  /** @type {DareConfig} */
  const merged = { ...defaults };

  if ('maxIterations' in source) merged.maxIterations = requirePositiveInteger(source.maxIterations, 'maxIterations');
  if ('stallLimit' in source) merged.stallLimit = requirePositiveInteger(source.stallLimit, 'stallLimit');
  if ('tokenCeiling' in source) merged.tokenCeiling = requirePositiveInteger(source.tokenCeiling, 'tokenCeiling');
  if ('costCeiling' in source) merged.costCeiling = requirePositiveNumber(source.costCeiling, 'costCeiling');
  if ('requireUnanimous' in source) {
    merged.requireUnanimous = requireBoolean(source.requireUnanimous, 'requireUnanimous');
  }
  if ('extractTests' in source) merged.extractTests = requireBoolean(source.extractTests, 'extractTests');

  for (const key of /** @type {const} */ ([
    'builderModel',
    'reviewerModel',
    'designModel',
    'prdModel',
    'styleModel',
    'lessonModel',
  ])) {
    if (key in source) merged[key] = requireString(source[key], key);
  }

  if ('qualityPlugins' in source) merged.qualityPlugins = requireStringArray(source.qualityPlugins, 'qualityPlugins');

  if ('reviewers' in source) {
    const reviewers = requireStringArray(source.reviewers, 'reviewers');
    if (reviewers.length === 0) {
      throw new ConfigError('reviewers must not be empty; a run with no panel has no judge (DESIGN.md §1.1).');
    }
    const unknown = reviewers.filter((name) => !KNOWN_REVIEWERS.has(name));
    if (unknown.length > 0) {
      throw new ConfigError(
        `reviewers contains ${unknown.map((n) => JSON.stringify(n)).join(', ')}; known reviewers are ` +
          `${[...KNOWN_REVIEWERS].join(', ')}. A reviewer that does not exist cannot return a pass.`,
      );
    }
    merged.reviewers = reviewers;
  }

  if ('ownership' in source) {
    const ownership = requireObject(source.ownership, 'ownership');
    rejectUnknownKeys(ownership, KNOWN_REVIEWERS, 'ownership');
    /** @type {Record<string, string[]>} */
    const owned = {};
    for (const [reviewer, patterns] of Object.entries(ownership)) {
      const list = requireStringArray(patterns, `ownership.${reviewer}`);
      if (list.some((pattern) => pattern.trim().length === 0)) {
        throw new ConfigError(`ownership.${reviewer} contains an empty pattern, which would match nothing.`);
      }
      owned[reviewer] = list;
    }
    merged.ownership = owned;
  }

  if ('chaos' in source) {
    const chaos = requirePositiveInteger(source.chaos, 'chaos');
    if (chaos > 3) throw new ConfigError(`chaos must be 1, 2 or 3; got ${chaos} (DESIGN.md §13.4).`);
    merged.chaos = chaos;
  }

  if ('deploy' in source) {
    const deploy = requireObject(source.deploy, 'deploy');
    rejectUnknownKeys(deploy, new Set(['enabled', 'command']), 'deploy');
    merged.deploy = {
      enabled: 'enabled' in deploy ? requireBoolean(deploy.enabled, 'deploy.enabled') : defaults.deploy.enabled,
      command: 'command' in deploy ? requireString(deploy.command, 'deploy.command') : defaults.deploy.command,
    };
  }

  if ('realityCheck' in source) {
    const realityCheck = requireObject(source.realityCheck, 'realityCheck');
    rejectUnknownKeys(realityCheck, new Set(['after']), 'realityCheck');
    merged.realityCheck = {
      after:
        'after' in realityCheck
          ? requirePositiveInteger(realityCheck.after, 'realityCheck.after')
          : defaults.realityCheck.after,
    };
  }

  if ('dareMe' in source) {
    const dareMe = requireObject(source.dareMe, 'dareMe');
    rejectUnknownKeys(dareMe, new Set(['enabled']), 'dareMe');
    merged.dareMe = {
      enabled: 'enabled' in dareMe ? requireBoolean(dareMe.enabled, 'dareMe.enabled') : defaults.dareMe.enabled,
    };
  }

  if ('race' in source) {
    const race = requireObject(source.race, 'race');
    rejectUnknownKeys(race, new Set(['enabled', 'n', 'after']), 'race');
    merged.race = {
      enabled: 'enabled' in race ? requireBoolean(race.enabled, 'race.enabled') : defaults.race.enabled,
      n: 'n' in race ? requirePositiveInteger(race.n, 'race.n') : defaults.race.n,
      after: 'after' in race ? requirePositiveInteger(race.after, 'race.after') : defaults.race.after,
    };
  }

  if ('contextBudget' in source) {
    const contextBudget = requireObject(source.contextBudget, 'contextBudget');
    rejectUnknownKeys(contextBudget, new Set(['maxCharacters']), 'contextBudget');
    merged.contextBudget = {
      maxCharacters:
        'maxCharacters' in contextBudget
          ? requirePositiveInteger(contextBudget.maxCharacters, 'contextBudget.maxCharacters')
          : defaults.contextBudget.maxCharacters,
    };
  }

  if ('advisory' in source) {
    const advisory = requireObject(source.advisory, 'advisory');
    rejectUnknownKeys(advisory, new Set(['minConfidence']), 'advisory');
    merged.advisory = {
      minConfidence:
        'minConfidence' in advisory
          ? requireFraction(advisory.minConfidence, 'advisory.minConfidence')
          : defaults.advisory.minConfidence,
    };
  }

  if ('lessons' in source) {
    const lessons = requireObject(source.lessons, 'lessons');
    rejectUnknownKeys(lessons, new Set(['enabled', 'maxPerBrief']), 'lessons');
    merged.lessons = {
      enabled: 'enabled' in lessons ? requireBoolean(lessons.enabled, 'lessons.enabled') : defaults.lessons.enabled,
      maxPerBrief:
        'maxPerBrief' in lessons
          ? requirePositiveInteger(lessons.maxPerBrief, 'lessons.maxPerBrief')
          : defaults.lessons.maxPerBrief,
    };
  }

  return merged;
}

/**
 * Apply environment overrides (DESIGN.md §13.4). Only the stupidity dial is overridable;
 * everything else stays in the file so an unattended run is reproducible from the repo.
 *
 * @param {DareConfig} config
 * @param {Record<string, string | undefined>} env
 * @returns {DareConfig}
 */
export function applyEnvOverrides(config, env) {
  const raw = env.DARE_CHAOS;
  if (raw === undefined || raw === '') return config;
  const chaos = Number(raw);
  if (!Number.isInteger(chaos) || chaos < 1 || chaos > 3) {
    throw new ConfigError(`DARE_CHAOS must be 1, 2 or 3; got ${JSON.stringify(raw)}.`);
  }
  return { ...config, chaos };
}

/**
 * Read `.dare/config.json`.
 *
 * @param {string} dareDir
 * @param {{ env?: Record<string, string | undefined> }} [options]
 * @returns {DareConfig}
 * @throws {ConfigError} when the file is missing, unreadable, or invalid
 */
export function loadConfig(dareDir, options = {}) {
  const file = path.join(dareDir, CONFIG_FILE);
  /** @type {string} */
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
      throw new ConfigError(`${file} does not exist. Run \`dare init\` to scaffold it.`);
    }
    throw new ConfigError(`${file} could not be read: ${/** @type {Error} */ (error).message}`);
  }
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new ConfigError(`${file} is not valid JSON: ${/** @type {Error} */ (error).message}`);
  }
  return applyEnvOverrides(validateConfig(parsed), options.env ?? {});
}

/**
 * Write `.dare/config.json` atomically.
 *
 * @param {string} dareDir
 * @param {DareConfig} config
 * @returns {string} the path written
 */
export function writeConfig(dareDir, config) {
  mkdirSync(dareDir, { recursive: true });
  const file = path.join(dareDir, CONFIG_FILE);
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  renameSync(temporary, file);
  return file;
}

/**
 * Remotes a run must never be pointed at (DESIGN.md §10). Matching is on whole path
 * segments and hostname labels, so `my-production-app` is refused while an innocent
 * `procurement` repo is not.
 */
const RISKY_REMOTE_WORDS = ['prod', 'production', 'client', 'customer'];

/**
 * @param {string} remote a git remote URL or path
 * @returns {string | null} the word that made it risky, or null
 */
export function riskyRemoteWord(remote) {
  const segments = remote.toLowerCase().split(/[^a-z0-9]+/).filter((part) => part.length > 0);
  for (const word of RISKY_REMOTE_WORDS) {
    if (segments.includes(word)) return word;
  }
  return null;
}

/**
 * Create `.dare/config.json` if it is not already there.
 *
 * @param {string} dareDir
 * @returns {{ created: boolean, path: string, config: DareConfig }}
 */
export function initConfig(dareDir) {
  const file = path.join(dareDir, CONFIG_FILE);
  try {
    return { created: false, path: file, config: loadConfig(dareDir) };
  } catch (error) {
    if (!(error instanceof ConfigError) || !error.message.includes('does not exist')) throw error;
  }
  const config = defaultConfig();
  writeConfig(dareDir, config);
  return { created: true, path: file, config };
}
