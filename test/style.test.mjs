/**
 * Tests for the Junkion output style (DESIGN.md §9).
 *
 * The style layer is the one part of this repo allowed to be funny, and therefore the one
 * part most able to do damage. What is being defended:
 *
 *   - `DARE_STYLE=plain` bypasses it completely, in every code path
 *   - the mapping is tight: every rendered line still carries the real module, count or
 *     state, because a line that encodes nothing is noise rather than a joke
 *   - the banner is ASCII, so it renders in a terminal that has never heard of a box glyph
 *   - failure output is verbatim
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { banner, render, stamp, styleMode, verbatim } from '../scripts/style.mjs';

const JUNKION = { mode: /** @type {const} */ ('junkion') };
const PLAIN = { mode: /** @type {const} */ ('plain') };

/** @type {import('../scripts/style.mjs').StyleEvent[]} */
const EVERY_EVENT = [
  { kind: 'iteration', number: 3, total: 25 },
  { kind: 'test-failure', module: 'auth-middleware', count: 14 },
  { kind: 'reset', regressions: 2 },
  { kind: 'security-fail', findings: 1 },
  { kind: 'ship', iteration: 7 },
  { kind: 'airtime', fractionLeft: 0.42 },
  { kind: 'terminal', state: 'SHIPPED' },
];

/** @type {import('../scripts/style.mjs').TerminalState[]} */
const TERMINAL_STATES = ['SHIPPED', 'STALLED', 'BUDGET', 'ABORTED'];

describe('styleMode', () => {
  it('is junkion by default', () => {
    assert.equal(styleMode({}), 'junkion');
  });

  it('is plain when DARE_STYLE=plain', () => {
    assert.equal(styleMode({ DARE_STYLE: 'plain' }), 'plain');
  });

  it('is junkion for any other value, rather than guessing at intent', () => {
    assert.equal(styleMode({ DARE_STYLE: 'quiet' }), 'junkion');
    assert.equal(styleMode({ DARE_STYLE: '' }), 'junkion');
  });
});

describe('plain mode bypasses the style completely', () => {
  for (const event of EVERY_EVENT) {
    it(`renders ${event.kind} with no broadcast language`, () => {
      const plain = render(event, PLAIN);
      for (const tell of ['RECALL', 'GRAND PRIZE', 'BROADCAST', 'STAY TUNED', 'LIMITED TIME', 'AFFECTED UNITS']) {
        assert.equal(plain.toUpperCase().includes(tell), false, `plain mode leaked: ${tell}`);
      }
    });

    it(`renders ${event.kind} differently from junkion mode`, () => {
      assert.notEqual(render(event, PLAIN), render(event, JUNKION));
    });
  }

  it('renders the banner as a bare name', () => {
    assert.equal(banner(PLAIN), 'dare-to-be-stupid');
  });

  for (const state of TERMINAL_STATES) {
    it(`renders the ${state} stamp as the bare state`, () => {
      assert.equal(stamp(state, PLAIN), state);
    });
  }
});

describe('the mapping is tight', () => {
  it('names the failing module and the count', () => {
    assert.equal(
      render({ kind: 'test-failure', module: 'auth-middleware', count: 14 }, JUNKION),
      'WE ARE ISSUING A VOLUNTARY RECALL ON AUTH-MIDDLEWARE. AFFECTED UNITS: FOURTEEN.',
    );
  });

  it('keeps the module name recoverable from the rendered line', () => {
    assert.equal(render({ kind: 'test-failure', module: 'billing-webhook', count: 3 }, JUNKION).includes('BILLING-WEBHOOK'), true);
  });

  it('falls back to digits past the numbers a Junkion would say aloud', () => {
    assert.equal(render({ kind: 'test-failure', module: 'x', count: 41 }, JUNKION).includes('41'), true);
  });

  it('agrees with itself about singular and plural', () => {
    assert.equal(render({ kind: 'reset', regressions: 1 }, JUNKION).includes('ONE UNIT RETURNED'), true);
    assert.equal(render({ kind: 'reset', regressions: 2 }, JUNKION).includes('TWO UNITS RETURNED'), true);
  });

  it('renders each real event as its own thing, never one generic line', () => {
    const rendered = EVERY_EVENT.map((event) => render(event, JUNKION));
    assert.equal(new Set(rendered).size, EVERY_EVENT.length);
  });

  it('reports airtime as the real percentage remaining', () => {
    assert.equal(
      render({ kind: 'airtime', fractionLeft: 0.42 }, JUNKION),
      '42 PERCENT OF OUR BROADCAST DAY REMAINS. STAY TUNED.',
    );
  });

  /** @type {[import('../scripts/style.mjs').TerminalState, string][]} */
  const terminalCopy = [
    ['SHIPPED', 'GRAND PRIZE AWARDED.'],
    ['STALLED', 'WE ARE EXPERIENCING TECHNICAL DIFFICULTIES. PLEASE STAND BY.'],
    ['BUDGET', 'AND THAT IS ALL THE AIRTIME WE HAVE.'],
    ['ABORTED', 'BROADCAST TERMINATED BY STANDARDS AND PRACTICES.'],
  ];
  for (const [state, expected] of terminalCopy) {
    it(`renders ${state} as the line DESIGN.md §9 specifies`, () => {
      assert.equal(render({ kind: 'terminal', state }, JUNKION), expected);
    });
  }
});

describe('the banner and stamps', () => {
  const ASCII_ONLY = /^[ -~\n]*$/;

  it('is ASCII only, so it renders in any terminal', () => {
    assert.equal(ASCII_ONLY.test(banner(JUNKION)), true, 'banner contains a non-ASCII character');
  });

  for (const state of TERMINAL_STATES) {
    it(`the ${state} stamp is ASCII only`, () => {
      assert.equal(ASCII_ONLY.test(stamp(state, JUNKION)), true, `${state} stamp contains non-ASCII`);
    });

    it(`the ${state} stamp is distinct from the others`, () => {
      assert.equal(stamp(state, JUNKION).length > 0, true);
      assert.notEqual(stamp(state, JUNKION), stamp(state === 'SHIPPED' ? 'BUDGET' : 'SHIPPED', JUNKION));
    });
  }

  it('is deterministic, so it costs nothing and never varies', () => {
    assert.equal(banner(JUNKION), banner(JUNKION));
    assert.equal(stamp('SHIPPED', JUNKION), stamp('SHIPPED', JUNKION));
  });

  it('says out loud that the run is unattended and not for production', () => {
    assert.equal(banner(JUNKION).includes('UNATTENDED'), true);
    assert.equal(banner(JUNKION).includes('NOT AVAILABLE IN PRODUCTION'), true);
  });
});

describe('failure output', () => {
  it('passes through byte for byte', () => {
    const trace = [
      'AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:',
      "  'admin' !== 'user'",
      '    at Object.<anonymous> (/repo/test/auth.test.ts:41:3)',
    ].join('\n');
    assert.equal(verbatim(trace), trace);
  });

  it('leaves identifiers, paths and JSON alone', () => {
    for (const text of [
      'src/api/admin.ts:41',
      '{"verdict":"fail","requirements":[]}',
      'test/auth.test.ts::rejects an expired token',
      'dare: iteration 7',
    ]) {
      assert.equal(verbatim(text), text);
    }
  });
});

describe('the style layer decides nothing', () => {
  it('does not mutate the event it was handed', () => {
    /** @type {import('../scripts/style.mjs').StyleEvent} */
    const event = { kind: 'test-failure', module: 'auth', count: 2 };
    const before = JSON.stringify(event);
    render(event, JUNKION);
    render(event, PLAIN);
    assert.equal(JSON.stringify(event), before);
  });

  it('returns a string and nothing else, so no caller can branch on it', () => {
    for (const event of EVERY_EVENT) {
      assert.equal(typeof render(event, JUNKION), 'string');
      assert.equal(typeof render(event, PLAIN), 'string');
    }
  });

  it('is pure: the same event renders the same way every time', () => {
    for (const event of EVERY_EVENT) {
      assert.equal(render(event, JUNKION), render(event, JUNKION));
    }
  });
});
