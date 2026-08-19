# START HERE — current handoff, last swept 18 August 2026

**State:** working-tree candidate `0.214.0` on `main`; the manifests and package-lock root metadata
agree. HEAD is `0e1ed2e`, the committed 0.213.0 tree — the documentation-system sweep,
the code-review repairs of PLAN items 100, 107 and 108, and the REVIEW re-baseline of item 109. The
0.209.0 working-tree candidate on top of it is PLAN item 110: the installed-snapshot harness that
F21 asked for, and the two evidence-quality repairs F15 and F17 turned out to still need.
Deterministic validation of the complete tree is recorded below.

## Acceptance and next work

`REVIEW.md` remains **CHANGES REQUESTED** and is the only authority for external finding status.
`PLAN.md` is the only implementation queue. Review-pending repairs do not pause independent work;
request Codex closure only at a documented dependency or release boundary.

The newest candidate work is recorded at its canonical PLAN items:

- items 80 and 82: command-selection and exact role-tool contracts;
- item 83: measured Claude Code compatibility, still partial until binary identity and update control
  are sealed;
- item 85: reviewer authority isolation, still partial pending its remaining evidence; and
- item 100: the shared loader/release fingerprint now covers `skills/` and both plugin manifests;
- item 107: Claude Code 2.1.235 was measured but not admitted after a 33-of-34 full-tier run; and
- item 108: exact version-output parsing and fail-closed nesting-depth parsing; and
- item 109: the re-baseline of every open `REVIEW.md` finding against this candidate, which closed
  the last reproducible clauses of F2, F10, F17, F19, F26 and F41 and left the rest classified; and
- item 110: F21's installed-snapshot harness, plus the two evidence leaks building it uncovered —
  the oracle printing its own expected output into the builder's failure detail (F15), and a skipped
  test being recorded as observed failing (F17); and
- item 111: `npm run install-check`, which installs the candidate the way a loader does — offline,
  isolated, free — and asserts the pinned commit, the installed bytes, and that the module graph
  resolves entirely from the install rather than from this checkout; and
- item 112: the acceptance receipt — a typed, versioned claim bound to the reviewed tree, written at
  the terminal transition, recording the gate roster and results, the panel and ratchet edges, and
  each role invocation's requested *and* vendor-observed model; and
- item 116: the guard half of F42 — the shipped Driver is a nested run however it is spelled — and
  a wider bypass found while repairing it: an `env` prefix with flags blinded every command-name
  rule, so `env -u FOO git push --force` and `env -u FOO rm -rf /` were both allowed;
- item 115: the canonical run lock published atomically, so a crash in the create/write seam can no
  longer brick a repository (F43);
- item 114: process ownership as a kernel-level group, and every Driver-owned Git call bounded and
  non-interactive on top of it (F33 reopened, F44); and
- item 113: the repairs an adversarial audit of that receipt found — chief among them that it could
  bind one iteration's gate results to another iteration's sealed tree and verify clean.

Do not reconstruct priority from release chronology. Read the current traversal at the top of
`PLAN.md`, then the selected item and any linked `REVIEW.md` finding.

## Measured evidence

- **Deterministic gates for 0.208.0:** `npm run slice-check -- verify --no-integration` passed lint,
  type checking, unit tests, release checks, and the stable **66-file** loader/package fingerprint.
  The focused changed-path run passed **1,029 of 1,029** tests. `npm run test:integration` passed
  **176 of 176** in 336 seconds. **Item 109 then landed in the same candidate**, so those numbers were
  superseded: `npm test` **2,715 of 2,715**, and tier 2 re-run over the changed behaviour — see item
  109 for the per-finding evidence and its red proofs. The first integration invocation outlived its outer 180-second
  command wrapper and lost its captured exit status; it was allowed to finish before the clean,
  non-overlapping measured rerun.
- **Live compatibility evidence:** the 2.1.235 run completed 33 of 34 tests and did not widen the
  admitted 2.1.226-through-2.1.234 range. The one
  `improve-contract` document-authoring case failed once and passed twice, matching the known
  non-deterministic failure shape seen on 2.1.234. PLAN item 107 records the diagnosis without
  relabelling the failed full-suite result as a pass.
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
