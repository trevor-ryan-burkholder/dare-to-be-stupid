/**
 * Tests for the Claude Code compatibility policy (REVIEW F28).
 *
 * The check this replaces asked whether the binary exited zero. Every version passed, including one
 * this repository records as incompatible. What follows covers the classes F28 names — below,
 * equal, inside, above, decorated, prerelease, malformed — because each has a different repair and
 * a check that collapses them into "no" tells an operator nothing.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  COMPATIBILITY_EVIDENCE,
  SUPPORTED_FLOOR,
  VERIFIED_THROUGH,
  classifyClaudeVersion,
  compareVersions,
  parseClaudeVersion,
  versionText,
} from '../scripts/claude-compat.mjs';

describe('parseClaudeVersion', () => {
  it('reads the decoration the real binary prints', () => {
    // `claude --version` answers `2.1.234 (Claude Code)`. Expected, not tolerated by luck.
    assert.deepStrictEqual(parseClaudeVersion('2.1.234 (Claude Code)'), {
      major: 2,
      minor: 1,
      patch: 234,
      prerelease: null,
    });
  });

  it('reads a bare version and a surrounding newline', () => {
    assert.deepStrictEqual(parseClaudeVersion('\n2.1.226\n'), { major: 2, minor: 1, patch: 226, prerelease: null });
  });

  it('keeps a prerelease suffix rather than discarding it', () => {
    // Discarding it would make `2.2.0-beta.1` indistinguishable from `2.2.0`, and the caller has to
    // be able to refuse the one nobody has tested.
    assert.deepStrictEqual(parseClaudeVersion('2.2.0-beta.1'), { major: 2, minor: 2, patch: 0, prerelease: 'beta.1' });
  });

  it('answers null for output that is not a version report', () => {
    // Anchored: a release *mentioned* in a sentence is not a version. Matching anywhere would
    // accept a warning that happens to name one, which is how an unverified binary gets in.
    assert.equal(parseClaudeVersion('warning: 2.1.234 is available'), null);
    assert.equal(parseClaudeVersion('command not found'), null);
    assert.equal(parseClaudeVersion(''), null);
    assert.equal(parseClaudeVersion('2.1'), null);
    assert.equal(parseClaudeVersion(/** @type {any} */ (undefined)), null);
  });

  it('refuses a valid numeric prefix followed by an unmeasured suffix', () => {
    // The compatibility decision covers the complete report, not the first three numbers in it.
    // Every one of these used to parse as the verified stable release.
    for (const output of [
      '2.1.234-',
      '2.1.234+unverified',
      '2.1.234.extra',
      '2.1.234 warning',
      '2.1.234 (not Claude Code)',
    ]) {
      assert.equal(parseClaudeVersion(output), null, output);
    }
  });

  it('refuses release numbers that cannot be represented exactly', () => {
    assert.equal(parseClaudeVersion('2.1.9007199254740992'), null);
  });
});

describe('compareVersions', () => {
  it('orders by release number, component by component', () => {
    const of = (/** @type {string} */ text) => /** @type {any} */ (parseClaudeVersion(text));
    assert.equal(compareVersions(of('2.1.226'), of('2.1.234')) < 0, true);
    assert.equal(compareVersions(of('2.2.0'), of('2.1.999')) > 0, true);
    assert.equal(compareVersions(of('3.0.0'), of('2.9.9')) > 0, true);
    assert.equal(compareVersions(of('2.1.226'), of('2.1.226')), 0);
    // Not lexicographic: 2.1.99 must be older than 2.1.226, which string comparison gets wrong.
    assert.equal(compareVersions(of('2.1.99'), of('2.1.226')) < 0, true);
  });
});

describe('classifyClaudeVersion', () => {
  it('accepts the floor, because the floor is a version that was measured', () => {
    const verdict = classifyClaudeVersion(`${SUPPORTED_FLOOR} (Claude Code)`);
    assert.equal(verdict.ok, true, JSON.stringify(verdict));
  });

  it('accepts the ceiling, for the same reason', () => {
    assert.equal(classifyClaudeVersion(VERIFIED_THROUGH).ok, true);
  });

  it('admits the release whose full live tier finally passed', () => {
    // 2.1.235 was refused for two days on a 33-of-34 result while the host that had auto-updated to
    // it could not start a run. It is admitted now because the missing evidence arrived — 39 of 39
    // on 20 August 2026 — and for no other reason. The case is kept rather than deleted, because
    // what it is really asserting is that this boundary moves on evidence and nothing else.
    assert.equal(classifyClaudeVersion('2.1.235 (Claude Code)').ok, true);
  });

  it('accepts a version inside the range', () => {
    assert.equal(classifyClaudeVersion('2.1.228').ok, true);
  });

  it('refuses the version this repository recorded as incompatible', () => {
    // 2.1.136 has never heard of `--safe-mode`, which every cold role depends on. It passed the old
    // check, and a run that starts on it dies partway through rather than at the door.
    const verdict = classifyClaudeVersion('2.1.136 (Claude Code)');
    assert.equal(verdict.ok, false);
    assert.equal(/** @type {any} */ (verdict).reason.includes('older than'), true, JSON.stringify(verdict));
    assert.equal(/** @type {any} */ (verdict).fix.includes('Update'), true);
  });

  it('refuses a version newer than anything tested, and says how to widen the policy', () => {
    // **The uncomfortable direction, and it is deliberate.** A greater number is not evidence of
    // compatibility; the CLI documents a coming bare-mode default for `-p` that would change
    // authentication under a run. The escape is the load-bearing half: run the live tier and move
    // one constant.
    const verdict = classifyClaudeVersion('99.0.0');
    assert.equal(verdict.ok, false);
    assert.equal(/** @type {any} */ (verdict).reason.includes('newer than'), true);
    assert.equal(/** @type {any} */ (verdict).fix.includes('VERIFIED_THROUGH'), true, /** @type {any} */ (verdict).fix);
    assert.equal(/** @type {any} */ (verdict).fix.includes('test:live'), true);
  });

  it('refuses a prerelease of a version inside the range', () => {
    // Ordering alone would let this through: 2.1.230-beta reads as 2.1.230. No prerelease has been
    // through the contract suite, and a build that guesses which prereleases are safe is guessing.
    const verdict = classifyClaudeVersion('2.1.230-beta.4');
    assert.equal(verdict.ok, false);
    assert.equal(/** @type {any} */ (verdict).reason.includes('prerelease'), true, JSON.stringify(verdict));
  });

  it('refuses output it cannot read, rather than treating it as compatible', () => {
    const verdict = classifyClaudeVersion('claude: command not found');
    assert.equal(verdict.ok, false);
    assert.equal(/** @type {any} */ (verdict).reason.includes('not a version'), true);
    // The refusal quotes what it saw, so an operator can tell a shadowed wrapper from a broken one.
    assert.equal(/** @type {any} */ (verdict).reason.includes('command not found'), true);
  });
});

describe('the policy itself', () => {
  it('states a floor no newer than the ceiling', () => {
    const floor = /** @type {any} */ (parseClaudeVersion(SUPPORTED_FLOOR));
    const ceiling = /** @type {any} */ (parseClaudeVersion(VERIFIED_THROUGH));
    assert.equal(compareVersions(floor, ceiling) <= 0, true, `${SUPPORTED_FLOOR} > ${VERIFIED_THROUGH}`);
  });

  it('cites evidence for every bound it names', () => {
    // **A policy is a record of measurement here, not a constant somebody liked.** F28 is explicit
    // that unsupported precision would be no better than the absent check, so both bounds must
    // appear in the evidence list that a refusal prints.
    const evidence = COMPATIBILITY_EVIDENCE.join('\n');
    assert.equal(evidence.includes(SUPPORTED_FLOOR), true, evidence);
    assert.equal(evidence.includes(VERIFIED_THROUGH), true, evidence);
    assert.equal(evidence.includes('2.1.136'), true, 'the recorded incompatible version is not cited');
    // **The refused run stays in the record after its release was admitted.** This used to assert
    // the literal string `2.1.235 — not admitted`, which pinned a verdict rather than a property and
    // failed the moment the missing evidence arrived. What has to hold is that the failed run is
    // still cited: an evidence list quietly rewritten to read as though 2.1.235 passed the first
    // time is a measurement log that has started editing its own history.
    assert.equal(evidence.includes('33-of-34'), true, 'the refused boundary run was dropped once its release was admitted');
    for (const line of COMPATIBILITY_EVIDENCE) {
      assert.match(line, /^\d+\.\d+\.\d+ — .{20,}$/, `evidence too thin to check: ${line}`);
    }
  });

  it('renders a version the way the policy states it', () => {
    assert.equal(versionText({ major: 2, minor: 1, patch: 234, prerelease: null }), '2.1.234');
    assert.equal(versionText({ major: 2, minor: 2, patch: 0, prerelease: 'rc.1' }), '2.2.0-rc.1');
  });
});
