# ADR-0002: Keep the operator dashboard in a read-only observer

**Status:** Accepted
**Date:** 21 August 2026
**Decider:** Repository owner

## Context

Long unattended runs leave useful evidence across Driver-owned receipts and a narrow forensic
journal. An animated dashboard can make that evidence legible, but embedding a web UI in the Driver,
scraping terminal output, or creating a second event/status ledger would give presentation code a new
authority path and could change run behavior when the UI disconnects or fails.

The current artifacts also lack a shared run-generation identity and atomic multi-file snapshot.
A read-only view must not imply coherence, liveness, or settlement that its inputs cannot prove.

## Decision

Build the dashboard, when `PLAN.md` item 166 is admitted, as a separately and explicitly started
Node observer:

- The observer reads bounded, contained run evidence and never writes repository or `.meeseeks/`
  state. The Driver neither starts it nor consumes its state, connection, or projections.
- The initial local transport is loopback-only HTTP with server-sent projection updates and no
  runtime dependencies. Exact Host, Origin, Fetch Metadata, CSP, path, and display allowlists are a
  product security boundary, not optional deployment hardening.
- Existing artifacts retain ownership of their facts. New observations are admitted only for facts
  the target experience cannot obtain from an existing owner, and remain unable to authorize work,
  accept a candidate, or establish terminal state.
- A complete target-schema projection consumes only generation-bound inputs. A Driver-owned atomic
  generation inventory binds every otherwise-unbound input and provides a revisioned publication
  boundary. Writers either publish immutable revisioned artifact paths before switching that inventory
  or publish a non-accepting `updating` state before changing bound paths. The observer validates a
  bounded snapshot between two matching complete-inventory reads; current schemas without that
  boundary are explicitly eventually consistent and show generation coherence as unavailable.
- Target-schema archives withdraw the current complete inventory, assemble beneath a contained
  non-discoverable stage, and atomically publish only after their bound members and finalized inventory
  are complete. In-progress archive movement is never presented as a coherent completed run.
- Replay re-renders recorded evidence. It cannot resume, retry, cancel, spawn, approve, or repeat a
  side effect. Transport cursors are observer cache coordinates rather than product evidence.
- The dashboard exposes no prompts, raw/full responses, hidden reasoning, generic repository files,
  or durable node-per-agent organization graph. Conditional workflow animation remains bounded,
  ephemeral, nested below its durable role, and dependent on the contracts in `DESIGN.md` §§15–16.

`DESIGN.md` §16 is the normative architecture. `DASHBOARD.md` owns visual and interaction detail,
and `PLAN.md` item 166 owns admission, sequencing, and completion. This decision does not itself ship
an observer, entrypoint, schema, or workflow feature.

## Options considered

| Option | Benefits | Costs |
|---|---|---|
| Separate read-only observer | Failure-isolated UI, explicit authority boundary, deterministic replay, Driver remains headless | Requires bounded readers, generation publication, and compatibility handling |
| Embed dashboard/control in Driver | Direct access to live in-memory state | Couples UI availability to run behavior and creates a second control surface |
| Scrape stdout or add a generic event/provenance system | Quick prototype and rich apparent activity | Styled output is not state; duplicates existing authorities and pressures collection of prompts or reasoning |

## Consequences

- The Driver remains the only run control plane and is unaffected by observer lifecycle.
- Rich live fields require the smallest explicit Driver-owned observational contracts; missing fields
  remain unavailable until those contracts ship.
- Old archives remain viewable but cannot claim generation or multi-file snapshot coherence.
- Implementing slices must update the applicable runtime sections, schemas, archive inventory, and
  tests together; animation fixtures cannot stand in for production evidence.
- Browser-origin attacks, path traversal, hostile model text, and secret exposure are in-scope local
  security concerns even though the server binds loopback.
