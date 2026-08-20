/**
 * Tier 2 — the supply boundary as the real loop actually threads it (PLAN item 77, BORROWED R44).
 *
 * **The half that unit tests cannot hold, and it is the half that was missing.** `test/role-supply
 * .test.mjs` proves the policy refuses every forbidden class for every constrained role, and
 * `test/driver.test.mjs` proves `spawnClaude` refuses before spawning. Both were green while three
 * of the four constrained roles declared **nothing at all** — their rules enforced only if a caller
 * opted in, which is the guard-hook shape this repository keeps paying for: correct logic that
 * nothing proved was invoked.
 *
 * So this drives the real `main` with canned children and asks the durable record what each role was
 * given. It is the same question item 76's acceptance receipt will ask, from the same file.
 *
 * Real git, canned children. No network, no API call.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { main } from '../../scripts/driver.mjs';
import { ROLE_SUPPLY_POLICY, SUPPLY_FILE } from '../../scripts/role-supply.mjs';

/** @type {string[]} */
const temporaryDirs = [];

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

const PRD = '# Thing\n\n## Requirements\n\nPRD-1.1 It exists.\n';

/** One real case, so the Oracle author's output is accepted and the run continues past it. */
const ORACLE_CASES = '```json\n' + JSON.stringify([{ id: 'O-1', argv: ['--version'], expectExit: 0 }]) + '\n```';

/** @param {string} root @param {string[]} args @returns {string} */
function git(root, args) {
  return execFileSync('git', args, { cwd: root, stdio: 'pipe', encoding: 'utf8' }).trim();
}

/** @returns {string} */
function repo() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-supply-int-'));
  temporaryDirs.push(root);
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'test']);
  writeFileSync(path.join(root, 'PRD.md'), PRD);
  writeFileSync(path.join(root, '.gitignore'), '.meeseeks/\nnode_modules/\n*.log\n');
  mkdirSync(path.join(root, '.meeseeks'), { recursive: true });
  writeFileSync(
    path.join(root, '.meeseeks', 'config.json'),
        // The Oracle author is off by default and is one of the roles whose supply was never declared,
    // so it is armed here on purpose rather than left to the default shape.
    JSON.stringify({ maxIterations: 1, tokenCeiling: 1000, costCeiling: 1, qualityPlugins: [], oracle: { enabled: true } }),
  );
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'prd']);
  return root;
}

/** @param {string} root @returns {Promise<{ code: number, phases: string[] }>} */
async function run(root) {
  /** @type {string[]} */
  const phases = [];
  const code = await main(['PRD.md', '--yes'], {
    cwd: root,
    env: { ...process.env, MEESEEKS_RUNNING: undefined, MEESEEKS_STYLE: 'plain' },
    log: () => {},
    spawn: /** @type {any} */ ((/** @type {{ phase: string }} */ spawned) => {
      phases.push(spawned.phase);
      const text =
        spawned.phase === 'design'
          ? 'Designed.\n\n```json\n{"capabilities": ["cli"]}\n```\n'
          : spawned.phase === 'review'
            ? JSON.stringify({ requirements: [{ id: 'PRD-1.1', status: 'pass', evidence: 'PRD.md:1', detail: 'ok' }] , attackAccount: 'Called the handler directly to bypass the role check, replayed an expired session cookie, and sent a negative quantity to the order endpoint. All three were rejected.' })
            : spawned.phase === 'oracle-author'
              ? ORACLE_CASES
              : 'built';
      return { ok: true, text, costUsd: 0, tokens: 0, raw: '{}' };
    }),
  });
  return { code, phases };
}

/** @param {string} root @returns {any[]} */
function supply(root) {
  const file = path.join(root, '.meeseeks', SUPPLY_FILE);
  assert.equal(existsSync(file), true, 'the run recorded nothing about what any role was handed');
  return JSON.parse(readFileSync(file, 'utf8')).entries;
}

describe('every constrained role declares what it was handed', () => {
  it('records a manifest for each cold role the run actually invoked', async () => {
    const root = repo();
    const { phases } = await run(root);
    const entries = supply(root);
    const declared = new Set(entries.map((entry) => entry.role));

    // Asserted against the *policy table* rather than a list written here, so adding a constrained
    // role adds its obligation automatically instead of leaving it silently unthreaded — which is
    // exactly how three of the four came to be inert.
    for (const role of Object.keys(ROLE_SUPPLY_POLICY)) {
      if (!phases.includes(role)) continue;
      assert.equal(declared.has(role), true, `the ${role} role ran and declared nothing: ${[...declared].join(', ')}`);
    }
    // And the run really did invoke more than one of them, or the loop above proves nothing.
    assert.equal(declared.size >= 2, true, `only ${[...declared].join(', ')} declared anything`);
  });

  it('records the classes each role received, and no class its policy forbids', async () => {
    const root = repo();
    await run(root);

    for (const entry of supply(root)) {
      const policy = ROLE_SUPPLY_POLICY[entry.role];
      if (policy === undefined) continue;
      const classes = entry.manifest.inputs.map((/** @type {{ class: string }} */ input) => input.class);
      assert.equal(classes.length > 0, true, `${entry.role} declared an empty supply`);
      for (const forbidden of policy.forbidden) {
        assert.equal(classes.includes(forbidden), false, `${entry.role} was handed ${forbidden}`);
      }
    }
  });

  it('describes the prompts without repeating them', async () => {
    // The manifest is a record *about* the prompt. Storing the bytes again would make the artifact
    // a second copy of every reviewer brief and builder instruction in the run.
    const root = repo();
    await run(root);
    const raw = readFileSync(path.join(root, '.meeseeks', SUPPLY_FILE), 'utf8');

    assert.equal(raw.includes('PRD-1.1 It exists.'), false, 'the specification was copied into the record');
    for (const entry of supply(root).filter((record) => record.manifest !== null)) {
      for (const input of entry.manifest.inputs) {
        assert.match(input.digest, /^sha256:[0-9a-f]{32}$/);
        assert.equal(typeof input.bytes, 'number');
        assert.equal(input.bytes > 0, true);
        assert.equal('text' in input, false, 'the manifest stored the prompt it was describing');
      }
    }
  });

  it('binds each invocation to the specification revision it was held to', async () => {
    // Item 76 needs this edge: a model identity attached to a prompt says nothing unless the record
    // also says which document that invocation was judged against.
    const root = repo();
    await run(root);
    for (const entry of supply(root).filter((record) => record.manifest !== null)) {
      assert.match(entry.manifest.specification, /^sha256:[0-9a-f]{32,}$/, `${entry.role} recorded no specification`);
    }
  });

  it('records a role that declared no supply, with a null manifest rather than no entry', async () => {
    // **The store's scope widened at 0.210.0** (REVIEW F22, item 112). It began as a record of what
    // *cold* roles were handed; the acceptance receipt needs what every role was *asked of* and what
    // actually served it, so a phase with no declared supply is recorded with `manifest: null`
    // instead of being left out. An invocation missing from the ledger is indistinguishable from one
    // that never happened, and the receipt reads this store back as its list of invocations.
    const root = repo();
    const { phases } = await run(root);
    const recorded = supply(root);

    // `design` declares no supply, and it certainly ran.
    assert.equal(phases.includes('design'), true, phases.join(', '));
    const design = recorded.find((entry) => entry.role === 'design');
    assert.notEqual(design, undefined, `design was not recorded: ${recorded.map((e) => e.role).join(', ')}`);
    assert.equal(design.manifest, null, 'a role with no declared supply invented one');

    // And every entry, declaring or not, carries the model identity the receipt needs.
    for (const entry of recorded) {
      assert.equal(typeof entry.requestedModel, 'string');
      assert.equal(entry.requestedModel.length > 0, true, `${entry.role} recorded no requested model`);
      const tagged = Array.isArray(entry.models?.observed) || typeof entry.models?.unavailable === 'string';
      assert.equal(tagged, true, `${entry.role} recorded an untagged observation`);
    }
  });

  it('archives the previous run’s record rather than appending this run’s to it', async () => {
    // Per-run by construction: nothing resets the store, so a second run would otherwise append its
    // invocations beside the first's with no way to tell them apart — the fault `assumptions.json`
    // is on the archive list for.
    const root = repo();
    await run(root);
    const first = supply(root).length;
    assert.equal(first > 0, true);

    await run(root);
    const second = supply(root);
    assert.equal(second.length, first, `the second run appended to the first run’s record: ${second.length}`);

    const archives = path.join(root, '.meeseeks', 'runs');
    const preserved = readdirSync(archives)
      .map((slot) => path.join(archives, slot, SUPPLY_FILE))
      .filter((file) => existsSync(file));
    assert.equal(preserved.length > 0, true, 'the first run’s supply record was destroyed rather than archived');
  });
});
