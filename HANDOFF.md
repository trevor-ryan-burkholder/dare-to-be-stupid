# START HERE — current handoff, last swept 18 August 2026

**State:** `main` at `0.190.0`. The manifests and package-lock root metadata agree. Measured on the
current tree with Node 24.14.1: `npm run lint` and `npm run typecheck` clean; `npm test`
**2569 pass, 0 fail**; `npm run test:integration` **147 pass, 0 fail** (both measured on 0.190.0, with
the `run-lock.mjs` hash verified before staging and again after committing); `npm run release-check`
**ok**. The live tier **was re-run at 0.188.0 and passed 31 of 31**, which is the mandatory tier-3 canary
F36/item 93 owes: that repair is inside `spawnClaude`, whose contract belongs to another binary. The
0.179.0 run's non-deterministic `improve-contract` failure did not recur. Versions 0.181.0 through
0.187.0 owed no live run — nothing in them touches `spawnClaude`, `claudeArgs`, `childSettings`, envelope parsing or a template's output
contract. Its last measurement, at 0.179.0, was **30 pass, 1 fail** — see the live-tier note below.

**Slice discipline is a harness now, not a habit.** `npm run slice-check` fingerprints the shipped
surface, refuses debugging scaffolding, runs the gates, re-fingerprints, and in `commit` mode
verifies the index and `HEAD` against the same fingerprint. It exists because three defects on
18 August came from reading a green suite as evidence about which bytes were committed; re-injecting
the two mutants 0.182.0 actually shipped makes it refuse. `PLAN.md` item 99.

**External review:** `REVIEW.md` is **CHANGES REQUESTED**. The counts and the finding list live
there and are **not restated here** (REVIEW F40): this file carried a seventeen-high/thirteen-medium
snapshot long after the ledger had moved past it, which is the reliable outcome of copying a
long-lived queue into a short-lived summary. The review includes a
guarantee-strength audit, durable-artifact registry, failure-shape matrix, and explicit
negative-guarantee sheet. These are the first implementation gates in `PLAN.md`. Claude Code may
implement them; Codex owns closure after reviewing the exact repair and its acceptance evidence.
Review-pending repairs do **not** pause development: Claude continues through every independent
eligible PLAN item and requests one evidence-complete review batch only at a dependency/release
boundary or when no independent work remains.

**Implemented, awaiting Codex verification.** Twenty-two findings have repairs. A second Codex pass at
0.179.0 recorded F31–F37, six of them incomplete repairs of the first fifteen; PLAN items 88–94 own
them and Gate 0D records the order. Each
remains **OPEN** in `REVIEW.md` — implementation and passing self-tests are not acceptance. A coherent
Codex batch may cover several focused commits while each finding retains separate closure evidence:

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
| 0.184.0 | F34 / item 91 | the claim release guard, exported and tested directly |
| 0.185.0 | F33, F37, F39, F40 | sibling-safe sweep, post-exit group reap, exact-match sweep, HANDOFF de-duplicated |
| 0.186.0 | F38 / item 96 | the publication subject re-established after deploy |
| 0.187.0 | F35 / item 92 | ratchet credit requires a definition the checkout has |
| 0.188.0 | F36 / item 93 | guard denials travel on their own bounded channel |
| 0.189.0 | F10 / item 64 | one atomic terminal receipt, on every path after the lock |
| 0.190.0 | F13 / item 67 | one arming vocabulary, and a capability set monotonic within a run |

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
unstarted for one session on a mistaken reading of that; **it is implemented at 0.179.0 and its
mandatory tier-3 run is recorded below.** It is not blocked, and nothing in this file should say
otherwise.

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

**It is in `PLAN.md`, and only there** (REVIEW F40). This section used to restate the queue, and a
restated queue is a queue that goes stale: it recorded F7/item 61 as *blocked on unauthorised
expenditure* three sections below the table recording F7 implemented and live-validated at 0.179.0,
and it kept a sequencing narrative that later gates had already overtaken. A fresh agent reading it
would pause finished work and follow an order nobody holds any more.

`docs/INDEX.md` already names `PLAN.md` as the single owner of live status and ordering. Read
`PLAN.md`'s gate sections for what is next; read `REVIEW.md` for what is still open against the
product. Nothing about either belongs here except the measured state at the top of this file.

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
