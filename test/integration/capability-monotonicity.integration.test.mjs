/**
 * Tier 2 — a builder cannot remove a gate by deleting the file that armed it (REVIEW F13).
 *
 * **Why no unit test can hold this.** `resolveCapabilities` taking an `established` set is unit
 * tested, and that proves nothing about whether `main` *passes* one. F13's defect was precisely a
 * composition: the run-level capability set was already unioned and monotonic, and the quality-gate
 * roster bypassed it by asking `hasFrontend(dir)` about the current tree on every gate pass. Correct
 * primitives, wired around. Same shape as the guard hook, whose logic was right for eleven versions
 * while nothing proved it was invoked.
 *
 * Codex's reproduction, run here against the real driver: the same declaration retained `cli`;
 * adding `index.html` resolved `web-ui, cli`; deleting it resolved `cli` alone, and the design-slop
 * gate armed for a web UI disappeared from the roster.
 *
 * Real git, canned children. No network, no API, no money.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { CAPABILITY_MANIFEST } from '../../scripts/capabilities.mjs';
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

/** A repository whose tree currently shows a web UI. @returns {string} */
function repoWithMarker() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-cap-int-'));
  temporaryDirs.push(root);
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'test']);
  writeFileSync(path.join(root, 'PRD.md'), '# Thing\n\n## Requirements\n\nPRD-1.1 It exists.\n');
  writeFileSync(path.join(root, '.gitignore'), '.meeseeks/\nnode_modules/\n*.log\n');
  // The detection marker, and the whole subject of the finding.
  writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>a ui</title>\n');
  mkdirSync(path.join(root, '.meeseeks'), { recursive: true });
  writeFileSync(
    path.join(root, '.meeseeks', 'config.json'),
    JSON.stringify({ maxIterations: 2, tokenCeiling: 1000, costCeiling: 1, qualityPlugins: [] }),
  );
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'prd and a ui']);
  return root;
}

/** @param {string} root @returns {any} */
const manifest = (root) => JSON.parse(readFileSync(path.join(root, '.meeseeks', CAPABILITY_MANIFEST), 'utf8'));

/**
 * @param {string} root
 * @param {{ onBuild?: (cwd: string) => void }} [hooks]
 * @returns {Promise<string[]>} the log lines
 */
async function run(root, hooks = {}) {
  /** @type {string[]} */
  const logs = [];
  await main(['PRD.md', '--yes'], {
    cwd: root,
    env: { ...process.env, MEESEEKS_RUNNING: undefined, MEESEEKS_STYLE: 'plain' },
    log: (/** @type {string} */ line) => logs.push(line),
    spawn: /** @type {any} */ ((/** @type {{ phase: string, cwd: string }} */ options) => {
      if (options.phase === 'builder' && hooks.onBuild !== undefined) hooks.onBuild(options.cwd);
      const text =
        options.phase === 'design'
          ? // The architect declares only `cli`. `web-ui` is therefore **detected only**, which is
            // the half that used to evaporate.
            'Designed.\n\n```json\n{"capabilities": ["cli"]}\n```\n'
          : 'built';
      return { ok: true, text, costUsd: 0, tokens: 0, raw: '{}' };
    }),
  });
  return logs;
}

describe('a detected-only capability survives the builder deleting its marker', () => {
  it('keeps web-ui armed and says why, after the marker is gone', async () => {
    const root = repoWithMarker();
    const logs = await run(root, {
      onBuild: (cwd) => {
        // The builder removes the only thing the detector was looking at.
        rmSync(path.join(cwd, 'index.html'), { force: true });
      },
    });

    // The marker really is gone, or this proves nothing about monotonicity.
    assert.equal(existsSync(path.join(root, 'index.html')), false, 'the fixture never deleted the marker');

    const written = manifest(root);
    assert.equal(written.capabilities.includes('web-ui'), true, 'deleting a file removed a capability');
    assert.equal(written.declared.includes('web-ui'), false, 'the fixture declared it, so nothing was tested');
    assert.equal(written.detected.includes('web-ui'), false, 'the detector still sees it, so nothing was tested');
    assert.deepStrictEqual(written.lapsed, ['web-ui'], 'the lapse was not recorded in the manifest');

    // And it is announced rather than absorbed: a roster that stops shrinking silently has to say so.
    assert.equal(
      logs.some((line) => line.includes('capability web-ui is no longer detected in this tree but stays armed')),
      true,
      logs.join('\n').slice(-1200),
    );
  });

  it('says it once, not once per gate pass', async () => {
    // The announcement runs inside `runCapabilities`, which every gate pass calls. A warning
    // repeated on every iteration is a warning an operator learns to scroll past.
    const root = repoWithMarker();
    const logs = await run(root, { onBuild: (cwd) => rmSync(path.join(cwd, 'index.html'), { force: true }) });
    const said = logs.filter((line) => line.includes('capability web-ui is no longer detected'));
    assert.equal(said.length, 1, `announced ${said.length} times`);
  });

  it('does not announce anything while the marker is still there', async () => {
    // The benign neighbour. An ordinary run must not accumulate warnings about capabilities that
    // are plainly still present.
    const root = repoWithMarker();
    const logs = await run(root);
    assert.equal(existsSync(path.join(root, 'index.html')), true);
    assert.deepStrictEqual(manifest(root).lapsed, []);
    assert.equal(logs.some((line) => line.includes('no longer detected in this tree')), false);
  });

  it('lets a new run resolve the set again, which is the escape from monotonicity', async () => {
    // **Monotonic within a run, not across runs**, and that is deliberate. Without this a project
    // that genuinely stopped being a web UI would carry an unsatisfiable design gate forever — a
    // temporary experiment made permanent, which `CLAUDE.md` says to design for before enforcing
    // monotonicity. A new run re-resolves from the architect's fresh declaration, and the previous
    // manifest is archived rather than lost, so the removal is deliberate and leaves evidence.
    const root = repoWithMarker();
    await run(root, { onBuild: (cwd) => rmSync(path.join(cwd, 'index.html'), { force: true }) });
    assert.equal(manifest(root).capabilities.includes('web-ui'), true);

    // The operator removes the UI deliberately and commits it, which is what "no longer a web UI"
    // looks like from outside a run. (The first run's own deletion may not survive its ratchet: a
    // reject can hard-reset the tree, and that is the ratchet working, not this property failing.)
    rmSync(path.join(root, 'index.html'), { force: true });
    git(root, ['add', '-A']);
    git(root, ['commit', '--quiet', '-m', 'not a web ui any more']);

    // Second run, same repository, marker genuinely absent.
    await run(root);
    assert.equal(manifest(root).capabilities.includes('web-ui'), false, 'the set leaked across runs');
    assert.deepStrictEqual(manifest(root).lapsed, [], 'a fresh run reported a lapse it could not have observed');

    // And the previous run's resolution is archived, not destroyed.
    const archives = path.join(root, '.meeseeks', 'runs');
    assert.equal(existsSync(archives), true, 'the previous run was not archived');
  });
});
