# Dare to be Stupid

Act now! Claude Code does EVERYTHING autonomously - batteries not included, warranty void, prod not invited. Dare to be stupid!

```
            \    |    /
             \   |   /
        +-------------------+
        |   ___       ___   |         "WE ARE ISSUING A VOLUNTARY
        |  | o |     | x |  |          RECALL ON AUTH-MIDDLEWARE.
        |   ---       ---   |          AFFECTED UNITS: FOURTEEN."
        |     ___________   |
        |    | ~ ~ ~ ~ ~ |  |
        |     -----------   |
        +-------------------+
         |___|         |___|
        [_____]       [_____]
```

> _"Put down that chainsaw and listen to me;
> It's time for us to join in the fight"_
>
> — "Weird Al" Yankovic, 1985. The song plays over the Junkions in
> _Transformers: The Movie_, which is where this thing gets its voice.

One command hands a specification to a loop that designs, builds, gates, audits and ships
it — unattended — until it passes an enterprise definition of done, or the budget dies.

```
/dare ./PRD.md          # build an existing spec
/dare "a link shortener with an admin page"
/dare                   # dare-me mode: it invents its own
```

**Pre-production only.** The build children run with `--dangerously-skip-permissions`.
Point this at a throwaway repository and nothing else.

## How it works

```
ideate ──► design ──► build ──► gates ──► ratchet ──► audit ──► ship
                        ▲                    │          │
                        └────────────────────┴──────────┘
                          regression, failing gate, or finding
```

Three things make it terminate instead of oscillate:

- **A ratchet.** Every test ID that has ever passed is recorded. If one stops passing, the
  run hard-resets and the regression becomes the only task.
- **A cold auditor.** Review happens in a separate process with no build log and no hint an
  agent wrote the code, because a builder cannot judge its own work.
- **A budget.** Iterations and tokens are both capped, read from what the children actually
  reported rather than estimated.

## Install

```
/plugin marketplace add trevor-ryan-burkholder/dare-to-be-stupid
/plugin install dare-to-be-stupid@dare-to-be-stupid
```

Requires Node ≥ 22.12, the `claude` CLI, and a git repository. The run installs its own test
tooling and quality plugins.

`DESIGN.md` is the spec. `CLAUDE.md` is how work happens in this repo.

---

## The guard hook

`hooks/guard.mjs` is a PreToolUse hook. PreToolUse hooks fire regardless of permission
mode, so it keeps working when the builder runs with `--dangerously-skip-permissions`
(`DESIGN.md` §6). It reads the hook payload as JSON on stdin and denies four categories:

| Rule              | What it blocks                                                                                                   | What it deliberately leaves alone                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `protected-state` | **mutation of any path under `.dare/`, at any depth, including files that do not exist yet** — but only from inside a run | reads, always; every write by the operator outside a run; `tsconfig.json`; an app's own `src/state.json` |
| `git-history`     | `push --force` / `-f` / `--force-with-lease`, `rebase`, `filter-branch`, `reflog expire`                         | ordinary pushes, `git reset --hard` (the ratchet needs it), `git reflog`, "rebase" inside a commit message |
| `rm-recursive`    | recursive `rm` outside the temp directory, and any recursive `rm` whose target cannot be resolved before it runs | non-recursive `rm`, `rm -rf /tmp/...`, `rmdir`                                                             |
| `nested-dare`     | a builder invoking the slash command — **and any Bash whose text contains it, including a commit message describing it, and any text in command position, heredoc bodies included** | the word inside a longer token: `dare-logs/`, `.dare/`, `dare-to-be-stupid`. **Not** prose in general — see below |

A malformed or unparseable payload is a **deny**. A guard that fails open is not a guard.

**`nested-dare` has a known false positive, and this table used to describe it wrongly.** It said
the rule "deliberately leaves alone the bare word in prose". It does not: the payload is tokenized
like a shell command, so the word in *command position* is refused wherever it appears — including
inside a heredoc body, which is exactly where prose usually lives. It has now bitten twice, both
times on a `python` heredoc whose **comment text** began a line with it. The expensive half is not
the refusal: the deny kills the **whole Bash call**, so an edit bundled into the same command
silently never happens and the sequence can look like it worked. Telling an invocation from a
mention needs real shell parsing, and a whitelist that fails open on the first heredoc would be
worse than a blunt rule — so it is left blunt and written down instead. **Prefer the `Edit` tool
over a heredoc whenever the text names the command.**

**`protected-state` is positional, not a list of names.** It used to name three files and leave
the rest of `.dare/` writable; that enumeration was the defect, because each new artifact
defaulted to writable until somebody remembered to add it — and `red-evidence.json`,
`test-report.json` and the archived briefs are all read back as decisions. Anything inside
`.dare/` is driver-owned.

**"Inside a run" is `DARE_RUNNING` in the hook's own environment**, stamped by the driver on
every child it spawns. Outside a run these are ordinary files and you may edit them from
wherever you like, including from inside Claude Code. A rule that locks out the person who owns
the repository has stopped being a guard and started being a nuisance. Rules 2–4 are refused to
everyone, because none of them becomes reasonable merely because a human asked.

**The driver hands the hook to its own children explicitly** (0.59.0). Registering it in
`hooks/hooks.json` covers *your* Claude Code sessions; a `claude -p` child does not load the
operator's plugin PreToolUse hooks, so for eleven versions the builder ran unguarded while
every visible signal said otherwise. The guard now travels in the `--settings` blob and no
longer depends on the plugin being installed, enabled, or at the same version as the tree.
`test/live/guard-registration.live.test.mjs` is what holds that, because no unit test can.

On deny it prints one `hookSpecificOutput` object with `permissionDecision: "deny"` and a
reason tagged with the rule that fired; on allow it prints nothing, leaving the decision to
the rest of the permission stack. Exit code is 0 either way.

## Test-ID extraction

`scripts/ratchet.mjs` turns vitest and Playwright JSON reporter output into the IDs the
ratchet protects. `DESIGN.md` §11 calls this the component most likely to fail _silently_,
so it is built to be loud instead:

```
<repo-relative posix path>::<title path joined by " > ">[::<project>]

test/math.test.js::arithmetic > edge cases > handles zero
tests/checkout.spec.js::cart > totals > sums line items::chromium
```

| Situation                                         | Behaviour                                                                                |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| report matches neither reporter                   | throws `ReportFormatError` — never an empty set, which would silently disarm the ratchet |
| a status the parser has never seen                | throws, naming the value                                                                 |
| the same ID appears twice                         | worst status wins, so a passing entry can never mask a failing one                       |
| Playwright `flaky` (failed, then passed on retry) | **not** counted as passed; retrievable via `statuses: ['flaky']`                         |
| vitest `todo` / `pending`                         | treated as skipped                                                                       |
| a well-formed run with zero tests                 | returns an empty set — refusing to advance on that is the ratchet's job                  |

The same spec run under two Playwright projects is two IDs, because it is two results.

Fixtures are real committed output from real runs of vitest 4.1.10 and Playwright 1.62.1,
two runs of each so the suite can assert the ID set is stable across identical runs. See
`test/fixtures/reporters/README.md` for provenance and how to regenerate them.

## The ratchet

`.dare/state.json` holds every test ID that has **ever** passed. An iteration that drops
one is a regression: hard reset, the regression becomes the next build task, nothing else
proceeds (`DESIGN.md` §1.2).

```json
{
  "version": 1,
  "iteration": 12,
  "passing": ["src/api.test.ts::rejects an expired token"],
  "lastGoodCommit": "a1b2c3d"
}
```

`evaluateIteration` returns one of three decisions:

| Decision  | When                                 | Effect                                                                            |
| --------- | ------------------------------------ | --------------------------------------------------------------------------------- |
| `advance` | nothing lost, something passed       | passing set **unions**, iteration increments, commit recorded                     |
| `reset`   | any previously-passing ID is missing | hard reset to `lastGoodCommit`, regression task emitted, **state left untouched** |
| `reject`  | nothing passed at all                | no state change — "no tests ran" is not evidence that nothing regressed           |

Regressions are checked before anything else, so an iteration that gains three new tests
and loses one old one is still a reset (`DESIGN.md` §8: regressions outrank everything).

`recordAdvance` unions and never subtracts — handed a smaller set than it holds, it keeps
everything. `loadState` treats a _missing_ file as a first run, but a corrupt, unreadable
or unknown-version one throws: silently starting from an empty passing set would erase
every ID ever earned while the run still looked healthy. State is written atomically via a
temp file and a rename.

`hardReset` is tested against a real git repository, not a stubbed command runner.

## Preflight

`scripts/init.mjs` is the last point at which a human is still in the loop. `/dare` runs it
first and refuses to continue if it exits non-zero — and it runs _all_ checks even after
one fails, so an operator fixes everything in one pass:

```
node scripts/init.mjs --yes
```

| Check                 | Fails when                                                                  |
| --------------------- | --------------------------------------------------------------------------- |
| `node-version`        | below 22.12                                                                 |
| `claude-cli`          | `claude` is missing or not callable                                         |
| `git-repository`      | not inside a work tree                                                      |
| `clean-working-tree`  | uncommitted changes exist — the ratchet's `reset --hard` would destroy them |
| `safe-remote`         | a remote's path contains `prod`, `production`, `client` or `customer`       |
| `network`             | the npm registry is unreachable                                             |
| `config`              | `.dare/config.json` is unreadable (it is scaffolded when simply absent)     |
| `agent-surface`       | the security scan finds anything blocking                                   |
| `danger-acknowledged` | `--yes` was not passed                                                      |

## Agent-config security scan

The guard hook is runtime safety; this is the static, pre-run half (`DESIGN.md` §3.6).
Because the builder runs unattended with permissions skipped, it trusts the target repo
completely — so the repo's own agent surface is scanned first. Built in rather than shelled
out, so a required gate never depends on the network.

| Blocks                                                                                                   | Deliberately allows                                                    |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| committed credentials (AWS, Anthropic, OpenAI, GitHub, Slack, Google, private keys, assigned secrets)    | `process.env.API_KEY`, empty `.env.example` entries, prose about keys  |
| prompt injection in `CLAUDE.md`/`AGENTS.md`/`.claude/*.md`                                               | the same words in ordinary docs, and "do not ignore failing tests"     |
| hooks or MCP commands that pipe downloads into a shell, decode-and-exec, read `~/.ssh`, or POST a secret | an ordinary hook, and a hook that merely mentions `curl`               |
| agent config that is not parseable, since it cannot be reviewed                                          | MCP servers, reported as a **warning** listing what the run will trust |

Matched secrets are redacted to a four-character prefix and a length. A scanner that prints
the credential it found has just copied it into your scrollback and your CI log.

## The loop

`scripts/driver.mjs` runs build → gates → ratchet → audit → ship, and the order is the
point. Gates before review because they are free and deterministic, and there is no reason
to spend a panel of cold reads on something that does not compile. Ratchet before review
because a regression ends the iteration whatever a reviewer would have said about the rest.

### The gates

Every gate must run. A gate that cannot run is a failure, not a skip — the single exception
`DESIGN.md` §5.1 carves out is `design-slop`, which is simply not armed on a project with no
user interface.

| Gate                                          | How it is decided                                                  |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `build` `lint` `types` `e2e` `security-audit` | exit code                                                          |
| `unit`                                        | exit code, and it writes the reporter JSON the ratchet reads       |
| `ci`                                          | a workflow whose `run:` steps really invoke build, lint, types, unit and e2e |
| `docs`                                        | `README.md` and `docs/api-contract.md` exist and are not stubs     |
| `observability`                               | structured logging in source, **and** `/health` answers a real request when the app declares a start script |
| `red-evidence`                                | every newly passing test was observed failing first                |
| `design-slop`                                 | impeccable's detector, armed only when the repo renders a UI       |

Two of those are behavioural rather than textual, deliberately. A presence check is satisfied
by the smallest artifact that quiets it, and the smallest file satisfying "a workflow exists"
runs nothing at all — so `ci` reads the steps, and `scripts/health-probe.mjs` starts the
application and asks it. Structured logging stays a source check on purpose; `DESIGN.md` §4
says why, and the gate reports it as the proxy it is rather than dressing it up as evidence.

`red-evidence` is `DESIGN.md` §8's RED-before-GREEN enforced structurally.
`.dare/red-evidence.json` accumulates every ID ever seen not passing; a newly passing ID
that was never in that set fails the gate as unproven. It kills tautological tests _before_
review rather than after, when they have already cost an iteration. Unreadable evidence
counts as no evidence.

### The auditor

`DESIGN.md` §1.1 exists because a builder satisfices. The parser is the only thing between a
satisficed build and a `SHIPPED` tag, so it is deliberately hostile:

- output that will not parse is a **fail** — not a retry, not a shrug
- `pass` with no evidence, or evidence that is not a real `path/file.ext:LINE`, is
  **flipped to fail** before anything is counted
- a required id with no entry **invalidates the audit** rather than being "not applicable"
- the reviewer's own top-level `verdict` is advisory; the verdict is computed from the
  entries, so a reviewer that stamps `pass` over a failing entry does not get to

With `requireUnanimous` (the default), every panel member must return a clean pass.

### Terminal states

| State     | Reached when                                                                                   |
| --------- | ---------------------------------------------------------------------------------------------- |
| `SHIPPED` | gates green, nothing regressed, panel unanimous with `file:line` evidence                      |
| `STALLED` | `stallLimit` iterations with no gate improvement and no new passing test                       |
| `BUDGET`  | `maxIterations` or `tokenCeiling` exhausted                                                    |
| `ABORTED` | builder process failed, test report unreadable, or the reality check found the PRD unbuildable |

Budget accounting reads `total_cost_usd` and every `usage` bucket — including cache tokens —
from the real `claude -p --output-format json` envelope, rather than estimating. An estimate
that drifts low never trips the ceiling.

## Configuration

`.dare/config.json` is scaffolded on first run. Validation is strict: an unknown key is an
**error**, not a shrug. A typo'd `maxIteration` that silently kept the default would give an
unattended run hours of behaviour nobody asked for, with no way to tell.

| Key                  | Default                               |                                                            |
| -------------------- | ------------------------------------- | ---------------------------------------------------------- |
| `maxIterations`      | `25`                                  | hard iteration cap                                         |
| `stallLimit`         | `4`                                   | iterations with no measurable improvement before `STALLED` |
| `tokenCeiling`       | `4000000`                             | bounds **work**; the run ends at the first child to cross it. Not a cap — one measured child returned 20,223,215 tokens against a 2,000,000 ceiling, so expect a single child to overshoot by an order of magnitude |
| `costCeiling`        | `50`                                  | bounds **spend**, in USD, read from the envelope's own `total_cost_usd`. Tokens are not convertible to money — the same run above cost $9.43 — so neither ceiling substitutes for the other |
| `contextBudget.maxCharacters` | `400000`                     | the assembled prompt is measured before a child is spawned and refused if larger. Characters, not tokens, and labelled as such. No `enabled` key on purpose |
| `extractTests`       | `true`                                | parse JSON reporter output into ratchet ids                |
| `builderModel` / `reviewerModel` / `designModel` / `prdModel` / `styleModel` / `lessonModel` | `sonnet` / `opus` / `opus` / `sonnet` / `fable` / `sonnet` | the judge should be the smartest thing in the loop |
| `reviewers`          | `["security","correctness","design"]` | the cold panel                                             |
| `ownership`          | one id set per reviewer               | which ids each member owns; must cover every required id   |
| `requireUnanimous`   | `true`                                | one dissent blocks the ship                                |
| `advisory.minConfidence` | `0.7`                             | below this an advisory finding is recorded, not acted on   |
| `lessons`            | `{ "enabled": true, "maxPerBrief": 3 }` | evidence-derived lesson memory                           |
| `qualityPlugins`     | `["impeccable", "knip", "semgrep"]`   | provisioned before the loop; impeccable is required, the other two degrade to a warning |
| `deploy`             | `{ "enabled": false, "command": [], "url": "", "smoke": [] }` | off by default. When enabled, all four are required: the argv array runs **before** the ship decision and the smoke checks must pass against `url`, or the tag is withheld. Fixed hosts only — push-triggered hosts have no exit code. `DESIGN.md` §10.1 |
| `chaos`              | `1`                                   | scope budget: 1 surgical, 2 normal, 3 feral                |
| `realityCheck.after` | `3`                                   | stalled iterations before asking if the PRD is buildable   |
| `race`               | `{ "enabled": false, "n": 3, "after": 2 }` | worktree racing, armed only by a stall               |
| `dareMe.enabled`     | `true`                                | allow `/dare` with no arguments                            |

The panel is **heterogeneous**: each reviewer is asked only about the ids `ownership` gives
it, and must return every one of them. If any required PRD or DoD id has no owner, the run
refuses to start — an id nobody was asked about would otherwise pass by never being judged.
Reviewers may also volunteer `advisory-` findings carrying `severity` and `confidence`;
those never decide whether a run ships, at any confidence. Compliance stays deterministic.

Environment: `DARE_CHAOS=1|2|3` overrides the dial. `DARE_STYLE=plain` disables the output
style. Nothing else is overridable, so an unattended run stays reproducible from the repo.

### What a run leaves in `.dare/`

| File                |                                                                   |
| ------------------- | ----------------------------------------------------------------- |
| `state.json`        | the ratchet. Not writable by the builder                          |
| `config.json`       | the settings above. Not writable by the builder                   |
| `lessons.json`      | evidence-derived lessons. Driver-owned; not writable by the builder |
| `briefs/`           | the compiled task handed to each iteration, archived for debugging |
| `bloopers.log`      | one JSON line per hard reset: iteration, regressed IDs, diff stat |
| `red-evidence.json` | every test ID ever seen not passing                               |
| `test-report.json`  | the latest reporter output the ratchet read                       |

Every builder iteration is handed a **compiled brief** rather than a growing conversation:
the objective, why it is the objective, the failing evidence, the protected tests, and any
lessons that match this particular failure. The repository and these artifacts are the run's
memory; a child's context is disposable. The archived briefs exist so that when a run ends
badly you can read what the builder was actually asked for, instead of inferring it from
what it did.

## The output style

Runs narrate in the voice of an '80s Junkion — the scrap-built robots from _Transformers:
The Movie_ who learned language entirely from intercepted broadcast television, and who
appear in the same sequence the title song plays over. Everything they say is reassembled
advertising copy, game show patter and emergency announcement. They are not being funny.
They are being sincere in a borrowed register.

Failing tests are a voluntary recall; shipping is a limited-time offer; the budget running
out is the end of the broadcast day.

The mapping is tight on purpose. Every line still carries the real module, count or state:

```
WE ARE ISSUING A VOLUNTARY RECALL ON AUTH-MIDDLEWARE. AFFECTED UNITS: FOURTEEN.
```

`scripts/style.mjs` is pure — it takes an event record and returns a string, reads no state
and decides nothing. Nothing it returns is fed back into a gate result, the ratchet, or
reviewer JSON.

**Never styled, in either mode:** code, identifiers, file paths, JSON, commit messages, test
names, stack traces, error text. Failure output is verbatim.

`DARE_STYLE=plain` is a full bypass, not a quieter voice — plain mode builds a different,
literal string from the same record.

## Status

All eight slices of `DESIGN.md` §12 are built and gated, across **three separately runnable
tiers** — because a green tick for a suite that made no external call is a lie the reader takes
for coverage:

| tier | command | needs | count |
| --- | --- | --- | --- |
| 1 — unit | `npm test` | node only | 1431 |
| 2 — integration | `npm run test:integration` | real `git`, `node`, `npm`; no money | 12 |
| 3 — live | `DARE_LIVE=1 npm run test:live` | a real `claude -p`; **spends money** | 11 |

Tier 3 **fails when unarmed rather than skipping.** Lint and typecheck clean.

| #   | Slice                                                         | State |
| --- | ------------------------------------------------------------- | ----- |
| 1   | `hooks/guard.mjs` + `hooks/hooks.json`                        | done  |
| 2   | `extractTestIds` + real reporter fixtures                     | done  |
| 3   | ratchet                                                       | done  |
| 4   | `plugins.mjs` + `init.mjs` (preflight, security scan, config) | done  |
| 5   | `driver.mjs`                                                  | done  |
| 6   | `templates/`                                                  | done  |
| 7   | output style                                                  | done  |
| 8   | plugin + marketplace manifests, `/dare` command               | done  |

### What has met reality

Nine end-to-end runs against throwaway repositories, all with `deploy.enabled: false`. Full
records in `HANDOFF.md`; the short version:

- a cold reviewer **refusing** an incomplete build, and measuring an impossible latency
  requirement with raw sockets rather than reading the docs
- the **ratchet resetting a real tree** on a regression the builder introduced itself, and
  issuing a regression-only brief
- a **security pin escalating**, returning `moved`, and re-pinning with no reset
- one run reaching **`SHIPPED`** — and an independent audit then finding the shipped binary
  discards data at exit `0`, which is why `SHIPPED` is a claim to check rather than a result to
  trust

### Not yet proven

- **worktree racing with a live builder.** `race.enabled` is `false`; only the git half is
  covered, by tier 2. The half that costs money has never executed once.
- **the .NET adapter driven by a run.** Its commands were verified against a real SDK (8.0.423);
  no run has ever used them. **The SDK is installed on this machine as of 13 August 2026** — the
  line here previously said there was none, which was true when written and had gone stale.
- **the ship condition added at 0.56.0–0.58.0.** See `HANDOFF.md`.
- **deploy against a real host.** Built at 0.61.0–0.63.0 and covered by tier 2 against a real
  listening server, but **no run has ever deployed anything to a real droplet.** The ssh half is
  argv nobody has executed. Treat it exactly as this project treats the .NET adapter: correct by
  construction, unproven by execution.

**Read one thing before trusting anything here: a passing suite proves less than it looks.**
This README claimed for eleven versions that the guard hook was "verified live". It was — in an
operator's own session. It was not firing in a single child the driver spawned, and the guard's
own unit tests were correct and green throughout, because they proved the *logic* and nothing
asserted the *invocation*. Prefer looking at a produced artifact over adding an assertion.

## Working on this repo

Requires Node ≥ 22.12. Dev dependencies only — the plugin itself has no runtime
dependencies, and a test asserts that structurally by checking every import.

```
npm install
npm run lint
npm run typecheck
npm test                     # tier 1
npm run test:integration     # tier 2 — real git/node/npm, no network, no money
DARE_LIVE=1 npm run test:live   # tier 3 — real claude -p, spends money
npm run release-check        # refuses a shipped change at an unbumped version, or a stale HANDOFF header
```

**Any change to a shipped file requires a version bump** in `.claude-plugin/plugin.json` and
`package.json` together. The install cache is keyed by version, so an update at an unchanged
version silently resolves to the old folder and keeps running the previous build —
indistinguishable from a wrong fix. `npm run release-check` is what catches it; do not rely on
remembering. It also refuses when `HANDOFF.md`'s header disagrees with the manifests, in either
direction — that line went stale by fourteen versions once, and a discipline that keeps failing
becomes a gate here.

Do not run `/dare` against this repository (`CLAUDE.md`, scope note).

## Acknowledgements

The builder prompt's anti-overengineering and dead-code rules were sharpened by
[multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills)
(MIT), which collects Karpathy's observations about how LLMs write code. The framing there
is for interactive work; here the same rules are justified by the ratchet, which makes a
speculative abstraction something you pay for permanently.

