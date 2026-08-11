/**
 * The Build Brief — one compiled task per builder iteration (DESIGN.md §8.1).
 *
 * The invariant this exists to serve: **the repository and the driver's own artifacts are
 * the memory; a child's conversation is not.** Every builder is a fresh process, so the
 * only thing it knows is what it is handed. Handing it an accumulated transcript would make
 * the loop's behaviour depend on how a previous child happened to narrate itself, which is
 * neither reproducible nor auditable. So the brief is compiled from evidence the driver
 * owns — gate exit codes, the ratchet, the audit, the lesson store — and from nothing else.
 *
 * This module renders. It does not gather: no filesystem reads, no git, no clock. That is
 * what makes a brief a pure function of the run's state, and what lets the archived
 * `.dare/briefs/iter-NNN.md` be read afterwards as a true record of what the builder was
 * actually told rather than an approximation of it.
 *
 * Nothing here is truncated silently. Where a list is capped, the brief says how many were
 * left out — a brief that quietly shows ten of forty regressions reads exactly like a brief
 * with ten regressions.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * @typedef {{
 *   kind: 'initial' | 'gates' | 'regression' | 'review' | 'no-tests',
 *   headline: string,
 *   reason: string,
 *   gateFailures?: { name: string, detail: string }[],
 *   regressions?: string[],
 *   findings?: string[],
 *   advisories?: {
 *     id: string, severity: string, confidence: number,
 *     evidence: string | null, detail: string, repairHint: string
 *   }[]
 * }} Objective
 */

/** @typedef {{ id: string, trigger: string[], scope: string[], lesson: string }} BriefLesson */

/** @typedef {{ file: string, commits: { sha: string, subject: string }[], blame: string[] }} HistoryNote */

/**
 * @typedef {{
 *   iteration: number,
 *   chaos: number,
 *   objective: Objective,
 *   protectedTests?: string[],
 *   lessons?: BriefLesson[],
 *   history?: HistoryNote[],
 *   gates?: string[],
 *   capabilities?: string[],
 *   toolchain?: { name: string, guidance: string },
 *   raceCandidate?: { index: number, of: number } | null
 * }} BriefInput
 */

/** How many protected test ids a brief lists before summarising the remainder. */
const PROTECTED_SAMPLE = 10;

/** How many entries any one evidence list shows before summarising the remainder. */
const LIST_CAP = 20;

/**
 * Render a list, saying out loud what was left out.
 *
 * @param {string[]} items
 * @param {number} cap
 * @returns {string[]}
 */
function capped(items, cap) {
  if (items.length <= cap) return items.map((item) => `- ${item}`);
  return [
    ...items.slice(0, cap).map((item) => `- ${item}`),
    `- ...and ${items.length - cap} more, not shown here. Run the gates to see the rest.`,
  ];
}

/**
 * The scope budget, in the builder's own terms (DESIGN.md §13.4).
 *
 * @param {number} chaos
 * @returns {string}
 */
function chaosLine(chaos) {
  if (chaos <= 1) {
    return (
      'chaos 1 - surgical. Touch only the files this objective requires. Every changed line must trace ' +
      'directly to it, and adjacent code, comments and formatting are not yours to improve this iteration.'
    );
  }
  if (chaos === 2) return 'chaos 2 - normal. Related refactors are allowed inside the current slice, and nowhere else.';
  return 'chaos 3 - feral. Restructure freely. The ratchet still punishes every regression this invites.';
}

/**
 * The section that says what to do, and why it is what to do.
 *
 * @param {Objective} objective
 * @returns {string[]}
 */
function objectiveSection(objective) {
  /** @type {string[]} */
  const lines = ['## Objective', '', objective.headline, '', `**Why this and not something else:** ${objective.reason}`];

  const gateFailures = objective.gateFailures ?? [];
  if (gateFailures.length > 0) {
    lines.push('', '### Failing gates', '');
    lines.push(...capped(gateFailures.map((gate) => `\`${gate.name}\`: ${gate.detail}`), LIST_CAP));
  }

  const regressions = objective.regressions ?? [];
  if (regressions.length > 0) {
    lines.push(
      '',
      '### Regressions - these outrank everything else in this brief',
      '',
      'These test ids passed on an earlier iteration and do not pass now. Restore them and change',
      'nothing else. Do not refactor the thing that "clearly caused it". Restore, then stop.',
      '',
    );
    lines.push(...capped([...regressions].sort(), LIST_CAP));
  }

  const findings = objective.findings ?? [];
  if (findings.length > 0) {
    lines.push('', '### Audit findings', '');
    lines.push(...capped(findings, LIST_CAP));
  }

  const advisories = objective.advisories ?? [];
  if (advisories.length > 0) {
    lines.push(
      '',
      '### Advisory findings',
      '',
      'Suggestions, not requirements. They do not decide whether this run ships. Address them only',
      'where doing so does not widen the diff the objective above calls for.',
      '',
    );
    lines.push(
      ...capped(
        advisories.map((advisory) => {
          const hint = advisory.repairHint === '' ? '' : ` Suggested repair: ${advisory.repairHint}`;
          return `[${advisory.severity}] ${advisory.evidence ?? 'no location'} - ${advisory.detail}${hint}`;
        }),
        LIST_CAP,
      ),
    );
  }

  return lines;
}

/**
 * Compile one Build Brief.
 *
 * Deterministic: the same input produces the same bytes every time. Sets arrive sorted,
 * caps are fixed, and nothing consults a clock — the iteration number is the only thing
 * that moves, and it is passed in.
 *
 * @param {BriefInput} input
 * @returns {string}
 */
export function compileBrief(input) {
  const protectedTests = [...new Set(input.protectedTests ?? [])].sort();
  const lessons = [...(input.lessons ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const history = [...(input.history ?? [])].sort((a, b) => a.file.localeCompare(b.file));

  /** @type {string[]} */
  const lines = [
    `# Build brief - iteration ${input.iteration}`,
    '',
    'This brief is the whole of your task. It was compiled from gate exit codes, the ratchet and',
    'the audit - not from anything a previous iteration said about itself. There is no earlier',
    'conversation to recall and nothing to catch up on.',
    '',
    ...objectiveSection(input.objective),
    '',
    '## Scope budget',
    '',
    chaosLine(input.chaos),
  ];

  if (input.raceCandidate !== null && input.raceCandidate !== undefined) {
    lines.push(
      '',
      `You are candidate ${input.raceCandidate.index} of ${input.raceCandidate.of}, working in an isolated`,
      'worktree. Solve the objective your own way. Another candidate is trying a different one and the',
      'gates decide between you, so do not hedge toward what you imagine the others are doing.',
    );
  }

  lines.push(
    '',
    '## Constraints',
    '',
    '- Do not touch code unrelated to the objective above. Every unrelated change is regression',
    '  surface, and a regression costs a full iteration plus a hard reset.',
    '- Do not write anything under `.dare/`, at any depth, including paths that do not exist yet.',
    '  That directory is driver-owned - the ratchet, the evidence and the reports the gates read -',
    '  and a PreToolUse hook denies the write positionally rather than by name.',
    '- Do not declare the work finished. Something else decides that.',
  );

  if (protectedTests.length > 0) {
    lines.push(
      '',
      '## Protected tests',
      '',
      `${protectedTests.length} test id(s) have passed at some point in this run and may never fail again.`,
      'A sample, so you can recognise what you are standing on:',
      '',
      ...protectedTests.slice(0, PROTECTED_SAMPLE).map((id) => `- ${id}`),
    );
    if (protectedTests.length > PROTECTED_SAMPLE) {
      lines.push(`- ...and ${protectedTests.length - PROTECTED_SAMPLE} more held by the ratchet.`);
    }
  }

  const capabilities = [...(input.capabilities ?? [])];
  if (capabilities.length > 0) {
    lines.push(
      '',
      '## What this project is',
      '',
      'Declared by the architect and confirmed against the repository (DESIGN.md §3.7). This is what the',
      'gates are chosen from, so build all of it and do not quietly build something else.',
      '',
      ...capabilities.map((capability) => `- ${capability}`),
    );
  }

  if (input.toolchain !== undefined && input.toolchain !== null) {
    lines.push('', `## Building this with ${input.toolchain.name}`, '');
    if (input.toolchain.guidance === '') {
      // Announced rather than omitted, for the same reason a skipped gate is. A brief that
      // silently carries guidance for one toolchain and not another reads, to the next
      // reader, as a toolchain that needed none.
      lines.push(
        `There is no guidance fragment for the ${input.toolchain.name} toolchain, so this brief carries none.`,
        'That is a gap in the plugin rather than a statement that this stack has no idioms worth knowing.',
      );
    } else {
      // Rendered verbatim. The fragment owns its own headings, and rewriting it here would
      // mean two places deciding what the builder reads about its stack.
      lines.push(input.toolchain.guidance.trim());
    }
  }

  if ((input.gates ?? []).length > 0) {
    lines.push('', '## Gates every iteration must pass', '', ...capped(input.gates ?? [], LIST_CAP));
  }

  if (lessons.length > 0) {
    lines.push(
      '',
      '## Lessons from earlier in this run',
      '',
      'Each of these was derived from a failure observed here and a repair that actually resolved it.',
      'They are selected for this objective, not a general reading list.',
      '',
    );
    for (const lesson of lessons) {
      lines.push(`- **${lesson.id}** (${[...lesson.scope].sort().join(', ') || 'general'}): ${lesson.lesson}`);
    }
  }

  if (history.length > 0) {
    lines.push(
      '',
      '## History of the code you are about to change',
      '',
      'This code predates this run. Read why it looks the way it does before deciding it is wrong.',
      '',
    );
    for (const note of history) {
      lines.push(`### ${note.file}`, '');
      for (const commit of note.commits) lines.push(`- ${commit.sha} ${commit.subject}`);
      for (const blame of note.blame) lines.push(`- ${blame}`);
      lines.push('');
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

/**
 * @param {number} iteration
 * @param {number} [candidate] the race candidate's number, when this is a raced iteration
 * @returns {string} the archived brief's file name
 */
export function briefFileName(iteration, candidate) {
  const base = `iter-${String(iteration).padStart(3, '0')}`;
  // A raced iteration produces one brief per candidate. They differ — each says which
  // candidate it is — so writing them all to one name would destroy the evidence of what
  // the losing candidates were actually asked.
  return candidate === undefined ? `${base}.md` : `${base}-candidate-${String(candidate).padStart(2, '0')}.md`;
}

/**
 * Archive a brief under `.dare/briefs/`.
 *
 * These are debugging artifacts. When a run ends badly the first question is what the
 * builder was actually asked for on the iteration it went wrong, and reconstructing that
 * from a log of what it did is guesswork.
 *
 * @param {string} dareDir
 * @param {number} iteration
 * @param {string} contents
 * @param {number} [candidate]
 * @returns {string} the path written
 */
export function writeBrief(dareDir, iteration, contents, candidate) {
  const dir = path.join(dareDir, 'briefs');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, briefFileName(iteration, candidate));
  writeFileSync(file, contents, 'utf8');
  return file;
}
