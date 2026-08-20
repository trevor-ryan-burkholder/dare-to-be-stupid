/**
 * Tier 3 — **which `claude` is this tier actually testing?**
 *
 * §11.1 exists because "anything whose contract is owned by a different binary needs one live
 * check, not more assertions". On 13 August 2026 that tier was found to be checking **a
 * different binary than the driver runs.**
 *
 * `npm run` prepends every ancestor `node_modules/.bin` to `PATH`. On this machine
 * `~/dev/node_modules/.bin/claude` is Claude Code **2.1.136**, while the operator's `claude` —
 * the one `scripts/driver.mjs` spawns, because the driver is invoked as `node scripts/driver.mjs`
 * and never through npm — is **2.1.228**. Ninety-two patch versions apart, and the older one has
 * never heard of `--safe-mode`.
 *
 * Every "live tier green" reported before that discovery was the wrong binary answering: the
 * `--effort` levels, the envelope field names, the output-style isolation. The tier built to
 * catch exactly this class had it.
 *
 * So this file runs first and **fails loudly rather than adapting**. A suite that silently
 * corrects its own `PATH` would keep working and teach nobody, and the next person to add a flag
 * would rediscover this from scratch.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { describe, it } from 'node:test';

import { proveClaudeAuth } from '../../scripts/driver.mjs';

const ARMED = process.env.MEESEEKS_LIVE === '1';

/**
 * @param {string} command
 * @returns {string}
 */
function versionOf(command) {
  return execFileSync(command, ['--version'], { encoding: 'utf8', stdio: 'pipe' }).trim();
}

describe('the binary under test', { skip: ARMED ? false : 'MEESEEKS_LIVE is not set' }, () => {
  it('is the same `claude` the driver would spawn, not one npm put on the PATH', () => {
    // The driver calls `shell('claude', …)` with the operator's environment. Resolve the same
    // way a login shell does, deliberately stripping the node_modules/.bin entries npm injected.
    const stripped = (process.env.PATH ?? '')
      .split(':')
      .filter((entry) => !entry.includes('node_modules/.bin'))
      .join(':');
    const operator = execFileSync('sh', ['-c', 'command -v claude'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: stripped },
    }).trim();
    const underTest = execFileSync('sh', ['-c', 'command -v claude'], { encoding: 'utf8' }).trim();

    assert.equal(
      underTest,
      operator,
      `this tier is testing ${underTest} (${versionOf(underTest)}) while the driver runs ` +
        `${operator} (${versionOf(operator)}). npm prepends every ancestor node_modules/.bin to PATH, ` +
        'so a stale Claude Code installed as a dependency anywhere above this directory shadows the ' +
        'real one — and every result in this tier would describe a binary the product never runs. ' +
        'Remove the shadowing install, or run the live tier with `node --test test/live/*.test.mjs`.',
    );
  });

  it('reports a version, so an unrunnable binary fails here rather than inside a contract test', () => {
    // A failure to execute should name itself once, not appear as four unrelated contract
    // failures whose message is whatever the CLI printed.
    assert.match(versionOf('claude'), /\d+\.\d+\.\d+/);
  });

  it('completes a non-interactive call, which reporting a version does not establish', { timeout: 120_000 }, async () => {
    // **The run boundary's authentication probe, against the real binary** (PLAN item 141). Its
    // whole contract — that a signed-in CLI exits zero and returns a parseable envelope for a
    // trivial `-p` prompt — is owned by another program, and §11.1 is explicit that such a thing
    // needs one live check rather than more assertions. The tier-2 fixture proves the refusal path
    // against a counterfeit; only this proves the accepting path against the article.
    //
    // It is also the case that would catch the probe becoming permanently wrong: if a future CLI
    // stopped emitting the envelope this reads, every run on earth would refuse at the boundary,
    // and the failure would arrive here first.
    const verdict = await proveClaudeAuth(process.env);
    assert.equal(verdict.ok, true, JSON.stringify(verdict));
  });
});
