/**
 * Tier 2 — the component phase end to end against real git (PLAN item 24, DESIGN.md §11.1).
 *
 * The component helpers are unit-tested and every git call is injected, which leaves exactly
 * the questions this file exists for: does the phase inside the real `main` actually create the
 * worktree on its branch, write a componentless child config where the child will look, stream
 * the child's stdout under the `component:<name>:` prefix, charge the outcome into the run's
 * accounting, fast-forward the parent onto the branch, and clean the worktree up — and does the
 * failure half abort the parent by name before anything else is spent.
 *
 * The **child driver is the injected effect** (`io.runComponent`), exactly as `io.spawn` fakes
 * the paid children: the fake does what a real nested run does to the worktree — commits work
 * on the branch, records `outcome.json` — without spawning a process, while the worktree,
 * config and merge halves all run against real git.
 *
 * No network, no API, no money. Just git.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { BOXED_DEADLINE_MS, main } from '../../scripts/driver.mjs';

/** @type {string[]} */
const temporaryDirs = [];

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * @param {string} cwd
 * @param {string[]} argv
 * @returns {string}
 */
function git(cwd, argv) {
  return execFileSync('git', argv, { cwd, stdio: 'pipe', encoding: 'utf8' }).trim();
}

/**
 * A sane target repository: a PRD, a config declaring components, and `.meeseeks/` ignored at
 * every depth — which is what keeps a child's own `.meeseeks/` out of the branch it hands back.
 *
 * @param {unknown[]} components
 * @returns {string}
 */
function repoWithComponents(components) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-components-integration-'));
  temporaryDirs.push(root);
  git(root, ['init', '--quiet']);
  git(root, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
  git(root, ['config', 'user.email', 'test@example.invalid']);
  git(root, ['config', 'user.name', 'Integration Test']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  writeFileSync(path.join(root, 'PRD.md'), '# Thing\n\n## Requirements\n\nPRD-1.1 It exists.\n');
  writeFileSync(path.join(root, '.gitignore'), '.meeseeks/\nnode_modules/\n.hypothesis/\n*.log\n');
  mkdirSync(path.join(root, '.meeseeks'), { recursive: true });
  writeFileSync(
    path.join(root, '.meeseeks', 'config.json'),
    JSON.stringify({
      maxIterations: 1,
      tokenCeiling: 50_000,
      costCeiling: 1,
      qualityPlugins: [],
      components,
    }),
  );
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'prd and config']);
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

/**
 * A paid child that costs nothing and answers every phase plausibly enough to reach the loop.
 *
 * @param {string[]} prompts
 * @returns {import('../../scripts/driver.mjs').ClaudeResult extends never ? never : any}
 */
function cannedSpawn(prompts) {
  return async (/** @type {{ phase: string, prompt: string }} */ options) => {
    prompts.push(`${options.phase} ${options.prompt}`);
    const text =
      options.phase === 'design' ? 'Designed.\n\n```json\n{"capabilities": ["cli"]}\n```\n' : 'done';
    return { ok: true, text, costUsd: 0, tokens: 0, raw: '{}' };
  };
}

describe('a component ships and the parent builds on it', () => {
  it('creates the worktree, writes a componentless config, merges the branch, charges the spend, and cleans up', async () => {
    const root = repoWithComponents([
      { name: 'alpha', dir: path.join('packages', 'alpha').split(path.sep).join('/'), spec: 'Build alpha.' },
      { name: 'beta', dir: 'packages/beta', spec: 'docs/beta-prd.md' },
    ]);

    // A worktree abandoned by a killed previous run, on the same branch the first component
    // will need. The phase must sweep it and then `-B` must reset the leftover branch — this is
    // the rerun story, and it only exists against real git.
    const abandoned = path.join(path.dirname(root), `${path.basename(root)}-abandoned`, 'meeseeks-component-alpha');
    temporaryDirs.push(path.dirname(abandoned));
    mkdirSync(path.dirname(abandoned), { recursive: true });
    git(root, ['worktree', 'add', '-B', 'meeseeks/component-alpha', abandoned, 'HEAD']);
    assert.equal(git(root, ['worktree', 'list']).split('\n').length, 2);

    /** @type {string[]} */
    const logs = [];
    /** @type {string[]} */
    const prompts = [];
    /** @type {{ spec: string, driver: string, cwd: string, depth: string | undefined, running: string | undefined, boxed: string | undefined, config: Record<string, unknown>, sawAlphaInTree: boolean }[]} */
    const observed = [];

    /** @type {typeof import('../../scripts/components.mjs').runComponentDriver} */
    const fakeChildDriver = async (options) => {
      const componentName = path.basename(options.cwd);
      observed.push({
        spec: options.spec,
        driver: options.driver,
        cwd: options.cwd,
        depth: options.env.MEESEEKS_RUN_DEPTH,
        running: options.env.MEESEEKS_RUNNING,
        boxed: options.env.MEESEEKS_GIVE_THEM_THE_BOX,
        config: JSON.parse(readFileSync(path.join(options.cwd, '.meeseeks', 'config.json'), 'utf8')),
        // The second component's worktree is created at the parent's *post-merge* HEAD, so the
        // first component's work must already be in it: that is what "sequential, in declared
        // order" buys and what this flag records.
        sawAlphaInTree: existsSync(path.join(options.cwd, '..', 'alpha', 'alpha.mjs')),
      });
      options.onLine('nested driver says hello');
      // What a real nested run does to the worktree: work committed on the branch, an outcome
      // recorded in its own `.meeseeks`.
      writeFileSync(path.join(options.cwd, `${componentName}.mjs`), `export const name = '${componentName}';\n`);
      git(options.cwd, ['add', '-A']);
      git(options.cwd, ['commit', '--quiet', '--no-verify', '-m', `component ${componentName}`]);
      writeFileSync(
        path.join(options.cwd, '.meeseeks', 'outcome.json'),
        JSON.stringify({
          version: 1,
          state: 'SHIPPED',
          reason: 'panel unanimous',
          iterations: 1,
          spentTokens: componentName === 'alpha' ? 1_000 : 234,
          costUsd: componentName === 'alpha' ? 0.25 : 0,
          passing: [],
        }),
      );
      return { code: 0, detail: '' };
    };

    const code = await main(['PRD.md', '--yes', '--give-them-the-box'], {
      cwd: root,
      env: cleanEnv(),
      log: (line) => logs.push(line),
      spawn: cannedSpawn(prompts),
      runComponent: fakeChildDriver,
    });
    const all = logs.join('\n');

    // The abandoned worktree was swept before anything was created.
    assert.equal(all.includes('removed an abandoned worktree'), true, all.slice(0, 2000));

    // Both components ran, sequentially, in declared order.
    assert.equal(observed.length, 2, all.slice(0, 3000));
    assert.equal(observed[0].spec, 'Build alpha.');
    assert.equal(observed[1].spec, 'docs/beta-prd.md');
    assert.equal(observed[1].sawAlphaInTree, true, "beta's worktree did not contain alpha's merged work");

    // The child was pointed at this plugin's own driver, in the worktree's component dir.
    assert.equal(observed[0].driver.endsWith(path.join('scripts', 'driver.mjs')), true, observed[0].driver);
    assert.equal(
      observed[0].cwd.endsWith(path.join('meeseeks-component-alpha', 'packages', 'alpha')),
      true,
      observed[0].cwd,
    );

    // The ordinary child environment: re-entrancy marked, the box armed, one level deep.
    assert.equal(observed[0].running, '1');
    assert.notEqual(observed[0].boxed, undefined);
    assert.equal(observed[0].depth, '1');

    // The child config is exactly the derived record and nothing else — componentless, the
    // parent's remainder on both ceilings, the remaining wall clock, the stock iteration cap.
    assert.deepStrictEqual(Object.keys(observed[0].config).sort(), [
      'costCeiling',
      'deadlineMs',
      'maxIterations',
      'tokenCeiling',
    ]);
    assert.equal(Object.hasOwn(observed[0].config, 'components'), false);
    assert.equal(observed[0].config.tokenCeiling, 50_000);
    assert.equal(observed[0].config.costCeiling, 1);
    assert.equal(observed[0].config.maxIterations, 25);
    const alphaDeadline = Number(observed[0].config.deadlineMs);
    assert.equal(alphaDeadline > 0 && alphaDeadline <= BOXED_DEADLINE_MS, true, String(alphaDeadline));

    // The second component's ceilings shrank by what the first one spent, and its clock did
    // not grow back.
    assert.equal(observed[1].config.tokenCeiling, 49_000);
    assert.equal(observed[1].config.costCeiling, 0.75);
    assert.equal(Number(observed[1].config.deadlineMs) <= alphaDeadline, true);

    // The child's stdout reached the parent log under the component prefix.
    assert.equal(all.includes('component:alpha: nested driver says hello'), true);
    assert.equal(all.includes('component:beta: nested driver says hello'), true);

    // The merges landed: the parent's HEAD now contains both components' work, fast-forwarded.
    assert.equal(readFileSync(path.join(root, 'packages', 'alpha', 'alpha.mjs'), 'utf8'), "export const name = 'alpha';\n");
    assert.equal(readFileSync(path.join(root, 'packages', 'beta', 'beta.mjs'), 'utf8'), "export const name = 'beta';\n");
    assert.equal(git(root, ['rev-parse', 'HEAD']), git(root, ['rev-parse', 'meeseeks/component-beta']));
    // And nothing under any `.meeseeks/` was merged with it.
    assert.equal(git(root, ['ls-files']).includes('.meeseeks'), false, 'a child .meeseeks was committed');

    // The spend was charged into the run's accounting: the loop ran afterwards on canned
    // children costing zero, so the run's closing total is exactly the components' 1234.
    assert.equal(all.includes('tokens: 1234'), true, all.slice(-1500));

    // Worktrees removed on the way out; the branches survive as the record of the work.
    assert.equal(git(root, ['worktree', 'list']).split('\n').length, 1, 'a component worktree outlived the phase');
    assert.equal(git(root, ['branch', '--list', 'meeseeks/component-*']).split('\n').filter(Boolean).length, 2);

    // The loop still ran on the merged whole - a component's SHIPPED is a pre-filter, not the
    // run's verdict - and ended on its own one-iteration budget.
    assert.notEqual(prompts.find((entry) => entry.startsWith('builder ')), undefined, 'the loop never ran after the components');
    assert.equal(code, 1);
    assert.equal(all.includes('BUDGET'), true, all.slice(-600));
  });
});

describe('a component that does not ship aborts the parent by name', () => {
  it('stops at the first failed component, runs nothing after it, and merges nothing', async () => {
    const root = repoWithComponents([
      { name: 'flaky', dir: 'packages/flaky', spec: 'Build flaky.' },
      { name: 'never', dir: 'packages/never', spec: 'Never reached.' },
    ]);
    /** @type {string[]} */
    const logs = [];
    /** @type {string[]} */
    const prompts = [];
    let invocations = 0;

    /** @type {typeof import('../../scripts/components.mjs').runComponentDriver} */
    const stalledChild = async (options) => {
      invocations += 1;
      options.onLine('trying');
      writeFileSync(
        path.join(options.cwd, '.meeseeks', 'outcome.json'),
        JSON.stringify({ version: 1, state: 'STALLED', reason: 'no gate improvement', spentTokens: 777, costUsd: 0.1 }),
      );
      return { code: 1, detail: '' };
    };

    const code = await main(['PRD.md', '--yes', '--give-them-the-box'], {
      cwd: root,
      env: cleanEnv(),
      log: (line) => logs.push(line),
      spawn: cannedSpawn(prompts),
      runComponent: stalledChild,
    });
    const all = logs.join('\n');

    assert.equal(code, 1);
    // The abort names the component and its real terminal state, and the box closes.
    assert.equal(all.includes('component flaky: ended STALLED, not SHIPPED'), true, all.slice(-1200));
    assert.equal(logs.includes('ABORTED'), true, 'no ABORTED stamp was printed');
    // Declared order is also a stop order: the second component was never started.
    assert.equal(invocations, 1, 'a component ran after an earlier one had already failed');
    // Nothing was merged and the loop never ran: the parent does not build on a component
    // that did not ship.
    assert.equal(existsSync(path.join(root, 'packages')), false, 'a failed component still reached the parent tree');
    assert.equal(prompts.find((entry) => entry.startsWith('builder ')), undefined, 'the loop ran despite the abort');
    // The worktree did not outlive the failure, and neither did the run lock the phase runs
    // under: an abort that kept the lock would refuse the operator's next run for no reason.
    assert.equal(git(root, ['worktree', 'list']).split('\n').length, 1);
    assert.equal(existsSync(path.join(root, '.meeseeks', 'lock.json')), false, 'the abort left the run lock behind');
  });

  it('fails closed when the child records no outcome at all, quoting the child stderr tail', async () => {
    const root = repoWithComponents([{ name: 'crashy', dir: 'packages/crashy', spec: 'Build crashy.' }]);
    /** @type {string[]} */
    const logs = [];
    /** @type {string[]} */
    const prompts = [];

    /** @type {typeof import('../../scripts/components.mjs').runComponentDriver} */
    const crashedChild = async () => ({ code: 1, detail: 'TypeError: boom at driver.mjs:1' });

    const code = await main(['PRD.md', '--yes', '--give-them-the-box'], {
      cwd: root,
      env: cleanEnv(),
      log: (line) => logs.push(line),
      spawn: cannedSpawn(prompts),
      runComponent: crashedChild,
    });
    const all = logs.join('\n');

    assert.equal(code, 1);
    assert.equal(all.includes('component crashy: failed (exit code 1)'), true, all.slice(-1200));
    assert.equal(all.includes('could not be read'), true, 'the missing outcome was not named');
    // A child that died without a receipt spent real money nothing recorded; the bill must say
    // so rather than silently omitting it.
    assert.equal(all.includes("missing from this run's bill"), true, 'the unrecorded spend was not named');
    assert.equal(all.includes('TypeError: boom'), true, 'the child stderr tail was dropped');
    assert.equal(logs.includes('ABORTED'), true);
    assert.equal(git(root, ['worktree', 'list']).split('\n').length, 1);
  });
});

describe('the component phase runs under the run lock', () => {
  it('refuses while another live driver holds the lock, before any component work', async () => {
    const root = repoWithComponents([{ name: 'solo', dir: 'packages/solo', spec: 'Build solo.' }]);
    // A live pid that is not this process: the test runner's parent. A lock naming this
    // process's own pid would pass as "already holds the lock", which is a different property.
    writeFileSync(
      path.join(root, '.meeseeks', 'lock.json'),
      JSON.stringify({ pid: process.ppid, startedAt: new Date().toISOString() }),
    );
    /** @type {string[]} */
    const logs = [];
    let invocations = 0;

    const code = await main(['PRD.md', '--yes', '--give-them-the-box'], {
      cwd: root,
      env: cleanEnv(),
      log: (line) => logs.push(line),
      spawn: cannedSpawn([]),
      runComponent: async () => {
        invocations += 1;
        return { code: 0, detail: '' };
      },
    });
    const all = logs.join('\n');

    assert.equal(code, 1);
    assert.equal(all.includes('is still running against this repository'), true, all.slice(-1200));
    // Nothing of the phase ran against the locked repository: no sweep, no worktree, no child.
    assert.equal(invocations, 0, 'a component ran against a repository another driver holds');
    assert.equal(git(root, ['worktree', 'list']).split('\n').length, 1);
    // The other driver's lock was not clobbered by the refusal.
    assert.equal(
      JSON.parse(readFileSync(path.join(root, '.meeseeks', 'lock.json'), 'utf8')).pid,
      process.ppid,
      "the refused run overwrote the other driver's lock",
    );
  });
});

describe('poisoned trees are refused before a child is paid for', () => {
  it('refuses a component whose .meeseeks is committed, which would replay a stale verdict', async () => {
    const root = repoWithComponents([{ name: 'ghost', dir: 'packages/ghost', spec: 'Build ghost.' }]);
    // The reviewer's reproduction: a committed SHIPPED outcome. The worktree is a checkout of
    // HEAD, so this file would materialise inside it and be read as the verdict of a child
    // that refused at its own preflight and built nothing.
    mkdirSync(path.join(root, 'packages', 'ghost', '.meeseeks'), { recursive: true });
    writeFileSync(
      path.join(root, 'packages', 'ghost', '.meeseeks', 'outcome.json'),
      JSON.stringify({ version: 1, state: 'SHIPPED', reason: 'from a previous life', spentTokens: 9, costUsd: 9 }),
    );
    // `-f` because the fixture's .gitignore ignores `.meeseeks/` at every depth — exactly the
    // hygiene whose absence this refusal exists for.
    git(root, ['add', '-f', 'packages/ghost/.meeseeks/outcome.json']);
    git(root, ['commit', '--quiet', '-m', 'poison: a committed outcome']);
    /** @type {string[]} */
    const logs = [];
    let invocations = 0;

    const code = await main(['PRD.md', '--yes', '--give-them-the-box'], {
      cwd: root,
      env: cleanEnv(),
      log: (line) => logs.push(line),
      spawn: cannedSpawn([]),
      runComponent: async () => {
        invocations += 1;
        return { code: 0, detail: '' };
      },
    });
    const all = logs.join('\n');

    assert.equal(code, 1);
    assert.equal(all.includes('packages/ghost/.meeseeks is tracked'), true, all.slice(-1500));
    assert.equal(logs.includes('ABORTED'), true, 'no ABORTED stamp was printed');
    // The inversion the refusal exists to prevent: no child ran, so nothing may say SHIPPED.
    assert.equal(invocations, 0, 'a child was spawned into a poisoned tree');
    assert.equal(all.includes('SHIPPED and merged'), false, 'a component that never ran was reported shipped');
    assert.equal(existsSync(path.join(root, '.meeseeks', 'lock.json')), false);
  });

  it('refuses a committed symlink that resolves the component dir outside the worktree', async () => {
    const outside = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-outside-'));
    temporaryDirs.push(outside);
    const root = repoWithComponents([{ name: 'escapee', dir: 'packages/escape', spec: 'Build escapee.' }]);
    // Ordinary project content the guard does not block: a builder in an earlier iteration
    // could commit exactly this. The worktree checkout materialises it, and a string-only
    // validator never sees where it points.
    symlinkSync(outside, path.join(root, 'packages'), 'dir');
    git(root, ['add', 'packages']);
    git(root, ['commit', '--quiet', '-m', 'poison: a symlink out of the tree']);
    /** @type {string[]} */
    const logs = [];
    let invocations = 0;

    const code = await main(['PRD.md', '--yes', '--give-them-the-box'], {
      cwd: root,
      env: cleanEnv(),
      log: (line) => logs.push(line),
      spawn: cannedSpawn([]),
      runComponent: async () => {
        invocations += 1;
        return { code: 0, detail: '' };
      },
    });
    const all = logs.join('\n');

    assert.equal(code, 1);
    assert.equal(all.includes('resolves outside the component worktree'), true, all.slice(-1500));
    assert.equal(logs.includes('ABORTED'), true);
    // No nested driver was pointed at a tree the operator never named, and nothing at all was
    // created behind the symlink.
    assert.equal(invocations, 0, 'a nested driver ran outside the worktree');
    assert.equal(existsSync(path.join(outside, 'escape')), false, 'the phase created a directory outside the worktree');
    assert.equal(git(root, ['worktree', 'list']).split('\n').length, 1);
    assert.equal(existsSync(path.join(root, '.meeseeks', 'lock.json')), false);
  });

  it('turns a dir that names a committed file into an ABORTED verdict, not a stack trace', async () => {
    const root = repoWithComponents([{ name: 'thing', dir: 'packages/thing', spec: 'Build thing.' }]);
    writeFileSync(path.join(root, 'packages'), 'a file where a directory was expected\n');
    git(root, ['add', 'packages']);
    git(root, ['commit', '--quiet', '-m', 'poison: a file named packages']);
    /** @type {string[]} */
    const logs = [];

    const code = await main(['PRD.md', '--yes', '--give-them-the-box'], {
      cwd: root,
      env: cleanEnv(),
      log: (line) => logs.push(line),
      spawn: cannedSpawn([]),
      runComponent: async () => ({ code: 0, detail: '' }),
    });
    const all = logs.join('\n');

    // The surprise (ENOTDIR from mkdirSync) ends the run the same verbatim-then-stamp way as
    // every expected failure, with the worktree cleaned up and the lock released — not an
    // unhandled throw escaping main.
    assert.equal(code, 1);
    assert.equal(all.includes('ENOTDIR'), true, all.slice(-1500));
    assert.equal(logs.includes('ABORTED'), true, 'the surprise escaped without a verdict');
    assert.equal(git(root, ['worktree', 'list']).split('\n').length, 1, 'the worktree outlived the surprise');
    assert.equal(existsSync(path.join(root, '.meeseeks', 'lock.json')), false, 'the surprise left the lock behind');
  });
});

describe('the parent wall clock bounds the phase', () => {
  it('refuses to start a component after the armed clock has expired', async () => {
    const root = repoWithComponents([{ name: 'late', dir: 'packages/late', spec: 'Build late.' }]);
    const configFile = path.join(root, '.meeseeks', 'config.json');
    // One millisecond: armed (the box refuses zero) and certain to have expired by the time
    // the phase starts. Deadlines are otherwise enforced only between loop iterations, so
    // without the phase's own check this component would start against a spent clock.
    writeFileSync(
      configFile,
      JSON.stringify({ ...JSON.parse(readFileSync(configFile, 'utf8')), deadlineMs: 1 }),
    );
    /** @type {string[]} */
    const logs = [];
    let invocations = 0;

    const code = await main(['PRD.md', '--yes', '--give-them-the-box'], {
      cwd: root,
      env: cleanEnv(),
      log: (line) => logs.push(line),
      spawn: cannedSpawn([]),
      runComponent: async () => {
        invocations += 1;
        return { code: 0, detail: '' };
      },
    });
    const all = logs.join('\n');

    assert.equal(code, 1);
    assert.equal(all.includes("the run's wall clock expired before this component started"), true, all.slice(-1500));
    assert.equal(logs.includes('ABORTED'), true);
    assert.equal(invocations, 0, 'a component started against an expired clock');
    assert.equal(git(root, ['worktree', 'list']).split('\n').length, 1, 'a worktree was created for a component that must not start');
    assert.equal(existsSync(path.join(root, '.meeseeks', 'lock.json')), false);
  });
});
