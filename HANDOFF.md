# Verification status

The build is finished, and the architecture iteration this file used to list as deferred is
now implemented — reviewer ownership, the Build Brief, lesson memory, advisory findings,
behavioural gates, conditional history and stalled-only racing. See `DESIGN.md` for why each
one is shaped the way it is.

What follows is the one thing the test suite cannot settle: whether the pieces work against
reality.

---

## Verified live

**Guard hook fires under a real PreToolUse event.** With the plugin installed, a command
writing to the ratchet state file was denied and tagged `[dare:protected-state]`, while a
command merely mentioning the slash command in prose ran normally. Both halves matter: a
guard that blocks everything is not a guard.

**`claude -p` children spawn and return parseable output.** Verified against claude
2.1.226. `--output-format json` returns an envelope carrying `result`, `is_error`,
`total_cost_usd` and a `usage` breakdown; `parseClaudeEnvelope` reads those field names, and
budget accounting uses the reported figures rather than an estimate. A trivial prompt cost
$0.26 because of cache creation, which is why nothing here estimates.

**Children do not inherit the operator's output style.** A child asked only for a field of
`package.json` answered in the persona the operator had active. Every child is now launched
with an explicit default style — for the reviewer that is a correctness fix, since its
output is machine-parsed.

**`extractTestIds` against live reporter output.** A real vitest run with one passing, one
failing and one skipped test yielded exactly the one passing ID.

**Install path works end to end.** With the caveat that cost several hours: the install
cache is keyed by version, and stale copies masquerade as failed fixes. See "Releasing" in
`CLAUDE.md` before debugging any plugin change.

**`--allowedTools Read Glob Grep Write Edit` does permit writing.** A live child given
exactly that flag set created a file with the Write tool. The permission model was never in
doubt; see below for what actually was.

**PreToolUse hooks inherit the environment of the `claude` process.** A child spawned with
`DARE_RUNNING=1` fired a hook that read `DARE_RUNNING: "1"` from `process.env`. This is what
lets the guard tell a run from an operator, so it was measured rather than assumed.

**The guard denies live, unscripted commands.** Not fixtures: during this session it refused
a recursive `rm` whose target was an unresolved shell variable, and refused a command
touching `.dare/config.json` from inside a run.

**A cold reviewer's output parses, and an incomplete build draws a `fail`.** One live
`claude -p` child on `claude-opus-5`, given `templates/reviewer-system.md` and the driver's
own review prompt, pointed at a genuinely half-finished build: 124s, 430335 tokens, $0.83.
It returned `"verdict": "fail"`; `parseReviewerReport` consumed it without throwing; the
four ids it was handed came back as exactly those four and no others; evidence carried
`file:line` (`src/parse.js:81`, `src/parse.js:72`, `package.json:7`); and one advisory came
back in the documented shape rather than as prose. It failed the one requirement that was
genuinely unbuilt — the CLI binary — and passed the three that were done.

Worth recording *how* it audited, because the prompt is doing the work: it re-ran the code
with `node -e` and said so — "verified by direct execution, not by trusting the suite" —
rather than reading the tests and agreeing with them. That is the behaviour
`templates/reviewer-system.md` exists to produce, and it is now observed rather than hoped
for.

**The token ceiling stops at the first child past the line.** It was previously read only by
`shouldContinue`, between iterations, so a single iteration could run arbitrarily far past
the limit before anything looked — an observed run ended `2100900 of 1000000`. Every child's
spend is now charged and tested the moment it returns, at all six sites, which bounds the
overshoot to one child. It is still not a cap and `tokenCeiling` should not be read as one:
nothing can price a child before running it. Budget for the ceiling plus one expensive
child, not for the ceiling.

**The loop has met reality.** On 10 August 2026, twice, against two throwaway repositories
with different PRDs. Preflight passed ten checks and scaffolded config; the run added its
machine state to `.gitignore`, authored or accepted a PRD, wrote design documents under
`docs/`, committed each phase, and the builder produced source and tests. Neither run
shipped, and the reason is recorded below — but the pipeline itself is no longer theoretical.

**`parseNumstat` agrees with git's own arithmetic.** Run against this repository's own
`git diff --numstat HEAD~1 HEAD`, it returned 13 files and 554 lines; `git diff --shortstat`
independently reported "13 files changed, 531 insertions(+), 23 deletions(-)". Small, but it
is the difference between a parser tested against text someone typed and one tested against
the program that produces it — which is the lesson recorded at the bottom of this file.

**The unit gate only collects vitest, and that used to be unsaid.** Both runs independently
built correct `node:test` suites, declared `"test": "node --test"`, and drew
`No test suite found in file …` from `npx vitest run --reporter=json` — a report of zero
tests. `extractTestIds` then correctly returned nothing, `driveRun` correctly rejected the
iteration with the `no-tests` objective, and the ratchet correctly refused to advance. Every
component behaved as designed; the run still could not progress, because the builder was
never told which runner the gate collects with while `templates/builder-system.md`
simultaneously told it to use whatever tools it liked. Fixed in 0.7.0 at the template and in
the `no-tests` brief. Worth noting what this was *not*: not a silent failure. The rejection
was detected, logged and fed back. What was missing was the one fact needed to act on it.

## Outstanding

**A run that reaches the panel, and a ratchet that catches a real regression.** The first
real runs died before either. Both stopped in iteration 1 with `passing: 0`, so no id ever
entered the ratchet, no reset was ever reachable, and the reviewers were never called. The
regression behaviour is the reason the whole design exists and it has still only ever been
exercised against temporary repositories built by the test suite. With the runner mismatch
fixed, this is the next thing a run should be able to demonstrate — give it enough budget to
reach a second iteration.

**A phase still cannot tick, but it now says so.** Children run under `execFileSync`, which
blocks the event loop for the whole call, so a periodic heartbeat is impossible without
making the driver async — a rewrite, not a fix, and not attempted. Every child is instead
bracketed by two unstyled lines: `<phase>: <model> running, no output until it returns`
before, and `<phase>: returned after Ns, N tokens` after. That converts nine and a half
silent minutes from "possibly hung" into "expected, and here is what it cost". If the async
conversion is ever done for other reasons, a real tick becomes available for free.

**A real race — but only the builder half is left.** `race.enabled` is still `false` by
default. As of 0.18.0 the git half is covered by tier 2 against real git: detached worktrees at
the base commit, `worktree list` clean after removal, names reusable by a later race,
`--ff-only` fast-forwarding, and `--ff-only` *refusing* a diverged commit rather than inventing
a merge. `parseNumstat` is cross-checked against git's own `--shortstat`, including a real
binary file.

What remains untested is a real builder inside a worktree — cost, duration, and whether a
`claude -p` child behaves the same detached from a branch. Turn racing on knowingly against a
throwaway repository first, and check `git worktree list` afterwards anyway.

~~**A real health probe.**~~ **Closed on 11 August 2026 by tier 2.**
`test/integration/health-probe.integration.test.mjs` points `probeHealth` at a real
`npm start` — a shell running npm running a script running a server, then torn down again —
and covers the named failure mode: an application that ignores `PORT` now fails the probe
rather than hanging. It also proves the teardown, by probing the same app twice and requiring
the second to succeed. What is still untested is a probe against an application this loop
actually generated, rather than one written to be probed.

---

# Planned work — making the harness stack-agnostic

Specified on 11 August 2026. The `.dare/**` integrity item from the same plan was implemented
in 0.10.0. On 11 August 2026 **items 1, 2, 3, 5, 6, 7 and 8 were implemented** — item 1 in
0.11.0 and 0.12.0, item 6 in 0.13.0, item 3 in 0.14.0, item 2 in 0.15.0, item 5 in 0.16.0, item
7 in 0.17.0, item 8 in 0.18.0; see below. **Items 4 and 9 remain, and both are blocked on
something other than effort.**

- **Item 4 (.NET adapter)** — `dotnet` is not installed on this machine, re-checked on
  11 August 2026. The adapter interface (§3.8) is ready for it: write
  `scripts/toolchains/dotnet.mjs`, push it onto `TOOLCHAINS`, and the existing contract tests
  apply to it automatically. Do not write it without an SDK to verify the command syntax
  against; the registry tests will pass on argv nobody has ever run.
- **Item 9 (dogfood runs)** — spends real money and wants an operator awake to watch it. The
  two valuable scenarios are still the deliberate rejection and the deliberate regression, and
  neither has ever been exercised end to end.

Everything else below is recorded for the same reason it always was: so the next session does
not re-derive it.

## Blocker, still standing

**`dotnet` is not installed on the development machine.** No SDK, no runtime; re-checked on
11 August 2026. A .NET adapter can be written and contract-tested against injected runners —
and as of 0.15.0 the contract tests would apply to it the moment it joins `TOOLCHAINS` — but
its command syntax cannot be verified locally, and a .NET dogfood run is impossible.

That gap is now *more* dangerous than when it was written, not less, because the registry makes
a wrong adapter easy to add and green. Every structural test would pass on argv nobody has ever
run. Either install an SDK before starting that item, or write it with every command explicitly
marked unverified and say so here. Do not let unverified command strings acquire the appearance
of tested ones.

## The seams, located

Read these before designing anything; several are smaller than they look.

- ~~**Gate commands are one function.**~~ Extracted by item 2 into `scripts/toolchains/`.
- ~~**A second Node assumption lives in CI inspection.**~~ Reconciled by item 2. Both now come
  from the resolved toolchain, and a test holds them together.
- ~~**Test-report normalisation already exists.**~~ Extracted by item 3. `detectRunner`,
  `parseReport` and `collapseByWorstStatus` now live in `scripts/reporters/index.mjs`, and the
  `Runner` union there is still the thing to widen. Do not weaken the throwing behaviour to
  accommodate a new format.
- ~~**Capability detection has a nucleus.**~~ Closed by item 1. `hasFrontend` now lives in
  `scripts/capabilities.mjs` as the `web-ui` detector, with its behaviour and its tests
  unchanged.
- **Web assumptions beyond the gates — mostly closed, one left.** `startCommand` is now the
  toolchain's (item 2), and the observability gate no longer fires at a CLI or a library
  (item 5). What survives is the **Playwright provisioning path**:
  `playwrightConfigPresent` and `ensurePlaywrightBrowsers` still key off `playwright.config.*`
  and the `.dare/playwright-installed` marker, both of which are Node-specific and neither of
  which passes through the toolchain. It is harmless today — provisioning is a no-op until
  there is a config to provision for — but a second toolchain with a different e2e runner will
  find it, and it belongs behind an operation on the adapter.

## Items, in dependency order

1. ~~**Project capability manifest.**~~ **Done — 0.11.0 (`scripts/capabilities.mjs`, vocabulary
   and detection) and 0.12.0 (declaration, manifest, brief).** See `DESIGN.md` §3.7. Three
   decisions taken while building it that the plan did not anticipate:
   - **`library` has no detector, deliberately.** `main` and `exports` appear in nearly every
     application manifest, so a detector firing on them reports a guess as evidence. The
     absence is exported as `UNDETECTABLE` so the next reader does not "fix" the gap.
   - **The design-slop gate still keys off detection, not the manifest.** §5.1's carve-out asks
     "is there something to inspect", which is a question about the tree. A declared `web-ui`
     that has not been written yet is still nothing to look at.
   - **The manifest reached the Build Brief first and the gates later.** As shipped in 0.12.0
     it decided nothing; item 5 (0.16.0) is what made it load-bearing.
2. ~~**Toolchain adapter interface.**~~ **Done — 0.15.0.** `scripts/toolchains/`, with the Node
   adapter reproducing the six commands exactly; a test asserts the full argv, not just the
   names, which is what makes "behaviour-neutral" checkable. `DESIGN.md` §3.8. Four decisions:
   - **`restore` is in the contract but is not a gate.** `npm ci` deletes `node_modules`; running
     it every iteration would add minutes and change behaviour. The slot exists because a
     toolchain that cannot express it cannot describe .NET or Rust.
   - **The CI contradiction is closed structurally, not once.** `CI_REQUIRED_COMMANDS` is gone;
     each toolchain declares its own patterns, and a test asserts every pattern matches the
     command string its own operation produces. `node --test`, `jest`, `npm test` and `cypress`
     no longer satisfy CI, which is stricter — deliberately, since that leniency is exactly
     what let the 10 August runs look CI-clean while collecting zero test ids.
   - **Detection falls back to Node rather than refusing.** Iteration 1 has no `package.json`.
     When a second toolchain lands, that default stops being obvious and should become an
     architect declaration confirmed by detection, exactly as capabilities did.
   - **`commandGates` now takes `(root, dareDir)`.** It needed the root to resolve a toolchain,
     and deriving it as `dirname(dareDir)` would have been true today and quietly wrong later.
3. ~~**Reporter registry.**~~ **Done — 0.14.0.** `scripts/reporters/` now holds `shared.mjs`
   (id shape, status normalisation, `ReportFormatError`), one module per format, and
   `index.mjs` as the registry. Behaviour-neutral: every existing extraction test passed
   unmodified. Adding a runner is a new module, one push onto `REPORTERS`, one widened union,
   and nothing in `ratchet.mjs`. Two things worth knowing:
   - **`extractTestIds` stayed on the ratchet**, and that is the boundary: reporters answer
     "what tests does this report contain", the ratchet answers "which statuses count". Mixing
     them is how `flaky` would end up admitted.
   - **New tests assert the registry's own invariants**, not just parsing — unique names, a
     complete contract per entry, and disjoint detectors. The last one exists so that if a
     future format is a superset of another, first-match-wins becomes a decision someone makes
     on purpose rather than inherits.
4. **.NET adapter and TRX normalisation.** Subject to the blocker above.
5. ~~**Capability-driven gates.**~~ **Done — 0.16.0.** `scripts/gate-policy.mjs`, a table with a
   written reason per entry. `DESIGN.md` §4.2. What it actually fixed is worth stating: `npx
   playwright test` ran on every project, so a CLI or library failed the e2e gate on a missing
   config forever and **could never clear Phase 3 at all**. Three decisions:
   - **Only `e2e` and `observability` are conditional.** A test asserts that list as a whole,
     because each addition is a gate some project stops being checked by, and that should be
     hard to do by accident.
   - **An unknown gate runs.** Over-applying is recoverable; a silently missing gate is not.
     A completeness test built from the real toolchain registry catches the omission instead.
   - **Capabilities for a raced candidate come from the main tree.** Same argument as the
     ratchet in §13.6: a candidate must not choose which gates judge it.
6. ~~**Race candidate selection.**~~ **Done — 0.13.0.** Ties now break on lines changed, then
   files changed, then candidate index, measured by a new `parseNumstat` over
   `git diff --numstat`. Still deterministic; no model judgement anywhere near it. One thing
   the plan did not call: a binary file counts as a changed file with zero changed lines, so
   this measure understates a large asset swap. That is recorded in `DESIGN.md` §13.6 and in
   a test rather than papered over, because inventing a line count for a blob would be worse
   than admitting there is not one.
7. ~~**Run manifest.**~~ **Done — 0.17.0.** `scripts/run-manifest.mjs`, written once after the
   design phase — the first moment every field exists. `DESIGN.md` §7.1. Three notes:
   - **"Contents never decide" is enforced, not just asserted.** There is no reader function,
     and a test greps `scripts/` for one. No code path can consult the file, which is a
     stronger guarantee than any amount of care.
   - **A failed version probe contributes no key.** Recording `"unknown"` would put a string in
     the manifest that reads like a version and is not one.
   - **It needed no new guard rule**, which is the 0.10.0 positional protection paying off
     exactly as predicted — `guard.test.mjs` had already listed `.dare/run.json` as a
     hypothetical, and the hypothetical came true without a code change.
8. ~~**Integration-test layer.**~~ **Done — 0.18.0.** `npm test` (tier 1), `npm run
   test:integration` (tier 2, real `git`/`node`/`npm`, no money), `npm run test:live` (tier 3,
   spends money). `DESIGN.md` §11.1, `CLAUDE.md` "Test gates". Three notes:
   - **Tier 2 earned itself on its first execution**, finding a `git` on this machine too old
     for `--initial-branch`. That is precisely the class of fault a unit test cannot see.
   - **Tier 3 fails when unarmed rather than skipping.** A green tick for a suite that made no
     API call is a lie the reader takes for coverage, and this codebase does not get to refuse
     silent passes everywhere else and then ship one in its own harness.
   - **`npm test` no longer globs `test/**`.** It is `test/*.test.mjs`, so tiers 2 and 3 do not
     ride along on the default command. A new unit test must go in `test/` directly.
9. **Dogfood runs.** A web/API app, a Node app with persistence, a .NET service, a deliberate
   rejection scenario and a deliberate regression scenario. The last two are the valuable ones,
   and neither has ever been exercised end to end.

   Two things changed underneath this item on 11 August 2026 and should shape how it is run.
   A CLI or library target can now actually finish (item 5) — before, the e2e gate failed it
   forever — so the scenario set need not all be web. And `.dare/run.json` (item 7) means each
   dogfood run leaves a record of exactly what it was, which is the difference between five
   runs and five comparable runs. Give the regression scenario enough budget to reach a second
   iteration; both earlier attempts died in the first one with `passing: 0`, so the ratchet was
   never reached at all.

## Constraints carried from the same plan

Do not add reviewers, memory systems, planning agents, orchestration frameworks, vector
databases, MCP dependencies for core execution, or another framework layered over this one.
Prefer extraction to rewriting. Prefer several committable states to one large change.

---

# Brief items — what was actually verified

`BRIEF.md` is the work list and carries the statuses. This section carries the *evidence*, in
the same shape as the rest of this file: what ran, and what did not.

Every entry below was gated with `npm run lint && npm run typecheck && npm test` before it was
committed, and `npm run release-check` after the version bump. Where an item says something is
unverified, that is not a hedge — it is the thing to test next.

## A1a — the protected-state rule, stated positionally (0.19.0)

**Verified.** `templates/builder-system.md` and `scripts/brief.mjs` both state the rule as the
directory rather than as a list of names. Three unit tests hold it: the compiled brief and the
builder template each assert that no `` `.dare/<name>.json` `` literal appears at all, so
re-introducing an enumeration fails the suite rather than merely reading oddly; and one test
pairs the rendered brief against `isProtectedStatePath` from the hook itself, showing that
`.dare/red-evidence.json` is named nowhere in the wording and denied anyway. That is the tie
worth having — the documented rule and the enforced rule are now the same rule, and a test
fails if they drift apart.

**Not verified.** No live builder child has read the new wording. The claim the item rests on —
that the weaker rule cost an iteration the first time a builder tried something the guard denied
— was never measured and is not measurable retrospectively; both real runs died in iteration 1.
The tests assert the presence and absence of *substrings*, which is a proxy for a model
understanding the rule, not evidence of it. A dogfood run is what would settle it.

## A2 — driver-owned and not supplied (docs only, at 0.19.0)

**Verified — and mostly found already built.** Both properties A2 asked to have tested were
already tested before the item was read. `test/guard.test.mjs` proves a driver-owned path is
denied to a run, allowed to an operator, and that names merely resembling one are untouched.
`test/plugin-manifest.test.mjs` proves the hook matcher excludes the read-only tools, which is
the whole of what keeps `.dare` readable — the reading half is enforced by the hook never firing,
not by any branch in `guard.mjs`. `Task` was added to that exclusion list, since a subagent reads
files and stopping at `Read`/`Glob`/`Grep` is the enumeration the item argues against.

**What was actually missing was the writing.** `DESIGN.md` used "driver-owned" seven times and
defined it nowhere, and had no word at all for the weaker thing. §6.1 now defines both, says why
there is no third classification called *sealed*, and states the threat model that makes the
absence tolerable: these defences are aimed at satisficing, not at an adversary, and against
satisficing an artifact the builder was never handed is sufficient.

**One finding that was not on the item's list.** §1.1 said the reviewer "does not receive the
build log, iteration history, or any hint that an agent wrote the code" in a voice that reads as
enforced. It is not enforced. A read-only reviewer child working in a repository that contains
`.dare/briefs/iter-003.md` can open it; nothing stops it. That is now labelled *not supplied*,
with the note that the framing is what does the work.

**Not verified.** Nobody has checked whether a cold reviewer ever *does* read `.dare/briefs/`.
It would be visible in a transcript and no transcript has been examined for it, because no run
has reached the panel more than once. If a dogfood run shows a reviewer reading the briefs, the
cold-review invariant is weaker than §1.1 has ever claimed and this is where to look first.

## C4 — the context budget (0.20.0)

**Verified.** `scripts/context-budget.mjs` measures the assembled input inside `spawnClaude`,
before the child exists. 26 new unit tests cover the two ways such a check goes wrong: failing
to fire, and firing and then quietly repairing the problem. Exactly-at-limit passes and
one-over fails, so the boundary is asserted rather than assumed. Four driver-level tests prove
the important half — that an over-budget prompt results in the injected runner being called
**zero** times, so nothing is spent, and that the system prompt is counted alongside the user
prompt (a budget measuring only the user prompt would miss the frontend-direction fragment
appended to every builder on a UI project).

**A real defect surfaced by its own tests.** `options.limit ?? DEFAULT` treated `null` as
"caller had nothing to say" and silently substituted the default. A check that repairs a
malformed configuration on the run's behalf is the failure it exists to catch, arriving through
the door marked "config". Now `=== undefined`, so `null` reaches validation and throws.

**Not verified — and this is the important one.** *The number has never been calibrated against
a real run.* The 400,000-character default is reasoned from a ~200k-token window at a
conservative three characters per token; it is not measured, because no run has ever reported
its prompt size — the measurement did not exist until now. The first dogfood run will print a
real figure on every child, and **that is the moment to check whether the default is sensible
or nonsense.** It may prove far too generous to catch the degradation it targets. Do not treat
400,000 as validated.

Also unverified: whether growth actually occurs the way `BORROWED.md` R4 predicts. Every list
in the Build Brief is capped, so the plausible growth vector is raw gate output in a failure
`detail`, and nobody has watched that happen. The `childStartLine` figure across iterations is
the evidence to collect.

## A6 — truthiness-only assertions fail a gate dare runs (0.21.0)

**Verified.** 31 new tests in `test/integrity.test.mjs`, following this repository's rule that
every deny is paired with a benign neighbour. Denied: all five matchers, the negated
`not.toBeNull()`, single-argument `assert(x)` and `assert.ok(x)`, and a nested call read as one
argument. Allowed and asserted allowed: `toBe`, `toEqual`, `assert.equal`, `assert.deepEqual`,
`assert.match`, a two-argument `assert(x, message)`, a Playwright matcher the gate has never
heard of, `toHaveLength`, a helper merely *named* `myassert`, an argument-less `assert()`, and
a comment mentioning the forbidden matcher. `integrityGate` is asserted end to end: a
repository fails on `toBeTruthy()` and the same repository passes once the assertion names a
value.

**Not verified.** No generated application has been scanned. Every fixture is a string this
session wrote, which means the false-positive analysis is *reasoned*, not *observed* — the
file-classification heuristic (`*.test.*`, `*.spec.*`, and the five test directory names) has
never met a real project's layout. A project putting tests beside source under a different
convention gets no coverage from this gate and will not be told so, which is the silent half
worth watching for. The first dogfood run is what would show it.

**A known and deliberate gap.** The check reads only test files, so a builder that moves a weak
assertion into a helper under `src/` escapes it entirely. That is accepted: scanning
application source would fail correct repositories for defensive `assert(config)` calls, and
this module's whole philosophy is that a false positive costs a full iteration on a correct
repository while a false negative costs nothing that the reviewer was not already covering.

## A7 — properties in the builder contract (0.22.0)

**Verified.** The section exists and four tests hold its shape: the heading and its argument
survive; no property-testing library is named, so a build cannot come to depend on a package
this plugin neither installs nor gates; and the "do not invent an invariant" clause is present,
without which the instruction reads as "always write properties".

**Not verified, and this is the whole of the item's value.** Whether a builder handed this
paragraph actually writes properties, and whether those properties are harder to satisfice in
practice than the example tests they replace, is a claim from `BORROWED.md` R6 that no run has
tested. It is a template change: the only evidence that could exist is a generated test suite,
and none has been generated since the section was written.

## F2 — per-requirement right-sizing in the PRD author (0.23.0)

**Verified.** Three tests: the section survives, both halves of the example pair survive
(a rule with only good examples does not tell the author where the line is), and the
justification is tied to the `one verdict object per id` contract rather than to taste.

**Not verified.** No PRD has been authored since. Whether a model actually splits "add
authentication" into a dozen ids when told to, or merely renumbers, is exactly the kind of
claim a template change cannot settle from inside the test suite. The signal to look for on a
dogfood run is a PRD whose requirement count is much higher than earlier runs produced — and
if it is not, the rule needs a harder constraint than a paragraph.

## F4 — lesson triggers as conditions (0.24.0)

**Verified.** Four tests hold the new section: the reframed question, the self-check against
the supplied evidence, the statement that a vague trigger is worse than none *because it passes
validation*, and both columns of the worked example pair. `scripts/lessons.mjs` was not
touched, as the item predicted — its validation already fails closed on the half it can see.

**Not verified, and this is the item that most needs a real run.** This file's whole purpose is
the thing `HANDOFF.md` has recorded as unprovable by the test suite: whether the store fills
with conditions or with generalities. The instruction to test each trigger against the supplied
evidence is now in the prompt; nothing has checked whether a model *does* it. The procedure is
unchanged and still the right one — **read `.dare/lessons.json` after the first real run, and
delete it if it has filled with generalities.** What is new is that there is now a specific
thing to look at: whether the trigger words appear verbatim in the failure the lesson came from.

---

## Fixed here, and worth knowing about

**Every phase except `builder` was dead, and no test could see it.** `--allowedTools` is
variadic. The prompt was appended to argv immediately after it, so the CLI parsed the prompt
as one more tool name and the child exited with *"Input must be provided either through
stdin or as a prompt argument"*. `builder` alone survived, because
`--dangerously-skip-permissions` takes no operand. No PRD was ever authored, no design
written, and — since nothing defaults to pass — no reviewer could ever return a pass, so no
run could ever ship.

The suspicion recorded here previously blamed the *permissions*. The permissions were fine.
The argument order was not, which is why "start a small run and see whether `PRD.md`
appears" would have found it and reading the permission table would not.

The prompt now travels on stdin. That is deliberately not a reordering: a safe position
lasts only until someone adds a flag after it, whereas a prompt on stdin is not an operand
of anything. It also retires `ARG_MAX` for prompts carrying a whole template plus the PRD,
and prompts that happen to begin with `--`.

The lesson generalises past this bug: **`claudeArgs` is unit-tested, and unit tests assert
the array we meant to build.** The defect lived in another program's parsing of that array.
Anything whose contract is owned by a different binary needs one live check, not more
assertions.

## Unverified risk

The `reality-check` and `lesson-extractor` phases have still never run against a live child.
They use the same spawn path as the phases that have, so the argv fault above is fixed for
them too, but their prompts and their parsers are unexercised.

The lesson store's *usefulness* is unproven in a way the tests cannot reach. Storage,
retrieval, protection and the fail-safe paths are covered; whether the extractor produces
lessons worth reading is a judgement only a long run can settle. Read `.dare/lessons.json`
after the first real run and delete it if it has filled with generalities — retrieval is
designed so that an empty store costs nothing.

## Decisions

All recorded in `DESIGN.md` §14, alongside the one question deliberately left open: whether
to add a backend or security quality plugin beside impeccable, which only inspects user
interfaces.

When adding a phase, note that `PHASE_PERMISSIONS` in `scripts/driver.mjs` throws for an
undeclared phase rather than defaulting. Only `builder` runs in dangerous mode.
