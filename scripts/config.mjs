/**
 * `.meeseeks/config.json` — defaults, validation, scaffolding (DESIGN.md §10).
 *
 * Validation is strict on purpose. An unknown key is an error rather than a shrug: a
 * typo'd `maxIteration` that silently keeps the default would let an unattended run
 * behave nothing like the operator asked, and they would have no way to tell.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { DEFAULT_MAX_PROMPT_CHARACTERS } from './context-budget.mjs';
import { DEPLOY_TARGET_KINDS } from './deploy-target.mjs';

/**
 * Reasoning effort per phase, verified against `claude --help` and against a live child
 * rather than read: both `low` and `max` are accepted by a `-p` child and visibly move the
 * thinking-token count.
 *
 * The defaults follow §1.1's principle rather than a cost curve. **The judge is pinned at
 * `max`**, because the smartest thing in the loop should be the one deciding, and a verdict
 * that gets cheaper as a run gets more desperate is satisficing installed at the auditor.
 * `reality-check` and `security-escalation` sit high for the same reason in miniature: one can
 * end a run `ABORTED` and the other can trigger a hard reset. The lesson extractor is advisory
 * and returning `null` is an explicitly cheap answer, so it sits at the bottom.
 */
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];

/** @typedef {{ path: string, status: number }} SmokeCheck */
/** @typedef {{ name: string, dir: string, spec: string }} ComponentConfig */
/**
 * @typedef {{ enabled: boolean, command: string[],
 *   target: import('./deploy-target.mjs').DeployTarget | null,
 *   url: string, smoke: SmokeCheck[], timeoutMs: number }} DeployConfig
 * `target` is the declared host this build derives a command for; `command` is the escape hatch for
 * anything else. Exactly one may be set when the section is enabled (DESIGN.md §10.2).
 */
/** @typedef {{ after: number }} RealityCheckConfig */
/** @typedef {{ enabled: boolean }} ImproviseConfig */
/** @typedef {{ enabled: boolean, n: number, after: number }} RaceConfig */
/** @typedef {{ minConfidence: number }} AdvisoryConfig */
/** @typedef {{ enabled: boolean, maxPerBrief: number }} LessonsConfig */
/** @typedef {{ maxCharacters: number }} ContextBudgetConfig */
/** @typedef {{ enabled: boolean }} OracleConfig */
/** @typedef {{ enabled: boolean }} PanelCarryConfig */
/** @typedef {{ enabled: boolean }} SandboxConfig */
/**
 * @typedef {{
 *   maxIterations: number, stallLimit: number, tokenCeiling: number, costCeiling: number,
 *   childTimeoutMs: number, gateTimeoutMs: number, maxChildTurns: number, deadlineMs: number,
 *   reviewers: string[], ownership: Record<string, string[]>, requireUnanimous: boolean,
 *   builderModel: string, reviewerModel: string, designModel: string,
 *   prdModel: string, lessonModel: string,
 *   qualityPlugins: string[], extraGates: { name: string, command: string[] }[], childEnvAllow: string[],
 *   erd: string, schemaIntrospect: string[], dod: string, toolchain: string,
 *   components: ComponentConfig[],
 *   effort: Record<string, string>, oracle: OracleConfig,
 *   panelCarry: PanelCarryConfig, sandbox: SandboxConfig,
 *   deploy: DeployConfig, extractTests: boolean,
 *   chaos: number, realityCheck: RealityCheckConfig, improvise: ImproviseConfig, race: RaceConfig,
 *   advisory: AdvisoryConfig, lessons: LessonsConfig, contextBudget: ContextBudgetConfig
 * }} MeeseeksConfig
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
 * @returns {MeeseeksConfig}
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
    // **The overshoot bound is children-in-flight, not one child, since the parallel panel**
    // (0.143.0). A ceiling can only stop what has not been spawned; during review three cold
    // readers are already running when a breach is detected, so the spend past either ceiling
    // is bounded by all of them finishing — measured at up to 9.5M tokens for a single child.
    costCeiling: 50,
    // The third ceiling, and the only one that is a watchdog. `tokenCeiling` and `costCeiling`
    // bind a child that *returns*; neither can see one that does not, which made them read as
    // protection against a hang when they are accounting. The operator's report on 13 August
    // was that a run "will hang sometimes and sit there for hours until I say something", and
    // that is the gap it was sitting in.
    //
    // Thirty minutes, derived from measurement rather than taste: run 10's builders averaged
    // 470s and its slowest race candidate ran 651s, so this is roughly 2.8x the longest child
    // this project has ever observed. Killing a child that was working is the expensive wrong
    // answer — `runChild`'s own comment says so — which is why the margin is large and why the
    // number is configurable.
    childTimeoutMs: 1_800_000,
    // The same watchdog, for the other half of an iteration. A test suite holding an open
    // handle, a dev server a gate started and never reaped, a browser run waiting on a
    // selector that never arrives — each blocks the driver exactly as a hung child does.
    //
    // Unlike `childTimeoutMs` this number is **not derived from measurement**, and saying so
    // matters: no run in this project has ever recorded a per-gate duration, and mutation
    // testing is known to be the slow one without anybody knowing how slow. Forty-five minutes
    // is a guess sized to be embarrassing to hit. What would refine it is one run that logs
    // each gate's wall-clock; until that exists this is a backstop, not a budget.
    gateTimeoutMs: 2_700_000,
    // The fourth bound, and the only one that is **off by default**. `--max-turns` caps a
    // child's agentic turns, and unlike every ceiling above it there is no honest arithmetic
    // from a token or dollar budget to a number of turns — so any default here would be a
    // number nobody measured, wearing the authority of one. `gateTimeoutMs` above is at least
    // labelled a guess; this would not even be that.
    //
    // The dollar half of the same defence is derived and always on: `childBudget` in
    // `driver.mjs` passes `--max-budget-usd` from what the run has left. Zero here means the
    // flag is not passed at all. An operator who has measured their own turn counts can set it.
    maxChildTurns: 0,
    // A wall-clock ceiling on the whole run, in milliseconds. **Zero, and deliberately so:** a
    // run-level time limit was considered and refused — the ceiling is completion or budget.
    // It exists for `--give-them-the-box`, which arms it automatically, because permitting
    // nesting removes the assumption the other bounds rely on: depth is capped, but nothing caps
    // how many nested runs one iteration starts.
    deadlineMs: 0,
    // A8's carry (BRIEF.md A8, DESIGN.md §4.3). A requirement a cold reviewer already passed
    // with file:line evidence, whose evidenced file has not changed, is not re-argued on an
    // iteration that is going to fail anyway.
    //
    // On by default because it can only ever *skip work on a failing iteration*: a narrowed
    // panel that says pass triggers the full panel before any ship, so nothing carried can
    // reach a ship decision. The saving is real and the guarantee is unchanged.
    panelCarry: { enabled: true },
    // R19. An OS-level floor under the guard (DESIGN.md §6). Claude Code sandboxes with
    // bubblewrap on Linux/WSL2 and seatbelt on macOS.
    //
    // **Off by default, and that is a fact about hosts rather than a doubt about the idea.**
    // bubblewrap is a separate package - the CLI's own advice when it is missing is
    // `apt install bubblewrap` - and it is absent on the machine this was built on. Defaulting
    // this on would refuse every run on any host without it, because the driver refuses an
    // unsandboxed fallback rather than quietly proceeding. Arming it is an operator's decision
    // about their own machine, and `preflight` checks the machine before the run starts.
    //
    // The guard remains the primary limit either way. This is an added floor, never a
    // replaced one.
    sandbox: { enabled: false },
    reviewers: ['security', 'correctness', 'design'],
    ownership: Object.fromEntries(Object.entries(DEFAULT_OWNERSHIP).map(([reviewer, ids]) => [reviewer, [...ids]])),
    requireUnanimous: true,
    builderModel: 'claude-sonnet-5',
    reviewerModel: 'claude-opus-5',
    designModel: 'claude-opus-5',
    prdModel: 'claude-sonnet-5',
    lessonModel: 'claude-sonnet-5',
    // impeccable is required and fails a run it cannot provision; knip and semgrep are
    // optional and degrade to a warning, because neither is worth killing a run over on a
    // machine without python3 or a reachable registry (DESIGN.md §5.1).
    //
    // **gitleaks is in the default list, and that is the half of item 29 that makes it real.**
    // A plugin absent from this array is provisioned by nobody and gates nothing, so registering
    // one without listing it here builds a check that never runs — the same shape as a parser
    // imported only by its own test. It is detect-only, so on a machine without the binary it
    // costs one warning and no gate; on a machine with it, it is the only thing in the roster
    // that looks for a committed credential at all (npm audit judges dependencies, and semgrep's
    // ruleset is not a secrets scanner).
    qualityPlugins: ['impeccable', 'knip', 'semgrep', 'schemathesis', 'gitleaks'],
    // Empty by default, and an empty list changes nothing: a project that declares no gates of
    // its own gets exactly the roster it got before this key existed. See `requireExtraGates`
    // for why these are declared rather than detected, and why they live somewhere the builder
    // cannot reach.
    extraGates: [],
    // Names of environment variables a target's own tooling needs, which the child environment
    // keep-list would otherwise drop (REVIEW F5, PLAN item 56). **Names, never values** — the value
    // is read from the operator's own environment at spawn time, so nothing secret is written into
    // a config file, a receipt, or a log. Empty by default, because the measured minimum is enough
    // for the CLI and for npm, git and node; a project that needs more says which.
    //
    // It cannot name a marker the Driver owns. `childEnvironment` refuses that outright: a run whose
    // guard, depth or nesting marker could be introduced by configuration has no boundary to enforce.
    childEnvAllow: [],
    // Where an ERD lives, when it is not the conventional `ERD.md` beside the PRD (§4, item 47).
    // Empty means the convention, and the convention means "there is no ERD" when the file is
    // absent — an ERD is optional, and its absence gates nothing.
    erd: '',
    // How to read the live schema, for the `schema-conformance` gate (§3.6.1, item 47). Empty
    // means the gate does not arm.
    //
    // **Operator configuration, and that is the security decision.** It cannot come from the
    // toolchain, which knows nothing about the target's database, and it must not come from the
    // builder: a builder supplying the command that describes the schema it is judged on can
    // describe a conforming one, and the gate would confirm its own input. That is worse than a
    // stubbed test suite, which at least has to run — a fabricated introspection is one `echo`.
    // `.meeseeks/config.json` is positionally guarded, so this is the one place inside the
    // repository a running builder cannot reach.
    schemaIntrospect: [],
    // Where the operator's additive done-bar lives, when it is not the conventional `DOD.md` beside
    // the PRD (item 48). Empty means the convention; an absent file means there is no extra bar.
    dod: '',
    // The toolchain this project is, when the tree cannot be trusted to say (§3.7, §3.8, item 49).
    // Empty means detect. A declaration wins outright and detection only reports whether it agrees:
    // an operator knows what they are building, and a greenfield tree on iteration 1 knows nothing.
    // Case C is the reason this exists — an empty repository defaulted to node, the brief told the
    // builder its gates were npm, and the builder wrote TypeScript for somebody who asked for C#.
    //
    // `prose` (§3.8.3) is reachable **only** through this key. That adapter never detects, on any
    // tree, because a directory of markdown is a manuscript, a documentation site, a notes folder,
    // or this repository and the evidence does not distinguish them — so an artifact job is
    // declared or it does not happen.
    toolchain: '',
    // Empty by default, and an empty list changes nothing at all: no phase runs, no flag is
    // demanded, and a pre-components repository behaves exactly as it always did. Declaring one
    // is only half a decision — components are nested runs, so a run that declares any refuses
    // to start unless the operator also typed `--give-them-the-box` (PLAN item 24). The list
    // lives here, guard-protected like the rest of this file, so a builder can neither add a
    // component nor delete one.
    components: [],
    effort: {
      builder: 'medium',
      prd: 'medium',
      design: 'high',
      review: 'max',
      'reality-check': 'high',
      'lesson-extractor': 'low',
      'security-escalation': 'high',
      // It writes the only artifact judged against the specification rather than the code, once,
      // before anything exists to check it against. There is no cheaper moment to think hard.
      'oracle-author': 'max',
    },
    // A3, the held-out oracle. **Off by default, and that is not the usual cowardice.**
    //
    // §13 rejects an `enabled` flag on the context budget, arguing that switching a check off is
    // a way of not making a decision. That reasoning is about disabling a check already known to
    // work. Its failure mode is the worst in this codebase: a case that invents a requirement the
    // specification does not decide becomes a gate the builder cannot satisfy for the rest of the
    // run, and it cannot tell an invention from a real requirement. That defect class has bitten
    // seven times.
    //
    // It has since judged real builds (oracle1 19/19 at a false-failure rate of 0; oracle2, 14 Aug,
    // SHIPPED with the metamorphic relations catching real numeric defects and zero false failures),
    // and the default stays off for a narrower reason: oracle1 measured that exit-code-only cases
    // could not see run 12's defect class even planted back into the tree — the relations are the
    // half that can, with one live run behind them. The flag remains a staging device: what widens
    // the default is more live runs whose oracle failures are all genuine defects, not inventions.
    oracle: { enabled: false },
    // Ten minutes, and the number matters less than the fact that one exists. The deploy
    // command was the only call in the driver with no ceiling on it: `tokenCeiling` and
    // `costCeiling` bind children that return, and `runSmoke` carries its own deadline, so a
    // deploy that never returns stalled the run indefinitely with nothing to look at. An `ssh`
    // waiting on a passphrase prompt no unattended run can answer is the ordinary route there.
    // Generous enough for a remote build, finite either way.
    deploy: { enabled: false, command: [], target: null, url: '', smoke: [], timeoutMs: 600_000 },
    extractTests: true,
    chaos: 1,
    realityCheck: { after: 3 },
    improvise: { enabled: true },
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
 * A count that is allowed to be zero, where zero means **off** rather than "none allowed".
 *
 * Separate from `requirePositiveInteger` on purpose: for a ceiling, zero would be a ceiling of
 * nothing and must be refused, and conflating the two would let `maxIterations: 0` through.
 *
 * @param {unknown} value
 * @param {string} key
 * @returns {number}
 */
function requireCountOrZero(value, key) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new ConfigError(`${key} must be a non-negative integer, where 0 means off; got ${JSON.stringify(value)}.`);
  }
  return value;
}

/**
 * A non-negative, finite amount, where **zero means no ceiling**.
 *
 * The money counterpart to `requireCountOrZero`. Kept separate from `requirePositiveNumber`
 * because most amounts in this configuration genuinely must be positive, and a validator that
 * quietly accepted zero everywhere would let a typo disable a limit rather than refuse it.
 *
 * @param {unknown} value
 * @param {string} key
 * @returns {number}
 */
function requireAmountOrZero(value, key) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new ConfigError(`${key} must be a non-negative, finite number; got ${JSON.stringify(value)}.`);
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
/**
 * Validate a declared deploy target, so an operator supplies a host rather than an argv.
 *
 * Every field is required and none is guessed. `dir` in particular: `dist`, `out`, `build` and
 * `.next` all exist in the wild, and inventing the answer is the trap `templates/toolchain-prose.md`
 * refused when it declined to write `vale`'s command line. An operator who has to name the directory
 * once is better served than one whose deploy silently published the wrong one.
 *
 * The host is held to the same pre-production rule as `deploy.url`, because a target pointing at
 * something with users is the failure that rule exists for whichever field spells it.
 *
 * @param {unknown} value
 * @returns {import('./deploy-target.mjs').DeployTarget}
 */
function requireDeployTarget(value) {
  const target = requireObject(value, 'deploy.target');
  rejectUnknownKeys(target, new Set(['kind', 'host', 'user', 'dir', 'path']), 'deploy.target');
  const kind = requireString(target.kind, 'deploy.target.kind');
  if (!DEPLOY_TARGET_KINDS.includes(kind)) {
    throw new ConfigError(
      `deploy.target.kind must be one of ${DEPLOY_TARGET_KINDS.join(', ')}, got ${JSON.stringify(kind)}. ` +
        'A kind is refused rather than guessed at: a typo would otherwise be indistinguishable from a ' +
        'profile this build does not have.',
    );
  }
  const host = requireString(target.host, 'deploy.target.host');
  if (host.trim() === '') throw new ConfigError('deploy.target.host is empty: there is nothing to deploy to');
  const risky = riskyRemoteWord(host);
  if (risky !== null) {
    throw new ConfigError(
      `deploy.target.host contains ${risky}: meeseeks is pre-production only and never points at anything with users`,
    );
  }
  const dir = requireString(target.dir, 'deploy.target.dir');
  if (dir.trim() === '') throw new ConfigError('deploy.target.dir is empty: name the directory the build publishes');
  const remotePath = requireString(target.path, 'deploy.target.path');
  if (remotePath.trim() === '') throw new ConfigError('deploy.target.path is empty: name the directory on the host to publish into');
  // Defaulted rather than required, because a DigitalOcean droplet authenticates root by key on the
  // image it ships with, and that is the case this profile was proved against.
  const user = 'user' in target ? requireString(target.user, 'deploy.target.user') : 'root';
  if (user.trim() === '') throw new ConfigError('deploy.target.user is empty');
  return { kind, host, user, dir, path: remotePath };
}

/**
 * Validate the smoke list: one entry per request the deploy must answer correctly.
 *
 * Both fields are mandatory. A path with no expected status would make the check "did
 * anything answer", which a 500 satisfies; a status with no path names no request.
 *
 * @param {unknown} value
 * @returns {{ path: string, status: number }[]}
 */
function requireSmokeChecks(value) {
  if (!Array.isArray(value)) throw new ConfigError('deploy.smoke must be an array of { path, status } objects');
  return value.map((entry, index) => {
    const where = `deploy.smoke[${index}]`;
    const check = requireObject(entry, where);
    rejectUnknownKeys(check, new Set(['path', 'status']), where);
    if (!('path' in check)) throw new ConfigError(`${where} has no path: there is no request to make`);
    if (!('status' in check)) {
      throw new ConfigError(`${where} has no status: "did anything answer" is satisfied by a 500`);
    }
    const path_ = requireString(check.path, `${where}.path`);
    if (!path_.startsWith('/')) throw new ConfigError(`${where}.path must start with /, got ${path_}`);
    return { path: path_, status: requirePositiveInteger(check.status, `${where}.status`) };
  });
}

/**
 * Validate the operator's own gates: checks this project considers gating that no toolchain knows.
 *
 * **Why this exists.** The gate roster is derived from the detected toolchain and the provisioned
 * quality plugins, so a verification a project declares for itself is invisible to the loop. This
 * repository is its own example: `npm run release-check` holds the install-cache invariant —
 * shipped file changed, version not bumped, and the fix silently resolves to the previous build —
 * and a builder could break it every iteration without a single gate noticing.
 *
 * **Why config rather than detection.** Guessing which of a project's scripts are gating is the
 * kind of inference that is wrong quietly. An operator naming them is unambiguous, and `.meeseeks/`
 * is positionally protected (§6), so a gate declared here is one the builder cannot delete —
 * which is the whole difference between a gate and a suggestion. `BRIEF.md` §E rejects thresholds
 * that adapt because they make gates negotiable by the thing they constrain; a builder-editable
 * gate list would be the same error with more steps.
 *
 * Both fields are mandatory and the command is argv, never a shell string: a gate assembled by a
 * shell is a gate whose meaning depends on the shell.
 *
 * @param {unknown} value
 * @returns {{ name: string, command: string[] }[]}
 */
function requireExtraGates(value) {
  if (!Array.isArray(value)) throw new ConfigError('extraGates must be an array of { name, command } objects');
  return value.map((entry, index) => {
    const where = `extraGates[${index}]`;
    const gate = requireObject(entry, where);
    rejectUnknownKeys(gate, new Set(['name', 'command']), where);
    if (!('name' in gate)) throw new ConfigError(`${where} has no name: a gate nothing can be called by`);
    if (!('command' in gate)) throw new ConfigError(`${where} has no command: there is nothing to run`);
    const name = requireString(gate.name, `${where}.name`).trim();
    if (name === '') throw new ConfigError(`${where}.name is empty`);
    const command = requireStringArray(gate.command, `${where}.command`);
    // An empty argv would spawn nothing and report whatever the runner does with no program.
    // Nothing here defaults to pass, and a gate that cannot run is a failure rather than a skip.
    if (command.length === 0) throw new ConfigError(`${where}.command is empty: there is nothing to run`);
    return { name, command };
  });
}

/**
 * What a component's name may look like: lower-case letters and digits, single hyphens between
 * runs of them. The name is not a label — it becomes the branch `meeseeks/component-<name>` and
 * the worktree directory `meeseeks-component-<name>`, so anything git or a filesystem could
 * mangle is refused rather than escaped.
 */
const COMPONENT_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validate the component list: subtrees the driver hands to nested runs of itself (PLAN item 24).
 *
 * **Strict for the same reason `extraGates` is, with one extra stake.** Each entry causes a whole
 * driver to be spawned in a worktree with a budget carved from this run's remainder, so a typo
 * here is not a wrong setting — it is an unattended process working on the wrong directory
 * against the wrong specification. And the config file cannot be allowed to *smuggle* anything:
 * the permission to nest at all is `--give-them-the-box`, typed by the operator, and is checked
 * in the driver rather than here because a validator cannot see the command line.
 *
 * `dir` must stay inside the repository. An absolute path or a `..` segment would point a child
 * driver — running with the builder's full permissions — at a tree the operator never named, so
 * both are refused outright rather than normalised: a path that needed normalising is a path
 * whose meaning depended on who read it.
 *
 * @param {unknown} value
 * @returns {ComponentConfig[]}
 */
function requireComponents(value) {
  if (!Array.isArray(value)) throw new ConfigError('components must be an array of { name, dir, spec } objects');
  /** @type {Set<string>} */
  const seen = new Set();
  return value.map((entry, index) => {
    const where = `components[${index}]`;
    const component = requireObject(entry, where);
    rejectUnknownKeys(component, new Set(['name', 'dir', 'spec']), where);
    if (!('name' in component)) throw new ConfigError(`${where} has no name: a component nothing can be called by`);
    if (!('dir' in component)) throw new ConfigError(`${where} has no dir: there is no subtree to run in`);
    if (!('spec' in component)) throw new ConfigError(`${where} has no spec: there is nothing to build`);
    const name = requireString(component.name, `${where}.name`).trim();
    if (!COMPONENT_NAME_PATTERN.test(name)) {
      throw new ConfigError(
        `${where}.name must be lower-case letters and digits separated by single hyphens, because it names ` +
          `a git branch and a worktree directory; got ${JSON.stringify(component.name)}`,
      );
    }
    if (seen.has(name)) {
      throw new ConfigError(
        `${where}.name ${JSON.stringify(name)} is declared twice; two components cannot share the branch ` +
          `meeseeks/component-${name}`,
      );
    }
    seen.add(name);
    const dir = requireString(component.dir, `${where}.dir`);
    if (dir.trim() === '') throw new ConfigError(`${where}.dir is empty: there is no subtree to run in`);
    // Absolute in any dialect: POSIX, Windows drive-letter, UNC. `path.isAbsolute` answers for
    // the platform this happens to run on, and a config file travels between platforms.
    if (path.isAbsolute(dir) || /^[A-Za-z]:[\\/]/.test(dir) || dir.startsWith('\\\\')) {
      throw new ConfigError(`${where}.dir must be a path relative to the repository root, got ${JSON.stringify(dir)}`);
    }
    // Any `..` segment, not only a leading one: `a/../../b` escapes just as surely, and even a
    // `..` that happens to resolve inside the repository is a path whose meaning depends on
    // what sits beside it.
    if (dir.split(/[\\/]+/).includes('..')) {
      throw new ConfigError(`${where}.dir must not contain "..": a component may not reach outside the repository (${JSON.stringify(dir)})`);
    }
    const spec = requireString(component.spec, `${where}.spec`);
    if (spec.trim() === '') throw new ConfigError(`${where}.spec is empty: a nested run with nothing to build would improvise`);
    return { name, dir, spec };
  });
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
 * @param {unknown} input the parsed contents of `.meeseeks/config.json`
 * @returns {MeeseeksConfig}
 * @throws {ConfigError}
 */
export function validateConfig(input) {
  const defaults = defaultConfig();
  const source = requireObject(input ?? {}, 'config');
  // Retired keys are *known* — they are simply ignored (REVIEW F23). Rejecting them here would make
  // strict validation refuse a config that works today, which turns a documentation defect into a
  // broken target; `deprecationNotices` is what makes the tolerance loud rather than silent.
  rejectUnknownKeys(
    source,
    new Set([...Object.keys(defaults), ...Object.keys(DEPRECATED_CONFIG_KEYS)]),
    '.meeseeks/config.json',
  );

  /** @type {MeeseeksConfig} */
  const merged = { ...defaults };

  if ('maxIterations' in source) merged.maxIterations = requirePositiveInteger(source.maxIterations, 'maxIterations');
  if ('stallLimit' in source) merged.stallLimit = requirePositiveInteger(source.stallLimit, 'stallLimit');
  // Zero is accepted and means **no ceiling** — see `shouldContinue`. Intended for development
  // and dogfooding where spend is not the constraint. `maxIterations`, the stall limit and the
  // ratchet still bound the run, so this removes a limit on the bill and not on termination.
  if ('tokenCeiling' in source) merged.tokenCeiling = requireCountOrZero(source.tokenCeiling, 'tokenCeiling');
  if ('costCeiling' in source) merged.costCeiling = requireAmountOrZero(source.costCeiling, 'costCeiling');
  if ('childTimeoutMs' in source) merged.childTimeoutMs = requirePositiveInteger(source.childTimeoutMs, 'childTimeoutMs');
  if ('maxChildTurns' in source) merged.maxChildTurns = requireCountOrZero(source.maxChildTurns, 'maxChildTurns');
  if ('deadlineMs' in source) merged.deadlineMs = requireCountOrZero(source.deadlineMs, 'deadlineMs');
  if ('gateTimeoutMs' in source) merged.gateTimeoutMs = requirePositiveInteger(source.gateTimeoutMs, 'gateTimeoutMs');
  if ('requireUnanimous' in source) {
    merged.requireUnanimous = requireBoolean(source.requireUnanimous, 'requireUnanimous');
  }
  if ('extractTests' in source) merged.extractTests = requireBoolean(source.extractTests, 'extractTests');

  for (const key of /** @type {const} */ ([
    'builderModel',
    'reviewerModel',
    'designModel',
    'prdModel',
    'lessonModel',
  ])) {
    if (key in source) merged[key] = requireString(source[key], key);
  }

  // **`styleModel` is accepted and ignored, loudly** (REVIEW F23). It was a validated setting that
  // no `spawnClaude` path ever read: narration is the deterministic `style.mjs` render layer, and
  // bare `/meeseeks` sends idea invention *and* PRD authoring through `prdModel`. An operator could
  // set it, pass strict validation, observe no behavioural or cost change, and then read `run.json`
  // claiming that model participated — a false control that also makes model comparisons unreliable.
  //
  // Removing the key outright would make strict validation reject a config that works today, which
  // turns a documentation defect into a broken target. So it is accepted for one deprecation window
  // and announced as ignored, naming the control that actually exists. It is *not* repurposed into
  // a new model call: inventing behaviour to justify a setting is how the false control got here.
  if ('styleModel' in source) requireString(source.styleModel, 'styleModel');

  if ('qualityPlugins' in source) merged.qualityPlugins = requireStringArray(source.qualityPlugins, 'qualityPlugins');
  if ('extraGates' in source) merged.extraGates = requireExtraGates(source.extraGates);
  if ('childEnvAllow' in source) merged.childEnvAllow = requireStringArray(source.childEnvAllow, 'childEnvAllow');
  if ('erd' in source) merged.erd = requireString(source.erd, 'erd');
  if ('dod' in source) merged.dod = requireString(source.dod, 'dod');
  if ('toolchain' in source) merged.toolchain = requireString(source.toolchain, 'toolchain');
  if ('schemaIntrospect' in source) {
    merged.schemaIntrospect = requireStringArray(source.schemaIntrospect, 'schemaIntrospect');
  }
  if ('components' in source) merged.components = requireComponents(source.components);

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

  if ('effort' in source) {
    const effort = requireObject(source.effort, 'effort');
    // Keyed by the phase names the driver already uses, so there is no mapping table between
    // this and PHASE_PERMISSIONS to drift apart. An unknown phase is an error for the reason
    // every unknown key here is: an effort nobody applies is a setting that silently does
    // nothing, and an unattended run acts on this file for hours.
    rejectUnknownKeys(effort, new Set(Object.keys(defaults.effort)), 'effort');
    /** @type {Record<string, string>} */
    const merged_ = { ...defaults.effort };
    for (const [phase, level] of Object.entries(effort)) {
      const value = requireString(level, `effort.${phase}`);
      if (!EFFORT_LEVELS.includes(value)) {
        throw new ConfigError(`effort.${phase} must be one of ${EFFORT_LEVELS.join(', ')}, got ${value}`);
      }
      merged_[phase] = value;
    }
    merged.effort = merged_;
  }

  if ('oracle' in source) {
    const oracle = requireObject(source.oracle, 'oracle');
    rejectUnknownKeys(oracle, new Set(['enabled']), 'oracle');
    merged.oracle = {
      enabled: 'enabled' in oracle ? requireBoolean(oracle.enabled, 'oracle.enabled') : defaults.oracle.enabled,
    };
  }

  if ('sandbox' in source) {
    const sandbox = requireObject(source.sandbox, 'sandbox');
    rejectUnknownKeys(sandbox, new Set(['enabled']), 'sandbox');
    merged.sandbox = {
      enabled: 'enabled' in sandbox ? requireBoolean(sandbox.enabled, 'sandbox.enabled') : defaults.sandbox.enabled,
    };
  }

  if ('panelCarry' in source) {
    const carry = requireObject(source.panelCarry, 'panelCarry');
    rejectUnknownKeys(carry, new Set(['enabled']), 'panelCarry');
    merged.panelCarry = {
      enabled: 'enabled' in carry ? requireBoolean(carry.enabled, 'panelCarry.enabled') : defaults.panelCarry.enabled,
    };
  }

  if ('deploy' in source) {
    const deploy = requireObject(source.deploy, 'deploy');
    rejectUnknownKeys(deploy, new Set(['enabled', 'command', 'target', 'url', 'smoke', 'timeoutMs']), 'deploy');
    // An argv array, not a string. `split(' ')` destroyed any quoted argument, so
    // `ssh box 'cd /srv && ./deploy.sh'` arrived as six mangled tokens; the old shape is
    // refused by name rather than coerced, because silently re-interpreting a pre-0.61.0
    // config would run something its author did not write.
    if ('command' in deploy && typeof deploy.command === 'string') {
      throw new ConfigError(
        'deploy.command must be an array of arguments, not a string. A string was split on spaces, ' +
          "which destroys quoting. Write [\"ssh\", \"deploy@host\", \"/srv/app/deploy.sh\"].",
      );
    }
    const enabled = 'enabled' in deploy ? requireBoolean(deploy.enabled, 'deploy.enabled') : defaults.deploy.enabled;
    const command = 'command' in deploy ? requireStringArray(deploy.command, 'deploy.command') : [...defaults.deploy.command];
    // An explicit `null` is "no target", not a malformed one. `writeConfig` serialises the default
    // config and `loadConfig` reads it straight back, so a validator that refused the value it
    // itself writes would fail on a file nobody had touched.
    const target =
      'target' in deploy && deploy.target !== null ? requireDeployTarget(deploy.target) : defaults.deploy.target;
    const url = 'url' in deploy ? requireString(deploy.url, 'deploy.url') : defaults.deploy.url;
    const smoke = 'smoke' in deploy ? requireSmokeChecks(deploy.smoke) : [...defaults.deploy.smoke];
    // Checked even while the section is disabled, unlike command/url/smoke below. Those are
    // absent until the feature is used; a timeout that was written down and is nonsense is
    // wrong the moment it is written, and finding that out at ship time is finding it out at
    // the worst moment.
    const timeoutMs = 'timeoutMs' in deploy ? requirePositiveInteger(deploy.timeoutMs, 'deploy.timeoutMs') : defaults.deploy.timeoutMs;
    // Nothing is required of a section that is switched off — refusing a half-written one
    // would fail runs that never deploy. Everything is required the moment it is used,
    // because a deploy nothing can check reports success whatever it did, which is the stub
    // this replaces (DESIGN.md §10.1).
    if (enabled) {
      // **Exactly one of them, refused rather than merged** (DESIGN.md §10.2). A config carrying
      // both has two answers to "what does this run", and picking one silently would run something
      // its author did not write — the same reasoning that refuses a `deploy.command` string rather
      // than splitting it.
      if (command.length > 0 && target !== null) {
        throw new ConfigError(
          'deploy.command and deploy.target are both set, and they are two answers to one question. ' +
            'Keep the target for a host this build knows how to publish to, or the command for anything else.',
        );
      }
      if (command.length === 0 && target === null) {
        throw new ConfigError(
          'deploy.enabled is true but neither deploy.target nor deploy.command is set: there is nothing to run',
        );
      }
      if (url === '') {
        throw new ConfigError(
          'deploy.enabled is true but deploy.url is empty. A deploy that is not asked whether it worked is not evidence; ' +
            'only fixed-URL hosts are supported, so the url is known in advance (DESIGN.md §10.1)',
        );
      }
      if (!/^https?:\/\//i.test(url)) throw new ConfigError(`deploy.url must be an http or https URL, got ${url}`);
      const risky = riskyRemoteWord(url);
      if (risky !== null) {
        throw new ConfigError(
          `deploy.url contains ${risky}: meeseeks is pre-production only and never points at anything with users`,
        );
      }
      if (smoke.length === 0) {
        throw new ConfigError('deploy.enabled is true but deploy.smoke is empty: a deploy nothing checks cannot fail');
      }
    }
    merged.deploy = { enabled, command, target, url, smoke, timeoutMs };
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

  if ('improvise' in source) {
    const improvise = requireObject(source.improvise, 'improvise');
    rejectUnknownKeys(improvise, new Set(['enabled']), 'improvise');
    merged.improvise = {
      enabled: 'enabled' in improvise ? requireBoolean(improvise.enabled, 'improvise.enabled') : defaults.improvise.enabled,
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
 * @param {MeeseeksConfig} config
 * @param {Record<string, string | undefined>} env
 * @returns {MeeseeksConfig}
 */
export function applyEnvOverrides(config, env) {
  const raw = env.MEESEEKS_CHAOS;
  if (raw === undefined || raw === '') return config;
  const chaos = Number(raw);
  if (!Number.isInteger(chaos) || chaos < 1 || chaos > 3) {
    throw new ConfigError(`MEESEEKS_CHAOS must be 1, 2 or 3; got ${JSON.stringify(raw)}.`);
  }
  return { ...config, chaos };
}

/**
 * Configuration keys this build accepts and ignores, with what to do about each.
 *
 * **Why accept them at all.** Removing a key outright makes strict validation reject a config that
 * works today, which turns a documentation defect into a broken target. So a retired key is
 * tolerated for one deprecation window and *announced*, naming the control that actually exists —
 * silence is what created the problem in the first place.
 *
 * @type {Record<string, string>}
 */
export const DEPRECATED_CONFIG_KEYS = {
  // REVIEW F23. A validated setting no `spawnClaude` path ever read: narration is the deterministic
  // `style.mjs` render layer, and bare `/meeseeks` sends idea invention *and* PRD authoring through
  // `prdModel`. An operator could set it, pass strict validation, observe no behavioural or cost
  // change, and then read `run.json` claiming that model participated. It is **not** repurposed
  // into a new model call: inventing behaviour to justify a setting is how the false control got
  // here.
  styleModel:
    'styleModel is accepted for compatibility and ignored: no child has ever been selected by it. Narration is ' +
    'deterministic, and idea invention and PRD authoring both use prdModel. Remove the key; a later version will ' +
    'reject it.',
};

/**
 * What to tell the operator about retired keys present in their config.
 *
 * @param {unknown} source the parsed config object, before validation
 * @returns {string[]} one line per retired key present, empty when there are none
 */
export function deprecationNotices(source) {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) return [];
  const record = /** @type {Record<string, unknown>} */ (source);
  return Object.entries(DEPRECATED_CONFIG_KEYS)
    .filter(([key]) => key in record)
    .map(([, notice]) => notice);
}

/**
 * Read `.meeseeks/config.json`.
 *
 * @param {string} meeseeksDir
 * @param {{ env?: Record<string, string | undefined>, log?: (line: string) => void }} [options]
 *        `log` receives one line per retired configuration key present (REVIEW F23). Omitted in
 *        callers that only need the values; the driver supplies it so the operator is told.
 * @returns {MeeseeksConfig}
 * @throws {ConfigError} when the file is missing, unreadable, or invalid
 */
export function loadConfig(meeseeksDir, options = {}) {
  const file = path.join(meeseeksDir, CONFIG_FILE);
  /** @type {string} */
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
      throw new ConfigError(`${file} does not exist. Run \`meeseeks init\` to scaffold it.`);
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
  // Announced before the config is used, not after (REVIEW F23): a key that changes nothing must
  // say so at startup, or the operator learns it from a run that behaved unexpectedly.
  for (const notice of deprecationNotices(parsed)) (options.log ?? (() => {}))(notice);
  return applyEnvOverrides(validateConfig(parsed), options.env ?? {});
}

/**
 * Write `.meeseeks/config.json` atomically.
 *
 * @param {string} meeseeksDir
 * @param {MeeseeksConfig} config
 * @returns {string} the path written
 */
export function writeConfig(meeseeksDir, config) {
  mkdirSync(meeseeksDir, { recursive: true });
  const file = path.join(meeseeksDir, CONFIG_FILE);
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
 * Create `.meeseeks/config.json` if it is not already there.
 *
 * @param {string} meeseeksDir
 * @returns {{ created: boolean, path: string, config: MeeseeksConfig }}
 */
export function initConfig(meeseeksDir) {
  const file = path.join(meeseeksDir, CONFIG_FILE);
  try {
    return { created: false, path: file, config: loadConfig(meeseeksDir) };
  } catch (error) {
    if (!(error instanceof ConfigError) || !error.message.includes('does not exist')) throw error;
  }
  const config = defaultConfig();
  writeConfig(meeseeksDir, config);
  return { created: true, path: file, config };
}
