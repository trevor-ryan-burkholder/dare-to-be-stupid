/**
 * Tests for the Build Brief (DESIGN.md §8.1).
 *
 * The brief is the only thing a builder is told, and every builder is a fresh process. So
 * the two properties worth defending are that it is *complete* — the objective, the reason
 * for it, and the constraints all survive rendering — and that it is *deterministic*, since
 * a task that varies between identical states makes a run impossible to reason about
 * afterwards.
 *
 * The third property is quieter and matters as much: nothing is dropped silently. A brief
 * showing ten of forty regressions reads exactly like a brief with ten regressions.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { isProtectedStatePath } from '../hooks/guard.mjs';
import { briefFileName, compileBrief, writeBrief } from '../scripts/brief.mjs';

/** @type {string[]} */
const temporaryDirs = [];

/** @returns {string} */
function makeTempDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dare-brief-'));
  temporaryDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** @type {import('../scripts/brief.mjs').Objective} */
const GATES_OBJECTIVE = {
  kind: 'gates',
  headline: 'Make these gates pass. Nothing else this iteration.',
  reason: '2 gate(s) failed on iteration 4',
  gateFailures: [
    { name: 'lint', detail: 'no-unused-vars in src/app.ts' },
    { name: 'types', detail: 'TS2339' },
  ],
};

describe('compileBrief', () => {
  it('states the objective and why it is the objective', () => {
    const brief = compileBrief({ iteration: 4, chaos: 1, objective: GATES_OBJECTIVE });
    assert.equal(brief.includes('Make these gates pass'), true);
    assert.equal(brief.includes('**Why this and not something else:** 2 gate(s) failed on iteration 4'), true);
  });

  it('names every failing gate with its detail', () => {
    const brief = compileBrief({ iteration: 4, chaos: 1, objective: GATES_OBJECTIVE });
    assert.equal(brief.includes('`lint`: no-unused-vars in src/app.ts'), true);
    assert.equal(brief.includes('`types`: TS2339'), true);
  });

  it('puts the iteration number in the heading', () => {
    const brief = compileBrief({ iteration: 7, chaos: 1, objective: GATES_OBJECTIVE });
    assert.equal(brief.startsWith('# Build brief - iteration 7'), true);
  });

  it('always carries the scope discipline and the protected-state constraint', () => {
    const brief = compileBrief({ iteration: 1, chaos: 1, objective: GATES_OBJECTIVE });
    assert.equal(brief.includes('Do not touch code unrelated to the objective'), true);
    assert.equal(brief.includes('Do not write anything under `.dare/`, at any depth'), true);
    assert.equal(brief.includes('Do not declare the work finished'), true);
  });

  it('states the protected-state rule positionally, naming no file at all', () => {
    // Enumeration was the enforcement-layer bug fixed in 0.10.0: every new artifact
    // defaulted to writable until someone remembered to add it to a list. A brief that
    // names three files is the same defect one layer up — the builder is told a weaker
    // rule than the hook enforces and spends an iteration discovering the difference.
    const brief = compileBrief({ iteration: 1, chaos: 1, objective: GATES_OBJECTIVE });
    assert.deepEqual(brief.match(/`\.dare\/[\w-]+\.json`/g), null);
  });

  it('covers an artifact it does not name, which the guard denies by position', () => {
    // The tie the wording exists to hold: `red-evidence.json` appears nowhere in the brief
    // and is refused anyway, so the documented rule and the enforced rule are one rule.
    const brief = compileBrief({ iteration: 1, chaos: 1, objective: GATES_OBJECTIVE });
    assert.equal(brief.includes('red-evidence.json'), false);
    assert.equal(isProtectedStatePath('.dare/red-evidence.json', '/repo'), true);
    assert.equal(isProtectedStatePath('.dare/invented-tomorrow.json', '/repo'), true);
    assert.equal(isProtectedStatePath('.dare-notes/state.json', '/repo'), false);
  });

  it('renders each chaos level as a different scope budget', () => {
    const at = (/** @type {number} */ chaos) => compileBrief({ iteration: 1, chaos, objective: GATES_OBJECTIVE });
    assert.equal(at(1).includes('chaos 1 - surgical'), true);
    // The brief is what the builder reads closest to the work, so chaos 1 carries the whole
    // rule here rather than a summary of it.
    assert.equal(at(1).includes('Every changed line must trace'), true);
    assert.equal(at(2).includes('Every changed line must trace'), false, 'chaos 2 became chaos 1');
    assert.equal(at(2).includes('chaos 2 - normal'), true);
    assert.equal(at(3).includes('chaos 3 - feral'), true);
  });

  it('says regressions outrank the rest of the brief, and sorts them', () => {
    const brief = compileBrief({
      iteration: 2,
      chaos: 3,
      objective: {
        kind: 'regression',
        headline: 'Restore the tests listed below. Change nothing else.',
        reason: 'the ratchet is monotonic',
        regressions: ['test/b.test.js::two', 'test/a.test.js::one'],
      },
    });
    assert.equal(brief.includes('outrank everything else in this brief'), true);
    assert.equal(brief.indexOf('test/a.test.js::one') < brief.indexOf('test/b.test.js::two'), true);
  });

  it('tells the builder what the project is, in the order it was given', () => {
    const brief = compileBrief({
      iteration: 1,
      chaos: 1,
      objective: GATES_OBJECTIVE,
      capabilities: ['api', 'persistent-storage', 'authentication'],
    });
    assert.equal(brief.includes('## What this project is'), true);
    assert.equal(brief.indexOf('- api') < brief.indexOf('- persistent-storage'), true);
    assert.equal(brief.indexOf('- persistent-storage') < brief.indexOf('- authentication'), true);
  });

  it('omits the section entirely rather than printing an empty heading', () => {
    const brief = compileBrief({ iteration: 1, chaos: 1, objective: GATES_OBJECTIVE, capabilities: [] });
    assert.equal(brief.includes('What this project is'), false);
  });

  it('is byte-identical for identical input', () => {
    const input = /** @type {import('../scripts/brief.mjs').BriefInput} */ ({
      iteration: 3,
      chaos: 2,
      objective: GATES_OBJECTIVE,
      protectedTests: ['test/b.test.js::two', 'test/a.test.js::one'],
      lessons: [{ id: 'lesson-0002', trigger: ['x'], scope: ['build'], lesson: 'a' }],
      history: [{ file: 'src/a.ts', commits: [{ sha: 'abc1234', subject: 'add a' }], blame: [] }],
      gates: ['lint: npm run lint'],
    });
    assert.equal(compileBrief(input), compileBrief(input));
  });

  it('does not depend on the order sets happened to arrive in', () => {
    /** @param {string[]} tests */
    const withTests = (tests) =>
      compileBrief({ iteration: 3, chaos: 1, objective: GATES_OBJECTIVE, protectedTests: tests });
    assert.equal(withTests(['b::2', 'a::1']), withTests(['a::1', 'b::2']));
  });

  it('says how many protected tests it did not list', () => {
    const many = Array.from({ length: 25 }, (_, index) => `test/a.test.js::case ${String(index).padStart(2, '0')}`);
    const brief = compileBrief({ iteration: 1, chaos: 1, objective: GATES_OBJECTIVE, protectedTests: many });
    assert.equal(brief.includes('25 test id(s) have passed'), true);
    assert.equal(brief.includes('...and 15 more held by the ratchet.'), true);
  });

  it('says how many findings it did not list', () => {
    const findings = Array.from({ length: 26 }, (_, index) => `PRD-1.${index}: missing`);
    const brief = compileBrief({
      iteration: 1,
      chaos: 1,
      objective: { kind: 'review', headline: 'Fix these', reason: 'the audit', findings },
    });
    assert.equal(brief.includes('...and 6 more, not shown here.'), true);
  });

  it('marks advisory findings as not deciding whether the run ships', () => {
    const brief = compileBrief({
      iteration: 5,
      chaos: 1,
      objective: {
        kind: 'review',
        headline: 'Fix these',
        reason: 'the audit',
        findings: ['PRD-1.1: missing'],
        advisories: [
          {
            id: 'advisory-1',
            severity: 'minor',
            confidence: 0.8,
            evidence: 'src/foo.ts:91',
            detail: 'doing two things',
            repairHint: 'split it',
          },
        ],
      },
    });
    assert.equal(brief.includes('Suggestions, not requirements'), true);
    assert.equal(brief.includes('do not decide whether this run ships'), true);
    assert.equal(brief.includes('[minor] src/foo.ts:91 - doing two things Suggested repair: split it'), true);
  });

  it('omits every optional section when there is nothing to put in it', () => {
    const brief = compileBrief({ iteration: 1, chaos: 1, objective: GATES_OBJECTIVE });
    for (const heading of ['## Protected tests', '## Lessons', '## History', '### Advisory findings']) {
      assert.equal(brief.includes(heading), false, `empty section rendered anyway: ${heading}`);
    }
  });

  it('tells a race candidate that it is one, and that the gates decide', () => {
    const brief = compileBrief({
      iteration: 9,
      chaos: 2,
      objective: GATES_OBJECTIVE,
      raceCandidate: { index: 2, of: 3 },
    });
    assert.equal(brief.includes('You are candidate 2 of 3'), true);
    assert.equal(brief.includes('gates decide between you'), true);
  });

  it('carries lessons with their scope, and history with its commits', () => {
    const brief = compileBrief({
      iteration: 1,
      chaos: 1,
      objective: GATES_OBJECTIVE,
      lessons: [{ id: 'lesson-0007', trigger: ['playwright'], scope: ['e2e'], lesson: 'wait for healthy first' }],
      history: [
        {
          file: 'src/auth.ts',
          commits: [{ sha: 'abc1234', subject: 'add guard' }],
          blame: ['line 41 last changed in abc1234: add guard'],
        },
      ],
    });
    assert.equal(brief.includes('**lesson-0007** (e2e): wait for healthy first'), true);
    assert.equal(brief.includes('### src/auth.ts'), true);
    assert.equal(brief.includes('- abc1234 add guard'), true);
    assert.equal(brief.includes('line 41 last changed in abc1234'), true);
  });

  it('tells the builder there is no earlier conversation to recall', () => {
    // The invariant the whole module serves: the artifacts are the memory, and a child's
    // context is disposable.
    assert.equal(compileBrief({ iteration: 1, chaos: 1, objective: GATES_OBJECTIVE }).includes('no earlier'), true);
  });
});

describe('writeBrief', () => {
  it('archives one file per iteration, zero-padded', () => {
    const dir = makeTempDir();
    writeBrief(dir, 3, 'three');
    writeBrief(dir, 12, 'twelve');
    assert.deepStrictEqual(readdirSync(path.join(dir, 'briefs')).sort(), ['iter-003.md', 'iter-012.md']);
    assert.equal(readFileSync(path.join(dir, 'briefs', 'iter-003.md'), 'utf8'), 'three');
  });

  it('gives every race candidate its own file, so the losing briefs survive', () => {
    const dir = makeTempDir();
    writeBrief(dir, 4, 'main');
    writeBrief(dir, 4, 'candidate one', 1);
    writeBrief(dir, 4, 'candidate two', 2);
    assert.deepStrictEqual(readdirSync(path.join(dir, 'briefs')).sort(), [
      'iter-004-candidate-01.md',
      'iter-004-candidate-02.md',
      'iter-004.md',
    ]);
  });

  it('names files the same way every time', () => {
    assert.equal(briefFileName(7), 'iter-007.md');
    assert.equal(briefFileName(7, 2), 'iter-007-candidate-02.md');
  });
});

describe('per-toolchain guidance in the brief', () => {
  it('renders the fragment verbatim, letting it own its heading', () => {
    const brief = compileBrief({
      iteration: 1,
      chaos: 1,
      objective: GATES_OBJECTIVE,
      toolchain: { name: 'dotnet', guidance: '## Building this with .NET\n\nAdd it to the solution.' },
    });
    assert.equal(brief.includes('## Building this with .NET'), true);
    assert.equal(brief.includes('Add it to the solution.'), true);
  });

  it('does not add a heading of its own on top of the fragment’s', () => {
    // The first dogfood run produced exactly this in iter-001.md:
    //
    //     ## Building this with node
    //
    //     ## Building this with Node
    //
    // Two headings, one section. No test saw it because both halves were individually
    // correct — the renderer added a heading and the fragment already had one.
    const brief = compileBrief({
      iteration: 1,
      chaos: 1,
      objective: GATES_OBJECTIVE,
      toolchain: { name: 'node', guidance: '## Building this with Node\n\nPick a module system.' },
    });
    assert.equal((brief.match(/^## Building this with /gm) ?? []).length, 1);
  });

  it('says so when there is no fragment, rather than omitting the section', () => {
    // A brief that silently carries guidance for one toolchain and not another reads, to the
    // next person, as a stack that had no idioms worth knowing. Same argument as a skipped
    // gate: the absence has to be visible to be judged.
    const brief = compileBrief({
      iteration: 1,
      chaos: 1,
      objective: GATES_OBJECTIVE,
      toolchain: { name: 'rust', guidance: '' },
    });
    assert.equal(brief.includes('There is no guidance fragment for the rust toolchain'), true);
    assert.equal(brief.includes('a gap in the plugin'), true);
  });

  it('carries no such section at all when no toolchain was supplied', () => {
    const brief = compileBrief({ iteration: 1, chaos: 1, objective: GATES_OBJECTIVE });
    assert.equal(brief.includes('Building this with'), false);
  });

  it('stays deterministic with guidance attached', () => {
    // The brief's load-bearing property: same state, same bytes. A fragment read from disk is
    // the first input to it that lives outside the run's own state, so it is worth asserting.
    const input = /** @type {import('../scripts/brief.mjs').BriefInput} */ ({
      iteration: 3,
      chaos: 2,
      objective: GATES_OBJECTIVE,
      toolchain: { name: 'node', guidance: 'Pick a module system.' },
    });
    assert.equal(compileBrief(input), compileBrief(input));
  });
});
