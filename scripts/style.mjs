/**
 * The Junkion output style (DESIGN.md §9).
 *
 * Applied at render, and only at render. This module is pure: it takes an event record and
 * returns a string. It reads no state, decides nothing, and nothing it returns is fed back
 * into a gate result, the ratchet, or reviewer JSON. If that ever stops being true, the
 * comedy has started affecting the engineering and the layer has to come out.
 *
 * `DARE_STYLE=plain` bypasses it completely — plain rendering is not "the same text with
 * less shouting", it is a different, literal string built from the same record.
 *
 * Junkions learned language from intercepted broadcast television: advertising copy, game
 * show patter, infomercial pitches. The mapping has to be tight. Every fragment encodes
 * the real event — the module that failed, the count, the state — or it is noise, and
 * noise is not the joke.
 *
 *   Wrong: THIS IS A FANTASTIC OFFER! GREAT SAVINGS!
 *   Right: WE ARE ISSUING A VOLUNTARY RECALL ON AUTH-MIDDLEWARE. AFFECTED UNITS: FOURTEEN.
 *
 * Never styled, in either mode: code, identifiers, commit messages, JSON, file paths,
 * stack traces, test names, error text. Failure output is verbatim. A garbled stack trace
 * is funny once and then it is a broken tool.
 */

/** @typedef {'junkion' | 'plain'} StyleMode */
/** @typedef {'SHIPPED' | 'STALLED' | 'BUDGET' | 'ABORTED'} TerminalState */

/**
 * @typedef {{ kind: 'iteration', number: number, total: number }
 *   | { kind: 'test-failure', module: string, count: number }
 *   | { kind: 'reset', regressions: number }
 *   | { kind: 'security-fail', findings: number }
 *   | { kind: 'ship', iteration: number }
 *   | { kind: 'airtime', fractionLeft: number }
 *   | { kind: 'terminal', state: TerminalState }} StyleEvent
 */

/** Numbers a Junkion would read aloud rather than print. Beyond this, digits. */
const SPOKEN = [
  'ZERO',
  'ONE',
  'TWO',
  'THREE',
  'FOUR',
  'FIVE',
  'SIX',
  'SEVEN',
  'EIGHT',
  'NINE',
  'TEN',
  'ELEVEN',
  'TWELVE',
  'THIRTEEN',
  'FOURTEEN',
  'FIFTEEN',
  'SIXTEEN',
  'SEVENTEEN',
  'EIGHTEEN',
  'NINETEEN',
  'TWENTY',
];

/**
 * @param {number} value
 * @returns {string}
 */
function spoken(value) {
  return SPOKEN[value] ?? String(value);
}

/**
 * Which mode to render in.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {StyleMode}
 */
export function styleMode(env) {
  return env.DARE_STYLE === 'plain' ? 'plain' : 'junkion';
}

/**
 * Failure output, passed through untouched.
 *
 * Exported so callers have something to reach for that is obviously not styled, rather
 * than deciding case by case whether a given string is safe to dress up.
 *
 * @param {string} text
 * @returns {string}
 */
export function verbatim(text) {
  return text;
}

/**
 * @param {StyleEvent} event
 * @returns {string}
 */
function renderPlain(event) {
  switch (event.kind) {
    case 'iteration':
      return `iteration ${event.number} of ${event.total}`;
    case 'test-failure':
      return `${event.count} test(s) failing in ${event.module}`;
    case 'reset':
      return `hard reset: ${event.regressions} regression(s)`;
    case 'security-fail':
      return `security gate failed: ${event.findings} finding(s)`;
    case 'ship':
      return `shipped iteration ${event.iteration}`;
    case 'airtime':
      return `${Math.round(event.fractionLeft * 100)}% of budget remaining`;
    case 'terminal':
      return `run ended: ${event.state}`;
  }
}

/**
 * @param {StyleEvent} event
 * @returns {string}
 */
function renderJunkion(event) {
  switch (event.kind) {
    case 'iteration':
      return `WE NOW RETURN TO OUR PROGRAM. SEGMENT ${spoken(event.number)} OF ${spoken(event.total)}.`;
    case 'test-failure':
      return `WE ARE ISSUING A VOLUNTARY RECALL ON ${event.module.toUpperCase()}. AFFECTED UNITS: ${spoken(event.count)}.`;
    case 'reset':
      return `WE ARE EXPERIENCING TECHNICAL DIFFICULTIES. ${spoken(event.regressions)} UNIT${
        event.regressions === 1 ? '' : 'S'
      } RETURNED TO THE WAREHOUSE.`;
    case 'security-fail':
      return `URGENT SAFETY NOTICE. ${spoken(event.findings)} AFFECTED UNIT${
        event.findings === 1 ? '' : 'S'
      }. DO NOT OPERATE.`;
    case 'ship':
      return `AVAILABLE NOW. LIMITED TIME. EDITION ${spoken(event.iteration)}.`;
    case 'airtime':
      return `${Math.round(event.fractionLeft * 100)} PERCENT OF OUR BROADCAST DAY REMAINS. STAY TUNED.`;
    case 'terminal':
      return {
        SHIPPED: 'GRAND PRIZE AWARDED.',
        STALLED: 'WE ARE EXPERIENCING TECHNICAL DIFFICULTIES. PLEASE STAND BY.',
        BUDGET: 'AND THAT IS ALL THE AIRTIME WE HAVE.',
        ABORTED: 'BROADCAST TERMINATED BY STANDARDS AND PRACTICES.',
      }[event.state];
  }
}

/**
 * Render one event.
 *
 * @param {StyleEvent} event
 * @param {{ mode: StyleMode }} options
 * @returns {string}
 */
export function render(event, options) {
  return options.mode === 'plain' ? renderPlain(event) : renderJunkion(event);
}

/**
 * The launch banner (DESIGN.md §9.1).
 *
 * Deterministic, printed by the driver rather than generated by a model, so it costs
 * nothing and never varies. ASCII only, so it renders in any terminal. Shown once at
 * launch, never per iteration.
 *
 * @param {{ mode: StyleMode }} options
 * @returns {string}
 */
export function banner(options) {
  if (options.mode === 'plain') return 'dare-to-be-stupid';
  return [
    '+--------------------------------------------------------------+',
    '|                                                              |',
    '|    D A R E   T O   B E   S T U P I D                         |',
    '|                                                              |',
    '|    THE FOLLOWING PROGRAM IS UNATTENDED.                      |',
    '|    PERMISSIONS HAVE BEEN DISABLED FOR YOUR CONVENIENCE.       |',
    '|    NOT AVAILABLE IN PRODUCTION. VOID WHERE PROHIBITED.        |',
    '|                                                              |',
    '+--------------------------------------------------------------+',
  ].join('\n');
}

/**
 * The closing stamp for a terminal state (DESIGN.md §9.1), so a run opens and closes on a
 * visual.
 *
 * @param {TerminalState} state
 * @param {{ mode: StyleMode }} options
 * @returns {string}
 */
export function stamp(state, options) {
  if (options.mode === 'plain') return state;
  return {
    SHIPPED: ['   ___    ', '  |   |   ', '  |___|   ', '   |_|    ', ' __|_|__  ', 'GRAND PRIZE AWARDED'],
    STALLED: ['  |||||||  ', '  |||||||  ', '  |||||||  ', 'WE ARE EXPERIENCING TECHNICAL DIFFICULTIES'],
    BUDGET: ['  ####  ', '  ####  ', '  ####  ', 'AND THAT IS ALL THE AIRTIME WE HAVE'],
    ABORTED: ['  [ X ]  ', 'BROADCAST TERMINATED BY STANDARDS AND PRACTICES'],
  }[state].join('\n');
}
