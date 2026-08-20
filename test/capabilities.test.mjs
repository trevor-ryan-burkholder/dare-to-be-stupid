/**
 * Tests for the project capability manifest (DESIGN.md §3.7).
 *
 * Detection reads real directory trees rather than a mocked filesystem, because a wrong
 * answer here silently arms or disarms a definition-of-done gate — the same class of bug that
 * kept the design gate off for four versions.
 *
 * Evidence strings are asserted exactly, not merely for presence. "Something was detected" is
 * the assertion that would have passed while a detector fired on the wrong signal.
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

import {
  CAPABILITIES,
  CAPABILITY_MANIFEST,
  CAPABILITY_ORDER,
  CapabilityError,
  UNDETECTABLE,
  detectCapabilities,
  establishedCapabilities,
  hasFrontend,
  parseCapabilityDeclaration,
  readDeclaredCapabilities,
  resolveCapabilities,
  validateCapabilities,
  writeCapabilityManifest,
} from '../scripts/capabilities.mjs';

/** @type {string[]} */
const temporaryDirs = [];

/**
 * @param {Record<string, string>} [files]
 * @returns {string}
 */
function makeProject(files = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-capabilities-'));
  temporaryDirs.push(dir);
  for (const [relative, contents] of Object.entries(files)) {
    const full = path.join(dir, ...relative.split('/'));
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, contents, 'utf8');
  }
  return dir;
}

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

describe('the capability vocabulary', () => {
  it('is exactly the ten names the design names, in canonical order', () => {
    assert.deepEqual(CAPABILITY_ORDER, [
      'web-ui',
      'desktop-ui',
      'cli',
      'api',
      'network-service',
      'library',
      'persistent-storage',
      'background-worker',
      'realtime',
      'authentication',
    ]);
  });

  it('gives every capability a summary written for the architect', () => {
    for (const capability of CAPABILITY_ORDER) {
      const summary = CAPABILITIES[capability].summary;
      assert.equal(typeof summary, 'string');
      assert.equal(summary.trim().length > 20, true, `${capability} needs a usable summary`);
    }
  });

  it('only excuses a capability from detection if that capability exists', () => {
    for (const capability of Object.keys(UNDETECTABLE)) {
      assert.equal(CAPABILITY_ORDER.includes(/** @type {never} */ (capability)), true);
    }
  });

  it('records that library is declaration-only rather than leaving it to be inferred', () => {
    assert.deepEqual(Object.keys(UNDETECTABLE), ['library']);
    assert.equal(typeof UNDETECTABLE.library, 'string');
  });
});

describe('detectCapabilities', () => {
  it('finds nothing in an empty directory', () => {
    assert.deepEqual(detectCapabilities(makeProject()), {});
  });

  it('finds nothing in a repository that is only a PRD', () => {
    // The greenfield case, and the whole reason declaration exists. Detection is honestly
    // empty here; it must not invent a shape for an application nobody has written.
    assert.deepEqual(detectCapabilities(makeProject({ 'PRD.md': '# Build a React dashboard\n' })), {});
  });

  /** @type {[Record<string, string>, Record<string, string>, string][]} */
  const cases = [
    [{ 'package.json': '{"dependencies":{"react":"^19"}}\n' }, { 'web-ui': 'dependency react' }, 'a react dependency'],
    [
      { 'package.json': '{"devDependencies":{"svelte":"^5"}}\n' },
      { 'web-ui': 'dependency svelte' },
      'a svelte dev dependency',
    ],
    [
      { 'package.json': '{"peerDependencies":{"vue":"^3"}}\n' },
      { 'web-ui': 'dependency vue' },
      'a vue peer dependency',
    ],
    [{ 'index.html': '<!doctype html>\n' }, { 'web-ui': 'file index.html' }, 'an index.html'],
    [
      { 'package.json': '{"dependencies":{"electron":"^33"}}\n' },
      { 'desktop-ui': 'dependency electron' },
      'an electron dependency',
    ],
    [{ 'package.json': '{"dependencies":{"fastify":"^4"}}\n' }, { api: 'dependency fastify' }, 'a fastify dependency'],
    [
      { 'package.json': '{"dependencies":{"better-sqlite3":"^11"}}\n' },
      { 'persistent-storage': 'dependency better-sqlite3' },
      'a sqlite dependency',
    ],
    [
      { 'package.json': '{"dependencies":{"bullmq":"^5"}}\n' },
      { 'background-worker': 'dependency bullmq' },
      'a bullmq dependency',
    ],
    [
      { 'package.json': '{"dependencies":{"passport":"^0.7"}}\n' },
      { authentication: 'dependency passport' },
      'a passport dependency',
    ],
  ];
  for (const [files, expected, label] of cases) {
    it(`detects exactly what ${label} proves, and nothing else`, () => {
      assert.deepEqual(detectCapabilities(makeProject(files)), expected);
    });
  }

  it('reads a websocket server as both a network service and realtime', () => {
    // One dependency, two capabilities, and that is correct rather than sloppy: a websocket
    // server both binds a port and pushes to clients. `ws` is also a client library, which is
    // the known over-detection this table accepts on purpose — an extra armed gate is
    // recoverable, a silently skipped one is the failure DESIGN.md §4 exists to prevent.
    assert.deepEqual(detectCapabilities(makeProject({ 'package.json': '{"dependencies":{"ws":"^8"}}\n' })), {
      'network-service': 'dependency ws',
      realtime: 'dependency ws',
    });
  });

  it('reads a real service manifest as every capability it declares', () => {
    const cwd = makeProject({
      'package.json': JSON.stringify({
        name: 'orders',
        dependencies: { express: '^4', pg: '^8', jsonwebtoken: '^9', bullmq: '^5' },
      }),
    });
    assert.deepEqual(detectCapabilities(cwd), {
      api: 'dependency express',
      'persistent-storage': 'dependency pg',
      'background-worker': 'dependency bullmq',
      authentication: 'dependency jsonwebtoken',
    });
  });

  it('detects a cli from a bin string', () => {
    assert.deepEqual(detectCapabilities(makeProject({ 'package.json': '{"bin":"./cli.mjs"}\n' })), {
      cli: 'package.json "bin"',
    });
  });

  it('detects a cli from a bin map', () => {
    assert.deepEqual(detectCapabilities(makeProject({ 'package.json': '{"bin":{"orders":"./cli.mjs"}}\n' })), {
      cli: 'package.json "bin"',
    });
  });

  /** @type {[string, string][]} */
  const emptyBins = [
    ['{"bin":{}}\n', 'an empty bin map'],
    ['{"bin":""}\n', 'an empty bin string'],
    ['{"bin":null}\n', 'a null bin'],
    ['{"bin":["./cli.mjs"]}\n', 'a bin array, which npm does not accept'],
  ];
  for (const [manifest, label] of emptyBins) {
    it(`does not call ${label} a command`, () => {
      assert.deepEqual(detectCapabilities(makeProject({ 'package.json': manifest })), {});
    });
  }

  it('never guesses library from main or exports', () => {
    // The detector deliberately absent. Every bundled application declares these fields, so a
    // detector firing on them would report a guess as evidence.
    const cwd = makeProject({
      'package.json': '{"main":"./dist/index.js","exports":"./dist/index.js","types":"./dist/index.d.ts"}\n',
    });
    assert.deepEqual(detectCapabilities(cwd), {});
  });

  it('prefers a file over a dependency when both would prove the same capability', () => {
    const cwd = makeProject({ 'index.html': '<!doctype html>\n', 'package.json': '{"dependencies":{"react":"^19"}}\n' });
    assert.deepEqual(detectCapabilities(cwd), { 'web-ui': 'file index.html' });
  });

  it('detects a tauri app from its config file, path-joined for the host platform', () => {
    const cwd = makeProject({ 'src-tauri/tauri.conf.json': '{}\n' });
    assert.deepEqual(detectCapabilities(cwd), { 'desktop-ui': `file ${path.join('src-tauri', 'tauri.conf.json')}` });
  });

  it('detects storage from a prisma schema with no dependency declared', () => {
    const cwd = makeProject({ 'prisma/schema.prisma': 'datasource db {}\n' });
    assert.deepEqual(detectCapabilities(cwd), {
      'persistent-storage': `file ${path.join('prisma', 'schema.prisma')}`,
    });
  });

  it('reports the source file that proved a frontend, not just that one exists', () => {
    const cwd = makeProject({ 'src/components/Button.tsx': 'export const Button = () => null;\n' });
    assert.deepEqual(detectCapabilities(cwd), { 'web-ui': `file ${path.join('src', 'components', 'Button.tsx')}` });
  });

  it('treats a malformed package.json as absent rather than as evidence', () => {
    assert.deepEqual(detectCapabilities(makeProject({ 'package.json': '{ not json\n' })), {});
  });

  it('treats a package.json that is not an object as absent', () => {
    assert.deepEqual(detectCapabilities(makeProject({ 'package.json': '["react"]\n' })), {});
  });
});

describe('hasFrontend', () => {
  /** @type {[Record<string, string>, string][]} */
  const yes = [
    [{ 'index.html': '<!doctype html>\n' }, 'an index.html'],
    [{ 'package.json': '{"dependencies":{"react":"^19"}}\n' }, 'a react dependency'],
    [{ 'package.json': '{"devDependencies":{"svelte":"^5"}}\n' }, 'a svelte dev dependency'],
    [{ 'package.json': '{"dependencies":{"next":"^15"}}\n' }, 'a next dependency'],
    [{ 'src/components/Button.tsx': 'export const Button = () => null;\n' }, 'a .tsx component'],
    [{ 'app/Page.vue': '<template />\n' }, 'a .vue file'],
  ];
  for (const [files, label] of yes) {
    it(`detects ${label}`, () => {
      assert.equal(hasFrontend(makeProject(files)), true);
    });
  }

  /** @type {[Record<string, string>, string][]} */
  const no = [
    [{ 'package.json': '{"dependencies":{"fastify":"^4"}}\n' }, 'an api server'],
    [{ 'src/cli.ts': 'export const run = () => 0;\n' }, 'a typescript cli'],
    [{ 'main.go': 'package main\n' }, 'a go program'],
    [{}, 'an empty directory'],
    [{ 'package.json': '{ not json\n' }, 'a malformed package.json with nothing else'],
  ];
  for (const [files, label] of no) {
    it(`does not detect a frontend in ${label}`, () => {
      assert.equal(hasFrontend(makeProject(files)), false);
    });
  }

  it('ignores frontend files inside node_modules', () => {
    // **The extension has to be one the walker would otherwise accept**, or the directory rule is
    // never consulted. This used `index.js`, and `.js` is not in `FRONTEND_EXTENSIONS` — so the
    // file was skipped for its name and `SKIP_DIRS` could be deleted without the test noticing.
    assert.equal(hasFrontend(makeProject({ 'node_modules/react/Button.tsx': 'x\n', 'src/a.ts': 'x\n' })), false);
    // The neighbour that makes it a *directory* rule rather than a blanket refusal: the same
    // extension outside the skipped directory is a frontend.
    assert.equal(hasFrontend(makeProject({ 'src/Button.tsx': 'x\n' })), true);
  });

  it('ignores a built bundle in dist', () => {
    // Same defect as the node_modules case: `.html` is not in `FRONTEND_EXTENSIONS` either, so the
    // bundle was ignored for its extension and never reached the `dist` rule.
    assert.equal(hasFrontend(makeProject({ 'dist/App.tsx': 'x\n', 'src/a.ts': 'x\n' })), false);
  });
});

describe('validateCapabilities', () => {
  it('returns the canonical order regardless of the order given', () => {
    assert.deepEqual(validateCapabilities(['authentication', 'cli', 'web-ui'], 'declared'), [
      'web-ui',
      'cli',
      'authentication',
    ]);
  });

  it('deduplicates', () => {
    assert.deepEqual(validateCapabilities(['api', 'api', 'api'], 'declared'), ['api']);
  });

  it('allows empty, because declaring nothing is a different failure from declaring nonsense', () => {
    assert.deepEqual(validateCapabilities([], 'declared'), []);
  });

  it('rejects an unknown capability, names it, and lists the ones that exist', () => {
    // The known set is listed because an operator reading this error is about to retype it.
    assert.throws(
      () => validateCapabilities(['web-ui', 'blockchain'], 'declared capabilities'),
      (error) =>
        error instanceof CapabilityError &&
        error.message.includes('"blockchain"') &&
        error.message.includes('declared capabilities') &&
        error.message.includes('persistent-storage'),
    );
  });

  it('rejects a capability that only differs in case', () => {
    assert.throws(() => validateCapabilities(['Web-UI'], 'declared'), CapabilityError);
  });

  it('rejects a name inherited from Object.prototype', () => {
    // `'constructor' in CAPABILITIES` is true. Membership has to be an own-property test or
    // the vocabulary silently accepts every method name on Object.
    assert.throws(() => validateCapabilities(['constructor'], 'declared'), CapabilityError);
    assert.throws(() => validateCapabilities(['toString'], 'declared'), CapabilityError);
  });

  /** @type {[unknown, string][]} */
  const malformed = [
    ['web-ui', 'a bare string'],
    [{ 'web-ui': true }, 'an object'],
    [null, 'null'],
    [['web-ui', 7], 'an array containing a number'],
    [[['web-ui']], 'a nested array'],
  ];
  for (const [value, label] of malformed) {
    it(`rejects ${label}`, () => {
      assert.throws(() => validateCapabilities(value, 'declared'), CapabilityError);
    });
  }
});

describe('resolveCapabilities', () => {
  it('takes the declaration when the tree shows nothing yet', () => {
    // Iteration 1 of a greenfield run: a PRD, some design docs, no code. This is the case the
    // whole declared-or-detected model exists for.
    const resolved = resolveCapabilities({
      root: makeProject({ 'PRD.md': '# Orders API\n' }),
      declared: ['api', 'persistent-storage'],
    });
    assert.deepEqual(resolved.capabilities, ['api', 'persistent-storage']);
    assert.deepEqual(resolved.declared, ['api', 'persistent-storage']);
    assert.deepEqual(resolved.detected, []);
    assert.deepEqual(resolved.evidence, {});
  });

  it('takes detection when nothing was declared', () => {
    const root = makeProject({ 'package.json': '{"dependencies":{"react":"^19"}}\n' });
    const resolved = resolveCapabilities({ root });
    assert.deepEqual(resolved.capabilities, ['web-ui']);
    assert.deepEqual(resolved.declared, []);
    assert.deepEqual(resolved.detected, ['web-ui']);
    assert.deepEqual(resolved.evidence, { 'web-ui': 'dependency react' });
  });

  it('unions the two and returns them in canonical order', () => {
    const resolved = resolveCapabilities({
      root: makeProject({ 'package.json': '{"dependencies":{"express":"^4","pg":"^8"}}\n' }),
      declared: ['authentication', 'api'],
    });
    assert.deepEqual(resolved.capabilities, ['api', 'persistent-storage', 'authentication']);
    assert.deepEqual(resolved.declared, ['api', 'authentication']);
    assert.deepEqual(resolved.detected, ['api', 'persistent-storage']);
  });

  it('never drops a declared capability that has no detector', () => {
    // `library` cannot be detected by design. If detection were allowed to overrule the
    // declaration, declaring it would be impossible and the vocabulary would be lying.
    const resolved = resolveCapabilities({ root: makeProject(), declared: ['library'] });
    assert.deepEqual(resolved.capabilities, ['library']);
    assert.deepEqual(resolved.detected, []);
  });

  it('uses injected detection instead of scanning, so the union is testable without a tree', () => {
    const resolved = resolveCapabilities({
      root: makeProject({ 'index.html': '<!doctype html>\n' }),
      declared: ['cli'],
      detected: { api: 'dependency hono' },
    });
    assert.deepEqual(resolved.capabilities, ['cli', 'api']);
    assert.deepEqual(resolved.evidence, { api: 'dependency hono' });
  });

  it('refuses an empty result rather than arming no gates and calling it a pass', () => {
    assert.throws(
      () => resolveCapabilities({ root: makeProject() }),
      (error) =>
        error instanceof CapabilityError &&
        error.message.includes('no capabilities') &&
        error.message.includes('web-ui'),
    );
  });

  it('refuses an invalid declaration rather than falling back to detection', () => {
    assert.throws(
      () => resolveCapabilities({ root: makeProject({ 'index.html': '<!doctype html>\n' }), declared: ['nonsense'] }),
      CapabilityError,
    );
  });

  it('refuses injected detection that is not in the vocabulary', () => {
    // The injection point exists for tests and for callers that already scanned. It is not a
    // back door into the vocabulary.
    assert.throws(
      () =>
        resolveCapabilities({
          root: makeProject(),
          detected: /** @type {never} */ ({ 'quantum-ui': 'dependency qbit' }),
        }),
      CapabilityError,
    );
  });
});

describe('parseCapabilityDeclaration', () => {
  it('reads a fenced json block at the end of a chatty message', () => {
    const raw = [
      'I wrote docs/architecture.md, docs/api-contract.md and docs/data-model.md.',
      '',
      'The service exposes HTTP endpoints and persists orders.',
      '',
      '```json',
      '{ "capabilities": ["api", "persistent-storage"] }',
      '```',
    ].join('\n');
    assert.deepEqual(parseCapabilityDeclaration(raw), ['api', 'persistent-storage']);
  });

  it('reads a bare json object with no fence', () => {
    assert.deepEqual(parseCapabilityDeclaration('{"capabilities":["cli"]}'), ['cli']);
  });

  it('reads an unlabelled fence', () => {
    assert.deepEqual(parseCapabilityDeclaration('```\n{"capabilities":["library"]}\n```'), ['library']);
  });

  it('takes the last fenced block, not an example echoed earlier', () => {
    // The architect template shows an example block. A child that repeats the template back
    // before answering would otherwise have its example parsed as its answer.
    const raw = [
      'The template asked for:',
      '',
      '```json',
      '{ "capabilities": ["api", "persistent-storage"] }',
      '```',
      '',
      'For this project the answer is:',
      '',
      '```json',
      '{ "capabilities": ["cli"] }',
      '```',
    ].join('\n');
    assert.deepEqual(parseCapabilityDeclaration(raw), ['cli']);
  });

  it('returns the canonical order, not the order declared', () => {
    assert.deepEqual(parseCapabilityDeclaration('{"capabilities":["authentication","api","web-ui"]}'), [
      'web-ui',
      'api',
      'authentication',
    ]);
  });

  /** @type {[unknown, string][]} */
  const refused = [
    ['', 'an empty message'],
    ['   \n  ', 'whitespace'],
    [undefined, 'no message at all'],
    [null, 'null'],
    ['Design complete. Three documents written.', 'prose with no json'],
    ['```json\n{ "capabilities": [] }\n```', 'an empty list'],
    ['```json\n{ "components": ["api"] }\n```', 'json that answers a different question'],
    ['```json\n["api"]\n```', 'a bare array'],
    ['```json\n{ "capabilities": "api" }\n```', 'a string where a list belongs'],
    ['```json\n{ "capabilities": ["api",\n```', 'json truncated mid-block'],
  ];
  for (const [raw, label] of refused) {
    it(`refuses ${label}`, () => {
      assert.throws(() => parseCapabilityDeclaration(raw), CapabilityError);
    });
  }

  it('refuses a capability outside the vocabulary rather than reporting no declaration', () => {
    // The distinction matters to whoever reads the abort line: "you named something that does
    // not exist" is actionable, and "no declaration found" sends them looking for a fence that
    // was right there.
    assert.throws(
      () => parseCapabilityDeclaration('```json\n{ "capabilities": ["api", "blockchain"] }\n```'),
      (error) => error instanceof CapabilityError && error.message.includes('"blockchain"'),
    );
  });

  it('names the fence contract when nothing parses, so the abort line is actionable', () => {
    assert.throws(
      () => parseCapabilityDeclaration('Design complete.'),
      (error) =>
        error instanceof CapabilityError &&
        error.message.includes('capabilities') &&
        error.message.includes('persistent-storage'),
    );
  });
});

describe('the capability manifest on disk', () => {
  it('round-trips the declaration through .meeseeks/capabilities.json', () => {
    const meeseeksDir = path.join(makeProject(), '.meeseeks');
    const resolved = resolveCapabilities({
      root: makeProject({ 'package.json': '{"dependencies":{"express":"^4"}}\n' }),
      declared: ['api', 'library'],
    });
    const file = writeCapabilityManifest(meeseeksDir, resolved);
    assert.equal(file, path.join(meeseeksDir, CAPABILITY_MANIFEST));
    assert.deepEqual(readDeclaredCapabilities(meeseeksDir), ['api', 'library']);
  });

  it('records the detected half and its evidence, not only the union', () => {
    // The evidence is the audit trail. A manifest that says `web-ui` without saying why turns
    // a wrong detection into an unfalsifiable claim.
    const meeseeksDir = path.join(makeProject(), '.meeseeks');
    writeCapabilityManifest(
      meeseeksDir,
      resolveCapabilities({
        root: makeProject({ 'package.json': '{"dependencies":{"react":"^19"}}\n' }),
        declared: ['cli'],
      }),
    );
    const written = JSON.parse(readFileSync(path.join(meeseeksDir, CAPABILITY_MANIFEST), 'utf8'));
    assert.deepEqual(written, {
      declared: ['cli'],
      detected: ['web-ui'],
      capabilities: ['web-ui', 'cli'],
      evidence: { 'web-ui': 'dependency react' },
      // Empty, and recorded rather than omitted (REVIEW F13): a reader needs to see that nothing
      // was held open by monotonicity, not have to infer it from an absent field.
      lapsed: [],
    });
  });

  it('overwrites a previous manifest rather than accumulating one', () => {
    const meeseeksDir = path.join(makeProject(), '.meeseeks');
    writeCapabilityManifest(meeseeksDir, resolveCapabilities({ root: makeProject(), declared: ['cli'] }));
    writeCapabilityManifest(meeseeksDir, resolveCapabilities({ root: makeProject(), declared: ['library'] }));
    assert.deepEqual(readDeclaredCapabilities(meeseeksDir), ['library']);
  });

  it('leaves no temporary file behind, because the write is atomic', () => {
    // **A plain `writeFileSync` to the final path satisfies "no temp file left" exactly as well**,
    // so the original assertion could not tell an atomic write from a non-atomic one. What
    // distinguishes them is that a temporary is *used*: seed a stale one, the way a crashed earlier
    // write would leave it, and require the atomic path to overwrite and consume it.
    const meeseeksDir = path.join(makeProject(), '.meeseeks');
    mkdirSync(meeseeksDir, { recursive: true });
    writeFileSync(path.join(meeseeksDir, `${CAPABILITY_MANIFEST}.tmp`), 'half a manifest from a killed run', 'utf8');

    writeCapabilityManifest(meeseeksDir, resolveCapabilities({ root: makeProject(), declared: ['cli'] }));
    assert.deepEqual(readdirSync(meeseeksDir), [CAPABILITY_MANIFEST]);
    // And the survivor is the real manifest rather than the stale bytes renamed into place.
    assert.deepEqual(
      JSON.parse(readFileSync(path.join(meeseeksDir, CAPABILITY_MANIFEST), 'utf8')).capabilities,
      ['cli'],
    );
  });

  /** @type {[string | null, string][]} */
  const unreadable = [
    [null, 'a missing file'],
    ['{ not json', 'malformed json'],
    ['["api"]', 'an array instead of an object'],
    ['null', 'a literal null'],
    ['{}', 'an object with no declared field'],
    ['{"declared":"api"}', 'a declared field that is not a list'],
    ['{"declared":["blockchain"]}', 'a declared field naming something unknown'],
  ];
  for (const [contents, label] of unreadable) {
    it(`fails closed on ${label}`, () => {
      // A run that has lost its declaration cannot decide which gates apply. Guessing here is
      // exactly the silent skip DESIGN.md §4 forbids.
      const meeseeksDir = path.join(makeProject(), '.meeseeks');
      if (contents !== null) {
        mkdirSync(meeseeksDir, { recursive: true });
        writeFileSync(path.join(meeseeksDir, CAPABILITY_MANIFEST), contents, 'utf8');
      }
      assert.throws(() => readDeclaredCapabilities(meeseeksDir), CapabilityError);
    });
  }
});

describe('PRODUCT.md and the capability manifest do not overlap', () => {
  // The split is by question, not by file. `.meeseeks/capabilities.json` owns what the software
  // *does* — a closed vocabulary, driver-owned, machine-read, and it arms gates. `PRODUCT.md`
  // owns who it is *for* and how it should feel: prose, impeccable's, living in the target
  // repository. No fact appears in both, and the rule that keeps it that way is that nothing
  // deciding pass or fail may read PRODUCT.md.

  it('is never read by any shipped script', () => {
    // Same shape and same argument as the run manifest's no-reader test. A prose file that
    // could decide a gate would be a second source of gate truth, in a format no vocabulary
    // constrains and no test covers. The strongest guarantee is that no code path can consult
    // it, and that is a property of the tree rather than of any one module.
    const scripts = fileURLToPath(new URL('../scripts/', import.meta.url));
    /**
     * @param {string} dir
     * @returns {string[]}
     */
    const walk = (dir) =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return entry.name.endsWith('.mjs') ? [full] : [];
      });

    for (const file of walk(scripts)) {
      const source = readFileSync(file, 'utf8');
      assert.equal(
        /['"]PRODUCT\.md['"]/.test(source),
        false,
        `${path.basename(file)} references PRODUCT.md; nothing that decides pass or fail may read it`,
      );
    }
  });

  it('keeps the capability vocabulary out of the architect’s PRODUCT.md instruction', () => {
    // The reverse direction of the same rule. If the architect were told to write capabilities
    // into PRODUCT.md, the two would drift and the prose copy would be the one nobody
    // validates — `parseCapabilityDeclaration` refuses an out-of-vocabulary word, and prose
    // refuses nothing.
    const architect = readFileSync(fileURLToPath(new URL('../templates/architect.md', import.meta.url)), 'utf8');
    const productRow = architect.split('\n').find((line) => line.includes('`PRODUCT.md`')) ?? '';
    assert.notEqual(productRow, '', 'the architect no longer asks for PRODUCT.md at all');
    for (const capability of CAPABILITY_ORDER) {
      assert.equal(productRow.includes(capability), false, `the PRODUCT.md instruction names ${capability}`);
    }
  });
});

describe('a capability this run established does not lapse with its marker (REVIEW F13)', () => {
  // **The reproduction Codex recorded.** The same declaration retained `cli`; adding `index.html`
  // resolved `web-ui, cli`, and deleting it resolved `cli` alone. A quality gate armed by the
  // frontend predicate therefore disappeared from the roster when the builder deleted a file —
  // deterministic coverage shrinking after the builder changed the detection input, with no
  // skipped-gate record and no memory that the gate had ever applied.

  it('keeps a detected-only capability after its marker is gone', () => {
    const resolved = resolveCapabilities({
      root: makeProject(),
      declared: ['cli'],
      detected: {},
      established: ['web-ui', 'cli'],
    });
    assert.deepStrictEqual(resolved.capabilities, ['web-ui', 'cli']);
    assert.deepStrictEqual(resolved.lapsed, ['web-ui'], 'the lapse must be named, not merely survived');
  });

  it('keeps a declared capability after its marker is gone, which always held', () => {
    const resolved = resolveCapabilities({ root: makeProject(), declared: ['web-ui'], detected: {}, established: [] });
    assert.deepStrictEqual(resolved.capabilities, ['web-ui']);
    assert.deepStrictEqual(resolved.lapsed, [], 'a declared capability never lapsed and must not be reported as such');
  });

  it('reports nothing lapsed while the detector still agrees', () => {
    // The benign neighbour. An ordinary iteration must not accumulate warnings about capabilities
    // that are plainly still there.
    const resolved = resolveCapabilities({
      root: makeProject(),
      declared: ['cli'],
      detected: { 'web-ui': 'dependency react' },
      established: ['web-ui', 'cli'],
    });
    assert.deepStrictEqual(resolved.lapsed, []);
    assert.deepStrictEqual(resolved.capabilities, ['web-ui', 'cli']);
  });

  it('grows the set when detection finds something new, because monotonic means only upward', () => {
    const resolved = resolveCapabilities({
      root: makeProject(),
      declared: ['cli'],
      detected: { api: 'docs/openapi.yaml' },
      established: ['cli'],
    });
    assert.deepStrictEqual(resolved.capabilities, ['cli', 'api']);
    assert.deepStrictEqual(resolved.lapsed, []);
  });

  it('treats an absent manifest as nothing established, which is the first iteration', () => {
    assert.deepStrictEqual(establishedCapabilities(path.join(makeProject(), '.meeseeks')), []);
  });

  it('refuses a manifest that exists and cannot be read, rather than calling it empty', () => {
    // **The reopening.** This used to answer `[]` for a corrupt file too, defended by the claim that
    // a run which had lost its manifest failed closed at `readDeclaredCapabilities` — and nothing in
    // the driver calls that function. So damage silently answered "nothing established", and a
    // detected-only capability whose marker had also gone would drop its gate: the very shrink this
    // item exists to prevent, arriving through the repair.
    const meeseeksDir = path.join(makeProject(), '.meeseeks');
    mkdirSync(meeseeksDir, { recursive: true });
    writeFileSync(path.join(meeseeksDir, CAPABILITY_MANIFEST), '{ not json', 'utf8');
    assert.throws(() => establishedCapabilities(meeseeksDir), CapabilityError);
  });

  it('refuses a capabilities field that is present and malformed', () => {
    const meeseeksDir = path.join(makeProject(), '.meeseeks');
    mkdirSync(meeseeksDir, { recursive: true });
    writeFileSync(path.join(meeseeksDir, CAPABILITY_MANIFEST), JSON.stringify({ capabilities: 'web-ui' }), 'utf8');
    assert.throws(() => establishedCapabilities(meeseeksDir), CapabilityError);
  });

  it('reads a manifest written before the field existed as having established nothing', () => {
    // The upgrade case, and the one place `[]` is still the honest answer for a file that is there:
    // a manifest with no `capabilities` key predates 0.190.0 and established nothing under this rule.
    const meeseeksDir = path.join(makeProject(), '.meeseeks');
    mkdirSync(meeseeksDir, { recursive: true });
    writeFileSync(path.join(meeseeksDir, CAPABILITY_MANIFEST), JSON.stringify({ declared: ['cli'] }), 'utf8');
    assert.deepStrictEqual(establishedCapabilities(meeseeksDir), []);
  });

  it('reads back what the previous iteration established', () => {
    const meeseeksDir = path.join(makeProject(), '.meeseeks');
    writeCapabilityManifest(
      meeseeksDir,
      resolveCapabilities({ root: makeProject(), declared: ['cli'], detected: { 'web-ui': 'dependency react' } }),
    );
    assert.deepStrictEqual(establishedCapabilities(meeseeksDir), ['web-ui', 'cli']);
  });

  // ---------------------------------------------------------------------------
  // Parseable is not readable, and absence is only honest once (REVIEW F13, reopened again)
  // ---------------------------------------------------------------------------

  for (const [label, body] of [
    ['null', 'null'],
    ['an array', '[]'],
    ['a populated array', '["web-ui"]'],
    ['a string', '"damaged"'],
    ['a number', '42'],
    ['a boolean', 'true'],
  ]) {
    it(`refuses a manifest that parsed as ${label}, which is damage and not a legacy record`, () => {
      // **All six were `[]` before this.** The reader coerced any non-object to `{}`, which then took
      // the legacy no-`capabilities`-field exception — so four spellings of a damaged file answered
      // "nothing established", and a detected-only capability whose marker had also gone lost its
      // gate with no record that the roster ever contained it.
      const meeseeksDir = path.join(makeProject(), '.meeseeks');
      mkdirSync(meeseeksDir, { recursive: true });
      writeFileSync(path.join(meeseeksDir, CAPABILITY_MANIFEST), body, 'utf8');
      assert.throws(() => establishedCapabilities(meeseeksDir), CapabilityError, body);
    });
  }

  it('keeps the legacy exception for the shape it was written for', () => {
    // The neighbour that keeps the refusal from being "refuse everything unfamiliar". A pre-0.190.0
    // manifest is an *object* without the field, and upgrading into one must not fail a run.
    const meeseeksDir = path.join(makeProject(), '.meeseeks');
    mkdirSync(meeseeksDir, { recursive: true });
    writeFileSync(path.join(meeseeksDir, CAPABILITY_MANIFEST), JSON.stringify({ declared: [], detected: {} }), 'utf8');
    assert.deepStrictEqual(establishedCapabilities(meeseeksDir), []);
  });

  it('refuses a manifest that is gone after this run wrote one', () => {
    // The other half: production writes the manifest on the first resolution and reads it every
    // iteration after, so from the second call onward an absent file is *loss*. It answered `[]`,
    // which is the same silent disarm by a different route — and the route is reachable, because the
    // guard hook denies tool writes under `.meeseeks/` and not a process outside that boundary.
    const meeseeksDir = path.join(makeProject(), '.meeseeks');
    mkdirSync(meeseeksDir, { recursive: true });
    assert.throws(
      () => establishedCapabilities(meeseeksDir, { expected: true }),
      (/** @type {unknown} */ error) => {
        assert.equal(error instanceof CapabilityError, true);
        assert.equal(/** @type {Error} */ (error).message.includes('is gone, and this run wrote it'), true);
        return true;
      },
    );
  });

  it('still treats an absent manifest as the first iteration when nothing has been written', () => {
    // The neighbour, and it is load-bearing: every run's first resolution finds no manifest, so a
    // reader that refused on absence outright would fail every run at its first gate.
    const meeseeksDir = path.join(makeProject(), '.meeseeks');
    assert.deepStrictEqual(establishedCapabilities(meeseeksDir, { expected: false }), []);
    assert.deepStrictEqual(establishedCapabilities(meeseeksDir), []);
  });

  it('reads a manifest that is present, whether or not the caller expected one', () => {
    const meeseeksDir = path.join(makeProject(), '.meeseeks');
    writeCapabilityManifest(
      meeseeksDir,
      resolveCapabilities({ root: makeProject(), declared: ['cli'], detected: { 'web-ui': 'dependency react' } }),
    );
    assert.deepStrictEqual(establishedCapabilities(meeseeksDir, { expected: true }), ['web-ui', 'cli']);
  });
});

describe('the driver expects its own manifest back after it writes one (REVIEW F13, reopened again)', () => {
  // **Positional, because the flag lives in a closure no test can hold.** `runCapabilities` rewrites
  // the manifest every call, so the second call onward must pass `expected: true` — and a call site
  // that kept the old one-argument form would satisfy every unit test above while restoring exactly
  // the silent disarm they exist to prevent.
  const source = readFileSync(new URL('../scripts/driver.mjs', import.meta.url), 'utf8');

  it('passes its own write-state into the reader', () => {
    assert.equal(
      source.includes('establishedCapabilities(meeseeksDir, { expected: capabilityManifestWritten })'),
      true,
      'the driver reads the manifest without saying whether it wrote one',
    );
  });

  it('sets that state only after the write, not before it', () => {
    const write = source.indexOf('writeCapabilityManifest(meeseeksDir, resolved);');
    const set = source.indexOf('capabilityManifestWritten = true;');
    assert.equal(write >= 0 && set > write, true, 'the flag is set before the manifest exists');
  });
});
