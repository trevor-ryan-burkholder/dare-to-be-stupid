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
  CONDITIONAL_GATE_OPERATIONS,
  GATE_OPERATIONS,
  TOOLCHAINS,
  ToolchainError,
  detectToolchain,
  gatesFor,
  resolveToolchain,
} from '../scripts/toolchains/index.mjs';
import { TRX_REPORT, dotnetToolchain } from '../scripts/toolchains/dotnet.mjs';
import { MUTATION_CONFIG, MUTATION_CONFIG_CONTENTS, nodeToolchain } from '../scripts/toolchains/node.mjs';
import { command, notApplicable } from '../scripts/toolchains/shared.mjs';

/** @type {string[]} */
const temporaryDirs = [];

/**
 * @param {Record<string, string>} [files]
 * @returns {string}
 */
function makeProject(files = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-toolchains-'));
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

const CONTEXT = { root: '/repo', meeseeksDir: path.join('/repo', '.meeseeks') };

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

  it('gives the e2e gate a reporter and an output path, so browser ids can reach the ratchet', () => {
    // **The defect this asserts against.** `e2e` was a bare `npx playwright test` while `reports`
    // and `reportOwners` both declared that it writes `e2e-report.json`. Playwright's json reporter
    // goes to stdout unless `PLAYWRIGHT_JSON_OUTPUT_NAME` names a file, so the declared report was
    // never produced, and every Playwright id was permanently unmeasured: it could not regress
    // (item 95 reads an absent owning report as unmeasured), and it could never bank either.
    //
    // `templates/builder-system.md` and `templates/frontend-direction.md` both promise the builder
    // that a named Playwright test enters the monotonic ratchet. That promise had no wiring behind
    // it for 226 versions, and it is the silent-degradation class `CLAUDE.md` says this repository
    // is worst at seeing: nothing failed, no gate complained, the accessibility guarantee simply
    // was not there.
    const e2e = /** @type {{ kind: 'command', command: string[], env?: Record<string, string> }} */ (
      nodeToolchain.operations.e2e(CONTEXT)
    );
    assert.deepEqual(e2e.command, ['npx', 'playwright', 'test', '--reporter=json']);
    assert.deepEqual(e2e.env, {
      PLAYWRIGHT_JSON_OUTPUT_NAME: path.join('/repo', '.meeseeks', 'e2e-report.json'),
    });
  });

  it('carries an operation environment onto the gate that will run it', () => {
    // The env is useless if `gatesFor` drops it between the toolchain and the runner, which is
    // exactly where a report path would go missing without anything failing.
    const { gates } = gatesFor(nodeToolchain, CONTEXT);
    const e2e = /** @type {{ name: string, command: string[], env?: Record<string, string> }} */ (
      gates.find((gate) => gate.name === 'e2e')
    );
    assert.deepEqual(e2e.env, {
      PLAYWRIGHT_JSON_OUTPUT_NAME: path.join('/repo', '.meeseeks', 'e2e-report.json'),
    });
    // A gate with nothing to declare carries no env key at all rather than an empty object, so a
    // reader cannot mistake "no environment needed" for "environment computed and came out empty".
    const lint = /** @type {{ env?: Record<string, string> }} */ (gates.find((gate) => gate.name === 'lint'));
    assert.equal(Object.hasOwn(lint, 'env'), false);
  });
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
            `--outputFile=${path.join('/repo', '.meeseeks', 'test-report.json')}`,
          ],
        },
        {
          kind: 'command',
          command: ['npx', 'playwright', 'test', '--reporter=json'],
          env: { PLAYWRIGHT_JSON_OUTPUT_NAME: path.join('/repo', '.meeseeks', 'e2e-report.json') },
        },
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
    assert.equal(resolved.evidence.includes('nothing detected'), true);
  });

  it('says the fallback is provisional, because case C read it as an instruction', () => {
    // An operator asked for a service "in C#". The empty repository defaulted to node, the brief
    // told the builder its gates were npm, and the builder wrote TypeScript — a default that
    // became the answer. Detection re-runs every iteration, so the sentence has to say that the
    // choice is a placeholder rather than a decision.
    const resolved = resolveToolchain(makeProject({ 'PRD.md': '# thing\n' }));
    assert.equal(resolved.evidence.includes('provisionally'), true, resolved.evidence);
    assert.equal(resolved.evidence.includes('re-detected every iteration'), true, resolved.evidence);
    assert.equal(resolved.evidence.includes('not an instruction'), true, resolved.evidence);
  });

  it('says nothing was detected rather than dressing the default up as evidence', () => {
    assert.equal(detectToolchain(makeProject()), null);
  });

  it('names the toolchains it did not pick when a tree matches more than one', () => {
    // The residual this closes. A tree with both manifests resolves to node because node is
    // first in TOOLCHAINS, and it used to say nothing at all - which is indistinguishable from
    // a tree that only ever looked like node. The resolution is unchanged; the silence is not.
    const root = makeProject({ 'package.json': '{}', 'app.csproj': '<Project />' });
    const resolved = resolveToolchain(root);
    assert.equal(resolved.toolchain.name, 'node');
    assert.equal(resolved.detected, true);
    assert.deepStrictEqual(
      resolved.alternatives.map((entry) => entry.toolchain.name),
      ['dotnet'],
    );
    assert.equal(resolved.evidence.includes('also matched dotnet'), true, resolved.evidence);
    assert.equal(resolved.evidence.includes('first match wins'), true, resolved.evidence);
  });

  it('says nothing extra when exactly one toolchain matches', () => {
    // The neighbour. A warning that appears on every ordinary project is a warning nobody reads,
    // and this one must appear only where a real choice was made.
    const resolved = resolveToolchain(makeProject({ 'package.json': '{}' }));
    assert.deepStrictEqual(resolved.alternatives, []);
    assert.equal(resolved.evidence, 'file package.json');
  });

  it('reports no alternatives when it fell back, because nothing matched at all', () => {
    const resolved = resolveToolchain(makeProject({ 'PRD.md': '# thing\n' }));
    assert.deepStrictEqual(resolved.alternatives, []);
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

describe('the conditional second pass', () => {
  it('is exactly the mutation gate, asserted as a whole', () => {
    // Each addition here is a gate that stops running on an iteration that failed anything
    // else, which should be a decision somebody made on purpose rather than inherited.
    assert.deepEqual(CONDITIONAL_GATE_OPERATIONS, ['mutation']);
  });

  it('is disjoint from the first pass, so nothing runs twice', () => {
    for (const name of CONDITIONAL_GATE_OPERATIONS) {
      assert.equal(GATE_OPERATIONS.includes(name), false, `${name} is in both passes`);
    }
  });

  it('builds a mutation command scoped to the changed source', () => {
    const { gates } = gatesFor(
      nodeToolchain,
      { root: '/repo', meeseeksDir: '/repo/.meeseeks', changedFiles: ['src/a.ts', 'src/b.js'] },
      CONDITIONAL_GATE_OPERATIONS,
    );
    assert.equal(gates.length, 1);
    assert.equal(gates[0].name, 'mutation');
    // The whole argv, not just the operation name — that is what made "behaviour-neutral"
    // checkable for the first pass and it is what makes this checkable here. Every element
    // was executed against Stryker 9.6.1 before it was written down.
    assert.deepEqual(gates[0].command, [
      'npx',
      '--yes',
      '-p',
      '@stryker-mutator/core',
      '-p',
      '@stryker-mutator/vitest-runner',
      'stryker',
      'run',
      path.join('/repo/.meeseeks', MUTATION_CONFIG),
      '--testRunner',
      'vitest',
      '--mutate',
      'src/a.ts,src/b.js',
      '--reporters',
      'clear-text',
      '--logLevel',
      'error',
    ]);
  });

  it('installs the test-runner plugin beside the core that looks for it', () => {
    // The gate could not pass on any project, ever. Stryker resolves test-runner plugins
    // relative to its own installation, and `npx --yes @stryker-mutator/core` installs into
    // npm's npx cache - so `@stryker-mutator/vitest-runner` was invisible there whether or not
    // the project had it, and Stryker died with `no TestRunner plugins were loaded`. It ended
    // dogfood run 3 twice. Asserted separately from the argv above because this is the property,
    // and someone rewriting that array should have to delete a test that says why.
    const { gates } = gatesFor(
      nodeToolchain,
      { root: '/repo', meeseeksDir: '/repo/.meeseeks', changedFiles: ['src/a.js'] },
      CONDITIONAL_GATE_OPERATIONS,
    );
    const argv = /** @type {string[]} */ (gates[0].command);
    assert.equal(argv.includes('@stryker-mutator/vitest-runner'), true);
    // Named via `-p`, which is what puts it in the sandbox, rather than appearing as a bare
    // positional argument that Stryker would read as something else entirely.
    assert.equal(argv[argv.indexOf('@stryker-mutator/vitest-runner') - 1], '-p');
    // And the bin, not the package, is what npx is asked to execute once `-p` is in play.
    assert.equal(argv[argv.indexOf('run') - 1], 'stryker');
  });

  it('never mutates the tests, which would mutate the oracle into a lie', () => {
    const { gates, skipped } = gatesFor(
      nodeToolchain,
      {
        root: '/repo',
        meeseeksDir: '/repo/.meeseeks',
        changedFiles: ['src/a.test.ts', 'test/helpers.js', 'e2e/login.spec.ts', '__tests__/x.js'],
      },
      CONDITIONAL_GATE_OPERATIONS,
    );
    assert.deepEqual(gates, []);
    assert.equal(skipped.length, 1);
    assert.equal(skipped[0].name, 'mutation');
  });

  it('ignores files no mutator understands', () => {
    const { gates } = gatesFor(
      nodeToolchain,
      { root: '/repo', meeseeksDir: '/repo/.meeseeks', changedFiles: ['README.md', 'src/a.ts', 'assets/logo.png'] },
      CONDITIONAL_GATE_OPERATIONS,
    );
    assert.equal(gates[0].command.includes('src/a.ts'), true);
    assert.equal(gates[0].command.join(' ').includes('README.md'), false);
  });

  it('declines with a stated reason when nothing mutable changed', () => {
    // Not a pass. Mutating an empty set exits 0 and reads exactly like a run in which every
    // mutant died, which is the silent pass this codebase refuses everywhere else.
    const { gates, skipped } = gatesFor(
      nodeToolchain,
      { root: '/repo', meeseeksDir: '/repo/.meeseeks', changedFiles: [] },
      CONDITIONAL_GATE_OPERATIONS,
    );
    assert.deepEqual(gates, []);
    assert.equal(skipped[0].reason.includes('nothing to mutate'), true);
  });

  // Watched in a live improve-mode run on 13 August 2026: the gate printed "no first-party
  // source changed since the last ratchet-advancing commit" while `src/cli.mjs`, `src/parse.mjs`
  // and `src/stats.mjs` were all modified in the tree. The *decision* was right — iteration 1
  // has no `state.json`, so there is no baseline to scope a diff against — but the *sentence*
  // was a claim about the world and it was false.
  //
  // A message that misdirects costs an investigation, which this repository has now paid for
  // three separate times. "I have no baseline" and "nothing changed" are different facts and the
  // gate must not report the second when it means the first.
  it('declines when no changed-file list was supplied at all, and says that rather than claiming nothing changed', () => {
    const { skipped } = gatesFor(nodeToolchain, { root: '/repo', meeseeksDir: '/repo/.meeseeks' }, CONDITIONAL_GATE_OPERATIONS);
    assert.equal(skipped.length, 1);
    assert.equal(skipped[0].reason.includes('no baseline'), true, skipped[0].reason);
    assert.equal(
      skipped[0].reason.includes('no first-party source changed'),
      false,
      `an absent baseline was reported as an empty diff: ${skipped[0].reason}`,
    );
  });

  it('points the runner at a driver-owned config, not the project’s', () => {
    // Stryker exposes no --thresholds flag and thresholds.break defaults to null, so a run
    // with surviving mutants exits 0. Measured: a fixture with two survivors exited 0 with no
    // config and 1 with this one. The failure condition therefore lives in a file, and it has
    // to be a file under .meeseeks or the builder owns whether the gate can fail.
    const { gates } = gatesFor(
      nodeToolchain,
      { root: '/repo', meeseeksDir: '/repo/.meeseeks', changedFiles: ['src/a.ts'] },
      CONDITIONAL_GATE_OPERATIONS,
    );
    assert.equal(gates[0].command.includes(path.join('/repo/.meeseeks', MUTATION_CONFIG)), true);
    // The property is that a threshold exists at all, since Stryker's default of `null` means
    // survivors exit 0 and the gate cannot fail. The *number* is a judgement recorded beside the
    // constant, and asserting it here would only restate the constant.
    assert.equal(typeof MUTATION_CONFIG_CONTENTS.thresholds.break, 'number');
    assert.equal(MUTATION_CONFIG_CONTENTS.thresholds.break > 0, true, 'a break of 0 cannot fail');
  });

  it('does not demand a perfect mutation score, which no correct repository achieves', () => {
    // `break: 100` was measured, once the gate could run at all, against one two-branch function
    // with two tests exercising both branches: 83.33, failed by an `a < 0` -> `a <= 0` survivor a
    // correct suite need not kill. That is an unsatisfiable gate, which is the defect class that
    // blocked three gates in dogfood run 3, not a strict one.
    assert.equal(MUTATION_CONFIG_CONTENTS.thresholds.break < 100, true);
    assert.equal(MUTATION_CONFIG_CONTENTS.thresholds.break >= 50, true, 'a floor this low proves nothing');
  });
});

describe('the dotnet toolchain', () => {
  /**
   * @param {Record<string, string>} files
   * @returns {string} a throwaway repository root
   */
  function repo(files) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-dotnet-'));
    temporaryDirs.push(dir);
    for (const [relative, contents] of Object.entries(files)) {
      const full = path.join(dir, ...relative.split('/'));
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, contents, 'utf8');
    }
    return dir;
  }

  const LIBRARY = '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup></PropertyGroup></Project>';
  const EXECUTABLE = '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType></PropertyGroup></Project>';

  describe('detection', () => {
    it('finds a solution at the root and names it as evidence', () => {
      assert.equal(dotnetToolchain.detect(repo({ 'Probe.sln': '' })), 'file Probe.sln');
    });

    it('prefers the solution over a project, since that is what the commands operate on', () => {
      const dir = repo({ 'Probe.sln': '', 'src/Probe.Lib/Probe.Lib.csproj': LIBRARY });
      assert.equal(dotnetToolchain.detect(dir), 'file Probe.sln');
    });

    it('finds a project nested at the conventional depth', () => {
      const dir = repo({ 'src/Probe.Lib/Probe.Lib.csproj': LIBRARY });
      assert.equal(dotnetToolchain.detect(dir), 'file src/Probe.Lib/Probe.Lib.csproj');
    });

    it('does not read build output as a project', () => {
      // bin/ and obj/ are full of generated csproj-adjacent debris on a built tree.
      const dir = repo({ 'bin/Debug/Leftover.csproj': LIBRARY, 'obj/Other.csproj': LIBRARY });
      assert.equal(dotnetToolchain.detect(dir), null);
    });

    it('finds nothing in a repository that is not .NET', () => {
      assert.equal(dotnetToolchain.detect(repo({ 'package.json': '{}' })), null);
    });
  });

  describe('the security-audit command', () => {
    // This test exists to stop the command being "simplified" back to the obvious one. The
    // obvious one is wrong and only running it says so.
    const operation = dotnetToolchain.operations['security-audit']({ root: '/repo', meeseeksDir: '/repo/.meeseeks' });
    const audit = operation.kind === 'command' ? operation.command : [];

    it('is the audit-promoting restore, verified to exit 1 on a known advisory', () => {
      assert.equal(operation.kind, 'command');
      assert.deepEqual(audit, [
        'dotnet',
        'restore',
        '--force',
        '-warnaserror:NU1901,NU1902,NU1903,NU1904',
      ]);
    });

    it('is NOT `dotnet list package --vulnerable`, which exits 0 on a High advisory', () => {
      // Measured, not assumed: that command reported System.Net.Http 4.3.0 as High severity
      // (GHSA-7jgj-8wvc-jh57) and exited 0. A gate that cannot set a non-zero exit code is a
      // log line, and wiring it here would report a clean pass on every vulnerable project.
      assert.equal(audit.includes('list'), false);
      assert.equal(audit.includes('--vulnerable'), false);
    });

    it('uses -warnaserror rather than the -p: form, which MSBuild rejects', () => {
      // `-p:WarningsAsErrors=NU1901,NU1902` fails with MSB1006 and *also* exits 1, which reads
      // exactly like the audit firing. That misreading happened once here.
      assert.equal(
        audit.some((/** @type {string} */ part) => part.startsWith('-p:')),
        false,
      );
    });
  });

  describe('the operations it declines', () => {
    /** @param {'types' | 'e2e' | 'mutation'} name */
    const declined = (name) => dotnetToolchain.operations[name]({ root: '/repo', meeseeksDir: '/repo/.meeseeks' });

    it('declines typecheck, because the compiler subsumes it', () => {
      const types = declined('types');
      assert.equal(types.kind, 'not-applicable');
      assert.equal(types.reason.includes('no separate typecheck step'), true);
    });

    it('declines e2e, because the SDK ships no browser runner', () => {
      assert.equal(declined('e2e').kind, 'not-applicable');
    });

    it('declines mutation rather than guessing Stryker.NET’s command line', () => {
      // The whole discipline of this adapter in one assertion: an unverified command is worse
      // than a declared gap, because a declared gap is reported to the operator and to the
      // builder while a wrong command reads as a gate that ran.
      const mutation = declined('mutation');
      assert.equal(mutation.kind, 'not-applicable');
      assert.equal(mutation.reason.includes('not been verified'), true);
    });

    it('never returns an empty command for anything it declines', () => {
      // `true`, `[]` and an empty string all exit 0 and read as a pass. shared.mjs refuses
      // them, and this asserts the adapter never tries.
      for (const name of /** @type {const} */ (['types', 'e2e', 'mutation'])) {
        assert.equal(Object.hasOwn(declined(name), 'command'), false, `${name} returned a command`);
      }
    });
  });

  it('writes its unit report where the ratchet will look for it', () => {
    const unit = dotnetToolchain.operations.unit({ root: '/repo', meeseeksDir: '/repo/.meeseeks' });
    assert.equal(unit.kind, 'command');
    assert.deepEqual(unit.kind === 'command' ? unit.command : [], [
      'dotnet',
      'test',
      '--logger',
      `trx;LogFileName=${TRX_REPORT}`,
      '--results-directory',
      '/repo/.meeseeks',
    ]);
  });

  describe('startCommand', () => {
    it('names the executable project when there is one', () => {
      const dir = repo({ 'Probe.sln': '', 'src/Probe.App/Probe.App.csproj': EXECUTABLE });
      assert.equal(dotnetToolchain.startCommand(dir), 'dotnet run --project src/Probe.App');
    });

    it('returns null for a repository of libraries, rather than a command that would fail', () => {
      // Nothing declares how to start it, so there is nothing to ask. The observability gate
      // then passes on its static finding and says it did not probe (§4).
      const dir = repo({ 'Probe.sln': '', 'src/Probe.Lib/Probe.Lib.csproj': LIBRARY });
      assert.equal(dotnetToolchain.startCommand(dir), null);
    });
  });
});

describe('every toolchain declares the reports it writes', () => {
  // This exists because the driver used to hardcode node's two filenames. A toolchain writing
  // anything else produced a report nobody read — and an unread report is indistinguishable
  // from a run in which no test passed, which is how both live runs on 10 August ended at
  // `passing: 0`. Declaring the filenames is what lets the driver ask instead of assume.

  for (const toolchain of TOOLCHAINS) {
    it(`${toolchain.name} names at least one report`, () => {
      assert.equal(Array.isArray(toolchain.reports), true);
      assert.equal(toolchain.reports.length > 0, true, 'a toolchain with no report can never advance the ratchet');
    });

    it(`${toolchain.name} names no report for an operation it declines`, () => {
      // A declined operation writes nothing. Naming a report for it would send the driver
      // looking for a file nothing produces, and finding it absent is not evidence.
      const declined = ['unit', 'e2e'].filter(
        (name) =>
          toolchain.operations[/** @type {'unit' | 'e2e'} */ (name)]({ root: '/repo', meeseeksDir: '/repo/.meeseeks' })
            .kind === 'not-applicable',
      );
      if (declined.includes('e2e') && !declined.includes('unit')) {
        assert.equal(toolchain.reports.length, 1, `${toolchain.name} declines e2e but names more than one report`);
      }
    });
  }

  it('gives node its two reports and dotnet its one', () => {
    assert.deepEqual(nodeToolchain.reports, ['test-report.json', 'e2e-report.json']);
    assert.deepEqual(dotnetToolchain.reports, ['unit.trx']);
  });

  for (const toolchain of TOOLCHAINS) {
    it(`${toolchain.name} says which operation writes each report`, () => {
      // **The edge a receipt needs** (REVIEW F22, PLAN item 126). Knowing only the flat list, a
      // receipt could record which report bytes were read and not which gate produced them. Every
      // declared name has an owner, and every owner is an operation this toolchain actually has —
      // an owner naming an operation that does not exist would bind a digest to nothing.
      assert.equal(typeof toolchain.reportOwners, 'object');
      assert.deepStrictEqual(
        Object.keys(toolchain.reportOwners).sort(),
        [...toolchain.reports].sort(),
        `${toolchain.name} owns a different set of reports from the ones it declares`,
      );
      for (const [report, operation] of Object.entries(toolchain.reportOwners)) {
        assert.equal(
          typeof (/** @type {any} */ (toolchain.operations)[operation]),
          'function',
          `${toolchain.name} says ${report} is written by ${operation}, which is not an operation it has`,
        );
      }
    });
  }

  it('binds node’s two reports to the two operations that write them', () => {
    assert.deepStrictEqual(nodeToolchain.reportOwners, { 'test-report.json': 'unit', 'e2e-report.json': 'e2e' });
    assert.deepStrictEqual(dotnetToolchain.reportOwners, { 'unit.trx': 'unit' });
  });
});

describe('the node CI detectors, and why two of them stay narrow', () => {
  /** @param {string} step @returns {string[]} */
  const operations = (step) =>
    nodeToolchain.ci.filter((entry) => entry.pattern.test(step)).map((entry) => entry.operation);

  /** @type {[string, string[]][]} */
  const steps = [
    ['- run: npx vitest run', ['unit']],
    ['- run: npx playwright test', ['e2e']],
    ['- run: npm run build', ['build']],
    ['- run: npm run lint', ['lint']],
    ['- run: npx eslint .', ['lint']],
    ['- run: npx tsc --noEmit', ['types']],
    ['- run: npm run typecheck', ['types']],
  ];
  for (const [step, expected] of steps) {
    it(`reads ${step.replace('- run: ', '')} as ${expected.join(', ')}`, () => {
      assert.deepEqual(operations(step), expected);
    });
  }

  it('refuses `npm test`, and refusing it is the point', () => {
    // Nearly widened on 14 August because `npm test` is the ecosystem default. It is, and it is
    // ambiguous: a package script can invoke any runner, and when CI ran `node --test` while the
    // unit gate ran `npx vitest run --reporter=json`, two live runs produced correct suites the
    // gate collected nothing from. Naming the runner is the only promise the workflow can make
    // that the gate can read. What was actually wrong was the failure message.
    assert.deepEqual(operations('- run: npm test'), []);
    assert.deepEqual(operations('- run: node --test'), []);
    assert.deepEqual(operations('- run: npx jest'), []);
  });

  it('refuses a step this toolchain knows nothing about', () => {
    assert.deepEqual(operations('- run: make lint'), []);
    assert.deepEqual(operations('- uses: actions/checkout@v4'), []);
  });
});
