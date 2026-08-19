/**
 * `schema-conformance`: does the live schema contain what the ERD declared? (PLAN.md item 47,
 * slice C; DESIGN.md §3.6.1.)
 *
 * **A superset question, deliberately.** An extra `createdAt` is a sensible thing for a builder to
 * add, and failing on it would make the ERD a straitjacket rather than a floor. An omission or a
 * contradiction fails; a surplus does not.
 *
 * **Who describes the schema is the load-bearing decision, and it is not the builder.** A builder
 * that supplied the introspection command could describe a schema satisfying the diagram, and the
 * gate would be confirming its own input — `gate-integrity`'s hazard through a new door, and worse
 * here than for tests, because a stubbed suite still has to run while a fabricated introspection is
 * one `echo`. The command is operator configuration living in `.meeseeks/config.json`, which the
 * positional guard puts out of a running builder's reach.
 *
 * **Everything fails closed.** No output, unparseable output, a non-zero exit, a missing table, a
 * missing column: all of them fail. A schema that cannot be introspected has not been shown to
 * conform.
 */

/** Thrown when an introspection report cannot be trusted. Never downgraded to "conforms". */
export class SchemaError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'SchemaError';
  }
}

/**
 * @typedef {{ name: string, columns: string[] }} LiveTable
 */

/**
 * Parse an introspection report.
 *
 * The shape is Meeseeks' own rather than any database's, because every engine spells introspection
 * differently and the gate needs one vocabulary to compare against a diagram:
 *
 * ```json
 * { "tables": [{ "name": "customer", "columns": ["id", "name"] }] }
 * ```
 *
 * @param {string} text
 * @returns {LiveTable[]}
 * @throws {SchemaError}
 */
export function parseSchemaReport(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new SchemaError(`the schema report was not valid JSON: ${/** @type {Error} */ (error).message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SchemaError('the schema report is not an object with a `tables` array');
  }
  const tables = /** @type {Record<string, unknown>} */ (parsed).tables;
  if (!Array.isArray(tables)) {
    throw new SchemaError('the schema report has no `tables` array');
  }
  return tables.map((raw, index) => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new SchemaError(`table ${index} in the schema report is not an object`);
    }
    const table = /** @type {Record<string, unknown>} */ (raw);
    if (typeof table.name !== 'string' || table.name.trim() === '') {
      throw new SchemaError(`table ${index} in the schema report has no name`);
    }
    if (!Array.isArray(table.columns) || table.columns.some((column) => typeof column !== 'string')) {
      throw new SchemaError(`table ${JSON.stringify(table.name)} does not list its columns as strings`);
    }
    return { name: table.name.trim(), columns: table.columns.map((column) => String(column).trim()) };
  });
}

/**
 * Reduce a table or column name to what a diagram and a database would share.
 *
 * `LINE_ITEM`, `line_items` and `LineItem` are one thing. The fold is the same shape the ERD/PRD
 * comparison uses, and for the same reason — two authors spell one concept differently — but the
 * polarity here is the opposite. That check refuses a run before anything is built, so it
 * over-matches deliberately. **This one is the gate**, and a gate that over-matches passes a schema
 * that does not conform, so the fold stops at case, separators and a trailing plural. It will not
 * match on substrings: `order` must not be satisfied by `work_orders`.
 *
 * @param {string} name
 * @returns {string}
 */
function fold(name) {
  const flat = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return flat.endsWith('s') ? flat.slice(0, -1) : flat;
}

/**
 * @typedef {{
 *   ok: boolean,
 *   missingTables: string[],
 *   missingColumns: { table: string, columns: string[] }[],
 *   checked: { tables: number, columns: number },
 * }} Conformance
 */

/**
 * Does the live schema contain everything the ERD declares?
 *
 * **A superset question.** Extra tables and extra columns pass: a sensible `createdAt` is a good
 * thing for a builder to add, and failing on it would make the ERD a straitjacket rather than a
 * floor. An omission fails, and it fails **naming what is missing**, because "schema does not
 * conform" sends a builder to read the whole diagram again.
 *
 * Relationships are **not** checked here, and that is a limit stated rather than hidden. A foreign
 * key is one way to express `CUSTOMER ||--o{ ORDER`, and an application that enforces the same
 * constraint in code has satisfied the requirement without a constraint the introspection would
 * see. Checking it would fail correct work, which is the one thing a gate must not do — a gate that
 * fails what is right teaches a builder to ignore it.
 *
 * @param {import('./erd.mjs').Erd} erd
 * @param {LiveTable[]} live
 * @returns {Conformance}
 */
export function conformance(erd, live) {
  const tables = new Map(live.map((table) => [fold(table.name), table.columns.map(fold)]));
  /** @type {string[]} */
  const missingTables = [];
  /** @type {{ table: string, columns: string[] }[]} */
  const missingColumns = [];
  let columnsChecked = 0;

  for (const entity of erd.entities) {
    const columns = tables.get(fold(entity.name));
    if (columns === undefined) {
      missingTables.push(entity.name);
      continue;
    }
    const absent = entity.attributes.filter((attribute) => !columns.includes(fold(attribute.name)));
    columnsChecked += entity.attributes.length;
    if (absent.length > 0) {
      missingColumns.push({ table: entity.name, columns: absent.map((attribute) => attribute.name) });
    }
  }

  return {
    ok: missingTables.length === 0 && missingColumns.length === 0,
    missingTables,
    missingColumns,
    checked: { tables: erd.entities.length, columns: columnsChecked },
  };
}

/**
 * Turn one introspection run into a gate result.
 *
 * Fails closed on every unknown: a non-zero exit, empty output, unparseable output, or a schema
 * missing anything the ERD declared. **A schema that cannot be introspected has not been shown to
 * conform**, and there is no "no database configured, so it passes" — an ERD supplied with no
 * introspection declared is refused before the run starts, not silently skipped here.
 *
 * @param {import('./erd.mjs').Erd} erd
 * @param {{ ok: boolean, status: number, stdout: string, stderr?: string }} outcome
 * @returns {{ ok: boolean, detail: string }}
 */
export function schemaEvidence(erd, outcome) {
  const stderr = typeof outcome.stderr === 'string' ? outcome.stderr.trim() : '';
  if (outcome.ok !== true) {
    return {
      ok: false,
      detail:
        `the schema introspection command exited ${outcome.status}, so this tree has not been shown to match ` +
        `the declared schema${stderr === '' ? '.' : `:\n${stderr}`}`,
    };
  }
  const stdout = typeof outcome.stdout === 'string' ? outcome.stdout : '';
  if (stdout.trim() === '') {
    return {
      ok: false,
      detail:
        'the schema introspection command exited zero and printed nothing. An empty report is not evidence of ' +
        'a conforming schema; it is evidence that nothing was read' + (stderr === '' ? '.' : `:\n${stderr}`),
    };
  }
  /** @type {LiveTable[]} */
  let live;
  try {
    live = parseSchemaReport(stdout);
  } catch (error) {
    return { ok: false, detail: `the schema report could not be trusted: ${/** @type {Error} */ (error).message}` };
  }

  const result = conformance(erd, live);
  if (result.ok) {
    return {
      ok: true,
      detail: `the live schema contains all ${result.checked.tables} declared entities and ${result.checked.columns} declared columns`,
    };
  }
  const lines = ['the live schema does not contain everything the ERD declares:'];
  for (const table of result.missingTables) lines.push(`  - no table for ${table}`);
  for (const entry of result.missingColumns) lines.push(`  - ${entry.table} is missing ${entry.columns.join(', ')}`);
  lines.push('Extra tables and columns are fine; these are declared and absent.');
  return { ok: false, detail: lines.join('\n') };
}
