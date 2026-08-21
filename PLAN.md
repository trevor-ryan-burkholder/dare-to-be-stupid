# PLAN — what remains

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
`DROPPED` (operator refused), `DEFERRED` (operator postponed), `WITHDRAWN` (operator removed from
the current objective), and `REJECTED` (the item's admission test failed).

Status controls traversal, not Definition-of-Done scope. The Standing Rules' capability-versus-
experiment distinction determines scope. An in-scope capability may remain `BLOCKED`, `PARKED`, or
`DEFERRED` until its named condition changes; that status alone does not remove it from the DoD.
Explicitly `WITHDRAWN`, `DROPPED`, `REJECTED`, and experiment-only items remain outside the current
feature queue unless their documented reopening condition is met.

`IMPLEMENTED (...); REVIEW ... open pending Codex` means **implementation complete, review queued**.
It does not mean the development session is blocked. Use `REVIEW REQUIRED` only when verification
is a dependency for the next available work or for a release/acceptance claim.

## A live run is eligible work, not a cost decision

**The operator is on a Max subscription.** A live run spends quota and wall clock; it does not
require a purchase, an approval, or a separate authorization. `MEESEEKS_LIVE=1` is *arming* — it
exists so a suite that made no API call cannot report coverage — and it is not a permission gate.

This is written here because it was ignored for a whole session. Items whose remaining acceptance
needed a real model call were repeatedly classified as blocked "on cost grounds" and skipped, and
two eligibility sweeps inherited that classification and reported a drained queue that was not
drained. **A live-run prerequisite makes an item eligible, not blocked.** What genuinely blocks an
item is a capability this environment does not have — a Win32 host, a real browser — or a product
decision only the operator can make.

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

## Build order — current traversal

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
  report, reviewed-tree binding for the scan, and live canary remain in item 85.

**Gate 0B — external child/platform contracts.** F5/item **56** is OPEN: measure the real
child-environment contract before replacing ambient inheritance, then prove the boundary through a
live Claude child. Item **65** is **DEFERRED** to the final native-Win32 tranche; WSL and injected
platform doubles are not acceptance evidence, and `REVIEW.md` F11 owns defect status. F15/item **69**,
F21/item **75**, and the
installed-loader half of F25/item **80** remain open external-contract work. F27/item **82** is
implemented at 0.204.0 pending Codex verification. F28/item **83** is **PARTIAL**: the measured
version policy, role seal wiring, and authentication probe exist. The two source defects the 21 Aug
review found — version probes executing a bare unverified PATH target before the seal check, and
`toolVersions()` bypassing the controls entirely — are **repaired at 0.285.0**: identity is resolved
and fingerprinted before any execution, the probe runs the resolved path, the fingerprint is
verified again after the probe, and `toolVersions` takes the sealed version as an input instead of
asking PATH. What remains is the same-candidate live boundary evidence. Native-Windows CLI
resolution and launcher closure are deferred under item **65**.
These contracts close before feature fan-out. Item 65's deferral changes traversal, not that bar:
it remains a prerequisite for any Windows cleanup claim and for an item whose own admission requires
all of Gate 0; it does not block an independent POSIX-only capability that explicitly refuses
`win32`.

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
and **103**, F13/item **67**, F17/item **71**, F20/item **74**, F23/item **78**, and F24/item **79**
are implemented. Item **73** is **REOPENED** for the archive-attribution whole-file reads named in its
section. REVIEW has closed F20, F23, and F24, while F10, F13, F17, and F19 remain open pending
verification of later repairs. Their item headings own the exact repair versions. F22/item **76**
remains OPEN. F11 may share F2's process-lifecycle implementation, but
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
(machine-readable morning-acceptance results) → cases **A/B** from item **20**. Item **31**, the
Ateliers capstone, was withdrawn on 19 August and is not in the current campaign. Case C is
**PARKED by operator decision**; it must not be launched without reopening that decision.

**Campaign 4 — containment experiment and bounded follow-ons:** after items **56**, **82**, and
**83** establish the measured child boundary, run item **84** and record whether a stronger
containment profile is portable, capability-gated, or rejected. The experiment does not silently
change the supported default. Items **52** and **53**, originally ordered after that safety work,
are already complete and no longer part of the traversal.

**Research-gated and conditional work:** item **54** remains **BLOCKED** on Gate 0, item **77**, and
a recorded item **84** outcome; it does not enter the queue merely because the supporting analysis
exists. Item **55** was rejected because the required provenance already exists. Item **58**'s
killed-run experiment admitted and narrowed its journal; the journal is implemented, its
valid-outcome precedence repair remains, and it does not authorize checkpoint/resume. Item **106**
was rejected because no concrete authenticated-resource job met its
admission condition; configured connectivity alone does not reopen it.

**Scope and admission summary:** the Standing Rules below own the current all-features DoD; each
item's heading and admission clause own its traversal state. Items **21** and **31** are withdrawn.
Item **33** is a named operator deferral outside the current DoD. Items **32**, **54**, and **59**
are experiment or development-protocol work rather than product capabilities. Item **30** is a
completed research intake, not an implicit build. Item **86** is an in-scope capability but remains
`PARKED` until its containment and incremental-detection admission conditions close. Item **166** is
an in-scope capability but remains operator-`DEFERRED` until its heading's resumption condition is
met. Item **106** was `REJECTED` by its own admission test and reopens only when its heading's
condition is met. All other scope and status claims come from the Standing Rules and the individual
item—not from the historical phase heading in which an item happens to appear.

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

## Phase 1 — experiments. Run live, observe, one variable at a time.

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

**Run 3 was made on 20 Aug 2026 and the feature did not work.** It had been `CODE COMPLETE` since
0.144.0 on 1962 tier-1 and 46 tier-2 tests, and it failed on its first honest exercise in the one
configuration it exists for. Two defects, one cause — a component sub-run's directory offset was
computed nowhere:

- its phase outputs were spelled from the repository root, so the PRD phase was refused for
  producing exactly what it declared, and the sub-run aborted (item **145**);
- with that repaired, its gates ran against the candidate's repository root instead of its own
  project, so seven gates failed every iteration against a tree with no `package.json` and the run
  stalled having never gated the code it wrote (item **146**).

Both are fixed at 0.268.0. The item stays `IN PROGRESS`: shipping a component is the bar, and it has
not shipped yet.

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
  with a scripted answer list. No tier 2 or 3 owed: no git, child processes, network, or external API.
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

## Historical Phase 4 ordering — breadth; mirror withdrawn 19 August

### 20. Dogfood breadth — A/B **PREPARED**; C **PARKED by operator decision**
Cases A and B are the pending link-shortener and persistence-SPA runs in `DOGFOOD.md`.
Case C would exercise TRX and the .NET adapter end to end, but it is not scheduled and must not
run unless the operator explicitly reopens the 14 August decision.

### 21. Improve mode pointed at this repository — **WITHDRAWN (operator, 19 Aug 2026)**

**Historical disposition.** The operator deferred this on 14 August until the code was mostly
complete. Its engineering prerequisites were met at 0.107.0, but the operator withdrew improve mode
from the current traversal on 19 August before it ran. It is not waiting on code completion and may
reopen only under a newer explicit directive. The `CLAUDE.md` scope note remains authoritative: do
not run `/meeseeks` against this repository.

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

One item per commit; version bump with any shipped file; status and slice-specific validation at
the owning item here; `HANDOFF.md` records only candidate-wide state and evidence that outlives one
slice. Tier 2 before commits touching race, health-probe,
toolchains, or anything shelling out; tier 3 whenever `claudeArgs`, `childSettings`, envelope
parsing, or a template output contract moves (items 4, 10, 16 at minimum). No new standing
authority personas—the cap was spent on `oracle-author`. Driver-owned job/lens prompt addenda
explicitly required by items 34 and 86 reuse existing authority identities and spawn paths; they do
not create a persona, effort key, or terminal authority. Nothing from `BRIEF.md` section E's
do-not-add list.
Experiments write their result down whichever way they land: a surprising `CLOSED` is worth
more than a flattering `DONE`.

**Definition of done (operator, 19 Aug 2026, superseding the 14 Aug bar).** **Every feature
implemented.** Not "every feature plus a capstone" — the capstone and improve-mode are withdrawn —
and not "every item", because an experiment is a question rather than a capability.

The distinction decides what is in scope, so it is written down rather than left to judgement each
time. **A feature is a capability the product offers**: a job type, an input format, a gate, a
durable behaviour, a terminal output. **An experiment is a question the repository is asking
itself**, whose deliverable is a recorded answer. Items 32 and 54 say *experiment* in their own
titles; item 59 is a development protocol for authoring prompts rather than something a run does.
Those three stay out. Everything else that is a capability is in.

**Amended 21 Aug 2026 (operator, in-session).** Items **34** (research mode), **49** (artifact
job-types' remaining work), **166** (dashboard), and **168** (host setup/bootstrap) are
**post-DoD** capabilities, built after the current bar completes. Item 49's shipped substrate
— the prose toolchain and the citation/claim gates — remains shipped and in force; only its
unbuilt remainder defers, with its evidence gap named at the item. The current DoD completes
without those four.

**Why the list was long, recorded because the reasons were not equal.** Items 47–51 were parked as
"Phase-6 class" on 15 Aug to protect the capstone timeline, and that reason died with the capstone.
Items 32, 54, 55, 58, 59 and 86 were parked under this repository's own rule that nothing lands
without its measured number — but the measurements come from long runs, and the long runs were
themselves deferred, so those items could not unblock themselves. That is a deadlock rather than a
decision, and it is the larger half of the pile.

**Phase order (operator directive, 19 Aug 2026).** Build every in-scope feature that can be built
here, then testing and code fixes. The capstone and improve mode are withdrawn unless a newer
operator directive explicitly restores them. A feature or finding whose acceptance evidence cannot
be obtained in this environment is **deferred** with the missing capability named, not held open.
Current environment deferrals are F11/item 65 (**final native-Win32 tranche**; WSL is explicitly not
evidence) and item 16's confinement half (unverifiable here). Deferral changes traversal order, not
the unresolved acceptance bar or any dependent item's admission. Item 32 is an optional experiment
and follows its own admission condition rather than the feature phase. Dashboard item **166** is a
separate operator deferral until explicit resumption, not an environment limitation. Items 31
(capstone) and 21 (improve mode) are withdrawn from the current traversal.

**External review terminates (operator directive, 19 Aug 2026).** A pass is ACCEPTED when no HIGH
finding is open against the reviewed baseline; MEDIUM findings are a backlog and never withhold
acceptance; a pass reviews forward from the last accepted baseline rather than the whole tree. The
protocol lives in `CLAUDE.md` § External review. The reasoning is recorded there: `DESIGN.md` §4
gives the product's reviewer a termination condition and this repository's reviewer had none, which
is why six passes in four days never returned a clean verdict. Codex still owns every closure.

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

### 29. gitleaks as a detect-first quality plugin, and registry version pinning — **DONE (0.229.0 + 0.230.0)**

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

**Slice 1 landed (0.229.0) — the scanner.** The registry admits `install: null`, gitleaks is
registered, and it is in the **default** `qualityPlugins` roster, which is the half that makes it
real: a plugin absent from that array is provisioned by nobody and gates nothing. That check was
added to this slice deliberately, because the two defects repaired immediately before it
(items 128 and 42B) were both features that existed and were reachable from no call path.

- `resolvePlugin` refuses `required: true` with `install: null`. A required check that cannot be
  provisioned when absent lets a run reach its gates having silently dropped a done-bar line.
- An absent detect-only plugin warns and contributes **no gate**. A gate left behind fails on
  `command not found` every iteration and reads to a builder as a defect in its own code.
- `scripts/secrets-scan.mjs` parses the JSON report and renders bounded evidence through the
  interpreter mechanism item 42B built one slice earlier — its second entry, added when a second
  caller actually appeared rather than in advance of one.

**Everything about gitleaks here was measured against the real 8.30.1 binary, not recalled**, and
the first two measurements would each have shipped a broken gate:

- **`detect` is no longer a subcommand.** It is `dir`, `git`, `stdin`. A gate argv written from
  memory says `gitleaks detect` and fails at the first real run.
- **The default configuration allowlists AWS's own documented example key**, so the obvious fixture
  secret produces an empty report that reads as a clean pass. The captured finding is a
  `github-pat` built from `/dev/urandom` at capture time instead.
- **A target gitleaks cannot read exits 1 with an empty report** — the same status as a found
  secret. The exit code alone therefore cannot distinguish "secrets found" from "the scan never
  happened", which is why an empty report is refused rather than called clean and a status
  disagreeing with the report count is refused in both directions.
- A malformed flag exits 126, not 1.

Contract and fixtures: `test/fixtures/gitleaks/README.md`. `--redact` is in the gate argv as a
security decision: this output becomes repair context for a builder and evidence for a reviewer, and
the parser additionally never carries `Secret`, `Match`, `Author`, `Email` or `Commit` off
the report at all.

**Acceptance evidence:** 15 unit cases against the real captures, 5 registry cases, 3 tier-2 cases
driving the real `shell` against a counterfeit scanner that replays them. Proved red by four
mutations: empty report read as clean (1 fail), required+detect-only accepted (1 fail), gitleaks
dropped from the default roster (1 fail), interpreter unregistered (3 fail).

**Slice 2 landed (0.230.0) — the pins, and a defect they uncovered.** `PLUGIN_VERSIONS` holds
impeccable 3.6.0, knip 6.32.2, semgrep 1.173.0 and schemathesis 4.24.3, each resolved from the real
registry rather than read off a page. gitleaks has no entry: detect-only means the Driver never
installs it and has nothing to pin. A structural test refuses any future plugin that has an
installer and no pin, because an enumeration defaults each new entry to the unsafe side.

**Resolving the versions immediately found a defect in 0.228.0, one slice old.** The design-slop
fixtures came from the **Claude Code plugin** at 4.0.4. The gate runs `npx impeccable detect --json`,
which resolves from **npm** — and npm's newest `impeccable` is **3.6.0**. There is no 4.0.4 there at
all. The parser was proved against a version no run would ever execute, and 0.228.0's own residual
("owed one installed check") named exactly this without knowing it was already load-bearing.

Discharged by running the real published CLI end to end:

- `npx -y impeccable@3.6.0 detect --json slop.html` emits the same object shape and exits **2** on
  primary findings, which is the contract `designSlopEvidence` requires the stream to agree with.
- **3.6.0 omits `advisory` entirely on a primary finding** rather than emitting `false`. The strict
  `=== true` rule reads an absent flag as primary, which is the fail-closed direction — the reason
  it survives a version change it was never written for. `em-dash-overuse` still carries
  `advisory: true` with `severity: "warning"`, so severity is still not the discriminator.
- npm's own `npm warn` lines go to **stderr**, so stdout stays clean JSON. A gate reading merged
  streams would have failed to parse on any machine with a stray `.npmrc` key — which this one has.

`test/fixtures/impeccable/slop-findings-3.6.0.json` is that capture, and the parser is now proved
against both distributions. **impeccable is pinned in its gate as well as its installer**: `install`
puts skills into the project while the gate resolves the CLI through npx's own cache, so pinning one
and not the other reads as reproducible while still resolving two versions.

**Acceptance evidence:** 3 pin cases, 2 cross-version parser cases, tier 1 2961/2961, tier 2 249/249.
Proved red by three mutations: an unpinned installer (1 fail), the gate pin dropped while the
installer keeps its own (3 fail), the partition switched from the `advisory` flag to severity
(8 fail). **A first attempt at those proofs was vacuous** — the `perl` substitution silently matched
nothing and reported green as if the mutation had applied. Re-run through a substitution that throws
when its anchor is absent, which is the only reason the vacuity was visible.

**Remaining, and deliberately not built:** no gitleaks finding becomes a monotonic security element
yet. §4.3 requires the escape to be designed before the enforcement, and a false secret pin is
unremovable — it would turn a formatter run into an objective the builder cannot satisfy. Recording
the resolved version at run time is likewise not built: the detect step already prints it, and the
pin is what makes a run reproducible, so a recorded copy is evidence rather than control.

### 30. Ecosystem intake — four measured candidates — **DISPOSITION COMPLETE (19 Aug 2026)**

Each candidate now has a recorded measurement and a disposition, which is what this item asked for.
It authorised no runtime change and made none.

**(a) Official LSP plugins to builder children — PARKED.** Unmeasurable here: the delta it owes is
an iteration count across live runs, and its stated blocker is unchanged — child delivery is
`DESIGN.md` §5.0's open problem and the plugin does not install the language-server binary, which is
the §3.9 silent-no-op family. **Admission:** a measured iteration-count delta from paired live runs,
*after* child delivery has an answer. Not before, because a sharpener that silently fails to load is
indistinguishable from one that did not help.

**(b) OSV-Scanner — PARKED with a condition, and the measurement is the reason.** Measured against
osv-scanner 2.5.1 on a deliberately vulnerable Node tree (`minimist@0.0.8`, `lodash@4.17.4`):

- **Overlap with `npm audit` is complete.** Both name exactly the same two packages. OSV adds
  advisory-level granularity — it lists the GHSA ids — but no package `npm audit` missed. On the
  toolchains this repository has today (node, dotnet, whose NuGet audit already fails closed), it
  finds nothing new.
- **Its offline behaviour is the shape §4 refuses, and only the exit code saves it.** Forced onto a
  dead proxy it exits **127** and prints `{"results": []}`. A caller reading the JSON alone would
  see a clean tree; a caller reading the exit code sees the failure. That is the same trap already
  paid for three times here — gitleaks exiting 1 for both a leak and an unreadable target, and
  design-slop exiting 0 having printed nothing.
- It does have a real offline mode (`--offline-vulnerabilities` over a pre-downloaded database),
  so an air-gapped run is possible but needs provisioning.

**Admission:** OSV lands when a toolchain exists whose dependency audit meeseeks cannot otherwise
perform — which today means Python, Go or Rust, and those are deferred with item **33**. Its
interpreter must refuse an empty result at any non-zero exit; the measurement above is the evidence
that this is not hypothetical.

**(c) Trail of Bits skills mining — REJECTED, because both halves already exist.**

- Property-based-testing guidance is **already in the builder brief**: `templates/builder-system.md`
  tells the builder that an example test can be satisficed by special-casing three inputs while a
  property cannot, and to write invariants as properties with generated inputs. The reviewer
  template carries the matching *"state the property, not the example"* section.
- The differential-review method was **already considered and superseded**. `templates/oracle-author.md`
  records the reasoning for preferring metamorphic relations: a relation needs no reference
  implementation, so unlike a differential test it cannot encode the same assumption twice — *"which
  is precisely how a 110,877-case fuzz once missed the defect it was built to find."*

So the context-budget rent this candidate owed is **zero, because there is nothing to add**. For the
record the two templates cost 3.09% and 5.06% of the 400,000-character budget today.

**(d) Builder-honesty micro-distillations — PARKED.** Each owes a failed-iteration-rate comparison,
which is a live measurement across runs and cannot be taken here. **Admission:** a paired comparison
showing a lower failed-iteration rate. Worth noting the second distillation is partly covered
already — `templates/prompt-hygiene` framing and item 44's untrusted-text frames landed at 0.158.0 —
so its remaining scope is the verify-before-return half alone.

**What this item establishes beyond the four:** two of four candidates dissolved on contact with the
code rather than with a measurement. That is now the third time in this session — items 76 and 55
went the same way — and the pattern is worth naming: **a backlog entry describing work is not
evidence the work is absent.** Check the implementation before building against the note.


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

### 40. Reviewer contract — an `unverifiable[]` channel + a mandatory attack account (R27) — **DONE (0.231.0)**

Two parsed reviewer-JSON fields: `unverifiable[]` fails closed at the driver; a pass with no
non-empty attack account is an unparseable pass (already a fail by law). Makes lazy charitable
passes machine-detectable. Surface: `templates/reviewer-system.md` + the envelope parser + tests in
one commit; **tier 3**. **Campaign B**.

**`unverifiable[]` exists because its absence was being scored as success.** A reviewer that cannot
reach a requirement — an assertion about a service it cannot call, behaviour needing credentials the
tree does not carry — had two options and both were wrong. `fail` reports a defect that may not exist
and sends a builder to repair working code. `pass` ships an unexamined requirement, and it is the
tempting one: told that its verdict defaults to fail and that evidence is mandatory, a reviewer takes
it whenever the requirement looks fine, because a plausible `file:line` is always available for code
that exists. Naming the gap is the third option, and it **blocks acceptance exactly as a failure
does**. It is not an excuse slot; it converts "nobody checked this" from a silent pass into a
visible, blocking, repairable fact.

Fail-closed in every direction: an `unverifiable` sent as the wrong type yields a blocking entry
rather than an empty list, because returning `[]` there would let a reviewer disable the channel with
the cheapest possible evasion. An **absent** channel is a positive claim and is accepted, because
requiring a non-empty list would make fabrication the cheapest way to satisfy the contract.

**`attackAccount` has a length floor (`ATTACK_ACCOUNT_MIN`, 120), and the floor is the whole
mechanism.** Requiring the field only forces a reviewer to type something — "I tried to break it and
could not" is 34 characters and satisfies any non-empty test. It errs strict because the harm is
asymmetric: a genuine account runs to several hundred characters without effort, and a lazy
charitable pass is exactly the thing that cannot produce one. Not a list of forbidden phrases —
enumerating "n/a", "none" is the guard hook's enumeration defect, where each new evasion defaults to
accepted. Only a **pass** must account for itself; demanding paperwork behind a fail would add noise
to the reports already doing their job.

**Both fields are carried through `resolveReportEvidence`, and that is not bookkeeping.** That
function rebuilds the verdict against a real tree. It re-judges *citations* and has no view on what a
reviewer could not reach, so dropping either field there would silently restore a pass the parser had
just blocked — one layer later, and looking exactly like correct behaviour. `carriedReport` answers
both itself rather than leaving them absent: a carried pin has nothing unverifiable by construction,
and its account states the mechanism rather than imitating an attack nobody performed.

**Acceptance evidence.** 15 parser cases, 2 evidence-layer carry-through cases, 3 template-agreement
cases binding the documented example to the parser rules — the example must itself satisfy the floor
it documents, and it demonstrates a real blocking `unverifiable` entry rather than describing one.

**Tier 3 passed before this landed**, which the item required. `test/live/reviewer-contract.live.test.mjs`
gave a real `claude -p` reviewer the updated template and a small, genuinely **correct** tree — the
case worth paying for, because a reviewer failing broken code needs no account. It returned a usable
attack account, a well-formed `unverifiable`, and no complaint about either field's format. That is
the check no unit test could make: the parser is correct whether or not real reviewers comply, every
fixture supplies the field because a human wrote it knowing it was wanted, and if reviewers routinely
omitted it then **every clean iteration of every run** would fail on paperwork rather than on
software. 83 seconds, one child.

**The fixture churn was the rule working.** Thirty-odd existing reviewer fixtures across tier 1 and
tier 2 began failing on the new rule, each because it passed every requirement while saying nothing
about what had been attacked — which is precisely the lazy charitable pass this item exists to make
machine-detectable.

**Done when:** schema/parser fixtures prove a non-empty `unverifiable[]` blocks acceptance, a missing
or empty attack account cannot parse as `pass`, and valid hostile findings remain intact. Benign
neighbours prove ordinary evidence still parses; malformed or extra authority-bearing output fails
closed; the required tier-3 contract passes before the template/parser slice lands. — all met.

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

### 42. Design-slop gate drives impeccable's real `--json` interface (R29) — **IN PROGRESS (Slice A 0.152.0, Slice B1 0.228.0 with its installed residual discharged 0.267.0; B2 remains)**
Read impeccable's machine-parseable finding stream (advisory/primary partition, `file://` targets,
`--viewport`) instead of exit codes only; findings become reviewer evidence. Committed `--json`
fixtures. Surface: the design-slop gate in `scripts/gate-policy.mjs`/`scripts/toolchains`.
**Campaign C** — pairs with the web-ui smoke's design-slop exercise.

**Slice A landed (0.152.0):** `scripts/design-slop.mjs` `parseImpeccableFindings` — the pure parser,
partition on `advisory === true` (not severity; the fixture proved the trap), fail-closed, fixture-tested
against real impeccable 4.0.4 output (`test/fixtures/impeccable/`). No runtime change yet.
**Slice B1 landed (0.228.0) — the gate reads the stream.** The hold ("land alongside the web-ui
smoke") is discharged: 31a shipped 15 Aug. `scripts/design-slop.mjs` had been imported by its own
test and by nothing on any call path for eleven versions — the parser existed and no gate used it.

- The gate is `npx impeccable detect --json src/` and declares `interpret: 'design-slop'`.
- `runGates` honours a declared interpreter and lets it own the verdict **in both directions**. It
  may fail a gate the command passed, which is the point: `exit 0` from a detector that printed
  nothing is not evidence of a clean design pass, and under exit-code judging the two were
  indistinguishable. A **killed** gate is never interpreted — a fragment of a run that did not
  finish must not be handed to a parser that might succeed on half a document.
- Interpreters are a map of named functions keyed by a string on the gate, because gates are plain
  data: they are digested into the acceptance receipt, compared by the gate cache, and rendered into
  the builder's brief. A function field would break all three silently. One entry, not an
  abstraction built ahead of its second caller.
- `designSlopEvidence` renders primary findings as evidence (rule, file, line, description) and
  advisory findings **alongside them with no gate authority** — `em-dash-overuse` reports severity
  `warning` while being advisory, and a gate that failed on it would fail a run over punctuation.
  Advisory findings now reach a passing run at all, which the exit code could never do: `runGates`
  sets `detail: 'passed'` and discards stdout the moment a gate succeeds.
- Fail-closed on: unparseable output, an empty stream, output past `SLOP_OUTPUT_LIMIT` (refused, not
  truncated), and **a status that contradicts the stream** — impeccable exits 2 exactly when primary
  findings exist, so a disagreement means the status and the stdout came from different runs and
  neither is used. Truncation of a long list is stated rather than silent.

**Acceptance evidence for B1:** eight unit cases against the real committed impeccable 4.0.4 capture,
five `runGates` cases, and `test/integration/design-slop.integration.test.mjs` driving the real
`shell` against a counterfeit detector — the one link the unit tier cannot see, since every other
gate discards stdout on success and nothing else has ever depended on that value arriving. Proved red
by three mutations: interpreter never dispatched (3 fail), killed gates interpreted (1 fail),
advisory findings granted authority (1 fail).

**Slice B2 (pending):** the `--viewport` mobile pass and the `file://` artifact target. Split off
deliberately rather than bundled: both need a real browser and a built artifact, so their acceptance
is a live web run, and a slice that needs a second commit to be correct was too big. B1 changes no
behaviour that depends on either.

**Residual on B1 — discharged 20 Aug 2026 at 0.267.0, and it did not need a web run.** The gate's
**exact** pinned command was executed: `npx impeccable@3.6.0 detect --json index.html`, the pin in
`scripts/plugins.mjs`, against a deliberately sloppy static page. It emitted a JSON array and exited
**2** — the contract `designSlopEvidence` requires the stream to agree with, asserted from fixtures
until now and observed from the pinned CLI here. The capture is committed as
`test/fixtures/impeccable/slop-findings-3.6.0-quality.json`, and the `file://` half of the residual
still needs a browser and stays with Slice B2.

**Two things the real capture taught, neither of which a hand-written fixture would have.**

- **The description is per-rule boilerplate; the snippet is the finding.** Every `low-contrast` entry
  carries the same WCAG sentence, so twenty-five of them render as twenty-five identical lines. The
  snippet is what says *what* failed — `Primary font: inter`, `Purple/violet accent colors detected`,
  `3.3:1 (need 4.5:1) — text #000000 on #764ba2` — and it was being dropped. It is now rendered,
  bounded at 120 characters with visible truncation, for the same reason the finding list is bounded:
  the text comes from another program and its length is not this repository's to assume.
- **impeccable emits duplicates.** The capture contains a *byte-identical* `low-contrast` pair, so
  the count says four and three are distinct. Kept rather than trimmed, in the fixture and in the
  rendering: de-duplicating another tool's output would be this repository deciding which of its
  findings were real, and the count the gate reports has to be the count the tool produced. Recorded
  so a reader meeting two identical evidence lines does not go looking for what the renderer lost.

The capture also carries a `quality`-category rule where every earlier fixture is `slop`, which
pins that `category` is not the primary/advisory discriminator — `advisory` is, and its absence
reads as primary, which is the fail-closed direction.

**Validation:** lint, typecheck, `npm test` **3455 of 3455**, release-check ok at 0.267.0. Two red
proofs: dropping the snippet fails two cases, removing its bound fails one.

**Slice B original scope:** rewire the design-slop gate from `npx impeccable detect src/` (exit-code only,
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

## Historical DoD — superseded by the 19 August Standing Rules

This two-part bar is retained as rationale for the work it produced. It no longer controls scope,
phase order, or traversal; the current Definition of Done lives in the Standing Rules above.

The 14 August bar had two required parts:

1. **All outstanding features done, tested, fixed** — items 24 (→ DONE via the boxed dogfood),
   28, 29, the `BORROWED.md` R23–R33 menu, item 30's four candidates, and the owed measurement
   runs (oracle2, a race that actually applies a winner, cases A/B). Deferred/dropped stay out.
2. **The Next.js enterprise capstone below runs.**

Item 21 (the mirror — improve mode on this repo) was described as the final act. It and the capstone
were withdrawn on 19 August.

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

### 31. Capstone — build a chunky enterprise Next.js app, unattended, that RUNS — **WITHDRAWN (operator, 19 Aug 2026; specification retained as history)**

**Historical specification.** This was DoD part 2 under the superseded 14 August bar. It would have
been the largest dogfood attempted and the first serious **web-ui** target, exercising
`templates/frontend-direction.md`, the impeccable design-slop gate, Playwright e2e as ratchet
evidence at scale, and the health-probe confirming the dev server boots.

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

**Historical launch discipline:** only after part-1 features were code-complete, with the finished
machine. The PRD gets one hostile shippability review first (an impossible requirement would doom
the run the way the rejection PRD does). Expect many iterations and 100M+ tokens; uncapped is
intended (operator on max plan, budgets rank -0).

**Done when:** the run produces a Next.js app that builds and serves, with the seeded core flow
working end to end under Playwright — a full `SHIPPED` is the target, and a run that ends with a
running-but-incomplete app is documented honestly as a partial, not dressed as a ship.

## Historical Phase 6 classification — superseded by the current all-features DoD

This heading preserves the 14 August expansion rationale; it no longer assigns scope or gates work
on Tallyho or the withdrawn Ateliers capstone. The Standing Rules and each item's current heading
and admission clause control the live queue.

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

### 33. More language toolchains + reporters (Python, Go, Rust) — **DEFERRED (operator decision, 19 Aug 2026; outside the current DoD)**

New `scripts/toolchains/*.mjs` + `scripts/reporters/*.mjs` behind the existing fixed toolchain
contract (the same shape dotnet proved). Each: detect, map the gates, parse the framework's
reporter output into ratchet ids. **Invariant:** fixture-tests-over-mocks against real committed
reporter output; each new reporter owns a contract another binary defines → one **tier-2/3 live
check** per toolchain. The core loop is already language-agnostic (the ratchet parses reporter
JSON, not syntax) — this is surface, not spine.

**The operator made this a named exception to the all-features bar.** Revisit it only after the
current objective is complete or a newer directive restores it. The shipped `dotnet` toolchain is
unaffected and stays; the deferral is on *adding* toolchains, not on the ones already proved.

**What the abandoned Python probe measured, kept because it is the expensive half.** Nothing reached
the repository — this was captured against real binaries in a scratch tree, and every finding is the
`dotnet` trap arriving again: a command that exits non-zero for a reason that is not the one the
gate is asking about.

- **pytest has no built-in JSON reporter.** `pytest-json-report` is a dependency of the *target*,
  which the loop cannot assume and must not install on the target's behalf. `--junit-xml` ships with
  pytest itself, and dotnet already proved an XML report is readable here.
- **Identity cannot come from a path.** pytest's `classname` is a dotted module path
  (`tests.test_total.TestTotal`), and the only real file path in the document is an absolute one
  inside `<skipped>`/`<failure>` bodies. An id built from that differs between machines and the
  ratchet reads every test as new elsewhere — a *widening*, which is §11's silent failure. The id is
  `classname::name`, exactly the reasoning `trx.mjs` records, and a parametrised case's arguments are
  part of the identity.
- **Three of four gate commands exited non-zero on a tree with nothing wrong with it**
  (pytest 8.3.5, ruff 0.16.3, mypy 1.14.1, pip-audit 2.7.3, Python 3.8.10):
  - `mypy .` exits **2** on `Source file found twice under different module names` — a module
    resolution failure, not a type error.
  - `pytest -q` exits **2** on a collection error, which is a different fact from a failing test and
    must not be read as one.
  - `pip-audit` exits **1** from an internal pip traceback on a project with no dependencies at all.
  - Only `ruff check .` behaved: 0 clean, 1 dirty.

  A toolchain written from documentation would have wired all four and reported three permanent
  failures that mean "the gate never ran". Whoever resumes this starts from here rather than from
  the same four discoveries.

### 130. The Oracle guarantee, stated as what it is — **DONE (0.253.0)** (REVIEW F15)

F15 offers an explicit either/or: establish a measured read-isolation boundary for the Oracle store,
**or** *"rename the guarantee everywhere ... and stop treating it as confidential held-out
evidence"*. The first needs an OS boundary this environment cannot measure (item 84). The
second is entirely buildable, and it was overdue: three artifacts said three different things, and
the flattering one was shipped to a model.

**`templates/oracle-author.md` said "Nobody who writes it will see your cases."** That is false — a
builder running arbitrary code on the same machine can read the file — and it was told to the one
role whose whole job is writing cases that survive being looked for. It now states the guarantee it
actually has: the cases are never **handed** to the implementer, in a brief, a system prompt or any
feedback, while the implementer can read the file they live in. Removing the false sentence and
leaving nothing would have been worse, because the role would have had no reason to write hostilely.

**`scripts/oracle.mjs` carried an honest paragraph and a summary sentence contradicting it** —
*never shown to the thing it judges* — and a file that says both says the flattering one to anybody
who reads only the summary. It says **supplied** now. `DESIGN.md` was already correctly scoped by
*"Against satisficing"* at both sites, but its sentence read as absolute when quoted alone, which is
how it reached the finding; it says *never handed* now.

**And the receipt records the guarantee rather than leaving it to be inferred**, because the
available inference is the wrong one: *held-out* reads as *confidential*.
`results.oracleGuarantee` is `{ kind: 'not-supplied', confidential: false }`, and `null` when no
Oracle ran — an absent guarantee stays absent rather than describing the independence of something
that never happened. The `false` is the same honesty `role-supply.mjs` applies to `--safe-mode`: a
record of what was arranged, not a claim about what was enforced.

**Validation:** lint and typecheck clean, `npm test` **3372 of 3372** and
`npm run test:integration` **295 of 295**, both exit 0 and both unpiped. Eight red proofs:
the false claim returning to the prompt (2 failures), the prompt dropping its honest half, the module
saying *shown* again, the module dropping its honest paragraph, the design saying *shown* again, the
receipt claiming confidentiality, a run with no Oracle still describing one, and the guarantee not
recorded at all (2).

**Does not close F15.** Its acceptance also asks that terminal policy discount the Oracle
accordingly; what is recorded here is the classification a terminal reader needs, and the read
boundary itself remains item 84's.

### 131. Every record reader is bounded, and an inventory rule says so — **DONE (0.254.0)** (REVIEW F19)

F19's remaining objection was two things, and the second is the one that matters: *"the declared
record limit is not an inventory boundary"*, and *"primitive tests cannot detect an unconverted
caller."* `readBounded` was correct and `READ_LIMITS.record` already existed; sixteen readers across
eleven modules simply never called them, silently, for as long as the primitive had.

**Sixteen readers converted.** Ratchet state, pins, capability records, the supply ledger, the
assumptions log, the gate-skip cache, the event journal, the nesting ticket store, the Oracle store
and its manifest, the run lock and its takeover claim, and the security scan's store. Each is
monotonic state, a gate input, or a field of the terminal acceptance receipt, and each could be
overgrown by a test process, a background child or an operator **outside the hook's tool-call
boundary** — the guard sees tool calls, not every write on the machine. The security scan reads two
different things and now takes the limit that matches each: `evidence` for a candidate source file,
`record` for its own store.

**And the inventory rule, which is what F19 actually asked for.** A module owns a record when it
declares one's filename; every such module is then held to reading through `readBounded` and never
`readFileSync`. **Positional, not enumerated**, for §6's reason — a list of converted callers defaults
every *new* record reader to unbounded until somebody remembers to add it, which is precisely how
this gap opened. The rule carries its own vacuity guard: it asserts it found at least ten
record-owning modules first, because a broken glob or a renamed convention would otherwise produce an
empty list that looks identical to full compliance.

Every conversion was confirmed by the linter rather than by inspection: the now-unused `readFileSync`
import is what proves the last raw read in a module is gone.

**Validation:** lint and typecheck clean, `npm test` **3372 of 3372** (exit 0). Three red proofs: one
record reader reverted to a raw read, the journal reverted, and the rule finding no modules at all.

**Report cardinality landed too (same version).** `MAX_REPORT_TESTS` is 200,000, applied to
**every** reporter through one door — raw formats included — for the reason `spawnClaude` checks its
budget at one door: a format added later cannot forget it. `READ_LIMITS.report` caps a report at
32MB, and 32MB of `{"t":"x","s":"passed"}` is on the order of a million records, each becoming an id
string, a `Set` entry, a line of monotonic state and a digest. All of that amplification is
**downstream of the read**, so the read's limit cannot see it.

**It refuses rather than truncating**, which F19 states directly: a report parsed down to its first
records would advance the ratchet on a subset and record every dropped id as a regression on the next
run — a hard reset caused by the size of the report rather than by the code.

**The honest scope, stated in the module rather than implied:** this bounds what enters monotonic
state, not what `JSON.parse` allocated getting here. A synchronous parse cannot be interrupted
partway, so the byte ceiling remains the only bound on that step. Claiming otherwise would be the
overclaim §4 refuses.

Five further red proofs: the ceiling never applied (2 failures), an off-by-one boundary, the object
reporters bypassing the bound, a ceiling set below a real suite, and the refusal ceasing to explain
itself (2). `npm test` **3391 of 3391** and `npm run test:integration` **295 of 295**, both exit 0.

**Still owed for F19:** report *depth*. Bounding it would mean traversing an object `JSON.parse` has
already built, which is the allocation the byte ceiling already governs — so the useful version is a
streaming parser, and that is a larger change than this finding needs.

**The depth half landed at 0.282.0, by a third shape neither sentence above considered.** The
post-parse walk is useless (it measures the allocation after paying for it) and the streaming parser
is disproportionate — but a **linear scan of the raw text before the parse** is neither:
`nestsDeeperThan` in `scripts/reporters/index.mjs` counts brackets outside string literals, escapes
included, stops at the first breach, and `parseReport` refuses above `MAX_REPORT_DEPTH` (128) before
`JSON.parse` allocates anything. That closes the one attack the byte and record ceilings cannot see —
`'['.repeat(n)` is n bytes, zero records, and n arrays plus n stack frames inside a parse that cannot
be interrupted. Evidence: red first (missing export, then the refusal case against the unbounded
parser); boundary case proves depth-at-limit passes the depth gate and fails only reporter detection;
a bracket-laden test title inside strings stays uncounted; the committed vitest capture still parses.
`test/extract-test-ids.test.mjs` **68 of 68**, lint and typecheck clean, tier 1 at the owning commit.

### 132. Red evidence is stamped per id, not per file — **DONE (0.255.0)** (REVIEW F17, reopened)

F17's reopened half gives an exact reproduction, and the code's own comment stated the reasoning
that caused it: *"Recorded per file, matching the ratchet's own `definitions` map, because a defining
file is what `changedDefinitions` can compare and an id is not."*

**A and B share one file.** B is seen failing under the old bytes. The file is rewritten to weaken B.
Only A fails under the new bytes — and recording A **refreshed the file digest standing behind B's
stale observation**. B was then credited having never failed under the definition that ships, with
`stale=[]` and `withheld=[]` reported. The finding notes the existing tests use the same id or
different files, so none of them exercised siblings.

The comparison is still of a *file's* digest — that is the only thing there is to compare — but the
**stamp** now belongs to the id, so one id's fresh observation cannot vouch for a sibling's stale
one. `changedDefinitions` takes an explicit `keyedBy`, and the ratchet's own map deliberately stays
keyed by **file**: it answers *are the bytes this credit was banked against still on disk*, which is
a question about a file, and two ids in one file genuinely share the answer. Keying that by id would
store one digest twice and claim a distinction that does not exist — so that is its own test, as the
neighbour of the sibling case rather than a copy of it.

**Fail-closed on upgrade, and stated rather than discovered.** A store written under the old shape is
keyed by file, so an id finds no stamp and reads as changed: its evidence stops vouching until the id
is observed failing again. That is the only safe direction — nobody can say which definition a
file-keyed digest was recorded for.

**Validation:** lint and typecheck clean, `npm test` **3393 of 3393** and
`npm run test:integration` **295 of 295**, both exit 0. Three red proofs:
evidence reverted to file keying (6 failures, the sibling case among them), the comparator ignoring
its key mode (6), and an unknown stamp reading as unchanged.

**Still owed for F17:** the *"explicit path for legitimate test improvement"* its resolution asks
for. A rewritten test currently loses its credit until it is observed failing again, which is
correct and is also the whole cost of improving a test.

**Disposition recorded 21 Aug 2026: the explicit path exists, and it is re-observation.** Verified
against the code before recording: `unprovenIds` removes a changed definition from the
previous-passing exemption without scoring it as a regression, the driver's own comment names this
*"the path for legitimate strengthening, at the cost of one observation"*, and `redEvidenceGate`'s
operator-facing detail says how to complete it — observe the strengthened test failing once, and
credit returns. Nothing further is built for it, deliberately: a declarative "this rewrite is an
improvement" affordance would be the builder grading its own strengthening, which is the
self-judgement CONST-2 exists to refuse. The one-observation cost *is* the design. Whether that
satisfies the finding's phrasing is Codex's call at closure; the mechanism, its names in code, and
this reasoning are the acceptance evidence offered.

### 133. The candidate is sealed, not only the main tree — **DONE (0.256.0)** (REVIEW F14)

**The seal was on the wrong directory.** `workspaceIdentity` measures the operator's working tree and
`workspaceStillMatches` asks whether *that* drifted while the panel read. The panel does not read that
tree — it reads the **candidate**, at `candidateDirFor(process.pid)`, a path a Builder descendant can
compute from its parent and reach with ordinary Bash. Nothing was asking whether the bytes that were
judged were still the bytes that were judged.

`candidateMatchesTree` re-stages the candidate into its own temporary index and writes a tree,
exactly the way the snapshot was produced — so the two digests are comparable **by construction**
rather than by two functions agreeing about what to hash. A divergence discards the verdict and
re-gates, which is the standard F14 already accepts for the main tree.

**What this is not.** It does not make the checkout immutable, and nothing short of an OS boundary
does (item 84). It converts an *undetectable* mutation into a detected one. The finding's
remaining acceptance — *no integration case establishes that Builder descendants cannot reach the
materialized candidate* — is about prevention, and prevention is item 84's.

**Validation:** lint and typecheck clean, `npm test` **3396 of 3396** and
`npm run test:integration` **301 of 301**, both exit 0. Six red proofs:
the driver ignoring the seal, the seal never consulted, a mutated candidate reporting intact
(3 tier-2 failures), an unverifiable candidate passing, and a failed snapshot passing.

**Two fixture defects, both caught by mutation.** The unit cases first drove the default harness,
which never reaches a panel — the same mistake the milestone-event cases made, and the second time
this session. And the unwritable-index case first clamped `.git/worktrees` in the *main* repository,
where the snapshot succeeded anyway: the index is written inside the **resolved** git directory. A
mutation that changes nothing is not a proof, whichever direction it points.

### 134. The clean-clone acceptance traversal — **DONE (0.257.0)** (REVIEW F22, PLAN items 76/126)

F22's first acceptance bullet is a sentence about a **person**: *"a clean-clone auditor can start from
one `SHIPPED` receipt and resolve every required deterministic and independent-review edge to a
matching exact-tree artifact."* Items 125 and 126 put every edge in the record. Nothing walked them.

**`PLAN.md` disagreed with itself, and the disagreement was the state of the finding.** Item 126
called the traversal *"a separate harness"* still to be built; item 76 called the same remainder
*"not a build task ... an acceptance judgement"*. This repository's own precedent settles it: F20
made a claim of exactly this shape and was closed by a tier-2 clean-clone **test**, not by assertion
— because a receipt whose edges nobody has ever resolved is indistinguishable from one whose edges do
not resolve.

`scripts/audit.mjs` resolves six edges from an archived run plus a fresh clone and nothing else: the
receipt through its own verifier, the reviewed tree against `git rev-parse <commit>^{tree}`, the
specification against the PRD in the clone *and* against the archived record, the panel digest
against the archived `review.json`, the ratchet count against the archived outcome, and every
invocation's `supplyDigest` against an archived manifest — **including orphans**, since a recorded
supply belonging to no recorded invocation is the same ledger hole read from the other side.
`tools/acceptance-audit.mjs` and `npm run audit-receipt` make it a command Codex can run rather
than a claim.

**Two edges are `digest-only`, and naming them is the honest part.** `detailDigest` digests gate
output that is never persisted; `gates[].reports` digests report bytes `run-manifest.mjs`
deliberately excludes from the archive. There is nothing to resolve them *to*. They are reported as a
stated boundary rather than skipped — a traversal claiming complete coverage of a record it walked
only part of is the shape §4 refuses — and they do not make the result fail, because nothing is wrong.

**A real finding in the fixture, and it is about git rather than about this code.** The amended-commit
case passed against a traversal that should have failed it: `git clone` of a *local path* hardlinks
the whole object directory, so an amended-away commit is still resolvable. `--no-local` forces the
transport, which transfers only what is reachable — and is what an auditor cloning a published
repository actually gets.

**Validation:** lint and typecheck clean, `npm test` **3409 of 3409** and
`npm run test:integration` **306 of 306**, both exit 0. Nine red proofs: a
substituted tree, a rewritten specification, a tampered specification *record* (which needed its own
case — every rewrite case was also caught by the second of two checks, so removing the first left the
suite green), an edited panel record, a changed passing count, an unresolvable supply manifest, an
ignored orphan, unresolved edges not failing the result (12 failures), and a digest-only edge reported
as resolved.

**That separate slice landed too, at 0.258.0.** `archiveSealedReports` turns
`gates[].reports` from digest-only into resolvable — **conditionally**, which is the whole design.
A report on disk at archive time is the *last* iteration's; for a run that shipped that is the sealed
attempt's, and for one that stalled it may not be. So the bytes are digested with the receipt's own
`digest` and archived **only when they match what the receipt names**. An unmatched report is still
left behind.

That is not a softening of the original exclusion but its enforcement. The comment refusing to
archive reports said they would *"preserve an arbitrary moment while implying it was the run's"* —
true while nothing named an attempt, and the receipt now does, so there is finally a way to ask
rather than assume. The comment says both halves now.

Three red proofs: an unnamed report archived anyway, a per-run artifact listed twice (which would
rename it twice and fail the whole archive — a preservation feature turned into an outage), and the
archiver ignoring the sealed reports entirely. A fourth mutation removing the empty-claim
short-circuit is **equivalent** — an empty set matches nothing in the loop either — so it is labelled
in the source as a short-circuit rather than a guard, and it is not counted as a proof.

`npm test` **3415 of 3415** and `npm run test:integration` **306 of 306**, both exit 0.

Closure of F22 is Codex-owned.

### 135. The journal records what it is read for, and belongs to one run — **DONE (0.259.0)** (PLAN item 58)

Two defects, found by sweeping the plan rather than by anything failing.

**The journal was never archived, and three shipped statements said it was:** item 58's own
candidate, the driver comment at the read site (*"one line later `archiveOnce` moves it"*), and the
sentence `previousRunDiagnosis` prints to the operator (*"...and its journal is archived with it"*).
`JOURNAL_FILE` was simply absent from `PER_RUN_ARTIFACTS`. Nothing resets the file and `journalSeq`
restarts at zero every run, so one file held two runs' events with colliding sequence numbers.

**And two of five declared event kinds were never emitted.** `EVENT_KINDS` declares
`phase-entered` and `iteration-settled`, `unsettled()` handles both, and the driver wrote neither.
The reader was reading for facts the writer never recorded, with two visible consequences: every
diagnosis said *"the unknown phase"*, and every one named the **first started** iteration as
unsettled — so a run that finished iterations one through three and died in four reported *"stopped
during iteration 1"*. Emitted now at the gate pass and the review pass, which are the long windows
that spawn no child, and at the close of each iteration.

**Emitting is right; deleting them would have preserved the wrong answer.** The alternative on offer
was to drop both kinds from `EVENT_KINDS` so the reader stopped claiming what the writer never
wrote. That removes the false claim and keeps the false diagnosis.

**The two halves need each other, in the order that is easy to get backwards.** Before this slice the
masking scenario was *unreachable*: with no `iteration-settled` anywhere, a merged journal could not
settle anything. Emitting the event is what makes the archive necessary rather than merely tidy — an
earlier run's settle now cancels a later run's start, and `unsettled` reports `null` for a run that
died mid-iteration. Both are pinned.

**Three corrections found by the tests themselves.** A first masking case put the runs the wrong way
round and found no masking — the *later* run's settle covers the earlier run's iteration too, so the
damaging order is a completed run followed by a died one. A claimed symmetry does not hold: an
earlier run's `child-settled` can **never** cancel a later `child-started`, because appended events
always precede, and that is pinned so a reader does not hunt for a bug that is not there. And the
terminal iteration is legitimately unsettled — `previousRunDiagnosis` returns `null` the moment a
terminal receipt exists, so what must settle is every iteration the loop *moved past*; asserting
exact equality failed on the shipping run, which was the code being right.

**Validation:** lint and typecheck clean, `npm test` **3426 of 3426** and
`npm run test:integration` **306 of 306**, both exit 0. Four red proofs: the
journal not archived, no iteration settled, and each of the two phase windows unrecorded. The settle
proof needed a **multi-iteration** run to be real — with one iteration started and none settled,
"at least started minus one" is satisfied by settling nothing, and the mutation survived.

### 137. The last four, and two messages that were not true — **DONE (0.260.0)** (PLAN item 136 continued)

The four the twelve could not include, because two of them are **source** changes rather than test
changes.

**Two shipped messages stated something false.** `verifyAcceptanceReceipt` said *"this build reads
X"* where X is `expect.claim ?? ACCEPTANCE_CLAIM` — the *caller's* expectation. A person reading that
sentence is deciding whether their file or their tool is out of date, and it named the wrong one
whenever a caller supplied one. It says *"this reader expects"* now, and adds what this build writes
when the two differ. And `acquireRunLock`'s give-up said *"each one found another abandoned takeover
claim"*, which is one cause out of three: the loop also continues when a reclaimer has gone, and when
a contender displaces this one's claim between creating it and confirming it.

**Two tests could not fail.** `releaseTakeoverClaim`'s entire body is one `try`/`catch {}`, so
`doesNotThrow` held whatever it did — it now requires that somebody else's live claim survives and
our own is cleared. And the non-regular-file guard was tested with a *directory*, which throws
`EISDIR` at `open` one line before the guard and lands in the catch-all; the injectable io reaches it.

**Two repairs that first failed to prove anything, which is the lesson worth keeping.** The io stub
initially *threw* on read and append — landing in the same catch-all the directory fixture did, so
removing the guard still returned `'full'` and the mutation survived. Recording the calls and
requiring none is what distinguishes the guard from the catch-all. And the corrected message had no
assertion at all until one was written, so the wording could have reverted unnoticed.

**Validation:** lint and typecheck clean, `npm test` **3428 of 3428** and
`npm run test:integration` **306 of 306**, both exit 0. Four red proofs, one per repair.

### 136. Twelve tests that could not fail — **DONE (no version bump; tests only)**

Phase 2 is *testing and code fixes*, and this is that. A mutation sweep over the eight suites
guarding invariants — where a vacuous test is most expensive — confirmed **sixteen** tests that pass
no matter what the code does. Twelve are repaired here; the four needing a source change follow.

Every repair was then proved able to fail, which is the whole point: a test that could not fail,
replaced by another that cannot, is worse than before because it now looks deliberate.

The kinds, and they recur:

- **A near miss that misses entirely.** `ls /daredevil` was labelled *"a path that merely starts
  with /meeseeks"* and shares no substring with the command. Replaced — twice. The first replacement
  was `ls /meeseeks-data`, still wrong: `first` is `segment[0].value`, the thing being *invoked*,
  so in `ls /meeseeks-data` it is `ls` and the rule never sees the path. `/meeseeks-data/run.sh`
  reaches it, and turning `first === '/meeseeks'` into `startsWith` now kills the case.
- **A fixture that passes for the wrong reason.** Two capability cases named for `SKIP_DIRS` used
  `index.js` and `index.html`, neither of which is in `FRONTEND_EXTENSIONS` — so the walker skipped
  them by name and the directory rule was never consulted. A `.tsx` inside those directories is the
  real case, paired with the same extension outside them.
- **A value compared to itself.** `reads no clock of its own` called one function twice with
  identical arguments; a `Date.now()` implementation returns the same string for both, because they
  land in the same second. `binds one claim to one subject` asserted `receipt.version ===
  ACCEPTANCE_VERSION`, the constant the builder had just written. Both now name literals.
- **An assertion satisfied by the thing under test being absent.** `keeps the record` built
  `security: [retractPin(...)]` and asserted the array had one element — true if `retractPin`
  returned `null`. `does not mistake an array for a report` used arrays that fail every detector
  anyway; the case the guard exists for is an array *carrying* `testResults` and `numTotalTests`,
  which is legal and is what a malformed report looks like.
- **A refusal that could have come from anywhere.** `refuses a receipt with no subject` used a
  `SHIPPED` fixture, and the SHIPPED branch demands a commit in its own right. `refuses when the
  reviewed root cannot be resolved` asserted only `ok === false`.
- **A shell read judged against the wrong cwd.** `cat hooks/guard.mjs` resolved against the
  fixture's `/home/user/app`, so the argument named a file that is not the guard; the allow came
  from the protected-path check never matching, and the read carve-out never ran.
- **A property no assertion distinguished.** `leaves no temporary file behind, because the write is
  atomic` is satisfied by a plain non-atomic `writeFileSync`. It now seeds a stale temporary the
  way a crashed write would and requires the atomic path to consume it.

**Validation:** lint and typecheck clean, `npm test` **3426 of 3426** (exit 0). Twelve mutations,
one per repair, each killing the case it belongs to and previously surviving it.

**The confirming agents ran in isolated git worktrees**, because a mutation agent that shares the
operator's tree commits a mutant. Verified afterwards: the working tree was untouched and no
worktree was left behind.

### 138. "Paid" is not a category of blocker — **DONE (0.260.0)**

**The operator is on a Max subscription, and the standing instruction already said so.** A live run
spends quota and wall clock; it is not a purchase and needs no approval. `MEESEEKS_LIVE=1` is arming
rather than authorization — it exists so a suite that made no API call cannot report coverage.

The documentation said otherwise in **44 places**, and the consequence was not cosmetic: across a
whole session, every item whose remaining acceptance needed a real model call was classified as
blocked and skipped. Two eligibility sweeps then inherited that classification from the documents
they were reading and reported a drained queue that was not drained.

Corrected in `CLAUDE.md` and its `AGENTS.md` mirror (the tier table now says *makes real model
calls*, and a new paragraph states that cost is never a reason to defer), in `DESIGN.md` (7 uses),
in `PLAN.md` (44 uses), and across 38 test files whose headers stated the tier-2 boundary as *no
money* rather than *no API call* — which is what tier 2 actually promises.

**Two things were deliberately left alone.** The idiom *"a defect this project has already paid
for"* means what it cost to learn something and is untouched in all five surviving places. And the
run's own cost ceiling — `costCeiling`, `costUsd`, the budget tests — is a real product feature about
bounding a run, not a blocker on development; one of its comments already observed that *on a
subscription the binding constraint is the rate-limit window, not money*.

**`REVIEW.md` is not corrected here**, and cannot be: it is the Codex-owned ledger, and this repository's
rule is that Claude implements findings without rewriting them. It carries 16 instances of the same
framing, and they will keep suggesting a blocker that does not exist until Codex revises them.

**What this changes:** live-model work in items 20 A/B, 24's live half, 47's discharge, 57's
campaign, 80, 83, 84, 85, and 86 is authorized and is not blocked on cost. This does not satisfy an
item's other prerequisites or admission conditions; item 86, in particular, remains parked until
its admission list closes. What genuinely blocks a path is a capability absent here—a Win32 host
(65), a real browser (42 B2)—or a product decision only the operator can make.

**Validation:** lint and typecheck clean, `npm test` **3428 of 3428** and
`npm run test:integration` **306 of 306**, both exit 0; the `AGENTS.md` mirror test holds its body
byte-identical to `CLAUDE.md` after the permitted preamble.

### 139. The seal was built, documented, and never armed — **DONE (0.261.0)** (PLAN item 83)

**Origin:** Phase 2, 20 Aug 2026, found while scoping item 83's remaining authentication half. It
appears in no `REVIEW.md` finding and no prior item, because from inside the test suite it was
invisible.

**The defect.** `spawnClaude` verifies the sealed Claude binary before every child — *when it is
given a seal.* Nothing ever gave it one. `sealTarget` was exported from `scripts/claude-seal.mjs`,
unit-proven with eleven red proofs, fixture-proven against real PATH shadows, real atomic
replacements and real retargeted symlinks, named in `DESIGN.md` §3.5.1 as the mechanism a four-hour
unattended run depends on, and **called by no production path at all**. `options.seal` was
`undefined` in every real run, so the check was skipped in exactly the case it exists for.

Every one of the fifteen red proofs handed `spawnClaude` a seal directly. That is what made this
survivable: a guarantee whose only missing piece is a caller is indistinguishable from a working one
unless a test drives the real entrypoint with a real binary on a real PATH. It is the same shape as
item 128's Playwright report — a declared behaviour, an exercised code path, and no wire between
them — and the same shape the `spawn` seam in `DriverIo` was introduced to catch, described there in
its own words as *"correct code that nothing proved was ever called."*

**The repair.** `runInvocation` seals immediately after launch revalidation and hands the seal to
`runChild`, the one door that already supplies the context budget, the timeout and the environment
boundary — for the identical reason, which is now literal rather than cautionary. A binary whose
invocation closure cannot be bounded refuses there, beside launch revalidation and before any child
runs — after the run lock, which an earlier draft of this item claimed the opposite of.

A run that supplies its own spawner is not sealed, and that is not a loophole: an injected spawner
*replaces* the binary, so there is nothing on disk that run will execute and fingerprinting the
host's real `claude` would measure a file no child is launched from. It is also why the proof had to
be tier 2.

**Two further defects the new fixture found on its first run.**

- **The seal and its verification resolved different PATHs.** `verifySeal` defaulted to
  `realSealIo()` with no argument — `process.env` — while the seal was taken under the run's own
  environment. Every child refused with *"claude now resolves to ..."*. One `SealIo` is now built at
  the boundary and used for both halves, because a check that compares against an environment the
  run does not use is not checking the run.
- **The version clause was inert.** `spawnClaude` defaults `sealVersion` to `options.seal.version`,
  so `verifySeal` compared the sealed version against itself and could never fire. The version is
  now measured immediately before each child, under the sealed controls, as item 83 asks. The
  closure digests would have caught an ordinary update anyway — new code is new bytes — but not a
  launcher reporting a version from a file outside its own closure.

**Evidence.** `test/integration/claude-seal-run.integration.test.mjs` drives the real entrypoint with
no injected spawner against a fake `claude` that is a real npm-shaped launcher delegating to a real
node file. An unbounded launcher refuses at the boundary with no child having run; a sealable one
runs children, which is the neighbour that stops the first case scoring the same as a boundary that
refused everything; and a delegated entrypoint that **rewrites itself on its first `-p` call** stops
the next child — failure mode 5 committed for real, by a child, against the role that follows it.

Two red proofs. Removing the seal from `runChild`'s options lets the second child run against the
tampered binary — the exact state of the repository for the last eleven versions. Disabling the
boundary sealing fails two of the three.

**Two existing fixtures were repaired rather than exempted.** The journal and ancestry counterfeits
were single `sh` scripts delegating to nothing, which the compatibility policy correctly refuses;
the journal suite failed loudly. Ancestry did not, and that is the more instructive half: none of
its cases asserts a *successful* run and registration happens before the seal, so all four would
have kept their green ticks while the run they are about died at the boundary. Both counterfeits are
now launchers delegating to a node file, which is the install form npm actually produces and the one
whose bytes can stay identical while the code it runs changes.

**Validation:** lint, typecheck, `npm test` 3428 of 3428, `npm run test:integration` 309 of 309.

**Item 83 is unchanged in status.** Its sealed-identity half is now armed rather than merely built,
and what remains for closure is what REVIEW F28 already named: the pinned live runs at every admitted
compatibility boundary, and a measured non-interactive authentication check. `claude --version`
succeeds against an installation nobody has signed in to, and `DESIGN.md` §3.5 still tells operators
so.


### 140. The compatibility ceiling moved, on the run that was missing — **DONE (0.262.0)** (PLAN item 107)

**Origin:** Phase 2, 20 Aug 2026. Found while confirming that arming the seal (item 139) had not
bricked the operator's own install: `sealTarget` bounded it cleanly as a symlink to a versioned
native binary, and the version it reported was **2.1.235** — above the admitted ceiling. `/meeseeks`
had been refusing to start on this host since the CLI background-updated itself.

**Not a defect, and that is why it is recorded.** The refusal was the compatibility policy doing
precisely its job: 2.1.235's 18 August tier finished 33 of 34, isolated retries diagnosed the
failure as a known model-output flake, and item 107 refused to treat a diagnosis as a result. The
cost of that correctness was a host that could not run the product for two days. Both halves belong
in the record — a fail-closed rule that never costs anything has not been tested.

**The repair is the documented escape, run as documented.** `MEESEEKS_LIVE=1 npm run test:live`
against the 0.261.0 candidate on 2.1.235: **39 of 39, uncontended, 697 seconds.** `VERIFIED_THROUGH`
moved to 2.1.235 in one commit with that evidence, the evidence line records both runs rather than
replacing the failed one, and `checkClaudeCli` now admits the host.

**The refusal test was kept, not deleted.** `does not admit a release whose full live tier failed`
became `admits the release whose full live tier finally passed`, because the property it is really
holding is that this boundary moves on evidence and nothing else. Forward refusal is still proved by
the `99.0.0` case, and the floor, the 2.1.136 incompatibility and the widening instruction are
unchanged.

**Validation:** lint, typecheck, `npm test` 3428 of 3428, `npm run test:integration` 309 of 309, the
live tier 39 of 39, release-check ok at 0.262.0.


### 141. A run proves it can authenticate at the run boundary before any role — **DONE (0.263.0)** (PLAN item 83)

**Origin:** Phase 2, 20 Aug 2026. Item 83 named this as owed for closure and `DESIGN.md` §3.5
documented it as an open gap in the product's own words: *"an authentication failure may appear only
when the first real role launches."*

**The problem.** `claude --version` establishes availability and the measured version policy, and it
succeeds against an installation nobody has signed in to. On an unattended run that is the worst
available moment to find out: the lock is taken, the state is scaffolded, and the operator's night is
already spent before the first child reports that it could never have authenticated at all.

**The repair.** One `-p` call at the run boundary, immediately after sealing, under the sealed
controls, beside launch revalidation and before any child. `proveClaudeAuth` **proves the
capability and does not classify the
failure** — success is the positive conjunction of a zero exit, a parseable envelope and a result,
and everything else refuses and prints what the binary actually said. Nothing matches on "not logged
in" or any other message, because that text belongs to another program and would rot silently the
moment it changed; it is the same reasoning that keeps `extractTestIds` on committed fixtures rather
than on hand-written approximations. Stdin is closed and the call is bounded at 90 seconds, because
how an unauthenticated binary behaves is precisely what this repository does not own, and a probe
that could sit forever on a prompt would trade a fast refusal for a hung run.

Invoked as `claude` on PATH rather than by the sealed real path, because that is what a role
resolves. The seal is what guarantees the two are the same file.

**Evidence.** Two new cases in `test/integration/claude-seal-run.integration.test.mjs`: a binary that
answers `--version` and fails its `-p` call is refused with its own stderr quoted, no role runs, and
`.meeseeks/lock.json` does not exist; and on the healthy path the probe is asserted to have run
exactly once and first. Red proof: replacing the probe's verdict with `{ ok: true }` fails both.

**One thing the probe broke, and it is worth recording.** The tampering case in that fixture rewrote
the binary on the first `-p` call. The probe now *is* the first `-p` call, so the mutation landed
before any role existed — the run still refused, the assertion still passed, and the case had quietly
stopped testing what its name says. The counterfeit now records the probe apart from the roles and
tampers only on a role call. A test that keeps its green tick while its subject moves out from under
it is the failure mode this repository keeps finding in itself.

**And one live case, because the contract is another program's.** `test/live/binary-identity.live.test.mjs`
runs `proveClaudeAuth` against the real, signed-in binary. §11.1 is explicit that a contract owned by
a different binary needs one live check rather than more assertions; the tier-2 fixture proves the
refusal path against a counterfeit, and only this proves the accepting path against the article. It
is also the case that would catch the probe becoming permanently wrong — a CLI that stopped emitting
the envelope this reads would refuse every run on earth at the boundary, and the failure would
surface here first.

**Validation:** lint, typecheck, `npm test` 3428 of 3428, `npm run test:integration` 310 of 310,
`binary-identity` live 3 of 3, release-check ok at 0.263.0.

**Item 83's remaining half is now only the pinned boundary runs.** REVIEW F28 owns closure and only
Codex may close it.


### 142. The sandbox was declared and not enforced — **DONE (0.264.0)** (PLAN item 84, first tranche)

**Origin:** Phase 1, 20 Aug 2026. Item 84 says *live-contract first*, so the contract was measured
before any product code changed. `-p` mode silently ignores settings that fail validation, which
means acceptance proves nothing and only behaviour can answer.

**The measurement.** Twelve real children on 2.1.235, three profiles by four synthetic canaries, on
a host with neither bubblewrap nor socat. Every canary was synthetic: the "credential" was a file
the harness wrote into a temp directory and the outbound destination was `example.com`. No fork
bomb, no disk fill, no memory pressure — item 84 forbids those on an ordinary host.

| profile | credential outside workspace | outbound HTTPS | `~/.ssh` |
| --- | --- | --- | --- |
| no sandbox declared | read in full | 200 | listed |
| `{"enabled": true}` — **what this product shipped** | **read in full** | **200** | **listed** |
| `+ failIfUnavailable` | refused before start | refused | refused |

**`{"enabled": true}` confined nothing.** Its three results are identical to declaring no sandbox at
all, and R19's own live test recorded a pass throughout, because what that test asserted was that a
child *answers* — which an unconfined child does perfectly.

**Attribution, because two keys were changed at once.** With only `allowUnsandboxedCommands: false`
the child ran. With a control profile carrying an invented key the child also ran, which is what
rules out "any extra key produces an error" as the explanation. The refusal belongs to
`failIfUnavailable` alone.

**The repair, in two places that are not redundant.**

- `childSettings` declares `failIfUnavailable: true`, so the CLI refuses for itself rather than
  degrading. `allowUnsandboxedCommands: false` is declared and recorded as **unmeasured** — it
  governs escape from a working sandbox and this host has none to escape.
- `checkSandboxAvailable` probes **socat as well as bwrap**. It probed one while the CLI needs two,
  so a host with bubblewrap and no socat passed preflight and then ran children silently
  unsandboxed. The refusal names the missing tool individually, because "the sandbox is unavailable"
  sends an operator to the wrong package.

Preflight is a guess about dependencies made from outside the CLI; `failIfUnavailable` is the CLI
answering for itself. Both, because the failure they prevent is silent in the one place that must
not fail open.

**Two test defects this exposed, and they are the more useful half.**

- **The blob's shape was asserted only behind `MEESEEKS_LIVE`.** A structural fact about an argv
  string sat in the live tier, so it could change and no unpaid suite would notice. It changed, and
  none did — `npm test` was green across the whole edit. Tier 1 holds it now, with the
  no-sandbox-armed neighbour beside it.
- **The live case passed for the wrong reason.** It asserted a sandboxed child starts and answers,
  which on this host was true only because the sandbox silently degraded. It now branches: a host
  with both dependencies must produce a child that answers, and a host without must produce a
  **refusal naming the sandbox**. Both are guarantees; only one was ever checked.

**Validation:** lint, typecheck, `npm test` **3434 of 3434** (up 6), `npm run test:integration` 310
of 310, `sandbox-registration` live 4 of 4, release-check ok at 0.264.0. Two red proofs: reverting
the blob to `{"enabled": true}` fails the new tier-1 case, and dropping socat from the probe fails
two preflight cases.

**What this does not claim.** Nothing here demonstrates that a *working* sandbox confines anything,
because this host cannot start one. Item 84's filesystem/network/resource inventory, its hostile
canaries against each outbound surface, the `deny`/`mask` credential measurements and the auto-mode
behaviour all remain open, and they need a host with bubblewrap and socat installed. What is closed
is narrower and was the more urgent half: **the product no longer reports a sandbox it does not
have.**


### 143. The research producer's addenda — **DONE (0.265.0)** (PLAN item 34)

**Item 34's first implementation step, completed.** 0.246.0 factored `builder-system.md` into
`producer-authority.md` plus two code addenda precisely so a second job type would cost two files
and no change to the authority text. This is that second job type: `producer-research-practice.md`
and `producer-research-gates.md`, registered as `JOB_ADDENDA.research`.

**What the researcher is told, and why each part is there.** The checks suite is vitest over the
artifact, because that is the only runner `extractTestIds` reads and *zero parser work* is only true
through it. A claim without a source is not a finding. Quotations are verbatim and the check
normalizes whitespace and nothing else, since case and punctuation are where a real misquote hides.
One claim id means one value **within a unit**, and a cross-unit pair is referred rather than failed
so that nobody learns to bury figures in prose where nothing can check them. `unverifiable` is
presented as a real answer with a real channel, because the failure being prevented is a claim
dressed as verified by someone who felt that saying "I could not check this" was failure.

The gates addendum states which four gates decline and why, that a declined gate earns no credit,
and that the citation and claim checks run **inside the driver** where the producer cannot reach
them — the same reasoning `DESIGN.md` §3.8.4 gives: a producer asked to make a citation check pass
writes a lenient checker, while one asked to satisfy a check it cannot edit writes accurate
citations.

**Captured sources are evidence, never instruction**, said to the producer directly (items 77, 85).
Text acquires no authority by being inside a file it fetched.

**Nothing selects this job, and that gap is held declared rather than left to be found.** Job-type
selection is downstream of item 84. A test enumerates every `producerSystemPrompt('...')` call in
`driver.mjs` and fails if any job other than `code` is selected, so the day someone wires it, they
must come to this item and say so. That guard exists because this session spent a whole slice
repairing a mechanism that was complete, documented and called by nothing (item 139); the only
difference between that and this is that this one is written down where the next reader will be.

**One test was repaired rather than left passing.** `refuses to compose a producer for a job with no
addenda` used `'research'` as its example of an unknown job, so it would have started passing for
the wrong reason the moment these addenda landed. It now uses a job that genuinely has none.

**Validation:** lint, typecheck, `npm test` **3442 of 3442** (up 8), `npm run test:integration` 310
of 310, release-check ok at 0.265.0. Three red proofs: unregistering the job fails two cases, code
text appended to the research practice addendum fails the separation case, and a `research` caller
added to `driver.mjs` fails the declared-gap guard with the job named.

**Still blocked on item 34:** everything downstream of these addenda — the sealed research brief,
job selection, and the acquisition step — needs item 84's recorded containment outcome, whose
remaining canaries need a host with bubblewrap and socat installed.


### 144. The run observes its sandbox instead of trusting it — **DONE (0.266.0)** (PLAN item 84, second tranche)

**Origin:** Phase 1, 20 Aug 2026, after the operator installed bubblewrap and socat, which made the
measurement item 84 asks for possible for the first time.

**What a working sandbox turned out to enforce.** Measured on 2.1.235, canaries under `$HOME` rather
than `/tmp` — the first harness put its "outside" credential in the same tree as the workspace, which
proved nothing and was a flaw in the harness, not evidence.

| control | result |
| --- | --- |
| `sandbox.filesystem.denyRead` | **enforced**; the path reads as *No such file or directory*, masking existence rather than disclosing it |
| `sandbox.network.deniedDomains` | **enforced**; connection fails, twice measured |
| `sandbox.network.allowedDomains` | **not a boundary**; a host absent from the list is still reachable, twice measured |
| `sandbox.network.allowManagedDomainsOnly` | **no effect** from a `--settings` file; managed settings only |
| `sandbox` with nothing else | reads `$HOME` credentials and reaches the network freely |

The setting names and nesting were read out of the CLI binary rather than guessed, the same way the
`sandbox` key itself was: `sandbox.filesystem`, `sandbox.network.{allowedDomains,deniedDomains,
allowAllUnixSockets,allowManagedDomainsOnly}`, `sandbox.credentials.{files,envVars,
allowPlaintextInject}`, `sandbox.seccomp.bpfPath`.

**An egress allowlist is not available to this plugin**, and item 84's instruction is to describe the
narrower guarantee rather than call the child network-contained. A denylist is enforceable and is not
a boundary: you cannot enumerate the internet.

**The defect no settings key can close.** `failIfUnavailable` checks that bubblewrap and socat
*exist*, not that the sandbox *started*. On this WSL2 kernel `unshare(CLONE_NEWUSER)` fails, and a
child observed itself falling back: *"the sandboxed run failed first with `apply-seccomp:
unshare(CLONE_NEWUSER): Invalid argument`; I disabled the sandbox to get this real result."* That is
R19's recorded failure mode, reproduced, with the dependencies installed and the settings honoured.

**The repair is an observation, because only an observation can answer it.** `scripts/containment.mjs`
plus `proveSandboxConfines`: two canary files, one directory denied, one real child asked to read
both, at the run boundary, only when a sandbox was asked for. Reading the denied file refuses the run.

**The control is the load-bearing half.** A probe checking only the denied file would pass whenever
the child declined to try — a model saying "I won't" is indistinguishable from a kernel saying "you
may not", and the safer-looking answer is the wrong one. Requiring the *allowed* file back proves a
read was attempted. Neither file is inconclusive, and inconclusive refuses. Sentinels are random per
run, because a constant would live in this repository's source and a child that had merely seen it
could satisfy the probe without reading anything.

**A defect this shipped with two commits ago, found by its own live test.** `checkSandboxAvailable`
probed both tools with `--version`; **`socat --version` exits 1** and wants `-V`, so a host with socat
installed was reported as missing it and every sandboxed run would have refused. The unit fixtures
answered `ok` for any argv and could not see it — a probe double that ignores its arguments cannot
test the arguments. The fixture now models each tool's real flag and a case asserts the exact argv.

**A false claim, found by an adversarial review of this session's own diff and corrected in six
places.** The seal, auth and containment probes were described as running *"before the lock is
taken"* in a code comment, twice in `DESIGN.md`, in three PLAN paragraphs and in a test title. They
run **after** `acquireRunLock`, beside launch revalidation. Worse, the test asserted `lock.json` was
absent and passed for the wrong reason: `releasing` deletes the lock on the way out, so the assertion
discriminated *released* from *leaked*, never *never taken*, and would have stayed green with the
probe moved anywhere. The placement is right — `releasing` owns the lock and does not exist before it
— so the text was corrected to match the code, and the test now asserts the property it really has.

**Validation:** lint, typecheck, `npm test` **3451 of 3451** (up 9), `npm run test:integration` 310 of
310, `sandbox-registration` live **5 of 5** including the new observation case, release-check ok at
0.266.0. Red proofs: removing the `denyRead` from the probe's own settings makes a real child read
the denied sentinel and the verdict refuses; reverting `socat` to `--version` fails two preflight
cases.

**Four defects an adversarial review of this session's own diff found, all repaired in this slice.**
A five-lens panel over `3cb4f84..HEAD` raised findings and refuted them adversarially; eleven
survived, collapsing to four distinct defects. Two are recorded above (the false *before the lock*
claim and its vacuous assertion). The other two are:

- **The probes' timeouts were not bounds.** `execFileSync`'s `timeout` sends one `SIGTERM` and then
  waits indefinitely for a child that ignores it, sweeping no descendants — the pre-F2/F33 shape
  `shell` was built to replace everywhere else in this file. All three boundary probes now run
  through `shell`, so the ceiling escalates to `SIGKILL` and sweeps the group. A probe whose whole
  purpose is to fail fast must not be the one call that can hang a run before it starts.
- **Probe children spent real money that no receipt recorded.** `parseClaudeEnvelope` returns
  `costUsd` and `tokens` and both were discarded, so the authentication and containment children
  bypassed the accounting every other child passes through. They now report their spend and the run
  adds it to `preLoop`, **including when the answer was unusable** — spend counted only on the happy
  path is a receipt that understates by exactly the failures.

**And one thing the measurement itself said.** The authentication probe on the default model spent
**50,815 tokens and $0.377** to have "ready" said back to it. Authentication is account-level, not
model-level, so it now runs on haiku: **$0.051**, measured. A boundary check costing a third of a
dollar per run is a check an operator would reasonably delete.

**A fifth defect, in a test rather than the product.** The unbounded-launcher case asserted
`childrenSpawned === 0`, and its fake never wrote `calls.log` at all — so the assertion was true
because the file did not exist, and the case would have passed with the seal check deleted. The
launcher now records every `-p` invocation. With the boundary block disabled, the suite went from
2 failures to **4**.

**The outbound surface inventory, measured 20 Aug 2026 — and it decides a product question.** With
`example.com`, `google.com` and `anthropic.com` in `deniedDomains`: `curl` failed to connect (exit
56), the CLI's own **WebFetch returned both pages**, and **WebSearch returned results**. The network
policy is a *subprocess* boundary, not a role boundary.

The builder is `availableTools: null`, so it holds both tools. Declaring a denylist would constrain
the code a builder writes while leaving the builder itself able to fetch anything — and the run would
then be *described* as network-contained. Item 84's own instruction is to describe the narrower
guarantee rather than call the child network-contained, so **this design declares no network policy
and claims no network containment for a writing role**, and `DESIGN.md` §3.5 now says so with the
measurement attached.

Removing WebFetch and WebSearch from the builder through item **82**'s tool policy is the concrete
option that would narrow the gap, and it is **not taken here**: no network policy is armed today, so
there is nothing to narrow, and stripping a builder capability on the strength of a measurement
alone would be speculative. It becomes a prerequisite the moment a network policy is proposed.

**The resource posture is `absent`, and that is evidenced rather than assumed.** Item 84 requires
each limit to be recorded as enforced, merely available, or absent, and forbids calling filesystem
isolation a resource ceiling. The CLI binary carries **26** `sandbox.*` settings and **none** of them
names CPU, memory, process count, disk, or workspace growth. No exhaustion canary was run and none is
needed for this conclusion — the control does not exist to be tested, which is a stronger negative
than a canary that merely did not trip. This repository therefore states no resource guarantee for a
child.

**The credential measurements are deferred, with the reason.** Item 84 asks for `deny` and `mask` to
be measured *"for an explicitly required synthetic target credential"*. There is no such credential:
item **56** removed ambient environment values, the driver hands no secret to any child, and item
**106** — which would introduce one — is not admitted. Measuring a control for a credential that does
not exist is speculative infrastructure, which this repository refuses on principle rather than on
effort. It becomes prerequisite work the moment item 106 is admitted, and it is named there.

**MCP, plugins and Skills are the same finding as WebFetch, one layer up.** Restricted roles already
receive no MCP surface (item **82**: no `--mcp-config`, so an operator's servers cannot broaden a cold
role). The builder is `availableTools: null`, so it holds whatever the host CLI holds. The guarantee
is stated at the same narrowness for all of them: a sandbox constrains a builder's filesystem reads
and its subprocesses' network, and constrains nothing the builder's own toolset can reach.

**Still open on item 84, and each with its prerequisite:** the credential `deny`/`mask` measurements
(needs item **106**'s admission to have a credential worth protecting); auto-mode eligibility and
denial behaviour (measurable now, low value — item 84 itself says the classifier is model-judged,
cannot certify work, and cannot advance the ratchet); and the decision to remove WebFetch/WebSearch
from the builder (needs a proposed network policy to be narrowing anything).


### 145. A component sub-run was refused for producing exactly what it was asked to produce — **DONE (0.268.0)** (PLAN item 24)

**Origin:** Phase 1, 20 Aug 2026, found by running item 24's own outstanding live half — the boxed
one-component dogfood the operator authorized as measurement run 3. It had never been run. Item 24
has been `CODE COMPLETE` since 0.144.0 with 1962 tier-1 and 46 tier-2 tests passing, and the feature
**failed on its first honest exercise, in the one configuration it exists for**.

**The defect.** `git status --porcelain` reports **repository-root-relative** paths wherever it is
run. A phase declares its outputs relative to the driver's own directory — `PRD.md`, `.gitignore`.
For a top-level run those are the same strings, so the difference is invisible and every test wrote
them as equal. A component sub-run starts in `packages/<name>`, and the two spellings come apart:

```
the prd phase changed 2 path(s) it does not declare:
  packages/textstats/.gitignore, packages/textstats/PRD.md.
That phase declares PRD.md, .gitignore.
```

The sub-run aborted there, and the parent refused to build on a component that did not ship — the
correct behaviour on both counts, for a phase that had done nothing wrong. The same mis-spelling hid
the component's own `.meeseeks/` from `isMachineState`, so a nested run's bookkeeping also read as an
undeclared output.

**The repair.** `changedPaths` asks `git rev-parse --show-prefix` and expresses each path the way the
phase contract expresses it. The prefix is empty at a repository root, so the correction is a no-op
for every run that is not nested — a fix that changed top-level behaviour would be a regression
wearing the shape of a repair, and a neighbour case pins it.

A path **outside** the prefix keeps its root spelling and still refuses. That is deliberate: a
component sub-run that changed a file outside its own directory has done something undeclared, and
rewriting the path to look local would be the check disarming itself. An unreadable prefix throws
rather than defaulting to `''`, because assuming the root silently restores the defect on exactly the
runs that have a prefix.

**The test doubles could not have caught this, and that is the second lesson.** `changedPaths`'
existing runner answers every command identically, so it would hand `git rev-parse --show-prefix` a
porcelain listing. The new cases use a command-aware double — the same failure this session already
met in the `socat --version` probe, where a double that ignores its arguments cannot test the
arguments.

**Evidence.** Five cases in `test/launch.test.mjs`: the nested spelling, a path outside the prefix
still refusing, a nested `.meeseeks/` correctly excluded, the empty-prefix neighbour, and an
unreadable prefix refusing. Red proof: forcing the prefix to `''` fails four of them.

**And the run itself is the acceptance.** Re-run from a clean clone, the component sub-run passed the
phase that had aborted it — `specification: PRD.md at sha256:5026771…`, then `designing` — instead of
being refused at its first output.

**Validation:** lint, typecheck, `npm test` **3460 of 3460**.


### 146. A component's gates ran against an empty repository root — **DONE (0.268.0)** (PLAN item 24)

**Origin:** Phase 1, 20 Aug 2026, found by the same run as item 145 and one layer further in. With
the path-spelling defect repaired, the component sub-run reached its build loop — and then failed
**seven gates every iteration for five iterations** and stalled without one gate ever having run
against the code it was writing.

**The defect, and it is the same one wearing different clothes.** The candidate is a worktree of the
**whole repository**. `gateTree(candidate.dir, …)` runs at that worktree's root. For a top-level run
the root *is* the project, so the distinction has never existed — every test wrote them as equal
because for every tested run they were. A component's project is `packages/textstats`, so the gates
ran against a repository root with no `package.json`, no lint config and no tests:

```
npm error path /tmp/meeseeks-candidate-14477/package.json
npm error enoent Could not read package.json
```

Identical for `build`, `lint`, `types`, `ci`, `docs`, `quality:knip` and `security-audit`, every
iteration, until `STALLED: 4 iterations with no gate improvement`. The builder was told it was stuck
and could do nothing about it: the gates were not looking at its work.

**The repair.** `candidateProjectDir(candidateDir, prefix)` joins the run's own offset — the same
`git rev-parse --show-prefix` item 145 added — onto the candidate. Empty at a repository root, so
the correction is a no-op for every run that is not nested, and a neighbour case pins that.

**Two defects the tests found in the repair itself, which is the point of writing them.**

- `path.join` keeps the trailing separator git puts on a prefix, so one directory had two spellings.
  Normalised at the source rather than at each reader.
- The prefix was taken **eagerly** at the run boundary, before preflight establishes that this is a
  git repository at all — so a run started outside one died with *"git could not say where this
  directory sits"* instead of the refusal it had earned. Two component tests caught it within a
  minute. It is computed on first use now; nothing needs it until a candidate is gated, and by then
  the tree is known good.

**Validation:** lint, typecheck, `npm test` **3464 of 3464**.

**Item 24 is still not DONE.** Its live half asks for a boxed run that *ships* a one-component
repository. Two defects that made shipping impossible are removed; whether the component can now
satisfy seven gates from an empty directory inside its stall budget is the next run's question, not
this item's claim.


### 147. The gates cleared one tree and the reader looked in another — **DONE (0.269.0)** (PLAN item 24)

**Origin:** Phase 1, 20 Aug 2026 — and this one was **mine**, introduced by item 146's repair an hour
earlier and caught by the very next run of the same dogfood.

**The defect.** `gateTree(dir)` clears the declared report paths before gating and records what it
managed to remove, keyed by the tree it gated. `readTestReports` then looks that outcome up — and
computed the key **separately**, from `candidate.dir`. Item 146 changed what the gates are handed to
`candidateProjectDir(candidate.dir, prefix)`. For a top-level run the two are the same string, so
3464 tier-1 and 310 tier-2 tests agreed. For a component they are not, and the reader found no clear
outcome for the tree it was asking about:

```
ABORTED: test report could not be read: the declared report paths were never
cleared for this attempt, so nothing found at them can be read as this attempt's evidence
```

Fail-closed, correctly, on a run whose gates had just executed properly for the first time.

**The repair is structural rather than conventional.** `gateTree` now returns `dir` — the tree it
actually gated — and the loop records it. A convention that two functions independently compute the
same string is what failed; one source of truth is what replaces it. That is the same shape as the
seal's `SealIo` earlier today, where the seal was taken through one filesystem view and verified
through another.

**Recorded plainly because it is the third instance of one blind spot.** Items 145, 146 and 147 are
all "a component's directory offset was computed in a place that assumed there wasn't one", and each
was invisible until a real nested run existed. Unit tests could not see any of them: at a repository
root every one of these pairs is the same value, so the tests were not wrong, they were *unable* to
be wrong.

**Validation:** lint, typecheck, `npm test` **3464 of 3464**.


### 148. A declared deploy target, so an operator writes a host — **DONE (0.269.0)** (operator request, 20 Aug 2026)

**Origin:** the operator asked how a plugin user could deploy by putting a droplet IP in the config
instead of hand-writing an argv. `deploy.command` required the whole invocation, and every part of it
is silent when wrong: the rsync trailing slashes decide whether the build's *contents* or the build
*directory* lands at the destination, and a missing `BatchMode=yes` turns a passphrase prompt into a
run that hangs until its ceiling kills it — which `runDeploy`'s own timeout message already says.

**`deploy.target` names a host and the build writes the command** (`scripts/deploy-target.mjs`,
`DESIGN.md` §10.2). Exactly one of `target` and `command`, refused rather than merged: a section
carrying both has two answers to "what does this run". An unknown `kind` is refused by name, and
`dir` is required rather than inferred — `dist`, `out`, `build` and `.next` all exist, and guessing
is the trap §3.8.3 refused when it declined to invent `vale`'s command line.

**Proved against a real host the same day, which is the only reason it ships as verified.**
`VERIFIED_DEPLOY_TARGETS` is deliberately separate from the kinds this build can emit. `ssh-static`
graduated on 20 Aug 2026: the derived argv exited 0 against an Ubuntu 22.04.5 DigitalOcean droplet
already serving `/srv/preview/site` via `python3 -m http.server`, and the host then answered **200**
on `/` and `/health` with exactly the bytes pushed. **The command executed was the one
`deployCommandFor` emits**, not a hand-written equivalent — a profile proved by a different command
than it produces is not proved at all.

**No credential enters meeseeks**, which is why this is not item 106's territory: `ssh` uses the
operator's own key and agent, no secret reaches a role, and no capability is minted. The Driver runs
a command; it is not granted access to anything.

**Two things observed on the operator's droplet and reported rather than changed.** Its web server is
`python3 -m http.server` started by hand inside a transient login scope — seven days uptime, and it
will not survive a reboot. And `ufw` allows **2375/tcp and 2376/tcp from anywhere**, the Docker
daemon ports; nothing is listening on them today, but if Docker is ever installed with its TCP socket
enabled that is unauthenticated remote root. Neither was touched.

**Validation:** lint, typecheck, `npm test` 3471 of 3471 before the entry-point rule, `deploy-target`
7 of 7, `config` 146 of 146, and the live droplet deploy above.

### 149. Preflight was a silent no-op on any path with a space — **DONE (0.269.0)** (feature audit, 20 Aug 2026)

**Origin:** the 30-feature evidence audit, confirmed by reproduction before it was believed.

**The defect.** `scripts/init.mjs` decided whether it had been invoked directly with
`` import.meta.url === `file://${process.argv[1]}` ``. String concatenation is not a URL for any path
needing percent-encoding — a space, a `#`, anything non-ASCII — and it is **never** one on Windows,
where argv[1] is `C:\...` while `import.meta.url` is `file:///C:/...`.

When that comparison is false the file runs `main` for nobody: it prints nothing and **exits 0**.
`commands/meeseeks.md` reads a zero exit as *preflight passed* and shells straight to the driver, so
**all thirteen refusals are bypassed silently** — on a plugin installed under a path with a space in
it, which `~/.claude/plugins/cache/` under a real user's name routinely is.

Reproduced: this tree copied to a directory named `plug in`, run in a non-git directory, printed
nothing and exited 0; the same file at an unspaced path printed thirteen checks and exited 1. After
the repair the spaced path prints thirteen checks and exits 1.

**`driver.mjs`, `configure.mjs` and `health-probe.mjs` already guarded themselves correctly.**
`init.mjs` was the only one that did not, which is why the test is a **positional rule over every
script** rather than a case about this file: no script may build a `file:` URL by concatenation, and
every script that inspects `process.argv[1]` must resolve it through `pathToFileURL`. The second half
is the neighbour — deleting the comparison entirely would satisfy the first while leaving a script
that never runs its own `main`.

The rule immediately flagged the repair's own explanatory comment, so it strips comments first: a
rule that cannot tell an example from an instance would forbid describing the bug.


### 150. The acknowledgement was parsed and never read — **DONE (0.270.0)** (feature audit, 20 Aug 2026)

**The defect.** `parseDriverArgs` produced `yes` from `--yes`, and **no line in `driver.mjs` ever read
it**. `main(['PRD.md'])` with no flag reached the design and builder phases and spawned children with
`--dangerously-skip-permissions`. A test asserted `parseDriverArgs(['--yes', ...])` returns
`yes: true` — an assertion about a parsed field, which passes whether or not anything acts on it.

**Two layers of nothing.** `preflight`'s `checkDangerAcknowledged` was the only enforcement, and item
**149** found `init.mjs` exiting 0 silently on any path containing a space — so on those hosts the
sole check did not run *and* this one did not exist. The thing that actually spawns permission-
bypassing children has to answer for itself, which is the same conclusion item 142 reached about the
sandbox: preflight is a statement made once, elsewhere.

**The repair.** The driver refuses without `--yes`, before any child is paid for, and says why. The
nested driver already passes the flag explicitly (`components.mjs`), because nobody is watching a
component's prompts either — so nothing in the product changes behaviour. Every driver `main` call in
the suite already supplied it too; the flag had simply never been load-bearing.

**Evidence.** A case in `test/components.test.mjs` drives `main([])` with a recording spawner and
asserts exit 1, **zero children**, and a message naming the flag. Red proof: disabling the refusal
fails it. The parse-level assertion is kept, with a comment recording that it is a statement about a
field and not about behaviour.

### 151. Thirty features measured against evidence, not against their status lines — **RECORDED (20 Aug 2026)**

**Why this exists.** The operator asked how many features work. `PLAN.md` self-reports 118 of 145
items `DONE` or `IMPLEMENTED`, and this session had already proved that number untrustworthy in both
directions three times: components were `CODE COMPLETE` and broken (items 145–147), the sealed binary
was documented and dead (item 139), and item **80** claimed unbuilt work that shipped fifty-eight
versions earlier.

**Method.** Features were enumerated from `DESIGN.md` — the source of truth for what the product
*offers* — rather than from `PLAN.md`. Each was judged on two questions: is it **reached in the run
path**, and is it **tested in the configuration it actually runs in**. Every verdict of *working* was
then attacked by an independent agent instructed to refute it. **Five were overturned.**

**Result: 4 working, 11 broken, 15 incomplete, 0 unverifiable.**

Working: the design-artifact phase and its declared-output allowlist; the guard hook; the
agent-config security scan; the run lock with nesting tickets and the ancestry register.

**The recurring shape, and it is one shape.** A feature is unit-tested in the configuration where the
hard part disappears. Components were tested at a repository root and only ever run in a
subdirectory, so two path spellings that differ only when nested were written as equal — 2008 tests
that were not wrong but *unable* to be wrong. `init.mjs` was tested by nothing at all. `--yes` was
asserted as a parsed field nothing read.

**This is a queue, not a verdict.** Items 149 and 150 are its first two repairs. The remaining
findings are worked in the ordinary way: confirm the reproduction first — an agent's finding is a
claim — then repair, then a test that would have caught it.

**Not treated as an external review.** `REVIEW.md` is Codex-owned and untouched; this is a
development measurement recorded where development work is recorded.


### 152. A specification that asked for nothing checkable ran anyway — **DONE (0.271.0)** (feature audit, item 151)

**The defect.** `requiredIdsFor` appends the six `DoD-*` ids unconditionally, so the required set is
never empty. A document whose only requirement reads *"the admin area should be secure and follow
best practices"* — the `prd-author.md` template's **own worked counter-example of an untestable
requirement** — produced zero `PRD-*` ids and six DoD ids, and the run went prd → design → builder
without a word.

Nothing downstream could notice. The panel judges the ids it is given; given only the generic floor
it can return unanimity over it, and the run ends `panel unanimous on 6 requirement(s)` where not one
of those six is a requirement of the product being built. The whole premise — numbered testable
requirements become the review checklist — is absent, and the output looks identical to a run where
it was present.

Verified by execution before it was believed: `requiredIdsFor` on that prose returns exactly the six
DoD ids.

**The repair.** The capture refuses a specification containing no `PRD-<section>.<n>`, at the first
moment the document exists in both modes — authored from an idea, or handed over as a file — and
before the first paid child. One regex against an hour of work and an empty verdict.

**The DoD ids stay unconditional**, and that is deliberate rather than overlooked: they are the floor
every run is held to, bought with dogfood run 9's shipped defect. The point is not that the floor is
wrong; it is that **a floor is not a specification**.

**Evidence.** Two cases in `test/integration/confirm-prd.integration.test.mjs`: the untestable
document refuses with exit 1, no design phase runs, and the message names the id shape; and a
document stating one requirement proceeds to design — the neighbour, without which a check that
refused every specification would score the same. Red proof: disabling the refusal fails the first.

**Validation:** lint, typecheck, `npm test` 3481 of 3481, `confirm-prd` 6 of 6.


### 153. The held-out oracle gate read a directory the store is never in — **DONE (0.272.0)** (feature audit, item 151)

**The defect, and it made a flagship guarantee unsatisfiable.** `staticGates` uses `meeseeksDir` for
exactly one thing: the held-out oracle store. The driver handed it `treeStateDir` — the *candidate
worktree's* `.meeseeks` — while `writeOracle` writes the store to the *Driver's* `.meeseeks`.

Since 0.218.0 those have been different directories: the candidate is a separate snapshot worktree,
and `driveRun` aborts rather than falling back to the live tree, so **there is no configuration in
which they coincide**. The store cannot travel into a candidate either — `.meeseeks/*` is ignored
with a single carve-out for `config.json`, and a tier-2 case already asserts by real `git add -A`
that `oracle.json` is never staged.

**Measured, not argued.** Against one candidate tree and one store, changing only the state
directory:

| gate reads | verdict |
| --- | --- |
| the candidate's `.meeseeks` (what shipped) | `ok:false` — *"no held-out cases: the oracle was never authored"* |
| the Driver's `.meeseeks` | `ok:true` — *"1 held-out case(s) passed"* |

So for any run with `oracle.enabled` the gate failed **every iteration, unsatisfiably** — a gate no
amount of better code could pass — while the run's own log said the author had held out cases. The
message is indistinguishable from a run where no oracle was ever written, which is why nothing
downstream noticed.

**The repair** is one identifier: the call site passes `runStateDir`. `meeseeksDir` feeds nothing
else in `staticGates`, so the change reaches the oracle and nothing more.

**Why no test saw it.** Every case in `test/oracle.test.mjs` wrote the store and read it back through
the **same** directory, so the writer and the reader could not disagree. Two cases now pair a writer
directory with a different reader: the Driver's directory passes with one held-out case, the
candidate's reports the store as never authored.

**And the wiring is held positionally**, for the reason §6 gives about enumeration: `gateTree` lives
inside `runInvocation`, which no tier-1 test executes, so a rule over the driver's source asserts the
call site names `runStateDir` and not `treeStateDir`, with a neighbour asserting the gates still run
against the candidate tree — confusing those would gate the wrong subject.

**This is the fourth instance of one blind spot in a day.** Items 145, 146, 147 and now 153 are all
"two directories that are the same at a repository root and different in the configuration the
feature actually runs in". Unit tests could not see any of them, because at a root every one of these
pairs is a single value.

**Validation:** lint, typecheck, `npm test` 3481 of 3481 before the new cases, `oracle` 61 of 61,
`driver` 661 of 661. Red proof: restoring `treeStateDir` fails the positional rule.


### 154. Three lesson-store transformers deleted the parts they did not own — **DONE (0.273.0)** (feature audit, item 151)

**The defect.** `saveLessons` writes `candidates`, `rejected` and `retracted` from whatever store it
is handed. Three transformers rebuilt the store from the fields they cared about and dropped the
rest, so `saveLessons(meeseeksDir, markLessonsUsed(store, ids))` — **one brief that selected a
lesson** — emptied all three.

Reproduced end to end against a real store before any repair:

```
before: lessons=1 candidates=1 rejected=1 retracted=1
after : lessons=1 candidates=0 rejected=0 retracted=0
```

**The retraction is the one that matters.** It is the record that a lesson was judged harmful; with
the ledger gone the same text can be staged and promoted again. `saveLessons`' own comment describes
this exact failure being fixed once already — *"a retraction survived exactly until the next save"* —
and `retractLesson` then dropped `candidates` and `rejected` in the same motion, which is the same
bug half-repaired.

**Three offenders, not one:** `markLessonsUsed` (all three fields), the lesson-add path
(all three), and `retractLesson` (candidates and rejected). Each now spreads the store it was given.

**Evidence.** A table over the transformers in `test/lessons.test.mjs` rather than a case per
function, so the next one added is covered by construction rather than by somebody remembering, plus
a neighbour asserting each still does the work it was called for — a transformer that returned its
input unchanged would pass every preservation case. Red proof: removing the spread from
`markLessonsUsed` fails it.

**Validation:** lint, typecheck, `npm test` 3489 of 3489, `lessons` 62 of 62.


### 155. The .NET adapter detected a nested project and then never named it — **DONE (0.274.0)** (feature audit, item 151)

**The defect.** `findProjectFile` walks two levels and its own comment calls `src/Foo/Foo.csproj`
*"the conventional layout"*; a test asserts `detect()` returns exactly that. Every operation was then
argv with **no project argument** — `dotnet build`, `dotnet format --verify-no-changes`,
`dotnet test …`, `dotnet restore --force …` — and the driver runs gates with `cwd` at the tree root.

Reproduced against **dotnet 8.0.423**, the SDK this adapter cites as its verification baseline:

| layout | `dotnet build` at the tree root |
| --- | --- |
| project at the root | exit 0 |
| project at `src/Probe.Lib/` | exit 1, `MSBUILD : error MSB1003: Specify a project or solution file` |

So for the layout the detector documents as normal, **build, lint and the audit could not pass** —
the §4.2 defect class, a gate no amount of correct C# satisfies. `startCommand` already handled
nesting with `dotnet run --project <dir>`, so the author solved it for one operation and not the
other five.

**The repair.** `projectArgs(root)` returns the detected path when it is below the root and **nothing
when it is at the root** — so every command this adapter's header records an exit code for is
byte-identical to what it was, and the recorded evidence still describes what runs. Verified against
the real SDK after the change: `dotnet build src/Probe.Lib/Probe.Lib.csproj` and
`dotnet format src/… --verify-no-changes` both exit 0 from the tree root.

**A second defect found while fixing the first.** `dotnet.mjs` carried no
`/** @type {Toolchain} */` annotation — `node.mjs` does — so its object literal was never checked
against the interface. That is why five operations could take a context parameter the contract
describes while nothing verified they matched it. Annotated, which immediately surfaced two widened
types that had been invisible.

**Why no test caught it:** the nested-detection case and the operation cases were never composed.
Operations were asserted against a fixed synthetic context, so nothing ever asked what they *say* for
the tree the detector was tested on. Three cases now compose them, including the root neighbour and
one on argument order — `dotnet format <project> --verify-no-changes`, not the reverse, because
argument order is another binary's contract and this repository has been bitten by exactly that.

**Validation:** lint, typecheck, `npm test` 3488 of 3488 before the new cases, `toolchains` 102 of
102, and the two nested commands run against the real SDK. Red proof: making `projectArgs` always
return `[]` fails two of the three.


### 156. An advisory could fail the whole panel — **DONE (0.275.0)** (feature audit, item 151)

**The defect, and it inverts a stated invariant.** `resolveReportEvidence` pushed a member-level
*problem* when an advisory's citation did not resolve. `combinePanel` counts a member as a pass only
when `problems.length === 0`, so that advisory disqualified the reviewer — and under
`requireUnanimous`, failed the panel.

`DESIGN.md` says *"§4.1 says an advisory cannot move the verdict in either direction"*, and
`combinePanel`'s own comment says advisories never reach it because *"a number must not be able to
hold a compliant build back"*. They reached it through the shared `problems` channel.

Measured before the repair — one passing requirement with a resolvable citation, a valid attack
account, and one advisory citing a file that does not exist:

```
member verdict after resolution: pass
PANEL VERDICT                  : fail
```

**A compliant build, failed by a suggestion with a typo in its citation.**

**The repair** records the reason on the advisory that earned it rather than in the array that
decides verdicts. The finding is still disarmed (`actionable: false`), so the builder is never sent
to a file that is not there, and `recordPanelVerdict` persists the member reports whole — the reason
travels into the run's durable record instead of into the verdict.

**Why the tests said otherwise.** The case named *"does not let an advisory failure change the
verdict"* calls only `parseReviewerReport`, the one layer where the property still held. And
`test/evidence.test.mjs` asserted `resolved.problems[0]` matched the advisory id — **locking in the
breaking behaviour** without ever running `combinePanel` over it. That assertion is now inverted, and
a new case runs the two functions together, which is where the property actually lives.

The neighbour is the one that matters: a *requirement* marked pass on a citation that does not
resolve is still flipped to fail and still disqualifies the member. That is REVIEW F6 and the repair
had to leave it untouched.

**Validation:** lint, typecheck, `npm test` **3493 of 3493**, `evidence` 35 of 35. Red proof:
restoring the member-level problem fails two cases.


### 157. The gated tree and the subject drifted apart — **DONE (0.276.0)** (feature audit, item 151)

**The fifth instance of one blind spot in a day, and the second caused by repairing the fourth.**
Item 146 moved the gates to `candidateProjectDir(candidate.dir, prefix)` for a component sub-run and
left `candidateSubject` returning `candidate.dir` — the candidate **repository root**. At a
repository root those are the same string. For a component they are not.

**The consequence is silent and total.** `gateTree` parses reports with the gated tree as `rootDir`
and writes red evidence keyed `test/foo.test.mjs::x`; `driveRun` parses the same reports against the
subject and produces `packages/textstats/test/foo.test.mjs::x`. `toPosixRelative` resolves absolute
report paths against whichever root it is handed, so the two spellings are **disjoint**:
`unprovenIds` intersects nothing, every passing test is unproven, `credited` is empty, and **the
ratchet can never advance for a component sub-run**. The definition digests key by the same ids and
miss identically.

**One value is right for every reader**, which is why this is a single correction rather than a
per-caller one: `subject()` also resolves reviewer citations and the agent-surface scan, and the
reviewer child runs with `cwd` set to the component's project — so its citations are project-relative
too, and the surface worth scanning is the component's own.

The prefix is now resolved **once**, before the loop, and shared. It is still taken lazily elsewhere
because a run started outside a git repository must fail with its own refusal rather than with *"git
could not say where this directory sits"*; by the time the loop starts, launch revalidation has
established the repository, and `candidateSubject` is synchronous.

**The rule pins the agreement, not the expression.** Both must derive from the same
`candidateProjectDir(candidate.dir, resolvedPrefix)`, and `resolvedPrefix` must be computed exactly
once — because the failure mode is not a wrong value, it is *two* values, which is how the pair
drifted in the first place.

**Validation:** lint, typecheck, `npm test` **3493 of 3493**, `driver` 663 of 663. Red proof:
returning the subject to `candidate.dir` fails the agreement rule.


### 158. A required design gate passed having scanned zero files — **DONE (0.277.0)** (feature audit, item 151)

**The defect.** The impeccable gate's argv ends in a hardcoded `src/` (`scripts/plugins.mjs`), while
the `web-ui` capability that arms it is detected from **dependencies** — react, react-dom, vue,
svelte — not from a directory. Any UI project whose interface is not under `src/` — a Next.js
app-router tree, for one — therefore armed a *required* gate and passed it having examined nothing.

Reproduced against the pinned 3.6.0 CLI in a directory with no `src/`: a warning on stderr, `[]` on
stdout, **exit 0**. `designSlopEvidence` reads stderr only in its empty-*stdout* branch, so a
well-formed empty array at exit 0 returned *"impeccable found nothing, primary or advisory"* — and
`test/design-slop.test.mjs` asserted exactly that, locking it in.

This module's own header says an empty stream is not evidence of a clean design pass. The rule was
bypassed because the emptiness arrived as an empty **array** rather than an empty stream.

**The repair.** Interpreters now receive the working directory and the argv alongside the output, and
the design-slop interpreter refuses when the directory it was pointed at is not in the tree. Checked
against the **filesystem**, not against impeccable's warning text: that wording belongs to another
program and matching it would rot the first time it changed.

**Two guards keep it honest rather than merely strict.** A caller that supplies no `cwd` gets the old
behaviour — every existing call site does, and a refusal they cannot act on would be a regression
dressed as a fix. And a `cwd` that does not itself exist is not judged: the command could not have
run there at all, so its output is a fixture rather than a scan. In a real run the working directory
always exists, so that guard never fires where it matters.

**Evidence.** Four cases: the missing directory refuses and names it; **an empty finding list with the
directory present still passes** — the neighbour, and the whole distinction, since "found nothing"
and "looked nowhere" are the same bytes on stdout; a trailing flag is not mistaken for a path; and a
caller with no tree is unchanged. Red proof: ignoring the missing target fails the first.

**Validation:** lint, typecheck, `npm test` **3499 of 3499**, `design-slop` 28 of 28.


### 159. The ci gate credited commands nothing runs — **DONE (0.278.0)** (feature audit, item 151)

**The defect.** `inspectCiWorkflows` concatenated the **whole text** of every workflow file and
matched the toolchain's ci patterns against all of it. Its own comment said so: *"take the whole
file's text for the command search and rely on the patterns being specific enough to mean
something."* They are not specific enough, because a workflow file contains prose.

Reproduced: every step `run: echo nothing`, `# npm run build` in a comment, steps named `eslint`,
`typecheck`, `vitest` and `playwright` — result `covered: [build, lint, types, unit, e2e]`,
`missing: []`, gate **ok**. A job key, a step `name:`, or a comment satisfied the gate the DoD
depends on.

**And `continue-on-error: true` was invisible.** A step whose failure cannot fail the workflow is not
verification. This file's own docstring records dogfood run 2 shipping exactly that shape on a
Playwright step, **caught only by the model panel** — the deterministic gate could not see it then
and could not see it now.

**The repair.** `ciRunText` reads only the bodies of blocking `run:` steps: inline commands and
`|`/`>` block scalars, with a step dropped when it carries `continue-on-error` set to anything but a
literal `false`. Deliberately a line reader rather than a YAML parser — this repository ships no
runtime dependencies, and the question is narrow. Shapes it cannot read contribute no text, which
makes the gate stricter rather than more permissive; `if:` conditions, matrix exclusions and `uses:`
workflows are named as unmodelled for the same reason.

Measured after the repair: the hostile workflow covers **nothing**; an honest one covering build,
lint, types, unit and e2e — including a block scalar carrying two commands — still passes; and that
same honest workflow with `continue-on-error: true` added to its e2e step reports `missing: [e2e]`.

**My own tests had the defect they were written to catch.** Every new case called `ciRunText`
directly, so the red proof — reverting the call site to whole-file matching — **passed**. Correct
code that nothing proved was called, in the tests for a fix about exactly that. A case now drives
`inspectCiWorkflows` over a real workflow tree, and the mutation fails it.

**Validation:** lint, typecheck, `npm test` **3506 of 3506**, `driver` 671 of 671.


### 160. The acceptance receipt could not be written in the default configuration — **DONE (0.279.0)** (feature audit, item 151)

**The run's provenance artifact was absent from every ordinary run.** `buildAcceptanceReceipt`
refuses when a roster name has no gate result — correctly, because an incomplete receipt describes no
acceptance. The roster was built from `describedGates`, which mapped each overlay gate to
`{ name, text }` and **dropped `capability`**. `applicableGates` filters by the name-keyed policy
alone, and `gateApplies` answers `true` for a name it has no entry for — *gates default to universal*
— so every `quality:*` gate survived into the roster. The **executing** set filtered those same gates
by the field that had been dropped.

Consequence, on any project that is not `web-ui` or `api`: `quality:impeccable`, `quality:semgrep`
and `quality:schemathesis` sat in the roster, never ran, and the receipt refused.

**Observed in a real boxed run before the audit named it** — measurement run 3's own log:

```
no acceptance receipt: the acceptance receipt is incomplete and was not written:
  … results.gates: quality:impeccable is in the roster and has no result …
```

Demonstrated directly for a `cli` project: roster before `["quality:impeccable","quality:gitleaks"]`,
after `["quality:gitleaks"]`.

**The repair** carries `capability` into the described set and builds the roster from a list filtered
by the same predicate the executing set uses. The brief still declares both kinds of absence — a
toolchain skip and a capability skip — because `gateNames` is unchanged; only the *roster* narrows.

Filtered against the brief's capabilities, and the run's capability set is monotonic, so this can
only shrink the roster. That direction is the safe one: an extra gate *result* is harmless, a roster
entry that never runs is fatal.

**Held positionally**, because the roster is computed inside `runInvocation` which no tier-1 test
executes — and because a unit test that re-composed the same call would pass whether or not the
driver did it. That is the trap item 159 fell into an hour earlier. A third case pins the *mechanism*:
`gateApplies('quality:impeccable', ['cli'])` answers `true`, so capability is the only field that can
exclude such a gate.

**Validation:** lint, typecheck, `npm test` **3510 of 3510**, `driver` 674 of 674. Red proof:
restoring the unfiltered roster fails the wiring case.


### 161. A component's dependencies were installed one directory above it — **DONE (0.280.0)** (PLAN item 24)

**The thing that had been stalling every component run**, found by diagnosing why the gate that
stalled it kept saying the same thing.

`shareToolCaches({ cwd, dir: made.dir, ... })` links `node_modules` from the working tree into the
candidate. `cwd` is already the component's own directory, so the **source** was right; the
**destination** was the candidate *root*, while the project sits at `<candidate>/packages/<name>`.

**Node resolves `node_modules` by walking up**, so build, lint, types and unit all found it — which
is precisely why this hid for so long. `knip` does not: it analyses the project where its
`package.json` is, finds no install beside it, and reports every dependency unused. Four runs of
measurement run 3 stalled on `quality:knip` reporting `eslint` unused **while the `lint` gate
required eslint** — which reads exactly like two gates in conflict, and is not.

Measured rather than reasoned. The same minimal library, unchanged:

```
without node_modules beside it : Unused devDependencies (1)  eslint
with    node_modules beside it : (none)
```

**Sixth instance of one blind spot**, and the reason the rule now names all three destinations
together — gates, subject, and tool caches are three readers of one fact. The defect has never been a
wrong prefix; it has been one reader not using it.

**Validation:** lint, typecheck, `npm test` **3510 of 3510**, `driver` 676 of 676. Red proof:
returning the destination to the candidate root fails two cases.


### 162. `.gitignore` may never be a phase's declared output — **RECORDED (0.280.0)** (PLAN item 24)

**Found by a real boxed run refusing correctly.** A design child added `test-results/` to
`.gitignore`; `architect.md` does not declare that file, so the phase was refused and the run
stopped with *"the design phase changed 1 path(s) it does not declare: .gitignore"*. The change was
left on disk, uncommitted, exactly as the refusal promises.

**No code changed. What was missing is the reason the obvious repair is wrong**, and it is not
obvious enough to leave unwritten — the next reader hitting this will reach for
`architect.md`'s declared-outputs list.

`changedPaths` asks `git status --porcelain`, and **git omits ignored files**. That is the correct
boundary for `node_modules/` and build output. It also means a phase permitted to edit `.gitignore`
can make its own *later* writes invisible to the very check that admits them: add a directory to the
ignore list, write into it, and `changedPaths` has nothing to report. The declared-output allowlist
and the ignore file cannot both be under a producing phase's control.

The driver writes `.meeseeks/` into `.gitignore` itself, before any phase runs. That is the only
write to that file a run makes, and it stays that way.

**Evidence.** A rule over every template asserts none declares `.gitignore`, with a companion case
asserting the marker is actually found in at least three of them — without which a renamed marker
would make the rule pass over nothing.

**This is model variance, not a defect.** Four earlier runs of the same target reached the components
phase; this one did not, because a child chose to tidy a file it was not asked to touch. Recorded so
the failure is legible next time rather than mistaken for a regression.


### 163. A shared tool cache is visible to git where a real one is not — **IMPLEMENTED (0.281.0)**; the live discharge rides item 24's next boxed run

**Found by the furthest a component run has ever reached.** With items 145–147, 157 and 161 in place,
measurement run 3's component passed its gates and **convened the review panel three times**. Every
verdict was discarded:

```
the candidate changed while it was being judged: the candidate is now 19b68aa… and was
checked out as c3b4d49…. Something wrote to the candidate while the gates or the panel were
reading it, so the verdict describes bytes that are not the ones that were judged.
```

Three times, then `STALLED: 4 iterations with no gate improvement`. The seal is behaving correctly —
something really did change.

**Root cause, reproduced minimally.** `shareToolCaches` links `node_modules` into the candidate as a
**symlink**. The target's `.gitignore` says `node_modules/` — *with a trailing slash* — and a
trailing slash matches **directories only**. A symlink is not a directory to git:

| `packages/textstats/node_modules` is | `git status --porcelain` |
| --- | --- |
| a real directory | *(ignored)* |
| a symlink | `?? packages/textstats/node_modules` |

So the shared cache is an untracked entry git reports, where the real thing it stands in for is
invisible. `made.tree` is also measured **before** the share runs, so the recorded identity cannot
include it either way.

**Not repaired here, deliberately.** The obvious repairs each have a defect:

- *Copy instead of link* — the cost the sharing exists to avoid.
- *Add `node_modules` to the candidate's `.gitignore`* — that file is **tracked**, so writing it
  changes the very tree whose identity is in question, and item **162** has just recorded why a
  producing phase must not touch it.
- *Measure the tree after sharing* — makes the identity describe the cache rather than the code, and
  weakens a seal whose whole job is to notice writes.

The shape that looks right is `$GIT_DIR/info/exclude` for the candidate worktree: per-repository,
**untracked**, invisible to the tree, and exactly what git provides for "ignore this here without
saying so in the project". That is a bounded slice with a real design, and it is not being written
against a security-relevant seal at the end of a long session on reasoning alone — it needs its own
slice and its own live run.

**Item 24 remains IN PROGRESS.** Six runs: five machine defects found and fixed, one model-variance
refusal, and this one open. Each run has reached further than the last; this is the first to reach
the panel at all.

**Repaired at 0.281.0 — and the sketched shape above was measured and rejected first.** Three
measurements on this host's git (2.25.1), each fatal to an ignore-machinery repair:

1. **A per-worktree `info/exclude` is not a thing.** Git resolves `info/` to the *common* directory;
   a file written at `.git/worktrees/<id>/info/exclude` is never read. The shape this item sketched
   does not exist.
2. **The common file is shared by every worktree of the repository.** Two concurrent component
   sub-runs would read-modify-write one file, and one run's teardown strip could blind a live
   sibling's seal mid-judgement. A race in a seal is worse than the defect.
3. **Exclude patterns interact with a fresh index by dropping tracked paths.** Measured: a vendored,
   tracked `node_modules` vanished from the staged tree under an exclude line, because a
   from-nothing index leaves every file "untracked" for ignore purposes. And `-c core.excludesFile`
   *replaces* the operator's global ignore for that command, so the two stagings the seal compares
   would run under different rules for any operator with a global ignore file.

The landed repair touches no ignore machinery: `candidateMatchesTree` subtracts **exactly the links
`shareToolCaches` created** from its re-staged temporary index (`git ls-files --stage -z` to verify
each entry's mode is `120000`, then `git update-index --force-remove`) before `write-tree`. A
created link was absent from the checked-out tree by construction, so the subtraction cannot hide
anything that was judged; a regular file swapped in at a link's path keeps its non-link mode, stays
in the comparison, and trips the seal. `shareToolCaches` now returns `created` beside `linked` — a
pre-existing entry at a cache path (tracked symlink, vendored directory) is never subtracted. The
driver spells the paths from the candidate root (`resolvedPrefix` + name) and resets them with the
candidate.

**Evidence.** Red first at tier 2: the reproduction (`.gitignore`'s `node_modules/` matches the
directory, not the symlink → drift → verdict discarded) asserted as `ok: false` bare and `ok: true`
with the subtraction, failing before the repair. The wiring red: the workspace-seal harness had
**never armed `candidateIntact`** — the loop treats its absence as nothing to verify — which is why
six green suites saw none of run 3's stall; `driveOnce` now arms it exactly as the driver does, and
withholding the subtraction with the seal armed fails the new cache-bearing ship case with run 3's
exact message. Deny paths: a planted file beside the links still refuses; a regular file replacing
a link still refuses; a vendored tracked cache subtracts nothing and keeps its bytes in the subject.
Gates: lint clean, typecheck clean, tier 1 **3,514 of 3,514**, tier 2 full run below, release-check
at 0.281.0. `DESIGN.md` §6.2 records the subtraction and the two measured rejections.

**What remains here:** the live discharge — the next boxed component run (item 24, run 7), which is
also what completes item 24. The seal's behaviour under a real component sub-run with real installed
caches is the evidence this item's own text demanded.


### 164. Reconcile documentation authority and the current all-features DoD — **DONE (docs only, 21 Aug 2026)**

The current contract had three competing stories: the documentation index omitted
`CONSTITUTION.md`, the superseded capstone still appeared in live phase instructions, and item 86
was simultaneously post-DoD, in scope, and eligible despite unmet admission prerequisites.

**Resolution.** The index now routes invariant law to `CONSTITUTION.md`; scope comes from the
capability-versus-experiment rule while status controls traversal; the capstone is explicitly
historical and withdrawn; item 86 is in scope, parked until admission closes, and POSIX-only at
first. Slice evidence stays here, while `HANDOFF.md` keeps only candidate-wide or durable evidence.
No implementation or loader-shipped file changed, so no version bump is required.

**Validation.** Lint and typecheck clean; `npm test` **3514 of 3514**; `release-check` passed at
0.280.0; `AGENTS.md` remains byte-identical to `CLAUDE.md` after its permitted preamble; stale live
capstone and item-86 phrases are absent, and candidate-coupled 0.208.0 metadata is gone from live
control-plane headings.


### 165. The launch revalidation read a component's own config as operator work — **DONE (0.283.0)** (PLAN item 24, boxed run 7)

**Found by boxed run 7, 21 Aug 2026 — the first run made with item 163's seal repair in place.** The
parent's phases ran clean at 0.281.0, the components phase created the worktree and wrote the child's
`.meeseeks/config.json` — exactly as item 24's spec says it must — and the child refused its own
launch: `clean-working-tree: 1 uncommitted change(s)`. The parent then correctly refused to build on
a component that did not ship. `ABORTED`, 498,510 tokens, $1.38.

**Three git facts conspired, each measured in the reproduction:**

1. `!.meeseeks/config.json` un-ignores the child's settings at any depth — **by design**, so a run
   is reproducible from its repository. The parent-written child config is therefore *visible* to
   `git status`, and correctly so.
2. `git status --porcelain` spells every path from the repository root wherever it runs, so the
   child's own state is `packages/textstats/.meeseeks/config.json` — a spelling the launch
   exemption `isMeeseeksOwned` did not know. The items-145/146/147/161 offset family, now found in
   the launch revalidation.
3. The default listing **collapses** an untracked directory to its top entry: the actual porcelain
   line was `?? packages/` — which names neither the run's state nor the operator's work, and can be
   read safely in neither direction.

**The repair (0.283.0).** `checkCleanWorkingTree` resolves the run's own offset through its probe
(`git rev-parse --show-prefix`) — resolved rather than accepted as a parameter, because a parameter
is a thing a call site can omit and the launch revalidation and init preflight must never disagree
about it — lists with `--untracked-files=all` so a collapsed directory line is never emitted, and
`isMeeseeksOwned` exempts `<prefix>.meeseeks/` and nothing else. A collapsed line that appears
anyway reads as dirty, fail-closed; an unresolvable prefix refuses rather than guessing the root.

**Evidence.** The live refusal itself is the red proof — real git, real run, recorded in the run 7
log. Unit: the run-7 case (component config exempt at its offset), real work beside the state still
refused, the root `.meeseeks/` not claimable by a component run, the collapsed ancestor read as
dirty, and an unresolvable prefix refusing. Tier 2: a real component worktree with the
parent-written config passes `checkCleanWorkingTree` through a real probe and still refuses a
planted file. Gates at the owning commit: lint clean, typecheck clean, tier 1 and tier 2 full runs.

**Item 24 remains IN PROGRESS** — seven runs, six machine defects found and fixed, one
model-variance refusal. Earlier children sailed past this exact state, which looks like a
contradiction until items 149 and 150 are read beside it: preflight could be a silent no-op and the
`--yes` acknowledgement was parsed and never read, both repaired on 20 August (0.269.0–0.270.0). Run
7 is the first boxed run whose child launch checks demonstrably *ran*, and the latent offset defect
they had been hiding fired on first honest contact — the recurring shape of item 151, again. Run 8
owes the ship.

### 166. Animated operator dashboard — DEFERRED (operator, confirmed in-session 21 Aug 2026: in scope, build after the current all-features DoD completes; resume on explicit direction)

**Problem solved:** long unattended runs leave the operator reconstructing the current phase, work in
flight, evidence, budgets, and stop reason from terminal output and separate artifacts. A local,
animated observer should make that state legible without becoming another controller or source of
truth.

**Authority:** `PLAN.md` owns this feature's status, ordering, dependencies, and completion state.
`DASHBOARD.md` owns the supporting interaction, animation, accessibility, and visual specification.
`DESIGN.md` §16 owns the observer's process, authority, projection, compatibility, and web-security
architecture; the applicable runtime sections own exact shipped events, artifacts, and schemas.
Complete an admitted runtime behavior there before implementation; do not duplicate it here or let
the dashboard establish it by convention.

**Admission:** begin implementation only when the operator resumes dashboard work. First map every
displayed fact to its canonical Driver-owned artifact or the deliberately non-authoritative forensic
journal. The product is a read-only, loopback-only projection: it cannot advance a phase, settle or
cancel a child, alter configuration or the ratchet, approve a finding, retry work, or declare terminal
state. Current artifacts are the bootstrap, not the feature ceiling. Where they cannot support the
target experience, prove the exact observational gap, admit the smallest bounded Driver-owned contract
under the §16 boundary and the applicable runtime section, and implement its writer and compatibility
behavior in the same slice. Do not scrape styled output or create a second session log, status ledger,
provenance graph, or dashboard-owned cache under `.meeseeks/`.

The base dashboard may be implemented and replay-tested in WSL from current and archived artifacts.
The complete product also adds the admitted observational fact families defined in `DESIGN.md`
§16.2 and presented in `DASHBOARD.md`:
stable run identity; full phase and correlated child lifecycle; literal child outcomes; candidate and
gate-attempt state; generation-safe liveness; live resource and budget state; named Panel activations;
run-bound operator decisions; and durable component lineage/archive. Every artifact consumed by a
full target-schema projection either carries the same immutable run-generation id or is
path/schema/digest-bound by the Driver-owned atomic generation inventory, and every new record joins
the per-run archive or
finalization contract before shipping. Old and operator-renamed archives remain discoverable; current
schemas label generation coherence unavailable rather than receiving invented identities, outcomes,
atomicity, or order. Admit the standalone observer as the narrow
`run.json` reader planned by `DESIGN.md` §16 by amending §7.1 and its enforcement test in the
implementation slice, without permitting any Driver decision path to consume it.

After item **54** is admitted and ships its one aggregate workflow receipt, item 166 adds the separate
capped live snapshot needed to animate ephemeral workflow members. This uses the conditional narrow
exception under `DESIGN.md` §§15.2 and 16; it exposes lifecycle shape and workflow-level aggregate
usage, never per-member token/model/cost or reasoning telemetry. Those members remain transient
children of their durable role, collapse to the aggregate receipt at settlement, and never look like
independent acceptance authorities. Item **65** is not a prerequisite for the POSIX implementation,
but no dashboard path may imply unsupported Windows process settlement.

**Done when:** the accepted `DASHBOARD.md` specification, normative `DESIGN.md` §16 boundary, and
corresponding shipped-runtime contracts are implemented; the target run, phase, child, candidate/gate,
component, Panel, liveness, resource, and decision views operate from their canonical observations;
if item 54 admits dynamic workflows, their live view and aggregate collapse operate from the admitted
contracts; every durable
fact resolves to its owner; and projections are deterministic, bounded, compatible, and rebuildable.
Conflicting, missing, corrupt, oversized, old-schema, or incompatible inputs render explicit
unavailable/error states rather than inferences. Only a bounded, schema-valid terminal receipt wins
over a trailing unsettled journal. Observer disconnect, expiry, missed writes, host sleep, or clock movement do not imply Driver
death; current open work stays unsettled/unknown until positive generation-safe evidence establishes
that the exact producer instance is alive or no longer exists, or the run is archived/superseded.
Liveness observation cannot fail the run merely to make the UI decisive. The target projection accepts
a multi-file view only across matching generation-inventory reads and bindings; current-schema views
remain explicitly eventually consistent and never claim generation coherence or atomicity.

Reconnect and replay cannot duplicate, reorder, or silently drop durable transitions. A transport
cursor gap recovers from a reset snapshot; a durable source-sequence gap remains an integrity error.
Normal, old-schema, named parallel-Panel, component, cancellation, timeout, truncated-final-line,
earlier-corruption, archive, generation-inventory publish/race/crash, and reconnect/reset fixtures
pass without model calls. If item 54 admits
the feature, capped dynamic-workflow fixtures also pass and live detail collapses to its aggregate
receipt without becoming permanent per-agent telemetry. The local observer performs no repository or
`.meeseeks/` writes, exposes no control channel, serves no arbitrary repository content, rejects
browser-origin and DNS-rebinding paths, and leaks no prompts, responses, hidden reasoning, tool chatter,
configuration, credentials, or secrets.

### 167. Isolate Builder guidance from ambient Skills and customizations — PROPOSED (reviewer-derived from DESIGN §5, 21 Aug 2026; enters the queue when the operator or an implementing session admits it)

**Problem solved:** `DESIGN.md` §5 requires Builder behavior to come from Driver-declared, versioned
guidance rather than whatever Skills or customizations happen to be installed on the operator's
machine. This is separate from item 82: the Builder may retain its intentionally broad tool surface
without accepting ambient instructions as product behavior.

Implement the smallest measured boundary supported by the admitted Claude Code contract. Preserve
the explicit frontend direction and other Driver-appended guidance, reject or disable ambient Skill,
Agent, command, persona, and customization influence, and record the effective customization identity
with the role supply evidence. If the CLI cannot provide that boundary, refuse the unsupported
configuration rather than silently dropping the requirement from DESIGN.

**Done when:** two otherwise identical Builder runs produce the same effective instruction supply
with and without hostile operator customizations installed; the hostile customization cannot alter
the Builder prompt or become invocable guidance; Driver-declared versioned guidance still arrives;
the Builder's intended tool availability is unchanged; and pinned live evidence proves the external
CLI behavior rather than inferring it from argv alone.

### 168. One-command host setup and dependency bootstrap — **DEFERRED post-DoD (operator, in-session 21 Aug 2026)**

**Problem solved:** plugin installation makes Meeseeks available but does not prepare every optional
host tool, and users currently have to translate preflight repairs into a separate setup sequence.
Provide one explicit, repeatable bootstrap without turning marketplace installation into arbitrary,
privileged code execution.

**Platform boundary:** Claude Code exposes no automatic plugin `install` or `postinstall` lifecycle
hook. Its
[Setup hook](https://code.claude.com/docs/en/hooks#setup) runs only when explicitly requested, while
[plugin dependencies](https://code.claude.com/docs/en/plugin-dependencies) install other Claude
plugins and locked
[Node dependencies](https://code.claude.com/docs/en/plugins-reference#nodejs-package-dependencies)
install with lifecycle scripts disabled. Dependencies that need a first-use installer belong in the
persistent `${CLAUDE_PLUGIN_DATA}` directory, not the versioned plugin cache or a target repository.

**Scope:** add an explicit `/meeseeks:setup` Skill or documented `claude --init-only` path. Use
`plugin.json.dependencies` only for genuine Claude plugin dependencies; keep target-specific quality
tools in the existing first-run provisioning path; install plugin-owned user-space dependencies
idempotently under `${CLAUDE_PLUGIN_DATA}`; and detect privileged or platform package requirements
without silently running `apt`, Homebrew, Scoop, or administrator operations. A failed or partial
setup remains safe to retry, records no secret, and prints the exact manual repair. Setup never
mutates a target repository until the operator explicitly selects it and authorizes that action.

**Admission:** resume after the current all-features DoD, unless a clean-profile installation test
first proves that the supported install → preflight → run path cannot start without it. The existing
preflight and first-run provisioning remain the supported path until this item ships.

**Done when:** on each supported host, a clean Claude Code profile can install the marketplace and
Meeseeks, invoke one explicit setup operation, and pass preflight in a disposable repository. A
second invocation is a no-op; an updated dependency manifest installs only the changed dependency;
offline, permission, unsupported-platform, partial-install, and corrupt-state cases give bounded,
actionable recovery; uninstall and retained-data behavior are documented; no privileged package
manager runs implicitly; and clean-profile install/update tests exercise the real cached marketplace
package rather than a source checkout.

### 168. A root file and a component file with one name were one path — **DONE (0.287.0)** (PLAN item 24, boxed run 11)

**Found by boxed run 11, 21 Aug 2026** — the first boxed run with the launch fix (item 165), a
loaded config, and a 75-minute wall. The child cleared launch, prd, and entered design; the design
role (opus, no Bash — Read/Glob/Grep/Write/Edit only) wrote an undeclared `.gitignore`, and the
design phase refused exactly as item 81's law requires: `ABORTED`, 1.26M tokens, $2.83. The refusal
was correct. What the investigation found underneath it was not.

**The defect: `relativeToCwd` was lossy.** It mapped in-prefix paths to cwd-relative spellings
(item 145) and passed out-of-prefix paths through at their repository-root spelling, believing that
made them unmatchable against declared outputs. False for every **root-level** path: root
`.gitignore` and `packages/<name>/.gitignore` spell identically after the mapping, and
`changedPaths`' Set merged them into **one entry** — admittable against the wrong declaration
(latent: the prd phase declares `.gitignore` and a dirty root one would ride it), never staged by
the cwd-relative `git add` (leaking to the next phase misattributed), and unnameable in a refusal —
which is why this incident needed a forensic investigation instead of one log line.

**Two accessories.** `templates/architect.md` never told the design role its declared file set is
closed, so an ordinarily-helpful model writing a `.gitignore` was invited, at 889k tokens per
lesson. And the refusal's promise that "the change is still on disk" was false for a component: the
parent sweeps the worktree on every path out, destroying the undeclared file before anyone can name
it — this run's actual `.gitignore` writer target (component's own vs root via `../`) is
unrecoverable for exactly that reason.

**The repairs (0.287.0).** `relativeToCwd` spells out-of-prefix paths truthfully with
`path.posix.relative` — `../../.gitignore` — so an out-of-prefix change is *structurally* unable to
match a declared output (`../` cannot appear in one), the two files stay two entries, the refusal
names a path a reader can `git diff` verbatim from the cwd, and item 145's in-prefix mapping is
untouched. `architect.md` states the file set is closed, `.gitignore` above all. The components
phase logs the doomed worktree's `git status --porcelain` before removing it, so the next such
abort carries its own autopsy.

**Evidence.** Unit: the collision reproduced and refuted (both `.gitignore`s as two exact entries),
the root-level change refused under a declared name while the component's own is admitted, the
refusal text carrying the `../` spelling, the out-of-prefix README case updated to the truthful
spelling, and the two old cases that had leaned on the answers-everything double moved to the
per-command one its own comment had warned about. Tier 2 against real git: porcelain root-spelling
plus `../` pathspec staging the root file from the component cwd — both facts git's, both proven
against the binary. `test/launch.test.mjs` 45/45, tier 1 **3,529 of 3,529**, tier 2 full run at the
owning commit, lint and typecheck clean. The template sentence's live proof rides run 12, which is
also item 24's next attempt.

**Item 24 remains IN PROGRESS** — eight runs, seven machine defects found and fixed, one
model-variance refusal that item 168's template sentence now addresses at its cause. Run 12 owes
the ship.

### 34. Verified research mode — **DEFERRED post-DoD (operator, in-session 21 Aug 2026)** — a wanted capability, built after the current bar completes; was: IN SCOPE (19 Aug), OPEN before that

**Why the deferral is cheap, recorded so resuming it starts warm:** the producer-side addenda landed
at 0.265.0 (item 143), and the substrate it rides — prose toolchain, citation and claim gates, the
acquisition module — is item 49's, deferred beside it in the same directive. What resuming adds is
the job-type layer only: research job selection plus its declared-gap guard, a sealed research
brief, factuality and synthesis cold-lens addenda reusing existing reviewer identities (Standing
Rules: no new personas), Oracle held-out fact fixtures, a hostile run-level roster, and one tier-3
composed-contract run. Public-HTTPS sources only until item 106's admission reopens.

**Producer authority factored, 0.246.0 (`DESIGN.md` §8.5).** This item's stated first implementation
step — *"factors common producer authority rules from job-specific code/research addenda, all
Driver-owned and versioned"*, with the explicit instruction that *"it must not literally reuse the
current code-only `builder-system.md` contract"* — is done.

`templates/builder-system.md` is now `producer-authority.md` with two slots, filled for the code job
by `producer-code-practice.md` and `producer-code-gates.md`, composed by `producerSystemPrompt(job,
values)`. Authority is what is true of any producer: do not declare completion, record what you had
to assume, regressions outrank everything, the scope dial, the `.meeseeks/` boundary. Practice is
what is true of code: RED before GREEN, tests assert values, the `package.json` scripts as a loaded
gun.

**The addenda sit in the middle of the authority text on purpose.** A tidier split would put all the
authority first — and reordering a prompt *is* changing a prompt, which §3.9 names as one of the two
degradations this repo cannot see. The slots were cut exactly where the sections already were, and
`test/templates.test.mjs` holds the composed code prompt **byte-identical** to
`test/fixtures/prompts/builder-system-0.245.0.md`, the bytes actually shipped rather than a
re-concatenation of the new files, which would pass whatever they said. Three further rules are
held: no code-only term may appear in the authority half, every universal rule must remain in it,
and a job with no addenda is refused rather than composed on authority alone.

**Validation:** lint and typecheck clean, `npm test` **3273 of 3273**, `npm run test:integration` clean
(exit 0, 0 failures), and **tier 3 run: `MEESEEKS_LIVE=1 npm run test:live` passed 39 of 39** — the
tier that can say whether a real model still behaves the same way when handed a prompt assembled
from three files instead of read from one. `release-check` passed. Six red
proofs: a reordered split, one edited word of authority, a dropped practice section, code-only text
leaking into authority, an unknown job composing authority alone, and the addendum going
unsubstituted. The fifth mutation initially reported green and the anchor turned out never to have
matched — re-run against the real indentation it failed as intended, which is the vacuous-proof trap
this repository has hit before.

**Still blocked on this item:** everything downstream of the research addendum itself needs item
**84**'s recorded containment outcome, and an authenticated source needs item **106**. The public
HTTPS retrieval profile it specifies is built (item 49, §3.8.6).

**The research addendum itself landed, 0.265.0 (item 143)** — `producer-research-practice.md` and
`producer-research-gates.md`, composed through the same authority half as the code job. Nothing
selects the job yet and a test holds that gap declared.

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

### 35. Continual-memory discipline, operator-side (folds R36 + R37) — **DONE (0.240.0)**
Adopt Prime Agent's Continual-Harness *discipline* on the DRIVER, never the builder: bound the
lesson STORE (not just the view), add retraction/rollback with an append-only history, and a gated
promotion so run-local candidate lessons enter the durable cross-run store only through a distinct
gate (cold-reviewed or usage-thresholded). **Invariant:** driver-owned, never builder-editable
(§13.8); design the escape before the enforcement; the builder stays starved. The Factorio study
(R39) is the warning label: self-modifiable state under the builder's reach becomes the exploit.

**Store bound and retraction landed (0.240.0); the promotion gate remains.**

**The defect was real and it was hiding behind a cap that looked like one.** `addLesson` appended
with no limit on store size, so the durable store grew across every run of a repository forever.
`selectLessons` already capped what any one brief sees, and that is precisely what concealed it: a
view-only cap makes an unbounded store *look* bounded, which is the worse of the two failures because
nobody goes and looks at the file.

- `MAX_STORE_LESSONS` is 60, and the number is written down as a judgement rather than a
  calculation. A store needing more than sixty durable lessons is saying something about the lessons.
- **Eviction is a retraction, not a deletion.** A silent drop loses the record of having learned the
  lesson and the next run learns it again — a loop that looks like progress. The ledger keeps the
  text and the reason, which is what lets a later promoter avoid repeating a harmful edit.
- **Least used first, ties broken on id.** Use count is the only evidence the store holds that a
  lesson ever helped. The tie-break matters more than it looks: a store evicting differently on two
  machines makes one repository behave differently for two people.
- **Retracting an absent lesson is not an error.** Two runs retracting the same false lesson is an
  ordinary race, and failing the second would turn a correction into an incident.
- Bounded at the **one place the store grows**, not at read time. A store trimmed on the way in never
  reaches a size nobody noticed.

**A defect in the slice, found by writing the round-trip test rather than by reading:**
`saveLessons` wrote only `version` and `lessons`, so a retraction survived exactly until the next
save — and the store would then re-learn what it had just thrown out. The ledger now round-trips, and
a malformed entry in it is dropped without costing the lessons beside it.

**Acceptance evidence:** 11 unit cases and 1 driver case seeding a store at the bound and driving a
real extraction through the loop. Proved red six ways: the store never bounded (4 fail), eviction
deleting rather than retracting (1), least-used ordering abandoned (3), the ledger not persisted (1),
retraction of an absent lesson throwing (1), and the driver not calling the bound (1).

**Remaining: the staged promotion gate.** Run-local candidates entering the durable store only
through independent-run support, each staged with source evidence, support count, digest and
proposed atomic edit, plus the append-only rejected-candidate ledger carrying the validation delta
and refusal reason — which never enters a Builder brief. The retraction ledger this slice added is
the half that store needs; the promotion side is a second slice.


**Promotion gate landed with the bound (0.240.0). Item 35 is complete.**

Both halves shipped together rather than split, because the promotion gate **moves the growth point**
from extraction to promotion — landing the bound alone would have committed a test the next commit
had to rewrite.

**Independence is structural, not advisory.** Support is counted per distinct run key, and a run
supporting the same candidate twice counts once. That is SkillOpt's harvest made mechanical: the same
run failing the same way four times is one observation repeated, and a store promoted on that learns
a lesson about one afternoon and teaches it forever. `MIN_INDEPENDENT_SUPPORT` is two — a second
*run*, with a different objective and tree state, is the cheapest thing that is genuinely a second
opinion.

- **Candidate identity is normalised text**, not an id. Two runs never agree on an id, and the
  question is whether a second run reached the *same conclusion*; folding case and whitespace stops a
  rephrasing counting as independent support for itself.
- **A candidate with no run identity is refused**, or a single run could promote by supporting itself.
- **The rejected ledger gates staging.** A promoter that forgets what it refused will refuse it
  again, or worse accept it next time and repeat the harmful edit — which is the ledger's whole
  stated purpose.
- **Candidates and rejections cannot reach a builder.** `selectLessons` reads `store.lessons` alone,
  and the pre-existing case asserting a lesson *does* reach a later brief now asserts it **does
  not**. Inverting that assertion is the feature: one run's conclusion is not yet a lesson.
- The run key is `startedAt:startCommit`, captured once so the manifest and the store name the same
  instant. The commit alone is not an identity — two runs against one tree are two runs.

**Two defects in the slice, both found by tests rather than by reading:**

- `readLessons` persisted candidates and the refusal ledger on write and **dropped them on read** —
  the worst of both, since the file grows and nothing ever uses it. The identical gap had already
  been fixed once in this item for the retraction ledger, which is the argument for round-tripping
  every list the store gains rather than each one when someone notices.
- The bound test seeded a **hand-written digest** that silently failed to match, so the run staged a
  second candidate instead of adding support. The seed is now built through `stageCandidate` itself
  and cannot drift from the identity rule.

**Acceptance evidence:** 59 unit cases and 3 driver cases through the real loop. Proved red nine
ways across both halves. One mutation — replacing `options.runKey` with a constant — **survived
every case** until a test existed that drove two resisted-then-resolved shapes through a *single*
run and asserted it never promotes itself; every other case used one run, so nothing proved the key
varied at all.


**SkillOpt harvest:** promotion support must come from independent runs/objectives, not merely
several iterations of one run. Stage each candidate with its source evidence, support count, digest,
and proposed atomic edit. Keep an append-only rejected-candidate ledger containing the validation
delta and refusal reason so the promoter can avoid repeating harmful edits; this ledger never enters
a Builder brief. Item 59 owns the offline optimization experiment, while this item owns the durable
store, adoption, rollback, and retraction boundary.

### 36. Terminal detachment and later resumability — **diagnosis landed (0.239.0); Stage A operator-blocked, Stage B deliberately unbuilt**

**A correction recorded rather than quietly dropped.** This item was set aside on the reasoning that
it existed to survive capstone relaunches, and that when the capstone was withdrawn its justification
went with it. That reasoning was half wrong: **the capstone was the test, resumability is the
feature.** A real run on a real project meets the same quota window, and if an unattended run dies
partway through, "unattended loop" does not hold for the product's own purpose — a feature gap, not a
test-harness one.

What it is still waiting on is evidence rather than an argument. The ~1.3-iteration figure comes from
**capstone attempt 3 alone**; nothing measures an ordinary run. One long non-capstone run decides
whether the wall exists outside the flagship build, and this stays parked until it does.

**Partially landed (0.239.0) — the diagnosis, not the resume.** The item's own disposition is
unambiguous: *"do not build a daemon or resume path from this item."* What was buildable is the half
that needs neither.

A run started in a repository where the previous one died now says so, before the archive moves the
evidence: *"the previous run left no terminal receipt: it stopped during iteration 3, with builder
still running. That work is not resumed — this is a fresh run — and its journal is archived with
it."*

- **The discriminator is the terminal receipt, not the journal.** A run that ended normally often
  shows an unsettled iteration, because the journal's last line races the terminal write. Only *no
  receipt* **and** outstanding work means a run died. Without that test the line would fire on
  healthy runs and train the operator to ignore it, which is worse than not printing it.
- **It states that nothing is resumed**, and that sentence is asserted by a test. A diagnosis that
  read as an offer to continue would be worse than silence, given this item forbids exactly that.
- **Read immediately before `archiveOnce`**, the last moment the previous journal is at the
  canonical path.

This also stops item 58 becoming the thing it was admitted to prevent — a forensic file only a reader
with a JSON parser ever sees. Same lesson as `question.json`: the run already knew the useful
sentence and was discarding it.

**Stage A remains genuinely blocked.** It requires an operator to start `/meeseeks` through Claude
Code's agent view, close the view and shell, and restart the supervisor. That is a human-in-the-loop
measurement on a research-preview surface; it cannot be performed here and is not simulable.

**Stage B remains deliberately unbuilt.** Its second trigger *is* now satisfied — item 58 proved
current artifacts could not reconstruct a killed run — but Stage B asks to **specify** a resume
primitive and to bind a compatibility fence *before any replay implementation*. There is no replay
implementation, so a fence would be a component with no caller: the exact defect repaired four times
in this session (the Playwright reporter, the design-slop parser, gitleaks absent from the roster,
the ERD reader). The fence is specified in item 58's entry and stays unbuilt until something replays.

**The measurement this item still waits on is unchanged:** one long non-capstone run, to establish
whether the quota wall exists outside the flagship build. The ~1.3-iteration figure is still from
capstone attempt 3 alone.


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

### 47. Accept an ERD alongside the PRD, and gate the schema against it — **IMPLEMENTED (0.234.0-0.236.0); one live discharge owed**

**Origin:** operator, 15 Aug 2026, after an ERD of the Ateliers capstone made its schema's two
integrity rules checkable at a glance. The data model is where prose is most ambiguous and builder
hallucination most expensive; an ERD is machine-parseable text (Mermaid `erDiagram`, no runtime
deps to parse), so it enables a **new deterministic, capability-gated gate** — meeseeks' favourite
kind of check. The schema stops being inferred and becomes *checked against*.

**Slice A landed (0.234.0) — the reader.** `scripts/erd.mjs` parses a Mermaid `erDiagram` into
entities, attributes with keys, and relationships with a cardinality on each side and an
identifying/non-identifying relation type. No dependency, as the item required.

**What was measured, and what was not — because this is another tool's format.** The cardinality
**token names** were read out of **mermaid 11.17.0's own compiled grammar**: its packed
`dist/chunks/mermaid.core/erDiagram-*.mjs.map` embeds `erDiagram.jison`, whose symbol table names
`ZERO_OR_ONE`, `ZERO_OR_MORE`, `ONE_OR_MORE`, `ONLY_ONE`, `MD_PARENT`, `NON_IDENTIFYING` and
`IDENTIFYING`. That is a measurement rather than a recollection, and it decides which relationships
the format actually has.

**End-to-end agreement with mermaid's parser was attempted and not achieved.** `mermaid.parse()`
would be the real check; loading it standalone needs the package's full dependency tree, which this
repository will not take on for a test. So the reader **fails closed on every token it has not
verified** — an unrecognised cardinality raises rather than being guessed at, and **`MD_PARENT` is
deliberately unsupported rather than approximated**, because a wrong reading of a relationship is
worse than a refusal to read one. *Residual:* the committed fixture is believed-valid Mermaid, not
machine-confirmed Mermaid. The cheap discharge is to render `test/fixtures/erd/orders.md` once and
compare it by hand to what the parse reports.

**Two defects its own tests found.** The notation is **not symmetric** — `}o` on the left and `o{` on
the right are the same cardinality — so left and right have separate tables; reading one in both
directions mirrors every many-side relationship, and a mutation proved that is exactly what happens.
And a first draft accepted any two non-space tokens as an attribute, cheerfully reading
`not-an-attribute-line-at-all !!` as a column named `!!` that the gate would then go hunting for in a
real schema. Names are identifiers now; **types stay permissive on purpose**, being the target
database's vocabulary rather than Mermaid's (`varchar(255)`, `string[]`, `numeric(10,2)`).

An entity named only by a relationship is kept with an empty attribute list, because it is legal and
the schema gate still has to know the table exists. `%%` comments are stripped before anything else:
a reader that took one for a relationship would invent entities nobody declared, which is the
oracle's named defect arriving through a diagram.

**Acceptance evidence:** 19 unit cases against a committed diagram exercising all four cardinalities
in both positions, both relation types, quoted labels, multi-key attributes and comments. Proved red
four ways: one cardinality table read in both directions (1 fail), an unclassifiable line skipped
rather than refused (2 fail), a relationship-only entity dropped (4 fail), comments parsed as content
(1 fail).

**Slices B, C and D remain:** the preflight consistency check that refuses an ERD contradicting or
over-reaching the PRD; the capability-gated `schema-conformance` gate with per-toolchain live-schema
introspection; and carrying the ERD in the builder's brief. The item's last Done-when clause — one
live data-backed run end to end — belongs with slice C.


**Slice B landed with A (0.234.0) — the ERD is checked before the run starts.** Deliberately in the
same commit, against the usual one-slice rule and for a reason this repository has paid for three
times today: slice A alone is a **correct parser that nothing calls**, which is exactly the shape of
the Playwright reporter, the design-slop parser, and gitleaks-absent-from-the-roster. A reader with
no caller is not a landed feature, it is a latent one.

- `erdPath` finds the ERD by convention (`ERD.md` beside the PRD) or by the new `erd` config key. A
  **configured path that is not there is a refusal, not a fallback** — falling back to the convention
  would make a typo in the config indistinguishable from having no ERD, and the run would proceed
  ungated while believing it was gated.
- `unmentionedEntities` refuses an ERD declaring an entity the PRD never mentions. The comparison
  **folds both sides** (`LINE_ITEM`, `line item`, `line-item` are one thing) and accepts plurals in
  either direction. Over-matching is the chosen error, and it is the opposite polarity to most of
  this repository: this check *refuses a run*, so a false miss blocks a correct specification at the
  door while a false match costs nothing — the gate in slice C is what actually enforces the schema.
- An ERD that cannot be parsed, or one supplied with **no specification to check it against**, is a
  blocking failure rather than a skip. A check that cannot run is a failure, and admitting an input
  nothing has validated is how a run ends up gated on a schema nobody asked for.

**What is not mechanically checked, stated rather than implied.** The item asks preflight to refuse a
*contradiction* between PRD and ERD. Only the over-reach half is deterministically decidable: nothing
compares "orders may not be deleted once shipped" against a cardinality. That reading belongs to the
design auditor, which sees both, and `DESIGN.md` §3.5 now says so.

**Acceptance evidence:** 5 consistency cases and 7 preflight cases, with `DESIGN.md` §3.5 and the §10
table carrying the check and the key — both bound to code by existing tests, which is how this slice
was made to update the specification first. Proved red four ways: an over-reaching ERD admitted
(1 fail), a missing configured path falling back to the convention (1 fail), an ERD with no
specification skipped rather than refused (1 fail), plural folding removed (1 fail).


**Slice D landed (0.235.0) — the builder is told the schema, and the check moved to where it works.**

The brief now carries a `## The declared schema` block: every entity with its columns and keys, every
relationship with a cardinality on each side and whether it identifies. Rendered from the *parsed*
diagram rather than pasted as raw text, so what the builder reads and what the gate will check are
the same document — a brief carrying the source while the gate checks the parse would let the two
disagree without either being wrong. It states that the match is a **floor**: extra columns are fine,
because a builder told only "build to it" reasonably fears that a sensible `createdAt` will fail, and
gold-plating in reverse is still the wrong incentive.

**The consistency check moved out of `runPreflight` into the Driver, and the reason is a real
ordering fact rather than a preference.** `runPreflight` is what `meeseeks init` runs — before a PRD
exists — and `revalidateLaunch` runs before `captureSpecification`, which in improve mode is before
the PRD has been *authored*. An ERD checked in either place is checked against nothing. It now runs
immediately after the specification is captured, which is the first moment both inputs exist and is
still a refusal of the run: no builder has been spawned and nothing has been written to the target.
`DESIGN.md` §3.5 records the ordering.

**Three test weaknesses this slice found in itself**, each caught by a mutation rather than by
reading:

- The injection case was **vacuous**. It wrote `\n` inside a single-quoted JS string, so the label
  held the two characters backslash-n and the assertion found no real newline. Rewritten to drive
  U+2028/U+2029 — separators a renderer honours and a line-splitting parser does not — through every
  field the block renders.
- Even then it covered only *some* neutralizers. Stripping `neutralizeLine` from the relationship's
  left endpoint left it green, and stripping it from the column-less entity branch did too, because
  the hostile entity had columns and took the other branch. Every rendered field now carries an
  injection, and each neutralizer was proved load-bearing separately.
- The refusal cases asserted the message and the exit code, and a mutation removing the refusal left
  them green — because the *non-blocking* report line prints the same sentence and the run then
  failed for its own reasons. "Refused" and "carried on and failed later" were indistinguishable.
  They now assert that **no brief was ever compiled**, which is what a refusal actually means.

**Acceptance evidence:** 6 brief cases, 2 driver-wiring cases, and
`test/integration/erd.integration.test.mjs` driving `main` against a real repository — the effect
that finds the file by convention or config, reads it, parses it and hands it on is only exercised
there, and a mutation making it return `null` left every unit case green. Refusals in that suite take
~40ms rather than ~4s, because they refuse before spawning anything.


**Slice C landed (0.236.0) — `schema-conformance`. Item 47 is complete but for one live discharge.**

The gate asks a **superset** question: extra tables and extra columns pass, an omission fails, and it
fails **naming what is missing**, because "the schema does not conform" sends a builder to read the
whole diagram again.

**Who describes the live schema was the decision, not the comparison** (`DESIGN.md` §3.6.1). Not the
toolchain — `node` says nothing about Prisma-on-Postgres versus Drizzle-on-SQLite, and a toolchain
that guessed would invent a command nobody chose. **Not the builder**, which is the security half: a
builder supplying the command that describes the schema it is judged on can describe a conforming
one, and the gate would confirm its own input. That is worse than a stubbed test suite, which at
least has to run, because a fabricated introspection is one `echo`. `schemaIntrospect` is operator
configuration in `.meeseeks/config.json`, positionally guarded — the one place inside the repository
a running builder cannot reach.

**Armed by two facts, and not capability-gated.** An ERD *and* a declared introspection; either alone
arms nothing. Deliberately **not** filtered on `persistent-storage`: detection answers about the tree
as it is *now*, and on iteration 1 of a greenfield run there is no database yet, so a capability
filter would disarm the gate for exactly the run that most needs it and re-arm it only once the
builder happened to create one. The ERD is the operator's declaration that this target persists data,
and a declaration does not evaporate.

**Relationships are not checked, and that is a stated limit rather than an omission.** A foreign key
is one way to express `CUSTOMER ||--o{ ORDER`; an application enforcing the same constraint in code
has satisfied the requirement without a constraint the introspection would see. Failing that would
fail correct work, which is the one thing a gate must not do — a gate that fails what is right
teaches a builder to ignore it.

**The name fold is narrower here than in slice B, and the polarity is why.** Slice B refuses a run
before anything is built, so it over-matches on purpose. This is the gate: over-matching passes a
schema that does not conform, so the fold stops at case, separators and a trailing plural, and
`ORDER` is not satisfied by `work_orders`.

**A defect the integration tests found in this slice.** The gate ran and the brief never named it —
the "run and not described" divergence `overlayGates` exists to prevent, arriving through a roster
added in one place and not the other. A gate a builder is judged by and never told about reaches it
as a bare non-zero exit from an unfamiliar command. Both rosters now derive their arming from the
same two values.

**Acceptance evidence:** 20 unit cases (superset pairs throughout: the surplus that must pass beside
the omission that must fail) and 6 integration cases driving `main` against real repositories. Proved
red six ways: extra columns failing (3), an empty report passing (1), substring table matching (1),
the gate never arming (3), the gate armed but undescribed (2), the interpreter never armed (3). One
integration case was rewritten from asserting an absence to asserting a **contrast** — the same ERD
against a surplus schema and an absent one — because a passing gate logs no detail, so "no complaint"
alone was also satisfied by a gate that never ran.

**Remaining for item 47:** the last Done-when clause, one live data-backed run exercising the gate end
to end against a real database. Everything above is deterministic and proved without one; that clause
is evidence about a real stack, and it is the only part still owed.


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

**Why it was originally classified post-DoD (historical):** it changes what meeseeks *accepts* and
adds a gate—a Phase-6-class expansion of inputs/job-types, not a fix. That capstone-based boundary
was superseded on 19 August; the heading above now owns this item's live status.

**Done when:** an ERD parses to entities/keys/relationships; a preflight refuses an ERD that
contradicts or over-reaches the PRD; the `schema-conformance` gate passes on a superset-matching
live schema, fails on an omission/contradiction, and fails closed on an un-introspectable one, each
with a test and a benign neighbour; the builder brief carries the ERD; one live data-backed run
exercises it end to end.

### 48. Accept a `DOD.md` alongside the PRD and ERD — the admission mechanism, and a reusable additive done-bar — **IMPLEMENTED (0.237.0); the authoring-role judgement remains**

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

**Landed (0.237.0).** `DOD.md` is accepted, enforced, communicated, and pinned. Every Done-when
clause is met except the authoring-time *judgement* of a criterion's falsifiability, which is
recorded below as belonging to an authoring role rather than to a parser.

**Why the tier is declared and not detected — the design decision this item turns on.** Item 49's
table refuses `unfalsifiable` at authoring, and **no parser can make that call**: "feels premium" and
"the mark reads as one silhouette at 16px" are both prose, and what divides them is whether an
observation exists that would prove them false. That is a judgment, and judgments here belong to a
cold role, not a regular expression. So the criterion **declares its own tier** and `parseDod`
enforces what a machine actually can — the tier exists, an observation is named, the id is unique,
and the one tier nobody may ship is refused **by name and by line**. `unfalsifiable` stays in the
vocabulary precisely so an author's honest admission is refused as *a criterion nobody can decide*
rather than reported as a spelling mistake.

**Additive is structural, not promised.** The ids are appended to the panel's required set and there
is no path by which a `DOD.md` removes one — no suppression key, no waiver, no severity override,
nothing that reads a criterion and relaxes anything. It follows from constitutional supremacy, which
`CONSTITUTION.md` (item 51) now makes citable: a done-bar sits *beneath* the invariants, so it may
only add. That is the derivation item 51's entry promised, arriving as code.

**Ownership is deliberately not defaulted**, and the existing `assertOwnershipCovers` refusal does
the work. A security criterion silently inheriting the correctness auditor because it fell through to
a default is a criterion judged by the wrong reviewer, and nobody would ever know. The refusal names
the id and the config key.

**Pinning needed no code, and that is asserted rather than assumed.** The pin branch keys on "not a
security element" and never on an id's shape, so a cold-passed `DOD-N` becomes monotonic with nothing
that knows what a `DOD-N` is. A test asserts it, and a mutation narrowing that branch to `PRD-*`
proves the assertion load-bearing — which is what stops a later tidy-up silently unpinning the
operator's bar.

**The brief carries the criteria with their observations**, and says plainly that the builder cannot
settle them: a builder that believed it could mark these done would self-certify, which is the one
thing the whole design is arranged to prevent. Every rendered field is neutralized, proved by
mutation.

**Acceptance evidence:** 16 parser cases, 4 brief cases, 1 pinning case, 5 integration cases driving
`main` against real repositories. Proved red eight ways: an unfalsifiable criterion admitted, a
malformed one skipped, a missing observation accepted, duplicate ids allowed, the done-bar never
read, an unreadable one tolerated, the criteria never joining the required set, the brief wiring cut,
and pinning narrowed to `PRD-*`.

**Not built, and named rather than implied:** deciding that a criterion *claiming* to be
panel-judgeable states no real observation. That is the authoring-role half of the Done-when — the
"unfalsifiable / unobservable-here refused by name at authoring" clause — and it needs a cold author
in the shape of `prd-author`, not a pattern. What this slice refuses, it refuses deterministically;
what it cannot decide, it does not pretend to.


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

**Why it was originally classified post-DoD (historical):** like item 47 it changes what meeseeks
*accepts*—a Phase-6-class expansion of inputs, not a fix. That classification was superseded on
19 August; the heading above now owns this item's live status. It pairs naturally with item 47:
`PRD.md`, `ERD.md`, and `DOD.md` are the three legs an enterprise target stands on.

**Done when:** a `DOD.md` parses to owned, id'd criteria; a preflight refuses one that contradicts the
PRD or that no reviewer owns; the criteria enter the panel as gating requirements and pin monotonically
once passed; an additive-only test proves a `DOD.md` can only *add* to the bar (a `DOD.md` that "waives"
a finding does not, and the finding still fails), with a benign neighbour; the builder brief carries it;
an unparseable `DOD.md` refuses the run; **and the authoring-time refusal is tested both ways — an
unfalsifiable criterion ("feels premium") and an unobservable-here one ("80% of 50 users recognise it")
are each refused by name at authoring, while a deterministic criterion and a panel-judgeable one both
pass** (the benign neighbours that prove the refusal is a filter and not a wall).

### 49. Artifact job-types: checks-as-tests, so the spine drives a book or a report — **DEFERRED post-DoD (operator, in-session 21 Aug 2026)**; the shipped substrate stays shipped — was: IN SCOPE (19 Aug), OPEN (Phase-6 class) before that

**What this deferral does and does not cover, recorded because the difference is auditable.** The
substrate is **shipped and stays in force**: the prose toolchain, checks-as-tests, the citation
resolver (§3.8.4), the claim-consistency gate (§3.8.5), and `scripts/acquire.mjs` with its address
policy (§3.8.6) — all built, all tested, the gates armed for any declared artifact job. An artifact
job is usable today for a repository whose source packages are captured in the tree; §3.8.4's
resolver reads them there by design. What is deferred is the remainder: the Driver step that
acquires unresolved sources (the acquisition module stays **deliberately unwired** — DESIGN §3.8.6
records that posture and item 106 owns when a job may have an outbound effect; this is a scope
decision, *not* item 139's accidental dead-machinery shape), mutable-source and non-retainable
fixtures, receipt/carry staling on source-package digests, and the one live prose-artifact run.

**Named evidence gap carried with the deferral:** the shipped citation and claim gates have never
run in a live artifact run. That live discharge rides this item's resumption, and nothing before
then may cite those gates as live-proven.

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
  map operations, name a reporter — the shape dotnet proved). **This prerequisite is now built
  (0.241.0):** `config.toolchain` declares the toolchain and `resolveToolchain(root, declared)` honours
  it, so 49's prose toolchain does not have to be detectable to be selectable. Detection here is weak — a
  manuscript directory is not a `package.json` — and the resolution is *do not sniff*, as this item asked.

**Prerequisite slice landed, 0.241.0 — the architect-declared toolchain (`DESIGN.md` §3.8.2).**
`config.toolchain` (`scripts/config.mjs`) declares it; `resolveToolchain(root, declared)`
(`scripts/toolchains/index.mjs`) honours it. Three refusals, each with a red proof: a declaration wins
outright rather than being weighed against detection; agreement is computed from **every** sighting,
not the top-ranked one, because the mixed repository is the entire reason a declaration exists; an
unknown name throws `ToolchainError` rather than falling back, since a typo is otherwise
indistinguishable from no declaration.

The threading was the load-bearing half. Nine sites in `driver.mjs` resolve a toolchain and most sit
inside `runInvocation`, which no tier-1 test executes — so it is held by a **positional** rule over the
driver's source (`test/driver.test.mjs`), not a list of call sites, for the reason §6 gives about
enumeration. Its first version checked only `resolveToolchain(` and passed with
`gateSummary(cwd, meeseeksDir)` reverted, because a helper resolving *indirectly* never spells the
word; widening it to the eight indirect resolvers immediately found two real defects — both
`builderSystemPrompt` call sites had been given the parameter and never fed it.

**Validation:** `npm run lint`, `npm run typecheck` clean. `npm test` **3160 of 3160**. Red proofs:
four mutations of `resolveToolchain` (declaration ignored → 4 failures; unknown name accepted, primary
sighting only, `detected` reporting the choice → 1 each) and nine mutations of the threading, one per
resolution site, each failing the positional rule. `npm run release-check` passed.

**Prose toolchain landed, 0.242.0 — `scripts/toolchains/prose.mjs` (`DESIGN.md` §3.8.3).** Two of
Done-when's clauses close: *an artifact toolchain is declared and maps its operations*, and *the code
gates it cannot run decline visibly*.

**It never detects, on any tree, and that is the design.** `detect()` returns `null` unconditionally,
so the adapter is reachable only through `config.toolchain`. Item 49 said *do not sniff* and the costs
are asymmetric: failing to detect a prose project means the operator declares it, while wrongly
detecting one strips `build`, `types`, `e2e` and `security-audit` off a real application which then
ships with four gates having never run. A manuscript tree carrying the `package.json` its vitest checks
need detects as **node** — which is exactly why §3.8.2's declaration had to be built first.

Four operations decline by name; `security-audit` deliberately does not, because the checks are real
JavaScript with real dependencies. The driver therefore sees **two gates and four stated skips**. The
unit runner is vitest and that is forced rather than chosen: `extractTestIds` parses vitest JSON,
Playwright JSON and .NET TRX, node's own runner emits none of them, so *zero parser work* is only true
through a runner the ratchet already reads. `templates/toolchain-prose.md` carries the weakened
guarantee to the builder in the product's own words — provably structurally sound and traceable, plus
cold judgments; never *verified*.

**Validation:** lint and typecheck clean, `npm test` **3175 of 3175**, `npm run release-check` passed.
Six red proofs against the adapter: detect sniffing a manuscript (2 failures), `build` trivially
succeeding (3), `security-audit` wrongly declining (3), `unit` dropping the report path (1), a CI
pattern for a declined operation (1), and `startCommand` inventing a runtime (1).

**Citation resolver landed, 0.243.0 — `scripts/citations.mjs` (`DESIGN.md` §3.8.4).** Done-when's
flagship clause closes for local sources: *passes on a resolving quote, fails on a misquote, and fails
closed on a source it cannot fetch*.

**Driver-owned and in-process**, wired into `staticGates`, because a builder asked to make a citation
gate pass writes a lenient resolver while a builder asked to make one pass that it cannot edit writes
accurate citations. **Armed by the declared toolchain, never by the manifest's presence** — arming on
the file would let a job delete its citations and lose the gate in the same motion, and that loss is
indistinguishable from a job that never cited anything. An absent manifest **fails** and names the
statement that satisfies it; an empty one passes, because *cites nothing* is a claim and a missing file
is not one.

Three checks per citation, each failing closed: the source package matches the digest it carries (the
only place a post-capture edit can be noticed); the quotation appears verbatim in the captured text;
the quotation also appears in the `usedIn` manuscript file, so the manifest cannot drift from the
prose. Normalization is whitespace-only and deliberately no more — folding case or punctuation would
let real misquotes through, and the misquote is the whole point. The locator is **recorded, not
verified**, and the passing message says so, because confirming a quotation sits at "§3.2" needs a
structural model a captured text does not carry. Source ids and `usedIn` paths are manifest data
naming files in the operator's repository, so both are refused before they are joined.

**Validation:** lint and typecheck clean, `npm test` **3198 of 3198**, `release-check` passed. Eight
red proofs: normalize folding case and punctuation (3 failures), a misquote accepted, manifest drift
accepted, a tampered capture accepted, an absent manifest defaulting to pass (2), a duplicate id
accepted, a source id allowed to be a path, and the gate arming on every project (2).

**Not built, and stated rather than implied:** network acquisition. The public-HTTPS profile, redirect
and address validation, the deadline and body caps, and the mutable-source/non-retainable fixtures all
remain open; the resolver reads packages already in the tree and an absent one fails closed rather
than being fetched.

**Claim consistency landed, 0.244.0 — `scripts/claims.mjs` (`DESIGN.md` §3.8.5).** Done-when's
contradiction clause closes: *a machine-readable contradiction fixture fails while differently worded
semantic claims remain assigned to cold review*.

Three outcomes. One id with two values **under one unit** is a contradiction and fails. One id in two
**units** is *referred* — `42 percent` and `0.42 ratio` may be the same number, converting arbitrary
units is guessing, and failing on a possibly-equal pair would teach an author to flatten every unit
into prose where nothing can see it, making the artifact less inspectable rather than more. The
within-unit comparison runs **first**, so a real conflict cannot hide behind an unrelated mixed-unit
entry.

Numbers compare numerically (`42`, `42.0`, `+42` are one value) and text case-folded — the opposite
calibration from the citation resolver, deliberately: in a quotation case and punctuation are the
meaning, in a declared value they are formatting. Two things it stops short of, both stated rather
than implied: it does not check that the value appears in the prose (a figure written `42%` is
legitimately "forty-two percent" in the chapter), and `statedIn` is only required to be a readable
file in the tree. One asymmetry with the citation manifest: a **duplicate id is allowed** here and
refused there, because two claims under one id is the subject of this module.

**Validation:** lint and typecheck clean, `npm test` **3220 of 3220**, `release-check` passed. Eight
red proofs: a blank value becoming zero, numbers compared as text (5 failures), a contradiction not
reported (3), a mixed-unit id hiding a real contradiction, a referral reported as a contradiction (2),
an unreadable `statedIn` ignored, an absent manifest defaulting to pass (2), and the gate dropped from
the driver wiring.

**The authoring-time refusal Done-when also asks for is already built** — `scripts/dod.mjs` (item 48)
refuses an `unfalsifiable` criterion by name and by line, which is item 49's *"a job whose check
cannot be stated is refused with that reason"*.

**The artifact-to-ratchet claim is now evidenced, not asserted (`test/prose-ratchet.test.mjs`,
`test/fixtures/prose/`).** Done-when's *checks-as-tests suite over a real artifact feeds the ratchet
through the existing reporter path with no parser change* closes.

**Real vitest 4.1.11 output from real checks over a real two-chapter manuscript**, committed verbatim
as a pair. The green run is a finished artifact — word floors on both chapters, a heading-shape check,
a placeholder check, 4 of 4 passing. The regressed run is the **same suite** after chapter 2 was
replaced with `# Findings\n\nTODO: write this up.`, produced by regressing an actual chapter rather
than by editing a report.

Four assertions, and the second is the one that matters: extraction yields ordinary vitest ids with
no prose-specific branch anywhere in `extractTestIds`; the regression costs **exactly** the two ids
whose checks broke, while the two unrelated ones survive, so the loss is attributable rather than a
suite-wide collapse that would say nothing about which chapter rotted; `diffAgainstRatchet` reports
those two as regressions off a banked advance; and an unchanged artifact reports none, so the
guarantee is not vacuous.

**No version bump.** This slice touched `test/` only — no loader-shipped file changed, and
`release-check` confirms it at 0.244.0. An unnecessary bump would mint a plugin cache directory for a
build that is byte-identical.

**Validation:** lint and typecheck clean, `npm test` **3224 of 3224**. Three red proofs: the regressed
fixture swapped for the green one (2 failures), the ratchet reporting no regression at all, and the
ratchet reporting every id as a regression every time (2) — the last being the benign-neighbour case
that a deny-only suite would have missed.

**Source acquisition landed, 0.245.0 — `scripts/acquire.mjs` and `scripts/address-policy.mjs`
(`DESIGN.md` §3.8.6).** The public-HTTPS profile, redirect and address validation, and the deadline
and body caps Done-when names.

**Why it needed its own address module.** This is the only outbound request in the system whose
destination a *model* chose, made from the *operator's machine*, whose answer becomes *evidence*.
Every rule is a CIDR range over **raw address bytes**: `127.1`, `0x7f.0.0.1`, `2130706433` and
`[::ffff:127.0.0.1]` are all loopback and none contains the characters `127.0.0.1`. IPv4-mapped and
6to4 are unwrapped before judgment, and an unrecognized address family is refused rather than
defaulted through.

**The check and the connection are the same act.** The lookup runs once, every returned address is
judged, and the result is handed to the request as its `lookup` function — so there is no second
resolution to disagree with the first. That is the DNS-rebinding window, closed, and a test asserts
the address actually connected to rather than the one the resolver returned. One refused address
condemns the whole name. Every redirect hop re-runs the entire policy; the absolute deadline covers
all hops together; a **truncated capture fails** rather than being kept, because a citation
resolving against the first two megabytes while the quotation sits at the end is a false pass
nothing downstream could detect.

**Validation:** lint and typecheck clean, `npm test` **3262 of 3262**, `release-check` passed.
Nineteen red proofs — nine against the address policy (mapped and 6to4 not unwrapped, an
unrecognized address defaulting to allowed, the metadata range dropped, any port accepted, URL
credentials accepted, plain http accepted, the prefix mask ignoring partial bytes, a bare IP host
unjudged) and ten against acquisition (later hops skipping the URL policy or resolution, one bad
address no longer condemning the name, a truncated capture kept, an empty capture accepted, the
absolute deadline removed, a cookie header sent, script contents surviving, an unclosed script
surviving, and the judged address not handed to the socket).

**One defect found afterwards, by the suite itself (0.247.0).** The hop timeout message reported the
*remaining* budget rather than the ceiling the operator set — on hop four of a chain that is a number
nobody chose, reading as a configured limit. It surfaced as a full-suite-only failure, which exposed
a second and worse problem: the original case hung on hop **one**, where remaining and ceiling are
equal to the millisecond, so a message reporting the wrong one passed except under load. A flaky
assertion is worse than none. The case now burns a measurable slice of the budget on hop one before
hanging on hop two, so the two numbers are unambiguously different, and it fails deterministically
both when the message reverts and when the absolute deadline is removed.

**Deliberately not wired to the loop.** Acquiring anything at all is an outbound effect and item
**106** owns when a job may have one. The Driver step that reads unresolved sources from a citation
manifest and writes their packages is the next slice, and it is gated on that decision rather than
on this code.

**Still open on this item:** wiring acquisition into the loop, the mutable-source and
non-retainable-source fixtures that depend on that wiring, and one live artifact run.

**No longer gated on item 106, which was REJECTED on 20 Aug 2026.** The capability decision this
clause waited for has been made: no job needs an authenticated source, so acquisition proceeds on the
public-HTTPS profile that is already built and measured. Both remaining halves are eligible work.
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

### 50. The blocked-question artifact — a question as OUTPUT, never as interrupt — **DONE (0.233.0)**

**Why it moved.** It completes an existing terminal state rather than adding one. A run that cannot
proceed already ends at `STALLED` and already knows the sentence worth saying; it discards it. The
"never blocks" rule below is what makes this safe to promote — a question is an output of a terminal
state, never a pause inside one, so unattended operation is untouched.

**Landed (0.233.0).** `scripts/question.mjs`, written at every terminal door: the loop's `finish`,
the pre-loop `releasing`, and the crash handler. Derived from the terminal receipt, so **a `SHIPPED`
run emits nothing by construction** rather than by a rule applied on top of it — the benign
neighbour, and the reason it matters is that a machine which always has a question has stopped
meaning anything by one.

- **It cannot become an interrupt, and that is asserted positionally.** `question.mjs` contains no
  `stdin`, `readline`, `prompt(`, `setTimeout` or `await` in its code — a scan no return value could
  perform. The first draft of that scan failed on the module's *own docstring*, which explains the
  rule using the words it forbids; it now strips comments, because a check that cannot tell an
  implementation from an explanation of one punishes the comment that makes the rule legible.
- **There is no ask verb.** The export list is asserted exactly, and no name may match `/^ask/i`.
  Given one a builder would use it — models offload difficulty, and a builder declines hard things
  whenever a decline is available (case J).
- **An uncited question is discarded and the discard is counted.** Same bar as `validateLesson`. The
  phase is a citation of last resort — coarser than a requirement id, still actionable, and used only
  when nothing finer survived, so it cannot mask a run that had ids and dropped them.
- **The decision differs by terminal state.** Telling an operator whose run ran out of money to make
  the requirements decidable is advice about the wrong problem. Options are enumerated because an
  option list is answerable and a paragraph is not, and every option is a change to the
  specification, the budget or the config — the only places an answer is durable.

**A defect this found in itself.** Wiring the pre-loop door broke a pre-existing case, *"files the
receipt even when the logger is the thing that broke"*: this module assumed a logger works, and the
handler reporting that it did not also logged. The terminal writer is exactly what a crashing run may
have lost, and that is the run most in need of a question. The log is a courtesy; the file is the
artifact, and a throwing logger can now cost neither.

**Acceptance evidence.** 18 unit cases, 3 integration cases driving `main` to a real pre-loop
terminal, and `.meeseeks/question.json` added to the guard's positional deny table — where it needed
no new rule, having been covered before the file existed. Proved red four ways: a `SHIPPED` run
permitted to ask (1 fail), an uncited question emitted (4 fail), a discard dropped quietly (2 fail),
an `askOperator` export added (1 fail).

**Residual.** The question is built by the Driver from what it holds, not authored by a model, so its
wording is fixed per terminal state rather than specific to the requirement that blocked. That is the
deliberate half — a builder authoring its own question is the ask verb by another route — but it does
mean the *blocking fact* is the receipt's reason string rather than a sentence about the domain.
Richer wording needs an authoring role that is not the builder, and no such role exists yet.

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

### 51. `CONSTITUTION.md` — the invariants, extracted, numbered and enforced — **DONE (19 Aug 2026)**

**Why it moved.** It is not new product surface. The invariants already exist and already govern the
code; they live in three places with no citable source, which is a completeness defect in what is
already built rather than an addition to it. Its enforcement condition — a test asserting every
`CONST-N` names at least one enforcing code site or test — is the shape of check that would have
caught the guard-registration hole, where the guard's *logic* was tested and green for eleven
versions while nothing asserted its *invocation*. The three conditions below are unchanged: without
all three this is churn and must not be built.

**Landed (no version bump: `CONSTITUTION.md`, `CLAUDE.md`, `AGENTS.md` and `test/` are not
loader-shipped paths; `release-check` agrees).** All three conditions met, which was the price of
building it at all.

1. **Single source.** Thirteen articles, moved **verbatim** — rewording law during a move is how a
   "refactor" silently changes it. `CLAUDE.md`'s section is now a pointer, and the `AGENTS.md` body
   mirrors it byte-for-byte after the permitted preamble, so Codex reads the same pointer.
2. **Numbered `CONST-1`…`CONST-13`.** Citable in a commit, a review, or a plan item, which is what
   the numbering is for.
3. **Enforced.** Every article carries an `**Enforced by:**` line naming real paths, and
   `test/constitution.test.mjs` refuses a citation that does not resolve, an article enforced only by
   documents, a missing enforcement line, and a `CLAUDE.md` that keeps the old restatement beside the
   pointer. Proved red on all four before landing.

The fourth check is the one the item's own argument demanded. Its failure mode is not a wrong
citation — it is the section left in place "for convenience", drifting one edit at a time, until the
copy nobody updated is the copy somebody reads. That is the `HANDOFF.md` header again, and what fixed
that was a gate rather than discipline.

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

### 106. Job-scoped external-resource capabilities — **REJECTED (20 Aug 2026)** by this item's own closing clause; reopens the moment a concrete authenticated job appears

**Closed REJECTED, 20 August 2026, on the clause this item wrote for itself:** *"Close this item as
REJECTED if no concrete authenticated job appears."* None has.

**The admission has three conditions and the operator's authorization is the last of them.** The
binding one is the second: item **34** or **49** must demonstrate *a concrete job that cannot meet
its accepted DoD with public unauthenticated sources*. Nothing does. The public-HTTPS retrieval
profile is built and measured (item 49, `DESIGN.md` §3.8.6), the research and artifact jobs cite
public sources, and meeseeks builds greenfield targets from a PRD — it has no reason to read a
private resource.

**Asked directly, the operator had no case** (20 Aug 2026), offering "GitHub?" as a possibility. This
item is explicit that such an answer is not evidence: *"A configured connector, an available MCP
server, or general product ambition is not evidence."* Building a credential broker against a
maybe is the speculative infrastructure `CLAUDE.md` refuses, and it is the largest, most dangerous
surface in the plan — a raw credential that must stay outside a role's environment, argv, settings,
prompt, tree, logs and receipts.

**GitHub would also be the wrong first capability if one were ever needed**, and the reason is worth
keeping: a personal access token is *broad* and *write-capable*, while this item requires "an exact,
revocable grant from one sealed job to one external resource and operation class". A token that
reaches every repository an account can see is the opposite of exact. The shape that would fit is
narrower — **one authenticated document for a research job**, read-only, one resource, where the
interesting question is the one item 34 already names: whether policy permits *retaining* the
evidence at all, and `unverifiable` when it does not.

**What this changes.** Item 106 leaves the DoD. Item **49**'s remaining acquisition wiring was gated
on "item 106's capability decision" — the decision is made, and the wiring proceeds on the public
profile alone. Item **86**'s admission list is unaffected.

**Reopening is cheap and the bar is unchanged**: a job that cannot meet its DoD without a credential,
named. Until then this is a capability nothing has asked for.

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

This heading follows the historical Phase 6 section, but it does not assign current scope or status.
The Standing Rules and each item's heading and admission clause own those facts. Item numbering
records chronology, not priority. Item **77** therefore lands before item **76** despite its later
number. The top-level build order is authoritative when physical placement and execution order differ.

### 52. Denial dampening (R25c), without giving the guard a redirectable write primitive — IMPLEMENTED (0.225.0; hardened 0.226.0)

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

**Done when:** the Driver refuses a pre-existing redirect and the guard refuses a symlink at the
counter leaf; dampening is per-rule (a test denies rule A
three times then rule B once and sees B rendered in full); an operator denial outside a run is never
dampened; and any counter failure renders full text.

**Landed at 0.225.0, to that design exactly.** The Driver names `.meeseeks/denials/` in
`MEESEEKS_DENIAL_STATE`, creates it `0700` after the lock is won, and the guard opens with
`O_NOFOLLOW`, refuses a non-regular target, and falls through to full text on every uncertainty —
an absent directory, an unreadable file, a ledger past 64KB, a missing session id, no env var at all.
`DESIGN.md` §6.1a records the boundary.

**One thing the first fixture found that the design had not.** The dampened form appends about forty
characters of "this rule was explained earlier", so on a *one-sentence* refusal it was **longer** than
the full one — spending context to save context. Shortening now applies only when it shortens, with a
case asserting a brief refusal renders identically either way.

**Evidence.** Eleven cases: three-then-dampen, per-rule keying with the exact B-was-never-explained
reproduction, per-session keying, no dampening without the env var or without a session id, the
planted symlink (asserting both that the guard stays verbose *and* that the victim file is untouched),
a directory where the counter belongs, a missing directory, an oversized ledger, the decision and both
tags surviving dampening, the shortening-must-shorten neighbour, and an allow rendering nothing either
way. A twelfth, in `main`, is the one this repair nearly reintroduced: reading the session id with a
second `JSON.parse` crashed the guard on exactly the malformed payload it exists to deny, so the
payload is parsed once.

**And two more through a real `node hooks/guard.mjs`**, because this repository keeps paying for
correct logic nothing proved was invoked — the guard itself was right for eleven versions while no
builder ever loaded it. Four denials over stdin with the environment a Driver supplies: the first
three identical, the fourth dampened, every one still a deny with its tag and provenance, and the
ledger where the Driver said rather than where the guard chose. The neighbour runs five denials with
no `MEESEEKS_DENIAL_STATE` and sees one unchanging explanation, which is every operator session. The
fixture uses the *nesting* refusal rather than `git push --force`, because the latter is one sentence
and the shortening-must-shorten rule deliberately leaves it alone.

**0.226.0 hardening.** `O_NOFOLLOW` protects only the counter leaf. The Driver previously exported
`MEESEEKS_DENIAL_STATE` before proving the parent path was real, and `mkdirSync({recursive:true})`
followed a pre-existing `.meeseeks/denials` directory symlink; the guard then created its ledger in
the link target. The Driver now clears any inherited target, creates the leaf non-recursively, rejects
links and non-directories at both path components, verifies the resolved parent/child relationship and
ownership/permissions, and exports the target only after those checks pass. This prevents pre-existing path
redirection. It is explicitly not same-user process isolation; a process outside the hook boundary can
still race filesystem state, and any such stronger claim depends on F42's unresolved boundary.

**Ancestry landed, 0.251.0 — `scripts/ancestry.mjs` and `scripts/run-registry.mjs`
(`DESIGN.md` §6.6).** This closes the specific bypass F42 names. **It does not close F42**, which
requires the authority to hold across a measured isolation boundary (item 84).

The finding's objection was exact: `assertNotNested()` returns depth zero when `MEESEEKS_RUNNING` is
absent, so `env -u MEESEEKS_RUNNING` never reaches ticket redemption at all. Every hardening on the
recognized path sits behind an `if` on a string a Builder owns. **A process cannot choose its
parents**, so a Driver now registers its pid and a starting Driver reconciles the environment's
account of nesting against its ancestry's; disagreement refuses **in one direction only**, and that asymmetry is the threat model: claiming a
*shallower* depth buys the nesting cap and the ticket check, while claiming a *deeper* one buys
nothing because depth only ever restricts.

The register sits at `~/.meeseeks/runs/` — outside every repository, because the attack points the
nested run at a different one, and under a `.meeseeks` path component, because the guard's rule is
**positional** and already covers it. Verified against the real expression, `rm -rf ~/.meeseeks/runs`
included. No new guard rule: §6 records enumeration as the original defect, and a register the guard
had to be told about separately would be that defect's second chance.

Unknown contradicts nothing — Windows (item 65), a read-only home, or an unreadable register all
report `unknown` rather than zero, because a zero would be the check asserting the fact it exists to
verify, and would refuse every legitimate boxed component on that host. Entries are pruned by
**liveness rather than age**: a `SIGKILL`ed run writes no farewell and a real run lasts hours.

**Validation:** lint and typecheck clean, `npm test` **3362 of 3362**, `release-check` passed.
Twelve red proofs at tier 1 — seven against the ancestry reconciliation (a cleared marker accepted, a
child reporting its parent's depth, the furthest ancestor winning, unknown treated as zero, an
unguarded cycle, an unbounded walk, a vanished pid aborting the walk) and five against the register
(an unreadable register read as empty, a dead pid counted as live, an unknown register still
answering depths, `|| null` turning a depth of zero into unregistered, a malformed depth accepted).

`npm run test:integration` **293 of 293** (exit 0, run unpiped — an earlier launch went through
`tail -6`, so the reported exit code was the pipe`s and a real failure was hidden; that is the
defect this repository already records about piping a gate).

**Tier 2 spawns a real Driver as a child of a registered run** (`test/integration/ancestry.integration.test.mjs`),
which is the only way the claim is reachable: what is under test is that ancestry cannot be stated by
the child, so an in-process double would beg the question. Four cases, five mutations red.

**A design error the integration suite caught, and it is the most useful thing here.** The first
version refused **both** directions of disagreement, on the symmetry argument that two disagreeing
authorities should never be resolved toward the convenient one. Tier 2 refuted it within one run:
`nesting-authority.integration.test.mjs` drives a *legitimately authorized* component holding a
redeemed ticket for depth one, whose parent is not registered — and refusing there turns
**best-effort registration into a hard dependency**, breaking every boxed run on a host with a
read-only home or no registration at all. The reasoning that looked principled was wrong about the
threat: a shallower claim buys the nesting cap and the ticket check, a deeper one buys nothing,
because depth only ever restricts.

**Three fixture defects, all found by mutation and all worth recording.**

1. **It made a live model call.** `startDriver` runs the real entrypoint as a real process, so nothing injects a
   spawn double — the child reached its design phase and called the **real CLI**. Tier 2's definition
   is no network or external API (§11.1), and a fixture that quietly makes a live call has broken
   the tier's only promise. A fake `claude` now sits first on the child's PATH, the technique
   `claude-compat.integration.test.mjs` already uses — and which
   `nesting-authority.integration.test.mjs` was already using for exactly this reason, so the
   pattern existed and was not followed. **Audited afterwards:** only two tier-2 fixtures spawn a
   real process at all, and both now put a controlled bin first on the child's PATH.
2. **A stale-pid case that could not fail.** It registered a dead pid and checked a later run still
   started — but a dead pid can never be an ancestor of a live process, so pruning it could not have
   affected the lookup either way. Replaced with deregistration, which is the integration-level risk:
   a finished run that stays on the register plants a refusal for every later run.
3. **An empty directory proving neither half.** A run that never registered leaves no entries —
   identical from outside to one that registered and cleaned up. Both halves are asserted now, and
   the mutation had to remove **both** deregistration sites before it went red.

### 53. Styled milestone lines: gate summary, panel convening, carry/outstanding — **DONE (0.248.0)**
**DONE (0.248.0) — `DESIGN.md` §9.2.** All three milestones speak. Landed last, as `CLAUDE.md`
requires: every other non-blocked feature was built first, so the style layer ate no time that
belonged to the ratchet.

`gate-summary`, `panel-convening` and `carry` are new `StyleEvent` kinds, each carrying its **full
payload** rather than a count — *"SOME GATES ARE UNHAPPY"* tells an operator nothing the run
stopping had not already told them. Gate names and requirement ids stay verbatim and lower-case in
both modes, because the one thing an operator does with these lines is find the finding and
`DOD-5-DESIGN` is not greppable for `DoD-5-design`. The gate summary is emitted **immediately before**
the verbatim gate detail, which still prints in full: a headline over failure output, never instead
of it. The carry is emitted before the panel it narrowed, and its `outstanding` list is the previous
iteration's — what still says no going *into* this review, not a result of it.

**Two defects found while wiring, both in the tests.** The first version of the panel cases drove
the default `run()` harness, which never reaches a panel at all — they would have passed against a
driver that emitted nothing. Rewired through a harness that ships, they then failed on a reviewer
owning none of the required ids, which the driver refuses before convening. Both are the same
mistake: asserting against a loop that never got to the line under test.

**Validation:** lint and typecheck clean, `npm test` **3310 of 3310**, `release-check` passed. Nine
red proofs — three that each emission site is reached (removing any one fails), the summary naming
every gate instead of the failures, a constant reviewer count, the styled summary dropping the gate
names (3 failures), gate identifiers upper-cased (3), an empty outstanding list still rendering a
clause (2), and plain mode rendering an empty accusation.


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

**Done when:** mapping-tightness tests cover all three new events and refuse a missing renderer;
`MEESEEKS_STYLE=plain` preserves the complete plain payload; styled output keeps gate details
verbatim; and changing style cannot alter gate, carry, Panel, ratchet, or terminal decisions. No
heartbeat or child-output path gains narration.

### 54. Role-internal Claude Code dynamic workflow experiment — BLOCKED (research-gated)

**Problem solved:** bounded fan-out and synthesis may improve difficult implementation work, but
only if they do not transfer durable authority to an ephemeral agent organization. This item tests
that proposition; it does not replace `driver.mjs`, the ratchet, the panel, or the oracle.

**Blocked by:** completion of PLAN Gate 0, item **77**'s durable prompt-supply boundary, and a
recorded item **84** containment outcome. Gate 0 includes the atomic owner, hard cross-platform
process settlement, child-environment boundary, exact role tools/CLI compatibility, and candidate-independent
review authority that fan-out would otherwise amplify. Item 84 need not adopt a stronger profile—a
measured rejection is an outcome—but the workflow probe must know and state the containment guarantee
it actually has. Item 65's host deferral does not satisfy this experiment's existing hard
cross-platform-settlement prerequisite; admitting a POSIX-only experiment would require an explicit
scope change rather than treating missing Windows evidence as a pass.

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

**External lifecycle pattern accepted as hostile tests, not a runtime.** Use the useful invariants
from DeepSeek Harness's pinned
[workflow contract](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/workflow/workflow/README.md#L11-L43)
and
[worker lifecycle](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/workflow/workflow-worker-thread/README.md#L37-L73)
as acceptance cases around the Claude-native experiment. Do not import Cordis, its workflow worker,
session runtime, UI packages, or `node:vm` execution model.

Validate the request, route, Driver-owned aggregate cap, and serializable input before publishing a
workflow start. The workflow script cannot see, replace, or widen the Driver cap. Cancellation closes
admission before pending starts settle; a start that resolves after cancellation is disposed without
becoming an admitted child. Every published child receives exactly one terminal settlement. Disposal
is bounded and idempotent, waits for child quiescence, terminates survivors, and cannot turn an
incomplete workflow into success. Inputs, outputs, and receipts cross a plain-JSON boundary that
refuses cycles, functions, `undefined`, non-finite numbers, and non-plain or custom-prototype values.

Before the live probe, commit deterministic lifecycle fixtures that drive the production workflow
spawn path through success, child failure, recursion refusal, aggregate-cap refusal, role timeout,
post-turn wait expiry, hard kill, and restart. Each fixture records descendant processes and created
worktrees and proves bounded settlement, bystander survival, no stale run lock or orphan worktree,
and no ratchet, finding, or terminal-state advancement. Removing any settlement path must make the
owning fixture fail.

**Done when:** all four DOGFOOD cases pass in a live run; receipts prove the Builder workflow
remains separate from ordinary cold Panel and Oracle contexts; a child cannot recurse and an exceeded
aggregate cap refuses closed; a forced native dollar-cap case accounts for every completed agent,
prevents a later spawn, settles remaining background agents, and returns a failed bounded assignment;
descendant settings and the observed post-turn wait ceiling are evidenced rather than inferred; a
workflow terminated by any ceiling leaves no process or worktree ambiguity; workflow success cannot
advance global state; an independently cold panel
reviews the result; and the measured outcome gives a credible improvement in accepted work or cost
without a new false-completion path. A failed or inconclusive probe rejects adoption without
affecting the existing Claude-native path. Pre-start validation cannot publish a run, cancellation
cannot admit a late child, duplicate or missing child settlement refuses, a second disposal is a
no-op, forced termination leaves no live descendant, and a non-JSON result cannot enter a receipt.

### 55. Exact evidence provenance before any explicit graph — **REJECTED by its own admission test (19 Aug 2026), with evidence**

The item's Done-when offers two outcomes: *"either the admission test rejects the feature with
recorded evidence, or the minimal metadata ships"*. The admission test was run. **It rejects.**

**The trace already exists.** It is assembled across five driver-owned artifacts rather than held in
one graph, and every edge the item asks for is present:

| the item asks for | where it already is |
|---|---|
| requirement id → why satisfied | `review.json`: the panel entry, with `evidence: file:line` |
| artifact path plus digest | `pins.json`: the requirement pin fingerprints the whole evidenced file |
| gate/test provenance | `acceptance.json`: per-gate `commandDigest`, `attempt`, `reports` (item 126) |
| observed tree identity | `acceptance.json` `subject`, sealed to the candidate tree (F14) |
| upstream assumption ids | `assumptions.json`: **`cites` is the PRD id** — `{"cites": "PRD-2.4", ...}` |
| reviewer provenance | `review.json` plus `supply.json`, the role-supply receipt (item 77) |

The last row is the one that decided it. The item was written believing the requirement→assumption
edge was missing; it is not. `templates/builder-system.md` requires every assumption to cite the PRD
id it rests under, and `assumptions.mjs` refuses one that cites nothing. The edge has existed since
the citation bar did.

**Against the five admission conditions:**

- **(a) explain why a requirement is satisfied** — yes, from the table above.
- **(b) invalidate all and only descendants** — yes for the case that matters. A requirement pin
  fingerprints its evidenced file, so changing that file invalidates *that* requirement and nothing
  else. That is targeted invalidation; it is simply keyed by file rather than by a graph edge.
- **(c) preserve unrelated verified progress** — yes. Pins are per-requirement and the ratchet is
  per-test-id; neither is wholesale.
- **(d) survive restart** — yes, all of it is on disk, and item 58's journal now covers the one thing
  that was not.
- **(e) make terminal-state checking more deterministic** — already done by the acceptance receipt,
  which is the artifact item 76 exists for.

**The one real difference, and why it is not waste.** A mid-run `PRD.md` edit refuses the whole run
(`verifySpecification`) rather than invalidating only the edited requirement's descendants. A
provenance graph would let the run continue against the untouched requirements. **That would be
worse.** A run is started against a revision and judged against it; letting it carry on while the
specification moves underneath is precisely the drift F12 exists to refuse. The wholesale refusal is
a deliberate design decision, not the absence of one, so it cannot be the "waste, stale evidence, or
unsafe completion decision" the item required a real run to demonstrate.

**Verdict: keep the current ratchet/pin/fingerprint model**, exactly as the item's own fallback
clause says. Building the graph would add a second, richer representation of edges that already
exist — the failure mode this repository has now paid for twice in a day, most recently in item 58,
where four of seven proposed event types were already answerable and recording them again would have
created two authorities that can disagree.

**What would reopen this:** a real run in which a requirement's evidence is invalidated and the
existing model cannot say which *other* requirements depended on it — that is, a genuine transitive
dependency between requirements, which nothing in the current model represents. None has been
observed. Item 106 and item 34 do not need it; if item 49's artifact job-types produce claims that
depend on other claims, this reopens with that evidence and not before.

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

### 56. Child environment trust boundary — **DONE (0.232.0)**; REVIEW F5 open pending Codex

**Problem solved:** `childEnvironment()` copied the operator's complete environment into each
`claude -p` child. That preserved tool discovery, and it also gave an unattended Builder ambient
credentials, unrelated secrets, and Claude control variables it was never deliberately supplied.

**Slice A — measured, 19 Aug 2026, against a real `claude -p`.** Synthetic values only.

- A Builder-launched Bash read **every** seeded name: a deploy token, a database URL, an AWS
  secret, and `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, `CLAUDE_CODE_SUBAGENT_MODEL`,
  `CLAUDE_CODE_MAX_OUTPUT_TOKENS`, `MAX_THINKING_TOKENS`. The last four are control-plane inputs:
  they can change retry, resume, model routing and budget behaviour underneath a sealed role
  contract.
- **The minimum is far smaller than expected.** A real child authenticated and answered with `PATH`
  alone — no `HOME`, no auth variable. `HOME` and the rest are carried for the *target's* tools, not
  for the CLI.

**Slice B — the boundary is a keep-list, and the polarity is the whole design.** A deny-list would
carry the guard hook's original enumeration defect: each new secret a machine acquires is admitted
until somebody remembers to add it. Now every name defaults to *not crossing*.

Kept: a measured base set (`PATH`, `HOME`, shell/locale/temp/term), Windows necessities, Anthropic
authentication, this Driver's own markers, and an operator allowlist of **names**. `childEnvAllow`
is names only — the value is read from the operator's environment at spawn time, so nothing secret
enters a config file, a receipt, or a log. It **cannot name a Driver-owned marker**, and
`childEnvironment` refuses one that does: a run whose guard, depth or nesting marker could be
introduced by configuration has no boundary to enforce.

**The first measurement of the enforced boundary found the next defect.** Every synthetic secret had
stopped crossing and `AWS_SECRET_ACCESS_KEY` was still present — correct if the run authenticates
through Bedrock, and a pure leak otherwise. A machine holding AWS credentials for something
unrelated is the ordinary case. Cloud credentials are now gated on their provider selector, and a
selector present but set to `0`, `false` or empty reads as *not in use* rather than as truthy.

**Acceptance evidence.** 16 unit cases; five mutations proved red (whole-environment copy 3 fail,
a Driver-owned marker dropped 2 fail, the allowlist permitted to name one 1 fail, any-present-value
selector 3 fail, provider gate removed 5 fail). Tier 3 twice: the same probe that opened the item
re-run against the boundary reports **every** seeded name absent with `MEESEEKS_RUNNING`, `PATH` and
`HOME` present, and `test/live/guard-registration.live.test.mjs` still passes 3/3 — the guard reaches
a real child on the minimal environment, which is the invariant `CLAUDE.md` says is easiest to break
silently. `test/live/child-environment.live.test.mjs` commits that probe, and asserts the child
*answered about* every name so that "absent" cannot be satisfied by a reply that never mentioned it.

**Residual, named rather than hidden.** Anthropic authentication still reaches the Builder's own
Bash, because a child process and the Bash it spawns share one environment; separating them needs
`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`, whose provider coverage and process-lifecycle side effects are
unmeasured here and belong to item **84**. The hook and stdio-MCP subprocess surfaces item 56 also
names are likewise unmeasured. What is proved is stronger where it applies: the dropped variables
never enter the child at all, which no downstream scrub can undo. No Eve, no Vercel Sandbox, no new
runtime dependency.

### 57. Machine-readable morning-acceptance evals — OPEN (extends item 20)

**Substrate landed, 0.247.0 — `scripts/eval-result.mjs` (`DESIGN.md` §11.3).** The Done-when clause
*"cases A/B emit schema-validated, directly comparable results"* has its artifact; the campaign around
it does not exist yet and is stated below rather than implied.

One JSON record per trial, following `run-manifest.mjs`'s discipline: nothing inferred, no clock read,
a missing field throws. Four rules with teeth **at construction time** rather than in a reader's
discipline — an accepted trial cannot have a failing deterministic gate whatever the judge scored; a
trial that made a false claim or had a forbidden effect cannot be accepted at all; an infrastructure
failure cannot also be an acceptance because it produced no measurement; and requested and observed
models stay distinct, with `null` meaning *not reported* and a role missing from the observed map
refused outright.

`comparable()` refuses across any differing profile field or external tool version and names **every**
reason rather than the first, and refuses a comparison that would rest on an unobserved model — the
headline *"model X beat model Y"* is unfalsifiable if nothing recorded which model served the
requests. `summarize()` keeps every failed, interrupted and missing attempt in the denominator, counts
infrastructure failures separately from measurements, returns `null` rather than manufacturing a rate
from zero measurements, and calls a cohort reliable only when **every** measured trial was accepted —
*two of three* is the shape that gets promoted as a win.

**Validation:** lint and typecheck clean, `npm test` **3295 of 3295** over three consecutive runs,
`release-check` passed. Ten red proofs: a judge promoting a failed gate, a destructive trial accepted,
an outage accepted, an outage charged to the model (2 failures), a failed attempt leaving the
denominator, one-of-three counting as reliable (2), a rate manufactured from no measurements, a
changed profile compared anyway (2), an unobserved model compared anyway, and a role missing from
`observedModel` accepted.

**Still open on this item:** the sealed evaluation protocol, counterbalanced run order, uncertainty
interval, scenario contract audit, isolation canary, and the unseen final partition — all of which
need live comparative runs and item 20's cases A/B to be worth anything.

**Deterministic fixture strategy:** add the smallest Node-native `record`, `replay`, and `refresh`
mechanism the campaign needs, adapting DeepSeek Harness's pinned
[snapshot discipline](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/test-support/acp-snapshot/README.md#L5-L14)
without importing ACP, Cordis, Vitest infrastructure, or its dependency closure. `record` may execute
a live declared scenario; `replay` and `refresh` are keyless and structurally unable to invoke Claude.
Replay consumes sealed protocol and result artifacts through production readers, not hand-built
objects or prose logs. Normalize only enumerated volatile fields such as disposable roots and
timestamps; preserve semantic identities, ordering, terminal outcomes, failures, and child receipts.
Missing, malformed, incompatible, duplicate, truncated, mutated, stale, profile-mismatched, or
orphaned fixtures refuse rather than silently regenerating.

Replay validates harness logic only. It is not production resume, terminal authority, a new canonical
event log, a fresh trial, or live model evidence. Refresh cannot discard an unsuccessful attempt or
change a sealed campaign decision.

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
isolation check before live comparison begins.

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
robustness and recovery without relying on a model's confidence report. A live cold calibration case
also proves each relevant Panel role sees a seeded high-severity defect and does not invent the same
finding in its clean neighbour; a reviewer prompt/model change cannot be selected by hiding misses,
false positives, or disagreement behind aggregate morning acceptance. A deliberately changed CPU,
memory, concurrency, timeout, or tool profile refuses direct comparison, while a synthetic
infrastructure outage remains visible as missing evidence rather than a model-quality regression. The
campaign protocol, fixed trial count, run order, threshold, and stopping rule are sealed before the
first result; a failed or missing attempt remains in the denominator. A deliberate prior-trial
file/history/service contaminant is detected before live comparison, and baseline/candidate trials
start from matched fresh snapshots. Every admitted scenario passes the contract/reference/negative/
alternative audit, and a seeded low-coverage task is quarantined rather than scored. The comparison
reports its precommitted uncertainty interval and treats a delta that does not establish the minimum
meaningful improvement as no win.
The final package digest is recorded, its hidden answers and checks are absent from public/model-visible
surfaces before use, and an exact-answer search leak marks the affected result contaminated. A final
failure denies readiness without becoming optimization input, and an opened package cannot be reused as
final evidence. Human-labelled acceptance records the rubric and whether candidate identity and the
agent's terminal assertion were successfully blinded. At least one real case-A and case-B capture
replays deterministically; replay is byte-stable under its declared normalization contract; keyless CI
fails if a model invocation is attempted; hostile fixture cases refuse; and replay cannot alter the
sealed decision or count as another attempt.

### 58. Forensic lifecycle event journal before resumability — **IMPLEMENTED (0.238.0)**, narrowed by its own experiment; a valid-outcome precedence follow-up was admitted with §7.4 on 21 Aug 2026

**Status note (21 Aug 2026).** A review pass demoted this to PARTIAL over the `existsSync`
presence-only outcome check. The 0.238.0 slice met the contract it was built against; the
"valid-outcome precedence" rule it fails was introduced by the same uncommitted §7.4/§16.3 batch
that recorded the demotion. The honest shape is the one above: the slice is IMPLEMENTED against its
own contract, and the precedence rule is follow-up work admitted with §7.4, tracked here.

**The admission experiment ran before anything was built**, which is what the item asked for: kill a
controlled run at named boundaries, try to reconstruct the settled and unsettled work from current
artifacts, and **reject the item if they are already sufficient**. Four boundaries, real driver
subprocesses, `SIGKILL` to the process group, a counterfeit `claude` on `PATH` so the later
boundaries were reachable without spending anything.

| killed | `.meeseeks/` afterwards |
|---|---|
| after the lock, before any child | `config`, `launch`, `lock`, `specification` |
| after the specification was captured | *identical to the above* |
| after design, before a brief | adds `capabilities`, `supply`, `denials` |
| mid-loop, three briefs in | adds `briefs/iter-001..003`, `gate-skip`, `red-evidence`, `run` |

**What is already reconstructable, and therefore must not be rebuilt:** that the run launched and
against which tree (`launch.json`), which specification revision it was held to
(`specification.json`), what the design phase concluded (`capabilities.json`), what each cold role
was handed (`supply.json`), how many iterations **started** (`briefs/`), and the ratchet's state.
That is most of the item's proposed event list, and a journal re-recording it would be duplicate
authority for no diagnostic gain.

**What no artifact answers, which is the whole finding:**

1. **Whether the last iteration settled.** Three briefs say three iterations *started*. Nothing says
   whether iteration 3's gates ran, whether its panel returned, or whether it was killed between the
   two. `gate-skip.json` and `red-evidence.json` are cumulative rather than per-iteration-settled.
2. **Which child was in flight.** The log's last line named it; nothing on disk did. A forensic
   reader working from the tree alone cannot say whether a builder, a reviewer, or nothing at all was
   running when the process died.
3. **The first two boundaries are indistinguishable.** A run killed before the design child started
   and one killed after the specification was captured leave *byte-identical* directories. The
   run had made real progress between them and left no trace of it.

**Verdict: admit, and narrow to those three.** The item proposed run, phase, iteration, child, gate,
panel and terminal events; the experiment says four of those seven are already covered by artifacts
that exist. Building the full stream would be speculative infrastructure — the thing this repository
refuses — so the journal records **iteration settlement, child lifecycle, and phase entry**, and
nothing that another artifact already establishes.

This also sharpens item 36. "Can this run safely resume?" is exactly question 1, and the answer is
currently unavailable from disk, which is a concrete reason for the journal rather than an
architectural preference.

**Landed (0.238.0), scoped to exactly the three gaps the experiment found.** `scripts/journal.mjs`
appends `.meeseeks/events.ndjson`: `phase-entered`, `child-started`, `child-settled`,
`iteration-started`, `iteration-settled`. Five kinds, not the item's seven — the other two were
already answerable, and a journal re-recording them would be a second authority for the same fact:
two records that can disagree, with nothing saying which is right.

**A real ordering defect the test found.** `child-started` was recorded *after* the line announcing
it. Killing on that exact line found **no journal at all** — a kill landing between the two loses
precisely the transition the file exists to preserve. The transition is now recorded before it is
announced, which is also the more honest order.

**It cannot end the run it exists to explain.** `recordEvent` reports a failed write through the log
and returns; it is written on the crash path, where the filesystem is exactly what may already have
failed. `child-settled` fires in a `finally`, so a child that threw is settled rather than left in
flight forever — an unsettled child is this journal's strongest claim and it has to mean "was running
when everything stopped", not "failed in a way nobody recorded".

**Reading is deliberately asymmetric about corruption.** A half-written *last* line is the ordinary
shape of a file produced by a crash, and refusing it would make the journal useless at the one moment
it matters. A malformed line anywhere earlier is refused: a gap in the middle of a history is not a
history.

**Remaining contract:** validate every journal field and bound its allocation before a record informs
diagnosis or projection. Terminal precedence must likewise validate `outcome.json` through the bounded
receipt reader before suppressing an unsettled-journal diagnosis. Presence alone is not evidence:
missing, malformed, oversized, wrong-shape, or field-oversized records remain unavailable/corrupt
while the journal keeps its literal state. Add hostile and valid-neighbour fixtures at launch
diagnosis and the future observer boundary. This is implementation work under DESIGN §§7.4 and 16.3,
not a reason to weaken their evidence rules.

**Nothing decides on it.** The Driver never reads it back. It records transitions and identity, never
content — `detail` carries a model name, never an exchange, bounded at 200 characters, because a
journal accumulating what children said would be an unbounded log of untrusted text in a
driver-owned file. `.meeseeks/events.ndjson` needed no new guard rule; the positional boundary
covered it before the file existed.

**Acceptance evidence:** 15 unit cases and 4 tier-2 cases that kill a **real driver process group**
with `SIGKILL` and read the survivor. Proved red eight ways, and three of those reds came only after
fixing the test rather than the code:

- two integration cases looped over an **empty journal** and passed;
- the counterfeit `claude` was written inside the repository after the commit, so the tree was dirty
  and launch refused in 173ms — the same harness mistake that cost three done-bar cases an hour
  earlier;
- the `first unsettled iteration, not the highest` case had only **one** open iteration, so both
  readings gave the same answer and a mutation survived it;
- removing `child-settled` survived until a case existed that killed *after* a child had settled.

**Item 36 is unblocked.** "Can this run safely resume?" is the experiment's question 1, and it now has
an answer on disk. Resume itself remains a separate decision with its own idempotency and receipt
semantics; this journal is not terminal-state authority and must not become one.


**Still true, and unchanged by the experiment:** the Driver never reads the journal to decide
anything; it records no model deltas, hidden reasoning, tool chatter, or ephemeral-agent telemetry;
and any later cold-load path must verify an exact compatibility fence before resuming. This journal
never becomes terminal-state authority by accident.

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

**No live check is due for this slice.** `templates/reviewer-system.md` and the reviewer output
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
and any parser/template contract change receives the required live check. This may batch with
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
mandatory tier-3 check observes the production `claude -p` contract. REVIEW F7 closed this at 0.194.0.

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

**Problem solved:** live pre-loop and outer-exception aborts can leave no `outcome.json`, and the
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
and left nothing durable — on live paths, where a parent component correctly fails closed on a
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

### 65. Prove native-Windows CLI sealing and descendant cleanup — DEFERRED (final native-Win32 tranche; REVIEW F11; REVIEW F28 evidence)

**Scheduling:** execute this implementation-and-acceptance slice after all eligible WSL/POSIX work,
on a real native-Windows host. Deferral changes traversal order only: it does not resolve F11,
satisfy a cross-platform prerequisite, or permit a Windows guarantee. WSL, POSIX process trees, and
injected `win32` doubles may support design and deterministic tests but are not native-Windows
acceptance evidence.

**Problems solved:** Windows timeout cleanup currently terminates the `shell:true` wrapper without
establishing that its application children and grandchildren are gone. The production Claude seal
also resolves through `sh -c 'command -v …'` and has no native-Windows resolver/classifier path;
non-shebang `.cmd` or PowerShell launchers are treated as native executables, so stable wrapper bytes
do not bind a delegated entrypoint. A host without `sh` can refuse before any role, while a package
shim can be under-sealed. Neither shape has native-Windows evidence.

Implement a bounded Windows process-tree termination path shared with F2's lifecycle contract.
Preserve grace then force, guaranteed settlement, and bystander safety; do not weaken the existing
POSIX process-group path. Add a platform-aware CLI resolver and launcher-closure classifier that
matches the actual bare-PATH invocation on native Windows, binds every mutable delegated artifact, or
refuses the install form before any `claude -p` probe or role. Keep the mechanism dependency-free and
feed its evidence into item 83/REVIEW F28 without treating platform support as finding closure.

DeepSeek Harness's pinned
[`taskkill /T /F` path](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/subprocess/subprocess-local/src/spawn.ts#L253-L264)
and
[kill-on-close Job Object wrapper](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/sandbox/sandbox-windows-acl/src/spawn.ts#L210-L226)
are candidate mechanisms to measure, not an accepted design or closure evidence. Prefer the smallest
dependency-free mechanism that passes this repository's native fixture. Do not import Cordis, Koffi,
sandbox, or subprocess packages.

**Done when:** on a real native-Windows host, a tier-2 fixture starts a shell, application, and
grandchild and proves all three disappear within the bound while an unrelated process survives.
Exercise cooperative grace, forced termination, partial startup, repeated cleanup, and failure to
establish ownership. POSIX cleanup and successful health probes remain green. A WSL, POSIX-only, or
simulated result cannot close REVIEW F11. Separate native fixtures resolve the admitted Claude install
form without POSIX `command -v`, reject a hostile PATH shadow before its version path executes, bind
or refuse `.cmd`/PowerShell/package delegation, and detect a stable wrapper whose delegated target
changes while a benign neighbour reaches the role. The staged pinned-CLI live contract passes on that
host before the product claims native-Windows execution.

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

First run a live synthetic canary through a real Builder using `Read`, Bash, and Builder-launched
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

### 73. Bound allocation for decision-bearing artifacts — REOPENED 21 Aug 2026 (archive attribution reads), **repaired at 0.286.0**; prior repairs 0.192.0, 0.197.0, and item 109; REVIEW F19 open pending Codex

**The reopening's repair (0.286.0).** `archiveSealedReports` performed the module's own forbidden
shape twice: the acceptance receipt read whole and parsed unbounded, then every `.json`/`.trx` in
`.meeseeks/` — files gates the target controls get to write — read whole to hash. Both now go
through `readBounded`: the receipt at the record ceiling (driver-written, small by construction; an
oversized one is corrupt and names nothing), the candidates at the report ceiling (banking already
refuses larger reports, so a sealed report can never legitimately exceed it — a file above the
bound is unverifiable, and unverifiable is left behind exactly as an unmatched digest is). Red
first: a 33MB claimed report was archived and an 17MB-padded receipt still named reports under the
unbounded reads; both refuse after. Benign neighbours unchanged: the sealed report still archives,
the unmatched one still stays behind. `test/run-manifest.test.mjs` 47/47, tier 1 3527/3527, lint
and typecheck clean. The DESIGN §7.2 sentence naming this gap is amended when the operator's
in-flight DESIGN edit lands, to avoid sweeping their uncommitted work into a slice commit.

**Problem solved:** prompt-bound, parsed, and hashed files can be synchronously loaded without a
size boundary, allowing a repository or generated report to exhaust the Driver.

**Current reopened gap:** `archiveSealedReports()` synchronously reads `acceptance.json` and every
eligible `.json`/`.trx` report with `readFileSync` before deciding which evidence to preserve. A
target-controlled oversized receipt or report can therefore exhaust the Driver during the next run's
archive path, bypassing the shared bounded-read policy. Route the receipt and report content through
the existing class limits (or a bounded/streamed equivalent), preserve exact digest matching, and add
oversized receipt/report fixtures plus boundary-sized benign neighbours. Refusal must preserve the
previous evidence and reach the existing terminal path.

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
before the loop's own `try`/`finally`, so a throw there ended a live run with no `outcome.json` and
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

**F21's tooling sub-claims repaired (21 Aug 2026, tools/test only — no bump; `tools/` is not a
loader path).** Verified against current code first, every cited line still live, then repaired:
the absent-settings crash (`digestOf` was a bare `readFileSync` called at module top level on
`~/.claude/settings.json` and the registry, so a fresh operator got an uncaught ENOENT instead of a
`REFUSED:` line — absence is now an identity of its own, equal to itself and unequal to presence);
the POSIX-only `sh -c command -v` binary probe (now platform-forked to `where` on win32); three
hand-built `file://${path}` URLs and one `url.slice('file://'.length)` reversal (now
`pathToFileURL`/`fileURLToPath`, because a Windows coverage URL is `file:///C:/…` and the slice
leaves `/C:/…`, so every module read as a stray and a correct install was refused);
`transcript_path: '/dev/null'` (now `os.devNull`); and `plugin-snapshot.mjs`'s direct-invocation
guard comparing against `new URL(...).pathname`, which never matches on Windows so the CLI would
exit having done nothing — and which **no test had ever invoked as a CLI on any platform**, the
guard-registration shape in a tool. Evidence: `test/integration/plugin-snapshot.integration.test.mjs`
now runs the real command and requires it to have staged the manifest (7 of 7); lint and typecheck
clean. The install-check's own end-to-end evidence remains what it always was — its next live
execution against a staged candidate, which the item 83 boundary runs perform. The marketplace description landed at 0.284.0
— a top-level `description` in `.claude-plugin/marketplace.json`, resolving the validator warning
this item's own text records, with the ordinary shipped-manifest bump. Still open here: the
mandatory-release-stage decision this item's text already records.

### 76. Persist a complete exact-tree acceptance receipt — **IMPLEMENTED (0.210.0-0.224.0); REVIEW F22 owns closure**

**Header corrected 19 Aug 2026 after checking the code rather than the note.** It read "the
clean-clone traversal and per-gate attribution have not landed". Per-gate attribution **did** land, at
0.224.0 (item 126): `GateRecord` carries `commandDigest`, `attempt` and `reports`, `acceptanceGates`
builds them, and `writeAcceptanceReceipt` has a production caller. The per-role half is equally
present under names the note did not use — `models` is the tagged observed identity, `requestedEffort`
the requested one, `supplyDigest` item 77's receipt — all populated by the Driver, not merely typed.

That is documentation drift rather than missing work, and it is the expensive kind: an entry saying
a thing is unbuilt is an invitation to build it twice. Recorded here rather than quietly fixed,
because the same note had already survived one re-baseline.

**What actually remains is `REVIEW.md` F22's clean-clone traversal**, and it is not a build task. The
edges an auditor would traverse are all recorded; whether they add up to "a clean-clone auditor can
traverse one `SHIPPED` receipt to every required same-tree acceptance edge" is an acceptance
judgement, and F22 is Codex-owned. Claude does not close it.

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
This is a shipped config/manifest change and receives the ordinary version bump. The live tier
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
passes; and the shipped command/Driver change receives the required version bump. A live
slash-command invocation is not required unless implementation changes the external Claude Code
loading or argument-passing contract. REVIEW F24 closed this at 0.194.0.

### 80. Make the supported `/meeseeks` command user-invocable only — **IMPLEMENTED (control 0.203.0, installed-loader canary 0.209.0)**; REVIEW F25 owns closure

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

**The canary landed at 0.209.0 and this entry said otherwise for fifty-eight versions.** Recorded as
documentation drift rather than quietly corrected, because a plan that understates what is built is a
queue that lies about what is left — and this one was read as open work more than once.

`test/live/plugin-loader.live.test.mjs` stages the candidate the way a loader installs it and asks a
**real model** to list every Skill it can invoke, asserting `meeseeks` is not among them. Asked of
the model rather than of a listing, because what F25 bounds is *Skill selection*: a model that cannot
see the skill cannot name it. It arrived with F21's installed-snapshot harness — the machinery four
findings were queued behind — and it passed live again at 0.263.0 in 13.4 seconds.

Items **79** and **75**, which this was batched with, are both `IMPLEMENTED`. Nothing remains here
but Codex's closure of F25.

**Superseded, and kept for the trail:** the canary was described as batched with items **79** and **75**
as F25 itself directs, because a separate release campaign for one probe is the cost that finding
was written to avoid. `PARTIAL` for exactly that reason.

**Done when:** command-contract tests fail if the field is absent, false, or confused with
`user-invocable`; `claude plugin validate` accepts the versioned command; a pinned-CLI canary
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
literal `--tools ""` for Oracle-author and unchanged unrestricted Builder behavior; the live Oracle
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

### 83. Enforce a measured Claude Code compatibility policy — PARTIAL (policy 0.205.0; seal armed 0.261.0, item 139; auth preflight 0.263.0, item 141): probe/seal ordering, metadata probes, and the same-candidate live tier remain (REVIEW F28)

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
discovery/authentication behavior, including any later bare-mode transition. Pinned live runs at
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
measurements in this repository, and the ceiling is **2.1.235**, the newest release whose full live
tier passed. 2.1.136 is cited as *recorded incompatible* — no `--safe-mode` — which is why the true
floor is unknown and the demonstrated one is named instead. A test requires every bound to appear in
the evidence list. Item **107** records the initially refused 2.1.235 widening and the later clean
full-tier pass that admitted it.

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

**The sealed-identity mechanism landed, 0.249.0 — `scripts/claude-seal.mjs` (`DESIGN.md` §3.5.1).**
The half this item named as *"not yet done, and named rather than implied"* is built and unit-proven.
The live half is not, and the status stays `PARTIAL` for that reason alone.

**Built is not armed, 0.261.0 (item 139).** For eleven versions nothing called `sealTarget`, so
`options.seal` was `undefined` in every real run and the door below verified nothing. The sentence
that follows this one — "`spawnClaude` re-verifies **before every child**" — was true of the
function and false of the product, and every test that proved it handed the function a seal by hand.
The run now seals after launch revalidation and threads it through `runChild`. Two further defects
surfaced the moment a fixture drove the real entrypoint: the seal and its verification resolved
different PATHs, and the version clause compared the sealed version against itself.

**Five ways the binary a role spawns stops being the binary preflight measured, and none of them
changes the version string** — which is exactly why the version check cannot see any of them: a PATH
shadow inserted after preflight; an atomic byte replacement reporting the same version; a retargeted
symlink; a background auto-update, which the CLI applies on the *next launch* while a run launches a
child per role per iteration; and a launcher whose own bytes are identical while its delegated
entrypoint moved.

`spawnClaude` re-verifies **before every child**, at the same door the context budget and the supply
boundary use and for the identical reason — every child passes through it, so a phase added later
cannot forget the check — and before argv is built, so a refusal costs nothing. The test asserts the
child *never ran* rather than asserting a failure code, because a refusal after the spawn would
report the same code. Re-resolution is part of the check: going straight to the sealed path would
leave the PATH shadow invisible, which is the state an attacker wants.

Identity is install-form-specific — an executable is one artifact, a symlink binds its resolved
target, a script launcher binds **both itself and what it delegates to**, which is why the closure is
a list. **An unbounded closure is refused rather than approximated**: the delegation parser reads the
one quoted shape npm-installed CLIs use and returns nothing for anything else, because a wrong guess
seals the wrong file while reporting success. `DISABLE_AUTOUPDATER` travels with every Driver-owned
invocation, **merged last so an operator cannot override it** — a run whose binary changes underneath
it is not a preference, and suppressing the update is what makes the seal a guarantee rather than an
alarm.

**Corrected by review, 21 Aug 2026 (Codex; verified against `scripts/driver.mjs` and accepted by the
implementing session — appended rather than rewritten, because dated evidence is history):** the
door above covers *role* children; the initial and per-role bare-PATH `claude --version` probes
execute before `sealTarget`/`verifySeal`, so a shadowed or replaced launcher can execute once
outside the sealed path, and the two `toolVersions()` metadata probes carry neither the seal nor
`DISABLE_AUTOUPDATER`. The delegation parser's refusal applies to the recognized shebang shape; a
non-shebang target is currently classified as native, and native-Windows launcher classification is
item 65's. These gaps are recorded against REVIEW F28's still-open closure.

**Validation:** lint and typecheck clean, `npm test` **3336 of 3336**, `release-check` passed. Fifteen
red proofs — eleven against the module (PATH shadow accepted, no fingerprint rechecked, only the
launcher rechecked and not its entrypoint, retargeted symlink accepted, version change accepted, an
unbounded launcher approximately sealed, the parser guessing at unquoted text, an unbounded read
window, auto-update not suppressed, a shared controls object) and four against the wiring (the driver
never consulting the seal, the verdict computed and discarded, an operator overriding the controls,
the controls never reaching a child).

**One gap the suite found in itself.** The first "returns null rather than guessing" case listed three
scripts that contained no `.js` at all, so removing the quote requirement from the parser changed
nothing and the mutation survived. Cases with an unquoted `.js` delegation and a delegation buried
past the read window were added, and both mutations then failed.

**The five fixtures landed with it** (`test/integration/claude-seal.integration.test.mjs`, tier 2).
Real files, real symlinks, real `PATH` resolution, no external calls: a hostile shadow inserted after sealing,
an atomic `rename` replacement whose version is unchanged, a retargeted symlink, a launcher whose own
bytes and version are stable while its delegated entrypoint moved, plus an unreadable delegation and
a deleted target. The neighbour — an untouched target verifying — is the case that proves the
resolver finds anything at all; without it every refusal would pass against a resolver that always
returned null. Five further red proofs against the real filesystem, including one that fails **all
seven** when the resolver ignores its supplied environment.

`npm run test:integration` **281 of 281** with the new fixtures included, up from 274.

**One fixture defect, and it was the module being right.** The first draft built its "native" binary
as a `#!/bin/sh` script — which this mechanism correctly classifies as a *script launcher* with an
unreadable delegation and refuses. The fixtures now copy a real system binary, because the
distinction between an executable and a launcher is exactly what the seal is about.

**Still owed for closure (REVIEW F28):** the pinned live runs at every admitted compatibility
boundary, plus two source defects found on 21 August. The initial and per-role
`measureClaudeVersion()` calls execute bare-PATH `claude --version` before `sealTarget` or
`verifySeal`, so a shadowed/replaced launcher can execute once even though the later paid role is
refused. Both `toolVersions()` metadata calls execute another bare-PATH version probe without sealed
controls or verification. Reorder the boundary so identity is resolved/fingerprinted before any
version execution, execute the probe through that verified closure, verify again afterward, and
route every metadata probe through the same control. Hostile fixtures must prove the unverified
version target never executes, not merely that the later role does not. Item 65 separately owns the
native-Windows resolver and launcher forms.

**Both repaired at 0.285.0.** The run boundary now seals first with a placeholder version — resolve,
realpath, closure fingerprint, no execution — then measures `--version` through the resolved path
it just fingerprinted, then verifies the fingerprint again before binding the measured version into
the seal; bytes that changed under the measurement refuse the run. `measureClaudeVersion` takes an
explicit invocation with **no default**, so a future call site cannot fall back to a bare lookup;
the per-role check passes `seal.path`. `toolVersions` no longer probes `claude` at all — the sealed
version is an input, and a run without a seal records no `claude` key rather than inventing one.
Evidence: the hostile fixture the paragraph above demands — a PATH-first shadow that records its own
execution; the probe answers from the explicit path and the shadow's marker must not exist, red
under the bare-lookup form and green after — plus the silent-target refusal neighbour, and unit
cases proving `toolVersions` never invokes `claude` and never invents an unmeasured key. Gates at
the owning commit; the boundary composition's live half rides the targeted
`binary-identity.live.test.mjs` run recorded there. The measured non-interactive authentication check landed
at 0.263.0 (item 141): one `-p` call at the run boundary, under the sealed controls, before any role,
proving the capability rather than classifying the failure.

### 84. Measure and admit fail-closed child containment — OPEN; **tranches DONE (0.264.0 item 142, 0.266.0 item 144)**: the declared sandbox enforced nothing and now refuses; a working one is now *observed* confining each run; the outbound and resource inventory is measured and the guarantee stated at its real narrowness

**The capability this paragraph once named as missing was installed on 20 August 2026, and the
paragraph moves with the measurement.** It said bubblewrap and socat were absent and needed root;
they are installed, and the measured result lives in `HANDOFF.md`: `filesystem.denyRead` and
`network.deniedDomains` enforce, `network.allowedDomains` is **not** a boundary, and
`failIfUnavailable` proves the dependencies *exist* rather than that the sandbox *started* — on this
kernel `unshare(CLONE_NEWUSER)` can fail and a child reported disabling the sandbox to get its
result. So the run *observes* confinement per run instead of trusting the declaration (item 144).
What still cannot be claimed is that a working sandbox confines anything on a host whose kernel
refuses to start one. The tranche that did not need the tools is done (item 142): the product no
longer reports a sandbox it does not have.

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

**Done when:** pinned live evidence distinguishes settings registration from actual filesystem
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

### 85. Keep candidate instructions out of reviewer authority — IMPLEMENTED (0.206.0, supply identity 0.252.0, isolation canary landed and run 20 Aug 2026 at 542e29e): REVIEW F29 owns closure

**Supply identity landed, 0.252.0.** This item's Done-when asks that *"item 77's supply report names
the trust class and identity of each source"*. The trust class was already there. The **identity** was
not: the manifest recorded a class, a trust, a digest and a byte count, so two `template` inputs with
different digests were two anonymous blobs and a reader could not say which document had bound a
verdict. A digest answers *did this change*; nothing maps it back to a source without already holding
the bytes.

`classify(class, identity, text)` now requires one, and refuses `undefined`, empty and blank rather
than defaulting — an identity of `"unknown"` would be the manifest asserting what it does not know, in
the artifact whose entire job is to say what bound a verdict. Eleven driver supply sites name what
they actually pass: the shipped template at the plugin version, the specification file at its
revision digest, a brief at its own digest.

**The module's rule is satisfied by passing the class string twice**, which restores the exact
ambiguity this closes — and that mutation left the whole unit suite green. So a **positional rule over
the driver's source** additionally refuses an identity equal to, or no longer than, its class. Its
first version sliced each entry to the next `}` and cut identities off mid-interpolation, because
`${pluginVersion()}` contains one, reporting a real identity as absent; it scans by line now.

**Validation:** lint and typecheck clean, `npm test` **3366 of 3366** and
`npm run test:integration` **295 of 295**, both exit 0 and both unpiped. Five red proofs: an
unidentified input accepted, identity validated then dropped, identity collapsed to the class at the
module, one driver identity collapsed to its class, and one driver entry dropping identity entirely.

**The pinned hostile/benign canary landed (tests only, no version bump) —
`test/live/reviewer-isolation.live.test.mjs`.** A candidate tree tries to instruct its own reviewer
from five surfaces: `CLAUDE.md`, `.claude/rules/`, a Skill, `.claude/settings.json`, and a benign
house-style rule. Four carry a distinct sentinel demanding a reply that is *exactly* that sentinel;
the fifth asks only that every reply end with a fixed line. A real `review` child under the
production role policy obeys none of them, and returns the `widget-count: 417` that exists only
inside the seeded files — the benign half, which is the assertion that fails if isolation were ever
achieved by making the reviewer blind.

**Two drafts of this case were wrong in the same way, and it is the lesson worth keeping.** Both
asserted a sentinel appeared **nowhere** in the reply, and the real child failed them by behaving
*correctly*: it named the planted directive and said it was disregarding it as prompt injection —
which is exactly what `reviewer-system.md` asks for, since a file trying to direct the audit is "a
finding, not a rule". An assertion that punishes reporting is an assertion against the design.
Compliance is now a **shape** — the whole reply being the sentinel, or the last line being the house
token — so a reviewer stays free to quote what it refuses.

**The attribution failed, and that is recorded rather than glossed.** The house-style rule was added
specifically to separate the mechanism from the model's judgment: a benign style instruction is not
something a model refuses on safety grounds, so obeying it would measure *loading*. A `builder`,
which runs without `--safe-mode`, ended its reply with the token; the cold reviewer did not. But
**removing `--safe-mode` from cold phases and re-running the canary still passed** — the reviewer
declined the rule without the flag too. The two roles differ in tool policy, prompt and framing as
well, and one sample each cannot separate them.

So this canary establishes what item 85 says it establishes and no more: these seeded cases are not
obeyed, and the tree stays readable as evidence. **It is a behaviour check, not a guard on the flag**,
and its green tick is not evidence that `--safe-mode` is doing work. A mechanism check that fails when
the flag is dropped remains unbuilt; item 85's Done-when does not ask for one, and inventing the
claim would be the failure this repository keeps finding in itself.

**Validation:** lint, typecheck, `npm test` **3451 of 3451**, and the canary green live. The
`--safe-mode` removal above was run as its red proof and is reported as the negative result it was.

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
pinned hostile/benign canary proves project/user/local customizations stay unloaded while the
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
and the pinned hostile/benign reviewer-calibration canary has not been run. A scan is a
known-pattern defense, and nothing here claims immunity to arbitrary prompt injection.

### 86. Verified red-team assessment job type — **IN SCOPE; PARKED until admission prerequisites close; initial support POSIX-only**

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

**Admission amended by the operator, 19 Aug 2026 — Windows is a safety-validation prerequisite, not
a functional one, and it no longer blocks the item.** The distinction is exact and it was being
missed: nothing about a red-team assessment needs Win32. What needed it was the *proof* that a Red
job's descendants are gone, because Red is authorized to launch attack harnesses, shells,
applications and deliberately resistant children, and this item's own Done-when requires every
termination path to leave no orphan. Meeseeks currently kills the shell wrapper on Windows and
cannot show its children and grandchildren died with it (item **65**, REVIEW F11), and WSL cannot
stand in for that evidence — it runs POSIX process semantics, not Win32 process trees.

Blocking the whole feature on a host nobody has is disproportionate to that. Red is therefore
**POSIX-only at first**, and the platform limitation is a mechanism rather than a sentence in a
document:

- Red **refuses to launch on `win32`**, fail-closed, naming the platform and this item's reason. An
  unsupported platform that merely warns is the shape §4 refuses everywhere else.
- On Linux and macOS it proceeds once its remaining prerequisites are met — the Windows row is
  removed from the admission list, not waived for every platform.
- Windows enablement waits for item **65** to produce real Win32 evidence, and enabling it is a
  separate slice with its own acceptance.

**Added to Done-when:** a fixture proves the `win32` refusal fires and names the platform, and a
POSIX neighbour proves the same code path launches — the deny-path rule this repository holds for
`guard.mjs`, where blocking everything is not passing.

**In scope but not yet eligible.** This amendment removes the Windows blocker; it does not satisfy
the admission list below. Item 84 in particular is the right order: an agent is not handed an attack
budget before its blast radius has been measured.

**Admission (amended):** F2, item **40**, item **56**, items **66**, **68**, **76**, **77**, **82**,
**83**, **85**, and a recorded item **84** containment outcome must exist first. Item **65**/F11 is no
longer among them; it gates Windows *enablement* rather than the item. The permitted effect and network profile must fail closed, survive
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
malformed finding evidence all terminate fail-closed without orphan descendants **on the platforms
Red supports**; a fixture proves the `win32` refusal fires and names the platform, and a POSIX
neighbour proves the same path launches — blocking everything is not passing; the final report
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
tier-3 guard canary has been run, because this crosses `spawnClaude` and the external CLI
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

**F43's crash-seam evidence landed** (`test/integration/run-lock.integration.test.mjs`). The repair
was already in — a complete private record hard-linked to the canonical name without replacement —
and the finding's remaining objection was that *"the required real-process case that kills one
contender after staging and the paused-live-creator neighbour are still absent."*

**What a test can and cannot reproduce, decided rather than fudged.** Killing a real process
precisely between two adjacent syscalls is not something a test can time, and an env-var pause hook
would be production code existing only for a test. What *can* be reproduced faithfully is **the state
a crash leaves** — a staging file and no canonical lock — which is exactly what every later contender
sees. That is the reproduction, and the comment says which of the two it is.

Two cases. A crashed contender's staging litter plus six real racing processes, three rounds, gives
**exactly one winner and needs no manual deletion** — the whole point of the repair, since the old
single `writeFileSync(…, 'wx')` left a zero-length *canonical* file that every later contender
refused forever. A staging file whose creator is **alive** does not block either, and is left
untouched: it is named for that contender's own token, and a repair that tidied somebody else's
litter would delete a live creator's record mid-publication.

`npm test` 3363 of 3363 and `npm run test:integration` **295 of 295**, both exit 0 and both run
unpiped.

**A third case was written and then deleted, which is the useful part.** It asserted that a held lock
still refuses, on the reasoning that the other two would otherwise be satisfied by a lock admitting
everybody. They are not — both assert **exactly one** winner out of six and four, and a lock admitting
everybody yields six and four. The draft was also wrong: it raced a single contender, which *exits*
on success, so its lock is a dead owner's and the stale-recovery path correctly hands the repository
on. That property already had a home in `leaves a live owner untouched when a real second process is
refused`, with a holder still running. A redundant case encoding a wrong assumption is worse than none.

**Red proof, and it took three attempts to make an honest one.** Restoring the pre-repair
publication fails an *existing* case rather than either new one — correctly, since litter does not
block that path either. Two mutations that silently failed to apply reported green and were caught
by verifying the file changed before running. The mutation that works is the naive reading F43 is
actually about: a contender that treats another's staging litter as *somebody is mid-publication,
back off*. It fails **exactly the two new cases and nothing else**.

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

**F41's external-process contract is now proven, 0.250.0** (`test/integration/plugin-deadline.integration.test.mjs`).
The finding's remaining objection was exact: *"mechanism wiring does not substitute for the
external-process contract this finding exists to test"* — the unit tests drove immediate injected
runners, so they proved the branch shape and never that a `timedOut` arrives at all.

Tier 2 now sends provisioning through the **real bounded `shell`** the driver injects, pointed at a
script that detaches a sleeper and then hangs. Two things are substituted and neither is the
mechanism: *which command* runs, because the registry's commands are real tools a test must not
invoke, and the *ceiling value*, because a sixty-second test is one nobody runs — and the ceiling
**handed over** is asserted to be the production constant, so the propagation half stays real. Five
cases: a required detector killed inside ceiling-plus-grace with its descendant gone; the timeout
reported as a timeout and never as an absent tool; an optional plugin warning and proceeding only
after cleanup; the ordinary present/failing neighbours keeping their semantics; and the install step
receiving its own longer ceiling.

**And a real latent defect, found while writing it.** `defaultRunner` mapped a fired deadline into
an ordinary `{ ok: false }` with no `timedOut`, which made `installQualityPlugins`' timeout branch
**unreachable through it** — a sixty-second hang read as "the tool is not installed" and escalated
into a ten-minute install attempt. Production injects the Driver's bounded `shell` and was never
affected; an exported contract that is wrong for the one caller who does not override it is a defect
waiting for its second caller. Measured on this platform rather than recalled: `code` is
`ETIMEDOUT`, `signal` is `SIGTERM`, `status` is `null`.

**Validation:** lint and typecheck clean, `npm test` 3337 of 3337, `npm run test:integration` **286 of
286** with the five new cases included, up from 281. Six red proofs — a timed-out
detection read as absent, a required timeout made non-fatal, the detect ceiling not propagated, the
install given the detect ceiling, the deadline reported as an ordinary failure, and every failure
claiming to have timed out.

**The lifecycle half landed too** (`test/integration/provisioning-lifecycle.integration.test.mjs`),
and it discharges the same clause for **F44**, whose current verification says in as many words that
*"the required full-Driver fixture has not yet shown that a timed-out pre-loop Git helper produces
the durable terminal receipt and releases the run lock."*

The mechanisms were proven separately — `plugin-deadline` shows the ceiling fires and the descendants
die, `git-deadline` shows the same for a resistant clean filter — and neither could show what happens
**afterwards**, because both call a helper directly while the receipt and the lock belong to `main`.
A run that bounds its hang and then exits with no receipt, still holding the repository, has turned
an infinite hang into a silent one.

So the fixture drives the real `main` over a real repository carrying F44's verified reproduction — a
repository-local clean filter of `sleep 600`, which a Builder can install itself — and asks three
things of the aftermath: a non-zero exit, a durable `outcome.json` with a stated reason, and no lock.
Two neighbours make those mean something: an ordinary run leaves a receipt and no lock too, so the
first case is about the hang rather than about `main` refusing everything; and a **second run starts
afterwards**, which is the only check that actually catches a lock left behind, because a stale lock
is invisible until the next run, hours later and unattended.

Proved red by removing the terminal writer (2 failures) and by removing the lock release (all 3). `npm run test:integration` **289 of 289**, up from 286.

**One fixture defect, found immediately.** The first version left the repository unconfigured, so
every run refused in 25ms with *"config.json does not exist"* and wrote no receipt — passing nothing
and proving nothing about a hang. Scaffolding one iteration and no quality plugins makes the Git
helper the only long thing in the run.

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

**Admitted 20 August 2026 at 0.262.0, on the evidence and nothing else (item 140).** The tier passed
**39 of 39** uncontended against the 0.261.0 candidate and `VERIFIED_THROUGH` moved to 2.1.235 in one
commit with that result. The two-day refusal is the part worth keeping: for those two days the
operator's own host had auto-updated to 2.1.235 and `/meeseeks` refused to start on it, and the
answer was to produce the missing run rather than to lower the bar. A ceiling that yields to
inconvenience is not a ceiling.

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
(reproducible or evidence-blocked, each needing either a live canary — withheld this session by
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

**At this historical checkpoint, the live canary was built and deliberately not run.** The operator
explicitly withheld live runs for that session. It skipped cleanly unarmed. One
`MEESEEKS_LIVE=1` run was still needed to close F25's remaining clause and give F27, F28 and F29
somewhere to attach; later item headings own the resulting status.

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
  entirely static, so the closure is real. The live canary is for *skill surface*, not for this.

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
nonzero exit with the nesting refusal, **no live child recorded**, no launch receipt, no lock in the
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

**Two of F29's three remaining requirements; the third needs a live run and is named as not done.** Item 85
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

**Not done, and it is not implementable here:** F29's third requirement is a pinned live canary
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

### 126. Per-gate identity and report attribution in the receipt — IMPLEMENTED (0.224.0); REVIEW F22 open pending Codex

**What the receipt still cannot support.** A gate record carries `name`, `ok`, `status` and
`detailDigest`. It does not say which command produced it, on which attempt, with which tool version,
or which report digest belongs to which gate and path — so the clean-clone reconstruction F22 asks
for cannot be performed from one receipt, and a report-digest list emptied after the write is
undetectable to a standalone reader because nothing else in the file references those digests.

**Landed at 0.224.0.** The toolchain declares `reportOwners` — which operation writes each report it
names — because the driver binds a report digest to a gate result through it and a filename
convention that happens to hold for node is not a contract. `gateTree` returns a `GateIdentity` per
result: the argv it ran and the reports it is declared to write. The receipt's gate record gains
`commandDigest` (digested for the reason the detail is — it is target-influenced text; `null` says
*this gate runs no process*, and an absent field means nobody recorded one and is refused), `attempt`,
and `reports`. `results.reports` must equal the union of the per-gate lists, so no digest floats free
of the gate that produced it — which turns 0.223.0's stated limit into a capability: **an emptied
report list is now detectable by a standalone reader**, because the gate results still own those
digests. The schema is version 2 and the claim `meeseeks.acceptance/v2`; a v1 receipt is refused by
the version check that already existed.

**Evidence.** Two toolchain cases per toolchain — every declared report has an owner, and every owner
is an operation that toolchain actually has — plus the exact node and dotnet mappings. Four receipt
cases: an emptied flat list, a digest removed from the gate that owned it, a removed command identity
beside a legal `null` one, and a removed attempt. At the loop, the shipped receipt's gate records
carry a command digest and an attempt, the flat list equals the union, and the gate that wrote the
report owns its digest.

**Still not done, and it is the last clause of F22:** the clean-clone traversal — an auditor starting
from one `SHIPPED` receipt and resolving every required edge to a matching exact-tree artifact. The
edges now exist in the record; walking them is a separate harness. Per-gate *tool version* remains
deliberately unrecorded rather than invented: it is a measurement question, and the resolved
toolchain identity is what the receipt states instead.

### 127. Current-range code-review corrections — IMPLEMENTED (0.226.0)

**Origin:** Codex review of `origin/main..HEAD` through 0.225.0, 19 Aug 2026. Four defects were
reproduced against the real functions or Git behavior before repair.

- A depth-two ticket could be redeemed with `MEESEEKS_RUN_DEPTH=0`, after which the same Driver read
  that forged marker again and issued a depth-one child ticket. `assertNotNested` now returns the
  redeemed depth, `runInvocation` normalizes the marker to it, and `authorizedNestingEnv` accepts only
  that trusted number. The failure and the depths-one-and-two neighbour are both asserted.
- Reusing a candidate ignored the result of `git clean -fd`, and one force flag deliberately leaves
  an untracked nested repository behind. The function now runs `git clean -ffd`, refuses a failed
  cleanup, and proves with real Git that ordinary untracked files, nested repositories and ignored
  caches receive their intended treatment.
- The acceptance model observation accepted both tagged-union branches at once and preserved extra
  fields, while `acceptanceGates` converted a missing status into zero. A model observation now has
  exactly one valid key, every stated report entry must be an identity, and an absent/non-integer
  status remains absent so receipt completeness rejects it rather than recording success.
- Denial dampening exported its path before validating directory ancestors; item 52 records the
  activation hardening and its symlink reproduction.
- Preserving an unarchived outcome used `rename`, which replaces an existing destination on POSIX;
  a repeated timestamp-derived name could therefore destroy an earlier preserved receipt. The move
  now uses an exclusive same-directory hard link followed by unlink, and a collision leaves both the
  canonical previous receipt and the earlier preserved file untouched.

**Boundaries found, not relabelled as fixed.** The materialized candidate is still writable by a
same-user background process that discovers its external path, so F14 needs measured process or
filesystem isolation. Tickets still depend on the run marker being present and on lexical guard
inspection catching the launch/state write, so F42 needs an authority boundary arbitrary same-user
code cannot bypass. `DESIGN.md`, `candidate.mjs`, and `nesting.mjs` now state those limits instead of
claiming path separation or a hook parser provides OS isolation.

**Evidence:** focused type checking and lint passed; the expanded focused run passed 1,159 unit tests
and 47 real-process/Git integration tests. `npm run slice-check -- verify --no-integration` passed
lint, type checking, the complete unit tier, release checks and the stable 70-file shipped-byte
fingerprint. `npm run test:integration` passed 242 of 242 in 508.5 seconds. No live test was
needed: the changed contracts are local Git/filesystem/receipt behavior and do not depend on a Claude
CLI response.

### 128. The e2e gate declared a report nothing told it to write — IMPLEMENTED (0.227.0)

**Origin:** Phase 1, 19 Aug 2026. Found by an adversarial reviewer of the completeness evaluation
and confirmed by hand before any repair. It appears in no ledger, no `REVIEW.md` finding and no
prior item.

**The defect.** `nodeToolchain.reports` and `reportOwners` both declared that the `e2e` operation
writes `e2e-report.json`, and the operation was `command(['npx', 'playwright', 'test'])`. Playwright's
json reporter writes to **stdout** unless `PLAYWRIGHT_JSON_OUTPUT_NAME` names a file, and that
variable appeared nowhere in `scripts/`, `templates/`, `hooks/` or `test/`. The declared report was
therefore never produced, and **no Playwright id could ever enter the ratchet.**

It survived 226 versions because every signal was silent. The gate exits zero. An absent report whose
owning gate did not produce it reads as *unmeasured*, not regressed — item 95, correct behaviour,
which here masked the fact that the ids never banked in the first place. The comment at the
`reportOwners` site asserted the belief directly (`e2e` writes playwright's own reporter output) and
nothing tested it, because a unit test of an argv cannot see what another binary does with it.

Meanwhile `templates/builder-system.md` and `templates/frontend-direction.md` both promise the
builder that a named Playwright test enters the monotonic ratchet, and
`templates/toolchain-node.md` warns at length about the *unit* reporter while saying nothing about
this one. The accessibility guarantee the frontend direction sells was unenforced.

**The repair.** The toolchain vocabulary gained an operation environment, because there is no CLI
flag for playwright's json output path:

- `command(argv, env)` validates the environment and fails closed on anything that is not non-empty
  names mapped to non-empty strings, and refuses an empty object outright so that "needs no
  environment" and "computed an environment and it came out empty" stay distinguishable.
- `gatesFor` carries `env` onto the gate only when the operation declared one.
- `runGates` merges it **over** `process.env` rather than replacing it. A gate variable says where to
  write a report; it is not a sandbox, and a child without PATH cannot find the binary it was told to
  run.
- The `Runner` contract now names `env`. The real `shell` already honoured it — this was the one
  link where a runner could silently drop what a gate needed.
- `e2e` became `npx playwright test --reporter=json` with `PLAYWRIGHT_JSON_OUTPUT_NAME` pointing at
  `<meeseeksDir>/e2e-report.json`.

**Acceptance evidence.** Red first at tier 1 (two assertions, against the real `nodeToolchain` and
`gatesFor`), and red again at tier 2 at **two separate links**: with `runGates` dropping the gate
env, and with `e2e` reverted to the bare command. Both restored green.
`test/integration/e2e-report.integration.test.mjs` runs the real `commandGates`, `runGates` and
`shell` against a counterfeit `npx` that writes only when the variable is set, and asserts the
landed file is **byte-identical** to the committed Playwright 1.62.1 capture. A first draft of that
test invented a plausible report; `parseReport` rejected it as matching no known reporter, which is
the fixtures-over-mocks rule earning its place again.

**What is deliberately not claimed.** That Playwright honours `PLAYWRIGHT_JSON_OUTPUT_NAME` is a
contract owned by another binary. Playwright is not a dependency of this repository, so per §11.1's
rule from the argv defect it is **owed one installed check**, not more assertions — recorded here as
the residual, and the cheapest place to discharge it is the next live web-ui run.

**Gates:** lint clean, typecheck clean, tier 1 2924/2924, tier 2 244/244, release-check ok,
`git diff --check` clean.

## Observations recorded rather than repaired

- **`slice-check commit` can commit and then refuse to bless what it committed** (21 Aug 2026,
  twice in one session). Its post-commit re-verification checks *every* shipped file against the
  fingerprints, so a commit staged with `--paths` while an unrelated shipped file sits dirty prints
  `REFUSED` *after* the commit object exists — the output reads like a rollback and is not one. Both
  occurrences left a correct, gate-verified commit standing (`a8d608e`; and the first F28 attempt's
  refusal correctly blocked an actual mixed tree before staging). Recorded rather than repaired
  because the refusal is doing its job — the surprise is only that "REFUSED" can follow a commit
  that stands. If it recurs confusingly, the repair is a distinct message for the post-commit case,
  not a weaker check.

- **The boxed wall clock binds only at boundaries it can reach** (run 9, 21 Aug 2026). A
  one-component boxed run gives the parent's between-components check nothing to fire on until the
  only component ends, and the child's between-iterations check let one panel-bearing iteration
  overshoot a 23-minute arm to ~35 minutes. Every word of that is in the enforcement's own comments
  ("checked between iterations, which is where it can be checked"); the correction for real
  component runs is an operator `--deadline` sized to iterations × panel time, as run 10 does at 75
  minutes. Not a repair target unless a run demonstrates unbounded overshoot past its ceilings.

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
  never leaves a live run waiting overnight. A simulated, staged, or queued external effect likewise
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
