# AGENTS.md — the agent contract

> Status: v1.0 · 2026-09-30 · Written under `documents/POA-2026-09-30-platform.md`
> Track A2. INTENDED behaviour; the code is corrected to it. **[deviation]**
> marks where it does not hold yet and names the track that fixes it. `ARCH.md`
> covers everything that is not specifically about an agent.
>
> Rulings this document encodes (Charan, 2026-09-30): no agent frameworks; no
> DAG runner; the event bus stays and becomes visible; the Smart Profile is the
> feeding engine for every agent; models are `.env`; evaluation is mandatory;
> a model is never a legal actor and learning is human-gated.
>
> Added 2026-10-01 (Charan: "agents should be self-aware, able to improve,
> with proper evals and risk boundaries"; "agentic is not a chatbot — it should
> be handheld by an agent"): §6a risk boundaries, §7 eval tiers, §8a
> self-awareness, §8b the improvement loop, §9a agentic IX. AG-UI is NOT
> adopted as a dependency; its event vocabulary is borrowed (§9a).
>
> Added 2026-10-02 (Charan: "enriched data will have ontologies for agents to
> understand … without these the Story Teller cannot harness properly, and
> outreach becomes a normal cold email"): the ontology and `account.context`
> in §3, graph extraction contracts in §5, path signatures in §8b, §9b
> evidence paths. Design: `documents/design-notes-ontology.md`.

## 1. What an agent is

An agent is a **TypeScript function registered by event type**, run by the
worker, that records what it does step by step, calls a model through one
client, writes only through the Brain and its own prefix, and stops to ask a
person before anything externally visible. It is not a framework object, not a
tool-calling loop, and not a process.

Three agents exist as products (Vara, GTM, Edge) and several as workers inside
them (VaNi conversation, ingestion, profile drafter, competitor research,
account research, fit lessons, domain-pack research, storyteller). The contract
is the same for all.

## 2. What an agent DECLARES

Stated once, at registration; the platform reads it, never re-asks.

| Declaration | Where |
|---|---|
| Identity and version | `vani_agent` row (code, name, version) — Vara today; GTM and Edge to follow [deviation → Track E3; `agents.list` marks them `derived` until then] |
| Events it handles | `AGENT_REGISTRY` in `worker.ts` **and** `agent-core/handled-events.ts`; the worker refuses to start if they differ |
| Events it emits | listed in its `SKILL.md` under "Emits"; every emitted type has a consumer or is on the unconsumed list on purpose |
| Skill functions | `SKILL.md` `## Functions`, one file each; params, returns, idempotency posture |
| Prompts and their contracts | keys `<skill>.<name>` in the prompt store with variables, output schema and fixtures (§5) |
| Journey | the console's `journey` declaration (ordered steps with done predicates) and a `journey` function that reads them from data |
| Activation checklist | machine-checkable items the platform evaluates (Vara: industry, domain, origin, published JD) |
| Roles, metering units, templates, pack namespace | per the platform integration contract (`documents/spec/PLATFORM.md` §3) |

## 3. What an agent CONSUMES, never re-implements

- **The Brain**, through `agent-core/brain.context.ts` — `loadBrain` reads
  profile, graph and approved vocabulary in one tenant transaction;
  `brainContext(purpose)` renders it under a character budget, reporting what
  it trimmed. Moving an agent onto it must not change what the agent sends
  the model (Charan, 2026-09-30). [deviation → Track D2: storyteller (rendered
  `deck`, proven identical), competitor research and offer drafting (data
  only) are converted; domain-pack and Vara (which reads only `industry`) are
  not. Offers and brand join with the first agent that needs them, after its
  output change is agreed].
- **The prompt store** (`gt_prompts` for GTM-side keys, `vani_prompt` for
  Vara-side keys — two stores is an open decision, PLATFORM §8): system prompt
  plus an optional tenant override, resolved per call.
- **The model client** (`callLLM` / `callLLMValidated`): provider per tenant,
  budget check, context check, lane, validation, failover policy. No agent
  calls a provider SDK directly.
- **Identity** from `SkillContext`; **comms** through the platform service;
  **metering** and **audit** through the platform's append-only spines.
- **Search** through `search.client.ts` (SearXNG), chosen by the agent's code,
  never by the model.
- **The ontology**, from `agent-core/ontology.ts` (intended, with S16 — see
  `documents/design-notes-ontology.md`): the labels, relationships, homes,
  evidence and decay rules, and the version. An agent that writes or reads a
  graph takes its vocabulary from there; it never invents a label or a
  relationship name in a prompt or a parser. [deviation → the file does not
  exist yet; the Brain's v0 vocabulary is spread across ingestion's prompt
  and parser.]
- **Knowledge about an account**, through `account.context(purpose)`
  (intended, beside `brain.context`): it reads the pool company graph, the
  tenant's account graph and the typed rows, and renders the best few
  **evidence paths** (§9b) under a character budget, reporting what it
  trimmed. Cross-home context is assembled THERE, never by an agent joining
  the three homes itself. The Brain is still read only through
  `brain.context`; the two are separate on purpose (ARCH §7b).

## 4. The harness — what a run is

```
event (gt_events)  ──claim──►  run (gt_agent_runs)  ──steps──►  outcome
                                │ status: queued → running → awaiting | completed | failed
                                │ steps[]: {ts, step_name, action, input_summary?, output_summary?, duration_ms?, status}
                                │ checkpoint: {stage: …} after each expensive stage
                                │ inputs: the event payload (allow_failover, resume_run_id, claims)
                                │ token_usage / cost: per run  [deviation → Track C1/C4: written per call]
                                └ awaiting_input: what a person is asked
```

Rules:

1. **Every expensive stage checkpoints** (`saveCheckpoint`) and **writes its
   results incrementally** ("earn it, write it"): a crash keeps what was
   earned. A retry is a new event with `resume_run_id`; the agent restores
   from the checkpoint through a visible `restore` step and skips what is
   done.
2. **Every step is recorded** with a human-readable action and a summary of
   what came out. The runs feed is the audit trail a person reads; a step that
   only a developer could parse is not recorded properly.
3. **A run names its agent** [deviation → runs are named by event type; Track
   C1 records the agent and a `parent_run_id` for chains].
4. **Heartbeat while running.** The worker bumps `started_at` every 30 s so a
   two-minute stale claim can be reclaimed without waiting for the slowest
   agent.
5. **Concurrency:** batch size caps how many events are claimed; the LLM lane
   caps how many model calls are in flight (one per platform endpoint by
   default). These are different numbers and both matter.
6. **No tool-use loop.** One prompt in, one structured answer out, validated;
   the agent's code decides the next step. This is what keeps every decision
   point readable and testable. It is a choice, not a limitation, and stays
   until a case is made for a specific loop.
7. **Cost is answerable per run**: model, posture (platform | byok), prompt and
   completion tokens [deviation → C1/C4].

## 5. Prompts and output contracts

- A prompt key is `<skill>.<name>`. It has a **contract**: the variables it
  takes, the **output schema** (zod) the answer must satisfy, and **fixtures**
  (input → expected output) checked into the skill's `evals/`. Built
  (C2, 2026-09-30): `agent-core/contract.ts` (`defineContract`,
  `renderContract`, `runContract`), fixtures in
  `src/skills/<skill>/evals/<name>.json` validated by
  `agent-core/contract-fixtures.ts` — a test fails if any contract in
  `src/skills/<skill>/contracts/*.contract.ts` lacks valid fixtures.
  [deviation → existing agents still hand-write prompts and parsers; they
  move onto contracts one by one as real fixture material arrives —
  `docs/fixtures-export.md`.]
- `callLLMValidated(opts, schema, jsonPath?)` is the only way an agent reads a
  structured answer: fences stripped, optional tag extraction, JSON parse,
  schema parse, ONE correction retry that names the stage and fields, then
  `LLM_VALIDATION_FAILED`. Validation failures never fail over.
- **Three shared primitives** cover most needs and are preferred over a bespoke
  prompt: **extract** (facts with evidence span + confidence, complete pairs
  only), **classify** (one of N with confidence), **draft** (prose from
  structured facts in the tenant's voice). Built in `agent-core/primitives.ts`,
  each with a grounding check in CODE: extract rejects a fact whose evidence
  is not verbatim in the source (`EVIDENCE_NOT_IN_SOURCE`), draft rejects a
  cited fact id it was not given (`UNKNOWN_FACT_ID`) and flags prose citing
  none (`NO_FACTS_CITED`). Rejections are returned, never dropped.
- **Every prompt that pastes in crawl text, nodes, search results or another
  model's output sizes it with `charBudgetFor(model, reserveOutput, fixedText)`**
  and says what it trimmed. A cap chosen next to the window drifts from it.
- **`truncated` is read on every call** (`finish_reason === 'length'`); a
  caller that parses a list checks it, because a cut-off list of facts looks
  exactly like a complete one.
- Small models ignore soft formatting instructions; `/no_think` is a qwen
  instruction, declared as `LLM_PRIMARY_SYSTEM_SUFFIX` in .env (platform only).
- **Prompt changes are versioned** (append-only, one active per scope) and run
  the fixtures before they go live (§7).
- **Graph extraction has a contract per ontology version and per home.** It
  names the labels and relationships that may be written in that home, with
  fixtures for each relationship, and is built on the extract primitive (the
  evidence must be verbatim in the source). The pool contract refuses
  Person, Team and KNOWS; the account contract is the only one that may write
  them. A node or edge carries the version that wrote it, its evidence,
  confidence, method, model and `observed_at` / `valid_until`
  (ontology note §7). A new label or relationship is a new ontology version:
  fixtures, the eval run, and Charan's approval — never a prompt edit.

## 6. Failure, failover, and rule 12

- **No silent fallbacks.** A step that fails ends the run with the real cause
  visible. Never substitute a mock, a partial, a stale value or a smaller
  prompt without saying so in the run.
- **Transport failover** (platform tenants only, `LLM_VPS_UNREACHABLE` /
  `LLM_VPS_ERROR`, `ANTHROPIC_API_KEY` set): with `HAIKU_DEFAULT` unset or
  `true` it happens automatically as a visible `llm_failover` step and is
  metered under `escalation`; with `false` the run parks at `awaiting` with the
  real error and a person approves or declines through
  `llm-provider-skill.resolve_failover`. Approval re-emits the event with
  `allow_failover:true`, which the worker stores on the new run's `inputs`
  (fixed 2026-09-30). **BYOK never fails over** to Vikuna's key.
- **Context too large is refused with the numbers**, and the refusal is a
  measurement (`noteContextOverflow`) so the retry is built smaller.
- **An event nobody handles is not resolved `done`.** It stays visible as
  unconsumed (`runs.events`) [deviation → Track C6: the worker still resolves
  it; the read already reports it].
- **A parked run whose work was since done elsewhere is SUPERSEDED**, and the
  queue says so before anyone approves spending on it.

## 6a. Risk boundaries — what an agent may do on its own

Every action an agent can take is DECLARED in its `SKILL.md` with a risk
class, and the harness enforces the class, not the agent's good intentions.

| Class | Kind of action | Autonomy | Examples |
|---|---|---|---|
| **R0** | read and derive, inside the tenant | autonomous within its run budget | read the Brain, classify, crawl a public page, compute a score |
| **R1** | write the tenant's OWN working data, reversibly | autonomous; recorded as a suggestion with provenance; a person can undo | enrich the tenant's copy, draft a story, propose a segment |
| **R2** | write SHARED or platform data | autonomous only behind declared validators, labelled (`unreviewed`, its own source tier) and reversible by admin; otherwise propose | admit a record to the common pool, publish a domain pack |
| **R3** | spend money | **estimate → a person confirms**; hard caps (daily per kind, monthly ₹); unset cap = refused | paid provider call, LLM work over the free lane, failover to the paid model |
| **R4** | externally visible — reaches a person or the public | **never autonomous in v1**: a person approves the item, or an approved template for an approved batch; `mayContact` + the governor on every send | send an email or WhatsApp, publish a page, post |
| **R5** | forbidden | refused in code, whoever asks | contact a suppressed person; read another tenant's data; scrape LinkedIn/X/Facebook profiles; act as a legal actor; change its own prompt, config, budget or class |

Rules:

- **The class is the ceiling.** An agent may ask for less autonomy than its
  class allows (park at `awaiting`), never more.
- **Approval is a token, not a flag in the payload.** R3/R4 actions run only
  with an approval recorded against the run by a `human` actor (the
  `allow_failover` pattern generalised); an unreadable approval counts as none.
- **Budgets are per run, per tenant per day, per kind of work** (code, crawl,
  LLM, paid — POA common pool J3), from `.env` or the tenant's tier; overflow
  waits, visibly, and is never dropped.
- **A pause switch per agent per tenant** stops new runs at once; runs in
  flight finish their current step and park.
- **Blast radius is stated before the run**: how many records, which data,
  which tenants (one, always — except R2 platform jobs, which say so).

[deviation → the classes are declared in this document only; the harness
check and the `SKILL.md` declarations land with the common pool's Sprint 0.]

## 7. Evaluation — mandatory, not aspirational

Every prompt contract ships with fixtures and is measured on three things:

| Measure | What it is | Where it comes from |
|---|---|---|
| **Schema pass rate** | share of fixture answers that parse and validate first time | `npm run eval` |
| **Field agreement** | per-field match against the expected output (exact for enums and ids, fuzzy for spans, numeric tolerance for weights) | `npm run eval` |
| **Human acceptance** | share of agent suggestions a person approved unchanged, per field, in production | provenance on the profile (Track D1) |

Rules:

- `npm run eval` runs the whole fixture set against the current prompts and
  the configured model, and **fails on any regression** against the last
  recorded result. It runs on every prompt version change and every model
  change (a `.env` switch of `LLM_PRIMARY_MODEL` is a model change).
- Results are stored per prompt version and model so two versions can be
  compared [decision D5: `gt_eval_runs`, pending approval].
- **A PR that touches a prompt or a parser adds or intentionally updates a
  fixture.** No fixture, no merge.
- Fixtures are real: a redacted crawl, a real JD, a real member row — never
  synthetic prose that flatters the prompt.
- **Laya-style "cheap classifier lanes" are measured before adoption**
  (`backend/scripts/laya-trial/`: 31 % agreement, confidence uninformative →
  rejected). The cheap lane is code, not a smaller model.
- Evaluation covers the whole harness, not only the model: a fixture may
  assert the run's steps, its checkpoint, and what it wrote.

**Three tiers** — every agent is measured at all three before a phase checks
out:

| Tier | When | What |
|---|---|---|
| **Offline** | every PR touching a prompt, parser or model; CI | fixtures: schema pass rate, field agreement, regression vs last recorded |
| **Shadow** | before a new prompt version or model goes live | the candidate runs beside the live one on real inputs, writes nothing, and its disagreements are reviewed by a person |
| **Online** | continuously in production | human acceptance per field, abstention rate, cost per accepted output, and for outreach the response it earned (signals spine) |

- **Golden sets grow from human decisions.** Every edit or rejection a person
  makes is a candidate fixture (redacted); the set is curated, never
  auto-appended.
- **A model may grade, never decide.** An LLM judge is allowed only with a
  rubric calibrated against human labels, and never as the sole gate.
- **A quality drop is an alert, not a silent rollback.** When online acceptance
  for a prompt version falls below its recorded baseline, an item appears in
  `/runs/awaiting` with the numbers and a one-click return to the previous
  version — a person chooses (rule 12).

[deviation → Track C3 builds the runner and the first fixture sets: profile
drafter, ingestion extractor, domain-pack families/starter, pool industry pass.]

## 8. Learning — human-gated, always

The system gets better because people confirm, never because a model decided
it should. Three loops, all with a person at the gate:

1. **Acceptance as signal.** Provenance per field makes "suggested vs
   approved" a number per agent, per section, per model. It is the quality
   metric and it is what points evaluation at the weakest prompt.
2. **Approved outputs as examples.** A tenant's approved answers become
   few-shot examples in that tenant's prompt override (versioned, visible in
   Prompt Studio), never silently folded into the system prompt.
3. **Calibration proposals.** Where an agent scores (Vara's threshold and
   weights, GTM's fit rules), systematic disagreement with human decisions
   becomes a proposal; approving it writes a new config version. The design is
   Vara's calibration loop (`vara_calibration_signal` / `_proposal`,
   `FIT_LESSONS_REQUESTED`) generalised.

No fine-tuning. No unattended prompt rewriting. **A model is not a legal
actor**: `actor_type` is `human | rule | timer | system`, enforced in the
database, and an agent's decision is a proposal until one of those confirms it.

## 8a. Self-awareness — what every agent knows about itself, and says

An agent is self-aware in a precise, testable sense: at every decision point it
can answer six questions, and its run records the answers.

| Question | What the run carries |
|---|---|
| **What am I for, and what can't I do?** | its declared purpose, actions and risk classes (§2, §6a) — shown on its agent card |
| **What did I read, and what was missing?** | inputs used (Brain sections, sources, records) and the **gaps** — "no offer defined", "no domain for 31 of 400" |
| **How sure am I?** | a confidence per output with its reason; **abstaining is a legal answer** — "not enough evidence" is recorded as such, never replaced by a guess |
| **How good am I, here?** | its own track record in THIS workspace: acceptance per field (§8), shown at the decision card — "industry: 92% accepted; buyer role: 61% — check this one" |
| **What does this cost, and what's left?** | estimate before, actual after, budget remaining today (§6a) |
| **What changed since last time?** | the diff against its previous run on the same subject — new findings, retracted ones |

This is code and data, not a model introspecting: the harness supplies the
budget, the track record and the diff; the agent's code supplies the inputs,
gaps and confidence; the prompt contract (§5) requires the model to return
`confidence` and `evidence` fields and permits `abstain`.

## 8b. The improvement loop — how an agent gets better

```
online signals ─► weakest prompt/field ─► candidate version ─► offline eval
  (§7 tiers)        (acceptance, abstain,     (prompt, examples,   (fixtures +
                     cost, response)           validator, rule)     new golden)
                                                       │
                     promote ◄── a person ◄── shadow run on real inputs
```

- The loop is **proposed by the system and decided by a person**, every time:
  no unattended prompt rewriting, no fine-tuning (§8).
- What may change: the prompt text, few-shot examples from approved outputs,
  a validator, a deterministic rule that replaces a model call (the cheap lane
  is code), a threshold through a calibration proposal.
- What may not: the agent's risk class, its budget, its declared actions —
  those change by a human editing the declaration.
- Every promotion is a new version with its eval report attached; rollback is
  choosing the previous version.
- **For outreach, the unit of learning is the path signature** (§9b):
  offering, pain concept, signal kind, angle, persona. Outcomes (reply,
  meeting, ignore, unsubscribe) attach to the signature, and an aggregate by
  segment ("pharma hiring QA after a trade show answers the compliance
  angle") is a PROPOSAL a person approves, like every other change here.
  Outcomes are tenant data: the learning stays inside the tenant and never
  reaches the pool (rule 13).

## 9. Visibility — what every run owes a person

- The run appears in `/runs` the moment it is created, with its actor,
  trigger, steps, duration and status; `/runs/:id` shows the timeline, what it
  is waiting for, and **what it changed** (nodes by `source_run_id`).
- `/runs/events` shows the bus: attempts, age, whether a handler exists,
  whether a run was created — and the unconsumed list.
- `/runs/awaiting` is the single queue of things parked on a person; the place
  to decide is linked (Knowledge for failover, the Smart Profile for answers).
- The dashboard reads the Brain (score, weakest section, next action) and each
  agent's journey from data, not fixtures. Edge's journey stays a labelled
  preview until it has server state.
- Cost per run is shown once C4 lands. Until then "what did this run cost" is
  answered per tenant per day only, and the UI does not pretend otherwise.

## 9a. Agentic IX — the agent leads, the person decides

Not a chatbot. The agent proposes, works in view, and stops at decisions; a
person steers and approves. Six patterns, every agent:

1. **It proposes the next step** — from its pathway definition (§10), with why.
2. **Its work is visible as it happens** — steps arrive live, not on refresh.
3. **It stops at decision cards** — approve / edit / reject, with evidence,
   confidence and its track record (§8a); never a free-text "what next?".
4. **Every artefact carries its evidence** — source, method, date, confidence.
5. **It keeps working when the person leaves** — and the return is
   "done — 3 things need you", via `/runs/awaiting`.
6. **Conversation steers, it does not lead** — "focus on pharma", "skip this"
   are inputs to a running pathway, not the main surface.

**Transport.** One server-sent-events stream per run (intended:
`GET /api/v1/runs/:id/stream`) carrying the step records the harness already
writes, replacing polling. Event vocabulary borrowed from AG-UI so an adapter
is cheap if ever wanted — `run_started`, `step_started`, `step_finished`,
`finding`, `artefact`, `decision_needed`, `run_finished`, `run_failed` — but no
AG-UI/CopilotKit dependency: our runs are event-bus jobs, not a
request/response chat. nginx must serve the stream with buffering off.

**Components.** One run-feed and one decision-card component in the console's
platform layer, used by every pathway — a logged platform change
(`vani-app/CLAUDE.md` §5), PENDING approval.

[deviation → none of the transport or components exist yet; the console polls
in 7 places. Built as Sprint 0 of the common pool POA.]

## 9b. Evidence paths — no path, no draft

An outreach draft is only as specific as the path behind it. A **path** runs
from one of the tenant's Offerings to a target account (and, with people data,
a Person), crossing the three homes through shared concept ids:

```
Brain: Offering ─SOLVES→ PainPoint(c)
Pool:  Company ─HIRING_FOR→ Role ; JobPosting ─MENTIONS→ PainPoint(c)
Acct:  Person ─WORKS_AT(as Role)→ Company ; Role ─CARES_ABOUT→ PainPoint(c)
```

- Paths are ranked by evidence strength × freshness × fit to the ICP and
  handed to the model by `account.context(purpose)` (§3) — the best few with
  their evidence, not the graph.
- Every claim in a draft cites a fact id it was given (the draft primitive's
  `UNKNOWN_FACT_ID` / `NO_FACTS_CITED`, story-skill's R-S1).
- **Guard: no evidence path, no outreach draft.** The agent says "not enough
  basis on this account — research first" and proposes the research. It does
  not write generic copy; a cold email with the company's name pasted in is
  the failure this exists to prevent (rule 12: degraded output is never
  passed off as the real thing).
- **Story evidence coverage** — the share of drafts with at least one fresh
  path — is an online eval of the Storyteller (§7), reported with its
  acceptance rate.
- Expired evidence (past `valid_until`, e.g. a job posting after ~90 days)
  does not make a path fresh.

[deviation → none of this exists: no pool or account graph, no concept
catalog, no path assembly. Phasing in the ontology note §14; the guard lands
with the first sender.]

## 10. Orchestration — the event bus, and pathways

- **Sequencing is event chains.** An agent finishes by emitting the next event
  (`FILE_UPLOADED → KNOWLEDGE_UPDATED → PROFILE_COMPLETE → …`). A person
  resumes a parked run through a route or a skill function that re-emits.
  There is no DAG runner and none is planned.
- **Journey readers** (`vara.journey`, `gtm.journey`): a function per agent that
  reports done steps and the current one from data. Built 2026-09-30.
- **Pathway definitions** [Track D5]: per pathway, an ordered step list with a
  done predicate and the event each completion emits, held in code. The first
  wire is `PROFILE_COMPLETE → propose an audience`. Journey readers read the
  same definitions once they exist, so the console's declaration and the
  server's stop being two lists.
- **Cross-agent orchestration stays event-shaped.** One agent's output is
  another's trigger; nothing calls another agent's code.
- **Idempotency of a chain** is per claim (SKIP LOCKED + attempts) and per
  agent (a claim stamped inside the transaction that takes it). A chain that
  must not run twice states its claim key in `SKILL.md`.

## 11. Nevers

- Never read tenant or environment from the request body.
- Never call a model provider outside `llm.client`.
- Never store a copy of profile, offers, brand or contacts in an agent's prefix.
- Never alter `vani_` tables from an agent; extend in your own prefix.
- Never use `model` as an audit actor; never let a score close an application.
- Never substitute, truncate or summarise silently.
- Never resolve an unhandled event as done.
- Never ship a prompt change without fixtures, or a write without both halves
  of idempotency.
- Never add a framework, a DAG runner, a second knowledge store, or a
  fine-tune.

## 12. Checklist for a new agent or worker

1. `vani_agent` row (or a declared reason it is derived), roles, metering
   units, templates, pack namespace.
2. Event types handled and emitted; `handled-events.ts` updated; consumers
   named.
3. `SKILL.md` with functions, params, returns, idempotency posture, claim key.
4. Prompts as keys with contracts and fixtures; `npm run eval` green.
5. Reads the Brain through `brain.context`; writes nothing it does not own.
6. Steps recorded; checkpoints after expensive stages; results written
   incrementally.
7. Parks at `awaiting` before anything externally visible; the queue links
   the place to decide.
8. `journey` function and the console's journey declaration agree.
9. DB tests: three-check pattern, real Postgres, real router where a route
   exists.
10. Appears correctly in `/runs`, `/runs/events`, the dashboard and the agents
    list before it is called done.
11. Every action declared with its risk class (§6a); R3/R4 paths tested to
    refuse without an approval; budgets tested by a forced overrun.
12. Runs report inputs, gaps, confidence (with abstain), cost and budget left
    (§8a); the decision card shows its track record.
13. An eval report at all three tiers (§7) attached to the phase checkout.
14. Writes a graph only through its home's extraction contract for the current
    ontology version (§5); labels and relationships come from
    `agent-core/ontology.ts`, never from the prompt.
15. Reads an account through `account.context`, the tenant through
    `brain.context`; an outreach agent refuses to draft without an evidence
    path (§9b) and reports story evidence coverage.
