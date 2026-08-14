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

### 14. R17 — metamorphic relations in the oracle — DONE (0.100.0); **the live half is owed to the next oracle-armed run** (no run has yet had a relation judge real code — unverified and previously unowned)
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
