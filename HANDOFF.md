# START HERE — current handoff, last swept 19 August 2026

**State:** working-tree candidate `0.272.0` on `main`; the manifests and the package-lock root
metadata agree, and `npm run release-check` is the check that says so.

**This paragraph names no commit, and that is a rule the gate now enforces** (`REVIEW.md` F40). It
used to say which object HEAD was and which uncommitted layer sat above it. Both are true for
minutes; both went stale, three separate times, the last of them while the finding about it was
open — and `release-check` passed each time, because it validated the version token and nothing
around it. Ask git where the tree is. Read `PLAN.md` for what is being worked on and in what order,
and `REVIEW.md` for external finding status and its counts. Nothing here restates either.

Every slice's own validation is recorded at its `PLAN.md` item, with the numbers it actually ran.
The section below holds only evidence that outlives one slice.

## Acceptance and next work

`REVIEW.md` remains **CHANGES REQUESTED** and is the only authority for external finding status.
`PLAN.md` is the only implementation queue. Review-pending repairs do not pause independent work;
request Codex closure only at a documented dependency or release boundary.

**No list of items lives here, and the gate refuses one** (`REVIEW.md` F40, item 98 before it).
This section held a bullet per recent PLAN item twice, and both times it fell out of order, out of
date, and into disagreement with `PLAN.md` — which is the only queue. What each slice did, what it
was measured against, and what remains are recorded at the item, in `PLAN.md`, once.

Do not reconstruct priority from release chronology. Read the current traversal at the top of
`PLAN.md`, then the selected item and any linked `REVIEW.md` finding.

## Measured evidence

**Stamped with the version it was taken at, always.** A measurement with no version attached reads as
current, and these do not stay current for one commit. The candidate's own numbers live at its
`PLAN.md` item; what is here is evidence that keeps mattering after the slice that produced it.

- **Deterministic gates for 0.208.0:** `npm run slice-check -- verify --no-integration` passed lint,
  type checking, unit tests, release checks, and the stable **66-file** loader/package fingerprint.
  The focused changed-path run passed **1,029 of 1,029** tests. `npm run test:integration` passed
  **176 of 176** in 336 seconds. **Item 109 then landed in the same candidate**, so those numbers were
  superseded: `npm test` **2,715 of 2,715**, and tier 2 re-run over the changed behaviour — see item
  109 for the per-finding evidence and its red proofs. The first integration invocation outlived its outer 180-second
  command wrapper and lost its captured exit status; it was allowed to finish before the clean,
  non-overlapping measured rerun.
- **Live compatibility evidence:** the admitted range is **2.1.226 through 2.1.235**. 2.1.235 was
  refused for two days on a 33-of-34 result — the one `improve-contract` document-authoring case
  failing once and passing twice, the known non-deterministic shape also seen on 2.1.234 — and was
  admitted on 20 August 2026 when the tier passed **39 of 39** uncontended against the 0.261.0
  candidate. For those two days this host could not start a run, because it had auto-updated to
  2.1.235; the answer was to produce the missing run, not to lower the bar. PLAN items 107 and 140
  hold both halves, and the evidence list still cites the refused run.
- **The full live tier passed 39 of 39 at 0.260.0**, uncontended, in 668 seconds — the first time it
  had ever been run against two of its own cases. Both failed. One was a bash-only `${!n+x}` probe on
  a zsh host, which could not have passed in any state of the product; the other was a 300-second
  ceiling on a child measured at 170.7s and 178.7s, which only ever fired beside a concurrent
  fan-out. A tier that is never run is not evidence, and neither of those was a product defect —
  which is the point. Deferring the tier is what kept them invisible.
- **What the sandbox actually enforces, measured 20 Aug 2026 on 2.1.235 with bubblewrap and socat
  installed.** `filesystem.denyRead` and `network.deniedDomains` are enforced. `network.allowedDomains`
  is **not a boundary** — a host absent from it is still reachable — and `allowManagedDomainsOnly` has
  no effect from a `--settings` file, so **an egress allowlist is unavailable to this plugin**. And
  `failIfUnavailable` checks that the dependencies *exist*, not that the sandbox *started*: on this
  kernel `unshare(CLONE_NEWUSER)` fails and a child reported disabling the sandbox to get its result.
  The run therefore *observes* confinement with a canary probe before trusting it (item 144).
- **The declared sandbox enforced nothing, measured 20 Aug 2026 on 2.1.235.** `{"enabled": true}`
  — what this product shipped — let a child read a synthetic credential file outside its workspace,
  reach the network, and list `~/.ssh`, results identical to declaring no sandbox at all, because
  the host lacks bubblewrap and socat and the CLI degrades silently. `failIfUnavailable: true` turns
  the same profile into a refusal; preflight now probes socat as well as bwrap. **Nothing here shows
  that a working sandbox confines anything** — this host cannot start one. PLAN items 84 and 142.
- **Historical warning:** a mechanism can be complete, documented and dead. At 0.249.0 the sealed
  Claude binary landed with fifteen red proofs and five real-filesystem fixtures; **nothing called
  it** until 0.261.0, because every proof handed `spawnClaude` a seal by hand and no production path
  ever did. Before trusting a guarantee here, check that something in the run actually invokes it.
  PLAN item 139 has the full account.
- **Historical warning:** 0.182.0 committed mutation-test scaffolding after its recorded gates;
  0.183.0 restored the guard. PLAN items 91 and 99 contain the failure analysis. Do not use
  0.182.0's green numbers as evidence for its committed bytes.

## Documentation routes

- `docs/INDEX.md` — authority, audience, ownership, and read order.
- `DESIGN.md` — normative product and architecture specification.
- `CLAUDE.md` / `AGENTS.md` — contributor execution contract and exact mirror.
- `PLAN.md` — live implementation status and ordering.
- `REVIEW.md` — Codex-owned external findings and closure evidence.
- `DOGFOOD.md` — pending experiments and current scenario status.
- `docs/history/` and `docs/research/` — evidence only, never current instructions.

Completed chronology belongs under `docs/history/`; do not add another release-by-release ledger
here.
