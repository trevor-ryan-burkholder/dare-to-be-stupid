/**
 * TRX — the report `dotnet test --logger trx` writes (DESIGN.md §11).
 *
 * This is the first non-JSON format in the registry, and it arrives with two hazards that the
 * vitest and Playwright readers never had to think about.
 *
 * ## Hazard one: the file carries outcomes that are not test outcomes
 *
 * A TRX from a run with a single failing test contains **six** `outcome=` attributes:
 *
 * ```
 * ResultSummary   -> Failed        (the run as a whole)
 * RunInfo         -> Error         (a diagnostic)
 * RunInfo         -> Warning       (a diagnostic)
 * UnitTestResult  -> Failed        }
 * UnitTestResult  -> NotExecuted   }  the three actual tests
 * UnitTestResult  -> Passed        }
 * ```
 *
 * Read naively, that is three phantom results, one of which would enter the ratchet. So this
 * reader matches `<UnitTestResult …>` specifically and nothing else. The count was verified
 * against real output rather than reasoned about; both fixtures are committed.
 *
 * ## Hazard two: identity must not come from the paths in the file
 *
 * TRX records two locations per test, and neither is usable as identity. `storage` is an
 * **absolute** path, **lowercased** by the runner (`/repo/tests/probe.tests/bin/debug/…`),
 * while `codeBase` is absolute with its case intact. An id built from either would differ
 * between two machines, and the ratchet would read every test as new on the first run
 * elsewhere — which is the silent failure §11 exists to prevent, arriving as a *widening*
 * rather than as a parse error.
 *
 * `testName` is the fully qualified `Namespace.Class.Method` and is stable across runs and
 * machines, so it is the whole id. That makes a TRX id shorter than a vitest one, which is
 * correct: the ratchet needs identity, not provenance.
 *
 * ## On parsing XML with a regular expression
 *
 * Hard constraint 1 forbids a runtime dependency, so there is no XML parser here. What makes
 * that tolerable rather than reckless is how narrow the question is: two attributes of one
 * element type. XML forbids a raw `"` inside a double-quoted attribute value — it must be
 * `&quot;` — so `testName="([^"]*)"` cannot run past the end of the value, which is the usual
 * way this goes wrong. Entities are decoded afterwards, because xunit `[Theory]` names carry
 * quotes and angle brackets routinely.
 *
 * This is still the most likely thing in the registry to be wrong about a TRX nobody has seen
 * yet, and it is deliberately the narrowest reader that answers the question.
 */

import { ReportFormatError } from './shared.mjs';

/** @typedef {import('./shared.mjs').TestRecord} TestRecord */

/**
 * TRX outcomes this reader will map, and what each means to the ratchet.
 *
 * Deliberately partial. The TRX vocabulary also contains `Inconclusive`, `Warning`, `Pending`,
 * `InProgress`, `Disconnected`, `PassedButRunAborted` and `Completed`, and none of them has an
 * obvious reading here — mapping one to `passed` would admit it to the ratchet, and mapping it
 * to `failed` would fire a hard reset on a word nobody has read. So they throw, by name, which
 * is the rule the registry already applies to every other format.
 *
 * @type {Record<string, import('./shared.mjs').TestStatus>}
 */
export const TRX_OUTCOMES = {
  Passed: 'passed',
  Failed: 'failed',
  Error: 'failed',
  Timeout: 'failed',
  Aborted: 'failed',
  NotRunnable: 'failed',
  NotExecuted: 'skipped',
};

/** The five predefined XML entities. Nothing else is legal unescaped in an attribute value. */
const ENTITIES = /** @type {Record<string, string>} */ ({
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
  '&quot;': '"',
  '&apos;': "'",
});

/**
 * @param {string} text
 * @returns {string}
 */
export function decodeXmlEntities(text) {
  // One pass, not five. Replacing `&amp;` last would turn `&amp;lt;` into `<` — the classic
  // double-decode, which would silently rewrite a test name that legitimately contains "&lt;".
  return text.replace(/&(?:lt|gt|amp|quot|apos);/g, (entity) => ENTITIES[entity] ?? entity);
}

/** Only `UnitTestResult` elements. See hazard one. */
const UNIT_TEST_RESULT_RE = /<UnitTestResult\b[^>]*>/g;

/**
 * Is this a TRX document?
 *
 * Asks for the root element rather than for the XML declaration, because a declaration is
 * common to every XML file and would make this detector overlap any future one.
 *
 * @param {string} raw
 * @returns {boolean}
 */
function detect(raw) {
  return /<TestRun\b/.test(raw);
}

/**
 * @param {string} raw
 * @returns {TestRecord[]}
 * @throws {ReportFormatError}
 */
function parse(raw) {
  /** @type {TestRecord[]} */
  const tests = [];

  for (const match of raw.matchAll(UNIT_TEST_RESULT_RE)) {
    const element = match[0];
    const name = /\btestName="([^"]*)"/.exec(element);
    const outcome = /\boutcome="([^"]*)"/.exec(element);

    // A result with no name cannot be an id, and a result with no outcome cannot be a status.
    // Skipping either would drop a test the ratchet is entitled to see, and dropping tests is
    // exactly how a report that parses cleanly stops protecting anything.
    if (name === null || outcome === null) {
      throw new ReportFormatError(
        'a TRX UnitTestResult is missing testName or outcome, so it can be neither identified nor judged: ' +
          `${element.slice(0, 200)}`,
      );
    }

    const id = decodeXmlEntities(name[1]).trim();
    if (id === '') {
      throw new ReportFormatError('a TRX UnitTestResult has an empty testName, which cannot be a stable id.');
    }

    if (!Object.hasOwn(TRX_OUTCOMES, outcome[1])) {
      throw new ReportFormatError(
        `TRX outcome ${JSON.stringify(outcome[1])} on ${JSON.stringify(id)} has no defined meaning here. ` +
          `Known outcomes are ${Object.keys(TRX_OUTCOMES).join(', ')}. Mapping an unknown outcome to passed ` +
          'would admit it to the ratchet, and mapping it to failed would hard-reset on a word nobody has read.',
      );
    }

    tests.push({ id, status: TRX_OUTCOMES[outcome[1]] });
  }

  // Zero tests is not an error. "No test files" is a real state, and refusing to advance on it
  // belongs to the ratchet rather than to a parser (§11).
  return tests;
}

/** @type {import('./index.mjs').RawReporter} */
export const trxReporter = { name: 'trx', kind: 'raw', detect, parse };
