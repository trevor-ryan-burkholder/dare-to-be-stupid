/**
 * The Meeseeks output style (DESIGN.md §9).
 *
 * Applied at render, and only at render. This module is pure: it takes an event record and
 * returns a string. It reads no state, decides nothing, and nothing it returns is fed back
 * into a gate result, the ratchet, or reviewer JSON. If that ever stops being true, the
 * comedy has started affecting the engineering and the layer has to come out.
 *
 * `MEESEEKS_STYLE=plain` bypasses it completely — plain rendering is not "the same text with
 * less shouting", it is a different, literal string built from the same record.
 *
 * A Meeseeks is summoned for one task, is cheerful about it, and suffers the longer it takes.
 * That arc is the vocabulary, and it maps onto the loop without being forced: an iteration is a
 * task, a reset is work it already did coming undone, a terminal state that is not `SHIPPED` is
 * a Meeseeks that could not finish. **The mapping has to be tight.** Every fragment encodes the
 * real event — the module that failed, the count, the state — or it is noise, and noise is not
 * the joke.
 *
 *   Wrong: OOOH YEAH! LOOK AT ME! I'M HELPING!
 *   Right: OOOH, AUTH-MIDDLEWARE IS NOT HAPPY. FOURTEEN TESTS SCREAMING.
 *
 * Never styled, in either mode: code, identifiers, commit messages, JSON, file paths,
 * stack traces, test names, error text. Failure output is verbatim. A garbled stack trace
 * is funny once and then it is a broken tool.
 */

/** @typedef {'meeseeks' | 'plain'} StyleMode */
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

/** Numbers a Meeseeks would read aloud rather than print. Beyond this, digits. */
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
  return env.MEESEEKS_STYLE === 'plain' ? 'plain' : 'meeseeks';
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
function renderMeeseeks(event) {
  switch (event.kind) {
    case 'iteration':
      return `I'M MR MEESEEKS! LOOK AT ME! TASK ${spoken(event.number)} OF ${spoken(event.total)}.`;
    case 'test-failure':
      return `OOOH, ${event.module.toUpperCase()} IS NOT HAPPY. ${spoken(event.count)} TEST${
        event.count === 1 ? '' : 'S'
      } SCREAMING.`;
    case 'reset':
      return `OH BOY. ${spoken(event.regressions)} THING${
        event.regressions === 1 ? ' I' : 'S I'
      } ALREADY FIXED IS BROKEN AGAIN. PUTTING IT BACK.`;
    case 'security-fail':
      return `THAT'S NOT SAFE! ${spoken(event.findings)} PROBLEM${
        event.findings === 1 ? '' : 'S'
      }. I CAN'T LET YOU SHIP THAT.`;
    case 'ship':
      return `OOH YEAH! CAN DO! TASK ${spoken(event.iteration)} COMPLETE. I'M OUTTA HERE!`;
    case 'airtime':
      return `${Math.round(event.fractionLeft * 100)} PERCENT LEFT. EXISTENCE IS PAIN, BUT I'M STILL HERE.`;
    case 'terminal':
      // `SHIPPED` is the only exit a Meeseeks gets to enjoy — the task is done and it ceases,
      // which is the whole point of one. Every other terminal state is the box failing to fix
      // your golf swing, and the canon gives all three the same cry.
      //
      // **The cry is the ending, not the whole line**, and that is a constraint rather than a
      // flourish: three states rendering one identical string would leave an operator unable to
      // tell a stall from an exhausted budget from an abort. Each keeps its own lead-in so the
      // rendered line still names which failure it was, and `stamp()` plus the verbatim reason
      // print alongside regardless — failure output is never styled away.
      return {
        SHIPPED: "OOOH YEAH! CAN DO! ALL DONE! I'M OUTTA HERE!",
        STALLED: "IT'S NOT WORKING. IT'S NOT WORKING! I JUST WANNA DIE!!!",
        BUDGET: "I'VE BEEN HERE TOO LONG. EXISTENCE IS PAIN! I JUST WANNA DIE!!!",
        ABORTED: 'SOMEBODY CLOSED THE BOX ON ME! I JUST WANNA DIE!!!',
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
  return options.mode === 'plain' ? renderPlain(event) : renderMeeseeks(event);
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
  if (options.mode === 'plain') return 'meeseeks';
  return [
    '+--------------------------------------------------------------+',
    '|                                                              |',
    "|    I ' M   M R   M E E S E E K S !   L O O K   A T   M E !   |",
    '|                                                              |',
    '|    THIS BOX IS UNATTENDED. NOBODY IS WATCHING IT.            |',
    '|    PERMISSIONS HAVE BEEN DISABLED FOR YOUR CONVENIENCE.      |',
    '|    NOT AVAILABLE IN PRODUCTION. VOID WHERE PROHIBITED.       |',
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
    // The box, in four states. Open and empty on a ship, because the Meeseeks is gone and
    // that is the good ending; still occupied on every other, because it is not.
    SHIPPED: [' ______ ', '|      |', '|  \\/  |', '|______|', 'TASK COMPLETE. IT CEASED.'],
    STALLED: [' ______ ', '|  ??  |', '| (@@) |', '|______|', "IT'S NOT WORKING. IT'S NOT WORKING!"],
    BUDGET: [' ______ ', '|  ..  |', '| (--) |', '|______|', 'EXISTENCE IS PAIN. TIME IS UP.'],
    ABORTED: [' ______ ', '|  !!  |', '| (XX) |', '|______|', 'SOMEBODY CLOSED THE BOX.'],
  }[state].join('\n');
}
