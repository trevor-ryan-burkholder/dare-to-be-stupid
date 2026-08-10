# Verification status

The build is finished. All eight slices of `DESIGN.md` §12 are implemented and gated —
see the README for what each one does, and `DESIGN.md` for why.

This file tracks the one thing the test suite cannot settle: whether the pieces work
against reality. Everything below was either verified live or is still outstanding.

---

## Verified live

**Guard hook fires under a real PreToolUse event.** With the plugin installed, a command
writing to the ratchet state file was denied and tagged `[dare:protected-state]`, while a
command merely mentioning the slash command in prose ran normally. Both halves matter: a
guard that blocks everything is not a guard.

**`claude -p` children spawn and return parseable output.** Verified against claude
2.1.226. `--output-format json` returns an envelope carrying `result`, `is_error`,
`total_cost_usd` and a `usage` breakdown; `parseClaudeEnvelope` reads those field names, and
budget accounting uses the reported figures rather than an estimate. A trivial prompt cost
$0.26 because of cache creation, which is why nothing here estimates.

**Children do not inherit the operator's output style.** A child asked only for a field of
`package.json` answered in the persona the operator had active. Every child is now launched
with an explicit default style — for the reviewer that is a correctness fix, since its
output is machine-parsed.

**`extractTestIds` against live reporter output.** A real vitest run with one passing, one
failing and one skipped test yielded exactly the one passing ID.

**Install path works end to end.** With the caveat that cost several hours: the install
cache is keyed by version, and stale copies masquerade as failed fixes. See "Releasing" in
`CLAUDE.md` before debugging any plugin change.

## Outstanding

**A deliberately incomplete build must draw a `fail` from a cold reviewer.** Plant a missing
requirement, run the reviewer template through a `claude -p` child, and confirm the parser
returns `fail` with `file:line` evidence on what *was* built. The parser is unit-tested
hard; what is unproven is whether a real reviewer, given the real prompt, produces output
in the shape the parser expects.

**A first real run.** Against a throwaway repository with an initial commit and
`deploy.enabled: false`. The loop is the only major component that has never met reality.
Watch the ratchet catch one regression before letting it run long — that behaviour is the
reason the whole design exists, and it has only ever been exercised against temporary
repositories built by the test suite.

---

## Next architecture iteration

Two invariant bugs were found and fixed in 0.1.4 — the re-entrancy marker was built and
discarded so no child ever received it, and dangerous mode was not builder-only. Both are
described in that commit. The following were specified alongside them and deliberately
left undone, in roughly this order:

1. **Reviewer ownership.** `DESIGN.md` §1.1 describes a specialized panel, but the code has
   every reviewer adjudicate every requirement. Heterogeneous ownership needs: each reviewer
   receiving only the ids it owns, every owned id required back, the union of ownership
   covering every PRD and DoD id, and an uncovered id failing *before* review begins. The
   largest of these, and the one real spec mismatch left.
2. **Build Brief** (`scripts/brief.mjs`) — a deterministic per-iteration task compiled from
   driver-owned evidence rather than conversation, archived to `.dare/briefs/iter-NNN.md`.
3. **Lesson memory** (`scripts/lessons.mjs`, `templates/lesson-extractor.md`) — sparse,
   evidence-derived, driver-owned, never builder-writable. Extraction must never fail a
   build. No embeddings, no vector store.
4. **Advisory finding metadata** — severity and confidence for *advisory* findings only.
   PRD and DoD failures stay deterministic blockers regardless of confidence.
5. **Behavioural gates** — the `ci`, `docs` and `observability` gates currently check for
   presence, not behaviour. Health could be probed, and a workflow inspected for whether it
   actually invokes the validation commands.
6. **Conditional git-history context** — only when modifying mature code, kept narrow.
7. **Stalled-only worktree racing.** `race: { enabled, n }` is already in `DESIGN.md` §10 and
   in the config schema, and is unimplemented. An escape maneuver, not the normal path:
   disabled by default, budget-respecting, deterministic winner selection.

When adding a phase, note that `PHASE_PERMISSIONS` in `scripts/driver.mjs` throws for an
undeclared phase rather than defaulting. `lesson-extractor` has no policy yet, so it will
fail closed until one is written — deliberately.

## Unverified risk

The `prd` and `design` phases moved from a blanket permission bypass to
`--allowedTools Read Glob Grep Write Edit`. That has **not** been confirmed against a live
child. If the flag does not in fact permit writing, both phases fail at the first real run.
Cheap to check: start a small run and see whether `PRD.md` appears.

## Decisions

All recorded in `DESIGN.md` §14, alongside the one question deliberately left open:
whether to add a backend or security quality plugin beside impeccable, which only inspects
user interfaces.
