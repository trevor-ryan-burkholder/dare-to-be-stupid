# Post-ecosystem recursive documentation and architecture review — 16 August 2026

**Document status:** historical review evidence. This file records the decisions and fixed-point
evidence from the review that began at commit `64808e5`; it does not add product requirements.
`DESIGN.md`, `PLAN.md`, and `REVIEW.md` remain authoritative.

**Reviewed starting baseline:** `64808e5` at manifest version 0.164.0. The executable release
baseline named by `REVIEW.md` remains `be19c9c`; every later committed change and every change
made by this review is documentation-only.

## Authority used

- `DESIGN.md` is normative behavior and architecture.
- `CLAUDE.md` is the contributor contract; the body of `AGENTS.md` is its agent-neutral mirror.
- `PLAN.md` is the only implementation queue. `REVIEW.md` is the Codex-owned release gate.
- `HANDOFF.md` summarizes current execution order; `DOGFOOD.md` is the operator runbook.
- `docs/DYNAMIC-WORKFLOWS-AND-PROVENANCE.md` supports DESIGN §15.
- `docs/research/` and `docs/history/` are evidence, never implementation authority.

## Working decision ledger

### ACCEPTED

| Pass | Finding and smallest accepted change | Problem solved |
|---|---|---|
| 1 | Made REVIEW's baseline durable across documentation commits and corrected the one-run morning-acceptance metric. | Prevents a self-staling release record and stops `pass@k`/all-trials math from misrepresenting the product metric. |
| 1 | Restored PLAN items 84–85 to the current traversal and separated the Driver-owned reviewer contract from PLAN item 51's Builder constitution. | Makes the live queue executable and avoids supplying Builder authority to cold reviewers. |
| 1 | Narrowed hostile/benign reviewer canaries to seeded cases, qualified README cold-review language as `not supplied`, and made DOGFOOD defer workflow admission to PLAN. | Removes unsupported security claims and duplicate prerequisite lists. |
| 2 | Recorded that current Claude Code `--safe-mode` disables dynamic workflows; constrained the first workflow experiment to Builder while Panel and Oracle remain ordinary safe-mode roles. | Preserves cold-role isolation instead of silently disabling the proposed mechanism or weakening safe mode. |
| 3 | Made item 54 depend on all Gate 0 work, item 77, and a recorded item 84 containment outcome. | Prevents a preview workflow experiment from outrunning known lifecycle, authority, and containment defects. |
| 4 | Incorporated current native subprocess credential scrubbing and named sandbox credential controls as measured defense-in-depth in items 56 and 84. | Gives environment hardening a smaller vendor-native option without mistaking it for a complete parent-process or cross-platform trust boundary. |
| 6 | Moved item 77 before F29/item 85 in the executable order. | Removes a dependency inversion: the reviewer-supply contract cannot consume a manifest that has not landed. |
| 7–9 | Removed residual summaries that still described item 54 as blocked only on F1/F2 or already unblocked by items 77/82/83. | Makes skim-loaded summaries agree with the authoritative dependency boundary. |
| 10 | Added the documented `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS` to the bounded workflow experiment while retaining the Driver deadline as absolute authority. | Prevents `-p` background workflow cleanup from waiting indefinitely or being confused with whole-role supervision. |
| 11 | Added an explicit post-convergence addendum to the ecosystem ledger for the later official-source credential update. | Preserves research chronology instead of rewriting an earlier fixed-point claim. |
| 15 | Replaced two absolute “no build log” claims with the actual Driver `not supplied` discipline and explicitly denied a filesystem-read barrier. | Makes the contributor invariant and rejected tiering note agree with DESIGN §6.1, so future agents do not build on nonexistent isolation. |
| 18 (hostile) | Reused the existing `childBudget()`/`--max-budget-usd` path in the workflow experiment and required pinned proof of its newly documented descendant enforcement. | Bounds workflow dollar fan-out sooner without duplicating the CLI estimator or surrendering Driver-owned token, fan-out, crash, and run accounting. |
| 19 | Corrected PLAN item 4's claim that `--max-budget-usd` is always on; it is derived only while `costCeiling` is armed, which is the default. | Makes the completed implementation note agree with `childBudget()`, DESIGN, and the operator's explicit `costCeiling: 0` escape. |
| 22 (hostile) | Added a pre-item-36 experiment for Claude's research-preview background-session supervisor, limited to terminal detachment. | Avoids building a duplicate daemon if native detachment works while preserving Driver-owned crash recovery, receipts, locks, guard, and terminal authority. |
| 24 | Made the detachment probe depend explicitly on F25/item 80 instead of describing `/meeseeks` as already user-only. | Keeps current 0.164.0 separate from the verified command boundary required before the post-DoD experiment. |

### REJECTED

| Idea | Reason not adopted |
|---|---|
| Consolidate the project into one PRD or architecture file | The documents have different authorities and lifecycles. A single large context would make stale status easier to ingest and normative rules harder to distinguish from evidence. |
| Add a graph framework or graph database | Existing ratchets, pins, receipts, and review artifacts already encode most useful relations. PLAN item 55 admits only a small explicit view after stable identities and a demonstrated invalidation query exist. |
| Let a dynamic workflow certify Builder or replace Driver authority | Disposable computation cannot advance durable state or certify the role that selected and contextualized it. |
| Enable workflows in Panel/Oracle by dropping safe mode | It sacrifices a current cold-role boundary to gain unproven fan-out. Selective, explicitly supplied workflow invocation must be documented and live-proven first. |
| Treat `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` as the child environment boundary | It preserves provider credentials in the parent Claude process and covers documented subprocess/provider surfaces, not arbitrary ambient variables. |
| Treat sandbox credential `deny`/`mask` as a general credential broker | The controls are named, proxy-mediated, platform- and TLS-sensitive, and can fail open unless separately configured. Item 84 must measure their actual scope. |
| Adopt `processWrapper` as a new supervisor | It overlaps F2/F11, is ignored on Windows, and would split lifecycle authority before a demonstrated failure requires it. |
| Adopt `CLAUDE_CODE_SCRIPT_CAPS` as a security gate | Substring matching with documented shell bypasses is weaker than Meeseeks' deterministic time, output, process, and tool boundaries. |
| Add a runtime dependency or vendor control plane | No reviewed problem requires one; the accepted adaptations are metadata, canaries, and bounded use of existing Claude Code capabilities. |

### PARKED

| Idea | Admission condition |
|---|---|
| Dynamic workflows in role agents (PLAN item 54) | Complete its full PLAN admission boundary, then prove a Builder-only bounded experiment improves matched morning acceptance after total workflow-tree cost is counted. |
| Dynamic workflows in cold roles | Officially documented selective invocation must work under safe mode, or an equivalently narrow supplied-only boundary must be live-proven without ambient project/user workflow discovery. |
| Small explicit provenance/dependency view (PLAN item 55) | Stable identities must exist and a targeted-invalidation or provenance query must beat the current records in a measured failure. |
| Claude Code tool-output memory limiting | Admit only after matched evals show tool-output pressure is a material contributor to prompt growth that existing compaction and item 57 resource evidence do not expose. |
| Claude Code process-wrapper integration | Reconsider only after F2/F11 land and a cross-platform lifecycle failure remains that the Driver cannot close directly. |

### OPEN

No new finding from this review requires an operator decision. Runtime work remains open in REVIEW
F1–F29 and PLAN items through 85. Live questions remain live: the exact supported CLI floor,
the smallest safe child environment, native credential-control coverage, and workflow behavior under
the pinned CLI must be established by the paid canaries already specified in PLAN. Documentation
does not turn those unknowns into guarantees.

## Primary external evidence checked

Only current primary Anthropic sources were used for vendor-contract changes:

- <https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents>
- <https://code.claude.com/docs/en/cli-reference>
- <https://code.claude.com/docs/en/workflows>
- <https://code.claude.com/docs/en/sandboxing>
- <https://code.claude.com/docs/en/settings>
- <https://code.claude.com/docs/en/env-vars>
- <https://code.claude.com/docs/en/agent-view>

The review also re-checked the existing official sources and dispositions recorded in
`docs/research/ECOSYSTEM-REVIEW-2026-08-16.md`; it did not promote a secondary claim into PLAN.

## Checks and convergence evidence

**Pass count:** 27 complete independent passes. Passes 1–4, 6–11, 15, hostile pass 18, passes
19 and 24, and hostile pass 22 accepted the corrections above; passes 5, 12–14, 16–17, 20–21, and
23 accepted no change. Adding this required historical ledger was treated as a new artifact. Passes
**25 and 26** are the two consecutive complete zero-change reviews of the final ledger-inclusive
repository. Final hostile pass **27** attacks authority, current-versus-target language, dependency
order, workflow/safe-mode compatibility, vendor capability scope, release identity, and literal
implementability; it accepts no change.

Mechanical and executable evidence:

- all tracked/current Markdown local links resolve;
- REVIEW findings F1–F29 and PLAN items 1–85 are contiguous and unique;
- every REVIEW finding is represented in PLAN, and HANDOFF names every F1–F29 implementation slice;
- the `AGENTS.md` body byte-equals `CLAUDE.md`;
- package, package-lock root, plugin manifest, and HANDOFF all say 0.164.0;
- only documentation files changed; `git diff --check` is clean;
- `npm run lint` and `npm run typecheck`: pass;
- `npm test`: 2,307 passed, 0 failed;
- `npm run test:integration`: 51 passed, 0 failed; and
- `npm run release-check`: pass at 0.164.0, shipped-file baseline `2e65204`, HANDOFF aligned.

The paid `npm run test:live` tier was not run: no shipped runtime or external CLI contract was
changed. Every proposed vendor-dependent behavior remains fail-closed behind the live evidence named
in PLAN.

Another review pass is unlikely to produce material value because the final artifact survives two
fresh zero-change passes plus a separate hostile pass after the last accepted correction. Remaining
work is implementation or live experimentation already admitted by REVIEW/PLAN, not another
documentation reinterpretation without new repository evidence.
