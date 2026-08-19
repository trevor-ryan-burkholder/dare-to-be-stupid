# ERD fixtures

Mermaid `erDiagram` documents for `scripts/erd.mjs`.

## What is verified about the grammar, and what is not

The cardinality **token names** were read out of **mermaid 11.17.0's own compiled grammar** —
`dist/chunks/mermaid.core/erDiagram-*.mjs.map` embeds `erDiagram.jison`, whose symbol table names
`ZERO_OR_ONE`, `ZERO_OR_MORE`, `ONE_OR_MORE`, `ONLY_ONE`, `MD_PARENT`, `NON_IDENTIFYING` and
`IDENTIFYING`. That is a measurement, and it is the half that decides which relationships the format
has at all.

**End-to-end agreement with mermaid's parser was attempted and not achieved.** `mermaid.parse()`
would be the real check, and loading it standalone needs the package's full dependency tree, which
this repository will not take on for a test. So the parser **fails closed on every token it has not
verified**: an unrecognised cardinality raises rather than being guessed at, and `MD_PARENT` is
unsupported rather than approximated — a wrong reading of a relationship is worse than a refusal to
read it.

**Residual, recorded rather than implied:** these documents are believed-valid Mermaid, not
machine-confirmed Mermaid. The cheap discharge is to paste `orders.md` into any Mermaid renderer and
confirm it draws what the parse says it declares. Until then, a case that depends on Mermaid
accepting exactly this text is not proved by this fixture.

## `orders.md`

Exercises all four cardinalities in both positions, both relation types (`--` identifying and `..`
non-identifying), a quoted relationship label, attribute keys (`PK`, `FK`), a quoted attribute
comment, and an entity (`COURIER`, `DELIVERY_ADDRESS`) named only by a relationship and given no
attribute block — which is legal and which the schema gate still has to know about.
