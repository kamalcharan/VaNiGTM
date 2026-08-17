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

## Architecture
- **Two processes:** Express API (`backend/`, port 3002 in dev) + Next.js 16
  App Router (`frontend/`, port 3000). Not a single custom server.
- **Worker:** separate process (`npm run worker`) polling the `gt_events` bus
  and dispatching agents.
- **Stack:** React + TypeScript frontend, Node.js + Express + TypeScript
  backend, PostgreSQL on VPS (`vani_gtm_db` — connection via `DB_PRIMARY`).
- **LLM:** VPS/local OpenAI-compatible endpoint (`LLM_PRIMARY_URL`, dev =
  Ollama). Working dev model: `qwen3:8b` (pre-warm with `keep_alive:"24h"`;
  `llm.client.ts` appends `/no_think` and sends `Authorization: Bearer
  $LLM_PRIMARY_KEY` only if set).
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
  migrations/         — 001…192 (highest = 192)
frontend/
  src/
    app/(auth)        — login, register, forgot/reset password, invite
    app/(app)         — dashboard, onboarding (+icp-builder), contacts,
                        campaigns, pulses, war-room, import*, settings, demo-data
    app/(public)      — landing, deck share viewer
    components/       — vdf/ library, auth/, onboarding/, settings/, pulses/
    config/theme/     — ThemeProvider, ThemeScript, 12 themes
    hooks/ lib/       — useSkill/useMe/…, serviceURLs.ts, api-client.ts
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
  blocker is fixed, and the two-tenant isolation test passes 13/13 locally. The only step left is operational: run
  `scripts/grant-vanigtm-app.sql`, point `DB_PRIMARY` at `vanigtm_app`,
  restart, re-run `deploy/vani-main-vps/rls-two-tenant-test.sql`. Rollback is
  putting `DB_PRIMARY` back. Full detail in `docs/db/rls-status.md` §8.
- A table's OWNER bypasses its own policies unless `FORCE ROW LEVEL SECURITY`
  is set. 18 tables were owned by `vanigtm_app` — migration 236 forced 17.
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

## Frontend conventions
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
  status: `npm run db:migrate -- --status`. Highest = **192**.
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

## Running locally
```bash
cd backend  && npm run dev      # API on PORT (dev .env uses 3002)
cd backend  && npm run worker   # agent worker (separate terminal)
cd frontend && npm run dev      # Next.js on 3000
```
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
the app role, never as postgres. All 11 checks pass on the rebuilt schema, and
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

**1. The worker is not running, and never was a service.** `ps` and `docker ps -a`
on the Main VPS find nothing. `agent-core/worker.ts` says "Separate process", and
`deploy/vani-main-vps/docker-compose.vani.yml` defines only `vani-backend`. The
queue has been drained by hand at some point. Anything event-driven is dead on
that box until the worker becomes a compose service (~400MB; the box had 4.3Gi
available on 2026-08-17).

**2. `gt_tenant_brand` is referenced by code that is not in this repo.** Not in
`backend/src`, not in `backend/migrations`, not on any remote branch. The image
running before 2026-08-17 was therefore built from an uncommitted working tree.
Commit that work before the next rebuild, or it is lost — the pre-rebuild image
was preserved as `vikuna/vani-backend:pre-onboarding-20260817` on the VPS, which
is the only remaining copy.

### The queue has no stale-row reclaim — a real bug, still open

`agent-core/event.store.ts` claims work with
`UPDATE ... SET status='processing' WHERE status='pending' ... FOR UPDATE SKIP LOCKED`.
Nothing ever returns a stale `processing` row to `pending`. A worker that dies
mid-run orphans its in-flight events permanently — 9 rows were stuck this way on
2026-08-17 (8 `ACCOUNT_RESEARCH_REQUESTED`, 1 `URL_SUBMITTED`).

This one matters beyond tidiness: any UI that blocks on an event completing can
trap a user forever. Fix before building on the queue — a `started_at` timeout
back to `pending`, with a retry cap so a poison event cannot loop.

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
