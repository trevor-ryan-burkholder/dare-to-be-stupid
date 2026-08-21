# Documentation index

**Status:** canonical
**Last swept:** 21 August 2026

This file is the control plane for project documentation. Read it first, then load only the
document needed for the task. Historical and research documents are evidence, not instructions.

## Authority and ownership

| Document | Purpose | Authority | Update rule |
|---|---|---|---|
| `DESIGN.md` | Product requirements and system architecture | Normative source of truth for product behavior | Change with the implementation or accepted design decision |
| `CONSTITUTION.md` | Numbered repository invariants and their enforcement | Normative single source for repository invariants | Change only with an accepted invariant or enforcement change; keep `test/constitution.test.mjs` aligned |
| `CLAUDE.md` | Contributor execution contract, stop conditions, and engineering rules | Normative where it does not conflict with `DESIGN.md` or `CONSTITUTION.md` | Edit here, then mirror the body into `AGENTS.md` |
| `AGENTS.md` | Agent-neutral mirror of `CLAUDE.md` | Mirror only | Do not edit independently |
| `PLAN.md` | Live backlog, dependency traversal, and review-queue state | Only live implementation plan | Update status in the same commit as the work |
| `REVIEW.md` | Codex-owned findings and closure evidence | Release gate, not a per-repair session stop | Claude may repair and continue; Codex closes at a dependency/release boundary |
| `HANDOFF.md` | Current repository state and immediate handoff | Operational summary | Keep short; move chronology to `docs/history/` |
| `DOGFOOD.md` | Pending live experiments and current scenario status | Operational runbook | Completed results move to `docs/history/` |
| `docs/DYNAMIC-WORKFLOWS-AND-PROVENANCE.md` | Dynamic-workflow and explicit-provenance architecture note and experiment rationale | Supporting analysis; `DESIGN.md` §15 is normative | Update when official behavior is re-verified or an architecture decision changes |
| `README.md` | Installation, use, and contributor quick start | User-facing summary | Link to canonical detail instead of duplicating it |
| `commands/meeseeks.md` | Installed launcher contract and operator-visible flags | Shipped runtime instruction; `DESIGN.md` remains normative | Change with command behavior, contract tests, and a version bump |
| `templates/*.md` | Role briefs, constraints, and machine-parsed output contracts | Shipped product code, not contributor documentation | Change with the parser/tests and a version bump; reviewer changes also require `DESIGN.md` §4 review |
| `output-styles/*.md`, `skills/*/SKILL.md` | Cosmetic rendering and optional persona guidance | Shipped presentation/runtime instruction only; never decision authority | Keep behavior claims aligned with the command and Driver; version-bump shipped changes |
| `docs/adr/*.md` | Accepted documentation and architecture decisions | Decision rationale; superseded by `DESIGN.md` on product behavior | Add or supersede an ADR when a durable decision changes |
| `docs/history/*` | Frozen run, audit, handoff, and review evidence | Historical only | Do not update status in place; add a new dated record or manifest entry |
| `docs/research/*` | Source-backed borrow/reject decisions | Non-normative evidence; accepted work must enter `PLAN.md` or `DESIGN.md` | Record provenance and current disposition; never infer priority from order |
| `BORROWED.md` | Compatibility pointer to the research ledger | Non-normative | Research lives under `docs/research/` |
| `BRIEF.md`, `COMPLETION.md`, `AUDIT.md` | Compatibility pointers to frozen snapshots | Historical only | Never use as a source of current work |

When documents disagree, use the canonical owner for the disputed fact:

1. `CONSTITUTION.md` for repository invariants and their enforcement.
2. `DESIGN.md` for what the product must do and how its architecture is constrained.
3. `REVIEW.md` for whether a reviewed defect still blocks acceptance.
4. `PLAN.md` for feature scope, live status, admission, and implementation order.
5. `HANDOFF.md` for the current measured repository state.
6. Historical and research files only as supporting evidence.

## Reader routes

- **Using the plugin:** `README.md`, then `DESIGN.md` only when deeper guarantees matter.
- **Autonomous development:** `CLAUDE.md` for execution/stop rules, `CONSTITUTION.md` for
  invariants, then `PLAN.md` for dependency traversal. Review-pending repairs remain OPEN in
  `REVIEW.md` but do not pause independent implementation.
- **Changing code:** `CLAUDE.md`, the relevant `DESIGN.md` requirement and `CONSTITUTION.md`
  article, `PLAN.md`, and open `REVIEW.md` findings that touch the change.
- **Reviewing code:** `REVIEW.md`, the relevant `DESIGN.md` requirement and `CONSTITUTION.md`
  article, and the exact diff.
- **Dynamic-workflow or provenance work:** `DESIGN.md` §15, then
  `docs/DYNAMIC-WORKFLOWS-AND-PROVENANCE.md`, `PLAN.md`, and `DOGFOOD.md`.
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
- Repository invariants: `CONSTITUTION.md`; `CLAUDE.md` and `AGENTS.md` point to numbered articles
  instead of restating them, and `test/constitution.test.mjs` verifies their enforcement citations.
- Live backlog status: `PLAN.md`; other documents link to item numbers instead of restating status.
- External defect status: `REVIEW.md`; PLAN and HANDOFF link to finding IDs instead of copying
  acceptance criteria.
- Autonomous stop conditions: `CLAUDE.md`; PLAN owns traversal/status semantics, and other
  documents must not invent permission checkpoints or treat review-pending as blocked.
- Completed-run evidence: files under `docs/history/`; current documents summarize and link.
