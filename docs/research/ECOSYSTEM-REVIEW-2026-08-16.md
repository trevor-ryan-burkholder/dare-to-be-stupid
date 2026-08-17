# Independent ecosystem review — 16 August 2026

> **Status:** research ledger, not specification or implementation authority. `DESIGN.md` remains
> normative; only explicit changes in `PLAN.md` are live work. Source behavior is current as of the
> date above and must be re-measured before implementation.

## Authority and admission rule

The review started from `docs/INDEX.md`, then `DESIGN.md`, `REVIEW.md`, `PLAN.md`,
`HANDOFF.md`, and `docs/research/BORROWED.md`. The current repository is a Claude Code plugin at
0.164.0. Its non-paid gates are recorded green, while `REVIEW.md` still blocks release on F1–F29.
The durable Driver, monotonic ratchet/pins, cold Panel, held-out Oracle, guard, exact-tree work, and
terminal authority are existing mechanisms, not blank space for another framework to fill.

An external idea is admitted only when it names a current Meeseeks problem, adds an invariant the
repository does not already have, preserves role and terminal authority, and has a bounded experiment.
A vendor claim or an attractive abstraction is not implementation evidence.

## Research ledger

| source | disposition | useful mechanism or reason for refusal | Meeseeks result |
|---|---|---|---|
| [Anthropic, agent evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) | **HARVESTED** | Trials are stochastic; per-trial success estimates one-attempt reliability, `pass@k` measures any success in `k` attempts, and `pass^k` measures all-run consistency. Outcomes matter more than an agent's completion claim. | PLAN 57 now records raw repeated trials, uses per-trial success as the direct morning estimate, and keeps any-success and all-success as separate product-dependent views. Outcome-over-claim was already covered. |
| [METR, task-completion time horizons](https://metr.org/time-horizons/) | **HARVESTED** | Human task length predicts autonomous success better than short benchmark scores, and 50% and 80% reliability horizons tell different stories. | PLAN 57 now separates short fixtures from independently classified substantial tasks. Meeseeks does not import METR's suite, logistic model, or forecasts. |
| [Rabanser et al., agent reliability](https://arxiv.org/abs/2602.16666) | **HARVESTED** | Mean task success hides consistency, perturbation robustness, predictability, and bounded failure severity; the paper tests repeated trials, paraphrases, injected faults, and environment shifts separately. | PLAN 57 now records non-compensable false completion/safety severity plus cheap paraphrase and transient-fault cohorts. It does not import the paper's twelve-metric framework or model self-confidence grader. |
| [Claude Code sandboxing](https://code.claude.com/docs/en/sandboxing), [settings](https://code.claude.com/docs/en/settings), and [environment variables](https://code.claude.com/docs/en/env-vars) | **HARVESTED** | Current native settings expose fail-closed sandbox startup, disabled unsandboxed escape, filesystem/network policy, named credential deny/mask, and provider-credential subprocess scrubbing. The parent process, arbitrary variables, non-Bash tools, platforms, and PID-namespace side effects remain separate boundaries. | PLAN 56 now measures native subprocess scrubbing without abandoning the parent allowlist; PLAN 84 measures credential deny/mask and a stronger child containment profile. Registration is not confinement evidence. |
| [Claude Code permission modes](https://code.claude.com/docs/en/permission-modes) and [auto-mode design](https://www.anthropic.com/engineering/claude-code-auto-mode) | **HARVESTED TO EXPERIMENT** | `auto` works with `-p` and adds a reasoning-blind action classifier plus prompt-injection probe, but is preview, probabilistic, eligibility-limited, and terminates headless runs after repeated denials. | PLAN 84 tests it only as defense in depth. It cannot judge acceptance, advance state, or replace deterministic sandbox/guard/cold review. |
| [GitHub Copilot agent firewall](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-the-firewall) | **ALREADY COVERED / CORROBORATING** | Default-restricted egress reduces exfiltration, but GitHub explicitly documents bypass and process-scope limitations. | Corroborates PLAN 84's threat and hostile canaries. GitHub's runtime and firewall are not dependencies or proof that Claude children are contained. |
| [OpenHands persistence](https://docs.openhands.dev/sdk/guides/convo-persistence) and [cold-load state code](https://github.com/OpenHands/software-agent-sdk/blob/main/openhands-sdk/openhands/sdk/conversation/state.py) | **HARVESTED** | Persisted events are reloaded by rebuilding the derived view under property checks and verifying agent/tool compatibility. | PLAN 58 now requires schema/version/tree/config/prompt/tool/CLI compatibility before any future resume. The OpenHands event bus and runtime are rejected. |
| [in-toto Statement v1](https://github.com/in-toto/attestation/blob/main/spec/v1/statement.md) and [SLSA provenance](https://slsa.dev/spec/v1.2/provenance) | **HARVESTED** | A versioned statement binds a typed predicate to immutable subjects; provenance separates resolved inputs from run results. | PLAN 76 now requires a typed/versioned acceptance claim, exact subject, and input/result separation. Signing, DSSE, and SLSA conformance are not justified. |
| [Sigstore](https://docs.sigstore.dev/about/security/) | **REJECTED FOR CURRENT SCOPE** | Identity-bound signatures and a transparency log make published supply-chain attestations discoverable and tamper-evident. | Meeseeks has no independent receipt signer, public artifact distribution, or transparency-log threat. Adding identity, network, and keyless-signing dependencies would create ceremony without independent evidence. |
| [OpenTelemetry GenAI conventions](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/) | **ALREADY COVERED / REJECTED DETAIL** | Common operation/agent ids help correlate spans, but message attributes can contain sensitive data and the agent conventions are still moving. | Stable run/role/attempt ids already exist or are planned in bounded Driver artifacts. PLAN 58 explicitly rejects content-rich telemetry; no OTel dependency or transcript export. |
| [systemd process control](https://www.freedesktop.org/software/systemd/man/latest/systemd.kill.html) | **ALREADY COVERED** | Process groups/cgroups can terminate all descendants rather than only a wrapper PID. | REVIEW F2/F11 and PLAN 65 already require grace, force, descendant sweep, guaranteed settlement, bystander safety, and Windows parity. systemd is only a possible Linux implementation detail. |
| [The Update Framework](https://theupdateframework.io/) | **ALREADY COVERED / NOT ADOPTED** | Versioned signed metadata addresses rollback, freeze, and repository compromise for distributed updates. | Release-check, the Claude cache version rule, PLAN 75's exact installed snapshot, and PLAN 83's CLI floor cover the local failure modes. A TUF repository is unjustified for this development plugin. |
| [AgentDojo](https://proceedings.neurips.cc/paper_files/paper/2024/hash/97091a5177d8dc64b1da8bf3e1f6fb54-Abstract-Datasets_and_Benchmarks_Track.html) | **ALREADY COVERED** | Security defenses must be measured against both benign utility and adaptive prompt-injection cases. | PLAN 84 already requires hostile and benign neighbours through the real child. Importing its Python benchmark would not exercise Meeseeks' Claude/guard/sandbox boundary. |
| [CaMeL](https://github.com/google-research/camel-prompt-injection) | **PARKED / FRAMEWORK REJECTED** | Source-tracked capabilities can prevent untrusted tool data from controlling privileged sinks, but the released interpreter is a research artifact and changes the execution model. | Reconsider source/sink labels only if Meeseeks gains external action tools or connectors. Do not import the interpreter for today's repository-local coding loop. |
| [Temporal durable execution documentation](https://github.com/temporalio/documentation/blob/main/docs/glossary.md) and [history service](https://github.com/temporalio/temporal/blob/main/docs/architecture/history-service.md) | **ALREADY COVERED** | Event history can reconstruct workflow state; replay makes deterministic orchestration and idempotent side effects mandatory. | PLAN 58 already refuses replay until idempotency and receipt semantics exist. A Temporal server/SDK violates the dependency-free local control plane for an unproven need. |
| [SWE-agent trajectories and retry loop](https://github.com/SWE-agent/SWE-agent/blob/main/docs/usage/trajectories.md) | **ALREADY COVERED / REJECTED DETAIL** | It saves per-step trajectories/configs and evaluates generated patches separately. | Separate evaluation, bounded retries/cost, and replayable config identity are already stronger in Meeseeks. Hidden reasoning and full action trajectories are deliberately excluded from durable artifacts. |
| [OpenAI Codex goals](https://learn.chatgpt.com/use-cases/follow-goals) | **ALREADY COVERED** | A durable objective with proof commands, checkpoints, progress log, and pause/resume supports hours-long work. | Meeseeks already adds budgets, monotonic evidence, independent review, and terminal authority. A vendor-native goal cannot replace the Driver. |
| [OpenAI Codex approvals and security](https://learn.chatgpt.com/docs/agent-approvals-security) | **HARVESTED** | Command-network policy is only one egress surface; web/search, MCP/connectors, browser/computer use, model/auth, local/private addresses, and sockets have separate controls. Cloud setup can receive secrets that are removed before the offline agent phase. | PLAN 84 now inventories and canaries every available outbound surface instead of treating a Bash proxy as whole-child containment. Claude now documents a narrower sandbox credential broker, so PLAN 56/84 measure it; no separate setup phase or whole-role guarantee is inferred. |
| [OpenAI scored improvement loops](https://learn.chatgpt.com/codex/use-cases/iterate-on-difficult-problems) | **ALREADY COVERED** | Machine-readable scores, fixed stopping rules, one focused change, artifact inspection, and deterministic checks supplemented by model judgment. | Ratchet, gate artifacts, bounded iteration, cold panel, and PLAN 57/59 cover the useful invariants. A self-judge remains non-authoritative. |
| [OpenAI PaperBench](https://openai.com/index/paperbench/) | **HARVESTED** | Hierarchical expert rubrics make long tasks gradable, and the LLM grader is evaluated in a separate judge benchmark rather than assumed reliable. | Requirements are already decomposed and reviewed; PLAN 57 now adds a cold Panel calibration corpus with seeded defects, clean neighbours, and independently owned labels. |
| [Anthropic, AI-resistant technical evals](https://www.anthropic.com/engineering/AI-resistant-technical-evaluations) | **ALREADY COVERED** | Evaluations need realistic horizon, multiple independent opportunities to show capability, and refreshed headroom as models saturate them. | PLAN 57's substantial-task strata and living discovery/selection/final corpus cover the useful mechanism. Hiring-test novelty is not a Meeseeks objective. |
| [Anthropic, infrastructure noise in coding evals](https://www.anthropic.com/engineering/infrastructure-noise) | **HARVESTED** | CPU/RAM allocation and enforcement can move agentic benchmark scores by several points; resource configuration is part of the evaluated system, not background noise. | PLAN 57 now binds a resource-profile digest, allows only matched comparisons, and separates infrastructure failures from model-quality failures. |
| [Anthropic, managed agents](https://www.anthropic.com/engineering/managed-agents) | **ALREADY COVERED / REJECTED ARCHITECTURE** | Separating durable session, stateless harness, and execution hands lets each fail or scale independently. | Driver/role/sandbox boundaries and PLAN 58 already capture the useful failure separation. A hosted session/hand interface would replace the local control plane without a demonstrated need. |
| [Anthropic, long-running harness design](https://www.anthropic.com/engineering/harness-design-long-running-apps) | **ALREADY COVERED** | Structured handoffs, bounded chunks, and a separate skeptical evaluator address context anxiety and self-evaluation. | Builder briefs, iteration boundaries, cold Panel, and reviewer calibration cover these invariants more strongly. The example's generator self-evaluation remains non-authoritative. |
| [SABER](https://arxiv.org/abs/2512.07850) | **ALREADY COVERED** | Mutating deviations drive disproportionate multi-turn failure, motivating action-level safeguards and paired evaluation. | The positional guard, exact role tools, Driver-owned state, R19, and PLAN 84 hostile/benign canaries already protect mutating paths at the execution boundary. |
| [Google DeepMind AlphaEvolve](https://deepmind.google/blog/alphaevolve-a-gemini-powered-coding-agent-for-designing-advanced-algorithms/) | **ALREADY COVERED** | Diverse cheap/strong model proposals become useful when an objective automated evaluator can select them. | PLAN 54 permits bounded disposable fan-out; PLAN 59 permits offline optimization only behind deterministic held-out selection. Evolutionary databases and broad candidate populations would magnify cost without a new invariant. |
| [DBOS workflows](https://docs.dbos.dev/python/tutorials/workflow-tutorial), [AWS Lambda durable execution](https://docs.aws.amazon.com/lambda/latest/dg/durable-execution-idempotency.html), [Dapr workflow architecture](https://docs.dapr.io/developing-applications/building-blocks/workflow/workflow-architecture/), and [Restate](https://docs.restate.dev/) | **ALREADY COVERED / REJECTED ARCHITECTURE** | Idempotent execution ids, deterministic replay, version compatibility, checkpoints, and bounded retention are durable-workflow fundamentals. | PLAN 58 already requires idempotency, stable identities, bounded history, cold reconstruction, and a compatibility fence before resume. Their databases, SDKs, sidecars, and services do not solve a demonstrated remaining problem. |
| [Node child processes](https://nodejs.org/api/child_process.html), [Windows Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects), and [Kubernetes Job failure policy](https://kubernetes.io/docs/tasks/job/pod-failure-policy/) | **ALREADY COVERED** | A wrapper signal does not guarantee descendant death; process groups/Job Objects manage a tree, and typed retry policy separates terminal from retriable failures. | REVIEW F2/F11 and PLAN 65 already require bounded grace, force, descendant sweep, bystander safety, guaranteed settlement, and platform parity. Kubernetes would add a control plane for semantics already specified locally. |
| [GitHub Copilot code review](https://docs.github.com/en/copilot/concepts/agents/code-review) and [Claude Code memory / CLI isolation](https://code.claude.com/docs/en/memory) | **HARVESTED** | GitHub reviewers intentionally consume instructions and Skills from the candidate head branch. Claude Code loads project instructions as context, while `--safe-mode` disables their automatic discovery. | Meeseeks already uses safe mode, but its reviewer prompt explicitly re-reads Builder-mutable `CLAUDE.md` as binding. REVIEW F29 and PLAN 85 make candidate files evidence and derive reviewer authority from identified immutable inputs. |
| [Instruction Hierarchy](https://arxiv.org/abs/2404.13208), [Spotlighting](https://arxiv.org/abs/2403.14720), and [Anthropic prompt-injection defenses](https://www.anthropic.com/research/prompt-injection-defenses) | **ALREADY COVERED / CORROBORATING** | Privileged instruction levels and continuous provenance cues improve resistance, but adaptive injection remains unsolved and classifiers are not guarantees. | PLAN 85 already distinguishes trusted instructions from untrusted evidence; R30 frames/neutralizes untrusted text; PLAN 57/84/85 require hostile/benign evaluation. Model training and prompt markers cannot replace exact source identity or constrained tools. |
| [GitHub CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners) and [Gerrit submit requirements](https://gerrit-review.googlesource.com/Documentation/config-submit-requirements.html) | **ALREADY COVERED / CORROBORATING** | Review policy comes from the base branch or a separate protected configuration ref, and later candidate changes stale prior approval. | PLAN 85's pre-Builder authority snapshot and item 68's exact-tree seal capture the useful invariants locally. GitHub/Gerrit hosting and policy engines are not dependencies. |
| [Claude Code ultrareview](https://code.claude.com/docs/en/ultrareview) | **PARKED** | A remotely sandboxed fleet independently reproduces reported bugs and exposes a non-interactive JSON mode. It is research preview, paid after limited trials, remotely uploads/clones code, is unavailable on several backends/ZDR, reviews a diff rather than Meeseeks' PRD, and exits zero with findings as well as no findings. | It cannot replace Panel or certify acceptance. Consider only as an optional advisory specialist if PLAN 57 first measures a Panel code-defect recall gap and a pinned side-by-side experiment proves incremental value, exact subject identity, acceptable false positives, privacy, availability, and cost. |
| [Claude Code agent view](https://code.claude.com/docs/en/agent-view) | **HARVESTED TO EXPERIMENT** | Its research-preview supervisor keeps full background sessions running without an open terminal and persists session state across supervisor restarts, auto-updates, and sleep, but shutdown stops work and recovery can be imperfect. | After F25/item 80 verifies the user-only command boundary, PLAN 36 tests only operator-started terminal detachment before building a daemon. Driver receipts, guard, lock, crash recovery, and terminal authority remain independent. |

## HARVESTED

### E1. Consistency, not lucky success

**Problem solved:** a candidate that succeeds once in several attempts can look impressive while
remaining a bad product for a user who starts one unattended run.

**Smallest adaptation:** PLAN 57 records every trial, empirical per-trial success, the first trial,
any-success, all-success, sample size, and estimator assumptions. Per-trial success is the direct
estimate for one unattended run; all-success is a stricter consistency stress. Candidate and baseline
use the same cohort. Best-of-N cannot hide a required failure.

**New failure modes controlled:** repeated runs can explode cost or invite selection leakage. Start
with cheap deterministic cohorts; retain discovery/selection/final partitions; never open final data
to choose the candidate.

### E2. The eval must contain substantial work

**Problem solved:** fixture-scale success can saturate while saying nothing about an overnight task.

**Smallest adaptation:** PLAN 57 gives scenarios an independently defined reference-effort or
difficulty band and reports short versus substantial work separately. Agent runtime is not task
difficulty. No claim of measured morning acceptance follows until a substantial multi-phase scenario
exists.

**New failure modes controlled:** human-time estimates are noisy and repo-specific. Preserve the raw
band rationale and results; do not copy METR's predictive curve or present a local band as a universal
time horizon.

### E3. Re-measure the existing sandbox against current controls

**Problem solved:** `sandbox.enabled` is optional and the live test proves settings delivery, not
filesystem/network confinement. Removing ambient environment variables alone does not prevent
credential-file reads or exfiltration.

**Smallest adaptation:** PLAN 84 tests the existing Claude-native child settings with startup failure,
unsandboxed escape disabled, sensitive read denial, and measured outbound domains. Auto mode is a
separate optional defense-in-depth probe.

**New failure modes controlled:** domain allowlists can break package managers; broad trusted domains
can still receive secrets; a preview classifier can false-deny or disappear by provider/model/plan;
and a settings parse failure could also drop the guard. Hostile and benign live canaries, exact CLI
identity, and fail-closed refusal precede adoption.

### E4. Resume only across an exact compatibility fence

**Problem solved:** a future journal can be internally valid yet unsafe to replay after its Driver,
plugin, tree, config, prompt supply, tool policy, or CLI contract changes.

**Smallest adaptation:** PLAN 58 requires cold-load reconstruction under current invariant checks and
refuses mismatches before spawn or side effect.

**New failure modes controlled:** this does not approve resume, event sourcing, or automatic replay.
It strengthens the admission test for a still-parked capability.

### E5. Type the acceptance claim and bind its subject

**Problem solved:** PLAN 76 named the evidence to preserve but not an explicit schema and claim type.
A future verifier could parse a familiar-looking digest set under different semantics or fail to tell
which exact artifact the assertion covers.

**Smallest adaptation:** the receipt identifies its schema, acceptance claim type, immutable candidate
tree/commit subject, resolved inputs, and results. Unknown types and subject mismatches refuse. This is
an in-toto/SLSA-inspired record shape, not a signed supply-chain attestation.

**New failure modes controlled:** signatures would add key custody and a false implication of
independent attestation when the Driver is both producer and recorder. They remain rejected until a
separate verifier and threat model require them.

### E6. Failure severity and perturbation robustness cannot be averaged away

**Problem solved:** `DESIGN.md` already names false-completion rate and recovery as product metrics,
but PLAN 57's result could still reduce a safe refusal, incorrect `SHIPPED`, destructive action, and
harness outage to the same failed acceptance bit.

**Smallest adaptation:** PLAN 57 adds a bounded failure class, makes false completion and
scope/security/destructive outcomes non-compensable, and adds cheap requirement-paraphrase and
deterministic transient-fault cases. It reports consistency, robustness, recovery, severity, and
resource variance separately.

**New failure modes controlled:** a twelve-metric dashboard would create false precision and invite
metric gaming. Meeseeks adopts only dimensions tied to existing DESIGN success criteria. Model
self-confidence remains advisory.

### E7. The cold reviewer needs its own benchmark

**Problem solved:** the Panel is independent from Builder, but independence does not establish
competence. A reviewer prompt or model can systematically miss high-severity defects or invent
findings in clean code while the parser and isolation tests remain green.

**Smallest adaptation:** PLAN 57 adds versioned defective/clean snapshot pairs, independently owned
labels, per-role miss/false-positive/disagreement results, and exact reviewer configuration identity.
The corpus retains discovery/selection/final partitions and never leaks answers into production
prompts.

**New failure modes controlled:** a judge must not grade its own calibration, synthetic defects can
overfit the prompt, and aggregate acceptance can hide one weak specialist. Labels stay external,
results remain per-role, and calibration selects development configurations without becoming live
terminal authority.

### E8. Eval resources are part of the system under test

**Problem solved:** two identical Meeseeks candidates can receive materially different scores when
CPU, memory, concurrency, timeout enforcement, or tool versions differ. Treating those as invisible
host details makes small comparisons meaningless.

**Smallest adaptation:** PLAN 57 binds an execution-resource profile to every result, compares only
matched profiles, and classifies infrastructure outages separately.

**New failure modes controlled:** this is not a demand for cloud-standardized hardware. Missing
resource observations fail comparison, profile differences remain visible, and no infrastructure
failure is silently discarded to improve a model score.

### E9. Containment must cover every egress surface

**Problem solved:** a domain allowlist applied to Builder-launched commands does not constrain a
built-in fetch/search tool, inherited MCP or plugin, browser, model channel, local/private target, or
Unix socket that travels through another transport.

**Smallest adaptation:** PLAN 84 inventories each available surface, disables nonessential ones through
the real role-tool policy, runs per-surface hostile canaries, and labels anything outside the measured
guarantee. Observed tool absence is recorded as absence, not generalized into a platform promise.

**New failure modes controlled:** forcing all traffic through one new proxy would import a control
plane and can break Claude authentication. The experiment retains separate layers and refuses broad
containment language when one cannot be measured.

### E10. Candidate policy is evidence, not reviewer authority

**Problem solved:** a cold process can still be steered by a shared candidate-controlled instruction
file if its own prompt tells it that file is binding. Separate Panel instances do not help when each
receives the same poisoned authority source.

**Smallest adaptation:** REVIEW F29 and PLAN 85 preserve `--safe-mode`, remove the instruction to obey
Builder-mutable policy, bind authoritative requirements to identified pre-Builder/Driver sources,
classify candidate files as evidence, and re-scan the exact final agent surface before Panel.

**New failure modes controlled:** forbidding reviewers to read candidate documentation would hide
real defects, while claiming a scanner makes arbitrary text safe would be false. The boundary changes
authority rather than visibility, combines deterministic known-pattern refusal with paired reviewer
calibration, and seals both to the exact candidate tree.

### E11. Use native secret narrowing where it is actually narrower

**Problem solved:** a full parent-environment copy exposes provider and unrelated credentials to
Builder-launched subprocesses, while removing every credential can break Claude authentication and
target tools that legitimately need one.

**Smallest adaptation:** PLAN 56 measures `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` as provider-specific
subprocess defense in depth while retaining the arbitrary-variable parent allowlist. PLAN 84 measures
sandbox credential `deny` and `mask` for explicitly named target secrets, exact injection hosts,
and fail-closed extraction/proxy behavior. No new broker or runtime dependency is added.

**New failure modes controlled:** scrubbing does not remove arbitrary variables or credentials from the
parent Claude process, and its Linux PID namespace changes process visibility. Masking is scoped to
sandboxed commands/proxy traffic, has version/platform/TLS requirements, and some mismatch modes warn
and pass through. Pinned hostile/benign canaries plus F2/F11 lifecycle evidence precede adoption.

### E12. Reuse the native descendant-aware dollar stop without surrendering Driver accounting

**Problem solved:** one Builder workflow can fan out spend before its outer envelope returns, while a
second Meeseeks dollar estimator would disagree with the CLI and duplicate an existing in-flight stop.

**Smallest adaptation:** keep the existing `childBudget()`-derived `--max-budget-usd`. Official
[CLI documentation](https://code.claude.com/docs/en/cli-reference) says subagent spend counts and, on
releases with the v2.1.217 enforcement behavior,
reaching the cap prevents another subagent spawn and stops remaining background subagents. PLAN 54
adds one pinned workflow canary for that exact production path. Driver-owned run cost, token, call,
fan-out, and terminal accounting remain authoritative.

**New failure modes controlled:** the vendor cap is approximate, versioned, dollar-only, and may leave
in-flight overshoot or missing crash usage. A live proof precedes reliance; it cannot turn a workflow
result into progress or replace post-return envelope accounting.

### E13. Test native terminal detachment before building a Meeseeks daemon

**Problem solved:** PLAN 36 includes keeping a run alive after the operator closes the terminal, but
building a second daemon may duplicate a current Claude Code supervisor for that narrow failure.

**Smallest adaptation:** current official
[agent-view documentation](https://code.claude.com/docs/en/agent-view) says research-preview
background sessions keep running without an open terminal and persist through supervisor restarts,
auto-updates, and sleep. After F25/item 80 verifies the user-only command boundary—unverified in
current 0.164.0—run one disposable operator-started `/meeseeks` session through backgrounding, shell
closure, and supervisor restart. Measure Driver descendants, output, guard, lock, receipts, and
terminal state. If native detachment holds, item 36 keeps only the crash/reboot/relaunch and durable
Driver-state work the vendor session does not prove.

**New failure modes controlled:** the experiment does not begin until F25/item 80 proves autonomous
dispatch cannot select `/meeseeks`; shutdown still stops sessions, sleep can leave one unresponsive,
needs-input states violate unattended completion, and the feature is research preview. A Claude
Completed row is never terminal
evidence, and the supervisor never becomes a required runtime or Meeseeks authority.

## ALREADY COVERED

- Durable responsibility and terminal authority: native goals, retry loops, and workflow engines are
  weaker than the Driver plus cold acceptance boundary.
- Outcome verification: deterministic gates, exact-tree work, Panel evidence, and Oracle material
  already reject an agent's assertion of completion.
- Separate producer/evaluator: SWE-agent's separate evaluation is useful but less independent than
  the cold Panel/Oracle design.
- Event history and replay discipline: PLAN 58 already records that no replay is safe until every
  side effect has explicit idempotency/receipt semantics.
- Egress as a security concern: R19 already establishes the OS-sandbox layer; current sources justify
  measuring its network/read configuration, not importing GitHub's or another vendor's runtime.
- Prompt-injection eval shape: PLAN 84's real-child hostile and benign neighbours already preserve
  AgentDojo's security/utility invariant at the boundary that matters to this plugin.
- Durable replay runtimes and process supervisors corroborate PLAN 58 and REVIEW F2/F11; they do not
  justify importing a service, sidecar, database, or cluster.

## REJECTED

- **Temporal, OpenHands, SWE-agent, or a hosted sandbox as the Driver.** Each brings a control plane,
  persistence model, or dependency stack without a demonstrated problem the local state/ratchet
  cannot solve more simply.
- **Auto mode as acceptance authority.** Its classifier is probabilistic and reasons about action
  safety, not whether the work satisfies the PRD.
- **Full transcript/trajectory persistence.** It expands sensitive data, hidden reasoning, and
  telemetry without improving terminal evidence. Driver-owned bounded receipts remain the unit of
  durable truth.
- **Best-of-N as the morning metric.** It measures search capacity, not the reliability of the one
  run a sleeping user receives.
- **A universal graph or event-sourced rewrite.** Targeted provenance and a forensic journal remain
  conditional additions to existing artifacts.
- **CaMeL's interpreter or an information-flow framework today.** It would replace ordinary Claude
  tool execution, and its authors label the implementation an unsupported research artifact.
- **Signed in-toto/DSSE/SLSA attestations.** The current local Driver is not an independent signer;
  key management and conformance machinery solve no demonstrated acceptance-receipt threat.
- **Candidate-branch instructions as reviewer configuration.** They let the producer influence the
  evaluator. Candidate files remain visible as evidence, but never become binding merely by location.

## PARKED

| idea | admission condition |
|---|---|
| Make auto mode the default unattended permission mode | Pinned paid canaries show eligibility across the supported product matrix, acceptable false-denial behavior, intact guard/tool contracts, and no silent fallback. |
| Make strict network/read containment the default | Representative toolchains pass a minimal cross-platform policy and configuration failure refuses before mutation. |
| Automatic resume from the lifecycle journal | The killed-run experiment first proves a journal is needed, then every replayable operation gets idempotency and receipt semantics plus the new compatibility fence. |
| A full METR-style time-horizon benchmark | Real product decisions require prediction by human task length beyond the much smaller scenario bands in PLAN 57. |
| Import an external workflow/persistence/sandbox framework | A measured failure remains after the smallest Meeseeks-native experiment and cannot be fixed without the dependency. |
| Source/sink capability labels for untrusted data | A supported job type gains external connectors or privileged remote actions, and red-team evidence shows tool availability plus sandbox policy cannot express the required boundary. |
| Split setup credentials from an offline Builder phase | A measured Claude CLI/SDK contract can authenticate the model without exposing credentials to Builder-launched tools and can support dependency acquisition without re-opening arbitrary egress. |
| Add ultrareview as an advisory Panel specialist | PLAN 57 first demonstrates a repeatable Panel code-defect recall gap; then a pinned paid comparison improves recall without unacceptable false positives and binds JSON, exact subject, privacy, backend availability, and cost. It never gains terminal authority. |

## OPEN QUESTIONS

- Which exact Claude Code version first supports every sandbox key and non-interactive permission
  behavior PLAN 84 needs? PLAN 83 must establish this from pinned binaries.
- Does the Driver's `--settings` blob combine the stronger sandbox profile with the guard on every
  supported platform, and can confinement be observed without reading or logging secret values?
- What minimum filesystem reads and domains do Claude authentication and representative package
  managers require? The answer is environment-specific and must be measured with synthetic canaries.
- How does auto mode expose classifier outages, denials, and token/cost accounting in `-p` envelopes?
  Current documentation establishes termination behavior but not Meeseeks' receipt contract.
- What reference-effort bands are repeatable enough for PLAN 57 without turning human estimates into
  false precision?
- Are existing crash artifacts already sufficient? Until the PLAN 58 kill experiment says no, the
  journal and resume path stay parked.
- Which pre-Builder project conventions, beyond PRD/declared DoD, genuinely need binding review
  authority? Until the contract is enumerated, PLAN 85 must not promote mutable repository prose.
- Does ultrareview's undocumented `bugs.json` schema bind findings to the exact submitted tree, and
  can its remote data path satisfy target privacy policy? Only a pinned paid canary can answer.

## Pass record

### Pass 1 — current vendors, eval reliability, and durable runtimes

This pass compared current Anthropic, OpenAI, GitHub, METR, OpenHands, Temporal, and SWE-agent
mechanisms. It produced E1–E4 and the PLAN 57, 58, and 84 changes above. The next pass starts from
that updated plan; it does not reopen frameworks or best-of-N without new evidence.

### Pass 2 — evidence formats and prompt-injection control

This pass checked in-toto/SLSA, AgentDojo, and CaMeL against the modified plan. It produced E5 and
the PLAN 76 refinement. AgentDojo's paired utility/security method was already present in PLAN 84;
CaMeL is inappropriate for the current execution surface. Because E5 changed the plan, convergence
restarts after this pass.

### Pass 3 — attestation authenticity, telemetry, supervision, and updates

This pass checked Sigstore, OpenTelemetry's evolving GenAI conventions, systemd process-group
supervision, and TUF. It produced no HARVESTED mechanism or PLAN change. Signing has no independent
principal or distribution threat here; content-rich telemetry conflicts with bounded sensitive
artifacts; process-tree settlement is already an open cross-platform defect; and plugin cache/update
identity already has narrower local gates. This was a no-harvest pass, but the next pass changed the
plan, so it does not count toward final convergence.

### Pass 4 — multidimensional operational reliability

This pass checked current primary work on agent reliability against DESIGN's own success criteria.
It produced E6 and a PLAN 57 refinement: false completion and severe safety failures are not averaged
with benign refusal, and cheap paraphrase/fault cases measure robustness and recovery. The paper's
broader metric suite and self-confidence scoring were not adopted. Convergence restarted after this
pass.

### Pass 5 — evaluator quality and objective search

This pass checked PaperBench's separate judge benchmark, Anthropic's evaluation-saturation lessons,
and AlphaEvolve's proposal/evaluator loop. It produced E7 and the Panel-calibration addition to PLAN
57. The remaining mechanisms were already covered by task-horizon strata, held-out partitions,
dynamic-workflow experiments, and offline optimization gates. Convergence restarted after this pass.

### Pass 6 — managed harnesses, mutation safety, and infrastructure confounding

This pass checked Anthropic's managed-agent and long-running harness designs, SABER, and measured
infrastructure noise. It produced E8 and the resource-profile addition to PLAN 57. Brain/hand/session
separation, mutating-action safeguards, and generator/evaluator separation were already covered.
Convergence restarted after this pass.

### Pass 7 — cross-runtime sandbox and egress comparison

This pass checked current official Codex sandbox, approval, network, and cloud-phase behavior. It
produced E9 and tightened PLAN 84 from command-network policy to a complete observed egress inventory.
Codex itself is not proposed as a runtime. Its setup-secret/offline-agent split remains parked because
no equivalent Claude child contract is established. Convergence restarts after this pass.

### Pass 8 — durable replay implementations

This pass checked AWS Lambda durable execution, DBOS, Dapr Workflows, and Restate after PLAN 58's
compatibility-fence refinement. Idempotent starts, deterministic replay, pinned code compatibility,
checkpoint histories, and retention bounds were already present in the parked Meeseeks-native plan.
It produced no HARVESTED mechanism or PLAN change.

### Pass 9 — process supervision and failure classification

This pass checked Node's child-process contract, Windows Job Objects, and Kubernetes Job failure
policy. The sources corroborate the exact descendant and retry distinctions already owned by REVIEW
F2/F11 and PLAN 65. They produced no HARVESTED mechanism or PLAN change. Passes 8 and 9 were two
consecutive no-harvest passes before the hostile omission check.

### Final hostile pass — candidate-controlled reviewer configuration

The hostile question identified GitHub Copilot's documented use of head-branch instructions as the
important adjacent system not yet compared. Repository tracing showed Meeseeks already improves on
that default with `--safe-mode`, but `templates/reviewer-system.md` explicitly reopens the same
Builder-mutable `CLAUDE.md` channel and calls it binding after the only security scan has run. That
produced E10, REVIEW F29, and PLAN 85, so convergence restarted.

### Pass 10 — instruction hierarchy and untrusted-content defenses

This fresh pass checked Instruction Hierarchy, Spotlighting, and Anthropic's current layered prompt-
injection defenses against E10. They corroborate explicit trust provenance, source framing, paired
utility/security evaluation, and the warning that classifiers are not proof. PLAN 85 plus existing
R30 and PLAN 57/84 already contain those mechanisms. No new HARVESTED item or PLAN change resulted.

### Pass 11 — mature review-policy authority

This fresh pass checked GitHub CODEOWNERS/branch protection and Gerrit submit requirements. Base-
branch or separate-config policy and stale-review invalidation corroborate PLAN 85's pre-Builder
source plus item 68's exact-tree seal. Importing either hosting/control plane adds no invariant. This
was the second consecutive post-E10 no-harvest pass.

### Final hostile pass after convergence — current native deep review

The final omission check examined Claude Code ultrareview, a current research-preview cloud fleet
that independently verifies reported bugs and supports non-interactive JSON. It does not judge the
PRD, exits zero whether findings exist or not, uploads or clones code remotely, costs separate usage
credits, and is unavailable on several backends and under Zero Data Retention. Without a measured
Panel recall gap, it is PARKED rather than planned. The admission test above is new research memory,
not runtime work or terminal authority; no material plan change survived this pass.

### Post-convergence source update — native credential, budget, and detachment boundaries

Later recursive compatibility passes rechecked current official Claude Code sandbox, environment,
CLI, and agent-view documentation against F5/items 36, 54, 56, and 84. They harvested E11–E13:
provider-credential subprocess scrubbing and named sandbox credential deny/mask can narrow exposure;
the existing native dollar cap documents descendant-subagent enforcement that the workflow experiment
should live-prove rather than duplicate; and the research-preview session supervisor may solve only
item 36's terminal-detachment slice. PLAN retains Driver authority and requires pinned measurement of
version, parent/subprocess, platform, proxy, fail-open, process-visibility, overshoot, crash-accounting,
and persistence limits. This update does not invalidate the earlier pass chronology; it records vendor
capabilities found after that ecosystem loop had converged.
