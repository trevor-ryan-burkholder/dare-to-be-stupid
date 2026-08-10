# dare-to-be-stupid
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

> *"Dare to be stupid."*
>
> — "Weird Al" Yankovic, 1985. The song plays over the Junkions in
> *Transformers: The Movie*, which is where this thing gets its voice.

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

| Rule | What it blocks | What it deliberately leaves alone |
|---|---|---|
| `protected-state` | anything touching `.dare/state.json` or `.dare/config.json` | the rest of `.dare/`, including `bloopers.log`; `tsconfig.json`; an app's own `src/state.json` |
| `git-history` | `push --force` / `-f` / `--force-with-lease`, `rebase`, `filter-branch`, `reflog expire` | ordinary pushes, `git reset --hard` (the ratchet needs it), `git reflog`, "rebase" inside a commit message |
| `rm-recursive` | recursive `rm` outside the temp directory, and any recursive `rm` whose target cannot be resolved before it runs | non-recursive `rm`, `rm -rf /tmp/...`, `rmdir` |
| `nested-dare` | a builder invoking `/dare` | the word "dare" in prose, paths and filenames containing it |

A malformed or unparseable payload is a **deny**. A guard that fails open is not a guard.

On deny it prints one `hookSpecificOutput` object with `permissionDecision: "deny"` and a
reason tagged with the rule that fired; on allow it prints nothing, leaving the decision to
the rest of the permission stack. Exit code is 0 either way.

## Test-ID extraction

`scripts/ratchet.mjs` turns vitest and Playwright JSON reporter output into the IDs the
ratchet protects. `DESIGN.md` §11 calls this the component most likely to fail *silently*,
so it is built to be loud instead:

```
<repo-relative posix path>::<title path joined by " > ">[::<project>]

test/math.test.js::arithmetic > edge cases > handles zero
tests/checkout.spec.js::cart > totals > sums line items::chromium
```

| Situation | Behaviour |
|---|---|
| report matches neither reporter | throws `ReportFormatError` — never an empty set, which would silently disarm the ratchet |
| a status the parser has never seen | throws, naming the value |
| the same ID appears twice | worst status wins, so a passing entry can never mask a failing one |
| Playwright `flaky` (failed, then passed on retry) | **not** counted as passed; retrievable via `statuses: ['flaky']` |
| vitest `todo` / `pending` | treated as skipped |
| a well-formed run with zero tests | returns an empty set — refusing to advance on that is the ratchet's job |

The same spec run under two Playwright projects is two IDs, because it is two results.

Fixtures are real committed output from real runs of vitest 4.1.10 and Playwright 1.62.1,
two runs of each so the suite can assert the ID set is stable across identical runs. See
`test/fixtures/reporters/README.md` for provenance and how to regenerate them.

## The ratchet

`.dare/state.json` holds every test ID that has **ever** passed. An iteration that drops
one is a regression: hard reset, the regression becomes the next build task, nothing else
proceeds (`DESIGN.md` §1.2).

```json
{ "version": 1, "iteration": 12, "passing": ["src/api.test.ts::rejects an expired token"], "lastGoodCommit": "a1b2c3d" }
```

`evaluateIteration` returns one of three decisions:

| Decision | When | Effect |
|---|---|---|
| `advance` | nothing lost, something passed | passing set **unions**, iteration increments, commit recorded |
| `reset` | any previously-passing ID is missing | hard reset to `lastGoodCommit`, regression task emitted, **state left untouched** |
| `reject` | nothing passed at all | no state change — "no tests ran" is not evidence that nothing regressed |

Regressions are checked before anything else, so an iteration that gains three new tests
and loses one old one is still a reset (`DESIGN.md` §8: regressions outrank everything).

`recordAdvance` unions and never subtracts — handed a smaller set than it holds, it keeps
everything. `loadState` treats a *missing* file as a first run, but a corrupt, unreadable
or unknown-version one throws: silently starting from an empty passing set would erase
every ID ever earned while the run still looked healthy. State is written atomically via a
temp file and a rename.

`hardReset` is tested against a real git repository, not a stubbed command runner.

## Preflight

`scripts/init.mjs` is the last point at which a human is still in the loop. `/dare` runs it
first and refuses to continue if it exits non-zero — and it runs *all* checks even after
one fails, so an operator fixes everything in one pass:

```
node scripts/init.mjs --yes
```

| Check | Fails when |
|---|---|
| `node-version` | below 22.12 |
| `claude-cli` | `claude` is missing or not callable |
| `git-repository` | not inside a work tree |
| `clean-working-tree` | uncommitted changes exist — the ratchet's `reset --hard` would destroy them |
| `safe-remote` | a remote's path contains `prod`, `production`, `client` or `customer` |
| `network` | the npm registry is unreachable |
| `config` | `.dare/config.json` is unreadable (it is scaffolded when simply absent) |
| `agent-surface` | the security scan finds anything blocking |
| `danger-acknowledged` | `--yes` was not passed |

## Agent-config security scan

The guard hook is runtime safety; this is the static, pre-run half (`DESIGN.md` §3.6).
Because the builder runs unattended with permissions skipped, it trusts the target repo
completely — so the repo's own agent surface is scanned first. Built in rather than shelled
out, so a required gate never depends on the network.

| Blocks | Deliberately allows |
|---|---|
| committed credentials (AWS, Anthropic, OpenAI, GitHub, Slack, Google, private keys, assigned secrets) | `process.env.API_KEY`, empty `.env.example` entries, prose about keys |
| prompt injection in `CLAUDE.md`/`AGENTS.md`/`.claude/*.md` | the same words in ordinary docs, and "do not ignore failing tests" |
| hooks or MCP commands that pipe downloads into a shell, decode-and-exec, read `~/.ssh`, or POST a secret | an ordinary hook, and a hook that merely mentions `curl` |
| agent config that is not parseable, since it cannot be reviewed | MCP servers, reported as a **warning** listing what the run will trust |

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

| Gate | How it is decided |
|---|---|
| `build` `lint` `types` `e2e` `security-audit` | exit code |
| `unit` | exit code, and it writes the reporter JSON the ratchet reads |
| `ci` | a workflow file exists under `.github/workflows` |
| `docs` | `README.md` and `docs/api-contract.md` exist and are not stubs |
| `observability` | structured logging **and** a health endpoint are present in source |
| `red-evidence` | every newly passing test was observed failing first |
| `design-slop` | impeccable's detector, armed only when the repo renders a UI |

`red-evidence` is `DESIGN.md` §8's RED-before-GREEN enforced structurally.
`.dare/red-evidence.json` accumulates every ID ever seen not passing; a newly passing ID
that was never in that set fails the gate as unproven. It kills tautological tests *before*
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

| State | Reached when |
|---|---|
| `SHIPPED` | gates green, nothing regressed, panel unanimous with `file:line` evidence |
| `STALLED` | `stallLimit` iterations with no gate improvement and no new passing test |
| `BUDGET` | `maxIterations` or `tokenCeiling` exhausted |
| `ABORTED` | builder process failed, test report unreadable, or the reality check found the PRD unbuildable |

Budget accounting reads `total_cost_usd` and every `usage` bucket — including cache tokens —
from the real `claude -p --output-format json` envelope, rather than estimating. An estimate
that drifts low never trips the ceiling.

## Configuration

`.dare/config.json` is scaffolded on first run. Validation is strict: an unknown key is an
**error**, not a shrug. A typo'd `maxIteration` that silently kept the default would give an
unattended run hours of behaviour nobody asked for, with no way to tell.

| Key | Default | |
|---|---|---|
| `maxIterations` | `25` | hard iteration cap |
| `stallLimit` | `4` | iterations with no measurable improvement before `STALLED` |
| `tokenCeiling` | `4000000` | total tokens across every child |
| `reviewers` | `["security","correctness","design"]` | the cold panel |
| `requireUnanimous` | `true` | one dissent blocks the ship |
| `qualityPlugins` | `["impeccable"]` | provisioned before the loop |
| `deploy` | `{ "enabled": false }` | off by default; pre-production only |
| `chaos` | `1` | scope budget: 1 surgical, 2 normal, 3 feral |
| `realityCheck.after` | `3` | stalled iterations before asking if the PRD is buildable |
| `dareMe.enabled` | `true` | allow `/dare` with no arguments |

Environment: `DARE_CHAOS=1|2|3` overrides the dial. `DARE_STYLE=plain` disables the output
style. Nothing else is overridable, so an unattended run stays reproducible from the repo.

### What a run leaves in `.dare/`

| File | |
|---|---|
| `state.json` | the ratchet. Not writable by the builder |
| `config.json` | the settings above. Not writable by the builder |
| `bloopers.log` | one JSON line per hard reset: iteration, regressed IDs, diff stat |
| `red-evidence.json` | every test ID ever seen not passing |
| `test-report.json` | the latest reporter output the ratchet read |

## The output style

Runs narrate in the voice of an '80s Junkion — the scrap-built robots from *Transformers:
The Movie* who learned language entirely from intercepted broadcast television, and who
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

All eight slices of `DESIGN.md` §12 are built and gated: **562 tests**, lint and typecheck
clean.

| # | Slice | State |
|---|---|---|
| 1 | `hooks/guard.mjs` + `hooks/hooks.json` | done |
| 2 | `extractTestIds` + real reporter fixtures | done |
| 3 | ratchet | done |
| 4 | `plugins.mjs` + `init.mjs` (preflight, security scan, config) | done |
| 5 | `driver.mjs` | done |
| 6 | `templates/` | done |
| 7 | output style | done |
| 8 | plugin + marketplace manifests, `/dare` command | done |

### Not yet proven

These need a live run and cannot be settled by the suite:

- the guard hook denying a real PreToolUse event, with the plugin installed
- `extractTestIds` against live reporter output rather than the committed fixtures
- a deliberately incomplete build actually drawing a `fail` verdict from a cold reviewer
- a first end-to-end `/dare` against a throwaway repo with `deploy.enabled: false`

`claude -p` child spawning and JSON envelope parsing **is** verified against claude 2.1.226.

## Working on this repo

Requires Node ≥ 22.12. Dev dependencies only — the plugin itself has no runtime
dependencies, and a test asserts that structurally by checking every import.

```
npm install
npm run lint
npm run typecheck
npm test
```

Do not run `/dare` against this repository (`CLAUDE.md`, scope note).

## Acknowledgements

The builder prompt's anti-overengineering and dead-code rules were sharpened by
[multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills)
(MIT), which collects Karpathy's observations about how LLMs write code. The framing there
is for interactive work; here the same rules are justified by the ratchet, which makes a
speculative abstraction something you pay for permanently.
