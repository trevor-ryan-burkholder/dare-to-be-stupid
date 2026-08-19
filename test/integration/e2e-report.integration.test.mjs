/**
 * Tier 2 — the e2e gate's declared report actually appears on disk (Phase 1, the Playwright hole).
 *
 * **The defect.** `nodeToolchain.reports` and `reportOwners` both declared that the `e2e` operation
 * writes `e2e-report.json`, and the operation was a bare `npx playwright test`. Playwright's json
 * reporter writes to *stdout* unless `PLAYWRIGHT_JSON_OUTPUT_NAME` names a file, so the declared
 * report was never produced. Nothing failed: the gate exited zero, and an absent report whose owning
 * gate did not produce it reads as *unmeasured* rather than regressed (PLAN item 95). The effect was
 * that no Playwright id could ever enter the ratchet — while `templates/builder-system.md` and
 * `templates/frontend-direction.md` both promise the builder that a named Playwright test does. A
 * guarantee with no wiring behind it, silent for 226 versions.
 *
 * **What this tier proves, and what it deliberately does not.** It proves the half that is ours: a
 * variable declared by a toolchain operation survives `gatesFor`, `runGates` and the real `shell`,
 * arrives in the child's environment, and the file it names is what the reporters then read ids
 * from. It does **not** prove that Playwright honours `PLAYWRIGHT_JSON_OUTPUT_NAME` — that contract
 * belongs to another binary, and `DESIGN.md` §11.1's rule from the argv defect is that such a claim
 * is owed one installed check rather than more assertions here. Playwright is not a dependency of
 * this repository and installing one to assert a documented variable would buy a slower suite, not
 * evidence.
 *
 * So `npx` is counterfeit: a script first on `PATH` that writes a real Playwright 1.62.1-shaped
 * report to whatever `PLAYWRIGHT_JSON_OUTPUT_NAME` points at. Everything else — the toolchain, the
 * gate list, the gate runner, the process spawn, the parser — is the real thing.
 *
 * Real node, real shell, counterfeit runner. No network, no API, no money.
 */

import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

import { commandGates, runGates, shell } from '../../scripts/driver.mjs';

/** @type {string[]} */
const temporaryDirs = [];
const originalPath = process.env.PATH;

after(() => {
  process.env.PATH = originalPath;
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * The real committed Playwright 1.62.1 capture, written verbatim by the counterfeit runner.
 *
 * Not a hand-made approximation of one: `CLAUDE.md` requires fixtures over mocks for anything that
 * parses another tool's output, and a first draft of this test invented a plausible-looking report
 * that `parseReport` rejected outright as matching no known reporter. That rejection was correct
 * and is the reason the rule exists.
 *
 * The assertion here is byte equality rather than a parse, because this tier owns *delivery*: that
 * what the runner wrote is what lands at the declared path. Whether those bytes yield ids is
 * `test/reporters`' question, and it answers it against this same file. Parsing it here would also
 * need `rootDir` set to the machine that captured it — the paths inside are absolute — which would
 * make this test assert something about that machine rather than about this one.
 */
const PLAYWRIGHT_REPORT = new URL('../fixtures/reporters/playwright-1.62.1-run1.json', import.meta.url);

/**
 * A workspace whose `npx` is a script that writes the report the environment names.
 * @returns {{ root: string, meeseeksDir: string }}
 */
function workspace() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-e2e-report-'));
  temporaryDirs.push(root);
  const meeseeksDir = path.join(root, '.meeseeks');
  mkdirSync(meeseeksDir, { recursive: true });

  const bin = path.join(root, 'bin');
  mkdirSync(bin, { recursive: true });
  const npx = path.join(bin, 'npx');
  // Writes only when the variable is set and non-empty, so an unset one fails loudly here instead
  // of producing a report by luck. `printf` rather than a heredoc: the payload contains no quotes
  // that would need escaping, and the exit status stays the write's.
  // Exits zero either way, deliberately. A runner that failed loudly on the missing variable would
  // make the gate red and the test would pass for the wrong reason — the defect being reproduced is
  // precisely a gate that succeeds while writing nothing.
  writeFileSync(
    npx,
    `#!/bin/sh
if [ -z "\${PLAYWRIGHT_JSON_OUTPUT_NAME}" ]; then
  echo "PLAYWRIGHT_JSON_OUTPUT_NAME was not set; writing nothing" >&2
  exit 0
fi
cat ${JSON.stringify(fileURLToPath(PLAYWRIGHT_REPORT))} > "\${PLAYWRIGHT_JSON_OUTPUT_NAME}"
`,
    'utf8',
  );
  chmodSync(npx, 0o755);
  process.env.PATH = `${bin}${path.delimiter}${originalPath}`;
  return { root, meeseeksDir };
}

describe('the e2e gate produces the report it declares', () => {
  it('carries PLAYWRIGHT_JSON_OUTPUT_NAME into the child and lands the file the ratchet reads', async () => {
    const { root, meeseeksDir } = workspace();
    const e2e = commandGates(root, meeseeksDir).filter((gate) => gate.name === 'e2e');
    assert.deepStrictEqual(
      e2e.map((gate) => gate.command),
      [['npx', 'playwright', 'test', '--reporter=json']],
    );

    const report = path.join(meeseeksDir, 'e2e-report.json');
    assert.equal(existsSync(report), false, 'the report must not exist before the gate runs');

    const outcome = await runGates(e2e, { cwd: root, run: shell });
    assert.equal(outcome.ok, true, `the counterfeit gate should pass; got ${JSON.stringify(outcome.results)}`);
    assert.equal(existsSync(report), true, 'the declared report was not written — the variable did not arrive');

    // Byte-exact, not merely present. A partial write, a truncation, or a report assembled from
    // stdout instead of the file would all satisfy "exists" and none of them would satisfy this.
    assert.equal(readFileSync(report, 'utf8'), readFileSync(PLAYWRIGHT_REPORT, 'utf8'));
  });

  it('leaves the rest of the environment intact, because a gate variable is not a sandbox', async () => {
    // Handing `shell` the declared pair alone would drop PATH, and the counterfeit `npx` — which
    // lives on PATH and nowhere else — would not be found. That is the failure this merge prevents,
    // and it is worth an assertion rather than a comment: a gate env that replaced rather than
    // merged would still pass the test above on any machine with a real npx installed.
    const { root, meeseeksDir } = workspace();
    const e2e = commandGates(root, meeseeksDir).filter((gate) => gate.name === 'e2e');
    const outcome = await runGates(e2e, { cwd: root, run: shell });
    assert.deepStrictEqual(
      outcome.results.map((result) => [result.name, result.ok, result.status]),
      [['e2e', true, 0]],
    );
  });
});
