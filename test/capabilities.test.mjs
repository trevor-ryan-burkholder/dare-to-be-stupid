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
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import {
  CAPABILITIES,
  CAPABILITY_ORDER,
  CapabilityError,
  UNDETECTABLE,
  detectCapabilities,
  hasFrontend,
  resolveCapabilities,
  validateCapabilities,
} from '../scripts/capabilities.mjs';

/** @type {string[]} */
const temporaryDirs = [];

/**
 * @param {Record<string, string>} [files]
 * @returns {string}
 */
function makeProject(files = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dare-capabilities-'));
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
    assert.equal(hasFrontend(makeProject({ 'node_modules/react/index.js': 'x\n', 'src/a.ts': 'x\n' })), false);
  });

  it('ignores a built bundle in dist', () => {
    assert.equal(hasFrontend(makeProject({ 'dist/index.html': '<!doctype html>\n', 'src/a.ts': 'x\n' })), false);
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
