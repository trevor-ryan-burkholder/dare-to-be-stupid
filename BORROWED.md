# Worth stealing

A survey of adjacent projects and research, filtered to things `dare` does not already do
better. Ranked by value, with honest costs. Nothing here is committed — this is a menu.

Sources at the bottom.

---

## Tier 1 — take these

### 1. Safety monotonicity: extend the ratchet to security

**From:** *SCAFFOLD-CEGIS: Preventing Latent Security Degradation in LLM-Driven Iterative
Code Refinement* (arXiv 2603.08520).

This paper describes `dare`'s architecture and then describes how it fails. The finding
they call the **iterative refinement paradox**: specification drift during multi-objective
optimisation causes security to degrade *gradually across iterations*. With GPT-4o,
**43.7% of iteration chains contained more vulnerabilities than the baseline after ten
rounds.**

Two details that matter here specifically:

- **A security gate does not fix it, and measurably makes it worse.** Adding SAST gating
  raised the latent degradation rate from 12.5% (unprotected baseline) to **20.8%**. The
  stated cause: static rules cannot see *structural* degradation — removal of defensive
  logic, weakening of exception handling. `dare` currently has exactly this: `npm audit`
  plus a security auditor, per iteration, with no memory.
- **Their fix is the ratchet.** They "enforce safety monotonicity through four-layer gated
  verification" and reach a 100% safety-monotonicity rate. That is the mechanism already at
  the centre of this design, pointed at a different property.

**What it means for `dare`:** the ratchet is monotonic on *test ids* only. Security is
evaluated fresh each iteration and can silently erode. The fix uses machinery that already
exists: when the security auditor cites a defensive element with `file:line` — an auth
guard, an input validation, an exception handler — pin it. A later iteration that removes
it is a regression, triggering the same `git reset --hard` and regression objective as a
dropped test id.

**Cost:** moderate. Needs a second pinned set in `.dare/state.json` and a way to re-check
pinned elements cheaply (grep for the guard, not a full audit). **Value:** highest on this
page. It closes the one degradation path the design currently cannot see, using the one
mechanism it already trusts.

---

### 2. Held-out oracle: tests the builder never sees — **superseded by R13; not taken**

**From:** AgentLoop; supported by *Building to the Test: Coding Agents Deliver What You
Check, Not What You Requested* (arXiv 2606.28430).

The framing: "a coding agent verifying its own patch still sits inside one incentive loop."
`dare` already fixed the *review* half of this — the reviewer is a separate cold process.
But the **builder still writes the tests the ratchet is built from.** The ratchet is
rigorous about protecting ids; it has no opinion on whether those ids were worth having.
An agent that writes its own checks builds to its own checks.

**What it means for `dare`:** a held-out suite, authored in a separate `claude -p` from the
PRD alone, never shown to the builder, run only at gate time. Regressions against it count
for the ratchet. The builder cannot satisfice against tests it has never read.

**Cost:** a new phase and a real risk of false failures when the oracle misreads the PRD —
budget for a way to quarantine a bad oracle test rather than hard-resetting on it.
**Value:** high. It is the same insight as the cold reviewer, applied one layer earlier, and
it attacks the last place the builder is still judging itself.

> **Deferred 11 August 2026 after reading the code.** Two fixable obstacles — the builder owns the
> test runner's config, and the regression objective leaks the oracle's ids — plus a third,
> unsealable reads, which was first called fatal and is not. See **R13**. The hole this identified
> is real, the item is still the only thing aimed at it, and it waits on a run that finishes.

---

### 3. Mutation testing as a gate

**From:** GSD Core ships `stryker.config.mjs` at repo root.

The most load-bearing claim in the DoD is "tests assert real values, not truthiness." Today
that is enforced by a reviewer *reading* the tests — an LLM judgment that costs a full
iteration when it fires. Mutation testing is the deterministic form: mutate the source,
confirm the tests fail. A tautological test survives every mutant, and that is a number.

**What it means for `dare`:** moves the single most important quality property from Phase 5
judgment to a Phase 3 exit code, where it is free and unarguable.

**Cost:** slow. Wants scoping to changed files, or a config flag, or running only when the
iteration is otherwise green. **Value:** high, and it is the natural deterministic partner
to a rule the project already believes in.

---

## Tier 2 — cheap and real

### 4. Verify the prompt still fits the window

**From:** GSD Core's plan step explicitly "verifies the plan fits a fresh context window."

`dare` assembles Build Brief + PRD + design docs + retrieved lessons + conditional history,
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
  and a suggested correction strategy rather than a bare verdict. `dare`'s objective/Build
  Brief mechanism already does this; the `no-tests` brief is exactly the pattern. Nothing to
  take.
- **Two-stage review — spec compliance, then code quality** (Superpowers, ~820k installs):
  `dare`'s three-way specialised panel is a finer-grained version of the same idea. Nothing
  to take.
- **Fresh subagent per task** (Superpowers, GSD, ECC all converge here): `dare` uses a fresh
  OS process per phase, which is strictly stronger isolation. Nothing to take.

---

## Explicitly reject

- **Self-improving gate thresholds** (OuroLoop, marked beta). Thresholds that adapt from
  historical performance can drift *downward*. That is a direct violation of **nothing
  defaults to pass**, and it would make the gates negotiable by the thing they constrain.
  This is the same category as letting the builder edit `state.json`.
- **Multi-runtime installers** (GSD, ECC, Superpowers all ship them). `dare` is Claude Code
  only on purpose; portability is a tax on the guard hook and the envelope parser, both of
  which are version-pinned by design.
- **An interactive discussion phase** (GSD's "Discuss"). Unattended is the premise.
- **Cooperative parallel waves** (GSD). `dare`'s race is competitive on the *same* task;
  waves split *different* tasks and buy merge-conflict surface. Different problem.
- **Changesets** (GSD). `release-check` is better tuned to the plugin-cache trap that
  actually cost hours here.

---

## Validation, not a change

The emerging vocabulary calls this **loop engineering**: a bounded artifact made of a
trigger, a goal, a verification step, a stopping rule, and a memory. `dare` has all five —
`/dare`, the PRD, gates plus the panel, the terminal states, and the ratchet plus lessons.

GSD Core's central thesis is **context rot**, quality decaying as a window fills. `dare` is
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
currently missing: **Dare re-litigates every requirement, every iteration, at full cold-panel
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
gestures at. Worth taking close to verbatim, because in Dare an unnecessary diff is not a
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

- **Per-run archiving** (Ralph archives to `archive/YYYY-MM-DD-feature/`). Dare overwrites
  `.dare` state per run. Archiving instead of overwriting costs almost nothing and makes the
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
whole point of one. Dare's is declared in the PRD, and every invariant in the design exists to
hold it still — the cold reviewer, the guard hook, the monotonic ratchet, nothing defaults to
pass. A loop permitted to hypothesise about what it is building is R8's rejected pattern with a
research vocabulary. This is the general case of the self-improving thresholds rejected in round
one, and it fails for the same reason.

**Evaluation is the expensive half.** Hypothesis search is justified by cheap, high-volume
evaluation — a backtest is free and you run thousands overnight. Here, one cold reviewer was
measured at $0.83 and 124 seconds, gates shell out to real toolchains, and `maxIterations` is
25. The shape transfers; the economics do not. At n=25 a hypothesis loop is a slower race, and
the race already exists.

## R13. Held-out oracle, reconsidered — **deferred, not rejected**

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
- **"A shared verified context."** Not rejected, already built: `.dare/` is that store, and §8.1
  states the principle outright — *"The repository and the driver's own artifacts are the memory.
  A child's conversation is disposable."* The blackboard is not an alternative to the coordinator
  here; the coordinator is what makes it trustworthy.

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
