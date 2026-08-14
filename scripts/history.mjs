/**
 * Conditional git-history context for the Build Brief (DESIGN.md §8.2).
 *
 * A builder about to change code it did not write is in a different position from one
 * writing a file that did not exist ten minutes ago. Existing code usually looks the way it
 * looks for a reason, and the cheapest place to find that reason is the commit that put it
 * there. So when — and only when — an objective points at mature code, the brief carries a
 * few commit subjects and a blame line.
 *
 * Every condition here exists to keep this from becoming a habit:
 *
 *   - A repository with almost no history has nothing to say. On a run that generated the
 *     whole application an hour ago every commit is Meeseeks's own, and quoting them back to
 *     the builder is quoting the builder.
 *   - A file first touched by this run is not mature, however much history surrounds it.
 *   - Blame is asked for one cited line at a time, never a file at a time.
 *
 * There is no reviewer here, no model, and no analysis. It is `git log` and `git blame`,
 * bounded, with the results handed to `brief.mjs` as data.
 */

/** @typedef {import('./plugins.mjs').Runner} Runner */
/** @typedef {import('./brief.mjs').HistoryNote} HistoryNote */

/** Below this many commits, a repository has no history worth quoting. */
const MIN_REPOSITORY_COMMITS = 5;

/** Below this many commits touching a file, the file is this run's own work. */
const MIN_FILE_COMMITS = 2;

/** How many files one brief may carry history for. */
const MAX_FILES = 3;

/** How many commit subjects per file. */
const MAX_COMMITS = 5;

/** A `path/file.ext:LINE` citation, in the shape the reviewer is required to produce. */
const CITATION = /^(?<file>[^\s:]+\.[A-Za-z0-9]+):(?<line>\d+)$/;

/**
 * Pull the cited locations out of audit findings.
 *
 * Findings arrive as prose with a citation embedded — `PRD-1.2: src/auth.ts:41 has no
 * guard`. Only the citation is wanted, and only when it is well formed; a finding that
 * cites nothing gets no history, which is correct, because there is nothing to look up.
 *
 * @param {string[]} findings
 * @returns {{ file: string, lines: number[] }[]} sorted by file, lines ascending
 */
export function citedLocations(findings) {
  /** @type {Map<string, Set<number>>} */
  const byFile = new Map();
  for (const finding of findings) {
    for (const token of String(finding).split(/[\s,()[\]"']+/)) {
      const match = CITATION.exec(token);
      if (match?.groups === undefined) continue;
      const lines = byFile.get(match.groups.file) ?? new Set();
      lines.add(Number(match.groups.line));
      byFile.set(match.groups.file, lines);
    }
  }
  return [...byFile.entries()]
    .map(([file, lines]) => ({ file, lines: [...lines].sort((a, b) => a - b) }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * How many commits this repository has, capped so the count stays cheap on a large one.
 *
 * @param {{ cwd: string, run: Runner }} options
 * @returns {number}
 */
export function commitCount(options) {
  const result = options.run('git', ['rev-list', '--count', `-n${MIN_REPOSITORY_COMMITS + 1}`, 'HEAD'], {
    cwd: options.cwd,
  });
  if (!result.ok) return 0;
  const count = Number(result.stdout.trim());
  return Number.isInteger(count) && count >= 0 ? count : 0;
}

/**
 * Is this repository old enough to have opinions?
 *
 * @param {{ cwd: string, run: Runner }} options
 * @returns {boolean}
 */
export function hasMeaningfulHistory(options) {
  return commitCount(options) >= MIN_REPOSITORY_COMMITS;
}

/**
 * @param {string} file
 * @param {{ cwd: string, run: Runner }} options
 * @returns {{ sha: string, subject: string }[]}
 */
function commitsTouching(file, options) {
  const result = options.run('git', ['log', `-n${MAX_COMMITS}`, '--format=%h %s', '--', file], { cwd: options.cwd });
  if (!result.ok) return [];
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes(' '))
    .map((line) => {
      const [sha, ...rest] = line.split(' ');
      return { sha, subject: rest.join(' ') };
    });
}

/**
 * @param {string} file
 * @param {number} line
 * @param {{ cwd: string, run: Runner }} options
 * @returns {string | null}
 */
function blameLine(file, line, options) {
  const result = options.run('git', ['blame', `-L${line},${line}`, '--porcelain', '--', file], { cwd: options.cwd });
  if (!result.ok) return null;
  const lines = result.stdout.split('\n');
  const sha = (lines[0] ?? '').split(' ')[0].slice(0, 8);
  const summary = lines.find((entry) => entry.startsWith('summary '))?.slice('summary '.length).trim() ?? '';
  if (sha === '' || summary === '') return null;
  return `line ${line} last changed in ${sha}: ${summary}`;
}

/**
 * Gather history for the files an objective actually points at.
 *
 * Returns an empty array whenever a condition is not met, which is the common case and not
 * an error. Nothing here fails a run: history is context, and a repository that will not
 * answer `git log` simply contributes none.
 *
 * @param {{
 *   cwd: string, run: Runner, findings?: string[], files?: string[], greenfield?: boolean
 * }} options
 * @returns {HistoryNote[]}
 */
export function historyContext(options) {
  // A run that generated this application from nothing has no history but its own.
  if (options.greenfield === true) return [];
  if (!hasMeaningfulHistory(options)) return [];

  const cited = citedLocations(options.findings ?? []);
  /** @type {Map<string, number[]>} */
  const wanted = new Map(cited.map((entry) => [entry.file, entry.lines]));
  for (const file of options.files ?? []) if (!wanted.has(file)) wanted.set(file, []);

  /** @type {HistoryNote[]} */
  const notes = [];
  for (const [file, lines] of [...wanted.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (notes.length >= MAX_FILES) break;
    const commits = commitsTouching(file, options);
    // One commit means this run created it. There is no prior intent to respect.
    if (commits.length < MIN_FILE_COMMITS) continue;
    const blame = lines
      .slice(0, MAX_COMMITS)
      .map((line) => blameLine(file, line, options))
      .filter((entry) => entry !== null);
    notes.push({ file, commits, blame: /** @type {string[]} */ (blame) });
  }
  return notes;
}
