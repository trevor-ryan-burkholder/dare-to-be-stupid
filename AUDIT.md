# Audit — 12 August 2026

> **Resolution note, 13 August 2026 — every fix-first item below is closed.** This document is
> preserved as the 12 August snapshot of the tree at 0.73.0; do not work from its findings.
> As of 0.88.0: **F1** fixed — `templates/builder-system.md` no longer names any runner and the
> `no-tests` objective takes the toolchain's `unitCommand`; **F2** fixed — `BRIEF.md` statuses
> reconciled (A3 reads BUILT 0.70.0–0.72.0); **F3** fixed — `oracle-author` is declared in
> `PHASE_PERMISSIONS` with `allowedTools: []`, stricter than the policy it once borrowed;
> **F4** fixed — the escalation prompt lives in `templates/security-escalation.md`; **F5**
> fixed — `BRIEF-REVIEW.md` deleted. F6 was scope, not a defect. The unchecked list at the
> bottom has also shrunk since: the suite, integration tier, release-check and tier 3 were all
> run on 13 August at 0.85.0 (see `HANDOFF.md`'s header), and twelve-plus dogfood runs exercised
> what this audit could only read.

**Scope correction, before anything else.** The audit prompt names 0.34.0. The working tree is
at **0.73.0** — thirty-nine versions further, including the dogfood runs (`DOGFOOD.md`), the
implemented oracle (§4.6), deploy with smoke checks (§10.1), and `COMPLETION.md` as the live
plan. Auditing 0.34.0 would need a checkout this environment cannot perform, so this audits
what exists. Several of the prompt's named seams were fixed by the intervening work and are
recorded below as verified rather than found.

**This audit is static.** The sandbox cannot mount this tree, so `npm run lint`, `typecheck`,
`test`, `test:integration`, `release-check`, and every `git log` inspection **did not run**.
Everything below is from reading. The full unchecked list is at the end and is part of the
verdict, not a footnote.

---

## Findings, by severity

### F1 — HIGH, DRIFT: the builder is told the wrong test runner in two of the three places that name one

The runner-collection miss is this project's most repeated failure — runs 1 and 2 on
10 August, and run 6, where a builder spent 978 seconds and 14M tokens on a correct
`node --test` suite the gate collected nothing from (`driver.mjs:2065–2069`). The fix was made
once, correctly: `firstIterationTask` (`driver.mjs:2077–2091`) derives the command from the
resolved toolchain, with a comment saying exactly why — "so a second toolchain gets a true
sentence instead of a Node one."

The other two places that state the contract were missed:

- `templates/builder-system.md:112–127` — "The gates run vitest and Playwright … unit tests are
  collected by `npx vitest run --reporter=json`" — unconditional, in the **system prompt**, and
  `builderSystemPrompt` (`driver.mjs:2787–2791`) appends only frontend direction. A .NET builder
  receives this alongside a Build Brief carrying `toolchain-dotnet.md` guidance. The two
  documents disagree, and the system prompt is the one wearing the authority.
- `driver.mjs:1476–1482` — the `no-tests` recovery objective: "the gate collects them with
  `npx vitest run`". On a .NET project this is not merely stale, it is **actively wrong advice
  delivered at the exact moment the builder is being corrected for using the wrong runner.**

Fails question 2. This is the composition bug the audit existed to find: B3 landed the
toolchain, B6 landed the guidance, the objective got the fix, and nobody owned the other two
sentences.

### F2 — MEDIUM, DRIFT: BRIEF.md is thirty-nine versions stale and is still shaped like the live plan

`BRIEF.md` A3 reads "DEFERRED. Sequencing, not impossibility." The oracle is implemented:
`scripts/oracle.mjs`, `oracle.enabled` in config (default off, `config.mjs:127–139`), a
capability-gated gate entry (`gate-policy.mjs:83–89`), authored in Phase 0b from the PRD alone
with failure ending the run (`driver.mjs:3166–3203`). The deferral rationale was answered in
code — `oracle.mjs:25–27` cites §4.4's positional-threshold move as what dissolved the
"builder owns the runner" objection.

`COMPLETION.md` is the actual live plan. Two documents shaped like plans, one of them wrong
about the flagship item, is drift being manufactured. Fails question 2.

### F3 — MEDIUM, DRIFT: the oracle author is a persona the permission table never names

The oracle author runs as `phase: 'review'` (`driver.mjs:3183`). `PHASE_PERMISSIONS`
(`driver.mjs:865–878`) exists to fail closed per phase — `permissionsFor` throws on an
undeclared phase precisely so nothing inherits another phase's powers — and the one new persona
in the system is invisible to it. The policy borrowed is identical (read-only tools,
reviewer model), so nothing is over-permissioned today; but the table's value is that it names
every claude -p role, and this routes around that on the day the cap in BRIEF §E was spent.
Fails question 2, weakly question 3.

On the prompt's direct question: **security-escalation is a reuse, not a persona** — the same
security reviewer, same model, narrowed to one element and three answers
(`driver.mjs:3592–3627`), declared in the table. **The oracle author is the one new persona**,
which is exactly what section E authorised. Count holds.

### F4 — MEDIUM, DRIFT: one persona's prompt is inline while the rule says templates are product code

The security-escalation prompt is a string literal in `driver.mjs:3594–3621`. Every other
persona reads from `templates/*.md`, and `CLAUDE.md` calls those "the highest-leverage
artifacts in the repo." Possibly deliberate — `COMPLETION.md`'s constraints note templates are
read from disk per child and must not be edited mid-run, while `scripts/*.mjs` is loaded at
startup — but if that is the reason, it is written nowhere near the prompt. Either move it to
`templates/` or write the reason down where the next reader will trip on it. Fails question 2.

### F5 — LOW, DRIFT: `BRIEF-REVIEW.md` survives at the repo root

Superseded when its content was folded into the rewritten `BRIEF.md`; it still carries
pre-decision statuses that now contradict both `BRIEF.md` and the code (it recommends dropping
F3; F3-reduced shipped at 0.26.0). It was kept only because the sandbox could not delete it at
the time. Delete it. Fails question 2.

### F6 — LOW, scope: the audit prompt itself

Named seams already fixed by 0.35–0.73 and verified rather than found: `MEESEEKS_IGNORED_PATHS`
covers `pins.json`, `assumptions.json`, `review.json`, plus `*.log` with the dogfood-run-4
unlinked-inode story (`driver.mjs:1816–1837`), and the all-or-nothing ignore check became
per-entry (`driver.mjs:1872–1876`) — the enumeration-bug pattern was found *and* fixed in this
third location. `PHASE_PERMISSIONS` declares security-escalation. The mutation gate's threshold
lives in a driver-owned config because Stryker survivors exit 0 by default, measured in both
directions at 9.6.1 (`toolchains/node.mjs:30–40`), with an empty changed-set handled as a
distinct statement rather than a pass (`node.mjs:134–139`) and 100 rejected as unsatisfiable
after this repo's own suite failed it (`node.mjs:55–63`).

---

## Verdict 1 — Is it still an MVP? **Qualified yes.**

No runtime dependencies (`package.json` devDeps only: eslint, typescript, @types/node). Every
module added since 0.19 traces to a DESIGN.md section: pins §4.3, context-budget §3.9, oracle
§4.6, dotnet §3.8, trx §11, deploy §10.1, toolchain guidance §3.8. Persona count holds at the
authorised cap (F3's wrinkle noted). The BRIEF §E "do not add" list is unviolated — no vector
stores, no frameworks, no swarms; the oracle is deterministic argv-and-stdout cases, not a
parallel test framework.

The qualification is `driver.mjs`: **3,788 lines**, up ~62% from 0.18.0, now carrying the
loop, the gates, the ignore stanza, seven child spawns, deploy, and the race. Every piece is
justified; the file as a whole is the understandability pressure point, and "keep the machine
understandable" is a requirement. Not a finding yet — a trend to watch, and extraction should
wait for a slice that forces it rather than a drive-by.

Root-level planning documents are multiplying (BRIEF, BRIEF-REVIEW, BORROWED, COMPLETION,
DOGFOOD, HANDOFF, plus DESIGN, CLAUDE, README). The machine is minimal; its governance is not.

## Verdict 2 — Is it consistent? **Mostly, with one real seam open.**

The per-item sprint held its documentation together better than expected — CLAUDE.md's
invariants match the code they cite (pins escapes, childSettings carrying the guard, the three
monotonic properties), and the two named silent degradations are both measured (context-budget
for §3.9; §4.3's decay closed by the pin mechanism itself). The failures of consistency that
exist are all of one shape: **a fact fixed in one place and restated in another** — F1 is the
serious one, F2/F4/F5 the paperwork. The repository's own defence against this shape
(positional rules over enumerated lists) was applied to paths and hooks but cannot cover prose,
and prose is where all five findings live.

## Verdict 3 — Does it still fit the thesis? **Yes — and the strongest evidence is recent.**

Nothing added since 0.19 defaults to pass. Oracle authoring failure **aborts the run** rather
than arming a gate over nothing (`driver.mjs:3176–3202`). A quarantined pin **blocks SHIPPED**
and produces a restore objective (`driver.mjs:1691–1702`), with retraction kept distinct so a
pin wrong at birth does not poison the mechanism (`driver.mjs:1543–1551`). The escalation
prompt tells the reviewer that "unknown" is legitimate *and* that it blocks shipping
(`driver.mjs:3618–3620`) — ambiguity priced, not absorbed. The mutation threshold is
driver-owned because the alternative handed the builder the gate's failure condition
(`node.mjs:37–40`) — the same reasoning that once deferred the oracle, now applied as the
standard move. The one deliberate fail-open — an unreadable assumptions log degrades to absent
context (`driver.mjs:3650–3656`) — is argued in place and correctly classed: it is advisory
context for a verdict that already defaults to fail, the lesson-store precedent.

The honest caveat comes from the project itself: `COMPLETION.md` estimates ~60% against "would
I trust a SHIPPED tag," because run 12 shipped a wrong answer past a reviewer that fuzzed
110,877 cases against a reference derived from the same spec — the same assumption, twice. The
thesis holds in the mechanisms; the *evidence* for it is still being bought, and Phase 0 of
`COMPLETION.md` (execute the never-executed surfaces first) is the right response to that gap,
given the probe that found half of them broken while green in a 1,400-test suite.

---

## Not checked, and why it matters

- **No gate ran**: lint, typecheck, tier 1, tier 2, release-check — the sandbox cannot mount
  this tree. A green claim about any of them from this audit would be the exact lie tier 3
  exists to refuse.
- **No git history inspection**: one-slice-per-commit and version pairing across 0.19–0.73 are
  unverified.
- **Test assertions read by name only**: `oracle.test.mjs` (46 quarantine/oracle references),
  `pins.test.mjs` (23), `driver.test.mjs` (11) exist and target the right subjects; whether
  they assert values rather than truthiness was not read line-by-line.
- **The oracle regression path**: whether a failing oracle case's *content* can leak into the
  gates objective's failure detail was not traced end to end. The design intent (cases named by
  id, PRD-requirement mapping) is documented; the leak check needs a read of `runOracle`'s
  failure rendering.
- **HANDOFF.md 0.35–0.73 in full**, `DESIGN.md` §3.9/§4.3/§4.6 directly (cited via code
  comments), `style.mjs` at current version (failure paths at spot-checked sites all use
  `verbatim()`: 3189, 3480, 1696).
- **`test/live/*`** per the prompt's own instruction, including `assumptions-contract` and
  `oracle-contract` — whether these have ever been armed is recorded in HANDOFF or nowhere.

## Fix first, in order

1. **F1** — derive the runner sentence in `builder-system.md` and the `no-tests` objective from
   the resolved toolchain, exactly as `firstIterationTask` already does. Every greenfield
   failure this project has ever recorded is this sentence; two copies of it are still wrong.
2. **F2** — reconcile `BRIEF.md` to 0.73.0 or freeze it with a banner deferring to
   `COMPLETION.md`. Two live plans is how the next agent rebuilds the oracle.
3. **F5** — delete `BRIEF-REVIEW.md`. One command, removes a document that contradicts two
   others.
4. **F3** — declare `oracle-author` in `PHASE_PERMISSIONS`, even as an alias of review's
   policy. The registry's worth is that it is complete.
5. **F4** — move the escalation prompt to `templates/` or write down why it is inline. Rules
   applied unevenly stop being rules.
