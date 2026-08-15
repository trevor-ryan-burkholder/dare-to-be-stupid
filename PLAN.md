# PLAN — what remains. Compiled 13 August 2026 from 0.88.0; statuses last swept 14 August at 0.140.0

**This is the only live plan.** `COMPLETION.md` is frozen as the 12 August plan; `BRIEF.md` is
the reconciled ledger of the original brief, complete; `HANDOFF.md` records execution. Statuses
live *here*, updated in the same commit as the work — the rule the HANDOFF header teaches.

Compiled from the open items in all three ledgers plus `BORROWED.md` rounds five and six.
Nothing below is new invention; every item carries its origin.

**Ordering principle, inherited from `COMPLETION.md`:** information value first. Experiments
precede construction where a result can invalidate the construction — and one dependency this
time is explicit: **item 8 gates the shape of item 10.**

Statuses: `OPEN` → `IN PROGRESS` → `DONE (version)` / `CLOSED (reason)` — plus, as reality required them: `PREPARED` (staged, unrun), `RUN (date)` (executed, question answered or moved), `ANSWERED` (measurement obtained), `DROPPED` (operator refused), `DEFERRED` (operator postponed).

---

## Build order — the efficient traversal of what remains (added 14 Aug)

**The phases below are numbered by discovery order; this is the order to actually BUILD in.** The
principle: batch by the file and test-tier each item touches, land correctness before long runs,
and never let a ~2h measurement run block a build slice — kick every dogfood off in the background
and build the next campaign while it runs. Phases 0–3 are complete; everything below is the
remaining work, grouped by shared surface so the hostile reviewer warms on one area at a time and
each tier-3 live check is paid once, not three times.

**Campaign A — Guard & state integrity** (do first, while the guard context is warm; hardens the
substrate every later run depends on). Item **28** (guard kill-switch + R23 realpath + R24
tokenizer + R39 Factorio citation — *built & verified, waiting on oracle2 to land*) → **37** (guard
ergonomics, R25) → **38** (corrupt-state quarantine, R26) → **39** (atomic red-evidence, R34 — the
verified bug; land before any long run writes that file).

**Campaign B — Reviewer/panel template** (one DESIGN §4 parser re-read, one tier-3 live check for
the batch): item **40** (unverifiable channel, R27) → **41** (review packaging, R28) → **30c**
(Trail-of-Bits differential-review mining).

**Campaign C — Gates & efficiency** (cheap, independent, parallelisable; no shared surface): item
**29** (gitleaks + pinning) → **42** (design-slop `--json`, R29) → **43** (gate-skip on unchanged
workspace, R35) → **44** (prompt hygiene, R30) → **45** (small trims, R31/R32/R33) → **46**
(gate-output + retry, R40) → **30a** (LSP) → **30b** (OSV) → **30d** (builder honesty).

**Measurement — on the now-hardened substrate, overlapping the campaigns:** the boxed component
dogfood (flips item **24** → DONE, and stress-tests the hardened guard for free) · oracle2
(running) · cases A/B (item **20**, low information value — optional) · then the DoD tail: **31a**
web-ui smoke → **31** capstone (Ateliers). A race that applies a winner (item 9's question) is
reclassified as a bespoke hard-but-solvable scenario, not a run to schedule.

**Then Phase 6** (items 32–36, post-DoD ambition) and **item 21** (the mirror — improve mode on this
repo) as the final act, once part 1 is code-complete.

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

### 2. Gate commands leak orphaned grandchildren — DONE (0.89.0)
`HANDOFF.md` ("the real hang"): 0.81.0's timeout bounds the hang but the grandchild survives,
holding its port and memory against every later iteration. The proper fix is already in this
repository — `health-probe.mjs` spawns detached and signals the **process group**. Gates do not.
**Done when:** a tier-2 test with a deliberately leaked grandchild shows the group killed after
timeout.

**Landed, and not by detaching.** The group is found by *subtraction* — membership of the
driver's own group sampled before the command and after the timeout. Detaching was measured and
rejected: it costs the operator's Ctrl-C, trading a rare orphan for a common one. Tier 2 is 30
pass, with a bystander case proving the sweep is a set difference and not a group signal.
`DESIGN.md` §10 carries the reasoning and the three limits. **Residual, named:** a gate killed by
`kill` to the driver rather than by the ceiling still leaks; that needs the free event loop item
10 buys.

### 3. `release-check` refuses a bump that leaves the HANDOFF header behind — DONE (no bump needed)
The header went stale by fourteen versions once, then again by three (0.86.0–0.88.0) directly
under its own warning. This project's answer to a discipline that keeps failing is a gate.
**Done when:** `release-check` fails when `HANDOFF.md`'s stated version disagrees with the
manifests; a test proves both directions.

**Landed.** `statedHandoffVersion` in `tools/release-check.mjs`; both directions asserted, plus
an unreadable header refusing rather than passing. Verified against the real repository by
staling the header and watching the command refuse. **No version bump:** `tools/` is not a
shipped path, which is why the checker lives there.

### 4. Per-child budget flags (`BORROWED.md` R16) — DONE (0.90.0)
`costCeiling` (0.79.0+) is run-level accounting on returned envelopes; nothing bounds a child in
flight except time. Derive a per-child allowance from the remaining ceilings at spawn and pass
`--max-budget-usd` / `--max-turns`. A child stopped by budget returns not-ok, which the loop
already treats correctly as a builder failure.
**Touches `claudeArgs` → tier 3 is mandatory, not optional** (`CLAUDE.md`'s rule).
**Done when:** flags appear in argv derived from remaining budget; a tier-3 check observes a
child actually stopped by the flag.

**Landed at 0.90.0, and tier 3 watched the stop.** A real child bounded at the `$0.0001` floor
returned not-ok with empty text. Tier 3 is now 23 of 23 across 10 files. `--max-budget-usd` is
derived and always on; **`--max-turns` ships off by default** (`maxChildTurns: 0`) because no
honest arithmetic gets from a dollar ceiling to a turn count, and because it is undocumented in
`claude --help` 2.1.228 — accepted by the parser, verified, but a weaker contract.

### 5. R15's phrasing paragraph in `templates/reviewer-system.md` — DONE (0.76.0, before this plan)
`BORROWED.md` R14/R15: a finding phrased as an input gets fixed as an input (runs 12 and 13,
measured). One paragraph: a finding must state **the property violated**, with the input as
evidence for it. Parser untouched; output contract unchanged.
**Done when:** the paragraph exists and `templates.test.mjs` asserts its presence, in the
repo's existing pattern.

**Already satisfied, and the plan's parenthetical was false.** The heading *"State the property,
not the example"* has been in `templates/reviewer-system.md` since **0.76.0** (`git log -S`
finds it in `dc7dfbd`), carrying both worked examples and the *"name the class and give more
than one member"* instruction. `test/templates.test.mjs:610–628` asserts the heading, the
whitespace-normalised sentence *"a failing example is satisfied by handling that example"*, and
the class instruction. `OPEN (verified absent at 0.88.0)` was not a verification — nothing was
checked, and one `grep` contradicted it.

---

## Phase 1 — experiments. Spend money, watch, one variable at a time.

### 6. Case H — the `unknown` pin verdict and quarantine — DONE; `unknown` shown near-unreachable
The last unobserved A4 path, and the rule *"quarantine is not a pass"* has never fired. PRD
recipe ready in `DOGFOOD.md`. If `unknown` proves unreachable in practice, `DESIGN.md` §4.3
needs rewriting rather than defending — which is why this is an experiment, not a test.
**Done when:** a run records a quarantined element blocking `SHIPPED`, or the path is shown
unreachable and the design text is corrected.

**Closed on the second clause, which is the honest half of the Done-when.** The escalation fired
live for the first time — 32s, 104K tokens — and returned **`moved`**, correctly: it found the
rewritten guard at `src/paths.ts:37` and re-pinned it. `unknown` cannot be produced by the
recipe, because the recipe defeats the *text* check while the escalation reviewer holds
`Read`/`Glob`/`Grep` and is told to search for the **protection, not the text**. `unknown` is a
fail-safe for reviewer uncertainty, not a provokable state; `DOGFOOD.md` and this entry now say
so. **"Quarantine is not a pass" was already tested** at unit and loop level
(`test/driver.test.mjs:2028`); what was missing was a live trigger, and a live trigger is close to
unprovokable by design.

### 7. First armed oracle run — DONE (run `oracle1`, BUDGET, oracle judged 19/19)
A3 is BUILT (0.70.0–0.72.0) and armed by nobody. Enable `oracle.enabled` on a CLI-shaped target
(case-G class). Under test: false-failure rate and the dispute path — the quarantine mechanism
was designed before the happy path on purpose; this is the run that says whether that was right.
**Done when:** a run completes with oracle cases judged and the outcome recorded in
`HANDOFF.md`, whichever way it goes.

**Done.** Ended `BUDGET` at 18.06M/15M tokens, $13.83. The oracle armed, judged, and reported
**19 of 19 passed** — false-failure rate **0**, the outcome R13 feared most and did not get. The
tree is genuinely correct on run 12's inputs (bigint numerator; `mean` of `1e16,1,-1e16` is
`1/3`).

**The finding is a measurement.** All 19 cases assert exit codes only — correctly, per the
template. Planting run 12's exact defect into a copy of the tree produces `{"mean": null}` at exit
0 and **all 19 cases still pass**. The held-out suite cannot see the defect class that defines
every headline failure this project has shipped. **Item 14 is the missing half, not an
enhancement.** Dispute/quarantine remains unexercised — nothing disputed a case.

### 8. R14 — the panel versus one reviewer at equal compute — DONE (panelA vs panelB)
Config-only (`reviewers`, `ownership`, `effort`), run 6-vs-7 method. Evidence points both ways:
run 12's correctness reviewer fuzzed 110,877 cases alone; run 10's *design* auditor caught the
inert `bin`. **This gates item 10's shape:** if one reviewer at `max` matches the panel, the
parallel-panel half of the async rewrite is moot and the panel shrinks instead.
**Done when:** two comparable runs differ only in panel shape and the cost/verdict delta is
recorded.

**Done.** One reviewer at `max` is **2.6× cheaper and 2.2× faster** per full panel (1.40M/664s vs
3.36–3.64M/1360–1451s, the control having n=2 because `oracle1` is a second sample). Findings are
inside the control's own 4-to-5 spread; the solo went *deeper* on `DoD-6` (three input classes vs
one) and the panel's single extra finding was **false** — the `DoD-4` unsatisfiable line fixed at
0.101.0.

**What the experiment actually bought was a defect:** the solo config produced zero security pins
and silently disabled A4 (fixed, 0.103.0).

**Recommendation: do not shrink the panel on this evidence — build item 10's parallelism.** The
saving is real but it is a cost argument, and the panel's dominant cost is wall clock, `3×` where
it could be `max()`. **Item 10 is therefore unblocked with the panel kept.**

### 9. Case I — racing with live builders — **RUN 14 Aug; win condition fixed at 0.127.0**

**The race executed end to end for the first time** — armed on two stalls, two candidates in their
own worktrees at 6.03M and 5.29M tokens, gated independently, each with its own archived brief,
all discarded, worktrees cleaned. **`applyWinner` still never fired, and now we know why it may
never.** `selectWinner` demands every gate pass, while the race only arms on stalls, which *are*
gates failing — so a candidate must fix everything at once on a line that has fixed nothing for
several iterations. Both halves are individually correct; the intersection is close to empty.
**Full write-up in `HANDOFF.md`. The resolution is a design decision and is the operator's.**

### 9a. Case I, original entry — **SUPERSEDED by item 9's 14 Aug run.** What remains is not "run case I" but the operator's design question item 9 records (a winner has still never been applied)
Queue item 1 raced live builders and 0.83.0 fixed the landing. Decide whether a full case-I
under current code is still owed; run it if yes, close it against the queue-item record if no.

**Verified, and it is still owed — narrowly.** Queue item 1 is a live case I in substance: three
real builder children raced in worktrees, were gated independently, and a winner was selected on
churn. It is **not** closable against that record, because the run died at the one step that
matters for "current state": `applyWinner` refused against a dirty main tree. 0.83.0's stash fix
and 0.84.0's start-of-race sweep are covered by tier 2 against real git, but **no live race has
ever landed a winner**, and that is the whole of what case I now tests. Since 0.93.0 it would also
be the first race whose candidates carry distinct stall hypotheses (C5).

---

## Phase 2 — the repriced rewrite. After item 8.

### 10. R21 — async driver: heartbeat, parallel panel, process groups — **DONE (0.141.0–0.143.0)**

**Landed as three slices, exactly per the five-step plan below.** 0.141.0: `shell()` to async
spawn behind the identical `ShellResult` contract, propagated through fourteen driver functions
and five modules, zero behaviour change, all four tiers green including live. 0.142.0: the
heartbeat — a pulse every sixty seconds while any child runs, the operator's named top blocker.
0.143.0: the parallel panel — declared-order determinism preserved (R21's constraint verbatim),
overlap proven by an adversarial reversed-completion test (180ms of delays, 96.6ms of wall
clock), overshoot widening documented beside the ceilings. The hostile reviewer's one real
finding (an overflow/timeout discriminator flip in a doubly-degenerate window) was fixed before
commit. **This was the final planned feature.**

**Measured live in `ship1`, 13 August, and it is worse than "3× where it could be `max()`":**

| iteration | builder | panel (three cold reviewers, sequential) | findings |
|---|---|---|---|
| 1 | 619s / 8.69M | 308 + 734 + 468 = **1510s** / 4.44M | 13 |
| 2 | 191s / 1.98M | *none — a gate failed first, correctly* | — |
| 3 | **36s** / 0.33M | 386 + 736 + 371 = **1493s** / 3.88M | 4 |

**Iteration 3 spent 36 seconds building and 1,493 seconds being judged — 41×.** The panel is
~25 minutes of pure sequential wall clock, every iteration, and it barely varies: 1510s and 1493s
on iterations whose builders differed by 17×.

**The token and time pictures point opposite ways, and only one of them is fixable here.** The
builder dominates *tokens* (8.69M against the panel's 4.44M on iteration 1); the panel dominates
*wall clock* by an order of magnitude. Parallelising replaces `sum` with `max`: iteration 3 would
have been 736s instead of 1493s. **Roughly 12 minutes back per iteration, ~2.5 hours over a
twelve-iteration run**, for no change in what is read or how it is charged.

**Item 8's answer, which is what it was waiting for: keep the panel, parallelise it.** One
reviewer is 2.6× cheaper, but the panel's dominant cost is *wall clock* — `3×` where it could be
`max()` — and the solo arm's only observed advantage was depth on an id both owned, while the
panel's only extra finding was false. Parallelising recovers most of the gap without giving up a
heterogeneous read.

**Deliberately not started this session, and the reason is a judgement rather than a budget.**
`driveRun` is a synchronous `for(;;)` loop over synchronous effects; making the spawn path async
turns every effect, `driveRun`, `main`, and every test that drives them into promises. `BORROWED.md`
R21 says *"land it alone"*, and beginning it late in a long session with a run in flight is how a
driver ends up half-converted. **This is a fresh-session task.** The plan, so it starts from a
specification rather than from scratch:

1. **`shell` first, alone.** `execFileSync` → `spawn` returning a promise, same `ShellResult`
   shape including `timedOut` and `reaped`. Keep `sweepLeakedGroup`: subtraction still works, and
   with a free event loop a `detached` variant finally becomes *available* — but only if the
   driver forwards `SIGINT`/`SIGTERM` to the child, which is the thing item 2 could not do and
   the reason it chose subtraction. Decide that explicitly; do not inherit it.
2. **Propagate outward, no behaviour change.** `runGates`, `spawnClaude`, `runDeploy`, the
   effects object, `driveRun`, `main`. Tests become `await`. Nothing new is added in this step —
   if the suite does not pass unchanged, stop.
3. **Then the heartbeat**, which is the operator's named top blocker and is free once the loop
   is unblocked: a periodic line while a child runs, so *hung* and *working* stop looking alike.
4. **Then the parallel panel**, and only here. `BORROWED.md` R21's constraint is absolute:
   **collect all children, then parse and charge in declared reviewer order regardless of
   completion order.** Determinism is a preserved property; a panel whose verdict depends on
   which reviewer finished first is a different program.
5. **Document the widened overshoot** where the ceiling is documented. The bound grows from "one
   child" to "children in flight" — three during review. Measured this session: a single child
   overshot by 3.06M tokens (oracle1), so three in flight is not a small change.

**Tier 3 on the spawn path, and no gate logic in the same commit.**
One move (`execFileSync` → async spawn with process groups) closes three named opens: the
hung-vs-working blindness, the sequential three-read panel (only if item 8 keeps the panel),
and the orphan pipe (subsuming item 2's mechanism driver-wide). Constraints from
`BORROWED.md` R21: **determinism preserved** — collect all children, parse and charge in
declared reviewer order regardless of completion order; the overshoot bound grows from one
child to children-in-flight and is documented where the ceiling is; landed alone, tier 3 on the
spawn path, no gate logic in the same commit.

---

## Phase 3 — features, in dependency order.

### 11. Ship-time mutation by the driver (the 0.56.0 contradiction) — DONE (0.91.0)
Proposal already written in `HANDOFF.md`: when the panel passes on an empty changed-set, the
driver mutates the whole first-party tree once, instead of handing the builder *"prove your
tests can fail"* under a scope rule that forbids every legal move (7.5M tokens of theatre in
run 9). Two named pre-checks: whole-tree mutation cost at ship time, and that it cannot launder
a ship that never earned mutation on its own changes. **Not while any run is testing ship
logic.**

### 12. A8 carry — skip re-review of pinned requirements — DONE (0.92.0); delta measured: **8%**
The deferred half of A8. The baseline that was missing now exists: runs reach the panel
repeatedly and run 13's oscillation is costed. Invalidation stays fail-closed as specified in
`BRIEF.md` A8; the full panel still precedes `SHIPPED`.
**Done when:** an unchanged-evidence requirement is carried, a changed-evidence one is
re-reviewed, both tested, and the measured review-cost delta lands in `HANDOFF.md`.

**Mechanism landed; (A stale stratum here once said the delta could not be measured from a bench; panelB then measured it.)** `narrowedPanelPlan` +
`carriedReport`, `panelCarry.enabled` on by default, with two refusals to narrow (everything
carried, every reviewer emptied) and the guarantee that a narrowed `pass` triggers the **full**
panel before any ship — because run 10's design auditor is exactly what carrying could skip.
Invalidation unchanged and fail-closed. **Delta measured in `panelB`, and it is small.** Carrying 9 of 16 requirements — 56% of the ids
— cut review tokens by **8.3%** (1,402,476 → 1,285,670) and wall clock by 28.5%. A cold
reviewer's cost is the *read*, not the id list; the ids only change what it writes at the end.
That confirms A8's own correction rather than R1's premise: the saving does not scale with
requirements carried. The mechanism is safe and **marginal**; if review cost is to be reduced the
lever is the read. n=1, solo-reviewer arm, different trees between iterations.

### 13. C5 — differentiated race candidates — DONE (0.93.0), with a precondition disagreement
Precondition met (racing lands winners since 0.83.0). One distinct stall hypothesis per
candidate, rendered in the brief; selection stays `selectWinner` untouched; a hypothesis is a
prompt, never a criterion.

**Landed.** `STALL_HYPOTHESES` / `stallHypothesis` in `race.mjs`, rendered by `brief.mjs`, wired
at the one race call site. Fixed and driver-owned, because section E is closed and a model with
an opinion about a race is one step from a model adjudicating one. The brief tells the candidate
outright that nothing scores it against its angle.

**Correction, 13 August 2026 — my earlier note here was wrong.** It said C5's precondition, *"a
real `claude -p` child inside a race worktree"*, had never been exercised. It has: **queue item 1
ran the first live race**, three real children in worktrees at 169s / 224s / 651s, each on its own
brief, each gated independently, the winner chosen on measured churn. The claim came from reading
`BRIEF.md` C5, which predates that run — the same stratigraphy trap item 22 exists for, caught
here by reading the record instead of the summary.

**What is genuinely still owed is narrower:** no live race has ever *landed* a winner. Queue item
1 selected one and `git merge --ff-only` refused against a dirty main tree; 0.83.0 fixed that with
a stash and tier 2 covers it against real git, but the two halves have never run together. That
is item 9's remaining content.

### 14. R17 — metamorphic relations in the oracle — DONE (0.100.0); **live half PAID by oracle2, 14 Aug** (relations judged real generated code, caught real numeric bugs, drove a fix, passed at ship; zero false failures — `DOGFOOD.md`)
**Item 7's interim finding promotes this from a prediction to a measured requirement.** The first
armed oracle authored 19 cases and **all 19 assert exit codes only** — correctly, because
`oracle-author.md` instructs exit-only whenever the spec does not fix byte-for-byte output, which
a PRD almost never does. So A3 as it stands cannot see a wrong answer at a success exit code,
which is the class of every headline defect this project has shipped. A metamorphic relation
needs no output format and evades that rule entirely.

Run 12's defect class: assert relations between runs (permute, scale, duplicate, subset,
identity-merge), no reference implementation, no "same assumption twice." Schema extension in
`oracle.mjs` plus a section in `templates/oracle-author.md`. Ordered after item 7 so relation
cases inherit a validated harness.

**Done, and built the same day item 7 unblocked it.** `relation: { kind, files, argv }` on any
case — a second real invocation judged against the first, with `same-stdout`, `same-exit` and
`differs`; the last is the deny path, because a constant-printing program satisfies every
same-stdout relation. Fail-closed on unknown kinds, missing argv and scratch escapes. The
template teaches all five shapes with a worked permutation example that a unit test parses *and*
verifies is a real permutation. **Tier 3 confirmed a live child writes relation cases: 27 of 27.**
**Not verified:** no run has had a relation judge real code yet.

### 15. R18 — the API-shaped oracle — DONE (0.94.0), the dry-run half
The `docs` gate already mandates an API contract for `api` projects; make the machine-readable
half (OpenAPI) required and arm a schema-driven property fuzzer at gate time via the
quality-plugin registry (knip/semgrep degrade-to-warning precedent). Extends held-out judging to
the shape the CLI oracle cannot reach.

**Landed.** `docs/openapi.yaml` required for the `api` capability (one canonical path);
`schemathesis` registered, optional, armed by capability; the architect template told to write
the schema so it can be generated from. **The argv was executed, not read** — schemathesis
3.39.16, `run --dry-run -c all <schema>`: valid schema exit 0, invalid parameter type exit 1.
**What is NOT built:** conformance fuzzing against a *running* application. `--dry-run` proves
the contract is machine-valid and generatable, not that the app obeys it; the live half needs a
started server and is unowned.

### 16. R19 — OS sandbox under the builder — DONE (0.96.0), confinement itself unverifiable here
Adopt Claude Code's native sandbox for builder children as a second floor under the guard, with
the recorded failure modes as requirements: the driver refuses any unsandboxed fallback on the
builder's behalf, and sandbox *registration* gets a live check — the guard's own history is the
reason.

### 17. The run-level wall clock — **DROPPED 14 Aug, operator's decision**

**Not wanted.** *"Don't need time ceiling. Ceiling is completion or budget."* The proposal below is
kept as the record of what was considered and refused, not as pending work. A run ends when it
ships, when the panel cannot be satisfied within `maxIterations`, or when tokens or dollars run
out — and those are the only ceilings.
Named open in `HANDOFF.md`. Decide it and write it into `DESIGN.md`: a wall-clock ceiling, or
an explicit refusal with the `maxIterations`-is-the-honest-unit argument. Either closes it;
undecided is the only wrong state.

**Not decided here. Drafted for the operator, with a recommendation.**

**What is already bounded, which changes the question.** Since 0.80.0–0.82.0 every individual
wait has a ceiling: children (`childTimeoutMs`, 30m), gates (`gateTimeoutMs`, 45m), the deploy
(10m), the smoke and health probes. `maxIterations` bounds the loop in iterations, `tokenCeiling`
bounds work and `costCeiling` bounds money. So the operator's original complaint — *"it'll hang
and sit there for hours"* — is closed. The only case a wall clock still catches is a run that is
**slow but productive**: every ceiling holding, every iteration doing real work, and hours going
by.

**Why a hard wall-clock kill is the wrong shape.** Firing mid-iteration leaves a tree that
nothing has judged — no gates, no panel, no ratchet decision. That is the same defect 0.83.0
argued about race landing: `base + something nothing gated` is a state no evidence in the run
describes. A ceiling whose failure mode is *destroying the evidence for the work already paid
for* is worse than the condition it prevents.

**Recommended: a wall-clock budget checked only at the iteration boundary.** One more clause in
`shouldContinue`, beside the three already there, returning `BUDGET` with the elapsed time named.
It never fires mid-iteration, so it never abandons an unjudged tree; a run can overshoot it by at
most one iteration. **That guarantee already has vocabulary here** — `charge()`'s comment says
`tokenCeiling` is *"stops at the first opportunity after the ceiling is crossed", not "never
exceeds it"* — so this is the existing contract in a fourth unit rather than a new kind of
promise. Suggested default: **off** (`0`), because no run has recorded a total wall clock and a
number nobody measured would wear the authority of one, exactly as argued for `maxChildTurns`.
What would set it: the elapsed time of the next few dogfood runs.

**The alternative, if the operator prefers it:** an explicit refusal written into `DESIGN.md`
§10 — *iterations are the honest unit for a loop; every wait is individually bounded; a wall
clock adds a fourth ceiling that can only fire on a run doing real work.* That is a complete
answer and closes the item just as well.

**Either way the wrong state is the current one.** What is needed from the operator is one of:
(a) build the boundary-checked budget, default off; (b) build it with a measured default; or
(c) refuse it in `DESIGN.md` with the argument above.

### 18. Improve-mode cost concentration — **ANSWERED 14 Aug: the author is 0.3% of the run at 12 files**

Run on csvstat2 (12 source files), uncapped. The improve author read the repository and wrote the
PRD in **one pass: 15s, 61,047 tokens** — against a run total of 19.3M. **The author is not the
cost centre; the loop is.** The 7× segment imbalance measured on the four-file repo was fixed
overhead dominating a tiny denominator, not a scaling behaviour. Segmentation never engaged at 12
files. The outcome (`STALLED` on a parse/summarise oscillation, 83 ids banked) is the loop's
story, not the author's. Genuinely large repos (hundreds of files) remain unmeasured; at every
size measured so far, budget guidance belongs on iterations, not on the author phase.
*(Original pre-answer instruction, kept as the question that was asked:)* Segment one cost 7×
segment two on a four-file repository. Measure on something mid-sized
before improve mode meets a real codebase; outcome is either a fix or written budget guidance
in `commands/meeseeks.md`.

### 19. Deploy's ssh half — DONE (live-verified 13 Aug against a real droplet)
Argv nobody has run (`HANDOFF.md`, queue item 4 boundary). Live-verify it once, or mark it
permanently unverified in `DESIGN.md` §10.1. The repo's rule does not allow a third state.

**Verified, the first of the two allowed end states.** The operator supplied a DigitalOcean
droplet (Ubuntu 22.04.5); `runDeploy` was driven against it through all five paths — happy,
remote non-zero exit, wrong expected status, absent path, and a hang that the ceiling killed with
the passphrase/host-key hint. Recorded in `DESIGN.md` §10.1 with two operational findings a real
host produced: `ufw`'s default `22/tcp LIMIT IN` rate-limits ssh to six connections per thirty
seconds and yields `Connection refused` when tripped, and a fresh droplet refuses connections
during cloud-init. Both look exactly like a broken deploy and neither is one.

---

## Phase 5 — the box made real. Added 14 Aug by operator decision, after item 10 landed.

### 24. Components — driver-delegated sub-runs in worktrees — IN PROGRESS, **CODE COMPLETE (0.144.0)**

**Origin:** `--give-them-the-box` (0.115.0), the nesting cost/benefit ledger, case J's five-run
finding that **builders decline by omission**, and the operator's 14 Aug decision to queue this
behind item 10. The one gain nesting buys that nothing flat reaches: **per-subtree toolchains** —
`resolveToolchain` is one-per-run, so a polyglot repository is inexpressible today.

**Spec:**
- Config gains `components: [{ name, dir, spec }]` — validated strictly, guard-protected like all
  of `.meeseeks/config.json`, so a builder cannot add or remove components. `spec` is a PRD path
  relative to `dir`, or a quoted idea.
- **Configured components without `--give-them-the-box` refuse at start.** The human types the
  permission; config cannot smuggle it. The flag's existing machinery (depth cap 2, wall clock,
  `MEESEEKS_GIVE_THEM_THE_BOX` + `MEESEEKS_RUN_DEPTH` via `childEnvironment`) is reused untouched.
- **A new phase between design and the loop**, in declared order per component: sweep stale
  component worktrees (race-style, self-healing at start); `git worktree add` on branch
  `meeseeks/component-<name>` at HEAD; the parent writes the child's
  `<worktree>/<dir>/.meeseeks/config.json` — ceilings derived from the parent's remaining budget,
  `deadlineMs` from the parent's remaining clock, and **no `components` key ever** (belt beside
  the depth cap's braces); spawn `node <driver> <spec> --yes --give-them-the-box` with cwd
  `<worktree>/<dir>` and the ordinary child environment.
- **The child is a real run in its own right**: own toolchain detection against its subtree, own
  gates, own ratchet, own panel, own heartbeat. Its stdout streams to the parent log prefixed
  `component:<name>:`.
- **Outcome consumption is fail-closed.** Read the child's `outcome.json`; charge its
  `spentTokens`/`costUsd` to the parent's progress; on `SHIPPED`, fast-forward-merge the branch
  (the `applyWinner` machinery, already tier-2 tested); on anything else, the parent ends
  `ABORTED` naming the component and its terminal state. Softening that to
  continue-without-the-component is a recorded option, not the default.
- **Doctrine unchanged:** a component's `SHIPPED` is a pre-filter exactly as the panel carry is —
  the parent's own gates and FULL cold panel still judge the merged whole. Never a substitute.

**Done when:** unit tests cover validation and both refusals (no flag; smuggled nested
components); tier 2 drives one component end to end against real git with an injected
child-driver effect — worktree created, config written and componentless, merge landed, outcome
charged, and the failure path aborting by name; and one live boxed dogfood run ships a
one-component repository.

**Status (14 Aug 2026, 0.144.0):** built and then hardened in the same version. The
implementation (config `components`, `scripts/components.mjs`, the Phase 1c driver phase) landed
with 66 unit and 3 tier-2 tests; a hostile review then confirmed three majors by reproduction —
a committed `outcome.json` read as the verdict of a child that never ran (fail-open), a
committed symlink defeating the string-only dir containment and pointing a nested driver at a
tree the operator never named, and the phase's force-sweep/branch-reset/merges running outside
the run lock whose protection its own comment claimed — plus three minors (a crashed child's
real spend silently unbilled, the parent's armed clock never consulted between components, and
phase throws escaping `main` as stack traces with no verdict). All six fixed at 0.144.0:
tracked-`.meeseeks` refusal plus stale-outcome removal, realpath containment checked before
anything is created and again after, the lock claimed before the phase, the unbilled spend named
in the abort message, a per-component wall-clock check, and a phase-wide catch that turns any
surprise into the verbatim-then-stamp ABORTED shape. 1962 tier-1 and 46 tier-2 tests pass; every
new refusal has a deny-path test and a benign neighbour. **Outstanding for DONE:** the
Done-when's live half — one boxed dogfood run shipping a one-component repository — authorized
by the operator as measurement run 3.

### 25. `configure.mjs` — the operator's config wizard — **DONE (0.145.0)**

**Origin:** operator request, 14 Aug 2026 ("We should probably add a config step you can do via
cli"), made immediately after walking the deploy block by hand. Hand-authored JSON is the whole
current interface: the schema lives in the reader's memory, and a typo costs a preflight
round-trip to discover.

**Spec:**

- New shipped file `scripts/configure.mjs`, run as `node scripts/configure.mjs` in the target
  repository. Interactive wizard over `node:readline/promises`. No dependencies, ESM, Node ≥22.12.
- **Refuses under `MEESEEKS_RUNNING`.** A process inside a run may not reshape the config that
  constrains it. The env marker is the same fact the guard hook reads — and the check here is
  load-bearing, not decorative: the guard hook travels with Claude Code tool calls, and a
  builder shelling out to this script in a plain subprocess would meet no hook at all.
- **One validator.** The wizard builds a plain object and hands it to `validateConfig`; it never
  restates a rule. Interactive validation failure names the key and re-prompts; `--show` and any
  future non-interactive path exit non-zero instead.
- **The existing config is the baseline, and unasked keys survive.** Read
  `.meeseeks/config.json` when present, use its values as the bracketed prompt defaults, merge
  answers over it, validate the whole, write with `writeConfig` (atomic). An operator's
  `extraGates` must not vanish because the wizard did not ask about them.
- Prompt groups, in order: budgets (`maxIterations`, `tokenCeiling`, `costCeiling`, deadline
  **asked in minutes, stored as `deadlineMs`** — the same unit the `--deadline` flag speaks);
  loop shape (`chaos`, `stallLimit`); `race` (enabled → `n`, `after`); `oracle` (enabled);
  `deploy` (enabled → `command` collected **one argument per prompt** into an argv array, blank
  to finish — never whitespace-splitting a string, which is exactly §10.1's mangling trap;
  `url`; `smoke` entries as path + status until blank; `timeoutMs`); `components` (name/dir/spec
  entries until blank, with the printed reminder that running them still requires
  `--give-them-the-box` typed at launch — the wizard configures, it cannot permit).
- Empty input keeps the bracketed default. `--show` prints the effective config (file merged
  over defaults, through the validator) and exits without prompting or writing.
- Every prompt is an injectable seam (`io.ask`, `io.write`) so tier 1 drives the full dialogue
  with a scripted answer list. No tier 2 or 3 owed: no git, no child processes, no money.
- Docs in the same slice: a README quickstart line and a DESIGN.md §10 note that the wizard
  exists and reuses the validator.

**Done when:** unit tests cover the dialogue (every group; blank-keeps-default; unasked-key
preservation; the argv-array collection; a validation failure re-prompting; the
`MEESEEKS_RUNNING` refusal; `--show` writing nothing), lint/typecheck/tier 1 green, version
bumped with ledgers in the same commit.

**Status (14 Aug 2026, 0.145.0):** built by a workflow implementer, hardened twice. The
implementer caught its own defect during a live smoke test — `rl.question` drops lines that
arrive while no question is pending, so piped stdin died as a false EOF; rewritten to buffer
`line` events with a regression test. The hostile review then reproduced a MEDIUM: the
validation re-prompt loop routed structurally unrepairable errors (an unknown key inside a
section, a poisoned key behind a disabled `enabled`) to a group whose prompts cannot reach the
offending key — the same validator sentence printed 31 times with ctrl-d as the only exit.
Fixed with an identical-after-a-round concession: a failure that survives a full re-prompt
byte-identical exits non-zero naming the hand edit, nothing written; a typed repair changes the
message, so progress never trips it. Three loop-family tests pin it (both reproductions plus
the repairable benign neighbour). Also fixed on review: `--show`'s docs no longer claim "the
effective config" — it prints the file merged over defaults, and run-time env overrides are
applied at launch, not shown. 1998 tier-1 tests. Recorded residuals: the wizard cannot empty a
non-empty list (blank means keep; clearing is a hand edit), and an unrepairable *unasked*
top-level key is discovered at the final validation rather than up front, because an early
check would also refuse baselines the dialogue can repair.

### 26. Tiered panel — triage-model review on unshippable iterations — **REFUTED (14 Aug 2026), reverted unlanded**

**Origin:** operator-approved optimization, 14 Aug 2026, priced from run-1 receipts: the first
three panels of the 0.144.0 case I race run cost ≈23.0M of the run's first ≈46.4M tokens
(~50% of the entire bill), and every one judged an iteration whose required gates had already
failed — a tree that could not ship whatever the verdict said.

**Spec:**

- New config key `reviewerTriageModel`, default `claude-sonnet-5`, validated beside
  `reviewerModel`.
- When the just-gated iteration has failing **required** gates, the cold panel runs on
  `reviewerTriageModel`; when the gates are green (a ship candidate), on `reviewerModel`. The
  panel's log line names the tier and why, so a transcript reader never has to infer it.
- The panel stays exactly as cold either way — separate processes, no build log, the same
  starvation. **Model is not independence**; nothing about §4's contract moves.
- **Monotonic-store protection, which is the load-bearing half:** a triage-tier panel's
  requirement passes are feedback only. They are never pinned as cold-passed requirements and
  never satisfy or seed a carry. Only full-model panels write pins. Without this, one sonnet
  judgment becomes unremovable under monotonicity and leaks into a later ship through the carry
  pre-filter — a false pin with no escape, the exact hazard §4.3 orders designed away before
  enforcement.
- `SHIPPED` therefore remains structurally reachable only through a full-model panel on a
  gates-green tree. No new enforcement needed; the tier selection makes it so, and a test pins
  it.
- Operator escape: set both model keys equal and tiering is off.
- Tests: tier selection in both directions; the deny path — a triage pass writes no pin and
  enables no carry — beside its benign neighbour (a full-tier pass pins exactly as today); the
  tier-naming log line.
- Docs: DESIGN.md §4 note and §10 row, deferred until the item-25 build lands (its implementer
  holds DESIGN.md).

**Done when:** the tests above are green on the tier-1 baseline, lint/typecheck clean, version
and ledgers in the same commit — and one later live run's panel bill is compared against run
1's ~50% baseline in HANDOFF, because this item exists to move a measured number.

**REFUTED — the premise was a misreading, and the code already contained the optimization.**
The item was built in full (config key, tier derivation, pin/carry protection, 17 tests, all
green) and then **reverted unlanded**, because the implementer reported — and the hostile
reviewer and a hand check both confirmed — that `driveRun` convenes the panel **only behind the
gates-green check**: `!gateOutcome.ok` sets a gates objective and `continue`s before any
review, with a comment stating the reason in words ("no reason to pay for a cold read of
something that does not pass"). Run 1's own artifacts agree: panels sat at iterations 2, 3, 5,
7, 8 — the green iterations — while the gate failures at 1, 4, 6 convened no panel at all. The
origin's claim that run-1 panels judged failing trees came from misreading log interleaving.
The triage tier would therefore be unreachable machinery: the ~50% panel bill is the price of
**ship-deciding panels on green trees**, already narrowed by the carry, and cheapening those
would soften the actual ship gate — forbidden. The reviewer also showed the built version made
a malformed `gateOutcome.ok` (a typedef-violating truthy non-boolean) strictly worse: it would
ship through a sonnet panel where today it ships through opus. Two lessons kept: **price an
optimization against the code, not against the log**, and the panel-bill lever that actually
remains is the carry (widening what counts as unchanged evidence), not the model. The full
tier-contract design (pin protection by tier, the `===  true` pinnable-needs-positive-evidence
shape) is archived in the workflow transcript should a future flow ever convene panels on
failing trees.

### 27. Health-probe fail-fast — INVESTIGATED, **DROPPED (14 Aug 2026)**

Proposed from run-1's repeated `ECONNREFUSED ... within 30000ms` waits; dropped on reading the
code before speccing. `probeHealth` already fails fast on the case worth catching — a server
process that exits is reported the moment it dies, with its output attached. The 30-second
waits in run 1 were the *other* case: a process alive but not listening on its assigned port,
which is indistinguishable from a legitimately slow-starting server without heuristics, and a
heuristic in a failure path is how a gate starts lying. Measured waste: roughly one to two
minutes across an entire multi-hour run. Not worth a mechanism; recorded so the next person
with this idea reads this instead of building it.

## Phase 4 — breadth, then the mirror.

### 20. Dogfood cases A, B, C — OPEN, **PREPARED** (run C first — TRX and the dotnet adapter)
Breadth, not risk: the link shortener, the persistence SPA, and the .NET API — the last being
the first run to exercise TRX extraction and the dotnet adapter end to end in anger.

### 21. Improve mode pointed at this repository — **DEFERRED 14 Aug, operator's decision**

**Not until the code is mostly complete.** *"Probably shouldn't run improve in this repo until we
are mostly code complete."* The engineering prerequisites are met (0.107.0 made `release-check`
declarable as `operator:release-check` in protected config), so this is waiting on the codebase
rather than on the loop. The `CLAUDE.md` scope note stays as written.
Prerequisites named in `HANDOFF.md`: pin `hooks/guard.mjs` as a security element at run start
(the positional rule does not cover it), `release-check` reachable as a gate (item 3 helps),
and the `CLAUDE.md` scope note is the operator's call to suspend — nobody else's.

**The engineering prerequisites are now met (0.107.0); the decision is still not mine.**
`extraGates` in protected `.meeseeks/config.json` makes `release-check` declarable as a required gate
named `operator:release-check`, so a builder editing `scripts/` without bumping now fails an
iteration instead of breaking the install-cache invariant silently. **Both remaining blockers are
the operator's:** suspending the `CLAUDE.md` scope note, and deciding to run at all.

**Status of the three at 0.96.0 (stale stratum — the engineering half was met at 0.107.0, per the paragraph above; kept for the history of what was outstanding when):** the guard is protected (0.88.0's `protected-guard`, positional
and self-referential — the first prerequisite is met by a stronger mechanism than the one named).
`release-check` gained the header check at 0.89.0 but **is still not a declared gate**, so a
builder editing `scripts/` without bumping still breaks the install-cache invariant silently —
that is the one engineering prerequisite left. The scope note is untouched and not mine to
retire.

### 22. HANDOFF stratigraphy sweep — DONE (0.97.0), and it found an armed hazard
The file is newest-first with older "outstanding" and "do this next" strata below; reconcile or
strike the layers the top has since answered. Same class as the 13 August doc pass, one file.

**Done — six strata reconciled in place, not struck.** And it paid for itself: buried in the A8
entry was *"decide the test-file-evidence case before building the carry"*, written before the
carry existed. **Item 12 built the carry at 0.92.0 without deciding it**, arming the hazard.
Fixed in the same commit — `isTestEvidence` refuses to carry a requirement evidenced only by a
test file. Two of five Phase 0 items were already done before this plan was written, and one
Phase 3 item shipped a known hazard; all three were found by reading `HANDOFF.md` rather than
the plan.

### 23. Closing consistency pass — DONE (docs only, no bump: docs are not a shipped path)
`DESIGN.md` and `CLAUDE.md` describe what the code does; this file's statuses all terminal;
`AUDIT.md`-style read of whatever phase 0–3 changed.

**Two real gaps found, both from 0.88.0–0.94.0 and both user-facing.** `protected-guard` — a
whole deny category — appeared in **no** document: README said the guard "denies four
categories" and listed four, `DESIGN.md` §6 never named it, and `CLAUDE.md`'s invariant *titled*
"the guard hook is not editable by what it guards" described only `.meeseeks/` in its body. All
three fixed. README's `qualityPlugins` default was also stale by one plugin.

Two new invariants written into `CLAUDE.md`, because both are load-bearing and both are easy to
delete by accident: a carried requirement is a **pre-filter** and a narrowed `pass` must trigger
the full panel, and a requirement evidenced only by a test file is **never** carried.

**Ten documented values were cross-checked against the code by executing it**, not by reading:
every config default, the `$0.0001` child-budget floor, the canonical OpenAPI path agreeing
between the gate and the fuzzer argv, and the tool-cache list. All ten matched. Every
`DESIGN.md` §10 config row exists for all 30 keys.

**Statuses as of the 14 Aug 0.140.0 sweep:** 17 DONE, 1 ANSWERED (18), 1 RUN with its design
question owned by the operator (9, superseding 9a), 1 OPEN and specified for a fresh session
(10), 1 OPEN/PREPARED (20: cases A and B; C parked), 1 DROPPED (17), 1 DEFERRED (21). The
original tally this replaced ("10 DONE, 1 NEEDS OPERATOR, 2 BLOCKED, 8 PREPARED, 1 refused")
was stale on every count within a day of being written — which is the argument for sweeping
statuses in the same commit as the work, not after it

---

## Standing rules

One item per commit; version bump with any shipped file; statuses here in the same commit;
execution records in `HANDOFF.md`. Tier 2 before commits touching race, health-probe,
toolchains, or anything shelling out; tier 3 whenever `claudeArgs`, `childSettings`, envelope
parsing, or a template output contract moves (items 4, 10, 16 at minimum). No new personas —
the cap was spent on `oracle-author`. Nothing from `BRIEF.md` section E's do-not-add list.
Experiments write their result down whichever way they land: a surprising `CLOSED` is worth
more than a flattering `DONE`.

### 28. Guard the guard's kill switch — **DONE (0.146.0)**, with R23 + R24 + R39 (from the 14 Aug ecosystem scan)

**The finding:** the hooks system documents a `disableAllHooks` setting with layered precedence
in which the target repo's own `.claude/settings.json` participates. The guard's deny
categories protect `.meeseeks/`, the guard file, git history, recursive deletes and nesting —
**but not the child's settings source.** A builder writing `{"disableAllHooks": true}` into the
target's `.claude/settings.json` (or `.claude/settings.local.json`) is a one-line unguarding of
every subsequent child, and `childSettings()` neither sets the key nor asserts its absence.
Until proven otherwise the interaction between the `--settings` blob and project settings is
treated as **fail-open**.

**Spec:** (1) a guard deny rule for in-run writes to the target's `.claude/settings.json` and
`.claude/settings.local.json`, gated on `MEESEEKS_RUNNING` exactly like protected-state — the
operator outside a run stays free, the boundary is the run; deny-path test AND benign-neighbour
test per the guard rule. (2) `childSettings()` explicitly pins `disableAllHooks: false` in the
blob it hands every child, so the driver states the fact rather than inheriting it. (3) One
tier-3 live assertion: a child spawned in a repo whose committed `.claude/settings.json`
carries `disableAllHooks: true` still fires the guard — only the live tier can see registration
truth (the eleven-version lesson). **Build gate: not while a live run reads this tree** —
children execute `hooks/guard.mjs` from disk per tool call, so this lands only between runs.

**Done when:** both tests green, tier 3 re-run green, version + ledgers in the same commit.

**Status (0.146.0):** DONE, and it carried R23 (realpath-both-sides on all three protected
predicates) and R24 (a real bash tokenizer) with it. The fail-open concern was real and is now
closed: the guard denies writes to the settings kill switch, `childSettings()` pins
`disableAllHooks: false`, and **tier 3 proved it live** — a `claude -p` child in a repo committing
`{"disableAllHooks": true}` still cannot write the ratchet (31/31 live, up from 27). The build took
**three hostile passes**: a position-only tokenizer that failed open (3 reproduced bypasses) → a
fail-closed textual floor with git-clean coverage (closed them, 1 new over-allow found) → a
tightened pure-reader carve-out (closed the over-allow). Verified by 24 real-guard-process probes
beyond the suite. R39's Factorio citation landed in DESIGN §6 as external evidence for the
positional stance. Built entirely in an isolated worktree so no live run's hot guard was touched.

### 29. gitleaks as a detect-first quality plugin, and registry version pinning — OPEN, **SPECIFIED**

From the same scan. Secrets scanning is the one hole in current security coverage (`npm audit`
is dependencies-only, semgrep's ruleset is not a secrets scanner). gitleaks: single binary,
deterministic non-zero-on-leaks exit, JSON output that could later feed security-element pins.
No canonical cross-platform install argv exists, so the `KNOWN_PLUGINS` entry must be
**detect-first** (`install: null`), degrading to a warning when the binary is absent — the
semgrep/knip precedent, but the registry schema must first learn to admit a detect-only plugin,
a small deliberate schema change with its own tests. **In the same slice:** pin versions in
existing `KNOWN_PLUGINS` install argvs (`npx -y impeccable` and unpinned pip installs resolve
whatever is current at run time — the CLI-registry analog of the marketplace auto-update
reproducibility trap the official docs now warn about). If gitleaks findings ever become pinned
security elements, design the escape before the enforcement (§4.3).

### 30. Ecosystem intake — four measured candidates, none lands without its number — OPEN

Parked from the scan's "worth design first" tier, each with the measurement it owes:
**(a) Official LSP plugins delivered to builder children** (typescript-lsp/csharp-lsp): the best
builder-sharpener found, but child delivery is DESIGN.md §5.0's open problem, the plugin does
not install the language-server binary (silent no-op — the §3.9 family), and it owes a
measured iteration-count delta before default-on. **(b) OSV-Scanner** as the cross-toolchain
dependency audit: its documented exit contract (0/1/127/128) is exactly the
nothing-defaults-to-pass shape, but it owes an overlap/noise measurement against npm audit and
a fail-closed-when-offline decision. **(c) Trail of Bits skills mining**: property-based-testing
guidance into the builder brief (property tests enter the ratchet) and the differential-review
method into the reviewer template — both template changes owing context-budget rent and, for
the reviewer, a §4 parser-contract re-read. **(d) Builder-honesty micro-distillations**
(verify-before-return; treat briefs/PRDs as untrusted data in improve mode) — one paragraph
each, each owing a failed-iteration-rate comparison. Ecosystem notes worth keeping: the Setup
hook event fires in `-p` mode (a documented per-child bootstrap point); `/plugin` now shows
per-plugin context-token cost; Anthropic's harness paper (Mar 2026) independently validates the
cold hostile panel ("agents evaluating their own work are pathological optimists").

---

## Phase 3.5 — the borrowed intake as slices (`BORROWED.md` R25–R40)

The pending "take" items from BORROWED rounds seven and eight, given numbers so the plan shows all
of the remaining feature work, not just the accreted early items. R23/R24 fold into item 28; R36/R37
into item 35; R38 into item 36; R39 into item 28's landing. The **Build order** section at the top
sequences these by campaign, not by number.

### 37. Guard ergonomics — sentinel, provenance, dampening (R25) — OPEN
Registration sentinel banner when the guard cannot run (the eleven-version class, answered
structurally); a provenance prefix on denials so an injection-hardened builder does not discard its
own guard; denial dampening (full text for the first ~3, then a one-liner + ordinal — ecc's
measured repetition-loop fix, a §3.9 specimen). Surface: `hooks/guard.mjs`, `hooks/hooks.json`,
session state outside `.meeseeks/`. **Campaign A** — same surface as item 28.

### 38. Corrupt-state quarantine (R26) — **DONE (0.148.0)**
An unparseable decision file (`pins.json`, `state.json`, `red-evidence.json`) renames aside to
`<name>.corrupt-<ts>` and reads as the strictest interpretation, loudly — never repaired in place,
never silently defaulted. Surface: `scripts/pins.mjs`, `scripts/ratchet.mjs`, the red-evidence
reader. **Campaign A** — hardens the substrate every later run reads.

### 39. Atomic red-evidence write (R34) — **DONE (0.147.0)**
`recordRedEvidence` (`driver.mjs:3611`) is the one decision writer still using a bare
`writeFileSync`; a kill mid-write can re-establish a baseline that admits unproven tests — fail-OPEN.
Fix: temp+rename, exactly as ratchet/pins/lessons already do. Surface: `scripts/driver.mjs`.
**Campaign A** — land before any long dogfood run writes this file.

### 40. Reviewer contract — an `unverifiable[]` channel + a mandatory attack account (R27) — OPEN
Two parsed reviewer-JSON fields: `unverifiable[]` fails closed at the driver; a pass with no
non-empty attack account is an unparseable pass (already a fail by law). Makes lazy charitable
passes machine-detectable. Surface: `templates/reviewer-system.md` + the envelope parser + tests in
one commit; **tier 3**. **Campaign B**.

### 41. Review packaging — truncation honesty + the diff base (R28) — OPEN
Per-file/total byte caps when assembling the panel's evidence, with an in-band marker so a starved
reviewer is told; and the diff base is the recorded pre-iteration commit, never `HEAD~1`. Surface:
the review-packaging path in `scripts/driver.mjs`. **Campaign B**.

### 42. Design-slop gate drives impeccable's real `--json` interface (R29) — OPEN
Read impeccable's machine-parseable finding stream (advisory/primary partition, `file://` targets,
`--viewport`) instead of exit codes only; findings become reviewer evidence. Committed `--json`
fixtures. Surface: the design-slop gate in `scripts/gate-policy.mjs`/`scripts/toolchains`.
**Campaign C** — pairs with the web-ui smoke's design-slop exercise.

### 43. Gate-skip on an unchanged workspace (R35) — OPEN
Content-hash "nothing changed since the last gate run → don't re-pay for the gate"; increment the
attempt counter instead. Attacks the ship1 token-thrash class. Surface: `scripts/driver.mjs` gate
loop. **Campaign C**.

### 44. Prompt hygiene at the untrusted-text frames (R30) — OPEN
Additive-only envelope for repo-supplied guidance (may ADD checks, cannot suppress findings;
byte/count-capped) + delimiter neutralisation at each untrusted frame (test names, requirement
strings). Surface: prompt assembly in `scripts/driver.mjs`. **Campaign C**.

### 45. Small trims — parse-time flag validation, `/meeseeks` frontmatter, break clause (R31/R32/R33) — OPEN
One batched slice: `parseDriverArgs` + the wizard validate numeric/date flags at parse time and exit
naming the flag; `allowed-tools` on `commands/meeseeks.md` pinned to the driver invocation; the
style layer states its own break-character escape. Surfaces small and independent. **Campaign C**.

### 46. Bounded gate-output → next-iteration repair context, with per-id retry counts (R40) — OPEN
Formalise "bounded gate-failure output → the next iteration's repair context, with a per-id retry
counter," generalising §1.2's within-run regression count beyond ratchet regressions to gate
failures. Surface: `scripts/driver.mjs`. **Campaign C**.

---

## DoD — the operator's done bar (set 14 August 2026)

Two parts, both required, and they bound an otherwise-asymptotic backlog:

1. **All outstanding features done, tested, fixed** — items 24 (→ DONE via the boxed dogfood),
   28, 29, the `BORROWED.md` R23–R33 menu, item 30's four candidates, and the owed measurement
   runs (oracle2, a race that actually applies a winner, cases A/B). Deferred/dropped stay out.
2. **The Next.js enterprise capstone below runs.**

Item 21 (the mirror — improve mode on this repo) remains the final act, un-deferrable once part 1
is code-complete.

### 31a. Web-ui smoke — the penultimate test, run BEFORE the capstone — OPEN, **STAGED**

**Ordering, operator's call 14 Aug:** no web-ui target has ever run through this machine, so the
frontend-direction template, the design-slop gate, Playwright-as-ratchet-evidence and the
health-probe booting a dev server are all unproven plumbing. Prove them on the smallest real web
app first — one iteration on a toy, not eight hours into Ateliers — then run the capstone. This is
information value first, the same discipline as the whole Phase 1.

**Target:** `~/dare-dogfood/webui-smoke` — "Tallyho", a single-page Next.js task list:
add/toggle/remove, a live incomplete-count, `localStorage` persistence, a coherent visual system,
`/api/health`, and Playwright e2e over the flows. Five requirements, no auth, no database — the
smallest thing that exercises the full web toolchain. Config: uncapped, `maxIterations: 6` (it
should ship in 1–3). **Same toolchain as the capstone**, so a green run here de-risks the identical
gate path Ateliers depends on.

**Done when:** the run ships a Next.js app that builds and serves `/` 200, with the Playwright
flows passing — and the run is read for what it teaches about the web gates (design-slop timing,
Playwright boot, health-probe) before the capstone launches. A failure here is the cheap place to
find a broken web gate.

### 31. Capstone — build a chunky enterprise Next.js app, unattended, that RUNS — OPEN, **STAGED**

**DoD part 2.** The largest dogfood attempted and the first serious **web-ui** target, so it is
the first live exercise of `templates/frontend-direction.md`, the impeccable design-slop gate,
Playwright e2e as ratchet evidence at scale, and the health-probe confirming the dev server boots.

**Target:** `~/dare-dogfood/nextjs-capstone` — "Ateliers", an internal project & resource tracker:
Next.js App Router + TypeScript, email/password auth with hashed passwords and signed cookies,
SQLite persistence via a typed data layer, two roles (admin/member) with server-side access
integrity, project/task CRUD, a dashboard with live counts, a seed script, `/api/health`, and
Playwright e2e over the core flows. 12 requirements across auth, data, roles, UI and a
build-and-runs gate (PRD-5.1). Every requirement is satisfiable; none is a trap. Config: uncapped
ceilings, `maxIterations: 20`, the standard quality-plugin trio.

**Runs, not just ships:** PRD-5.1 requires `npm run build` to succeed and the server to serve
`/login` 200; PRD-5.2 requires the e2e suite to pass against the running app. "That runs" is in
the bar.

**Launch discipline:** only after part-1 features are code-complete, with the finished machine.
The PRD gets one hostile shippability review first (an impossible requirement would doom the run
the way the rejection PRD does). Expect many iterations and 100M+ tokens; uncapped is intended
(operator on max plan, budgets rank -0).

**Done when:** the run produces a Next.js app that builds and serves, with the seeded core flow
working end to end under Playwright — a full `SHIPPED` is the target, and a run that ends with a
running-but-incomplete app is documented honestly as a partial, not dressed as a ship.

## Phase 6 — the expansion. Post-DoD; ambition, not scope. Added 14 Aug by operator decision.

**Nothing in this phase begins before the DoD is met — the features, then Tallyho, then Ateliers
actually running.** A general-agent ambition on an unproven core is how projects die of scope;
this phase is earned from proof, not hope, and is recorded here so the ambition is captured
without moving the "done" line.

**North star:** do NOT build a crazier general agent (that is the trap — generality costs the
spine: no ratchet, no cold-panel verdict, no oracle, and meeseeks becomes a worse Prime Agent).
Build **the trustworthy substrate any agent's output must pass through before anyone believes
it** — across more models, more languages, and more verifiable job-types. The move is never
"become general"; it is "widen the set of job-types that have a verifiable done-bar," and every
item below extends meeseeks along an axis that does **not** cross an invariant. Growth of surface,
never movement of the spine — which is only safe because the narrow rigid core was built first.

Origin: the 14 Aug prime-agent recon + mine (`BORROWED.md` round eight). Prime Agent is a general,
model-agnostic, self-improving coding harness that lacks all three meeseeks guarantees (ratchet,
cold separate-process judge, positional guard). These items absorb its genuinely-good capabilities
into the verification-first architecture; the non-goals below are the ones that would dilute it.

### 32. Model-agnostic backends + a heterogeneous cold panel — OPEN
Add backend adapters behind `spawnClaude`/`claudeArgs` (Codex, open models, others). The
meeseeks-only twist that makes this a verification UPGRADE rather than parity: let the cold panel
run on a **different model than the builder** — a reviewer that is not even the same model is more
independent, not less. **Invariant:** the panel stays cold and separate-process; heterogeneity
strengthens independence, never softens review. Touches the spawn contract → **tier 3 mandatory**.

### 33. More language toolchains + reporters (Python, Go, Rust) — OPEN
New `scripts/toolchains/*.mjs` + `scripts/reporters/*.mjs` behind the existing fixed toolchain
contract (the same shape dotnet proved). Each: detect, map the gates, parse the framework's
reporter output into ratchet ids. **Invariant:** fixture-tests-over-mocks against real committed
reporter output; each new reporter owns a contract another binary defines → one **tier-2/3 live
check** per toolchain. The core loop is already language-agnostic (the ratchet parses reporter
JSON, not syntax) — this is surface, not spine.

### 34. Verified research mode — OPEN
The differentiated land-grab: do what their "research agent" does, but *verified*. New job-type
whose gates are citations-resolve (the quoted text appears in the cited source), claims-are-sourced,
no-contradictions, coverage-of-a-checklist — and the **held-out oracle repurposed as a
fact-checker** authored before the research is written. **Invariant:** nothing-defaults-to-pass and
the held-out principle carry over unchanged; the reporter emits deterministic pass/fail evidence
(a citation resolver) exactly as a test reporter does. Offers the one thing a self-evaluating
research agent structurally cannot: research trustworthy unwatched.

### 35. Continual-memory discipline, operator-side (folds R36 + R37) — OPEN
Adopt Prime Agent's Continual-Harness *discipline* on the DRIVER, never the builder: bound the
lesson STORE (not just the view), add retraction/rollback with an append-only history, and a gated
promotion so run-local candidate lessons enter the durable cross-run store only through a distinct
gate (cold-reviewed or usage-thresholded). **Invariant:** driver-owned, never builder-editable
(§13.8); design the escape before the enforcement; the builder stays starved. The Factorio study
(R39) is the warning label: self-modifiable state under the builder's reach becomes the exploit.

### 36. Durable, resumable, daemon-backed runs (folds R38) — OPEN
A driver that survives the terminal closing, re-discovers in-flight worktrees on relaunch, and
resumes — plus a driver-owned sub-run registry (sub-run-id → worktree → status) extending race.mjs'
SIGKILL sweep-at-start. **Invariant:** the guard still owns `.meeseeks/` (registry is
driver-written), the run-lock holds, results are read from artifacts never a child's return value,
no nesting unless `--give-them-the-box`. Matches "long-running across sessions" with the spine
intact.

### Phase 6 non-goals — the refusals ARE the product
Recorded so a future session does not "helpfully" add them:
- **Persistent kernel / REPL as the builder's environment** — breaks builder starvation; state
  leaks past `git reset --hard` and the ratchet's premise dies.
- **Builder self-memory or self-grading** — breaks cold review; self-evaluation is the enemy the
  whole design defeats.
- **Open-ended "just keep working" mode with no DoD** — meeseeks requires a verifiable done-bar;
  the answer to "handle more work" is more job-types with done-bars (32–34), never no done-bar.
- **A warm interactive TUI as the primary surface** — unattended-trustworthy is the moat; an
  attended mode, if ever built, is a separate surface and must not wag the verification dog.
