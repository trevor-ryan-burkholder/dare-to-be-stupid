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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

import { readAssumptions } from '../scripts/assumptions.mjs';
import {
  RUN_ARCHIVE_DIR,
  RUN_MANIFEST,
  RunManifestError,
  archivePreviousRun,
  buildRunManifest,
  configHash,
  writeRunManifest,
} from '../scripts/run-manifest.mjs';

/** @type {string[]} */
const temporaryDirs = [];

/** @returns {string} */
function makeMeeseeksDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-run-manifest-'));
  temporaryDirs.push(dir);
  return path.join(dir, '.meeseeks');
}

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** @param {Record<string, unknown>} [overrides] */
const input = (overrides = {}) => ({
  startedAt: '2026-08-11T04:00:00.000Z',
  startCommit: 'abc1234def5678',
  pluginName: 'meeseeks',
  pluginVersion: '0.17.0',
  config: { maxIterations: 25, tokenCeiling: 4_000_000 },
  models: { builder: 'claude-sonnet-5', reviewer: 'claude-opus-5' },
  effort: { builder: 'medium', review: 'max' },
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
      plugin: { name: 'meeseeks', version: '0.17.0' },
      configHash: configHash({ maxIterations: 25, tokenCeiling: 4_000_000 }),
      models: { builder: 'claude-sonnet-5', reviewer: 'claude-opus-5' },
      effort: { builder: 'medium', review: 'max' },
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
    const meeseeksDir = makeMeeseeksDir();
    const file = writeRunManifest(meeseeksDir, buildRunManifest(input()));
    assert.equal(file, path.join(meeseeksDir, RUN_MANIFEST));
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).startCommit, 'abc1234def5678');
  });

  it('leaves no temporary file behind, because the write is atomic', () => {
    const meeseeksDir = makeMeeseeksDir();
    writeRunManifest(meeseeksDir, buildRunManifest(input()));
    assert.deepEqual(readdirSync(meeseeksDir), [RUN_MANIFEST]);
  });

  it('fails loudly when it cannot write, rather than continuing without the artifact', () => {
    // An artifact the operator was promised and did not get is a real fault. This is the one
    // way the manifest may end a run — by not existing, never by its contents.
    const parent = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-run-manifest-'));
    temporaryDirs.push(parent);
    const meeseeksDir = path.join(parent, '.meeseeks');
    mkdirSync(path.dirname(meeseeksDir), { recursive: true });
    writeFileSync(meeseeksDir, 'this is a file, not a directory\n', 'utf8');
    assert.throws(() => writeRunManifest(meeseeksDir, buildRunManifest(input())), RunManifestError);
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

describe('archivePreviousRun', () => {
  // The item that produced this said ".meeseeks state is currently replaced per run", and its own
  // correction said briefs "accumulate". Both are wrong, and the tests below encode what is
  // actually true, because that was the whole of the work.

  /**
   * @param {Record<string, string>} files
   * @returns {string} a .meeseeks directory
   */
  function meeseeksDirWith(files) {
    const meeseeksDir = makeMeeseeksDir();
    for (const [relative, contents] of Object.entries(files)) {
      const full = path.join(meeseeksDir, ...relative.split('/'));
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, contents, 'utf8');
    }
    return meeseeksDir;
  }

  it('archives nothing, and says so, when there is no previous run', () => {
    // A first run must not create an empty `runs/001`, which would read as a run that
    // produced nothing rather than as a run that never happened.
    const meeseeksDir = makeMeeseeksDir();
    mkdirSync(meeseeksDir, { recursive: true });
    assert.equal(archivePreviousRun(meeseeksDir), null);
    assert.deepEqual(readdirSync(meeseeksDir), []);
  });

  it('moves the manifest, the briefs and the reality check into runs/001', () => {
    const meeseeksDir = meeseeksDirWith({
      'run.json': '{"version":1}',
      'briefs/iter-001.md': 'first brief',
      'reality-check.md': 'unbuildable because',
    });
    const target = archivePreviousRun(meeseeksDir);
    assert.equal(target, path.join(meeseeksDir, RUN_ARCHIVE_DIR, '001'));
    assert.deepEqual(readdirSync(/** @type {string} */ (target)).sort(), [
      'briefs',
      'reality-check.md',
      'run.json',
    ]);
    assert.equal(readFileSync(path.join(/** @type {string} */ (target), 'briefs', 'iter-001.md'), 'utf8'), 'first brief');
  });

  it('leaves the artifacts that are deliberately carried across runs', () => {
    // state.json is how the ratchet survives a run boundary; archiving it would silently
    // reset the monotonic guarantee, which is the worst possible outcome for this feature.
    const meeseeksDir = meeseeksDirWith({
      'run.json': '{"version":1}',
      'state.json': '{"version":1,"iteration":4,"passing":["a::b"],"lastGoodCommit":null}',
      'lessons.json': '{"version":1,"lessons":[]}',
      'red-evidence.json': '{"version":1,"red":[]}',
      'bloopers.log': 'iteration 3\n',
      'config.json': '{}',
    });
    archivePreviousRun(meeseeksDir);
    for (const kept of ['state.json', 'lessons.json', 'red-evidence.json', 'bloopers.log', 'config.json']) {
      assert.equal(existsSync(path.join(meeseeksDir, kept)), true, `${kept} was archived and must not be`);
    }
  });

  it('archives the assumptions log, so a later run cannot inherit it', () => {
    // Found in dogfood run 3. `assumptions.json` is appended rather than overwritten, so it
    // was not losing data - it was accumulating entries keyed by `iteration`, and iteration
    // numbering restarts every run. Run 2's `iteration: 2` and run 3's are indistinguishable.
    const meeseeksDir = meeseeksDirWith({
      'run.json': '{"version":1}',
      'assumptions.json':
        '{"version":1,"entries":[{"iteration":2,"cites":"iteration-2 brief","ambiguity":"a",' +
        '"assumed":"added an e2e step under continue-on-error"}]}',
    });
    const target = archivePreviousRun(meeseeksDir);

    assert.equal(existsSync(path.join(meeseeksDir, 'assumptions.json')), false);
    const archived = JSON.parse(
      readFileSync(path.join(/** @type {string} */ (target), 'assumptions.json'), 'utf8'),
    );
    assert.equal(archived.entries.length, 1);
    assert.equal(archived.entries[0].iteration, 2);
  });

  it('starts the next run with an assumptions log the reviewer cannot misread', () => {
    // The consequence, which is the reason this is a defect rather than untidiness: the log is
    // handed to the cold panel so it can check "you assumed X, the PRD says Y". Carried across
    // runs, the panel reasons about assumptions the current builder never made, against code
    // that may no longer exist. `readAssumptions` on a fresh run must find nothing.
    const meeseeksDir = meeseeksDirWith({
      'run.json': '{"version":1}',
      'assumptions.json':
        '{"version":1,"entries":[{"iteration":4,"cites":"c","ambiguity":"a","assumed":"s"}]}',
    });
    archivePreviousRun(meeseeksDir);
    assert.deepStrictEqual(readAssumptions(meeseeksDir).entries, []);
  });

  it('removes the originals, so the next run cannot write over them', () => {
    const meeseeksDir = meeseeksDirWith({ 'run.json': '{"version":1}', 'briefs/iter-001.md': 'first' });
    archivePreviousRun(meeseeksDir);
    assert.equal(existsSync(path.join(meeseeksDir, 'run.json')), false);
    assert.equal(existsSync(path.join(meeseeksDir, 'briefs')), false);
  });

  it('keeps a third run from overwriting the first two', () => {
    // The collision this exists to stop. Iteration numbering restarts at 1 each run, so
    // without archiving every run writes briefs/iter-001.md over the last one's.
    const meeseeksDir = makeMeeseeksDir();
    for (const body of ['run one', 'run two', 'run three']) {
      mkdirSync(path.join(meeseeksDir, 'briefs'), { recursive: true });
      writeFileSync(path.join(meeseeksDir, 'briefs', 'iter-001.md'), body, 'utf8');
      archivePreviousRun(meeseeksDir);
    }
    const archives = readdirSync(path.join(meeseeksDir, RUN_ARCHIVE_DIR)).sort();
    assert.deepEqual(archives, ['001', '002', '003']);
    const read = (/** @type {string} */ slot) =>
      readFileSync(path.join(meeseeksDir, RUN_ARCHIVE_DIR, slot, 'briefs', 'iter-001.md'), 'utf8');
    assert.deepEqual([read('001'), read('002'), read('003')], ['run one', 'run two', 'run three']);
  });

  it('archives only what the dead run managed to produce', () => {
    // A run that died before its design phase has no manifest. Inventing the missing entries
    // would put empty files in an archive that reads as evidence.
    const meeseeksDir = meeseeksDirWith({ 'briefs/iter-001.md': 'only this' });
    const target = archivePreviousRun(meeseeksDir);
    assert.deepEqual(readdirSync(/** @type {string} */ (target)), ['briefs']);
  });

  it('ignores an archive directory an operator renamed, rather than refusing to start', () => {
    const meeseeksDir = meeseeksDirWith({ 'run.json': '{"version":1}' });
    mkdirSync(path.join(meeseeksDir, RUN_ARCHIVE_DIR, 'the-one-that-shipped'), { recursive: true });
    assert.equal(archivePreviousRun(meeseeksDir), path.join(meeseeksDir, RUN_ARCHIVE_DIR, '001'));
  });

  it('numbers from the highest existing slot, not from the count', () => {
    // Deleting runs/001 must not make the next run reuse 002's number and land on top of it.
    const meeseeksDir = meeseeksDirWith({ 'run.json': '{"version":1}' });
    mkdirSync(path.join(meeseeksDir, RUN_ARCHIVE_DIR, '007'), { recursive: true });
    assert.equal(archivePreviousRun(meeseeksDir), path.join(meeseeksDir, RUN_ARCHIVE_DIR, '008'));
  });
});
