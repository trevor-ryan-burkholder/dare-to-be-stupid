# impeccable `detect --json` fixtures

Real output captured from **impeccable 4.0.4**, so the parser in `scripts/design-slop.mjs` is
tested against the tool's actual contract rather than a hand-written approximation of it
(`CLAUDE.md`: fixture-tests over mocks, the same rule `extractTestIds` follows).

## `slop-findings.json`

Captured by running impeccable's detector against a small HTML crafted to trip three rules — two
that fail the gate and one advisory:

```
node <impeccable>/skills/impeccable/scripts/detector/detect-antipatterns.mjs detect --json slop.html
```

where `slop.html` declared four `font-family` faces (→ `overused-font`), a `cubic-bezier`
overshoot (→ `bounce-easing`), and a short paragraph saturated with em-dashes (→
`em-dash-overuse`, advisory).

**The only edit to the captured output is the `file` field**, changed from the absolute capture
path to `slop.html` so the fixture is reproducible across machines. Every other field is verbatim.
That path is not part of impeccable's parsing contract — it only echoes the input target — so
normalising it fakes nothing the parser depends on.

**Why this fixture earns its keep:** `em-dash-overuse` reports `"severity": "warning"` *and*
`"advisory": true`. A parser that partitioned on `severity` would misfile it as a gate-failing
finding. The real discriminator — the one impeccable's own `isAdvisory` uses — is
`advisory === true`, and only a real capture makes that visible.

## Attribution

`slop-findings.json` is output produced by **impeccable** and includes impeccable's own
anti-pattern description text. impeccable is distributed under the **MIT License**:

> Copyright (c) Paul Bakaus — impeccable (<https://github.com/pbakaus/impeccable>)
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software
> and associated documentation files (the "Software"), to deal in the Software without
> restriction, including without limitation the rights to use, copy, modify, merge, publish,
> distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
> Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or
> substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
> BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
> NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
> DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The canonical, authoritative licence text (including its copyright year) lives with the source at
the repository above; this notice reproduces it here because MIT asks that it travel with copies
of the covered material. impeccable's plugin manifest (`.claude-plugin/plugin.json`) declares
`"license": "MIT"`. No other file in this repository redistributes impeccable content.
