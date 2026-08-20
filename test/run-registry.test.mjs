/**
 * The per-user register of running Drivers (`scripts/run-registry.mjs`, REVIEW F42, DESIGN §6.6).
 *
 * The register is what makes ancestry answerable, so its failure modes are the ones that would make
 * the ancestry check quietly useless: an unreadable register read as empty, a stale entry read as a
 * live run, a corrupt entry counted anyway. Each of those turns a security check into a coin flip
 * in a direction nobody would notice.
 */

import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { deregisterRun, depthLookup, readRegistry, registerRun, registryDir } from '../scripts/run-registry.mjs';

/** @type {string[]} */
const homes = [];
after(() => {
  for (const home of homes) {
    for (const target of [registryDir(home), home]) {
      try {
        chmodSync(target, 0o755);
      } catch {
        // Only two cases clamp permissions, and either may not exist.
      }
    }
    rmSync(home, { recursive: true, force: true });
  }
});

/** @returns {string} */
function home() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-registry-'));
  homes.push(dir);
  return dir;
}

const ALL_ALIVE = { alive: () => true };

describe('registryDir', () => {
  it('sits under a `.meeseeks` path component, which is what the guard already protects', () => {
    // Not decoration. `MEESEEKS_DIR_RE` is positional, so this path inherits the rule that protects
    // a repository's state directory — no new guard rule, and nothing new to remember.
    assert.equal(registryDir('/home/x'), path.join('/home/x', '.meeseeks', 'runs'));
    assert.equal(registryDir('/home/x').includes(`${path.sep}.meeseeks${path.sep}`), true);
  });
});

describe('registerRun and readRegistry', () => {
  it('records a run and reads it back', () => {
    const dir = home();
    assert.equal(registerRun({ home: dir, pid: 4242, depth: 0, startedAt: 'T', root: '/repo' }), true);
    const view = readRegistry({ home: dir, ...ALL_ALIVE });
    assert.equal(view.known, true);
    assert.deepEqual(view.known === true ? view.runs : [], [{ pid: 4242, depth: 0, startedAt: 'T', root: '/repo' }]);
  });

  it('reads an absent register as genuinely empty, because the first run has not made it yet', () => {
    const view = readRegistry({ home: home(), ...ALL_ALIVE });
    assert.deepEqual(view, { known: true, runs: [] });
  });

  it('reports an unreadable register as unknown, never as empty', () => {
    // The distinction the whole module turns on. "Nothing is running" would let the F42 bypass
    // through on any host where the register cannot be read, and nothing would say so.
    const dir = home();
    registerRun({ home: dir, pid: 1, depth: 0, startedAt: 'T', root: '/repo' });
    chmodSync(registryDir(dir), 0o000);
    const view = readRegistry({ home: dir, ...ALL_ALIVE });
    chmodSync(registryDir(dir), 0o755);
    assert.deepEqual(view, { known: false });
  });

  it('prunes a dead pid rather than counting it as a run', () => {
    // A run killed with SIGKILL writes no farewell, so stale entries are ordinary. Counting one
    // would refuse a legitimate top-level run forever, which is the failure that gets the check
    // switched off.
    const dir = home();
    registerRun({ home: dir, pid: 111, depth: 0, startedAt: 'T', root: '/a' });
    registerRun({ home: dir, pid: 222, depth: 1, startedAt: 'T', root: '/b' });
    const view = readRegistry({ home: dir, alive: (pid) => pid === 222 });
    assert.deepEqual(view.known === true ? view.runs.map((run) => run.pid) : [], [222]);
    // And the dead entry is gone from disk, so the register does not grow without bound.
    assert.deepEqual(readdirSync(registryDir(dir)), ['222.json']);
  });

  it('prunes by liveness rather than by age, so a long legitimate run survives', () => {
    // The neighbour for the case above. A run lasts hours; an age rule would evict it mid-flight.
    const dir = home();
    registerRun({ home: dir, pid: 333, depth: 0, startedAt: '1970-01-01T00:00:00.000Z', root: '/a' });
    const view = readRegistry({ home: dir, ...ALL_ALIVE });
    assert.deepEqual(view.known === true ? view.runs.map((run) => run.pid) : [], [333]);
  });

  it('skips an entry it cannot read or cannot believe, without failing the whole read', () => {
    const dir = home();
    mkdirSync(registryDir(dir), { recursive: true });
    writeFileSync(path.join(registryDir(dir), '1.json'), '{ not json', 'utf8');
    writeFileSync(path.join(registryDir(dir), '2.json'), '[]', 'utf8');
    writeFileSync(path.join(registryDir(dir), '3.json'), JSON.stringify({ pid: 'x', depth: 0 }), 'utf8');
    writeFileSync(path.join(registryDir(dir), '4.json'), JSON.stringify({ pid: 4, depth: -1 }), 'utf8');
    writeFileSync(path.join(registryDir(dir), 'notes.txt'), 'ignored', 'utf8');
    registerRun({ home: dir, pid: 555, depth: 0, startedAt: 'T', root: '/a' });

    const view = readRegistry({ home: dir, ...ALL_ALIVE });
    assert.equal(view.known, true);
    assert.deepEqual(view.known === true ? view.runs.map((run) => run.pid) : [], [555]);
  });

  it('does not refuse to start when the register cannot be written', () => {
    // A read-only home is an operator's problem, not a security event. Refusing would turn a
    // permissions quirk into an outage.
    //
    // **A real read-only directory, not a synthetic impossible path.** The first version of this
    // case passed `/proc/nonexistent-and-unwritable`, and `mkdirSync` under `/proc` on WSL does not
    // fail — it **blocks**, forever, and the whole file was cancelled with zero tests run. A fixture
    // that hangs the suite is worse than a missing one, and the lesson generalizes: a path chosen to
    // be unwritable in the abstract is not the same as one that is unwritable the way an operator's
    // home would be.
    const readOnly = home();
    chmodSync(readOnly, 0o500);
    /** @type {string[]} */
    const logs = [];
    const written = registerRun({
      home: readOnly,
      pid: 1,
      depth: 0,
      startedAt: 'T',
      root: '/a',
      log: (line) => logs.push(line),
    });
    chmodSync(readOnly, 0o700);
    assert.equal(written, false);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /may not be recognised by ancestry/);
  });
});

describe('deregisterRun', () => {
  it('removes only this run entry', () => {
    const dir = home();
    registerRun({ home: dir, pid: 111, depth: 0, startedAt: 'T', root: '/a' });
    registerRun({ home: dir, pid: 222, depth: 0, startedAt: 'T', root: '/b' });
    deregisterRun({ home: dir, pid: 111 });
    assert.deepEqual(readdirSync(registryDir(dir)).sort(), ['222.json']);
  });

  it('is silent about an entry that is already gone', () => {
    assert.doesNotThrow(() => deregisterRun({ home: home(), pid: 999 }));
  });
});

describe('depthLookup', () => {
  it('answers with the registered depth, and null for a stranger', () => {
    const lookup = depthLookup({ known: true, runs: [{ pid: 7, depth: 1, startedAt: 'T', root: '/a' }] });
    assert.equal(lookup(7), 1);
    assert.equal(lookup(8), null);
  });

  it('answers null for everything when the register is unknown', () => {
    // Paired with `reconcileDepth`'s handling of unknown ancestry: neither invents a fact. What
    // this must never do is answer a *depth* it did not read.
    const lookup = depthLookup({ known: false });
    assert.equal(lookup(7), null);
  });

  it('reports a depth of zero as zero, not as absent', () => {
    // `?? null` on a `Map.get` would be correct; `|| null` would turn a top-level run's depth of
    // zero into "not registered", and a child of it would compute top level. One character.
    const lookup = depthLookup({ known: true, runs: [{ pid: 7, depth: 0, startedAt: 'T', root: '/a' }] });
    assert.equal(lookup(7), 0);
  });
});
