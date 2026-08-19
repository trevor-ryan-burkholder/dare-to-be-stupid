/**
 * Parse gitleaks' JSON report into gate-failing evidence (PLAN.md item 29, DESIGN.md §14).
 *
 * **The hole this closes.** `npm audit` judges dependencies and semgrep's ruleset is not a secrets
 * scanner, so a run could ship a tree with a live credential committed in it and every security
 * gate would pass. gitleaks is the one deterministic, single-binary answer to that question.
 *
 * **Everything here was measured against gitleaks 8.30.1 rather than read from documentation**, and
 * the first measurement immediately paid for itself: the `detect` subcommand no longer exists. The
 * captured contract, with the fixtures that prove it, is in `test/fixtures/gitleaks/README.md`.
 *
 * **The exit code cannot be trusted alone, and that is not a stylistic objection.** gitleaks exits 1
 * both when it found secrets and when the scan never happened — a missing target exits 1 with an
 * empty stdout. Judging on the status would read a scan that never ran as a scan that found
 * something, and judging on the findings alone would read it as clean. Both are wrong, so a
 * disagreement between the two is refused.
 *
 * **The report is redacted at the source.** Gate output becomes repair context handed to a builder
 * and evidence handed to a reviewer. A scanner that copied the secret it found into a model's
 * context would widen the exposure it exists to report, so the gate passes `--redact` and this
 * module never renders a `Secret` or `Match` value even if one arrives unredacted.
 */

/** Thrown when gitleaks' report cannot be trusted. Never downgraded to "no secrets". */
export class SecretsError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'SecretsError';
  }
}

/**
 * @typedef {{
 *   ruleId: string,
 *   description: string,
 *   file: string,
 *   startLine: number,
 *   fingerprint: string,
 * }} SecretFinding
 */

/**
 * How much report this gate will interpret. A finding stream past this is a runaway scanner, not a
 * secrets report; refused rather than truncated, because a partial list read as complete is the
 * failure this whole file exists to avoid.
 */
export const SECRETS_OUTPUT_LIMIT = 1024 * 1024;

/** How many findings reach the rendered detail before it says it stopped. */
export const SECRETS_RENDER_LIMIT = 25;

/** The exit code gitleaks uses for "findings exist" (`--exit-code`, default 1). */
const SECRETS_FAIL_STATUS = 1;

/**
 * One raw gitleaks finding, validated and narrowed to the fields that may be rendered.
 *
 * Deliberately does **not** carry `Secret`, `Match`, `Author`, `Email` or `Commit`. The first two
 * are the credential itself; the rest are personal data that a design gate has no business copying
 * into a model's context. A rule id, a location and a description are everything a repair needs.
 *
 * @param {unknown} raw
 * @param {number} index its position in the array, so a rejection can be acted on
 * @returns {SecretFinding}
 */
function normalizeFinding(raw, index) {
  if (raw === null || typeof raw !== 'object') {
    throw new SecretsError(`gitleaks finding ${index} is not an object`);
  }
  const finding = /** @type {Record<string, unknown>} */ (raw);
  const { RuleID: ruleId, File: file } = finding;
  // The two load-bearing fields: which rule fired and where. A finding missing either cannot become
  // evidence, and a silently dropped finding is a silently weakened gate.
  if (typeof ruleId !== 'string' || ruleId === '') {
    throw new SecretsError(`gitleaks finding ${index} has no RuleID`);
  }
  if (typeof file !== 'string' || file === '') {
    throw new SecretsError(`gitleaks finding ${index} (${ruleId}) has no File`);
  }
  return {
    ruleId,
    file,
    description: typeof finding.Description === 'string' ? finding.Description : '',
    startLine: typeof finding.StartLine === 'number' ? finding.StartLine : 0,
    fingerprint: typeof finding.Fingerprint === 'string' ? finding.Fingerprint : '',
  };
}

/**
 * Parse a gitleaks JSON report.
 *
 * @param {string} text the raw stdout of a `--report-format json --report-path -` run
 * @returns {SecretFinding[]}
 * @throws {SecretsError} when the report cannot be trusted
 */
export function parseGitleaksFindings(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new SecretsError(`gitleaks JSON report was not valid JSON: ${/** @type {Error} */ (error).message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new SecretsError('gitleaks JSON report was not an array of findings');
  }
  return parsed.map(normalizeFinding);
}

/**
 * Turn one gitleaks run into a gate result.
 *
 * Fails closed on unparseable output, oversized output, an empty stream, and a status that
 * contradicts the stream.
 *
 * @param {{ stdout: string, status: number, stderr?: string }} outcome
 * @returns {{ ok: boolean, detail: string }}
 */
export function gitleaksEvidence(outcome) {
  const stdout = typeof outcome.stdout === 'string' ? outcome.stdout : '';
  const stderr = typeof outcome.stderr === 'string' ? outcome.stderr.trim() : '';
  if (stdout.length > SECRETS_OUTPUT_LIMIT) {
    return {
      ok: false,
      detail:
        `gitleaks produced ${stdout.length} bytes of findings, over the ${SECRETS_OUTPUT_LIMIT}-byte limit ` +
        'this gate will interpret. Refused rather than truncated.',
    };
  }
  if (stdout.trim() === '') {
    // The measured ambiguity. A missing target exits 1 with nothing on stdout, which is
    // indistinguishable by status from a scan that found a secret.
    return {
      ok: false,
      detail:
        'gitleaks produced no report at all, so it is not known whether this tree was scanned. ' +
        `Exit status was ${outcome.status}, which gitleaks also uses for a target it could not read` +
        (stderr === '' ? '.' : `:\n${stderr}`),
    };
  }
  /** @type {SecretFinding[]} */
  let findings;
  try {
    findings = parseGitleaksFindings(stdout);
  } catch (error) {
    return { ok: false, detail: `gitleaks' report could not be trusted: ${/** @type {Error} */ (error).message}` };
  }
  const expected = findings.length > 0 ? SECRETS_FAIL_STATUS : 0;
  if (outcome.status !== expected) {
    return {
      ok: false,
      detail:
        `gitleaks exited ${outcome.status} while reporting ${findings.length} finding(s), but it exits ` +
        `${SECRETS_FAIL_STATUS} exactly when findings exist and 0 otherwise. The status and the report describe ` +
        'different runs, so neither is used.',
    };
  }
  if (findings.length === 0) return { ok: true, detail: 'gitleaks found no committed secrets' };

  const shown = findings.slice(0, SECRETS_RENDER_LIMIT);
  const lines = [
    `committed secrets found by gitleaks (${findings.length}):`,
    ...shown.map((finding) => {
      const where = finding.startLine > 0 ? `${finding.file}:${finding.startLine}` : finding.file;
      // The secret itself is never rendered. What a repair needs is where it is and which rule saw
      // it; what it must never need is the credential printed a second time.
      return `  - ${finding.ruleId} at ${where}${finding.description === '' ? '' : `: ${finding.description}`}`;
    }),
  ];
  if (findings.length > shown.length) {
    lines.push(`  - ... and ${findings.length - shown.length} more, not shown`);
  }
  lines.push(
    'Remove the credential from the tree and rotate it. A secret that has been committed is ' +
      'compromised even after deletion, because the object remains reachable in the history.',
  );
  return { ok: false, detail: lines.join('\n') };
}
