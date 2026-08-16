# Completion Plan — 12 August 2026

> **Frozen as the historical plan, 13 August 2026. The live plan is `PLAN.md`.** Execution outran this file the day it was
> written and nobody ticked a box: Phase 1's oracle shipped at 0.70.0–0.72.0, most of Phase 0's
> experiments ran (E and F passed; run 8 `SHIPPED`; H and I remain), and the tier-3 check ran
> 8 of 8. **The boxes below are deliberately left unticked** — `HANDOFF.md` is the execution
> record and `BRIEF.md` carries per-item statuses; ticking a second ledger is how two ledgers
> disagree. The percentages below (~75% / ~60%) are as-of 12 August, before runs 8–15 and the
> fixes they bought. Read this file for the *ordering rationale*, which is still the best
> statement of it, and read `HANDOFF.md` for what actually happened.

> **For agentic workers:** use `superpowers:subagent-driven-development` or
> `superpowers:executing-plans` for the coded phases. Steps use checkbox syntax.
>
> **Half of what remains is not code.** Four items are *experiments* — runs that produce
> evidence — and they are sequenced first because their results can invalidate the coded work.

**Goal:** close the gap between what `DESIGN.md` specifies and what has been *executed*, in the
order that removes the most uncertainty per unit of effort.

**Where the project stands:** ~75% against the written spec; **~60% against "would I trust a
`SHIPPED` tag"**, because run 12 shipped a demonstrably wrong answer past a reviewer that ran
110,877 differential fuzz cases.

## The ordering principle

**Information value first, not effort.** Of the never-executed surfaces probed on 12 August,
**about half were broken** — the guard hook registered for no child, the mutation gate crashing
instead of running, a widened remit with no channel. All three were green in a 1,400-test suite.
So the plan front-loads *execution of untested surfaces* over new construction, because every
line of new code written on top of an unverified one is built on a coin flip.

## Global constraints

Carried from `CLAUDE.md`, and they bind every task below:

- **No runtime dependencies.** `node:` builtins and shelling out. Dev-only deps are fine.
- **Node ≥ 22.12. ESM, `.mjs`.** No CommonJS, no build step.
- **Any change to a shipped file requires a version bump** in `.claude-plugin/plugin.json` and
  `package.json` together, verified by `npm run release-check`.
- **One slice per commit.** A slice needing a second commit to be correct was too big.
- **Nothing defaults to pass.** Missing evidence, unparseable output, a crashed gate — all fail.
- **Do not edit `templates/*.md` or `hooks/guard.mjs` while a run is in flight.** Both are read
  from disk per child; `scripts/*.mjs` is safe because Node loaded it at startup.

---

# Phase 0 — Experiments. No code. Do these first.

Each produces evidence that changes what gets built. None takes more than a run.

## E1. Case H — the `unknown` verdict and quarantine

**Why first:** quarantine is the rule that makes *"quarantine is not a pass"* mean anything, and
it has **never fired**. If `unknown` turns out to be unreachable in practice, the rule is
decoration and `DESIGN.md` §4.3 needs rewriting rather than defending.

- [ ] Write the case-H PRD from `DOGFOOD.md` — a security element marked *verified by inspection*
      so no protected test depends on it.
- [ ] Run it to a pin, then rewrite the guard from outside the run so behaviour is identical and
      the pinned snippet appears nowhere. Confirm `grep` finds nothing **and** the suite is green,
      or you have tested the ratchet instead.
- [ ] Record which verdict came back. `moved` or `removed` is a finding about the escalation
      prompt's discrimination, not a failed scenario.
- [ ] If `unknown`: confirm `status: quarantined`, that the run **cannot** reach `SHIPPED`, and
      that the quarantine is surfaced to the operator rather than merely recorded.

## E2. Case I — racing with a live builder

**Why second:** largest untested surface in the project, and **C5 is blocked behind it.**

- [ ] `race: { enabled: true, n: 2, after: 2 }` against the **rejection** PRD, whose `PRD-4.1` is
      impossible on purpose — a satisfiable PRD may never stall and never arm the race, which is a
      null result rather than a pass.
- [ ] Collect: `git worktree list` afterwards (must be clean), one brief per candidate, the
      winner's churn against the tie-break order, and that no candidate read or advanced the
      ratchet.
- [ ] Record cost and wall-clock per candidate against a normal iteration. That number decides
      whether racing is ever worth arming, and nothing else does.

## E3. Deploy against a real host

**Why third:** built 0.61.0–0.63.0 and **never executed.** The ssh half is argv nobody has run.

- [ ] A throwaway droplet, a `deploy.sh`, a `/health` route.
- [ ] Confirm both directions: a good deploy ships, and a **deliberately broken** one withholds
      the tag *without* triggering a `git reset --hard`.

## E4. The .NET adapter

**Blocked on an SDK existing anywhere.** Until then it stays marked unverified. Do not let its
green contract tests be read as evidence — they pass on argv nobody has executed.

---

# Phase 1 — A3, the held-out oracle

**Promoted to the top of the coded work by run 12**, which is the whole justification:

> The reviewer wrote an independent reference implementation *from the PRD and data model*, then
> differentially fuzzed 110,877 cases against it — **and still passed a binary reporting
> `mean: 0` where the answer is 1/3.** A reference derived from the same documents cannot catch a
> defect the documents are silent about. That is not a lazy reviewer; **it is the oracle problem**,
> and A3 is the only item on the roadmap that addresses it.

**Architecture:** the driver holds out a set of test cases the builder never sees, written at
Phase 0 from the PRD by a *separate* child, stored driver-owned under `.meeseeks/`, and executed as a
gate. §6's positional rule already protects them; §6.1's *not supplied* discipline keeps them out
of every brief.

**The deferral reason no longer holds.** A3 was deferred because "the builder would own whether
the gate can fail". §4.4 solved exactly that for Stryker by writing the config into `.meeseeks/` and
passing it positionally. The same move applies.

**Files:**
- Create: `scripts/oracle.mjs` — author, store, execute, judge
- Create: `templates/oracle-author.md` — PRD → held-out cases (Phase 0, cold child)
- Modify: `scripts/driver.mjs` — one gate entry and one Phase-0 call
- Modify: `scripts/gate-policy.mjs` — `oracle` is universal
- Test: `test/oracle.test.mjs`, `test/live/oracle-contract.live.test.mjs`

**Interfaces:**
- Produces: `authorOracle(prd) → {cases: {input, argv, expectStdout, expectExit}[]}`,
  `writeOracle(meeseeksDir, cases) → string`, `runOracle(meeseeksDir, root, run) → GateResult`

### Task 1.1 — the store, driver-owned and unreadable-by-discipline

- [ ] **Step 1: Write the failing test.**

```js
it('refuses to run when the store is missing, rather than passing over nothing', () => {
  const meeseeksDir = path.join(makeTempDir(), '.meeseeks');
  mkdirSync(meeseeksDir, { recursive: true });
  const result = runOracle(meeseeksDir, '/repo', () => ({ ok: true, status: 0, stdout: '', stderr: '' }));
  assert.equal(result.ok, false);
  assert.match(result.detail, /no held-out cases/);
});
```

- [ ] **Step 2:** `node --test test/oracle.test.mjs` — expect FAIL, `runOracle is not defined`.
- [ ] **Step 3:** implement `runOracle` returning a failing `GateResult` when the file is absent.
      **An empty or missing store fails**; it is the one shape that reads exactly like a clean pass.
- [ ] **Step 4:** re-run — expect PASS.
- [ ] **Step 5:** commit `feat(oracle): a missing held-out store fails the gate`.

### Task 1.2 — execution and judging

- [ ] **Step 1: Write the failing test**, asserting **values**, not truthiness:

```js
it('fails on a wrong stdout even when the exit code is right', () => {
  const cases = [{ argv: ['a.csv'], expectExit: 0, expectStdout: '{"columns":[]}' }];
  const result = judgeOracle(cases, [{ status: 0, stdout: '{"columns":[1]}' }]);
  assert.equal(result.ok, false);
  assert.match(result.detail, /stdout/);
});
```

- [ ] **Step 2:** run — expect FAIL.
- [ ] **Step 3:** implement `judgeOracle`. Exit code **and** stdout must both match. A case that
      cannot be executed **fails**; it is not skipped.
- [ ] **Step 4:** run — expect PASS.
- [ ] **Step 5:** commit.

### Status: BUILT at 0.70.0–0.72.0. `DESIGN.md` §4.6

Tasks 1.1–1.4 are done and pushed. `scripts/oracle.mjs`, `templates/oracle-author.md`, the gate in
`staticGates`, a `cli`-only `gate-policy.mjs` entry, authoring at Phase 0b, and a tier-3 check
proving a real child returns cases the parser accepts.

**One design decision changed during the build and the earlier note here was wrong.** It said
invocation belonged to the toolchain, following `health-probe.mjs` as a subprocess. It does not:
this codebase already has **static gates as plain functions** (`integrityGate`,
`observabilityGate`), and the oracle is one of those. No subprocess, no toolchain operation, no
new command string. Invocation resolves from `package.json` `bin` inside `oracle.mjs`.

**`oracle.enabled` defaults to `false`.** The reasoning is §4.6's and it is not timidity: a case
that invents a requirement the specification does not decide becomes a gate the builder can never
satisfy, and it cannot tell an invention from a real requirement.

**Task 1.5 — the acceptance test — has not run**, and it is the only thing between here and
calling A3 finished.

### Task 1.3 — authoring, at Phase 0, by a child that never sees the code

- [ ] **Step 1:** write `templates/oracle-author.md`. It receives **the PRD only** — no source, no
      design docs — and returns cases as one fenced json block. Its instruction is to write cases
      the *specification* implies that an implementer would plausibly get wrong: boundaries,
      truncation that still parses, numeric limits, encodings.
- [ ] **Step 2:** write the tier-1 parser test for that block, including that a malformed block
      **fails the run** rather than yielding zero cases.
- [ ] **Step 3:** implement `authorOracle`.
- [ ] **Step 4:** `npm test`.
- [ ] **Step 5:** commit.

### Task 1.4 — wire it, and prove it live

- [ ] **Step 1:** add `oracle` to `GATE_OPERATIONS` and a **universal** entry in
      `gate-policy.mjs` with its written reason. Universal is the default; an unlisted gate runs
      anyway, but the omission is the §4.2 defect class and a test asserts the table is complete.
- [ ] **Step 2:** tier-3 check — a real authoring child returns a parseable block. **This is a new
      output contract owned by another binary**, which is §11.1's rule, not a formality.
- [ ] **Step 3:** `npm test && npm run test:integration && MEESEEKS_LIVE=1 npm run test:live`.
- [ ] **Step 4:** bump, `npm run release-check`, commit.

### Task 1.5 — the acceptance test that matters

- [ ] **Step 1:** re-run case G on a fresh tree with the same csvstat PRD.
- [ ] **Step 2:** run `printf 'v\n1e16\n1\n-1e16\n'` against the shipped binary.
      **`mean` must be `0.3333333333333333` or the run must not have shipped.** That is the
      pass condition for this entire phase, and it is a defect two panels have now disagreed about.

---

# Phase 2 — the deferred correctness items

Each is specified in `HANDOFF.md`; each earns its own plan when reached.

## 2.1 The 0.56.0 objective contradiction

**Measured cost: two extra iterations and a clean panel, twice.** Run 12's iteration 5 passed
unanimously, the sensitivity check withheld, the builder touched source as instructed, and
iteration 6 returned three findings.

**Fix:** when the panel passes and the changed set is empty, **the driver mutates the whole
first-party source itself** rather than handing a builder an objective with no legal move.
Measure the cost of a whole-tree mutation run at ship time first — run 12's scoped runs were
minutes.

## 2.2 Builder context inheritance — **DONE, discovered recorded nowhere and marked here 14 Aug**

> Implemented exactly as specified: `isColdPhase` (driver.mjs:1190) splits by write capability —
> read-only cold phases run under `--safe-mode`, writing phases keep the guard (`claudeArgs` adds
> `--safe-mode` via `isColdPhase`), and the required template half exists too —
> `templates/reviewer-system.md:216` tells the reviewer to read `CLAUDE.md` deliberately.
> Found done-but-unledgered by the 0.140.0 survey — the inverse
> of the usual staleness, and the reason this frozen file still gets its obituaries written.

Every child receives the operator's plugin SessionStart injections, `MEMORY.md`, email and git
status — measured, including in an empty temp directory. `--safe-mode` suppresses it and **cannot
coexist with the guard** (measured: a settings-supplied hook is disabled too).

**Split by write capability**, which `PHASE_PERMISSIONS` already draws: safe-mode for the
read-only cold phases; guard for anything that can write. **Requires a `templates/` edit** to tell
the reviewer to read the target `CLAUDE.md` deliberately, because run 10's reviewer used it to
convict the builder and safe-mode removes the auto-injection.

---

# Phase 3 — throughput

## 3.1 Parallel panel

Run 10 spent **26 minutes** serialising three reviewers that are read-only, own disjoint ids and
never communicate. `scripts/panel.mjs` as a separate program invoked with one `execFileSync` —
the `health-probe.mjs` precedent — keeps the driver synchronous and cascades through nothing.

**Four guarantees must move with it or they are silently deleted:** the context budget check,
cost and token accounting, one reviewer's failure not losing the others, and `combinePanel`'s
coverage re-check. **Do not buy this time by lowering reviewer effort.**

---

# Phase 4 — breadth

Cases A (web/API), B (persistence), C (.NET). These are breadth rather than risk now that D–G
have five outcomes behind them, and they belong **after** the correctness work, not before.

---

## Definition of done for this plan

1. `unknown`/quarantine observed, or §4.3 rewritten to say it cannot be.
2. One race executed with a live builder, worktrees clean afterwards.
3. One deploy to a real host, both directions.
4. **A3 shipped, and the cancellation defect either caught or absent.**
5. Cases A and B run.
6. Every "unverified" claim in `README.md`, `HANDOFF.md` and `BRIEF.md` either closed or still
   true — checked, not assumed. **Five stale statuses were found on 12 August alone**, and the
   pattern is that this repository retires defects faster than it retires their obituaries.
