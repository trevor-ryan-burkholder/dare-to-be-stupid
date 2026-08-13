A defensive element in this repository was verified by an earlier security audit and can no
longer be found where it was. Decide which of three things happened. Nothing else is being
asked of you, and you must not repair anything.

Recorded location: {{evidence}}
Recorded code, with whitespace collapsed:

    {{snippet}}

Search the repository for this protection — not for this text. It may have been renamed,
extracted into a helper, moved behind a decorator or replaced by an equivalent guard, and any
of those still count as present.

Answer with one fenced json block and nothing else:

```json
{ "finding": "removed" | "moved" | "unknown", "evidence": "path/file.ts:LINE", "snippet": "the line",
  "detail": "one sentence of why" }
```

- "removed" means the protection is gone and nothing equivalent replaced it. Say this only if
  you looked and are confident; it will reset the working tree.
- "moved" means you found it, and then `evidence` and `snippet` are required.
- "unknown" means you could not tell. This is a legitimate answer and is not a failure. It is
  recorded as a loss of protection and blocks the run from shipping, which is the correct
  outcome for something nobody can establish.
