# START HERE — current handoff, last swept 16 August 2026

**State:** `main` at `0.164.0`. The manifests and package-lock root metadata agree. Measured
on the current tree with Node 24.14.1: `npm run lint` and `npm run typecheck` clean;
`npm test` **2307 pass, 0 fail**;
`npm run test:integration` **51 pass, 0 fail**; `npm run release-check` **ok**. These commands
were rerun after the documentation repair; no paid live test was invoked.

**External review:** `REVIEW.md` is **CHANGES REQUESTED** with eleven high-priority defects
(F1–F3, F5–F8, F12, F14, F16, F18) and eleven medium-priority defects
(F4, F9–F11, F13, F15, F17, F19–F22). The expanded review includes a
guarantee-strength audit, durable-artifact registry, failure-shape matrix, and explicit
negative-guarantee sheet. These are the first implementation gates in `PLAN.md`. Claude Code may
implement them; Codex owns closure after reviewing the exact repair and its acceptance evidence.

**Paid live tier:** not rerun for this documentation-only cleanup. At 0.161.0 an intermediate
`CI=1` change failed one live test and was reverted before release; the shipped change was
toolchain-guidance prose. The full chronology and earlier successful live measurements are in
the archived handoff.

## Current implementation order

1. Close the locally implementable high-priority defects: F1–F3, F6/item 60, F7/item 61,
   F8/item 62, F12/item 66, F14/item 68, F16/item 70, and F18/item 72. F2 includes the resistant
   output-cap path.
2. Close the external contracts before feature fan-out: F5/item 56 through a paid child-environment
   probe, F11/item 65 through real Windows descendant-cleanup evidence, and F15/item 69 through an
   Oracle-read canary and an honest confidentiality decision. Add F21/item 75's disposable real
   loader/cache release check in the same external-contract campaign.
3. Close F4, F9/item 63, F10/item 64, F13/item 67, F17/item 71, F19/item 73, F20/item 74,
   and F22/item 76.
4. Complete item 40's reviewer contract after F6, then finish item 42 and item 29. Item 41 is closed
   as inapplicable because no Panel diff-package path exists.
5. Complete the live evidence for item 24, add item 57's machine-readable acceptance result, run
   dogfood cases A and B in item 20, and run the staged Ateliers capstone in item 31. Case C remains
   parked by operator decision.
6. Take items 52 and 53 only after the safety/reviewer work.
7. Consult PLAN's research-gated and conditional entry for items 54, 55, and 58 only after the
   queued implementation work; PLAN alone decides when any of them enters the queue.
8. Keep item 21 deferred until the repository is code-complete; Phase 6 and PLAN item 59 remain
   post-DoD.

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
