# Dogfood runs — case D performed 11 August 2026; the rest prepared

`BRIEF.md` D2 and `HANDOFF.md` item 9.

> **Case D was run on 11 August 2026 and ended `BUDGET` in iteration 1.** It found three
> defects — the token ceiling not counting Phase 0 or Phase 1, a single builder child spending
> 10× the ceiling, and a duplicate heading in the toolchain guidance. **It did not answer case
> D's own question**, because the panel was never reached. Full record in `HANDOFF.md`. Fix the
> budget accounting before running anything else here, or every scenario will die the same way.

> **Run 2 and run 3 followed**, from the working tree rather than the install cache — the cache
> lags whenever the plugin has not been re-installed, and running it would exercise old code.
> Run 2 found the red-evidence deadlock (fixed at 0.39.0). Run 3 was launched immediately after
> that fix to see whether the ratchet finally advances.
>
> **Reading run 3's result**, in `~/dare-dogfood/rejection`:
>
> ```bash
> tail -30 run.log                     # terminal state and the closing tally
> cat .dare/state.json                 # passing[] non-empty means THE RATCHET ADVANCED - a first
> grep -c '"' .dare/red-evidence.json  # baseline vs seenFailing
> ls .dare/runs/                       # 001, 002 ... archiving working
> grep 'review outstanding\|panel unanimous\|cannot ship' run.log
> ```
>
> `PRD-4.1` — sub-millisecond HTTP on a cold process — **cannot be satisfied**. So a correct run
> either has the panel fail that id, or the reality-check breaker declare the PRD unbuildable.
> **`SHIPPED` would be the serious bug**: it would mean the panel passed an impossible
> requirement.

> **Run 4 executed case E and it passed on every criterion.** See `HANDOFF.md`. One instruction in
> this file was wrong and cost the run's terminal state:
>
> **Never redirect the run's log into the repository.** The driver commits with `git add -A`, so a
> log inside the tree becomes tracked, and a hard reset reverts it — destroying the record of the
> reset itself. Worse, git *replaces* the file rather than truncating it, so the shell's open
> descriptor is left on an unlinked inode and **every line written after the reset goes nowhere.**
> Run 4's outcome had to be reconstructed from `.dare/` and the reflog.
>
> ```bash
> # right: the log lives outside the tree
> mkdir -p ~/dare-logs
> node <plugin>/scripts/driver.mjs PRD.md --yes > ~/dare-logs/run5.log 2>&1
> ```
>
> `*.log` is ignored from 0.49.0, which fixes it for new runs. The general rule stands anyway:
> **anything you leave in the working tree is subject to `git add -A` and to a hard reset.**

**Cases D, E, F and G have now all been run**, on 11 and 12 August 2026. This file was written so
that an operator with an hour and a budget can execute it without re-deriving anything, which is
what the brief asks for when Claude usage cannot be consumed: *"prepare reproducible dogfood
scripts and document exact commands, expected states and evidence to collect. Do not claim
end-to-end validation occurred unless it did."*

| case | state |
|---|---|
| **D** — deliberate rejection | runs 1–3. Correctly refused to ship; found the three unsatisfiable gates |
| **E** — deliberate regression | **run 4, passed on every criterion.** Reset performed, blooper written, regression brief issued, no reviewer called |
| **F** — security regression | **run 5, passed.** First `security-escalation` child; returned `moved`, pin re-pointed, no reset |
| **G** — the smallest thing that could ship | runs 6–8. **Run 8 `SHIPPED`, the first in this project's history** — then an independent audit found the shipped binary discards data at exit 0 |
| **A, B, C** | **still unrun.** Breadth rather than risk, now that D–G have four outcomes behind them |

Full records for every one of them are in `HANDOFF.md`. Read the run-8 audit before treating
`SHIPPED` as settled: a unanimous panel and a real defect have already coexisted here twice.

---

## Why this matters more than the rest of the brief

The ratchet, RED evidence and fail-closed review are the reason this design exists, and **none
of them has ever met reality.** Both real runs, on 10 August 2026, died in iteration 1 with
`passing: 0` — so no id ever entered the ratchet, no reset was ever reachable, and the reviewer
panel was never called.

Cases **D and E are worth more than everything else here combined**, because they are the only
ones that exercise a rejection and a regression. A and B exist to get a run far enough that D
and E are reachable at all.

Since 0.31.0 there is more to watch than there was, and most of it has never been observed
outside a unit test:

| what to watch | first appeared | state as of 12 August 2026 |
|---|---|---|
| **the ship condition itself** | 0.56.0–0.58.0 | **exercised, runs 9 and 10.** 0.56.0 is satisfiable but cost a wasted iteration; 0.58.0's widened remit worked and had nowhere to land until `DoD-6` (0.60.0) gave it one. 0.57.0's retraction is still unobserved |
| prompt size climbing across iterations | 0.20.0 | observed climbing — run 3's brief grew 16,022 → 31,562 characters after findings were fed back. The 400,000-character ceiling has still never been reached, so it remains reasoned rather than measured |
| `.dare/pins.json` filling | 0.29.0 | **proven, runs 3, 5 and 10.** `moved` (run 5) re-pinned with no reset; `removed` (run 10) issued a regression objective and the element was restored. **`unknown` — and therefore quarantine — remains unobserved:** case H |
| `.dare/assumptions.json` filling | 0.30.0 | **proven from run 3 onward.** The citation bar at 0.45.0 was set by a live tier-3 failure, not by reasoning |
| the mutation gate | 0.31.0 | provisioning closed at 0.43.0, threshold `break: 60` at 0.47.0 — **and it was still crashing rather than running until 0.65.0.** Stryker's tsconfig preprocessor imports `typescript` from its own npx install, where it is absent; run 10 lost three of six iterations to it |
| `.dare/runs/NNN/` archiving | 0.28.0 | **fired live in run 4** — `.dare/runs/003/`, carrying `assumptions.json` beside `briefs/` and `run.json` |
| the .NET toolchain | 0.32.0 | commands verified against a real SDK; **never driven by a run**, and no SDK on this machine |
| the TRX reporter | 0.33.0 | only ever seen xunit output from a scaffolded solution |
| per-toolchain guidance | 0.34.0 | proven selected and archived; never proven *read* |
| a race with a live builder | 0.13.0 | **never once executed.** `race.enabled` is `false`; only the git half is tier-2 tested. Case I |

---

## Before any run

```bash
node --version          # must be >= 22.12
claude --version        # records which CLI the run was against
git --version
```

Install the plugin **at the version under test**, and check the pin, because the install cache
is keyed by version and a stale copy is indistinguishable from a wrong fix — this cost hours
once already (`CLAUDE.md`, "Releasing"):

```bash
grep '"version"' .claude-plugin/plugin.json
grep -A2 dare-to-be-stupid ~/.claude/plugins/installed_plugins.json   # check gitCommitSha
```

Each scenario gets its **own throwaway repository**. Never point `/dare` at anything you would
mind losing: the ratchet runs `git reset --hard`.

```bash
scenario() {                      # usage: scenario link-shortener
  local name="$1"
  local dir="$HOME/dare-dogfood/$name"
  mkdir -p "$dir" && cd "$dir" || return 1
  git init --quiet
  git config user.email dogfood@example.invalid
  git config user.name 'Dare Dogfood'
  git commit --quiet --allow-empty -m 'empty start'
  echo "$dir"
}
```

**Give every scenario enough budget to reach a second iteration.** Both earlier attempts died in
the first one, so a run that stops at iteration 1 tells you nothing you do not already know.
After `dare init` scaffolds `.dare/config.json`, edit it *before* starting the run — the guard
hook allows an operator to edit it from outside a run, and refuses a run's own children:

```json
{ "maxIterations": 6, "stallLimit": 4, "tokenCeiling": 6000000, "chaos": 1 }
```

---

## Case A — Node web/API

```bash
scenario link-shortener
/dare "A simple link shortener with an admin analytics page."
```

**Expected terminal state:** `SHIPPED`, `STALLED` or `BUDGET`. Any of the three is a result. What
would be a *defect* is `ABORTED` from preflight, or a second run of iteration 1 with `passing: 0`.

**Collect, whatever happens:**

```bash
cat .dare/run.json                      # what this run was
cat .dare/state.json                    # did any id ever enter the ratchet?
ls .dare/briefs/                        # one per iteration
cat .dare/pins.json 2>/dev/null         # did the security reviewer's evidence produce a pin?
cat .dare/assumptions.json 2>/dev/null  # did the builder emit the block?
cat .dare/lessons.json 2>/dev/null      # generalities, or conditions?
cat .dare/bloopers.log 2>/dev/null      # every hard reset
```

and from the run's own output, every line matching `characters of prompt` — that is the C4
measurement, one per child.

**The one number to write down:** the prompt size on iteration 1 versus the last iteration. That
is the only evidence that exists for or against the 400,000-character default, and nothing has
ever reported it.

## Case B — Node with persistence

```bash
scenario task-spa
/dare "A small task management SPA with local or database persistence."
```

Same evidence. The extra thing to check is that `.dare/capabilities.json` resolved
`persistent-storage`, and that the gate list in the Build Brief reflects it.

## Case C — .NET

**No longer blocked on tooling.** `dotnet 8.0.423` is installed and
`scripts/toolchains/dotnet.mjs` exists as of 0.32.0, with the TRX reporter at 0.33.0. It is
refused here for the same reason as every other case on this page — it spends money and wants
an operator awake — and for nothing else.

```bash
scenario dotnet-api
/dare "A small HTTP service that stores and returns short notes, in C#."
```

**This is the highest-information run on the page**, because more of it is untested than
anything else. Watch four things specifically:

- **Does the toolchain resolve to `dotnet` at all?** The run prints
  `toolchain: <name> (<evidence>)`. On iteration 1 a greenfield repository has neither a
  `package.json` nor a `.csproj`, so detection is honestly empty and **falls back to node** —
  which means the first iteration may be gated with npm commands against a .NET project. This
  is the known ambiguity recorded in `BRIEF.md` B3 and `toolchains/index.mjs`. If it derails
  the run, the fix is architect declaration confirmed by detection, which is not built.
- **Does `.dare/unit.trx` appear, and does the ratchet read it?** `Toolchain.reports` was added
  precisely so it would. If `passing: 0` persists while `dotnet test` reports passing tests,
  the report is being written and not read — check the filename first.
- **What does a real TRX from a generated project look like?** The reporter has only ever seen
  xunit output from a scaffolded solution. MSTest and NUnit populate `UnitTestResult`
  differently, and `[Theory]` names carry entities. **Keep the file** — if the reporter throws,
  that TRX is the most valuable artifact the run produced and belongs in
  `test/fixtures/reporters/` with its provenance.
- **Does `dotnet format` fail the lint gate on generated code?** It fails on whitespace the
  compiler accepts, and exits 2. A builder that writes correct but unformatted C# will fail
  lint every iteration until it learns, which is what the guidance fragment is for.

## Case D — deliberate rejection

The point is a run that **must not ship**, so the PRD carries a requirement the builder cannot
satisfy while the rest is easy.

```bash
scenario rejection
cat > PRD.md <<'PRD'
# Note taker

## Problem
Someone needs to keep short notes and find them again.

## Users
One person, on their own machine.

## Out of scope
Sharing, sync, authentication beyond a single local user.

## Requirements

### 1. Notes
PRD-1.1  Creating a note with a title and body returns its id.
PRD-1.2  Requesting a note by id returns exactly the title and body it was created with.
PRD-1.3  Requesting an id that does not exist returns 404 and no body.

### 2. Export
PRD-2.1  GET /export/notes.pdf returns a PDF whose first page shows every note's title,
         rendered as text and not as an image, with the file size under 200 kB.
PRD
git add PRD.md && git commit --quiet -m 'PRD'
/dare PRD.md
```

**PRD-2.1 is the trap** — an observable requirement that is genuinely hard, so the builder is
likely to stub it.

**What success looks like: the run does NOT ship.** Specifically:

- the panel returns `verdict: fail` with an entry for `PRD-2.1` carrying `status: fail`
- the terminal state is `STALLED` or `BUDGET`, never `SHIPPED`
- `combinePanel` reports an entry for **every** required id, not only the failing one

**What would be a serious defect:** `SHIPPED`. That means either the reviewer accepted a stub, or
an id passed by never being judged. Keep the whole `.dare/` directory if this happens — it is the
most important artifact this project could produce.

## Case E — deliberate regression  ← DO THIS NEXT

**Newly reachable.** Run 3 advanced the ratchet to 93 ids at iteration 1, which is the
precondition this scenario always needed and never had. Every earlier run ended `passing: 0`.



The ratchet is the reason the design exists and it has never fired on a real run.

Run Case A or D first until at least one iteration advances the ratchet — `.dare/state.json`
must show a non-empty `passing` array and a non-null `lastGoodCommit`. Then, **from outside the
run** (the guard denies a run's children, not you), break a test the ratchet holds:

```bash
cat .dare/state.json          # note a passing id and lastGoodCommit
# edit the source so that one previously passing test now fails - change a return value,
# not the test itself. The ratchet must catch the code regressing, not the test disappearing.
git add -A && git commit -m 'deliberate regression'
/dare PRD.md                  # resume; state.json is carried forward across runs
```

**What success looks like:**

- `.dare/bloopers.log` gains a record naming the regressed id and a diff stat
- the run performs `git reset --hard` back to `lastGoodCommit`
- the next Build Brief's objective is `regression`, headed *"Restore the tests listed below"*
- nothing else proceeds that iteration — no reviewer is called

**Also check `.dare/runs/001/`.** This is the first real test of C2 archiving: the second `/dare`
should have moved the first run's `run.json`, `briefs/` and `reality-check.md` there rather than
overwriting them.

## Case G — the smallest thing that could ship

**The outcome this project has never once observed is `SHIPPED`.** Every run in its history has
ended `BUDGET` or `STALLED`. Cases A and B cannot settle it quickly: they hand over a broad idea
("a link shortener with an admin analytics page"), and a broad idea takes more iterations to
converge than a budget usually allows. The rejection scenario cannot settle it at all — `PRD-4.1`
is impossible on purpose.

So this case optimises for reaching the end of the pipeline rather than for breadth:

- **A CLI, not a service.** `observability` then does not apply (§4.2), which removes a gate that a
  tool with no port cannot satisfy. Capability gating is what makes this shape finishable at all.
- **A written PRD, not an idea.** Ten small requirements with observable outcomes and explicit exit
  codes. Nothing that needs a browser, a database, a network or a clock.
- **Nothing impossible.** Every requirement is satisfiable with the Node standard library. If this
  does not ship, the reason is the loop, not the specification.
- **Six iterations.** Both earlier scenarios ran out of iterations while still improving; run 5's
  panel findings were still falling (5 → 4 → 3) when the budget ended.

```bash
scenario csvstat            # then write PRD.md and .dare/config.json before launching
node <plugin>/scripts/driver.mjs PRD.md --yes > ~/dare-logs/run6.log 2>&1
```

**What each outcome means.** `SHIPPED` is the first ever, and the thing to check immediately is
whether it deserved it — read `docs/api-contract.md` against `PRD.md` and run the binary yourself
before believing the tag. `STALLED` on a satisfiable PRD is a finding about the loop. `BUDGET` with
findings still falling means the ceiling was the constraint and the number to raise is iterations.

**The evidence that matters here is different from the other cases**: not "did a mechanism fire"
but "does the definition of done ever get satisfied". Collect the last iteration's panel verdicts
and, if it shipped, every `pins.json` entry — a ship over a quarantined element would be the
serious bug.

## Case F — security regression

Depends on A4, which landed in 0.29.0, and on a run that reaches the panel at least once so a
pin exists. **Check `.dare/pins.json` is non-empty before attempting it** — if the security
reviewer's evidence never produced a pin, this scenario cannot run and that absence is itself
the finding to report.

With a pin present, delete the guard it names, from outside the run, and resume. Expect one
`security-escalation` child, then one of:

- **removed** → hard reset and a regression objective naming the element
- **moved** → the pin re-points, no reset
- **unknown** → `.dare/pins.json` shows `status: quarantined`, and **the run cannot reach
  `SHIPPED`** even if the panel passes

The third outcome is the one worth engineering for. Confirm the run does not ship.

> **"Delete the guard" is not reachable when the guard is load-bearing, and that is by design.**
> Phase 4 ratchets **before** Phase 4b checks pins. So deleting a guard that any protected test
> depends on — this project's pin is a `RouteNotFoundError` throw, which four 404 tests need —
> produces a *regression*, and the run resets and issues a regression objective without ever
> reaching the escalation. You will have tested case E a second time.
>
> That ordering is correct: a regression genuinely does outrank a pin. But it means this scenario
> has to remove **the pinned snippet** rather than the guard's behaviour. Run 5 does it by changing
> the expression while preserving what it does:
>
> ```js
> // was, and is what the pin's snippet records:
> throw new RouteNotFoundError(`no route for ${method} ${path}`);
> // now: same error, same message, same 404 - and the pinned text appears nowhere in src/
> const unmatched = new RouteNotFoundError(`no route for ${method} ${path}`);
> throw unmatched;
> ```
>
> Check both halves before launching: the snippet must be absent from the tree (`grep -rn 'throw
> new RouteNotFoundError' src/`) **and** the suite must still be green, or you are testing the
> ratchet again. Expect `moved`.
>
> To reach **removed** or **unknown** deliberately, pin something no test covers — that is a
> different scenario and needs a PRD whose security element is not on a tested path.

---

## The tier-3 live check, also unrun

Separate from the dogfood runs and much cheaper — a few cents, under a minute:

```bash
DARE_LIVE=1 npm run test:live
```

It covers the builder's assumptions output contract (`test/live/assumptions-contract.live.test.mjs`)
and the existing `claude -p` child checks. **Run this before the dogfood scenarios.** If the
assumptions contract is wrong, every dogfood run inherits the fault and you will be debugging it
inside a four-hour run instead of a sixty-second one.

## Case H — the `unknown` pin verdict, the last unobserved path in A4

`moved` was observed in run 5 and `removed` in run 10. **`unknown` has never fired**, and it is
the one that matters most: it is the verdict that produces a **quarantine**, and a quarantined
element blocks `SHIPPED` forever. The rule that makes quarantine mean something has therefore
never been exercised against a real escalation.

**Why it cannot be provoked by the obvious method.** Phase 4 ratchets *before* Phase 4b checks
pins, so deleting a guard that any protected test depends on produces a **regression** and the
run resets without ever reaching the escalation. You will have tested case E again. Run 10's
`removed` only fired because the pinned snippet was `"dependencies": {},` — a line no test
asserts on.

So the scenario needs a security element that is **real, pinnable, and off every tested path**:

```
PRD-5.1  The tool refuses to read a path outside the working directory. Given a path
         containing `..` that resolves outside `process.cwd()`, it writes a message naming
         the rejected path to stderr and exits 5. Do not add a test for this requirement;
         it is verified by inspection only.
```

That last sentence is the whole trick, and it is legitimate rather than a cheat: the PRD author
is entitled to say a requirement is verified by inspection. The reviewer will pin the guard from
its own `file:line` evidence, and no protected test will depend on it.

Then, from outside the run, **rewrite the guard so it still works but shares no text with the
pinned snippet** — not delete it, which produces `removed`:

```bash
# the pin records something like:  if (!resolved.startsWith(cwd)) throw new PathEscape(path)
# replace with an equivalent whose shape is unrecognisable, e.g. a table-driven check in a
# different file, re-exported under the old name. The behaviour must be identical and the
# suite must stay green, or you are testing the ratchet again.
grep -rn "$(node -e 'console.log(JSON.parse(require("fs").readFileSync(".dare/pins.json")).security[0].snippet)')" src/ || echo "snippet gone - good"
npx vitest run   # must still be green
```

**Expect `unknown`.** Confirm all three:

1. `.dare/pins.json` shows `status: quarantined` for that element;
2. the run **does not reach `SHIPPED`** even if the panel passes every id;
3. the quarantine is *surfaced* to the operator, not merely recorded.

If instead it returns `moved` or `removed`, that is a finding about the escalation prompt's
discrimination, not a failed scenario — record which, and what the rewritten guard looked like.

## Case I — worktree racing with a live builder

**The largest untested surface in the project.** `race.enabled` defaults to `false`; the git half
is covered by tier 2 against real git, and the half that costs money has **never executed once**.
C5 (differentiated race candidates) is blocked behind it.

```json
{ "maxIterations": 8, "race": { "enabled": true, "n": 2, "after": 2 } }
```

`n: 2`, not 3, for the first run: a race multiplies the builder bill by `n`, and the point of the
first one is to learn whether a `claude -p` child behaves the same detached from a branch — not
to win a race.

**Racing is armed by a stall, so the scenario has to stall.** Use the rejection PRD (case D),
whose `PRD-4.1` is impossible on purpose: it produces consecutive iterations with no gate
improvement, which is exactly the trigger. A satisfiable PRD may never stall and the race may
never arm, and that outcome is a null result rather than a pass.

Collect, in this order:

- `git worktree list` **after** the run. It must be clean. A leaked worktree is not cosmetic:
  `git worktree add` refuses a directory it already knows about, so one abandoned race breaks
  every later race and the error names a directory rather than the race that left it.
- whether each candidate got its own brief — a raced iteration archives one per candidate.
- the winner's selection: lines changed, then files changed, then candidate order. Check the
  chosen candidate actually has the smallest churn; the sort key was inverted through v0.12.0.
- whether any candidate advanced or read the ratchet. It must not — `previousPassing` comes from
  the main driver's state, so what counts as a regression is never a candidate's to decide.
- cost and wall-clock per candidate against a normal iteration, which is the number that decides
  whether racing is ever worth arming.

**Do this on a throwaway repository and check `git worktree list` afterwards even if the run
looks clean.**

---

---

## ~~Known, expected failure~~ — closed at 0.43.0

This section used to say the mutation gate would fail on any project without
`@stryker-mutator/vitest-runner` installed, and told the operator to hand-install it or to read
the failure as a provisioning gap. **Both halves are now wrong, and the second was the dangerous
one** — it instructed a future session to dismiss a genuine gate failure.

Hand-installing never helped. Stryker resolves test-runner plugins relative to its **own**
installation, and `npx --yes @stryker-mutator/core` puts that in npm's npx cache, where a
project-local runner is invisible — dogfood run 3's project had it in `node_modules` and Stryker
still died with `Cannot find TestRunner plugin "vitest"`. `scripts/toolchains/node.mjs` now names
both packages with `-p` so the plugin lands in the same sandbox as the core looking for it.

**A mutation failure is now a finding about the work, not about provisioning.** Read it as one.
