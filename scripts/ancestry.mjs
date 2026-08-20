/**
 * Nesting depth from process ancestry (`DESIGN.md` §6.6, `REVIEW.md` F42).
 *
 * §6.5 established that permission to nest is a **ticket** rather than an environment variable, and
 * F42's answer was that the ticket is still reachable only through a door the child controls:
 *
 * > `assertNotNested()` returns top-level depth zero when `MEESEEKS_RUNNING` is absent, so
 * > **clearing that marker avoids ticket redemption entirely.**
 *
 * That is exact. Every hardening on the recognized path — one-time nonces, depth carried through
 * the record, a cap applied at both ends — sits behind an `if` that a Builder skips with
 * `env -u MEESEEKS_RUNNING`. The guard denies the command forms it can *see*, and §6.5 records
 * honestly that a renamed copy or an indirect interpreter can stay unrecognizable.
 *
 * ## A child cannot choose its parents
 *
 * This module supplies the one fact about a starting Driver that the starting Driver cannot forge:
 * **who its ancestors are.** Environment variables, argv, and the working directory are all the
 * child's to set. The process tree above it is not.
 *
 * So a Driver registers its own pid when it starts, and a Driver that is starting walks its
 * ancestry and asks whether any ancestor is a registered run. If one is, this run is nested — at
 * that ancestor's depth plus one — **whatever its environment says**. Clearing the marker no longer
 * skips anything, because the marker is no longer what is consulted.
 *
 * ## Why the registry sits under `~/.meeseeks/`
 *
 * It has to live outside every repository, because F42's attack points the nested run at *another*
 * repository where the parent's lock and `.meeseeks/` are irrelevant. And it has to be one a
 * Builder cannot delete.
 *
 * Both fall out of the guard's existing rule for free. `MEESEEKS_DIR_RE` is **positional** — *any*
 * path component named `.meeseeks`, at any depth — so `~/.meeseeks/runs/1234.json` is already
 * protected against in-run writes by the rule that protects the repository's own state directory.
 * No new guard rule, and no new thing to remember: the enumeration failure §6 describes does not
 * get a second chance here.
 *
 * ## What this does not do, stated plainly
 *
 * It does not close F42. That finding requires the authority to hold **across a measured isolation
 * boundary** (§6.5, item 84), and same-user code can still stop this process, edit files this
 * process reads, or attack `ps` itself. What it closes is the specific bypass F42 names — the
 * marker-clearing form — and it does so with a fact the child does not own rather than one it does.
 *
 * On Windows the ancestry walk is unavailable and this reports **unknown** rather than zero. A
 * depth of zero is a claim; unknown is the truth, and the caller decides. See item 65.
 */

/** How far up the process tree to look before giving up. */
export const MAX_ANCESTRY_DEPTH = 40;

/** Where a running Driver records itself, relative to the operator's home directory. */
export const REGISTRY_DIR = ['.meeseeks', 'runs'];

/**
 * @typedef {{ ppidOf: (pid: number) => number | null }} AncestryIo
 */

/**
 * Every ancestor pid of `pid`, nearest first.
 *
 * Bounded and cycle-guarded. A pid table is not a tree this code controls — a re-parented process
 * points at pid 1, a container may report something stranger — and an unbounded walk over hostile
 * or merely unusual input is a hang in the one place that must never hang, which is before the run
 * starts.
 *
 * @param {number} pid
 * @param {AncestryIo} io
 * @returns {number[]}
 */
export function ancestorPids(pid, io) {
  /** @type {number[]} */
  const chain = [];
  /** @type {Set<number>} */
  const seen = new Set([pid]);
  let current = pid;
  for (let step = 0; step < MAX_ANCESTRY_DEPTH; step += 1) {
    /** @type {number | null} */
    let parent;
    try {
      parent = io.ppidOf(current);
    } catch {
      // A pid that vanished mid-walk ends the chain. It cannot be a registered ancestor of a
      // process that is still running, so stopping here loses nothing.
      return chain;
    }
    if (parent === null || parent <= 0 || parent === current) return chain;
    if (seen.has(parent)) return chain;
    seen.add(parent);
    chain.push(parent);
    // pid 1 is the top of every tree worth walking.
    if (parent === 1) return chain;
    current = parent;
  }
  return chain;
}

/**
 * @typedef {{ depth: 'unknown' } | { depth: number, via: number | null }} AncestryVerdict
 *
 * `via` is the registered ancestor this depth came from, or `null` at top level — recorded so a
 * refusal can name the run it is nested inside rather than asserting nesting abstractly.
 */

/**
 * The nesting depth this process actually has, from its ancestry.
 *
 * @param {number[]} ancestors nearest first, from {@link ancestorPids}
 * @param {(pid: number) => number | null} registeredDepthOf the depth a registered run recorded for
 *   that pid, or `null` when the pid is not a registered run
 * @returns {AncestryVerdict}
 */
export function depthFromAncestry(ancestors, registeredDepthOf) {
  // **Nearest first, and the first match wins.** An intermediate Driver that failed to register
  // would otherwise let a grandchild inherit its grandparent's depth and appear one generation
  // shallower than it is. Taking the nearest registered ancestor is the conservative reading: the
  // deepest one this process can prove it is below.
  for (const pid of ancestors) {
    const depth = registeredDepthOf(pid);
    if (depth !== null) return { depth: depth + 1, via: pid };
  }
  return { depth: 0, via: null };
}

/**
 * Whether the environment's account of nesting agrees with the ancestry's.
 *
 * This is the whole point of the module, expressed as one comparison. A run whose environment says
 * *top level* while its ancestry says *inside a run* has had its marker cleared, and that is not a
 * configuration difference — it is the F42 bypass, performed.
 *
 * **Only that direction refuses.** See the body: a claim of greater depth than ancestry can
 * corroborate is ordinary, and buys an attacker nothing, because depth only ever restricts.
 *
 * @param {AncestryVerdict} ancestry
 * @param {number} claimed the depth the environment established
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function reconcileDepth(ancestry, claimed) {
  // Unknown ancestry cannot contradict anything. It is reported rather than treated as agreement,
  // and the caller decides what an unmeasurable platform means for it — a `depth: 0` here would be
  // this module inventing the very claim it exists to check.
  if (ancestry.depth === 'unknown') return { ok: true };
  if (ancestry.depth === claimed) return { ok: true };
  if (ancestry.depth > claimed) {
    return {
      ok: false,
      reason:
        `this process is a descendant of run ${ancestry.via} and is therefore nested at depth ` +
        `${ancestry.depth}, but its environment establishes depth ${claimed}. A run marker was cleared ` +
        'between the parent and this process; ancestry is not something a child chooses, so the ancestry wins.',
    };
  }
  // **The other direction is permitted, and getting this wrong breaks the feature.** The environment
  // claiming *deeper* than the ancestry can account for is not the attack — the attack is a child
  // pretending to be shallower — and it has ordinary causes: a parent whose home was read-only and
  // could not register, a parent that has since exited, a host where registration is unavailable.
  //
  // The first version of this refused it too, on the symmetry argument that two disagreeing
  // authorities should never be resolved toward the convenient one. The integration suite refuted
  // that immediately: a legitimately authorized component run holds a redeemed ticket for depth one
  // and its parent may be unregistered for reasons that are nobody's fault, so refusing here turns
  // *best-effort* registration into a hard dependency and breaks every boxed run on a host that
  // cannot write the register.
  //
  // The asymmetry is not a compromise, it is the threat model. Claiming a **shallower** depth buys
  // an attacker the nesting cap and the ticket check; claiming a **deeper** one buys nothing, since
  // depth only ever restricts. `assertNotNested` still owns the ticket for this path, and the cap
  // still refuses past `MAX_BOX_DEPTH`.
  return { ok: true };
}
