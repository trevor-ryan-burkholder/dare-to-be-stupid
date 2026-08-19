/**
 * Tests for the one answer to "which `claude` would the driver use".
 *
 * **`npm run` prepends every ancestor `node_modules/.bin` to `PATH`.** Measured on 13 August 2026:
 * that made `npm run test:live` exercise `~/dev/node_modules/.bin/claude` — Claude Code 2.1.136,
 * which has never heard of `--safe-mode` — while `scripts/driver.mjs` spawns whatever the operator's
 * shell resolves. The suite was green about software nobody executes.
 *
 * `tools/run-live.mjs` repaired that for the live tier. This module exists because the defect then
 * arrived somewhere else: `tools/plugin-install-check.mjs` resolved 2.1.136 the first time it ran
 * under `npm run`, and reported on an install that binary had performed. Two implementations of the
 * same question would eventually disagree, and the quiet one would be deciding a release.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { isNpmInjected, operatorPath } from '../tools/operator-path.mjs';

describe('operatorPath', () => {
  it('removes the entries npm injected and keeps the rest, in order', () => {
    const given = ['/home/me/dev/node_modules/.bin', '/usr/local/bin', '/home/me/.local/bin'].join(':');
    assert.equal(operatorPath(given, ':'), '/usr/local/bin:/home/me/.local/bin');
  });

  it('removes a nested node_modules at any depth', () => {
    const given = ['/a/node_modules/.bin', '/b/x/node_modules/.bin', '/c/bin'].join(':');
    assert.equal(operatorPath(given, ':'), '/c/bin');
  });

  it('keeps a directory that merely begins with the same letters', () => {
    // Matched on a path *segment*, so this is not a substring test. A tool directory called
    // `node_modules_tools` is the operator's, and eating it would break their shell.
    assert.equal(operatorPath('/opt/node_modules_tools:/usr/bin', ':'), '/opt/node_modules_tools:/usr/bin');
    assert.equal(isNpmInjected('/opt/node_modules_tools'), false);
    assert.equal(isNpmInjected('/opt/node_modules/.bin'), true);
  });

  it('handles Windows separators, because contributors are on three platforms', () => {
    assert.equal(operatorPath('C:\\p\\node_modules\\.bin;C:\\Windows', ';'), 'C:\\Windows');
  });

  it('drops empty entries rather than emitting a bare separator', () => {
    // An empty `PATH` entry means "the current directory" to some shells, which is not something a
    // cleaner should silently introduce.
    assert.equal(operatorPath('/usr/bin::/bin', ':'), '/usr/bin:/bin');
    assert.equal(operatorPath(undefined, ':'), '');
    assert.equal(operatorPath('', ':'), '');
  });

  it('leaves a PATH with nothing injected exactly as it was', () => {
    // The neighbour. A cleaner that rewrote an already-clean PATH would be changing the thing it
    // exists to preserve.
    const clean = '/usr/local/bin:/usr/bin:/bin';
    assert.equal(operatorPath(clean, ':'), clean);
  });
});

describe('both tools that resolve a binary use it', () => {
  // Structural, and the reason is the defect itself: the second tool did not use the first tool's
  // answer, and nothing noticed until it reported on the wrong binary. A test that only covered the
  // function would have stayed green through exactly that.
  for (const tool of ['run-live.mjs', 'plugin-install-check.mjs']) {
    it(`${tool} resolves through operatorPath rather than reading PATH directly`, () => {
      const source = readFileSync(new URL(`../tools/${tool}`, import.meta.url), 'utf8');
      assert.equal(source.includes("from './operator-path.mjs'"), true, `${tool} does not import the shared answer`);
      assert.equal(source.includes('operatorPath('), true, `${tool} imports it without using it`);
      assert.equal(
        /\.split\(separator\)[\s\S]{0,120}node_modules/.test(source),
        false,
        `${tool} still carries its own copy of the cleaning`,
      );
    });
  }
});
