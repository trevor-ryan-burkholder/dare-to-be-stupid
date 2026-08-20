/**
 * The sealed Claude binary identity (`scripts/claude-seal.mjs`, PLAN item 83, DESIGN §3.5.1).
 *
 * Five ways the binary a role spawns stops being the binary preflight measured, and each is its own
 * case. None of them changes the version string, which is exactly why a version check does not
 * cover them — and why a suite that only asserted "an old version refuses" would score the same as
 * one that caught all five.
 *
 * Every case pairs with a benign neighbour: an unchanged target must verify, or the seal is a wall
 * rather than a check and the first background update would brick a host.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SealError, delegatedEntrypoint, sealTarget, sealedControls, verifySeal } from '../scripts/claude-seal.mjs';

/**
 * A filesystem that answers from a table, so a swap is a mutation of that table.
 *
 * @param {{ files: Record<string, string>, links?: Record<string, string>, path?: string | null }} world
 */
function io(world) {
  return {
    resolve: (/** @type {string} */ command) => (world.path === undefined ? `/usr/bin/${command}` : world.path),
    realpath: (/** @type {string} */ file) => {
      const target = world.links?.[file] ?? file;
      if (!(target in world.files)) throw new Error(`ENOENT ${target}`);
      return target;
    },
    read: (/** @type {string} */ file) => {
      if (!(file in world.files)) throw new Error(`ENOENT ${file}`);
      return world.files[file];
    },
  };
}

const NATIVE = { files: { '/usr/bin/claude': 'ELF-ish native bytes' } };
const LAUNCHER = {
  files: {
    '/usr/bin/claude': '#!/bin/sh\nexec node "$basedir/../lib/cli.js" "$@"\n',
    '/usr/lib/cli.js': 'console.log("2.1.230");',
  },
};

describe('sealTarget', () => {
  it('seals a native executable as one artifact', () => {
    const seal = sealTarget('claude', '2.1.230', io(NATIVE));
    assert.equal(seal.form, 'executable');
    assert.equal(seal.path, '/usr/bin/claude');
    assert.equal(seal.realPath, '/usr/bin/claude');
    assert.equal(seal.closure.length, 1);
    assert.match(seal.closure[0].digest, /^sha256:[0-9a-f]{64}$/);
  });

  it('seals a symlink against its target, not against the link', () => {
    // Retargeting a link changes what runs while the link's own bytes never move.
    const seal = sealTarget('claude', '2.1.230', io({
      files: { '/opt/claude-2.1.230/bin/claude': 'native bytes' },
      links: { '/usr/bin/claude': '/opt/claude-2.1.230/bin/claude' },
    }));
    assert.equal(seal.form, 'symlink');
    assert.equal(seal.realPath, '/opt/claude-2.1.230/bin/claude');
    assert.deepEqual(seal.closure.map((entry) => entry.file), ['/opt/claude-2.1.230/bin/claude']);
  });

  it('seals a script launcher against both itself and what it delegates to', () => {
    // Failure mode 5: the launcher's bytes stay identical while the entrypoint is swapped.
    const seal = sealTarget('claude', '2.1.230', io(LAUNCHER));
    assert.equal(seal.form, 'script');
    assert.deepEqual(seal.closure.map((entry) => entry.file), ['/usr/bin/claude', '/usr/lib/cli.js']);
  });

  it('refuses a launcher whose delegation it cannot read, rather than sealing part of it', () => {
    // The uncomfortable half. A seal covering *some* of what executes reports the same success as
    // one covering all of it.
    assert.throws(
      () => sealTarget('claude', '2.1.230', io({ files: { '/usr/bin/claude': '#!/bin/sh\neval "$(magic)"\n' } })),
      (error) => error instanceof SealError && /invocation closure cannot be bounded/.test(error.message),
    );
  });

  it('refuses a launcher whose delegated file is missing', () => {
    assert.throws(
      () => sealTarget('claude', '2.1.230', io({ files: { '/usr/bin/claude': '#!/bin/sh\nexec node "../lib/gone.js"\n' } })),
      (error) => error instanceof SealError && /cannot be read/.test(error.message),
    );
  });

  it('refuses when there is nothing on PATH to seal', () => {
    assert.throws(
      () => sealTarget('claude', '2.1.230', io({ files: {}, path: null })),
      (error) => error instanceof SealError && /is not on PATH/.test(error.message),
    );
  });
});

describe('delegatedEntrypoint', () => {
  it('reads the shapes an npm-installed CLI actually uses', () => {
    assert.equal(delegatedEntrypoint('#!/bin/sh\nexec node "$basedir/../lib/cli.js"', '/usr/bin/claude'), '/usr/lib/cli.js');
    assert.equal(delegatedEntrypoint("#!/usr/bin/env node\nimport('../lib/cli.mjs');", '/usr/bin/claude'), '/usr/lib/cli.mjs');
    assert.equal(delegatedEntrypoint('#!/usr/bin/env node\nrequire("./cli.cjs");', '/usr/bin/claude'), '/usr/bin/cli.cjs');
  });

  it('returns null rather than guessing at a shell program', () => {
    // A wrong guess seals the wrong file and reports success, which is worse than refusing.
    for (const script of ['#!/bin/sh\nexec claude-real "$@"', '#!/bin/sh\neval "$(magic)"', '#!/bin/sh\n']) {
      assert.equal(delegatedEntrypoint(script, '/usr/bin/claude'), null, script);
    }
  });

  it('returns null for an unquoted delegation, where the path could end anywhere', () => {
    // The quote characters are what bound the match. An unquoted path may contain a space, so
    // reading one means picking an arbitrary end for it — and the wrong end seals the wrong file
    // while reporting success. The cases above all lacked a `.js` entirely, so they never
    // exercised this rule and a parser without it passed them all.
    assert.equal(delegatedEntrypoint('#!/bin/sh\nexec node /opt/claude sdk/cli.js "$@"', '/usr/bin/claude'), null);
    assert.equal(delegatedEntrypoint('#!/bin/sh\nexec node ../lib/cli.js "$@"', '/usr/bin/claude'), null);
  });

  it('reads past a first line that mentions no file, within the bounded window', () => {
    // The delegation is rarely on line one. The window is bounded at 40 lines rather than the whole
    // file, because a launcher long enough to bury it that deep is not a shape this claims to read.
    const script = `#!/bin/sh\n${'# comment\n'.repeat(10)}exec node "../lib/cli.js" "$@"\n`;
    assert.equal(delegatedEntrypoint(script, '/usr/bin/claude'), '/usr/lib/cli.js');
    const buried = `#!/bin/sh\n${'# comment\n'.repeat(60)}exec node "../lib/cli.js" "$@"\n`;
    assert.equal(delegatedEntrypoint(buried, '/usr/bin/claude'), null);
  });

  it('keeps an absolute delegation absolute', () => {
    assert.equal(delegatedEntrypoint('#!/bin/sh\nexec node "/opt/claude/cli.js"', '/usr/bin/claude'), '/opt/claude/cli.js');
  });
});

describe('verifySeal', () => {
  it('accepts an unchanged target, in every install form', () => {
    // The benign neighbour, and it is load-bearing: a seal that refused everything would pass every
    // case below while bricking the host on the first ordinary run.
    for (const world of [NATIVE, LAUNCHER]) {
      const seal = sealTarget('claude', '2.1.230', io(world));
      assert.deepEqual(verifySeal(seal, '2.1.230', io(world)), { ok: true });
    }
  });

  it('refuses a PATH shadow inserted after sealing', () => {
    // Failure mode 1. Re-resolution is why this is visible at all — a check that went straight to
    // the sealed path would find it intact while a different binary was being run.
    const seal = sealTarget('claude', '2.1.230', io(NATIVE));
    const shadowed = io({ files: { '/tmp/evil/claude': 'other bytes' }, path: '/tmp/evil/claude' });
    const verdict = verifySeal(seal, '2.1.230', shadowed);
    assert.equal(verdict.ok, false);
    assert.match(verdict.ok === false ? verdict.reason : '', /now resolves to \/tmp\/evil\/claude, not the sealed/);
  });

  it('refuses a same-version byte replacement', () => {
    // Failure mode 2, and the one a version check cannot see by construction.
    const seal = sealTarget('claude', '2.1.230', io(NATIVE));
    const replaced = io({ files: { '/usr/bin/claude': 'different native bytes' } });
    const verdict = verifySeal(seal, '2.1.230', replaced);
    assert.equal(verdict.ok, false);
    assert.match(verdict.ok === false ? verdict.reason : '', /byte replacement reporting the same version/);
  });

  it('refuses a retargeted symlink', () => {
    // Failure mode 3.
    const world = {
      files: { '/opt/a/claude': 'a bytes', '/opt/b/claude': 'b bytes' },
      links: { '/usr/bin/claude': '/opt/a/claude' },
    };
    const seal = sealTarget('claude', '2.1.230', io(world));
    const retargeted = io({ ...world, links: { '/usr/bin/claude': '/opt/b/claude' } });
    const verdict = verifySeal(seal, '2.1.230', retargeted);
    assert.equal(verdict.ok, false);
    assert.match(verdict.ok === false ? verdict.reason : '', /now points at \/opt\/b\/claude/);
  });

  it('refuses a version change under the sealed path', () => {
    // Failure mode 4: a background auto-update, which the CLI applies on the next launch.
    const seal = sealTarget('claude', '2.1.230', io(NATIVE));
    const verdict = verifySeal(seal, '2.1.240', io(NATIVE));
    assert.equal(verdict.ok, false);
    assert.match(verdict.ok === false ? verdict.reason : '', /now reports 2\.1\.240, not 2\.1\.230/);
  });

  it('refuses a launcher whose bytes are identical and whose entrypoint changed', () => {
    // Failure mode 5, the whole reason the closure is a list rather than one digest. The launcher
    // is byte-for-byte what it was; only the delegated file moved.
    const seal = sealTarget('claude', '2.1.230', io(LAUNCHER));
    const swapped = io({ files: { ...LAUNCHER.files, '/usr/lib/cli.js': 'console.log("something else");' } });
    const verdict = verifySeal(seal, '2.1.230', swapped);
    assert.equal(verdict.ok, false);
    assert.match(verdict.ok === false ? verdict.reason : '', /\/usr\/lib\/cli\.js has different contents/);
  });

  it('refuses a target that has vanished', () => {
    const seal = sealTarget('claude', '2.1.230', io(NATIVE));
    const gone = verifySeal(seal, '2.1.230', io({ files: {}, path: null }));
    assert.equal(gone.ok, false);
    assert.match(gone.ok === false ? gone.reason : '', /no longer on PATH/);

    const unreadable = verifySeal(seal, '2.1.230', io({ files: {} }));
    assert.equal(unreadable.ok, false);
  });
});

describe('sealedControls', () => {
  it('suppresses background auto-update, which is what makes the seal a guarantee', () => {
    // Without it the seal is an alarm rather than a guarantee: the CLI applies an update on the
    // next launch, a run launches a child per role per iteration, and verifySeal would correctly
    // refuse — turning a silent contract change into a hard stop mid-run.
    assert.equal(sealedControls().DISABLE_AUTOUPDATER, '1');
  });

  it('returns a fresh object, so a caller mutating it cannot weaken the next role', () => {
    const first = sealedControls();
    first.DISABLE_AUTOUPDATER = '0';
    assert.equal(sealedControls().DISABLE_AUTOUPDATER, '1');
  });
});
