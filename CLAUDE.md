# CLAUDE.md — dare-to-be-stupid

Conventions for working **on this repo** (the plugin itself). `DESIGN.md` is the spec and
the source of truth; when this file and `DESIGN.md` disagree, `DESIGN.md` wins — fix this
file.

> **Scope note.** This repo *builds* an autonomous loop. It is not itself run by that loop.
> Do not run `/dare` against this repository.

---

## What this is

A Claude Code plugin. `/dare <path|"idea"|∅>` hands a PRD to an autonomous loop that
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
- **The builder cannot judge its own work.** Review happens in a *separate* `claude -p`
  process with no build log, no iteration history, no hint an agent wrote the code. Never
  "optimize" this into a subagent.
- **Nothing defaults to pass.** Missing evidence, unparseable reviewer output, a crashed
  gate, a timeout — all fail. If you are writing `catch { return pass }`, stop.
- **The guard hook is not editable by what it guards.** Processes inside a run — marked by
  `DARE_RUNNING` in their environment — may not write `.dare/state.json`,
  `.dare/config.json` or `.dare/lessons.json`. Outside a run these are ordinary files, and
  the operator edits them from wherever they like, including from inside Claude Code. The
  boundary is the run, not the plugin being installed: a rule that also locks out the person
  who owns the repository has stopped being a guard and started being a nuisance.
- **Style never touches logic.** The Junkion layer renders at output only. It may not
  inform gate results, ratchet state, or reviewer JSON. `DARE_STYLE=plain` must fully
  bypass it.
- **No nesting.** `dare` never spawns `dare`. Enforced at the driver *and* the guard hook.
- **Monotonic means three properties now, not one.** Test ids (the ratchet), security elements
  and cold-passed requirements (`scripts/pins.mjs`, `DESIGN.md` §4.3). Each has a different
  escape from a false pin, and **the escape is the load-bearing half**: a security pin escalates
  to a scoped reviewer rather than resetting, because a false pin under monotonicity is
  unremovable and turns a formatter run into an objective the builder cannot satisfy. If you
  add a fourth monotonic property, design its escape before its enforcement.
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
| `npm run test:live` | a real `claude -p`, and **it spends money** | when changing `spawnClaude`, `claudeArgs`, envelope parsing, or a template's output contract |

`npm run test:all` is tiers 1 and 2.

The live tier is armed by `DARE_LIVE=1` and **fails without it** rather than skipping. That is
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

**Any change to a shipped file requires a version bump**, in `.claude-plugin/plugin.json`
and `package.json` together. Shipped means `hooks/`, `scripts/`, `commands/`, `templates/`,
`output-styles/` and the manifests — everything except tests, docs and dev config.

This is not bookkeeping. Claude Code installs a plugin into
`~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/` and reads it from there. That
directory is keyed by **version**, so an update at an unchanged version resolves to the
existing folder and reuses the old code. Pushing, reinstalling and reloading all report
success while the loader keeps running the previous build.

Two related traps, both silent:

- `/plugin marketplace add` on an already-added marketplace reports success **without
  refetching**.
- Pulling `~/.claude/plugins/marketplaces/<name>` changes nothing — the loader reads the
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

## Style of work here

- The User directs, you execute. If something is ambiguous, pick the defensible option and
  note the assumption inline rather than stopping to ask.
- Comedy is in the *output*, never in the code. Identifiers, comments, commit messages, and
  errors are plain and literal. A confusing stack trace is not a joke.
- Failure output is verbatim and unstyled, always.
