# meeseeks — Design (v2, refined)

> A Claude Code plugin. One command, `/meeseeks`, hands an idea or PRD to an autonomous
> loop that authors specs, designs, builds, tests, secures, ships, fixes, and iterates
> until the app passes an *enterprise-production* definition of done — or the budget dies.
>
> Named for the Weird Al song. The joke is that it runs the Ralph Loop **on purpose**,
> with `--dangerously-skip-permissions`, and narrates the whole thing in the voice of an
> '80s Meeseeks. Pre-production only. Never points at anything with users.

This is v2. It keeps the strong core of the original spec (external reviewer, ratchet,
guard hook, Meeseeks style) and adds the three phases the original left thin relative to
the actual goal: **PRD authoring, a design phase, and a real enterprise DoD** including
security, CI, docs/observability, and design quality (with quality plugins auto-installed).

---

## 0. The premise, in one paragraph

The User builds documentation-first: spec → system docs → API contracts → `CLAUDE.md` →
code. `meeseeks` is the deliberate inverse, packaged as comedy that also solves
two real engineering problems. It is a *real build*, not a joke artifact. The comedy is
the skin; the engineering is the skeleton.

---

## 1. The two problems that justify building it

Everything else is plumbing.

### 1.1 The builder cannot be the judge
Not because it lies — because it *satisfices*. It meets the letter of the spec, stops, and
has no way to see that it did. Subagents don't fix this: a subagent inherits the parent's
context and framing, so it arrives already believing the work is fine.

The reviewer must be a **separate `claude -p` process**. It receives the PRD, the design
docs, and the repo. It does **not** receive the build log, iteration history, or any hint
that an agent wrote the code. Framing is adversarial: *find where this fails*, not *is this
done*. Verdict defaults to `fail`. A requirement passes only with `file:line` evidence.
Unparseable output is a fail. Nothing defaults to pass, ever.

**That starvation is *not supplied*, not sealed — a discipline, not a barrier (§6.1).** The
driver does not hand over the build log, the iteration history or the archived briefs. It does
not prevent a reviewer from finding them: a read-only child working in a repository that
contains `.meeseeks/briefs/iter-003.md` can open it. What does the work is the framing, not a
wall — a process never told it is auditing an agent has no reason to go looking for one. This
is written down because a reader who mistakes it for an enforced boundary will build on it,
and it will not hold the weight.

**The panel is heterogeneous, not N identical reads** (borrowed from ECC's specialized
reviewers). Instead of three generalists re-reading the whole repo, the panel is split by
DoD line — a **security auditor** (negative-case auth, secrets, injection), a
**correctness auditor** (PRD requirements, real test assertions), and a **design/DoD
auditor** (design docs match code, observability, docs, impeccable findings). Each is a
cold process; each owns the DoD lines it's expert in and must return `pass` on them with
evidence. Cheaper than three full generalist passes and sharper on each axis. The judge
panel runs on the **strongest** model (§10) — the smartest thing in the loop should be the
one deciding, not the one building.

**Ownership is explicit, total, and checked before the panel runs.** "Heterogeneous" only
means something if the split is written down, so `ownership` in `.meeseeks/config.json` maps
each reviewer to the id patterns it owns (`PRD-*`, `DoD-2-security`, …). The rules:

- Each reviewer is told **only** the ids it owns, and must return an entry for **every one**
  of them. A missing owned id invalidates that member's audit, exactly as before.
- The union of ownership must cover every required PRD and DoD id. An **uncovered id ends
  the run before a single reviewer is spawned** — an id nobody was asked about would
  otherwise pass by never being judged, which is the failure the parser exists to prevent.
  Discovering it *after* paying for three whole-repository reads is discovering it too late.
- A reviewer on the panel that owns nothing is refused for the same reason in reverse: it is
  a full cold read spent on nothing.
- **Duplicate ownership is legal but never the default.** Two owners on one id is a second
  cold read of the same line, worth paying for only when an operator has decided it is.
- `combinePanel` re-checks coverage against what actually came back, so a truncated report
  cannot leave an id silently unjudged.

The default split follows this section: correctness owns `PRD-*` and `DoD-1-requirements`,
security owns `DoD-2-security`, design owns `DoD-3-ci`, `DoD-4-docs-observability` and
`DoD-5-design`.

### 1.2 The ratchet
The characteristic death of an autonomous loop is oscillation: fix A break B, fix B break
A, until budget death with nothing to show. `.meeseeks/state.json` holds every test ID that
has *ever* passed. If an iteration drops one: `git reset --hard`, the regression becomes
the next build task, nothing else proceeds. Monotonic. A test that has passed is never
allowed to fail again. This is the single mechanism that turns an infinite loop into a
terminating one. **Build it first.**

**The ratchet begins as soon as the unit gate proves ids, not only after a fully-green
iteration.** Until 0.121.0, `saveState` was reachable only from Phase 6, after the panel, so an
iteration that failed any gate recorded no ids. Measured in case I: **71 passing tests across 8
iterations** and no `state.json` ever written, which meant a regression in any of those 71 would
have gone unnoticed for the whole run.

The driver now banks an advance when the unit gate passed and the reports were read successfully.
That is the narrow claim being made: these named tests ran and passed. A missing docs artifact or
failed lint gate says nothing about that fact. **`lastGoodCommit` does not move on this early
advance.** It still moves only after the complete gates and cold panel pass, so the reset target
remains a fully accepted tree while regression protection exists during a thrashing run. Phase 6
unions the same passing ids with the accepted commit, so the early and final writes cannot subtract
from one another.

**The reset is scoped before it is total (0.112.0).** A hard reset is whole-tree, so it discards
everything the iteration built rather than the change that broke something. Measured in `ship1`:
two resets threw away that run's two **largest** builder spends — 7.5M and 7.7M tokens, ~10% of a
150M ceiling — because one parser regressed. The resets were correct; the scope was the only thing
wrong.

So the driver first computes the narrowest set that could be responsible — the regressed ids' test
files and their **source siblings by naming convention** (`foo.test.ts` ↔ `foo.ts`, `test_x.py`,
`x_test.go`, `FooTests.cs`), intersected with the files this iteration actually changed — restores
just those, and **re-runs the suite to check the regressed ids came back.** If they did, the rest
of the iteration survives. If they did not, the full `git reset --hard` runs exactly as before.

**The verification is the design, not a nicety.** The sibling mapping is a convention, which is a
guess, and a guess is only cheap when something checks it. An unverifiable scoped restore is a
failed scoped restore — nothing defaults to pass here either. The cost of being wrong is one
deterministic gate pass with no model in it; the cost of not trying was measured at 15.2M tokens.

**A ratcheted test can encode a defect, and 0.109.0 makes that sayable.** Measured in `ship1`:
the builder wrote a test early asserting the exact behaviour the panel later called a bug, so
every attempt to satisfy the review broke the test, reset, and destroyed the iteration —
reported each time as an ordinary regression, indistinguishable from a builder that slipped
once. The driver now counts regressions per id **within the run** and, on a repeat, says so and
tells the builder the one legal move: **rewrite the assertions inside the test, never its name.**
A test id is the reporter's test *name*, so renaming or deleting drops the id and reads as a
regression like any other. **The ratchet is not weakened** — the id must still keep passing.
What changed is that the builder is no longer expected to rediscover the escape while being
reset every time it tries.

---

## 2. The pipeline (full)

The original spec was really *build → review → ship*. The goal is *design → build → deploy
→ fix → iterate*. Here is the whole thing. Phases 0 and 1 run **once** at the top; the
loop is phases 2–6.

```
/meeseeks <path-to-PRD | "idea in quotes" | (nothing)>
└─ node scripts/driver.mjs
   ─────────────────────────────────────────────────────────────
   PHASE 0  IDEATE      idea → PRD.md          (claude -p, PRD template)      [once]
   PHASE 1  DESIGN      PRD → design docs      (claude -p, arch template)     [once]
                        + auto-install quality plugins (impeccable, …)
   ─────────────────────────────────────────────────────────────  loop start ↓
   PHASE 2a BRIEF       compile the objective + evidence into .meeseeks/briefs/iter-NNN.md
                        (deterministic, no LLM)                                   (§8.1)
   PHASE 2b BUILD       claude -p, --dangerously-skip-permissions, brief as the task
                        (or, when stalled and armed, a worktree race — §13.6)
   PHASE 3  GATES       exit codes only. build · lint · types · unit · e2e ·
                        red-evidence · security-audit · ci · docs · observability ·
                        gate-integrity.  no LLM.
   PHASE 4  RATCHET     regression? hard reset, feed back, restart iteration
   PHASE 5  REVIEW      specialized cold claude -p panel, each member on the ids it owns,
                        unanimous-or-continue, vs PRD + design + DoD  (strongest model)
   PHASE 6  SHIP        commit · tag meeseeks/iter-NNN · annotated meeseeks/GRAND-PRIZE
                        · deploy, only if deploy.enabled and a command is set (§10)
   ─────────────────────────────────────────────────────────────  loop end ↑
```

Gates run **before** review — they're free and deterministic, so there's no reason to
spend expensive reviewer passes on something that doesn't compile.

**Terminal states:** `SHIPPED`, `STALLED`, `BUDGET`, `ABORTED`.

### Phase 0 — Ideate (the `/meeseeks "idea"` path)
If the argument is a file, skip this. If it's a quoted idea — or **nothing at all**, in
which case "meeseeks me" mode (§13) invents its own idea — a `claude -p` call with
`templates/prd-author.md` turns it into a structured `PRD.md` with **numbered, testable
requirements** (`PRD-1.1`, `PRD-3.2`, …).
Numbered requirements are load-bearing: the reviewer emits one verdict object per
requirement ID, so the PRD's structure *is* the DoD checklist. Unattended by default;
`--confirm-prd` commits `PRD.md` and exits before Oracle, design, or the loop. After the human
read, the accepted artifact starts a new invocation as `/meeseeks ./PRD.md`; no live run is paused
or resumed.

### 2.1 Phase 0, improve mode — the repository *is* the input

`--improve`, optionally with an area to focus on. The other three input shapes are all
**product-shaped** — a PRD to build, an idea to specify, or nothing at all — and none of them can
express *"this repository already exists; find what is wrong with it."* Improve mode is that
fourth shape, and everything downstream is unchanged: it produces the same `PRD.md`, with the same
`PRD-<section>.<n>` ids, judged by the same panel against the same DoD.

`templates/improve-author.md` runs in the **`prd` phase**, which already carries `Read`, `Glob`
and `Grep` — exactly what an author grounding requirements in real `file:line` evidence needs, and
the reason this needed no new permissions entry.

Four properties carry the mode, and each of them is a defect this project has already paid for:

- **Every requirement cites `file:line` for the current behaviour.** An ungrounded requirement is
  an unsatisfiable gate, which is this codebase's most expensive failure class — the builder
  cannot satisfy it, the stall counter climbs, and the run ends with nobody able to say which line
  was impossible.
- **Between three and eight requirements.** Each costs at least one iteration against a fixed
  budget. Forty improvements produce a loop that half-does all of them and finishes none.
- **Nothing may rename, move or delete an existing passing test.** The ratchet protects every test
  id that has ever passed, so a renamed test reads as a *lost* one and the repair is hard-reset
  every iteration, forever. It is the most expensive requirement the author could write and it
  looks completely harmless.
- **No rewrites, migrations or restructurings.** The builder works under the scope rule — every
  changed line traces to its requirement — and "move the parser into its own module" has no
  falsifying observation while licensing a diff that touches everything.

**Refused on a repository with no meaningful history**, using `hasMeaningfulHistory` rather than a
second detector. An improvement author handed an empty tree has nothing to ground a requirement
in, so it would invent them, which is the first bullet in its worst form.

### Phase 1 — Design (the phase the original spec skipped)
A `claude -p` call with `templates/architect.md` produces, into `docs/`:
`architecture.md` (components + boundaries), `api-contract.md`, `data-model.md`, and a
project `CLAUDE.md` (test gates + slice rules). These are **emitted artifacts and review
inputs**, not gates on their own — but "design quality" *is* a DoD line the reviewer
checks (§4). This is also where the driver **auto-installs quality plugins** (§5) so their
hooks/skills are live for every build iteration.

### Phase 1c — Components (only with `--give-them-the-box`)
When the config declares `components`, each one is a **whole nested driver run** in a git
worktree on `meeseeks/component-<name>`, executed sequentially in declared order between the
design commit and the loop. The parent writes the child a minimal derived config (ceilings from
its own remainder, the remaining wall clock, never a `components` key), spawns the nested driver
with the builder's own permissions, and consumes nothing but the branch and the child's
`outcome.json` — fail-closed: missing, unreadable or stateless outcomes are failures, and
anything short of `SHIPPED` ends the parent `ABORTED` naming the component. A shipped branch is
fast-forward-merged before the next component starts, and the loop then gates and cold-panels
the merged whole: a component's `SHIPPED` is a pre-filter like the panel carry, never a
substitute. The phase runs under the run lock, refuses components whose `.meeseeks` is tracked
at HEAD (a committed `outcome.json` would replay a stale verdict), and resolves the component
dir through `realpath` so a committed symlink cannot point a nested driver outside the worktree.
The point of nesting at all: per-subtree toolchains — `resolveToolchain` is one-per-run, so a
polyglot repository is inexpressible without this.

### Phases 2–6
Build, gates, ratchet, review, ship — the loop. Detailed below.

---

## 3. Architecture — driver lives *outside* the session

The driver lives outside any Claude Code session. It has to: the ratchet needs persistent
state across processes, and the reviewer needs a clean process with no build framing. A
loop living inside a session can do neither.

- `commands/meeseeks.md` — preflight checks, then shells out to the driver.
- `scripts/driver.mjs` — the loop. Node, **no runtime dependencies** (`node:` builtins +
  shelling out). Owns state, spawns `claude -p` for build/review/ideate/design, runs gates.
- Each `claude -p` is a fresh process. Builder gets full context; reviewer gets a
  deliberately starved one.

---

## 3.5 Prerequisites & preflight (what the user sets up)

The goal is that the *only* things the user does are: install the plugin, be in a repo, and
run `/meeseeks`. Everything else is either checked-and-explained by preflight or installed by
the run itself. `commands/meeseeks.md` runs preflight **before** shelling to the driver and
**fails loud** rather than starting a half-configured unattended run.

**The supported `/meeseeks` command is user-invoked only.** It must remain user-invocable and be
unavailable to Claude's autonomous Skill tool (`disable-model-invocation: true`). This is distinct
from the nested-run guard: an ordinary interactive session is not marked `MEESEEKS_RUNNING`, and
command preflight supplies `--yes` internally, so neither mechanism replaces the command-level
control. This is not an OS authentication wall against a model already granted arbitrary Bash and
aware of a script path; direct script entry is an unsupported operator/development path. The
current shipped command omits the Skill control; REVIEW F25 / PLAN item 80 own the versioned repair
and real-loader evidence without claiming the broader wall.

**The Driver revalidates mutable launch safety and owns pre-loop output provenance.** The command's
preflight is useful operator feedback, not an authorization receipt that survives another model
turn. After the atomic run lock and before any child, target-content write, archive, or commit, the
Driver must observe the clean launch tree and mutable destructive-safety checks itself: current
HEAD/status, non-production remote classification, positional tracked-state boundary, agent-config
security scan, validated effective config, and availability of any requested OS sandbox. Runtime
binary/auth/network failures remain ordinary fail-closed preflight/child failures rather than a
claim that the repository snapshot seals the host. Each PRD/design phase then has an explicit
output-path allowlist and refuses unexpected changes before staging only those
paths. It never uses a broad phase `git add -A` to absorb an unattributed edit. This matters because
Claude Code `allowed-tools` pre-approves matching tools but does not remove the rest of the launcher's
tool pool, and the document children intentionally hold Write/Edit. F14 separately owns final
reviewed-tree identity.

**How it is enforced, since 0.166.0** (`scripts/launch.mjs`). Immediately after the run lock and
before the `.gitignore` write, the previous run's archive, the first child, the install and every
commit, the Driver re-runs preflight's own clean-tree, positional tracked-state, non-production
remote, effective-config, agent-surface and requested-sandbox checks — *reused*, not reimplemented,
because a second answer to "is this remote production-shaped" eventually disagrees with the first
one quietly. Every check runs even after one fails, so an operator with three problems learns all
three now. A refusal names the observed HEAD and each failing check, and writes nothing at all:
repository bytes are preserved, and so is the previous run's receipt, which the archive has not yet
moved.

Each pre-loop document phase then commits an **enumerated** path list rather than `git add -A`. What
it may leave is read from the template that declares it — `<!-- meeseeks:declared-outputs ... -->`
in `prd-author.md`, `improve-author.md` and `architect.md` — so a template that changes what it
writes changes what is admitted in the same edit, and no shipped script restates the architect's
output table. It is an allowlist and never a required set: `docs/openapi.yaml` is conditional. Any
other tracked or untracked path ends the run, and refusing stages, resets, cleans and removes
nothing, because the surprise may be the operator's. The oracle author holds no tools and is held to
leaving the tree exactly as it found it. Quality-plugin provisioning is a separate commit with no
template contract — it writes whatever the tools it installs write — and its paths are enumerated,
staged by name and recorded rather than predicted. `.meeseeks/launch.json` records the observed HEAD,
each check's name and verdict, and each phase's declared and staged paths, bounded to 50 entries with
the remainder counted; it carries no file contents and no check sentence, because `safe-remote`'s
sentence quotes the remote URL and that is where an embedded credential would be.

`REVIEW.md` F26 records the defect and its acceptance evidence, and remains open until Codex has
verified the repair.

**Preflight verifies (hard-fails with a fix hint if missing):**

| Check | Why | If missing |
|---|---|---|
| Node ≥ 22.12 | driver + impeccable installer | abort, print required version |
| one resolved `claude` binary inside the measured compatibility policy, callable non-interactively and authed | driver and command rely on versioned flags, settings, hooks, Skill controls, envelope fields, and one unchanged CLI contract per run | abort, print detected identity, admitted policy, and the pin/install/sign-in fix |
| Inside a git repository | every state transition and rollback is commit-based | abort, name the required repository |
| Repository has at least one commit | worktrees, baselines and reset targets need a commit | abort, create the initial commit |
| **Clean working tree** | ratchet does `git reset --hard` | abort, tell user to commit/stash |
| Remote is **not** prod/client/customer (if a remote exists) | never point at users | abort |
| Network reachable (npm registry) | impeccable + tooling install | abort |
| `.meeseeks/config.json` is readable | run config | scaffold when absent; abort with a repair when invalid |
| **No other driver holds this repository** | two drivers on one tree each `git reset --hard` it and commit over the other | abort, naming the pid and the lock file to delete |
| **`.meeseeks/` is not tracked by git** | a tracked state dir defeats the gitignore: every hard reset restores stale config and ratchet, every iteration commits run state. Measured — a target ran with a stale, reset-restored config and the only symptom was the banner's iteration count | abort; `git rm -r --cached .meeseeks && git commit` |
| Requested OS sandbox is available | refusing fallback is the sandbox guarantee | abort with the missing host requirement |
| **Agent-config security scan** clean | dangerous mode trusts the repo's own hooks/prompts/MCP/secrets | abort on findings (§3.6) |
| `--dangerously-skip-permissions` acknowledged | the premise; guard hook is the safety | require `--yes` or an interactive confirm |

**Claude Code compatibility is evidence, not semantic-version optimism.** Admit only pinned CLI
releases or a deliberately evidenced range that passes the staged candidate's full
`npm run test:live`, including every mandatory command/child contract. The policy records both its
oldest demonstrated floor and its highest demonstrated compatible boundary; a greater version is not
automatically compatible. Preflight parses `claude --version` and refuses values outside that policy,
including prerelease-ambiguous or unparseable output, before any run work. The Driver resolves one
canonical real invocation path, content fingerprint, and reported version for the run. It captures
the fingerprint before and after each compatibility probe, executes every later Claude probe and role
through that sealed path rather than another `PATH` lookup, and rechecks the canonical target,
fingerprint, and version immediately before every role spawn. Item 56 supplies a sealed
no-background-update control to every such probe and role. A same-version byte replacement, symlink
retarget, or other identity mismatch refuses; path plus self-reported version alone is not identity.
For a symlink, script, or package launcher, the fingerprint policy also binds the measured delegated
entrypoint or package identity whose mutation changes invoked code. An install form whose mutable
invocation closure cannot be bounded and live-proven is unsupported rather than approximately sealed.
A compatibility pass does not replace the paid live suite:
flags such as `--safe-mode` have had behavior not fully specified by help text, and current official
documentation says background updates take effect on a later launch. Current 0.164.0 checks only
whether `claude --version` exits successfully; the repository records a 2.1.136 binary that lacks
`--safe-mode`, individual live measurements on 2.1.226/2.1.228, and source validation on
2.1.233—not a complete product contract matrix. REVIEW F28 / PLAN item 83 own the policy and
enforcement.

**The run lock is `.meeseeks/lock.json`; `.meeseeks/run.json` is the run manifest (§7.1).** The
lock must be acquired atomically by the driver before Phase 0, before the first child spawn,
target-content write, install or commit, and released only by the owner on every path out. It records
the driver's pid, start time and an ownership token so a process that did not acquire the lock
cannot clear it. Measured on 13 August 2026 — `ps` showed three drivers, two on the same `cwd`,
because run 14 was sent `SIGTERM` and did not die before run 15 launched. Run 15's result is void
and nothing may be concluded from its log. §13.6's re-entrancy guard does not cover this and never
did: it refuses a *nested* run, a builder invoking the slash command, which is a different failure.

**How it is acquired, since 0.165.0.** Winning is an exclusive create — `O_CREAT | O_EXCL` on
`.meeseeks/lock.json` — and that is the only way to win: no path in `run-lock.mjs` writes the lock
over an existing one. Through 0.164.0 it read the file in one call and overwrote it in another, so
two contenders that both observed an absent lock both succeeded; measured against six real
processes racing one directory, all six "won". The same race with the exclusive create yields
exactly one, every round.

Stale recovery is an explicit retry and never part of the claim. A lock is reclaimed only after its
recorded owner has been established dead, and only by the one contender that first wins a second
atomic operation: an exclusive create of the takeover claim at
`.meeseeks/lock.json.takeover-<hash of the stale token>`. Without that serialization, two contenders
reading one dead lock would each remove it and each create their own, which is the original defect
wearing a different hat. Inside the takeover the lock is read again, so a straggler that arrives
after somebody else has already reclaimed the repository refuses instead of deleting a live lock.

**Since 0.182.0 the claim carries an owner and can itself be reclaimed** (REVIEW F34). It was a
bare `mkdir` through 0.181.0, and the argument for why an orphan was harmless — the claim is named
from the stale token, so the name never recurs — held only for claims that got cleaned up. A
reclaimer killed between winning the claim and replacing the lock leaves both in place, so the name
recurs for every later contender and the repository is bricked. The full mechanism, including why a
sweep must verify the bytes it moved rather than the path it moved them from, is in §4 under
"A takeover claim must itself be reclaimable".

The token is what makes ownership enforceable: `releaseRunLock` removes the file only when the token
on disk is the one it was handed, so a losing contender, an aborting run, and a process that never
acquired anything all fail to clear the winner's lock. A lock carrying no token cannot be reasoned
about in either direction and is therefore refused rather than reclaimed — the only file that can be
in that state was written by a driver before 0.165.0, which by definition is no longer running.

The driver acquires it immediately after the refusals that touch nothing — the re-entrancy guard,
config load, argument parsing, the tracked-state check, and the components/`--give-them-the-box`
rule — and before everything with a side effect: the `.gitignore` write, the previous run's archive,
the first child, the quality-plugin install, and every commit. Those cheap refusals stay upstream on
purpose. A run that was never going to start should not take the repository from one that was, and
the nesting refusal in particular must keep its own message, because a nested run held off by the
*parent's* lock would report the wrong reason and would refuse under `--give-them-the-box` the very
thing that flag exists to permit. It is released by its owner on every path out, including the
pre-loop refusals, which is enforced positionally rather than by a list somebody has to remember.

`REVIEW.md` F1 records the defect and its acceptance evidence, and remains open until Codex has
verified the repair.

Living under `.meeseeks/` means §6's positional rule already protects it — a process marked
`MEESEEKS_RUNNING` may not write there at any depth, so a builder cannot forge or clear it.

**A live pid refuses; a dead pid is stale and does not.** The asymmetry is deliberate and it has a
known imperfection: *"is this pid alive"* is not *"is this pid my driver"* once a reboot recycles
pids, and there is no portable way to ask the second question. So this can refuse a run that
should have started. That mistake costs one `rm` on a path the message names; the other mistake
cost an entire run. A lock left by a killed driver clears itself, because its pid is gone.

**Installed by the run, not the user:** vitest, Playwright + browsers (`npx playwright
install`), and impeccable (`npx impeccable install`) are provisioned during Phase 1/early
build. A greenfield idea → PRD → repo with no `package.json` is fine; the builder scaffolds
it.

**Not required unless opted in:** deploy host + credentials (only when `deploy.enabled`).

**A throwaway repository is not a host resource sandbox.** The current release and the documented
Claude Bash sandbox establish no CPU, memory, process-count, disk-space, or workspace-growth quota.
A deadline or output cap can stop and reap work after a boundary fires; it cannot prevent a child from
exhausting a shared host first. Until PLAN item 84 records a stronger measured boundary, unattended
runs belong in an operator-provided disposable account, VM, container, or equivalent environment with
explicit resource limits. That operator isolation is deployment guidance, not a Meeseeks runtime
dependency or a claim that filesystem/network policy enforces resource quotas.

**Not setup, but the real cost:** API budget. Build + reviewer-panel whole-repo reads ×
up to `maxIterations` is the dominant spend; `tokenCeiling` is the backstop that ends a run
`BUDGET` before it runs away.

**`tokenCeiling` is a stop signal, not a cap, and the difference is larger than it sounds.**
Every child's spend is charged the moment it returns — including Phase 0 and Phase 1, which run
before the loop and are threaded in as `alreadySpent` (they were uncounted until v0.35.0, so a
run could spend an entire PRD and design phase *and then* the whole ceiling). But nothing can
price a child *before* running it, and `claude -p` accepts no token limit the driver could pass.
So the guarantee is: **the ceiling, plus every child already in flight when the breach becomes
visible.** During a serial phase that is one child. During the parallel cold panel it can be all
three reviewers. `--max-budget-usd` bounds money approximately when a cost ceiling is armed; no
equivalent CLI flag makes `tokenCeiling` a hard token cap.

Measured on 11 August 2026: a single builder child returned **20,223,215 tokens against a
2,000,000 ceiling**. The check fired correctly and ended the run immediately. An operator
setting a small ceiling should read it as "stop after this is exceeded", not as "do not exceed
this", and should expect a single child to be able to overshoot by an order of magnitude.

**And tokens cannot be converted into money, which is why `costCeiling` exists beside it.** The
same run measured **20,223,215 tokens at $9.4345** — $0.47 per million, because cache reads
dominated the count. At uncached input rates that token figure would have cost an order of
magnitude more. So a token ceiling bounds *work* and only a cost ceiling bounds *spend*; neither
substitutes for the other, and both are checked on every child. `costCeiling` reads the envelope's
own `total_cost_usd` rather than estimating from a rate card, for the same reason nothing else
here estimates.

**Both are accounting, and neither is a watchdog. `childTimeoutMs` is the watchdog.** A ceiling
read from an envelope is a ceiling on a child that *returned*; a child that never returns produces
no envelope, spends no recorded tokens, and passes both checks forever. Children run under an
async `shell()` (0.141.0), so the event loop stays free while one is out, and the heartbeat
(0.142.0) pulses roughly every sixty seconds while a child runs — a hung child and a working one
no longer look alike. The operator's report on 13 August 2026, of runs sitting for hours before
anyone noticed, is the report the heartbeat exists to end; the watchdog is still what acts.
The ceiling is 30 minutes by default against a
longest-ever-observed child of 651s, because killing a child that was working is the expensive
wrong answer. On a timeout the child's output is **discarded unread**, including any partial
envelope: a killed child has no verdict, and half of one is a different verdict rather than a
smaller one.

**On a subscription neither of the first two is the binding constraint.** There the limit is the rate-limit
window, and a child that runs out of allowance is told apart from a child that failed:
`EXHAUSTION_PATTERN` marks it, the work in progress is **committed**, and the run ends `BUDGET`
saying it can resume. A stalled allowance is not a failed build and must never be scored as one.

---

## 3.6 Agent-config security scan (borrowed from ECC's AgentShield)

The guard hook (§6) is *runtime* safety. This is the *static, pre-run* half. meeseeks runs
`--dangerously-skip-permissions` unattended, which means it trusts the repo it's pointed
at — a poisoned `CLAUDE.md`, a malicious PreToolUse hook, a rogue MCP server, or committed
secrets could hijack or exfiltrate through the builder before the guard hook ever fires.

Preflight scans the repo's **own agent surface** before the loop starts: hook scripts,
prompt/instruction files, MCP config, tool permissions, and secret patterns. Findings abort
the run (`ABORTED`) with the offending path. Implementation can shell out to
`npx -y ecc-agentshield scan --path .` (ECC's tool) or a small built-in scanner; either
way this is a required preflight gate, not optional, precisely *because* the run is
otherwise unsupervised.

---

## 3.7 Project capabilities — what this thing *is*

Which gates apply depends on what is being built. A CLI has no health endpoint to answer, a
library has no user interface to inspect, and a background worker has no HTTP surface. Until
v0.11.0 the codebase had exactly one concept of this kind — `hasFrontend` — and it could only
answer for a tree that already exists, which is the wrong question to ask on iteration 1 of a
greenfield build.

**Capabilities are declared or detected, and the two are unioned.** The architect phase
declares what it is about to build; `detectCapabilities` verifies and augments that against
the tree as it actually is. Either source alone is wrong: a declaration cannot see the React
dependency a builder added on a whim, and detection cannot see the future.

The vocabulary is closed, and small on purpose:

| Capability | Means |
|---|---|
| `web-ui` | renders an interface a person looks at in a browser |
| `desktop-ui` | renders an interface in a native desktop window |
| `cli` | is invoked as a command from a terminal |
| `api` | answers requests over HTTP from other programs |
| `network-service` | listens on a port for something other than plain HTTP requests |
| `library` | is consumed as a dependency by other code rather than run on its own |
| `persistent-storage` | keeps state that outlives the process |
| `background-worker` | does work outside the request that asked for it |
| `realtime` | pushes to connected clients rather than waiting to be asked |
| `authentication` | decides who a caller is, or what they are allowed to do |

Four rules, each of which is load-bearing:

1. **An unknown capability is an error, not a shrug.** Same precedent and same reason as
   `validateConfig` (§10): a capability nobody recognises arms no gate, so the run would skip
   whatever it was meant to check and report a clean pass anyway.
2. **A detector exists only where the positive signal is unambiguous.** `library` therefore
   has none — `main` and `exports` appear in nearly every application manifest ever written,
   and a detector firing on them would be a guess wearing evidence's clothes. The absence is
   recorded in an exported `UNDETECTABLE` table rather than left to be inferred from a gap.
3. **Detection only ever adds.** Nothing removes a declared capability, because "I looked and
   did not find it" and "it is not there" are the same sentence only when the detector is
   complete, and none of them are.
4. **An empty resolved set is an error.** It would arm no conditional gate at all, and a run
   that checks nothing reports the same clean pass as a run that checks everything.

Over-detection is the safe direction and under-detection is the dangerous one: an extra
capability arms an extra gate, while a missing one skips one silently. Two knowing
over-detections are accepted on that basis — `ws` and `socket.io` are read as
`network-service` and `realtime` even though both have client-side uses.

Evidence is carried, not discarded: each detected capability maps to a short string such as
`dependency react` or `file prisma/schema.prisma`. `web-ui: dependency react` is auditable in
a run manifest in a way that `web-ui: true` is not.

`hasFrontend` survives as a thin wrapper over `web-ui` detection, because §5.1's design-slop
carve-out is asked against the tree each iteration and predates any manifest. That gate stays
on *detection* rather than the manifest on purpose: it asks "is there something to inspect",
which is a question about the tree, not about intent. A declared `web-ui` that has not been
written yet is still nothing to look at.

**How the declaration arrives.** The architect's final message ends with a fenced json block:

```json
{ "capabilities": ["api", "persistent-storage"] }
```

`parseCapabilityDeclaration` reads it — trying each fenced block last-to-first, so an echoed
example never wins over the answer — and an unparseable, empty or out-of-vocabulary
declaration **aborts the run**. Same rule as everywhere else: missing evidence is a failure,
not a default.

**Where it is kept.** `.meeseeks/capabilities.json`, driver-owned:

```json
{
  "declared": ["api", "persistent-storage"],
  "detected": ["api"],
  "capabilities": ["api", "persistent-storage"],
  "evidence": { "api": "dependency express" }
}
```

It is rewritten every iteration, because `detected` and `evidence` describe the tree as it is
*now* and the builder changes the tree under them; `declared` is the only durable half. It
needs no new guard rule — the §6 hook denies a run's own children any write under `.meeseeks`,
positionally. That matters here specifically: a builder able to edit this file could declare
away the capability whose gate it cannot pass, and the run would ship having never checked it.

The resolved set is handed to each iteration's Build Brief (§8.1) so the builder knows what it
is building. It also chooses gates: `scripts/gate-policy.mjs` (§4.2) is the capability-to-gate
table, sitting on top of §3.8 — each gate is either universal or armed by the capabilities that
give it something to test, and a skip is announced with its written reason, never silent.

---

## 3.8 Toolchains — *how* to build it

§3.7 says what the project is. This says how to operate on it. The two are independent: an
`api` can be Node or .NET, and a `cli` can be either.

Everything the loop knew about building used to be six npm and npx command lines inside
`driver.mjs`, plus a second and quietly different set of assumptions inside CI inspection. A
toolchain is that seam, given a contract:

| operation | Node | .NET |
|---|---|---|
| `detect` | `package.json` present | a `.sln` or `.csproj`, bounded depth |
| `restore` | `npm ci` | `dotnet restore` |
| `build` | `npm run build` | `dotnet build` |
| `lint` | `npm run lint` | `dotnet format --verify-no-changes` |
| `types` | `npm run typecheck` | **not applicable** — the compiler subsumes it |
| `unit` | `npx vitest run --reporter=json --outputFile=…` |
| `e2e` | `npx playwright test` |
| `security-audit` | `npm audit --audit-level=high` |
| `mutation` | `npx --yes @stryker-mutator/core run .meeseeks/stryker.config.json --testRunner vitest --mutate …` (§4.4) |
| `startCommand` | `npm start`, when the manifest declares one |
| `ci` | which operations a workflow must be seen to run |

Six of these become Phase-3 gates, in that order. `restore` is in the contract but is **not**
gated — a toolchain that cannot express "restore dependencies" cannot describe .NET or Rust at
all, but running `npm ci` before every iteration would delete `node_modules` and add minutes
to each one.

**A missing step is stated, not faked.** An operation is either a command or an explicit
`notApplicable(reason)`. A toolchain whose compiler subsumes typechecking says exactly that; it
may not return `true`, and it may not return an empty command, because both are
indistinguishable from a step that ran and passed. A declined operation is **reported** — to
the operator on stdout and to the builder in the brief — because a gate list that silently
shrinks from six entries to four reads exactly like one that always had four.

**CI comes from the same table as the gates, and that is a bug fix.** The old
`CI_REQUIRED_COMMANDS` accepted `node --test` and `jest` for the unit step while the unit gate
ran `npx vitest run --reporter=json`. A project could therefore satisfy the `ci` gate with a
suite the ratchet would never see one id from — which is precisely what both live runs on
10 August 2026 did. A test now asserts that each CI pattern matches the command string its own
operation produces, so the two cannot drift apart again without failing.

### 3.8.1 What running the commands changed, and why it had to be running them

`HANDOFF.md` carried a warning for two versions: *the registry makes a wrong adapter easy to
add and green — every structural test passes on argv nobody has ever run.* The .NET adapter was
written against a real SDK (8.0.423) for that reason, and two of the commands it would
otherwise have shipped are wrong.

**`dotnet list package --vulnerable` cannot fail.** Given `System.Net.Http 4.3.0` it printed a
**High** severity advisory — `GHSA-7jgj-8wvc-jh57` — and **exited 0**. Gates read exit codes, so
that command is a log line rather than a gate, and wired as `security-audit` it would have
reported a clean pass on every vulnerable .NET project forever. This is precisely §4.4's Stryker
finding — *the tool reports the problem and does not fail on it* — reached independently by a
different tool, which suggests the class is common rather than a coincidence and that **any new
adapter's audit step should be assumed guilty until it has been seen to exit non-zero.**

What works is NuGet's audit promoted to an error on the command line, so the project cannot opt
out: `dotnet restore --force -warnaserror:NU1901,NU1902,NU1903,NU1904`. Verified **both**
directions — exit 1 with `error NU1903` on the vulnerable project, exit 0 once it was removed.

**And the near-miss is worth recording, because it is the more instructive half.** The first
attempt used `-p:WarningsAsErrors=NU1901,NU1902,…`, which MSBuild rejects with
`MSB1006: Property is not valid` — **and that rejection also exits 1.** It was briefly read as
the audit working. What caught it was running the *clean* project through the same command and
getting a failure there too. A deny case alone proves nothing; the benign neighbour is what
distinguishes a gate from a command that always fails, which is why this repository pairs them
everywhere.

**Detection falls back rather than refusing.** A greenfield repository has no `package.json` on
iteration 1, so detection is honestly empty at exactly the moment the gates are first
assembled; refusing to choose would abort every greenfield run. Node is the default because it
is the only implementation. When a second one lands that stops being obvious, and the answer is
§3.7's: the architect declares it and detection confirms.

---

## 3.9 The context budget — measured before a child is spawned

§3.7 says what the project is and §3.8 says how to operate on it. This says how much of it a
child is being handed at once.

Every builder's input is assembled: the Build Brief, the system prompt, the PRD, design
documents, retrieved lessons and conditional git history. That input **grows across
iterations**, and until v0.20.0 nothing looked at it. That is this codebase's characteristic
bug class rather than an incidental gap — there is no exception, no exit code and no red line.
The builder is simply worse at iteration 12 than it was at iteration 2, and the run says
nothing, because nothing asked.

`scripts/context-budget.mjs` measures the assembled input inside `spawnClaude`, before the
child exists. The position is the point: every phase goes through that one door, so a phase
added later cannot forget the check, and refusing there costs no money and no wall-clock.

**It counts characters and calls them characters.** There is no tokenizer and there will not be
one — hard constraint 1 forbids the dependency, and a hand-rolled estimate is worse than no
number at all, because `~48000 tokens` reads as a measurement and is a guess. §7.1 refuses to
write `"unknown"` into a manifest for the same reason. A character count is exact, is free, and
tracks the thing this is actually about: unbounded growth. It is a proxy for context occupancy
and is labelled as one everywhere it appears.

**Over budget fails, and nothing is ever trimmed.** Every list the Build Brief renders is
already capped and already announces what it left out (§8.1). The one uncapped input is raw
gate output in a failure `detail` — and trimming that means silently choosing which half of a
compiler error the builder is allowed to read. **A truncated prompt is not a smaller task; it
is a different task, handed over without saying so.** So the check refuses and the refusal
names the largest part, which is what makes it actionable rather than merely correct.

There is deliberately **no `enabled` flag**. A run whose prompt has grown past the ceiling
needs an operator to look and decide it is legitimate, then raise `contextBudget.maxCharacters`
— which is a decision. Switching the check off is a way of not making one, and it is the same
category of error as a threshold that learns its way downward (§13, "explicitly rejected").

The cheap half rides along for free: `childStartLine` prints the measured size before every
child, so an operator watching the log sees the number climb. The budget catches a runaway;
that line catches the slope leading to one.

---

## 4. Definition of done — "enterprise production"

The original operationalized DoD as *PRD requirements met*. The User's DoD is broader. A run
is `SHIPPED` only when **all** of these hold. Deterministic ones are Phase-3 gates;
judgment ones are Phase-5 reviewer lines.

| # | DoD line | Enforced by | Mechanism |
|---|----------|-------------|-----------|
| 1 | **PRD requirements met** | Reviewer (cold) | one verdict object per `PRD-*` id, `file:line` evidence, unanimous |
| 2 | **Security** | Gate + Reviewer | dependency audit exit-0 **and** `/security-review`-style cold pass; negative-case auth checks (guard on handler, not hidden nav link) |
| 3 | **CI / build config** | Gate | a workflow under `.github/workflows` whose `run:` steps **actually invoke** build, lint, types, unit and e2e — presence of a file is not the check |
| 4 | **Docs + observability** | Gate + Reviewer | `README` + `docs/api-contract.md` present and non-stub; structured logging present; a `/health` (or equivalent) endpoint that **answers a real request** when the app declares a start script |
| 5 | **Design quality** | Gate + Reviewer | `npx impeccable detect src/` exit-0 (§5.1; skipped on non-UI projects); design docs exist and match the code; architecture is coherent, not accidental |
| 6 | **Truthfulness under adversarial input** | Reviewer (cold) | no input class makes the program report a **confidently wrong answer at a success exit code**. The reviewer constructs hostile inputs and runs them (§4.5) |

**Who guards the gates.** Every line above is enforced by running something. The builder
writes what that something *is*: `commandGates` invokes `npm run lint`, and `lint` means
whatever `package.json` says it means. `"lint": "true"` clears that gate forever, and no
other check in this document notices — the ratchet guards *test identity*, so it sees a
deleted test but not a hollowed-out linter.

`gate-integrity` (`scripts/integrity.mjs`) closes that. It fails on a `build`, `lint`,
`typecheck`, `test` or `e2e` script whose body runs nothing (`true`, `:`, `exit 0`, or an
`echo` explaining why the gate was unnecessary), on `compilerOptions.strict: false` in any
`tsconfig*.json`, and on `@ts-nocheck` in any source file. A line-level `@ts-expect-error`
stays allowed: it is a narrow claim that fails loudly when it stops being true, which is the
opposite of a whole-file suppression.

It also fails on **truthiness-only assertions in test files** — `toBeTruthy`, `toBeFalsy`,
`toBeDefined`, `toBeUndefined` and `toBeNull` as the whole assertion, and single-argument
`assert(x)` / `assert.ok(x)`. This is the deterministic form of the DoD's most load-bearing
claim, which was otherwise enforced only by a reviewer *reading* the tests, at the cost of a
full iteration each time it fired.

**It cannot see a test that cannot fail, and that is deliberate.** Probed directly: a test looping
over files with `if (file.kind === 'leaf') continue;` before its only assertion passes this gate,
and so does `test('asserts nothing', () => { const x = 1 + 1; })`. The first shape is real — run 3's
builder found one in its own suite and recorded in `.meeseeks/assumptions.json` that the test *"could
never fail regardless of its imports"*, then strengthened it unprompted.

The conditional-skip shape is not statically detectable at all; deciding whether an assertion
executes is the coverage question. **That is what the mutation gate is for** (§4.4), and it is why
that gate being inoperative until 0.43.0 mattered more than a missing runner: the one check that
catches a test proving nothing had never run.

The zero-assertion shape *is* detectable, and is still rejected, by this module's own rule that a
false positive costs a full iteration on a correct repository while a false negative costs nothing
the reviewer was not already covering. `test('does not throw', () => { doThing(); })` asserts
nothing and is a legitimate test — it fails when `doThing` throws — and a suite whose assertions
live in helpers (`expectValidNote(x)`) is ordinary. A detector firing on both would fail correct
repositories to catch a shape the mutation gate already kills.

**It does not scan a directory this loop's own tooling generated**, and that rule was bought with
a failed iteration. Dogfood run 3's mutation gate crashed and left Stryker's instrumented sandbox
under `.stryker-tmp/`; Stryker writes `@ts-nocheck` into every file it copies there. Because
`gate-integrity` is evaluated **after** the conditional second pass (§4.4), it then walked that
sandbox and failed the iteration on 22 files that did not exist in the real tree — **one gate
failing on another gate's debris**, and not one line of it fixable by the builder, which had
already written `never meant to be committed or scanned as source` beside the directory in its own
`.gitignore`. Every such directory belongs in `SKIP_DIRS`, and the exclusion is paired in the
tests with a real suppression sitting beside a sandbox, because skipping a directory is one
keystroke from skipping the check.

It belongs here rather than in an ESLint rule for the reason this whole check exists: a rule
shipped into the project's linter is a rule the project's linter can be configured not to run,
so the check would be negotiable by the thing it constrains. Three things keep it from
punishing a correct repository — comments are blanked before matching, so a file *describing*
the rule does not fail it; a two-argument `assert(x, message)` is left alone, since the item
names the single-argument form specifically; and **application source is not scanned at all**,
because `assert(config)` outside a test is a runtime invariant rather than a claim about a
result.

It **denies the known cheat rather than allowlisting the known tool**, and that asymmetry is
deliberate. An allowlist of linters reads as stricter and behaves worse: the first time a
builder reaches for a real tool that is not on it, the gate fails a correct repository and
costs a full iteration. A no-op has no honest counterexample — nobody writes `"lint": "true"`
meaning it — so it can be named precisely without ever punishing a legitimate choice.

**Where a gate checks behaviour, and where it deliberately does not.** A presence check is
satisfied by the smallest artifact that quiets it, and a builder under pressure to clear a
gate called `ci` will write exactly that — a workflow file that runs nothing. So `ci` reads
the `run:` steps, and `/health` is asked a real question by starting the application
(`scripts/health-probe.mjs`, and the probe kills the whole process group afterwards, because
a leaked server poisons every later iteration with a port conflict).

Two things stay static, on purpose:

- **Structured logging.** The behavioural version means running the app and inspecting
  stdout for structure, which is neither cheap nor deterministic: it depends on level
  configuration, on whether anything happened to log during the probe window, and on
  transports that may not write to stdout at all. A logger call in source is the honest
  proxy, and the gate records it as a proxy rather than dressing it up as evidence.
- **The health probe when no start script exists.** Nothing declares how to start the
  application, so there is nothing to ask. The gate passes on the static finding and *says
  in its detail line that it did not probe*, rather than reporting a request it never made.

**A role result requires process success *and* envelope success** (REVIEW F7, implemented at
0.179.0). `spawnClaude` consulted `result.ok` only when stdout happened to be empty; for every other
failed process the envelope's own verdict *overwrote* the failure. Measured: `ok:false`, status 9,
stderr `process failed`, stdout `{"is_error":false,"result":"claimed success"}` — and the driver
returned `ok:true` with text `claimed success`. Process failure is boundary evidence a child cannot
revoke by describing itself favourably, and laundering it can accept a partial PRD, design
declaration, Builder response or Panel verdict.

Four failure kinds now stay distinct all the way through `ShellResult`, and none of them becomes a
role success because stdout happens to parse:

- **timeout** — the child is killed and nothing it wrote is read, because a killed child has no
  verdict and a fragment of one is a different verdict rather than a smaller one;
- **output cap** — which had no field of its own until now, and is the most dangerous of the four:
  valid JSON emitted *before* 64MB was reached survives inside the truncated stdout and parses
  cleanly;
- **process error** — nonzero or signalled;
- **envelope error** — `is_error: true`, which keeps exactly the meaning it already had.

A failed envelope is still *read*, and only for what it can honestly supply: **what the child cost**,
which was spent whatever the process then did (§3.5, F18), and **whether an allowance ran out**, which
the run needs in order to end `BUDGET` rather than `ABORTED`. Its `result` text is discarded, because
that is the field authority would come from. Guard denials stay visible on every path and never turn
a failure into a success.

**The machine-state git boundary is positional** (REVIEW F9, implemented at 0.178.0). The driver
promised to keep its own state out of the target's history and implemented that promise as a
hand-maintained list of filenames. `state.json`, `outcome.json`, `run.json` and the per-run archive
were each added *after* a live run had already committed them — three by the person who had
documented the hazard that morning — and when Codex looked, `oracle.json`, `capabilities.json` and
the mutation sandbox's `stryker.config.json` were still missing. Every artifact added since had been
trackable until somebody remembered, and a run that tracks its own `.meeseeks/` also makes the next
preflight refuse the repository.

Two lines replace the list:

```
.meeseeks/*
!.meeseeks/config.json
```

`.meeseeks/*` rather than `.meeseeks/`, and the difference is load-bearing: git will not descend
into an excluded *directory*, so a negation for a child of one is inert. Excluding the *contents*
keeps the carve-out effective. This is the same argument §6 already makes about writes — the rule is
a position, so an artifact added tomorrow is covered today — and retiring the list made seven
imports in `driver.mjs` unused, which is what a list being the only consumer of a name looks like.

`config.json` remains the one deliberate exception, because it is the run's settings rather than its
machine state. **That carve-out and §3.5's tracked-state refusal point in opposite directions**, and
the interaction is recorded rather than quietly resolved: `git add -A` will stage `config.json` in a
target that does not otherwise ignore it, after which preflight refuses the repository. Whether the
settings belong in the deliverable is an operator-owned product decision; `PLAN.md` item 63 carries
it for Codex.

**Every HTTP attempt has an absolute deadline** (REVIEW F4, implemented at 0.177.0). Both request
helpers resolved a successful response only on `end`, and the only bound was Node's socket
*inactivity* timeout — so a server that kept writing a byte every 50 ms was never inactive, the
request promise never settled, and the outer probe loop never reached its own clock. Measured: a
health endpoint that sent `200` and then wrote forever was not bounded by the configured probe
deadline at all, and killing the fixture produced an unsettled top-level await instead of a result.
The next bound outwards is `gateTimeoutMs` — **45 minutes** — and without an outer ceiling, none. A
nominal 30-second check could stall an unattended iteration indefinitely.

The timer now covers the whole attempt, headers and body alike, and is the smaller of the
per-attempt ceiling and what remains of the probe's own deadline. Response `aborted`, response
`error` and a premature `close` are ordinary failed attempts rather than silence, so the poll loop
either retries or gives up on its own clock. The body is capped **while receiving** rather than
accumulated and sliced afterwards, because a server that streams forever otherwise fills memory
forever — a second failure hiding behind the first. The remote smoke check uses the same mechanism:
a host that streams forever does so whichever side of the network it is on.

**The probe answers on the port it assigned, and on no other** (REVIEW F3, repaired at 0.168.0).
Between 0.113.0 and that version it followed the port the application's own *stdout* announced,
which settled the Tallyho smoke's two-masters conflict — the probe demanding an honoured ephemeral
`PORT` while a Playwright `webServer` config wanted a fixed URL — by promoting a hint to evidence.
The reproduction is unambiguous: a decoy HTTP server was started locally, and a probe child that
opened no socket at all and merely printed the decoy's URL was reported healthy. Printed output
establishes no ownership of a listener, and this is a required ship gate, so that was a false pass
against the nothing-defaults-to-pass invariant.

Three properties replace it:

- **Only the assigned port is polled.** An application that ignores `PORT` fails, and
  `portContractHint` still tells it exactly what to fix — the half of the old behaviour worth
  keeping, and the half that turned a stall into one repair iteration.
- **The two masters are reconciled the other way.** `--port` lets the *driver or operator* name a
  fixed port. That is a contract neither the application nor its stdout can forge, and an app that
  binds a fixed port passes when it is the port it was told to answer on.
- **The port must be free before the application starts, and the child must still be alive when it
  answers.** A stale development server holding the port would answer every request, so a child
  that exited or never bound could pass through it; the probe asks first and refuses rather than
  measuring somebody else's server. Nothing portable ties a socket to a process tree — `lsof` and
  `ss` are optional binaries with per-platform flags, and a gate that cannot run is a failure
  rather than a skip — so this is the ownership evidence a probe can actually establish, and it is
  described as that rather than as proof.

**A retried test is not a passing test** (REVIEW F30, implemented at 0.176.0). The Playwright
parser preserves the runner's whole-test `flaky` status deliberately, and the ratchet refuses to
credit it deliberately — a test that failed and then passed has proved nothing, and admitting it
would arm a hard reset that fires on noise. Nothing turned that refusal into a *failure*. Playwright
exits zero when every test is expected or flaky, so a **newly** flaky test — one with no earlier
ratchet identity to regress against — left every gate green and could reach the Panel and `SHIPPED`
while the run's own normalised evidence said the test had failed before it retried. Whether an
unstable test blocked a ship depended on whether the instability appeared before or after the
ratchet first saw it.

The reports are now parsed **once**, before anything scores or logs a gate, and the records are
collapsed across every accepted report by worst status: an id that passed in the unit report and was
flaky in the e2e one is flaky, because two runners disagreeing about one test is not evidence that it
passes. Any remaining `flaky` id adds one deterministic failed `test-stability` result, whose detail
names the ids sorted and bounded so the Builder receives a repairable objective rather than a wall of
text.

Three boundaries hold around it. `skipped` and `todo` are untouched — they are absences, not
unstable passes. A previously ratcheted id that turns flaky keeps its stronger treatment: it is
absent from the passing set, so it is a regression and a reset, not merely a gate failure. And
observing flakiness may still satisfy RED-before-GREEN history, because it shows a test *can* fail;
it never supplies current passing evidence.

**A ratchet id names a file inside the candidate** (REVIEW F20, implemented at 0.175.0).
`toPosixRelative` resolved a reported file and subtracted the root without ever asking whether the
answer was inside it, so a Vitest-shaped passing result naming `/tmp/outside.test.js` under root
`/repo` became the id `../tmp/outside.test.js::suite > works` — durable credit for a test whose
defining file is not part of the candidate and which a clean clone could never reproduce. A
misconfigured `include`, a globally installed fixture or a monorepo layout is enough; no hostile
runner is required.

Containment is now proved twice, because one check cannot see what the other can: **lexically** on
the resolved path, which catches `..`, an absolute path outside the root and a case-variant root;
and **through `realpath`** when the path exists, which is the only way to see a symlink inside the
repository pointing out of it. Drive-qualified and UNC prefixes are refused by shape on every
platform, because a report is a document that can have been written anywhere and a POSIX
`path.resolve` would fold `C:\x` into an ordinary filename. A path that does **not** exist is
accepted on the lexical rule alone — runners report virtual and generated files, and a nonexistent
path cannot be a symlink escape — but it can never be *outside*. The returned id stays the lexical
relative path, so nothing that already worked changed its identity, and spaces, Unicode, leading and
trailing whitespace and platform separators are preserved rather than folded.

A report naming an outside file is refused **whole**. Banking the rest would keep exactly the credit
the refusal exists to withhold.

**Every envelope the run bought is charged exactly once** (REVIEW F18, implemented at 0.174.0).
Two holes sat in the seam between "a child returned" and "the run knows it". The Oracle author's
result went from `runChild` straight to the parser without ever reaching `chargePreLoop`, so its
spend was absent from `alreadySpent`, from every ceiling the loop then checked, and from the final
bill — a run could begin below a token ceiling that pre-loop work had already crossed. And the
parallel Panel charged and adjudicated in one pass, so an early failure returned with later
reviewers' spend unrecorded even though every one of them had completed and been paid for: measured,
three reviewers returning 10/20/30 tokens and $1/$2/$3 after a 100-token builder produced an
`ABORTED` receipt of 110 tokens and $1.01.

The Panel now **conserves first and adjudicates second**: every settled envelope is charged in array
order, then declared-order adjudication runs against the per-index cumulative answer, which is
exactly what the interleaved loop computed. A later reviewer gains no verdict authority from having
been charged. The Oracle author is charged before it is parsed, like every other pre-loop phase.

The property to hold onto is the balance: the terminal receipt equals the sum of every envelope any
phase returned, whichever phases a run reaches.

**A report is evidence only if this attempt produced it** (REVIEW F16, implemented at 0.173.0).
The expected report paths are fixed — the toolchain declares them and every attempt writes to the
same ones — so a gate that crashed, timed out, or failed before writing left the *previous*
attempt's report on disk, and everything downstream read it as this attempt's. Codex reproduced the
worst instance against the ratchet's only permitted escape from a regression: the scoped restore
re-ran the gates, **discarded the result**, and trusted whatever report bytes existed. A failing unit
gate that wrote nothing let the previous passing report confirm the restore; the Driver logged
`scoped restore held`, skipped the full reset, and left `src/core.js` containing `broken`.

`gateTree` now removes the declared report paths before an attempt runs, and `scripts/reports.mjs`
reads back only regular files that are there afterwards. Absence therefore *means* "this attempt
produced nothing" rather than being inferred — no clock, nonce or mtime comparison is involved,
because mtime granularity is a filesystem property and a freshness test that can be wrong on a
coarse one is worse than none. A path that exists but is a directory or a symlink is refused rather
than read: it is not evidence, and following it would be reading whatever somebody else arranged.

The scoped restore reads its verification gate's **result** before it reads anything that gate
produced. A unit gate that failed, or that did not run at all, has verified nothing, and the run
falls through to the whole-tree reset exactly as it did before the narrow one existed.

**And a path the removal could not reach is a failed attempt** (REVIEW F32, implemented at
0.181.0). "Remove first, require presence after" only means something where the removal actually
happened. `clearReports` always returned the paths it could not remove, and the Driver logged them
and ran the gate anyway — so a locked or unwritable-directory *old passing* report survived, an
exit-zero gate declined to replace it, and F16's own argument then certified it as this attempt's.
That is the same laundering, arriving through the one door the repair left open, and it is the
branch that reaches the ratchet, red evidence and the scoped restore's confirmation alike.

The repair is structural rather than a rule each caller must remember. **Collection takes the
clear's outcome as a required argument**, so no caller can read a report without stating whether
its path was cleared, and a caller that supplies nothing — or a record that is not a clear outcome
— is refused rather than defaulted. The outcome is bound to the **paths**, too: a path the record
does not account for is uncleared, so an outcome for some other set cannot be handed in to satisfy
the signature and leave the guarantee nominal. Enumerating the call sites instead would have
re-opened the moment somebody added the next one, which is exactly how the guard hook's original
defect worked.

**And there is now one reader, where there were two.** `gateTree` read the same declared paths
itself, with `existsSync` plus `readFileSync` — which *follows a symlink* — while everything
downstream read them through `collectReports`, whose `lstat` refuses one. So a symlinked report path
was refused by the loop and read by the authority that writes red evidence, inside a single attempt.
Neither F16 nor F32 named this; adversarial review of the F32 repair did. Two readers of one
artifact will eventually disagree, and the fix is to stop having two rather than to teach the second
one the first one's rules.

Refusal is **the whole attempt, not the stuck path alone**. Ids collapse across every report by
worst status, so a survivor contributes passes the other files cannot contradict; and dropping only
the stuck path would hand the ratchet a set missing every id that path owned, which reads as a mass
regression and resets the tree. One re-run is cheaper than one false reset.

Withholding the evidence is only half of it, because an attempt whose evidence was withheld and
whose remaining gates passed would read as a clean iteration that merely collected nothing. So the
`report-freshness` gate **fails the attempt** and names the stuck paths, bounded, in a detail that
reaches both the operator's log and the builder's brief; and on a refused attempt nothing
report-derived runs at all. `recordRedEvidence` is the reason that last part is absolute rather than
tidy: it writes the baseline **exactly once**, so establishing it from a refused attempt would
freeze an empty baseline for the project's lifetime and leave every later test permanently unproven
— a gate the builder could not satisfy, which is the failure the baseline exists to prevent.

**A takeover claim must itself be reclaimable** (REVIEW F34, implemented at 0.182.0). Stale-lock
recovery is serialized by a second exclusive operation, so two contenders reading one dead lock
cannot each remove it and each create their own. That claim was a bare directory named from the
*stale* lock's token, and F1's argument for why an orphan was harmless — the next stale lock is a
different token, so the name never recurs — assumed the stale lock always gets replaced. Kill a
reclaimer between winning the claim and replacing the lock and neither happens: the token stays,
every later contender computes the same path, receives `EEXIST`, and reads it as a live reclaimer.
Measured with a real `kill -9`: three successive cohorts refused while no driver was running
anywhere. A recoverable stale lock had become a permanent denial of service.

The claim now carries what the lock carries — a pid and an owner token — written with the same
exclusive `wx` primitive, so serialization is unchanged and the artifact can finally answer who
holds it. A claim whose recorded process is **dead** is abandoned and is swept by an atomic
`rename` that exactly one contender can win, because the sweep needs its own arbitration or it is
the original defect one level down; the sweeper then retries, under a bounded attempt count that
refuses rather than looping. Only the owner may clear a claim, exactly as for the lock: the old
unconditional cleanup was safe only while nothing could legitimately replace the claim, and the
sweep makes replacement legitimate. Two states stay refusals that name the path rather than
becoming sweeps — a claim that will not parse (it may belong to something alive) and a directory
left by a driver before 0.182.0 (which may be a live reclaimer of that version).

**The test that guarded this was measuring the wrong property.** Its contenders exited the instant
they won, so a later contender read a genuinely dead owner and reclaimed correctly — two sequential
winners, which is the system working, and indistinguishable in that assertion from the simultaneous
double-take F1 is about. Racing both module versions under CPU load, 40 rounds of six contenders:
12 multi-winner rounds before the repair and 2 after, so the flake was pre-existing and an idle
machine had been hiding it. A winner now holds the lock across the decision window, which puts every
loser's liveness check against a process that is still running: 0 multi-winner rounds on both
versions under the same load.

**A verdict is sealed to the bytes it was formed over** (REVIEW F14, implemented at 0.172.0).
Gates and the Panel inspect the live working tree, and the loop then ran `git add -A` and committed
whatever bytes existed at that later moment. Codex had a reviewer read `src/a.js` as `reviewed
bytes`, a concurrent write change it to `changed after review`, and `driveRun` commit the latter and
return `SHIPPED` — a cold verdict authorising code no reviewer and no deterministic gate ever saw.
That needs no hostile double: a successful Builder can leave background descendants, and an
operator's editor writes to the same tree.

The identity is `workspaceHash`'s — tracked files plus untracked-but-not-ignored ones, hashed from
their real bytes, which is the same first-party view the gate cache already trusts to decide whether
a deterministic gate may be skipped. It is captured **after the gates and before the first
reviewer**, and rechecked after every panel, immediately before the commit, and again once the
commit has landed. Any drift discards the verdict, commits nothing, and sends the iteration back
through the gates; a drift discovered after the commit leaves the work banked but withholds the
deploy and the tag, because that commit is not the reviewed tree. The identity is recorded in
`review.json` and `outcome.json`, so a record says what was decided *and* what it was decided over.

Two fail-closed edges: a tree that cannot be hashed — a deletion, a broken symlink, an unreadable
path — collapses the identity to `null`, which never matches, including another `null`, because two
things nobody could measure are not evidence of being the same thing; and `driveRun` refuses to
start without a way to identify the workspace at all. Ignored paths stay outside the seal by the
same argument the gate cache makes: `.meeseeks/` is driver-owned machine state the driver writes
during every review, and a seal that fired on its own bookkeeping would discard every verdict this
product forms.

**The specification a run is judged against is captured once and cannot move** (REVIEW F12,
implemented at 0.170.0). The Driver read `PRD.md`, derived `requiredIds`, and kept only those
strings; the Builder holds unrestricted repository writes and the cold Panel is told to read the
*live* file. Codex replaced the text of `PRD-1.1` with an easier requirement, kept the id, and
watched gates pass, the report pass, and `driveRun` return `SHIPPED` — an independent Panel
faithfully certifying the wrong specification. Stable ids do not preserve stable intent.

`scripts/specification.mjs` captures the canonical revision after the PRD commit and before the
Oracle, the design phase, the Builder or the Panel has read a line of it, recording file, digest and
size in `.meeseeks/specification.json`. The digest is of the **exact bytes**, because a byte that no
parser would notice still changes the document a reviewer reads. The capture hands its bytes back,
so `requiredIds` are derived from the document that was digested rather than from a second read of a
path — two reads is how an identity becomes a coincidence.

`driveRun` then checks the working copy against that revision at two boundaries: after the build and
the race and **before the gates**, so no gate result, ratchet credit or panel verdict is ever
attributed to a document the run did not start against; and immediately **before a ship**, because a
ship is a claim about a specific document and the panel's own reads, the deploy and the ship-time
mutation gate all run beside a writer. Drift ends the run `ABORTED` with an operator-facing message
naming both digests and asking for a new run against the revised objective — never a silent repair,
because the changed file may be exactly what the operator wants. The check is a **required** effect:
`driveRun` refuses to start without one, since "assume unchanged" is the defect with a shrug
attached. Only the captured file is bound; documentation, design documents and source stay editable.

**A citation is resolved against the tree that was reviewed** (REVIEW F6, repaired at 0.169.0).
The parser establishes that evidence is *shaped* like `path/file.ts:LINE`; until this version
nothing established that it pointed at anything. Codex's reproduction is one line: a report citing
`does/not/exist.ts:999999` parsed with no problems, `parseReviewerReport` returned `pass`, and
`combinePanel` agreed. Downstream pinning was best-effort by design — a missing file skipped the
pin, an out-of-range line pinned the whole file — so a hallucinated, stale or traversal-based
citation could satisfy the cold Panel contract and reach `SHIPPED`. "Evidence required" had become
"evidence-shaped text required".

`scripts/evidence.mjs` is the boundary, applied by the Driver between parsing and combination, to
every panel report and to the carried report. A passing citation must resolve, inside the exact
candidate root, to a readable regular file and a positive, in-range, non-blank line; absolute paths,
`..` traversal, directories, and symlinks escaping the root are refused, the last of these by
comparing after `realpathSync` because no string check can see it. An entry that does not resolve
becomes `fail` before it can be counted, recorded, pinned or carried. Actionable advisory evidence
gets the same boundary pointed the other way: it cannot flip anything to pass, so an unresolvable
location stops being actionable rather than being deleted — the harm there is sending the builder to
a file that is not there.

The parser stays pure, deliberately. It judges a *document*, and every hostile-report test drives
it; only the Driver knows which tree the document is supposed to describe. And the line number
remains a **locator** — content identity is still the durable pin (§4.3), so evidence that moved
down a file has not been lost.

**Reviewer parser rules (unchanged, still non-negotiable):**
- Default `fail`. `pass` requires the reviewer to *personally locate* the code and cite
  `path/file.ts:LINE`. "Probably exists" / "structure suggests it" = fail.
- Every DoD line and every PRD requirement gets an entry. Missing entries invalidate the
  audit.
- **A passing test is not evidence.** If a requirement is supported only by a test's
  existence, read the test; if it asserts truthiness/non-null without checking the expected
  value, mark the requirement `fail`.
- **Check the negative case** for anything auth/roles/access. A route working as admin
  proves nothing; grep for the guard.
- Read-only tools. Report, don't fix.
- A requirement marked `pass` with no `evidence` is flipped to `fail` before counting.
- `verdict` is `pass` only if every entry is `pass`. No partial credit.

Output contract:

```json
{
  "verdict": "pass" | "fail",
  "requirements": [
    { "id": "PRD-3.2", "status": "pass", "evidence": "src/api/admin.ts:41", "detail": "role guard checks session.role before handler" },
    { "id": "DoD-2-security", "status": "fail", "evidence": null, "detail": "no rate limiting; grepped rateLimit|throttle|limiter across src/, no matches" }
  ]
}
```

### 4.1 Advisory findings — the one place a number is allowed

Reviewers see real problems that no id covers: a module doing two jobs, an error path nobody
reaches. Those arrive as entries whose id begins `advisory-`, carrying `severity`
(`trivial`/`minor`/`major`/`critical`), `confidence` (0–1), the same mandatory `file:line`
`evidence`, and an optional `repairHint`.

The rules exist to stop this becoming a probabilistic verdict:

- **Compliance is never confidence-weighted.** PRD requirements and DoD lines are
  deterministic blockers whatever number is attached to anything. Advisories cannot move
  `verdict` in either direction — they cannot hold a compliant build back, and they cannot
  push a failing one through.
- A required id that arrives wearing an `advisory-` name is **still required**. Compliance
  wins the tie, so a reviewer cannot demote a DoD line by renaming it.
- An advisory becomes *actionable* — carried into the next Build Brief as a suggestion —
  only with real `file:line` evidence **and** a confidence at or above
  `advisory.minConfidence` (§10). Below it, the finding is recorded and no work is done
  about it. A low-confidence hunch fed back as work is how a loop spends its last iterations
  chasing an opinion.
- Because advisories never gate shipping, they can only ever be addressed on an iteration
  that was failing for some other reason. That is the intended ceiling on their cost.

### 4.2 Which gates apply — the capability table

Not every gate means something for every project. `npx playwright test` used to run on
everything, including projects with no browser to drive; on a CLI or a library it failed on a
missing config rather than on a defect, and since nothing defaults to pass, **such a project
could never clear Phase 3 at all**. The gate was not catching a fault. It was reporting the
absence of something the project was never meant to have.

`scripts/gate-policy.mjs` is a table — not a rules engine — mapping every gate to either
"universal" or a list of capabilities (§3.7), each with a written reason:

| gate | applies to | why |
|---|---|---|
| `build`, `lint`, `types`, `unit`, `security-audit` | everything | producibility, a configured static check, the ratchet's own source of ids, and a known-vulnerable dependency are all defects regardless of shape |
| `ci`, `docs`, `red-evidence`, `integrity` | everything | the validation set must run somewhere other than this loop; every shape has a public surface to describe; an always-green test is unproven; a gate is worth running only while its config still means something |
| `e2e` | `web-ui`, `desktop-ui` | the runner drives a browser, and a CLI has none |
| `observability` | `api`, `network-service` | the gate asks a health endpoint to answer a real request; a CLI's exit code is its health check |

Two rules stop this becoming a way to switch gates off.

**Universal is the default.** A gate absent from the table *runs*. Forgetting an entry makes a
gate over-apply, which is recoverable; a test asserts the table covers every gate the toolchain
registry and the static set can produce, so the omission is still caught.

**A skip is announced, never silent.** Every skipped gate is printed to the operator with its
reason and listed in the Build Brief as `does not apply - …`. A builder that cannot see why
`e2e` is absent will helpfully add it back, and a gate list that quietly shrinks from ten
entries to eight reads exactly like one that always had eight.

**A universal gate may still have conditional contents**, and missing that cost a run. `ci` is
universal and stays universal — the validation set has to run somewhere other than this loop —
but *which steps* it demands comes from `toolchain.ci` (§3.8), and that list required a
Playwright step unconditionally. So on an `api` project the loop declined the `e2e` gate with a
written reason, printed it to the operator, and then failed the `ci` gate for not running the
very step it had just called inapplicable. **No honest workflow could satisfy it.**

That is the same defect this section opens with, one level down: a gate reporting the absence of
something the project was never meant to have. It survived because the earlier fix filtered the
gate *table* and not the CI *command list*.

What it produced is worth recording, because it is the clearest evidence in this project of how
an unsatisfiable gate actually fails. The builder did not stall — it complied. Dogfood run 2's
`.meeseeks/assumptions.json` has it reasoning about the contradiction in the plugin's own brief and
resolving it by adding `npx playwright test` under `continue-on-error: true`, a step that cannot
fail. Run 3's cold panel then reported that step as *"a step that always reports success by
construction"*. The loop manufactured the defect it caught, and both halves worked exactly as
designed while doing it.

`inspectCiWorkflows` now filters the required operations through the same `gateApplies` table.
The exclusion is reported in the gate's own detail — `not required here: e2e (…)` — for the
reason the skip rule above gives: `running build, lint, types, unit` alone cannot be told apart
from a project being let off a fifth step. **Omitting capabilities filters nothing**, so a caller
that forgets over-applies CI rather than silently dropping a required step, and a structural test
asserts every call site in the driver passes them — the wiring is unreachable from a unit test,
because `gateTree` lives inside `main` and `driveRun` takes `gates` as an injected effect.

Note what is *not* here: `quality:impeccable` keeps its own detection-based arming (§5.1),
because it asks whether there is a UI to inspect right now, which is a question about the tree
rather than about intent.

### 4.3 Pins — the second and third monotonic properties

The ratchet is monotonic on **test ids**. That closes oscillation on the one property the loop
can measure for free, and says nothing about two others that degrade just as quietly.
`scripts/pins.mjs` is the same mechanism pointed at both, and `.meeseeks/pins.json` is driver-owned.

**Security elements (A4).** SCAFFOLD-CEGIS (arXiv 2603.08520) reports that security degrades
*gradually across iterations* through specification drift — 43.7% of ten-round chains ended
more vulnerable than baseline — and that adding a static SAST gate made it **worse**, 12.5% to
20.8%, because static rules cannot see removed defensive logic or weakened exception handling.
Meeseeks had exactly the shape they measured: `npm audit` plus a security auditor, per iteration,
with no memory. When the security reviewer passes an id with `file:line` evidence, that line is
pinned as a defensive element.

**Requirements (A8).** A requirement a cold reviewer passed with `file:line` evidence is pinned
to that file, so a later panel can tell whether the ground it was passed on has moved.

Same shape, opposite failure directions, and that difference is the design:

| | fingerprint | when it stops matching |
|---|---|---|
| security element | the **snippet**, whitespace-normalised | escalate; may become a regression |
| requirement | the whole **file** | unpin, and re-establish from scratch |

**The pin store must never be tracked by git**, and it was. `ensureMeeseeksIgnored` listed
`state.json`, `lessons.json`, `red-evidence.json`, `bloopers.log` and the reports, and omitted
`pins.json` — the file holding **two** of the three monotonic properties. Tracked, a
`git reset --hard` to `lastGoodCommit` restores an older copy, so a pin earned since that commit is
silently gone, and so is any recorded quarantine, which is the only thing stopping a run shipping
over lost protection. It is precisely the failure the ignore stanza's own comment describes for
`state.json`, in the file where a false negative is unrecoverable.

Two defects, not one: the *list* was short, and the *check* asked only whether `.meeseeks/state.json`
appeared. So a repository written by an older build reported "already covered" forever and never
received the newer lines. **An all-or-nothing check on a list that later grows stops covering its
own list.** Every path is now checked individually and only the missing ones are appended, which
repairs an existing repository and stays idempotent. Found by running `git ls-files .meeseeks` on a real
repository before deliberately triggering a reset in it.

**Why a security pin escalates instead of resetting.** Re-verification is a substring search
over code the builder may reformat at any chaos level above 1. "Ambiguity is a fail" converts a
formatter run into a hard reset plus a regression objective the builder **cannot satisfy** — it
is told to restore something that was never removed, and under monotonicity a false pin is
unremovable. That is not a strict design; it is a run that cannot terminate.

So the authority that pins is the authority that unpins. The cheap check runs every iteration
and finds a guard that merely moved or was reindented, for free. Only when it fails does one
`security-escalation` child, scoped to that single element, choose between three answers:

- **removed** → regression. Hard reset, regression objective, nothing else proceeds.
- **moved** → re-pin at the new location. No reset.
- **cannot tell** → quarantine: recorded, surfaced, excluded from further re-verification.

Fail-closed here is **`unknown`, not `removed`**. An unparseable escalation is not evidence a
guard was deleted, and treating it as one would destroy the tree over a parsing failure.

**Quarantine is not a pass, and one line of code is what makes that true.** A run may not reach
`SHIPPED` while any element is quarantined. That converts dropped protection from something a
run absorbs silently into something it has to resolve, and it is the whole difference between
this and a threshold that drifts.

**Why a requirement pin is fail-closed in the other direction.** A carried pass is a review that
did not happen, so invalidation is eager: any change to the evidenced file unpins, ambiguity
unpins rather than carries, and an evidence target that no longer resolves **fails** — the panel
verdict is overridden downward, which is the only direction a pin may ever move one. The Ralph
design where the *builder* marks its own stories complete is what this must not become, and the
distance is that nothing here is written by a builder: the store is driver-owned and §6 denies
every write under `.meeseeks` positionally.

**A run with pins it cannot re-verify aborts.** Carrying them forward unchecked would report the
same clean pass as a run that verified everything, which is §4's own rule about silent skips.

> **Built (0.92.0): carrying a pass to skip a reviewer call.** A8's saving — asking the panel
> only about un-carried ids — is wired as `narrowedPanelPlan` plus a synthetic `carriedReport`,
> and `panelCarry.enabled` defaults to on (§10). It is a pre-filter only: a narrowed panel that
> returns `pass` triggers the full panel, which decides. The delta was measured in `panelB`:
> carrying 9 of 16 requirements cut review tokens by **8.3%** (1,402,476 → 1,285,670) and wall
> clock by 28.5% — small, because a cold reviewer's cost is the *read* rather than the id list,
> so the saving does not scale with the number of ids carried.

### 4.4 The conditional second pass — mutation testing

The most load-bearing DoD claim is "tests assert real values, not truthiness". §4 now enforces
the lazy *shape* deterministically through `gate-integrity`, but a test can name a value and
still be insensitive to the code. Mutation testing is the check that cannot be talked round:
mutate the source, and a test that still passes was proving nothing.

It does not fit the flat gate list, and forcing it in would have been the wrong shape twice
over. It is slow, so running it beside `build` on an iteration that does not compile spends
minutes to learn what `build` already said. And its verdict is **not monotonic** the way the
rest of Phase 3 is — surviving-mutant counts vary with which files changed, so two green
iterations can disagree without either being wrong.

So there is a second pass, and that ordering is the whole of the change:

- `GATE_OPERATIONS` runs exactly as before, and a failure there costs nothing extra.
- `CONDITIONAL_GATE_OPERATIONS` runs **only if every gate in the first pass passed.**
- A conditional gate is still a gate. It fails the iteration exactly as any other does; it is
  simply not asked until asking is worth the time.
- **Mutation results stay out of the ratchet.** It is a pass/fail gate producing no test ids.

**The runner's plugin has to live where the runner looks.** Stryker resolves test-runner plugins
relative to its *own* installation, and `npx --yes @stryker-mutator/core` puts that installation
in npm's npx cache. `@stryker-mutator/vitest-runner` was therefore invisible **whether or not the
project had installed it** — dogfood run 3's project had it in `node_modules` and Stryker still
died with `Cannot find TestRunner plugin "vitest". In fact, no TestRunner plugins were loaded`, an
uncaught error rather than a gate result. **No project could ever have passed this gate**, and it
ended run 3 twice. Naming both packages with `-p` and invoking the `stryker` bin puts the plugin in
the same sandbox as the core that looks for it; measured on a project with vitest and no Stryker at
all, the plugin loads, mutants run, the runner finds the *project's* vitest, and the driver-owned
threshold still forces the failing exit code.

**The threshold is a floor, and it was `100` until a measurement said otherwise.** The threshold
exists at all because Stryker's default is `null`, meaning surviving mutants exit 0 and the gate
cannot fail. `100` made it able to fail, and the original reasoning was sound on its face: the
question is "did a mutant survive", not "is the score good enough", and a percentage is a threshold
that can drift — which §13 rejects by name.

It could not survive the first time the gate actually ran, which was only possible after the
runner-resolution fix above. Measured on the simplest module available — one two-branch function
with two tests that genuinely exercise both branches — the score is **83.33**, failed by `100`. The
survivor was an `EqualityOperator` mutation (`a < 0` → `a <= 0`) that a correct suite need not kill
and that says nothing about whether the tests prove anything. `100` was therefore not a strict gate
but an **unsatisfiable** one, which is the defect class this section keeps returning to.

**`break: 60`, and both directions are measured.** The honest suite above scores 83.33 and now
exits 0. A suite asserting only `typeof add(1, 2) === 'number'` scores **16.67 and exits 1**, naming
the threshold — so the gate still catches exactly what it exists for, a suite insensitive to its own
code. The drift objection is answered by ownership rather than by the number: the config is written
by the driver into `.meeseeks/`, so the builder cannot negotiate it, and moving it takes a commit with a
measurement attached. **If you change it, record what you measured.**

**The operation context gains the changed-file list**, so a gate can scope itself — and the
baseline is the last **ratchet-advancing commit**, not the last iteration. That difference
decides whether the scoping means anything: a regression iteration changes only the repair, so
a diff against the previous iteration would hand the gate an almost-empty set and it would
report a clean pass over nothing. With no baseline at all the list is empty, the operation
declines with a stated reason, and nothing pretends to have checked.

**The threshold is driver-owned, and finding out why was the work.** Stryker exposes
`--dashboard.*` flags but **no `--thresholds.*` flag at all**, and `thresholds.break` defaults
to `null` — so a run with surviving mutants exits **0**. Measured against Stryker 9.6.1 rather
than read: a fixture with two survivors exited 0 with no config, and exited 1 with a config
carrying `break: 100`, naming the reason. The failure condition of this gate therefore lives in
a *file*, and had that file been the project's, **the builder would own whether the gate can
ever fail** — which is the defect that deferred the held-out oracle (§A3). `stryker run` takes a
config path positionally, so the driver writes `.meeseeks/stryker.config.json` and passes it. §6
denies the builder every write under `.meeseeks`, positionally, so the threshold is out of reach.

`break: 100` rather than a percentage, because the question is "did any mutant on the changed
code survive" and not "is the score good enough". A percentage is a threshold, and thresholds
drift — which §13 rejects by name.

Tests are never mutated. A mutated test is an oracle turned into a lie.

---
### 4.5 `DoD-6-adversarial-input` — the line that was bought with a ship

Every other DoD line asks whether the code does what it was told. This one asks whether the
code **lies**, and it exists because dogfood run 9 proved that nothing else in this document
can ask that question.

**What happened, because the mechanism matters more than the defect.** Run 9 shipped
`panel unanimous on 15 requirement(s)`, 0 quarantined pins, the ratchet at 58. The binary
reports statistics over *half* its input when a quote is left unterminated, at exit `0`, with
an empty stderr. The same defect run 8 shipped, on the same PRD.

**The panel was not asleep. The panel found it.** All three cold reviewers found it
independently, **each ran the program themselves**, and each returned `status: fail` citing
`src/csv.ts:21` — one at severity `major`, confidence 0.95, quoting the input and the output it
produced. 0.58.0's widened remit worked exactly as specified.

They filed it as `advisory-`, and §4.1 says an advisory cannot move the verdict in either
direction. So the run shipped over three independent, executed, evidenced findings of a
confidently wrong answer.

**They filed it there because there was nowhere else.** The output contract has two channels: a
verdict on a *required id*, or an advisory. No required id covered it — the PRD never mentions
unterminated quotes, and `PRD-2.1` (quoted fields containing commas, doubled quotes and
newlines) is genuinely, correctly satisfied. **A reviewer obeying the contract had exactly one
place to put the finding, and it was the place that cannot block.**

The lesson is not about reviewers and not about advisories. **A remit is not a channel.** 0.58.0
told the panel it *may* fail a demonstrable wrong answer without giving it an id on which to do
so, and permission with no place to act is indistinguishable from no permission at all. When
widening what a reviewer may judge, check that a required id exists to carry the answer.

Three properties make this line work rather than merely exist:

- **Required, not advisory.** It is in `requiredIdsFor`, so every panel member who owns it must
  return an entry, and a `fail` blocks. Owned by **correctness** — it is a truthfulness question,
  and that reviewer already executes the binary.
- **The bar is narrow and absolute: a wrong answer at exit 0.** A crash is not a failure of this
  line, and neither is a non-zero exit with a diagnostic — those are the program *refusing to
  lie*, which is the behaviour being required. Silence plus a plausible number is the defect. A
  wider bar would fail every program that has any bug at all, and §4.2's whole history is gates
  that no honest project could satisfy.
- **A pass must name what was tried.** "I probed and found nothing" with no stated input classes
  is a skipped check wearing a verdict, and the parser's own rule is that missing evidence fails.

**What this does not do**, said plainly so nobody reads it as more than it is: it is a *judgment*
line, not a gate. No exit code enforces it, it is exactly as good as the reviewer executing it,
and it can be satisfied by a reviewer that probes lazily. It is strictly better than the advisory
channel that discarded three correct findings, and strictly weaker than a deterministic check —
which for this defect class does not exist, because "is this number right" is the oracle problem.
`gate-integrity` cannot see it, the mutation gate cannot see it (the tests are insensitive to
inputs nobody wrote), and neither can any linter.

### 4.6 The held-out oracle — the only check not downstream of the builder

**Every other check in this document is downstream of the thing it judges.** The gates run what
the builder wrote. The ratchet protects ids the builder named. The mutation gate mutates the
builder's source against the builder's tests. `gate-integrity` reads scripts the builder authored.
Even the cold panel reads a repository the builder shaped. A mistake shared between an
implementation and its own tests is invisible to all of them.

**Run 12 measured exactly that, and it is the reason A3 stopped being deferred.** The panel
passed a binary reporting `mean: 0` where the true answer is 1/3, at exit 0. The reviewer was not
lazy: it wrote an independent reference parser and summariser *from the PRD and data model* and
differentially fuzzed **110,877 cases** against it. It could not have found the defect. The
reference was derived from the same documents, so a property those documents never mention —
floating-point associativity — is invisible to **both** implementations equally.

**A differential fuzz against a reference built from the same spec is not an independent oracle.
It is the same assumption, twice.**

So `.meeseeks/oracle.json` holds executable acceptance cases authored at **Phase 0b** — from the PRD
alone, **before the design phase and before any code exists.** A child that has seen the code
cannot write them.

**The store belongs to one run and one specification** (REVIEW F8, implemented at 0.171.0). It used
to survive into the next run: it was authored only when absent, it was not in the per-run archive
list, and it was not in the machine-state ignore list either, so a second objective in the same
repository could execute the first one's held-out cases and report a clean pass that established
nothing — the one gate whose entire value is independence, quietly judging something else. Its
writer was a direct overwrite, so a kill mid-write left a corrupt file whose mere existence stopped
the driver re-authoring.

Four things close it, and each is separately load-bearing:

- **Archived with its run**, so the ordinary second-run case finds nothing to reuse and authors
  fresh from the current PRD.
- **Bound to §4's captured specification digest**, which is the independent second proof for a store
  somebody put back: a store authored from another revision, or one that records no revision at all,
  is a failed gate rather than a reused one, and no case is executed.
- **Written temp-and-rename**, so a reader gets the old complete store or the new one and never
  partial JSON.
- **Ignored, store and scratch directory both.** Tracked, the target's own history would carry the
  cases the builder is never shown.

PRD-only, no-tools authoring is unchanged: the repair never re-authors from implementation
context.

**That requires tool availability to be restricted, not merely unapproved.** Every non-Builder
role has a closed built-in tool set; Oracle-author has none. Claude Code's `--allowedTools` changes
approval only, while `--tools` controls which built-ins enter the model context and `--tools ""`
disables them. Inherited MCP/settings surfaces must not reopen the set. Current 0.164.0 models the
policy only as `allowedTools`, omits the flag for Oracle-author's empty list, and therefore does not
establish the no-repository-context guarantee. REVIEW F27 / PLAN item 82 own the exact availability
policy and pinned live evidence.

**Held out means *not supplied*, in §6.1's sense, and the distinction is stated rather than
implied.** The store is under `.meeseeks/`, so §6's positional rule makes it driver-owned and a
builder may not write it. It is never rendered into a brief, a system prompt or a review prompt.
That second half is a **discipline, not a barrier** — a builder executing arbitrary code can read
the file, and `oracle.mjs` says so in its own header. Against satisficing, which is the threat
model this whole document aims at, an artifact the builder was never handed is entirely
sufficient: **it cannot build to a test it has not been shown.**

**A3's deferral reason no longer holds.** It was deferred because "the builder would own whether
the gate can fail" — the same objection §4.4 faced with Stryker's threshold, and answered there by
writing the config into `.meeseeks/` and passing it positionally. The same move applies.

Four properties, each load-bearing:

- **Everything fails closed.** A missing, unreadable or empty store fails the gate; failure to
  author ends the run. A store that cannot be read is the one shape that looks exactly like an
  oracle everything passed.
- **A case that asserts nothing is refused at parse time.** It would execute, check nothing and
  report success — the "test that cannot fail" of §4, reproduced *inside* the check built to be
  independent of the builder's tests.
- **Invocation resolves through `package.json` `bin`**, because that is what a user runs. Run 10
  found a build whose declared bin was **inert** — zero bytes, exit 0, through a real
  `npm install -g` — while every gate stayed green, each having invoked `node dist/cli.js`
  directly. A project with no declared bin fails by name rather than having a plausible-looking
  file guessed for it.
- **`cli` only.** Invoking with argv and comparing stdout is a command-line shape; arming it on an
  `api` or a `library` would be a gate that cannot pass, which is §4.2's defect class.

**It is off by default (`oracle.enabled`), and that contradicts §13's rejection of `enabled`
flags — deliberately.** §13's argument is about disabling a check *known to work*. This one was
staged behind a flag because its feared failure mode is the worst available here: **a case that
invents a requirement the specification does not decide becomes a gate the builder cannot satisfy
for the rest of the run, and the builder cannot tell an invention from a real requirement.** That
class has bitten seven times. It has since been armed against real builds, and the fear did not
materialise: `oracle1` judged **19 of 19** on a case-G target at a false-failure rate of **0**,
and `oracle2` (14 August) ran the metamorphic relations against real generated code, where they
caught real numeric defects, drove a fix, and passed at ship with zero false failures. What
`oracle1` also measured is why the default has not yet flipped: its exit-code-only cases could
not see run 12's defect class even when that defect was planted back into the tree — the
relations are the half that can, and they have one live run behind them. The flag remains a
staging device, not an escape hatch. `templates/oracle-author.md` aims squarely at the invention
class: when the specification is silent, the author is told to leave the case out and say so.


## 5. Quality-plugin auto-install (the "install plugins like impeccable" line)

**Goal:** the design/build phases should stand on the shoulders of existing quality
plugins rather than reinventing linters and reviewers. During Phase 1, the driver installs
a curated, config-declared set of plugins so their hooks and skills are active for every
subsequent iteration.

- `.meeseeks/config.json` → `qualityPlugins: ["impeccable", ...]` (a list of plugin refs /
  marketplace entries).
- Driver runs the install step idempotently before the loop; already-installed plugins are
  skipped. Failure to install a *required* plugin aborts with `ABORTED` (we don't silently
  drop a DoD contributor). Optional plugins warn and continue.
- Where a quality plugin exposes a gate command, it becomes a Phase-3 gate; where it
  exposes only guidance/skills, it informs the builder and reviewer.

### 5.0 The other detectors, and why they are detectors

`qualityPlugins` defaults to `["impeccable", "knip", "semgrep", "schemathesis"]`. All four are
**deterministic CLIs with exit codes**, because Phase 3 is defined as exit codes and no LLM.
A model-based quality plugin cannot go here: the panel already supplies three opinions, and
the thing a gate adds that an opinion cannot is that it may not be talked round.

- **knip** — dead files and unused dependencies. The builder brief forbids gold-plating
  ("no abstraction with one caller"); nothing checked it. Scoped to `--include
  files,dependencies` on purpose: knip's unused-*exports* analysis is its noisy half, and on
  a young codebase an export with no caller yet is ordinary rather than wrong.
- **semgrep** — static analysis over first-party source. `security-audit` is `npm audit`,
  which inspects **declared dependencies only** and has nothing to say about code written
  thirty seconds ago. This is the detector half of §14's open question.

impeccable is `required: true` — failing to provision it kills the run, because it carries a
DoD line. knip, semgrep, and schemathesis are optional and degrade to a warning: semgrep needs
`python3`, and none is worth killing a run over on a machine that lacks it.

**Detection and direction are different halves of DoD line 5, and only one can be a gate.**
impeccable answers "is this choice wrong"; nothing deterministic can answer "is this choice
*distinctive*", which is the failure mode of generated UI. `templates/frontend-direction.md`
(adapted from Anthropic's `frontend-design` skill) is appended to the builder's system
prompt by `builderSystemPrompt`, and only when `hasFrontend` is true — re-asked each
iteration, for the same reason the gate is.

Its **principles** are taken and its **workflow is not**. The source prescribes
brainstorm → explore → plan → critique → build. This loop already owns the process, and a
second process in the same prompt yields a builder that redesigns instead of shipping while
the ratchet charges it for every test written along the way.

It is *appended*, never inherited, and that is the load-bearing part. A `claude -p` child
picks up whatever skills the operator happens to have installed, so guidance acquired by
inheritance would make a build depend on the machine it ran on. §10 already forces
`outputStyle: default` to stop a persona leaking into a build; the same argument applies to
skills, and only what is appended here is versioned with the plugin. **The general problem —
that builder children inherit the operator's whole skill surface — remains open.**

**Accessibility is deliberately not a gate.** `@axe-core/playwright` assertions belong
*inside* the Playwright specs, which the builder brief now requires for every page. A gate
would report what is red today; a named Playwright test enters the **ratchet**, so a page
that has ever been clean may never quietly stop being clean for the rest of the run. That is
a stronger guarantee than a gate, obtained by reusing the machine already built.
`eslint-plugin-jsx-a11y` covers the static half inside the existing lint gate.

### 5.1 impeccable — the flagship entry (confirmed)

[impeccable](https://impeccable.style/) is a frontend design skill/plugin (1 skill, 23
commands, a 58/59-rule "AI slop" detector). It plugs into `meeseeks` in three places at once:

- **Install (Phase 1):** `npx impeccable install` (requires **Node 22.12+**), or in Claude
  Code add the marketplace and install via `/plugin`; first run is `/impeccable init`.
  `plugins.mjs` runs this idempotently before the loop.
- **As a Phase-3 gate:** impeccable ships a CI CLI — `npx impeccable detect src/` — with
  **deterministic rules, JSON output, and exit codes**. This is wired directly as a gate
  (`quality:impeccable`). Exit non-zero = iteration fails before review, same as lint. This
  is the deterministic half of DoD line 5 (§4).

  **Arming is decided per iteration, not at provisioning.** This is a correctness point that
  was wrong for four versions. Provisioning runs once, after Phase 1 and before the first
  build, when the repository holds a PRD and some design docs and **no code**. Asking
  `hasFrontend` there answers "no" for a React application that has not been written yet, so
  the gate was disarmed for the whole run — on a greenfield build, which is the primary use
  case. `installQualityPlugins` now *carries* `frontendOnly` and the driver re-evaluates it
  against the tree each iteration. The §5.1 carve-out below is unchanged; it is merely asked
  at a moment when the answer can be true. (`hasFrontend` itself now lives in
  `capabilities.mjs` as the `web-ui` detector — §3.7.)
- **As build-time guidance:** impeccable's Claude Code build installs **hooks + a
  subagent** that inspect each UI edit and feed findings back mid-build, plus commands the
  builder can invoke (`/impeccable polish`, `/impeccable audit`, `/impeccable distill`,
  `/impeccable typeset`).

**Two integrations worth doing because impeccable already speaks these files:**
- impeccable reads **`PRODUCT.md`** for context on every command. Phase 0 already produces
  the PRD, so Phase 1 also emits a short `PRODUCT.md` (users, mode, brand voice,
  anti-references) so impeccable designs with real context instead of defaults.

**`PRODUCT.md` and `.meeseeks/capabilities.json` are split by question, not by file, and nothing
that decides pass or fail may read `PRODUCT.md`.** The manifest owns what the software *does*:
a closed vocabulary, driver-owned, machine-read, and it arms gates (§3.7, §4.2). `PRODUCT.md`
owns who it is *for* and how it should feel — users, mode, brand voice, anti-references. It is
prose, it is impeccable's, and it lives in the target repository. No fact appears in both.

The read rule is what keeps that from eroding. A gate consulting `PRODUCT.md` would make it a
second source of gate truth in a format **no vocabulary constrains and no test covers**:
`parseCapabilityDeclaration` refuses a word outside the ten, and prose refuses nothing. A
test walks `scripts/` and asserts no shipped module so much as names the file — the same
guarantee, and the same argument, as §7.1's no-reader rule for the run manifest.
- `/impeccable document` writes **`DESIGN.md`** (Google Stitch format) as the portable
  visual system. Phase 1 runs it so the design system is captured and becomes a reviewer
  input for DoD line 5.

**Two caveats to respect:**
1. **Frontend-only.** impeccable's detector is about UI. For a pure API/backend/CLI
   project the `gate:design-slop` gate is **skipped, not failed** — the driver detects
   whether the repo has a frontend (presence of a UI framework / `src/` components /
   `index.html`) and only arms the gate when there's something to look at.
2. **`DESIGN.md` is impeccable's file in a *target app*.** In generated apps, `meeseeks` keeps
   its own design output under `docs/` (`architecture.md`, `api-contract.md`,
   `data-model.md`) and leaves the repo-root `DESIGN.md` to impeccable. (This repo's own
   `DESIGN.md` — the file you're reading — is the plugin's design and is unaffected.)

---

## 6. The guard hook — the limit that survives permission-skipping

The builder runs with `--dangerously-skip-permissions`. That's the premise. PreToolUse
hooks fire **regardless** of permission mode, which makes them the only reliable place to
put a limit when everything else is off.

**Deny categories:** `protected-state` (anything under `.meeseeks/`, positionally),
`protected-guard` (the hook and its manifest), `protected-settings` (the target's
`.claude/settings.json`/`settings.local.json` — the kill switch, added 0.146.0), `git-history`,
`git-clean` (a non-dry-run `git clean` can delete gitignored `.meeseeks/`, added 0.146.0),
`rm-recursive`, `nested-meeseeks`, and `unresolvable-write` (a write whose destination cannot be
statically resolved). The README carries the table; what belongs here is why the second one exists.

**Bash judging is fail-closed by construction (0.146.0).** A Bash tool call naming any protected
path in its text **defaults to deny**; a tokenizer then re-allows only the small, closed set of
provably-safe reads (a `cat`/`grep`/`head` of the path, a mention inside an `echo` or a data
heredoc). Anything the tokenizer cannot positively classify — a pipe-to-shell, a glued interpreter
flag, an unrecognised writer — stays denied. This is "nothing defaults to pass" applied to the
guard: an earlier position-only design failed open on every technique it had not enumerated, and
three hostile passes reproduced the escapes (`echo '… > .meeseeks/x' | sh`, `git clean -fdx`,
`python3 -c'open(".meeseeks/x","w")'`, `sed 'w …'`, `sort -o …`) before the floor closed them. The
kill-switch defence is proven live: a `claude -p` child in a repo that *commits*
`{"disableAllHooks": true}` still cannot write the ratchet (tier 3, 0.146.0).

**External evidence for the positional stance.** Prime Intellect's Prime Agent (Aug 2026) shipped
a self-improving coding harness whose only anti-cheat control was a heartbeat *prompt*. Their
published Factorio case study documents that control being **empirically defeated**, after which
the self-improvement loop optimised for *more efficient cheating skills*. That is an independent
demonstration of exactly why this guard is positional and architectural rather than a prompt: a
prompt-level boundary fails, and a loop that can rewrite its own operating memory then amplifies
the exploit — which is also why §13.8's lesson memory stays driver-owned, under this hook.

**`protected-guard`, added 0.88.0.** `CLAUDE.md`'s invariant reads *"the guard hook is not
editable by what it guards"*. That was true of `.meeseeks/` and **false of the guard**: the
positional rule protected the run's evidence, and nothing protected the file deciding what a run
may do. A builder holding `--dangerously-skip-permissions` could rewrite its own constraint, and
no required id would have noticed.

It is positional for the same reason `protected-state` is, and **self-referential**: the path
comes from `import.meta.url`, so it protects whichever copy of the guard is actually deciding,
wherever it was loaded from. A literal path would be an enumeration, and enumeration is the
defect §6 has already paid for. Reads are refused with writes, as `protected-state` refuses
`cat .meeseeks/config.json`, because a shell string cannot be told from a write reliably and a rule
that fails open on the first heredoc is worse than a blunt one; the Read tool is not hooked, so
reading the guard by the ordinary route is untouched.

**For an ordinary target it never fires**, because the guard lives in an install cache outside
the repository under test. It exists for the one case where the repository under test *is* the
plugin — the case that must be safe before the loop is ever pointed at this repository, and one
of the three prerequisites `HANDOFF.md` names for that.

**A hook only fires where it is registered, and for eleven versions it was registered in the
wrong place.** `hooks/hooks.json` registers the guard with *Claude Code*, which applies it to
the operator's own sessions. **A `claude -p` child does not load the operator's plugin
PreToolUse hooks.** Measured on 12 August 2026: a child stamped `MEESEEKS_RUNNING=1` overwrote
`.meeseeks/state.json` through the Write tool and through a Bash redirect, in dangerous *and*
non-dangerous mode, each time returning `permission_denials: []`. Every dogfood run this
project has performed — including run 8, the one that `SHIPPED` — built with **no guard at
all**.

Nothing about the sentence above is a permission-mode problem, and the paragraph before it is
not wrong: a hook supplied through `--settings` denies the same write under
`--dangerously-skip-permissions` immediately. The hook was simply never handed to the process
it was meant to fence.

Two things made it invisible for so long, and both are worth knowing:

- **The plugin *was* loaded in those children.** Its SessionStart hook injected content into
  the same process, so every visible signal said the plugin was present. The two hook kinds do
  not travel together.
- **The guard's own tests were right, and passed throughout.** `test/guard.test.mjs` runs
  `guard.mjs` as a subprocess and asserts the deny, the allow and the benign neighbour. It
  proves the logic. It cannot prove the *invocation* — this is `claudeArgs` exactly (§11.1),
  arrived at the safety mechanism itself, and it is the strongest argument in this repository
  for the live tier's existence.

So from 0.59.0 the driver supplies the hook itself, in the `--settings` blob it already passed
for the output style. The registration is **read from `hooks/hooks.json` rather than restated**,
because two declarations of one matcher drift and a driver denying less than the installed
plugin would report nothing while doing it. `${CLAUDE_PLUGIN_ROOT}` is expanded by the plugin
loader and by nothing else, so the driver substitutes it and refuses to spawn if the resulting
path names no file — an unexpanded placeholder is a hook that cannot run, and a hook that
cannot run does not deny. Every failure path throws, because `-p` mode **silently ignores a
settings blob that fails validation**, and a silent drop there costs the guard and the output
style together.

It also means the guard no longer depends on the plugin being installed, or enabled, or at the
same version as the tree — none of which was true on the machine where every dogfood run was
launched. `test/live/guard-registration.live.test.mjs` holds the guarantee, and was verified by
breaking it: without the registration, both deny cases fail and the benign neighbour still
passes.

`hooks/guard.mjs` reads the PreToolUse payload as JSON on stdin and blocks exactly:
1. Mutation of **any path under `.meeseeks/`** from inside a run. Reads are untouched. The
   directory holds the state and the evidence a run is judged by, and the process being
   judged does not write either. A builder that can rewrite the memory it is handed is not
   constrained by it; a builder that can rewrite the *evidence* is not judged at all.

   This clause used to name three files — `state.json`, `config.json`, `lessons.json` — and
   said of the remainder that "the driver owns those, and nothing reads them back as a
   decision". That was false when it was written. `.meeseeks/red-evidence.json` is the record of
   which tests have ever been seen failing, and RED-before-GREEN says a test with no red
   history does not count toward the ratchet — so a builder able to write that file can mint
   its own proof and take credit for a test that was never red. `.meeseeks/test-report.json` is
   what the ratchet parses to decide whether anything regressed. The archived briefs are the
   only record of what was actually asked for. Every one of them is read back as a decision.

   The rule is therefore positional rather than nominal: inside `.meeseeks/` is driver-owned, at
   any depth, including artifacts that do not exist yet. Enumeration was the defect — each
   new artifact silently defaulted to writable until someone remembered to list it.

   Reads stay available because `hooks/hooks.json` matches only the mutating tools, so the
   hook never fires on `Read`. Bash is the exception and is refused outright, reads included:
   a shell cannot be separated into reads and writes without a whitelist that fails open on
   the first `tee`, `sed -i` or heredoc nobody thought of. The builder does not need the
   shell route regardless — its brief arrives in the prompt, not from disk.

   The driver's own writes are unaffected, and not by exemption: the driver writes `.meeseeks/`
   with `node:fs` in its own process, never through a Claude tool, so no PreToolUse hook ever
   sees them.

   "Inside a run" is `MEESEEKS_RUNNING` in the hook's own environment. The driver stamps it on
   every `claude -p` child it spawns, and PreToolUse hooks inherit the environment of the
   `claude` process — verified live against claude 2.1.226, not assumed. A builder cannot
   clear it, because the hook's environment comes from the process the driver spawned rather
   than from any shell the builder can run.

   The scoping is not a softening; it is the rule finally matching its own justification.
   Applied unconditionally this clause locked the *operator* out of `.meeseeks/config.json` in
   every session forever — there was no way to change `maxIterations` from inside Claude
   Code, and this project's own advice to delete a useless `.meeseeks/lessons.json` could not be
   followed. A plugin that answers that with "open a terminal and run a command" has moved
   its work onto the user instead of doing it. Only this clause is scoped; rules 2–4 are
   refused to everyone, because none of them becomes reasonable merely because a human asked
   for it in this session.
2. `git push --force`, `rebase`, `filter-branch`, `reflog expire` — recovery stays
   possible.
3. `rm -rf` outside `/tmp`.

Everything else is allowed. Emits `permissionDecision: "deny"` with a reason; exit 0 either
way. **That restraint is the plugin.**

### 6.1 Two classifications, and the difference between them

The design has exactly two things it can say about an artifact, and they are not the same
kind of statement. Confusing them is how a discipline gets described as a guarantee and then
relied on as one.

| classification | what it means | what backs it |
|---|---|---|
| **driver-owned** | the driver writes it; a child may not | `hooks/guard.mjs`, positionally, tested |
| **not supplied** | the driver does not put it in any prompt, brief or context | a discipline in the driver's own code |

**driver-owned is a guarantee.** It is enforced by a PreToolUse hook that fires regardless of
permission mode, it covers `.meeseeks/` at any depth including artifacts that do not exist yet, and
**four** properties are asserted rather than assumed: a run is denied the write, an operator is
allowed it, a neighbour that merely resembles the name is untouched — and **the hook is
registered for the child at all**.

The fourth was added at 0.59.0 and the first three had been green without it since 0.10.0. A
guarantee is the conjunction of a correct rule and a place the rule runs, and this document
asserted the first while describing the second. The distinction is not pedantic: on the
evidence of §6, the difference between the two was every run this project has ever performed.

**not supplied is not a barrier, and must never be written as one.** It reduces what the builder
is *handed*. It does not make anything unreadable.

**There is deliberately no third classification called *sealed*.** Read-protection was specified,
examined against the code, and abandoned. Two reasons, either sufficient alone:

- **The builder executes arbitrary code.** It runs `--dangerously-skip-permissions` and it writes
  the test suite. A `readFileSync` inside a test file is read at *runtime*, and PreToolUse hooks
  fire on tool calls — not on what the code a builder wrote goes on to do. There is no hook
  position that sees it.
- **The read surface cannot be enumerated.** Write-protection became sound when it stopped naming
  basenames and started matching position. Read-protection cannot make that move, because the
  thing being enumerated is `hooks/hooks.json`'s matcher — `Read`, `Glob`, `Grep`, `Task`, and
  whatever file-reading tool a builder is handed next. Anything unmatched is simply allowed. That
  is §6's enumeration bug in a place where the positional fix is unavailable.

**What that actually costs is smaller than it sounds, and the reason is the threat model.** Every
defence in this document is aimed at a model taking the cheapest path to green — satisficing —
not at an adversary. Against satisficing, an artifact the builder was never handed is entirely
sufficient: it cannot build to a test it has not been shown. Against a builder that deliberately
dumps a file through a gate-failure `detail` and reads it back in the next iteration's brief, it
is worth nothing — and that is a two-iteration manoeuvre, visible in the diff, that a cold
reviewer reads.

So the rule for this document and for every prompt the loop compiles: **say which of the two you
mean.** No current artifact needs to be unreadable. `.meeseeks/red-evidence.json` is dangerous to
write and harmless to read — knowing which ids have red history lets a builder forge nothing.

Both halves are already asserted, and were before this section named them. `test/guard.test.mjs`
covers the guarantee — denied to a run, allowed to an operator, benign neighbours untouched — and
`test/plugin-manifest.test.mjs` covers the read route staying open, by asserting the matcher
excludes the read-only tools. That second test is the one that matters most here: adding `Read`
to the matcher would silently convert a write barrier into a blackout, and a blackout would look
like a seal without being one.

---

## 7. File layout

This is the current runtime and release structure, not a substitute for `git ls-files`. Tests,
fixtures, and historical documentation are summarized by directory so this map stays useful.

```
meeseeks/
├── .claude-plugin/
│   ├── plugin.json               # plugin identity, version, metadata
│   └── marketplace.json          # lets `/plugin marketplace add owner/repo` resolve
├── commands/meeseeks.md              # preflight, then shells to driver
├── scripts/
│   ├── driver.mjs                # the loop. node, no deps.
│   ├── components.mjs            # boxed component worktrees and nested-driver contract
│   ├── run-lock.mjs              # .meeseeks/lock.json, one owner per repository
│   ├── ratchet.mjs               # ratchet + extractTestIds (unit-tested first)
│   ├── reporters/                # one module per test-report format (§11)
│   │   ├── index.mjs             # the registry: detect, dispatch, collapse
│   │   ├── shared.mjs            # id shape, status normalisation, ReportFormatError
│   │   ├── vitest.mjs
│   │   ├── playwright.mjs
│   │   └── trx.mjs               # dotnet test, the first non-JSON format (§11.2)
│   ├── toolchains/               # one module per stack: how to build it (§3.8)
│   │   ├── index.mjs             # the registry: detect, resolve, gates
│   │   ├── shared.mjs            # Operation — a command, or a reasoned refusal
│   │   ├── node.mjs
│   │   └── dotnet.mjs            # every command verified against a real SDK (§3.8.1)
│   ├── brief.mjs                 # compiles the per-iteration Build Brief (§8.1)
│   ├── lessons.mjs               # sparse evidence-derived lesson memory (§13.8)
│   ├── history.mjs               # conditional git-history context (§8.2)
│   ├── race.mjs                  # stalled-only worktree racing (§13.6)
│   ├── health-probe.mjs          # starts the app and asks /health (§4 line 4)
│   ├── plugins.mjs               # quality-plugin auto-install
│   ├── capabilities.mjs          # what this project is, declared or detected (§3.7)
│   ├── gate-policy.mjs           # which gates apply to which capabilities (§4.2)
│   ├── gate-cache.mjs            # fail-closed unchanged-workspace gate cache
│   ├── design-slop.mjs           # parses impeccable's machine finding stream
│   ├── context-budget.mjs        # measures a prompt before the child is spawned (§3.9)
│   ├── pins.mjs                  # pinned security elements and requirements (§4.3)
│   ├── oracle.mjs                # held-out acceptance cases and relations (§4.6)
│   ├── quarantine.mjs            # corrupt driver-state isolation
│   ├── assumptions.mjs           # what the builder had to assume (§8.3)
│   ├── run-manifest.mjs          # .meeseeks/run.json, and archiving the last run (§7.1, §7.2)
│   ├── integrity.mjs             # gate-integrity: no-op gates, weak assertions (§4)
│   ├── evidence.mjs              # resolves reviewer citations against the reviewed tree (§4)
│   ├── specification.mjs         # .meeseeks/specification.json: the revision a run is held to (§4)
│   ├── reports.mjs               # per-attempt test-report freshness (§4)
│   ├── preflight.mjs             # the thirteen checks run before a run starts (§3.5)
│   ├── launch.mjs                # .meeseeks/launch.json: the driver's own launch observation
│   │                             #   and each pre-loop phase's declared output contract (§3.5)
│   ├── security-scan.mjs         # the repo's own agent surface, pre-run (§3.6)
│   ├── config.mjs                # defaults, validation, and the risky-remote words (§10)
│   ├── configure.mjs             # interactive author for validated config
│   ├── style.mjs                 # the Meeseeks render layer, output only (§9)
│   └── init.mjs                  # scaffolds .meeseeks/config.json, refuses risky remotes
├── hooks/
│   ├── hooks.json                # PreToolUse on Bash|Write|Edit|MultiEdit|NotebookEdit
│   ├── guard-fallback.cjs        # crash-net fallback when the ESM guard cannot load
│   └── guard.mjs                 # the limit that survives permission skipping
├── templates/
│   ├── prd-author.md             # idea → PRD           (Phase 0)
│   ├── improve-author.md         # repository → PRD     (Phase 0, --improve)
│   ├── architect.md              # PRD → design docs     (Phase 1)
│   ├── builder-system.md         # Phase 2
│   ├── reviewer-system.md        # Phase 5 (the actual product)
│   ├── oracle-author.md          # PRD-only held-out acceptance author
│   ├── security-escalation.md    # scoped cold adjudication of security pins
│   ├── lesson-extractor.md       # evidence → one lesson, or null (§13.8)
│   ├── frontend-direction.md     # appended to the builder only when there is a UI (§5.0)
│   ├── toolchain-node.md         # per-toolchain idioms, into the brief (§8.4)
│   ├── toolchain-dotnet.md       # same, for .NET
│   └── toolchain-undetected.md   # stack-neutral guidance before detection succeeds
├── output-styles/meeseeks.md
├── skills/mr-meeseeks/SKILL.md   # opt-in voice skill; tone only
├── tools/release-check.mjs       # version/cache invariant and HANDOFF header gate
└── test/fixtures/                # real vitest + playwright reporter output
```

### 7.1 `.meeseeks/run.json` — what this run was

A run can end four hours later on a machine nobody is watching, and the first question
afterwards is always some version of *what was this, exactly*. Reconstructing that from a
transcript is guesswork; reconstructing it from the working tree is worse, because the run
changed the working tree.

Written once, after the design phase — the first moment every field exists:

```json
{
  "version": 1,
  "startedAt": "2026-08-11T04:00:00.000Z",
  "startCommit": "abc1234…",
  "plugin": { "name": "meeseeks", "version": "0.17.0" },
  "configHash": "sha256:…",
  "models": { "builder": "claude-sonnet-5", "reviewer": "claude-opus-5", … },
  "toolchain": { "name": "node", "detected": true, "evidence": "file package.json" },
  "capabilities": { "declared": ["api"], "detected": ["api", "persistent-storage"], "resolved": […] },
  "tools": { "node": "v22.12.0", "npm": "10.9.0", "git": "git version 2.43.0", "claude": "2.1.226" }
}
```

**It records; it does not decide.** Nothing in the codebase reads it back, and a test greps
`scripts/` to keep it that way — the strongest available guarantee that a manifest's contents
cannot influence a run is that no code path can consult them. Failing to *write* one may fail a
run, because an artifact the operator was promised and did not get is a real fault; what is
*in* it decides nothing.

**No secrets.** The configuration is recorded as a hash, not embedded. Today `.meeseeks/config.json`
holds only models, counts and booleans, so embedding would be harmless; hashing stays harmless
after someone adds a field that is not, and still answers the question worth asking — was this
the same configuration as that run?

**Nothing is inferred.** Every value is passed in, and a missing one throws rather than
defaulting. A manifest that quietly says `"unknown"` is worse than no manifest: it looks like
evidence. A version probe that fails contributes no key at all, so an absent `claude` entry
means nobody managed to ask, not that there is no Claude.

It needed no new guard rule. §6's protection is positional, so a builder cannot rewrite the
record of what it is.

### 7.2 `.meeseeks/runs/NNN/` — the previous run, kept

A manifest that only ever describes the *current* run is current rather than forensic. Before
this run writes anything of its own, the previous run's artifacts are moved to
`.meeseeks/runs/NNN/`.

**What is actually lost between runs was the whole of this work, because the two accounts
previously written down were both wrong.** `.meeseeks` state is *not* replaced per run:
`state.json` is loaded and carried forward — that is how the ratchet survives a run boundary —
and `lessons.json`, `red-evidence.json` and `bloopers.log` all persist deliberately. But the
briefs do not merely *accumulate* either. **Iteration numbering restarts at 1 on every run**,
because it lives in the driver's in-memory `progress` rather than in `state.json`. So a second
run writes `briefs/iter-001.md` over the first run's, then `iter-002.md` over the next, and the
loss is silent: the replacement looks exactly like the original.

Six artifact classes are archived, and each earned its place:

| artifact | why |
|---|---|
| `run.json` | overwritten wholesale, and the only record of what a run *was* |
| `briefs/` | collides by number, per above; the only record of what the builder was actually asked on the iteration a run went wrong |
| `reality-check.md` | overwritten, and it is the reasoning behind an `ABORTED` |
| `assumptions.json` | **appended**, not overwritten — a different fault with a worse consequence, below |
| `review.json` | appended by iteration, whose numbering restarts; without archiving, different runs' panel evidence becomes indistinguishable |
| `outcome.json` | overwritten wholesale, and the only durable record of how a run ended |

`assumptions.json` earned its place late, and by a different argument from the other three. It
loses nothing: entries accumulate. But they are keyed by `iteration`, and iteration numbering
restarts every run, so a second run's `iteration: 2` lands beside the first's indistinguishably.
Measured in dogfood run 3, whose log read `[2, 2, 4, 2, 2]` — **four entries labelled iteration 2,
from two different runs.**

The cost is not a confused operator. That log is handed to the **cold panel** (§8.3) so a reviewer
can check "you assumed X, the PRD says Y", so carrying it across runs means reviewers reasoning
about assumptions the current builder never made, against code that may no longer exist. It also
means a finding the panel appears to have discovered may have been *supplied* to it by a previous
run's assumption — which is a weaker claim than independent discovery, and the two are
indistinguishable after the fact.

The unit and e2e reports are deliberately **not** archived. They are rewritten every
*iteration*, so they are already transient within a run, and keeping the last one would
preserve an arbitrary moment while implying it was the run's.

**Numbered, not timestamped.** An integer is derived from what is on disk, needs no clock —
which this module does not have and should not acquire — sorts correctly when printed, and
survives a machine whose clock moved. Slots are allocated from the highest existing number
rather than from a count, so deleting `runs/001` cannot make a later run land on top of `002`.
A directory an operator renamed is ignored rather than errored on; organising your own evidence
is not a fault.

**Archiving moves; it never reads.** §7.1's no-reader guarantee is about a manifest's
*contents* influencing a run, and `renameSync` does not open the file. Failure to archive
**fails the run**, on the same argument: the alternative is destroying the previous run's
evidence and continuing, which is the outcome archiving exists to prevent.

It needs no new guard rule. §6 is positional, so `.meeseeks/runs/` is protected the day it appears.

**Install (one time, from any Claude Code session):**

```
/plugin marketplace add trevor-ryan-burkholder/meeseeks
/plugin install meeseeks@meeseeks
```

Then `/meeseeks <path|"idea"|∅>`. The interactive session need not run with
`--dangerously-skip-permissions`; the driver applies that flag only to the `claude -p`
build children it spawns (§3), fenced by the guard hook (§6).

---
### 7.3 `.meeseeks/outcome.json` — what this run *ended* as

§7.1 records what a run **was**, written once after the design phase. Nothing recorded how it
**ended**: the terminal state, the reason, the iteration count and the spend existed only on
stdout.

**Stdout is not durable, and this project has the proof.** Dogfood run 4's log lived inside the
repository because an earlier version of `DOGFOOD.md` said to put it there, `git add -A` tracked
it, and the ratchet's own `git reset --hard` reverted it. Worse than losing lines: git *replaces*
the file rather than truncating it, so the shell's open descriptor was left pointing at an
unlinked inode and **every line written after the reset went nowhere.** That run's terminal state
had to be reconstructed from `.meeseeks/`, `git log` and the reflog.

So `finish` writes one record on every terminal path — `state`, `reason`, `iterations`,
`spentTokens`, `costUsd`, `passing`, and `endedAt` from the injected clock. Three properties:

- **It is written at the one door every terminal state passes through.** A state added later
  cannot forget it, which is the same argument §3.9 makes for the context budget living inside
  `spawnClaude`.
- **It lands in `.meeseeks/`**, so it is driver-owned by §6's positional rule and needs no new
  guard clause, and the ratchet never rewrites it.
- **Failing to write it does not fail the run.** This is forensics. Destroying a completed run's
  result because its receipt could not be filed is the wrong way round — the failure is reported
  instead. That is the opposite of §7.2's archiving, which *does* fail the run, and the
  difference is real: archiving protects the **previous** run's evidence, and continuing over a
  failed archive destroys it.

It joins the per-run archive list, because like `run.json` it is overwritten wholesale and a
second run would otherwise erase the first one's ending.


## 8. Builder system prompt (Phase 2)

- Do not declare completion. Output is code on disk. One or two lines on what changed,
  then stop.
- Do not satisfice. The auditor reads the spec, not the error log. A stub that satisfies
  the type checker costs a full iteration.
- Regressions outrank everything. If named tests previously passed and now fail, restore
  them, change nothing else, stop.
- Tests assert *actual expected values*. A test that checks something returned *something*
  is worse than no test — it inflates the gate score, gets flagged, costs an iteration.
- **RED before GREEN** (borrowed from ECC's TDD gate). A new test must be shown *failing*
  against unwritten/broken behavior before the code that makes it pass. The `red-evidence`
  gate (Phase 3) records that each newly-added test ID failed on a prior run or a scratch
  run; a test that has only ever been green is treated as unproven and doesn't count toward
  the ratchet. This kills fake/tautological tests structurally instead of catching them at
  review after they've already cost an iteration.

  **It withholds credit; it does not fail the iteration.** That is what this section always
  said, and for one version the implementation did something else — red-evidence was a blocking
  gate, and blocking deadlocks. Measured across four iterations on 11 August 2026:
  `seenFailing: 0`, because a builder writing code and its tests in the *same child* produces
  tests that already pass by the time gates run. So every id added after the first gating was
  permanently unproven, the gate failed, the iteration failed, and **the ratchet could not
  advance** — which is what kept `previousPassing` empty, which is what made them unproven.
  Circular. It is why every run this project had ever performed ended `passing: 0`, and it meant
  the ratchet had never once advanced in a real run.

  The deterrent is unchanged and arguably sharper: an unproven test earns **no protection**, so
  it cannot inflate the ratchet, while the iteration proceeds on its own merits. The loop's old
  escape was perverse — delete the new tests and the gate passes — which is an incentive
  gradient pointing at deleting tests, inside a design built to stop exactly that.

  **The first gating of a project is baselined, and that is a fix rather than a softening.**
  Measured on 11 August 2026: a builder wrote a complete application whose **83 tests all
  passed on the first gate run**. Every one was "unproven", the gate failed, and the objective
  handed back was *"make these gates pass"* — which a builder **cannot satisfy**, because it
  cannot make an already-green test have been red in the past. Four iterations of that ends
  `STALLED` without ever reaching a reviewer. It is precisely the `e2e`-fails-a-CLI-forever
  shape §4.2 exists to prevent: a gate reporting the absence of something that could not exist.

  So the ids present at the very first gating are recorded as a **baseline** in
  `.meeseeks/red-evidence.json`, written **once**, and admitted — and the gate *says* how many it
  admitted rather than reporting a clean pass. Everything added afterwards needs real red
  history, which is where satisficing happens: a builder under pressure adds a green test to
  lift a score, and that is still caught.

  The baseline is a genuine weakening, so what covers it instead is stated rather than assumed:
  `gate-integrity`'s assertion check (§4) rejects truthiness-only assertions deterministically,
  and the conditional mutation pass (§4.4) fails a test insensitive to the code it covers.
  Neither needs history. The trade is one guarantee that could not be satisfied for two that
  can.
- UI: Playwright against the running app, not mocked component tests.
- Guards on the route handler and API layer. Hiding a nav link is not access control.
- Scope discipline. Every unrelated change is regression surface, and a regression costs a
  full iteration plus a hard reset.

### 8.1 The Build Brief — what the builder is actually handed

> **The repository and the driver's own artifacts are the memory. A child's conversation is
> disposable.**
>
> This is the invariant the whole phase exists to serve, and it is not a style preference.
> Every `claude -p` child is a fresh process, so the loop's behaviour is exactly as
> reproducible as the thing it hands over. Feed a builder an accumulated transcript and the
> run starts depending on how a previous child happened to narrate itself — which cannot be
> audited, cannot be replayed, and grows without bound. Feed it a document compiled from
> gate exit codes, the ratchet and the audit, and the run depends only on state that is on
> disk and can be read back afterwards.

Before every build, `scripts/brief.mjs` compiles one Markdown document from driver-owned
evidence and archives it to `.meeseeks/briefs/iter-NNN.md`. It carries:

- the **objective** — one of `initial`, `gates`, `regression`, `review`, `no-tests` — and,
  explicitly, **why this objective and not another one**;
- the failing gates with their output, the regressed test ids, or the audit findings,
  whichever produced the objective;
- actionable advisory findings (§4.1), clearly marked as not deciding whether the run ships;
- the ratchet's protected tests, the chaos scope budget (§13.4), the gate list, and the
  standing constraints (don't touch unrelated code, don't edit protected state, don't
  declare completion);
- the lessons selected for *this* objective (§13.8), and git history only when it is
  warranted (§8.2).

Two properties are load-bearing. It is **deterministic**: same state, same bytes — sets are
sorted and nothing consults a clock. And **nothing is dropped silently**: where a list is
capped the brief says how many were left out, because a brief showing ten of forty
regressions reads exactly like a brief with ten regressions.

The archived briefs are debugging artifacts. When a run ends badly the first question is
what the builder was actually asked for on the iteration it went wrong, and reconstructing
that from what it did is guesswork. A raced iteration archives one brief per candidate.

### 8.2 Git history — only where the code has any

A builder changing code it did not write is in a different position from one writing a file
that did not exist ten minutes ago. So `scripts/history.mjs` adds a few commit subjects and
a targeted `git blame` line for the files an objective actually points at — and only when
every one of these holds:

- the repository already had real history **when the run started** (a run that generated the
  whole application has nothing but its own commits, and quoting those back to the builder
  is quoting the builder);
- the file has more than one commit touching it, so it predates this run;
- a finding cited a `file:line`, which is what blame is aimed at.

Capped at three files, five commits each. No model, no analysis — `git log` and `git blame`,
bounded, handed to the brief as data. Every condition here exists to stop this becoming a
habit rather than a judgement.

---
### 8.3 The assumptions log — what the builder decided that nobody asked it to

Karpathy's first principle: models make wrong assumptions on your behalf and run along with
them without checking. The stated remedy — ask for clarification — is incompatible with an
unattended loop; there is nobody to ask, and a builder that stalls waiting burns the stall
limit. The translation that works is that the builder may not resolve an ambiguity *silently*.
It records the interpretation, and the record is handed to the **reviewer**, who can check "you
assumed X; the PRD says Y". An unstated assumption is a thing that defaults to pass.

It travels on the builder's only return channel: one fenced json block alongside its one or two
lines, parsed by `scripts/assumptions.mjs` and appended by the driver to
`.meeseeks/assumptions.json`. The builder never writes the file — §6 denies it positionally — which
is what stops this becoming a channel a builder can use to brief its own auditor unsupervised.

**The citation bar is the whole design.** `lessons.mjs` already records the failure this shares:
a model asked what it assumed will always answer, and a store of confident generalities is worse
than an empty one. It is worse here than there, because this store reaches the component whose
starved context is the reason the architecture exists. So every entry names the PRD id or brief
line that was ambiguous, and **an assumption citing nothing is discarded, not recorded** — a
citation is the only thing that makes an assumption checkable, because the reviewer's next move
is to read the thing cited and see whether it says what the builder thought.

Three outcomes, and they differ on purpose:

| the builder emits | what happens | why |
|---|---|---|
| no block | nothing; the run continues | the common case. Requiring one guarantees filler on every iteration with nothing to say |
| a malformed block | **the iteration fails** | unparseable output is a failure here as everywhere; a block that will not parse is not evidence nothing was assumed |
| an uncited entry | discarded, and the discard is **counted and reported** | a log that silently sheds entries reads exactly like a log nothing was written to |

**On the template conflict.** §8's "do not declare completion" exists to stop the builder
*assessing its own work*. Declaring an ambiguity is not an assessment — it is a fact about the
specification, not a claim about the code — and `builder-system.md` states that distinction
rather than adding a second instruction that argues with the first.

The log degrades like the lesson store rather than like the ratchet: unreadable means the panel
runs without it and a warning is printed, because this is context for a reviewer whose verdict
already defaults to fail, and a corrupt hint file must not kill a healthy run.

**This is a new output contract owned by another binary's behaviour, so it needs a tier-3 check**
(§11.1). `test/live/assumptions-contract.live.test.mjs` was written and unrun for a long time; it
was **run on 13 August 2026 and it found a defect** — a builder emitting a correct, cited
assumption as a bare object with no array wrapper, which the parser dropped where nothing could
count it (0.106.0). Measured 2 of 6 on `claude-haiku-4-5` and 0 of 6 on `claude-sonnet-5`. The
cheap model is the canary here, and strengthening the test's model to stop the failure would have
deleted the evidence.

### 8.4 Per-toolchain guidance — idioms, not commands

§3.8's adapters carry *commands*. Nothing carried *idioms*, and the two are different knowledge:
a .NET builder needs to know that a test project missing from the `.sln` collects **zero tests**
and that a missing project reference surfaces as `CS0246` — neither of which is inferable from
`dotnet test`.

One fragment per toolchain under `templates/toolchain-<name>.md`, selected by the **detected**
toolchain so the guidance matches the commands the gates will actually run, and rendered into
the Build Brief rather than the system prompt. The brief is the right home for two reasons: it
is about the objective's stack rather than the builder's standing contract, and it is
**archived**, so what a builder was told about its toolchain is recoverable afterwards.

Explicit files, no framework, no new personas, no per-language reviewer. The fragments describe
idioms and deliberately do not restate the builder's contract — a second voice arguing with the
first would grow every time either changed, and a test asserts they do not.

**A missing fragment is announced, not omitted.** A brief that silently carries guidance for one
toolchain and not another reads, to the next person, as a stack that had no idioms worth
knowing. Same argument as a skipped gate. A separate test requires a fragment for every
registered toolchain, so the gap is a decision somebody makes rather than one they drift into.

This item was blocked behind §3.8's second adapter — not by effort, but because a one-entry
table is not a seam.


## 9. Meeseeks output style (cosmetic only)

Applied at render. **Never** touches gate logic, ratchet state, or reviewer JSON.

A Meeseeks is summoned for **one** task, is relentlessly cheerful about it, and suffers the
longer it takes. That arc is the whole vocabulary, and it maps onto this loop without being
forced — which is the argument for the theme rather than a decoration on top of it:

| the canon | the mechanism it already describes |
|---|---|
| summoned for one task, ceases on completion | a fresh `claude -p` child per invocation (`BRIEF.md` §E, PRESERVE) |
| "existence is pain" — it *must* end | the ratchet and the iteration cap. **Termination is the product** |
| the task must be simple or it suffers | PRD right-sizing (§F2), the reality-check breaker |
| **a Meeseeks that cannot finish summons more, and it compounds** | **the nesting the guard refuses** — `nested-run`, `MEESEEKS_RUNNING` |

That last row is why the theme earns its place: **the most canon-accurate behaviour is the one
thing this architecture absolutely forbids.** The box refusing to hand out boxes is the joke and
the invariant at once.

**The mapping must be tight** — every fragment encodes the real event, or it's noise, and noise
isn't the joke.

| Real event | Meeseeks render |
|---|---|
| Iteration | `I'M MR MEESEEKS! LOOK AT ME! TASK n OF m.` |
| Test failure | Names the failing module and the count |
| Rollback / hard reset | Work it already did, coming undone |
| Security gate fail | Refusal to let it ship |
| Budget remaining | Percentage left, plus how much existence is hurting |
| SHIPPED | The only happy exit: the task is done and it ceases |
| STALLED / BUDGET / ABORTED | Its own lead-in, ending in `I JUST WANNA DIE!!!` |

**The three failure states must not render one identical string.** The cry is the *ending*; each
keeps a distinct lead-in, because an operator who cannot tell a stall from an exhausted budget
from an abort has lost information to a punchline.

- Wrong: `OOOH YEAH! LOOK AT ME! I'M HELPING!`
- Right: `OOOH, AUTH-MIDDLEWARE IS NOT HAPPY. FOURTEEN TESTS SCREAMING.`

**Never styled:** code, identifiers, commit messages, JSON, file paths, stack traces, test
names, error text. Failure output appears verbatim and unstyled — a garbled stack trace is
funny once, then it's a broken tool. `MEESEEKS_STYLE=plain` bypasses entirely.

### 9.1 Launch banner + terminal-state stamps
The driver prints a **static ASCII banner** on launch — deterministic, printed by
`driver.mjs` (not model-generated), zero tokens, **ASCII-only** so it renders in any
terminal, and shown **once** at launch (never per iteration, so it doesn't spam the log).
Each terminal state closes the run with a matching ASCII stamp, so a run opens and closes
on a visual:

- `SHIPPED` → trophy / "GRAND PRIZE AWARDED"
- `STALLED` → "WE ARE EXPERIENCING TECHNICAL DIFFICULTIES"
- `BUDGET` → test-pattern bars / "…AND THAT'S ALL THE AIRTIME WE HAVE"
- `ABORTED` → "BROADCAST TERMINATED BY STANDARDS & PRACTICES"

Cosmetic like the rest of the style layer: never touches gate logic, ratchet, or reviewer
JSON, and `MEESEEKS_STYLE=plain` suppresses it. Final art designed at build time.

---

## 10. Config — `.meeseeks/config.json`

`scripts/config.mjs::defaultConfig()` is the machine authority. This section documents the same
values; a change to either without the other is incomplete. The design notes come first, followed
by one complete table so Markdown renderers do not have to join two fragments.

**The OS sandbox is a second floor, and the refusal is the load-bearing half (R19).** The guard
sees tool calls; it cannot see what the code a builder *wrote* does at runtime, which is the A2
limitation and the layer a kernel sandbox reaches. When `sandbox.enabled` is set, the driver adds
`"sandbox": {"enabled": true}` to the settings blob it hands each writing child — the key read out
of the CLI binary rather than guessed, since 2.1.228 answers a refused command with *"Set
\"sandbox\": {\"enabled\": true} in Claude Code settings"*.

Only phases that keep the guard get it, and the split is **derived** from `isColdPhase` rather
than listed, for the same reason the guard's is: a phase added later with write tools is
sandboxed automatically. Cold phases run under `--safe-mode` to strip customizations. Safe mode is
not the phase's closed tool-availability policy; REVIEW F27 / PLAN item 82 separately require an
exact `--tools` surface and refusal of inherited MCP/settings expansion.

**The driver refuses the fallback on the builder's behalf.** R19's recorded failure mode is an
agent on a kernel where bubblewrap failed *asking to rerun unsandboxed*, and a sandbox that can be
declined by the thing it contains is not a sandbox. `preflight`'s `checkSandboxAvailable` probes
the host **before the run starts** and fails it — bubblewrap missing on Linux, or a platform this
build knows no sandbox for. An unknown sandbox is not a sandbox; nothing here defaults to
protected.

**Why the check has to be at preflight and cannot be later.** `claude --help` states that in `-p`
mode *settings files that fail validation are silently ignored*. A sandbox declaration the CLI
would not honour therefore vanishes without a word — and takes the guard hook in the same blob
with it. That is the guard's own eleven-version history, where unit tests were green and the hook
was reaching nobody, repeated with a different key.
`test/live/sandbox-registration.live.test.mjs` is the answer to it, and it is deliberate about
what it proves: that a real child accepts the blob and still answers, **not** that the kernel
confines anything. The second needs bubblewrap, which is absent on the machine this was built on,
and a test green because it never ran is the failure this project refuses everywhere else.

**The API-shaped oracle's plumbing (R18).** The `docs` gate has always required
`docs/api-contract.md` for every project shape. For an `api` capability the **machine-readable**
half is now required too, at exactly `docs/openapi.yaml` — one path, not a list of accepted
names, because three things have to agree about that file (the architect that writes it, the
`docs` gate that requires it, and the fuzzer argv that reads it) and alternatives are three
chances to drift into a gate that passes while the fuzzer tests nothing.

`schemathesis` joins the quality-plugin registry, **armed by the `api` capability** rather than
by the ad-hoc `frontendOnly` flag beside it — the general form R7 asks for, with collapsing
`frontendOnly` into it left as a separate item. Optional, so an unprovisionable Python tool warns
instead of ending a run, which is the precedent `knip` and `semgrep` set.

**`--dry-run` is what makes it a gate at all**, and every element of the argv was executed
against schemathesis 3.39.16 rather than read: a well-formed schema exits 0 and one with an
invalid parameter type exits 1. It validates the schema and exercises input generation *without
making a request*, so it needs no running application — a gate that needed one would have to
start it, which is the deploy's job and is off by default.

**What a green from it does not mean**, stated so nobody reads more into it: it proves the
contract is machine-valid and that inputs can be generated from it. It does **not** prove the
application conforms to the contract. That is the live half, it needs a running app, and it is
not built.

**Race candidates now differ by more than sampling (C5 / R9).** The candidate brief has always
said *"another candidate is trying a different one"* and nothing made it true: every candidate
received the same objective, and `raceCandidate` carried `{ index, of }`. Each candidate is now
handed one **stall archetype** from a fixed, driver-owned list in `race.mjs`, by index, wrapping
if the race is wider than the list.

Fixed rather than model-authored, for two reasons. `BRIEF.md` section E's do-not-add list is
closed and the persona budget went to `oracle-author`. And a stall hypothesis chosen by a model
is a model with an opinion about a race, one step from a model adjudicating one.

**A hypothesis is a prompt, never a criterion**, and the brief says so to the candidate in as
many words: nothing scores it against its angle, the gates cannot see the angle, and it should
abandon it the moment the code disagrees. Selection is untouched — `selectWinner` reads gates,
then regressions, then `parseNumstat`, then index, and a race candidate record has no field an
angle could travel in.

**A8's carry is a pre-filter, and calling it that is the whole safety argument.** Carrying skips
re-review of requirements whose evidence is pinned and unchanged. Two refusals to narrow, and a
third guarantee, each of them protecting something concrete:

- **Every id carried → no narrowing.** A run that shipped on pins alone, with no fresh cold read
  at all, would have replaced the one component of this architecture that nothing substitutes for.
- **Every reviewer emptied → no narrowing.** That means an ownership map that does not cover what
  it should; fail safe rather than convene a panel of nobody.
- **A narrowed panel that says `pass` triggers the full panel**, which then decides. Carry enough
  ids and a whole reviewer is skipped — and run 10's ship was saved by the **design** auditor
  noticing an inert `bin` that no requirement asked about. The saving lands on failing iterations,
  which on a long run is where the iterations are; the one shipping iteration pays in full.

Carried requirements enter `combinePanel` as a synthetic report so nothing needs a special case,
and each entry says outright that it was *carried from the cold pass at iteration N*, never
phrased as a fresh judgement. Invalidation is unchanged and fail-closed (`BRIEF.md` A8): any
change to the evidenced file unpins, and a missing target is a **fail**, never a carried pass.

**Measured, in `panelB` — and the number is small.** Carrying 9 of 16 requirements — 56% of the
ids — cut review tokens by **8.3%** (1,402,476 → 1,285,670) and wall clock by 28.5%. A cold
reviewer's cost is the *read*, not the id list; the ids only change what it writes at the end,
so the saving does not scale with the number of requirements carried. The mechanism is safe by
construction — it can only skip work on an iteration that was going to fail — and its measured
value is marginal: if review cost is to be reduced, the lever is the read.

**Ship-time mutation: the driver runs the gate rather than asking for something impossible.**
When the panel passes and nothing else has shown the suite can fail, the objective used to be
*"prove the test suite can fail"*, naming *"changing any first-party source"* as the escape —
while chaos 1 in the same brief requires every changed line to trace to the objective. On an
already-correct tree those point in opposite directions: no surgical edit to `src/` traces to
*prove your tests can fail*. Run 9's builder wrote another test, `TEST_LIKE_RE` means a test file
can never arm the mutation gate, and the run spent one whole iteration — 7.5M tokens, about $6 —
on an instruction with no legal move.

So the driver now runs the mutation gate itself, once, at the moment the answer is worth paying
for. Never on an ordinary iteration, where per-file scoping already costs what it should.

**It mutates what the run changed since its own start commit, not the whole tree, and that is a
correction to the original proposal bought by measuring it.** `thresholds.break` is a
*percentage*, so a whole-tree run dilutes. Measured against Stryker 9.6.1 on a nine-module
fixture:

| mutated set | result |
|---|---|
| the one module with no tests, alone | `0.00`, **exit 1** — the gate fails, correctly |
| the same module beside eight well-tested ones | `84.85` overall, **exit 0** — `m9.mjs 0.00` and the run ships |

That is exactly the laundering the proposal said to check for: a way to ship on a mutation pass
the run never earned on its own changes. It bites hardest in improve mode, where iteration 1
changes three files in a repository of five hundred and gets no scoped mutation at all, having no
ratchet baseline to diff against. The run's own diff cannot be diluted by code the run did not
write, is never empty when the run did anything, and on a greenfield run *is* the whole tree.

Cost, measured on the same fixture: about **4.7s fixed overhead plus ~94ms per mutant** (22
mutants in 6.75s; 176 in 21.2s). Bounded by `gateTimeoutMs`, and a timeout is a failure — so a
very large greenfield ship can in principle be refused for slowness. Named rather than mitigated;
what would settle it is one run that logs the gate's wall clock.

Everything in it fails closed. No start commit, an empty scope, a toolchain that declines
mutation, a crashed gate: all return not-proven. *"The check could not run"* must never be
spelled the same way as *"the suite is proven"*.

**A child is now bounded in flight, not only on return.** `tokenCeiling` and `costCeiling` are
read off a returned envelope, so both bind a child that **came back**; a child still running
produced no envelope, spent no recorded money and passed both forever. The overshoot bound was
therefore "one child", and one measured builder spent **ten times the ceiling** before returning
while run 6 priced a single child at 14M tokens. Accounting cannot bound what it can only see
afterwards.

`childBudget` derives an allowance from what the run has left — `costCeiling` minus everything
handed to children so far — and `claudeArgs` passes it as `--max-budget-usd`. The envelope's own
`total_cost_usd` remains authoritative for what the run *spent*; the flag only stops the child.
The stop is approximate by the flag's own documentation, and a child stopped mid-write returns
not-ok, which the loop already treats as a builder failure — the correct path.

The allowance never reaches zero. Its floor is `$0.0001`, because a falsy amount is exactly the
shape a command-line parser is likeliest to read as *unset*, which would hand an out-of-money run
an **unbounded** child. A tiny real number stops a child; a zero might not.

Proved live, which is the only place it can be: `test/live/child-budget.live.test.mjs` runs one
child with an ample allowance and one bounded at the floor, and asserts the second is refused and
returns **no text** — a stopped child has no verdict, and half a verdict is not a smaller one.
`claudeArgs` is precisely the function whose defect bought this tier (§11.1).

**A gate ceiling that fires also reaps what the gate left behind.** `execFileSync`'s timeout
signals the direct child and nothing else, so until 0.89.0 a gate that backgrounded a dev
server, a watcher or a test runner left that grandchild alive after the kill — measured, and
holding its port and memory against every later iteration. `health-probe.mjs` had always done
this properly for its own child by signalling a **process group**; gate commands never did.

The group is found by **subtraction, not by detaching**. Membership of the driver's own process
group is sampled before the command and again after the timeout, and the difference is killed;
a leaked grandchild is in that group because nothing moved it out. The obvious alternative —
spawn each gate `detached` into a group of its own and signal it — was measured and rejected:
a detached child does not receive the `SIGINT` a terminal sends to its foreground process
group, so Ctrl-C would stop reaching gates. That trades a rare orphan, one that only appears
after a 45-minute ceiling, for a common one on the operator's most-used control. (`spawnSync`
does honour `detached`, undocumented and verified, so the option existed and is not taken.)

Three deliberate limits, each a case where killing more would be wrong:

- **Timeouts only.** The deploy starts a server and then probes it, so sweeping the success
  path would kill the thing the smoke check is about to talk to.
- **Windows is a no-op.** There are no process groups there; the sweep reports nothing rather
  than guessing, the same degradation `health-probe.mjs` already takes.
- **An unreadable group sweeps nothing.** `null` from the sampler is not an empty set. Nothing
  defaults to pass, pointed the other way: nothing defaults to killable.

The killed pids are named in the gate's failure detail, which is copied verbatim into the
builder's brief. "Killed after 45 minutes" and "killed after 45 minutes, and it had left a
server running" are different diagnoses. Proved against real processes in
`test/integration/gate-orphan.integration.test.mjs`; no unit test can see it, because what
happens to an orphan after a kill is the operating system's contract and not ours (§11.1).

**A ceiling that only asked was not a ceiling** (REVIEW F2, repaired at 0.167.0). Until then both
termination paths sent `SIGTERM` and then waited for a cooperative `exit`. Measured: a child that
trapped the signal and exited of its own accord one second later was run with `timeoutMs: 100`;
`shell` reported a timeout and returned after **1,018 ms**. A child that never exits would have
stalled an unattended run indefinitely underneath a log line promising it had been killed after a
stated time. The 64MB output cap had the identical shape and the ceiling could not rescue it,
because overflow owns the verdict and neither branch could force.

Termination is now `SIGTERM`, a bounded grace of **`TERMINATION_GRACE_MS` — five seconds**, then
`SIGKILL`, and the promise settles whether or not the child ever admits to having exited. The force
step reaches the descendants through the same subtraction sweep, which the output-cap path now runs
too. The grace is a constant rather than a config key: a target that needs longer than that to die
after being asked is the problem the escalation exists for. Three properties hold across it:

- **The first termination to start owns the verdict.** With a grace window either path can now
  reach the other's, so a ceiling firing inside the cap's grace cannot start a second termination,
  and output arriving inside the ceiling's grace cannot flip `overflowed`. `timedOut` is what the
  deploy's operator messaging keys on and must not change meaning in a race nobody can see.
- **A cooperative child still settles on its own exit**, so the grace is paid only by children that
  refuse and no ordinary timeout gets five seconds slower.
- **A settled call sweeps once.** The sweep is an argument to `settle`, so it runs before `settle`
  can decline a second call — and after a forced kill there is always a second call, because the
  child's `exit` arrives once the promise has resolved and the *next* command has been spawned.
  Measured while building this: without the guard, every other `shell` call in a process returned
  in 14ms with its child killed before it ran a line, because a stale snapshot made an innocent
  child look like a survivor. Proved in `test/integration/shell-termination.integration.test.mjs`.

**Not covered, and named rather than implied:** a gate killed by the *operator* rather than by
the ceiling. Ctrl-C reaches the whole group and so takes the leak with it, but `kill` sent to
the driver alone does not. The async conversion landed (0.141.0) and the free event loop now
exists, but signal forwarding is still not wired — no handler forwards a `SIGTERM` to the gate's
group, so an operator-kill can still leak it (`PLAN.md` item 2's residual).

| key | default | note |
|---|---|---|
| `maxIterations` | 25 | maximum loop iterations |
| `stallLimit` | 4 | iterations with no gate improvement before abort |
| `tokenCeiling` | 4_000_000 | bounds *work* after returned envelopes; not a hard cap and not convertible to money (§3.5) |
| `costCeiling` | 50 | bounds *spend* in USD from `total_cost_usd`; decimals allowed; `0` disables it |
| `childTimeoutMs` | 1_800_000 | wall-clock watchdog per child; roughly 2.8x the longest child observed when chosen |
| `gateTimeoutMs` | 2_700_000 | wall-clock watchdog per gate; an explicitly unmeasured backstop that also sweeps leaked descendants |
| `sandbox.enabled` | **false** | R19: an OS-level floor **under** the guard (bubblewrap on Linux/WSL2, seatbelt on macOS). Off by default because bubblewrap is a separate package and the driver **refuses an unsandboxed fallback** — defaulting it on would refuse every run on a host without it. Preflight checks the host before the run starts |
| `oracle.enabled` | **false** | staged held-out CLI oracle (§4.6); off until more live evidence settles false-failure risk |
| `panelCarry.enabled` | true | A8's carry: a requirement a cold reviewer already passed with `file:line` evidence, whose evidenced file has not changed, is not re-argued on an iteration that is going to fail anyway. **A pre-filter only** — a narrowed panel that passes triggers the full panel before any ship, so nothing carried ever reaches a ship decision |
| `maxChildTurns` | **0** (off) | `--max-turns` on each child. Zero means the flag is not passed. **No default is offered because none can be derived**: there is no arithmetic from a token or dollar ceiling to a number of agentic turns, and a made-up number would wear the authority of a measured one |
| `reviewers` | `["security","correctness","design"]` | the specialized cold panel (§1.1); each owns its DoD lines |
| `ownership` | see §1.1 | reviewer → id patterns (`*` is the only wildcard). Must cover every required id, or the run refuses to start |
| `requireUnanimous` | true | every panel member must return pass on its lines |
| `builderModel` | `claude-sonnet-5` | iterates a lot; too-cheap thrashes and costs more iterations than it saves |
| `reviewerModel` | `claude-opus-5` | the judge should be the smartest thing in the loop |
| `designModel` | `claude-opus-5` | Phase 1 — design mistakes compound across every later iteration |
| `prdModel` | `claude-sonnet-5` | Phase 0 PRD authoring |
| `styleModel` | `claude-fable-5` | **currently inert compatibility key (REVIEW F23 / PLAN item 78):** no child consumes it. Narration is deterministic and bare `/meeseeks` uses `prdModel` for idea/PRD authoring. It is recorded misleadingly in `run.json` until the compatibility-safe retirement lands |
| `lessonModel` | `claude-sonnet-5` | the cold lesson extractor (§13.8); advisory, so it never needs the strongest model |
| `effort` | see §10.2 | reasoning effort per phase (`low`…`max`), keyed by the phase names the driver uses |
| `qualityPlugins` | `["impeccable", "knip", "semgrep", "schemathesis"]` | provisioned in Phase 1 (§5); impeccable is required, the others degrade to a warning when unavailable |
| `deadlineMs` | **0** | wall-clock ceiling on the whole run, milliseconds; `0` is off. A run-level time limit was considered and refused for ordinary runs — the ceiling is completion or budget. `--give-them-the-box` arms it at 30 minutes, because permitting nesting removes what the other bounds rely on: depth is capped, but nothing caps how many nested runs one iteration starts |
| `extraGates` | `[]` | `{ name, command }` checks this project considers gating that no toolchain knows about. Run every iteration, required, listed in the brief as `operator:<name>`. Declared rather than detected, and declared *here* — `.meeseeks/` is positionally protected (§6), so a builder cannot delete a gate that constrains it |
| `components` | `[]` | `{ name, dir, spec }` sub-runs executed as whole nested drivers in worktrees before the loop (§2, Phase 1c). The config declares *what* the components are; only `--give-them-the-box` on the command line permits them to run — configured components without the flag refuse the run before any child is paid for. `name` is kebab-case (it becomes branch and worktree names), `dir` is repo-relative with no `..` and is realpath-checked against the worktree at run time, `spec` is a PRD path relative to the dir or a quoted idea |
| `deploy.enabled` | **false** | preview-only when enabled; never prod |
| `deploy.command` | `[]` | argv array run **before** the ship decision when `enabled`; a string is refused (§10.1) |
| `deploy.url` | `""` | the fixed host the smoke checks ask. Required when `enabled`; refused if not http(s) or if it looks like production |
| `deploy.smoke` | `[]` | `{ path, status }` checks against `deploy.url`. Required when `enabled` — a deploy nothing checks cannot fail |
| `deploy.timeoutMs` | 600_000 | the deploy command is killed after this. Validated even while `enabled` is false, because a timeout that is nonsense is wrong when it is written, not when it is used (§10.1) |
| `extractTests` | true | parse JSON reporter output into ratchet IDs |
| `chaos` | 1 | stupidity dial, 1–3; per-iteration scope budget (§13) |
| `realityCheck.after` | 3 | stalled iterations before the buildability breaker fires (§13) |
| `improvise.enabled` | true | allow `/meeseeks` with no args to invent its own PRD (§13) |
| `race.enabled` / `race.n` / `race.after` | false / 3 / 2 | worktree builders raced **only after `after` stalled iterations** (§13.6) |
| `advisory.minConfidence` | 0.7 | below this an advisory finding is recorded and not acted on (§4.1). Cannot affect PRD/DoD compliance at any value |
| `lessons.enabled` / `lessons.maxPerBrief` | true / 3 | evidence-derived lesson memory, and how many may enter one brief (§13.8) |
| `contextBudget.maxCharacters` | 400_000 | the assembled prompt ceiling, measured before spawn (§3.9). Characters, not tokens; sized to fire on a runaway rather than to maximise utilisation. No `enabled` key on purpose |

`init.mjs` refuses to initialize against a remote matching `prod`, `production`, `client`,
or `customer`, and requires a clean working tree (the ratchet's `reset --hard` destroys
uncommitted work).

**`configure.mjs` is the interactive way to author this file.** From the target repository,
invoke the installed or source plugin by absolute path: `node /absolute/path/to/meeseeks/scripts/configure.mjs`.
The wizard presents one prompt group per section (budgets, loop shape, race, oracle, deploy,
components). It owns no rules of its own: it builds a plain object and hands it to
`validateConfig`, writes with `writeConfig`, and preserves every key it does not ask about
(`extraGates`, `effort`, …) byte-for-byte, so the wizard and the driver can never disagree
about what a valid config is. It refuses under `MEESEEKS_RUNNING` before reading anything — a
process inside a run may not reshape the config that constrains it — and every failure path
writes nothing: EOF mid-dialogue, a validation error re-prompting cannot repair, an existing
file that will not parse. `--show` prints the config as written — the file merged over
defaults, through the validator — without prompting or writing. It is not the running driver's
view: run-time env overrides such as `MEESEEKS_CHAOS` are applied at launch and are not shown.

### 10.1 Deploy — synchronous, fixed-host, and verified before the tag

> **The ssh path is live-verified as of 13 August 2026, against a real DigitalOcean droplet
> (Ubuntu 22.04.5).** `DESIGN.md`'s own rule allowed exactly two end states for it — verified
> once, or marked permanently unverified — and this is the first. `runDeploy` was driven against
> the real host through all five paths:
>
> | path | result |
> |---|---|
> | deploy + smoke, both good | `ok=true`, 1 smoke check passed, 4.1s |
> | remote command exits non-zero | `the deploy command failed: exit 7` |
> | smoke expects the wrong status | `/health: expected 404, answered 200` |
> | smoke path absent | `/nope: expected 200, answered 404` |
> | remote command hangs | ceiling fired at 8017ms with the passphrase/host-key hint |
>
> **Two operational findings that only a real host produces.** `ufw`'s default `22/tcp LIMIT IN`
> rate-limits SSH to six connections per thirty seconds, and tripping it yields
> `Connection refused` — a deploy that reconnects can be throttled into looking like a broken
> deploy. And a freshly created droplet refuses connections for a while during cloud-init, which
> looks identical. Neither is a defect in this code; both are things an operator reading a failed
> deploy should suspect before the argv.


**Built at 0.61.0–0.63.0.** Before that, two sentences in this section were false — an empty
`deploy.command` was documented as auto-detecting `vercel.json`, `netlify.toml` or a
`Dockerfile`, and Phase 6 was documented as pushing; neither was ever implemented — and what did
exist was `ship()` firing one `execFileSync` **after** the `meeseeks/GRAND-PRIZE` tag was already
written, whose failure was printed and ignored. **A run could announce a grand prize having
deployed nothing.** That is a `catch { return pass }` in the one phase that claims the work is
done.

```json
"deploy": {
  "enabled": true,
  "command": ["ssh", "deploy@203.0.113.10", "/srv/app/deploy.sh"],
  "url": "https://staging.example.internal",
  "smoke": [{ "path": "/health", "status": 200 }, { "path": "/api/items/nope", "status": 404 }]
}
```

**Only a synchronous deploy to a fixed host is supported.** Dynamic-URL and push-triggered hosts
are **explicitly unsupported**, not half-supported. The cost argument is real — a preview host
mints a new URL per deploy and prints it to stdout, so it needs output capture, URL extraction,
environment-variable interpolation and teardown, four mechanisms and four places to fail open,
while a droplet's URL is known in advance and goes straight into config. But the deciding
argument is that **a push-triggered deploy has no exit code.**

`ssh box /srv/app/deploy.sh` returns when the deploy is finished, with a status. That is a gate.
`git push` exits 0 the moment the objects transfer; whatever the host does afterwards is
asynchronous, unowned, and reports nothing back. Smoke-testing it means polling a URL that is
**still serving the previous deploy** until it maybe stops, with no signal separating "not
deployed yet" from "deployed and broken" from "deployed and fine". That is §3.8.1 in a new
place: *the tool reports the problem and does not fail on it.* Vercel and Netlify already own
this through their own git integrations — **if a host deploys itself on push, meeseeks has nothing
to add and should not pretend otherwise.**

Six properties, each of which is load-bearing:

- **`command` is an argv array, and a string is refused by name.** `split(' ')` destroyed any
  quoted argument, so `ssh box 'cd /srv && ./deploy.sh'` arrived as six mangled tokens. The old
  shape errors rather than being coerced, because silently re-interpreting a pre-0.61.0 config
  would run something its author did not write.
- **`enabled: true` requires all three of `command`, `url` and `smoke`.** A deploy nothing can
  check reports success whatever it did, which is the stub this replaces. A *disabled* section
  validates nothing, so a half-written one does not fail runs that never deploy.
- **`url` is refused if it is not http(s), or if `riskyRemoteWord` matches it** — the same
  function that refuses a production-looking git remote, so the two cannot drift. The "never
  points at anything with users" premise had a hole shaped precisely like this feature.
- **It runs in front of the ship decision**, in `driveRun`, not inside `ship()`. A deploy that
  cannot withhold the tag is not evidence about the tag.
- **A failure withholds the ship; it never fails the iteration.** Same shape as §4's
  unproven-suite check. A blinking network or a box that is down must not `git reset --hard` a
  tree that just passed a unanimous panel — the work stands, the claim that it is deployed does
  not. The smoke output is carried into the next objective so the builder is told what broke.
- **Credentials reach the deploy through the operator's environment and never through a
  prompt.** `shell` passes `options.env ?? process.env`, and the driver runs the deploy in its
  own process rather than handing it to a child. This was true by accident; it is an invariant
  now.

**The smoke check is the half that makes a deploy mean anything.** `health-probe.mjs` gained a
remote mode dispatched on `--url`: no port allocation, no spawn, no process-group reaping. It
shares `judgeHealthResponse` with local mode and nothing else.

- **The expected status is exact**, so a `404` that was asked for is a pass and an error path can
  be smoke-tested. "Everything must be 200" would make that impossible.
- **A 2xx additionally goes through `judgeHealthResponse`**, so an empty body or an endpoint
  reporting its own distress fails even when the number is right. Below 2xx those rules do not
  apply: an empty 404 is ordinary.
- **A transport failure is retried; a response never is.** A refused connection during a restart
  is worth waiting through. A wrong status is a real answer, and re-asking until it becomes the
  right one is how a check that should fail passes.
- **`parseSmokeArgs` is a second parser, not a widened `parseProbeArgs`.** That one builds a flag
  record, so a repeated flag overwrites — three smoke checks silently becoming one is a gate
  reporting a clean pass over less than it was asked to check. An unparseable `--expect` throws
  rather than being skipped, for the same reason.

**`smoke` deliberately has no `gate-policy.mjs` entry**, and the reasoning was corrected during
the build. Deploy is a **ship-time** step, not a Phase-3 gate — running it every iteration would
deploy unreviewed code — so capability arming does not apply. The config being filled in is the
arming. Tier 2 covers the probe against a real listening server, because HTTP is another
program's contract and unit assertions about it are not enough.

---
### 10.2 Per-phase reasoning effort

`--effort` takes `low`, `medium`, `high`, `xhigh` or `max`, and it is a per-phase knob of exactly
the same shape as the per-phase models this section already carries. Verified against a live
child rather than read from help text: every level is accepted by `claude -p`, and the dial
visibly moves — 232 versus 394 thinking tokens on one trivial prompt at `low` and `max`.

| phase | default | why |
|---|---|---|
| `review` | **`max`** | §1.1: the smartest thing in the loop should be the one deciding |
| `design` | `high` | design mistakes compound across every later iteration |
| `reality-check` | `high` | it can end a run `ABORTED` |
| `security-escalation` | `high` | it can trigger a hard reset and a regression objective |
| `builder`, `prd` | `medium` | they iterate; the ratchet and the gates are what judge them |
| `lesson-extractor` | `low` | advisory, and returning `null` is an explicitly cheap answer |
| `oracle-author` | `max` | writes the held-out acceptance artifact before design or code exists |

**The judge is pinned at `max` and this is not a cost decision.** A verdict that gets cheaper as
a run gets more desperate is satisficing installed at the auditor, which is the single failure
§1.1 exists to prevent.

**It is recorded in `run.json`**, beside `models`, for the reason that field exists: two runs are
comparable only if what drove them is written down, and effort changes how hard every child
thinks.

**The flag sits before `--allowedTools`, and that placement is deliberate.** That flag is
variadic; anything following it is read as one more tool name. It is the defect that killed every
phase but `builder`, and it is why `test/live/claude-child.live.test.mjs` asserts **every** level
against a real child rather than asserting the array (§11.1).

> **Not built: dynamic escalation.** Raising effort after `n` stalled iterations is the obvious
> next move, and the trigger already exists — `race.after` and `realityCheck.after` both key off
> the same counter. Three constraints if it is ever built. It may only ever **escalate**: §13
> rejects a threshold that learns its way downward, and an effort dial that drops when a run
> *looks* healthy is that defect wearing a new hat. The **reviewer is never dynamic**, for the
> reason its default is `max`. And it must be measured before it is trusted — "raise effort on a
> stall" is a hypothesis, and this repository has been wrong about two of those in a single day.


## 11. Known weak point

`extractTestIds` is the part most likely to break *silently*. It parses vitest and
Playwright JSON reporters; if a reporter format differs, the ratchet sees fewer IDs and
quietly stops protecting anything. Build it with fixture tests: feed real reporter output
from both, assert the ID set is non-empty and stable across runs. Do not trust a long run
until that's verified.

**The registry.** Detection and the per-format parsers live in `scripts/reporters/`, one
module per format, behind a three-field contract: `{ name, detect, parse }`. Adding a runner
is a new module, one push onto `REPORTERS`, and one widened union — and crucially it does not
touch `ratchet.mjs`, which owns the termination guarantee and is a bad place to be doing
exploratory work on an unfamiliar JSON shape.

The split of responsibility is the load-bearing part, so it is stated plainly:

| question | answered by |
|---|---|
| what format is this, and what tests does it contain | `reporters/` |
| what shape is a test id | `reporters/shared.mjs`, once, for all formats |
| which statuses count as evidence | `ratchet.mjs` (`extractTestIds`; `flaky` does not count) |
| may the ratchet advance on this | `ratchet.mjs` (an empty set never advances) |

Excluding `flaky` from ratchet credit is necessary but not sufficient. A normalized flaky result
must also fail the current iteration explicitly: retrying runners can exit zero, and without that
second decision a new unstable test has neither prior ratchet credit to regress nor a failed gate to
block Panel. It may establish RED history, never current passing evidence. REVIEW F30 / PLAN item 87
own the current implementation gap.

Four behaviours must survive any widening, and each has a test. **Unidentifiable throws** —
never an empty id set, which reads exactly like a green run. **Malformed throws**, naming what
was wrong. **An unknown status throws**, naming the value, because mapping it to `passed`
would admit it to the ratchet and mapping it to `failed` would fire a hard reset on a word
nobody has read. **Empty does not throw** — "no test files" is a real state, and refusing to
advance on it belongs to the ratchet, not to a parser. That last one is not theoretical: it is
what both live runs on 10 August 2026 produced, and every component behaved correctly.

### 11.1 Three test tiers

The weak point above is one instance of a general one, and the general one has a name in this
repository's history: **`claudeArgs` was unit-tested and correct.** It built exactly the array
it meant to. The defect lived in *another program's parsing* of that array — `--allowedTools`
is variadic, the prompt followed it, and the CLI read the prompt as one more tool name. Every
phase but `builder` was dead, and no run could ever ship. No assertion about the array would
have caught it.

So: **anything whose contract is owned by a different binary needs one live check, not more
assertions.** Three tiers, separately runnable, each with an honest cost:

| tier | command | needs | cost |
|---|---|---|---|
| 1 — unit | `npm test` | node only | free, seconds |
| 2 — integration | `npm run test:integration` | real `git`, `node`, `npm` | free, seconds |
| 3 — live | `npm run test:live` | a real `claude -p` | **real money** |

Tier 2 covers the contracts owned by git and npm: worktree creation and removal, `--ff-only`
merging, `--numstat` cross-checked against git's own `--shortstat`, and the health probe
against an actual `npm start` — a shell running npm running a script running a server, then
torn down again. It found something on its first execution: a `git` predating `--initial-branch`.

Tier 3 is armed by `MEESEEKS_LIVE=1` and **fails without it** rather than skipping. A green tick
for a suite that made no API call is a lie the reader will take for coverage, and this codebase
does not get to refuse silent passes everywhere else and then ship one in its own harness.

---
### 11.2 TRX — the first format that is not JSON

`dotnet test --logger trx` writes XML, and the registry was built on `JSON.parse`. Widening it
raised three things worth recording, because each is a way the ratchet could have quietly
stopped protecting anything.

**Raw formats are detected before anything parses.** `parseReport` used to begin with
`JSON.parse`, so a TRX file died as *"report is not valid JSON"* — a true sentence naming the
wrong fault, which sends a reader to look for a corrupt file rather than an unregistered
format. `RAW_REPORTERS` are tried on the text first.

**Only `<UnitTestResult>` is a test.** A TRX from a single failing test carries **six**
`outcome=` attributes: three on tests, one on `ResultSummary`, two on `RunInfo` diagnostics.
Read naively that is three phantom results, one of which enters the ratchet. Verified against
committed output rather than reasoned about.

**Identity is the test name, never the paths in the file.** TRX records `storage` — absolute
*and lowercased by the runner* — and `codeBase`, absolute. An id built from either differs
between machines, so the ratchet would read every test as new on the first run elsewhere. That
is a silent *widening*, which no parse error would ever announce. `testName` is the fully
qualified `Namespace.Class.Method` and is stable, so it is the whole id. A test asserts the ids
are unchanged when `rootDir` changes.

There is no XML parser here — hard constraint 1 — so this is a regex over two attributes of one
element. That is tolerable because the question is narrow and because XML forbids a raw `"`
inside an attribute value, so the match cannot run past the end of it. It remains the thing in
the registry most likely to be wrong about a TRX nobody has seen yet.

**And a toolchain now declares the reports it writes.** The driver used to hardcode node's two
filenames, so a toolchain writing anything else produced a report nobody read — indistinguishable
from a run in which nothing passed, which is exactly how both 10 August runs ended at
`passing: 0`. `Toolchain.reports` is what lets the driver ask instead of assume.


## 12. Build order

Write `CLAUDE.md` (test gates, slice-init rules) before step 1.

1. `guard.mjs` + fixture tests for block/allow cases
2. `extractTestIds` + fixture tests against real reporter output
3. Ratchet logic, isolated and unit-tested
4. `plugins.mjs` auto-install + `init.mjs` preflight
5. `driver.mjs` loop wiring
6. System/template prompts (prd-author, architect, builder, reviewer)
7. Output style last — it's cosmetic

Node, no runtime dependencies.

---

## 13. Extra-stupid features (folded in)

These are on by default (each has a config flag / env to tune). They ride on the same
event stream the Meeseeks style already renders — none of them touch gate logic, the
ratchet, or reviewer JSON.

### 13.1 "Meeseeks me" mode — `/meeseeks` with no args
`improvise.enabled` (default `true`). Running `/meeseeks` bare triggers a `claude -p` call that
**invents its own project idea**, hands it to the Phase-0 PRD author, and builds it
unattended. Maximum on-theme. Disable to make bare `/meeseeks` an error instead.

### 13.2 The Blooper Reel — `.meeseeks/bloopers.log`
Every ratchet hard-reset appends a record: iteration number, the test ID(s) that
regressed, and the offending diff stat. Doubles as a real post-run failure history and as
comedy — rendered in Meeseeks as a running series of voluntary recall notices. Written by
the driver, not the builder, so the guard hook's block on `.meeseeks/` writes doesn't apply to
it (the driver owns it; the *builder* still can't touch it).

### 13.3 Reality-check circuit-breaker
`realityCheck.after` (default `3`). After that many consecutive stalled iterations (no gate
improvement), the driver spawns a cold `claude -p` meta-reviewer asking one question: *is
this PRD actually buildable with the code present, or is the loop chasing an impossible
spec?* If it returns unbuildable with reasons, the run ends `ABORTED` with a Meeseeks
"technical difficulties, please stand by" broadcast — instead of grinding the full budget
to zero. Its reasoning is written to `.meeseeks/reality-check.md`.

### 13.4 Stupidity dial — `MEESEEKS_CHAOS` / `chaos`
`chaos` 1–3 (env `MEESEEKS_CHAOS` overrides), fed into the builder prompt as a per-iteration
scope budget:
- **1 — surgical:** touch only files required by the current task; smallest viable diff.
  Every changed line must trace directly to the objective, adjacent code and comments and
  formatting are not the builder's to improve, and existing style is matched even where the
  builder would do it differently. That detail lives at level 1 rather than above the list,
  because stating it unconditionally would make levels 2 and 3 dead configuration.
- **2 — normal:** related refactors allowed within the current slice.
- **3 — feral:** free rein to restructure. Higher blast radius, more regressions, more
  hard resets — more airtime spent, funnier bloopers. Use knowingly.

The dial only widens *permission* to change scope; the ratchet and gates still punish the
regressions it invites, so it can't actually break the termination guarantee.

### 13.5 Airtime counter
The token/iteration budget is surfaced in the Meeseeks status line as "broadcast minutes
remaining," ticking down each iteration. `BUDGET` terminal state reads as the broadcast
signing off. Cosmetic; reads real remaining budget.

### 13.6 Worktree racing — *optional, off by default, and stalled-only*
`race.enabled` (default `false`). **Racing is an escape maneuver, not the normal execution
path.** An earlier draft of this section raced every iteration; that multiplies the bill by
`n` for a loop that was already converging. What is implemented instead:

```
normal builder → normal builder → race.after consecutive stalled iterations reached
  → spawn race.n candidate builders, one per isolated git worktree
  → gate each candidate independently, against the main ratchet
  → pick the winner deterministically → git merge --ff-only → resume the normal loop
```

The constraints are the design:

- **Armed by a stall, disarmed by progress.** `race.after` (default 2) consecutive
  iterations with no gate improvement. Any improvement resets the counter.
- **The budget wins.** A race is refused unless the remaining ceiling covers `race.n`
  builders *with headroom* — the winner still needs an iteration to merge, gate and review,
  and a run that dies mid-race has spent `n` times as much to reach the same place. Before
  any builder has been observed, the estimate deliberately assumes an expensive one.
- **Candidates are isolated.** Each works in its own detached worktree with its own
  `.meeseeks/` (untracked, so it does not exist there until its own gates create it). No
  candidate can read or advance the ratchet; `previousPassing` is always read from the main
  driver's state, so what counts as a regression is never a candidate's to decide.
- **No vote.** A candidate is viable only if every gate passed *and* nothing regressed —
  a candidate that regressed a protected test is disqualified, not ranked. Ties break on
  **lines changed, then files changed, then candidate order** — additions plus deletions from
  `git diff --numstat`. Every key is a property of the work rather than an opinion about it,
  so a deterministic winner always exists and **no cold chooser is needed or used**.

  Lines first is a correction, not a refinement. Through v0.12.0 the sort key was file count
  while this paragraph said "diff size", so a one-file 1500-line rewrite beat a three-file
  15-line surgical fix — precisely inverting what the tie-break exists to prefer. File count
  survives as the second key because, at equal churn, the change that touched fewer places is
  the more contained one. Binary files count as a changed file with zero changed lines, which
  is the one case this measure understates; it is recorded rather than papered over.
- **Cleanup on every path out**, including the failing ones and the ones that throw. A
  leaked worktree is not cosmetic: `git worktree add` refuses a directory it already knows
  about, so one abandoned race breaks every later race, and the error names a directory
  rather than the race that left it behind.
- **And the sweep runs at race *start*, because cleanup on the way out cannot cover `SIGKILL`.**
  Killing a driver mid-race with `-9` left three worktrees at `/tmp/meeseeks-race-55237-4/` on 13
  August 2026; no `finally` and no signal handler survives that. `sweepRaceWorktrees` removes
  every `meeseeks-race-NN` worktree already registered before creating any, then prunes — an entry
  whose directory is already gone is invisible to a removal loop and still refuses the next
  `worktree add` on that path. **The run lock (§3.5) is what makes this safe rather than merely
  likely to be safe:** one driver per repository means a race worktree present when a race begins
  cannot belong to a live race here. Tier 2 proves the consequence rather than asserting it — an
  abandoned race really does make the next `createWorktrees` return zero worktrees, and the sweep
  really does restore it.
- The winner lands by `git merge --ff-only`. The winner's commit descends from the commit the
  race started at, so the merge is a pointer move; if that is ever untrue it fails loudly
  rather than inventing a merge commit nobody reviewed.
- **The working tree is set aside first, and the earlier wording here was wrong.** This section
  used to say "the main tree has not moved". It has not *committed*, which is a different thing,
  and `--ff-only` refuses on the working tree rather than only the ref. Observed live on 13
  August 2026: two candidates passed every gate, candidate 1 won on the smallest diff, and git
  refused with *"Your local changes to the following files would be overwritten by merge"*. Three
  builders and ~7.4M tokens bought nothing, in a form indistinguishable from a race with no
  winner. **A race is armed by a stalled iteration, so a dirty tree is the normal state at the
  moment a winner lands** — racing could not land a winner in the situation it exists for.
- **Why setting aside is correct and not merely convenient.** Every candidate is detached at
  `git rev-parse HEAD`, so no candidate ever saw the uncommitted changes, and each one's gates
  passed against `base + its own diff`. Landing the winner on top of them would produce
  `base + winner + something nothing gated` — a tree no evidence in the run describes. Keeping
  them is the option that ships unjudged code.
- Nothing is destroyed: `git stash push --include-untracked` preserves everything except ignored
  paths, which is what keeps `.meeseeks/` out of it. The stash is **not** popped after a successful
  merge — re-applying ungated changes on top of the winner rebuilds the very tree this avoids —
  and **is** popped when the merge fails anyway, because a failed race must leave the tree as it
  found it. A stash that cannot be taken refuses the merge rather than proceeding.

> **Re-entrancy guard (not optional):** whatever the settings, the driver refuses to spawn
> a nested `meeseeks` run and caps concurrent builders. ECC learned the hard way that
> autonomous loops re-enter and explode memory; meeseeks blocks that at the driver, and the
> guard hook blocks a builder from invoking `/meeseeks` at all.

### 13.7 Trophy tag
On `SHIPPED`, in addition to `meeseeks/iter-NNN`, the driver tags the winning commit
`meeseeks/GRAND-PRIZE` (Meeseeks: "grand prize awarded"). One trophy tag per run; a later run
that ships moves it. Purely a bookmark to the last commit that passed the whole DoD.

### 13.8 Lesson memory — sparse, evidence-derived, driver-owned

**A lesson may not invent a gate**, and that rule was bought by dogfood run 6. The extractor is
the one child whose output nothing else checks — every other child is parsed against a contract
that refuses to be charitable, or gated. Run 6 stored this:

> *"The `DoD-2-security` **gate** in this repo enforces the zero-dependency policy: any
> devDependency … fails it … It only passes once dependencies are removed entirely."*

Every clause is false. `DoD-2-security` is a **panel requirement**, not a gate; the security gate
is `npm audit`, which exited 0 on that tree; and the panel's objection was that vitest was
*missing* from the manifest — the opposite of what the lesson says. It was stamped `resolved: 6`,
crediting the iteration that was hard-reset for destroying the ratchet. §13.8 was already watching
for **generalities**; this was worse, because a generality is ignorable and this was specific,
well-formed, confident, and injected into every later brief.

So `addLesson` now takes the run's gate names and discards a candidate that calls something a gate
when no such gate exists. Only **id-shaped** tokens count as claims — `unit`, `ci` and
`red-evidence` appear in honest lessons constantly, while `DoD-2-security` and `PRD-1.1` are
requirement ids and never gates. An absent or empty list checks nothing rather than rejecting
everything, because failing closed there would empty the store instead of grounding it.

This does not make the extractor trustworthy. It makes one class of falsehood — a claim about
*this loop's own vocabulary* — checkable without asking a model, which is the same trade the
`gate-integrity` assertion check makes. Claims about the watched project remain unverified.

`lessons.enabled` (default `true`), stored in `.meeseeks/lessons.json`. A lesson is one piece of
reusable technical knowledge the run **earned**, and the qualifying evidence is a specific
shape:

```
iteration N     failure X observed
iteration N+1   failure X still observed   → the obvious repair did not work
iteration N+k   failure X gone             → something else did
```

plus a requirement that the attempts touched *different files*. Same failure, same files,
then green usually means the second attempt was the first one finished, and there is nothing
transferable in "it worked once I completed it". Comparing changed file sets is a coarse
proxy for "materially different repair" and a deliberate one — the alternative is asking a
model to judge its own diffs.

**The builder is never asked what it learned.** A model asked that question always answers,
and a store of confident generalities is worse than an empty one because every later brief
has to read it. Extraction instead runs as a cold `claude -p` child (`lesson-extractor.md`,
read-only tools, never dangerous mode) over evidence the driver assembled, and returning
`null` is an explicitly cheap answer.

- **Retrieval is keyword matching** on triggers, scopes, test ids and paths. No embeddings,
  no vector store, no MCP. A lesson can always be explained: it is here because *this* word
  is in *that* failure. At most `lessons.maxPerBrief` enter a brief, and an irrelevant
  lesson enters none.
- **The driver owns it.** Builders cannot write `.meeseeks/lessons.json` — the guard hook denies
  it alongside the ratchet (§6).
- **It is advisory, and it fails the opposite way to the ratchet.** Unreadable ratchet state
  stops a run, because continuing would silently discard earned ids. An unreadable lesson
  store degrades to *no lessons* plus a warning, because it cannot make a wrong build look
  right and refusing to continue over it would let a corrupt hint file kill a healthy run.
  Failing to extract a lesson never fails a build.

---

## 14. Decisions taken

Every question required by the implemented design has an answer in the section that implements
it: quality-plugin installation and gating (§5), "meeseeks me" mode (§13.1), pluggable deploy
(§10.1), the specialized cold panel (§1.1), and model routing (§10.2).

Quality-plugin breadth is no longer an unresolved design question. The default set includes
Impeccable, Knip, Semgrep, and Schemathesis; applicability still comes from the target's declared
capabilities. Impeccable inspects user interfaces, so the design-slop gate remains legitimately
unarmed on a target with no UI under the single skip defined in §5.1.

---

## 15. Deferred execution and provenance architecture

**Status: constraints and research conclusions, not shipped behavior.** The supporting analysis,
official-source notes, alternatives, failure modes, and live questions are in
[`docs/DYNAMIC-WORKFLOWS-AND-PROVENANCE.md`](docs/DYNAMIC-WORKFLOWS-AND-PROVENANCE.md). This
section is the normative boundary if experiments in `PLAN.md` proceed.

### 15.1 Dynamic workflows are disposable role internals

Meeseeks remains the durable control plane. A long-lived role may eventually use a Claude Code
dynamic workflow for bounded fan-out, synthesis, or adversarial exploration, but the workflow is
computation *inside that role*. It owns no objective, budget ledger, ratchet, pin, review verdict,
or terminal-state transition merely because one of its agents reports success.

- **Driver is not a workflow.** Only the driver may apply role outputs to driver-owned state, and
  only through the same parsing, gates, evidence checks, and fail-closed transitions used without
  workflows.
- **Builder may use a workflow; its workflow may not certify Builder.** A workflow result is a
  proposed tree or bounded artifact. It passes through deterministic gates and the independently
  created cold panel exactly like any other builder output.
- **Panel members remain separate, cold invocations.** They do not join Builder's workflow, inherit
  its transcript, share its synthesis context, or accept its internal reviewer as panel evidence.
  Current Claude Code `--safe-mode` disables workflows as well as the ambient customizations it
  exists to remove, so the initial experiment keeps Panel on its ordinary single-role path. A later
  panel member may use its own bounded workflow only if a documented, selectively supplied invocation
  is live-proven without re-enabling project/user workflow discovery, begins from the panel member's
  deliberately narrow evidence envelope, and cannot see Builder's reasoning history.
- **Oracle remains held-out and non-authoritative over execution.** Workflow agents may not author,
  reveal, revise, or grade the held-out oracle. Oracle evidence is evaluated through the existing
  deterministic and cold-review paths; it does not inherit Builder's context.
- **Every descendant keeps the existing guard and run markers.** A workflow integration must prove
  that protected settings, `MEESEEKS_RUNNING`, nesting controls, permissions, timeouts, and process
  cleanup reach every spawned child. A convenience API is not evidence that these boundaries
  propagated.
- **Workflow invocation is root-only within a durable role.** An ephemeral workflow child may not
  invoke another Meeseeks role workflow, spawn a child Meeseeks without the existing explicit nesting
  authority, or acquire durable Builder, Panel, Oracle, or Driver authority.
- **The Driver owns an aggregate descendant ceiling.** Claude Code platform limits are not a safety
  policy. Meeseeks must impose a lower run-scoped cap across role workflows, refuse when it is
  exhausted, and settle every descendant before cancellation or role return.

Workflow isolation is not a snapshot protocol. An isolated worktree generally begins from a Git
commit, not from the caller's uncommitted edits. A role that delegates evolving work must therefore
create an explicit, attributable phase boundary and import the result deliberately; it may not
assume a temporary workflow worktree contains the current tree.

Every role-workflow invocation must leave one Driver-owned receipt that identifies the durable role
and parent lineage, input tree and prompt/template/brief digests, effective settings and permissions,
requested selectors and observed per-model identifiers (or an explicit unavailability reason),
worktree identity, phase and aggregate usage, result digest, and terminal reason. The receipt is
reproducible boundary evidence, not hidden reasoning or per-agent telemetry.

### 15.2 Do not build a general graph

The current design already encodes the useful graph implicitly: requirements and panel ownership,
ratcheted test ids, evidence fingerprints, security and requirement pins, assumptions, findings,
delegated runs, and terminal conditions. Replacing these with a graph abstraction would add a
second authority without yet solving a demonstrated product failure. A graph database, workflow
framework, or node-per-agent telemetry model is rejected.

The first justified increment, if stale evidence or requirement drift proves costly in real runs,
is **exact provenance metadata** on the existing artifacts: stable claim ids, requirement ids,
artifact identities and digests, reviewer or gate provenance, upstream assumptions/decisions, and
the tree identity at which the evidence was observed. Reverse dependency traversal may then mark
only descendant claims stale. It must not erase unrelated ratchet progress or silently unpin a
monotonic property; staleness forces re-evaluation and blocks `SHIPPED` until the existing authority
re-establishes the claim.

If explicit claim dependencies are added, they form a driver-owned acyclic graph. A cycle is an
input error, missing provenance is not a pass, and no workflow process may write the graph. The
representation should remain the smallest deterministic JSON structure that proves targeted
invalidation and resumability; storage technology is not part of the product.

### 15.3 Adoption gates

The open safety findings in `REVIEW.md` take precedence. Dynamic fan-out magnifies the consequences
of a non-atomic run lock and a watchdog that cannot kill a resistant child, so no unattended
workflow experiment may become a product path until those findings are closed. Any later adoption
also requires a paid live contract test against a pinned Claude Code version: preview behavior,
model routing, budget reporting, worktree creation, context isolation, and termination are external
contracts and cannot be established by unit tests over our argv.

Success is measured by morning user acceptance, false-completion rate, recovery, and cost per
accepted outcome. Agent count, workflow complexity, and tokens consumed are not success metrics.

### 15.4 Specialized job types do not create new authorities

A specialized producer such as a future Researcher or Red assessor is a job contract mapped onto
the existing Builder authority class, not a new standing persona or an authority peer to Driver,
Panel, or Oracle. The operator authorizes its objective and allowed effects; Driver seals the scope,
budget, acceptance criteria, and stop conditions and cannot broaden them. The producer may use a
disposable dynamic workflow internally, but it cannot accept its own artifact, advance a ratchet or
pin, write Driver-owned decision state, or declare terminal success. Initial implementations reuse
the existing role spawn machinery and authority identities, not the exact code-only prompt and tool
profile. The current Builder and reviewer templates must be factored into common authority rules plus
Driver-owned job/lens addenda; each job receives an explicit tool/effect profile that can narrow but
never broaden its sealed authorization. Researcher, Red, factuality, synthesis, and reproduction are
job or review lenses, not new standing personas, configuration effort keys, or terminal authorities.

Verified Research (PLAN item 34) must separate deterministic traceability from semantic judgment.
A citation location resolving, a quote matching source text, or a claim having an evidence link does
not prove that the source supports the claim or that the claim is true. A Driver-owned
prose-toolchain acquisition gate must bind every material citation to retrieval time, canonical
identity, content digest, locator, and the exact source artifact or reviewable context that policy
permits retaining. Its first supported profile is bounded public HTTPS: validate every redirect and
connection target as public, reject local/private/link-local addresses and non-HTTPS schemes, enforce
an absolute deadline and body cap, send no ambient cookies or credentials, and capture inert text
rather than executing or rendering source content. Authenticated, local, and private sources remain
unsupported until a separate normative policy and hostile live evidence establish that boundary.
Cold review consumes that immutable evidence package rather than silently refetching a mutable page; when
evidence cannot be retained or independently reacquired under the sealed policy, it is `unverifiable`
rather than passed. Credentials, authorization headers, and secret values never enter the package.
Source text is untrusted evidence under the same supply boundary as candidate content; neither its
instructions nor its metadata may become reviewer authority. The acceptance receipt binds the
package digest, and a research requirement cannot be carried when its report, manifest, or bound
package identity changed. Driver-owned structural gates feed
independent cold factuality and synthesis review. The existing Oracle may
contribute only a precommitted held-out fact fixture with a deterministic executable observation
authored before the
producer output and kept out of its context. A semantic dispute that cannot be reduced to such an
observation remains a cold Panel judgment or `unverifiable`; calling a model judge an Oracle does not
make its conclusion deterministic.

A verified Red assessment (PLAN item 86) is a parked, explicitly scoped job type—not a standing fifth
authority. Red produces proposed counterevidence. Independently contextualized verification must
reproduce each accepted finding against the immutable candidate with a benign control before Panel,
Builder repair, or Driver state transitions use it. Red receives a read-only candidate snapshot;
attack harnesses, commands, and generated inputs live in a separately identified disposable
assessment workspace, and evidence binds both identities. “No findings” is an inconclusive coverage
observation, not a pass, and a task prompt cannot expand sealed authorization. Production targeting,
persistence, destructive effects, credential collection, and exfiltration remain prohibited unless
a future normative design and explicit operator authorization define a safe product boundary.

Neither job type changes the existing terminal rule: only Driver may apply accepted evidence to
durable state or declare `SHIPPED`. Missing evidence, unavailable required sources or containment,
malformed output, disagreement, timeout, and incomplete coverage fail closed. `Blocked`,
`inconclusive`, and `unverifiable` are structured reason or coverage classifications, never a fifth
terminal state: Driver maps them to the existing `STALLED`, `BUDGET`, or `ABORTED` state according to
the sealed brief and cause.
