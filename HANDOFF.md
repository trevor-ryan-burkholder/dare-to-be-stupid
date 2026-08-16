# START HERE — current handoff, last swept 16 August 2026

**State:** `main` at `0.164.0`. The manifests and package-lock root metadata agree. Measured
on the current tree with Node 24.14.1: `npm run lint` and `npm run typecheck` clean;
`npm test` **2307 pass, 0 fail**;
`npm run test:integration` **51 pass, 0 fail**; `npm run release-check` **ok**. These commands
were rerun after the documentation repair; no paid live test was invoked.

**External review:** `REVIEW.md` is **CHANGES REQUESTED**. F1–F3 and F5 are high-priority safety
defects; F4 is a medium-priority timeout defect. They are the first implementation gates in
`PLAN.md`. Claude Code may implement them; Codex owns closure after reviewing the exact repair
and its acceptance evidence.

**Paid live tier:** not rerun for this documentation-only cleanup. At 0.161.0 an intermediate
`CI=1` change failed one live test and was reverted before release; the shipped change was
toolchain-guidance prose. The full chronology and earlier successful live measurements are in
the archived handoff.

## Current implementation order

1. Close `REVIEW.md` F1–F4 without changing the Claude-native runtime architecture; F2 includes the
   resistant output-cap path.
2. Close `REVIEW.md` F5 through PLAN item 56's live-contract probe and child-environment boundary
   before feature fan-out.
3. Finish PLAN items 40, 41, and 42; then item 29.
4. Complete the live evidence for item 24, add item 57's machine-readable acceptance result, run
   dogfood cases A and B in item 20, and run the staged Ateliers capstone in item 31. Case C remains
   parked by operator decision.
5. Take items 52 and 53 only after the safety/reviewer work.
6. Consult PLAN's research-gated and conditional entry for items 54, 55, and 58 only after the
   queued implementation work; PLAN alone decides when any of them enters the queue.
7. Keep item 21 deferred until the repository is code-complete; Phase 6 and PLAN item 59 remain post-DoD.

PLAN owns the statuses. This file deliberately does not duplicate their acceptance criteria.

## Architecture analysis added on 16 August

[`docs/DYNAMIC-WORKFLOWS-AND-PROVENANCE.md`](docs/DYNAMIC-WORKFLOWS-AND-PROVENANCE.md) records the
current source-backed architecture analysis, conceptual durable-state ER diagram, and cross-role
information-flow map. The decision is **partial adoption by experiment** for role-internal dynamic
workflows, with Driver, Builder, Panel, and Oracle authority unchanged. A general explicit graph is
**not approved**; exact evidence identity and minimal dependency metadata are the only conditional
next step. No runtime behavior changed.

## Documentation routes

- `docs/INDEX.md` — authority, ownership, and read order.
- `DESIGN.md` — normative product and architecture specification.
- `PLAN.md` — only live implementation plan.
- `REVIEW.md` — Codex-owned external findings.
- `DOGFOOD.md` — pending experiments and scenario status.
- `docs/DYNAMIC-WORKFLOWS-AND-PROVENANCE.md` — supporting architecture analysis and experiment design;
  `DESIGN.md` §15 owns the normative boundary.
- [`docs/history/HANDOFF-through-0.161.0.md`](docs/history/HANDOFF-through-0.161.0.md) — full
  execution chronology through this release.

The Ateliers campaign is recorded as **OPEN, STAGED** because that is what the repository can
prove. An external run changes this file only when its terminal state and evidence have been
recorded.
