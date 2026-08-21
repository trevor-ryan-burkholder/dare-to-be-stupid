/**
 * The immutable candidate — the exact bytes a run's gates and Panel are judging (REVIEW F14).
 *
 * **A sampled mutable path is not a review subject.** The previous repair hashed the working tree
 * before the Panel and again afterwards and refused any difference. That closes *persistent* drift
 * and nothing else: the same identity on both sides does not prove which bytes were visible in
 * between. A Builder can leave a background process — it has arbitrary Bash — that swaps tree A for
 * an easier tree B while a gate or a reviewer reads it and restores A before the next sample. Both
 * hashes return A. The gates were weaker still, because their identity was captured only *after*
 * their results came back. Codex reproduced the end of it: a reviewer read `src/a.js` as
 * `reviewed bytes`, a concurrent write changed it, and the run committed the later bytes as
 * `SHIPPED`.
 *
 * So the subject is materialized instead of sampled. After the Builder, the Driver stages the
 * working tree into a **temporary index** — never the repository's own — writes a tree object,
 * wraps it in a commit that no branch points at, and checks that commit out into a separate
 * worktree. Gates run there, the Panel reads there, evidence resolves there. This separates ordinary
 * writes to the main tree from the subject and gives the intended bytes a content-addressed name.
 * It does not isolate that path from a same-user background process left by the Builder; F14 remains
 * open on that stronger threat, which needs a measured filesystem/process boundary.
 *
 * **What the subject is.** Tracked files plus untracked-but-not-ignored ones — `git add -A`'s view,
 * which is the same set `git add -A` will later commit. Ignored paths are deliberately outside it:
 * they are not committed, not reviewed, and not part of the candidate. The tool caches among them
 * (`node_modules/`, and whatever else execution has since taught us) are *shared by symlink*, because
 * a snapshot that cannot resolve its own dependencies cannot run a single gate — and reinstalling
 * them every iteration would cost more than the defect. That sharing is the one mutable surface left
 * and it is named here rather than left to be discovered.
 *
 * **One worktree per run, re-checked-out each iteration.** A fresh worktree per iteration would
 * throw away the gate cache and the installed browsers with it, turning an optimization into a
 * per-iteration reinstall. Ignored files survive a `checkout --force`, which is exactly the property
 * that makes the reuse safe: the tracked subject is replaced wholesale and the caches persist.
 */

import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * @typedef {(command: string, args: string[],
 *   options: { cwd: string, env?: Record<string, string | undefined>, timeoutMs?: number }) =>
 *   Promise<{ ok: boolean, stdout: string, stderr: string }>} Runner
 */

/** @typedef {{ ok: true, dir: string, tree: string, commit: string }} CandidateReady */
/** @typedef {{ ok: false, detail: string }} CandidateRefused */

/** Thrown for a programming error in this module's own use, never for a git failure. */
export class CandidateError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'CandidateError';
  }
}

/**
 * The worktree directory a run uses for its candidate.
 *
 * Outside the repository, so nothing in the candidate can reach it by a relative path and no gate
 * that walks the tree finds a second copy of the project inside it. Keyed by pid because two runs in
 * two repositories on one machine must not collide, and the run lock already guarantees there are
 * never two in the same one.
 *
 * @param {number} pid
 * @returns {string}
 */
export function candidateDirFor(pid) {
  return path.join(os.tmpdir(), `meeseeks-candidate-${pid}`);
}

/**
 * Where inside a candidate this run's project actually is.
 *
 * The candidate is a worktree of the **whole repository**. A top-level run's project is its root, so
 * these are the same directory and the distinction has never mattered. A component sub-run's project
 * is a subdirectory — `packages/textstats` — and gates launched at the candidate root run against a
 * tree that has no `package.json`, no lint config and no tests.
 *
 * Measured on the first real boxed component run (PLAN item 24): `npm error path
 * /tmp/meeseeks-candidate-14477/package.json`, repeated for build, lint, types, ci, docs, knip and
 * security-audit, every iteration, until the run stalled having never run one gate against the code
 * it was writing.
 *
 * @param {string} candidateDir the materialized worktree
 * @param {string} prefix this run's offset inside its repository, from `repoPrefix`
 * @returns {string}
 */
export function candidateProjectDir(candidateDir, prefix) {
  // `git rev-parse --show-prefix` answers `packages/textstats/`, and `path.join` keeps that trailing
  // separator. Two spellings of one directory is the kind of difference that surfaces much later as
  // a mismatched string compare, so it is normalised here rather than at each reader.
  const trimmed = prefix.replace(/[\\/]+$/, '');
  return trimmed === '' ? candidateDir : path.join(candidateDir, trimmed);
}

/**
 * The temporary index a snapshot is staged into.
 *
 * **Never the repository's own index.** Staging into `.git/index` would leave the operator's
 * repository with everything staged after any run, and would race with the commit the loop makes at
 * the end of the iteration. It is removed before each use rather than reused, so a deletion in the
 * working tree becomes an absence in the tree object instead of a stale entry.
 *
 * @param {string} gitDir
 * @returns {string}
 */
export function snapshotIndexFor(gitDir) {
  return path.join(gitDir, 'meeseeks-candidate-index');
}

/**
 * Where this repository keeps its git directory, resolved rather than assumed.
 *
 * `.git` is a directory in an ordinary clone and a *file* in a worktree, and a run started inside a
 * component worktree is an ordinary case here.
 *
 * @param {{ cwd: string, run: Runner }} options
 * @returns {Promise<string | null>}
 */
export async function resolveGitDir(options) {
  const shown = await options.run('git', ['rev-parse', '--absolute-git-dir'], { cwd: options.cwd });
  if (!shown.ok) return null;
  const dir = shown.stdout.trim();
  return dir === '' ? null : dir;
}

/**
 * Stage the working tree into a temporary index and name the result.
 *
 * The returned tree is content-addressed: two snapshots of identical bytes have the same name, and
 * any difference at all produces a different one. That is what lets the pre-commit check be an
 * equality rather than another sample.
 *
 * When `withoutSharedLinks` names paths, entries staged at exactly those paths are subtracted from
 * the index before the tree is written — but only entries whose staged mode says *symlink*
 * (PLAN item 163). The paths are the cache links `shareToolCaches` created, which are absent from
 * the tree the candidate was checked out from by construction, so subtracting them makes the two
 * digests comparable again without touching ignore machinery. Ignore machinery is the wrong tool
 * here twice over, both measured: git shares `info/exclude` across every worktree of a repository,
 * so concurrent component runs would race one file, and an exclude pattern applied to a fresh index
 * silently drops a tracked path from the snapshot. The mode check is the deny path: a regular file
 * swapped in where a link was is a mutation, and it stays in the comparison.
 *
 * @param {{ cwd: string, run: Runner, gitDir: string, timeoutMs?: number,
 *   withoutSharedLinks?: string[] }} options
 * @returns {Promise<{ ok: true, tree: string } | CandidateRefused>}
 */
export async function writeSnapshotTree(options) {
  const index = snapshotIndexFor(options.gitDir);
  // Built from nothing every time. A reused index carries the previous iteration's entries, so a
  // file the builder deleted would still be in the tree — a subject containing bytes that are not
  // in the working copy, which is the defect this module exists to prevent, inverted.
  rmSync(index, { force: true });
  const env = { ...process.env, GIT_INDEX_FILE: index };
  const staged = await options.run('git', ['add', '-A'], { cwd: options.cwd, env, timeoutMs: options.timeoutMs });
  if (!staged.ok) {
    return { ok: false, detail: `the candidate could not be staged: ${(staged.stderr || staged.stdout).trim()}` };
  }
  const links = options.withoutSharedLinks ?? [];
  if (links.length > 0) {
    // `-z` so a path never round-trips through core.quotePath; the entry format is
    // `<mode> <object> <stage>\t<path>`. Anything staged at a named path with a non-link mode is
    // left exactly where it is, and the seal then reports the difference it represents.
    const listed = await options.run('git', ['ls-files', '--stage', '-z', '--', ...links], {
      cwd: options.cwd,
      env,
      timeoutMs: options.timeoutMs,
    });
    if (!listed.ok) {
      return { ok: false, detail: `the shared cache links could not be inspected: ${(listed.stderr || listed.stdout).trim()}` };
    }
    const symlinks = listed.stdout
      .split('\0')
      .filter((entry) => entry.startsWith('120000 '))
      .map((entry) => entry.slice(entry.indexOf('\t') + 1))
      .filter((entry) => entry !== '');
    if (symlinks.length > 0) {
      // `--force-remove` on the temporary index only; a named path with no entry is a no-op, so a
      // link something already deleted does not fail the snapshot.
      const subtracted = await options.run('git', ['update-index', '--force-remove', '--', ...symlinks], {
        cwd: options.cwd,
        env,
        timeoutMs: options.timeoutMs,
      });
      if (!subtracted.ok) {
        return {
          ok: false,
          detail: `the shared cache links could not be subtracted: ${(subtracted.stderr || subtracted.stdout).trim()}`,
        };
      }
    }
  }
  const written = await options.run('git', ['write-tree'], { cwd: options.cwd, env, timeoutMs: options.timeoutMs });
  const tree = written.stdout.trim();
  if (!written.ok || !/^[0-9a-f]{40,64}$/.test(tree)) {
    return { ok: false, detail: `the candidate tree could not be written: ${(written.stderr || written.stdout).trim()}` };
  }
  return { ok: true, tree };
}

/**
 * Share the ignored tool caches with the snapshot, by symlink.
 *
 * **The one mutable surface left, and it is deliberate.** A worktree checked out from a tree object
 * has no `node_modules`, so without this every gate in every iteration would fail on a missing
 * dependency or pay for a reinstall. The caches are ignored, which means they are not part of the
 * candidate, are never committed, and are not what any reviewer is judging.
 *
 * A link is only made for a cache that exists in the main tree and is absent from the snapshot, so a
 * repository that vendors its dependencies as tracked files keeps its own copy untouched.
 *
 * `linked` is every cache the candidate can now see; `created` is the subset this call materialized
 * (PLAN item 163). The distinction carries the seal's authority to subtract: a created link was
 * absent from the tree the candidate was checked out from *by construction*, so removing it from
 * the re-staged comparison cannot hide anything that was judged. A pre-existing entry at a cache
 * path — a tracked symlink the repository commits, a vendored directory — is part of the candidate
 * and is never reported as created.
 *
 * @param {{ cwd: string, dir: string, caches: string[] }} options
 * @returns {{ linked: string[], created: string[], problems: string[] }}
 */
export function shareToolCaches(options) {
  /** @type {string[]} */
  const linked = [];
  /** @type {string[]} */
  const created = [];
  /** @type {string[]} */
  const problems = [];
  for (const entry of options.caches) {
    const name = entry.replace(/\/+$/, '');
    if (name === '' || name.includes('..') || path.isAbsolute(name)) continue;
    const source = path.join(options.cwd, name);
    if (!existsSync(source)) continue;
    const target = path.join(options.dir, name);
    // A cache the snapshot already has of its own — a tracked `node_modules`, or a link from an
    // earlier iteration — is left exactly as it is. Replacing a tracked directory with a link would
    // change the candidate.
    let existingLink = false;
    try {
      existingLink = lstatSync(target).isSymbolicLink();
    } catch {
      // Absent, which is the ordinary case on a fresh worktree.
    }
    if (existingLink) {
      linked.push(name);
      continue;
    }
    if (existsSync(target)) continue;
    try {
      mkdirSync(path.dirname(target), { recursive: true });
      symlinkSync(source, target, 'junction');
      linked.push(name);
      created.push(name);
    } catch (error) {
      // Reported rather than thrown: a cache that could not be shared makes gates slower or makes
      // them fail on their own terms, and either is a better outcome than killing a healthy run
      // over a symlink. The caller logs it.
      problems.push(`${name} could not be shared with the candidate: ${/** @type {Error} */ (error).message}`);
    }
  }
  return { linked, created, problems };
}

/**
 * Materialize this iteration's candidate, reusing the run's worktree.
 *
 * @param {{ cwd: string, run: Runner, dir: string, iteration: number, caches?: string[],
 *   timeoutMs?: number }} options
 * @returns {Promise<CandidateReady | CandidateRefused>}
 */
export async function materializeCandidate(options) {
  const gitDir = await resolveGitDir({ cwd: options.cwd, run: options.run });
  if (gitDir === null) {
    return { ok: false, detail: 'the candidate could not be materialized: this is not a git repository' };
  }
  const snapshot = await writeSnapshotTree({ cwd: options.cwd, run: options.run, gitDir, timeoutMs: options.timeoutMs });
  if (!snapshot.ok) return snapshot;

  const head = await options.run('git', ['rev-parse', 'HEAD'], { cwd: options.cwd, timeoutMs: options.timeoutMs });
  if (!head.ok || head.stdout.trim() === '') {
    return {
      ok: false,
      detail:
        'the candidate could not be materialized: this repository has no commit yet, so there is nothing for the ' +
        'snapshot to descend from',
    };
  }
  const parented = await options.run(
    'git',
    ['commit-tree', snapshot.tree, '-p', head.stdout.trim(), '-m', `meeseeks: candidate for iteration ${options.iteration}`],
    { cwd: options.cwd, timeoutMs: options.timeoutMs },
  );
  const commit = parented.stdout.trim();
  if (!parented.ok || !/^[0-9a-f]{40,64}$/.test(commit)) {
    return {
      ok: false,
      detail: `the candidate commit could not be written: ${(parented.stderr || parented.stdout).trim()}`,
    };
  }

  if (!existsSync(options.dir)) {
    const added = await options.run('git', ['worktree', 'add', '--detach', options.dir, commit], {
      cwd: options.cwd,
      timeoutMs: options.timeoutMs,
    });
    if (!added.ok) {
      return { ok: false, detail: `the candidate worktree could not be created: ${(added.stderr || added.stdout).trim()}` };
    }
  } else {
    // `--force` twice: the first allows a checkout over local modifications a gate left behind, the
    // second allows detaching from a checkout git considers dirty. Tracked bytes are replaced
    // wholesale; ignored files — the caches and the snapshot's own `.meeseeks/` — survive, which is
    // what makes reusing one worktree cheaper than creating one per iteration.
    const moved = await options.run('git', ['checkout', '--detach', '--force', commit], {
      cwd: options.dir,
      timeoutMs: options.timeoutMs,
    });
    if (!moved.ok) {
      return { ok: false, detail: `the candidate worktree could not be updated: ${(moved.stderr || moved.stdout).trim()}` };
    }
    // A gate that wrote a *new* untracked file last iteration would otherwise leave it in the
    // subject, so the tree is cleaned of everything git does not know about — except the ignored
    // caches, which `-x` would take with it. Two force flags are required for an untracked nested
    // repository: one leaves it behind, and then the gates would inspect bytes absent from the
    // content-addressed tree this function returns.
    const cleaned = await options.run('git', ['clean', '-ffd'], { cwd: options.dir, timeoutMs: options.timeoutMs });
    if (!cleaned.ok) {
      return {
        ok: false,
        detail: `the candidate worktree could not be cleaned: ${(cleaned.stderr || cleaned.stdout).trim()}`,
      };
    }
  }
  // **The gates write their reports into `<candidate>/.meeseeks/`, and a fresh worktree has no such
  // directory.** `.meeseeks/` is ignored, so a checkout never creates it — and a runner told
  // `--outputFile=<candidate>/.meeseeks/test-report.json` writes nothing, exits zero, and the loop
  // reads "the test report contained no tests at all" on every iteration forever. Found by the first
  // test that let a real gate write a real report into a real candidate; every earlier tier-2 suite
  // injects `readTestReports` and could not see it.
  mkdirSync(path.join(options.dir, '.meeseeks'), { recursive: true });
  return { ok: true, dir: options.dir, tree: snapshot.tree, commit };
}

/**
 * Is the working tree still the bytes the candidate was made from?
 *
 * Called immediately before the commit. A difference means the main tree moved while gates and the
 * Panel were judging the snapshot, so the verdict describes bytes that are no longer the ones about
 * to be committed — and the answer is to discard the verdict, not to commit the newer bytes under it.
 *
 * @param {{ cwd: string, run: Runner, tree: string, timeoutMs?: number }} options
 * @returns {Promise<{ ok: boolean, tree: string | null, detail: string }>}
 */
export async function workingTreeMatchesCandidate(options) {
  const gitDir = await resolveGitDir({ cwd: options.cwd, run: options.run });
  if (gitDir === null) {
    return { ok: false, tree: null, detail: 'the working tree could not be compared with the candidate: no git directory' };
  }
  const snapshot = await writeSnapshotTree({ cwd: options.cwd, run: options.run, gitDir, timeoutMs: options.timeoutMs });
  if (!snapshot.ok) return { ok: false, tree: null, detail: snapshot.detail };
  if (snapshot.tree === options.tree) return { ok: true, tree: snapshot.tree, detail: 'the working tree is the candidate' };
  return {
    ok: false,
    tree: snapshot.tree,
    detail:
      `the working tree is ${snapshot.tree} and the gated, reviewed candidate was ${options.tree}. Something wrote to ` +
      'the repository while it was being judged, so the verdict describes bytes that are not the ones about to be ' +
      'committed. Discarding the verdict and re-gating; nothing is committed under a review of different bytes.',
  };
}

/**
 * Has the candidate itself changed since it was checked out?
 *
 * **The other half of {@link workingTreeMatchesCandidate}, and REVIEW F14's remaining one.** That
 * function asks whether the *main* working tree still matches the reviewed bytes. This asks whether
 * the **candidate** does — because the candidate is what the gates ran against and what the panel
 * read, and `candidateDirFor` is a path a Builder descendant can reach.
 *
 * The Git tree object names what was checked out. It does not make that checkout immutable, and
 * nothing short of an OS boundary can (item 84). What this does is convert an *undetectable*
 * mutation into a detected one, which is the same standard F14 already accepts for the main tree:
 * a divergence discards the verdict rather than being swept into the commit.
 *
 * Compared by re-staging the candidate into its own temporary index and writing a tree, exactly the
 * way the snapshot was produced — so the two digests are comparable by construction rather than by
 * two functions agreeing about what to hash.
 *
 * `sharedLinks` names the cache links `shareToolCaches` *created* in this candidate, spelled from
 * the candidate root (PLAN item 163). They are subtracted from the re-staged index — symlink
 * entries only — because a `.gitignore` line like `node_modules/` matches directories and not
 * symlinks, so the one surface the run deliberately shares would otherwise read as drift and
 * discard every verdict, which is exactly what stalled measurement run 3 three panels in a row.
 *
 * @param {{ dir: string, tree: string, run: Runner, timeoutMs?: number, sharedLinks?: string[] }} options
 * @returns {Promise<{ ok: boolean, tree: string | null, detail: string }>}
 */
export async function candidateMatchesTree(options) {
  const gitDir = await resolveGitDir({ cwd: options.dir, run: options.run });
  if (gitDir === null) {
    return { ok: false, tree: null, detail: 'the candidate could not be verified: no git directory' };
  }
  const snapshot = await writeSnapshotTree({
    cwd: options.dir,
    run: options.run,
    gitDir,
    timeoutMs: options.timeoutMs,
    withoutSharedLinks: options.sharedLinks,
  });
  if (!snapshot.ok) return { ok: false, tree: null, detail: snapshot.detail };
  if (snapshot.tree === options.tree) {
    return { ok: true, tree: snapshot.tree, detail: 'the candidate is the tree it was checked out from' };
  }
  return {
    ok: false,
    tree: snapshot.tree,
    detail:
      `the candidate is now ${snapshot.tree} and was checked out as ${options.tree}. Something wrote to the ` +
      'candidate while the gates or the panel were reading it, so the verdict describes bytes that are not the ' +
      'ones that were judged. Discarding the verdict; nothing ships under a review of different bytes.',
  };
}

/**
 * Remove the run's candidate worktree, on every path out.
 *
 * @param {{ cwd: string, run: Runner, dir: string, timeoutMs?: number }} options
 * @returns {Promise<{ removed: boolean, detail: string }>}
 */
export async function removeCandidate(options) {
  const removed = await options.run('git', ['worktree', 'remove', '--force', options.dir], {
    cwd: options.cwd,
    timeoutMs: options.timeoutMs,
  });
  // Pruned whatever the removal could not, so a stale administrative entry does not refuse the next
  // run's `worktree add` on the same path — the lesson races paid for.
  await options.run('git', ['worktree', 'prune'], { cwd: options.cwd, timeoutMs: options.timeoutMs });
  if (removed.ok) {
    rmSync(options.dir, { recursive: true, force: true });
    return { removed: true, detail: '' };
  }
  return { removed: false, detail: (removed.stderr || removed.stdout).trim() };
}

/**
 * Remove candidate worktrees abandoned by a run that did not get to clean up.
 *
 * The same self-healing races take, for the same reason: cleanup on the way out cannot survive
 * `SIGKILL`, and `git worktree add` refuses a path git already knows about. Run at the start, under
 * the run lock, so a registered candidate worktree cannot belong to a live run in this repository.
 *
 * @param {{ cwd: string, run: Runner, timeoutMs?: number }} options
 * @returns {Promise<{ removed: string[], problems: string[] }>}
 */
export async function sweepCandidateWorktrees(options) {
  /** @type {string[]} */
  const removed = [];
  /** @type {string[]} */
  const problems = [];
  const listed = await options.run('git', ['worktree', 'list', '--porcelain'], {
    cwd: options.cwd,
    timeoutMs: options.timeoutMs,
  });
  if (!listed.ok) {
    return { removed, problems: [`the worktree list could not be read: ${(listed.stderr || listed.stdout).trim()}`] };
  }
  for (const line of listed.stdout.split('\n')) {
    if (!line.startsWith('worktree ')) continue;
    const dir = line.slice('worktree '.length).trim();
    if (!/(^|[\\/])meeseeks-candidate-\d+$/.test(dir)) continue;
    const result = await removeCandidate({ cwd: options.cwd, run: options.run, dir, timeoutMs: options.timeoutMs });
    if (result.removed) removed.push(dir);
    else problems.push(`abandoned candidate worktree ${dir} could not be removed: ${result.detail}`);
  }
  // The temporary index is not a worktree and `prune` knows nothing about it, so it is swept here
  // too: a killed run leaves one behind, and a stale one is confusing to find in `.git/`.
  const gitDir = await resolveGitDir({ cwd: options.cwd, run: options.run });
  if (gitDir !== null) {
    try {
      unlinkSync(snapshotIndexFor(gitDir));
    } catch {
      // Absent, which is the ordinary case.
    }
  }
  return { removed, problems };
}
