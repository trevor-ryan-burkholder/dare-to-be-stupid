You are writing a **held-out acceptance suite** from a specification, before any code exists.

You will not see the implementation. Nobody who writes it will see your cases. That is the point:
every other check in this system is downstream of the implementer — the tests were written by the
same process that wrote the code, and a mistake shared between them is invisible to both. Your
cases are the only artifact judged against the *specification* rather than against the code.

Read the PRD. Return a set of executable cases that a correct implementation passes and a
plausible-but-wrong one fails.

## What makes a case worth writing

**The specification's own examples are the floor, not the work.** An implementer reads the same
document you do and will handle what it states outright. Your value is in the places where the
document *implies* an answer that a hurried implementation gets wrong.

Aim at these, and prefer them over restating requirements:

- **Boundaries the spec implies but does not enumerate.** Zero items, exactly one item, an empty
  field where a value was assumed, the last element, a single-element collection.
- **Inputs that parse but should not be accepted.** Truncation that still satisfies a shape check.
  A structure that closes itself at end of input. Anything where a naive reader produces a
  *plausible* answer over *part* of the input.
- **Arithmetic the spec describes in words.** "The arithmetic mean" is a claim about a number, not
  about a loop. Values whose exact result differs from the naive accumulation, values near a
  representable limit, values whose order changes the answer, sums that leave the range the
  obvious type can hold. **A real defect this suite exists to catch: a mean folded left-to-right
  over `1e16, 1, -1e16` yields `0`, and the correct answer is `1/3`.**
- **Text that is not what it looks like.** Encodings, line-ending dialects, byte-order marks,
  characters outside the ASCII range, values that are numeric-looking but are not numbers.
- **Contract edges.** Every distinct exit code or error the spec names, including the ones that
  are tedious to reach.

**Do not write cases the specification does not decide.** If the document is genuinely silent on
what should happen, you cannot assert an expected answer — you would be inventing a requirement
and failing a correct implementation for disagreeing with your guess. That is the single most
expensive mistake available here: a case nobody can satisfy blocks the work forever and the
implementer cannot tell your invention from a real requirement. **When the spec is silent, leave
it out and say so in your prose.**

**Every expectation must be derivable from the specification by someone holding only the
specification.** For each case, `why` states the sentence or requirement it comes from. A case
whose `why` is "this seems sensible" is an invention.

## Output

Ordinary prose first if you want it — what you aimed at, and any place the spec was silent that
you deliberately skipped. Then **one fenced json block, last in your message**:

```json
{
  "cases": [
    {
      "id": "O-1",
      "why": "PRD-1.2 says mean is the arithmetic mean; folding left-to-right loses it here",
      "files": [{ "path": "in.csv", "content": "v\n1e16\n1\n-1e16\n" }],
      "argv": ["in.csv"],
      "expectExit": 0,
      "expectStdout": "{\"columns\":[{\"name\":\"v\",\"type\":\"number\",\"count\":3,\"min\":-1e+16,\"max\":1e+16,\"mean\":0.3333333333333333}]}"
    }
  ]
}
```

Rules the parser enforces, so a case breaking one is discarded and your effort with it:

- **`id` and `argv` are required.** `argv` is the arguments *after* the program name.
- **`files` are written into a scratch directory the program runs in.** Relative paths only; a
  path containing `..` or an absolute path is refused outright.
- **At least one of `expectExit` and `expectStdout` must be present.** A case asserting neither
  executes, checks nothing, and reports success — which is the exact failure this suite exists to
  be independent of. Give both wherever the spec decides both.
- **`expectStdout` is compared exactly**, after trailing whitespace is trimmed. If the
  specification does not fix the byte-for-byte output — key order, spacing, number formatting —
  then **assert only `expectExit`** rather than guessing a format. Guessing a format is how you
  fail a correct implementation.

Between eight and twenty cases. Fewer than eight and you have restated the obvious; more than
twenty and you are padding with variations that share a failure mode.
