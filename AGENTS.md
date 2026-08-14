# AGENTS.md — meeseeks

Conventions for working **on this repo** (the plugin itself). `DESIGN.md` is the spec and
the source of truth; when this file and `DESIGN.md` disagree, `DESIGN.md` wins — fix this
file.

> **Scope note.** This repo *builds* an autonomous loop. It is not itself run by that loop.
> Do not run `/meeseeks` against this repository.

---

## What this is

A Codex plugin. `/meeseeks <path|"idea"|∅>` hands a PRD to an autonomous loop that
designs, builds, gates, reviews, and ships until it passes an enterprise definition of
done, or the budget dies. Pre-production only.

Read `DESIGN.md` before writing code. Section map: pipeline §2, architecture §3, preflight
§3.5, security scan §3.6, DoD §4, impeccable §5.1, guard hook §6, layout §7, builder prompt
§8, style §9, config §10, weak point §11, build order §12, extras §13.

---

## Hard constraints

1. **No runtime dependencies.** `node:` builtins and shelling out. Dev-only deps (test
   runner) are fine. If you reach for a package to do the job, you're solving it wrong.
2. **Node ≥ 22.12.** Matches impeccable's floor.
3. **ESM, `.mjs`.** No CommonJS, no transpile step, no build.
4. **Cross-platform paths.** Use `node:path`. Contributors are on WSL, macOS, and Windows.

---

## Invariants — do not violate these

These are the load-bearing properties. A change that breaks one is wrong even if tests pass.

- **The ratchet is monotonic.** A test ID that has ever passed may never be allowed to fail
  again. Any code path that removes an ID from the passing set without a `git reset --hard`
  + regression task is a bug.
- **The builder cannot judge its own work.** Review happens in a *separate* `Codex -p`
  process with no build log, no iteration history, no hint an agent wrote the code. Never
  "optimize" this into a subagent.
- **Nothing defaults to pass.** Missing evidence, unparseable reviewer output, a crashed
  gate, a timeout — all fail. If you are writing `catch { return pass }`, stop.
- **The guard hook is not editable by what it guards.** Processes inside a run — marked by
  `MEESEEKS_RUNNING` in their environment — may not write **anything under `.meeseeks/`, at any depth,
  including artifacts that do not exist yet.** The rule is *positional*, not a list of names:
  enumeration was the original defect, because each new artifact defaulted to writable until
  somebody remembered to add it, and `red-evidence.json`, `test-report.json` and the archived
  briefs are all read back as decisions. Outside a run these are ordinary files, and the
  operator edits them from wherever they like, including from inside Codex. The boundary
  is the run, not the plugin being installed: a rule that also locks out the person who owns the
  repository has stopped being a guard and started being a nuisance.
  **And the file itself, since 0.88.0.** This bullet's title was true of `.meeseeks/` and false of
  the guard for a long time: nothing stopped a builder rewriting the rule that constrained it.
  `protected-guard` closes that, resolved from `import.meta.url` so it protects whichever copy is
  actually deciding. For any ordinary target it never fires — the guard lives in an install cache
  outside the tree — so it exists for the one case where the repository under test *is* the
  plugin.
- **The driver must hand the guard to every child it spawns, and this is the one to break most
  easily.** Registering the hook in `hooks/hooks.json` covers the *operator's* Codex
  sessions; **a `Codex -p` child does not load the operator's plugin PreToolUse hooks.** For
  eleven versions every builder therefore ran completely unguarded while `test/guard.test.mjs`
  stayed correct and green, because it proves the guard's *logic* and nothing asserted its
  *invocation*. The hook now travels in `childSettings()`, read from the manifest rather than
  restated, and `test/live/guard-registration.live.test.mjs` is the only thing that can hold it.
  **If you touch `claudeArgs` or `childSettings`, run tier 3.** A unit test cannot see this
  break, and the visible signals all lie: the plugin *is* loaded in those children — its
  SessionStart hook reaches them.
- **Style never touches logic.** The Meeseeks layer renders at output only. It may not
  inform gate results, ratchet state, or reviewer JSON. `MEESEEKS_STYLE=plain` must fully
  bypass it.
- **No nesting.** `meeseeks` never spawns `meeseeks`. Enforced at the driver *and* the guard hook.
- **Monotonic means three properties now, not one.** Test ids (the ratchet), security elements
  and cold-passed requirements (`scripts/pins.mjs`, `DESIGN.md` §4.3). Each has a different
  escape from a false pin, and **the escape is the load-bearing half**: a security pin escalates
  to a scoped reviewer rather than resetting, because a false pin under monotonicity is
  unremovable and turns a formatter run into an objective the builder cannot satisfy. If you
  add a fourth monotonic property, design its escape before its enforcement.
- **A carried requirement is a pre-filter, never a substitute for the panel** (`DESIGN.md` §4.3,
  0.92.0). Carrying skips re-review on an iteration that is going to fail; a narrowed panel that
  returns `pass` triggers the **full** panel, which then decides. Delete that and a run can ship
  with a whole reviewer never having looked at the final tree — run 10's ship was saved by the
  *design* auditor spotting an inert `bin` that no requirement asked about. Two refusals to
  narrow go with it: everything carried, and every reviewer emptied.
- **A requirement evidenced only by a test file is never carried.** A pin fingerprints the whole
  evidenced file, so if that file is a test, the *source* can regress while the fingerprint
  holds. Recorded as a hazard in `HANDOFF.md` before the carry existed, armed by building the
  carry without deciding it, and closed by `isTestEvidence`. The pattern is deliberately broad
  because the errors are asymmetric: refusing to carry costs one re-review, wrongly carrying
  hides a regression for the rest of the run.
- **Quarantine is not a pass.** A quarantined security element blocks `SHIPPED`. Anything that
  lets a run ship over recorded lost protection has removed the only thing making the word mean
  something.
- **Say which of the two you mean** (`DESIGN.md` §6.1). **driver-owned** is a guarantee the
  guard hook enforces. **not supplied** is a discipline about what the driver hands over. Never
  write the second as though it were the first — the cold reviewer's starvation is a discipline,
  and a reader who mistakes it for a wall will build on it.
- **The two degradations this repo is worst at seeing are silent ones.** A prompt that grows
  until the builder is quietly worse (§3.9) and a defensive guard that disappears one iteration
  at a time (§4.3). Both are now measured. Neither would ever have reported a failure, which is
  exactly why they were invisible.

---

## Test gates

Every change must pass, in this order. These are the same gates the loop runs on its own
output — dogfood them.

```
npm run lint          # style + obvious errors
npm run typecheck     # jsdoc/tsc-checkJs; we are not adding TypeScript
npm test              # tier 1: unit + fixture tests, no external binaries
```

**Three tiers, and they are separately runnable on purpose** (`DESIGN.md` §11.1):

| command | what it needs | when |
|---|---|---|
| `npm test` | nothing but node | every change |
| `npm run test:integration` | real `git`, `node`, `npm`; no network, no API, no money | before any commit touching `race.mjs`, `health-probe.mjs`, the toolchains, or anything that shells out |
| `npm run test:live` | a real `Codex -p`, and **it spends money** | when changing `spawnClaude`, `claudeArgs`, envelope parsing, or a template's output contract |

`npm run test:all` is tiers 1 and 2.

The live tier is armed by `MEESEEKS_LIVE=1` and **fails without it** rather than skipping. That is
deliberate: a green tick for a suite that made no API call is a lie the reader will take for
coverage.

The reason the tiers exist is the argv defect. `claudeArgs` was unit-tested and correct; the
fault lived in another program's parsing of the array it built, and no assertion about that
array could have found it. **Anything whose contract is owned by a different binary needs one
live check, not more assertions.** Tier 2 earned this on its first run, by finding a `git` too
old for `--initial-branch`.

Rules:

- **Fixture tests over mocks** for anything that parses external output. `extractTestIds`
  is tested against *real, committed* vitest and Playwright reporter JSON in
  `test/fixtures/` — not hand-written approximations of it. See `DESIGN.md` §11: this is
  the component most likely to fail silently.
- **Assert values, not truthiness.** `expect(ids).toEqual(new Set([...]))`, never
  `expect(ids).toBeTruthy()`. A test that only proves something returned *something* is
  worse than no test. (We enforce this on generated code; we hold ourselves to it too.)
- **Test the deny path.** For `guard.mjs`, every blocked category needs a test proving it
  is blocked *and* a test proving a benign neighbour is allowed. Blocking everything is not
  passing.
- A gate that cannot run is a failure, not a skip. (Exception: `gate:design-slop` is
  legitimately skipped on non-UI targets — see `DESIGN.md` §5.1.)

---

## Slice rules

Build in the order given in `DESIGN.md` §12. Each slice lands complete — code plus its
tests plus its docs — before the next one starts.

- `guard.mjs` → `extractTestIds` → ratchet → `plugins.mjs`/`init.js` → `driver.mjs` →
  prompts → output style.
- **The first three slices are the product.** Guard, extraction, and ratchet are what make
  an autonomous loop safe and terminating. Do not start `driver.mjs` until they are
  unit-tested in isolation.
- One slice per commit. A slice that needs a second commit to be correct was too big.
- Scope discipline: no drive-by refactors of code outside the current slice.
- The output style lands **last**. It is cosmetic and it is the thing most likely to eat
  time that belongs to the ratchet.

---

## Prompt templates are product code

`templates/*.md` (builder, reviewer, prd-author, architect) are not documentation — they
are the highest-leverage artifacts in the repo, and the reviewer prompt especially.

- Changes to `templates/reviewer-system.md` require re-reading `DESIGN.md` §4 (the parser
  rules and output contract) and confirming the JSON contract still holds.
- The output contract is machine-parsed. If you change its shape, change the parser and its
  tests in the same commit.
- Keep them hostile. Charitable review is the failure mode the whole design exists to
  prevent.

---

## Releasing

**Any change to a shipped file requires a version bump**, in `.Codex-plugin/plugin.json`
and `package.json` together. Shipped means `hooks/`, `scripts/`, `commands/`, `templates/`,
`output-styles/` and the manifests — everything except tests, docs and dev config.

This is not bookkeeping. Codex installs a plugin into
`~/.Codex/plugins/cache/<marketplace>/<plugin>/<version>/` and reads it from there. That
directory is keyed by **version**, so an update at an unchanged version resolves to the
existing folder and reuses the old code. Pushing, reinstalling and reloading all report
success while the loader keeps running the previous build.

Two related traps, both silent:

- `/plugin marketplace add` on an already-added marketplace reports success **without
  refetching**.
- Pulling `~/.Codex/plugins/marketplaces/<name>` changes nothing — the loader reads the
  `cache/` snapshot, not the marketplace clone.

Symptom in every case: a fix that appears not to work, indistinguishable from a wrong fix.
Check `installed_plugins.json` for the pinned `gitCommitSha` before debugging anything else.

Do not rely on remembering this. Run:

```
npm run release-check
```

It finds the commit that introduced the current version and refuses if any shipped file
has changed since — comparing against the **working tree**, so it catches an uncommitted
edit too. It fails when it cannot establish a baseline, because an unknown baseline is not
evidence that nothing changed.

**It also refuses a version the `HANDOFF.md` header has not kept up with.** That header
carries its own instruction to move with the version, and it went stale by *fourteen*
versions once and then by three more directly under the warning added about it. A discipline
that keeps failing becomes a gate here. Both directions refuse — header behind the manifests
and header ahead of them — and so does a header that cannot be read at all, because an
unreadable header is not evidence of a correct one.

## Style of work here

- The User directs, you execute. If something is ambiguous, pick the defensible option and
  note the assumption inline rather than stopping to ask.
- Comedy is in the *output*, never in the code. Identifiers, comments, commit messages, and
  errors are plain and literal. A confusing stack trace is not a joke.
- Failure output is verbatim and unstyled, always.

## Imported Claude Cowork project instructions

claude code plugin for autonomous but dangerous fast-fail development
