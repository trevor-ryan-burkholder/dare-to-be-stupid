/**
 * Tier 2 — an ERD on disk reaches the builder's brief (PLAN.md item 47, slices B and D).
 *
 * **Why this tier and not the unit one.** `compileBrief` has its own cases and the driver has a case
 * proving it passes what the effect returns — but both inject the parsed diagram. The production
 * effect is the part that finds a file by convention, reads it, parses it, and hands the result on,
 * and a mutation making that effect return `null` unconditionally left every unit case green. That
 * is the failure this repository has repaired four times in a day: a correct component with no
 * caller, or a caller nothing exercises.
 *
 * Real git, real filesystem, canned children. No network, no API call.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { main } from '../../scripts/driver.mjs';

/** @type {string[]} */
const temporaryDirs = [];
after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

const PRD = '# Orders\n\n## Requirements\n\nPRD-1.1 Customers place orders.\n';
const ERD = 'erDiagram\n    CUSTOMER ||--o{ ORDER : places\n    CUSTOMER {\n        int id PK\n        string name\n    }\n';

/** @param {string} root @param {string[]} args @returns {string} */
const git = (root, args) => execFileSync('git', args, { cwd: root, stdio: 'pipe', encoding: 'utf8' }).trim();

/**
 * @param {{ erd?: string, erdAt?: string, dod?: string, dodAt?: string, config?: Record<string, unknown> }} [options]
 * @returns {string}
 */
function repo(options = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-erd-int-'));
  temporaryDirs.push(root);
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'test']);
  writeFileSync(path.join(root, 'PRD.md'), PRD);
  if (options.erd !== undefined) {
    const at = path.join(root, options.erdAt ?? 'ERD.md');
    mkdirSync(path.dirname(at), { recursive: true });
    writeFileSync(at, options.erd);
  }
  if (options.dod !== undefined) {
    const at = path.join(root, options.dodAt ?? 'DOD.md');
    mkdirSync(path.dirname(at), { recursive: true });
    writeFileSync(at, options.dod);
  }
  writeFileSync(path.join(root, '.gitignore'), '.meeseeks/\nnode_modules/\n*.log\n');
  mkdirSync(path.join(root, '.meeseeks'), { recursive: true });
  writeFileSync(
    path.join(root, '.meeseeks', 'config.json'),
    JSON.stringify({ maxIterations: 1, tokenCeiling: 1000, costCeiling: 1, qualityPlugins: [], ...options.config }),
  );
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'prd']);
  return root;
}

/** A canned child that answers every phase plausibly and builds nothing. */
const spawn = (/** @type {{ phase: string }} */ spawned) => ({
  ok: true,
  text:
    spawned.phase === 'design'
      ? 'Designed.\n\n```json\n{"capabilities": ["cli"]}\n```\n'
      : 'built',
  costUsd: 0,
  tokens: 0,
  raw: '{}',
});

/** @param {string} root @returns {Promise<{ code: number, logs: string[] }>} */
async function run(root) {
  /** @type {string[]} */
  const logs = [];
  const code = await main(['PRD.md', '--yes'], {
    cwd: root,
    env: { ...process.env, MEESEEKS_RUNNING: undefined, MEESEEKS_STYLE: 'plain' },
    log: (/** @type {string} */ line) => logs.push(line),
    spawn: /** @type {any} */ (spawn),
  });
  return { code, logs };
}

/** @param {string} root @returns {string} */
const firstBrief = (root) => readFileSync(path.join(root, '.meeseeks', 'briefs', 'iter-001.md'), 'utf8');

/**
 * Did the run reach a builder at all?
 *
 * **The assertion a refusal actually needs.** A first draft checked only that the message appeared
 * in the log and that the exit code was non-zero — and a mutation removing the refusal left it
 * green, because the *non-blocking* report line prints the same sentence and the run then failed
 * for its own unrelated reasons. What separates "refused" from "carried on and failed later" is
 * whether a brief was ever compiled.
 *
 * @param {string} root
 * @returns {boolean}
 */
const reachedABuilder = (root) => existsSync(path.join(root, '.meeseeks', 'briefs'));

describe('an ERD on disk reaches the builder', () => {
  it('finds ERD.md by convention and renders the declared schema into the brief', async () => {
    const root = repo({ erd: ERD });
    await run(root);
    const brief = firstBrief(root);
    assert.match(brief, /## The declared schema/);
    assert.match(brief, /- CUSTOMER: int id \[PK\], string name/);
    assert.match(brief, /- CUSTOMER \(exactly-one\) identifies ORDER \(zero-or-more\): places/);
  });

  it('finds an ERD at a configured path', async () => {
    const root = repo({ erd: ERD, erdAt: 'docs/schema.md', config: { erd: 'docs/schema.md' } });
    await run(root);
    assert.match(firstBrief(root), /## The declared schema/);
  });

  it('carries no schema block when there is no ERD, which is the ordinary case', async () => {
    const root = repo({});
    await run(root);
    assert.equal(firstBrief(root).includes('## The declared schema'), false);
  });

  it('refuses the run when the ERD declares an entity the PRD never mentions', async () => {
    // The run never starts. Refusing here rather than four iterations in is the whole point of
    // checking at the door.
    const root = repo({ erd: 'erDiagram\n    CUSTOMER ||--o{ WAREHOUSE : stocks\n' });
    const { code, logs } = await run(root);
    assert.notEqual(code, 0);
    assert.match(logs.join('\n'), /declares WAREHOUSE, which the specification never mentions/);
    assert.equal(reachedABuilder(root), false, 'the run refused and then built anyway');
  });

  it('refuses the run when the ERD cannot be parsed', async () => {
    const root = repo({ erd: 'flowchart TD\n  A --> B\n' });
    const { code, logs } = await run(root);
    assert.notEqual(code, 0);
    assert.match(logs.join('\n'), /could not be read/);
    assert.equal(reachedABuilder(root), false, 'the run refused and then built anyway');
  });

  it('refuses a configured path that is not there, rather than falling back to ERD.md', async () => {
    // A typo in the config would otherwise be indistinguishable from having no ERD, and the run
    // would proceed ungated while believing it was gated.
    const root = repo({ erd: ERD, config: { erd: 'docs/schema.md' } });
    const { code, logs } = await run(root);
    assert.notEqual(code, 0);
    assert.match(logs.join('\n'), /could not be read/);
    assert.equal(reachedABuilder(root), false, 'the run refused and then built anyway');
  });
});

describe('schema-conformance arms on two facts and judges the live schema', () => {
  /** An introspection command the operator declares; the builder cannot reach config.json. */
  const introspect = (/** @type {Record<string, string[]>} */ tables) => [
    'node',
    '-e',
    `process.stdout.write(${JSON.stringify(
      JSON.stringify({ tables: Object.entries(tables).map(([name, columns]) => ({ name, columns })) }),
    )})`,
  ];

  it('does not arm without an introspection command, however good the ERD is', async () => {
    // Two facts, not one. An ERD alone declares a shape nothing can be read against.
    const root = repo({ erd: ERD });
    await run(root);
    assert.equal(firstBrief(root).includes('schema-conformance'), false);
  });

  it('does not arm without an ERD, because there is nothing to conform to', async () => {
    const root = repo({ config: { schemaIntrospect: introspect({ customers: ['id'] }) } });
    await run(root);
    assert.equal(firstBrief(root).includes('schema-conformance'), false);
  });

  it('arms when both are present, and the gate appears in the brief the builder is handed', async () => {
    // A gate the builder is judged by and never told about arrives as a bare non-zero exit from an
    // unfamiliar command - the divergence `overlayGates` exists to prevent.
    const root = repo({ erd: ERD, config: { schemaIntrospect: introspect({ customers: ['id', 'name'], orders: ['id'] }) } });
    await run(root);
    assert.match(firstBrief(root), /schema-conformance/);
  });

  it('fails the iteration when a declared table is absent from the live schema', async () => {
    const root = repo({ erd: ERD, config: { schemaIntrospect: introspect({ customers: ['id', 'name'] }) } });
    const { logs } = await run(root);
    assert.match(logs.join('\n'), /no table for ORDER/);
  });

  it('passes a surplus schema and fails an absent one, from the same declaration', async () => {
    // A contrast rather than an absence. A passing gate logs no detail — only failures do — so
    // "no complaint" alone would also be satisfied by a gate that never armed. Running the same
    // ERD against two live schemas discriminates: the surplus must be silent and the omission
    // must speak, and only a gate that actually ran can do both.
    const surplus = repo({
      erd: ERD,
      config: { schemaIntrospect: introspect({ customers: ['id', 'name', 'created_at'], orders: ['id'], migrations: ['v'] }) },
    });
    const absent = repo({ erd: ERD, config: { schemaIntrospect: introspect({ customers: ['id', 'name'] }) } });

    const surplusLogs = (await run(surplus)).logs.join('\n');
    const absentLogs = (await run(absent)).logs.join('\n');

    assert.equal(surplusLogs.includes('does not contain everything the ERD declares'), false);
    assert.match(absentLogs, /does not contain everything the ERD declares/);
    // And the gate was armed in both, so the silence above is a pass rather than an absence.
    assert.match(firstBrief(surplus), /schema-conformance/);
    assert.match(firstBrief(absent), /schema-conformance/);
  });

  it('fails when the introspection command prints nothing at exit zero', async () => {
    // The dangerous shape: a command that exits clean having read nothing is indistinguishable
    // from a clean schema by status alone.
    const root = repo({ erd: ERD, config: { schemaIntrospect: ['node', '-e', 'process.exit(0)'] } });
    const { logs } = await run(root);
    assert.match(logs.join('\n'), /evidence that nothing was read/);
  });
});

describe('the operator done-bar is additive and fails closed (item 48)', () => {
  const DOD =
    '**DOD-1** (panel-judgeable) — Errors say what to do next. Observation: a reviewer cites one that does not.\n';

  it('refuses the run when no reviewer owns a declared criterion', async () => {
    // Ownership is deliberately not defaulted. A security criterion silently handed to the
    // correctness auditor because it inherited a default is judged by the wrong reviewer, and the
    // operator would never know. The existing refusal names the id.
    const root = repo({ dod: DOD });
    const { code, logs } = await run(root);
    assert.notEqual(code, 0);
    assert.match(logs.join('\n'), /no reviewer owns DOD-1/);
  });

  it('admits a criterion an operator gave an owner, and counts it in the run', async () => {
    // The benign neighbour: the refusal is a filter, not a wall.
    const root = repo({
      dod: DOD,
      config: { ownership: { security: ['DoD-2-security'], correctness: ['PRD-*', 'DoD-1-requirements', 'DoD-6-adversarial-input', 'DOD-*'], design: ['DoD-3-ci', 'DoD-4-docs-observability', 'DoD-5-design'] } },
    });
    const { logs } = await run(root);
    assert.match(logs.join('\n'), /done-bar: DOD\.md, 1 criteria/);
    assert.equal(logs.join('\n').includes('no reviewer owns'), false);
  });

  it('refuses the run when the done-bar cannot be read', async () => {
    // A done-bar that cannot be read is not a done-bar. Treating it as "no extra criteria" would
    // ship a run the operator believes was held to a bar it never saw.
    const root = repo({ dod: '**DOD-1** (unfalsifiable) — It feels premium. Observation: none.\n' });
    const { code, logs } = await run(root);
    assert.notEqual(code, 0);
    assert.match(logs.join('\n'), /DOD-1 declares itself unfalsifiable/);
    assert.equal(existsSync(path.join(root, '.meeseeks', 'briefs')), false, 'a builder ran on an unreadable done-bar');
  });


  it('hands the criteria to the builder, or the done-bar is a file nobody reads', async () => {
    // The wiring, not the rendering. compileBrief has its own cases; this proves the criteria
    // parsed in main reach the brief a builder is actually handed.
    const root = repo({
      dod: '**DOD-1** (panel-judgeable) — Errors say what to do next. Observation: a reviewer cites one that does not.\n',
      config: { ownership: { security: ['DoD-2-security'], correctness: ['PRD-*', 'DoD-1-requirements', 'DoD-6-adversarial-input', 'DOD-*'], design: ['DoD-3-ci', 'DoD-4-docs-observability', 'DoD-5-design'] } },
    });
    await run(root);
    const brief = firstBrief(root);
    assert.match(brief, /## The operator done-bar/);
    assert.match(brief, /- DOD-1 \(panel-judgeable\): Errors say what to do next/);
    assert.match(brief, /You cannot mark them done yourself/);
  });

  it('runs normally when there is no done-bar, which is the ordinary case', async () => {
    const root = repo({});
    const { logs } = await run(root);
    assert.equal(logs.join('\n').includes('done-bar:'), false);
  });
});
