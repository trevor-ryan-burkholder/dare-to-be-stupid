# Recursive improvement review — 17 August 2026

**Document status:** historical review evidence. This file records the decisions and convergence
evidence from the review that began at commit `a894b70`; it does not add product requirements.
`DESIGN.md`, `PLAN.md`, and `REVIEW.md` remain authoritative.

**Reviewed starting baseline:** `main` at `a894b70`, manifest version 0.164.0, plus an uncommitted
documentation draft introducing Research and Red Team job types from the immediately preceding
operator request. No runtime file was modified by this review.

## Authority used

- `docs/INDEX.md` defined document ownership and reader routes.
- `DESIGN.md` was normative for architecture and terminal authority.
- `CLAUDE.md` and its `AGENTS.md` mirror defined repository constraints.
- `REVIEW.md` was the external release gate; `PLAN.md` was the only live implementation queue.
- `HANDOFF.md` described measured state; supporting research and history were evidence only.

## Pass ledger

| Pass | Result | Material outcome |
|---|---|---|
| 1 | **ACCEPTED** | Removed a proposed fifth terminal result, generic model-judged Oracle authority, implicit new personas, Red's accidental item-49 dependency, and Red candidate mutation. Added explicit Red evidence separation, semantic child-environment controls, and the current `/deep-research` overlap without granting it acceptance authority. |
| 2 | **ACCEPTED** | Verified the actual Builder/reviewer templates are code-specific. Replaced literal prompt reuse with shared authority/spawn machinery plus Driver-owned job/lens addenda and restricted tool/effect profiles. Added immutable source acquisition evidence for cold research review. |
| 3 | **ACCEPTED** | Bound research acceptance receipts and carry semantics to report, manifest, and source-package identities; added evidence-retention policy and stale-package invalidation. |
| 4 | **ACCEPTED** | Made the hidden dependency order explicit: item 49 precedes item 34; Verified Research reuses Gate 0, item 40, item 77, and item 84 instead of inventing local substitutes; Red also depends on items 40 and 85. |
| 5 | **ACCEPTED** | Classified captured research sources and metadata as untrusted evidence under items 77/85 so source text cannot become producer or reviewer authority. |
| 6 | **ACCEPTED** | Closed the new Driver-network hazard. The first citation-acquisition profile is bounded public HTTPS with per-hop public-target checks, F4 deadline/body limits, inert-text capture, and no ambient credentials; authenticated/local/private sources remain unsupported. |
| 7 | **ACCEPTED** | Clarified the standing persona cap: required job/lens addenda reuse existing authority identities and do not create roles, effort keys, or terminal authorities. |
| 8 | **NO CHANGE** | Full authority, terminology, dependency, mutation, and provenance trace found no new material defect. Cosmetic wrapping was intentionally left unchanged. |
| 9 | **NO CHANGE** | Independent status/implementation/link pass confirmed documentation-only scope, current versions and sweep dates, OPEN/PARKED truth, no Research/Red runtime implementation, and no broken local links. |
| 10 | **NO CHANGE** | Post-ledger audit covered all tracked and untracked Markdown, manifest registration, authority labels, links, and patch integrity. |
| 11 | **NO CHANGE** | Independent reference/dependency audit found no missing PLAN/REVIEW identities or weakened job prerequisites. |
| 12 | **ACCEPTED — HOSTILE** | The first hostile pass found a duplicated normative phrase and malformed sentence joins introduced by this review. Corrected the duplicate and restored readable boundaries in every added non-table line. |
| 13 | **NO CHANGE** | Reset convergence pass verified all 45 Markdown files, references, added-line integrity, terminal mapping, and acquisition boundary. |
| 14 | **NO CHANGE** | Independent reset pass verified documentation-only runtime truth, job status, prerequisite reuse, immutable Red subject identity, and research evidence semantics. |
| 15 | **NO CHANGE — HOSTILE** | Repeated skeptical pass found no duplicated words, hidden terminal protocol, model-judged Oracle, self-certification path, mutable Red subject, unbound research evidence, unbounded acquisition, or runtime overclaim. |

## ACCEPTED — why the changes earned admission

1. **Preserve exactly four terminal states.** The job brief may record `blocked`, `inconclusive`,
   or `unverifiable` as reasons, but Driver maps causes to existing `STALLED`, `BUDGET`, or
   `ABORTED` semantics. This prevents a second lifecycle protocol.
2. **Keep Oracle deterministic.** A precommitted fact fixture must name an executable observation
   and exact expected result. Semantic source support stays cold Panel judgment or `unverifiable`.
3. **Use job contracts, not authorities.** Researcher and Red remain producer-authority jobs.
   Factuality, synthesis, and reproduction remain cold-review lenses. Job-specific prompts and
   tools are necessary because the current templates are code-specific, but they do not create
   standing roles.
4. **Keep Red from manufacturing its own evidence.** Red reads an immutable candidate; attack
   harnesses live in a separately identified workspace; an independent verifier replays from the
   same candidate with a benign control; Builder alone repairs.
5. **Make research provenance replayable and safe.** Driver-owned toolchain acquisition binds the
   source version, receipts and carry bind its digest, reviewers consume the same evidence, and
   hostile source text remains untrusted.
6. **Treat environment as semantics, not only secrets.** Ambient Claude controls can change retry,
   resume, workflows, models, permissions, and time budgets. Item 56 now requires explicit
   Driver-owned per-role controls.
7. **Reuse prerequisites.** New job types consume existing receipt, tool, instruction, containment,
   and unverifiable-channel work rather than cloning weaker mechanisms.

## REJECTED — no new evidence permits reconsideration

- A fifth terminal state for research or assessment coverage.
- A generic model judge renamed as Oracle or treated as deterministic evidence.
- New standing Researcher, Red, factuality, synthesis, or reproduction authority personas.
- Literal reuse of the code-only Builder prompt for non-code jobs.
- Letting Red mutate the candidate it assesses.
- Making item 49's prose/artifact toolchain a prerequisite for the code-security Red campaign.
- Treating Claude Code `/deep-research` voting, workflow success, or “no findings” as acceptance.
- A general graph database, workflow framework, hosted control plane, or telemetry graph. No new
  measured problem invalidated the prior minimal-metadata decision.
- Reopening prior rejected best-of-N, transcript self-modification, or framework imports. Repository
  conditions did not change their admission analysis.

## PARKED — admission conditions

| Idea | Admission condition |
|---|---|
| PLAN item 54, role-internal dynamic workflows | Gate 0 and item 77 complete; item 84 records containment; paid production-path experiment improves accepted work/cost without weakening cold roles or settlement. |
| PLAN item 55, explicit provenance dependencies | A real run demonstrates stale evidence or unnecessarily broad invalidation that existing pins/fingerprints cannot solve. |
| PLAN item 58, lifecycle journal/resume | A killed-run experiment demonstrates a forensic or recovery gap and idempotency/compatibility prerequisites exist. |
| PLAN item 86, verified Red assessment | Its full prerequisite set closes and a benign pilot finds independently reproduced incremental defects beyond the existing Panel/security path. |
| Authenticated, local, or private research sources | A separate normative credential/network/retention policy plus hostile live evidence establishes a boundary; the first public-HTTPS profile does not imply one. |
| Reviewer/Oracle-author workflows | Safe-mode independence, selectively supplied definitions, exact tool availability, descendant settlement, and measured value are live-proven per top-level cold role. |

## External primary sources revalidated

Checked 17 August 2026:

- [Claude Code dynamic workflows](https://code.claude.com/docs/en/workflows)
- [Claude Code sandboxing](https://code.claude.com/docs/en/sandboxing)
- [Claude Code environment variables](https://code.claude.com/docs/en/env-vars)
- [Claude Code agent view](https://code.claude.com/docs/en/agent-view)

The useful current delta was the bundled `/deep-research` producer workflow and the expanded set of
Claude environment controls that can alter unattended role semantics. The official sources still
require capability probes: natural-language workflow triggering is human-origin only; safe mode
disables workflows; workflow resume is session-local; background warnings and size settings are not
Driver caps; sandboxing does not confine every tool surface.

## Checks performed before the final hostile pass

- 44 baseline tracked Markdown files plus this manifested ledger inspected; zero broken local links.
- package/plugin/HANDOFF versions agree at 0.164.0.
- `CLAUDE.md` and `AGENTS.md` bodies match.
- PLAN contains unique items 1–86; REVIEW contains F1–F29; every finding is referenced in PLAN.
- REVIEW/HANDOFF priority counts agree: 16 high, 13 medium.
- Research remains OPEN, Red remains PARKED, and no runtime source/template/command implements either.
- All working-tree changes are documentation only.
- After the hostile correction reset convergence, passes 13 and 14 independently accepted no material change.

## OPEN

- Paid live evidence is still required for the existing PLAN/REVIEW external contracts. This review
  did not run Claude Code or claim workflow, sandbox, role-tool, process-settlement, or loader
  behavior for the operator's installed version.
- The exact public-source acquisition implementation and its address-policy canaries remain future
  PLAN work; this review specified the invariant, not runtime code.
- No new operator decision is required by this documentation change.

## Final hostile pass

The first hostile audit rejected the apparent fixed point because `DESIGN.md` contained the
duplicated phrase “acquisition prose-toolchain acquisition gate” and the expanded PLAN contained
malformed sentence joins. The review corrected every introduced added-line defect, reset convergence,
and obtained two new zero-change passes.

The repeated hostile audit then attempted to falsify the final architecture by checking for:

- a hidden fifth terminal protocol;
- model judgment disguised as deterministic Oracle evidence;
- Researcher or Red self-certification;
- Red mutation of its own assessment subject;
- source evidence that could change, carry stale, inject authority, leak credentials, or make the
  Driver fetch private/unbounded/active content;
- missing prerequisite identities;
- runtime behavior implied by documentation-only work; and
- duplicated or malformed added normative text.

None survived. Pass 15 accepted no material change.

## Fixed-point conclusion

Fifteen complete independent passes were performed: eight accepted material corrections, six
ordinary zero-change passes, and one final hostile zero-change pass. The last material defect was
introduced prose damage found by the first hostile audit; after its repair, two fresh independent
passes and the repeated hostile pass found no new accepted issue. Further work now requires the
explicit paid/runtime evidence already owned by PLAN/REVIEW, or speculative expansion that fails this
review's admission rule.
