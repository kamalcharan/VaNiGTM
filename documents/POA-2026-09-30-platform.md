# POA — VaNi platform, Vara, GTM · 2026-09-30

> Supersedes `POA-VaNi-GTM.md` (May) as the execution plan and folds in
> `vikunawebsite/docs/vani/vara-execution-poa.md` (Aug 27), which is out of
> date on migration numbers and on what reached `main`. Rulings from Charan
> on 2026-09-30 are marked **[ruled]**; everything still needing an answer is
> in §2 and carries a default that applies until overruled.
>
> Facts in this plan were checked in code on 2026-09-29/30 (HANDOVER.md §2 has
> the Vara evidence; the runtime audit is summarised in §4 below).

## Status — 2026-09-30, end of day

| Track | State |
|---|---|
| A Foundations | **DONE.** `ARCH.md`, `AGENTS.md`, `documents/spec/{PLATFORM,VARA,GTM}.md`; May POA, May agent spec, Aug Vara POA marked superseded (A6) |
| B Unblock | **DONE (2026-09-30).** Phase 4 gate passed (Charan: snippet on a real page, boot landed). B1 merged (migrations 254–258; **applied on production by Charan, 2026-09-30**); B2 fixed + DB test; B3 runs/events/awaiting real on both sides; B4 dashboard on the Brain, `vara.journey` and `gtm.journey` real (`edge.journey` stays a labelled preview by design); B5 drift fixed. The runtime DB role was switched to `vanigtm_app` the same day (RLS enforced) |
| C Harness | **C6 DONE (2026-09-30):** the worker claims only event types it handles; the rest wait in `pending` with a `waiting_reason` and run when an agent subscribes (`runs.events` counts them as `waiting_for_agent`). **C5 DONE (2026-09-30):** platform calls also hold one of `LLM_MAX_CONCURRENT` Postgres advisory locks per endpoint, so the limit spans the API, every worker and every box; proven with real separate processes, including one killed mid-call. **C2 infrastructure DONE (2026-09-30):** contracts, the extract/classify/draft primitives with grounding checks in code, fixture validation enforced by a test. Converting agents (drafter, extractor, pool industry pass, Vara JD import) waits on real fixture material — `docs/fixtures-export.md`. Next: that conversion, C1 (needs D14), C3 |
| D Brain | **D2 started (2026-09-30):** `agent-core/brain.context.ts` — `loadBrain` reads profile, graph and approved vocabulary in one tenant transaction (verified under RLS as a non-owner role); `brainContext(purpose)` renders under `charBudgetFor` and refuses with the numbers when the profile alone does not fit. **Rule (Charan): a conversion does not change what the agent sends the model.** Converted: storyteller (`deck`, compared character for character with its old code), competitor research and offer drafting (data only; prompts byte-identical, offer-draft message asserted in a DB test). The profile drafter is NOT a Brain reader — it reads crawl text and writes the profile — so it has nothing to convert. **D2 is complete for every Brain reader (checked 2026-09-30).** Domain-pack and Vara were on the list but read no Brain: the domain-pack agent is given only the industry string ON PURPOSE (its packs are platform data; a tenant's Brain must not leak into them), and Vara reads `vn_tenant_profiles.industry` (registration), not the Smart Profile. Whether Vara should read the Brain's industry instead is a design decision for D3, not a conversion. D1 needs D8; D4 (embedding retrieval) slots in behind the same signature |
| E Funnel | not started; D2 ruled (website URL, wizard step 1 pre-done) |
| F Vara | gate passed 2026-09-30; **next blocker is D9 consent** — candidate intake cannot start without it |
| G GTM | parked, recorded |
| H One repo | next. **Clarified 2026-09-30:** "before any C/D code" means before any CONSOLE code — H moves `vani-app/`, never `backend/`, so backend-only slices (C6, C1–C5, D2) can land before it without moving twice. Console work waits for H |

Both repos: branch `claude/brave-sagan-25311u` merged to `main` on 2026-09-30.

## 0. Principles

1. Spec is INTENDED. Where the product deviates, the product is corrected
   **[ruled]**.
2. Every slice changes something visible within about a week, or rides
   under something that does. Invisible infrastructure gets no phase of its own.
3. No agent framework. Hermes and the like stay out **[ruled]**. The harness
   is ours and is strengthened, not replaced.
4. No DAG runner **[ruled]**. Orchestration stays an event bus, made visible.
5. The Smart Profile (Brain + knowledge graph) is the feeding engine for
   every agent, Vara included **[ruled]**. One graph, no second copy.
6. Models and providers are `.env` decisions, never code **[ruled]**.
7. Rule 12 stands: nothing falls back silently, including unconsumed events.
8. No schema without approval. §7 lists every table or column this plan needs.

## 1. The shape of the work

```
TRACK A  Foundations      ARCH.md · AGENTS.md · spec set               (docs, no code)
TRACK B  Unblock          Vara branch merge · failover defect · visibility · journey readers
TRACK C  Harness          run table · prompt contracts · evals · lanes · cost per run
TRACK D  Brain            provenance per field · brain.context · KG for Vara · retrieval · pathways
TRACK E  Funnel           landing → pre-signup crawl → signup → agent catalog → wizard pre-done
TRACK F  Vara             Phase 4 gate · consent · candidate lifecycle · import
TRACK G  GTM              pool landing · ICP data structure · people · cleanup source
         Edge backend     after the entitlement model (Track E) exists
TRACK H  One repository   website (as web/) + vani-app + backend in VaNiGTM; frontend/
                          deleted with every reference; vikunawebsite archived (corrected
                          2026-09-30) — its own plan: POA-2026-09-30-repo-consolidation.md.
                          Console/website work waits for it; backend work does not.
```

A and B start together. C and D start once A is written, because they are
what A specifies. E needs D's `brain.context` and its own schema decision.
F and G are the products; they consume everything above and each has its
own gate.

## 2. Decisions register

Each has a default. The default applies until Charan says otherwise, so no
track stalls on an unanswered question.

| # | Decision | Default | Blocks |
|---|---|---|---|
| D1 | ~~Merge VaNiGTM `claude/session-setup-qrxev9` with its five migrations renumbered 254–258~~ **DONE 2026-09-30**: merged (06a9635), 254–258 applied on production | — | — |
| D2 | Pre-signup input is the website URL; the wizard's step 1 is pre-done **[ruled]** | — | E |
| D3 | Anonymous pre-signup session row, later bound to the tenant | Approve one table (§7) | E1 |
| D4 | Entitlement / purchase model, one for all agents (Vara, GTM, Edge) | Approve `vani_entitlement` (§7); payment provider later | E3, Edge |
| D5 | Eval results storage | One table `gt_eval_runs` (§7) | C3 |
| D6 | Embedding provider (Haiku has no embeddings; Ollama is off the path) | Env-configured OpenAI-compatible `/v1/embeddings` endpoint; provider named in `.env` | D4 |
| D7 | Vector columns on `gt_kg_nodes`, `gt_tenant_profile`, `gt_semantic_clusters` | Approve (§7); pgvector is already on the VPS | D4 |
| D8 | Per-field provenance on `gt_tenant_profile` | Approve the JSONB shape (§7); no new table | D1 |
| D9 | Consent / suppression model, one for GTM outreach and Vara intake | Design first (D-track), approve, then F2 | F2, G |
| D10 | Vara seniority: modifier on the family shape vs pack per level | Modifier | F |
| D11 | Vara: tenant shape supersedes at take-time (built) vs first publish | Keep take-time; say it in the UI | F |
| D12 | Lane-aware onboarding status; industry as a master list (Aug 27 D1/D2) | Lane-aware status: yes. Industry list: draft 254 in `documents/drafts/` becomes real | E, F |
| D13 | `vara_jd_position` | Design with F2 | F2 |
| D14 | `gt_agent_runs` cleanup migration | Approve (§7) | C1 |

## 3. Track A — Foundations (documents)

Outcome: three documents that every later slice is checked against.

| Slice | Deliverable | Done when |
|---|---|---|
| A1 ✅ | `ARCH.md` at VaNiGTM root, pointed to from both CLAUDE.md files | Covers: tenancy + `is_live`; transport and the skill runner; idempotency store-and-replay (`vani_idempotency`, §7); transactions and prepare→confirm; event claim/heartbeat/reclaim semantics; race rules (stale responses, double submit, ordering); env-only configuration; RLS posture; error contract `{error:{code,message}}` and the "name the failure class" rule |
| A2 ✅ | `AGENTS.md` at VaNiGTM root | Covers: what an agent declares (registry, events, prompts, contracts, journey, activation checklist); what it consumes (Brain via `brain.context`, prompts via store, comms, metering, audit); the harness (run, steps, checkpoint, awaiting, cost); prompt + output contracts; evaluation methodology (§5); visibility rules; nevers |
| A3 ✅ | `documents/spec/PLATFORM.md` | Positioning, personas, funnel (Track E), agent integration contract (from the Aug spec, kept), shared services, Smart Profile as Brain, onboarding lanes, data model `vn_`/`vani_`/`gt_tenant_profile`/KG/clusters/prompts/metering/audit. User stories P-xx. Built-today column |
| A4 ✅ | `documents/spec/VARA.md` | The existing spec corrected to `main`, journey map folded in, decisions D10/D11/D13 recorded. Stories V-xx kept |
| A5 ✅ | `documents/spec/GTM.md` | Written fresh from the standing decisions (HANDOVER §📌), the two journey maps, and the design notes (research, universe, ICP data structure, outreach). Stories G-xx |
| A6 ✅ | Retire: `POA-VaNi-GTM.md`, `vara-execution-poa.md`, `VIKUNA_AGENT_SPEC_V1.md` → marked superseded, kept for history |

Order: A1, A2 first (one session), A3 next, A4 and A5 in parallel with Track B.

## 4. Track B — Unblock what is shipped but dead

Outcome: the deployed console and the deployed API agree, and what runs is visible.

| Slice | What | Visible result |
|---|---|---|
| B1 ✅ (gate passed 2026-09-30) | Merge `claude/session-setup-qrxev9` (D1). Renumber migrations 254–258. Resolve the three conflicts (`package.json`, `server.ts`, `vara.routes.ts`); keep `main`'s origin normaliser and tests, keep the branch's `PATCH /tenant/domains/:id/origins` because the Install screen calls it; keep the branch's activation-reconciles and purpose-is-not-a-gate; fix the snippet name (`vani.js`). `--status`, deploy, run **Phase 4 gate**: paste the snippet on a real page, watch a boot land | The Vara widget boots on a tenant page. `/install` works |
| B2 ✅ | Failover defect: the worker copies the event payload into `gt_agent_runs.inputs` at `createRun` (or `mayFailOver` reads the event). Test against a real row, not a mocked SQL string | An approved failover actually escalates |
| B3 ✅ | Visibility, no new tables: real `runs.list` / `runs.get` (steps timeline, cost once C4 lands, "what this run changed" from `source_run_id`); `events.list` with status/attempts/age and an **emitted-but-unconsumed** panel; one awaiting queue merging failover questions and human approvals | `/runs` in the console stops being a fixture. `PROFILE_COMPLETE` sitting unconsumed is visible |
| B4 ✅ | Journey readers: `vara.journey`, `gtm.journey`, `edge.journey` as real skill functions over existing data. Dashboard reads the profile completion + weakest Brain section + next action (port of `/today`'s logic) | The dashboard is about the tenant, not a fixture |
| B5 ✅ | Docs drift: CLAUDE.md profile weights (25/20/20/15/10/10), runs named by agent not event (lands with C1) | — |

## 5. Track C — Harness

Outcome: prompts have contracts, contracts have fixtures, runs have cost, concurrency is real across processes.

| Slice | What |
|---|---|
| C1 | `gt_agent_runs` cleanup (D14): retire May columns, real `agent_name`, `parent_run_id`, per-run `prompt_tokens`/`completion_tokens`/`model`/`posture`, status reduced to the five in use. Data kept |
| C2 | Prompt contracts: each `gt_prompts` key declares variables + output schema (zod) + fixtures; `prompt.store` gains `render`; `callLLMValidated` takes the contract. Three shared primitives: **extract** (evidence span + confidence), **classify**, **draft**. First consumers: profile drafter, ingestion extractor, pool industry pass, Vara JD import |
| C3 | Evaluation (methodology in AGENTS.md): fixture set per contract in `backend/src/<skill>/evals/`; measures = schema pass rate, per-field agreement vs expected, human acceptance rate (from D8 provenance in production); `npm run eval` runs on any prompt or model change and fails on regression; results in `gt_eval_runs` (D5) |
| C4 | Cost per run: every call writes tokens + model into the run (C1 columns); `token_usage` stops being dead |
| C5 | Lanes across processes: Postgres advisory locks keyed by endpoint hash + slot index; caller tries slots 0..N-1; the in-process lane stays as the fast path. No table |
| C6 | Unhandled events are not silent: an event with no handler is left `pending` with a visible reason, not resolved `done` |

## 6. Track D — Brain

Outcome: one graph every agent reads, through one service, with retrieval.

| Slice | What |
|---|---|
| D1 | Per-field provenance on the profile (D8): `{value, source: human|agent, run_id, approved_at}`. Agents write suggestions; humans approve; re-runs never touch approved values. Acceptance rate becomes measurable |
| D2 | `brain.context(purpose)` in agent-core: returns profile + relevant subgraph + vocabulary + offers + brand for a stated purpose, under `charBudgetFor`. Every agent reads through it. Research, storyteller, drafter, domain-pack and Vara's compose/match converted |
| D3 | Vara in the graph: industry, role family, pack become KG nodes and edges linked to the tenant's products and buyers. `vani_role_family` stays the org table; the graph carries the relationships. No second copy of contacts, offers or brand anywhere (Brain rule) |
| D4 | Retrieval (D6, D7): embeddings on nodes, profile, clusters; similarity ranking + vocabulary boost (the ContractNest design in `design-notes-smartprofile-port.md`); `brain.context` uses it once the graph exceeds the window. Same provider serves the pool matcher and Vara skills |
| D5 | Pathway definitions (server-side, code not schema): per pathway an ordered step list with done predicates and the event each completion emits. `PROFILE_COMPLETE` → propose an audience is the first wire. Journey readers (B4) read from the same definitions |

## 7. Track E — Funnel (landing → agents)

Outcome: a visitor becomes a tenant with a pre-done profile and chosen agents.

```
vikuna.io / vani.vikuna.io   →  "enter your website"   →  crawl on an anonymous token
        ↓ teaser: the first profile card                (rule 12: real crawl or "could not read it", never sample)
signup  →  token bound to the new tenant                (D3)
        →  agent catalog: Vara · GTM · Edge, each activated (and paid) individually   (D4)
        →  Mission Wizard opens with step 1 DONE from the crawl
        →  dashboard (B4)
```

| Slice | What |
|---|---|
| E1 | Anonymous session (D3): crawl runs as an event with no tenant, keyed to a session token; signup binds it; ingestion nodes re-parent to the tenant in one transaction |
| E2 | The landing "enter your website" surface on the website repo, teaser card, signup handoff. The existing signup gate stays a front door, not a lock |
| E3 | Agent catalog reads real `vani_agent` + `vani_tenant_agent`; activation per agent through the existing lane model; entitlement check (D4) before activation; payment provider is a later slice behind the same check |
| E4 | Wizard reads the pre-done step; the rest unchanged |

## 8. Track F — Vara

Order after B1: consent (D9) → candidate intake on the widget → knockouts + score snapshot → probability map → closing window → handover queue → calibration → import (C2's extract primitive) → pulse. Recruiter routes already exist as `NotYet` pages; replace one at a time. Comms: email-only first unless MSG91 is ported; `vani_template` gets its six rows with the first send. Every slice ends with the run visible in B3.

Gate: first real candidate applies on a tenant page, is scored, and reaches a hiring manager's verdict.

## 9. Track G — GTM

Waits on D9 (consent) for anything that sends, and on the ICP data structure approval (`design-notes-icp-data-structure.md`) for people. Until then: pool landing as a worker job (proven at 50k locally), companies Pass 0/1 on Haiku, the GTM landing opening on the Brain (journey map station 1) using `brain.context`. Everything already recorded in HANDOVER §3 stands.

## 10. Schema decisions this plan needs (all pending approval)

| Table / column | Track | Why the existing model cannot carry it |
|---|---|---|
| ~~Migrations 254–258 (renumbered branch)~~ | B1 | **Applied on production 2026-09-30** |
| `gt_agent_runs` cleanup (retire columns, add cost + parent) | C1 | Cost per run is unanswerable today; May constraint is wrong |
| `vani_idempotency` (key, tenant, result, expires) | A1/C | Store-and-replay needs a home; advisory lock covers only in-session retries |
| `gt_eval_runs` | C3 | Eval results must be comparable across prompt and model versions |
| `gt_tenant_profile` provenance JSONB shape | D1 | Fields have no source; approved values can be overwritten |
| `vector(768)` on `gt_kg_nodes`, `gt_tenant_profile`, `gt_semantic_clusters` + HNSW | D4 | Retrieval |
| Anonymous session (`vn_anon_session` or similar) | E1 | Pre-signup crawl has no owner |
| `vani_entitlement` | E3 | Per-agent paid activation has no record |
| Consent / suppression | D9 | Nothing may send without it |
| `vara_jd_position` | F | Immutable JD version cannot hold mutable seats |

Everything else in this plan is code over existing tables.

## 11. Sequencing, first four weeks

```
Week 1   A1 ARCH.md · A2 AGENTS.md · B1 merge · B2 failover fix   ✅ 2026-09-30
         Phase 4 gate (deploy + a person) · H1–H4 one repo          ← next session opens here
Week 2   A3 PLATFORM spec · B3 visibility · B4 journey readers + dashboard · C1 run table
Week 3   A4/A5 Vara + GTM specs · C2 contracts + primitives · D1 provenance · D2 brain.context
Week 4   C3 evals · C5 lanes · D3 Vara in the graph · E1/E2 funnel front half
```

Each week ends with something a tenant or an operator can see. After week 4:
D4 retrieval (needs D6/D7), D5 pathways, E3 catalog + entitlement, then F and
G in their own order.

## 12. Out of scope, so nobody starts it

Agent frameworks · DAG runner · fine-tuning · unattended learning (a model is
never a legal actor) · LinkedIn scraping · a second knowledge store · anything
listed under "Deliberately not being built" in CLAUDE.md.
