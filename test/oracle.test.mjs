/**
 * Tests for the held-out oracle (A3).
 *
 * The property worth defending is that this cannot quietly pass. Every other gate is downstream
 * of the builder; this is the one artifact written before any code exists and never shown to the
 * thing it judges, so a silent success here is worse than a silent success anywhere else.
 *
 * The measurement that justifies it: run 12's reviewer wrote an independent reference from the
 * PRD and fuzzed 110,877 cases, and still shipped `mean: 0` where the answer is 1/3 — because a
 * reference derived from the same documents shares their blind spots exactly.
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import {
  OracleError,
  judgeOracleCase,
  parseOracleCases,
  readOracle,
  runOracle,
  writeOracle,
} from '../scripts/oracle.mjs';

/** @type {string[]} */
const temporaryDirs = [];

/** @returns {string} */
function makeTempDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dare-oracle-'));
  temporaryDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** @param {Partial<import('../scripts/oracle.mjs').OracleCase>} [over] */
const aCase = (over = {}) => ({
  id: 'O-1',
  files: [{ path: 'in.csv', content: 'a\n1\n' }],
  argv: ['in.csv'],
  expectExit: 0,
  expectStdout: '{"columns":[]}',
  why: 'because',
  ...over,
});

describe('the oracle store', () => {
  it('fails the gate when it was never authored, rather than passing over nothing', () => {
    // The one shape that reads exactly like an oracle everything passed.
    const dareDir = path.join(makeTempDir(), '.dare');
    mkdirSync(dareDir, { recursive: true });
    const result = runOracle({ dareDir, root: '/repo', command: ['node', 'bin.js'], run: () => ({ ok: true, status: 0, stdout: '', stderr: '' }) });
    assert.equal(result.ok, false);
    assert.match(result.detail, /never authored/);
  });

  it('fails the gate on a store that will not parse', () => {
    const dareDir = path.join(makeTempDir(), '.dare');
    mkdirSync(dareDir, { recursive: true });
    writeFileSync(path.join(dareDir, 'oracle.json'), '{ not json', 'utf8');
    assert.equal(runOracle({ dareDir, root: '/r', command: ['node'], run: () => ({ ok: true, status: 0, stdout: '', stderr: '' }) }).ok, false);
  });

  it('refuses to write an empty oracle', () => {
    assert.throws(() => writeOracle(path.join(makeTempDir(), '.dare'), []), OracleError);
  });

  it('round-trips what it wrote', () => {
    const dareDir = path.join(makeTempDir(), '.dare');
    writeOracle(dareDir, [aCase()]);
    const read = readOracle(dareDir);
    assert.equal(read.length, 1);
    assert.equal(read[0].expectStdout, '{"columns":[]}');
    assert.deepStrictEqual(read[0].argv, ['in.csv']);
  });
});

describe('case validation', () => {
  it('refuses a case that expects nothing', () => {
    // Executes, asserts nothing, reports a pass — the "test that cannot fail", reproduced inside
    // the check that exists to be independent of the builder's tests.
    assert.throws(
      () => parseOracleCases('```json\n' + JSON.stringify({ cases: [aCase({ expectExit: null, expectStdout: null })] }) + '\n```'),
      /expects nothing/,
    );
  });

  it('refuses a case that would write outside its scratch directory', () => {
    // An oracle able to scribble on the tree it judges is not an oracle.
    for (const bad of ['../escape.csv', '/etc/passwd', 'a/../../b.csv']) {
      assert.throws(
        () => parseOracleCases('```json\n' + JSON.stringify({ cases: [aCase({ files: [{ path: bad, content: 'x' }] })] }) + '\n```'),
        /outside its scratch directory/,
        `accepted ${bad}`,
      );
    }
  });

  it('refuses a case with no id, and one with no argv', () => {
    assert.throws(() => parseOracleCases('```json\n' + JSON.stringify({ cases: [aCase({ id: '' })] }) + '\n```'), /no id/);
    assert.throws(() => parseOracleCases('```json\n' + JSON.stringify({ cases: [{ id: 'x', expectExit: 0 }] }) + '\n```'), /argv/);
  });

  it('refuses an empty case list rather than treating it as nothing to check', () => {
    assert.throws(() => parseOracleCases('```json\n{"cases":[]}\n```'), /empty case list/);
  });

  it('throws when no parseable block came back at all', () => {
    assert.throws(() => parseOracleCases('I could not think of any cases.'), /no parseable json block/);
  });

  it('takes the last block, so an echoed example never wins over the answer', () => {
    const echoed = JSON.stringify({ cases: [aCase({ id: 'ECHOED' })] });
    const answer = JSON.stringify({ cases: [aCase({ id: 'ANSWER' })] });
    const parsed = parseOracleCases('```json\n' + echoed + '\n```\ntext\n```json\n' + answer + '\n```');
    assert.equal(parsed[0].id, 'ANSWER');
  });
});

describe('judging', () => {
  it('fails a wrong exit code, naming both numbers', () => {
    const verdict = judgeOracleCase(aCase(), { status: 3, stdout: '{"columns":[]}' });
    assert.equal(verdict.ok, false);
    assert.match(verdict.detail, /expected exit 0, got 3/);
  });

  it('fails wrong stdout even when the exit code is right', () => {
    // The defect run 12 shipped exits 0. An oracle checking only the code would have passed it.
    const verdict = judgeOracleCase(aCase(), { status: 0, stdout: '{"columns":[1]}' });
    assert.equal(verdict.ok, false);
    assert.match(verdict.detail, /stdout differs/);
  });

  it('ignores a trailing newline, because failing a correct program over one is the defect class this repo keeps hitting', () => {
    assert.equal(judgeOracleCase(aCase(), { status: 0, stdout: '{"columns":[]}\n' }).ok, true);
  });

  it('passes only when every stated expectation holds', () => {
    assert.equal(judgeOracleCase(aCase(), { status: 0, stdout: '{"columns":[]}' }).ok, true);
  });
});

describe('running the cases', () => {
  /** @param {import('../scripts/oracle.mjs').OracleCase[]} cases @param {(cwd: string) => { ok: boolean, status: number, stdout: string, stderr: string }} responder */
  function runWith(cases, responder) {
    const dareDir = path.join(makeTempDir(), '.dare');
    writeOracle(dareDir, cases);
    return runOracle({ dareDir, root: '/repo', command: ['node', 'dist/bin.js'], run: (_c, _a, o) => responder(o.cwd) });
  }

  it('materialises each case\'s files and runs in that directory', () => {
    /** @type {string[]} */
    const seen = [];
    const result = runWith([aCase()], (cwd) => {
      seen.push(readFileSync(path.join(cwd, 'in.csv'), 'utf8'));
      return { ok: true, status: 0, stdout: '{"columns":[]}', stderr: '' };
    });
    assert.deepStrictEqual(seen, ['a\n1\n']);
    assert.equal(result.ok, true);
  });

  it('reports how many failed out of how many, not merely that something did', () => {
    const result = runWith([aCase({ id: 'A' }), aCase({ id: 'B' })], () => ({ ok: false, status: 9, stdout: '', stderr: '' }));
    assert.equal(result.ok, false);
    assert.match(result.detail, /2 of 2 held-out case\(s\) failed/);
    assert.match(result.detail, /A: expected exit 0, got 9/);
  });

  it('cleans its scratch directory up, so one case cannot see the previous one\'s files', () => {
    const dareDir = path.join(makeTempDir(), '.dare');
    writeOracle(dareDir, [aCase({ id: 'A', files: [{ path: 'only-a.csv', content: 'x' }] }), aCase({ id: 'B', files: [] })]);
    /** @type {string[][]} */
    const listings = [];
    runOracle({
      dareDir,
      root: '/repo',
      command: ['node'],
      run: (_c, _a, o) => {
        listings.push(readdirSync(o.cwd));
        return { ok: true, status: 0, stdout: '{"columns":[]}', stderr: '' };
      },
    });
    assert.deepStrictEqual(listings[0], ['only-a.csv']);
    assert.deepStrictEqual(listings[1], [], 'the second case saw the first case\'s files');
  });
});
