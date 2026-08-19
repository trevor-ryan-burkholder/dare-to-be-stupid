/**
 * Parse a Mermaid `erDiagram` into entities, keys and relationships (PLAN.md item 47).
 *
 * **Why an ERD at all.** The data model is where prose is most ambiguous and a builder's invention
 * most expensive. An ERD is machine-parseable text with no runtime dependency to read it, so the
 * schema stops being inferred from the PRD and becomes something a gate can check against.
 *
 * ## What was verified, and what was not
 *
 * The cardinality token names here were taken from **mermaid 11.17.0's own compiled grammar**
 * (`dist/chunks/mermaid.core/erDiagram-*.mjs.map`, which embeds `erDiagram.jison`): `ZERO_OR_ONE`,
 * `ZERO_OR_MORE`, `ONE_OR_MORE`, `ONLY_ONE`, `MD_PARENT`, `NON_IDENTIFYING`, `IDENTIFYING`. That is
 * a measurement rather than a recollection, and it is the half that matters — it says which
 * relationships the format actually has.
 *
 * **What could not be established here is end-to-end agreement with mermaid's parser.** Loading it
 * standalone needs its full dependency tree, which this repository will not take on for a test. So
 * this reader **fails closed on any token it has not verified**: an unrecognised cardinality is an
 * error rather than a guess, and `MD_PARENT` is deliberately unsupported rather than approximated,
 * because a wrong reading of a relationship is worse than a refusal to read it. The residual is
 * recorded in PLAN item 47; the cheap discharge is one ERD that mermaid renders and this parses,
 * compared by hand.
 *
 * ## The shape, and why it is not a graph library
 *
 * Entities carry attributes and keys; relationships carry two endpoints, two cardinalities and
 * whether they are identifying. Nothing here computes reachability, closure, or normal forms. The
 * gate this feeds asks a **superset** question — does the live schema contain what the ERD
 * declares — and a superset question needs the declaration, not a theory about it.
 */

/** Thrown when an ERD cannot be trusted. Never downgraded to "no entities". */
export class ErdError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'ErdError';
  }
}

/**
 * @typedef {'zero-or-one' | 'exactly-one' | 'zero-or-more' | 'one-or-more'} Cardinality
 */

/**
 * @typedef {{ name: string, type: string, keys: string[], comment: string }} ErdAttribute
 */

/**
 * @typedef {{
 *   left: string, right: string,
 *   leftCardinality: Cardinality, rightCardinality: Cardinality,
 *   identifying: boolean, label: string,
 * }} ErdRelationship
 */

/**
 * @typedef {{
 *   entities: { name: string, attributes: ErdAttribute[] }[],
 *   relationships: ErdRelationship[],
 * }} Erd
 */

/**
 * The left-hand cardinality tokens, by the names mermaid's grammar gives them.
 *
 * Left and right are separate tables because the notation is **not symmetric**: `}o` on the left is
 * the same cardinality as `o{` on the right. Reading one table in both directions is the obvious
 * shortcut and it silently mirrors every many-side relationship.
 */
const LEFT_CARDINALITY = {
  '|o': /** @type {const} */ ('zero-or-one'),
  '||': /** @type {const} */ ('exactly-one'),
  '}o': /** @type {const} */ ('zero-or-more'),
  '}|': /** @type {const} */ ('one-or-more'),
};

/** The right-hand tokens. Mirror images of the left, and enumerated rather than derived. */
const RIGHT_CARDINALITY = {
  'o|': /** @type {const} */ ('zero-or-one'),
  '||': /** @type {const} */ ('exactly-one'),
  'o{': /** @type {const} */ ('zero-or-more'),
  '|{': /** @type {const} */ ('one-or-more'),
};

/** `--` is identifying, `..` is not. Both verified present in the grammar as distinct tokens. */
const RELATION = { '--': true, '..': false };

/** A relationship line: two entities, two cardinalities, a relation type and a label. */
const RELATIONSHIP_RE = /^(\S+)\s+(\|o|\|\||\}o|\}\|)(--|\.\.)(o\||\|\||o\{|\|\{)\s+(\S+)\s*:\s*(.+)$/;

/** An entity block opener: `NAME {`. */
const ENTITY_OPEN_RE = /^(\S+)\s*\{$/;

/**
 * One attribute inside a block: `type name [KEY[,KEY]] ["comment"]`.
 *
 * The **name** is constrained to an identifier; the **type** deliberately is not. A first draft took
 * any two non-space tokens and happily read `not-an-attribute-line-at-all !!` as a column called
 * `!!` — a line the gate would then go looking for in a real schema. Types are left permissive on
 * purpose, because they are the target database's vocabulary rather than Mermaid's: `varchar(255)`,
 * `string[]` and `numeric(10,2)` are all things an author legitimately writes.
 */
const ATTRIBUTE_RE = /^(\S+)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+((?:PK|FK|UK)(?:\s*,\s*(?:PK|FK|UK))*))?(?:\s+"([^"]*)")?$/;

/**
 * Parse a Mermaid `erDiagram`.
 *
 * @param {string} text
 * @returns {Erd}
 * @throws {ErdError} when the document cannot be trusted
 */
export function parseErd(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new ErdError('the ERD is empty; an empty diagram declares nothing and cannot be checked against');
  }
  const lines = text.split('\n').map((line) => line.trim());
  // Comments are stripped before anything else, because `%%` inside a diagram is Mermaid's own and
  // a reader that treated one as a relationship would invent an entity out of a note.
  const body = lines.filter((line) => line !== '' && !line.startsWith('%%'));

  const first = body.findIndex((line) => /^erDiagram\b/.test(line));
  if (first !== 0) {
    throw new ErdError(
      'the ERD does not begin with `erDiagram`. A different diagram type parsed as an ERD would produce ' +
        'entities nobody declared, so this refuses rather than guessing what it is looking at.',
    );
  }

  /** @type {Map<string, ErdAttribute[]>} */
  const entities = new Map();
  /** @type {ErdRelationship[]} */
  const relationships = [];
  /** @type {string | null} */
  let open = null;

  for (const [index, line] of body.slice(1).entries()) {
    const where = `line ${index + 2}`;
    if (open !== null) {
      if (line === '}') {
        open = null;
        continue;
      }
      const attribute = ATTRIBUTE_RE.exec(line);
      if (attribute === null) {
        throw new ErdError(`${where}: ${JSON.stringify(line)} is not a readable attribute of ${open}`);
      }
      const keys = (attribute[3] ?? '').split(',').map((key) => key.trim()).filter((key) => key !== '');
      const attributes = /** @type {ErdAttribute[]} */ (entities.get(open));
      if (attributes.some((existing) => existing.name === attribute[2])) {
        throw new ErdError(`${where}: ${open} declares ${attribute[2]} twice, so the declaration is ambiguous`);
      }
      attributes.push({ type: attribute[1], name: attribute[2], keys, comment: attribute[4] ?? '' });
      continue;
    }

    const opened = ENTITY_OPEN_RE.exec(line);
    if (opened !== null) {
      if (entities.has(opened[1]) && /** @type {ErdAttribute[]} */ (entities.get(opened[1])).length > 0) {
        throw new ErdError(`${where}: ${opened[1]} has more than one attribute block, so its shape is ambiguous`);
      }
      if (!entities.has(opened[1])) entities.set(opened[1], []);
      open = opened[1];
      continue;
    }

    const related = RELATIONSHIP_RE.exec(line);
    if (related === null) {
      // Fail closed. A line this reader cannot classify may be a relationship in a notation it has
      // not verified, and skipping it would silently drop a constraint the gate is meant to check.
      throw new ErdError(
        `${where}: ${JSON.stringify(line)} is neither a relationship nor an entity block. This reader refuses ` +
          'what it cannot classify, because a dropped line is a constraint nobody checks.',
      );
    }
    const [, left, leftToken, relation, rightToken, right, label] = related;
    relationships.push({
      left,
      right,
      leftCardinality: LEFT_CARDINALITY[/** @type {keyof typeof LEFT_CARDINALITY} */ (leftToken)],
      rightCardinality: RIGHT_CARDINALITY[/** @type {keyof typeof RIGHT_CARDINALITY} */ (rightToken)],
      identifying: RELATION[/** @type {keyof typeof RELATION} */ (relation)],
      // A quoted label is the same label. Mermaid allows quotes so a label may contain spaces, and
      // keeping them would make `places` and `"places"` two different strings to anything comparing
      // labels later.
      label: label.trim().replace(/^"(.*)"$/, '$1'),
    });
    // An entity named only by a relationship is still an entity — mermaid allows it, and the gate
    // must know the table exists even when the ERD says nothing about its columns.
    for (const name of [left, right]) if (!entities.has(name)) entities.set(name, []);
  }

  if (open !== null) {
    throw new ErdError(`the attribute block for ${open} is never closed, so its declaration is incomplete`);
  }
  if (entities.size === 0) {
    throw new ErdError('the ERD declares no entities at all, so there is nothing for a schema to conform to');
  }

  return {
    entities: [...entities].map(([name, attributes]) => ({ name, attributes })),
    relationships,
  };
}

/**
 * Every entity name an ERD declares, sorted.
 *
 * @param {Erd} erd
 * @returns {string[]}
 */
export function entityNames(erd) {
  return erd.entities.map((entity) => entity.name).sort();
}

/**
 * Reduce a name to what two authors writing the same thing would share.
 *
 * `LINE_ITEM`, `line item`, `line-item` and `LineItem` all become `lineitem`. Deliberately
 * aggressive, and the direction is chosen: this feeds a check that **refuses a run**, so a false
 * match costs nothing and a false miss blocks a correct specification at the door. Over-matching is
 * the safe error here, which is the opposite of the polarity most of this repository uses — and the
 * reason is that this check is not the thing enforcing the schema. The gate is.
 *
 * @param {string} name
 * @returns {string}
 */
function fold(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Entities the ERD declares that the specification never mentions.
 *
 * **The ERD refines the PRD; it never competes with it.** The PRD stays source of truth for
 * behaviour and the ERD constrains schema shape, so an entity appearing only in the diagram is the
 * diagram inventing a requirement — the oracle's named defect arriving through a second input. It is
 * caught at preflight rather than at a gate, because you do not build against an inconsistent
 * specification and finding out four iterations in costs four iterations.
 *
 * Singular and plural are both accepted: a PRD that says "orders" has mentioned `ORDER`. That is the
 * over-matching this function is deliberately built for.
 *
 * @param {Erd} erd
 * @param {string} specification the PRD text
 * @returns {string[]} the unmentioned entity names, sorted
 */
export function unmentionedEntities(erd, specification) {
  const folded = fold(typeof specification === 'string' ? specification : '');
  return erd.entities
    .map((entity) => entity.name)
    .filter((name) => {
      const key = fold(name);
      if (key === '') return true;
      // A trailing `s` on either side is the same word. Checked both ways so `CATEGORIES` finds
      // "category" only if the author wrote it, while `ORDER` finds "orders".
      return !(folded.includes(key) || folded.includes(`${key}s`) || (key.endsWith('s') && folded.includes(key.slice(0, -1))));
    })
    .sort();
}
