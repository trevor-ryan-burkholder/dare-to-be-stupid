# START HERE — current handoff, last swept 17 August 2026

**State:** `main` at `0.183.0`. The manifests and package-lock root metadata agree. Measured on the
current tree with Node 24.14.1: `npm run lint` and `npm run typecheck` clean; `npm test`
**2531 pass, 0 fail**; `npm run test:integration` **122 pass, 0 fail** (both measured on 0.183.0, with
the `run-lock.mjs` hash verified before staging and again after committing); `npm run release-check`
**ok**. The live tier was **not re-run at 0.181.0 or 0.182.0** and is owed by neither: nothing in those
changes touches `spawnClaude`, `claudeArgs`, `childSettings`, envelope parsing or a template's output
contract. Its last measurement, at 0.179.0, was **30 pass, 1 fail** — see the live-tier note below.

**External review:** `REVIEW.md` is **CHANGES REQUESTED** with seventeen high-priority defects
(F1–F3, F5–F8, F12, F14, F16, F18, F25–F30) and thirteen medium-priority defects
(F4, F9–F11, F13, F15, F17, F19–F24). The expanded review includes a
guarantee-strength audit, durable-artifact registry, failure-shape matrix, and explicit
negative-guarantee sheet. These are the first implementation gates in `PLAN.md`. Claude Code may
implement them; Codex owns closure after reviewing the exact repair and its acceptance evidence.

**Implemented, awaiting Codex verification.** Eighteen findings have repairs. A second Codex pass at
0.179.0 recorded F31–F37, six of them incomplete repairs of the first fifteen; PLAN items 88–94 own
them and Gate 0D records the order. Each
remains **OPEN** in `REVIEW.md` — implementation and passing self-tests are not acceptance, and Codex
reviews each commit separately:

| version | finding | what landed |
|---|---|---|
| 0.165.0 | F1 | atomic run-lock acquisition with ownership tokens |
| 0.166.0 | F26 / item 81 | launch revalidation and declared pre-loop output admission |
| 0.167.0 | F2 | bounded terminate/force/sweep on timeout and output cap |
| 0.168.0 | F3 | health success bound to the spawned application's assigned port |
| 0.169.0 | F6 / item 60 | reviewer citations resolved against the reviewed tree |
| 0.170.0 | F12 / item 66 | immutable specification revision, checked at gate and ship |
| 0.171.0 | F8 / item 62 | per-run, specification-bound, atomically written Oracle store |
| 0.172.0 | F14 / item 68 | verdicts sealed to an exact workspace identity |
| 0.173.0 | F16 / item 70 | test reports bound to the attempt that produced them |
| 0.174.0 | F18 / item 72 | every child envelope conserved into ceilings and receipts |
| 0.175.0 | F20 / item 74 | repository-contained reporter identities |
| 0.176.0 | F30 / item 87 | normalized flaky results as a failed deterministic gate |
| 0.177.0 | F4 | absolute HTTP deadlines and a bounded body for health and smoke |
| 0.178.0 | F9 / item 63 | positional `.meeseeks/` git boundary, retiring the filename list |
| 0.179.0 | F7 / item 61 | process success and envelope success conjoined |
| 0.180.0 | F31 / item 88 | fail-closed git publication and committed-tree identity |
| 0.181.0 | F32 / item 89 | uncleared report paths refused as a failed attempt |
| 0.182.0 | F34 / item 91 | takeover claims carry an owner and are reclaimable |
| 0.183.0 | — | restores the F34 sweep guard that 0.182.0 shipped mutated |

**0.182.0 shipped mutation-testing scaffolding and 0.183.0 undoes it. Read this before trusting
0.182.0's numbers.** A reviewing agent ran its mutation experiments against `scripts/run-lock.mjs`
in the working tree instead of a copy: it gutted `sweepAbandonedTakeover` to `rmSync` with the
arguments voided, and added a `process.stderr.write` trace to `releaseTakeoverClaim`. That happened
after the tier-1 run and before the commit, so `git add -A` captured the mutant and the commit
message describes a guard the commit does not contain. The agent restored the file afterwards, which
is why the working tree was correct and the commit was not. The tests were untouched and are hostile:
`does not sweep a live claim that replaced the abandoned one it read` fails against 0.182.0's module,
which is how this was caught. `d9632da` (0.181.0) was scanned and is clean.

Adversarially reviewing 0.182.0 before committing it found a defect the repair had introduced —
the abandoned-claim sweep renamed whatever sat at the claim path rather than the claim it had read,
so a contender could displace a *live* claim and put two reclaimers on one stale lock. Three
reviewers found it independently and it survived both skeptics. Repaired in the same commit by
reading back the moved file and restoring anything that is not the claim judged abandoned. `PLAN.md`
item 91 records two coverage gaps left honestly open.

Reviewing 0.181.0 adversarially before committing it found one defect neither F16 nor F32 named —
`gateTree` was a **second** reader of the declared report paths, using `existsSync` plus
`readFileSync`, which follows a symlink that `collectReports` refuses — and reproduced one
pre-existing hazard now recorded as `PLAN.md` item **95**: an id whose report was not produced by a
gate that did not run is read as a regression and hard-resets the tree, repeatedly, to `BUDGET`. It
is fail-closed and cannot reach `SHIPPED`, so it is an item rather than a blocker.

`PLAN.md` records what landed and where each repair's evidence lives; `DESIGN.md` §3.5, §4 and §11.1
state the mechanisms.

**The live tier is not a blocker.** The operator's Claude Max subscription covers it, so
`MEESEEKS_LIVE=1 npm run test:live` is a time question rather than a money one. F7/item 61 sat
unstarted for one session on a mistaken reading of that; it is now implemented with its mandatory
tier-3 run recorded below.

**Live tier:** run twice at 0.179.0 against the `claude` the driver actually spawns, about ten
minutes each. The first run was **31 pass, 0 fail**. The second was **30 pass, 1 fail**, and the
failure is recorded rather than rounded off: `improve-contract.live.test.mjs` asserted
`result.ok === true` **and passed that assertion**, then failed downstream because the document the
model wrote carried no `PRD-N.M` identifiers at all. Re-run alone, it passed (149s). So it is
non-deterministic model output rather than a regression — and specifically not F7's, whose code path
that same test exercised and found correct.

**That is a flaky test, and this repository has opinions about those.** 0.176.0 landed F30, which
makes a normalized flaky result a failed gate rather than something to shrug at. The same standard
should apply to the tier that judges the product; `PLAN.md` records it as an observation rather than
loosening the assertion, because a live test that tolerates a PRD with no requirements would stop
checking the thing it exists for.

The tier is mandatory for F7's slice because that repair is inside `spawnClaude`, whose contract
belongs to another binary; `CLAUDE.md` requires it for `claudeArgs`, envelope parsing and template
output contracts too. At 0.161.0 an intermediate `CI=1` change failed one live test and was reverted
before release. The full chronology is in the archived handoff.

## Current implementation order

1. Close the locally implementable high-priority defects: F1–F3, F6/item 60, F7/item 61,
   F12/item 66, F8/item 62, F14/item 68, F16/item 70, F18/item 72, and F26/item 81. **F1 (0.165.0),
   F26/item 81 (0.166.0), F2 (0.167.0), F3 (0.168.0), F6/item 60 (0.169.0), F12/item 66 (0.170.0)
   F8/item 62 (0.171.0), F14/item 68 (0.172.0), F16/item 70 (0.173.0), F18/item 72 (0.174.0), F20/item 74 (0.175.0) and F30/item 87 (0.176.0) are implemented and awaiting Codex verification. **F7/item 61 is blocked**: its acceptance makes
   the paid tier-3 `claude -p` child contract mandatory, and that expenditure is unauthorised.** Item 81
   followed F1 so launch revalidation and pre-loop output admission occur under the atomic owner.
   Item 66 supplies the specification identity consumed by items 62 and 68; F2 includes the
   resistant output-cap path. F30/item 87 is also high priority, but it lands only after item 70
   here and F20/item 74 in step 3 bind the accepted report; item 67 must retain the resulting
   stability gate in the required roster.
2. Close the external contracts before feature fan-out: F5/item 56 through a paid child-environment
   probe, F11/item 65 through real Windows descendant-cleanup evidence, and F15/item 69 through an
   Oracle-read canary and an honest confidentiality decision. Add F21/item 75's disposable real
   loader/cache release check and F25/item 80's user-only command-surface canary in the same
   external-contract campaign; batch item 80 with F24/item 79's versioned command repair. Close
   F27/item 82 with pinned role-tool availability canaries, including the real Oracle-author phase.
   Close F28/item 83 in that same pinned matrix by deriving a tested compatibility policy, resolving
   one install-form-specific invocation identity: canonical real target, reported version, and
   fingerprints for the mutable invocation closure. Fingerprint before and after compatibility probes,
   spawn every later probe/role through the sealed path, apply item 56's no-background-update control
   to each, and recheck the same complete identity before every role. Same-version target, symlink,
   and delegated-entrypoint replacement canaries must refuse;
   greater version numbers do not replace live canaries. After item 66
   from step 1, close item 77's cold-role supply manifest here, before its consumers in items 76
   and 85. Then close F29/item 85 after items 66/68/77/82/83: candidate files remain evidence, while reviewer
   authority comes only from identified pre-Builder and Driver-owned sources. Its reviewer contract
   is not PLAN item 51's general constitution.
3. Close F4, F9/item 63, F10/item 64, F17/item 71, F19/item 73, F20/item 74, F22/item 76,
   and F23/item 78. Item 76 includes requested-versus-observed model identity per role,
   closing the provenance owner already assigned by F23. F24/item 79 already lands once in step 2's
   shared command/loader
   slice; its Gate 0C classification does not create a second implementation pass. After items 70
   and 74 establish the accepted report identity, close F30/item 87 before Panel or shipping work.
   Close F13/item 67 after item 87 so the non-shrinking roster includes the new required stability
   result; item 67 may build earlier, but it cannot close against the pre-87 roster.
4. Complete item 40's reviewer contract after F6. Item 77 already lands in step 2 because F29
   consumes it; it complements but does not close F15's filesystem-confidentiality question. Then
   finish item 42 and item 29. Item 41 is closed as inapplicable because no Panel diff-package path
   exists.
5. Complete the live evidence for item 24, add item 57's machine-readable acceptance result, run
   dogfood cases A and B in item 20, and run the staged Ateliers capstone in item 31. Case C remains
   parked by operator decision. Item 57's comparative campaign must use its precommitted clean,
   task-audited, uncertainty-bounded, counterbalanced, private-final protocol; an exploratory run
   cannot become readiness evidence, and an opened final package is retired.
6. After items 56/82/83 establish the environment, tool, and CLI identities, run item 84's paid
   child-containment experiment. Record a portable default, a capability-gated profile, or rejection;
   do not infer a stronger default from documentation or settings registration.
7. Take items 52 and 53 only after the safety/reviewer work.
8. Consult PLAN's research-gated and conditional entries for items 32, 36, 54, 55, and 58 only
   after the queued implementation work. Item 32 is an optional heterogeneous cold-role experiment,
   not a Codex-native or model-agnostic runtime. Item 36 keeps terminal detachment separate from
   resume: the former gets a native experiment after item 80, while the latter remains parked on
   item 58's evidence and idempotency boundary. Item 54 additionally requires item 77 and item 84's
   recorded containment outcome; PLAN alone decides when any enters the queue.
9. Keep item 21 deferred until the repository is code-complete; Phase 6 and PLAN item 59 remain
   post-DoD. Item 86 remains parked behind its containment and incremental-detection admission
   conditions. The operator must set item 57's minimum morning-acceptance threshold, minimum
   practically meaningful improvement, and non-compensable severe-failure tolerance before the
   first comparative campaign.

PLAN owns the statuses. This file deliberately does not duplicate their acceptance criteria.

## Architecture analysis

[`docs/DYNAMIC-WORKFLOWS-AND-PROVENANCE.md`](docs/DYNAMIC-WORKFLOWS-AND-PROVENANCE.md) records the
current source-backed architecture analysis, conceptual durable-state ER diagram, and cross-role
information-flow map. The decision is **partial adoption by experiment** for role-internal dynamic
workflows, with Driver, Builder, Panel, and Oracle authority unchanged. It also records Verified
Research as an existing producer-authority job contract and a Red assessment job as a parked
post-DoD experiment; both require independently cold evidence and preserve Driver terminal
authority. A general explicit graph is **not approved**; exact evidence identity and minimal
dependency metadata are the only conditional next step. No runtime behavior changed.

## Documentation routes

- `docs/INDEX.md` — authority, ownership, and read order.
- `DESIGN.md` — normative product and architecture specification.
- `PLAN.md` — only live implementation plan.
- `REVIEW.md` — Codex-owned external findings.
- `DOGFOOD.md` — pending experiments and scenario status.
- `docs/DYNAMIC-WORKFLOWS-AND-PROVENANCE.md` — supporting architecture analysis and experiment design;
  `DESIGN.md` §15 owns the normative boundary.
- [`docs/history/HANDOFF-through-0.161.0.md`](docs/history/HANDOFF-through-0.161.0.md) — full
  execution chronology through this release.

The Ateliers campaign is recorded as **OPEN, STAGED** because that is what the repository can
prove. An external run changes this file only when its terminal state and evidence have been
recorded.
