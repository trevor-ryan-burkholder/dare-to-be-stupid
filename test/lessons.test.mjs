/**
 * Tests for lesson memory (DESIGN.md §13.8).
 *
 * Two opposite failure modes are being defended against at once, and they pull in different
 * directions.
 *
 * The first is a store that fills with filler. A model asked what it learned will always
 * answer, and every useless sentence stored here is read by every later brief. So the bar
 * for admission is high, and much of what follows is an attempt to get something worthless
 * past it.
 *
 * The second is a store that takes a run down with it. This memory is advisory: nothing
 * that decides pass or fail reads it. A corrupt suggestion file must therefore degrade to
 * no suggestions rather than to a stopped run — the exact opposite of how the ratchet
 * fails, and the difference is deliberate.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import {
  addLesson,
  boundStore,
  claimedGateNames,
  emptyStore,
  findResolvedStruggles,
  markLessonsUsed,
  nextLessonId,
  parseLessonExtraction,
  promoteCandidates,
  readLessons,
  rejectCandidate,
  retractLesson,
  saveLessons,
  selectLessons,
  stageCandidate,
  ungroundedGateClaim,
  validateLesson,
} from '../scripts/lessons.mjs';

/** @type {string[]} */
const temporaryDirs = [];

/** @returns {string} */
function makeTempDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'meeseeks-lessons-'));
  temporaryDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

const GOOD = {
  trigger: ['playwright', 'storagestate'],
  scope: ['e2e', 'authentication'],
  lesson: 'Generate the authenticated storageState only after the server reports healthy.',
  evidence: { introduced: 6, resolved: 8, tests: ['tests/auth.spec.ts::opens dashboard::chromium'] },
  uses: 0,
};

describe('validateLesson', () => {
  it('accepts a well-formed lesson and normalises its tags', () => {
    const lesson = validateLesson({ ...GOOD, trigger: ['Playwright', ' AUTH ', 'auth'] });
    assert.notEqual(lesson, null);
    assert.deepStrictEqual(lesson?.trigger, ['auth', 'playwright']);
    assert.deepStrictEqual(lesson?.evidence, {
      introduced: 6,
      resolved: 8,
      tests: ['tests/auth.spec.ts::opens dashboard::chromium'],
    });
  });

  it('rejects a lesson with no trigger, which could never be retrieved for a reason', () => {
    assert.equal(validateLesson({ ...GOOD, trigger: [] }), null);
    assert.equal(validateLesson({ ...GOOD, trigger: undefined }), null);
  });

  it('rejects a slogan and rejects a transcript', () => {
    assert.equal(validateLesson({ ...GOOD, lesson: 'be careful' }), null);
    assert.equal(validateLesson({ ...GOOD, lesson: 'x'.repeat(401) }), null);
  });

  it('rejects evidence that could not have happened', () => {
    assert.equal(validateLesson({ ...GOOD, evidence: { introduced: 8, resolved: 6, tests: [] } }), null);
    assert.equal(validateLesson({ ...GOOD, evidence: { introduced: -1, resolved: 2, tests: [] } }), null);
    assert.equal(validateLesson({ ...GOOD, evidence: { introduced: 1.5, resolved: 2, tests: [] } }), null);
  });

  it('rejects anything that is not an object at all', () => {
    for (const candidate of [null, 'a lesson', 42, ['a lesson']]) {
      assert.equal(validateLesson(candidate), null, `accepted ${JSON.stringify(candidate)}`);
    }
  });

  it('caps the number of triggers and scopes it will store', () => {
    const lesson = validateLesson({
      ...GOOD,
      trigger: Array.from({ length: 20 }, (_, index) => `t${index}`),
      scope: Array.from({ length: 20 }, (_, index) => `s${index}`),
    });
    assert.equal(lesson?.trigger.length, 8);
    assert.equal(lesson?.scope.length, 5);
  });
});

describe('the lesson store on disk', () => {
  it('round-trips a stored lesson', () => {
    const dir = makeTempDir();
    const { store } = addLesson(emptyStore(), GOOD);
    saveLessons(dir, store);
    const read = readLessons(dir);
    assert.equal(read.problem, null);
    assert.equal(read.store.lessons.length, 1);
    assert.equal(read.store.lessons[0].id, 'lesson-0001');
    assert.equal(read.store.lessons[0].lesson, GOOD.lesson);
  });

  it('treats a missing file as a run that has not learned anything', () => {
    const read = readLessons(makeTempDir());
    assert.deepStrictEqual(read.store, { version: 1, lessons: [], retracted: [], candidates: [], rejected: [] });
    assert.equal(read.problem, null);
  });

  it('degrades to no lessons and a warning when the file is not JSON', () => {
    // The opposite of the ratchet, on purpose: this file cannot make a wrong build look
    // right, so refusing to continue over it would let a corrupt hint file kill a good run.
    const dir = makeTempDir();
    writeFileSync(path.join(dir, 'lessons.json'), '{ not json', 'utf8');
    const read = readLessons(dir);
    assert.deepStrictEqual(read.store.lessons, []);
    assert.equal(read.problem?.includes('not valid JSON'), true);
  });

  it('degrades when the version is one it does not write', () => {
    const dir = makeTempDir();
    writeFileSync(path.join(dir, 'lessons.json'), JSON.stringify({ version: 99, lessons: [] }), 'utf8');
    const read = readLessons(dir);
    assert.deepStrictEqual(read.store.lessons, []);
    assert.equal(read.problem?.includes('version 99'), true);
  });

  it('drops malformed entries, keeps the good ones, and says how many went', () => {
    const dir = makeTempDir();
    writeFileSync(
      path.join(dir, 'lessons.json'),
      JSON.stringify({
        version: 1,
        lessons: [{ id: 'lesson-0001', ...GOOD }, { id: 'nonsense', ...GOOD }, { id: 'lesson-0003' }],
      }),
      'utf8',
    );
    const read = readLessons(dir);
    assert.deepStrictEqual(
      read.store.lessons.map((lesson) => lesson.id),
      ['lesson-0001'],
    );
    assert.equal(read.problem?.includes('2 malformed lesson(s)'), true);
  });

  it('writes the store sorted, so its diffs stay readable', () => {
    const dir = makeTempDir();
    saveLessons(dir, {
      version: 1,
      lessons: [
        { id: 'lesson-0002', ...GOOD },
        { id: 'lesson-0001', ...GOOD, lesson: 'Another lesson entirely, long enough to be stored.' },
      ],
    });
    const written = JSON.parse(readFileSync(path.join(dir, 'lessons.json'), 'utf8'));
    assert.deepStrictEqual(
      written.lessons.map((/** @type {{ id: string }} */ lesson) => lesson.id),
      ['lesson-0001', 'lesson-0002'],
    );
  });
});

describe('addLesson', () => {
  it('numbers lessons in sequence', () => {
    let store = emptyStore();
    store = addLesson(store, GOOD).store;
    store = addLesson(store, { ...GOOD, lesson: 'A different lesson, also long enough to store.' }).store;
    assert.deepStrictEqual(
      store.lessons.map((lesson) => lesson.id),
      ['lesson-0001', 'lesson-0002'],
    );
    assert.equal(nextLessonId(store), 'lesson-0003');
  });

  it('refuses a second copy of the same lesson', () => {
    const first = addLesson(emptyStore(), GOOD);
    const second = addLesson(first.store, { ...GOOD, lesson: GOOD.lesson.toUpperCase() });
    assert.equal(second.added, null);
    assert.equal(second.reason.includes('already stored'), true);
    assert.equal(second.store.lessons.length, 1);
  });

  it('stores nothing when the candidate is not a lesson', () => {
    const outcome = addLesson(emptyStore(), { lesson: 'no' });
    assert.equal(outcome.added, null);
    assert.deepStrictEqual(outcome.store.lessons, []);
  });
});

describe('parseLessonExtraction', () => {
  it('reads a bare object', () => {
    assert.equal(parseLessonExtraction(JSON.stringify(GOOD))?.lesson, GOOD.lesson);
  });

  it('reads an object wrapped in a lesson key', () => {
    assert.equal(parseLessonExtraction(JSON.stringify({ lesson: GOOD }))?.lesson, GOOD.lesson);
  });

  it('reads an object inside a fenced block with prose around it', () => {
    const raw = `Here is what I found:\n\n\`\`\`json\n${JSON.stringify(GOOD)}\n\`\`\`\n\nThat is all.`;
    assert.equal(parseLessonExtraction(raw)?.lesson, GOOD.lesson);
  });

  it('returns null for the answer it is meant to be cheap to give', () => {
    for (const raw of ['null', 'NULL', '  null  ', JSON.stringify(null), '']) {
      assert.equal(parseLessonExtraction(raw), null, `did not read ${JSON.stringify(raw)} as no lesson`);
    }
  });

  it('returns null rather than throwing on anything unreadable', () => {
    for (const raw of ['{ broken', 'I could not think of one', '[]', '{"lesson": "too short"}']) {
      assert.equal(parseLessonExtraction(raw), null, `did not reject ${JSON.stringify(raw)}`);
    }
  });
});

describe('selectLessons', () => {
  /** @type {import('../scripts/lessons.mjs').LessonStore} */
  const store = {
    version: 1,
    lessons: [
      { id: 'lesson-0001', ...GOOD },
      {
        id: 'lesson-0002',
        trigger: ['prisma', 'migration'],
        scope: ['database'],
        lesson: 'Run prisma migrate deploy rather than dev in a non-interactive environment.',
        evidence: { introduced: 2, resolved: 4, tests: [] },
        uses: 0,
      },
    ],
  };

  it('returns the lesson whose trigger appears in the objective', () => {
    const chosen = selectLessons(store, { text: 'the playwright suite cannot authenticate' });
    assert.deepStrictEqual(
      chosen.map((lesson) => lesson.id),
      ['lesson-0001'],
    );
  });

  it('keeps an irrelevant lesson out entirely', () => {
    // The failure this prevents: every lesson injected into every brief, which is how a
    // memory becomes noise.
    assert.deepStrictEqual(selectLessons(store, { text: 'the lint gate reports an unused import' }), []);
  });

  it('matches against failing test ids as well as prose', () => {
    const chosen = selectLessons(store, { text: 'a regression', tests: ['tests/db.spec.ts::prisma connects'] });
    assert.deepStrictEqual(
      chosen.map((lesson) => lesson.id),
      ['lesson-0002'],
    );
  });

  it('orders by how many tags matched, then by id', () => {
    const chosen = selectLessons(store, { text: 'playwright storagestate prisma' });
    assert.deepStrictEqual(
      chosen.map((lesson) => lesson.id),
      ['lesson-0001', 'lesson-0002'],
    );
  });

  it('honours the limit, and returns nothing at all for a limit of zero', () => {
    assert.equal(selectLessons(store, { text: 'playwright prisma' }, { limit: 1 }).length, 1);
    assert.deepStrictEqual(selectLessons(store, { text: 'playwright prisma' }, { limit: 0 }), []);
  });

  it('returns the same list in the same order for the same context', () => {
    const context = { text: 'playwright prisma migration' };
    assert.deepStrictEqual(selectLessons(store, context), selectLessons(store, context));
  });

  it('counts a use only when a lesson was actually selected', () => {
    const marked = markLessonsUsed(store, ['lesson-0001']);
    assert.equal(marked.lessons[0].uses, 1);
    assert.equal(marked.lessons[1].uses, 0);
  });
});

describe('findResolvedStruggles', () => {
  it('finds a failure that survived one repair and fell to a different one', () => {
    const struggles = findResolvedStruggles([
      { iteration: 1, failures: ['gate:e2e'], changed: ['tests/auth.spec.ts'] },
      { iteration: 2, failures: ['gate:e2e'], changed: ['tests/auth.spec.ts'] },
      { iteration: 3, failures: [], changed: ['src/server.ts'] },
    ]);
    assert.deepStrictEqual(
      struggles.map((struggle) => [struggle.key, struggle.introduced, struggle.resolved]),
      [['gate:e2e', 1, 3]],
    );
  });

  it('ignores a failure that cleared on the first attempt', () => {
    // One failure and one fix teaches nothing transferable; it is just work.
    assert.deepStrictEqual(
      findResolvedStruggles([
        { iteration: 1, failures: ['gate:lint'], changed: ['src/a.ts'] },
        { iteration: 2, failures: [], changed: ['src/a.ts'] },
      ]),
      [],
    );
  });

  it('ignores a failure that is still failing', () => {
    assert.deepStrictEqual(
      findResolvedStruggles([
        { iteration: 1, failures: ['gate:e2e'], changed: ['a.ts'] },
        { iteration: 2, failures: ['gate:e2e'], changed: ['b.ts'] },
      ]),
      [],
    );
  });

  it('ignores a repair that touched the same files every time', () => {
    // Same failure, same files, then green usually means the second attempt was the first
    // one finished. There is nothing reusable in "it worked once I completed it".
    assert.deepStrictEqual(
      findResolvedStruggles([
        { iteration: 1, failures: ['gate:types'], changed: ['src/a.ts'] },
        { iteration: 2, failures: ['gate:types'], changed: ['src/a.ts'] },
        { iteration: 3, failures: [], changed: ['src/a.ts'] },
      ]),
      [],
    );
  });

  it('returns struggles in a stable order', () => {
    const history = [
      { iteration: 1, failures: ['gate:e2e', 'gate:lint'], changed: ['a.ts'] },
      { iteration: 2, failures: ['gate:e2e', 'gate:lint'], changed: ['b.ts'] },
      { iteration: 3, failures: [], changed: ['c.ts'] },
    ];
    assert.deepStrictEqual(
      findResolvedStruggles(history).map((struggle) => struggle.key),
      ['gate:e2e', 'gate:lint'],
    );
  });

  it('finds nothing in an empty history', () => {
    assert.deepStrictEqual(findResolvedStruggles([]), []);
  });
});

describe('a lesson may not invent a gate', () => {
  // The extractor is the one child whose output nothing checks. Dogfood run 6 showed the cost:
  // it stored "The `DoD-2-security` gate in this repo enforces the zero-dependency policy: any
  // devDependency ... fails it. It only passes once dependencies are removed entirely." Every
  // clause is false. DoD-2-security is a panel requirement, not a gate; the security gate is
  // `npm audit`, which exited 0 on that tree; and the panel's objection was that vitest was
  // MISSING from the manifest, the opposite of what the lesson claims. Lessons are injected into
  // later briefs, so that would have taught every subsequent builder a falsehood.
  const GATES = ['build', 'lint', 'unit', 'ci', 'red-evidence', 'security-audit', 'quality:knip'];

  /** @param {string} text */
  const candidate = (text) => ({
    trigger: ['dependencies'],
    scope: ['tooling'],
    lesson: text,
    evidence: { introduced: 1, resolved: 3, tests: [] },
  });

  const RUN_6 =
    'The DoD-2-security gate in this repo enforces the zero-dependency policy: any devDependency ' +
    'added to package.json fails it, and it only passes once dependencies are removed entirely.';

  it('discards run 6\u2019s actual lesson, naming what was wrong with it', () => {
    const outcome = addLesson(emptyStore(), candidate(RUN_6), { gateNames: GATES });
    assert.equal(outcome.added, null);
    assert.equal(outcome.reason.includes('DoD-2-security'), true, outcome.reason);
    assert.deepStrictEqual(outcome.store.lessons, []);
  });

  it('keeps a lesson that names a gate this run really has', () => {
    // The neighbour, and the one that matters: gate names appear in honest lessons constantly.
    // A check that rejected those would empty the store instead of grounding it.
    const good = candidate('The unit gate collects only with vitest, so a node:test suite scores zero.');
    const outcome = addLesson(emptyStore(), good, { gateNames: GATES });
    assert.notEqual(outcome.added, null);
    assert.equal(outcome.added?.lesson.includes('unit gate'), true);
  });

  it('leaves ordinary prose alone, including hyphenated gate names', () => {
    for (const text of [
      'The red-evidence gate reports rather than blocks, so an unproven test earns no credit.',
      'The quality:knip gate fails on an unused declared dependency.',
      'Prefer one logger module; the observability gate wants a health endpoint.',
    ]) {
      const outcome = addLesson(emptyStore(), candidate(text), { gateNames: [...GATES, 'observability'] });
      assert.notEqual(outcome.added, null, `wrongly discarded: ${text}`);
    }
  });

  it('only treats id-shaped names as gate claims', () => {
    assert.deepStrictEqual(claimedGateNames('the DoD-2-security gate rejects it'), ['DoD-2-security']);
    assert.deepStrictEqual(claimedGateNames('the PRD-1.1 gate'), ['PRD-1.1']);
    // Bare words are how everyone writes about gates; treating them as claims would be noise.
    assert.deepStrictEqual(claimedGateNames('the unit gate and the ci gate'), []);
  });

  it('checks nothing when it has no gate list, rather than rejecting everything', () => {
    // The conservative direction. An absent or empty list means the caller cannot ground the
    // claim, not that no gate exists - and a check that fails closed here would empty the store.
    assert.equal(ungroundedGateClaim(RUN_6, null), null);
    assert.equal(ungroundedGateClaim(RUN_6, []), null);
    assert.notEqual(addLesson(emptyStore(), candidate(RUN_6)).added, null);
  });
});

describe('the store is bounded and a lesson can be taken back (item 35)', () => {
  /** @param {number} n @param {number} [uses] @returns {any} */
  const lesson = (n, uses = 0) => ({
    id: `lesson-${String(n).padStart(4, '0')}`,
    trigger: ['t'],
    scope: ['src'],
    lesson: `A lesson long enough to pass the length bar, number ${n}.`,
    evidence: { introduced: 1, resolved: 2, tests: [] },
    uses,
  });
  /** @param {any[]} lessons @returns {any} */
  const storeOf = (lessons) => ({ version: 1, lessons, retracted: [] });

  it('bounds the store itself, not only what a brief sees', () => {
    // selectLessons already caps the view, and that hid the real growth: the file had no bound at
    // all, so a store accumulated across every run of a repository forever. A view-only cap makes
    // an unbounded store look bounded, which is the worse of the two failures.
    const store = storeOf(Array.from({ length: 5 }, (_unused, index) => lesson(index + 1)));
    const { store: bounded } = boundStore(store, { at: 7, limit: 3 });
    assert.equal(bounded.lessons.length, 3);
  });

  it('leaves a store already under its bound completely alone', () => {
    const store = storeOf([lesson(1), lesson(2)]);
    const { store: bounded, evicted } = boundStore(store, { at: 7, limit: 3 });
    assert.deepStrictEqual(evicted, []);
    assert.equal(bounded, store, 'an unchanged store should not be rebuilt');
  });

  it('evicts the least used first, because uses are the only evidence a lesson helped', () => {
    const store = storeOf([lesson(1, 5), lesson(2, 0), lesson(3, 2)]);
    const { store: bounded, evicted } = boundStore(store, { at: 7, limit: 2 });
    assert.deepStrictEqual(evicted.map((entry) => entry.id), ['lesson-0002']);
    assert.deepStrictEqual(bounded.lessons.map((entry) => entry.id), ['lesson-0001', 'lesson-0003']);
  });

  it('breaks a tie on id, so two machines evict the same lesson', () => {
    // A store that evicted differently on two machines would make one repository behave differently
    // for two people, which is the kind of divergence nobody thinks to look for.
    const store = storeOf([lesson(3, 1), lesson(1, 1), lesson(2, 1)]);
    const { evicted } = boundStore(store, { at: 7, limit: 1 });
    assert.deepStrictEqual(evicted.map((entry) => entry.id), ['lesson-0001', 'lesson-0002']);
  });

  it('evicts by retracting, so the store remembers having learned it', () => {
    // A silent drop loses the record of having learned the lesson, and the next run learns it
    // again - a loop that looks like progress and is not.
    const { store: bounded } = boundStore(storeOf([lesson(1, 0), lesson(2, 9)]), { at: 7, limit: 1 });
    assert.equal(bounded.retracted?.length, 1);
    assert.equal(bounded.retracted?.[0].id, 'lesson-0001');
    assert.match(String(bounded.retracted?.[0].reason), /evicted to keep the store under 1 lessons; used 0 time\(s\)/);
  });

  it('keeps the retracted text, so a promoter can avoid repeating a harmful edit', () => {
    const { store: after, retracted } = retractLesson(storeOf([lesson(1)]), 'lesson-0001', {
      reason: 'it described a gate that never existed',
      at: 4,
    });
    assert.equal(after.lessons.length, 0);
    assert.equal(retracted?.lesson, 'A lesson long enough to pass the length bar, number 1.');
    assert.equal(retracted?.reason, 'it described a gate that never existed');
    assert.equal(retracted?.retiredAt, 4);
  });

  it('treats retracting an absent lesson as nothing to do, not an error', () => {
    // Two runs retracting the same false lesson is an ordinary race, and the second one failing
    // would turn a correction into an incident.
    const store = storeOf([lesson(1)]);
    const { store: after, retracted } = retractLesson(store, 'lesson-0999', { reason: 'x', at: 1 });
    assert.equal(retracted, null);
    assert.equal(after, store);
  });

  it('records a reason even when the caller gave none', () => {
    const { retracted } = retractLesson(storeOf([lesson(1)]), 'lesson-0001', { reason: '   ', at: 1 });
    assert.equal(retracted?.reason, 'no reason given');
  });

  it('round-trips the ledger through disk, or the retraction never happened', () => {
    // A first draft wrote only `lessons`, so a retraction survived until the next save and the store
    // would then re-learn what it had just thrown out.
    const dir = makeTempDir();
    const { store: after } = retractLesson(storeOf([lesson(1), lesson(2)]), 'lesson-0001', {
      reason: 'it was wrong',
      at: 3,
    });
    saveLessons(dir, after);
    const { store: reloaded } = readLessons(dir);
    assert.deepStrictEqual(reloaded.lessons.map((entry) => entry.id), ['lesson-0002']);
    assert.equal(reloaded.retracted?.length, 1);
    assert.equal(reloaded.retracted?.[0].reason, 'it was wrong');
  });

  it('drops a malformed ledger entry without losing the store beside it', () => {
    const dir = makeTempDir();
    saveLessons(dir, storeOf([lesson(1)]));
    const file = path.join(dir, 'lessons.json');
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    raw.retracted = [{ id: 'lesson-0009', lesson: 'ok', reason: 'fine' }, 7, null, { id: 'no-text' }];
    writeFileSync(file, JSON.stringify(raw));
    const { store } = readLessons(dir);
    assert.equal(store.lessons.length, 1, 'a corrupt retraction cost the store that survived beside it');
    assert.deepStrictEqual(store.retracted?.map((entry) => entry.id), ['lesson-0009']);
  });
});

describe('a lesson becomes durable only on independent support (item 35)', () => {
  /** @param {string} [text] @returns {any} */
  const candidate = (text = 'Read the config before assuming the browser is missing entirely.') => ({
    trigger: ['config'],
    scope: ['src'],
    lesson: text,
    evidence: { introduced: 1, resolved: 3, tests: [] },
  });
  const empty = () => emptyStore();

  it('stages a first sighting rather than storing it', () => {
    // A lesson one run believed is not yet a lesson, and the difference has to be visible in what
    // gets handed out.
    const { store, staged } = stageCandidate(empty(), candidate(), { runKey: 'run-a', at: 1 });
    assert.equal(store.lessons.length, 0);
    assert.equal(staged?.support.length, 1);
    assert.equal(store.candidates?.length, 1);
  });

  it('counts a second run as support and promotes at the threshold', () => {
    let store = stageCandidate(empty(), candidate(), { runKey: 'run-a', at: 1 }).store;
    store = stageCandidate(store, candidate(), { runKey: 'run-b', at: 2 }).store;
    const { store: after, promoted } = promoteCandidates(store);
    assert.equal(promoted.length, 1);
    assert.equal(after.lessons.length, 1);
    assert.equal(after.candidates?.length, 0);
    assert.equal(after.lessons[0].uses, 0);
  });

  it('counts one run twice as once, which is the whole gate', () => {
    // SkillOpt's harvest: the same run failing the same way is one observation repeated. A store
    // promoted on that learns a lesson about one afternoon and teaches it forever.
    const store = stageCandidate(empty(), candidate(), { runKey: 'run-a', at: 1 }).store;
    const second = stageCandidate(store, candidate(), { runKey: 'run-a', at: 2 });
    assert.equal(second.staged?.support.length, 1);
    assert.match(second.reason, /already supports/);
    assert.deepStrictEqual(promoteCandidates(second.store).promoted, []);
  });

  it('does not let a rephrasing count as a second opinion', () => {
    // Identity is normalised text, so the same sentence in different whitespace or case is the same
    // candidate rather than independent support for it.
    let store = stageCandidate(empty(), candidate(), { runKey: 'run-a', at: 1 }).store;
    store = stageCandidate(store, candidate('  READ THE CONFIG  before assuming the browser is missing entirely. '), {
      runKey: 'run-a',
      at: 2,
    }).store;
    assert.equal(store.candidates?.length, 1);
    assert.equal(store.candidates?.[0].support.length, 1);
  });

  it('refuses a candidate with no run identity, which could otherwise support itself', () => {
    const { store, staged, reason } = stageCandidate(empty(), candidate(), { runKey: '  ', at: 1 });
    assert.equal(staged, null);
    // An empty store has an empty candidate list, not an absent one: 'nothing staged' and 'no
    // staging area' are different facts and a reader should not have to tell them apart.
    assert.deepStrictEqual(store.candidates, []);
    assert.match(reason, /no run identity/);
  });

  it('refuses a candidate equivalent to something already durable', () => {
    const durable = addLesson(empty(), candidate()).store;
    const { staged, reason } = stageCandidate(durable, candidate(), { runKey: 'run-b', at: 2 });
    assert.equal(staged, null);
    assert.match(reason, /already durable/);
  });

  it('refuses a candidate the ledger already rejected, so a harmful edit is not repeated', () => {
    // The ledger's stated purpose. A promoter that forgets what it refused will refuse it again, or
    // worse accept it next time.
    const staged = stageCandidate(empty(), candidate(), { runKey: 'run-a', at: 1 });
    const digest = String(staged.staged?.digest);
    const { store: afterReject } = rejectCandidate(staged.store, digest, {
      reason: 'it described behaviour the loop does not have',
      delta: 'two later runs regressed on the gate it named',
      at: 3,
    });
    const retry = stageCandidate(afterReject, candidate(), { runKey: 'run-b', at: 4 });
    assert.equal(retry.staged, null);
    assert.match(retry.reason, /rejected before/);
  });

  it('keeps the refusal and its validation delta, not just a verdict', () => {
    const staged = stageCandidate(empty(), candidate(), { runKey: 'run-a', at: 1 });
    const { store, rejected } = rejectCandidate(staged.store, String(staged.staged?.digest), {
      reason: 'it described behaviour the loop does not have',
      delta: 'two later runs regressed on the gate it named',
      at: 3,
    });
    assert.equal(store.candidates?.length, 0);
    assert.equal(rejected?.reason, 'it described behaviour the loop does not have');
    assert.equal(rejected?.delta, 'two later runs regressed on the gate it named');
  });

  it('records a delta even when the caller gave none, rather than an empty field', () => {
    const staged = stageCandidate(empty(), candidate(), { runKey: 'run-a', at: 1 });
    const { rejected } = rejectCandidate(staged.store, String(staged.staged?.digest), { reason: '', delta: '', at: 3 });
    assert.equal(rejected?.reason, 'no reason given');
    assert.equal(rejected?.delta, 'no validation delta recorded');
  });

  it('treats rejecting an unknown candidate as nothing to do', () => {
    const store = empty();
    const { store: after, rejected } = rejectCandidate(store, 'deadbeef', { reason: 'x', delta: 'y', at: 1 });
    assert.equal(rejected, null);
    assert.equal(after, store);
  });

  it('never hands a candidate or a rejection to a builder', () => {
    // The invariant item 35 turns on: `selectLessons` reads only `store.lessons`, so an unpromoted
    // candidate cannot be taught to anybody. Asserted rather than relied upon, because a later
    // convenience that merged the lists would be an easy and invisible mistake.
    const staged = stageCandidate(empty(), candidate(), { runKey: 'run-a', at: 1 });
    const { store } = rejectCandidate(
      stageCandidate(staged.store, candidate('A different lesson that is also long enough to store.'), {
        runKey: 'run-a',
        at: 2,
      }).store,
      String(staged.staged?.digest),
      { reason: 'no', delta: 'worse', at: 3 },
    );
    const selected = selectLessons(store, { text: 'config browser src lesson', tags: ['config'], paths: ['src'] });
    assert.deepStrictEqual(selected, []);
  });
});
