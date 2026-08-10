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
  inspectIntegrity,
  integrityGate,
  isNoOpScript,
  looseTsconfigs,
  nocheckedFiles,
  readGateScripts,
} from '../scripts/integrity.mjs';

/**
 * @param {{ pkg?: unknown, files?: Record<string, string> }} [contents]
 * @returns {string} a throwaway repository root
 */
function repo(contents = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dare-integrity-'));
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

describe('integrityGate', () => {
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
