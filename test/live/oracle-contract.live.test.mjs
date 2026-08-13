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
      assert.equal(c.expectExit !== null || c.expectStdout !== null || c.relation !== null, true, `${c.id} asserts nothing`);
      assert.equal(c.why.trim() !== '', true, `${c.id} cites no requirement, so nobody can check it`);
    }
    // The exit-code contract is the part of this PRD that is unambiguous, so a suite that never
    // touches it has aimed only at the easy half.
    const exits = new Set(cases.map((c) => c.expectExit));
    assert.equal(exits.has(2) || exits.has(3), true, `no case exercises an error exit: ${[...exits].join(',')}`);

    // R17 / item 14, and the reason it exists is measured rather than supposed. The first armed
    // oracle authored nineteen cases, every one asserting an exit code alone - correctly, by the
    // template's own rule about not guessing an output format. Planting a floating-point
    // accumulation defect into the program those cases judged made it print `{"mean": null}` for
    // two finite inputs at exit 0, and all nineteen still passed. A relation asserts how two runs
    // relate, so it needs no format and catches exactly that.
    //
    // This is the check that the *template* half works. A schema no author writes cases against
    // is dead code, and only a live child can say whether the instruction lands.
    const relations = cases.filter((c) => c.relation !== null);
    assert.equal(
      relations.length > 0,
      true,
      `no case carried a relation, so the suite can only see wrong exit codes: ${cases.map((c) => c.id).join(', ')}`,
    );
    for (const c of relations) {
      assert.equal(
        c.relation !== null && c.relation.argv.length > 0,
        true,
        `${c.id} has a relation with no second invocation`,
      );
    }
  });
});
