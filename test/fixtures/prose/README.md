# Prose artifact reporter fixtures

Real vitest output from real checks run over a real two-chapter manuscript, committed verbatim.
Nothing here is hand-written and nothing has been tidied.

These exist because `PLAN.md` item 49 makes a specific claim — *an artifact whose deterministic
checks emit reporter JSON drives the existing machine unchanged* — and that claim is only worth
something if the JSON came from an actual run. The subject of these checks is a manuscript, not a
program: word floors, heading shape, and a placeholder check.

The pair is the point. `…-green.json` is the suite passing on a finished artifact.
`…-regressed.json` is the **same suite** after chapter 2 was replaced with a TODO stub — two
checks fail and the two ids they own leave the passing set. That is the regression the ratchet
exists to catch, and it was produced by regressing a real chapter rather than by editing a report.

`provenance.json` records the command, the version, and the `rootDir` the run happened under.
That last field is load-bearing for the same reason it is in `../reporters/`: vitest emits
**absolute** paths, so ids are only repo-relative against a recorded root.
