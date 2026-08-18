/**
 * Tests for the cold-role supply boundary (BORROWED R44, PLAN item 77).
 *
 * `AGENTS.md` insists on saying which of two things you mean. **driver-owned** is a guarantee the
 * guard hook enforces. **not supplied** is a discipline about what the Driver hands over. Panel and
 * Oracle independence rest on the second, and until now it left no machine-readable account: a
 * refactor could add a forbidden input while every template-string test stayed green, because those
 * tests check that a template renders rather than what ended up in a role's context.
 *
 * These cases are hostile in the direction that matters — every forbidden class offered to every
 * constrained role — and each has the benign neighbour that keeps the refusal from being "no".
 *
 * The boundary this proves is the deliberate prompt channel and nothing else. A reviewer with tools
 * can open any file in the candidate; F15 / item 69 owns that question, and conflating the two would
 * be writing `not supplied` as though it were `driver-owned`.
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import {
  INPUT_CLASSES,
  SUPPLY_FILE,
  appendSupplyRecord,
  ROLE_SUPPLY_POLICY,
  SupplyBoundaryError,
  classify,
  roleSupplyManifest,
} from '../scripts/role-supply.mjs';

/** @type {string[]} */
const temporaryDirs = [];

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** @param {string} text @returns {string} */
const digestOf = (text) => `sha256:${createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 32)}`;

describe('classify', () => {
  it('records the class, a recomputable digest, and a byte count — and not the bytes', () => {
    const entry = classify('brief', 'the build brief');
    assert.deepStrictEqual(entry, { class: 'brief', digest: digestOf('the build brief'), bytes: 15 });
    // The manifest describing the prompt must not be a second copy of the prompt.
    assert.equal(Object.values(entry).some((value) => String(value).includes('the build brief')), false);
  });

  it('counts bytes rather than characters, so a multi-byte prompt is measured honestly', () => {
    assert.equal(classify('brief', 'café').bytes, 5);
  });

  it('refuses a class nobody declared, because an unclassified input cannot be checked', () => {
    assert.throws(
      // @ts-expect-error deliberately offering an undeclared class
      () => classify('some-new-thing', 'x'),
      SupplyBoundaryError,
    );
  });
});

describe('roleSupplyManifest refuses what independence depends on', () => {
  /** @param {string} role @param {string} inputClass @returns {() => unknown} */
  const offering = (role, inputClass) => () =>
    roleSupplyManifest({
      role,
      supply: [
        { class: 'system-prompt', text: 'you are an auditor' },
        { class: /** @type {any} */ (inputClass), text: 'the forbidden thing' },
      ],
    });

  for (const [role, policy] of Object.entries(ROLE_SUPPLY_POLICY)) {
    for (const forbidden of policy.forbidden) {
      it(`refuses ${forbidden} for the ${role} role, before anything is spawned`, () => {
        assert.throws(offering(role, forbidden), (/** @type {unknown} */ error) => {
          assert.equal(error instanceof SupplyBoundaryError, true);
          const refusal = /** @type {SupplyBoundaryError} */ (error);
          assert.equal(refusal.role, role);
          assert.deepStrictEqual(refusal.offered, [forbidden]);
          // The refusal has to say why, or the next person to hit it removes the rule.
          assert.equal(refusal.message.includes(policy.why), true, refusal.message);
          return true;
        });
      });
    }
  }

  it('names every forbidden class offered, not just the first', () => {
    assert.throws(
      () =>
        roleSupplyManifest({
          role: 'review',
          supply: [
            { class: 'builder-log', text: 'a' },
            { class: 'oracle-cases', text: 'b' },
          ],
        }),
      (/** @type {unknown} */ error) => {
        assert.deepStrictEqual(/** @type {SupplyBoundaryError} */ (error).offered, ['builder-log', 'oracle-cases']);
        return true;
      },
    );
  });
});

describe('the allowed classes still arrive', () => {
  it('lets a cold reviewer receive its system prompt, its brief and the specification', () => {
    // Refusing everything is not independence, it is a role with nothing to judge.
    const manifest = roleSupplyManifest({
      role: 'review',
      specification: 'sha256:spec',
      supply: [
        { class: 'system-prompt', text: 'you are the correctness auditor' },
        { class: 'brief', text: 'requirements and ids' },
        { class: 'candidate-evidence', text: 'src/a.js:1' },
      ],
    });
    assert.deepStrictEqual(
      manifest.inputs.map((input) => input.class),
      ['system-prompt', 'brief', 'candidate-evidence'],
    );
    assert.equal(manifest.role, 'review');
    assert.equal(manifest.specification, 'sha256:spec');
  });

  it('lets the oracle author read the specification, which is the whole of its input', () => {
    const manifest = roleSupplyManifest({
      role: 'oracle-author',
      supply: [{ class: 'specification', text: '# PRD' }],
    });
    assert.deepStrictEqual(manifest.inputs.map((input) => input.class), ['specification']);
  });

  it('lets the builder receive its own log and history, which are not forbidden to it', () => {
    // The deny lists are per role for a reason: what poisons a cold verdict is what the builder
    // needs. A rule copied across every role would starve the one that has to act.
    const manifest = roleSupplyManifest({
      role: 'builder',
      supply: [
        { class: 'builder-log', text: 'what happened last iteration' },
        { class: 'iteration-history', text: 'three attempts' },
      ],
    });
    assert.equal(manifest.inputs.length, 2);
  });

  it('records null for a specification the invocation was not held to', () => {
    assert.equal(roleSupplyManifest({ role: 'builder', supply: [] }).specification, null);
  });

  it('leaves an unconstrained role unconstrained, rather than inventing prohibitions', () => {
    // A phase with no policy entry is not cold. Making up rules for it would be enforcing something
    // nobody stated, which is how a discipline becomes folklore.
    assert.equal(ROLE_SUPPLY_POLICY['reality-check'], undefined);
    const manifest = roleSupplyManifest({
      role: 'reality-check',
      supply: [{ class: 'builder-log', text: 'anything' }],
    });
    assert.equal(manifest.inputs.length, 1);
  });
});

describe('the policy itself', () => {
  it('forbids only classes that exist', () => {
    // A deny list naming a class nobody can supply is a rule that never fires and reads as one that
    // does — the shape of every false guarantee in this repository.
    for (const [role, policy] of Object.entries(ROLE_SUPPLY_POLICY)) {
      for (const forbidden of policy.forbidden) {
        assert.equal(INPUT_CLASSES.includes(forbidden), true, `${role} forbids the unknown class ${forbidden}`);
      }
    }
  });

  it('keeps the panel from every channel that would tell it an agent wrote the code', () => {
    // Asserted as an exact set rather than a spot check, so removing one is a test failure and not
    // a silent narrowing.
    assert.deepStrictEqual(ROLE_SUPPLY_POLICY.review.forbidden, [
      'builder-log',
      'iteration-history',
      'workflow-synthesis',
      'panel-transcript',
      'oracle-cases',
    ]);
  });

  it('keeps the oracle author away from the candidate, which is what held-out means', () => {
    assert.equal(ROLE_SUPPLY_POLICY['oracle-author'].forbidden.includes('candidate-evidence'), true);
  });

  it('gives every rule a reason worth reading', () => {
    for (const [role, policy] of Object.entries(ROLE_SUPPLY_POLICY)) {
      assert.equal(policy.why.trim().length > 30, true, `${role}'s reason is too thin to audit`);
    }
  });
});

describe('appendSupplyRecord: the record that outlives the process (PLAN item 77)', () => {
  /** @param {string} role @returns {import('../scripts/role-supply.mjs').SupplyRecord} */
  const recordFor = (role) => ({
    role,
    at: '2026-08-18T00:00:00.000Z',
    iteration: null,
    manifest: roleSupplyManifest({ role, supply: [{ class: 'brief', text: `${role}'s brief` }] }),
  });

  /** @returns {string} */
  function scratch() {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-supply-'));
    temporaryDirs.push(dir);
    return dir;
  }

  /** @param {string} dir @returns {any} */
  const store = (dir) => JSON.parse(readFileSync(path.join(dir, SUPPLY_FILE), 'utf8'));

  it('records the role, the moment and the manifest, and not the prompt', () => {
    const dir = scratch();
    appendSupplyRecord(dir, recordFor('review'));

    const written = store(dir);
    assert.equal(written.version, 1);
    assert.equal(written.entries.length, 1);
    assert.equal(written.entries[0].role, 'review');
    assert.equal(written.entries[0].iteration, null);
    assert.deepStrictEqual(
      written.entries[0].manifest.inputs.map((/** @type {{ class: string }} */ input) => input.class),
      ['brief'],
    );
    // The record describes the prompt; it must not become a second copy of it.
    assert.equal(readFileSync(path.join(dir, SUPPLY_FILE), 'utf8').includes("review's brief"), false);
  });

  it('appends rather than replacing, because a run has many invocations', () => {
    const dir = scratch();
    appendSupplyRecord(dir, recordFor('oracle-author'));
    appendSupplyRecord(dir, recordFor('builder'));
    appendSupplyRecord(dir, recordFor('review'));

    assert.deepStrictEqual(
      store(dir).entries.map((/** @type {{ role: string }} */ entry) => entry.role),
      ['oracle-author', 'builder', 'review'],
    );
  });

  it('leaves no temp file, so a reader never finds half a store', () => {
    const dir = scratch();
    appendSupplyRecord(dir, recordFor('review'));
    assert.deepStrictEqual(
      readdirSync(dir).filter((name) => name.endsWith('.tmp')),
      [],
    );
  });

  it('says so in the record when the previous store could not be read', () => {
    // **A store that quietly started over would be worse than a missing one.** A verifier counting
    // invocations cannot tell "nothing was recorded" from "nothing happened", so the discontinuity
    // is the first thing the new store says and the damaged bytes are kept under a findable name.
    const dir = scratch();
    writeFileSync(path.join(dir, SUPPLY_FILE), '{ this is not json', 'utf8');
    appendSupplyRecord(dir, recordFor('review'), { now: () => '2026-08-18T00:00:00.000Z' });

    const written = store(dir);
    assert.equal(written.entries.length, 2);
    assert.equal(
      written.entries[0].lapse,
      'the previous supply store could not be read, so this run’s record is not continuous',
    );
    assert.equal(written.entries[1].role, 'review');
    // The damaged bytes are still on disk, under the name the lapse points at.
    assert.equal(existsSync(written.entries[0].movedTo), true, written.entries[0].movedTo);
    assert.equal(readFileSync(written.entries[0].movedTo, 'utf8'), '{ this is not json');
  });

  it('treats a store from a schema it does not know the same way', () => {
    // Parseable is not the same as interpretable. Appending to entries whose fields mean something
    // else would produce a record that reads as continuous and is not.
    const dir = scratch();
    writeFileSync(path.join(dir, SUPPLY_FILE), JSON.stringify({ version: 99, entries: [{ role: 'review' }] }), 'utf8');
    appendSupplyRecord(dir, recordFor('review'));

    const written = store(dir);
    assert.equal(written.version, 1);
    assert.equal(typeof written.entries[0].lapse, 'string');
    assert.equal(written.entries.length, 2);
  });

  it('does not report a lapse for a store it can read, which is the ordinary case', () => {
    // The neighbour. Reporting discontinuity on every append would make the signal worthless.
    const dir = scratch();
    appendSupplyRecord(dir, recordFor('builder'));
    appendSupplyRecord(dir, recordFor('review'));

    for (const entry of store(dir).entries) assert.equal('lapse' in entry, false, JSON.stringify(entry));
  });
});
