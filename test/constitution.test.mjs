/**
 * `CONSTITUTION.md` is held to its own terms (PLAN.md item 51).
 *
 * **This test is the reason the file was allowed to exist.** The item that proposed it refused the
 * version without a gate in its own words — *"a fourth ungated ledger is rot with a better name"* —
 * and the repository's evidence is on that side: the `HANDOFF.md` header went stale by fourteen
 * versions, then by three more directly beneath the warning about it, and what fixed it was not
 * discipline but `release-check`.
 *
 * The load-bearing assertion is that every article names an enforcing **code site or test that
 * actually exists**. An invariant with no enforcement is a wish, and a citation that does not
 * resolve is worse than none: it reads as proof to anyone who does not go and look. This is the
 * shape of check that would have caught the guard-registration hole, where the guard's *logic* was
 * tested and green for eleven versions while nothing asserted its *invocation*.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CONSTITUTION = readFileSync(path.join(ROOT, 'CONSTITUTION.md'), 'utf8');
const CLAUDE_MD = readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');

/** Every article, in file order. */
const ARTICLES = [...CONSTITUTION.matchAll(/^## (CONST-(\d+)) — (.+)$/gm)].map((match) => ({
  id: match[1],
  number: Number(match[2]),
  title: match[3],
  index: match.index ?? 0,
}));

/**
 * The body of one article: everything up to the next article heading.
 *
 * @param {{ index: number }} article
 * @returns {string}
 */
function bodyOf(article) {
  const next = ARTICLES.find((other) => other.index > article.index);
  return CONSTITUTION.slice(article.index, next === undefined ? CONSTITUTION.length : next.index);
}

describe('CONSTITUTION.md is numbered and complete', () => {
  it('carries the thirteen articles that were law before it existed', () => {
    // The move must not have lost or invented one. Thirteen is the count `CLAUDE.md` carried.
    assert.equal(ARTICLES.length, 13);
  });

  it('numbers them consecutively from 1, because a citation has to be unambiguous', () => {
    assert.deepStrictEqual(
      ARTICLES.map((article) => article.number),
      Array.from({ length: 13 }, (_, index) => index + 1),
    );
  });

  it('gives every article a title and a body', () => {
    for (const article of ARTICLES) {
      assert.equal(article.title.trim().length > 0, true, `${article.id} has no title`);
      const body = bodyOf(article).replace(/^## .*$/m, '').replace(/\*\*Enforced by:\*\*.*/s, '').trim();
      assert.equal(body.length > 40, true, `${article.id} states no law, only a heading`);
    }
  });
});

describe('every article names enforcement that exists', () => {
  for (const article of ARTICLES) {
    it(`${article.id} cites a code site or test that resolves`, () => {
      const body = bodyOf(article);
      const line = /\*\*Enforced by:\*\* (.+)/.exec(body);
      assert.notEqual(line, null, `${article.id} names nothing that enforces it. An invariant with no enforcement is a wish.`);
      const cited = [...(line?.[1] ?? '').matchAll(/`([^`]+)`/g)].map((match) => match[1]);
      assert.equal(cited.length > 0, true, `${article.id} has an empty "Enforced by" line`);

      for (const target of cited) {
        assert.equal(
          existsSync(path.join(ROOT, target)),
          true,
          `${article.id} cites ${target}, which does not exist. A citation that does not resolve reads as ` +
            'proof to anyone who does not go and look.',
        );
      }
      // At least one must be executable. A law enforced only by another document is decoration —
      // `prd-author.md`'s own word for what an auditor cannot check.
      assert.equal(
        cited.some((target) => target.endsWith('.mjs')),
        true,
        `${article.id} is enforced only by documents, which is not enforcement`,
      );
    });
  }
});

describe('the law lives in one place', () => {
  it('leaves CLAUDE.md pointing here rather than restating', () => {
    // Three copies of a law is worse than one: the divergent copy is indistinguishable from the
    // true one, and nothing tells a reader which they are holding.
    assert.match(CLAUDE_MD, /`CONSTITUTION\.md` is the single source/);
    assert.match(CLAUDE_MD, /a change that breaks one is wrong even if\ntests pass/);
  });

  it('keeps the pointer free of the restatement it replaced', () => {
    // The failure mode this guards is the one the item predicted: the section is left in place "for
    // convenience", drifts one edit at a time, and the copy nobody updated is the one somebody
    // reads. Two of the most-cited articles are checked by their exact wording.
    const pointer = CLAUDE_MD.slice(
      CLAUDE_MD.indexOf('## Invariants — do not violate these'),
      CLAUDE_MD.indexOf('## Test gates'),
    );
    assert.equal(pointer.length > 0, true, 'the invariants section is gone entirely, so nothing points anywhere');
    assert.equal(
      pointer.includes('A test ID that has ever passed may never be allowed to fail'),
      false,
      'CLAUDE.md restates CONST-1 instead of pointing at it',
    );
    assert.equal(
      pointer.includes('Review happens in a _separate_'),
      false,
      'CLAUDE.md restates CONST-2 instead of pointing at it',
    );
  });
});
