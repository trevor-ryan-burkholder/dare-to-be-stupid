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
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { parseReviewerReport } from '../scripts/driver.mjs';
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
    ['toBeTruthy', 'a concrete example of an assertion that proves nothing'],
    ['route handler', 'where guards belong'],
    ['.dare/state.json', 'the files it may not touch'],
  ];
  for (const [needle, what] of required) {
    it(`still states ${what}`, () => {
      assert.equal(BUILDER.includes(needle), true, `builder template lost: ${needle}`);
    });
  }

  it('ties gold-plating to the ratchet rather than to taste', () => {
    // The reason this rule is load-bearing here and merely good advice elsewhere: a
    // monotonic ratchet means a test over a speculative abstraction must pass forever.
    assert.equal(BUILDER.includes('monotonic'), true);
  });

  it('warns that deleting pre-existing dead code can trip the ratchet', () => {
    assert.equal(BUILDER.includes('already in the ratchet'), true);
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
