# dare-to-be-stupid — Design (v2, refined)

> A Claude Code plugin. One command, `/dare`, hands an idea or PRD to an autonomous
> loop that authors specs, designs, builds, tests, secures, ships, fixes, and iterates
> until the app passes an *enterprise-production* definition of done — or the budget dies.
>
> Named for the Weird Al song. The joke is that it runs the Ralph Loop **on purpose**,
> with `--dangerously-skip-permissions`, and narrates the whole thing in the voice of an
> '80s Junkion. Pre-production only. Never points at anything with users.

This is v2. It keeps the strong core of the original spec (external reviewer, ratchet,
guard hook, Junkion style) and adds the three phases the original left thin relative to
the actual goal: **PRD authoring, a design phase, and a real enterprise DoD** including
security, CI, docs/observability, and design quality (with quality plugins auto-installed).

---

## 0. The premise, in one paragraph

The User builds documentation-first: spec → system docs → API contracts → `CLAUDE.md` →
code. `dare-to-be-stupid` is the deliberate inverse, packaged as comedy that also solves
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
contains `.dare/briefs/iter-003.md` can open it. What does the work is the framing, not a
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
means something if the split is written down, so `ownership` in `.dare/config.json` maps
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
A, until budget death with nothing to show. `.dare/state.json` holds every test ID that
has *ever* passed. If an iteration drops one: `git reset --hard`, the regression becomes
the next build task, nothing else proceeds. Monotonic. A test that has passed is never
allowed to fail again. This is the single mechanism that turns an infinite loop into a
terminating one. **Build it first.**

---

## 2. The pipeline (full)

The original spec was really *build → review → ship*. The goal is *design → build → deploy
→ fix → iterate*. Here is the whole thing. Phases 0 and 1 run **once** at the top; the
loop is phases 2–6.

```
/dare <path-to-PRD | "idea in quotes" | (nothing)>
└─ node scripts/driver.mjs
   ─────────────────────────────────────────────────────────────
   PHASE 0  IDEATE      idea → PRD.md          (claude -p, PRD template)      [once]
   PHASE 1  DESIGN      PRD → design docs      (claude -p, arch template)     [once]
                        + auto-install quality plugins (impeccable, …)
   ─────────────────────────────────────────────────────────────  loop start ↓
   PHASE 2a BRIEF       compile the objective + evidence into .dare/briefs/iter-NNN.md
                        (deterministic, no LLM)                                   (§8.1)
   PHASE 2b BUILD       claude -p, --dangerously-skip-permissions, brief as the task
                        (or, when stalled and armed, a worktree race — §13.6)
   PHASE 3  GATES       exit codes only. build · lint · types · unit · e2e ·
                        red-evidence · security-audit · ci · docs · observability ·
                        gate-integrity.  no LLM.
   PHASE 4  RATCHET     regression? hard reset, feed back, restart iteration
   PHASE 5  REVIEW      specialized cold claude -p panel, each member on the ids it owns,
                        unanimous-or-continue, vs PRD + design + DoD  (strongest model)
   PHASE 6  SHIP        commit · tag dare/iter-NNN · push · preview deploy
   ─────────────────────────────────────────────────────────────  loop end ↑
```

Gates run **before** review — they're free and deterministic, so there's no reason to
spend expensive reviewer passes on something that doesn't compile.

**Terminal states:** `SHIPPED`, `STALLED`, `BUDGET`, `ABORTED`.

### Phase 0 — Ideate (the `/dare "idea"` path)
If the argument is a file, skip this. If it's a quoted idea — or **nothing at all**, in
which case "dare me" mode (§13) invents its own idea — a `claude -p` call with
`templates/prd-author.md` turns it into a structured `PRD.md` with **numbered, testable
requirements** (`PRD-1.1`, `PRD-3.2`, …).
Numbered requirements are load-bearing: the reviewer emits one verdict object per
requirement ID, so the PRD's structure *is* the DoD checklist. Unattended by default;
`--confirm-prd` pauses for a human read before the loop starts.

### Phase 1 — Design (the phase the original spec skipped)
A `claude -p` call with `templates/architect.md` produces, into `docs/`:
`architecture.md` (components + boundaries), `api-contract.md`, `data-model.md`, and a
project `CLAUDE.md` (test gates + slice rules). These are **emitted artifacts and review
inputs**, not gates on their own — but "design quality" *is* a DoD line the reviewer
checks (§4). This is also where the driver **auto-installs quality plugins** (§5) so their
hooks/skills are live for every build iteration.

### Phases 2–6
Build, gates, ratchet, review, ship — the loop. Detailed below.

---

## 3. Architecture — driver lives *outside* the session

The driver lives outside any Claude Code session. It has to: the ratchet needs persistent
state across processes, and the reviewer needs a clean process with no build framing. A
loop living inside a session can do neither.

- `commands/dare.md` — preflight checks, then shells out to the driver.
- `scripts/driver.mjs` — the loop. Node, **no runtime dependencies** (`node:` builtins +
  shelling out). Owns state, spawns `claude -p` for build/review/ideate/design, runs gates.
- Each `claude -p` is a fresh process. Builder gets full context; reviewer gets a
  deliberately starved one.

---

## 3.5 Prerequisites & preflight (what the user sets up)

The goal is that the *only* things the user does are: install the plugin, be in a repo, and
run `/dare`. Everything else is either checked-and-explained by preflight or installed by
the run itself. `commands/dare.md` runs preflight **before** shelling to the driver and
**fails loud** rather than starting a half-configured unattended run.

**Preflight verifies (hard-fails with a fix hint if missing):**

| Check | Why | If missing |
|---|---|---|
| Node ≥ 22.12 | driver + impeccable installer | abort, print required version |
| `claude` on PATH, callable non-interactively, authed | driver spawns `claude -p` children | abort, tell user to sign in |
| Inside a git repo, **clean working tree** | ratchet does `git reset --hard` | abort, tell user to commit/stash |
| Remote is **not** prod/client/customer (if a remote exists) | never point at users | abort |
| Network reachable (npm registry) | impeccable + tooling install | abort |
| `.dare/config.json` exists | run config | auto-run `dare init` (one-time scaffold) |
| **Agent-config security scan** clean | dangerous mode trusts the repo's own hooks/prompts/MCP/secrets | abort on findings (§3.6) |
| `--dangerously-skip-permissions` acknowledged | the premise; guard hook is the safety | require `--yes` or an interactive confirm |

**Installed by the run, not the user:** vitest, Playwright + browsers (`npx playwright
install`), and impeccable (`npx impeccable install`) are provisioned during Phase 1/early
build. A greenfield idea → PRD → repo with no `package.json` is fine; the builder scaffolds
it.

**Not required unless opted in:** deploy host + credentials (only when `deploy.enabled`).

**Not setup, but the real cost:** API budget. Build + reviewer-panel whole-repo reads ×
up to `maxIterations` is the dominant spend; `tokenCeiling` is the backstop that ends a run
`BUDGET` before it runs away.

**`tokenCeiling` is a stop signal, not a cap, and the difference is larger than it sounds.**
Every child's spend is charged the moment it returns — including Phase 0 and Phase 1, which run
before the loop and are threaded in as `alreadySpent` (they were uncounted until v0.35.0, so a
run could spend an entire PRD and design phase *and then* the whole ceiling). But nothing can
price a child *before* running it, and `claude -p` accepts no token limit the driver could pass.
So the guarantee is: **the ceiling, plus one unbounded child.**

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

**On a subscription neither is the binding constraint.** There the limit is the rate-limit
window, and a child that runs out of allowance is told apart from a child that failed:
`EXHAUSTION_PATTERN` marks it, the work in progress is **committed**, and the run ends `BUDGET`
saying it can resume. A stalled allowance is not a failed build and must never be scored as one.

---

## 3.6 Agent-config security scan (borrowed from ECC's AgentShield)

The guard hook (§6) is *runtime* safety. This is the *static, pre-run* half. dare runs
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

**Where it is kept.** `.dare/capabilities.json`, driver-owned:

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
needs no new guard rule — the §6 hook denies a run's own children any write under `.dare`,
positionally. That matters here specifically: a builder able to edit this file could declare
away the capability whose gate it cannot pass, and the run would ship having never checked it.

The resolved set is handed to each iteration's Build Brief (§8.1) so the builder knows what it
is building. It does not yet choose gates; that is the capability-to-gate table, which sits on
top of §3.8 and is not built.

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
| `mutation` | `npx --yes @stryker-mutator/core run .dare/stryker.config.json --testRunner vitest --mutate …` (§4.4) |
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

### 4.3 Pins — the second and third monotonic properties

The ratchet is monotonic on **test ids**. That closes oscillation on the one property the loop
can measure for free, and says nothing about two others that degrade just as quietly.
`scripts/pins.mjs` is the same mechanism pointed at both, and `.dare/pins.json` is driver-owned.

**Security elements (A4).** SCAFFOLD-CEGIS (arXiv 2603.08520) reports that security degrades
*gradually across iterations* through specification drift — 43.7% of ten-round chains ended
more vulnerable than baseline — and that adding a static SAST gate made it **worse**, 12.5% to
20.8%, because static rules cannot see removed defensive logic or weakened exception handling.
Dare had exactly the shape they measured: `npm audit` plus a security auditor, per iteration,
with no memory. When the security reviewer passes an id with `file:line` evidence, that line is
pinned as a defensive element.

**Requirements (A8).** A requirement a cold reviewer passed with `file:line` evidence is pinned
to that file, so a later panel can tell whether the ground it was passed on has moved.

Same shape, opposite failure directions, and that difference is the design:

| | fingerprint | when it stops matching |
|---|---|---|
| security element | the **snippet**, whitespace-normalised | escalate; may become a regression |
| requirement | the whole **file** | unpin, and re-establish from scratch |

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
every write under `.dare` positionally.

**A run with pins it cannot re-verify aborts.** Carrying them forward unchecked would report the
same clean pass as a run that verified everything, which is §4's own rule about silent skips.

> **Not yet built: carrying a pass to skip a reviewer call.** A8's saving — asking the panel
> only about un-carried ids — is deliberately not wired. Its cost premise was found false
> (Phase 5 sits behind `if (!gateOutcome.ok) continue`, so a failing iteration never pays for a
> reviewer), no run has reached the panel twice, and there is therefore no baseline to measure
> the saving against. The store, the invalidation and the fail-closed half are built; the
> optimisation waits for a run that demonstrates review is the dominant cost.

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
`.dare/assumptions.json` has it reasoning about the contradiction in the plugin's own brief and
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
config path positionally, so the driver writes `.dare/stryker.config.json` and passes it. §6
denies the builder every write under `.dare`, positionally, so the threshold is out of reach.

`break: 100` rather than a percentage, because the question is "did any mutant on the changed
code survive" and not "is the score good enough". A percentage is a threshold, and thresholds
drift — which §13 rejects by name.

Tests are never mutated. A mutated test is an oracle turned into a lie.

---

## 5. Quality-plugin auto-install (the "install plugins like impeccable" line)

**Goal:** the design/build phases should stand on the shoulders of existing quality
plugins rather than reinventing linters and reviewers. During Phase 1, the driver installs
a curated, config-declared set of plugins so their hooks and skills are active for every
subsequent iteration.

- `.dare/config.json` → `qualityPlugins: ["impeccable", ...]` (a list of plugin refs /
  marketplace entries).
- Driver runs the install step idempotently before the loop; already-installed plugins are
  skipped. Failure to install a *required* plugin aborts with `ABORTED` (we don't silently
  drop a DoD contributor). Optional plugins warn and continue.
- Where a quality plugin exposes a gate command, it becomes a Phase-3 gate; where it
  exposes only guidance/skills, it informs the builder and reviewer.

### 5.0 The other detectors, and why they are detectors

`qualityPlugins` defaults to `["impeccable", "knip", "semgrep"]`. All three are
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
DoD line. knip and semgrep are optional and degrade to a warning: semgrep needs `python3`,
and neither is worth killing a run over on a machine that lacks it.

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
commands, a 58/59-rule "AI slop" detector). It plugs into `dare` in three places at once:

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

**`PRODUCT.md` and `.dare/capabilities.json` are split by question, not by file, and nothing
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
2. **`DESIGN.md` is impeccable's file in a *target app*.** In generated apps, `dare` keeps
   its own design output under `docs/` (`architecture.md`, `api-contract.md`,
   `data-model.md`) and leaves the repo-root `DESIGN.md` to impeccable. (This repo's own
   `DESIGN.md` — the file you're reading — is the plugin's design and is unaffected.)

---

## 6. The guard hook — the limit that survives permission-skipping

The builder runs with `--dangerously-skip-permissions`. That's the premise. PreToolUse
hooks fire **regardless** of permission mode, which makes them the only reliable place to
put a limit when everything else is off.

`hooks/guard.mjs` reads the PreToolUse payload as JSON on stdin and blocks exactly:
1. Mutation of **any path under `.dare/`** from inside a run. Reads are untouched. The
   directory holds the state and the evidence a run is judged by, and the process being
   judged does not write either. A builder that can rewrite the memory it is handed is not
   constrained by it; a builder that can rewrite the *evidence* is not judged at all.

   This clause used to name three files — `state.json`, `config.json`, `lessons.json` — and
   said of the remainder that "the driver owns those, and nothing reads them back as a
   decision". That was false when it was written. `.dare/red-evidence.json` is the record of
   which tests have ever been seen failing, and RED-before-GREEN says a test with no red
   history does not count toward the ratchet — so a builder able to write that file can mint
   its own proof and take credit for a test that was never red. `.dare/test-report.json` is
   what the ratchet parses to decide whether anything regressed. The archived briefs are the
   only record of what was actually asked for. Every one of them is read back as a decision.

   The rule is therefore positional rather than nominal: inside `.dare/` is driver-owned, at
   any depth, including artifacts that do not exist yet. Enumeration was the defect — each
   new artifact silently defaulted to writable until someone remembered to list it.

   Reads stay available because `hooks/hooks.json` matches only the mutating tools, so the
   hook never fires on `Read`. Bash is the exception and is refused outright, reads included:
   a shell cannot be separated into reads and writes without a whitelist that fails open on
   the first `tee`, `sed -i` or heredoc nobody thought of. The builder does not need the
   shell route regardless — its brief arrives in the prompt, not from disk.

   The driver's own writes are unaffected, and not by exemption: the driver writes `.dare/`
   with `node:fs` in its own process, never through a Claude tool, so no PreToolUse hook ever
   sees them.

   "Inside a run" is `DARE_RUNNING` in the hook's own environment. The driver stamps it on
   every `claude -p` child it spawns, and PreToolUse hooks inherit the environment of the
   `claude` process — verified live against claude 2.1.226, not assumed. A builder cannot
   clear it, because the hook's environment comes from the process the driver spawned rather
   than from any shell the builder can run.

   The scoping is not a softening; it is the rule finally matching its own justification.
   Applied unconditionally this clause locked the *operator* out of `.dare/config.json` in
   every session forever — there was no way to change `maxIterations` from inside Claude
   Code, and this project's own advice to delete a useless `.dare/lessons.json` could not be
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
permission mode, it covers `.dare/` at any depth including artifacts that do not exist yet, and
three properties are asserted rather than assumed: a run is denied the write, an operator is
allowed it, and a neighbour that merely resembles the name is untouched.

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
mean.** No current artifact needs to be unreadable. `.dare/red-evidence.json` is dangerous to
write and harmless to read — knowing which ids have red history lets a builder forge nothing.

Both halves are already asserted, and were before this section named them. `test/guard.test.mjs`
covers the guarantee — denied to a run, allowed to an operator, benign neighbours untouched — and
`test/plugin-manifest.test.mjs` covers the read route staying open, by asserting the matcher
excludes the read-only tools. That second test is the one that matters most here: adding `Read`
to the matcher would silently convert a write barrier into a blackout, and a blackout would look
like a seal without being one.

---

## 7. File layout

```
dare-to-be-stupid/
├── .claude-plugin/
│   ├── plugin.json               # plugin manifest (name, commands, hooks)
│   └── marketplace.json          # lets `/plugin marketplace add owner/repo` resolve
├── commands/dare.md              # preflight, then shells to driver
├── scripts/
│   ├── driver.mjs                # the loop. node, no deps.
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
│   ├── context-budget.mjs        # measures a prompt before the child is spawned (§3.9)
│   ├── pins.mjs                  # pinned security elements and requirements (§4.3)
│   ├── assumptions.mjs           # what the builder had to assume (§8.3)
│   ├── run-manifest.mjs          # .dare/run.json, and archiving the last run (§7.1, §7.2)
│   └── init.js                   # scaffolds .dare/config.json, refuses risky remotes
├── hooks/
│   ├── hooks.json                # PreToolUse on Bash
│   └── guard.mjs                 # the limit that survives permission skipping
├── templates/
│   ├── prd-author.md             # idea → PRD           (Phase 0)
│   ├── architect.md              # PRD → design docs     (Phase 1)
│   ├── builder-system.md         # Phase 2
│   ├── reviewer-system.md        # Phase 5 (the actual product)
│   └── lesson-extractor.md       # evidence → one lesson, or null (§13.8)
├── output-styles/junkion.md
└── test/fixtures/                # real vitest + playwright reporter output
```

### 7.1 `.dare/run.json` — what this run was

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
  "plugin": { "name": "dare-to-be-stupid", "version": "0.17.0" },
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

**No secrets.** The configuration is recorded as a hash, not embedded. Today `.dare/config.json`
holds only models, counts and booleans, so embedding would be harmless; hashing stays harmless
after someone adds a field that is not, and still answers the question worth asking — was this
the same configuration as that run?

**Nothing is inferred.** Every value is passed in, and a missing one throws rather than
defaulting. A manifest that quietly says `"unknown"` is worse than no manifest: it looks like
evidence. A version probe that fails contributes no key at all, so an absent `claude` entry
means nobody managed to ask, not that there is no Claude.

It needed no new guard rule. §6's protection is positional, so a builder cannot rewrite the
record of what it is.

### 7.2 `.dare/runs/NNN/` — the previous run, kept

A manifest that only ever describes the *current* run is current rather than forensic. Before
this run writes anything of its own, the previous run's artifacts are moved to
`.dare/runs/NNN/`.

**What is actually lost between runs was the whole of this work, because the two accounts
previously written down were both wrong.** `.dare` state is *not* replaced per run:
`state.json` is loaded and carried forward — that is how the ratchet survives a run boundary —
and `lessons.json`, `red-evidence.json` and `bloopers.log` all persist deliberately. But the
briefs do not merely *accumulate* either. **Iteration numbering restarts at 1 on every run**,
because it lives in the driver's in-memory `progress` rather than in `state.json`. So a second
run writes `briefs/iter-001.md` over the first run's, then `iter-002.md` over the next, and the
loss is silent: the replacement looks exactly like the original.

Three artifacts are archived, and each earned its place:

| artifact | why |
|---|---|
| `run.json` | overwritten wholesale, and the only record of what a run *was* |
| `briefs/` | collides by number, per above; the only record of what the builder was actually asked on the iteration a run went wrong |
| `reality-check.md` | overwritten, and it is the reasoning behind an `ABORTED` |
| `assumptions.json` | **appended**, not overwritten — a different fault with a worse consequence, below |

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

It needs no new guard rule. §6 is positional, so `.dare/runs/` is protected the day it appears.

**Install (one time, from any Claude Code session):**

```
/plugin marketplace add trevor-ryan-burkholder/dare-to-be-stupid
/plugin install dare-to-be-stupid@dare-to-be-stupid
```

Then `/dare <path|"idea"|∅>`. The interactive session need not run with
`--dangerously-skip-permissions`; the driver applies that flag only to the `claude -p`
build children it spawns (§3), fenced by the guard hook (§6).

---

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
  `.dare/red-evidence.json`, written **once**, and admitted — and the gate *says* how many it
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
evidence and archives it to `.dare/briefs/iter-NNN.md`. It carries:

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

### 8.3 The assumptions log — what the builder decided that nobody asked it to

Karpathy's first principle: models make wrong assumptions on your behalf and run along with
them without checking. The stated remedy — ask for clarification — is incompatible with an
unattended loop; there is nobody to ask, and a builder that stalls waiting burns the stall
limit. The translation that works is that the builder may not resolve an ambiguity *silently*.
It records the interpretation, and the record is handed to the **reviewer**, who can check "you
assumed X; the PRD says Y". An unstated assumption is a thing that defaults to pass.

It travels on the builder's only return channel: one fenced json block alongside its one or two
lines, parsed by `scripts/assumptions.mjs` and appended by the driver to
`.dare/assumptions.json`. The builder never writes the file — §6 denies it positionally — which
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
(§11.1). `test/live/assumptions-contract.live.test.mjs` is written and **has never been run**.

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

## 9. Junkion output style (cosmetic only)

Applied at render. **Never** touches gate logic, ratchet state, or reviewer JSON.

Junkions learned language entirely from intercepted TV: reassembled advertising copy, game
show patter, infomercial pitches. **The mapping must be tight** — every fragment encodes
the real event, or it's noise, and noise isn't the joke.

| Real event | Junkion render |
|---|---|
| Test failure | Voluntary product recall naming the failing module + count |
| Deploy / ship | Limited-time offer, now available |
| Rollback / hard reset | Interrupted broadcast, technical difficulties |
| Security gate fail | Urgent safety notice, affected units |
| Budget / airtime ending | We are experiencing higher-than-normal call volume / stay tuned |
| Reality-check abort | Technical difficulties, please stand by |
| SHIPPED | Grand prize awarded |

- Wrong: `THIS IS A FANTASTIC OFFER! GREAT SAVINGS!`
- Right: `WE ARE ISSUING A VOLUNTARY RECALL ON AUTH-MIDDLEWARE. AFFECTED UNITS: FOURTEEN.`

**Never styled:** code, identifiers, commit messages, JSON, file paths, stack traces, test
names, error text. Failure output appears verbatim and unstyled — a garbled stack trace is
funny once, then it's a broken tool. `DARE_STYLE=plain` bypasses entirely.

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
JSON, and `DARE_STYLE=plain` suppresses it. Final art designed at build time.

---

## 10. Config — `.dare/config.json`

| key | default | note |
|---|---|---|
| `maxIterations` | 25 | |
| `stallLimit` | 4 | iterations with no gate improvement before abort |
| `tokenCeiling` | 4_000_000 | bounds *work*. Not a cap and not convertible to money — see §3.5 |
| `costCeiling` | 50 | bounds *spend*, in USD, from the envelope's own `total_cost_usd`. Decimals allowed |
| `reviewers` | `["security","correctness","design"]` | the specialized cold panel (§1.1); each owns its DoD lines |
| `ownership` | see §1.1 | reviewer → id patterns (`*` is the only wildcard). Must cover every required id, or the run refuses to start |
| `requireUnanimous` | true | every panel member must return pass on its lines |
| `builderModel` | `claude-sonnet-5` | iterates a lot; too-cheap thrashes and costs more iterations than it saves |
| `reviewerModel` | `claude-opus-5` | the judge should be the smartest thing in the loop |
| `designModel` | `claude-opus-5` | Phase 1 — design mistakes compound across every later iteration |
| `prdModel` | `claude-sonnet-5` | Phase 0 PRD authoring |
| `styleModel` | `claude-fable-5` | Junkion narration + "dare me" idea invention; pure flavor, never touches gate logic |
| `lessonModel` | `claude-sonnet-5` | the cold lesson extractor (§13.8); advisory, so it never needs the strongest model |
| `qualityPlugins` | `["impeccable", "knip", "semgrep"]` | auto-installed in Phase 1 (§5); impeccable required, the other two degrade to a warning |
| `deploy.enabled` | **false** | preview-only when enabled; never prod |
| `deploy.command` | `""` | pluggable shell deploy; empty → auto-detect (vercel.json/netlify.toml/Dockerfile), else no-op. Reference recipe: `vercel deploy --prebuilt` |
| `extractTests` | true | parse JSON reporter output into ratchet IDs |
| `chaos` | 1 | stupidity dial, 1–3; per-iteration scope budget (§13) |
| `realityCheck.after` | 3 | stalled iterations before the buildability breaker fires (§13) |
| `dareMe.enabled` | true | allow `/dare` with no args to invent its own PRD (§13) |
| `race.enabled` / `race.n` / `race.after` | false / 3 / 2 | worktree builders raced **only after `after` stalled iterations** (§13.6) |
| `advisory.minConfidence` | 0.7 | below this an advisory finding is recorded and not acted on (§4.1). Cannot affect PRD/DoD compliance at any value |
| `lessons.enabled` / `lessons.maxPerBrief` | true / 3 | evidence-derived lesson memory, and how many may enter one brief (§13.8) |
| `contextBudget.maxCharacters` | 400_000 | the assembled prompt ceiling, measured before spawn (§3.9). Characters, not tokens; sized to fire on a runaway rather than to maximise utilisation. No `enabled` key on purpose |

`init.js` refuses to initialize against a remote matching `prod`, `production`, `client`,
or `customer`, and requires a clean working tree (the ratchet's `reset --hard` destroys
uncommitted work).

---

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

Four behaviours must survive any widening, and each has a test. **Unidentifiable throws** —
never an empty id set, which reads exactly like a green run. **Malformed throws**, naming what
was wrong. **An unknown status throws**, naming the value, because mapping it to `passed`
would admit it to the ratchet and mapping it to `failed` would fire a hard reset on a word
nobody has read. **Empty does not throw** — "no test files" is a real state, and refusing to
advance on it belongs to the ratchet, not to a parser. That last one is not theoretical: it is
what both live runs on 10 August 2026 produced, and every component behaved correctly.

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

Tier 3 is armed by `DARE_LIVE=1` and **fails without it** rather than skipping. A green tick
for a suite that made no API call is a lie the reader will take for coverage, and this codebase
does not get to refuse silent passes everywhere else and then ship one in its own harness.

---

## 12. Build order

Write `CLAUDE.md` (test gates, slice-init rules) before step 1.

1. `guard.mjs` + fixture tests for block/allow cases
2. `extractTestIds` + fixture tests against real reporter output
3. Ratchet logic, isolated and unit-tested
4. `plugins.mjs` auto-install + `init.js` preflight
5. `driver.mjs` loop wiring
6. System/template prompts (prd-author, architect, builder, reviewer)
7. Output style last — it's cosmetic

Node, no runtime dependencies.

---

## 13. Extra-stupid features (folded in)

These are on by default (each has a config flag / env to tune). They ride on the same
event stream the Junkion style already renders — none of them touch gate logic, the
ratchet, or reviewer JSON.

### 13.1 "Dare me" mode — `/dare` with no args
`dareMe.enabled` (default `true`). Running `/dare` bare triggers a `claude -p` call that
**invents its own project idea**, hands it to the Phase-0 PRD author, and builds it
unattended. Maximum on-theme. Disable to make bare `/dare` an error instead.

### 13.2 The Blooper Reel — `.dare/bloopers.log`
Every ratchet hard-reset appends a record: iteration number, the test ID(s) that
regressed, and the offending diff stat. Doubles as a real post-run failure history and as
comedy — rendered in Junkion as a running series of voluntary recall notices. Written by
the driver, not the builder, so the guard hook's block on `.dare/` writes doesn't apply to
it (the driver owns it; the *builder* still can't touch it).

### 13.3 Reality-check circuit-breaker
`realityCheck.after` (default `3`). After that many consecutive stalled iterations (no gate
improvement), the driver spawns a cold `claude -p` meta-reviewer asking one question: *is
this PRD actually buildable with the code present, or is the loop chasing an impossible
spec?* If it returns unbuildable with reasons, the run ends `ABORTED` with a Junkion
"technical difficulties, please stand by" broadcast — instead of grinding the full budget
to zero. Its reasoning is written to `.dare/reality-check.md`.

### 13.4 Stupidity dial — `DARE_CHAOS` / `chaos`
`chaos` 1–3 (env `DARE_CHAOS` overrides), fed into the builder prompt as a per-iteration
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
The token/iteration budget is surfaced in the Junkion status line as "broadcast minutes
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
  `.dare/` (untracked, so it does not exist there until its own gates create it). No
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
- The winner lands by `git merge --ff-only`. The main tree has not moved, so the merge is a
  pointer move; if that is ever untrue it fails loudly rather than inventing a merge commit
  nobody reviewed.

> **Re-entrancy guard (not optional):** whatever the settings, the driver refuses to spawn
> a nested `dare` run and caps concurrent builders. ECC learned the hard way that
> autonomous loops re-enter and explode memory; dare blocks that at the driver, and the
> guard hook blocks a builder from invoking `/dare` at all.

### 13.7 Trophy tag
On `SHIPPED`, in addition to `dare/iter-NNN`, the driver tags the winning commit
`dare/GRAND-PRIZE` (Junkion: "grand prize awarded"). One trophy tag per run; a later run
that ships moves it. Purely a bookmark to the last commit that passed the whole DoD.

### 13.8 Lesson memory — sparse, evidence-derived, driver-owned
`lessons.enabled` (default `true`), stored in `.dare/lessons.json`. A lesson is one piece of
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
- **The driver owns it.** Builders cannot write `.dare/lessons.json` — the guard hook denies
  it alongside the ratchet (§6).
- **It is advisory, and it fails the opposite way to the ratchet.** Unreadable ratchet state
  stops a run, because continuing would silently discard earned ids. An unreadable lesson
  store degrades to *no lessons* plus a warning, because it cannot make a wrong build look
  right and refusing to continue over it would let a corrupt hint file kill a healthy run.
  Failing to extract a lesson never fails a build.

---

## 14. Decisions taken

Every question this design opened has been answered, and each answer lives in the section
that implements it: impeccable installation and gating (§5.1), "dare me" mode (§13.1),
pluggable deploy (§10), the specialized cold panel (§1.1), and model routing (§10).

One remains genuinely undecided, and is safe to leave that way: whether to add a backend or
security quality plugin alongside impeccable, which only inspects user interfaces. Until
one is chosen, the design-slop gate is simply not armed on a project with no UI — the
single gate skip §5.1 carves out.
