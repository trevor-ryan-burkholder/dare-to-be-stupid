/**
 * Tier 2 — a guard refusal survives a child that recovered and exited zero (REVIEW F36).
 *
 * **Why no unit test can hold this.** `shell` discards stderr on success — deliberately, because a
 * successful command's diagnostics are not evidence and a consumer that learned to read them would
 * be reading whatever a tool happened to warn about. But a denied tool call *does not fail a child*:
 * the guard says no, the model carries on, and the process exits zero. So the one diagnostic the
 * loop can act on lived on the one stream that path throws away.
 *
 * The test that covered this injected denial text through a **failed synthetic shell result**, which
 * is the production path's opposite. It passed for years against a hole. What settles it is a real
 * process that really writes to stderr and really exits zero, which is what runs below.
 *
 * Needs `node`. No network, no API, no money.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { DENIAL_LIMIT, shell } from '../../scripts/driver.mjs';

/** @type {string[]} */
const temporaryDirs = [];

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * A real child that writes the given stderr lines and then exits with the given code.
 *
 * @param {{ stderr: string[], stdout?: string, code?: number }} parts
 * @returns {string} the script path
 */
function child(parts) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-denial-'));
  temporaryDirs.push(dir);
  const file = path.join(dir, 'child.mjs');
  writeFileSync(
    file,
    [
      `for (const line of ${JSON.stringify(parts.stderr)}) process.stderr.write(line + '\\n');`,
      `process.stdout.write(${JSON.stringify(parts.stdout ?? 'done')});`,
      `process.exit(${parts.code ?? 0});`,
    ].join('\n'),
    'utf8',
  );
  return file;
}

const DENIAL = 'meeseeks-guard: denied Write to .meeseeks/state.json';

describe('a guard denial survives the exit status it actually arrives on', () => {
  it('preserves the refusal from a child that recovered and exited zero', async () => {
    // The reproduction. Before this, `shell` returned `stderr: ''` here and the refusal was gone
    // before anything could carry it into the next brief — so the builder repeated the denied
    // action with no explanation available, losing both the progress and the forensic record.
    const result = await shell(process.execPath, [child({ stderr: [DENIAL] })], { cwd: os.tmpdir() });

    assert.equal(result.ok, true, 'a recovered child was reported as a failure');
    assert.equal(result.status, 0);
    assert.deepStrictEqual(result.denials, [DENIAL]);
    // And ordinary stderr is still discarded on success: only the guard signal crosses.
    assert.equal(result.stderr, '');
  });

  it('does not turn an ordinary successful child’s stderr into evidence', async () => {
    // The neighbour that makes the channel mean something. A build tool warning on stderr must not
    // become a field the loop reads, or every npm warning becomes a decision input.
    const noisy = child({ stderr: ['npm warn Unknown user config "user"', 'webpack: 3 assets emitted'] });
    const result = await shell(process.execPath, [noisy], { cwd: os.tmpdir() });

    assert.equal(result.ok, true);
    assert.equal(result.stderr, '');
    assert.equal(result.denials, undefined, 'ordinary stderr reached the denial channel');
  });

  it('preserves the refusal from a child that failed, which is the path that always worked', async () => {
    const result = await shell(process.execPath, [child({ stderr: [DENIAL], code: 9 })], { cwd: os.tmpdir() });

    assert.equal(result.ok, false);
    assert.equal(result.status, 9);
    assert.deepStrictEqual(result.denials, [DENIAL]);
    // A failing child still returns its whole stderr, which is unchanged behaviour.
    assert.equal(result.stderr.includes(DENIAL), true);
  });

  it('says one refusal once, and stops at the cap, on the real path', async () => {
    // The bounds are asserted against a real stream rather than a string in a unit test, because
    // this text reaches a builder's brief and the child is what actually produces it.
    const repeated = child({ stderr: Array.from({ length: 40 }, () => DENIAL) });
    assert.deepStrictEqual((await shell(process.execPath, [repeated], { cwd: os.tmpdir() })).denials, [DENIAL]);

    const many = child({
      stderr: Array.from({ length: DENIAL_LIMIT + 5 }, (_unused, index) => `${DENIAL}.${index}`),
    });
    assert.equal((await shell(process.execPath, [many], { cwd: os.tmpdir() })).denials?.length, DENIAL_LIMIT);
  });

  it('finds a refusal among the noise a real toolchain emits around it', async () => {
    const mixed = child({
      stderr: ['npm warn Unknown user config "user"', DENIAL, 'vitest: 12 passed', `${DENIAL} (again)`],
    });
    const result = await shell(process.execPath, [mixed], { cwd: os.tmpdir() });
    assert.deepStrictEqual(result.denials, [DENIAL, `${DENIAL} (again)`]);
  });
});
