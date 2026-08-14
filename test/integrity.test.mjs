/**
 * Gate integrity (DESIGN.md §4).
 *
 * Every deny case is paired with a benign neighbour. A gate that fails everything is not
 * passing, and this one lives closest to the line between "the builder cheated" and "the
 * builder used a tool I have not heard of" — the second must never be punished.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  GATE_SCRIPTS,
  blankComments,
  inspectIntegrity,
  integrityGate,
  isNoOpScript,
  looseTsconfigs,
  nocheckedFiles,
  readGateScripts,
  truthinessAssertions,
  weakAssertions,
} from '../scripts/integrity.mjs';

/**
 * @param {{ pkg?: unknown, files?: Record<string, string> }} [contents]
 * @returns {string} a throwaway repository root
 */
function repo(contents = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-integrity-'));
  if (contents.pkg !== undefined) {
    const body = typeof contents.pkg === 'string' ? contents.pkg : JSON.stringify(contents.pkg, null, 2);
    writeFileSync(path.join(dir, 'package.json'), body, 'utf8');
  }
  for (const [name, body] of Object.entries(contents.files ?? {})) {
    const full = path.join(dir, name);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body, 'utf8');
  }
  return dir;
}

describe('isNoOpScript', () => {
  const noops = ['true', ' true ', ':', 'exit 0', '', '   ', 'echo "no lint needed"', 'echo skipping && true'];
  for (const body of noops) {
    it(`treats ${JSON.stringify(body)} as running nothing`, () => {
      assert.equal(isNoOpScript(body), true);
    });
  }

  const real = [
    'eslint .',
    'tsc -p jsconfig.json',
    'vitest run',
    'npm run build:app && npm run build:worker',
    // Tools this module has never heard of must pass. An allowlist would fail a correct
    // repository here, and a false gate failure costs a whole iteration.
    'oxlint --deny-warnings src/',
    'quicklint-9000 --strict',
    'echo building && webpack',
  ];
  for (const body of real) {
    it(`treats ${JSON.stringify(body)} as real work`, () => {
      assert.equal(isNoOpScript(body), false);
    });
  }
});

describe('readGateScripts', () => {
  it('returns nothing for a repository with no package.json yet', () => {
    // A greenfield first iteration. The `lint` and `types` command gates already fail here;
    // this module does not need to invent a second failure for the same fact.
    assert.deepStrictEqual(readGateScripts(repo()), {});
  });

  it('reads the script bodies', () => {
    const dir = repo({ pkg: { scripts: { lint: 'eslint .', test: 'vitest run' } } });
    assert.deepStrictEqual(readGateScripts(dir), { lint: 'eslint .', test: 'vitest run' });
  });

  it('throws on a package.json that will not parse, rather than reporting no scripts', () => {
    assert.throws(() => readGateScripts(repo({ pkg: '{ "scripts": ' })));
  });
});

describe('looseTsconfigs', () => {
  it('names a tsconfig that turns strict off', () => {
    const dir = repo({ files: { 'tsconfig.json': JSON.stringify({ compilerOptions: { strict: false } }) } });
    assert.deepStrictEqual(looseTsconfigs(dir), ['tsconfig.json']);
  });

  it('allows strict true, and allows strict being absent', () => {
    // Absent may be inherited through `extends`. Only an explicit false is evidence of a
    // human - or an agent - reaching in and turning it off.
    const strict = repo({ files: { 'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true } }) } });
    const inherited = repo({ files: { 'tsconfig.json': JSON.stringify({ extends: './base.json' }) } });
    assert.deepStrictEqual(looseTsconfigs(strict), []);
    assert.deepStrictEqual(looseTsconfigs(inherited), []);
  });

  it('catches a variant config, not only the default name', () => {
    const dir = repo({
      files: { 'tsconfig.build.json': JSON.stringify({ compilerOptions: { strict: false } }) },
    });
    assert.deepStrictEqual(looseTsconfigs(dir), ['tsconfig.build.json']);
  });
});

describe('nocheckedFiles', () => {
  it('finds a whole-file type suppression', () => {
    const dir = repo({ files: { 'src/api.ts': '// @ts-nocheck\nexport const x = 1;\n' } });
    assert.deepStrictEqual(nocheckedFiles(dir), [path.join('src', 'api.ts')]);
  });

  it('leaves a targeted suppression alone', () => {
    // A targeted expect-error directive is a narrow, documented claim about a single line,
    // and it fails loudly when it stops being true. A whole-file nocheck never can.
    const dir = repo({ files: { 'src/api.ts': '// @ts-expect-error narrow\nexport const x = 1;\n' } });
    assert.deepStrictEqual(nocheckedFiles(dir), []);
  });

  it('does not walk into node_modules', () => {
    const dir = repo({ files: { 'node_modules/dep/index.js': '// @ts-nocheck\n' } });
    assert.deepStrictEqual(nocheckedFiles(dir), []);
  });

  it('does not walk into the mutation runner’s sandbox', () => {
    // Dogfood run 3, iteration 2. The mutation gate crashed and left `.stryker-tmp` behind;
    // Stryker's instrumenter writes `@ts-nocheck` into every file it copies there. This gate is
    // evaluated after the conditional second pass, so it walked the sandbox and reported 22
    // files as suppressed - none of them in the real tree, and none of them fixable. One gate
    // failing on another gate's debris.
    const dir = repo({
      files: {
        '.stryker-tmp/sandbox-n3XB6D/src/config.js': '// @ts-nocheck\nexport const x = 1;\n',
        '.stryker-tmp/sandbox-n3XB6D/tests/pdf.unit.test.js': '// @ts-nocheck\n',
      },
    });
    assert.deepStrictEqual(nocheckedFiles(dir), []);
  });

  it('still reports a suppression in the real tree beside a sandbox', () => {
    // The benign neighbour, and the one that matters: skipping a directory is one keystroke away
    // from skipping the check. A builder that really does disable type checking on its own source
    // must still be caught while the sandbox is being ignored.
    const dir = repo({
      files: {
        '.stryker-tmp/sandbox-n3XB6D/src/config.js': '// @ts-nocheck\n',
        'src/config.js': '// @ts-nocheck\nexport const x = 1;\n',
      },
    });
    assert.deepStrictEqual(nocheckedFiles(dir), [path.join('src', 'config.js')]);
  });
});

describe('inspectIntegrity', () => {
  it('passes a repository whose gates all do work', () => {
    const dir = repo({
      pkg: { scripts: { build: 'tsc', lint: 'eslint .', typecheck: 'tsc --noEmit', test: 'vitest run' } },
      files: { 'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true } }) },
    });
    assert.deepStrictEqual(inspectIntegrity(dir), { ok: true, findings: [] });
  });

  it('fails the exact cheat this gate exists for', () => {
    // `npm run lint` exits 0 forever and the lint gate never notices, because the builder
    // writes what `lint` means.
    const dir = repo({ pkg: { scripts: { lint: 'true' } } });
    const report = inspectIntegrity(dir);
    assert.equal(report.ok, false);
    assert.deepStrictEqual(report.findings, ['npm script "lint" runs nothing: "true"']);
  });

  it('reports every weakening it finds, not merely the first', () => {
    const dir = repo({
      pkg: { scripts: { lint: 'true', typecheck: 'echo ok' } },
      files: {
        'tsconfig.json': JSON.stringify({ compilerOptions: { strict: false } }),
        'src/a.ts': '// @ts-nocheck\n',
      },
    });
    const report = inspectIntegrity(dir);
    assert.equal(report.ok, false);
    assert.equal(report.findings.length, 4, report.findings.join(' | '));
  });

  it('ignores a non-gate script, which the repository may define as it likes', () => {
    const dir = repo({ pkg: { scripts: { lint: 'eslint .', prepublish: 'true', format: 'echo nope' } } });
    assert.deepStrictEqual(inspectIntegrity(dir), { ok: true, findings: [] });
  });

  it('fails rather than passes when package.json cannot be parsed', () => {
    // Nothing defaults to pass. Missing evidence is a failure, not an absence of findings.
    const report = inspectIntegrity(repo({ pkg: '{ oops' }));
    assert.equal(report.ok, false);
    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0].startsWith('package.json could not be parsed'), true);
  });

  it('covers every gate-invoking script', () => {
    for (const name of GATE_SCRIPTS) {
      const report = inspectIntegrity(repo({ pkg: { scripts: { [name]: 'true' } } }));
      assert.equal(report.ok, false, `${name} may be stubbed without the gate noticing`);
    }
  });
});

describe('weakAssertions', () => {
  // The DoD's most load-bearing claim is "tests assert real values, not truthiness", and
  // until now the only thing enforcing it was a reviewer reading the tests — an LLM
  // judgement costing a full iteration each time it fired. This is the deterministic half.

  const denied = [
    ["expect(user.role).toBeTruthy();", 'toBeTruthy()'],
    ["expect(x).toBeFalsy();", 'toBeFalsy()'],
    ["expect(result).toBeDefined();", 'toBeDefined()'],
    ["expect(found).not.toBeNull();", 'not.toBeNull()'],
    ["expect(found).not.toBeUndefined();", 'not.toBeUndefined()'],
    ["expect( ids ).toBeTruthy(  );", 'toBeTruthy(  )'],
  ];
  for (const [source, snippet] of denied) {
    it(`flags ${snippet}`, () => {
      assert.deepEqual(weakAssertions(source), [{ line: 1, snippet }]);
    });
  }

  it('flags a single-argument assert and assert.ok', () => {
    assert.deepEqual(weakAssertions('assert(user.role);'), [{ line: 1, snippet: 'assert(user.role)' }]);
    assert.deepEqual(weakAssertions('assert.ok(found);'), [{ line: 1, snippet: 'assert.ok(found)' }]);
  });

  it('reads a nested call as one argument rather than giving up on it', () => {
    // `assert(list.includes(x))` is the common real shape. A regex that stopped at the first
    // ")" would miss it, which is the difference between a check that works and one that
    // only fires on the examples in its own documentation.
    assert.deepEqual(weakAssertions('assert(list.includes(x));'), [
      { line: 1, snippet: 'assert(list.includes(x))' },
    ]);
  });

  it('reports the line each one is on', () => {
    const source = 'const a = 1;\nexpect(a).toBe(1);\n\nexpect(a).toBeTruthy();\n';
    assert.deepEqual(weakAssertions(source), [{ line: 4, snippet: 'toBeTruthy()' }]);
  });

  it('sorts by line, so a report reads in file order', () => {
    const source = 'expect(b).toBeDefined();\nassert(a);\n';
    assert.deepEqual(
      weakAssertions(source).map((weak) => weak.line),
      [1, 2],
    );
  });

  const allowed = [
    ["expect(user.role).toBe('admin');", 'the matcher that names the expected value'],
    ['expect(ids).toEqual(new Set([1, 2]));', 'a deep equality on a real value'],
    ["assert.equal(user.role, 'admin');", 'assert.equal, which carries an expectation'],
    ['assert.deepEqual(ids, [1, 2]);', 'assert.deepEqual'],
    ["assert(a, 'a must be set');", 'a two-argument assert, which the item deliberately excludes'],
    ['await expect(page.locator(".x")).toBeVisible();', 'a Playwright matcher this gate never heard of'],
    ['expect(x).toHaveLength(3);', 'a matcher outside the list'],
    ['myassert(x);', 'a helper whose name merely ends in assert'],
    ['assert.match(text, /ok/);', 'assert.match'],
    ['assert();', 'an argument-less assert, which asserts nothing about anything'],
  ];
  for (const [source, what] of allowed) {
    it(`leaves alone ${what}`, () => {
      assert.deepEqual(weakAssertions(source), []);
    });
  }

  it('ignores a comment that merely mentions the forbidden matcher', () => {
    // The most irritating possible false positive: correct code, failed for describing the
    // rule it obeys. Every file explaining this gate would fail this gate.
    const source = '// never write expect(x).toBeTruthy() here\nexpect(x).toBe(1);\n';
    assert.deepEqual(weakAssertions(source), []);
  });

  it('ignores a block comment mentioning it, and still counts lines correctly', () => {
    const source = '/**\n * Not toBeTruthy().\n */\nexpect(x).toBeDefined();\n';
    assert.deepEqual(weakAssertions(source), [{ line: 4, snippet: 'toBeDefined()' }]);
  });
});

describe('blankComments', () => {
  it('keeps every newline, so line numbers survive', () => {
    const source = '/* a\nb\nc */\nx';
    assert.equal(blankComments(source).split('\n').length, source.split('\n').length);
  });

  it('does not eat a url inside a string, which is not a comment', () => {
    assert.equal(blankComments("const u = 'https://example.com/x';").includes('example.com'), true);
  });
});

describe('truthinessAssertions', () => {
  it('finds them in a *.test.js file and reports path, line and snippet', () => {
    const dir = repo({ files: { 'src/app.test.js': 'expect(a).toBeTruthy();\n' } });
    assert.deepEqual(truthinessAssertions(dir), ['src/app.test.js:1 - toBeTruthy()']);
  });

  it('finds them in a test directory whatever the file is called', () => {
    const dir = repo({ files: { 'test/helpers.mjs': 'assert(value);\n' } });
    assert.deepEqual(truthinessAssertions(dir), ['test/helpers.mjs:1 - assert(value)']);
  });

  it('leaves application source alone', () => {
    // `assert(x)` in application code is a runtime invariant check and none of this gate's
    // business. Flagging it would fail a correct repository for defensive programming.
    const dir = repo({ files: { 'src/app.js': 'assert(config);\nexpect(x).toBeTruthy();\n' } });
    assert.deepEqual(truthinessAssertions(dir), []);
  });

  it('does not walk node_modules', () => {
    const dir = repo({ files: { 'node_modules/dep/a.test.js': 'expect(a).toBeTruthy();\n' } });
    assert.deepEqual(truthinessAssertions(dir), []);
  });

  it('does not walk the mutation runner’s sandbox, but still reads the real test beside it', () => {
    // Both walks share SKIP_DIRS, so the sandbox exclusion applies here too - and so does the
    // obligation to prove the check itself survives it. The sandbox copy is a duplicate of the
    // real file, so without the skip this gate reports the same weak assertion twice.
    const dir = repo({
      files: {
        '.stryker-tmp/sandbox-n3XB6D/tests/a.test.js': 'expect(a).toBeTruthy();\n',
        'tests/a.test.js': 'expect(a).toBeTruthy();\n',
      },
    });
    assert.deepEqual(truthinessAssertions(dir), ['tests/a.test.js:1 - toBeTruthy()']);
  });

  it('says nothing about a repository with no tests yet', () => {
    // Iteration 1 of a greenfield build. Reporting a finding here would fail the run for the
    // absence of something nobody has written, which the ratchet already handles by refusing
    // to advance on an empty id set.
    assert.deepEqual(truthinessAssertions(repo()), []);
  });
});

describe('integrityGate', () => {
  it('fails a repository whose tests only prove something was returned', () => {
    const result = integrityGate(repo({ files: { 'a.test.js': 'expect(user.role).toBeTruthy();\n' } }));
    assert.equal(result.ok, false);
    assert.equal(result.detail, 'a.test.js:1 - toBeTruthy() asserts existence, not a value');
  });

  it('passes the same repository once the assertion names a value', () => {
    const result = integrityGate(repo({ files: { 'a.test.js': "expect(user.role).toBe('admin');\n" } }));
    assert.equal(result.ok, true);
  });

  it('reports a named, failing gate with its evidence', () => {
    const result = integrityGate(repo({ pkg: { scripts: { test: ':' } } }));
    assert.equal(result.name, 'gate-integrity');
    assert.equal(result.ok, false);
    assert.equal(result.status, 1);
    assert.equal(result.detail, 'npm script "test" runs nothing: ":"');
  });

  it('passes with status 0 on an honest repository', () => {
    const result = integrityGate(repo({ pkg: { scripts: { lint: 'eslint .' } } }));
    assert.deepStrictEqual(
      { name: result.name, ok: result.ok, status: result.status },
      { name: 'gate-integrity', ok: true, status: 0 },
    );
  });
});

describe('truthinessAssertions distinguishes a class of values from a single value', () => {
  /** @param {string} source @returns {string[]} */
  const flagged = (source) => truthinessAssertions(repo({ files: { 'src/a.test.js': `${source}\n` } }));

  /** @type {string[]} */
  const weak = [
    'expect(x).toBeTruthy();',
    'expect(x).toBeFalsy();',
    'expect(x).toBeDefined();',
    'expect(x).not.toBeUndefined();',
    'expect(x).not.toBeNull();',
    'expect(x).not.toBeTruthy();',
  ];
  for (const source of weak) {
    it(`flags ${source.trim()}, which accepts a class of values`, () => {
      assert.equal(flagged(source).length, 1, source);
    });
  }

  /** @type {string[]} */
  const precise = [
    'expect(store.get("missing")).toBeUndefined();',
    'expect(node.parent).toBeNull();',
    'expect(x).not.toBeDefined();',
    'expect(x).toBe(undefined);',
  ];
  for (const source of precise) {
    it(`leaves ${source.trim()} alone, because it names exactly one value`, () => {
      // Measured in case I: `toBeUndefined()` was flagged on a note store's lookup of a missing
      // key, which is the idiomatic and correct assertion for that behaviour. `toBe(undefined)`
      // is not an improvement on it, it is the same assertion spelled longer — and a gate wrong
      // in the failing direction reads as the project's fault.
      assert.deepEqual(flagged(source), [], source);
    });
  }

  it('flips its verdict with polarity, which is the whole correction', () => {
    assert.equal(flagged('expect(x).toBeDefined();').length, 1);
    assert.deepEqual(flagged('expect(x).not.toBeDefined();'), []);
    assert.deepEqual(flagged('expect(x).toBeUndefined();'), []);
    assert.equal(flagged('expect(x).not.toBeUndefined();').length, 1);
  });
});
