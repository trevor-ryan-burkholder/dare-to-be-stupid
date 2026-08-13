/**
 * Tests for the prompt templates (DESIGN.md §8, CLAUDE.md "Prompt templates are product
 * code").
 *
 * A prompt cannot be unit-tested for whether it produces good judgement. What it *can* be
 * tested for is the thing that actually breaks: the reviewer template documents a
 * machine-parsed contract, and the parser is a separate file. Those two drift apart
 * silently — the prompt keeps asking for a shape the parser stopped accepting, every audit
 * comes back unparseable, and by the rules that means every audit fails.
 *
 * So the example in the template is fed through the real parser. If either side changes
 * shape without the other, this fails.
 */

import assert from 'node:assert/strict';

import { RELATION_KINDS, parseRelation } from '../scripts/oracle.mjs';
import { GATE_POLICY } from '../scripts/gate-policy.mjs';
import { readFileSync, readdirSync } from 'node:fs';

import { renderTemplate, requiredIdsFor } from '../scripts/driver.mjs';
import { describe, it } from 'node:test';

import { parseAssumptions } from '../scripts/assumptions.mjs';
import { CAPABILITY_ORDER, parseCapabilityDeclaration } from '../scripts/capabilities.mjs';
import { parseReviewerReport, toolchainGuidance } from '../scripts/driver.mjs';
import { TOOLCHAINS } from '../scripts/toolchains/index.mjs';
import { parseLessonExtraction } from '../scripts/lessons.mjs';

const TEMPLATE_DIR = new URL('../templates/', import.meta.url);

/** @param {string} name */
function readTemplate(name) {
  return readFileSync(new URL(name, TEMPLATE_DIR), 'utf8');
}

const REVIEWER = readTemplate('reviewer-system.md');
const BUILDER = readTemplate('builder-system.md');
const PRD_AUTHOR = readTemplate('prd-author.md');
const ARCHITECT = readTemplate('architect.md');
const LESSON_EXTRACTOR = readTemplate('lesson-extractor.md');

/**
 * Every fenced json block in a template.
 * @param {string} markdown
 * @returns {string[]}
 */
function jsonBlocks(markdown) {
  return [...markdown.matchAll(/```json\n([\s\S]*?)```/g)].map((match) => match[1]);
}

describe('the reviewer template and the parser agree', () => {
  it('embeds exactly one json example', () => {
    assert.equal(jsonBlocks(REVIEWER).length, 1);
  });

  it('embeds an example that is valid json', () => {
    assert.equal(typeof JSON.parse(jsonBlocks(REVIEWER)[0]), 'object');
  });

  it('embeds an example the parser reads without complaint', () => {
    const example = JSON.parse(jsonBlocks(REVIEWER)[0]);
    // The panel is heterogeneous, so a reviewer is asked only about the ids it owns.
    // Advisory entries are not owned ids; they are volunteered.
    const ids = example.requirements
      .map((/** @type {{ id: string }} */ entry) => entry.id)
      .filter((/** @type {string} */ id) => !id.startsWith('advisory-'));
    const report = parseReviewerReport(jsonBlocks(REVIEWER)[0], { requiredIds: ids });
    assert.deepStrictEqual(report.problems, [], 'the documented example must not trip the parser');
    assert.deepStrictEqual(
      report.requirements.map((entry) => [entry.id, entry.status]),
      [
        ['PRD-3.2', 'pass'],
        ['DoD-2-security', 'fail'],
      ],
    );
  });

  it('embeds an advisory example the parser reads as advisory, not as compliance', () => {
    // If the template teaches a shape the parser buckets differently, every advisory a real
    // reviewer raises would either be ignored or would wrongly block a compliant build.
    const report = parseReviewerReport(jsonBlocks(REVIEWER)[0], { requiredIds: ['PRD-3.2', 'DoD-2-security'] });
    assert.equal(report.advisories.length, 1, 'the documented advisory was not read as one');
    assert.equal(report.advisories[0].severity, 'minor');
    assert.equal(report.advisories[0].confidence, 0.63);
    assert.equal(report.advisories[0].evidence, 'src/session.ts:12');
    assert.equal(report.advisories[0].repairHint.length > 0, true);
  });

  it('teaches that advisory confidence cannot decide the verdict', () => {
    assert.equal(REVIEWER.includes('They never decide whether this run ships'), true);
    assert.equal(REVIEWER.includes('do not affect `verdict`'), true);
  });

  it('tells the reviewer it owns a subset, and that nobody covers it behind them', () => {
    assert.equal(REVIEWER.includes('You own part of this, not all of it'), true);
    assert.equal(REVIEWER.includes('Do not adjudicate what you do not own'), true);
    assert.equal(REVIEWER.includes('Do not assume anyone covers yours'), true);
  });

  it('embeds an example whose passing entry really satisfies the evidence rule', () => {
    // If the template's own example would be flipped to fail, the prompt is teaching a
    // shape the parser rejects.
    const example = JSON.parse(jsonBlocks(REVIEWER)[0]);
    const passing = example.requirements.filter((/** @type {{ status: string }} */ e) => e.status === 'pass');
    assert.equal(passing.length, 1);
    const report = parseReviewerReport(JSON.stringify({ requirements: passing }), { requiredIds: ['PRD-3.2'] });
    assert.equal(report.verdict, 'pass');
  });

  it('documents every DoD id the parser will be asked to find', () => {
    for (const id of [
      'DoD-1-requirements',
      'DoD-2-security',
      'DoD-3-ci',
      'DoD-4-docs-observability',
      'DoD-5-design',
    ]) {
      assert.equal(REVIEWER.includes(id), true, `reviewer template never mentions ${id}`);
    }
  });
});

describe('the reviewer template stays hostile', () => {
  // CLAUDE.md: "Keep them hostile. Charitable review is the failure mode the whole design
  // exists to prevent." These are the specific instructions DESIGN.md §4 requires; losing
  // one is how a template quietly becomes agreeable.
  const required = [
    ['defaults to **fail**', 'the default verdict'],
    ['path/file.ext:LINE', 'the evidence format'],
    ['A passing test is not evidence', 'the rule about tests that assert nothing'],
    ['Check the negative case', 'the rule about auth'],
    ['Every id you own gets an entry', 'the rule about missing entries'],
    ['Do not fix anything', 'read-only framing'],
    ['No partial credit', 'the absence of a middle status'],
  ];
  for (const [needle, what] of required) {
    it(`still states ${what}`, () => {
      assert.equal(REVIEWER.includes(needle), true, `reviewer template lost: ${needle}`);
    });
  }

  it('never tells the reviewer an agent wrote the code', () => {
    // DESIGN.md §1.1: the reviewer gets no hint that this is agent output, because that
    // framing invites charity.
    for (const tell of ['agent', 'iteration log', 'build log was']) {
      assert.equal(REVIEWER.toLowerCase().includes(tell.toLowerCase()), false, `reviewer template leaks: ${tell}`);
    }
  });
});

describe('the builder template', () => {
  const required = [
    ['Do not declare completion', 'the instruction not to self-assess'],
    ['Do not satisfice', 'the instruction against meeting the letter of the spec'],
    ['Do not gold-plate either', 'the instruction against building more than was asked'],
    ['No abstraction with one caller', 'the concrete anti-overengineering rule'],
    ['Clean up only your own mess', 'the dead-code boundary'],
    ['Regressions outrank everything', 'regression priority'],
    ['RED before GREEN', 'the red-evidence rule'],
    ['Properties, where the domain has one', 'when to write a property instead of examples'],
    ['inputs you did not choose', 'why a property is harder to satisfice than an example'],
    ['toBeTruthy', 'a concrete example of an assertion that proves nothing'],
    ['route handler', 'where guards belong'],
    ['Anything under `.dare/`, at any depth', 'what it may not touch, stated positionally'],
    ['invisible to the ratchet', 'what a suite the gates cannot collect is worth'],
  ];
  for (const [needle, what] of required) {
    it(`still states ${what}`, () => {
      assert.equal(BUILDER.includes(needle), true, `builder template lost: ${needle}`);
    });
  }

  it('leaves the runner to be derived, and names no runner itself', () => {
    // It used to hardcode `npx vitest run --reporter=json` and `npx playwright test`. An audit
    // found this sentence written in three places and correct in one: `firstIterationTask`
    // derived it, while this template and the `no-tests` objective both asserted Node. On .NET
    // the objective was worse than stale - it gave wrong runner advice at the exact moment the
    // builder was being corrected for using the wrong runner.
    //
    // Every greenfield failure this project has recorded is this sentence, so the check is now
    // that the template states no runner at all and carries the placeholders instead.
    assert.equal(BUILDER.includes('{{unitLine}}'), true, 'the unit runner is no longer rendered');
    assert.equal(BUILDER.includes('{{e2eLine}}'), true, 'the e2e runner is no longer rendered');
    for (const hardcoded of ['npx vitest', 'npx playwright', 'node:test', 'mocha']) {
      assert.equal(BUILDER.includes(hardcoded), false, `builder template hardcodes a runner: ${hardcoded}`);
    }
  });

  it('ties gold-plating to the ratchet rather than to taste', () => {
    // The reason this rule is load-bearing here and merely good advice elsewhere: a
    // monotonic ratchet means a test over a speculative abstraction must pass forever.
    assert.equal(BUILDER.includes('monotonic'), true);
  });

  it('warns that deleting pre-existing dead code can trip the ratchet', () => {
    assert.equal(BUILDER.includes('already in the ratchet'), true);
  });

  it('gives the assumptions contract a shape the parser accepts', () => {
    // The template's own example is the contract. If the parser would reject it, every
    // obedient builder fails its iteration on the block it was told to emit.
    const example = jsonBlocks(BUILDER).find((candidate) => candidate.includes('"assumptions"'));
    assert.notEqual(example, undefined, 'the builder template has no assumptions example');
    const parsed = parseAssumptions(`\`\`\`json\n${example}\`\`\``);
    assert.equal(parsed.malformed, '');
    assert.equal(parsed.assumptions.length, 1);
    assert.equal(parsed.discarded, 0, 'the documented example would be discarded by its own bar');
  });

  it('states the citation bar and what happens without it', () => {
    // Matched short because the sentence wraps in the template; the rule is the phrase, not
    // the line breaks a formatter happens to choose.
    assert.equal(BUILDER.includes('An assumption citing nothing is'), true);
    assert.equal(BUILDER.includes('discarded'), true);
  });

  it('separates declaring an ambiguity from assessing the work', () => {
    // Without this the section argues with "do not declare completion" three headings above
    // it, and a builder resolves the contradiction by picking one — probably silence.
    assert.equal(BUILDER.includes('declaring an ambiguity is not an assessment'), true);
  });

  it('lets the reviewer fail a wrong answer that exits successfully, and bounds it', () => {
    // The one thing a reviewer may fail an id for that the specification does not mention. Every
    // other check in this loop watches an exit code, so a program that answers wrongly and exits 0
    // passes all of them - observed for real, a CSV tool that swallowed the rest of the file on an
    // unterminated quote and reported statistics over half the data, which a panel then passed.
    assert.equal(REVIEWER.includes('wrong answer at a success exit code is a fail'), true);
    assert.equal(REVIEWER.includes('confidently wrong'), true);
    // Both halves, per F2: the bound is what stops this becoming "fail anything you would have
    // built differently". A missing feature is an advisory; a demonstrable wrong output is a fail.
    assert.equal(REVIEWER.includes('Do not stretch this'), true);
    assert.equal(REVIEWER.includes('not absent features'), true);
    assert.equal(REVIEWER.includes('If you cannot produce the input'), true);
  });

  it('tells the builder that emitting nothing is the common case', () => {
    // The failure mode that reaches the reviewer: a model that answers because it was asked.
    assert.equal(BUILDER.includes('Emit no block at all if nothing was ambiguous'), true);
  });

  it('gives the ambiguity bar as a fork, with both halves of the example', () => {
    // "Emit nothing if nothing was ambiguous" was already there and was not enough. The first
    // tier-3 run ever executed handed a live builder a requirement stating its status code, its
    // exact body and the words "nothing about this is ambiguous", and it still recorded that
    // response headers were unspecified - a true observation, and noise in an auditor's hands.
    //
    // Both halves are asserted for the reason F2 gives: a rule with only positive examples does
    // not tell the reader where the line is. The counterexample is the half that does the work.
    // Matched in two fragments rather than one, because the sentence wraps in the template and a
    // substring that straddles the newline fails for a formatting reason nobody intended.
    assert.equal(BUILDER.includes('The bar is a fork, not a silence'), true);
    assert.equal(BUILDER.includes('have chosen differently'), true);
    assert.equal(BUILDER.includes('a detail the document did not mention is not'), true);
    assert.equal(BUILDER.includes('404 or 410'), true, 'lost the fork example');
    assert.equal(BUILDER.includes('Content-Type'), true, 'lost the counterexample, which is the half that draws the line');
  });

  it('does not tell an unattended builder to stop and ask', () => {
    // There is nobody to ask. Ambiguity is resolved by the PRD phase and the
    // reality-check circuit-breaker; a builder that stalls waiting for an answer just
    // burns the stall limit.
    for (const tell of ['ask for clarification', 'ask the user', 'stop and clarify', 'clarifying question']) {
      assert.equal(BUILDER.toLowerCase().includes(tell), false, `builder template tells it to ask: ${tell}`);
    }
  });

  it('describes all three settings of the stupidity dial', () => {
    for (const level of ['chaos 1', 'chaos 2', 'chaos 3']) {
      assert.equal(BUILDER.includes(level), true, `builder template never explains ${level}`);
    }
  });

  it('states surgical discipline as the chaos-1 text, not as an unconditional rule', () => {
    // Landing "every changed line must trace to the objective" unconditionally would make
    // chaos 2 and 3 dead configuration, or produce a template arguing with itself two
    // paragraphs apart. The rule sharpens a level that already exists.
    const surgical = BUILDER.indexOf('every changed line traces directly to the current objective');
    const normal = BUILDER.indexOf('chaos 2 — normal');
    assert.equal(surgical > 0, true, 'the surgical rule is missing');
    assert.equal(surgical < normal, true, 'the surgical rule is not inside the chaos-1 bullet');
  });

  it('keeps chaos 2 and 3 permissive, so the dial still turns', () => {
    assert.equal(BUILDER.includes('related refactors are allowed inside the current slice'), true);
    assert.equal(BUILDER.includes('restructure freely'), true);
    assert.equal(BUILDER.includes('only the first is surgical'), true);
  });

  it('puts the chaos-independent halves in the general sections, not on the dial', () => {
    // Orphan cleanup and simplicity-first hold at every chaos level, so stating them as
    // chaos-1 text would be wrong in the other direction.
    assert.equal(BUILDER.includes('If 200 lines could be 50, write 50.'), true);
    assert.equal(BUILDER.includes('say so in your closing lines and leave it'), true);
  });

  it('asks for properties without naming a library to get them from', () => {
    // "Do not build a framework" is the whole scope of the item. Naming fast-check here
    // would make a build depend on a package the plugin does not install and cannot gate.
    for (const library of ['fast-check', 'jsverify', 'hypothesis', 'quickcheck']) {
      assert.equal(BUILDER.toLowerCase().includes(library), false, `builder template names ${library}`);
    }
  });

  it('tells the builder not to invent an invariant that is not there', () => {
    // Without this the instruction reads as "always write properties", and a property over a
    // domain with no invariant is an example test with extra machinery — which the ratchet
    // then makes permanent.
    assert.equal(BUILDER.includes('do not invent one'), true);
  });

  it('names no protected file, because the rule the hook enforces is the directory', () => {
    // The template used to say `.dare/state.json` and `.dare/config.json`, which has been
    // wrong since 0.10.0 made the guard positional. A builder told a shorter list than the
    // hook enforces spends an iteration finding out, and every artifact invented after the
    // list was written defaults to looking writable.
    assert.deepEqual(BUILDER.match(/`\.dare\/[\w-]+\.json`/g), null);
    assert.equal(BUILDER.includes('positionally'), true, 'never says how the rule is enforced');
  });
});

describe('the prd-author template', () => {
  it('requires the numbered id format the reviewer keys off', () => {
    assert.equal(PRD_AUTHOR.includes('PRD-<section>.<n>'), true);
  });

  it('shows a testable requirement beside an untestable one', () => {
    assert.equal(PRD_AUTHOR.includes('follow best practices'), true, 'keeps the counter-example');
    assert.equal(PRD_AUTHOR.includes('cannot fail'), true, 'says why the counter-example is worthless');
  });

  it('asks for failure paths and an explicit out-of-scope list', () => {
    assert.equal(PRD_AUTHOR.includes('Out of scope'), true);
    assert.equal(PRD_AUTHOR.toLowerCase().includes('failure path'), true);
  });

  it('keeps implementation choices out of the PRD', () => {
    assert.equal(PRD_AUTHOR.includes('No implementation choices'), true);
  });

  it('notes that an observable outcome arrives pre-shaped for RED evidence', () => {
    assert.equal(PRD_AUTHOR.includes('observable'), true);
    assert.equal(PRD_AUTHOR.includes('failing before the code that makes it pass'), true);
  });

  it('refuses to turn requirements into builder instructions', () => {
    // The reduced form of F3. Applied literally the original would rewrite
    // "an unauthenticated request receives 401" into "write tests for invalid inputs, then
    // make them pass" — an instruction, not an observation an auditor can falsify. That
    // degrades the reviewer's checklist into a task list, which is the Ralph hole this
    // architecture exists to avoid.
    assert.equal(PRD_AUTHOR.includes('Do not rewrite them into instructions'), true);
    assert.equal(PRD_AUTHOR.includes("auditor's checklist rather than the builder's"), true);
  });

  it('constrains the size of one requirement, not only the size of the whole scope', () => {
    // The template already said "prefer the smallest thing that is genuinely useful", which
    // bounds the document. Nothing bounded a single id, and an oversized one surfaces as
    // mysterious stalling rather than as a legible failure.
    assert.equal(PRD_AUTHOR.includes("One requirement is one iteration's work"), true);
  });

  it('shows a right-sized requirement beside an oversized one', () => {
    // Both halves, for the same reason the testable/untestable pair exists above it: a rule
    // with only good examples does not tell the author where the line is.
    assert.equal(PRD_AUTHOR.includes('Add authentication.'), true, 'loses the too-big example');
    assert.equal(PRD_AUTHOR.includes('Too big'), true, 'never labels the counter-example');
  });

  it('ties oversizing to the one-verdict-per-id contract rather than to taste', () => {
    // This is why the rule is load-bearing here specifically: the reviewer returns exactly
    // one verdict object per id, so a requirement covering twelve behaviours fails as one
    // opaque `fail` and the run cannot learn which of the twelve was missing.
    assert.equal(PRD_AUTHOR.includes('one verdict object per id'), true);
  });
});

describe('the architect template', () => {
  it('names every document DESIGN.md phase 1 requires', () => {
    for (const file of ['architecture.md', 'api-contract.md', 'data-model.md', 'CLAUDE.md', 'PRODUCT.md']) {
      assert.equal(ARCHITECT.includes(file), true, `architect template never asks for ${file}`);
    }
  });

  it('requires error responses in the contract, not only success shapes', () => {
    assert.equal(ARCHITECT.includes('every error response'), true);
  });

  it('requires every PRD requirement to have a component responsible for it', () => {
    assert.equal(ARCHITECT.includes('PRD-3.2'), true, 'shows the mapping requirement concretely');
  });

  it('offers the whole capability vocabulary and nothing outside it', () => {
    // The architect cannot declare a capability it was never shown, and a vocabulary that
    // drifts between the template and the parser aborts every run at the design phase.
    for (const capability of CAPABILITY_ORDER) {
      assert.equal(ARCHITECT.includes(`\`${capability}\``), true, `architect template never offers ${capability}`);
    }
  });

  it('says which direction to err in, because under-declaring silently skips a gate', () => {
    assert.equal(ARCHITECT.includes('Under-declaring is the expensive mistake'), true);
  });

  it('embeds exactly one json example, and the parser accepts it', () => {
    // The template's own example is the contract. If the parser would reject it, every
    // obedient architect aborts the run.
    const blocks = jsonBlocks(ARCHITECT);
    assert.equal(blocks.length, 1);
    assert.deepEqual(parseCapabilityDeclaration(blocks[0]), ['api', 'persistent-storage']);
  });

  it('says the example is an example, so it is replaced rather than copied', () => {
    assert.equal(ARCHITECT.includes('Those two values are an example. Replace them.'), true);
  });
});

describe('the lesson-extractor template and the lesson parser agree', () => {
  it('embeds exactly one json example, and the parser stores it', () => {
    const blocks = jsonBlocks(LESSON_EXTRACTOR);
    assert.equal(blocks.length, 1);
    const lesson = parseLessonExtraction(blocks[0]);
    assert.notEqual(lesson, null, 'the documented example is not a lesson the parser would keep');
    assert.equal((lesson?.trigger.length ?? 0) > 0, true);
    assert.equal(lesson?.evidence.introduced, 6);
    assert.equal(lesson?.evidence.resolved, 8);
  });

  it('makes returning nothing an easy and consequence-free answer', () => {
    // An extractor that feels obliged to produce something produces filler, and every
    // useless sentence stored is read by every later brief.
    assert.equal(LESSON_EXTRACTOR.includes('return `null`'), true);
    assert.equal(LESSON_EXTRACTOR.includes('Nothing bad happens when you do'), true);
    assert.equal(LESSON_EXTRACTOR.includes('no build fails for it'), true);
  });

  it('shows what does not count as a lesson, concretely', () => {
    for (const antiExample of ['Be careful when changing authentication.', 'Read the error message.']) {
      assert.equal(LESSON_EXTRACTOR.includes(antiExample), true, `lost the counter-example: ${antiExample}`);
    }
  });

  it('requires triggers that will actually recur, and says why', () => {
    assert.equal(LESSON_EXTRACTOR.includes('literally'), true);
    assert.equal(LESSON_EXTRACTOR.includes('Useless triggers'), true);
  });

  it('asks for the circumstances rather than a restatement of the lesson', () => {
    // The store's usefulness is unproven in a way the tests cannot reach, and the failure
    // mode is named: a store full of generalities. Whether the extractor fills `trigger`
    // with conditions or with keyword-shaped restatements is where that is decided.
    assert.equal(LESSON_EXTRACTOR.includes('A trigger is a condition, not a summary'), true);
    assert.equal(LESSON_EXTRACTOR.includes('what would I have to be looking at to need this?'), true);
  });

  it('gives the extractor a check it can run against the evidence it was handed', () => {
    // The instruction that makes this actionable rather than aspirational: a trigger that
    // does not match the failure it was extracted *from* cannot match the recurrence.
    assert.equal(LESSON_EXTRACTOR.includes('actually occurs in it'), true);
    assert.equal(LESSON_EXTRACTOR.includes('will not match that failure'), true);
  });

  it('says a vague trigger is worse than none, because validation cannot catch it', () => {
    // `validateLesson` rejects a lesson with no trigger outright. A lesson with a trigger
    // matching everything passes, and is then injected into every later brief — so this is
    // the one failure in the lesson store that no code can fail closed on.
    assert.equal(LESSON_EXTRACTOR.includes('same defect as having no trigger at all'), true);
    assert.equal(LESSON_EXTRACTOR.includes('passes validation'), true);
  });

  it('pairs every trigger example with the useless version of the same lesson', () => {
    // Both columns, for the reason the PRD author shows a testable requirement beside an
    // untestable one: the difference is the teaching, and one column alone is a slogan.
    assert.equal(LESSON_EXTRACTOR.includes('a summary trigger (useless)'), true);
    assert.equal(LESSON_EXTRACTOR.includes('a condition trigger (useful)'), true);
    assert.equal(LESSON_EXTRACTOR.includes('no test suite found'), true, 'lost the error-text trigger example');
  });

  it('does not ask what the builder learned', () => {
    // The whole design of this memory is that lessons come from evidence, never from
    // self-report. A model asked what it learned will always answer.
    for (const tell of ['what did you learn', 'what you learned', 'reflect on']) {
      assert.equal(LESSON_EXTRACTOR.toLowerCase().includes(tell), false, `lesson extractor asks for self-report: ${tell}`);
    }
  });
});

describe('every template', () => {
  /** @type {[string, string][]} */
  const all = [
    ['reviewer-system.md', REVIEWER],
    ['builder-system.md', BUILDER],
    ['prd-author.md', PRD_AUTHOR],
    ['architect.md', ARCHITECT],
    ['lesson-extractor.md', LESSON_EXTRACTOR],
  ];

  for (const [name, contents] of all) {
    it(`${name} is non-empty and has a heading`, () => {
      assert.equal(contents.trimStart().startsWith('# '), true);
      assert.equal(contents.length > 500, true, `${name} is suspiciously short`);
    });

    it(`${name} carries no Junkion styling`, () => {
      // DESIGN.md §9: the comedy is in the output layer only. A prompt written in the
      // voice would change what the model does, which is exactly what the style layer is
      // forbidden from doing.
      for (const tell of ['VOLUNTARY RECALL', 'GRAND PRIZE', 'LIMITED-TIME', 'STAY TUNED']) {
        assert.equal(contents.toUpperCase().includes(tell), false, `${name} contains style-layer text: ${tell}`);
      }
    });
  }
});

describe('the toolchain guidance fragments', () => {
  // B6. One fragment per toolchain, selected by detection. No framework, no personas — the
  // seam only became real when a second toolchain landed.

  it('exists for every registered toolchain', () => {
    // The check that makes this a seam rather than two files. A toolchain added without a
    // fragment still runs — the brief announces the gap — but this fails, so the gap is a
    // decision somebody makes rather than one they drift into.
    for (const toolchain of TOOLCHAINS) {
      assert.equal(
        toolchainGuidance(toolchain.name).length > 0,
        true,
        `no templates/toolchain-${toolchain.name}.md for the ${toolchain.name} toolchain`,
      );
    }
  });

  it('returns empty for a toolchain nobody has written one for', () => {
    assert.equal(toolchainGuidance('cobol'), '');
  });

  it('tells a .NET builder the two things that silently produce zero tests', () => {
    const dotnet = toolchainGuidance('dotnet');
    // Both were hit while verifying the adapter against a real SDK: a test project missing
    // from the solution collects nothing, and one missing a project reference fails with
    // CS0246, which names neither the reference nor the cause.
    assert.equal(dotnet.includes('dotnet sln add'), true);
    assert.equal(dotnet.includes('dotnet add'), true);
    assert.equal(dotnet.includes('CS0246'), true);
  });

  it('tells a Node builder that the unit gate collects with vitest and not npm test', () => {
    // The fault that killed both live runs on 10 August: a correct node:test suite, a green
    // `npm test`, and a gate reporting zero tests.
    assert.equal(toolchainGuidance('node').includes('collects with vitest'), true);
  });

  it('describes idioms rather than repeating the standing contract', () => {
    // "No new personas, no framework." A fragment that restated the builder's contract would
    // be a second voice arguing with the first, and would grow every time either changed.
    for (const toolchain of TOOLCHAINS) {
      const guidance = toolchainGuidance(toolchain.name);
      assert.equal(guidance.includes('Do not satisfice'), false, `${toolchain.name} restates the contract`);
      assert.equal(guidance.includes('RED before GREEN'), false, `${toolchain.name} restates the contract`);
    }
  });
});

describe('the template directory, scanned rather than listed', () => {
  // The list above names the persona system prompts and is hand-maintained. The directory holds
  // more than that - toolchain fragments, frontend direction, the oracle author, the security
  // escalation - and an enumeration that has to be remembered is the defect this repository has
  // now paid for three times: .dare protection by basename, ensureDareIgnored's short list, and
  // CI_REQUIRED_COMMANDS. So the check that must never be skipped is applied positionally.
  const dir = new URL('../templates/', import.meta.url);
  const files = readdirSync(dir).filter((name) => name.endsWith('.md')).sort();

  it('finds every shipped template, so a new one cannot arrive unchecked', () => {
    assert.equal(files.length >= 8, true, `only ${files.length} templates found: ${files.join(', ')}`);
  });

  for (const name of files) {
    const contents = readFileSync(new URL(name, dir), 'utf8');

    it(`${name} carries no Junkion styling`, () => {
      // DESIGN.md §9: the comedy is in the output layer only. A prompt written in the voice
      // would change what the model does, which is exactly what the style layer may not do.
      for (const tell of ['VOLUNTARY RECALL', 'GRAND PRIZE', 'LIMITED-TIME', 'STAY TUNED', 'UNACCEPTABLE']) {
        assert.equal(contents.toUpperCase().includes(tell), false, `${name} contains style-layer text: ${tell}`);
      }
    });

    it(`${name} is not empty`, () => {
      assert.equal(contents.trim().length > 200, true, `${name} is suspiciously short`);
    });
  }
});

describe('renderTemplate', () => {
  it('throws rather than sending a placeholder to a child', () => {
    // A prompt reaching a child with a literal {{snippet}} asks about nothing, and the child
    // answers about nothing - most likely `unknown`, which records a loss of protection and
    // blocks a ship. Better a startup error than a quarantine nobody can explain.
    assert.throws(
      () => renderTemplate('security-escalation.md', { evidence: 'src/a.ts:1' }),
      /\{\{snippet\}\}/,
    );
  });

  it('substitutes every placeholder it was given', () => {
    const rendered = renderTemplate('security-escalation.md', { evidence: 'src/a.ts:1', snippet: 'const guard = true;' });
    assert.equal(rendered.includes('src/a.ts:1'), true);
    assert.equal(rendered.includes('const guard = true;'), true);
    assert.equal(/\{\{[a-zA-Z]+\}\}/.test(rendered), false);
  });
});

describe('the reviewer states properties rather than examples', () => {
  // R15, from a Stanford multi-agent study whose stated mechanism is that each handoff risks
  // losing relevant information. This loop has one handoff it cannot remove - panel finding to
  // build brief to builder - and run 13 measured the loss twice on the same defect: the panel
  // reported "1e308, 1e308 produces Infinity", the builder repaired exactly that input, and
  // returned 0.5 where the answer was 1/3 with every gate green.
  it('tells the reviewer to give the property and use the input as evidence', () => {
    assert.equal(REVIEWER.includes('State the property, not the example'), true);
    // Whitespace-normalised: the phrase wraps across lines in the template, and asserting the
    // raw substring would fail on a reflow that changed nothing about the instruction.
    const flat = REVIEWER.replace(/\s+/g, ' ');
    assert.equal(flat.includes('a failing example is satisfied by handling that example'), true);
  });

  it('asks for more than one member of the class where possible', () => {
    // One example invites one repair. The narrow fix is the failure mode being defended against.
    assert.equal(REVIEWER.includes('at least one of which the'), true);
  });
});

// Improve mode's author (DESIGN.md §2.1). The other three input shapes are product-shaped and
// none of them can express "this repository exists, find what is wrong with it".
describe('the improve-author template', () => {
  const IMPROVE = readFileSync(new URL('../templates/improve-author.md', import.meta.url), 'utf8');

  it('produces the same id shape the auditor and requiredIdsFor expect', () => {
    // The whole pipeline keys off PRD-<section>.<n>. An improvement document that numbered its
    // requirements any other way would be judged against the DoD lines alone.
    assert.equal(/PRD-<section>\.<n>/.test(IMPROVE), true);
    assert.equal(requiredIdsFor(IMPROVE).includes('PRD-1.1'), true, 'the worked example does not parse as an id');
  });

  it('demands file:line evidence, because an invented requirement is an unsatisfiable gate', () => {
    assert.equal(IMPROVE.includes('file:line'), true);
    assert.equal(/grounded/i.test(IMPROVE), true);
  });

  it('caps the number of requirements rather than leaving it to judgement', () => {
    // A document listing forty improvements produces a loop that half-does all of them against
    // a fixed iteration budget and finishes none.
    assert.equal(/three and eight/i.test(IMPROVE), true);
  });

  // The most expensive requirement an improvement author could write, and the one that looks
  // most harmless. The ratchet protects every test id that has ever passed, so a renamed test
  // reads as a lost one and the repair is hard-reset every iteration, forever.
  it('forbids renaming or deleting an existing passing test, and says why', () => {
    assert.equal(/renames?, moves?,? or deletes? an existing passing test/i.test(IMPROVE), true);
    assert.equal(/ratchet/i.test(IMPROVE), true);
  });

  it('forbids rewrites and restructuring, which the scope rule cannot police', () => {
    assert.equal(/rewrite/i.test(IMPROVE), true);
    assert.equal(/scope rule/i.test(IMPROVE), true);
  });

  it('tells the author to say so rather than pad the list when the repository is sound', () => {
    assert.equal(/padding/i.test(IMPROVE), true);
  });

  it('puts wrong answers at exit 0 first in the search order', () => {
    // The defect class two dogfood runs shipped, and the one no deterministic gate can see.
    const wrongAnswers = IMPROVE.indexOf('Wrong answers at exit 0');
    const untested = IMPROVE.indexOf('Behaviour the tests assert nothing about');
    assert.equal(wrongAnswers > 0, true, 'the search order does not mention wrong answers at exit 0');
    assert.equal(wrongAnswers < untested, true, 'wrong answers are not ranked above untested behaviour');
  });
});

// R17 / item 14. A schema nobody writes cases against is dead code, so the template half is as
// load-bearing as the harness half. Item 7 measured the gap this closes: nineteen exit-code-only
// cases passed a binary printing {"mean": null} for two finite inputs at exit 0.
describe('the oracle author is taught metamorphic relations', () => {
  const ORACLE = readTemplate('oracle-author.md');

  it('names every relation kind the parser accepts, and no others', () => {
    for (const kind of RELATION_KINDS) {
      assert.equal(ORACLE.includes(`\`${kind}\``), true, `the template never mentions ${kind}`);
    }
  });

  it('teaches the five shapes by name', () => {
    for (const shape of ['Permute', 'Duplicate', 'Scale', 'Subset', 'Identity-merge']) {
      assert.equal(ORACLE.includes(shape), true, `the template never teaches ${shape}`);
    }
  });

  it('gives a worked relation example the parser would accept', () => {
    const blocks = jsonBlocks(ORACLE).filter((b) => b.includes('"relation"'));
    assert.equal(blocks.length > 0, true, 'no relation example at all');
    const parsed = JSON.parse(blocks[0]);
    const relation = parseRelation(parsed.id, parsed.relation);
    assert.equal(relation?.kind, 'same-stdout');
    assert.equal(relation?.argv.length > 0, true);
    // The example must be a genuine permutation - same values, different order - or it teaches
    // the wrong thing while looking right.
    const rows = (/** @type {string} */ t) => t.trim().split('\n').slice(1).sort();
    assert.deepStrictEqual(rows(parsed.files[0].content), rows(parsed.relation.files[0].content));
    assert.notEqual(parsed.files[0].content, parsed.relation.files[0].content);
  });

  it('warns that same-stdout alone is satisfied by a program that ignores its input', () => {
    // The deny path, stated to the author rather than left to be discovered.
    assert.equal(ORACLE.includes('prints a constant and never opens the file'), true);
  });

  it('says why a relation beats a differential test', () => {
    // Whitespace-normalised: the phrase wraps across lines and asserting the raw substring
    // would fail on a reflow that changed nothing about the instruction.
    const flat = ORACLE.replace(/\s+/g, ' ');
    assert.equal(flat.includes('cannot encode the same assumption twice'), true);
  });
});

// Found by item 8's experiment: panelA's design auditor failed a correct CLI on
// DoD-4-docs-observability for having no health endpoint, while the observability *gate* says a
// CLI has none by design (DESIGN.md 857: "a CLI's exit code is its health check"). A required id
// no correct CLI can satisfy is an unsatisfiable gate - the most expensive defect class here -
// and an intermittent one, because it fires only when an auditor reads the line literally.
describe('the DoD ids that some correct projects cannot satisfy are conditioned', () => {
  const flat = () => REVIEWER.replace(/\s+/g, ' ');

  it('does not demand e2e in CI from a project with no browser', () => {
    // The `ci` gate reports "not required here: e2e" for a CLI. A reviewer line demanding it
    // anyway fails a correct repository for doing the right thing.
    assert.equal(flat().includes('e2e only where a browser is involved'), true);
    assert.equal(flat().includes('not required here: e2e'), true);
    assert.deepStrictEqual(GATE_POLICY.e2e.appliesTo, ['web-ui', 'desktop-ui']);
  });

  it('does not demand auth from something that authorizes nothing', () => {
    assert.equal(flat().includes('where the project has an authorization boundary'), true);
  });

  // The half that keeps this a conditioning rather than a weakening. A CLI reading a token has a
  // boundary and must still be checked.
  it('still requires the negative case wherever a boundary exists, with evidence', () => {
    const f = flat();
    assert.equal(f.includes('all have a boundary, and its negative case must be enforced'), true);
    assert.equal(f.includes('Say which you found, and how you looked'), true);
    assert.equal(f.includes('a missing check and an inapplicable one are opposite conclusions'), true);
  });

  it('keeps the dependency-audit half unconditional, because every project has dependencies', () => {
    assert.equal(flat().includes('dependency-audit half of `DoD-2` is unconditional'), true);
  });
});

describe("DoD-4's observability half is conditioned on project shape", () => {
  it('no longer demands a health endpoint unconditionally', () => {
    const flat = REVIEWER.replace(/\s+/g, ' ');
    assert.equal(
      flat.includes('for a project that listens on a port'),
      true,
      'the DoD-4 row states the observability half unconditionally again',
    );
  });

  it('tells the reviewer a non-listening project is judged on documentation alone', () => {
    const flat = REVIEWER.replace(/\s+/g, ' ');
    assert.equal(flat.includes('The documentation half alone decides this id'), true);
    assert.equal(flat.includes('a CLI, a library, a batch job'), true);
  });

  it("mirrors the gate policy's own reasoning rather than inventing a second rule", () => {
    // If these two ever disagree, a run fails a line its own gate said did not apply.
    const flat = REVIEWER.replace(/\s+/g, ' ');
    assert.equal(flat.includes("a CLI's exit code is its health check"), true);
    assert.deepStrictEqual(GATE_POLICY.observability.appliesTo, ['api', 'network-service']);
  });

  it('routes a genuine logging concern to an advisory instead of a fail', () => {
    // Nothing is silenced; it is moved to the channel that cannot block a compliant build.
    assert.equal(REVIEWER.includes('advisory-'), true);
  });
});
