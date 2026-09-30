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

- **The Brain**, through `brain.context(purpose)` — profile, relevant subgraph,
  vocabulary, offers, brand, under a character budget [deviation → Track D2;
  today research, storyteller and the drafter paste `getNodes()` whole under
  `charBudgetFor`, and Vara reads only `industry`].
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
  (input → expected output) checked into the skill's `evals/` [deviation →
  Track C2/C3; today each agent hand-writes its parser and there are no
  fixtures].
- `callLLMValidated(opts, schema, jsonPath?)` is the only way an agent reads a
  structured answer: fences stripped, optional tag extraction, JSON parse,
  schema parse, ONE correction retry that names the stage and fields, then
  `LLM_VALIDATION_FAILED`. Validation failures never fail over.
- **Three shared primitives** cover most needs and are preferred over a bespoke
  prompt: **extract** (facts with evidence span + confidence, complete pairs
  only), **classify** (one of N with confidence), **draft** (prose from
  structured facts in the tenant's voice). [deviation → C2.]
- **Every prompt that pastes in crawl text, nodes, search results or another
  model's output sizes it with `charBudgetFor(model, reserveOutput, fixedText)`**
  and says what it trimmed. A cap chosen next to the window drifts from it.
- **`truncated` is read on every call** (`finish_reason === 'length'`); a
  caller that parses a list checks it, because a cut-off list of facts looks
  exactly like a complete one.
- Small models ignore soft formatting instructions; `/no_think` is a qwen
  instruction and is appended only when the model name contains "qwen".
- **Prompt changes are versioned** (append-only, one active per scope) and run
  the fixtures before they go live (§7).

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
