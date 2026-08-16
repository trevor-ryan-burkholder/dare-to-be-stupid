# Dogfood — current scenarios and pending runs

**Document status:** current operational runbook
**Last swept:** 15 August 2026 at version 0.162.0

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
