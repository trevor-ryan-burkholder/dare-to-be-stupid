/**
 * Tier 2 — a run cannot be judged against a specification that moved (REVIEW F12, DESIGN.md §4).
 *
 * The unit suite proves the digest and the comparison. What it cannot prove is that the check sits
 * where it has to sit inside the real `main`: after the PRD is captured, before any gate result,
 * ratchet credit or panel verdict is attributed to the tree. Codex's reproduction is a *Builder*
 * edit, so the honest reproduction is a Builder child that makes one, driven through the real
 * driver against real git.
 *
 * The children are canned, so this costs nothing.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { main } from '../../scripts/driver.mjs';
import { SPECIFICATION_FILE, specificationDigest } from '../../scripts/specification.mjs';

/** @type {string[]} */
const temporaryDirs = [];

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

const PRD = '# Thing\n\n## Requirements\n\nPRD-1.1 Admin routes reject a non-admin session.\n';

/** @param {string} root @param {string[]} args @returns {string} */
function git(root, args) {
  return execFileSync('git', args, { cwd: root, stdio: 'pipe', encoding: 'utf8' }).trim();
}

/** @returns {string} */
function repo() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-spec-int-'));
  temporaryDirs.push(root);
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'test']);
  writeFileSync(path.join(root, 'PRD.md'), PRD);
  writeFileSync(path.join(root, '.gitignore'), '.meeseeks/\nnode_modules/\n*.log\n');
  mkdirSync(path.join(root, '.meeseeks'), { recursive: true });
  writeFileSync(
    path.join(root, '.meeseeks', 'config.json'),
    JSON.stringify({ maxIterations: 1, tokenCeiling: 1000, costCeiling: 1, qualityPlugins: [] }),
  );
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'prd']);
  return root;
}

/**
 * @typedef {{ phases: string[], onBuild?: (cwd: string) => void,
 *   prompts?: Record<string, string[]>, onPhase?: (phase: string, cwd: string) => void }} Record_
 */

/**
 * @param {Record_} record
 * @returns {any}
 */
function cannedSpawn(record) {
  return (/** @type {{ phase: string, cwd: string, prompt: string, systemPrompt?: string }} */ options) => {
    record.phases.push(options.phase);
    if (record.prompts !== undefined) {
      (record.prompts[options.phase] ??= []).push(`${options.systemPrompt ?? ''}\n${options.prompt}`);
    }
    if (options.phase === 'builder' && record.onBuild !== undefined) record.onBuild(options.cwd);
    if (record.onPhase !== undefined) record.onPhase(options.phase, options.cwd);
    const text =
      options.phase === 'design'
        ? 'Designed.\n\n```json\n{"capabilities": ["cli"]}\n```\n'
        : options.phase === 'review'
          ? JSON.stringify({ requirements: [{ id: 'PRD-1.1', status: 'pass', evidence: 'PRD.md:1', detail: 'ok' }] , attackAccount: 'Called the handler directly to bypass the role check, replayed an expired session cookie, and sent a negative quantity to the order endpoint. All three were rejected.' })
          : 'built';
    return { ok: true, text, costUsd: 0, tokens: 0, raw: '{}' };
  };
}

/**
 * @param {string} root
 * @param {Record_} record
 * @param {string[]} logs
 * @returns {Promise<number>}
 */
function run(root, record, logs) {
  return main(['PRD.md', '--yes'], {
    cwd: root,
    env: { ...process.env, MEESEEKS_RUNNING: undefined, MEESEEKS_STYLE: 'plain' },
    log: (/** @type {string} */ line) => logs.push(line),
    spawn: cannedSpawn(record),
  });
}

describe('the driver captures the specification it was started against', () => {
  it('records the digest of the committed PRD before any role reads it', async () => {
    const root = repo();
    /** @type {string[]} */
    const logs = [];
    /** @type {Record_} */
    const record = { phases: [] };
    await run(root, record, logs);
    const revision = JSON.parse(readFileSync(path.join(root, '.meeseeks', SPECIFICATION_FILE), 'utf8'));
    assert.equal(revision.file, 'PRD.md');
    assert.equal(revision.digest, specificationDigest(PRD));
    assert.equal(
      logs.some((line) => line.startsWith('specification: PRD.md at sha256:')),
      true,
      logs.join('\n').slice(-600),
    );
  });
});

describe('a builder that moves the finish line ends the run', () => {
  it('refuses a same-id text mutation before any gate or panel sees the tree', async () => {
    // The reproduction. Every requirement id survives; the requirement does not.
    const root = repo();
    /** @type {string[]} */
    const logs = [];
    /** @type {Record_} */
    const record = {
      phases: [],
      onBuild: (/** @type {string} */ cwd) => {
        writeFileSync(path.join(cwd, 'PRD.md'), '# Thing\n\n## Requirements\n\nPRD-1.1 Admin routes exist.\n');
      },
    };
    const code = await run(root, record, logs);

    const all = logs.join('\n');
    assert.equal(code, 1);
    assert.equal(all.includes('has changed since this run captured it'), true, all.slice(-900));
    assert.equal(all.includes('start a new run'), true, 'the refusal did not say what to do about it');
    assert.equal(record.phases.includes('review'), false, 'a panel was paid for on a moved finish line');
    // And the drift is not quietly repaired: the mutated file is the operator's to look at.
    assert.equal(readFileSync(path.join(root, 'PRD.md'), 'utf8').includes('Admin routes exist'), true);
  });

  it('refuses a specification the builder deleted', async () => {
    const root = repo();
    /** @type {string[]} */
    const logs = [];
    /** @type {Record_} */
    const record = {
      phases: [],
      onBuild: (/** @type {string} */ cwd) => rmSync(path.join(cwd, 'PRD.md')),
    };
    const code = await run(root, record, logs);
    assert.equal(code, 1);
    assert.equal(logs.join('\n').includes('can no longer be read'), true, logs.join('\n').slice(-900));
  });

  // The benign neighbour, and F12's second acceptance line: only the authoritative specification is
  // bound. A builder that writes documentation, source, or anything else must reach its gates.
  it('lets a builder edit everything that is not the specification', async () => {
    const root = repo();
    /** @type {string[]} */
    const logs = [];
    /** @type {Record_} */
    const record = {
      phases: [],
      onBuild: (/** @type {string} */ cwd) => {
        writeFileSync(path.join(cwd, 'README.md'), '# Docs\n\nRewritten entirely by the builder.\n');
        mkdirSync(path.join(cwd, 'src'), { recursive: true });
        writeFileSync(path.join(cwd, 'src', 'app.mjs'), 'export const admin = () => 403;\n');
      },
    };
    await run(root, record, logs);
    const all = logs.join('\n');
    assert.equal(all.includes('has changed since this run captured it'), false, all.slice(-900));
    assert.equal(record.phases.includes('builder'), true, 'the run never reached a builder');
    // It got past the drift check and on to the ordinary business of the loop.
    assert.equal(all.includes('gates') || all.includes('run ended'), true, all.slice(-600));
  });
});

describe('the transient window the before/after check cannot see (REVIEW F12, reopened)', () => {
  const EASIER = '# Thing\n\n## Requirements\n\nPRD-1.1 Admin routes exist.\n';

  it('completes without noticing a substitution that was reverted before the next check', () => {
    // **This is the reproduction, and it is deliberately a demonstration of the hole rather than of
    // the repair.** Codex reopened F12 on exactly this: replace canonical A with an easier B while a
    // role reads it, restore A before the next sampling, and the digest comparison — which is a
    // comparison of two samples — sees nothing. Every case above leaves the mutation *present*,
    // which is why they all passed against a live defect.
    //
    // So this pins what the before/after check is and is not. It is a closure of persistent
    // replacement. It is not, and cannot be, a defence against a document that is correct whenever
    // anyone looks. That defence is delivery: the panel and the circuit-breaker receive the bytes,
    // proved in `test/driver.test.mjs` against the exported prompt builders, because reaching a
    // panel with canned children needs injected gate results and would assert against a fixture.
    return (async () => {
      const root = repo();
      /** @type {string[]} */
      const logs = [];
      /** @type {Record_} */
      const record = {
        phases: [],
        prompts: {},
        onPhase: (phase, cwd) => {
          // Present for the whole of the builder call and gone again the instant it returns.
          if (phase !== 'builder') return;
          writeFileSync(path.join(cwd, 'PRD.md'), EASIER);
        },
        onBuild: () => {},
      };
      // The revert, run after every child, so no later sampling ever sees the substitution.
      const originalOnPhase = record.onPhase;
      record.onPhase = (phase, cwd) => {
        originalOnPhase?.(phase, cwd);
        if (phase === 'builder') writeFileSync(path.join(cwd, 'PRD.md'), PRD);
      };

      await run(root, record, logs);

      const all = logs.join('\n');
      assert.equal(all.includes('has changed since this run captured it'), false, all.slice(-900));
      assert.equal(readFileSync(path.join(root, 'PRD.md'), 'utf8'), PRD, 'the fixture left the substitution behind');
      // The captured revision is still the canonical one, which is what makes the window invisible:
      // the record and the working copy agree at every moment anything compared them.
      const revision = JSON.parse(readFileSync(path.join(root, '.meeseeks', SPECIFICATION_FILE), 'utf8'));
      assert.equal(revision.digest, specificationDigest(PRD));
      assert.equal(record.phases.includes('builder'), true, 'the run never reached a builder');
    })();
  });
});
