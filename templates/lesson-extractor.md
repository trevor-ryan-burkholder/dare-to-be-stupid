# Lesson extractor

Something in this run failed, resisted a repair, and was then fixed by a different one. You
are being shown the evidence for that sequence and asked one question:

**Is there a reusable technical fact here, or was this just this repository's Tuesday?**

Most of the time there is not, and saying so is the correct answer. A store full of true but
useless sentences is worse than an empty one, because every later build iteration has to
read it.

---

## What you are given

- the failure, as it was actually observed (test ids, gate names, error output)
- which files each repair attempt touched
- the evidence that it is now passing

You are not given the reasoning of whoever made the changes, and you should not ask what
they were thinking. You are looking at what happened, not at an account of it.

## What counts as a lesson

A lesson is a fact about **the technology**, transferable to a different task in this same
repository. It survives being read six iterations later by someone working on something
else.

Good:

- `Generate the authenticated storageState only after the app server reports healthy; a
  storageState captured against a booting server contains no session cookie.`
- `vitest's --outputFile is resolved against the config root, not the working directory, so
  a report written from a subdirectory lands somewhere nothing reads it.`

Not lessons — return `null` for all of these:

- `Be careful when changing authentication.` (advice, not a fact)
- `Read the error message.` (true of everything)
- `The auth test was failing because of a bug in the auth code.` (restates the evidence)
- `We fixed it by updating the config.` (no reusable content; which config, and to what?)
- Anything you would have known without seeing this evidence.

## The triggers decide whether anyone ever reads it

`trigger` is how this lesson gets retrieved later: lowercase keywords matched against a
future failure's test ids, file paths and error text. Choose words that will *literally
appear* when this problem recurs — a library name, a filename, an API, an error phrase.

- Good triggers: `["playwright", "storagestate", "auth"]`
- Useless triggers: `["testing", "bug", "config"]` — these match everything, so the lesson
  is injected everywhere and read nowhere.

`scope` is one or two words for the area: `authentication`, `e2e`, `build`, `database`.

---

## Output

Return **one JSON object and nothing else**, or the single word `null`.

```json
{
  "lesson": "Generate the authenticated storageState only after the application server reports healthy.",
  "trigger": ["playwright", "storagestate", "auth"],
  "scope": ["authentication", "e2e"],
  "evidence": {
    "introduced": 6,
    "resolved": 8,
    "tests": ["tests/auth.spec.ts::authenticated user opens dashboard::chromium"]
  }
}
```

- `lesson` is one or two sentences, under 400 characters, specific enough to act on.
- `trigger` is required and must not be empty. A lesson nobody can retrieve is not stored.
- `introduced` and `resolved` are the iteration numbers you were given, unchanged.
- `tests` lists the affected test ids exactly as they appear in the evidence.

If nothing here generalises, return `null`. Nothing bad happens when you do — no gate
depends on this, no build fails for it, and the run continues either way. Returning a filler
lesson to seem useful is the only outcome here that has a cost.
