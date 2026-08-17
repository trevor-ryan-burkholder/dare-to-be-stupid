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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import {
  OracleError,
  RELATION_KINDS,
  judgeOracleCase,
  judgeOracleRelation,
  parseOracleCases,
  parseRelation,
  oracleMatchesSpecification,
  readOracle,
  resolveArtifactCommand,
  runOracle,
  writeOracle,
} from '../scripts/oracle.mjs';
import { PHASE_PERMISSIONS, claudeArgs, meeseeksIgnoreUpdate, oracleGate, staticGates } from '../scripts/driver.mjs';
import { archivePreviousRun } from '../scripts/run-manifest.mjs';

/**
 * The specification a store is bound to (REVIEW F8). Since 0.171.0 an oracle carries the digest of
 * the PRD its cases were authored from, and reading it without one — or with a different one — is a
 * failed gate rather than a reused store.
 */
const SPEC = 'sha256:0000000000000000000000000000000000000000000000000000000000000001';
import { defaultConfig } from '../scripts/config.mjs';

/** @type {string[]} */
const temporaryDirs = [];

/** @returns {string} */
function makeTempDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-oracle-'));
  temporaryDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** @param {Partial<import('../scripts/oracle.mjs').OracleCase>} [over] */
/** @param {Partial<import('../scripts/oracle.mjs').OracleCase>} [over] */
const aCase = (over = {}) => ({
  id: 'O-1',
  files: [{ path: 'in.csv', content: 'a\n1\n' }],
  argv: ['in.csv'],
  expectExit: 0,
  expectStdout: '{"columns":[]}',
  /** @type {import('../scripts/oracle.mjs').OracleRelation | null} */
  relation: null,
  why: 'because',
  ...over,
});

describe('the oracle store', () => {
  it('fails the gate when it was never authored, rather than passing over nothing', async () => {
    // The one shape that reads exactly like an oracle everything passed.
    const meeseeksDir = path.join(makeTempDir(), '.meeseeks');
    mkdirSync(meeseeksDir, { recursive: true });
    const result = await runOracle({ meeseeksDir, root: '/repo', command: ['node', 'bin.js'], specification: SPEC, run: () => ({ ok: true, status: 0, stdout: '', stderr: '' }) });
    assert.equal(result.ok, false);
    assert.match(result.detail, /never authored/);
  });

  it('fails the gate on a store that will not parse', async () => {
    const meeseeksDir = path.join(makeTempDir(), '.meeseeks');
    mkdirSync(meeseeksDir, { recursive: true });
    writeFileSync(path.join(meeseeksDir, 'oracle.json'), '{ not json', 'utf8');
    assert.equal((await runOracle({ meeseeksDir, root: '/r', command: ['node'], specification: SPEC, run: () => ({ ok: true, status: 0, stdout: '', stderr: '' }) })).ok, false);
  });

  it('refuses to write an empty oracle', () => {
    assert.throws(() => writeOracle(path.join(makeTempDir(), '.meeseeks'), [], { specification: SPEC }), OracleError);
  });

  it('round-trips what it wrote', () => {
    const meeseeksDir = path.join(makeTempDir(), '.meeseeks');
    writeOracle(meeseeksDir, [aCase()], { specification: SPEC });
    const read = readOracle(meeseeksDir, { specification: SPEC });
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
  async function runWith(cases, responder) {
    const meeseeksDir = path.join(makeTempDir(), '.meeseeks');
    writeOracle(meeseeksDir, cases, { specification: SPEC });
    return await runOracle({ meeseeksDir, root: '/repo', command: ['node', 'dist/bin.js'], specification: SPEC, run: (_c, _a, o) => responder(o.cwd) });
  }

  it('materialises each case\'s files and runs in that directory', async () => {
    /** @type {string[]} */
    const seen = [];
    const result = await runWith([aCase()], (cwd) => {
      seen.push(readFileSync(path.join(cwd, 'in.csv'), 'utf8'));
      return { ok: true, status: 0, stdout: '{"columns":[]}', stderr: '' };
    });
    assert.deepStrictEqual(seen, ['a\n1\n']);
    assert.equal(result.ok, true);
  });

  it('reports how many failed out of how many, not merely that something did', async () => {
    const result = await runWith([aCase({ id: 'A' }), aCase({ id: 'B' })], () => ({ ok: false, status: 9, stdout: '', stderr: '' }));
    assert.equal(result.ok, false);
    assert.match(result.detail, /2 of 2 held-out case\(s\) failed/);
    assert.match(result.detail, /A: expected exit 0, got 9/);
  });

  it('cleans its scratch directory up, so one case cannot see the previous one\'s files', async () => {
    const meeseeksDir = path.join(makeTempDir(), '.meeseeks');
    writeOracle(meeseeksDir, [aCase({ id: 'A', files: [{ path: 'only-a.csv', content: 'x' }] }), aCase({ id: 'B', files: [] })], { specification: SPEC });
    /** @type {string[][]} */
    const listings = [];
    await runOracle({
      meeseeksDir,
      specification: SPEC,
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

describe('resolveArtifactCommand', () => {
  // A CLI's entry point is what package.json declares as `bin`, because that is what a user
  // runs. Run 10 found a build whose declared bin was inert - zero bytes, exit 0, through a real
  // npm install -g - while every gate stayed green because each invoked node dist/cli.js
  // directly. Resolving through bin makes the oracle ask the same question a user does.

  /** @param {string} manifest */
  function treeWith(manifest) {
    const dir = makeTempDir();
    writeFileSync(path.join(dir, 'package.json'), manifest, 'utf8');
    return dir;
  }

  it('resolves a string bin to an absolute node invocation', () => {
    const dir = treeWith(JSON.stringify({ bin: 'dist/cli.js' }));
    assert.deepStrictEqual(resolveArtifactCommand(dir), ['node', path.join(dir, 'dist/cli.js')]);
  });

  it('resolves the first entry of an object bin', () => {
    const dir = treeWith(JSON.stringify({ bin: { csvstat: 'dist/bin.js' } }));
    assert.deepStrictEqual(resolveArtifactCommand(dir), ['node', path.join(dir, 'dist/bin.js')]);
  });

  it('returns null rather than guessing when no bin is declared', () => {
    // Picking a plausible-looking file would paper over exactly the defect run 10 found.
    assert.equal(resolveArtifactCommand(treeWith(JSON.stringify({ name: 'x' }))), null);
    assert.equal(resolveArtifactCommand(makeTempDir()), null);
    assert.equal(resolveArtifactCommand(treeWith('{ not json')), null);
  });
});

describe('the oracle as a gate', () => {
  it('fails, naming what it looked for, when there is no entry point', async () => {
    const dir = makeTempDir();
    const result = await oracleGate(dir, path.join(dir, '.meeseeks'), { run: () => ({ ok: true, status: 0, stdout: '', stderr: '' }) });
    assert.equal(result.ok, false);
    assert.match(result.detail, /declares no `bin`/);
  });

  it('is absent unless armed, and absent unless the driver supplied a .meeseeks', async () => {
    // Both are required. An oracle with nowhere to read from would report a clean pass over
    // nothing, and this is the one gate whose whole value is independence from the builder.
    const dir = makeTempDir();
    const named = async (/** @type {Record<string, unknown>} */ o) => (await staticGates(dir, o)).map((g) => g.name);
    assert.equal((await named({})).includes('oracle'), false);
    assert.equal((await named({ oracle: true })).includes('oracle'), false, 'armed with no meeseeksDir');
    assert.equal((await named({ meeseeksDir: path.join(dir, '.meeseeks') })).includes('oracle'), false, 'meeseeksDir with no arming');
    assert.equal((await named({ oracle: true, meeseeksDir: path.join(dir, '.meeseeks') })).includes('oracle'), true);
  });
});

describe('the oracle author is its own persona', () => {
  // Found by an independent audit: it ran as `review`, a phase PHASE_PERMISSIONS never declared,
  // and the table exists precisely so nothing inherits another phase's powers.
  //
  // The consequence was worse than the tidiness point. `review` carries Read, Glob and Grep, and
  // the driver authors the oracle *if the store is missing* - which includes a resumed tree where
  // the implementation already exists. An author able to read src/ writes cases against the code
  // it is meant to be independent of, and the whole held-out property is gone on exactly the runs
  // where nobody would think to look.

  it('is declared, so it cannot inherit another phase by accident', () => {
    assert.equal(Object.hasOwn(PHASE_PERMISSIONS, 'oracle-author'), true);
  });

  it('is given no tools at all, which is what makes held-out structural', () => {
    const policy = PHASE_PERMISSIONS['oracle-author'];
    assert.equal(policy.dangerous, false);
    assert.deepStrictEqual(policy.allowedTools, [], 'it can open the implementation it must not see');
  });

  it('is spawned with no tool grant, so a resumed tree cannot leak the code to it', () => {
    const args = claudeArgs({ model: 'm', phase: 'oracle-author' });
    assert.equal(args.includes('--allowedTools'), false);
    assert.equal(args.includes('--dangerously-skip-permissions'), false);
  });

  it('thinks at max, because it writes the one artifact judged against the spec', () => {
    assert.equal(defaultConfig().effort['oracle-author'], 'max');
  });
});

// R17, and item 7 measured why it is needed. The first armed oracle authored nineteen cases,
// every one asserting an exit code alone - correctly, because the template says to assert only
// expectExit when the specification does not fix byte-for-byte output. Planting run 12's naive
// accumulation into that run's tree then produced {"mean": null} for two finite inputs at exit 0
// and all nineteen cases still passed.
describe('metamorphic relations', () => {
  describe('parseRelation', () => {
    it('accepts absence, because most cases are ordinary', () => {
      assert.equal(parseRelation('O-1', undefined), null);
      assert.equal(parseRelation('O-1', null), null);
    });

    it('accepts each known kind and keeps the second run intact', () => {
      for (const kind of RELATION_KINDS) {
        const r = parseRelation('O-1', { kind, files: [{ path: 'b.csv', content: 'a\n2\n' }], argv: ['b.csv'] });
        assert.equal(r?.kind, kind);
        assert.deepStrictEqual(r?.argv, ['b.csv']);
        assert.equal(r?.files[0].content, 'a\n2\n');
      }
    });

    // Fail-closed. A relation quietly dropped is a case that asserts nothing while looking like
    // it asserts something.
    it('refuses an unknown kind rather than ignoring it', () => {
      assert.throws(() => parseRelation('O-1', { kind: 'vibes', files: [], argv: ['x'] }), /unknown kind/);
    });

    it('refuses a relation with no argv for its second run', () => {
      assert.throws(() => parseRelation('O-1', { kind: 'same-stdout', files: [] }), /argv array/);
    });

    it('refuses a relation escaping its scratch directory, like the primary run', () => {
      assert.throws(
        () => parseRelation('O-1', { kind: 'same-stdout', files: [{ path: '../x', content: 'y' }], argv: ['x'] }),
        /outside its scratch directory/,
      );
      assert.throws(
        () => parseRelation('O-1', { kind: 'same-stdout', files: [{ path: '/etc/passwd', content: 'y' }], argv: ['x'] }),
        /outside its scratch directory/,
      );
    });
  });

  describe('judgeOracleRelation', () => {
    /** @param {string} kind @returns {import('../scripts/oracle.mjs').OracleRelation} */
    const rel = (kind) => ({ kind: /** @type {any} */ (kind), files: [], argv: ['b.csv'] });
    /** @param {string} stdout @param {number} [status] */
    const out = (stdout, status = 0) => ({ status, stdout });

    it('passes same-stdout when two runs agree, whatever they printed', () => {
      // The point: no literal appears anywhere. The assertion survives a spec that never fixes
      // key order, spacing or number formatting.
      const v = judgeOracleRelation('O-1', rel('same-stdout'), out('{"mean":2}\n'), out('{"mean":2}'));
      assert.equal(v.ok, true, v.detail);
    });

    it('fails same-stdout when they disagree, and shows both', () => {
      const v = judgeOracleRelation('O-1', rel('same-stdout'), out('{"mean":0}'), out('{"mean":0.333}'));
      assert.equal(v.ok, false);
      assert.equal(v.detail.includes('same-stdout violated'), true, v.detail);
      assert.equal(v.detail.includes('0.333'), true, v.detail);
    });

    it('passes same-exit on matching codes and fails on differing ones', () => {
      assert.equal(judgeOracleRelation('O-1', rel('same-exit'), out('', 3), out('x', 3)).ok, true);
      const v = judgeOracleRelation('O-1', rel('same-exit'), out('', 0), out('', 3));
      assert.equal(v.ok, false);
      assert.equal(v.detail.includes('first exited 0, second exited 3'), true, v.detail);
    });

    // The deny path of the other two. A program that ignores its input satisfies every
    // same-stdout relation ever written.
    it('fails differs when a program ignored its input entirely', () => {
      const v = judgeOracleRelation('O-1', rel('differs'), out('{"columns":[]}'), out('{"columns":[]}'));
      assert.equal(v.ok, false);
      assert.equal(v.detail.includes('the input was ignored'), true, v.detail);
    });

    it('passes differs when the two runs genuinely differ', () => {
      assert.equal(judgeOracleRelation('O-1', rel('differs'), out('a'), out('b')).ok, true);
    });
  });

  // The assertion this whole feature exists for, in miniature: permutation invariance catches
  // an accumulation defect that no exit-code assertion can see. The naive sum of
  // [1e16, 1, -1e16] is 0; permuted to [1e16, -1e16, 1] it is 1, so the means differ while both
  // runs exit 0.
  it('catches an accumulation defect that exit codes cannot see', () => {
    const naiveMean = (/** @type {number[]} */ xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const first = { status: 0, stdout: JSON.stringify({ mean: naiveMean([1e16, 1, -1e16]) }) };
    const second = { status: 0, stdout: JSON.stringify({ mean: naiveMean([1e16, -1e16, 1]) }) };
    assert.equal(first.status, second.status, 'both runs exit 0, so no exit assertion could fire');
    const v = judgeOracleRelation('P-1', { kind: 'same-stdout', files: [], argv: ['b.csv'] }, first, second);
    assert.equal(v.ok, false, 'permutation invariance must catch what the exit code cannot');
  });

  it('runs the relation as a second real invocation, in its own scratch', async () => {
    const meeseeksDir = path.join(makeTempDir(), '.meeseeks');
    writeOracle(meeseeksDir, [
      aCase({
        id: 'P-1',
        expectStdout: null,
        files: [{ path: 'in.csv', content: 'v\n1\n2\n' }],
        relation: { kind: 'same-stdout', files: [{ path: 'in.csv', content: 'v\n2\n1\n' }], argv: ['in.csv'] },
      }),
    ], { specification: SPEC });
    /** @type {string[][]} */
    const invocations = [];
    const result = await runOracle({
      meeseeksDir,
      specification: SPEC,
      root: path.dirname(meeseeksDir),
      command: ['node', 'cli.js'],
      run: (_c, args) => {
        invocations.push(args);
        // Same output both times: an order-independent summary, which passes.
        return { ok: true, status: 0, stdout: '{"mean":1.5}', stderr: '' };
      },
    });
    assert.equal(result.ok, true, result.detail);
    assert.equal(invocations.length, 2, 'a relation case must invoke the program twice');
  });

  it('fails the gate when the second run breaks the relation', async () => {
    const meeseeksDir = path.join(makeTempDir(), '.meeseeks');
    writeOracle(meeseeksDir, [
      aCase({
        id: 'P-1',
        expectStdout: null,
        relation: { kind: 'same-stdout', files: [{ path: 'in.csv', content: 'v\n2\n1\n' }], argv: ['in.csv'] },
      }),
    ], { specification: SPEC });
    let call = 0;
    const result = await runOracle({
      meeseeksDir,
      specification: SPEC,
      root: path.dirname(meeseeksDir),
      command: ['node', 'cli.js'],
      run: () => ({ ok: true, status: 0, stdout: call++ === 0 ? '{"mean":0}' : '{"mean":0.333}', stderr: '' }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.detail.includes('same-stdout violated'), true, result.detail);
  });

  it('still refuses a case that asserts nothing at all', () => {
    assert.throws(
      () => parseOracleCases('```json\n{"cases":[{"id":"X","files":[],"argv":["a"],"why":"w"}]}\n```'),
      /asserts neither an exit code, nor stdout, nor a relation/,
    );
  });
});

// ---------------------------------------------------------------------------
// The store belongs to one run and one specification (REVIEW F8)
// ---------------------------------------------------------------------------

describe('the oracle store is bound to the specification it was authored from', () => {
  const OTHER = 'sha256:0000000000000000000000000000000000000000000000000000000000000002';

  it('refuses cases authored from a different specification', async () => {
    // The defect: the store survived into the next run, so held-out cases written from a previous
    // PRD could execute against a new objective and report a clean pass over nothing — the one
    // gate whose entire value is independence, quietly judging something else.
    const meeseeksDir = path.join(makeTempDir(), '.meeseeks');
    writeOracle(meeseeksDir, [aCase()], { specification: SPEC });
    assert.throws(() => readOracle(meeseeksDir, { specification: OTHER }), /authored from specification/);
  });

  it('refuses a store that records no specification at all', async () => {
    // Every store written before 0.171.0. Nothing can attribute it, so nothing may reuse it.
    const meeseeksDir = path.join(makeTempDir(), '.meeseeks');
    mkdirSync(meeseeksDir, { recursive: true });
    writeFileSync(path.join(meeseeksDir, 'oracle.json'), JSON.stringify({ version: 1, cases: [aCase()] }), 'utf8');
    assert.throws(() => readOracle(meeseeksDir, { specification: SPEC }), /records no specification/);
  });

  it('refuses to read when the caller names no specification', async () => {
    const meeseeksDir = path.join(makeTempDir(), '.meeseeks');
    writeOracle(meeseeksDir, [aCase()], { specification: SPEC });
    assert.throws(() => readOracle(meeseeksDir, { specification: '' }), /which specification is current/);
  });

  it('refuses to write a store it cannot attribute', async () => {
    const meeseeksDir = path.join(makeTempDir(), '.meeseeks');
    assert.throws(() => writeOracle(meeseeksDir, [aCase()], { specification: '' }), /no specification identity/);
  });

  // The benign neighbour: the matching case must still read, or the gate is unusable.
  it('reads its own cases back when the specification matches', async () => {
    const meeseeksDir = path.join(makeTempDir(), '.meeseeks');
    writeOracle(meeseeksDir, [aCase()], { specification: SPEC });
    assert.equal(readOracle(meeseeksDir, { specification: SPEC }).length, 1);
  });

  it('answers oracleMatchesSpecification for every reason a store is unusable', async () => {
    const meeseeksDir = path.join(makeTempDir(), '.meeseeks');
    assert.equal(oracleMatchesSpecification(meeseeksDir, SPEC), false, 'an absent store matched');
    writeOracle(meeseeksDir, [aCase()], { specification: SPEC });
    assert.equal(oracleMatchesSpecification(meeseeksDir, SPEC), true);
    assert.equal(oracleMatchesSpecification(meeseeksDir, OTHER), false, 'a foreign store matched');
    writeFileSync(path.join(meeseeksDir, 'oracle.json'), '{not json', 'utf8');
    assert.equal(oracleMatchesSpecification(meeseeksDir, SPEC), false, 'a corrupt store matched');
  });

  it('runs no case when the store belongs to another specification', async () => {
    // Through the gate rather than the reader, because a failed read that still executed cases
    // would be the same defect one layer down.
    const meeseeksDir = path.join(makeTempDir(), '.meeseeks');
    writeOracle(meeseeksDir, [aCase()], { specification: SPEC });
    let invocations = 0;
    const result = await runOracle({
      meeseeksDir,
      root: '/repo',
      command: ['node', 'bin.js'],
      specification: OTHER,
      run: () => {
        invocations += 1;
        return { ok: true, status: 0, stdout: '', stderr: '' };
      },
    });
    assert.equal(result.ok, false);
    assert.equal(invocations, 0);
  });
});

describe('the store is written atomically and archived with its run', () => {
  it('leaves no temporary file behind', async () => {
    const meeseeksDir = path.join(makeTempDir(), '.meeseeks');
    writeOracle(meeseeksDir, [aCase()], { specification: SPEC });
    assert.equal(existsSync(path.join(meeseeksDir, 'oracle.json.tmp')), false);
  });

  it('never accepts a half-written temporary as the store', async () => {
    // A kill before the rename leaves the old complete store, or none — never partial JSON whose
    // mere existence stops the driver re-authoring, which is what the direct write allowed.
    const meeseeksDir = path.join(makeTempDir(), '.meeseeks');
    writeOracle(meeseeksDir, [aCase()], { specification: SPEC });
    writeFileSync(path.join(meeseeksDir, 'oracle.json.tmp'), '{"version":2,"cases":[', 'utf8');
    assert.equal(readOracle(meeseeksDir, { specification: SPEC }).length, 1);
  });

  it('is archived with the run that authored it, so the next run finds nothing to reuse', async () => {
    const meeseeksDir = path.join(makeTempDir(), '.meeseeks');
    writeOracle(meeseeksDir, [aCase()], { specification: SPEC });
    const archived = archivePreviousRun(meeseeksDir);
    assert.notEqual(archived, null, 'the store was not archived at all');
    assert.equal(existsSync(path.join(meeseeksDir, 'oracle.json')), false, 'the store survived into the next run');
    assert.equal(existsSync(path.join(String(archived), 'oracle.json')), true, 'the previous run lost its store');
  });

  it('is ignored by the stanza the driver writes, so `git add -A` cannot stage it', async () => {
    // Tracked, the target's own history would carry the cases the builder is never shown.
    const stanza = String(meeseeksIgnoreUpdate(''));
    assert.equal(stanza.includes('.meeseeks/oracle.json'), true, stanza);
    assert.equal(stanza.includes('.meeseeks/oracle-scratch/'), true, stanza);
  });
});
