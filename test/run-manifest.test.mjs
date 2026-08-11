/**
 * Tests for the run manifest (DESIGN.md §7.1).
 *
 * The manifest is informational, which makes it the easy thing to get quietly wrong. So the
 * assertions are about the two claims that matter: that it never invents a value, and that
 * nothing in the codebase can read it back and act on it. The second one is asserted over the
 * whole `scripts/` tree rather than over this module, because "no reader exists" is a property
 * of the tree.
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

import {
  RUN_MANIFEST,
  RunManifestError,
  buildRunManifest,
  configHash,
  writeRunManifest,
} from '../scripts/run-manifest.mjs';

/** @type {string[]} */
const temporaryDirs = [];

/** @returns {string} */
function makeDareDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dare-run-manifest-'));
  temporaryDirs.push(dir);
  return path.join(dir, '.dare');
}

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** @param {Record<string, unknown>} [overrides] */
const input = (overrides = {}) => ({
  startedAt: '2026-08-11T04:00:00.000Z',
  startCommit: 'abc1234def5678',
  pluginName: 'dare-to-be-stupid',
  pluginVersion: '0.17.0',
  config: { maxIterations: 25, tokenCeiling: 4_000_000 },
  models: { builder: 'claude-sonnet-5', reviewer: 'claude-opus-5' },
  toolchain: { name: 'node', detected: true, evidence: 'file package.json' },
  capabilities: {
    declared: ['api'],
    detected: ['api', 'persistent-storage'],
    capabilities: ['api', 'persistent-storage'],
  },
  tools: { node: 'v22.12.0', git: 'git version 2.43.0' },
  ...overrides,
});

describe('configHash', () => {
  it('is stable across key order, so a re-serialised config hashes the same', () => {
    assert.equal(configHash({ a: 1, b: 2 }), configHash({ b: 2, a: 1 }));
  });

  it('is stable at depth, not only at the top level', () => {
    assert.equal(configHash({ race: { n: 3, after: 2 } }), configHash({ race: { after: 2, n: 3 } }));
  });

  it('changes when a value changes', () => {
    assert.notEqual(configHash({ maxIterations: 25 }), configHash({ maxIterations: 26 }));
  });

  it('distinguishes an absent key from a different value', () => {
    assert.notEqual(configHash({ a: 1 }), configHash({ a: 1, b: 2 }));
  });

  it('does not treat array order as insignificant', () => {
    // `reviewers` is an ordered list. Two runs with different panels are different runs.
    assert.notEqual(configHash({ reviewers: ['a', 'b'] }), configHash({ reviewers: ['b', 'a'] }));
  });

  it('announces its algorithm, so an old hash can still be interpreted', () => {
    assert.equal(configHash({}).startsWith('sha256:'), true);
  });
});

describe('buildRunManifest', () => {
  it('records every field it was given', () => {
    assert.deepEqual(buildRunManifest(input()), {
      version: 1,
      startedAt: '2026-08-11T04:00:00.000Z',
      startCommit: 'abc1234def5678',
      plugin: { name: 'dare-to-be-stupid', version: '0.17.0' },
      configHash: configHash({ maxIterations: 25, tokenCeiling: 4_000_000 }),
      models: { builder: 'claude-sonnet-5', reviewer: 'claude-opus-5' },
      toolchain: { name: 'node', detected: true, evidence: 'file package.json' },
      capabilities: {
        declared: ['api'],
        detected: ['api', 'persistent-storage'],
        resolved: ['api', 'persistent-storage'],
      },
      tools: { node: 'v22.12.0', git: 'git version 2.43.0' },
    });
  });

  it('hashes the configuration rather than embedding it', () => {
    // Harmless today, because the config is models and counts. Still hashed, so it stays
    // harmless after someone adds a field that is not.
    const manifest = buildRunManifest(input({ config: { apiKey: 'sk-not-actually-a-key' } }));
    assert.equal(JSON.stringify(manifest).includes('sk-not-actually-a-key'), false);
    assert.equal(manifest.configHash.startsWith('sha256:'), true);
  });

  it('records that a toolchain was defaulted rather than detected', () => {
    const manifest = buildRunManifest(
      input({ toolchain: { name: 'node', detected: false, evidence: 'nothing detected; defaulted to node' } }),
    );
    assert.equal(manifest.toolchain.detected, false);
    assert.equal(manifest.toolchain.evidence.includes('defaulted'), true);
  });

  it('keeps declared and detected capabilities apart, not just the union', () => {
    // The union is what gated the run; the split is what explains why.
    const manifest = buildRunManifest(
      input({ capabilities: { declared: ['cli'], detected: ['web-ui'], capabilities: ['web-ui', 'cli'] } }),
    );
    assert.deepEqual(manifest.capabilities, { declared: ['cli'], detected: ['web-ui'], resolved: ['web-ui', 'cli'] });
  });

  it('sorts the maps, so two identical runs produce identical bytes', () => {
    const forward = buildRunManifest(input({ tools: { git: 'g', node: 'n' } }));
    const backward = buildRunManifest(input({ tools: { node: 'n', git: 'g' } }));
    assert.equal(JSON.stringify(forward), JSON.stringify(backward));
  });

  it('accepts an empty tool map, because a probe that failed contributes no key', () => {
    assert.deepEqual(buildRunManifest(input({ tools: {} })).tools, {});
  });

  /** @type {[Record<string, unknown>, string][]} */
  const refused = [
    [{ startedAt: '' }, 'an empty timestamp'],
    [{ startedAt: undefined }, 'no timestamp'],
    [{ startCommit: '  ' }, 'a blank commit'],
    [{ pluginVersion: null }, 'a null version'],
    [{ models: null }, 'null models'],
    [{ models: { builder: '' } }, 'a model recorded as an empty string'],
    [{ models: ['claude-opus-5'] }, 'models as an array'],
    [{ tools: { node: 42 } }, 'a tool version that is not a string'],
    [{ toolchain: { name: 'node', evidence: 'x' } }, 'a toolchain that does not say whether it was detected'],
    [{ toolchain: { name: '', detected: true, evidence: 'x' } }, 'an unnamed toolchain'],
    [{ capabilities: null }, 'null capabilities'],
    [{ capabilities: { declared: 'api', detected: [], capabilities: [] } }, 'a declared list that is a string'],
  ];
  for (const [overrides, label] of refused) {
    it(`refuses ${label} rather than recording a placeholder`, () => {
      // A manifest that quietly says "unknown" is worse than no manifest: it looks like
      // evidence.
      assert.throws(() => buildRunManifest(input(overrides)), RunManifestError);
    });
  }
});

describe('writeRunManifest', () => {
  it('writes the manifest where the operator will look for it', () => {
    const dareDir = makeDareDir();
    const file = writeRunManifest(dareDir, buildRunManifest(input()));
    assert.equal(file, path.join(dareDir, RUN_MANIFEST));
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).startCommit, 'abc1234def5678');
  });

  it('leaves no temporary file behind, because the write is atomic', () => {
    const dareDir = makeDareDir();
    writeRunManifest(dareDir, buildRunManifest(input()));
    assert.deepEqual(readdirSync(dareDir), [RUN_MANIFEST]);
  });

  it('fails loudly when it cannot write, rather than continuing without the artifact', () => {
    // An artifact the operator was promised and did not get is a real fault. This is the one
    // way the manifest may end a run — by not existing, never by its contents.
    const parent = mkdtempSync(path.join(os.tmpdir(), 'dare-run-manifest-'));
    temporaryDirs.push(parent);
    const dareDir = path.join(parent, '.dare');
    mkdirSync(path.dirname(dareDir), { recursive: true });
    writeFileSync(dareDir, 'this is a file, not a directory\n', 'utf8');
    assert.throws(() => writeRunManifest(dareDir, buildRunManifest(input())), RunManifestError);
  });
});

describe('the manifest decides nothing', () => {
  it('is never read back by any shipped script', () => {
    // The strongest available guarantee that a manifest's contents cannot influence a run is
    // that no code path can consult them. Asserted over the tree rather than the module,
    // because a reader added anywhere would break the property.
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
      if (path.basename(file) === 'run-manifest.mjs') continue;
      const source = readFileSync(file, 'utf8');
      assert.equal(
        /readFileSync\([^)]*RUN_MANIFEST|['"]run\.json['"]/.test(source),
        false,
        `${path.basename(file)} appears to read the run manifest; it is a record, not an input`,
      );
    }
  });
});
