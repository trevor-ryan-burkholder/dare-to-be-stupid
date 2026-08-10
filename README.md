# dare-to-be-stupid
Act now! Claude Code does EVERYTHING autonomously - batteries not included, warranty void, prod not invited. Dare to be stupid!

`DESIGN.md` is the spec. `CLAUDE.md` is how work happens in this repo.

## Status

Building in the slice order of `DESIGN.md` §12.

| # | Slice | State |
|---|---|---|
| 1 | `hooks/guard.mjs` + `hooks/hooks.json` | done |
| 2 | `extractTestIds` + real reporter fixtures | done |
| 3 | ratchet | done |
| 4 | `plugins.mjs` + `init.mjs` (preflight, security scan, config) | done |
| 5 | `driver.mjs` | not started |
| 6 | `templates/` | not started |
| 7 | output style | not started |
| 8 | plugin + marketplace manifests | not started |

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
| a well-formed run with zero tests | returns an empty set — refusing to advance on that is the ratchet's job (slice 3) |

The same spec run under two Playwright projects is two IDs, because it is two results.

Fixtures are real committed output from real runs of vitest 4.1.10 and Playwright 1.62.1,
two runs of each so the suite can assert the ID set is stable across identical runs. See
`test/fixtures/reporters/README.md` for provenance and how to regenerate them.

## The ratchet

`.dare/state.json` holds every test ID that has **ever** passed. An iteration that drops
one is a regression: hard reset, the regression becomes the next build task, nothing else
proceeds (`DESIGN.md` §1.2). This is what makes an autonomous loop terminate instead of
oscillating.

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

`dare init` (`scripts/init.mjs`) is the last point at which a human is still in the loop.
It runs every check in `DESIGN.md` §3.5 and exits non-zero if any fails — and it runs *all*
of them even after one fails, so an operator fixes everything in one pass:

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

`.dare/config.json` validation is strict: an unknown key is an **error**, not a shrug. A
typo'd `maxIteration` that silently kept the default would give an unattended run hours of
behaviour nobody asked for, with no way to tell.

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

## Quality plugins

`scripts/plugins.mjs` provisions the plugins in `qualityPlugins` idempotently before the
loop. A **required** plugin that fails to install aborts the run — it contributes a
definition-of-done line, and dropping it silently would ship having never checked that
line. An unknown plugin name is an error rather than a guessed `npx <name>`.

impeccable's `gate:design-slop` is armed only when the repo actually renders a user
interface; on an API or CLI project it is skipped with a warning, which is the single gate
skip `DESIGN.md` §5.1 carves out.

## Working on this repo

Requires Node ≥ 22.12. Dev dependencies only — the plugin itself has no runtime
dependencies.

```
npm install
npm run lint
npm run typecheck
npm test
```

Do not run `/dare` against this repository (`CLAUDE.md`, scope note).
