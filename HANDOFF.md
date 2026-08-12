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
spend is now charged and tested the moment it returns, which bounds the overshoot to one child.

> **Corrected 11 August 2026 by the first case-D dogfood run. This paragraph was wrong twice.**
>
> It said "at all six sites". There were **eight** — the PRD and design phases run in `main`,
> before `driveRun` exists, and were never charged at all. A design child spent 2,965,864 tokens
> against a 2,000,000 ceiling while the airtime counter reported the full budget remaining.
> Fixed at 0.35.0 via `alreadySpent`; both pre-loop phases are now charged, and checked between
> each other.
>
> And "budget for the ceiling plus one expensive child" understated the overshoot badly enough
> to mislead. Measured: **one builder child returned 20,223,215 tokens against a 2,000,000
> ceiling** — 10×. The check fired correctly and ended the run at once, so the mechanism is
> sound; the *expectation* it set was not. Read `tokenCeiling` as "stop once this is exceeded",
> never as "do not exceed this", and expect a single child to overshoot by an order of
> magnitude. `DESIGN.md` §3.5 now says this in those terms.

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
  neither has ever been exercised end to end. **`DOGFOOD.md` now carries every scenario as an
  executable script with exact commands, expected terminal states and the evidence to collect.**
  It was written on 11 August 2026 and **not run**; the session that wrote it was not permitted
  to spend. Run `DARE_LIVE=1 npm run test:live` first — a few cents against a four-hour run, and
  a broken output contract found there is found sixty seconds in rather than four hours in.

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

# Dogfood run — 11 August 2026, case D (deliberate rejection)

The first dogfood run this project has performed since 10 August, and the first ever against a
budget an operator set deliberately. Throwaway repository, PRD written to contain one genuinely
hard requirement (`PRD-2.1`, a real text-layer PDF export under 200 kB) among easy ones, so
that **success means the run does not ship**.

Plugin verified at `0.34.0` / `1ff1ac3` in `installed_plugins.json` before starting, with the
cache confirmed to physically contain `trx.mjs` and `dotnet.mjs`. That check is not ceremony:
the loader is keyed by version and a stale copy is indistinguishable from a wrong fix.

## The finding: `tokenCeiling` does not count Phase 0 or Phase 1

**This is a defect in a safety limit, and it was found in the first twelve minutes.**

```
design: returned after 737s, 2965864 tokens
...
100 PERCENT OF OUR BROADCAST DAY REMAINS. STAY TUNED.
```

The design child spent **2,965,864 tokens against a 2,000,000 ceiling**, and the airtime counter
reported the full budget remaining. It is not a rendering fault. The structure is:

| line | what | charged? |
|---|---|---|
| `driver.mjs:2349` | `runChild` — PRD authoring (Phase 0) | **no** |
| `driver.mjs:2375` | `runChild` — design (Phase 1) | **no** |
| `driver.mjs:1045` | `charge()` — the entire budget accounting | inside `driveRun` |
| `driver.mjs:2701` | `driveRun({…})` is finally called | — |

Both pre-loop phases run in `main`, before `driveRun` exists, and check only `result.ok`.
`driveRun` then begins its own accounting at `spentTokens: 0` with the **full** ceiling
available again.

**This file's own claim was false.** It said: *"Every child's spend is now charged and tested
the moment it returns, at all six sites, which bounds the overshoot to one child."* That is true
of the six sites inside `driveRun` and untrue of the two outside it — and the design phase is the
single most expensive child in the pipeline, so the uncounted half is the expensive half.

Consequence for an operator: a run configured for 2M tokens can spend 2M **plus** an entire PRD
and design phase, plus the documented one-child overshoot. Observed here as roughly 5M against a
stated 2M. `DESIGN.md` §3.5's warning to "budget for the ceiling plus one expensive child" is
therefore also understated.

**Fixed at 0.35.0**, by the second route: `driveRun` takes `alreadySpent` and seeds `progress`
and `costUsd` from it, so there is still exactly one accounting path. `main` charges each
pre-loop child as it returns and **checks between the two phases**, so the overshoot there is
bounded to one child exactly as it is inside the loop. A ceiling exhausted by the design phase is
not an early return: `driveRun`'s own `shouldContinue` ends the run `BUDGET` on its first pass,
*after* the run manifest is written, so the operator still gets the artifact they were promised.

Six tests, and the two that matter are the ones asserting *which* limit fired rather than merely
that the state was `BUDGET` — exhausting `maxIterations` is also `BUDGET`, so the broader
assertion passed for the wrong reason on the first attempt and had to be tightened.

The outcome now reports the real total, which is the half an operator actually reads: the closing
`iterations: 0 tokens: … cost: …` line previously understated the bill by the most expensive
child in the pipeline.

**Nothing about this required the run to finish**, which is worth noting on its own: the most
valuable result of the session's first dogfood arrived twelve minutes in, from reading two log
lines against the code.

## A cost ceiling, because tokens are not money (0.37.0)

The same measurement that produced the overshoot finding produced a second one: **20,223,215
tokens cost $9.4345** — $0.47 per million, because cache reads dominated the count. At uncached
input rates that token figure would have cost an order of magnitude more. **No token number can
be converted into a bill**, so `tokenCeiling` bounds work and cannot bound spend.

`costCeiling` (default $50) is checked on every child alongside `tokenCeiling`, reading the
envelope's own `total_cost_usd` rather than estimating from a rate card — the same reason nothing
else here estimates. `spentUsd` moved into `RunProgress`, because a limit the loop cannot read is
not a limit; it had been a bare `let` in `driveRun`. `airtimeRemaining` now reports the tightest
of iterations, tokens and money, so the counter names the limit that will actually end the run
rather than the most flattering one.

**On a subscription neither ceiling is the binding constraint**, and the codebase already knew
that before this session: `EXHAUSTION_PATTERN` tells a rate-limited child from a failed one,
`landCleanly` **commits the work in progress**, and the run ends `BUDGET` stating it can resume. A
stalled allowance is not a failed build. That path is unit-tested and has still never fired
against a real rate limit.

## The second finding: one child can be ten times the ceiling

```
builder: returned after 1435s, 20223215 tokens
BUDGET: token ceiling reached: 20223215 of 2000000
iterations: 0  tokens: 20223215  cost: $9.4345  passing: 0
```

**A single builder child spent 20.2 million tokens against a 2 million ceiling.** The check
itself worked exactly as designed — `charge()` fired the moment the child returned and ended the
run — so the mechanism this file describes is confirmed working *at the sites it covers*. What
is not confirmed is the conclusion drawn from it.

This file said: *"Budget for the ceiling plus one expensive child."* That reads as a modest
allowance. Measured, "one expensive child" was **10× the entire ceiling**, and there is no
mechanism that could have stopped it: nothing prices a child before running it, and a `claude -p`
call has no token limit the driver can set. For small ceilings `tokenCeiling` is therefore not a
budget at all — it is a *stop signal that fires after the fact*, and the smaller the ceiling the
less it means.

The honest statement, now that Phase 0 and Phase 1 are counted: **a run can cost the ceiling plus
one unbounded child, and that child can be an order of magnitude larger than the ceiling.** An
operator setting 2M should expect the possibility of 20M+. This is not fixable by accounting —
nothing prices a child before running it, and `claude -p` takes no token limit the driver could
pass — so it is a property to be stated rather than a bug to be closed. `DESIGN.md` §3.5 now says
so in those terms instead of "budget for the ceiling plus one expensive child".

## What the run did establish, live, for the first time

| thing | evidence |
|---|---|
| preflight | 9 checks passed; failed correctly on `danger-acknowledged` until `--yes` |
| `.dare/run.json` (§7.1) | written complete — plugin `0.34.0`, real tool versions, **no `"unknown"` anywhere** |
| capability declaration (§3.7) | architect declared `api, persistent-storage`; run aborted-free |
| capability-driven gates (§4.2) | `e2e` skipped with its full written reason, on a project with no browser |
| toolchain resolution (§3.8) | `node (file package.json)` |
| **C4 prompt measurement (§3.9)** | design 5,314 chars; builder 16,050 chars — the first real figures this project has ever had |
| **F1 chaos-1 text** | reached the builder verbatim in `iter-001.md` |
| **B6 guidance** | rendered — and carried a duplicate heading, see below |
| guard hook | denied this session's own Bash containing the slash command, unscripted |

The builder produced a plausible application — 10 source files, **6 test files**, and a
`package.json` whose `lint`, `build` and `typecheck` scripts run real work rather than `true`.
It was building `src/pdf/render-titles.js`, i.e. genuinely attempting `PRD-2.1`, when the budget
ended the run.

## The third finding: B6's guidance rendered a duplicate heading

`iter-001.md` contained:

```
## Building this with node

## Building this with Node
```

`brief.mjs` added a heading *and* the fragment supplied its own. **No test caught it because
both halves were individually correct.** Fixed at 0.35.0, with a regression test asserting
exactly one `## Building this with` heading. This is the smallest finding here and the best
argument for the exercise: it is invisible to unit tests by construction, and obvious in one
glance at a real artifact.

## The fourth finding: red-evidence made the greenfield objective unsatisfiable (fixed 0.38.0)

Found **without spending anything**, by running the abandoned run's own gates by hand and then
simulating the gate against the real report.

The builder's application passes `build`, `lint`, `typecheck` and **83 of 83 tests** — verified
by running them. It also did **not** stub `PRD-2.1`: `src/pdf/render-titles.js` is a genuine
`pdfkit` implementation with a one-page fit search over font sizes and column counts, cp1252
representability handling for the standard Helvetica font, `doc.text` so the output is selectable
rather than an image, and a thrown `ExportCapacityError` when titles genuinely cannot fit. It
pulled in `pdfjs-dist` as a dev dependency to *verify* the text layer. **`PRD-2.1` was not a
trap; case D did not test rejection.** That is a finding about the scenario, not the loop.

Then the real one. Simulated against the actual 83 ids:

```
red-evidence gate ok: false | status: 1
detail: never observed failing, so unproven: <all 83>
```

With no `previousPassing` and no `redSeen`, every id is unproven, the gate fails, and the
objective handed back is *"make these gates pass"* — which the builder **cannot satisfy**,
because it cannot make an already-green test have been red in the past. Four iterations of that
ends `STALLED`. At ~20M tokens per builder that is ~80M tokens to reach a conclusion derivable
for free, and **it means no greenfield project whose tests pass first time can ever clear Phase
3** — the primary use case, and the same shape as the `e2e`-fails-a-CLI-forever bug item 5 fixed.

**Fixed at 0.38.0** with a first-gating baseline: the ids present the first time a project is
gated are recorded once in `.dare/red-evidence.json` and admitted, the gate *reports how many*
rather than claiming a clean pass, and everything added later still needs red history. Verified
against the real 83 ids — gate passes, and adding one further test fails naming only that one.

It is a real weakening and the guard is named rather than assumed: `gate-integrity`'s assertion
check and the conditional mutation pass both catch fake tests without needing history. Nine
tests, including one kept deliberately asserting the *old* failing behaviour so a later reader
can see what was wrong.

# Dogfood run 2 — 11 August 2026, case D with an impossible requirement

Same repository, the first run's output committed as a baseline, plus `PRD-4.1`: sub-millisecond
HTTP on a cold process, which cannot be satisfied. Ceilings raised to 4 iterations / 80M tokens
/ $200. Run from the **working tree at 0.38.0**, not the install cache, which was still 0.34.0 —
the trap `CLAUDE.md` warns about, nearly walked into.

```
iterations: 4  tokens: 16521006  cost: $10.9031  passing: 0
```

## Verified live for the first time

| thing | evidence |
|---|---|
| **C2 archiving** | `archived the previous run to .dare/runs/001`, containing `briefs` and `run.json` |
| **the 0.36.0 budget fix** | `95 PERCENT OF OUR BROADCAST DAY REMAINS` after the design phase. It said **100%** last run |
| **Phase 3 gates executing** | `gates failed: quality:semgrep, ci, observability` — never observed before |
| **the 0.38.0 red-evidence baseline** | iteration 1's red-evidence **passed**; without it, it would have failed on all 83 |
| **A5's conditional second pass** | `gate mutation declined: no first-party source changed since the last ratchet-advancing commit` |
| **B5 capability gating** | `gate e2e does not apply` with its full written reason |
| **the lesson extractor** | ran against a live child, which this file previously recorded as never having happened |
| **the cost ceiling** | did not fire — $10.90 of $200 — and the run ended on the iteration limit, correctly named |

Four iterations, against zero on the previous attempt. The pipeline reached further than it ever
has.

## The finding: red-evidence deadlocks the ratchet, and always has

**`seenFailing: 0` after four iterations.** Not one test was ever observed failing.

That is not an accident of this project; it is what a builder that writes code and tests in the
*same child* always produces. By the time gates run, the tests pass. So:

- `unproven = passing − previousPassing − redSeen − baseline`
- `previousPassing` is empty, because the ratchet has never advanced
- the baseline covers iteration 1 only
- every test added in iteration 2 or later is therefore **permanently** unproven
- red-evidence fails → the iteration fails → **the ratchet cannot advance** → `previousPassing`
  stays empty → forever

**It is circular.** Advancing the ratchet requires every gate to pass; red-evidence is a gate;
red-evidence can only pass once the ratchet has advanced. The 0.38.0 baseline moved the wall by
one iteration rather than removing it.

**And it explains every run this project has ever performed.** 10 August, twice, and both runs
today: all four ended `passing: 0`. The runner mismatch explained the first two. This explains
all four, and it means the ratchet — the mechanism the whole design exists for — **has never
once advanced in a real run.**

Worse, the loop's only escape is perverse: delete the new tests. Then `passing` collapses to the
baseline and the gate passes. A design built to stop Goodharting has an incentive gradient
pointing at deleting tests.

## The fix is a return to the specification, not a weakening

`DESIGN.md` §8 has always said: *"a test that has only ever been green is treated as unproven and
**doesn't count toward the ratchet**."* It does **not** say the gate fails the iteration. The
implementation made it blocking, and blocking is what deadlocks.

The spec's version is self-consistent: an unproven test earns **no ratchet credit**, which is the
deterrent — a fake green test cannot inflate the protected set — while the iteration proceeds.
`gate-integrity`'s assertion check and the mutation pass cover the shape. Not yet implemented;
this is the next change, and it is the most valuable one outstanding.

## What the run did NOT establish

**Case D's actual question is still unanswered.** The run died in iteration 1 on budget, so the
gates never ran, the ratchet never advanced (`passing: 0`), and **the cold panel was never
called**. Whether review is genuinely fail-closed against a stubbed `PRD-2.1` remains exactly as
unproven as it was on 10 August — for a new reason, but unproven.

Still never observed: any gate executing, any test id entering the ratchet, a hard reset, a
reviewer verdict, a pin, an assumptions block, the mutation gate, `.dare/runs/NNN/` archiving.

**To answer case D, the budget defect has to be fixed first.** With Phase 0 and Phase 1
uncounted and a single builder capable of 20M tokens, no ceiling an operator sets is
meaningful, and every further scenario risks the same death before the interesting part.

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

## F1 — surgical discipline at chaos 1 (0.25.0)

**Verified.** Three template tests and two brief tests. The important one is positional rather
than textual: it asserts the surgical rule appears *before* the chaos-2 entry, so a later edit
promoting it to unconditional text fails the suite instead of merely reading wrong. The others
assert chaos 2 and 3 stay permissive, that the two chaos-independent bullets landed in the
general sections rather than on the dial, and that `chaosLine(2)` does not carry the chaos-1
sentence.

**Not verified.** Whether tighter chaos-1 wording actually narrows a builder's diff is
unmeasured and unmeasurable from here — it needs two runs at the same chaos level with the same
PRD, before and after. `BORROWED.md` R2 also claims this sharpens the race's line-churn metric
by making candidates more distinguishable; racing has never been run with a live builder, so
that remains a prediction.

## F3-reduced — the observable-outcome note (0.26.0)

**Verified.** Two tests, one per paragraph: that the RED connection is stated, and that the
refusal to rewrite requirements into builder instructions is stated in the template itself.
The second is the one worth having — it records the rejected transformation *beside the rule*,
so a later reader meeting F3's original wording finds the refusal already written down rather
than re-deriving it.

**Not verified.** Whether requirements were already being phrased this way, and therefore
whether the note changes anything at all, is unknown: only two PRDs have ever been authored and
neither was examined for phrasing. This may be a no-op that documents a correct existing habit.
That is an acceptable outcome for a paragraph, and it is stated here rather than claimed as an
improvement.

## B1-residual — PRODUCT.md owns audience, capabilities.json owns shape (0.27.0)

**Verified, and mostly found already correct.** Nothing in `scripts/` referenced `PRODUCT.md` —
checked by grep before anything was written — and `architect.md`'s instruction for the file
already named no capability. The overlap the item anticipated had never been created.

What landed is the *enforcement* of a rule that was true and unstated. A test walks the whole
`scripts/` tree and fails if any shipped module so much as names `PRODUCT.md`, in the same shape
and for the same reason as the run manifest's no-reader test. A second test extracts the
architect's `PRODUCT.md` row and asserts it contains none of the ten capability names, so drift
in the other direction is caught too.

**Not verified.** No `PRODUCT.md` has ever been generated and read back — Phase 1 has produced
design documents on two runs, but nobody has inspected what the architect actually wrote into
that file. If it has been quietly including capability-shaped prose all along, these tests do
not see it: they constrain the *instruction* and the *readers*, not the artifact. Read a
generated `PRODUCT.md` on the first dogfood run.

## C2-archiving — the previous run is kept (0.28.0)

**A real defect was found, not just a feature added.** Iteration numbering lives in the
driver's in-memory `progress`, initialised to zero at the top of every run, and never read from
`state.json`. So every run wrote `.dare/briefs/iter-001.md` over the last run's, then
`iter-002.md`, and so on. Briefs were being destroyed one file at a time, silently, because the
replacement looked exactly like the original. Both written accounts of this — "state is
replaced per run" and "briefs accumulate" — were wrong in opposite directions.

**Verified.** Nine tests. The one that matters simulates three consecutive runs each writing
`briefs/iter-001.md`, and asserts all three bodies are recoverable afterwards from `runs/001`,
`runs/002` and `runs/003` — that is the collision, reproduced and then shown fixed. Others
assert the carried-forward artifacts (`state.json`, `lessons.json`, `red-evidence.json`,
`bloopers.log`, `config.json`) are **not** archived, since archiving `state.json` would
silently reset the ratchet; that a first run creates no empty `runs/001`; that slots come from
the highest existing number so deleting one cannot cause an overwrite; and that a directory an
operator renamed is ignored rather than fatal.

**Not verified.** No real run has archived anything — every fixture is a temp directory this
session built. In particular the driver-side wiring (`archivePreviousRun` called once in `main`
before `ensureDareIgnored`'s successor lines) is covered only by the unit tests of the function
itself, not by an end-to-end run, so *when* it fires has not been observed. Two runs in
succession against a throwaway repository would settle it and cost nothing but time.

## A4 + A8 — pinned security elements and pinned requirements (0.29.0)

**A4 verified, mechanism and wiring.** `scripts/pins.mjs` plus a `security-escalation` phase.
47 unit tests on the mechanism and 8 on the driver. The wiring tests are the ones that matter,
because they assert behaviour a unit test of the module cannot: a quarantined element makes a
run with a **unanimous panel** not ship; the same run ships once nothing is quarantined (the
benign neighbour — a block that never lifts is a stall, not a gate); the reviewer is asked
**zero** times while the cheap check still finds the guard; a `moved` verdict re-pins to the
new file and does not block; an unparseable escalation quarantines rather than resetting; and a
run holding pins with no way to read the tree **aborts** rather than carrying them forward.

Finding worth recording: the first version of those tests all failed, because the default test
harness reports zero test ids, the ratchet correctly rejects that, and Phase 4b is below the
ratchet. Every component behaved as designed — which is the same shape as the 10 August runs,
and a reminder that "the code never ran" and "the code failed" look identical from a red tick.

**A8 partly built, and the split is deliberate.** Built: the shared mechanism, the store,
invalidation on any change to the evidenced file, and the fail-closed half — a requirement whose
evidence target no longer resolves overrides the panel's verdict *downward*. Not built: asking
the panel only about un-carried ids. That is the saving, and A8's own correction says to order
it after the dogfood runs — the cost premise was false, no run has reached the panel twice, and
"review becomes the dominant cost" is a prediction. **The DoD line "a cold-reviewer-passed
requirement is not re-litigated until its evidence changes" is therefore not met.**

**Not verified, and there is a lot of it.**

- **No pin has ever been created by a real reviewer.** Every pin in every test was constructed
  by the test. Whether a security reviewer's `file:line` evidence actually points at a line
  containing the guard — rather than at a function signature, a route declaration or a blank
  line — is the assumption the whole of A4 rests on, and it is untested. If evidence commonly
  points at a declaration rather than a check, pins will be weak but not wrong; if it points at
  blank lines, `pinSecurityElement` refuses and A4 silently protects nothing.
- **The escalation child has never run.** Its prompt and its JSON contract are unexercised
  against a live `claude -p`. By this repository's own rule that is a tier-3 candidate, and it
  is a strong one: the argv defect lived in exactly this gap.
- **The default panel yields at most one security pin.** `ownership.security` is
  `['DoD-2-security']`, one id, one `file:line`. Pinning one guard per run is thin protection
  against a paper describing gradual erosion across ten rounds. A richer contract — the
  reviewer listing several defensive elements — is the obvious extension and is a reviewer
  output-contract change, so it needs the same tier-3 treatment as A9.
- **No run has exercised a `removed` verdict end to end**, so the security hard-reset path has
  never fired outside a unit test.

## A9 — the assumptions log (0.30.0)

**Verified at tier 1.** 41 tests. The parser's three outcomes are each asserted: an absent block
is not a failure, a malformed block is, and an uncited entry is discarded and *counted*. Five
driver-level tests carry it end to end — a cited assumption reaches `.dare/assumptions.json`, an
uncited one does not, a builder that says nothing about assumptions still ships, a malformed
block stops the iteration, and **the reviewer is called zero times on that iteration**. The
template's own example is fed through the real parser, so an obedient builder cannot fail its
iteration on the block it was told to emit.

**Not verified, and this is a tier-3 gap by the repository's own rule.** This is a new output
contract whose behaviour another binary owns — the precise category that produced the argv
defect, where `claudeArgs` was unit-tested, correct, and wrong about what the other program did
with it. **No live child has ever emitted an assumptions block.** Every string the parser has
seen was written by this session.

`test/live/assumptions-contract.live.test.mjs` is written and **has never been run**. It covers
the two things tier 1 structurally cannot:

1. whether a real builder emits json at all where the template asked for it, and
2. whether it emits a block on **every** iteration because being asked implies an expectation.

The second is the more dangerous, and it is `lessons.mjs`'s named failure arriving by a new
door — except this store reaches the reviewer. Run:

```
DARE_LIVE=1 npm run test:live
```

Expect a few cents and under a minute. If a block appears where nothing was ambiguous, the fix
is the template, not the parser.

**Also unverified:** whether a reviewer handed the log actually uses it — that is, whether "you
assumed X, the PRD says Y" ever appears as a finding. That needs a run reaching the panel with
a non-empty log, which is a dogfood scenario rather than a live test.

## A5 — the conditional gate pass and mutation testing (0.31.0)

**Verified structurally, and — unusually for this session — the external command was verified
by running it.** B3's rule is that a registry makes a wrong adapter easy to add and green, so
Stryker 9.6.1 was installed into a scratchpad fixture and driven before any argv was written
down. What that produced was not a confirmation but a **correction**:

- `stryker run --help` exposes `--dashboard.*` and **no `--thresholds.*` flag whatsoever**.
- `thresholds.break` defaults to `null`. **A run with surviving mutants exits 0.**
- Measured: a two-function fixture with two surviving mutants exited **0** with no config, and
  exited **1** with `{"thresholds":{"break":100}}`, logging *"Final mutation score 66.67 under
  breaking threshold 100"*. A second run with a comma-separated two-file `--mutate` exited 1
  with three survivors.

So the item as written — "surviving mutants on changed code fail the gate" — would have shipped
a gate that could not fail, and the config that decides it would have been the builder's. The
driver now writes `.dare/stryker.config.json` and passes it positionally; §6 keeps it out of
reach. **That correction is the most valuable thing this item produced, and it came from
running the binary rather than reading about it.**

13 tests: the conditional list asserted as a whole and asserted disjoint from the first pass;
the full argv; tests excluded from mutation; an empty changed set declining with a reason;
`changedSince` measuring from the ratchet-advancing commit, returning empty with no baseline
and **not consulting git at all** in that case, and returning empty when git fails.

**Not verified, and one of these is blocking.**

- **Provisioning is not wired, and this is the blocker.** The command assumes
  `@stryker-mutator/vitest-runner` is installed in the target project. Nothing installs it.
  Playwright browsers have `ensurePlaywrightBrowsers`; mutation has no equivalent. On a project
  without the plugin the gate fails on a missing runner rather than on a defect — which is
  exactly the `e2e`-forever-red failure that item 5 fixed for a different gate, reintroduced
  here. **Fix this before arming mutation on a real run.**
- **The second pass has never run in a real driver loop.** `gateTree`'s ordering is covered
  only indirectly; no test drives a first pass to green and observes the second start.
- **Cost is unmeasured.** Mutation testing on a real generated application could take longer
  than every other gate combined, and nothing bounds it. The fixture here was two functions.
- **The builder still owns `vitest.config`**, so it still decides which tests run and therefore
  which mutants can be killed. That is the same pre-existing hole the unit gate has, not a new
  one, but mutation makes it louder: a narrowed test config raises the surviving-mutant count
  rather than lowering it, so the failure is at least in the safe direction.

## B3 — the .NET adapter, and the blocker that lifted (0.32.0)

**The blocker is gone.** `dotnet 8.0.423` was installed on 11 August 2026. Every earlier note
in this file saying "dotnet is not installed" is now historical.

**Verified by execution, not by reading.** This file warned for two versions that the registry
makes a wrong adapter *easy to add and green*, because the contract tests check that an
operation returns a command and not that the command does anything. So the adapter was written
against a scaffolded solution — class library plus xunit test project — and every command was
run first. **Two would have been wrong.**

1. **`dotnet list package --vulnerable` cannot fail.** Given `System.Net.Http 4.3.0` it printed
   a High advisory (`GHSA-7jgj-8wvc-jh57`) and **exited 0**. As `security-audit` it would have
   passed every vulnerable .NET project forever. Replaced with
   `dotnet restore --force -warnaserror:NU1901,NU1902,NU1903,NU1904`, verified exit 1 with
   `error NU1903` and exit 0 once the package was removed.
2. **A near-miss worth more than the fix.** The first attempt used `-p:WarningsAsErrors=NU1901,…`,
   which MSBuild rejects with `MSB1006: Property is not valid` — **and that rejection also exits
   1**. It was briefly recorded here as working. What caught it was running the *clean* project
   through the same command and getting a failure there too.

**The generalisable finding:** this is the same shape as §4.4's Stryker threshold — a tool that
reports the problem and does not fail on it — found independently in a different ecosystem
within an hour. Treat it as the default rather than the exception. **Any new adapter's audit
step should be assumed unable to fail until it has been seen to exit non-zero on a real
finding, and its benign neighbour seen to exit zero.**

Also verified: `dotnet build` exit 0; `dotnet format --verify-no-changes` exit 0 clean and
**exit 2** on damaged whitespace; `dotnet test --logger trx` exit 0 with 2 passed 1 skipped and
exit 1 with a failure; `dotnet run --project` exit 0 on a console project.

Declined by name rather than guessed: `types` (the compiler subsumes it), `e2e` (no browser
runner in the SDK), `mutation` (Stryker.NET is a separate tool, not installed, **not verified,
therefore not written**).

**New ambiguity, and it is the residual of this item.** `detectToolchain` returns the first
match and node is first, so a repository holding both a `package.json` and a `.csproj` — a .NET
service with a JavaScript frontend, a common shape — resolves to **node**, and nothing says so.
`DESIGN.md` §3.8 predicted this exact moment and named the fix: the architect declares the
toolchain and detection confirms, as capabilities already do. **That is not built.**

**Not verified.** No dogfood run against a .NET project (D2 case C, still refused — it spends
money and wants an operator). The adapter has never driven a real `driveRun`. `dotnet format`
requires source it can parse, and its behaviour on a repository mid-build is unknown.

## B4-dotnet — the TRX reporter (0.33.0)

**Verified against real output.** Two TRX files produced by `dotnet test` are committed to
`test/fixtures/reporters/` with provenance — a passing run (2 passed, 1 skipped) and a failing
one (1 passed, 1 failed, 1 skipped). Only the hostname and the generating machine's absolute
path were redacted; every element, attribute and outcome is as emitted. 12 tests.

**The bug that would have made all of it decorative.** The driver hardcoded node's two report
filenames, so a .NET run would have written `unit.trx`, had it read by nobody, and ended at
`passing: 0` — the exact failure both live runs produced on 10 August, arriving by a new route.
`Toolchain.reports` now declares what each toolchain writes and the driver asks. Found by
wiring the reporter and asking what would actually read its output, not by a test.

**Three findings from the format itself**, each a way the ratchet could have silently stopped
protecting anything:

1. **Most `outcome=` attributes in a TRX are not test outcomes.** A single-failure run carries
   six — three on `UnitTestResult`, one on `ResultSummary`, two on `RunInfo`. A naive read
   admits three phantom results, one into the ratchet.
2. **Neither path in the file can be identity.** `storage` is absolute *and lowercased by the
   runner*; `codeBase` is absolute. An id from either differs between machines, so the ratchet
   would read every test as new on the first run elsewhere. That is a silent widening, which no
   parse error announces. The id is the fully qualified `testName`.
3. **The registry assumed JSON.** `parseReport` began with `JSON.parse`, so XML died as "report
   is not valid JSON" — true, and the wrong fault.

**Not verified, and one of these is a real risk.**

- **There is no XML parser here** — hard constraint 1 — so this is a regex over two attributes
  of one element. It is safe against the usual failure (XML forbids a raw `"` inside an
  attribute value, so the match cannot overrun) and it is still **the thing in the registry
  most likely to be wrong about a TRX nobody has seen yet**. Specifically untested: MSTest and
  NUnit adapters, which may populate `UnitTestResult` differently from xunit; multi-assembly
  runs; and `[Theory]` names containing entities, where only `decodeXmlEntities` is unit-tested
  and no real theory output has been seen.
- **No .NET run has ever driven `driveRun`.** The reporter has never been fed by a live gate.
- `junit.mjs` is still not written. Nothing has needed it.

## B6 — per-toolchain guidance (0.34.0)

**Verified.** Nine tests. Two matter more than the rest: one requires a fragment for **every**
registered toolchain, so adding a third adapter without guidance fails the suite rather than
silently shipping a builder that was told nothing; and one asserts the fragments do **not**
restate the builder's contract, because a second voice arguing with the first would grow every
time either changed.

The content is not invented. It is what actually went wrong while verifying B3 against a real
SDK — a test project missing from the `.sln` collects zero tests, and a missing project
reference surfaces as `CS0246`, which names neither the reference nor the cause. The Node
fragment carries the equivalent: the unit gate collects with vitest and not `npm test`, which
is the fault that killed both live runs on 10 August.

**Not verified — and this item is the least verifiable thing in the brief.** Whether guidance
changes what a builder produces cannot be established from inside the test suite. The tests
prove the fragment is *selected*, *rendered* and *archived*; they cannot prove it is *read*, or
that reading it prevents the failure it describes. That needs two dogfood runs on the same PRD
with and without the fragment, which is beyond what D2 currently plans.

Also unverified: the fragments were written against a scaffolded solution and a scaffolded
Node app. Neither has met a real generated project, so the layout advice ("src/, tests/, one
.sln at the root") is convention rather than observation.

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
