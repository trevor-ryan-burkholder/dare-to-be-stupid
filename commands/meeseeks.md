---
description: Hand a PRD, an idea, an existing repository, or nothing at all to an autonomous build loop. Pre-production only.
argument-hint: [path-to-PRD.md | "an idea in quotes" | --improve ["area"] | (nothing)] [--deadline=<min>] [--give-them-the-box]
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs:*), Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/driver.mjs:*)
---

# /meeseeks

Start an autonomous run in the current repository.

`$ARGUMENTS` is one of:

- a path to an existing PRD — the loop starts at the design phase
- an idea in quotes — a PRD is authored first
- `--improve`, optionally with an area in quotes — **the repository already exists.** A cold
  child reads it and writes `PRD.md` from what it finds, grounding every requirement in a real
  `file:line`, then the ordinary loop fixes them. Refused on a repository with no meaningful
  history, because an author with nothing to read invents requirements the builder cannot satisfy
- nothing — "meeseeks me" mode invents its own idea, if `improvise.enabled` is set

Two flags may accompany any of those:

- `--deadline=<minutes>` — a wall clock on the whole run. Off unless given; `0` explicitly
  disables one. The ordinary ceilings are completion or budget, so most runs never want this.
- `--give-them-the-box` — **unsupported, deliberately.** Permits a run inside a run, to depth
  two, and arms a 30-minute wall clock unless `--deadline` set one. Everything else still holds.
  It exists because the canon's moral is a Meeseeks who cannot finish summoning another, and a
  joke that only ever prints a refusal is one nobody sees happen.

## Do this, in order

**1. Preflight. Do not skip it and do not summarise it.**

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs" --yes
```

Print the output verbatim. If the exit code is non-zero, **stop**. Report the failing
checks and their fixes exactly as printed, and do not offer to work around any of them.
Every one of them exists because the next step runs unattended with permissions disabled:

- a dirty working tree will be destroyed by the ratchet's `git reset --hard`
- a remote that looks like production is never a valid target
- a repository whose own hooks, instructions or MCP config are hostile will capture the
  builder before any runtime guard fires

**2. Start the run.**

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/driver.mjs" $ARGUMENTS
```

The driver owns the loop from here. It spawns its own `claude -p` children, runs the gates,
holds the ratchet, and ends in one of four states: `SHIPPED`, `STALLED`, `BUDGET`,
`ABORTED`.

## What you must not do

- **Do not build anything yourself.** You are the launcher. The builder is a separate
  process with a different prompt, and the auditor is a third process that must never see
  your reasoning about the code.
- **Do not re-run a failed preflight with a workaround.** If the working tree is dirty, say
  so and stop; committing on the user's behalf is not your call.
- **Do not edit `.meeseeks/state.json` or `.meeseeks/config.json` once a run has started.** A hook
  denies it from inside a run. That is the ratchet, and it is not editable by the processes
  it constrains. Before and after a run they are ordinary files: if the user wants a
  different `maxIterations` or a cleared lesson store, edit it here rather than handing them
  a command to run themselves.
- **Do not invent a nested run.** Nested runs are refused at the driver and guard hook unless
  the operator explicitly supplied `--give-them-the-box`. That flag is the only exception; the
  launcher may pass it through but may never add it on the operator's behalf.

## Before the first run

This is pre-production tooling. It runs with `--dangerously-skip-permissions` on its build
children by design, and the guard hook is the only limit that survives that. Point it at a
throwaway repository. If the user seems to be aiming it at something real, say so plainly
before running preflight.
