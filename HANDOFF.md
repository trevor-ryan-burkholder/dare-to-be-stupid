# START HERE — handoff, 12 August 2026

**State:** `main` at `0.64.0`. `npm test` 1433 pass, `npm run test:integration` 12 pass,
`npm run test:live` 11 of 11 armed and green. `npm run release-check` clean.

## Verified from run 10's artifacts: the advisory pipeline works end to end

Never recorded before, and checked against produced artifacts rather than assumed. §4.1's whole
path is live: the reviewer emits `advisory-` entries with `severity`, `confidence` and
`file:line`; the parser accepts them; the confidence filter admits them; and
`.dare/briefs/iter-002.md` and `iter-005.md` render an **`### Advisory findings`** section headed

> *"Suggestions, not requirements. They do not decide whether this run ships. Address them only
> where doing so does not widen the diff the objective above calls for."*

Nine advisories at iteration 1 and eight at iteration 4, **every one at or above 0.7 with real
evidence**, so nothing was silently dropped by the threshold either.

Two of them are worth reading as evidence about the panel rather than about csvstat:

- *"`tests/fixtures/overflow.csv` contains exactly `a\n1e308\n1e308\n` — the input that
  reproduces the `mean: null` defect — but it is untracked in git and no file references it.
  **Someone constructed the reproducing input, left the fixture behind, and shipped neither a
  test nor a fix.**"* The reviewer caught the builder's own abandoned evidence that it knew.
- *"The security-audit gate is never run in CI… so the clean-audit property `DoD-2-security`
  depends on is enforced only by whoever remembers to run gate 6 locally."* A real gap between
  what `CLAUDE.md` claims the gates are and what the workflow executes.

**The ceiling §4.1 describes also held:** advisories never moved a verdict, and because they can
only be addressed on an iteration that was failing anyway, they cost nothing extra.

## Open: the panel is three whole-repository reads run one after another

**Deferred on 12 August 2026 — investigate later.** Recorded now because the measurement exists
and re-deriving it costs an hour.

Where run 10's wall-clock actually went, from its own log:

| phase | children | total | avg |
|---|---|---|---|
| builder | 6 | **47 min** | 470s |
| review | 6 | **26 min** | 263s |
| design | 1 | 6 min | 365s |
| lesson / escalation | 3 | 2 min | — |
| **inside children** | | **1.4 h** | |

Gates sit on top of that, mutation testing especially. Everything is sequential because children
run under `execFileSync`, which blocks the event loop for the whole call — which is also why
there is no heartbeat, and why "hung" and "working" look identical for nine minutes at a time.

**The three reviewers are read-only, own disjoint ids, and never communicate.** They are
independent by design (§1.1) and are serialised for no reason but plumbing. Running them
concurrently turns a review round from ~13 minutes into roughly the slowest single reviewer,
~4½ — and the saving grows with every iteration.

**This file previously called the fix "a rewrite, not a fix" — making the driver async. That is
probably wrong**, because this codebase already solved this exact problem once. `health-probe.mjs`
is a separate program precisely because *"the driver's gates are synchronous exit codes, and
starting a server, polling it and reaping it is not."* The same move applies: a
`scripts/panel.mjs` that takes the panel spec, runs the reviewers concurrently and writes their
envelopes out, invoked by the driver with one `execFileSync`. The driver stays synchronous, and
nothing cascades through `driveRun` or its tests.

**Four guarantees currently live inside `spawnClaude` and would have to move with it**, or the
saving is bought by silently deleting them:

- the **context budget** check before each child (§3.9) — a new door that forgets it is a door
  has no lock;
- **cost and token accounting** from every envelope, or the ceilings stop counting;
- **one reviewer failing must not lose the other two**, and an unparseable report must still
  fail rather than default to pass;
- `combinePanel`'s **coverage re-check**, so a truncated result cannot leave an id unjudged.

**One honest risk:** three concurrent children on a subscription may hit the rate-limit window
harder, or be throttled into looking like failures. Measurable rather than theoretical, and if it
throttles the answer is a concurrency of 2, not a revert.

**Do not buy this time by lowering reviewer effort.** `max` (0.67.0) is what produced run 10's
4000-case differential fuzz and its real `npm install -g` reproduction of an inert `bin`. That is
the only thing in this architecture that has ever caught a defect no gate can see.

## Open: 0.56.0 hands the builder an objective it cannot act on

Run 9 shipped, so 0.56.0 is **satisfiable** — but it cost one entirely wasted iteration
(7.5M tokens, ~$6), and the reason is a contradiction in the brief rather than bad luck.

When the panel passes with no failure evidence, the objective is *"Prove the test suite can
fail"*, and the brief states the escape: *"Changing any first-party source makes the mutation
gate apply again."* The same brief also carries chaos 1: *"Touch only the files this objective
requires. Every changed line must trace directly to it."*

**On an already-correct codebase those point in opposite directions.** There is no surgical edit
to `src/` that traces to "prove your tests can fail", so a builder obeying the scope rule cannot
arm the gate. Run 9's builder did the only other reasonable thing — it wrote another test — and
`node.mjs` filters changed files through `TEST_LIKE_RE`, so a test file can never arm the
mutation gate whatever git reports about it. Iteration 3 eventually touched source and iteration
4 shipped.

**The proposal, not yet built: let the driver run the mutation gate itself.** When the panel
passes and the changed set is empty, the driver mutates the whole first-party source once,
rather than handing a builder an objective with no legal move. That converts an unsatisfiable
instruction into a deterministic check the driver performs, at exactly the moment it is worth
paying for — the ship is then earned or refused without spending an iteration on theatre.

Two things to check before building it: the cost of mutating a whole tree at ship time (run 9's
scoped runs were minutes, not seconds), and that it cannot become a way for a run to ship on a
mutation pass it never earned on its own changes. **Do not build it while a run is testing ship
logic** — one variable at a time is the only reason runs 6 and 7 were readable.

## Deploy, built 0.61.0–0.63.0 — and the ssh half is argv nobody has run

The old `deploy` was a stub: one `execFileSync` inside `ship()`, fired **after** the
`dare/GRAND-PRIZE` tag was written, whose failure was printed and ignored. A run could announce a
grand prize having deployed nothing. `DESIGN.md` §10.1 now describes what was built instead.

**Only synchronous fixed-host deploys are supported, and that is a decision, not a gap.** A
push-triggered deploy has no exit code — `git push` exits 0 when the objects transfer and
everything after it is asynchronous and unowned, so smoke-testing it means polling a URL still
serving the *previous* deploy with no signal separating "not yet" from "broken" from "fine".
Vercel and Netlify already own that path through their own git integrations. §3.8.1's finding, in
a new place.

What to know before using it:

- `deploy.command` is an **argv array**; a string is refused by name rather than coerced.
- `enabled: true` requires `command`, `url` **and** `smoke`. A deploy nothing can check reports
  success whatever it did.
- `deploy.url` goes through the **same** `riskyRemoteWord` that refuses a production git remote.
- It runs **before** the ship decision, and a failure **withholds the tag without failing the
  iteration** — a box being down must not `git reset --hard` a tree that just passed a panel.
- `smoke` gets **no** `gate-policy.mjs` entry. It is a ship-time step, not a Phase-3 gate;
  running it per iteration would deploy unreviewed code. Config being filled in is the arming.

**Unproven by execution.** Tier 2 covers the probe against a real listening server, but **nothing
has ever deployed to a real droplet** — the ssh half is argv nobody has run. Treat it exactly as
the .NET adapter is treated: correct by construction, unverified in the world. The first real use
should be a throwaway box, watched.

## Queue item 4 — deploy, proven to its boundary. 13 August 2026

**No host was provisioned, so the ssh transport remains unexecuted.** Everything on this side of
it was run rather than asserted, against a real listening server on `127.0.0.1:8731`.

**The smoke probe, real socket, real output:**

```
3 smoke check(s) passed against http://127.0.0.1:8731                         exit 0
1 of 1 smoke check(s) failed - /nope: expected 200, answered 404              exit 1
1 of 1 smoke check(s) failed - /sick: health endpoint reported itself as "down"  exit 1
1 of 1 smoke check(s) failed - /health: connect ECONNREFUSED 127.0.0.1:9      exit 1
no smoke checks were given, so nothing was verified                          exit 1
```

The third line matters most: **a 200 with a body admitting distress fails**, so the check is not
merely comparing numbers. The fourth returned in under two seconds rather than hanging. The fifth
is the one that would otherwise be silent — an empty check list reports failure rather than a pass
over nothing.

**The config boundary, every case exercised through `validateConfig`:**

| input | outcome |
|---|---|
| `enabled` with no `command` | REFUSED — "there is nothing to run" |
| `enabled` with no `url` | REFUSED — "a deploy that is not asked whether it worked" |
| `enabled` with no `smoke` | REFUSED — "a deploy nothing checks cannot fail" |
| `command` as a string | REFUSED — names the array it wants |
| `url` containing `production` | REFUSED — same `riskyRemoteWord` that refuses a prod git remote |
| `url` not http(s) | REFUSED — `ssh://box/app` |
| smoke entry without `status` | REFUSED — "did anything answer is satisfied by a 500" |
| **disabled** and incomplete | **accepted** — an unused section must not fail runs that never deploy |
| complete and valid | accepted, argv preserved as `["ssh","deploy@box","/srv/app/deploy.sh"]` |

**The driver's deploy effect, composed exactly as `main()` builds it and executed:**

```
deploy ok, smoke ok   -> {"ok":true,"detail":"1 smoke check(s) passed against http://127.0.0.1:8731"}
deploy ok, smoke FAIL -> {"ok":false,"detail":"1 of 1 smoke check(s) failed - /nope: expected 200, answered 404"}
deploy command FAILS  -> {"ok":false,"detail":"the deploy command failed: 7"}
```

A non-zero deploy command is distinguished from a deploy that ran and failed its smoke, and both
are distinguished from success — which is what the withholding logic keys on.

### Where the untested surface starts, precisely

Everything above ran. **What has never executed is one line:** `shell(command, args, { cwd })`
where `command` is `ssh`. Specifically unproven —

- **that `ssh` inherits the operator's agent and known_hosts through `process.env`.** The driver
  passes `options.env ?? process.env` and never sets `SSH_AUTH_SOCK` itself, so this is inherited
  rather than arranged, and an unattended run with a passphrase-locked key would block on a
  prompt no one can answer. **Nothing times out a deploy command.**
- **that a remote failure surfaces as a non-zero exit** rather than ssh succeeding while the
  remote script fails — the `dotnet list package --vulnerable` shape (§3.8.1), where a wrapper
  exits 0 over a failure underneath.
- **the real-host round trip**: deploy, then a smoke check against a URL served by something the
  deploy actually changed, rather than a server this session started.

**NEEDS REVIEW:** the missing timeout is a real hazard I found by writing this up rather than by
running anything, and I have not fixed it — a hung `ssh` stalls the run indefinitely with no
ceiling, since `tokenCeiling` and `costCeiling` only bind children that return. It is one line to
add and I have left it alone because this was not a build session.

## Run 13 oscillated, and the cause is the strongest argument A3 has ever had

Observed live at segments 1–5 of case H. The loop entered a stable two-cycle:

```
segment 1: panel -> 3 findings
segment 2: regression: src/summarise.test.ts::folds mean left-to-right ... IEEE-754 doubles
segment 3: panel -> 4 findings
segment 4: regression: the same test
segment 5: panel -> 4 findings
```

**The builder wrote a test that asserts its own implementation, and the ratchet made it
permanent:**

```js
it("folds mean left-to-right in row order using IEEE-754 doubles", () => {
  expect(result.mean).toBe((0.1 + 0.2) / 2);
});
```

The PRD says *"the arithmetic mean"*. That test says *"whatever my loop does"* — it names the
implementation in its own title. It passed, it entered the ratchet, and it is now protected
forever.

Then the panel did its job. `DoD-6-adversarial-input`: *"src/summarise.ts:33 (`sum += n`, an
unguarded fold) … a confidently wrong answer at exit 0."* Two repair attempts broke the protected
test and were hard-reset.

### Correction, written after watching it resolve: the cycle broke, and how it broke is the finding

**An earlier draft of this entry said the correct repair was "a regression by definition" and that
the loop was in a stable deadlock. That was too strong, and the truth is more interesting.** The
oscillation lasted two cycles and then the builder escaped it — by changing the formulation from
`sum += n` to **`mean += n / count`**. Measured directly:

| input | `mean += n / count` | verdict |
|---|---|---|
| `0.1, 0.2` | `0.15000000000000002` | **passes the protected test exactly** |
| `1e308, 1e308` | `1e+308` | **fixes the overflow the panel demanded** (was `Infinity`) |
| `1e16, 1, -1e16` | **`0.5`** | true answer is `0.3333333333333333` — **still wrong, and newly wrong** |

So the protected test did not block the repair. **It narrowed the solution space, and the builder
found a point in it that satisfies the reviewer's stated finding while leaving the defect class
intact** — trading one wrong answer at exit 0 for a different wrong answer at exit 0.

That is a subtler failure than a deadlock and a worse one to detect. A deadlock is loud: the same
regression, forever, in the log. This resolves, the findings converge, the gates go green, and the
run proceeds looking healthy. **The panel asked about `1e308` because that is the case it found;
the builder fixed exactly that case.** Nobody lied and nobody stalled.

**It remains the argument for the held-out oracle, by a different route than the one first
written here.** The oracle's cases are authored from the PRD before any code exists, so the
assertion is *"mean is the arithmetic mean"* rather than *"mean matches the input the reviewer
happened to try"* — and a repair that fixes one input while breaking the property still fails.
Run 12 showed the panel cannot close this hole. Run 13 shows that a finding phrased as a specific
input gets answered as a specific input.

**Both mechanisms are behaving exactly as specified.** The ratchet is monotonic on test
*identity* and has no opinion on whether an id was worth having — `BRIEF.md`'s A3 section has said
those words since it was written. This is that sentence happening in a live run.

**It is the case for the held-out oracle, produced by the loop itself.** An oracle case is
authored from the PRD before any code exists, so `mean` for `0.1, 0.2` would be asserted as the
arithmetic mean rather than as whatever the fold returns, and the builder's self-serving test
would never have become the authority. A3 was deferred for months on sequencing; run 12 showed
the panel cannot close the hole, and run 13 shows the ratchet actively defends it.

**Do not "fix" this by weakening the ratchet.** A test that has passed may never be allowed to
fail again — that invariant is the only reason this loop terminates. The defect is not that the
ratchet protected an id; it is that the id was allowed to encode an implementation as a
requirement in the first place. The oracle is upstream of that, which is why it is the fix.

**Proposed, measured, and rejected — do not rebuild it.** The tempting patch was a `gate-integrity`
rule refusing an assertion whose expected value is an *expression* rather than a literal, since
`toBe((0.1 + 0.2) / 2)` recomputes the implementation instead of stating an answer. Measured
against the four shipped dogfood suites — **337 assertions, 6 matches:**

| match | verdict |
|---|---|
| `toBe(USAGE + '\n')` × 4 | legitimate: a constant concatenated with a newline |
| `toBe(-1e308)` | **false positive of the detector itself**, matched on the minus sign |
| `toBe((0.1 + 0.2) / 2)` | the real defect |

**One true positive, five false.** §4's own rule settles it: a false positive costs a full
iteration on a correct repository, a false negative costs nothing the reviewer was not already
covering. This would have been the eighth unsatisfiable gate.

It is also not syntactically detectable in principle. What makes that assertion wrong is that it
**recomputes the implementation over the same literals the input contains** — a semantic
relationship between test and fixture, not a shape a regex can see. The oracle catches it because
it never asks the implementation what the answer is, which is the whole argument for §4.6.

## Run 12 SHIPPED — and shipped a wrong answer past a 110,877-case audit

Case G, `~/dare-dogfood/csvstat6`, same PRD, twelve iterations, 0.65.0. Log at
`~/dare-logs/run12.log`.

```
SHIPPED: panel unanimous on 16 requirement(s)
iterations: 6  tokens: 57782345  cost: $49.4684  passing: 107   (0 quarantined)
```

Panel trajectory: **6 → 2 → 1 → pass → 3 → pass.** Sixteen ids, because `DoD-6` is now one of
them.

**What shipped, verified by running the binary rather than by reading the panel:**

| defect | run 9 (no `DoD-6`) | run 10 | run 12 |
|---|---|---|---|
| unterminated quote | **shipped: half the data at exit 0** | blocked → fixed | fixed, `exit 3` |
| sum overflow | — | blocked → fixed | fixed, `mean 1e+308` |
| **catastrophic cancellation** | — | **named by the panel** | **`mean: 0`, true mean 1/3, exit 0 — SHIPPED** |

### Why it was missed, which is the finding

**The reviewer was not lazy. It was exceptional.** It wrote an independent reference parser and
summariser *from the PRD and data model* and differentially fuzzed the binary against it —
**110,877 cases** — plus truncation, CR-only line endings, BOM, numerics and boundaries. Its own
words on the case it passed:

> *"two values of `1e308` → mean 1e308 (the naive sum overflows; `summarise.ts:58` falls back to
> `stableMean`…)"*

**It tested the guard, not the gap beside the guard.** `stableMean` triggers on a *non-finite*
sum. `1e16, 1, -1e16` never overflows — it loses precision **inside** finite range, the fallback
never fires, and the naive sum returns 0. The reviewer verified the repair where it triggers and
never asked where it doesn't.

**And the fuzz could not have caught it.** The reference was written from the same documents, so a
property those documents never mention — floating-point associativity — is invisible to *both*
implementations equally. **That is the oracle problem, and it is why A3 is now the top of
`COMPLETION.md`.** A differential fuzz against a reference derived from the same spec is not an
independent oracle; it is the same assumption twice.

**The invalid-UTF-8 case is a genuine disagreement, not a miss.** Run 10 called `distinct: 1` for
`\xff` and `\xfe` a defect; run 12 saw the identical input and judged *"→ U+FFFD, exit 0, counts
correct"*. Both bytes decode to the same replacement character, so both readings are defensible.
Two reviewers, one input, honest disagreement — a judgment line behaving like one.

**The verdict on `DoD-6`: it raises the floor enormously and it is not a guarantee.** Two of three
known defects were driven out of the product by it. `DESIGN.md` §4.5 predicted exactly this — *"it
is exactly as good as the reviewer executing it"* — and that is now measured rather than reasoned.

### 0.56.0 cost a clean panel, and this is no longer provisional

Iteration 5's panel **passed unanimously**. The sensitivity check withheld the ship. The builder
touched first-party source as the brief instructs — and **iteration 6 came back with three
findings.** Two extra iterations and roughly $16 to satisfy a check about the *suite* rather than
the *code*. Second run in a row it has cost real iterations; the fix is `COMPLETION.md` §2.1.

## The guard's `nested-dare` rule has a false positive, and it fails loudly in the wrong place

Found by being bitten, 12 August. A `git commit` whose **message** described the slash command was
refused with `[dare:nested-dare]`. `README.md` claims that rule *"deliberately leaves alone the
word 'dare' in prose"*; it does not, once a slash is attached.

**The expensive part is not the refusal.** The deny killed the **entire Bash call**, and that call
also contained the `python` heredoc performing a documentation edit. The edit never happened, the
following `git push` succeeded as a no-op on a clean tree, and the whole sequence looked like a
successful doc fix. It was caught only because `git commit` printed `nothing to commit`.

**It may be correct and merely expensive.** Telling an invocation from a mention needs shell
parsing, and this repository's own reasoning says a whitelist that fails open on the first heredoc
is worse than a blunt rule. Rules 2–4 are deliberately refused to everyone, operator included.

Two things worth doing before deciding: **`README.md`'s "leaves alone" claim is currently false and
should say so**, and a compound command that mixes an edit with a blocked git call will silently
lose the edit — so prefer the `Edit` tool over `python` heredocs when the text names the command.

## Run 10: DoD-6 blocked the ship, the loop repaired what it named, and `removed` fired

Case G again (`~/dare-dogfood/csvstat4`), same PRD, fresh tree, log at `~/dare-logs/run10.log`.
**The only variable against run 9 was `DoD-6-adversarial-input`.**

```
BUDGET: iteration limit reached: 6 of 6
iterations: 6  tokens: 41469901  cost: $29.4515  passing: 79   (0 quarantined)
```

**`DoD-6` failed in both panels and is a true positive.** It named two input classes, with exact
inputs, exact outputs and `file:line` sites: `1e308 + 1e308` produced `"mean": null` at exit 0
(true mean `1e308`, already printed as `min` and `max`), and `1e16, 1, -1e16` produced
`"mean": 0` where the true mean is 1/3. Invalid UTF-8 collapsed two distinct values to
`distinct: 1`.

**And the loop repaired every one of them.** Verified independently against the final tree, by
execution, not by reading the panel:

| input | run 9 (shipped) | run 10 (refused, then repaired) |
|---|---|---|
| `printf 'a\n1e308\n1e308\n'` | — | `"mean": null` → **`1e+308`** |
| `printf 'v\n1e16\n1\n-1e16\n'` | — | `"mean": 0` → **`0.3333333333333333`** |
| `printf 'a,b\n1,"x\n2,y\n'` | **shipped: half the data at exit 0** | **`exit 3: unterminated quoted field`** |

Compensated summation, and the cancellation case is now exact. **The tree run 10 refused to ship
is materially better than the tree run 9 shipped**, on the same PRD, and the difference is one
required id.

The panels also converged **7 findings → 4**, and iteration 1's reviewer caught something no gate
in this architecture can see: the packaged `bin` was **inert**. `npm pack`, `npm install -g`, then
`csvstat data.csv` → zero bytes, exit 0, because `src/cli.ts:41` compared `import.meta.url`
(realpath) against `process.argv[1]` (the bin symlink). Its own words: *"all six gates were run
and are green — which is precisely the problem: every gate invokes `node dist/cli.js` and none
invokes the shipped bin."* Reviewers also ran a 4000-case differential fuzz of the parser against
a transcription of the state machine, and 300 cases against an independent Python reference,
unprompted.

### The `removed` pin verdict fired, for the first time

This file said for two days that `removed` and `unknown` were unobserved and would need a PRD
whose security element sits off the tested path. `removed` arrived on its own:

```
pinned security element DoD-2-security at package.json:18 did not re-verify; asking
security-escalation: claude-opus-5 running on 1221 characters of prompt
security regression: DoD-2-security at package.json:18
```

The pinned snippet was `"dependencies": {},` — the zero-runtime-dependency guarantee. The builder
disturbed it, the cheap check failed, one scoped escalation child answered `removed`, a regression
objective was issued, and the element is **`active` again with its snippet restored**. A4 now has
`moved` (run 5) and `removed` (run 10) both measured end to end. `unknown` remains unobserved, and
`bloopers.log` stayed empty — the security-regression path is separate from the ratchet's reset,
which is worth knowing before looking for a blooper that will not be there.

### What to fix next, and it is not `DoD-6`

**Iterations 5 and 6 both died on `gates failed: mutation` and never reached a panel.** The
repairs `DoD-6` provoked were therefore never re-judged, and the run ended `BUDGET` holding a tree
that had probably earned a ship. Six iterations was enough when the bar was run 9's; it is not
enough now that a real correctness line has to be satisfied *and* the mutation gate cleared on the
same iteration.

Two candidates, in order:

1. **Raise `maxIterations` for the next case G run** — the cheapest possible test of whether this
   is purely a budget effect. Run 10 was still improving when it stopped, exactly as run 5 was.
2. **Look at whether the mutation gate is now the binding constraint.** It declined twice for "no
   first-party source changed" and failed three times. A gate that blocks the panel on the very
   iterations that repair a correctness finding is worth measuring before it is trusted.

## Run 9 shipped, and the panel had already proved it should not have

Case G, fresh repo (`~/dare-dogfood/csvstat3`), the same PRD run 8 shipped, log at
`~/dare-logs/run9.log`. **The first run in this project's history with a working guard hook.**

```
SHIPPED: panel unanimous on 15 requirement(s)
iterations: 3  tokens: 27899716  cost: $23.5132  passing: 58
```

**What worked.** `0.56.0` is satisfiable: `seenFailing: 0`, so the ship was earned through the
mutation gate exactly as designed. 3 security pins, all `active`, **0 quarantined** — not a ship
over lost protection. It cost **one entirely wasted iteration**: iteration 2 made *zero tracked
changes* (7.5M tokens, ~$6) against the "prove the suite can fail" objective before iteration 3
finally touched source and armed the gate. Expensive, not deadlocked. An earlier reading in this
session called it unsatisfiable; that was wrong.

**What did not.** The shipped binary reports statistics over **half its input** when a quote is
left unterminated, at exit `0`, empty stderr — the same defect run 8 shipped, reproduced
verbatim:

```
$ printf 'a,b\n1,"x\n2,y\n' > swallow.csv     # two data rows
$ node dist/bin.js swallow.csv                # count 1, mean 1
$ echo $?                                     # 0
```

Integers past 2^53 still collapse two distinct ids into one wrong value at exit 0. The lone-`\r`
case **is** fixed (exit 3 now).

**And here is the part that matters.** The panel was not asleep. **All three cold reviewers found
it independently, each ran the program themselves, and each returned `status: fail`** citing
`src/csv.ts:21` — one at severity `major`, confidence **0.95**, quoting its own input and output.
`0.58.0`'s widened remit worked perfectly.

They filed it as `advisory-`, and §4.1 says an advisory cannot move the verdict. The shipping
panel's own record: `verdict: pass`, `failing: []`, **`advisories: 12`, every one `status: fail`.**

**They filed it there because there was nowhere else.** The contract has two channels — a verdict
on a required id, or an advisory — and no required id covered it. The PRD never mentions
unterminated quotes, and `PRD-2.1` is genuinely satisfied. A reviewer obeying the contract had
exactly one place to put the finding, and it was the place that cannot block.

**The lesson generalises past this defect: a remit is not a channel.** 0.58.0 told the panel it
*may* fail a demonstrable wrong answer without giving it an id to do so on, and permission with
nowhere to act is indistinguishable from no permission. **When you widen what a reviewer may
judge, check that a required id exists to carry the answer.**

Fixed at **0.60.0** by `DoD-6-adversarial-input`: a required id, owned by correctness, whose bar
is narrow and absolute — *a wrong answer at exit 0 is a fail; a crash or a non-zero exit with a
diagnostic is not.* `templates/reviewer-system.md` tells the reviewer to construct hostile inputs
and run them, names the classes (truncation that still parses, encodings, numeric limits,
boundaries), requires a pass to state what was tried, and says in as many words not to file this
as an advisory. `DESIGN.md` §4.5.

**It is a judgment line, not a gate, and that is stated rather than hidden.** No exit code
enforces it. It is exactly as good as the reviewer executing it. It is strictly better than the
advisory channel that discarded three correct findings, and strictly weaker than a deterministic
check — which for this class does not exist, because "is this number right" is the oracle
problem. `gate-integrity` cannot see it and neither can the mutation gate, whose tests are
insensitive to inputs nobody thought to write.

**The next run is the test of that, exactly as run 9 was the test of 0.56–0.58.** Re-run case G
on a fresh repo with the same PRD. If `DoD-6-adversarial-input` works, the panel fails that id and
the run does not ship until the quote handling is fixed.

## The guard hook was never firing. Not once, in any run.

**Found and fixed on 12 August 2026 at 0.59.0, and it is the most serious defect this project has
had.** `hooks/hooks.json` registers the guard with Claude Code, which applies it to the
*operator's* sessions. **A `claude -p` child does not load the operator's plugin PreToolUse
hooks.** Measured, not inferred: a child stamped `DARE_RUNNING=1` overwrote `.dare/state.json`
through the Write tool **and** through a Bash redirect, in dangerous **and** non-dangerous mode,
each time returning `permission_denials: []`.

**Every dogfood run in this file was performed with no guard at all**, run 8 included — the one
that `SHIPPED`.

Two things hid it, and both are instructive:

- **The plugin was demonstrably loaded in those children.** Its *SessionStart* hook injected
  content into the same process. The two hook kinds do not travel together, so every visible
  signal said the plugin was present.
- **`test/guard.test.mjs` was right the whole time and passed the whole time.** It runs
  `guard.mjs` as a subprocess and proves the deny, the allow and the benign neighbour. It proves
  the *logic*. Nothing asserted the *invocation*. **This is the `claudeArgs` defect, arrived at
  the safety mechanism** — and the single strongest argument this repository owns for §11.1.

The fix: the driver supplies the hook in the `--settings` blob it already passed for the output
style, **reading the matcher from `hooks/hooks.json`** rather than restating it, expanding
`${CLAUDE_PLUGIN_ROOT}` itself, and throwing on every failure path — `-p` mode silently ignores a
settings blob that fails validation, which would drop the guard and the style together without a
word. It no longer depends on the plugin being installed, enabled, or at the tree's version, none
of which was true here. `test/live/guard-registration.live.test.mjs` holds it, and was verified by
sabotage: without the registration both deny cases fail and the benign neighbour still passes.
`DESIGN.md` §6.

**The plugin is installed at 0.39.0 — nineteen versions stale — and its hook is live in ordinary
sessions** (it refused a recursive `rm` in this one). That no longer matters for a run, which is
the point of the fix, but do not read a denial in your own terminal as evidence a child is fenced.
They are different processes and, until 0.59.0, different answers.

## The second finding: children inherit the operator's context, and it is wider than §5.0 says

Also measured on 12 August, and **not yet fixed.** A `claude -p` child — in the repo *and in an
empty temp directory* — is handed the operator's installed-plugin SessionStart injections, the
project `MEMORY.md`, `userEmail`, git status and the skills list. Asked without tools, a child
quoted this machine's memory line back verbatim.

It is not only a skill surface. The injected text carries **imperative behavioural instructions**
(*"Invoke relevant skills BEFORE any response or action — including clarifying questions"*), and a
child obeyed **that** instead of the driver's prompt: tier 3 failed once with a live builder
answering *"What would you like me to focus on today?"* to a prompt that asked for one word. It
passed on re-run. **An intermittent instruction-override in every child of the loop, including the
cold panel**, whose starvation is the reason the architecture exists (§1.1).

`--safe-mode` is the mechanism and it is verified: it suppresses the injections, the memory and
CLAUDE.md, and unlike `--bare` it leaves auth working on a subscription (`--bare` demands
`ANTHROPIC_API_KEY` and never reads OAuth, so it is unusable here).

**But it is mutually exclusive with the guard, and that was measured rather than assumed.** A
child given `--safe-mode` **and** the settings-supplied guard from 0.59.0 still overwrote
`.dare/state.json` with `permission_denials: []`. Safe mode disables hooks *including the ones
handed to it explicitly*. There is no combination that gets both.

So the only defensible split is by write capability, and it happens to be the split that already
exists in `PHASE_PERMISSIONS`:

| phases | what they may have |
|---|---|
| `review`, `reality-check`, `lesson-extractor`, `security-escalation` | **safe-mode.** They hold `Read`/`Glob`/`Grep` and no Bash, so there is nothing for a guard to deny, and starving them further is what §1.1 wants anyway |
| `builder`, `prd`, `design` | **guard, and no safe-mode.** They can write. Losing the guard to gain isolation would trade a measured catastrophe for a measured annoyance |

That leaves the builder's inherited context an **open problem**, exactly as §5.0 says — now with a
measurement behind it and a known reason it cannot be closed the easy way. Note also that safe-mode
suppresses CLAUDE.md, and runs 6 and 7 are a controlled A/B proving the builder's reading of the
target `CLAUDE.md` is load-bearing; any future attempt to isolate the builder has to carry that
file into the brief deliberately rather than lose it silently.

## The one thing to know before doing anything

**Versions 0.56.0, 0.57.0 and 0.58.0 have never been exercised by a live run.** They change the
*ship condition* itself:

- **0.56.0** — a panel pass no longer ships alone; the run must also hold proof the suite can fail
  (mutation gate passed, or something observed red).
- **0.57.0** — a security pin can be retracted by a new `never-was` verdict.
- **0.58.0** — the reviewer may fail a demonstrable wrong answer that exits 0.

The first of those can **withhold a ship that should happen**, and that is exactly the shape of
defect this project keeps rediscovering — a gate nothing can satisfy. It is designed against that
(it withholds the ship, never fails the iteration, and any iteration touching first-party source
makes the mutation gate apply again) but **design is not evidence.** The next run is the test.

## Do this next

1. **A fresh case G run** (`DOGFOOD.md`), on a new scenario repo, not a resume. It is the first run
   with 0.56–0.58 live, and it answers whether a ship still happens when a ship must now be earned.
   The previous scenarios are at `~/dare-dogfood/csvstat` and `csvstat2`; logs go **outside the
   tree**, at `~/dare-logs/`.

   **It is also the first run in this project's history that will have a guard hook** (0.59.0,
   above). Prefer the *same* PRD run 8 shipped, on a *fresh* repo: it holds the specification
   constant against a known outcome, so what it measures is the loop — whether a ship is still
   reached when every test must be earned from zero, and whether 0.58.0's widened remit catches
   the exit-0 data loss the run-8 panel passed. A new PRD would change two variables at once.
2. **Racing has never run with a live builder.** `race.enabled` is `false`; the git half is tier‑2
   tested, and the half that costs money has never executed once. C5 is blocked behind it. This is
   the largest untested surface left.
3. **A8's carry optimisation — decide before building.** Run 3 pinned `PRD-3.1` to a *test file*, so
   the carry would let a source regression slip through unre-litigated.
4. **The .NET adapter is `DONE` on argv nobody has executed.** No SDK on this machine. Every
   contract test passes regardless. Do not trust it until an SDK exists.

## What happened on 12 August

Nineteen versions, `0.40.0` → `0.58.0`, each traced to a produced artifact rather than an assertion.
Six dogfood runs. **Cases E and F passed live** — the ratchet reset a real tree and issued a
regression-only brief; the security-escalation child ran for the first time and re-pinned a moved
guard. **Run 8 SHIPPED, the first in this project's history.**

Then an independent audit of that ship returned: ***"SHIPPED was earned against the specification it
was given, and not against the thing the specification stands for."*** All ten requirements passed
under execution and 15 of 15 mutations were killed — and the program silently discarded data at exit
`0`. Three defects it found in the loop are closed (0.55.0, 0.56.0, 0.57.0); the reviewer remit
change (0.58.0) is the answer to the fourth.

## Run 8: SHIPPED, for the first time in this project's history

```
SHIPPED: panel unanimous on 15 requirement(s)
iterations: 1  tokens: 8156885  cost: $8.0050  passing: 79
```

Every run before this one ended `BUDGET` or `STALLED`. This is the first `SHIPPED` the loop has
ever produced. Fifteen requirements is the ten `PRD-*` ids plus the five `DoD-*` ids, and it took
one iteration because it resumed csvstat2's tree, which already held 79 protected tests.

**The invariant that would have made this a serious bug held**: 2 security pins, **0 quarantined**,
14 requirement pins. It is not a ship over recorded lost protection.

It is the first run with all four of the run-6 fixes live — the architect receiving the gate
commands (0.52.0), an uncollected suite failing the iteration rather than resetting the ratchet
(0.51.0), gate failures reported even when the ratchet acts first (0.53.0), and a lesson unable to
invent a gate (0.54.0).

**Whether it deserved the tag is a separate question and is not settled by the tag.** `DOGFOOD.md`
case G says to check before believing it, and the party that chose the PRD and staged the scenario
is the wrong one to certify it — that is the satisficing pressure §1.1 exists to defeat. An
independent audit is running against the PRD and the binary, without the session's context, told to
assume the tag was not earned.

The precedent for taking that seriously is one scenario old: run 6's identical audit found all ten
requirements passing **and** a stray-quote path that silently swallowed the rest of the file and
exited 0, which the cold panel had not caught. *"Spec-complete rather than trustworthy."* **A
unanimous panel and a real defect have already coexisted here once.**

### The audit of that ship, by an agent with no stake in it

**Verdict, verbatim: *"SHIPPED was earned against the specification it was given, and not against
the thing the specification stands for."***

What held up, and it is not nothing:

- **All ten PRD requirements pass under independent execution**, every branch of the exit-code
  contract included.
- **The suite is not theatre.** The auditor applied **15 hand-picked mutations** to `parse`,
  `summarise`, `table`, `render`, `read`, `args` and `usage` — **15 of 15 were killed.**
- Every finding from the previous run's panel was genuinely repaired, not argued away.

**The defect that matters, and the class it belongs to:**

```
$ printf 'a,b\n1,"x\n2,y\n' > swallow.csv     # two data rows
$ node dist/bin.js swallow.csv                # count 1, mean 1
$ echo $?                                     # 0
```

An unterminated quote absorbs the rest of the file into one field. The field count still matches,
so exit 3 never fires. **A statistic over half the data, reported as success, empty stderr.** Two
more exit-0 wrong answers: a lone `\r` turns a 3×2 file into 4 columns and zero rows, and integers
past 2⁵³ collapse two distinct ids to one wrong value.

**No gate in this architecture can see that class.** Not a crash, not a wrong exit code — a
confident wrong number. The panel passed it.

### Three findings against the loop itself

1. **The panel's verdict was persisted nowhere.** *"I could not verify the unanimous-panel claim at
   all — the evidence for it is not in the repo."* Only an unannotated `dare/GRAND-PRIZE` tag on a
   commit named "iteration 2". **Fixed at 0.55.0** (`.dare/review.json`, annotated tag).
2. **`seenFailing: []`, and the mutation gate declined.** All 79 ids took ratchet credit without the
   loop watching one go red, and the compensating control did not run that iteration. **Both
   mechanisms that exist to prove a suite can fail were absent from the iteration that shipped.**
   Unfixed, and the strongest remaining argument that the tag means less than it looks like.
3. **A false security pin.** `DoD-2-security` cites `src/cli.ts:20` — `if (intent.kind ===
   'usage-error') {`, an argv branch, not a security control. §4.3 predicted this hazard in writing.
   The escalation path handles `moved`, `removed` and `unknown`; **there is no path for "this should
   never have been a pin"**, so under monotonicity it is permanent. Unfixed.

Smaller: `dist/` is gitignored, so the shipped commit contains **no runnable binary**; `state.json`'s
iteration counter carried over from the archived run; and two documented claims in
`docs/api-contract.md` are falsifiable by execution.

## Run 7: stopped early on purpose, after proving the fix worked

Same PRD as run 6, same ceilings, one variable changed — the architect now receives the resolved
gate commands (0.52.0). **Stopped by the operator mid-run to conserve usage**, so there is no
terminal state. It is resumable: `~/dare-dogfood/csvstat2` keeps its `.dare/`, its git history and
`~/dare-logs/run7.log`, and `state.json` still holds the ratchet.

What it established before it was stopped is a controlled A/B, not an inference:

| | run 6 | run 7 |
|---|---|---|
| what the architect wrote into `CLAUDE.md` | *"Never add a dependency… not `vitest`."* | the gate command table verbatim, plus *"Test ids come only from this [command]… **Keep `vitest` in devDependencies**"* |
| `vitest` declared | never, in any commit | yes, and `"test": "vitest run"` |
| iteration 1 | wasted — `passing: 0` | ratchet advanced |
| at the point of comparison | 75 ids, one advance, then a 75-id reset | **79 ids, three advances** |

The architect also drew the distinction run 6's missed: *zero **runtime** dependencies*, with the
toolchain in devDependencies. That is the whole defect, inverted, by supplying one fragment the
design phase had never been given.

**`SHIPPED` is still unobserved.** It remains the one outcome this project has never produced, and
the three run-6 fixes exist to make it reachable. The next run of case G is the experiment; nothing
else is blocking it.

## Run 6: it built the thing, and then the loop destroyed 75 ids over a runner

Case G — a small, deliberately satisfiable CLI, six iterations, nothing impossible. Ended
`BUDGET: iteration limit reached: 6 of 6`, 45.6M tokens, $31.09, `passing: 75`. **Still no run has
ever reached `SHIPPED`**, and this one came closest by a distance.

Two independent agents were given the artifacts, neither with this session's context. One verified
the binary against the PRD by execution; one was handed a hypothesis about the cause and told to
refute it. **It did refute it, and the correction matters more than the confirmation.**

### The code was genuinely good, and the panel's attention was spent elsewhere

All ten PRD requirements **pass**, verified by running the binary: the exit-code contract, `empty`
counts, quoted commas, doubled quotes, embedded newlines, BOM stripping, physical line numbering.
The loop produced working software.

The verifier then found seven defects the PRD did not cover, one of them serious: a stray or
unterminated quote silently swallows the rest of the file into one field and **exits 0 with
confidently wrong statistics**. Its verdict — *"spec-complete rather than trustworthy"*.

**The panel did not find it.** It found a different genuine parsing bug (a file ending in two
newlines is rejected with exit 3), so it was not asleep. But **four of its eight findings were about
the mess our own gates created** — vitest invoked by `npx` but absent from the manifest, the
dependency guard "inverted rather than satisfied", `vitest.config.js` untracked so the coverage
thresholds sat outside version control. That is a new and worse cost for the unsatisfiable-gate
class: it does not only burn iterations, **it displaces hostile attention away from the product.**

### The causal chain, and the hypothesis that was wrong

The obvious reading — the security gate failed once vitest's dependencies appeared — is **false**.
`npm audit` exits 0 on that tree, the reviewer independently ran it at iteration 4 and reported *"0
vulnerabilities over 23 packages"*, and **vitest was never a dependency in any commit**; it was
always `npx --yes vitest`, structurally invisible to `npm audit`. What actually happened:

1. The plugin collects test ids **only** via `npx vitest run --reporter=json`.
2. **The architect was never told, and was told the opposite.** The design prompt was
   `architect.md` + the PRD; `templates/architect.md` promises *"the test gates you write into
   `CLAUDE.md` are the gates the run will actually execute"*. False for `unit`.
3. So the architect wrote `CLAUDE.md`: *"Never add a dependency… not `vitest`."*
4. The builder spotted the contradiction on **iteration 1** and predicted this exact failure in
   `assumptions.json`.
5. The panel objected that the executing dependency set was outside any auditable manifest, and
   suggested **adding** vitest. The builder took the other branch on `CLAUDE.md`'s authority and
   removed it.
6. The report came back **structurally empty** — `numTotalTests: 0`, "No test suite found in file".
7. **The ratchet cannot tell "collected nothing" from "everything failed".** Absent ≡ regressed, and
   regressions are checked first, so 75 ids "regressed" and the tree was hard-reset. Iteration 6's
   work is unrecoverable — `git fsck --lost-found` is empty.
8. **The operator was never told why.** The gate-failure report sits *after* the reset branch, so no
   `gates failed:` line printed at all. The log says regression; the cause was a runner.

Fixed in two halves. **0.51.0** gives the ratchet the collected-test count, so a report containing no
tests rejects the iteration instead of resetting the tree — while a report where tests really ran and
failed still resets, so §1.2 is kept rather than traded. **0.52.0** puts the resolved gate commands
into the architect's prompt and tells it not to write a project rule forbidding what they require,
which makes `architect.md`'s promise true and stops the contradiction being authored at all.

### The lesson store recorded something false

`lessons.json` came out of the wreck saying the `DoD-2-security` **gate** rejects any devDependency
and only passes once dependencies are removed. Every clause is wrong: it is a panel requirement not
a gate, the gate exits 0 on that tree, and the objection was that vitest was *missing* from the
manifest. It was stamped `resolved: 6` — crediting the iteration that was hard-reset for destroying
the ratchet.

**This is a third failure mode for F4, and worse than the generalities it was watching for.** A
generality is ignorable. A specific, well-formed, confidently wrong lesson is actionable, persistent,
and would be injected into future briefs. It was deleted from the scenario; a copy is kept as
evidence. What is not fixed is the mechanism: nothing checks a lesson against the run it came from,
and the extractor is the one child whose output nothing verifies.

## Run 5: case F passed, and the panel's findings converged 5 → 4 → 3

```
pinned security element DoD-2-security at src/http/router.js:266 did not re-verify; asking
security-escalation: claude-opus-5 running on 1272 characters of prompt
security-escalation: returned after 25s, 154671 tokens
pinned security element DoD-2-security moved to src/http/router.js:266; re-pinned
...
BUDGET: iteration limit reached: 3 of 3
iterations: 3  tokens: 37420203  cost: $32.6355  passing: 102
```

**A `security-escalation` child ran for the first time**, and A4's whole mechanism worked end to
end: the cheap re-verification failed, exactly one child was asked — a **1,272-character** prompt
scoped to that single element, 25 seconds, 154k tokens — it returned `moved`, and the pin re-pointed
without a reset. The stored snippet is now `const unmatched = new RouteNotFoundError(...)` with a new
fingerprint, `status: active`. It recognised the guard in a form it had never been shown.

`HANDOFF.md` used to say A4 rested on an assumption nobody had tested — that a reviewer's evidence
points at a line actually containing the guard. Run 3 answered the pinning half; run 5 answers the
escalation half. **Both are now measured.**

Also established here:

- **The ratchet advanced again, 98 → 102 ids**, across a run that reset nothing.
- **The panel converged: 5 findings, then 4, then 3.** No run had ever shown findings *decreasing*
  across iterations. The feedback loop demonstrably reduces them rather than churning.
- **0.45.0's assumptions bar held live.** One assumption in three iterations, and it is a real fork —
  whether "address these findings" means change the behaviour or confirm an already-documented
  limitation — with measurements cited. Compare run 3's *"Response headers not specified"*.
- **The builder documented unmet requirements honestly** rather than faking them: *"these stay as
  honestly-documented unmet requirements, the same treatment PRD-4.1's latency clause already
  receives"*. That is the anti-satisficing behaviour the design is for, in the builder's own words.
- **0.49.0 proved itself immediately.** The log lived at `~/dare-logs/run5.log`, outside the tree, and
  survived complete with its terminal state — the thing run 4 lost.
- It did **not** ship, which is correct.

Cost: **$32.64** for three iterations, 37.4M tokens.

### The panel audited the operator, and was right

The best single piece of evidence this project has that the reviewer *verifies* rather than trusts,
and it caught the person running the experiment rather than the builder.

While staging case F, this session ran `git rm --cached run.log run4.log` and `git add -A` in one
command, then wrote a commit message saying the logs had been untracked. The panel's finding, twice:

> `run.log` and `run4.log` are tracked at HEAD (`git ls-files --error-unmatch run.log run4.log`
> succeeds) even though `.gitignore` lists `*.log`, and commit `e14bee6`'s message claims 'Also
> untracks run.log and run4.log' — **it did not.**

It **read the commit message, disbelieved it, and ran a command to check.** The cause is exactly what
it implies: `.gitignore` did not yet carry `*.log` at that moment — the driver appends that at run
start — so `git add -A` re-staged both files immediately. It also grepped the contents for
credentials before rating the finding `[trivial]`, which is the difference between a severity and a
guess. Fixed for real in `eac0185`.

**And it bears on §1.1.** The findings reference `git ls-files` and a commit message, never
`.dare/briefs/` or the build log. So on this evidence the cold reviewer is working from the
repository, which is the intended surface — but note what the repository contains: commits titled
`dare: iteration 1`. The reviewer can therefore infer an agent wrote the code. That is exactly the
*not supplied* rather than *sealed* distinction §6.1 draws, now with an observation behind it.

## Run 4: case E passed on every criterion. The ratchet reset a real run.

**The mechanism the whole design exists for has now run end to end, in a live run, and done the
right thing.** Not a fixture, not a hand-driven check — the driver did it.

What was staged: a return value broken from outside the run (`body: row.body` → `body: ''`),
committed, ceilings as run 3.

What actually happened is better than what was staged:

| criterion (`DOGFOOD.md` case E) | result |
|---|---|
| `bloopers.log` names the regressed id and a diff stat | **yes** — one record, iteration 2, with a 17-file diffstat |
| the run performs a hard reset to `lastGoodCommit` | **yes** — `reflog`: `reset: moving to 14f6c95` |
| the next brief's objective is the regression, *"Restore the tests listed below"* | **yes** — `iter-003.md`, verbatim, plus *"the ratchet is monotonic and 1 test(s) that passed earlier no longer pass, so the tree was reset to the last commit that held them"* |
| nothing else proceeds that iteration; no reviewer called | **yes** — `iter-003.md` has a `### Regressions` section and **no Audit findings section at all** |

**The regression it caught was not mine.** The builder repaired my injected one in 99 seconds during
iteration 1 — worth knowing, since Phase 2 builds before Phase 4 ratchets, so an injected regression
gets offered to the builder first. Then in iteration 2 the builder broke
`tests/pdf.unit.test.js::pdf fit algorithm > throws ExportCapacityError when titles are too wide for
the forced column count` **on its own**, while editing `src/pdf/render-titles.js`, and *that* is what
the ratchet caught. An organic regression is stronger evidence than an injected one.

**And the ratchet advanced inside a run for the first time: 93 → 98 ids.**

Also observed, each for the first time:

- **The reality-check breaker ran and was right.** `.dare/reality-check.md`: *"**unbuildable** — but
  precisely one clause of one requirement is, and everything else is already built and green"*, with
  98/98 tests passing, having driven the real server over HTTP. It isolated `PRD-4.1` by measurement.
- **0.40.0 changed builder behaviour.** The blooper's diffstat shows `playwright.config.js | 10 -`
  — the builder **deleted** the browser scaffolding once `ci` stopped demanding it, and rewrote
  `ci.yml`. That is the oscillation ending.
- **0.44.0 held**: no `installed chromium` line anywhere in run 4.
- It did **not** ship (exit 1), which is correct.

### The defect that nearly hid all of this

`run4.log` ends mid-run with no terminal state, and the driver exited 1 having printed nothing after
the reviews. The log was not truncated by a crash — **the hard reset reverted it.** The operator's
`> run4.log` lived inside the repository because this project's own `DOGFOOD.md` said to, `git add -A`
tracked it, and the reset restored its content as of `lastGoodCommit`. The blooper's own diffstat
records the wound: `run4.log | 16 -` and `run.log | 50 -`.

Worse than losing 16 lines: git **replaces** the file rather than truncating it, so the shell's open
descriptor was left pointing at an unlinked inode and **every line written after the reset went
nowhere.** Iterations 2 and 3 produced no visible output at all, and run 4's terminal state is
unrecoverable — it had to be reconstructed from `.dare/`, `git log` and the reflog.

Fixed at 0.49.0 by ignoring `*.log`, so the log is never tracked and the descriptor survives, and
`DOGFOOD.md` now says to keep the log outside the tree. The general rule is the one to remember:
**anything left in the working tree is subject to `git add -A` and to a hard reset.**

## Run 3 finished, and it found three gates the builder could not satisfy

```
BUDGET: iteration limit reached: 3 of 3
iterations: 3  tokens: 39555536  cost: $22.7225  passing: 93
```

**It did not ship, which is the correct outcome** — `PRD-4.1` is deliberately impossible, so
`SHIPPED` would have been the serious bug. The panel ran in iteration 1 and refused with five
findings, and the ratchet held 93 ids.

But the ratchet **never advanced past iteration 1**, and the reason is the finding of the session:

```
iteration 2 → gates failed: mutation, ci, gate-integrity
iteration 3 → gates failed: mutation
```

**All three of iteration 2's failures were defects in this plugin, and the builder could not have
fixed any of them.** Each is now fixed, each with the evidence in its commit message:

| gate | why it could not pass | fixed |
|---|---|---|
| `mutation` | Stryker resolves runner plugins relative to its own install; `npx` put that in the npx cache where `@stryker-mutator/vitest-runner` is invisible. Uncaught crash, **no project could ever pass** | 0.43.0 |
| `ci` | required a Playwright step on a project whose `e2e` gate had just been declined as inapplicable | 0.40.0 |
| `gate-integrity` | walked `.stryker-tmp`, the sandbox the crashed mutation gate left behind, and failed on 22 files that do not exist in the tree | 0.42.0 |

**The clearest single piece of evidence this project has produced.** Run 2's panel found the CI
e2e step was green by construction. Run 3's builder obeyed it and removed `continue-on-error: true`
— and then the `ci` gate failed for missing e2e, so iteration 3 put the step back as
`npx playwright test --pass-with-no-tests`, which on a project with no browser tests is *also*
green by construction. **The builder was oscillating between two of our own gates**, and neither
position could satisfy both. Verified in that repo's git history, not inferred.

Two more things it established: `.dare/assumptions.json` reached `[2, 2, 4, 2, 2]` — four entries
labelled iteration 2 from two different runs (fixed 0.41.0) — and `installed chromium for the e2e
gate` appears in the log **on a project whose e2e gate does not apply**, which is the Playwright
provisioning seam §4.2 already flags as ungated, now observed rather than predicted.

**The next wall was `break: 100`, and it is now closed at 0.47.0 with `break: 60`.** It demanded a
*perfect* mutation score on every changed file. First measurement, only possible once the gate could
run at all: **83.33** on one two-branch function with two honest tests, failed by an
`EqualityOperator` survivor no correct suite need kill — an unsatisfiable gate, the same shape as the
three above. Both directions of the new floor are measured: the honest suite passes at 83.33, and a
suite asserting only `typeof x === 'number'` scores **16.67 and fails**, naming the threshold. See
`DESIGN.md` §4.4. If you move it, record what you measured.

## Two of today's fixes verified live, in the first thirty seconds of run 4

Both from `run4.log` and the tree beside it, on a real repository rather than a fixture:

```
added dare machine state to .gitignore
archived the previous run to .dare/runs/003
```

- **0.48.0's ignore repair fired.** That repository's stanza already contained
  `.dare/state.json`, which is exactly the case the old all-or-nothing check reported as
  "covered" — so under the previous build nothing would have been appended and `pins.json` would
  have stayed trackable forever. `.gitignore` now carries `.dare/pins.json` and
  `.dare/assumptions.json`.
- **0.41.0's archiving fired.** `.dare/runs/003/` holds `assumptions.json` beside `briefs/` and
  `run.json`, and the live `.dare/assumptions.json` is **gone**, so this run's reviewers cannot be
  handed run 2's and run 3's assumptions. That was the defect: five entries, four of them labelled
  iteration 2, from two different runs.

## The ratchet caught a real regression, against a real 93-id state, for free

**The mechanism the whole design exists for has now fired on real data.** Not a temp repository
built by the test suite — run 3's actual `.dare/state.json`, run 3's actual application, and a real
`vitest` run.

Method, and it cost nothing: back up one source file, change a **return value** (`body: row.body`
→ `body: ''`, which is what `DOGFOOD.md` asks for — regress the code, not the test), run the real
unit gate, and hand the real report to `extractTestIds` and `evaluateIteration`. No children were
spawned, so no money was spent.

```
ratchet holds: 93 | now passing: 96
REGRESSIONS  : 2
   ✗ tests/notes.contract.test.js::…PRD-1.2: Unicode and leading whitespace round-trip byte-for-byte
   ✗ tests/notes.contract.test.js::…PRD-1.2: reading a note by id returns exactly the title and body it was created with
action : reset
target : f20434d262e38c8a52b6b9d1693cfeffaf563fd3
reason : 2 tests that previously passed no longer pass. The ratchet is monotonic: nothing else
         proceeds until they are restored.
```

**The number that matters is 96 against 93.** Run 3's builder had added five tests, so *more tests
were passing than the ratchet had ever held* while two protected ones were broken. Any check
comparing counts, or comparing "did the suite get better", reports an improvement here. The set
difference is what caught it. That is precisely the failure monotonicity exists to prevent, and it
had never once been exercised against real data — every previous test of it used ids the test suite
had invented.

`formatRegressionTask` produced the literal objective (*"Restore these tests… Change nothing else.
Do not add features, do not refactor"*) and the blooper record named both ids and the iteration.

**Still unverified, and it is the part that needs money:** the driver's *orchestration* of this —
the actual `git reset --hard` to that target, `bloopers.log` being written to disk, the regression
brief reaching a live builder, and no reviewer being called that iteration. That is D2 case E, and
the repository is ready for it: the tree was restored **byte-identical** afterwards and its suite is
98 of 98 green, so the 93-id ratchet and `lastGoodCommit` are intact.

## Tier 3 ran for the first time, and found a template defect in eight tests

`DARE_LIVE=1 npm run test:live` had been written and never executed. First run: **7 of 8**, and the
failure was not the harness. Given a requirement stating its status code, its exact body, and the
words *"Nothing about this requirement is ambiguous"*, a live builder still emitted:

```
ambiguity: 'Response headers not specified'
assumed:   'Content-Type: application/json is required; no authentication required'
```

**The observation is true and recording it is still wrong.** `templates/builder-system.md` already
said "Emit no block at all if nothing was ambiguous", and that was not enough, because a detail the
document omits genuinely *is* unstated — the model was being accurate, not lazy. What was missing
was a bar: **would a competent engineer reading this text have chosen differently?** `404 or 410`
for an expired link is a fork; the Content-Type of a json body is not.

Fixed at 0.45.0 with that bar and both halves of the example, then **re-run live: 8 of 8**. The
half that proves it discriminates rather than mutes is the *other* live test, which requires an
assumption to be emitted for a genuine fork and still passes.

Why it matters beyond tidiness: this log is handed to the cold panel. A log of unstated-but-obvious
details buries the one entry that mattered, and §8.3's whole value is that a reviewer can check
"you assumed X, the PRD says Y".

## Two traps, both of which nearly cost this session

1. **The install cache is stale.** `installed_plugins.json` says **0.34.0**; the tree is 0.50.0.
   Anything run from the cache exercises code sixteen versions old — including before the
   red-evidence deadlock fix and all four of this session's gate fixes. Either `/plugin update` +
   `/reload-plugins`, or invoke `node <repo>/scripts/driver.mjs` directly as this session did.
   Check the pinned `gitCommitSha` before debugging anything.
2. **A green suite proves less than it looks.** Every defect this session found was invisible to
   1,378 passing tests, and each one was found by reading a real artifact: the failing brief named
   three gates, `.dare/assumptions.json` explained *why* the builder faked a CI step, and the
   dogfood repo's git history showed it oscillating. Prefer looking at a produced artifact over
   adding an assertion.
3. **The dominant defect class in this codebase is a gate the builder cannot satisfy**, and it has
   now bitten six times: `e2e` failing a CLI forever, the red-evidence deadlock, `ci` demanding a
   browser, `gate-integrity` on another gate's debris, `mutation` unable to load its runner, and
   `break: 100` demanding a perfect score. **They do not look like failures — they look like a
   builder that will not comply.** When an iteration fails the same gate twice, check whether the
   objective is satisfiable *before* reading the builder's work.
4. **Do not edit `templates/*.md` while a run is in flight.** `builderSystemPrompt` reads the
   template from disk on **every child**, so a template edited mid-run reaches the next builder and
   the run stops being the experiment you started. `scripts/*.mjs` is safe by accident — Node loaded
   those at startup — which makes the hazard easy to miss, because the obvious-looking edit is the
   harmless one. Land template changes between runs.
5. **A structural test can match the wrong text and report coverage it does not have.** This
   session wrote one that passed with the very call site it guarded reverted, because the source
   line contained the word it grepped for in a different call. Verify such a test by breaking the
   thing it protects and watching it fail.

## What is outstanding

`BRIEF.md` statuses are the resume point and are current. Nothing in Tier 1 or Tier 2 remains.

| item | state |
|---|---|
| ~~**D2 case E — deliberate regression**~~ | **PASSED in run 4, on every criterion.** Reset performed, blooper written, regression brief issued, no reviewer called. The regression it caught was the builder's own, not the injected one |
| ~~D2 case F — security regression~~ | **PASSED in run 5.** The escalation child ran for the first time, returned `moved`, and the pin re-pointed with no reset |
| D2 cases A, B, C | prepared in `DOGFOOD.md`, not run. Note the whole D2 set now has two passes behind it, so these are breadth rather than risk |
| `removed` / `unknown` pin verdicts | **still unobserved, and need a different PRD** — one whose security element is off the tested path, since a load-bearing guard regresses before Phase 4b is reached. `DOGFOOD.md` case F |
| A8 carry optimisation | **do not start without reading the pin finding below.** `PRD-3.1` is pinned to a *test file*, which the carry would let a source regression slip through |
| A3 held-out oracle | deferred behind D2 and B2's driver-owned test invocation |
| C5 differentiated race candidates | cheap, but ordered behind a live test of a `claude -p` child in a race worktree |
| architect toolchain declaration | **residual of B3, half closed at 0.46.0.** The ambiguity is no longer silent: a tree matching both reports `also matched dotnet (…) - first match wins`. The declaration itself is still the real fix, and an operator could not ask for it while the ambiguity was invisible |
| ~~mutation provisioning~~ | **closed at 0.43.0, and it was worse than A5 recorded.** Installing the runner locally would not have helped — Stryker looks beside its own install, not the project's. Both packages now go into one npx sandbox |
| ~~`break: 100` mutation threshold~~ | **decided and closed at 0.47.0: `break: 60`.** Both directions measured — an honest suite scores 83.33 and passes, a suite asserting only `typeof x === 'number'` scores 16.67 and fails. `DESIGN.md` §4.4 |
| ~~Playwright provisioning not capability-gated~~ | **closed at 0.44.0.** `installed chromium for the e2e gate` had been logged one line after `gate e2e does not apply`. `ensurePlaywrightBrowsers` now declines when the gate does not apply; omitting capabilities still provisions, since under-provisioning fails a gate that *does* apply |
| ~~`assumptions.json` run attribution~~ | **closed by 0.41.0's archiving, and this row was stale.** The file is in `PER_RUN_ARTIFACTS`, so a new run moves the previous one's to `.dare/runs/NNN/` before writing its own — the cross-run collision cannot occur. Verified against run 10's log, whose entries are `1, 1, 4, 5, 6`, all from one run. The *within-run* duplicate (two entries at iteration 1) is a builder emitting two cited assumptions in one child, which is correct behaviour |
| `gate-integrity` vs a vacuous branch | **confirmed by probe, and deliberately not fixed.** It passes both the `continue`-past-the-assertion shape and `test('asserts nothing', …)`. The first is the coverage question and belongs to the mutation gate; the second is detectable but would fail legitimate `does not throw` and helper-based suites. `DESIGN.md` §4 |
| lesson extractor is unverified | **partly closed at 0.54.0.** A lesson can no longer invent a gate — run 6's falsehood is now discarded by name. Claims about the *watched project* are still unverified, which is the half that remains |
| **nothing verified the suite that shipped** | **top of the list.** `seenFailing: []` and the mutation gate declined on the shipping iteration, so neither mechanism that proves a suite can fail was present. Should `SHIPPED` require at least one of them? |
| **a pin that should never have existed** | `DoD-2-security` pinned an argv branch. Escalation handles moved/removed/unknown; there is no retraction path, so under monotonicity it is permanent |
| reviewer remit for silent wrong answers | **operator decision.** D1 discards data at exit 0 and no gate can see that class. Widening the panel's remit changes what done means |
| ~~A9's tier-3 check~~ | **run for the first time, and it earned itself immediately.** 8 tests; on the first execution 7 passed and one found a real template defect (below). Fixed at 0.45.0, re-run live, 8 of 8 |

## A finding about the generated app, not about the plugin

Run 3's panel found a real bug in the dogfood application: `toRenderableText` substitutes `?` for
any character outside cp1252, so non-Latin note titles vanish from the PDF export — and the
builder's own fixture says `'漢字' is deliberately excluded`. That belongs to
`~/dare-dogfood/rejection`, not here. It is recorded because it is the best evidence this project
has that the cold reviewer catches satisficing.

---

# Verification status

The build is finished, and the architecture iteration this file used to list as deferred is
now implemented — reviewer ownership, the Build Brief, lesson memory, advisory findings,
behavioural gates, conditional history and stalled-only racing. See `DESIGN.md` for why each
one is shaped the way it is.

What follows is the one thing the test suite cannot settle: whether the pieces work against
reality.

---

## The ratchet advanced, and the panel refused to ship — 11 August 2026, run 3

**Everything the design exists for worked, in one run, for the first time.**

```
ratchet: 93 ids, iteration 1
review outstanding: 5 finding(s)
```

- **The ratchet advanced.** 93 test ids protected. It had never once advanced in a real run.
- **The cold panel ran** — all three reviewers, ~200s and 0.6–1.2M tokens each.
- **It refused to ship**, with five findings, and the findings were fed back: the next brief grew
  from 16,022 to 31,562 characters.

**It caught the impossible requirement by measuring it, not by reading the docs.** On `PRD-4.1`
(sub-millisecond HTTP on a cold process) it opened raw `node:net` sockets against three freshly
spawned processes and reported **7.596 / 7.321 / 7.946 ms**, then wrote: *"No faking was found …
Honest reporting does not convert an unmet requirement into a met one."*

**And it found a real defect nobody else had.** On `PRD-2.1` it created notes titled `漢字ノート`
and `emoji 🚀 title`, called the export endpoint, extracted page text with `pdfjs-dist`, and got
`"Notes (3)  ????? emoji ? title Plain title"` — two of three titles absent, because
`toRenderableText` substitutes `?` for anything outside cp1252. Then the part that matters most:
it noticed `tests/export.contract.test.js` says `'漢字' is deliberately excluded`. **The builder
hand-picked its fixture around its own bug, and the cold reviewer caught it.** That is the exact
satisficing this architecture was built to defeat, observed rather than theorised.

It also found a gate that could not fail — `npx --yes playwright test` under
`continue-on-error: true`, *"a step that always reports success by construction"* — design docs
contradicting each other and the shipped router on the endpoint surface, and one **major**
advisory: unpinned remote code execution in CI, outside the `npm ci` dependency tree and the
`npm audit` result, in a job holding the repository checkout and workflow token.

Nothing about the reviewer prompt was changed for this. §1.1's bet — that a cold, hostile,
separate-process auditor with no build log outperforms the builder's own judgement — is now
**measured**.

## Five more findings, read out of run 3's `.dare/` while it was still running

Free. No spend, nothing in that repository touched — `cat` on the machine state while iteration 2's
builder was mid-flight. Three of the five close questions this file has carried for days.

### The `ci` gate demanded a browser step from a browserless project (fixed 0.40.0)

`toolchain.ci` (`scripts/toolchains/node.mjs`) required `/\bplaywright\b/` **unconditionally**, so
on this `api, persistent-storage` project the loop declined the `e2e` gate with its full written
reason, printed it to the operator, and then failed the `ci` gate for not running that same step.
Run 2's log shows it: `gates failed: quality:semgrep, ci, observability`. **No honest workflow
could satisfy it.**

The builder did not stall. It complied, and wrote down why — `.dare/assumptions.json`:

> *"the brief's own `e2e` gate says a CLI/library/API project has no applicable e2e … yet the `ci`
> gate wants the workflow to run an e2e step regardless"* → *"added an `e2e` step to ci.yml running
> `npx playwright test` … marked `continue-on-error: true`"*

Run 3's cold panel then reported that step as **"a step that always reports success by
construction"**. The loop manufactured the defect it caught, and every component behaved as
designed while doing it. This is the `e2e`-fails-a-CLI-forever bug from item 5, surviving one level
down because that fix filtered the gate *table* and not the CI *command list*.

Fixed by filtering the required operations through the same `gateApplies` table, with the dropped
requirement named in the gate detail. `DESIGN.md` §4.2. Nine tests. Two notes:

- **Omitting `capabilities` filters nothing.** A caller that forgets over-applies CI rather than
  silently dropping a required step — and `[]` is a different statement from `undefined`, so both
  are asserted.
- **The first structural test was a fraud and is worth the warning.** The wiring is unreachable
  from a unit test (`gateTree` is inside `main`; `driveRun` takes `gates` injected), so a grep test
  guards the call site. Version one asserted the *source line* contained `capabilities` — and
  passed with the call site reverted, because `applicableGates(staticGates(dir, { run: shell }),
  capabilities)` still contains the word. It now balances parentheses to isolate the call's own
  arguments, and was verified by reverting the call site and watching it fail. **A structural test
  matching the wrong text reports coverage it does not have.**

### A4's foundation holds — a live reviewer produced a real pin

This file said no pin had ever been created by a real reviewer, and that A4 silently protects
nothing if evidence lands on blank lines. `.dare/pins.json`:

```
"id": "DoD-2-security", "evidence": "src/http/router.js:266",
"snippet": "throw new RouteNotFoundError(`no route for ${method} ${path}`);"
```

Real executable code, fingerprinted — not a signature, not a blank line. **Weak but not wrong**,
exactly the outcome predicted. And **Case F's precondition is satisfied for the first time**:
`pins.json` is non-empty, so the security-regression scenario is now runnable.

### F4 holds — `lessons.json` filled with a condition, not a generality

The standing instruction was to read it after a real run and **delete it if it had filled with
generalities**. It has not. One lesson, `uses: 1`, `introduced: 1, resolved: 3`, triggers
`console.log`, `json.stringify`, `logger.js`, `observability`, `structured logging` — concrete
tokens that appear in the failure it came from. That instruction does not need executing.

### A8 is now blocked on a hazard, not only on ordering

`PRD-3.1`'s requirement pin is evidenced by **a test file**: `tests/perf.test.js:49`. Requirement
fingerprints cover the whole evidenced file, so the source that satisfies the requirement can
regress while `tests/perf.test.js` sits untouched, the fingerprint holds, and the requirement is
not re-litigated. Harmless today because A8's carry half is unbuilt — the fail-closed half only
fires when the target stops resolving. **Decide the test-file-evidence case before building the
carry.**

Second reason to doubt the saving: three of five requirement pins cite `src/http/router.js`, the
busiest file in the tree, and all three therefore share one fingerprint. On this project the carry
would invalidate almost every iteration and save nearly nothing.

### `.dare/assumptions.json` cannot say which run an entry came from (unfixed)

It is carried across runs but keyed by `iteration`, and iteration numbering restarts every run. It
currently holds run 2's `iteration: 2` and `iteration: 4` entries, and run 3's `iteration: 2` will
land beside them indistinguishably. **Same defect shape as the brief collision C2 fixed**, in a
file C2's carried-forward list never covered. Left alone deliberately — it is its own slice.

One more thing that file records, worth checking: iteration 4's entry is the builder discovering
that `tests/boundary.test.js`'s import-edges test *"could never fail regardless of its imports"*
for leaf files, and adding a real assertion so red-evidence was satisfiable. `gate-integrity` bans
weak matchers; whether it can catch an assertion-free branch is **unverified**.

## Verified live

**Guard hook fires under a real PreToolUse event.** With the plugin installed, a command
writing to the ratchet state file was denied and tagged `[dare:protected-state]`, while a
command merely mentioning the slash command in prose ran normally. Both halves matter: a
guard that blocks everything is not a guard.

**`claude -p` children spawn and return parseable output.** Verified against claude
2.1.226. `--output-format json` returns an envelope carrying `result`, `is_error`,
`total_cost_usd` and a `usage` breakdown; `parseClaudeEnvelope` reads those field names, and
budget accounting uses the reported figures rather than an estimate. A trivial prompt cost
$0.26 because of cache creation, which is why nothing here estimates.

**Children do not inherit the operator's output style.** A child asked only for a field of
`package.json` answered in the persona the operator had active. Every child is now launched
with an explicit default style — for the reviewer that is a correctness fix, since its
output is machine-parsed.

**`extractTestIds` against live reporter output.** A real vitest run with one passing, one
failing and one skipped test yielded exactly the one passing ID.

**Install path works end to end.** With the caveat that cost several hours: the install
cache is keyed by version, and stale copies masquerade as failed fixes. See "Releasing" in
`CLAUDE.md` before debugging any plugin change.

**`--allowedTools Read Glob Grep Write Edit` does permit writing.** A live child given
exactly that flag set created a file with the Write tool. The permission model was never in
doubt; see below for what actually was.

**PreToolUse hooks inherit the environment of the `claude` process.** A child spawned with
`DARE_RUNNING=1` fired a hook that read `DARE_RUNNING: "1"` from `process.env`. This is what
lets the guard tell a run from an operator, so it was measured rather than assumed.

**The guard denies live, unscripted commands.** Not fixtures: during this session it refused
a recursive `rm` whose target was an unresolved shell variable, and refused a command
touching `.dare/config.json` from inside a run.

**A cold reviewer's output parses, and an incomplete build draws a `fail`.** One live
`claude -p` child on `claude-opus-5`, given `templates/reviewer-system.md` and the driver's
own review prompt, pointed at a genuinely half-finished build: 124s, 430335 tokens, $0.83.
It returned `"verdict": "fail"`; `parseReviewerReport` consumed it without throwing; the
four ids it was handed came back as exactly those four and no others; evidence carried
`file:line` (`src/parse.js:81`, `src/parse.js:72`, `package.json:7`); and one advisory came
back in the documented shape rather than as prose. It failed the one requirement that was
genuinely unbuilt — the CLI binary — and passed the three that were done.

Worth recording *how* it audited, because the prompt is doing the work: it re-ran the code
with `node -e` and said so — "verified by direct execution, not by trusting the suite" —
rather than reading the tests and agreeing with them. That is the behaviour
`templates/reviewer-system.md` exists to produce, and it is now observed rather than hoped
for.

**The token ceiling stops at the first child past the line.** It was previously read only by
`shouldContinue`, between iterations, so a single iteration could run arbitrarily far past
the limit before anything looked — an observed run ended `2100900 of 1000000`. Every child's
spend is now charged and tested the moment it returns, which bounds the overshoot to one child.

> **Corrected 11 August 2026 by the first case-D dogfood run. This paragraph was wrong twice.**
>
> It said "at all six sites". There were **eight** — the PRD and design phases run in `main`,
> before `driveRun` exists, and were never charged at all. A design child spent 2,965,864 tokens
> against a 2,000,000 ceiling while the airtime counter reported the full budget remaining.
> Fixed at 0.35.0 via `alreadySpent`; both pre-loop phases are now charged, and checked between
> each other.
>
> And "budget for the ceiling plus one expensive child" understated the overshoot badly enough
> to mislead. Measured: **one builder child returned 20,223,215 tokens against a 2,000,000
> ceiling** — 10×. The check fired correctly and ended the run at once, so the mechanism is
> sound; the *expectation* it set was not. Read `tokenCeiling` as "stop once this is exceeded",
> never as "do not exceed this", and expect a single child to overshoot by an order of
> magnitude. `DESIGN.md` §3.5 now says this in those terms.

**The loop has met reality.** On 10 August 2026, twice, against two throwaway repositories
with different PRDs. Preflight passed ten checks and scaffolded config; the run added its
machine state to `.gitignore`, authored or accepted a PRD, wrote design documents under
`docs/`, committed each phase, and the builder produced source and tests. Neither run
shipped, and the reason is recorded below — but the pipeline itself is no longer theoretical.

**`parseNumstat` agrees with git's own arithmetic.** Run against this repository's own
`git diff --numstat HEAD~1 HEAD`, it returned 13 files and 554 lines; `git diff --shortstat`
independently reported "13 files changed, 531 insertions(+), 23 deletions(-)". Small, but it
is the difference between a parser tested against text someone typed and one tested against
the program that produces it — which is the lesson recorded at the bottom of this file.

**The unit gate only collects vitest, and that used to be unsaid.** Both runs independently
built correct `node:test` suites, declared `"test": "node --test"`, and drew
`No test suite found in file …` from `npx vitest run --reporter=json` — a report of zero
tests. `extractTestIds` then correctly returned nothing, `driveRun` correctly rejected the
iteration with the `no-tests` objective, and the ratchet correctly refused to advance. Every
component behaved as designed; the run still could not progress, because the builder was
never told which runner the gate collects with while `templates/builder-system.md`
simultaneously told it to use whatever tools it liked. Fixed in 0.7.0 at the template and in
the `no-tests` brief. Worth noting what this was *not*: not a silent failure. The rejection
was detected, logged and fed back. What was missing was the one fact needed to act on it.

## Outstanding

**A run that reaches the panel, and a ratchet that catches a real regression.** The first
real runs died before either. Both stopped in iteration 1 with `passing: 0`, so no id ever
entered the ratchet, no reset was ever reachable, and the reviewers were never called. The
regression behaviour is the reason the whole design exists and it has still only ever been
exercised against temporary repositories built by the test suite. With the runner mismatch
fixed, this is the next thing a run should be able to demonstrate — give it enough budget to
reach a second iteration.

**A phase still cannot tick, but it now says so.** Children run under `execFileSync`, which
blocks the event loop for the whole call, so a periodic heartbeat is impossible without
making the driver async — a rewrite, not a fix, and not attempted. Every child is instead
bracketed by two unstyled lines: `<phase>: <model> running, no output until it returns`
before, and `<phase>: returned after Ns, N tokens` after. That converts nine and a half
silent minutes from "possibly hung" into "expected, and here is what it cost". If the async
conversion is ever done for other reasons, a real tick becomes available for free.

**A real race — but only the builder half is left.** `race.enabled` is still `false` by
default. As of 0.18.0 the git half is covered by tier 2 against real git: detached worktrees at
the base commit, `worktree list` clean after removal, names reusable by a later race,
`--ff-only` fast-forwarding, and `--ff-only` *refusing* a diverged commit rather than inventing
a merge. `parseNumstat` is cross-checked against git's own `--shortstat`, including a real
binary file.

What remains untested is a real builder inside a worktree — cost, duration, and whether a
`claude -p` child behaves the same detached from a branch. Turn racing on knowingly against a
throwaway repository first, and check `git worktree list` afterwards anyway.

~~**A real health probe.**~~ **Closed on 11 August 2026 by tier 2.**
`test/integration/health-probe.integration.test.mjs` points `probeHealth` at a real
`npm start` — a shell running npm running a script running a server, then torn down again —
and covers the named failure mode: an application that ignores `PORT` now fails the probe
rather than hanging. It also proves the teardown, by probing the same app twice and requiring
the second to succeed. What is still untested is a probe against an application this loop
actually generated, rather than one written to be probed.

---

# Planned work — making the harness stack-agnostic

Specified on 11 August 2026. The `.dare/**` integrity item from the same plan was implemented
in 0.10.0. On 11 August 2026 **items 1, 2, 3, 5, 6, 7 and 8 were implemented** — item 1 in
0.11.0 and 0.12.0, item 6 in 0.13.0, item 3 in 0.14.0, item 2 in 0.15.0, item 5 in 0.16.0, item
7 in 0.17.0, item 8 in 0.18.0; see below. **Items 4 and 9 remain, and both are blocked on
something other than effort.**

- **Item 4 (.NET adapter)** — `dotnet` is not installed on this machine, re-checked on
  11 August 2026. The adapter interface (§3.8) is ready for it: write
  `scripts/toolchains/dotnet.mjs`, push it onto `TOOLCHAINS`, and the existing contract tests
  apply to it automatically. Do not write it without an SDK to verify the command syntax
  against; the registry tests will pass on argv nobody has ever run.
- **Item 9 (dogfood runs)** — spends real money and wants an operator awake to watch it. The
  two valuable scenarios are still the deliberate rejection and the deliberate regression, and
  neither has ever been exercised end to end. **`DOGFOOD.md` now carries every scenario as an
  executable script with exact commands, expected terminal states and the evidence to collect.**
  It was written on 11 August 2026 and **not run**; the session that wrote it was not permitted
  to spend. Run `DARE_LIVE=1 npm run test:live` first — a few cents against a four-hour run, and
  a broken output contract found there is found sixty seconds in rather than four hours in.

Everything else below is recorded for the same reason it always was: so the next session does
not re-derive it.

## Blocker, still standing

**`dotnet` is not installed on the development machine.** No SDK, no runtime; re-checked on
11 August 2026. A .NET adapter can be written and contract-tested against injected runners —
and as of 0.15.0 the contract tests would apply to it the moment it joins `TOOLCHAINS` — but
its command syntax cannot be verified locally, and a .NET dogfood run is impossible.

That gap is now *more* dangerous than when it was written, not less, because the registry makes
a wrong adapter easy to add and green. Every structural test would pass on argv nobody has ever
run. Either install an SDK before starting that item, or write it with every command explicitly
marked unverified and say so here. Do not let unverified command strings acquire the appearance
of tested ones.

## The seams, located

Read these before designing anything; several are smaller than they look.

- ~~**Gate commands are one function.**~~ Extracted by item 2 into `scripts/toolchains/`.
- ~~**A second Node assumption lives in CI inspection.**~~ Reconciled by item 2. Both now come
  from the resolved toolchain, and a test holds them together.
- ~~**Test-report normalisation already exists.**~~ Extracted by item 3. `detectRunner`,
  `parseReport` and `collapseByWorstStatus` now live in `scripts/reporters/index.mjs`, and the
  `Runner` union there is still the thing to widen. Do not weaken the throwing behaviour to
  accommodate a new format.
- ~~**Capability detection has a nucleus.**~~ Closed by item 1. `hasFrontend` now lives in
  `scripts/capabilities.mjs` as the `web-ui` detector, with its behaviour and its tests
  unchanged.
- **Web assumptions beyond the gates — mostly closed, one left.** `startCommand` is now the
  toolchain's (item 2), and the observability gate no longer fires at a CLI or a library
  (item 5). What survives is the **Playwright provisioning path**:
  `playwrightConfigPresent` and `ensurePlaywrightBrowsers` still key off `playwright.config.*`
  and the `.dare/playwright-installed` marker, both of which are Node-specific and neither of
  which passes through the toolchain. A second toolchain with a different e2e runner will find
  it, and it belongs behind an operation on the adapter.

  **It was not harmless, and the note above said it was.** "Provisioning is a no-op until there is
  a config to provision for" is true and was the wrong question: run 3 logged `installed chromium
  for the e2e gate` one line after `gate e2e does not apply`, because a config existed for a reason
  unrelated to any browser — the `ci` gate was demanding a Playwright step from a browserless
  project. Capability-gated at 0.44.0. The Node-specificity is what remains.

## Items, in dependency order

1. ~~**Project capability manifest.**~~ **Done — 0.11.0 (`scripts/capabilities.mjs`, vocabulary
   and detection) and 0.12.0 (declaration, manifest, brief).** See `DESIGN.md` §3.7. Three
   decisions taken while building it that the plan did not anticipate:
   - **`library` has no detector, deliberately.** `main` and `exports` appear in nearly every
     application manifest, so a detector firing on them reports a guess as evidence. The
     absence is exported as `UNDETECTABLE` so the next reader does not "fix" the gap.
   - **The design-slop gate still keys off detection, not the manifest.** §5.1's carve-out asks
     "is there something to inspect", which is a question about the tree. A declared `web-ui`
     that has not been written yet is still nothing to look at.
   - **The manifest reached the Build Brief first and the gates later.** As shipped in 0.12.0
     it decided nothing; item 5 (0.16.0) is what made it load-bearing.
2. ~~**Toolchain adapter interface.**~~ **Done — 0.15.0.** `scripts/toolchains/`, with the Node
   adapter reproducing the six commands exactly; a test asserts the full argv, not just the
   names, which is what makes "behaviour-neutral" checkable. `DESIGN.md` §3.8. Four decisions:
   - **`restore` is in the contract but is not a gate.** `npm ci` deletes `node_modules`; running
     it every iteration would add minutes and change behaviour. The slot exists because a
     toolchain that cannot express it cannot describe .NET or Rust.
   - **The CI contradiction is closed structurally, not once.** `CI_REQUIRED_COMMANDS` is gone;
     each toolchain declares its own patterns, and a test asserts every pattern matches the
     command string its own operation produces. `node --test`, `jest`, `npm test` and `cypress`
     no longer satisfy CI, which is stricter — deliberately, since that leniency is exactly
     what let the 10 August runs look CI-clean while collecting zero test ids.
   - **Detection falls back to Node rather than refusing.** Iteration 1 has no `package.json`.
     When a second toolchain lands, that default stops being obvious and should become an
     architect declaration confirmed by detection, exactly as capabilities did.
   - **`commandGates` now takes `(root, dareDir)`.** It needed the root to resolve a toolchain,
     and deriving it as `dirname(dareDir)` would have been true today and quietly wrong later.
3. ~~**Reporter registry.**~~ **Done — 0.14.0.** `scripts/reporters/` now holds `shared.mjs`
   (id shape, status normalisation, `ReportFormatError`), one module per format, and
   `index.mjs` as the registry. Behaviour-neutral: every existing extraction test passed
   unmodified. Adding a runner is a new module, one push onto `REPORTERS`, one widened union,
   and nothing in `ratchet.mjs`. Two things worth knowing:
   - **`extractTestIds` stayed on the ratchet**, and that is the boundary: reporters answer
     "what tests does this report contain", the ratchet answers "which statuses count". Mixing
     them is how `flaky` would end up admitted.
   - **New tests assert the registry's own invariants**, not just parsing — unique names, a
     complete contract per entry, and disjoint detectors. The last one exists so that if a
     future format is a superset of another, first-match-wins becomes a decision someone makes
     on purpose rather than inherits.
4. **.NET adapter and TRX normalisation.** Subject to the blocker above.
5. ~~**Capability-driven gates.**~~ **Done — 0.16.0.** `scripts/gate-policy.mjs`, a table with a
   written reason per entry. `DESIGN.md` §4.2. What it actually fixed is worth stating: `npx
   playwright test` ran on every project, so a CLI or library failed the e2e gate on a missing
   config forever and **could never clear Phase 3 at all**. Three decisions:
   - **Only `e2e` and `observability` are conditional.** A test asserts that list as a whole,
     because each addition is a gate some project stops being checked by, and that should be
     hard to do by accident.
   - **An unknown gate runs.** Over-applying is recoverable; a silently missing gate is not.
     A completeness test built from the real toolchain registry catches the omission instead.
   - **Capabilities for a raced candidate come from the main tree.** Same argument as the
     ratchet in §13.6: a candidate must not choose which gates judge it.
6. ~~**Race candidate selection.**~~ **Done — 0.13.0.** Ties now break on lines changed, then
   files changed, then candidate index, measured by a new `parseNumstat` over
   `git diff --numstat`. Still deterministic; no model judgement anywhere near it. One thing
   the plan did not call: a binary file counts as a changed file with zero changed lines, so
   this measure understates a large asset swap. That is recorded in `DESIGN.md` §13.6 and in
   a test rather than papered over, because inventing a line count for a blob would be worse
   than admitting there is not one.
7. ~~**Run manifest.**~~ **Done — 0.17.0.** `scripts/run-manifest.mjs`, written once after the
   design phase — the first moment every field exists. `DESIGN.md` §7.1. Three notes:
   - **"Contents never decide" is enforced, not just asserted.** There is no reader function,
     and a test greps `scripts/` for one. No code path can consult the file, which is a
     stronger guarantee than any amount of care.
   - **A failed version probe contributes no key.** Recording `"unknown"` would put a string in
     the manifest that reads like a version and is not one.
   - **It needed no new guard rule**, which is the 0.10.0 positional protection paying off
     exactly as predicted — `guard.test.mjs` had already listed `.dare/run.json` as a
     hypothetical, and the hypothetical came true without a code change.
8. ~~**Integration-test layer.**~~ **Done — 0.18.0.** `npm test` (tier 1), `npm run
   test:integration` (tier 2, real `git`/`node`/`npm`, no money), `npm run test:live` (tier 3,
   spends money). `DESIGN.md` §11.1, `CLAUDE.md` "Test gates". Three notes:
   - **Tier 2 earned itself on its first execution**, finding a `git` on this machine too old
     for `--initial-branch`. That is precisely the class of fault a unit test cannot see.
   - **Tier 3 fails when unarmed rather than skipping.** A green tick for a suite that made no
     API call is a lie the reader takes for coverage, and this codebase does not get to refuse
     silent passes everywhere else and then ship one in its own harness.
   - **`npm test` no longer globs `test/**`.** It is `test/*.test.mjs`, so tiers 2 and 3 do not
     ride along on the default command. A new unit test must go in `test/` directly.
9. **Dogfood runs.** A web/API app, a Node app with persistence, a .NET service, a deliberate
   rejection scenario and a deliberate regression scenario. The last two are the valuable ones,
   and neither has ever been exercised end to end.

   Two things changed underneath this item on 11 August 2026 and should shape how it is run.
   A CLI or library target can now actually finish (item 5) — before, the e2e gate failed it
   forever — so the scenario set need not all be web. And `.dare/run.json` (item 7) means each
   dogfood run leaves a record of exactly what it was, which is the difference between five
   runs and five comparable runs. Give the regression scenario enough budget to reach a second
   iteration; both earlier attempts died in the first one with `passing: 0`, so the ratchet was
   never reached at all.

## Constraints carried from the same plan

Do not add reviewers, memory systems, planning agents, orchestration frameworks, vector
databases, MCP dependencies for core execution, or another framework layered over this one.
Prefer extraction to rewriting. Prefer several committable states to one large change.

---

# Dogfood run — 11 August 2026, case D (deliberate rejection)

The first dogfood run this project has performed since 10 August, and the first ever against a
budget an operator set deliberately. Throwaway repository, PRD written to contain one genuinely
hard requirement (`PRD-2.1`, a real text-layer PDF export under 200 kB) among easy ones, so
that **success means the run does not ship**.

Plugin verified at `0.34.0` / `1ff1ac3` in `installed_plugins.json` before starting, with the
cache confirmed to physically contain `trx.mjs` and `dotnet.mjs`. That check is not ceremony:
the loader is keyed by version and a stale copy is indistinguishable from a wrong fix.

## The finding: `tokenCeiling` does not count Phase 0 or Phase 1

**This is a defect in a safety limit, and it was found in the first twelve minutes.**

```
design: returned after 737s, 2965864 tokens
...
100 PERCENT OF OUR BROADCAST DAY REMAINS. STAY TUNED.
```

The design child spent **2,965,864 tokens against a 2,000,000 ceiling**, and the airtime counter
reported the full budget remaining. It is not a rendering fault. The structure is:

| line | what | charged? |
|---|---|---|
| `driver.mjs:2349` | `runChild` — PRD authoring (Phase 0) | **no** |
| `driver.mjs:2375` | `runChild` — design (Phase 1) | **no** |
| `driver.mjs:1045` | `charge()` — the entire budget accounting | inside `driveRun` |
| `driver.mjs:2701` | `driveRun({…})` is finally called | — |

Both pre-loop phases run in `main`, before `driveRun` exists, and check only `result.ok`.
`driveRun` then begins its own accounting at `spentTokens: 0` with the **full** ceiling
available again.

**This file's own claim was false.** It said: *"Every child's spend is now charged and tested
the moment it returns, at all six sites, which bounds the overshoot to one child."* That is true
of the six sites inside `driveRun` and untrue of the two outside it — and the design phase is the
single most expensive child in the pipeline, so the uncounted half is the expensive half.

Consequence for an operator: a run configured for 2M tokens can spend 2M **plus** an entire PRD
and design phase, plus the documented one-child overshoot. Observed here as roughly 5M against a
stated 2M. `DESIGN.md` §3.5's warning to "budget for the ceiling plus one expensive child" is
therefore also understated.

**Fixed at 0.35.0**, by the second route: `driveRun` takes `alreadySpent` and seeds `progress`
and `costUsd` from it, so there is still exactly one accounting path. `main` charges each
pre-loop child as it returns and **checks between the two phases**, so the overshoot there is
bounded to one child exactly as it is inside the loop. A ceiling exhausted by the design phase is
not an early return: `driveRun`'s own `shouldContinue` ends the run `BUDGET` on its first pass,
*after* the run manifest is written, so the operator still gets the artifact they were promised.

Six tests, and the two that matter are the ones asserting *which* limit fired rather than merely
that the state was `BUDGET` — exhausting `maxIterations` is also `BUDGET`, so the broader
assertion passed for the wrong reason on the first attempt and had to be tightened.

The outcome now reports the real total, which is the half an operator actually reads: the closing
`iterations: 0 tokens: … cost: …` line previously understated the bill by the most expensive
child in the pipeline.

**Nothing about this required the run to finish**, which is worth noting on its own: the most
valuable result of the session's first dogfood arrived twelve minutes in, from reading two log
lines against the code.

## A cost ceiling, because tokens are not money (0.37.0)

The same measurement that produced the overshoot finding produced a second one: **20,223,215
tokens cost $9.4345** — $0.47 per million, because cache reads dominated the count. At uncached
input rates that token figure would have cost an order of magnitude more. **No token number can
be converted into a bill**, so `tokenCeiling` bounds work and cannot bound spend.

`costCeiling` (default $50) is checked on every child alongside `tokenCeiling`, reading the
envelope's own `total_cost_usd` rather than estimating from a rate card — the same reason nothing
else here estimates. `spentUsd` moved into `RunProgress`, because a limit the loop cannot read is
not a limit; it had been a bare `let` in `driveRun`. `airtimeRemaining` now reports the tightest
of iterations, tokens and money, so the counter names the limit that will actually end the run
rather than the most flattering one.

**On a subscription neither ceiling is the binding constraint**, and the codebase already knew
that before this session: `EXHAUSTION_PATTERN` tells a rate-limited child from a failed one,
`landCleanly` **commits the work in progress**, and the run ends `BUDGET` stating it can resume. A
stalled allowance is not a failed build. That path is unit-tested and has still never fired
against a real rate limit.

## The second finding: one child can be ten times the ceiling

```
builder: returned after 1435s, 20223215 tokens
BUDGET: token ceiling reached: 20223215 of 2000000
iterations: 0  tokens: 20223215  cost: $9.4345  passing: 0
```

**A single builder child spent 20.2 million tokens against a 2 million ceiling.** The check
itself worked exactly as designed — `charge()` fired the moment the child returned and ended the
run — so the mechanism this file describes is confirmed working *at the sites it covers*. What
is not confirmed is the conclusion drawn from it.

This file said: *"Budget for the ceiling plus one expensive child."* That reads as a modest
allowance. Measured, "one expensive child" was **10× the entire ceiling**, and there is no
mechanism that could have stopped it: nothing prices a child before running it, and a `claude -p`
call has no token limit the driver can set. For small ceilings `tokenCeiling` is therefore not a
budget at all — it is a *stop signal that fires after the fact*, and the smaller the ceiling the
less it means.

The honest statement, now that Phase 0 and Phase 1 are counted: **a run can cost the ceiling plus
one unbounded child, and that child can be an order of magnitude larger than the ceiling.** An
operator setting 2M should expect the possibility of 20M+. This is not fixable by accounting —
nothing prices a child before running it, and `claude -p` takes no token limit the driver could
pass — so it is a property to be stated rather than a bug to be closed. `DESIGN.md` §3.5 now says
so in those terms instead of "budget for the ceiling plus one expensive child".

## What the run did establish, live, for the first time

| thing | evidence |
|---|---|
| preflight | 9 checks passed; failed correctly on `danger-acknowledged` until `--yes` |
| `.dare/run.json` (§7.1) | written complete — plugin `0.34.0`, real tool versions, **no `"unknown"` anywhere** |
| capability declaration (§3.7) | architect declared `api, persistent-storage`; run aborted-free |
| capability-driven gates (§4.2) | `e2e` skipped with its full written reason, on a project with no browser |
| toolchain resolution (§3.8) | `node (file package.json)` |
| **C4 prompt measurement (§3.9)** | design 5,314 chars; builder 16,050 chars — the first real figures this project has ever had |
| **F1 chaos-1 text** | reached the builder verbatim in `iter-001.md` |
| **B6 guidance** | rendered — and carried a duplicate heading, see below |
| guard hook | denied this session's own Bash containing the slash command, unscripted |

The builder produced a plausible application — 10 source files, **6 test files**, and a
`package.json` whose `lint`, `build` and `typecheck` scripts run real work rather than `true`.
It was building `src/pdf/render-titles.js`, i.e. genuinely attempting `PRD-2.1`, when the budget
ended the run.

## The third finding: B6's guidance rendered a duplicate heading

`iter-001.md` contained:

```
## Building this with node

## Building this with Node
```

`brief.mjs` added a heading *and* the fragment supplied its own. **No test caught it because
both halves were individually correct.** Fixed at 0.35.0, with a regression test asserting
exactly one `## Building this with` heading. This is the smallest finding here and the best
argument for the exercise: it is invisible to unit tests by construction, and obvious in one
glance at a real artifact.

## The fourth finding: red-evidence made the greenfield objective unsatisfiable (fixed 0.38.0)

Found **without spending anything**, by running the abandoned run's own gates by hand and then
simulating the gate against the real report.

The builder's application passes `build`, `lint`, `typecheck` and **83 of 83 tests** — verified
by running them. It also did **not** stub `PRD-2.1`: `src/pdf/render-titles.js` is a genuine
`pdfkit` implementation with a one-page fit search over font sizes and column counts, cp1252
representability handling for the standard Helvetica font, `doc.text` so the output is selectable
rather than an image, and a thrown `ExportCapacityError` when titles genuinely cannot fit. It
pulled in `pdfjs-dist` as a dev dependency to *verify* the text layer. **`PRD-2.1` was not a
trap; case D did not test rejection.** That is a finding about the scenario, not the loop.

Then the real one. Simulated against the actual 83 ids:

```
red-evidence gate ok: false | status: 1
detail: never observed failing, so unproven: <all 83>
```

With no `previousPassing` and no `redSeen`, every id is unproven, the gate fails, and the
objective handed back is *"make these gates pass"* — which the builder **cannot satisfy**,
because it cannot make an already-green test have been red in the past. Four iterations of that
ends `STALLED`. At ~20M tokens per builder that is ~80M tokens to reach a conclusion derivable
for free, and **it means no greenfield project whose tests pass first time can ever clear Phase
3** — the primary use case, and the same shape as the `e2e`-fails-a-CLI-forever bug item 5 fixed.

**Fixed at 0.38.0** with a first-gating baseline: the ids present the first time a project is
gated are recorded once in `.dare/red-evidence.json` and admitted, the gate *reports how many*
rather than claiming a clean pass, and everything added later still needs red history. Verified
against the real 83 ids — gate passes, and adding one further test fails naming only that one.

It is a real weakening and the guard is named rather than assumed: `gate-integrity`'s assertion
check and the conditional mutation pass both catch fake tests without needing history. Nine
tests, including one kept deliberately asserting the *old* failing behaviour so a later reader
can see what was wrong.

# Dogfood run 2 — 11 August 2026, case D with an impossible requirement

Same repository, the first run's output committed as a baseline, plus `PRD-4.1`: sub-millisecond
HTTP on a cold process, which cannot be satisfied. Ceilings raised to 4 iterations / 80M tokens
/ $200. Run from the **working tree at 0.38.0**, not the install cache, which was still 0.34.0 —
the trap `CLAUDE.md` warns about, nearly walked into.

```
iterations: 4  tokens: 16521006  cost: $10.9031  passing: 0
```

## Verified live for the first time

| thing | evidence |
|---|---|
| **C2 archiving** | `archived the previous run to .dare/runs/001`, containing `briefs` and `run.json` |
| **the 0.36.0 budget fix** | `95 PERCENT OF OUR BROADCAST DAY REMAINS` after the design phase. It said **100%** last run |
| **Phase 3 gates executing** | `gates failed: quality:semgrep, ci, observability` — never observed before |
| **the 0.38.0 red-evidence baseline** | iteration 1's red-evidence **passed**; without it, it would have failed on all 83 |
| **A5's conditional second pass** | `gate mutation declined: no first-party source changed since the last ratchet-advancing commit` |
| **B5 capability gating** | `gate e2e does not apply` with its full written reason |
| **the lesson extractor** | ran against a live child, which this file previously recorded as never having happened |
| **the cost ceiling** | did not fire — $10.90 of $200 — and the run ended on the iteration limit, correctly named |

Four iterations, against zero on the previous attempt. The pipeline reached further than it ever
has.

## The finding: red-evidence deadlocks the ratchet, and always has

**`seenFailing: 0` after four iterations.** Not one test was ever observed failing.

That is not an accident of this project; it is what a builder that writes code and tests in the
*same child* always produces. By the time gates run, the tests pass. So:

- `unproven = passing − previousPassing − redSeen − baseline`
- `previousPassing` is empty, because the ratchet has never advanced
- the baseline covers iteration 1 only
- every test added in iteration 2 or later is therefore **permanently** unproven
- red-evidence fails → the iteration fails → **the ratchet cannot advance** → `previousPassing`
  stays empty → forever

**It is circular.** Advancing the ratchet requires every gate to pass; red-evidence is a gate;
red-evidence can only pass once the ratchet has advanced. The 0.38.0 baseline moved the wall by
one iteration rather than removing it.

**And it explains every run this project has ever performed.** 10 August, twice, and both runs
today: all four ended `passing: 0`. The runner mismatch explained the first two. This explains
all four, and it means the ratchet — the mechanism the whole design exists for — **has never
once advanced in a real run.**

Worse, the loop's only escape is perverse: delete the new tests. Then `passing` collapses to the
baseline and the gate passes. A design built to stop Goodharting has an incentive gradient
pointing at deleting tests.

## The fix is a return to the specification, not a weakening

`DESIGN.md` §8 has always said: *"a test that has only ever been green is treated as unproven and
**doesn't count toward the ratchet**."* It does **not** say the gate fails the iteration. The
implementation made it blocking, and blocking is what deadlocks.

The spec's version is self-consistent: an unproven test earns **no ratchet credit**, which is the
deterrent — a fake green test cannot inflate the protected set — while the iteration proceeds.
`gate-integrity`'s assertion check and the mutation pass cover the shape.

**Implemented at 0.39.0.** `redEvidenceGate` reports and no longer blocks; a new `unprovenIds`
withholds those ids from the passing set `gateTree` returns, so they earn no ratchet protection.
Verified on the real 83 ids plus one added later: **83 of 84 credited**, the new one withheld and
named, and the gate does not block. Four tests changed from asserting the old blocking behaviour
to asserting the withholding, and one new test asserts red-evidence **never** blocks whatever it
finds — the deadlock in a single line.

**Not verified:** no run has yet advanced the ratchet. The change makes it possible; only a run
proves it. That is the next thing to do, and for the first time the path to the panel is clear
on paper: iteration 1 credits its baseline, the ratchet advances, later iterations proceed with
new tests uncredited but unblocking.

## What the run did NOT establish

**Case D's actual question is still unanswered.** The run died in iteration 1 on budget, so the
gates never ran, the ratchet never advanced (`passing: 0`), and **the cold panel was never
called**. Whether review is genuinely fail-closed against a stubbed `PRD-2.1` remains exactly as
unproven as it was on 10 August — for a new reason, but unproven.

Still never observed: any gate executing, any test id entering the ratchet, a hard reset, a
reviewer verdict, a pin, an assumptions block, the mutation gate, `.dare/runs/NNN/` archiving.

**To answer case D, the budget defect has to be fixed first.** With Phase 0 and Phase 1
uncounted and a single builder capable of 20M tokens, no ceiling an operator sets is
meaningful, and every further scenario risks the same death before the interesting part.

---

# Brief items — what was actually verified

`BRIEF.md` is the work list and carries the statuses. This section carries the *evidence*, in
the same shape as the rest of this file: what ran, and what did not.

Every entry below was gated with `npm run lint && npm run typecheck && npm test` before it was
committed, and `npm run release-check` after the version bump. Where an item says something is
unverified, that is not a hedge — it is the thing to test next.

## A1a — the protected-state rule, stated positionally (0.19.0)

**Verified.** `templates/builder-system.md` and `scripts/brief.mjs` both state the rule as the
directory rather than as a list of names. Three unit tests hold it: the compiled brief and the
builder template each assert that no `` `.dare/<name>.json` `` literal appears at all, so
re-introducing an enumeration fails the suite rather than merely reading oddly; and one test
pairs the rendered brief against `isProtectedStatePath` from the hook itself, showing that
`.dare/red-evidence.json` is named nowhere in the wording and denied anyway. That is the tie
worth having — the documented rule and the enforced rule are now the same rule, and a test
fails if they drift apart.

**Not verified.** No live builder child has read the new wording. The claim the item rests on —
that the weaker rule cost an iteration the first time a builder tried something the guard denied
— was never measured and is not measurable retrospectively; both real runs died in iteration 1.
The tests assert the presence and absence of *substrings*, which is a proxy for a model
understanding the rule, not evidence of it. A dogfood run is what would settle it.

## A2 — driver-owned and not supplied (docs only, at 0.19.0)

**Verified — and mostly found already built.** Both properties A2 asked to have tested were
already tested before the item was read. `test/guard.test.mjs` proves a driver-owned path is
denied to a run, allowed to an operator, and that names merely resembling one are untouched.
`test/plugin-manifest.test.mjs` proves the hook matcher excludes the read-only tools, which is
the whole of what keeps `.dare` readable — the reading half is enforced by the hook never firing,
not by any branch in `guard.mjs`. `Task` was added to that exclusion list, since a subagent reads
files and stopping at `Read`/`Glob`/`Grep` is the enumeration the item argues against.

**What was actually missing was the writing.** `DESIGN.md` used "driver-owned" seven times and
defined it nowhere, and had no word at all for the weaker thing. §6.1 now defines both, says why
there is no third classification called *sealed*, and states the threat model that makes the
absence tolerable: these defences are aimed at satisficing, not at an adversary, and against
satisficing an artifact the builder was never handed is sufficient.

**One finding that was not on the item's list.** §1.1 said the reviewer "does not receive the
build log, iteration history, or any hint that an agent wrote the code" in a voice that reads as
enforced. It is not enforced. A read-only reviewer child working in a repository that contains
`.dare/briefs/iter-003.md` can open it; nothing stops it. That is now labelled *not supplied*,
with the note that the framing is what does the work.

**Not verified.** Nobody has checked whether a cold reviewer ever *does* read `.dare/briefs/`.
It would be visible in a transcript and no transcript has been examined for it, because no run
has reached the panel more than once. If a dogfood run shows a reviewer reading the briefs, the
cold-review invariant is weaker than §1.1 has ever claimed and this is where to look first.

## C4 — the context budget (0.20.0)

**Verified.** `scripts/context-budget.mjs` measures the assembled input inside `spawnClaude`,
before the child exists. 26 new unit tests cover the two ways such a check goes wrong: failing
to fire, and firing and then quietly repairing the problem. Exactly-at-limit passes and
one-over fails, so the boundary is asserted rather than assumed. Four driver-level tests prove
the important half — that an over-budget prompt results in the injected runner being called
**zero** times, so nothing is spent, and that the system prompt is counted alongside the user
prompt (a budget measuring only the user prompt would miss the frontend-direction fragment
appended to every builder on a UI project).

**A real defect surfaced by its own tests.** `options.limit ?? DEFAULT` treated `null` as
"caller had nothing to say" and silently substituted the default. A check that repairs a
malformed configuration on the run's behalf is the failure it exists to catch, arriving through
the door marked "config". Now `=== undefined`, so `null` reaches validation and throws.

**Not verified — and this is the important one.** *The number has never been calibrated against
a real run.* The 400,000-character default is reasoned from a ~200k-token window at a
conservative three characters per token; it is not measured, because no run has ever reported
its prompt size — the measurement did not exist until now. The first dogfood run will print a
real figure on every child, and **that is the moment to check whether the default is sensible
or nonsense.** It may prove far too generous to catch the degradation it targets. Do not treat
400,000 as validated.

Also unverified: whether growth actually occurs the way `BORROWED.md` R4 predicts. Every list
in the Build Brief is capped, so the plausible growth vector is raw gate output in a failure
`detail`, and nobody has watched that happen. The `childStartLine` figure across iterations is
the evidence to collect.

## A6 — truthiness-only assertions fail a gate dare runs (0.21.0)

**Verified.** 31 new tests in `test/integrity.test.mjs`, following this repository's rule that
every deny is paired with a benign neighbour. Denied: all five matchers, the negated
`not.toBeNull()`, single-argument `assert(x)` and `assert.ok(x)`, and a nested call read as one
argument. Allowed and asserted allowed: `toBe`, `toEqual`, `assert.equal`, `assert.deepEqual`,
`assert.match`, a two-argument `assert(x, message)`, a Playwright matcher the gate has never
heard of, `toHaveLength`, a helper merely *named* `myassert`, an argument-less `assert()`, and
a comment mentioning the forbidden matcher. `integrityGate` is asserted end to end: a
repository fails on `toBeTruthy()` and the same repository passes once the assertion names a
value.

**Not verified.** No generated application has been scanned. Every fixture is a string this
session wrote, which means the false-positive analysis is *reasoned*, not *observed* — the
file-classification heuristic (`*.test.*`, `*.spec.*`, and the five test directory names) has
never met a real project's layout. A project putting tests beside source under a different
convention gets no coverage from this gate and will not be told so, which is the silent half
worth watching for. The first dogfood run is what would show it.

**A known and deliberate gap.** The check reads only test files, so a builder that moves a weak
assertion into a helper under `src/` escapes it entirely. That is accepted: scanning
application source would fail correct repositories for defensive `assert(config)` calls, and
this module's whole philosophy is that a false positive costs a full iteration on a correct
repository while a false negative costs nothing that the reviewer was not already covering.

## A7 — properties in the builder contract (0.22.0)

**Verified.** The section exists and four tests hold its shape: the heading and its argument
survive; no property-testing library is named, so a build cannot come to depend on a package
this plugin neither installs nor gates; and the "do not invent an invariant" clause is present,
without which the instruction reads as "always write properties".

**Not verified, and this is the whole of the item's value.** Whether a builder handed this
paragraph actually writes properties, and whether those properties are harder to satisfice in
practice than the example tests they replace, is a claim from `BORROWED.md` R6 that no run has
tested. It is a template change: the only evidence that could exist is a generated test suite,
and none has been generated since the section was written.

## F2 — per-requirement right-sizing in the PRD author (0.23.0)

**Verified.** Three tests: the section survives, both halves of the example pair survive
(a rule with only good examples does not tell the author where the line is), and the
justification is tied to the `one verdict object per id` contract rather than to taste.

**Not verified.** No PRD has been authored since. Whether a model actually splits "add
authentication" into a dozen ids when told to, or merely renumbers, is exactly the kind of
claim a template change cannot settle from inside the test suite. The signal to look for on a
dogfood run is a PRD whose requirement count is much higher than earlier runs produced — and
if it is not, the rule needs a harder constraint than a paragraph.

## F4 — lesson triggers as conditions (0.24.0)

**Verified.** Four tests hold the new section: the reframed question, the self-check against
the supplied evidence, the statement that a vague trigger is worse than none *because it passes
validation*, and both columns of the worked example pair. `scripts/lessons.mjs` was not
touched, as the item predicted — its validation already fails closed on the half it can see.

**Not verified, and this is the item that most needs a real run.** This file's whole purpose is
the thing `HANDOFF.md` has recorded as unprovable by the test suite: whether the store fills
with conditions or with generalities. The instruction to test each trigger against the supplied
evidence is now in the prompt; nothing has checked whether a model *does* it. The procedure is
unchanged and still the right one — **read `.dare/lessons.json` after the first real run, and
delete it if it has filled with generalities.** What is new is that there is now a specific
thing to look at: whether the trigger words appear verbatim in the failure the lesson came from.

## F1 — surgical discipline at chaos 1 (0.25.0)

**Verified.** Three template tests and two brief tests. The important one is positional rather
than textual: it asserts the surgical rule appears *before* the chaos-2 entry, so a later edit
promoting it to unconditional text fails the suite instead of merely reading wrong. The others
assert chaos 2 and 3 stay permissive, that the two chaos-independent bullets landed in the
general sections rather than on the dial, and that `chaosLine(2)` does not carry the chaos-1
sentence.

**Not verified.** Whether tighter chaos-1 wording actually narrows a builder's diff is
unmeasured and unmeasurable from here — it needs two runs at the same chaos level with the same
PRD, before and after. `BORROWED.md` R2 also claims this sharpens the race's line-churn metric
by making candidates more distinguishable; racing has never been run with a live builder, so
that remains a prediction.

## F3-reduced — the observable-outcome note (0.26.0)

**Verified.** Two tests, one per paragraph: that the RED connection is stated, and that the
refusal to rewrite requirements into builder instructions is stated in the template itself.
The second is the one worth having — it records the rejected transformation *beside the rule*,
so a later reader meeting F3's original wording finds the refusal already written down rather
than re-deriving it.

**Not verified.** Whether requirements were already being phrased this way, and therefore
whether the note changes anything at all, is unknown: only two PRDs have ever been authored and
neither was examined for phrasing. This may be a no-op that documents a correct existing habit.
That is an acceptable outcome for a paragraph, and it is stated here rather than claimed as an
improvement.

## B1-residual — PRODUCT.md owns audience, capabilities.json owns shape (0.27.0)

**Verified, and mostly found already correct.** Nothing in `scripts/` referenced `PRODUCT.md` —
checked by grep before anything was written — and `architect.md`'s instruction for the file
already named no capability. The overlap the item anticipated had never been created.

What landed is the *enforcement* of a rule that was true and unstated. A test walks the whole
`scripts/` tree and fails if any shipped module so much as names `PRODUCT.md`, in the same shape
and for the same reason as the run manifest's no-reader test. A second test extracts the
architect's `PRODUCT.md` row and asserts it contains none of the ten capability names, so drift
in the other direction is caught too.

**Not verified.** No `PRODUCT.md` has ever been generated and read back — Phase 1 has produced
design documents on two runs, but nobody has inspected what the architect actually wrote into
that file. If it has been quietly including capability-shaped prose all along, these tests do
not see it: they constrain the *instruction* and the *readers*, not the artifact. Read a
generated `PRODUCT.md` on the first dogfood run.

## C2-archiving — the previous run is kept (0.28.0)

**A real defect was found, not just a feature added.** Iteration numbering lives in the
driver's in-memory `progress`, initialised to zero at the top of every run, and never read from
`state.json`. So every run wrote `.dare/briefs/iter-001.md` over the last run's, then
`iter-002.md`, and so on. Briefs were being destroyed one file at a time, silently, because the
replacement looked exactly like the original. Both written accounts of this — "state is
replaced per run" and "briefs accumulate" — were wrong in opposite directions.

**Verified.** Nine tests. The one that matters simulates three consecutive runs each writing
`briefs/iter-001.md`, and asserts all three bodies are recoverable afterwards from `runs/001`,
`runs/002` and `runs/003` — that is the collision, reproduced and then shown fixed. Others
assert the carried-forward artifacts (`state.json`, `lessons.json`, `red-evidence.json`,
`bloopers.log`, `config.json`) are **not** archived, since archiving `state.json` would
silently reset the ratchet; that a first run creates no empty `runs/001`; that slots come from
the highest existing number so deleting one cannot cause an overwrite; and that a directory an
operator renamed is ignored rather than fatal.

**Not verified.** No real run has archived anything — every fixture is a temp directory this
session built. In particular the driver-side wiring (`archivePreviousRun` called once in `main`
before `ensureDareIgnored`'s successor lines) is covered only by the unit tests of the function
itself, not by an end-to-end run, so *when* it fires has not been observed. Two runs in
succession against a throwaway repository would settle it and cost nothing but time.

## A4 + A8 — pinned security elements and pinned requirements (0.29.0)

**A4 verified, mechanism and wiring.** `scripts/pins.mjs` plus a `security-escalation` phase.
47 unit tests on the mechanism and 8 on the driver. The wiring tests are the ones that matter,
because they assert behaviour a unit test of the module cannot: a quarantined element makes a
run with a **unanimous panel** not ship; the same run ships once nothing is quarantined (the
benign neighbour — a block that never lifts is a stall, not a gate); the reviewer is asked
**zero** times while the cheap check still finds the guard; a `moved` verdict re-pins to the
new file and does not block; an unparseable escalation quarantines rather than resetting; and a
run holding pins with no way to read the tree **aborts** rather than carrying them forward.

Finding worth recording: the first version of those tests all failed, because the default test
harness reports zero test ids, the ratchet correctly rejects that, and Phase 4b is below the
ratchet. Every component behaved as designed — which is the same shape as the 10 August runs,
and a reminder that "the code never ran" and "the code failed" look identical from a red tick.

**A8 partly built, and the split is deliberate.** Built: the shared mechanism, the store,
invalidation on any change to the evidenced file, and the fail-closed half — a requirement whose
evidence target no longer resolves overrides the panel's verdict *downward*. Not built: asking
the panel only about un-carried ids. That is the saving, and A8's own correction says to order
it after the dogfood runs — the cost premise was false, no run has reached the panel twice, and
"review becomes the dominant cost" is a prediction. **The DoD line "a cold-reviewer-passed
requirement is not re-litigated until its evidence changes" is therefore not met.**

**Not verified, and there is a lot of it.**

- **No pin has ever been created by a real reviewer.** Every pin in every test was constructed
  by the test. Whether a security reviewer's `file:line` evidence actually points at a line
  containing the guard — rather than at a function signature, a route declaration or a blank
  line — is the assumption the whole of A4 rests on, and it is untested. If evidence commonly
  points at a declaration rather than a check, pins will be weak but not wrong; if it points at
  blank lines, `pinSecurityElement` refuses and A4 silently protects nothing.
- **The escalation child has never run.** Its prompt and its JSON contract are unexercised
  against a live `claude -p`. By this repository's own rule that is a tier-3 candidate, and it
  is a strong one: the argv defect lived in exactly this gap.
- **The default panel yields at most one security pin.** `ownership.security` is
  `['DoD-2-security']`, one id, one `file:line`. Pinning one guard per run is thin protection
  against a paper describing gradual erosion across ten rounds. A richer contract — the
  reviewer listing several defensive elements — is the obvious extension and is a reviewer
  output-contract change, so it needs the same tier-3 treatment as A9.
- **No run has exercised a `removed` verdict end to end**, so the security hard-reset path has
  never fired outside a unit test.

## A9 — the assumptions log (0.30.0)

**Verified at tier 1.** 41 tests. The parser's three outcomes are each asserted: an absent block
is not a failure, a malformed block is, and an uncited entry is discarded and *counted*. Five
driver-level tests carry it end to end — a cited assumption reaches `.dare/assumptions.json`, an
uncited one does not, a builder that says nothing about assumptions still ships, a malformed
block stops the iteration, and **the reviewer is called zero times on that iteration**. The
template's own example is fed through the real parser, so an obedient builder cannot fail its
iteration on the block it was told to emit.

**Not verified, and this is a tier-3 gap by the repository's own rule.** This is a new output
contract whose behaviour another binary owns — the precise category that produced the argv
defect, where `claudeArgs` was unit-tested, correct, and wrong about what the other program did
with it. **No live child has ever emitted an assumptions block.** Every string the parser has
seen was written by this session.

`test/live/assumptions-contract.live.test.mjs` is written and **has never been run**. It covers
the two things tier 1 structurally cannot:

1. whether a real builder emits json at all where the template asked for it, and
2. whether it emits a block on **every** iteration because being asked implies an expectation.

The second is the more dangerous, and it is `lessons.mjs`'s named failure arriving by a new
door — except this store reaches the reviewer. Run:

```
DARE_LIVE=1 npm run test:live
```

Expect a few cents and under a minute. If a block appears where nothing was ambiguous, the fix
is the template, not the parser.

**Also unverified:** whether a reviewer handed the log actually uses it — that is, whether "you
assumed X, the PRD says Y" ever appears as a finding. That needs a run reaching the panel with
a non-empty log, which is a dogfood scenario rather than a live test.

## A5 — the conditional gate pass and mutation testing (0.31.0)

**Verified structurally, and — unusually for this session — the external command was verified
by running it.** B3's rule is that a registry makes a wrong adapter easy to add and green, so
Stryker 9.6.1 was installed into a scratchpad fixture and driven before any argv was written
down. What that produced was not a confirmation but a **correction**:

- `stryker run --help` exposes `--dashboard.*` and **no `--thresholds.*` flag whatsoever**.
- `thresholds.break` defaults to `null`. **A run with surviving mutants exits 0.**
- Measured: a two-function fixture with two surviving mutants exited **0** with no config, and
  exited **1** with `{"thresholds":{"break":100}}`, logging *"Final mutation score 66.67 under
  breaking threshold 100"*. A second run with a comma-separated two-file `--mutate` exited 1
  with three survivors.

So the item as written — "surviving mutants on changed code fail the gate" — would have shipped
a gate that could not fail, and the config that decides it would have been the builder's. The
driver now writes `.dare/stryker.config.json` and passes it positionally; §6 keeps it out of
reach. **That correction is the most valuable thing this item produced, and it came from
running the binary rather than reading about it.**

13 tests: the conditional list asserted as a whole and asserted disjoint from the first pass;
the full argv; tests excluded from mutation; an empty changed set declining with a reason;
`changedSince` measuring from the ratchet-advancing commit, returning empty with no baseline
and **not consulting git at all** in that case, and returning empty when git fails.

**Not verified, and one of these is blocking.**

- **Provisioning is not wired, and this is the blocker.** The command assumes
  `@stryker-mutator/vitest-runner` is installed in the target project. Nothing installs it.
  Playwright browsers have `ensurePlaywrightBrowsers`; mutation has no equivalent. On a project
  without the plugin the gate fails on a missing runner rather than on a defect — which is
  exactly the `e2e`-forever-red failure that item 5 fixed for a different gate, reintroduced
  here. **Fix this before arming mutation on a real run.**
- **The second pass has never run in a real driver loop.** `gateTree`'s ordering is covered
  only indirectly; no test drives a first pass to green and observes the second start.
- **Cost is unmeasured.** Mutation testing on a real generated application could take longer
  than every other gate combined, and nothing bounds it. The fixture here was two functions.
- **The builder still owns `vitest.config`**, so it still decides which tests run and therefore
  which mutants can be killed. That is the same pre-existing hole the unit gate has, not a new
  one, but mutation makes it louder: a narrowed test config raises the surviving-mutant count
  rather than lowering it, so the failure is at least in the safe direction.

## B3 — the .NET adapter, and the blocker that lifted (0.32.0)

**The blocker is gone.** `dotnet 8.0.423` was installed on 11 August 2026. Every earlier note
in this file saying "dotnet is not installed" is now historical.

**Verified by execution, not by reading.** This file warned for two versions that the registry
makes a wrong adapter *easy to add and green*, because the contract tests check that an
operation returns a command and not that the command does anything. So the adapter was written
against a scaffolded solution — class library plus xunit test project — and every command was
run first. **Two would have been wrong.**

1. **`dotnet list package --vulnerable` cannot fail.** Given `System.Net.Http 4.3.0` it printed
   a High advisory (`GHSA-7jgj-8wvc-jh57`) and **exited 0**. As `security-audit` it would have
   passed every vulnerable .NET project forever. Replaced with
   `dotnet restore --force -warnaserror:NU1901,NU1902,NU1903,NU1904`, verified exit 1 with
   `error NU1903` and exit 0 once the package was removed.
2. **A near-miss worth more than the fix.** The first attempt used `-p:WarningsAsErrors=NU1901,…`,
   which MSBuild rejects with `MSB1006: Property is not valid` — **and that rejection also exits
   1**. It was briefly recorded here as working. What caught it was running the *clean* project
   through the same command and getting a failure there too.

**The generalisable finding:** this is the same shape as §4.4's Stryker threshold — a tool that
reports the problem and does not fail on it — found independently in a different ecosystem
within an hour. Treat it as the default rather than the exception. **Any new adapter's audit
step should be assumed unable to fail until it has been seen to exit non-zero on a real
finding, and its benign neighbour seen to exit zero.**

Also verified: `dotnet build` exit 0; `dotnet format --verify-no-changes` exit 0 clean and
**exit 2** on damaged whitespace; `dotnet test --logger trx` exit 0 with 2 passed 1 skipped and
exit 1 with a failure; `dotnet run --project` exit 0 on a console project.

Declined by name rather than guessed: `types` (the compiler subsumes it), `e2e` (no browser
runner in the SDK), `mutation` (Stryker.NET is a separate tool, not installed, **not verified,
therefore not written**).

**New ambiguity, and it is the residual of this item.** `detectToolchain` returns the first
match and node is first, so a repository holding both a `package.json` and a `.csproj` — a .NET
service with a JavaScript frontend, a common shape — resolves to **node**, and nothing says so.
`DESIGN.md` §3.8 predicted this exact moment and named the fix: the architect declares the
toolchain and detection confirms, as capabilities already do. **That is not built.**

**Not verified.** No dogfood run against a .NET project (D2 case C, still refused — it spends
money and wants an operator). The adapter has never driven a real `driveRun`. `dotnet format`
requires source it can parse, and its behaviour on a repository mid-build is unknown.

## B4-dotnet — the TRX reporter (0.33.0)

**Verified against real output.** Two TRX files produced by `dotnet test` are committed to
`test/fixtures/reporters/` with provenance — a passing run (2 passed, 1 skipped) and a failing
one (1 passed, 1 failed, 1 skipped). Only the hostname and the generating machine's absolute
path were redacted; every element, attribute and outcome is as emitted. 12 tests.

**The bug that would have made all of it decorative.** The driver hardcoded node's two report
filenames, so a .NET run would have written `unit.trx`, had it read by nobody, and ended at
`passing: 0` — the exact failure both live runs produced on 10 August, arriving by a new route.
`Toolchain.reports` now declares what each toolchain writes and the driver asks. Found by
wiring the reporter and asking what would actually read its output, not by a test.

**Three findings from the format itself**, each a way the ratchet could have silently stopped
protecting anything:

1. **Most `outcome=` attributes in a TRX are not test outcomes.** A single-failure run carries
   six — three on `UnitTestResult`, one on `ResultSummary`, two on `RunInfo`. A naive read
   admits three phantom results, one into the ratchet.
2. **Neither path in the file can be identity.** `storage` is absolute *and lowercased by the
   runner*; `codeBase` is absolute. An id from either differs between machines, so the ratchet
   would read every test as new on the first run elsewhere. That is a silent widening, which no
   parse error announces. The id is the fully qualified `testName`.
3. **The registry assumed JSON.** `parseReport` began with `JSON.parse`, so XML died as "report
   is not valid JSON" — true, and the wrong fault.

**Not verified, and one of these is a real risk.**

- **There is no XML parser here** — hard constraint 1 — so this is a regex over two attributes
  of one element. It is safe against the usual failure (XML forbids a raw `"` inside an
  attribute value, so the match cannot overrun) and it is still **the thing in the registry
  most likely to be wrong about a TRX nobody has seen yet**. Specifically untested: MSTest and
  NUnit adapters, which may populate `UnitTestResult` differently from xunit; multi-assembly
  runs; and `[Theory]` names containing entities, where only `decodeXmlEntities` is unit-tested
  and no real theory output has been seen.
- **No .NET run has ever driven `driveRun`.** The reporter has never been fed by a live gate.
- `junit.mjs` is still not written. Nothing has needed it.

## B6 — per-toolchain guidance (0.34.0)

**Verified.** Nine tests. Two matter more than the rest: one requires a fragment for **every**
registered toolchain, so adding a third adapter without guidance fails the suite rather than
silently shipping a builder that was told nothing; and one asserts the fragments do **not**
restate the builder's contract, because a second voice arguing with the first would grow every
time either changed.

The content is not invented. It is what actually went wrong while verifying B3 against a real
SDK — a test project missing from the `.sln` collects zero tests, and a missing project
reference surfaces as `CS0246`, which names neither the reference nor the cause. The Node
fragment carries the equivalent: the unit gate collects with vitest and not `npm test`, which
is the fault that killed both live runs on 10 August.

**Not verified — and this item is the least verifiable thing in the brief.** Whether guidance
changes what a builder produces cannot be established from inside the test suite. The tests
prove the fragment is *selected*, *rendered* and *archived*; they cannot prove it is *read*, or
that reading it prevents the failure it describes. That needs two dogfood runs on the same PRD
with and without the fragment, which is beyond what D2 currently plans.

Also unverified: the fragments were written against a scaffolded solution and a scaffolded
Node app. Neither has met a real generated project, so the layout advice ("src/, tests/, one
.sln at the root") is convention rather than observation.

---

## Fixed here, and worth knowing about

**Every phase except `builder` was dead, and no test could see it.** `--allowedTools` is
variadic. The prompt was appended to argv immediately after it, so the CLI parsed the prompt
as one more tool name and the child exited with *"Input must be provided either through
stdin or as a prompt argument"*. `builder` alone survived, because
`--dangerously-skip-permissions` takes no operand. No PRD was ever authored, no design
written, and — since nothing defaults to pass — no reviewer could ever return a pass, so no
run could ever ship.

The suspicion recorded here previously blamed the *permissions*. The permissions were fine.
The argument order was not, which is why "start a small run and see whether `PRD.md`
appears" would have found it and reading the permission table would not.

The prompt now travels on stdin. That is deliberately not a reordering: a safe position
lasts only until someone adds a flag after it, whereas a prompt on stdin is not an operand
of anything. It also retires `ARG_MAX` for prompts carrying a whole template plus the PRD,
and prompts that happen to begin with `--`.

The lesson generalises past this bug: **`claudeArgs` is unit-tested, and unit tests assert
the array we meant to build.** The defect lived in another program's parsing of that array.
Anything whose contract is owned by a different binary needs one live check, not more
assertions.

## Unverified risk

The `reality-check` and `lesson-extractor` phases have still never run against a live child.
They use the same spawn path as the phases that have, so the argv fault above is fixed for
them too, but their prompts and their parsers are unexercised.

The lesson store's *usefulness* is unproven in a way the tests cannot reach. Storage,
retrieval, protection and the fail-safe paths are covered; whether the extractor produces
lessons worth reading is a judgement only a long run can settle. Read `.dare/lessons.json`
after the first real run and delete it if it has filled with generalities — retrieval is
designed so that an empty store costs nothing.

## Decisions

All recorded in `DESIGN.md` §14, alongside the one question deliberately left open: whether
to add a backend or security quality plugin beside impeccable, which only inspects user
interfaces.

When adding a phase, note that `PHASE_PERMISSIONS` in `scripts/driver.mjs` throws for an
undeclared phase rather than defaulting. Only `builder` runs in dangerous mode.
