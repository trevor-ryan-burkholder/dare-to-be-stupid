# Dogfood runs — prepared, not performed

`BRIEF.md` D2 and `HANDOFF.md` item 9. **Nothing in this file has been run.** It was written so
that an operator with an hour and a budget can execute it without re-deriving anything, which is
what the brief asks for when Claude usage cannot be consumed: *"prepare reproducible dogfood
scripts and document exact commands, expected states and evidence to collect. Do not claim
end-to-end validation occurred unless it did."*

It did not occur. Every scenario below is untested.

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

| what to watch | first appeared | why it is unproven |
|---|---|---|
| prompt size climbing across iterations | 0.20.0 | the 400,000-character default is reasoned, not measured |
| `.dare/pins.json` filling | 0.29.0 | no pin has ever been created by a real reviewer |
| `.dare/assumptions.json` filling | 0.30.0 | no live builder has emitted the block |
| the mutation gate | 0.31.0 | **provisioning is not wired — expect this to fail** |
| `.dare/runs/NNN/` archiving | 0.28.0 | only ever exercised on temp directories |

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

**Blocked.** `dotnet` is not installed and there is no adapter. See `BRIEF.md` B3.

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

## Case E — deliberate regression

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

---

## Known, expected failure

**The mutation gate will fail on any project without `@stryker-mutator/vitest-runner`
installed**, because nothing provisions it (`HANDOFF.md`, A5). Until that is wired, either
install the plugin into the scenario repository by hand before starting:

```bash
npm install --save-dev @stryker-mutator/core @stryker-mutator/vitest-runner
```

or expect the conditional second pass to fail every iteration that reaches it, and read that
failure as a provisioning gap rather than as a defect in the work.
