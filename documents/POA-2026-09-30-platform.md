# POA — VaNi platform, Vara, GTM · 2026-09-30

> Supersedes `POA-VaNi-GTM.md` (May) as the execution plan and folds in
> `vikunawebsite/docs/vani/vara-execution-poa.md` (Aug 27), which is out of
> date on migration numbers and on what reached `main`. Rulings from Charan
> on 2026-09-30 are marked **[ruled]**; everything still needing an answer is
> in §2 and carries a default that applies until overruled.
>
> Facts in this plan were checked in code on 2026-09-29/30 (HANDOVER.md §2 has
> the Vara evidence; the runtime audit is summarised in §4 below).

## Status — 2026-10-01 (end of day)

| Track | State |
|---|---|
| A Foundations | **DONE.** `ARCH.md`, `AGENTS.md`, `documents/spec/{PLATFORM,VARA,GTM}.md`; May POA, May agent spec, Aug Vara POA marked superseded (A6) |
| B Unblock | **DONE (2026-09-30).** Phase 4 gate passed; B1–B5 done. **The runtime role is still `vikuna_admin` — RLS is NOT enforced in production** (read off the VPS 2026-09-30 ~23:40; DEPLOY.md §4b). `DB_MIGRATE` is set on the box |
| C Harness | **C6, C5 DONE; C2 infrastructure DONE (2026-09-30).** Open: converting agents onto the C2 primitives (needs fixture material, `docs/fixtures-export.md`), C1 (needs D14), C3, C4 |
| D Brain | **D2 complete for every Brain reader (2026-09-30).** **Industry is now a Smart Profile fact (2026-10-01):** asked on the wizard's company card, shown in Smart Profile → Company; stored where Vara and the research read it (`vn_tenant_profiles.industry`), so saving it starts the industry research. **Document upload into the knowledge graph (2026-10-01):** Knowledge → Teach VaNi → A document (PDF, Word, PowerPoint, text, markdown, up to 10 MB) — read with the existing parsers, then the pasted-text road (`POST /api/v1/ingest/file` → `FILE_UPLOADED` → extraction); a file with no readable text (scanned PDF) is refused with the reason. Before it, only a web page or pasted text could be taught. D1 needs D8; D3 is a design decision; D4 needs D6/D7 |
| E Funnel | **E1 + E2 LIVE (2026-10-01)** at vani.vikuna.io: website → card, digital audit, knowledge graph; signup through the access phrase keeps the preview as the first Smart Profile; "Request access" → a lead (admin list `/access-requests`). Migrations 261 + 262 applied. **Open:** Vikuna's graph snapshot for the landing; E3 (needs D4); E4 |
| Onboarding / Smart Profile | **connect@vikuna.io onboarded on production**, marked admin. Brand colours from what a real browser painted (n8n → browserless `/function`). **People: invite makes a copyable `/join` link** (verified on production). **Industry research now runs from onboarding** — before this, the wizard marked the organisation step done with no data, no industry was recorded and DOMAIN_ENRICHMENT_REQUESTED never fired, so Vara had no role families (found on connect@, fixed and verified 2026-10-01). The organisation step asks only name + industry; the wizard's finish routes to the remaining lane steps; `/onboarding/declare?step=&next=` reopens a step. Fixed on the way: `GET /tenant/profile` selected a nonexistent `arn` column (500) |
| F Vara | **F0 landing DONE (2026-10-01)** — the reviewed journey prototype (`documents/prototypes/vara-journey.html`) as `/agents/vara`, on real data only: Smart Profile context (organisation, industry, domain), one next action in dependency order (domain → industry → activate → first job → careers site → another job), the industry-preparation band from the domain-pack research status, and milestones that never overclaim (Activated · Job published · **Website verified from an observed widget boot** · Applications unavailable). Old autoplay demo and the "what Vara does" claims removed. **F0 remainder:** role-first JD Studio (D16), context-confirm step, no redirect after publish (go to the careers site), server-side drafts. Then D9 consent capture → candidate intake |
| G GTM | **G0 landing DONE (2026-10-01)** — the reviewed prototype (`documents/prototypes/gtm-journey.html`) as `/agents/gtm`, on real data only: one recommended next action (profile → offers → audience → research → people), discovery findings from the last website read, offers, audience counts (`gtm.journey` now returns them), knowledge sources. What does not exist is stated, not simulated: outreach channels (sending off until consent), activation + DPDP acknowledgement (D17 + notice wording in legal review). The "Preview data" badge now shows only on the four sample pages (Today, Motion, Journeys, Channels) instead of every GTM page. **G0 remainder:** activation (D17), hide or finish the sample pages |
| H One repo | **H1 + H3 done 2026-10-01** (branch, awaiting merge): website, console and `documents/vani/` in this repo with history; `frontend/` and ProKey deleted; CI added. Left, all Charan's: tags (H0), Vercel re-point (H2), archive vikunawebsite (H4), one laptop checkout (H5) |

### Infrastructure changed 2026-10-01 (n8n server `srv1096269`)

- `vani-render-page` imported fresh and published; its Render node calls browserless `/function` at the Docker gateway (`172.18.0.1:3010`).
- browserless recreated with a **new token** (the old one was exposed in a chat) and **bound to `172.18.0.1` only** — port 3010 is closed from the internet (checked).
- n8n user management was reset (backup `/root/n8n-backup-20261001-0637.tgz`).

### Reviewed prototypes (2026-10-01) — what they changed in this plan

The Vara and GTM journey prototypes (`documents/prototypes/`) were reviewed and
adopted as the target. Their principles, kept in the code: inherit from the
Smart Profile and never re-ask; preparation runs beside the task with distinct
ready / preparing / failed / no-match states; one next action; milestones that
name what is and is not true ("Applications unavailable", "importing does not
authorise outreach"). What is built is listed under F and G above; the rest is
F0/G0 remainder and the decisions D15–D17.

### Deviation from this plan (recorded 2026-10-01, end of day)

Planned for the day: **H (one repo) → F0 → G0**. What actually happened:
most of the day went to work this plan did not schedule, each piece pulled in
by something found while using the product. All of it is real and merged; none
of it advanced H.

| Unplanned work | Why it happened | Plan slot it belongs to |
|---|---|---|
| Industry asked in onboarding; research now runs (`DOMAIN_ENRICHMENT_REQUESTED`) | Vara had no families for connect@ — the wizard skipped the organisation step | D (Brain) / Onboarding |
| Organisation step cut to name + industry; profile prefilled | Charan: "values already captured, why repeating" | Onboarding |
| Invite links (`/join`) | People section said "sent", nothing was sent or acceptable | Onboarding |
| UX audit brief (VaNi, Vara, GTM journeys + 26 issues) | External audit requested | — (input to F0/G0) |
| Vara and GTM landings from the reviewed prototypes | Prototypes reviewed and adopted | **F0 / G0 — planned** |
| Document upload into the knowledge graph | GTM "strengthen knowledge" had nothing to upload with | D |
| Import: people from numbered columns (REP_BY1…) were lost | Found while measuring a "6-minute" import | G (pool/import) — a data-loss bug |
| `GET /tenant/profile` 500 (`arn` column) | Exposed by the organisation-step prefill | — bug |

Two findings from it change the order below:
- **The 6-minute import was network, not code** (2,900 rows land in 2.5–5 s
  next to the database). Imports must be run on vani.vikuna.io, never from a
  laptop pointed at the production database.
- **Every import made with numbered representative columns before 9f5d6dd
  lost its people.** Charan's FTCCI-shaped file needs its people re-landed.

**Rule from here:** a bug found in passing is fixed only if it loses data or
blocks the slice in hand; everything else is written under "Smaller" and the
slice continues. Track H is next and nothing else starts before it.

### Priority set by Charan (2026-10-01, evening): GTM activation first, then the common pool

"Let's first make GTM ready and then we will discuss the common pool." GTM
activation has three parts, each with a reason from Charan:

1. **DPDP acceptance** — very important. Decided 2026-09-30 (design-notes-consent §6b): the tenant reads what the DPDP Act means for outreach and accepts; that switches sending on; Settings can switch it off. `vani_tenant_acknowledgement` is live (260). Missing: the notice wording, the screen, the API.
2. **Email outreach** — important for activation. The safety half exists (suppression, the `mayContact` gate, `gt_channels`, the cadence governor, `gt_touch_log`); **nothing in the backend can send an email yet.** The tenant sends under its own identity (ruling 2026-09-22).
3. **Tiers** — a business model is coming, tiered on research runs, common-pool access and enrichment. Needs `vani_entitlement` (D4, schema approval) once the tiers are known.

### Pending, in order

0. **Today's leftovers** — deploy the backend; re-run the nginx copy (10 MB uploads); re-land the people of the FTCCI-shaped import (re-save the Excel under a new name, upload on vani.vikuna.io).
1. **Track H — console into this repo.** H1 + H3 done 2026-10-01; after the merge, Charan re-points Vercel (H2), then archives vikunawebsite (H4).
2. **GTM activation, step 1 — DPDP acceptance.** ✅ BUILT 2026-10-01 (branch): accept/revoke under Settings → Outreach consent (owner/admin only), status on the GTM landing, history kept, the gate verified after each decision (10 DB tests). No `vani_agent` row was needed (agent scope is a code, migration 260). **Left: the wording.** v1 is our DRAFT in `documents/drafts/263_vani_gtm_outreach_notice_v1.sql.draft`, deliberately outside `migrations/`; *needs Charan's (or legal's) approval*, then it moves to `migrations/` and is applied with the runner. Until then every workspace reads "not published" and nothing can be accepted.
3. **GTM activation, step 2 — connect the tenant's email.** SMTP to the tenant's own mailbox first (works with Google Workspace and Microsoft 365), credentials encrypted per tenant (`secret.crypto`, as BYOK), stored on `gt_channels`; a test send to the tenant themself; SPF/DKIM shown as checked or missing. *Needs from Charan: OK to start with SMTP (provider APIs later).*
4. **GTM activation, step 3 — send one approved email.** Draft from the offer → a person approves → `mayContact` (acceptance, suppression) → cadence slot → send through the tenant's channel → `gt_touch_log`; every email carries an unsubscribe link that writes suppression. No bulk, no automatic sends.
5. **GTM activation, step 4 — "Activated" becomes real.** Offer ready + DPDP accepted + email connected → GTM live for the tenant; the landing's Activate card and milestones read it.
6. **Tiers and entitlement** — when the business model is set: `vani_entitlement` (schema approval), checked at activation; research runs, pool reads and enrichment metered against the tier. Until then every tenant is on a "beta" grant.
7. **The common pool** — discussed 2026-10-01; plan in `POA-2026-10-01-common-pool.md` (decisions D-P1…12, three tests Complete / Exit / Coverage, phases P0–P9). Next: P0 mapping for schema approval.
8. **Vara: rest of the first-job journey (F0)** — role-first JD Studio etc. Needs two answers: do role families leave the main path (recommended yes), and seniority as an adjustment of one playbook (recommended).
9. **RLS switch on production** — runtime to `vanigtm_app` per DEPLOY.md §4b.
10. **Vara consent capture, then candidate intake.**
11. **Later:** landing graph snapshot; test-workspace cleanup; run cost + evals (schema approvals); agent catalog; background import for 25k+ files; a tenant's own Apollo key (schema approval).
12. **Smaller:** GTM sidebar regrouping; BYOK test-connection SSRF guard; withdraw invitation; uploaded .txt labelled "pasted"; organisation name defaults to the person; the vikuna.io site's Tailwind build.

### 2026-09-30 detail (kept)


| Track | State |
|---|---|
| A Foundations | **DONE.** `ARCH.md`, `AGENTS.md`, `documents/spec/{PLATFORM,VARA,GTM}.md`; May POA, May agent spec, Aug Vara POA marked superseded (A6) |
| B Unblock | **DONE (2026-09-30).** Phase 4 gate passed (Charan: snippet on a real page, boot landed). B1 merged (migrations 254–258; **applied on production by Charan, 2026-09-30**); B2 fixed + DB test; B3 runs/events/awaiting real on both sides; B4 dashboard on the Brain, `vara.journey` and `gtm.journey` real (`edge.journey` stays a labelled preview by design); B5 drift fixed. The runtime DB role was switched to `vanigtm_app` the same day (RLS enforced) |
| C Harness | **C6 DONE (2026-09-30):** the worker claims only event types it handles; the rest wait in `pending` with a `waiting_reason` and run when an agent subscribes (`runs.events` counts them as `waiting_for_agent`). **C5 DONE (2026-09-30):** platform calls also hold one of `LLM_MAX_CONCURRENT` Postgres advisory locks per endpoint, so the limit spans the API, every worker and every box; proven with real separate processes, including one killed mid-call. **C2 infrastructure DONE (2026-09-30):** contracts, the extract/classify/draft primitives with grounding checks in code, fixture validation enforced by a test. Converting agents (drafter, extractor, pool industry pass, Vara JD import) waits on real fixture material — `docs/fixtures-export.md`. Next: that conversion, C1 (needs D14), C3 |
| D Brain | **D2 started (2026-09-30):** `agent-core/brain.context.ts` — `loadBrain` reads profile, graph and approved vocabulary in one tenant transaction (verified under RLS as a non-owner role); `brainContext(purpose)` renders under `charBudgetFor` and refuses with the numbers when the profile alone does not fit. **Rule (Charan): a conversion does not change what the agent sends the model.** Converted: storyteller (`deck`, compared character for character with its old code), competitor research and offer drafting (data only; prompts byte-identical, offer-draft message asserted in a DB test). The profile drafter is NOT a Brain reader — it reads crawl text and writes the profile — so it has nothing to convert. **D2 is complete for every Brain reader (checked 2026-09-30).** Domain-pack and Vara were on the list but read no Brain: the domain-pack agent is given only the industry string ON PURPOSE (its packs are platform data; a tenant's Brain must not leak into them), and Vara reads `vn_tenant_profiles.industry` (registration), not the Smart Profile. Whether Vara should read the Brain's industry instead is a design decision for D3, not a conversion. D1 needs D8; D4 (embedding retrieval) slots in behind the same signature |
| E Funnel | **E1 built 2026-09-30, not deployed** (`src/funnel`, migration 261 written not applied, D3 approved as recommended): website preview before signup with three reuse layers, per-IP limit, anonymous spend capped by the `vikuna-funnel` tenant's daily cap, SSRF-guarded fetch, claim after signup. E2 (landing page) waits on where it is built; E3 on D4; E4 next |
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
| D3 | Anonymous pre-signup session row, later bound to the tenant | **Approved as recommended and BUILT** (`documents/design-notes-funnel-anon-session.md`; migrations 261 + 262 applied on production; live since 2026-10-01) | — |
| D4 | Entitlement / purchase model, one for all agents (Vara, GTM, Edge) | Approve `vani_entitlement` (§7); payment provider later | E3, Edge |
| D5 | Eval results storage | One table `gt_eval_runs` (§7) | C3 |
| D6 | Embedding provider (Haiku has no embeddings; Ollama is off the path) | Env-configured OpenAI-compatible `/v1/embeddings` endpoint; provider named in `.env` | D4 |
| D7 | Vector columns on `gt_kg_nodes`, `gt_tenant_profile`, `gt_semantic_clusters` | Approve (§7); pgvector is already on the VPS | D4 |
| D8 | Per-field provenance on `gt_tenant_profile` | Approve the JSONB shape (§7); no new table | D1 |
| D9 | Consent / suppression model, one for GTM outreach and Vara intake | **Decided 2026-09-30 (`documents/design-notes-consent.md` §6a); migration 260 APPLIED on production; the gate `comms/may-contact.ts` built (not deployed). Next in D9: Vara consent capture. Next after the gate: Track E, starting with the D3 table design.** Keeps `vara_consent`; adds `vani_consent_text` + `vani_suppression` (append-only, keyed hash); one `mayContact` gate. GTM's lawful basis (D9-e) needs legal advice | F2, G |
| D10 | Vara seniority: modifier on the family shape vs pack per level | Modifier — **now needed**: the prototype's Level field depends on it | F0 |
| D11 | Vara: tenant shape supersedes at take-time (built) vs first publish | Keep take-time; say it in the UI. **If D16 is accepted this becomes first publish** | F |
| D12 | Lane-aware onboarding status; industry as a master list (Aug 27 D1/D2) | Lane-aware status: yes. Industry list: draft 254 in `documents/drafts/` becomes real | E, F |
| D13 | `vara_jd_position` | Design with F2 | F2 |
| D14 | `gt_agent_runs` cleanup migration | Approve (§7) | C1 |
| D15 | Who owns Discovery (website audit findings and fixes): GTM or Nova | Nova owns the fixes; GTM's landing shows the findings and points there (built that way, 2026-10-01) | N1, G0 |
| D16 | Does "Take families" leave Vara's main path? | Yes: role first — a title matches the workspace's family, then the industry playbook; families are taken when the first matching role is published; the shape editor stays as an advanced option | F0 |
| D17 | What "GTM activated" means | Offer ready + the DPDP acknowledgement accepted (`vani_tenant_acknowledgement`, 260), recorded and never inferred; GTM gets a `vani_agent` row so both agents activate the same way. Needs the notice wording (legal) | G0, E3 |

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
| E1 ✅ | Anonymous session (D3): crawl runs as an event with no tenant, keyed to a session token; signup binds it; ingestion nodes re-parent to the tenant in one transaction |
| E2 ✅ (live 2026-10-01) | The landing "enter your website" surface on the website repo, teaser card, signup handoff. The existing signup gate stays a front door, not a lock |
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
| Outreach channel identity (email sender, WhatsApp number) — check `gt_channels` (161) first | G0+ | Tenant-owned sending identity; nothing sends until consent |
| A tenant's own data provider key (Apollo) — shape of `vani_llm_provider` | G | Third posture (ruled); results tenant-scoped, never the pool |
| `vani_agent` row for GTM + the platform `outreach_notice` text in `vani_consent_text` | G0 (D17) | Data rows, no DDL — listed because the notice is legal wording |

Everything else in this plan is code over existing tables.

## 11. Sequencing, first four weeks

```
Week 1   A1 ARCH.md · A2 AGENTS.md · B1 merge · B2 failover fix   ✅ 2026-09-30
         Phase 4 gate (deploy + a person) · H1–H4 one repo          ← next session opens here
Week 2   A3 PLATFORM spec · B3 visibility · B4 journey readers + dashboard · C1 run table
Week 3   A4/A5 Vara + GTM specs · C2 contracts + primitives · D1 provenance · D2 brain.context
Week 4   C3 evals · C5 lanes · D3 Vara in the graph · E1/E2 funnel front half

Actual by 2026-10-01: A ✅ · B ✅ · C5/C6/C2-infra ✅ · D2 ✅ · E1/E2 ✅ (live) ·
onboarding + brand + invite links ✅. Not reached: H, C1/C3/C4, D1/D3, the RLS switch.
Order from here: "Pending, in order" under Status.
Added 2026-10-01 (reviewed prototypes): Vara F0 and GTM G0 landings ✅ · next H → F0 remainder → G0 remainder → D9 consent capture → intake.
```

Each week ends with something a tenant or an operator can see. After week 4:
D4 retrieval (needs D6/D7), D5 pathways, E3 catalog + entitlement, then F and
G in their own order.

## 12. Out of scope, so nobody starts it

Agent frameworks · DAG runner · fine-tuning · unattended learning (a model is
never a legal actor) · LinkedIn scraping · a second knowledge store · anything
listed under "Deliberately not being built" in CLAUDE.md.
