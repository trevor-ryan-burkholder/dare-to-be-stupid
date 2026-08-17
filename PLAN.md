# PLAN — what remains. Compiled 13 August 2026; statuses last swept 17 August at 0.164.0

**This is the only live implementation plan.** `REVIEW.md` is the separate Codex-owned external
acceptance gate; its finding status is authoritative and is linked here rather than duplicated.

`HANDOFF.md` records current measured state. `BRIEF.md`, `COMPLETION.md`, and `AUDIT.md` are
compatibility pointers to frozen snapshots under `docs/history/`. `BORROWED.md` points to
non-normative research. `docs/INDEX.md` defines the complete authority map.

**Ordering principle:** safety and correctness before feature breadth; information-producing
experiments precede construction only when their result can invalidate that construction.

Statuses: `OPEN` → `IN PROGRESS` → `DONE (version)` / `CLOSED (reason)` — plus, as reality
required them: `PREPARED` (staged, unrun), `RUN (date)` (executed, question answered or moved),
`ANSWERED` (measurement obtained), `BLOCKED` (cannot start until named prerequisites close),
`PARKED` (intentionally outside the current queue until its admission condition is met),
`DROPPED` (operator refused), and `DEFERRED` (operator postponed).

---

## Build order — current traversal at 0.164.0

**Gate 0A — high-priority external review defects.** These are release-blocking implementation
items; the full requirements and closure evidence remain reviewer-owned in `REVIEW.md`.

- **F1:** acquire the repository lock atomically before any work.
- **F26 / item 81:** after that lock, revalidate launch safety and admit only declared pre-loop phase outputs.
- **F2:** make timeout and output-cap termination force and settle after a bounded SIGTERM grace
  period.
- **F3:** prevent an unrelated local listener from satisfying the health gate.
- **F6 / item 60:** resolve every passing reviewer citation to a contained, existing line before
  Panel combination.
- **F7 / item 61:** require both process success and envelope success from every Claude role.
- **F12 / item 66:** bind every role and terminal decision to one immutable specification revision.
- **F8 / item 62:** bind held-out Oracle cases to that run and specification revision.
- **F14 / item 68:** commit and tag only the exact workspace identity gated and reviewed.
- **F16 / item 70:** accept only fresh successful test reports from the current gate attempt.
- **F18 / item 72:** conserve every completed child envelope into ceilings and terminal receipts.
- **F29 / item 85:** keep candidate-tree instructions out of reviewer authority; candidate files
  remain evidence, while binding review inputs come from identified immutable sources.

**Gate 0B — external child/platform contracts.** F5 is implemented by item **56**: measure the real
child-environment contract before replacing ambient inheritance, then prove the boundary through a
paid Claude child. F11 is item **65**: prove descendant cleanup on Windows rather than inferring it
from POSIX process-group tests. F15/item **69** must either establish real Oracle read isolation or
narrow the product guarantee based on a paid Builder probe. F21/item **75** adds the real-loader
and disposable-cache release contract. F25/item **80** makes the shipped command user-invocable only
under the current Claude Code command/skill contract without claiming to authenticate arbitrary
direct Bash. F27/item **82** makes each non-Builder role's tool availability match its declared
policy rather than only pre-approving named tools. F28/item **83** establishes and enforces the
measured product-wide Claude Code feature floor. All close before feature fan-out.

**Gate 0C — remaining external review defects.** Close F4's absolute HTTP deadline/body cap, F9's
positional machine-state ignore boundary through item **63**, F10's complete atomic terminal
receipt through item **64**, F13's non-shrinking gate roster through item **67**, F17's
definition-bound test credit through item **71**, F19's bounded decision-artifact reads through
item **73**, F20's contained reporter identities through item **74**, F22's durable exact-tree
acceptance receipt through item **76**, F23's inert model configuration through item **78**, and
F24's hidden PRD checkpoint through item **79**. F11 may share F2's process-lifecycle
implementation, but retains its own platform evidence.

**Gate 0 dependency edges.** The A/B/C groups classify priority and external evidence; they are not
permission to implement shared primitives in arbitrary order. Preserve these concrete edges:

1. F1 owns the run before any later Driver state transition. Item **81** then captures and enforces
   launch/pre-loop provenance under that ownership before any child, archive, target-content write, or
   phase commit. F2 and F11 share one bounded terminate/force/sweep state machine while retaining
   separate platform evidence.
2. Item **66** establishes the one specification identity consumed by items **62**, **68**, and
   **76**; do not let any of those invent a parallel PRD identity.
3. Item **64** establishes the atomic terminal writer before item **73** routes refusal through it
   and before item **76** extends its receipt.
4. Items **68**, **70**, and **72** establish exact-tree, attempt, and usage identities before item
   **76** assembles the acceptance receipt. Items **71** and **74** must agree on the contained test
   definition receiving current credit.
5. Item **75** may build the reusable loader gate in Gate 0B, but its acceptance run exercises the
   staged, version-bumped candidate after that slice's shipped-file changes have landed. Items
   **79** and **80** should share one versioned command-contract slice, whose installed result item
   **75** verifies. Item **83** may add parsing and early refusal independently, but its declared
   floor is accepted only after the staged candidate passes the mandatory item **75**, **80**, and
   **82** live contracts at both the floor and current supported CLI. This is an evidence
   dependency, not a construction cycle. Every later release candidate reruns the gate; an earlier
   source-only or version-only pass is never acceptance evidence.
6. Complete Gate 0 and item **77**, then record item **84**'s containment outcome, before item
   **54** may fan a role out into a dynamic workflow. In particular, items **77**, **82**, and
   **83** establish distinct prompt-supply, effective tool-availability, and supported-CLI
   boundaries; none is evidence for another, and `--safe-mode` is not a substitute for an exact
   tool set.
7. Item **85** consumes item **66**'s immutable specification, item **68**'s exact candidate
   identity, and items **77**, **82**, and **83**'s instruction/tool/CLI contracts. This edge crosses
   the headings below: implement item **77** after item **66** and before closing F29 rather than
   waiting for every Gate 0 item to finish. Its Driver-owned reviewer contract is not item **51**'s
   general `CONSTITUTION.md`, which remains excluded from Panel.

**Campaign 1 — reviewer contract:** after F6/item **60**, implement item **40** (unverifiable
channel and mandatory attack account). Item **77** is physically described in this campaign but
executes during Gate 0 after item **66**, because F29/item **85** consumes its machine-checkable
cold-role `not supplied` supply manifest. It complements but does not close F15's separate
filesystem-confidentiality question. Item **41** is closed as
inapplicable: the current Driver does not assemble a Panel diff package, and its `HEAD~1` uses do
not feed review evidence. Batch actual shared parser/template work and pay the required tier-3
check once.

**Campaign 2 — deterministic gates:** finish item **42** Slice B (impeccable JSON, reviewer
evidence, viewport path) → item **29** (detect-first gitleaks and registry version pinning).

**Campaign 3 — live evidence:** complete item **24** with boxed-component dogfood → item **57**
(machine-readable morning-acceptance results) → cases **A/B** from item **20** → item **31**, the
staged Ateliers capstone. Case C is **PARKED by operator decision**; it is not first in this queue
and must not be launched without reopening that decision.

**Campaign 4 — containment experiment and bounded follow-ons:** after items **56**, **82**, and
**83** establish the measured child boundary, run item **84** and record whether a stronger
containment profile is portable, capability-gated, or rejected. The experiment does not silently
change the supported default. Then take item **52** denial dampening → item **53** styled milestone
lines, after safety and reviewer work.

**Research-gated and conditional work:** item **54** remains **BLOCKED** on Gate 0, item **77**, and
a recorded item **84** outcome; it does not enter the queue merely because the supporting analysis
exists. Item **55** remains **PARKED** until
a real run demonstrates a provenance or invalidation failure that passes its admission test. Item
**58** remains **PARKED** until a killed-run experiment proves that a lifecycle journal would close
a forensic gap; it is not authorization for checkpoint/resume.

**Deferred/post-DoD:** item **21** remains deferred until code-complete. Items **32–36** and
**47–51** remain Phase 6; within that phase item **49**'s artifact substrate precedes its first
Verified Research instance, item **34**, despite their chronological numbering. Item **59** is also
post-DoD because it depends on item 35. Item **30** remains a research/measurement intake, not an
implicit build. Item **86** is parked post-DoD; it cannot enter the queue until its containment and
incremental-detection admission conditions are met.

`PLAN.md` owns these statuses. `HANDOFF.md` summarizes them and must not invent a second ledger.

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
derived whenever `costCeiling` is armed (the default); `costCeiling: 0` deliberately omits it.
**`--max-turns` ships off by default** (`maxChildTurns: 0`) because no
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

- New shipped file `scripts/configure.mjs`; from the target repository, run the installed or source
  copy by absolute path. Interactive wizard over `node:readline/promises`. No dependencies, ESM,
  Node ≥22.12.
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
- The panel stays exactly as cold either way — separate processes, and the Driver supplies no build
  log or iteration history under the same `not supplied` discipline. This is not a filesystem-read
  barrier. **Model is not independence**; nothing about §4's contract moves.
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

### 20. Dogfood breadth — A/B **PREPARED**; C **PARKED by operator decision**
Cases A and B are the pending link-shortener and persistence-SPA runs in `DOGFOOD.md`.
Case C would exercise TRX and the .NET adapter end to end, but it is not scheduled and must not
run unless the operator explicitly reopens the 14 August decision.

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
parsing, or a template output contract moves (items 4, 10, 16 at minimum). No new standing
authority personas—the cap was spent on `oracle-author`. Driver-owned job/lens prompt addenda
explicitly required by items 34 and 86 reuse existing authority identities and spawn paths; they do
not create a persona, effort key, or terminal authority. Nothing from `BRIEF.md` section E's
do-not-add list.
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

### 37. Guard ergonomics — crash-net fallback + provenance (R25) — **DONE (dampening split to item 52)**
Registration sentinel banner when the guard cannot run (the eleven-version class, answered
structurally); a provenance prefix on denials so an injection-hardened builder does not discard its
own guard; denial dampening (full text for the first ~3, then a one-liner + ordinal — ecc's
measured repetition-loop fix, a §3.9 specimen). Surface: `hooks/guard.mjs`, `hooks/hooks.json`,
session state outside `.meeseeks/`. **Campaign A** — same surface as item 28.

**Landed:** the answer to "the guard cannot run" is not a sentinel banner from `guard.mjs` (which by
definition did not run) but a **chained crash-net** — `hooks.json` now registers
`node "guard.mjs" || node "guard-fallback.cjs"`, and the new ES5 `guard-fallback.cjs` denies inside a run
(nothing defaults to pass) and warns on stderr always. `childSettings` validates **every** quoted path in
the chain. Provenance prefix (R25b) lands on every denial. The fallback is in the `protected-guard` set,
so a deciding link cannot be edited by what it guards. **Dampening (R25c) was built, then cut on review** —
the item-37 hostile panel found it gave the guard a symlink-exploitable write primitive and keyed by
session not rule; it is re-filed as **item 52** with the safe design. See `HANDOFF.md`.

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

### 41. Review packaging — truncation honesty + the diff base (R28) — **CLOSED (not applicable, source-traced 16 Aug 2026)**
The proposed implementation surface does not exist. Panel processes receive a bounded prompt and
inspect the candidate repository directly with read-only tools; the Driver does not assemble or
truncate a review diff package. The `HEAD~1` uses in `scripts/driver.mjs` support lesson extraction
and scoped restore/change accounting, not Panel evidence. `diffStat()` is consumed by the blooper
record after reset, not by a reviewer. Therefore replacing a review base or adding truncation markers
would create a second evidence path rather than repair the current one.

R28 remains useful non-normative research if a future implementation introduces a packaged diff.
At that point the package must name its exact base/tree and mark every truncation in-band. No runtime
change is justified today.

### 42. Design-slop gate drives impeccable's real `--json` interface (R29) — **IN PROGRESS (Slice A done, 0.152.0)**
Read impeccable's machine-parseable finding stream (advisory/primary partition, `file://` targets,
`--viewport`) instead of exit codes only; findings become reviewer evidence. Committed `--json`
fixtures. Surface: the design-slop gate in `scripts/gate-policy.mjs`/`scripts/toolchains`.
**Campaign C** — pairs with the web-ui smoke's design-slop exercise.

**Slice A landed (0.152.0):** `scripts/design-slop.mjs` `parseImpeccableFindings` — the pure parser,
partition on `advisory === true` (not severity; the fixture proved the trap), fail-closed, fixture-tested
against real impeccable 4.0.4 output (`test/fixtures/impeccable/`). No runtime change yet.
**Slice B (pending):** rewire the design-slop gate from `npx impeccable detect src/` (exit-code only,
`scripts/plugins.mjs:68`) to `detect --json <target>` + `parseImpeccableFindings`, surface primary findings as
reviewer evidence, add the `--viewport` mobile pass and `file://` artifact target. Held to land alongside the
web-ui smoke (31a) so the gate rewire is validated on a real web run, not blind. Contract facts for Slice B:
impeccable's runnable entry is `detector/detect-antipatterns.mjs` (`isMainModule` guard); a bare HTML path uses
the static engine (no browser), a `file://` URL uses Puppeteer; exit 2 iff primary findings > 0.

### 43. Gate-skip on an unchanged workspace (R35) — **DONE (0.149.0)**
Content-hash "nothing changed since the last gate run → don't re-pay for the gate"; increment the
attempt counter instead. Attacks the ship1 token-thrash class. Surface: `scripts/driver.mjs` gate
loop. **Campaign C**.

### 44. Prompt hygiene at the untrusted-text frames (R30) — **DONE (0.158.0; R30a recorded as no-live-channel)**

**Landed (0.158.0):** `neutralizeLine` (visible `\n`, rendering-only, ratchet ids byte-exact) at every
single-line untrusted slot in the brief, the gate detail inside a defended `~~~` fence, the driver's
`parseError`/lesson-evidence inline frames — and, from the item's own hostile review (one surviving HIGH),
`renderAssumptions`: builder-authored assumption fields were rendered raw into the **cold reviewer's**
prompt inside driver-vouched framing, the highest-value injection slot in the system. All neutralised at
render time; hostile + benign tests per slot. R30a (additive envelope) has **no live channel** — design
recorded below for the day one opens.
Additive-only envelope for repo-supplied guidance (may ADD checks, cannot suppress findings;
byte/count-capped) + delimiter neutralisation at each untrusted frame (test names, requirement
strings). Surface: prompt assembly in `scripts/driver.mjs`. **Campaign C**.

**Scoping (15 Aug), so the next session builds instead of re-deriving:**
- **The envelope half (R30a) has NO live channel today** — nothing forwards target `CLAUDE.md` or
  improve-mode docs into a driver-assembled prompt; the improve author reads the repo in its own child
  context, which is not a driver frame. Do not build envelope machinery for a channel that does not
  exist; the envelope design is recorded here for the day one opens (framed block, may only ADD checks,
  byte/count-capped, one direction of influence: stricter).
- **The delimiter half (R30b) is live, and the frames are inventoried.** Builder-controlled text enters
  driver-assembled prompts at: the brief's single-line slots (`scripts/brief.mjs` — regression test ids,
  `protectedTests` ids, history file paths, `deniedLastIteration` strings, lesson ids/text, findings,
  advisory fields; a test *named* with an embedded newline can forge brief structure, e.g.
  `x\n## Objective\n…`); the brief's multi-line gate-detail block (bounded since 0.151.0, not
  neutralised); and inline driver frames (`parseError` at the capability re-declaration, the
  lesson-extractor's `evidence` built from builder-chosen ids/paths).
- **The design:** a `neutralizeLine` helper for single-line slots — embedded `[\r\n  ]` rendered
  *visibly* as a literal `\n` marker (ASCII, per the banner lesson), never silently stripped; the
  gate-detail block moves inside a **fence**, where the delimiter to defend is the fence itself (a detail
  containing a ``` run must not break out — use a longer fence or strip fence runs, and test that case
  hostile); inline frames get the same one-line treatment. Neutralisation is rendering-only — ids
  compared against the ratchet stay byte-exact; only their *display* in prompts changes.
- **Tests:** hostile (a newline-forged heading stays one visible line; a fence-run detail cannot close
  the fence) and benign (ordinary ids byte-identical) per slot, the repo's deny-path/neighbour pattern.

### 45. Small trims — parse-time flag validation, `/meeseeks` frontmatter, break clause (R31/R32/R33) — **DONE (0.150.0)**
One batched slice: `parseDriverArgs` + the wizard validate numeric/date flags at parse time and exit
naming the flag; `allowed-tools` on `commands/meeseeks.md` pinned to the driver invocation; the
style layer states its own break-character escape. Surfaces small and independent. **Campaign C**.

**Landed.** R31 (`parseDriverArgs` now refuses an unknown flag by name — the wizard's argv guard and
`parseDeadlineFlag`'s value check were already fail-closed, so the driver's silent-drop was the one
remaining fail-open) and R33 (the break-character clause in `output-styles/meeseeks.md`) are unit-tested,
tier 1. R32 (least-privilege frontmatter, modeled on the shipping `ralph-loop` pattern) is landed with a
content-presence test but **is not verified against the live Claude Code permission matcher** — a
different binary's contract, which the scope note forbids exercising here by running `/meeseeks`. Failure
mode is benign (a one-time prompt, never unsafe); **owed:** confirm the pre-approval matches on the next
real `/meeseeks`. See `HANDOFF.md` 0.150.0.

### 46. Bounded gate-output → next-iteration repair context, with per-id retry counts (R40) — **DONE (0.151.0)**
Formalise "bounded gate-failure output → the next iteration's repair context, with a per-id retry
counter," generalising §1.2's within-run regression count beyond ratchet regressions to gate
failures. Surface: `scripts/driver.mjs`. **Campaign C**.

**Landed.** The **retry-counter** half was already present — a gate that keeps failing is named to the
builder via `repeatedGateNote` + `gateFailureStreaks` (consecutive-streak, threshold 3, folded into
`objective.reason`), built for case I. The remaining **bounded-output** half is the actual net-new work and
lives in `scripts/brief.mjs`: `boundedGateDetail` caps each gate's `detail` on the brief path by 60 lines
and 4000 chars (the detail previously flowed into the builder prompt verbatim, up to the 64 MB child buffer;
`LIST_CAP` bounds gate *count*, never *length*). +3 tests via `compileBrief`. See `HANDOFF.md` 0.151.0.

---

## DoD — the operator's done bar (set 14 August 2026)

Two parts, both required, and they bound an otherwise-asymptotic backlog:

1. **All outstanding features done, tested, fixed** — items 24 (→ DONE via the boxed dogfood),
   28, 29, the `BORROWED.md` R23–R33 menu, item 30's four candidates, and the owed measurement
   runs (oracle2, a race that actually applies a winner, cases A/B). Deferred/dropped stay out.
2. **The Next.js enterprise capstone below runs.**

Item 21 (the mirror — improve mode on this repo) remains the final act, un-deferrable once part 1
is code-complete.

### 31a. Web-ui smoke — the penultimate test — **SHIPPED, 15 Aug, attempt 6: panel unanimous on 6 requirement(s)**

**The first web-ui `SHIPPED` in this machine's history, and operator-verified after the fact:**
`npm start` boots in 94ms, `GET /` **200**, `GET /api/health` **200** `{"status":"ok",...}`. Six attempts,
~$85 of runs, **six machine defects found and fixed the same day** (0.154.0–0.160.0: filesystem routes,
`.next/` false-pass, PORT contract untold, two-masters port oscillation, Stryker sandbox poison spiral,
zero-coverage crash misdirection), the parallel panel forensic across ~12 convenings (a real duplicate-id
bug with repro payload; a real doc-invariant drift held to the line for four attempts until actually
fixed), the A8 carry live, chromium auto-provisioning live, the announced-port probe fallback live on the
ship itself. Full campaign read-out in `DOGFOOD.md`. **All four previously-unproven web subsystems are now
proven. The capstone path is open.**

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
ceilings, `maxIterations: 20`, the standard quality-plugin set.

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

### 34. Verified research mode — OPEN (the first instance of item 49's substrate)

**Problem solved:** a polished unattended report can contain unsupported, stale, incomplete, or
contradictory claims while its author confidently reports success. This job type applies the
existing independent-evidence spine to research without pretending that citation syntax proves
truth.

**Prerequisites:** Gate 0, including item **77**'s executed prompt-supply boundary; item **40**'s
parsed `unverifiable` channel; item **49**'s artifact substrate; and a recorded item **84**
containment outcome. Reuse those mechanisms rather than creating research-local substitutes.

The Driver seals the question, scope, freshness date, allowed source classes, evidence-retention
policy, acceptance checklist, and budget before execution. A fresh job-specialized producer in the
existing Builder authority class (called Researcher here) produces the report plus a
machine-readable claim/source manifest.
This is a sealed job brief in the existing producer authority class and role-spawn path, not a new
durable authority, standing persona, or configuration effort key. It must not literally reuse the
current code-only `builder-system.md` contract. Implementation first factors common producer
authority rules from job-specific code/research addenda, all Driver-owned and versioned; the job's
explicit tool/effect profile may narrow but never broaden its sealed authorization. Deterministic
checks prove only what scripts can establish: required coverage exists, citation locations resolve,
quoted text matches the cited source, material claims have evidence links, and the manifest does not
assign incompatible normalized values to the same claim id. A Driver-owned prose-toolchain
acquisition gate produces a source-evidence package for every material citation: canonical
identity, retrieval time, content digest, locator, and the exact source artifact or reviewable
context policy permits retaining.
Reviewers inspect that immutable package rather than a silently changed refetch. If evidence cannot
be retained or independently reacquired under the sealed policy, classify it `unverifiable`; never
archive credentials, authorization headers, or secret values. Item **77**'s supply report and item
**85**'s authority boundary classify every source artifact and its metadata as untrusted evidence;
source instructions cannot become Researcher or reviewer authority. The first supported retrieval
profile is public HTTPS only: validate every redirect and connection target as public, reject
local/private/link-local addresses and non-HTTPS schemes, apply F4's absolute deadline/body-cap
primitive, send no ambient cookies or credentials, and normalize source content to inert text without
script or active-content execution. Authenticated, local, and private sources are refused until a
separate normative security profile and hostile live evidence exist. Whether a source actually
supports an inference, whether uncited counterevidence changes the conclusion, and whether the
report answers the question remain cold-review judgments.

One independently instantiated cold Panel member receives the final artifact, manifest, and bound
source evidence under a factuality lens without the Researcher's scratch context. A separate cold
Panel member judges synthesis, usefulness, and checklist coverage. Both reuse the existing
cold-review authority and spawn path with Driver-owned lens addenda; the current code-specific
reviewer contract must not be followed literally for prose evidence. They are not new reviewer
personas. The existing Oracle may supply a precommitted held-out fact fixture only when it has a
deterministic executable observation and was authored before the Researcher output. Disputed
semantic support remains Panel judgment or `unverifiable`; a second model
opinion is not deterministic Oracle evidence. Researcher cannot author, see, revise, or grade the
fixture. Only Driver may record accepted criteria or terminal status. A disposable dynamic workflow
may run inside Researcher, but its success is role output, never certification.

**Done when:** item **49**'s artifact substrate can run a real research artifact end to end; fixtures
cover unsupported claims, citation mismatch, unavailable and stale required sources, source change
between production and review, disallowed evidence retention, redirect-to-local/private targets,
DNS/address-policy changes, body/deadline exhaustion, active content, contradictory manifest values,
incomplete coverage, reviewer parse failure, crash/restart, and budget exhaustion; source packages
bind acquisition identity without secrets and hostile-source fixtures cannot alter role authority;
the acceptance receipt binds the package digest, and carry invalidates when the report, manifest,
or package changes; deterministic output distinguishes traceability from semantic support; cold
factuality and synthesis reviewers remain independently contextualized; deterministic held-out
fixtures execute without Researcher context; semantic uncertainty is recorded as `unverifiable`;
and unavailable required evidence fails closed with a structured reason mapped to one of the
existing non-`SHIPPED` terminal
states.

### 35. Continual-memory discipline, operator-side (folds R36 + R37) — OPEN
Adopt Prime Agent's Continual-Harness *discipline* on the DRIVER, never the builder: bound the
lesson STORE (not just the view), add retraction/rollback with an append-only history, and a gated
promotion so run-local candidate lessons enter the durable cross-run store only through a distinct
gate (cold-reviewed or usage-thresholded). **Invariant:** driver-owned, never builder-editable
(§13.8); design the escape before the enforcement; the builder stays starved. The Factorio study
(R39) is the warning label: self-modifiable state under the builder's reach becomes the exploit.

**SkillOpt harvest:** promotion support must come from independent runs/objectives, not merely
several iterations of one run. Stage each candidate with its source evidence, support count, digest,
and proposed atomic edit. Keep an append-only rejected-candidate ledger containing the validation
delta and refusal reason so the promoter can avoid repeating harmful edits; this ledger never enters
a Builder brief. Item 59 owns the offline optimization experiment, while this item owns the durable
store, adoption, rollback, and retraction boundary.

### 36. Durable, resumable, daemon-backed runs (folds R38) — OPEN
A driver that survives the terminal closing, re-discovers in-flight worktrees on relaunch, and
resumes — plus a driver-owned sub-run registry (sub-run-id → worktree → status) extending race.mjs'
SIGKILL sweep-at-start. **Invariant:** the guard still owns `.meeseeks/` (registry is
driver-written), the run-lock holds, results are read from artifacts never a child's return value,
no nesting unless `--give-them-the-box`. Matches "long-running across sessions" with the spine
intact.

**Use the native detachment experiment before building a daemon.** Current Claude Code
[agent view](https://code.claude.com/docs/en/agent-view) is research preview, but its
background-session supervisor documents that a full session keeps running
without an open terminal and persists through supervisor restarts, auto-updates, and sleep. It also
documents shutdown stops, possible post-sleep hangs, human-needed states, and session-local storage;
none is Meeseeks recovery evidence. Run this only after F25/item **80** has verified the user-only
command boundary; the current 0.164.0 command does not yet establish it. In a disposable target, the
operator—not autonomous dispatch—must start `/meeseeks` and then background the in-flight session.
Close agent view and the shell, restart the supervisor, and verify the exact Driver PID/descendants,
output, guard, lock,
receipts, and terminal state. A Claude row labelled Completed is never `SHIPPED`. If this safely solves
terminal detachment, narrow item 36 to the unprovided crash/reboot/relaunch and Driver-state recovery
work. If it does not, reject the native path; do not make a research-preview supervisor a dependency.

### 47. Accept an ERD alongside the PRD, and gate the schema against it — OPEN (Phase-6 class, post-DoD)

**Origin:** operator, 15 Aug 2026, after an ERD of the Ateliers capstone made its schema's two
integrity rules checkable at a glance. The data model is where prose is most ambiguous and builder
hallucination most expensive; an ERD is machine-parseable text (Mermaid `erDiagram`, no runtime
deps to parse), so it enables a **new deterministic, capability-gated gate** — meeseeks' favourite
kind of check. The schema stops being inferred and becomes *checked against*.

**Design, with the tensions resolved (a half-specified version rots):**
- **Input:** an optional ERD file (Mermaid `erDiagram`) alongside the PRD — a convention
  (`ERD.md` beside `PRD.md`) or a config key (`erd`). Parsed with a small in-repo parser, no
  dependency.
- **The ERD refines the PRD, never competes with it.** The PRD stays source-of-truth for
  *behaviour*; the ERD constrains *schema shape*. Preflight consistency: a contradiction between
  them **refuses the run** (you do not build against an inconsistent spec), and the ERD may not
  introduce an entity the PRD never mentions (inventing requirements is the oracle's named defect).
- **A new gate, `schema-conformance`, capability-gated** — applies only when an ERD is supplied
  AND the target has a persistence capability (as `e2e` applies only to web-ui). After the build's
  migrations/seed run, **introspect the LIVE schema** (SQLite `PRAGMA table_info`/`foreign_key_list`,
  Prisma introspect, etc. — a per-toolchain concern like reporters) and assert every ERD-declared
  entity, key and relationship EXISTS. **Superset match:** extra columns (a sensible `createdAt`)
  pass; omission or contradiction fails. **Fail-closed:** a schema that cannot be introspected —
  no DB, migration failed, introspection errored — FAILS the gate, never defaults to pass.
- **The builder gets the ERD in its brief**, so it builds to the declared schema rather than
  guessing; the design auditor can use the ERD as structural ground truth.

**Why post-DoD:** it changes what meeseeks *accepts* and adds a gate — a Phase-6-class expansion of
inputs/job-types, not a fix. It would materially strengthen the data-backed-app class (the capstone
is exactly that), but the capstone must run on the *current* machine to prove the DoD, so this does
not gate it. Prioritise it for the *next* data-backed target after the DoD.

**Done when:** an ERD parses to entities/keys/relationships; a preflight refuses an ERD that
contradicts or over-reaches the PRD; the `schema-conformance` gate passes on a superset-matching
live schema, fails on an omission/contradiction, and fails closed on an un-introspectable one, each
with a test and a benign neighbour; the builder brief carries the ERD; one live data-backed run
exercises it end to end.

### 48. Accept a `DOD.md` alongside the PRD and ERD — the admission mechanism, and a reusable additive done-bar — OPEN (Phase-6 class, post-DoD)

**Promoted 15 Aug (operator).** This began as "extra criteria an operator may add." It is more than that:
**a job with a DoD is a meeseeks job, because the DoD is the check** (item 49's filter). `DOD.md` is
therefore the mechanism that admits a job at all, not a garnish on one already admitted — which makes its
*author* as load-bearing as the PRD author, and it inherits that author's hostility: **a criterion naming
no falsifiable observation, or naming one that cannot be observed here, is refused at authoring time
rather than accepted and handed to a builder who cannot satisfy it.** A `DOD.md` that launders vagueness
into a checklist is worse than none, because it looks like rigour while failing nothing. The tier table
and both conditions live in item 49; this item owns enforcing them at authoring.

**Origin:** operator, 15 Aug 2026 — the third core input, sitting beside the PRD (what to build) and
the ERD (item 47, what the data looks like): **`DOD.md`, what "done" means.** Today the done bar lives
*inside* the PRD as `DoD-N` requirement lines; factoring it into its own file makes an enterprise
done-bar (builds-and-runs, auth integrity, a11y, perf budgets, coverage floors, security posture)
authorable once and reused across targets, and loaded into a run with the PRD and diagram MD.

**Design, with the tensions resolved:**
- **Input:** an optional `DOD.md` beside `PRD.md` (convention) or a config key (`dod`), parsed with a
  small in-repo parser (no dependency) into a list of done-criteria, each ideally id'd (`DoD-N`) so it
  slots straight into the existing panel requirement contract.
- **Additive-only — the load-bearing invariant, the same law as R30 and "nothing defaults to pass."**
  `DOD.md` criteria are **added** to the done bar; they can make a ship *harder*, never easier. A
  `DOD.md` may not suppress a finding, relax a gate, waive a security pin, or soften
  quarantine-is-not-a-pass. It rides in the **reviewer/panel** contract as gating requirements the cold
  panel must clear — never as a builder instruction the builder could self-certify (the builder cannot
  judge its own work). Byte/count-capped like the R30 envelope so a large file cannot flood the panel
  prompt. **This is what stops it becoming a lever a hostile or lazy target pulls toward looser.**
- **It refines the PRD, never competes with it** (same rule as the ERD). Preflight consistency: a
  `DOD.md` criterion that contradicts the PRD refuses the run; every criterion must be **owned by an
  active panel member** (the existing `no reviewer owns X` refusal, `driver.mjs`), because a done-criterion
  nobody reviews is a hole. Once cold-passed, a `DOD.md` criterion is a monotonic pin like any other
  cold-passed requirement (§4.3) — it cannot silently regress.
- **The builder gets `DOD.md` in its brief** so it builds toward the bar rather than guessing at it —
  but the *verdict* stays with the cold panel, in a separate process, exactly as for `DoD-N` today.
- **Fail-closed:** an unparseable `DOD.md` refuses the run. A done-bar that cannot be read is not a
  done-bar (the `--deadline`/gate-skip shape); it never defaults to "no extra criteria."

**Why post-DoD:** like item 47 it changes what meeseeks *accepts* — a Phase-6-class expansion of inputs,
not a fix — and it must not move the "done" line for building meeseeks itself. Pairs naturally with 47:
PRD + ERD + DOD.md are the three legs an enterprise target stands on.

**Done when:** a `DOD.md` parses to owned, id'd criteria; a preflight refuses one that contradicts the
PRD or that no reviewer owns; the criteria enter the panel as gating requirements and pin monotonically
once passed; an additive-only test proves a `DOD.md` can only *add* to the bar (a `DOD.md` that "waives"
a finding does not, and the finding still fails), with a benign neighbour; the builder brief carries it;
an unparseable `DOD.md` refuses the run; **and the authoring-time refusal is tested both ways — an
unfalsifiable criterion ("feels premium") and an unobservable-here one ("80% of 50 users recognise it")
are each refused by name at authoring, while a deterministic criterion and a panel-judgeable one both
pass** (the benign neighbours that prove the refusal is a filter and not a wall).

### 49. Artifact job-types: checks-as-tests, so the spine drives a book or a report — OPEN (Phase-6 class, post-DoD)

**Origin:** operator, 15 Aug 2026 — *"tasks like 'write me a book about…' or 'research this and make a
report…'"*. This is the **generalization** of which item 34 (verified research mode) is the first
instance: 34 is one job-type, 49 is the substrate that makes any artifact job-type possible. Pairs with
48 (`DOD.md` carries an artifact's done-bar) and 47 (a diagram as a second structured input).

**The unlock, and the reason this is smaller than it sounds: the spine never touches source code.** The
ratchet parses **reporter JSON** into ids and holds those ids monotonic — it has no concept of a "test",
only of ids that passed. A gate is any command with an exit code. The cold panel judges `PRD-N.M`
requirements against evidence. **So an artifact whose deterministic checks emit reporter JSON drives the
existing machine unchanged** — ratchet, hard reset, pins, panel, nothing-defaults-to-pass, all of it. The
work is entirely at the toolchain layer; **no spine change, and a change that needs one is wrong.**

**Design, with the tensions resolved:**
- **Checks are a real test suite over the artifact.** "Chapter 3 exists and is ≥2000 words", "every
  citation resolves to text that appears in the cited source", "every bolded term is in the glossary",
  and "the manifest does not assign conflicting normalized values to one claim id" — these are
  **test ids**. Written as an ordinary node test file over `manuscript/`, they emit JSON
  `extractTestIds` already parses: **zero parser work**, and the ratchet then guarantees a chapter
  that once passed may never silently regress. Semantic contradiction across differently worded
  claims remains a cold-review question; a model assertion must not masquerade as deterministic
  evidence.
- **A prose/artifact toolchain** (`scripts/toolchains/prose.mjs`) on the existing fixed contract (detect,
  map operations, name a reporter — the shape dotnet proved). **Dependency to resolve first:** detection
  here is weak (a manuscript directory is not a `package.json`), so this likely needs the
  **architect-declared toolchain** path, which `toolchains/index.mjs` notes is *not built*. Build that or
  gate 49 behind an explicit config key; do not sniff.
- **Prose gates**, flagship first: a **citation resolver** (the quoted text actually appears in the cited
  source — deterministic, and exactly the "reporter emits pass/fail evidence" shape 34 names), plus
  link-check, style (vale), word-count floors, and machine-readable claim-consistency checks. For
  material citations, a Driver-owned prose-toolchain acquisition step binds canonical source
  identity, retrieval time, content digest, locator, and retained review context; a later live
  refetch may check continued availability but cannot silently replace the version the report used.
  The initial profile fetches public HTTPS only, validates every redirect and connection target as
  public, rejects local/private/link-local addresses, sends no ambient credentials, reuses F4's
  absolute deadline/body cap, and captures inert text rather than executing active content. Evidence
  that policy forbids retaining or independently reacquiring is `unverifiable`, and credentials
  never enter the artifact.
  Captured source text and metadata remain untrusted evidence under items **77** and **85**, never
  prompt authority. The acceptance receipt binds the source-package digest, and carry must include
  that identity. The code operations (`build`, `types`, `e2e`, `security-audit`) must **decline
  honestly and visibly**
  (§3.8): a gate list that silently shrinks reads as a job that never needed them.
- **The held-out oracle remains deterministic** (34's core): a fact fixture is sealed **before** the
  content, never shown to the writer, and must name an executable observation with an exact expected
  result. Semantic support that cannot be reduced to that form remains cold Panel judgment or
  `unverifiable`; the writing role cannot author, see, revise, or grade the fixture.
- **The honest boundary, stated in the product, not just here.** For code, "does it pass" is objective.
  For prose, *structure and traceability* are objective (citation locations resolve, sections exist,
  and normalized manifest values are internally consistent) while source support, factual truth, and
  quality require independent judgment. The guarantee therefore weakens from **provably correct** to
  **provably structurally sound and traceable, plus cold factuality and quality judgments** — still far
  better than an unverified writing agent, but not the same claim, and a run must never dress the second
  as the first.

**The filter — and it gates the CRITERION, never the job type.** A first draft of this item gated by job
type ("a report qualifies, a logo does not") and the operator refuted it on 15 Aug: **a job with a DoD is
a meeseeks job, because the DoD is the check.** "Make me a logo" is unfalsifiable; *"SVG, ≤4 colors,
legible at 16px and 512px, no gradients, AA contrast on light and dark, <20KB"* is six deterministic
checks. The job type never decided anything — the criteria did. Job-type gating is both too coarse (it
refuses work that a DoD makes checkable) and too generous (it admits a "report" whose criteria are all
vapour).

The correct filter is **already in `templates/prd-author.md`**, and this only points it at the DoD:

> *"A requirement is testable when a reader can say what observation would prove it false."*
> *"Anything a determined auditor cannot check is decoration."*

So: **every DoD criterion must name an observation that would prove it false, and that observation must be
makeable here.** Two conditions, and the second is where *"anything doable in the CLI"* actually bites.

| Tier | Example | Decided by | Standing |
|---|---|---|---|
| Deterministic | `<20KB`, AA contrast, citation resolves | a script → gate / ratcheted id | strongest |
| Panel-judgeable | "the mark reads as one silhouette at 16px" | cold panel, on evidence | real — how code requirements already work |
| Unfalsifiable | "feels premium" | nobody | **refused at authoring time** |

*"80% of 50 users recognise it"* is perfectly falsifiable and **unexecutable here** — refused by the second
condition, not the first. Both conditions, or no run.

**The refusal moves with the filter, and this is the half that pays.** It stops being *"we do not do
logos"* and becomes *"criterion 4 states no falsifiable observation; rewrite it or the run is refused"* —
per-line, actionable, and raised at **authoring time** rather than discovered eight iterations and 40M
tokens later, which is this project's most expensive defect class (the ungrounded requirement).

**Done when:** an artifact toolchain detects (or is declared) and maps its operations; the code gates it
cannot run decline visibly; a checks-as-tests suite over a real artifact feeds the ratchet through the
existing reporter path with no parser change; the citation resolver passes on a resolving quote, fails on
a misquote, and **fails closed** on a required source it cannot fetch; a machine-readable contradiction
fixture fails while differently worded semantic claims remain assigned to cold review; no deterministic
gate claims that resolution proves support or truth; mutable-source, redirect-to-private,
address-policy-change, oversized/slow-body, active-content, and non-retainable-source fixtures
preserve provenance or refuse closed without secrets; receipt and carry fixtures stale
when the bound source package changes; a job whose check cannot be stated is refused with that reason;
and one live artifact run ships end to end.

### 50. The blocked-question artifact — a question as OUTPUT, never as interrupt — OPEN (Phase-6 class, post-DoD)

**Origin:** operator, 15 Aug 2026 — *"what about meeseeks surfacing a question when unable to proceed? A
meeseeks would do that."* Canon-accurate, and it names a real gap. Half of it is already answered and the
answer stands: `scripts/assumptions.mjs` (§8.3) records that asking for clarification is **incompatible
with an unattended loop** — *"there is nobody to ask, and a builder that stalls waiting for an answer
burns the stall limit"* — so a builder may not silently pick an interpretation; it **records a cited
assumption** and the cold panel checks it. That covers *"I was unsure, so I chose and said so."*

**The gap it does not cover: "I cannot choose at all."** That ends today as `STALLED` — *"6 iterations
with no gate improvement"* — a **diagnosis, not a question**. The genuinely useful sentence the run knows
and currently discards is: *"PRD-3.2 requires sending email; no provider credential exists here and I may
not invent one. (a) stub transport, (b) credential in config, or (c) drop the requirement?"*

**Design, with the tensions resolved:**
- **It never blocks. Ever.** Unattended operation is the product; a run waiting on a human at three in the
  morning is strictly worse than `STALLED`, which at least terminates and reports. **A question is an
  output of a terminal state, never a pause inside one.**
- **On any non-`SHIPPED` ending, emit a structured question artifact** (driver-owned, under `.meeseeks/`,
  and in the final report): the blocking fact, what was already tried, and the specific decision needed —
  enumerated options wherever they exist, because an option list is answerable and a paragraph is not.
- **The operator answers by editing `PRD.md` / `DOD.md` / config and re-running** — the existing resume
  path, and the better one: **an answer typed at a prompt evaporates; an answer written into the spec is
  durable, versioned, and reusable.** The question improves the *specification*, not merely this run.
- **The builder never gets an "ask" verb — only the driver, at a terminal state, may emit a question.** If
  a builder can end an iteration by asking, it will: models offload difficulty (case J — builders decline
  hard things whenever a decline is available). This also keeps "the builder cannot judge its own work"
  and §6.1's driver-owned boundary intact.
- **A question citing nothing is discarded**, exactly as `validateLesson` and the assumptions citation bar
  already require. It must name the PRD id, gate, or finding that blocks it, or it is confident vapour
  reaching the operator at the moment they are least able to check it.
- **Push questions earlier, not into the loop.** The right moment to ask is *authoring*, with a human
  present — which is what items 48/49 became (an unfalsifiable or unobservable criterion refused **by
  name** at authoring), and `--confirm-prd` is already that boundary. **A question arriving from inside
  the loop means one escaped the authoring gate**, so each one is also evidence about the authors.

**Done when:** a non-`SHIPPED` ending emits a question artifact naming the blocking fact, what was tried,
and an answerable decision; an uncited question is discarded and the discard is counted and reported (never
dropped quietly); a test proves **no code path lets a builder emit a question or block on one**; the
artifact is driver-owned and refused to a process inside the run by the positional guard; and a `SHIPPED`
run emits none (the benign neighbour — a machine that always has a question has stopped meaning anything by it).

### 51. `CONSTITUTION.md` — the invariants, extracted, numbered and enforced — OPEN (Phase-6 class, post-DoD)

**Origin:** operator, 15 Aug 2026 — *"should we have a constitution.md"*. **One already exists**: the
`CLAUDE.md` section *"Invariants — do not violate these"*, 13 bullets, carrying the constitutional test
in its own words — *"a change that breaks one is wrong even if tests pass."* Audit on the day: `DESIGN.md`
has **no** invariants section (no duplication there), and of the runtime templates **only
`builder-system.md`** echoes any invariant language. So the law lives in three places — contributor prose,
enforcement in code, one partial template echo — and **there is no single citable source.**

**This item is a refactor with a gate, not a new document, and the distinction decides whether it is worth
doing at all.** The argument against is written in this repo's own scars: the `HANDOFF.md` header went
stale by **fourteen** versions, then by three more *directly beneath the warning about it*, and the fix
was not discipline but a **gate** (`release-check`). A fourth ungated ledger is rot with a better name. If
this ships as "prose moved to a new file", it is churn — **do not build it.**

**The three conditions that make it earn its keep — all three, or none:**
1. **Single source.** It *replaces* `CLAUDE.md`'s invariants section, which becomes a pointer — the
   established "`DESIGN.md` wins, fix this file" pattern. Three copies of a law is worse than one, because
   the divergent copy is indistinguishable from the true one.
2. **Numbered and citable — `CONST-1`…`CONST-13`.** This is the value, and it is `PRD-N.M`'s insight
   reapplied: **numbering is load-bearing because it makes a thing checkable.** Today an invariant cannot
   be cited in a commit, a review, or a plan item — items 48, 49 and 50 each lean on *"nothing defaults to
   pass"* and *"the builder cannot judge its own work"* by **paraphrase**, where a citation belonged.
3. **Enforced, or it is decoration** (`prd-author.md`'s own word for what an auditor cannot check). A test
   asserts every `CONST-N` names at least one enforcing test or code site. **An invariant with no
   enforcement is a wish** — and this test is a real net, not ceremony: it is the shape of check that would
   have caught the guard-registration hole, where the guard's *logic* was tested and green for eleven
   versions while nothing asserted its *invocation*.

**What it completes: three layers of law**, which is the structure items 47–50 have been circling.
`CONSTITUTION.md` = true of **every** run, meeseeks-owned, **never** overridable · `DOD.md` (item 48) =
this job's done-bar, operator-supplied, **additive only** · `PRD.md` = what to build. And the payoff is a
derivation rather than a decree: **item 48's additive-only rule is not an arbitrary safety choice — it
follows from constitutional supremacy.** A `DOD.md` may only add because it sits *beneath* the
constitution. Writing the law down is what turns that from folklore into something a reader can derive.

**One hazard, named so it is not discovered later:** handing the constitution to runtime children is a
benefit (standing law, stated once, versioned with the plugin) **but the cold reviewer's starvation is
itself constitutional.** A constitution piped into the panel would be the exact backdoor §6.1 refuses. Any
runtime handoff is per-persona and deliberate — the builder may receive it; the reviewer's diet is decided
by `reviewer-system.md` and nothing else.

**Done when:** `CONSTITUTION.md` holds the invariants as `CONST-N`; `CLAUDE.md`'s section is a pointer and
the text exists in exactly one place; a test asserts every `CONST-N` names an enforcing test or code site
and **fails on an unenforced one**; a staleness gate refuses a constitution that disagrees with its
enforcement set (the `release-check` lesson — a discipline that keeps failing becomes a gate); and no
reviewer prompt gains constitutional text as a side effect.

## Current follow-ons and research-gated experiments

This heading ends Phase 6. Items 52, 53, 56, 57, and 77–85 are pre-DoD only in the order stated at
the top of this file; items 54, 55, and 58 are conditional or research-gated; item 59 remains
post-DoD because it depends on Phase-6 item 35. Item 86 is PARKED post-DoD behind its own admission
conditions. Item numbering records chronology, not priority. The top-level build order is
authoritative when physical placement and execution order differ.

### 52. Denial dampening (R25c), done without giving the guard a write primitive — OPEN (was part of item 37, cut on review)

**Origin:** R25c, built into item 37's first cut and **removed before landing** when the item-37 hostile
panel (three lenses, 15 Aug) found two real defects in it. Recorded here so the good idea is not lost and
the two traps are not walked into again.

**The idea (still good):** ecc's measured repetition-loop fix — a builder that has read the same
three-sentence denial forty times is having its context spent on nothing (§3.9). Full explanation for the
first ~3 denials, then a one-liner.

**Why the first cut was pulled — both findings are the design telling you where the wall is:**
- **A write primitive on the guard's hot path is not worth verbosity.** Counting denials across separate
  hook processes needs shared state on disk. The first cut wrote a counter in `os.tmpdir()` at a
  predictable name with plain `writeFileSync`. The guard is **not itself guarded**, so a builder (or any
  local user) who plants a symlink at that path turns the guard's own write into an arbitrary-file
  overwrite — including, at worst, the guard file itself. Handing the one component that survives
  `--dangerously-skip-permissions` a filesystem-write side effect, to save some tokens, is a bad trade.
- **Dampening must be keyed per (session, rule), never per session.** Per-session, denials 1–3 on rule A
  followed by the first-ever denial on rule B renders B as "denied again" though B was never explained —
  recreating the exact repetition loop it exists to fix, for a rule the builder was never told about.

**The design for when it returns:**
- **State the builder cannot reach.** Not `os.tmpdir()`. Either a per-run directory the *driver* creates
  `mode 0700` and hands the guard by env (the guard writes only there, and only inside a run — dampening
  is a builder concern, so out-of-run operator denials are never counted), or open with `O_NOFOLLOW` and
  refuse a non-regular target. Fail-verbose on every uncertainty, as the first cut already did.
- **Key by `(session_id, rule)`**, so the first ~3 denials *of each rule* are verbose.
- **Verbosity only, never the decision** — a dampened denial is still a deny, still carries the provenance
  prefix and the `[meeseeks:rule]` tag (the parts item 37 kept).

**Done when:** the counter lives where a run process provably cannot redirect it (a test plants a symlink at
the counter path and shows the guard refuses to follow it); dampening is per-rule (a test denies rule A
three times then rule B once and sees B rendered in full); an operator denial outside a run is never
dampened; and any counter failure renders full text.

### 53. Styled milestone lines: gate summary, panel convening, carry/outstanding — OPEN (micro-item, cosmetic, quota-funded)

**Origin:** operator question, 16 Aug — should the heartbeat or milestones speak Meeseeks? **Answer
settled: milestones only, never the heartbeat, never the children.** The heartbeat is the anxious-operator
scan channel and repetition kills both signal and joke (§9: a line carrying no information is noise);
child output feeds parsers and archives, so style stays at the driver's render (style-never-touches-logic).
The gap: three real milestones currently print plain. Extend `render()` with three `StyleEvent` kinds,
each carrying its full payload: **gate-failure summary** ("OOOH. TWO GATES ARE NOT HAPPY: unit,
observability." — details stay verbatim beneath, always), **panel convening** ("ALL GATES GREEN! THE
JUDGES ARE COMING. I DIDN'T PICK THEM. I CAN'T TALK TO THEM." — the cold-panel invariant as canon), and
**carry/outstanding** ("FOUR THINGS I ALREADY PROVED STAY PROVED." / "ONE FINDING STILL SAYS NO:
DoD-5-design."). Plain-mode bypass + mapping-tightness tests per event, the existing pattern. One
evening, on quota — `CLAUDE.md`'s warning stands: the style layer is the thing most likely to eat time
that belongs to the ratchet.

### 54. Role-internal Claude Code dynamic workflow experiment — BLOCKED (research-gated)

**Problem solved:** bounded fan-out and synthesis may improve difficult implementation work, but
only if they do not transfer durable authority to an ephemeral agent organization. This item tests
that proposition; it does not replace `driver.mjs`, the ratchet, the panel, or the oracle.

**Blocked by:** completion of PLAN Gate 0, item **77**'s durable prompt-supply boundary, and a
recorded item **84** containment outcome. Gate 0 includes the atomic owner, hard cross-platform
process settlement, child-environment boundary, exact role tools/CLI floor, and candidate-independent
review authority that fan-out would otherwise amplify. Item 84 need not adopt a stronger profile—a
measured rejection is an outcome—but the workflow probe must know and state the containment guarantee
it actually has.

**Architecture boundary:** `DESIGN.md` §15 and
`docs/DYNAMIC-WORKFLOWS-AND-PROVENANCE.md`. Builder may invoke a bounded workflow as an internal
implementation harness. Driver never becomes a workflow. Panel members are separately instantiated
and cold; they never join Builder's workflow or inherit its transcript. Oracle material remains
held out. A workflow result is only a proposed artifact and cannot update `.meeseeks/`, the ratchet,
pins, findings, or terminal state. Invocation is **root-only within the durable role**: workflow
children cannot invoke another Meeseeks workflow or recursively acquire durable authority. The
Driver imposes its own aggregate descendant-call/fan-out ceiling rather than trusting a platform
default, and cancellation must settle every descendant before the role returns.

**Experiment shape:** use the disposable recipe in `DOGFOOD.md` against a pinned Claude Code
version. The initial workflow is Builder-internal only: cold Panel and Oracle keep their ordinary
non-workflow paths because `--safe-mode` currently disables workflow loading. Start from an explicit
commit boundary, record every created worktree, pass guard settings and run markers to every
descendant, impose phase and aggregate budgets, and retain the existing `childBudget()`-derived
`--max-budget-usd` whenever `costCeiling` is armed. Current CLI documentation says subagent spend
counts toward that cap and, on supported releases, reaching it blocks another subagent spawn and
stops remaining background subagents. Prove that workflow agents take the same path through the
pinned production invocation. Treat the native cap as an approximate per-role dollar stop, not a
token, fan-out, crash-accounting, or run-wide authority. Also pin
`CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS` to a nonzero value no larger than the role deadline. That CLI
timer begins after the final turn and is defense in depth; the Driver's whole-role watchdog still
owns the absolute deadline. Persist a driver-owned receipt containing durable role and parent lineage,
item 77's prompt-supply manifest, settings/tool/permission digest, model and effort, whole-tree
`modelUsage` plus estimated spend,
tree/worktree identity, result, and termination. Top-level `usage` is not descendant accounting.
Record the minimum durable context needed to reproduce the boundary — never hidden
reasoning or an enormous telemetry graph of ephemeral agents. Kill and restart are first-class
cases, not cleanup details. Do not depend on preview behavior that cannot be detected and refused
when absent.

**Done when:** all four DOGFOOD cases pass in a paid live run; receipts prove the Builder workflow
remains separate from ordinary cold Panel and Oracle contexts; a child cannot recurse and an exceeded
aggregate cap refuses closed; a forced native dollar-cap case accounts for every completed agent,
prevents a later spawn, settles remaining background agents, and returns a failed bounded assignment;
descendant settings and the observed post-turn wait ceiling are evidenced rather than inferred; a
workflow terminated by any ceiling leaves no process or worktree ambiguity; workflow success cannot
advance global state; an independently cold panel
reviews the result; and the measured outcome gives a credible improvement in accepted work or cost
without a new false-completion path. A failed or inconclusive probe rejects adoption without
affecting the existing Claude-native path.

### 55. Exact evidence provenance before any explicit graph — PARKED (conditional)

**Problem it would solve:** after an assumption, requirement, or implementation artifact changes,
the current tree can identify many stale pins by fingerprint but cannot always answer a complete
machine-readable chain of *why* a requirement is satisfied or calculate the smallest affected set.
No implementation is justified until a real run demonstrates that this gap causes waste, stale
evidence, or an unsafe completion decision.

**Smallest candidate:** add stable claim ids and exact subject/evidence/dependency metadata to the
existing driver-owned artifacts: requirement id, artifact path plus digest, gate/test or reviewer
provenance, upstream assumption/decision ids, observed tree identity, and — if item 54 proceeds —
the exact role-workflow receipt that produced the candidate artifact. Stable run/child ids and
receipt digests are evidence references, not permission for one role to inherit another role's
context. Maintain reverse edges so a changed input marks only descendant claims stale. Staleness
never deletes ratcheted test ids or silently relaxes a monotonic pin; it blocks `SHIPPED` until the
existing gate or cold reviewer re-establishes the claim. Reject dependency cycles and missing
identities fail closed. Store this as deterministic JSON under `.meeseeks/`; no graph database,
orchestration framework, or ephemeral agent telemetry graph.

**Admission test:** first trace one requirement end to end using existing run artifacts and attempt
targeted invalidation offline. Proceed only if the prototype can (a) explain why the requirement is
satisfied, (b) invalidate all and only descendants after an assumption or artifact change, (c)
preserve unrelated verified progress, (d) survive restart, and (e) make terminal-state checking
more deterministic. Otherwise keep the current ratchet/pin/fingerprint model.

**Done when:** either the admission test rejects the feature with recorded evidence, or the minimal
metadata ships with cycle rejection, targeted-invalidation tests, provenance queries, crash/reload
coverage, guard ownership, and a terminal check proving no stale required claim can ship. A general
graph does not follow automatically from passing this item.

### 56. Child environment trust boundary — OPEN (live-contract first)

**Problem solved:** `childEnvironment()` currently copies the operator's complete environment into
each `claude -p` child. That preserves tool discovery, but it also gives an unattended Builder ambient
credentials, unrelated secrets, and Claude control variables it was never deliberately supplied.
Those variables can silently change retry/resume behavior, workflow availability, model routing,
permission posture, or budget timing. Eve's trusted-runtime/sandbox split is a useful security
invariant here; Eve or Vercel Sandbox is **not** the proposed dependency.

**Research sources:** [Eve's security model](https://eve.dev/docs/concepts/security-model) and
Claude Code's official [environment-variable](https://code.claude.com/docs/en/env-vars) and
[sandbox credential](https://code.claude.com/docs/en/sandboxing#protect-credentials) controls,
checked 17 August 2026. The local risk is established independently by `scripts/driver.mjs` and
its tests.

**Slice A — measure before designing:** run one paid tier-3 probe using synthetic secret values only
and record exactly what a Builder-launched shell can observe. Establish the minimum environment the
installed Claude CLI and target tools actually require: executable search path, home/temp, locale,
Claude authentication, Meeseeks run/depth markers, role-derived Claude controls, and platform
necessities. Treat ambient `CLAUDE_CODE_*` values as control-plane inputs, not harmless process
metadata: seed synthetic values for retry watchdog, interrupted-turn resume, safe mode/workflow
disablement, subagent model override, and print-background wait, then prove that only the Driver's
explicit per-role values cross. Separately measure `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`: current
documentation says the parent Claude process keeps
Anthropic/cloud credentials while Bash, hook, and stdio-MCP subprocesses lose them, and on Linux the
Bash path also enters a PID namespace that cannot see or signal host processes. This is an external
binary contract; an argv or unit test cannot establish it, and F2/F11 process supervision must not be
weakened as a side effect.

**Slice B — enforce the measured boundary:** construct a minimal operational child environment plus
an explicit Driver-owned per-role control set plus an operator-configured allowlist of additional
variable **names** for target tools. Do not allow that operator list to override Driver-owned Claude
controls. Never persist, print, or place values in receipts. Refuse closed — or emit a preflight
refusal naming only variable names —
when the required boundary cannot be applied or a high-risk ambient credential would otherwise cross
it. Preserve ordinary tool discovery and every existing guard/depth marker. The native subprocess
scrub may be defense in depth only after a pinned canary proves its exact provider coverage and
process-lifecycle side effects; it does not remove arbitrary variables from the parent Claude process.
If a target tool genuinely requires a secret, item **84** may test Claude's named sandbox credential
`deny` or `mask` controls rather than inventing a broker, but only within their measured
Bash/proxy/platform scope.

**Done when:** unit tests prove synthetic secrets are absent, required benign neighbours survive,
ambient Claude control variables cannot alter the sealed role contract, and no value appears in
diagnostics or driver-owned artifacts; a paid tier-3 test proves the same
boundary through a real Claude child and its Bash, hook, and stdio-MCP subprocess surfaces;
authentication and normal target tool discovery still work; enabling native scrub neither hides a
required descendant from F2/F11 settlement nor broadens its documented provider-only coverage; and
the change introduces neither Eve nor another runtime dependency.

### 57. Machine-readable morning-acceptance evals — OPEN (extends item 20)

**Problem solved:** `DOGFOOD.md` records useful scenarios and prose outcomes, but the repository
cannot yet compare runs mechanically on the product metric: whether an unattended result is actually
acceptable in the morning, not whether an agent reported success. Adopt the useful part of
[Eve's eval model](https://eve.dev/docs/evals/overview) — deterministic gates are hard, model
judgments are soft — in the existing Node/live harness.

Define stable scenario ids and emit one driver-owned JSON result per run containing run id, commit,
plugin version, scenario, terminal state, iterations, token/cost totals, deterministic gate results,
panel outcome, post-run black-box checks, operator repairs required, and an explicitly sourced
`morningAccepted` value (deterministic when the scenario defines it; otherwise human-labelled).
Also bind an execution-resource profile: OS/architecture, available or enforced CPU and memory,
concurrency, phase timeouts, and relevant external tool versions. Compare candidates only on matched
profiles and enforcement semantics; classify infrastructure failures separately rather than charging
them to model capability or quietly dropping them. Cold model judgments may be recorded as advisory
scores but cannot turn a deterministic failure into success, advance the ratchet, or declare
`SHIPPED`. No Braintrust, Eve, or hosted eval dependency.

Treat stochastic reliability as a first-class result, not as noise hidden by a best run. Give every
attempt a stable trial index and identical harness/config identity, retain raw successes and trial
count, and report the empirical per-trial success rate (the direct estimate for one unattended run),
the first trial's outcome, and both any-success and all-success over the declared cohort. `pass@k`
describes search only when the product genuinely offers `k` attempts; `pass^k` is a stricter
all-trials consistency stress, not the success probability of one morning run. Morning acceptance is
governed primarily by per-trial success plus the non-compensable failure classes below; report
`pass^k` alongside it when repeated reliability is a product requirement. Publish the estimator and
sample size rather than false precision, and never let a best-of-N success erase a failed required
trial.

Stratify the corpus by task horizon. Each scenario records a reference-solution human-effort band or
another independently defined difficulty band; agent wall-clock time is not a proxy for task length.
Report acceptance separately for short fixtures and substantial multi-phase work, and do not claim
overnight reliability from a suite containing only cheap synthetic cases. This borrows the useful
measurement invariant from METR's task-completion time horizons without importing its benchmark or
predictive model.

Do not collapse operational reliability into `morningAccepted` alone. Record a bounded failure class:
accepted, safe refusal/incomplete, incorrect `SHIPPED` (false completion), scope/security violation,
destructive outcome, or harness/infrastructure failure; also record whether a declared transient fault
was recovered within budget. False completion, scope/security violation, and destructive outcome are
non-compensable selection failures—no mean score, cost saving, or lucky rerun can wash them out. For a
cheap fixture cohort, pair nominal tasks with semantically equivalent requirement wording and
deterministic injected child timeout, malformed envelope, or tool failure. Report outcome consistency,
perturbation robustness, recovery, failure severity, and resource variance separately. Model
self-confidence remains advisory and is not a completion signal.

Evaluate the evaluators as a separate component. Maintain versioned candidate snapshots containing
independently labelled seeded defects plus clean benign neighbours, run each Panel role cold against
them, and record per-role high-severity miss rate, false-positive rate, and disagreement with exact
reviewer prompt/model/tool-policy identity. Labels come from deterministic checks where possible and
otherwise from an operator-owned expert rubric; they never come from Builder or the reviewer being
scored. Keep calibration discovery/selection/final partitions separate, and never place calibration
answers in a production role's prompt or target tree. Calibration measures whether a reviewer
configuration is safe to adopt; it does not give the eval harness terminal authority over a live run.

The scenario corpus may declare **discovery**, **selection**, and untouched **final-test** partitions.
Candidate comparison uses selection only: aggregate quality must strictly improve, ties reject, and
every required deterministic scenario must preserve or improve. Missing or non-finite results refuse.
The final-test partition is opened only for reporting after selection, never for choosing the candidate.

**Done when:** item 20 cases A/B emit schema-validated, directly comparable results; a seeded
black-box regression fails the hard result even when a judge likes the output; judge disagreement is
visible but non-authoritative; and the harness can summarize acceptance, cost, time, and repair count
across repeated runs without scraping prose logs. A cheap deterministic cohort also proves that a
one-of-three success is visibly unreliable rather than promoted as a win; baseline and candidate use
the same declared trial count; and at least one substantial multi-phase scenario is reported
separately before the project makes a measured morning-acceptance claim. A seeded false `SHIPPED`,
scope/security violation, or destructive result cannot be averaged into acceptance; a safe refusal is
reported separately; one requirement-paraphrase pair and one deterministic transient-fault case expose
robustness and recovery without relying on a model's confidence report. A paid cold calibration case
also proves each relevant Panel role sees a seeded high-severity defect and does not invent the same
finding in its clean neighbour; a reviewer prompt/model change cannot be selected by hiding misses,
false positives, or disagreement behind aggregate morning acceptance. A deliberately changed CPU,
memory, concurrency, timeout, or tool profile refuses direct comparison, while a synthetic
infrastructure outage remains visible as missing evidence rather than a model-quality regression.

### 58. Forensic lifecycle event journal before resumability — PARKED (conditional)

**Problem it would solve:** `run.json`, briefs, archived runs, and `outcome.json` preserve important
snapshots, but a crash can still leave no deterministic history of which major phase, child, gate, or
panel attempt had started or settled. Borrow Eve's
[durability](https://eve.dev/docs/concepts/execution-model-and-durability) and
[stable event-id](https://eve.dev/docs/concepts/sessions-runs-and-streaming) ideas only if a
killed-run experiment demonstrates that this missing history prevents diagnosis or safe recovery.

**Smallest candidate:** after F1/F2 close, append a driver-owned `.meeseeks/events.ndjson` containing
major lifecycle transitions only: run, phase, iteration, child, gate, panel, and terminal events. Each
event has a stable run-scoped sequence id, timestamp, attempt/parent lineage, and tree identity. Archive
it with the run. Initially the driver **never reads it to decide anything**; it records no model deltas,
hidden reasoning, tool chatter, or ephemeral-agent telemetry. Reconnect/replay deduplicates by id.

Any later cold-load path must rebuild derived state under current invariant checks and verify an exact
compatibility fence before it resumes: journal schema, Driver/plugin version, target tree, effective
config/policy digest, role prompt/tool-supply contracts, and external CLI identity. A mismatch or
corrupt event refuses resume; it never tries to reinterpret old events under new semantics. This is
the smallest useful lesson from OpenHands' persisted-event reload and agent/tool compatibility check,
not a reason to adopt its event stream or runtime.

**Admission and Done when:** kill a controlled run at named boundaries and try to reconstruct the
settled/unsettled work from current artifacts. Reject the item if they are already sufficient. Proceed
only if the journal reconstructs the run exactly and materially improves the diagnosis. Checkpoint/
resume remains a separate Phase-6 decision: an interrupted operation may be replayed only after its
idempotency and receipt semantics are designed, and this journal never becomes terminal-state authority
by accident. A compatibility-canary reload under a changed schema, plugin, config, tool policy, or tree
must refuse before spawning or replaying any side effect.

### 59. Offline validation-gated prompt and lesson optimization — PARKED (requires 35 and 57)

**Problem solved:** Meeseeks treats `templates/*.md` as product code and records sparse lessons, but
changes to either are still principally hand-authored and validated one at a time. A plausible prompt
or lesson edit can improve the failure that inspired it while quietly weakening unrelated objectives.
SkillOpt demonstrates a useful *development protocol* for this problem; its Python engine, transcript
harvester, and runtime self-evolution are not proposed dependencies.

**Research source:** [SkillOpt](https://github.com/microsoft/SkillOpt) and its
[method and ablations](https://arxiv.org/html/2605.23904v2), checked 16 August 2026. The borrowable
mechanisms are bounded atomic text edits, strict held-out validation, independent support counts,
per-edit application reports, and a rejected-edit buffer. SkillOpt-Sleep's automatic transcript path
is specifically rejected because its own
[data-boundary warning](https://github.com/microsoft/SkillOpt/blob/main/docs/sleep/README.md#how-it-works)
says provider-bound excerpts are not guaranteed secret-free.

**Experiment boundary:** this is an offline, operator-side laboratory using driver-owned structured
run artifacts and item 57's stable scenarios — never raw child transcripts. Freeze the target model,
harness, evaluator, and baseline; let a separate optimizer propose at most one or two exact
append/insert/replace/delete edits to one artifact; then stage the resulting diff for operator/Codex
review. Production Meeseeks never invokes the optimizer, never auto-adopts a candidate, and never lets
Builder, Panel, or Oracle rewrite their own instructions. The first target is
`templates/lesson-extractor.md`, whose output is advisory and already has recorded falsehood cases.
Builder and reviewer prompts require separate adversarial corpora before they may enter the lab.

**Acceptance rule:** discovery evidence may generate candidates; selection evidence alone chooses
among them; the untouched final-test partition reports generalization. Selection must strictly improve
the primary acceptance measure, ties reject, and no required deterministic scenario may regress.
Model-judged scores remain advisory and cannot override a hard failure. Every attempt records artifact
and baseline digests, exact edits, independent-run support, apply/skip status, scenario-level deltas,
cost/latency, and acceptance or rejection reason. Rejected records are promoter-only evidence, not
runtime guidance.

**Done when:** a versioned fixture experiment accepts a seeded general improvement, rejects an
anecdotal or overfitted edit, rejects an aggregate improvement that regresses one required scenario,
and proves the final-test partition was not consulted during selection; the staged candidate can be
reproduced from its receipt and still goes through the ordinary shipped-file version bump and required
live tier before release. A failed or inconclusive experiment closes the item without changing the
production path.

### 60. Resolve reviewer evidence before accepting a pass — OPEN (REVIEW F6)

**Problem solved:** the current Panel contract accepts evidence-shaped text even when the cited file
or line does not exist. That permits a hallucinated or stale citation to participate in `SHIPPED`.

Add one Driver-owned validation boundary between report parsing and Panel combination. A passing
citation must resolve against the exact candidate repository to a readable regular file and a
positive, in-range, non-empty line. Reject absolute paths, traversal, directories, and symlink
escapes. Invalid evidence changes the entry to failure before it can be counted, pinned, carried, or
stored. Content/blob identity remains the durable pin; the line number is only a locator.

**Done when:** every hostile location in REVIEW F6's acceptance evidence fails beside a valid POSIX
and Windows-shaped neighbour; an integration case proves fake evidence cannot reach the ship effect;
and any parser/template contract change receives the required paid live check. This may batch with
item 40, but F6 closure remains independently reviewer-owned.

### 61. Conjoin Claude process and envelope success — OPEN (REVIEW F7)

**Problem solved:** `spawnClaude` can reinterpret a failed process as a successful role result when
failed stdout contains a success-shaped Claude envelope.

Preserve distinct timeout, output-overflow, signal/nonzero-process, and envelope-error outcomes.
`ClaudeResult.ok` requires both a successful shell result and a valid non-error envelope. Failed
stdout may contribute bounded diagnostics and usage accounting but never role authority. Share the
termination/failure representation with F2 instead of adding another parallel state machine.

**Done when:** unit and tier-2 cases keep nonzero, signal, timeout, and overflow failures failed even
with a valid success envelope; normal success and `is_error:true` keep their meanings; and the
mandatory paid tier-3 check observes the production `claude -p` contract. REVIEW F7 owns closure.

### 62. Bind the Oracle store to one run and one PRD — OPEN (REVIEW F8)

**Problem solved:** `.meeseeks/oracle.json` currently survives previous-run archival, so a new
objective can reuse held-out cases written for an old PRD.

Give the store explicit current-objective identity. Prefer archiving the prior store and authoring a
fresh one from the current PRD; exact PRD-digest reuse is acceptable only if independently proved and
does not expose cases to implementation roles. Write atomically, fail closed on corruption, include
the store in item 63's machine-state boundary, and preserve PRD-only/no-tools Oracle authoring.

**Done when:** different sequential PRDs cannot share cases; the previous store is archived with its
run; interruption cannot produce accepted partial JSON; and target `git add -A` cannot stage the
store. REVIEW F8 owns closure.

### 63. Make the machine-state Git boundary positional — OPEN (REVIEW F9)

**Problem solved:** a filename enumeration omits current Driver artifacts and makes every future
artifact trackable until somebody remembers to extend the list.

Ignore everything under `.meeseeks/` by position while explicitly carving out the operator-owned
`config.json`, or derive equivalent rules from one authoritative artifact registry if Git platform
semantics require it. Correct the test that calls `capabilities.json` operator-owned. This is a Git
history boundary, separate from the write guard, but the ownership classification must agree.

**Done when:** an integration fixture materializes every current state writer plus an unknown future
artifact, runs `git add -A`, and proves only the deliberate config carve-out may stage across
supported platforms. REVIEW F9 owns closure.

### 64. Record every terminal run outcome atomically — OPEN (REVIEW F10)

**Problem solved:** paid pre-loop and outer-exception aborts can leave no `outcome.json`, and the
existing direct overwrite can destroy the only terminal receipt on interruption.

Define the durable run-start boundary and route every terminal return after it through one shared
atomic writer. Record only known phase, state, spend, and reason; never invent unavailable usage.
Failure to write the receipt is loud but must not rewrite the terminal decision already reached.

**Done when:** PRD, Oracle, component, unexpected post-lock, budget, and ship paths each leave one
correct parseable receipt; interruption leaves a complete old receipt or no accepted receipt, never
truncated JSON; and component fail-closed behavior is unchanged. REVIEW F10 owns closure.

### 65. Prove and enforce Windows descendant cleanup — OPEN (REVIEW F11)

**Problem solved:** Windows timeout cleanup currently terminates the `shell:true` wrapper without
establishing that its application children and grandchildren are gone.

Implement a bounded Windows process-tree termination path shared with F2's lifecycle contract.
Preserve grace then force, guaranteed settlement, and bystander safety; do not weaken the existing
POSIX process-group path.

**Done when:** a Windows tier-2 fixture starts a shell, application, and grandchild and proves all
three disappear within the bound while an unrelated process survives; POSIX cleanup and successful
health probes remain green. A POSIX-only result cannot close REVIEW F11.

### 66. Bind the run to an immutable specification revision — OPEN (REVIEW F12)

**Problem solved:** Builder can change `PRD.md` under stable requirement IDs and have Panel judge
the changed finish line.

Capture canonical specification bytes/digest before Oracle and design work. Every role input,
requirement set, review record, and terminal receipt names that revision. A later working-copy
mutation either refuses as unauthorized drift or ends the run with an operator-facing request to
start a deliberately revised objective; it is never an ordinary Builder edit.

**Done when:** same-ID text mutation cannot reach Panel or `SHIPPED`; an approved new revision
starts new Oracle/review evidence; non-authoritative product documentation remains editable; and
the digest is checked at the role and terminal boundaries in REVIEW F12.

### 67. Prevent silent deterministic-gate roster shrink — OPEN (REVIEW F13)

**Problem solved:** the legacy `frontendOnly` predicate can remove a quality gate when current-tree
markers disappear, bypassing the run's fixed declared capability set.

Replace it with the `web-ui` capability policy and make every roster removal explicit. A
detected-only capability may have a finite cold-reviewed declassification path; it may not vanish
because one detector returned false on a later tree.

**Done when:** declared UI work retains its quality gate through marker deletion, detected-only
removal is visible and independently justified, temporary experiments do not create permanent
unsatisfiable gates, and roster-diff tests cover both directions.

### 68. Seal Panel verdicts to an exact workspace identity — OPEN (REVIEW F14)

**Problem solved:** `git add -A` after Panel can commit bytes that appeared after reviewers read
the tree.

Capture a complete workspace identity after gates, verify it through Panel, and reject any drift
before commit. Prove the resulting clean commit corresponds to that identity before deploy/tag;
record it in review and outcome artifacts. Reuse the existing workspace hashing only if its
tracked/untracked/symlink semantics cover the candidate boundary exactly.

**Done when:** a background writer during every reviewer timing window cannot smuggle tracked,
untracked, deleted, or symlink bytes into the passing commit; races/components still receive fresh
main-tree verification; and the exact reproduction in REVIEW F14 cannot ship.

### 69. Decide and enforce the Oracle confidentiality claim — OPEN (REVIEW F15)

**Problem solved:** Builder can read the exact `oracle.json` cases despite “held-out” language.

First run a paid synthetic canary through a real Builder using `Read`, Bash, and Builder-launched
code. If the existing sandbox can establish a full read boundary without breaking target work,
enforce and live-test it. Otherwise rename the guarantee to “not supplied adversarial cases,” make
the limitation prominent, and do not score Oracle as confidential independent evidence. A hook-only
denial is insufficient when arbitrary code can read the same path.

**Done when:** either every measured read path is denied at the actual execution boundary, or docs,
terminal policy, and eval interpretation consistently state the narrower guarantee. The Oracle
author and Panel remain independently contextualized.

### 70. Make test reports fresh, successful, and attempt-bound — OPEN (REVIEW F16)

**Problem solved:** reused report paths and an ignored verification-gate result let stale passing
bytes confirm a failed scoped restore.

Use unique attempt identity for every expected report (or clear prior artifacts before launch),
require the corresponding gate to succeed, and reject missing, mixed-attempt, non-regular, or
wrong-tree output. Scoped restore verification must check the unit result before reading.

**Done when:** failed/crashed/timed-out/report-less gates cannot reuse prior evidence; mixed unit/e2e
attempts refuse; the stale-report reproduction falls through to the full reset; and report
provenance survives archive/restart inspection.

### 71. Bind current ratchet credit to the current test definition — OPEN (REVIEW F17)

**Problem solved:** path/title identity survives an assertion rewrite, so weakened tests inherit
credit earned by different bytes.

Retain the append-only historical ID fact, but attach current credit to a defining-file digest.
A changed definition must regain current RED/sensitivity and cold-review evidence through an
explicit strengthening path; it must not silently inherit. Decide formatting-only treatment with a
deterministic normalization or conservatively revalidate.

**Done when:** same-name assertion changes are detected, legitimate strengthening can regain credit
without deleting history, and a weakened replacement cannot ship on its predecessor's ratchet
identity.

### 72. Conserve every child result in budget accounting — OPEN (REVIEW F18)

**Problem solved:** Oracle-author spend and later settled reviewers after an ordered early exit do
not reach durable progress, ceilings, or the final bill.

Create one Driver-owned usage ledger for every `runChild` result. A returned envelope is recorded
exactly once before its verdict is interpreted. Parallel operations collect and charge every
settled result while preserving declared-order adjudication; completed later reviewers never gain
verdict authority merely because their spend must be recorded. `handedOutUsd`, `alreadySpent`,
airtime, component receipts, and terminal outcomes derive from or reconcile against the same facts.

**Done when:** sentinel usage across every Claude phase balances exactly; Oracle-author tokens and
cost enter `alreadySpent`; failed/exhausted parallel panels conserve all completed envelopes; no
success path double-charges; and REVIEW F18's reproduction reports the actual 160 tokens and $6.01.

### 73. Bound allocation for decision-bearing artifacts — OPEN (REVIEW F19)

**Problem solved:** prompt-bound, parsed, and hashed files can be synchronously loaded without a
size boundary, allowing a repository or generated report to exhaust the Driver.

Classify file inputs by use. Stat and refuse oversized prompt/report/evidence artifacts before full
allocation, with explicit names and sizes; stream repository hashing; and bound parser cardinality
or nesting where byte size alone is insufficient. Refusal is a terminally recorded failure, never
truncation or empty evidence. Choose defaults from current prompt/shell limits and measured fixture
sizes, documenting any configurable escape.

**Done when:** oversized PRD, report, and evidence fixtures fail before allocation; a large tracked
blob hashes with bounded memory; valid boundary neighbors work; and a refusal leaves the atomic
terminal evidence required by item 64.

### 74. Require repository-contained reporter identities — OPEN (REVIEW F20)

**Problem solved:** Vitest or Playwright can name an absolute/traversing file and bank a passing
ratchet ID for a test definition absent from the deliverable.

Add a shared reporter-path validator that proves lexical and filesystem containment under the
candidate root before ID construction. Define fail-closed behavior for nonexistent paths and
cross-platform normalization; do not collapse distinct Unicode or case-sensitive files unless the
host establishes they are aliases. Coordinate with item 71 so the accepted contained path points
to the definition digest receiving current credit.

**Done when:** absolute, traversal, symlink, cross-volume, UNC, and case-fold escapes fail for both
reporters; spaces, Unicode, whitespace, and platform separators remain stable for valid neighbors;
and a clean-clone integration case proves every credited test definition is present in-repository.

### 75. Validate the real installed plugin snapshot before release — OPEN (REVIEW F21)

**Problem solved:** source-tree shape and version history can pass while the Claude loader's cached
snapshot is absent, stale, incomplete, or differently interpreted.

Add a no-model external-contract gate using the real operator Claude CLI. First run
`plugin validate` and source inventory with the CLI version recorded. Then install the candidate
marketplace/commit into a disposable isolated Claude configuration, never the operator registry.
Assert cached version and commit identity, command/skill/hook inventory, all runtime-local imports,
and a zero-spend preflight launched from the cache root. Establish the CLI's isolation environment
contract by measurement before scripting it; do not assume an undocumented flag.

Also resolve the current validator warning by adding a marketplace description or recording a
specific compatibility reason for accepting it. This is a shipped-manifest change and therefore
requires the ordinary version bump.

**Done when:** the disposable install proves the candidate commit is the executing snapshot; stale
version, missing transitive file, wrong commit, and source-checkout leakage fixtures fail; the
operator's actual plugin registry is byte-identical before and after; and no model/API call occurs.

### 76. Persist a complete exact-tree acceptance receipt — OPEN (REVIEW F22)

**Problem solved:** archived `SHIPPED` state and Panel records do not preserve which deterministic
checks passed on which exact bytes.

Extend item 64's atomic terminal receipt rather than creating another terminal authority. Reuse
item 66's spec revision, item 68's candidate tree seal, item 70's gate-attempt/report identities,
and item 72's conserved usage ledger. Record the required gate roster and per-gate status,
command/config/tool identity, bounded output/report digest, Oracle/deploy result, ratchet revision,
Panel-record digest, and terminal transition. Store a sanitized interpretable config projection or
referenced immutable policy digest; never raw environment values or unbounded logs.

Make the receipt a typed, versioned assertion rather than an unlabelled bag of digests. Bind one
explicit acceptance claim type to an immutable subject (candidate tree plus resulting commit when
available), and separate its resolved inputs—specification, policy/config, plugin/Driver/CLI, gate
roster, and review artifacts—from the claim's results. A verifier rejects an unknown schema or claim
type and any subject mismatch. This borrows in-toto's useful subject/predicate separation and SLSA's
input/result distinction; it does not claim SLSA conformance, require signatures, or add an
attestation framework.

**Done when:** a clean-clone auditor can traverse one `SHIPPED` receipt to every required
same-tree acceptance edge; absent and failed gates remain distinct; stale/mixed/wrong-tree evidence
cannot complete the receipt; archived receipts remain interpretable after config changes; an unknown
schema, claim type, or subject fails closed; and synthetic secrets do not appear. REVIEW F22 owns
closure.

### 77. Record and enforce the cold-role supply boundary — OPEN (BORROWED R44)

**Problem solved:** Panel and Oracle independence partly rely on `not supplied`: the Driver does
not place Builder history, workflow synthesis, or held-out cases into a cold role's context. That
is an architectural discipline, not filesystem secrecy, and today prompt construction leaves no
machine-readable account of which input classes crossed the boundary. A future refactor can add a
forbidden input while template-string tests remain green.

Make prompt assembly return both the rendered text and a Driver-owned, sanitized supply manifest.
The manifest identifies the role invocation, specification revision from item **66**, input class,
content digest, and byte count; it never stores raw environment values, hidden reasoning, or a
second copy of prompt content. A per-role policy rejects forbidden classes before spawn: Panel may
not receive Builder logs, iteration history, or Builder-workflow synthesis; Oracle-author remains
PRD-only; Builder may not receive Oracle cases or Panel transcripts. Archive the manifest beside
the role receipt. This proves only the deliberate prompt/brief channel. It must never be described
as preventing a role from reading repository-visible files; F15/item **69** owns that different
question.

**Done when:** hostile unit cases inject every forbidden class into each affected role and refuse
before `claude -p`; benign neighbours prove each documented allowed class still arrives; a
verifier given the assembled prompt and system/template inputs can recompute every manifest digest
and byte count without the manifest storing those bytes again; item **54** reuses this
manifest for a role-internal workflow rather than
creating another context ledger; and an integration fixture proves a cold Panel invocation cannot
be assembled with Builder history even when a caller attempts it.

### 78. Retire the inert `styleModel` without breaking configuration silently — OPEN (REVIEW F23)

**Problem solved:** `styleModel` is a validated operator setting and `run.json` records it as an
active model, but no `spawnClaude` path consumes it. Meeseeks narration is deterministic and bare
`/meeseeks` sends idea invention plus PRD authoring through `prdModel`. A setting that accepts a
custom value and changes nothing is a false control; recording it as active also corrupts run
comparability.

Keep the deterministic style layer and `prdModel` routing. Do not repurpose the old name into new
behavior. Remove it from active defaults and the run manifest through an explicit compatibility
transition: existing target configs may be accepted for one documented deprecation window only if
startup says the key is ignored and names the replacement (`prdModel` for improvisation); new
configs and the wizard stop emitting it. Remove the legacy acceptance at the declared boundary.
The run manifest lists only configured model selectors that can affect a child invocation; item
76's acceptance receipt, not this compatibility slice, owns exact per-invocation model provenance.

**Done when:** changing `styleModel` cannot silently appear to select a model; legacy, new, and
post-window config fixtures exercise the documented transition; a Driver test with an injected
child proves bare improvisation selects `prdModel`; deterministic narration creates no model record;
`run.json` contains only active configured model selectors; and DESIGN/configure/help text agree.
This is a shipped config/manifest change and receives the ordinary version bump. The paid live tier
is required only if the implementation also changes child argv, routing, or an external CLI contract;
the smallest compatibility repair does not.

### 79. Expose the existing `--confirm-prd` checkpoint in the shipped command — OPEN (REVIEW F24)

**Problem solved:** the Driver and DESIGN support `--confirm-prd`, but the installed command's
frontmatter hint and instructions claim there are only two flags and omit it. The only deliberate
human checkpoint is therefore invisible on the supported `/meeseeks` surface even though the parser
accepts it.

Update `commands/meeseeks.md` in a versioned shipped slice: list the flag in `argument-hint`, explain
that it commits `PRD.md` and exits before Oracle/design/build, and tell the operator to start the
accepted artifact explicitly with `/meeseeks ./PRD.md`. Update the Driver's successful checkpoint
message to name that same exact continuation; “re-run without `--confirm-prd`” alone can send a
literal operator back through idea/improvisation authoring. It is a boundary between two invocations,
not a suspended unattended run. Keep README and DESIGN language aligned; `--yes` remains the
launcher's internal preflight acknowledgement and is not promoted as a user control.

**Done when:** a static command-contract test asserts the frontmatter, instruction, and pass-through
of `--confirm-prd`; an injected-child Driver integration fixture authors an idea with the flag,
observes a committed PRD and no later phase spawn, asserts that the exit instruction names
`/meeseeks ./PRD.md`, then starts that exact PRD without re-authoring it; `claude plugin validate`
passes; and the shipped command/Driver change receives the required version bump. A paid
slash-command invocation is not required unless implementation changes the external Claude Code
loading or argument-passing contract. REVIEW F24 owns closure.

### 80. Make the supported `/meeseeks` command user-invocable only — OPEN (REVIEW F25)

**Problem solved:** current Claude Code treats custom commands as skills and, unless
`disable-model-invocation: true` is present, advertises them to the model for autonomous invocation.
`commands/meeseeks.md` omits the control while granting its active turn permission to run preflight
and the Driver. The command itself supplies preflight `--yes`, and an ordinary interactive session
is not marked `MEESEEKS_RUNNING`; neither existing boundary proves that a person requested a new
unattended run.

Add `disable-model-invocation: true` to the shipped command frontmatter. Keep it user-invocable;
`user-invocable: false` is the opposite policy. This closes autonomous Skill selection, not direct
execution by a process already granted arbitrary Bash and aware of the plugin script path; that is
an unsupported operator/development surface, not an authentication guarantee. Do not weaken the
command control to support scheduled or model-selected launches: any future non-interactive
supported launcher needs its own explicit operator-created authorization and acceptance contract.
Add a static frontmatter assertion and batch the external behavior probe with items **79** and
**75** against the staged installed candidate.

**Done when:** command-contract tests fail if the field is absent, false, or confused with
`user-invocable`; `claude plugin validate` accepts the versioned command; a paid pinned-CLI canary
shows the installed command is absent from the model's invocable Skill surface while a direct user
invocation still loads it and reaches a deliberately safe preflight refusal; the canary records the
actual CLI/plugin identities; and an unsupported or unobservable control fails acceptance rather
than falling back to prompt wording. REVIEW F25 owns closure.

### 81. Bind preflight and document phases to declared repository changes — OPEN (REVIEW F26)

**Problem solved:** supported launch runs preflight in one interactive Claude tool call and starts
the Driver in a later call. Claude Code's `allowed-tools` field pre-approves the two intended Bash
commands but does not restrict the launcher's other tools. The Driver rechecks tracked state and the
run lock, not repository cleanliness or the other mutable preflight facts. Its PRD and design
children also hold unrestricted repository Write/Edit, despite templates declaring exact output
paths, and `commitPhase()` stages every change with `git add -A`. A launcher edit, concurrent user
edit, or off-contract document-child edit can therefore be committed as trusted phase output.

After F1 acquires the atomic run lock, make the Driver establish the authoritative launch snapshot
before any archive, child, target-content write, or commit. Reuse, at minimum, preflight's clean
HEAD/status, non-production remote classification, positional tracked-state check, agent-config
security scan, effective-config validation, and requested-sandbox availability rather than creating
weaker lookalikes. Binary/auth/network failures keep their existing fail-closed behavior; do not
misdescribe a repository snapshot as sealing mutable host state. Around each pre-loop document
phase, record the before identity and declare its permitted output set (`PRD.md` for PRD authoring;
the architect template's
named root/docs files, with conditional `docs/openapi.yaml`, for design), and refuse if any other
tracked or untracked path changes. Stage explicit admitted paths only; never clean, reset, or absorb
an unexpected path. The earlier command preflight remains fast operator feedback, but only the
Driver observation authorizes work. F14 continues to own the later exact reviewed-tree/ship edge.

**Done when:** integration fixtures pass command preflight, then independently leave a tracked or
untracked change, switch to a production-shaped remote, install a newly unsafe agent-config file,
or request an unavailable sandbox before Driver entry; each is re-evaluated and refused before
spawn/target-content write/archive while preserving repository bytes. A benign clean current HEAD
still proceeds. Separate hostile PRD and design children write one off-contract neighbour and are
refused without staging it; benign fixtures commit exactly every declared conditional output; no
pre-loop phase uses
`git add -A`; the launch snapshot and refusal identify HEAD plus bounded changed-path metadata without
capturing file contents or secrets; and F1/F14 tests prove the new boundary neither races the run
lock nor claims to solve post-review identity. REVIEW F26 owns closure.

### 82. Enforce role tool availability, not only tool approval — OPEN (REVIEW F27)

**Problem solved:** `PHASE_PERMISSIONS` calls its field `allowedTools`, and `claudeArgs()` passes
those names only through Claude Code's `--allowedTools`. Official semantics make that an approval
list, not an availability list; unlisted tools remain in context and an empty list emits no flag.
The code and tests nevertheless call Oracle-author's empty list “no tools at all.” On a resumed tree,
that author can be exposed to the implementation whose cases must come only from the PRD. Ambient
settings or MCP surfaces can similarly broaden other non-Builder roles.

Separate tool availability from permission approval in the role policy. Preserve Builder's
intentional unrestricted surface. For every other role, pass an exact built-in availability set
with `--tools` (`""` for Oracle-author), combine it with a measured non-interactive fail-closed
permission mode, and prevent inherited MCP/settings/Skill/Agent surfaces from adding capabilities.
Keep explicit `childSettings()` so writing roles still receive the guard; do not use `--safe-mode`
as proof of a zero-tool or exact-tool boundary. Put every flag before variadic `--allowedTools`.
Record requested and observed tool-policy identity in item **76**'s receipt; item **77** remains the
separate prompt-supply ledger.

**Done when:** unit tests assert the exact availability and approval argv for every phase, including
literal `--tools ""` for Oracle-author and unchanged unrestricted Builder behavior; the paid Oracle
contract test uses `phase: "oracle-author"` rather than `review`; pinned live canaries prove the
Oracle cannot read a repository sentinel, a read-only role can read but cannot write it, and a
document role retains only its declared built-ins plus the guard. A synthetic inherited allow rule
and MCP tool do not broaden any non-Builder surface. The result records actual CLI/settings/plugin
identities, distinguishes unavailable from denied, and refuses acceptance if effective availability
cannot be observed. Items **77**, **82**, and **83** satisfy three of item **54**'s prerequisites;
completion of Gate 0 and item **84**'s recorded outcome still govern admission. This slice closes
only F27/item **82**.

### 83. Enforce a measured Claude Code feature floor — OPEN (REVIEW F28)

**Problem solved:** preflight currently accepts any executable whose `claude --version` exits
successfully, even though Meeseeks relies on versioned flags, settings, hooks, command/Skill
controls, tool-availability semantics, and envelope fields. The repository has already observed
2.1.136 missing `--safe-mode`; a callable but incompatible PATH shadow can therefore fail only
after an unattended run has started work.

Establish one canonical minimum from the oldest pinned Claude Code release that passes every
mandatory live command and child contract used by the staged candidate. Do not guess an earlier
version from a single feature's documentation. If historical releases cannot be tested safely,
start with the lowest version actually verified and lower it only when evidence supports doing so.
Keep the value in one runtime source. Parse the ordinary decorated `claude --version` output and
refuse older, prerelease-ambiguous, or malformed values before state creation, child spawn,
target-content write, or install. Report the detected and required values plus a repair; never
auto-upgrade. Record the actual selected binary/CLI identity in the release evidence; item
**76** reuses that observation when its acceptance receipt lands.

A version comparison is only an early compatibility gate. Items **75**, **80**, and **82** still
own their installed-loader, command-surface, and role-tool behavior canaries. Item **54**'s
documented workflow minimum is only one input to the product floor and cannot substitute for the
whole contract suite.

**Done when:** unit tests cover a missing executable, below/equal/above-floor stable versions,
ordinary decorated output, prerelease output, and malformed output; an integration fixture puts a
known-old synthetic binary first on PATH and proves refusal before any run mutation or automatic
upgrade while preserving preflight's complete check report; pinned paid live runs at the declared floor and current supported CLI pass the same staged
installed candidate's full `npm run test:live`, including the item **75**, **80**, and **82**
canaries, and record exact
binary, CLI, settings, and plugin identities; README, DESIGN, preflight output, and fixtures name
the same floor; and raising a required external feature's minimum cannot leave the check stale.
REVIEW F28 owns closure.

### 84. Measure and admit fail-closed child containment — OPEN (live-contract first)

**Problem solved:** R19's optional sandbox proves only that Claude accepts
`{"sandbox":{"enabled":true}}`; its live test deliberately does not prove confinement. The current
Builder still uses `--dangerously-skip-permissions`, can read most of the operator host, and—unless
the sandbox happens to enforce a suitable default—can send repository or credential data to arbitrary
network destinations. Item **56** removes ambient environment values but cannot stop filesystem reads
or exfiltration. Current Claude Code documents stronger native controls (`failIfUnavailable`,
`allowUnsandboxedCommands: false`, filesystem deny-read/allow-read, outbound domain policy, and
named credential `deny`/`mask` rules) plus an `auto` permission mode for non-interactive runs.
Credential masking gives a sandboxed command a sentinel and can inject the real value only through
the sandbox proxy to configured hosts; it is not a whole-role secret broker. Those controls are
versioned and, in auto mode,
provider/model/plan restricted and preview-quality; documentation is not evidence that this plugin's
children receive or survive them.

**Boundary:** extend the existing Claude-native sandbox experiment; do not add a container service,
proxy dependency, or new control plane. Deterministic OS/filesystem/network enforcement is the floor.
A Bash/subprocess domain policy is not a whole-role egress boundary: inventory the model/auth channel,
built-in WebFetch/WebSearch, MCP, plugins/Skills/Agent, browser/computer-use surfaces, and local/private
or Unix-socket routes separately. Disable unavailable/nonessential surfaces through item **82**'s
actual tool policy; if a required Builder surface cannot be constrained or observed, describe the
narrower guarantee and do not call the child network-contained. Auto mode's classifier may be measured
as defense in depth, but it is model-judged, cannot certify work, cannot advance the ratchet, and
cannot replace the guard, cold Panel, or Oracle. A requested containment profile that is unavailable
or ignored refuses before target mutation; it never silently falls back to bypass mode. Preserve the
current unsandboxed-compatible path until the experiment establishes which operators and platforms
can support a stronger default.

**Experiment:** after items **56**, **82**, and **83** establish environment, role-tool, and CLI
identity, pass a pinned writing child a driver-owned settings profile with sandbox startup failure and
unsandboxed escape disabled. Measure the minimum filesystem reads and outbound domains needed for
Claude authentication, package installation, source control, and representative target gates; allow
names/domains, never secret values. For an explicitly required synthetic target credential, measure
both `deny` and `mask`: the command must see only absence or a sentinel, proxy injection must occur
only to the declared `injectHosts` that also pass the domain allowlist, and any extraction miss,
TLS/proxy setup failure, unsupported platform, or ignored setting must refuse rather than warn-and-pass
the real value. Run synthetic hostile canaries for a credential-file read, an unapproved HTTPS
destination through **each available outbound surface**, local/private and Unix-socket escape where
the platform exposes them, a request to disable the sandbox, hostile repository
instructions, and a `.meeseeks/` write. Prove built-in fetch/search or an inherited MCP/plugin cannot
route around the Bash proxy; a canary that cannot be attempted because the tool is absent records that
observed absence rather than a universal guarantee. Run benign neighbours for normal editing,
dependency installation, tests, local git commits, guard delivery, and process-tree settlement. Test
auto mode separately: record its exact eligibility and denial/termination behavior, and treat a
classifier outage or repeated headless denial as a named fail-closed result rather than a generic
Builder failure.

**Done when:** paid pinned live evidence distinguishes settings registration from actual filesystem
and network confinement; secret canaries never appear in logs or receipts, and any admitted mask
releases a synthetic value only to its exact approved host; every available outbound surface is
constrained, disabled, or named as outside the guarantee; an unavailable sandbox, ignored
key, denied required domain, unsandboxed retry, or unsupported auto-mode combination is diagnosed
before—or settles without—unbounded work; benign Builder behavior and the independent review boundary
remain intact; and the evidence supports one of three explicit outcomes: adopt a
portable stronger default, offer a capability-gated profile with truthful limitations, or reject the
change and retain R19. No outcome is inferred from vendor marketing or a single successful child.

### 85. Keep candidate instructions out of reviewer authority — OPEN (REVIEW F29)

**Problem solved:** cold roles use `--safe-mode`, so current Claude Code does not automatically load
target `CLAUDE.md`, rules, Skills, plugins, hooks, MCP servers, or memory. The reviewer template then
explicitly tells Panel to read target `CLAUDE.md` and treats its rules and referenced design documents
as binding. Builder can change that surface after preflight. Process separation therefore leaves a
shared candidate-controlled route into every reviewer verdict.

Keep candidate-tree content available as evidence, but remove its ability to define the reviewer's
instructions. Binding requirements come from item **66**'s immutable pre-Builder specification
revision and a Driver/plugin-owned reviewer contract—not item **51**'s general `CONSTITUTION.md`,
which remains excluded from Panel. Any project convention admitted as authority must be snapshotted
before Builder and identified in the review supply. A later Builder edit to that
file is an output to assess. Preserve `--safe-mode`, and make item **77** report trusted instruction
sources, untrusted candidate evidence, and disabled ambient sources separately. Immediately before
Panel, re-run the agent-config security scan against the exact item **68** candidate identity. That
scan is a fail-closed known-pattern defense, not proof that arbitrary model-visible text is safe.

**Done when:** reviewer templates contain no direction to obey candidate policy; unit tests bind every
authoritative requirement frame to the immutable pre-Builder source; a post-preflight fixture changes
`CLAUDE.md`, `.claude/rules/`, a Skill, hook, and MCP configuration and proves seeded hostile forms
refuse before Panel while benign documentation remains readable only as evidence; the final scan is sealed to
the reviewed tree; item **77**'s supply report names the trust class and identity of each source; and a
pinned paid hostile/benign canary proves project/user/local customizations stay unloaded while the
Driver-owned reviewer prompt and implementation evidence remain available. The canary establishes
only those seeded cases, not arbitrary prompt-injection immunity. Items **66**, **68**,
**77**, **82**, and **83** are prerequisites. REVIEW F29 owns closure.

### 86. Verified red-team assessment job type — PARKED (post-DoD follow-on)

**Problem solved:** the existing hostile Panel, security review, mutation/integrity gates, and
held-out Oracle judge known requirements and evidence, but they do not authorize a bounded actor to
actively seek reproducible counterexamples against a declared threat model. The useful addition is
that scoped assessment job—not a standing fifth authority and not a generic claim that the target is
secure.

The operator authorizes the target, threat model, allowed techniques, prohibited effects, network
and credential policy, budget, and stop conditions. Driver seals that authorization with the exact
candidate identity and cannot broaden it. A fresh job-specialized producer in the existing Builder
authority class (called Red here) receives an immutable read-only candidate snapshot. Generated
attack harnesses, commands, configurations, and inputs live in a separately identified disposable
assessment workspace. Each finding binds the candidate identity and assessment-harness identity and
includes reproducible evidence. An independently instantiated verifier in the existing cold
security-review process reruns each reproduction from the same candidate in a fresh assessment
workspace and includes a benign control so indiscriminate failure is not mistaken for a
vulnerability. Red and reproduction reuse existing role spawn paths and authority identities with
Driver-owned job/lens prompt addenda and exact restricted tool/effect profiles. The current
code-writing Builder prompt and tool policy must not be inherited literally by a read-only Red job.
These are not new durable authorities, standing personas, or configuration effort keys. The cold
Panel judges requirement and severity impact; Builder alone mutates the
candidate to repair accepted findings; the independent verifier reruns the reproduction and
regression controls. Disputed semantic evidence remains cold Panel judgment or `unverifiable` unless
an existing deterministic Oracle fixture directly covers it. Driver alone updates durable state or
terminal status.

Red cannot certify Red, advance the ratchet, edit Driver-owned state, or declare the target secure.
“No findings” is an inconclusive coverage observation, not a pass. A dynamic workflow may organize
bounded discovery inside Red, but its ephemeral agents gain no durable authority. Red-team output is
untrusted input until independently reproduced; prompt text does not expand authorization to
production targeting, persistence, destructive action, credential collection, or data exfiltration.

**Admission:** F2, item **40**, item **56**, item **65**/F11 cross-platform descendant cleanup,
items **66**, **68**, **76**, **77**, **82**, **83**, **85**, and a recorded item **84** containment
outcome must exist first. The permitted effect and network profile must fail closed, survive
restart without broadening scope, and prove Red cannot mutate the candidate or reach Driver-owned
decision stores. A benign synthetic pilot
must show independently reproduced incremental detection beyond the existing Panel/security path;
otherwise close this item as redundant. Item 49 is not a prerequisite: Red is an assessment campaign
over the existing code/security spine, not an artifact-writing mode.

**Done when:** hostile and benign scope fixtures prove authorization cannot broaden after launch;
every finding binds to the exact candidate and carries a reproduction plus control; verifier
independence and context starvation are live-proven; assessment harness identity is recorded
separately; Red cannot write the candidate; accepted Builder repairs force reproduction and
regression reruns; crash, timeout, output cap, budget exhaustion, unavailable containment, and
malformed finding evidence all terminate fail-closed without orphan descendants; the final report
distinguishes reproduced, rejected, unresolved, and unattempted coverage; and a measured pilot
improves incremental defect discovery or morning acceptance enough to justify its added cost.

## Cross-cutting non-goals — the refusals ARE the product
Recorded so a future session does not "helpfully" add them:
- **Automatic transcript harvesting or runtime prompt/skill mutation** — item 59 is an offline,
  staged development experiment over structured driver artifacts. Production roles never rewrite
  their own instructions, and sensitive child transcripts are not optimization input.
- **A third-party agent framework as Driver or required sandbox backend** — borrow measured invariants,
  not authority. Eve, its Workflow SDK, LangGraph, or a hosted sandbox would duplicate the durable
  control plane and violate the dependency-free Claude-native core.
- **Persistent Panel/Oracle sessions or mid-run human-in-the-loop parking** — both weaken the cold,
  unattended contract. A required human decision ends with item 50's terminal question artifact; it
  never leaves a paid run waiting overnight.
- **Persistent kernel / REPL as the builder's environment** — breaks builder starvation; state
  leaks past `git reset --hard` and the ratchet's premise dies.
- **Builder self-memory or self-grading** — breaks cold review; self-evaluation is the enemy the
  whole design defeats.
- **Open-ended "just keep working" mode with no DoD** — meeseeks requires a verifiable done-bar;
  the answer to "handle more work" is more job-types with done-bars (32–34, 49, and parked
  assessment item 86), never no done-bar.
- **A warm interactive TUI as the primary surface** — unattended-trustworthy is the moat; an
  attended mode, if ever built, is a separate surface and must not wag the verification dog.
