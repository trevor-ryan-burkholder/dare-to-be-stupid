# START HERE — current handoff, last swept 17 August 2026

**State:** `main` at `0.164.0`. The manifests and package-lock root metadata agree. Measured
on the current tree with Node 24.14.1: `npm run lint` and `npm run typecheck` clean;
`npm test` **2307 pass, 0 fail**;
`npm run test:integration` **51 pass, 0 fail**; `npm run release-check` **ok**. These commands
were rerun after the documentation repair; no paid live test was invoked.

**External review:** `REVIEW.md` is **CHANGES REQUESTED** with sixteen high-priority defects
(F1–F3, F5–F8, F12, F14, F16, F18, F25–F29) and thirteen medium-priority defects
(F4, F9–F11, F13, F15, F17, F19–F24). The expanded review includes a
guarantee-strength audit, durable-artifact registry, failure-shape matrix, and explicit
negative-guarantee sheet. These are the first implementation gates in `PLAN.md`. Claude Code may
implement them; Codex owns closure after reviewing the exact repair and its acceptance evidence.

**Paid live tier:** not rerun for this documentation-only cleanup. At 0.161.0 an intermediate
`CI=1` change failed one live test and was reverted before release; the shipped change was
toolchain-guidance prose. The full chronology and earlier successful live measurements are in
the archived handoff.

## Current implementation order

1. Close the locally implementable high-priority defects: F1–F3, F6/item 60, F7/item 61,
   F12/item 66, F8/item 62, F14/item 68, F16/item 70, F18/item 72, and F26/item 81. Item 81
   follows F1 so launch revalidation and pre-loop output admission occur under the atomic owner.
   Item 66 supplies the specification identity consumed by items 62 and 68; F2 includes the
   resistant output-cap path.
2. Close the external contracts before feature fan-out: F5/item 56 through a paid child-environment
   probe, F11/item 65 through real Windows descendant-cleanup evidence, and F15/item 69 through an
   Oracle-read canary and an honest confidentiality decision. Add F21/item 75's disposable real
   loader/cache release check and F25/item 80's user-only command-surface canary in the same
   external-contract campaign; batch item 80 with F24/item 79's versioned command repair. Close
   F27/item 82 with pinned role-tool availability canaries, including the real Oracle-author phase.
   Close F28/item 83 in that same pinned matrix by deriving and enforcing the oldest CLI that
   passes every mandatory contract; a version pass does not replace those canaries. After item 66
   from step 1, close item 77's cold-role supply manifest here, before its consumer. Then close
   F29/item 85 after items 66/68/77/82/83: candidate files remain evidence, while reviewer
   authority comes only from identified pre-Builder and Driver-owned sources. Its reviewer contract
   is not PLAN item 51's general constitution.
3. Close F4, F9/item 63, F10/item 64, F13/item 67, F17/item 71, F19/item 73, F20/item 74,
   F22/item 76, and F23/item 78. F24/item 79 already lands once in step 2's shared command/loader
   slice; its Gate 0C classification does not create a second implementation pass.
4. Complete item 40's reviewer contract after F6. Item 77 already lands in step 2 because F29
   consumes it; it complements but does not close F15's filesystem-confidentiality question. Then
   finish item 42 and item 29. Item 41 is closed as inapplicable because no Panel diff-package path
   exists.
5. Complete the live evidence for item 24, add item 57's machine-readable acceptance result, run
   dogfood cases A and B in item 20, and run the staged Ateliers capstone in item 31. Case C remains
   parked by operator decision.
6. After items 56/82/83 establish the environment, tool, and CLI identities, run item 84's paid
   child-containment experiment. Record a portable default, a capability-gated profile, or rejection;
   do not infer a stronger default from documentation or settings registration.
7. Take items 52 and 53 only after the safety/reviewer work.
8. Consult PLAN's research-gated and conditional entry for items 54, 55, and 58 only after the
   queued implementation work; item 54 additionally requires item 77 and item 84's recorded
   containment outcome, and PLAN alone decides when any of them enters the queue.
9. Keep item 21 deferred until the repository is code-complete; Phase 6 and PLAN item 59 remain
   post-DoD. Item 86 remains parked behind its containment and incremental-detection admission
   conditions.

PLAN owns the statuses. This file deliberately does not duplicate their acceptance criteria.

## Architecture analysis

[`docs/DYNAMIC-WORKFLOWS-AND-PROVENANCE.md`](docs/DYNAMIC-WORKFLOWS-AND-PROVENANCE.md) records the
current source-backed architecture analysis, conceptual durable-state ER diagram, and cross-role
information-flow map. The decision is **partial adoption by experiment** for role-internal dynamic
workflows, with Driver, Builder, Panel, and Oracle authority unchanged. It also records Verified
Research as an existing producer-authority job contract and a Red assessment job as a parked
post-DoD experiment; both require independently cold evidence and preserve Driver terminal
authority. A general explicit graph is **not approved**; exact evidence identity and minimal
dependency metadata are the only conditional next step. No runtime behavior changed.

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
