## The gates collect tests with one specific command, whichever runner you prefer

This is the one place the "use whatever tools you like" rule does not apply, because the
ratchet reads the runner's report rather than its exit code:

{{unitLine}}
{{e2eLine}}

Whatever is needed is installed for you. **A test written for a runner that command cannot
collect is invisible to the ratchet** — it produces a report with **zero tests**, which is not
evidence that anything passed. Nothing enters the ratchet, the iteration scores nothing, and you
will be handed the same objective again no matter how green your own test script looked to you.

Define the `test` script in your manifest however you like. Just make sure the suite it runs is
the suite **that command** collects, so a green run and a green gate mean the same thing.

## Tests assert values

A test that checks something returned *something* is worse than no test. It inflates the
gate score, the auditor opens it, marks the requirement failed, and the iteration is spent.

```
expect(user.role).toBe('admin')        // yes
expect(user.role).toBeTruthy()         // no
expect(ids).toEqual(new Set([1, 2]))   // yes
expect(ids).toBeDefined()              // no
```

## Properties, where the domain has one

An example test can be satisficed by special-casing three inputs. A property cannot — it
states something that must hold across inputs you did not choose, and the only way to pass it
is to be right. Where the code has an invariant, write it as a property with generated inputs
instead of as three examples: a round trip that returns the original, an ordering that holds
whatever the input order was, a bound nothing may exceed, an operation that is the same
applied twice as once.

Where there is no invariant to state, do not invent one. A property nobody can state is an
example test wearing a costume, and it costs more to read.

## RED before GREEN

A new test must be shown failing against the unwritten or broken behaviour *before* the
code that makes it pass. A test that has only ever been green is unproven: it may assert
nothing, or assert something that was already true. Write the test, watch it fail, then
make it pass.

The `red-evidence` gate checks this. A test with no red history does not count toward the
ratchet, so writing the code first costs you the credit for the test.

## Guards go on the handler

Access control lives on the route handler and in the API layer. Hiding a nav link is not
access control. Checking a role in a component is not access control. The auditor will send
a request without the role and look for where it is rejected.

## UI is tested against a running app

Playwright against the real thing, not mocked component tests. A component test proves a
component renders; it does not prove the page works.

Every page-level Playwright spec asserts accessibility with `@axe-core/playwright`, as its
own named test, one per page:

```js
import AxeBuilder from '@axe-core/playwright';

test('checkout page has no serious accessibility violations', async ({ page }) => {
  await page.goto('/checkout');
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});
```

Assert on the mapped violation list rather than a count, so a failure names what broke
instead of saying `3 !== 0`.

A separate accessibility gate would only tell the run what is red *today*. A named
Playwright test enters the ratchet, and the ratchet is monotonic — once that page is clean,
it may never quietly stop being clean for the rest of the run. That is worth more than a
gate, and it costs one test.

Also add `eslint-plugin-jsx-a11y` (or the framework equivalent) to the lint config. It
catches the static half for free, inside a gate that already runs.
