## Building this with Node

The gates run `npm run build`, `npm run lint`, `npm run typecheck`, `npx vitest run` and
`npx playwright test`. What follows is the part that is not obvious from those command names.

**You write the scripts the gates invoke, and that is a loaded gun.** `npm run lint` means
whatever `package.json` says `lint` means. Define them to run real tools; a script whose body
runs nothing fails the `gate-integrity` check and costs the iteration anyway.

**The unit gate collects with vitest specifically**, not with `npm test`. Define `test` however
you like, but make sure the suite it runs is the suite vitest collects — otherwise `npm test`
looks green to you and the gate reports zero tests, which scores nothing.

**Module system.** Pick one and declare it. `"type": "module"` makes `.js` files ESM; without
it they are CommonJS and `import` statements fail at runtime rather than at build. Mixing the
two inside one package is the source of most `Cannot use import statement outside a module`
and `require is not defined` failures here.

**Layout.** Source under `src/`, unit tests as `*.test.js` beside the code or under `test/`,
Playwright specs under `tests/` or `e2e/` with a `playwright.config.*` at the root. Keep
`node_modules` out of git.

**Typecheck without adopting TypeScript if you prefer.** JSDoc plus `checkJs` in a
`jsconfig.json` satisfies the types gate on plain `.js`, and is often the smaller change on an
existing JavaScript codebase than a conversion.

**`strict` is not optional.** `compilerOptions.strict: false` in any `tsconfig*.json` fails
`gate-integrity`, as does `@ts-nocheck` anywhere in a source file. A line-level
`@ts-expect-error` stays allowed — it is a narrow claim that fails loudly when it stops being
true, which is the opposite of a whole-file suppression.

**Prefer `it.each` over three near-identical tests.** It is the property-shaped option this
stack gives you for free, and it is harder to satisfice: the cases are data rather than three
hand-picked inputs.
