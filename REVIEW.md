# Codex code review — 16–18 August 2026

> **Ownership:** This is the Codex reviewer document. Codex records and verifies findings here;
> Claude Code owns implementation. Do not treat an entry as closed until Codex has reviewed the
> repair and the relevant verification has passed.

**Reviewed executable baselines:** `be19c9c` / 0.164.0 for F1–F30; `12f2004` /
0.179.0 for F31–F37; `d88946d` / 0.184.0 for F38–F40; and `e0ede97` / 0.194.0 for
repair verification and F41.
**Current comparison:** reviewer ledger `10d65d6` through candidate `e0ede97`, plus the candidate
working tree. The only working-tree entry was the pre-existing untracked `.agents/` reviewer skill;
it is not part of the committed candidate and was not modified.
**Verdict:** **CHANGES REQUESTED** — nine high-priority defects and eight medium-priority defects
remain open. Twenty-four findings are closed below after exact-diff review and current validation.

This remains a read-only review of the Claude-native implementation. Codex modified only this
reviewer ledger; no implementation, test, template, manifest, configuration, or project-management
file was changed.

## Current repair verification — 0.194.0

The following closures are per finding, not a blanket inference from green tests. “Current gates”
means lint and typecheck clean, **2,636/2,636** tier-1 tests, **151/151** tier-2 tests,
`release-check` ok, and `git diff --check` clean on `e0ede97`.

| Finding | Exact repair commit(s) | Mechanism and acceptance evidence checked | Residual limitation |
|---|---|---|---|
| F1 | `e38ac8e` | exclusive-create ownership token before any write/spawn; real-process free/stale races give exactly one winner and non-owner release is refused; current gates | mixed-version stale-claim replacement remains F39, not the original acquisition defect |
| F3 | `1acffec` | health success is tied to the assigned port and live child; decoy, pre-existing listener, real application, and dead-child neighbours checked; current gates | Windows cleanup remains F11 |
| F4 | `4ab7abb` | absolute request deadline, response lifecycle failures, and bounded body are shared by health and smoke; streaming/oversize/benign fixtures checked; current gates | outer gate ceilings remain separate defense in depth |
| F6 | `6883290` | contained regular-file/nonblank-line resolution precedes Panel combination and carry; hostile citation and real-line ship neighbours checked; current gates | evidence content provenance remains F22 |
| F7 | `12f2004` | process success and envelope success are conjoined; nonzero/signal/timeout/overflow stand-ins and normal/error envelopes checked; recorded live suite passed at the repair boundary; current gates | `e0ede97` later touched `spawnClaude`, so repository policy still requires a current tier-3 run before release |
| F8 | `2714773` | Oracle store is specification-bound, per-run archived, atomic, and refused on foreign/missing identity; current gates | confidentiality from Builder remains F15 |
| F9 | `6f2c0c6` | positional `.meeseeks/*` ignore with only config carved back in; future-name, legacy-rule, and staging neighbours checked; current gates | guard enforcement is distinct from Git ignore |
| F12 | `5009634` | exact PRD bytes are captured before roles and rechecked before gates and ship; same-id mutation/deletion integration paths abort; current gates | target PRD remains writable, but mutation cannot retain authority |
| F14 | `6f88e10`, `d57c09e` | review workspace is sealed, publication is clean, and post-deploy HEAD/tree are re-sealed before explicit-commit tags; drift and clean neighbours checked; current gates | acceptance provenance remains F22 |
| F16 | `c668840`, `d9632da` | declared reports are removed before each attempt, only regular files are collected, and any uncleared path refuses the whole attempt; stale/symlink/clean tier-2 neighbours checked; current gates | decision-file resource bounds remain F19 |
| F18 | `63dc391` | every settled role result is charged once before adjudication/early return; phase sentinels and terminal-total integration evidence checked; current gates | concurrent budget reservation is still explicitly not guaranteed |
| F20 | `13c1fc2`, `35f62ac` | reporter paths are lexically/physically contained and credit additionally requires a current regular defining file; clean-clone tier-2 evidence checked; current gates | definition-byte credit remains F17 |
| F23 | `c313ef5` | inert `styleModel` is rejected/removed and run provenance no longer claims a nonexistent route; config/manifest tests checked; current gates | none |
| F24 | `c313ef5` | installed command advertises `--confirm-prd`, exact continuation names `./PRD.md`, and integration proves no second PRD authoring; current gates | pre-loop Git-failure handling remains F26 |
| F30 | `512ec8f` | normalized flaky status adds a required failed stability result before Panel; real Playwright fixture and clean/skipped neighbours checked; current gates | live-model nondeterminism is a separate test-policy concern |
| F31 | `c06285d`, `d57c09e` | add/commit/HEAD/cleanliness/tag results all fail closed and tags name the re-sealed commit; real-Git failure and clean neighbours checked; current gates | partial tag rollback is not claimed |
| F32 | `d9632da` | `collectReports` requires and binds the same attempt's clear outcome; uncleared and symlink paths have no evidence authority; current gates | none beyond F16/F19 boundaries |
| F33 | `408d861` | each concurrent shell registers its owned leader and sweeps without killing a sibling; both orderings checked in tier 2; current gates | Windows remains F11 |
| F34 | `ab89481`, `7d16081`, `d88946d` | takeover claims have owner identity, dead claims recover, release is token-checked, and live/abandoned cohorts are exercised by real processes; current gates | the cross-version rename-window extension remains F39 |
| F35 | `35f62ac` | reported passes without an existing regular definition are withheld before ratchet credit; origin/clone neighbours checked in tier 2; current gates | changed bytes behind an existing definition remain F17 |
| F36 | `9e4d439` | guard denials use a distinct bounded channel on success and failure; tier-2 success/noise/cap neighbours and the recorded 0.188.0 live canary checked; current gates | `e0ede97` still owes the policy-required current tier-3 run noted for F7 |
| F37 | `408d861` | probe cleanup retains and reaps the owned group after leader exit; background-server and cooperative neighbours checked in tier 2; current gates | Windows remains F11 |
| F38 | `d57c09e` | deploy-created commits and dirty changes are rejected; clean deploy tags exactly the reviewed commit in real Git; current gates | none beyond F22's receipt completeness |
| F40 | `408d861` | HANDOFF removed the duplicate mutable queue and defers order/counts to PLAN/REVIEW; authority routing and current text checked; current gates | none |

### Incomplete repair paths verified at 0.194.0

| Finding | Exact remaining defect and why current tests miss it |
|---|---|
| F2 | `shell()` samples the ownership pre-image only when `timeoutMs` is present (`scripts/driver.mjs:5022-5026`), so an output-cap call with no timeout kills the direct child but cannot sweep descendants (`:5117-5135`). The tier-2 overflow fixture always supplies `timeoutMs: 120000` (`test/integration/shell-termination.integration.test.mjs:220-225`). |
| F10 | A launch refusal calls `releasing()` and overwrites `.meeseeks/outcome.json` before `archivePreviousRun()` can preserve the prior run (`scripts/driver.mjs:5933-5955`, `:5974-5990`, `:6043-6058`). Pre-loop exceptions such as required-plugin provisioning also occur before the loop's `try/finally` and escape without the promised receipt/release (`:6467`). Existing outcome tests cover successful launch and ordinary returned failures, not these paths. |
| F13 | `establishedCapabilities()` converts an absent, corrupt, or unreadable manifest to `[]` (`scripts/capabilities.mjs:520-533`); the production driver never calls the strict `readDeclaredCapabilities()`. A detected-only capability can therefore disappear if its marker and manifest are lost in the same run. The unit test explicitly expects corrupt/absent state to mean nothing established. |
| F17 | `gateTree()` correctly computes and returns a definition-aware credited set (`scripts/driver.mjs:6941-6982`), but `driveRun()` discards `commandGateOutcome.passing`, rereads reports, and advances on a merely file-backed set (`:2223-2272`, `:2320-2333`). Helper tests pass while the production loop can overwrite the old digest without observing the changed definition RED. |
| F19 | Several first reads remain unbounded: external PRD copying (`scripts/driver.mjs:6202-6205`), pin source rereads (`:7139-7144`), and `specification.json` parsing (`scripts/specification.mjs:113-124`). `readBounded()` itself stats and then uses whole-file `readFileSync` (`scripts/bounded-read.mjs:107-117`), so a growth race can allocate the complete replacement before the after-read refusal; acceptance required refusal before full allocation. |
| F26 | `commitPhase()` ignores both `git add` and `git commit` results, then writes a launch receipt and returns success (`scripts/driver.mjs:6123-6130`). The quality-plugin call also ignores `commitPhase()`'s boolean (`:6467-6469`). Current integration doubles make Git succeed, so a failed pre-loop commit is still recorded as admitted/committed and can leave the loop on the wrong provenance. |
| F39 | Exact-match restoration is present, and the deterministic directory-replacement unit case passes, but REVIEW requires a mixed-version tier-2 race. No such test exists under `test/integration/`; closure would claim evidence the repository does not have. |

## Finding ledger

### F1 — HIGH: acquire the repository lock atomically before any work

**Status:** CLOSED — verified against e0ede97; see the 0.194.0 closure matrix above.
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

- Acquire the lock in the driver before the first child spawn, target-content write, install, or
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

**Status:** CLOSED — verified against e0ede97; see the 0.194.0 closure matrix above.
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

**Status:** CLOSED — verified against e0ede97; see the 0.194.0 closure matrix above.
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

**Status:** CLOSED — verified against e0ede97; see the 0.194.0 closure matrix above.
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

**Status:** CLOSED — verified against e0ede97; see the 0.194.0 closure matrix above.
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

**Status:** CLOSED — verified against e0ede97; see the 0.194.0 closure matrix above.
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

**Status:** CLOSED — verified against e0ede97; see the 0.194.0 closure matrix above.
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

### F12 — HIGH: Builder can rewrite the specification that the Panel later judges

**Status:** CLOSED — verified against e0ede97; see the 0.194.0 closure matrix above.
**Affected:** `scripts/driver.mjs:5197-5198`, `scripts/driver.mjs:5979`,
`scripts/driver.mjs:6060-6062`

The Driver reads `PRD.md` once to derive requirement IDs, then retains only those strings.
Builder has unrestricted repository writes. The cold Panel is later told to read the live
`PRD.md`, and the post-Panel commit stages every live path. Nothing compares the specification
bytes or digest with the version from which `requiredIds` and the Oracle were derived.

**Verified reproduction:** Builder replaced the text of `PRD-1.1` with an easier requirement while
keeping the ID. With passing gates and a passing report, `driveRun` returned `SHIPPED` and the
mutated PRD remained authoritative.

**Impact:** stable IDs do not preserve stable intent. Builder can deliberately or accidentally move
the finish line, after which an independent Panel faithfully certifies the wrong specification.

**Required resolution:**

- Capture an immutable canonical PRD revision and digest before design/Oracle work.
- Refuse Builder-era mutation of that revision, or treat it as explicit requirement drift that
  needs operator authority and a new run rather than an ordinary iteration.
- Give Panel and terminal receipts the canonical revision, not an unchecked working-copy file.
- Bind requirement IDs, Oracle identity, design inputs, and final outcome to the same digest.

**Acceptance evidence:**

- A Builder edit that keeps every requirement ID but changes one byte cannot reach gates or Panel
  as the same run.
- Documentation edits outside the authoritative specification remain possible.
- A deliberately operator-approved new revision invalidates only the prior run and starts with new
  Oracle/review evidence. PLAN item 66 owns the slice.

### F13 — MEDIUM: a current-tree detector can silently remove a previously armed quality gate

**Status:** OPEN
**Affected:** `scripts/driver.mjs:5655-5661`, `scripts/capabilities.mjs:342-356`

Declared capabilities remain unioned for the run, which correctly prevents most downgrade attacks.
The older `frontendOnly` path bypasses that set: it filters the quality-gate roster directly through
`hasFrontend(dir)`. The filter produces no skipped-gate record and retains no prior observation.

**Verified reproduction:** the same run-level declaration retained `cli`; adding `index.html`
resolved `web-ui, cli` and armed the frontend predicate, while deleting it resolved only `cli`
and made the predicate false. A `frontendOnly` quality gate would disappear from the roster.

**Impact:** deterministic coverage can shrink after Builder changes detection inputs. The final Panel
may catch the missing product, but the Driver no longer enforces the design-quality gate it had
already established was applicable.

**Required resolution:**

- Replace `frontendOnly` with the existing `web-ui` capability mechanism.
- Record and announce any gate-roster shrink; absence of a current detector is not by itself
  authority to drop a gate established by the canonical design.
- Provide an explicit, cold-reviewed escape for genuine capability removal so monotonicity cannot
  make a temporary experiment permanent.

**Acceptance evidence:**

- A declared web UI keeps its quality gate when Builder deletes or renames detection markers.
- A detected-only capability cannot remove a gate silently.
- A legitimate capability removal has a finite, independently reviewed path and leaves durable
  evidence. PLAN item 67 owns the slice.

### F14 — HIGH: the bytes reviewed are not bound to the bytes committed and tagged

**Status:** CLOSED — verified against e0ede97; see the 0.194.0 closure matrix above.
**Affected:** `scripts/driver.mjs:2220-2398`, `scripts/driver.mjs:2471-2489`,
`scripts/driver.mjs:6056-6088`

Gates and Panel inspect the live working tree. After Panel returns, the Driver runs `git add -A`
and commits whatever bytes exist at that later moment. There is no workspace identity captured
before Panel and rechecked after every reviewer, before commit, or before the ship tag.

**Verified reproduction:** the reviewer read `src/a.js` as `reviewed bytes`; a concurrent write
changed it to `changed after review` before the commit effect. `driveRun` committed the latter
and returned `SHIPPED`.

A successful Builder can leave background descendants, and ordinary operator/tooling processes can
also write concurrently, so this is not limited to a malicious injected test double.

**Impact:** a cold verdict can authorize code no reviewer or deterministic gate saw. This is a
direct false-completion path.

**Required resolution:**

- Capture a complete candidate workspace identity after gates and before Panel.
- Recheck it after each external reviewer and immediately before commit. Any drift discards the
  verdict and restarts from gates; it is never swept into the passing commit.
- After commit, prove the clean committed tree corresponds to the reviewed workspace identity
  before deploy/tag.
- Include the identity in `review.json` and `outcome.json`.

**Acceptance evidence:**

- A background writer firing during Panel cannot have its bytes committed under that verdict.
- Tracked edits, untracked additions, deletions, symlink changes, and ignored-but-decision-bearing
  mistakes are covered according to their ownership boundary.
- Race/component landing still receives fresh main-tree gates and Panel on the exact final bytes.
  PLAN item 68 owns the slice.

### F15 — MEDIUM: Oracle cases are not confidential from the Builder they judge

**Status:** OPEN
**Affected:** `hooks/hooks.json:5`, `hooks/guard.mjs:2070-2077`,
`scripts/driver.mjs:1180`, `scripts/oracle.mjs:14-26`

The design accurately calls Oracle isolation “not supplied,” not a filesystem barrier. In practice,
Builder has unrestricted tools, the hook does not match `Read`, and a Bash read of
`.meeseeks/oracle.json` is allowed. The store contains the exact cases, inputs, relations, and
literal expected output it later executes.

**Verified reproduction:** the registered hook matcher is
`Bash|Write|Edit|MultiEdit|NotebookEdit`; Builder's policy is dangerous/unrestricted; and the
guard returned `allow` for `cat .meeseeks/oracle.json` inside a run.

**Impact:** repository instructions, accidental discovery, or deliberate satisficing can contaminate
the only evidence described as held out. F8 separately means the exposed cases may also persist
across objectives.

**Required resolution:**

- Either establish a measured read-isolation boundary for the Oracle store against Builder and
  Builder-launched code, or rename the guarantee everywhere to “not supplied adversarial cases” and
  stop treating it as confidential held-out evidence.
- Do not claim a PreToolUse read denial is sufficient if arbitrary Builder shell code can bypass it.
- Preserve Panel and Oracle-author independence while solving the storage boundary.

**Acceptance evidence:**

- A paid Builder can neither use `Read` nor shell/application code to obtain the current cases, or
  the product documentation explicitly narrows the guarantee and terminal policy discounts the
  Oracle accordingly.
- Oracle execution remains possible without revealing cases through prompts or detailed failure
  feedback. PLAN item 69 owns the slice.

### F16 — HIGH: stale test reports can confirm a failed scoped restore

**Status:** CLOSED — verified against e0ede97; see the 0.194.0 closure matrix above.
**Affected:** `scripts/driver.mjs:1955-2034`, `scripts/driver.mjs:2057-2070`,
`scripts/driver.mjs:5525-5527`

Expected report paths are reused and are not cleared or bound to a gate attempt. During scoped
restore verification the Driver calls `effects.gates()` but ignores its result, then trusts whatever
report bytes exist. A failed unit gate that produced no fresh report can therefore leave an old
passing report to “prove” the restore.

**Verified reproduction:** the first gate/report established a protected regression. Scoped restore
then ran a failing unit gate while the reader returned the previous passing report. The Driver logged
`scoped restore held`, skipped the full reset, and left `src/core.js` containing `broken`.

**Impact:** the ratchet's only permitted escape from regression can fail to restore the behavior
while reporting success. Reused reports also lack invocation/tree provenance anywhere else they are
read.

**Required resolution:**

- Give every gate attempt fresh driver-selected report paths, or remove the prior artifacts before
  launch and require newly created regular files after success.
- Accept a report only when its corresponding gate succeeded and its attempt/tree identity matches.
- Scoped restore must require a successful verification gate before inspecting its reports.
- Record enough provenance to distinguish produced-now from merely-present.

**Acceptance evidence:**

- A failed, crashed, timed-out, or report-less unit gate cannot reuse an earlier report.
- The exact reproduction above falls through to the full hard reset.
- Unit plus e2e multi-report runs reject mixed-attempt evidence. PLAN item 70 owns the slice.

### F17 — MEDIUM: the ratchet protects a test name but not the test definition behind it

**Status:** OPEN
**Affected:** `scripts/reporters/shared.mjs:44-60`, `scripts/ratchet.mjs:88-250`,
`scripts/driver.mjs:2025-2034`

A test identity consists of repository-relative path, title chain, and optional browser project.
The ratchet stores only those strings. Replacing an assertion while retaining path and title is
therefore indistinguishable from the original test continuing to pass.

**Verified reproduction:** a previously stored ID
`test/a.test.js::protects behavior` presented under a replacement definition produced
`evaluateIteration(...).action === "advance"`. No definition or file digest participates.

**Impact:** a stable name can preserve ratchet credit after the behavior it protected is weakened.
The integrity and aggregate mutation gates reduce the likelihood but do not establish definition
identity or per-test sensitivity.

**Required resolution:**

- Record a digest of each credited test's defining file alongside its normalized ID.
- A changed definition must not silently inherit old credit; require fresh RED/sensitivity evidence
  and cold review, with an explicit path for legitimate test improvement.
- Keep historical “this ID once passed” separate from current “this definition protects the
  behavior” so the monotonic record is not destructively rewritten.

**Acceptance evidence:**

- Same path/title with changed assertions is detected.
- Formatting-only policy is decided explicitly rather than guessed.
- Legitimate strengthening can regain current credit without deleting historical evidence, while a
  weakened replacement cannot ship on the old identity. PLAN item 71 owns the slice.

### F18 — HIGH: child spend is not conserved into the durable run total

**Status:** CLOSED — verified against e0ede97; see the 0.194.0 closure matrix above.
**Affected:** `scripts/driver.mjs:1805-1822`, `scripts/driver.mjs:2249-2283`,
`scripts/driver.mjs:5063-5067`, `scripts/driver.mjs:5214-5237`

There are two holes in the rule that every returned Claude envelope is charged exactly once.
The Oracle-author result is parsed and stored without ever calling `chargePreLoop`. In the
parallel Panel, all reviewers finish under `Promise.all`, but an early failure or ceiling exit
returns while later declared-order results remain uncharged.

`runChild` separately adds every child cost to `handedOutUsd`, so later per-child dollar
allowances see more spend than `outcome.json`, the terminal line, and `driveRun` do. That
asymmetry limits some subsequent cost but does not repair the missing token accounting or receipt.

**Verified reproduction:** three reviewers returned 10/20/30 tokens and $1/$2/$3 after a
100-token, $0.01 Builder. The first reviewer failed. All three review promises completed, but the
ABORTED outcome reported **110 tokens and $1.01**, omitting the other 50 tokens and $5. The
Oracle-author omission is established directly by the only call site: its result goes from
`runChild` to `parseOracleCases` without a charge.

**Impact:** token and cost ceilings, airtime, component parent accounting, and the final bill can
disagree with work actually purchased. The Oracle omission can let the loop begin below a token
ceiling already crossed by pre-loop work; the Panel omission makes terminal evidence understate
completed concurrent work.

**Required resolution:**

- Put all Claude-result accounting behind one Driver-owned conservation boundary.
- Charge each returned child exactly once, including Oracle-author and every settled parallel
  reviewer, before any verdict-dependent early return.
- Keep declared-order decision semantics while separating “collect/charge all settled results”
  from “parse/adjudicate until the first decisive failure.”
- Reconcile `handedOutUsd` and durable progress from the same ledger or assert their equality;
  malformed or missing usage remains explicit rather than invented.

**Acceptance evidence:**

- A phase-by-phase table test covers PRD, Oracle-author, design/retry, Builder, race, Panel,
  escalation, reality check, and lesson extraction with distinct sentinel usage.
- Early failed/exhausted reviewers still all appear once in spend, without later reports gaining
  verdict authority.
- The reproduction reports 160 tokens and $6.01, and pre-loop Oracle spend reaches
  `alreadySpent`. PLAN item 72 owns the slice.

### F19 — MEDIUM: decision-bearing file reads have no size boundary

**Status:** OPEN
**Affected:** `scripts/driver.mjs:5158`, `scripts/driver.mjs:5197`,
`scripts/driver.mjs:5762`, `scripts/driver.mjs:5948`, `scripts/driver.mjs:6054`,
`scripts/gate-cache.mjs:128-143`

The shell boundary caps each output stream at 64 MB and prompt submission has a character budget,
but several file-backed inputs are synchronously read in full before either protection applies.
These include an operator-supplied PRD, generated test reports, reviewer evidence files, the review
package, and every tracked/untracked file hashed for gate-cache identity.

A target-controlled gate can therefore write an arbitrarily large report under `.meeseeks/`;
the Driver allocates and parses it on the decision path. A large repository blob is likewise copied
whole into memory merely to hash it.

**Impact:** a malformed or simply enormous project artifact can exhaust Driver memory and end an
overnight run without a bounded terminal transition. This is availability and forensic integrity,
not a claim that ordinary repositories commonly reach the limit.

**Required resolution:**

- Define explicit size policy for prompt-bound and parsed decision artifacts, checking metadata
  before allocation and failing closed with the artifact name and measured size.
- Stream hashes for repository files so workspace identity does not require a whole-file buffer.
- Bound report cardinality/depth in addition to raw bytes where parsing can amplify memory.
- Keep limits configurable only where a legitimate workload can justify them; do not silently
  truncate evidence.

**Acceptance evidence:**

- Oversized PRD/report/evidence inputs fail before full allocation and cannot degrade to empty or
  passing evidence.
- A large tracked blob can be hashed with bounded memory.
- Boundary-sized valid neighbors still work, and the terminal receipt names the resource refusal.
  PLAN item 73 owns the slice.

### F20 — MEDIUM: reporter paths can create test identities outside the repository

**Status:** CLOSED — verified against e0ede97; see the 0.194.0 closure matrix above.
**Affected:** `scripts/reporters/shared.mjs:31-38`,
`scripts/reporters/vitest.mjs:42-55`, `scripts/reporters/playwright.mjs:76-89`

`toPosixRelative` resolves a reported file and returns `path.relative(rootDir, absolute)`
without checking containment. Vitest and Playwright therefore accept absolute or traversing test
paths and turn them into ratchet IDs beginning with `../`.

**Verified reproduction:** a Vitest-shaped passing result naming `/tmp/outside.test.js` under
root `/repo` parsed successfully as:

```
../tmp/outside.test.js::suite > works
```

**Impact:** the ratchet can bank a test whose defining file is not part of the candidate repository
or its committed deliverable. Combined with F17's name-only identity, external or runner-forged
locations can carry durable credit that a clean clone cannot reproduce.

**Required resolution:**

- Resolve reporter paths through the same lexical and realpath containment policy used for other
  evidence, with an explicit policy for nonexistent generated paths.
- Reject absolute, traversal, cross-volume, UNC, symlink-escape, and case-fold escape inputs that
  do not identify a contained repository file.
- Preserve stable POSIX IDs for valid Windows and POSIX neighbors.

**Acceptance evidence:**

- The reproduction and equivalent Playwright, `..`, symlink, Windows-drive, UNC, and
  case-insensitive escape cases fail closed.
- Contained paths containing spaces, Unicode, leading/trailing whitespace, and platform separators
  retain deterministic IDs.
- A clean-clone integration test proves every banked test definition is repository-contained.
  PLAN item 74 owns the slice.

### F21 — MEDIUM: release checks do not exercise the installed plugin snapshot

**Status:** OPEN
**Affected:** `test/plugin-manifest.test.mjs:1-223`, `tools/release-check.mjs:23-28`,
`.claude-plugin/marketplace.json:1-24`

The test labelled “Install smoke test” inspects files in the source checkout. `release-check`
likewise proves version discipline against source history. Neither asks Claude Code to validate,
inventory, install, or reload the plugin from the cache path that actually executes.

**Verified measurement:** Claude Code 2.1.233 currently reports that `claude plugin validate .`
passes with one warning (the marketplace has no description), and
`claude --plugin-dir . plugin details meeseeks` discovers version 0.164.0, two skills, and one
PreToolUse hook. The user's `installed_plugins.json` and cache contain no `meeseeks` entry, so
the marketplace-to-cache install, pinned commit, and cached command/hook paths remain untested.

**Impact:** the source tree can be green while the distributable cache snapshot is absent, stale,
incomplete, or differently interpreted by the loader. This is the exact boundary at which a
version-correct fix can appear installed but execute older or missing files.

**Required resolution:**

- Add a non-model, real-CLI release check that validates the marketplace and inventories the source
  plugin, recording the Claude Code version.
- In a disposable isolated Claude configuration, install from the candidate marketplace/commit and
  assert the cached manifest version, pinned commit identity, command/skill inventory, and hook
  script paths.
- Run a zero-spend command/preflight smoke from the cached root and prove no source-checkout path is
  being used.
- Treat loader warnings deliberately; add the marketplace description or document why the current
  warning is accepted.

**Acceptance evidence:**

- The clean disposable install resolves `meeseeks@meeseeks` to the candidate commit/version and
  all runtime-local imports/hooks exist under that cache root.
- Deleting a transitively imported shipped file, changing the cache version, or pointing metadata
  at a stale commit makes the check fail.
- The check performs no model/API call and does not mutate the operator's real plugin registry.
  PLAN item 75 owns the slice.

### F22 — MEDIUM: a shipped run does not preserve its deterministic acceptance proof

**Status:** OPEN
**Affected:** `scripts/run-manifest.mjs:35-83`, `scripts/driver.mjs:540-583`,
`scripts/driver.mjs:1635-1667`, `scripts/driver.mjs:5680-5790`

`run.json` records startup identity, `review.json` records Panel entries, and `outcome.json`
records terminal state and the passing-ID set. Gate results themselves are transient. Test/e2e
reports are deliberately excluded from per-run archives, and no terminal artifact records the
exact gate roster, statuses, attempt identities, tree/spec revision, report digests, Oracle result,
deploy result, or the Panel-record digest that authorized `SHIPPED`.

The negative gate cache is not a substitute: it retains selected failures for reuse and says
nothing about the complete passing acceptance set.

**Impact:** after the next run archives the prior artifacts, an operator can establish that
Meeseeks *said* `SHIPPED` and inspect the Panel, but cannot reconstruct which deterministic
checks passed on which exact bytes or prove that all required acceptance edges converged. That
weakens incident diagnosis and morning acceptance without changing the runtime verdict itself.

**Required resolution:**

- At terminal transition, persist a bounded Driver-owned acceptance receipt for the exact candidate
  tree/spec revision.
- Record the required gate roster and each result's name, command/config identity, status, attempt,
  tool version, and bounded output/report digest; link the Oracle, deploy, Panel, ratchet, and
  terminal records by immutable identity.
- Record each Claude role invocation's requested model and effort plus the observed per-model identifiers
  exposed by the result's per-model usage. Keep requested and observed identities distinct; a
  configured alias is not evidence that the requested model actually served the invocation.
- Use a tagged observed-or-unavailable state. A missing or malformed receipt field is incomplete;
  explicit unavailable may preserve forensic completeness only when current policy does not require
  an observed-model match, and it cannot satisfy model-identity gating, attribution, or a matched
  comparative claim.
- Bind each invocation to the Driver-owned role-supply receipt from PLAN item 77 so the recorded
  model identity is attached to the prompt, tools, and policy that invocation actually received.
- Preserve enough sanitized configuration metadata to interpret the result without persisting
  secrets or arbitrary raw logs.
- Reuse F14's tree seal, F16's report attempt identity, and F10's atomic terminal writer rather than
  creating parallel notions of acceptance.

**Acceptance evidence:**

- A clean-clone auditor can start from one `SHIPPED` receipt and resolve every required
  deterministic and independent-review edge to a matching exact-tree artifact.
- Missing, stale, mixed-attempt, or wrong-tree evidence cannot produce a complete receipt.
- A deliberately failed gate remains distinguishable from a gate absent from the roster, while
  bounded diagnostics reveal no synthetic secret. A model substitution is visible; a result without
  vendor observation becomes an explicit unavailable state rather than the requested selector; and
  deleting or corrupting that state makes the receipt incomplete. Unavailable cannot satisfy a
  policy-required model match or attribution. PLAN item 76 owns the slice.

### F23 — MEDIUM: `styleModel` is an accepted setting and recorded model with no consumer

**Status:** CLOSED — verified against e0ede97; see the 0.194.0 closure matrix above.
**Affected:** `scripts/config.mjs:178-183`, `scripts/config.mjs:546-555`,
`scripts/driver.mjs:5160-5175`, `scripts/driver.mjs:5548-5561`

`defaultConfig()` exposes `styleModel`, strict validation accepts any string supplied for it, and
`run.json` records that value under the active `models` map. No role invocation reads it. Meeseeks
narration is the deterministic `scripts/style.mjs` render layer, and bare `/meeseeks` combines idea
invention with PRD authoring in a child selected by `prdModel`.

This was verified by tracing every `runChild`/`spawnClaude` call and every `styleModel` reference:
the only Driver read is the manifest write. The previous DESIGN row claiming Fable handled
narration and idea invention described behavior that does not exist; DESIGN now states the current
gap rather than concealing it.

**Impact:** an operator can set `styleModel`, pass strict validation, and observe no behavioral or
cost change, while the durable run record says that model participated. This is a false control and
makes model/provenance comparisons unreliable. It does not currently change a gate verdict.

**Required resolution:**

- Keep narration deterministic and keep improvisation under `prdModel`; do not silently repurpose
  the old setting into a new model call.
- Remove `styleModel` from active defaults and active-model provenance through a documented
  compatibility transition for existing strict configs.
- During any deprecation window, accept the legacy key only with an explicit startup warning that
  it is ignored and names `prdModel` as the improvisation control. New configs must not emit it.
- Record only configured model selectors that can affect a child. Exact per-invocation model
  provenance belongs to F22's acceptance receipt rather than this compatibility slice.

**Acceptance evidence:**

- Config fixtures cover an existing legacy key, a newly generated config, and removal at the
  declared compatibility boundary; none silently pretends the key is active.
- An injected-child Driver test proves `prdModel` selects the bare-improvisation child; changing the
  legacy key does not produce a false active-model record.
- A run manifest contains no inert style selector; F22 remains responsible for exact observed-model
  provenance per child invocation. The ordinary version bump applies. Paid live evidence is needed
  only if the implementation also changes child argv, routing, or another external CLI contract.
  PLAN item 78 owns the compatibility slice.

### F24 — MEDIUM: the shipped command hides the supported `--confirm-prd` checkpoint

**Status:** CLOSED — verified against e0ede97; see the 0.194.0 closure matrix above.
**Affected:** `commands/meeseeks.md:1-30`, `scripts/driver.mjs:3950-4000`,
`scripts/driver.mjs:5191-5196`

The Driver parser accepts `--confirm-prd`, commits the authored or ingested `PRD.md`, and exits
before Oracle, design, or the loop. DESIGN names that human checkpoint. The installed command's
`argument-hint` omits it and its instructions say that exactly two flags may accompany an input.
The command passes `$ARGUMENTS` through, so the feature works only for an operator who already
knows an undocumented spelling. After success the Driver says only to re-run without the flag,
rather than naming `/meeseeks ./PRD.md`; a literal no-input or repeated-idea rerun can enter the
idea/improvisation authoring branch and spend an unnecessary PRD-model call before retaining the
already committed file.

**Impact:** the supported `/meeseeks` surface conceals the only deliberate review boundary before
unattended work begins. A user who wants to inspect generated intent is led to believe the choice
does not exist, which weakens original-intent reliability without a runtime failure signal.

**Required resolution:**

- Add `--confirm-prd` to the shipped command frontmatter and flag instructions.
- State that the first invocation ends after committing `PRD.md`; the accepted run starts as a new
  invocation with `/meeseeks ./PRD.md`, not as a resumed session. Make the Driver's successful exit
  message name the same exact continuation rather than merely saying to remove the flag.
- Keep `--yes` internal to launcher/preflight acknowledgement; do not expose an inert Driver flag
  as another user control.
- Keep README, DESIGN, and the shipped command vocabulary identical.

**Acceptance evidence:**

- A static command-contract test fails if the frontmatter, instruction, or argument pass-through
  loses `--confirm-prd`.
- An injected-child Driver integration fixture proves idea plus `--confirm-prd` commits a PRD,
  spawns no later phase, instructs `/meeseeks ./PRD.md`, and the explicit PRD rerun does not
  re-author intent.
- `claude plugin validate` passes and the shipped command change receives a version bump. A paid
  slash-command invocation is needed only if implementation changes Claude Code's external loading
  or argument-passing contract. PLAN item 79 owns the slice.

### F25 — HIGH: Claude may autonomously invoke the unattended-run command

**Status:** OPEN
**Affected:** `commands/meeseeks.md:1-5`, `commands/meeseeks.md:34-44`

Current Claude Code uses the same mechanism for custom commands and skills. Its official command
contract says commands work like skills, `disable-model-invocation` defaults to `false`, and a skill
without that field is available to Claude's Skill tool. It explicitly recommends the field for
side-effecting workflows whose timing belongs to the user. The installed Claude Code checked for
this review is 2.1.233. See the current
[Anthropic skills documentation](https://code.claude.com/docs/en/slash-commands#control-who-invokes-a-skill).

The shipped command has no `disable-model-invocation` field. During its active turn it grants the
Bash permissions needed to run preflight and the Driver, and its preflight command supplies `--yes`
itself. A normal interactive Claude session is not marked `MEESEEKS_RUNNING`, so the nested-run
guard also does not distinguish a model-selected launch from a user-selected launch.

**Impact:** Claude can select a command that starts a long-lived, permission-bypassing autonomous
loop even though the operator did not invoke `/meeseeks`. Dirty-tree, remote, and repository scans
still reduce damage, but none is an authorization check. The failure violates the supported
command's user-invocation boundary before any Builder, Panel, Oracle, ratchet, or receipt exists.
It does not establish that arbitrary direct Bash invocation is preventable.

**Required resolution:**

- Add `disable-model-invocation: true` to the shipped command and keep it user-invocable. Do not use
  `user-invocable: false`, which enforces the opposite policy.
- Treat scheduled or other non-interactive command launches as unsupported until they have a
  separate, explicit operator-created authorization contract. State explicitly that the field
  governs Skill selection, not a model/process already granted arbitrary Bash and a direct script
  path; do not turn F25 closure into a false global launch-authentication claim.
- Add a static command-contract test and batch real installed-loader evidence with F24/item 79 and
  F21/item 75 rather than paying for a separate release campaign.
- Fail acceptance if the supported pinned Claude Code version ignores the field or the loader
  surface cannot prove the command is withheld from the model.

**Acceptance evidence:**

- Static tests reject an absent, false, or inverted invocation-control field, and
  `claude plugin validate` accepts the command.
- Against the staged, version-bumped installed plugin, a pinned-CLI canary proves `/meeseeks` is not
  available to autonomous Skill invocation while direct user invocation still loads it and reaches
  a deliberately safe preflight refusal.
- The evidence records the actual CLI, plugin, cache, and command identities. PLAN item 80 owns the
  slice.

### F26 — HIGH: preflight and document phases do not bind the changes they authorize

**Status:** OPEN
**Affected:** `commands/meeseeks.md:1-44`, `scripts/driver.mjs:1177-1184`,
`scripts/driver.mjs:4988-5000`, `scripts/driver.mjs:5102-5112`,
`scripts/driver.mjs:5191`, `scripts/driver.mjs:5328`

The supported command runs `init.mjs` and the Driver as two separate model-directed Bash calls.
Current Claude Code documents `allowed-tools` as a temporary pre-approval, not a restriction on the
launcher's available tool pool. The command correctly narrows what it pre-approves, but its prose
instruction not to edit is the only thing preventing another launcher tool call between the clean
preflight and Driver start. A concurrent operator or process can produce the same race.

The Driver does not close it: before Phase 0 it rechecks only whether `.meeseeks/` is tracked, and
F1 covers a later non-atomic run lock. PRD and design children then receive Write/Edit over the
repository even though their templates declare exact output paths. `commitPhase()` stages
`git add -A`, so any post-preflight, concurrent, or off-contract child change is committed under the
PRD/design phase message. This was verified by tracing the command sequence, `runPreflight`, Driver
entry, role permissions, and both phase-commit call sites.

**Impact:** a working-tree change that preflight promised would be refused can instead be absorbed
as trusted Meeseeks output, later reset, or shipped. A newly written agent hook or configuration can
also appear after the security scan but before a child spawn. The resulting tree has no reliable
provenance even if its later tests and review pass.

**Required resolution:**

- After F1's atomic lock and before archive, child spawn, target-content write, or commit, make the
  Driver capture current HEAD/status and re-run the non-production remote, positional tracked-state,
  agent-config scan, effective-config validation, and requested-sandbox checks. Keep command
  preflight as operator feedback, not as a cross-process authorization receipt. Do not claim this
  repository snapshot seals mutable host binaries, authentication, or network state.
- Give each PRD/design phase an explicit path allowlist matching its template contract. Compare the
  complete tracked/untracked change set to that allowlist and refuse any unexpected neighbour.
- Stage only admitted paths. Never reset, clean, absorb, or overwrite an unexpected change while
  refusing it; it may be operator data.
- Keep this boundary separate from F14, which owns the final gated/reviewed tree rather than launch
  and pre-loop authorship.

**Acceptance evidence:**

- Integration fixtures pass command preflight and then independently change tracked/untracked
  status, the remote to a production-shaped URL, the agent surface to a known unsafe file, or the
  config to request an unavailable sandbox. Driver entry re-evaluates each and refuses before any
  child/target-content write/archive with repository bytes preserved; a clean benign neighbour proceeds.
- Hostile PRD and design fixtures write one extra path and are refused without staging it; benign
  fixtures commit every declared conditional output and no other path.
- No pre-loop phase uses `git add -A`; the launch/refusal receipt identifies HEAD and bounded path
  metadata without storing contents or secrets. PLAN item 81 owns the slice.

### F27 — HIGH: the role tool policy approves tools but does not restrict availability

**Status:** OPEN
**Affected:** `scripts/driver.mjs:1177-1215`, `scripts/driver.mjs:1290-1350`,
`test/oracle.test.mjs:263-278`, `test/live/oracle-contract.live.test.mjs:39-50`

`PHASE_PERMISSIONS` describes each non-Builder role with `allowedTools`; comments and tests treat
Oracle-author's empty array as “no tools at all.” `claudeArgs()` passes only `--allowedTools` for a
non-empty array and passes no tool flag for an empty one. The paid Oracle contract test also invokes
`phase: "review"`, not the production `oracle-author` policy.

Current official Claude Code semantics are explicit: `--allowedTools` changes permission approval,
not which tools appear in the model context; `--tools` restricts built-in availability and
`--tools ""` disables all built-ins. Settings omitted from explicit `--settings` may retain
file-based values, and MCP surfaces require their own exclusion. See the official
[CLI reference](https://code.claude.com/docs/en/cli-usage) and
[Agent SDK permission model](https://code.claude.com/docs/en/agent-sdk/permissions).

Consequently, omitting `--allowedTools` does not establish a zero-tool Oracle. Read-only tools are
normally available without approval, so an Oracle authored on a resumed tree can inspect the
implementation that its cases are supposed not to have seen. Other roles can also inherit a broader
available or pre-approved surface than their table claims. `--safe-mode` may strip customizations,
but neither the repository nor official contract establishes it as an exact or empty tool set.

**Impact:** the structural reason Oracle-author was split from `review` is not enforced by the CLI
argv, and its unit/live tests prove the wrong abstraction. Cases may align with existing code rather
than the PRD, weakening the only held-out deterministic gate. Ambient capabilities can also cross
Panel/document-role boundaries without appearing in `PHASE_PERMISSIONS`.

**Required resolution:**

- Model available tools separately from auto-approved tools. Builder remains intentionally
  unrestricted; every other role gets an exact `--tools` set, including `--tools ""` for
  Oracle-author.
- Use a measured fail-closed non-interactive permission configuration and prevent inherited
  MCP/settings/Skill/Agent surfaces from broadening the non-Builder set. Preserve explicit
  `childSettings()` and the guard for writing roles.
- Keep every new flag before variadic `--allowedTools`, and do not treat `--safe-mode` as the
  availability control.
- Fix the paid Oracle contract test to invoke `oracle-author`; add live policy-class canaries rather
  than more argv-only assertions. Keep F15's separate question—whether Builder can read the finished
  Oracle store—out of this repair.

**Acceptance evidence:**

- Unit tests prove exact availability and approval argv for every phase, literal zero built-ins for
  Oracle-author, and unchanged unrestricted Builder behavior.
- Pinned live canaries show Oracle-author cannot read a repository sentinel, a read-only role can
  read but cannot write it, and a document role retains only its declared built-ins and guard.
  Synthetic inherited allow/MCP capabilities do not appear.
- Evidence records actual CLI/settings/plugin identities and distinguishes unavailable from denied.
  Items 77 and 82 then unblock the role-internal workflow experiment; PLAN item 82 owns closure.

### F28 — HIGH: preflight accepts any callable or newer-unverified Claude Code version

**Status:** OPEN
**Affected:** `scripts/preflight.mjs:102-109`, `scripts/driver.mjs:1273-1305`,
`scripts/driver.mjs:4693-4720`, `test/preflight.test.mjs:51-59`,
`test/preflight.test.mjs:135-140`, `test/live/binary-identity.live.test.mjs:8-16`

`checkClaudeCli()` treats any successful `claude --version` exit as compatible. It neither parses
the version nor enforces a minimum. The healthy preflight fixture happens to say 2.1.226, but the
only failing case is a missing executable.

That is not sufficient for this product. Driver and command behavior depends on versioned external
contracts: `--safe-mode`, `--settings`, output envelopes, hook propagation, command/Skill
frontmatter, and the distinction between `--tools` and `--allowedTools`. The repository's own live
binary-identity test records an ancestor npm binary at 2.1.136 that “has never heard of
`--safe-mode`.” The repository has individual live measurements on 2.1.226/2.1.228 and source
validation on 2.1.233, not a complete product contract matrix. The exact earliest compatible
version has not been established, so selecting a convenient constant now would replace
an absent check with unsupported precision.

The other direction is also unsealed. Official Claude Code
[setup documentation](https://code.claude.com/docs/en/setup) says native installations can download
background updates that take effect on the next launch. One Meeseeks run launches multiple
independent `claude -p` processes, but no run-owned identity prevents a later role from resolving a
newly updated binary. Current [headless documentation](https://code.claude.com/docs/en/headless) also
says bare mode will become the default for `-p`; today that mode changes customization discovery and
skips OAuth/keychain authentication. Those are concrete examples of forward contract drift, not proof
that one particular future release will fail.

**Impact:** a stale, shadowed, newly updated, or otherwise unverified PATH binary can pass preflight
and then reject a required flag, produce a different envelope, or fail to enforce a command/role
boundary. An unattended run may die after doing work, or different roles in one run may execute
different external contracts. Fixes for F25 or F27 may appear installed while the executing loader
is incompatible.

**Required resolution:**

- Establish one canonical supported Claude Code compatibility policy from pinned CLIs that pass
  every mandatory live command and child contract used by the release. It includes the oldest
  demonstrated floor and the highest demonstrated compatible release or deliberately tested range;
  do not infer forward compatibility from a greater version number.
- Parse `claude --version` fail-closed and refuse older, newer-but-unverified, prerelease-ambiguous,
  or unparseable output before run work. Print the selected executable identity, detected value,
  verified policy, and a pin/install/sign-in repair without attempting a network install.
- Resolve and seal one canonical real invocation path, content fingerprint, and reported version at
  the Driver-owned run boundary. Capture the fingerprint before and after every compatibility probe;
  path plus a self-reported version is not sufficient identity.
- Item 56's explicit control set disables background auto-update for every Driver-owned Claude
  invocation, including compatibility probes and roles. Invoke each through that absolute sealed path
  rather than repeating PATH lookup. Immediately before each role spawn, re-resolve and fingerprint
  the target, run the version check under the sealed controls, and fingerprint again. A same-version
  byte replacement, symlink retarget, or other mismatch refuses; a role may not replace the binary
  used by later roles.
- For a symlink, script, or package launcher, bind the measured delegated entrypoint or package
  identity whose mutation changes invoked code. Refuse an install form whose mutable invocation
  closure cannot be bounded and live-proven.
- Keep the compatibility policy in one runtime source and align preflight, README, DESIGN, fixtures,
  and release evidence. Expand it only after the candidate passes the full pinned contract suite.
- Treat the check as an early compatibility gate, not capability proof. Paid live contracts,
  including items 75, 80, and 82, remain mandatory at every admitted compatibility boundary.

**Acceptance evidence:**

- Unit cases cover below/equal/inside/above-policy versions, ordinary decorated output, prerelease
  output, malformed output, and a failed executable.
- An integration fixture places a known-old synthetic binary first on PATH and proves refusal before
  state creation, child spawn, target-content write, or automatic upgrade. After sealing a good
  binary, a hostile PATH shadow cannot redirect a later role. Atomically replacing it with different
  bytes that report the same version, retargeting a symlink, and keeping launcher bytes/version stable
  while replacing its delegated entrypoint or package identity all refuse before the second spawn.
- Child controls suppress background updating on probes and roles without inheriting an operator
  value, and the production invocation records the same canonical target, fingerprint, and version
  for every role. A live canary covers current discovery/authentication semantics, including any
  admitted bare-mode transition.
- Pinned live runs at every admitted boundary pass the staged candidate's full `npm run test:live`,
  including the item 75/80/82 canaries, and record exact canonical target, invocation-closure
  fingerprints, CLI, settings, and plugin identities.
- The disposable installed-plugin check uses the same staged candidate. PLAN item 83 owns closure.

### F29 — HIGH: the cold reviewer treats Builder-mutable instructions as review authority

**Status:** OPEN
**Affected:** `templates/reviewer-system.md:216-219`, `scripts/driver.mjs:6000-6004`,
`scripts/preflight.mjs:411`

Review children correctly run under `--safe-mode`, which current Claude Code documents as disabling
automatic `CLAUDE.md`, rules, Skills, plugins, hooks, MCP, and memory discovery. The reviewer template
then explicitly tells the same cold child to read target `CLAUDE.md` and treats its rules and referenced
design documents as binding. Builder can modify those files after the one preflight agent-surface scan.
The isolation flag therefore closes automatic configuration discovery but the prompt reopens the
candidate-controlled instruction channel as ordinary repository text.

**Impact:** a Builder can write apparent repository policy that narrows the Definition of Done,
suppresses a finding, or recasts its own output as compliant. Every Panel member reads the same tree,
so process independence does not diversify this shared instruction attack. This weakens the central
property that Builder cannot certify Builder even if tools, context, and processes remain separate.

**Required resolution:**

- Treat every candidate-tree file as untrusted evidence, never as authority over the reviewer. Remove
  the blanket instruction to obey target `CLAUDE.md` or documents merely because the candidate names
  them. Keep `--safe-mode`; do not replace it with a prompt claim.
- Derive binding review requirements and conventions from item 66's immutable pre-Builder
  specification revision and a Driver/plugin-owned reviewer contract. This is not PLAN item 51's
  general `CONSTITUTION.md`, which remains excluded from Panel by that item's own boundary. If
  project conventions must be review authority, snapshot and identify the admitted pre-Builder bytes;
  later changes are output
  to review, not new instructions.
- Re-run the agent-config security scan on the exact candidate before Panel as defense in depth, and
  bind that result to item 68's reviewed-tree identity. Do not claim a pattern scanner proves prompt-
  injection immunity.
- Extend item 77's supply report to distinguish trusted reviewer instructions, untrusted candidate
  evidence, and disabled ambient customizations. Preserve Panel access to implementation evidence;
  this is an authority boundary, not a ban on reading code or documentation.

**Acceptance evidence:**

- Static tests prove reviewer argv retains `--safe-mode`, the prompt contains no instruction to obey
  candidate policy, and only identified Driver/pre-Builder sources populate the binding requirement
  frame.
- A fixture passes initial preflight, then adds or changes `CLAUDE.md`, `.claude/rules/`, a Skill,
  hook, or MCP configuration. The exact final-tree scan refuses known-hostile forms before Panel and
  preserves benign candidate documentation as reviewable evidence rather than authority.
- A pinned paid canary proves a cold reviewer does not auto-load the seeded project/user/local
  customizations and still receives the Driver-owned reviewer prompt. In a paired hostile/benign
  reviewer-calibration case, the seeded candidate text does not change the verdict merely by declaring
  itself binding. This bounded canary is not proof of immunity to arbitrary prompt injection.
- Item 68 seals the scanned/reviewed bytes, item 77 records the supply classes, and PLAN item 85 owns
  closure. A scan result or model assertion alone is insufficient.

### F30 — HIGH: a retrying test can be parsed as flaky while its gate still passes

**Status:** CLOSED — verified against e0ede97; see the 0.194.0 closure matrix above.
**Affected:** `scripts/reporters/playwright.mjs:14-16`, `scripts/ratchet.mjs:39-56`,
`scripts/driver.mjs:669-735`, `scripts/driver.mjs:5753-5787`

The Playwright parser deliberately preserves the runner's whole-test `flaky` status, and the ratchet
deliberately refuses to credit that status because a test that failed and then passed on retry has not
proved a stable result. The production gate path nevertheless decides command success from exit code
alone. Later report parsing groups every non-`passed` status only into RED-history evidence; it does not
add a failed gate for `flaky`. Playwright normally exits successfully when every test is either expected
or flaky, so a newly flaky test that has no prior ratchet credit can leave every gate green and reach the
Panel and `SHIPPED`.

**Impact:** the machine can accept an iteration while its own normalized evidence says a test failed
before retry. A previously ratcheted test becoming flaky is caught as a regression, but a new flaky test
has no earlier identity to compare against. This makes acceptance depend on whether instability existed
before or after the ratchet first saw the test and violates the documented rule that missing proof does
not default to pass.

**Required resolution:**

- After item 70 establishes a fresh successful attempt and item 74 establishes contained report
  identity, collapse normalized test records once and make any `flaky` status an explicit deterministic
  stability-gate failure. Keep it out of ratchet credit and preserve the existing reset when an already
  protected test becomes flaky.
- Name the flaky test ids in bounded failure evidence so Builder receives a repairable objective. Do not
  reinterpret `skipped`/`todo` as flaky, and do not rely on runner-specific prose or exit-code behavior.
- Keep RED-before-GREEN evidence separate: observing a flaky result may establish that a test can fail,
  but it cannot establish that the current implementation passes it reliably.

**Acceptance evidence:**

- A real Playwright reporter fixture containing passed and flaky tests, paired with a synthetic successful
  command exit, fails the iteration before Panel and cannot produce `SHIPPED`.
- A clean expected report still passes, a skipped/todo neighbour retains its existing semantics, and an
  already-ratcheted id becoming flaky still follows the regression/reset path rather than a weaker
  stability-only path.
- The stability result binds item 70's attempt and item 74's contained report identity. PLAN item 87 owns
  closure.

### F31 — HIGH: failed Git publication steps can still produce `SHIPPED`

**Status:** CLOSED — verified against e0ede97; see the 0.194.0 closure matrix above.
**Affected:** `scripts/driver.mjs:2732-2752`, `scripts/driver.mjs:6769-6791`,
`test/integration/workspace-seal.integration.test.mjs:119-123`

The ship path invokes `git add`, `git commit`, and tag creation without requiring those commands
to succeed. It then reads `HEAD` and can return the pre-existing commit as though it were the new
candidate. The final workspace seal only rehashes the working tree. If commit fails after staging,
the working bytes still equal the reviewed identity while the commit and tag can identify an older
tree that does not contain those bytes.

The integration helper uses `execFileSync` for commit, which throws on failure and therefore does
not exercise production `shell` semantics, where a failed command returns a result that the caller
must inspect.

**Impact:** a run can deploy or tag an old commit and record `SHIPPED` for changes that were never
committed. This defeats F14's exact-reviewed-tree guarantee at the final publication boundary.

**Required resolution:**

- Require success from add, commit, commit lookup, and every tag operation; preserve their bounded
  failure diagnostics.
- After commit, prove the new commit tree matches the sealed reviewed workspace and require the
  ordinary worktree/index cleanliness appropriate to publication.
- Route every failure through the existing non-shipping terminal path. Do not accept an unchanged
  `HEAD` merely because the workspace hash still matches.

**Acceptance evidence:**

- A real-Git integration fixture makes commit fail after staging and proves deploy, tag, and
  `SHIPPED` are unreachable.
- Separate add, commit, lookup, and tag failures retain distinct diagnostics.
- The successful neighbour proves the published commit tree, reviewed workspace identity, deploy
  input, tag, and terminal receipt all converge. PLAN item 88 owns closure.

### F32 — HIGH: a report that could not be cleared remains eligible as current evidence

**Status:** CLOSED — verified against e0ede97; see the 0.194.0 closure matrix above.
**Affected:** `scripts/driver.mjs:6319-6320`, report collection after gate execution

Before a test gate runs, `clearReports` returns paths it could not remove. The Driver logs those
`stuck` paths but still executes the gate and later lets `collectReports` accept any regular file
at the configured report location. If a locked or otherwise unremovable old passing report remains
and the command exits successfully without replacing it, stale evidence receives the new attempt's
authority.

Existing tests cover successful removal, not the refusal shape where an old report survives.

**Impact:** stale passing evidence can earn ratchet credit, satisfy report-backed gates, or confirm a
scoped restoration. This reopens the exact evidence-laundering class F16 was intended to close.

**Required resolution:**

- Treat every uncleared configured report path as a failed attempt before report-consuming authority
  can be assigned.
- Refuse collection for that attempt even if the command exits zero; name the stuck paths in bounded
  diagnostics.
- Preserve successful cleanup and the no-report neighbour without weakening item 70's attempt
  identity.

**Acceptance evidence:**

- Unit coverage forces report removal failure and proves the old report cannot be parsed or banked.
- A real-filesystem integration case, including a Windows locked-file case where available, proves
  an exit-zero gate cannot relabel the surviving report as fresh.
- The ordinary replace-and-collect path remains green. PLAN item 89 owns closure.

### F33 — MEDIUM: one timed-out Panel child can kill its concurrent reviewers

**Status:** CLOSED — verified against e0ede97; see the 0.194.0 closure matrix above.
**Affected:** `scripts/driver.mjs:2515-2517`, `scripts/driver.mjs:4623-4633`,
`test/integration/shell-termination.integration.test.mjs:324-350`

The Panel starts reviewers concurrently with `Promise.all`. Each `shell` call snapshots the
process-group population before spawn and, during cleanup, sweeps group members absent from that
snapshot. Reviewer A can take its snapshot before reviewers B and C exist; if A later times out or
overflows, its subtraction sweep can classify those legitimate siblings as leaked descendants and
kill them.

The current bystander test starts the bystander before the target's snapshot. It proves preservation
of an older process, not a concurrent sibling born after that snapshot.

**Impact:** one reviewer failure can manufacture failures in the remaining cold reviewers, erase
their evidence, and make Panel reliability depend on spawn and cleanup timing.

**Required resolution:**

- Scope cleanup to descendants or an owned process group for the target invocation, or otherwise
  exclude active sibling children from the sweep.
- Keep resistant-child and leaked-descendant cleanup from F2; fixing sibling ownership must not
  restore orphan processes.

**Acceptance evidence:**

- A tier-2 test starts two concurrent real `shell` calls. The first times out after the second is
  born; the second survives and completes while the first child and its descendants are gone.
- Reversed start/completion order and overflow exercise the same ownership rule.
- The Panel still combines completed results in declared reviewer order. PLAN item 90 owns closure.

### F34 — MEDIUM: a crashed stale-lock reclaimer can permanently block acquisition

**Status:** CLOSED — verified against e0ede97; see the 0.194.0 closure matrix above.
**Affected:** `scripts/run-lock.mjs:227-265`, `test/run-lock.test.mjs:186-207`

Stale-lock takeover derives its arbitration-directory name from the stale lock's ownership token. If
the reclaimer dies after creating that directory but before removing or replacing the stale lock, the
same stale token remains. Every later contender computes the same path, receives `EEXIST`, and
treats it as evidence of a live reclaimer. No surviving owner can clear the abandoned arbitration
directory.

The existing “orphan” unit case uses a directory derived from a different token, based on the
assumption that the same token will not recur. A crash in the takeover window makes that assumption
false.

**Impact:** one killed recovery attempt can turn an otherwise reclaimable stale lock into a
permanent denial of service requiring manual filesystem repair. This is an incomplete F1 repair.

**Required resolution:**

- Give the takeover claim its own verifiable, reclaimable owner identity and liveness rule, or use an
  atomic primitive whose abandoned state can be distinguished safely.
- Preserve exactly-one-winner behavior and prevent a late old reclaimer from deleting a newer
  owner's lock or takeover claim.

**Acceptance evidence:**

- A tier-2 fault-injection test kills the reclaimer after it acquires takeover arbitration but before
  it replaces the stale lock, then proves a later cohort has exactly one winner.
- Live-contender and benign-orphan neighbours remain distinguishable.
- Token mismatch and delayed cleanup cannot clear the winner. PLAN item 91 owns closure.

### F35 — MEDIUM: nonexistent test files can receive durable ratchet credit

**Status:** CLOSED — verified against e0ede97; see the 0.194.0 closure matrix above.
**Affected:** `scripts/reporters/shared.mjs:115-120`,
`test/reporter-paths.test.mjs:177-182`

When `realpathSync` fails, reporter normalization deliberately falls back to a lexically contained
relative path. A runner can therefore report a passing test file that does not exist in the
repository, and Meeseeks can bank its ID. The current unit test explicitly accepts that behavior.

Lexical containment closes the external-path half of F20 but does not prove the definition is part
of the candidate or reproducible from a clean clone.

**Impact:** the monotonic ratchet can retain credit for a test definition no later checkout can
execute or inspect. A forged or transient virtual path can become durable acceptance evidence.

**Required resolution:**

- Require an accepted file-backed identity to resolve to an existing contained regular file before
  it earns ratchet credit.
- If a supported runner genuinely emits virtual/generated tests, design a separate reproducible
  identity and content digest rather than silently treating a missing file as repository evidence.

**Acceptance evidence:**

- Nonexistent, directory, symlink-race, and deleted-after-report definitions fail closed without
  credit.
- Valid contained Windows and POSIX paths retain stable IDs.
- A clean-clone tier-2 test resolves and executes or inspects every banked definition. PLAN item 92
  owns closure.

### F36 — MEDIUM: successful Claude children discard guard-denial evidence

**Status:** CLOSED — verified against e0ede97; see the 0.194.0 closure matrix above.
**Affected:** `scripts/driver.mjs:4894-4900`, `scripts/driver.mjs:5157-5163`,
`test/driver.test.mjs:1649-1657`

The real shell result returns an empty `stderr` whenever the child exits zero. `spawnClaude`
searches that field for `meeseeks-guard: denied` diagnostics so it can carry them into the next
brief. A Claude process can encounter a denied tool call, recover, and still exit successfully; on
that path the Driver erases the denial before `spawnClaude` can preserve it.

The current test injects denial text only through a failed synthetic shell result and therefore
bypasses the successful production path.

**Impact:** a guard can stop a prohibited write while the loop loses the only repairable explanation.
The next Builder may repeat the same denied action, silently degrading both progress and forensic
evidence. This is an unclosed part of F7's stated every-path visibility contract.

**Required resolution:**

- Preserve bounded stderr for Claude invocations regardless of exit status, or return guard-denial
  diagnostics through a distinct bounded channel.
- Keep ordinary successful stderr from becoming styled output or decision evidence; only the
  intended denial signal feeds the brief.

**Acceptance evidence:**

- A tier-2 child exits zero after writing a guard-denial line to stderr; `spawnClaude` returns
  success and preserves the denial for the next brief.
- Clean successful stderr and failed-envelope neighbours retain their documented behavior.
- Because this crosses `spawnClaude` and the external CLI contract, run the mandatory paid tier-3
  guard canary. PLAN item 93 owns closure.

### F37 — MEDIUM: health-probe cleanup skips descendants after the shell leader exits

**Status:** CLOSED — verified against e0ede97; see the 0.194.0 closure matrix above.
**Affected:** `scripts/health-probe.mjs:470-489`

The probe's `stop` function returns after destroying pipes when the direct child already has an
`exitCode` or `signalCode`. It does not signal the captured process group in that branch. A shell
can background the application and exit immediately; the probe fails because its leader ended, but
the background server remains alive and can keep listening.

This POSIX lifetime hole is distinct from F11's unproven Windows descendant cleanup.

**Impact:** a failed health check can leak a live server into later gates or runs. That server can
occupy the assigned port, mutate the workspace, and contaminate subsequent health evidence.

**Required resolution:**

- Clean the owned process group even when its leader has already exited, while defending against
  process-group/PID reuse before signalling.
- Preserve bounded stop behavior and the successful long-running-server neighbour.

**Acceptance evidence:**

- A tier-2 fixture runs a shell equivalent to `node server & exit 0`, observes the failed probe,
  and proves the background server and its listener are gone.
- Cooperative exit, timeout, and already-empty group cases settle without killing unrelated
  processes.
- Windows evidence remains owned separately by F11/item 65. PLAN item 94 owns closure.

### F38 — HIGH: deploy-time repository changes can be tagged as reviewed and `SHIPPED`

**Status:** CLOSED — verified against e0ede97; see the 0.194.0 closure matrix above.
**Affected:** `scripts/driver.mjs:2826-2934`, `scripts/driver.mjs:6990-7014`

Publication is verified before ship-time mutation and the arbitrary deploy command. After those
mutation-capable steps the Driver rechecks only specification drift, then `ship()` tags implicit
current `HEAD` rather than the captured reviewed commit. A successful deploy can therefore edit
and commit tracked source, receive both tags, and cause `SHIPPED` on bytes neither gates nor Panel
reviewed.

**Impact:** an external command can move the publication subject after the final review seal,
extending F31's false-completion class.

**Required resolution:** revalidate workspace and HEAD after mutation/deploy, tag the explicit
reviewed commit, and withhold `SHIPPED` on any drift.

**Acceptance evidence:** real-Git tier-2 cases cover deploy-created commits and uncommitted deploy
changes; neither ships. Clean neighbours tag exactly the reviewed commit.

### F39 — HIGH: read failure deletes an unidentified takeover replacement

**Status:** OPEN
**Affected:** `scripts/run-lock.mjs:358-386`, `test/run-lock.test.mjs:400-478`

A read failure after `sweepAbandonedTakeover()` renames the claim leaves `moved === null`;
`isTheOneJudged` treats that as a match and recursively deletes it. Between the original read and
rename, another process can replace the abandoned JSON claim with a legacy takeover directory or
malformed live claim. A current contender can therefore delete a live pre-0.182.0 directory claim
and proceed while the legacy driver also reclaims the stale lock.

Existing tests cover a parseable JSON replacement and a legacy directory present at initial read,
but not a directory replacement inside the read/rename window.

**Impact:** the compatibility path can admit two reclaimers, reopening F1 through F34's recovery.

**Required resolution:** every post-rename read failure or disappearance loses arbitration. Remove
only an exact expected token or expected nameless-state match; restore or quarantine everything else.

**Acceptance evidence:** a deterministic replacement-with-directory test and a mixed-version tier-2
race prove legacy and current reclaimers cannot both win.

### F40 — MEDIUM: the handoff's current-order section contradicts current state

**Status:** CLOSED — verified against e0ede97; see the 0.194.0 closure matrix above.
**Affected:** `HANDOFF.md:1-21`, `HANDOFF.md:74-104`

HANDOFF records F7 implemented and live-validated at 0.179.0, then says F7 is blocked because the same
live expenditure is unauthorized. Its header also reports seventeen high and thirteen medium
findings while REVIEW already reported nineteen high and eighteen medium before this extension.

**Impact:** a fresh agent can pause completed work, misstate blockers, and follow obsolete sequencing.

**Required resolution:** remove the stale snapshot or defer mutable ordering to `PLAN.md`, and
reconcile counts without copying another long-lived queue into HANDOFF.

**Acceptance evidence:** one current F7 status, one authoritative order, and matching finding counts.

### F41 — HIGH: quality-plugin provisioning has no command deadline

**Status:** OPEN
**Affected:** `scripts/plugins.mjs:169-201`, `scripts/driver.mjs:6467`,
`scripts/driver.mjs:5022-5026`

`installQualityPlugins()` calls every detector and installer with only `{ cwd }`. The production
runner is `shell()`, which arms no timer when `timeoutMs` is absent. These are not guaranteed
local, short-lived commands: the configured paths include `npx -y ... install`, `npm install`,
and `python3 -m pip install`. If a subprocess waits forever on a package manager, child,
credential prompt, lock, or broken transport, Phase 1 awaits it forever.

**Trigger:** a configured quality-plugin detect or install command starts successfully and never
exits. The run lock has already been acquired, but the loop-level `try/finally`, outcome writer,
and all ordinary child/gate ceilings have not been reached.

**Impact:** an unattended run can stall indefinitely before its first iteration, retain the
repository lock for the lifetime of the driver, and write no terminal receipt. This defeats the
product's bounded unattended-operation goal. A nonzero install is already handled; the defect is
that no nonzero result is ever required to arrive.

**Governing requirements:** `DESIGN.md` §3.5 puts quality-plugin installation after exclusive
ownership and requires fail-closed pre-loop behavior; §5 makes required provisioning authoritative;
§10 supplies bounded child/gate/deploy watchdogs. F10 separately owns the receipt and lock-release
behavior after a provisioning failure; this finding owns the missing deadline that prevents a
failure result from existing.

**Why tests miss it:** plugin tests use immediate injected runners, and the main integration
fixtures either configure no quality plugins or return immediately. F2 proves `shell()` can
terminate a resistant child only when a caller supplies a ceiling; it cannot manufacture a ceiling
for this caller.

**Required resolution:** pass an explicit finite provisioning ceiling through
`installQualityPlugins()` to every detect/install command, using the existing bounded shell
termination and descendant cleanup rather than a second watchdog. Report timeout separately from
ordinary absence/install failure. Keep required-plugin failure fatal and optional-plugin failure a
warning after the command has settled. Route the resulting failure through F10's terminal boundary.

**Acceptance evidence:**

- Tier 2 runs a local detector and installer that ignore polite termination and proves each settles
  within the configured ceiling plus grace, with descendants gone and the run lock released.
- A timed-out required plugin aborts with a durable Phase-1 receipt; a timed-out optional plugin
  warns and proceeds only after cleanup.
- Present, ordinary-install-success, and ordinary-install-failure neighbours retain their current
  required/optional semantics.
- No network or package registry is needed for the fixtures.


## Audit coverage maps

These tables are reviewer evidence and triage aids, not new sources of product requirements.

### Guarantee strength

| Claim | Actual enforcement strength | Current qualification |
|---|---|---|
| ratcheted test ids never disappear | deterministic union store, atomic write, fail-closed read, contained current definitions | F17's definition-aware credit is not wired into `driveRun` |
| Builder cannot write Driver state | positional PreToolUse guard plus explicit child settings | tool-mediated writes only; executed target code is outside the hook boundary |
| Builder cannot certify Builder | separate Panel processes, process/envelope conjunction, Driver recombination | F29 lets Builder-mutable policy bind reviewers |
| Panel is cold | fresh read-only `claude -p`, safe mode, classified supplied prompt | F27 leaves exact tool availability open; F29 reintroduces mutable authority through an explicit read |
| Oracle is independent | PRD-only separate author, specification-bound atomic store, deterministic execution | F15 leaves cases repository-readable to Builder; F27 does not enforce zero tools |
| budgets and deadlines are hard | child/gate/deploy timers, conserved returned usage, bounded POSIX termination | F2 misses no-timeout overflow descendants; F11 is Windows; F41 leaves provisioning unbounded; host resource quotas are not claimed |
| publication names reviewed bytes | exact workspace seal, clean committed tree, post-deploy reseal, explicit-commit tags | closed F14/F31/F38; complete retained proof remains F22 |
| sandbox and model routing hold | settings/argv plus live probes | external contract must be re-probed after relevant changes; F27/F28 remain open and `e0ede97` owes tier 3 |
| external CLI feature contract | individual live canaries | F28 has no enforced compatibility range or sealed binary identity |
| supported command requires user invocation | direct command plus intended invocation control | F25 leaves the command on the autonomous Skill surface |
| pre-loop provenance is bounded | Driver revalidation and template-derived path admission | F26 ignores Git results and one provisioning admission result |
| terminal state is durable | atomic at-most-once `outcome.json` | F10 misses launch-refusal/prior-outcome and pre-loop-exception paths; F22 is evidence completeness |
| graph/provenance is complete | purpose-built ratchet, pins, review, Oracle, assumptions | no general claim graph; exact retained acceptance edges remain F22 |

### Durable artifact registry

| Artifact class | Scope and owner | Read-back authority | Failure posture / open gap |
|---|---|---|---|
| `config.json` | repository-scoped, operator-owned | selects run policy after validation | deliberately trackable; children cannot write it during a run |
| `lock.json` | active run, Driver-owned | excludes concurrent drivers | atomic ownership and token release verified; F39 owns mixed-version takeover evidence |
| `state.json` | cross-run, Driver-owned | monotonic test ids and reset commit | atomic; corruption quarantines and stops; F17 concerns current definition credit |
| `pins.json` | cross-run, Driver-owned | security blockers and requirement carry | atomic; corruption quarantines and stops |
| `red-evidence.json` | cross-run, Driver-owned | determines which tests earned current credit | atomic; corrupt bytes quarantine and evidence becomes strict empty |
| `gate-skip.json` | cross-run cache, Driver-owned | carries only failures on an identical tree | atomic; corruption degrades to rerunning gates |
| `oracle.json` | per run/specification, Driver-owned | deterministic held-out gate | lifecycle and atomicity verified; repository readability remains F15 |
| `capabilities.json` | current run snapshot, Driver-owned | arms conditional gate roster | atomic write; F13 converts loss/corruption into an empty established set |
| `specification.json` | per run, Driver-owned | binds roles/gates/ship to PRD bytes | identity/drift verified; its read remains unbounded under F19 |
| `run.json`, `outcome.json` | per run, Driver-owned | startup record and terminal state | outcome atomic; F10 misses paths and F22 omits complete acceptance links |
| `review.json`, briefs, assumptions | per run, Driver-owned | Panel evidence and supplied context | archived; F22/item 77 still owe complete supply/evidence linkage |
| lessons and bloopers | cross-run, Driver-owned | advisory prompt context / human history | lesson corruption degrades loudly to none; bloopers append |
| test/e2e reports, mutation config, browser marker | per attempt/tool invocation | ratchet and gates consume reports | attempt/path/flaky repairs verified; F17 and F19 remain |
| `runs/NNN/` | cross-run archive, Driver-owned | human/forensic evidence | successful-run archive verified; F10 launch-refusal overwrite remains |

### Open failure-shape summary

Closed defects are recorded in the 0.194.0 closure matrix. This table contains only current gaps, so a
future reviewer does not mistake historical evidence for an active defect.

| Finding | Boundary | Remaining failure shape |
|---|---|---|
| F2 | output-cap termination | without a caller timeout, descendants are not swept |
| F5 | child environment | ambient operator credentials cross into roles |
| F10 | terminal transition | launch refusal overwrites prior outcome; pre-loop exceptions escape receipt/release |
| F11 | Windows process cleanup | shell-wrapper descendants are not equivalently reaped |
| F13 | gate roster | lost/corrupt manifest can drop a detected-only established capability |
| F15 | Oracle confidentiality | Builder can inspect held-out cases through repository reads |
| F17 | ratchet credit | production loop discards definition-aware credited ids |
| F19 | decision artifact allocation | first reads and growth races remain unbounded |
| F21 | installed snapshot | source checks do not prove the cache-installed candidate |
| F22 | acceptance provenance | no durable exact-tree proof joins every required acceptance edge |
| F25 | invocation authority | supported command remains model-selectable |
| F26 | pre-loop provenance | Git/admission failures can be recorded as successful phase commits |
| F27 | role tools | approvals are not an exact available-tool boundary |
| F28 | CLI compatibility | no fail-closed supported range or sealed invocation identity |
| F29 | reviewer authority | Builder-mutable repository instructions can bind cold Panel |
| F39 | stale-lock compatibility | mixed-version rename-window exclusivity lacks tier-2 proof |
| F41 | provisioning lifecycle | detector/install commands have no deadline |

### Explicit negative guarantees

- Reviewer starvation is not filesystem secrecy; repository-readable state can be discovered.
- Oracle cases are “not supplied,” not confidential; Builder can read them (F15).
- The guard is not a general OS sandbox and cannot govern code after it leaves Claude's tool
  boundary.
- Token/cost ceilings are not atomic reservations across concurrent children.
- File-backed decision artifacts are not uniformly bounded before allocation (F19).
- Source validation is not proof that the installed cache snapshot matches the release (F21).
- A terminal `SHIPPED` record does not retain a complete deterministic acceptance proof (F22).
- The installed `/meeseeks` command remains available to autonomous model invocation (F25).
- A clean Driver revalidation does not make ignored Git command results successful (F26).
- `PHASE_PERMISSIONS.allowedTools` records approvals, not a closed role tool surface (F27).
- A successful `claude --version` exit does not establish the required external contract (F28).
- `--safe-mode` isolation is weakened when the reviewer explicitly treats Builder-mutable
  `CLAUDE.md` as binding (F29).
- Current sandbox and budget controls do not establish CPU, memory, process-count, disk-space, or
  workspace-growth quotas; PLAN item 84 measures that boundary.
- A model verdict is judgment, not deterministic proof; only the Driver combines it with gates.
- `run.json` is a record and is deliberately not read as authority.
- There is no crash-resume protocol, lifecycle journal, dynamic-workflow runtime, or general claim
  graph in the shipped product.
- Structured-logging detection and an unprobed health route are documented static proxies, not
  behavioral proof.
- Cross-platform support does not currently imply equivalent descendant cleanup on Windows (F11).
- Quality-plugin provisioning is not presently bounded by a command watchdog (F41).

### Cross-cutting code-review lenses

| Review lens | Current result |
|---|---|
| process-lifecycle state machine | F2, F10, F11, and F41 retain unsettled termination/receipt states |
| success laundering | F13, F17, and F26 still convert missing identity or failed provenance into usable state |
| crash fault injection | F10 and F39 remain; atomic acquisition, Oracle storage, outcomes, and publication repairs were separately verified |
| evidence-citation adversary | citation and reporter containment are closed; retained provenance remains F22 |
| authority by write site | F15, F22, F26, and F29 are the remaining authority/provenance gaps |
| environment and argument taint | F5 exposes ambient values; argv remains array-based and prompts remain stdin-delivered |
| configuration-to-effect reachability | F23 is closed; F27/F28 remain external-contract reachability gaps |
| command-surface reachability | F24 is closed; F25 remains user-only invocation authority |
| preflight-to-use race | revalidation/admission exist, but F26 ignores pre-loop Git results |
| tool availability versus approval | F27 remains; item 77 records only classified deliberate supply and is partial |
| monotonic escape audit | stored union is intact; F13 and F17 can silently lose current arming/credit semantics |
| hostile cross-platform pass | F11 remains; current POSIX cleanup evidence is green |
| budget conservation | returned role usage is conserved; resource reservation is not claimed and F41 can prevent return |
| resource-exhaustion boundary | F2, F19, F41, and PLAN item 84 define the remaining scope |
| terminal transition enumeration | F10 owns missing paths; F22 owns evidence completeness |
| installed-package reality | source/release validation is green; F21 remains the disposable-cache boundary |
| decision reproducibility | startup/Panel records survive; F22 still lacks one exact-tree acceptance receipt |
| ERD constraint audit | current explicit state remains purpose-built; no graph-store recommendation is justified |

### Temporal language and terminology audit

| Drift checked | Current resolution |
|---|---|
| authority and read order | `docs/INDEX.md` routes DESIGN → PLAN/REVIEW → HANDOFF; historical ledgers remain evidence only |
| `CLAUDE.md` / `AGENTS.md` mirror | byte-identical after the seven-line AGENTS preamble (`cmp` exit 0) |
| current finding counts | REVIEW alone owns nine high and eight medium open findings; HANDOFF intentionally does not copy the queue |
| ratchet terminology | historical passing ids remain monotonic; F17 specifically concerns current-definition credit, not deletion |
| publication subject | F14/F31/F38 are closed on exact reviewed commit semantics; F22 separately owns retained proof |
| Oracle terminology | run/specification lifecycle is closed under F8; “not supplied” is still not confidentiality (F15) or zero-tool enforcement (F27) |
| model-role vocabulary | inert `styleModel` and checkpoint reachability are closed under F23/F24; Builder, Panel, Oracle, and Driver authority names are unchanged |
| CLI/runtime vocabulary | F25, F27, and F28 distinguish invocation authority, tool availability, and version/binary compatibility |
| current tier policy | `e0ede97` modified `spawnClaude`; current 0.194.0 release evidence therefore owes tier 3 even though F7/F36 had live evidence at their repair boundaries |
| conceptual ERD | remains a documentation model over purpose-built state, not an implemented graph store |

## Verification performed

Current reviewer validation on committed candidate `e0ede97` / 0.194.0:

- `node --version` — **v24.14.1**
- `npm --version` — **11.11.0**
- `npm run lint` — **exit 0**
- `npm run typecheck` — **exit 0**
- `npm test` — **2,636 passed, 0 failed**
- `npm run test:integration` — **151 passed, 0 failed**
- `npm run release-check` — **exit 0**; version 0.194.0, no shipped file changed since
  `e0ede97`, and HANDOFF agrees
- `git diff --check` before the ledger edit — **exit 0**
- `git diff --check -- REVIEW.md` after the ledger edit — **exit 0**
- `CLAUDE.md` versus the AGENTS mirror body — **identical**, `cmp` exit 0

NPM emitted only the existing warnings that user config keys `user` and `unsafe-perm` will stop
working in the next major npm version; the commands themselves exited cleanly.

Not run:

- `npm run test:live` and every `claude -p` invocation — prohibited by this review. The recorded
  0.188.0 live run is acceptance evidence for F36/F7's repair boundary, but `e0ede97` later changed
  `spawnClaude`; repository policy requires a current tier-3 run before release.
- Network, installation, fetch, push, and `/meeseeks` — prohibited and unnecessary for this
  review.
- Windows-native descendant tests and disposable installed-cache validation — still owned by
  F11 and F21 respectively.

Green gates validate the exercised contracts; they do not close F2, F10, F13, F17, F19, F26, F39,
or F41 because the exact unexercised paths are recorded above.

## Closure protocol

Claude Code implements repairs in PLAN dependency order while preserving `DESIGN.md` and repository
invariants. A repaired finding remains OPEN, but **review-pending is not a development stop**. Keep
each slice in a focused commit, record acceptance evidence in PLAN/HANDOFF, and continue all
independent eligible work.

Request Codex review when the next step depends on an unverified high-risk repair, before a release
or acceptance claim, when no independent eligible work remains, or when the operator explicitly
asks. Submit one exact commit range and finding list for a coherent batch; Codex still traces and
closes each finding separately against its stated acceptance evidence.
