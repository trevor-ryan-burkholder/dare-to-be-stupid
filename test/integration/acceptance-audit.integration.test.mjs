/**
 * Tier 2 — the clean-clone traversal, against a real clone (REVIEW F22).
 *
 * F22's acceptance bullet is about an auditor holding **only** an archived run and a fresh clone.
 * `test/audit.test.mjs` proves the edge logic against a synthesized run and an injected git. What it
 * cannot prove is the half the finding is actually about: that a real `git clone` of the published
 * repository contains what the receipt's edges name, and that resolving them needs nothing else.
 *
 * This follows `reporter-paths.integration.test.mjs` — the precedent that closed F20, a claim of
 * exactly this shape, with a clean-clone test rather than an assertion.
 *
 * Real git, real clone, real files. No network, no API call.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { auditAcceptance } from '../../scripts/audit.mjs';
import { buildAcceptanceReceipt, digest } from '../../scripts/acceptance.mjs';
import { specificationDigest } from '../../scripts/specification.mjs';

/** @type {string[]} */
const dirs = [];
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** @param {string} cwd @param {string[]} args */
const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();

/** The real runner the CLI uses. */
const run = (/** @type {string} */ command, /** @type {string[]} */ args, /** @type {{cwd: string}} */ options) => {
  try {
    return { ok: true, stdout: execFileSync(command, args, { cwd: options.cwd, encoding: 'utf8', stdio: 'pipe' }) };
  } catch {
    return { ok: false, stdout: '' };
  }
};

const PRD = '# Thing\n\n## Requirements\n\nPRD-1.1 It exists.\n';
const REVIEW_JSON = JSON.stringify({ reviewer: 'correctness', verdict: 'pass' });
const SUPPLY_MANIFEST = { role: 'review', inputs: [], ambient: { disabled: [], by: '--safe-mode', verified: false } };

/** @returns {string} */
function scratch() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-audit-i9n-'));
  dirs.push(dir);
  return dir;
}

/**
 * A published repository, and the archived run that shipped from it.
 *
 * @param {{ prd?: string }} [options]
 * @returns {{ origin: string, commit: string, tree: string, runDir: string }}
 */
function shippedRun(options = {}) {
  const base = scratch();
  const origin = path.join(base, 'origin');
  mkdirSync(origin, { recursive: true });
  git(origin, ['init', '--quiet']);
  git(origin, ['config', 'user.email', 'test@example.invalid']);
  git(origin, ['config', 'user.name', 'test']);
  writeFileSync(path.join(origin, 'PRD.md'), options.prd ?? PRD, 'utf8');
  writeFileSync(path.join(origin, 'src.js'), 'export const it = 1;\n', 'utf8');
  git(origin, ['add', '-A']);
  git(origin, ['commit', '--quiet', '-m', 'shipped']);
  const commit = git(origin, ['rev-parse', 'HEAD']);
  const tree = git(origin, ['rev-parse', 'HEAD^{tree}']);

  const runDir = path.join(base, 'run');
  mkdirSync(runDir, { recursive: true });
  const specDigest = specificationDigest(options.prd ?? PRD);
  const write = (/** @type {string} */ name, /** @type {unknown} */ body) =>
    writeFileSync(path.join(runDir, name), typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`, 'utf8');

  write(
    'acceptance.json',
    buildAcceptanceReceipt({
      subject: { tree, commit },
      inputs: { specification: specDigest, config: 'sha256:config', plugin: '0.256.0', cli: '2.1.230', gateRoster: ['lint'] },
      results: {
        terminal: 'SHIPPED',
        gates: [
          {
            name: 'lint',
            ok: true,
            status: 0,
            detailDigest: digest('passed'),
            commandDigest: digest('npm run lint'),
            attempt: 1,
            reports: [],
          },
        ],
        panelDigest: digest(REVIEW_JSON),
        ratchetPassing: 2,
        reports: [],
        oracle: null,
        deploy: null,
      },
      invocations: [
        {
          role: 'review',
          requestedModel: 'claude-sonnet-5',
          requestedEffort: 'high',
          models: { observed: ['claude-sonnet-5'] },
          supplyDigest: digest(JSON.stringify(SUPPLY_MANIFEST)),
        },
      ],
      ledgerLapses: [],
      at: '2026-08-20T00:00:00.000Z',
    }),
  );
  write('specification.json', { version: 1, file: 'PRD.md', digest: specDigest });
  write('review.json', REVIEW_JSON);
  write('outcome.json', { state: 'SHIPPED', reason: 'done', passing: ['a::1', 'b::2'] });
  write('supply.json', { invocations: [{ role: 'review', manifest: SUPPLY_MANIFEST }] });
  return { origin, commit, tree, runDir };
}

/**
 * A real clone of `origin`.
 *
 * **`--no-local` is not decoration.** Cloning a local path hardlinks the whole object directory,
 * so objects that are no longer reachable — an amended-away commit, for instance — come along and
 * still resolve. That is a property of local clones and not of anything under test here, and the
 * amend case below silently passed against it: the receipt's commit was gone from history and
 * `git rev-parse` answered anyway. `--no-local` forces the transport, which transfers only what is
 * reachable, and is what an auditor cloning a published repository actually gets.
 *
 * @param {string} origin
 * @returns {string}
 */
function clone(origin) {
  const into = path.join(scratch(), 'clone');
  execFileSync('git', ['clone', '--quiet', '--no-local', origin, into], { stdio: 'pipe' });
  return into;
}

describe('an auditor with one archived run and a clean clone (REVIEW F22)', () => {
  it('resolves every required edge, holding nothing from the run but its archive', async () => {
    // The claim F22 makes, executed. Nothing here reads the origin working tree, the gate output, or
    // any state the run left behind outside its archived directory.
    const shipped = shippedRun();
    const result = await auditAcceptance({ runDir: shipped.runDir, cloneDir: clone(shipped.origin), run });
    assert.equal(result.ok, true, `${result.summary}\n${result.edges.map((e) => `${e.state} ${e.edge}`).join('\n')}`);
    assert.equal(result.edges.some((edge) => edge.state === 'missing' || edge.state === 'mismatch'), false);
  });

  it('fails against a clone of a different repository', async () => {
    // The commit is simply not there. This is the shape of a receipt presented against the wrong
    // publication — and it must not be reported as a resolvable edge.
    const shipped = shippedRun();
    const stranger = shippedRun({ prd: '# Other\n\n## Requirements\n\nPRD-1.1 Different.\n' });
    const result = await auditAcceptance({ runDir: shipped.runDir, cloneDir: clone(stranger.origin), run });
    assert.equal(result.ok, false);
    assert.equal(result.edges.find((edge) => edge.edge === 'subject.tree')?.state, 'missing');
  });

  it('fails when the published PRD was rewritten after the run shipped', async () => {
    // The commit still resolves, so the tree edge is fine; what changed is the document the run was
    // held to. An auditor reading only the tree edge would call this clean.
    const shipped = shippedRun();
    const into = clone(shipped.origin);
    writeFileSync(path.join(into, 'PRD.md'), '# Thing\n\n## Requirements\n\nPRD-1.1 Rewritten.\n', 'utf8');

    const result = await auditAcceptance({ runDir: shipped.runDir, cloneDir: into, run });
    assert.equal(result.ok, false);
    assert.equal(result.edges.find((edge) => edge.edge === 'subject.tree')?.state, 'resolved');
    assert.equal(result.edges.find((edge) => edge.edge === 'inputs.specification')?.state, 'mismatch');
  });

  it('fails when an archived artifact the receipt names was deleted', async () => {
    const shipped = shippedRun();
    rmSync(path.join(shipped.runDir, 'review.json'));
    const result = await auditAcceptance({ runDir: shipped.runDir, cloneDir: clone(shipped.origin), run });
    assert.equal(result.ok, false);
    assert.equal(result.edges.find((edge) => edge.edge === 'results.panelDigest')?.state, 'missing');
  });

  it('fails when the shipped commit is amended, which changes the tree under the same branch', async () => {
    // The realistic accident rather than the hostile one: somebody amends after the run and pushes.
    // The receipt names a commit the clone no longer has.
    const shipped = shippedRun();
    writeFileSync(path.join(shipped.origin, 'src.js'), 'export const it = 2;\n', 'utf8');
    git(shipped.origin, ['add', '-A']);
    git(shipped.origin, ['commit', '--quiet', '--amend', '-m', 'shipped, amended']);

    const result = await auditAcceptance({ runDir: shipped.runDir, cloneDir: clone(shipped.origin), run });
    assert.equal(result.ok, false);
    assert.equal(result.edges.find((edge) => edge.edge === 'subject.tree')?.state, 'missing');
  });
});
