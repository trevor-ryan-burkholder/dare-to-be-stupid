# Non-coding opportunity review — 17 August 2026

**document-status: historical**

**Reviewed baseline:** `c7be605` at manifest version 0.164.0. The baseline was clean and matched
`origin/main` and tag `recursive-improv-2026-08-17` when this review began.

**Scope:** independent architecture, planning, evidence, and documentation review. No source, test,
template, command, hook, plugin/package manifest, or runtime-configuration file changed; the history
manifest is documentation. No paid Claude/plugin test ran.

## Authority and current state established

The review followed `docs/INDEX.md`: `DESIGN.md` is normative; `PLAN.md` is the only live
implementation queue; `REVIEW.md` is the Codex-owned release gate; `HANDOFF.md` is the current
measured-state summary; research and historical ledgers are supporting evidence only.

The shipped product remains Claude Code native. Driver alone owns durable state and terminal
decisions; Builder produces; independently instantiated Panel members judge; Oracle supplies held-out
deterministic evidence. Dynamic workflows, a general claim graph, lifecycle resume, Verified
Research, and Red assessment are not shipped capabilities. This review did not reopen them without new
evidence.

## Ranked opportunity ledger

| Classification | Opportunity and evidence | Smallest action | Benefit, risk, dependencies, and acceptance |
|---|---|---|---|
| **DO NOW — completed** | A newly flaky Playwright test can be normalized as `flaky`, earn no ratchet credit, yet accompany an exit-zero runner through otherwise-green gates. The parser, ratchet, and Driver paths establish the gap. | Add REVIEW F30, DESIGN's negative guarantee, and PLAN item 87 rather than altering runtime code in this task. | Prevents an unstable result from being documented as acceptable. Runtime repair depends on items 70 and 74; item 67 must retain the new result. Acceptance is the mixed passed/flaky exit-zero fixture refusing before Panel and `SHIPPED`, with clean and skipped/todo neighbours preserved. |
| **DO NOW — completed** | PLAN item 57 had metrics and partitions but no sealed trial protocol, clean-trial canary, private unseen final package, or human-label blinding. | Extend the existing item instead of adding an eval framework or duplicate roadmap item; align DOGFOOD and HANDOFF. | Prevents optional stopping, cross-trial leakage, public-answer contamination, and self-asserted success from inflating morning acceptance. A precommitted receipt, contamination canary, package digest, fixed denominator, and recorded blinding are deterministic acceptance evidence. |
| **DO NOW — completed** | “Throwaway repository” guidance could be read as host isolation, while Meeseeks and the documented Claude Bash sandbox establish no CPU, memory, process-count, disk, or workspace-growth quota. | State the negative guarantee in README, DESIGN, REVIEW, and item 84. | Prevents unsafe unattended deployment claims. The risk is overstating an absence inferred from documentation, so the text limits itself to what the repository and current documented controls establish. |
| **PLAN** | REVIEW F30 is a release-blocking false-success path. | Implement PLAN item 87 after items 70 and 74; bind the result into item 67's required roster. | Solves false completion without granting flaky tests ratchet credit. Exact closure evidence remains reviewer-owned in F30. |
| **EXPERIMENT** | Morning user acceptance is still unmeasured; current dogfood prose cannot support a comparative readiness claim. | Execute item 57 only under its sealed, clean, counterbalanced, private-final protocol after its harness exists. | Produces the product's real outcome metric. Costs are paid trials and human labels; the fixed cohort and non-compensable failure policy prevent a lucky rerun from laundering failures. |
| **EXPERIMENT** | Child filesystem/network confinement and host resource posture remain unmeasured external contracts. | Run item 84 only after items 56, 82, and 83, in an outer disposable environment with known limits. | Establishes a truthful capability profile without making a sandbox service or container runtime a dependency. Dangerous exhaustion canaries on the operator host are prohibited. |
| **OPERATOR DECISION** | A readiness result has no product meaning without a minimum acceptable morning-acceptance rate and severe-failure tolerance. | Set both values before the first comparative item 57 campaign. | This is a product-risk choice, not an architectural fact the repository can infer. Until set, results are descriptive only. |
| **PARK** | Portable Driver-managed CPU, memory, process-count, disk, or workspace quotas might improve containment. | Admit only if item 84 or a real run demonstrates a concrete gap and a cross-platform boundary can be stated and tested. | Avoids importing a control plane for a hypothetical need. Operator-provided disposable host limits remain the current guidance. |
| **REJECT** | Hosted eval/control-plane adoption, publishing the exact final benchmark, crediting flaky tests as passes, or reopening a general graph/new durable agent. | Preserve the existing native harness, private final package, stable-pass ratchet, and role authority model. | Each rejected option either duplicates existing control, contaminates evidence, weakens monotonic proof, or lacks new admission evidence. |

## Material findings

### Accepted 1 — retry-success laundering

The actual reporter and Driver paths distinguish runner exit success from normalized stability
evidence. A new `flaky` id has no protected prior identity to regress and the current code creates no
separate failed gate. F30 and item 87 name one deterministic repair and explicitly preserve the
stronger prior-ratchet reset path.

### Accepted 2 — evaluation protocol integrity

A selection/final split is insufficient when trials can share mutable state, the cohort can be changed
after results are visible, final answers are public or model-visible, or a human label sees the
candidate identity and agent's own success assertion. Item 57 now requires precommitment, clean
workspaces, counterbalancing, contamination detection, a private package digest, fixed denominator,
and documented blinding.

### Accepted 3 — resource-isolation truthfulness

Meeseeks' deadlines, budgets, output caps, and descendant settlement are important but are not resource
reservations. Current Claude sandbox documentation describes filesystem and network controls, not
host resource quotas. The documentation now separates these claims and makes item 84 measure rather
than assume the effective boundary.

## Roadmap effects

- Added PLAN item 87 and REVIEW F30; both are high-priority, with explicit dependencies on items 70,
  74, and 67.
- Expanded item 57 in place. No hosted service, separate eval authority, or duplicate evaluation item
  was added.
- Expanded item 84 in place. A portable resource-quota mechanism remains parked rather than becoming
  an implementation commitment.
- No existing item was promoted, demoted, or closed without new evidence. Item 55's general graph,
  item 54's dynamic workflows, item 58's journal, and item 86's Red job retain their existing
  admission conditions.

## Primary external evidence

- Anthropic's [agent-eval guidance](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
  recommends isolated trial environments and warns that shared files, history, services, and resources
  can correlate results.
- Anthropic's [eval-awareness report](https://www.anthropic.com/engineering/eval-awareness-browsecomp)
  documents a model identifying an evaluation and retrieving answer material, making exact public
  question/answer packages unsuitable as clean final evidence.
- Anthropic's [infrastructure-noise study](https://www.anthropic.com/engineering/infrastructure-noise)
  supports the already-planned rule that resource profiles and enforcement semantics are part of the
  evaluated system.
- Current [Claude Code sandbox documentation](https://code.claude.com/docs/en/sandboxing) describes
  filesystem and network isolation. This review found no documented CPU, memory, process-count, disk,
  or workspace-growth quota and therefore records absence of an established guarantee, not proof that
  no deployment-specific outer limit can exist.

No framework was harvested. The useful adaptations are the invariants: clean independent trials,
sealed decisions, contamination detection, matched resource semantics, and truthful negative
guarantees.

## Verification

- The final workspace diff is documentation-only: eight Markdown files, with no shipped or runtime
  path changed.
- PLAN contains 87 unique, contiguous item numbers. REVIEW contains 30 unique, contiguous findings:
  17 high and 13 medium, matching HANDOFF.
- All 46 current tracked or newly added Markdown files have valid local link targets.
- `AGENTS.md` remains the documented verbatim mirror of `CLAUDE.md` after its leading comment.
- `npm run lint`, `npm run typecheck`, `npm test` (2,307 pass), `npm run test:integration`
  (51 pass), and `npm run release-check` passed under Node 24.14.1.
- `git diff --check` passed. The final date/scope wording corrections were documentation-only and
  were followed by patch-integrity and link checks. No paid live test ran.
## Pass ledger and convergence

| Pass | Result |
|---|---|
| 1 — authority, roadmap, implementation, and evidence trace | Accepted the three material findings above and made documentation/planning changes. |
| 2 — fresh post-edit consistency and opportunity scan | No new material opportunity. It verified finding/PLAN numbering, priorities, dependencies, evaluation terminology, resource claims, release/install coverage, and existing parked/rejected decisions. An edit-placement defect in a Markdown continuation was repaired before convergence was claimed. |
| Final hostile pass | Re-traced the only new runtime finding from parser through terminal eligibility; challenged the eval protocol for contamination and optional stopping; checked that containment wording does not promise a runtime or sandbox not present; found no additional material change. |

The opportunity loop reached a practical fixed point because the fresh pass and hostile pass produced
no new accepted product opportunity, every accepted finding has one current owner and admission test,
and the remaining search space would reopen documented parked/rejected architecture without changed
evidence. Paid live behavior, the item 57 threshold, and item 84's measured outcome remain unresolved by
design rather than accidentally omitted.
## Follow-on independent recursive cycle — 17 August 2026

This section records a fresh review of the resulting working artifact. It does not revise the
earlier conclusions above. The same non-coding and no-paid-test scope applied.

### Unified disposition ledger

| Disposition | Finding or idea | Problem, smallest action, benefit, risk, prerequisites, and acceptance |
|---|---|---|
| **ACCEPTED** | Exact execution provenance was assigned to F22/item 76 but not specified there. Current parsing drops the official per-model usage map, while configuration aliases are recorded as though they described execution. | Extend F22/item 76 and item 57 to keep requested model/effort separate from observed per-model identifiers, bind each invocation to item 77's role-supply receipt, and record absence rather than substituting an alias. This makes a model substitution or missing observation auditable. It adds receipt complexity but no new authority. Acceptance forces a substitution and proves it is visible without logging secrets. |
| **ACCEPTED** | Item 57 could score broken, ambiguous, or low-coverage scenarios as though the result measured agent quality. | Require a versioned requirement-to-grader contract, reference-solution pass, seeded wrong/incomplete failures, valid-alternative acceptance, and quarantine rather than silent deletion. This prevents benchmark defects from becoming product conclusions. Admission requires deterministic scenario audits before paid comparison. |
| **ACCEPTED** | Item 57 and downstream item 59 could select a positive stochastic point estimate caused by trial or infrastructure noise, and an opened final partition could become optimization input. | Precommit an effect threshold, uncertainty method and error level, paired/counterbalanced trials, and a single-use final package. Unless uncertainty-bounded evidence establishes the minimum meaningful improvement, the result is inconclusive. An opened package cannot alter that campaign; if used for later discovery, the resulting candidate requires a new sealed campaign and final package. This costs trials and can deny weak gains, which is the intended false-readiness bias. |
| **ACCEPTED** | F28/item 83 treated a minimum CLI version as the whole compatibility problem. Official Claude Code documentation permits background updates between launches and announces a future headless default that changes discovery/authentication. The hostile pass then showed that path plus self-reported version still permits byte-different same-version replacement, while hashing only a launcher misses delegated code. | Expand F28/item 83 into a pinned compatibility policy; seal canonical real target, install-form-specific invocation-closure fingerprints, and reported version before/after probes and before every role; execute every invocation through that path with item 56's no-background-update control; and fail closed on same-version replacement, symlink/delegated-entrypoint retarget, or an unbounded install form. This closes verified-use and role-to-role drift gaps; availability intentionally yields to explicit refusal. |
| **ACCEPTED** | The preceding changes left literal downstream contradictions: item 59 still used raw strict-greater selection, item 76 consumed item 77 without ordering it first, REVIEW's trust table and README still described a floor, and item 57 did not assign ownership of the meaningful-effect threshold. | Correct the existing references and ordering rather than add duplicate items. Item 77 now precedes item 76; item 59 consumes item 57's uncertainty rule; README and REVIEW name compatibility policy; the operator owns the product effect threshold. |
| **ACCEPTED** | DOGFOOD blocked item 56's environment probe on all of Gate 0A, but Gate 0A includes F29/item 85, which consumes item 83, which in turn consumes item 56. Its table and detailed recipe also disagreed after the first repair. | Replace the broad Gate 0A blocker in both operational surfaces with HANDOFF step 1's locally implementable safety spine and state that the probe precedes F28/F29 closure. This removes the execution deadlock without weakening paid-test authorization or any prerequisite. |
| **ACCEPTED** | HANDOFF listed F13/item 67 before F30/item 87 even though item 67 must retain the stability result item 87 creates. A literal close-in-list-order implementation would either freeze the old roster or reopen a supposedly closed slice. | Allow item 67 construction earlier but require its closure after item 87, matching PLAN's dependency edge. Acceptance is a roster that contains the required stability result without a second corrective slice. |
| **ACCEPTED** | Current workflow documents still used “actual model” after F22/item 76 established requested selectors, observed identifiers, and explicit unavailability as distinct states. | Normalize DESIGN, DOGFOOD, REVIEW, PLAN, and the workflow report to observed-model terminology. This prevents an implementer from filling evidence from configuration; missing observation still cannot establish a match. |
| **ACCEPTED** | PLAN item 32 invited a general model-agnostic backend abstraction without a demonstrated review gap, conflicting with the Claude Code-native product boundary and treating heterogeneity as evidence of quality. | Park one optional cold-role experiment behind item 57's calibrated, model-correlated miss evidence and full role/receipt boundaries. Claude Code remains the native runtime; a side-by-side candidate has no authority and must improve recall under the sealed uncertainty/cost rule before a separate adapter slice is considered. |
| **ACCEPTED** | PLAN item 36 marked daemon-backed resumability OPEN while the newer item 58 correctly parks journal/resume work until a killed-run experiment proves a forensic gap; it also conflated terminal detachment with replay. | Separate a bounded native terminal-detachment experiment from crash/reboot replay and park the latter behind item 58 plus idempotency and compatibility-fence design. This prevents an unnecessary daemon and unsafe duplicated effects. |
| **ACCEPTED** | Several immediate or consequential open roadmap items described mechanisms but had no deterministic closure boundary. | Add focused completion/disposition criteria to items 29, 30, 33, 35, 40, 42, and 53 without changing their priority or approving speculative runtime work. Each now names the evidence that prevents a plausible-looking partial implementation from being called done. |
| **PLAN** | The runtime lacks the above receipt and CLI guarantees. | Existing owners remain F22/item 76, F28/item 83, and item 77. No new PLAN number was added. Item 77 must precede item 76; item 83 consumes item 56 and the full item 75/80/82 live contract suite. |
| **EXPERIMENT** | Morning acceptance remains unmeasured and the exact statistical design cannot be selected without a corpus and cost envelope. | Existing item 57 remains the bounded experiment. The operator seals the acceptance threshold, minimum meaningful delta, severe-failure tolerance, cohort, and stopping rule before results. Until then output is descriptive, not readiness evidence. |
| **ALREADY COVERED** | A general provenance graph, hosted eval control plane, durable workflow authority, or framework-owned model routing. | Existing receipts, ratchet/pins, Driver authority, independent Panel/Oracle, and the conditional graph/workflow designs already cover the valuable boundaries. None solves the newly verified problems more simply than extending current records and contracts. |
| **PARKED** | Dynamic role workflows, a general claim graph, crash-resume journal, automated prompt optimization, and a durable Red job. | Items 54, 55, 58, 59, and 86 retain their named admission conditions. This review did not produce the prerequisite runtime evidence needed to promote them. |
| **REJECTED** | Raw strict-greater selection, trusting semantic-version order as compatibility proof, reusing an opened final package, or replacing the Driver with an eval/workflow framework. | Each can turn noise, forward drift, contamination, or another control plane's success assertion into false readiness. Current purpose-built ownership is stronger. |
| **OPERATOR DECISION** | Product thresholds remain values architecture cannot infer. | Before item 57 runs, choose minimum morning acceptance, minimum practically meaningful improvement, and severe-failure tolerance. The statistical method executes those values; it does not invent them. |
| **OPEN QUESTION** | Exact live shapes and compatibility boundaries remain external facts. | Paid pinned canaries must establish which Claude Code releases satisfy the full contract, whether every production result exposes usable per-model identifiers, and how the documented future bare-mode transition behaves with Meeseeks authentication and discovery. Absence of that evidence is represented as absence, not guessed. |

### Follow-on roadmap effects

- F22/item 76 now preserve requested-versus-observed model identity and consume item 77's
  prompt/tool/policy supply identity.
- F28/item 83 now own bidirectional compatibility and one-CLI-per-run identity, not only a minimum.
  Item 56 supplies the non-overridable no-background-update control to every Driver-owned Claude
  probe and role; items 75, 80, and 82 remain the behavioral canaries.
- Item 57 now audits the task contract itself, precommits uncertainty and effect-size rules, and
  treats final evidence as private and single-use. Item 59 inherits that rule instead of SkillOpt's
  raw strict-greater comparison.
- No new roadmap item, framework, runtime, agent authority, or dependency was introduced.

### Additional primary evidence

- Anthropic's [agent-eval guidance](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
  requires unambiguous tasks, stable clean environments, outcome grading, repeated trials, and task
  quality assurance.
- OpenAI's [coding-eval audit](https://openai.com/index/separating-signal-from-noise-coding-evaluations/)
  found materially broken tasks caused by underspecification, overly strict or low-coverage tests,
  and misleading prompts; Meeseeks harvests the independent task-contract audit, not that benchmark.
- Anthropic's [infrastructure-noise study](https://www.anthropic.com/engineering/infrastructure-noise),
  [statistical eval guidance](https://www.anthropic.com/research/statistical-approach-to-model-evals),
  and METR's [autonomy-evaluation protocol](https://metr.org/blog/2024-03-15-example-autonomy-evaluation-protocol/)
  support repeated trials, explicit uncertainty, and confidence-boundary decisions.
- Official Claude Code [Agent SDK types](https://code.claude.com/docs/en/agent-sdk/typescript) and
  [cost tracking](https://code.claude.com/docs/en/agent-sdk/cost-tracking) expose per-model usage
  separately from aggregate usage.
- Official Claude Code [setup](https://code.claude.com/docs/en/setup),
  [headless](https://code.claude.com/docs/en/headless), and
  [CLI](https://code.claude.com/docs/en/cli-usage) documentation establish background-update,
  exact-version installation, output, and announced headless-default behavior. Documentation is an
  experiment input; pinned live evidence remains the compatibility proof.
- Official Claude Code [model configuration](https://code.claude.com/docs/en/model-config) states
  that family aliases update over time and full model names can pin a version. Existing explicit role
  selectors, item 56's ambient-control boundary, F22's observed-model receipt, and item 57's drift
  rule already capture the Meeseeks-native response; no new managed policy or model matrix was
  justified.
### Follow-on pass ledger, convergence, and verification

This follow-on cycle performed **13 complete substantive passes**, then one final hostile pass.
Passes 9–10 reached an apparent fixed point; pass 11's hostile review found the same-version CLI
replacement hole and reset convergence. Passes 12–13 were the required consecutive clean passes
after that repair.

| Pass | Result |
|---|---|
| 1 — authority and implementation trace | Accepted requested-versus-observed role provenance and assigned the receipt owner. |
| 2 — evaluator validity | Added task-contract, reference, negative, valid-alternative, and quarantine requirements. |
| 3 — stochastic decision integrity | Added precommitted meaningful-delta, uncertainty, fixed-cohort, and single-use-final rules. |
| 4 — external CLI contract | Replaced a one-sided version floor with a live-proven bidirectional compatibility policy and one-run identity. |
| 5 — dependency traversal | Corrected item 56/F28/F29 and item 87/item 67 ordering and put item 77 before its consumers. |
| 6 — literal-instruction audit | Aligned DOGFOOD's detailed prerequisite and normalized observed-model terminology across current authorities. |
| 7 — roadmap admission audit | Parked item 32's backend abstraction and item 36's unsafe resume implication; added focused closure criteria to underspecified open slices. |
| 8 — post-edit research/status impact | Aligned HANDOFF and research dispositions; no new runtime mechanism or dependency was admitted. |
| 9 — clean convergence pass | No new accepted change; authority, statuses, links, numbering, and mutable-fact ownership agreed. |
| 10 — second clean convergence pass | No new accepted change; historical pointers and current external-capability dispositions remained non-authoritative and consistent. |
| 11 — hostile executable-identity pass | Found that path plus version permits same-version replacement and that launcher-only hashing misses delegated code; F28/item 83 now bind an install-form-specific invocation closure. |
| 12 — restarted clean convergence pass | No new accepted change after target/fingerprint/version, wrapper, symlink, and delegated-entrypoint canaries were aligned. |
| 13 — second restarted clean pass | No new accepted change across false completion, replay, role authority, evaluation, release, and roadmap ordering. |
| Final hostile pass | Tried again to falsify completion, evidence, cold-role, Oracle, CLI, eval, replay, and dependency claims; found no material defect. |

**Final verification:** all 72 Markdown files resolve their local links; PLAN has 87 unique,
contiguous item headings; REVIEW has 30 unique, contiguous findings (17 high, 13 medium);
`AGENTS.md` remains the documented mirror of `CLAUDE.md`; package, lock root, plugin, and HANDOFF
all report 0.164.0. `npm run lint`, `npm run typecheck`, `npm test` (2,307 pass),
`npm run test:integration` (51 pass), `npm run release-check`, and `git diff --check` passed
under Node 24.14.1. No paid live test ran.

The remaining unknowns are deliberately external or operator-owned: paid compatible-CLI boundaries
and invocation-closure shapes, live per-model observation, item 56's minimum environment, item 84's
containment result, and item 57's product thresholds. Another documentation pass is unlikely to add
material value without one of those measurements or a changed repository condition.
