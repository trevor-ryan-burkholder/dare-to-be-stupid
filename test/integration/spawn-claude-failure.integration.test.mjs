/**
 * Tier 2 — a failed child keeps its own failure kind (REVIEW F7, DESIGN.md §11.1).
 *
 * **`spawnClaude` used to consult `result.ok` only when stdout happened to be empty.** Every other
 * failed process had its verdict *overwritten* by whatever its stdout parsed as: Codex injected
 * `ok:false`, status 9, stderr `process failed` and stdout
 * `{"is_error":false,"result":"claimed success"}`, and got back `ok:true` with text
 * `claimed success`. Process failure is boundary evidence a child cannot revoke by describing
 * itself favourably, and laundering it can accept a partial PRD, design declaration, builder
 * response or panel verdict.
 *
 * The unit suite drives that through an injected `ShellResult`, which proves the *decision*. What it
 * cannot prove is that a real process really produces those shapes — that a child which prints a
 * valid envelope and then exits 9 arrives as `ok:false` with the envelope intact, and that one which
 * floods past the 64MB cap arrives flagged `overflowed` rather than as an ordinary failure. Those
 * are facts about `shell`, the operating system, and the pipe between them.
 *
 * The binary under test is substituted for a node script rather than `claude`, so this exercises the
 * whole real path — spawn, exit codes, the cap, the sweep — and costs nothing. The contract owned by
 * the *actual* CLI is `test/live/`'s job, and its mandatory run is recorded with this slice.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { shell, spawnClaude } from '../../scripts/driver.mjs';

/** @type {string[]} */
const temporaryDirs = [];

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

const SUCCESS_ENVELOPE = JSON.stringify({
  is_error: false,
  result: 'claimed success',
  total_cost_usd: 0.25,
  usage: { input_tokens: 100, output_tokens: 50 },
});

/**
 * Run `spawnClaude` against a real process that is not `claude`.
 *
 * The seam is `options.run`, which `spawnClaude` already exposes for exactly this: everything below
 * it — the spawn, the pipes, the exit code, the output cap — is the production `shell`.
 *
 * @param {string} source the stand-in child's program
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<import('../../scripts/driver.mjs').ClaudeResult>}
 */
function spawnStandIn(source, options = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-child-'));
  temporaryDirs.push(dir);
  const script = path.join(dir, 'stand-in.mjs');
  writeFileSync(script, source, 'utf8');
  return spawnClaude({
    prompt: 'do the thing',
    model: 'claude-opus-5',
    phase: 'builder',
    cwd: dir,
    env: {},
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    run: (_command, _args, runOptions) => shell(process.execPath, [script], runOptions),
  });
}

describe('a real child that answers well and then fails', () => {
  it('stays failed when it prints a valid envelope and exits nonzero', async () => {
    // The reproduction against a real process rather than an injected record.
    const result = await spawnStandIn(
      `process.stdout.write(${JSON.stringify(SUCCESS_ENVELOPE)});\nprocess.exit(9);\n`,
    );
    assert.equal(result.ok, false, 'a process that exited 9 was reported as a successful role');
    assert.equal(result.text, '', 'a failed child supplied text a role would have acted on');
  });

  it('still records what that failed child cost, because the money was spent', async () => {
    const result = await spawnStandIn(
      `process.stdout.write(${JSON.stringify(SUCCESS_ENVELOPE)});\nprocess.exit(9);\n`,
    );
    assert.equal(result.costUsd, 0.25);
    assert.equal(result.tokens, 150);
  });

  it('stays failed when a signal kills it after it answered', async () => {
    const result = await spawnStandIn(
      `process.stdout.write(${JSON.stringify(SUCCESS_ENVELOPE)});\n` +
        'setTimeout(() => process.kill(process.pid, "SIGKILL"), 20);\n',
    );
    assert.equal(result.ok, false);
    assert.equal(result.text, '');
  });

  it('keeps the output cap as its own kind, not as an ordinary failure', async () => {
    // The most dangerous of the four, and the one with no distinct field at all before this: the
    // envelope is printed *first*, so it survives inside the truncated stdout and parses cleanly.
    const result = await spawnStandIn(
      `process.stdout.write(${JSON.stringify(SUCCESS_ENVELOPE)});\n` +
        'const block = "x".repeat(1024 * 1024);\n' +
        'for (let written = 0; written < 70; written += 1) process.stdout.write(block);\n',
      { timeoutMs: 120_000 },
    );
    assert.equal(result.ok, false, 'a child killed for flooding was reported as a successful role');
    assert.equal(result.text, '');
    assert.equal(result.raw.includes('output cap'), true, result.raw.slice(0, 300));
  });

  it('keeps a timeout as its own kind, and reads nothing the child wrote', async () => {
    const result = await spawnStandIn(
      `process.stdout.write(${JSON.stringify(SUCCESS_ENVELOPE)});\nsetTimeout(() => {}, 600_000);\n`,
      { timeoutMs: 800 },
    );
    assert.equal(result.ok, false);
    assert.equal(result.text, '');
    assert.equal(result.raw.includes('did not return'), true, result.raw.slice(0, 300));
  });

  // The benign neighbour, and the one that decides whether this is a conjunction or a wall.
  it('accepts a real child that answers well and exits zero', async () => {
    const result = await spawnStandIn(`process.stdout.write(${JSON.stringify(SUCCESS_ENVELOPE)});\n`);
    assert.equal(result.ok, true, result.raw.slice(0, 300));
    assert.equal(result.text, 'claimed success');
    assert.equal(result.costUsd, 0.25);
  });

  it('still refuses a real child that exits zero reporting its own error', async () => {
    const envelope = JSON.stringify({ is_error: true, result: 'the model refused' });
    const result = await spawnStandIn(`process.stdout.write(${JSON.stringify(envelope)});\n`);
    assert.equal(result.ok, false);
  });
});
