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
                        red-evidence · security-audit · ci · docs · observability.  no LLM.
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

### 5.1 impeccable — the flagship entry (confirmed)

[impeccable](https://impeccable.style/) is a frontend design skill/plugin (1 skill, 23
commands, a 58/59-rule "AI slop" detector). It plugs into `dare` in three places at once:

- **Install (Phase 1):** `npx impeccable install` (requires **Node 22.12+**), or in Claude
  Code add the marketplace and install via `/plugin`; first run is `/impeccable init`.
  `plugins.mjs` runs this idempotently before the loop.
- **As a Phase-3 gate:** impeccable ships a CI CLI — `npx impeccable detect src/` — with
  **deterministic rules, JSON output, and exit codes**. This is wired directly as a gate
  (call it `gate:design-slop`). Exit non-zero = iteration fails before review, same as
  lint. This is the deterministic half of DoD line 5 (§4).
- **As build-time guidance:** impeccable's Claude Code build installs **hooks + a
  subagent** that inspect each UI edit and feed findings back mid-build, plus commands the
  builder can invoke (`/impeccable polish`, `/impeccable audit`, `/impeccable distill`,
  `/impeccable typeset`).

**Two integrations worth doing because impeccable already speaks these files:**
- impeccable reads **`PRODUCT.md`** for context on every command. Phase 0 already produces
  the PRD, so Phase 1 also emits a short `PRODUCT.md` (users, mode, brand voice,
  anti-references) so impeccable designs with real context instead of defaults.
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
1. Writes to `.dare/state.json`, `.dare/config.json` or `.dare/lessons.json` — the ratchet,
   its configuration and the lesson store are not editable by the process they constrain. A
   builder that can rewrite the memory it is handed is not constrained by it: it could store
   itself any instruction it liked and receive that back as evidence next iteration. The
   rest of `.dare/` — the blooper reel, the archived briefs — stays readable and writable;
   the driver owns those, and nothing reads them back as a decision.
2. `git push --force`, `rebase`, `filter-branch`, `reflog expire` — recovery stays
   possible.
3. `rm -rf` outside `/tmp`.

Everything else is allowed. Emits `permissionDecision: "deny"` with a reason; exit 0 either
way. **That restraint is the plugin.**

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
│   ├── brief.mjs                 # compiles the per-iteration Build Brief (§8.1)
│   ├── lessons.mjs               # sparse evidence-derived lesson memory (§13.8)
│   ├── history.mjs               # conditional git-history context (§8.2)
│   ├── race.mjs                  # stalled-only worktree racing (§13.6)
│   ├── health-probe.mjs          # starts the app and asks /health (§4 line 4)
│   ├── plugins.mjs               # quality-plugin auto-install
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
| `tokenCeiling` | 4_000_000 | |
| `reviewers` | `["security","correctness","design"]` | the specialized cold panel (§1.1); each owns its DoD lines |
| `ownership` | see §1.1 | reviewer → id patterns (`*` is the only wildcard). Must cover every required id, or the run refuses to start |
| `requireUnanimous` | true | every panel member must return pass on its lines |
| `builderModel` | `claude-sonnet-5` | iterates a lot; too-cheap thrashes and costs more iterations than it saves |
| `reviewerModel` | `claude-opus-5` | the judge should be the smartest thing in the loop |
| `designModel` | `claude-opus-5` | Phase 1 — design mistakes compound across every later iteration |
| `prdModel` | `claude-sonnet-5` | Phase 0 PRD authoring |
| `styleModel` | `claude-fable-5` | Junkion narration + "dare me" idea invention; pure flavor, never touches gate logic |
| `lessonModel` | `claude-sonnet-5` | the cold lesson extractor (§13.8); advisory, so it never needs the strongest model |
| `qualityPlugins` | `["impeccable"]` | auto-installed in Phase 1 (§5) |
| `deploy.enabled` | **false** | preview-only when enabled; never prod |
| `deploy.command` | `""` | pluggable shell deploy; empty → auto-detect (vercel.json/netlify.toml/Dockerfile), else no-op. Reference recipe: `vercel deploy --prebuilt` |
| `extractTests` | true | parse JSON reporter output into ratchet IDs |
| `chaos` | 1 | stupidity dial, 1–3; per-iteration scope budget (§13) |
| `realityCheck.after` | 3 | stalled iterations before the buildability breaker fires (§13) |
| `dareMe.enabled` | true | allow `/dare` with no args to invent its own PRD (§13) |
| `race.enabled` / `race.n` / `race.after` | false / 3 / 2 | worktree builders raced **only after `after` stalled iterations** (§13.6) |
| `advisory.minConfidence` | 0.7 | below this an advisory finding is recorded and not acted on (§4.1). Cannot affect PRD/DoD compliance at any value |
| `lessons.enabled` / `lessons.maxPerBrief` | true / 3 | evidence-derived lesson memory, and how many may enter one brief (§13.8) |

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
  smallest diff, then candidate order. Both are properties of the work rather than opinions
  about it, so a deterministic winner always exists and **no cold chooser is needed or
  used**.
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
