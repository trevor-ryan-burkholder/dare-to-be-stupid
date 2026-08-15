/**
 * Tests for the Meeseeks output style (DESIGN.md §9).
 *
 * The style layer is the one part of this repo allowed to be funny, and therefore the one
 * part most able to do damage. What is being defended:
 *
 *   - `MEESEEKS_STYLE=plain` bypasses it completely, in every code path
 *   - the mapping is tight: every rendered line still carries the real module, count or
 *     state, because a line that encodes nothing is noise rather than a joke
 *   - the banner is ASCII, so it renders in a terminal that has never heard of a box glyph
 *   - failure output is verbatim
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { banner, render, stamp, styleMode, verbatim } from '../scripts/style.mjs';

const STYLE_MARKDOWN = readFileSync(new URL('../output-styles/meeseeks.md', import.meta.url), 'utf8');

const MEESEEKS = { mode: /** @type {const} */ ('meeseeks') };
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
  it('is meeseeks by default', () => {
    assert.equal(styleMode({}), 'meeseeks');
  });

  it('is plain when MEESEEKS_STYLE=plain', () => {
    assert.equal(styleMode({ MEESEEKS_STYLE: 'plain' }), 'plain');
  });

  it('is meeseeks for any other value, rather than guessing at intent', () => {
    assert.equal(styleMode({ MEESEEKS_STYLE: 'quiet' }), 'meeseeks');
    assert.equal(styleMode({ MEESEEKS_STYLE: '' }), 'meeseeks');
  });
});

describe('plain mode bypasses the style completely', () => {
  for (const event of EVERY_EVENT) {
    it(`renders ${event.kind} with no broadcast language`, () => {
      const plain = render(event, PLAIN);
      for (const tell of ['LOOK AT ME', 'CAN DO', 'EXISTENCE IS PAIN', 'WANNA DIE', 'OUTTA HERE', 'OOOH']) {
        assert.equal(plain.toUpperCase().includes(tell), false, `plain mode leaked: ${tell}`);
      }
    });

    it(`renders ${event.kind} differently from meeseeks mode`, () => {
      assert.notEqual(render(event, PLAIN), render(event, MEESEEKS));
    });
  }

  it('renders the banner as a bare name', () => {
    assert.equal(banner(PLAIN), 'meeseeks');
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
      render({ kind: 'test-failure', module: 'auth-middleware', count: 14 }, MEESEEKS),
      "OOOH, AUTH-MIDDLEWARE IS NOT HAPPY. FOURTEEN TESTS SCREAMING.",
    );
  });

  it('keeps the module name recoverable from the rendered line', () => {
    assert.equal(render({ kind: 'test-failure', module: 'billing-webhook', count: 3 }, MEESEEKS).includes('BILLING-WEBHOOK'), true);
  });

  it('falls back to digits past the numbers a Meeseeks would say aloud', () => {
    assert.equal(render({ kind: 'test-failure', module: 'x', count: 41 }, MEESEEKS).includes('41'), true);
  });

  it('agrees with itself about singular and plural', () => {
    assert.equal(render({ kind: 'reset', regressions: 1 }, MEESEEKS).includes('ONE THING I ALREADY FIXED'), true);
    assert.equal(render({ kind: 'reset', regressions: 2 }, MEESEEKS).includes('TWO THINGS I ALREADY FIXED'), true);
  });

  it('renders each real event as its own thing, never one generic line', () => {
    const rendered = EVERY_EVENT.map((event) => render(event, MEESEEKS));
    assert.equal(new Set(rendered).size, EVERY_EVENT.length);
  });

  it('reports airtime as the real percentage remaining', () => {
    assert.equal(
      render({ kind: 'airtime', fractionLeft: 0.42 }, MEESEEKS),
      "42 PERCENT LEFT. EXISTENCE IS PAIN, BUT I'M STILL HERE.",
    );
  });

  /** @type {[import('../scripts/style.mjs').TerminalState, string][]} */
  const terminalCopy = [
    ['SHIPPED', "OOOH YEAH! CAN DO! ALL DONE! I'M OUTTA HERE!"],
    ['STALLED', "IT'S NOT WORKING. IT'S NOT WORKING! I JUST WANNA DIE!!!"],
    ['BUDGET', "I'VE BEEN HERE TOO LONG. EXISTENCE IS PAIN! I JUST WANNA DIE!!!"],
    ['ABORTED', 'SOMEBODY CLOSED THE BOX ON ME! I JUST WANNA DIE!!!'],
  ];
  for (const [state, expected] of terminalCopy) {
    it(`renders ${state} as the line DESIGN.md §9 specifies`, () => {
      assert.equal(render({ kind: 'terminal', state }, MEESEEKS), expected);
    });
  }
});

describe('the banner and stamps', () => {
  const ASCII_ONLY = /^[ -~\n]*$/;

  it('is ASCII only, so it renders in any terminal', () => {
    assert.equal(ASCII_ONLY.test(banner(MEESEEKS)), true, 'banner contains a non-ASCII character');
  });

  for (const state of TERMINAL_STATES) {
    it(`the ${state} stamp is ASCII only`, () => {
      assert.equal(ASCII_ONLY.test(stamp(state, MEESEEKS)), true, `${state} stamp contains non-ASCII`);
    });

    it(`the ${state} stamp is distinct from the others`, () => {
      assert.equal(stamp(state, MEESEEKS).length > 0, true);
      assert.notEqual(stamp(state, MEESEEKS), stamp(state === 'SHIPPED' ? 'BUDGET' : 'SHIPPED', MEESEEKS));
    });
  }

  it('is deterministic, so it costs nothing and never varies', () => {
    assert.equal(banner(MEESEEKS), banner(MEESEEKS));
    assert.equal(stamp('SHIPPED', MEESEEKS), stamp('SHIPPED', MEESEEKS));
  });

  it('says out loud that the run is unattended and not for production', () => {
    assert.equal(banner(MEESEEKS).includes('UNATTENDED'), true);
    assert.equal(banner(MEESEEKS).includes('NOT AVAILABLE IN PRODUCTION'), true);
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
      'meeseeks: iteration 7',
    ]) {
      assert.equal(verbatim(text), text);
    }
  });
});

describe('the style prose carries its own escapes', () => {
  // R33: the style layer states its own break-character clause rather than leaning on the
  // driver's "failure output is verbatim" discipline alone, because a critical warning can
  // surface in a line the driver never marks as failure output.
  it('states the break-character escape for a critical warning', () => {
    assert.equal(STYLE_MARKDOWN.includes('drop the voice for that sentence'), true);
  });

  it('names the escape as covering danger beyond the fixed verbatim list', () => {
    // The clause is about lines that are NOT on the verbatim list — data loss, a destructive
    // command, a leaked secret — so it must say so, or it is just the verbatim rule restated.
    assert.equal(STYLE_MARKDOWN.includes('dangerous'), true);
  });

  it('still documents the plain-mode bypass, unchanged', () => {
    assert.equal(STYLE_MARKDOWN.includes('MEESEEKS_STYLE=plain'), true);
  });
});

describe('the style layer decides nothing', () => {
  it('does not mutate the event it was handed', () => {
    /** @type {import('../scripts/style.mjs').StyleEvent} */
    const event = { kind: 'test-failure', module: 'auth', count: 2 };
    const before = JSON.stringify(event);
    render(event, MEESEEKS);
    render(event, PLAIN);
    assert.equal(JSON.stringify(event), before);
  });

  it('returns a string and nothing else, so no caller can branch on it', () => {
    for (const event of EVERY_EVENT) {
      assert.equal(typeof render(event, MEESEEKS), 'string');
      assert.equal(typeof render(event, PLAIN), 'string');
    }
  });

  it('is pure: the same event renders the same way every time', () => {
    for (const event of EVERY_EVENT) {
      assert.equal(render(event, MEESEEKS), render(event, MEESEEKS));
    }
  });
});
