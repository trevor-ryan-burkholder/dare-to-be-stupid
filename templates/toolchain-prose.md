## Building this as an artifact, with checks as tests

This job produces an **artifact** — a book, a report, a document — not a program. The machine
around you is unchanged: the same ratchet, the same gates, the same cold review panel. What
changes is what a test is.

**Your checks are the test suite, and they run over the artifact.** Write ordinary vitest files
that read the manuscript from disk and assert things about it. Each one becomes a ratcheted id,
which means a check that has ever passed may never be allowed to fail again — a chapter cannot
silently regress while you are working on the next one.

```js
it('chapter 3 exists and is at least 2000 words', () => {
  const text = readFileSync('manuscript/03-methods.md', 'utf8');
  expect(wordCount(text)).toBeGreaterThanOrEqual(2000);
});
```

**Four gates decline here, and the brief says so out loud.** There is no build, no typecheck,
no browser flow, and no mutation testing, because a manuscript is not compiled and has no
runtime. `npm audit` still runs: your checks are real JavaScript with real dependencies.

**Write checks that could fail.** This is the whole discipline, and prose makes it easier to get
wrong than code does. `expect(text.length).toBeGreaterThan(0)` passes on a file containing the
word "no". A check is only worth an id if you can say what artifact would fail it.

| weak | worth an id |
|---|---|
| the chapter is non-empty | the chapter is ≥2000 words and names every term the glossary defines |
| there are citations | every citation's quoted text appears verbatim at the locator it names |
| the summary mentions the findings | every claim id in the manifest has exactly one normalized value |

**Structure and traceability are yours. Truth is not.** A citation check proves the quoted text
is really at that location. It does **not** prove the source supports the claim, and it does not
prove the claim is true — those are the cold panel's judgment, on evidence, and no check you
write may report otherwise. Do not name a check `citation-proves-claim`. Do not summarize a
green suite as "verified". The honest sentence is *structurally sound and traceable*.

**Citations are gated, and the gate is not yours to edit.** `citations.json` at the repository
root declares every quotation you use; `sources/<id>.json` holds the captured source it came
from. The Driver checks all three of these itself, on every iteration:

```json
{ "version": 1, "citations": [
  { "id": "C1", "source": "acme-2024", "locator": "§3.2",
    "quote": "the exact words, copied", "usedIn": "manuscript/03-findings.md" }
] }
```

1. the source package's text matches the `sha256:…` digest it carries;
2. the quotation appears in that captured text — **verbatim**, differing only in line breaks;
3. the quotation also appears in the `usedIn` file, so the manifest cannot drift from the prose.

**If this artifact cites nothing, say so:** `{"version": 1, "citations": []}` passes. A *missing*
manifest fails, because "cites nothing" is a claim and an absent file is not one.

**A required source you cannot fetch fails closed.** Not a skip, not a pass with a note. If a
check depends on evidence that could not be obtained, it fails, and the reason is the failure
message. The same is true of a source package that is not in the tree: the gate will not go and
get it for you, and it will not wave the citation through.

**Layout.** `manuscript/` for the artifact, `checks/` for the vitest files, one `package.json`
at the root carrying vitest. Keep a check in the file whose subject it is about, so a reader
finding a failing id knows immediately what part of the artifact it concerns.
