/**
 * Tests for reporter parsing and test-ID extraction (DESIGN.md §11).
 *
 * Everything that touches an external format is asserted against committed output from a
 * real run — see `test/fixtures/reporters/README.md`. The expected ID sets below are
 * written out in full, on purpose: a test that only counts IDs, or only checks the set is
 * non-empty, would keep passing while the parser quietly lost half of them, which is the
 * exact failure DESIGN.md §11 warns about.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { extractTestIds } from '../scripts/ratchet.mjs';
import { decodeXmlEntities } from '../scripts/reporters/trx.mjs';
import {
  MAX_REPORT_TESTS,
  REPORTERS,
  ReportFormatError,
  collapseByWorstStatus,
  detectRunner,
  parseReport,
} from '../scripts/reporters/index.mjs';

const FIXTURE_DIR = new URL('./fixtures/reporters/', import.meta.url);

/** A stable root for reports this file synthesises rather than reads from a fixture. */
const ROOT = '/repo';

/** @param {string} name */
function readFixture(name) {
  return readFileSync(new URL(name, FIXTURE_DIR), 'utf8');
}

/** @type {Record<string, { runner: string, version: string, rootDir: string }>} */
const PROVENANCE = JSON.parse(readFixture('provenance.json'));
const VITEST_ROOT = PROVENANCE['vitest-4.1.10'].rootDir;
const PLAYWRIGHT_ROOT = PROVENANCE['playwright-1.62.1'].rootDir;

const VITEST_RUN1 = readFixture('vitest-4.1.10-run1.json');
const VITEST_RUN2 = readFixture('vitest-4.1.10-run2.json');
const PLAYWRIGHT_RUN1 = readFixture('playwright-1.62.1-run1.json');
const PLAYWRIGHT_RUN2 = readFixture('playwright-1.62.1-run2.json');

// ---------------------------------------------------------------------------
// vitest
// ---------------------------------------------------------------------------

const VITEST_EXPECTED = [
  ['test/math.test.js::adds at the top level', 'passed'],
  ['test/math.test.js::arithmetic > adds two numbers', 'passed'],
  ['test/math.test.js::arithmetic > edge cases > handles zero', 'passed'],
  ['test/math.test.js::arithmetic > edge cases > is deliberately broken', 'failed'],
  ['test/math.test.js::arithmetic > edge cases > is skipped on purpose', 'skipped'],
  ['test/math.test.js::arithmetic > adds 1 + 1', 'passed'],
  ['test/math.test.js::arithmetic > adds 2 + 3', 'passed'],
  ['test/math.test.js::is not written yet', 'skipped'],
  ['test/strings.test.js::a second file contributes ids too', 'passed'],
];

describe('vitest 4.1.10 reporter output', () => {
  it('is recognised as vitest', () => {
    assert.equal(detectRunner(JSON.parse(VITEST_RUN1)), 'vitest');
  });

  it('parses to exactly the tests the run contained, with their statuses', () => {
    const { runner, tests } = parseReport(VITEST_RUN1, { rootDir: VITEST_ROOT });
    assert.equal(runner, 'vitest');
    assert.deepStrictEqual(
      tests.map((t) => [t.id, t.status]),
      VITEST_EXPECTED,
    );
  });

  it('extracts exactly the passing ids', () => {
    assert.deepStrictEqual(
      extractTestIds(VITEST_RUN1, { rootDir: VITEST_ROOT }),
      new Set([
        'test/math.test.js::adds at the top level',
        'test/math.test.js::arithmetic > adds two numbers',
        'test/math.test.js::arithmetic > edge cases > handles zero',
        'test/math.test.js::arithmetic > adds 1 + 1',
        'test/math.test.js::arithmetic > adds 2 + 3',
        'test/strings.test.js::a second file contributes ids too',
      ]),
    );
  });

  it('leaves the failing, skipped and todo tests out of the ratchet', () => {
    const ids = extractTestIds(VITEST_RUN1, { rootDir: VITEST_ROOT });
    assert.equal(ids.has('test/math.test.js::arithmetic > edge cases > is deliberately broken'), false);
    assert.equal(ids.has('test/math.test.js::arithmetic > edge cases > is skipped on purpose'), false);
    assert.equal(ids.has('test/math.test.js::is not written yet'), false);
  });

  it('carries the parameterised titles that test.each generated', () => {
    const ids = extractTestIds(VITEST_RUN1, { rootDir: VITEST_ROOT });
    assert.equal(ids.has('test/math.test.js::arithmetic > adds 1 + 1'), true);
    assert.equal(ids.has('test/math.test.js::arithmetic > adds 2 + 3'), true);
  });

  it('yields an identical id set on a second identical run', () => {
    assert.deepStrictEqual(
      extractTestIds(VITEST_RUN2, { rootDir: VITEST_ROOT }),
      extractTestIds(VITEST_RUN1, { rootDir: VITEST_ROOT }),
    );
  });

  it('yields a non-empty id set, which is what the ratchet has to protect', () => {
    assert.equal(extractTestIds(VITEST_RUN1, { rootDir: VITEST_ROOT }).size, 6);
  });
});

// ---------------------------------------------------------------------------
// Playwright
// ---------------------------------------------------------------------------

const PLAYWRIGHT_EXPECTED = [
  ['tests/checkout.spec.js::signs in at the top level::chromium', 'passed'],
  ['tests/checkout.spec.js::signs in at the top level::firefox', 'passed'],
  ['tests/checkout.spec.js::cart > adds an item::chromium', 'passed'],
  ['tests/checkout.spec.js::cart > is flaky on purpose::chromium', 'flaky'],
  ['tests/checkout.spec.js::cart > adds an item::firefox', 'passed'],
  ['tests/checkout.spec.js::cart > is flaky on purpose::firefox', 'flaky'],
  ['tests/checkout.spec.js::cart > totals > sums line items::chromium', 'passed'],
  ['tests/checkout.spec.js::cart > totals > is deliberately broken::chromium', 'failed'],
  ['tests/checkout.spec.js::cart > totals > is skipped on purpose::chromium', 'skipped'],
  ['tests/checkout.spec.js::cart > totals > sums line items::firefox', 'passed'],
  ['tests/checkout.spec.js::cart > totals > is deliberately broken::firefox', 'failed'],
  ['tests/checkout.spec.js::cart > totals > is skipped on purpose::firefox', 'skipped'],
  ['tests/search.spec.js::a second file contributes ids too::chromium', 'passed'],
  ['tests/search.spec.js::a second file contributes ids too::firefox', 'passed'],
];

describe('playwright 1.62.1 reporter output', () => {
  it('is recognised as playwright', () => {
    assert.equal(detectRunner(JSON.parse(PLAYWRIGHT_RUN1)), 'playwright');
  });

  it('parses to exactly the tests the run contained, with their statuses', () => {
    const { runner, tests } = parseReport(PLAYWRIGHT_RUN1, { rootDir: PLAYWRIGHT_ROOT });
    assert.equal(runner, 'playwright');
    assert.deepStrictEqual(
      tests.map((t) => [t.id, t.status]),
      PLAYWRIGHT_EXPECTED,
    );
  });

  it('extracts exactly the passing ids', () => {
    assert.deepStrictEqual(
      extractTestIds(PLAYWRIGHT_RUN1, { rootDir: PLAYWRIGHT_ROOT }),
      new Set([
        'tests/checkout.spec.js::signs in at the top level::chromium',
        'tests/checkout.spec.js::signs in at the top level::firefox',
        'tests/checkout.spec.js::cart > adds an item::chromium',
        'tests/checkout.spec.js::cart > adds an item::firefox',
        'tests/checkout.spec.js::cart > totals > sums line items::chromium',
        'tests/checkout.spec.js::cart > totals > sums line items::firefox',
        'tests/search.spec.js::a second file contributes ids too::chromium',
        'tests/search.spec.js::a second file contributes ids too::firefox',
      ]),
    );
  });

  it('keeps the same spec under two projects as two distinct ids', () => {
    const ids = extractTestIds(PLAYWRIGHT_RUN1, { rootDir: PLAYWRIGHT_ROOT });
    assert.equal(ids.has('tests/checkout.spec.js::cart > totals > sums line items::chromium'), true);
    assert.equal(ids.has('tests/checkout.spec.js::cart > totals > sums line items::firefox'), true);
  });

  it('does not admit a flaky test to the ratchet', () => {
    const ids = extractTestIds(PLAYWRIGHT_RUN1, { rootDir: PLAYWRIGHT_ROOT });
    assert.equal(ids.has('tests/checkout.spec.js::cart > is flaky on purpose::chromium'), false);
    assert.equal(ids.has('tests/checkout.spec.js::cart > is flaky on purpose::firefox'), false);
  });

  it('reports flaky separately when asked, so the driver can still see it', () => {
    assert.deepStrictEqual(
      extractTestIds(PLAYWRIGHT_RUN1, { rootDir: PLAYWRIGHT_ROOT, statuses: ['flaky'] }),
      new Set([
        'tests/checkout.spec.js::cart > is flaky on purpose::chromium',
        'tests/checkout.spec.js::cart > is flaky on purpose::firefox',
      ]),
    );
  });

  it('does not let the file-level suite title leak into the title path', () => {
    for (const id of extractTestIds(PLAYWRIGHT_RUN1, { rootDir: PLAYWRIGHT_ROOT })) {
      assert.equal(id.includes('.spec.js > '), false, `file title leaked into ${id}`);
    }
  });

  it('yields an identical id set on a second identical run', () => {
    assert.deepStrictEqual(
      extractTestIds(PLAYWRIGHT_RUN2, { rootDir: PLAYWRIGHT_ROOT }),
      extractTestIds(PLAYWRIGHT_RUN1, { rootDir: PLAYWRIGHT_ROOT }),
    );
  });

  it('yields a non-empty id set, which is what the ratchet has to protect', () => {
    assert.equal(extractTestIds(PLAYWRIGHT_RUN1, { rootDir: PLAYWRIGHT_ROOT }).size, 8);
  });
});

// ---------------------------------------------------------------------------
// The two runners must not produce colliding or overlapping ids
// ---------------------------------------------------------------------------

describe('ids across runners', () => {
  it('never collide', () => {
    const vitest = extractTestIds(VITEST_RUN1, { rootDir: VITEST_ROOT });
    const playwright = extractTestIds(PLAYWRIGHT_RUN1, { rootDir: PLAYWRIGHT_ROOT });
    const shared = [...vitest].filter((id) => playwright.has(id));
    assert.deepStrictEqual(shared, []);
  });

  it('name the same test the same way on both runs of the same runner', () => {
    assert.deepStrictEqual(
      parseReport(VITEST_RUN2, { rootDir: VITEST_ROOT }).tests.map((t) => t.id),
      parseReport(VITEST_RUN1, { rootDir: VITEST_ROOT }).tests.map((t) => t.id),
    );
  });
});

// ---------------------------------------------------------------------------
// Nothing defaults to pass
// ---------------------------------------------------------------------------

describe('reports that cannot be understood', () => {
  it('throws on a shape belonging to neither runner', () => {
    assert.throws(
      () => extractTestIds({ tests: [{ name: 'a', ok: true }] }, { rootDir: '/repo' }),
      ReportFormatError,
    );
  });

  it('throws on text that is not JSON', () => {
    assert.throws(() => extractTestIds('not json at all', { rootDir: '/repo' }), ReportFormatError);
  });

  it('throws rather than returning an empty set, which would disable the ratchet', () => {
    let threw = false;
    try {
      extractTestIds({ unrecognised: true }, { rootDir: '/repo' });
    } catch (error) {
      threw = true;
      assert.equal(/** @type {Error} */ (error).name, 'ReportFormatError');
    }
    assert.equal(threw, true);
  });

  it('throws on a vitest status it has never seen', () => {
    const report = JSON.parse(VITEST_RUN1);
    report.testResults[0].assertionResults[0].status = 'quarantined';
    assert.throws(
      () => extractTestIds(report, { rootDir: VITEST_ROOT }),
      (error) => error instanceof ReportFormatError && error.message.includes('"quarantined"') === true,
    );
  });

  it('throws on a playwright status it has never seen', () => {
    const report = JSON.parse(PLAYWRIGHT_RUN1);
    report.suites[0].specs[0].tests[0].status = 'interrupted';
    assert.throws(
      () => extractTestIds(report, { rootDir: PLAYWRIGHT_ROOT }),
      (error) => error instanceof ReportFormatError && error.message.includes('"interrupted"') === true,
    );
  });

  it('throws when a vitest file entry loses its name', () => {
    const report = JSON.parse(VITEST_RUN1);
    delete report.testResults[0].name;
    assert.throws(() => extractTestIds(report, { rootDir: VITEST_ROOT }), ReportFormatError);
  });

  it('throws when a playwright spec loses its tests array', () => {
    const report = JSON.parse(PLAYWRIGHT_RUN1);
    delete report.suites[0].specs[0].tests;
    assert.throws(() => extractTestIds(report, { rootDir: PLAYWRIGHT_ROOT }), ReportFormatError);
  });

  it('throws without a rootDir, because ids must be relative to something stable', () => {
    assert.throws(() => extractTestIds(VITEST_RUN1, /** @type {any} */ ({})), ReportFormatError);
  });

  it('returns an empty set for a well-formed run containing no tests', () => {
    // Distinct from an unparseable report: "no test files" is a real state. Refusing to
    // advance on it is the ratchet's job, not the parser's (DESIGN.md §11).
    const empty = { numTotalTests: 0, testResults: [] };
    assert.deepStrictEqual(extractTestIds(empty, { rootDir: '/repo' }), new Set());
  });
});

// ---------------------------------------------------------------------------
// Duplicate ids must not let a pass hide a failure
// ---------------------------------------------------------------------------

describe('collapseByWorstStatus', () => {
  it('keeps the failure when the same id both passed and failed', () => {
    assert.deepStrictEqual(
      collapseByWorstStatus([
        { id: 'a::t', status: 'passed' },
        { id: 'a::t', status: 'failed' },
      ]),
      new Map([['a::t', 'failed']]),
    );
  });

  it('keeps the failure regardless of the order they arrived in', () => {
    assert.deepStrictEqual(
      collapseByWorstStatus([
        { id: 'a::t', status: 'failed' },
        { id: 'a::t', status: 'passed' },
      ]),
      new Map([['a::t', 'failed']]),
    );
  });

  it('ranks flaky worse than skipped and skipped worse than passed', () => {
    assert.deepStrictEqual(
      collapseByWorstStatus([
        { id: 'a::t', status: 'passed' },
        { id: 'a::t', status: 'skipped' },
        { id: 'b::t', status: 'skipped' },
        { id: 'b::t', status: 'flaky' },
      ]),
      new Map([
        ['a::t', 'skipped'],
        ['b::t', 'flaky'],
      ]),
    );
  });

  it('leaves distinct ids alone', () => {
    assert.deepStrictEqual(
      collapseByWorstStatus([
        { id: 'a::t', status: 'passed' },
        { id: 'b::t', status: 'passed' },
      ]),
      new Map([
        ['a::t', 'passed'],
        ['b::t', 'passed'],
      ]),
    );
  });

  it('drops a duplicate id from the passing set when one of them failed', () => {
    const report = JSON.parse(VITEST_RUN1);
    const [first] = report.testResults[0].assertionResults;
    report.testResults[0].assertionResults.push({ ...first, status: 'failed' });
    const ids = extractTestIds(report, { rootDir: VITEST_ROOT });
    assert.equal(ids.has('test/math.test.js::adds at the top level'), false);
    assert.equal(ids.size, 5);
  });
});

// ---------------------------------------------------------------------------
// detectRunner
// ---------------------------------------------------------------------------

describe('detectRunner', () => {
  const cases = [
    [null, null],
    ['a string', null],
    [{}, null],
    [{ testResults: [] }, null],
    [{ numTotalTests: 0 }, null],
    [{ numTotalTests: 0, testResults: [] }, 'vitest'],
    [{ suites: [] }, null],
    [{ suites: [], config: {} }, null],
    [{ suites: [], config: { rootDir: '/repo' } }, 'playwright'],
  ];
  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} -> ${JSON.stringify(expected)}`, () => {
      assert.equal(detectRunner(input), expected);
    });
  }

  it('does not mistake an array for a report', () => {
    // `typeof [] === 'object'`, so an array reaches the reporters unless it is rejected here.
    assert.equal(detectRunner([]), null);
    assert.equal(detectRunner([{ numTotalTests: 0, testResults: [] }]), null);

    // **The case the guard actually exists for.** Both lines above fail every detector on their
    // own merits — an empty array has no `testResults`, and an array *containing* a report is not
    // one — so the `Array.isArray` rejection could be deleted and they would still pass. An array
    // may carry the very fields a detector reads, which is legal and is what a malformed or
    // hostile report looks like.
    const wearingAReport = /** @type {any} */ ([]);
    wearingAReport.testResults = [];
    wearingAReport.numTotalTests = 0;
    assert.equal(detectRunner(wearingAReport), null, 'an array wearing a report was accepted as one');
  });
});

// ---------------------------------------------------------------------------
// The registry itself
// ---------------------------------------------------------------------------

describe('the reporter registry', () => {
  it('holds exactly the formats this build claims to read', () => {
    assert.deepEqual(
      REPORTERS.map((reporter) => reporter.name),
      ['vitest', 'playwright'],
    );
  });

  it('gives every reporter the whole contract, so a half-written one cannot register', () => {
    for (const reporter of REPORTERS) {
      assert.equal(typeof reporter.name, 'string');
      assert.equal(typeof reporter.detect, 'function');
      assert.equal(typeof reporter.parse, 'function');
    }
  });

  it('registers no two reporters under one name', () => {
    // `parseReport` resolves a detected name back to a reporter by `find`, so a duplicate
    // name would silently route one format's reports into the other's parser.
    const names = REPORTERS.map((reporter) => reporter.name);
    assert.equal(new Set(names).size, names.length);
  });

  it('keeps the detectors disjoint, so detection order cannot change an answer', () => {
    // First-match-wins is deliberate, but nothing today should depend on the order. If a
    // future format is a superset of another, this fails and the ordering becomes a decision
    // someone has to make on purpose rather than inherit.
    /** @type {Record<string, unknown>[]} */
    const reports = [
      { numTotalTests: 0, testResults: [] },
      { suites: [], config: { rootDir: '/repo' } },
    ];
    for (const report of reports) {
      const matched = REPORTERS.filter((reporter) => reporter.detect(report)).map((reporter) => reporter.name);
      assert.equal(matched.length, 1, `${JSON.stringify(report)} matched ${matched.join(', ')}`);
    }
  });

  it('names every known reporter when it can identify none of them', () => {
    // The operator reading this abort is trying to work out which runner to configure.
    assert.throws(
      () => parseReport({ unrecognised: true }, { rootDir: '/repo' }),
      (error) =>
        error instanceof ReportFormatError &&
        error.message.includes('vitest') &&
        error.message.includes('playwright'),
    );
  });
});

describe('TRX, against real dotnet output', () => {
  const TRX_PASSING = readFixture('dotnet-8.0.423-passing.trx');
  const TRX_THEORIES = readFixture('dotnet-8.0.423-live.trx');
  const TRX_FAILING = readFixture('dotnet-8.0.423-failing.trx');

  it('keeps each theory case as its own id, parameters and all', () => {
    // Captured live from dotnet test 8.0.423 on 14 Aug 2026 (an xunit [Theory] with two
    // [InlineData] rows plus a [Fact(Skip)]). Each InlineData case must be its own ratchet id:
    // if `Counts_rows(n: 1)` and `(n: 2)` collapsed into one, a regression in either would hide
    // behind the other, and the ratchet would under-protect every parameterised test in .NET.
    const ids = extractTestIds(TRX_THEORIES, { rootDir: '/repo' });
    assert.deepStrictEqual(
      [...ids].sort(),
      [
        'RealTrx.ParserTests.Counts_rows(n: 1)',
        'RealTrx.ParserTests.Counts_rows(n: 2)',
        'RealTrx.ParserTests.Parses_a_quoted_field',
        'RealTrx.ParserTests.Rejects_an_unterminated_quote',
      ],
    );
  });

  it('is detected as trx rather than dying as invalid JSON', () => {
    // parseReport used to begin with JSON.parse, so XML died as "report is not valid JSON" —
    // true, and the wrong fault. It sends a reader to look for a corrupt file rather than an
    // unregistered format.
    assert.equal(parseReport(TRX_PASSING, { rootDir: '/repo' }).runner, 'trx');
  });

  it('reads exactly the tests, and not the run-level outcomes', () => {
    // The trap. The failing fixture carries six `outcome=` attributes: three UnitTestResult,
    // one ResultSummary and two RunInfo. A naive read admits three phantom results, one of
    // them into the ratchet.
    const { tests } = parseReport(TRX_FAILING, { rootDir: '/repo' });
    // Sorted for the assertion, not by the reader. TRX emits in execution order, which is a
    // property of the scheduler rather than of the report; the ratchet builds a Set from
    // these, so pinning the emitted order would assert an accident.
    assert.deepEqual(
      [...tests].sort((a, b) => a.id.localeCompare(b.id)),
      [
        { id: 'Probe.Tests.CalcTests.AddsNegatives', status: 'failed' },
        { id: 'Probe.Tests.CalcTests.AddsTwoNumbers', status: 'passed' },
        { id: 'Probe.Tests.CalcTests.SkippedOne', status: 'skipped' },
      ],
    );
  });

  it('reports a skip as skipped, though TRX calls it NotExecuted', () => {
    const { tests } = parseReport(TRX_PASSING, { rootDir: '/repo' });
    const skipped = tests.filter((test) => test.status === 'skipped');
    assert.deepEqual(skipped, [{ id: 'Probe.Tests.CalcTests.SkippedOne', status: 'skipped' }]);
  });

  it('yields only the passing ids to the ratchet', () => {
    assert.deepEqual(
      extractTestIds(TRX_PASSING, { rootDir: '/repo' }),
      new Set(['Probe.Tests.CalcTests.AddsNegatives', 'Probe.Tests.CalcTests.AddsTwoNumbers']),
    );
  });

  it('drops the failing test from the passing set, and keeps the other', () => {
    assert.deepEqual(
      extractTestIds(TRX_FAILING, { rootDir: '/repo' }),
      new Set(['Probe.Tests.CalcTests.AddsTwoNumbers']),
    );
  });

  it('builds identity from the test name and never from the paths in the file', () => {
    // TRX records `storage` (absolute AND lowercased by the runner) and `codeBase` (absolute).
    // An id built from either differs between machines, and the ratchet would read every test
    // as new on the first run elsewhere — a silent widening rather than a parse error.
    const ids = [...extractTestIds(TRX_PASSING, { rootDir: '/repo' })];
    for (const id of ids) {
      assert.equal(id.includes('/'), false, `id carries a path: ${id}`);
      assert.equal(id.includes('.dll'), false, `id carries an assembly: ${id}`);
    }
  });

  it('gives the same ids whatever rootDir it is handed, because ids are not paths', () => {
    assert.deepEqual(
      extractTestIds(TRX_PASSING, { rootDir: '/repo' }),
      extractTestIds(TRX_PASSING, { rootDir: '/somewhere/else/entirely' }),
    );
  });

  it('throws on an outcome it has no defined meaning for, naming the value', () => {
    // The registry's rule, unweakened for the new format. Mapping Inconclusive to passed
    // admits it to the ratchet; mapping it to failed hard-resets on a word nobody has read.
    const mutated = TRX_PASSING.replace('outcome="Passed"', 'outcome="Inconclusive"');
    assert.throws(
      () => parseReport(mutated, { rootDir: '/repo' }),
      (error) => error instanceof ReportFormatError && error.message.includes('Inconclusive'),
    );
  });

  it('throws on a result carrying no outcome at all', () => {
    const mutated = TRX_PASSING.replace(/outcome="Passed"/, '');
    assert.throws(() => parseReport(mutated, { rootDir: '/repo' }), ReportFormatError);
  });

  it('does not throw on a run that contained no tests', () => {
    // "No test files" is a real state. Refusing to advance on it belongs to the ratchet, not
    // to a parser — and this is the state both live runs on 10 August produced.
    const empty = '<?xml version="1.0" encoding="utf-8"?>\n<TestRun id="x"><Results /></TestRun>';
    assert.deepEqual(parseReport(empty, { rootDir: '/repo' }).tests, []);
  });

  it('decodes entities, since theory names carry quotes and angle brackets', () => {
    assert.equal(decodeXmlEntities('Ns.C.M(s: &quot;a&amp;b&quot;, t: &lt;x&gt;)'), 'Ns.C.M(s: "a&b", t: <x>)');
  });

  it('does not double-decode an escaped ampersand', () => {
    // `&amp;lt;` is the literal text "&lt;", not a less-than sign. Replacing &amp; last would
    // silently rewrite a test name that legitimately contains it.
    assert.equal(decodeXmlEntities('&amp;lt;'), '&lt;');
  });
});

describe('a report may not amplify past what the ratchet will carry (REVIEW F19)', () => {
  /** @param {number} count a vitest report declaring `count` passing tests */
  const reportOf = (count) => ({
    numTotalTests: count,
    testResults: [
      {
        name: `${ROOT}/test/a.test.js`,
        assertionResults: Array.from({ length: count }, (_, index) => ({
          ancestorTitles: [],
          title: `case ${index}`,
          status: 'passed',
        })),
      },
    ],
  });

  it('carries an ordinary suite without complaint', () => {
    // The neighbour first, and it is not decoration: a ceiling set below a real suite would be
    // discovered by a monorepo mid-run, at the moment the ratchet stopped being able to advance.
    assert.equal(parseReport(reportOf(1_000), { rootDir: ROOT }).tests.length, 1_000);
  });

  it('refuses a report past the ceiling, and says how far past', () => {
    // **A byte ceiling does not bound what a parser allocates from those bytes.** 32MB of
    // `{"t":"x","s":"passed"}` is on the order of a million records, each becoming an id string, a
    // Set entry, a line of monotonic state and a digest — all downstream of the read.
    assert.throws(
      () => parseReport(reportOf(MAX_REPORT_TESTS + 1), { rootDir: ROOT }),
      (error) =>
        error instanceof ReportFormatError &&
        error.message.includes(String(MAX_REPORT_TESTS + 1)) &&
        error.message.includes(String(MAX_REPORT_TESTS)),
    );
  });

  it('refuses rather than truncating, and says why that is the choice', () => {
    // F19 states it directly: do not silently truncate evidence. A report parsed down to its first
    // records would advance the ratchet on a subset and record every dropped id as a regression on
    // the next run — a hard reset caused by the size of the report rather than by the code.
    try {
      parseReport(reportOf(MAX_REPORT_TESTS + 1), { rootDir: ROOT });
      assert.fail('an oversized report was accepted');
    } catch (error) {
      assert.match(String(/** @type {Error} */ (error).message), /Refusing rather than truncating/);
      assert.match(String(/** @type {Error} */ (error).message), /regression on the next run/);
    }
  });

  it('accepts exactly the ceiling, so the boundary is the number it names', () => {
    assert.equal(parseReport(reportOf(MAX_REPORT_TESTS), { rootDir: ROOT }).tests.length, MAX_REPORT_TESTS);
  });
});
