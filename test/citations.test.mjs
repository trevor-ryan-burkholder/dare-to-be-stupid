/**
 * The citation resolver (`scripts/citations.mjs`, PLAN item 49, DESIGN §3.8.4).
 *
 * Every deny case here is paired with a benign neighbour, because a resolver that refuses
 * everything passes a deny-only suite while being useless. The failure this gate exists to catch
 * is a *plausible* citation — right source, right locator, wrong words — so the cases that matter
 * are the near misses rather than the obvious ones.
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import {
  CITATION_MANIFEST,
  CitationError,
  citationsGate,
  loadSourcePackage,
  normalize,
  parseManifest,
  resolveCitation,
} from '../scripts/citations.mjs';

/** @type {string[]} */
const temporaryDirs = [];
after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** @param {Record<string, string>} files @returns {string} */
function treeWith(files) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-cite-'));
  temporaryDirs.push(dir);
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), body, 'utf8');
  }
  return dir;
}

/** A source package whose digest is correct by construction. @param {string} id @param {string} text */
function sourcePackage(id, text) {
  return JSON.stringify({
    id,
    origin: `https://example.invalid/${id}`,
    retrievedAt: '2026-08-19T10:00:00.000Z',
    digest: `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`,
    text,
  });
}

/** @param {Partial<import('../scripts/citations.mjs').Citation>[]} citations */
const manifest = (citations) => JSON.stringify({ version: 1, citations });

const QUOTE = 'the rate of change was measurably higher in the treated group';
const SOURCE_TEXT = `Introduction.\n\nWe observed that ${QUOTE}, though the interval was wide.\n`;
const CHAPTER = `# Findings\n\nAs the study reports, ${QUOTE}.\n`;

/** A tree in which one citation resolves completely. @param {Record<string, string>} [overrides] */
function resolvingTree(overrides = {}) {
  return treeWith({
    'sources/acme-2024.json': sourcePackage('acme-2024', SOURCE_TEXT),
    'manuscript/03-findings.md': CHAPTER,
    [CITATION_MANIFEST]: manifest([
      { id: 'C1', source: 'acme-2024', locator: '§3.2', quote: QUOTE, usedIn: 'manuscript/03-findings.md' },
    ]),
    ...overrides,
  });
}

describe('normalize', () => {
  it('folds line breaks, because prose wraps and a wrapped quotation is the same quotation', () => {
    assert.equal(normalize('one   two\n\tthree \n'), 'one two three');
  });

  it('folds nothing else, because everything else is how a misquote gets through', () => {
    // The restraint is the feature. Each of these differs from the last by one thing a more
    // aggressive normalizer would erase, and each is a different quotation.
    assert.notEqual(normalize('The Rate rose'), normalize('the rate rose'));
    assert.notEqual(normalize('the rate rose.'), normalize('the rate rose'));
    assert.notEqual(normalize('the rate "rose"'), normalize('the rate rose'));
    assert.notEqual(normalize('the rate rose'), normalize('the rate fell'));
  });
});

describe('parseManifest', () => {
  it('reads a well-formed manifest, and an empty one is well-formed', () => {
    assert.deepEqual(parseManifest(manifest([])), []);
    const [only] = parseManifest(
      manifest([{ id: 'C1', source: 's', locator: 'p1', quote: 'q', usedIn: 'a.md' }]),
    );
    assert.deepEqual(only, { id: 'C1', source: 's', locator: 'p1', quote: 'q', usedIn: 'a.md' });
  });

  it('refuses every shape that is not a manifest', () => {
    /** @type {[string, RegExp][]} */
    const cases = [
      ['{ not json', /not valid JSON/],
      ['[]', /must be a JSON object/],
      ['"a string"', /must be a JSON object/],
      ['{"citations":[]}', /must declare "version": 1/],
      ['{"version":2,"citations":[]}', /must declare "version": 1/],
      ['{"version":1}', /must declare a "citations" array/],
      ['{"version":1,"citations":{}}', /must declare a "citations" array/],
      ['{"version":1,"citations":["C1"]}', /citation 0 is not an object/],
    ];
    for (const [text, expected] of cases) {
      assert.throws(() => parseManifest(text), (error) => error instanceof CitationError && expected.test(error.message), text);
    }
  });

  it('requires every field, one case per field, because an absent one is invisible', () => {
    const complete = { id: 'C1', source: 's', locator: 'p1', quote: 'q', usedIn: 'a.md' };
    for (const name of ['id', 'source', 'locator', 'quote', 'usedIn']) {
      const missing = { ...complete };
      delete (/** @type {Record<string, unknown>} */ (missing))[name];
      assert.throws(
        () => parseManifest(manifest([missing])),
        (error) => error instanceof CitationError && error.message.includes(`"${name}"`),
        `a citation missing ${name} was accepted`,
      );
      assert.throws(
        () => parseManifest(manifest([{ ...complete, [name]: '   ' }])),
        (error) => error instanceof CitationError && error.message.includes(`"${name}"`),
        `a citation with a blank ${name} was accepted`,
      );
    }
  });

  it('refuses a duplicate id rather than picking one of the two', () => {
    const entry = { id: 'C1', source: 's', locator: 'p1', quote: 'q', usedIn: 'a.md' };
    assert.throws(
      () => parseManifest(manifest([entry, { ...entry, quote: 'different' }])),
      (error) => error instanceof CitationError && /declared twice/.test(error.message),
    );
    // The neighbour: two entries that differ only in id are two citations, not a duplicate.
    assert.equal(parseManifest(manifest([entry, { ...entry, id: 'C2' }])).length, 2);
  });
});

describe('loadSourcePackage', () => {
  it('loads a package whose bytes match the digest it carries', () => {
    const root = resolvingTree();
    const loaded = loadSourcePackage(root, 'acme-2024');
    assert.equal(loaded.ok, true);
    assert.equal(loaded.ok === true && loaded.source.text, SOURCE_TEXT);
  });

  it('refuses a package edited after capture, which is the only place that can notice', () => {
    // The digest is retained evidence about *which version* the artifact was written against. A
    // text that no longer matches it was either edited after capture or never captured right.
    const tampered = JSON.stringify({
      id: 'acme-2024',
      origin: 'https://example.invalid/acme-2024',
      retrievedAt: '2026-08-19T10:00:00.000Z',
      digest: `sha256:${createHash('sha256').update(SOURCE_TEXT, 'utf8').digest('hex')}`,
      text: `${SOURCE_TEXT}and one sentence nobody captured.\n`,
    });
    const loaded = loadSourcePackage(resolvingTree({ 'sources/acme-2024.json': tampered }), 'acme-2024');
    assert.equal(loaded.ok, false);
    assert.match(loaded.ok === false ? loaded.reason : '', /changed after capture/);
  });

  it('refuses a source id that is a path rather than a name', () => {
    // Manifest data naming a file inside the operator's repository. Refused before it is joined.
    const root = resolvingTree();
    for (const id of ['../secrets', 'a/b', 'a\\b', '/etc/passwd', '..']) {
      const loaded = loadSourcePackage(root, id);
      assert.equal(loaded.ok, false, id);
      assert.match(loaded.ok === false ? loaded.reason : '', /is not a plain name/);
    }
  });

  it('names every other way a package can be unusable, and never treats one as absent evidence', () => {
    /** @type {[string, RegExp][]} */
    const cases = [
      ['{ not json', /not valid JSON/],
      ['[]', /not a source package object/],
      ['{"id":"acme-2024","origin":"x","retrievedAt":"t","digest":"d"}', /needs a non-empty string "text"/],
      ['{"id":"other","origin":"x","retrievedAt":"t","digest":"d","text":"y"}', /declares itself "other"/],
    ];
    for (const [body, expected] of cases) {
      const loaded = loadSourcePackage(resolvingTree({ 'sources/acme-2024.json': body }), 'acme-2024');
      assert.equal(loaded.ok, false, body);
      assert.match(loaded.ok === false ? loaded.reason : '', expected);
    }
  });

  it('reports an absent package as unfetchable rather than as nothing to check', () => {
    const loaded = loadSourcePackage(resolvingTree(), 'never-captured');
    assert.equal(loaded.ok, false);
    assert.match(loaded.ok === false ? loaded.reason : '', /has no captured package/);
  });
});

describe('resolveCitation', () => {
  /** @param {Partial<import('../scripts/citations.mjs').Citation>} [overrides] */
  const citation = (overrides = {}) => ({
    id: 'C1',
    source: 'acme-2024',
    locator: '§3.2',
    quote: QUOTE,
    usedIn: 'manuscript/03-findings.md',
    ...overrides,
  });

  it('resolves a faithful quotation, and says what it did not check', () => {
    const result = resolveCitation(resolvingTree(), citation());
    assert.equal(result.ok, true);
    // The overclaim this module exists to refuse. Resolution is traceability, never support.
    assert.match(result.reason, /locator "§3\.2" recorded, not verified/);
  });

  it('resolves across a line break, because the manuscript wraps and the source does not', () => {
    const wrapped = `# Findings\n\nAs the study reports, the rate of change was\nmeasurably higher in the\ntreated group.\n`;
    const result = resolveCitation(resolvingTree({ 'manuscript/03-findings.md': wrapped }), citation());
    assert.equal(result.ok, true);
  });

  it('fails a misquote that differs by one word', () => {
    // The case the whole gate is for: right source, right locator, wrong words.
    const result = resolveCitation(
      resolvingTree(),
      citation({ quote: 'the rate of change was measurably lower in the treated group' }),
    );
    assert.equal(result.ok, false);
    assert.match(result.reason, /does not appear in source "acme-2024" at all; this is a misquote/);
  });

  it('fails closed on a source it cannot fetch', () => {
    const result = resolveCitation(resolvingTree(), citation({ source: 'never-captured' }));
    assert.equal(result.ok, false);
    assert.match(result.reason, /has no captured package/);
  });

  it('fails when the manifest has drifted from the artifact', () => {
    // The half that stops a deleted paragraph leaving a passing citation behind. The quotation is
    // genuinely in the source; it is no longer in the manuscript that claims to use it.
    const result = resolveCitation(
      resolvingTree({ 'manuscript/03-findings.md': '# Findings\n\nThe paragraph was cut.\n' }),
      citation(),
    );
    assert.equal(result.ok, false);
    assert.match(result.reason, /has drifted from the artifact/);
  });

  it('fails an unreadable usedIn, and refuses one that escapes the repository', () => {
    const root = resolvingTree();
    assert.match(resolveCitation(root, citation({ usedIn: 'manuscript/missing.md' })).reason, /cannot be read/);
    for (const usedIn of ['../outside.md', '/etc/passwd', 'a/../../b.md']) {
      const result = resolveCitation(root, citation({ usedIn }));
      assert.equal(result.ok, false, usedIn);
      assert.match(result.reason, /escapes the repository|cannot be read/);
    }
  });
});

describe('citationsGate', () => {
  it('fails an absent manifest, and says how to declare the honest alternative', () => {
    // An artifact that cites nothing is legitimate; a *missing file* is not that claim. The two
    // are indistinguishable from outside, so the gate asks for the statement.
    const gate = citationsGate(treeWith({ 'manuscript/01.md': '# a\n' }));
    assert.equal(gate.ok, false);
    assert.equal(gate.status, 1);
    assert.match(gate.detail, /"citations": \[\]/);
  });

  it('passes an empty manifest, and records that this was declared', () => {
    const gate = citationsGate(treeWith({ [CITATION_MANIFEST]: manifest([]) }));
    assert.equal(gate.ok, true);
    assert.equal(gate.status, 0);
    assert.equal(gate.detail, 'the artifact declares that it cites nothing');
  });

  it('passes a resolving artifact without claiming the sources support the claims', () => {
    const gate = citationsGate(resolvingTree());
    assert.equal(gate.ok, true);
    assert.equal(gate.status, 0);
    assert.match(gate.detail, /1 quotation faithful/);
    assert.match(gate.detail, /traceability, not support/);
  });

  it('reports every failing citation rather than only the first', () => {
    const root = treeWith({
      'sources/acme-2024.json': sourcePackage('acme-2024', SOURCE_TEXT),
      'manuscript/03-findings.md': CHAPTER,
      [CITATION_MANIFEST]: manifest([
        { id: 'C1', source: 'acme-2024', locator: '§3.2', quote: 'invented text', usedIn: 'manuscript/03-findings.md' },
        { id: 'C2', source: 'never-captured', locator: 'p1', quote: QUOTE, usedIn: 'manuscript/03-findings.md' },
        { id: 'C3', source: 'acme-2024', locator: '§3.2', quote: QUOTE, usedIn: 'manuscript/03-findings.md' },
      ]),
    });
    const gate = citationsGate(root);
    assert.equal(gate.ok, false);
    assert.match(gate.detail, /^C1: /);
    assert.match(gate.detail, /C2: /);
    // The one that resolved is not reported as a failure.
    assert.equal(gate.detail.includes('C3'), false);
  });

  it('fails a malformed manifest with the parser own sentence, not a generic one', () => {
    const gate = citationsGate(treeWith({ [CITATION_MANIFEST]: '{"version":1,"citations":[{"id":"C1"}]}' }));
    assert.equal(gate.ok, false);
    assert.match(gate.detail, /needs a non-empty string "source"/);
  });
});
