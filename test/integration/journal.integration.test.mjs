/**
 * Tier 2 — the journal answers what a killed run could not (PLAN.md item 58).
 *
 * **This is the admission experiment, kept.** Before anything was built, four boundaries were killed
 * with `SIGKILL` and the surviving `.meeseeks/` inspected. Three questions had no answer on disk:
 * whether the last iteration settled, which child was in flight, and whether two different stopping
 * points were distinguishable at all — a run killed before the design child started and one killed
 * after the specification was captured left byte-identical directories.
 *
 * The unit cases drive `unsettled` over synthetic events. This drives a **real driver process**, kills
 * it, and reads back what a forensic reader would actually find, because the property under test is
 * that the file survives the kill — which no in-process test can show.
 *
 * Real git, real process kill, counterfeit `claude` on PATH. No network, no API call.
 */

import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { after, describe, it } from 'node:test';

import { readJournal, unsettled } from '../../scripts/journal.mjs';

/** @type {string[]} */
const temporaryDirs = [];
after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

const DRIVER = fileURLToPath(new URL('../../scripts/driver.mjs', import.meta.url));

/** @param {string} root @param {string[]} args */
const git = (root, args) => execFileSync('git', args, { cwd: root, stdio: 'pipe', encoding: 'utf8' });

/**
 * A repository plus a counterfeit `claude` that answers every phase, so a run reaches its later
 * boundaries without spending anything.
 *
 * @returns {{ root: string, bin: string }}
 */
function workspace() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-journal-int-'));
  temporaryDirs.push(root);
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 't@e.com']);
  git(root, ['config', 'user.name', 't']);
  writeFileSync(path.join(root, 'PRD.md'), '# Thing\n\n## Requirements\n\nPRD-1.1 It exists.\n');
  writeFileSync(path.join(root, '.gitignore'), '.meeseeks/\nnode_modules/\n');
  mkdirSync(path.join(root, '.meeseeks'), { recursive: true });
  writeFileSync(
    path.join(root, '.meeseeks', 'config.json'),
    JSON.stringify({ maxIterations: 3, tokenCeiling: 100000, costCeiling: 10, qualityPlugins: [] }),
  );
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'prd']);

  const bin = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-journal-bin-'));
  temporaryDirs.push(bin);
  // **A launcher delegating to a node file, which is the install form npm actually produces.**
  // The counterfeit used to be a single `#!/usr/bin/env node` script with its logic inline, and it
  // answered nothing at all for `--version`. Both now matter: the run seals its binary at the
  // launch boundary, and a launcher whose delegation cannot be read is refused rather than
  // approximately sealed. A fake that could not be sealed was not modelling a Claude Code install,
  // it was modelling a thing the compatibility policy exists to reject.
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
 * Run the driver until `marker` appears in its output, then kill its process group.
 *
 * @param {string} root @param {string} bin @param {RegExp} marker
 * @returns {Promise<void>}
 */
function killAt(root, bin, marker) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [DRIVER, 'PRD.md', '--yes'], {
      cwd: root,
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, MEESEEKS_RUNNING: undefined, MEESEEKS_STYLE: 'plain' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    let seen = '';
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      try {
        process.kill(-Number(child.pid), 'SIGKILL');
      } catch {
        try { child.kill('SIGKILL'); } catch { /* already gone */ }
      }
      delay(400).then(resolve);
    };
    child.stdout.on('data', (b) => {
      seen += String(b);
      if (marker.test(seen)) stop();
    });
    child.stderr.on('data', (b) => { seen += String(b); });
    child.on('exit', () => { if (!stopped) { stopped = true; resolve(); } });
    delay(40_000).then(stop);
  });
}

describe('a killed run leaves a history of its own progress', () => {
  it('names the child that was in flight, which no other artifact records', { timeout: 90_000 }, async () => {
    // Finding 2 of the admission experiment. The log's last line named the child; the tree did not.
    const { root, bin } = workspace();
    await killAt(root, bin, /design: claude/);
    const events = readJournal(path.join(root, '.meeseeks'));
    assert.equal(events.length > 0, true, 'the journal did not survive the kill');
    const state = unsettled(events);
    assert.deepStrictEqual(state.inFlight, ['design'], `in flight was ${JSON.stringify(state.inFlight)}`);
  });

  it('survives SIGKILL as readable lines, which is the property the file exists for', { timeout: 90_000 }, async () => {
    // Append-only and line-oriented: a crash mid-write costs the last line and nothing before it.
    // `readJournal` refuses a malformed line that is not the last, so this passing means every
    // earlier record is intact.
    const { root, bin } = workspace();
    await killAt(root, bin, /design: claude/);
    const events = readJournal(path.join(root, '.meeseeks'));
    assert.equal(events.length > 0, true, 'no journal survived the kill, so this case asserted nothing');
    for (const event of events) {
      assert.equal(typeof event.seq, 'number');
      assert.equal(typeof event.kind, 'string');
    }
    assert.deepStrictEqual(
      events.map((event) => event.seq),
      events.map((_event, index) => index + 1),
      'sequence numbers are not contiguous, so a record was lost mid-file',
    );
  });

  it('shows a settled child as no longer in flight, and an unsettled iteration', { timeout: 90_000 }, async () => {
    // The other half of finding 1, and the case that makes `child-settled` load-bearing: killing
    // while the *first* child runs proves nothing about settlement, because nothing had settled. A
    // mutation removing the settle event survived exactly that gap.
    const { root, bin } = workspace();
    await killAt(root, bin, /builder|iteration 1/i);
    const events = readJournal(path.join(root, '.meeseeks'));
    assert.equal(events.length > 0, true, 'no journal survived the kill');
    const state = unsettled(events);
    assert.equal(
      state.inFlight.includes('design'),
      false,
      `design settled and should not be in flight: ${JSON.stringify(state.inFlight)}`,
    );
    // And the iteration that had started is named as unsettled, which is the question no artifact
    // could answer: three briefs say three iterations began, nothing said whether one finished.
    assert.equal(state.unsettledIteration, 1);
  });

  it('records no prompt or response text, only transitions', { timeout: 90_000 }, async () => {
    // A journal that accumulated what children said would be an unbounded log of untrusted text in
    // a driver-owned file. `detail` carries the model, never the exchange.
    const { root, bin } = workspace();
    await killAt(root, bin, /design: claude/);
    const events = readJournal(path.join(root, '.meeseeks'));
    assert.equal(events.length > 0, true, 'no journal survived the kill, so this case asserted nothing');
    for (const event of events) {
      assert.equal((event.detail ?? '').length <= 200, true);
      assert.equal((event.detail ?? '').includes('PRD-1.1'), false, 'prompt content reached the journal');
    }
  });
});

describe('the next run tells the operator what the last one left', () => {
  it('reports a killed run, names what was outstanding, and resumes nothing', { timeout: 120_000 }, async () => {
    // The end-to-end shape: kill a run, start another in the same repository, and read what the
    // second one says about the first. Diagnosis only -- item 36 forbids a resume path, and the
    // line has to say so, because a message that read as an offer to continue would be worse than
    // silence.
    const { root, bin } = workspace();
    await killAt(root, bin, /builder|iteration 1/i);
    assert.equal(readJournal(path.join(root, '.meeseeks')).length > 0, true, 'nothing was killed mid-flight');

    /** @type {string[]} */
    const logs = [];
    await new Promise((resolve) => {
      const child = spawn(process.execPath, [DRIVER, 'PRD.md', '--yes'], {
        cwd: root,
        env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, MEESEEKS_RUNNING: undefined, MEESEEKS_STYLE: 'plain' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.stdout.on('data', (b) => logs.push(String(b)));
      child.stderr.on('data', (b) => logs.push(String(b)));
      child.on('exit', resolve);
      delay(90_000).then(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } });
    });

    const output = logs.join('');
    assert.match(output, /the previous run left no terminal receipt/);
    assert.match(output, /That work is not resumed/);
  });
});
