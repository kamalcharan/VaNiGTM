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
  migrations/         — 001…191 (highest = 191)
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
- Policies exist on tenant-data `gt_` tables, but the runtime currently
  connects as `vikuna_admin` (BYPASSRLS) — **RLS is dormant**; isolation
  rests on application-layer `WHERE tenant_id = $tenant_id` filters.
- The least-privilege cutover to `vanigtm_app` is drafted in
  `scripts/grant-vanigtm-app.sql` + `docs/rls-cutover-checklist.md` and is a
  REQUIRED pre-production task (includes the SECURITY DEFINER fix for the
  public deck share route).
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
| research-skill | outward competitor research (ICP → web → KG) | ✅ live (needs SEARXNG_URL) |
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
  status: `npm run db:migrate -- --status`. Highest = **191**.
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
`.mcp.json` registers `gtm-postgres` (SSE via `mcp-gtm.dristiq.com`,
auth from `GTM_MCP_BASIC` env). Setup/runbook: `docs/mcp-db-setup.md`.

## Lessons learned (hard-won — do not relearn)
1. `set_tenant_context` uses `is_local=true` → wrap with BEGIN/COMMIT or the
   GUC dies before your query (surfaced as `invalid input syntax for type
   uuid: ""` under RLS).
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
8. `vn_tenants.is_active` is a generated column — never INSERT into it.
9. PowerShell mangles inline JSON — use Postman or `curl.exe --data @file`.
10. Every list endpoint MUST have a tenant filter — verify the WHERE clause,
    never assume.
11. Phone numbers: separate `country_code` + `mobile` fields, never
    concatenate-and-parse.
