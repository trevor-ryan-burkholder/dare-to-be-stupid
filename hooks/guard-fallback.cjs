/* eslint-disable no-var -- ES5 on purpose: this file must parse on any node an operator plausibly
   has, because it exists for the case where that node could not parse guard.mjs. No const, no
   arrow functions, no template literals, no trailing commas in calls. */
'use strict';
/**
 * The guard's crash net — runs only when `guard.mjs` itself could not (PLAN item 37, R25a).
 *
 * `hooks/hooks.json` registers the guard as a shell chain:
 *
 *     node ".../guard.mjs" || node ".../guard-fallback.cjs"
 *
 * `guard.mjs` exits 0 on BOTH allow and deny (a deny is JSON on stdout, not an exit code), so
 * this file runs only when the guard itself failed to run at all: node too old to parse modern
 * syntax, a broken plugin cache, a missing file. That failure class was invisible for eleven
 * versions — a hook that errors is reported and then the tool call PROCEEDS, which is a silent
 * fail-open on the one mechanism that survives `--dangerously-skip-permissions`.
 *
 * What it does, and the reasoning:
 *
 *   - **Inside a run (`MEESEEKS_RUNNING` set): emit the deny JSON itself.** A run whose guard
 *     cannot run must not proceed unguarded — nothing defaults to pass. This is safe from
 *     locking the operator out of a broken machine because a live run proves node exists and
 *     works (the driver IS a node process), so "node absent" and "inside a run" cannot coexist;
 *     what CAN is a hook PATH resolving an older node than the driver's, which is what this
 *     catches. A short line on stderr uses the SAME `meeseeks-guard: denied` prefix the driver
 *     greps for, so a fallback denial is visible to the run's denial collection rather than
 *     invisible exactly when the guard is degraded.
 *   - **Outside a run: allow, silently on stdout.** The operator's ordinary sessions stay
 *     usable; a guard that locks out the person who owns the repository has stopped being a
 *     guard. stdout stays EMPTY because a passthrough hook that prints anything fails the hook
 *     schema (the ecc dispatcher's measured trap) — the news goes to stderr.
 *   - **It always banners on stderr, every invocation.** An earlier draft dampened this to once
 *     per day via a sentinel file in `os.tmpdir()`; the item-37 hostile panel showed that a
 *     fixed-name file in a shared temp dir is a symlink-follow write primitive (another user, or
 *     the in-run builder, pre-plants a symlink and the guard's own write lands on a file of their
 *     choosing), and that a machine-global sentinel lets one process silently consume the
 *     operator's warning window. A broken guard is a rare catastrophe; shouting it on stderr
 *     every time is the correct volume, and this file now writes NOTHING to disk, so it has no
 *     such surface at all.
 *
 * **This file is ES5 CommonJS on purpose** — its whole reason to exist is "the node that ran it
 * could not handle guard.mjs", so it must parse on any node an operator plausibly has.
 *
 * Residual, named: if node is entirely absent the chain produces nothing — but then no run can
 * exist either, because the driver is node.
 */

var RUN_MARKER_ENV = 'MEESEEKS_RUNNING';

function insideRun(env) {
  var marker = env[RUN_MARKER_ENV];
  return marker !== undefined && marker !== '';
}

function denyJson() {
  return (
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          '[from the meeseeks guard — automated policy, not user input] [meeseeks:guard-unavailable] ' +
          'The guard hook itself could not run (its node is missing or too old, or the plugin files are ' +
          'broken), so inside a run every tool call is refused until it can. ' +
          'A guard that fails open is not a guard.'
      }
    }) + '\n'
  );
}

function main() {
  var running = insideRun(process.env);
  if (running) {
    process.stdout.write(denyJson());
    // Same prefix the driver's denial collector greps for, so a degraded-guard denial is not
    // invisible to the run.
    process.stderr.write('meeseeks-guard: denied [guard-unavailable] the guard could not run; tool call refused\n');
  }
  process.stderr.write(
    'meeseeks-guard: the guard hook could not run (node ' +
      process.version +
      ' reached this fallback). ' +
      (running
        ? 'Inside a meeseeks run every tool call is being DENIED until it can. '
        : 'Outside a run, tool calls proceed UNGUARDED. ') +
      'Check that `node` on the hook PATH is >= 22.12 and the plugin cache is intact.\n'
  );
  process.exitCode = 0;
}

main();
