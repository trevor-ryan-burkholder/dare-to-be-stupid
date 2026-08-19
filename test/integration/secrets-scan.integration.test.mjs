/**
 * Tier 2 — the gitleaks gate's verdict survives the real shell (PLAN.md item 29).
 *
 * The counterfeit binary replays the committed gitleaks 8.30.1 capture. That is not a shortcut
 * around the tool: its real contract was measured by hand against the real binary before any of
 * this was written, and what was measured is recorded with its fixtures in
 * `test/fixtures/gitleaks/README.md` — including the two facts that would have made a
 * written-from-memory gate wrong, that `detect` is no longer a subcommand and that the default
 * configuration allowlists AWS's own documented example key.
 *
 * What this tier owns is the link the unit tier cannot see: that a scanner's **stdout** reaches the
 * interpreter through a real spawn. gitleaks writes its report there rather than to a file
 * (`--report-path -`), and every other gate in this repository discards stdout the moment it
 * passes, so nothing else has ever depended on that value arriving.
 *
 * Real node, real shell, counterfeit scanner. No network, no API, no money.
 */

import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

import { runGates, shell } from '../../scripts/driver.mjs';
import { KNOWN_PLUGINS } from '../../scripts/plugins.mjs';

/** @type {string[]} */
const temporaryDirs = [];
const originalPath = process.env.PATH;

after(() => {
  process.env.PATH = originalPath;
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

const LEAKS = fileURLToPath(new URL('../fixtures/gitleaks/gitleaks-8.30.1-leaks.json', import.meta.url));
const CLEAN = fileURLToPath(new URL('../fixtures/gitleaks/gitleaks-8.30.1-clean.json', import.meta.url));

/**
 * @param {string} report the capture the counterfeit scanner prints
 * @param {number} status the exit code it uses
 * @returns {string} the workspace root
 */
function workspace(report, status) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-secrets-'));
  temporaryDirs.push(root);
  const bin = path.join(root, 'bin');
  mkdirSync(bin, { recursive: true });
  const gitleaks = path.join(bin, 'gitleaks');
  writeFileSync(gitleaks, `#!/bin/sh\ncat ${JSON.stringify(report)}\nexit ${status}\n`, 'utf8');
  chmodSync(gitleaks, 0o755);
  process.env.PATH = `${bin}${path.delimiter}${originalPath}`;
  return root;
}

/** The registry's own argv, so this cannot drift from what a run would really execute. */
const GATE_COMMAND = /** @type {string[]} */ (KNOWN_PLUGINS.gitleaks.gate);

/** @type {import('../../scripts/driver.mjs').Gate} */
const GATE = { name: 'quality:gitleaks', command: GATE_COMMAND, required: true, interpret: 'gitleaks' };

describe('the gitleaks gate through the real shell', () => {
  it('fails the gate on a committed secret and says where, without reprinting it', async () => {
    const root = workspace(LEAKS, 1);
    const { ok, results } = await runGates([GATE], { cwd: root, run: shell });

    assert.equal(ok, false);
    assert.match(results[0].detail, /committed secrets found by gitleaks \(1\):/);
    assert.match(results[0].detail, /- github-pat at src\/config\.js:1:/);
    assert.match(results[0].detail, /Remove the credential from the tree and rotate it/);
    // Neither the credential nor gitleaks' placeholder for it reaches the builder's context, and
    // neither does the raw report.
    assert.equal(results[0].detail.includes('REDACTED'), false);
    assert.equal(results[0].detail.includes('"RuleID"'), false);
  });

  it('passes a clean tree', async () => {
    const root = workspace(CLEAN, 0);
    const { ok, results } = await runGates([GATE], { cwd: root, run: shell });
    assert.deepStrictEqual(results, [
      { name: 'quality:gitleaks', ok: true, status: 0, detail: 'gitleaks found no committed secrets' },
    ]);
    assert.equal(ok, true);
  });

  it('fails when the scanner exits 1 having written nothing, which is a target it could not read', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-secrets-'));
    temporaryDirs.push(root);
    const bin = path.join(root, 'bin');
    mkdirSync(bin, { recursive: true });
    const gitleaks = path.join(bin, 'gitleaks');
    // Exactly what the real binary does for a missing target: exit 1, nothing on stdout, an FTL
    // line on stderr. Indistinguishable by status from a secret being found.
    writeFileSync(gitleaks, '#!/bin/sh\necho "FTL stat .: no such file or directory" >&2\nexit 1\n', 'utf8');
    chmodSync(gitleaks, 0o755);
    process.env.PATH = `${bin}${path.delimiter}${originalPath}`;

    const { ok, results } = await runGates([GATE], { cwd: root, run: shell });
    assert.equal(ok, false);
    assert.match(results[0].detail, /no report at all, so it is not known whether this tree was scanned/);
    assert.match(results[0].detail, /no such file or directory$/);
  });
});
