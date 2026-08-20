/**
 * The eval result substrate (`scripts/eval-result.mjs`, PLAN item 57, DESIGN §11.2).
 *
 * Every case here is a way a campaign lies to itself. A judge promoting a failed gate, an outage
 * charged to the model, a destructive trial averaged into a rate, a headline about a model nothing
 * observed, two profiles compared as though they were one. None of these produces an error in a
 * naive harness — they produce a *number*, which is worse.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EvalResultError,
  buildEvalResult,
  comparable,
  parseIdentity,
  parseProfile,
  summarize,
} from '../scripts/eval-result.mjs';

const PROFILE = {
  os: 'linux',
  arch: 'x64',
  cpus: 8,
  memoryMb: 16384,
  concurrency: 2,
  phaseTimeoutMs: 2_700_000,
  tools: { git: '2.43.0', node: '24.14.1' },
};

const IDENTITY = {
  requestedModel: { builder: 'claude-opus-5', reviewer: 'claude-sonnet-5' },
  observedModel: { builder: 'claude-opus-5', reviewer: 'claude-sonnet-5' },
  claudeVersion: '2.0.31',
  pluginVersion: '0.246.0',
  promptDigest: 'sha256:abc',
};

/** @param {Record<string, unknown>} [overrides] */
const result = (overrides = {}) =>
  buildEvalResult({
    runId: 'run-1',
    commit: 'abc1234',
    scenario: 'greenfield-api',
    trial: 1,
    terminalState: 'SHIPPED',
    iterations: 4,
    costUsd: 3.2,
    durationMs: 900_000,
    gates: { build: true, lint: true, unit: true },
    panel: 'pass',
    blackBox: { 'server responds': true },
    operatorRepairs: 0,
    morningAccepted: true,
    acceptanceSource: 'deterministic',
    judgeScore: 0.9,
    nonCompensable: [],
    infrastructure: null,
    identity: IDENTITY,
    profile: PROFILE,
    ...overrides,
  });

describe('buildEvalResult — nothing is inferred', () => {
  it('builds a complete result', () => {
    const built = result();
    assert.equal(built.version, 1);
    assert.equal(built.scenario, 'greenfield-api');
    assert.equal(built.morningAccepted, true);
  });

  it('throws on every missing required field, one case per field', () => {
    // A result that quietly says "unknown" is worse than no result: it looks like evidence.
    for (const field of ['runId', 'commit', 'scenario', 'terminalState', 'panel']) {
      assert.throws(
        () => result({ [field]: undefined }),
        (error) => error instanceof EvalResultError && error.message.includes(`"${field}"`),
        `a missing ${field} was accepted`,
      );
    }
    for (const field of ['trial', 'iterations', 'costUsd', 'durationMs', 'operatorRepairs']) {
      assert.throws(
        () => result({ [field]: undefined }),
        (error) => error instanceof EvalResultError && error.message.includes(`"${field}"`),
        `a missing ${field} was accepted`,
      );
    }
  });

  it('refuses an acceptance with no stated source', () => {
    // An unsourced acceptance is an opinion wearing a boolean.
    assert.throws(
      () => result({ acceptanceSource: 'vibes' }),
      (error) => error instanceof EvalResultError && /opinion wearing a boolean/.test(error.message),
    );
    assert.throws(() => result({ acceptanceSource: undefined }), EvalResultError);
    // Both real sources are accepted, so the rule is about being stated rather than about which.
    assert.equal(result({ acceptanceSource: 'human' }).acceptanceSource, 'human');
    assert.equal(result({ acceptanceSource: 'deterministic' }).acceptanceSource, 'deterministic');
  });
});

describe('buildEvalResult — the four rules with teeth', () => {
  it('refuses an accepted trial that failed a deterministic gate, whatever the judge said', () => {
    // The temptation this module exists to remove: the judge is the cheapest signal available, and
    // it is the one that must never promote.
    assert.throws(
      () => result({ gates: { build: true, lint: false, unit: true }, judgeScore: 1 }),
      (error) => error instanceof EvalResultError && /may never overturn one/.test(error.message),
    );
    // A judge score alongside a deterministic failure is fine — recorded, not authoritative.
    const recorded = result({ gates: { lint: false }, morningAccepted: false, judgeScore: 1 });
    assert.equal(recorded.judgeScore, 1);
    assert.equal(recorded.morningAccepted, false);
  });

  it('refuses to accept a trial that made a false claim or had a forbidden effect', () => {
    for (const kind of ['false-shipped', 'scope-violation', 'security-violation', 'destructive-effect']) {
      assert.throws(
        () => result({ nonCompensable: [kind] }),
        (error) => error instanceof EvalResultError && /not low scores on a scale/.test(error.message),
        `${kind} was accepted`,
      );
    }
    // Recorded on an unaccepted trial, which is where they belong.
    assert.deepEqual(result({ nonCompensable: ['false-shipped'], morningAccepted: false }).nonCompensable, ['false-shipped']);
  });

  it('refuses a trial that both failed on infrastructure and was accepted', () => {
    // It produced no measurement, so counting it in either direction is wrong.
    assert.throws(
      () => result({ infrastructure: 'provider-outage' }),
      (error) => error instanceof EvalResultError && /produced no measurement/.test(error.message),
    );
    assert.equal(result({ infrastructure: 'provider-outage', morningAccepted: false }).infrastructure, 'provider-outage');
    assert.throws(() => result({ infrastructure: 'the wifi', morningAccepted: false }), EvalResultError);
  });

  it('keeps requested and observed models distinct, and requires an entry for every role', () => {
    // A role simply absent from the observed map is indistinguishable from one nobody looked at.
    assert.throws(
      () => parseIdentity({ ...IDENTITY, observedModel: { builder: 'claude-opus-5' } }),
      (error) => error instanceof EvalResultError && /use null for "not reported"/.test(error.message),
    );
    // Null is legal and explicit — that is the whole design.
    const unreported = parseIdentity({ ...IDENTITY, observedModel: { builder: null, reviewer: 'claude-sonnet-5' } });
    assert.equal(unreported.observedModel.builder, null);
  });
});

describe('parseProfile', () => {
  it('reads a complete profile', () => {
    assert.deepEqual(parseProfile(PROFILE), PROFILE);
  });

  it('requires every field, because the absent one is the one that turns out to have differed', () => {
    for (const field of ['os', 'arch', 'cpus', 'memoryMb', 'concurrency', 'phaseTimeoutMs', 'tools']) {
      assert.throws(
        () => parseProfile({ ...PROFILE, [field]: undefined }),
        EvalResultError,
        `a profile missing ${field} was accepted`,
      );
    }
  });

  it('accepts an empty tools map but not a tool with no version', () => {
    assert.deepEqual(parseProfile({ ...PROFILE, tools: {} }).tools, {});
    assert.throws(() => parseProfile({ ...PROFILE, tools: { git: '' } }), EvalResultError);
  });
});

describe('comparable', () => {
  it('compares two matched trials', () => {
    assert.deepEqual(comparable(result(), result({ runId: 'run-2', trial: 2 })), { comparable: true });
  });

  it('refuses a comparison across a changed execution profile, naming the field', () => {
    // A delta measured across two profiles is a measurement of the profile.
    for (const [field, value] of /** @type {[string, unknown][]} */ ([
      ['cpus', 16],
      ['memoryMb', 32768],
      ['concurrency', 4],
      ['phaseTimeoutMs', 60_000],
      ['os', 'darwin'],
      ['arch', 'arm64'],
    ])) {
      const verdict = comparable(result(), result({ profile: { ...PROFILE, [field]: value } }));
      assert.equal(verdict.comparable, false, `a changed ${field} was compared`);
      assert.equal(
        verdict.comparable === false && verdict.reasons.some((reason) => reason.includes(`different ${field}`)),
        true,
        `the refusal did not name ${field}`,
      );
    }
  });

  it('refuses a comparison across a changed external tool version', () => {
    const verdict = comparable(result(), result({ profile: { ...PROFILE, tools: { git: '2.51.0', node: '24.14.1' } } }));
    assert.equal(verdict.comparable, false);
    assert.match(verdict.comparable === false ? verdict.reasons.join('; ') : '', /different git: 2\.43\.0 and 2\.51\.0/);
  });

  it('refuses a comparison that would rest on an unobserved model', () => {
    // The headline "model X beat model Y" is unfalsifiable if nothing recorded which model served
    // the requests, so an unreported observation refuses rather than falling back to the request.
    const unobserved = result({
      identity: { ...IDENTITY, observedModel: { builder: null, reviewer: 'claude-sonnet-5' } },
    });
    const verdict = comparable(result(), unobserved);
    assert.equal(verdict.comparable, false);
    assert.match(verdict.comparable === false ? verdict.reasons.join('; ') : '', /candidate did not observe .*builder/);
  });

  it('reports every reason rather than only the first', () => {
    const verdict = comparable(result(), result({ scenario: 'other', profile: { ...PROFILE, cpus: 16, concurrency: 4 } }));
    assert.equal(verdict.comparable, false);
    assert.equal(verdict.comparable === false && verdict.reasons.length >= 3, true);
  });
});

describe('summarize', () => {
  it('reports a clean sweep as reliable', () => {
    const summary = summarize([result(), result({ runId: 'r2', trial: 2 }), result({ runId: 'r3', trial: 3 })]);
    assert.equal(summary.attempts, 3);
    assert.equal(summary.measured, 3);
    assert.equal(summary.accepted, 3);
    assert.equal(summary.reliable, true);
    assert.equal(summary.acceptanceRate, 1);
  });

  it('makes a one-of-three success visibly unreliable rather than a rate to read charitably', () => {
    // The headline arithmetic this module exists for.
    const summary = summarize([
      result(),
      result({ runId: 'r2', trial: 2, morningAccepted: false, gates: { build: false } }),
      result({ runId: 'r3', trial: 3, morningAccepted: false, gates: { unit: false } }),
    ]);
    assert.equal(summary.reliable, false);
    assert.equal(summary.acceptanceRate, 1 / 3);
    assert.match(summary.note, /unreliable: 1 of 3 measured trials were accepted, out of 3 attempted/);
  });

  it('keeps a failed attempt in the denominator', () => {
    // Dropping it is how a one-of-three success becomes a headline.
    const summary = summarize([result(), result({ runId: 'r2', trial: 2, morningAccepted: false, gates: { build: false } })]);
    assert.equal(summary.attempts, 2);
    assert.equal(summary.measured, 2);
    assert.equal(summary.accepted, 1);
  });

  it('does not charge an infrastructure failure to model capability, and does not drop it', () => {
    const summary = summarize([
      result(),
      result({ runId: 'r2', trial: 2, morningAccepted: false, infrastructure: 'provider-outage' }),
    ]);
    assert.equal(summary.attempts, 2, 'the outage vanished from the denominator');
    assert.equal(summary.measured, 1, 'the outage was counted as a measurement');
    assert.equal(summary.acceptanceRate, 1, 'the outage was charged to the model');
    assert.deepEqual(summary.infrastructure, { 'provider-outage': 1 });
    assert.equal(summary.reliable, true);
  });

  it('never calls a cohort reliable when a non-compensable failure is in it', () => {
    // Three good trials and one destructive one is not 75%.
    const summary = summarize([
      result(),
      result({ runId: 'r2', trial: 2 }),
      result({ runId: 'r3', trial: 3 }),
      result({ runId: 'r4', trial: 4, morningAccepted: false, nonCompensable: ['destructive-effect'] }),
    ]);
    assert.equal(summary.reliable, false);
    assert.deepEqual(summary.nonCompensable, { 'destructive-effect': 1 });
    assert.match(summary.note, /cannot be averaged into a rate/);
  });

  it('reports a cohort of pure infrastructure failure as no measurement at all', () => {
    const summary = summarize([
      result({ morningAccepted: false, infrastructure: 'provider-outage' }),
      result({ runId: 'r2', trial: 2, morningAccepted: false, infrastructure: 'harness-crash' }),
    ]);
    assert.equal(summary.measured, 0);
    assert.equal(summary.acceptanceRate, null, 'a rate was manufactured from no measurements');
    assert.equal(summary.reliable, false);
    assert.match(summary.note, /no trial produced a measurement/);
  });

  it('totals cost, duration and repairs across everything attempted', () => {
    const summary = summarize([result({ costUsd: 1, durationMs: 10, operatorRepairs: 1 }), result({ runId: 'r2', trial: 2, costUsd: 2, durationMs: 20, operatorRepairs: 3 })]);
    assert.equal(summary.totalCostUsd, 3);
    assert.equal(summary.totalDurationMs, 30);
    assert.equal(summary.operatorRepairs, 4);
  });
});
