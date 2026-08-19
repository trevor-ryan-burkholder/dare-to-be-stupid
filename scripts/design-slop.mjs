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

/**
 * How much `detect --json` output this gate will interpret.
 *
 * Smaller than every {@link READ_LIMITS} entry on purpose. Those bound a *file* being read from
 * disk; this bounds a string already in memory that is about to be rendered into a builder's
 * repair context and a reviewer's evidence. A finding stream past this size is not a design report,
 * it is a runaway detector, and turning it into prose would spend the next iteration's context on
 * noise. Refused rather than truncated, because a truncated finding list read as complete is the
 * shape `DESIGN.md` §4 refuses everywhere else.
 */
export const SLOP_OUTPUT_LIMIT = 1024 * 1024;

/** How many findings of each partition reach the rendered detail before it says it stopped. */
export const SLOP_RENDER_LIMIT = 25;

/** The exit code impeccable uses for "primary findings exist". */
const SLOP_FAIL_STATUS = 2;

/**
 * @param {SlopFinding} finding
 * @returns {string}
 */
function renderFinding(finding) {
  const where = finding.line > 0 ? `${finding.file}:${finding.line}` : finding.file;
  const what = finding.description === '' ? finding.name : finding.description;
  return `  - ${finding.antipattern} at ${where}${what === '' ? '' : `: ${what}`}`;
}

/**
 * @param {string} heading
 * @param {SlopFinding[]} findings
 * @returns {string[]}
 */
function renderPartition(heading, findings) {
  if (findings.length === 0) return [];
  const shown = findings.slice(0, SLOP_RENDER_LIMIT);
  const lines = [`${heading} (${findings.length}):`, ...shown.map(renderFinding)];
  // Truncation is stated rather than silent. A list that stops at 25 and does not say so reads as
  // a complete one, and the builder repairs what it can see and ships believing it is done.
  if (findings.length > shown.length) {
    lines.push(`  - ... and ${findings.length - shown.length} more, not shown`);
  }
  return lines;
}

/**
 * Turn one `impeccable detect --json` run into a gate result with real evidence.
 *
 * **Why this exists.** The gate read impeccable's exit code and nothing else, so a failing design
 * pass reached the builder as a bare non-zero exit and, at best, a raw JSON blob in the failure
 * detail. The findings were already machine-parseable; nothing was reading them.
 *
 * **Advisory findings never decide.** They are rendered so a reviewer and a builder can see them,
 * and they are excluded from `ok` — impeccable's own `isAdvisory` marks rules that report a real
 * observation without claiming a defect, and granting them gate authority would fail a run over
 * em-dash counts. Only primary findings fail this gate.
 *
 * **The exit code and the findings must agree.** impeccable exits 2 exactly when primary findings
 * exist, so a disagreement means the output is not the run that produced that status — a wrapper
 * swallowing stdout, a shell redirect, a version whose contract moved. That is refused rather than
 * resolved in either direction: trusting the status would let an empty stream pass as clean, and
 * trusting the findings would let a crashed detector report success.
 *
 * Everything here fails closed. Unparseable output, oversized output, a status that contradicts
 * the stream, a crash: all of them return `ok: false`.
 *
 * @param {{ stdout: string, status: number, stderr?: string }} outcome what the gate command did
 * @returns {{ ok: boolean, detail: string }}
 */
export function designSlopEvidence(outcome) {
  const stdout = typeof outcome.stdout === 'string' ? outcome.stdout : '';
  const stderr = typeof outcome.stderr === 'string' ? outcome.stderr.trim() : '';
  if (stdout.length > SLOP_OUTPUT_LIMIT) {
    return {
      ok: false,
      detail:
        `impeccable produced ${stdout.length} bytes of findings, over the ${SLOP_OUTPUT_LIMIT}-byte limit ` +
        'this gate will interpret. Refused rather than truncated: a partial finding list read as a complete ' +
        'one is worse than no list at all.',
    };
  }
  if (stdout.trim() === '') {
    return {
      ok: false,
      detail:
        'impeccable produced no output at all on a gate that is supposed to emit a JSON finding array. ' +
        `Exit status was ${outcome.status}. An empty stream is not evidence of a clean design pass` +
        (stderr === '' ? '.' : `:\n${stderr}`),
    };
  }
  /** @type {{ primary: SlopFinding[], advisory: SlopFinding[] }} */
  let findings;
  try {
    findings = parseImpeccableFindings(stdout);
  } catch (error) {
    return {
      ok: false,
      detail: `impeccable's finding stream could not be trusted: ${/** @type {Error} */ (error).message}`,
    };
  }
  const { primary, advisory } = findings;
  const expected = primary.length > 0 ? SLOP_FAIL_STATUS : 0;
  if (outcome.status !== expected) {
    return {
      ok: false,
      detail:
        `impeccable exited ${outcome.status} while reporting ${primary.length} primary and ${advisory.length} ` +
        `advisory findings, but it exits ${SLOP_FAIL_STATUS} exactly when primary findings exist and 0 otherwise. ` +
        'The status and the stream describe different runs, so neither is used.',
    };
  }
  const lines = [
    ...renderPartition('design-slop findings that fail this gate', primary),
    ...renderPartition('advisory findings, recorded but not gate-failing', advisory),
  ];
  if (primary.length === 0) {
    return {
      ok: true,
      detail:
        lines.length === 0
          ? 'impeccable found nothing, primary or advisory'
          : ['no gate-failing design findings', ...lines].join('\n'),
    };
  }
  return { ok: false, detail: lines.join('\n') };
}
