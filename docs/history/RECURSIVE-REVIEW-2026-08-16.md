# Recursive documentation and architecture review — 16 August 2026

**Document status:** historical review evidence. This file records why review decisions were made;
it does not add requirements. `DESIGN.md`, `PLAN.md`, and `REVIEW.md` remain authoritative.

**Reviewed committed baseline:** `be19c9c` at manifest version 0.164.0. Shipped JavaScript, hooks,
templates, and output styles match `65a14cc` (0.161.0); the command and manifests changed through
0.164.0 and were reviewed at the current baseline. No executable file was changed by this review.

## Authority and scope inferred from the repository

- `DESIGN.md` defines product behavior and invariants.
- `CLAUDE.md` defines contributor constraints; after its warning comment, the `AGENTS.md` body is a verbatim agent-neutral mirror.
- `PLAN.md` is the only live implementation queue. `REVIEW.md` is the external release gate.
- `HANDOFF.md` is a compact operational summary; `DOGFOOD.md` is the current operator runbook.
- `docs/DYNAMIC-WORKFLOWS-AND-PROVENANCE.md` supports DESIGN §15. Files under
  `docs/research/` are non-normative evidence; files under `docs/history/` are frozen evidence.
- `README.md` is a user-facing orientation, not release authorization.

## Working decision ledger

### ACCEPTED

| Pass | Finding and smallest accepted change | Problem solved |
|---|---|---|
| 1 | Qualified README safety claims against the open release gate. | Prevents intended architecture from being mistaken for verified current behavior. |
| 1 | Added explicit Gate 0 dependency edges and corrected the DOGFOOD child-environment prerequisite. | Makes the implementation order executable instead of relying on prose inference. |
| 1 | Corrected dynamic-workflow limits, cache/isolation wording, and whole-tree cost accounting from current official Anthropic sources. | Prevents unsupported security and budget assumptions. |
| 1 | Added current dispositions to the borrowed-idea ledger and promoted a sanitized cold-role supply manifest as PLAN item 77. | Stops historical research from masquerading as an active queue and makes the `not supplied` boundary auditable. |
| 2 | Reordered specification identity before its consumers and clarified when staged acceptance runs occur. | Removes dependency inversions and premature acceptance. |
| 2 | Recorded REVIEW F23 / PLAN item 78 for the accepted-but-inert `styleModel` setting. | Removes a false operator control and false model provenance without inventing a new style model call. |
| 3 | Documented the existing `--confirm-prd` commit-and-exit checkpoint and recorded REVIEW F24 / PLAN item 79 for the shipped command omission. | Makes the only intentional pre-run human checkpoint discoverable without changing unattended defaults. |
| 4 | Replaced the remaining claim that `--confirm-prd` “pauses” a run with the actual two-invocation protocol. | Prevents a future agent or operator from designing nonexistent resume behavior. |
| 5 | Narrowed items 78 and 79 to static/config tests plus injected-child Driver integration; paid live evidence is conditional on changing an external CLI contract. | Keeps acceptance executable and proportional while preserving the repository’s live-test rule. |
| 6 | Restored code formatting in the new historical-manifest row after the filesystem fallback consumed Markdown backticks. | Keeps the history index machine- and human-consistent. |
| 7 | Replaced impossible digest “reproduction” language in item 77 with recomputation and verification against supplied bytes. | Prevents an implementer from storing forbidden prompt copies to satisfy a contradictory criterion. |
| 8 | Expanded F24/item 79 to correct the Driver’s ambiguous post-checkpoint continuation message. | Prevents a literal rerun from re-entering PRD authoring and spending an unnecessary model call. |
| 9 | Added the supported-command user-only boundary plus REVIEW F25 / PLAN item 80 from current Claude Code command semantics. | Prevents autonomous Skill selection from starting a permission-bypassing unattended loop through `/meeseeks`. |
| 10 | Added Driver-owned launch revalidation and explicit pre-loop phase-output admission as REVIEW F26 / PLAN item 81. | Closes the preflight-to-Driver race and prevents `git add -A` from laundering unattributed launcher, concurrent, or document-child edits. |
| 11 | Replaced contradictory post-lock “before any repository write” clauses with “before any target-content write,” including the older F1 text. | Distinguishes the required repository-local state lock from writes to the work product it protects. |
| 12 | Removed the second HANDOFF execution point for F24/item 79 after it was already batched with F25/item 80 and the loader campaign. | Gives the next implementer one unambiguous physical slice while preserving PLAN priority classification. |
| 13 | Corrected the review ledger's mirror scope, external-source label, and paid-test exception. | Prevents the non-normative memory artifact from contradicting AGENTS.md or the combined item 79/80 acceptance campaign. |
| 14 | Enumerated F26/item 81's minimum Driver-owned mutable safety rechecks and hostile fixtures. | Prevents a cleanliness-only repair from leaving remote, agent-config, effective-config, or requested-sandbox decisions stale across command and Driver processes. |
| 16 | Corrected the malformed item 77 verifier criterion left by an earlier replacement. | Restores an unambiguous, implementable digest-verification requirement. |
| 17 | Added the exact role-tool availability boundary as REVIEW F27 / PLAN item 82 and made it a dynamic-workflow prerequisite. | Corrects the false assumption that `--allowedTools` restricts context, restores the intended zero-tool Oracle policy, and exposes a live test using the wrong phase. |
| 20 (hostile) | Narrowed F25/item 80 from global operator authentication to the supported command's Skill-selection boundary. | Prevents `disable-model-invocation` from being misrepresented as protection against a model/process already granted arbitrary Bash and a direct script path. |
| 21 | Removed two residual “launcher user-only” labels after the hostile scope correction. | Prevents skim-loaded Gate 0 and review-lens text from reintroducing the broader claim. |
| 24 (hostile) | Added REVIEW F28 / PLAN item 83 for a measured, fail-closed Claude Code feature floor. | Preflight accepted any callable CLI even though the repository records 2.1.136 lacking a required flag; deriving the floor from the full pinned live suite avoids both late unattended failure and a guessed constant. |
| 25 | Corrected README's newly introduced claim that 0.164.0 already had a measured CLI floor. | Keeps current user guidance honest: no minimum is declared until item 83 produces evidence, and compatibility with older releases is unclaimed. |
| 26 | Narrowed the new F28 evidence claim from a continuous verified version range to the measurements the repository actually retains. | Prevents individual 2.1.226/2.1.228 live observations and 2.1.233 source validation from being laundered into a complete product contract matrix. |
| 27 | Separated dynamic-workflow admission prerequisites from cost/provenance evidence produced by the experiment itself. | Removes an impossible “land the experiment result before running the experiment” order while keeping whole-tree accounting mandatory before adoption. |
| 30 (hostile) | Corrected REVIEW's committed-tree identity and separated the 0.161.0 JavaScript/hook/template baseline from command and manifest changes through 0.164.0. | Prevents exact-tree review evidence from calling stale commit 65a14cc current main or hiding the shipped command surface that F24/F25 actually audit. |
| 33 (hostile) | Bound the proposed CLI floor to the staged candidate's full `npm run test:live` at both the floor and current pinned CLI. | Prevents a handpicked subset of new canaries from being called the “complete mandatory contract suite” while older spawn, envelope, hook, or template contracts go untested. |
| 36 (hostile) | Removed item 83's accidental requirement to refuse before all network activity. | Preserves preflight's deliberate all-check diagnostic behavior, including `npm ping`, while still requiring incompatibility to block run mutation, children, and automatic upgrade. |

### REJECTED

| Idea | Reason not adopted |
|---|---|
| Consolidate all project documentation into one PRD | ADR-0001 already rejects this: the files have different authorities and lifecycles, and one large context would increase stale-fact and LLM-loading risk. |
| Introduce a general graph framework or graph database | Existing ratchet, pins, review records, assumptions, and planned receipts cover current invariants. PLAN item 55 admits only a small explicit relational view after stable identities exist. |
| Let dynamic workflows become the Driver or completion authority | It would merge disposable computation with durable state and let Builder-controlled computation certify Builder. |
| Persist every workflow subagent as a durable graph node | It creates telemetry volume without improving requirement provenance; workflow internals remain computation inside a durable role invocation. |
| Automatically mutate production prompts or skills from transcripts | It makes the control surface self-modifying and risks secret/context leakage. Item 59 remains an offline, staged evaluation only. |
| Expose `--yes` as another user flag | The supported command consumes it internally for preflight; the Driver’s accepted pass-through is not a distinct user control. |
| Require a paid slash-command run for the static F24 help/frontmatter repair alone | Static command-contract checks, plugin validation, and injected Driver integration cover item 79 by itself. Its combined item 80/F21 command-loader campaign still requires one paid pinned-CLI canary because that slice changes an external loader authority contract. |
| Treat `$ARGUMENTS` in the command body as direct shell interpolation | Claude Code substitutes it into the skill prompt; only explicit dynamic-context shell blocks execute before the model. The launcher still needs ordinary argv tests, but this text is not itself a shell-injection primitive. |
| Treat `disable-model-invocation` as global launch authentication | The field controls the Skill surface only. A process already granted arbitrary Bash and a direct script path remains outside that guarantee; direct script entry is an unsupported operator/development path. |
| Borrow R43, R46, or R47 as new work | Current receipts/archives, launch classification, and terminal/reset plans already solve the underlying problems; duplicate abstractions would add drift. |

### PARKED

| Idea | Admission condition |
|---|---|
| R45 co-written source/evidence distinction | Reconsider only if Meeseeks introduces a durable artifact authored jointly by roles with different authority. |
| Dynamic workflows inside role agents (PLAN item 54) | F1/F2 lifecycle hardening, item 77 prompt-supply evidence, item 82 effective tool availability, and item 83's measured supported CLI floor must land first. Then the bounded experiment must prove whole-tree cost/provenance before production adoption. |
| Small explicit provenance/dependency view (PLAN item 55) | Stable specification, attempt, artifact, and acceptance identities must exist, and an invalidation/provenance query must demonstrate value beyond current records. |
| Killed-run recovery proof and prompt optimization experiments (items 58–59) | Admit only after the receipt, lifecycle, and privacy prerequisites named in PLAN are implemented. |

### OPEN

No unresolved finding from this review requires an operator decision. Verified implementation work
remains open in REVIEW F1–F28 and PLAN; this review did not silently convert research into approval.
Questions whose answers depend on experimental Claude Code behavior remain explicitly open in
`docs/DYNAMIC-WORKFLOWS-AND-PROVENANCE.md` and require live probes before implementation.

## External evidence checked

The external workflow and command-contract corrections used current primary Anthropic documentation only:

- <https://code.claude.com/docs/en/slash-commands> (custom-command/skill invocation and permission semantics)
- <https://code.claude.com/docs/en/cli-usage> and
  <https://code.claude.com/docs/en/agent-sdk/permissions> (tool availability versus approval)
- <https://code.claude.com/docs/en/workflows>
- <https://platform.claude.com/docs/en/agent-sdk/slash-commands>
- <https://platform.claude.com/docs/en/agent-sdk/subagents>
- <https://platform.claude.com/docs/en/agent-sdk/hooks>
- <https://platform.claude.com/docs/en/agent-sdk/cost-tracking>
- <https://code.claude.com/docs/en/common-workflows#run-parallel-claude-code-sessions-with-git-worktrees>

The installed Claude Code CLI was also checked with `claude plugin validate .`; its marketplace
description warning corresponds to existing REVIEW F21 and was not duplicated.

## Checks and convergence evidence

**Pass count:** 39 complete independent review passes. Twenty-five passes accepted at least one
material correction; the ACCEPTED table records each. Fourteen produced no accepted change.

Earlier zero-change pairs correctly did not end the task: passes 18–19 were invalidated by hostile
pass 20, 22–23 by hostile pass 24, 28–29 by hostile pass 30, 31–32 by hostile pass 33, and 34–35
by hostile pass 36. Pass 15 was a single zero before pass 16 found another defect. The qualifying
fixed point is passes **37 and 38**, two consecutive complete zero-change reviews of the final
artifact. Final hostile pass **39** independently attacked exact-tree identity, current-versus-
target language, literal implementation order, external-contract evidence, role authority,
preflight behavior, and edit scope; it accepted no change.

The review compared documented behavior to parser/configuration consumers, every child-model route,
the shipped command surface, package scripts, version mirrors, document authority, plan/review
cross-references, external primary-source claims, Markdown links, and the
`CLAUDE.md`/`AGENTS.md` mirror. Final mechanical evidence:

- all **42** tracked/current Markdown files: zero broken local links;
- REVIEW: F1–F28 contiguous and unique, **15 HIGH / 13 MEDIUM**; every finding appears in PLAN;
- PLAN: items 1–83 contiguous and unique, with no dangling item reference in the live queue;
- `AGENTS.md` body byte-equals `CLAUDE.md`; package, lock root, plugin, and HANDOFF all say 0.164.0;
- REVIEW's committed baseline equals current `main` at `be19c9c`; shipped JavaScript, hooks,
  templates, and output styles have no diff from `65a14cc`; current uncommitted changes are
  documentation only;
- `git diff --check`: clean;
- `npm run lint`: pass; `npm run typecheck`: pass;
- `npm test`: **2,307 passed, 0 failed**;
- `npm run test:integration`: **51 passed, 0 failed**;
- `npm run release-check`: pass at 0.164.0, shipped-file baseline `2e65204`, HANDOFF aligned; and
- Claude Code **2.1.233** `plugin validate .`: pass with one missing marketplace-description
  warning, already represented by REVIEW F21.

The paid `npm run test:live` tier was not run: this review changed no shipped runtime file, and its
open external-contract findings explicitly retain paid live acceptance. No unresolved review
question requires an operator decision. Implementation work remains open in REVIEW F1–F28 and PLAN
and was not laundered into completion.

Another pass is unlikely to add material value because the final artifact survived two fresh
zero-change reviews plus a separate hostile review after every prior hostile finding had reset the
count. Further work now means implementing or experimentally closing the recorded queue, not
re-reviewing the same documentation without new repository evidence.