---
name: meeseeks-review
description: Conduct a rigorous, read-only whole-repository code review of the Meeseeks Claude Code plugin. Use whenever a user asks to review or audit Meeseeks, requests an independent Meeseeks code review, or selects this skill while using Codex review mode. Inspect local Git state and the complete execution paths behind relevant changes, report concrete actionable defects, and never implement fixes or modify the review ledger.
---

# Meeseeks Review

Conduct a rigorous, read-only code review of the entire Meeseeks repository.

Repository:
`\\wsl.localhost\Ubuntu\home\tburkholder\dev\meeseeks`

WSL path:
`/home/tburkholder/dev/meeseeks`

Do not implement fixes, edit files, update `REVIEW.md`, commit, push, install dependencies, or run `/meeseeks` against this repository. Preserve all existing user changes.

## Establish the review context

1. Read `AGENTS.md` completely.
2. Read `docs/INDEX.md` before traversing project-management documents.
3. Read `DESIGN.md`, treating it as the product source of truth.
4. Read `PLAN.md`, `REVIEW.md`, and `HANDOFF.md`.
5. Inspect `git status`, the current branch, recent commits, staged changes, unstaged changes, and untracked files.
6. Determine the appropriate comparison base from local Git state. Do not fetch from the network.
7. If the worktree has no relevant diff, review the current repository implementation as a whole.

Review changed code first, then inspect enough surrounding code, callers, callees, tests, fixtures, templates, and documentation to validate complete execution paths. Do not review a diff in isolation when correctness depends on unchanged code.

## Review targets

Review for concrete, actionable defects involving:

- correctness and fail-closed behavior;
- security and trust boundaries;
- error, timeout, crash, and malformed-input handling;
- cross-platform behavior;
- race conditions and process cleanup;
- parsing of external output;
- state persistence and monotonicity;
- guard-hook enforcement and propagation;
- cold-review independence;
- nested-run restrictions;
- requirement carrying and evidence validity;
- quarantine and shipping decisions;
- prompt and parser output contracts;
- versioning and release-cache correctness;
- test coverage that could conceal a real regression; and
- documentation that materially contradicts implementation.

## Verify load-bearing invariants

Explicitly verify that:

- passing test IDs cannot be removed without the documented reset path;
- security and cold-passed requirement pins remain monotonic;
- nothing defaults to pass when evidence is missing or invalid;
- review occurs in a separate `claude -p` process;
- `driver-owned` and `not supplied` guarantees are not conflated;
- every spawned child receives the guard configuration;
- `.meeseeks/` and the deciding guard remain protected during runs;
- `--give-them-the-box` relaxes only nesting and enforces its depth cap;
- carried requirements remain a prefilter rather than replacing the full Panel;
- test-only evidence is not carried;
- quarantine prevents `SHIPPED`;
- output styling cannot affect decisions;
- `MEESEEKS_STYLE=plain` bypasses styling;
- parser and template contracts agree; and
- shipped-file changes receive every coordinated version update.

Trace important claims into actual execution paths. Check allow and deny paths. Look for silent failures where tests remain green while runtime protection or evidence quality degrades.

## Run non-live validation

Run the following when feasible and when their prerequisites already exist:

```text
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run release-check
```

Do not run `npm run test:live`, invoke `claude -p`, use the network, or spend API money. Do not install missing dependencies. If repository policy requires tier-3 validation for the reviewed code, identify that requirement without running it.

## Apply the finding standard

Report only defects that are concrete, reproducible, and actionable.

For each proposed finding:

1. Explain the input, state, or execution path that triggers the problem.
2. State the resulting incorrect behavior or safety consequence.
3. Cite the governing `DESIGN.md` or `AGENTS.md` requirement when applicable.
4. Give the exact file and smallest useful line range.
5. Explain why existing tests fail to detect the problem.
6. Distinguish defects in the current changes from pre-existing repository defects.
7. Search for enforcement or compensation elsewhere before reporting it.

Do not report formatting preferences, speculative concerns, or missing tests without an associated behavioral risk.

Use these priorities:

- `P0`: catastrophic, broadly blocking, or immediately exploitable;
- `P1`: serious correctness or safety defect that should block merging;
- `P2`: real defect affecting a narrower or less common path; and
- `P3`: minor but actionable correctness or maintainability defect.

## Produce the review

Output findings first, ordered by priority. For every finding include:

- `[P0-P3]` and a concise title;
- exact file and line reference;
- evidence and triggering scenario;
- practical consequence;
- governing requirement;
- smallest reasonable repair direction; and
- validation needed after repair.

Use `::code-comment{...}` directives for actionable inline findings when supported.

After the findings, provide a short review summary containing:

- scope and comparison base;
- validation commands and exact results;
- areas inspected;
- required checks that were not run; and
- residual risks or uncertainties.

If there are no actionable findings, say so explicitly. Do not invent findings to make the review appear useful.
