/**
 * Tests for the component machinery (PLAN item 24).
 *
 * Three properties carry the feature and all three are cheap to lose silently, which is why
 * each has its own section here rather than a mention inside a broader test:
 *
 *   - **The flag cannot be smuggled.** Components configured without `--give-them-the-box`
 *     refuse the run before any child is spawned, and a child's config can never carry a
 *     `components` key downward.
 *   - **The child's budget is the parent's remainder**, with floors that stop a child rather
 *     than zeros that would unleash one.
 *   - **Outcome reading is fail-closed.** A component that recorded nothing did not ship.
 */

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import {
  ComponentError,
  checkComponentStateNotTracked,
  componentBranch,
  componentChildConfig,
  componentDriverArgs,
  componentWorktreeName,
  readComponentOutcome,
  sweepComponentWorktrees,
  writeComponentChildConfig,
} from '../scripts/components.mjs';
import { defaultConfig } from '../scripts/config.mjs';
import { BOXED_DEADLINE_MS, main } from '../scripts/driver.mjs';

/** @type {string[]} */
const temporaryDirs = [];

/** @returns {string} */
function makeTempDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-components-test-'));
  temporaryDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

describe('names', () => {
  it('derives the worktree directory and the branch from the component name', () => {
    assert.equal(componentWorktreeName('parser'), 'meeseeks-component-parser');
    assert.equal(componentBranch('parser'), 'meeseeks/component-parser');
    assert.equal(componentWorktreeName('api-v2'), 'meeseeks-component-api-v2');
    assert.equal(componentBranch('api-v2'), 'meeseeks/component-api-v2');
  });
});

describe('componentDriverArgs', () => {
  it('spawns the nested driver with --yes and --give-them-the-box, exactly', () => {
    // The argv is the spec's own sentence: `node <driver> <spec> --yes --give-them-the-box`.
    // The child re-arms the same box machinery the parent runs under; nothing else travels.
    assert.deepStrictEqual(componentDriverArgs('/plugin/scripts/driver.mjs', 'Build the parser.'), [
      '/plugin/scripts/driver.mjs',
      'Build the parser.',
      '--yes',
      '--give-them-the-box',
    ]);
  });
});

describe('componentChildConfig', () => {
  const spent = { spentTokens: 400, spentUsd: 2.5, elapsedMs: 60_000, boxDeadlineMs: BOXED_DEADLINE_MS };

  it('hands the child the parent remainder on every ceiling and the remaining clock', () => {
    const child = componentChildConfig({ tokenCeiling: 1_000, costCeiling: 10, deadlineMs: 600_000 }, spent);
    assert.deepStrictEqual(child, {
      maxIterations: defaultConfig().maxIterations,
      tokenCeiling: 600,
      costCeiling: 7.5,
      deadlineMs: 540_000,
    });
  });

  it('keeps an uncapped parent uncapped, because inventing a limit the operator switched off is the same defect as dropping one they set', () => {
    const child = componentChildConfig({ tokenCeiling: 0, costCeiling: 0, deadlineMs: 600_000 }, spent);
    assert.equal(child.tokenCeiling, 0);
    assert.equal(child.costCeiling, 0);
  });

  it('floors an overspent remainder instead of writing zero, which would mean unlimited', () => {
    // Zero is "no ceiling" in this config schema, so an overspent parent writing its literal
    // remainder would hand an out-of-money run an unbounded child - the exact falsy trap
    // childBudget documents for dollars. The floors stop the child at once instead.
    const child = componentChildConfig(
      { tokenCeiling: 1_000, costCeiling: 10, deadlineMs: 600_000 },
      { spentTokens: 5_000, spentUsd: 50, elapsedMs: 60_000, boxDeadlineMs: BOXED_DEADLINE_MS },
    );
    assert.equal(child.tokenCeiling, 1);
    assert.equal(child.costCeiling, 0.0001);
  });

  it('floors an exhausted clock at one millisecond rather than zero, which the boxed child would read as a fresh half hour', () => {
    const child = componentChildConfig(
      { tokenCeiling: 0, costCeiling: 0, deadlineMs: 60_000 },
      { spentTokens: 0, spentUsd: 0, elapsedMs: 120_000, boxDeadlineMs: BOXED_DEADLINE_MS },
    );
    assert.equal(child.deadlineMs, 1);
  });

  it('falls back to the box default when the parent has no clock armed', () => {
    const child = componentChildConfig({ tokenCeiling: 0, costCeiling: 0, deadlineMs: 0 }, spent);
    assert.equal(child.deadlineMs, BOXED_DEADLINE_MS);
  });

  it('never contains a components key, even when derived from a parent config that has one', () => {
    // The belt beside the depth cap's braces: nesting does not inherit through a file.
    const parent = { ...defaultConfig(), tokenCeiling: 1_000, components: [{ name: 'a', dir: 'a', spec: 'x' }] };
    const child = componentChildConfig(parent, spent);
    assert.equal(Object.hasOwn(child, 'components'), false);
    assert.deepStrictEqual(Object.keys(child).sort(), ['costCeiling', 'deadlineMs', 'maxIterations', 'tokenCeiling']);
  });
});

describe('writeComponentChildConfig', () => {
  it('writes the config atomically and leaves nothing else behind', () => {
    const dir = path.join(makeTempDir(), '.meeseeks');
    const file = writeComponentChildConfig(dir, {
      maxIterations: 25,
      tokenCeiling: 600,
      costCeiling: 7.5,
      deadlineMs: 540_000,
    });
    assert.deepStrictEqual(JSON.parse(readFileSync(file, 'utf8')), {
      maxIterations: 25,
      tokenCeiling: 600,
      costCeiling: 7.5,
      deadlineMs: 540_000,
    });
    assert.deepStrictEqual(readdirSync(dir), ['config.json']);
  });

  it('refuses a config carrying a components key, and writes nothing', () => {
    // The smuggle refusal. A parent that wrote components into a child's config would hand a
    // nested run a further generation of nested runs no operator typed a flag for.
    const dir = path.join(makeTempDir(), '.meeseeks');
    const smuggled = /** @type {import('../scripts/components.mjs').ComponentChildConfig} */ (
      /** @type {unknown} */ ({
        maxIterations: 25,
        tokenCeiling: 600,
        costCeiling: 7.5,
        deadlineMs: 540_000,
        components: [{ name: 'grandchild', dir: 'x', spec: 'y' }],
      })
    );
    assert.throws(
      () => writeComponentChildConfig(dir, smuggled),
      (error) => error instanceof ComponentError && error.message.includes('components'),
    );
    assert.equal(existsSync(path.join(dir, 'config.json')), false, 'a refused config was still written');
  });

  it('refuses the key by presence, not by value: an empty list is still the key', () => {
    const dir = path.join(makeTempDir(), '.meeseeks');
    const smuggled = /** @type {import('../scripts/components.mjs').ComponentChildConfig} */ (
      /** @type {unknown} */ ({ maxIterations: 25, tokenCeiling: 0, costCeiling: 0, deadlineMs: 1, components: [] })
    );
    assert.throws(() => writeComponentChildConfig(dir, smuggled), ComponentError);
  });
});

describe('readComponentOutcome is fail-closed', () => {
  /** @param {string} contents */
  function outcomeFile(contents) {
    const file = path.join(makeTempDir(), 'outcome.json');
    writeFileSync(file, contents, 'utf8');
    return file;
  }

  it('reads a real outcome exactly', () => {
    const file = outcomeFile(JSON.stringify({ version: 1, state: 'SHIPPED', spentTokens: 123, costUsd: 4.5 }));
    assert.deepStrictEqual(readComponentOutcome(file), { ok: true, state: 'SHIPPED', spentTokens: 123, costUsd: 4.5 });
  });

  it('reads a non-shipped state as readable, because reading is not judging', () => {
    // The caller aborts on anything but SHIPPED; the reader's job is only to say what the
    // child recorded, so the abort can name the real terminal state.
    const file = outcomeFile(JSON.stringify({ state: 'STALLED', spentTokens: 7, costUsd: 0.1 }));
    const outcome = readComponentOutcome(file);
    assert.equal(outcome.ok, true);
    assert.equal(outcome.ok && outcome.state, 'STALLED');
  });

  it('fails a missing file', () => {
    const outcome = readComponentOutcome(path.join(makeTempDir(), 'outcome.json'));
    assert.equal(outcome.ok, false);
    assert.equal(!outcome.ok && outcome.detail.includes('could not be read'), true);
  });

  const unreadable = [
    ['{ not json', 'unparseable JSON'],
    ['null', 'a JSON null'],
    ['[]', 'a JSON array'],
    ['"SHIPPED"', 'a bare string'],
    ['{}', 'a record with no state'],
    ['{"state": ""}', 'an empty state'],
    ['{"state": "   "}', 'a whitespace state'],
    ['{"state": 1}', 'a state that is not a string'],
  ];
  for (const [contents, label] of unreadable) {
    it(`fails ${label}`, () => {
      const outcome = readComponentOutcome(outcomeFile(contents));
      assert.equal(outcome.ok, false);
      assert.equal(!outcome.ok && outcome.detail.length > 0, true, 'a failed read must say why');
    });
  }

  it('clamps spends at zero, because a negative charge is a refund nothing earned', () => {
    const file = outcomeFile(JSON.stringify({ state: 'SHIPPED', spentTokens: -50, costUsd: -1 }));
    assert.deepStrictEqual(readComponentOutcome(file), { ok: true, state: 'SHIPPED', spentTokens: 0, costUsd: 0 });
  });

  it('treats missing spends as zero rather than failing a state that is present', () => {
    const file = outcomeFile(JSON.stringify({ state: 'SHIPPED' }));
    assert.deepStrictEqual(readComponentOutcome(file), { ok: true, state: 'SHIPPED', spentTokens: 0, costUsd: 0 });
  });
});

describe('sweepComponentWorktrees', () => {
  const PORCELAIN = [
    'worktree /repo',
    'HEAD abc',
    'branch refs/heads/main',
    '',
    'worktree /tmp/meeseeks-components-4242/meeseeks-component-parser',
    'HEAD abc',
    'branch refs/heads/meeseeks/component-parser',
    '',
    'worktree /tmp/meeseeks-components-4242/meeseeks-component-api-v2',
    'HEAD abc',
    'branch refs/heads/meeseeks/component-api-v2',
    '',
  ].join('\n');

  /**
   * @param {{ list?: { ok: boolean, stdout: string }, remove?: boolean }} answers
   */
  function runnerFor(answers = {}) {
    /** @type {string[][]} */
    const calls = [];
    /** @type {import('../scripts/components.mjs').Runner} */
    const run = (command, args) => {
      calls.push([command, ...args]);
      if (args[0] === 'worktree' && args[1] === 'list') {
        const list = answers.list ?? { ok: true, stdout: PORCELAIN };
        return { ok: list.ok, status: list.ok ? 0 : 1, stdout: list.stdout, stderr: list.ok ? '' : 'not a git repository' };
      }
      if (args[0] === 'worktree' && args[1] === 'remove' && answers.remove === false) {
        return { ok: false, status: 1, stdout: '', stderr: 'is dirty, use --force' };
      }
      return { ok: true, status: 0, stdout: '', stderr: '' };
    };
    return { calls, run };
  }

  it('removes every abandoned component worktree it finds', async () => {
    const { run } = runnerFor();
    const swept = await sweepComponentWorktrees({ cwd: '/repo', run });
    assert.deepStrictEqual(swept.removed, [
      '/tmp/meeseeks-components-4242/meeseeks-component-parser',
      '/tmp/meeseeks-components-4242/meeseeks-component-api-v2',
    ]);
    assert.deepStrictEqual(swept.problems, []);
  });

  it('leaves the main worktree, a race worktree and anything not ours completely alone', async () => {
    // The race sweep has its own pattern and its own moment; sweeping its worktrees from here
    // would have two owners for one lifecycle.
    const { calls, run } = runnerFor({
      list: {
        ok: true,
        stdout: [
          'worktree /repo',
          'branch refs/heads/main',
          '',
          'worktree /tmp/meeseeks-race-55237-4/meeseeks-race-01',
          'detached',
          '',
          'worktree /home/me/component-notes',
          'branch refs/heads/feature',
          '',
        ].join('\n'),
      },
    });
    const swept = await sweepComponentWorktrees({ cwd: '/repo', run });
    assert.deepStrictEqual(swept.removed, []);
    assert.equal(
      calls.some((call) => call.includes('remove')),
      false,
      'a worktree that is not a component was removed',
    );
  });

  it('prunes afterwards, so an administrative entry cannot block the next run on its own', async () => {
    const { calls, run } = runnerFor();
    await sweepComponentWorktrees({ cwd: '/repo', run });
    assert.deepStrictEqual(calls[calls.length - 1], ['git', 'worktree', 'prune']);
  });

  it('reports a removal it could not perform rather than reporting a clean sweep', async () => {
    const { run } = runnerFor({ remove: false });
    const swept = await sweepComponentWorktrees({ cwd: '/repo', run });
    assert.deepStrictEqual(swept.removed, []);
    assert.equal(swept.problems.length, 2);
    assert.equal(swept.problems[0].includes('meeseeks-component-parser'), true, swept.problems[0]);
  });

  it('reports a list it could not read, instead of concluding there is nothing to sweep', async () => {
    const { run } = runnerFor({ list: { ok: false, stdout: '' } });
    const swept = await sweepComponentWorktrees({ cwd: '/repo', run });
    assert.deepStrictEqual(swept.removed, []);
    assert.equal(swept.problems.length, 1);
    assert.equal(swept.problems[0].includes('not a git repository'), true, swept.problems[0]);
  });
});

describe('components without --give-them-the-box refuse at start', () => {
  // The other half of the smuggle defence, driven through the real `main`: the config can say
  // what the components are, and only the operator's typed flag can say they may run. No git
  // repository is needed - the refusal is upstream of everything that would want one, and that
  // placement (before any child is spawned) is itself under test here.

  /**
   * @param {unknown[]} components
   * @returns {string} a directory whose config declares the given components
   */
  function dirWithComponents(components) {
    const root = makeTempDir();
    mkdirSync(path.join(root, '.meeseeks'), { recursive: true });
    writeFileSync(path.join(root, '.meeseeks', 'config.json'), JSON.stringify({ components }), 'utf8');
    return root;
  }

  /** An environment with no re-entrancy marker and no box, whatever this test process carries. */
  const cleanEnv = () => ({
    ...process.env,
    MEESEEKS_RUNNING: undefined,
    MEESEEKS_GIVE_THEM_THE_BOX: undefined,
    MEESEEKS_RUN_DEPTH: undefined,
    MEESEEKS_STYLE: 'plain',
  });

  it('refuses to start at all without --yes, before any child is paid for', async () => {
    // **The acknowledgement, held at the door rather than in a parsed field.** `parseDriverArgs`
    // produced `yes` and nothing in `driver.mjs` read it, so a test asserting the field passed
    // whether or not the flag did anything — and `main(['PRD.md'])` with no flag reached the design
    // and builder phases. `preflight`'s `checkDangerAcknowledged` was the only enforcement, and the
    // feature audit found `init.mjs` exiting 0 silently on any path with a space, so on those hosts
    // there was no enforcement anywhere.
    const root = dirWithComponents([{ name: 'parser', dir: 'packages/parser', spec: 'PRD.md' }]);
    /** @type {string[]} */
    const logs = [];
    let spawned = 0;
    const code = await main([], {
      cwd: root,
      env: cleanEnv(),
      log: (line) => logs.push(line),
      spawn: async () => {
        spawned += 1;
        return { ok: true, text: '', costUsd: 0, tokens: 0, raw: '{}' };
      },
    });

    assert.equal(code, 1, logs.join('\n'));
    assert.equal(spawned, 0, 'a child was spawned by a run nobody acknowledged');
    assert.equal(
      logs.some((line) => line.includes('--yes')),
      true,
      logs.join('\n'),
    );
  });

  it('refuses before any child is spawned, naming the flag', async () => {
    const root = dirWithComponents([{ name: 'parser', dir: 'packages/parser', spec: 'PRD.md' }]);
    /** @type {string[]} */
    const logs = [];
    let spawned = 0;
    let componentsRun = 0;
    const code = await main(['--yes'], {
      cwd: root,
      env: cleanEnv(),
      log: (line) => logs.push(line),
      spawn: async () => {
        spawned += 1;
        return { ok: true, text: 'done', costUsd: 0, tokens: 0, raw: '{}' };
      },
      runComponent: async () => {
        componentsRun += 1;
        return { code: 0, detail: '' };
      },
    });
    assert.equal(code, 1);
    const refusal = logs.find((line) => line.includes('--give-them-the-box'));
    assert.notEqual(refusal, undefined, `no refusal named the flag:\n${logs.join('\n')}`);
    assert.equal(String(refusal).includes('1 component(s)'), true, String(refusal));
    assert.equal(spawned, 0, 'a refused run must spawn no children at all');
    assert.equal(componentsRun, 0, 'a refused run must start no component');
  });

  it('does not refuse an empty component list, which is the feature switched off', async () => {
    // The benign neighbour: a config that declares no components must behave exactly as it did
    // before the key existed. The run proceeds past the components gate and stops at the *next*
    // one for an unrelated reason — this suite's fixture is a bare directory rather than a
    // repository, and 0.166.0's launch observation refuses a tree git cannot describe before any
    // child is paid for. Reaching that refusal is the evidence: it lives downstream of the
    // components gate, so an empty list cannot have been refused as a populated one.
    const root = dirWithComponents([]);
    /** @type {string[]} */
    const logs = [];
    const code = await main(['--yes'], {
      cwd: root,
      env: cleanEnv(),
      log: (line) => logs.push(line),
      spawn: async () => ({ ok: false, text: '', costUsd: 0, tokens: 0, raw: 'canned failure' }),
    });
    assert.equal(code, 1);
    assert.equal(
      logs.some((line) => line.startsWith('launch refused at HEAD')),
      true,
      `the run never got past the components gate:\n${logs.join('\n')}`,
    );
    assert.equal(
      logs.some((line) => line.includes('--give-them-the-box')),
      false,
      'an empty component list was refused as if it were a populated one',
    );
  });
});

describe('checkComponentStateNotTracked', () => {
  /**
   * @param {{ ok: boolean, stdout: string, stderr?: string }} answer
   * @returns {{ calls: string[][], run: import('../scripts/components.mjs').Runner }}
   */
  function listingRunner(answer) {
    /** @type {string[][]} */
    const calls = [];
    /** @type {import('../scripts/components.mjs').Runner} */
    const run = (command, args) => {
      calls.push([command, ...args]);
      return { ok: answer.ok, status: answer.ok ? 0 : 128, stdout: answer.stdout, stderr: answer.stderr ?? '' };
    };
    return { calls, run };
  }

  it('refuses a component whose .meeseeks is tracked, naming a file and the fix', async () => {
    const { run } = listingRunner({ ok: true, stdout: 'packages/ghost/.meeseeks/outcome.json\n' });
    const result = await checkComponentStateNotTracked({ cwd: '/repo', run, dir: 'packages/ghost' });
    assert.equal(result.ok, false);
    assert.equal(result.detail.includes('packages/ghost/.meeseeks is tracked (1 file(s)'), true, result.detail);
    assert.equal(result.detail.includes('packages/ghost/.meeseeks/outcome.json'), true, result.detail);
    assert.equal(result.detail.includes('git rm -r --cached'), true, result.detail);
  });

  it('allows a component with nothing tracked under its .meeseeks', async () => {
    const { calls, run } = listingRunner({ ok: true, stdout: '\n' });
    const result = await checkComponentStateNotTracked({ cwd: '/repo', run, dir: 'packages/clean' });
    assert.deepStrictEqual(result, { ok: true, detail: '' });
    assert.deepStrictEqual(calls, [['git', 'ls-files', '--', 'packages/clean/.meeseeks']]);
  });

  it('normalises Windows separators into the git pathspec dialect', async () => {
    const { calls, run } = listingRunner({ ok: true, stdout: '' });
    await checkComponentStateNotTracked({ cwd: '/repo', run, dir: 'packages\\api' });
    assert.deepStrictEqual(calls, [['git', 'ls-files', '--', 'packages/api/.meeseeks']]);
  });

  it('fails closed when the listing itself cannot be produced', async () => {
    const { run } = listingRunner({ ok: false, stdout: '', stderr: 'fatal: index locked' });
    const result = await checkComponentStateNotTracked({ cwd: '/repo', run, dir: 'packages/ghost' });
    assert.equal(result.ok, false);
    assert.equal(result.detail.includes('could not be checked'), true, result.detail);
    assert.equal(result.detail.includes('fatal: index locked'), true, result.detail);
  });
});
