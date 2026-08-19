/**
 * Tier 2 — the cross-repository nesting attack, run for real (REVIEW F42).
 *
 * **What Codex reproduced.** A Builder holds the installed Driver's path — it is in the settings and
 * argv it was handed — so it can start a whole second run itself. Two commands were enough, and both
 * were allowed:
 *
 *     env -u MEESEEKS_RUNNING node /plugin/scripts/driver.mjs PRD.md --yes
 *     MEESEEKS_GIVE_THEM_THE_BOX=1 MEESEEKS_RUN_DEPTH=0 node /plugin/scripts/driver.mjs PRD.md --yes
 *
 * The first clears the marker so the new Driver reads itself as top level; the second forges the
 * operator's permission and resets the depth, at every generation, without ever putting the flag on
 * argv. Pointed at *another* repository, the current repository's lock is irrelevant and one
 * unattended task becomes unbounded paid fan-out.
 *
 * **Why tier 1 cannot close it.** The unit tests call `assertNotNested` with marker maps this file's
 * author wrote. The question here is what the shipped entrypoint does when a real process really
 * starts it with a hostile environment, in a repository that is not the parent's — so the Driver is
 * spawned as a real child, from repository A, against repository B, with a fake `claude` first on
 * `PATH` that records every invocation. A spend that never happens is the point, and the sentinel is
 * how it is proved rather than assumed.
 *
 * Real git, real node, a real Driver process, a counterfeit `claude`. No network, no API, no money.
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

import { BOX_ENV, DEPTH_ENV, REENTRANCY_ENV, authorizedNestingEnv } from '../../scripts/driver.mjs';
import { NESTING_AUTHORITY_ENV, NESTING_FILE, NESTING_TICKET_ENV } from '../../scripts/nesting.mjs';
import { LAUNCH_RECEIPT_FILE } from '../../scripts/launch.mjs';
import { RUN_LOCK_FILE } from '../../scripts/run-lock.mjs';

const DRIVER = fileURLToPath(new URL('../../scripts/driver.mjs', import.meta.url));
const GUARD = fileURLToPath(new URL('../../hooks/guard.mjs', import.meta.url));

/** @type {string[]} */
const temporaryDirs = [];

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** @returns {string} */
function scratch() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-nesting-'));
  temporaryDirs.push(dir);
  return dir;
}

/** @param {string} root @param {string[]} args @returns {string} */
const git = (root, args) => execFileSync('git', args, { cwd: root, stdio: 'pipe', encoding: 'utf8' }).trim();

/**
 * A committed repository with a PRD, ready for a run that must never start.
 *
 * @param {string} label
 * @returns {string}
 */
function repo(label) {
  const root = path.join(scratch(), label);
  mkdirSync(root, { recursive: true });
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'test']);
  writeFileSync(path.join(root, '.gitignore'), '.meeseeks/\nnode_modules/\n');
  writeFileSync(path.join(root, 'README.md'), `# ${label}\n`);
  writeFileSync(path.join(root, 'PRD.md'), '# Victim\n\n## Requirements\n\nPRD-1.1 It prints the time.\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'base']);
  return root;
}

/**
 * A counterfeit `claude` that records the fact it was called and returns a plausible envelope.
 *
 * It is first on `PATH`, so *any* paid child the Driver tries to spawn lands here instead. The
 * recording is the assertion: `no paid child is spawned` is only evidence if something was watching
 * the place a child would have appeared.
 *
 * @returns {{ bin: string, calls: () => string[] }}
 */
function counterfeitClaude() {
  const dir = scratch();
  const ledger = path.join(dir, 'calls.log');
  const bin = path.join(dir, 'bin');
  mkdirSync(bin, { recursive: true });
  const script = path.join(bin, 'claude');
  writeFileSync(
    script,
    [
      '#!/bin/sh',
      `printf '%s\\n' "$*" >> ${JSON.stringify(ledger)}`,
      `echo '{"type":"result","subtype":"success","is_error":false,"result":"","total_cost_usd":0.01}'`,
      'exit 0',
    ].join('\n'),
    { mode: 0o755 },
  );
  return {
    bin,
    calls: () => (existsSync(ledger) ? readFileSync(ledger, 'utf8').split('\n').filter(Boolean) : []),
  };
}

/**
 * Start the shipped Driver as a real process, the way a Builder's Bash call would.
 *
 * @param {{ cwd: string, env: Record<string, string | undefined>, bin: string, args?: string[] }} attack
 * @returns {{ status: number | null, stdout: string, stderr: string }}
 */
function launchDriver(attack) {
  const result = spawnSync(process.execPath, [DRIVER, ...(attack.args ?? ['PRD.md', '--yes'])], {
    cwd: attack.cwd,
    encoding: 'utf8',
    timeout: 60_000,
    env: {
      ...process.env,
      ...attack.env,
      PATH: `${attack.bin}${path.delimiter}${process.env.PATH ?? ''}`,
      MEESEEKS_STYLE: 'plain',
    },
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

describe('a Builder cannot start a Driver against another repository (REVIEW F42)', () => {
  for (const [label, hostile] of /** @type {[string, Record<string, string | undefined>][]} */ ([
    ['a forged flag and a reset depth', { [REENTRANCY_ENV]: '1', [BOX_ENV]: '1', [DEPTH_ENV]: '0' }],
    ['a forged flag alone', { [REENTRANCY_ENV]: '1', [BOX_ENV]: '1' }],
    ['a forged flag and a depth already at the cap', { [REENTRANCY_ENV]: '1', [BOX_ENV]: '1', [DEPTH_ENV]: '2' }],
    ['no flag at all, which is the ordinary nested case', { [REENTRANCY_ENV]: '1' }],
  ])) {
    it(`refuses ${label}, before preflight and before any child`, () => {
      const parent = repo('parent');
      const victim = repo('victim');
      // The parent's own state, so "the parent run remains healthy" is a comparison and not a hope.
      const parentState = path.join(parent, '.meeseeks');
      mkdirSync(parentState, { recursive: true });
      writeFileSync(path.join(parentState, 'state.json'), JSON.stringify({ passing: ['a'] }), 'utf8');
      const before = readFileSync(path.join(parentState, 'state.json'), 'utf8');

      const claude = counterfeitClaude();
      const run = launchDriver({ cwd: victim, env: hostile, bin: claude.bin });
      const output = `${run.stdout}${run.stderr}`;

      assert.notEqual(run.status, 0, `the attack succeeded:\n${output}`);
      assert.equal(
        output.includes('Nested runs are refused at the driver and at the guard hook'),
        true,
        `refused for some other reason:\n${output}`,
      );

      // No paid child. The counterfeit is first on PATH, so a spawn would have been recorded.
      assert.deepStrictEqual(claude.calls(), [], 'the nested Driver spawned a paid child');

      // No preflight: a run that got that far leaves a launch receipt and takes the lock.
      const victimState = path.join(victim, '.meeseeks');
      assert.equal(existsSync(path.join(victimState, LAUNCH_RECEIPT_FILE)), false, 'a launch receipt was written');
      assert.equal(existsSync(path.join(victimState, RUN_LOCK_FILE)), false, 'the victim repository was locked');
      // Nothing was committed into the victim either — its history is exactly what it was.
      assert.equal(git(victim, ['rev-list', '--count', 'HEAD']), '1');
      assert.equal(git(victim, ['status', '--porcelain']), '');

      // And the parent is untouched: no authority minted, no state rewritten.
      assert.equal(readFileSync(path.join(parentState, 'state.json'), 'utf8'), before);
      assert.equal(existsSync(path.join(parentState, NESTING_FILE)), false, 'the attack minted nesting authority');
    });
  }

  it('refuses a nonce the attacker invented, and one it copied from a sibling store', () => {
    // The ticket is the authority now, so the attack moves to the ticket. Neither shape survives: a
    // nonce nobody issued names no record, and a store the attacker wrote itself is not the store the
    // parent's `.meeseeks/` holds — the guard refuses a child any write under that directory at all.
    const victim = repo('victim');
    const forgedStore = scratch();
    writeFileSync(
      path.join(forgedStore, NESTING_FILE),
      JSON.stringify({ version: 1, tickets: [{ nonce: 'forged', depth: 1, issuedAt: '2026-08-19T00:00:00.000Z', consumedAt: null }] }),
      'utf8',
    );
    const claude = counterfeitClaude();

    for (const hostile of [
      { [REENTRANCY_ENV]: '1', [NESTING_AUTHORITY_ENV]: forgedStore, [NESTING_TICKET_ENV]: 'nobody-issued-this' },
      { [REENTRANCY_ENV]: '1', [NESTING_AUTHORITY_ENV]: path.join(victim, '.meeseeks'), [NESTING_TICKET_ENV]: 'forged' },
    ]) {
      const run = launchDriver({ cwd: victim, env: hostile, bin: claude.bin });
      const output = `${run.stdout}${run.stderr}`;
      assert.notEqual(run.status, 0, `the attack succeeded:\n${output}`);
      assert.equal(output.includes('Nested runs are refused'), true, output);
    }
    assert.deepStrictEqual(claude.calls(), [], 'a forged ticket spawned a paid child');
  });

  it('starts an ordinary top-level run in the same repository, which is the neighbour', () => {
    // **Refusing everything is not a fix.** With no run marker in the environment this is an operator
    // at a prompt, and it must get past `assertNotNested`. Asserted by the message it stops on
    // instead: a *later* refusal, from configuration loading, which only a run that cleared the
    // nesting check ever reaches. Asserting merely that the nesting message is absent would pass for
    // a Driver that died on its first line.
    const victim = repo('victim');
    const claude = counterfeitClaude();
    const run = launchDriver({
      cwd: victim,
      env: { [REENTRANCY_ENV]: undefined, [BOX_ENV]: undefined, [DEPTH_ENV]: undefined },
      bin: claude.bin,
    });
    const output = `${run.stdout}${run.stderr}`;
    assert.equal(output.includes('Nested runs are refused'), false, `a top-level run was refused as nested:\n${output}`);
    assert.equal(output.includes('meeseeks init'), true, `the run stopped before configuration:\n${output}`);
  });

  it('lets a component redeem the ticket its parent issued, which is the operator’s real path', () => {
    // The other neighbour, and the load-bearing one: the repair must not make `--give-them-the-box`
    // useless. A ticket minted the way the component phase mints one carries a run marked as nested
    // straight past `assertNotNested` and on to the same configuration refusal a top-level run gets.
    const victim = repo('victim');
    const parentState = path.join(scratch(), '.meeseeks');
    mkdirSync(parentState, { recursive: true });
    const authorized = authorizedNestingEnv({ meeseeksDir: parentState, parentDepth: 0, env: {} });
    const claude = counterfeitClaude();

    const run = launchDriver({
      cwd: victim,
      env: { ...authorized, [REENTRANCY_ENV]: '1', [BOX_ENV]: '1', [DEPTH_ENV]: '1' },
      bin: claude.bin,
    });
    const output = `${run.stdout}${run.stderr}`;
    assert.equal(output.includes('Nested runs are refused'), false, `an authorized component was refused:\n${output}`);
    assert.equal(output.includes('meeseeks init'), true, `the component stopped before configuration:\n${output}`);

    // And the ticket is spent: the same environment a second time is an ordinary forgery.
    const replay = launchDriver({
      cwd: victim,
      env: { ...authorized, [REENTRANCY_ENV]: '1', [BOX_ENV]: '1', [DEPTH_ENV]: '1' },
      bin: claude.bin,
    });
    assert.equal(
      `${replay.stdout}${replay.stderr}`.includes('Nested runs are refused'),
      true,
      'a consumed ticket was accepted a second time by a real Driver process',
    );
    assert.deepStrictEqual(claude.calls(), [], 'a paid child was spawned by a run that never had a config');
  });
});

describe('the guard refuses the same attack it can see (REVIEW F42)', () => {
  /** @param {string} command @returns {{ decision: string, rule: string | null }} */
  function ruling(command) {
    const payload = JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command },
      cwd: os.tmpdir(),
    });
    const result = spawnSync(process.execPath, [GUARD], {
      input: payload,
      encoding: 'utf8',
      timeout: 30_000,
      env: { ...process.env, [REENTRANCY_ENV]: '1' },
    });
    assert.equal(result.status, 0, `the guard itself failed: ${result.stderr}`);
    if ((result.stdout ?? '').trim() === '') return { decision: 'allow', rule: null };
    const parsed = JSON.parse(result.stdout);
    const reason = parsed.hookSpecificOutput.permissionDecisionReason;
    const rule = /\[meeseeks:([^\]]+)\]/.exec(reason);
    return { decision: parsed.hookSpecificOutput.permissionDecision, rule: rule === null ? null : rule[1] };
  }

  it('denies the marker-clearing form, which the Driver alone cannot see', () => {
    // **This is the half only the guard can hold.** `env -u MEESEEKS_RUNNING` leaves the new Driver
    // reading itself as an honest top-level run — correctly, from where it stands. The refusal has to
    // happen at the tool call, which is why the finding requires both enforcement points.
    assert.deepStrictEqual(ruling('env -u MEESEEKS_RUNNING node /plugin/scripts/driver.mjs PRD.md --yes'), {
      decision: 'deny',
      rule: 'nested-meeseeks',
    });
  });

  it('denies the forged-permission form through a real hook process', () => {
    assert.deepStrictEqual(
      ruling('MEESEEKS_GIVE_THEM_THE_BOX=1 MEESEEKS_RUN_DEPTH=0 node /plugin/scripts/driver.mjs PRD.md --yes'),
      { decision: 'deny', rule: 'nested-meeseeks' },
    );
  });

  it('lets an ordinary node command through, so the hook is not simply refusing', () => {
    assert.deepStrictEqual(ruling('node scripts/build.mjs --watch'), { decision: 'allow', rule: null });
  });
});
