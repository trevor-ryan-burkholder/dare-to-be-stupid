/**
 * Tests for the assumptions log (DESIGN.md §8.3).
 *
 * The store this most resembles is the lesson store, and the failure it most resembles is the
 * one `lessons.mjs` names: a model asked "what did you assume?" will always answer, and a log
 * full of confident generalities is worse than an empty one. It is worse here than there,
 * because this one reaches the **reviewer** — the component whose starved context is the reason
 * the architecture exists.
 *
 * So the assertions are about the bar rather than the plumbing. An assumption citing nothing is
 * discarded; a malformed block fails the iteration rather than reading as an absence; and no
 * block at all is fine, because requiring one would guarantee filler on every iteration that
 * had nothing to say.
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import {
  ASSUMPTIONS_FILE,
  AssumptionsError,
  REVIEWER_CAP,
  appendAssumptions,
  parseAssumptions,
  readAssumptions,
  renderAssumptions,
} from '../scripts/assumptions.mjs';

/** @type {string[]} */
const temporaryDirs = [];

/** @returns {string} */
function makeDareDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dare-assumptions-'));
  temporaryDirs.push(dir);
  return path.join(dir, '.dare');
}

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** @param {unknown} body */
const fenced = (body) => `Changed the redirect handler.\n\n\`\`\`json\n${JSON.stringify(body)}\n\`\`\`\n`;

const GOOD = { cites: 'PRD-2.4', ambiguity: 'does not say 404 or 410', assumed: '410 Gone' };

describe('parseAssumptions', () => {
  it('reads a well-formed block', () => {
    const parsed = parseAssumptions(fenced({ assumptions: [GOOD] }));
    assert.deepEqual(parsed, { assumptions: [GOOD], discarded: 0, malformed: '' });
  });

  it('treats no block at all as no assumptions, not as a failure', () => {
    // The common case. Most iterations resolve nothing ambiguous, and requiring a block on
    // every one would guarantee filler on every one.
    assert.deepEqual(parseAssumptions('Added the admin route.'), {
      assumptions: [],
      discarded: 0,
      malformed: '',
    });
  });

  it('ignores an unrelated fenced block', () => {
    const raw = 'Changed things.\n\n```js\nconst a = 1;\n```\n';
    assert.deepEqual(parseAssumptions(raw).assumptions, []);
    assert.equal(parseAssumptions(raw).malformed, '');
  });

  it('prefers the last assumptions block, so an echoed example never wins', () => {
    const raw = `${fenced({ assumptions: [{ cites: 'PRD-1.1', assumed: 'the example' }] })}\n${fenced({
      assumptions: [GOOD],
    })}`;
    assert.deepEqual(parseAssumptions(raw).assumptions, [GOOD]);
  });

  it('discards an assumption that cites nothing, and counts it', () => {
    // The citation bar, and the whole of the design. An assumption a reader cannot check
    // against anything is an opinion arriving in the auditor's context at auditor prices.
    const parsed = parseAssumptions(fenced({ assumptions: [{ assumed: 'json, probably' }, GOOD] }));
    assert.deepEqual(parsed.assumptions, [GOOD]);
    assert.equal(parsed.discarded, 1);
  });

  it('discards an assumption whose citation is only whitespace', () => {
    const parsed = parseAssumptions(fenced({ assumptions: [{ cites: '   ', assumed: 'something' }] }));
    assert.deepEqual(parsed.assumptions, []);
    assert.equal(parsed.discarded, 1);
  });

  it('discards an assumption that assumed nothing', () => {
    // A citation with no content is the same defect wearing a citation.
    const parsed = parseAssumptions(fenced({ assumptions: [{ cites: 'PRD-1.1', assumed: '' }] }));
    assert.equal(parsed.discarded, 1);
  });

  it('keeps an assumption with no stated ambiguity, since only the citation is required', () => {
    const parsed = parseAssumptions(fenced({ assumptions: [{ cites: 'PRD-1.1', assumed: '410 Gone' }] }));
    assert.deepEqual(parsed.assumptions, [{ cites: 'PRD-1.1', ambiguity: '', assumed: '410 Gone' }]);
    assert.equal(parsed.discarded, 0);
  });

  /** @type {[string, string][]} */
  const malformed = [
    ['invalid json', '```json\n{"assumptions": [ }\n```'],
    ['an array at the top level', '```json\n["assumptions"]\n```'],
    ['assumptions that is not an array', '```json\n{"assumptions": "none"}\n```'],
    ['assumptions set to null', '```json\n{"assumptions": null}\n```'],
  ];
  for (const [label, raw] of malformed) {
    it(`fails the iteration on ${label}, rather than reading it as an absence`, () => {
      // Unparseable output is a failure everywhere else in this codebase and is one here. A
      // block that will not parse is not evidence that nothing was assumed.
      const parsed = parseAssumptions(raw);
      assert.notEqual(parsed.malformed, '');
      assert.deepEqual(parsed.assumptions, []);
    });
  }

  it('discards a non-object entry inside an otherwise valid block', () => {
    const parsed = parseAssumptions('```json\n{"assumptions": ["just a string", null]}\n```');
    assert.equal(parsed.malformed, '');
    assert.equal(parsed.discarded, 2);
  });
});

describe('the log', () => {
  it('reads an absent file as empty', () => {
    assert.deepEqual(readAssumptions(makeDareDir()).entries, []);
  });

  it('appends with the iteration each assumption was made on', () => {
    const dareDir = makeDareDir();
    appendAssumptions(dareDir, 4, [GOOD]);
    assert.deepEqual(readAssumptions(dareDir).entries, [{ iteration: 4, ...GOOD }]);
  });

  it('is append-only: an earlier entry survives a later append', () => {
    // The value of the log is that it shows what was believed at the time. Rewriting an entry
    // would turn a record into a summary.
    const dareDir = makeDareDir();
    appendAssumptions(dareDir, 1, [{ cites: 'PRD-1.1', ambiguity: '', assumed: 'first' }]);
    appendAssumptions(dareDir, 2, [{ cites: 'PRD-1.1', ambiguity: '', assumed: 'second' }]);
    assert.deepEqual(
      readAssumptions(dareDir).entries.map((entry) => entry.assumed),
      ['first', 'second'],
    );
  });

  for (const [label, body] of /** @type {[string, string][]} */ ([
    ['unparseable json', '{'],
    ['an array', '[]'],
    ['a future version', '{"version":2,"entries":[]}'],
    ['no entries array', '{"version":1}'],
  ])) {
    it(`throws on ${label} rather than silently discarding a real log`, () => {
      const dareDir = makeDareDir();
      mkdirSync(dareDir, { recursive: true });
      writeFileSync(path.join(dareDir, ASSUMPTIONS_FILE), body, 'utf8');
      assert.throws(() => readAssumptions(dareDir), AssumptionsError);
    });
  }
});

describe('renderAssumptions', () => {
  it('renders nothing at all when there is nothing to say', () => {
    // A heading with no entries under it invites a reviewer to wonder what it is missing.
    assert.equal(renderAssumptions([]), '');
  });

  it('names the iteration, the citation and what was assumed', () => {
    const rendered = renderAssumptions([{ iteration: 4, ...GOOD }]);
    assert.equal(rendered.includes('iteration 4, on PRD-2.4: assumed 410 Gone'), true);
    assert.equal(rendered.includes('does not say 404 or 410'), true);
  });

  it('tells the reviewer these do not decide the verdict', () => {
    // Advisory context, not requirements. Without this a reviewer could read an assumption as
    // a specification and fail a build for departing from it.
    const rendered = renderAssumptions([{ iteration: 1, ...GOOD }]);
    assert.equal(rendered.includes('do not decide your verdict'), true);
  });

  it('says how many it left out when the list is capped', () => {
    // Same rule as the Build Brief's caps: a list showing twenty of sixty reads exactly like
    // a list of twenty.
    const many = Array.from({ length: REVIEWER_CAP + 5 }, (_unused, index) => ({
      iteration: index + 1,
      cites: `PRD-1.${index}`,
      ambiguity: '',
      assumed: 'x',
    }));
    const rendered = renderAssumptions(many);
    assert.equal(rendered.includes('and 5 earlier assumption(s), not shown here'), true);
  });

  it('shows the most recent when capped, not the oldest', () => {
    const many = Array.from({ length: REVIEWER_CAP + 1 }, (_unused, index) => ({
      iteration: index + 1,
      cites: `PRD-1.${index}`,
      ambiguity: '',
      assumed: 'x',
    }));
    const rendered = renderAssumptions(many);
    assert.equal(rendered.includes(`iteration ${REVIEWER_CAP + 1},`), true);
    assert.equal(rendered.includes('iteration 1,'), false);
  });
});
