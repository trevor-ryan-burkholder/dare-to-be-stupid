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

**A real race.** `race.enabled` is `false` by default, and the mechanism has only been
exercised against temporary repositories: real worktrees, real cleanup and real `--ff-only`
merges, but never a real builder inside one. Turn it on knowingly against a throwaway
repository first, and check `git worktree list` is clean afterwards. The candidate measure
changed in 0.13.0, and `parseNumstat` was checked against real output rather than only
fixtures — see "Verified live" above.

**A real health probe.** `scripts/health-probe.mjs` is tested against a hand-written server
that answers, one that 404s, one that never answers and one that will not start. It has not
been pointed at a generated application's `npm start`. The failure mode to watch for is an
application that ignores `PORT`.

---

# Planned work — making the harness stack-agnostic

Specified on 11 August 2026. The `.dare/**` integrity item from the same plan was implemented
in 0.10.0. On 11 August 2026 **items 1, 6 and 3 were implemented** — item 1 in 0.11.0 and
0.12.0, item 6 in 0.13.0, item 3 in 0.14.0; see below. Items 2, 4, 5, 7, 8 and 9 are **not
implemented**. What follows is scoped against the code as it stands, with the seams located,
so it can be picked up without re-deriving them.

## Blocker to resolve first

**`dotnet` is not installed on the development machine.** No SDK, no runtime. A .NET adapter
can be written and contract-tested against injected runners, but its command syntax cannot be
verified locally, and a .NET dogfood run is impossible. Either install an SDK before starting
that item, or write it with every command explicitly marked unverified and say so here. Do
not let unverified command strings acquire the appearance of tested ones.

## The seams, located

Read these before designing anything; several are smaller than they look.

- **Gate commands are one function.** `commandGates(dareDir)` in `scripts/driver.mjs` returns
  the six shell gates, and every one is npm or npx: `npm run build`, `npm run lint`,
  `npm run typecheck`, `npx vitest run --reporter=json`, `npx playwright test`,
  `npm audit --audit-level=high`. This is the whole extraction point for a toolchain adapter.
- **A second Node assumption lives in CI inspection.** `CI_REQUIRED_COMMANDS` in
  `scripts/driver.mjs` matches workflow steps with npm/pnpm/yarn/bun regexes. It disagrees
  with `commandGates` about what a unit test is — it accepts `node --test`, which the unit
  gate cannot collect. Any adapter work must reconcile the two or the contradiction survives
  the refactor.
- ~~**Test-report normalisation already exists.**~~ Extracted by item 3. `detectRunner`,
  `parseReport` and `collapseByWorstStatus` now live in `scripts/reporters/index.mjs`, and the
  `Runner` union there is still the thing to widen. Do not weaken the throwing behaviour to
  accommodate a new format.
- ~~**Capability detection has a nucleus.**~~ Closed by item 1. `hasFrontend` now lives in
  `scripts/capabilities.mjs` as the `web-ui` detector, with its behaviour and its tests
  unchanged.
- **Web assumptions beyond the gates.** `startCommand` reads `package.json` and returns
  `npm start`; `playwrightConfigPresent` and the Playwright provisioning path key off
  `playwright.config.*` and the `.dare/playwright-installed` marker; the observability and
  health gates assume an HTTP service. A library or CLI target should not be asked for any of
  them.

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
   - **The manifest does not choose gates yet.** It reaches the Build Brief and nothing else.
     The capability-to-gate table is item 5, and it waits on item 2.
2. **Toolchain adapter interface.** Extract `commandGates` behind a contract covering detect,
   restore, build, lint, static/type check, unit, e2e, dependency audit, start command and
   test-report production. Non-applicable operations must be represented explicitly — a
   toolchain whose compiler subsumes typechecking should say so, not return a fake pass.
   Preserve current Node behaviour exactly; this step should be provably behaviour-neutral.
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
5. **Capability-driven gates.** An explicit, inspectable capability-to-gate table, not a rules
   engine. Document why each universal gate is universal — build, unit tests and dependency
   audit apply to everything — and why each conditional one is conditional.
6. ~~**Race candidate selection.**~~ **Done — 0.13.0.** Ties now break on lines changed, then
   files changed, then candidate index, measured by a new `parseNumstat` over
   `git diff --numstat`. Still deterministic; no model judgement anywhere near it. One thing
   the plan did not call: a binary file counts as a changed file with zero changed lines, so
   this measure understates a large asset swap. That is recorded in `DESIGN.md` §13.6 and in
   a test rather than papered over, because inventing a line count for a blob would be worse
   than admitting there is not one.
7. **Run manifest.** A driver-owned `.dare/run.json` recording start time, start commit, plugin
   version, config hash, claude version, models, toolchain, capabilities and tool versions. No
   secrets. Informational: a malformed or uncreatable manifest may fail a run, but its contents
   must never decide one. It is protected automatically by the 0.10.0 invariant.
8. **Integration-test layer.** Three tiers, documented and separately runnable: deterministic
   unit tests; local integration tests needing real binaries but no paid API; live tests that
   spend money. The argv bug recorded above is the reason — `claudeArgs` was unit-tested, and
   the defect lived in another program's parsing of the array it built.
9. **Dogfood runs.** A web/API app, a Node app with persistence, a .NET service, a deliberate
   rejection scenario and a deliberate regression scenario. The last two are the valuable ones,
   and neither has ever been exercised end to end.

## Constraints carried from the same plan

Do not add reviewers, memory systems, planning agents, orchestration frameworks, vector
databases, MCP dependencies for core execution, or another framework layered over this one.
Prefer extraction to rewriting. Prefer several committable states to one large change.

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
