# gitleaks fixtures

Real output captured from **gitleaks 8.30.1** on 19 August 2026, so the parser in
`scripts/secrets-scan.mjs` is tested against what the tool actually emits rather than against an
approximation of it. Same rule as `test/fixtures/reporters/` and `test/fixtures/impeccable/`, and
it earned its place immediately here: gitleaks **removed the `detect` subcommand**. A gate argv
written from memory would have said `gitleaks detect` and been wrong at the first real run.

## Provenance

Command, run with the scanned directory as the working directory so paths are relative and the
fixture is portable:

```
gitleaks dir --report-format json --report-path - --redact --no-banner .
```

| file | tree scanned | exit |
| --- | --- | --- |
| `gitleaks-8.30.1-leaks.json` | one file holding a synthetic GitHub personal-access token | 1 |
| `gitleaks-8.30.1-clean.json` | one file holding `export const port = 3000;` | 0 |

## What was measured, not assumed

- `detect` is gone. The subcommands are `dir`, `git`, `stdin`.
- `--report-path -` writes the report to stdout; `--report-format json` selects the shape.
- Exit is **1** when findings exist and **0** when none do (`--exit-code`, default 1).
- A **missing target also exits 1**, with an empty stdout and a `FTL` line on stderr. The exit code
  alone therefore cannot distinguish "secrets found" from "the scan never happened", which is why
  `gitleaksEvidence` refuses an empty stream instead of reading it as a clean pass.
- A malformed flag exits **126**, not 1.
- The default configuration **allowlists AWS's documented example key** (`AKIAIOSFODNN7EXAMPLE`),
  so it is useless as a fixture secret. The captured finding is a `github-pat` instead.

## The secret

Synthetic, generated from `/dev/urandom` at capture time, and never committed: `--redact` replaces
both `Match` and `Secret` with `REDACTED` before the report is written. The gate argv keeps
`--redact` for the same reason it is used here — gate output becomes repair context handed to a
builder and evidence handed to a reviewer, and a scanner that leaks the secret it found into a
model's context has made the exposure worse rather than better.

Tests that need a tree gitleaks will flag build the token from parts at run time, so no committed
file in this repository contains a contiguous secret-shaped literal.
