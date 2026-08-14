/**
 * Lesson memory — sparse, evidence-derived, driver-owned (DESIGN.md §13.8).
 *
 * A lesson is one piece of reusable technical knowledge that this run *earned*: a failure
 * was observed, a repair was attempted and did not work, a materially different repair was
 * attempted, and the thing went green. That sequence is the only thing that qualifies. The
 * builder is never asked what it learned — a model asked that question will always produce
 * something, and a store full of confident generalities is worse than an empty one, because
 * it gets injected into every later brief.
 *
 * Deliberate non-goals, so nobody has to guess later:
 *   - No transcripts. The store holds a sentence and the evidence for it, not a history.
 *   - No embeddings, no vector store, no MCP. Retrieval is keyword matching over triggers
 *     and scopes: inspectable, deterministic, and adequate at this size.
 *   - No lesson per iteration. Most iterations teach nothing reusable.
 *
 * This memory is *advisory*, and that changes how it fails. The ratchet must never degrade
 * silently, so unreadable ratchet state stops the run. An unreadable lesson store is the
 * opposite case: it cannot make a wrong build look right, and refusing to continue over it
 * would let a corrupt suggestion file kill a healthy run. So a broken store degrades to no
 * lessons and says so out loud. Nothing that decides pass or fail reads this file.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * @typedef {{
 *   id: string, trigger: string[], scope: string[], lesson: string,
 *   evidence: { introduced: number, resolved: number, tests: string[] }, uses: number
 * }} Lesson
 */
/** @typedef {{ version: 1, lessons: Lesson[] }} LessonStore */

const STORE_VERSION = 1;
const STORE_FILE = 'lessons.json';

/** A lesson shorter than this is a slogan; longer than this is a transcript. */
const MIN_LESSON_LENGTH = 20;
const MAX_LESSON_LENGTH = 400;
const MAX_TRIGGERS = 8;
const MAX_SCOPES = 5;

/**
 * @returns {LessonStore} the store of a run that has learned nothing yet
 */
export function emptyStore() {
  return { version: STORE_VERSION, lessons: [] };
}

/**
 * @param {unknown} value
 * @param {number} cap
 * @returns {string[]} lowercased, trimmed, de-duplicated, sorted, capped
 */
function normaliseTags(value, cap) {
  if (!Array.isArray(value)) return [];
  const tags = value
    .filter((entry) => typeof entry === 'string')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  return [...new Set(tags)].sort().slice(0, cap);
}

/**
 * Read one candidate lesson, or decide it is not one.
 *
 * Returns null rather than throwing, everywhere. This is called on model output and on file
 * contents, and in both cases the correct response to nonsense is to have no lesson.
 *
 * @param {unknown} candidate
 * @returns {Omit<Lesson, 'id'> | null}
 */
export function validateLesson(candidate) {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const record = /** @type {Record<string, unknown>} */ (candidate);

  const text = typeof record.lesson === 'string' ? record.lesson.trim().replace(/\s+/g, ' ') : '';
  if (text.length < MIN_LESSON_LENGTH || text.length > MAX_LESSON_LENGTH) return null;

  const trigger = normaliseTags(record.trigger, MAX_TRIGGERS);
  // A lesson with no trigger can never be retrieved for a reason, only injected into
  // everything. That is the failure mode this whole module is shaped to avoid.
  if (trigger.length === 0) return null;

  const evidenceRecord =
    record.evidence !== null && typeof record.evidence === 'object' && !Array.isArray(record.evidence)
      ? /** @type {Record<string, unknown>} */ (record.evidence)
      : {};
  const introduced = Number(evidenceRecord.introduced);
  const resolved = Number(evidenceRecord.resolved);
  if (!Number.isInteger(introduced) || !Number.isInteger(resolved) || introduced < 0 || resolved < introduced) {
    return null;
  }

  const tests = Array.isArray(evidenceRecord.tests)
    ? [...new Set(evidenceRecord.tests.filter((entry) => typeof entry === 'string'))].sort()
    : [];

  return {
    trigger,
    scope: normaliseTags(record.scope, MAX_SCOPES),
    lesson: text,
    evidence: { introduced, resolved, tests },
    uses: Number.isInteger(record.uses) && Number(record.uses) >= 0 ? Number(record.uses) : 0,
  };
}

/**
 * @param {unknown} value
 * @returns {Lesson | null}
 */
function validateStoredLesson(value) {
  const base = validateLesson(value);
  if (base === null) return null;
  const id = /** @type {Record<string, unknown>} */ (value).id;
  if (typeof id !== 'string' || !/^lesson-\d{4,}$/.test(id)) return null;
  return { id, ...base };
}

/**
 * Read `.meeseeks/lessons.json`.
 *
 * Never throws. A missing file is a run that has not learned anything; a broken one is a
 * run that has lost what it learned, which is a warning rather than a stop (see the module
 * comment — nothing that decides pass or fail reads this file).
 *
 * @param {string} meeseeksDir
 * @returns {{ store: LessonStore, problem: string | null }}
 */
export function readLessons(meeseeksDir) {
  const file = path.join(meeseeksDir, STORE_FILE);
  if (!existsSync(file)) return { store: emptyStore(), problem: null };

  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    return {
      store: emptyStore(),
      problem: `${file} is not valid JSON and was ignored: ${/** @type {Error} */ (error).message}`,
    };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { store: emptyStore(), problem: `${file} is not a JSON object and was ignored.` };
  }
  const record = /** @type {Record<string, unknown>} */ (parsed);
  if (record.version !== STORE_VERSION) {
    return {
      store: emptyStore(),
      problem:
        `${file} has version ${JSON.stringify(record.version)}; this build writes version ${STORE_VERSION}. ` +
        'The store was ignored rather than guessed at.',
    };
  }
  if (!Array.isArray(record.lessons)) {
    return { store: emptyStore(), problem: `${file} has no lessons array and was ignored.` };
  }

  /** @type {Lesson[]} */
  const lessons = [];
  let dropped = 0;
  for (const entry of record.lessons) {
    const lesson = validateStoredLesson(entry);
    if (lesson === null) dropped += 1;
    else lessons.push(lesson);
  }
  lessons.sort((a, b) => a.id.localeCompare(b.id));

  return {
    store: { version: STORE_VERSION, lessons },
    problem: dropped === 0 ? null : `${file}: ${dropped} malformed lesson(s) were dropped.`,
  };
}

/**
 * Write `.meeseeks/lessons.json` atomically.
 *
 * @param {string} meeseeksDir
 * @param {LessonStore} store
 * @returns {string} the path written
 */
export function saveLessons(meeseeksDir, store) {
  mkdirSync(meeseeksDir, { recursive: true });
  const file = path.join(meeseeksDir, STORE_FILE);
  const temporary = `${file}.tmp`;
  const payload = {
    version: STORE_VERSION,
    lessons: [...store.lessons].sort((a, b) => a.id.localeCompare(b.id)),
  };
  writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  renameSync(temporary, file);
  return file;
}

/**
 * @param {LessonStore} store
 * @returns {string} the next id, continuing past the highest already present
 */
export function nextLessonId(store) {
  const highest = store.lessons.reduce((best, lesson) => Math.max(best, Number(lesson.id.slice(7)) || 0), 0);
  return `lesson-${String(highest + 1).padStart(4, '0')}`;
}

/**
 * Names the lesson claims are gates, in the order they appear.
 *
 * Only id-shaped tokens count. `unit`, `ci` and `red-evidence` are gates and appear in prose
 * constantly; `DoD-2-security` and `PRD-1.1` are requirement ids and are never gates, so a
 * lesson calling one a gate is asserting something about this loop that is not true.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function claimedGateNames(text) {
  /** @type {string[]} */
  const claimed = [];
  for (const match of text.matchAll(/\b([A-Za-z][\w.:-]*)\s+gate\b/g)) {
    const name = match[1];
    const idShaped = /^(?:PRD|DoD)[-.]/i.test(name) || (name.includes('-') && /\d/.test(name));
    if (idShaped) claimed.push(name);
  }
  return claimed;
}

/**
 * Reject a lesson that describes this loop wrongly.
 *
 * **The extractor is the one child whose output nothing checks.** Every other child is either
 * parsed against a contract that refuses to be charitable, or gated. Dogfood run 6 showed what
 * that costs: it recorded *"The `DoD-2-security` **gate** in this repo enforces the
 * zero-dependency policy: any devDependency … fails it. It only passes once dependencies are
 * removed entirely."* Every clause is false. `DoD-2-security` is a **panel requirement**, not a
 * gate; the security gate is `npm audit`, which exited 0 on that tree; and the panel's objection
 * was that vitest was *missing* from the manifest, the opposite of what the lesson says. It was
 * stamped `resolved: 6` — crediting the iteration that was hard-reset for destroying the ratchet.
 *
 * A generality is ignorable. This was specific, well-formed, confident and wrong, and lessons are
 * injected into later briefs, so it would have taught every subsequent builder a falsehood.
 *
 * What is checkable without asking a model is whether the lesson's claims about *this loop's own
 * vocabulary* hold. A lesson may say anything about the project it watched; it may not invent a
 * gate. Supplying no gate list skips the check, which keeps the old behaviour for a caller that
 * has none — and a structural test holds the driver to supplying one.
 *
 * @param {string} text
 * @param {readonly string[] | null} gateNames every gate this run can actually run
 * @returns {string | null} the offending name, or null when the lesson is grounded
 */
export function ungroundedGateClaim(text, gateNames) {
  // An empty list is treated as no list. A run that genuinely has no gates has nothing for a
  // lesson to misname, and rejecting every claim on an absent list is the unsafe direction.
  if (gateNames === null || gateNames.length === 0) return null;
  const known = new Set(gateNames.map((name) => name.toLowerCase()));
  for (const claimed of claimedGateNames(text)) {
    if (!known.has(claimed.toLowerCase())) return claimed;
  }
  return null;
}

/**
 * Add a lesson, if it is one and if it is new.
 *
 * Duplicate suppression is on the lesson text. The same mistake tends to be re-learned in
 * slightly different words across a long run, and a store holding six phrasings of one idea
 * spends six brief slots saying it once.
 *
 * @param {LessonStore} store
 * @param {unknown} candidate
 * @param {{ gateNames?: readonly string[] }} [options] the gates this run can run, for grounding
 * @returns {{ store: LessonStore, added: Lesson | null, reason: string }}
 */
export function addLesson(store, candidate, options = {}) {
  const validated = validateLesson(candidate);
  if (validated === null) {
    return { store, added: null, reason: 'the candidate was not a well-formed lesson and was discarded' };
  }

  const ungrounded = ungroundedGateClaim(validated.lesson, options.gateNames ?? null);
  if (ungrounded !== null) {
    return {
      store,
      added: null,
      reason:
        `the candidate calls \`${ungrounded}\` a gate, and this run has no such gate. A lesson that ` +
        'misdescribes the loop is taught to every later builder, so it is discarded rather than stored',
    };
  }
  const key = validated.lesson.toLowerCase();
  if (store.lessons.some((lesson) => lesson.lesson.toLowerCase() === key)) {
    return { store, added: null, reason: 'an identical lesson is already stored' };
  }
  /** @type {Lesson} */
  const lesson = { id: nextLessonId(store), ...validated };
  return {
    store: { version: STORE_VERSION, lessons: [...store.lessons, lesson] },
    added: lesson,
    reason: `stored as ${lesson.id}`,
  };
}

/**
 * Read a lesson-extractor child's output.
 *
 * The extractor is asked to return `null` when there is nothing reusable, and it must be
 * cheap for it to do so — an extractor that feels obliged to produce something produces
 * filler. So every unreadable, empty or ill-formed answer is simply no lesson.
 *
 * @param {string} raw
 * @returns {Omit<Lesson, 'id'> | null}
 */
export function parseLessonExtraction(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '' || /^null$/i.test(trimmed)) return null;

  /** @type {string[]} */
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n?```/);
  if (fenced !== null) candidates.push(fenced[1]);
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) candidates.push(trimmed.slice(firstBrace, lastBrace + 1));

  for (const candidate of candidates) {
    /** @type {unknown} */
    let parsed;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (parsed === null) return null;
    if (typeof parsed !== 'object' || Array.isArray(parsed)) continue;
    const record = /** @type {Record<string, unknown>} */ (parsed);
    // Either `{ "lesson": { ... } }` wrapping the object, or the object itself.
    const inner = record.lesson !== null && typeof record.lesson === 'object' ? record.lesson : record;
    const validated = validateLesson(inner);
    if (validated !== null) return validated;
  }
  return null;
}

/** @typedef {{ text: string, tests?: string[], paths?: string[], tags?: string[] }} LessonContext */

/**
 * Choose the lessons worth putting in front of this iteration's builder.
 *
 * Relevance is deterministic and dull on purpose: a lesson matches when one of its triggers
 * or scopes appears in the current objective's text, failing test ids, changed paths or
 * tags. Nothing scores by similarity, so a lesson can always be explained — it is here
 * because this word is in that failure.
 *
 * Ordering is by number of distinct matches, then by id, so the same context always yields
 * the same list in the same order.
 *
 * @param {LessonStore} store
 * @param {LessonContext} context
 * @param {{ limit?: number }} [options]
 * @returns {Lesson[]}
 */
export function selectLessons(store, context, options = {}) {
  const limit = options.limit ?? 3;
  if (limit <= 0) return [];

  const haystack = [context.text ?? '', ...(context.tests ?? []), ...(context.paths ?? []), ...(context.tags ?? [])]
    .join('\n')
    .toLowerCase();
  if (haystack.trim() === '') return [];

  /** @type {{ lesson: Lesson, score: number }[]} */
  const scored = [];
  for (const lesson of store.lessons) {
    const matches = [...new Set([...lesson.trigger, ...lesson.scope])].filter((tag) => haystack.includes(tag));
    if (matches.length > 0) scored.push({ lesson, score: matches.length });
  }

  scored.sort((a, b) => b.score - a.score || a.lesson.id.localeCompare(b.lesson.id));
  return scored.slice(0, limit).map((entry) => entry.lesson);
}

/**
 * Record that lessons were put in front of a builder.
 *
 * Usage counts are the only cheap signal for which lessons are worth keeping. They inform a
 * human reading the store; nothing in the loop reads them back.
 *
 * @param {LessonStore} store
 * @param {Iterable<string>} ids
 * @returns {LessonStore}
 */
export function markLessonsUsed(store, ids) {
  const used = new Set(ids);
  return {
    version: STORE_VERSION,
    lessons: store.lessons.map((lesson) => (used.has(lesson.id) ? { ...lesson, uses: lesson.uses + 1 } : lesson)),
  };
}

// ---------------------------------------------------------------------------
// When a lesson is worth extracting at all
// ---------------------------------------------------------------------------

/** @typedef {{ iteration: number, failures: string[], changed: string[] }} IterationRecord */

/**
 * @typedef {{
 *   key: string, introduced: number, resolved: number, attempts: number, changed: string[][]
 * }} Struggle
 */

/**
 * Find failures that resisted a repair and then gave way to a different one.
 *
 * This is the evidence test that stands in for asking a model whether it learned something.
 * The shape being looked for is:
 *
 *   iteration N     failure X observed
 *   iteration N+1   failure X still observed  -> the obvious repair did not work
 *   iteration N+k   failure X gone            -> something else did
 *
 * plus a requirement that the attempts touched *different* files. Same failure, same files,
 * then green usually means the second attempt was the first one finished, and there is no
 * transferable knowledge in "it worked once I completed it". Comparing changed file sets is
 * a coarse proxy for "materially different repair", and a deliberate one: the alternative is
 * asking a model to judge its own diffs, which is the thing this module exists to avoid.
 *
 * A failure that appears once and clears is not a struggle. Neither is one still failing at
 * the end of the window — the run has learned nothing from a fight it is still losing.
 *
 * @param {IterationRecord[]} history oldest first
 * @returns {Struggle[]} sorted by resolution iteration, then key
 */
export function findResolvedStruggles(history) {
  /** @type {Map<string, { iterations: number[], changed: string[][] }>} */
  const seen = new Map();
  for (const record of history) {
    for (const failure of new Set(record.failures)) {
      const entry = seen.get(failure) ?? { iterations: [], changed: [] };
      entry.iterations.push(record.iteration);
      entry.changed.push([...new Set(record.changed)].sort());
      seen.set(failure, entry);
    }
  }

  const lastIteration = history.length === 0 ? 0 : history[history.length - 1].iteration;

  /** @type {Struggle[]} */
  const struggles = [];
  for (const [key, entry] of seen) {
    if (entry.iterations.length < 2) continue;
    const introduced = entry.iterations[0];
    const lastFailing = entry.iterations[entry.iterations.length - 1];
    if (lastFailing >= lastIteration) continue; // still failing; nothing was resolved

    const resolved = history.find((record) => record.iteration > lastFailing)?.iteration;
    if (resolved === undefined) continue;

    // The repair that finally worked ran in the first iteration after the last failing one.
    const attempts = [...entry.changed, history.find((record) => record.iteration === resolved)?.changed ?? []];
    const distinct = new Set(attempts.map((files) => [...new Set(files)].sort().join(' ')));
    if (distinct.size < 2) continue;

    struggles.push({ key, introduced, resolved, attempts: entry.iterations.length, changed: attempts });
  }

  struggles.sort((a, b) => a.resolved - b.resolved || a.key.localeCompare(b.key));
  return struggles;
}
