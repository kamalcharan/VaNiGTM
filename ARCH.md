# ARCH.md — the common architecture every slice obeys

> Status: v1.0 · 2026-09-30 · Written under `documents/POA-2026-09-30-platform.md`
> Track A1. This is INTENDED architecture (Charan, 2026-09-30: "specs should be
> what is intended; if the product deviates, we correct it"). Where the code
> deviates today it is marked **[deviation]** with the track that fixes it.
> `AGENTS.md` is the companion for anything an agent does; `CLAUDE.md` is the
> working notebook and defers to both.

## 0. The shape

```
website (vikuna.io, Vite)          the marketing site and the funnel's first screen
        │  "enter your website"  → anonymous crawl → teaser → signup
console (vani-app, Next.js)        one UI: platform + agents, deployed from this repo (Track H)
        │  skill calls  POST /api/v1/skills/:skill/:fn      ← the only generic surface
        │  auth         /api/v1/auth/*                       ← the only non-generic surface
API (backend/, Express)            skills · routes · the skill runner
worker (backend/, separate proc)   polls gt_events, dispatches agents (AGENTS.md)
PostgreSQL (vani_gtm_db)           one database; vn_ auth · vani_ platform · gt_ product · vara_ agent
```

Two processes share one codebase and one database. The console is a separate
build with its own lockfile; it moves into this repo under Track H and nothing
about this document changes when it does.

## 1. Tenancy

- **Every tenant-scoped row carries `tenant_id UUID NOT NULL`.** Every query
  filters on it. The exceptions are named, not implied: `gt_events` (the
  cross-tenant bus the worker polls), `gt_prompts` system rows, `gt_agent_runs`
  (the worker writes it without tenant context — RLS is disabled there by
  migration 237 and every reader filters `tenant_id` in SQL), public
  share-token lookups.
- **Two tenant ids exist and are never equal.** `vn_tenants.id` is the JWT's
  and the `gt_` tables'; `vani_tenant.id` is the platform spine's and every
  `vani_*`/`vara_*` row's. They join by `slug`. `vani_current_tenant()`
  (migration 248) bridges them for RLS; application code bridges with the
  `queries/vani-tenant.sql` pattern. A skill that needs the spine resolves the
  vani id once and says `TENANT_NOT_PROVISIONED` when there is none — it never
  creates one (provisioning belongs to the Domain step).
- **`is_live` is an environment, not a flag.** It comes from the JWT, never the
  body. Transactional tables carry it; reads and writes filter on it.
- **`tenant_id`, `is_live`, `user_id`, `is_admin` come from the JWT** via
  `resolveAuth`, land on `SkillContext`, and are the only identity a skill
  function sees. A function that reads identity from `params` is wrong.

## 2. Row-level security

- Policies exist on tenant-data tables and the runtime role `vanigtm_app` is
  `NOSUPERUSER NOBYPASSRLS`. A table's owner bypasses its own policies unless
  `FORCE ROW LEVEL SECURITY` is set; 236 forced the `gt_` tables it found.
- **The `vani_`/`vara_` spine (240–246) is UNFORCED** [deviation → a
  migration, after `rls-two-tenant-test.sql` is extended to cover it;
  `docs/db/rls-status.md` §11–13].
- `set_tenant_context()` sets the GUC `is_local`, so it only lives inside a
  transaction. `db/query.ts` therefore wraps EVERY call in BEGIN/COMMIT with the
  context set after BEGIN. Outside a skill, reach the database through
  `withTenantClient(pool, tenantId, fn)`; a raw `pool.query` against an RLS
  table returns nothing and looks like an empty result.
- Policies cast the GUC with `NULLIF(current_setting(...), '')::uuid` (234),
  because after COMMIT the GUC is defined and empty, not undefined.

## 3. The transport and the skill runner

- **One generic surface.** A skill is a folder under `backend/src/skills/<name>/`
  with a `SKILL.md` (frontmatter + `## Functions`) and one file per function
  under `functions/`. The registry auto-loads it and exposes
  `POST /api/v1/skills/<name>/<fn>` with `{ params }`. The response envelope is
  `{ success, skill, function, recipe, data, error? }` — **`success:false`
  arrives with HTTP 200**, and every caller checks it.
- **Function signature:** `(params, ctx: SkillContext) => Promise<object>`.
  Params first. Reads use `ctx.db.query`; writes use `ctx.db.transaction`.
- **Named SQL parameters** (`$tenant_id`), translated to positional by
  `translateParams`. Every `$name` needs a key; a conditional clause adds its
  key only when the clause is present. JSONB goes in stringified and is cast in
  SQL (`$payload::jsonb`); in `jsonb_build_object` cast key params
  (`$key::text`).
- **SQL lives in `queries/*.sql`** for anything beyond a few lines; agent-core
  infrastructure may inline small statements.
- **REST routes are the exception list.** `/auth`, `/onboarding`, `/tenant`,
  `/etl`, `/vani`, `/ingest`, `/profile`, `/storyteller`, `/assessment`, `/vara`,
  `/llm-provider`, the platform embed router. The console mirrors that list in
  `live-transport.ts` `PLATFORM_ROUTES`, which is meant to stay short. A new
  capability is a skill function unless it genuinely cannot be (public,
  unauthenticated, or streaming).
- **Config is env, never code.** Model, provider, endpoint, window, concurrency,
  speed, timeouts, CORS origins, keys: `.env`. A number that belongs next to
  another number is derived from it (`charBudgetFor`), not restated.
- **CORS_ORIGIN is a list**, matched exactly per entry. The origin that matters
  is the console's (`http://localhost:3100` in dev). A wrong entry has no
  server-side symptom and curl cannot reproduce it.

## 4. Errors

- Every route and every handler is wrapped. The error contract is
  `{ error: { code, message } }` on REST and `{ success:false, error }` on the
  skill runner. Codes are UPPER_SNAKE and stable; messages are for people.
- **Name the failure class.** A 500 that says "could not save" on both sides
  of a boundary cost a session (the JD publish). The server names what refused
  the write (append-only guard, unique, foreign key, RLS empty, LLM transport,
  LLM validation, context too large) and says whether anything was saved. The
  console never reuses the server's wording as its own fallback.
- Log with a `[Scope]` prefix. Never leak a stack to a tenant; a platform admin
  may see it (`runs.get` does exactly this).
- **Rule 12, restated as architecture:** no path substitutes a lesser result
  when the primary fails. A failure is surfaced with its real cause and the
  work stops. The documented exceptions (LLM transport failover under
  `HAIKU_DEFAULT`, the console's declared preview functions) are explicit,
  labelled in the output, and listed in AGENTS.md §6 and `vani-app/CLAUDE.md`
  §2b. An event with no handler is not resolved as done; it stays visible as
  unconsumed.

## 5. Writes: transactions, idempotency, prepare → confirm

- **Every write is a transaction.** `ctx.db.transaction(fn)` in a skill,
  `withTenantClient` elsewhere. A multi-step write that must not half-apply is
  ONE endpoint and ONE transaction. The UI never sequences steps that must be
  atomic; it calls once and reports success only when the whole thing
  confirmed. If a step fails, the message says exactly what did and did not
  happen.
- **Idempotency is enforced on both sides.** The console mints one
  `Idempotency-Key` per logical attempt and reuses it across retries
  (`useSkillMutation`). The server **stores the key with its result and replays
  the result** on a repeat, inside the same transaction as the write.
  [deviation → `vani_idempotency` store, POA §10, pending approval; today
  `POST /vara/jd/compose` uses an advisory lock with a 60 s freshness window,
  and `take_families`/`save_provider` are idempotent by construction on a
  unique key. A key nothing honours is worse than none: until the store lands,
  no write is described to a user as safe to retry, and nothing auto-retries.]
- **Idempotent by construction** is acceptable and must be stated in the
  function's SKILL.md entry: an upsert on a natural unique key that returns no
  generated id, or a DELETE.
- **Prepare → confirm** where an external system sits in the middle: staged
  rows carry their own status and are never visible as committed; the confirm
  step commits or discards. The ETL's staging → landing is this shape and is the
  reference. Show what is about to happen before it happens.
- **Append-only tables are append-only.** Audit, comms log, metering, pack
  versions, scoring configs, JD versions, match log: a new version, never an
  UPDATE. Triggers enforce it (241, 245); code that hits the guard is wrong, not
  the guard. The DPDP purge function is the single sanctioned bypass and audits
  itself.
- **The database enforces what it can.** Actor types, state edges
  (`vara_transition`), append-only, uniqueness. A rule that only lives in code
  review is a rule that will be broken.

## 6. Races and ordering

- **Queries** go through TanStack Query keyed by `['skill', skill, fn, params]`;
  superseded results are discarded. No bare `fetch` in an effect.
- **Mutations:** double-submit refused at a ref, not at state; a response
  arriving after a newer attempt or after unmount is dropped.
- **Server render** has no `Math.random()` and no `Date.now()`.
- **The event queue:** claims use a CTE with `FOR UPDATE SKIP LOCKED` — never
  `WHERE id IN (SELECT … LIMIT n)`, which Postgres plans as a semi-join and
  claims everything. A claim stamps `started_at` and `attempts`; the worker
  heartbeats `started_at` every 30 s; `reclaimStaleEvents` returns a stale
  claim to `pending` or fails it at the attempt cap. A resume after failure is
  a NEW event carrying `resume_run_id`; the agent's checkpoint decides what to
  skip.
- **Concurrency against a model server** is a lane, not a hope:
  `LLM_MAX_CONCURRENT` platform calls in flight per endpoint, held as Postgres
  advisory locks so the API and every worker share the limit (C5, 2026-09-30).
- **Agent-level claims** (one research run per domain at a time) are taken
  inside the same transaction that stamps the claim on the run.
- **One job engine, agents supply only the work** (Charan's question,
  2026-09-30: a common "jobs to be done" engine or each agent on its own?).
  Queue, claim, heartbeat, reclaim, resume, parking for a human and the model
  lane are shared; an agent decides only what a job does. No separate "jobs
  brain" and no DAG runner — pathway steps (D5) are definitions the queue
  follows.

### 6a. Queue gaps — FOR LATER REVIEW (recorded 2026-09-30, not scheduled)

What the engine does not do yet. None blocks anything built today; all four
are needed before the first send path (D9 build step 5), and they belong in
the shared engine, once — never re-solved inside an agent. Each needs columns
on `gt_events`, so each is a schema decision.

| Gap | Today | Why it matters |
|---|---|---|
| Automatic retry of a failed job | Only a worker CRASH is retried (reclaim, up to `WORKER_MAX_ATTEMPTS`). A handler that throws marks the run and event `failed`; a person retries | A provider down for a minute should not need a human |
| Back-off before a retry | None — a reclaimed job is claimable on the next poll | Retrying straight into an outage fails every attempt at once |
| Run at a time ("9am Tuesday") | Every event runs as soon as it is claimed | Follow-up timing and cadence windows need `run_at` |
| At-most-once side effects | Not guaranteed: a retry re-runs the handler from the start or its last checkpoint | A retried send must never send twice — needs a per-effect idempotency key checked before the provider call |

## 7. The Brain is one thing, read by all

- The Smart Profile — `gt_tenant_profile` (typed projection with weighted
  completion), `gt_kg_nodes`/`gt_kg_edges` (the graph), `gt_semantic_clusters`
  (vocabulary), offers, brand — is the tenant's single source of truth about
  themselves. **Agents read it; no agent owns it; no agent stores a copy of
  contacts, offers or brand.** A second copy is a bug.
- **All agents read it through `brain.context(purpose)`** (`agent-core/brain.context.ts`)
  [deviation → Track D2: storyteller, research and offer drafting read
  through it with their prompts unchanged; domain-pack and Vara (which reads
  only industry) are not yet]. Retrieval by embedding with vocabulary boost follows (D4) and needs
  one embedding provider, from `.env`.
- **Provenance per field:** agents write suggestions, humans approve, re-runs
  never touch an approved value [deviation → Track D1, schema pending].
- The graph stays in Postgres. No second knowledge store.

## 8. Migrations and schema

- **Manual, guarded, idempotent, numbered once.** `npm run db:migrate`; a
  migration is applied when `--status` says so, not when its commit is deployed.
  Never reuse a number: two files share 249 by accident and stay; the next
  number is 259.
- **No new table, column, enum or index without Charan's explicit approval**, and
  no structured data smuggled into an existing JSONB field. "What is missing
  and why the model cannot carry it" is a schema change request; the POA's §10
  is the current list.
- Tenant-facing ids come from `gt_next_seq(tenant_id, type)`; raw PKs are not
  exposed.
- Production is not the migration files (`ki_*` diverges); anything measured on
  a local rebuild is a hypothesis until checked with
  `deploy/vani-main-vps/verify-phase0-findings.sql`.

## 9. The console's side of the contract

Stated fully in `vani-app/CLAUDE.md`, which is mandatory; the architectural
points are: every screen owes five states (loading, error, empty, content,
outcome) through `<DataBoundary>` and `useToast`; writes go through
`useSkillMutation`; adding a skill is one folder plus one line in
`src/skills/index.ts` and never an edit inside `src/platform/` (the registry
boundary — a platform change is logged and decided); the access token lives in
memory only; calls go direct to the API origin with credentials; preview
functions are declared, stamped, and leave the list the day their backend
lands.

## 10. Environments, deploy, and what is where

- **API + worker:** Main VPS, `deploy/vani-main-vps/deploy-vani.sh`, from the
  VPS checkout. `docker-compose.vani.yml` defines only `vani-backend`; what
  supervises the worker is not in this repo [deviation → bring it in].
- **Console:** Vercel, root directory `vani-app`, deploys `main` [Track H
  re-points the project at this repo].
- **Database:** VPS PostgreSQL, `vani_gtm_db`, `pgvector/pgvector:pg17`, role
  `vanigtm_app`; `vikuna_admin` retained for emergency rollback only.
- **Local:** `service postgresql start`, `DB_PRIMARY=postgresql://root@localhost/
  <db>?host=/var/run/postgresql`, `npm run db:migrate` (needs
  `postgresql-16-pgvector` for 246+), `npm run db:seed`. The DB-backed tests
  read `PGHOST/PGPORT/PGUSER`; `visibility.db.test.ts` reads
  `VISIBILITY_TEST_DB` (default `vani_mig`).
- **Secrets never enter the repo.** BYOK credentials are AES-256-GCM with a
  per-tenant derived key (`secret.crypto.ts`); one master in env; no default
  key.

## 11. Tests

- **Three-check pattern** for every read: valid data · empty · wrong tenant → 0
  rows.
- **Run it, don't read it.** A test that re-implements the SQL passes for the
  wrong reason; tests drive the real router over HTTP or the real function
  against a real Postgres built from the migrations
  (`jd-compose.db.test.ts`, `visibility.db.test.ts` are the shape).
- **A control for every guard.** A test that a cap or a failover is scoped must
  also show the unscoped case working, or it passes when the feature is broken
  outright (`llm-byok.test.ts`).
- A DB test that cannot find its database is skipped by name, never silently
  green.

## 12. Naming

- Table prefixes: `vn_` auth framework · `vani_` platform spine · `gt_` product
  · `vara_` (and future `<agent>_`) agent-owned. No new `ki_`.
- Skill names are the folder name; functions are `snake_case` from the file
  name; event types are `UPPER_SNAKE`; prompt keys are `<skill>.<name>`.
- Dates in the console: `DD-MMM-YYYY` through `lib/format.ts`, never inline.
- Phone numbers: `country_code` + `mobile`, never concatenated.
