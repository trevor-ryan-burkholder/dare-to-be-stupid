# ADR-0001: Keep project documentation modular behind a canonical index

**Status:** Accepted
**Date:** 15 August 2026; amended 19 August 2026
**Decider:** Repository owner

## Context

The root accumulated more than fourteen thousand lines across a specification, contributor
rules, multiple plans, an execution ledger, dogfood records, external review findings, and
research notes. Several historical documents still looked executable, and duplicated status
statements drifted independently.

A single PRD would reduce the file count but would combine stable requirements with volatile
status and append-only evidence. For human readers that makes ownership unclear. For LLMs it
causes historical instructions and current requirements to compete for attention even when the
context window can hold all of them.

## Decision

Keep documents modular by lifecycle and owner. Add `docs/INDEX.md` as the canonical authority
map and read router. Keep compatibility stubs at historical root filenames, move full frozen
content under `docs/history/`, and keep research under `docs/research/`.

`DESIGN.md` remains the normative product and architecture source. A 19 August amendment assigns
numbered repository invariants and their enforcement to `CONSTITUTION.md`. `PLAN.md` owns live
backlog status. `REVIEW.md` remains reviewer-owned. `HANDOFF.md` becomes a short current-state
summary; its chronology is archived.

## Options considered

| Option | Benefits | Costs |
|---|---|---|
| Modular documents with an index | Selective LLM context, explicit ownership, smaller diffs, clean history/current boundary | Requires link and authority discipline |
| One consolidated PRD/SAD | One search surface and one apparent authority | Very large context, mixed lifecycles, high churn, unclear review ownership, stale instructions remain salient |

## Consequences

- Agents must read `docs/INDEX.md` before traversing project-management documents.
- Archived files are evidence only and may contain statements that were true at their snapshot.
- Root compatibility stubs preserve old links without presenting historical checklists as live.
- Mutable facts are linked to their owner instead of copied across documents.
- Documentation consistency checks should be expanded when a repeated drift class is found.
