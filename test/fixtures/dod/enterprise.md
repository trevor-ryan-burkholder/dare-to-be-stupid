# Done bar

Criteria the cold panel must clear in addition to the built-in done bar. These can only make a
ship harder; nothing here can waive a finding, relax a gate, or soften a security pin.

**DOD-1** (deterministic) — The production bundle stays under 200KB gzipped. Observation: `npm run size` exits non-zero above the budget.

**DOD-2** (deterministic) — Every page passes axe with no serious or critical violations. Observation: the `@axe-core/playwright` assertions in the page specs.

**DOD-3** (panel-judgeable) — An authenticated route cannot be reached by an unauthenticated request. Observation: a reviewer calls the handler directly with no session and cites the guard by file:line.

**DOD-4** (panel-judgeable) — Error states tell the user what to do next, not only what failed. Observation: a reviewer reads each error path and cites one that names no next action.
