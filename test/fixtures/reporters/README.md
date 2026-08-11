# Reporter fixtures

Real output from real runs, committed verbatim. Nothing here is hand-written, and nothing
here has been tidied up — `extractTestIds` is the component `DESIGN.md` §11 expects to fail
silently, so it is tested against what the reporters actually emit rather than against an
approximation of it.

`provenance.json` records how each fixture was produced, including the `rootDir` the run
happened under. That field is load-bearing: vitest emits **absolute** file paths, so test
IDs can only be made repo-relative against a recorded root.

The TRX fixtures are the exception, and `provenance.json` says so rather than leaving a
plausible-looking path in the field: TRX ids are fully qualified test names and never paths,
because the two locations TRX *does* record are absolute and one of them is lowercased by the
runner. They are also the only fixtures here that were **redacted** — the generating machine's
hostname and absolute path were replaced. Every element, attribute and outcome is otherwise
exactly what `dotnet test` emitted.

| Fixture | Runner | Produced by |
|---|---|---|
| `vitest-4.1.10-run1.json`, `-run2.json` | vitest 4.1.10 | `npx vitest run --reporter=json --outputFile=report.json` |
| `playwright-1.62.1-run1.json`, `-run2.json` | @playwright/test 1.62.1 | `npx playwright test` with `reporter: [['json', …]]` |

## Why two runs of each

`DESIGN.md` §11: *"feed real reporter output from both, assert the ID set is non-empty and
stable across runs."* Run 1 and run 2 are two executions of the same unchanged sources, so
the suite can assert the extracted ID sets are identical. A parser that is merely
deterministic on one file would pass a single-fixture test and still be wrong.

The Playwright flaky test tracks its attempt with a marker file in the temp directory; that
marker was cleared before run 2 so both runs start from the same state and report the same
outcome.

## What the sources deliberately contain

Both suites were written to cover the shapes that break naive parsers:

- more than one test file, so IDs must carry the path
- nested `describe` blocks, so IDs must carry the full title path
- a genuine failure, a skip, and (vitest) a `todo`
- vitest `test.each` parameterisation, whose titles are generated
- Playwright **two projects** (`chromium`, `firefox`), so the same spec appears twice and
  IDs must carry the project or collide
- Playwright `retries: 1` with a test that fails then passes, producing status `flaky`

The Playwright tests do not drive a browser. The JSON reporter's structure does not depend
on whether one launched, and avoiding it keeps the fixtures reproducible without a 150 MB
browser download.

## Regenerating

Recreate the source files listed in `provenance.json` in a throwaway project, run the
recorded command, and copy the report in under a **new, version-stamped filename**. Do not
overwrite an existing fixture with output from a different runner version: the whole point
is that a format change shows up as a failing test rather than as a quietly smaller ID set.
