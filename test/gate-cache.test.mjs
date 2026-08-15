/**
 * Tests for the gate-skip cache (BORROWED.md R35, PLAN.md item 43).
 *
 * The one property under defence is the fail-safe bias: a gate is skipped ONLY when the source
 * tree is provably byte-identical since that gate last failed, and every other case re-runs. So
 * for each skip path there is a benign neighbour proving the re-run — a changed file re-runs, an
 * uncomputable hash re-runs, a passing gate is never carried, a non-skippable gate is never
 * carried. Values are asserted, never truthiness.
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import {
  GATE_SKIP_FILE,
  SKIPPABLE_GATES,
  loadGateCache,
  planGateRun,
  saveGateCache,
  updateGateCache,
  workspaceHash,
} from '../scripts/gate-cache.mjs';

/** @type {string[]} */
const temporaryDirs = [];
after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** A temp dir cleaned up after the suite. */
function tempDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-gate-cache-'));
  temporaryDirs.push(dir);
  return dir;
}

/**
 * A `run` double that answers the two `git ls-files` calls `workspaceHash` makes with a fixed
 * set of relative paths, and lets a test force either call to fail.
 *
 * @param {{ tracked?: string[], untracked?: string[], failTracked?: boolean, failUntracked?: boolean }} table
 */
function lsFilesRunner(table) {
  const tracked = table.tracked ?? [];
  const untracked = table.untracked ?? [];
  /** @param {string} _command @param {string[]} args */
  return (_command, args) => {
    const others = args.includes('--others');
    if (others) {
      return { ok: table.failUntracked !== true, status: 0, stdout: untracked.join('\0'), stderr: '' };
    }
    return { ok: table.failTracked !== true, status: 0, stdout: tracked.join('\0'), stderr: '' };
  };
}

describe('workspaceHash', () => {
  it('is a stable sha256 over the same tree, and reads real file bytes', async () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, 'a.js'), 'export const a = 1;\n');
    mkdirSync(path.join(dir, 'src'), { recursive: true });
    writeFileSync(path.join(dir, 'src/b.js'), 'export const b = 2;\n');
    const run = lsFilesRunner({ tracked: ['a.js', 'src/b.js'] });

    const first = await workspaceHash({ cwd: dir, run });
    const second = await workspaceHash({ cwd: dir, run });
    assert.equal(typeof first, 'string');
    assert.match(/** @type {string} */ (first), /^sha256:[0-9a-f]{64}$/);
    assert.equal(second, first);
  });

  it('is independent of the order git lists the files', async () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, 'a.js'), 'A\n');
    writeFileSync(path.join(dir, 'b.js'), 'B\n');
    const forward = await workspaceHash({ cwd: dir, run: lsFilesRunner({ tracked: ['a.js', 'b.js'] }) });
    const reversed = await workspaceHash({ cwd: dir, run: lsFilesRunner({ tracked: ['b.js', 'a.js'] }) });
    assert.equal(reversed, forward);
  });

  it('changes when a source file changes — the RE-RUN signal', async () => {
    const dir = tempDir();
    const file = path.join(dir, 'a.js');
    writeFileSync(file, 'export const a = 1;\n');
    const run = lsFilesRunner({ tracked: ['a.js'] });
    const before = await workspaceHash({ cwd: dir, run });
    writeFileSync(file, 'export const a = 2;\n');
    const afterEdit = await workspaceHash({ cwd: dir, run });
    assert.notEqual(afterEdit, before);
  });

  it('changes when an untracked source file is added', async () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, 'a.js'), 'A\n');
    const before = await workspaceHash({ cwd: dir, run: lsFilesRunner({ tracked: ['a.js'] }) });
    writeFileSync(path.join(dir, 'new.js'), 'NEW\n');
    const afterAdd = await workspaceHash({
      cwd: dir,
      run: lsFilesRunner({ tracked: ['a.js'], untracked: ['new.js'] }),
    });
    assert.notEqual(afterAdd, before);
  });

  it('returns null when git ls-files fails — uncertainty, not an empty tree', async () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, 'a.js'), 'A\n');
    const trackedFail = await workspaceHash({ cwd: dir, run: lsFilesRunner({ tracked: ['a.js'], failTracked: true }) });
    assert.equal(trackedFail, null);
    const untrackedFail = await workspaceHash({
      cwd: dir,
      run: lsFilesRunner({ tracked: ['a.js'], failUntracked: true }),
    });
    assert.equal(untrackedFail, null);
  });

  it('returns null when a listed file cannot be read', async () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, 'a.js'), 'A\n');
    // git named a file node cannot read (it does not exist on disk): the tree is unhashable.
    const run = lsFilesRunner({ tracked: ['a.js', 'gone.js'] });
    assert.equal(await workspaceHash({ cwd: dir, run }), null);
  });
});

describe('loadGateCache / saveGateCache', () => {
  it('round-trips a cache', () => {
    const dir = tempDir();
    const cache = {
      version: 1,
      gates: { lint: { workspaceHash: 'sha256:abc', detail: 'boom', status: 1, attempts: 2 } },
    };
    saveGateCache(dir, cache);
    assert.deepStrictEqual(loadGateCache(dir), cache);
  });

  it('writes the file under the R35 name', () => {
    const dir = tempDir();
    saveGateCache(dir, { version: 1, gates: {} });
    // The file exists at exactly the ignored/guarded path, not some other name.
    assert.equal(readFileSync(path.join(dir, GATE_SKIP_FILE), 'utf8').startsWith('{'), true);
  });

  it('returns an empty cache when the file is missing', () => {
    assert.deepStrictEqual(loadGateCache(tempDir()), { version: 1, gates: {} });
  });

  it('returns an empty cache on corrupt JSON — losing the cache only re-runs', () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, GATE_SKIP_FILE), '{ not json', 'utf8');
    assert.deepStrictEqual(loadGateCache(dir), { version: 1, gates: {} });
  });

  it('returns an empty cache on a wrong version', () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, GATE_SKIP_FILE), JSON.stringify({ version: 999, gates: {} }), 'utf8');
    assert.deepStrictEqual(loadGateCache(dir), { version: 1, gates: {} });
  });

  it('drops a malformed entry but keeps the well-formed ones', () => {
    const dir = tempDir();
    writeFileSync(
      path.join(dir, GATE_SKIP_FILE),
      JSON.stringify({
        version: 1,
        gates: {
          lint: { workspaceHash: 'sha256:abc', detail: 'boom', status: 1, attempts: 1 },
          build: { workspaceHash: 5, detail: 'x', status: 1, attempts: 1 },
          types: { workspaceHash: 'sha256:d', detail: 7, status: 1, attempts: 1 },
        },
      }),
      'utf8',
    );
    assert.deepStrictEqual(loadGateCache(dir), {
      version: 1,
      gates: { lint: { workspaceHash: 'sha256:abc', detail: 'boom', status: 1, attempts: 1 } },
    });
  });
});

describe('planGateRun — the skip decision', () => {
  const lint = { name: 'lint', command: ['npm', 'run', 'lint'], required: true };
  const build = { name: 'build', command: ['npm', 'run', 'build'], required: true };
  const failure = (/** @type {string} */ hash) => ({ workspaceHash: hash, detail: 'lint boom', status: 1, attempts: 1 });

  it('SKIPS a skippable gate whose prior failure hash matches the current tree', () => {
    const plan = planGateRun({
      gates: [lint],
      cache: { version: 1, gates: { lint: failure('sha256:same') } },
      currentHash: 'sha256:same',
    });
    assert.deepStrictEqual(plan.toRun, []);
    assert.deepStrictEqual(plan.skipped, [{ name: 'lint', detail: 'lint boom', status: 1, attempts: 2 }]);
  });

  it('RE-RUNS the gate when a source file changed (hash differs) — benign neighbour', () => {
    const plan = planGateRun({
      gates: [lint],
      cache: { version: 1, gates: { lint: failure('sha256:old') } },
      currentHash: 'sha256:new',
    });
    assert.deepStrictEqual(plan.toRun, [lint]);
    assert.deepStrictEqual(plan.skipped, []);
  });

  it('RE-RUNS when the current hash is null — uncertainty never skips', () => {
    const plan = planGateRun({
      gates: [lint],
      cache: { version: 1, gates: { lint: failure('sha256:same') } },
      currentHash: null,
    });
    assert.deepStrictEqual(plan.toRun, [lint]);
    assert.deepStrictEqual(plan.skipped, []);
  });

  it('RE-RUNS when the recorded failure has a null hash — no prior hash to trust', () => {
    const plan = planGateRun({
      gates: [lint],
      cache: { version: 1, gates: { lint: failure(/** @type {never} */ (null)) } },
      currentHash: 'sha256:same',
    });
    assert.deepStrictEqual(plan.toRun, [lint]);
    assert.deepStrictEqual(plan.skipped, []);
  });

  it('RE-RUNS a gate with no prior record — a pass is never carried', () => {
    const plan = planGateRun({ gates: [lint], cache: { version: 1, gates: {} }, currentHash: 'sha256:same' });
    assert.deepStrictEqual(plan.toRun, [lint]);
    assert.deepStrictEqual(plan.skipped, []);
  });

  it('never skips a non-skippable gate even with a matching prior failure', () => {
    // `unit` and `security-audit` are deliberately out of the allow-list: their inputs are not
    // bounded by the source tree, so a matching hash is not proof their result is unchanged.
    assert.equal(SKIPPABLE_GATES.has('unit'), false);
    assert.equal(SKIPPABLE_GATES.has('security-audit'), false);
    const unit = { name: 'unit', command: ['npx', 'vitest'], required: true };
    const audit = { name: 'security-audit', command: ['npm', 'audit'], required: true };
    const plan = planGateRun({
      gates: [unit, audit],
      cache: {
        version: 1,
        gates: {
          unit: { workspaceHash: 'sha256:same', detail: 'x', status: 1, attempts: 3 },
          'security-audit': { workspaceHash: 'sha256:same', detail: 'y', status: 1, attempts: 3 },
        },
      },
      currentHash: 'sha256:same',
    });
    assert.deepStrictEqual(plan.toRun, [unit, audit]);
    assert.deepStrictEqual(plan.skipped, []);
  });

  it('skips only the matching gate and runs the changed one, preserving order', () => {
    const plan = planGateRun({
      gates: [build, lint],
      cache: {
        version: 1,
        gates: {
          build: { workspaceHash: 'sha256:same', detail: 'build boom', status: 2, attempts: 1 },
          lint: { workspaceHash: 'sha256:stale', detail: 'lint boom', status: 1, attempts: 1 },
        },
      },
      currentHash: 'sha256:same',
    });
    assert.deepStrictEqual(plan.toRun, [lint]);
    assert.deepStrictEqual(plan.skipped, [{ name: 'build', detail: 'build boom', status: 2, attempts: 2 }]);
  });
});

describe('updateGateCache — recording after a pass', () => {
  it('records a skippable failure with the current hash and an incremented attempt', () => {
    const next = updateGateCache({
      cache: { version: 1, gates: {} },
      currentHash: 'sha256:h',
      ranResults: [{ name: 'lint', ok: false, status: 1, detail: 'lint boom' }],
      skipped: [],
    });
    assert.deepStrictEqual(next.gates.lint, {
      workspaceHash: 'sha256:h',
      detail: 'lint boom',
      status: 1,
      attempts: 1,
    });
  });

  it('increments the attempt count across consecutive failing runs on the same hash', () => {
    const first = updateGateCache({
      cache: { version: 1, gates: {} },
      currentHash: 'sha256:h',
      ranResults: [{ name: 'lint', ok: false, status: 1, detail: 'boom' }],
      skipped: [],
    });
    const second = updateGateCache({
      cache: first,
      currentHash: 'sha256:h',
      ranResults: [{ name: 'lint', ok: false, status: 1, detail: 'boom' }],
      skipped: [],
    });
    assert.equal(second.gates.lint.attempts, 2);
  });

  it('clears the record when the gate passes — never carry a pass', () => {
    const next = updateGateCache({
      cache: { version: 1, gates: { lint: { workspaceHash: 'sha256:h', detail: 'boom', status: 1, attempts: 4 } } },
      currentHash: 'sha256:h',
      ranResults: [{ name: 'lint', ok: true, status: 0 }],
      skipped: [],
    });
    assert.equal(Object.hasOwn(next.gates, 'lint'), false);
  });

  it('does not record a non-skippable failing gate', () => {
    const next = updateGateCache({
      cache: { version: 1, gates: {} },
      currentHash: 'sha256:h',
      ranResults: [{ name: 'unit', ok: false, status: 1, detail: 'test failed' }],
      skipped: [],
    });
    assert.deepStrictEqual(next.gates, {});
  });

  it('stores a null hash for a failure recorded under uncertainty, so it can never be skipped later', () => {
    const next = updateGateCache({
      cache: { version: 1, gates: {} },
      currentHash: null,
      ranResults: [{ name: 'lint', ok: false, status: 1, detail: 'boom' }],
      skipped: [],
    });
    assert.equal(next.gates.lint.workspaceHash, null);
    // And that record cannot then authorise a skip on any hash.
    const plan = planGateRun({
      gates: [{ name: 'lint', command: ['x'], required: true }],
      cache: next,
      currentHash: 'sha256:anything',
    });
    assert.deepStrictEqual(plan.skipped, []);
  });

  it('carries a skipped entry forward at its already-incremented attempt count', () => {
    const cache = {
      version: 1,
      gates: { lint: { workspaceHash: 'sha256:h', detail: 'boom', status: 1, attempts: 1 } },
    };
    const plan = planGateRun({
      gates: [{ name: 'lint', command: ['x'], required: true }],
      cache,
      currentHash: 'sha256:h',
    });
    const next = updateGateCache({ cache, currentHash: 'sha256:h', ranResults: [], skipped: plan.skipped });
    assert.deepStrictEqual(next.gates.lint, {
      workspaceHash: 'sha256:h',
      detail: 'boom',
      status: 1,
      attempts: 2,
    });
  });
});

describe('two consecutive iterations end to end', () => {
  // The load-bearing scenarios, composed from the real functions and a real tree, so the skip and
  // its benign neighbours are proven through the same path the driver takes.
  const lint = { name: 'lint', command: ['npm', 'run', 'lint'], required: true };

  it('SKIPS on iteration 2 when the tree is byte-identical since the failure', async () => {
    const dir = tempDir();
    const meeseeksDir = path.join(dir, '.meeseeks');
    writeFileSync(path.join(dir, 'a.js'), 'export const a = 1;\n');
    const run = lsFilesRunner({ tracked: ['a.js'] });

    // Iteration 1: lint fails, record it against the tree hash.
    const hash1 = await workspaceHash({ cwd: dir, run });
    saveGateCache(
      meeseeksDir,
      updateGateCache({
        cache: loadGateCache(meeseeksDir),
        currentHash: hash1,
        ranResults: [{ name: 'lint', ok: false, status: 1, detail: 'lint boom' }],
        skipped: [],
      }),
    );

    // Iteration 2: nothing changed. The gate is skipped and its failure carried at attempt 2.
    const hash2 = await workspaceHash({ cwd: dir, run });
    const plan = planGateRun({ gates: [lint], cache: loadGateCache(meeseeksDir), currentHash: hash2 });
    assert.deepStrictEqual(plan.toRun, []);
    assert.deepStrictEqual(plan.skipped, [{ name: 'lint', detail: 'lint boom', status: 1, attempts: 2 }]);
  });

  it('RE-RUNS on iteration 2 when a source file changed', async () => {
    const dir = tempDir();
    const meeseeksDir = path.join(dir, '.meeseeks');
    const file = path.join(dir, 'a.js');
    writeFileSync(file, 'export const a = 1;\n');
    const run = lsFilesRunner({ tracked: ['a.js'] });

    const hash1 = await workspaceHash({ cwd: dir, run });
    saveGateCache(
      meeseeksDir,
      updateGateCache({
        cache: loadGateCache(meeseeksDir),
        currentHash: hash1,
        ranResults: [{ name: 'lint', ok: false, status: 1, detail: 'lint boom' }],
        skipped: [],
      }),
    );

    writeFileSync(file, 'export const a = 999;\n');
    const hash2 = await workspaceHash({ cwd: dir, run });
    const plan = planGateRun({ gates: [lint], cache: loadGateCache(meeseeksDir), currentHash: hash2 });
    assert.deepStrictEqual(plan.toRun, [lint]);
    assert.deepStrictEqual(plan.skipped, []);
  });

  it('RE-RUNS on iteration 2 when the hash cannot be computed', async () => {
    const dir = tempDir();
    const meeseeksDir = path.join(dir, '.meeseeks');
    writeFileSync(path.join(dir, 'a.js'), 'export const a = 1;\n');

    const hash1 = await workspaceHash({ cwd: dir, run: lsFilesRunner({ tracked: ['a.js'] }) });
    saveGateCache(
      meeseeksDir,
      updateGateCache({
        cache: loadGateCache(meeseeksDir),
        currentHash: hash1,
        ranResults: [{ name: 'lint', ok: false, status: 1, detail: 'lint boom' }],
        skipped: [],
      }),
    );

    // git errors this iteration: hash is null, so nothing is skipped.
    const hash2 = await workspaceHash({ cwd: dir, run: lsFilesRunner({ tracked: ['a.js'], failTracked: true }) });
    assert.equal(hash2, null);
    const plan = planGateRun({ gates: [lint], cache: loadGateCache(meeseeksDir), currentHash: hash2 });
    assert.deepStrictEqual(plan.toRun, [lint]);
    assert.deepStrictEqual(plan.skipped, []);
  });
});
