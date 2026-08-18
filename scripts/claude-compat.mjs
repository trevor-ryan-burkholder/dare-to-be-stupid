/**
 * Which Claude Code releases this build has actually been shown to work with (REVIEW F28).
 *
 * **The check it replaces asked one question: did `claude --version` exit zero.** Any callable
 * binary passed. That is not enough for a product whose behaviour rests on versioned external
 * contracts — `--safe-mode`, `--settings`, `--tools` versus `--allowedTools`, the JSON envelope,
 * hook propagation into `claude -p` children, and command frontmatter. The repository's own live
 * binary-identity test records an ancestor npm binary at **2.1.136 that has never heard of
 * `--safe-mode`**, and a run that starts on it dies after doing work rather than before.
 *
 * **The policy is a record of measurement, not a guess.** F28 is explicit that picking a convenient
 * constant would replace an absent check with unsupported precision, so every bound below cites what
 * was actually run. The floor is the oldest release this repository has demonstrated *against*; the
 * ceiling is the newest it has demonstrated *on*. Neither is inferred from the other, and a greater
 * version number is not evidence of forward compatibility — the CLI documents a coming bare-mode
 * default for `-p` that would change customization discovery and authentication under us.
 *
 * **Both directions refuse, and the newer direction is the uncomfortable one.** A release above the
 * ceiling is refused as *unverified*, not as broken: nobody has run the contract suite on it. The
 * escape is deliberate and cheap — run `MEESEEKS_LIVE=1 npm run test:live` against the new binary
 * and move `VERIFIED_THROUGH` in this file, in one commit, with the evidence. Designing the escape
 * before the enforcement is the rule `AGENTS.md` states for monotonic properties, and a version
 * ceiling is one: without an escape, the next background auto-update bricks every run on the host.
 */

/** @typedef {{ major: number, minor: number, patch: number, prerelease: string | null }} ClaudeVersion */

/**
 * The oldest release this build is known to work with.
 *
 * 2.1.226 is the oldest version with a recorded live measurement in this repository — the envelope
 * shape in `parseClaudeEnvelope` and the guard-registration contract were both verified against it.
 * 2.1.136 is recorded as *incompatible* (no `--safe-mode`), so the true floor is somewhere between;
 * naming the demonstrated one rather than the unknown one is the whole point.
 */
export const SUPPORTED_FLOOR = '2.1.226';

/**
 * The newest release the full live tier has passed on.
 *
 * 2.1.234, on 18 August 2026: `npm run test:live` end to end, including the F27 role-tool canary
 * that measured `--tools ""`, and `claude plugin validate`.
 */
export const VERIFIED_THROUGH = '2.1.234';

/** Why each bound is where it is, printed with a refusal so an operator can check the claim. */
export const COMPATIBILITY_EVIDENCE = [
  '2.1.136 — recorded incompatible: no --safe-mode (test/live/binary-identity.live.test.mjs)',
  '2.1.226 — envelope and guard-registration contracts measured live',
  '2.1.228 — child budget and refusal-message contracts measured live',
  '2.1.234 — full npm run test:live passed, including the --tools canary (18 August 2026)',
];

/**
 * Read a version out of whatever `claude --version` printed.
 *
 * The real binary answers `2.1.234 (Claude Code)`, so the decoration is expected rather than
 * tolerated by accident. Anything that does not yield three integers is `null`, and a `null` is a
 * refusal at every call site: an unparseable version is not evidence of a compatible one.
 *
 * A prerelease suffix is *parsed* rather than discarded, because the caller has to be able to refuse
 * it. `2.2.0-beta.1` orders below `2.2.0` under semver and above it under naive numeric comparison,
 * and a check that guesses which is a check nobody can rely on.
 *
 * @param {string} output
 * @returns {ClaudeVersion | null}
 */
export function parseClaudeVersion(output) {
  if (typeof output !== 'string') return null;
  // Anchored to the start of the trimmed line: a version *mentioned* inside a sentence is not a
  // version report, and matching one anywhere in the output would accept a warning that happens to
  // name a release.
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?\b/.exec(output.trim());
  if (match === null) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] === undefined ? null : match[4],
  };
}

/**
 * Order two parsed versions by release number alone.
 *
 * @param {ClaudeVersion} a @param {ClaudeVersion} b
 * @returns {number} negative when `a` is older, positive when newer, zero when the same release
 */
export function compareVersions(a, b) {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

/**
 * Is this what `claude --version` said acceptable, and if not, exactly why?
 *
 * Four refusals, and they are separate because the repairs differ: install a newer CLI, pin an older
 * one, use a release rather than a prerelease, and "this is not a version at all".
 *
 * @param {string} output what `claude --version` printed
 * @returns {{ ok: true, version: ClaudeVersion } | { ok: false, reason: string, fix: string }}
 */
export function classifyClaudeVersion(output) {
  const version = parseClaudeVersion(output);
  if (version === null) {
    return {
      ok: false,
      reason: `claude --version printed ${JSON.stringify(String(output).trim().slice(0, 120))}, which is not a version`,
      fix: `Expected something beginning \`MAJOR.MINOR.PATCH\`. An unreadable version is not evidence of a compatible one.`,
    };
  }
  if (version.prerelease !== null) {
    return {
      ok: false,
      reason: `claude is a prerelease (${versionText(version)}), and no prerelease has been through this build's contract suite`,
      fix: `Install a released version between ${SUPPORTED_FLOOR} and ${VERIFIED_THROUGH}.`,
    };
  }
  const floor = /** @type {ClaudeVersion} */ (parseClaudeVersion(SUPPORTED_FLOOR));
  const ceiling = /** @type {ClaudeVersion} */ (parseClaudeVersion(VERIFIED_THROUGH));
  if (compareVersions(version, floor) < 0) {
    return {
      ok: false,
      reason: `claude ${versionText(version)} is older than the oldest release this build works with (${SUPPORTED_FLOOR})`,
      fix: 'Update the Claude Code CLI. A run started on an older binary dies partway through rather than at the door.',
    };
  }
  if (compareVersions(version, ceiling) > 0) {
    return {
      ok: false,
      reason: `claude ${versionText(version)} is newer than the newest release this build has been tested on (${VERIFIED_THROUGH})`,
      fix:
        'A greater version number is not evidence of compatibility. Run `MEESEEKS_LIVE=1 npm run test:live` against ' +
        'it and, if it passes, move VERIFIED_THROUGH in scripts/claude-compat.mjs — or pin the CLI to a version in range.',
    };
  }
  return { ok: true, version };
}

/** @param {ClaudeVersion} version @returns {string} */
export function versionText(version) {
  const release = `${version.major}.${version.minor}.${version.patch}`;
  return version.prerelease === null ? release : `${release}-${version.prerelease}`;
}
