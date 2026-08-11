# Implementation brief — integrity, portability, reliability

**Status: revised 11 August 2026 against the repository at 0.18.0.** The original brief was
written against a pre-0.10.0 tree and eight of its items had shipped before it was read. Those
are collapsed to one line each below, pointing at `HANDOFF.md`, which is the verification
ledger and stays the single source of truth for what has run. Seven more items had a defect
that would break an existing invariant; each carries a correction inline.

**Every open design decision was settled on 11 August 2026** and written into the item that
raised it — A2, A4's quarantine path, A5's gate kind, A6's delivery, A9's contract, and
`PRODUCT.md` ownership. A3 was deferred behind the dogfood runs, and one of the three reasons
first given for shelving it was overstated and has been corrected in place. Items carrying
**DECIDED** are specifications, not questions; do not reopen them without new evidence from the
repository.

~~The original text is in git (`git show HEAD~1:BRIEF.md`) if the unrevised intent is wanted.~~

> **Correction — 11 August 2026, found while implementing A1a.** It is not. `BRIEF.md`,
> `BORROWED.md` and `BRIEF-REVIEW.md` had never been tracked on any branch; `git log --all --
> BRIEF.md` was empty and `git show HEAD~1:BRIEF.md` reported *"exists on disk, but not in
> HEAD~1"*. The unrevised text is unrecoverable. All three were committed for the first time
> alongside A1a so that the statuses below survive as a resume point.

**Validation was static.** The suite was not executed while revising this; every judgement
below comes from reading code.

Statuses:

| | |
|---|---|
| **DONE** | shipped; do not re-implement |
| **OPEN** | outstanding, text stands as written |
| **OPEN — REVISED** | outstanding, but the original mechanism was wrong; see the correction |
| **BLOCKED** | cannot be verified in this environment |
| **DROP** | should not be done, with reason |

---

You are modifying the `dare-to-be-stupid` Claude Code plugin. Treat this as an existing
autonomous software-delivery harness with strong invariants, not a greenfield agent framework.

## Before making changes

1. Read `DESIGN.md`
2. Read `HANDOFF.md`
3. Read `BORROWED.md` — the research behind A2, A3, A4, C4 and D2
4. Read `scripts/driver.mjs`, then all scripts under `scripts/`
5. Read `hooks/guard.mjs` and all templates under `templates/`
6. Inspect the current test suite and the `.dare` runtime files
7. Compare documented behaviour against actual implementation

**This brief has been reconciled once but is not self-verifying.** Where it and the repository
disagree, the repository is the fact — say so rather than silently picking one.

## Primary objective

1. close remaining integrity and evidence holes
2. make execution and gates stack-agnostic
3. improve real-world reliability without adding unnecessary agent complexity

Do not add reviewers, memory systems, planning agents, or orchestration frameworks unless an
item below explicitly calls for one.

---

# A. Integrity and evidence

## A1. Protect all `.dare/**` runtime state — **DONE (0.10.0)**

`hooks/guard.mjs` protects the whole `.dare` tree positionally, not by enumerated basename,
scoped to `DARE_RUNNING`. `test/guard.test.mjs:334–353` is already the forgery-regression suite
the original brief asked for: Write, Edit, `>`, `tee`, `cp`, `python3 -c`, and `cd .dare`
without ever spelling the path.

> **Correction.** The original claimed `.dare/red-evidence.json` might still be writable and
> called that the highest-priority defect on the page. It is not writable. Enumeration *was*
> the bug and `red-evidence.json` *was* the proof of it — that is why the rule is positional
> now, and the reasoning is in `guard.mjs`'s header.

## A1a. Two places still state the old, weaker rule — **DONE (0.19.0)**

`templates/builder-system.md:145` says the untouchable set is `.dare/state.json` and
`.dare/config.json`. `brief.mjs:194–195` says `state.json`, `config.json` and `lessons.json`,
and that one is worse because it is compiled into every brief the builder actually reads. It has
been the entire tree since 0.10.0.

The builder is being told a weaker rule than the hook enforces, which costs an iteration the
first time it tries something the guard denies and it had no reason to expect. Fix both, and
state the rule positionally — anything under `.dare` — so the next artifact does not have to be
remembered onto a list. That is the same defect at the documentation layer that the enumerated
basenames were at the enforcement layer.

**Landed 0.19.0.** Both places now say "anything under `.dare/`, at any depth, including paths
that do not exist yet" and name **no file at all**. Three tests hold it: the brief and the
template each assert `match(/`\.dare\/[\w-]+\.json`/g)` is `null`, so re-introducing a filename
fails rather than merely reading oddly; and one test pairs the brief against
`isProtectedStatePath`, showing `.dare/red-evidence.json` is absent from the wording and denied
anyway. The wording is now a *description* of the enforced rule rather than a second, weaker rule.

## A2. Classify `.dare` artifacts — **DONE (docs only, at 0.19.0)**

The original asked for `readable` and `sealed`, where sealed meant unreadable by any child marked
`DARE_RUNNING`. **Sealing reads is not achievable. The item is replaced, not deferred.**

Two reasons, either sufficient on its own:

- **The builder executes arbitrary code.** It runs `--dangerously-skip-permissions` and it writes
  the test suite. `readFileSync('.dare/anything')` inside a test file is read at *runtime*, and
  PreToolUse hooks fire on tool calls — not on what the code a builder wrote goes on to do. There
  is no hook position that sees it.
- **The read surface cannot be enumerated.** Write-protection became sound when it stopped naming
  basenames and started matching position. Read-protection cannot make that move, because the
  thing being enumerated is `hooks.json`'s matcher — `Read`, `Glob`, `Grep`, `Task`, and whatever
  file-reading MCP tool a builder is handed next. Anything unmatched is simply allowed. That is
  A1's enumeration bug in a place where the positional fix is unavailable.

**Replace the vocabulary, in `DESIGN.md` and everywhere this brief used it:**

- **driver-owned** — the driver writes it, a child may not. Enforced by `hooks/guard.mjs`, tested,
  and true.
- **not supplied** — the driver does not put it in any prompt, brief or context. A discipline that
  reduces what the builder is *handed*. Not a barrier, and it must not be described as one.

Little is lost. No current artifact needs to be unreadable: `red-evidence.json` is dangerous to
*write* and harmless to read, since knowing which ids have red history lets a builder forge
nothing. The one artifact that would have wanted a seal is A3's oracle — and note carefully what
that costs and what it does not. An oracle the builder was never *handed* still defeats
building-to-the-test, which is the threat this design defends against everywhere else. It does not
defeat a builder that deliberately dumps the file through a gate failure, and nothing here should
claim it does.

Test what is actually claimed: a driver-owned path denied on write to a child, permitted to an
operator, and a benign neighbour allowed. **Tier 1 — this is a rename plus a written reason.**

**Landed — documentation only, no version bump; no shipped file changed.**

Three findings, and only the third was work:

1. **`DESIGN.md` never said "sealed".** There was no vocabulary to replace — only one missing.
   `driver-owned` appeared seven times and was defined nowhere. New §6.1 defines both terms,
   tabulates what backs each, and records why there is no third class.
2. **Both tests A2 asks for already existed.** `test/guard.test.mjs:196–202` proves a
   driver-owned path denied to a run and allowed to an operator; `describe('allowed:
   protected-state neighbours')` proves the benign neighbour; and
   `test/plugin-manifest.test.mjs:114–122` already proved the read route stays open. Not
   rebuilt. `Task` was added to that exclusion list, because A2's own argument names it as a
   read route and stopping at `Read`/`Glob`/`Grep` is the enumeration the item warns about.
3. **§1.1 was claiming a discipline as a fact.** "It does **not** receive the build log,
   iteration history, or any hint that an agent wrote the code" reads as enforced and is not: a
   read-only reviewer in a repository containing `.dare/briefs/iter-003.md` can open it. Now
   labelled *not supplied* with the framing argument that actually carries the weight. This is
   the highest-value application of the new vocabulary and it was not on the item's list.

## A3. Held-out oracle — **DEFERRED. Sequencing, not impossibility. See `BORROWED.md` R13**

The hole is real, and this is still the only item aimed at it. The cold reviewer fixed the
*review* half of self-judgment; the builder continues to author the tests the ratchet is built
from, and the ratchet protects ids rigorously while having no opinion on whether those ids were
worth having.

Three obstacles were found in the code. Two have fixes. **The third was overstated when this brief
was first revised, and is recorded corrected.**

1. **The builder owns the runner.** The unit gate is `npx vitest run --reporter=json`
   (`toolchains/node.mjs:52`), resolving the project's config, which the builder writes. A suite
   collecting zero tests is indistinguishable from one that passed, and `integrity.mjs` catches a
   no-op npm script but does not read an `exclude` glob. **Fix:** the driver-owned test invocation
   B2 now carries as a requirement.
2. **The regression path leaks it.** `driver.mjs:1130–1138` puts regressed ids verbatim into the
   next Build Brief. **Fix:** an oracle regression names the **PRD requirement** it covers, never
   the test id. The objective stays actionable and discloses nothing.
3. **Reads cannot be sealed** (A2) — **and this matters far less than it first appeared.**
   Reading the oracle at runtime means writing a test that dumps it, waiting for gates that run
   only after the builder child has exited, getting the content into a gate failure `detail`, and
   reading it back in the next iteration's brief. That is a deliberate two-iteration exfiltration,
   visible in the diff, which a cold reviewer reads.

   **The threat model here is satisficing, not sabotage.** Every defence in `DESIGN.md` is aimed
   at a model taking the cheapest path to green, not at an adversary. Against satisficing, an
   oracle the builder was never handed is entirely sufficient. State that wherever the seal is
   claimed: it stops building-to-the-test; it does not stop exfiltration, and it does not need to.

**Why it is deferred regardless: the loop has never finished a run.** `HANDOFF.md` records both
real attempts dying in iteration 1 with `passing: 0` — the ratchet was never reached and the panel
never ran. A seventh phase bolted onto a pipeline that has not once completed is a guess stacked
on a guess. Do D2 first; then this is a considered addition with a baseline to compare against.

Ordered after the dogfood runs, and still dependent on B2's new operation. Section E's cap of one
new persona is spent here and nowhere else.

## A4. Safety monotonicity — pinned security elements — **DONE (0.29.0)**

From `BORROWED.md` (SCAFFOLD-CEGIS, arXiv 2603.08520): security degrades *gradually across
iterations* through spec drift; 43.7% of ten-round chains ended more vulnerable than baseline;
adding a static security gate made it worse, 12.5% → 20.8%, because static rules cannot see
removed defensive logic or weakened exception handling. **The citation was checked against the
abstract and every figure is accurate.** The premise is sound.

Implement:

- when the security reviewer cites a defensive element with `file:line`, record it as a pinned
  security element in driver-owned state
- each iteration, cheaply re-verify pinned elements still exist — grep for the guard, do not
  re-run a full audit
- a pinned element that disappears takes the same path as a dropped test id: hard reset,
  regression objective, nothing else proceeds
- prefer an identity that survives reformatting — normalised snippet, symbol name, content
  hash — and document what happens when re-verification is ambiguous

> **Correction — A4 needs a quarantine path and the original gave it none.** A3 gets one; A4
> is the item that needs it more. Re-verification is a substring search over code the builder
> may reformat at any chaos level above 1. "Ambiguity is a fail" then converts a formatter run
> into a hard reset plus a regression objective the builder **cannot satisfy** — it is told to
> restore something that was never removed, and under monotonicity a false pin is unremovable.

**Decided 11 August 2026 — the authority that pins is the authority that unpins.**

An ambiguous re-verification does not reset. It escalates to one security-reviewer call scoped to
that single element, asking three things and nothing else: was it removed, was it moved, or can
you not tell.

- **removed** → regression. The existing path: hard reset, regression objective, nothing else
  proceeds.
- **moved** → re-pin at the new location. No reset.
- **cannot tell** → quarantine: recorded, surfaced to the operator, excluded from re-verification.

One targeted call is cheaper than a wrong hard reset by an order of magnitude, and it preserves
"ambiguity is not a pass" — quarantine is not a pass, it is a *recorded loss of protection*.

**Quarantine is not free.** A run may not reach `SHIPPED` while any element is quarantined. That
converts dropped protection from something a run absorbs silently into something it has to
resolve, and it is the whole difference between this and a threshold that drifts.

The builder cannot reach any of it: the reviewer is a separate cold child, and the state is
driver-owned under A1.

**Landed 0.29.0 in full**, mechanism and wiring. `scripts/pins.mjs`, `.dare/pins.json`, a new
`security-escalation` phase in `PHASE_PERMISSIONS`, `DESIGN.md` §4.3. 47 unit tests on the
mechanism plus 8 on the driver wiring.

Four decisions the item left open:

- **Identity is the whitespace-normalised snippet, searched across the whole file** rather than
  at the recorded line. A guard that moved down eighty lines, was reindented or re-wrapped
  verifies for free — which is what makes running the check every iteration affordable, and
  what stops a prettier pass costing a hard reset. A rename or a flipped comparison still
  breaks the match, deliberately: those are edits to the guard, and a normaliser clever enough
  to see through them would see through its removal too.
- **The cheap check may never answer "removed".** It returns `present` or `ambiguous` only,
  because it genuinely cannot distinguish a deleted guard from a rewritten one. Only the
  scoped reviewer decides, which is what keeps "the authority that pins is the authority that
  unpins" true in code rather than in prose.
- **Fail-closed is `unknown`, not `removed`.** An unparseable escalation quarantines. Treating
  it as a removal would hard-reset the tree over a parsing failure and hand the builder an
  unsatisfiable objective — and quarantine is not a pass, so nothing ships over it either.
- **A run with pins it cannot re-verify aborts** rather than carrying them forward unchecked,
  because an unverified pin reports the same clean pass as a verified one.

## A5. Mutation testing — **DONE (0.31.0)**

The most load-bearing DoD claim is "tests assert real values, not truthiness," currently
enforced by a reviewer *reading* tests — an LLM judgment costing a full iteration when it
fires. Mutation testing is the deterministic form. Stryker for Node; explicitly unsupported
elsewhere. Surviving mutants on changed code fail the gate.

> **Correction — this is a new gate *kind*, not a new toolchain operation.** Gates are
> `{ name, command, required }`, run flat by `runGates`, one verdict per iteration. Both
> scoping options need something the model does not carry: "changed files only" needs the diff,
> which no gate receives; "only when otherwise green" needs conditional ordering, which the
> runner does not express. Surviving-mutant counts also vary with which files changed, so the
> verdict is not monotonic the way the rest of Phase 3 is.

**Decided 11 August 2026 — a second gate pass, not a new operation shape.**

- `GATE_OPERATIONS` runs unchanged, and a failure there costs nothing extra.
- A **conditional pass** runs only if every gate in the first pass passed. That is the whole of
  the ordering change.
- The operation context gains the changed-file list, so a gate can scope itself. Measured against
  the last **ratchet-advancing** commit rather than the last iteration — otherwise a regression
  iteration mutates nothing and the gate reports a clean pass on an empty set.
- Mutation results stay **out of the ratchet**. It is a pass/fail gate producing no test ids, and
  surviving-mutant counts are not monotonic the way ids are.
- `notApplicable` already covers a toolchain that cannot do it, so nothing new is needed there.

A5, A3 and RED evidence are complementary, not redundant: RED proves a test failed once,
mutation proves it is sensitive to the code, the oracle proves it was not written to fit the
implementation.

**Landed 0.31.0, and one finding changes the item.** `CONDITIONAL_GATE_OPERATIONS` in
`toolchains/index.mjs`, a `mutation` operation on the Node adapter, `changedSince` and
`writeMutationConfig` in the driver, `DESIGN.md` §4.4. 13 new tests.

**The finding: "surviving mutants fail the gate" is not achievable through Stryker's CLI, and
the item's plan would have shipped a gate that could never fail.** Verified against Stryker
9.6.1 rather than assumed, because B3's lesson applies to any binary:

- `stryker run --help` exposes `--dashboard.*` but **no `--thresholds.*` flag at all**.
- `thresholds.break` defaults to `null`, which means a run with surviving mutants **exits 0**.
- Measured on a fixture: two survivors, `--mutate src/add.js`, **exit 0**. The same fixture with
  a config carrying `break: 100` exited **1**, naming the reason.

So the gate's failure condition lives in a *file*. Had that been the project's `stryker.config`,
**the builder would own whether the gate can ever fail** — which is defect 1 of A3, arriving
through a different door. `stryker run` takes a config path positionally, so the driver writes
`.dare/stryker.config.json` and passes it, and §6 puts it beyond the builder's reach.

Everything else landed as decided. Two additions the item did not specify:

- **Tests are excluded from `--mutate`.** A mutated test is an oracle turned into a lie.
- **An empty changed-file set declines with a reason rather than running.** Mutating nothing
  exits 0 and reads exactly like a run in which every mutant died.

Every argv element was executed before it was written down: `run <configFile>`, `--testRunner`,
`--mutate` with a comma-separated pair, `--reporters`, `--logLevel`.

**Not verified: provisioning.** The command assumes `@stryker-mutator/vitest-runner` is present
in the target project. Nothing installs it — unlike Playwright browsers, which have a
provisioning path. On a project without it the gate fails on a missing plugin rather than on a
defect, which is the `e2e`-forever-red failure B5 fixed for a different gate. **This is the
first thing to fix before arming mutation on a real run.**

## A6. Assertion quality, in `integrity.mjs` — **DONE (0.21.0)**

Ban truthiness-only assertions in generated code. Enforces the existing `CLAUDE.md` standard
deterministically and instantly, and pairs with A5: this catches the lazy shape, mutation catches
the ones that look fine but prove nothing.

> **Correction.** The original said "ESLint rule for Node," which has no delivery path.
> `integrity.mjs` exists precisely because **the builder writes what `lint` means**, and it
> deliberately refuses to allowlist tools. A rule shipped into the project's linter is a rule the
> project's linter can be configured not to run, and the check would be negotiable by the thing it
> constrains.

Put it in `integrity.mjs`, where dare runs the check and the project's configuration is never
consulted. That module already walks the tree (`nocheckedFiles`) and already has the right
philosophy — deny the known cheat, do not allowlist the known tool.

Match only the unambiguous shapes, for the reason stated in that module's own header: an
unfamiliar assertion helper must not fail a correct repository.

- `toBeTruthy()`, `toBeFalsy()`, `toBeDefined()`, `toBeUndefined()`, `toBeNull()` as the entire
  assertion
- single-argument `assert(x)` and `assert.ok(x)`

Zero dependencies, consistent with hard constraint 1. **Rename the item wherever it is
referenced** — it is not a lint rule, and calling it one is what produced the delivery problem.

**Landed 0.21.0.** `weakAssertions`, `blankComments` and `truthinessAssertions` in
`integrity.mjs`; `DESIGN.md` §4. 31 new tests, every deny paired with a benign neighbour.

Three scoping decisions the item did not make, each of which is a false-positive class closed:

- **Comments are blanked before matching, newlines preserved.** Otherwise the gate fails any
  file *describing* the rule — including `CLAUDE.md`-adjacent test files and this repository's
  own — which is the most irritating possible false positive: correct code, failed for
  obeying the rule out loud.
- **Application source is not scanned.** `assert(config)` outside a test is a runtime
  invariant, not a claim about a result. Only `*.test.*` / `*.spec.*` files and files inside
  `test`, `tests`, `__tests__`, `spec` or `e2e` directories are read.
- **The argument list is parsed with balanced parentheses, not a regex.** `assert(a, b)` is
  two arguments and left alone as specified; `assert(list.includes(x))` is one and is caught.
  A regex stopping at the first `)` would have missed the commonest real shape, which is the
  difference between a check that works and one that fires only on its own examples.

`.not.toBeNull()` is included with the bare form. It asserts existence rather than a value,
which is the property the item is about, and it is equally unambiguous.

## A7. Property-based tests in the builder contract — **DONE (0.22.0)**

One line in `templates/builder-system.md` requiring property-based tests where the domain
admits them. Generative tests are structurally harder to satisfice than example tests. Template
change only; do not build a framework.

**Landed 0.22.0** as one short section, "Properties, where the domain has one", placed between
the assertion rule and RED-before-GREEN because it is the same argument one step further on.
It names four invariant shapes — round trip, ordering, bound, idempotence — rather than
gesturing at "properties", since a builder handed an abstraction writes an abstraction.

Two guards, both tested. **No library is named** — `fast-check` and friends are asserted absent,
because naming one makes a build depend on a package this plugin does not install and cannot
gate. And **"where there is no invariant, do not invent one"**, without which the instruction
reads as "always write properties"; a property over a domain with no invariant is an example
test with extra machinery, and the ratchet then makes it permanent.

## A8. Requirement-level monotonicity — **PARTLY DONE (0.29.0); the carry optimisation deferred**

Once a cold reviewer passes a requirement with evidence, record it keyed to that evidence
location. Re-review only when the evidenced file changes; otherwise carry the prior cold pass
forward. Same mechanism as the test ratchet and A4 — a third monotonic property — so build it
alongside A4 and share whatever shape that produces.

Invalidation is conservative and fail-closed: any change to the evidenced file unpins;
a missing or unresolvable evidence target is a **fail**, never a carried pass; ambiguity unpins
rather than carries; the full panel still runs before a `SHIPPED` verdict. Pinned requirements
are driver-owned. The Ralph design where the *builder* marks its own stories complete is
exactly what this must not become.

> **Correction — the cost premise was false.** The original said Dare "re-litigates every
> requirement at full cold-panel cost, every iteration." Phase 5 sits behind
> `if (!gateOutcome.ok) continue` (`driver.mjs:1158`) and behind the ratchet's reset and reject
> paths. An iteration that fails a gate never pays for a reviewer.
>
> Per `HANDOFF.md` no run has ever reached the panel **twice**, so the original DoD line
> "the measured effect of requirement pinning on review cost" cannot be satisfied — there is no
> baseline. That line is struck below. A8 may still be worth building on the argument that
> review *becomes* the dominant cost on a long run, but that is a prediction, not a measurement,
> and it should be labelled as one until a run demonstrates it. **Consider ordering A8 after
> the D2 dogfood runs, which are what would produce the baseline.**

**Partly landed 0.29.0, and the split is deliberate — say so loudly rather than claiming A8.**

*Built and tested:* the shared pinning mechanism (built alongside A4 as instructed), the store,
`pinRequirement`, `verifyRequirementPin` with its three answers, invalidation on any change to
the evidenced file, and **the fail-closed half — a requirement whose evidence target no longer
resolves overrides the panel's verdict downward to `fail`**, which is the only direction a pin
is ever permitted to move a verdict.

*Not built:* asking the panel only about un-carried ids. That is the saving, and it is the half
this item's own correction says to order after the dogfood runs. Three reasons, all from the
correction: the cost premise was false, no run has reached the panel twice so there is no
baseline, and "review becomes the dominant cost on a long run" is a prediction. Wiring an
unmeasured optimisation into the one phase that decides whether a run ships is the wrong trade
while the measurement is a refused item away.

**Consequence for the definition of done:** the line "a cold-reviewer-passed requirement is not
re-litigated until its evidence changes" is **not met**. The line "an unresolvable evidence
target fails rather than carries" **is** met.

## A9. An assumptions log — **DONE (0.30.0); its tier-3 check written and not run**

Where the PRD or Build Brief is ambiguous, the builder may not silently pick an interpretation.
It must record the assumption to a driver-owned, append-only log, which is then supplied to the
reviewer, who can check "you assumed X, the PRD says Y." An unstated assumption is a thing that
defaults to pass.

> **Correction — the builder has no channel to append on, and this is not "one template line
> plus one file."** Its only return path is its final message, and `builder-system.md:7–11`
> constrains that to one or two lines with an explicit "do not summarise, do not report
> status." A9 needs structured assumptions on that same channel, parsed fail-closed. That is a
> **new output contract for the builder** — by `CLAUDE.md`'s own rule, a contract whose
> behaviour another binary owns, so it needs a tier-3 live check — and it contradicts a template
> rule that exists for a reason.

**Decided 11 August 2026 — an assumption must cite what was ambiguous.**

`lessons.mjs`'s header records the failure this item shares: "a model asked that question will
always produce something, and a store full of confident generalities is worse than an empty one,
because it gets injected into every later brief." An assumptions log is worse than that, because
it reaches the **reviewer**.

So it takes the same bar `validateLesson` already sets by rejecting a lesson with no trigger:

- the builder may emit one fenced JSON block alongside its one or two lines
- each assumption cites the PRD id or the brief line that was ambiguous. **An assumption citing
  nothing is discarded, not recorded.**
- a malformed block fails the iteration; an absent block is fine, and will be the common case
- the driver appends to the log; the builder never writes the file

On the template conflict: "do not declare completion" exists to stop the builder **assessing its
own work**. Declaring an ambiguity is not an assessment. State that distinction in
`builder-system.md` rather than adding a second instruction that argues with the first.

A new output contract whose behaviour another binary owns, so it needs a **tier-3 live check**.

**Landed 0.30.0.** `scripts/assumptions.mjs`, `.dare/assumptions.json`, a new section in
`builder-system.md`, the log rendered into every reviewer prompt, `DESIGN.md` §8.3. 41 tests.

The correction was right about the shape and the cost. Three things it did not specify:

- **An uncited entry is discarded and the discard is *counted and announced*.** "Discarded, not
  recorded" alone would have made the log shed entries silently, which reads exactly like a log
  nothing was written to — the same defect the Build Brief's caps exist to avoid.
- **A malformed block fails the iteration *before* the panel is called.** A test asserts the
  reviewer is called **zero** times on such an iteration: the driver already knows it cannot
  trust that output, and paying for a cold read on it spends the most expensive call in the
  loop on a known-bad input.
- **The example in the template is fed through the real parser**, as `reviewer-system.md`'s
  already is. Otherwise every obedient builder fails its iteration on the exact block it was
  told to emit.

The template conflict was resolved as directed — the distinction between declaring an ambiguity
and assessing the work is stated in `builder-system.md` itself, and a test holds it, so a later
reader does not resolve the apparent contradiction by picking one.

**The tier-3 check is written and has not been run.** `test/live/assumptions-contract.live.test.mjs`
covers the two failure modes tier 1 cannot see: a builder emitting prose instead of json, and a
builder emitting a block on *every* iteration because being asked implies an expectation. The
second is the one that matters, since it fills the reviewer's context with generalities. Exact
command, ready to run:

    DARE_LIVE=1 npm run test:live

Expect a few cents. If the block appears where nothing was ambiguous, the fix is the template,
not the parser.

---

# B. Portability

## B1. Project capability manifest — **DONE (0.11.0, 0.12.0)**

`scripts/capabilities.mjs`, `.dare/capabilities.json`, declared ∪ detected, closed vocabulary,
`UNDETECTABLE` recording why `library` has no detector. `DESIGN.md` §3.7, `HANDOFF.md` item 1.

The original proposed a `testKinds` field. The repository derives gate requirements from
capabilities plus toolchain instead, which is better — `testKinds` would be a third source of
truth for the same fact. Do not add it.

**`PRODUCT.md` reconciliation — DECIDED 11 August 2026.** Split by question, not by file.

- `.dare/capabilities.json` owns what the software **does**: closed vocabulary, arms gates,
  driver-owned, machine-read.
- `PRODUCT.md` owns who it is **for** and how it should feel: users, mode, brand voice,
  anti-references. Prose, impeccable's, lives in the target repository.

No fact appears in both. Strip anything capability-shaped out of `PRODUCT.md` and out of
`architect.md`'s instruction for writing it. One rule to add to `DESIGN.md` §5.1: **nothing that
decides pass or fail may read `PRODUCT.md`** — otherwise it becomes a second, prose-shaped source
of gate truth that no test covers and no vocabulary constrains.

**B1-residual landed 0.27.0.** Two findings and one real deliverable.

- **There was nothing to strip.** `architect.md`'s `PRODUCT.md` row already read "users, mode,
  brand voice, anti-references" and named no capability, no stack and no gate. The overlap the
  item anticipated had never been written. It is now *asserted* rather than merely true: a test
  extracts that row and checks it against `CAPABILITY_ORDER`, so the drift is caught the day
  someone adds "and say whether it has a web UI".
- **Nothing in `scripts/` reads `PRODUCT.md` either** — verified by grep before writing
  anything, and now held by a test that walks the whole tree, in the same shape and for the
  same reason as §7.1's no-reader test for the run manifest. That test *is* the deliverable:
  the rule was previously unstated and unenforced, and a rule of the form "nothing may read
  this" is exactly the kind that is true until the first time it quietly is not.
- The rule itself is written into `DESIGN.md` §5.1 with the argument that makes it more than
  tidiness: `parseCapabilityDeclaration` refuses a word outside the ten, and prose refuses
  nothing. A gate reading `PRODUCT.md` would be a second source of gate truth in the one format
  no validation can constrain.

## B2. Toolchain adapter abstraction — **DONE (0.15.0)**

`scripts/toolchains/{index,node,shared}.mjs`. The driver no longer knows `npm run build`,
`npm run lint`, `npm run typecheck`, `npm audit`, Vitest or Playwright syntax. A test asserts
the full argv, not just the operation names, which is what made "behaviour-neutral" checkable.
`DESIGN.md` §3.8, `HANDOFF.md` item 2.

> **New requirement folded in from A3:** the contract needs a driver-owned test invocation —
> a suite the driver runs with its own config, not the project's. Nothing else in the brief
> needs it; A3 cannot work without it.

## B3. First-class .NET support — **DONE (0.32.0)**

`dotnet` is absent from this machine, re-checked 11 August 2026. `HANDOFF.md` warns
specifically that the toolchain registry now makes a wrong adapter **easy to add and green** —
every structural test passes on argv nobody has ever run.

The original said "verify actual command syntax against locally available tooling before
hard-coding it." There is none. It then required ".NET is a first-class supported toolchain" in
its definition of done. Those cannot both hold here.

**Do one of two things, and say which:** install an SDK first, or write the adapter with every
command explicitly marked unverified, record that in `HANDOFF.md`, and leave it out of the
definition of done. Do not let unverified command strings acquire the appearance of tested ones.

**The first: an SDK was installed.** dotnet 8.0.423, SDK 8.0.423, runtimes 8.0.29, at
`/usr/bin/dotnet`. **Every command in `scripts/toolchains/dotnet.mjs` was executed against it
before it was written down**, on a scaffolded solution with a class library and an xunit test
project. `DESIGN.md` §3.8 and the new §3.8.1. 18 tests on top of the contract tests, which
applied to the adapter automatically the moment it joined `TOOLCHAINS` — exactly as
`HANDOFF.md` item 2 predicted.

**Two commands would have been wrong, and only running them said so.**

- **`dotnet list package --vulnerable` cannot fail.** Given `System.Net.Http 4.3.0` it printed a
  **High** advisory (`GHSA-7jgj-8wvc-jh57`) and **exited 0**. As the `security-audit` gate it
  would have reported a clean pass on every vulnerable .NET project forever. This is §4.4's
  Stryker finding reached independently through a different tool — which says the class is
  common, and that **any new adapter's audit step should be assumed guilty until seen to exit
  non-zero.** What works: `dotnet restore --force -warnaserror:NU1901,NU1902,NU1903,NU1904`,
  verified exit 1 with `error NU1903` and exit 0 once the package was removed.
- **The near-miss is the more instructive half.** The first attempt used
  `-p:WarningsAsErrors=NU1901,…`, which MSBuild rejects with `MSB1006` — **and that rejection
  also exits 1.** It was briefly read as the audit firing. What caught it was running the
  *clean* project and getting a failure there too. A deny case alone proves nothing.

Three operations are declined by name rather than guessed: `types` (the compiler subsumes it),
`e2e` (the SDK ships no browser runner) and `mutation` (Stryker.NET is a separate tool, not
installed, **not verified — so not written**).

**One thing is now ambiguous and was not before.** `detectToolchain` returns the first match, so
a repository with both a `package.json` and a `.csproj` — a .NET service with a JS frontend, a
common shape — resolves to **node**, and nothing says so out loud. §3.8 predicted this exact
moment and named the fix: the architect declares the toolchain and detection confirms, as
capabilities already do. **That declaration is not built.** It is the residual of this item.

## B4. Normalised test reporter registry — **DONE for Node (0.14.0) / OPEN for .NET**

`scripts/reporters/` holds `shared.mjs`, `vitest.mjs`, `playwright.mjs` and `index.mjs`.
Ratchet logic knows nothing about either runner. Unidentifiable throws, malformed throws, an
unknown status throws, empty does not. `DESIGN.md` §11, `HANDOFF.md` item 3.

`trx.mjs` and `junit.mjs` are outstanding and blocked with B3. When adding them: do not weaken
the throwing behaviour to accommodate a new format, and preserve stable test identity across
runs wherever the source framework permits.

## B5. Capability-driven gates — **DONE (0.16.0)**

`scripts/gate-policy.mjs`, a table with a written reason per entry. Only `e2e` and
`observability` are conditional, and a test asserts that list as a whole. An unknown gate runs.
`DESIGN.md` §4.2, `HANDOFF.md` item 5.

### Retire the impeccable special case — **DROP**

> **Reason.** `HANDOFF.md` item 1 records this as a decision **re-taken after** the capability
> model landed: the §5.1 carve-out asks "is there something to inspect", which is a question
> about the tree, and a declared `web-ui` that has not been written yet is still nothing to look
> at. Arming impeccable from a declaration means failing a gate for the absence of something the
> project does not have yet — which is the exact failure mode `gate-policy.mjs`'s own header
> says the table exists to prevent. The original brief listed this as tidying and it is not.

## B6. Per-toolchain builder guidance — **OPEN**

Adapters carry *commands*; nothing carries *idioms*, and a .NET builder needs different ones
than a Node builder — project layout, naming, test conventions, common build failures. A small
guidance fragment per toolchain, selected by detected toolchain, injected into the Build Brief.
Explicit files, no framework, no new personas, no per-language reviewer agents.

Blocked in practice behind B3: there is only one toolchain to write guidance for today, and a
one-entry table is not yet a seam.

---

# C. Reliability

## C1. Race candidate selection by change magnitude — **DONE (0.13.0)**

`parseNumstat` over `git diff --numstat`; `selectWinner` sorts lines changed, then files
changed, then candidate index — the original brief's ordering, verbatim. A binary file counts
as a changed file with zero changed lines, recorded in `DESIGN.md` §13.6 and in a test rather
than papered over. `HANDOFF.md` item 6.

## C2. Run manifest — **DONE (0.17.0)** / per-run archiving — **DONE (0.28.0)**

`scripts/run-manifest.mjs` writes `.dare/run.json` once after the design phase. There is
deliberately no reader function and a test greps `scripts/` for one, so no code path can
consult the contents. `DESIGN.md` §7.1, `HANDOFF.md` item 7.

Archiving prior runs is still worth doing — it is what makes the manifest forensic rather than
merely current.

**Landed 0.28.0 — and the correction below is itself wrong, which is the finding.**

The item forbade designing this before saying what is actually lost. Saying it took reading
`driver.mjs:866`, and the answer contradicts both accounts on this page.

**`progress` is initialised to `{ iteration: 0, … }` in memory at the top of every run.** It is
never loaded from `state.json`. So `iterationNumber` restarts at 1 each run, and
`writeBrief(dareDir, 1, …)` writes `.dare/briefs/iter-001.md` **over the previous run's**.
Briefs do not accumulate across runs; **they collide, one file at a time**, and the loss is
silent because the replacement looks exactly like the original. The original brief's claim
("state is replaced per run") is false, and the correction's replacement for it ("briefs
accumulate under `.dare/briefs/`") is also false. What is carried forward is `state.json`,
`lessons.json`, `red-evidence.json` and `bloopers.log`. What is destroyed is `run.json`,
`reality-check.md`, and the briefs.

`archivePreviousRun` in `run-manifest.mjs` moves those three to `.dare/runs/NNN/` before this
run writes anything. `DESIGN.md` §7.2. Four decisions:

- **Numbered, not timestamped** — no clock in that module, sorts correctly, survives a machine
  whose clock moved. Slots come from the highest existing number rather than a count, so
  deleting `runs/001` cannot make a later run land on `002`.
- **It moves, it never reads.** `renameSync` does not open the file, so §7.1's no-reader
  guarantee is intact — which is also why the function lives in that module, where the reason
  is written down and the no-reader test already excludes it.
- **Failure to archive fails the run**, on §7.1's own argument: the alternative is destroying
  the previous run's evidence and continuing.
- **The test reports are not archived.** They are rewritten every *iteration*, so keeping the
  last one preserves an arbitrary moment while implying it was the run's.

> **Correction.** The original justified it with "`.dare` state is currently replaced per run."
> That is false. `state.json` is loaded and carried forward — it is how the ratchet survives a
> run boundary — and briefs accumulate under `.dare/briefs/`. Only `run.json` is overwritten.
> The idea stands; the stated reason does not. Say what is actually lost between runs before
> designing where to put it.

## C3. Live integration verification — **DONE (0.18.0)** / .NET line **BLOCKED**

Three tiers, separately runnable: `npm test`, `npm run test:integration`, `npm run test:live`.
Tier 3 fails when unarmed rather than skipping. `DESIGN.md` §11.1, `CLAUDE.md` "Test gates",
`HANDOFF.md` item 8. Covered today: CLI argument construction, environment propagation,
allowed-tools, dangerous mode, hook behaviour, worktree race lifecycle, generated-app health
probe.

The .NET command check is blocked with B3. **A9's builder output contract is a new tier-3
candidate** — add it when A9 lands.

## C4. Context budget check — **DONE (0.20.0)**

Dare assembles Build Brief + PRD + design docs + retrieved lessons + conditional history, and
that input grows across iterations with nothing checking it. This is the repository's
characteristic bug class: silent degradation, no failure signal, the builder quietly worse by
iteration 12. Measure the assembled prompt before spawn. Fail loud, or trim by an explicit
documented policy. **Do not trim silently.**

Cheapest real win in this brief: no invariant conflict, nothing depends on it, and it attacks a
named failure mode. **Ship it first.**

**Landed 0.20.0 — fail loud, never trim.** `scripts/context-budget.mjs`, called inside
`spawnClaude` before the child exists, so every phase passes through it and an oversized prompt
costs nothing. `DESIGN.md` §3.9, config key `contextBudget.maxCharacters` (default 400,000).

Four decisions the item did not specify:

- **Characters, not tokens, and said so.** No tokenizer exists here and hard constraint 1
  forbids adding one. An estimate would read as a measurement; §7.1 already refuses `"unknown"`
  in a manifest for that reason. The count is exact and tracks unbounded growth exactly.
- **No trimming at all, rather than a documented trim policy.** On inspection every list in the
  brief is already capped and already announces its omissions. The one uncapped input is raw
  gate output in a failure `detail`, and trimming that means silently choosing which half of a
  compiler error the builder reads. A truncated prompt is a different task, handed over without
  saying so.
- **No `enabled` flag.** Raising the ceiling is a decision an operator makes; switching the
  check off is a way of not making one, and belongs with the thresholds section E rejects.
- **`childStartLine` now prints the measured size on every child.** The budget catches a
  runaway; that line catches the slope leading to one, and it was free.

One defect found by its own tests: `options.limit ?? DEFAULT` accepted `null` as "nothing to
say" and silently applied the default. Now `=== undefined`, so `null` reaches validation and
throws.

## C5. Differentiated race candidates — **OPEN**

From `BORROWED.md` R9. The race already compiles a brief per candidate, and that brief already
tells each one *"Another candidate is trying a different one"* (`brief.mjs:182–184`). Nothing
makes that true. Every candidate receives the same objective and differs only by sampling, and
the field that would carry a difference — `raceCandidate` — carries `{ index, of }` and nothing
else. The seam is built and empty.

Widen it to carry one distinct hypothesis per candidate about why the previous iteration
stalled, generated once when the race is triggered, and render it in the brief.

What must not move, and this is why the item is cheap:

- selection stays `selectWinner` — gates, then regressions, then `parseNumstat`, then index. No
  model adjudicates a race it had an opinion about.
- a hypothesis is a **prompt, not a criterion**. It never reaches a gate, the ratchet or a
  reviewer, and no candidate is judged against the hypothesis it was given.
- candidates still gate against the main tree's capabilities and ratchet (§13.6).

**Ordered behind a live test of the race's builder half.** `HANDOFF.md` records the git half as
covered by tier 2 and a real `claude -p` child inside a worktree as never exercised. Improving
an untested mechanism is how you end up unable to say which half broke.

---

# D. Validation

## D1. Full suite and new invariant tests — **OPEN**

All existing tests pass. New focused tests for every invariant added.

## D2. Dogfood against real sacrificial projects — **OPEN, and the most valuable item here**

Never exercised end to end. `HANDOFF.md` item 9. Both earlier runs died in iteration 1 with
`passing: 0`, so the ratchet was never reached — give the regression scenarios enough budget to
reach a second iteration. **Do not substitute another pile of mocks for this phase.**

- **Case A — Node web/API.** "A simple link shortener with an admin analytics page."
- **Case B — Node with persistence.** "A small task management SPA with local or database
  persistence."
- **Case C — .NET.** *Blocked with B3.*
- **Case D — deliberate rejection.** An implementation that must fail a required PRD/DoD item.
- **Case E — deliberate regression.** Force a previously passing test to fail.
- **Case F — security regression.** Depends on A4; run it only once A4 has a quarantine path.

**D, E and F are worth more than the rest of this brief combined.** The ratchet, RED evidence
and fail-closed review are the reason the design exists, and none has met reality. A CLI or
library target can now actually finish (0.16.0), so the scenario set need not all be web.

If Claude usage cannot be consumed here, prepare reproducible dogfood scripts and document
exact commands, expected states and evidence to collect. **Do not claim end-to-end validation
occurred unless it did.**

**Prepared 11 August 2026 in `DOGFOOD.md`, and NOT RUN. No end-to-end validation occurred.**
Cases A, B, D, E and F each carry a shell script, the exact command, the terminal state that
counts as success, and the `.dare/` artifacts to collect. Case C stays blocked with B3. Five
artifacts worth watching did not exist when this item was written — prompt size per child,
`pins.json`, `assumptions.json`, the mutation gate and `runs/NNN/` — and each is listed with why
it is unproven.

One expected failure is documented rather than left to be discovered: **the mutation gate will
fail on any project without `@stryker-mutator/vitest-runner`, because nothing provisions it.**

---

# E. Preserve — **unchanged, and consistent with the repository**

Do not redesign unless repository evidence proves them broken: fresh Claude child per major
invocation; deterministic driver lifecycle; Build Brief context compilation; sparse
driver-owned lesson memory; cold reviewer processes; reviewer ownership; deterministic gates
before LLM review; the ratchet; RED-before-GREEN; regression outranks progress; fail-closed
parsing; hard budget limits; explicit terminal states; stalled-only race; conditional git
history; builder-only dangerous permission bypass; reentrancy protection.

Do not add: a persistent giant conversation; vector databases; semantic memory infrastructure;
Kafka; distributed orchestration; generic workflow engines; MCP dependencies for core
execution; more agent personas beyond A3; a consensus parliament; agent swarms by default;
another framework layered over Dare.

**Explicitly rejected:** self-improving gate thresholds that adapt from historical performance.
Thresholds that learn can drift downward, which makes gates negotiable by the thing they
constrain — the same category of error as letting the builder edit `state.json`.

**Also explicitly rejected: a hypothesis agent over the objective.** The pattern — an LLM
proposing what to try next, an agent running the experiment and folding the result back into the
next proposal — is real, published, and works: FunSearch and AlphaEvolve are the lineage,
QuantEvolve and HypoAgents the current expressions (`BORROWED.md` round three). It does not
belong here, for two independent reasons, either of which is sufficient.

*The target does not move.* A hypothesis loop discovers its objective function. Dare's is
declared in the PRD and is the thing every invariant exists to hold still. A loop permitted to
hypothesise about what it is building is Ralph's builder-marks-its-own-stories hole in better
vocabulary.

*Evaluation is the expensive half.* Hypothesis search is justified by thousands of cheap
evaluations — a backtest costs nothing and runs overnight. Here one cold reviewer was measured
at $0.83 and 124 seconds, gates shell out to real toolchains, and `maxIterations` is 25. At
n=25, hypothesis search is a slower race. The two mechanisms worth taking from the pattern are
C5 and F4, and both are prompts rather than architecture.

---

# F. Template changes

## F1. Surgical-change discipline — **DONE (0.25.0)**

- every changed line must trace directly to the current objective
- do not "improve" adjacent code, comments, or formatting
- match existing style even where you would do it differently
- remove orphans *your* change created; do not remove pre-existing dead code — mention it
- minimum code that solves the problem: no speculative abstraction, no unrequested
  configurability, no error handling for impossible states. If 200 lines could be 50, write 50

> **Correction — this contradicts the chaos dial as written.**
> `templates/builder-system.md:132–141` sets scope by `chaos`: 1 surgical, 2 related refactors
> allowed, 3 restructure freely. "Every changed line must trace directly to the current
> objective" is chaos 1 stated unconditionally. Landing it verbatim makes chaos 2 and 3 dead
> configuration, or produces a template that argues with itself two paragraphs apart.
>
> **Land it as the chaos-1 text**, sharpening a level that already exists, and let 2 and 3 keep
> their looser wording — or retire the dial deliberately in its own commit. Not both.
>
> The last two bullets — orphan cleanup and simplicity-first — are chaos-independent and can go
> in the general sections, which already gesture at them under "Clean up only your own mess"
> and "Do not gold-plate either."

**Landed 0.25.0, split exactly as the correction directs.** The dial was sharpened, not
retired.

- The first three bullets are now **inside the chaos-1 entry**, and a test asserts they appear
  *before* the chaos-2 entry — so a later edit that promotes them to unconditional text fails
  rather than merely reading wrong. Two more tests assert chaos 2 and 3 stay permissive, which
  is what keeps the dial a dial.
- The two chaos-independent bullets went to the general sections as directed: "If 200 lines
  could be 50, write 50" under *Do not gold-plate either*, and *say so in your closing lines
  and leave it* under *Clean up only your own mess* — the "mention it" half the template had
  been missing entirely.
- **`brief.mjs`'s `chaosLine(1)` was sharpened too**, which the item did not mention. That
  string is what the builder reads closest to the work, every iteration; leaving it as
  "smallest viable diff" while the system prompt carried the real rule would have reproduced
  the A1a defect in a new place. A test asserts chaos 2 does *not* carry the chaos-1 sentence.

One paragraph was added that the item did not ask for: a note that only level 1 is surgical and
that at 2 and 3 the bullets are advice. Without it a builder at chaos 3, reading three
imperative bullets, has to guess which of two adjacent paragraphs wins — which is the
self-arguing template the correction warns about, arriving by a different route.

## F2. PRD right-sizing — **DONE (0.23.0)**

`templates/prd-author.md` constrains total scope but has no per-requirement size constraint,
and an oversized requirement surfaces as mysterious stalling rather than as a legible failure.

- right-sized: "add a database column and migration", "add a filter dropdown to a list"
- too big, split these: "add authentication", "build the entire dashboard", "refactor the API"

Pairs with C4 — F2 checks the input at authoring time, C4 at spawn time. No conflict with
anything in the template today.

**Landed 0.23.0** as "One requirement is one iteration's work", with both halves of the
example pair the item gives, mirroring the testable/untestable pair already in that template.

The argument was grounded in the repository rather than in taste, which the item did not ask
for but which is what makes the rule enforceable: **the reviewer returns exactly one verdict
object per id**, so a requirement covering twelve behaviours fails as one opaque `fail` and the
run cannot learn which of the twelve was missing. That is also the operational test the
template now gives the author — "can you name the observation that proves it false in one
sentence" — which reuses the falsifiability rule sitting two sections above it rather than
introducing a second, unrelated notion of size.

## F3. Goal transformation — **DROPPED as written; reduced form DONE (0.26.0)**

> **Reason.** `prd-author.md` requires "no implementation choices" and "no requirement that
> cannot be observed from outside the program," and the requirement ids **are** the panel's
> checklist — the reviewer returns one verdict object per id. F3 would rewrite
>
> ```
> PRD-2.1  An unauthenticated request to any /api/admin/* route receives 401 and no body.
> ```
>
> into "Write tests for invalid inputs, then make them pass" — an instruction to the builder,
> not an observation an auditor can falsify. Applied literally it degrades the reviewer's
> checklist into a task list, which is the Ralph hole `BORROWED.md` R8 explicitly rejects.
>
> **What is salvageable:** one line noting that a requirement phrased as an observable outcome
> arrives pre-shaped for the RED mechanism, because the test that proves it false is obvious.
> `prd-author.md` already teaches this by example. Strengthening the existing text is the whole
> of the available win.

**Landed 0.26.0 as the salvageable half and nothing more.** Two short paragraphs appended to the
existing testable/untestable example, where they strengthen text that was already there rather
than opening a new section that could drift toward the dropped version.

The second paragraph is the guard, and it is the reason this is worth committing at all: it says
in the template itself that outcomes are **not** to be rewritten into instructions, quoting the
exact transformation the original item proposed, and states that the ids are the auditor's
checklist rather than the builder's to-do list. A later reader who encounters F3's original
wording now finds the refusal already written down beside the rule, instead of re-deriving it.

Two tests, one per paragraph.

## F4. Condition lessons on circumstances — `templates/lesson-extractor.md` — **DONE (0.24.0)**

From `BORROWED.md` R10. `HANDOFF.md` records the lesson store's usefulness as unproven in a way
the tests cannot reach, and names the failure exactly: read `.dare/lessons.json` after a real run
and delete it if it has filled with generalities.

`lessons.mjs` already has the structure that would prevent that. A lesson with no `trigger` is
rejected outright — "a lesson with no trigger can never be retrieved for a reason, only injected
into everything" — and `scope` narrows it further. What is unproven is whether the extractor
fills those fields with **conditions** or with restatements of the lesson text.

Point the extractor at the circumstances rather than the repair narrative: what was true of the
tree, the objective and the gate output when this failed, such that a later iteration could
recognise the same situation. A trigger that matches everything is the same defect as no
trigger, and is harder to see because it passes validation.

Template change only. `lessons.mjs` needs no change; its validation already fails closed.

**Landed 0.24.0** as "A trigger is a condition, not a summary". `lessons.mjs` was indeed not
touched, as predicted.

The template already said triggers must be words that *literally appear* on recurrence, so the
gap was narrower than the item implies — what was missing was the **direction of the question**
and a way to check the answer. Both are now explicit:

- **The direction.** Not "what did we learn", which is already written in `lesson` and is what
  produces a keyword-shaped restatement of it. Instead: *what would I have to be looking at to
  need this?* Two worked pairs show the same lesson yielding a summary trigger and a condition
  trigger, so the difference is visible rather than asserted.
- **The check.** Test each trigger against the evidence you were handed — does the word occur
  in a test id, a file path or the error output? A trigger that does not match the failure it
  was extracted *from* cannot match that failure's recurrence. If none survive, return `null`.

The reason this is worth a paragraph rather than a sentence is stated in the template itself:
`validateLesson` rejects a lesson with **no** trigger outright, but a lesson with a trigger
matching **everything** passes validation and is then injected into every later brief. It is
the one failure in the lesson store that no code can fail closed on, which is exactly why it
had to be moved into the prompt.

---

# Implementation order

Prefer commit-worthy intermediate states. Prefer extraction to rewriting. One slice per commit —
a slice that needs a second commit was too big.

Every design decision this brief once deferred was settled on 11 August 2026 and is written into
the item. **There is nothing left to stop and ask about below the line marked tier 3.**

**Tier 1 — mechanical, no invariant conflict, land independently**

1. `A1a` the whole `.dare` tree, stated positionally, in both places that state it
2. `A2` rename the tiers to driver-owned / not supplied, and write down why sealing is impossible
3. `C4` context budget check
4. `A6` assertion check in `integrity.mjs`
5. `A7` property-based tests in the builder contract
6. `F2` PRD right-sizing
7. `F4` condition lessons on circumstances
8. `F1` surgical discipline, written as the chaos-1 text
9. `F3-reduced` phrasing note in the PRD author
10. `B1-residual` strip capability facts out of `PRODUCT.md`, add the read rule to §5.1
11. `C2-archiving` once you have said what is actually lost between runs

**Tier 2 — mechanism decided, still the largest work**

12. `A4` + `A8` together — they share a pinning mechanism — **including A4's escalate-and-
    quarantine path and the `SHIPPED` block**
13. `A9` the assumptions log, with the citation bar
14. `A5` the conditional gate pass, then the Stryker capability behind it

**Tier 3 — blocked on something other than effort**

15. `D2` cases A, B, D, E — the ratchet has never met reality and this is what fixes that
16. `A8` measurement baseline falls out of 15, if it is wanted
17. `D2-F` security regression — after A4
18. `A3` held-out oracle — after 15, and after B2's driver-owned test invocation exists. Not
    before a run has completed end to end
19. a live test of a `claude -p` child inside a race worktree, then `C5` differentiated
    candidates. `C5` is cheap; the live test is the whole cost of the item
20. `B3` + `B4-dotnet` + `B6` + `D2-C` — blocked on an SDK

**Then**

21. update `DESIGN.md`, `CLAUDE.md`, `HANDOFF.md`
22. full suite, then focused tests for every new invariant
23. final architecture audit

# Definition of done

Achievable now:

- all existing tests pass; new tests pass
- every place that tells the builder what is protected states the rule the hook actually
  enforces, positionally rather than by name
- prompt size is checked before spawn and cannot silently degrade
- lesson triggers name circumstances a later iteration could recognise, not restatements of the
  lesson text
- truthiness-only assertions fail a gate **dare runs**, not one the project configures
- the PRD author enforces right-sizing; the builder template enforces surgical diffs at chaos 1
- assumptions that cite nothing are discarded rather than recorded, and the ones that survive
  reach the reviewer through a live-tested output contract
- a removed security guard is caught as a regression; an **ambiguous** one escalates to a scoped
  reviewer call rather than resetting; a quarantined element blocks `SHIPPED`
- a cold-reviewer-passed requirement is not re-litigated until its evidence changes, and an
  unresolvable evidence target fails rather than carries
- the two classifications are `driver-owned` and `not supplied`, and the difference between an
  enforced guarantee and a discipline is stated wherever either is claimed
- mutation testing runs in a conditional gate pass, scoped to files changed since the last
  ratchet-advancing commit, and contributes nothing to the ratchet
- `DESIGN.md` describes what the code actually does
- `HANDOFF.md` accurately states what has and has not been live-tested
- no unnecessary framework or dependency inflation

Already true; verify rather than rebuild:

- Claude children cannot mutate any `.dare/**` artifact
- RED evidence cannot be forged by builders
- Node behaviour works unchanged through the toolchain abstraction
- ratchet logic consumes normalised test records, not framework-specific formats
- gates activate from capabilities instead of universal web assumptions
- greenfield projects get first-iteration guidance from declared capabilities
- race selection uses actual change magnitude
- each run produces a protected forensic manifest
- unit/integration/live test boundaries documented

Struck, with reason:

- ~~".NET is a first-class supported toolchain"~~ — no SDK; see B3
- ~~".NET tests participate in RED evidence and regression protection"~~ — same
- ~~"the held-out oracle exists, is sealed, is config-gated, and has a quarantine path"~~ —
  **deferred behind the dogfood runs**, and "sealed" is the wrong word for what it would be; see
  A3 and `BORROWED.md` R13
- ~~"sealed artifacts cannot be read by children"~~ — not achievable against a process with
  arbitrary code execution, and not needed against satisficing; see A2
- ~~"the measured effect of requirement pinning on review cost"~~ — no run has reached the
  panel twice, so there is no baseline to measure against

# Final report

1. What changed and why
2. Integrity: protected state, sealed artifacts, RED evidence, security pinning — and for each,
   whether it was built or found already built
3. Monotonic properties — tests, security elements, requirements: what is pinned, how each is
   invalidated, and **how each false pin is escaped**
4. Template changes, and any observed effect on run quality
5. Capability and toolchain model — anything intentionally unsupported, and why
6. Tests — unit, integration, live/paid if performed, dogfood runs actually performed
7. Files added and changed
8. Deferred work, with what unblocks each
9. New risks introduced
10. Remaining known weaknesses
11. `DESIGN.md` consistency — whether implementation and design now match

**Do not merely propose these changes. Implement them, verify them, and report what actually
happened.** Where an item turns out to be already built, say so and move on rather than
rebuilding it — that is what happened to eight items in the first version of this brief.
