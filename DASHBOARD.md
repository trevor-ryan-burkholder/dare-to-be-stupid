# Dashboard — animated, read-only run observer

**Status:** supporting specification. `PLAN.md` item **166** owns live admission, order, and
completion state.

**Audience:** product design, implementation, and review of the future dashboard.

The dashboard should make a long Meeseeks run understandable at a glance: what run this is, where it
is in the pipeline, what durable role, component, or workflow member is active, what evidence exists,
what resources remain, and why work stopped. It is an observer, never another way to operate the loop.

## Authority

This is not a runtime-contract or status authority. It is authoritative for visual and interaction
detail within `DESIGN.md`'s product boundary.

| Question | Canonical owner |
| --- | --- |
| Is dashboard work eligible, blocked, deferred, or complete? | `PLAN.md` item 166 |
| What must the shipped product do? | `DESIGN.md`; §16 owns the observer boundary |
| Which repository invariants apply? | `CONSTITUTION.md` |
| Is a reviewed defect open or closed? | `REVIEW.md` |
| How should the dashboard look and behave? | this document, where it does not conflict with the owners above |

`DESIGN.md` §16 establishes the observer's process, authority, projection, compatibility, and web
security boundary. Before implementation, complete each accepted runtime event, artifact, entrypoint,
and exact schema in the applicable shipped-runtime section. Keep visual and interaction detail here
and link to the normative contract; do not maintain two copies of product behavior.

## Product outcome

The operator can answer these questions without reading a transcript or opening several JSON files:

1. Which repository, run, tree, specification, plugin, and toolchain am I observing?
2. Is it live, disconnected, interrupted, terminal, archived, or incompatible with this viewer?
3. Which major phase and iteration have started, settled, or stopped unexpectedly?
4. Which durable role, component run, or cold reviewer is active?
5. Which deterministic gates and Panel verdicts have durable evidence?
6. What token, cost, time, stall, and remaining-budget information is live or terminal?
7. What failed, what remains unavailable, and which artifact supports that statement?

Unknown is a valid answer. The dashboard never fills a missing observation from configuration,
elapsed time, a filename, styled output, or a plausible-looking default.

This is the target product, not a promise that today's artifacts already contain every observation it
needs. The first implementation slice must render today's evidence honestly; later slices add the
smallest Driver-owned contracts needed for the full experience. Until a contract ships, its field is
shown as unavailable rather than removed from the design or inferred from a weaker source.

For example, there is no canonical run id or recorded repository path today. The end state includes a
stable Driver-owned run identity. Until that contract ships, the selected root and current/archive slot
are observer context, and any handle composed from `startedAt` and `startCommit` is labelled as a
presentation identity rather than a durable run id.

## Experience

### Primary screen

- **Run header:** selected repository, current/archive source, recorded launch HEAD, plugin version,
  observed connection freshness, and terminal state when one exists.
- **Phase rail:** the pipeline from launch through ship, with queued, active, settled, failed, skipped
  or not applicable, interrupted, and unavailable distinguished in text as well as color.
  Older/current-schema runs that lack a complete phase roster and generic settlement fall back to
  recorded entries and an explicit unknown state.
- **Meeseeks stage:** the box and Meeseeks animation communicate phase transitions without replacing
  the literal phase and status labels.
- **Orchestration map:** Driver, durable role invocations, component sub-runs, independently cold Panel
  members, and any admitted dynamic-workflow cluster.
- **Budget and progress:** live and terminal iterations, stalls, tokens, cost, elapsed time, ceilings,
  and remaining budgets. Until the live resource contract ships, current-schema runs show only their
  recorded terminal measurements and label live values unavailable; they are never inferred from
  configuration, persistent ratchet state, or stdout.
- **Quality and review:** live gate attempts, candidate identity, terminal exact-tree acceptance, Panel
  state, and findings supported by their owning observations. Current-schema runs expose individual
  gate results only when the terminal acceptance receipt preserved them.
- **Evidence timeline:** a bounded, virtualized chronology of Driver-owned ordered lifecycle
  observations—not prompts, responses, reasoning, tool chatter, or independently rewritten artifacts.
  Current-schema runs use journal `seq`; artifact evidence appears as an unordered snapshot, and changes
  noticed only by a running observer are labelled observer-local presentation, not durable history.
- **Archive picker:** the current run and validated, contained direct children of `.meeseeks/runs/`,
  including operator-renamed archive directories. A numeric slot is metadata, not a basename
  requirement; run-scoped sequence and iteration numbers never collide across selections.

### Allowed interaction

The operator may select an archived run, filter or search evidence, expand and collapse nodes, inspect
source metadata, pause or replay presentation, change replay speed, and choose light, dark, or system
theme. These controls affect only the browser projection.

There is no production **advance**, approve, dismiss, retry, resume, cancel, terminate, configure,
ship, or edit control. A prototype button that advances mock data is a demonstration control and must
not survive into the product. The dashboard has no Driver command channel.

### Visual direction

Use a technical-instrument character: a restrained blueprint grid, cyan/blue
Meeseeks identity, high-contrast status colors, compact monospace evidence, and clear light and dark
themes. The box opening, a Meeseeks appearing, branches drawing, and nodes materializing make phase and
spawn transitions legible. Movement never asserts progress the artifacts do not prove.

The production hierarchy is more important than spectacle. Driver stays visually fixed as the control
plane. Builder or another producer appears as its bounded child. A component Meeseeks appears as a
nested durable run with its own identity, phase state, evidence summary, and terminal outcome or
explicit unavailable/integrity state. That requires the future parent-owned component receipt/archive
contract below. Current-schema component detail is unavailable: the temporary child worktree is outside
the selected repository, is not correlated by a parent artifact, and is removed after use. Cold Panel
and Oracle paths branch separately from Builder so the UI does not imply shared context or Builder
self-review.

### Animation grammar

- **Durable role spawn:** Driver draws the parent edge, a box opens, and the role Meeseeks materializes
  with its literal activation label. The node does not become active before the recorded start.
- **Component spawn:** the parent Driver/control node opens a nested box whose Meeseeks owns a miniature
  run/phase frame. On settlement, the live frame contracts into the durable component receipt rather
  than disappearing.
- **Cold review:** Driver activates each independent Panel member; a separate subject edge points from
  the reviewer to the sealed candidate it judges. Reviewers never emerge from Builder's context bubble
  or from the candidate as if evidence were control. Parallel motion may show concurrency but not
  agreement or acceptance.
- **Dynamic workflow:** the durable role expands into a bounded cluster; ephemeral members appear under
  that role as the live snapshot changes, then the cluster contracts into the single workflow receipt.
  Internal success never triggers the run's accepted or shipped animation.
- **Failure and cancellation:** motion stops and the affected node remains visible with its literal
  terminal state and source. Failure never fades away merely to restore a clean composition.
- **Catch-up and replay:** the same ordered observations produce the same sequence at any replay speed.
  Reduced-motion mode substitutes state changes and focus-preserving transitions for movement.

## Roles, components, and dynamic workflows

Use three visibly different node classes:

1. **Durable control:** Driver and nested component Drivers. These own orchestration but are not model
   sessions.
2. **Durable role invocation:** PRD author, Architect, Builder/Producer, Oracle, and independently cold
   Panel members. The target review contract identifies each member's activation and any label the
   Driver actually declared; current-schema reports remain anonymous rather than receiving invented
   labels or specializations.
3. **Ephemeral workflow member:** a disposable agent inside one durable role. It never appears as a
   peer of Driver, Panel, or Oracle and never owns acceptance.

A spawn draws the parent edge before the child becomes active. The target child-lifecycle contract
settles the matching activation with a literal success, failure, timeout, or cancellation result. The
current journal has only a subject and `settled`, so current-schema runs render **settled — outcome
unavailable** unless another canonical artifact supplies the result. The future item-54 receipt, if
admitted and shipped, collapses completed workflow activity into an aggregate terminal summary;
ephemeral nodes do not accumulate into a permanent organization chart. An invocation outcome is
lifecycle evidence, never candidate or requirement acceptance. Agent count is activity, not progress.

The current journal records repeated child subjects, not stable identities for concurrent children.
It supports only aggregate activity such as “three reviewer children in flight.” The full dashboard
adds stable per-activation identity to the bounded child-lifecycle contract so concurrent settlements
map to the correct nodes.

The future item-54 versioned Driver-owned receipt, if admitted and shipped, supports the aggregate
terminal workflow summary; it remains one receipt, not a hidden-reasoning or per-agent telemetry
archive. To animate individual members while a workflow is live, the dashboard slice adds a separate
bounded live snapshot contract containing only presentation identity, parent, role, lifecycle state,
timing, and workflow-level aggregate usage—never per-member tokens, cost, model, prompts, or responses.
The snapshot is ephemeral, has a hard member cap, collapses to the receipt at settlement, and does not
become durable acceptance evidence. This is a narrow exception governed by the conditional boundary in
`DESIGN.md` §§15.2 and 16; if item 54 rejects dynamic workflows, individual live member nodes do not
ship. Archived replay shows the aggregate receipt rather than fabricating a permanent agent
organization. A workflow's internal success never renders as Builder, Panel, requirement, or run
acceptance.

`review.json` currently preserves reports in array order but no durable reviewer labels. The future
review receipt adds the bounded activation metadata needed for distinct Panel nodes and preserves any
Driver-declared role label without inventing one. Older receipts show an anonymous Panel count and
normalized reports.

If a connection is lost during ephemeral activity, reconstruct durable state and show unavailable
member detail unless the admitted workflow adapter supplies a current bounded snapshot. Do not persist
a node for every agent merely to make reconnect animation perfect.

## Data ownership and observational contracts

The first slice reads each existing fact from its owner and retains source identity for drill-down.
These sources are the compatibility baseline, not the limit of the finished dashboard.

| Displayed fact | Source | Constraint |
| --- | --- | --- |
| selected repository | explicit observer launch argument | presentation context, not run evidence |
| launch head, checks, and pre-loop phase outputs | `.meeseeks/launch.json` | show only recorded fields; it contains no repository path |
| run metadata, models, tools, and toolchain | `.meeseeks/run.json` | record, never decision authority; the standalone observer requires a narrow exception to `DESIGN.md` §7.1 while Driver decision paths remain forbidden readers |
| specification identity | `.meeseeks/specification.json` | do not reread a live specification to fill gaps |
| capability resolution | `.meeseeks/capabilities.json` | preserve declared/detected/resolved distinctions |
| cold-role supply | `.meeseeks/supply.json` | metadata only; never expose supplied prompt content |
| iteration start | `briefs/` and the journal's `iteration-started` transition | do not infer settlement from a later brief |
| phase entry, aggregate child lifecycle, iteration settlement | `.meeseeks/events.ndjson` | these five event kinds only; forensic, non-authoritative |
| Panel findings and verdicts | `.meeseeks/review.json` | allowlist normalized verdict/finding fields; current reports have no member labels |
| exact-tree gate and acceptance provenance | `.meeseeks/acceptance.json` and its referenced reports | no generic live `gate-running` fact exists today |
| terminal state, reason, settled usage, and spend | `.meeseeks/outcome.json` | only a bounded, schema-valid terminal receipt defeats a trailing unsettled journal |
| operator-facing unresolved decision | not admitted initially | current `question.json` is neither run-bound nor archived; do not attribute it until a normative contract fixes that gap |
| prior run | validated, contained direct children of `.meeseeks/runs/` | validation does not imply current-schema generation coherence; support operator-renamed archives; sequence and iteration scope restart per archive |
| component sub-run detail | not admitted today | the uncorrelated temporary worktree is outside the selected repository and is removed; do not discover or serve it |
| dynamic-workflow aggregate | future item-54 workflow receipt | no current production source; fixtures remain labelled |

`DESIGN.md` §16.2 is the single owner of the future run-identity, phase, child, candidate/gate,
liveness, resource, component, Panel, operator-decision, and conditional workflow observation
contracts. The table above records today's UI compatibility baseline; this document does not restate
the future schemas or their generation/archive rules. Item 166 must complete each concrete encoding
and compatibility behavior in the applicable runtime section before implementation.

Until those contracts ship, the corresponding UI capability remains explicitly unavailable. Old
archives keep their real anonymous or partial evidence rather than receiving migrated identities or
outcomes. The future `run.json` observer reader remains unshipped until §7.1 and its enforcement test
are amended without exposing the record to any Driver decision path.

## Projection, live updates, and replay

`DESIGN.md` §16.3 owns snapshot consistency, projection precedence, source ordering, liveness,
transport reset, corruption, and replay semantics. The UI presents those results without inventing a
second rule set:

- During a bounded snapshot retry or transport reset, show **updating / catching up** and do not
  animate a partial read as a completed transition.
- Keep observer connection, source integrity, Driver liveness, and run terminal state visibly
  distinct. Unknown or unavailable evidence never receives a success-shaped animation.
- Replay controls provide pause, seek, speed, and restart for one selected evidence set. Label them as
  evidence playback and never style them as controls over the active run.
- Preserve source drill-down and presentation-only labels in live and replay views. A reset may replace
  the rendered projection, but the UI never splices views from different observer epochs.

## Safety and privacy

`DESIGN.md` §16.4 is the single owner of the loopback web-origin, Host/Origin, CORS, CSP, path,
bounded-read, no-write, hostile-text, display-allowlist, redaction, and same-user security boundary.
The UI makes that boundary visible rather than weakening or duplicating it:

- Render repository and model-derived values only as text from the §16.4 display allowlist.
- Show an explicit redaction marker and source identity when secret policy suppresses an otherwise
  useful identifier or error; drill-down never reveals the raw value.
- Distinguish observer connection loss from Driver liveness and explain that loopback/same-user
  execution does not isolate artifacts from another process running as the operator.

## Accessibility and responsive behavior

- Honor `prefers-reduced-motion`; provide pause and speed controls for replay; never flash.
- Convey every state with text or icon plus color. Motion and color are never the only evidence.
- Make every presentation control keyboard reachable with visible focus and predictable order.
- Label the phase rail, graph, budgets, and terminal state for assistive technology. Announce live
  updates politely rather than rereading the screen on every event.
- Provide a list/table representation of the orchestration graph and timeline. It is the primary
  narrow-screen fallback, not an inaccessible miniature graph.
- Preserve exact identifiers and error text only after the safe-display policy accepts them. Otherwise
  preserve a visible redaction marker and source identity so the omission is not mistaken for source
  text.
- Test light, dark, high-contrast, reduced-motion, desktop, and narrow mobile layouts in a real browser.

## Implementation sequence when admitted

1. **Contract and fixtures.** Complete `DESIGN.md` §16 and the applicable shipped-runtime sections
   for the observational contracts above, including the narrow §7.1 `run.json` observer-reader
   exception and, only after item 54 ships its aggregate receipt, the narrow §15.2 live-member
   snapshot exception. Define bounded artifact validators, projection types, source references, and
   sanitized normal/failure/archive fixtures. Decide the explicit standalone observer command; do
   not auto-start it with a run.
2. **Static projector.** Implement a pure current/archive projector and a read-only static view. Prove
   artifact precedence, unknown/error states, and no writes before adding live behavior.
3. **Driver observations.** Add the smallest admitted Driver writers for the generation inventory,
   run identity, phase, child, candidate and gate-attempt lifecycle, liveness/resources, Panel
   identity, run-bound operator decisions, and component receipts/archives. Keep them bounded,
   versioned, atomically readable, and observational; publish target archives only through §16.2's
   staging/finalization boundary. Add no transcript or control channel.
4. **Local observer.** Add the loopback server, static allowlist, snapshot endpoint, SSE projection
   changes, reconnect/reset behavior, and clean shutdown. No model call or external network access.
5. **Animation and inspection.** Add the box/Meeseeks phase animation, role graph, gate/Panel views,
   replay controls, source drill-down, responsive fallback, and accessibility behavior.
6. **Dynamic-workflow adapter.** Only after item 54 admits and ships its aggregate receipt contract,
   add the capped live-member snapshot and versioned adapters that nest ephemeral members under their
   durable role, then collapse them to the receipt. Do not add hidden reasoning or widen the forensic
   journal merely to animate them.
7. **Acceptance.** Run deterministic projection tests, local-server integration tests, and real-browser
   accessibility, interaction, responsive, security, and visual-regression checks. Promote any newly
   discovered product contract to `DESIGN.md` in the same slice as its implementation.

Each phase is independently useful and separately reviewable. Do not build a generic event platform,
frontend framework, or agent runtime in anticipation of a later phase.

## Required tests

At minimum, fixtures and hostile neighbours cover:

- normal completion, `ABORTED`, `STALLED`, budget exhaustion, cancellation, timeout, and process kill;
- current-schema phase entry/unknown plus target-schema phase start/settlement, iteration
  start/settlement, repeated anonymous child subjects, paired success/failure runs with identical old
  child journal pairs, correlated target-schema child outcomes, concurrent gate attempts bound to the
  exact candidate, named parallel Panel activity, durable component history with valid, missing, and
  invalid child outcomes and, when item 54 is admitted and ships its aggregate receipt, capped live
  workflow fan-out and aggregate workflow collapse;
- terminal receipt beside a trailing open journal lifecycle, a current open lifecycle that remains
  unsettled/unknown before the liveness contract, and an archived or proven-dead interrupted lifecycle;
- missing, malformed, oversized, incompatible, duplicate, out-of-order, truncated-final-line, and
  earlier-corrupt records;
- current/archive isolation where sequence and iteration numbers repeat; target-schema mixed-generation
  refusal; current-schema generation-coherence-unavailable behavior; contained operator-renamed
  archives; and archival/finalization of every new durable/ephemeral record;
- target-schema generation-inventory publication before and after the snapshot; a revision change
  between reads; immutable next-revision artifacts before the inventory switch; and a non-accepting
  `updating` inventory published before any mutable-path change;
- observation-stream bytes beyond the published prefix; malformed, oversized, duplicate-path,
  traversing, and symlinked inventory bindings; a crash or bounded retry exhaustion that leaves an
  `updating` inventory unavailable; and a missing/digest-mismatched binding under the same complete
  inventory that becomes an integrity error;
- target archive assembly in a non-discoverable stage after current inventory withdrawal, atomic
  publication only after finalization, and a finalized archive that rejects later mutation;
- reconnect from a current cursor, transport cursor expiry, server restart, and full reset, plus a
  distinct source-journal gap that remains an integrity error after reset;
- observer shutdown or crash while the Driver continues unchanged;
- an operating-system-level assertion that the observer made no repository or `.meeseeks/` write;
- path traversal, symlink escape, arbitrary-file request, HTML/script injection, hostile ANSI/control
  characters, DNS rebinding/invalid `Host`, cross-site Origin/Fetch Metadata, accidental CORS, CSP
  regression, and accidental secret/configuration exposure, each with a benign neighbour;
- safe exact identifier/error preservation, explicit secret-redaction markers and source identity,
  keyboard-only use, reduced motion, assistive labels, contrast, and responsive list/table fallback;
- keyless record/replay fixtures that cannot invoke Claude or alter a run.

## Borrowed patterns and rejected architecture

From DeepSeek Harness commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`, borrow the
[run/phase/member projection](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/client/ui-workflow-run/README.md#L5-L17),
[lineage presentation](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/client/ui-subagent/README.md#L5-L13),
[trajectory interaction](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/client/ui-trajectory/README.md#L5-L17),
interrupted-state handling, and deterministic replay ideas.

Do not import DeepSeek Harness, Cordis, its UI packages, canonical full-session log, workflow worker,
agent-team roster or mailbox, credential store, telemetry, executable configuration, or `.agents`
note regime. Meeseeks keeps its privileged external Driver, cold-process review boundary, existing
artifact owners, narrow forensic journal, and no-runtime-dependency constraint.

## Explicit exclusions

- run control, configuration editing, approval, review closure, or terminal authority;
- checkpoint/resume, retry, or side-effect replay;
- transcript, prompt, response, reasoning, or tool-call streaming;
- a generic event-sourcing system, full provenance graph, or second implementation queue;
- invented individual-agent identity or progress inferred from agent count;
- remote binding, hosted service, accounts, collaboration, or production operations;
- dashboard state under `.meeseeks/`; and
- adopting dynamic workflows merely because the UI can illustrate them.
