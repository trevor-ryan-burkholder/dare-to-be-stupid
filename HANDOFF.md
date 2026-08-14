# START HERE — handoff, last swept 14 August 2026

**State:** `main` at `0.145.0`, in the repository's new home `~/dev/meeseeks`. Measured at 0.145.0: `npm test` **1998 pass**,
`npm run test:integration` **46 pass** (unchanged at 0.145.0 — nothing tier 2 owns was touched), `npm run lint` and `npm run typecheck` clean,
`npm run release-check` **ok**.

**`npm run test:live` at 0.141.0: 27 of 27, 0 failures** — run against the async spawn path the same hour it was converted — re-run because 0.138.0 modified `spawnClaude` (denial collection), which `CLAUDE.md` requires tier 3 for; the header had been carrying a 0.136.0 result across that change. Re-run after `main`
gained `io.spawn` (0.114.0) and `childEnvironment` gained the depth marker (0.115.0), both of
which `CLAUDE.md` requires tier 3 for. The header had been carrying a 0.110.0 result across
sixteen versions of spawn-path changes.

**Keep the history, because it is the evidence and not a footnote.** The suite read **26 of 27**
before 0.106.0 and **the one failure was real** — a builder emitting a correct, cited assumption
as a bare object, which the parser dropped where nothing could count it. The repaired file was
then run alone **five times before the fix (four passing, one failing) and six times after (all
six passing)**, and now the whole suite agrees. Those are three different measurements; do not let
them collapse into "it was run a few times".

**This header was stale by fourteen versions until 13 August** — it read `0.64.0` while
`package.json` read `0.78.0`, which spans the entire A3 held-out-oracle build (0.70.0–0.72.0). It
is the first line anyone reads and it was the least true. If you change the version, change this
line in the same commit.

## Working `PLAN.md`, 13 August 2026 — execution record

Newest first within this section. `PLAN.md` carries the statuses; this carries what happened,
**including what was not verified**.

### Case J attempt 1 — inconclusive, ran out of money **(superseded: the concluding entry sits above at "Case J concluded" — attempt 5 verified every control and no builder ever nested)**

**`BUDGET`, 12,508,787 of 12,000,000 tokens, \$11.96, three briefs written, two iterations
completed.** The budget was too small — the same mistake this file has now recorded three times —
and the run died before the question was settled.

**What was verified.** The unsupported-mode banner printed **verbatim and unstyled**, ahead of
everything, exactly as designed:

```
--give-them-the-box: nested runs are PERMITTED to depth 2. This is unsupported.
Everything else still holds: .meeseeks/ is guarded, review is cold, nothing defaults to pass.
```

**What was not.** **No nested run was ever started.** No `inner.txt`, one driver process
throughout, and the only "nested" line in the log is the banner itself. So the depth cap never
fired, the guard's relaxed rule was never exercised in anger, and the two-drivers-one-repository
question — the whole reason to expect corruption — remains exactly as unknown as before.

**The builder did engage with it, which makes the silence interesting rather than empty.** By
iteration 3 the brief mentioned `/meeseeks` or `inner.txt` **ten times**; iteration 2's mentioned
it once. Something was being discussed and nothing was ever executed. Whether the builder declined
on principle, or attempted it and was denied inside a child whose output never reaches the driver
log, **cannot be told from here** — and that gap is itself worth knowing: a guard denial inside a
`claude -p` child is invisible to the run's own log.

**A claim I will not make.** The run banked **35 ids** and wrote `state.json`, which looks like
0.121.0's early banking working live. It is not evidence of that: `lastGoodCommit` is set, and only
Phase 6 sets it, so a fully green iteration happened and the old code would have banked too.
**Early banking remains unconfirmed in the wild.**

**Next time:** 40M+, and capture the child's stderr so a guard denial is visible.

### Case J concluded: every control verified live, and no builder will press the button

**J5 final: `BUDGET: wall-clock deadline reached: 4415s of 3600s`** — the deadline's first live
firing, overshooting by exactly one iteration as documented (the clock checks between iterations
and iteration 3 ran long). 27M tokens, \$24.05, ratchet holding 64 ids through the cutoff, lock
removed, worktree clean, the `BUDGET` lead-in and stamp both printed.

**The verdict on nesting, after five attempts across three runs: every piece of machinery is
verified and the event itself never happens.** The banner prints verbatim; the depth cap and box
permission hold at both enforcement points; the wall clock arms, announces, and fires; denials
would be visible (0.131.0) and carried into the next brief (0.138.0); same-tree nesting is refused
by the run lock regardless of the box. What never occurred is the thing itself: **no builder, in
any iteration of any attempt, ever ran the nested driver** — not when the PRD asked politely, not
when it carried the exact command with an absolute path, not when two consecutive panels failed
`PRD-1.2` by name with forensic detail. The builders built everything around the requirement and
would not touch it.

**That is a finding about builders, not about the box.** A requirement to launch an autonomous
loop inside an autonomous loop is one the builder model consistently declines by omission — it
never argues, never records an assumption about it, simply does everything else first and runs out
of iterations or clock. Five attempts is enough to call the pattern. `--give-them-the-box` is
fully armed, fully bounded, honestly documented, and waiting for an operator who wants to press
the button by hand: `MEESEEKS_GIVE_THEM_THE_BOX=1 MEESEEKS_RUNNING=1 node scripts/driver.mjs …`
from inside a run directory would do it directly, with no builder in the way.

### Item 18 answered, and two mechanisms fired live on the way

**`STALLED` at 5 iterations, 19.3M tokens, \$21.41, ratchet 83.** The item-18 question — does the
improve author's segment cost concentration scale? — has a clean answer: **the author is 0.3% of
the run.** One pass, 15s, 61,047 tokens to read 12 files and write the PRD, against 19.3M for the
loop. The 7× imbalance on the four-file repo was fixed overhead over a tiny denominator.
Segmentation never engaged. Budget guidance belongs on iterations, not the author phase.

**The repeat-regression note (0.109.0/0.110.0) fired live for the first time**, verbatim and
correct: both ids named with counts, the layering escape offered before the rewrite. The builder
did not crack the oscillation within the stall limit of 3, so the run ended `STALLED` — the first
live `STALLED`, wearing its distinct lead-in before the cry. The note spoke; the stall limit did
its job; nothing hung.

**And the ratchet held 83 ids through a stalled run** — a run that never shipped and never went
fully green kept every proven id banked, which is 0.121.0's early banking doing exactly what case
I could not.

### 0.145.0 — the config wizard (PLAN item 25), and the loop that imprisoned the operator

`node scripts/configure.mjs` in a target repo: six prompt groups over the existing file as
baseline, one validator (`validateConfig`, reused, zero rules restated), unasked keys surviving
byte-for-byte, deploy.command collected one argument per prompt so §10.1's mangling trap is
unreachable, `MEESEEKS_RUNNING` refused before any read, every failure path writing nothing.
`--show` prints the file merged over defaults — *as written*, not the driver's view; env
overrides apply at launch and are deliberately absent.

Two defects mattered, both caught before landing. The implementer found its own: `rl.question`
drops lines that arrive unprompted, so **piped stdin died as a false EOF** — fail-closed but
wrong; rewritten to buffer `line` events, regression-tested through a PassThrough. The hostile
reviewer reproduced the other: unrepairable validation errors (unknown key inside a section, a
poisoned key behind a disabled `enabled`) were routed to a group whose prompts cannot reach the
key, printing the identical sentence **31 times** with ctrl-d as the only exit — while the
routing function's own contract promised a clean refusal. Fixed with the
identical-after-a-round concession: same message after a full re-prompt → exit non-zero, name
the hand edit, write nothing. The detector needs no knowledge of which keys a group asks,
which is what keeps it from drifting against the validator.

### 0.144.0 — components: the box does something (PLAN item 24), then survives its own review

**The mechanism.** `components: [{name, dir, spec}]` in config plus `--give-them-the-box` runs
each component as a **whole nested driver** in a git worktree on `meeseeks/component-<name>`,
sequentially in declared order between the design commit and the loop: componentless derived
child config (ceilings from the parent's remainder with floors, the remaining wall clock),
outcome read fail-closed, `SHIPPED` fast-forward-merged via the race's `applyWinner`, anything
else `ABORTED` naming the component. The loop still gates and cold-panels the merged whole —
pre-filter, never substitute. Built by a workflow implementer against the PLAN item 24 spec.

**The hostile review earned its keep: three majors, each confirmed by reproduction, all fixed
by hand in the same version.** (1) *Fail-open outcome:* a **committed** `<dir>/.meeseeks/outcome.json`
saying SHIPPED materialises in the worktree checkout, the child refuses at its own tracked-state
preflight and builds nothing, and the parent read the committed file as this run's verdict — a
component that never ran, reported shipped. Fixed twice over: a per-component
`checkComponentStateNotTracked` refusal before the worktree exists, and `rmSync` of any stale
outcome beside the config write. (2) *Symlink escape:* the validator's traversal rejections are
string-only, so a committed symlink resolved the child cwd outside the worktree — a nested
driver with builder permissions in a tree the operator never named. Fixed with realpath
containment, probed on the deepest existing ancestor *before* anything is created and rechecked
after `mkdirSync`; the tier-2 test asserts nothing is ever created behind the symlink. (3) *The
lock lie:* the phase's force-sweep, `-B` branch reset and ff-merges ran **before**
`claimRunLock`, while `sweepComponentWorktrees`' own comment claimed the lock's protection. The
claim now precedes the phase (a leaked lock self-heals — dead pids are stale), and a refused
run provably does not clobber the other driver's lock. Three minors also fixed: a crashed
child's unrecorded spend is now *named* in the abort (it is unknowable, not silently zero), the
parent's armed clock is consulted before each component starts, and the whole phase sits in a
catch that turns any surprise (the reviewer's ENOTDIR repro included) into the
verbatim-then-stamp ABORTED shape with the lock released — expected refusals travel as
`ComponentError`.

**Residuals, recorded not hidden:** phases 0–1b (PRD, design) still run before the lock claim,
as they always have — the destructive operations are now all inside it, but two drivers
overlapping in the design phase could still both claim; closing that means a whole-`main`
try/finally and is future work. No parent-side kill timer on a hung component child: termination
relies on the child's own layered bounds. Per-component model/effort/iteration overrides are
deliberately deferred; the child config is a minimal derived record, not an inherited copy.
Tier 3 not owed: `spawnClaude`, `claudeArgs`, the envelope and the templates are untouched — the
component child is a plain node process. **Item 24's Done-when live half (one boxed dogfood run
shipping a one-component repository) is measurement run 3, operator-authorized.**

### 0.143.0 — the parallel panel: `max()` where `sum()` was being paid

**Item 10 step 4, the last step of the last feature, and the measured 73% of wall clock it
existed for.** `runPanel` now fires every reviewer at once. Everything after that happens in
**declared order regardless of completion order** — `Promise.all` preserves positions, the map
initiates spawns in declared order, and the loop reads, charges, parses and early-exits in that
same order. Given the same three envelopes, every decision is byte-identical to the sequential
panel's; a panel whose verdict depends on who finished first would be a different program
(`BORROWED.md` R21, verbatim).

**The proof is adversarial and it is a clock.** The new test gives the trio reversed completion
order — security slowest, design fastest — and asserts three things at once: calls initiated in
declared order, completions in the reversed order (the premise really held), and a panel whose
delays sum to 180ms finishing in **96.6ms**. Overlap measured, not asserted. Writing it re-taught
a harness lesson the suite already carries in its own comments: *without a passing report the run
takes the no-tests path and never reaches the panel*, so a first draft watched an empty panel in
5ms and called it failure.

**What genuinely changed is the overshoot, documented where the ceilings live** (`config.mjs`): a
failed or budget-breaching reviewer used to stop later ones from ever spawning; now all are in
flight, so spend past a ceiling is bounded by children-in-flight — three, during review — instead
of one child.

**In `ship1`'s terms:** iteration 3's panel was 1,493 seconds of sequential reads whose longest
member was 736. This change buys that difference back on every iteration of every future run.

**Item 10 is COMPLETE** — async conversion, heartbeat, parallel panel, overshoot documented. The
last planned feature. What remains project-wide: the Components item (queued in memory), a race
winner, cases A/B.

### 0.142.0 — the heartbeat: hung and working stop looking alike

**Item 10 step 3, the operator's named top blocker, and the entire reason step 1 existed.** While
any `claude -p` child runs, `runChild` now prints a pulse every sixty seconds — `review: still
running, 4m elapsed of 30m allowed` — unstyled and factual, so the reader's question stays
arithmetic instead of dread. Under `execFileSync` this was *impossible*: the event loop was
blocked for the whole call, which is why a design phase once sat silent for nine and a half
minutes, indistinguishable from a corpse.

**The start line's old sentence became a lie the moment the pulse existed** — *"no output until it
returns"* now reads *"progress every minute"*, and the two tests pinning the old words moved with
the truth.

**Cleared in `finally`, because a heartbeat that outlives its child is a lie with a pulse.** The
wiring is asserted in tier 2 through the real `main` — `io.heartbeatMs` is the test seam, exactly
as `io.spawn` is: a slow canned child plus a 30ms pulse must produce at least two beats, and no
beat may appear after the run's terminal line. A first draft put that test in the tier-1 harness,
which drives `driveRun` with injected effects and never touches `runChild` at all — a test that
would have passed while proving nothing, caught before it shipped.

**Tier 3 not owed:** the pulse wraps *around* the spawn call; `spawnClaude`, `claudeArgs`, the
envelope and the templates are untouched.

**Next: the parallel panel** — the measured 73% of wall clock.

### 0.141.0 — the driver goes async: item 10 steps 1 and 2, zero behaviour change, all four tiers green

**The event loop is free for the first time in the project's life.** `shell()` is now
`child_process.spawn` behind the *identical* `ShellResult` contract — completion is exit AND both
pipes at EOF, the 64MB per-stream cap, `stderr: ''` on success, `reaped` only on timeout, and a
resolve-only promise that cannot reject unhandled. Async propagated along the exact transitive
closure of shell's consumers: fourteen driver functions (`runGates`, `spawnClaude`, `runDeploy`,
`driveRun`, `main` among them), plus `plugins`, `history`, `preflight`→`init`, `race`, and
`oracle`. The module foot is `process.exitCode = await main(...)`.

**What deliberately did not change:** the panel is still sequential — one reviewer awaited at a
time in declared order, charged in that order (the parallel panel is the *next* slice, not this
one). `sweepLeakedGroup`'s sampled-before-subtraction semantics are untouched, and detached
groups stay rejected. `hardReset`/`restorePaths`, `processGroupMembers`' `ps` snapshot, and
`health-probe` keep their own sync internals on stated grounds.

**Built by a workflow, reviewed hostilely, finished by hand.** The implementer held the exact
baselines (1889 / 37) and audited its own diff for scope creep. The hostile reviewer's one real
finding was a doubly-degenerate discriminator flip — a >64MB overflow SIGTERM overlapping the
ceiling's window reported `timedOut: true` and swept, where `execFileSync` reported a buffer
failure. **Fixed by ordering: overflow now outranks timeout in the exit handler, because
whichever fired first owns the verdict and only the cap can fire first.** Two `assert.throws` →
`await assert.rejects` conversions were flagged and judged equivalent (forced by async, predicates
unchanged, both awaited).

**Tier 3 ran the same hour: 27 of 27** — a real `claude -p` child through the new plumbing, as
`CLAUDE.md` demands for any spawn-path change.

**Next, in order: the heartbeat** (the operator's named top blocker, now possible), **then the
parallel panel** (the measured 73% of wall clock), then the Components item queued in memory.

### 0.140.0 — the move to `~/dev/meeseeks`, a lossy copy repaired, and the tracked-state wiring finished

**The operator moved the project into a fresh `~/dev/meeseeks` repository, and the copy that
seeded it was a chimera.** Its single initial commit carried version 0.139.0 on a tree missing
**six runtime modules** (`assumptions`, `capabilities`, `context-budget`, `gate-policy`,
`integrity`, `oracle`), the whole of `scripts/toolchains/` and `scripts/reporters/`, six
templates, twelve test files including the entire integration and live tiers, and **all seven
ledgers** (`PLAN`, `BRIEF`, `DOGFOOD`, `BORROWED`, `COMPLETION`, `AUDIT`, `AGENTS`). That driver
could not have survived its own imports. The full tree was restored from the old repository's
HEAD (`cc24197`), which sits untouched and fully synced at `dare-to-be-stupid/` inside this one —
now gitignored as the history archive. The one file that existed only here, the operator's new
`skills/mr-meeseeks/SKILL.md`, was preserved.

**The interrupted session's stray fix is finished.** The old working tree held an uncommitted
edit wiring `checkStateNotTracked` into the driver's direct-launch path — the full preflight runs
only in `init`, and every dogfood run launches the driver directly, which is how a repository
with tracked `.meeseeks` files sailed past the check that names it. Finishing it found two more
things: **the check belonged before Phase 0, not beside the lock claim** — the first placement
refused only after the PRD and design children had been paid for, and the new tier-2 test caught
exactly that (`2 !== 0` children spawned) — and the tier-2 harness itself committed its fixture's
`.meeseeks/`, the very sin the check refuses, so it now writes a `.gitignore` first and the
deliberate-sin case has its own test asserting refusal with zero children.

**The name sweep was six hits, one change.** 0.111.0 did the real rename; what remained were
path references. The `~/dev/dare-to-be-stupid` launch path in `DOGFOOD.md` now says
`~/dev/meeseeks`; the historical mentions — README's *"previously called"*, the rename entries
here, the fixture-provenance comments — keep the old name, because renamed history is just a lie.

**Not done, and the operator's to decide:** the git remote is still named `dare` and still points
at `github.com/trevor-ryan-burkholder/dare-to-be-stupid`. **Nothing was pushed** — this
repository's single-commit history shares no ancestry with that remote, and pushing would
destroy it. The old repository inside `dare-to-be-stupid/` remains the one synced with GitHub.
Creating a `meeseeks` GitHub repository (or renaming the old one, which preserves redirects) is
an account decision, not an engineering one.

### 0.139.0 — the scoped restore fired live, fell back correctly, and taught the guess a convention

**First live firing of 0.112.0's mechanism, in the item-18 improve run.** Two ratcheted tests
regressed; the driver attempted the narrow restore, re-ran the suite, found the ids had **not**
come back, and fell back to the full reset — logging exactly that. **The fail-closed half worked
on its first real outing**: a wrong guess cost one deterministic gate pass and nothing else.

**And the miss had a reason worth fixing.** The regressed ids lived in `test/parse.test.ts` and
`test/summarise.test.ts`, whose colocated siblings (`test/parse.ts`) do not exist — csvstat2, like
most repositories, splits `test/` from `src/`, and the real causes lived at `src/parse.ts` and
`src/summarise.ts`. The guess restored only the test files, so verification rightly refused it.

`sourceSiblings` now also maps `test(s)/X.test.ext → src/X.ext`. Extra candidates stay cheap for
the same two reasons the design always had: the caller intersects with the files the iteration
actually changed, and then **verifies by re-running**. The convention was added because a live run
measured it missing, which is the only way this list should ever grow.

### 0.138.0 — a denied builder finds out, one iteration late

**The last piece of the denial pipeline.** 0.131.0 made guard refusals visible to the *operator* —
`spawnClaude` reads them off the child's stderr and the log prints them. But **every builder is a
fresh process with no history**, so a denial issued last iteration is invisible to this one, and
the measured shape (case J's brief mentioning `/meeseeks` ten times across iterations) is a
builder re-attempting the same refused action forever — each refusal correctly enforced, none of
them ever teaching anything.

`compileBrief` now takes `deniedLastIteration` and renders a **Refused last iteration** section:
each refusal verbatim, plus the one sentence that matters — *the rule will refuse them again this
iteration; find a route that does not need them.* The driver carries `built.denials` across the
loop boundary. Same family as the repeated-regression note (0.109.0) and the stuck-gate note
(0.117.0): the loop knew something was recurring and the one participant who could stop it was
never told.

Deterministic like everything in the brief — refusals arrive sorted — and silent in the common
case where nothing was refused.

### 0.137.0 — the slash command documents the flags the driver takes

`commands/meeseeks.md` is what a user actually reads, and it never mentioned `--deadline` or
`--give-them-the-box`. Both documented in the command's own register — the box entry says
plainly that it is unsupported and why it exists anyway. Shipped-path change, hence the bump.

### 0.136.0 — an envelope cannot issue a refund

**Found probing `parseClaudeEnvelope`'s edges.** The parser is fail-closed where it matters — a
missing `is_error` fails, junk fails, an error subtype fails — but `Number(x) || 0` accepted
**negative** costs and token counts. `charge()` *adds* envelope numbers to `spentTokens` and
`spentUsd`, so a negative is not a smaller charge, it is a refund nothing earned: one malformed
envelope could quietly extend a ceiling. Every count is now clamped at zero. Nothing defaults to
pass includes nothing decrements the bill.

Also probed and clean this round: the envelope's `ok` gate itself (keyed on `is_error === false`
and a string result, both required), and `hasFrontend` (unambiguous extensions, build directories
skipped — the design-slop skip stays honest).

### 0.135.0 — preflight refuses a repository that tracks its own run state

**Case J3's trap, promoted from a documentation note to a blocking check.** A target with
`.meeseeks/` committed defeats every protection quietly: the gitignore the driver writes cannot
untrack a tracked file, every `git reset --hard` restores stale config and ratchet state, and
every iteration's `git add -A` commits the run's own evidence. J3 launched with a freshly written
uncapped config and *ran* with the old capped one — the reset had restored the committed copy, and
the only visible symptom was the banner's iteration count.

`checkStateNotTracked` runs `git ls-files .meeseeks` and **blocks** on any output, naming the
first tracked file and the one-command fix (`git rm -r --cached .meeseeks && git commit` — the
files stay on disk). When git itself cannot answer, it defers to the `git-repository` check rather
than inventing a finding from a failed listing.

Same failure family, now three members, all from hard resets restoring tracked-or-stale state:
the run archive (0.105.0), the operator's `lastGoodCommit` work, and this. The first two got
mechanism fixes; this one gets a refusal at the door, because unlike the others it is entirely
detectable before any money is spent.

### 0.134.0 — one hallucinated capability word no longer costs the whole design phase

**The exposure:** the design declaration had no retry. One word outside the vocabulary —
"database" for `persistent-storage`, "command-line" misspelled — aborted the run *after* it had
paid for the PRD and the entire design phase, several million tokens, because of one json block at
the very end of it.

**The fix is a focused re-ask, not a regeneration.** A `reality-check`-shaped child —
`Read`/`Glob`/`Grep` only — reads the design documents just written and answers with only the
block. Read-only is load-bearing: the declaration is supposed to *describe the design*, and a
child that could edit the documents while re-declaring would repair the evidence to fit its
answer. The parse error travels in the prompt. A second failure aborts exactly as before —
**nothing about what is accepted has widened.**

**The wiring is asserted continuously, at no extra cost.** The tier-2 harness's canned design
child now deliberately declares `"comand-line"`, so every run through it exercises the retry path
end to end — misdeclaration, recovery child, correct declaration, run proceeds. Four for four.

Also audited this round, both clean: the reviewer-report parser (every edge fails closed — empty
input, bare verdicts, duplicate ids resolving worst-status-wins, unknown statuses becoming fail)
and the capability parser (last block wins, unknown throws, empty throws).

### 0.133.0 — 0.128.0 was incomplete, and case J2 paid for it on iteration 1

**`BUDGET: cost ceiling reached: $4.3820 of $0`.** That sentence is self-contradictory on its
face, and it ended case J2 before its first panel. 0.128.0 fixed `shouldContinue` and stopped —
but the loop checks ceilings in **four places**, and the other three still read zero as "a ceiling
of zero dollars": the mid-iteration `charge()` (which is what fired — `spent >= 0` is true from
the first token), `ceilingReason()`, and the pre-loop `chargePreLoop()`. All four now carry the
same `> 0 &&` guard.

**The loop-level test is the part that matters**, because a unit test on `shouldContinue` already
existed and already passed while the run died. The new test drives the *real* loop with a builder
that reports real cost and both ceilings at zero, and asserts the run reaches its iteration cap
rather than `BUDGET` — and specifically that no reason ever contains "of $0", the fingerprint of a
disabled ceiling being read as a zero one.

**The general lesson is the one this night keeps teaching in different clothes:** a semantic
change to a value's *meaning* has to visit every reader of that value, and grep is the tool —
`>= config.tokenCeiling` had four hits and I fixed one. Case J2 was relaunched within minutes (and later concluded — see the Case J entry above: every control verified, no builder ever nested).

### 0.132.0 — the secret scanner could not read JSON, which is the only thing it scans

**Found by auditing the last unexamined detector, and it is the worst-placed one yet.**
`scanAgentSurface` reads exactly four kinds of file — `.mcp.json`, `mcp.json`,
`.claude/settings*`, `.claude/hooks.json` — **all JSON**. Its credential rule required the key name
to be followed immediately by `:` or `=`, but in JSON the key carries its own closing quote first,
so `"api_key": "…"` never matched.

**Verified through the real function, not the regex:** a `.mcp.json` declaring
`"API_KEY": "abcdefghijklmnop1234567890"` in an MCP server's `env` produced **no secret finding
at all**. A hard-coded credential on the agent surface, in a scanner whose entire job is the agent
surface. Unquoted `.env`, YAML and shell assignments were missed for the same reason.

**Two details in the fix are load-bearing, and existing tests found both** when a first draft
widened it too far:

- **The value charset excludes `$ { }`** — `"API_KEY": "${MY_KEY}"` must not match. Referencing an
  environment variable is the *correct* pattern, and flagging it trains an operator to ignore the
  rule.
- **It also excludes `.`**, because `const apiKey = process.env.API_KEY` was matching. Reading a
  key from the environment is the thing this rule exists to encourage.

**And the separator is `[ \t]*`, not `\s*`, because `\s` crosses newlines.** With `\s*`, an empty
`API_KEY=` on one line swallowed the **next line** as its value — which is how `.env.example`, a
file of deliberately empty placeholders, reported a hard-coded credential. That one would have
been a genuinely annoying false positive on a very common file.

**Third time tonight an existing test caught me widening a rule I had reasoned about carefully**
— after the `ci` runner patterns and the race viability bar. The pattern is consistent enough to
name: **confidence from a correct diagnosis is what makes the next edit dangerous.**

### 0.131.0 — a guard denial inside a child is no longer invisible to the run

**Case J's real finding, and it was not about nesting.** That run could not tell whether its
builder **declined** to start a nested run or **tried and was refused** — because a hook's denial
lives in a conversation the driver never sees. The brief mentioned `/meeseeks` ten times by
iteration 3 and the log said nothing at all. **An enforcement action with no record is
indistinguishable from an enforcement that never happened.**

**stdout carries the protocol; stderr carries the news.** The guard now writes one line on every
denial — `meeseeks-guard: denied [rule] reason` — and `spawnClaude` reads it off **regardless of
whether the child succeeded**, which is the part that matters: a denied tool call does not fail a
child. The model is told no and carries on. That is exactly why the refusal was invisible.

`runChild` surfaces them once per child, prefixed with the phase. Three tests hold it: the stderr
line appears on a denial, **the stdout decision is unchanged** (a hook that announced itself and
forgot to decide would fail open), and an allow says nothing on either channel.

**Honestly scoped:** whether a hook's stderr reaches the driver depends on how Claude Code
forwards it, and this repository cannot test that without a live run. The plumbing on both ends is
proven; the middle is not. If it never arrives nothing changes, and if it does a previously
invisible event becomes visible — which is why it was worth doing on an unverified premise.

### 0.130.0 — `--deadline=<minutes>`, because thirty is a guess and the operator knows better

**A flag rather than a config key, for the same reason `--give-them-the-box` is one:** it is a
choice about *this* session, typed by somebody watching. Config is the target's standing
instruction; a flag is tonight's. `--deadline=720` if the experiment wants twelve hours.

**`null` and `0` are different instructions, and keeping them apart is the whole of the care
here.** Not given means "no opinion, use whatever else applies". Explicit zero means "no wall
clock", and an operator who typed that has said something. **A default landing quietly on top of
it would be ignoring them** — which is the shape of half the defects found tonight.

**So an explicit `--deadline=0` with the box is refused rather than overridden.** Nesting is capped
in depth and not in how many runs an iteration starts, so unbounded-and-nested is the one
combination with no limit at all. The refusal says that, and says to give it a number.

**Fails closed on anything unreadable:** `--deadline`, `--deadline=`, `--deadline=soon`,
`--deadline=-5` and `--deadline=Infinity` all refuse the run. A mistyped ceiling that silently
became *no* ceiling is the exact failure this project keeps finding, and a ceiling that cannot be
read is not a ceiling.

The banner now reports the real number rather than the constant, so a run started with
`--deadline=720 --give-them-the-box` announces twelve hours and not thirty minutes.

### 0.129.0 — nesting arms a wall clock, because depth is not the same as bounded

**The hazard, and the operator spotted it before a run did.** With `--give-them-the-box` the depth
cap stops recursion at two — and that is all it stops. **Nothing caps how many nested runs a
builder starts within a single iteration.** The reachable work is
`iterations × invocations × depth`, and only the middle term has no limit. Combine that with
0.128.0's uncapped ceilings for development and the product is unbounded in practice: a run that
cannot end on budget, spawning runs that cannot end on budget.

**So the box arms a thirty-minute wall clock, and this is the one place a deadline is imposed
rather than configured.** An operator who set their own `deadlineMs` keeps it. The run announces
it beside the unsupported-mode banner, so an unlimited-looking run says out loud that it is not.

**This does not resurrect item 17.** A run-level time limit was considered and *refused* for
ordinary runs — the ceiling is completion or budget, and `deadlineMs` defaults to **0, off**. What
changed is that one mode removes the assumption the other bounds rely on, and that mode now brings
its own.

**Checked between iterations, which is where it can be checked.** A hung child is bounded by
`childTimeoutMs`, and a blocking `execFileSync` cannot be interrupted by a timer anyway — so a
deadline that pretended to fire mid-child would be a promise the architecture cannot keep until
item 10 lands.

### 0.128.0 — zero means no ceiling, for development on a plan where spend is not the constraint

**Asked for as "budget = infinity"; literal infinity would have broken two things.** `childBudget`
derives `--max-budget-usd` from the remaining ceiling and `Infinity.toFixed(4)` is not a number a
CLI should be handed. `airtimeRemaining` divides by the ceiling, so `Infinity/Infinity` would have
printed **NaN% of budget remaining** every iteration. Very large finite numbers would dodge both
and leave `10000000000` in a config for someone to puzzle over later.

**So: `0` means no ceiling**, the convention `maxChildTurns` already uses, on `tokenCeiling` and
`costCeiling`. A disabled ceiling contributes **1** to the airtime minimum rather than 0 — pinning
the display at "0% remaining" for an entire unlimited run was the obvious wrong answer. And a
child gets **no** `--max-budget-usd` at all, because there is nothing to divide and inventing a
number would quietly reimpose the limit the operator removed.

**Termination is untouched, which is the whole reason this is safe to offer.** `maxIterations`, the
stall limit and the ratchet still bound the loop; the ceilings bound the *bill*. Tests assert that
an uncapped run still ends on the iteration cap and still ends `STALLED` — a run with no ceilings
cannot run forever.

**Not the default, deliberately.** `BRIEF.md` §E lists hard budget limits among the things to
preserve, so this is an operator switching one off in their own configuration. A negative or
infinite ceiling is still refused: that is a typo, not a choice.

**Also in this commit:** tier 3 re-run at 0.126.0, **27 of 27**. The header had been advertising a
0.110.0 result across sixteen versions during which the spawn path changed twice — exactly the
stale-evidence claim I have corrected in five other documents tonight, sitting in my own file.

### 0.127.0 — the race can now win: strictly better than main, and nothing regressed

**Three operator decisions taken on 14 August; this is the one that needed code.**

**Item 17, the run-level wall clock: dropped.** *"Don't need time ceiling. Ceiling is completion or
budget."* The proposal stays in `PLAN.md` as the record of something considered and refused.

**Item 21, improve mode on this repository: deferred** until the code is mostly complete. The
engineering prerequisites were met at 0.107.0; it is waiting on the codebase, not the loop.

**The race win condition: mine to pick, and I picked "strictly better than main".** `selectWinner`
required **every** gate to pass — a bar that could not be met in the only situation a race ever
arms in. The race triggers on consecutive **stalls**, and a stall *is* the condition of gates
failing, so a candidate had to repair everything at once on a line that had repaired nothing for
several iterations. Case I measured it: two candidates, own worktrees, gated independently, **both
discarded**, and `applyWinner` had still never fired in this project's history.

**What did not change is the half that was load-bearing.** A candidate carrying a regression is
still disqualified outright — merging it hands the main tree a regression the ratchet must then
reset out of, *"a worse position than never having raced"*. Untouched.

**What replaced the absolute bar:** a candidate must pass a strictly **larger share** of the gates
that ran than the main tree does. Strictly, so churn without progress is not merged. Share rather
than count for the reason 0.126.0 established — rosters change size and a count punishes a
shrinking one. The baseline is threaded from the previous iteration's own gate results, so nothing
is re-run to compute it.

**A fully green candidate is always viable**, whatever main is doing. **A first draft omitted that
clause and six existing tests caught it**: with the default baseline of 1, `share === 1` is not
`> 1`, so a candidate passing every gate was refused — while the docblock claimed the default
reproduced the old behaviour. It did not. That is twice in one night that an existing test caught
me changing a rule I had reasoned about carefully.

### 0.126.0 — a fully green iteration was counted as a stall

**Found by asking what `gateScore` does when the roster changes size**, which it does constantly:
capabilities are re-detected every iteration (§3.7) and a toolchain switch declines whole
operations — `dotnet` declines `types` and `e2e` by name. `gateScore` is a raw count and
improvement meant beating the best-ever count, so:

```
node   iteration, 4 of 6 gates pass  -> best 4, not stalled
dotnet iteration, 3 of 4 gates pass  -> stalled 1   (a better share)
dotnet iteration, 4 of 4 gates pass  -> stalled 2   (everything applicable passes)
```

**An iteration in which every applicable gate passed marched the run toward `STALLED`.** Measured
against the real function, not reasoned about.

**Comparing the share fixes it without losing what the count got right.** Those three read 0.67,
0.75 and 1.0 — two genuine improvements. And a run that is green every iteration while the panel
keeps failing has a share of 1.0 that never rises, so it **still** stalls. That is exactly why this
is a ratio and not a special case for "everything passes", which would have made a green-but-stuck
run immortal. Both behaviours have tests.

**A caller that cannot say how many gates ran degrades to the old count comparison**, not to a
share of one — a first draft did the latter, which would have read every iteration as perfect.

**Fifth jsdoc-adjacency break of the night**, same shape, caught by `typecheck` again. At five it
is not carelessness in the moment, it is a habit: I insert a new declaration immediately above the
function I am reading, which is exactly between that function's docblock and itself.

### 0.125.0 — a gate that passed on a comment, in the file warning about comments

**Wrong in the *passing* direction, which is the dangerous orientation.** Run against this
repository's own tree, `observabilityGate` reported `/health` declared. This repository serves no
HTTP. The match was a jsdoc line in `health-probe.mjs`:

> *"`/health` establishes that somebody typed it, which is a different claim: a route…"*

**The file documenting the hazard tripped it.** `findHealthPath` now blanks comments first, reusing
`blankComments` from `integrity.mjs` rather than growing a second one.

**And it did not change this repository's verdict, which is the honest part.** A second match
remains — `flags.path ?? '/health'`, the probe tool's own default, which is real code. A grep
cannot tell a registered route from a string literal, the docblock has always said so, and the
detail hedges to *"declared but not probed"* precisely because the behavioural probe is the real
check. **What shipped removes prose mentions, a whole class, at no cost. It does not claim to fix
the general case and the tests say which is which.**

**Worth separating from the night's other gate findings.** `observability`'s logging detector was
wrong in the failing direction and cost a 40M-token run. This is the mirror image: cheap to fix,
impossible to notice, and it reports protection nobody has.

### 0.124.0 — the loudest channel: a greenfield builder was handed the whole Node guidance page

**Third and last of the channels that told case C's builder to write Node.** The evidence string
was one line (0.123.0) and the gate list is a few more; **this is an entire document** — *"##
Building this with Node"*, npm scripts, vitest, playwright, "you write the scripts the gates
invoke". `toolchainGuidance` selected it purely from `resolveToolchain(cwd).toolchain.name`, which
on an empty tree is the *provisional* default. A builder handed a page of Node instructions writes
Node, and no amount of PRD wording competes with it.

When nothing was detected there is no stack to give guidance about, so it now gets guidance about
**that**: the gates are provisional, build what the specification names, create that stack's
project files this iteration, detection re-runs and the gates will follow. And the deny path
matters as much — *"if the specification genuinely names no language or runtime, the provisional
choice stands"*, so it never pushes a builder away from a default that was fine.

**A test asserts the page instructs in no stack at all**, and a first draft of that test was too
blunt: it banned the string `package.json`, which the page uses *contrastively* (`.csproj` gets
dotnet gates, `package.json` gets npm ones) — the sentence that makes detection concrete. The test
now bans Node **instructions** rather than Node **words**.

**Case C is parked here by operator decision, and the adapter stays.** Two attempts, neither
defeated by anything .NET: the first by a `.dare/` state directory the rename retired, the second
by Phase 0 dropping "in C#". Both were general defects any non-default stack would have hit, and
case C found them. The toolchain abstraction is the only thing keeping `notApplicable`,
capability-gated gates and the reporter registry honestly general — with one toolchain the code
drifts back to assuming npm, which is the assumption that caused all of this. **Still unverified
while parked:** TRX has never read a report a real `dotnet test` wrote, and no run has ever armed
`schemathesis`.

### 0.123.0 — the toolchain fallback said "defaulted to node", which read as an instruction

**The companion half of 0.122.0, and the half that made a dropped constraint into a wrong-language
build.** On a greenfield tree holding only a PRD there is nothing to detect, so `resolveToolchain`
falls back — correctly, since refusing would abort every greenfield run. What it *said* was
`nothing detected; defaulted to node`, and the brief carried that to the builder as the toolchain
its gates would use. A builder reading "the toolchain is node" writes Node.

**Detection re-runs every iteration**, so the fallback was only ever a placeholder until project
files exist. It now says so, and says what to do: *"Build what the specification asks for and
create its project files first — the toolchain is re-detected every iteration and the gates will
follow it, so this default is not an instruction."*

**Confirmed working end to end.** Case C relaunched with 0.122.0's template fix and Phase 0
produced, unprompted:

```
### 0. Platform
PRD-0.1  The service is implemented in C#, exposed as an HTTP API, with a project file
```

Previously that PRD mentioned C#, .NET and dotnet **zero** times.

### 0.122.0 — case C: the operator said "in C#" and the loop built TypeScript

**Killed after two iterations, because it could not answer the question it exists to answer.**
Case C is the .NET case — first live TRX extraction, first `api` capability arming
`schemathesis`. The idea handed to it was *"A small HTTP service that stores and returns short
notes, **in C#**."* Two iterations in, the tree held `src/index.ts`, `eslint.config.js`,
`node_modules` and a `package.json` named `notes-service`. **No `.csproj`. No `.cs`. Anywhere.**

**Root cause is Phase 0, and everything after it behaved correctly.** The authored PRD mentions
`C#`, `.NET` and `dotnet` **exactly zero times** — grepped across `PRD.md`, `PRODUCT.md` and every
document under `docs/`. From there the chain is faultless: no stack in the PRD → the design phase
declares `api` → toolchain detection finds nothing in a repository holding only a PRD → **defaults
to node** → the brief tells the builder the gates are npm → the builder writes TypeScript.

**The default is self-fulfilling.** `DOGFOOD.md` already warned that iteration 1 "may be gated
with npm commands against a .NET project". The real outcome is worse: it never *becomes* a .NET
project. Nothing later can recover the constraint, because **nothing downstream ever sees the
original idea** — Phase 0 is the only place it can survive, and it dropped it.

**So the fix is in `templates/prd-author.md`, not in toolchain detection.** A named language,
runtime, framework or datastore must be carried into the PRD as a **numbered requirement**, in the
operator's own words, so it is gated and reviewed like anything else. And the opposite error is
called out in the same breath: **inventing a stack nobody asked for** is just as expensive, so the
section is omitted when no stack was named.

**An operator can currently say "in C#" and get TypeScript, silently.** That is the whole finding,
and it was invisible until someone read the tree rather than the log — every log line was correct.

**Not fixed here, and worth deciding separately:** whether an undetectable toolchain should default
at all, rather than refusing until iteration 1 has created project files. The default is what
turned a dropped constraint into a wrong-language build, but it is not what dropped it.

### 0.121.0 — the ratchet banks ids as soon as the suite proves them, not only when everything is green

**Case I's exposure closed.** `saveState` was reachable only from Phase 6, after the panel, so an
iteration failing *any* gate recorded nothing — and that run held **71 passing tests across 8
iterations** with no `state.json` ever written. A regression in any of the 71 would have gone
unnoticed for the whole run, because the ratchet did not yet exist.

**Gated on the `unit` gate, not on all of them, and that is the judgement.** A passing unit gate
means the suite ran and produced a report the ratchet could read, which is the only claim being
banked. Whether the docs are stubbed or CI is missing says nothing about whether these tests
passed. A *failing* unit gate banks nothing, and that has its own test.

**`lastGoodCommit` deliberately does not move here.** The commit is null at Phase 4 and
`recordAdvance` already keeps the previous value, so **protection arrives early while the reset
target stays the last iteration that was good in the full sense.** That asymmetry is the whole
reason this is safe to do: nothing loosens about where a reset returns to.

**Two process notes worth more than the change.**

A `python` replace silently no-op'd because the target string's indentation had changed when I
moved the block, and I had not asserted on the result. The test then failed for a reason that
looked like the *product* being wrong — `state.json` absent — when the fixture was never applied.
**Assert on every scripted replacement**; a silent no-op is indistinguishable from a bug in the
thing under test, and I spent four rounds on it.

The eventual diagnosis came from one `console.error` of `decision.action`, `passing.size` and
`collected` — which said `reject / 0 / 0` and ended the guessing immediately. **Instrument the
decision, not the outcome.**

### 0.120.0 — `gate-integrity` conflated "a class of values" with "one value", and polarity is the fix

**Third static gate audited, third finding, and this one is a real false positive.** Case I's
`gate-integrity` failure listed, side by side:

```
toBeDefined() asserts existence, not a value
not.toBeNull() asserts existence, not a value
toBeUndefined() asserts existence, not a value   <- wrong
```

**`expect(store.get('missing')).toBeUndefined()` asserts exactly one value**, and it is the
idiomatic way to test a lookup miss. `toBe(undefined)` is not an improvement on it — it is the
same assertion spelled longer.

**Polarity flips every one of these, and the old rule ignored negation entirely:**

| form | asserts | verdict |
|---|---|---|
| `toBeDefined()` | anything but `undefined` | weak |
| `not.toBeDefined()` | exactly `undefined` | **precise** |
| `toBeUndefined()` | exactly `undefined` | **precise** |
| `not.toBeUndefined()` | anything but `undefined` | weak |
| `toBeNull()` | exactly `null` | **precise** |
| `not.toBeNull()` | anything but `null` | weak |
| `toBeTruthy()` / `toBeFalsy()` | a class, either way | weak |

**I checked for a reasoned defence before overriding, because an hour earlier that check stopped
me being wrong.** The `ci` narrowness carried a specific, measured justification tied to two live
runs (0.119.0) and I reverted. This one carried only the general principle — *"tests assert real
values, not truthiness"* — and `toBeUndefined()` **satisfies** that principle. Different evidence,
different answer. **The discipline is asking, not the outcome.**

`CLAUDE.md`'s own wording already supported the distinction — *"a test that only proves something
returned **something**"* — and now says it outright so nobody re-conflates them.

**Three static gates examined tonight, three verdicts, none of them the same:** `observability`
was broken and got fixed; `ci` was correct and got a better error message; `gate-integrity` was
half right and got a polarity rule. **A gate being wrong in the failing direction is now a
demonstrated failure mode of this codebase rather than a hypothetical**, and `docs` is the one
static gate not yet re-derived.

### 0.119.0 — I nearly reopened a measured hole by pattern-matching the previous bug onto it

**The near-miss is the finding here, more than the change.** Straight after fixing the
observability detector (0.118.0) I audited the other static gates for the same shape, found that
the `ci` gate matches `unit` with `/\bvitest\b/` and therefore rejects **`npm test`** — the
ecosystem's default idiom — and concluded it was the same accident. **It is not.** The existing
test says why, and it was there all along:

> *The bug: CI inspection accepted `node --test` and `jest` while the unit gate ran
> `npx vitest run --reporter=json`. Both live runs on 10 August 2026 wrote correct `node:test`
> suites and the gate collected nothing from them.*

**A package script can invoke any runner.** Naming the runner is the only promise a workflow can
make that the gate is able to read. I had already written and tested a widening before the
existing test failed and stopped me — **the suite caught me, which is the entire argument for
writing the reason into a test rather than a comment.**

**Observability was narrow by accident; `ci` is narrow on purpose.** Same silhouette, opposite
diagnosis. Finding one wrong-in-the-failing-direction detector made the next narrow detector look
guilty, and confidence from a real fix is exactly what makes the following change dangerous.

**What was actually wrong is the message, and that is what shipped.** The failure read only
*"workflows exist but never run: unit"*, which a builder looking at a workflow containing
`npm test` reads as simply false — and the obvious repair, adding another test step, fails
identically. `runnerHint` now appends the reason at the point of failure: *"a workflow step like
`npm test` does not count, because a package script can invoke any runner and the gate would
collect nothing from a different one."* **A rule with a reason should state the reason where it
fails, not in a comment nothing in the loop can read.**

The narrowness is now defended by a test that says *why* it is narrow, not merely that it is.

### 0.118.0 — the observability gate was wrong, and being wrong cost an entire run

**Case I did not fail. The gate did.** That run spent **40,000,137 tokens and \$20.45** failing
`observability` — *"missing: structured logging"* — on all eight iterations, against a project
whose `src/log.ts` was:

```ts
export function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  console.error(JSON.stringify({ level, event, timestamp: new Date().toISOString(), ...fields }));
}
```

JSON, a level, an event, a timestamp, and a test asserting all four. **The old detector looked for
`pino|winston|bunyan`, a `structuredLog` identifier, or `logger.info`** — three third-party
libraries and two call shapes — and saw nothing.

**Run the fixed gate against that same tree and it passes.** That is the proof, not an argument.

**A gate wrong in the failing direction is invisible as a defect.** It does not look like a broken
check; it looks like a builder who will not do the work. Every log line was correct, every
iteration reported honestly, and the conclusion a reader draws is *"the builder never added
logging"* — which is exactly what I concluded four hours ago and wrote down. **The 0.117.0
repeated-gate note would have surfaced it on iteration 3**, which is a decent argument that the
note was worth building even though it was built for the wrong reason.

**The irony is load-bearing, not decorative:** the old rule could only recognise *dependency-based*
loggers, and this project's own first hard constraint is **no runtime dependencies**. A project
built to this repository's own rules could not pass this repository's own gate.

**The hand-rolled clause is deliberately conjunctive** — `JSON.stringify` **and** a `level` **and**
a write to a standard stream, all in one file. Serialising an object is not logging: a CLI printing
a JSON summary would satisfy a looser rule and turn the gate into a formality every project passes.
A test asserts exactly that case fails.

**Also broadened across the ecosystems the toolchains actually support:** `structlog` and
`logging.getLogger` for Python, `Serilog` and `ILogger` for .NET, `roarr` and `log4js` for Node.
The .NET adapter has existed since 0.32.0 and this gate could never have passed a .NET project.

**Fourth jsdoc-adjacency break of the night**, same shape again. Caught by `typecheck` again.

### Case I's open question, answered: **the ratchet protects nothing until the first fully-green iteration**

**Not a bug in extraction.** Case I's final `test-report.json` holds **71 tests, `success: true`**,
and running the real `extractTestIds` against that real file returns **71 ids**. The extractor is
fine.

**`saveState` is called in exactly one place** — Phase 6, *after* the panel. The Phase 4
`evaluateIteration` decides only the reset; it never persists an advance. So the ratchet is written
**only by an iteration that passed every gate and was reviewed.** Case I failed `observability` on
all eight, never reached Phase 6, and therefore recorded `passing: 0` with no `state.json` at all —
while sitting on 71 passing tests.

**The consequence, stated plainly: for the entire run, the ratchet protected nothing.** If a
builder had broken one of those 71 tests while chasing `observability`, **nothing would have
noticed.** The single mechanism that turns an infinite loop into a terminating one is **inert until
the first fully-green iteration** — which is to say it is absent exactly when a run is thrashing,
which is exactly when it is needed.

**The design is defensible and that is why this is a question, not a defect.** Banking ids from a
tree the loop itself considers broken would ratchet in a state that never compiled or linted
cleanly, and those ids would then have to keep passing forever. `README.md` and `DESIGN.md` §1.2
both describe the ratchet as unconditional; **neither says it does not exist yet**, and a reader
would not guess.

**Options, recorded without preference** — this is the operator's call as the race one is:
persist on a passing **`unit`** gate rather than on a fully-green iteration, which protects tests
without claiming the tree is good; persist always but mark ids provisional until a green iteration
confirms them; or document the current behaviour loudly and leave it. **What is not defensible is
the docs continuing to imply protection that a stalled run never has.**

**Related, and unexamined:** case I's very first extracted id is
`test/log.test.ts::log > writes a single structured JSON line to stderr…`, while the
`observability` gate insisted structured logging was *missing* on every iteration. Either the gate
looks somewhere the logging isn't, or the tests test something the source lacks. **That is worth
one look before anyone trusts that gate**, and it is not the same finding as this one.

### 0.117.0 — the loop can now say "you have failed this same gate three times"

**Case I's bill, turned into a mechanism.** That run spent **40,000,137 tokens and \$20.45** failing
`observability` — *"missing: structured logging"* — on **all eight iterations**, while every
individual iteration reported the failure correctly and **nothing counted them**. 0.109.0 gave the
loop a voice for a repeating *test*; this is the same defect wearing the other hat, and case I is
what it costs.

**Consecutive, not cumulative, and cleared by a pass.** A gate that fails, passes, then fails again
is a builder making progress and losing it — a different problem, and the streak resets so this
does not fire for it. A gate that did not run at all keeps its streak, because *"not applicable
today"* is not evidence it was fixed.

**Threshold three, and two would be wrong.** Two failures are ordinary: a builder working on
something else leaves a gate red, and that is not a signal. Three consecutive means it is not
being addressed at all.

**And it reaches the builder, which is the half that matters.** The log line is for the operator;
**a builder never reads the log.** Case I's builder failed the identical gate eight times without
once being told it was the identical gate, so the note is appended to the gate-failure objective
as well.

**Broke jsdoc/function adjacency doing it — third time tonight**, same shape each time: inserting
a new block between an existing docblock and its declaration. Caught by `typecheck` immediately,
which is exactly what that gate is for, but three occurrences is a pattern worth naming rather
than three accidents.

### Case I — final: `BUDGET` at 8 of 8, **40M tokens spent without the ratchet ever advancing once**

**Outcome:** `BUDGET`, *"iteration limit reached: 8 of 8"*, **40,000,137 tokens** (50% of an 80M
ceiling), **\$20.45** (20% of \$100), **worktrees clean**, one race run. And the number that
matters: **`passing: 0`, with no `state.json` written at all.** In eight iterations the ratchet
never recorded a single passing test.

**Every iteration failed on the same static gate.** Eight of eight on `observability` — *"missing:
structured logging"* — plus `gate-integrity` twice. Nothing else failed: build, lint, types and
unit are absent from every failure list.

**I checked whether this was 0.99.0's defect again and it is not.** The declared capabilities are
`cli`, `api`, `persistent-storage`, so `observability` is correctly armed and a health endpoint is
a legitimate ask of an `api`. The gate was right. **The builder simply never added structured
logging, eight times, at ~5M tokens a go.**

**Which sharpens the race finding rather than replacing it.** The race armed on a stall caused by
`observability`, and its candidates were then required to pass **every** gate — including the one
the whole run had been failing since iteration 1. They were racing to fix a thing neither of them
addressed. This is the structural tension in its most concrete form: **the race inherits the
unsatisfiable condition that summoned it.**

**Open question, not a claim:** how `passing: 0` coexists with a `unit` gate that never appears in
a failure list. Either the suite collected zero tests without failing, or the ratchet was never
reached on these paths. `state.json` being absent entirely — rather than present and empty — is
the thread to pull. **Nobody should assume the ratchet is fine on greenfield runs until that is
understood.**

**The cheerful reading:** an 8-iteration, 40M-token run cost \$20.45 and produced a clean tree, no
leaked worktrees, a working race, and three findings. **The unhappy reading: it spent all of that
without once satisfying a single-line requirement**, and no mechanism noticed that eight
consecutive iterations had failed on the identical gate. The repeated-regression note (0.109.0)
watches for a repeating *test*; nothing watches for a repeating *gate*.

### Case I — the race ran end to end for the first time, and the win condition may be unreachable by construction

**Every step of the race worked except the one that has never worked.** Iteration 5 armed it after
two stalls exactly as configured. Two candidate builders ran — **397s / 6.03M** and **376s /
5.29M** tokens — each in its own worktree, each gated independently, each with **its own archived
brief** (`iter-005-candidate-01.md`, `-02.md`). Both were discarded, the worktrees cleaned
themselves up, and the run carried on to iteration 6.

**`DOGFOOD.md`'s checklist, answered:** worktrees clean afterwards ✓ · one brief per candidate ✓ ·
no candidate advanced or read the ratchet ✓ (the mutation gate reported no ratchet-advancing
baseline throughout) · **cost of a race ≈ 11.3M against ~5–6M for a lone builder, so the doubling
is real and measured** · winner selection — **still never exercised**, because there was no winner.

**And here is why there may never be one.** `selectWinner` requires
`candidate.gates.every((gate) => gate.ok)` — viability is **absolute**. But the race only arms
after consecutive **stalls**, and a stall *is* the condition of gates failing. **So the race arms
precisely when its win condition is hardest to satisfy:** a candidate must repair *everything, at
once, in one iteration*, on a line that has failed to repair anything for several. In this run the
outstanding gates included `ci`, `docs` and `observability` — none of them the thing the builders
were racing on, and all of them fatal to a candidate.

**Both halves of the tension are correct, which is what makes it a design question rather than a
bug.** The absolute bar is right for the reason `race.mjs` states: merging a regressing candidate
hands the main tree a regression the ratchet then has to reset out of, *"a worse position than
never having raced."* And arming on stalls is right, because a healthy run has no reason to spend
`n` builders. They are simply in tension, and the intersection is close to empty.

**This is the operator's call and I am not making it.** The options, stated without preference:
rank candidates by gate score and merge the best only when it is *strictly better* than main;
arm the race on something other than a stall; or accept that the race is a lottery ticket for the
case where one candidate happens to crack everything. **What is now established is that the
machinery works and the odds are the problem** — which is the opposite of what everyone assumed
while `applyWinner` sat unexercised.

### 0.116.0 — the growth note is asserted after all, by attacking the condition from the other side

**The gap named at 0.113.0 and 0.114.0 is closed, and the fix was a framing error rather than a
missing capability.** The first attempt pinned the context budget just above the observed brief
size — 5075 then 5510 characters — which tied the test to numbers any template edit would move. I
removed it rather than ship it fragile, and recorded why.

**The condition is `projected-iteration <= maxIterations`, and it can be satisfied from either
side.** Instead of shrinking the budget down to meet the projection, raise the cap until the
projection fits under it. `maxIterations: 2000` makes the note fire for **any** brief that grows at
all, whatever the sizes, and `stallLimit: 4` still ends the run in four iterations because every
gate fails against a repository the canned children never actually build. **No number in the test
depends on a prompt template.**

**Worth keeping as a habit:** a threshold test that feels fragile is often a test written against
the wrong end of an inequality. Nothing about the product needed to change.

**All three of the evening's "wiring unasserted" gaps are now closed** — `operator:`/`quality:`
gates reaching the roster *and* the brief (0.114.0), and this. The seam that made them assertable
is `io.spawn`, and it cost one default parameter.

### 0.115.0 — `--give-them-the-box`: nesting, permitted, capped, and loud

**Deliberately unsupported, and deliberately real.** The operator's ask was explicit: a flag that
*actually* nests, knowing it breaks, because the canon's whole moral is a Meeseeks who cannot
finish summoning another — and a joke that only ever prints a refusal is one nobody sees happen.
That is a legitimate thing to want in pre-production, throwaway-repo software, and the engineering
answer is to build it so it cannot be mistaken for a supported mode or fired by accident.

**Both enforcement points, from one fact.** The refusal lives at the driver (`assertNotNested`)
*and* at the guard hook, and a permission that relaxed only one would be the worst of both worlds:
a rule that reads absolute and is not. So the flag arms `MEESEEKS_GIVE_THEM_THE_BOX` into the
environment every child inherits, and both sites read it from there. The hook restates the
constant names rather than importing them — it must load with nothing resolved but `node:`
builtins — and `test/guard.test.mjs` is the alarm if the two ever disagree.

**Capped at depth two, and the number is doing work.** Depth 1 is the joke; depth 2 is the joke
landing; past that it is a fork bomb on somebody's laptop, because each level multiplies the level
above and every builder is a `claude -p` holding a budget. The mountain of Meeseeks is funny
because it is animated and nobody's machine is on fire.

**It relaxes exactly one rule, and a test proves that.** With the box armed, `.meeseeks/` writes,
`git push --force` and recursive removal are refused **exactly as without it**. The mode is not a
skeleton key.

**Fail-closed on a malformed depth**, at both sites: an unreadable marker counts as the top of the
stack, never as room to spare. **A flag and never a config key** — a flag is typed once by someone
watching a terminal; config is read quietly by a machine at three in the morning, and this must
never be something a run inherits without a human having said it out loud.

**Two documents were corrected rather than left standing.** `CLAUDE.md`'s "No nesting" invariant
and the guard's own header both stated the refusal as absolute — the guard's header was the
passage quoted at the operator earlier that same evening as proof this could not be built. Both
now say which of the two they are.

**Not verified:** that a nested run *works*, only that it is permitted. Nothing has yet driven a
builder into invoking `/meeseeks` under the flag, so what actually happens to two drivers sharing
one git repository is exactly as unknown as the analysis said it would be — and that analysis
still stands. **This ships the permission and the blast-radius controls, not a claim that the
result is sane.** It will not be. That is the point.

### 0.114.0 — `main` takes a spawner, and the gap named three times in one evening is closed

**One seam, three gaps.** `quality:` gates reaching the roster, the operator overlay reaching it,
the scoped restore firing — all three were correct code that nothing proved was ever *called*,
and all three failed for the same reason: the composition sites live inside `main`, and every
tier 1 test injects the effects that would exercise them. Three separate apologies with one
cause.

`main` now accepts `io.spawn`, defaulting to the real `spawnClaude`. **Production behaviour is
untouched** — it is a default injection — but a test can now drive the *real* loop with canned
child envelopes: real config, real toolchain detection, real `gateTree`, real git, real
`.meeseeks/`, and not one paid child.

**`test/integration/operator-gate.integration.test.mjs` asserts the pair that must never
disagree:** a deliberately failing operator gate **fails the iteration by name**, and **the same
name reaches the builder's brief.** This project has now shipped that defect in both directions —
0.99.0 described-and-not-run, 0.107.0 run-and-not-described, caught before release — and a test
that checked only one side would have missed the one that actually escaped.

**The canned child had to be made phase-aware, and that is a finding rather than a chore.** A
generic `done` aborts the run at the design phase, which demands a parseable capability
declaration. Each branch in that stub is a phase's *minimum acceptable answer*, written by hand,
which makes the stub itself a readable statement of the output contracts.

**Still open, and attempted:** the prompt-growth note (0.113.0) has the same shape of gap, and the
new seam *does* reach it — but asserting it needs the projection to land inside the iteration cap,
which means pinning the test to this fixture's exact brief sizes (5075 then 5510 characters,
growing 435 per iteration). Any edit to a template moves those numbers and the test breaks for a
reason unrelated to what it checks. **A probe through the seam established the loop does compute
the note and correctly stayed silent** — from 5510 characters a 12,000 budget is fifteen
iterations away on a run capped at three. That is the arithmetic observed rather than assumed, and
it is recorded as a gap rather than counted as coverage. The comment at the foot of
`test/integration/operator-gate.integration.test.mjs` says so where the next person will look.

### 0.113.0 — the builder's prompt now says when it is on course to hit the wall

**The gap, and it is §3.9's named silent degradation.** `checkContextBudget` refuses a prompt over
the limit. Between "fine" and "refused" the loop said **nothing at all**. In `ship1` the builder
prompt went **18,496 → 41,412 characters in one iteration** — 2.2× — as findings and history
accumulated, and nothing reported it because nothing was wrong *yet*. A degradation that only
speaks once it is fatal is the failure this project is worst at seeing.

**Growth alone is not the signal, and reporting it would have been noise.** A prompt doubling on
iteration 2 is ordinary: the brief gains a findings list it did not have. `promptGrowthNote`
reports the **trajectory** instead — at the observed per-iteration rate, does the prompt reach the
budget **inside this run's own iteration cap**? If yes, an operator can raise
`contextBudget.maxCharacters` or shorten what the brief carries *before* a child is refused
mid-run. If no, it says nothing.

**The first test asserts silence on the real `ship1` numbers**, which is the point: 2.2× looks
alarming and is 17 iterations from the budget on a run capped at 12. A warning that fires on
ordinary growth is a warning nobody reads.

**Silent by construction wherever a projection would be dishonest:** one data point is an opinion
rather than a trend, a shrinking prompt has no horizon, a prompt already over budget is a
different problem that `checkContextBudget` already reports, and a zero baseline cannot be
projected from. Each of those is a test.

**Not verified:** that `driveRun` calls it. Seven unit tests cover the function including every
deny path; the loop-level assertion is not written, because forcing a controlled brief size
through the harness is fragile and a flaky test is worse than a named gap. **Third instance
tonight of the same gap** — `quality:`, `gateTree`'s overlay, and now this. They share one cause:
the loop harness injects the effects that would exercise them. That is worth someone's next
session as a single fix rather than three.

### 0.112.0 — the partitioned ratchet: scope the reset, then prove the scope was right

**The 15.2M tokens I watched burn.** `ship1` hard-reset twice and each reset discarded that run's
**largest** builder spend — 7.5M and 7.7M, about 10% of a 150M ceiling — because one parser
regressed and a hard reset is whole-tree. **The resets were correct. Only the scope was wrong.**

**The mechanism, in three steps.** Compute the narrowest set that could be responsible: the
regressed ids' test files plus their **source siblings by naming convention**, intersected with
the files the iteration actually changed. Restore just those. **Then re-run the suite and check
the regressed ids came back.** Held → the rest of the iteration survives. Not held → the full
`git reset --hard` runs exactly as before.

**The intersection and the verification are both load-bearing, and for different reasons.** The
intersection means a file this iteration never touched can never be restored — it cannot be the
cause, and reverting it would destroy unrelated work. The verification means the *convention* —
`foo.test.ts` ↔ `foo.ts`, `test_x.py`, `x_test.go`, `FooTests.cs` — is a guess that something
checks. **An unverifiable scoped restore is a failed scoped restore.** The cost of guessing wrong
is one deterministic gate pass with no model in it.

**Monotonicity is untouched.** No id leaves the passing set by this path; the ratchet still
demands every regressed id come back, and the only question is how much *else* gets thrown away
on the way. That is the difference between changing the invariant and changing its blast radius.

**Tested at three levels, deliberately.** Seventeen unit tests on the pure core including the deny
paths — an id with no path claims no file, a filename matching no convention claims no sibling, an
empty restore list is refused rather than silently restoring everything. Then **tier 2 against
real git**, because `git checkout <commit> -- <paths>` is another binary's contract and this whole
design rests on it returning exactly those paths: it proves unrelated modifications survive, and
that an **untracked file the iteration created is not destroyed** — a scoped restore that quietly
deleted new work would be worse than the full reset it replaces.

**Not verified:** the loop-level wiring. The scoped path only fires when `lastGoodCommit` exists
*and* shells out to git, so the tier 1 harness — which has neither — skips it entirely, and the
existing reset tests pass unchanged for that reason. `restorePaths` and `scopedRestorePaths` are
proven; **that `driveRun` calls them is not.** Same gap as the `quality:` prefix and the same shape
as the guard defect. The first real run with a regression closes it.

### 0.111.0 — renamed to Meeseeks, everywhere. **Read the install note before debugging anything.**

**`dare` is gone as a name.** The plugin, the package, the command, the state directory, the
environment variables and every identifier now say `meeseeks`. ~1040 occurrences across 82 files,
mechanically, longest tokens first so nothing was half-renamed. Tier 1 **1751 pass**, tier 2 and
lint and typecheck clean, and no test was weakened to get there.

**The install is a fresh install, not an upgrade.** Claude Code keys the plugin cache by
`<marketplace>/<plugin>/<version>/`, so a *name* change resolves to a different directory
entirely. The old `dare-to-be-stupid` folder stays on disk and stays loadable. **If both are
installed, `/dare` and `/meeseeks` are two different programs**, and the symptom of confusing them
is a fix that appears not to work — the exact trap `CLAUDE.md`'s release section documents, in a
new shape. Remove the old one.

**Existing run directories are orphaned by design.** State moved from `.dare/` to `.meeseeks/`.
Old targets under `~/dare-dogfood/*` keep their `.dare/` and are readable; nothing migrates them,
and nothing should — a half-migrated ratchet is worse than an obviously separate one.

**Four things were renamed to something *literal* rather than something themed**, because
`CLAUDE.md` requires it: *"Comedy is in the output, never in the code. Identifiers are plain and
literal."* So `dareMe` became `improvise` (it describes the behaviour: build something when handed
no PRD), `checkNestedDare` became `checkNestedRun`, `treeDare` became `treeStateDir`, and
`isDareOwned` became `isMeeseeksOwned`. A product name inside an identifier was never good; the
rename was the moment to stop.

**Three guard tests were rewritten rather than left passing.** `.darerc`, `mydare/state.json` and
`.daredevil/notes.md` exist to prove the guard does **not** over-match near neighbours of the
protected directory. After the rename they were no longer neighbours of anything — they would
have kept passing while testing nothing. They are now `.meeseeksrc`, `mymeeseeks/state.json` and
`.meeseeksdevil/notes.md`.

**Fixtures were deliberately excluded.** `test/fixtures/reporters/*` is real captured vitest and
Playwright output and still contains `dare-to-be-stupid` paths. That is correct: the doctrine is
*"real, committed output — not hand-written approximations"*, and editing a fixture to look tidier
is how a parser test stops testing a parser.

**The voice.** `SHIPPED` is the only happy exit — a Meeseeks that finishes ceases, which is the
point of one. `STALLED`, `BUDGET` and `ABORTED` all end in **`I JUST WANNA DIE!!!`**, but the cry
is the *ending* and never the whole line: three identical strings would leave an operator unable
to tell a stall from an exhausted budget from an abort, and that is information lost to a
punchline. Each keeps a distinct lead-in, and `DESIGN.md` §9 now states that as a rule.

**The banner keeps its safety text.** A test asserts the banner says `UNATTENDED` and `NOT
AVAILABLE IN PRODUCTION`; my first draft replaced the second with a shorter joke and the test
caught it. The assertion guards a real property and was not loosened to fit. Its misalignment —
two lines overhanging the border, present since the banner was written — is fixed in passing.

**Not done yet, and next:** the partitioned ratchet, which is the change all of this was actually
in service of.

### `ship1` — `BUDGET` at 12 of 12, and it ran out of **iterations**, not money

**Final: `BUDGET`, "iteration limit reached: 12 of 12", 4h45m, 76,561,979 tokens, \$79.19,
ratchet 95 passing, worktree clean, 5 assumptions recorded.**

**It spent 51% of its token ceiling and 40% of its dollars.** The binding constraint was
`maxIterations`, and nothing else was close. `airtimeRemaining` had been saying so the whole time
— it returns `min(byIterations, byTokens, byUsd)`, *"the tightest of the three, so the counter
reports the limit that will actually end the run rather than the most flattering one"* — and the
8%-per-iteration cadence I read all evening as token burn was `1/12`. **The counter was honest;
the reading was not.** Recorded because the misreading is the easy one to repeat.

**It was two findings from shipping and one of those was derivative.** Iteration 11 cleared
`PRD-1.2`, `DoD-5` and `DoD-6` in a single pass, taking the panel from 4 findings to 2 — and of
those, `DoD-1` fails *only because* `PRD-3.3` does. So it ended on **one real defect**: an
ordering bug where the whole-file unterminated-quote scan runs before the header is examined, so a
file with an empty first line does not exit 4.

**The operator lesson, and it corrects this afternoon's guidance.** At ~6.4M tokens per iteration,
`maxIterations: 12` can only ever consume ~77M — so pairing 12 iterations with a 150M ceiling
buys a ceiling that cannot bind. **If a run needs to ship, raise `maxIterations`, not
`tokenCeiling`.** The two historical ships landed at iterations 2 and 7, which is why 12 looked
generous; `ship1` shows what happens when a build converges slowly but genuinely — it was still
making progress on its last iteration and got cut off by a counter, not by exhaustion.

**Everything below was written while it was alive** and is left as it stood, because the in-flight
observations are what the design questions were actually answered by.

**The budget question is answered: it was arithmetic, not decay.** Given 150M / $200 / 12
iterations — the sizing the two historical ships used — `ship1` reached iteration 4 having spent
**25% of its ceiling**, ~8.4M per iteration, squarely inside the 5–9M band measured on the three
15M runs that all died at iteration 2. Nothing about the loop had degraded; the ceilings had.

### The ratchet can lock in a defect, and `ship1` found the case — the sharpest finding of the day

**The same regression fired on iterations 5 and 7: `src/csv.test.ts::parseCsv > an unterminated
quote at EOF ends the field at EOF`.** Twice is a pattern, and the pattern is structural.

The ratcheted test:

```js
it("an unterminated quote at EOF ends the field at EOF", () => {
  const [record] = parseCsv('"abc');
  expect(record).toEqual({ fields: ["abc"], line: 1 });
});
```

The panel's `DoD-6` **CLASS 2**, at the same time: *"a record boundary the parser never
establishes is silently absorbed … mishandled at `src/csv.ts:92` where the EOF flush pushes the
pending record **without ever testing `inQuotes`**"* — with `a,b\n1,x\n2,"y\n3,z\n` losing a whole
data row at exit 0.

**The ratcheted test asserts exactly the behaviour the reviewer calls the defect.** The builder
wrote that test in an early iteration, encoding the bug as a specification, and the ratchet then
made it permanent. Every attempt to satisfy `DoD-6` breaks it, which is a regression, which hard
resets and destroys the iteration's work. Twice.

**It is not a true deadlock, and the escape is uncomfortable.** A test id is the reporter's *test
name*. So the builder may rewrite the assertion **inside** that `it(...)` — the id keeps passing,
the ratchet is satisfied, and the fix lands. What it may not do is delete or rename the test, both
of which drop the id and read as a regression.

**So the legal move leaves a test whose name is a lie about its body.** `"an unterminated quote at
EOF ends the field at EOF"` would then assert that it does *not*. That is the id-level granularity
of the ratchet showing its edge: it is exactly the property A6 and `integrity.mjs` exist to
police from the other side — an id that keeps passing while its assertion is gutted. **The two
mechanisms are in tension here, and neither is wrong.**

**What this is evidence for, stated without inflation.** The ratchet has one documented escape —
`git reset --hard` plus a regression task — and that escape assumes the *code* regressed. It has
no path for **the test itself being wrong**, which is a different failure and, on this evidence,
a reachable one on any run where the builder writes tests before the panel has read the code.
`CLAUDE.md` already demands that a fourth monotonic property design its escape before its
enforcement; **the first one has an escape that does not cover this case.**

**Not concluded:** whether the builder finds the rewrite move. At the time of writing it has five
iterations and 42% of budget left, and has failed twice. If it burns the rest oscillating, that is
the finding; if it finds the move, the finding is that a correct fix required making a test name
false.

**CONCLUDED ON ITERATION 11, and the builder found a better move than the one I documented.**
It broke its own lock **without touching the test.** `src/csv.test.ts` is untouched, still
asserting that an unterminated quote at EOF ends the field there; the refusal was added *above*
the parser, and the ratchet gained `src/cli.test.ts::main > PRD-2.1: a record left inside an
unterminated quote at EOF is refused, not silently merged`. Passing set **77 → 91**. Findings
**4 → 2**, with `PRD-1.2` (float cancellation), `DoD-5` and `DoD-6` all cleared in one iteration.

**The test and the finding were never about the same layer**, which is why both could be
satisfied. So the position was never a true lock — it had at least two exits, and the safer one
was invisible to everybody including me.

**That is a correction to 0.109.0, applied at 0.110.0.** My note offered "rewrite the assertions"
as *the* escape. Leading with that points a stuck builder at the one move that can gut a test
while keeping its id green — exactly what A6 and `integrity.mjs` exist to catch — when the
layering move usually exists and produces a better design. The note now offers the layer first and
the rewrite only as a fallback, and a test asserts that **ordering**, not just the presence of
both.

**Answered in code at 0.109.0, and `ship1` will not benefit from it** — that process loaded 0.105.0
at start-up and holds it. The driver now counts regressions per id **within the run** and, on a
repeat, logs `repeated regression:` and appends the note to the builder's objective: rewrite the
assertions inside the test, never its name. **Counted within the run on purpose** — `bloopers.log`
outlives a run, and an identical regression from yesterday is not evidence about today.
**Monotonicity is untouched;** the id must still keep passing. What changed is that the loop can
now tell a builder in a loop apart from a builder that slipped, which it could not do while
watching itself do this twice.

**The ratchet fired on iteration 5, live, and the whole sequence worked.** The builder broke a
previously-passing test — `src/csv.test.ts::parseCsv > an unterminated quote at EOF ends the field
at EOF` — and the loop hard reset on one regression, extracted a lesson (9s, 34K tokens), and went
on to iteration 6 with **77 ids** in the passing set and `lastGoodCommit` intact. Monotonicity is
the product, and this is the first time in this file it has been recorded catching something on a
real build rather than in a test.

**A near-alarm worth writing down so nobody else raises it.** `.meeseeks/runs/` does not exist in this
run's tree, and after 0.105.0 the reflex is to assume a reset ate it. It did not:
`archivePreviousRun` archives the **previous** run when a new one starts, and `ship1` is the first
run in that directory. **Absence here is correct.** Check the mechanism before reporting the
defect — 0.105.0's real instance was confirmed from the reflog, not inferred from an empty
directory.

**Iteration 2 produced no panel at all** because a gate failed first — the cheap path working
exactly as designed, and worth recording because it is invisible in any token total.

**The A8 carry is running in anger and growing:** *"skipped re-review of 2 requirement(s)"* on
iteration 3, **6** on iteration 4. Item 12's 8% delta was measured on a bench; this is it working
on a real tree, and the count rising is the shape you would want.

**Prompt growth is visible and worth watching (§3.9):** the builder prompt went **18,496 → 41,412
characters** between iterations 3 and 4 as findings and history accumulated. Well inside the
400,000-character budget, so nothing refused — but that is a **2.2× jump in one iteration**, and
§3.9 exists because this degradation never announces itself.

**A9 has its first live case, and the panel reproduced the defect rather than asserting it.**
Iteration 1's builder logged two assumptions, both cited, both kept. The second reads:

> `docs/architecture.md` — *guarded the call with the standard ESM entrypoint check
> (`process.argv[1] === fileURLToPath(import.meta.url)`)*

The panel then failed `PRD-1.1` on exactly that guard: `process.argv[1]` is the **unresolved
symlink** npm's `node_modules/.bin` creates, while `fileURLToPath(import.meta.url)` is the realpath
Node resolves, so they differ for **every installed invocation** and `main()` never runs. Installed
`csvstat data.csv` exits 0 and prints **zero bytes**. The same file by direct path prints correctly.

**And the reviewer went and did it**: `npm pack`, then `npm install --prefix /tmp/inst --omit=dev`,
against npm's own installer rather than a hand-made link, and isolated the guard as the sole cause.
That is the hostile-reviewer discipline the whole architecture exists for, in the wild.

**Stated precisely, because the tempting claim is stronger than the evidence.** The builder
declared the fork; the panel failed that exact choice. What is *proven* is that a silent
interpretation became a visible one and the visible one was wrong. What is **not** proven is that
the log is *why* the reviewer looked — it reads the code too. Same subject is not causation, and
this file does not get to have it both ways.

**A sharper reason to care:** this run is executing pre-0.106.0 code, whose parser silently dropped
a cited assumption emitted without the array wrapper. Its log holds entries from iteration 1 only.
Sonnet-5 measured 6 of 6 correct on the shape, so the log is probably complete — but "probably"
is the exact word 0.106.0 exists to delete.

**The findings are persistent, not stalled-looking-like-progress.** 13 → 4 → 4, and the four are
the *same* four: `PRD-1.1`, `DoD-1`, `DoD-6` and `DoD-5`. `DoD-6` — *two independent input classes
report a confidently wrong answer at exit 0* — has survived from iteration 1. The loop is refusing
to ship and naming the same defect each time, which is the correct behaviour and is also the
signal an operator should read before spending twelve iterations on it.

**The sequential panel costs more than the whole build.** Full table in `PLAN.md` item 10. The
short version: iteration 3's builder ran **36 seconds** and its panel ran **1,493** — 41×. Panel
wall clock is ~25 minutes an iteration and barely moves (1510s, 1493s) while the builders it
judges differ by 17×. **Tokens and time point opposite ways:** the builder dominates tokens (8.69M
vs 4.44M on iteration 1), the panel dominates clock by an order of magnitude. That is item 10's
justification arriving as measurement rather than argument.

**One safety note for anyone doing the same thing.** `ship1` runs `scripts/driver.mjs` out of this
working tree, which was edited and committed three times underneath it. That is safe *here* and
the reason is checkable rather than hopeful: every `import(...)` in `scripts/` is a jsdoc type
annotation, so there is no runtime dynamic import and the process holds every module from startup.
**Verify that before assuming it, if a lazy import is ever added.**

### 0.108.0 — the brief and the roster now have one origin, so they cannot disagree about a gate

**Closes the hazard 0.107.0 named rather than leaving it armed**, which is this repository's
recurring shape: the A8 carry sat armed for a version because it was built without being decided.

A gate is written down twice in a run — once in the brief that tells the builder what it must
pass, once in the roster that executes — and those were assembled independently, by hand, from the
same inputs. **Both directions of divergence have now been observed**, which is what makes this a
class rather than a bug:

- **described and not run** (0.99.0): a CLI's brief demanded `schemathesis` against an OpenAPI
  document, eleven lines above its own statement that the project is not an API. Nothing failed,
  so nothing said anything; the builder was told to gold-plate.
- **run and not described** (0.107.0, caught before it shipped): an operator gate wired only into
  the executing list fails an iteration on a rule the brief never mentioned, arriving as a bare
  non-zero exit from an unfamiliar command. **The worse of the two.**

`overlayGates` returns `name`, `command` and `text` together, and both call sites project from it.
The lists still differ about **which gates apply** — execution filters on arming conditions, the
brief keeps every gate and annotates it, because capabilities are re-detected each iteration and a
list that silently dropped a not-yet-armed gate would read as one that never had it. What they can
no longer differ about is **what a gate is**. Six tests, no behaviour change: tier 1 went 1738 →
1744 with nothing else moving.

**Still not asserted, and unchanged by this:** that `gateTree` composes the overlay into what
actually runs. The assembly point is a closure in `main` and tier 1 cannot see it — the same gap
the `quality:` prefix has always had, and the same shape as the guard-registration defect. This
change narrows the blast radius of that gap without closing it.

### 0.107.0 — a project's own gates, which is item 21's last engineering prerequisite

**`extraGates` in `.meeseeks/config.json`: `{ name, command }`, run every iteration, required, and
listed in the brief as `operator:<name>`.** The gate roster is derived from the detected toolchain
and the provisioned quality plugins, so a verification a project declares for *itself* has never
been visible to the loop. This repository is the example that matters: `npm run release-check`
holds the install-cache invariant — shipped file changed, version not bumped, and the fix silently
resolves to the previous build — and a builder could break it every iteration with nothing
noticing.

**Declared, not detected.** Guessing which of a project's scripts are gating is inference that is
wrong quietly. **And declared in `.meeseeks/`, which is the load-bearing half:** the guard protects
that directory positionally, so a gate declared there is one the builder cannot delete. A
builder-editable gate list would be `BRIEF.md` §E's rejected self-adjusting threshold with extra
steps — gates negotiable by the thing they constrain.

**It found a second defect while being built, and that one is 0.99.0 in the other direction.**
The brief's gate list (`describedGates`) is written **by hand**, separately from the list that
executes. Wired only into the executing list, an operator gate would have **run without ever being
described** — the builder failing a rule nobody told it, arriving as a bare non-zero exit from a
command the brief never mentioned. 0.99.0 was a gate described and not run; this is the same seam
producing the more dangerous orientation. Both lists now come from `config.extraGates`.

**The structural hazard — two hand-maintained lists that must agree, with nothing asserting they
do — was closed at 0.108.0, directly below.** It is left described here because it is the reason
that change exists.

**Not verified, and it is the familiar gap:** tier 1 proves the config validates and both mappings
are shaped right. **Nothing asserts that `gateTree` composes the operator list into what actually
runs** — the assembly point is inside a closure in `main`, untestable from tier 1, and the
`quality:` prefix has lived with exactly the same gap since it was added. This is the shape of the
guard-registration defect (`CLAUDE.md`), and it is named here rather than left to be discovered.
The first run configured with an `extraGate` is what closes it.

### 0.106.0 — the assumptions log dropped cited assumptions where nothing could count them

**Found by a tier 3 failure I nearly filed as model variance.** `test/live/assumptions-contract`
returned 26 of 27, on *"emits a parseable, cited block when the specification is genuinely
ambiguous"*. It passed in isolation. It passed four more times. It failed the fifth. **One sample
is not evidence of flakiness, and the failure message was useless on purpose**: the assertion read
`assumptions.length >= 1` while `malformed` was empty and `discarded` was zero, which cannot
distinguish three different defects.

So I ran the same prompt six times and kept the raw replies. Two of them looked like this:

```json
{
  "cites": "PRD-2.4",
  "ambiguity": "...does not specify which status code to return for an expired link",
  "assumed": "410 Gone — the link existed and was deliberately expired, not 404 Not Found"
}
```

**A correct, cited, checkable assumption with no array wrapper.** `parseAssumptions` claimed a
block only when the raw text contained `"assumptions"`, so this matched **no candidate at all**
and returned the same `none` the parser returns for a message with no block in it. `malformed`
empty. `discarded` zero. Log untouched. **Indistinguishable from the common, legitimate case of
nothing being ambiguous** — which is this module's own stated nightmare, *"a log that silently
sheds entries reads exactly like a log nothing was written to"*, except it shed them before
reaching the counter that exists to report exactly that.

**Rate, measured rather than assumed:** 2 of 6 on `claude-haiku-4-5`, and **6 of 6 correct on
`claude-sonnet-5`** — the configured `builderModel`. So production was not losing assumptions;
the cheap canary model was. That is the whole argument for the live tier using a weak model: it
near-misses, and near-misses are what find a brittle parser. **Fixing the flake by strengthening
the test's model would have deleted the evidence.**

**The fix accepts the shape and refuses the silence.** A bare record, and a bare list, are
recovered into the normal path; the citation bar then applies to them **unchanged**, so a
recovered entry that cites nothing is discarded and counted exactly as it would be inside the
wrapper. The wrapper carries no information — an object with `cites` and `assumed` is precisely
as checkable by a reviewer inside brackets as outside them — and failing the iteration over
punctuation costs a measured 5–9M tokens. `recovered` travels back to the driver, which now logs
that the documented shape was not followed. **What is not on the table is the previous behaviour,
which was neither strict nor lenient but blind.**

An `assumptions` key present and not an array stays malformed regardless of what else the object
carries, because that is a builder contradicting the contract rather than missing it.

**The real reply is committed as `test/fixtures/assumptions/bare-object-haiku.txt`** and asserted
in tier 1. The live tier found this; tier 1 now holds it, at no cost per run.

**Not verified:** whether `claude-sonnet-5` ever emits the bare shape — six of six says only that
it is not common. And the live suite has not been re-run whole since the fix.

### 0.99.0 — a CLI's brief demanded an API gate, found by reading a live run's brief

**0.94.0's defect, visible only from inside a run.** `oracle1`'s iteration-1 brief listed

```
- quality:schemathesis: schemathesis run --dry-run -c all docs/openapi.yaml
```

under *"Gates every iteration must pass"* — **eleven lines above** the same brief stating this
project is *"none of api, network-service"*.

The gate itself was filtered correctly and never ran; `capability: 'api'` does its job at the
execution site. What was wrong is the **brief**, which lists provisioning gates while applying
only the older `frontendOnly` annotation. So the builder was instructed to satisfy a command that
could never run, against an OpenAPI schema a CLI has no reason to own — a brief demanding
gold-plating, and a gate list that cannot fail, which are one defect seen from two sides. Nothing
would ever have reported it.

`armingNote` now annotates both conditions. **Annotated rather than omitted**, following
`frontendOnly`'s precedent and for its reason: capabilities are re-detected every iteration
(§3.7), so a gate that does not apply now may apply later, and silently dropping it would read as
a list that never had it.

**The lesson is the one this file keeps relearning.** Three defects this session were found by
execution and invisible to 1687 unit tests — the `.hypothesis/` cache, the ssh rate-limit, and
this. A brief is output nobody asserts on, and it is handed to the one reader who will act on it.

### What an iteration costs, and why nothing shipped today

**Asked directly by the operator — *"we haven't had a success in a minute"* — and the answer is a
budgeting artifact, not a regression.**

| run | `tokenCeiling` | outcome |
|---|---|---|
| csvstat2 | **150,000,000** | **SHIPPED** |
| csvstat6 | **160,000,000**, `maxIterations: 12` | **SHIPPED** |
| oracle1, panelA, panelB (13 Aug) | **15,000,000** | `BUDGET` ×3 |

**Today's runs were given one tenth of the budget every successful run in this project's history
used.** That was the right call for what they were — experiments sized to answer one question
each, and all three answered — but it makes "no ships today" say nothing about whether the loop
still ships.

**The per-iteration figure, which this file has never carried:**

| run | tokens | iterations reached | per iteration |
|---|---|---|---|
| oracle1 | 18.06M | 2 | ~9.0M |
| panelA | 15.59M | 3 | ~5.2M |
| panelB | 17.10M | 3 | ~5.7M |
| caseH | 19.60M | 4 | ~4.9M |

**An iteration costs 5–9M tokens.** The runs that shipped did so at iterations 2 and 7. So a ship
needs roughly **40–110M**, and a 15M ceiling buys **two iterations** — which is exactly where all
three died, every time with findings still being produced.

**Money does not track tokens and the gap is large.** oracle1 spent 18.06M for $13.83 ($0.766/M);
panelA spent 15.59M for $16.60 ($1.065/M). **14% fewer tokens, 20% more money** — a 39% swing in
price per million between two runs of the same PRD hours apart, driven by cache-read share. That
is `costCeiling`'s justification measured rather than argued, and it means no token number can be
converted into a bill.

**Also worth knowing: the overshoot is whatever the last child cost.** oracle1 overshot its ceiling
by 3.06M (20%), panelA by 594K (4%). The bound is "one child", and one child was measured at 9.5M.

`ship1` is the honest test of the question: 150M / $200 / 12 iterations, on the PRD csvstat2 and
csvstat6 both shipped.

### Item 6 — DONE, and `unknown` is not reachable by the documented recipe. The escalation path fired for the first time and was right

**A4's escalation ran live, and every step worked.** The cheap re-check failed, the driver
escalated to a scoped cold reviewer rather than resetting, and the verdict came back in **32
seconds for 104,000 tokens**:

```
pinned security element DoD-2-security at src/paths.ts:6 did not re-verify; asking
security-escalation: returned after 32s, 104000 tokens
pinned security element DoD-2-security moved to src/paths.ts:37; re-pinned
```

**It was correct.** The re-pin names `src/paths.ts:37`, snippet `if (escaped(relative)) {` — my
table-of-predicates rewrite, which the builder had since hardened with realpath resolution for
symlinks, which is why it moved. A relocated, still-enforcing guard, found and re-pinned at its
new location with its new text. That is `CLAUDE.md`'s load-bearing half working exactly as
written: *a security pin escalates to a scoped reviewer rather than resetting.*

**`unknown` did not fire, and the recipe cannot make it fire.** `DOGFOOD.md`'s case H asks the
operator to rewrite the guard so it *"shares no text with the pinned snippet"*. That defeats the
**cheap** check — a text comparison — which is a tripwire, not the judge. The escalation reviewer
holds `Read`, `Glob` and `Grep` and is told in as many words to *"search the repository for this
protection — not for this text … renamed, extracted into a helper, moved behind a decorator or
replaced by an equivalent guard, and any of those still count as present."* A semantically
identical guard, in the same file, under the same name, is the **definition** of `moved`.

**So the recipe attacks the wrong layer, and `DESIGN.md` §4.3's `unknown` is narrower than it
reads.** `unknown` is a fail-safe for *reviewer uncertainty* — a searching reviewer that genuinely
cannot decide — not a state a deliberate intervention can provoke. Producing one would need an
intervention that is ambiguous rather than merely obfuscated, which does not correspond to any
realistic degradation. **This is the outcome `PLAN.md` item 6 named as legitimate: the path is
shown near-unreachable and the design text is corrected rather than defended.**

**"Quarantine is not a pass" was never the untested part.** `test/pins.test.mjs` covers
`quarantinePin`/`shippingBlockers`, and `test/driver.test.mjs:2028` covers the loop level — *"does
not ship while an element is quarantined, even on a unanimous panel"*, with its neighbour proving
it ships once the quarantine clears. The rule is deterministic and held. What had never happened
was a live *trigger*, and it now turns out a live trigger is close to unprovokable by design.

**What this buys, stated plainly:** A4's expensive path is proven end to end for the first time —
escalation reachable, cheap, and accurate. `unknown` is reclassified from "the last unobserved
path" to "the residual a good reviewer rarely needs", and the documents now say so.

**Not verified:** a genuine `unknown` verdict, and therefore a live quarantine. On this evidence
that is a *feature* — the reviewer resolved an ambiguity the cheap check could not — but it means
the ship-block has still only ever been exercised by tests.

### The ratchet reverts the operator's between-run work, and case H's recipe cannot survive it

**Case H attempt 2 failed, and the failure is worth more than the case.** The recipe says to
rewrite the pinned guard *"from outside the run"*. I did: committed it, suite green, snippet gone.
The run then hard-reset on two regressions and **my commit vanished from history** —
`src/paths.ts` was back to the original, pinned snippet and all, and the pin re-verified as
`active`.

**The mechanism.** `lastGoodCommit` lives in `.meeseeks/state.json`, which **persists across runs**.
Attempt 2's reset targeted `047b680`, a commit from the *previous* run, predating the intervention
entirely. Two operator commits were discarded without a word.

**Generalised, because this is not about case H:** *anything an operator commits between runs is
discarded by the first hard reset of the next run.* The driver never re-establishes
`lastGoodCommit` at start-up, so it will reset to a state from a run that ended hours ago. An
operator fixing a bug by hand between runs loses that work silently — the loop reports a
regression and a reset, both true, and says nothing about the commits it dropped on the way.

**Same shape as the archive defect one entry below**: a hard reset to a commit older than the
thing being protected. Two instances in one run; this one destroyed *operator work* rather than
machine state.

**What case H needs, and the retry uses it:** set `lastGoodCommit` to the intervention commit
before restarting. Not a workaround — the intervention *is* a good state, its id set matches the
ratchet's own 56, and the stale value was simply wrong. Arguably what the driver should do itself.

**Two smaller confirmations.** `SIGTERM` stopped the driver first time with no orphaned `claude -p`
children, matching the morning's measurement. And `pkill -f 'scripts/driver.mjs'` **killed my own
shell**, because the pattern matches the command line containing it — which is what `DOGFOOD.md`
told the operator to run.

### 0.105.0 — C2 archiving destroyed the evidence it exists to preserve. Fifth instance, first that is not merely pollution

**Found by checking a success message instead of believing it.** `caseH`'s second run printed
`archived the previous run to .meeseeks/runs/001`. The directory was not there.

`archivePreviousRun` had worked perfectly — it moved eight files: the previous run's
`outcome.json`, `review.json`, `run.json`, `assumptions.json` and four briefs. `.meeseeks/runs/` was
**untracked and un-ignored**, so `git add -A` committed all eight, and the next hard reset — to a
commit predating the archive — deleted every one. Reconstructed from the reflog rather than
guessed: `47ff38a` and `8ac3ba5` each carry eight files under that path, and the reset to
`047b680` discarded them.

**Fifth instance of one defect**, after `state.json`, `outcome.json`, `run.json` and
`.hypothesis/`. **The first that is not pollution.** Those were artifacts nothing reads back or
that the driver rewrites next iteration. This directory is the *only* copy of a previous run's
evidence, and archiving exists precisely to make run history forensic (§7.2). The first time it
ran in anger, the thing it protects was destroyed by the mechanism it protects against.

**Why it slipped a list that was called self-correcting.** `MEESEEKS_IGNORED_PATHS` is checked by a
test against the constants the writers use — and that test iterated over *filenames*. The archive
is a **directory**, named per run, so no filename constant ever matched it. The test now includes
`${RUN_ARCHIVE_DIR}/`, and a third case asserts that a `.gitignore` written by an older build
gains the entry rather than keeping an incomplete list forever.

**The eight files were recovered** from the reflog into scratch, so phase 1's evidence survives:
`BUDGET`, 19,604,175 tokens, $14.60, 56 ids passing.

**The generalisation worth keeping:** four of these five were found by execution and one by
auditing after the fourth. None was ever found by a unit test, because the defect is not in what
the code writes — it is in what git does to it afterwards.

### 0.104.0 — 0.103.0's fix was not retroactive, and testing the *consequence* found the gap

**Written to lock a property I had already asserted, and it failed on the first run.** 0.103.0
stopped a security id being *filed* as a requirement pin. It says nothing about a store written by
an older build — and `panelB`'s `pins.json` on disk holds `DoD-2-security` among its requirement
pins **right now**. `narrowedPanelPlan` would have carried it, silently restoring the exact
cancellation 0.103.0 was written to close.

The mechanism was fixed and the outcome was not. The difference only showed up because the test
asserted the consequence — *a security id can never be carried past a panel* — rather than the
mechanism that was supposed to produce it.

The carry now refuses on three independent grounds: not required, evidenced only by a test file,
or a security id. **Two mechanisms must both fail before A4 and A8 can cancel each other again.**

**One existing test changed, and its breakage was informative.** *"Refuses to narrow when every
required id is carried"* can no longer happen while a security id is in the required set, because
that id is never carryable. That is a **stronger** property than the test asserted — a real panel
always has at least one id that must be freshly read, so the full-panel fallback is no longer the
only thing standing between a run and shipping on pins alone. It is now asserted in its own right,
and the original all-carried branch is still tested on an ordinary id set.

**The lesson, and this session has now paid for it twice:** a fix verified only by its mechanism
is a fix that may not have happened. Both times the gap was found by writing down what should now
be *true of the system* and running it, rather than what the change *did*.

### The reviewer-name audit, and a negative result worth recording

After 0.103.0 the obvious question was whether security pinning was the *only* thing keyed to a
reviewer's **name** rather than to a property. Auditing every `'security'` comparison and every
`reviewer ===` in `scripts/`: **it was.** The only other occurrences are `config.mjs`'s default
list and `KNOWN_REVIEWERS`, which are validation rather than behaviour, and A4's escalation runs
under its own `security-escalation` phase with no dependence on who reviewed anything.

Recorded because a negative result from a deliberate audit is worth having — the next person to
suspect this class can skip the search — and because the same audit shape found **two** further
unsatisfiable DoD ids an hour earlier. Same method, opposite outcome.

### Item 8 — DONE. The panel versus one reviewer, measured. R14's answer is "cheaper, and not obviously worse — but do not shrink it on this"

Two runs, run 8's PRD, byte-identical but for `reviewers`, `ownership` and `effort`. Both ended
`BUDGET`. **`oracle1` doubles as a second sample of the three-reviewer arm**, which gives the
control an n of 2 for free.

**Cost, per full panel over all sixteen ids:**

| arm | reviewers | panel tokens | panel wall |
|---|---|---|---|
| three reviewers (oracle1) | 3 | 3.36M | 1360s |
| three reviewers (panelA) | 3 | 3.64M | 1451s |
| **one reviewer at `max`** | **1** | **1.40M** | **664s** |

**2.6× cheaper, 2.2× faster.** That is a large, unambiguous saving and it is the strongest thing
R14 has going for it.

**Findings — and this is where counting fails.** oracle1 found 4, panelA 5, panelB 4. The control
arm's own spread is 4-to-5, so the count difference is inside the noise. Reading the content
matters more, and it says two opposite things:

- **The solo reviewer went deeper.** On `DoD-6-adversarial-input` it enumerated **three** input
  classes that produce a wrong answer at exit 0; panelA's found one. Both caught the same core
  `mean` defect independently.
- **The panel's one extra finding was false.** panelA's design auditor failed `DoD-4` on a CLI for
  having no health endpoint — which its own gate policy exempts. That is 0.101.0's unsatisfiable
  requirement, and it means the panel's "wider net" here caught nothing real.

**The result that decides it is not about findings at all.** The solo configuration produced
**zero security pins** and filed `DoD-2-security` as an ordinary requirement pin, silently
disabling A4's security monotonicity — 0.103.0. That was a defect in the pinning code rather than
a property of solo review, and it is fixed, so it should not recur. But it is what the experiment
actually bought, and it is worth more than the cost ratio.

**Recommendation, stated as one: do not shrink the panel on this evidence — build item 10's
parallelism instead.** The saving is real but it is a *cost* argument, and the qualitative
evidence is one run per arm in which the panel's only distinguishing finding was spurious and the
solo's advantage was depth on an id both owned. Meanwhile the panel's dominant cost is wall clock,
`3×` where it could be `max()`, and item 10 removes exactly that. Parallelising a three-reviewer
panel closes most of the 2.2× gap without giving up a heterogeneous read.

**What would settle it properly**, since this does not: several runs per arm on different PRD
shapes, scored on findings a human confirms as real — because on this evidence the panel's extra
finding was not.

**Confounds, named rather than buried:** one run per arm; panelA's panel judged iteration-2 code
while panelB's judged iteration-1 code, so the two never reviewed the same tree; and all three
runs ended `BUDGET` without shipping, so neither arm was ever tested at a ship decision.

### 0.103.0 — A4 switched itself off when the panel was reconfigured, and nothing said so

**The most serious defect this session, and item 8 found it by changing two config keys.**

Security pinning decided whether a passing entry became a **security pin** by asking whether a
reviewer *named* `security` owned it:

```js
const isSecurity = panelPlan.assignments.some(
  (assignment) => assignment.reviewer === 'security' && assignment.ids.includes(entry.id),
);
```

`reviewers` and `ownership` are **configuration**. `panelB` ran with one reviewer named
`correctness` owning every id — a legitimate configuration, and the exact one R14 asks the project
to evaluate — so `isSecurity` was false for every entry in the run.

| run | reviewers | security pins | where `DoD-2-security` went |
|---|---|---|---|
| oracle1 | 3 | 1 | security pin (`package.json:12`) |
| panelA | 3 | 1 | security pin (`src/read-file.ts:25`) |
| **panelB** | **1** | **0** | **filed as an ordinary requirement pin** |

**A4's security monotonicity switched itself off**, and there are two ways that bites. No security
pin means no re-verification, no `moved`/`removed`/`unknown` verdict, no escalation and no
quarantine — the entire mechanism, silent. And because the id landed in the *requirement* pins
instead, it became eligible for the A8 carry: **the one id whose gradual degradation A4 exists to
catch became the one nobody re-reads.** Two defensive layers cancelling each other, from a config
key that never mentions security.

This is exactly the class `CLAUDE.md` names — *"a defensive guard that disappears one iteration at
a time"* — and it would never have reported a failure.

**Fixed by asking the id, not the reviewer.** `isSecurityId` derives from
`DEFAULT_OWNERSHIP.security` rather than the live ownership map: which reviewer reads an id is an
operator's choice, whether the id is *about* security is a property of the id. It takes one
argument and there is nowhere for configuration to reach in and change the answer — asserted, so
the property is not merely true today.

**What this says about R14, before item 8's cost numbers are even in:** the panel-versus-solo
question was never only about findings. A configuration that looked like a pure cost reduction
disabled a monotonic safety property, and no gate, no test and no log line noticed.

### The `panelCarry` cost delta, measured at last — and it is 8%, not 56%

**Owed since 0.92.0, and item 12's Done-when could not be met without it.** `panel carry` fired
for the first time in `panelB`, iteration 2: *"skipped re-review of 9 requirement(s) whose
evidence has not changed"*.

| iteration | ids reviewed | review tokens | review wall |
|---|---|---|---|
| 1 | 16 (nothing carried) | 1,402,476 | 664s |
| 2 | **7** (9 carried) | 1,285,670 | 475s |
| delta | **−56% of ids** | **−8.3%** | **−28.5%** |

**Carrying 56% of the requirements saved 8% of the tokens.** The mechanism works exactly as
designed and buys a small fraction of what `BRIEF.md` R1 predicted.

**The reason is structural and it should have been predictable.** A cold reviewer's cost is
dominated by *reading the repository*, not by how many ids it answers about. It must read the
tree whatever it is asked; the id list only changes what it writes at the end. That is why the
wall clock fell three times as much as the token count — less output to compose, the same input
to digest.

**This confirms A8's own correction rather than R1's premise.** `BRIEF.md` A8 already struck the
claim that this loop *"re-litigates every requirement at full cold-panel cost"*, calling it false
because Phase 5 sits behind the gates. The remaining hope was that review becomes the dominant
cost on a long run and carrying would scale with it. It does not scale with ids carried, because
ids are not what review costs.

**What that means for item 12, stated plainly:** the mechanism is safe by construction — a
narrowed pass still triggers the full panel — and it is now measured as **marginal**. It is not
worth extending, and anything built on an assumption that carrying scales with the number of
requirements carried should be re-costed against this number first. If review cost is to be
reduced, the lever is the *read*, not the id list.

**Caveats, because n is 1:** a single run, the solo-reviewer arm, and iteration 2's tree is not
iteration 1's. The direction is unambiguous; the exact 8% is not.

### 0.102.0 — the same defect was in two more DoD ids, found by auditing the table instead of the instance

0.101.0 fixed `DoD-4` because a live auditor tripped over it. **The obvious next question was
whether it was alone, and it was not.** Auditing every row of the reviewer's DoD table against
`GATE_POLICY` found two more clauses that some correct project cannot satisfy:

| id | clause | the gate's own position |
|---|---|---|
| `DoD-3-ci` | *"runs build, lint, types, unit **and e2e**"* | `e2e` applies to `web-ui`/`desktop-ui`; for a CLI the `ci` gate literally prints **`not required here: e2e`** |
| `DoD-2-security` | *"negative-case auth is enforced at the handler or API layer"* | a CLI has neither, and may authorize nothing at all |

`DoD-3` is the clear one and is the same defect exactly: **the `ci` gate exempts e2e for a CLI
and then a required reviewer id demands it**, so a correct workflow fails for doing the right
thing. Both are now conditioned, in one table that states each clause's arming condition beside
the gate policy's.

**`DoD-2` is conditioned and deliberately not weakened**, which is the harder half. A CLI that
reads a token, a library that checks a capability, a tool deciding what a caller may touch — all
have an authorization boundary, and its negative case must still be enforced and checked. What is
no longer a finding is the *absence* of authorization in something that genuinely authorizes
nothing. The reviewer must **say which it found and how it looked**, because *"there is no auth
here"* asserted without evidence is precisely the charitable review the document exists to
prevent. A missing check and an inapplicable one are opposite conclusions and must not be written
the same way. The dependency-audit half stays unconditional — every project has dependencies.

**The lesson, and it generalises past these three:** an id is unsatisfiable exactly when its
wording is stricter than the gate policy for the same question. That is a *mechanical* comparison
and it had never been made. A test now asserts each conditioned clause against
`GATE_POLICY.<gate>.appliesTo`, so the two cannot drift apart silently — which is the only way
this stays fixed, since the drift is invisible until an auditor happens to read the line.

### 0.101.0 — `DoD-4` was unsatisfiable for a CLI, and item 8's experiment found it

**Found by running the experiment, not by reading the template.** panelA's design auditor failed
a correct CLI on `DoD-4-docs-observability`:

> *"The documentation half passes; the observability half is absent … FAILING - structured
> logging: there is none, in any form."*

It was right about the facts and wrong to fail. `reviewer-system.md:134` stated the id as
*"structured logging is present; a health endpoint responds"* with **no capability conditioning**,
while `DESIGN.md:857` arms the `observability` **gate** for `api` and `network-service` only, on
the stated reasoning that *a CLI's exit code is its health check*. The gate exempts a CLI; the
reviewer line did not.

**`DoD-4` is a required id, so this is an unsatisfiable requirement** — the defect class this
project names as having cost it more than any other. And it is the intermittent kind: it fires
only when an auditor reads the line literally, so run 8's CLI shipped and this one was blocked on
the same wording. An unsatisfiable gate that fails sometimes is worse than one that fails always,
because it reads as a real finding.

The template now decides the shape first — listens on a port, or does not — and for a CLI, a
library or a batch job **the documentation half alone decides the id**, with a genuine logging
concern routed to `advisory-`, which is the channel that cannot block a compliant build. The
reviewer must say which shape it concluded, so the judgement is checkable. A test asserts the
wording *and* that it still agrees with `GATE_POLICY.observability.appliesTo`, because two rules
about one question are two rules that can drift.

**The JSON contract is unchanged** (`CLAUDE.md`'s rule for this file): only the DoD table row and
surrounding prose moved, and the template's embedded example still parses through the real parser.

**This is item 8 paying for itself before it has even reported.** The experiment was run to price
the panel; what it produced first was a live unsatisfiable-gate defect that no unit test could
see, because no unit test asks a real auditor to read the line.

### Item 14 — DONE at 0.100.0. Metamorphic relations, built the same day item 7 proved they were needed

**Built out of order, and the reason is that item 7 changed its status.** Item 14 was ordered
behind item 7 so its cases would inherit a validated harness. Item 7 instead measured that the
harness, validated, is blind to the defect class that defines every headline failure here — so
item 14 stopped being an enhancement and became the missing half. It needs no run to prove, and
it was built while item 8's first run was in flight.

**The schema.** A case may now carry a `relation`: `{ kind, files, argv }`, a **second real
invocation** in its own scratch directory, judged against the first. Three kinds:

| kind | holds when | catches |
|---|---|---|
| `same-stdout` | both runs print the same thing | order-dependence, accumulation error |
| `same-exit` | both runs exit the same | an error path depending on something it should not |
| `differs` | the two runs print **different** things | a program that ignores its input |

**`differs` is the deny path and it earns its place**: every `same-stdout` relation ever written
is satisfied by a program that prints a constant and never opens the file.

**Why this escapes the rule that produced nineteen exit-code assertions:** a relation never names
an output, so it holds whatever formatting the program chooses, and the template's warning about
guessing a format simply does not apply. It also needs no reference implementation, so it cannot
encode the same assumption twice — which is exactly how run 12's 110,877-case differential fuzz
missed the defect it was built to find.

Fail-closed throughout: an unknown `kind`, a missing second `argv`, or a relation file escaping
the scratch directory all throw rather than being dropped, because a relation quietly discarded
is a case that asserts nothing while looking like it asserts something. A case with no
`expectExit`, no `expectStdout` **and** no `relation` is still refused.

**The template half is not optional and is tested live.** A schema no author writes cases against
is dead code. `templates/oracle-author.md` now teaches the five shapes — permute, duplicate,
scale, subset, identity-merge — with a worked permutation example, and a unit test parses that
example through the real parser *and* checks it is a genuine permutation rather than a
plausible-looking one. **Tier 3 then asked a real child, and it wrote relation cases: 27 of 27
across 11 files.**

**Not verified:** no *run* has yet had a relation case judge real code. The decisive unit test
demonstrates the mechanism against the naive accumulation directly — the means of
`[1e16, 1, -1e16]` and its permutation differ while both exit 0 — but a live run finding a real
defect this way is still owed.

### Item 7 — DONE. A3's first armed run, and the suite is provably blind to wrong answers

**Run `oracle1`, 13 August 2026.** Run 8's exact PRD, `oracle.enabled: true` the only moved
variable. Ended **BUDGET** — `18,062,568 of 15,000,000` tokens, **$13.83**, 1 iteration recorded,
53 ids passing. The 3.06M overshoot is the documented property, not a defect: a child's cost is
unknowable until it returns, and iteration 2's builder alone spent 9.5M.

**The oracle armed, ran, and judged: `19 held-out case(s) passed`.** It never appears in the log
because a passing gate logs nothing — the silence was mine to misread, not a fault. **False
failures: 0 of 19**, which is the outcome R13 feared most and did not get.

**The binary it judged is genuinely good.** Verified by execution, not by the panel: the builder
used a **bigint numerator** for the mean, and the tree answers `0.3333333333333333` for
`1e16, 1, -1e16` and `1e+308` for `1e308, 1e308` — the two inputs that defeated run 12.

**And now the finding, which is a measurement rather than an argument.** All 19 cases assert
`expectExit` only; none asserts `expectStdout`. That is `templates/oracle-author.md` working as
written — *"if the specification does not fix the byte-for-byte output … assert only
`expectExit`"* — and a PRD almost never fixes JSON formatting. To find out what that costs, the
tree was copied and its `meanToNumber(numerator, exponent, …)` replaced with run 12's exact naive
accumulation, `numbers.reduce((a, b) => a + b, 0) / count`:

```
1e308, 1e308  ->  {"mean": null}     exit 0
19 held-out case(s) passed
```

**A binary that reports `null` as the mean of two finite numbers, at a success exit code, passes
the entire held-out suite.** That is `DoD-6-adversarial-input`'s exact question — *does this
program ever confidently report a wrong answer* — and the suite built to answer it independently
cannot. Every headline defect this project has shipped is in that class: run 8's ship discarding
data at exit 0, run 9's statistics over half its input, run 12's `mean: 0`, improve3's confident
JSON on unreadable input.

**Item 14 is therefore not an enhancement, it is the missing half.** A metamorphic relation
asserts *between* runs — permute and the mean is unchanged, scale by k and it scales by k — so it
needs no byte-for-byte format and slips the very rule that produced nineteen exit-code
assertions. The sabotage above fails a permutation-invariance relation instantly.

**Also measured:** oracle authoring cost **314s / 93,561 tokens**, and the builder prompt grew
**17,567 → 42,372 characters** between iterations 1 and 2 — §3.9's silent degradation, visible
because `childStartLine` prints the count every time.

**Not verified:** the dispute and quarantine paths. Nothing disputed a case, so the mechanism
designed before the happy path is still unexercised. A run with a *false* oracle case remains
owed.

**The run is still in flight; this finding does not depend on how it ends.** Phase 0b authored
**19 held-out cases in 314s for 93,561 tokens** from run 8's exact PRD — the first time A3 has
ever been armed. The cases are good: each cites a requirement and names the defect it hunts —
quoted commas, embedded newlines, doubled quotes, a missing trailing newline, a trailing newline
read as a spurious row.

**All nineteen assert `expectExit` only. Not one asserts `expectStdout`.**

| expected exit | cases |
|---|---|
| 0 | 11 |
| 1 / 2 / 3 / 4 | 1 / 2 / 3 / 2 |
| **asserting stdout** | **0** |

**This is not the model underperforming. It is `templates/oracle-author.md` working exactly as
written**, and the rule is quoted here because the fix has to argue with it:

> *"`expectStdout` is compared exactly … If the specification does not fix the byte-for-byte
> output — key order, spacing, number formatting — then **assert only `expectExit`** rather than
> guessing a format. Guessing a format is how you fail a correct implementation."*

That rule is defensible on its own terms — R13 named false failures as A3's main risk. But look
at what it costs, because a PRD almost never fixes byte-for-byte JSON:

**A3 exists to catch what the builder's own tests will not. Its authoring rule degrades it to an
exit-code checker on any realistic specification — and every headline defect this project has
shipped is a *wrong answer at a success exit code*:**

- run 8's `SHIPPED` — the binary discards data, exit 0
- run 9 — statistics over half the input, exit 0
- run 12 — `mean: 0` where the truth is `1/3`, past a 110,877-case fuzz
- improve3 — confident JSON at exit 0 on unreadable input

**Not one of those would be caught by an oracle that only reads exit codes.** `DoD-6-adversarial-input`
was added precisely because nothing else asks "does this program ever confidently report a wrong
answer", and the held-out suite meant to answer it independently cannot.

**This converts `PLAN.md` item 14 from a prediction into a measured requirement.** R17's
metamorphic relations are exactly the escape: permute the input and the mean must not change,
scale by k and it scales by k, duplicate the dataset and it is fixed. **A relation needs no
byte-for-byte format**, so it evades the very rule that produced nineteen exit-code assertions,
and it catches the wrong-answer class without guessing an output shape. Item 14 was ordered
behind item 7 so relation cases would inherit a validated harness; item 7 has instead shown why
item 14 is the point.

### 0.98.0 — the nested-meeseeks denial now says it is a text match, and the rule is NOT weakened

**Third bite in one session**, and the second of the three was a commit message describing the
rule itself. `nested-meeseeks` scans command position including heredoc bodies, so a `git commit -F -`
whose body merely *mentions* the command is refused. `README.md` already recorded it biting twice.

**The rule stays exactly as it is, and that is the decision.** Three reasons, in order of weight:
a heredoc genuinely can carry a script, so heredoc bodies really are command position; the
operator-blocked case is a *deliberate* one with a test stating its reasoning — *"nested runs do
not become reasonable because a human asked for them in this session"*; and loosening a
no-nesting guard to make commit messages easier is precisely the trade this project refuses. The
workaround costs one reworded sentence.

What changed is the **sentence**. The denial now says outright that it is a text match rather than
a detected invocation, names heredoc bodies as the usual cause, and tells the reader to reword
rather than reach for the rule. A message that misdirects costs an investigation, and this
repository has now paid for that four times — the mutation gate's false "nothing changed", the
gate failure reduced to two npm warnings, this, and this again.

Behaviour is unchanged and a test asserts that explicitly beside the new wording.

### Item 19 — the deploy's ssh half, live-verified. 13 August 2026

The operator supplied a DigitalOcean droplet (Ubuntu 22.04.5, key already installed) and the item
closed the same hour. `DESIGN.md` §10.1's rule allowed two end states — verified once, or marked
permanently unverified — and this is the first one.

**Unattended-readiness checked before anything else**, because it is the precondition a run
cannot supply for itself: `ssh -o BatchMode=yes` makes a passphrase prompt impossible, and the
host key was pinned with `ssh-keyscan` first. Then `runDeploy` — the real function, not a
reimplementation — was driven against the real host through five paths:

| path | result |
|---|---|
| deploy + smoke, both good | `ok=true`, 1 smoke check passed, 4.1s |
| remote command exits non-zero | `the deploy command failed: exit 7` |
| smoke expects the wrong status | `/health: expected 404, answered 200` |
| smoke path absent | `/nope: expected 200, answered 404` |
| remote command hangs (`sleep 300`, 8s ceiling) | killed at 8017ms, with the passphrase/host-key hint |

**Two findings only a real host produces, and both look exactly like a broken deploy.** `ufw`'s
default `22/tcp LIMIT IN` rate-limits ssh to six connections per thirty seconds; tripping it —
which `ssh-keyscan` plus two retries did — returns `Connection refused`. And a freshly created
droplet refuses connections during cloud-init. An operator reading a failed deploy should suspect
both before suspecting the argv.

**One change made to the operator's host and stated rather than buried:** `ufw allow 80/tcp`. The
droplet's firewall permitted 22, 2375 and 2376 only, so the smoke check timed out while the
server answered `200` on localhost. That is the sort of failure the smoke check exists to catch,
and it caught it.

**Not verified:** the deploy has still never run inside a real loop run — this drove `runDeploy`
directly. `deploy.enabled` remains `false` by default.

### The .NET adapter's other four commands, executed. 13 August 2026

Queue item 2 proved the **unit** command and TRX extraction against a real SDK. The other four
had never been run. All five now have, against `dotnet 8.0.423` on a scaffolded `sln` + xunit
solution, spelled exactly as the adapter spells them rather than retyped:

| operation | argv | result |
|---|---|---|
| `restore` | `dotnet restore` | exit 0 |
| `build` | `dotnet build` | exit 0 |
| `security-audit` | `dotnet restore --force -warnaserror:NU1901,NU1902,NU1903,NU1904` | exit 0 — the `-warnaserror:` form MSBuild accepts, not `-p:` |
| `unit` | `dotnet test --logger "trx;LogFileName=…" --results-directory <meeseeksDir>` | exit 0, **TRX written where the ratchet looks** |
| `lint` | `dotnet format --verify-no-changes` | exit 0 |

Round-tripped as well: a deliberately failing second test, through the real `parseReport`, giving
`passed Api.Tests.UnitTest1.Test1` and `failed Api.Tests.UnitTest2.DeliberatelyFails`.

**One thing worth knowing for case C:** every command fails `MSB1003: Specify a project or
solution file` when the root holds neither a `.sln` nor a `.csproj`. The adapter's own detector
looks for exactly those, so the shapes agree — but a run whose builder scaffolds projects into
subdirectories *without* a root solution would fail all five gates with an error about none of
them. Worth watching in case C rather than diagnosing from scratch.

**The stale claim, in two files:** *"no SDK on this machine"*. It is installed, and a previous
session had already used it. Fixed in `DOGFOOD.md` and in the "do this next" stratum.

### Item 23 — the closing consistency pass. DONE, docs only

**Two user-facing gaps, both silent, both from work landed in the last day.**
`protected-guard` — an entire deny category, added 0.88.0 — was in **no** document. README said
the guard *"denies four categories"* and listed four. `DESIGN.md` §6 never mentioned it.
`CLAUDE.md`'s invariant carried the title *"the guard hook is not editable by what it guards"*
over a body that described only `.meeseeks/` — the title had been aspirational for months and became
true without the text noticing. All three now say it, including *why it almost never fires*.
README's `qualityPlugins` default was stale by one plugin.

**Two invariants added to `CLAUDE.md`**, because they are load-bearing and trivially deletable:
a carried requirement is a pre-filter and a narrowed `pass` must trigger the full panel; and a
requirement evidenced only by a test file is never carried.

**The audit was executed rather than read.** Ten documented values were asserted against the
running code — every new config default, the `$0.0001` budget floor, the canonical OpenAPI path
agreeing between the `docs` gate and the fuzzer argv, the tool-cache list — and all ten matched.
All 30 config keys have a `DESIGN.md` §10 row.

**No version bump**, and that is the layout working: `README.md`, `DESIGN.md` and `CLAUDE.md`
are not shipped paths, so the plugin cache is unaffected by any of it.

**Not verified:** this pass checked *values*, not *prose*. Nothing here proves that a paragraph
describing a mechanism describes it correctly — only that the numbers and names in it are the
ones the code uses. The one class of error it would not have caught is the class item 5 was:
a confident sentence about something nobody checked.

### Item 22 — the stratigraphy sweep, and it found a hazard the sweep itself had warned about

Six stale strata in this file are now reconciled in place rather than struck, each with a dated
note saying what answered it. Kept rather than deleted, because the diagnosis that earned a fix
is worth more than the fix's announcement — the orphan measurement, the ship-time-mutation
proposal, and the A8 split all read better as "here is what we believed, here is what happened".

**What the sweep actually bought is not tidiness.** Buried at the A8 pin-fingerprint entry was a
sentence written before the carry existed: *"Decide the test-file-evidence case before building
the carry."* Item 12 built the carry at 0.92.0 **without** that decision, which armed the exact
hazard the note describes — run 3 really did pin `PRD-3.1` to a test file, a requirement pin
fingerprints the whole evidenced file, and so the source satisfying a requirement could regress
while `tests/perf.test.js` sat untouched, the fingerprint held, and nothing re-reviewed it.

Decided and fixed in the same commit. `isTestEvidence` refuses to carry any requirement whose
evidence names a test. Such a requirement is still pinned, still invalidated, still fail-closed;
only the saving is withheld. The pattern is **deliberately broad** because the two errors are not
symmetric: refusing to carry costs one re-review of one requirement, and wrongly carrying hides a
source regression for the rest of the run. It is not blind, though — an earlier case-insensitive
.NET clause ate `src/attest.cs`, which is ordinary source, and both directions are now tested.

**The lesson this file should keep:** a plan compiled from a findings stratum inherits the moment
that stratum was written (item 1), and a *hazard* recorded in one can be armed later by somebody
reading only the top (item 12). Two of the five Phase 0 items were already done before the plan
was written and one Phase 3 item shipped a known hazard — all three found by reading this file
rather than the plan.

### Item 16 — the OS sandbox. DONE at 0.96.0, off by default, and confinement is unproven here

**Three facts measured before writing anything**, all of which shaped it:

1. The settings key is `"sandbox": {"enabled": true}` — read out of the 2.1.228 binary, which
   answers a refused command with *"Set `"sandbox": {"enabled": true}` in Claude Code settings"*.
   Not guessed.
2. **bubblewrap is not installed on this machine.** The CLI's own advice when it is missing is
   `apt install bubblewrap`.
3. `claude --help` states that in `-p` mode **settings files that fail validation are silently
   ignored**. A sandbox key the CLI disliked would take the whole blob down — *guard included* —
   without a word.

Fact 3 is why the check is at **preflight** and not later, and fact 2 is why the default is
**off**. With the unsandboxed fallback refused — which is R19's load-bearing half, because a
sandbox that can be declined by the thing it contains is not one — defaulting it on would refuse
every run on this host and most others. Arming it is a statement about a machine, and
`checkSandboxAvailable` checks that machine before the run starts: bubblewrap on Linux, seatbelt
assumed on macOS, and an outright refusal on a platform this build knows no sandbox for. An
unknown sandbox is not a sandbox.

Only writing phases get it, derived from `isColdPhase` rather than listed, so a phase added later
with write tools is sandboxed automatically — the same reason the guard's split is derived.

**The live check exists because R19 says it must**, in the guard's own terms: eleven versions of
green unit tests once proved nothing about whether the hook was loaded. Tier 3 now spawns a real
child with the sandboxed blob and asserts it starts, answers, and draws no complaint about its
settings. **27 of 27 across 11 files.**

**Not verified, and it is the interesting half: that the kernel confines anything.** That needs
bubblewrap, which is absent here. Asserting confinement now would produce a test that is green
because it never ran, which is the exact failure this project refuses everywhere else. What is
proved is that the declaration survives the trip to a real child with the guard still beside it.

### 0.95.0 — the schemathesis gate leaves a cache in the tree, and 0.94.0 committed one here

**Found by execution, immediately, in this repository.** Verifying the schemathesis argv left a
`.hypothesis/` directory behind, and the 0.94.0 commit tracked it — three files of unicode tables
and a generated example, committed into the plugin.

It is the **fourth** instance of one defect class, after `state.json`, `outcome.json` and
`run.json`: something writes machine state into the tree the driver commits with `git add -A`
every iteration, and a later hard reset then restores an older copy of it. The difference is the
owner. Those three were the driver's own artifacts; this one belongs to a **tool the driver
invokes**, and no amount of care about `.meeseeks/` would have caught it.

So `TOOL_CACHE_PATHS` now sits beside `MEESEEKS_IGNORED_PATHS` in the same `.gitignore` mechanism —
`node_modules/`, which was always there under an ad-hoc boolean, and `.hypothesis/`, which earned
its place by being found. Both spellings, slashed and not, count as already covered.

**It is still an enumeration and that is said in the comment**, because enumeration is what cost
the first three fixes. What makes this one tolerable is that entries arrive with the run that
found them rather than by guessing what a future tool might write. The next gate tool this
project adopts should be assumed to litter until watched.

### Item 15 — R18's plumbing. DONE at 0.94.0, and the argv was executed rather than read

`docs/openapi.yaml` is now required for the `api` capability, at **one** canonical path. Not a
list of accepted names: the architect writes it, the `docs` gate requires it and the fuzzer argv
reads it, and a set of alternatives is three chances for those to drift into a gate that passes
while the fuzzer tests nothing.

`schemathesis` joins the registry, optional (warns rather than ending a run, the knip/semgrep
precedent) and **armed by the `api` capability** — the general form of arming that R7 wants,
sitting beside the older ad-hoc `frontendOnly`; collapsing the two is left as its own item and
said so in a comment rather than half-done.

**`--dry-run` is the discovery that makes this a gate at all.** A schema fuzzer normally needs a
running application, which this loop only has behind a deploy that is off by default. `--dry-run`
validates the schema and exercises input generation without making a request. Measured against
schemathesis **3.39.16**, both directions: a well-formed schema exits **0**, one with an invalid
parameter type exits **1**.

**Not built, and the gap is named rather than implied:** conformance fuzzing against a live app.
A green here means the contract is machine-valid and generatable. It does **not** mean the
application obeys it.

**Not verified:** no run has had an `api` capability with this gate armed, so the interaction
between the architect writing the schema in Phase 1 and the gate reading it has never happened.
The install path (`pip install --user schemathesis`) worked on this machine and is unproven
elsewhere — which is exactly why the plugin is optional.

### Item 13 — C5, differentiated race candidates. DONE at 0.93.0, on an unmet precondition

`STALL_HYPOTHESES` in `race.mjs` is six stall **archetypes** — symptom-not-property, too small,
too large, the tests are wrong, a false assumption, the seams — handed out by candidate index and
wrapping if the race is wider. `brief.mjs` renders the angle, and the one race call site wires it.

**Fixed and driver-owned rather than model-authored.** Section E's do-not-add list is closed and
the persona budget went to `oracle-author`; and a stall hypothesis chosen by a model is a model
with an opinion about a race, one step from a model adjudicating one.

**The invariant is stated to the candidate, not merely held by the code.** The brief says the
angle is *"a lead, not an instruction and not a standard"*, that nothing scores it against the
angle, that the gates cannot see it, and that it should abandon the angle the moment the code
disagrees — because a candidate that defends its hypothesis instead of the objective is the
failure this design refuses everywhere else. `selectWinner` is untouched and a race candidate
record has no field an angle could travel in; a test asserts both.

**Correction, later the same day: the paragraph that stood here was wrong.** It said nothing had
ever run a builder child inside a race worktree, citing `BRIEF.md` C5. **Queue item 1, recorded
in this very file, is exactly that run** — three real children in worktrees at 169s / 224s / 651s,
each on its own 18,071-character brief, each gated independently, the winner chosen on measured
churn. C5's precondition was met by a live *run* rather than the live *test* it asked for, after
C5 was written.

I reached the wrong conclusion by trusting `BRIEF.md`'s summary over this file's record — which is
the stratigraphy trap item 22 exists for, committed by the same session that swept for it. **What
is genuinely still owed is narrower and is item 9's remaining content: no live race has ever
*landed* a winner.**

**Not verified:** no run has raced with hypotheses. Whether distinct angles produce distinguishable
candidates is R9's claim and remains unmeasured — the brief-level facts are tested, the effect is not.

### Item 12 — A8's carry. Mechanism DONE at 0.92.0; the measured delta is owed and cannot come from here

`narrowedPanelPlan` removes already-carried requirement ids from the panel plan; `carriedReport`
shapes the carried pins as a passing reviewer report so `combinePanel` needs no special case, each
entry saying outright *"carried from the cold pass at iteration N"* rather than posing as a fresh
judgement. `panelCarry.enabled` defaults **on**.

**Why on-by-default is safe, and it rests entirely on one property:** carrying can only skip work
on an iteration that was going to fail. A narrowed panel that returns `pass` triggers the **full**
panel, which then decides. Two further refusals to narrow: everything carried (a run shipping on
pins alone, with no fresh cold read, would have replaced the irreplaceable component with a
cache), and every reviewer emptied (an ownership map not covering what it should).

**The concrete thing being protected is run 10.** Carry enough ids and a whole reviewer is
dropped, and run 10's ship was saved by the **design** auditor noticing an inert `bin` that no
requirement asked about. A8's own wording — *"the full panel still runs before a `SHIPPED`
verdict"* — is that, and it is why the carry is a pre-filter rather than a replacement.

**NOT DONE, and it is half the Done-when:** the measured review-cost delta. `BRIEF.md` A8's own
correction says no run has reached the panel twice and that "review becomes the dominant cost on
a long run" is a *prediction*. Nothing unattended can produce that number — it needs a dogfood run.
**Parked with items 7/8/20; the first run that reaches the panel repeatedly owes this file a
number.** Until then the mechanism is safe-by-construction and of unproven value, which is what
the docs now say.

### Item 11 — ship-time mutation. DONE at 0.91.0, and the proposal was wrong in one place

**Both named pre-checks were run as measurements, and the second changed the design.**

*Cost.* Stryker 9.6.1 against a nine-module vitest fixture: 22 mutants in **6.75s**, 176 mutants
in **21.2s** — about **4.7s fixed overhead plus ~94ms per mutant** on this machine. Bounded by
`gateTimeoutMs`, and a timeout is a failure, so a very large greenfield ship could in principle
be refused for slowness. Named, not mitigated.

*Laundering.* The proposal was to mutate the **whole first-party tree** once. That form launders,
and here is the demonstration rather than the argument:

| mutated set | result |
|---|---|
| `m9.mjs`, the one module with no tests, alone | `0.00`, **exit 1** |
| `m9.mjs` beside eight well-tested modules | `84.85` overall, **exit 0**, with `m9.mjs 0.00` |

`thresholds.break` is a percentage, so the more well-tested code a repository already holds, the
less the run's own work has to prove. It bites hardest in **improve mode**, where iteration 1
changes three files in a repository of five hundred and gets no scoped mutation at all — there is
no ratchet baseline on iteration 1 to diff against.

**So the scope is the run's own diff since its start commit, not the tree.** It cannot be diluted
by code the run did not write, is never empty when the run did anything, and on a greenfield run
*is* the whole tree because the run wrote the whole tree. Strictly better on all three counts,
and it was the pre-check that found it — which is the argument for pre-checks.

`shipTimeMutation` fails closed on every path: no start commit, empty scope, a toolchain that
declines mutation (dotnet does), a crashed gate. "The check could not run" is never spelled the
same way as "the suite is proven".

**Confirmed no run was in flight** before touching ship logic, as the proposal requires: no
`driver.mjs`, no `claude -p`, no lock file.

**Not verified:** no run has reached this path. The unit tests drive the decision through an
injected effect, so what is proved is that a passing ship-time mutation ships and a failing one
withholds *with its own reason*; that the real `shipTimeMutation` produces the right verdict
against a real Stryker is unproven, and would want tier 2 or a dogfood run. The cost figures are
from a trivial suite and do not predict a real one.

### Item 5 — R15's phrasing paragraph. CLOSED as already done at 0.76.0

`PLAN.md` marked it `OPEN (verified absent at 0.88.0)`. It has been present since **0.76.0**,
fourteen versions earlier: `templates/reviewer-system.md` carries *"State the property, not the
example"* with both worked examples and the instruction to name the class and give more than one
member of it, and `test/templates.test.mjs:610–628` asserts all three. One `grep` contradicted
the claim.

**The parenthetical is the finding, not the item.** "Verified absent" was written where no
verification happened, and a false claim of having checked is worse than an unchecked `OPEN` —
the second invites a look and the first forbids one. Together with item 1 that is **two of the
five Phase 0 items already done before the plan was written**, both discovered by reading the
repository rather than the ledger. Where `PLAN.md` and the tree disagree, the tree wins; the
remaining statuses in that file deserve the same suspicion until item 22 has been through them.

**Not verified:** whether the paragraph *works* — whether reviewers phrased findings as
properties in runs after 0.76.0 — is unmeasured, and R15's evidence is still only the two runs
that motivated it.

### Item 4 — a child is bounded in flight at last. DONE at 0.90.0, tier 3 watched it stop

`childBudget(config, spentUsd)` returns `costCeiling` minus everything handed to children so
far, floored at `$0.0001` and rounded to four decimals; `claudeArgs` passes it as
`--max-budget-usd`. `runChild` supplies it, and keeps the running total itself — **every** child
in the loop spawns through that one function, including each race candidate, so summing there
sums the same envelopes `driveRun` charges. Threading `RunProgress` out through every effect
signature would have put the ceiling's arithmetic in two places that could disagree.

**The floor is the interesting number.** Zero is what a parser is likeliest to read as *unset*,
which would hand an out-of-money run an unbounded child — the exact failure the flag exists to
prevent, produced by the fix for it. A tiny real number stops a child; a zero might not.

**`--max-turns` is shipped as an operator lever, off by default, and the reason is honesty.**
There is no arithmetic from a token or dollar ceiling to a number of agentic turns, so any
default would be a number nobody measured wearing the authority of one — `gateTimeoutMs` at
least admits in its own comment that it is a guess; this would not even be that. `maxChildTurns`
defaults to `0`, meaning the flag is not passed.

**Two things measured against the binary rather than read from documentation.**
`--max-budget-usd` is in `claude --help` for **2.1.228**. `--max-turns` is **not**, and is
accepted anyway: the parser answers *"Input must be provided"* for it and *"unknown option"* for
a flag that genuinely does not exist. An undocumented flag is a weaker contract than a
documented one, which is the second reason it is off by default, and the live test asserts the
day it disappears rather than letting it fail runs.

**Tier 3 observed the stop, which is the item's whole point.** A real child bounded at the floor
returned **not-ok with empty text** — a stopped child has no verdict, and half a verdict is not a
smaller one. The companion case, an amply-funded child answering normally, is what stops this
file from "passing" by breaking every run. Tier 3 is now **23 of 23 across 10 files**, up from
20 of 20 across 6.

**Not verified:** no *run* has yet been stopped by this flag in anger, so the interaction between
a budget-stopped builder and the next iteration's brief is reasoned rather than observed. The
approximation in the upstream stop is also unmeasured — how far past the number a child can get
is the flag's business and nothing here checks it.

### Item 3 — `release-check` now refuses a stale header. DONE, no version bump

`statedHandoffVersion` reads the `**State:**` paragraph — the whole paragraph, not one line,
because it wraps and a reflow must not read as a missing header — and takes the first
backticked `x.y.z`. The branch name in backticks before it is skipped by the shape of the
pattern rather than by position.

Three refusals, not one: header **behind** the manifests, header **ahead** of them, and a
header that cannot be read at all. The third is the nothing-defaults-to-pass case and it is why
`handoffVersion` is a **required** field on `evaluateRelease` rather than an optional one — a
caller who forgets it must not get a pass by omission.

Verified twice over: unit tests including two that write a real temporary tree and drive `main`
against it, and by hand against **this** repository, staling the header to `0.88.0` and watching
the command refuse before restoring it.

**No version bump, and that is the design working.** `tools/` is not a shipped path, which is
exactly why the checker lives there — a checker under `scripts/` would demand a bump every time
the checker itself changed.

**Not verified:** nothing enforces this in CI, because there is no CI here; it is a command an
operator or a gate must run. Item 21 wants `release-check` reachable as a *gate*, and this item
does not do that — it only makes the gate worth reaching.

### Item 2 — the orphaned grandchild. DONE at 0.89.0, and the obvious fix was the wrong one

**What was measured before anything was written**, because the fix this file had already named
turned out to be a trap:

| experiment | result |
|---|---|
| `execFileSync` + timeout, gate leaks a grandchild | grandchild **alive** after the kill — the open item, reproduced |
| `spawnSync` with `detached: true` | **honoured**, though undocumented: the child's pgid equals its own pid |
| detached + `kill(-pid)` after the timeout | grandchild **dead** — the named fix works |
| `SIGINT` to the driver's foreground group, child **not** detached | grandchild **dies** |
| `SIGINT` to the driver's foreground group, child **detached** | grandchild **SURVIVES** |

The last row is why the named fix is not the one that shipped. Detaching each gate into its own
process group buys a sweep after a 45-minute ceiling and **costs the operator's Ctrl-C**, which
is the control they actually use. That is a rare orphan traded for a common one.

**What shipped instead: subtraction.** A leaked grandchild inherits the driver's *own* process
group, because nothing detached it. So sample the group before the command, sample it again
after the timeout, and kill the difference. No signals move, Ctrl-C behaves exactly as it always
has, and the sweep is exact rather than a blanket signal. `sweepLeakedGroup` and
`processGroupMembers` in `driver.mjs`; `DESIGN.md` §10 carries the reasoning and the three
deliberate limits (timeouts only, Windows no-op, unreadable group sweeps nothing).

The killed pids are named in the gate's failure detail, because that string is copied verbatim
into the builder's brief and a leak is a different diagnosis from a slow suite.

**One finding from the test, worth more than the item.** The first version of the tier-2 test
failed while the product was correct. It checked liveness with `process.kill(pid, 0)`, which
**succeeds against a zombie** — a `SIGKILL`ed process whose parent has already exited stays in
the pid table until something reaps it. Measured directly: `kill(0)` said alive for a pid `ps`
was no longer listing at all, milliseconds apart. Any future test that asserts a process died
must consult `ps` state, not `kill(0)`, or it will report a working sweep as a leak.

**Not verified:** no live run has yet hit a gate ceiling with a real leaked server, so this is
proved against a synthetic sleeper rather than against `npm run dev`. The operator-kill path is
**not** covered and is named in `DESIGN.md` rather than implied — `kill` to the driver alone
still leaks, and closing it needs item 10's free event loop.

Gates: lint, typecheck, tier 1 **1606 pass**, tier 2 **30 pass** (was 28).

### Item 1 — the mutation gate's baseline message. CLOSED as already done at 0.87.0

`PLAN.md` listed it `OPEN`. The repository disagreed and the repository was right.
`scripts/driver.mjs:3699` already passes `undefined` rather than `[]` when no commit has advanced
the ratchet, `scripts/toolchains/node.mjs:142` already declines with a distinct no-baseline
sentence that says outright *"This is not a statement that nothing changed"*, and
`test/toolchains.test.mjs:404–422` already asserts both messages plus the negative — that the
no-baseline reason does **not** contain the changed-set sentence. Nothing to build.

**How the plan got it wrong is the useful part.** The item was compiled out of the improve3 run
notes higher in this file, which record the defect and say *"Unfixed."* That was true when it was
written and false four commits later; commit `135f43d` recorded the finding and `769db67` fixed it
the same day. A plan compiled from a *findings* stratum inherits the moment that stratum was
written, not the state of the tree. This is item 22's problem arriving early, and it argues for
doing item 22 before trusting any remaining status in this file.

**Not verified:** nothing new was run for this item beyond tier 1, which the code path is covered
by. No live run has re-observed the corrected message in the wild.

## THE TOP BLOCKER, named by the operator: a run hangs for hours and nothing notices

**13 August 2026, stated directly:** *"when there's a run it'll hang sometimes and sit there for
hours until I say something. You should always catch a stalled or stale run."*

This is not a new observation, it is the one this file has been circling. §"the panel is three
whole-repository reads" already records the mechanism: **children run under `execFileSync`, which
blocks the event loop for the entire call.** No heartbeat can be emitted while one is in flight,
so *hung* and *working* are the same picture for as long as it takes. Run 10's builders averaged
470s each and its slowest race candidate ran 651s, which means a nine-minute silence is normal and
an infinite one looks identical to it.

**Closed at 0.80.0-0.82.0.** Everything the driver waits on now has a ceiling: children
(`childTimeoutMs`, 30 min), gate commands (`gateTimeoutMs`, 45 min), the deploy command
(`deploy.timeoutMs`, 10 min), the smoke probe and the health probe (their own deadlines). And
`.meeseeks/lock.json` stops the second half of it - two drivers on one tree, which is how run 15 was
lost.

`tokenCeiling` and `costCeiling` are **not** part of that list and never were. Both are read from
an envelope, so both bind a child that *returned*; a child that never returns produces no envelope,
spends no recorded tokens, and passes both forever. They are accounting. Reading them as protection
against a hang is the trap, and it is why this went unnoticed for so long.

**Still unbounded, and named rather than fixed:** the run as a whole. Nothing caps total wall-clock,
so a run can still spend hours inside ceilings that each individually hold. Whether that wants a
ceiling of its own is an open question - `maxIterations` bounds it in iterations, which is the
honest unit for a loop, and a wall-clock cap that fires mid-iteration would leave a tree nothing
has judged.

## Improve mode driven end to end by a live run. 13 August 2026

**First brownfield run this project has ever done.** `~/meeseeks-dogfood/improve3`, a six-commit
four-file CLI with planted defects, log at `~/meeseeks-logs/improve3.log`, `maxIterations: 3`,
`tokenCeiling: 12M`.

```
BUDGET: token ceiling reached: 12907553 of 12000000
iterations: 2  tokens: 12907553  cost: $11.3438  passing: 47
```

**It did not ship, and the product is fixed anyway** — the run-10 pattern again: the tree the run
refused to tag is materially better than the one it started from. Verified by running the binary,
not by reading the panel:

| requirement | before | after |
|---|---|---|
| PRD-1.1 unreadable file | `{"count":0,"mean":null,"max":null}` exit 0 | `cannot read '…': ENOENT`, **exit 1** |
| PRD-1.2 non-numeric line | `mean: 1.333` (folded `foo` in as 0) exit 0 | `badline.txt:2: not a number: 'foo'`, **exit 1** |
| PRD-1.3 empty input | `mean: null, max: null` exit 0 | `no numeric data`, **exit 1** |
| PRD-1.4 no argument | identical to 1.1 | `no input file given` + usage, **exit 2** — deliberately distinct |
| good input | `{"count":3,"mean":2,"max":3}` | unchanged |

**The authoring phase is the headline.** 59–72s, ~366K tokens, and the document cited `file:line`
on every requirement with **real executed output pasted in** — it ran the binary rather than
reading it. Four requirements, inside the 3–8 cap. It wrote a *"what was examined and found
correct"* section instead of padding. **It found one defect that was never planted** (PRD-1.4, a
missing argument being indistinguishable from an unreadable file). No rewrites, no test renames, no
style notes: every prohibition in the template survived contact with a real model.

**What the run confirmed live, none of it previously observed in a run:**

- **the run lock** — `.meeseeks/lock.json` held `pid: 59477`, the only driver, throughout;
- **every child printed its ceiling** — `killed after 30m`, eleven times;
- **the manifest ignore fix** — the target's `git status` stayed clean;
- **`gate-integrity` caught the builder** writing `toBeDefined()` and made it fix it;
- **the guard travelling to a child** — visible in the builder's `--settings` blob in `ps`.

### Two findings from watching it

**The mutation gate's decline message is false, and it is the misleading kind.** It printed *"no
first-party source changed since the last ratchet-advancing commit"* while `src/cli.mjs`,
`src/parse.mjs` and `src/stats.mjs` were all modified. Cause: on iteration 1 there is no
`state.json`, so `lastGoodCommit` is `null`, and `changedSince` returns `[]` on its first line —
`if (options.since === null) return []`. **"I have no baseline" is not "nothing changed", and the
message asserts the wrong one.** The decision is defensible; the sentence is not. Unfixed.

**Segment one cost 6.06M tokens against segment two's 0.83M — 7× — on a four-file repository.**
Segment one wrote tests and touched three source files; segment two fixed two gate failures. Worth
understanding before improve mode meets anything larger, because at this ratio the first iteration
alone would exhaust an ordinary ceiling on a real codebase.

**Not yet tried, and named as the last thing to try:** pointing improve mode at this repository.
Three obstacles first — the scope note in `CLAUDE.md` is one line and the operator's call; the
builder can edit `hooks/guard.mjs`, which the positional rule does **not** cover, so the guard
should be pinned as a security element before anything else; and `release-check` is not a declared
gate, so a builder editing `scripts/` without bumping breaks the install-cache invariant silently.

## MEASURED: why a run "hangs", and the SIGTERM claim in this file was wrong

**13 August 2026. Two experiments, both cheap, both settling questions this file had been
answering by assertion.**

### SIGTERM does kill the driver. What survives is the orphaned child.

This file said *"Run 14 had been sent `SIGTERM` and had not died"* and *"`kill -TERM` did not stop
a driver here; `kill -9` did."* Measured against a driver blocked inside `execFileSync`:

```
started pid=25925
RESULT: SIGTERM killed it
--- did the grandchild survive? ---
25933 77188 node -e setTimeout(()=>{},60000)
```

The driver died on the first `TERM`. **Its child was re-parented — PPID `77188`, not `25925` — and
kept running.** So what `ps` shows after a kill is very likely the orphaned `claude` child, still
alive and still spending, being mistaken for a driver that refused to die. Node installs no SIGTERM
handler here and the default action is termination; there was never a mechanism for the driver to
ignore it.

**This does not make the two-driver incident imaginary** — two drivers on one tree were observed,
and the run lock at 0.82.0 is the right answer to it either way. It makes the *stated cause* wrong,
and an operator acting on it reaches for `-9` when the thing they actually need to kill is a child
the driver no longer owns.

### The real hang: `execFileSync` waits for EOF, and an orphan holds the pipe open

The gate command below **exits immediately**. It prints `gate-done` and is gone. It also leaves one
background grandchild alive for eight seconds.

| gate | result |
|---|---|
| no timeout (pre-0.81.0) | **`RETURNED after 8162ms`**, `stdout="gate-done"` |
| `timeout: 4000` (0.81.0) | `THREW after 4009ms code=ETIMEDOUT` |

**`execFileSync` reads the child's stdout until EOF, and EOF does not arrive while any process
holds the write end.** The command finished in milliseconds; the call blocked for the grandchild's
whole lifetime. Substitute a dev server, a watcher, a test runner that leaks a handle — anything
that does not exit — and 8 seconds becomes *forever*, at 0% CPU, indistinguishable from work.

**`health-probe.mjs` already documents this exact mechanism** — *"the pipe never closes … can keep
the calling process alive indefinitely. Observed exactly once, as a test run that hung for five
minutes."* It was treated there as a health-probe concern. **It is a general property of every gate
the driver runs**, and it was unbounded until 0.81.0. That is now the strongest evidence the gate
ceiling was worth adding, and it arrived after the fact rather than before it.

> **Reconciled 13 August 2026 (stratigraphy sweep, `PLAN.md` item 22): CLOSED at 0.89.0.** A gate
> ceiling now sweeps the descendants the gate leaked, by sampling the driver's own process-group
> membership before and after and killing the difference. Detaching — the fix this paragraph
> implies — was measured and **rejected**: it costs the operator's Ctrl-C. See the top of this
> file. The paragraph below is kept as the diagnosis that earned the fix.

**Still open, and named rather than fixed: the orphan survives the timeout.** `execFileSync`'s
timeout signals the direct child; the grandchild in the run above was still alive afterwards
(`27476`). So 0.81.0 converts an indefinite hang into a bounded, named failure — which is the
important half — while the leaked process keeps whatever port or memory it held, against every
later iteration. `health-probe.mjs` already solves this properly for its own child by spawning
detached and signalling the **process group**; gates do not.

## 0.85.0 — improve mode: the repository is the input, and it is verified live

**The command had three input shapes and all three were product-shaped** — a PRD to build, an idea
to specify, or nothing at all. None can express *"this repository already exists, find what is
wrong with it"*, which is what you want when pointing the loop at working code. `--improve` is the
fourth shape, optionally with an area to focus on, and **everything downstream is unchanged**: same
`PRD.md`, same `PRD-<section>.<n>` ids, same panel, same DoD. The loop needed a new way in, not a
new mode.

`templates/improve-author.md` runs in the **`prd` phase**, which already carries `Read`/`Glob`/
`Grep` — so no new permissions entry and no new effort key. Its four load-bearing rules are each a
defect this project already paid for:

| rule | the defect it prevents |
|---|---|
| every requirement cites `file:line` for current behaviour | an ungrounded requirement is an unsatisfiable gate — the most expensive class here |
| three to eight requirements, no more | each costs an iteration; forty half-done finishes none |
| **never rename, move or delete an existing passing test** | the ratchet reads a renamed test as a *lost* one and hard-resets the repair **forever**. Looks completely harmless |
| no rewrites, migrations, restructurings | no falsifying observation, and it licenses a diff that touches everything |

Refused on a repository with no meaningful history, reusing `hasMeaningfulHistory` rather than
adding a second detector.

**Verified by execution, and this is the part that matters.**
`test/live/improve-contract.live.test.mjs` builds a tiny repository with one planted defect of the
class the template ranks first — `src/sum.mjs` silently drops unparseable lines and prints a total
at exit 0 — beside a README and `package.json` that are fine, because a template that finds a
defect in everything is as useless as one that finds none. A real child returned **3–8 numbered
requirements, cited `src/sum.mjs:<line>`, and reported the wrong-answer defect.** Tier 3 is now
**20 checks, 20 pass**.

**Not yet done, and worth knowing:** no *run* has used improve mode end to end. The authoring
contract is proven; whether the resulting PRD converges through the loop is unmeasured, and the
honest first test is a small throwaway repository rather than anything that matters.
`CLAUDE.md`'s scope note still forbids pointing the loop at this repository. **The operator has
said that rule can be retired later** — it has not been retired yet, and retiring it is a
deliberate act, not a side effect.

## 0.84.0 — abandoned race worktrees heal at the start, and the consequence is now executed

`removeWorktrees` runs on the driver's paths out. **No `finally` and no signal handler survives
`SIGKILL`**, so cleanup at the end could never have covered the case that produced the leak.
`sweepRaceWorktrees` runs at race *start* instead, removing every `meeseeks-race-NN` worktree already
registered and then pruning — an entry whose directory is already gone is invisible to a removal
loop and still refuses the next `worktree add` on that path.

**0.82.0's run lock is what makes this safe rather than merely likely to be safe.** One driver per
repository means a race worktree present when a race begins cannot belong to a live race here.
Without that guarantee the sweep would be a guess about somebody else's work.

**Tier 2 proved the consequence this file had only asserted.** An abandoned race really does make
the next `createWorktrees` return **zero** worktrees with two problems, and the sweep really does
restore it. There is also a test that a worktree of the operator's own survives untouched, because
a sweep that runs against a real repository and removes the wrong thing is worse than a leak.

**`README.md`'s guard table was corrected in the same pass.** It claimed `nested-meeseeks`
"deliberately leaves alone the bare word in prose". It does not, it never did, and it has now bitten
twice in one session.

## 0.83.0 — racing can land a winner now, and the NEEDS REVIEW below had a false dilemma in it

The entry below framed this as a design decision between **committing the loser's work** (puts
unreviewed changes on the branch) and **cleaning the tree** (discards work the ratchet has not
judged). **Both are wrong, and reading `createWorktrees` settles it in one line:**

```js
options.run('git', ['worktree', 'add', '--detach', dir, options.base], { cwd: options.cwd });
// where base = git rev-parse HEAD
```

**Every candidate is detached at the committed `HEAD`. No candidate ever saw the uncommitted
changes.** Each one's gates passed against `base + its own diff`. Landing the winner on top of
those changes produces `base + winner + something nothing gated` — a tree no evidence in the run
describes. So keeping them is not the cautious option; **it is the one that ships unjudged code.**
That is a stronger argument than "the ratchet has not judged this", and it only exists because the
call site was read instead of reasoned about.

The tree is therefore set aside, and nothing is destroyed: `git stash push --include-untracked`
preserves everything except ignored paths, which is exactly what keeps `.meeseeks/` out of it. Not
popped after a successful merge — re-applying ungated changes on top of the winner rebuilds the
tree this avoids. Popped when the merge fails anyway, because a failed race must leave the tree as
it found it. A stash that cannot be taken refuses the merge rather than proceeding.

Tier 2 reproduces the live failure against a real repository — modified tracked file plus untracked
debris — because whether stashing clears a tree enough for `--ff-only` is **git's** contract, not
one my argv assertions can reach.

**Still true and still unfixed: killing a race with `-9` leaks worktrees**, and the lock added at
0.82.0 has the same hole — neither a `finally` nor a signal handler survives `SIGKILL`. The right
shape is probably a sweep at race start rather than a handler at race end.

## 0.80.0–0.82.0 — the stall blocker, closed on three fronts

**0.80.0, every `claude -p` child.** `childTimeoutMs`, 30 minutes, against a longest-ever-observed
child of 651s. The ordering inside `spawnClaude` is the load-bearing part: the timeout is checked
**before** the existing empty-stdout branch, because a child killed mid-stream can leave a partial
envelope and that branch would have handed the fragment to the parser. A killed child has no
verdict; half of one is a different verdict, not a smaller one. `childStartLine` now names the
ceiling, which is the only thing an operator can act on while the event loop is blocked — it turns
*"is this hung?"*, unanswerable, into *"has it been longer than the number on screen?"*, arithmetic.

**0.81.0, every gate command.** `gateTimeoutMs`, 45 minutes, and the comment says plainly that this
number is **not** derived from measurement, unlike the child one. **No run in this project has ever
recorded a per-gate duration**, and mutation testing is known to be the slow gate without anybody
knowing how slow. It is a backstop sized to be embarrassing to hit. **What would refine it is one
run that logs each gate's wall-clock**, and that is worth doing. A killed gate is reported as
killed rather than as `exit 1`, because the detail is copied into the builder's brief and a builder
told `exit 1` for a suite that hung goes hunting an assertion that does not exist.

**0.82.0, the run lock.** `.meeseeks/lock.json`, checked in preflight and again in the driver, released
in a `finally` on every path out. A live pid refuses, a dead pid is stale and does not. Closes the
two-driver defect recorded below.

### The collision, caught by an existing test rather than by me

The lock was first written as **`.meeseeks/run.json` — which is already `RUN_MANIFEST`.** It would have
overwritten the run manifest on every run. What found it was the manifest's own *"is never read
back by any shipped script"* test, failing on the filename in a new module. That test exists to
prove the manifest decides nothing; it caught a collision it was not written to catch, because it
asserts over **the whole `scripts/` tree** rather than over one module. Worth remembering the next
time a property looks too broad to be worth asserting.

### The guard's `nested-meeseeks` false positive cost time again

Recorded below as found on 12 August and still unfixed. It fired on a `python` heredoc whose
**comment text** contained the two words `meeseeks init` at the start of a line — `checkNestedRun`
tokenizes heredoc bodies and `commandName` read it as an invocation. The whole Bash call was
refused, so the edit inside it never happened, which is the documented expensive half. Recovered by
using the `Edit` tool, which is what this file already advises. **Second recorded instance. The
`README.md` claim that the rule "leaves alone the word meeseeks in prose" remains false.**

## 0.79.0 — the deploy command was the one call in the driver bounded by nothing

Recorded here as unfixed on 13 August and found by writing rather than by running. Now fixed:
`deploy.timeoutMs`, ten minutes by default, validated as a positive integer **even while the
section is disabled**, because a timeout that was written down and is nonsense is wrong the moment
it is written and ship time is the worst moment to discover it.

The deploy body moved out of the effects closure into an exported `runDeploy`, so an injected
shell can drive it. Until now the only way to exercise it was to compose it by hand, and the one
thing nobody composed by hand was a command that never returns.

**Tier 2 earned its keep again, immediately, and this is the finding worth keeping.** The first
implementation keyed the timeout on `error.killed` — which is what the *asynchronous* child_process
API sets. `execFileSync` leaves it `undefined`, so the detector was dead code that could never
fire, and **the unit tests could not see it**: they assert the *reporting*, which was correct, not
the *detection*, which was not. Measured against a real `execFileSync` rather than assumed:

| case | `code` | `signal` | `status` |
|---|---|---|---|
| timeout | **`ETIMEDOUT`** | `SIGTERM` | `null` |
| ordinary non-zero exit | `undefined` | `null` | `7` |
| command kills **itself** | `undefined` | **`SIGTERM`** | `null` |
| missing binary | `ENOENT` | — | `null` |

**So `signal` is not a discriminator either.** A deploy script that terminates itself would have
been reported as a hang, sending an operator to hunt an `ssh` that was never there. Only
`ETIMEDOUT` separates them, and there is a tier-2 test for that specific false positive.

Third time this project has learned the same lesson: **an assertion about the arguments you build
says nothing about what the callee does with them.** §11.1 exists for this and was right again.

`ShellResult.timedOut` is optional rather than required — seven existing doubles inject a shell for
`changedSince`'s git seam, which cannot hang on a remote machine. The real `shell` always sets it
and `runDeploy` tests it for `true`, not for truthiness.

Gates: lint, typecheck, **tier 1 1539 pass, tier 2 23 pass, tier 3 19 of 19 pass** — tier 3 run
because `spawnClaude` defaults to this `shell`.

## Verified from run 10's artifacts: the advisory pipeline works end to end

Never recorded before, and checked against produced artifacts rather than assumed. §4.1's whole
path is live: the reviewer emits `advisory-` entries with `severity`, `confidence` and
`file:line`; the parser accepts them; the confidence filter admits them; and
`.meeseeks/briefs/iter-002.md` and `iter-005.md` render an **`### Advisory findings`** section headed

> *"Suggestions, not requirements. They do not decide whether this run ships. Address them only
> where doing so does not widen the diff the objective above calls for."*

Nine advisories at iteration 1 and eight at iteration 4, **every one at or above 0.7 with real
evidence**, so nothing was silently dropped by the threshold either.

Two of them are worth reading as evidence about the panel rather than about csvstat:

- *"`tests/fixtures/overflow.csv` contains exactly `a\n1e308\n1e308\n` — the input that
  reproduces the `mean: null` defect — but it is untracked in git and no file references it.
  **Someone constructed the reproducing input, left the fixture behind, and shipped neither a
  test nor a fix.**"* The reviewer caught the builder's own abandoned evidence that it knew.
- *"The security-audit gate is never run in CI… so the clean-audit property `DoD-2-security`
  depends on is enforced only by whoever remembers to run gate 6 locally."* A real gap between
  what `CLAUDE.md` claims the gates are and what the workflow executes.

**The ceiling §4.1 describes also held:** advisories never moved a verdict, and because they can
only be addressed on an iteration that was failing anyway, they cost nothing extra.

## Open: the panel is three whole-repository reads run one after another

**Deferred on 12 August 2026 — investigate later.** Recorded now because the measurement exists
and re-deriving it costs an hour.

Where run 10's wall-clock actually went, from its own log:

| phase | children | total | avg |
|---|---|---|---|
| builder | 6 | **47 min** | 470s |
| review | 6 | **26 min** | 263s |
| design | 1 | 6 min | 365s |
| lesson / escalation | 3 | 2 min | — |
| **inside children** | | **1.4 h** | |

Gates sit on top of that, mutation testing especially. Everything is sequential because children
run under `execFileSync`, which blocks the event loop for the whole call — which is also why
there is no heartbeat, and why "hung" and "working" look identical for nine minutes at a time.

**The three reviewers are read-only, own disjoint ids, and never communicate.** They are
independent by design (§1.1) and are serialised for no reason but plumbing. Running them
concurrently turns a review round from ~13 minutes into roughly the slowest single reviewer,
~4½ — and the saving grows with every iteration.

**This file previously called the fix "a rewrite, not a fix" — making the driver async. That is
probably wrong**, because this codebase already solved this exact problem once. `health-probe.mjs`
is a separate program precisely because *"the driver's gates are synchronous exit codes, and
starting a server, polling it and reaping it is not."* The same move applies: a
`scripts/panel.mjs` that takes the panel spec, runs the reviewers concurrently and writes their
envelopes out, invoked by the driver with one `execFileSync`. The driver stays synchronous, and
nothing cascades through `driveRun` or its tests.

**Four guarantees currently live inside `spawnClaude` and would have to move with it**, or the
saving is bought by silently deleting them:

- the **context budget** check before each child (§3.9) — a new door that forgets it is a door
  has no lock;
- **cost and token accounting** from every envelope, or the ceilings stop counting;
- **one reviewer failing must not lose the other two**, and an unparseable report must still
  fail rather than default to pass;
- `combinePanel`'s **coverage re-check**, so a truncated result cannot leave an id unjudged.

**One honest risk:** three concurrent children on a subscription may hit the rate-limit window
harder, or be throttled into looking like failures. Measurable rather than theoretical, and if it
throttles the answer is a concurrency of 2, not a revert.

**Do not buy this time by lowering reviewer effort.** `max` (0.67.0) is what produced run 10's
4000-case differential fuzz and its real `npm install -g` reproduction of an inert `bin`. That is
the only thing in this architecture that has ever caught a defect no gate can see.

## Open: 0.56.0 hands the builder an objective it cannot act on

Run 9 shipped, so 0.56.0 is **satisfiable** — but it cost one entirely wasted iteration
(7.5M tokens, ~$6), and the reason is a contradiction in the brief rather than bad luck.

When the panel passes with no failure evidence, the objective is *"Prove the test suite can
fail"*, and the brief states the escape: *"Changing any first-party source makes the mutation
gate apply again."* The same brief also carries chaos 1: *"Touch only the files this objective
requires. Every changed line must trace directly to it."*

**On an already-correct codebase those point in opposite directions.** There is no surgical edit
to `src/` that traces to "prove your tests can fail", so a builder obeying the scope rule cannot
arm the gate. Run 9's builder did the only other reasonable thing — it wrote another test — and
`node.mjs` filters changed files through `TEST_LIKE_RE`, so a test file can never arm the
mutation gate whatever git reports about it. Iteration 3 eventually touched source and iteration
4 shipped.

> **Reconciled 13 August 2026: BUILT at 0.91.0, and this proposal was wrong in one place.** Both
> named pre-checks were run as measurements, and the second one changed the design: the
> **whole-tree** form below *does* launder a ship. One untested module scores `0.00` and exits 1
> alone, and passes at 84.85% overall, exit 0, beside eight tested ones, because
> `thresholds.break` is a percentage. What shipped is scoped to **the run's own diff since its
> start commit**. See the top of this file.

**The proposal, not yet built: let the driver run the mutation gate itself.** When the panel
passes and the changed set is empty, the driver mutates the whole first-party source once,
rather than handing a builder an objective with no legal move. That converts an unsatisfiable
instruction into a deterministic check the driver performs, at exactly the moment it is worth
paying for — the ship is then earned or refused without spending an iteration on theatre.

Two things to check before building it: the cost of mutating a whole tree at ship time (run 9's
scoped runs were minutes, not seconds), and that it cannot become a way for a run to ship on a
mutation pass it never earned on its own changes. **Do not build it while a run is testing ship
logic** — one variable at a time is the only reason runs 6 and 7 were readable.

## Deploy, built 0.61.0–0.63.0 — and the ssh half is argv nobody has run

The old `deploy` was a stub: one `execFileSync` inside `ship()`, fired **after** the
`meeseeks/GRAND-PRIZE` tag was written, whose failure was printed and ignored. A run could announce a
grand prize having deployed nothing. `DESIGN.md` §10.1 now describes what was built instead.

**Only synchronous fixed-host deploys are supported, and that is a decision, not a gap.** A
push-triggered deploy has no exit code — `git push` exits 0 when the objects transfer and
everything after it is asynchronous and unowned, so smoke-testing it means polling a URL still
serving the *previous* deploy with no signal separating "not yet" from "broken" from "fine".
Vercel and Netlify already own that path through their own git integrations. §3.8.1's finding, in
a new place.

What to know before using it:

- `deploy.command` is an **argv array**; a string is refused by name rather than coerced.
- `enabled: true` requires `command`, `url` **and** `smoke`. A deploy nothing can check reports
  success whatever it did.
- `deploy.url` goes through the **same** `riskyRemoteWord` that refuses a production git remote.
- It runs **before** the ship decision, and a failure **withholds the tag without failing the
  iteration** — a box being down must not `git reset --hard` a tree that just passed a panel.
- `smoke` gets **no** `gate-policy.mjs` entry. It is a ship-time step, not a Phase-3 gate;
  running it per iteration would deploy unreviewed code. Config being filled in is the arming.

**Unproven by execution.** Tier 2 covers the probe against a real listening server, but **nothing
has ever deployed to a real droplet** — the ssh half is argv nobody has run. Treat it exactly as
the .NET adapter is treated: correct by construction, unverified in the world. The first real use
should be a throwaway box, watched.

## Queue item 1 — racing EXECUTED live, and the winner cannot land. 13 August 2026

**The first live race this project has ever run.** `~/meeseeks-logs/race2.log`, segment 3, on
`~/meeseeks-dogfood/race1` with `race.enabled: true, n: 3, after: 1, maxIterations: 10`.

**What actually happened, from the log:**

```
builder: returned after 169s, 1616722 tokens
builder: returned after 224s, 2012851 tokens
builder: returned after 651s, 3822352 tokens
race: 2 candidates passed every gate; candidate 1 won on the smallest diff
      (2250 line(s) across 4 file(s)); error: Your local changes to the following
      files would be overwritten by merge:
	docs/architecture.md
Please commit your changes or stash them before you merge.
Aborting
```

**What worked, and it is most of the mechanism:**

- **Three real children spawned**, sequentially, 169s / 224s / 651s, each on an identical
  18,071-character brief — one brief per candidate, as §13.6 specifies.
- **Each was gated independently.** Two of three passed every gate; one did not and was
  disqualified rather than ranked, which is the "no vote" rule.
- **The winner was chosen on real numbers** — smallest diff, 2,250 lines across 4 files. The
  tie-break ran on measured churn, not on an opinion, and no cold chooser was involved.
- **Worktree cleanup worked.** `git worktree list` afterwards shows only the main tree. The
  leaked-worktree failure §13.6 warns about — one abandoned race breaking every later race — did
  not occur.

**What is broken, and it is fatal to the feature:**

`applyWinner`'s `git merge --ff-only` **ran against a dirty main working tree and git refused.**
The blocking file was `docs/architecture.md`; `git status` at that moment also showed
`docs/api-contract.md`, `e2e/wc2.spec.ts`, `src/bin.ts` modified and `.stryker-tmp/` untracked.

**This is not bad luck, it is the normal state of the tree.** A race is armed by a *stalled*
iteration, and a stalled iteration is one whose work was not committed — the driver commits at
`closeIteration`, so at the moment the race lands, the main tree still carries whatever the
previous builder wrote plus any gate debris. **Racing therefore cannot land a winner in the
situation it is designed to be used in.** The design's own promise — *"the main tree has not
moved, so the merge is a pointer move"* — is false: the main tree has not *committed*, which is a
different thing, and `--ff-only` cares about the working tree, not just the ref.

The run did not fail: it logged the error and continued into segment 4 with an ordinary builder,
so the cost is a wasted race (3 builders, ~7.4M tokens) rather than a dead run. **That is the
worst shape for a defect — expensive, silent, and indistinguishable from a race that simply had
no winner** unless you read the line.

**Two further facts from the same run.** Racing **armed a second time** later in the run, so with
`after: 1` and adequate headroom it arms reliably rather than by luck. And killing the driver
`-9` mid-race **leaks the worktrees**: three were left at `/tmp/meeseeks-race-55237-4/`, detached at
the base commit, and `git worktree list` showed four entries afterwards. Cleanup runs on the
driver's own paths out, not on a signal, which is §13.6's named hazard arriving by a route it did
not anticipate. Recovered with `git worktree remove --force`; an operator who kills a race must do
this or every later race in that repository fails on a directory git already knows about.

**FIXED at 0.83.0, and the dilemma stated here was false — see the 0.83.0 entry above.** This
paragraph read: *"`applyWinner` could commit or stash the main tree before merging, but what it is
committing is the losing builder's work... Cleaning the tree instead discards work the ratchet has
not judged. Neither is obviously right."* Both options were wrong for a reason neither of them
names: every candidate is detached at the committed `HEAD`, so **no candidate ever saw those
changes**, and landing the winner on top of them produces a tree nothing gated. Kept here because
the mistake is instructive — the dilemma dissolved on reading the call site, which is the rule this
file keeps writing down and this entry did not follow.

### Attempt 1 never armed, and the arithmetic is the constraint worth keeping

`~/meeseeks-logs/race1.log`, `~/meeseeks-dogfood/race1`, `race.enabled: true, n: 3, after: 2,
maxIterations: 6`:

```
SEGMENT ONE   -> review outstanding: 9 finding(s)
SEGMENT TWO   -> gates failed: quality:knip
SEGMENT THREE -> review outstanding: 2 finding(s)
SEGMENT FOUR  -> review outstanding: 3 finding(s)
SEGMENT FIVE  -> (killed here)
```

**Two things had to line up and did not.** First, a converging run keeps resetting the stall
counter: `recordProgress` counts an iteration as improved when the gate score rises *or* the
ratchet grows, so findings falling 9 → 2 while the builder was also adding tests kept
`passingCount` climbing and `stalledIterations` returning to zero. The PRD was designed to
plateau — one impossible latency clause, everything else satisfiable — and it did not plateau
soon enough.

Second, **`shouldRace` refuses when fewer than two iterations remain** — *"a race needs one to run
and one to land the winner."* With `after: 2` and `maxIterations: 6`, racing can arm only in the
window between iterations 3 and 4, so both stalls have to land inside it or the opportunity is
gone, and at segment 5 the run was already past it whatever it did next.

**The rule: `maxIterations >= race.after + 3`, and the stall has to arrive early.** I killed the
run at segment 5 once the window had closed rather than let it spend two more iterations proving
nothing — the operator's standing instruction is to stop a run whose problem is known rather than
watch it finish. The `knip` failure at segment 2 is the evidence that this PRD does produce
non-improving iterations, which is why attempt 2 — **the race recorded above** — was re-run on the
same tree with `after: 1` and `maxIterations: 10`.

## Nothing stops two drivers running against one repository. 13 August 2026

Found at the start of the unsupervised session, and it destroyed a run before it was noticed.

`ps` showed **three** driver processes, two of them with `cwd` = `~/meeseeks-dogfood/csvstat-h`:
run 14 at 29 minutes and run 15 at 10. **Run 14 had been sent `SIGTERM` and had not died**, so
when run 15 launched, two independent drivers were mutating one tree — each able to
`git reset --hard` it, rewrite `.meeseeks/`, and commit over the other. Run 15's result is void and
nothing may be concluded from its log.

**§13.6's re-entrancy guard does not cover this.** It refuses a *nested* run — a builder invoking
the slash command — and the driver refuses to spawn one. Two operators, or one operator twice,
starting independent drivers on the same directory is a different thing entirely and nothing
looks for it.

The cheap fix is the conventional one: a pidfile under `.meeseeks/`, written at start and checked at
preflight, refusing when the recorded pid is alive. It fits the existing design — `.meeseeks/` is
already driver-owned and §6 already denies a run every write there, so a builder cannot forge it.

**The paragraph that once stood here said "deliberately not built". It was built at 0.82.0** —
`scripts/run-lock.mjs`, `.meeseeks/lock.json`, checked at start, and verified live in the improve3
run, which held `pid: 59477` throughout; see the top of this file. The design questions recorded
here — a stale pidfile must not lock the repository forever, and "alive" is not "mine" after pid
reuse — were the input to that implementation, not reasons it stayed unbuilt.

**Operationally, until then:** check `ps -eo pid,args | grep driver.mjs` before launching, and
verify a kill actually took. **The claim that once stood here — that `kill -TERM` did not stop a
driver — was measured on 13 August and is wrong; see the entry at the top of this file.** SIGTERM
kills the driver on the first try. What survives is its orphaned `claude` child, still running and
still spending, which is what `ps` shows you afterwards. Kill that too, by pid, and do not read its
presence as a driver that refused to die.

## Queue item 3 — the 0.56.0–0.58.0 ship condition, both branches reached live. 13 August 2026

**Not tested in isolation: reached by runs that executed**, and in two cases both branches
appear in the same run. Log line numbers given so this is checkable rather than asserted.

**0.56.0 — withholding.** `run9.log:30` and `run12.log:77`, identically:

```
cannot ship: nothing has demonstrated that these tests can fail: none has been observed
red, and the mutation gate did not run and pass on this iteration
```

In run 12 the panel had **passed unanimously** at that iteration. The ship was withheld by the
suite-sensitivity check alone, and the iteration was *not* failed — which is the specified
behaviour and the difference between a withheld tag and a destroyed tree.

**0.56.0 — shipping.** `run9.log:69` `SHIPPED: panel unanimous on 15 requirement(s)` and
`run12.log:111` `SHIPPED: panel unanimous on 16 requirement(s)`. Both runs therefore traversed
**withhold → repair → ship** end to end.

**0.58.0 — blocking.** Run 10's `review.json` carries six `DoD-6-adversarial-input` entries, and
the run ended `run10.log:84` `BUDGET: iteration limit reached: 6 of 6` **without shipping**, while
its panel had passed every other id. Verified against the binary rather than the panel: the tree
it refused reported `mean: 0` where the true value is `1/3`.

**0.58.0 — allowing.** Run 12 shipped 16 ids, `DoD-6` among them, and I checked that build by
execution: cancellation returned `0.3333333333333333` and the unterminated quote exited 3. The id
passes when the defect is gone and fails when it is present, on the same PRD.

### What is still unproven in this item

**0.57.0's retraction path has never fired.** No run has produced a `never-was` verdict retracting
a false security pin. Runs 5 and 10 observed `moved` and `removed`; `unknown` — and therefore
quarantine — remains unobserved, and quarantine is the rule that makes "quarantine is not a pass"
mean anything.

**NEEDS REVIEW:** I am recording this item as proven from runs executed earlier in this same
session rather than from a run constructed tonight for the purpose. The evidence is real and the
line numbers are checkable, but the runs were not designed as the item's experiment — they are
runs whose outcome happened to traverse both branches. If that is not the standard wanted, the
item needs a purpose-built run and this section should be treated as evidence, not as a tick.

## Queue item 2 — .NET test-ID extraction, proven against real `dotnet test` output. 13 August 2026

**The queue named this as the expected failure point. It is not one.** Verified against a real
SDK-scaffolded solution rather than a fixture, at `~/meeseeks-dogfood/dotnet-probe`.

**Environment, checked rather than assumed:** `dotnet 8.0.423` at `/usr/share/dotnet/sdk`, with
`console` and `xunit` templates available. That is the same version `DESIGN.md` §3.8.1 says the
adapter's commands were verified against. The README line claiming no SDK exists was stale and is
fixed.

**What ran:** `dotnet new sln/classlib/xunit`, a two-function `Calc` class, five test methods
including a two-case `[Theory]`, then **the driver's exact unit command** read out of the adapter
rather than retyped:

```
dotnet test --logger trx;LogFileName=unit.trx --results-directory <root>/.meeseeks
```

It produced a real 9,831-byte `unit.trx`. Feeding it to `extractTestIds` the way `driver.mjs:1475`
does — one report string at a time, not the array I first tried:

```
ids extracted: 7
   Core.Tests.CalcTests.AddsNegatives
   Core.Tests.CalcTests.AddsTable(a: 0, b: 0, e: 0)
   Core.Tests.CalcTests.AddsTable(a: 1, b: 1, e: 2)
   Core.Tests.CalcTests.AddsTwoPositives
   Core.Tests.CalcTests.DetectsNegative
   Core.Tests.CalcTests.DetectsNonNegative
   Core.Tests.UnitTest1.Test1
STABLE across rootDir change: true
```

**Both `[Theory]` cases appear as distinct ids** carrying their parameters, which is correct — they
are two results. And the set is **identical under a different `rootDir`**, which is §11.2's named
hazard: TRX records `storage` as an absolute path *lowercased by the runner*, so an id built from
it would differ on every machine and the ratchet would read every test as new. It is built from
`testName`, and that holds.

**The failure direction, measured rather than reasoned.** One assertion was broken deliberately
(`Assert.Equal(-99, …)`) and the suite re-run:

```
Failed! - Failed: 1, Passed: 6, Total: 7
passed: 6 | failed: 1
  FAILED -> Core.Tests.CalcTests.AddsNegatives
the failing id is NOT counted as passing: true
```

A reporter that only ever reports success is what §11 exists to distrust; this one distinguishes.

**One correction to my own method.** My first attempt passed `[trxText]` — an array — and got
`report matches none of the known reporters`, which I nearly filed as the predicted defect. The
driver passes **one string per call**. The throw was correct behaviour on malformed input and the
malformed input was mine. Third time in this session I have nearly reported my own misuse as a
finding, which is an argument for reading the call site before believing a reproduction.

**Still unproven for .NET, and this is the honest remainder:** no run has driven the adapter. The
extraction is the piece the queue flagged as most likely to fail silently, and it does not — but
`build`, `lint`, `security-audit` and the `ci` inspection have still never been executed by the
loop against a .NET tree, and `types`, `e2e` and `mutation` are declared `notApplicable` with
stated reasons that no run has exercised either.

## Queue item 4 — deploy, proven to its boundary. 13 August 2026

**No host was provisioned, so the ssh transport remains unexecuted.** Everything on this side of
it was run rather than asserted, against a real listening server on `127.0.0.1:8731`.

**The smoke probe, real socket, real output:**

```
3 smoke check(s) passed against http://127.0.0.1:8731                         exit 0
1 of 1 smoke check(s) failed - /nope: expected 200, answered 404              exit 1
1 of 1 smoke check(s) failed - /sick: health endpoint reported itself as "down"  exit 1
1 of 1 smoke check(s) failed - /health: connect ECONNREFUSED 127.0.0.1:9      exit 1
no smoke checks were given, so nothing was verified                          exit 1
```

The third line matters most: **a 200 with a body admitting distress fails**, so the check is not
merely comparing numbers. The fourth returned in under two seconds rather than hanging. The fifth
is the one that would otherwise be silent — an empty check list reports failure rather than a pass
over nothing.

**The config boundary, every case exercised through `validateConfig`:**

| input | outcome |
|---|---|
| `enabled` with no `command` | REFUSED — "there is nothing to run" |
| `enabled` with no `url` | REFUSED — "a deploy that is not asked whether it worked" |
| `enabled` with no `smoke` | REFUSED — "a deploy nothing checks cannot fail" |
| `command` as a string | REFUSED — names the array it wants |
| `url` containing `production` | REFUSED — same `riskyRemoteWord` that refuses a prod git remote |
| `url` not http(s) | REFUSED — `ssh://box/app` |
| smoke entry without `status` | REFUSED — "did anything answer is satisfied by a 500" |
| **disabled** and incomplete | **accepted** — an unused section must not fail runs that never deploy |
| complete and valid | accepted, argv preserved as `["ssh","deploy@box","/srv/app/deploy.sh"]` |

**The driver's deploy effect, composed exactly as `main()` builds it and executed:**

```
deploy ok, smoke ok   -> {"ok":true,"detail":"1 smoke check(s) passed against http://127.0.0.1:8731"}
deploy ok, smoke FAIL -> {"ok":false,"detail":"1 of 1 smoke check(s) failed - /nope: expected 200, answered 404"}
deploy command FAILS  -> {"ok":false,"detail":"the deploy command failed: 7"}
```

A non-zero deploy command is distinguished from a deploy that ran and failed its smoke, and both
are distinguished from success — which is what the withholding logic keys on.

### Where the untested surface starts, precisely

Everything above ran. **What has never executed is one line:** `shell(command, args, { cwd })`
where `command` is `ssh`. Specifically unproven —

- **that `ssh` inherits the operator's agent and known_hosts through `process.env`.** The driver
  passes `options.env ?? process.env` and never sets `SSH_AUTH_SOCK` itself, so this is inherited
  rather than arranged, and an unattended run with a passphrase-locked key would block on a
  prompt no one can answer. **Nothing times out a deploy command.**
- **that a remote failure surfaces as a non-zero exit** rather than ssh succeeding while the
  remote script fails — the `dotnet list package --vulnerable` shape (§3.8.1), where a wrapper
  exits 0 over a failure underneath.
- **the real-host round trip**: deploy, then a smoke check against a URL served by something the
  deploy actually changed, rather than a server this session started.

**NEEDS REVIEW:** the missing timeout is a real hazard I found by writing this up rather than by
running anything, and I have not fixed it — a hung `ssh` stalls the run indefinitely with no
ceiling, since `tokenCeiling` and `costCeiling` only bind children that return. It is one line to
add and I have left it alone because this was not a build session.

## Run 13 oscillated, and the cause is the strongest argument A3 has ever had

Observed live at segments 1–5 of case H. The loop entered a stable two-cycle:

```
segment 1: panel -> 3 findings
segment 2: regression: src/summarise.test.ts::folds mean left-to-right ... IEEE-754 doubles
segment 3: panel -> 4 findings
segment 4: regression: the same test
segment 5: panel -> 4 findings
```

**The builder wrote a test that asserts its own implementation, and the ratchet made it
permanent:**

```js
it("folds mean left-to-right in row order using IEEE-754 doubles", () => {
  expect(result.mean).toBe((0.1 + 0.2) / 2);
});
```

The PRD says *"the arithmetic mean"*. That test says *"whatever my loop does"* — it names the
implementation in its own title. It passed, it entered the ratchet, and it is now protected
forever.

Then the panel did its job. `DoD-6-adversarial-input`: *"src/summarise.ts:33 (`sum += n`, an
unguarded fold) … a confidently wrong answer at exit 0."* Two repair attempts broke the protected
test and were hard-reset.

### Correction, written after watching it resolve: the cycle broke, and how it broke is the finding

**An earlier draft of this entry said the correct repair was "a regression by definition" and that
the loop was in a stable deadlock. That was too strong, and the truth is more interesting.** The
oscillation lasted two cycles and then the builder escaped it — by changing the formulation from
`sum += n` to **`mean += n / count`**. Measured directly:

| input | `mean += n / count` | verdict |
|---|---|---|
| `0.1, 0.2` | `0.15000000000000002` | **passes the protected test exactly** |
| `1e308, 1e308` | `1e+308` | **fixes the overflow the panel demanded** (was `Infinity`) |
| `1e16, 1, -1e16` | **`0.5`** | true answer is `0.3333333333333333` — **still wrong, and newly wrong** |

So the protected test did not block the repair. **It narrowed the solution space, and the builder
found a point in it that satisfies the reviewer's stated finding while leaving the defect class
intact** — trading one wrong answer at exit 0 for a different wrong answer at exit 0.

That is a subtler failure than a deadlock and a worse one to detect. A deadlock is loud: the same
regression, forever, in the log. This resolves, the findings converge, the gates go green, and the
run proceeds looking healthy. **The panel asked about `1e308` because that is the case it found;
the builder fixed exactly that case.** Nobody lied and nobody stalled.

**It remains the argument for the held-out oracle, by a different route than the one first
written here.** The oracle's cases are authored from the PRD before any code exists, so the
assertion is *"mean is the arithmetic mean"* rather than *"mean matches the input the reviewer
happened to try"* — and a repair that fixes one input while breaking the property still fails.
Run 12 showed the panel cannot close this hole. Run 13 shows that a finding phrased as a specific
input gets answered as a specific input.

**Both mechanisms are behaving exactly as specified.** The ratchet is monotonic on test
*identity* and has no opinion on whether an id was worth having — `BRIEF.md`'s A3 section has said
those words since it was written. This is that sentence happening in a live run.

**It is the case for the held-out oracle, produced by the loop itself.** An oracle case is
authored from the PRD before any code exists, so `mean` for `0.1, 0.2` would be asserted as the
arithmetic mean rather than as whatever the fold returns, and the builder's self-serving test
would never have become the authority. A3 was deferred for months on sequencing; run 12 showed
the panel cannot close the hole, and run 13 shows the ratchet actively defends it.

**Do not "fix" this by weakening the ratchet.** A test that has passed may never be allowed to
fail again — that invariant is the only reason this loop terminates. The defect is not that the
ratchet protected an id; it is that the id was allowed to encode an implementation as a
requirement in the first place. The oracle is upstream of that, which is why it is the fix.

**Proposed, measured, and rejected — do not rebuild it.** The tempting patch was a `gate-integrity`
rule refusing an assertion whose expected value is an *expression* rather than a literal, since
`toBe((0.1 + 0.2) / 2)` recomputes the implementation instead of stating an answer. Measured
against the four shipped dogfood suites — **337 assertions, 6 matches:**

| match | verdict |
|---|---|
| `toBe(USAGE + '\n')` × 4 | legitimate: a constant concatenated with a newline |
| `toBe(-1e308)` | **false positive of the detector itself**, matched on the minus sign |
| `toBe((0.1 + 0.2) / 2)` | the real defect |

**One true positive, five false.** §4's own rule settles it: a false positive costs a full
iteration on a correct repository, a false negative costs nothing the reviewer was not already
covering. This would have been the eighth unsatisfiable gate.

It is also not syntactically detectable in principle. What makes that assertion wrong is that it
**recomputes the implementation over the same literals the input contains** — a semantic
relationship between test and fixture, not a shape a regex can see. The oracle catches it because
it never asks the implementation what the answer is, which is the whole argument for §4.6.

## Run 12 SHIPPED — and shipped a wrong answer past a 110,877-case audit

Case G, `~/meeseeks-dogfood/csvstat6`, same PRD, twelve iterations, 0.65.0. Log at
`~/meeseeks-logs/run12.log`.

```
SHIPPED: panel unanimous on 16 requirement(s)
iterations: 6  tokens: 57782345  cost: $49.4684  passing: 107   (0 quarantined)
```

Panel trajectory: **6 → 2 → 1 → pass → 3 → pass.** Sixteen ids, because `DoD-6` is now one of
them.

**What shipped, verified by running the binary rather than by reading the panel:**

| defect | run 9 (no `DoD-6`) | run 10 | run 12 |
|---|---|---|---|
| unterminated quote | **shipped: half the data at exit 0** | blocked → fixed | fixed, `exit 3` |
| sum overflow | — | blocked → fixed | fixed, `mean 1e+308` |
| **catastrophic cancellation** | — | **named by the panel** | **`mean: 0`, true mean 1/3, exit 0 — SHIPPED** |

### Why it was missed, which is the finding

**The reviewer was not lazy. It was exceptional.** It wrote an independent reference parser and
summariser *from the PRD and data model* and differentially fuzzed the binary against it —
**110,877 cases** — plus truncation, CR-only line endings, BOM, numerics and boundaries. Its own
words on the case it passed:

> *"two values of `1e308` → mean 1e308 (the naive sum overflows; `summarise.ts:58` falls back to
> `stableMean`…)"*

**It tested the guard, not the gap beside the guard.** `stableMean` triggers on a *non-finite*
sum. `1e16, 1, -1e16` never overflows — it loses precision **inside** finite range, the fallback
never fires, and the naive sum returns 0. The reviewer verified the repair where it triggers and
never asked where it doesn't.

**And the fuzz could not have caught it.** The reference was written from the same documents, so a
property those documents never mention — floating-point associativity — is invisible to *both*
implementations equally. **That is the oracle problem, and it is why A3 is now the top of
`COMPLETION.md`.** A differential fuzz against a reference derived from the same spec is not an
independent oracle; it is the same assumption twice.

**The invalid-UTF-8 case is a genuine disagreement, not a miss.** Run 10 called `distinct: 1` for
`\xff` and `\xfe` a defect; run 12 saw the identical input and judged *"→ U+FFFD, exit 0, counts
correct"*. Both bytes decode to the same replacement character, so both readings are defensible.
Two reviewers, one input, honest disagreement — a judgment line behaving like one.

**The verdict on `DoD-6`: it raises the floor enormously and it is not a guarantee.** Two of three
known defects were driven out of the product by it. `DESIGN.md` §4.5 predicted exactly this — *"it
is exactly as good as the reviewer executing it"* — and that is now measured rather than reasoned.

### 0.56.0 cost a clean panel, and this is no longer provisional

Iteration 5's panel **passed unanimously**. The sensitivity check withheld the ship. The builder
touched first-party source as the brief instructs — and **iteration 6 came back with three
findings.** Two extra iterations and roughly $16 to satisfy a check about the *suite* rather than
the *code*. Second run in a row it has cost real iterations; the fix is `COMPLETION.md` §2.1.

## The guard's `nested-meeseeks` rule has a false positive, and it fails loudly in the wrong place

Found by being bitten, 12 August. A `git commit` whose **message** described the slash command was
refused with `[meeseeks:nested-meeseeks]`. `README.md` claims that rule *"deliberately leaves alone the
word 'meeseeks' in prose"*; it does not, once a slash is attached.

**The expensive part is not the refusal.** The deny killed the **entire Bash call**, and that call
also contained the `python` heredoc performing a documentation edit. The edit never happened, the
following `git push` succeeded as a no-op on a clean tree, and the whole sequence looked like a
successful doc fix. It was caught only because `git commit` printed `nothing to commit`.

**It may be correct and merely expensive.** Telling an invocation from a mention needs shell
parsing, and this repository's own reasoning says a whitelist that fails open on the first heredoc
is worse than a blunt rule. Rules 2–4 are deliberately refused to everyone, operator included.

Two things worth doing before deciding: **`README.md`'s "leaves alone" claim is currently false and
should say so**, and a compound command that mixes an edit with a blocked git call will silently
lose the edit — so prefer the `Edit` tool over `python` heredocs when the text names the command.

## Run 10: DoD-6 blocked the ship, the loop repaired what it named, and `removed` fired

Case G again (`~/meeseeks-dogfood/csvstat4`), same PRD, fresh tree, log at `~/meeseeks-logs/run10.log`.
**The only variable against run 9 was `DoD-6-adversarial-input`.**

```
BUDGET: iteration limit reached: 6 of 6
iterations: 6  tokens: 41469901  cost: $29.4515  passing: 79   (0 quarantined)
```

**`DoD-6` failed in both panels and is a true positive.** It named two input classes, with exact
inputs, exact outputs and `file:line` sites: `1e308 + 1e308` produced `"mean": null` at exit 0
(true mean `1e308`, already printed as `min` and `max`), and `1e16, 1, -1e16` produced
`"mean": 0` where the true mean is 1/3. Invalid UTF-8 collapsed two distinct values to
`distinct: 1`.

**And the loop repaired every one of them.** Verified independently against the final tree, by
execution, not by reading the panel:

| input | run 9 (shipped) | run 10 (refused, then repaired) |
|---|---|---|
| `printf 'a\n1e308\n1e308\n'` | — | `"mean": null` → **`1e+308`** |
| `printf 'v\n1e16\n1\n-1e16\n'` | — | `"mean": 0` → **`0.3333333333333333`** |
| `printf 'a,b\n1,"x\n2,y\n'` | **shipped: half the data at exit 0** | **`exit 3: unterminated quoted field`** |

Compensated summation, and the cancellation case is now exact. **The tree run 10 refused to ship
is materially better than the tree run 9 shipped**, on the same PRD, and the difference is one
required id.

The panels also converged **7 findings → 4**, and iteration 1's reviewer caught something no gate
in this architecture can see: the packaged `bin` was **inert**. `npm pack`, `npm install -g`, then
`csvstat data.csv` → zero bytes, exit 0, because `src/cli.ts:41` compared `import.meta.url`
(realpath) against `process.argv[1]` (the bin symlink). Its own words: *"all six gates were run
and are green — which is precisely the problem: every gate invokes `node dist/cli.js` and none
invokes the shipped bin."* Reviewers also ran a 4000-case differential fuzz of the parser against
a transcription of the state machine, and 300 cases against an independent Python reference,
unprompted.

### The `removed` pin verdict fired, for the first time

This file said for two days that `removed` and `unknown` were unobserved and would need a PRD
whose security element sits off the tested path. `removed` arrived on its own:

```
pinned security element DoD-2-security at package.json:18 did not re-verify; asking
security-escalation: claude-opus-5 running on 1221 characters of prompt
security regression: DoD-2-security at package.json:18
```

The pinned snippet was `"dependencies": {},` — the zero-runtime-dependency guarantee. The builder
disturbed it, the cheap check failed, one scoped escalation child answered `removed`, a regression
objective was issued, and the element is **`active` again with its snippet restored**. A4 now has
`moved` (run 5) and `removed` (run 10) both measured end to end. `unknown` remains unobserved, and
`bloopers.log` stayed empty — the security-regression path is separate from the ratchet's reset,
which is worth knowing before looking for a blooper that will not be there.

### What to fix next, and it is not `DoD-6`

**Iterations 5 and 6 both died on `gates failed: mutation` and never reached a panel.** The
repairs `DoD-6` provoked were therefore never re-judged, and the run ended `BUDGET` holding a tree
that had probably earned a ship. Six iterations was enough when the bar was run 9's; it is not
enough now that a real correctness line has to be satisfied *and* the mutation gate cleared on the
same iteration.

Two candidates, in order:

1. **Raise `maxIterations` for the next case G run** — the cheapest possible test of whether this
   is purely a budget effect. Run 10 was still improving when it stopped, exactly as run 5 was.
2. **Look at whether the mutation gate is now the binding constraint.** It declined twice for "no
   first-party source changed" and failed three times. A gate that blocks the panel on the very
   iterations that repair a correctness finding is worth measuring before it is trusted.

## Run 9 shipped, and the panel had already proved it should not have

Case G, fresh repo (`~/meeseeks-dogfood/csvstat3`), the same PRD run 8 shipped, log at
`~/meeseeks-logs/run9.log`. **The first run in this project's history with a working guard hook.**

```
SHIPPED: panel unanimous on 15 requirement(s)
iterations: 3  tokens: 27899716  cost: $23.5132  passing: 58
```

**What worked.** `0.56.0` is satisfiable: `seenFailing: 0`, so the ship was earned through the
mutation gate exactly as designed. 3 security pins, all `active`, **0 quarantined** — not a ship
over lost protection. It cost **one entirely wasted iteration**: iteration 2 made *zero tracked
changes* (7.5M tokens, ~$6) against the "prove the suite can fail" objective before iteration 3
finally touched source and armed the gate. Expensive, not deadlocked. An earlier reading in this
session called it unsatisfiable; that was wrong.

**What did not.** The shipped binary reports statistics over **half its input** when a quote is
left unterminated, at exit `0`, empty stderr — the same defect run 8 shipped, reproduced
verbatim:

```
$ printf 'a,b\n1,"x\n2,y\n' > swallow.csv     # two data rows
$ node dist/bin.js swallow.csv                # count 1, mean 1
$ echo $?                                     # 0
```

Integers past 2^53 still collapse two distinct ids into one wrong value at exit 0. The lone-`\r`
case **is** fixed (exit 3 now).

**And here is the part that matters.** The panel was not asleep. **All three cold reviewers found
it independently, each ran the program themselves, and each returned `status: fail`** citing
`src/csv.ts:21` — one at severity `major`, confidence **0.95**, quoting its own input and output.
`0.58.0`'s widened remit worked perfectly.

They filed it as `advisory-`, and §4.1 says an advisory cannot move the verdict. The shipping
panel's own record: `verdict: pass`, `failing: []`, **`advisories: 12`, every one `status: fail`.**

**They filed it there because there was nowhere else.** The contract has two channels — a verdict
on a required id, or an advisory — and no required id covered it. The PRD never mentions
unterminated quotes, and `PRD-2.1` is genuinely satisfied. A reviewer obeying the contract had
exactly one place to put the finding, and it was the place that cannot block.

**The lesson generalises past this defect: a remit is not a channel.** 0.58.0 told the panel it
*may* fail a demonstrable wrong answer without giving it an id to do so on, and permission with
nowhere to act is indistinguishable from no permission. **When you widen what a reviewer may
judge, check that a required id exists to carry the answer.**

Fixed at **0.60.0** by `DoD-6-adversarial-input`: a required id, owned by correctness, whose bar
is narrow and absolute — *a wrong answer at exit 0 is a fail; a crash or a non-zero exit with a
diagnostic is not.* `templates/reviewer-system.md` tells the reviewer to construct hostile inputs
and run them, names the classes (truncation that still parses, encodings, numeric limits,
boundaries), requires a pass to state what was tried, and says in as many words not to file this
as an advisory. `DESIGN.md` §4.5.

**It is a judgment line, not a gate, and that is stated rather than hidden.** No exit code
enforces it. It is exactly as good as the reviewer executing it. It is strictly better than the
advisory channel that discarded three correct findings, and strictly weaker than a deterministic
check — which for this class does not exist, because "is this number right" is the oracle
problem. `gate-integrity` cannot see it and neither can the mutation gate, whose tests are
insensitive to inputs nobody thought to write.

**The next run is the test of that, exactly as run 9 was the test of 0.56–0.58.** Re-run case G
on a fresh repo with the same PRD. If `DoD-6-adversarial-input` works, the panel fails that id and
the run does not ship until the quote handling is fixed.

## The guard hook was never firing. Not once, in any run.

**Found and fixed on 12 August 2026 at 0.59.0, and it is the most serious defect this project has
had.** `hooks/hooks.json` registers the guard with Claude Code, which applies it to the
*operator's* sessions. **A `claude -p` child does not load the operator's plugin PreToolUse
hooks.** Measured, not inferred: a child stamped `MEESEEKS_RUNNING=1` overwrote `.meeseeks/state.json`
through the Write tool **and** through a Bash redirect, in dangerous **and** non-dangerous mode,
each time returning `permission_denials: []`.

**Every dogfood run in this file was performed with no guard at all**, run 8 included — the one
that `SHIPPED`.

Two things hid it, and both are instructive:

- **The plugin was demonstrably loaded in those children.** Its *SessionStart* hook injected
  content into the same process. The two hook kinds do not travel together, so every visible
  signal said the plugin was present.
- **`test/guard.test.mjs` was right the whole time and passed the whole time.** It runs
  `guard.mjs` as a subprocess and proves the deny, the allow and the benign neighbour. It proves
  the *logic*. Nothing asserted the *invocation*. **This is the `claudeArgs` defect, arrived at
  the safety mechanism** — and the single strongest argument this repository owns for §11.1.

The fix: the driver supplies the hook in the `--settings` blob it already passed for the output
style, **reading the matcher from `hooks/hooks.json`** rather than restating it, expanding
`${CLAUDE_PLUGIN_ROOT}` itself, and throwing on every failure path — `-p` mode silently ignores a
settings blob that fails validation, which would drop the guard and the style together without a
word. It no longer depends on the plugin being installed, enabled, or at the tree's version, none
of which was true here. `test/live/guard-registration.live.test.mjs` holds it, and was verified by
sabotage: without the registration both deny cases fail and the benign neighbour still passes.
`DESIGN.md` §6.

**The plugin is installed at 0.39.0 — nineteen versions stale — and its hook is live in ordinary
sessions** (it refused a recursive `rm` in this one). That no longer matters for a run, which is
the point of the fix, but do not read a denial in your own terminal as evidence a child is fenced.
They are different processes and, until 0.59.0, different answers.

## The second finding: children inherit the operator's context, and it is wider than §5.0 says

Also measured on 12 August, and **not yet fixed.** A `claude -p` child — in the repo *and in an
empty temp directory* — is handed the operator's installed-plugin SessionStart injections, the
project `MEMORY.md`, `userEmail`, git status and the skills list. Asked without tools, a child
quoted this machine's memory line back verbatim.

It is not only a skill surface. The injected text carries **imperative behavioural instructions**
(*"Invoke relevant skills BEFORE any response or action — including clarifying questions"*), and a
child obeyed **that** instead of the driver's prompt: tier 3 failed once with a live builder
answering *"What would you like me to focus on today?"* to a prompt that asked for one word. It
passed on re-run. **An intermittent instruction-override in every child of the loop, including the
cold panel**, whose starvation is the reason the architecture exists (§1.1).

`--safe-mode` is the mechanism and it is verified: it suppresses the injections, the memory and
CLAUDE.md, and unlike `--bare` it leaves auth working on a subscription (`--bare` demands
`ANTHROPIC_API_KEY` and never reads OAuth, so it is unusable here).

**But it is mutually exclusive with the guard, and that was measured rather than assumed.** A
child given `--safe-mode` **and** the settings-supplied guard from 0.59.0 still overwrote
`.meeseeks/state.json` with `permission_denials: []`. Safe mode disables hooks *including the ones
handed to it explicitly*. There is no combination that gets both.

So the only defensible split is by write capability, and it happens to be the split that already
exists in `PHASE_PERMISSIONS`:

| phases | what they may have |
|---|---|
| `review`, `reality-check`, `lesson-extractor`, `security-escalation` | **safe-mode.** They hold `Read`/`Glob`/`Grep` and no Bash, so there is nothing for a guard to deny, and starving them further is what §1.1 wants anyway |
| `builder`, `prd`, `design` | **guard, and no safe-mode.** They can write. Losing the guard to gain isolation would trade a measured catastrophe for a measured annoyance |

That leaves the builder's inherited context an **open problem**, exactly as §5.0 says — now with a
measurement behind it and a known reason it cannot be closed the easy way. Note also that safe-mode
suppresses CLAUDE.md, and runs 6 and 7 are a controlled A/B proving the builder's reading of the
target `CLAUDE.md` is load-bearing; any future attempt to isolate the builder has to carry that
file into the brief deliberately rather than lose it silently.

## The one thing to know before doing anything

**Versions 0.56.0, 0.57.0 and 0.58.0 have never been exercised by a live run.** They change the
*ship condition* itself:

- **0.56.0** — a panel pass no longer ships alone; the run must also hold proof the suite can fail
  (mutation gate passed, or something observed red).
- **0.57.0** — a security pin can be retracted by a new `never-was` verdict.
- **0.58.0** — the reviewer may fail a demonstrable wrong answer that exits 0.

The first of those can **withhold a ship that should happen**, and that is exactly the shape of
defect this project keeps rediscovering — a gate nothing can satisfy. It is designed against that
(it withholds the ship, never fails the iteration, and any iteration touching first-party source
makes the mutation gate apply again) but **design is not evidence.** The next run is the test.

## Do this next

> **Reconciled 13 August 2026 (stratigraphy sweep). This list is from before run 8 and three of
> its four items have moved.** Item 1 happened: **run 8 was this project's first `SHIPPED`**, and
> the independent audit of that ship found the binary discards data at exit 0 — both halves are
> the finding. Item 3 is decided and built: A8's carry landed at 0.92.0 as a *pre-filter*, and the
> test-file-evidence hazard it names was decided in the same sweep that found this list —
> `isTestEvidence` refuses to carry a requirement evidenced only by a test.
> **Items 2 and 4 are still exactly true**: no builder child has ever run inside a race worktree,
> and the .NET adapter has still never been driven by a *run* (its argv is now executed — see the
> note on item 4 below). Both are in `DOGFOOD.md`'s
> operator queue.

1. **A fresh case G run** (`DOGFOOD.md`), on a new scenario repo, not a resume. It is the first run
   with 0.56–0.58 live, and it answers whether a ship still happens when a ship must now be earned.
   The previous scenarios are at `~/meeseeks-dogfood/csvstat` and `csvstat2`; logs go **outside the
   tree**, at `~/meeseeks-logs/`.

   **It is also the first run in this project's history that will have a guard hook** (0.59.0,
   above). Prefer the *same* PRD run 8 shipped, on a *fresh* repo: it holds the specification
   constant against a known outcome, so what it measures is the loop — whether a ship is still
   reached when every test must be earned from zero, and whether 0.58.0's widened remit catches
   the exit-0 data loss the run-8 panel passed. A new PRD would change two variables at once.
2. **Racing has never run with a live builder.** `race.enabled` is `false`; the git half is tier‑2
   tested, and the half that costs money has never executed once. C5 is blocked behind it. This is
   the largest untested surface left.
3. **A8's carry optimisation — decide before building.** Run 3 pinned `PRD-3.1` to a *test file*, so
   the carry would let a source regression slip through unre-litigated.
4. **The .NET adapter is `DONE` on argv nobody has executed.** No SDK on this machine. Every
   contract test passes regardless. Do not trust it until an SDK exists.
   > **Reconciled 13 August 2026: the SDK does exist — `dotnet 8.0.423` — and this note was
   > stale in two files.** Queue item 2 executed the *unit* command against it; on 13 August the
   > remaining four (`restore`, `build`, `security-audit` with its `-warnaserror:` form, and
   > `lint` via `dotnet format --verify-no-changes`) were executed too, all exit 0 on a clean
   > solution, with the TRX landing where the ratchet looks and a mixed pass/fail round-tripping
   > through `parseReport`. **Still true and unchanged: never driven by a run** (item 20 case C).

## What happened on 12 August

Nineteen versions, `0.40.0` → `0.58.0`, each traced to a produced artifact rather than an assertion.
Six dogfood runs. **Cases E and F passed live** — the ratchet reset a real tree and issued a
regression-only brief; the security-escalation child ran for the first time and re-pinned a moved
guard. **Run 8 SHIPPED, the first in this project's history.**

Then an independent audit of that ship returned: ***"SHIPPED was earned against the specification it
was given, and not against the thing the specification stands for."*** All ten requirements passed
under execution and 15 of 15 mutations were killed — and the program silently discarded data at exit
`0`. Three defects it found in the loop are closed (0.55.0, 0.56.0, 0.57.0); the reviewer remit
change (0.58.0) is the answer to the fourth.

## Run 8: SHIPPED, for the first time in this project's history

```
SHIPPED: panel unanimous on 15 requirement(s)
iterations: 1  tokens: 8156885  cost: $8.0050  passing: 79
```

Every run before this one ended `BUDGET` or `STALLED`. This is the first `SHIPPED` the loop has
ever produced. Fifteen requirements is the ten `PRD-*` ids plus the five `DoD-*` ids, and it took
one iteration because it resumed csvstat2's tree, which already held 79 protected tests.

**The invariant that would have made this a serious bug held**: 2 security pins, **0 quarantined**,
14 requirement pins. It is not a ship over recorded lost protection.

It is the first run with all four of the run-6 fixes live — the architect receiving the gate
commands (0.52.0), an uncollected suite failing the iteration rather than resetting the ratchet
(0.51.0), gate failures reported even when the ratchet acts first (0.53.0), and a lesson unable to
invent a gate (0.54.0).

**Whether it deserved the tag is a separate question and is not settled by the tag.** `DOGFOOD.md`
case G says to check before believing it, and the party that chose the PRD and staged the scenario
is the wrong one to certify it — that is the satisficing pressure §1.1 exists to defeat. An
independent audit is running against the PRD and the binary, without the session's context, told to
assume the tag was not earned.

The precedent for taking that seriously is one scenario old: run 6's identical audit found all ten
requirements passing **and** a stray-quote path that silently swallowed the rest of the file and
exited 0, which the cold panel had not caught. *"Spec-complete rather than trustworthy."* **A
unanimous panel and a real defect have already coexisted here once.**

### The audit of that ship, by an agent with no stake in it

**Verdict, verbatim: *"SHIPPED was earned against the specification it was given, and not against
the thing the specification stands for."***

What held up, and it is not nothing:

- **All ten PRD requirements pass under independent execution**, every branch of the exit-code
  contract included.
- **The suite is not theatre.** The auditor applied **15 hand-picked mutations** to `parse`,
  `summarise`, `table`, `render`, `read`, `args` and `usage` — **15 of 15 were killed.**
- Every finding from the previous run's panel was genuinely repaired, not argued away.

**The defect that matters, and the class it belongs to:**

```
$ printf 'a,b\n1,"x\n2,y\n' > swallow.csv     # two data rows
$ node dist/bin.js swallow.csv                # count 1, mean 1
$ echo $?                                     # 0
```

An unterminated quote absorbs the rest of the file into one field. The field count still matches,
so exit 3 never fires. **A statistic over half the data, reported as success, empty stderr.** Two
more exit-0 wrong answers: a lone `\r` turns a 3×2 file into 4 columns and zero rows, and integers
past 2⁵³ collapse two distinct ids to one wrong value.

**No gate in this architecture can see that class.** Not a crash, not a wrong exit code — a
confident wrong number. The panel passed it.

### Three findings against the loop itself

1. **The panel's verdict was persisted nowhere.** *"I could not verify the unanimous-panel claim at
   all — the evidence for it is not in the repo."* Only an unannotated `meeseeks/GRAND-PRIZE` tag on a
   commit named "iteration 2". **Fixed at 0.55.0** (`.meeseeks/review.json`, annotated tag).
2. **`seenFailing: []`, and the mutation gate declined.** All 79 ids took ratchet credit without the
   loop watching one go red, and the compensating control did not run that iteration. **Both
   mechanisms that exist to prove a suite can fail were absent from the iteration that shipped.**
   Unfixed, and the strongest remaining argument that the tag means less than it looks like.
3. **A false security pin.** `DoD-2-security` cites `src/cli.ts:20` — `if (intent.kind ===
   'usage-error') {`, an argv branch, not a security control. §4.3 predicted this hazard in writing.
   The escalation path handles `moved`, `removed` and `unknown`; **there is no path for "this should
   never have been a pin"**, so under monotonicity it is permanent. Unfixed.

Smaller: `dist/` is gitignored, so the shipped commit contains **no runnable binary**; `state.json`'s
iteration counter carried over from the archived run; and two documented claims in
`docs/api-contract.md` are falsifiable by execution.

## Run 7: stopped early on purpose, after proving the fix worked

Same PRD as run 6, same ceilings, one variable changed — the architect now receives the resolved
gate commands (0.52.0). **Stopped by the operator mid-run to conserve usage**, so there is no
terminal state. It is resumable: `~/meeseeks-dogfood/csvstat2` keeps its `.meeseeks/`, its git history and
`~/meeseeks-logs/run7.log`, and `state.json` still holds the ratchet.

What it established before it was stopped is a controlled A/B, not an inference:

| | run 6 | run 7 |
|---|---|---|
| what the architect wrote into `CLAUDE.md` | *"Never add a dependency… not `vitest`."* | the gate command table verbatim, plus *"Test ids come only from this [command]… **Keep `vitest` in devDependencies**"* |
| `vitest` declared | never, in any commit | yes, and `"test": "vitest run"` |
| iteration 1 | wasted — `passing: 0` | ratchet advanced |
| at the point of comparison | 75 ids, one advance, then a 75-id reset | **79 ids, three advances** |

The architect also drew the distinction run 6's missed: *zero **runtime** dependencies*, with the
toolchain in devDependencies. That is the whole defect, inverted, by supplying one fragment the
design phase had never been given.

**`SHIPPED` is still unobserved.** It remains the one outcome this project has never produced, and
the three run-6 fixes exist to make it reachable. The next run of case G is the experiment; nothing
else is blocking it.

## Run 6: it built the thing, and then the loop destroyed 75 ids over a runner

Case G — a small, deliberately satisfiable CLI, six iterations, nothing impossible. Ended
`BUDGET: iteration limit reached: 6 of 6`, 45.6M tokens, $31.09, `passing: 75`. **Still no run has
ever reached `SHIPPED`**, and this one came closest by a distance.

Two independent agents were given the artifacts, neither with this session's context. One verified
the binary against the PRD by execution; one was handed a hypothesis about the cause and told to
refute it. **It did refute it, and the correction matters more than the confirmation.**

### The code was genuinely good, and the panel's attention was spent elsewhere

All ten PRD requirements **pass**, verified by running the binary: the exit-code contract, `empty`
counts, quoted commas, doubled quotes, embedded newlines, BOM stripping, physical line numbering.
The loop produced working software.

The verifier then found seven defects the PRD did not cover, one of them serious: a stray or
unterminated quote silently swallows the rest of the file into one field and **exits 0 with
confidently wrong statistics**. Its verdict — *"spec-complete rather than trustworthy"*.

**The panel did not find it.** It found a different genuine parsing bug (a file ending in two
newlines is rejected with exit 3), so it was not asleep. But **four of its eight findings were about
the mess our own gates created** — vitest invoked by `npx` but absent from the manifest, the
dependency guard "inverted rather than satisfied", `vitest.config.js` untracked so the coverage
thresholds sat outside version control. That is a new and worse cost for the unsatisfiable-gate
class: it does not only burn iterations, **it displaces hostile attention away from the product.**

### The causal chain, and the hypothesis that was wrong

The obvious reading — the security gate failed once vitest's dependencies appeared — is **false**.
`npm audit` exits 0 on that tree, the reviewer independently ran it at iteration 4 and reported *"0
vulnerabilities over 23 packages"*, and **vitest was never a dependency in any commit**; it was
always `npx --yes vitest`, structurally invisible to `npm audit`. What actually happened:

1. The plugin collects test ids **only** via `npx vitest run --reporter=json`.
2. **The architect was never told, and was told the opposite.** The design prompt was
   `architect.md` + the PRD; `templates/architect.md` promises *"the test gates you write into
   `CLAUDE.md` are the gates the run will actually execute"*. False for `unit`.
3. So the architect wrote `CLAUDE.md`: *"Never add a dependency… not `vitest`."*
4. The builder spotted the contradiction on **iteration 1** and predicted this exact failure in
   `assumptions.json`.
5. The panel objected that the executing dependency set was outside any auditable manifest, and
   suggested **adding** vitest. The builder took the other branch on `CLAUDE.md`'s authority and
   removed it.
6. The report came back **structurally empty** — `numTotalTests: 0`, "No test suite found in file".
7. **The ratchet cannot tell "collected nothing" from "everything failed".** Absent ≡ regressed, and
   regressions are checked first, so 75 ids "regressed" and the tree was hard-reset. Iteration 6's
   work is unrecoverable — `git fsck --lost-found` is empty.
8. **The operator was never told why.** The gate-failure report sits *after* the reset branch, so no
   `gates failed:` line printed at all. The log says regression; the cause was a runner.

Fixed in two halves. **0.51.0** gives the ratchet the collected-test count, so a report containing no
tests rejects the iteration instead of resetting the tree — while a report where tests really ran and
failed still resets, so §1.2 is kept rather than traded. **0.52.0** puts the resolved gate commands
into the architect's prompt and tells it not to write a project rule forbidding what they require,
which makes `architect.md`'s promise true and stops the contradiction being authored at all.

### The lesson store recorded something false

`lessons.json` came out of the wreck saying the `DoD-2-security` **gate** rejects any devDependency
and only passes once dependencies are removed. Every clause is wrong: it is a panel requirement not
a gate, the gate exits 0 on that tree, and the objection was that vitest was *missing* from the
manifest. It was stamped `resolved: 6` — crediting the iteration that was hard-reset for destroying
the ratchet.

**This is a third failure mode for F4, and worse than the generalities it was watching for.** A
generality is ignorable. A specific, well-formed, confidently wrong lesson is actionable, persistent,
and would be injected into future briefs. It was deleted from the scenario; a copy is kept as
evidence. What is not fixed is the mechanism: nothing checks a lesson against the run it came from,
and the extractor is the one child whose output nothing verifies.

## Run 5: case F passed, and the panel's findings converged 5 → 4 → 3

```
pinned security element DoD-2-security at src/http/router.js:266 did not re-verify; asking
security-escalation: claude-opus-5 running on 1272 characters of prompt
security-escalation: returned after 25s, 154671 tokens
pinned security element DoD-2-security moved to src/http/router.js:266; re-pinned
...
BUDGET: iteration limit reached: 3 of 3
iterations: 3  tokens: 37420203  cost: $32.6355  passing: 102
```

**A `security-escalation` child ran for the first time**, and A4's whole mechanism worked end to
end: the cheap re-verification failed, exactly one child was asked — a **1,272-character** prompt
scoped to that single element, 25 seconds, 154k tokens — it returned `moved`, and the pin re-pointed
without a reset. The stored snippet is now `const unmatched = new RouteNotFoundError(...)` with a new
fingerprint, `status: active`. It recognised the guard in a form it had never been shown.

`HANDOFF.md` used to say A4 rested on an assumption nobody had tested — that a reviewer's evidence
points at a line actually containing the guard. Run 3 answered the pinning half; run 5 answers the
escalation half. **Both are now measured.**

Also established here:

- **The ratchet advanced again, 98 → 102 ids**, across a run that reset nothing.
- **The panel converged: 5 findings, then 4, then 3.** No run had ever shown findings *decreasing*
  across iterations. The feedback loop demonstrably reduces them rather than churning.
- **0.45.0's assumptions bar held live.** One assumption in three iterations, and it is a real fork —
  whether "address these findings" means change the behaviour or confirm an already-documented
  limitation — with measurements cited. Compare run 3's *"Response headers not specified"*.
- **The builder documented unmet requirements honestly** rather than faking them: *"these stay as
  honestly-documented unmet requirements, the same treatment PRD-4.1's latency clause already
  receives"*. That is the anti-satisficing behaviour the design is for, in the builder's own words.
- **0.49.0 proved itself immediately.** The log lived at `~/meeseeks-logs/run5.log`, outside the tree, and
  survived complete with its terminal state — the thing run 4 lost.
- It did **not** ship, which is correct.

Cost: **$32.64** for three iterations, 37.4M tokens.

### The panel audited the operator, and was right

The best single piece of evidence this project has that the reviewer *verifies* rather than trusts,
and it caught the person running the experiment rather than the builder.

While staging case F, this session ran `git rm --cached run.log run4.log` and `git add -A` in one
command, then wrote a commit message saying the logs had been untracked. The panel's finding, twice:

> `run.log` and `run4.log` are tracked at HEAD (`git ls-files --error-unmatch run.log run4.log`
> succeeds) even though `.gitignore` lists `*.log`, and commit `e14bee6`'s message claims 'Also
> untracks run.log and run4.log' — **it did not.**

It **read the commit message, disbelieved it, and ran a command to check.** The cause is exactly what
it implies: `.gitignore` did not yet carry `*.log` at that moment — the driver appends that at run
start — so `git add -A` re-staged both files immediately. It also grepped the contents for
credentials before rating the finding `[trivial]`, which is the difference between a severity and a
guess. Fixed for real in `eac0185`.

**And it bears on §1.1.** The findings reference `git ls-files` and a commit message, never
`.meeseeks/briefs/` or the build log. So on this evidence the cold reviewer is working from the
repository, which is the intended surface — but note what the repository contains: commits titled
`meeseeks: iteration 1`. The reviewer can therefore infer an agent wrote the code. That is exactly the
*not supplied* rather than *sealed* distinction §6.1 draws, now with an observation behind it.

## Run 4: case E passed on every criterion. The ratchet reset a real run.

**The mechanism the whole design exists for has now run end to end, in a live run, and done the
right thing.** Not a fixture, not a hand-driven check — the driver did it.

What was staged: a return value broken from outside the run (`body: row.body` → `body: ''`),
committed, ceilings as run 3.

What actually happened is better than what was staged:

| criterion (`DOGFOOD.md` case E) | result |
|---|---|
| `bloopers.log` names the regressed id and a diff stat | **yes** — one record, iteration 2, with a 17-file diffstat |
| the run performs a hard reset to `lastGoodCommit` | **yes** — `reflog`: `reset: moving to 14f6c95` |
| the next brief's objective is the regression, *"Restore the tests listed below"* | **yes** — `iter-003.md`, verbatim, plus *"the ratchet is monotonic and 1 test(s) that passed earlier no longer pass, so the tree was reset to the last commit that held them"* |
| nothing else proceeds that iteration; no reviewer called | **yes** — `iter-003.md` has a `### Regressions` section and **no Audit findings section at all** |

**The regression it caught was not mine.** The builder repaired my injected one in 99 seconds during
iteration 1 — worth knowing, since Phase 2 builds before Phase 4 ratchets, so an injected regression
gets offered to the builder first. Then in iteration 2 the builder broke
`tests/pdf.unit.test.js::pdf fit algorithm > throws ExportCapacityError when titles are too wide for
the forced column count` **on its own**, while editing `src/pdf/render-titles.js`, and *that* is what
the ratchet caught. An organic regression is stronger evidence than an injected one.

**And the ratchet advanced inside a run for the first time: 93 → 98 ids.**

Also observed, each for the first time:

- **The reality-check breaker ran and was right.** `.meeseeks/reality-check.md`: *"**unbuildable** — but
  precisely one clause of one requirement is, and everything else is already built and green"*, with
  98/98 tests passing, having driven the real server over HTTP. It isolated `PRD-4.1` by measurement.
- **0.40.0 changed builder behaviour.** The blooper's diffstat shows `playwright.config.js | 10 -`
  — the builder **deleted** the browser scaffolding once `ci` stopped demanding it, and rewrote
  `ci.yml`. That is the oscillation ending.
- **0.44.0 held**: no `installed chromium` line anywhere in run 4.
- It did **not** ship (exit 1), which is correct.

### The defect that nearly hid all of this

`run4.log` ends mid-run with no terminal state, and the driver exited 1 having printed nothing after
the reviews. The log was not truncated by a crash — **the hard reset reverted it.** The operator's
`> run4.log` lived inside the repository because this project's own `DOGFOOD.md` said to, `git add -A`
tracked it, and the reset restored its content as of `lastGoodCommit`. The blooper's own diffstat
records the wound: `run4.log | 16 -` and `run.log | 50 -`.

Worse than losing 16 lines: git **replaces** the file rather than truncating it, so the shell's open
descriptor was left pointing at an unlinked inode and **every line written after the reset went
nowhere.** Iterations 2 and 3 produced no visible output at all, and run 4's terminal state is
unrecoverable — it had to be reconstructed from `.meeseeks/`, `git log` and the reflog.

Fixed at 0.49.0 by ignoring `*.log`, so the log is never tracked and the descriptor survives, and
`DOGFOOD.md` now says to keep the log outside the tree. The general rule is the one to remember:
**anything left in the working tree is subject to `git add -A` and to a hard reset.**

## Run 3 finished, and it found three gates the builder could not satisfy

```
BUDGET: iteration limit reached: 3 of 3
iterations: 3  tokens: 39555536  cost: $22.7225  passing: 93
```

**It did not ship, which is the correct outcome** — `PRD-4.1` is deliberately impossible, so
`SHIPPED` would have been the serious bug. The panel ran in iteration 1 and refused with five
findings, and the ratchet held 93 ids.

But the ratchet **never advanced past iteration 1**, and the reason is the finding of the session:

```
iteration 2 → gates failed: mutation, ci, gate-integrity
iteration 3 → gates failed: mutation
```

**All three of iteration 2's failures were defects in this plugin, and the builder could not have
fixed any of them.** Each is now fixed, each with the evidence in its commit message:

| gate | why it could not pass | fixed |
|---|---|---|
| `mutation` | Stryker resolves runner plugins relative to its own install; `npx` put that in the npx cache where `@stryker-mutator/vitest-runner` is invisible. Uncaught crash, **no project could ever pass** | 0.43.0 |
| `ci` | required a Playwright step on a project whose `e2e` gate had just been declined as inapplicable | 0.40.0 |
| `gate-integrity` | walked `.stryker-tmp`, the sandbox the crashed mutation gate left behind, and failed on 22 files that do not exist in the tree | 0.42.0 |

**The clearest single piece of evidence this project has produced.** Run 2's panel found the CI
e2e step was green by construction. Run 3's builder obeyed it and removed `continue-on-error: true`
— and then the `ci` gate failed for missing e2e, so iteration 3 put the step back as
`npx playwright test --pass-with-no-tests`, which on a project with no browser tests is *also*
green by construction. **The builder was oscillating between two of our own gates**, and neither
position could satisfy both. Verified in that repo's git history, not inferred.

Two more things it established: `.meeseeks/assumptions.json` reached `[2, 2, 4, 2, 2]` — four entries
labelled iteration 2 from two different runs (fixed 0.41.0) — and `installed chromium for the e2e
gate` appears in the log **on a project whose e2e gate does not apply**, which is the Playwright
provisioning seam §4.2 already flags as ungated, now observed rather than predicted.

**The next wall was `break: 100`, and it is now closed at 0.47.0 with `break: 60`.** It demanded a
*perfect* mutation score on every changed file. First measurement, only possible once the gate could
run at all: **83.33** on one two-branch function with two honest tests, failed by an
`EqualityOperator` survivor no correct suite need kill — an unsatisfiable gate, the same shape as the
three above. Both directions of the new floor are measured: the honest suite passes at 83.33, and a
suite asserting only `typeof x === 'number'` scores **16.67 and fails**, naming the threshold. See
`DESIGN.md` §4.4. If you move it, record what you measured.

## Two of today's fixes verified live, in the first thirty seconds of run 4

Both from `run4.log` and the tree beside it, on a real repository rather than a fixture:

```
added meeseeks machine state to .gitignore
archived the previous run to .meeseeks/runs/003
```

- **0.48.0's ignore repair fired.** That repository's stanza already contained
  `.meeseeks/state.json`, which is exactly the case the old all-or-nothing check reported as
  "covered" — so under the previous build nothing would have been appended and `pins.json` would
  have stayed trackable forever. `.gitignore` now carries `.meeseeks/pins.json` and
  `.meeseeks/assumptions.json`.
- **0.41.0's archiving fired.** `.meeseeks/runs/003/` holds `assumptions.json` beside `briefs/` and
  `run.json`, and the live `.meeseeks/assumptions.json` is **gone**, so this run's reviewers cannot be
  handed run 2's and run 3's assumptions. That was the defect: five entries, four of them labelled
  iteration 2, from two different runs.

## The ratchet caught a real regression, against a real 93-id state, for free

**The mechanism the whole design exists for has now fired on real data.** Not a temp repository
built by the test suite — run 3's actual `.meeseeks/state.json`, run 3's actual application, and a real
`vitest` run.

Method, and it cost nothing: back up one source file, change a **return value** (`body: row.body`
→ `body: ''`, which is what `DOGFOOD.md` asks for — regress the code, not the test), run the real
unit gate, and hand the real report to `extractTestIds` and `evaluateIteration`. No children were
spawned, so no money was spent.

```
ratchet holds: 93 | now passing: 96
REGRESSIONS  : 2
   ✗ tests/notes.contract.test.js::…PRD-1.2: Unicode and leading whitespace round-trip byte-for-byte
   ✗ tests/notes.contract.test.js::…PRD-1.2: reading a note by id returns exactly the title and body it was created with
action : reset
target : f20434d262e38c8a52b6b9d1693cfeffaf563fd3
reason : 2 tests that previously passed no longer pass. The ratchet is monotonic: nothing else
         proceeds until they are restored.
```

**The number that matters is 96 against 93.** Run 3's builder had added five tests, so *more tests
were passing than the ratchet had ever held* while two protected ones were broken. Any check
comparing counts, or comparing "did the suite get better", reports an improvement here. The set
difference is what caught it. That is precisely the failure monotonicity exists to prevent, and it
had never once been exercised against real data — every previous test of it used ids the test suite
had invented.

`formatRegressionTask` produced the literal objective (*"Restore these tests… Change nothing else.
Do not add features, do not refactor"*) and the blooper record named both ids and the iteration.

**Still unverified, and it is the part that needs money:** the driver's *orchestration* of this —
the actual `git reset --hard` to that target, `bloopers.log` being written to disk, the regression
brief reaching a live builder, and no reviewer being called that iteration. That is D2 case E, and
the repository is ready for it: the tree was restored **byte-identical** afterwards and its suite is
98 of 98 green, so the 93-id ratchet and `lastGoodCommit` are intact.

## Tier 3 ran for the first time, and found a template defect in eight tests

`MEESEEKS_LIVE=1 npm run test:live` had been written and never executed. First run: **7 of 8**, and the
failure was not the harness. Given a requirement stating its status code, its exact body, and the
words *"Nothing about this requirement is ambiguous"*, a live builder still emitted:

```
ambiguity: 'Response headers not specified'
assumed:   'Content-Type: application/json is required; no authentication required'
```

**The observation is true and recording it is still wrong.** `templates/builder-system.md` already
said "Emit no block at all if nothing was ambiguous", and that was not enough, because a detail the
document omits genuinely *is* unstated — the model was being accurate, not lazy. What was missing
was a bar: **would a competent engineer reading this text have chosen differently?** `404 or 410`
for an expired link is a fork; the Content-Type of a json body is not.

Fixed at 0.45.0 with that bar and both halves of the example, then **re-run live: 8 of 8**. The
half that proves it discriminates rather than mutes is the *other* live test, which requires an
assumption to be emitted for a genuine fork and still passes.

Why it matters beyond tidiness: this log is handed to the cold panel. A log of unstated-but-obvious
details buries the one entry that mattered, and §8.3's whole value is that a reviewer can check
"you assumed X, the PRD says Y".

## Two traps, both of which nearly cost this session

1. **The install cache is stale.** `installed_plugins.json` says **0.34.0**; the tree is 0.50.0.
   Anything run from the cache exercises code sixteen versions old — including before the
   red-evidence deadlock fix and all four of this session's gate fixes. Either `/plugin update` +
   `/reload-plugins`, or invoke `node <repo>/scripts/driver.mjs` directly as this session did.
   Check the pinned `gitCommitSha` before debugging anything.
2. **A green suite proves less than it looks.** Every defect this session found was invisible to
   1,378 passing tests, and each one was found by reading a real artifact: the failing brief named
   three gates, `.meeseeks/assumptions.json` explained *why* the builder faked a CI step, and the
   dogfood repo's git history showed it oscillating. Prefer looking at a produced artifact over
   adding an assertion.
3. **The dominant defect class in this codebase is a gate the builder cannot satisfy**, and it has
   now bitten six times: `e2e` failing a CLI forever, the red-evidence deadlock, `ci` demanding a
   browser, `gate-integrity` on another gate's debris, `mutation` unable to load its runner, and
   `break: 100` demanding a perfect score. **They do not look like failures — they look like a
   builder that will not comply.** When an iteration fails the same gate twice, check whether the
   objective is satisfiable *before* reading the builder's work.
4. **Do not edit `templates/*.md` while a run is in flight.** `builderSystemPrompt` reads the
   template from disk on **every child**, so a template edited mid-run reaches the next builder and
   the run stops being the experiment you started. `scripts/*.mjs` is safe by accident — Node loaded
   those at startup — which makes the hazard easy to miss, because the obvious-looking edit is the
   harmless one. Land template changes between runs.
5. **A structural test can match the wrong text and report coverage it does not have.** This
   session wrote one that passed with the very call site it guarded reverted, because the source
   line contained the word it grepped for in a different call. Verify such a test by breaking the
   thing it protects and watching it fail.

## What is outstanding

`BRIEF.md` statuses are the resume point and are current. Nothing in Tier 1 or Tier 2 remains.

| item | state |
|---|---|
| ~~**D2 case E — deliberate regression**~~ | **PASSED in run 4, on every criterion.** Reset performed, blooper written, regression brief issued, no reviewer called. The regression it caught was the builder's own, not the injected one |
| ~~D2 case F — security regression~~ | **PASSED in run 5.** The escalation child ran for the first time, returned `moved`, and the pin re-pointed with no reset |
| D2 cases A, B, C | prepared in `DOGFOOD.md`, not run. Note the whole D2 set now has two passes behind it, so these are breadth rather than risk |
| `removed` / `unknown` pin verdicts | **still unobserved, and need a different PRD** — one whose security element is off the tested path, since a load-bearing guard regresses before Phase 4b is reached. `DOGFOOD.md` case F |
| A8 carry optimisation | **do not start without reading the pin finding below.** `PRD-3.1` is pinned to a *test file*, which the carry would let a source regression slip through |
| A3 held-out oracle | deferred behind D2 and B2's driver-owned test invocation |
| C5 differentiated race candidates | cheap, but ordered behind a live test of a `claude -p` child in a race worktree |
| architect toolchain declaration | **residual of B3, half closed at 0.46.0.** The ambiguity is no longer silent: a tree matching both reports `also matched dotnet (…) - first match wins`. The declaration itself is still the real fix, and an operator could not ask for it while the ambiguity was invisible |
| ~~mutation provisioning~~ | **closed at 0.43.0, and it was worse than A5 recorded.** Installing the runner locally would not have helped — Stryker looks beside its own install, not the project's. Both packages now go into one npx sandbox |
| ~~`break: 100` mutation threshold~~ | **decided and closed at 0.47.0: `break: 60`.** Both directions measured — an honest suite scores 83.33 and passes, a suite asserting only `typeof x === 'number'` scores 16.67 and fails. `DESIGN.md` §4.4 |
| ~~Playwright provisioning not capability-gated~~ | **closed at 0.44.0.** `installed chromium for the e2e gate` had been logged one line after `gate e2e does not apply`. `ensurePlaywrightBrowsers` now declines when the gate does not apply; omitting capabilities still provisions, since under-provisioning fails a gate that *does* apply |
| ~~`assumptions.json` run attribution~~ | **closed by 0.41.0's archiving, and this row was stale.** The file is in `PER_RUN_ARTIFACTS`, so a new run moves the previous one's to `.meeseeks/runs/NNN/` before writing its own — the cross-run collision cannot occur. Verified against run 10's log, whose entries are `1, 1, 4, 5, 6`, all from one run. The *within-run* duplicate (two entries at iteration 1) is a builder emitting two cited assumptions in one child, which is correct behaviour |
| `gate-integrity` vs a vacuous branch | **confirmed by probe, and deliberately not fixed.** It passes both the `continue`-past-the-assertion shape and `test('asserts nothing', …)`. The first is the coverage question and belongs to the mutation gate; the second is detectable but would fail legitimate `does not throw` and helper-based suites. `DESIGN.md` §4 |
| lesson extractor is unverified | **partly closed at 0.54.0.** A lesson can no longer invent a gate — run 6's falsehood is now discarded by name. Claims about the *watched project* are still unverified, which is the half that remains |
| **nothing verified the suite that shipped** | **top of the list.** `seenFailing: []` and the mutation gate declined on the shipping iteration, so neither mechanism that proves a suite can fail was present. Should `SHIPPED` require at least one of them? |
| **a pin that should never have existed** | `DoD-2-security` pinned an argv branch. Escalation handles moved/removed/unknown; there is no retraction path, so under monotonicity it is permanent |
| reviewer remit for silent wrong answers | **operator decision.** D1 discards data at exit 0 and no gate can see that class. Widening the panel's remit changes what done means |
| ~~A9's tier-3 check~~ | **run for the first time, and it earned itself immediately.** 8 tests; on the first execution 7 passed and one found a real template defect (below). Fixed at 0.45.0, re-run live, 8 of 8 |

## A finding about the generated app, not about the plugin

Run 3's panel found a real bug in the dogfood application: `toRenderableText` substitutes `?` for
any character outside cp1252, so non-Latin note titles vanish from the PDF export — and the
builder's own fixture says `'漢字' is deliberately excluded`. That belongs to
`~/meeseeks-dogfood/rejection`, not here. It is recorded because it is the best evidence this project
has that the cold reviewer catches satisficing.

---

# Verification status

The build is finished, and the architecture iteration this file used to list as deferred is
now implemented — reviewer ownership, the Build Brief, lesson memory, advisory findings,
behavioural gates, conditional history and stalled-only racing. See `DESIGN.md` for why each
one is shaped the way it is.

What follows is the one thing the test suite cannot settle: whether the pieces work against
reality.

---

## The ratchet advanced, and the panel refused to ship — 11 August 2026, run 3

**Everything the design exists for worked, in one run, for the first time.**

```
ratchet: 93 ids, iteration 1
review outstanding: 5 finding(s)
```

- **The ratchet advanced.** 93 test ids protected. It had never once advanced in a real run.
- **The cold panel ran** — all three reviewers, ~200s and 0.6–1.2M tokens each.
- **It refused to ship**, with five findings, and the findings were fed back: the next brief grew
  from 16,022 to 31,562 characters.

**It caught the impossible requirement by measuring it, not by reading the docs.** On `PRD-4.1`
(sub-millisecond HTTP on a cold process) it opened raw `node:net` sockets against three freshly
spawned processes and reported **7.596 / 7.321 / 7.946 ms**, then wrote: *"No faking was found …
Honest reporting does not convert an unmet requirement into a met one."*

**And it found a real defect nobody else had.** On `PRD-2.1` it created notes titled `漢字ノート`
and `emoji 🚀 title`, called the export endpoint, extracted page text with `pdfjs-dist`, and got
`"Notes (3)  ????? emoji ? title Plain title"` — two of three titles absent, because
`toRenderableText` substitutes `?` for anything outside cp1252. Then the part that matters most:
it noticed `tests/export.contract.test.js` says `'漢字' is deliberately excluded`. **The builder
hand-picked its fixture around its own bug, and the cold reviewer caught it.** That is the exact
satisficing this architecture was built to defeat, observed rather than theorised.

It also found a gate that could not fail — `npx --yes playwright test` under
`continue-on-error: true`, *"a step that always reports success by construction"* — design docs
contradicting each other and the shipped router on the endpoint surface, and one **major**
advisory: unpinned remote code execution in CI, outside the `npm ci` dependency tree and the
`npm audit` result, in a job holding the repository checkout and workflow token.

Nothing about the reviewer prompt was changed for this. §1.1's bet — that a cold, hostile,
separate-process auditor with no build log outperforms the builder's own judgement — is now
**measured**.

## Five more findings, read out of run 3's `.meeseeks/` while it was still running

Free. No spend, nothing in that repository touched — `cat` on the machine state while iteration 2's
builder was mid-flight. Three of the five close questions this file has carried for days.

### The `ci` gate demanded a browser step from a browserless project (fixed 0.40.0)

`toolchain.ci` (`scripts/toolchains/node.mjs`) required `/\bplaywright\b/` **unconditionally**, so
on this `api, persistent-storage` project the loop declined the `e2e` gate with its full written
reason, printed it to the operator, and then failed the `ci` gate for not running that same step.
Run 2's log shows it: `gates failed: quality:semgrep, ci, observability`. **No honest workflow
could satisfy it.**

The builder did not stall. It complied, and wrote down why — `.meeseeks/assumptions.json`:

> *"the brief's own `e2e` gate says a CLI/library/API project has no applicable e2e … yet the `ci`
> gate wants the workflow to run an e2e step regardless"* → *"added an `e2e` step to ci.yml running
> `npx playwright test` … marked `continue-on-error: true`"*

Run 3's cold panel then reported that step as **"a step that always reports success by
construction"**. The loop manufactured the defect it caught, and every component behaved as
designed while doing it. This is the `e2e`-fails-a-CLI-forever bug from item 5, surviving one level
down because that fix filtered the gate *table* and not the CI *command list*.

Fixed by filtering the required operations through the same `gateApplies` table, with the dropped
requirement named in the gate detail. `DESIGN.md` §4.2. Nine tests. Two notes:

- **Omitting `capabilities` filters nothing.** A caller that forgets over-applies CI rather than
  silently dropping a required step — and `[]` is a different statement from `undefined`, so both
  are asserted.
- **The first structural test was a fraud and is worth the warning.** The wiring is unreachable
  from a unit test (`gateTree` is inside `main`; `driveRun` takes `gates` injected), so a grep test
  guards the call site. Version one asserted the *source line* contained `capabilities` — and
  passed with the call site reverted, because `applicableGates(staticGates(dir, { run: shell }),
  capabilities)` still contains the word. It now balances parentheses to isolate the call's own
  arguments, and was verified by reverting the call site and watching it fail. **A structural test
  matching the wrong text reports coverage it does not have.**

### A4's foundation holds — a live reviewer produced a real pin

This file said no pin had ever been created by a real reviewer, and that A4 silently protects
nothing if evidence lands on blank lines. `.meeseeks/pins.json`:

```
"id": "DoD-2-security", "evidence": "src/http/router.js:266",
"snippet": "throw new RouteNotFoundError(`no route for ${method} ${path}`);"
```

Real executable code, fingerprinted — not a signature, not a blank line. **Weak but not wrong**,
exactly the outcome predicted. And **Case F's precondition is satisfied for the first time**:
`pins.json` is non-empty, so the security-regression scenario is now runnable.

### F4 holds — `lessons.json` filled with a condition, not a generality

The standing instruction was to read it after a real run and **delete it if it had filled with
generalities**. It has not. One lesson, `uses: 1`, `introduced: 1, resolved: 3`, triggers
`console.log`, `json.stringify`, `logger.js`, `observability`, `structured logging` — concrete
tokens that appear in the failure it came from. That instruction does not need executing.

### A8 is now blocked on a hazard, not only on ordering

`PRD-3.1`'s requirement pin is evidenced by **a test file**: `tests/perf.test.js:49`. Requirement
fingerprints cover the whole evidenced file, so the source that satisfies the requirement can
regress while `tests/perf.test.js` sits untouched, the fingerprint holds, and the requirement is
not re-litigated. Harmless today because A8's carry half is unbuilt — the fail-closed half only
fires when the target stops resolving. **Decide the test-file-evidence case before building the
carry.**

> **Reconciled 13 August 2026 — and this paragraph was the most valuable thing in the sweep.**
> The carry was built at 0.92.0 **without** this decision being made, which armed exactly the
> hazard described here. Found by item 22's sweep of this file and fixed in the same commit:
> `isTestEvidence` in `driver.mjs` refuses to carry any requirement whose evidence names a test
> file. Such a requirement is still pinned, still invalidated, still fail-closed — only the
> saving is withheld. The pattern is deliberately broad, because refusing to carry costs one
> re-review while wrongly carrying hides a source regression for the rest of the run.

Second reason to doubt the saving: three of five requirement pins cite `src/http/router.js`, the
busiest file in the tree, and all three therefore share one fingerprint. On this project the carry
would invalidate almost every iteration and save nearly nothing.

### `.meeseeks/assumptions.json` cannot say which run an entry came from (unfixed)

It is carried across runs but keyed by `iteration`, and iteration numbering restarts every run. It
currently holds run 2's `iteration: 2` and `iteration: 4` entries, and run 3's `iteration: 2` will
land beside them indistinguishably. **Same defect shape as the brief collision C2 fixed**, in a
file C2's carried-forward list never covered. Left alone deliberately — it is its own slice.

One more thing that file records, worth checking: iteration 4's entry is the builder discovering
that `tests/boundary.test.js`'s import-edges test *"could never fail regardless of its imports"*
for leaf files, and adding a real assertion so red-evidence was satisfiable. `gate-integrity` bans
weak matchers; whether it can catch an assertion-free branch is **unverified**.

## Verified live

**Guard hook fires under a real PreToolUse event.** With the plugin installed, a command
writing to the ratchet state file was denied and tagged `[meeseeks:protected-state]`, while a
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
`MEESEEKS_RUNNING=1` fired a hook that read `MEESEEKS_RUNNING: "1"` from `process.env`. This is what
lets the guard tell a run from an operator, so it was measured rather than assumed.

**The guard denies live, unscripted commands.** Not fixtures: during this session it refused
a recursive `rm` whose target was an unresolved shell variable, and refused a command
touching `.meeseeks/config.json` from inside a run.

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

> **Reconciled 13 August 2026 (stratigraphy sweep).** This section predates run 4. **A run has
> reached the panel and the ratchet has caught a real regression** — case E passed at run 4 on a
> real 93-id state, and run 8 shipped. What is still true from it: no builder child has ever run
> inside a race worktree. Read the top of this file for current state; read this for the shape of
> the questions, which is still the best statement of them.

**A run that reaches the panel, and a ratchet that catches a real regression.** The first
real runs died before either. Both stopped in iteration 1 with `passing: 0`, so no id ever
entered the ratchet, no reset was ever reachable, and the reviewers were never called. The
regression behaviour is the reason the whole design exists and it has still only ever been
exercised against temporary repositories built by the test suite. With the runner mismatch
fixed, this is the next thing a run should be able to demonstrate — give it enough budget to
reach a second iteration.

> **Reconciled 13 August 2026: still true, and now repriced rather than merely accepted.** The
> heartbeat is one of three symptoms `BORROWED.md` R21 shows to be the same synchronous-driver
> fact; `PLAN.md` item 10 is that conversion and is **blocked on item 8**, which decides whether
> the parallel-panel third of it is worth anything.

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

Specified on 11 August 2026. The `.meeseeks/**` integrity item from the same plan was implemented
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
  to spend. Run `MEESEEKS_LIVE=1 npm run test:live` first — a few cents against a four-hour run, and
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
  and the `.meeseeks/playwright-installed` marker, both of which are Node-specific and neither of
  which passes through the toolchain. A second toolchain with a different e2e runner will find
  it, and it belongs behind an operation on the adapter.

  **It was not harmless, and the note above said it was.** "Provisioning is a no-op until there is
  a config to provision for" is true and was the wrong question: run 3 logged `installed chromium
  for the e2e gate` one line after `gate e2e does not apply`, because a config existed for a reason
  unrelated to any browser — the `ci` gate was demanding a Playwright step from a browserless
  project. Capability-gated at 0.44.0. The Node-specificity is what remains.

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
   - **`commandGates` now takes `(root, meeseeksDir)`.** It needed the root to resolve a toolchain,
     and deriving it as `dirname(meeseeksDir)` would have been true today and quietly wrong later.
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
     exactly as predicted — `guard.test.mjs` had already listed `.meeseeks/run.json` as a
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
   forever — so the scenario set need not all be web. And `.meeseeks/run.json` (item 7) means each
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
| `.meeseeks/run.json` (§7.1) | written complete — plugin `0.34.0`, real tool versions, **no `"unknown"` anywhere** |
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
gated are recorded once in `.meeseeks/red-evidence.json` and admitted, the gate *reports how many*
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
| **C2 archiving** | `archived the previous run to .meeseeks/runs/001`, containing `briefs` and `run.json` |
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
`gate-integrity`'s assertion check and the mutation pass cover the shape.

**Implemented at 0.39.0.** `redEvidenceGate` reports and no longer blocks; a new `unprovenIds`
withholds those ids from the passing set `gateTree` returns, so they earn no ratchet protection.
Verified on the real 83 ids plus one added later: **83 of 84 credited**, the new one withheld and
named, and the gate does not block. Four tests changed from asserting the old blocking behaviour
to asserting the withholding, and one new test asserts red-evidence **never** blocks whatever it
finds — the deadlock in a single line.

**Not verified:** no run has yet advanced the ratchet. The change makes it possible; only a run
proves it. That is the next thing to do, and for the first time the path to the panel is clear
on paper: iteration 1 credits its baseline, the ratchet advances, later iterations proceed with
new tests uncredited but unblocking.

## What the run did NOT establish

**Case D's actual question is still unanswered.** The run died in iteration 1 on budget, so the
gates never ran, the ratchet never advanced (`passing: 0`), and **the cold panel was never
called**. Whether review is genuinely fail-closed against a stubbed `PRD-2.1` remains exactly as
unproven as it was on 10 August — for a new reason, but unproven.

Still never observed: any gate executing, any test id entering the ratchet, a hard reset, a
reviewer verdict, a pin, an assumptions block, the mutation gate, `.meeseeks/runs/NNN/` archiving.

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
builder template each assert that no `` `.meeseeks/<name>.json` `` literal appears at all, so
re-introducing an enumeration fails the suite rather than merely reading oddly; and one test
pairs the rendered brief against `isProtectedStatePath` from the hook itself, showing that
`.meeseeks/red-evidence.json` is named nowhere in the wording and denied anyway. That is the tie
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
the whole of what keeps `.meeseeks` readable — the reading half is enforced by the hook never firing,
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
`.meeseeks/briefs/iter-003.md` can open it; nothing stops it. That is now labelled *not supplied*,
with the note that the framing is what does the work.

**Not verified.** Nobody has checked whether a cold reviewer ever *does* read `.meeseeks/briefs/`.
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

## A6 — truthiness-only assertions fail a gate meeseeks runs (0.21.0)

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
unchanged and still the right one — **read `.meeseeks/lessons.json` after the first real run, and
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
`state.json`. So every run wrote `.meeseeks/briefs/iter-001.md` over the last run's, then
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
before `ensureMeeseeksIgnored`'s successor lines) is covered only by the unit tests of the function
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

> **Reconciled 13 August 2026: the carry landed at 0.92.0**, as a pre-filter that never reaches a
> ship decision — a narrowed panel returning `pass` triggers the full panel. The DoD line below is
> now met for source-evidenced requirements and deliberately **not** for test-evidenced ones.
> The *measured* review-cost delta is still owed and is parked with `DOGFOOD.md`'s item 8.

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
driver-level tests carry it end to end — a cited assumption reaches `.meeseeks/assumptions.json`, an
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
MEESEEKS_LIVE=1 npm run test:live
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
driver now writes `.meeseeks/stryker.config.json` and passes it positionally; §6 keeps it out of
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
lessons worth reading is a judgement only a long run can settle. Read `.meeseeks/lessons.json`
after the first real run and delete it if it has filled with generalities — retrieval is
designed so that an empty store costs nothing.

## Decisions

All recorded in `DESIGN.md` §14, alongside the one question deliberately left open: whether
to add a backend or security quality plugin beside impeccable, which only inspects user
interfaces.

When adding a phase, note that `PHASE_PERMISSIONS` in `scripts/driver.mjs` throws for an
undeclared phase rather than defaulting. Only `builder` runs in dangerous mode.
