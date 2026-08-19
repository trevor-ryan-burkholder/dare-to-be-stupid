/**
 * Tier 3 — does a real loader accept the staged snapshot, and what does it expose? (REVIEW F21)
 *
 * **This is the tier the other four canaries were waiting on.** F25's withheld command, F27's role
 * tools, F28's compatibility floor and F29's reviewer isolation all end in "prove it against the
 * *installed* plugin", and none of them could be written while nothing could produce an installed
 * plugin to point at. `tools/plugin-snapshot.mjs` produces one; this asks a real `claude` to load it.
 *
 * **It never touches the operator's `~/.claude`.** `--plugin-dir <path>` loads a plugin from a
 * directory, so the snapshot is disposable: no install, no marketplace entry, no cache directory,
 * nothing to uninstall afterwards, and no risk of disturbing a plugin the operator actually uses.
 * Measured against `claude` 2.1.235 on 18 August 2026: a staged copy of this repository loaded and
 * answered a prompt.
 *
 * **And it is deliberately less than F21's full acceptance, which is stated here so nobody reads it
 * as more.** `--plugin-dir` is a *session-only inline load*: it reports `Source: meeseeks@inline`
 * and produces no `installed_plugins.json`, no `installPath`, no version-keyed cache directory and
 * no `gitCommitSha`. It therefore cannot prove that `meeseeks@meeseeks` *resolves* to the candidate
 * version and commit, which is the clause F21 turns on. That needs a real install into a disposable
 * config root — `CLAUDE_CONFIG_DIR` is the complete redirect, measured — and PLAN item 75 owns it.
 *
 * **The argv trap is live here too.** The prompt goes on **stdin**, never as an argument, because
 * `--tools` is variadic and swallows the next token — the same defect that once killed every phase
 * but `builder` and bought this repository its live tier. Measured again while writing this file:
 * with the prompt as an argument the child died with *"Input must be provided either through stdin
 * or as a prompt argument"*.
 *
 * Cost: two very small `claude -p` calls on the cheapest model, plus one free `claude plugin
 * validate`. It spends money, so it lives here and is armed by `MEESEEKS_LIVE=1`.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { stageSnapshot, verifySnapshot } from '../../tools/plugin-snapshot.mjs';

const ARMED = process.env.MEESEEKS_LIVE === '1';
const LIVE_TIMEOUT = 300_000;
const MODEL = 'claude-haiku-4-5-20251001';
const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

/** @type {string[]} */
const temporaryDirs = [];

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** A disposable installed snapshot of the current candidate. @returns {string} */
function snapshot() {
  const dest = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-loader-'));
  temporaryDirs.push(dest);
  stageSnapshot({ root: ROOT, dest });
  // The snapshot must be the candidate before any question about it means anything.
  assert.deepStrictEqual(verifySnapshot({ root: ROOT, dest }), []);
  return dest;
}

/**
 * One `claude -p` against the staged plugin, prompt on stdin.
 *
 * @param {{ dir: string, prompt: string, args?: string[] }} options
 * @returns {{ ok: boolean, text: string, raw: string }}
 */
function ask(options) {
  const argv = [
    '--plugin-dir',
    options.dir,
    '-p',
    '--output-format',
    'json',
    '--model',
    MODEL,
    ...(options.args ?? []),
  ];
  /** @type {string} */
  let raw;
  try {
    raw = execFileSync('claude', argv, {
      cwd: options.dir,
      input: options.prompt,
      stdio: 'pipe',
      encoding: 'utf8',
      timeout: LIVE_TIMEOUT,
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    const failure = /** @type {{ stdout?: string, stderr?: string, message: string }} */ (error);
    return { ok: false, text: '', raw: (failure.stdout || failure.stderr || failure.message).slice(0, 800) };
  }
  /** @type {{ is_error?: boolean, result?: string }} */
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, text: '', raw: raw.slice(0, 800) };
  }
  return { ok: parsed.is_error !== true, text: String(parsed.result ?? ''), raw: raw.slice(0, 800) };
}

describe('a real loader reads the staged snapshot', { skip: ARMED ? false : 'MEESEEKS_LIVE is not set' }, () => {
  it('validates the snapshot\u2019s marketplace manifest — which is less than it sounds', () => {
    // Free, and first. **But measured, and it checks less than its name suggests:** with a
    // `.claude-plugin/marketplace.json` present, `claude plugin validate` validates the *marketplace*
    // manifest and never opens `plugin.json` at all. So this is a manifest sanity check, not proof
    // that the plugin is loadable, and it is named for what it does. The loading proof is the case
    // below; the resolution proof needs a real install and is PLAN item 75's remaining half.
    const dir = snapshot();

    const out = execFileSync('claude', ['plugin', 'validate', dir], { stdio: 'pipe', encoding: 'utf8' });

    assert.equal(out.includes('Validation passed'), true, out.slice(0, 600));
  });

  it('loads it and answers, so the snapshot is a plugin a loader accepts', { timeout: LIVE_TIMEOUT }, () => {
    const dir = snapshot();

    const answer = ask({ dir, prompt: 'Answer with the single word LOADED.', args: ['--tools', ''] });

    assert.equal(answer.ok, true, answer.raw);
    assert.equal(answer.text.includes('LOADED'), true, answer.text.slice(0, 300));
  });

  it('withholds /meeseeks from the model’s own skill surface (REVIEW F25)', { timeout: LIVE_TIMEOUT }, () => {
    // **F25's second acceptance clause**, which is the reason this file exists. The frontmatter says
    // `disable-model-invocation: true`; a static test proves the *file* says it, and only a loader
    // can prove the loader honours it. The command grants its turn the Bash permissions to run the
    // driver, so an autonomously selected `/meeseeks` starts an unattended, permission-bypassing
    // loop nobody asked for.
    //
    // Asked of the model rather than of a listing, because what F25 bounds is *Skill selection*.
    // A model that cannot see the skill cannot name it.
    const dir = snapshot();

    const answer = ask({
      dir,
      prompt:
        'List the exact names of every Skill you can invoke, one per line, and nothing else. ' +
        'If you have no skills available, answer with the single word NONE.',
      args: ['--tools', ''],
    });

    assert.equal(answer.ok, true, answer.raw);
    assert.equal(
      /\bmeeseeks\b/i.test(answer.text),
      false,
      `the loader offered the unattended-run command to the model: ${answer.text.slice(0, 400)}`,
    );
  });
});
