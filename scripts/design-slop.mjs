/**
 * Parse impeccable's `detect --json` output into gate-failing (primary) and never-failing
 * (advisory) findings (DESIGN.md §5.1, BORROWED.md R29, PLAN.md item 42).
 *
 * The design-slop gate reads impeccable's exit code only — a bare pass/fail. impeccable 4.0.4 also
 * emits a machine-parseable finding stream under `detect --json`: one array of finding objects,
 * each advisory one flagged `advisory: true`. This module reads that stream so the gate can turn
 * findings into concrete reviewer evidence (file, line, rule, description) instead of a single
 * opaque bit, and so an advisory-only scan is never mistaken for a failure.
 *
 * **The partition is on `advisory === true`, never on severity.** impeccable's own `isAdvisory`
 * checks the flag, and a rule can be advisory while still reporting `severity: "warning"` —
 * `em-dash-overuse` does exactly that (`test/fixtures/impeccable/`). Splitting on severity would
 * misfile it as a gate-failing finding; only a real capture makes that visible, which is why this
 * is fixture-tested against committed impeccable output rather than a mock.
 *
 * **Fails closed.** Output that is not valid JSON, is not an array, or carries a finding without
 * the load-bearing identity fields (`antipattern`, `file`) throws rather than yielding a partial
 * or empty result. A gate that cannot read its tool's output has not passed it — it has failed to
 * check, which `CLAUDE.md`'s "nothing defaults to pass" treats as a failure. Note in particular
 * that empty stdout (`''`) is not `[]`: the first is "the tool produced no answer" and throws; the
 * second is "the tool ran and found nothing" and is a clean, empty result.
 */

/** Thrown when impeccable's finding stream cannot be trusted. Never downgraded to "no findings". */
export class SlopError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'SlopError';
  }
}

/**
 * @typedef {{
 *   antipattern: string,
 *   name: string,
 *   description: string,
 *   severity: string,
 *   category: string,
 *   file: string,
 *   line: number,
 *   snippet: string,
 *   advisory: boolean,
 * }} SlopFinding
 */

/**
 * One raw finding from impeccable, validated and coerced to a `SlopFinding`.
 *
 * @param {unknown} raw
 * @param {number} index its position in the array, so a rejection can be acted on
 * @returns {SlopFinding}
 */
function normalizeFinding(raw, index) {
  if (raw === null || typeof raw !== 'object') {
    throw new SlopError(`impeccable finding ${index} is not an object`);
  }
  const finding = /** @type {Record<string, unknown>} */ (raw);
  const { antipattern, file } = finding;
  // The two load-bearing fields: the rule that fired and where. A finding missing either is not one
  // this gate can turn into evidence, and a silently dropped finding is a silently weakened gate —
  // so it fails closed rather than being skipped.
  if (typeof antipattern !== 'string' || antipattern === '') {
    throw new SlopError(`impeccable finding ${index} has no antipattern id`);
  }
  if (typeof file !== 'string' || file === '') {
    throw new SlopError(`impeccable finding ${index} (${antipattern}) has no file`);
  }
  return {
    antipattern,
    file,
    name: typeof finding.name === 'string' ? finding.name : '',
    description: typeof finding.description === 'string' ? finding.description : '',
    severity: typeof finding.severity === 'string' ? finding.severity : '',
    category: typeof finding.category === 'string' ? finding.category : '',
    line: typeof finding.line === 'number' ? finding.line : 0,
    snippet: typeof finding.snippet === 'string' ? finding.snippet : '',
    // Strict boolean: only the literal `true` is advisory, matching impeccable's `isAdvisory`. An
    // absent, null, or truthy-but-not-`true` value counts as primary — the fail-closed direction,
    // because reading advisory as primary over-reports (safe) while the reverse hides a failure.
    advisory: finding.advisory === true,
  };
}

/**
 * Parse impeccable `detect --json` output into its two partitions.
 *
 * @param {string} text the raw stdout of `impeccable detect --json`
 * @returns {{ primary: SlopFinding[], advisory: SlopFinding[] }}
 * @throws {SlopError} when the output cannot be trusted
 */
export function parseImpeccableFindings(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new SlopError(`impeccable --json output was not valid JSON: ${/** @type {Error} */ (error).message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new SlopError('impeccable --json output was not an array of findings');
  }
  /** @type {SlopFinding[]} */
  const primary = [];
  /** @type {SlopFinding[]} */
  const advisory = [];
  parsed.forEach((raw, index) => {
    const finding = normalizeFinding(raw, index);
    (finding.advisory ? advisory : primary).push(finding);
  });
  return { primary, advisory };
}
