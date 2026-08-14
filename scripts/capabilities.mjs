/**
 * Project capability manifest (DESIGN.md §3.7).
 *
 * What a project *is* decides which gates apply to it. Until now the codebase had exactly
 * one such concept — `hasFrontend`, which lived here in spirit and in `plugins.mjs` in fact —
 * and it could only answer for a tree that already exists. That is the wrong question to ask
 * a greenfield repository: on iteration 1 there is a PRD and some design documents, and every
 * detector answers "no" for an application nobody has written yet.
 *
 * So capabilities are **declared or detected**, unioned. The architect phase declares what it
 * is about to build; runtime detection verifies and augments that against the tree as it
 * actually is. Either source alone is wrong: a declaration cannot see the React dependency a
 * builder added on a whim, and detection cannot see the future.
 *
 * Three rules hold this together.
 *
 * - **The vocabulary is closed.** An unknown capability is an error, not a shrug. Same
 *   precedent, and the same reason, as `validateConfig` in `config.mjs`: a typo that silently
 *   keeps a default would let an unattended run gate on something nobody asked for, and the
 *   operator would have no way to tell.
 * - **A detector exists only where the positive signal is unambiguous.** `library` therefore
 *   has none: `main` and `exports` appear in almost every application manifest ever written,
 *   and a detector that fires on them would be a guess wearing evidence's clothes. Its absence
 *   is declared in `UNDETECTABLE` rather than left to be inferred.
 * - **Absence of detection is never evidence of absence.** Detection only ever adds. Nothing
 *   here removes a declared capability, because "I looked and did not find it" and "it is not
 *   there" are the same sentence only when the detector is complete, and none of them are.
 *
 * Over-detection is the safe direction and under-detection is the dangerous one: an extra
 * capability arms an extra gate, while a missing one skips one silently — which is the thing
 * DESIGN.md §4 exists to prevent.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * @typedef {'web-ui' | 'desktop-ui' | 'cli' | 'api' | 'network-service' | 'library'
 *   | 'persistent-storage' | 'background-worker' | 'realtime' | 'authentication'} Capability
 */
/** @typedef {Partial<Record<Capability, string>>} CapabilityEvidence */
/**
 * @typedef {{
 *   capabilities: Capability[], declared: Capability[], detected: Capability[],
 *   evidence: CapabilityEvidence
 * }} ResolvedCapabilities
 */

/** Thrown when a capability set cannot be trusted. */
export class CapabilityError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'CapabilityError';
  }
}

/**
 * The whole vocabulary, in canonical order — shape of the thing first, then the concerns it
 * carries. Resolved sets are emitted in this order so two runs of the same project produce
 * byte-identical manifests.
 *
 * `summary` is written for the architect, which is handed these lines verbatim and asked to
 * pick from them. Keep them short and about observable behaviour, not about technology: the
 * moment one says "Express" it stops being stack-agnostic, which is the entire point.
 *
 * @type {Record<Capability, { summary: string }>}
 */
export const CAPABILITIES = {
  'web-ui': { summary: 'renders an interface a person looks at in a browser' },
  'desktop-ui': { summary: 'renders an interface in a native desktop window' },
  cli: { summary: 'is invoked as a command from a terminal' },
  api: { summary: 'answers requests over HTTP from other programs' },
  'network-service': { summary: 'listens on a port for something other than plain HTTP requests' },
  library: { summary: 'is consumed as a dependency by other code rather than run on its own' },
  'persistent-storage': { summary: 'keeps state that outlives the process' },
  'background-worker': { summary: 'does work outside the request that asked for it' },
  realtime: { summary: 'pushes to connected clients rather than waiting to be asked' },
  authentication: { summary: 'decides who a caller is, or what they are allowed to do' },
};

/** Canonical order, derived so it cannot drift from the vocabulary. */
export const CAPABILITY_ORDER = /** @type {Capability[]} */ (Object.keys(CAPABILITIES));

/**
 * Dependency names that are unambiguous evidence of a capability.
 *
 * Every entry has to survive one question: can this package plausibly appear in a project
 * that does *not* have the capability? If yes, it does not belong here — the architect's
 * declaration covers that case, and a wrong detection is worse than a missing one because it
 * arrives dressed as evidence.
 *
 * Two knowing exceptions, both accepted because they over-detect rather than under-detect:
 * `ws` is also a WebSocket *client*, and `socket.io`'s client half is a separate package that
 * people none the less confuse with this one.
 *
 * @type {Record<Capability, string[]>}
 */
const CAPABILITY_DEPENDENCIES = {
  'web-ui': [
    'react',
    'react-dom',
    'vue',
    'svelte',
    '@sveltejs/kit',
    'next',
    'nuxt',
    'astro',
    'solid-js',
    'preact',
    '@angular/core',
    'lit',
    'remix',
    '@remix-run/react',
  ],
  'desktop-ui': ['electron', '@tauri-apps/api', '@tauri-apps/cli', 'nw'],
  cli: [],
  api: [
    'express',
    'fastify',
    'koa',
    '@hapi/hapi',
    'hono',
    '@nestjs/core',
    'restify',
    'polka',
    'h3',
    '@trpc/server',
    '@apollo/server',
  ],
  'network-service': ['ws', 'socket.io', '@grpc/grpc-js', 'nice-grpc', 'aedes', 'ssh2'],
  library: [],
  'persistent-storage': [
    'pg',
    'mysql',
    'mysql2',
    'sqlite3',
    'better-sqlite3',
    'mongodb',
    'mongoose',
    '@prisma/client',
    'drizzle-orm',
    'typeorm',
    'sequelize',
    'kysely',
    'knex',
    'redis',
    'ioredis',
    '@libsql/client',
    'level',
    'lowdb',
  ],
  'background-worker': ['bullmq', 'bull', 'bee-queue', 'agenda', 'node-cron', 'cron', 'graphile-worker', 'pg-boss'],
  realtime: ['ws', 'socket.io', 'graphql-ws', '@hocuspocus/server', 'y-websocket', 'partykit'],
  authentication: [
    'passport',
    'jsonwebtoken',
    'jose',
    'next-auth',
    '@auth/core',
    'lucia',
    'bcrypt',
    'bcryptjs',
    'argon2',
    '@clerk/nextjs',
    'oidc-provider',
  ],
};

/**
 * Files whose mere presence is unambiguous evidence. Same bar as the dependency table.
 * @type {Record<Capability, string[]>}
 */
const CAPABILITY_FILES = {
  'web-ui': ['index.html'],
  'desktop-ui': [path.join('src-tauri', 'tauri.conf.json')],
  cli: [],
  api: [],
  'network-service': [],
  library: [],
  'persistent-storage': [path.join('prisma', 'schema.prisma')],
  'background-worker': [],
  realtime: [],
  authentication: [],
};

/**
 * Why a capability has no detector. A capability listed here is declaration-only, and that is
 * a decision rather than an oversight — worth saying out loud, because the next person to read
 * the tables above will otherwise assume it was forgotten.
 * @type {Partial<Record<Capability, string>>}
 */
export const UNDETECTABLE = {
  library: 'every application manifest declares "main" or "exports" too; no signal belongs only to a library',
};

/** Extensions that only exist in a user interface. */
const FRONTEND_EXTENSIONS = new Set(['.jsx', '.tsx', '.vue', '.svelte', '.astro']);

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'out', 'coverage', '.next', '.nuxt', 'vendor']);

/**
 * Every dependency the manifest declares, in one object, or null when there is no readable
 * manifest. A malformed `package.json` is not evidence of anything; it reads as absent.
 *
 * @param {string} root
 * @returns {{ dependencies: Record<string, unknown>, manifest: Record<string, unknown> } | null}
 */
function readPackageManifest(root) {
  const file = path.join(root, 'package.json');
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return {
      manifest: parsed,
      dependencies: {
        ...(parsed.dependencies ?? {}),
        ...(parsed.devDependencies ?? {}),
        ...(parsed.peerDependencies ?? {}),
      },
    };
  } catch {
    return null;
  }
}

/**
 * The first source file under `root` whose extension only exists in a user interface, as a
 * path relative to `root`, or null.
 *
 * @param {string} root
 * @returns {string | null}
 */
function findFrontendSource(root) {
  /**
   * @param {string} dir
   * @param {number} depth
   * @returns {string | null}
   */
  function walk(dir, depth) {
    if (depth > 6) return null;
    /** @type {import('node:fs').Dirent[]} */
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const found = walk(full, depth + 1);
        if (found !== null) return found;
        continue;
      }
      if (entry.isFile() && FRONTEND_EXTENSIONS.has(path.extname(entry.name))) return path.relative(root, full);
    }
    return null;
  }
  return walk(root, 0);
}

/**
 * @param {unknown} bin the `bin` field of a package manifest
 * @returns {boolean} true when it actually names a command
 */
function declaresBin(bin) {
  if (typeof bin === 'string') return bin.trim() !== '';
  if (bin === null || typeof bin !== 'object' || Array.isArray(bin)) return false;
  return Object.keys(bin).length > 0;
}

/**
 * What this repository can be observed to be, right now.
 *
 * Evidence is a short human-readable string rather than a boolean because it ends up in the
 * run manifest and in the build brief, and `web-ui: dependency react` is auditable in a way
 * that `web-ui: true` is not.
 *
 * @param {string} root
 * @returns {CapabilityEvidence} only the capabilities found, each mapped to its evidence
 */
export function detectCapabilities(root) {
  /** @type {CapabilityEvidence} */
  const found = {};
  const parsed = readPackageManifest(root);

  for (const capability of CAPABILITY_ORDER) {
    const file = CAPABILITY_FILES[capability].find((relative) => existsSync(path.join(root, relative)));
    if (file !== undefined) {
      found[capability] = `file ${file}`;
      continue;
    }
    if (parsed === null) continue;
    const dependency = CAPABILITY_DEPENDENCIES[capability].find((name) => name in parsed.dependencies);
    if (dependency !== undefined) found[capability] = `dependency ${dependency}`;
  }

  // `bin` is the one manifest field that means a capability outright: a package that declares
  // a command is a command, whatever else it also happens to be.
  if (parsed !== null && found.cli === undefined && declaresBin(parsed.manifest.bin)) {
    found.cli = 'package.json "bin"';
  }

  if (found['web-ui'] === undefined) {
    const source = findFrontendSource(root);
    if (source !== null) found['web-ui'] = `file ${source}`;
  }

  return found;
}

/**
 * Does this repository render a user interface?
 *
 * DESIGN.md §5.1 caveat 1: impeccable's detector is about UI, so on a pure API, backend or
 * CLI project the design-slop gate is *skipped, not failed*. Skipping a gate is otherwise
 * forbidden; this is the one case the spec carves out, and it only holds when there is
 * genuinely nothing to look at.
 *
 * Detection-only, and deliberately so — this is the pre-manifest question, asked against the
 * tree each iteration by `builderSystemPrompt` and by the design-slop gate. A caller holding a
 * resolved manifest should consult that instead, because it can answer before the UI exists.
 *
 * @param {string} root
 * @returns {boolean}
 */
export function hasFrontend(root) {
  return detectCapabilities(root)['web-ui'] !== undefined;
}

/**
 * Validate a capability list's shape and membership, and put it in canonical order.
 *
 * Empty is allowed here: "declared nothing" and "declared nonsense" are different failures,
 * and only the caller knows which of them is fatal. `resolveCapabilities` is where an empty
 * *result* becomes an error.
 *
 * @param {unknown} value
 * @param {string} where used in the error message; name the source, not the variable
 * @returns {Capability[]} deduplicated, in canonical order
 * @throws {CapabilityError}
 */
export function validateCapabilities(value, where) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new CapabilityError(`${where} must be an array of strings; got ${JSON.stringify(value)}.`);
  }
  const unknown = value.filter((entry) => !Object.hasOwn(CAPABILITIES, entry));
  if (unknown.length > 0) {
    throw new CapabilityError(
      `${where} contains ${unknown.map((entry) => JSON.stringify(entry)).join(', ')}; known capabilities are ` +
        `${CAPABILITY_ORDER.join(', ')}. Refusing to ignore it: a capability nobody recognises arms no gate, so ` +
        'the run would skip whatever it was meant to check and report a clean pass anyway.',
    );
  }
  const chosen = new Set(/** @type {Capability[]} */ (value));
  return CAPABILITY_ORDER.filter((capability) => chosen.has(capability));
}

/**
 * Combine what the architect declared with what the tree shows: declared OR detected.
 *
 * @param {{ root: string, declared?: unknown, detected?: CapabilityEvidence }} options
 *        `detected` is injectable so a caller that already ran detection does not pay for it
 *        twice, and so the union logic is testable without a directory tree.
 * @returns {ResolvedCapabilities}
 * @throws {CapabilityError} when the declaration is invalid, or the union is empty
 */
export function resolveCapabilities(options) {
  const declared = validateCapabilities(options.declared ?? [], 'declared capabilities');
  const evidence = options.detected ?? detectCapabilities(options.root);
  const detected = validateCapabilities(Object.keys(evidence), 'detected capabilities');

  const union = new Set([...declared, ...detected]);
  const capabilities = CAPABILITY_ORDER.filter((capability) => union.has(capability));

  if (capabilities.length === 0) {
    throw new CapabilityError(
      'no capabilities were declared and none could be detected. An empty set arms no conditional gate, so the ' +
        'run would skip every one of them and still report a clean pass. Declare at least one of: ' +
        `${CAPABILITY_ORDER.join(', ')}.`,
    );
  }

  return { capabilities, declared, detected, evidence };
}

/**
 * Read the architect's capability declaration out of its final message.
 *
 * Same shape of problem as `parseLessonExtraction`, and the same tactic: try the whole text,
 * then each fenced block last-to-first, then the widest brace slice. Last-to-first matters
 * because a template that shows an example block would otherwise have its example parsed
 * instead of the architect's answer.
 *
 * Nothing here defaults to a pass. An unparseable declaration throws, because the alternative
 * is a run that gates a project it never identified and reports the result as clean.
 *
 * @param {unknown} raw the child's final message
 * @returns {Capability[]}
 * @throws {CapabilityError}
 */
export function parseCapabilityDeclaration(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new CapabilityError('the design phase returned no text, so it declared no capabilities.');
  }
  const trimmed = raw.trim();

  /** @type {string[]} */
  const candidates = [];
  const fenced = [...trimmed.matchAll(/```(?:json)?\s*\n([\s\S]*?)\n?```/g)].map((match) => match[1]);
  candidates.push(...fenced.reverse());
  candidates.push(trimmed);
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) candidates.push(trimmed.slice(firstBrace, lastBrace + 1));

  for (const candidate of candidates) {
    /** @type {unknown} */
    let parsed;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
    const record = /** @type {Record<string, unknown>} */ (parsed);
    if (!('capabilities' in record)) continue;
    // Membership errors escape rather than being skipped: a block that says `capabilities`
    // and then names something outside the vocabulary is the architect answering wrongly, and
    // silently moving on to the next candidate would hide that behind a generic "no
    // declaration found".
    const declared = validateCapabilities(record.capabilities, 'the declared capabilities');
    if (declared.length === 0) {
      throw new CapabilityError(
        'the design phase declared an empty capability list. Every project is at least one of: ' +
          `${CAPABILITY_ORDER.join(', ')}.`,
      );
    }
    return declared;
  }

  throw new CapabilityError(
    'the design phase returned no parseable capability declaration. It must end with a fenced json block ' +
      'containing {"capabilities": [...]}, naming one or more of: ' +
      `${CAPABILITY_ORDER.join(', ')}.`,
  );
}

/** The driver's record of what this project is. Protected by the `.meeseeks/**` invariant (§6). */
export const CAPABILITY_MANIFEST = 'capabilities.json';

/**
 * Write `.meeseeks/capabilities.json`.
 *
 * Driver-owned, because a child running under `MEESEEKS_RUNNING` is denied writes anywhere under
 * `.meeseeks` — which is what stops a builder from declaring away a gate it cannot pass.
 *
 * Rewritten every iteration, because `detected` and `evidence` describe the tree as it is now
 * and the tree changes under them. `declared` is the only durable half.
 *
 * @param {string} meeseeksDir
 * @param {ResolvedCapabilities} resolved
 * @returns {string} the path written
 */
export function writeCapabilityManifest(meeseeksDir, resolved) {
  mkdirSync(meeseeksDir, { recursive: true });
  const file = path.join(meeseeksDir, CAPABILITY_MANIFEST);
  const temporary = `${file}.tmp`;
  const body = {
    declared: resolved.declared,
    detected: resolved.detected,
    capabilities: resolved.capabilities,
    evidence: resolved.evidence,
  };
  writeFileSync(temporary, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  renameSync(temporary, file);
  return file;
}

/**
 * Read back what the architect declared.
 *
 * Fails closed on every unreadable state — missing file, unparseable JSON, a `declared` field
 * that is not a valid capability list. A run that has lost its declaration cannot decide
 * which gates apply, and guessing is the failure this whole module exists to prevent.
 *
 * @param {string} meeseeksDir
 * @returns {Capability[]}
 * @throws {CapabilityError}
 */
export function readDeclaredCapabilities(meeseeksDir) {
  const file = path.join(meeseeksDir, CAPABILITY_MANIFEST);
  /** @type {string} */
  let contents;
  try {
    contents = readFileSync(file, 'utf8');
  } catch (error) {
    throw new CapabilityError(`${file} could not be read: ${/** @type {Error} */ (error).message}`);
  }
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(contents);
  } catch (error) {
    throw new CapabilityError(`${file} is not valid JSON: ${/** @type {Error} */ (error).message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CapabilityError(`${file} must contain an object; got ${JSON.stringify(parsed)}.`);
  }
  return validateCapabilities(/** @type {Record<string, unknown>} */ (parsed).declared, `${file} "declared"`);
}
