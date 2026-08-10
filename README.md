# dare-to-be-stupid
Act now! Claude Code does EVERYTHING autonomously - batteries not included, warranty void, prod not invited. Dare to be stupid!

`DESIGN.md` is the spec. `CLAUDE.md` is how work happens in this repo.

## Status

Building in the slice order of `DESIGN.md` §12.

| # | Slice | State |
|---|---|---|
| 1 | `hooks/guard.mjs` + `hooks/hooks.json` | done |
| 2 | `extractTestIds` + real reporter fixtures | done |
| 3 | ratchet | not started |
| 4 | `plugins.mjs` + `init.js` | not started |
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
