# PLAN — what remains, 13 August 2026, from 0.88.0

**This is the only live plan.** `COMPLETION.md` is frozen as the 12 August plan; `BRIEF.md` is
the reconciled ledger of the original brief, complete; `HANDOFF.md` records execution. Statuses
live *here*, updated in the same commit as the work — the rule the HANDOFF header teaches.

Compiled from the open items in all three ledgers plus `BORROWED.md` rounds five and six.
Nothing below is new invention; every item carries its origin.

**Ordering principle, inherited from `COMPLETION.md`:** information value first. Experiments
precede construction where a result can invalidate the construction — and one dependency this
time is explicit: **item 8 gates the shape of item 10.**

Statuses: `OPEN` → `IN PROGRESS` → `DONE (version)` / `CLOSED (reason)`.

---

## Phase 0 — deterministic hygiene. No design work, one commit each, land now.

### 1. Mutation gate's decline message lies about baselines — DONE (0.87.0, before this plan)
`HANDOFF.md` (improve3 findings): on iteration 1 `lastGoodCommit` is null, `changedSince`
returns `[]`, and the gate prints *"no first-party source changed"* while three source files
were modified. "I have no baseline" is not "nothing changed." The decision is defensible; the
sentence is not.
**Done when:** the no-baseline case prints a no-baseline message; a test asserts both messages.

**Already satisfied when this plan was written.** `scripts/driver.mjs:3699` passes `undefined`
rather than `[]` when `lastGoodCommit` is null; `scripts/toolchains/node.mjs:142` declines with
*"no baseline to scope the changed set against … This is not a statement that nothing changed"*;
`test/toolchains.test.mjs:404–422` asserts both messages **and** that the no-baseline reason does
not contain the other sentence. The plan compiled this from the `HANDOFF.md` finding without
checking the commit that answered it on the same day.

### 2. Gate commands leak orphaned grandchildren — OPEN
`HANDOFF.md` ("the real hang"): 0.81.0's timeout bounds the hang but the grandchild survives,
holding its port and memory against every later iteration. The proper fix is already in this
repository — `health-probe.mjs` spawns detached and signals the **process group**. Gates do not.
**Done when:** a tier-2 test with a deliberately leaked grandchild shows the group killed after
timeout.

### 3. `release-check` refuses a bump that leaves the HANDOFF header behind — OPEN
The header went stale by fourteen versions once, then again by three (0.86.0–0.88.0) directly
under its own warning. This project's answer to a discipline that keeps failing is a gate.
**Done when:** `release-check` fails when `HANDOFF.md`'s stated version disagrees with the
manifests; a test proves both directions.

### 4. Per-child budget flags (`BORROWED.md` R16) — OPEN
`costCeiling` (0.79.0+) is run-level accounting on returned envelopes; nothing bounds a child in
flight except time. Derive a per-child allowance from the remaining ceilings at spawn and pass
`--max-budget-usd` / `--max-turns`. A child stopped by budget returns not-ok, which the loop
already treats correctly as a builder failure.
**Touches `claudeArgs` → tier 3 is mandatory, not optional** (`CLAUDE.md`'s rule).
**Done when:** flags appear in argv derived from remaining budget; a tier-3 check observes a
child actually stopped by the flag.

### 5. R15's phrasing paragraph in `templates/reviewer-system.md` — OPEN (verified absent at 0.88.0)
`BORROWED.md` R14/R15: a finding phrased as an input gets fixed as an input (runs 12 and 13,
measured). One paragraph: a finding must state **the property violated**, with the input as
evidence for it. Parser untouched; output contract unchanged.
**Done when:** the paragraph exists and `templates.test.mjs` asserts its presence, in the
repo's existing pattern.

---

## Phase 1 — experiments. Spend money, watch, one variable at a time.

### 6. Case H — the `unknown` pin verdict and quarantine — OPEN
The last unobserved A4 path, and the rule *"quarantine is not a pass"* has never fired. PRD
recipe ready in `DOGFOOD.md`. If `unknown` proves unreachable in practice, `DESIGN.md` §4.3
needs rewriting rather than defending — which is why this is an experiment, not a test.
**Done when:** a run records a quarantined element blocking `SHIPPED`, or the path is shown
unreachable and the design text is corrected.

### 7. First armed oracle run — OPEN
A3 is BUILT (0.70.0–0.72.0) and armed by nobody. Enable `oracle.enabled` on a CLI-shaped target
(case-G class). Under test: false-failure rate and the dispute path — the quarantine mechanism
was designed before the happy path on purpose; this is the run that says whether that was right.
**Done when:** a run completes with oracle cases judged and the outcome recorded in
`HANDOFF.md`, whichever way it goes.

### 8. R14 — the panel versus one reviewer at equal compute — OPEN
Config-only (`reviewers`, `ownership`, `effort`), run 6-vs-7 method. Evidence points both ways:
run 12's correctness reviewer fuzzed 110,877 cases alone; run 10's *design* auditor caught the
inert `bin`. **This gates item 10's shape:** if one reviewer at `max` matches the panel, the
parallel-panel half of the async rewrite is moot and the panel shrinks instead.
**Done when:** two comparable runs differ only in panel shape and the cost/verdict delta is
recorded.

### 9. Case I — racing with live builders, current state — OPEN (verify first)
Queue item 1 raced live builders and 0.83.0 fixed the landing. Decide whether a full case-I
under current code is still owed; run it if yes, close it against the queue-item record if no.

---

## Phase 2 — the repriced rewrite. After item 8.

### 10. R21 — async driver: heartbeat, parallel panel, process groups — OPEN
One move (`execFileSync` → async spawn with process groups) closes three named opens: the
hung-vs-working blindness, the sequential three-read panel (only if item 8 keeps the panel),
and the orphan pipe (subsuming item 2's mechanism driver-wide). Constraints from
`BORROWED.md` R21: **determinism preserved** — collect all children, parse and charge in
declared reviewer order regardless of completion order; the overshoot bound grows from one
child to children-in-flight and is documented where the ceiling is; landed alone, tier 3 on the
spawn path, no gate logic in the same commit.

---

## Phase 3 — features, in dependency order.

### 11. Ship-time mutation by the driver (the 0.56.0 contradiction) — OPEN
Proposal already written in `HANDOFF.md`: when the panel passes on an empty changed-set, the
driver mutates the whole first-party tree once, instead of handing the builder *"prove your
tests can fail"* under a scope rule that forbids every legal move (7.5M tokens of theatre in
run 9). Two named pre-checks: whole-tree mutation cost at ship time, and that it cannot launder
a ship that never earned mutation on its own changes. **Not while any run is testing ship
logic.**

### 12. A8 carry — skip re-review of pinned requirements — OPEN
The deferred half of A8. The baseline that was missing now exists: runs reach the panel
repeatedly and run 13's oscillation is costed. Invalidation stays fail-closed as specified in
`BRIEF.md` A8; the full panel still precedes `SHIPPED`.
**Done when:** an unchanged-evidence requirement is carried, a changed-evidence one is
re-reviewed, both tested, and the measured review-cost delta lands in `HANDOFF.md`.

### 13. C5 — differentiated race candidates — OPEN
Precondition met (racing lands winners since 0.83.0). One distinct stall hypothesis per
candidate, rendered in the brief; selection stays `selectWinner` untouched; a hypothesis is a
prompt, never a criterion.

### 14. R17 — metamorphic relations in the oracle — OPEN
Run 12's defect class: assert relations between runs (permute, scale, duplicate, subset,
identity-merge), no reference implementation, no "same assumption twice." Schema extension in
`oracle.mjs` plus a section in `templates/oracle-author.md`. Ordered after item 7 so relation
cases inherit a validated harness.

### 15. R18 — the API-shaped oracle — OPEN
The `docs` gate already mandates an API contract for `api` projects; make the machine-readable
half (OpenAPI) required and arm a schema-driven property fuzzer at gate time via the
quality-plugin registry (knip/semgrep degrade-to-warning precedent). Extends held-out judging to
the shape the CLI oracle cannot reach.

### 16. R19 — OS sandbox under the builder — OPEN
Adopt Claude Code's native sandbox for builder children as a second floor under the guard, with
the recorded failure modes as requirements: the driver refuses any unsandboxed fallback on the
builder's behalf, and sandbox *registration* gets a live check — the guard's own history is the
reason.

### 17. The run-level wall clock — decision, not code — OPEN
Named open in `HANDOFF.md`. Decide it and write it into `DESIGN.md`: a wall-clock ceiling, or
an explicit refusal with the `maxIterations`-is-the-honest-unit argument. Either closes it;
undecided is the only wrong state.

### 18. Improve-mode cost concentration — OPEN
Segment one cost 7× segment two on a four-file repository. Measure on something mid-sized
before improve mode meets a real codebase; outcome is either a fix or written budget guidance
in `commands/dare.md`.

### 19. Deploy's ssh half — OPEN
Argv nobody has run (`HANDOFF.md`, queue item 4 boundary). Live-verify it once, or mark it
permanently unverified in `DESIGN.md` §10.1. The repo's rule does not allow a third state.

---

## Phase 4 — breadth, then the mirror.

### 20. Dogfood cases A, B, C — OPEN
Breadth, not risk: the link shortener, the persistence SPA, and the .NET API — the last being
the first run to exercise TRX extraction and the dotnet adapter end to end in anger.

### 21. Improve mode pointed at this repository — OPEN, deliberately last
Prerequisites named in `HANDOFF.md`: pin `hooks/guard.mjs` as a security element at run start
(the positional rule does not cover it), `release-check` reachable as a gate (item 3 helps),
and the `CLAUDE.md` scope note is the operator's call to suspend — nobody else's.

### 22. HANDOFF stratigraphy sweep — OPEN
The file is newest-first with older "outstanding" and "do this next" strata below; reconcile or
strike the layers the top has since answered. Same class as the 13 August doc pass, one file.

### 23. Closing consistency pass — OPEN
`DESIGN.md` and `CLAUDE.md` describe what the code does; this file's statuses all terminal;
`AUDIT.md`-style read of whatever phase 0–3 changed.

---

## Standing rules

One item per commit; version bump with any shipped file; statuses here in the same commit;
execution records in `HANDOFF.md`. Tier 2 before commits touching race, health-probe,
toolchains, or anything shelling out; tier 3 whenever `claudeArgs`, `childSettings`, envelope
parsing, or a template output contract moves (items 4, 10, 16 at minimum). No new personas —
the cap was spent on `oracle-author`. Nothing from `BRIEF.md` section E's do-not-add list.
Experiments write their result down whichever way they land: a surprising `CLOSED` is worth
more than a flattering `DONE`.
