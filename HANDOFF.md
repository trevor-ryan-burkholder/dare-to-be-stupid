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

## Decisions

All recorded in `DESIGN.md` §14, alongside the one question deliberately left open:
whether to add a backend or security quality plugin beside impeccable, which only inspects
user interfaces.
