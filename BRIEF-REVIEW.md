# Validation of `BRIEF.md`

Read against the repository at 0.18.0, static only. **The test suite was not executed** — the
sandbox could not mount the working tree — so every claim below comes from reading code, not
from running it.

Headline: **eight of the brief's items are already shipped**, seven have a defect that would
break an existing invariant if implemented as written, and eight are correctly identified
outstanding work. The brief's own instruction — "where this brief and the repository disagree,
the repository is the fact" — is doing most of the work, because they disagree a lot.

---

## 1. Already implemented — the brief is describing a repository older than this one

| Item | Shipped | Evidence |
|---|---|---|
| A1 `.dare/**` write protection | 0.10.0 | `hooks/guard.mjs` — `DARE_DIR_RE`, `isProtectedStatePath`, scoped by `DARE_RUNNING` |
| B1 capability manifest | 0.11.0 / 0.12.0 | `scripts/capabilities.mjs`, `.dare/capabilities.json`, declared ∪ detected |
| B2 toolchain adapters | 0.15.0 | `scripts/toolchains/{index,node,shared}.mjs` |
| B4 reporter registry (Node half) | 0.14.0 | `scripts/reporters/{index,vitest,playwright,shared}.mjs` |
| B5 capability-driven gates | 0.16.0 | `scripts/gate-policy.mjs` |
| C1 race by change magnitude | 0.13.0 | `parseNumstat`, `selectWinner` sorts lines → files → index |
| C2 run manifest | 0.17.0 | `scripts/run-manifest.mjs` |
| C3 three test tiers | 0.18.0 | `package.json` scripts, `DESIGN.md` §11.1, `CLAUDE.md` |

`DESIGN.md` already carries §3.7, §3.8, §4.2, §7.1 and §11.1 for these. Implementation-order
steps 7–13 and 17–18 are no-ops.

### Specific factual errors

- **A1.** "If `.dare/red-evidence.json` is currently writable by builders, that is the
  highest-priority defect on this page." It is not writable. That was the enumeration bug, it
  was fixed positionally, and the fix's reasoning is written into `guard.mjs`'s header.
  `test/guard.test.mjs:334–353` is a forgery-regression suite already — Write, Edit, `>`, `tee`,
  `cp`, `python3 -c`, and `cd .dare` without ever spelling the path.
- **C1.** "If selection currently equates smallest diff with fewest changed files" — the
  condition is false. The tie-break is already lines, then files, then index: the brief's
  ordering, verbatim.
- **C2.** "`.dare` state is currently replaced per run." False. `state.json` is loaded and
  carried forward — that is how the ratchet survives a run boundary — and briefs accumulate
  under `.dare/briefs/`. Only `run.json` is overwritten. The archiving idea still stands; its
  stated justification does not.
- **A8.** "Dare re-litigates every requirement at full cold-panel cost, every iteration."
  False. Phase 5 sits behind `if (!gateOutcome.ok) continue` (`driver.mjs:1158`) and behind the
  ratchet's reset and reject paths. An iteration that fails a gate never pays for a reviewer.
  Per `HANDOFF.md`, no run has ever reached the panel *twice*, so the DoD line "the measured
  effect of requirement pinning on review cost" cannot be satisfied — there is no baseline to
  measure against.
- **A2.** "`.dare/**` currently distinguishes only 'driver writes, builder does not'." Half
  true. Bash is already denied `.dare` **reads** wholesale inside a run
  (`checkProtectedState` tests the raw command string). What is unsealed is the `Read`/`Glob`/
  `Grep` route. That is a smaller surface than the brief implies, and a load-bearing one — see
  below.

---

## 2. Items that would break something if built as written

### 2.1 A3 — the oracle is not held out

The unit gate is `npx vitest run --reporter=json` (`toolchains/node.mjs:52`). Vitest resolves
**the builder's** config. So a sealed oracle suite runs only if the builder's `vitest.config`
includes it — which means the builder decides whether the oracle runs at all. `integrity.mjs`
catches a no-op npm script; it does not read an `exclude` glob, and an oracle that silently
collects zero tests is indistinguishable from an oracle that passed.

The fix is a driver-owned second invocation with its own config, which the `Toolchain`
contract has no operation for. The brief specifies neither, and this is the most expensive
item on the page.

### 2.2 A3 + A2 — the seal leaks exactly when it matters

`driver.mjs:1130–1138` puts regressed test ids verbatim into the log *and* into the regression
objective, which goes into the next Build Brief. The first time an oracle test fails, its file
path and test name are handed to the builder. Either oracle regressions are anonymised — and
then "Restore the tests listed below. Change nothing else." has nothing to list, so the
builder cannot act on it — or the seal is decorative from the first failure onward. The brief
does not confront the trade.

### 2.3 A2 — read-sealing inverts the guard's stated premise

`guard.mjs:368–380` blocks Bash from `.dare` entirely *because* the Read tool is unhooked and
therefore remains the route that "cannot also write it." A2 requires hooking `Read`, and then
`Glob`, `Grep`, `Task`, and any file-reading MCP tool a builder happens to have. That is a
rewrite of the guard's rationale plus new matchers in `hooks.json`, not "make the
classification explicit and inspectable." Budget it accordingly, and note that the builder
runs `--dangerously-skip-permissions`, so anything not matched by `hooks.json` is simply
allowed.

### 2.4 A9 — the builder has no channel to append on

The builder's only return path is its final message, and `builder-system.md:7–11` constrains
it to one or two lines with an explicit "do not summarise, do not report status." A9 needs
structured assumptions on that same channel, parsed fail-closed. That is a **new output
contract for the builder** — by `CLAUDE.md`'s own rule, a contract owned by another binary's
behaviour, so it needs a tier-3 check — and it contradicts a template rule that exists for a
reason. Implementable; not "one template line plus one file."

### 2.5 A4 — no quarantine path, and the ratchet's blast radius is a hard reset

A3 gets a disputed-test escape hatch. A4 gets none, and needs one more. Re-verification is a
substring search over code the builder may reformat at any chaos level above 1; the brief says
ambiguity fails closed, which converts a formatter run into a hard reset plus a regression
objective the builder *cannot satisfy* — it is told to restore something that was never
removed. Under monotonicity a false pin is unremovable. Give A4 the same disputed-element
mechanism as A3, or do not ship it.

### 2.6 A5 — mutation testing is a new gate kind, not a new toolchain operation

Gates are `{ name, command, required }`, run flat by `runGates`, verdict per iteration. Both of
the brief's scoping options need something the gate model does not carry: "changed files only"
needs the diff, which no gate receives; "only when the iteration is otherwise green" needs
conditional ordering, which the runner does not express. Surviving-mutant counts also vary with
which files changed, so the verdict is not monotonic the way the rest of Phase 3 is.

### 2.7 F3 — contradicts `prd-author.md`'s core rule

The PRD author is told "no implementation choices" and "no requirement that cannot be observed
from outside the program," and the requirement ids *are* the panel's checklist — one verdict
object per id. F3 would rewrite

```
PRD-2.1  An unauthenticated request to any /api/admin/* route receives 401 and no body.
```

into "Write tests for invalid inputs, then make them pass" — an instruction to the builder,
not an observation an auditor can falsify. Applied literally it degrades the reviewer's
checklist into a task list, which is precisely the Ralph hole `BORROWED.md` R8 rejects. The
salvageable version is a line saying requirements phrased as observable outcomes arrive
pre-shaped for RED evidence — which `prd-author.md` already does.

### 2.8 F1 — contradicts the chaos dial

`builder-system.md:132–141` sets scope by `chaos`: 1 surgical, 2 related refactors allowed,
3 restructure freely. "Every changed line must trace directly to the current objective" is
chaos 1 stated unconditionally. Landing it verbatim makes chaos 2 and 3 dead configuration, or
produces a template that argues with itself two paragraphs apart. Write it as the chaos-1 text,
or retire the dial — but not both.

### 2.9 B5's last paragraph contradicts B5's first

Retiring the `gate:design-slop` frontend check is listed as tidying. `HANDOFF.md` item 1 records
it as a decision **re-taken after** the capability model landed: a declared `web-ui` that has
not been written yet is still nothing to look at. Arming impeccable from a declaration means
failing a gate for the absence of something the project does not have yet — the exact failure
mode `gate-policy.mjs`'s own header says the table exists to prevent.

### 2.10 B3 — blocked, and the brief instructs building it anyway

`dotnet` is absent, re-checked 11 August 2026. `HANDOFF.md` warns specifically that the
toolchain registry now makes a wrong adapter *easy to add and green* — every structural test
passes on argv nobody has run. B3 says "verify actual command syntax against locally available
tooling"; there is none. Then the DoD requires ".NET is a first-class supported toolchain," and
C3 requires a live .NET check. Those cannot both hold in this environment. Same for D2 case C.

---

## 3. Correctly identified, genuinely outstanding

A4 (mechanism aside), A5, A6, A7, A8 (mechanism aside), A9, B3, B6, C2-archiving, C4, F1
(sharpening), F2, D2. Of these:

- **C4 (context budget)** is the best item in the brief — cheap, no invariant conflict,
  attacks the repository's own named bug class, and nothing else depends on it.
- **A6 (assertion lint rule)** is the second: deterministic, local, no new state.
- **F2 (PRD right-sizing)** is real and has no conflict; `prd-author.md` constrains total scope
  but never per-requirement size.
- **A7** is one line and compounds with everything else.

One stale-doc finding the brief misses: `builder-system.md:145` still says the untouchable set
is `.dare/state.json` and `.dare/config.json`. It has been the whole tree since 0.10.0. The
builder is being told a weaker rule than the hook enforces, which costs an iteration when it
tries something the guard denies.

---

## 4. Scope

`CLAUDE.md`: "one slice per commit; a slice that needs a second commit was too big." The brief
is ~19 items, 27 ordered steps and a 16-section report, and three of them (A3, A4, A8) each
introduce a **new monotonic property** with its own identity, invalidation and quarantine
semantics. That is three design efforts wearing one brief.

`BORROWED.md`'s citation checks out — arXiv 2603.08520's abstract carries 43.7%, 12.5% → 20.8%
and the 100% safety-monotonicity claim exactly as reported. A4's premise is sound even where
its mechanism is not.

## 5. Suggested re-cut

1. **Delete** A1, B1, B2, B4, B5, C1, C2-manifest, C3 — done. Keep C2-archiving.
2. **Ship now, independently:** C4, A6, A7, F2, plus the `builder-system.md:145` correction and
   F1 rewritten as chaos-1 text.
3. **Drop F3** or reduce it to a phrasing note that does not touch the requirement contract.
4. **Design A4 and A8 as one document before writing code** — including A4's missing quarantine
   path — and land them separately.
5. **Defer A3** until there is a driver-owned test invocation, and answer the seal-leak in the
   regression objective first. It is the most expensive item and currently the least specified.
6. **Leave B3 blocked** or write it with every command explicitly marked unverified, per
   `HANDOFF.md`. Do not put ".NET is first-class" in a definition of done that cannot be met.
7. **A2:** decide whether hooking `Read`/`Glob`/`Grep` is acceptable *before* committing to
   sealed artifacts, because A3 and A8 both assume it.
8. **D2 cases D, E and F** are worth more than the rest of the brief combined — the rejection,
   regression and security-regression scenarios have never run end to end, and the ratchet is
   the reason the design exists.
