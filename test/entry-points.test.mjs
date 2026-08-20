/**
 * Every runnable script decides "was I invoked directly?" the same way, and the way that works.
 *
 * **This is a positional rule over the source, and it exists because the enumerated alternative
 * already failed.** `scripts/init.mjs` compared `import.meta.url` to `` `file://${process.argv[1]}` ``
 * — string concatenation, which is not a URL for any path needing percent-encoding and is never one
 * on Windows, where argv[1] is `C:\...` and `import.meta.url` is `file:///C:/...`.
 *
 * When that comparison is false the file runs `main` for nobody: it prints nothing and **exits 0**.
 * `commands/meeseeks.md` reads a zero exit as "preflight passed" and shells straight to the driver,
 * so all thirteen refusals are bypassed — silently — on a plugin installed under a path with a space
 * in it, which `~/.claude/plugins/cache/` under a real user's name routinely is.
 *
 * Reproduced 20 August 2026: the same file at `.../plug in/scripts/init.mjs` printed nothing and
 * exited 0 in a non-git directory, where at an unspaced path it printed all thirteen checks and
 * exited 1. Three other scripts already guarded themselves correctly; the rule is here so the next
 * entry point cannot be the fourth to get it wrong.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const SCRIPTS = fileURLToPath(new URL('../scripts', import.meta.url));

/** @returns {string[]} every `.mjs` under `scripts/`, including the toolchain adapters. */
function scriptFiles(dir = SCRIPTS) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return scriptFiles(full);
    return entry.isFile() && entry.name.endsWith('.mjs') ? [full] : [];
  });
}

/**
 * Source with block and line comments removed.
 *
 * Deliberately crude — it does not understand strings containing `//`, and it does not need to. The
 * question here is whether a *code* path builds a URL by concatenation, and prose that names the
 * mistake in order to warn about it must not be counted as making it.
 *
 * @param {string} source @returns {string}
 */
function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('how a script decides it was invoked directly', () => {
  it('never compares import.meta.url against a concatenated file:// string', () => {
    // The defect as a shape rather than as one file's name. A path with a space, a `#`, or any
    // non-ASCII byte breaks the comparison, and every Windows path breaks it.
    // Comments stripped first: the repair in `init.mjs` quotes the broken form in order to explain
    // it, and a rule that cannot tell an example from an instance would forbid describing the bug.
    const offenders = scriptFiles().filter((file) => /`file:\/\/\$\{/.test(withoutComments(readFileSync(file, 'utf8'))));
    assert.deepEqual(
      offenders.map((file) => path.relative(SCRIPTS, file)),
      [],
      'these build a file: URL by concatenation, which is wrong for any path needing percent-encoding and for every Windows path',
    );
  });

  it('uses pathToFileURL wherever it makes that decision at all', () => {
    // The other direction, and the one a careless repair breaks: deleting the comparison entirely
    // would satisfy the case above while leaving a script that never runs its own `main`.
    const deciding = scriptFiles().filter((file) => readFileSync(file, 'utf8').includes('process.argv[1]'));
    assert.equal(deciding.length > 0, true, 'no script decides whether it was invoked directly, which cannot be right');
    for (const file of deciding) {
      const source = readFileSync(file, 'utf8');
      assert.equal(
        source.includes('pathToFileURL(process.argv[1])'),
        true,
        `${path.relative(SCRIPTS, file)} inspects process.argv[1] without resolving it through pathToFileURL`,
      );
    }
  });
});
