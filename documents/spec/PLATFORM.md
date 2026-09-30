# VaNi Platform — Specification v1.0 (intended) · 2026-09-30

> Status: **intended state**. Where the product deviates, the product is corrected to this document (Charan, 2026-09-30, POA §0 principle 1). Every "Built today" cell names the file or migration it was read from; where a claim rests on a document rather than an opened file it says so, and where nothing was opened it says *unverified*. Supersedes `vikunawebsite/docs/vani/vani-platform-specification-v0.1.html` (16 Aug 2026); §3 flows F1–F3, the agent integration contract and the shared-services table are carried from it nearly verbatim because they are approved.
>
> Companion documents: `ARCH.md` (transport, tenancy, idempotency, events, env, RLS, error contract), `AGENTS.md` (what an agent declares and consumes, the harness, prompt contracts, evals), `documents/spec/VARA.md`, `documents/spec/GTM.md`, `POA-2026-09-30-platform.md` (the plan), `POA-2026-09-30-repo-consolidation.md` (Track H).
>
> Working-tree note (2026-09-30): read from VaNiGTM branch `claude/brave-sagan-25311u`, on which the B1 merge of `claude/session-setup-qrxev9` **landed during this write** (commit 06a9635; its five migrations renumbered 254–258) together with the B2 failover fix (4665480, `createRun` stores the event payload as `inputs`, with a DB test). Local `main` is still at 749dbc9 and the VPS runs `main`. "Built today" below means **on this branch**; items that arrived with those two commits are marked *(B1 branch — not on `main`/VPS yet)*.

---

## 1. Positioning & scope

**What it is.** VaNi is the tenant-facing foundation on which individually priced agents are activated: it holds an organisation's identity, people, domains and shared services, and — the change since v0.1 — it holds the organisation's **Smart Profile**, the Brain: a typed profile, a knowledge graph, a market vocabulary, offers and a brand, built once from the tenant's website, documents and conversation, and read by every agent. The Smart Profile is the feeding engine for every agent, Vara included; one graph, no second copy (POA §0 principle 5). Agents extend the platform; they never modify it. Only the data changes per tenant; this layer does not.

**Three agents today, one later.**

| Agent | Outcome | Reads from the Brain | State |
|---|---|---|---|
| **Vara** · Talent | JD → candidates → hiring-manager verdict on the tenant's own domain | industry, role families, domain pack, brand voice | Compose path live; activation + install + platform embed channel merged on the branch (B1); candidate lifecycle not built (HANDOVER §2.2) |
| **GTM** · Growth | Build the audience → put them in motion → work the queue | ICP, offers, vocabulary, competitors, brand | Audience/research/people/imports live on the API; sending gated on consent |
| **Edge** · Automation readiness | 12-chapter guided mission → Automation Strategy (P2P first, O2C later) | company context, industry, footprint | UX live (vikunawebsite `main` cb7fb9d); engine in the browser; no server state, no schema |
| Nova · Digital marketing | Fix the digital estate · run a campaign | brand, offers, vocabulary | Not built; visible in the catalog as "coming" |

**What it is not.** Not an agent framework (Hermes and the like stay out); not a DAG runner (orchestration is an event bus made visible); not a marketplace or per-agent pricing UI beyond the catalog; not a second knowledge store; not fine-tuning or unattended learning (a model is never a legal actor); not a LinkedIn scraper; not a self-hosted billing engine (the gateway produces statements; collection is external). Everything under "Deliberately not being built" in `VaNiGTM/CLAUDE.md` stands.

**Vikuna's own products are tenants.** vikuna.io, ContractNest, KaalaDristi, FamilyKnows run as ordinary tenant rows through the same provisioning, gates, metering and RLS. The only tenant-level distinctions are two flags: `vn_tenants.is_admin` (may read and feed the common pool; migration `012_vn_tenant_is_admin.sql`) and the pending first-party flag that lets a Vikuna product send under the platform's identity (`documents/design-notes-outreach-and-delivery.md`; CLAUDE.md "Deliberately not being built", the three rulings). A behaviour that only works for the home tenant is a bug.

**Six invariants (from v0.1, approved).**

| Invariant | In the build |
|---|---|
| Agents extend, never modify | `vani_` tables never grow agent columns. An agent ships its own prefixed tables hanging off platform keys plus declarations into the platform's registries. Activation adds rows; deactivation removes them; the org is untouched. |
| One declaration, N projections | A tenant states each fact once — industry, people, families, provider, and now the whole Smart Profile — at the platform. Agents receive a delegation; none re-asks. |
| Vikuna is tenant #1 | Same provisioning, gates, metering, RLS. No home-tenant code path. |
| Shared services are the platform's voice | Comms, metering, audit, embed tokens and the LLM provider are platform services with per-agent accounting. Agents call them, never re-implement them. |
| The audit spine is singular | One `vani_audit_log` across agents; `actor_type ∈ human · rule · timer · system`; "model" is never legal, enforced in the database. |
| Per-agent commerce | Each agent carries its own gateway ref and metering units. The platform aggregates; it does not bundle. |

Two rulings added in September that the platform enforces platform-wide: **models and providers are `.env` decisions, never code** (2026-09-26/30), and **nothing falls back silently** — rule 12, including unconsumed events (POA §0 principle 7).

---

## 2. Personas

| Id | Persona | Who | Owns / does | Cares about |
|---|---|---|---|---|
| **P-A** | **Visitor (pre-signup)** | Someone on vikuna.io / vani.vikuna.io who has not signed up | Enters their website URL; sees a teaser built from a real crawl (or "could not read it" — never a sample); decides to sign up | Seeing something true about their own business before giving an email |
| **P-B** | **Tenant admin** | The organisation's owner-operator | Completes the product lane once; owns the Smart Profile; activates and pays for agents individually; manages domains, people, roles per agent, the model provider | Declaring things once; controlling who acts where; no surprises on the invoice |
| **P-C** | **Operator** (tenant member) | Day-to-day user inside one or more agents | Works the agent's surfaces under the roles granted per agent (a TA in Vara, a campaign operator in GTM, nothing in Edge unless granted) | One login; seeing only what their roles allow; their actions attributed correctly |
| **P-D** | **Viewer** | Stakeholder | Reads the dashboard, journeys, runs, statements; edits nothing | Progress and cost without the mechanism |
| **P-E** | **VaNi operator** (Vikuna platform team) | Runs VaNi as a product | Provisions/suspends tenants, registers agents, authors and reviews domain packs, watches runs/events/awaiting queues, sees fleet-wide metering, answers failover questions | Isolation, unit economics, one platform serving every agent |
| **P-F** | **Agent** (non-human) | Vara, GTM, Edge, Nova | Registers into the fabric, declares roles/units/templates/pack namespace/checklist/journey, consumes identity, Brain, prompts, comms, metering, audit through the contract | A stable contract; everything it needs available at activation; nothing platform-side to build |

Membership roles at the platform are `admin | member` (`vani_membership.platform_role`, migration 240). Viewer is a member with no agent roles. The `vn_` framework roles (`vn_roles`, `vn_user_roles`) remain the login-time roles the JWT carries (`role` in `token.service.ts`); the per-agent roles are `vani_user_agent_role`. The `vn_user → vani_user` bridge is deferred (245's comment on `approved_by`), so today the JWT's `user_id` is a `vn_users.id`.

---

## 3. Key flows

### F0 · Funnel — landing → anonymous crawl → signup → catalog → wizard pre-done → dashboard

```
vikuna.io / vani.vikuna.io ──"enter your website"──► crawl on an ANONYMOUS token (event with no tenant)
        │                                              rule 12: real crawl or "could not read it", never a sample
        ▼
teaser: the first profile card (product, one-line, category — what the crawl found)
        │
signup ─► tenant provisioned (vn_tenants + vani_tenant by slug) ─► anon session BOUND to the tenant;
        │                                                          crawl's kb_source + KG nodes re-parented in ONE transaction (D3)
        ▼
agent catalog: Vara · GTM · Edge (· Nova, coming) — each activated and PAID individually (D4 entitlement)
        │
        ▼
Mission Wizard opens with step 1 (Research company) already DONE from the crawl; steps 2–5 as F4
        │
        ▼
dashboard (F5): profile completion, weakest Brain section, next action, one journey card per activated agent
```

Rules: the existing signup gate (`vani-app/src/lib/gate.ts`) stays a **front door, not a lock**; `POST /api/v1/auth/register` is open. The anonymous crawl runs as a `gt_events` row whose tenant is a placeholder until bound (schema decision D3, §6). A visitor who never signs up leaves a row that expires; nothing from it enters any tenant or the pool. Nothing is emailed to the visitor before signup (consent model, E7).

**Precedent already on the API:** `assessment-skill` (`/api/v1/assessment/:slug`, `/answer`, `/complete`, `/capture`, `/report/:token`) is exactly this shape — anonymous token → result → capture — and is the pattern Track E reuses (repo-consolidation POA §4).

### F1 · Agent activation — the contract in motion *(from v0.1, approved)*

```
1 REGISTER   operator adds vani_agent + role catalog + unit types + template codes + pack namespace + activation checklist + journey
     ▼
2 SUBSCRIBE  vani_tenant_agent (provisioned) · gateway_ref assigned · ENTITLEMENT checked first (D4)
     ▼
3 ACTIVATION LANE  the agent's own wizard (Vara: domain, families, install) · status = activating
     ▼
4 READINESS GATE   the agent's declared checklist, platform-evaluated
     ▼
5 LIVE       embed tokens issued · metering active · journey card appears on the dashboard
     ▼
DEACTIVATE   agent-prefix rows + role assignments removed · org untouched · statements and audit survive
```

Status transitions `provisioned → activating → live → suspended` are platform-owned and audited. Going live triggers token issuance and metering activation atomically. Re-activation starts a fresh lane; history stays queryable.

### F2 · Domain pack lifecycle — author once, delegate everywhere *(v0.1 + the 2026-09-17 posture)*

```
AUTHOR      operator or the domain-pack agent drafts a pack with per-agent namespaces (payload.vara, payload.nova …)
     ▼
PUBLISH vN  append-only: a new (code, version), never an edit · stamped review_state = 'unreviewed'
     ▼
TENANT BINDS once, at the product lane (vani_tenant_pack_binding) · industry is the tenant's single declaration
     ▼
AGENTS ACTIVATE THEIR SLICE   Vara reads payload.vara · Nova reads payload.nova · no duplicate industry step
     ▼
REVIEW      unreviewed → reviewed (promote) or retired (withdraw); each is a NEW version carrying the state
     ▼
UPGRADE     new version offered · tenant approves · agents re-read — never a silent rebinding
```

Two things the platform enforces: a generated pack reaches every tenant in its industry before a human at Vikuna reads it (user ruling, "user driven else everything gets stuck"), so the `unreviewed` label reaches the console and `assertNoTemplateLeak` refuses a draft before it is written; and readers pick the latest version FIRST and judge the state after — `review-state.ts` `visiblePacksOfDomain()` / `visiblePackOfFamily()` are the only legal predicates (the retired-pack trap, CLAUDE.md).

### F3 · Embed token — public surfaces in the tenant's environment *(v0.1, approved; refined by the B1 merge — branch only)*

```
ISSUE     at agent go-live: token scoped (tenant, agent, surface), bound to vani_tenant_domain.embed_origins
     ▼
LOAD      a visitor opens careers.<tenant>.tld — tenant brand, tenant domain; ONE script tag serves every live agent
     ▼
EDGE CHECK  origin ∈ allowlist? token live? agent live?
     ▼
SERVE     surface renders · session scoped to tenant           deny ──► REJECT + AUDIT (vani_audit_log row)
```

The snippet is the one artefact that can never be migrated once pasted into a tenant's site, so it carries no agent's name (`/embed/vani.js`, `/api/v1/embed/boot`, `/api/v1/embed/intent`) — the platform owns the channel; agents provide offers to it (`OFFER_PROVIDERS` in `vani/embed.routes.ts`). Boot re-checks the origin allowlist on every call, so revocation is an UPDATE to `embed_origins`.

### F4 · Smart Profile build — the Mission Wizard (5 steps) + the three declarations

```
MISSION WIZARD (agent proposes, human confirms — every step)          PRODUCT LANE (declared once)
 1 Research company   crawl → KG → drafted profile (product, problem)   user_profile      who is acting
 2 Market vocabulary  3–5 clusters × 10–15 terms, ratified              business_profile  org + industry → pack binding
 3 Competitors        vocabulary → web search → Competitor nodes        vani:domain       workspace/candidate domain + embed origins
 4 Ideal customer     icp_* fields + pain points → PROFILE approve      vani:team         people (disabled; vn_ serves it)
 5 Brand              voice, always/never say, colours, proof           Model             BYOK — a MENU item (/settings/model), never a step
                      + Offers (a Brain object, own entrance)
```

Step 1 is pre-done when the tenant arrived through F0. Approval of step 4 emits `PROFILE_COMPLETE`; the first consumer is "propose an audience" (POA D5). Completion score 0–100 across the Brain's sections gates `is_complete` at 60. Nothing is fabricated: a field the crawl or a document cannot support is left blank and says so (rule 9d).

### F5 · Daily landing — the dashboard reads the Brain

```
open /dashboard ─► profile completion ring ─► weakest Brain section by weight ─► "Fix <section>" deep link into the wizard step
                ─► one journey card per ACTIVATED agent (declaration static, progress READ from <agent>.journey)
                ─► what needs a person: awaiting runs (approvals + failover questions) in one queue
                ─► runs and events with status, attempts, age; emitted-but-unconsumed panel
```

Empty states carry a next action (rule 9b). The dashboard is about the tenant, not a fixture (POA B4).

---

## 4. Epics & user stories

Legend — **Built today**: ✅ built (file/route) · ◐ partial (what is missing) · ✗ not built. Read on branch `claude/brave-sagan-25311u`; *(B1 branch — not on `main`/VPS yet)* marks what the 2026-09-30 merge added.

### E1 · Funnel & signup

| Id | Story | Acceptance criteria | Built today |
|---|---|---|---|
| P-01 | As a visitor I enter my website URL on the landing and see a teaser built from a real crawl | Crawl runs as an event on an anonymous token; teaser shows what was read or "could not read it"; never sample data; JS-only sites escalate to the headless render (n8n) or fail loudly | ✗ — `vani-app/src/app/(site)/page.tsx` links only to `/login`; no anonymous crawl route. Pattern exists in `backend/src/skills/assessment-skill/assessment.routes.ts` (`/:slug`, `/complete`, `/capture`, `/report/:token`) |
| P-02 | As a visitor I sign up and my crawl becomes my tenant's first knowledge | Signup provisions `vn_tenants` + `vani_tenant` (slug); anon session bound; `gt_kb_sources` + KG nodes re-parented in ONE transaction; no orphaned anon rows after bind | ✗ — needs D3 table. `POST /api/v1/auth/register` exists (`auth/auth.routes.ts`), seeds `user_profile`, `business_profile`, emits `TENANT_REGISTERED` (line 91–100) |
| P-03 | Signup stays deliberate without a person in the loop | Front door (shared phrase, client-side) stays; server-issued invite code checked inside `register()` lands as backend work; sign-in errors stay generic | ◐ — front door ✅ `vani-app/src/lib/gate.ts`; server-side invite ✗ |
| P-04 | After signup I am taken to the agent catalog, then the wizard with step 1 done, then the dashboard | `RequireSession` routes by lane status; catalog is in the path; wizard reads the pre-done step | ◐ — gate routes to `/onboarding/declare` then the wizard (`vani-app/CLAUDE.md` onboarding gate); catalog not in the path; pre-done ✗ |

### E2 · Smart Profile (the Brain)

| Id | Story | Acceptance criteria | Built today |
|---|---|---|---|
| P-10 | Step 1 — VaNi researches my company from my site | URL → ingestion → KG → drafted `gt_tenant_profile`; steps visible as a run; site-health findings shown; failure card names the cause; paste-copy offered only after a visible failure | ✅ `skills/onboarding/screens/MissionWizard.tsx` ("Research company"), `POST /api/v1/ingest/url` (`ingestion-skill/ingestion.routes.ts`), `profile-skill/profile.drafter.ts`, `gt_kb_sources` (182). Pre-done from F0 ✗ |
| P-11 | Step 2 — market vocabulary is drafted and I ratify it | 3–5 clusters, 10–15 `related_terms`, `cluster_type`; only approved clusters frame research | ✅ `gt_semantic_clusters` (192), `profile-skill/cluster.service.ts`, `GET /api/v1/profile/clusters`, `POST /clusters/approve` |
| P-12 | Step 3 — competitors are found from the vocabulary and I confirm each | Run visible, resumable from checkpoint; verified Competitor nodes; SearXNG named when missing | ✅ `research-skill`, `POST /api/v1/vani/competitors/research`, `/research-status`, `/confirm` (`vani-skill/vani.routes.ts`); needs `SEARXNG_URL` |
| P-13 | Step 4 — ideal customer, then approve the profile | `icp_*` fields + pain points; approve stamps `approved_at`, emits `PROFILE_COMPLETE`; history snapshot per version | ✅ `PUT /api/v1/profile`, `POST /profile/approve`, `GET /profile/history` (`profile-skill/profile.routes.ts`), `gt_tenant_profile(_history)` (184). `PROFILE_COMPLETE` has no consumer |
| P-14 | Step 5 — brand is derived, not typed | voice/always/never/colours/proof drafted from crawl; `source=agent` until approved; blank where nothing was found | ✅ `gt_tenant_brand` (193), `/api/v1/profile/brand`, `/brand/generate`, `/brand/approve`, `/brand/reopen`, `profile-skill/brand.service.ts` |
| P-15 | Offers are a Brain object with a human on every draft | 1–3 offers drafted from cached crawl text as a visible run; `confirmed_at` gates score credit | ✅ `gt_offers` (209, 239), `profile-skill.generate_offers` / `confirm_offer`, console `/smart-profile/offers` (`skills/smart-profile/index.ts`) |
| P-16 | Every profile field carries its provenance | `{value, source: human\|agent, run_id, approved_at}` per field; re-runs never overwrite an approved value; acceptance rate measurable | ✗ — D8. Today one `source` column per row (184) and whole-row snapshots |
| P-17 | Every agent reads the Brain through one service | `brain.context(purpose)` returns profile + subgraph + vocabulary + offers + brand under `charBudgetFor`; no agent keeps its own copy of contacts, offers or brand | ✗ — D2. Today `agent-core/context.store.ts` serves `gt_tenant_context` JSONB and each agent assembles its own prompt |
| P-18 | I can see and correct what VaNi knows | Record surfaces: Smart Profile, Offers, Knowledge (nodes by kind with source), Knowledge Graph (read-only, corrected by teaching); editing deep-links into the wizard step | ✅ `vani-app/src/skills/smart-profile/index.ts` (4 live routes); `ingestion-skill.knowledge` (per CLAUDE.md, not opened) |
| P-19 | The Brain has a completion score and a weakest section | Weighted score over product/ICP/GTM/vision/brand/offers; `is_complete` ≥ 60; weakest section + "Fix X" on the dashboard | ◐ — score ✅ (`profile-skill/SKILL.md` states 40/30/20/10; POA B5 records a drift to 25/20/20/15/10/10 — *unverified in code*); weakest-section card ✗ in vani-app (lives only in retired `frontend/` `/today`) |

### E3 · Knowledge ingestion

| Id | Story | Acceptance criteria | Built today |
|---|---|---|---|
| P-20 | I teach VaNi from a URL, a file, pasted text or a Drive folder | Each is a `gt_kb_sources` row and an event (`URL_SUBMITTED`, `FILE_UPLOADED`, `FOLDER_CONNECTED`); nodes written per chunk; `KNOWLEDGE_UPDATED` recalculates the profile | ✅ `ingestion-skill/ingestion.routes.ts` (`/url`, `/text`, `/sync`, `/connect/gdrive*`), worker `AGENT_REGISTRY` (`agent-core/worker.ts` 107–123), `gt_kg_nodes/edges` (181) |
| P-21 | I see every source, its status and what it produced; I can re-read or delete it | List/detail/delete; "read · N entries"; a superseded parked run is marked | ✅ `GET /api/v1/ingest/sources`, `/sources/:id`, `DELETE /sources/:id`; superseded ✅ `llm-provider-skill/functions/pending-failovers.ts` |
| P-22 | A cut-off extraction is a partial result and says so | `LLMResult.truncated` read on every call; run reports `extract_complete` with status error naming chunks and the lever | ◐ — documented in CLAUDE.md (2026-09-26); `llm.client.ts` not opened for this → *unverified* |
| P-23 | The Brain is retrievable once it exceeds the window | Embeddings on nodes, profile, clusters; similarity + vocabulary boost; provider from env (`/v1/embeddings`) | ✗ — D6/D7. `vani/embed.ts` helper exists (Ollama `/api/embeddings` shape, `EMBED_MODEL` env), wired to nothing; vectors only on `vara_` (246) |
| P-24 | Vara's industry, family and pack live in the same graph | KG nodes + edges to products and buyers; `vani_role_family` stays the org table | ✗ — POA D3 |

### E4 · Agent catalog, activation & entitlement

| Id | Story | Acceptance criteria | Built today |
|---|---|---|---|
| P-30 | As a tenant admin I see the catalog of agents with their state for my tenant | Reads `vani_agent` × `vani_tenant_agent`; each card: status, price/unit, journey summary; Nova visible as coming | ◐ — console `/agents` (`skills/agents/index.ts`, `screens/AgentsList.tsx`) reads `agents.list`, a **fixture** in `lib/mock-transport.ts` `CONSOLE_PREVIEW_READS`; no `agents.list` on the API |
| P-31 | I activate one agent and go through its gate | `vani_tenant_agent` provisioned → activating → live; readiness checklist declared by the agent, evaluated by the platform; audited | ◐ — Vara only: `POST /api/v1/vara/activate` + `readinessChecklist` (4 items: industry, domain, origin, published JD; `vara/vara.routes.ts` 121–335). GTM/Edge have no activation; `gtm.readiness` and `edge.journey` are fixtures |
| P-32 | Each agent is paid for individually before activation | Entitlement row per (tenant, agent) checked before step 2 of F1; payment provider behind the same check | ✗ — D4 `vani_entitlement`. `vn_subscriptions` (002) is a tenant-level plan, not per agent |
| P-33 | Deactivating an agent removes its world and nothing else | Agent-prefix rows + `vani_user_agent_role` removed; families, users, packs, statements, audit survive | ✗ |
| P-34 | Registering an agent is complete or rejected | Identity, role catalog, unit types, template set, pack namespace, checklist, journey — all declared; Nova needs zero platform DDL | ◐ — `vani_agent`, `vani_agent_role` exist (240); no registration route; `vani_metering_event.unit_type` CHECK hard-codes Vara's two units (240) — a contract violation to fix when metering gets a writer; server `registerLane()` never called (`onboarding/lanes.ts`) |
| P-35 | I grant people roles per agent from the agent's catalog | `vani_user_agent_role` rows; a TA in Vara is nothing in GTM; audited | ✗ — no code references `vani_user_agent_role` |
| P-36 | Every agent's journey is real | `vara.journey`, `gtm.journey`, `edge.journey` are skill functions over existing data | ✗ — all three are preview fixtures: `skills/gtm-shell/mock.ts` 117–118, `skills/edge/mock.ts` 11 (POA B4) |

### E5 · Onboarding lanes

| Id | Story | Acceptance criteria | Built today |
|---|---|---|---|
| P-40 | The organisation declares itself once, in a lane | Server catalog; `GET /onboarding/status?lane=` reconciles (absent row = pending); `PATCH /onboarding/step` commits payload + completion in one transaction | ✅ `backend/src/onboarding/lanes.ts` (VANI_LANE), `onboarding.routes.ts` 264–315; console `skills/onboarding/lanes/product.ts` |
| P-41 | The gate asks the lane, not `/me` | Either signal incomplete blocks; undecided ≠ complete; refusal fails open to `/me` | ✅ per `vani-app/CLAUDE.md` "The onboarding gate asks the lane" (`RequireSession` not opened) |
| P-42 | The domain step provisions the platform tenant and its domain | `vani_tenant` upserted by slug on first write; `vani_tenant_domain` with purpose + `embed_origins`; global uniqueness of domain reported honestly | ✅ `onboarding.routes.ts` `resolveVaniTenant` (89–99), `vani:domain` writer (147–205) |
| P-43 | People are managed on the platform spine | `vani_membership`, invitations, per-agent roles | ✗ — `vani:team` disabled; people served by `vn_` (`GET /auth/team`, `POST /auth/invite`) |
| P-44 | An agent's activation lane registers itself | `registerLane()` from the agent's folder; console gets the matching steps from the agent's folder | ✗ — never called; no `vara:` lane in either repo |
| P-45 | The two step catalogs cannot drift | One catalog, or a build check that the console has a screen for every enabled server step | ◐ — manual; the 2026-09-15 trap is recorded in both files. Resolved structurally by Track H (one repo + CI) |
| P-46 | Wizard step 1 is pre-done for a funnel tenant | Wizard reads the bound crawl and marks "company" confirmed | ✗ — POA E4 |

### E6 · Model provider (BYOK)

| Id | Story | Acceptance criteria | Built today |
|---|---|---|---|
| P-50 | I connect my own model provider once; every agent uses it | AES-256-GCM per-tenant key (HKDF of `TENANT_SECRET_KEY` × tenant id); verified by test call; key never returned (hint only); empty key on save = keep | ✅ `agent-core/secret.crypto.ts`, `vani/llm-provider.service.ts`, `.routes.ts` (`/api/v1/llm-provider` GET/PUT/DELETE, `/test`, `/catalogue`), `llm-provider-skill/functions/*` (7), migration 247 (FORCE RLS), console `/settings/model` (`skills/settings/tabs.ts`) |
| P-51 | Platform vs BYOK is a posture, not a URL | `llm.provider.ts` resolves per tenant (60s cache); daily cap does not apply to BYOK, usage still recorded; BYOK never fails over to Vikuna's key (`LLM_BYOK_*`) | ✅ `agent-core/llm.provider.ts`; `llm.client.ts` 148–196 (`TOKEN_BUDGET_EXCEEDED`); tests `agent-core/tests/llm-byok.test.ts` (per CLAUDE.md, not opened) |
| P-52 | A platform transport failure asks before spending money | `HAIKU_DEFAULT=false` parks the run at `awaiting` with the real error; a person approves (re-emits with `allow_failover`) or declines | ✅ — `pending_failovers` / `resolve_failover`; the POA B2 defect (`mayFailOver` read `gt_agent_runs.inputs`, which `createRun` never wrote) is fixed *(B1 branch — not on `main`/VPS yet)*: `agent-core/agent.runner.ts` 87–93 stores the event payload as `inputs`; `agent-core/tests/failover-approval.db.test.ts` |
| P-53 | Provider health is a capability flag agents degrade on | Health check; flag exposed; each agent's degradation plan | ✗ |
| P-54 | Models, windows, concurrency and speed come from `.env` | `LLM_PRIMARY_URL/MODEL/KEY`, `LLM_CONTEXT_TOKENS`, `LLM_MAX_CONCURRENT`, `LLM_CHARS_PER_TOKEN`, `HAIKU_DEFAULT`; Haiku is a `.env` switch | ✅ CLAUDE.md "Haiku as the platform model is an `.env` decision"; `llm.client.ts` / `llm.gate.ts` (opened for the cap only) |
| P-55 | The embedding provider is named in `.env` | OpenAI-compatible `/v1/embeddings`; dimension checked loudly | ◐ — `vani/embed.ts` reads `EMBED_MODEL` + `LLM_PRIMARY_URL` but calls Ollama's `/api/embeddings`; D6 default is the OpenAI shape |

### E7 · Comms & consent (platform service)

| Id | Story | Acceptance criteria | Built today |
|---|---|---|---|
| P-60 | An agent sends by template code + variables + recipient ref; the platform does the rest | Registered templates per (tenant, agent, code, channel); WhatsApp approval tracked; unapproved unsendable; every send in `vani_comms_log` | ✗ — `vani_template`, `vani_comms_log` exist (240) with no code references |
| P-61 | Nothing sends to anyone without a consent and suppression record | One model for GTM outreach and Vara intake; opt-out honoured across channels; assisted touches (LinkedIn/X) consume cadence slots | ✗ — D9. `vara_consent` exists in 241 (HANDOVER §2.2), unread by code; GTM has nothing |
| P-62 | Delivery callbacks and opt-outs are append-only facts | Provider status → `vani_comms_log`; append-only trigger | ◐ — trigger ✅ (240 `comms_log_append_only`); no writer |
| P-63 | Tenant identity for sending; platform identity only for first-party tenants | One flag on the tenant; every other tenant sends as itself | ✗ |

### E8 · Metering, cost & audit

| Id | Story | Acceptance criteria | Built today |
|---|---|---|---|
| P-70 | Every billable unit is an append-only event reconciling 1:1 with the row that earned it | `vani_metering_event(agent, unit_type, ref_table, ref_id)`; per-agent statements; operator sees fleet-wide | ◐ — table + `metering_append_only` (240); Vara's `vara_score_snapshot` trigger emits (HANDOVER §2.2); no application writer, no statement reader; `unit_type` CHECK hard-coded |
| P-71 | One answer to "what happened" | One audit spine, actor from the legal set, id-referencing payloads | ◐ — `vani_audit_log` written by `domain-pack-skill/actor.ts`, `auth/auth.routes.ts`, `vara/vara.routes.ts`; but `gt_agent_runs.steps` and `vn_audit_log` (002) are two more spines today |
| P-72 | Every run has a cost | Tokens + model + posture per run; `token_usage` stops being dead | ✗ — POA C1/C4 (D14). Daily usage per tenant ✅ `gt_tenant_context.daily_token_usage` |
| P-73 | The daily cap is platform-only and nullable | `daily_token_limit NULL` = no cap; usage always metered | ✅ migration 217; `llm.client.ts` 148–196 |
| P-74 | A write is safe to retry on both sides | Client mints `Idempotency-Key`; server stores key + result and replays inside the write's transaction | ◐ — client ✅ `vani-app/src/lib/live-transport.ts` (idempotencyKey); server ✗ — no endpoint honours it (`auth.routes.ts` 1159 says so); `lib/idempotent.ts` is an advisory-lock wrapper for global jobs, not store-and-replay |
| P-75 | Prompt and model changes are measured | `npm run eval` over fixtures per contract; results comparable across versions | ✗ — D5 `gt_eval_runs` |

### E9 · Console platform layer

| Id | Story | Acceptance criteria | Built today |
|---|---|---|---|
| P-80 | Every screen carries five states | `<DataBoundary>` (loading, error with server message, empty with a next action, content) + `useToast` outcome; `success:false` with HTTP 200 handled | ✅ `vani-app/CLAUDE.md` §1 (`platform/feedback` not opened) |
| P-81 | Every write goes through `useSkillMutation` | No double submit (ref), one key per attempt, stale responses dropped, always a toast | ✅ `vani-app/CLAUDE.md` §2 (hook not opened) |
| P-82 | Adding a skill or agent is one folder + one line | `src/skills/index.ts`; nav rendered from the registry; platform edits are logged change requests | ✅ `vani-app/src/skills/index.ts`, `src/platform/registry.ts` (two logged changes: `journey`, `adminOnly`) |
| P-83 | Agent journeys render from one declaration | `SkillModule.journey`; `AgentJourney` on landing and dashboard card; progress read, never declared | ◐ — renderer ✅ `skills/org/screens/Dashboard.tsx` 67–71, `platform/pathway`; readers ✗ (P-36) |
| P-84 | Previews are declared, countable and badged | `lib/preview.ts` list; `preview:true`; PREVIEW badge; a function leaves the list when its backend lands | ✅ `vani-app/src/lib/preview.ts` (with a `REAL` set that fixtures may never shadow) |
| P-85 | Auth is the only non-generic surface | Access token in memory; refresh cookie httpOnly; direct to `api.vikuna.io`; envelopes read through `readAccessToken()` / `readError()` | ✅ `vani-app/CLAUDE.md` §6; `PLATFORM_ROUTES` in `live-transport.ts` is the countable exception list (onboarding.status, complete_step, …) |
| P-86 | The dashboard is about the tenant | Reads profile completion, weakest section, next action, awaiting queue, real journey cards | ✗ — `Dashboard.tsx` reads `dashboard.counters`, `dashboard.activity`, `agents.list`: all `CONSOLE_PREVIEW_READS` fixtures |
| P-87 | Runs & Traces is real | `runs.list` / `runs.get` (steps, cost, "what this run changed"); `events.list` with status/attempts/age; unconsumed panel; one awaiting queue | ✗ — `skills/runs/screens/RunsList.tsx` reads `runs.list` (fixture). API has only `GET /api/v1/vani/runs` (vani-skill) and the failover queue |
| P-88 | UI and API live in one repository with one CI | `vani-app/` inside VaNiGTM; PR runs backend tests + `next build`; `frontend/` deleted | ✗ — Track H (`POA-2026-09-30-repo-consolidation.md`) |

### E10 · Operator surfaces (VaNi operator)

| Id | Story | Acceptance criteria | Built today |
|---|---|---|---|
| P-90 | Domain packs: list unreviewed, read, promote, retire, research | CLI is a quality tool, not an admission gate; reasons may be several words | ✅ `skills/domain-pack-skill/publish.ts` (`npm run packs …`), `review-state.ts`, `domain-pack.agent.ts` |
| P-91 | Provision, suspend and resume a tenant | Suspension freezes every agent surface, revokes tokens, loses no row; both audited | ◐ — `vn_tenants.status/suspended_at` (001), `vani_tenant.status` (240); no operator surface; no cascade to `vani_tenant_agent`/tokens |
| P-92 | Fleet view: runs, events, awaiting, cost, comms delivery, edge rejects | Per tenant × agent; emitted-but-unconsumed visible | ✗ — POA B3 |
| P-93 | Prompt studio over `vani_prompt` (system + tenant override, versioned, approved) | Append-only versions; one active per (key, scope, tenant); approval before active | ◐ — `vani_prompt` (245), `vani/prompt-store.ts`, `GET/PATCH/DELETE /api/v1/vara/prompts[/:key]`; console `skills/vara-prompts/screens` exists without an `index.ts` → registration *unverified*. Note: `gt_prompts` (181) is a second prompt store the gt_ agents read (`agent-core/prompt.store.ts`) |
| P-94 | The common pool is an admin-tenant surface | `SkillRoute.adminOnly`; server 403 for non-admin; `vn_tenants.is_admin` | ✅ `platform/registry.ts` `adminOnly`, migration 012; `gtm-pool` (per repo-consolidation POA §4, not opened) |
| P-95 | An event nobody handles is not silently done | Left `pending` with a visible reason | ✗ — POA C6 |
| P-96 | Answer a failover question | Approve re-emits with `allow_failover`; decline fails with cause; superseded runs lead with Decline | ✅ `llm-provider-skill/functions/pending-failovers.ts`, `resolve-failover.ts` (console queue per HANDOVER, merge to vikunawebsite `main` pending) |

---

## 5. Architecture

### 5.1 Components

| Component | Where | Runs | Talks to |
|---|---|---|---|
| **API** | `VaNiGTM/backend/src/server.ts` — Express, port 3002 dev, `api.vikuna.io` prod | one process | Postgres as `vanigtm_app`; LLM endpoints per tenant posture; SearXNG; n8n (HMAC, env-routed) |
| **Worker** | `backend/src/agent-core/worker.ts` (`npm run worker`) | separate process on the Main VPS (supervisor not described in the repo — deploy-story gap) | polls `gt_events` every 3s; `AGENT_REGISTRY[event_type]`; heartbeat on `gt_events.started_at` |
| **Console** | `vikunawebsite/vani-app` — Next.js, port 3100 dev, `vani.vikuna.io` (Vercel) → moves into VaNiGTM (Track H) | browser | `api.vikuna.io` directly with `credentials:'include'`; never proxied through Vercel |
| **Website** | `vikunawebsite/src` — Vite SPA, `www.vikuna.io` (Vercel) | browser | n8n lead webhooks; will host the F0 "enter your website" surface handing off to the console |
| **Embed** | `vani-app/public/embed/vani.js` + `app/embed/chat`; API half `backend/src/vani/embed.routes.ts` *(B1 branch — not on `main`/VPS yet)* | inside tenant pages | `POST /api/v1/embed/boot`, `/embed/intent` |

Mounted routes (`server.ts` 73–92): `/api/v1/auth`, `/onboarding`, `/tenant`, `/etl`, `/vani`, `/ingest`, `/profile`, `/storyteller`, `/assessment`, `/vara`, `/llm-provider`, the generic runner `POST /api/v1/skills/:skill/:fn`, and — *(B1 branch — not on `main`/VPS yet)* — `/tenant/embed`, `/embed/boot`, `/embed/intent` via `createEmbedRouter` mounted at `/api/v1` (`server.ts` 92).

### 5.2 The skill runner contract

```
backend/src/skills/<name>/          SKILL.md · functions/<file-name>.ts (→ function_name) · queries/*.sql · agent/routes optional
handler:  (params, ctx) => Promise<Record<string, unknown>>          params first; ctx = { tenant_id, is_live, user_id, db }
runner:   POST /api/v1/skills/:skill/:fn   body { params }   JWT required
result:   { success, skill, function, recipe, data, error? }         success:false travels with HTTP 200
```

`services/skill-registry.ts`: `buildRegistry()` discovers `SKILL.md`, imports `functions/*.ts`, registers `skill.function`; `execute()` wraps the handler in try/catch and returns the envelope. `ctx.tenant_id` and `ctx.is_live` come from the JWT, never the body. Every write inside a handler uses `ctx.db.transaction()`; SQL lives in `queries/` with `$named` params (`translateParams`). A console screen calls `useSkillQuery(skill, fn, params)` / `useSkillMutation`; the transport keys the cache by `['skill', skill, fn, params]`.

### 5.3 Event bus (one paragraph; the harness is `AGENTS.md`)

`emitEvent()` writes `gt_events(tenant_id, event_type, source_type, source_id, payload)`; the worker claims a batch with a CTE (never `WHERE id IN (SELECT … LIMIT n)` — it does not limit), stamps `started_at`/`attempts`, heartbeats every 30s, and reclaims stale claims (`WORKER_STALE_CLAIM_SECONDS`, `WORKER_MAX_ATTEMPTS`, from .env; migration 253). Each event becomes one `gt_agent_runs` row with an append-only `steps` log, `checkpoint` for resume, `awaiting_input` for human gates, and `status ∈ queued · running · awaiting · completed · failed`. LLM calls pass through `llm.gate.ts` (`LLM_MAX_CONCURRENT` platform calls in flight per endpoint, across every process via Postgres advisory locks — C5). Registered today: `TENANT_REGISTERED`, `HUMAN_APPROVED`, `FILE_UPLOADED`, `URL_SUBMITTED`, `FOLDER_CONNECTED` (+ `KNOWLEDGE_UPDATED`, `COMPETITOR_RESEARCH_REQUESTED` per CLAUDE.md); `PROFILE_COMPLETE` is emitted with no consumer; since C6 it waits in `pending` (the worker claims only handled types) instead of being resolved `done`. Intended: `gt_events` stays the only orchestration; there is no DAG runner; every emitted event is either handled or visibly unhandled.

### 5.4 Transport rules

- One generic surface (the skill runner) plus a countable list of platform exceptions (`PLATFORM_ROUTES` in `vani-app/src/lib/live-transport.ts`: onboarding, and REST for auth/tenant/vara/embed/llm-provider). No skill gets its own REST endpoint for console use; REST routes remain for direct API use.
- Error contract `{ error: { code, message } }`; the server names the failure class (SQLSTATE → append-only guard, unique, FK) and says nothing was saved; the console never reuses the server's wording (the "Could not publish this JD" lesson).
- `Idempotency-Key` on every mutation from the client; **store-and-replay on the server is the intended contract** (P-74) and is not built.
- CORS_ORIGIN is a comma-separated exact-match list (`cors-origins.ts`); `http://localhost:3100` is the origin that matters in dev.
- Dates `DD-MMM-YYYY` through one formatter; server stores UTC.

### 5.5 Tenancy & `is_live`

The JWT carries `user_id, tenant_id (vn_tenants.id), email, role, is_live, is_admin` (`auth/token.service.ts` 117). `is_live` is per user preference (`PATCH /auth/switch-env`) and is resolved from the JWT, never the body; every transactional `gt_` table carries `is_live`. Every tenant-scoped query filters `tenant_id` in the WHERE clause; `db/query.ts` wraps every call — single queries included — in BEGIN / `set_tenant_context()` / COMMIT because the GUC is `is_local`. Outside a skill, `withTenantClient(pool, tenantId, fn)` is the only way to reach an RLS table.

### 5.6 RLS posture

Cutover done: the app connects as `vanigtm_app` (NOSUPERUSER NOBYPASSRLS); `vikuna_admin` retained for rollback. `gt_` tenant tables: policies hardened (234, NULLIF form), platform rows admitted on `gt_tags`/`gt_content_kinds` (235), FORCE on 17 app-owned tables (236); `gt_agent_runs` deliberately unforced until agent-core moves to `withTenantClient`; `gt_events` RLS disabled by design (cross-tenant bus); `gt_prompts` no RLS (system rows). The `vani_`/`vara_` spine: policies exist (240, 241, 245, 246) but only `vani_llm_provider` is FORCED (247); `vara.routes.ts` is converted to `withTenantClient` (22 sites); one raw read remains in `auth.routes.ts` (~1129, `vani_tenant_domain`). Forcing the rest is a migration after `rls-two-tenant-test.sql` is extended to the spine. Signup, login and the runner have not been exercised under the restricted role on production — treat as unverified.

### 5.7 Configuration from env — never code

`DB_PRIMARY` (+`_SSL`) · `JWT_SECRET` · `TENANT_SECRET_KEY` (+`_PREVIOUS`) · `CORS_ORIGIN` · `LLM_PRIMARY_URL / _MODEL / _KEY / _TIMEOUT_MS` · `LLM_CONTEXT_TOKENS` · `LLM_CHARS_PER_TOKEN` · `LLM_MAX_CONCURRENT` / `LLM_BYOK_MAX_CONCURRENT` · `HAIKU_DEFAULT` · `ANTHROPIC_API_KEY` + `LLM_FAILOVER_MODEL` · `EMBED_MODEL` (+ the D6 embeddings endpoint) · `SEARXNG_URL` · `WORKER_BATCH_SIZE / _STALE_CLAIM / _MAX_ATTEMPTS / _HEARTBEAT_MS` · n8n secret and environment routing · `NEXT_PUBLIC_API_ORIGIN` (console). A window is a server fact (`LLM_CONTEXT_TOKENS=4096` on llm.dristiq.com), not a preference. `.env` changes need a hard restart.

### 5.8 The two-tenant-id bridge

`vn_tenants.id ≠ vani_tenant.id`; they are joined by `slug`, never equal. The JWT and `set_tenant_context()` carry the `vn_` id; every `vani_*`/`vara_*` row stores the `vani_` id. Migration 248 makes `vani_current_tenant()` bridge by slug (SECURITY DEFINER, pinned `search_path`, accepts either id), fixing all 20+ spine policies at once; application code bridges the same way (`onboarding.routes.resolveVaniTenant`, `vara.routes.vaniTenantFor`, `embed.routes.vaniTenantFor`, `llm-provider.service.vaniTenantId`). The `vn_users → vani_user` bridge is not built (245 comment), so `vani_prompt.approved_by` and `vara_jd.created_by` cannot yet point at a platform user. Intended end state: one tenant id (the platform's), reached by migrating `gt_` FKs after the spine is forced — a schema decision, not in this plan.

---

## 6. Data model

### 6.1 `vn_` — the auth framework (migrations 001–012)

| Table | Purpose | Key columns | Invariants |
|---|---|---|---|
| `vn_tenants` | Login-time tenant | `id, slug, status, is_active (generated = status='active'), is_admin (012), activated_at, suspended_at` | Never INSERT `is_active`; `is_admin` gates the common pool |
| `vn_tenant_profiles` | Registration detail (name, industry, website, brand colour, theme, timezone…) | `tenant_id PK, name, industry, website, settings JSONB` | Not the Smart Profile |
| `vn_users` | Login identity, per tenant | `id, tenant_id, email, password_hash, is_active, locked_until, preferences` | One tenant per user row today |
| `vn_roles`, `vn_user_roles` | Framework roles (superadmin/owner/admin…) | `code, is_system, permissions JSONB; revoked_at` | NULL tenant = global role |
| `vn_refresh_tokens` | Sessions | `token_hash, device_type, expires_at, revoked_reason` | httpOnly cookie, `sameSite:strict`, `secure` |
| `vn_subscriptions`, `vn_subscription_history` | Tenant-level plan | `plan_code, max_users, max_sessions, features, is_current` | Trigger `ki_set_session_limit` floors `max_sessions` at 5 on INSERT. Not per-agent (→ `vani_entitlement`) |
| `vn_tenant_onboarding` | Lane steps | `tenant_id, step_id VARCHAR(50), status, completed_at, metadata` | Absent row = pending (lane endpoint); `/me` counts rows. `step_id` carries the lane (`vani:`, `<agent>:`) |
| `vn_invitations`, `vn_password_resets`, `vn_audit_log`, `vn_error_log`, `vn_migrations` | Framework plumbing | — | `vn_audit_log` is a framework log, not the platform audit spine |

### 6.2 `vani_` — the platform spine (240, 245, 247, 248)

| Table | Purpose | Key columns | Invariants / triggers |
|---|---|---|---|
| `vani_tenant` | Subscribing organisation | `id, slug UNIQUE, name, status active\|suspended, data_region` | Provisioned by slug on first `vani:domain` write; Vikuna is a row |
| `vani_tenant_domain` | Domains + embed allowlist | `tenant_id, domain UNIQUE (global), purpose candidate\|workspace, verified_at, embed_origins text[]` | Origins editable (`PATCH /tenant/domains/:id/origins`, `onboarding/embed-origin.ts` normaliser) |
| `vani_user`, `vani_membership` | Platform identity; `platform_role admin\|member` | `auth_ref` bridges auth | Agents never store users. Bridge from `vn_users` not built |
| `vani_agent`, `vani_agent_role` | Agent registry + declared role catalog | `code UNIQUE (vara, nova…), version, status` | One row per agent platform-wide |
| `vani_tenant_agent` | The subscription: tenant × agent | `status provisioned\|activating\|live\|suspended, activated_at, gateway_ref` | Written by `/vara/activate`; per-agent commerce hangs here |
| `vani_user_agent_role` | Roles per agent per person | `(tenant, user, agent, agent_role) UNIQUE, granted_by` | Agents read, never write. No code yet |
| `vani_role_family` | Org structure, agent-neutral | `tenant_id, name, parent_id` | Agents extend 1:1 (`vara_family_profile`); deletion blocked while referenced |
| `vani_domain_pack`, `vani_tenant_pack_binding` | Versioned packs; single industry declaration | `(code, version) UNIQUE, domain, payload JSONB (per-agent namespaces, researched.review_state)` | Append-only by convention; readers use `review-state.ts` predicates |
| `vani_llm_provider` | BYOK | `provider_code, credentials_enc (v1.<key_id>.<iv>.<tag>.<ct>), test_status` | FORCE RLS (247); per-tenant derived key |
| `vani_template`, `vani_comms_log` | Comms service | template `(tenant, agent, code, channel, version)`, `approval_status`; log `recipient_ref` (opaque), `ref_entity/ref_id`, `status` | `comms_log_append_only` trigger; no writer |
| `vani_metering_event` | Billable units | `agent_id, unit_type, ref_table, ref_id, qty` | `metering_append_only`; `unit_type` CHECK hard-codes Vara's two units (to widen at registration) |
| `vani_audit_log` | The audit spine | `agent_id NULL = platform, actor_type human\|rule\|timer\|system, entity, entity_id, action, before, after` | `audit_append_only`; payloads id-referencing; "model" illegal by CHECK |
| `vani_prompt` (245) | Two-scope prompt store | `key '<agent>.<worker>.<slot>', version, scope system\|tenant, body, variables, active, approved_at` | Content immutable (trigger); one active per (key, scope, tenant); active requires `approved_at`; RLS read platform+own, write own |
| `vani_current_tenant()` | RLS function | — | 247: reads `app.current_tenant_id` (falls back to `app.tenant_id`); 248: bridges `vn_` → `vani_` by slug, SECURITY DEFINER |

RLS: enabled with `tenant_isolation` on all twelve tenant-scoped tables (240); FORCED only on `vani_llm_provider`.

### 6.3 The Brain (`gt_`)

| Table | Purpose | Key columns | Invariants / triggers |
|---|---|---|---|
| `gt_tenant_profile` (184) | Typed profile, one row per tenant | product_*, `core_problem`, `key_differentiators[]`, icp_* (role, company_type, size, industry, geography), `primary_pain_points[]`, gtm_*, vision_*, `completion_score`, `completion_detail JSONB`, `is_complete` (generated ≥ 60), `source vani\|human\|import`, `version`, `approved_at/by` | `updated_at` trigger; history snapshot per version in `gt_tenant_profile_history` (append-only) |
| `gt_tenant_brand` (193) | Brand | `voice_tone[], always_say[], never_say[], visual JSONB, proof[], source, approved_at` | agent-proposes / human-approves |
| `gt_offers` (209, 212, 239) | Offers | `offer_key, name, one_line, who_for, problem, what_we_do[], signals[], disqualifiers[], price_band, proof, source, confirmed_at` | score credit only when confirmed |
| `gt_kg_nodes` / `gt_kg_edges` (181) | Knowledge graph | nodes `(tenant, label, name) UNIQUE, description, properties, source_run_id BIGINT`; edges `(tenant, from, relationship, to) UNIQUE` | UPSERT on the natural key; source-agnostic (conversation, file, URL). Labels: Product, Feature, ICP, UseCase, PainPoint, Differentiator, Team, Competitor |
| `gt_kb_sources` (182, 183) | What was read | `source_type, display_name, url, gdrive_file_id, status, raw_text` | one row per teach; the funnel's crawl becomes one of these |
| `gt_semantic_clusters` (192) | Market vocabulary | `primary_term, related_terms[], cluster_type category\|offering\|buyer\|pain\|outcome, confidence_score, approved_at, source agent\|human, is_live` | `(tenant, is_live, lower(primary_term))` UNIQUE; only approved clusters frame searches; vectors pending (D7) |
| `gt_tenant_context` (181, 217) | Shared agent memory + budget | `profile JSONB, knowledge JSONB (by agent), flags, daily_token_usage, daily_token_limit NULL = no cap, version` | `updated_at` trigger; the cap applies to platform posture only |

### 6.4 Prompts, events, runs (`gt_`)

| Table | Purpose | Key columns | Invariants / triggers |
|---|---|---|---|
| `gt_prompts` (181) | Versioned prompts for gt_ agents; NULL tenant = system | `prompt_key '<skill>.<name>', version, content, is_active, tenant_id` | one active system row per key; one active override per (key, tenant); **no RLS**. Intended: converge with `vani_prompt` under one store with contracts (C2) |
| `gt_events` (181, 185, 253) | The bus | `tenant_id, event_type, source_type human\|agent\|cron\|system\|webhook, source_id TEXT, payload, status pending\|processing\|done\|failed, started_at, attempts, error` | RLS **disabled** by design; claim via CTE; `started_at` is the heartbeat |
| `gt_agent_runs` (162, 181, 191) | One row per handled event | `id BIGSERIAL, tenant_id, is_live, agent_name, event_id, status (legacy 4 + queued\|running\|awaiting\|completed\|failed), steps JSONB (append-only), awaiting_input, checkpoint, retry_count, output, error_trace, token_usage, inputs` | Unforced RLS (236); May-era columns retired by D14; `inputs` = the event payload since 4665480 *(B1 branch)*; on `main` it is never written |

### 6.5 Proposed additions — PENDING CHARAN'S APPROVAL

Nothing below exists. Each names why the existing model cannot carry it (rule: no schema without approval; no structured data smuggled into JSONB).

| Proposal | Shape (minimum) | Why the existing model cannot carry it |
|---|---|---|
| **Anonymous session** (`vn_anon_session` or `vani_anon_session`) | `id, token_hash, website_url, status crawling\|read\|failed\|bound\|expired, kb_source_id, run_id, bound_tenant_id, created_at, expires_at` | `gt_events.tenant_id` and `gt_kb_sources.tenant_id` are `NOT NULL` FKs to `vn_tenants`; a pre-signup crawl has no owner. A placeholder tenant would put every visitor's data under one tenant id and break isolation reasoning. Binding must re-parent in one transaction, which needs a row to bind from |
| **`vani_entitlement`** | `tenant_id, agent_id, status trial\|active\|lapsed\|revoked, plan/unit pricing ref, granted_at, expires_at, payment_ref` | `vn_subscriptions` is one plan per tenant (`is_current`), not per agent; `vani_tenant_agent.gateway_ref` is a handle, not a purchase record. "Each agent activated and paid individually" has no row to check before F1 step 2 |
| **`vani_idempotency`** | `tenant_id, key, request_hash, status, result JSONB, expires_at`, unique `(tenant_id, key)` | Store-and-replay needs the first result persisted in the same transaction as the write; advisory locks (`lib/idempotent.ts`) only serialise, they cannot replay, and cover one session only |
| **`gt_eval_runs`** | `prompt_key, prompt_version, model, posture, fixture_set, schema_pass_rate, field_agreement JSONB, human_acceptance, ran_at, ran_by` | Results must be comparable across prompt and model versions; `gt_agent_runs` is per event, not per contract, and its rows are tenant-scoped |
| **Profile provenance shape** on `gt_tenant_profile` | one JSONB column `provenance` = `{ <field>: {source: human\|agent, run_id, approved_at, approved_by} }` — a declared shape, not a free bag | Today `source` is per row and a re-run overwrites approved values; without per-field provenance acceptance rate (C3's third measure) is unmeasurable. Approved as a column with a documented shape, not as data hidden in `completion_detail` |
| **Vector columns** `vector(768)` + HNSW on `gt_kg_nodes`, `gt_tenant_profile`, `gt_semantic_clusters` | as 192's comment already states | Retrieval (D4) has nowhere to store an embedding; pgvector is on the VPS (246) but only `vara_` has columns |
| **Consent / suppression** (one model for GTM outreach and Vara intake) | `gt_consent` or `vani_consent`: `subject_ref (opaque), channel, basis, granted_at, revoked_at, source`; `vani_suppression`: `subject_ref, channel, reason, since` | No table anywhere in the repo says "this person may / may not be contacted"; `vara_consent` (241) is Vara-shaped and unread; `gt_touch_log` counts touches, not permission. Nothing may send until this exists |

Also on the POA §10 list and platform-relevant: branch migrations 254–258 (`254_vara_embed_boot_pings`, `255_vara_answer_cache`, `256_vani_agent_intent`, `257_vani_intent_match`, `258_vara_seed_intents` — approved 27 Aug; now renumbered on the branch; re-confirm before applying), `gt_agent_runs` cleanup (D14), `vara_jd_position` (Vara).

---

## 7. Non-functional rules

Not restated here. `ARCH.md` holds: **Tenancy & `is_live`** · **Transport & the skill runner** · **Idempotency store-and-replay** · **Transactions & prepare→confirm** · **Event claim / heartbeat / reclaim** · **Race rules** (stale responses, double submit, ordering) · **Env-only configuration** · **RLS posture** · **Error contract & name-the-failure-class** · **Dates & tokens**. `AGENTS.md` holds: **What an agent declares** · **What an agent consumes** · **The harness** (run, steps, checkpoint, awaiting, cost) · **Prompt & output contracts** · **Evaluation methodology** · **Visibility rules** · **Nevers**.

From v0.1, still the targets: isolation (RLS on every tenant-scoped table, credentials never pooled, agent prefixes mutually unreadable); availability & degradation (services degrade independently; embed edge fails closed; no path loses a row); immutability (audit, comms log, metering, pack versions, prompt content append-only; the DPDP purge is the single audited bypass); key management (per-tenant derived keys, signed scoped revocable tokens); observability (fleet view per tenant × agent); scale posture (tens of tenants, a handful of agents, thousands of metering events/day, nothing capping an order of magnitude more). Added since: **rule 12** (no silent fallback, including previews and unconsumed events), **rule 9d** (never fabricate brand or profile content), **rule 13** (research output never enters the common pool).

---

## 8. Open decisions (platform-relevant, from the POA decisions register)

| # | Decision | Default until overruled | Blocks |
|---|---|---|---|
| D1 | Merge `claude/session-setup-qrxev9`; renumber its five migrations 254–258 | Merge; re-approve the five tables in the same breath. **Merged on `claude/brave-sagan-25311u` (06a9635) as 254–258; still to reach `main`, deploy, `--status`, and the Phase 4 gate** | B1, F1, F3 |
| D3 | Anonymous pre-signup session row | Approve one table (§6.5) | E1 / P-01, P-02 |
| D4 | Entitlement model, one for all agents | Approve `vani_entitlement`; payment provider later behind the same check | E3 / P-32, Edge backend |
| D5 | Eval results storage | `gt_eval_runs` | C3 / P-75 |
| D6 | Embedding provider | Env-configured OpenAI-compatible `/v1/embeddings`, named in `.env` | D4 / P-23, P-55 |
| D7 | Vector columns on nodes, profile, clusters | Approve (§6.5) | P-23 |
| D8 | Per-field provenance on the profile | Approve the JSONB shape (§6.5) | P-16, C3 |
| D9 | Consent / suppression model | Design first, approve, then build | E7, GTM sending, Vara intake |
| D12 | Lane-aware onboarding status; industry as a master list | Lane-aware: yes (built). Industry list: draft 254 in `documents/drafts/` becomes real | E, F |
| D14 | `gt_agent_runs` cleanup | Approve | C1 / P-72 |
| — | Where the anonymous crawl surface lives: website repo (Vite) vs console `(site)` route group | Website hosts the input; console hosts the teaser + handoff (Track E2) | P-01 |
| — | `(vani)/a/[slug]`, `(vani)/r/[token]` assessment flow: port into vani-app before `frontend/` is deleted, or let it go dark | Port (it is the F0 pattern) | H3 |
| — | Prompt stores: converge `gt_prompts` and `vani_prompt` | Converge under C2 contracts; `vani_prompt` shape wins (versions, approval, RLS) | C2 |
| — | Audit spines: `vani_audit_log` vs `gt_agent_runs.steps` vs `vn_audit_log` | `vani_audit_log` is the spine; runs keep their step log; `vn_audit_log` stays framework-only | P-71 |
| — | `vani_metering_event.unit_type` CHECK hard-codes Vara's units | Widen at agent registration (P-34) — a migration | P-70 |
| — | Repo consolidation D1–D5 (preserve history; ProKey compose; salvage list; rename; freeze window) | As in `POA-2026-09-30-repo-consolidation.md` §2 | H |
| — | Edge server persistence (mission state is `localStorage` today; spec §14 domain model is all new schema) | No schema until entitlement (D4) exists; UX stays on fixtures | Edge |

---

## 9. Superseded documents

| Document | Status | Replaced by |
|---|---|---|
| `vikunawebsite/docs/vani/vani-platform-specification-v0.1.html` (16 Aug 2026) | Superseded — its contract, services and flows F1–F3 are carried here | this document |
| `VaNiGTM/documents/POA-VaNi-GTM.md` (May) | Superseded as the execution plan | `POA-2026-09-30-platform.md` |
| `vikunawebsite/docs/vani/vara-execution-poa.md` (27 Aug) | Superseded (wrong on migration numbers and on what reached `main`) | `POA-2026-09-30-platform.md` Track F; `documents/spec/VARA.md` |
| `VaNiGTM/documents/VIKUNA_AGENT_SPEC_V1.md` | Superseded | `AGENTS.md` |
| `VaNiGTM/documents/PRD-VaNi-GTM.md` §1–3 | Kept as the vision and core loop; §4–10 module list superseded where it conflicts with the pathway model and this spec | this document + `documents/spec/GTM.md` |
| `VaNiGTM/CLAUDE.md` "Frontend conventions — RETIRED APP" and the navigation tree under "Product model" | Documents `frontend/`, retired 2026-09-16 | `vani-app/CLAUDE.md`; §5.4 here for the API-side conventions worth keeping |
| `vikunawebsite/docs/VANI_AI_HANDOVER.md` and the "VaNi AI" / "Scope discipline" sections of `vikunawebsite/CLAUDE.md` | Become a two-line pointer after Track H | `VaNiGTM/HANDOVER.md`, `VaNiGTM/CLAUDE.md` |
| v0.1's "Deliberately out of scope · v1" — self-serve signup operator-provisioned; cross-agent knowledge graph roadmapped | Reversed: self-serve signup with a front door is the funnel (F0); the knowledge graph is a product surface and the feeding engine (Charan, 2026-09-26/30) | §1, §3 F0/F4 |
| v0.1's "authentication stays where it is (Supabase or successor)" | No Supabase anywhere in VaNi; auth is the `vn_` framework | §5.5, §6.1 |
