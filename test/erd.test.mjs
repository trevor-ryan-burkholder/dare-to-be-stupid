/**
 * The Mermaid `erDiagram` reader (PLAN.md item 47, slice A).
 *
 * The happy path runs against a committed document exercising every cardinality in both positions,
 * both relation types, quoted labels, keys and comments. The deny paths are inline, because you
 * cannot capture a *malformed* diagram from a working authoring tool — the point there is this
 * reader's own refusal to guess.
 *
 * **The refusals are the feature.** This reader feeds a gate that asks whether a live schema
 * contains what the ERD declares, so a line it silently drops is a constraint nobody ever checks.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { entityNames, ErdError, parseErd, unmentionedEntities } from '../scripts/erd.mjs';

const ORDERS = readFileSync(new URL('./fixtures/erd/orders.md', import.meta.url), 'utf8');

describe('parseErd reads a real diagram', () => {
  const erd = parseErd(ORDERS);

  it('finds every entity, including ones named only by a relationship', () => {
    // COURIER and DELIVERY_ADDRESS have no attribute block. That is legal, and the schema gate still
    // has to know the table exists — dropping them would silently narrow what gets checked.
    assert.deepEqual(entityNames(erd), ['COURIER', 'CUSTOMER', 'DELIVERY_ADDRESS', 'LINE_ITEM', 'ORDER']);
  });

  it('reads each cardinality on the correct side', () => {
    // The notation is not symmetric: `}o` on the left and `o{` on the right are the same
    // cardinality. Reading one table in both directions mirrors every many-side relationship, so
    // both directions are asserted on real lines rather than assumed.
    assert.deepEqual(
      erd.relationships.map((r) => [r.left, r.leftCardinality, r.right, r.rightCardinality]),
      [
        ['CUSTOMER', 'exactly-one', 'ORDER', 'zero-or-more'],
        ['ORDER', 'exactly-one', 'LINE_ITEM', 'one-or-more'],
        ['CUSTOMER', 'one-or-more', 'DELIVERY_ADDRESS', 'one-or-more'],
        ['ORDER', 'zero-or-more', 'COURIER', 'exactly-one'],
      ],
    );
  });

  it('distinguishes an identifying relationship from a non-identifying one', () => {
    assert.deepEqual(
      erd.relationships.map((r) => r.identifying),
      [true, true, false, true],
    );
  });

  it('reads labels, with quotes stripped so one label is one string', () => {
    assert.deepEqual(
      erd.relationships.map((r) => r.label),
      ['places', 'contains', 'uses', 'shipped by'],
    );
  });

  it('reads attributes with their types, keys and comments', () => {
    const customer = erd.entities.find((entity) => entity.name === 'CUSTOMER');
    assert.deepEqual(customer?.attributes, [
      { type: 'string', name: 'name', keys: [], comment: '' },
      { type: 'string', name: 'custNumber', keys: ['PK'], comment: '' },
      { type: 'int', name: 'sector', keys: [], comment: 'north or south' },
    ]);
  });

  it('gives an entity with no block an empty attribute list rather than omitting it', () => {
    const courier = erd.entities.find((entity) => entity.name === 'COURIER');
    assert.deepEqual(courier?.attributes, []);
  });
});

describe('parseErd fails closed', () => {
  /** @type {[string, string, string][]} */
  const refusals = [
    ['', 'is empty', 'an empty diagram declares nothing'],
    ['   \n\n  ', 'is empty', 'whitespace is not a diagram'],
    ['flowchart TD\n  A --> B\n', 'does not begin with `erDiagram`', 'a different diagram type'],
    ['erDiagram\n  A ||--o{ B : has\n  what is this line\n', 'neither a relationship nor an entity block', 'an unclassifiable line'],
    ['erDiagram\n  A {\n    string x\n', 'never closed', 'an unclosed attribute block'],
    ['erDiagram\n  A {\n    not-an-attribute-line-at-all !!\n  }\n', 'not a readable attribute', 'a malformed attribute'],
    ['erDiagram\n  A {\n    string x\n    int x\n  }\n', 'declares x twice', 'a duplicated attribute'],
    ['erDiagram\n  A {\n    string x\n  }\n  A {\n    string y\n  }\n', 'more than one attribute block', 'a second block for one entity'],
  ];
  for (const [input, message, label] of refusals) {
    it(`refuses ${label}`, () => {
      assert.throws(
        () => parseErd(input),
        (error) => error instanceof ErdError && error.message.includes(message),
      );
    });
  }

  it('refuses a cardinality token it has not verified, rather than guessing one', () => {
    // The load-bearing refusal. `MD_PARENT` exists in mermaid's grammar and is deliberately
    // unsupported here: a wrong reading of a relationship is worse than a refusal to read it, and
    // the alternative to refusing is inventing a constraint the gate then enforces.
    assert.throws(
      () => parseErd('erDiagram\n  A ++--++ B : parents\n'),
      (error) => error instanceof ErdError && error.message.includes('neither a relationship nor an entity block'),
    );
  });

  it('refuses a diagram that declares no entities at all', () => {
    assert.throws(
      () => parseErd('erDiagram\n'),
      (error) => error instanceof ErdError && error.message.includes('declares no entities'),
    );
  });
});

describe('what a reader may safely ignore', () => {
  it('ignores comments and blank lines, without inventing an entity from a note', () => {
    // `%%` is Mermaid's own comment. A reader that treated one as a relationship would produce
    // entities nobody declared, which is the oracle's named defect arriving through a diagram.
    const erd = parseErd('erDiagram\n\n  %% CUSTOMER ||--o{ GHOST : haunts\n  A ||--o{ B : has\n');
    assert.deepEqual(entityNames(erd), ['A', 'B']);
  });

  it('reads a diagram indented however the author indented it', () => {
    const erd = parseErd('erDiagram\n        A ||--o{ B : has\n        A {\n                int id PK\n        }\n');
    assert.deepEqual(entityNames(erd), ['A', 'B']);
    assert.deepEqual(erd.entities.find((e) => e.name === 'A')?.attributes[0].keys, ['PK']);
  });

  it('reads several keys on one attribute', () => {
    const erd = parseErd('erDiagram\n  A {\n    int id PK,FK\n  }\n');
    assert.deepEqual(erd.entities[0].attributes[0].keys, ['PK', 'FK']);
  });
});

describe('an ERD may not introduce an entity the specification never mentions', () => {
  const erd = parseErd(ORDERS);

  it('accepts a specification that names every entity, however it spells them', () => {
    // `LINE_ITEM`, "line item" and "line-item" are one thing to two authors, so the comparison folds
    // both sides. Over-matching is the chosen error: this refuses a run, and a false miss blocks a
    // correct specification at the door while a false match costs nothing — the gate is what
    // actually enforces the schema.
    assert.deepEqual(
      unmentionedEntities(
        erd,
        'Customers place orders. Each order has line-items. A customer has delivery addresses, and a courier delivers.',
      ),
      [],
    );
  });

  it('names an entity that exists only in the diagram', () => {
    // The oracle's named defect arriving through a second input: the diagram inventing a requirement.
    assert.deepEqual(
      unmentionedEntities(erd, 'Customers place orders with line items, delivered by a courier.'),
      ['DELIVERY_ADDRESS'],
    );
  });

  it('accepts a plural in the specification for a singular entity, and the reverse', () => {
    assert.deepEqual(unmentionedEntities(parseErd('erDiagram\n  ORDER ||--o{ TAG : has\n'), 'orders carry tags'), []);
    assert.deepEqual(unmentionedEntities(parseErd('erDiagram\n  ORDERS ||--o{ TAGS : has\n'), 'an order has a tag'), []);
  });

  it('reports every unmentioned entity rather than the first', () => {
    // A run refused twice for two different missing entities is two round trips the operator did
    // not need to make.
    assert.deepEqual(unmentionedEntities(erd, 'Customers place orders.'), [
      'COURIER',
      'DELIVERY_ADDRESS',
      'LINE_ITEM',
    ]);
  });

  it('treats an empty specification as mentioning nothing', () => {
    assert.equal(unmentionedEntities(erd, '').length, 5);
  });
});
