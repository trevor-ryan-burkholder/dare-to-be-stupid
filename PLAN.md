# PLAN — what remains. Compiled 13 August 2026; statuses last swept 18 August at candidate 0.208.0

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

`IMPLEMENTED (...); REVIEW ... open pending Codex` means **implementation complete, review queued**.
It does not mean the development session is blocked. Use `REVIEW REQUIRED` only when verification
is a dependency for the next available work or for a release/acceptance claim.

## Autonomous traversal protocol

`PLAN.md` is an executable dependency queue, not a menu for the operator. A development agent:

1. selects the highest-priority current item whose named prerequisites are satisfied;
2. finishes its implementation, hostile tests, required gates, version/docs updates, and commit;
3. records implementation status here without changing Codex-owned finding status;
4. queues review evidence and continues the next independent eligible item; and
5. repeats until the objective is complete or every remaining path is genuinely blocked.

Release-blocking and execution-blocking are different. An open REVIEW finding prevents release
acceptance; it does not prevent independent implementation. Batch coherent repairs for Codex while
preserving one slice per commit. Require review only when the next change relies on an unverified
high-risk boundary, before claiming the candidate accepted/releasable, or when review is the sole
remaining dependency.

`BLOCKED`, `PARKED`, `PREPARED`, and operator-reserved experiments are traversal facts, not
prompts to ask what to do. Skip them, continue eligible work, and revisit only when their documented
admission condition changes. Choose the safest smallest sound implementation; do not stop for an
implementation decision.

---

## Build order — current traversal at candidate 0.208.0

**Gate 0A — high-priority external review dependency ledger.** Closed repairs remain in this
section only to preserve the dependency and evidence trail; they are not current work. Only entries
explicitly marked OPEN or PARTIAL remain release-blocking, and `REVIEW.md` owns that status.
Release-blocking does not mean session-blocking: implement eligible Gate 0 work continuously and
queue Codex closure under the traversal protocol above.

- **F1:** acquire the repository lock atomically before any work — **implemented at 0.165.0;
  REVIEW F1 CLOSED at 0.194.0**. Winning is an exclusive create,
  stale recovery is a serialized explicit retry, each acquisition carries an ownership token only
  its owner may clear, and the driver acquires before the `.gitignore` write, the archive, the
  first child, the install and every commit (`DESIGN.md` §3.5). Evidence:
  `test/integration/run-lock.integration.test.mjs` races six real processes at one directory —
  free and stale — and drives the real `main`; the same race against the 0.164.0 semantics
  produced six winners out of six.
- **F26 / item 81:** after that lock, revalidate launch safety and admit only declared pre-loop phase
  outputs — **PARTIAL at 0.166.0, remaining clause closed in the 0.208.0 candidate (item 109);
  REVIEW F26 OPEN pending Codex**. The launch checks and output allowlists landed at 0.166.0;
  failed pre-loop Git operations are now propagated. See item 81, item 109 and REVIEW F26.
- **F2:** make timeout and output-cap termination force and settle after a bounded SIGTERM grace
  period — **PARTIAL at 0.167.0; REVIEW F2 OPEN**. `shell` now escalates `SIGTERM` → five-second
  grace → `SIGKILL`, settles without waiting
  for a cooperative exit, sweeps descendants on both termination paths when it captured their
  pre-image, and keeps the first termination's verdict. Evidence:
  `test/integration/shell-termination.integration.test.mjs` — a resistant child and its descendants
  under both paths, a cooperative child that does not pay the grace, and the stale-sweep regression
  the escalation itself introduced. `DESIGN.md` §11.1 states the mechanism.
  **Closed in the 0.208.0 candidate (item 109):** the ownership pre-image is now sampled for *every*
  command rather than only when a ceiling was supplied, so the output cap sweeps descendants on a
  call with no `timeoutMs`. That was the last open clause.
- **F3:** prevent an unrelated local listener from satisfying the health gate — **implemented at
  0.168.0; REVIEW F3 CLOSED at 0.194.0**. The probe polls only the
  assigned port, refuses a port something was already answering on, re-checks that the child is
  alive when the response arrives, and keeps `portContractHint` as the teaching diagnosis; `--port`
  is the driver/operator-owned contract that replaces the announced-port fallback. Evidence:
  `test/health-probe.test.mjs` — the decoy reproduction, the inverted two-masters test, the fixed
  port named by the driver, and the pre-existing listener a dead child cannot borrow.
- **F6 / item 60:** resolve every passing reviewer citation to a contained, existing line before
  Panel combination — **implemented at 0.169.0; REVIEW F6 CLOSED at 0.194.0**. See item 60 below.
- **F7 / item 61:** require both process success and envelope success from every Claude role —
  **implemented at 0.179.0; REVIEW F7 CLOSED at 0.194.0**. See
  item 61 below. The mandatory tier-3 run was made: the operator authorised it, and the live tier is
  covered by their Claude Max subscription rather than being a per-run expenditure.
- **F12 / item 66:** bind every role and terminal decision to one immutable specification revision —
  **implemented at 0.170.0; REVIEW F12 CLOSED at 0.194.0**. See
  item 66 below.
- **F8 / item 62:** bind held-out Oracle cases to that run and specification revision —
  **implemented at 0.171.0; REVIEW F8 CLOSED at 0.194.0**. See
  item 62 below.
- **F14 / item 68:** commit and tag only the exact workspace identity gated and reviewed —
  **implemented at 0.172.0; REVIEW F14 CLOSED at 0.194.0**. See
  item 68 below.
- **F16 / item 70:** accept only fresh successful test reports from the current gate attempt —
  **implemented at 0.173.0; REVIEW F16 CLOSED at 0.194.0**. See
  item 70 below.
- **F30 / item 87:** reject every normalized flaky test result before Panel or `SHIPPED`,
  after items 70 and 74 bind the report — **implemented at 0.176.0; REVIEW F30 CLOSED at
  0.194.0**. See item 87 below.
- **F18 / item 72:** conserve every completed child envelope into ceilings and terminal receipts —
  **implemented at 0.174.0; REVIEW F18 CLOSED at 0.194.0**. See
  item 72 below.
- **F29 / item 85:** keep candidate-tree instructions out of reviewer authority — **partial at
  0.206.0**. The Driver-owned authority boundary and pre-Panel rescan landed; the supply trust-class
  report, reviewed-tree binding for the scan, and paid canary remain in item 85.

**Gate 0B — external child/platform contracts.** F5/item **56** is OPEN: measure the real
child-environment contract before replacing ambient inheritance, then prove the boundary through a
paid Claude child. F11/item **65**, F15/item **69**, F21/item **75**, and the installed-loader half
of F25/item **80** remain open external-contract work. F27/item **82** is implemented at 0.204.0
pending Codex verification. F28/item **83** is partial at 0.205.0: the measured version policy is
enforced, while one-CLI-per-run binary identity and auto-update control remain. These contracts close
before feature fan-out.

**Gate 0D — closed repair gaps retained as history (items 88–94).** F31–F37 were found by the
second Codex pass and are CLOSED in REVIEW at 0.194.0. Their item sections remain evidence for the
repairs and dependency history; they are not a current ordering queue.

**The common cause is worth recording once.** Four of the seven survived because the tests written
with the original repair *confirmed the design instead of attacking it*: a fixture that committed
through `execFileSync`, which throws where production `shell` returns; a bystander started before the
snapshot that was supposed to threaten it; a benign-orphan case using a different token from the one
that recurs; and denial text injected only through a failed result. A hostile test that assumes the
mechanism it is testing is not a hostile test.

**Gate 0C — remaining external review defects.** F4's absolute HTTP deadline and bounded body are
**implemented at 0.177.0; REVIEW F4 CLOSED at 0.194.0**. Every
attempt in `scripts/health-probe.mjs` now carries a wall-clock deadline bounded by what remains of
the probe's own, treats response `aborted`, response `error` and a premature `close` as failed
attempts, caps the body while receiving it, and applies all of that to the remote smoke check as
well. Evidence in `test/health-probe.test.mjs`: a continuously streaming endpoint, an abandoned
response, an oversized body, a streaming remote check, and the ordinary local and remote responses
that must still pass.

F9's positional machine-state ignore boundary through item **63** is **implemented at 0.178.0;
REVIEW F9 CLOSED at 0.194.0**. See item 63 below. F10/items **64**
and **103**, F13/item **67**, F17/item **71**, F19/item **73**, F20/item **74**, F23/item **78**,
and F24/item **79** are implemented; REVIEW has closed F20, F23, and F24, while F10, F13, F17,
and F19 remain open pending verification of later repairs. Their item headings own the exact repair
versions. F22/item **76** remains OPEN. F11 may share F2's process-lifecycle implementation, but
retains its own platform evidence under item **65**.

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
4. Items **68**, **70**, **72**, and **77** establish exact-tree, attempt, usage, and role-supply
   identities before item **76** assembles the acceptance receipt. Items **71** and **74** must agree on the contained test
   definition receiving current credit. Item **87** consumes items **70** and **74** so its flaky
   stability decision cannot be laundered through a stale or external report; item **67** must then
   keep that required result in the non-shrinking roster.
5. Item **75** may build the reusable loader gate in Gate 0B, but its acceptance run exercises the
   staged, version-bumped candidate after that slice's shipped-file changes have landed. Items
   **79** and **80** should share one versioned command-contract slice, whose installed result item
   **75** verifies. Item **83** may add parsing and early refusal independently, but closure consumes
   item **56**'s sealed child control set so one run cannot background-update into a different CLI.
   Its compatibility policy is accepted only after the staged candidate passes the mandatory item
   **75**, **80**, and **82** live contracts at every admitted boundary. This is an evidence
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
a forensic gap; it is not authorization for checkpoint/resume. Item **106** remains **PARKED** until
a concrete item **34** or **49** job requires one named authenticated external resource; configured
connectivity or an available MCP server is not that admission evidence.

**Deferred/post-DoD:** item **21** remains deferred until code-complete. Items **33–35** and
**47–51** remain Phase 6; item **32** is parked there until calibrated evidence justifies one optional
heterogeneous cold-role experiment without changing the Claude-native runtime, and item **36** is
parked on its native detachment experiment plus item **58**'s separate resume admission. Within Phase
6, item **49**'s artifact substrate precedes its first Verified Research instance, item **34**,
despite their chronological numbering. Item **59** is also post-DoD because it depends on item 35.
Item **30** remains a research/measurement intake, not an implicit build. Item **86** is parked
post-DoD; it cannot enter the queue until its containment and incremental-detection admission
conditions are met. Item **106** is likewise post-DoD and admission-gated; it is not part of the
default code-job path.

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

**Done when:** the registry accepts a detect-only plugin without inventing an installer; an absent
binary produces the documented warning, a clean installed scanner passes, and a committed synthetic
secret fails with bounded JSON-backed evidence. Every Driver-installed registry command is version
pinned and records the resolved version; no finding becomes monotonic until its escape is specified.

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

**Disposition complete when:** each candidate has a recorded measurement and is either rejected,
parked with an admission condition, or promoted into its own numbered implementation slice with
prerequisites and deterministic acceptance. Item 30 itself never authorizes a runtime change.

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


**Done when:** schema/parser fixtures prove a non-empty `unverifiable[]` blocks acceptance, a missing
or empty attack account cannot parse as `pass`, and valid hostile findings remain intact. Benign
neighbours prove ordinary evidence still parses; malformed or extra authority-bearing output fails
closed; the required paid tier-3 contract passes before the template/parser slice lands.
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


**Done when:** the gate invokes the pinned real JSON interface for static and `file://` targets,
fails on any primary finding or malformed/oversized output, preserves advisory findings as bounded
reviewer evidence without granting them gate authority, and skips only on the documented non-UI
capability path. Real committed fixtures cover primary/advisory partition and viewport output; the
paired web-ui smoke proves the installed invocation rather than only the parser.
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

### 32. Optional heterogeneous cold-role experiment — PARKED (Claude Code remains native)

**Problem solved:** Builder and Panel can share model-specific blind spots even when their processes
and contexts are independent. A different provider or model might improve cold-review recall, but
heterogeneity by itself is not evidence of better judgment.

**Disposition and boundary:** do not build a general backend abstraction and do not replace Claude
Code as Meeseeks' native runtime or control surface. Park one optional, offline side-by-side
experiment until item **57**'s calibrated Panel corpus demonstrates a material, model-correlated
high-severity miss that the existing Claude configurations do not address. The experimental role
has no terminal authority and cannot enter the production Panel merely because it found more issues.

**Admission:** Gate 0, items **57**, **76**, **77**, **82**, and **83** must close; the candidate
backend must expose a stable non-interactive interface whose exact model, prompt supply, tools,
permissions, cost, timeout, and process settlement can be observed and bounded. Precommit the
incremental recall, false-positive, latency, and cost thresholds. Only an operator may authorize
the additional provider, credentials, data handling, and spend.

**Experiment and done condition:** run the same sealed seeded-defect and clean-neighbour corpus
through the existing cold Panel and the candidate role, with candidate identity hidden from the
grader. Accept only reproducible improvement under item 57's uncertainty rule, no deterministic or
high-severity regression, preserved context starvation, exact receipts, and bounded descendants.
Otherwise reject the backend. A passing experiment may justify a separately reviewed optional
adapter slice; it never makes the Driver, command, install format, or default execution path
model-agnostic.

### 33. More language toolchains + reporters (Python, Go, Rust) — OPEN
New `scripts/toolchains/*.mjs` + `scripts/reporters/*.mjs` behind the existing fixed toolchain
contract (the same shape dotnet proved). Each: detect, map the gates, parse the framework's
reporter output into ratchet ids. **Invariant:** fixture-tests-over-mocks against real committed
reporter output; each new reporter owns a contract another binary defines → one **tier-2/3 live
check** per toolchain. The core loop is already language-agnostic (the ratchet parses reporter
JSON, not syntax) — this is surface, not spine.

### 34. Verified research mode — OPEN (the first instance of item 49's substrate)

**Done when:** each admitted language lands as its own complete slice with deterministic detection,
fixed gates, real committed reporter fixtures, contained definition paths, current-definition
ratchet credit, and fail-closed missing/malformed/crashed-report behavior. A clean-clone integration
case proves the external tool's actual invocation and one seeded regression cannot retain credit.

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
separate normative security profile and hostile live evidence exist. An authenticated external
source additionally requires item **106**'s exact job-scoped capability; authentication must never
turn an account, service, or whole MCP catalog into ambient role authority. Local and private
targets remain separately refused even when authenticated. Whether a source actually supports an
inference, whether uncited counterevidence changes the conclusion, and whether the report answers
the question remain cold-review judgments.

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

### 36. Terminal detachment and later resumability — PARKED (evidence-gated)

**Done when:** the durable store has a measured size/age bound, append-only promotion and retraction
history, and an explicit rollback for a false lesson; only independently sourced support can promote
a candidate, and every accept/reject records evidence and policy identity. Builder and target code
cannot write, read rejected guidance, or cause self-promotion; crash fixtures preserve the last valid
store; item 59 consumes only the staged interface rather than gaining runtime mutation authority.

**Problems kept separate:** surviving an operator terminal closing is a supervision problem;
restarting after Driver death, reboot, or incompatible upgrade is a replay and idempotency problem.
Conflating them would build a daemon before establishing which failure actually blocks morning
acceptance.

**Disposition:** do not build a daemon or resume path from this item. Terminal detachment gets the
bounded native experiment below. Crash/reboot/relaunch remains parked behind item **58**'s killed-run
admission test and a demonstrated gap in current artifacts. A lifecycle journal is not itself
authorization to replay effects, and the current run lock must never be bypassed by a relaunch.

**Stage A — native detachment experiment:** after F25/item **80** verifies the user-only command
boundary, an operator starts `/meeseeks` in a disposable target through Claude Code's research-preview
[agent view](https://code.claude.com/docs/en/agent-view), then closes the view and shell and restarts
the supervisor. Verify the exact Driver PID and descendants, output, guard, lock, receipts, spend,
and terminal state through sleep and supervisor restart. A Claude row labelled Completed is never
`SHIPPED`. Record whether shutdown, post-sleep hangs, auto-update, or human-needed states break the
contract; do not make agent view a dependency.

**Stage B admission:** only if Stage A fails a material detachment need, or item 58 proves current
artifacts cannot reconstruct a killed run, specify the missing supervisor or resume primitive.
Before any replay implementation, bind a compatibility fence for schema, Driver/plugin/CLI, target
tree, config/policy, role supply, and tools; classify every interrupted effect as safely idempotent,
compensatable, or non-replayable; and refuse rather than guess. The guard remains positional,
Driver-owned state remains protected, and nesting still requires `--give-them-the-box`.

**Done when:** Stage A either demonstrates safe terminal detachment and closes that need with a
recorded hostile/benign result, or rejects the native path with evidence. Resumability remains parked
unless item 58 admits it; if later admitted, crash/reboot/relaunch fixtures must reconstruct one
exact run without duplicating a child, gate, commit, deploy, spend charge, or terminal transition,
must reject every compatibility mismatch before side effects, and must never treat a child return
or supervisor label as durable success evidence.

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
- **External effects are not artifact evidence.** An artifact job that must mutate an external
  system depends on item **106**'s separately admitted action profile. Until then, it may produce a
  proposed-action or item **50** terminal question artifact, but it may not report a simulated,
  staged, queued, or merely requested effect as completed and may not use one to satisfy a
  requirement, reviewer verdict, ratchet id, or `SHIPPED` decision.
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

### 106. Job-scoped external-resource capabilities — PARKED (post-DoD, admission-gated)

**Problem solved:** item **34** deliberately starts with public HTTPS, while later research or artifact
jobs may need one authenticated document, repository, account, or service. Supplying an ambient token,
an entire preconfigured MCP server, or the operator's connector universe would let an unattended role
reach resources and operations the job never authorized. Item **84** can constrain connectivity, but
reachability is not permission. The missing boundary is an exact, revocable grant from one sealed job to
one external resource and operation class.

**Origin and smallest borrow:** Cloudflare OS was inspected at commit
`2ab06431467dcb887133578d05365b15690187c6` (18 August 2026). Its useful invariant is the
*introduction*: an agent receives a narrow resource capability rather than ambient account access.
Its shared MCP boundary also defaults unknown operations to effectful, fingerprints policy-bearing
catalog metadata, bounds untrusted catalogs and payloads, and claims a write before external I/O so an
ambiguous restart cannot repeat it. Borrow those properties, not Cloudflare OS, Workers, Durable
Objects, Gatekeepers, its UI, or its approval simulation. Research provenance and the negative controls
are recorded as R48/R49 in `docs/research/BORROWED.md`.

**Admission:** this item does not enter the queue until Gate 0 and items **56**, **76**, **77**, **82**,
**83**, **84**, and **85** close; item **34** or **49** then demonstrates a concrete job that cannot meet
its accepted DoD with public unauthenticated sources; and the operator authorizes the exact integration
and data-handling class. A configured connector, an available MCP server, or general product ambition
is not evidence. Start read-only. Effectful operations require a second, independently reviewed
admission after read-only capability canaries pass; item **50** is the fallback when a necessary effect
is not already authorized.

**Meeseeks-native boundary:** extend the existing Driver-owned role/tool/receipt contracts; do not add a
third-party control plane or change the Claude Code-native runtime. Before implementation, a bounded
experiment must establish a broker or adapter shape in which the role receives an opaque, job-scoped
capability and the raw credential is absent from its environment, argv, settings, prompt, target tree,
logs, and receipts. If the current CLI cannot preserve that separation, reject the feature rather than
renaming credential injection a capability. Only the operator/Driver may mint a grant. A target, MCP
server, candidate tree, or role may request one but cannot assert, widen, or renew one.

Each sealed grant binds the job/run identity, integration and resource identity, allowed read or exact
action operations, expiry/revocation state, adapter and policy identity, fixed request/result limits,
and the catalog/policy fingerprint the classification was made against. A changed catalog or policy
invalidates the grant rather than silently widening it. Network access and capability authority remain
separate receipts. External descriptions, schemas, annotations, and returned content are untrusted
evidence under items **77** and **85**, never instructions. Server-supplied `readOnlyHint`-style metadata
may narrow or corroborate Driver-owned policy but cannot authorize an observation; an unclassified or
contradictory operation is effectful and refused. Bound catalog count, description/schema size,
arguments, result bodies, pending proposals, redirects, and retained history before any of them enter a
model context or durable artifact.

**If external effects are later admitted:** the sealed brief must authorize the exact effect before the
run; there is no mid-run approval wait. A proposal, simulation, queue entry, or predicted response never
counts as an applied effect or as evidence for a requirement, reviewer verdict, ratchet id, or
`SHIPPED`. Persist an idempotency identity and a durable `applying` claim before external I/O. The
guarantee is at-most-once, not exactly-once: a crash, timeout, malformed response, or lost acknowledgement
after dispatch records `outcome: unknown`, is not automatically retried, blocks terminal acceptance of
the claimed effect, and requires independent reconciliation against the external system. Apply ordered
effects only through the claimed sequence and stop at the first manual gate, refusal, failure, or unknown
outcome; never skip ahead on assumptions that earlier effects landed. Do not infer that an inverse
operation is safe compensation.

**Done when:** disposable synthetic canaries prove an exact allowed resource/read works while a sibling
resource, broadened query, unlisted operation, stale fingerprint, revoked grant, private redirect, and
oversized catalog/request/result all refuse before disclosure; raw credential sentinels are absent from
every role-visible and persisted surface; external content cannot change role authority; and receipts
bind grant, policy, adapter, resource, and result identities without secrets. Any admitted action profile
also proves a crash while still `pending` (before the durable claim) is retryable, any crash after the
claim never automatically repeats the effect, unknown outcome cannot become `SHIPPED`, and ordered
processing cannot bypass a stopped predecessor.
Close this item as **REJECTED** if no concrete authenticated job appears or if raw credentials cannot be
kept outside the role boundary without importing a new runtime/control plane.

## Current follow-ons and research-gated experiments

This heading ends Phase 6. Items 52, 53, 56, 57, 77–85, and 87 are pre-DoD only in the order stated
at the top of this file; items 54, 55, and 58 are conditional or research-gated; item 59 remains
post-DoD because it depends on Phase-6 item 35. Item 86 is PARKED post-DoD behind its own admission
conditions. Item 106 is PARKED post-DoD behind a demonstrated authenticated-resource job and its own
capability canaries. Item numbering records chronology, not priority. Item **77** therefore lands before item
**76** despite its later number. The top-level build order is authoritative when physical placement
and execution order differ.

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

**Done when:** mapping-tightness tests cover all three new events and refuse a missing renderer;
`MEESEEKS_STYLE=plain` preserves the complete plain payload; styled output keeps gate details
verbatim; and changing style cannot alter gate, carry, Panel, ratchet, or terminal decisions. No
heartbeat or child-output path gains narration.

**Problem solved:** bounded fan-out and synthesis may improve difficult implementation work, but
only if they do not transfer durable authority to an ephemeral agent organization. This item tests
that proposition; it does not replace `driver.mjs`, the ratchet, the panel, or the oracle.

**Blocked by:** completion of PLAN Gate 0, item **77**'s durable prompt-supply boundary, and a
recorded item **84** containment outcome. Gate 0 includes the atomic owner, hard cross-platform
process settlement, child-environment boundary, exact role tools/CLI compatibility, and candidate-independent
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
Bind the exact experimental identity: resolved Claude binary/version, requested model and effort per
role, observed per-model usage names, and role prompt/tool/supply digests. Keep requested and observed
models distinct; an unavailable observed-model field is explicit and cannot support a model-attribution
claim. Also bind an execution-resource profile: OS/architecture, available or enforced CPU and memory,
concurrency, phase timeouts, and relevant external tool versions. Compare candidates only on matched
effective identities, profiles, and enforcement semantics; stratify or mark provider/model drift as
confounded rather than letting counterbalancing conceal it. Classify infrastructure failures separately
rather than charging them to model capability or quietly dropping them. Cold model judgments may be
recorded as advisory scores but cannot turn a deterministic failure into success, advance the ratchet,
or declare `SHIPPED`. No Braintrust, Eve, or hosted eval dependency.

Before the first comparative run, seal an evaluation-protocol receipt naming the baseline and
candidate digests, scenario and partition identities, fixed trial count, counterbalanced run order,
inclusion/exclusion and retry rules, grader/rubric identities, primary metric, non-compensable failure
policy, minimum acceptance threshold, minimum practically meaningful delta, uncertainty estimator,
confidence level or equivalent calibrated error bound, decision rule, and stopping rule. A missing
or unsettled threshold makes the campaign descriptive
evidence, not a readiness claim. Retain failed, interrupted, and missing attempts; do not peek, extend
the cohort, or stop early because the observed result became flattering. The operator owns the product
threshold, minimum practically meaningful delta, and severe-failure tolerance; the harness owns
faithful execution of the precommitted rule.

Pair baseline and candidate on the same scenario/trial identities where practical and report an
uncertainty interval that respects scenario and repeated-trial clustering. A selection win requires
the precommitted uncertainty rule to establish at least the minimum practically meaningful delta. A
positive point estimate that does not establish that threshold is inconclusive. State
the sample size and method; do not manufacture precision from too few expensive trials. This adopts
METR's useful confidence-boundary discipline and Anthropic's warning that small score differences sit
inside statistical and infrastructure noise, without importing a statistics service.

Every trial starts from the same immutable fixture snapshot in a fresh disposable workspace with no
files, Git commits, Meeseeks state, ports, services, or temp artifacts produced by another trial.
Give each trial unique writable state and record any intentionally shared package/model cache rather
than calling it isolated. Counterbalance baseline/candidate order across the campaign so time-of-day or
provider drift does not consistently favor one side. This adopts Anthropic's current
[clean-environment guidance](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
without importing an eval service. A deliberate leftover-file/history/service canary must fail the
isolation check before paid comparison begins.

Version and audit every scenario before it can enter selection or final evidence. Its contract maps
each prompt requirement and claimed Definition-of-Done criterion to an outcome grader or an explicit
human criterion; a known reference solution passes; seeded incomplete or incorrect outputs fail; and
a valid alternative implementation is not rejected merely for differing from the reference patch.
Ambiguous, contradictory, underspecified, or low-coverage tasks are quarantined. If such a defect is
found after protocol sealing, retain the affected attempts, mark the metric invalid under the
precommitted rule, version the repaired scenario, and never silently delete the inconvenient result.
This harvests the task-quality invariant from Anthropic's eval guidance and OpenAI's coding-eval audit,
not either organization's benchmark or agent-review pipeline.

The untouched final partition must also be **unseen**, not merely unused for selection. Keep exact final
task payloads, reference solutions, hidden checks, seeded-defect labels, and grader answers in an
operator-owned package outside the public plugin repository, target tree, and every model-visible tool
surface until the relevant input must be supplied. Identify that package by digest in the protocol and
result. A web-enabled task whose exact question/answer or benchmark key is publicly retrievable is
contaminated evidence, not a clean final result. Anthropic has observed models identify an evaluation
and retrieve its answer material; static public secrecy-by-obscurity is not an invariant
([eval-awareness report](https://www.anthropic.com/engineering/eval-awareness-browsecomp)).

When `morningAccepted` is human-labelled, precommit a versioned rubric and, where practical, present
the prompt, artifact, and black-box behavior without candidate/model/version identity, cost, or the
agent's own terminal assertion until the acceptance label is recorded. Reveal cost and identity
afterward for efficiency analysis. Record when blinding is impossible rather than implying it occurred.

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
Candidate comparison uses selection only: aggregate quality must satisfy the precommitted uncertainty
rule, and every required deterministic scenario must preserve or improve. Missing or non-finite results
refuse. The final-test package remains sealed outside model-visible repositories and tools until the
candidate and selection decision are frozen. It may grant or deny the predeclared readiness claim, but
never choose among candidate variants or feed an edit inside that sealed campaign. Once opened, it may
inform only a future discovery phase; any later optimization or readiness claim requires a new sealed
protocol receipt and final package.

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
infrastructure outage remains visible as missing evidence rather than a model-quality regression. The
campaign protocol, fixed trial count, run order, threshold, and stopping rule are sealed before the
first result; a failed or missing attempt remains in the denominator. A deliberate prior-trial
file/history/service contaminant is detected before paid comparison, and baseline/candidate trials
start from matched fresh snapshots. Every admitted scenario passes the contract/reference/negative/
alternative audit, and a seeded low-coverage task is quarantined rather than scored. The comparison
reports its precommitted uncertainty interval and treats a delta that does not establish the minimum
meaningful improvement as no win.
The final package digest is recorded, its hidden answers and checks are absent from public/model-visible
surfaces before use, and an exact-answer search leak marks the affected result contaminated. A final
failure denies readiness without becoming optimization input, and an opened package cannot be reused as
final evidence. Human-labelled acceptance records the rubric and whether candidate identity and the
agent's terminal assertion were successfully blinded.

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
among them; the untouched final-test package may grant or deny the resulting readiness claim. Selection
must satisfy item 57's precommitted minimum-delta and uncertainty rule, and no required deterministic
scenario may regress. A positive point estimate that does not establish item 57's minimum meaningful
delta under its uncertainty rule rejects as inconclusive; SkillOpt's raw strict-greater gate is not
sufficient for stochastic Meeseeks trials.
Model-judged scores remain advisory and cannot override a hard failure. Every attempt records artifact
and baseline digests, exact edits, independent-run support, apply/skip status, scenario-level deltas,
cost/latency, uncertainty, and acceptance or rejection reason. Rejected records are promoter-only
evidence, not runtime guidance.

**Done when:** a versioned fixture experiment accepts a seeded general improvement, rejects an
anecdotal, overfitted, or statistically inconclusive edit, rejects an aggregate improvement that
regresses one required scenario, and proves the final-test package was not consulted during selection.
Once opened, that package cannot rescue or revise the candidate inside the sealed campaign and cannot
be rerun as final. If the result later informs discovery, the resulting candidate begins a new
campaign with a new protocol receipt and final package. The staged candidate can be reproduced from
its receipt and still
goes through the ordinary shipped-file version bump and required live tier before release. A failed or
inconclusive experiment closes the item without changing the production path.

### 60. Resolve reviewer evidence before accepting a pass — IMPLEMENTED (0.169.0); REVIEW F6 CLOSED at 0.194.0

**Landed at 0.169.0** in `scripts/evidence.mjs`, applied by `resolveReportEvidence` between
`parseReviewerReport` and `combinePanel` — to every panel report and to the carried report. A
passing citation must resolve inside the exact candidate root to a readable regular file and a
positive, in-range, non-blank line; absolute paths, `..` traversal, directories and symlinks
escaping the root are refused, the last by comparing after `realpathSync`. An entry that does not
resolve becomes `fail` before it can be counted, recorded, pinned or carried; an actionable advisory
whose location does not resolve stops being actionable. The parser stays pure and the line number
stays a locator, with content identity still the durable pin.

Evidence: `test/evidence.test.mjs` (every hostile location in REVIEW F6's list beside a benign
neighbour, including a Windows-shaped citation resolving on a POSIX root) and
`test/driver.test.mjs`'s loop-level pair — a unanimous report citing `does/not/exist.ts:999999`
cannot reach the ship effect, while a report citing a real line still ships.

**No paid live check is due for this slice.** `templates/reviewer-system.md` and the reviewer output
contract are unchanged; the repair is entirely on the Driver's side of the parse. If this is later
batched with item 40, item 40's own contract change carries the tier-3 requirement.

**What it was for, as originally written:**

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

### 61. Conjoin Claude process and envelope success — IMPLEMENTED (0.179.0); REVIEW F7 CLOSED at 0.194.0

**Landed at 0.179.0.** `ClaudeResult.ok` now requires a successful shell result *and* a valid
non-error envelope. `ShellResult` gained `overflowed`, so the output cap is a distinct kind rather
than something a caller has to infer from the absence of a timeout — the cap is the dangerous one,
because valid JSON emitted before 64MB survives inside the truncated stdout and parses cleanly. A
failed envelope is read only for usage and the exhaustion signal, never for its `result` text, and
guard denials stay visible on every path.

Evidence: `test/driver.test.mjs` (nonzero, signal, timeout and overflow each carrying a valid success
envelope; usage still recorded; denials preserved; exhaustion carried; and the three benign
neighbours — ordinary success, `is_error: true`, and unparseable stdout);
`test/integration/spawn-claude-failure.integration.test.mjs`, which drives the production `shell`
against real stand-in processes for each kind including a genuine 70MB flood; and the **mandatory
tier-3 run**, recorded in `HANDOFF.md`.

**On the earlier block.** This item sat unstarted for one session because the tier-3 requirement was
read as an unauthorised expenditure. It is not: the operator's Claude Max subscription covers the
live tier. The rule that *did* hold is the one worth keeping — a change to `spawnClaude` is a change
to a contract owned by another binary, and unit tests over the array you build say nothing about what
the callee does with it.

**Problem solved:** `spawnClaude` can reinterpret a failed process as a successful role result when
failed stdout contains a success-shaped Claude envelope.

Preserve distinct timeout, output-overflow, signal/nonzero-process, and envelope-error outcomes.
`ClaudeResult.ok` requires both a successful shell result and a valid non-error envelope. Failed
stdout may contribute bounded diagnostics and usage accounting but never role authority. Share the
termination/failure representation with F2 instead of adding another parallel state machine.

**Done when:** unit and tier-2 cases keep nonzero, signal, timeout, and overflow failures failed even
with a valid success envelope; normal success and `is_error:true` keep their meanings; and the
mandatory paid tier-3 check observes the production `claude -p` contract. REVIEW F7 closed this at 0.194.0.

### 62. Bind the Oracle store to one run and one PRD — IMPLEMENTED (0.171.0); REVIEW F8 CLOSED at 0.194.0

**Landed at 0.171.0.** `.meeseeks/oracle.json` is now archived with its run (`PER_RUN_ARTIFACTS`),
carries the item-66 specification digest it was authored from, is written temp-and-rename, and is
ignored along with `.meeseeks/oracle-scratch/`. `readOracle` refuses a store authored from another
revision or recording none, and executes no case when it does; the Driver authors fresh whenever
there is no store *for this specification*, saying so when it replaces a foreign one. PRD-only,
no-tools authoring is untouched.

Evidence: `test/oracle.test.mjs` — foreign digest, absent digest, caller with no digest, refusal to
write an unattributable store, the matching benign neighbour, `oracleMatchesSpecification` across
every unusable shape, no case executed on a mismatch, no temporary left behind, a half-written
temporary never accepted, archival moving the store, and the ignore stanza covering both paths.

**What it was for, as originally written:**

**Problem solved:** `.meeseeks/oracle.json` currently survives previous-run archival, so a new
objective can reuse held-out cases written for an old PRD.

Give the store explicit current-objective identity. Prefer archiving the prior store and authoring a
fresh one from the current PRD; exact PRD-digest reuse is acceptable only if independently proved and
does not expose cases to implementation roles. Write atomically, fail closed on corruption, include
the store in item 63's machine-state boundary, and preserve PRD-only/no-tools Oracle authoring.

**Done when:** different sequential PRDs cannot share cases; the previous store is archived with its
run; interruption cannot produce accepted partial JSON; and target `git add -A` cannot stage the
store. REVIEW F8 closed this at 0.194.0.

### 63. Make the machine-state Git boundary positional — IMPLEMENTED (0.178.0); REVIEW F9 CLOSED at 0.194.0

**Landed at 0.178.0.** `MEESEEKS_IGNORED_PATHS` is now `.meeseeks/*`, `!.meeseeks/config.json` and
`*.log`. `.meeseeks/*` rather than `.meeseeks/` is load-bearing: git will not descend into an
excluded directory, so a negation for a child of one is inert. Retiring the enumeration made seven
imports in `driver.mjs` unused, which is what a list being the only consumer of a name looks like.
The tests that asserted the list now assert the position, including an artifact nobody has invented
yet, and `test/driver.test.mjs`'s capability-ownership wording follows the implementation.

Evidence: `test/integration/machine-state-ignore.integration.test.mjs` materialises every current
writer plus two future artifacts in a real repository, runs `git add -A`, and proves only
`.gitignore`, `README.md` and the deliberate `config.json` carve-out stage — with the three
artifacts F9 named, and the held-out oracle scratch inputs, among the things that do not. It also
covers the blanket-`.meeseeks/` neighbour that must not be rewritten and the older enumerated stanza
that must be repaired. **Staging, not `git check-ignore`**: that command exits 0 when a *pattern*
matches, and a negation is a pattern, so it reports the carve-out as ignored.

**Recorded for Codex rather than quietly resolved.** The `config.json` carve-out and `DESIGN.md`
§3.5's tracked-state refusal point in opposite directions: `git add -A` stages `config.json` in a
target that does not otherwise ignore `.meeseeks/`, and the *next* preflight then refuses the
repository because Meeseeks tracked its own state directory. F9 asks explicitly to keep the
operator-edited config trackable, so this slice preserved it. Whether the settings belong in the
deliverable is an operator-owned product decision, and closing it either way is outside a repair
that was asked to keep the carve-out.

**What it was for, as originally written:**

**Problem solved:** a filename enumeration omits current Driver artifacts and makes every future
artifact trackable until somebody remembers to extend the list.

Ignore everything under `.meeseeks/` by position while explicitly carving out the operator-owned
`config.json`, or derive equivalent rules from one authoritative artifact registry if Git platform
semantics require it. Correct the test that calls `capabilities.json` operator-owned. This is a Git
history boundary, separate from the write guard, but the ownership classification must agree.

**Done when:** an integration fixture materializes every current state writer plus an unknown future
artifact, runs `git add -A`, and proves only the deliberate config carve-out may stage across
supported platforms. REVIEW F9 closed this at 0.194.0.

### 64. Record every terminal run outcome atomically — IMPLEMENTED (0.189.0; reopened and repaired at 0.196.0; the at-most-once latch corrected in the 0.208.0 candidate, item 109); REVIEW F10 open pending Codex

**Problem solved:** paid pre-loop and outer-exception aborts can leave no `outcome.json`, and the
existing direct overwrite can destroy the only terminal receipt on interruption.

Define the durable run-start boundary and route every terminal return after it through one shared
atomic writer. Record only known phase, state, spend, and reason; never invent unavailable usage.
Failure to write the receipt is loud but must not rewrite the terminal decision already reached.

**Done when:** PRD, Oracle, component, unexpected post-lock, budget, and ship paths each leave one
correct parseable receipt; interruption leaves a complete old receipt or no accepted receipt, never
truncated JSON; and component fail-closed behavior is unchanged. REVIEW F10 owns closure.

**What landed (0.189.0).** The writer moved to `scripts/outcome.mjs`, is atomic (temp plus rename),
and is at-most-once per run.

**The run-start boundary is winning the lock.** An invocation becomes a *run* there, and from that
line every non-crash exit routes through `releasing`, which files the receipt before giving the
repository back. That is the same positional argument the guard hook uses: the previous "one door"
was one door into `driveRun`, so a failed PRD child, an unreadable declaration, an Oracle that would
not parse, a component that aborted, and an unexpected post-lock exception each printed `ABORTED`
and left nothing durable — on paid paths, where a parent component correctly fails closed on a
missing receipt and its operator then cannot recover the child's state or spend from the artifact
that promised both.

**At-most-once is load-bearing, not tidiness.** The loop's own `finish` and the outer exception
handler can both be reached on the way out of one run; the first answer written is the decided one,
so a generic `ABORTED` cannot overwrite a specific `SHIPPED`.

**Unknown fields are omitted, not zeroed.** A pre-loop abort has no iteration count and no panel
identity; `0` and `null` would state facts the run never established, which is what F10 means by not
inventing unavailable usage. Spend is `preLoop`'s real total.

**Evidence.** `test/outcome.test.mjs` covers the writer: at-most-once, omission of unknowns, spend
when known, directory creation, no temp file left behind, replacement of a truncated receipt from
the old in-place writer, and — the interruption property from the outside — a failed write leaving
the **previous complete receipt** intact rather than half of one, failing loudly rather than
skipping when the process can write to a read-only directory.
`test/integration/outcome.integration.test.mjs` drives the real `main`: a failed design phase leaves
a parseable ABORTED receipt naming the phase and the spend, the deliberate `--confirm-prd` stop is
recorded as a stop rather than a crash, a run that reaches the loop keeps the loop's own answer, no
temp file survives a real run, and a second run replaces the first's receipt rather than
accumulating. Verified red: removing the pre-loop write fails the design case.

**One test updated rather than worked around.** `test/driver.test.mjs`'s positional rule — every exit
in the lock-owned region returns through `releasing` — anchors on the helper's signature, which
gained the terminal argument. Its own benign-neighbour scan was updated with it, so a rule that
matched nothing still cannot pass.

### 65. Prove and enforce Windows descendant cleanup — OPEN (REVIEW F11)

**Problem solved:** Windows timeout cleanup currently terminates the `shell:true` wrapper without
establishing that its application children and grandchildren are gone.

Implement a bounded Windows process-tree termination path shared with F2's lifecycle contract.
Preserve grace then force, guaranteed settlement, and bystander safety; do not weaken the existing
POSIX process-group path.

**Done when:** a Windows tier-2 fixture starts a shell, application, and grandchild and proves all
three disappear within the bound while an unrelated process survives; POSIX cleanup and successful
health probes remain green. A POSIX-only result cannot close REVIEW F11.

### 66. Bind the run to an immutable specification revision — IMPLEMENTED (0.170.0); REVIEW F12 CLOSED at 0.194.0 and reopened against `3debe73`; the delivery half is item 118

**Landed at 0.170.0** in `scripts/specification.mjs`. The Driver captures the canonical revision
after the PRD commit and before the Oracle, design, Builder or Panel reads it, recording file,
digest and size in `.meeseeks/specification.json` — archived and ignored with the rest of the
per-run state. The capture returns its own bytes, so `requiredIds` derive from the digested
document. `driveRun` checks the working copy against that revision before the gates and again before
a ship, and refuses to start at all without a way to check; drift ends the run `ABORTED` naming both
digests and asking for a new run, and nothing is repaired or reverted.

Evidence: `test/specification.test.mjs` (digest sensitivity to one byte, fail-closed reads, the
same-id text mutation, deletion, and the benign neighbours — other files, and a differently named
specification), `test/driver.test.mjs`'s loop-level suite (drift before gates spawns no gate and no
panel; drift at the ship boundary withholds the ship; an unreadable revision aborts; the clean case
still ships; a missing effect refuses), and
`test/integration/specification.integration.test.mjs` (a real Builder child rewriting `PRD.md`
through the real `main`, beside one that rewrites everything else and proceeds).

**Still owed to F12 by later items:** giving Panel and terminal receipts the canonical revision as
their *input* rather than only checking the working copy is item **85**'s reviewer-supply contract,
which PLAN already sequences after this item. **REVIEW F12 closed this at 0.194.0.**

**What it was for, as originally written:**

**Problem solved:** Builder can change `PRD.md` under stable requirement IDs and have Panel judge
the changed finish line.

Capture canonical specification bytes/digest before Oracle and design work. Every role input,
requirement set, review record, and terminal receipt names that revision. A later working-copy
mutation either refuses as unauthorized drift or ends the run with an operator-facing request to
start a deliberately revised objective; it is never an ordinary Builder edit.

**Done when:** same-ID text mutation cannot reach Panel or `SHIPPED`; an approved new revision
starts new Oracle/review evidence; non-authoritative product documentation remains editable; and
the digest is checked at the role and terminal boundaries in REVIEW F12.

### 67. Prevent silent deterministic-gate roster shrink — IMPLEMENTED (0.190.0, reopened and repaired at 0.198.0; the reader's remaining holes closed at 0.217.0, item 119); REVIEW F13 open pending Codex

**Problem solved:** the legacy `frontendOnly` predicate can remove a quality gate when current-tree
markers disappear, bypassing the run's fixed declared capability set.

Replace it with the `web-ui` capability policy and make every roster removal explicit. A
detected-only capability may have a finite cold-reviewed declassification path; it may not vanish
because one detector returned false on a later tree.

**Done when:** declared UI work retains its quality gate through marker deletion, detected-only
removal is visible and independently justified, temporary experiments do not create permanent
unsatisfiable gates, and roster-diff tests cover both directions.

**What landed (0.190.0).** `frontendOnly` is gone. `impeccable` is armed by the `web-ui` capability
like every other conditional gate, so there is now **one** arming vocabulary instead of two. The
run's capability set is monotonic *within a run*: `resolveCapabilities` unions the architect's fixed
declaration, the current detection, and everything the run already established, read back from the
manifest.

**Why the old flag was the whole defect.** The declared set was already unioned and monotonic — the
finding says so. `frontendOnly` bypassed it by asking `hasFrontend(dir)` about the *current tree* on
every gate pass, so a builder deleting `index.html` deleted the gate that judged its design work,
with no skipped-gate record and no memory that it had ever applied. Correct primitives, wired
around.

**A lapse is named rather than absorbed.** `resolved.lapsed` is what the run established and the
detector no longer sees. It is recorded in `capabilities.json` and announced once — once, not per
gate pass, because a warning repeated every iteration is one an operator learns to scroll past.

**The escape, designed before the enforcement, as `CLAUDE.md` requires of a monotonic property.**
`capabilities.json` is now a per-run artifact, so the set is monotonic *within* a run and re-resolved
by the next one. Without that, a project that genuinely stopped being a web UI would carry an
unsatisfiable design gate forever — a temporary experiment made permanent. A new run re-resolves
from the architect's fresh declaration against the captured specification, which is finite and
independently made, and the previous run's manifest is archived rather than overwritten, which is
the durable evidence. Archiving it is independently right for the same reason the specification and
the oracle store are archived: it describes one run's resolution.

**Evidence.** `test/capabilities.test.mjs` covers the union, the lapse report, the growth direction,
the declared capability that never lapses, and an unreadable manifest reading as nothing established
rather than as a failure. `test/integration/capability-monotonicity.integration.test.mjs` drives the
real `main`: the architect declares only `cli`, the tree shows `index.html`, the builder deletes it,
and `web-ui` stays armed, is recorded as lapsed, and is announced exactly once — then a second run
over a tree that genuinely has no UI resolves without it, with the first run's manifest archived.
Verified red by removing the established union.

**Codex reopened this at 0.194.0, and the defence I wrote was the defect.** `establishedCapabilities`
returned `[]` for an absent manifest *and* for a corrupt one, justified by the claim that a run which
had lost its manifest already failed closed at `readDeclaredCapabilities` — and **nothing in the
driver calls that function.** So a truncated or damaged manifest silently answered "nothing
established", and a detected-only capability whose marker had also gone would drop its gate: the
exact shrink this item exists to prevent, arriving through its own repair.

**Repaired at 0.198.0 by separating two facts that are not the same.** An **absent** manifest is the
first iteration's honest answer and yields `[]`. A manifest that is *there* and cannot be read is
refused — an unreadable record of what this run established is not evidence that it established
nothing. The same distinction the run lock draws between a missing lock and an unparseable one, and
the same one F32 draws between a report that is gone and one that is nameless.

One case keeps `[]` for a file that exists: a manifest with no `capabilities` key predates 0.190.0
and genuinely established nothing under this rule. That is an upgrade path, not a fallback.

### 68. Seal Panel verdicts to an exact workspace identity — IMPLEMENTED (0.172.0); REVIEW F14 CLOSED at 0.194.0 and reopened against `3debe73`; the materialized subject is item 120

**Landed at 0.172.0.** `driveRun` captures `workspaceHash`'s identity after the gates and before the
first reviewer, rechecks it after every panel, immediately before the commit and once the commit has
landed, and records it in `review.json` and `outcome.json`. Drift discards the verdict and commits
nothing; drift found after the commit banks the work but withholds the deploy and the tag. An
unhashable tree never matches, and `driveRun` refuses to start without a way to identify the
workspace.

**The existing hash was reused only after its boundary was proved**, as this item required:
`test/integration/gate-cache.integration.test.mjs` now covers deletion, symlink retarget and a
dangling symlink alongside the tracked-edit, untracked-addition and ignored-state cases it already
had. Evidence for the seal itself: `test/driver.test.mjs`'s suite (a writer at each of the four
boundaries, an unidentifiable tree, the recorded identity, the missing effect, and the ordinary ship)
and `test/integration/workspace-seal.integration.test.mjs`, which drives `driveRun` against a real
repository with the real hash while a canned reviewer writes into the tree it is reviewing —
tracked edit, untracked addition, deletion and symlink retarget, beside an ignored-state write that
must not fire and an ordinary iteration that ships.

**Race/component landing** already re-enters this loop through the main tree, so its verdicts are
sealed by the same capture; nothing in the race path commits under a panel of its own.

**Problem solved:** `git add -A` after Panel can commit bytes that appeared after reviewers read
the tree.

Capture a complete workspace identity after gates, verify it through Panel, and reject any drift
before commit. Prove the resulting clean commit corresponds to that identity before deploy/tag;
record it in review and outcome artifacts. Reuse the existing workspace hashing only if its
tracked/untracked/symlink semantics cover the candidate boundary exactly.

**Done when:** a background writer during every reviewer timing window cannot smuggle tracked,
untracked, deleted, or symlink bytes into the passing commit; races/components still receive fresh
main-tree verification; and the exact reproduction in REVIEW F14 cannot ship.

### 69. Decide and enforce the Oracle confidentiality claim — IMPLEMENTED (0.209.0 candidate, item 110): the claim is narrowed, the answer-key leak that made the narrowed claim false is closed, and both are pinned. REVIEW F15 open pending Codex

**Problem solved:** Builder can read the exact `oracle.json` cases despite “held-out” language.

First run a paid synthetic canary through a real Builder using `Read`, Bash, and Builder-launched
code. If the existing sandbox can establish a full read boundary without breaking target work,
enforce and live-test it. Otherwise rename the guarantee to “not supplied adversarial cases,” make
the limitation prominent, and do not score Oracle as confidential independent evidence. A hook-only
denial is insufficient when arbitrary code can read the same path.

**Done when:** either every measured read path is denied at the actual execution boundary, or docs,
terminal policy, and eval interpretation consistently state the narrower guarantee. The Oracle
author and Panel remain independently contextualized.

### 70. Make test reports fresh, successful, and attempt-bound — IMPLEMENTED (0.173.0); REVIEW F16 CLOSED at 0.194.0

**Landed at 0.173.0.** `gateTree` clears the toolchain's declared report paths before every attempt,
and `scripts/reports.mjs` reads back only regular files present afterwards — so absence means the
attempt produced nothing, and a directory or symlink at a report path is refused rather than
followed. The scoped restore now reads its verification gate's result before reading anything it
produced; a unit gate that failed or did not run has verified nothing and the run falls through to
the whole-tree reset.

Evidence: `test/reports.test.mjs` (clear-then-collect, a missing report named rather than silently
dropped, directory and symlink refusals, and the cleared-and-not-rewritten case) and
`test/driver.test.mjs`'s scoped-restore suite — the exact reproduction, a report-less verification,
a passing verification whose test did not come back, and the benign restore that holds.

**Note on the wording of the finding.** "Unique attempt identity" was implemented as *clear then
require presence* rather than as per-attempt paths, which the finding offers as the alternative and
which needs no toolchain change; the mixed-attempt case is closed by construction, because a path
present after a clear cannot be a previous attempt's.

**Problem solved:** reused report paths and an ignored verification-gate result let stale passing
bytes confirm a failed scoped restore.

Use unique attempt identity for every expected report (or clear prior artifacts before launch),
require the corresponding gate to succeed, and reject missing, mixed-attempt, non-regular, or
wrong-tree output. Scoped restore verification must check the unit result before reading.

**Done when:** failed/crashed/timed-out/report-less gates cannot reuse prior evidence; mixed unit/e2e
attempts refuse; the stale-report reproduction falls through to the full reset; and report
provenance survives archive/restart inspection.

### 71. Bind current ratchet credit to the current test definition — IMPLEMENTED (0.191.0; reopened and repaired at 0.195.0; the unscoped exemptions closed in the 0.208.0 candidate, item 109); REVIEW F17 open pending Codex

**Problem solved:** path/title identity survives an assertion rewrite, so weakened tests inherit
credit earned by different bytes.

Retain the append-only historical ID fact, but attach current credit to a defining-file digest.
A changed definition must regain current RED/sensitivity and cold-review evidence through an
explicit strengthening path; it must not silently inherit. Decide formatting-only treatment with a
deterministic normalization or conservatively revalidate.

**Done when:** same-name assertion changes are detected, legitimate strengthening can regain credit
without deleting history, and a weakened replacement cannot ship on its predecessor's ratchet
identity.

**What landed (0.191.0).** `state.json` gains `definitions`: a digest of each credited test's
defining file, recorded when its ids earned credit. `changedDefinitions` names the ids whose file is
no longer the one that earned them, and `unprovenIds`/`redEvidenceGate` stop treating those ids as
exempt from red evidence.

**The shape is the finding's third bullet, and it decides everything else.** "This id once passed"
and "this definition protects the behaviour" are separate facts. `passing` stays append-only and is
never rewritten, so a changed definition is **not** removed and **not** a regression — it just loses
the permanent exemption `previousPassing` used to grant to a *string*. It must be observed failing
again before it earns current credit, which is also the legitimate-strengthening path: strengthen
the test, see it red, be credited. No new mechanism, no deletion of history.

**Formatting policy, decided rather than guessed** (F17 asks explicitly). The digest is over **raw
bytes**. A normaliser would have to decide which edits are cosmetic, and that decision is
unrecoverable in one direction: mistaking a semantic change for formatting silently preserves credit
for a weakened test, which is the defect itself. Raw bytes err the other way, and the cost is one
re-observation per file a formatter touched — credit is *withheld*, never failed or reset.

**Unknown and unreadable read as changed**, because neither is evidence that the bytes on disk are
the bytes that earned the credit. That also makes the upgrade honest: a `state.json` written before
0.191.0 has no digests, so its ids are observed once more and then credited. A malformed
`definitions` map is dropped rather than throwing — it is an additional fact about credit, losing it
costs one re-observation, and refusing to run would strand a repository on a field that did not
exist a version ago.

**Evidence.** `test/ratchet.test.mjs` runs Codex's reproduction — the same id, a replacement
definition — and proves it is detected while `passing` and the advance decision are untouched; plus
the whitespace-only case that pins the formatting policy, the unknown/unreadable cases, and the
digest merge that keeps a file whose tests did not run this iteration. `test/driver.test.mjs` proves
the exemption rule directly and that red evidence re-credits a changed definition. Verified red by
restoring the unconditional `previousPassing` exemption.

**Codex reopened this at 0.194.0, correctly, and the reason is the lesson.** `gateTree` computed a
definition-aware credited set and returned it; the `gates` effect returned only `{ ok, results }`,
so `driveRun` **discarded it**, re-derived its own passing set from the reports, and advanced on
that. Every helper test was green while the production loop applied none of it — the same shape as
the guard hook, which was correct for eleven versions with nothing proving it was invoked.

**The reopening also exposed a second, older inertness.** `unprovenIds` is where RED-before-GREEN
"actually bites", per its own docstring — and it, too, was only reached through `gateTree`'s
discarded set. So the loop banked ids that had never been observed failing at all. Both are fixed by
the same move.

**Repaired at 0.195.0** by applying the rule where banking happens. Both advances — Phase 4's early
bank and Phase 6's commit-recording one — now take the credited set. Regressions are still computed
from `passing`, so a withheld id is never read as a regression: it passed, it simply has not earned
credit, and treating its absence as a loss would hard-reset the tree over a working test.

**Four fixtures needed the first-gating baseline a real gate run writes.** An injected `gates` double
never calls `recordRedEvidence`, so those tests were asserting early banking *and* accidentally
asserting that an unproven id gets banked — the defect next door. The harness now takes an explicit
`seedRed`, which states what a real gate run would have established.

### 72. Conserve every child result in budget accounting — IMPLEMENTED (0.174.0); REVIEW F18 CLOSED at 0.194.0

**Landed at 0.174.0.** The Oracle author is charged through `chargePreLoop` before its output is
parsed, so its spend reaches `alreadySpent` and every ceiling downstream. The parallel Panel charges
every settled envelope in array order and *then* adjudicates in declared order against the
per-index cumulative answer — identical decisions, nothing uncharged, and no later reviewer gaining
verdict authority from having been charged.

Evidence: `test/driver.test.mjs` — REVIEW F18's reproduction now reports exactly **160 tokens and
$6.01**, beside a success path that does not double-charge; and
`test/integration/spend-conservation.integration.test.mjs`, which drives the real `main` with a
distinct sentinel per phase and balances `.meeseeks/outcome.json` against the sum of every envelope
handed out, with and without the Oracle, plus a ceiling case proving pre-loop Oracle spend now stops
a run before it pays for a builder.

**On `handedOutUsd`:** it is `main`'s running total across pre-loop *and* loop children, while
`driveRun`'s progress is the loop's total seeded with `alreadySpent`. With both holes closed the two
are the same ledger reached from two ends rather than two opinions; the integration test asserts
that balance end to end. Unifying them into one object is a refactor this finding does not require
and item 76's acceptance receipt is the natural place for it.

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

### 73. Bound allocation for decision-bearing artifacts — IMPLEMENTED (0.192.0; reopened and repaired at 0.197.0; three unbounded callers closed in the 0.208.0 candidate, item 109); REVIEW F19 open pending Codex

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

**What landed (0.192.0).** `scripts/bounded-read.mjs` holds one policy table and two operations,
and the split between them is the design: a file whose **contents** become evidence is refused above
its limit, and a file that is only **hashed** has no limit and is streamed.

**Refused, never truncated.** `stat` first so the allocation is avoided, then the same check again
after the read, because `stat` failing while `read` succeeds is a race rather than a licence. A
truncated report parses to fewer tests and a truncated document reads as a shorter one; either would
be evidence nobody produced, which is the laundering the rest of this project exists to stop. The
refusal names the artifact and both sizes.

**Hashing has no limit, deliberately.** `workspaceHash` read every tracked file whole purely to
digest it, on the decision path, every iteration. It streams now — a 64KB buffer regardless of file
size — and the digest is byte-identical to the old one, so no workspace identity changes and no gate
re-runs. Bounding it instead would make identity, and therefore the gate cache and the F14 verdict
seal, unavailable on a repository that is merely big: a worse failure than the one being fixed.

**Bounded now:** the specification (operator-supplied and prompt-bound), test reports (written by a
gate the *target* controls, which is what makes "arbitrarily large" reachable), reviewer-cited
evidence files, and the F17 definition digest. Limits are stated as values rather than described, so
an edit that quietly drops one to a reachable size fails a test rather than an overnight run.

**Evidence.** `test/bounded-read.test.mjs` covers under, exactly-at and one-byte-over, the
unmeasurable path that only the post-read check catches, refusal-not-truncation, the async variant,
the limit values themselves against the largest committed fixture, and the streaming digest agreeing
with a whole-file digest for a file larger than any read limit. `test/reports.test.mjs` proves an
oversized report lands in `irregular` rather than being parsed short. Verified red by restoring the
unbounded report read.

**Codex reopened this at 0.194.0 on two counts, both correct.**

*The bound was checked, not enforced.* `readBounded` stat'd and then read the whole file, so a file
that grew between the two — or one `stat` could not size at all — was fully allocated before the
refusal. The acceptance criterion is specifically *fails before full allocation*, and a check after
the allocation is not that. It now reads into a buffer of exactly `limit + 1`: one byte over is
enough to know, and no more than that is ever held. `readBoundedAsync` delegates to it rather than
keeping a second whole-file path that could drift.

*Three first reads were still unbounded.* The pin source reread (target-controlled, decision-bearing,
the same class as a report) and `specification.json` (driver-owned, but under `.meeseeks/` in a
repository the operator also edits, and parsed on the decision path every iteration) are bounded now.

**The allocation bound is asserted positionally, and that is stated rather than hidden.** From
outside, a whole-file read that refuses afterwards and a bounded read that refuses at the ceiling
look identical — both throw. So the test scans the function's source for the whole-file read and for
the buffer size, the way `test/driver.test.mjs` scans the lock-owned region rather than trying to
observe a leaked lock. The behavioural half — growth race, unmeasurable path, exact reported size,
whole-file fidelity and a multi-byte character straddling a read boundary — is tested normally.

**The terminal-evidence half needs nothing new.** Item 64 already routes every post-lock exit through
one atomic receipt, so a refusal that ends a run is recorded with its phase by construction — which
is why this item listed 64 as its prerequisite.

**Codex reopened this at 0.194.0 on two paths, both correct.**

*The ordering was contradictory the moment `releasing` started writing.* Archiving ran **after** the
launch check, on the reasoning that a refused launch should disturb nothing — but a refusal now
files its own `outcome.json`, so it overwrote the previous run's receipt before anything could
preserve it. Repaired by archiving before **any** receipt is written, from wherever the exit is
taken, rather than by moving one call: every early exit had the same problem. An archive failure
inside that path is reported and does not change the terminal state already decided; the ordinary
path still refuses to *start* on a failed archive, where continuing would destroy the evidence.

*Pre-loop exceptions escaped both the receipt and the lock.* Required-plugin provisioning sits
before the loop's own `try`/`finally`, so a throw there ended a paid run with no `outcome.json` and
gave the repository back only because the process exited. Routed through `releasing` like every
other pre-loop exit.

**Still outstanding, and named rather than implied:** only the provisioning path is wrapped. A throw
from another pre-loop `await` still escapes, because the general fix is a `try` around the whole
pre-loop region and that is a structural change this slice did not take. Recorded so the next
reviewer does not read the two repaired paths as the whole class.

### 74. Require repository-contained reporter identities — IMPLEMENTED (0.175.0); REVIEW F20 CLOSED at 0.194.0

**Landed at 0.175.0** in `scripts/reporters/shared.mjs`, so both reporters inherit it from the one
place ids are constructed. Containment is proved lexically and, when the path exists, through
`realpath`; drive-qualified and UNC prefixes are refused by shape on every platform; a nonexistent
generated path is accepted on the lexical rule alone as a stated policy; and the returned id stays
the lexical relative path, so no existing identity changed.

Evidence: `test/reporter-paths.test.mjs` (the vitest reproduction and its Playwright equivalent,
traversal, drive-qualified, UNC, case-variant root, the root itself, an empty name, symlink escape
and its in-repo neighbour, an unresolvable root, and the deterministic-identity set — spaces,
Unicode, padded filenames, separators, absolute-inside, and a nonexistent generated path) and
`test/integration/reporter-paths.integration.test.mjs`, which clones a real repository and proves
every banked identity is a file the clone contains, refuses a real outside file, refuses the
*origin's* copy when the clone is under review, and refuses a whole report over one bad record.

**Coordination with item 71** (F17's definition digest) landed later: this item establishes that the
accepted path is contained, and item 71 binds it to the definition receiving current credit. REVIEW
F20 closed this path at 0.194.0; REVIEW F17 remains open on the later definition-byte repair.

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

### 75. Validate the real installed plugin snapshot before release — IMPLEMENTED (item 111): the candidate is installed the way a loader installs it, offline and isolated, and interrogated. REVIEW F21 open pending Codex

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

### 76. Persist a complete exact-tree acceptance receipt — PARTIAL (0.210.0, item 112; the verifier made strict and given a production caller at 0.223.0, item 125): the clean-clone traversal and per-gate attribution have not landed. REVIEW F22 open

**Problem solved:** archived `SHIPPED` state and Panel records do not preserve which deterministic
checks passed on which exact bytes.

Extend item 64's atomic terminal receipt rather than creating another terminal authority. Reuse
item 66's spec revision, item 68's candidate tree seal, item 70's gate-attempt/report identities,
and item 72's conserved usage ledger. Record the required gate roster and per-gate status,
command/config/tool identity, bounded output/report digest, Oracle/deploy result, ratchet revision,
Panel-record digest, and terminal transition. For every Claude role invocation, also record the
requested model and effort, the observed per-model usage identifiers, and the role-supply receipt
from item 77. Requested selectors and observed models are separate fields. Represent observation as a
tagged `observed` value with identifiers or an explicit `unavailable` value with reason; a missing
or malformed receipt field makes the receipt incomplete. An explicit unavailable value may preserve
forensic completeness only when policy does not require an observed-model match. It cannot satisfy a
model-identity gate, attribution, or matched comparative claim and is never filled from config. Store
a sanitized interpretable
config projection or referenced immutable policy digest; never raw environment values or unbounded
logs.

Make the receipt a typed, versioned assertion rather than an unlabelled bag of digests. Bind one
explicit acceptance claim type to an immutable subject (candidate tree plus resulting commit when
available), and separate its resolved inputs—specification, policy/config, plugin/Driver/CLI, gate
roster, and review artifacts—from the claim's results. A verifier rejects an unknown schema or claim
type and any subject mismatch. This borrows in-toto's useful subject/predicate separation and SLSA's
input/result distinction; it does not claim SLSA conformance, require signatures, or add an
attestation framework.

**Done when:** a clean-clone auditor can traverse one `SHIPPED` receipt to every required
same-tree acceptance edge; absent and failed gates remain distinct; stale/mixed/wrong-tree evidence
cannot complete the receipt; archived receipts remain interpretable after config changes; requested
and observed model identities expose a forced substitution while an absent observation stays explicit;
an unknown schema, claim type, or subject fails closed; and synthetic secrets do not appear. REVIEW
F22 owns closure.

### 77. Record and enforce the cold-role supply boundary — IMPLEMENTED (0.201.0)

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

**What landed (0.194.0), and what did not.** `scripts/role-supply.mjs` holds the input-class
vocabulary, the per-role deny policy and the sanitized manifest; `spawnClaude` refuses a forbidden
class **before** the spawn and returns the manifest with the result. The cold Panel declares its
supply. That is the boundary and its record.

**What 0.201.0 added, which is the half that was inert.** Three of the four constrained roles
declared *nothing* — `oracle-author`, `builder` and `security-escalation` had policies with no
declaring call site, so their rules were enforced only if a caller opted in. That is the guard-hook
shape exactly: correct logic that nothing proved was invoked, with every unit test green throughout.
All four now declare, and the manifest is archived.

`scripts/role-supply.mjs` gained `supply.json`, a durable per-run store written atomically — temp
file, rename — and added to `PER_RUN_ARTIFACTS`, because nothing resets it and a second run would
otherwise append its invocations beside the first's indistinguishably, which is the fault
`assumptions.json` is on that list for. **It records, it does not decide:** nothing in the loop reads
it back, and no gate result, ratchet state or verdict may depend on it. An unreadable store is moved
aside under a findable name and the fresh one opens with a `lapse` entry saying so — a store that
quietly started over would be worse than a missing one, because a verifier counting invocations
cannot tell "nothing was recorded" from "nothing happened". A write failure is reported and does not
end the run: this is evidence for an acceptance receipt, not a decision.

**The manifest is built in two places on purpose.** `spawnClaude` refuses, because it is the door
*every* child passes through including a component's. `runChild` builds and records, because it is
the door every child *in the loop* passes through and the only one that knows where this run's state
lives. `roleSupplyManifest` is pure, so the two constructions cannot disagree — and the tier-2 test
below is only possible because of the split: an injected `spawn` replaces the whole of `spawnClaude`,
so a record built there is invisible to exactly the test that would prove the threading.

**Design notes worth keeping.** The check sits at `spawnClaude` for the reason the context budget
does: every child passes through one door, so a phase added later cannot forget it. The policy is a
**deny** list per role, not an allow list — an allow list silently forbids each class somebody adds
later, and that failure shows up as a role starved of something it needs rather than as a refusal.
A role with no policy entry is unconstrained, because inventing prohibitions for the
builder-facing phases would enforce a rule nobody stated. The manifest records class, digest and
byte count and **never the bytes**: a verifier holding the assembled prompt recomputes every digest,
and storing them again would make the record a second copy of the thing it describes.

**And what it does not claim.** Only the deliberate prompt and brief channel. A reviewer with tools
can still open any file in the candidate; F15 / item **69** owns that, and describing this as
preventing a role from *reading* something would be writing `not supplied` as though it were
`driver-owned` — the exact confusion `AGENTS.md` warns about.

**Evidence (0.201.0).** `test/integration/role-supply.integration.test.mjs` drives the real `main`
with canned children and asks the durable record what each role was given — asserted against the
**policy table** rather than a list written in the test, so adding a constrained role adds its
obligation automatically instead of leaving it silently unthreaded. It also proves the record
describes the prompts without repeating them, binds each invocation to the specification revision it
was held to, and is archived rather than appended to by the next run. Verified red by removing the
oracle author's declaration. `test/role-supply.test.mjs` adds the store's own cases: append rather
than replace, no temp file left behind, and the lapse entry when the previous store cannot be read
or came from a schema this build does not know.

**Evidence (0.194.0).** `test/role-supply.test.mjs` offers **every** forbidden class to **every**
constrained role from the policy table itself, so adding a rule adds its hostile case automatically; the benign
neighbours prove each allowed class still arrives, that the builder keeps the history the panel may
not have, and that an unconstrained role stays unconstrained. `test/driver.test.mjs` proves the
refusal happens with **zero** children spawned, that an allowed supply returns a manifest which does
not repeat the prompt, and that an undeclared caller is unchanged.

### 78. Retire the inert `styleModel` without breaking configuration silently — IMPLEMENTED (0.193.0); REVIEW F23 CLOSED at 0.194.0

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

**What landed (0.193.0).** `styleModel` is gone from `defaultConfig`, from the validated model keys,
and from `run.json`'s `models` map. It is still **accepted** — `DEPRECATED_CONFIG_KEYS` keeps it out
of the unknown-key refusal — and `loadConfig` prints one line at startup saying it is ignored and
naming `prdModel` as the control that exists. Type validation still applies: accepted is not
unvalidated.

**Why it is accepted rather than removed.** Rejecting it outright makes strict validation refuse a
config that works today, turning a documentation defect into a broken target. The window is the
whole repair: the key changes nothing and now *says* so, where silence is what created the false
control.

**Not repurposed, deliberately.** Narration stays the deterministic `style.mjs` layer and bare
`/meeseeks` keeps sending idea invention and PRD authoring through `prdModel`. Inventing a model
call to justify an existing setting is how a false control becomes a real one.

**Evidence.** `test/config.test.mjs` covers the defaults no longer emitting it, an existing config
being accepted without it leaking into the active config, a wrong-typed legacy value still being
refused, the notice naming `prdModel`, a clean config producing no notice, and — as an absence — that
nothing was wired up to consume it. The DESIGN §10 table row now records the retirement rather than
the gap.

### 79. Expose the existing `--confirm-prd` checkpoint in the shipped command — IMPLEMENTED (0.193.0); REVIEW F24 CLOSED at 0.194.0

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
loading or argument-passing contract. REVIEW F24 closed this at 0.194.0.

### 80. Make the supported `/meeseeks` command user-invocable only — PARTIAL (0.203.0): the control and its contract tests landed; the installed-loader canary is batched with items 79 and 75

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

**What landed (0.203.0).** `disable-model-invocation: true` is in the shipped frontmatter, and the
command says in its own body what the control does and does not claim: it governs **Skill
selection**, and it is not an authentication boundary against a process that already holds arbitrary
Bash and the path to `driver.mjs`. Writing that down is not decoration — F25 is explicit that its
closure must not become a false global launch-authentication claim, and a reader who finds only the
field will assume the stronger thing. `claude plugin validate` accepts the command. The contract
tests reject the absent, `false`, commented and inverted spellings, and refuse `user-invocable`
outright because it reads alike and enforces the opposite policy. Verified red by flipping the field
to `false`.

**Not yet done:** the paid pinned-CLI canary against the staged installed snapshot, which proves the
*loader* honours the field rather than that the file states it. Batched with items **79** and **75**
as F25 itself directs, because a separate release campaign for one probe is the cost that finding
was written to avoid. `PARTIAL` for exactly that reason.

**Done when:** command-contract tests fail if the field is absent, false, or confused with
`user-invocable`; `claude plugin validate` accepts the versioned command; a paid pinned-CLI canary
shows the installed command is absent from the model's invocable Skill surface while a direct user
invocation still loads it and reaches a deliberately safe preflight refusal; the canary records the
actual CLI/plugin identities; and an unsupported or unobservable control fails acceptance rather
than falling back to prompt wording. REVIEW F25 owns closure.

### 81. Bind preflight and document phases to declared repository changes — IMPLEMENTED (0.166.0; last clause closed in the 0.208.0 candidate, item 109); REVIEW F26 open pending Codex

**Landed at 0.166.0** in `scripts/launch.mjs`, wired into `main` immediately after F1's run lock.
`revalidateLaunch` reuses preflight's clean-tree, positional tracked-state, non-production remote,
effective-config, agent-surface and requested-sandbox checks and reports every failure at once; a
refusal names the observed HEAD and writes nothing. Each pre-loop document phase commits an
enumerated path list, and the allowlist is **read from the template that declares it**
(`<!-- meeseeks:declared-outputs ... -->`) rather than restated in a script — which also keeps
`PRODUCT.md` out of every shipped script, as `test/capabilities.test.mjs` requires. Provisioning is a
separate commit with no template contract. `.meeseeks/launch.json` records HEAD, check names and
verdicts, and each phase's declared and staged paths, bounded and free of contents or check
sentences. Evidence: `test/launch.test.mjs` and `test/integration/launch.integration.test.mjs`
(dirty tree, production remote, unsafe agent surface, hostile PRD and design neighbours, the benign
full conditional design output, and a source rule that no pre-loop phase uses `git add -A`). The
requested-sandbox refusal is proven at tier 1 with an injected probe, because whether `bwrap` exists
is a property of the machine running the suite.

**Still outstanding:** `commitPhase()` does not propagate failed `git add` or `git commit` results,
and the provisioning caller ignores its boolean. A failed pre-loop commit can therefore be recorded
as admitted/committed and let the loop continue on the wrong provenance. REVIEW F26 owns closure.

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

### 82. Enforce role tool availability, not only tool approval — IMPLEMENTED (0.204.0); REVIEW F27 open pending Codex

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

**What landed (0.204.0), and it was measured before it was written.** `PHASE_PERMISSIONS` now carries
`availableTools` beside `allowedTools`, and `claudeArgs` passes `--tools` — `""` for the oracle
author, the exact declared set for every other non-builder role, and **no flag at all** for the
builder, which stays deliberately unrestricted. `--strict-mcp-config` goes with it, because inherited
MCP servers are a second availability surface the table never described.

**The reproduction, live, against `claude` 2.1.234 on 18 August 2026.** Three children in a temp
directory holding one sentinel file:

| argv | outcome |
| --- | --- |
| `--safe-mode` alone (the shipped oracle-author shape) | **read the file and printed the sentinel** |
| `--tools ""` | no tools at all; it emitted tool-call syntax as prose and never got the sentinel |
| `--tools Read --allowedTools Read` | read the file, so the flag is not merely breaking children |

That first row is the finding: an empty approval list is not an empty toolset, because read-only
tools need no approval. The author runs whenever the store is missing, which includes a **resumed**
tree with the implementation already present — so the only held-out gate in the design was free to
write its cases against the code.

**Evidence.** `test/live/role-tools.live.test.mjs` is the canary: the oracle author cannot reach the
sentinel, a `review` child can read that same file — the neighbour that keeps the first case from
being satisfied by a broken child — and a `review` child cannot write, asserted against the
filesystem rather than against what the child said about it. Red against the disabled control, green
with it. `test/driver.test.mjs` pins the argv: the empty-string spelling, the exact set per phase, the
untouched builder, `--tools` before the variadic `--allowedTools`, and the coherence rule that no
role may approve a tool it cannot reach. `test/live/oracle-contract.live.test.mjs` now invokes
`oracle-author` rather than `review`, because a contract test aimed at the wrong role proves the
wrong contract — which is how this survived.

**Live-tier flake, recorded rather than re-run away.** `improve-contract.live.test.mjs`'s "returns a
grounded, bounded PRD" failed once with zero requirements, then passed twice. Two of three. It is
model variability in a document-authoring prompt, not the tool policy — the same phase passes with
the restriction in place — but a pass on re-run does not erase the failure.

**Not claimed:** this bounds the *built-in* surface through the flag the CLI documents for it. It is
not proof that a child cannot reach anything by other means, and `--safe-mode` remains a
customization control rather than a tool set.

### 83. Enforce a measured Claude Code compatibility policy — PARTIAL (0.205.0): the policy and its fail-closed parse landed; sealed binary identity has not

**Problem solved:** preflight currently accepts any executable whose `claude --version` exits
successfully, even though Meeseeks relies on versioned flags, settings, hooks, command/Skill
controls, tool-availability semantics, and envelope fields. The repository has already observed
2.1.136 missing `--safe-mode`; a callable but incompatible PATH shadow can therefore fail only
after an unattended run has started work. A greater version is not proof of compatibility either:
official [setup documentation](https://code.claude.com/docs/en/setup) says a background update takes
effect on the next CLI launch, and a Meeseeks run launches many separate children. Official
[headless documentation](https://code.claude.com/docs/en/headless) also says `-p` will eventually
adopt bare-mode defaults that currently change discovery and authentication.

Establish one canonical compatibility policy from pinned Claude Code releases that pass every
mandatory live command and child contract used by the staged candidate. Record the oldest
demonstrated floor and highest demonstrated compatible release or deliberately tested range; do not
guess either boundary from one feature or semantic-version ordering. If historical releases cannot be
tested safely, begin with the exact versions actually verified and expand only with evidence. Keep the
policy in one runtime source. Parse ordinary decorated `claude --version` output and refuse older,
newer-but-unverified, prerelease-ambiguous, or malformed values before state creation, child spawn,
target-content write, or install. Report the detected and admitted values plus a pin/install repair;
never auto-upgrade.

At the Driver-owned run boundary, resolve one canonical real invocation path, content fingerprint,
and reported version. Capture the fingerprint before and after each compatibility probe so the probe
cannot silently establish evidence for a target it replaced. Every later Driver-owned Claude probe
and role executes that sealed path rather than performing another PATH lookup. Item **56**'s explicit
control set disables background auto-update for every Driver-owned Claude invocation, including
compatibility probes and roles. Immediately before each role spawn, re-resolve the canonical target,
recompute its fingerprint, run the version check under the sealed controls, and confirm the
fingerprint again. A same-version byte replacement, symlink retarget, version change, or missing
target refuses before the next role; a child cannot redirect or upgrade later roles into a different
contract. Record that binary/CLI identity in the run and release evidence; item **76** binds it and
each invocation's requested/observed model identity into the acceptance receipt.
Identity is install-form-specific. A native executable may be one fingerprinted artifact; a symlink,
script, or package launcher must also bind the measured delegated entrypoint or package identity whose
mutation changes invoked code. If that mutable invocation closure cannot be bounded and live-proven,
the compatibility policy refuses that install form rather than recording an approximate seal.

A version comparison is only an early compatibility gate. Items **75**, **80**, and **82** still
own their installed-loader, command-surface, and role-tool behavior canaries. Item **54**'s documented
workflow minimum is only one input and cannot substitute for the whole contract suite. Item **56** may
land its environment allowlist independently, but item 83 cannot close until the auto-update control is
sealed and live-proven.

**Done when:** unit tests cover a missing executable, below/equal/inside/above-policy stable versions,
ordinary decorated output, prerelease output, and malformed output; an integration fixture puts a
known-old synthetic binary first on PATH and proves refusal before any run mutation or network install;
a second fixture inserts a hostile PATH shadow after sealing and proves the next role still uses the
sealed path; a third atomically replaces the target with byte-different content reporting the same
version, a fourth retargets a symlink, and a fifth keeps launcher bytes/version stable while replacing
its delegated entrypoint or package identity. All refuse before the next child while preserving the
complete check report. Every Driver-owned Claude probe and role receives the
no-background-update control, operator values cannot override it, and a live canary covers the admitted
discovery/authentication behavior, including any later bare-mode transition. Pinned paid live runs at
every admitted compatibility boundary pass the same staged installed candidate's full
`npm run test:live`, including the item **75**, **80**, and **82** canaries, and record exact canonical
target, invocation-closure fingerprints, CLI, settings, and plugin identities. README, DESIGN,
preflight output, and fixtures name the same
policy; expanding either boundary without the complete live suite fails. REVIEW F28 owns closure.

**What landed (0.205.0).** `scripts/claude-compat.mjs` is the single runtime source: a floor, a
ceiling, and the evidence for both. `checkClaudeCli` parses `claude --version` and refuses below,
above, prerelease and unparseable, naming the executable it actually resolved — `command -v claude`,
because a version complaint about "claude" is unactionable on a host with three of them — and
printing the measurements the bounds come from.

**The bounds are a record, not a constant somebody liked.** F28 is explicit that inventing precision
would be no better than the absent check, so the floor is **2.1.226**, the oldest release with live
measurements in this repository, and the ceiling is **2.1.234**, the newest release whose full live
tier passed. 2.1.136 is cited as *recorded incompatible* — no `--safe-mode` — which is why the true
floor is unknown and the demonstrated one is named instead. A test requires every bound to appear in
the evidence list. Item **107** records the attempted 2.1.235 widening and why it was not admitted.

**Refusing forward is the uncomfortable half and is deliberate.** A greater version number is not
evidence of compatibility, and the CLI documents a coming bare-mode default for `-p` that would
change authentication under a run. A version ceiling is a monotonic property, so its escape was
designed before its enforcement, exactly as `AGENTS.md` requires: run `MEESEEKS_LIVE=1 npm run
test:live` against the newer CLI and move `VERIFIED_THROUGH` in one commit with the evidence. Without
that escape the next background auto-update would brick every run on the host.

**Evidence.** `test/claude-compat.test.mjs` covers below, equal, inside, above, decorated output,
prerelease, malformed and non-string. `test/integration/claude-compat.integration.test.mjs` puts a
real executable named `claude` first on a real `PATH` and drives the real `runPreflight` with the
real `defaultProbe`: the old binary refuses, the refusal names the resolved path and prints the
evidence, a newer one refuses with the widening instruction, a wrapper that prints a banner refuses,
and an in-range binary passes — the neighbour, without which a gate that refused everything would
score the same. Five of seven go red with the policy disabled.

**Recorded honestly:** the refusal happens before any *run* state, but preflight does scaffold
`.meeseeks/config.json`, which is its own documented job. The first draft of the test asserted no
`.meeseeks` at all and failed; asserting the artifacts that mean a run began — lock, run manifest,
receipt — is the property that is actually true.

**Not yet done, and named rather than implied.** The sealed-identity half: fingerprinting the
canonical binary at the run boundary, re-resolving and re-fingerprinting immediately before each role
spawn so a mid-run PATH shadow or same-version byte replacement refuses, binding a launcher's
delegated entrypoint, and suppressing background auto-update through item **56**'s control set. A
version check alone does not establish that the binary a later role resolves is the one preflight
measured. `checkClaudeCli` also runs only `claude --version`, which succeeds without proving
non-interactive authentication; closure must add a measured fail-fast auth capability check or narrow
the preflight guarantee explicitly. `PARTIAL` for those reasons.

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

Resource isolation is a separate claim. Current Claude Code sandbox documentation specifies
filesystem and network controls, not CPU, memory, process-count, disk-space, or workspace-growth
quotas. Inventory the effective limits visible to the child and record each as enforced, merely
available, or absent; never call filesystem isolation a resource ceiling. Any exhaustion canary must
be bounded inside an operator-provided disposable environment that already has a known outer quota.
Do not test a fork bomb, disk fill, or uncontrolled memory pressure on the operator's ordinary host.
A future portable quota mechanism remains parked unless this measurement or a real run demonstrates
the need and a cross-platform boundary can be stated truthfully.

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
constrained, disabled, or named as outside the guarantee. The evidence also names the observed CPU,
memory, process-count, disk, and workspace-growth posture without inferring a quota from sandbox
registration; absence remains an explicit negative guarantee. An unavailable sandbox, ignored key,
denied required domain, unsandboxed retry, or unsupported auto-mode combination is diagnosed
before—or settles without—unbounded work; benign Builder behavior and the independent review
boundary remain intact; and the evidence supports one of three explicit outcomes: adopt a
portable stronger default, offer a capability-gated profile with truthful limitations, or reject the
change and retain R19. No outcome is inferred from vendor marketing or a single successful child.

**Capability boundary:** a successful containment experiment establishes where a child can connect;
it does not authorize every resource reachable through that connection. Any later authenticated
external source or effect uses item **106**'s separately sealed, job-scoped capability and receipt.
Neither a role nor an external server may convert tool availability, network reachability, or its own
annotations into authority.

### 85. Keep candidate instructions out of reviewer authority — PARTIAL (0.206.0): the authority boundary and the pre-Panel rescan landed; the supply trust-class report and the paid canary have not

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

**What landed (0.206.0).** Two halves, because F29 asks for both and either alone is defeated.

**The prompt.** `templates/reviewer-system.md` no longer tells the panel to read the target's
`CLAUDE.md` and treat its rules and referenced documents as *binding*. It now states that the
specification and the reviewer prompt are the only authorities, that every file in the repository is
evidence and none of it is authority, and that a file asking the reviewer to change how it audits is
**a finding, not a rule**. This is a boundary on authority, not on reading: "Open anything" is
explicit, and a document contradicting the code is still the fastest route to a real finding — that
is how a previous audit convicted a builder, and it still works. `AGENTS.md` is deliberately *not*
named among the examples, because a reviewer may never be told an agent wrote the code and a filename
in its own prompt is that tell.

**The mechanism.** A prompt is a discipline; a hostile hook is a mechanism. `driveRun` rescans the
agent surface against the **exact tree it is about to review** — after the F14 seal, before the first
reviewer — and blocking findings end the iteration with those findings as the builder's next
objective. It defaults to the *real* scanner rather than to a no-op, and a scan that throws is a
refusal: an effect that silently means "no scan" when a caller omits it is a gate that defaults to
pass.

**Why the rescan is needed at all.** Preflight scans once, before the run; the builder then edits the
tree for hours. `test/integration/reviewer-authority.integration.test.mjs` proves exactly that
ordering against a real repository — the same tree passes the door and fails afterwards, with nothing
in between but a written file.

**Evidence.** `test/driver.test.mjs` drives the loop over a real temporary tree with the real scanner
— no scanner double, because a doubled scan proves the double: a hostile `CLAUDE.md` and a hostile
`.claude/rules/*.md` both stop the panel, a throwing scan stops it, and an ordinary project with a
benign `CLAUDE.md` is reviewed normally. Three of the four go red with the rescan disabled; the
benign one stays green throughout, which is what keeps this from being a scan that stops everything.
`test/templates.test.mjs` asserts the authority frame, the report-it-as-a-finding instruction, the
removal of the binding-documents sentences, and that the reviewer is still told to read the
repository.

**Not yet done, and named rather than implied:** item **77**'s supply report does not yet distinguish
*trusted instruction*, *untrusted candidate evidence* and *disabled ambient customization* as trust
classes; the scan result is not bound to item **68**'s reviewed-tree identity as a recorded artifact;
and the pinned paid hostile/benign reviewer-calibration canary has not been run. A scan is a
known-pattern defense, and nothing here claims immunity to arbitrary prompt injection.

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

### 87. Treat normalized flaky tests as a failed deterministic gate — IMPLEMENTED (0.176.0); REVIEW F30 CLOSED at 0.194.0

**Landed at 0.176.0**, after items 70 (0.173.0) and 74 (0.175.0) had established the fresh attempt
and the contained report identity this decision consumes. Reports are parsed once, before anything
scores or logs a gate, and collapsed across every accepted report by worst status; any remaining
`flaky` id adds one deterministic failed `test-stability` result naming the ids sorted and bounded to
twenty with the remainder counted. `skipped`/`todo` are untouched, a previously ratcheted id turning
flaky still takes the regression/reset path, and RED-before-GREEN history is unchanged.

Evidence: `test/stability-gate.test.mjs` — the **real committed Playwright fixture** collapsed into
genuine `flaky` and `passed` ids, turned into a failed gate that names them and not the skipped
neighbours, plus the bounding and sorting rules; and `test/driver.test.mjs`'s loop-level suite — a
newly flaky test with every command gate green reaches neither Panel nor ship, a clean expected
report still ships, a skipped neighbour still ships, a pass-in-one-report/flaky-in-another id
resolves to flaky, and an already-ratcheted id turning flaky still takes the regression path.

**Item 67 still owes this a place in the non-shrinking roster**, as PLAN's dependency edge says; that
is item 67's slice.

**Problem solved:** Playwright reports a test that failed and then passed on retry as `flaky`, while
the runner can still exit zero. Meeseeks correctly excludes that status from ratchet credit but does
not currently fail the iteration for a newly flaky id. With no earlier ratchet identity to regress,
that unstable result can accompany green command gates into Panel and `SHIPPED`.

Land this after items **70** and **74**, which establish the fresh attempt and contained report
identity the stability decision consumes. Parse each accepted report once, collapse duplicate ids by
worst normalized status, and add one deterministic failed `test-stability` result whenever any id is
`flaky`. Bound and sort the reported ids so Builder receives a stable repair objective. Preserve the
existing stronger behavior when a previously ratcheted id becomes flaky: it is still a regression and
reset, not merely a new gate failure. Observing flakiness may satisfy RED-before-GREEN history, but it
never supplies current passing evidence. Item **67** must include this required result in its
non-shrinking gate roster once armed.

**Done when:** the committed real Playwright fixture with a successful runner exit and mixed
passed/flaky records fails the iteration before Panel; a clean expected fixture passes; skipped/todo
neighbours retain their existing semantics; duplicate pass+flaky records resolve to flaky; a prior
ratcheted id still takes the reset path; bounded failure evidence names the exact attempt/report
identity from items 70/74; and unit plus integration coverage proves no `SHIPPED` path can ignore a
normalized flaky result. REVIEW F30 closed this at 0.194.0.

### 88. Fail-closed Git publication and exact committed-tree identity — IMPLEMENTED (0.180.0); REVIEW F31 CLOSED at 0.194.0

**Landed at 0.180.0.** The commit effect requires `git add`, the staged-change lookup, `git commit`
and `rev-parse HEAD` each to succeed, with its own bounded diagnostic, and distinguishes *nothing
staged* — an ordinary iteration where the builder changed nothing — from a failure rather than
inferring one from the other. Both tag operations are required. A new `verifyPublication` effect
asks git whether the tree it holds is the tree that was reviewed: `HEAD` readable and the worktree
clean after the commit. `driveRun` requires that effect, routes its failure through the ordinary
non-shipping path, and turns a failed ship into `ABORTED` rather than letting it escape as a stack
trace.

Evidence: `test/integration/workspace-seal.integration.test.mjs` — a real `git commit` refusing
because the index lock exists when it runs, a failed staging step, an unwritable tag, a commit that
leaves a reviewed path behind, and the benign neighbour where commit, seal, deploy and tag converge
on a clean tree. **The fixture now commits through production `shell` rather than `execFileSync`**,
which is the specific reason this file could not catch the hole it was written to guard: the throwing
call made the ignored-result branch unreachable.

**Original statement:**

**Problem solved:** the ship path runs `git add`, `git commit` and both tag operations without
requiring any of them to succeed, then reads `HEAD` and can return the *pre-existing* commit as the
candidate. F14's seal only rehashes the working tree, so after a failed commit the working bytes
still match the reviewed identity while `HEAD` names an older tree that does not contain them — and
deploy and tag then publish that older tree under a `SHIPPED`.

Require success from add, commit, the commit lookup and every tag operation, each with its own
bounded diagnostic. After the commit, prove the published state corresponds to the sealed reviewed
workspace: the worktree must be clean at publication and the sealed hash must still match. Route
every failure through the existing non-shipping terminal path; an unchanged `HEAD` is not made
acceptable by a matching workspace hash. `test/integration/workspace-seal.integration.test.mjs`
commits through `execFileSync`, which *throws*, so it cannot exercise production `shell` semantics
where a failed command returns a result the caller must inspect — the fixture must use the real
runner.

**Done when:** a real-Git fixture makes commit fail after staging and proves deploy, tag and
`SHIPPED` are unreachable; add, commit, lookup and tag failures keep distinct diagnostics; and the
successful neighbour proves the published commit, sealed workspace identity, deploy input, tag and
terminal receipt all converge. REVIEW F31 closed this at 0.194.0.

### 89. Refuse uncleared report paths before they can be banked — IMPLEMENTED (0.181.0); REVIEW F32 CLOSED at 0.194.0

**Problem solved:** `clearReports` already returns the paths it could not remove, and the Driver
logs them and runs the gate anyway. `collectReports` then accepts any regular file at a configured
report path, so a locked or otherwise unremovable old passing report becomes this attempt's
evidence when the command exits zero without replacing it — the exact laundering class item 70 was
built to close, re-entering through the branch item 70 did not treat as a failure.

Treat every uncleared configured report path as a failed attempt before any report-consuming
authority is assigned, refusing collection for that attempt even on a zero exit, and name the stuck
paths in bounded diagnostics. Preserve successful cleanup and the no-report neighbour without
weakening item 70's attempt identity.

**Done when:** unit coverage forces removal failure and proves the survivor cannot be parsed or
banked; a real-filesystem integration case proves an exit-zero gate cannot relabel it fresh; and the
ordinary replace-and-collect path stays green. REVIEW F32 closed this at 0.194.0.

**What landed (0.181.0).** `collectReports` takes the clear's outcome as a **required argument**,
binds it to the paths being collected (a path the record does not account for is uncleared, so an
outcome for another set cannot satisfy the signature), and refuses the whole attempt when any
declared path is stuck — structural rather than a rule each caller must remember, because
enumerating call sites is how the guard hook's original defect worked.
`gateTree` records the outcome per gated tree (a raced candidate clears its own paths, and one
candidate's locked file must not withhold the main tree's evidence), skips the inline parse and the
`recordRedEvidence` write entirely on a stuck path, and emits the `report-freshness` gate first in
the result list. `readTestReports` fails closed on a tree with no recorded clear. The ratchet's
`reject` objective now carries the failing gates, so a refused attempt tells the builder which gate
explains the empty collection instead of sending it after the runner — the same shape as dogfood
run 6.

**Two judgements worth naming.** Refusal is whole-attempt, not per-path: ids collapse across reports
by worst status so a survivor adds uncontradictable passes, and dropping only the stuck path hands
the ratchet a set missing every id that path owned, which reads as a mass regression and resets the
tree. And nothing report-derived runs at all on a refused attempt, because `recordRedEvidence`
establishes its baseline exactly once — an empty baseline frozen from a refused attempt would leave
every later test permanently unproven.

**One defect the finding did not name, found by adversarially reviewing the repair.** `gateTree`
read the declared report paths itself, with `existsSync` plus `readFileSync` — which **follows a
symlink** — while everything downstream read them through `collectReports`, whose `lstat` refuses
one. Two report-consuming authorities over one artifact, disagreeing inside a single attempt, and
the one that followed the link was the one that writes red evidence. The hand-rolled reader is
deleted; `gateTree` now collects through the same function as everybody else. Verified red against
the unrepaired driver by `never lets a symlinked report path reach red evidence`.

**Evidence.** `test/reports.test.mjs` forces a *real* removal failure (a read-only parent directory,
which is what POSIX has instead of a Windows locked handle), asserts the survivor is a readable
regular file whose ids `extractTestIds` would have banked, and proves collection refuses it; the
partial-stuck, benign-reclear, absent-outcome and malformed-outcome cases go with it.
`test/report-freshness.test.mjs` covers the gate result. `test/integration/report-freshness.integration.test.mjs`
drives the **real `main`** — real git, real `gateTree`, canned children — with a genuinely
unremovable report path and an operator gate that writes a real passing vitest report and exits
zero, and proves the gate fails by name, the stuck path is named, `red-evidence.json` is never
written, no id is banked, and the second builder brief names `report-freshness`; the benign
neighbour admits the identical report and records its id.

**Which cases were confirmed red first, stated precisely** — an earlier draft of this entry claimed
"both", which was false and was caught by review. Confirmed failing against the unrepaired driver:
the unit laundering case (the stale passing report was returned as evidence) and the two hostile
integration cases (`report-freshness` never reached the roster; the symlinked path reached red
evidence). The benign neighbours pass before and after by construction — that is what makes them
neighbours, and they are there to prove the refusal is narrow, not to prove the defect.

**What is deliberately not covered.** F32's Windows locked-file bullet says "where available", and it
is not: the only host is WSL2, which is the same platform gap item **65** / F11 owns. POSIX governs
`unlink` by the parent directory's write bit, so a *surviving readable regular file* can only be
produced here by making the parent read-only — which cannot be done to a live `.meeseeks/`, because
the run must keep writing its state there. Tier 1 therefore owns the readable-survivor shape and
tier 2 owns the composition. The two permission-dependent cases **fail rather than skip** when the
process can unlink from a read-only directory, on the same argument that arms the live tier by
environment variable; the symlink case needs no permissions, so a root environment still proves the
driver-side composition.

Tier 1 **2522 pass / 0 fail**, tier 2 **120 pass / 0 fail**. No tier 3: nothing here touches
`spawnClaude`, `claudeArgs`, `childSettings`, envelope parsing or a template's output contract.

### 90. Keep process cleanup off concurrent sibling children — IMPLEMENTED (0.185.0); REVIEW F33 CLOSED at 0.194.0

**Problem solved:** the Panel starts reviewers under `Promise.all`, and every `shell` call snapshots
the process-group population *before* its own spawn and later kills group members absent from that
snapshot. Reviewer A can snapshot before B and C exist, so A timing out or overflowing sweeps its
legitimate siblings as leaked descendants — one reviewer failure manufacturing failures in the cold
reviewers whose independence is the point. The existing bystander test starts the bystander *before*
the snapshot, so it proves preservation of an older process and not of a concurrent sibling.

Scope cleanup to the invocation's own descendants or an owned group, or otherwise exclude active
sibling children, without restoring the orphan leak F2's initial repair addressed. F2 remains open
for the distinct no-timeout output-cap path recorded above.

**Done when:** a tier-2 test starts two concurrent real `shell` calls where the first times out after
the second is born, and the second survives and completes while the first child and its descendants
are gone; reversed order and the overflow path exercise the same rule; and the Panel still combines
completed results in declared reviewer order. REVIEW F33 closed this at 0.194.0.

**What landed (0.185.0).** Nothing is detached — that was measured and rejected, because a detached
gate stops receiving the operator's Ctrl-C — so every child and grandchild shares the driver's one
process group and membership alone cannot separate one call's orphan from another call's healthy
child. The sweep keeps its subtraction and now excludes the **subtree of every `shell` call still in
flight**, from a module-level registry of live child pids. The asymmetry is what makes it work: the
sweeper's own child is dead by the time it sweeps, so its orphans have been reparented and cannot be
identified by parentage — but every sibling it must protect is by definition alive, so a sibling's
subtree reads straight out of `ps` at the moment of the sweep.

**A first attempt was wrong and the existing suite caught it.** Sampling the sweeper's *own*
descendants while its child lived looked more precise and broke F2: the measured leak shape is
`sh -c 'thing & echo'`, where the shell exits immediately, so by the time the ceiling fires there is
no parent link left to sample. Recorded because the wrong design is the more attractive one.

**Evidence.** `test/integration/shell-termination.integration.test.mjs` starts the sibling **after**
the timing-out call's snapshot — the Panel's shape, and the half the old bystander case could not
see, since its bystander predated the snapshot and was protected by subtraction for free. The
sibling completes with its own output while the timed-out call's descendant is gone and is the only
pid reported reaped. The reversed order is asserted as the neighbour. Verified red by removing the
exclusion.

### 91. Make crashed stale-lock arbitration reclaimable — IMPLEMENTED (0.182.0); REVIEW F34 CLOSED at 0.194.0

**Problem solved:** the takeover directory is named from the *stale* lock's token, and item F1's
argument that orphans are inert assumed the stale lock always gets replaced. If the reclaimer dies
after creating that directory and before replacing the lock, the same stale token persists, so every
later contender computes the same path, receives `EEXIST`, and reads it as a live reclaimer. Nothing
can clear it. One killed recovery turns a reclaimable stale lock into a permanent denial of service.
`test/run-lock.test.mjs`'s "benign orphan" case uses a *different* token and therefore assumes
exactly what fails.

Give the takeover claim its own verifiable, reclaimable owner identity and liveness rule, or use an
atomic primitive whose abandoned state is safely distinguishable. Preserve exactly-one-winner and
prevent a late reclaimer from deleting a newer owner's lock or claim.

**Done when:** a tier-2 fault-injection test kills the reclaimer between arbitration and replacement
and proves a later cohort still has exactly one winner; live-contender and benign-orphan neighbours
stay distinguishable; and token mismatch and delayed cleanup cannot clear the winner. REVIEW F34
owns closure.

**What landed (0.182.0).** The takeover claim is a *file* carrying the reclaimer's pid and token,
created with the same exclusive `wx` primitive the lock uses, so serialization is unchanged and the
artifact can say who holds it. A claim naming a **dead** process is abandoned and swept by an atomic
`rename` exactly one contender can win — the sweep needs its own arbitration or it is F1 one level
down — after which that contender retries, under a bounded attempt count that refuses rather than
loops. `releaseTakeoverClaim` removes a claim only when the token is ours, because the sweep makes
replacement legitimate and the old unconditional cleanup would let a straggler clear a newer claim.
Refusals now name the claim path, so even the states that stay refusals have a one-line fix.

**Two states are deliberately not swept**, and both name the path instead: a claim that will not
parse — the microsecond between the exclusive create and the write landing, so it may belong to
something alive — and a *directory*, which only a driver before 0.182.0 can have written and which
may be a live reclaimer of that version. Sweeping either would put two reclaimers on one stale lock.

**A defect in the guarding test, found while repairing this.** `test/integration/run-lock.integration.test.mjs`'s
exactly-one-winner case had contenders that exited the instant they won, so a later contender read a
genuinely dead owner and reclaimed it — correctly. Two sequential winners is the system working, and
the assertion could not tell it from the simultaneous double-take F1 is about. Racing both module
versions under CPU load, 40 rounds of six contenders each: **12 multi-winner rounds on the
pre-0.182.0 module and 2 on the repaired one**, so the flake was pre-existing, load-sensitive, and
hidden by an idle machine — and the repair reduces it rather than causing it. A winner now holds the
lock across the decision window, which puts every loser's liveness check against a live process:
**0 multi-winner rounds on both versions** under the same load.

**A defect this repair introduced, caught by adversarially reviewing it before commit.** Three
independent reviewers found the same thing and it survived both skeptics: `rename` names a *path*,
not the file that was read from it. Between judging a claim abandoned and moving it, another
contender can sweep that same claim and create its own — so the rename lands on a **live** claim,
displaces an owner that never finds out, and puts two reclaimers on one stale lock. That is the
double-take the module exists to prevent, arriving through its own recovery path. The sweep now
reads back the file it moved — a stable handle to the exact bytes, which no path-based check can
give — restores anything that is not the claim it judged, and takes nothing from that pass. A
matching check after a successful claim create stops whichever contender is not holding the claim on
disk. Verified red by removing the guard: the displacement case fails with *"a contender reclaimed
past a live claim it had displaced"*.

Two smaller repairs came from the same review. An **empty** claim — the process died between the
exclusive create and the write — was a refusal, which was a fresh permanent denial of service of
exactly F34's shape reachable through the window this repair opened; it is now swept, because a
synchronous create-and-write can only be observed empty by a process that is gone. And a claim that
vanishes between the failed create and the read is now a retry rather than a raw `ENOENT` naming a
file that no longer exists.

**0.182.0 shipped the mutant, and 0.183.0 is the repair.** A reviewing agent ran its mutation
experiments against `scripts/run-lock.mjs` in the working tree rather than a copy — gutting
`sweepAbandonedTakeover` and adding a debug `process.stderr.write` to `releaseTakeoverClaim` — in the
window between the tier-1 run and the commit. `git add` captured the mutant, so 0.182.0's commit
message describes a guard its code does not contain, and its recorded tier-1 and tier-2 numbers were
measured against different bytes than it shipped. The agent restored the file afterwards, which is
exactly why the working tree looked right and the commit did not.

Three things made it detectable rather than permanent, and they are the reason to keep all three:
the hostile test is genuinely hostile (`does not sweep a live claim that replaced the abandoned one
it read` fails against 0.182.0's module), the mutation left textual fingerprints a grep could find,
and `d9632da` was scannable and proved clean. The structural fix is not vigilance: **a review panel
that performs mutation experiments must run in an isolated git worktree**, so it physically cannot
write to the tree being committed.

**One coverage gap closed after review corrected an overclaim of mine.** An earlier draft here
called the `releaseTakeoverClaim` token guard untestable. That was wrong, and review proved it by
mutation: replacing the body with an unconditional remove left tier 1 and tier 2 entirely green,
*and* the test named for the property — "leaves a live contender's claim alone while refusing" —
never reached the function at all, because acquisition refuses in the failed-claim branch before the
`finally`. A test claiming a property it never exercises is the exact defect family that produced
F31 through F37, and it was mine. The guard is now exported and tested directly, the way
`releaseRunLock` already is, and the test is renamed to what it actually proves. Verified by
re-running the mutation: two of the four new cases fail against it.

**One gap remains, stated rather than papered over.** `rename`-as-arbitration inside the sweep can
be replaced with a plain unlink and stay green: distinguishing them needs two contenders colliding
within microseconds, which no deterministic test here can arrange. The verification that follows the
rename *is* covered, by `does not sweep a live claim that replaced the abandoned one it read`.

**Evidence.** `test/run-lock.test.mjs` adds the reproduction (an abandoned claim written by the
production `claimTakeover`, not a hand-rolled fixture, so the test cannot drift from the format the
code reads), a second stale generation proving the sweep leaves no residue, the illegible-claim,
no-pid and legacy-directory refusals, the bounded-retry give-up, and the live-claim neighbour that
must not be cleared. `test/integration/run-lock.integration.test.mjs` adds the tier-2 fault
injection F34 asks for: a real process takes the real claim through production code, is really
`SIGKILL`ed inside the window, the window is asserted before it is exploited, and a five-process
cohort then produces exactly one winner whose token is the one on disk; the benign neighbour proves
a *live* reclaimer still refuses everybody and the same directory recovers once it is gone.

### 92. Require reproducible existing test definitions before ratchet credit — IMPLEMENTED (0.187.0); REVIEW F35 CLOSED at 0.194.0

**Problem solved:** reporter normalisation falls back to a lexically contained relative path when
`realpathSync` fails, so a runner naming a file that does not exist can still bank a passing id —
and `test/reporter-paths.test.mjs` explicitly asserts that behaviour. Lexical containment closed
F20's external-path half but does not prove the definition is part of the candidate or reproducible
from a clean clone, so the monotonic ratchet can hold credit for a test no checkout can execute.

Require an accepted file-backed identity to resolve to an existing contained regular file before it
earns credit. If a supported runner genuinely emits virtual or generated tests, that needs a separate
reproducible identity and content digest rather than treating a missing file as repository evidence —
**establish which runners actually do this from the committed fixtures rather than assuming.**

**Done when:** nonexistent, directory, symlink-race and deleted-after-report definitions fail closed
without credit; valid contained Windows and POSIX paths keep stable ids; and a clean-clone tier-2
test resolves every banked definition. REVIEW F35 closed this at 0.194.0.

**What landed (0.187.0).** `fileBackedIds` credits an id only when its defining file resolves to an
existing regular file inside the candidate; everything else is withheld and named in the log.
`lstat`, not `stat`, so a symlink at a test path is not a definition the candidate contains — the
same rule a symlinked report gets.

**The check is at the credit boundary, not in the parser, and that placement is the design.** A
report naming a file this checkout does not have is still a *readable report*. Refusing to parse it
would turn a missing definition into a collection failure, and "the runner produced nothing" and
"one of these tests is not in the repository" demand opposite responses — the first resets nothing
and asks the builder to fix the suite, the second withholds one id and leaves the rest standing.
Conflating them is dogfood run 6. So `collected` keeps counting the result and only banking is
withheld.

**The open question this item asked, answered from the committed fixtures rather than assumed.** No
supported runner emits a virtual or generated path: `vitest-4.1.10-run1/2.json`,
`playwright-1.62.1-run1/2.json` and the three `dotnet-8.0.423` TRX files all name real absolute
files on the machine that produced them. So the separate reproducible-identity-and-digest design
F35 contemplates has **no evidence calling for it** and is not built. If a runner ever does emit
one it surfaces as a withheld id in the log rather than as silent credit, which is the honest
failure direction.

**Evidence.** `test/reporter-paths.test.mjs` covers nonexistent, directory, symlink,
deleted-after-report, no-path-component, both separators, and the credited neighbour.
`test/driver.test.mjs` proves the ratchet banks the backed id and not the invented one, and that a
report of entirely unbacked ids is still not read as a collection failure.
`test/integration/reporter-paths.integration.test.mjs` does the clean-clone case against real git:
both ids parse, only the one the clone contains is credited, and a file that exists only in the
origin is withheld. Verified red on both tiers.

**One test corrected rather than kept.** `accepts a nonexistent generated path on the lexical rule
alone` asserted the parser's output while implying the id was therefore acceptable evidence — the
half F35 refused. It now asserts both halves: the id is produced, and credit is withheld from it.

**A harness change that is itself the finding.** `test/driver.test.mjs` seeded no test files, so its
report fixtures named definitions that were not on disk — which after this repair is the forged
case, not the ordinary one. The seeded set now includes the files those fixtures name, because a
harness whose reports describe a tree it did not build is not modelling a repository.

### 93. Preserve guard denials from successful children — IMPLEMENTED (0.188.0); REVIEW F36 CLOSED at 0.194.0

**Problem solved:** `shell` returns an empty `stderr` whenever a command exits zero, and
`spawnClaude` searches exactly that field for `meeseeks-guard: denied` lines. A Claude child can hit
a denied tool call, recover, and exit successfully — and the denial is erased before it can reach the
next brief. The Builder then repeats the denied action with no explanation available, which loses
both progress and the forensic record. `test/driver.test.mjs` injects denial text only through a
*failed* synthetic result, bypassing the production success path entirely.

Preserve bounded stderr for Claude invocations regardless of exit status, or carry denials through a
distinct bounded channel. Ordinary successful stderr must not become styled output or decision
evidence; only the denial signal feeds the brief.

**Done when:** a tier-2 child exits zero after writing a denial line and `spawnClaude` returns success
while preserving it; clean-stderr and failed-envelope neighbours are unchanged; and the mandatory
paid tier-3 guard canary has been run, because this crosses `spawnClaude` and the external CLI
contract. REVIEW F36 closed this at 0.194.0.

**What landed (0.188.0).** A denial travels on its own bounded field of `ShellResult` rather than
being re-derived from `stderr`. `shell` extracts it on **every** exit status; `spawnClaude` reads
`result.denials` and nothing else.

**Why a channel and not "stop discarding stderr on success".** Both halves of the required
resolution have to hold at once. Discarding a successful command's stderr is deliberate — a consumer
that learned to read it would be reading whatever a tool happened to warn about, and every
`npm warn` would become a decision input. But a denied tool call *does not fail a child*: the guard
says no, the model carries on, the process exits zero. So the one message the loop can act on lived
on the one stream that path throws away. A separate field keeps the refusal and keeps ordinary
stderr inert.

Bounded at `DENIAL_LIMIT` lines of `DENIAL_LINE_LIMIT` characters and deduplicated, because this
text reaches a builder's brief: a model that retries a denied call forty times has learned one fact,
not forty.

**Evidence.** `test/integration/guard-denial.integration.test.mjs` runs a **real child that writes a
denial to stderr and exits zero** — the production path the old test could not reach, because it
injected denial text through a *failed synthetic result*, which is that path's opposite. The
ordinary-noisy-stderr neighbour proves nothing else crosses; the failed-child case proves the path
that always worked still does; the caps are asserted against a real stream. `test/guard.test.mjs`
covers `guardDenials` directly. Verified red: removing the success-path extraction fails the
recovered-child case.

### 94. Clean health-probe descendants after the shell leader exits — IMPLEMENTED (0.185.0); REVIEW F37 CLOSED at 0.194.0

**Problem solved:** the probe's `stop` returns after destroying pipes whenever the direct child
already has an `exitCode` or `signalCode`, without signalling the captured process group. A start
command that backgrounds the application and exits immediately therefore fails the probe *and* leaves
the server listening — occupying the assigned port, mutating the workspace and contaminating later
health evidence. This is a POSIX lifetime hole, distinct from F11's unproven Windows cleanup.

Clean the owned process group even when its leader has exited, defending against group/PID reuse
before signalling, and preserve bounded stop behaviour and the long-running-server neighbour.

**Done when:** a tier-2 fixture runs the equivalent of `node server & exit 0`, observes the failed
probe, and proves the background server and its listener are gone; cooperative exit, timeout and
already-empty group settle without killing unrelated processes; and Windows evidence stays owned by
F11/item 65. REVIEW F37 closed this at 0.194.0.

**What landed (0.185.0).** `stop` returned as soon as the direct child had an exit code, on the
reasoning that a dead leader means a dead group. A start command that backgrounds the application
and exits — `node server.js & exit 0`, ordinary in a start script — fails the probe *because* its
leader ended and leaves the server listening on the assigned port. The group is reaped in that
branch too now.

**Members are signalled individually rather than by `-pgid`, and that is the reuse defence.** A
group id is its leader's pid, so once the leader exits `kill(-pgid)` is a bet that nothing has been
assigned that number since. If a live process now holds that pid the id has been reused and this
signals nothing, because killing a stranger is worse than leaking a server; otherwise the remaining
members of that group are the probe's orphans and are killed one at a time.

**Evidence.** `test/integration/health-probe.integration.test.mjs` runs a real `npm start` of
`node server.js & exit 0`, has the server record its own pid and port, asserts the probe fails, and
then asks the operating system — not the probe — whether that pid is alive and whether the port
still answers. The cooperative long-running server is the neighbour. Verified red by removing the
reap.

### 95. Do not read an absent report as a regression when its gate did not produce one — IMPLEMENTED (0.222.0)

**Problem solved:** `reportFiles` is what the toolchain *declares*, not what any gate is armed to
write. `scripts/toolchains/node.mjs` declares `test-report.json` and `e2e-report.json`
unconditionally, while `gate-policy.mjs` arms `e2e` only for `web-ui`/`desktop-ui` — so `missing` is
non-empty on essentially every iteration of every node CLI, library or service, and that is correct
and must stay correct. Item 89's whole-attempt refusal therefore covers `stuck` and **must not** be
extended to `missing` or `irregular`: doing so would make `contents` empty forever, `collected` zero
forever, and no run of a non-UI node project could ever bank an id or ship. That was verified while
reviewing item 89 and is the reason the asymmetry exists — `stuck` can fabricate a pass from bytes
this attempt never produced, `missing` cannot credit anything at all.

The hazard is the other direction, and it is real, pre-existing and reproduced. Once ids from a
report *have* been banked, a later iteration in which that report's gate crashes, times out or is
skipped writes nothing, so those ids are absent from `passing` while `collected` is comfortably
non-zero from the *other* report. `evaluateIteration` rejects only on `collected === 0`, so the
partial set passes the dogfood-run-6 guard and is read as a mass regression; `driveRun`'s reset
branch is unconditional on gate results, so the tree is hard-reset and the iteration's work is
destroyed. It then repeats every iteration, because the verification gate re-runs the same
non-producing gate — a livelock to `BUDGET`, not one lost iteration. Reproduced end to end against
the real `driveRun`: 30 e2e ids reported as regressions, `src/core.js` returned to its previous
content, `repeated regression: ... (2 times)`, run burned to the ceiling. This is fail-closed —
nothing unproven is ever credited and it cannot reach `SHIPPED` — which is why it is an item rather
than a release blocker.

The fix is a different mechanism from item 89's, which is why it is a separate item: a regression
must be attributable. An id whose owning report was not produced this attempt, by a gate that did
not run or did not pass, is **unmeasured**, not regressed; it keeps its ratchet protection and
blocks nothing, and the failing gate is what fails the iteration. Do not weaken the case where the
gate ran, passed and the id genuinely went away.

**Done when:** a banked id whose report was not produced by a gate that did not run is not counted
as a regression and triggers no reset; the same id genuinely failing under a gate that ran and
passed still resets exactly as now; `collected === 0` keeps its existing meaning; and a tier-2 case
drives the real `driveRun` through the reproduced livelock and shows it terminating instead.
Item **89** is a prerequisite (it owns the `stuck` half of the same question).

### 96. Re-verify the publication subject after deploy — IMPLEMENTED (0.186.0); REVIEW F38 CLOSED at 0.194.0

**Problem solved:** publication is verified before ship-time mutation and before the operator's
arbitrary deploy command. After those mutation-capable steps the Driver rechecks only specification
drift, and `ship()` tags implicit current `HEAD` rather than the captured reviewed commit. A deploy
that edits and commits tracked source therefore receives both tags and a `SHIPPED` over bytes no
gate and no reviewer ever saw — F31's false-completion class, one step later in the pipeline.

Revalidate the workspace identity and `HEAD` after mutation and deploy, tag the **explicit** reviewed
commit rather than whatever `HEAD` names by then, and withhold `SHIPPED` on any drift.

**Done when:** real-Git tier-2 cases cover a deploy that creates a commit and a deploy that leaves
uncommitted changes, and neither ships; the clean neighbour tags exactly the reviewed commit and
still reaches `SHIPPED`. REVIEW F38 closed this at 0.194.0.

### 97. Lose takeover arbitration on any post-rename read failure — IMPLEMENTED (0.185.0); REVIEW F39 open pending Codex

**Problem solved:** item 91's sweep treated a failed read of the file it had just renamed as a match
and deleted it. Between the original read and the rename another process can replace the JSON claim
with a **pre-0.182.0 takeover directory**, which `readTakeoverClaim` refuses rather than parses — so
the failure path deleted a live legacy reclaimer's arbitration and let both drivers reclaim one
stale lock, reopening F1 through F34's own recovery path.

**What landed.** Only an exact match is removed: the expected token, or the expected nameless state
for a claim that named nobody. Every other outcome — a read that throws, a file that vanished, a
directory — loses the pass, and the moved file is restored. When restoration is impossible the file
is **quarantined under its swept name rather than deleted**, because an unidentified artifact is not
this contender's to destroy.

**Evidence.** `test/run-lock.test.mjs` replaces the claim with a legacy directory inside the
read/rename window through the `isAlive` seam and proves the directory survives, the lock is
untaken, and the current contender refuses. Verified red against the pre-F39 logic.

### 98. Stop restating the queue in HANDOFF — IMPLEMENTED (0.185.0); REVIEW F40 CLOSED at 0.194.0 and reopened against `3debe73`; the gate that makes it stick is item 121

**Problem solved:** `HANDOFF.md` restated the implementation order and the review counts, and both
went stale — it recorded F7/item 61 as blocked on unauthorised expenditure three sections below its
own table recording F7 implemented and live-validated at 0.179.0, and carried a
seventeen-high/thirteen-medium snapshot the ledger had long passed. A fresh agent would pause
finished work and follow an order nobody holds.

**What landed.** The ordering section is a pointer to `PLAN.md`, which `docs/INDEX.md` already names
as the sole owner of live status; the header stops restating counts and points at `REVIEW.md`; the
F7 sentence says implemented, once. `HANDOFF.md` keeps only the measured state of the tree.

### 99. The slice harness — IMPLEMENTED (no version bump; `tools/` and dev config are not shipped)

**Problem solved:** the slice loop is run by hand — implement, hostile test, red-proof, gates,
version bump, docs, commit — and three defects were introduced by driving it manually on 18 August
2026. Two reached a commit: `git add -A` swept an unrelated untracked directory into a slice, and a
reviewing agent mutated `scripts/run-lock.mjs` between the tier-1 run and `git add`, so 0.182.0
shipped a gutted guard and a debug write while its message described the repair and its recorded
test numbers belonged to other bytes.

All three are the same mistake: **treating a green suite as evidence about the artifact.** A suite
reports what the bytes did when they ran; it says nothing about which bytes get committed.

`tools/slice-check.mjs` fingerprints its covered loader surface, refuses known debugging scaffolding,
runs the gates, **re-fingerprints and refuses if anything moved underneath**, then — in `commit` mode —
stages only named paths, checks the index against the fingerprint, commits from a message file, and
checks `HEAD` against the fingerprint again. `npm run slice-check`. Item 100 records the current
`skills/` omission; the harness must not be described as covering that directory until it does.

**Eval, and it is the point of the harness rather than a note about it.** Re-injecting the exact two
mutants 0.182.0 shipped makes it refuse before a gate runs:
`scripts/run-lock.mjs:359: void shown; void abandonedToken; void token;` and
`scripts/run-lock.mjs:421: process.stderr.write('RELEASE ' + token);`. On the clean tree it passes
60 fingerprinted files, four gates, and the stability check.

**Named paths, never `-A`.** Untracked paths are reported and left alone, which is the other defect.

**It found a defect in itself on first use, which is the argument for running it rather than
reading it.** `execFileSync` defaults to a 1MB output buffer and a full tier-2 run overruns it, so
the harness reported a passing suite as a failed gate. A harness that cannot tell a big log from a
broken gate is worse than none; the buffer is 64MB, the same cap `shell` uses.

**Not shipped, so no bump.** `tools/` is outside the release surface and an npm script is dev config;
`npm run release-check` confirms rather than this asserting it.

### 100. Release gates omit the shipped skill directory — DONE (0.208.0)

`DESIGN.md` §7 and the plugin layout identify `skills/mr-meeseeks/SKILL.md` as an installed plugin
surface, but `tools/release-check.mjs::SHIPPED_PATHS` and
`tools/slice-check.mjs::SHIPPED_DIRS` omit `skills/`. Their tests encode the same omission while
claiming to name every directory the loader reads. A skill-only change can therefore reuse an old
plugin-cache version, and the slice harness will not fingerprint it.

The earlier npm-manifest ambiguity was documentation, not this runtime defect. `package.json` and
`package-lock.json` are release metadata rather than Claude's loader inputs: their version fields
must mirror `.claude-plugin/plugin.json`, but a non-version dev-script edit does not independently
require a new plugin-cache directory. `CLAUDE.md` and `AGENTS.md` now say that explicitly.

**Landed at 0.208.0.** `release-check.mjs` adds `skills/` to its loader boundary.
`slice-check.mjs` now imports that predicate instead of maintaining a second directory list, then
adds only `package.json` and `package-lock.json` to its broader candidate fingerprint. That also
closes the adjacent unrecorded omission of `.claude-plugin/marketplace.json` from the slice
fingerprint. Hostile tests prove a skill file and both plugin manifests are covered while repository
documentation remains outside the loader boundary.

### 101. Bound quality-plugin provisioning — IMPLEMENTED (0.199.0; the discarded timeout verdict fixed in the 0.208.0 candidate, item 109); REVIEW F41 open pending Codex

**Problem solved:** provisioning had no deadline at all. `npx --no-install` resolving a registry, a
`pip install` against an unreachable index, a package manager waiting on a lock another process
holds — any of them can hang, and this runs **before** the loop, before the wall clock the operator
configured, and before anything that would report it. An unattended run started at midnight would
still be sitting there in the morning with no gate result and no receipt.

**What landed.** Detection is bounded at 60s and installation at 10 minutes, and `defaultRunner`
translates the deadline into `execFileSync`'s own timeout so the child is *killed* rather than
merely stopped being waited on. The two ceilings differ because the operations differ: detection
asks a tool already on the machine for its version and is meant to answer instantly; installation
may genuinely download. Neither is a budget anybody should be spending — both are ceilings on a
hang.

**Evidence.** `test/plugins.test.mjs` records the options every provisioning command receives and
asserts the deadline on both the detect and install branches, pins both constants as values so an
edit that drops the install ceiling to the detect one fails here rather than in an overnight run,
and scans `defaultRunner` for the translation — the constant being right is not the same as the
runner honouring it. Verified red by removing the detect deadline.

**It pairs with F10's other half.** 0.196.0 routed a provisioning *throw* through `releasing` so it
files a receipt and releases the lock; this makes a provisioning *hang* become such a throw.

### 102. The mixed-version takeover race — IMPLEMENTED; REVIEW F39 open pending Codex

**What F39 still wanted.** The code repair landed at 0.183.0 — only an exact token or nameless match
is removed, everything else is restored or quarantined — and the deterministic
replacement-with-directory unit test landed with it. The acceptance evidence also asked for a
**mixed-version tier-2 race**, and that was missing.

**Why it needs a fixture rather than a description.** A plugin installs into a version-keyed cache
directory, so an un-updated machine keeps running an old driver against a repository a current one
reclaims. `test/fixtures/run-lock/run-lock-0.165.0.mjs` is that other side, committed **verbatim**
from `git show e38ac8e:scripts/run-lock.mjs` — its takeover claim is an anonymous directory, which
is the whole of F34 and the reason deleting an unidentified replacement mattered. Reconstructing it
in the test would have proved things about the reconstruction, which is the mistake `AGENTS.md`
names about reporter fixtures.

**Four cases.** Three current drivers and three 0.165.0 drivers racing one stale lock, exactly one
winner and the lock on disk is theirs. A legacy directory found at the initial read, refused without
going near the sweep. The window itself: a current contender that has judged an abandoned claim
dead, a real legacy process replacing it between the read and the rename, and the requirement that
the current one **loses arbitration** rather than deleting what it could not read. And the
neighbour, a stale lock with no legacy driver anywhere near it, still reclaimed.

**The first draft of this was theatre and is worth recording.** A pure outcome race — six mixed
processes, assert one winner — passed against the reverted repair, because the window is
microseconds wide and luck never opened it. So the window is *arranged*: the current contender is
handed the module's own documented `isAlive` seam and signals a separate legacy process from inside
it. Every actor stays real and the module under test is untouched; only the moment is chosen. Now it
fails in 128ms against the pre-F39 sweep with "a current driver reclaimed past a legacy claim it had
displaced".

**And long-lived children are killed in `after`.** The first failing run left a waiting process
alive, which kept the runner's event loop up and turned one visible failure into a five-minute hang.
A test that cannot fail *legibly* is barely better than one that cannot fail.

**Evidence.** Tier 2 156 pass / 0 fail, the new cases green on three consecutive rounds and red
under the reverted guard. No shipped file changed, so no version moved.

### 103. The last hole in F10's one door — IMPLEMENTED (0.200.0); the destructive archive refusal is item 122; REVIEW F10 open pending Codex

**What was still escaping.** `driveRun` has its own handler and every pre-loop *refusal* routes
through `releasing`, but an unexpected **throw** between winning the lock and entering the loop left
`main` entirely: no receipt, and a lock left behind by a process about to exit. F10's acceptance
names "unexpected post-lock exception" explicitly. 0.196.0 wrapped the one path that had been
observed to throw — provisioning — which is the enumeration mistake this repository keeps paying
for; the region also holds PRD authoring, design, capability resolution, the Oracle and components,
and every `await` in it can throw for reasons nobody listed.

**A wrapper, not a lexical `try`.** Wrapping the region in a `try` would mean re-indenting some
sixteen hundred lines, dozens of which are multi-line template literals whose contents are prompts —
mechanical re-indentation would silently rewrite what children are told. So the exported `main` is
now a guard around `runInvocation`, and the body publishes its own `releasing` the moment it has
one. The handler calls that same shared writer: archive first, at most once, lock given back. A run
that already decided keeps its answer.

**It is bounded at the lock.** A crash before acquisition rethrows untouched, because nothing owns
the repository yet and a receipt would claim a run that never started.

**Evidence.** `test/integration/outcome.integration.test.mjs` throws from the child transport rather
than returning a failure envelope — the distinction is the whole finding — and asserts the ABORTED
receipt, the honest phase and spend, and the released lock. Neighbours: a handled failure keeps its
own phase rather than being relabelled, a pre-lock crash still escapes with no receipt, and a run
whose *logger* is what broke still files the record, because the durable half must not depend on
stdout. Three red against the reverted guard, two neighbours green throughout.

**One test was wrong first and is recorded because it was the named failure mode.** The pre-lock
boundary case was originally a throwing logger, which does not crash before the lock at all —
nothing writes a line until after acquisition — so it exercised the guard while claiming to bound
it. Replaced with a non-array argv, which throws on the entry point's first line.

**Evidence.** Tier 1 2650 pass / 0 fail, tier 2 161 pass / 0 fail.

### 104. A contender refused its own restored takeover claim — IMPLEMENTED (0.202.0)

**Found by a flake, and it was not a flake.** The F34 cohort race — five real contenders against a
stale lock whose reclaimer was killed mid-takeover — failed about **one run in ten** with *zero*
winners. Zero is not a shape a working lock produces: one winner is the invariant and two is the
defect the tier exists to catch, but nobody can take a repository nothing holds.

**The interleaving.** A contender creates its claim, then verifies it still holds it before touching
the lock. Between those two steps another contender's sweep can rename the claim away — the sweep
reads what it moved, finds it is not the claim it judged abandoned, and restores it. So the claim
returns owned by whoever made it, while that owner, having read `gone` in the window, looked again.
On the next pass its own `claimTakeover` fails **against its own restored claim**, it reads the claim
and finds a live pid — because the live pid is itself — and refuses with "another driver is already
reclaiming". Every other contender refuses the same live claim, and the claim file stays on disk
blocking the repository until somebody deletes it by hand. **A permanent denial of service reached
through the repair for a denial of service.**

**The repair is one comparison.** A token is a fresh UUID per acquisition, so a claim carrying this
contender's token cannot have been written by anybody else; recognizing it and continuing is not a
second reclaimer, it is the same one resuming, and the reclaim below re-verifies both the claim and
the lock before touching either.

**Evidence.** `test/run-lock.test.mjs` arranges the state that interleaving leaves — a stale lock and
a claim already carrying this contender's token — and requires the reclaim to succeed and the claim
not to outlive it. Red against the unrepaired branch. Two neighbours keep it from becoming "proceed
regardless": a live claim with a *different* token still refuses, and a dead one is still swept.
Measured after the repair: **0 failures in 20 runs** of the cohort race that had been failing 2 in
20 before it.

**Why no tier-2 test reproduces it directly.** The interleaving needs two contenders inside a
window microseconds wide; the race finds it statistically, which is what it is for, and the unit
case pins the state deterministically. Recording both is the point — the race is what noticed.

### 105. The F37 cleanup fixture raced the cleanup it was testing — IMPLEMENTED

**Found in a gate run, measured rather than re-run.** `health-probe.integration.test.mjs`'s
"leaves neither the process nor its listener behind" failed **2 in 6**, then **2 in 10**, with an
`ENOENT` on the pid file rather than any statement about cleanup.

**The fixture recorded the orphan from the orphan.** The backgrounded server wrote its pid from its
`listen` callback, so the record existed only if it survived long enough to bind a port — while the
sweep under test was busy killing it. Moving the write to the server's first statement helped and did
not fix it: node takes tens of milliseconds to boot and the reap sometimes lands first.

**The leader records what it forked.** The start command now writes `$!` synchronously before it
exits — knowledge it has the instant it forks and cannot lose. That is also the more faithful
fixture: what the sweep must clean is exactly what the start command left behind, and the test now
asks the same question from the same place. **0 failures in 12 runs.**

**Nothing about `health-probe.mjs` changed.** The product was right; the test could not see it.

### 107. The next compatibility boundary was measured and not admitted — RECORDED (0.208.0)

**The escape was exercised the same day the enforcement landed.** 0.205.0 set `VERIFIED_THROUGH` to
2.1.234. The Claude Code CLI then background-updated itself to **2.1.235 mid-session** — observed in
a child's `CLAUDE_CODE_EXECPATH` while probing something else — which is the forward drift F28
describes, arriving within hours.

The widening procedure ran against 2.1.235: `MEESEEKS_LIVE=1 npm run test:live` finished **33 of
34**. That is useful compatibility evidence and not the clean full-tier pass DESIGN §3.5 and REVIEW
F28 require, so `VERIFIED_THROUGH` remains 2.1.234. A host that auto-updated must pin an admitted
binary until a complete run supplies the missing evidence.

**Why the isolated retries do not replace the run.** `improve-contract`'s "returns a grounded,
bounded PRD" failed once and passed twice on 2.1.235 — the same model-output variability seen on
2.1.234. That diagnoses the failure; it does not turn the failed full-suite result into a pass. The
escape remains available and intentionally fail-closed.

### 108. Fail closed on malformed compatibility and nesting markers — IMPLEMENTED (0.208.0)

`parseClaudeVersion` previously matched only the beginning of `claude --version`, so strings such as
`2.1.234-`, `2.1.234+unverified`, and `2.1.234 warning` were accepted as the verified stable release.
It now accepts only a bare release/prerelease or the exact measured ` (Claude Code)` decoration,
rejects unsafe numeric components, and has hostile neighbours for every formerly accepted suffix.

The Driver and guard separately used `parseInt` for `MEESEEKS_RUN_DEPTH`. A nested invocation could
therefore turn `banana` into depth zero or `1garbage` into depth one and obtain room under the cap,
contradicting DESIGN's fail-closed invariant. Both boundaries now require one exact non-negative safe
integer; `childEnvironment` preserves a malformed marker so it cannot launder the state before the
next boundary sees it. Driver and guard tests cover the deny path and valid neighbours.

### 109. Re-baseline of every open REVIEW finding against 0.208.0 — IMPLEMENTED (0.208.0 candidate)

Not a new feature: a trace of all seventeen findings still marked OPEN in `REVIEW.md` against the
**current** tree rather than against their 0.194.0 coordinates, and the smallest root-cause
correction for each clause that was still reproducible. Six were.

**F26 — `commitPhase` inferred success it never observed.** `shell` resolves `{ ok: false }` rather
than throwing, so discarding the results of `git add` and `git commit` was silent: the launch
receipt recorded the phase as admitted *and committed*, the function returned `true`, and the run
carried on over a tree that still held the changes. `driveRun`'s own commit closure has checked both
since F31 — the pre-loop path had simply never been brought up to that standard, and the tier-2
fixtures could not see it because they shell out to a real git that always succeeds. Both results are
now observed, `git diff --cached` separates "nothing staged" from a fault, and the quality-plugins
call site honours the boolean it used to discard. Evidence:
`test/integration/phase-commit.integration.test.mjs` makes git genuinely fail with a read-only
`.git/objects` — an ordinary disk-permission fault, which fails writes while leaving every read
working, exactly the shape that slipped through. One case red against the old body.

**F19 — three unbounded reads of target-controlled artifacts.** The reopened `readBounded`
sub-defect was genuinely fixed, but the *callers* were not all converted. The operator's PRD was read
whole by the copy that runs **before** `captureSpecification`'s bounded read, so an oversized
specification died unbounded before the limit written for it could refuse it by name. Worse,
`isSubstantial` (which decides `DoD-4-docs`) and `anySourceMatches` (which decides `observability` by
reading *every source file in the tree*) both read whole — one generated bundle was enough to end a
run inside a gate. All three are bounded now: the PRD refusal names the artifact and both sizes and
reaches the terminal receipt; an over-limit document reads as substantial, because the question is a
*minimum* and refusing would fail a gate on size alone; an over-limit source file is skipped, which
fails closed. Evidence: `test/integration/bounded-inputs.integration.test.mjs` and four cases in
`test/driver.test.mjs`.

**The first draft of the gate tests proved nothing, and that is worth recording.** Asserting the gate
*outcome* over an oversized file passed with the bounds removed — both answers are "no logger here".
The discriminating fixture puts the match **inside** the oversized file: unbounded it is found,
bounded it is skipped. The allocation bound itself is unobservable from a result, so that half is
asserted positionally, exactly as `test/bounded-read.test.mjs` asserts it for `readBounded`.

**F2 — the descendant sweep was gated on the wrong condition.** The ownership pre-image was sampled
only when a `timeoutMs` was supplied, so on the 64MB output-cap path with no ceiling
`sweepLeakedGroup` returned `[]` and every descendant of a flooding child survived; the direct child
died, so the leak was invisible from the result. Production callers with no ceiling include
`npx playwright install chromium`, the toolchain version probes and the smoke health-probe child —
the last being the caller most likely to own descendants. The cost that justified the condition was
**measured rather than assumed**: `ps -eo pid=,pgid=,comm=` is 4.3ms, about two `git rev-parse`
calls, against iterations that are minutes long. Sampling is now unconditional. Evidence: a tier-2
case that floods with no ceiling at all and asserts the descendant is gone and named in `reaped`.

**F10 — at-most-once meant at most one *attempt*.** `writeRunOutcome` latched `written.done` before
the write, so a transient ENOSPC, EACCES or rename race on the first exit path latched the run shut:
every later path — including `main`'s crash guard, which exists precisely to file a receipt —
declined to try, and the run ended with no durable record at all. The flag is now latched only once
bytes are on disk. The rule being defended is "the first *decided* answer wins", and an attempt that
wrote nothing decided nothing. Evidence: two cases in `test/outcome.test.mjs`, one red.

**F17 — two of the three exemptions were never definition-scoped.** The reopened wiring half is
genuinely closed: `driveRun` recomputes the rule and applies it at *both* advances, and
`recordAdvance` banks from `credited`. But only `previousPassing` was scoped to the definition. An id
that had ever been seen failing, or that was present at the first gating, kept that exemption
**forever** — including after its defining file was rewritten — so a test could be replaced with a
weaker one and inherit the credit its predecessor earned. That is the substitution the finding is
about, surviving inside the repair for it.

Red evidence now records the digest each observation was made under, per defining file, mirroring the
ratchet's own `definitions` map; `changedDefinitions` compares against it and the resulting
`staleEvidence` set defeats the `redSeen` and `baseline` exemptions exactly as it already defeated
`previousPassing`. **The escape is preserved and is the load-bearing half:** observing the rewritten
test fail records evidence under the current digest, so the exemption returns — a legitimate
strengthening costs one observation, not permanent withholding. Nothing is deleted to make that work,
and no id is reset or regressed: withholding only declines to *re-bank*, and `redEvidenceGate`
reports rather than blocks, so there is no deadlock.

**A store written before the digest field exists vouches for nothing**, because `changedDefinitions`
reads an absent digest as changed. That is the correct direction — nobody can say which bytes such
evidence was recorded against — and it costs nothing that matters: already-banked ids keep their
ratchet protection. The tier-1 harness now seeds evidence against the tree it built, exactly as
`gateTree` hands over the candidate directory; a fixture that seeded evidence without a tree was
modelling evidence from nowhere.

**F41 — the deadline fired and the caller discarded the verdict.** The ceilings reach production, but
`installQualityPlugins` never read `timedOut`: a detection that hung for its full 60s was read as
"the tool is not installed" and escalated straight into a ten-minute install attempt, so the operator
saw eleven minutes of silence and then `exit 1` — the hang the deadline exists to prevent, wearing
the report of a missing package. A timeout is now its own outcome on both commands, and a hung
detection does not escalate.

**Classified and not repaired, with reasons, in the report to the operator:** F13, F39 (fixed;
residual gaps are test-coverage and a stale ledger row, not code), F5, F21, F22, F25, F27, F28, F29
(reproducible or evidence-blocked, each needing either a paid live canary — withheld this session by
operator instruction — or a slice of its own).

### 110. The installed-snapshot harness, and two evidence leaks it uncovered — IMPLEMENTED (0.209.0 candidate)

**F21's machinery, built because four other findings were queued behind it.** F25's withheld
command, F27's role tools, F28's compatibility floor and F29's reviewer isolation each end in a
canary against the *installed* plugin, and none could be written while nothing could produce an
installed plugin to point at.

**What a loader actually reads, measured rather than assumed.** `installed_plugins.json` records an
`installPath` of `cache/<marketplace>/<plugin>/<version>/` and pins a `gitCommitSha` beside it — so
every gate in this repository can be green about bytes no loader will ever open. The redirect that
makes a disposable snapshot possible is **`claude --plugin-dir <path>`**, verified live on 2.1.235:
a staged copy of this repository loaded and answered for about a tenth of a cent, with nothing
installed and `~/.claude/plugins` untouched.

`tools/plugin-snapshot.mjs` stages the shipped surface into a disposable directory and verifies the
copy by re-hashing it. **The surface comes from `isShipped`**, the same predicate `release-check`
uses, so adding a shipped directory extends the snapshot automatically rather than silently leaving
it behind — the enumeration defect, refused positionally. Tier 2 proves the snapshot is the
candidate byte for byte and detects a changed file, a missing file and a stale leftover; tier 3
(`test/live/plugin-loader.live.test.mjs`) asks a real loader to accept it and carries **F25's second
acceptance clause**: whether the loader withholds `/meeseeks` from the model's own skill surface.

**This is the staging half, and it is deliberately not all of F21.** `--plugin-dir` is a
*session-only inline load*: it reports `Source: meeseeks@inline` and produces no
`installed_plugins.json`, no `installPath`, no version-keyed cache directory and no `gitCommitSha`.
It cannot prove that `meeseeks@meeseeks` **resolves** to the candidate version and commit, which is
the clause F21 turns on, so item 75 stays `PARTIAL` rather than being claimed closed.

**The live canary is built and deliberately not run.** It spends money, and the operator withheld
paid runs for this session. It skips cleanly unarmed. One `MEESEEKS_LIVE=1` run closes F25's
remaining clause and gives F27, F28 and F29 somewhere to attach.

**The argv trap is still live and bit again while writing it.** A prompt passed as an argument after
`--tools` is swallowed as a tool name; the child died with *"Input must be provided either through
stdin or as a prompt argument"*. The canary puts the prompt on stdin, as the driver does.

**F15 — the held-out oracle was handing back its own answer key.** The either/or is settled by
narrowing the claim, not by enforcement: a builder runs with `--dangerously-skip-permissions` and
arbitrary Bash, so a hook that denied the `Read` tool on `.meeseeks/oracle.json` is defeated by
`node -e`, a test file or `base64`, and a defeatable block documented as a guarantee is worse than
none. What is enforced is **integrity** — §6's positional rule means the builder cannot write under
`.meeseeks/` — and `DESIGN.md` §4.6 already states the narrowed guarantee precisely.

But the narrowed sentence was **false**, and that is the repair. "Held out means *not supplied*", and
`judgeOracleCase` printed the expected stdout verbatim into its failure detail — which becomes the
builder's objective. The one artifact authored from the PRD before any code exists handed its answer
straight back to the thing it judges, the moment that thing got it wrong: satisficing with the answer
sheet face up. The detail now names the case, that stdout is what differs, the builder's own output
and the *size* of what is missing, so it stays repairable without being an answer key. Exit-code
mismatches are unchanged — an exit code is not an answer — and relation verdicts are unchanged,
because they compare the program against itself. A test pins the narrowed claim in both `DESIGN.md`
and the module, so a later edit cannot quietly upgrade "discipline" back into "barrier".

**F17 — a skipped test was being recorded as observed failing.** `gateTree` collapsed everything that
was not `passed` into one set and handed it to `recordRedEvidence`, so `it.skip` minted red evidence.
That inverts the deterrent twice: an id could be banked as seen-red while skipped, then un-skipped
and credited by the ratchet with nothing ever having watched it fail — and the same single entry
satisfies `suiteSensitivityEvidence`, whose `seenFailing.size > 0` branch is a **ship** gate. One
skip could stand in for the proof that the suite can fail at all. Three-way classification now:
`flaky` stays evidence, because a retried test really did fail on an attempt, and a skip is the one
outcome that observed nothing.

**A proposal was killed on the way, and the record is the point.** The obvious closure for F17's last
clause was to definition-scope `suiteSensitivityEvidence`. An adversarial trace refused it: it aims
at the wrong quantifier, it is defeated by a single `it.skip`, and its failure mode is an
unsatisfiable objective on an honest formatter run. The skip defect it surfaced instead is smaller,
strictly correct, and closes the same hole from underneath.

**The ground for the remaining half is measured, so the next slice does not have to guess.**

- **`CLAUDE_CONFIG_DIR` is the complete redirect**, and the only sufficient one. `CLAUDE_CODE_PLUGIN_CACHE_DIR`
  moves the plugin root alone — but `claude plugin marketplace add` writes `extraKnownMarketplaces`
  into the *user settings file*, which that variable does not govern. Measured the hard way: a
  dispatched agent's probe wrote a `meeseeks` entry into the operator's real `~/.claude/settings.json`
  and reverted it. **Verified restored** — md5 `8f197d90c0e71dbb107501d8d30e7fd9`, `meeseeks` absent,
  six marketplaces as before. Any future harness sets `CLAUDE_CONFIG_DIR` and nothing else.
- **`gitCommitSha` appears only for a git-sourced marketplace.** A local path is classified
  `source: "directory"` even when it is a git repository, and `file://` is rejected outright. Writing
  `known_marketplaces.json` directly into the disposable root with a `git` source pointing at a local
  **bare** repo clones offline, yields the sha, and bypasses the settings mutation entirely. Whole
  install: about six seconds.
- **Three false-green surfaces, and they are the reason this needs care.** With the cache directory
  renamed away, `plugin list` still reported the plugin healthy — it was reading the *marketplace
  clone*. With `hooks/guard.mjs` deleted from the cache, the loader still reported `Hooks (1)`: it
  never checks that a hook command's file exists. And `claude plugin validate` validates the
  **marketplace** manifest when one is present and never opens `plugin.json`. A canary built the
  obvious way passes on a broken snapshot.
- **`NODE_V8_COVERAGE` is a zero-spend resolution proof.** Importing the installed `driver.mjs` under
  it recorded **40 script URLs, every one under the cache root and none from the source checkout** —
  which is F21's "prove no source-checkout path is used", with no API call. The import graph is
  entirely static, so the closure is real. The paid canary is for *skill surface*, not for this.

**Evidence.** Six tier-2 cases on the snapshot, four tier-1 cases on the answer-key leak, four on the
narrowed claim, one structural case on the three-way classification. Every one red-proven against
its reverted body. Tier 3 built and unrun.

### 111. Install the candidate the way a loader does — IMPLEMENTED

**`npm run install-check`.** It bare-clones HEAD, registers that clone as a git-sourced marketplace
inside a disposable `CLAUDE_CONFIG_DIR`, installs `meeseeks@meeseeks` with the real CLI, and then
interrogates the result. **Free, offline, and about eight seconds** — the marketplace source is a
local bare repository, so nothing is fetched and no model is invoked.

**What it asserts, and every clause is one F21 names:**

- the registry records the **declared version** and the **HEAD commit** (`gitCommitSha`), and the
  install path is keyed by version;
- every shipped file in the install is **byte-identical to the commit** — compared against
  `git ls-tree` of HEAD, not against the working tree, because HEAD is what an install carries;
- **where the module graph actually resolves from**: importing the installed `driver.mjs` under
  `NODE_V8_COVERAGE` recorded **40 modules, every one under the install path and none from this
  checkout**. That is F21's "prove no source-checkout path is used", at zero spend;
- the **installed** guard denies a write under `.meeseeks/` from inside a run — the hook executed,
  not the hook declared;
- the operator's `~/.claude/settings.json` and real plugin registry are **byte-identical afterwards**,
  hashed before and after.

**Isolation is by `CLAUDE_CONFIG_DIR`, and the marketplace is registered by writing
`known_marketplaces.json` directly.** Both choices are forced by measurement, not taste:
`CLAUDE_CODE_PLUGIN_CACHE_DIR` moves the plugin root but *not* the user settings file, so
`claude plugin marketplace add` under it writes `extraKnownMarketplaces` into the operator's real
settings — which happened once during this work and was reverted and verified. The loader's schema
also requires a `lastUpdated`; omitting it is reported as a corrupt configuration.

**It is aimed away from three measured false greens.** `plugin list` reports a plugin healthy while
reading the *marketplace clone*, so a renamed cache directory does not fail it. The loader never
checks that a hook command's file exists, so a deleted `guard.mjs` still shows `Hooks (1)`. And
`claude plugin validate` validates the *marketplace* manifest when one is present and never opens
`plugin.json`. None of those three is what this asks. A canary built the obvious way passes on a
broken snapshot.

**Red-proven:** with the manifest bumped to a version HEAD does not carry, it refuses —
*"the loader resolved version 0.209.0; the manifest declares 0.210.0"* — and exits 1, which is the
`CLAUDE.md` trap it exists for: a fix that appears not to work because the loader is still reading
the previous build.

**Extended to answer F27's and F28's installed-plugin clauses, offline.** The check now imports the
**installed** `driver.mjs` and `claude-compat.mjs` and asks them directly, which is the one question
`CLAUDE.md` says to ask before debugging anything else: a repair can be committed, pushed,
reinstalled and reloaded while the loader keeps running the previous build, and every symptom is
indistinguishable from a wrong fix.

- **F27:** every phase policy in the *installed* copy produces its exact declared `--tools` set, the
  oracle author gets `--tools ""`, the builder stays unrestricted, `--tools` precedes the variadic
  `--allowedTools`, and `--strict-mcp-config` is present for every restricted role.
- **The guard registration**, which `CLAUDE.md` names the invariant most likely to break: the
  `--settings` blob in the argv a real child receives must carry the guard **by absolute path inside
  this install**. Registering the hook in the manifest covers the operator's own sessions, and a
  `claude -p` child does not load those — for eleven versions every builder ran unguarded while the
  guard's unit tests stayed green.
- **F28:** the installed policy is self-consistent (floor at or below ceiling, both bounds cited in
  its own evidence), and the verdict for the CLI actually present is **reported rather than
  enforced** — the operator is deliberately holding 2.1.235 outside the range, and failing on that
  would turn their decision into a broken release check.

**It caught a live shadowed binary on its first run, which is F28's own scenario.** Under `npm run`
it resolved `~/dev/node_modules/.bin/claude` — **2.1.136**, the ancestor this repository records as
having never heard of `--safe-mode` — and reported on an install *that* binary had performed. `npm
run` prepends every ancestor `node_modules/.bin` to `PATH`. The live tier has been immune since
13 August 2026 because `tools/run-live.mjs` strips those entries; the defect simply arrived in a new
tool that did not know. `tools/operator-path.mjs` is now the single answer both use, unit-tested, with
a structural case proving neither tool keeps a private copy — because the failure was never the
logic, it was a second implementation nobody compared. The check also prints **which binary** it
resolved, since F28 is explicit that a path plus a self-reported version is not sufficient identity,
and a version with no path is less than that.

**What this unblocks.** F25's remaining clause, and F27/F28/F29's canaries, now have an installed
snapshot to attach to. Only F25's needs a model, and only for the *skill surface* question — the
rest of what those findings ask about the installed plugin is answerable here for free.

### 112. The acceptance receipt — IMPLEMENTED (0.210.0, audited and repaired at 0.211.0); REVIEW F22 open pending Codex

**What a `SHIPPED` proved before this.** `run.json` records what a run *was*, `review.json` what the
panel *said*, `outcome.json` how it *ended*. Gate results were built in memory by `runGates` and
never persisted, and the reports are deliberately excluded from the per-run archive. So an operator
could establish that Meeseeks said `SHIPPED`, read the panel, and reconstruct **nothing in between** —
which is what the audit of this project's first `SHIPPED` actually reported.

**`scripts/acceptance.mjs` is a typed, versioned assertion, not a bag of digests.** One claim bound to
one immutable subject: the F14 tree seal and the commit carrying it. The claim's *resolved inputs* —
specification revision, sanitized config, plugin build, CLI identity, required gate roster — are
separated from its *results*. That split is borrowed from in-toto's subject/predicate separation and
SLSA's input/result distinction; it claims neither conformance, requires no signature, and adds no
attestation framework.

**Nothing defaults to complete.** A missing field, a malformed one, or a placeholder — `''`,
`unknown`, `n/a` — makes the receipt incomplete and it is *not written*. A partial receipt would be
read as provenance, which is worse than none. The verifier rebuilds through the same rule, so a field
deleted or corrupted on disk fails exactly where authoring would have, and it refuses an unknown
schema, an unknown claim type, and any subject that is not the one being asked about.

**Model identity is tagged, and the tag is the point.** `parseClaudeEnvelope` now reads the vendor's
`modelUsage` map — which nothing had ever read, so every record of "which model did this work" was
*the selector this driver asked for*. A configured alias is not evidence that the requested model
answered, and a substitution was therefore invisible. Where the vendor reported nothing the receipt
says `unavailable` **with a reason**: it keeps the receipt complete, and `modelIdentityHolds` refuses
to let it satisfy a model-identity claim, an attribution or a matched comparison.

**Wired at the terminal transition, where the claim is actually made**, beside `outcome.json` and
archived per run — a receipt is about one candidate tree, so a second run overwriting it would
substitute the evidence for a different acceptance under the same name. Writing it can never destroy
a finished run: an incomplete receipt is logged and skipped, never thrown.

**The invocation ledger is item 77's store, extended rather than duplicated.** Every role invocation
is now recorded — not only the declaring ones — with the model requested, the effort requested and the
models observed. A phase with no declared supply gets a null manifest rather than no record, because
an invocation missing from the ledger is indistinguishable from one that never happened.

**Two of my own mistakes, both caught by the receipt refusing to be written.** The first draft used
`gateNames` as the required roster — that is *prose for the builder's brief* (`"e2e: does not apply -
…"`), so no result could ever match one and every run was refused. Correctly. The roster is now the
applicable gate **names**. The second was a fixture, not the code: a tier-2 run with canned children
never passes its gates, so it never convenes a panel, so there is no seal and no subject. That file
now proves the honest property — the refusal is logged, the terminal receipt survives, the invocation
ledger is still written — and the populated-receipt cases live at the loop, where a panel can be
reached.

**Evidence.** 17 unit cases on the claim and its verifier, 6 at the loop, 2 at tier 2. Four of the
loop cases go red with the writer disabled.

**F16's binding, reused rather than reinvented.** The receipt records a digest of every report the
loop actually read for the attempt whose gate results it carries. There is no attempt *identifier* to
record and inventing one would be the parallel notion F22 says not to create: F16's repair is
deliberately not a nonce or an mtime — the expected paths are removed before the attempt and a
regular file is required afterwards, so "this attempt produced it" is established by the protocol.
What a receipt can bind is the bytes, digested **where the loop reads them** rather than re-hashed at
the terminal transition against whatever is on disk by then, which is the substitution F16 exists to
prevent.

**An adversarial audit ran against the receipt before this landed, and found five things.** Four are
repaired here; the rest are named below. Recording that the audit happened is the point — the module
was unit-tested and green when every one of these was true.

- **The receipt could bind one iteration's gate results to another iteration's sealed tree, and
  verify clean.** The seal and the gate results were separate loop-scoped variables assigned at
  different points with five `continue` statements between them, so an iteration that gated and then
  bailed before the panel overwrote the results while the seal still pointed at an earlier tree.
  Reproduced: tree A sealed with tree B's two *failing* gates. The damaging polarity is the same bug
  reversed — the security-regression `continue` is taken only when every gate passed, so an all-green
  list could be bound to a tree those gates never ran against. **That is the receipt's entire stated
  purpose returning a wrong answer confidently.** Now one `sealedAttempt` record, assigned at the only
  line where the tree and its checks are both current.
- **`results.deploy` was structurally always `null`** — it looked for a gate named `deploy` and there
  has never been one, so a successful deploy and no deploy read identically. It comes from the effect
  that runs it now, failures included.
- **An empty invocation ledger built, verified, and satisfied `modelIdentityHolds` vacuously.** A
  corrupt or unwritable supply store makes `recordedInvocations` return `[]`, and the result was a
  *complete* `SHIPPED` receipt reporting that model identity held about invocations nobody recorded.
  A run that reached a terminal state spawned children by construction, so an empty list is now
  incomplete, and the check refuses one outright.
- **A recorded lapse was silently dropped.** `role-supply.mjs` writes one exactly so a later verifier
  cannot confuse "nothing was recorded" with "nothing happened" — and the receipt, which *is* that
  verifier, skipped it. Lapses now have their own field and refuse a model-identity claim while any
  exists. The first repair pushed them into `invocations` with `requestedModel: 'none'` and the
  completeness rule rejected it, correctly: `none` is the placeholder shape `isIdentity` exists to
  refuse.
- **One of my own tests was provably vacuous.** "keeps a failed gate in the receipt" ended with
  `if (!existsSync(receipt)) return;` and the file is never written on that path, so nothing after it
  ran. Replaced with the property that is actually true — a run whose gates fail seals nothing, so it
  writes no receipt — plus a case that reproduces the seal/gate pairing defect above.

**And the verifier had no production caller**, which is this repository's signature defect in its
purest form. `finish` now verifies what it just wrote, with the reader an auditor would use, and
removes a receipt that does not verify rather than leaving one nobody can accept.

**Not done, and named rather than implied:** F22's clean-clone traversal — an auditor resolving every
acceptance edge from the receipt alone, refusing a dangling one. Three edges the audit showed still
dangle: `ratchetPassing` is a bare integer whose authority `state.json` is deliberately *not* archived
per run, so an archived receipt's ratchet edge cannot be checked at all; `panelRecordDigest` digests
the whole append-only `review.json` without naming which entry authorized the terminal state; and
`recordedInvocations` rebuilds the ledger positionally with no back-reference, so deleting one entry
from `supply.json` renumbers the rest and nothing notices. Also open: every invocation records
`iteration: null` hardcoded, so no invocation can be attributed to the iteration that produced the
reviewed tree, and the receipt mixes 64-hex and 32-hex digests with nothing distinguishing them.
`PARTIAL` for exactly those reasons.

### 113. What an adversarial audit found in the acceptance receipt — IMPLEMENTED (0.211.0)

Recorded as its own item because the lesson is not any one of the five defects. **The module was
unit-tested and green while every one of them was true**, and four of the five live at the *seam*
where the driver fills the typed fields in — not in the type, which held up. Item 112 carries the
findings and the repairs; this entry exists so the shape is findable: a receipt is only as honest as
the values handed to it, and the tests that covered the shape covered none of the handing.

The one worth remembering: **`subject.tree` and `results.gates` were two variables, so the receipt
married the wrong ones.** Nothing about either variable was wrong on its own. They were correct,
current, well-named, and describing different iterations.

### 114. Process ownership is a group, and Driver-owned Git is bounded by it — IMPLEMENTED (0.212.0); REVIEW F33 and F44 open pending Codex

**Codex reopened F33 by falsifying the previous repair, and the falsification is exact.** Ownership
was *reconstructed*: snapshot the process group before spawning, subtract each concurrent sibling's
live subtree afterwards, kill what remains. The subtraction reads parentage out of `ps` at sweep
time — and a sibling's grandchild that has outlived its own leader has no parentage left. It is
reparented, it belongs to no live subtree, it is absent from the pre-image, and so it reads as *this*
call's leaked descendant. Codex's reproduction: A reaped both its own descendant and B's, and B
settled hundreds of milliseconds into work meant to last five seconds. The existing evidence could
not see it, because that fixture keeps B's leader alive.

**The repair is to stop inferring.** Each `shell` child is spawned `detached`, making it a
process-group leader; every descendant inherits that pgid; termination signals `-pgid`. Ownership
becomes a kernel fact that survives the owner: the grandchild keeps the group its leader had, so no
other call's termination can reach it however long ago that leader died.

**It deletes the machinery rather than patching it.** `processGroupMembers`, `processSnapshot`,
`subtreeOf`, `sweepLeakedGroup` and the `inFlightShellChildren` registry are gone — about 120 lines
whose whole job was reconstructing what the kernel already knew. The pre-spawn `ps` that 0.208.0 made
unconditional for F2 goes with them: the group is sampled **once, at the moment of termination**,
which is also the only moment it is both doomed and still nameable. Sampling after the grace reported
an empty list for the ordinary case, because a descendant that does not trap `SIGTERM` dies on the
group's first signal.

**Windows keeps what it had.** There are no POSIX groups there and `process.kill(-pid)` is
unsupported, so that platform still signals the direct child alone, and F11 still owns the gap.

**Evidence.** A tier-2 case reproduces the exact falsified shape: a sibling whose leader exits within
milliseconds while a grandchild holds the pipe open, born after the other call's spawn. Red against
the old ownership — the sibling's work is reaped and it settles early — green under the group. The
eleven existing termination cases stay green, including the resistant child, its descendants, the
overflow verdict, the cooperative child that does not pay the grace, and the bystander that predates
the call.

**One gap the change opened, and the fixture that caught it.** Removing the subtraction sweep broke
the path where the *leader has already exited* when the ceiling fires — a gate that backgrounds work
and returns immediately is the measured shape, and that branch never called `insist`, so nothing
signalled the group. The gate-orphan tier-2 fixture failed exactly there, which is what it was
written for. That path now goes straight to the group kill: the graceful half of `insist` is
addressed to a process that no longer exists, and what is left is the group its descendants are
still in.

**F44 lands on top of it, in the same slice, because the two cannot be separated.** Codex states the
dependency itself — bounded Git cleanup must not reintroduce F33's cross-call killing — and both
changes live in the same function. Committing them apart would mean committing a Git ceiling whose
termination still guessed at ownership.

**Git is not a short local syscall just because it usually is.** It runs repository-configured clean
and smudge filters, `fsmonitor` hooks, signing with its pinentry, and credential helpers — and the
Builder has unrestricted Bash, so it can add a `.gitattributes` or a repository-local config entry
before the Driver's final commit. Codex's reproduction assigned `payload.txt` a clean filter of
`sleep 30`, and `git add -A` then ran past every ceiling the product has, because **all twenty
Driver-owned Git calls carried none**. Nothing else could fire while the helper stayed alive: no
timer, no forced kill, no descendant cleanup, no terminal receipt, no lock release.

**One door, not twenty ceilings.** `git(args, { cwd })` applies the bound and the non-interactive
configuration, and every Driver-owned call goes through it — including the two `changedPaths`
callbacks, which run `git status` and reach fsmonitor exactly as `add` does. Twenty call sites each
remembering to pass a ceiling is twenty chances to forget, and the one that forgets is the one a
hostile `.gitattributes` finds. The ceiling is **120 seconds**: a bound on a hang, not a budget.

**Signing is disabled for Driver-owned commits and tags**, because a pinentry with nobody at the
keyboard is a hang wearing a question. So are the terminal prompt and the askpass helpers. F44 asks
for this explicitly rather than leaving an operator's signing policy able to hold a run open.

**Evidence.** A tier-2 fixture arms the same hostile clean filter Codex used — repository-local
config plus `.gitattributes`, verified with `git check-attr` — and proves the call returns on the
Driver's bound, reports a *timeout* rather than an ordinary failure, and **leaves no stalled helper
running**: that last one is the half group ownership had to land first for, since the filter is a
grandchild that killing `git` alone would strand. A repository demanding a signature still commits.
An ordinary repository pays nothing. A repository with no commits still reports an ordinary failure
rather than a timeout, which is the discriminator F44 asks for. The 120-second default is pinned as a
value, and a source scan refuses any Git call that bypasses the door.

**This was the prerequisite F44 named.** Bounded Git effects rely on termination reaching a helper
the leader spawned, because the helper is in the group.

### 115. Publish the run lock, do not assemble it in place — IMPLEMENTED (0.213.0); REVIEW F43 open pending Codex

**`wx` makes arbitration atomic and publication is a separate step.** `O_CREAT|O_EXCL` creates the
canonical pathname; user space writes the pid and token *afterwards*. A SIGKILL, a host failure or a
process death in that seam leaves a zero-length or half-written `lock.json` at the name every later
contender consults.

**And the refusal that protects it is what makes it permanent.** `readRunLock` declines to read a
partial lock — correctly, since it may belong to a creator still inside its write window — but the
file carries no identity, so no later contender can ever tell the crashed creator from a live one.
Codex's reproduction: materialize an empty canonical lock, call `acquireRunLock` twice with
dead-owner liveness, and both calls return the same unreadable-JSON refusal, forever. **A transient
crash became a permanent denial of service that only an operator with a shell could clear** — the
crash-recovery mechanism turning a crash into the unrecoverable state.

**So the bytes are published, never assembled.** The complete record is written to a private name in
the same directory, and `link` moves it to the canonical name atomically **without replacing**: it
fails `EEXIST` if another contender arrived first, which is exactly the no-replace, exactly-one-winner
semantics `wx` provided, and it cannot expose a partial canonical file because the file it publishes
was finished before it had that name. Same directory, so the link cannot cross a filesystem; named by
the contender's own token, so two contenders cannot collide on the staging file either.

**A loser cleans only its own litter.** The `finally` removes the private artifact and never the
canonical name — clearing that would delete whichever owner won, which is the opposite of what a
losing contender may do. F34's takeover claim already learned this; the canonical lock now matches it.

**Evidence.** Four cases in `test/run-lock.test.mjs`: the publication path is asserted positionally —
`link` present, no direct write to the canonical name, no `wx` — because the defect is an *interval*
that no longer exists and a behavioural test cannot observe an absent interval, which is the same
argument `readBounded`'s allocation bound uses. Then the semantics that had to survive: exactly one
winner, a record readable the instant it exists, and no staging artifact left on either path with the
winner's lock intact. Red against the reverted create-then-write.

### 116. The Driver's own entrypoint is a nested run — IMPLEMENTED (0.214.0); the Driver-side half is item 117; REVIEW F42 open pending Codex

**The guard half, and an unrelated bypass it uncovered.** F42 has two halves and this is the smaller
one; the Driver-side authority is **not** in this slice and is named below, because F42 says
explicitly that command-name matching cannot substitute for it.

**What the guard matched, and what a builder actually holds.** The nesting rule recognised
`meeseeks`, `/meeseeks` and a `claude` slash-command argument — how an *operator* starts a run. A
builder holds the installed Driver path, because it is in the settings and argv it was handed, and
both of Codex's reproduced commands were allowed:

```
env -u MEESEEKS_RUNNING node /plugin/scripts/driver.mjs PRD.md --yes
MEESEEKS_GIVE_THEM_THE_BOX=1 MEESEEKS_RUN_DEPTH=0 node /plugin/scripts/driver.mjs PRD.md --yes
```

The first clears the run marker so the new Driver reads itself as top level; the second forges
permission and resets the depth, and does not put `--give-them-the-box` on argv at all, so it also
skips the boxed wall clock. Both are denied now, matched **positionally on the entrypoint** —
`scripts/driver.mjs` — so an interpreter this rule has never heard of is caught too.

**And a bypass that is much wider than F42.** `stripPrefixes` dropped the word `env` and then stopped
at the first token that was not a `VAR=value` assignment, so in `env -u FOO git push --force` the
command name became `-u` and **every rule that keys off the command word looked straight past it**.
Measured against the guard before the repair:

```
deny  git-history   <- git push --force
ALLOW               <- env -u FOO git push --force
deny  rm-recursive  <- rm -rf /
ALLOW               <- env -u FOO rm -rf /
```

Two of the guard's strongest refusals, bypassed by four characters. The F42 nesting rule did not need
this fix — it scans every token — which is precisely why it needed its own cases: the bypass would
have survived the repair that found it.

**Evidence.** Ten cases on the entrypoint rule, covering both reproduced commands, `env -i`, `nohup`,
`sudo`, `bash -c` and a relative path, with benign Node neighbours — `node scripts/build.mjs`,
`node --test`, `node scripts/driver-helper.mjs` — still allowed, and `node driver.mjs` with no
`scripts/` parent still allowed because a path is a path by its shape. Nine of the ten go red without
the rule. Six cases on the env bypass across `-u`, `--unset`, `--unset=`, `-i`, repeated flags and a
mixed assignment, with `env -u FOO npm test` still allowed; all red without the flag handling.

**Not done, and it is the load-bearing half:** the Driver-side authority. Nesting permission and
depth must live somewhere a Builder cannot mint, clear, replay or reset, and environment presence
cannot carry that. The design this slice does not yet implement: `runComponentDriver` issues a
one-time ticket recorded in the parent's `.meeseeks/` — which the guard already protects positionally
at any depth, so a builder can neither write one nor forge a directory to hold one — passes the nonce
to the child, and the child refuses unless the ticket exists unconsumed and then consumes it. That
defeats minting (cannot write the record), replay (consumed on use) and reset (depth comes from the
record, not from argv or env). Until it lands, a renamed copy of the whole plugin remains
unrecognisable by name, which is exactly the residual F42 warns about.

### 117. Nesting authority is a ticket, not a variable — IMPLEMENTED (0.215.0); REVIEW F42 open pending Codex

**The load-bearing half of F42**, and item 116 named it as not done. Item 116 taught the guard to
recognise the shipped entrypoint; this makes the permission itself unforgeable, which F42 says
explicitly that command-name matching cannot substitute for.

**What a Builder owned.** `assertNotNested` read authorization out of two environment strings: a
nonempty `MEESEEKS_GIVE_THEM_THE_BOX` and a below-cap `MEESEEKS_RUN_DEPTH`. A Builder with
unrestricted Bash sets both. Codex's reproduction forges the flag, resets the depth, points the new
run at another repository so the current lock is irrelevant, and never puts the flag on argv — so it
also skips the boxed wall clock. Repeated at each generation, the depth-two cap bounds nothing.

**What replaced it.** `scripts/nesting.mjs`: the Driver about to spawn a component issues a one-time
ticket into the *parent's* `.meeseeks/nesting.json` and passes the nonce down. A nested run refuses
unless that ticket exists unconsumed, and redemption consumes it. Minting is closed by §6's
positional rule — a marked process may not write under `.meeseeks/` at any depth, including files
that do not exist yet — replay by consumption, and reset because depth is a field of the record.
`MEESEEKS_GIVE_THEM_THE_BOX` and `MEESEEKS_RUN_DEPTH` now decide nothing in a child; the flag remains
the operator's intent at the parent, where `runInvocation` still reads it off argv, still refuses
configured components without it, and still arms the boxed deadline. `DESIGN.md` §6.5 records this.

**The cap moved to both ends, fail-closed at both.** `authorizedNestingEnv` refuses to mint past
`MAX_BOX_DEPTH`, so a run at the bottom never spends a spawn to be told so and the store never holds
authority nobody may use; `assertNotNested` refuses to redeem past it. A malformed inherited depth is
refused rather than read as zero — the `parseRunDepth(...) ?? 0` at the spawn site was itself a
launder, turning corrupt state into a fresh generation of permission before either boundary saw it.

**Evidence.** Tier 1: the three box cases were rewritten to the ticket contract and one of them is
now *inverted* — an armed flag with no ticket is refused, where it used to be the proof that the flag
worked. Six more cover consumption, an invented nonce, a child declaring itself shallower than its
ticket, the cap, and the message that names it. Six cases on `authorizedNestingEnv`: the round trip,
the depth chain one and two with three refused, that a refusal mints nothing, and five malformed
markers. Tier 2 (`test/integration/nesting-authority.integration.test.mjs`) starts the attack for
real — a Driver process, launched from one repository against another, with a counterfeit `claude`
first on `PATH` — across four hostile environments and two forged tickets, proving in each case a
nonzero exit with the nesting refusal, **no paid child recorded**, no launch receipt, no lock in the
victim, its history and worktree untouched, and the parent's state and ticket store unchanged. Three
guard cases run the real hook as a subprocess, including the marker-clearing form only it can see.

**Both neighbours are asserted, because refusing everything is not a fix.** An ordinary top-level run
reaches configuration loading — asserted on the message it *does* stop at, since asserting only the
absence of the nesting refusal would pass for a Driver that died on its first line. And a component
that redeems a properly issued ticket gets equally far, with the replay of that same environment
refused immediately after.

**Residual.** A renamed copy of the whole plugin is still unrecognisable to the guard by name. That
is defense-in-depth's limit and not this half's: such a copy still cannot mint a ticket, so it is
refused by the Driver.

### 118. The specification is delivered, not pointed at — IMPLEMENTED (0.216.0); REVIEW F12 open pending Codex

**F12 reopened on the half a digest comparison cannot reach.** Item 66 captures the canonical bytes
and re-checks the working copy against them, which closes *persistent* replacement. The reviewer
prompt still said `Read PRD.md`. A Builder with unrestricted repository writes can therefore replace
canonical A with an easier B exactly while the Panel reads it and restore A before the next sampling:
the Panel certifies B, the outcome and the commit name A, and nothing anywhere disagrees. Every
existing case left the mutation *present*, which is why all of them passed against a live defect.

**The repair is delivery, not a tighter sample.** `canonicalSpecificationBlock`, `reviewerBrief` and
`realityCheckPrompt` are exported from `driver.mjs` and pure; the Panel and the circuit-breaker
receive the captured bytes inside their prompt, fenced and stamped with the revision digest, and are
told not to read the file — with the reason, because a reviewer holding tools reasons its way around
an instruction that has none. `DESIGN.md` §6.4 records this. `templates/reviewer-system.md` agrees: the specification is listed as
arriving in the brief, and a specification file in the repository that disagrees with it is named as
a finding rather than an amendment. There is no window left to sample, because the authority never
lives on disk. Oversize delivery is already fail-closed: `checkContextBudget` refuses a prompt over
the ceiling before the child is spawned, so a pathological specification costs nothing.

**Why they are exported functions.** The briefs were assembled inline inside `runInvocation`'s effect
closures, reachable only by driving a whole run to a Panel — which needs passing gates and injected
results, so `test/integration/acceptance.integration.test.mjs` says in its own header that such cases
belong at the loop. A prompt handed to a cold role is product code and has to be directly testable.

**Evidence.** Nineteen tier-1 cases: the block carries the bytes verbatim, names the file and digest,
fences the document, and does not collapse an empty specification into nothing; the brief carries the
document, refuses to send the panel to the working copy, gives the reason, names the revision, lists
exactly the owned ids, appends the assumptions log only when there is one, and is identical across
calls because it never touches a disk; the reality-check prompt does the same and still emits the one
word the breaker parses. Six of them go red when the old `Read PRD.md` sentence is restored.

**And three positional cases, because no return value can show the wiring.** The builders are pure
and correct whether or not the loop hands them the *captured* revision, so the review and
reality-check effects are scanned for `contents: specification.contents` and against any file read.
The first draft sliced `review:` through `extractLesson:` — spanning both effects — and a review
effect regressed to `readFileSync` still matched its neighbour's line and stayed green through the
exact defect the assertion exists for. Measured, narrowed to one effect each, and re-proved red.

**Tier 2 keeps the reproduction.** `test/integration/specification.integration.test.mjs` adds a run
where the substitution is present for the whole of a child call and reverted before it returns: the
run completes, the drift check says nothing, and the captured digest still matches. That case exists
to pin what the before/after comparison *is* — a closure of persistent replacement — so nobody later
mistakes it for a defence against a document that is correct whenever anyone looks.

### 119. Parseable is not readable, and absence is only honest once — IMPLEMENTED (0.217.0); REVIEW F13 open pending Codex

**F13's third pass, and both holes are in the same reader.** Item 67 made the capability set
monotonic and item 109's repair made an unparseable manifest throw. `establishedCapabilities` still
answered `[]` — "this run established nothing" — for two reachable shapes, and each answer disarms
whatever deterministic gate the run had already agreed applied.

**Valid JSON of the wrong type.** Anything that was not an object was coerced to `{}`, which then
took the legacy no-`capabilities`-field exception. Codex measured `null`, `[]`, `"damaged"` and `42`;
`["web-ui"]` and `true` are the same hole. All six are refused now, and the legacy exception is
narrowed to what it was written for: an **object** with no `capabilities` key, which is what builds
before 0.190.0 wrote. Upgrading into one still succeeds, which is the neighbour.

**A manifest deleted after this run wrote one.** Production writes it on the first resolution and
reads it every iteration after, so from the second call onward absence is *loss*. It read as a first
call. `expected` carries the caller's own knowledge of having written it, held in the Driver's memory
for the life of the run — the one place a target cannot reach, since the guard denies tool writes
under `.meeseeks/` but not a process outside that boundary. First-call absence still yields `[]`,
because a reader that refused on absence outright would fail every run at its first gate.

**Evidence.** Six refusal cases parameterised over the wrong-type shapes, the narrowed legacy
neighbour, the deleted-after-write refusal with its message asserted, and two neighbours proving an
unexpected absence and a present manifest still read correctly. Eight go red with either half
reverted. Two positional cases hold the wiring, because the flag lives in a closure no unit test can
reach: the Driver must pass its own write-state into the reader, and must set that state *after* the
write rather than before it.

### 120. The candidate is materialized, not sampled — IMPLEMENTED (0.218.0); REVIEW F14 open pending Codex

**F14 reopened on what a before/after comparison cannot see.** Item 68 hashes the working tree after
the gates, rechecks it after the Panel and around the commit, and refuses any difference. That closes
*persistent* drift. It says nothing about which bytes were visible *during* an operation, and the
gates were weaker still: their identity was captured only after their results came back, so a swap
during a required gate left no trace at all. A Builder has arbitrary Bash and can leave a background
process that exposes tree B while a gate or a reviewer reads it and restores tree A before the next
sample. Every existing case left its write in place, which is why all of them passed against it.

**`scripts/candidate.mjs`, and there is no interval left to tighten.** After the Builder the Driver
stages the working tree into a temporary index — never `.git/index` — writes a tree object, wraps it
in a commit no branch points at, and checks that commit out into a worktree outside the repository.
Gates, the reports they write, the ship-time mutation gate, the Panel, evidence resolution,
test-definition digests and the agent-surface rescan all read that worktree. The background writer is
writing to a different directory. `DESIGN.md` §6.2 records the whole boundary.

**The three checks became equalities.** The identity a verdict is sealed to is the candidate's tree
object rather than a hash of a directory, so the pre-commit check is `write-tree` of the main tree
compared with it, and the post-commit check is `HEAD^{tree}` compared with it — the same value by
construction, which is what makes an inequality mean the commit published something else. The
`reviewedWorkspace === null` branch is gone rather than kept: there is no hash to fail any more, and a
run that could not materialize a candidate ends instead of falling back to the live tree, because
gating whatever is on disk is precisely the behaviour this replaces.

**Two placements that are decisions, not details.** Run-owned gate state — the gate cache and the red
evidence — is written to the **Driver's** `.meeseeks/` rather than the gated tree's, which is deleted
with the worktree; `gateTree` takes it as a second argument that defaults to the tree's own, so a
raced candidate keeps its existing isolation. And the ignored tool caches are shared into the
snapshot by symlink, because a subject that cannot resolve its dependencies cannot run a gate; that is
the one mutable surface left and `TOOL_CACHE_PATHS` names it.

**Evidence.** Twenty-one tier-2 cases on the module itself, because every claim it makes is a claim
about git: that the temporary index leaves the repository's own alone, that the tree includes
untracked and excludes ignored, that the same bytes get the same name and different bytes a different
one, that a deleted file is forgotten rather than carried, that a write to the main tree afterwards
does not reach the subject, that the worktree is reused with its caches intact and cleaned of the
previous iteration's leftovers, that the sweep takes `meeseeks-candidate-<pid>` and leaves an
operator's own worktree alone. Four more in `workspace-seal.integration.test.mjs` drive the real loop
against a real repository and swap A→B→A from inside a reviewer's and a gate's own window, asserting
what the *reader* held while the main tree held B; all four go red when the subject is pointed back at
the live tree. Six tier-1 cases cover the loop's decisions: the refusal to run without the effect, the
run ending when materialization fails without gating or reviewing anything, the subject being asked
for, and the committed-tree mismatch.

**One test's premise moved with the subject.** `report-freshness.integration.test.mjs` planted its
unremovable report path in the main tree's `.meeseeks/`; the declared report paths are the candidate's
now, and nothing outside the run can reach that directory. The hazard is planted from inside a gate
instead — which lands one iteration before the clear it defeats, so the run takes three — and two
assertions were narrowed honestly rather than contorted: the seeding gate proves it ran by writing a
copy back to the main tree, because `git worktree remove` deletes what it can before meeting the stuck
path, and the red-evidence assertion is now about the seeded id specifically rather than about the
store being absent, since iteration one is an ordinary attempt that produced no report at all.

**Residual, stated because it is a real gap.** The Panel's `cwd` is now a worktree rather than the
repository root. That is a contract with the `claude` binary — settings resolution, plugin loading,
cwd-relative tools — and this repository's own rule is that such a contract needs one live check.
Tier 3 was not run for this slice, so the Panel-in-a-worktree behaviour is unverified against a real
child. The tier-2 evidence covers the Driver's side of it completely.

### 121. A handoff header may not claim mutable state — IMPLEMENTED (0.219.0); REVIEW F40 open pending Codex

**F40 reopened for the third time on the same shape.** The header said which commit HEAD was and
which uncommitted layer sat above it. Both are true for minutes. Both went stale — and the last time
was *while this finding was open and the warning about it was in the file*. `release-check` passed
every time, because it validated the first version token and nothing around it. A fresh agent was
told the wrong comparison base and the wrong completion state, which is the whole impact.

**This repository's answer to a discipline that keeps failing is a gate**, and that is what the
version half of this same header already got. So `mutableStateClaims` refuses, by shape rather than
by phrase — the phrasing is what drifted:

- an object name, abbreviated or full, anywhere in the `**State:**` paragraph;
- the word `HEAD` in it, because where HEAD points is git's answer and not a document's;
- a bullet naming a PLAN item **anywhere in the file**, which is item 98's finding growing back. It
  did grow back, out of order and contradicting `PLAN.md`, and that is what reopened this.

The header now names a version, a branch, and nothing git can contradict a minute later. The
per-item list is gone; `PLAN.md` is the only queue and each slice's own numbers live at its item.
`## Measured evidence` keeps only what outlives one slice, and says out loud that everything there
carries the version it was taken at — an unstamped measurement reads as current and none of them are.

**Evidence.** Nine cases: an abbreviated name, a full one, a claim hiding across a reflow, a restated
queue of two bullets, and four neighbours that must stay silent — a paragraph naming only a version,
an object name in `## Measured evidence` (stamped history, not a claim about now), a file with no
`**State:**` paragraph at all, and prose mentioning an item without listing it. The ninth runs the
rule against the real `HANDOFF.md`, because a rule written for one file and never applied to it is a
comment.

**Not done here, and it is Codex's to judge:** F40 also names a contradiction about F7's status and
a finding-count mismatch. Neither is in the file any more — the header defers status and counts to
`REVIEW.md` rather than restating them — so there is nothing left to reconcile, only a gate stopping
them from being restated.

### 122. An archive refusal may not destroy what it refused to preserve — IMPLEMENTED (0.220.0); REVIEW F10 open pending Codex

**The last clause of F10, and it is the opposite defect from the rest of the finding.** Items 64 and
103 were about receipts that were never written. This one is about a receipt written where it should
not have been. `archivePreviousRun` refuses rather than overwriting when it cannot move the previous
run's artifacts aside — correct — and `releasing()` then wrote this run's answer straight over the
`outcome.json` that refusal was protecting. Codex reproduced it: a prior `SHIPPED` marker, a
`.meeseeks/runs` that is a regular file, and the `ABORTED` receipt landed on top of the `SHIPPED` one.

**Two changes, and the second is the one that matters.** `archiveOnce` marks itself attempted on
*success* only, so a refusal is no longer permanent for the invocation — the finding names that
ordering — and it records the refusal as a fact. `writeRunOutcome` takes `preserve`, and when it is
set and a receipt is already at the canonical path, that receipt is moved to
`outcome.json.unarchived-<digest>` before anything is written.

**And if the move fails too, nothing is written at all.** The ordering of harms decides it: a missing
record for this run is recoverable from a transcript, and an overwritten one is gone. The refusal
names both paths, because the operator is the only one who can fix the directory. A component child
never reaches this branch — the parent removes the child's `outcome.json` before spawning it — so the
tension only exists in a repository a human reads, and there the human is the reader being protected.

**Evidence.** Five tier-1 cases: the move-aside with both records asserted, the refusal when the move
cannot happen, that a refusal does not latch the at-most-once flag, and two neighbours — a first run
with nothing to preserve writes straight through and logs nothing, and a run whose archive *succeeded*
overwrites exactly as before rather than leaving a second copy. Two tier-2 cases drive the real
`main` against a real repository with a regular file where `runs/` must be: this run's `ABORTED` is at
the canonical path, the previous run's `SHIPPED` is beside it under a findable name, and the ordinary
second run archives into `runs/` and preserves nothing. Three go red with the preservation removed.

### 123. Trust classes, and the scan bound to the bytes it scanned — IMPLEMENTED (0.221.0); REVIEW F29 open pending Codex

**Two of F29's three remaining requirements; the third is paid and is named as not done.** Item 85
landed the reviewer-prompt authority boundary and the pre-Panel rescan. Codex's verification says
what is still missing: *"Required trust-class supply reporting, a durable binding between the scan
and the exact reviewed tree, and the staged-installed hostile/benign calibration remain absent."*

**Trust classes.** §6.1 draws one distinction — driver-owned versus not supplied. A cold reviewer
needs a third, because it can read the whole candidate: **authority** versus **evidence**.
`CLASS_TRUST` marks the Driver- and plugin-owned classes as authority and everything the candidate
produced as evidence, and the trust travels *with each input* in the manifest rather than being
looked up afterwards — a reader can say which inputs could bind a verdict without holding the table.
Each manifest also records `ambient`: the customization surfaces `--safe-mode` is asked to disable,
and **`verified: false`**, because whether another binary honoured a flag is not something this
process measured and F29 asks for a live canary to establish it. Writing it as measured would be the
overclaim §6.1 warns about, in the artifact meant to prevent one.

**The scan's binding.** `recordSurfaceScan` appends to `.meeseeks/surface-scan.json` the moment, the
iteration, the findings, whether they blocked, and the tree object the scan ran against — the same
identity item 120 seals the verdict to, which is why this item follows it. A scan whose subject
nobody can name is not evidence. A *blocked* scan ends the iteration before any panel record exists,
so recording it only on the way to a verdict would leave the interesting half with no account at all;
a scan that threw is recorded as an error rather than as a clean tree.

**Evidence.** Eight tier-1 cases on the recorder — the named tree, a `null` tree recorded rather than
omitted, findings and the blocking flag, the error case, appending across iterations, rebuilding from
an unreadable store and from an unknown schema, and no temp file left behind. Five on the trust
table: every declared class classified, the exact authority set, the exact evidence set, the ambient
record with its unverified flag, and the per-input trust in a real manifest. Three at the loop, where
the binding actually has to hold: a clean scan whose record names the same identity `review.json`
carries, a blocked scan recorded with the finding that blocked it, and a scan that threw.

**Not done, and it is not implementable here:** F29's third requirement is a pinned paid canary
proving a cold reviewer does not auto-load seeded project/user/local customizations, in a paired
hostile/benign calibration. That is live-tier work and this session is not authorized to spend. The
`verified: false` field exists precisely so the artifact does not claim it in the meantime.

### 124. A regression has to be attributable — IMPLEMENTED (0.222.0), closing item 95

**The livelock item 95 specified, repaired.** `collected === 0` catches a *whole* collection failure.
It cannot see one report of several going missing: the other keeps `collected` comfortably non-zero,
so every id the missing one used to bank is absent from `passing` and compares equal to regressed.
The tree is hard-reset, the verification gate re-runs the same non-producing gate, and it repeats to
the ceiling. Reproduced before the repair as 30 e2e ids reported as regressions and a run burned to
`BUDGET`.

**Attribution is the whole mechanism.** The ratchet state now records, per banked id, the report that
produced it — merged like the definition digests, so an id whose report did not run keeps the owner it
was banked under. `unmeasuredIds` answers which previously-passing ids are absent *and* owned by a
report this attempt did not produce; `evaluateIteration` excludes exactly those from the comparison
and from credit alike. An id with no recorded owner is treated as **measured**, which is the
conservative direction: it costs a reset that could have been avoided, where the other direction hides
a real regression. Nothing else moved — `collected === 0` keeps its meaning, and an id whose report
*was* produced and which is now absent still resets exactly as before.

**And a defect this found in the slice above it.** The tier-2 case is the first test in the repository
to let a real gate write a real report into a real candidate, and it did not work: `.meeseeks/` is
ignored, so item 120's snapshot worktree never had one, and a runner told
`--outputFile=<candidate>/.meeseeks/test-report.json` wrote nothing, exited zero, and left the loop
reading "the test report contained no tests at all" **on every iteration of every run**. Every other
tier-2 suite injects `readTestReports` and could not see it. `materializeCandidate` creates the
directory now, and `candidate.integration.test.mjs` holds it.

**Evidence.** Five tier-1 cases on `unmeasuredIds` — the named id, a real regression left alone, an id
that is currently passing, an id with no owner treated as measured, and sorted output — and six on
`evaluateIteration`: advancing while holding the unmeasured id, still resetting when the report was
produced, still resetting on a measured absence beside an unmeasured one, `collected === 0` unchanged,
rejecting when everything remaining is unmeasured, and ownership banked and merged. Ten go red with
the exclusion removed.

**Tier 2 drives the real `main`** over a real repository with counterfeit `npx` runners first on
`PATH` — the property under test is what the *loop* concludes when a declared report stops appearing,
and the real `npx vitest` would make it a test about an installed dependency instead. Everything
downstream of the runner is real: the toolchain, the roster, `gateTree`, `collectReports`, the
reporters, the ratchet, the reset. The first case proves both ids are banked with their owners, the
e2e ids are named as unmeasured when the report stops appearing, no reset happens, `repeated
regression` never appears, and the builder's work is still on disk. The second keeps the runner
producing a report with the test *failing*, and the reset happens exactly as before.

### 125. A receipt that has to survive its own verifier — IMPLEMENTED (0.223.0); REVIEW F22 open pending Codex

**Codex's verification of item 112 is a list of ways a receipt verified clean while saying nothing.**
Every one of them is here, and every one was free to close.

- **The verifier rebuilt the receipt and threw the rebuilt object away.** It checked only that the
  fields the builder *requires* survived, so a stored receipt could carry a field nobody wrote, a
  value the builder would have normalised differently, or an ordering the canonical form does not
  have, and still verify. The rebuilt form is now compared with the stored one and *returned* in
  place of it, so "this is the receipt this build writes for these facts" is a property of the
  return value rather than of a comment.
- **Three fields were coerced rather than required.** `ratchetPassing` became `0`, `reports` became
  `[]` and `ledgerLapses` became `[]` when deleted or corrupted — and the verifier's rebuild
  reproduced the coercion, which is why a receipt whose ratchet count had been replaced by a string
  verified clean. They are stated or the receipt is incomplete. A gate `status` was not checked at
  all and now must be an integer.
- **`SHIPPED` had no additional obligations.** A receipt could carry that word with no commit, no
  panel digest, and a *failed required gate*, which made "everything required passed"
  unfalsifiable. All three are refused now, and every other terminal state is left alone — a
  `STALLED` run genuinely has a failed gate, no commit and no panel, and refusing to record that
  would delete the evidence an operator most needs.
- **`verifyAcceptanceReceipt` had no production caller**, despite `PLAN.md` claiming the terminal
  transition verified the receipt and removed an invalid one. `writeAcceptanceReceipt` now reads the
  file back through the verifier and, separately, compares it byte-for-byte with what it wrote —
  removing the file and throwing on either. The run's answer never changes; this is forensics.
- **A supply-record write failure was logged and nothing else**, so one `ENOSPC` omitted an
  invocation and the receipt saw a shorter ledger with no discontinuity in it. The failure is held in
  the Driver's memory — the file it belongs in is the one that could not be written — and handed to
  the receipt beside the lapses the store recorded about itself.

**A limit is asserted rather than claimed.** A standalone reader cannot detect a report-digest list
*emptied* after the write: the verifier re-derives the canonical form from the file's own values, so
the emptied list rebuilds to itself. The write-time byte comparison catches it at the only moment
anything knows what the receipt was supposed to say, and a test asserts the standalone limit
explicitly so nobody later reads the verifier as stronger than it is. Making it standalone-detectable
needs per-gate report attribution, which is the next item.

**Evidence.** Twelve tier-1 cases on the verifier: a string status, a string and a negative ratchet
count, a removed panel digest, a removed report list, a `SHIPPED` receipt with no commit at both the
door and the read-back, a `SHIPPED` receipt carrying a failed required gate, an added field, a
reordered receipt, the canonical value being returned, the stated limit, and the neighbour that must
keep passing — a `STALLED` receipt with a failed gate, no commit and no panel. Two at the loop for the
production read-back, one of them through an injected reader because the branch is a race nothing can
time. Eleven go red with the strictness reverted.

**Not done, and named:** the per-gate command/attempt/tool-version identity and report attribution
Codex's last paragraph asks for, and the clean-clone traversal that depends on it. Item 126.

### 126. Per-gate identity and report attribution in the receipt — OPEN (extends item 76, REVIEW F22)

**What the receipt still cannot support.** A gate record carries `name`, `ok`, `status` and
`detailDigest`. It does not say which command produced it, on which attempt, with which tool version,
or which report digest belongs to which gate and path — so the clean-clone reconstruction F22 asks
for cannot be performed from one receipt, and a report-digest list emptied after the write is
undetectable to a standalone reader because nothing else in the file references those digests.

**Done when:** each gate result records the argv it ran (digested, not quoted — it is
target-influenced text), the iteration it ran on, and the report paths and digests attributable to it;
`results.reports` is derivable from the per-gate records and a mismatch is refused; the toolchain
declares which operation writes which report rather than the mapping being a filename convention; and
a clean-clone case starts from one `SHIPPED` receipt and resolves every required edge. Tool version
per gate is a measurement question and is scoped separately: record the resolved toolchain identity
rather than inventing a per-gate version nobody measured.

## Observations recorded rather than repaired

- **Tier 2 refused once and passed on an immediate re-run** (18 Aug 2026, committing 0.196.0 through
  `slice-check`). Standalone `npm run test:integration` was 152/152 both before and after. No test
  was named, because the harness printed the tail of a very long log — npm's warning banner — rather
  than the failing assertion. That reporting gap is now closed (`tools/slice-check.mjs` filters for
  failure lines), so the next occurrence identifies itself.

  Recorded rather than shrugged at, because 0.176.0 landed F30 precisely to stop a flaky result
  being treated as a pass, and the tier that judges this repository should be held to the standard
  it enforces. The likely candidates are the timing-sensitive tier-2 cases — the run-lock races and
  the concurrent-sibling termination case — under load from a full-suite run. If it recurs with a
  name attached, it becomes an item.


- **`test/live/improve-contract.live.test.mjs` is non-deterministic** (seen 17 Aug 2026 at 0.179.0).
  Across two full live runs it passed once and failed once; re-run alone it passed. The failure is
  downstream of `result.ok === true` — the child succeeded and wrote a document over 200 characters
  that contained no `PRD-N.M` identifier, so `requiredIdsFor` found none. It is a test of a model's
  output, in the one tier that is inherently probabilistic.

  Not repaired here, and not loosened: an assertion that tolerated a PRD with no requirements would
  stop checking the thing the improve-author contract exists for. Recorded because F30/item 87 has
  just made a flaky result a *failed gate* for the product, and the tier that judges the product
  should not quietly hold itself to a weaker bar. A repair would need to decide whether the
  non-determinism is the model's, the template's, or the assertion's — which is a question for a
  slice of its own with its own live budget.

## Cross-cutting non-goals — the refusals ARE the product
Recorded so a future session does not "helpfully" add them:
- **Automatic transcript harvesting or runtime prompt/skill mutation** — item 59 is an offline,
  staged development experiment over structured driver artifacts. Production roles never rewrite
  their own instructions, and sensitive child transcripts are not optimization input.
- **A third-party agent framework as Driver or required sandbox backend** — borrow measured invariants,
  not authority. Eve, its Workflow SDK, LangGraph, Cloudflare OS/Workers/Gatekeepers, or a hosted
  sandbox would duplicate the durable control plane and violate the dependency-free Claude-native
  core.
- **Persistent Panel/Oracle sessions or mid-run human-in-the-loop parking** — both weaken the cold,
  unattended contract. A required human decision ends with item 50's terminal question artifact; it
  never leaves a paid run waiting overnight. A simulated, staged, or queued external effect likewise
  never becomes completion evidence merely to let a role continue.
- **Persistent kernel / REPL as the builder's environment** — breaks builder starvation; state
  leaks past `git reset --hard` and the ratchet's premise dies.
- **Builder self-memory or self-grading** — breaks cold review; self-evaluation is the enemy the
  whole design defeats.
- **Open-ended "just keep working" mode with no DoD** — meeseeks requires a verifiable done-bar;
  the answer to "handle more work" is more job-types with done-bars (32–34, 49, and parked
  assessment item 86), never no done-bar.
- **A warm interactive TUI as the primary surface** — unattended-trustworthy is the moat; an
  attended mode, if ever built, is a separate surface and must not wag the verification dog.
