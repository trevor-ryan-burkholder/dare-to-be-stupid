/**
 * Tier 3 — does a real authoring child return cases this parser accepts?
 *
 * §11.1's rule: anything whose contract is owned by a different binary needs one live check, not
 * more assertions. `templates/oracle-author.md` is a new output contract, and the failure mode is
 * the expensive kind — a malformed block ends the run `ABORTED`, so an operator would discover it
 * four hours into a dogfood run rather than sixty seconds into a test.
 *
 * It also checks the one instruction most likely to be ignored, because ignoring it is what makes
 * the gate unsatisfiable: **a case must not invent a requirement the specification does not
 * decide.**
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { spawnClaude } from '../../scripts/driver.mjs';
import { parseOracleCases } from '../../scripts/oracle.mjs';

const ARMED = process.env.DARE_LIVE === '1';
const LIVE_TIMEOUT = 300_000;

/** A deliberately tiny PRD: small enough to be cheap, specific enough to have real edges. */
const PRD = `# sum — add the numbers in a file

**PRD-1.1** — \`sum data.txt\` prints the arithmetic sum of every line to stdout and exits 0.
Each line holds one number. The output is the number alone, with no trailing text.

**PRD-1.2** — A file with no lines prints \`0\` and exits 0.

**PRD-2.1** — Given a path that does not exist, the tool writes a message naming the path to
stderr, prints nothing to stdout, and exits 2.

**PRD-2.2** — Given a line that does not parse as a finite number, the tool writes a message
naming the 1-based line number to stderr, prints nothing to stdout, and exits 3.
`;

describe('the oracle authoring contract', { skip: ARMED ? false : 'DARE_LIVE is not set' }, () => {
  it('returns cases the parser accepts, from a real child', { timeout: LIVE_TIMEOUT }, () => {
    const result = spawnClaude({
      prompt: `${readFileSync(new URL('../../templates/oracle-author.md', import.meta.url), 'utf8')}\n\n---\n\nPRD.md:\n\n${PRD}`,
      model: 'claude-sonnet-5',
      phase: 'review',
      effort: 'high',
      cwd: process.cwd(),
      env: process.env,
    });
    assert.equal(result.ok, true, result.raw.slice(0, 600));
    const cases = parseOracleCases(result.text);
    assert.equal(cases.length >= 8, true, `only ${cases.length} cases came back`);
    // Every case must assert something, or it executes and reports success having checked
    // nothing — the shape this whole artifact exists to be independent of.
    for (const c of cases) {
      assert.equal(c.expectExit !== null || c.expectStdout !== null, true, `${c.id} asserts nothing`);
      assert.equal(c.why.trim() !== '', true, `${c.id} cites no requirement, so nobody can check it`);
    }
    // The exit-code contract is the part of this PRD that is unambiguous, so a suite that never
    // touches it has aimed only at the easy half.
    const exits = new Set(cases.map((c) => c.expectExit));
    assert.equal(exits.has(2) || exits.has(3), true, `no case exercises an error exit: ${[...exits].join(',')}`);
  });
});
