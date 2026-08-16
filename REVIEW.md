# Codex code review — 15 August 2026

> **Ownership:** This is the Codex reviewer document. Codex records and verifies findings here;
> Claude Code owns implementation. Do not treat an entry as closed until Codex has reviewed the
> repair and the relevant verification has passed.

**Reviewed tree:** `main` at `65a14cc` (`pre-codex`), version `0.161.0`
**Code continuity:** no executable script, hook, or template changed. Documentation releases
through 0.164.0 and the later reviewer-owned architecture maps do not alter runtime behavior.
F1–F11 are findings against the same executable tree, and finding status is authoritative only
here.
**Verdict:** **CHANGES REQUESTED** — seven high-priority defects and four medium-priority defects
are open.

This remains a read-only review of the Claude-native implementation. The documentation cleanup
does not implement or close any finding.

## Open findings

### F1 — HIGH: acquire the repository lock atomically before any work

**Status:** OPEN
**Affected:** `scripts/driver.mjs:5337-5344`, `scripts/run-lock.mjs:64-79`

The driver claims `.meeseeks/lock.json` only after PRD authoring, design authoring, quality-plugin
provisioning, writes, and commits. Preflight checks the lock in a different process and does not
hold it while the driver starts. Two launches can therefore both pass preflight and operate on the
same repository before either reaches `claimRunLock`.

The final check and claim are also separate operations. `claimRunLock` writes a fixed temporary
file and renames it over the lock, intentionally replacing an existing lock. Two contenders that
both observe an absent lock can therefore both claim successfully, depending on scheduling.

**Impact:** This violates the one-driver-per-repository invariant. Concurrent drivers can reset,
write, and commit over each other, making both runs' evidence and results untrustworthy.

**Required resolution:**

- Acquire the lock in the driver before the first child spawn, repository write, install, or
  commit.
- Make acquisition one atomic filesystem operation, not `check` followed by overwrite. An
  exclusive create or atomic lock directory are suitable shapes.
- Preserve the documented stale-lock recovery, but make takeover an explicit retry after the
  stale owner has been established.
- Give each acquisition an ownership token and only let that owner clear it; an aborting loser
  must not remove the winner's lock.

**Acceptance evidence:**

- A real concurrency test starts two claimers against one directory and proves exactly one wins.
- A second live driver is refused before any child is spawned and before any tracked file changes.
- A dead owner's stale lock remains reclaimable.
- A process that did not acquire the lock cannot clear another process's lock.

### F2 — HIGH: driver-initiated termination does not bound a child that ignores SIGTERM

**Status:** OPEN
**Affected:** `scripts/driver.mjs:4396-4403`, `scripts/driver.mjs:4420-4431`,
`scripts/driver.mjs:4450-4464`, `scripts/driver.mjs:4487-4504`

When `timeoutMs` expires, `shell` sets `timedOut = true` and sends `SIGTERM`. It settles only after
the child emits `exit`. There is no grace timer, `SIGKILL` escalation, or independent settlement
path if the child traps or ignores `SIGTERM`.

The 64 MB output-cap path has the same defect. It sets `overflowed = true`, sends only `SIGTERM`,
and calls `finishOverflowed()` only after `exit`. The later timeout cannot rescue this path:
overflow owns the verdict, but neither branch can force or independently settle a resistant child.

The timeout reproduction below was executed. The overflow extension is established by the control
flow above; its resistant-child fixture remains required acceptance evidence rather than a claimed run.

**Verified reproduction:** A child that ignored `SIGTERM` and exited naturally after one second
was run with `timeoutMs: 100`. `shell` reported a timeout, but returned after **1,018 ms**. A child
that never exits would defeat the watchdog indefinitely.

**Impact:** Gate, deploy, and Claude-child ceilings plus output-limit termination are not hard
bounds. A process can still stall an unattended run forever despite the log promising it will be
killed after a stated time.

**Required resolution:**

- Send `SIGTERM` at the deadline, allow a short bounded grace period, then force termination with
  `SIGKILL` where supported.
- Apply the force step to the relevant process tree/group and retain the descendant sweep.
- Guarantee that the promise settles even if the direct child never emits a cooperative exit
  after `SIGTERM`.
- Apply the same bounded terminate/force/sweep mechanism when the output cap fires.
- Keep timeout, buffer overflow, and self-termination as distinct verdicts.

**Acceptance evidence:**

- Tier 2 starts a direct child that traps `SIGTERM` forever and proves `shell` returns within the
  deadline plus the documented grace period.
- The resistant child and its descendants are no longer alive after return.
- A child that exceeds the output cap and ignores `SIGTERM` also settles within the grace bound;
  its descendants are gone and its verdict remains overflow rather than timeout.
- Existing bystander, ordinary-overflow, ordinary-failure, and self-termination tests remain green.

### F3 — HIGH: the health gate can pass against an unrelated local service

**Status:** OPEN
**Affected:** `scripts/health-probe.mjs:149-165`, `scripts/health-probe.mjs:451-469`

`detectBoundPort` accepts the first `localhost`, `127.0.0.1`, or `0.0.0.0` port printed by the
start command. `probeHealth` then replaces the assigned `PORT` with that number and treats a valid
response there as evidence that the spawned application is healthy. Printed output establishes no
ownership of the listener.

**Verified reproduction:** A decoy HTTP server was started locally. The health-probe child opened
no socket at all; it only printed the decoy's URL and stayed alive. `probeHealth` returned:

```json
{
  "ok": true,
  "detail": "health endpoint answered 200 (... announced by the application; PORT=... was set but not honored)"
}
```

**Impact:** A stale development server, dependency, proxy, or deliberately printed URL can satisfy
the observability gate while the application under test never starts. This is a false pass in a
required ship gate and violates the nothing-defaults-to-pass invariant.

**Required resolution:**

- Do not treat stdout alone as proof that the spawned process owns a listener.
- The simplest fail-closed policy is to require the assigned `PORT`. If announced-port fallback
  remains, it needs independent ownership evidence tying the listener to the spawned process tree,
  or an explicit driver/operator-owned port contract.
- Re-check child state before accepting a successful response so a startup failure cannot race a
  stale listener into a pass.
- Preserve the useful mismatch diagnosis; the defect is promoting the hint to passing evidence.

**Acceptance evidence:**

- The decoy reproduction fails even though the printed URL answers correctly.
- A real application that owns the accepted listener still passes under the chosen contract.
- A child that exits or fails to bind cannot pass through a pre-existing listener on the same
  port.

### F4 — MEDIUM: streaming HTTP responses bypass the health deadline

**Status:** OPEN
**Affected:** `scripts/health-probe.mjs:86-109`, `scripts/health-probe.mjs:270-299`

Both request helpers resolve a successful response only on `response.end`. The request timeout is
Node's socket-inactivity timeout, not a wall-clock deadline. A server that keeps writing bytes but
never ends the response is never inactive, so the request promise never resolves and the outer
probe loop cannot check its deadline. Response `aborted` and premature `close` are also not handled.

**Verified reproduction:** A health endpoint sent `200`, wrote a byte every 50 ms, and never ended.
The configured probe deadline was not enforced; when the fixture later terminated, Node reported
an unsettled top-level await instead of a normal probe result. If the server remains alive, the
outer gate watchdog is the next bound — `gateTimeoutMs` defaults to **2,700,000 ms (45 minutes)**.

**Impact:** A nominal 30-second health or smoke check can stall an unattended iteration for up to
the much larger outer gate ceiling, or indefinitely when used without that outer ceiling.

**Required resolution:**

- Give each HTTP attempt an absolute wall-clock deadline based on the remaining probe time and
  destroy/abort the request when it expires.
- Handle response `aborted`, response `error`, and premature `close` as failed attempts.
- Cap the response body while receiving it rather than accumulating an unbounded stream and
  slicing only after `Buffer.concat`.
- Apply the same behavior to local health requests and remote smoke requests.

**Acceptance evidence:**

- A continuously streaming response fails within the configured deadline plus a small scheduling
  tolerance.
- A prematurely aborted response returns a normal failed result rather than leaving an unsettled
  promise.
- An oversized body is bounded during collection.
- Ordinary local health and remote smoke responses still pass.

### F5 — HIGH: ambient operator credentials cross into every Claude role

**Status:** OPEN
**Affected:** `scripts/driver.mjs:1273-1295`, `scripts/driver.mjs:4705-4717`,
`scripts/driver.mjs:4867-4869`

`main` uses `io.env ?? process.env` as the run environment. `childEnvironment` copies that entire
record with `{ ...env }`, adding only the Meeseeks markers, and `spawnClaude` hands the result to
every `claude -p` phase. Builder, Panel, Oracle-author, architect, lesson-extractor, and other
roles therefore inherit unrelated operator credentials and secrets without an explicit grant.

**Impact:** An unattended Builder can inspect ambient tokens directly from its shell, and hostile
repository instructions or prompt injection can induce their use or disclosure. Cold roles also
receive credentials unrelated to their assignment. The pre-production warning reduces expected
exposure but does not establish a trust boundary.

**Required resolution:**

- Execute PLAN item 56's paid synthetic-canary probe before choosing the allowlist; the Claude CLI,
  authentication, executable discovery, and platform environment are external contracts.
- Construct a minimal child environment plus an explicit operator-configured allowlist of additional
  variable names. Preserve every measured Meeseeks run/depth marker.
- Never persist or print environment values. A refusal or preflight diagnostic may name a variable
  but must not reveal its value.
- Apply the boundary to every Claude role and descendant without weakening authentication, ordinary
  target-tool discovery, guard propagation, or cold-role isolation.

**Acceptance evidence:**

- Unit tests prove synthetic secrets are absent, required benign neighbours and Meeseeks markers
  survive, and no value appears in diagnostics or driver-owned artifacts.
- A paid tier-3 test proves a real Claude child and its shell cannot observe the synthetic canary
  while authentication and normal target-tool discovery still work.
- The same probe covers Builder and at least one cold role; a role-specific exception requires an
  explicit operator allowlist entry rather than ambient inheritance.

### F6 — HIGH: reviewer evidence is syntax-checked but not resolved to a repository line

**Status:** OPEN
**Affected:** `scripts/driver.mjs:330-331`, `scripts/driver.mjs:486-499`,
`scripts/driver.mjs:2320-2374`

A passing review entry needs a string shaped like `path/file.ext:LINE`, but the parser does not
establish that the path is inside the reviewed repository, that the file exists, or that the line
exists. Later pinning is best-effort: a missing file simply skips the pin, and an out-of-range line
still creates an ordinary requirement pin from the whole file. Neither case lowers the panel
verdict before the ship branch.

**Verified reproduction:** a one-entry report citing
`does/not/exist.ts:999999` was parsed with no problems. `parseReviewerReport` returned
`verdict: "pass"`, and `combinePanel` returned `verdict: "pass"`.

**Impact:** a hallucinated, stale, traversal-based, or out-of-range citation can satisfy the cold
Panel contract and reach `SHIPPED`. This turns “evidence required” into “evidence-shaped text
required,” violating the central nothing-defaults-to-pass invariant.

**Required resolution:**

- Resolve every passing compliance citation before panel combination, against the exact repository
  root and tree being reviewed.
- Reject absolute paths, traversal, and symlink escapes; require a readable regular file and an
  in-range, non-empty line.
- Apply the same location boundary to actionable advisory evidence.
- Flip an invalid entry to `fail` before it can be recorded, pinned, carried, or counted.
- Keep content/blob identity as the durable pin identity; a line number remains only a locator.

**Acceptance evidence:**

- Unit cases reject a nonexistent file, zero or out-of-range line, absolute path, `..` traversal,
  directory, and in-repository symlink escaping the root.
- A valid repository-relative citation passes on POSIX and Windows-shaped test roots.
- An integration case proves a success-shaped report with fake evidence cannot reach the ship
  effect, while a valid report still can.
- PLAN item 60 closes with item 40's reviewer-contract live check if they are batched.

### F7 — HIGH: a failed Claude process can be reinterpreted as a successful role result

**Status:** OPEN
**Affected:** `scripts/driver.mjs:4718-4746`; output-cap interaction at
`scripts/driver.mjs:4396-4464`

`spawnClaude` refuses an explicit timeout, but for every other `ShellResult` it consults
`result.ok` only when stdout is empty. If a nonzero, signalled, or output-overflowed process left
a parseable envelope whose `is_error` is false, `parseClaudeEnvelope` overwrites the process
failure with `ok: true`.

**Verified reproduction:** an injected shell result with `ok:false`, status 9, stderr
`process failed`, and stdout `{"is_error":false,"result":"claimed success"}` made
`spawnClaude` return `ok:true` and `text:"claimed success"`.

**Impact:** process failure is authoritative boundary evidence. Laundering it can accept a partial
PRD, design declaration, Builder response, or Panel verdict. The output-cap path is especially
dangerous because it currently has no distinct field in `ShellResult`; valid JSON emitted before
the cap can survive inside the truncated stdout.

**Required resolution:**

- Require both process success and a valid non-error Claude envelope for `ClaudeResult.ok`.
- Preserve a distinct timeout/overflow/process-error kind through `ShellResult`; none may become a
  role success because stdout happens to parse.
- Parse a failed envelope only for bounded diagnostics and reported usage, never for authority.
- Keep guard denials visible without letting their presence change process failure into success.

**Acceptance evidence:**

- Injected nonzero, signal, timeout, and overflow results carrying a valid success envelope all
  remain failed.
- Tier 2 runs a child that emits a valid envelope and then exits nonzero, plus an overflow variant;
  both preserve their original failure kind.
- Ordinary successful and `is_error:true` envelopes retain their current meanings.
- Because this changes `spawnClaude`, the paid tier-3 child contract is mandatory. PLAN item 61
  may share that spend with F2.

### F8 — HIGH: held-out Oracle cases are reused across runs and can enter target history

**Status:** OPEN
**Affected:** `scripts/driver.mjs:2549-2591`, `scripts/driver.mjs:5200-5230`,
`scripts/run-manifest.mjs:40-77`, `scripts/oracle.mjs:102-103`,
`scripts/oracle.mjs:206-210`

The Oracle is authored only when `.meeseeks/oracle.json` is absent. The per-run archive list does
not include that file, so a second run in the same repository reuses cases authored from the first
run's PRD. The file is also absent from `MEESEEKS_IGNORED_PATHS`; the design-phase
`git add -A` can commit it. Its writer is a direct overwrite rather than the atomic
temp-and-rename used by the ratchet and pins.

**Verified reproduction:** with a temporary state directory containing only `oracle.json`,
`archivePreviousRun` returned `null`, created no archive directory, and left the Oracle file in
place. The generated ignore stanza also contains no Oracle entry.

**Impact:** on a later PRD, the held-out gate can execute stale cases and provide no independent
coverage of the current objective. Committing the store exposes it in target history and makes the
next preflight refuse tracked `.meeseeks` state. A kill during the direct write can leave a corrupt
file whose mere existence prevents re-authoring.

**Required resolution:**

- Make Oracle identity explicitly per-run: archive it with its originating run and author a fresh
  store from the current PRD, or bind reuse to an exact PRD digest and independently prove the
  match.
- Write atomically and handle corruption fail-closed without silently reusing or overwriting the
  bytes.
- Include the store in the positional machine-state ignore boundary from F9.
- Preserve PRD-only, no-tools authoring; a repair must not re-author from implementation context.

**Acceptance evidence:**

- Two sequential runs with different PRDs cannot reuse one another's cases.
- The previous store appears with the previous run's archive and the current store records the
  current PRD identity.
- A kill before rename leaves either the old complete store or no accepted store, never partial
  JSON.
- `git add -A` never stages the Oracle store. PLAN item 62 owns the slice.

### F9 — MEDIUM: the machine-state ignore boundary still depends on an incomplete filename list

**Status:** OPEN
**Affected:** `scripts/driver.mjs:2549-2615`, `test/driver.test.mjs:4795-4824`

The driver promises to keep its machine state out of target history but implements that promise as
a hand-maintained list. The list and generated `.gitignore` omit at least
`oracle.json`, `capabilities.json`, and `stryker.config.json`. The test explicitly calls
`capabilities.json` operator-owned even though its implementation and `DESIGN.md` call it a
driver-owned snapshot rewritten every iteration. Oracle and mutation configuration are not checked
by the constants-only coverage test at all.

**Verified reproduction:** `meeseeksIgnoreUpdate("")` produced no entry for any of those three
paths, and none is in `MEESEEKS_IGNORED_PATHS`.

**Impact:** `git add -A` can commit held-out cases, changing capability snapshots, and a random
temporary mutation-sandbox path into the product being built. Resets can then restore stale
machine records, and a later preflight may refuse the repository because Meeseeks itself tracked
`.meeseeks`.

**Required resolution:**

- Prefer one positional Git ignore rule for all `.meeseeks` contents with an explicit
  `config.json` carve-out, matching the guard's positional ownership model.
- If Git semantics require enumerated exceptions, derive them from one central artifact registry
  rather than maintaining writer and ignore lists independently.
- Correct the capability ownership test and keep operator-edited config trackable.

**Acceptance evidence:**

- An integration fixture invokes or materializes every current state writer, runs `git add -A`,
  and proves only the deliberate config carve-out can stage.
- A newly added unknown file under `.meeseeks/` is ignored without adding its name to a list.
- The same fixture passes on the supported Git platforms. PLAN item 63 owns the slice.

### F10 — MEDIUM: `outcome.json` is neither universal nor crash-safe

**Status:** OPEN
**Affected:** `scripts/driver.mjs:1630-1663`, pre-loop aborts including
`scripts/driver.mjs:5222-5235`, and the outer abort at `scripts/driver.mjs:6093-6105`

The documented one-door terminal writer exists only inside `driveRun`. PRD/design/Oracle/component
failures and the outer exception handler print or stamp `ABORTED` and return without calling it.
The paths after previous-run archiving therefore leave no current `outcome.json`. When the writer
does run, it overwrites the file directly rather than atomically.

**Impact:** the durable answer created because stdout had already proved unreliable is absent on
several paid failure paths. A parent component correctly fails closed on a missing receipt, but its
operator cannot recover the child's state or spend from the promised artifact. A kill during the
write can also destroy the only terminal record.

**Required resolution:**

- Define the point at which an invocation becomes a run; after that boundary, route every
  non-crash terminal exit through one shared outcome writer.
- Make the writer atomic and keep write failure non-authoritative over the already-decided terminal
  state.
- Record phase and known spend honestly on pre-loop aborts; do not invent missing usage.

**Acceptance evidence:**

- PRD author failure, Oracle failure, component failure, unexpected post-lock exception, budget
  exit, and ship each leave one parseable outcome with the correct terminal state.
- A forced interruption during write leaves the previous complete record or no accepted record,
  never truncated JSON.
- Existing child-component fail-closed behavior remains. PLAN item 64 owns the slice.

### F11 — MEDIUM: Windows cleanup kills the shell but not its application descendants

**Status:** OPEN
**Affected:** `scripts/health-probe.mjs:340-399`, `scripts/health-probe.mjs:414-422`,
and the generic sweep limitation at `scripts/driver.mjs:4210-4230`

The health probe uses `shell:true`. On POSIX it detaches the shell and signals its process group.
On Windows it cannot create that group, so `killTree` falls back to `child.kill`, which
terminates only the shell process. The code's own comment identifies the child application as the
process that otherwise survives. The generic shell descendant sweep also returns no process set on
Windows.

**Impact:** a health-check timeout or cleanup can leave the actual application listening after the
gate settles. It contaminates later iterations, leaks resources through an unattended run, and can
interact with F3's listener-ownership defect.

**Required resolution:**

- Give Windows a real descendant-tree termination path and share the lifecycle contract with F2
  rather than maintaining two incompatible kill mechanisms.
- Preserve bounded grace, forced termination, bystander safety, and guaranteed settlement.
- Do not claim cross-platform cleanup from a POSIX-only integration result.

**Acceptance evidence:**

- A Windows tier-2 fixture starts a shell, child application, and grandchild; the cleanup removes
  all three within the grace bound.
- An unrelated bystander survives.
- POSIX group cleanup and ordinary successful health probes remain green. PLAN item 65 owns the
  slice.

## Audit coverage maps

These tables are reviewer evidence and triage aids, not new sources of product requirements.

### Guarantee strength

| Claim | Actual enforcement strength | Current qualification |
|---|---|---|
| ratcheted test ids never disappear | deterministic store, atomic write, fail-closed read, unit/integration coverage | ids bank after a successful unit gate; `lastGoodCommit` moves only after full acceptance |
| Builder cannot write Driver state | positional PreToolUse guard plus child settings; paid live coverage | applies to tool-mediated writes, not reads; external hook propagation is a live contract |
| Builder cannot certify Builder | separate Panel processes and Driver recombination | F6 and F7 currently weaken the evidence/process boundary |
| Panel is cold | fresh read-only `claude -p`, safe mode, narrowed supplied prompt | not sealed: reviewers can read repository-visible state; isolation is partly discipline |
| Oracle is independent | PRD-only no-tools author; deterministic execution | F8 breaks per-run objective binding |
| budgets and deadlines are hard | Driver accounting, CLI child allowance, timers | in-flight overshoot exists; F2/F4 mean some wall-clock bounds are not hard |
| sandbox and model routing hold | settings/argv plus paid live probes | owned by an external binary/provider and must be re-probed when changed |
| terminal state is durable | `outcome.json` on `driveRun.finish` paths | F10: not all terminal paths and not atomic |
| graph/provenance is complete | purpose-built ratchet, pins, review, Oracle, assumptions | no general claim graph; stable run/edge identity remains conditional PLAN item 55 |

### Durable artifact registry

| Artifact class | Scope and owner | Read-back authority | Failure posture / open gap |
|---|---|---|---|
| `config.json` | repository-scoped, operator-owned | selects run policy after validation | deliberately trackable; children cannot write it during a run |
| `lock.json` | active run, Driver-owned | excludes concurrent drivers | strict read; F1 acquisition/ownership race |
| `state.json` | cross-run, Driver-owned | monotonic test ids and reset commit | atomic; corruption quarantines and stops |
| `pins.json` | cross-run, Driver-owned | security blockers and requirement carry | atomic; corruption quarantines and stops |
| `red-evidence.json` | cross-run, Driver-owned | determines which tests have earned credit | atomic; corrupt bytes quarantined, evidence becomes strict empty |
| `gate-skip.json` | cross-run cache, Driver-owned | carries only failures on an identical tree | atomic; corruption degrades to re-running gates |
| `oracle.json` | intended run/objective scope, Driver-owned | deterministic held-out gate | F8: persists across runs, unignored, non-atomic |
| `capabilities.json` | current-tree snapshot, Driver-owned | record of resolved capability state; runtime uses the in-memory resolution | atomic but F9 allows target-history pollution |
| `run.json`, `outcome.json` | per run, Driver-owned | manifest records only; outcome is terminal evidence | manifest atomic/no reader; F10 outcome coverage and atomicity |
| `review.json`, briefs, assumptions | per run, Driver-owned | review evidence; assumptions are supplied context, not verdicts | archived; review/brief writes are forensic rather than decision inputs |
| lessons and bloopers | cross-run, Driver-owned | advisory prompt context / human history | lesson corruption degrades loudly to none; bloopers append |
| test/e2e reports, mutation config, browser marker | per iteration or tool invocation | ratchet/gates consume reports; other files configure or record tools | transient; F9 exposes incomplete ignore coverage |
| `runs/NNN/` | cross-run archive, Driver-owned | human/forensic evidence only | move failures stop startup; partial-move crash risk remains for PLAN item 58's admission test |

### Failure-shape summary

| Boundary | Intended result | Audited gap |
|---|---|---|
| concurrent launch | one atomic owner or refusal | F1 |
| child timeout/output cap | bounded termination, descendants gone, distinct failure | F2 |
| health listener | response owned by spawned application | F3 |
| streaming HTTP | absolute deadline and bounded body | F4 |
| child environment | explicit minimum and operator allowlist | F5 |
| reviewer citation | existing contained line on exact tree | F6 |
| process plus envelope | both must succeed | F7 |
| Oracle lifecycle | current PRD, current run, held out | F8 |
| machine-state Git boundary | every state artifact ignored except config | F9 |
| terminal receipt | atomic record on every run terminal path | F10 |
| Windows cleanup | shell and all descendants removed | F11 |

### Explicit negative guarantees

- Reviewer starvation is not filesystem secrecy; repository-readable state can be discovered.
- The guard is not a general OS sandbox and cannot govern code after it leaves Claude's tool
  boundary.
- Token/cost ceilings are not atomic reservations across concurrent children.
- A model verdict is judgment, not deterministic proof; only the Driver combines it with gates.
- `run.json` is a record and is deliberately not read as authority.
- There is no crash-resume protocol, lifecycle journal, dynamic-workflow runtime, or general claim
  graph in the shipped product.
- Structured-logging detection and a health endpoint with no declared start command are documented
  static proxies, not behavioral proof.
- Cross-platform support does not currently imply equivalent descendant cleanup on Windows (F11).

### Cross-cutting code-review lenses

| Review lens | Result |
|---|---|
| process-lifecycle state machine | F2, F4, F10, and F11 expose unsettled termination, deadline, receipt, and platform states |
| success laundering | F6 accepts evidence-shaped text; F7 lets an envelope overwrite process failure |
| crash fault injection | F1, F2, F8, and F10 lack an atomic or guaranteed-settlement boundary at a critical transition |
| evidence-citation adversary | F6 reproduced a shipping-eligible pass with a nonexistent citation |
| authority by write site | F1, F8, and F9 show authority or machine state whose writer/lifecycle boundary is weaker than its reader assumes |
| environment and argument taint | F5 exposes ambient values; command argv remains array-based and prompts remain stdin-delivered, so no additional argument-injection finding was established |
| monotonic escape audit | test regression resets, scoped security review, and requirement re-review each retain an escape; no new finding, but `DESIGN.md` was corrected to say when test IDs are actually banked |
| hostile cross-platform pass | F11 is the new platform finding; F6 acceptance criteria also require Windows-shaped containment cases |

### Temporal language and terminology audit

| Drift checked | Resolution |
|---|---|
| ratchet banking versus `lastGoodCommit` | `DESIGN.md` now distinguishes successful-unit-gate banking from full-acceptance commit advancement |
| archived artifact count | `DESIGN.md` now names all six archived artifact classes rather than claiming there are three |
| review package and `HEAD~1` base | PLAN item 41 is closed as inapplicable after tracing every current consumer |
| current finding counts and queue | `HANDOFF.md` now agrees with F1–F11 and PLAN items 56/60–65 |
| conceptual ERD versus implemented Oracle lifecycle | the architecture report now labels the run-to-Oracle edge as intended but currently violated by F8 |
| role vocabulary | Builder, Panel/reviewer, Oracle, and Driver retain the meanings and authority boundaries in `DESIGN.md`; no runtime is renamed or replaced |

## Verification performed

All existing non-paid gates were green after this documentation repair; the executable tree
remains byte-identical to the reviewed tree:

- `npm run lint`
- `npm run typecheck`
- `npm test` — **2,307 passed, 0 failed**
- `npm run test:integration` — **51 passed, 0 failed**
- `npm run release-check` — **ok** at `0.164.0`; no shipped file has changed since release and
  `HANDOFF.md` agrees

The paid live tier was not run. Existing green tests do not cover the eleven failure shapes above.

## Closure protocol

Claude Code may implement the repairs in any order that preserves `DESIGN.md` and the repository
invariants. After implementation, ask Codex to re-review the exact diff. Codex will change an item
to `CLOSED` only after tracing the repair and checking the stated acceptance evidence.
