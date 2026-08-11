/**
 * Tests for the toolchain registry (DESIGN.md §3.8).
 *
 * Two jobs. First, prove the extraction was behaviour-neutral: the Node adapter must produce
 * the exact commands that were hard-coded in `driver.mjs` before it existed, so the argv is
 * asserted in full rather than by name.
 *
 * Second, and more durably, hold the contract that lets a *second* toolchain be added safely
 * — that an unimplemented operation throws rather than vanishing, that a declined one carries
 * a reason, and that a CI pattern matches the command its own operation produces. That last
 * one is the structural fix for the bug this item was written to close: CI inspection used to
 * accept `node --test` while the unit gate ran `npx vitest run`, and nothing could notice.
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import {
  GATE_OPERATIONS,
  TOOLCHAINS,
  ToolchainError,
  detectToolchain,
  gatesFor,
  resolveToolchain,
} from '../scripts/toolchains/index.mjs';
import { nodeToolchain } from '../scripts/toolchains/node.mjs';
import { command, notApplicable } from '../scripts/toolchains/shared.mjs';

/** @type {string[]} */
const temporaryDirs = [];

/**
 * @param {Record<string, string>} [files]
 * @returns {string}
 */
function makeProject(files = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dare-toolchains-'));
  temporaryDirs.push(dir);
  for (const [relative, contents] of Object.entries(files)) {
    const full = path.join(dir, ...relative.split('/'));
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, contents, 'utf8');
  }
  return dir;
}

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

const CONTEXT = { root: '/repo', dareDir: path.join('/repo', '.dare') };

describe('the operation vocabulary', () => {
  it('gates exactly the operations Phase 3 runs, in order', () => {
    assert.deepEqual(GATE_OPERATIONS, ['build', 'lint', 'types', 'unit', 'e2e', 'security-audit']);
  });

  it('does not gate restore, which would reinstall dependencies every iteration', () => {
    assert.equal(GATE_OPERATIONS.includes(/** @type {never} */ ('restore')), false);
    // It is still part of the contract: a toolchain that cannot express it cannot describe
    // .NET or Rust at all.
    assert.equal(typeof nodeToolchain.operations.restore, 'function');
  });
});

describe('the operation constructors', () => {
  it('builds a command from a non-empty argv', () => {
    assert.deepEqual(command(['npm', 'run', 'build']), { kind: 'command', command: ['npm', 'run', 'build'] });
  });

  it('copies the argv, so a caller cannot mutate a registered command', () => {
    const argv = ['npm', 'run', 'build'];
    const operation = command(argv);
    argv.push('--force');
    assert.deepEqual(operation.kind === 'command' ? operation.command : [], ['npm', 'run', 'build']);
  });

  /** @type {[unknown, string][]} */
  const badCommands = [
    [[], 'an empty argv, which runs nothing and exits zero'],
    [[''], 'an empty program name'],
    [['npm', ''], 'an empty argument'],
    [['npm', 7], 'a non-string argument'],
    ['npm run build', 'a string instead of an argv'],
    [null, 'null'],
  ];
  for (const [argv, label] of badCommands) {
    it(`refuses ${label}`, () => {
      assert.throws(() => command(/** @type {never} */ (argv)), ToolchainError);
    });
  }

  it('builds a not-applicable operation from a reason', () => {
    assert.deepEqual(notApplicable('the compiler rejects type errors; there is no separate step'), {
      kind: 'not-applicable',
      reason: 'the compiler rejects type errors; there is no separate step',
    });
  });

  /** @type {[unknown, string][]} */
  const badReasons = [
    ['', 'an empty reason'],
    ['   ', 'whitespace'],
    [undefined, 'no reason at all'],
    [true, 'a boolean'],
  ];
  for (const [reason, label] of badReasons) {
    it(`refuses a skip with ${label}`, () => {
      // An unexplained skip is indistinguishable from an oversight, and the operator reading
      // the gate list has no way to judge which it is.
      assert.throws(() => notApplicable(/** @type {never} */ (reason)), ToolchainError);
    });
  }
});

describe('the node toolchain', () => {
  it('produces the exact commands it replaced', () => {
    assert.deepEqual(
      GATE_OPERATIONS.map((name) => nodeToolchain.operations[name](CONTEXT)),
      [
        { kind: 'command', command: ['npm', 'run', 'build'] },
        { kind: 'command', command: ['npm', 'run', 'lint'] },
        { kind: 'command', command: ['npm', 'run', 'typecheck'] },
        {
          kind: 'command',
          command: [
            'npx',
            'vitest',
            'run',
            '--reporter=json',
            `--outputFile=${path.join('/repo', '.dare', 'test-report.json')}`,
          ],
        },
        { kind: 'command', command: ['npx', 'playwright', 'test'] },
        { kind: 'command', command: ['npm', 'audit', '--audit-level=high'] },
      ],
    );
  });

  it('detects itself from a package.json and reports the evidence', () => {
    assert.equal(nodeToolchain.detect(makeProject({ 'package.json': '{}' })), 'file package.json');
    assert.equal(nodeToolchain.detect(makeProject()), null);
  });

  it('finds a start command only when the package really declares one', () => {
    const withStart = makeProject({ 'package.json': '{"scripts":{"start":"node s.js"}}' });
    assert.equal(nodeToolchain.startCommand(withStart), 'npm start');
    assert.equal(nodeToolchain.startCommand(makeProject({ 'package.json': '{"scripts":{"start":"  "}}' })), null);
    assert.equal(nodeToolchain.startCommand(makeProject({ 'package.json': '{"scripts":{"build":"tsc"}}' })), null);
    assert.equal(nodeToolchain.startCommand(makeProject({ 'package.json': '{ broken' })), null);
    assert.equal(nodeToolchain.startCommand(makeProject()), null);
  });

  it('requires CI to name the runner the unit gate collects from', () => {
    // The bug: CI inspection accepted `node --test` and `jest` while the unit gate ran
    // `npx vitest run --reporter=json`. Both live runs on 10 August 2026 wrote correct
    // `node:test` suites and the gate collected nothing from them.
    const unit = /** @type {{ pattern: RegExp }} */ (nodeToolchain.ci.find((entry) => entry.operation === 'unit'));
    assert.equal(unit.pattern.test('npx vitest run'), true);
    assert.equal(unit.pattern.test('node --test'), false);
    assert.equal(unit.pattern.test('npm test'), false);
    assert.equal(unit.pattern.test('npx jest'), false);
  });

  it('requires CI to name the e2e runner too, for the same reason', () => {
    const e2e = /** @type {{ pattern: RegExp }} */ (nodeToolchain.ci.find((entry) => entry.operation === 'e2e'));
    assert.equal(e2e.pattern.test('npx playwright test'), true);
    assert.equal(e2e.pattern.test('npx cypress run'), false);
  });
});

describe('every registered toolchain', () => {
  it('registers no two under one name', () => {
    const names = TOOLCHAINS.map((toolchain) => toolchain.name);
    assert.equal(new Set(names).size, names.length);
  });

  for (const toolchain of TOOLCHAINS) {
    it(`${toolchain.name} implements every gate operation`, () => {
      for (const name of GATE_OPERATIONS) {
        assert.equal(typeof toolchain.operations[name], 'function', `${toolchain.name} is missing ${name}`);
      }
    });

    it(`${toolchain.name} declares CI patterns only for operations it has`, () => {
      for (const entry of toolchain.ci) {
        assert.equal(
          typeof toolchain.operations[entry.operation],
          'function',
          `${toolchain.name} requires CI to run ${entry.operation}, which it cannot itself run`,
        );
      }
    });

    it(`${toolchain.name}'s CI patterns match its own commands`, () => {
      // The structural fix. If a gate command changes and its CI pattern does not, this fails
      // here instead of silently letting a workflow satisfy CI with a different tool.
      for (const entry of toolchain.ci) {
        const operation = toolchain.operations[entry.operation](CONTEXT);
        if (operation.kind !== 'command') continue;
        const text = operation.command.join(' ');
        assert.equal(entry.pattern.test(text), true, `${toolchain.name}: ${entry.operation} pattern misses "${text}"`);
      }
    });
  }
});

describe('resolveToolchain', () => {
  it('reports a detected toolchain with its evidence', () => {
    const resolved = resolveToolchain(makeProject({ 'package.json': '{}' }));
    assert.equal(resolved.toolchain.name, 'node');
    assert.equal(resolved.detected, true);
    assert.equal(resolved.evidence, 'file package.json');
  });

  it('falls back rather than refusing, because iteration 1 has nothing to detect', () => {
    // A greenfield repository is a PRD and some design documents at the moment the gates are
    // first assembled. Refusing to pick would abort every greenfield run, which is the
    // primary use case.
    const resolved = resolveToolchain(makeProject({ 'PRD.md': '# thing\n' }));
    assert.equal(resolved.toolchain.name, 'node');
    assert.equal(resolved.detected, false);
    assert.equal(resolved.evidence.includes('defaulted'), true);
  });

  it('says nothing was detected rather than dressing the default up as evidence', () => {
    assert.equal(detectToolchain(makeProject()), null);
  });
});

describe('gatesFor', () => {
  it('turns commands into required gates, in operation order', () => {
    const { gates, skipped } = gatesFor(nodeToolchain, CONTEXT);
    assert.deepEqual(
      gates.map((gate) => gate.name),
      ['build', 'lint', 'types', 'unit', 'e2e', 'security-audit'],
    );
    assert.deepEqual(skipped, []);
  });

  it('reports a declined operation instead of dropping it', () => {
    // A gate list that shrinks from six to five reads exactly like one that always had five.
    const compiled = {
      ...nodeToolchain,
      operations: {
        ...nodeToolchain.operations,
        types: () => notApplicable('the compiler rejects type errors; there is no separate step'),
      },
    };
    const { gates, skipped } = gatesFor(compiled, CONTEXT);
    assert.deepEqual(
      gates.map((gate) => gate.name),
      ['build', 'lint', 'unit', 'e2e', 'security-audit'],
    );
    assert.deepEqual(skipped, [
      { name: 'types', reason: 'the compiler rejects type errors; there is no separate step' },
    ]);
  });

  it('throws on a toolchain missing an operation rather than quietly gating less', () => {
    const incomplete = { ...nodeToolchain, operations: { ...nodeToolchain.operations } };
    delete (/** @type {Record<string, unknown>} */ (incomplete.operations).e2e);
    assert.throws(
      () => gatesFor(/** @type {never} */ (incomplete), CONTEXT),
      (error) => error instanceof ToolchainError && error.message.includes('"e2e"'),
    );
  });
});
