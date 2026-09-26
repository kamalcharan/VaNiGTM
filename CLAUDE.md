# CLAUDE.md — VaNi GTM (Vikuna GTM Engine)

## What is this repo?
VaNi GTM — a multi-tenant, agent-powered go-to-market engine. A tenant (each
Vikuna product, or any external company) signs up; VaNi learns their business
(conversation + documents + website), builds their profile/ICP, generates pitch
decks, and will run campaigns, prospecting, and outreach. Built on a
lightweight Skills.md convention — no framework dependency.

**Read order for strategy/context:** `HANDOVER.md` → `documents/PRD-VaNi-GTM.md`
→ `documents/POA-VaNi-GTM.md` → `documents/GTM-AGENT-ROADMAP.md`.
UX blueprints: `documents/gtm-engine-ui/` + `documents/ux-references/`
(internal-only, see its README).

## Product model — pathways, not destinations

Three layers:

```
BRAIN     what VaNi knows about a tenant — ICP, competitors, market vocabulary,
          brand, offers, knowledge. Tenant-level. Agents READ it; no agent owns it.
          If an agent stores its own copy of contacts, offers or brand, that is a bug.
AGENTS    GTM (audience, journeys) · Nova (digital marketing, not yet built)
PATHWAYS  a named outcome, ordered steps, an artefact per step, a definition of done.
          The Mission Wizard is the reference implementation.
```

Five pathways:

```
G1  Build the audience      find → qualify → find people → enrich
G2  Put them in motion      segment → journey → fill stages → activate
G3  Work the queue          /today — what's gone quiet, ranked by cost of inaction
N1  Fix the digital estate  audit → prioritise → fix → verify        (not built)
N2  Run a campaign          intent → story → render → ship → measure (not built)
```

Navigation (restructured 2026-08):

```
TODAY      the daily queue                                    G3
BRAIN      Mission Wizard · Teach VaNi · Knowledge
GTM        Build the audience · Put them in motion
           People · Journeys              ← reference surfaces, visually distinct
NOVA       Fix the digital estate · Run a campaign   ← visible, marked coming
SETTINGS
```

Pathways read as verbs and are things you DO. Reference surfaces read as nouns and
are things you LOOK AT. Do not add a top-level destination — extend a pathway or
add a drill-down. Old routes redirect; do not add paths outside this hierarchy.

⚠️ **That navigation tree was `frontend/`'s, which is retired** (see
Architecture). The PRODUCT MODEL above — brain / agents / pathways — still
holds and is what the API is shaped around. The routes and the sidebar are
`vani-app`'s to define, under its own registry boundary
(`vani-app/CLAUDE.md` §5: a skill is one folder plus one line in
`src/skills/index.ts`).

## Architecture

> ⚠️ **`frontend/` IS RETIRED. The frontend is `vani-app`** (user, 2026-09-16),
> which lives in the OTHER repo: `kamalcharan/vikunawebsite`, at `vani-app/`,
> Next.js on port **3100**. This repo is the **API and the agent core**.
>
> `backend/frontend/` is still on disk and still builds. It is not run, not
> deployed, and not where a feature lands. Anything below describing it —
> the VDF library, `serviceURLs.ts`, the navigation tree, the settings tabs —
> documents a retired app. **Read `vikunawebsite/vani-app/CLAUDE.md` before
> writing any UI**; it is mandatory and covers the five states every screen
> owes, `useSkillMutation`, idempotency and the registry boundary.

- **Two processes here:** Express API (`backend/`, port 3002 in dev) + the
  worker. The UI is a separate repo.
- ~~Next.js 16 App Router (`frontend/`, port 3000)~~ — retired, see above.
- **Worker:** separate process (`npm run worker`) polling the `gt_events` bus
  and dispatching agents.
- **Stack:** React + TypeScript frontend, Node.js + Express + TypeScript
  backend, PostgreSQL on VPS (`vani_gtm_db` — connection via `DB_PRIMARY`).
- **LLM:** VPS/local OpenAI-compatible endpoint (`LLM_PRIMARY_URL`, dev =
  Ollama). Working dev model: `qwen3:8b` (pre-warm with `keep_alive:"24h"`;
  `llm.client.ts` appends `/no_think` and sends `Authorization: Bearer
  $LLM_PRIMARY_KEY` only if set). **Per tenant since 2026-09-15** —
  `agent-core/llm.provider.ts` resolves endpoint/model/key from
  `vani_llm_provider` (BYOK) or falls back to those env vars (platform).
  `llm.client.ts` no longer holds the config as module constants.
- No VaNi framework. No VaNiBase. No Supabase.
- **n8n:** user's n8n infra is available and approved for agent-adjacent
  jobs where it fits (e.g. a headless site-render webhook). Business
  logic stays in this repo; n8n calls must be authenticated (shared
  secret/HMAC) and environment-routed (`live` → /webhook, else
  /webhook-test).

## Repo structure (actual)
```
backend/
  src/
    agent-core/       — event.store, worker, agent.runner, llm.client,
                        prompt.store, kg.store, context.store
    auth/             — auth/login/token services + routes, seed-tenant
    db/               — pool.ts, query.ts (named params + tenant context)
    etl/              — generic import pipeline (upload→map→stage);
                        prospect processing lands with prospect-skill
    services/         — skill-registry, skill-loader
    skills/           — campaign, channel, contact, gtm-analytics, icp,
                        ingestion, profile, pulse, research, sequence,
                        storyteller, vani
    server.ts         — Express entry; migrate.ts — manual migration runner
  migrations/         — 001…249 (highest = 249)
frontend/            — ⚠️ RETIRED (2026-09-16). Still on disk, still builds,
                      NOT the product. The frontend is vikunawebsite/vani-app.
                      Kept for reference; do not add features here.
documents/            — PRD, POA, roadmap, gtm-engine-ui mockups, ux-references
docs/                 — mcp-db-setup.md, rls-cutover-checklist
scripts/              — seed.sql, grant-vanigtm-app.sql, git helpers
.mcp.json             — gtm-postgres read-only DB connector (see docs/)
```

## Database

- **Host:** VPS PostgreSQL, database `vani_gtm_db` (`DB_PRIMARY` env var;
  `DB_PRIMARY_SSL=true` for remote, `false` local).
- **Table prefixes:** `vn_` framework (tenants/users/auth), `gt_` product.
  A few legacy `ki_` tables remain **intentionally** (import pipeline:
  `ki_file_uploads`, `ki_import_sessions`, `ki_import_staging`; pulses:
  `ki_pulses`, `ki_pulse_config`, `ki_pulse_sessions` + session child
  tables) — rename to `gt_` in POA Phase 2. Do NOT create new ki_ tables.
- **Multi-tenant:** every tenant-scoped table has `tenant_id UUID NOT NULL`.
- **Environment isolation:** transactional tables carry `is_live BOOLEAN`
  (resolved from JWT, never the request body).

### RLS — current reality (important)
- Policies exist on tenant-data `gt_` tables, but the runtime still connects as
  `vikuna_admin` (SUPERUSER **and** BYPASSRLS) — **RLS is dormant**; isolation
  rests on application-layer `WHERE tenant_id = $tenant_id` filters.
- **Phase 0 finished the preparation (2026-08-10).** Migrations 234–237 are
  deployed **and verified on production** (post-deploy-check.sql: all seven
  rows OK, "ready for cutover? YES on the schema side"), every known code
  blocker is fixed, and the two-tenant isolation test passes 13/13 locally.
  Full detail in `docs/db/rls-status.md` §8.
- **Cutover is DONE.** `DB_PRIMARY` points at `vanigtm_app`; the app runs on a
  non-BYPASSRLS role. `vikuna_admin` is retained only as an emergency rollback.
- **Outstanding:** signup, login and the skills executor have never been
  exercised under the restricted role. Run `rls-two-tenant-test.sql` against
  production and walk those three paths. Until that is done, treat them as
  unverified.
- A table's OWNER bypasses its own policies unless `FORCE ROW LEVEL SECURITY`
  is set. 18 tables were owned by `vanigtm_app` — migration 236 forced 17.
- **The whole `vani_`/`vara_` spine (migrations 240–246) is UNFORCED** and was
  never covered: 236 ran before 240. Migration 247 forces `vani_llm_provider`
  only. `vara.routes.ts` **is now converted** — all 22 raw `pool.query` sites
  run through `withTenantClient` (2026-09-16), verified against forced RLS.
  One reader remains: `auth.routes.ts` has a single raw query against
  `vani_tenant_domain` (~line 1129). Forcing the rest is now a migration
  rather than a rewrite — but extend `rls-two-tenant-test.sql` to cover the
  spine first; it does not reach these tables, which is why none of this was
  caught. `docs/db/rls-status.md` §11–13.
- **TWO TENANT IDS. `vn_tenants.id` ≠ `vani_tenant.id`** — joined by `slug`,
  never equal. The JWT and `set_tenant_context()` carry the `vn_` one; every
  `vani_*`/`vara_*` row stores the `vani_` one. Migration 240's policies
  compared them directly, so **they matched nothing** — the spine's isolation
  was wrong as well as inert, and only worked because the owner bypass meant
  it was never evaluated. **Migration 248** makes `vani_current_tenant()`
  bridge by slug (SECURITY DEFINER, pinned `search_path`), fixing all 20+
  policies at once. It is a PREREQUISITE for forcing the rest of the spine,
  not an alternative to the `vara.routes.ts` conversion. `docs/db/rls-status.md` §12.
- Reaching the DB outside a skill: `withTenantClient(pool, tenantId, fn)` from
  `db/query.ts`. Raw `pool.query` against an RLS table returns nothing.
- `gt_events` has RLS **disabled by design** (migration 185) — it is the
  cross-tenant bus the worker polls. `gt_prompts` has no RLS — system prompts
  are readable by all tenants.
- `set_tenant_context()` sets the GUC with `is_local = true` — it only
  survives inside a transaction. `db/query.ts` therefore wraps EVERY call
  (including single queries) in BEGIN/COMMIT with set_tenant_context AFTER
  BEGIN. Never call set_tenant_context as a standalone autocommit statement.

### Transactions — MANDATORY
- Every write operation goes through `ctx.db.transaction(fn)` (auto
  BEGIN/COMMIT/ROLLBACK). Reads may use `ctx.db.query()`.
- Named params: SQL files use `$tenant_id`-style names; `translateParams`
  converts to positional. Every `$name` in SQL MUST have a matching param
  key or the call throws.
- JSONB params: stringify in JS and cast in SQL (`$payload::jsonb`). In
  `jsonb_build_object`, cast key params explicitly (`$key::text`) — PG
  cannot infer types for variadic "any" args.

## Agent core (the heart of the product)

- **Event bus:** `emitEvent()` → `gt_events` → worker polls (3s) →
  `AGENT_REGISTRY[event_type]` handler → `gt_agent_runs` row with steps,
  status (`queued/running/awaiting/completed/failed`), token usage.
- **Registered events:** TENANT_REGISTERED, HUMAN_APPROVED → VaNi;
  FILE_UPLOADED, URL_SUBMITTED, FOLDER_CONNECTED → ingestion;
  KNOWLEDGE_UPDATED → profile recalc; COMPETITOR_RESEARCH_REQUESTED →
  research-skill (profile → SearXNG web search → verified KG Competitor
  nodes; needs `SEARXNG_URL`, see docs/searxng-setup.md). PROFILE_COMPLETE
  is emitted (no consumer yet — ICP/Storyteller agents subscribe as
  they're built).
- **Human-in-the-loop:** agents park runs at `awaiting` with
  `awaiting_input`; humans respond via REST routes; approval gates before
  anything externally visible.
- **Knowledge graph:** `gt_kg_nodes`/`gt_kg_edges`, UPSERT on
  (tenant_id, label, name). VaNi conversation + ingestion both write here;
  `gt_tenant_profile` is the typed projection (completion score 0–100,
  product/icp/gtm/vision weights 40/30/20/10, `is_complete` = score ≥ 60).
- **Prompts:** `gt_prompts` (system + tenant override), key format
  `<skill>.<name>` — e.g. `vani-skill.gather`.
- **Market vocabulary:** `gt_semantic_clusters` (migration 192) — 3–5
  human-approved topic clusters per tenant, each with 10–15
  `related_terms` and a `cluster_type` (category/offering/buyer/pain/
  outcome). Drafted by `profile-skill/cluster.service` on the
  KNOWLEDGE_UPDATED path, ratified in the wizard's ICP card, and used by
  research-skill to frame every search. Competitors = whoever occupies
  the same vocabulary space. Phase 2 adds `cluster_embedding vector(768)`
  + HNSW on this table for Lead Finder matching — same table, vocabulary
  first, vectors second.
- **Token budget:** per tenant per day in `gt_tenant_context`.
- **Resume-from-failure:** `gt_agent_runs.checkpoint` JSONB (migration 191)
  + `saveCheckpoint`/`loadCheckpoint`/`findResumableRun` in agent.runner.
  Long agents checkpoint after each expensive stage and write KG results
  incrementally (earn it → write it); a retry with `resume:true` skips
  completed stages via a visible `restore` step. Research-skill is fully
  resumable; ingestion writes nodes per chunk (crash keeps them).

## Skills Pattern

Each skill in `backend/src/skills/<name>/`:
- `SKILL.md` — contract; `functions/` — one file per function (auto-loaded
  by the registry, exposed at `POST /api/v1/skills/:skill/:fn`);
  `queries/` — parameterized SQL files; agents/routes where applicable.
- `SkillContext`: `{ tenant_id, is_live, user_id, db }` — tenant_id/is_live
  come from the JWT, NEVER from the request body.
- Function signature: `(params, ctx) => Promise<Result>`; params first.

### Skills status
| Skill | Role | State |
|---|---|---|
| vani-skill | profile conversation agent | ✅ live |
| profile-skill | typed profile + completion score | ✅ live |
| ingestion-skill | files/URL/GDrive → KG | ✅ live |
| research-skill | outward competitor research (vocabulary → web → KG) | ✅ live (needs SEARXNG_URL) |
| storyteller-skill | profile → pitch deck → share + Q&A | ✅ live (v1) |
| contact-skill | GTM contacts + channels (gt_contacts) | ✅ live (v2) |
| campaign / channel / sequence / icp / gtm-analytics | campaign suite | ✅ live |
| pulse-skill | follow-ups + meeting workflow (funnel) | ✅ retargeted to contacts |
| etl (src/etl) | import pipeline (staging works) | ⚠️ processing = 501 until prospect-skill |

## CORS — a list, not a string (fixed 2026-09-16)

`CORS_ORIGIN` is **comma-separated**; `cors-origins.ts` parses it and
`server.ts` prints the result at startup. It took a single exact string, and
defaulted to `http://localhost:3000` — the retired `frontend/`. **The origin
that actually matters is `http://localhost:3100` (vani-app).** A deployment
that never changed the default therefore refused every preflight from the real
console.

It is a list rather than a swapped string because the default has to keep
working for anything still pointed at :3000, and because a second origin
(preview deploy, a second console) should not need a code change.

That failure has no server-side symptom: the browser blocks it, nothing is
logged, and **curl cannot reproduce it** because curl sends no `Origin`
header. In vani-app it reads as "Cannot reach the VaNi service. Check your
connection.", which is the same message as the API being down.

Matching is EXACT per entry — no wildcards, no prefixes. `credentials: true`
means an allowed origin may carry a session cookie, so each entry is a
deliberate decision, not a pattern.

## Routes (mounted in server.ts)
`/api/v1/auth`, `/onboarding`, `/tenant`, `/etl`, `/vani`, `/ingest`,
`/profile`, `/storyteller`, plus the generic skill executor
`POST /api/v1/skills/:skillName/:functionName` (JWT).
Public: `GET /api/v1/storyteller/share/:token` (deck by share token).

## Error handling — MANDATORY
- Backend: every route/handler wrapped in try/catch; structured errors
  `{ error: { code, message } }`; log with a `[Scope]` prefix; never leak
  stack traces in production.
- Frontend: every call through hooks (`useSkill*`) with loading state
  (VdfLoader) + error toasts (components/toast.tsx). No component calls
  fetch directly — Component → hook → apiFetch → serviceURLs.

## Frontend conventions — ⚠️ RETIRED APP

**This section documents `frontend/`, which is no longer used.** The live UI is
`vikunawebsite/vani-app` and is governed by **`vani-app/CLAUDE.md`** — read
that one. Its loader and toast APIs were deliberately kept identical to the
ones below (`FullPageLoader`, `InlineLoader`, `showToast({message, type})`) so
code moves between them, but everything else here (VDF, the theme registry,
`serviceURLs.ts`, the tab layout) belongs to the retired app.

Kept because the API contracts below are still true of the backend, and
because a date format or a token convention is worth not re-deciding.

- **serviceURLs.ts** is the single registry of endpoints; **api-client.ts**
  the sole fetch wrapper (JWT inject, 401 → silent refresh → retry once).
- Tokens in BOTH sessionStorage and localStorage (`pk-access-token`, …);
  tenant_id lives inside the JWT only.
- **VDF component library** (`components/vdf/`, `Vdf<Name>`): every UI
  element comes from VDF or shared CSS; CSS variables from the theme system
  only — no hardcoded colors; `var(--glass)`/`var(--glass-border)` are NOT
  valid (use `--color-surface`/`--color-border`).
- **VdfPageHeader is mandatory** on every (app) page: `.page` has no
  padding, `.body` carries it; `min-height: 100%` (never `calc(100vh-…)`).
- Theme: 12 themes via CSS variables; default vikuna-black (gold-on-black).
  Brand strings from `constants/brand.ts` (BRAND.name = 'Vikuna GTM').
- **Dates: `DD-MMM-YYYY` (e.g. 27-Jul-2026) everywhere** — always via
  `lib/format.ts` (`formatDate`/`formatDateTime`), never inline
  `toLocaleDateString`. Server stores UTC; format.ts is the single
  conversion gateway. Tenant timezone prefs + date-input parsing are
  DEFERRED (tracked in HANDOVER) and will land in format.ts only.
- `onboarding_complete` is DERIVED: `count(vn_tenant_onboarding WHERE
  status != 'completed') == 0`. Seeded steps at registration:
  `user_profile`, `business_profile`. `POST /profile/approve` does NOT
  release onboarding — complete steps via `PATCH /onboarding/step`.

## Migrations — MANUAL ONLY, NO AUTO-MIGRATE
- Never run automatically. Apply: `cd backend && npm run db:migrate`;
  status: `npm run db:migrate -- --status`. Highest = **249**.
- Discuss schema changes with the user first. Make migrations **idempotent
  and guarded** (IF NOT EXISTS; DO-block existence checks before copying
  from or altering legacy tables — vani_gtm_db was bootstrapped fresh and
  never had most legacy tables).
- Tenant-scoped user-facing IDs via `gt_next_seq(tenant_id, type)` over
  `gt_seq_counters` (e.g. CONT-0001) — never expose raw PKs.

## Rules for Claude Code
1. **Every SQL query filters by tenant_id** (exceptions: cross-tenant infra —
   `gt_events` poll, `gt_prompts` system rows, public share-token lookups).
2. **Every write in a transaction** via `ctx.db.transaction()`.
3. **Every endpoint/handler has error handling** (structured, logged).
4. **Every page: VdfLoader + toasts; every UI element from VDF**; CSS
   variables only; no per-page CSS for shared patterns.
5. **Table prefix `gt_`** for new product tables (`vn_` is the auth
   framework; no new `ki_`).
6. **SQL in queries/ files**, not inline (small inline SQL acceptable in
   agent-core infra only).
7. **Tests: 3-check pattern** — valid data / empty / wrong tenant → 0 rows.
8. **Tenant + environment isolation on every query** (`tenant_id`, `is_live`
   from JWT context).
9. **UX: glassmorphic, premium, no safe/generic design** — match
   `documents/gtm-engine-ui/` quality; agent-produces-human-confirms
   onboarding model (see ux-references README).
9b. **Every empty state carries a next action.** No screen may show only zeros
    or "no data yet". If there is nothing, say what to do about it and link
    there. (The old War Room showed seven zeros and a flat funnel — that is
    the failure mode this rule exists to prevent.)
9c. **Reuse `PathwayShell`.** Extracted from the Mission Wizard: stepper,
    artefact rail, findings rail. Do not invent another stepper.
9d. **Never fabricate brand or profile content.** If it cannot be derived
    from a crawl or a document, leave it blank and say so. Same rule the
    ai-product-photographer skill already states for brand guidelines.
10. **Migrations manual + guarded + idempotent** (rule above).
11. **No secrets in the repo** — connector credentials live in env/VPS only.
13. **RESEARCH OUTPUT NEVER ENTERS THE COMMON POOL** (user ruling,
    2026-07-29). `gt_account_briefs` is tenant-scoped and stays that way.
    The pool holds what was DELIVERED to it (a load, a source, a supplier,
    scored by source_tier × freshness × completeness × validity). Research
    holds what a TENANT learned. Never the reverse — not the fit judgement
    (it is scored against that tenant's offers and is meaningless to
    anyone else), and not even the factual half (agent-derived facts have
    a different reliability profile and would corrupt the pool's quality
    model; and rich detail appearing in the pool for exactly the companies
    one tenant researched IS that tenant's targeting, visible to all).
    The schema enforces it today — `gt_account_briefs.prospect_id` is a FK
    to the tenant-scoped `gt_prospects`, so a brief cannot attach to a
    pool row. Do not add a path that changes this.
    See `documents/design-notes-research.md` §2 R1.

12. **NO SILENT FALLBACKS** (user ruling, 2026-07-27). A fallback that
    kicks in automatically hides the real issue and fakes a working
    system — the user can't tell degraded output from real output.
    When something fails: **fail loudly**, surface the true cause to
    the user, and stop. Distinctions:
    - ❌ Forbidden: auto-substituting mock/partial/alternate results
      when the primary path fails; swallowing a step failure and
      letting the run report success; defaulting to stale/empty data
      without saying so.
    - ✅ Allowed: an *explicit user-chosen* alternate path offered
      AFTER a visible failure with the real diagnosis (e.g. the
      wizard's paste-copy option shown under the crawl-failure card).
    - Any exception (auto-fallback that seems genuinely warranted)
      must be proposed to the user and approved case-by-case BEFORE
      being built; document approved ones here.
    - ✅ APPROVED EXCEPTION (user, 2026-07-27): **LLM transport
      failover** — when a VPS LLM call fails at the transport level
      (LLM_VPS_UNREACHABLE / LLM_VPS_ERROR) and ANTHROPIC_API_KEY is
      set, llm.client retries that ONE call on the Claude API
      (LLM_FAILOVER_MODEL, default claude-haiku-4-5), then returns to
      the VPS primary. Never silent: visible `llm_failover` step in
      the run feed + tokens tracked under the separate 'escalation'
      bucket. Validation failures (LLM_VALIDATION_FAILED) deliberately
      do NOT fail over — bad answers stay loud.
      **`HAIKU_DEFAULT` decides whether it is automatic (added
      2026-09-18).** Unset or `true` keeps the behaviour above. Set to
      `false`, a transport failure is no longer escalated on its own: the
      call throws `LLM_FAILOVER_NEEDS_APPROVAL`, the worker parks the run at
      `awaiting` with the REAL VPS error, and a person answers through
      `llm-provider-skill.pending_failovers` / `resolve_failover`. Approving
      RE-EMITS the original event with `allow_failover: true` rather than
      resuming the old run — the agents are event-shaped and their claim
      logic already handles a re-run, and a separate row keeps "this cost
      money because someone said yes" answerable. Declining fails the run
      with the cause and spends nothing.

      Why it exists: on 2026-09-18 seven runs failed over inside a minute and
      the only place it showed was the worker's stdout, while Vikuna was
      billed for every call. The escalation was working; what was missing was
      the ability to say "no, tell me first". The permission is read from
      `gt_agent_runs.inputs.allow_failover`, so no agent has to know the
      mechanism exists, and an unreadable run counts as UNAPPROVED — the
      other default would spend money on a database hiccup.

      **This exception is PLATFORM-ONLY.** It does not extend to a tenant
      on their own key (BYOK): failing their call over to Vikuna's
      Anthropic key would bill us for their outage AND hide that their
      endpoint is down. BYOK transport failures throw `LLM_BYOK_*` and
      stay loud (user ruling, 2026-09-15). Enforced twice on purpose —
      a posture check in `callLLM` and distinct error codes, so widening
      the failover condition still cannot route BYOK onto our key.

## Running locally
```bash
cd backend  && npm run dev      # API on PORT (dev .env uses 3002)
cd backend  && npm run worker   # agent worker (separate terminal)

# The UI is in the OTHER repo — frontend/ here is retired:
cd ../../vikunawebsite/vani-app && npm run dev    # Next.js on 3100
```
`vani-app` needs `NEXT_PUBLIC_API_ORIGIN=http://localhost:3002` in its own
`.env`, and this backend needs `3100` in `CORS_ORIGIN`. Miss either and the
console reports "Cannot reach the VaNi service" — see the CORS section.
Ollama for dev LLM: pre-warm `qwen3:8b` with `keep_alive:"24h"` before
testing conversation flows (`curl localhost:11434/api/ps` to verify).

## Testing
```bash
cd backend && npm test          # jest across skills/*/tests
npx tsc --noEmit                # known pre-existing error: campaign-skill
                                # clear-demo-data rowCount (TS2339)
```
Skill smoke test:
`POST /api/v1/skills/:skill/:fn` with `Authorization: Bearer <jwt>` and
`{ "params": {...} }`.

## DB inspection (read-only MCP)
`.mcp.json` registers `gtm-postgres` (SSE via **`mcp-db.dristiq.com`**,
auth from `GTM_MCP_BASIC` env). Setup/runbook: `docs/mcp-db-setup.md`.

⚠️ It pointed at `mcp-gtm.dristiq.com` until 2026-07-27 and never connected —
that host does not answer (curl gets nothing; the agent proxy logs
`403 CONNECT`). `mcp-db.dristiq.com` answers `401`, i.e. reachable and
awaiting auth. If the connector still fails, check in this order:
1. `GTM_MCP_BASIC` set in the Claude environment (not just on the VPS),
2. `mcp-db.dristiq.com` on the environment's network allowlist,
3. the host actually serving `vani_gtm_db` — the runbook was written to give
   GTM its **own** vhost, so confirm this one is not pointed at another
   product's database before trusting what it returns.

## What lives in the database (Phase 0)
`docs/db/triggers-and-functions.md` is the inventory of DB-resident logic:
29 triggers, 75 functions, 9 generated columns — described, classified, and
cross-referenced to call sites. Read it before changing schema, retiring
`ki_*` tables, or touching the RLS role. Headlines:
- 28 of 29 triggers only stamp `updated_at`. The one exception,
  `ki_set_session_limit` on `vn_subscriptions`, silently floors `max_sessions`
  at 5 on INSERT (not on UPDATE).
- 46 of the 75 functions come from `pgcrypto`/`uuid-ossp`. Only 29 are ours,
  and only 4 of those are called at runtime: `set_tenant_context`,
  `gt_next_seq`, `vani_ensure_seq_prefixes`, `vani_ensure_tag`.
- Migration 180 dropped ten MFD tables but `CASCADE` does not read plpgsql
  bodies, so six functions still reference relations that no longer exist.
  Listed as candidates in §5 — **nothing has been deleted**.

`docs/db/ki-disposition.md` — **RESOLVED, nothing to rename.** Production has
exactly **nine** `ki_*` tables and all nine are live: the ETL import pipeline
(`ki_import_staging`, `ki_import_sessions`, `ki_file_uploads`) and the pulse
cluster (`ki_pulse_config`, `ki_pulses`, `ki_pulse_sessions`,
`ki_pulse_session_actions`, `ki_pulse_session_gaps`,
`ki_pulse_session_observations`). No orphans, no KI-Prime data to export, no
two-week rename clock. `233_ki_deprecate_orphans.sql` stays a no-op; leave it.

**Production is NOT the migration files.** Rebuilding locally from
`migrations/*.sql` yields 42 `ki_*` tables and 114 total; production has 9 and
81. `gt_*` (58) and `vn_*` (14) match exactly — the whole divergence is `ki_*`.
Anything measured on a local rebuild is a hypothesis about production until
checked. `deploy/vani-main-vps/verify-phase0-findings.sql` is the read-only
script that checks it.

`docs/db/rls-status.md` covers tenant isolation. **Migrations 235 and 236 are
DEPLOYED to production (2026-08-10) and verified.** A table's OWNER bypasses
its own RLS policies unless `FORCE ROW LEVEL SECURITY` is set — 18 tables were
owned by `vanigtm_app`, so their correct-looking policies did not apply to the
role the cutover points at. 236 forced 17; `gt_agent_runs` is deliberately left
until `agent-core` moves onto `withTenantClient`. Found by running the
isolation test, not by reading anything. In production `vikuna_admin`
is **both** `SUPERUSER` and `BYPASSRLS`, so any replacement role must be
`NOSUPERUSER NOBYPASSRLS` — dropping one attribute alone changes nothing.
(An earlier draft claimed the role lacked `BYPASSRLS`; that was read off a
local rebuild and was wrong about production.)

**Do not create a new app role without looking first.** Production already has
`vanigtm_app`, `vn_app`, `ki_app`, `fk_app`, `kd_app`, `kd_readonly` and
`vikuna_api`, all non-superuser and non-bypassrls. `vanigtm_app` is probably
the intended one; check its grants before minting another.

Migration 234 — **a no-op against production; keep it for fresh builds.**
Production's policies already use the `NULLIF` form (unguarded=0, guarded=54 of
55) and no policy there reads the legacy `app.tenant_id` GUC. The bug is real in
the migration files, so any database built from them needs the fix; the running
database does not. It fixes: 68 policies cast `current_setting(...)::uuid` unguarded, and because
`set_config(..., is_local := true)` leaves the GUC **defined and empty** after
COMMIT (not undefined), the first tenant-scoped transaction on a pooled
connection poisoned it with `invalid input syntax for type uuid: ""`. Policies
now use `NULLIF(current_setting(...), '')::uuid`. This is lesson 1 below, whose
other half — the policy, not just the caller — went unnoticed while RLS was
dormant.

`deploy/vani-main-vps/rls-two-tenant-test.sql` is the isolation test: run it as
the app role, never as postgres. All 13 checks pass on the rebuilt schema, and
it was verified to fail when RLS is disabled.

Migration 235 — **this is the one production actually needs.** Confirmed live:
`gt_tags` holds 1 platform row of 4, and `gt_content_kinds` holds 8 of 8, so
that whole table goes dark for every tenant the moment RLS is enforced without
it. The bug: `gt_tags` and `gt_content_kinds` use
`tenant_id IS NULL` for platform rows, and `tenant_id = <uuid>` never matches
NULL — so platform tags vanished and `gt_content_kinds` (all 8 rows platform)
became invisible entirely. Each table now has a `FOR SELECT` policy admitting
platform rows plus a `FOR ALL` write policy confined to the caller's tenant,
so no tenant can mint a row every other tenant sees. **Known gap:** admin
platform-tag creation via `POST /etl/tags` is refused under that write policy
and needs its own mechanism before the cutover.

**Reaching the DB outside a skill:** use `withTenantClient(pool, tenantId, fn)`
from `db/query.ts`. Raw `pool.query` against an RLS table returns nothing.
`getClientWithTenant` was removed — it set the GUC outside a transaction, so
the context had already expired by the time the caller got the client.

The ETL pipeline and the public `/r/:token` report route are converted and
verified; the full assessment flow passes end to end under a restricted role,
and under the superuser too, so all of this ships safely before the cutover.
Still to exercise under the restricted role: signup, login, skills executor.
Runbook in §8 of the doc.

## BYOK — a tenant's own model provider (built 2026-09-15)

`vani_llm_provider` (migration 240) finally has code behind it. The column
`credentials_enc` existed since August; nothing encrypted, read or wrote it.

- **`agent-core/secret.crypto.ts`** — AES-256-GCM, applied in Node so the key
  never reaches the database. **The encrypting key is PER TENANT**, derived
  HKDF-SHA256(master=`TENANT_SECRET_KEY`, salt=`vn_tenants.id`). One master
  secret in env — something must be the root of trust and it cannot live in
  the DB beside the ciphertext — but no two tenants share a key. A credential
  therefore cannot be decrypted in another tenant's context even if a query
  were wrong: the derived key differs and GCM refuses. A lock behind the RLS
  policy, not a replacement for it. Envelope encryption (a random data key per
  tenant, stored encrypted, destroyable to shred that tenant's secrets) is the
  stronger form and needs a column, so it is a schema decision. Stored format is
  `v1.<key_id>.<iv>.<tag>.<ciphertext>`; `key_id` is 8 hex of SHA-256 of the
  key (not reversible to it) so rotation can find stale rows and a wrong-key
  failure names both keys instead of saying "unable to authenticate data".
  `TENANT_SECRET_KEY_PREVIOUS` opens both generations during a rotation.
  **No default key** — a shared default is the same as no encryption while
  looking exactly like encryption.
- **`agent-core/llm.provider.ts`** — resolves a tenant to `platform` or
  `byok`, 60s TTL cache, invalidated on write. Posture, not just a URL.
- **`vani/llm-provider.service.ts` + `.routes.ts`** — `/api/v1/llm-provider`
  (GET/PUT/DELETE, `POST /test`, `GET /catalogue`). **The key goes in and
  never comes back**: responses carry a hint (`sk-a…7f3c`), never the
  credential. An empty key field on save means "keep the stored one", which
  is what lets a tenant change the model without re-typing the secret.
- **BYOK is a MENU item, not an onboarding step** (user ruling, 2026-09-16).
  `vani:llm_provider` stays `enabled: false` in `lanes.ts`. Do not flip it.

  **The surface is `vani-app` → System → Settings → Model** (`/settings/model`,
  `vikunawebsite/vani-app/src/skills/settings/screens/ModelProvider.tsx`;
  it was a top-level `/model-provider` until 2026-09-22, which now
  redirects). A first version was
  written into the retired `frontend/` before that was established; it has been
  deleted rather than left as a second, unreachable BYOK screen.

  **It reaches the backend as a SKILL, not as REST.** `llm-provider-skill`
  (`backend/src/skills/llm-provider-skill/`) wraps
  `vani/llm-provider.service.ts` in five functions, so the console uses the
  generic runner and needs no entry in vani-app's `live-transport.ts`
  `PLATFORM_ROUTES` — that table is the countable list of exceptions to "auth
  is the only non-generic surface" and is meant to stay small. The REST routes
  at `/api/v1/llm-provider` remain for direct API use.

  It was enabled for one day and **trapped a live tenant**, which is worth
  knowing because the missing piece was in the OTHER repo. `enabled` also
  means REQUIRED (`requiredSteps` filters on it), so the server began
  answering `next_incomplete_step='vani:llm_provider'`. The console
  (`vikunawebsite/vani-app`) keeps its OWN client-side step catalog at
  `src/skills/onboarding/lanes/product.ts` — three steps, no entry for this
  one — so `OnboardingRunner` found no step to render, while
  `RequireSession` held the tenant at `/onboarding/declare` because the only
  pending step started with `vani:`. A tenant with Vara live and a published
  JD could not reach their console.

  **Before enabling ANY `vani:` step, check that vani-app's `product.ts` has
  a matching entry and a step component.** The two catalogs are in different
  repos and nothing keeps them in sync.

Two rulings (user, 2026-09-15) that the code enforces, not just documents:
1. **The daily token cap does not apply to BYOK.** It exists because Vikuna
   pays. Usage is still RECORDED — metering is not capping, and "what did
   this run cost" is a question a BYOK tenant will ask.
2. **BYOK never fails over to Vikuna's Anthropic key.** See rule 12 below.

Both are covered by `agent-core/tests/llm-byok.test.ts`, each with a platform
CONTROL — without those, the tests would also pass if the cap or the failover
were broken outright rather than correctly scoped.

**Migration 247** forces RLS on `vani_llm_provider` and repoints
`vani_current_tenant()` off the legacy `app.tenant_id` GUC. It deliberately
does NOT force the rest of the `vani_`/`vara_` spine — that would break Vara.
Read `docs/db/rls-status.md` §11 before touching any of it.

## Domain packs publish themselves now (changed 2026-09-17)

`domain-pack-skill`'s agent used to park a finished draft at `awaiting` and
wait for an operator to run `npm run packs --publish`. **It now publishes when
it finishes**, stamped `review_state: 'unreviewed'`, and the run completes.

The reason is run 92: it sat parked overnight, and the tenant who triggered a
20-minute research run saw nothing come of it. A pipeline that ends at a person
inside Vikuna is a pipeline every tenant is stuck behind (user ruling: "it
should be user driven else everything will get stuck").

**This is a real change of posture on platform data and it was made
deliberately.** A generated pack now reaches every tenant in its industry
before a human at Vikuna reads it. Three things stand in for the gate:

- `assertNoTemplateLeak` refuses a draft before it is ever written — it caught
  run 90 copying one must-have across six of eight families.
- The `unreviewed` label reaches the console (`research_status.unreviewed`), so
  "researched" and "researched and checked" never read the same. Rule 12: the
  degraded thing is labelled, not hidden.
- `--retire` withdraws a bad pack without deleting it.

**The obvious alternative was tried and is wrong.** Showing an unreviewed pack
only to the tenant who requested it strands the SECOND tenant in that industry:
they see nothing, and they cannot research it either, because the claim
correctly reports the industry as already studied. `requested_by` is recorded
as provenance — who paid for the run — and is never a visibility filter.

### Three review states, and the reader trap

`unreviewed` → `reviewed` (promoted) or `retired` (withdrawn). Promotion and
retirement are **append-only**: each writes a NEW version carrying the state,
so "what did this pack say when it was promoted" stays answerable.

That append-only shape hides a trap, and every reader of `vani_domain_pack`
must avoid it. Readers take `DISTINCT ON (code) ORDER BY version DESC`. Filter
out retired rows in the WHERE and `DISTINCT ON` falls back to the previous
version — **the retired pack comes back**, while the row count drops by one so
the retirement looks like it worked. Pick the latest version FIRST, judge the
state after. `review-state.ts` exports `visiblePacksOfDomain()` and
`visiblePackOfFamily()` for exactly this; never hand-roll the predicate. It was
caught by a test, not by reading.

### The operator CLI is a quality tool, not an admission gate

```
npm run packs                      # published but nobody has read it
npm run packs -- --read <code>     # one pack in full
npm run packs -- --promote <code>  # mark reviewed
npm run packs -- --retire <code> "reason"
npm run packs -- --research <tenantId> [--force]
npm run packs -- --drafts          # legacy runs parked before 2026-09-17
```

A reason may be several words — the old `--reject` read `args[i+2]` and
silently kept only the first, which PowerShell made easy to hit.

## Main VPS — known broken, DEFERRED (recorded 2026-08-17)

Found while scoping VaNi's tenant onboarding, from `gt_events` on the Main VPS.
**None of these are being fixed now.** They are recorded so the next session does
not rediscover them, and so nobody plans a feature on a pipeline that is not
running. Every one is environmental — no code defect among them.

| Symptom in `gt_events.error` | Count | Cause |
|---|---|---|
| `LLM_VPS_UNREACHABLE: Cannot reach http://localhost:11434` | 8 | Ollama's port, but `localhost` inside a container is the container. The LLM URL was never set for containerised deployment |
| `LLM_VPS_UNREACHABLE: Cannot reach https://llm.dristiq.com` (timeout) | 4 | A later remote model that timed out |
| `URL_EMPTY_CONTENT: https://vikuna.io/ yielded 6 chars` | 4 | vikuna.io is a Vite SPA. The static crawl gets nothing; the n8n headless escalation is the only path for JS sites |
| `SEARCH_NOT_CONFIGURED: SEARXNG_URL is not set` | 1 | Competitor search was never deployed |
| `relation "gt_tenant_brand" does not exist` | 1 | Latest failure, 2026-08-15. The brand pull queries a table that exists in NO branch of this repo — see below |

### Two things that need a decision, not a fix

**1. The worker IS running on the Main VPS — corrected 2026-09-16 (user).**
Deploys reach it: "any updates we will deploy to VPS and it will run". Event-driven
work is therefore live, and a feature may be planned on the queue.

This entry previously said the opposite, read off `ps`/`docker ps -a` on
2026-08-17, and it was left to go stale for a month. Treat it as the example:
an environmental finding is true of a moment, not of the system. Re-check
before planning around one.

**Still true, and it is a deploy-story gap:**
`deploy/vani-main-vps/docker-compose.vani.yml` in this repo defines only
`vani-backend`. So whatever supervises the worker on that box — pm2, systemd, a
second compose file — is **not described in this repo**, which means nothing here
tells you how a deploy restarts it, or whether it comes back after a reboot.
Bring it into the repo's compose (~400MB; the box had 4.3Gi free on 2026-08-17)
or commit the unit file next to it, so the restart path is reviewable.

**2. `gt_tenant_brand` is referenced by code that is not in this repo.** Not in
`backend/src`, not in `backend/migrations`, not on any remote branch. The image
running before 2026-08-17 was therefore built from an uncommitted working tree.
Commit that work before the next rebuild, or it is lost — the pre-rebuild image
was preserved as `vikuna/vani-backend:pre-onboarding-20260817` on the VPS, which
is the only remaining copy.

### The queue reclaims orphans now — FIXED 2026-09-17 (migration 253)

`gt_events` grew `started_at` and `attempts` (approved by Charan). The claim
stamps both; `reclaimStaleEvents()` runs on every poll and returns a row whose
claim has gone stale to `pending`, or fails it once `attempts` hits the cap so
a poison event cannot loop.

`started_at` doubles as a HEARTBEAT: `worker.ts` bumps it every 30s while a
handler runs. That is what keeps `WORKER_STALE_CLAIM` at 2 minutes. A plain
timeout would have to exceed the slowest agent — enrichment is 20+ minutes —
so a worker that died after ten seconds would have sat undetected for half an
hour.

Migration 253 also ADOPTS rows stranded before it existed, stamping them with
`created_at` rather than `now()` so they are immediately stale rather than
looking freshly claimed.

Tunables: `WORKER_STALE_CLAIM` (default `2 minutes`), `WORKER_MAX_ATTEMPTS`
(3), `WORKER_HEARTBEAT_MS` (30000).

### Found while fixing it: `WHERE id IN (SELECT … LIMIT n)` does not limit

The claim had always been

```sql
UPDATE gt_events SET status='processing'
 WHERE id IN (SELECT id FROM gt_events WHERE status='pending'
              ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED)
```

Postgres plans that sublink as a **Nested Loop Semi Join** and re-runs the
LIMIT subquery per outer row, so EVERY pending event is claimed. `LIMIT 1`
against three pending rows claimed all three — reproduced, and visible in
`EXPLAIN`.

So **`WORKER_BATCH_SIZE` was never respected**, and `processEvent` is
fire-and-forget: twenty queued events meant twenty agents running at once,
each holding an LLM call against a model that does ~12 tokens/sec.

The fix is a CTE, which is a genuine optimisation fence — it runs once and the
UPDATE joins its result. Both claim sites (`event.store.ts` and the
`PostgresEventQueue` in `worker.ts`) carry it. **Never write the IN form.**

### Publishing a JD must not rewrite the family's shape (fixed 2026-09-18)

`POST /vara/jd/compose` seeded the family's scoring config with
`ON CONFLICT (tenant_id, family_id, version) DO UPDATE`, and
`vara_scoring_config` carries an append-only trigger (migration 241) that
raises on ANY update. So the conflict branch could only ever fail — and it was
unreachable, because compose was the first thing that ever wrote a v1.

**The take step made a v1 exist before any JD, and the dead branch became the
only branch.** Every JD published into a taken family raised "table
vara_scoring_config is append-only", rolled the transaction back, and surfaced
as "Could not publish this JD".

The fix is not a better UPDATE, it is not updating: if the family already has an
`active_config_id`, compose uses it and changes nothing. A family's shape moves
only through `update_family_shape`, which appends a version. Edits made in JD
Studio belong to that JD (`vara_jd_version`), and publishing one must never
re-decide the bar for every future role in the family.

`src/vara/tests/jd-compose.db.test.ts` drives the REAL router over HTTP against
the REAL triggers — a test that re-implemented the SQL would have been written
with `DO UPDATE` in it and passed.

**Both messages said "Could not publish this JD"** — the server's generic 500
and the console's fallback for a non-API error — so the toast could not tell
"Postgres refused the write" from "the browser never got an answer". The server
now names the failure class from the SQLSTATE (append-only guard, unique,
foreign key) and says nothing was saved; the console never reuses the server's
wording. Identical error strings on two sides of a boundary cost a session.

### Tenant-built role families are NOT harvested (user ruling, 2026-09-17)

A tenant who builds a family from scratch owns it, full stop. There is no
feedback path to Vikuna and none should be built — "feedback to vikuna might
be offline". If Vikuna wants to know that six tenants independently invented
"SRE", that is an operator running a query against `vani_role_family` where
the active config has no `from_pack`. Data you already have, looked at by a
person. Not a pipeline, not a consent surface, no code.

### llm.dristiq.com fell over on 2026-09-18 — read the run numbers

Seven runs (102, 103, 104, 106, 107, 108, 109) failed in one burst, split
between two symptoms:

```
LLM_VPS_UNREACHABLE  TimeoutError: The operation was aborted due to timeout
LLM_VPS_ERROR        500 {"message":"Context size has been exceeded."}
```

**The seven concurrent runs are the cause, not a coincidence.** Until the CTE
fix above, `WORKER_BATCH_SIZE` was never respected: the claim took EVERY
pending event, and `processEvent` is fire-and-forget, so all seven agents ran
at once. Each holds a large prompt against one small model server.
"Context size has been exceeded" from a server serving seven concurrent
requests is its KV cache exhausted, not one prompt being too long — which is
why the same prompts worked fine when a run had the box to itself. The
timeouts are the same thing from the other side: requests queued behind the
ones that were thrashing.

So the first thing to do about dristiq is **deploy** — batch size and the
orphan reclaim together. If it still fails with one run at a time, then it is
a real capacity problem and the next levers are the server's context/parallel
settings, or a bigger model (qwen3-4b runs ~12 tok/s).

### It happened again after that deploy — the missing half (run 114, 2026-09-18)

```
[Queue] Reclaimed orphaned events: 5 requeued, 0 failed after 3 attempts
[Worker] Run 114 needs a decision on failover: LLM_VPS_ERROR: 500
         {"message":"Context size has been exceeded."}
```

Those two lines are **one event**. The reclaim returned five events to
`pending`, `WORKER_BATCH_SIZE` is 5, and `processEvent` is fire-and-forget — so
five agents went at one small model server together. The CTE fix capped how
many events are **claimed**; it never capped how many LLM calls are **in
flight**, and that is the number the model server cares about.

`agent-core/llm.gate.ts` adds the half that was missing:

- **Take turns.** A FIFO lane per endpoint URL, platform limited to ONE call at
  a time (`LLM_MAX_CONCURRENT`, default 1; BYOK `LLM_BYOK_MAX_CONCURRENT`,
  default 4). Keyed by URL so a tenant's endpoint never queues behind Vikuna's.
  The per-call timeout starts when the call starts, not when it was queued, and
  the worker's 30s heartbeat keeps a waiting run from being reclaimed.
- **Measure before sending.** `max_tokens` is RESERVED INSIDE the window, not
  added to it — a 7000-token prompt fits alone and fails with 1000 kept for the
  answer. Where the window is known (`LLM_CONTEXT_TOKENS`, default 8192,
  platform only) an over-budget call is refused with the numbers and nothing is
  spent. A 500 from the server now carries our estimate too, so the log says by
  how much.

Neither gate truncates, summarises or retries smaller: trimming a prompt to fit
changes the question without saying so and the answer comes back looking like a
full one (rule 12). Making a prompt smaller is the caller's job, and it can only
do that job if it is told the real numbers.

**The lane is IN-PROCESS.** It covers the worker, which is where the five
concurrent agents came from. Two workers, or the API process, still make
concurrent calls — a cross-process limit needs a shared lock and is a decision
to raise, not a gap to rediscover from the same 500.

### The budget is the authority — hand-picked caps are not (2026-09-18)

Charan: `LLM_CONTEXT_TOKENS` "is the value which is inside the code, there is
no other configuration anywhere ... so ideally that limit should not exceed."
Right, and refusing an oversized call is only half of it — the code must not be
able to BUILD one.

Two builders already could:

| Builder | Cap it had | ≈ tokens | Verdict |
|---|---|---|---|
| `profile.drafter` | `rawText.slice(0, 24_000)` | ~6,000 | over an 8,192 window before the system prompt was counted |
| `storyteller.agent` | none — one line per KG node | unbounded | grew with the tenant until it crossed |

Both now derive their cap from `charBudgetFor(model, reserveOutput, fixedText)`
and say what they trimmed. The storyteller drops NODES, never the profile, from
the end (most recent first), and tells the model how many it did not see so it
does not speak for them.

**Any new prompt that pastes in crawl text, KG nodes, search results or another
model's output uses `charBudgetFor`.** A number chosen next to the window drifts
away from it; a number derived from it cannot.

### Counting tokens without a second call

"llm invocation is required to check tokens" — it is, and it already happened.
Every successful response carries `usage.prompt_tokens`: the server's own count
of the exact string we sent. `noteObservedTokens` learns chars-per-token per
model from that, so the first call on a cold process uses the 4.0 heuristic and
every one after is measured in that model's real tokenizer. No `/tokenize`
endpoint needed (Ollama's OpenAI layer does not expose one).

It keeps the **densest** ratio seen, never the friendliest: a budget built on
prose at 6 chars/token is overrun by the next block of JSON at 2.5, and
optimism here is paid for with a 500.

**The cold-start guess is 3 chars/token, not 4 (changed 2026-09-26).** The
vikuna.io crawl failed with "Context size has been exceeded" on a server whose
window matched `LLM_CONTEXT_TOKENS`. The worker restarts on every deploy and
every env change; its first big call is the profile drafter filling the whole
window at the guess; qwen3 on crawl text runs nearer 3; so the first call after
every restart overran by a quarter — and a 500 carries no usage, so the
calibration never got the sample that would have fixed it. Two changes:
`LLM_CHARS_PER_TOKEN` (default 3) is the guess, and **a refusal is a
measurement** — `noteContextOverflow` records that the model's ratio is below
chars ÷ room, so the retry is built smaller instead of repeating the prompt.
Setting `LLM_CONTEXT_TOKENS=8192` on a server that runs 8192 changes nothing;
it was never the window that was wrong, it was the guess.

**The budget and the check must use the same ratio (2026-09-26, the same
run).** Every prompt builder calls `charBudgetFor(undefined, …)` because the
model is resolved per tenant later, inside `callLLM`; the check in `callLLM`
knows the model. The drafter budgeted at the heuristic, the gate checked at
the ratio it had just learned for qwen3-4b, and refused what the budget had
allowed: `LLM_CONTEXT_TOO_LARGE` on a prompt the code had just trimmed to fit.
`charsPerToken()` with no model now returns the densest ratio seen for ANY
platform model, and `charBudgetFor` keeps `BUDGET_SLACK_TOKENS` (64) back for
the caller's own wrapper text. Tested: a budget made without the model passes
the check made with it.

**Haiku as the platform model is an `.env` decision, not a code path (Charan,
2026-09-26: "haiku should be handled from .env").** Anthropic serves the
OpenAI-compatible shape `callEndpoint` already sends (bearer auth, one system
message, `max_tokens`, `temperature`, `usage.prompt_tokens` back), so
`LLM_PRIMARY_URL=https://api.anthropic.com/v1` + `LLM_PRIMARY_MODEL=
claude-haiku-4-5` + `LLM_PRIMARY_KEY` is the whole switch; the block in
`.env.example` has the four companion values (window, concurrency, speed).
The one code change it needed: `/no_think` is appended only when the model
name contains "qwen" — it is a qwen instruction, and Haiku would read it as
text. `HAIKU_DEFAULT` and the failover path are unchanged and become a
no-op when the primary is already Claude.

**A cut-off answer is a partial result, and it says so (2026-09-26).** The
first Haiku run showed eight of fourteen extraction calls returning exactly
800 tokens — the extractor's flat answer cap, chosen for an 8k window. The
parser keeps only complete `<extract>` pairs, so everything after the cut was
lost without a trace. Now: `LLMResult.truncated` (OpenAI `finish_reason ===
'length'`, Anthropic `stop_reason === 'max_tokens'`) is read on every call and
printed on the `[LLM]` line; `EXTRACT_MAX_TOKENS` is derived from the window
(an eighth, 800–3,000); a run whose chunks were cut reports
`extract_complete` with status `error` naming the chunks and the lever. Any
caller that parses an answer checks `truncated` — a truncated list of facts
looks exactly like a complete one.

**How slow the server is, measured (2026-09-26):** `3353 prompt + 330 answer
tokens in 95.3s` from llm.dristiq.com. Every call logs that line; the timeout
is derived from the measured speed with `LLM_PRIMARY_TIMEOUT_MS` as the floor.
A drafter call filling an 8k window takes minutes on that box. The lever is
`LLM_CONTEXT_TOKENS` set lower (every prompt shrinks with it), or a faster
server — not a longer timeout.

**llm.dristiq.com serves qwen3-4b at `n_ctx: 4096` (read off its own 400,
2026-09-26):** `request (4289 tokens) exceeds the available context size (4096
tokens)`. So `LLM_CONTEXT_TOKENS=8192` was double that server's real window,
and the "Context size has been exceeded" 500s were the server saying so. If
that server is ever the primary again, set `LLM_CONTEXT_TOKENS=4096` — a
window is a server fact, not a preference — and expect the profile drafter to
trim hard. It is not the primary now; Haiku is, from `.env`.

**A parked run whose source has since been read is SUPERSEDED, and the queue
says so (2026-09-26).** Run 124 parked on that 400, the same page was then
read successfully on Haiku, and the Knowledge page showed "vikuna.io · read ·
103 entries" with a run underneath asking whether to pay for it.
`llm-provider-skill.pending_failovers` now joins each run through its event
to the source (`awaiting_input.event_id` → `gt_events.payload.source_id` →
`gt_kb_sources`) and returns `source` + `superseded`, judged in SQL as the
source reaching `complete` after the run's `started_at`. The console leads
with Decline on those. The right answer for run 124 is Decline: nothing to
gain, and approving would bill a second read.

### FTCCI through the real pipeline, end to end (2026-09-26)

The only legitimate dataset we hold (2,913 members, Oct 2023) had never been
pushed through the ETL as a common-pool delivery on a database built from the
migrations. Doing it — local Postgres, `db:migrate` + `db:seed`, the API on
:3012, upload → headers → session (`destination: universe_companies`) →
process → `get_records` / `get_loads` scope pool — found four defects that no
reading had:

1. **Every import that held a row reported "failed".** `landing.ts` sets the
   session to `needs_review` when a row is held; the CHECK on
   `ki_import_sessions.status` (104) never had that value — 200 and 201 only
   widened the STAGING check. The final UPDATE raised, the route marked the
   session `failed`, counters stayed 0, and the person was told the import
   failed while 2,882 companies and 5,816 people had landed. **Migration 249**
   adds the value. It is the fix; apply it before the next import.
2. **Different companies on one website collapsed into one pool row.** The
   pool's `source_record_id` was the dedup key, i.e. the domain, so the
   ON CONFLICT upsert made sister companies overwrite each other: 17 vanished
   and the pool reported zero shared identifiers because nothing was left to
   share one — the exact opposite of the design ("flagged, never merged").
   Now: the source's own id when mapped (`company.source_record_id`), else a
   hash of the normalised row. Result: 2,912 rows, 137 flagged.
3. **The detector could not see FTCCI's representatives.** `REP_BY1/POST1/
   PHONE1` have the index glued to the word; the de-indexer required a word
   boundary, so all nine came back "could not guess" — on the file the
   detector was designed around. And once people were found, the un-numbered
   `COMPANY` and `EMAIL` went to the person. Rule now: people found only in
   numbered blocks ⇒ un-numbered ambiguous columns are the company's,
   numbered ones the person's. 18 of 21 columns resolve; PANEL, Panel No and
   FAX are left, honestly.
4. **Domains.** `normalizeDomain` accepted "vignesh pharma.com" and
   "apfta.in; www.tsfta.in" as hosts; it now takes the first host of a list
   and rejects anything that is not one. And a corporate email is read for
   the domain when the file has no website (`domain_source: 'email'`, in the
   staged row): 1,559 → 2,063 rows with a domain, 489 of them from email.
   `FREE_MAIL_DOMAINS` (mailbox providers and Indian ISPs) is the list that
   stops gmail and vsnl becoming someone's company.

What the file is, measured: 87% Hyderabad/Secunderabad, PIN prefix 50 on
2,837 of 2,913, 2,151 distinct BUSINESS strings (2,041 seen once), 1,531 EMAIL
cells with more than one address, 40% of all addresses on mailbox providers,
1,350 PHONES cells with several numbers or notes, freshness `ageing` today and
`stale` from 2026-10-26. The 14 rows held for review are one person named as
a representative of two sister companies on a shared domain — a real question
for a human, not a defect.

Local run recipe: `service postgresql start`; `DB_PRIMARY=postgresql://root@
localhost/<db>?host=/var/run/postgresql npm run db:migrate` (stops at 246,
which needs pgvector — the ETL path does not); `npm run db:seed`; set
`vn_tenants.is_admin = true` on the seeded tenant; run the API with
`JWT_SECRET` and `TENANT_SECRET_KEY` set; sign in; drive `/api/v1/etl/*`.

### EVERYTHING enters through staging, then the pool (user ruling, 2026-09-26)

Charan: "we put everything in staging — as-is condition — then run the
cleanup … tomorrow even if we are using apollo or something, everything
should sit in staging and then moved to pool DB."

So there is ONE road into the common pool, and it has three stops:

```
source  ──►  STAGING (as delivered, raw kept)  ──►  CLEANUP  ──►  POOL
file / directory / exhibitor list / Apollo / any provider / any connector
```

- **Staging always succeeds.** A file with headers nobody recognises, a
  provider payload, a list with no domains: it is staged as delivered, with
  `raw_data` intact and a declared kind. Mapping is the FIRST cleanup step,
  not a gate before staging. The wizard's "map company.name before landing"
  is a gate on LANDING, never on staging.
- **A provider pull is a load, and its records are staging rows.** The Apollo
  connector, when built, writes `gt_source_loads` + `ki_import_staging`
  exactly as a file upload does. It never writes `gt_universe_company_sources`
  directly. Same for every connector after it. The pool has exactly one
  writer: `landing.ts`.
- **Cleanup is a re-runnable worker job over staged rows**, never code inside
  the landing: normalise · domain off a corporate email · name-to-domain
  (SearXNG + LLM check) · liveness · crawl for description and industry ·
  flag shared identifiers · attach a child file to its parent by name key.
  Each step's output is a NEW source row under a `cleanup` source with its
  own tier, so raw stays raw and the merge weighs the two. **Not started:
  the `cleanup` source puts model-derived text in the pool for the first time
  and needs Charan's explicit go.**
- **Why:** staging is the audit trail and the replay point. A bad rule is
  fixed and re-run over the same rows; a bad delivery is retired at the load.
  Neither is possible if a connector lands straight into the pool.

Sources on hand and how they fit: FTCCI (chamber directory, landed and
measured above) · analytica Lab India Hyderabad exhibitor + product lists
(given by the organiser to members — legitimate; 327 exhibitors, 229 product
lines on 64 of them, no domain/address/people; a vertical list whose industry
is the load's default) · the two consumer email lists and the "B2B"
registrant-dump sample (rejected: see the session notes — people, not
companies, and no provenance) · an IT-companies sample in two shapes
(2026-09-26): 100 professional-network people rows (name, title, headline,
62 with a work email; 91 distinct companies, 9 rows where the "person" is
the company itself, ~10 whose headline names a different employer than the
company column, one company called "Software companies in Pune") and 27
provider-enriched company records (domain 27/27, description, size band,
NACE codes, city, generic mailboxes, monthly traffic). **The company half is
pool-grade IF the provider's licence permits sharing across tenants — most
forbid it, and that is the question to ask before buying.** The people half
is tenant-scoped only (people never enter the pool), and nothing may be sent
to them until the consent/suppression model exists. Neither half may be
landed from the paste: the copy lost every separator (email glued to
headline, city glued to mailbox) — ask for the CSV export. Charan can get
~25k rows in the company shape. Of its seven fields, five land in typed
columns today (name, domain, description, employees_band, city, plus one
mailbox in `email`); the NACE codes and the traffic figure have no column
and stay in `raw` until someone decides they deserve one. What the shape
lacks is address/state/PIN, phone, revenue, year founded and people, so
"needs enrichment" means those — enrich on demand for the companies a
tenant qualifies, never the whole 25k up front. **Enrichment runs on
Haiku, and a "cheap classifier lane" was tested and rejected (2026-09-26):**
Laya, an open-weight typed-decision model, agreed with Haiku on 31% of
industry calls over 627 rows and its confidence did not predict its errors,
so it cannot route its own hard cases; it was also slower than Haiku on a
laptop CPU. Harness and numbers in `backend/scripts/laya-trial/`. The cheap
lane is code (normalise, domain-from-email, liveness, hashing), not a smaller
model. The trial also measured two things about FTCCI itself: ~4% of member
rows are individual practitioners (advocates, CAs) sitting in a companies-only
pool, so cleanup needs an `is_individual` decision; and 41 of 377 domains do
not match the name, but most are a brand or group site, so the cleanup
question is `same | brand_or_group | unrelated`, not yes/no. The provider also sells the
same shape in labelled lists ("growth stage startups": 100 rows, all 1-10 or
11-50 staff, median 2K visits/month, mostly online education). **A list
label is the provider's claim about the list, not a fact about the company**
— nothing in the rows evidences it — so it lands as a tag on the LOAD
(`tag_ids` on the delivery), never as a column, and the console shows it as
"tagged by <provider>".

**The pool's sources are decided (Charan, 2026-09-26).** Own data only:
~400k company records Charan already holds in the provider shape above, plus
~200k bought outright from a vendor ("we pay him, that's it, no T&C"), plus
member directories (FTCCI, exhibitor lists) and public registries. Apollo /
Clay are tenant-key connectors for PEOPLE and stay tenant-scoped; their terms
forbid redistribution, so they can never be the pool. Keep one line on the
vendor's invoice saying the delivery is for unrestricted use — the pool's
value is that it can be given to tenants, and that line is what makes it
defensible. Before a 600k-row load: chunked upload + landing as a worker job
(the path was measured at 2,913 rows in one request), dedup across lists,
then Pass 1 (Haiku reads every description → our industry, offering, buyer,
B2B/B2C, is_individual; ≈ $900 at 600k), then crawl and registry join on
demand in tenant order, then the merge engine before the second delivery of
any list.

## Lessons learned (hard-won — do not relearn)
1. `set_tenant_context` uses `is_local=true` → wrap with BEGIN/COMMIT or the
   GUC dies before your query (surfaced as `invalid input syntax for type
   uuid: ""` under RLS). The wrap is only half the fix: after COMMIT the GUC is
   **defined and empty**, not undefined, so any policy casting it without
   `NULLIF` raises on the next query. Migration 234 fixed all 76.
2. `jsonb_build_object($key, …)` needs `$key::text` — PG can't infer
   variadic arg types.
3. Migration runner history can drift from schema reality (fresh bootstraps,
   manual applies) — always guard migrations; never assume a legacy table
   exists.
4. Small LLMs ignore soft formatting instructions: gemma paraphrases
   `<extract>` tags away; deepseek-r1 drowns replies in `<think>`. qwen3:8b
   obeys; `/no_think` suppresses its reasoning block.
5. Ollama unloads models after ~5 min idle — pre-warm with `keep_alive` or
   first calls time out.
6. `.env` changes need hard restarts — tsx watch reloads code, not env.
7. Store tokens in BOTH sessionStorage and localStorage; call storeTokens()
   in component onSuccess (React batching can defer hook callbacks).
8. `vn_tenants.is_active` is a generated column — never INSERT into it. There
   are **nine** generated columns, all listed in `docs/db/triggers-and-functions.md` §4.
9. PowerShell mangles inline JSON — use Postman or `curl.exe --data @file`.
10. Every list endpoint MUST have a tenant filter — verify the WHERE clause,
    never assume.
11. Phone numbers: separate `country_code` + `mobile` fields, never
    concatenate-and-parse.

## Deliberately not being built

Do not start any of these. Push back if asked without an explicit decision:

agent marketplace · per-agent pricing UI · marketing asset gallery or template
library · ~~knowledge graph as a product surface~~ · unified namespace / resolver ·
any new agent framework (Hermes and similar — evaluated 2026-08, parked)

~~knowledge graph as a product surface~~ — **SUPERSEDED 2026-09-26 (Charan):**
"i was asking UX for knowledge and knowledge graph both". Both exist in
vani-app under Smart Profile: `/smart-profile/knowledge` (sources, and every
node by kind with its source) and `/smart-profile/knowledge-graph` (the
relationships between them, drawn, and readable as sentences). Both read
`ingestion-skill.knowledge`, which returns nodes and edges. What stays out is a
free-form canvas editor; the graph is read, corrected by teaching, never
hand-edited.

~~email sending · Storytelling / Campaigns / Follow-ups agents~~ —
**SUPERSEDED 2026-09-22 (Charan).** A storytelling agent that composes per
offer and per segment and sends across email, SMS, WhatsApp, LinkedIn and X is
the product's differentiator and is being built. Read
`documents/design-notes-outreach-and-delivery.md` before starting any of it.

**Sending is still gated, and the gate is now harder.** It used to be quality
— ICP confirmed, brand captured, one offer defined. It is now ALSO consent:
**there is no suppression or opt-out model anywhere in this repo**, so no
channel may send until one exists. Vara has `vara_consent`; GTM, which is the
side that contacts strangers, has nothing. That gap is the blocker, not a
nice-to-have (design note §5).

Three rulings from the same conversation, so nobody re-derives them:

- **The platform owns orchestration, story, cadence, consent and evidence; the
  tenant owns identity and delivery.** First-party tenants (Vikuna's own
  products, which are tenants like any other) may send under the platform's
  identity. Every other tenant: always their own. One flag on the tenant, not a
  per-channel judgement.
- **A tenant's own data provider (their Apollo / Clay key) is a third posture**
  alongside upload and platform connector — and its results are tenant-scoped
  only, NEVER the common pool. Rule 13 and most providers' terms say the same
  thing. Copy `vani_llm_provider`'s platform/byok shape rather than inventing one.
- **LinkedIn and X are ASSISTED, not automated** — no legitimate 1:1 bulk API
  exists, and browser automation puts the ban on the tenant's own account.
  Assisted touches must still consume cadence slots, or the governor is blind
  to half the outreach.

**Touches and signals are two different spines, and mixing them inverts the
product.** `cadence.service.ts` counts EVERY `gt_touch_log` row for a contact
as a consumed touch — deliberately, because fatigue is the person's. So an
analytics event written into that table consumes a cadence slot, and a prospect
who reads the pricing page three times becomes someone the governor refuses to
let you contact. The most engaged prospect is the one you go silent on. When
Google Analytics and ad analytics arrive they land in their OWN spine —
immutable source rows keyed by the source's own event id, resolution to a
person as a separate revisable link, tenant-scoped, never the pool, and never
counted by the governor. Signals inform touches; touches consume budget. Design
note §9.

**And before designing any of it: four pieces are already built with no console
at all** — `gt_channels` (161), the cadence governor `gt_cadence_policy` +
`gt_touch_reservations` (223), the story library `gt_journey_stories` +
`gt_content_kinds` (225), and `gt_touch_log` (221). The governor in particular
is the best-reasoned thing in the repo. Read migration 223's header before
writing a sequencer.

## Current phase

1. Mission Wizard completion — five steps; brand added as step 5; Storytelling /
   Campaigns / Follow-ups removed from the stepper (they were never setup steps,
   which is why the profile score could never reach 100)
2. Intelligent Add Offers — derived from the site crawl, confirmed not typed.
   Offers are a BRAIN object, not a step inside a GTM pathway.
3. Nova N1 — digital audit remediation

## Working method

- Every piece of work changes something visible within about a week. If it cannot,
  it rides underneath something that can. Invisible infrastructure gets no phase
  of its own.
- Run it, don't read it. Phase 0's highest-value finding — 18 tables whose policies
  were inert — came from executing the isolation test, not from reading schema.
- Findings go in the repo, not in chat. docs/db/ and docs/gtm/ already hold several.
