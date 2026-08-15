/**
 * Tests for the pinned security elements and pinned requirements (DESIGN.md §4.3).
 *
 * Two monotonic properties sharing one mechanism, and the assertions divide the same way the
 * design does. For a **security** pin the danger is a false positive: a formatter run must not
 * become a hard reset plus a regression objective the builder cannot satisfy, because under
 * monotonicity a false pin is unremovable and the run cannot terminate. For a **requirement**
 * pin the danger is the opposite: a carried pass is a review that did not happen, so anything
 * short of certainty must unpin, and an unresolvable evidence target must fail outright.
 *
 * The third property is the one that keeps quarantine honest. Quarantine is not a pass — it is
 * a recorded loss of protection — and the only thing making that true rather than rhetorical is
 * that a quarantined element blocks `SHIPPED`.
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import {
  retractPin,
  PINS_FILE,
  PinsError,
  emptyPins,
  fingerprint,
  normaliseSnippet,
  parseEvidence,
  parseSecurityEscalation,
  pinRequirement,
  pinSecurityElement,
  quarantinePin,
  readPins,
  repinSecurityElement,
  shippingBlockers,
  verifyRequirementPin,
  verifySecurityPin,
  writePins,
} from '../scripts/pins.mjs';

/** @type {string[]} */
const temporaryDirs = [];

/** @returns {string} */
function makeMeeseeksDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-pins-'));
  temporaryDirs.push(dir);
  return path.join(dir, '.meeseeks');
}

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** @param {Record<string, string>} files */
const sourceReader = (files) => (/** @type {string} */ file) => files[file] ?? null;

const GUARD = 'if (session.role !== "admin") return res.status(403).end();';

/** @returns {import('../scripts/pins.mjs').SecurityPin} */
const guardPin = () =>
  pinSecurityElement({ id: 'DoD-2-security', evidence: 'src/api/admin.ts:41', snippet: GUARD, iteration: 3 });

describe('normaliseSnippet', () => {
  it('collapses whitespace so reformatting does not read as removal', () => {
    assert.equal(normaliseSnippet('  if (a)\n    return b;  '), 'if (a) return b;');
  });

  it('does not see through a renamed variable, because that is an edit and not a reformat', () => {
    // A normaliser clever enough to ignore this would also ignore the guard being replaced
    // with a different guard, which is exactly the degradation being watched for.
    assert.notEqual(normaliseSnippet('if (session.role)'), normaliseSnippet('if (user.role)'));
  });

  it('does not see through a flipped comparison', () => {
    assert.notEqual(normaliseSnippet('a !== b'), normaliseSnippet('a === b'));
  });
});

describe('parseEvidence', () => {
  it('splits a file:line location', () => {
    assert.deepEqual(parseEvidence('src/api/admin.ts:41'), { file: 'src/api/admin.ts', line: 41 });
  });

  it('keeps a windows-style path intact rather than splitting on the drive colon', () => {
    assert.deepEqual(parseEvidence('C:/repo/src/a.ts:7'), { file: 'C:/repo/src/a.ts', line: 7 });
  });

  for (const bad of ['src/api/admin.ts', 'src/api/admin.ts:', 'probably somewhere in admin.ts', ':41', '']) {
    it(`refuses ${JSON.stringify(bad)} rather than creating an unverifiable pin`, () => {
      // A pin whose location cannot be parsed can never re-verify, and under monotonicity a
      // pin that can never re-verify is a permanent, unsatisfiable regression.
      assert.throws(() => parseEvidence(bad), PinsError);
    });
  }
});

describe('pinSecurityElement', () => {
  it('records the location, the normalised snippet and its fingerprint', () => {
    const pin = guardPin();
    assert.equal(pin.file, 'src/api/admin.ts');
    assert.equal(pin.line, 41);
    assert.equal(pin.snippet, GUARD);
    assert.equal(pin.fingerprint, fingerprint(GUARD));
    assert.equal(pin.status, 'active');
    assert.equal(pin.pinnedAt, 3);
  });

  it('refuses to pin an empty line', () => {
    // A pin matching the empty string matches everything or nothing depending on the search,
    // and either way it is a claim about no code at all.
    assert.throws(
      () => pinSecurityElement({ id: 'DoD-2-security', evidence: 'src/a.ts:1', snippet: '   \n ', iteration: 1 }),
      PinsError,
    );
  });
});

describe('verifySecurityPin', () => {
  it('finds a guard that has not moved', () => {
    const files = { 'src/api/admin.ts': `const a = 1;\n${GUARD}\n` };
    assert.equal(verifySecurityPin(guardPin(), sourceReader(files)), 'present');
  });

  it('finds a guard that moved down the file, without a reviewer call', () => {
    // The whole economic argument. Re-verification runs every iteration and must be free in
    // the common case, which includes code moving around above it.
    const files = { 'src/api/admin.ts': `${'\n'.repeat(80)}${GUARD}\n` };
    assert.equal(verifySecurityPin(guardPin(), sourceReader(files)), 'present');
  });

  it('finds a guard that was only reindented or re-wrapped', () => {
    // The false positive this design exists to avoid: a prettier pass must not cost a hard
    // reset plus a regression objective describing something that was never removed.
    const files = { 'src/api/admin.ts': '    if (session.role !== "admin")\n      return res.status(403).end();\n' };
    assert.equal(verifySecurityPin(guardPin(), sourceReader(files)), 'present');
  });

  it('is ambiguous when the guard is gone', () => {
    assert.equal(verifySecurityPin(guardPin(), sourceReader({ 'src/api/admin.ts': 'const a = 1;\n' })), 'ambiguous');
  });

  it('is ambiguous when the file is gone, rather than calling it removed', () => {
    // A file that vanished may have been renamed. This check cannot tell, and the point of
    // the design is that it does not have to — it escalates rather than guessing.
    assert.equal(verifySecurityPin(guardPin(), sourceReader({})), 'ambiguous');
  });

  it('never answers "removed", because it cannot know that', () => {
    const answers = new Set([
      verifySecurityPin(guardPin(), sourceReader({ 'src/api/admin.ts': GUARD })),
      verifySecurityPin(guardPin(), sourceReader({})),
    ]);
    assert.deepEqual([...answers].sort(), ['ambiguous', 'present']);
  });

  it('stops re-verifying a quarantined element', () => {
    // Quarantine means "recorded as lost track of". Continuing to re-check it would escalate
    // to a paid reviewer call every iteration for an answer already known to be unavailable.
    const pin = quarantinePin(guardPin(), 'could not determine whether the guard moved');
    assert.equal(verifySecurityPin(pin, sourceReader({})), 'present');
  });
});

describe('repinSecurityElement', () => {
  it('moves the pin to the new location and re-fingerprints it', () => {
    const moved = repinSecurityElement(guardPin(), {
      evidence: 'src/middleware/auth.ts:12',
      snippet: GUARD,
      iteration: 9,
    });
    assert.equal(moved.id, 'DoD-2-security');
    assert.equal(moved.file, 'src/middleware/auth.ts');
    assert.equal(moved.line, 12);
    assert.equal(moved.pinnedAt, 9);
    assert.equal(moved.status, 'active');
  });

  it('verifies at the new location and no longer at the old one', () => {
    const moved = repinSecurityElement(guardPin(), {
      evidence: 'src/middleware/auth.ts:12',
      snippet: GUARD,
      iteration: 9,
    });
    assert.equal(verifySecurityPin(moved, sourceReader({ 'src/middleware/auth.ts': GUARD })), 'present');
    assert.equal(verifySecurityPin(moved, sourceReader({ 'src/api/admin.ts': GUARD })), 'ambiguous');
  });
});

describe('quarantinePin and shippingBlockers', () => {
  it('refuses to quarantine without a reason', () => {
    // An unexplained gap is not a record, and the operator this is surfaced to has to be able
    // to act on it.
    assert.throws(() => quarantinePin(guardPin(), '   '), PinsError);
  });

  it('reports nothing to block on when every pin is active', () => {
    assert.deepEqual(shippingBlockers({ ...emptyPins(), security: [guardPin()] }), []);
  });

  it('blocks shipping while an element is quarantined, and says which and why', () => {
    // This is the only thing that makes "quarantine is not a pass" true rather than a slogan.
    // Without it, a run absorbs dropped protection silently, which is the exact failure the
    // whole item exists to prevent.
    const pins = { ...emptyPins(), security: [quarantinePin(guardPin(), 'reviewer could not tell')] };
    assert.deepEqual(shippingBlockers(pins), [
      'DoD-2-security at src/api/admin.ts:41 is quarantined: reviewer could not tell',
    ]);
  });

  it('sorts blockers, so two identical states read identically', () => {
    const other = pinSecurityElement({ id: 'DoD-2-a', evidence: 'src/b.ts:1', snippet: 'x', iteration: 1 });
    const pins = {
      ...emptyPins(),
      security: [quarantinePin(guardPin(), 'r1'), quarantinePin(other, 'r2')],
    };
    assert.deepEqual(
      shippingBlockers(pins).map((line) => line.split(' ')[0]),
      ['DoD-2-a', 'DoD-2-security'],
    );
  });
});

describe('verifyRequirementPin', () => {
  const pin = () =>
    pinRequirement({ id: 'PRD-3.2', evidence: 'src/api/admin.ts:41', contents: 'const a = 1;\n', iteration: 4 });

  it('carries a pass while the evidenced file is byte-identical', () => {
    assert.equal(verifyRequirementPin(pin(), sourceReader({ 'src/api/admin.ts': 'const a = 1;\n' })), 'carry');
  });

  it('unpins on any change to the evidenced file, including an unrelated one', () => {
    // Deliberately eager. A carried pass is a review that did not happen, so the cheap
    // mistake is re-reviewing something that was fine and the expensive one is carrying a
    // pass over code the reviewer never saw.
    assert.equal(
      verifyRequirementPin(pin(), sourceReader({ 'src/api/admin.ts': 'const a = 1;\n// a comment\n' })),
      'unpin',
    );
  });

  it('fails, rather than carrying, when the evidenced file is gone', () => {
    // The pass was granted because something was at that path. Nothing being there now is the
    // strongest possible reason to stop trusting it, not a reason to shrug.
    assert.equal(verifyRequirementPin(pin(), sourceReader({})), 'fail');
  });

  it('never carries on anything but an exact match', () => {
    const answers = ['const a = 1;\n', 'const a = 1;', 'const a = 2;\n'].map((body) =>
      verifyRequirementPin(pin(), sourceReader({ 'src/api/admin.ts': body })),
    );
    assert.deepEqual(answers, ['carry', 'unpin', 'unpin']);
  });
});

describe('the pin store', () => {
  it('reads an absent file as no pins, since a first run has none', () => {
    assert.deepEqual(readPins(makeMeeseeksDir()), emptyPins());
  });

  it('round-trips what was written', () => {
    const meeseeksDir = makeMeeseeksDir();
    const pins = {
      ...emptyPins(),
      security: [guardPin()],
      requirements: [pinRequirement({ id: 'PRD-1.1', evidence: 'src/a.ts:2', contents: 'x', iteration: 1 })],
    };
    writePins(meeseeksDir, pins);
    const read = readPins(meeseeksDir);
    assert.equal(read.security[0].snippet, GUARD);
    assert.equal(read.requirements[0].id, 'PRD-1.1');
  });

  it('writes sorted, so two identical states produce identical bytes', () => {
    const meeseeksDir = makeMeeseeksDir();
    const a = pinRequirement({ id: 'PRD-1.1', evidence: 'src/a.ts:1', contents: 'x', iteration: 1 });
    const b = pinRequirement({ id: 'PRD-2.2', evidence: 'src/b.ts:1', contents: 'y', iteration: 1 });
    writePins(meeseeksDir, { ...emptyPins(), requirements: [b, a] });
    const forward = readFileSync(path.join(meeseeksDir, PINS_FILE), 'utf8');
    writePins(meeseeksDir, { ...emptyPins(), requirements: [a, b] });
    assert.equal(readFileSync(path.join(meeseeksDir, PINS_FILE), 'utf8'), forward);
  });

  /** @type {[string, string][]} */
  const refused = [
    ['not json at all', '{'],
    ['an array', '[]'],
    ['a version this build does not read', '{"version":2,"security":[],"requirements":[]}'],
    ['a store with no security array', '{"version":1,"requirements":[]}'],
    ['a store with no requirements array', '{"version":1,"security":[]}'],
    ['null', 'null'],
  ];
  for (const [label, body] of refused) {
    it(`throws on ${label} rather than degrading to no pins`, () => {
      // Fails like the ratchet, not like the lesson store. An unreadable lesson store degrades
      // to no lessons because it cannot make a wrong build look right. An unreadable pin store
      // can: continuing without it discards every recorded guard and every carried pass, and
      // the run looks healthier for having lost them.
      const meeseeksDir = makeMeeseeksDir();
      mkdirSync(meeseeksDir, { recursive: true });
      writeFileSync(path.join(meeseeksDir, PINS_FILE), body, 'utf8');
      assert.throws(() => readPins(meeseeksDir), PinsError);
    });
  }

  // R26: a corrupt pin store is announced and LEFT IN PLACE. The strictest interpretation for pins
  // is a throw, and the throw is a persistent wall only while the file stays put. Moving it aside
  // would let the next run see ENOENT and read an empty store — nothing pinned, protection lost —
  // the fail-open R26 closes. Covers an unparseable file and a valid-JSON-wrong-shape file.
  for (const [label, body] of [
    ['unparseable JSON', '{ not json'],
    ['a store with no requirements array', '{"version":1,"security":[]}'],
  ]) {
    it(`announces the corrupt store, leaves it in place, and throws on every read on ${label}`, () => {
      const meeseeksDir = makeMeeseeksDir();
      mkdirSync(meeseeksDir, { recursive: true });
      writeFileSync(path.join(meeseeksDir, PINS_FILE), body, 'utf8');
      /** @type {string[]} */
      const logged = [];
      const read = () => readPins(meeseeksDir, { now: 1700000000000, log: (line) => logged.push(line) });
      assert.throws(read, PinsError);
      // The wall persists on the second read, rather than returning an empty store.
      assert.throws(read, PinsError);
      assert.deepStrictEqual(readdirSync(meeseeksDir).sort(), [PINS_FILE]);
      assert.equal(readFileSync(path.join(meeseeksDir, PINS_FILE), 'utf8'), body);
      assert.match(logged[0], /pins\.json/);
      assert.match(logged[0], /left in place/);
    });
  }

  it('does not quarantine a valid pin store (benign neighbour)', () => {
    const meeseeksDir = makeMeeseeksDir();
    writePins(meeseeksDir, {
      ...emptyPins(),
      requirements: [pinRequirement({ id: 'PRD-1.1', evidence: 'src/a.ts:2', contents: 'x', iteration: 1 })],
    });
    /** @type {string[]} */
    const logged = [];
    const read = readPins(meeseeksDir, { now: 1700000000000, log: (line) => logged.push(line) });
    assert.equal(read.requirements[0].id, 'PRD-1.1');
    // A readable store is left exactly as it was: no sibling, no announcement.
    assert.deepStrictEqual(readdirSync(meeseeksDir).sort(), ['pins.json']);
    assert.deepStrictEqual(logged, []);
  });
});

describe('parseSecurityEscalation', () => {
  /** @param {unknown} body */
  const block = (body) => `some prose\n\`\`\`json\n${JSON.stringify(body)}\n\`\`\`\n`;

  it('reads a removal', () => {
    const verdict = parseSecurityEscalation(block({ finding: 'removed', detail: 'the role check is gone' }));
    assert.equal(verdict.finding, 'removed');
    assert.equal(verdict.detail, 'the role check is gone');
  });

  it('reads a move, with its new location and snippet', () => {
    const verdict = parseSecurityEscalation(
      block({ finding: 'moved', evidence: 'src/middleware/auth.ts:12', snippet: 'if (x) deny();', detail: 'extracted' }),
    );
    assert.deepEqual(verdict, {
      finding: 'moved',
      evidence: 'src/middleware/auth.ts:12',
      snippet: 'if (x) deny();',
      detail: 'extracted',
    });
  });

  it('downgrades a move with no new location to unknown', () => {
    // "It moved, I will not say where" leaves nothing to re-pin, and inventing a location
    // makes the next re-verification a coin toss.
    assert.equal(parseSecurityEscalation(block({ finding: 'moved', detail: 'somewhere' })).finding, 'unknown');
    assert.equal(
      parseSecurityEscalation(block({ finding: 'moved', evidence: 'src/a.ts:1', snippet: '  ' })).finding,
      'unknown',
    );
  });

  it('prefers the last block, so an echoed example never beats the answer', () => {
    const raw = `${block({ finding: 'removed' })}\n${block({ finding: 'unknown', detail: 'actually unsure' })}`;
    assert.equal(parseSecurityEscalation(raw).finding, 'unknown');
  });

  const unreadable = [
    ['no json at all', 'I think it is probably fine.'],
    ['a malformed block', '```json\n{ finding: removed\n```'],
    ['an array', '```json\n[]\n```'],
    ['an unrecognised finding', '```json\n{"finding":"deleted-ish"}\n```'],
    ['an empty message', ''],
  ];
  for (const [label, raw] of unreadable) {
    it(`treats ${label} as unknown, never as removed`, () => {
      // Fail-closed here is `unknown`, not `removed`. An unreadable answer is not evidence a
      // guard was deleted, and treating it as one hard-resets the tree and hands the builder
      // an objective it cannot satisfy. `unknown` is not a pass either — it quarantines, and
      // a quarantined element blocks SHIPPED.
      const verdict = parseSecurityEscalation(raw);
      assert.equal(verdict.finding, 'unknown');
      assert.equal(verdict.detail.length > 0, true, 'an unknown verdict must say why');
    });
  }

  it('produces a verdict that can be quarantined without further massaging', () => {
    const verdict = parseSecurityEscalation('nothing here');
    assert.equal(quarantinePin(guardPin(), verdict.detail).status, 'quarantined');
  });
});

describe('a pin that should never have existed', () => {
  // An audit of this project's first SHIPPED found a DoD-2-security pin citing
  // `if (intent.kind === 'usage-error') {` - an argv branch, not a security control. The three
  // existing verdicts all presuppose the pinned thing WAS a control, so a false pin could only
  // be quarantined, and quarantine blocks SHIPPED forever. DESIGN.md §4.3 predicted this exact
  // hazard and supplied an escape for the wrong failure.
  const pin = () =>
    pinSecurityElement({
      id: 'DoD-2-security',
      evidence: 'src/cli.ts:20',
      snippet: "if (intent.kind === 'usage-error') {",
      iteration: 1,
    });

  it('retracts with a reason, and stops blocking the ship', () => {
    const retracted = retractPin(pin(), 'an argv branch, not a security control');
    assert.equal(retracted.status, 'retracted');
    assert.equal(retracted.reason, 'an argv branch, not a security control');
    const store = { ...emptyPins(), security: [retracted] };
    assert.deepStrictEqual(shippingBlockers(store), [], 'a retracted pin must not block SHIPPED');
  });

  it('keeps the record rather than deleting it', () => {
    // Protection that silently stops existing is indistinguishable from protection that was
    // never there. The entry is the only evidence the claim was made and withdrawn.
    const store = { ...emptyPins(), security: [retractPin(pin(), 'never a control')] };
    assert.equal(store.security.length, 1);
    assert.equal(store.security[0].id, 'DoD-2-security');
  });

  it('refuses to retract without a reason', () => {
    for (const reason of ['', '   ']) {
      assert.throws(() => retractPin(pin(), reason), PinsError);
    }
  });

  it('still blocks the ship when the element is merely quarantined', () => {
    // The neighbour. Retraction must not become a quieter quarantine: an element nobody could
    // verify is a recorded loss of protection and still stops the run shipping.
    const store = { ...emptyPins(), security: [quarantinePin(pin(), 'could not tell')] };
    assert.equal(shippingBlockers(store).length, 1);
  });

  it('accepts the verdict only when the reviewer gives a reason', () => {
    const withReason = parseSecurityEscalation('```json\n{"finding":"never-was","detail":"an argv branch"}\n```');
    assert.equal(withReason.finding, 'never-was');
    // Fail-closed: an unexplained retraction is the one shape a builder might hope to launder a
    // real guard through, so it degrades to unknown, which quarantines.
    const bare = parseSecurityEscalation('```json\n{"finding":"never-was"}\n```');
    assert.equal(bare.finding, 'unknown');
  });
});
