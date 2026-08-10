# Verification status

The build is finished, and the architecture iteration this file used to list as deferred is
now implemented — reviewer ownership, the Build Brief, lesson memory, advisory findings,
behavioural gates, conditional history and stalled-only racing. See `DESIGN.md` for why each
one is shaped the way it is.

What follows is the one thing the test suite cannot settle: whether the pieces work against
reality.

---

## Verified live

**Guard hook fires under a real PreToolUse event.** With the plugin installed, a command
writing to the ratchet state file was denied and tagged `[dare:protected-state]`, while a
command merely mentioning the slash command in prose ran normally. Both halves matter: a
guard that blocks everything is not a guard.

**`claude -p` children spawn and return parseable output.** Verified against claude
2.1.226. `--output-format json` returns an envelope carrying `result`, `is_error`,
`total_cost_usd` and a `usage` breakdown; `parseClaudeEnvelope` reads those field names, and
budget accounting uses the reported figures rather than an estimate. A trivial prompt cost
$0.26 because of cache creation, which is why nothing here estimates.

**Children do not inherit the operator's output style.** A child asked only for a field of
`package.json` answered in the persona the operator had active. Every child is now launched
with an explicit default style — for the reviewer that is a correctness fix, since its
output is machine-parsed.

**`extractTestIds` against live reporter output.** A real vitest run with one passing, one
failing and one skipped test yielded exactly the one passing ID.

**Install path works end to end.** With the caveat that cost several hours: the install
cache is keyed by version, and stale copies masquerade as failed fixes. See "Releasing" in
`CLAUDE.md` before debugging any plugin change.

**`--allowedTools Read Glob Grep Write Edit` does permit writing.** A live child given
exactly that flag set created a file with the Write tool. The permission model was never in
doubt; see below for what actually was.

**PreToolUse hooks inherit the environment of the `claude` process.** A child spawned with
`DARE_RUNNING=1` fired a hook that read `DARE_RUNNING: "1"` from `process.env`. This is what
lets the guard tell a run from an operator, so it was measured rather than assumed.

**The guard denies live, unscripted commands.** Not fixtures: during this session it refused
a recursive `rm` whose target was an unresolved shell variable, and refused a command
touching `.dare/config.json` from inside a run.

## Outstanding

**A deliberately incomplete build must draw a `fail` from a cold reviewer.** Plant a missing
requirement, run the reviewer template through a `claude -p` child, and confirm the parser
returns `fail` with `file:line` evidence on what *was* built. The parser is unit-tested
hard; what is unproven is whether a real reviewer, given the real prompt, produces output in
the shape the parser expects. Now also worth confirming that a reviewer handed **only the
ids it owns** returns exactly those, and that an `advisory-` entry comes back in the
documented shape rather than as prose.

**A first real run.** Against a throwaway repository with an initial commit and
`deploy.enabled: false`. The loop is the only major component that has never met reality.
Watch the ratchet catch one regression before letting it run long — that behaviour is the
reason the whole design exists, and it has only ever been exercised against temporary
repositories built by the test suite.

**A real race.** `race.enabled` is `false` by default, and the mechanism has only been
exercised against temporary repositories: real worktrees, real cleanup and real `--ff-only`
merges, but never a real builder inside one. Turn it on knowingly against a throwaway
repository first, and check `git worktree list` is clean afterwards.

**A real health probe.** `scripts/health-probe.mjs` is tested against a hand-written server
that answers, one that 404s, one that never answers and one that will not start. It has not
been pointed at a generated application's `npm start`. The failure mode to watch for is an
application that ignores `PORT`.

---

## Fixed here, and worth knowing about

**Every phase except `builder` was dead, and no test could see it.** `--allowedTools` is
variadic. The prompt was appended to argv immediately after it, so the CLI parsed the prompt
as one more tool name and the child exited with *"Input must be provided either through
stdin or as a prompt argument"*. `builder` alone survived, because
`--dangerously-skip-permissions` takes no operand. No PRD was ever authored, no design
written, and — since nothing defaults to pass — no reviewer could ever return a pass, so no
run could ever ship.

The suspicion recorded here previously blamed the *permissions*. The permissions were fine.
The argument order was not, which is why "start a small run and see whether `PRD.md`
appears" would have found it and reading the permission table would not.

The prompt now travels on stdin. That is deliberately not a reordering: a safe position
lasts only until someone adds a flag after it, whereas a prompt on stdin is not an operand
of anything. It also retires `ARG_MAX` for prompts carrying a whole template plus the PRD,
and prompts that happen to begin with `--`.

The lesson generalises past this bug: **`claudeArgs` is unit-tested, and unit tests assert
the array we meant to build.** The defect lived in another program's parsing of that array.
Anything whose contract is owned by a different binary needs one live check, not more
assertions.

## Unverified risk

The `reality-check` and `lesson-extractor` phases have still never run against a live child.
They use the same spawn path as the phases that have, so the argv fault above is fixed for
them too, but their prompts and their parsers are unexercised.

The lesson store's *usefulness* is unproven in a way the tests cannot reach. Storage,
retrieval, protection and the fail-safe paths are covered; whether the extractor produces
lessons worth reading is a judgement only a long run can settle. Read `.dare/lessons.json`
after the first real run and delete it if it has filled with generalities — retrieval is
designed so that an empty store costs nothing.

## Decisions

All recorded in `DESIGN.md` §14, alongside the one question deliberately left open: whether
to add a backend or security quality plugin beside impeccable, which only inspects user
interfaces.

When adding a phase, note that `PHASE_PERMISSIONS` in `scripts/driver.mjs` throws for an
undeclared phase rather than defaulting. Only `builder` runs in dangerous mode.
