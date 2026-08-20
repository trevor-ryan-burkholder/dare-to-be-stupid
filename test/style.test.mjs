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

describe('the three milestone events (item 53)', () => {
  /** @param {import('../scripts/style.mjs').StyleEvent} event */
  const both = (event) => ({
    meeseeks: render(event, { mode: 'meeseeks' }),
    plain: render(event, { mode: 'plain' }),
  });

  describe('gate-summary', () => {
    it('names every failing gate, because a count alone is noise', () => {
      // §9's mapping rule at its sharpest. "SOME GATES ARE UNHAPPY" tells an operator nothing they
      // did not already know from the run stopping.
      const { meeseeks, plain } = both({ kind: 'gate-summary', failed: ['unit', 'observability'] });
      assert.equal(meeseeks, 'OOOH. TWO GATES ARE NOT HAPPY: unit, observability.');
      assert.equal(plain, '2 gate(s) failed: unit, observability');
    });

    it('keeps gate names verbatim and lower-case in both modes', () => {
      // Identifiers are never styled. A gate called `gate-integrity` is not `GATE-INTEGRITY`, and
      // an operator grepping the log for the name has to find it.
      const { meeseeks } = both({ kind: 'gate-summary', failed: ['gate-integrity', 'design-slop'] });
      assert.equal(meeseeks.includes('gate-integrity'), true);
      assert.equal(meeseeks.includes('design-slop'), true);
      assert.equal(meeseeks.includes('GATE-INTEGRITY'), false);
    });

    it('agrees with itself on one', () => {
      assert.equal(render({ kind: 'gate-summary', failed: ['unit'] }, { mode: 'meeseeks' }),
        'OOOH. ONE GATE IS NOT HAPPY: unit.');
      assert.equal(render({ kind: 'gate-summary', failed: ['unit'] }, { mode: 'plain' }),
        '1 gate(s) failed: unit');
    });

    it('says so when nothing failed, rather than rendering an empty accusation', () => {
      const { meeseeks, plain } = both({ kind: 'gate-summary', failed: [] });
      assert.equal(meeseeks, 'EVERY GATE IS HAPPY! LOOK AT ME!');
      assert.equal(plain, 'all gates passed');
    });
  });

  describe('panel-convening', () => {
    it('states the cold-panel invariant as canon', () => {
      // The invariant said out loud rather than kept as a footnote: a Meeseeks cannot judge its
      // own work and does not get to meet the people who do.
      const { meeseeks, plain } = both({ kind: 'panel-convening', reviewers: 4 });
      assert.equal(meeseeks, "ALL GATES GREEN! FOUR JUDGES ARE COMING. I DIDN'T PICK THEM. I CAN'T TALK TO THEM.");
      assert.equal(plain, 'convening 4 reviewer(s)');
    });

    it('agrees with itself on one', () => {
      assert.equal(render({ kind: 'panel-convening', reviewers: 1 }, { mode: 'meeseeks' }),
        "ALL GATES GREEN! ONE JUDGE IS COMING. I DIDN'T PICK THEM. I CAN'T TALK TO THEM.");
    });
  });

  describe('carry', () => {
    it('reports what stays proved and what still says no, naming the finding', () => {
      const { meeseeks, plain } = both({ kind: 'carry', carried: 4, outstanding: ['DoD-5-design'] });
      assert.equal(meeseeks, 'FOUR THINGS I ALREADY PROVED STAY PROVED. ONE FINDING STILL SAYS NO: DoD-5-design.');
      assert.equal(plain, '4 requirement(s) carried; outstanding: DoD-5-design');
    });

    it('keeps a requirement id verbatim, mixed case and all', () => {
      // `DoD-5-design` is an identifier the reviewer JSON uses. Upper-casing it would break the
      // one thing an operator does with this line, which is find the finding.
      const { meeseeks } = both({ kind: 'carry', carried: 1, outstanding: ['PRD-2.3', 'DoD-5-design'] });
      assert.equal(meeseeks.includes('DoD-5-design'), true);
      assert.equal(meeseeks.includes('PRD-2.3'), true);
      assert.equal(meeseeks.includes('DOD-5-DESIGN'), false);
    });

    it('drops the second clause entirely when nothing is outstanding', () => {
      // Rather than saying "ZERO FINDINGS SAY NO", which is a sentence about nothing.
      const { meeseeks, plain } = both({ kind: 'carry', carried: 2, outstanding: [] });
      assert.equal(meeseeks, 'TWO THINGS I ALREADY PROVED STAY PROVED.');
      assert.equal(plain, '2 requirement(s) carried');
    });

    it('agrees with itself on one carried thing', () => {
      assert.equal(render({ kind: 'carry', carried: 1, outstanding: [] }, { mode: 'meeseeks' }),
        'ONE THING I ALREADY PROVED STAYS PROVED.');
    });
  });

  it('bypasses the style layer entirely in plain mode, for all three', () => {
    // `MEESEEKS_STYLE=plain` is a full bypass, not quieter shouting. No fragment of the styled
    // rendering may survive into it.
    /** @type {import('../scripts/style.mjs').StyleEvent[]} */
    const events = [
      { kind: 'gate-summary', failed: ['unit'] },
      { kind: 'panel-convening', reviewers: 3 },
      { kind: 'carry', carried: 2, outstanding: ['DoD-1'] },
    ];
    for (const event of events) {
      const plain = render(event, { mode: 'plain' });
      assert.equal(/[A-Z]{4,}/.test(plain.replace(/DoD-\d|PRD-[\d.]+/g, '')), false, `styled text leaked into plain: ${plain}`);
      assert.equal(plain.includes('!'), false, `styled punctuation leaked into plain: ${plain}`);
    }
  });
});
