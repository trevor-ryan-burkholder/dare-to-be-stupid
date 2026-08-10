# Build handoff — paste this into Claude Code

Open this repo in Claude Code and paste the block below as the first message.

Everything it needs is already in the repo: `DESIGN.md` (full spec, all questions resolved)
and `CLAUDE.md` (conventions, invariants, test gates, slice rules).

---

## The prompt

```
Read DESIGN.md and CLAUDE.md fully before writing anything. DESIGN.md is the spec and the
source of truth; CLAUDE.md is how we work in this repo.

Build the plugin in the slice order given in DESIGN.md §12. Do not jump ahead — the first
three slices (guard.mjs, extractTestIds, ratchet) are the product, and driver.mjs does not
start until they are unit-tested in isolation.

Ground rules:
- Node >= 22.12, ESM .mjs, no runtime dependencies. node: builtins and shelling out only.
- One slice per commit: code + tests + docs land together.
- Fixture tests over mocks for anything parsing external output. extractTestIds must be
  tested against real, committed vitest and Playwright reporter JSON — generate that output
  from an actual throwaway test run and commit it to test/fixtures/. DESIGN.md §11 calls
  this the component most likely to fail silently; treat it that way.
- Assert values, never truthiness. Test deny paths and allow paths for guard.mjs.
- Do not violate the invariants in CLAUDE.md. If a change seems to require it, stop and say
  so rather than working around it.

I direct, you execute. If something is ambiguous, pick the defensible option and note the
assumption inline instead of stopping to ask.

Start with slice 1: hooks/guard.mjs plus its fixture tests. Show me the blocked-category
tests and the benign-neighbour tests before moving on.
```

---

## Slice checklist

Track against `DESIGN.md` §12.

- [x] 1 — `hooks/guard.mjs` + `hooks/hooks.json`, block/allow fixture tests
      (item 1 under "Verification that can only happen in Claude Code" is still outstanding)
- [x] 2 — `extractTestIds` + fixtures from **real** vitest and Playwright reporter output
      (two runs of each committed; verification item 3 below still wants a live check)
- [x] 3 — ratchet logic, isolated and unit-tested (monotonic pass-set, hard reset path)
- [ ] 4 — `scripts/plugins.mjs` (impeccable install) + `scripts/init.js` (preflight, §3.5/§3.6)
- [ ] 5 — `scripts/driver.mjs` loop wiring, terminal states, model routing (§10)
- [ ] 6 — `templates/`: prd-author, architect, builder-system, reviewer-system
- [ ] 7 — `output-styles/junkion.md` + launch banner and terminal-state stamps (§9.1)
- [ ] 8 — `.claude-plugin/plugin.json` + `marketplace.json`, install smoke test

---

## Verification that can only happen in Claude Code

These are the reasons the build moved out of Cowork — none of them can run in a sandbox
without the `claude` CLI. Do them before trusting a long run.

1. **Guard hook actually fires.** Install the plugin locally and confirm `guard.mjs` denies
   a write to `.dare/state.json` under a real PreToolUse event — not just in unit tests.
2. **`claude -p` child processes spawn and return parseable output.** The driver's whole
   architecture depends on this working non-interactively with inherited auth.
3. **`extractTestIds` against live reporter output**, not just the committed fixtures —
   confirm the ID set is non-empty and stable across two identical runs.
4. **Reviewer JSON parses**, and a deliberately incomplete build actually gets a `fail`
   verdict with `file:line` evidence. Plant a missing requirement and confirm it's caught.
5. **Install path works end to end:**
   ```
   /plugin marketplace add trevor-ryan-burkholder/dare-to-be-stupid
   /plugin install dare-to-be-stupid@dare-to-be-stupid
   ```
6. **First real `/dare`** — against a throwaway repo, `deploy.enabled: false`, low
   `maxIterations`. Watch the ratchet catch one regression before letting it run long.

---

## Open items

None blocking. All `DESIGN.md` §14 questions are resolved:

| Decision | Landed on |
|---|---|
| impeccable | `npx impeccable install`; gate (`impeccable detect`) + build-time guidance (§5.1) |
| `/dare` no args | "dare me" mode invents its own PRD (§13.1) |
| Deploy | pluggable `deploy.command`, off by default, Vercel preview reference recipe (§10) |
| Reviewers | specialized cold panel: security / correctness / design (§1.1) |
| Models | Sonnet 5 builder, Opus 5 reviewer + design, Sonnet 5 PRD, Fable 5 style/ideas (§10) |

Still genuinely undecided, and safe to defer until after slice 5: whether to add a
backend/security quality plugin alongside impeccable, which is frontend-only.
