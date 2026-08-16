# Documentation index

**Status:** canonical
**Last swept:** 15 August 2026 at version 0.162.0

This file is the control plane for project documentation. Read it first, then load only the
document needed for the task. Historical and research documents are evidence, not instructions.

## Authority and ownership

| Document | Purpose | Authority | Update rule |
|---|---|---|---|
| `DESIGN.md` | Product requirements, invariants, and system architecture | Normative source of truth | Change with the implementation or accepted design decision |
| `CLAUDE.md` | Contributor and agent operating rules | Normative where it does not conflict with `DESIGN.md` | Edit here, then mirror the body into `AGENTS.md` |
| `AGENTS.md` | Agent-neutral mirror of `CLAUDE.md` | Mirror only | Do not edit independently |
| `PLAN.md` | Live implementation backlog and ordering | Only live implementation plan | Update status in the same commit as the work |
| `REVIEW.md` | Codex-owned external findings and closure evidence | Release gate for reviewed defects | Claude Code may repair; Codex closes after verification |
| `HANDOFF.md` | Current repository state and immediate handoff | Operational summary | Keep short; move chronology to `docs/history/` |
| `DOGFOOD.md` | Pending live experiments and current scenario status | Operational runbook | Completed results move to `docs/history/` |
| `README.md` | Installation, use, and contributor quick start | User-facing summary | Link to canonical detail instead of duplicating it |
| `BORROWED.md` | Compatibility pointer to the research ledger | Non-normative | Research lives under `docs/research/` |
| `BRIEF.md`, `COMPLETION.md`, `AUDIT.md` | Compatibility pointers to frozen snapshots | Historical only | Never use as a source of current work |

When documents disagree, use this order:

1. `DESIGN.md` for what the system must do.
2. `REVIEW.md` for whether a reviewed defect still blocks acceptance.
3. `PLAN.md` for what implementation work remains and in what order.
4. `HANDOFF.md` for the current measured repository state.
5. Historical and research files only as supporting evidence.

## Reader routes

- **Using the plugin:** `README.md`, then `DESIGN.md` only when deeper guarantees matter.
- **Changing code:** `CLAUDE.md`, the relevant `DESIGN.md` section, `PLAN.md`, and open
  `REVIEW.md` findings that touch the change.
- **Reviewing code:** `REVIEW.md`, the relevant invariant in `DESIGN.md`, and the exact diff.
- **Running dogfood:** `DOGFOOD.md`; consult the archived run record only for precedent.
- **Understanding why:** the relevant file under `docs/history/`, `docs/research/`, or
  `docs/adr/`.

Do not load every ledger into an LLM context by default. Stable requirements, live status,
review findings, research, and historical evidence have different lifecycles; combining them
causes old instructions to compete with current ones.

## Drift checks

The following facts must have one canonical owner:

- Version: `package.json` and `.claude-plugin/plugin.json`, checked against `HANDOFF.md` by
  `npm run release-check`; the top-level and root-package `package-lock.json` versions mirror
  `package.json`.
- Configuration defaults: `scripts/config.mjs`; `DESIGN.md` documents them and must be updated
  in the same change.
- Live backlog status: `PLAN.md`; other documents link to item numbers instead of restating status.
- External defect status: `REVIEW.md`; PLAN and HANDOFF link to finding IDs instead of copying
  acceptance criteria.
- Completed-run evidence: files under `docs/history/`; current documents summarize and link.
