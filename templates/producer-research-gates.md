## Two gates run, four decline, and the declines are honest

This project is a manuscript, not a program. Four of the usual gates have nothing to check here and
say so by name rather than passing quietly:

- **build** — a manuscript is not compiled. A build step that trivially succeeded would be
  indistinguishable from one that checked something.
- **lint** — no prose linter is verified for this toolchain. Style and word-count floors belong in
  your checks suite, where the ratchet holds them, rather than in a gate whose result nothing
  remembers.
- **types** — prose has no type system.
- **e2e** — there is no application to drive.

Two run, and they are real:

- **unit** — your checks suite, collected by the command in the section above. This is the gate
  that scores the iteration.
- **security-audit** — `npm audit --audit-level=high`. Your checks are real JavaScript with real
  dependencies, and a vulnerable transitive package is exactly as real here as in an application.

A declined gate is not a passed gate and gives you no credit. The only way to score is the checks
suite.

## The citation and claim gates are not yours to weaken

Two further checks run **inside the driver**, over `citations.json` and `claims.json`. They are not
scripts in your project. You cannot edit them, relax them, or replace them, and that is deliberate:
a producer asked to make a citation check pass writes a lenient checker, while a producer asked to
satisfy one it cannot reach writes accurate citations.

They fail closed in every direction that matters:

- a missing `citations.json` **fails**. An empty one passes, because *this report cites nothing* is
  a claim you can make, and a missing file is not a claim at all.
- a quotation that is not in the captured source fails.
- a quotation that is not in the file you said used it fails.
- a captured source whose bytes no longer match its recorded digest fails.
- two values for one claim id under one unit fails.

The locator you record — a section number, a page — is **recorded and not verified**, and the
passing message says so. Nothing here can confirm that a quotation sits at §3.2, so nothing here
pretends to.

## The manifests are the interface

- `citations.json` — every quoted source: its id, the captured package under `sources/`, the
  quotation, the file that uses it, and the locator.
- `claims.json` — every material claim: its id, its value, its unit, and the file that states it.
- `sources/` — the captured packages themselves, retained exactly as acquired.

Write them as you write the report, not afterwards from memory. A manifest reconstructed at the end
is a second draft of your recollection, and the checks will find the places where it disagrees with
the prose.
