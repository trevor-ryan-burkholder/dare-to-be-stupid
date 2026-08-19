/**
 * `schema-conformance` (PLAN.md item 47, slice C; DESIGN.md §3.6.1).
 *
 * The gate asks a **superset** question, so the tests come in pairs: the surplus that must pass
 * beside the omission that must fail. A gate that fails correct work teaches a builder to ignore it,
 * and a gate that passes an absent table is not a gate.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseErd } from '../scripts/erd.mjs';
import { conformance, parseSchemaReport, schemaEvidence, SchemaError } from '../scripts/schema.mjs';

const ERD = parseErd(
  'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n' +
    '  CUSTOMER {\n    int id PK\n    string name\n  }\n' +
    '  ORDER {\n    int id PK\n    int customer_id FK\n  }\n',
);

/** @param {Record<string, string[]>} tables @returns {string} */
const report = (tables) =>
  JSON.stringify({ tables: Object.entries(tables).map(([name, columns]) => ({ name, columns })) });

const CONFORMING = { customers: ['id', 'name'], orders: ['id', 'customer_id'] };

describe('conformance is a superset question', () => {
  it('passes a schema that contains exactly what was declared', () => {
    const result = conformance(ERD, parseSchemaReport(report(CONFORMING)));
    assert.equal(result.ok, true);
    assert.deepEqual(result.checked, { tables: 2, columns: 4 });
  });

  it('passes a schema with extra columns, because the ERD is a floor', () => {
    // The benign neighbour that matters most. A builder adding `createdAt` has done a sensible
    // thing, and a gate failing it turns the diagram into a straitjacket.
    const result = conformance(
      ERD,
      parseSchemaReport(report({ customers: ['id', 'name', 'created_at'], orders: ['id', 'customer_id', 'total'] })),
    );
    assert.equal(result.ok, true);
  });

  it('passes a schema with extra tables the diagram never mentioned', () => {
    const result = conformance(ERD, parseSchemaReport(report({ ...CONFORMING, migrations: ['version'] })));
    assert.equal(result.ok, true);
  });

  it('matches across spelling, because a diagram and a database name things differently', () => {
    // LINE_ITEM / line_items / lineItem is one thing. The fold covers case, separators and a
    // trailing plural, and stops there.
    const erd = parseErd('erDiagram\n  LINE_ITEM {\n    int orderId PK\n  }\n');
    assert.equal(conformance(erd, parseSchemaReport(report({ line_items: ['order_id'] }))).ok, true);
  });

  it('does not accept a substring, so `order` is not satisfied by `work_orders`', () => {
    // The fold is deliberately narrower than the ERD/PRD one. That check refuses a run before
    // anything is built and over-matches on purpose; this is the gate, and a gate that over-matches
    // passes a schema that does not conform.
    const erd = parseErd('erDiagram\n  ORDER {\n    int id PK\n  }\n');
    const result = conformance(erd, parseSchemaReport(report({ work_orders: ['id'] })));
    assert.equal(result.ok, false);
    assert.deepEqual(result.missingTables, ['ORDER']);
  });

  it('names the missing table rather than reporting a bare failure', () => {
    const result = conformance(ERD, parseSchemaReport(report({ customers: ['id', 'name'] })));
    assert.equal(result.ok, false);
    assert.deepEqual(result.missingTables, ['ORDER']);
  });

  it('names the missing columns, and which table they belong to', () => {
    // "The schema does not conform" sends a builder to read the whole diagram again.
    const result = conformance(ERD, parseSchemaReport(report({ customers: ['id'], orders: ['id'] })));
    assert.equal(result.ok, false);
    assert.deepEqual(result.missingColumns, [
      { table: 'CUSTOMER', columns: ['name'] },
      { table: 'ORDER', columns: ['customer_id'] },
    ]);
  });

  it('requires a table for an entity the ERD named only in a relationship', () => {
    // A relationship-only entity is still a table the builder was asked to create.
    const erd = parseErd('erDiagram\n  A ||--o{ B : has\n');
    const result = conformance(erd, parseSchemaReport(report({ a: ['id'] })));
    assert.equal(result.ok, false);
    assert.deepEqual(result.missingTables, ['B']);
  });
});

describe('parseSchemaReport fails closed', () => {
  /** @type {[string, string][]} */
  const bad = [
    ['not json', 'was not valid JSON'],
    ['[]', 'not an object with a `tables` array'],
    ['{"rows":[]}', 'has no `tables` array'],
    ['{"tables":[3]}', 'is not an object'],
    ['{"tables":[{"columns":[]}]}', 'has no name'],
    ['{"tables":[{"name":"a","columns":"id"}]}', 'does not list its columns as strings'],
    ['{"tables":[{"name":"a","columns":[7]}]}', 'does not list its columns as strings'],
  ];
  for (const [input, message] of bad) {
    it(`refuses ${JSON.stringify(input.slice(0, 32))}`, () => {
      assert.throws(
        () => parseSchemaReport(input),
        (error) => error instanceof SchemaError && error.message.includes(message),
      );
    });
  }
});

describe('schemaEvidence turns one introspection into a gate result', () => {
  it('passes a conforming schema and says how much it checked', () => {
    const { ok, detail } = schemaEvidence(ERD, { ok: true, status: 0, stdout: report(CONFORMING) });
    assert.equal(ok, true);
    assert.match(detail, /all 2 declared entities and 4 declared columns/);
  });

  it('fails when the introspection command itself failed', () => {
    const { ok, detail } = schemaEvidence(ERD, { ok: false, status: 1, stdout: '', stderr: 'no such database' });
    assert.equal(ok, false);
    assert.match(detail, /has not been shown to match the declared schema/);
    assert.match(detail, /no such database/);
  });

  it('fails on an empty report at exit zero, which is the dangerous shape', () => {
    // A command that exits clean having read nothing is indistinguishable from a clean schema by
    // status alone. An empty report is evidence that nothing was read.
    const { ok, detail } = schemaEvidence(ERD, { ok: true, status: 0, stdout: '   \n' });
    assert.equal(ok, false);
    assert.match(detail, /not evidence of a conforming schema; it is evidence that nothing was read/);
  });

  it('fails on a report it cannot parse, rather than assuming conformance', () => {
    const { ok, detail } = schemaEvidence(ERD, { ok: true, status: 0, stdout: '{"tables":"all of them"}' });
    assert.equal(ok, false);
    assert.match(detail, /could not be trusted/);
  });

  it('names what is missing, so a builder can repair without re-reading the diagram', () => {
    const { ok, detail } = schemaEvidence(ERD, { ok: true, status: 0, stdout: report({ customers: ['id'] }) });
    assert.equal(ok, false);
    assert.match(detail, /- no table for ORDER/);
    assert.match(detail, /- CUSTOMER is missing name/);
    assert.match(detail, /Extra tables and columns are fine/);
  });
});
