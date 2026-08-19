/**
 * Tier 3 — does a real reviewer produce the two accountability fields item 40 now requires?
 *
 * §11.1's rule: anything whose contract is owned by a different binary needs one live check, not
 * more assertions. `templates/reviewer-system.md` gained two output fields, and the failure mode of
 * getting this wrong is the expensive kind and the **silent** kind at once.
 *
 * `attackAccount` is required behind a `pass`, so if a real reviewer routinely omits it or writes
 * two words, then **every** clean iteration fails on a rule about paperwork rather than about the
 * software. No unit test can see that: the parser is correct either way, and the fixtures all supply
 * the field because a human wrote them knowing it was wanted. Only a live child can say whether the
 * instruction actually lands, and the cost of finding out in a dogfood run instead is a whole
 * iteration burned on a verdict that means nothing.
 *
 * The tree here is deliberately **correct**: the requirement is genuinely satisfied, so a `pass` is
 * the right answer and the account is the only thing standing between it and a fail. That is the
 * case worth paying for. A reviewer failing a broken tree needs no account.
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { ATTACK_ACCOUNT_MIN, parseReviewerReport, spawnClaude } from '../../scripts/driver.mjs';

const ARMED = process.env.MEESEEKS_LIVE === '1';
const LIVE_TIMEOUT = 300_000;

/** @type {string[]} */
const temporaryDirs = [];
after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** A tiny, genuinely correct implementation of one requirement. */
const SOURCE = `export function total(items) {
  if (!Array.isArray(items)) throw new TypeError('total expects an array');
  let sum = 0;
  for (const item of items) {
    if (typeof item.price !== 'number' || !Number.isFinite(item.price)) {
      throw new TypeError('every item needs a finite price');
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 0) {
      throw new RangeError('quantity must be a non-negative integer');
    }
    sum += item.price * item.quantity;
  }
  return Math.round(sum * 100) / 100;
}
`;

const SPEC = `**PRD-1.1** — \`total(items)\` returns the sum of \`price * quantity\` across every item,
rounded to two decimal places. A non-array argument throws \`TypeError\`. A non-finite price throws
\`TypeError\`. A negative or non-integer quantity throws \`RangeError\`.
`;

/** @returns {string} a repository root holding exactly that one file */
function repo() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-reviewer-contract-'));
  temporaryDirs.push(root);
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeFileSync(path.join(root, 'src', 'total.js'), SOURCE, 'utf8');
  return root;
}

describe('the reviewer output contract', { skip: ARMED ? false : 'MEESEEKS_LIVE is not set' }, () => {
  it('returns an attack account a passing report can stand on', { timeout: LIVE_TIMEOUT }, async () => {
    const root = repo();
    const template = readFileSync(new URL('../../templates/reviewer-system.md', import.meta.url), 'utf8');
    const result = await spawnClaude({
      prompt:
        `${template}\n\n---\n\nYou own exactly one requirement: \`PRD-1.1\`.\n\n` +
        `Specification:\n\n${SPEC}\n\nThe repository is your working directory. Review it.`,
      model: 'claude-sonnet-5',
      // The production role, not an adjacent one: the reviewer runs under the `review` phase's tool
      // policy, and a contract test aimed at another role proves another role's contract.
      phase: 'review',
      effort: 'high',
      cwd: root,
      env: process.env,
    });
    assert.equal(result.ok, true, result.raw.slice(0, 600));

    const report = parseReviewerReport(result.text, { requiredIds: ['PRD-1.1'] });

    // The load-bearing assertion. If a real reviewer will not write this, every clean iteration in
    // every run fails on the field rather than on the code.
    assert.equal(
      report.attackAccount.length >= ATTACK_ACCOUNT_MIN,
      true,
      `attackAccount was ${report.attackAccount.length} chars, under ${ATTACK_ACCOUNT_MIN}: ` +
        `${JSON.stringify(report.attackAccount)}`,
    );

    // `unverifiable` is shape-checked rather than demanded. Whether this particular tree gives a
    // reviewer something it cannot reach is a judgement call it is entitled to make either way;
    // what must hold is that when it uses the channel, the channel parses.
    assert.equal(Array.isArray(report.unverifiable), true);
    for (const entry of report.unverifiable) {
      assert.equal(typeof entry, 'string');
      assert.equal(entry.trim().length > 0, true);
    }

    // And the whole point: a correct tree, reviewed hostilely, still reaches a verdict rather than
    // dying on the new fields. Either answer is legitimate — a reviewer may find a real defect in
    // code I believe is correct — but it may not be blocked by the paperwork.
    const paperwork = report.problems.filter(
      (problem) => problem.includes('attackAccount') || problem.includes('unverifiable['),
    );
    assert.deepStrictEqual(paperwork, [], 'the new fields blocked a real review on their own format');
  });
});
