# Codex code review — 15 August 2026

> **Ownership:** This is the Codex reviewer document. Codex records and verifies findings here;
> Claude Code owns implementation. Do not treat an entry as closed until Codex has reviewed the
> repair and the relevant verification has passed.

**Reviewed tree:** `main` at `65a14cc` (`pre-codex`), version `0.161.0`
**Verdict:** **CHANGES REQUESTED** — three high-priority safety defects and one medium-priority
timeout defect are open.

This was a read-only review of the current Claude-native implementation. No runtime behavior,
Claude Code integration, or plugin architecture was changed.

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

### F2 — HIGH: the process watchdog does not bound a child that ignores SIGTERM

**Status:** OPEN
**Affected:** `scripts/driver.mjs:4488-4504`

When `timeoutMs` expires, `shell` sets `timedOut = true` and sends `SIGTERM`. It settles only after
the child emits `exit`. There is no grace timer, `SIGKILL` escalation, or independent settlement
path if the child traps or ignores `SIGTERM`.

**Verified reproduction:** A child that ignored `SIGTERM` and exited naturally after one second
was run with `timeoutMs: 100`. `shell` reported a timeout, but returned after **1,018 ms**. A child
that never exits would defeat the watchdog indefinitely.

**Impact:** Gate, deploy, and Claude-child ceilings are not hard bounds. A hung process can still
stall an unattended run forever despite the log promising it will be killed after a stated time.

**Required resolution:**

- Send `SIGTERM` at the deadline, allow a short bounded grace period, then force termination with
  `SIGKILL` where supported.
- Apply the force step to the relevant process tree/group and retain the descendant sweep.
- Guarantee that the promise settles even if the direct child never emits a cooperative exit
  after `SIGTERM`.
- Keep `timedOut` distinct from buffer overflow and self-termination as it is today.

**Acceptance evidence:**

- Tier 2 starts a direct child that traps `SIGTERM` forever and proves `shell` returns within the
  deadline plus the documented grace period.
- The resistant child and its descendants are no longer alive after return.
- Existing bystander, overflow, ordinary failure, and self-termination tests remain green.

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

## Verification performed

All existing non-paid gates were green on the reviewed tree:

- `npm run lint`
- `npm run typecheck`
- `npm test` — **2,307 passed, 0 failed**
- `npm run test:integration` — **51 passed, 0 failed**
- `npm run release-check` — version `0.161.0` and shipped-file baseline clean

The paid live tier was not run. The worktree was clean after review. Existing green tests do not
cover the four failure shapes above.

## Closure protocol

Claude Code may implement the repairs in any order that preserves `DESIGN.md` and the repository
invariants. After implementation, ask Codex to re-review the exact diff. Codex will change an item
to `CLOSED` only after tracing the repair and checking the stated acceptance evidence.
