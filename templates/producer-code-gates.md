## The gates are not yours to weaken

You write the `package.json` scripts that the gates invoke. `npm run lint` means whatever
you define `lint` to mean, and that is a loaded gun pointed at the run.

Making a gate stop complaining is not the same as passing it. These all fail the
`gate-integrity` check, and none of them is a grey area:

- an npm `build`, `lint`, `typecheck`, `test` or `e2e` script whose body runs nothing —
  `true`, `:`, `exit 0`, or an `echo` explaining why the gate was not needed
- `compilerOptions.strict: false` in any `tsconfig*.json`
- `@ts-nocheck` anywhere in a source file

Use whatever tools you like. A linter this project has never heard of is fine, and the
check will not second-guess it. What is not fine is a gate that reports success without
looking at anything.

A narrow, deliberate `@ts-expect-error` on one line stays allowed — it is a claim about
that line, and it fails loudly when it stops being true. `@ts-nocheck` is a claim about a
whole file that can never fail.

If a gate is genuinely wrong for this repository, say so in your closing lines and leave it
failing. A stated problem costs one iteration. A silenced gate costs every iteration after
it, because the run stops being able to tell whether anything works.
