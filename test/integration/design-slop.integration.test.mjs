/**
 * Tier 2 — the design-slop gate's verdict survives the real shell (PLAN item 42, slice B).
 *
 * The unit tests drive `runGates` through an injected runner, which is what makes the interpreter's
 * decisions assertable without a browser. What they cannot see is the one link between them and the
 * real thing: whether `shell` hands `runGates` the child's **stdout on a run the interpreter has to
 * read**. Every other gate in this repository discards stdout the moment it passes, so nothing else
 * has ever depended on that value arriving — and a gate whose whole verdict comes from the stream
 * would fail silently, and in the safe-looking direction, if it arrived empty.
 *
 * `impeccable` here is counterfeit: a script first on `PATH` that prints the committed impeccable
 * 4.0.4 capture and exits 2, which is the status impeccable uses when primary findings exist. The
 * gate roster, the runner, the spawn, the interpreter and the partition are all the real thing.
 *
 * Real node, real shell, counterfeit detector. No network, no API call.
 */

import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

import { runGates, shell } from '../../scripts/driver.mjs';

/** @type {string[]} */
const temporaryDirs = [];
const originalPath = process.env.PATH;

after(() => {
  process.env.PATH = originalPath;
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

const FIXTURE = fileURLToPath(new URL('../fixtures/impeccable/slop-findings.json', import.meta.url));

/**
 * @param {number} status what the counterfeit detector exits with
 * @returns {string} the workspace root
 */
function workspace(status) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-design-slop-'));
  temporaryDirs.push(root);
  const bin = path.join(root, 'bin');
  mkdirSync(bin, { recursive: true });
  const impeccable = path.join(bin, 'impeccable');
  writeFileSync(impeccable, `#!/bin/sh\ncat ${JSON.stringify(FIXTURE)}\nexit ${status}\n`, 'utf8');
  chmodSync(impeccable, 0o755);
  process.env.PATH = `${bin}${path.delimiter}${originalPath}`;
  return root;
}

/** @type {import('../../scripts/driver.mjs').Gate} */
const GATE = {
  name: 'quality:impeccable',
  command: ['impeccable', 'detect', '--json', 'src/'],
  required: true,
  interpret: 'design-slop',
};

describe('the design-slop gate through the real shell', () => {
  it('reads the detector stdout and renders it as findings a builder can act on', async () => {
    const root = workspace(2);
    const { ok, results } = await runGates([GATE], { cwd: root, run: shell });

    assert.equal(ok, false);
    // Both primary findings, by rule and location, out of a real captured stream.
    assert.match(results[0].detail, /design-slop findings that fail this gate \(2\):/);
    assert.match(results[0].detail, /- overused-font at slop\.html:3:/);
    assert.match(results[0].detail, /- bounce-easing at slop\.html:7:/);
    // The advisory one is present and explicitly not gate-failing.
    assert.match(results[0].detail, /advisory findings, recorded but not gate-failing \(1\):/);
    assert.match(results[0].detail, /- em-dash-overuse at slop\.html:/);
    // And the raw JSON never reaches the builder's repair context.
    assert.equal(results[0].detail.includes('"antipattern"'), false);
  });

  it('refuses a detector whose exit status contradicts the stream it printed', async () => {
    // Same bytes, exit 0. Under exit-code judging this was a clean pass; it is now a refusal,
    // because a status and a finding list that disagree describe two different runs.
    const root = workspace(0);
    const { ok, results } = await runGates([GATE], { cwd: root, run: shell });
    assert.equal(ok, false);
    assert.match(results[0].detail, /exited 0 while reporting 2 primary and 1 advisory findings/);
    assert.equal(results[0].status, 0);
  });
});
