/**
 * Tests for reviewer-citation resolution (DESIGN.md §4, REVIEW F6).
 *
 * **The defect, reproduced by Codex in one line.** A report citing `does/not/exist.ts:999999`
 * parsed with no problems at all: `parseReviewerReport` returned `verdict: "pass"` and
 * `combinePanel` agreed. The parser checked the *shape* of the citation and nothing checked
 * whether it pointed at anything, so "evidence required" had become "evidence-shaped text
 * required" — the nothing-defaults-to-pass invariant inverted at the one gate the whole
 * architecture exists to protect.
 *
 * Every hostile location below gets a benign neighbour, because refusing everything is not
 * passing: a citation resolver that rejected valid evidence would fail every honest review and be
 * discovered as a stall rather than as a bug.
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { citationPathProblem, resolveCitation, splitCitation } from '../scripts/evidence.mjs';
import { resolveReportEvidence } from '../scripts/driver.mjs';

/** @type {string[]} */
const temporaryDirs = [];

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * A repository with one real source file, one empty-lined file, a directory, and — outside it —
 * a secret the citations will try to reach.
 *
 * @returns {{ root: string, outside: string }}
 */
function makeRepo() {
  const parent = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-evidence-'));
  temporaryDirs.push(parent);
  const root = path.join(parent, 'repo');
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeFileSync(path.join(root, 'src', 'app.ts'), 'const a = 1;\nconst b = 2;\nconst c = 3;\n', 'utf8');
  writeFileSync(path.join(root, 'src', 'gappy.ts'), 'const a = 1;\n\n   \nconst d = 4;\n', 'utf8');
  const outside = path.join(parent, 'outside.ts');
  writeFileSync(outside, 'const secret = 1;\n', 'utf8');
  return { root, outside };
}

describe('splitCitation', () => {
  it('reads a path and a line', () => {
    assert.deepStrictEqual(splitCitation('src/app.ts:12'), { file: 'src/app.ts', line: 12 });
  });

  it('splits on the last colon, so a path containing one still reads the way a person reads it', () => {
    assert.deepStrictEqual(splitCitation('src/odd:name.ts:3'), { file: 'src/odd:name.ts', line: 3 });
  });

  it('refuses a citation with no line', () => {
    assert.equal(splitCitation('src/app.ts'), null);
  });

  it('refuses a line that is not a plain integer', () => {
    assert.equal(splitCitation('src/app.ts:1.5'), null);
    assert.equal(splitCitation('src/app.ts:twelve'), null);
    assert.equal(splitCitation('src/app.ts:-4'), null);
    assert.equal(splitCitation('src/app.ts:'), null);
  });
});

describe('citationPathProblem refuses locations that are not repository-relative', () => {
  it('accepts an ordinary relative path', () => {
    assert.equal(citationPathProblem('src/app.ts'), '');
  });

  it('accepts a Windows-shaped relative path, which contributors on three platforms will produce', () => {
    assert.equal(citationPathProblem('src\\app.ts'), '');
  });

  it('refuses a POSIX absolute path', () => {
    assert.match(citationPathProblem('/etc/passwd'), /absolute/);
  });

  it('refuses a drive-qualified absolute path even when this platform would not call it absolute', () => {
    assert.match(citationPathProblem('C:\\Windows\\system32\\config.ts'), /absolute/);
  });

  it('refuses traversal, whichever separator it is spelled with', () => {
    assert.match(citationPathProblem('../outside.ts'), /traverses/);
    assert.match(citationPathProblem('src/../../outside.ts'), /traverses/);
    assert.match(citationPathProblem('..\\outside.ts'), /traverses/);
  });

  it('refuses an empty path', () => {
    assert.match(citationPathProblem(''), /names no file/);
  });

  // The benign neighbour for traversal: a path segment that merely *starts* with dots is a file.
  it('accepts a dotfile and a path with a dot segment that is not `..`', () => {
    assert.equal(citationPathProblem('.eslintrc.cjs'), '');
    assert.equal(citationPathProblem('src/.internal/app.ts'), '');
  });
});

describe('resolveCitation against a real repository', () => {
  it('resolves a real file and a real line', () => {
    const { root } = makeRepo();
    assert.deepStrictEqual(resolveCitation(root, 'src/app.ts:2'), { ok: true, file: 'src/app.ts', line: 2 });
  });

  it('resolves a Windows-shaped citation to the same place', () => {
    const { root } = makeRepo();
    const resolution = resolveCitation(root, 'src\\app.ts:2');
    assert.equal(resolution.ok, true, resolution.ok === false ? resolution.reason : '');
  });

  it('refuses a file that is not there, which is the reproduction', () => {
    const { root } = makeRepo();
    const resolution = resolveCitation(root, 'does/not/exist.ts:999999');
    assert.equal(resolution.ok, false);
    assert.match(resolution.ok === false ? resolution.reason : '', /no such file/);
  });

  it('refuses a line past the end of the file', () => {
    const { root } = makeRepo();
    const resolution = resolveCitation(root, 'src/app.ts:99');
    assert.equal(resolution.ok, false);
    assert.match(resolution.ok === false ? resolution.reason : '', /past the end/);
  });

  it('refuses line zero', () => {
    const { root } = makeRepo();
    const resolution = resolveCitation(root, 'src/app.ts:0');
    assert.equal(resolution.ok, false);
    assert.match(resolution.ok === false ? resolution.reason : '', /not a line number/);
  });

  it('refuses a blank line, because a plausible number that cites no code is the cheap way to be wrong', () => {
    const { root } = makeRepo();
    for (const line of [2, 3]) {
      const resolution = resolveCitation(root, `src/gappy.ts:${line}`);
      assert.equal(resolution.ok, false, `line ${line} was accepted`);
      assert.match(resolution.ok === false ? resolution.reason : '', /blank/);
    }
    // And the neighbour: the non-blank lines of the same file resolve.
    assert.equal(resolveCitation(root, 'src/gappy.ts:4').ok, true);
  });

  it('refuses a directory standing in for a line of code', () => {
    const { root } = makeRepo();
    const resolution = resolveCitation(root, 'src:1');
    assert.equal(resolution.ok, false);
    assert.match(resolution.ok === false ? resolution.reason : '', /not a regular file|no such file/);
  });

  it('refuses an absolute path even when a file really is there', () => {
    const { root, outside } = makeRepo();
    const resolution = resolveCitation(root, `${outside}:1`);
    assert.equal(resolution.ok, false);
    assert.match(resolution.ok === false ? resolution.reason : '', /absolute|not a `path/);
  });

  it('refuses traversal even when it lands on a real file', () => {
    const { root } = makeRepo();
    const resolution = resolveCitation(root, '../outside.ts:1');
    assert.equal(resolution.ok, false);
    assert.match(resolution.ok === false ? resolution.reason : '', /traverses/);
  });

  // The case no string check can see, and the reason the containment test happens after
  // `realpathSync` rather than before it.
  it('refuses an in-repository symlink that escapes the root', { skip: process.platform === 'win32' }, () => {
    const { root, outside } = makeRepo();
    symlinkSync(outside, path.join(root, 'src', 'shortcut.ts'));
    const resolution = resolveCitation(root, 'src/shortcut.ts:1');
    assert.equal(resolution.ok, false);
    assert.match(resolution.ok === false ? resolution.reason : '', /outside the repository/);
  });

  // The benign neighbour of that one: a symlink that stays inside the repository is ordinary.
  it('accepts an in-repository symlink that stays inside the root', { skip: process.platform === 'win32' }, () => {
    const { root } = makeRepo();
    symlinkSync(path.join(root, 'src', 'app.ts'), path.join(root, 'src', 'alias.ts'));
    assert.equal(resolveCitation(root, 'src/alias.ts:1').ok, true);
  });

  it('refuses when the reviewed root itself cannot be resolved, rather than passing', () => {
    // **The reason has to be asserted**, or a refusal for any other cause satisfies this — the
    // cited file being absent, say, which is a different rule and would leave the root check
    // untested.
    const resolution = resolveCitation(path.join(os.tmpdir(), 'meeseeks-evidence-no-such-root'), 'src/app.ts:1');
    assert.equal(resolution.ok, false);
    assert.match(String(resolution.reason ?? ''), /root/i);
  });
});

describe('resolveReportEvidence is the boundary between a document and a repository', () => {
  /** @param {Partial<import('../scripts/driver.mjs').ReviewerReport>} [overrides] */
  const report = (overrides = {}) => ({
    verdict: /** @type {'pass' | 'fail'} */ ('pass'),
    requirements: [{ id: 'PRD-1.1', status: /** @type {'pass'} */ ('pass'), evidence: 'src/app.ts:1', detail: 'found' }],
    advisories: [],
    problems: [],
    // resolveReportEvidence judges citations against a real tree; it has no view on what a reviewer
    // could not reach. Both fields are supplied so these cases assert citation resolution rather
    // than re-asserting the parser's accountability rules, which have their own tests.
    unverifiable: /** @type {string[]} */ ([]),
    attackAccount:
      'Called the handler directly to bypass the role check, replayed an expired session cookie, ' +
      'and sent a negative quantity to the order endpoint. All three were rejected at the boundary.',
    ...overrides,
  });

  it('carries the accountability fields through, so the block cannot be undone one layer later', () => {
    // This function rebuilds the report against a real tree. It re-judges *citations* and has no
    // view on what a reviewer could not reach, so dropping either field here would silently restore
    // a pass the parser had just blocked — a defect that would look exactly like correct behaviour.
    const { root } = makeRepo();
    const resolved = resolveReportEvidence(
      report({ unverifiable: ['PRD-2.1 asserts behaviour against a service I cannot call'] }),
      { root },
    );
    assert.equal(resolved.verdict, 'fail');
    assert.deepStrictEqual(resolved.unverifiable, ['PRD-2.1 asserts behaviour against a service I cannot call']);
    assert.match(resolved.attackAccount, /^Called the handler directly/);
  });

  it('re-applies the attack-account floor when it rebuilds the verdict', () => {
    // The same hazard in the other field: a report that arrived blocked for a short account must not
    // come back out of this function as a pass just because every citation resolved.
    const { root } = makeRepo();
    const resolved = resolveReportEvidence(report({ attackAccount: 'looked at it' }), { root });
    assert.equal(resolved.verdict, 'fail');
  });

  it('leaves a report whose citations resolve exactly as it was', () => {
    const { root } = makeRepo();
    const resolved = resolveReportEvidence(report(), { root });
    assert.equal(resolved.verdict, 'pass');
    assert.deepStrictEqual(resolved.problems, []);
    assert.equal(resolved.requirements[0].status, 'pass');
  });

  it('flips a pass whose citation does not resolve, and says which one and why', () => {
    const { root } = makeRepo();
    const resolved = resolveReportEvidence(
      report({
        requirements: [
          { id: 'PRD-1.1', status: 'pass', evidence: 'does/not/exist.ts:999999', detail: 'found' },
        ],
      }),
      { root },
    );
    assert.equal(resolved.verdict, 'fail');
    assert.equal(resolved.requirements[0].status, 'fail');
    assert.equal(resolved.problems.length, 1, resolved.problems.join('\n'));
    assert.match(resolved.problems[0], /PRD-1\.1/);
    assert.match(resolved.problems[0], /does\/not\/exist\.ts:999999/);
  });

  it('keeps the citation on the flipped entry, because the failure is about that location', () => {
    const { root } = makeRepo();
    const resolved = resolveReportEvidence(
      report({ requirements: [{ id: 'PRD-1.1', status: 'pass', evidence: 'gone.ts:1', detail: '' }] }),
      { root },
    );
    assert.equal(resolved.requirements[0].evidence, 'gone.ts:1');
  });

  it('does not touch an entry that already failed', () => {
    const { root } = makeRepo();
    const resolved = resolveReportEvidence(
      report({
        verdict: 'fail',
        requirements: [{ id: 'PRD-1.1', status: 'fail', evidence: 'does/not/exist.ts:4', detail: 'missing' }],
      }),
      { root },
    );
    assert.deepStrictEqual(resolved.problems, []);
    assert.equal(resolved.requirements[0].status, 'fail');
  });

  it('preserves problems the parser already found', () => {
    const { root } = makeRepo();
    const resolved = resolveReportEvidence(report({ problems: ['something the parser said'] }), { root });
    assert.deepStrictEqual(resolved.problems, ['something the parser said']);
  });

  it('disarms an actionable advisory whose location does not resolve', () => {
    // Pointed the other way from a compliance entry: an advisory cannot flip anything to pass, so
    // the harm is sending the builder to a file that is not there.
    const { root } = makeRepo();
    const resolved = resolveReportEvidence(
      report({
        advisories: [
          {
            id: 'advisory-1',
            status: 'fail',
            severity: 'major',
            confidence: 0.9,
            evidence: 'imaginary/thing.ts:3',
            detail: 'd',
            repairHint: 'h',
            actionable: true,
          },
        ],
      }),
      { root },
    );
    assert.equal(resolved.advisories[0].actionable, false);
    assert.match(resolved.problems[0], /advisory-1/);
    // Recorded rather than deleted: the finding still exists, it just cannot be acted on.
    assert.equal(resolved.advisories.length, 1);
  });

  it('leaves an actionable advisory whose location resolves alone', () => {
    const { root } = makeRepo();
    const resolved = resolveReportEvidence(
      report({
        advisories: [
          {
            id: 'advisory-1',
            status: 'fail',
            severity: 'major',
            confidence: 0.9,
            evidence: 'src/app.ts:3',
            detail: 'd',
            repairHint: 'h',
            actionable: true,
          },
        ],
      }),
      { root },
    );
    assert.equal(resolved.advisories[0].actionable, true);
    assert.deepStrictEqual(resolved.problems, []);
  });

  it('does not resolve a non-actionable advisory, which is already only a note', () => {
    const { root } = makeRepo();
    const resolved = resolveReportEvidence(
      report({
        advisories: [
          {
            id: 'advisory-1',
            status: 'fail',
            severity: 'trivial',
            confidence: 0.2,
            evidence: 'imaginary/thing.ts:3',
            detail: 'd',
            repairHint: 'h',
            actionable: false,
          },
        ],
      }),
      { root },
    );
    assert.deepStrictEqual(resolved.problems, []);
  });
});
