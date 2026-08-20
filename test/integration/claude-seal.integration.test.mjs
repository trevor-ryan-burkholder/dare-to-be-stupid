/**
 * Tier 2 — the five binary swaps, staged on a real filesystem and a real PATH (PLAN item 83).
 *
 * **What a unit test cannot reach.** `test/claude-seal.test.mjs` proves the seal's logic against an
 * injected filesystem: which changes it refuses and why. What it cannot show is that the production
 * resolver finds what the *shell would actually run*, that `realpath` follows a real symlink, and
 * that a real atomic replacement produces a different digest. Those are the mechanics the whole
 * mechanism rests on, and every one of them is somebody else's implementation.
 *
 * Each of item 83's five fixtures gets its own case, and each is paired with the unchanged
 * neighbour: a seal that refused everything would satisfy all five while bricking the host on the
 * first ordinary run.
 *
 * Real files, real symlinks, real `PATH` resolution. No network, no API, no money.
 */

import assert from 'node:assert/strict';
import { appendFileSync, chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { sealTarget, verifySeal } from '../../scripts/claude-seal.mjs';
import { realSealIo } from '../../scripts/driver.mjs';

/** @type {string[]} */
const temporaryDirs = [];
after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** A real native binary to stand in for the CLI. `true` is present on every POSIX host and tiny. */
const NATIVE_SOURCE = ['/usr/bin/true', '/bin/true'].find((file) => existsSync(file)) ?? '/bin/sh';

/** A directory that will be first on PATH. @returns {string} */
function binDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-seal-'));
  temporaryDirs.push(dir);
  return dir;
}

/** @param {string} dir @returns {NodeJS.ProcessEnv} */
const pathWith = (dir) => ({ ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH ?? ''}` });

/** @param {string} file @param {string} body */
function executable(file, body) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, body, 'utf8');
  chmodSync(file, 0o755);
}

/**
 * A **real native executable** named `claude`, first on a real PATH.
 *
 * A copy of a system binary rather than a shell script, and the distinction is the point: a
 * `#!` file is a *script launcher* to this mechanism, and the seal correctly refuses one whose
 * delegation it cannot read. The first draft of this fixture was a shell script and every case
 * here failed on that refusal — which is the module being right and the fixture being wrong.
 *
 * @param {string} tag distinguishes two otherwise identical copies, appended as trailing bytes so
 *   the file is genuinely different without being a different program
 * @returns {string}
 */
function nativeClaude(tag) {
  const dir = binDir();
  const target = path.join(dir, 'claude');
  copyFileSync(NATIVE_SOURCE, target);
  appendFileSync(target, `\n# ${tag}\n`);
  chmodSync(target, 0o755);
  return dir;
}

describe('the sealed binary against a real filesystem (item 83)', () => {
  it('resolves through PATH the way the shell does, and verifies an untouched target', () => {
    // The neighbour, first. This is also the only case that proves `realSealIo` finds anything at
    // all — every refusal below would pass against a resolver that always returned null.
    const dir = nativeClaude('a');
    const io = realSealIo(pathWith(dir));
    const seal = sealTarget('claude', '2.1.230', io);
    assert.equal(seal.path, path.join(dir, 'claude'));
    assert.deepEqual(verifySeal(seal, '2.1.230', io), { ok: true });
  });

  it('fixture 2 — refuses a hostile PATH shadow inserted after sealing', () => {
    const original = nativeClaude('a');
    const seal = sealTarget('claude', '2.1.230', realSealIo(pathWith(original)));

    // A second directory, ahead of the first, holding a different `claude`. The seal is intact and
    // untouched; what changed is which file the shell finds.
    const shadow = nativeClaude('shadow');
    const verdict = verifySeal(seal, '2.1.230', realSealIo({
      ...process.env,
      PATH: `${shadow}${path.delimiter}${original}${path.delimiter}${process.env.PATH ?? ''}`,
    }));
    assert.equal(verdict.ok, false);
    assert.match(verdict.ok === false ? verdict.reason : '', /now resolves to /);
  });

  it('fixture 3 — refuses an atomic replacement whose version is unchanged', () => {
    // `renameSync` over the target, which is how a package manager and an attacker both do it. The
    // replacement reports the *same version*, so nothing but the fingerprint can notice.
    const dir = nativeClaude('a');
    const io = realSealIo(pathWith(dir));
    const seal = sealTarget('claude', '2.1.230', io);

    const staged = path.join(dir, '.claude.new');
    copyFileSync(NATIVE_SOURCE, staged);
    appendFileSync(staged, '\n# replaced\n');
    chmodSync(staged, 0o755);
    renameSync(staged, path.join(dir, 'claude'));

    const verdict = verifySeal(seal, '2.1.230', io);
    assert.equal(verdict.ok, false);
    assert.match(verdict.ok === false ? verdict.reason : '', /byte replacement reporting the same version/);
  });

  it('fixture 4 — refuses a retargeted symlink', () => {
    const dir = binDir();
    const versions = binDir();
    for (const [name, tag] of [['claude-a', 'a'], ['claude-b', 'b']]) {
      copyFileSync(NATIVE_SOURCE, path.join(versions, name));
      appendFileSync(path.join(versions, name), `\n# ${tag}\n`);
      chmodSync(path.join(versions, name), 0o755);
    }
    symlinkSync(path.join(versions, 'claude-a'), path.join(dir, 'claude'));

    const io = realSealIo(pathWith(dir));
    const seal = sealTarget('claude', '2.1.230', io);
    assert.equal(seal.realPath, path.join(versions, 'claude-a'), 'the seal bound the link rather than its target');

    unlinkSync(path.join(dir, 'claude'));
    symlinkSync(path.join(versions, 'claude-b'), path.join(dir, 'claude'));
    const verdict = verifySeal(seal, '2.1.230', io);
    assert.equal(verdict.ok, false);
    assert.match(verdict.ok === false ? verdict.reason : '', /now points at /);
  });

  it('fixture 5 — refuses a launcher whose bytes and version are stable and whose entrypoint moved', () => {
    // The case the closure exists for. The launcher is byte-for-byte identical afterwards and
    // reports the same version; only the file it delegates to changed.
    const root = binDir();
    const bin = path.join(root, 'bin');
    const lib = path.join(root, 'lib');
    executable(path.join(bin, 'claude'), '#!/bin/sh\nexec node "../lib/cli.js" "$@"\n');
    mkdirSync(lib, { recursive: true });
    writeFileSync(path.join(lib, 'cli.js'), 'console.log("2.1.230 (Claude Code)");\n', 'utf8');

    const io = realSealIo(pathWith(bin));
    const seal = sealTarget('claude', '2.1.230', io);
    assert.equal(seal.form, 'script');
    assert.deepEqual(seal.closure.map((entry) => entry.file), [path.join(bin, 'claude'), path.join(lib, 'cli.js')]);

    writeFileSync(path.join(lib, 'cli.js'), 'console.log("2.1.230 (Claude Code)"); /* and more */\n', 'utf8');
    const verdict = verifySeal(seal, '2.1.230', io);
    assert.equal(verdict.ok, false);
    assert.match(verdict.ok === false ? verdict.reason : '', /cli\.js has different contents/);
  });

  it('refuses a real launcher whose delegation cannot be read, rather than sealing half of it', () => {
    const dir = binDir();
    executable(path.join(dir, 'claude'), '#!/bin/sh\nexec claude-real "$@"\n');
    assert.throws(
      () => sealTarget('claude', '2.1.230', realSealIo(pathWith(dir))),
      (error) => error instanceof Error && /invocation closure cannot be bounded/.test(error.message),
    );
  });

  it('refuses when the sealed target is deleted between children', () => {
    const dir = nativeClaude('a');
    const io = realSealIo(pathWith(dir));
    const seal = sealTarget('claude', '2.1.230', io);
    unlinkSync(path.join(dir, 'claude'));
    const verdict = verifySeal(seal, '2.1.230', io);
    assert.equal(verdict.ok, false);
  });
});
