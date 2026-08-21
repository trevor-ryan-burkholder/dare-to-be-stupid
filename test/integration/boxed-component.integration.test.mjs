/**
 * Tier 2 — a boxed component traversal without a model (PLAN items 169 and 170).
 *
 * **Why this file exists: four of the five boxed-run graves were deterministic.** Runs 7, 11 and
 * 12 died on path spellings and gate posture — machine logic, no model contract anywhere — and
 * each lesson cost an hour of wall clock and dollars of quota to learn live. This harness drives
 * the real parent driver, the real components phase, a real child driver in a real worktree, and
 * the child's real gates, with a counterfeit `claude` on PATH answering every role for free —
 * the same technique the journal suite established. What is counterfeit is the model; everything
 * the graves were dug in — git, prefixes, phase contracts, gate posture — is real.
 *
 * Real git, real subprocess drivers, counterfeit `claude`. No network, no API call.
 */

import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { setTimeout } from 'node:timers';
import { fileURLToPath } from 'node:url';

const DRIVER = path.resolve(fileURLToPath(new URL('../../scripts/driver.mjs', import.meta.url)));

/** @type {string[]} */
const temporaryDirs = [];

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** @param {string} root @param {string[]} args @returns {string} */
const git = (root, args) => execFileSync('git', args, { cwd: root, stdio: 'pipe', encoding: 'utf8' }).trim();

/**
 * A monorepo shell with one declared component, plus a counterfeit `claude` for every role.
 *
 * The counterfeit answers `--version` with a sealed-range version, the design role with a
 * capabilities block, and everything else with a minimal successful envelope. The reviewer's
 * contract is deliberately not modelled yet: the panel refusing a garbage envelope ends the child
 * after its first gated iteration, and this harness's assertions are about that first iteration's
 * gate posture. Modelling the panel to reach a counterfeit SHIPPED is the harness's next tranche
 * (PLAN item 170), not this one.
 *
 * @returns {{ root: string, bin: string }}
 */
function boxedWorkspace() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-boxed-'));
  temporaryDirs.push(root);
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 't@e.com']);
  git(root, ['config', 'user.name', 't']);
  writeFileSync(path.join(root, 'README.md'), '# monorepo shell\n\nThe textstats component lives in packages/.\n');
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'shell', version: '0.1.0', private: true, type: 'module', scripts: { test: 'node --test' } }),
  );
  writeFileSync(path.join(root, 'PRD.md'), '# Shell\n\n## Requirements\n\nPRD-1.1 The shell documents its component.\n');
  mkdirSync(path.join(root, 'packages', 'textstats'), { recursive: true });
  writeFileSync(
    path.join(root, 'packages', 'textstats', 'PRD.md'),
    '# textstats\n\n## Requirements\n\nPRD-1.1 wordCount(text) counts whitespace-separated words.\n',
  );
  writeFileSync(path.join(root, '.gitignore'), '.meeseeks/\nnode_modules/\n');
  mkdirSync(path.join(root, '.meeseeks'), { recursive: true });
  writeFileSync(
    path.join(root, '.meeseeks', 'config.json'),
    JSON.stringify({
      maxIterations: 2,
      tokenCeiling: 100000,
      costCeiling: 10,
      qualityPlugins: [],
      components: [{ name: 'textstats', dir: 'packages/textstats', spec: 'PRD.md' }],
    }),
  );
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'shell']);

  const bin = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-boxed-bin-'));
  temporaryDirs.push(bin);
  const impl = path.join(bin, 'claude-impl.js');
  writeFileSync(
    impl,
    `if (process.argv.slice(2).includes('--version')) {
  process.stdout.write('2.1.230 (Claude Code)\\n');
  process.exit(0);
}
const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => {
  const prompt = Buffer.concat(chunks).toString('utf8');
  const result = /capabilities/i.test(prompt) && /design/i.test(prompt)
    ? 'Designed.\\n\\n\`\`\`json\\n{"capabilities": ["cli"]}\\n\`\`\`\\n'
    : 'built';
  process.stdout.write(JSON.stringify({ is_error: false, result, total_cost_usd: 0.001, usage: { input_tokens: 5, output_tokens: 5 } }));
});
`,
    'utf8',
  );
  const fake = path.join(bin, 'claude');
  writeFileSync(fake, `#!/bin/sh\nexec node ${JSON.stringify(impl)} "$@"\n`, 'utf8');
  chmodSync(fake, 0o755);
  return { root, bin };
}

/**
 * Drive the real parent driver to its end and return everything it printed.
 *
 * @param {string} root @param {string} bin
 * @returns {Promise<string>}
 */
function driveBoxed(root, bin) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [DRIVER, 'PRD.md', '--yes', '--give-them-the-box'], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        MEESEEKS_RUNNING: undefined,
        MEESEEKS_STYLE: 'plain',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    let seen = '';
    child.stdout.on('data', (b) => { seen += String(b); });
    child.stderr.on('data', (b) => { seen += String(b); });
    const finish = () => {
      try { process.kill(-Number(child.pid), 'SIGKILL'); } catch { /* already gone */ }
      resolve(seen);
    };
    child.on('exit', () => resolve(seen));
    // The whole traversal is counterfeit-fast; a harness that outlives this is hung, and the
    // captured output says where.
    setTimeout(finish, 300_000).unref?.();
  });
}

describe('a boxed component traversal, model-free', () => {
  it('excludes ci for the component child instead of demanding a decoration (run 12, item 169)', { timeout: 320_000 }, async () => {
    const { root, bin } = boxedWorkspace();
    const out = await driveBoxed(root, bin);

    // The child reached its own gates at all — the traversal's floor. Without this line the two
    // assertions below would pass vacuously on a run that died before gating anything.
    assert.equal(
      /component:textstats:.*(gate|GATE|iteration|ITERATION|TASK)/.test(out),
      true,
      `the child never reached its loop; output tail:\n${out.slice(-2000)}`,
    );

    // The repair: the component child's ci gate is a reported exclusion, every iteration.
    assert.equal(
      out.includes('gate ci does not apply: this is a component sub-run'),
      true,
      `the ci exclusion never printed; output tail:\n${out.slice(-2000)}`,
    );

    // The treadmill: run 12's child saw this line eight times, 24M tokens, and stalled. It may
    // never appear for a component again.
    assert.equal(
      /component:textstats:.*no workflow under \.github\/workflows/.test(out),
      false,
      'the component child was asked for a workflow GitHub would never run',
    );

    // And the exclusion must not leak upward: the parent, at the repository root, keeps its ci
    // gate — the merged whole is still judged.
    assert.equal(
      /^(?!component:).*gate ci does not apply: this is a component sub-run/m.test(out),
      false,
      'the parent excluded its own ci gate, which the doctrine forbids',
    );
  });
});
