# Dogfood — current scenarios and pending runs

**Document status:** current operational runbook
**Last swept:** 16 August 2026 at version 0.163.0

Completed run logs, recipes, autopsies, and measurements are preserved at
[`docs/history/DOGFOOD-through-2026-08-15.md`](docs/history/DOGFOOD-through-2026-08-15.md).
The table below is the current status; historical headings do not override it.

| Scenario | Status | Current decision |
|---|---|---|
| A — Node link shortener | `PREPARED` | Pending; run only with an operator watching |
| B — Node persistence SPA | `PREPARED` | Pending; run only with an operator watching |
| C — .NET API | `PARKED` | Operator decision, 14 August; adapter remains, no run scheduled |
| D, E, F, G | `PERFORMED` | Evidence is in the archived ledger |
| H — security-pin escalation | `PERFORMED` | Escalation fired; verdict was `moved`, not `unknown` |
| I — live worktree race | `PERFORMED` | Race executed; no winner has yet been applied in a live run |
| J — boxed nesting controls | `CONCLUDED` | Controls verified; builders never initiated the nested run |
| Tallyho web-ui smoke | `SHIPPED` | Shipped on attempt 6; findings landed through 0.161.0 |
| Ateliers capstone | `STAGED` | PLAN item 31; no terminal result recorded in this repository |
| Dynamic-workflow boundary probe | `BLOCKED` | PLAN item 54; do not run until `REVIEW.md` F1 and F2 are closed |

## Pending recipes

### Case A — Node link shortener

```text
scenario link-shortener
/meeseeks "A simple link shortener with an admin analytics page."
```

### Case B — Node persistence SPA

```text
scenario task-spa
/meeseeks "A small task management SPA with local or database persistence."
```

For either run:

- launch from a snapshot worktree, never the live plugin-development tree;
- use the current installed plugin version and record its commit;
- capture `.meeseeks/outcome.json`, the run manifest, review evidence, terminal state, spend,
  and relevant logs;
- update this matrix and archive the completed result in the same commit.

Case C must not be launched unless the operator explicitly reopens it. The original recipe is
retained only in the archive.

### Dynamic-workflow boundary probe

This is a contract experiment, not a product run. Its purpose is to determine whether a spawned
Claude role can invoke a current Claude Code dynamic workflow without weakening Meeseeks' durable
authority or isolation. Use a disposable fixture repository and a pinned Claude Code version. Do
not apply the workflow result to `main` and do not treat workflow success as a Meeseeks pass.

Record:

- the Claude Code version, documented feature surface, invocation form, and durable workflow
  definition or artifact;
- the starting commit, every worktree created, and proof of which tree each agent saw;
- model selection, effective token/cost limits, reported spend, exit status, and termination
  reason for every workflow phase;
- the settings and environment received by every descendant, including guard registration,
  `MEESEEKS_RUNNING`, and nesting markers;
- the workflow's raw output separately from the driver's parsed receipt and any later gate or
  panel evidence.

The probe has four fail-closed cases:

1. A spawned `claude -p` role invokes the bounded workflow through a documented interface.
2. A workflow child attempts to write `.meeseeks/` and is denied; no child can advance a ratchet,
   pin, review verdict, or terminal state.
3. A resistant or abandoned workflow is killed within the configured ceiling, leaves no live
   descendants, and can be diagnosed after restart from driver-owned receipts.
4. Builder output is reviewed by newly instantiated cold panel members that receive no Builder
   transcript, workflow synthesis, or internal reviewer verdict.

Any missing receipt, unsupported version, context leak, unbounded child, or uncertain guard
propagation fails the probe. Results belong in `docs/history/`; only then may PLAN item 54 change.
