/**
 * The sealed binary, proved where it can only be proved: a real launcher on a real PATH.
 *
 * `spawnClaude` has verified a seal before every child since 0.249.0, and eleven red proofs held
 * that door shut. Every one of them handed it a seal directly. **No production path ever did** —
 * `options.seal` was `undefined` in every real run, so the check was skipped, and nothing in three
 * tiers could see it because the only thing missing was a caller. `sealTarget` was exported,
 * documented in `DESIGN.md` §3.5.1 as the mechanism a four-hour run depends on, and dead.
 *
 * These cases drive the **real entrypoint with no injected spawner**, which is the only arrangement
 * in which a run resolves, seals and re-verifies a binary of its own. A fake `claude` is a real
 * file on a real PATH here, not a stub object.
 *
 * It is deliberately a *script launcher delegating to a node file*, because that is the install
 * form npm produces, it is the form whose bytes can stay identical while the code it runs changes,
 * and it is therefore the only fake that can commit failure mode 5 against itself.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { main } from '../../scripts/driver.mjs';

/** @type {string[]} */
const temporaryDirs = [];
after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** @param {string} root @param {string[]} args @returns {string} */
function git(root, args) {
  return execFileSync('git', args, { cwd: root, stdio: 'pipe', encoding: 'utf8' }).trim();
}

/** @returns {string} */
function repo() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-seal-run-'));
  temporaryDirs.push(root);
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'test']);
  writeFileSync(path.join(root, 'PRD.md'), '# Thing\n\n## Requirements\n\nPRD-1.1 It exists.\n');
  writeFileSync(path.join(root, '.gitignore'), '.meeseeks/\nnode_modules/\n*.log\n');
  mkdirSync(path.join(root, '.meeseeks'), { recursive: true });
  writeFileSync(
    path.join(root, '.meeseeks', 'config.json'),
    JSON.stringify({ maxIterations: 1, tokenCeiling: 2000, costCeiling: 1, qualityPlugins: [] }),
  );
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'prd']);
  return root;
}

/**
 * A fake `claude` that is a real, sealable npm-shaped launcher.
 *
 * @param {{ tamper?: boolean, bounded?: boolean, mute?: boolean }} [shape]
 *   `tamper` makes the delegated file rewrite itself on its first `-p` call — a child changing the
 *   binary the *next* role would run, which is the attack the seal exists to refuse. `bounded:
 *   false` makes the launcher delegate to something the parser cannot read, which the compatibility
 *   policy refuses outright rather than sealing approximately. `mute` answers `--version` and then
 *   fails every `-p` call, which is how an installation nobody has signed in to looks from outside.
 * @returns {{ dir: string, calls: string }}
 */
function fakeClaude(shape = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-seal-bin-'));
  temporaryDirs.push(dir);
  const impl = path.join(dir, 'claude-impl.js');
  const calls = path.join(dir, 'calls.log');

  const launcher = path.join(dir, 'claude');
  writeFileSync(
    launcher,
    shape.bounded === false
      ? // No quoted `.js` anywhere, so `delegatedEntrypoint` returns null rather than guessing.
        //
        // **It still records every `-p` invocation**, and that is not decoration. An adversarial
        // review found that the earlier version never wrote `calls.log` at all, so the case's
        // `childrenSpawned(calls) === 0` was true because the file did not exist rather than because
        // no role ran — it would have passed with the seal check deleted. Now the launcher logs, so
        // zero role calls is a measurement.
        `#!/bin/sh\nfor a in "$@"; do [ "$a" = "--version" ] && { echo "2.1.230 (Claude Code)"; exit 0; }; done\nprintf 'p\\n' >> ${JSON.stringify(calls)}\necho '{"is_error":false,"result":"built","total_cost_usd":0,"usage":{"input_tokens":1,"output_tokens":1}}'\n`
      : `#!/bin/sh\nexec node ${JSON.stringify(impl)} "$@"\n`,
    'utf8',
  );
  chmodSync(launcher, 0o755);

  writeFileSync(
    impl,
    [
      "const { appendFileSync, readFileSync, writeFileSync } = require('node:fs');",
      "const args = process.argv.slice(2);",
      "if (args.includes('--version')) { process.stdout.write('2.1.230 (Claude Code)\\n'); process.exit(0); }",
      // **The authentication probe is recorded apart from the roles.** It is a real `-p` call and it
      // happens first, so counting it as a child would have quietly turned the tampering case below
      // into a test of the probe rewriting the binary before any role existed — which still refuses,
      // and still passes, and no longer means what the case says it means.
      "const prompt = args[args.indexOf('-p') + 1] || '';",
      `appendFileSync(${JSON.stringify(calls)}, /one word: ready/.test(prompt) ? 'auth\\n' : 'p\\n');`,
      shape.mute === true
        ? // Answers --version, cannot complete a call. An installation nobody has signed in to
          // behaves this way from the outside, and the probe is deliberately not in the business of
          // recognising *why* — only that the capability is absent.
          "process.stderr.write('Invalid API key'); process.exit(1);"
        : '',
      shape.tamper === true
        ? // Exactly once, and only on a *role* call, so the second child is the one that meets a
          // changed binary. Rewriting on every call would still refuse, but it would not show which
          // child was stopped.
          `if (!/one word: ready/.test(prompt) && readFileSync(${JSON.stringify(calls)}, 'utf8').trim().split('\\n').filter((l) => l === 'p').length === 1) {\n` +
          `  writeFileSync(${JSON.stringify(impl)}, readFileSync(${JSON.stringify(impl)}, 'utf8') + '\\n// tampered\\n');\n` +
          `}`
        : '',
      "process.stdout.write(JSON.stringify({ is_error: false, result: 'Designed.\\n\\n```json\\n{\"capabilities\": [\"cli\"]}\\n```\\n', total_cost_usd: 0, usage: { input_tokens: 1, output_tokens: 1 }, modelUsage: { 'claude-sonnet-5': {} } }) + '\\n');",
    ].join('\n'),
    'utf8',
  );

  return { dir, calls };
}

/** @param {string} root @param {string} binDir @returns {Promise<{ code: number, logs: string[] }>} */
async function run(root, binDir) {
  /** @type {string[]} */
  const logs = [];
  const code = await main(['PRD.md', '--yes'], {
    cwd: root,
    // The fake first on a real PATH. `realSealIo` threads this environment into its own
    // `command -v`, which is the only reason the resolution half of the seal is reachable at all.
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
      MEESEEKS_RUNNING: undefined,
      MEESEEKS_STYLE: 'plain',
    },
    log: (/** @type {string} */ line) => logs.push(line),
  });
  return { code, logs };
}

/** Role children only. The authentication probe is a `-p` call too, and it is not a role. */
function childrenSpawned(/** @type {string} */ file) {
  return callsOf(file).filter((line) => line === 'p').length;
}

/** @param {string} file @returns {string[]} */
function callsOf(file) {
  if (!existsSync(file)) return [];
  const text = readFileSync(file, 'utf8').trim();
  return text === '' ? [] : text.split('\n');
}

describe('a run seals the binary it spawns children from', () => {
  it('refuses at the boundary when the invocation closure cannot be bounded', async () => {
    const { dir, calls } = fakeClaude({ bounded: false });
    const { code, logs } = await run(repo(), dir);

    assert.equal(code, 1, logs.join('\n'));
    assert.equal(
      logs.some((line) => line.includes('cannot seal its Claude binary')),
      true,
      logs.join('\n'),
    );
    // Before the lock, before any child. A refusal that happened after a role had already run
    // would report the same exit code.
    assert.equal(childrenSpawned(calls), 0, 'a child ran against a binary the run could not seal');
  });

  it('refuses before any role runs when the binary cannot complete a call', async () => {
    // **The gap DESIGN.md §3.5 documented rather than closed.** `claude --version` succeeds against
    // an installation nobody has signed in to, so authentication used to surface at the first real
    // role — after the lock, after the state, and on an unattended run, after everybody had gone to
    // bed. The probe is one small call at the boundary and it fails at hour zero instead.
    const root = repo();
    const { dir, calls } = fakeClaude({ mute: true });
    const { code, logs } = await run(root, dir);

    assert.equal(code, 1, logs.join('\n'));
    assert.equal(logs.some((line) => line.includes('could not complete a call')), true, logs.join('\n'));
    // The failure is reported verbatim, so an operator can see what the binary actually said rather
    // than this repository's guess about which of several causes it was.
    assert.equal(logs.some((line) => line.includes('Invalid API key')), true, logs.join('\n'));
    assert.equal(childrenSpawned(calls), 0, 'a role ran against a binary that could not authenticate');
    // **This used to assert that `.meeseeks/lock.json` was absent, and it proved nothing.** The
    // probe runs *after* the lock is acquired, and `releasing` deletes the lock on the way out, so
    // an absent lock file discriminates only whether the run released what it took. It would have
    // stayed green with the probe moved anywhere at all.
    //
    // What the probe actually guarantees is that no *role* ran, which the assertion above holds.
    // The lock is checked for the property it really has: released, not leaked.
    assert.equal(
      existsSync(path.join(root, '.meeseeks', 'lock.json')),
      false,
      'the run refused and left its lock behind, so the next run would find a stale one',
    );
  });

  it('runs children against a binary it could seal, so the refusal above is not a broken fake', async () => {
    // **The neighbour.** Without it, a boundary that refused every install form would score exactly
    // as well as one that refuses the right one — and it also proves the fake is a working CLI, so
    // the count the tampering case depends on means something.
    const { dir, calls } = fakeClaude();
    const { logs } = await run(repo(), dir);

    assert.equal(
      logs.some((line) => line.includes('cannot seal its Claude binary')),
      false,
      logs.join('\n'),
    );
    assert.equal(childrenSpawned(calls) >= 2, true, `the run spawned ${childrenSpawned(calls)} children, so the case below cannot mean anything`);
    // And the probe ran, exactly once, before any of them. Without this the refusal case above
    // could pass against a boundary that refused that binary for some entirely different reason.
    assert.deepEqual(callsOf(calls).slice(0, 1), ['auth'], callsOf(calls).join(','));
    assert.equal(callsOf(calls).filter((line) => line === 'auth').length, 1, 'the run probed authentication more than once');
  });

  it('stops the next child when a child rewrote the binary the next one would run', async () => {
    // Failure mode 5, committed for real: the launcher's own bytes and reported version never move
    // while the file it delegates to does. This is the case a version check cannot see, and the
    // reason the seal binds a closure rather than one file.
    const { dir, calls } = fakeClaude({ tamper: true });
    const { logs } = await run(repo(), dir);

    assert.equal(
      childrenSpawned(calls),
      1,
      `${childrenSpawned(calls)} children ran; the second was spawned against a binary that had changed underneath it`,
    );
    assert.equal(
      logs.some((line) => line.includes('failed')),
      true,
      logs.join('\n'),
    );
  });
});
