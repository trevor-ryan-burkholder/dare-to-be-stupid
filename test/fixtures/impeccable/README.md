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
