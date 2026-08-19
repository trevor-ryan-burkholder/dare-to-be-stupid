# CONSTITUTION.md — the law of this repository

These are the load-bearing properties of meeseeks. **A change that breaks one is wrong even if tests
pass.**

This file is the single source. `CLAUDE.md` and `AGENTS.md` point here rather than restating, on the
same reasoning that makes `DESIGN.md` the product's source of truth: three copies of a law are worse
than one, because the divergent copy is indistinguishable from the true one.

**Every article is numbered so it can be cited.** That is the point of the numbering, and it is
`PRD-N.M`'s insight reapplied — a numbered thing is a checkable thing. Before this file, an invariant
could not be named in a commit message, a review, or a plan item; items 47 through 50 each lean on
*"nothing defaults to pass"* and *"the builder cannot judge its own work"* by paraphrase, where a
citation belonged.

**Every article names what enforces it, and `test/constitution.test.mjs` checks that those citations
resolve.** An invariant with no enforcement is a wish. That test is a real net rather than ceremony:
it is the shape of check that would have caught the guard-registration hole, where the guard's
*logic* was tested and green for eleven versions while nothing asserted its *invocation*.

**This is not a runtime document by default.** Handing standing law to a child is a real benefit, but
**the cold reviewer's starvation is itself constitutional** (CONST-2), and a constitution piped into
the panel would be the exact backdoor `DESIGN.md` §6.1 refuses. Any runtime handoff is per-persona
and deliberate.

---

## CONST-1 — The ratchet is monotonic

**The ratchet is monotonic.** A test ID that has ever passed may never be allowed to fail
again. Any code path that removes an ID from the passing set without a `git reset --hard`
+ regression task is a bug.

**Enforced by:** `scripts/ratchet.mjs`, `test/ratchet.test.mjs`

## CONST-2 — The builder cannot judge its own work

**The builder cannot judge its own work.** Review happens in a _separate_ `claude -p`
process. The Driver supplies no build log, iteration history, or hint that an agent wrote the
code; this is the `not supplied` discipline below, not a filesystem-read barrier. Never
"optimize" this into a subagent.

**Enforced by:** `scripts/role-supply.mjs`, `test/integration/reviewer-authority.integration.test.mjs`

## CONST-3 — Nothing defaults to pass

**Nothing defaults to pass.** Missing evidence, unparseable reviewer output, a crashed
gate, a timeout — all fail. If you are writing `catch { return pass }`, stop.

**Enforced by:** `scripts/driver.mjs`, `test/driver.test.mjs`

## CONST-4 — The guard hook is not editable by what it guards

**The guard hook is not editable by what it guards.** Processes inside a run — marked by
`MEESEEKS_RUNNING` in their environment — may not write **anything under `.meeseeks/`, at any depth,
including artifacts that do not exist yet.** The rule is _positional_, not a list of names:
enumeration was the original defect, because each new artifact defaulted to writable until
somebody remembered to add it, and `red-evidence.json`, `test-report.json` and the archived
briefs are all read back as decisions. Outside a run these are ordinary files, and the
operator edits them from wherever they like, including from inside Claude Code. The boundary
is the run, not the plugin being installed: a rule that also locks out the person who owns the
repository has stopped being a guard and started being a nuisance.
**And the file itself, since 0.88.0.** This bullet's title was true of `.meeseeks/` and false of
the guard for a long time: nothing stopped a builder rewriting the rule that constrained it.
`protected-guard` closes that, resolved from `import.meta.url` so it protects whichever copy is
actually deciding. For any ordinary target it never fires — the guard lives in an install cache
outside the tree — so it exists for the one case where the repository under test _is_ the
plugin.

**Enforced by:** `hooks/guard.mjs`, `test/guard.test.mjs`

## CONST-5 — The driver must hand the guard to every child it spawns, and this is the one to break most easily

**The driver must hand the guard to every child it spawns, and this is the one to break most
easily.** Registering the hook in `hooks/hooks.json` covers the _operator's_ Claude Code
sessions; **a `claude -p` child does not load the operator's plugin PreToolUse hooks.** For
eleven versions every builder therefore ran completely unguarded while `test/guard.test.mjs`
stayed correct and green, because it proves the guard's _logic_ and nothing asserted its
_invocation_. The hook now travels in `childSettings()`, read from the manifest rather than
restated, and `test/live/guard-registration.live.test.mjs` is the only thing that can hold it.
**If you touch `claudeArgs` or `childSettings`, run tier 3.** A unit test cannot see this
break, and the visible signals all lie: the plugin _is_ loaded in those children — its
SessionStart hook reaches them.

**Enforced by:** `scripts/driver.mjs`, `test/live/guard-registration.live.test.mjs`

## CONST-6 — Style never touches logic

**Style never touches logic.** The Meeseeks layer renders at output only. It may not
inform gate results, ratchet state, or reviewer JSON. `MEESEEKS_STYLE=plain` must fully
bypass it.

**Enforced by:** `scripts/style.mjs`, `test/style.test.mjs`

## CONST-7 — No nesting, unless the operator typed the words

**No nesting, unless the operator typed the words.** `meeseeks` never spawns `meeseeks`,
enforced at the driver _and_ the guard hook — **except** under `--give-them-the-box`, which
permits it to a depth of **two** and is unsupported, loud, and deliberately absurd. The flag
arms `MEESEEKS_GIVE_THEM_THE_BOX` into the environment, which is how both enforcement points
see the same fact from the same place; a permission living in only one of them would be worse
than no permission at all. **It relaxes that one rule.** `.meeseeks/` stays guarded, review
stays cold, nothing still defaults to pass, and the depth cap is fail-closed on a malformed
marker. It is a **flag and never a config key**, because a flag is typed once by somebody
watching and config is read quietly by a machine at three in the morning.

**Enforced by:** `scripts/nesting.mjs`, `test/integration/nesting-authority.integration.test.mjs`

## CONST-8 — Monotonic means three properties now, not one

**Monotonic means three properties now, not one.** Test ids (the ratchet), security elements
and cold-passed requirements (`scripts/pins.mjs`, `DESIGN.md` §4.3). Each has a different
escape from a false pin, and **the escape is the load-bearing half**: a security pin escalates
to a scoped reviewer rather than resetting, because a false pin under monotonicity is
unremovable and turns a formatter run into an objective the builder cannot satisfy. If you
add a fourth monotonic property, design its escape before its enforcement.

**Enforced by:** `scripts/pins.mjs`, `test/pins.test.mjs`

## CONST-9 — A carried requirement is a pre-filter, never a substitute for the panel

**A carried requirement is a pre-filter, never a substitute for the panel** (`DESIGN.md` §4.3,
0.92.0). Carrying skips re-review on an iteration that is going to fail; a narrowed panel that
returns `pass` triggers the **full** panel, which then decides. Delete that and a run can ship
with a whole reviewer never having looked at the final tree — run 10's ship was saved by the
_design_ auditor spotting an inert `bin` that no requirement asked about. Two refusals to
narrow go with it: everything carried, and every reviewer emptied.

**Enforced by:** `scripts/driver.mjs`, `test/driver.test.mjs`

## CONST-10 — A requirement evidenced only by a test file is never carried

**A requirement evidenced only by a test file is never carried.** A pin fingerprints the whole
evidenced file, so if that file is a test, the _source_ can regress while the fingerprint
holds. Recorded as a hazard in `HANDOFF.md` before the carry existed, armed by building the
carry without deciding it, and closed by `isTestEvidence`. The pattern is deliberately broad
because the errors are asymmetric: refusing to carry costs one re-review, wrongly carrying
hides a regression for the rest of the run.

**Enforced by:** `scripts/pins.mjs`, `test/pins.test.mjs`

## CONST-11 — Quarantine is not a pass

**Quarantine is not a pass.** A quarantined security element blocks `SHIPPED`. Anything that
lets a run ship over recorded lost protection has removed the only thing making the word mean
something.

**Enforced by:** `scripts/quarantine.mjs`, `test/quarantine.test.mjs`

## CONST-12 — Say which of the two you mean

**Say which of the two you mean** (`DESIGN.md` §6.1). **driver-owned** is a guarantee the
guard hook enforces. **not supplied** is a discipline about what the driver hands over. Never
write the second as though it were the first — the cold reviewer's starvation is a discipline,
and a reader who mistakes it for a wall will build on it.

**Enforced by:** `scripts/role-supply.mjs`, `test/role-supply.test.mjs`

## CONST-13 — The two degradations this repo is worst at seeing are silent ones

**The two degradations this repo is worst at seeing are silent ones.** A prompt that grows
until the builder is quietly worse (§3.9) and a defensive guard that disappears one iteration
at a time (§4.3). Both are now measured. Neither would ever have reported a failure, which is
exactly why they were invisible.

**Enforced by:** `scripts/context-budget.mjs`, `test/context-budget.test.mjs`
