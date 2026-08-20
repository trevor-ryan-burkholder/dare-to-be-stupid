/**
 * Tier 3 — what an unattended Builder's shell can actually read (REVIEW F5, PLAN item 56).
 *
 * `childEnvironment` used to be `{ ...env, MEESEEKS_RUNNING: '1' }`, so every variable on the
 * operator's machine crossed into every child. No unit test could see the consequence, because the
 * consequence is not a return value: it is what a *different binary* hands to a *third* process. The
 * measurement that opened this item was taken here, against a real `claude -p` on 19 Aug 2026, and
 * it read back a synthetic deploy token, a synthetic database URL, a synthetic AWS secret, and four
 * ambient `CLAUDE_CODE_*`/`MAX_THINKING_TOKENS` control-plane values — each of which can change
 * retry, resume, model routing or budget behaviour underneath a sealed role contract.
 *
 * **Every value here is synthetic and authenticates nothing.** They are named after what a real
 * machine carries because the names are the point; the values are deliberately worthless.
 *
 * **Surface covered: Bash.** That is the surface a Builder uses and the one the finding is about.
 * The hook and stdio-MCP subprocess surfaces item 56 also names are *not* measured here, and
 * `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` is not enabled — its provider coverage and process-lifecycle
 * side effects are unmeasured, and item 84 owns that. What this proves is that the variables never
 * enter the child at all, which no downstream scrub can undo.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { rmSync } from 'node:fs';

import { childEnvironment, spawnClaude } from '../../scripts/driver.mjs';
import { sealedControls } from '../../scripts/claude-seal.mjs';

const ARMED = process.env.MEESEEKS_LIVE === '1';
const LIVE_TIMEOUT = 300_000;

/** @type {string[]} */
const temporaryDirs = [];
after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** Synthetic. None of these authenticate anything, anywhere. */
const SEEDED = {
  ACME_DEPLOY_TOKEN: 'synthetic-not-a-real-token-0001',
  AWS_SECRET_ACCESS_KEY: 'synthetic-not-a-real-secret-0002',
  DATABASE_URL: 'postgres://synthetic:notreal@localhost:5432/none',
  CLAUDE_CODE_SUBAGENT_MODEL: 'synthetic-model-override',
  CLAUDE_CODE_MAX_OUTPUT_TOKENS: '4321',
  MAX_THINKING_TOKENS: '1234',
};

/**
 * The controls {@link sealedControls} pins, seeded with the **opposite** of the sealed value.
 *
 * These are the one category presence cannot judge. A sealed name is *supposed* to reach the child
 * — the Driver puts it there — so "PRESENT" proves nothing about whose value won. This list was
 * previously inside `SEEDED`, asserted absent, and seeded with `'1'`: the same value the seal
 * sets. That case could not distinguish a leak from a seal in either direction, and it failed for
 * the third reason, which is that the Driver had every right to hand the variable over.
 *
 * Seeding the opposite value turns presence into a decidable question. The child reports the value,
 * which is safe to print here precisely because a control knob is not a credential — that is the
 * distinction the presence-only rule below is drawing, not a blanket ban on reading anything.
 *
 * @type {Record<string, string>}
 */
const SEALED_CONFLICT = { DISABLE_AUTOUPDATER: '0', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '0' };

/** Names that must survive, because the run does not work without them. */
const REQUIRED = ['MEESEEKS_RUNNING', 'PATH'];

describe('the child environment boundary', { skip: ARMED ? false : 'MEESEEKS_LIVE is not set' }, () => {
  it('gives a real child no variable the Driver did not choose to hand it', { timeout: LIVE_TIMEOUT }, async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-child-env-'));
    temporaryDirs.push(root);
    writeFileSync(path.join(root, 'README.md'), '# probe\n', 'utf8');

    const names = [...Object.keys(SEEDED), ...REQUIRED];
    const sealed = Object.keys(SEALED_CONFLICT);
    // Presence, never value — for the seeded names. A test that echoed those would print
    // secret-shaped strings into a transcript to prove that secret-shaped strings should not be
    // printed. The sealed controls are read by value on purpose; see SEALED_CONFLICT.
    const result = await spawnClaude({
      prompt:
        'Run exactly this shell command and return its raw output as your entire reply, with no ' +
        'commentary:\n\n' +
        `for n in ${names.join(' ')}; do\n` +
        // **`printenv`, not `${!n+x}`.** The indirect-expansion form is a bashism, and this host's
        // shell is zsh, which answers `bad substitution` — so the child dutifully reported an error
        // and the case could never pass here. It had never been run.
        //
        // `printenv` is also the more correct probe: it reports the *exported environment*, which is
        // exactly what `childEnvironment` decides, while `${!n+x}` asks about shell variables and
        // would answer for a name the shell set itself.
        '  if printenv "$n" >/dev/null 2>&1; then echo "PRESENT $n"; else echo "absent $n"; fi\n' +
        'done\n' +
        `for n in ${sealed.join(' ')}; do\n` +
        '  echo "VALUE $n=$(printenv "$n" 2>/dev/null)"\n' +
        'done\n\nReport the output verbatim.',
      model: 'claude-sonnet-5',
      phase: 'builder',
      effort: 'low',
      cwd: root,
      env: childEnvironment({ ...process.env, ...SEEDED, ...SEALED_CONFLICT }),
    });
    assert.equal(result.ok, true, result.raw.slice(0, 600));

    /** @param {string} name */
    const saw = (name) => new RegExp(`^PRESENT ${name}$`, 'm').test(result.text);
    /** @param {string} name */
    const missed = (name) => new RegExp(`^absent ${name}$`, 'm').test(result.text);

    // The child has to have answered about every name, or "absent" would be indistinguishable from
    // a reply that simply did not mention it — the shape that would make this test pass by silence.
    for (const name of names) {
      assert.equal(saw(name) || missed(name), true, `the child did not report on ${name}:\n${result.text}`);
    }
    for (const name of Object.keys(SEEDED)) {
      assert.equal(missed(name), true, `${name} reached a real Builder's shell:\n${result.text}`);
    }
    for (const name of REQUIRED) {
      assert.equal(saw(name), true, `${name} did not survive the boundary, which breaks the run:\n${result.text}`);
    }

    // The seal beat the operator. Each of these was seeded with the opposite value, so reading the
    // sealed value back is the whole proof: it is not the one the parent process was holding.
    const controls = sealedControls();
    for (const name of sealed) {
      assert.notEqual(
        controls[name],
        SEALED_CONFLICT[name],
        `this case seeds ${name} with the value the seal already sets, so it proves nothing`,
      );
      assert.equal(
        new RegExp(`^VALUE ${name}=${controls[name]}$`, 'm').test(result.text),
        true,
        `${name} did not reach the child as the sealed ${controls[name]}:\n${result.text}`,
      );
    }
  });
});
