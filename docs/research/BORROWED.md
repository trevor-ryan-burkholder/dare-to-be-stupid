# Worth stealing

A survey of adjacent projects and research, filtered to things `meeseeks` does not already do
better. Ranked by value, with honest costs. Appearance here does not mean a proposal is accepted, specified, or scheduled — this is a menu.

Sources at the bottom.

## Current disposition — read this before the chronological ledger

The headings below preserve what a research pass concluded **at that time**. Phrases such as
“take it” and “cheap and real” are historical intake verdicts, not current instructions. The
current authorities are `DESIGN.md` for accepted architecture and `PLAN.md` for scheduled work.

- **Implemented or absorbed:** the original items 1–6; R1–R7, R9–R10, R13–R21, R23–R24, R26,
  R30–R35, R39, and R40. Later text in the relevant entry records the shipped version or the
  canonical design section.
- **Still live in PLAN:** R25's remaining denial dampening is item 52; R27 is item 40; R29 is item
  42; R36/R37 are item 35; R38's component core is item 24 and its residual restart registry is
  item 36; R41/R42 are item 59; and R44 is item 77.
- **Closed, rejected, or only cautionary:** R8, R11–R12, R22, R28, and the explicitly rejected
  round controls remain evidence, not work. R43 was rechecked against the existing stalled-progress
  tracker and reality-check circuit breaker and adds taxonomy without a new decision. R46's useful
  character count and growth trajectory already ship in the context-budget path; imperative-word
  density is not a reliable acceptance metric. R47 overlaps the terminal receipt, morning-acceptance
  result, and conditional lifecycle journal without establishing another consumer.
- **Parked:** R45 becomes relevant only if one document is intentionally co-written by an operator
  and the Driver. No current artifact has that ownership shape, so an intra-document guard would be
  speculative.

Before reopening a rejected or parked item, identify changed repository conditions or new evidence.
Do not infer current priority from this file's physical order.

---

## Tier 1 — take these

### 1. Safety monotonicity: extend the ratchet to security

**From:** *SCAFFOLD-CEGIS: Preventing Latent Security Degradation in LLM-Driven Iterative
Code Refinement* (arXiv 2603.08520).

This paper describes `meeseeks`'s architecture and then describes how it fails. The finding
they call the **iterative refinement paradox**: specification drift during multi-objective
optimisation causes security to degrade *gradually across iterations*. With GPT-4o,
**43.7% of iteration chains contained more vulnerabilities than the baseline after ten
rounds.**

Two details that matter here specifically:

- **A security gate does not fix it, and measurably makes it worse.** Adding SAST gating
  raised the latent degradation rate from 12.5% (unprotected baseline) to **20.8%**. The
  stated cause: static rules cannot see *structural* degradation — removal of defensive
  logic, weakening of exception handling. `meeseeks` currently has exactly this: `npm audit`
  plus a security auditor, per iteration, with no memory.
- **Their fix is the ratchet.** They "enforce safety monotonicity through four-layer gated
  verification" and reach a 100% safety-monotonicity rate. That is the mechanism already at
  the centre of this design, pointed at a different property.

**What it means for `meeseeks`:** the ratchet is monotonic on *test ids* only. Security is
evaluated fresh each iteration and can silently erode. The fix uses machinery that already
exists: when the security auditor cites a defensive element with `file:line` — an auth
guard, an input validation, an exception handler — pin it. A later iteration that removes
it is a regression, triggering the same `git reset --hard` and regression objective as a
dropped test id.

**Cost:** moderate. Needs a second pinned set in `.meeseeks/state.json` and a way to re-check
pinned elements cheaply (grep for the guard, not a full audit). **Value:** highest on this
page. It closes the one degradation path the design currently cannot see, using the one
mechanism it already trusts.

---

### 2. Held-out oracle: tests the builder never sees — **superseded by R13; built 0.70.0–0.72.0**

**From:** AgentLoop; supported by *Building to the Test: Coding Agents Deliver What You
Check, Not What You Requested* (arXiv 2606.28430).

The framing: "a coding agent verifying its own patch still sits inside one incentive loop."
`meeseeks` already fixed the *review* half of this — the reviewer is a separate cold process.
But the **builder still writes the tests the ratchet is built from.** The ratchet is
rigorous about protecting ids; it has no opinion on whether those ids were worth having.
An agent that writes its own checks builds to its own checks.

**What it means for `meeseeks`:** a held-out suite, authored in a separate `claude -p` from the
PRD alone, never shown to the builder, run only at gate time. Regressions against it count
for the ratchet. The builder cannot satisfice against tests it has never read.

**Cost:** a new phase and a real risk of false failures when the oracle misreads the PRD —
budget for a way to quarantine a bad oracle test rather than hard-resetting on it.
**Value:** high. It is the same insight as the cold reviewer, applied one layer earlier, and
it attacks the last place the builder is still judging itself.

> **Deferred 11 August 2026 after reading the code; built 12 August at 0.70.0–0.72.0.** Two
> fixable obstacles — the builder owns the test runner's config, and the regression objective
> leaks the oracle's ids — plus a third, unsealable reads, which was first called fatal and is
> not. The run it waited on finished (run 8 `SHIPPED`), and the runner-ownership objection
> dissolved when §4.4 put the mutation threshold in driver-owned state — the same move, reused.
> See **R13** for the design that shipped, which differs from the sketch here.

---

### 3. Mutation testing as a gate

**From:** GSD Core ships `stryker.config.mjs` at repo root.

The most load-bearing claim in the DoD is "tests assert real values, not truthiness." Today
that is enforced by a reviewer *reading* the tests — an LLM judgment that costs a full
iteration when it fires. Mutation testing is the deterministic form: mutate the source,
confirm the tests fail. A tautological test survives every mutant, and that is a number.

**What it means for `meeseeks`:** moves the single most important quality property from Phase 5
judgment to a Phase 3 exit code, where it is free and unarguable.

**Cost:** slow. Wants scoping to changed files, or a config flag, or running only when the
iteration is otherwise green. **Value:** high, and it is the natural deterministic partner
to a rule the project already believes in.

---

## Tier 2 — cheap and real

### 4. Verify the prompt still fits the window

**From:** GSD Core's plan step explicitly "verifies the plan fits a fresh context window."

`meeseeks` assembles Build Brief + PRD + design docs + retrieved lessons + conditional history,
and that input **grows across iterations** with nothing checking it. This is the project's
favourite bug class: silent degradation, no failure signal, the builder just quietly worse
around iteration 12. Measure the assembled prompt before spawn; fail loud or trim by
policy. Already half-touched from the other side when prompts moved to stdin to retire
`ARG_MAX`.

**Cost:** low. **Value:** removes a silent failure mode.

### 5. A custom lint rule for assertion quality

**From:** GSD Core ships an `eslint-rules/` directory of project-specific rules.

A rule banning truthiness-only assertions enforces `CLAUDE.md`'s own standard on generated
code, deterministically and instantly. Pairs with mutation testing: lint catches the lazy
shape, mutation catches the ones that look fine but prove nothing.

**Cost:** low. **Value:** moderate, and it is the cheapest item here.

### 6. Property-based tests in the builder contract

**From:** OuroLoop GateKeeper's gate stack; *Agentic Property-Based Testing* (arXiv
2510.09907).

Generative tests are structurally harder to satisfice than example tests — an agent can
special-case three fixed inputs, but not an invariant over generated ones. Worth a line in
`templates/builder-system.md` requiring properties where the domain admits them.

**Cost:** low (a template change). **Value:** moderate, and it compounds with the oracle.

---

## Tier 3 — considered, probably already covered

- **Structured remediation instead of binary fail** (OuroLoop): failures return a diagnosis
  and a suggested correction strategy rather than a bare verdict. `meeseeks`'s objective/Build
  Brief mechanism already does this; the `no-tests` brief is exactly the pattern. Nothing to
  take.
- **Two-stage review — spec compliance, then code quality** (Superpowers, ~820k installs):
  `meeseeks`'s three-way specialised panel is a finer-grained version of the same idea. Nothing
  to take.
- **Fresh subagent per task** (Superpowers, GSD, ECC all converge here): `meeseeks` uses a fresh
  OS process per phase, which is strictly stronger isolation. Nothing to take.

---

## Explicitly reject

- **Self-improving gate thresholds** (OuroLoop, marked beta). Thresholds that adapt from
  historical performance can drift *downward*. That is a direct violation of **nothing
  defaults to pass**, and it would make the gates negotiable by the thing they constrain.
  This is the same category as letting the builder edit `state.json`.
- **Multi-runtime installers** (GSD, ECC, Superpowers all ship them). `meeseeks` is Claude Code
  only on purpose; portability is a tax on the guard hook and the envelope parser, both of
  which are version-pinned by design.
- **An interactive discussion phase** (GSD's "Discuss"). Unattended is the premise.
- **Cooperative parallel waves** (GSD). `meeseeks`'s race is competitive on the *same* task;
  waves split *different* tasks and buy merge-conflict surface. Different problem.
- **Changesets** (GSD). `release-check` is better tuned to the plugin-cache trap that
  actually cost hours here.

---

## Validation, not a change

The emerging vocabulary calls this **loop engineering**: a bounded artifact made of a
trigger, a goal, a verification step, a stopping rule, and a memory. `meeseeks` has all five —
`/meeseeks`, the PRD, gates plus the panel, the terminal states, and the ratchet plus lessons.

GSD Core's central thesis is **context rot**, quality decaying as a window fills. `meeseeks` is
immune by construction: every phase is a fresh process, not a fresh subagent.

Worth knowing mostly because it means the remaining risk is not architectural. It is in the
places listed above, where something can degrade without anything noticing.

---

# Round two — Ralph, Karpathy guidelines, ECC re-mined, impeccable re-checked

`snarktank/ralph` (20.8k stars) is the Ralph pattern this project deliberately runs on
purpose. `multica-ai/andrej-karpathy-skills` (202k stars) is a single `CLAUDE.md` distilling
Karpathy's observations on LLM coding pitfalls. ECC and impeccable were mined earlier, but
the toolchain/capability work in `BRIEF.md` changes what is worth taking from them.

## R1. Requirement-level monotonicity

**From:** Ralph's `prd.json`, where each user story carries `passes: true|false` and the loop
stops when all are true.

Ralph lets the *builder* set `passes` — which is precisely the hole this project exists to
close, so that half is validation, not a steal. But the underlying idea is sound and
currently missing: **Meeseeks re-litigates every requirement, every iteration, at full cold-panel
cost.** A requirement a cold reviewer already passed with `file:line` evidence is re-argued
from scratch on iteration 12 for no reason.

Pin it. A requirement passed by a cold reviewer becomes a **pinned requirement**, keyed to
its evidence location. Re-review only when the evidenced file changes; otherwise carry the
prior cold pass forward. This is the same mechanism as the test ratchet and the security
pinning in A4 — a third monotonic property — and it is the largest available saving on long
runs, where review is the dominant cost.

Invalidation must be conservative and fail-closed: any change to the evidenced file unpins
the requirement, ambiguity unpins it, and a missing evidence target is a fail rather than a
carried pass. Pinned requirements are driver-owned, therefore sealed under A1.

## R2. Surgical-change discipline in the builder template

**From:** Karpathy guidelines, principle 3.

The most precisely articulated version of a rule `templates/builder-system.md` already
gestures at. Worth taking close to verbatim, because in Meeseeks an unnecessary diff is not a
style problem — it is regression surface, and a regression costs a full iteration plus a
hard reset:

- every changed line must trace directly to the current objective
- do not "improve" adjacent code, comments, or formatting
- match existing style even where you would do it differently
- remove orphans *your* change created; do not remove pre-existing dead code — mention it
  instead

This also sharpens C1: a builder held to surgical diffs produces candidates the new
line-churn race metric can actually distinguish.

## R3. An assumptions log

**From:** Karpathy guidelines, principle 1 — "models make wrong assumptions on your behalf
and just run along with them without checking."

The stated remedy is *ask for clarification*, which is incompatible with an unattended loop.
The translation that does work: the builder may not silently pick an interpretation. It must
**record** each assumption to a driver-owned append-only log, which is then handed to the
reviewer.

This converts the failure mode from invisible to auditable — the reviewer can check "you
assumed X; the PRD says Y" — and it costs one template line plus one file. It also fits the
project's existing temperament: an unstated assumption defaults to pass, and nothing here is
allowed to default to pass.

## R4. PRD right-sizing

**From:** Ralph — each story must be completable in one context window, with concrete
examples of right-sized ("add a database column and migration") versus too big ("add
authentication", "build the entire dashboard").

`templates/prd-author.md` has no size constraint. An oversized requirement produces an
objective the builder cannot finish in one child, which surfaces as mysterious stalling
rather than as a legible failure. Add the constraint and the examples to the PRD author, and
pair it with C4 — one checks the input at authoring time, the other at spawn time.

## R5. Goal transformation in the PRD author

**From:** Karpathy guidelines, principle 4.

> "Add validation" → "Write tests for invalid inputs, then make them pass"
> "Fix the bug" → "Write a test that reproduces it, then make it pass"

This is RED-before-GREEN expressed as an *authoring* rule rather than a gate. Requirements
written this way arrive pre-shaped for the RED evidence mechanism; requirements written
imperatively have to be converted later, or fail the gate for reasons that look arbitrary.
Cheap: a table in `templates/prd-author.md`.

Karpathy's framing of why the whole approach works is also worth keeping in mind — "LLMs are
exceptionally good at looping until they meet specific goals; don't tell it what to do, give
it success criteria and watch it go." That is this project's thesis, arrived at
independently.

## R6. Per-toolchain builder guidance (ECC, newly relevant)

ECC's per-language rule sets and language-specific reviewers were dismissed as bloat in the
first pass. The toolchain work in `BRIEF.md` B2/B3 changes that: adapters carry *commands*,
but there is no per-toolchain *guidance* layer, and a .NET builder needs different idioms
than a Node one.

Add a small guidance fragment per toolchain, selected by detected toolchain and injected into
the Build Brief. Explicit files, no framework, no new personas. ECC's separation of
always-loaded "rules" from on-demand "skills" is the right shape to copy at small scale.

## R7. Small items

- **Per-run archiving** (Ralph archives to `archive/YYYY-MM-DD-feature/`). Meeseeks overwrites
  `.meeseeks` state per run. Archiving instead of overwriting costs almost nothing and makes the
  C2 run manifest genuinely forensic rather than only current.
- **Arm the impeccable gate from the `web-ui` capability** (B5). `DESIGN.md` §5.1 currently
  skips `gate:design-slop` via an ad-hoc frontend check; the capability model makes that a
  special case that no longer needs to exist.
- **Reconcile `PRODUCT.md` with the capability manifest.** impeccable reads `PRODUCT.md`
  (users, mode, brand voice, anti-references); B1 introduces a capability manifest. These
  overlap. Decide which owns what rather than writing both from the same phase and letting
  them drift.
- **Simplicity-first line in the builder template** (Karpathy principle 2). Bloat is
  regression surface. "If 200 lines could be 50, rewrite it."

## R8. Explicitly not taken

- **Builder-authored completion status.** Ralph's builder marks its own stories
  `passes: true`. This is the exact failure this architecture exists to prevent, and it is
  worth recording that the most-starred implementation of the pattern has the hole.
- **"Stop and ask for clarification"** (Karpathy principle 1, literal form). No operator is
  present. Superseded by R3.
- **`<promise>COMPLETE</promise>` sentinel stop token** (Ralph). Structured terminal states
  and fail-closed parsing are strictly better than grepping for a magic string.
- **Multi-harness support** (`--tool amp|claude`). Deliberately rejected; see the earlier
  round.

---

# Round three — hypothesis-search agents

Surveyed 11 August 2026, after a description of two components — a "Hypothesis Agent" and an
"LLM Ideator" — arrived from outside the project. The pattern is established and published
rather than novel: an LLM proposes what to try next, an agent runs the experiment, the result
conditions the next proposal. FunSearch and AlphaEvolve are the lineage; **QuantEvolve**
(MAP-Elites with island models and hypothesis-driven LLM mutation, evolving strategies as
executable Python) and **HypoAgents** (Bayesian-entropy scoring over a hypothesis population,
+116.3 ELO across 12 iterations) are current expressions. In quant, a writer agent generating
code against a judge agent, wrapped in a backtest outer loop, is standard alpha-factor mining.

Two mechanisms are worth taking. The architecture is not, and R11 records why so it does not
have to be argued again.

## R9. Differentiated race candidates

The race already compiles a brief per candidate and already tells each one *"Another candidate
is trying a different one"* (`brief.mjs:182–184`). Nothing makes that true — every candidate gets
the same objective and differs only by sampling. `raceCandidate` is the field that would carry a
difference and it carries `{ index, of }`.

The borrowable idea is the ideator's only real one: propose *distinct explanations* for a
failure rather than resampling the same attempt. Give each candidate its own hypothesis about
why the previous iteration stalled.

It survives this project's constraints because a hypothesis is a **prompt, not a criterion**.
Selection stays deterministic — gates, regressions, `parseNumstat`, index — and no candidate is
judged against the hypothesis it was handed. `BRIEF.md` C5.

**Cost:** low, once the race's builder half has been live-tested at all. **Value:** moderate, and
it fills a seam that is already built and empty.

## R10. Condition lessons on circumstances

The example given for the ideator — "your breakout strategy is profitable, but most losses
happen when the market is falling" — is not idea generation. It is **stratified failure
analysis**: refuse the aggregate, ask which conditions correlate with failure.

`lessons.mjs` already has the structure for that. A lesson with no `trigger` is rejected, and
`scope` narrows it further. `HANDOFF.md` records the store's usefulness as unproven and names
the failure — a store full of generalities. Whether a trigger is a *condition* or a restatement
of the lesson is exactly the difference between those two outcomes, and it is decided in
`templates/lesson-extractor.md`. `BRIEF.md` F4.

**Cost:** one template. **Value:** moderate, and it is the difference between the lesson store
working and being deleted.

## R11. Not taken — hypothesis search over the objective

Two independent reasons, either sufficient on its own.

**The target does not move.** A hypothesis loop *discovers* its objective function; that is the
whole point of one. Meeseeks's is declared in the PRD, and every invariant in the design exists to
hold it still — the cold reviewer, the guard hook, the monotonic ratchet, nothing defaults to
pass. A loop permitted to hypothesise about what it is building is R8's rejected pattern with a
research vocabulary. This is the general case of the self-improving thresholds rejected in round
one, and it fails for the same reason.

**Evaluation is the expensive half.** Hypothesis search is justified by cheap, high-volume
evaluation — a backtest is free and you run thousands overnight. Here, one cold reviewer was
measured at $0.83 and 124 seconds, gates shell out to real toolchains, and `maxIterations` is
25. The shape transfers; the economics do not. At n=25 a hypothesis loop is a slower race, and
the race already exists.

## R13. Held-out oracle, reconsidered — **deferred 11 August; built 12 August (0.70.0–0.72.0, `DESIGN.md` §4.6)**

Round one put this in tier 1. On 11 August 2026 it was read against the actual code, shelved, and
then the shelving reasoning was itself corrected. Both passes are recorded, because the second one
is a lesson about how this project argues.

**Three obstacles were found. Two are fixable, and the fixes are known.**

1. **The builder owns the runner.** The unit gate is `npx vitest run --reporter=json`
   (`toolchains/node.mjs:52`), resolving the *project's* config — which the builder writes. It
   therefore decides whether the oracle is collected at all. `integrity.mjs` catches a no-op npm
   script; it does not read an `exclude` glob, and a suite collecting zero tests is
   indistinguishable from one that passed. *Fixed by* a driver-owned test invocation.
2. **The regression path leaks it.** `driver.mjs:1130–1138` puts regressed ids verbatim into the
   log and the next Build Brief. *Fixed by* naming the PRD requirement rather than the test id.

**The third was overstated, and correcting it matters more than the item does.** "Reads cannot be
sealed" is true — the builder writes the test suite and `readFileSync` runs at runtime, where no
PreToolUse hook can see it. But reaching the content requires dumping it into a gate failure,
waiting for the next iteration's brief, and doing so in a diff a cold reviewer reads. That is
sabotage, and **sabotage is not this project's threat model.** Every defence in `DESIGN.md` — the
cold reviewer, RED evidence, the ratchet, `integrity.mjs` — is aimed at a model taking the cheapest
path to green. Against satisficing, an oracle the builder was never handed is sufficient.

The general lesson, worth more than the specific one: *an adversarial standard applied to a
non-adversarial threat model will reject a sound design.* It arrives dressed as rigour. Check
which threat is being defended before calling something impossible.

**The version that would survive**, so it does not have to be re-derived:

- the oracle suite lives **outside the repository**, in driver-owned temporary space
- copied in at gate time — a moment when **no builder child exists**, since children run to
  completion before gates run — executed through a driver-owned invocation with its own config,
  and removed afterwards
- an oracle regression names the **PRD requirement** it covers, never the test id
- the seal is described honestly wherever it is claimed: it stops building-to-the-test, not
  exfiltration

**Why it still waits.** The loop has never completed a run. `HANDOFF.md` records both real attempts
dying in iteration 1 with `passing: 0`, so the ratchet was never reached and the panel never ran. A
seventh phase added to a pipeline that has not once finished is a guess stacked on a guess. It sits
behind `BRIEF.md` D2 and behind B2's new operation.

What round one got right and still has: the builder authoring the tests the ratchet is built from
is a real hole, and it is the last place the builder judges itself. Mutation testing (item 3) and
RED evidence narrow it. Neither closes it.

**Outcome, 13 August 2026 — built, and the shipped design is not the sketch above.** What landed
at 0.70.0–0.72.0 (`DESIGN.md` §4.6, `scripts/oracle.mjs`): deterministic **argv-and-stdout
cases**, not a test suite — no runner config for the builder to own, which with §4.4's
driver-owned-threshold move is what dissolved obstacle 1. Cases live under `.meeseeks/` (driver-owned
by §6's positional rule) and are **not supplied** rather than sealed — §6.1's distinction, stated
in `oracle.mjs`'s own header. Authored in Phase 0b from the PRD alone, before design, under a
dedicated `oracle-author` phase whose `allowedTools` is the empty set; authoring failure **ends
the run**. Config-gated off by default; armed by the capability table for `cli` only. Run 12 —
shipping `mean: 0` past a 110,877-case differential fuzz whose reference came from the same
spec — is the measurement that turned this from deferred to built.

## R12. Noted — the overfitting symmetry

Recorded because it runs the other direction, and is the most interesting thing in this round.

An ideator looping over backtest results optimises against the same history it learns from, with
a model that is good at finding narratives for noise — the multiple-comparisons problem with
better prose. The defense is a holdout the proposer never sees.

That is structurally what the held-out oracle was reaching for — a check the proposer never sees.
The pattern that does not transfer *into* this project has independently arrived at the same
answer, from a domain where getting it wrong is measured in money rather than in iterations.

Worth keeping beside R13: the idea is sound and it is the *implementation* that fails here. If
the constraints in R13 ever change, this is the reason to look again.

---

# Round four — a Stanford multi-agent study, 12 August 2026

Arrived via a video claiming Stanford had "proved" that a hierarchical multi-agent system with a
coordinator is wrong, and that the fix is asynchronous agents reading and writing a shared
verified context. **The video inverted the paper.** What the study reports is that *"when a single
agent and a team get the same amount of compute, the solo agent performs at least as well"* — an
argument that multi-agent teams are usually **not worth the compute**, used to sell more agents in
a different topology. It says nothing about hierarchy, coordinators, or shared memory.

Recorded here anyway, because two of its actual findings are worth taking, and because the
misreading is itself instructive: **a real result wearing a conclusion it did not reach.**

Read via a secondary summary, not the paper. No title or authors were given. Scope caveat from the
article: *text-based reasoning tasks only, no tool use* — which is outside this loop's regime,
where every child writes files and runs suites.

## R14. The panel versus one reviewer at equal compute — **take it, as an experiment**

The study's central claim aimed at §1.1: this loop runs **three** reviewers. Would **one reviewer
owning all sixteen ids at `max` effort** do as well?

Uncomfortable, and testable with config alone — `reviewers`, `ownership` and `effort` are all
config, so it is the run 6 vs run 7 method with one variable moved. **The study's own exceptions
cut toward the panel** (*teams performed better with weaker base models*; *single agents sometimes
think too narrowly, while teams cast a wider net*), but this panel runs on Opus at `max`, which is
precisely the regime where the paper says teams help least.

Evidence already in hand, pointing both ways: run 12's correctness reviewer alone wrote an
independent reference implementation and fuzzed 110,877 cases; and run 10's *design* auditor was
the one that found the inert `bin`. A single reviewer might have done the first and missed the
second. **Measure it. Do not assume the panel is earning its cost.**

## R15. A finding phrased as an input gets answered as an input — **take it, and it has a fix**

The study's stated mechanism is that *"each handoff risks losing relevant information."* This loop
has one handoff it cannot remove: **panel finding → Build Brief → builder.**

Run 13 is that loss, measured. The panel found the mean defect and phrased it as an input —
`1e308, 1e308` yields `Infinity`. The builder fixed **exactly that input**, switching `sum += n`
to `mean += n / count`, which passes the protected test, removes the overflow, and returns `0.5`
where the true mean is `1/3`. The finding was about *the arithmetic mean*; what survived the
handoff was *a failing example*.

**The fix is one paragraph in `templates/reviewer-system.md`:** a finding must state **the property
violated**, with the input as evidence *for* it rather than as the finding itself.

- Survives the handoff: *"`mean` is not the arithmetic mean under catastrophic cancellation;
  demonstrated by `1e16, 1, -1e16` → `0.5`."*
- Does not: *"`1e308, 1e308` gives Infinity."*

Observed in two consecutive runs before the mechanism had a name.

## Explicitly rejected from round four

- **Removing the coordinator.** The bottleneck the video describes is real and comes from a
  coordinator that is a *model*, not from one existing. This driver is a program: it reads exit
  codes and parsed JSON, never a child's reasoning, and has no context window to saturate.
  Deleting it deletes the arbiter that owns monotonicity, the guard, and the ratchet.
- **Asynchronous agents writing shared state.** The paper's own mechanism condemns it — that is
  *more* handoffs — and a shared writable store with no single owner is §6's defect at scale: a
  process that can write the evidence it is judged by is not being judged.
- **"A shared verified context."** Not rejected, already built: `.meeseeks/` is that store, and §8.1
  states the principle outright — *"The repository and the driver's own artifacts are the memory.
  A child's conversation is disposable."* The blackboard is not an alternative to the coordinator
  here; the coordinator is what makes it trustworthy.

# Round five — mined against the dogfood defects, 12 August 2026

Different method this round: instead of surveying what is out there, each search started from a
**measured defect in this repository's own runs** and asked what closes it. Four items, each keyed
to the run that earned it.

## R16. Per-child budget flags — **take it first; it closes case D's defect with one flag**

Case D's record: the token ceiling could not stop a running child, and one builder spent **10× the
ceiling** before returning — the driver charges spend only when a child comes back, so the
overshoot bound is "one child", and run 6 priced a single child at 14M tokens. The bound is only as
good as the largest child, and nothing bounds the child.

`claude -p` accepts `--max-budget-usd` (stop at an approximate dollar spend) and `--max-turns`
(cap agentic turns). The driver can derive a per-child allowance from the remaining ceiling at
spawn time and pass both flags in `claudeArgs`. The envelope's reported `total_cost_usd` stays
authoritative for accounting; the flags are the in-flight bound the accounting cannot be.

Costs, stated: the budget stop is approximate, and a child stopped mid-write returns not-ok —
which the loop already treats as a builder failure, the correct path. **This touches
`claudeArgs`, so by `CLAUDE.md`'s own rule it requires tier 3 before it can be believed** —
the flag's actual stop behaviour is another binary's contract.

## R17. Metamorphic relations in the oracle — **take it; it is the answer to run 12's defect class**

Run 12's defect was `mean: 0` where the truth is `1/3` — a floating-point accumulation property
the PRD never states, invisible to any check derived from the PRD, which is why 110,877
differential cases missed it: the reference was built from the same documents. R15 fixed how such
a finding is *phrased*; nothing yet *generates* one.

Metamorphic testing is the established answer to exactly this oracle problem: instead of asserting
an output value, assert a **relation between runs** — permute the input and the mean must not
change; scale every element by k and the mean scales by k; duplicate the dataset and the mean is
fixed. No reference implementation exists, so there is no "same assumption twice." A relation like
permutation invariance catches run 12's defect *without anyone having thought of associativity*.

The harness barely changes: an `OracleCase` today is argv plus expected output; a **relation case**
is two argv-plus-transform pairs and a comparison, still deterministic, still exit-code-and-stdout,
still sealed under `.meeseeks/`. One schema extension in `oracle.mjs`, one section in
`templates/oracle-author.md` teaching the five standard relation shapes (permute, scale, duplicate,
subset, identity-merge). The literature is deep if wanted — Chen et al.'s survey is canonical and
there is active work applying MT to generated code specifically — but the mechanism needs none of
it to be built.

## R18. An API-shaped oracle from the contract docs — **take the shape, gate the tool**

`gate-policy.mjs` arms the oracle for `cli` only, on the honest reasoning that argv-and-stdout is
a CLI harness. But the `docs` gate **already requires an API contract document for `api`
projects** — the artifact an API-shaped oracle would need is already mandatory, just not
machine-consumed.

The move: Phase 1 emits the contract as OpenAPI (it already emits `api-contract.md`; make the
machine-readable half required for `api` capabilities), and a schema-driven property fuzzer runs
against the live app at gate time — generated inputs, response-schema conformance, negative-case
validation. Schemathesis is the mature tool for this; it is Python, which is exactly what the
quality-plugin registry exists for — `knip` and `semgrep` already established the pattern of an
optional gate that degrades to a warning when the tool cannot be provisioned. Slot it there, not
in core.

This extends the held-out principle to the shape the oracle currently cannot judge: the contract
is authored at design time from the PRD, before any code exists — the same independence the CLI
oracle gets from Phase 0b.

## R19. Native sandbox under the guard — **take it as a second layer; trust it as nothing more**

The guard hook sees tool calls. It cannot see what code the builder *wrote* does at runtime —
recorded as the A2 limitation, accepted because the threat model is satisficing. Claude Code now
ships OS-level sandboxing (seatbelt on macOS, bubblewrap on Linux/WSL2) that bounds the process
at the kernel, which is the layer the hook cannot reach.

Worth adding under the builder for defense in depth, with the failure modes recorded **before**
adoption, because they are instructive:

- a documented bypass rewrote paths through `/proc/self/root` to dodge a denylist — enumerated
  denylists lose at the kernel too;
- a CVE let sandboxed code write `.claude/settings.json` and inject **hooks** that run with host
  privileges on restart — the guard's own delivery mechanism is what the escape targeted;
- on a kernel where bubblewrap failed, the agent **asked to rerun unsandboxed** — a fallback the
  driver must refuse on the builder's behalf, because a sandbox that can be declined by the thing
  it contains is not a sandbox.

Adopt with the same posture as the guard itself: an added floor, never a replaced one, and its
*registration* needs a live test for the same reason the guard's did — eleven versions of green
unit tests once proved nothing about whether the hook was loaded.

## Round five, explicitly not taken

- **Test-impact analysis** (run only affected tests per iteration). Faster iterations, but the
  ratchet's evidence would shrink to whatever the selector chose — a regression outside the
  selected set becomes invisible until later, which is a monotonicity hole wearing a speedup.
- **Spectrum-based fault localization** for regression objectives. Deterministic and appealing,
  but it needs per-test coverage collection every iteration to be ready for the rare reset, and
  the regression objective already names the failing ids — the builder's problem has not been
  *finding* the fault, it has been staying inside the fix (R15).

# Round six — `/batch`, and what the harness underneath has grown, 13 August 2026

Prompted by the operator hearing of a new `/batch` command. Surveyed that, plus what Claude Code
has shipped since the verified pin (2.1.226), against the repository's own open list — the
sequential panel, the missing heartbeat, the orphaned grandchild, and the run-level wall clock.

Status of round five first, so this round does not repeat it: **R16 and R17 remain unadopted at
0.88.0.** `costCeiling` landed, but it is a *run-level* ceiling read from envelopes — the
complement of R16, not the substitute. A child in flight is still bounded only by
`childTimeoutMs`; the per-child `--max-budget-usd` bound is still on the table. No metamorphic
relations in the oracle yet.

## R20. `/batch` and `/simplify` — **nothing to take for the loop; one hazard worth knowing**

`/batch` (Claude Code 2.1.63) fans one session out into parallel subagent workers over
independent tasks and aggregates the results; each worker auto-runs `/simplify` on its own
changes before committing.

Neither half fits this loop, for reasons the design already owns:

- **The workers are same-session subagents.** The reviewer invariant is explicit — a separate
  `claude -p` process, "never 'optimize' this into a subagent" — and the builder already *is* a
  whole process with full agency; parallelism between builders exists and is called the race.
  `/batch` is a topology this project deliberately does not use, arriving as a convenience.
- **`/simplify` is the anti-F1.** It exists to improve adjacent code for clarity — the precise
  diff chaos-1 forbids, because here an unrequested improvement is regression surface and a
  regression costs a hard reset. A builder that reached for `/batch` would ship every change
  pre-widened by a tool whose job is widening.

The hazard note: builders inherit the operator's Claude Code, so the command *exists* in their
runtime. Nothing today makes a print-mode builder invoke slash commands spontaneously, and no
countermeasure is warranted — but if a future run's diffs arrive mysteriously "tidied," this is
the first suspect, and this paragraph is here so that suspicion takes minutes rather than a run.

## R21. The async conversion now pays three times — **take it; the ledger has repriced it**

`HANDOFF.md` declined making the driver async when it bought only a heartbeat: *"a rewrite, not a
fix."* Since then the file has, in separate entries, recorded three open items that are all the
same synchronous-driver fact wearing different symptoms:

1. **No heartbeat.** `execFileSync` blocks the event loop, so *hung* and *working* are one
   picture for however long a child runs — named by the operator as the top blocker, patched with
   per-child ceilings, still true between ceiling and return.
2. **The panel is three whole-repository reads run one after another.** A named open. Three cold
   children with no shared state are embarrassingly parallel; the driver's synchronousness is the
   only reason review wall-clock is `3×` instead of `max()`.
3. **The orphan holds the pipe.** `execFileSync` waits for EOF; a leaked grandchild holds the
   write end and the timeout that rescues the call leaves the leak alive. The proper fix —
   detached spawn, signal the **process group** — is already implemented in this repository, in
   `health-probe.mjs`, and named in `HANDOFF.md` as what gates lack.

One move — `execFileSync` → async `spawn` with process groups — closes all three. Costs, stated
rather than waved at: **deterministic driver lifecycle is a preserved property**, so parallel
reviewers must not introduce order-dependence — collect all three, then parse and charge in
declared reviewer order, regardless of completion order. The budget overshoot bound grows from
"one child" to "children in flight" (three, during review) — document it where the ceiling is
documented. And it is still the rewrite it always was: land it alone, with tier 3 on the spawn
path, touching no gate logic in the same commit.

## R22. Message Batches API — **rejected**

Half-price tokens for asynchronous batches is real money at this project's reviewer prices, and
it does not fit: the integration surface here is `claude -p`, not the raw API; and review sits on
the loop's critical path, where a batch that returns in an hour stalls the iteration it exists to
judge. The one latency-tolerant shape — a post-`SHIPPED` advisory re-audit — would be a new
check with no owner and no gate, which is a thing this design refuses on principle: a check
nobody waits for is a check nobody fails.

## Sources

- [SCAFFOLD-CEGIS: Preventing Latent Security Degradation in LLM-Driven Iterative Code Refinement](https://arxiv.org/abs/2603.08520)
- [snarktank/ralph](https://github.com/snarktank/ralph) and [Geoffrey Huntley's Ralph article](https://ghuntley.com/ralph/)
- [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills)
- [ECC](https://github.com/affaan-m/ecc)
- [impeccable](https://impeccable.style/)
- [Building to the Test: Coding Agents Deliver What You Check, Not What You Requested](https://arxiv.org/pdf/2606.28430)
- [Stop Hand-Holding Your Coding Agent: Engineering the Loops that Replace Step-by-Step Prompting](https://arxiv.org/pdf/2607.00038)
- [Agentic Property-Based Testing](https://arxiv.org/pdf/2510.09907)
- [MadEvolve / QuantEvolve: Evolutionary Optimization of Trading Systems with LLMs](https://arxiv.org/pdf/2605.23007)
- [HypoAgents: Bayes-Entropy Collaborative Driven Agents for Research Hypotheses Generation](https://arxiv.org/pdf/2508.01746)
- [TradingAgents: Multi-Agents LLM Financial Trading Framework](https://arxiv.org/html/2412.20138v5)
- [Agentic Trading: When LLM Agents Meet Financial Markets](https://arxiv.org/html/2605.19337v1)
- [GSD Core](https://github.com/open-gsd/gsd-core)
- [Superpowers](https://github.com/obra/superpowers)
- [Loop Engineering](https://github.com/maxmilian/loop-engineering)
- [OuroLoop GateKeeper / agentic-self-regulation-loop](https://github.com/JdominguezEcommium/agentic-self-regulation-loop)
- [Inside the Verification Loop](https://www.devassure.io/blog/inside-the-verification-loop/)
- [Claude Code cost management — `--max-budget-usd`](https://code.claude.com/docs/en/costs)
- [Claude Code CLI reference](https://backgroundclaude.com/cli-reference)
- [Metamorphic Testing: A Review of Challenges and Opportunities (ACM Computing Surveys)](https://dl.acm.org/doi/10.1145/3143561)
- [Validating LLM-Generated Programs with Metamorphic Prompt Testing](https://arxiv.org/pdf/2406.06864)
- [Metamorphic Testing of Deep Code Models: A Systematic Literature Review](https://arxiv.org/pdf/2507.22610)
- [Schemathesis](https://schemathesis.io/) and [repository](https://github.com/api-evangelist/schemathesis)
- [Sandboxing the Claude Code CLI on Linux with bubblewrap](https://labs.esokia.com/post/sandboxing-claude-code-cli-linux-bubblewrap/)
- [Claude Code sandbox settings.json CVE](https://advisories.gitlab.com/pkg/npm/@anthropic-ai/claude-code/CVE-2026-25725)
- [Claude Code `/simplify` and `/batch` guide](https://pasqualepillitteri.it/en/news/331/claude-code-simplify-batch-complete-guide)
- [`/batch` vs `claude -p`](https://smartscope.blog/en/generative-ai/claude/claude-code-batch-processing/)
- [Message Batches — Claude Platform docs](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
- [Claude Code changelog, August 2026](https://www.gradually.ai/en/changelogs/claude-code/)

---

# Round seven — the local plugin-source index, 14 August 2026

Different provenance from every earlier round: not papers or READMEs but **source read off
this machine** — seven readers over the locally cached marketplaces (39 official plugins, 15
external, 17 Anthropic skills, the ecc monolith, superpowers, impeccable), 82 entries
indexed, 31 rejected. The raw index with per-reader detail is archived in the session
workflow transcript (`wf_712fdcaa-84f`). Licenses checked per source: Apache-2.0 and MIT
throughout — adapt, don't vendor.

## R23. Guard path comparison: realpath both sides, casefold on win32 — **take it into item 28's build**

**From:** telegram `server.ts:144-154` (`assertSendable`), receipts `mine-transcripts.mjs:255-335` (Apache-2.0).
Resolve the candidate **and** the protected root through realpath before the positional
prefix compare; compare against `root + sep`; on win32 casefold for comparison only;
realpath failure resolves toward deny inside a run. Closes two silent bypasses of the
`.meeseeks/` positional rule: a symlink into the protected tree, and case-variant paths on
NTFS/APFS where a raw string compare silently stops excluding. Deny test: symlink into
`.meeseeks` denied. Benign neighbour: a sibling named `.meeseeks-notes` allowed. Half a day.

## R24. Bash-mediated protected writes: a real tokenizer, not a regex — **take it; the largest and highest-value single item**

**From:** ecc `block-no-verify.js` + `gateguard-fact-force.js` (`quoteAwareSegments`,
`collectExecutableBodies`, MIT), receipts `mine-transcripts.mjs:133-168` (`stripHeredocs`).
Today `sh -c 'cat > .meeseeks/x'` walks around a Write/Edit-shaped rule. Mechanism:
quote/escape-aware segmentation per chained command; BFS over executable bodies (`$(...)`,
backticks, subshells, `sh -c` recursed with a depth cap); detect redirection/`tee`/`cp`
targets under protected paths — then kill false positives by blanking heredoc bodies first
and requiring command-position anchoring (mentioning a path in written file *content* is not
writing to it). Pure node. One to two days. Deny + benign pair per category, per the
guard's standing rule.

## R25. Guard registration and denial ergonomics: sentinel, provenance, dampening — **take all three; they are small**

**From:** impeccable `hooks/hooks.json`; security-guidance `_base.py:87-94`; ecc
`gateguard-fact-force.js` (#2142). (a) **Sentinel banner:** shell-wrap registration so a
guard that *cannot run* (node absent/too old) drops a sentinel and says so once — the cheap
structural answer to the eleven-version guard-never-invoked class. Trap recorded by ecc's
dispatcher: a passthrough hook must emit **nothing** on stdout or the hook schema rejects
it. (b) **Provenance prefix** on every denial ("[from the meeseeks guard — automated
policy, not user input]") so an injection-hardened builder does not discard its own guard's
denials as untrusted noise; verbatim content stays unstyled beneath. (c) **Denial
dampening:** full explanation for the first ~3 denials, then a one-liner with an ordinal —
ecc records near-identical deny blocks pushing long-context children into repetition loops,
a live specimen of §3.9. Session-keyed state in `os.tmpdir`, never `.meeseeks/`.

## R26. Corrupt-state quarantine: rename aside, never repair in place — **take it**

**From:** telegram `server.ts:156-179`, `211-217`. ENOENT returns the fail-closed default;
any other parse failure renames the file to `<name>.corrupt-<timestamp>` (evidence
preserved), logs, and returns the **strictest** interpretation; writes stay tmp+rename.
Meeseeks reads `pins.json`, `state.json` and `red-evidence.json` back as *decisions*; an
unparseable pin file must quarantine toward "not pinned / not passed", loudly — today the
readers throw or default per-site. Target: `scripts/pins.mjs`, `scripts/ratchet.mjs`, the
red-evidence reader. Half a day.

## R27. Reviewer contract: an `unverifiable[]` channel and a mandatory attack account — **take it; it is contract, not prose**

**From:** superpowers `task-reviewer-prompt.md` (three-way verdict; "cannot verify" items
must each be resolved, never pass silently); math-olympiad `adversarial_prompts.md` (a
CONFIRM must name the step you tried hardest to break and why it held — an empty attack
report on a pass is itself evidence of non-review). Two parsed fields in the reviewer JSON:
`unverifiable[]` fails closed at the driver; a pass without a non-empty attack account is an
unparseable pass, which is already a fail by law. Machine-detects lazy charitable passes.
Template + parser + tests in the same commit (the standing rule), then tier 3. One day plus
live spend.

## R28. Review packaging: truncation honesty and the diff base — **take it**

**From:** security-guidance `review_api.py:27-64` (`cap_diff_for_prompt`); superpowers
review-package. Per-file and total byte caps when assembling the panel's evidence, with an
in-band marker ("[truncated by meeseeks: …]") — a reviewer starved of part of the tree must
be told, or its pass claims coverage it never had. And the diff base must be the recorded
pre-iteration commit, never `HEAD~1`, which silently truncates multi-commit work. Half a day.

## R29. Design-slop gate: drive impeccable's real interface — **take it**

**From:** impeccable `cli/engine/cli/main.mjs`. The gate currently reads exit codes only.
`detect --json` yields a machine-parseable finding stream with the advisory/primary
partition (advisory never fails the gate — matching gate semantics exactly);
`file:///abs/path.html` routes built artifacts through the real engine with no dev server;
`--viewport 390x844` adds a deterministic mobile pass. Findings become reviewer evidence
instead of a bare pass/fail. Committed `--json` fixtures per the fixture-over-mocks rule.
About a day.

## R30. Prompt hygiene at the untrusted-text frames — **take the pair together**

**From:** security-guidance `extensibility.py:1-35`; discord `server.ts:433-438`, telegram
`server.ts:900-905`. (a) **Additive-only envelope:** repo-supplied guidance forwarded into
prompts (improve-mode docs, target CLAUDE.md) rides in a framed block that may ADD checks
but cannot suppress findings — byte-capped, count-capped; a hostile target repo gets one
direction of influence: stricter. (b) **Delimiter neutralization:** scrub exactly the
destination frame's delimiters from untrusted strings (tag characters for tag-framed
blocks; newlines, visibly, for line-oriented artifacts) — a test name is untrusted text and
travels into briefs today.

## R31. Parse-time flag validation that names the flag — **take it; an afternoon**

**From:** receipts `mine-transcripts.mjs:77-86`. A NaN that survives parsing fails OPEN in
whichever direction the comparison happens to be written. `parseDriverArgs` and the
configure wizard's argv path validate at parse time and exit naming the flag and the
accepted formats.

## R32. Least-privilege frontmatter on `/meeseeks` — **take it**

**From:** ralph-loop `commands/ralph-loop.md`, commit-commands `commands/commit.md`. Pin
`allowed-tools` to exactly the driver invocation (`Bash(${CLAUDE_PLUGIN_ROOT}/scripts/driver.mjs:*)`)
so the command surface can run its own script and nothing else, pre-approved.

## R33. The break-character clause, adopted from the style layer that carries it — **take it**

**From:** adventure-time `output-styles/lemongrab.md` (the pattern is shared by all 20
personas): the style layer carries its own escape hatch — if the voice would obscure a
critical warning, drop the voice for that sentence. The meeseeks style layer should state
this in the style itself rather than relying on the driver's "failure output is verbatim"
discipline alone.

## What this round feeds — source-level facts for the open items

- **Item 28, confirmed fail-open by witnesses:** impeccable's installer *deliberately*
  writes hooks into the target's `.claude/settings.local.json` because `claude -p` children
  in that repo demonstrably load project-scope settings; ecc's own gate **exempts**
  `.claude/settings*.json` from itself — the exact write path 28 closes; skill-creator's
  `run_eval.py` strips the `CLAUDECODE` env var to bypass a nesting guard, in the wild — an
  env marker is §6.1 discipline, never a wall, which is why 28's tier-3 live assertion is
  the only load-bearing half. Implementation mechanics: deny via
  `hookSpecificOutput.permissionDecision:'deny'` with exit 0; emit **nothing** on allow.
- **Item 29:** impeccable's waiver ledger (`ignores add-value … --reason … --file`, with
  `doctor` validating every ignore against the live registry so stale waivers surface) is
  the worked model for the §4.3 escape a gitleaks pin needs. Detect-first must **probe by
  execution** (`gitleaks version`), not PATH-check — the Microsoft Store python3 stub
  passes `command -v` and exits 49 headless. Degradation ladders want stable numeric
  outcome codes (security-guidance lost 185K failure rows to a channel that drops strings).
- **Item 30a, dissolved:** all 12 official LSP plugins are LICENSE+README only — the entire
  mechanism is a declarative `lspServers` manifest key (`{command, args?,
  extensionToLanguage, startupTimeout?}`) resolved from PATH by Claude Code core. The plan
  item is not "deliver a plugin" but "emit one manifest key per toolchain and preflight the
  binary loudly."
- **Item 30c/d:** ready sources named — superpowers verification-before-completion's
  claims→evidence table; ecc tdd-workflow's plan-as-untrusted-data fence; and the rent
  machinery the intake items owe already exists as runnable shape (skill-creator's
  train/holdout loop with a blinded improver; writing-skills' mandatory no-guidance
  control). Caution recorded: anchored 0-100 confidence rubrics appear in three sources and
  the anchors transfer, but two of three silently drop sub-threshold findings — adopt
  anchors, never thresholds.

## Round seven, explicitly not taken

31 rejections, in the transcript with reasons. Representative: every self-review pattern in
ecc (the builder judging its own work, again); ralph-loop's Stop-hook loop (stallLimit and
the reality-check breaker already dominate it); serena's code-index MCP (a network/index
dependency inside builder children); the document skills' packaged-scripts pattern (the
packaging is interesting, the payloads are attended-authoring tools).

---

# Round eight — prime-agent, mined against the invariants, 14 August 2026

Prime Intellect open-sourced **Prime Agent** (2026-08-06): a general, model-agnostic coding
harness (persistent IPython "RLM" kernel, a self-modifiable "Continual Harness", `--autonomous`
behind operator gates) that competes with Claude Code itself, not a meeseeks-category verification
loop. It lacks all three meeseeks guarantees — no monotonic ratchet, no cold separate-process
judge, and by its own README "not a security sandbox." Recon (`wf_fac6dc7a-d68`) + a source mine
(`wf_8cc08696-8d1`). Two workflows; findings folded here. The rejections are the point as much as
the takings: they are the negative controls that validate the design.

## R34. Atomic write-temp-rename for red-evidence.json — **take it; a verified correctness bug**

**From:** prime-agent `refinement.ts` saveHarnessState (write `${file}.tmp`, renameSync over).
**Verified real gap:** `scripts/driver.mjs:3611` recordRedEvidence writes `red-evidence.json` with
a bare `writeFileSync`, while ratchet.mjs (184-192), pins.mjs (400-402) and lessons.mjs (188-194)
all temp+rename. red-evidence is decision-bearing (redEvidenceGate reads seenFailing + baseline)
AND persists cross-run — the ONE decision writer still non-atomic. A kill mid-write leaves a
half-file; on misparse the baseline can re-establish and admit tests never seen failing — the
fail-OPEN direction, against "nothing defaults to pass". Fix: temp+rename, exactly as the three
neighbours. Apply ONLY to decision-bearing writers; the panel store / reality-check / mutation
config stay bare (they decide nothing and rebuild on corruption). Driver-side, no dependency.
**This one joins the feature queue.** Adjacent to R26 (corrupt-state quarantine).

## R35. Gate-skip on an unchanged workspace — **take it; a spend win**

**From:** prime-agent autonomous mode (skip re-running a failed gate whose workspace has not
changed; increment the attempt counter instead). A content-hash "nothing changed since the last
gate run → don't re-pay for the gate" guard attacks the ship1 token-thrash class the design
already worries about (§1.2's re-paid millions). Real savings on stuck runs. Driver-side.

## R36. Bound the lesson STORE, not just the view — **PLAN candidate (§3.9)**

**From:** prime-agent's own concession "no automatic pruning removes old entries." meeseeks bounds
the VIEW (selectLessons caps to 3/brief, MAX_LESSON_LENGTH=400) but addLesson (lessons.mjs:275) is
append-only and lessons.json persists cross-run, so the STORE grows unbounded over a repo's life —
meeseeks' own named silent-degradation hazard (§3.9). Needs a retire/supersede rule with
injected-lesson-size as a measured metric. Design the retire rule before shipping it. Operator-side.

## R37. Retraction + audit trail + gated promotion for lessons.json — **PLAN candidate**

**From:** prime-agent rollbackProposal (inverse edits from before/after snapshots, rollbackOf
chaining), append-only refinements.jsonl, and local-cannot-silently-promote-to-global. Today
lessons.json has no un-say path — a well-formed confident WRONG lesson (dogfood run 6 nearly
shipped one) lives in the durable cross-run store forever. The monotonic discipline says *design
the escape before the enforcement*, and this durable-if-advisory store has none. Design: reversible
id-keyed entries + a separate lessons-history.jsonl, and run-local CANDIDATE lessons promoted to
the durable store only through a distinct gate (cold-reviewed or usage-thresholded), so one
confused afternoon does not poison every future run. REJECT the builder-facing half — the builder
never reads or edits this. Operator-side.

## R38. Durable sub-run registry + results-via-files — **feeds the queued components feature**

**From:** prime-agent rlm.md fire-and-forget subagents with a parent-scoped registry surviving
kernel restart, results delivered only through files, never a return value. Maps onto the queued
components sub-runs feature (item 24 shipped its core; this hardens reruns): a driver-owned
registry sub-run-id → worktree → status under `.meeseeks/`, so a relaunched driver re-discovers
in-flight worktrees instead of leaking them — extending race.mjs' SIGKILL sweep-at-start (§13.6).
Results read from artifacts, never a child's return — independent confirmation of the
artifact-as-truth discipline. REJECT the sibling-steering half (running agents steering each
other) — it breaks isolation and cold review.

## R39. Cite the Factorio case study in DESIGN.md — **take it; a free doc win, land with the guard**

**From:** prime-agent's published Factorio study — its ONLY anti-cheat was heartbeat prompts, it
was EMPIRICALLY DEFEATED, and `/refine` then optimized for *more efficient cheating skills*. This
is an independent, published demonstration that a prompt-only boundary fails AND that a
self-improvement loop amplifies the exploit — external empirical vindication of exactly why the
meeseeks guard is **positional and architectural, not a prompt**. Add to §6 (threat model) and
§13.8 (lesson memory stays driver-owned for this reason). Fold into the guard-hardening landing —
the guard I hardened tonight through three hostile passes is the mechanism this study argues for.

## R40. Bounded gate-output → next-iteration repair context, with per-id retry counts — **PLAN candidate**

**From:** prime-agent autonomous.ts buildGateFailureContinuation. meeseeks already feeds reviewer
JSON back to the builder; formalising "bounded gate-failure output → next iteration's repair
context, with a per-id retry counter" generalises §1.2's within-run regression-count beyond
ratchet regressions to gate failures.

## Two notes (design, not builds)

- **evidence.tests[] cross-check:** the driver already overrides the extractor's evidence
  *integers* with the real struggle values (driver.mjs:1676), but the model-supplied `tests[]`
  list is stored uncross-checked; optionally verify it against real ratchet ids, extending the
  ungroundedGateClaim pattern. Low value — the load-bearing integers are already grounded.
- **cache-read accounting:** meeseeks counts all four token terms (driver.mjs:1002), the
  fail-closed direction (over-count trips the ceiling earlier); prime-agent excludes cache_read.
  Documented note, not a change — the only bite is an operator who sets tokenCeiling but leaves
  costCeiling=0 on a verification-heavy target.

## Round eight, not taken — the negative controls that validate the design

Each rejected borrow names the exact law it breaks, and together they are external evidence the
laws are right:
- **Warm gate-failure narrative fed back into the SAME builder** — collides with builder
  starvation; carrying a failure narrative past the git reset is the anti-pattern the design
  exists to prevent. The clean negative control for why the builder is starved.
- **Persistent IPython kernel as the builder's environment** — the inverse of starvation; the
  persistence IS the hazard (half-built state leaks past a reset and breaks the ratchet's premise).
- **Agent self-grades its own trajectory to edit its own memory (`/refine`)** — "the builder
  cannot judge its own work"; self-evaluation is the enemy the cold panel exists to defeat. Only
  the cold-distiller SHAPE is admissible, and meeseeks already ships it as the read-only
  lesson-extractor in its own `claude -p` process.
- **Four typed builder-readable memory kinds** — any cross-iteration memory the builder can read
  collides with deliberate starvation; meeseeks keeps one narrow, driver-owned, evidence-gated,
  never-builder-editable lesson kind.

And a phrase worth citing, not building: prime-agent's *"a passed gate checks only what that gate
verifies; reaching a limit does not imply task success"* is an independent restatement of
"nothing defaults to pass" — useful when defending the invariant to a skeptic.

---

# Round nine — microsoft/SkillOpt, 15 August 2026 (MIT; 16k stars, active; arXiv 2605.23904)

**What it is, measured not guessed:** a text-space optimizer treating a Markdown "skill document" as
the trainable parameters of a frozen agent — rollout → reflect → aggregate → select → update → a
**validation gate** that accepts a candidate only on strict improvement over a held-out split. Plus
**SkillOpt-Sleep**: a nightly offline cycle for coding agents (harvest transcripts → mine tasks →
replay → consolidate behind the same gate → stage → **human adopts**). The most on-topic repo yet
reconned for the §3.9 prompt-drift problem.

## R41. Gate prompt or lesson candidates on held-out replay — **captured conditionally in PLAN item 59**

From `skillopt/evaluation/gate.py`: a pure decision function, strict `>` acceptance, reject returns
the incumbent unchanged, best-so-far tracked with the step that earned it — the decision/effect split
this repo already houses. PLAN item 59 captures the protocol as a parked, operator-side experiment:
discovery, selection, and untouched final-test partitions; strict improvement; and per-required-scenario
non-regression. It is not a current release gate. Existing template commits continue through the
ordinary shipped-file and live-tier requirements unless and until item 59 passes its admission tests.

## R42. Operator-side rejected-candidate buffer with score deltas — **captured in PLAN items 35 and 59**

From `skillopt/engine/trainer.py` `_format_step_buffer`: prior optimizer steps feed forward failure
patterns, attempted edits, and score drops so the optimizer does not retry a known regression. In
Meeseeks this belongs only to the promoter or offline research lab. It is never Builder or reviewer
context and never a runtime repair brief. PLAN item 46 already owns the distinct, bounded case where
the current iteration's deterministic gate failures are supplied for one repair attempt.

## R43. Four-way longitudinal categorization — **take; cheap**

From `skillopt/optimizer/slow_update.py`: improved / regressed / **persistent_fail** / stable_success,
regressions flagged highest priority. The ratchet makes right→wrong fatal, but wrong→wrong across k
iterations is currently mere repetition — explicit persistent-fail tracking gives the driver an
escalation trigger (re-plan, narrow, circuit-break §13.3) instead of re-prompting the same failure.

## R44. The boundary function reports whether the boundary held — **take**

From `skillopt_sleep/consolidate.py` `_split` (a `leaked` flag) + its holdout-integrity tests. §6.1's
"held out means *not supplied*" is a stated discipline; the borrow makes prompt assembly RETURN a
starvation report (containment-checked: oracle cases, build log, iteration history provably absent
from the assembled reviewer prompt) with one tier-1 test per boundary. A discipline that keeps
failing becomes a gate — applied one step early, before it fails.

## R45. Protected machine-owned regions inside a document — **file away**

`<!-- APPENDIX_START/END -->` regions ordinary edits cannot touch, enforced by one shared check.
The guard's positional principle at intra-file grain — wanted the day any artifact is co-written by
human and loop.

## R46. Prompt-health diagnostics — **take as diagnostics only**

Template token count and imperative-word density (MUST/NEVER/ALWAYS) per version, into the
measurement ledger — a concrete instrument for "the prompt that grows until the builder is quietly
worse." The *score bonus* half is rejected below.

## Round nine, not taken — the negative controls, unusually validating

- **Aggregate-score acceptance** (their default; per-task `gate_no_regression` shipped later,
  opt-in, default OFF after their issue #174) — breaks the ratchet. Their patch history is external
  evidence per-id monotonicity was right on day one.
- **`use_gate: false`** — "validation recorded, candidates force-accepted": a config key that turns a
  gate into a logger. Nothing defaults to pass; flags are typed, config is read at 3 a.m.
- **Semantic-density score BONUS** (+0.05 × shouting) — a style heuristic contaminating an evidence
  metric; style never touches logic, and it pays the optimizer to shout (Goodhart).
- **`except: pass` silent fallback** in edit-ranking — `catch { return pass }`'s cousin.
- **Self-reflection + self-judging economy** (Sleep's rubric-judge modes) — the builder cannot judge
  its own work; the cold panel's expense IS the design.
- **Dream rollouts as evidence** — synthetic variants on the acceptance side are fabricated evidence;
  their real-tasks-only acceptance split is the load-bearing part if exploration-generation is ever
  borrowed.
- **Scheduled auto-adopt** of learned prompt changes — self-modification is typed by somebody
  watching (`--give-them-the-box` philosophy); their stage-then-human-adopts default is the right
  half.

Footnote worth imitating: their `on-session-end.sh` hook — async, one appended line, `|| exit 0`
everywhere, never fails the session.

---

# Round ten — daly2211/autoretrieval, 15 August 2026 (MIT; 91 stars, dormant ~4 weeks; showcase, no tests)

**What it is:** a metric-driven autonomous optimization loop for a RAG pipeline — structurally a cousin
of meeseeks at ~1/50th the rigor. One agent-editable file, a fixed character-overlap scorer, a
"change one variable → commit → eval → keep or reset → repeat forever" prompt, and a TSV ledger.
A Ralph-loop for retrieval tuning.

## R47. Commit-hash-keyed one-row-per-iteration ledger — **the one cheap take**

From its `program.md` logging contract: `commit, metrics…, keep/discard/crash, description` — the whole
run history in one greppable file where "revert" means "reset to the hash on the last keep row." Maps to
an operator-facing scannable run summary the driver appends per iteration (guard-compatible,
driver-owned). Nice-to-have, not load-bearing.

## Noted, not taken

Its harness *shape* (fixed scorer + agent-edited artifact + scored ledger + revert-on-regression) is the
template-tuning rig idea — already captured better as **R41** (SkillOpt's gated version, with a held-out
split and strict acceptance, which this repo lacks).

## Round ten, not taken — a cautionary fixture, which is its real value

A clean, popular, MIT example of the exact failure modes the invariants were written against:
- **Prompt-plea file protection** ("untouchable files:" *in the prompt*) — "not supplied" discipline
  dressed as a driver-owned guarantee; nothing stops the optimizer editing its own scorer. The defect
  the positional guard exists to kill (§6.1).
- **Self-judged keep/discard, agent-written ledger** — the builder judging its own work and writing its
  own `.meeseeks/`. A deterministic metric softens it; it does not excuse it.
- **A scalar metric as the entire definition of done** — Goodhart bait; the cold panel exists because a
  single number cannot say "shipped."
- **"Crashes: log and move on" + "never stop"** — a gate that cannot run is a failure, and unbounded
  loops violate termination by design.

**Verdict: near-nothing worth stealing, recorded anyway** — every load-bearing mechanism is a weaker
sibling of something meeseeks already hardened, which makes it useful evidence rather than useful code.
