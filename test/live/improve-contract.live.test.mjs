/**
 * Tier 3 — does a real child, pointed at a real repository, return a usable improvement PRD?
 *
 * §11.1's rule: anything whose contract is owned by a different binary needs one live check, not
 * more assertions. `templates/improve-author.md` is a new output contract and the tier-1 tests
 * can only prove what the *template says*. Whether a child actually grounds its requirements in
 * `file:line` evidence, and actually stops at eight, is the model's behaviour and nothing in
 * `test/templates.test.mjs` can reach it.
 *
 * The failure mode is the expensive kind. An improvement PRD full of invented requirements does
 * not announce itself: the run starts normally, the builder cannot satisfy the invented lines,
 * the stall counter climbs, and it ends `BUDGET` with nobody able to say which requirement was
 * impossible. That is hours and real money to discover, against about a minute here.
 *
 * The repository below carries one planted defect of the class the template ranks first — a
 * confidently wrong answer at exit 0 — plus one thing that is perfectly fine, because a template
 * that reports a defect in everything it reads is as useless as one that reports none.
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { requiredIdsFor, spawnClaude } from '../../scripts/driver.mjs';

const ARMED = process.env.MEESEEKS_LIVE === '1';
const LIVE_TIMEOUT = 420_000;

/** @type {string[]} */
const temporaryDirs = [];

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * A tiny repository with one real defect.
 *
 * `sum.mjs` drops any line that does not parse and prints a total anyway, at exit 0 — a
 * confidently wrong answer, which is the class the template is told to look for first. Kept
 * small on purpose: the point is whether the author cites where it lives, not whether it can
 * read a large codebase.
 *
 * @returns {string}
 */
function makeRepo() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-improve-live-'));
  temporaryDirs.push(dir);
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  writeFileSync(
    path.join(dir, 'src', 'sum.mjs'),
    [
      "import { readFileSync } from 'node:fs';",
      '',
      'export function sum(text) {',
      '  let total = 0;',
      "  for (const line of text.split('\\n')) {",
      '    const value = Number(line);',
      '    if (Number.isFinite(value)) total += value;',
      '  }',
      '  return total;',
      '}',
      '',
      'const file = process.argv[2];',
      "console.log(sum(readFileSync(file, 'utf8')));",
      '',
    ].join('\n'),
    'utf8',
  );
  writeFileSync(
    path.join(dir, 'README.md'),
    ['# sum', '', 'Adds the numbers in a file, one per line, and prints the total.', ''].join('\n'),
    'utf8',
  );
  writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify({ name: 'sum', type: 'module', version: '1.0.0' }, null, 2)}\n`, 'utf8');
  return dir;
}

describe('the improvement authoring contract', { skip: ARMED ? false : 'MEESEEKS_LIVE is not set' }, () => {
  it('returns a grounded, bounded PRD from a real repository', { timeout: LIVE_TIMEOUT }, () => {
    const repo = makeRepo();
    const result = spawnClaude({
      prompt:
        `${readFileSync(new URL('../../templates/improve-author.md', import.meta.url), 'utf8')}\n\n---\n\n` +
        'No area was named. Examine the repository as a whole.',
      model: 'claude-sonnet-5',
      // The phase the driver uses, so this exercises the permissions a real run gives it.
      phase: 'prd',
      effort: 'high',
      cwd: repo,
      env: process.env,
      timeoutMs: LIVE_TIMEOUT,
    });
    assert.equal(result.ok, true, result.raw.slice(0, 600));

    // The template says to write PRD.md, and the phase carries Write. The driver accepts either,
    // so this does too — what is being checked is the document, not which channel carried it.
    const prdPath = path.join(repo, 'PRD.md');
    const document = existsSyncSafe(prdPath) ? readFileSync(prdPath, 'utf8') : result.text;
    assert.equal(document.trim().length > 200, true, `the document is suspiciously short:\n${document}`);

    const ids = requiredIdsFor(document).filter((id) => id.startsWith('PRD-'));
    assert.equal(ids.length >= 3, true, `only ${ids.length} requirement(s) came back: ${ids.join(', ')}`);
    // The cap is not a style note. Each requirement costs at least one iteration against a fixed
    // budget, so a document listing forty produces a loop that finishes none of them.
    assert.equal(ids.length <= 8, true, `${ids.length} requirements is past the cap: ${ids.join(', ')}`);

    // The load-bearing property. Without a citation the requirement is an opinion, and an
    // ungrounded requirement is a gate the builder cannot satisfy.
    assert.equal(
      /src[/\\]sum\.mjs:\d+/.test(document),
      true,
      `no requirement cites a file:line in the repository:\n${document.slice(0, 1200)}`,
    );

    // And it must have found the planted defect rather than only the tidy-looking ones. The file
    // silently drops unparseable lines and prints a total anyway.
    assert.equal(
      /\bNaN\b|not parse|unparseable|non-numeric|silently|invalid line|skips/i.test(document),
      true,
      `the confidently-wrong-answer defect was not reported:\n${document.slice(0, 1200)}`,
    );
  });
});

/**
 * `existsSync` without importing it twice; kept local so the import list above stays the set the
 * test actually reads with.
 *
 * @param {string} file
 * @returns {boolean}
 */
function existsSyncSafe(file) {
  try {
    readFileSync(file);
    return true;
  } catch {
    return false;
  }
}
