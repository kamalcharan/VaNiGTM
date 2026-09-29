# VaNi AI — Session Handover

> **2026-09-29 (late) — restart pointer.** The live handover is
> `VaNiGTM/HANDOVER.md` → "RESTART HANDOVER — 2026-09-29, evening". Edge UX is
> BUILT and merged (`vani-app/src/skills/edge/`, this repo's `main`, live on
> Vercel). This repo's `main` now carries everything that was on
> `claude/bold-carson-7stecq` — the earlier note that it was 74 commits behind
> is stale. **Next is Vara, and its open list is written** (VaNiGTM
> `HANDOVER.md` §2). It opens with a blocker that lives across both repos:
> the console's Install screen and embed widget call `/api/v1/tenant/embed`,
> `/tenant/domains/:id/origins`, `/embed/boot` and `/embed/intent`, which
> exist only on VaNiGTM `claude/session-setup-qrxev9` — never merged to its
> `main`, never deployed. Merge that first (migrations renumbered 254–258).


**From:** Claude Code website session (last updated 2026-08-11)
**To:** next Claude Code session in this repo
**State:** the assessment funnel is **built and merged** in `kamalcharan/VaNiGTM`
(public flow + console, §11); Phase 0 database hygiene is **deployed and the RLS
cutover is live** — the app runs as `vanigtm_app` and login is confirmed under it,
with three verification paths still outstanding (§12); the navigation restructure
and G3 `/today` are **merged to `VaNiGTM/main`**, partly unverified by design
(§13); a half-day `vikuna_admin` lockout on 08-11 is **resolved with nothing lost**
(§14). Gate G1 was never passed as a formal gate but was superseded in practice.
Almost nothing about VaNi AI lives in this repo any more — this document and the
governing PDFs are the exception.

**Where the work actually is:** `kamalcharan/VaNiGTM`. Everything from this
session is merged to `main` (`e494974`); no open branches. Read
`vanigtm/CLAUDE.md` and `vanigtm/docs/db/*.md` before touching the database,
`vanigtm/docs/gtm/attention-query.md` before touching anything that asks when an
account was last touched, and `vanigtm/docs/rls-cutover-checklist.md` before
anything credential-shaped.

**§15 is the pick-up list.** Start there.

**⚠️ Architecture pivoted twice on 2026-07-31 — read this before touching `docs/sql/`.**
`kamalcharan/VaNiGTM` (a separate, much larger, already-built product — multi-tenant
GTM/prospecting/agent engine, Express + Next.js, migrations 001–227) was added as a git
submodule at `vanigtm/`. It turns out to be the actual owner of `vani_gtm_db` — the
`gt_`/`vn_`/`ki_` tables, the `admin`/`vikuna_admin` BYPASSRLS runtime,
`set_tenant_context()`, all of it traces back to that repo's migrations. First pivot:
VaNiGTM eventually integrates INTO VaNi AI, paced slowly (not the reverse). Second pivot,
same day: Charan then explicitly told the session to reuse VaNiGTM's login/auth/db layer
to "bring down the time" — so building started for real. **`docs/sql/ws2.2–2.6` in this
repo are now superseded** by a working implementation in VaNiGTM — see §8 below for
exactly what exists, where, and what's still open.

---

## 1. What VaNi AI is (one paragraph)

Public assessment platform (`vani.vikuna.io`, launching at `vikuna.io/vani` first): scored
AI Recovery assessment → teaser → email capture → tokenized report → owner/partner console.
Backend: `vani_gtm_db` (Postgres 17, Main VPS 187.127.136.65) via PostgREST over HTTPS;
narrative via Qwen3 (LLM VPS, `/no_think`); email via HostingRaja SMTP; orchestration n8n
F1 for v1 (event-bus worker migration later). Frontend: **Option A (proposed, pending
approval)** — lazy-loaded routes inside THIS repo, deployed by Vercel.

## 2. Governing documents (Charan re-shares into new session as needed)

Reading order (POA §Reading Order — precedence: POA > Addendum A > App Spec > Mentor Brief body > Blueprint):
1. `VaNi_AI_App_Spec_v1.docx` — the contract (§4 partially superseded by Addendum A).
   **Received 2026-07-31**, saved at `docs/VaNi_AI_App_Spec_v1.docx`.
2. `VANI_AI_MENTOR_BRIEF.md` + Addendum A — guardrails; `vani_gtm` directive; Supabase prohibition.
   **Still not received — request it.**
3. `vani-ai-ux-blueprint.html` v2 — design system; implement, don't reinterpret; reviewer nav + sample data excluded.
   **Received 2026-07-31**, saved at `docs/vani-ai-ux-blueprint.html`.
4. `email-report.html` / `email-report.txt` — report email templates (merge fields).
   **Received 2026-07-31**, saved at `docs/email-report.html` / `docs/email-report.txt`.
5. `AI_Failed_Initiatives_Audit_PilotPack_v1.docx` §3 — survey instrument, seed VERBATIM.
   **Received 2026-07-31**, saved verbatim at `docs/vani-ai-recovery-assessment-definition.json`
   (`service_slug: ai-recovery`, 12 questions, 10 failure modes, bands 71/41 — matches §3 guardrails).
   **Canonical copy moved 2026-08-01** to `vanigtm/backend/migrations/ai-recovery-assessment-v1.json`
   (branch `claude/vani-ai-assessment-skill`) — that's the one actually seeded into a database
   (`npm run db:seed-assessment`). The copy in this repo is now a historical reference; edit the
   VaNiGTM copy if the instrument itself ever changes.
6. `VaNi_AI_POA_v1.docx` — workstreams, gates, session protocol.
   **Received 2026-07-31**, saved at `docs/VaNi_AI_POA_v1.docx`. **Superseded by POA v1.1**
   (referenced 2026-08-01 in a task description, not yet uploaded as a file — request it).
7. `VaNi_Agent_Topology_v1.1.pdf` — agent decomposition, memory tiers (T0–T4), model tiering
   (FAST/DEFAULT/ESCALATION), H1/H2 scaling triggers. **Received 2026-08-01**, saved at
   `docs/VaNi_Agent_Topology_v1.1.pdf`. Governs anything agent-shaped in VaNiGTM's
   `assessment-skill` — see §8 below for what's already built consistent with it (report
   generation as a pure function of an event payload, template-fallback-always, no PII in any
   future escalation payload).

Outstanding: item 2 (Mentor Brief + Addendum A — still not received, and it carries guardrail
precedence over the App Spec) and POA v1.1 itself (item 6, referenced but not uploaded).

## 3. Hard guardrails (never drift)

- **No Supabase for any VaNi AI data.** Don't touch the ContractNest–Supabase coupling (it is NOT in this repo anyway).
- No new auth services / ORM / serverless DB access. Frontend talks only to public PostgREST endpoints; secrets never in this repo or Vercel beyond public API base URL.
- Config-driven survey engine (all content from the assessment-definition JSONB row; second assessment = one DB row, zero code).
- Deterministic SQL scoring; bands Situational/Structural/Systemic, thresholds 71/41. LLM writes prose only, template fallback, never blocks.
- Flow order fixed: response row on first answer (anon token) → 12 Qs one-per-screen → teaser BEFORE capture → lead → report emailed.
- RLS + partner isolation from day one; partners are scoped users within tenant #1 (Vikuna Consulting), NOT separate tenants.
- Mobile-first, <1s on 4G, no heavy chart libs on public path (SVG bars). DPDP note on capture. VaNi voice: first-person analyst, one CTA per report.
- One phase per session; gates are hard; demonstrate exit criteria, then stop.

## 4. Phase A status (what this session completed)

- ✅ Mentor Brief Part 1 (website state) — reported to Charan. Highlights: Vite+React SPA
  (not Next.js), routes in `src/App.tsx`, Vercel project `vikunawebsite` deploys `main` →
  `www.vikuna.io`, no serverless, no analytics installed, `npm run lint` broken (pre-existing),
  `npm run build` clean.
- ✅ Option A proposed with rationale (in-repo lazy routes; needs route-level code-splitting
  in `App.tsx` — currently one ~970KB chunk, must not ship on the VaNi path). **Awaiting
  Charan's approval at G1.**
- ✅ WS2.1 schema inspection: **complete, 2026-07-31.** MCP channel (`gtm-postgres`) is
  still not usable from inside a Claude session — `GTM_MCP_BASIC` remains unset, so the
  server never connects — but Charan ran the inspection queries directly and pasted the
  results back. Full findings, including three concrete open items for G1 (missing
  `pgjwt` extension, RLS not enforced on `vn_*`/`gt_events`/`gt_prompts`, Supabase-style
  role names needing confirmation), tenant #1 status, and table census: see
  **`docs/WS2.1-schema-report.md`**.
- ✅ G1 auth-model reconciliation: **ruled by Charan, 2026-07-31**, directly off the
  WS2.1 findings. Five rulings: (1) dedicated `vani` Postgres schema, not a
  `gt_assessment_*` prefix in `public` — supersedes Addendum A on this point; (2) vendor
  pgjwt's functions into the migration rather than install the extension; (3) the new
  PostgREST instance connects as a fresh non-BYPASSRLS role scoped to `vani` — the
  existing app's `admin`/`vikuna_admin` connection is untouched; (4) create a fresh
  Vikuna Consulting tenant rather than reuse the zero-UUID `"vikuna"` sentinel row;
  (5) VaNi's lead tables stay self-contained, no FK to `gt_prospects` — a sync is a later,
  optional job. Supabase-naming question resolved: self-hosted `postgres:17-alpine` +
  `postgrest/postgrest:v12.2.3` per the infra doc, not an actual Supabase project.
- ✅ WS2.2–2.5 (migrations, scoring fn, login RPC, seed): **drafted, 2026-07-31, NOT
  applied.** Reviewable SQL under `docs/sql/` (`ws2.2-schema-and-roles.sql` through
  `ws2.5-seed.sql`, plus `ws2.6-isolation-test.sql` for verification) — see
  `docs/sql/README.md` for apply order, operational prerequisites (JWT secret, role
  password, the WS0.4 second-PostgREST-instance dependency), and the judgment calls made
  beyond the five rulings. Nothing has been run against `vani_gtm_db`.
- ❌ Still open, not blocking the SQL draft per Charan's ruling: WS0.1 (worker/
  `AGENT_REGISTRY` deployed against `vani_gtm_db`? gates WS4.1, not schema), the CRO
  branch sequencing call, and a one-line on-record Supabase-naming confirmation from
  Charan (see `docs/sql/README.md` "What's still open").

## 5. New session: do this first

*Rewritten 2026-08-10. The previous version told a new session to run the WS2.1
inspection and wait for G1 — both long finished. Steps 1–4 below replace it.*

1. **Read the code repo, not this one.** `vanigtm/CLAUDE.md` is the operative
   guide. Then `vanigtm/docs/db/triggers-and-functions.md`, `ki-disposition.md` and
   `rls-status.md` before any schema or database work — they exist precisely so the
   next session does not rediscover the same traps.
2. **Check what Charan has run.** Several deliverables are staged and waiting on him,
   not on a session: the Main VPS deploy (`RUNBOOK.md`, §10), the production backup
   and two queries that unblock the `ki_*` rename (§12), and the RLS cutover (§12).
   Ask before assuming any of them happened.
3. **Do not trust a local rebuild as production.** Production does not match the
   migration files — locally there are 42 `ki_*` tables, production looks like a
   dozen. Anything derived from a sandbox rebuild is a hypothesis until re-run
   against a restore. This is the single most load-bearing caveat in §12.
4. **Nothing in this session's history has touched the real VPS.** Every result
   recorded in §9–§12 came from a local sandbox Postgres.

The MCP channel (`gtm-postgres`) has never once connected from inside a Claude
session — `GTM_MCP_BASIC` is still unset. Every database result in this document was
produced either by Charan running SQL and pasting it back, or by a local rebuild from
the migration files. Do not plan around having live DB access.

## 6. Known facts for later phases (no secrets here — Charan holds credentials)

- Runtime DB access pattern (Phase B+, if server-side ever needed): Charan supplied
  `pool.ts` / `query.ts` / `skill.types.ts` from the KI-Prime backend — key gotchas:
  BEGIN/COMMIT wrapper mandatory (GUC is transaction-local), BIGINT→Number parser at pool
  level, every query `WHERE tenant_id = $tenant_id AND is_live = $is_live` (exceptions:
  `gt_events`, `gt_prompts` system rows, public share-token lookups), JSONB stringified in
  JS + cast in SQL, tenant_id/is_live from JWT never from client, named params via
  `translateParams`. Under Option A the frontend uses PostgREST, not the pool.
- `vani_gtm_db` = KI-Prime/GTM engine DB: `vn_*` auth framework, `gt_*` tenant-scoped
  product tables, `ki_*` legacy (create no new `ki_*`), 235 migrations in VaNiGTM.
  Runtime connects as `vikuna_admin`, which in production is **both `SUPERUSER` and
  `BYPASSRLS`** — so a replacement role must be `NOSUPERUSER NOBYPASSRLS`; dropping
  one attribute alone changes nothing. The least-privilege role `vanigtm_app` and its
  grant script (`scripts/grant-vanigtm-app.sql`) plus `docs/rls-cutover-checklist.md`
  ALREADY EXIST in VaNiGTM and are the cutover procedure — see §12.
- Infra (from Infrastructure Doc v3, May 2026): Main VPS 187.127.136.65 (PG17, PostgREST
  v12 at `/db/*` serving kaala_dristi, Nginx, no SSL yet on Nginx, zero swap), LLM VPS
  72.60.222.136 (Qwen3 4B llama.cpp at llm.dristiq.io, n8n at n8n.srv1096269.hstgr.cloud
  with 3 workers, Traefik auto-SSL). WS0 tasks (Charan): DNS, Let's Encrypt, vani_gtm
  PostgREST + CORS, SMTP into n8n, swap, booking link.
- Recommended before public launch: rotate the JWT secret + admin DB password (they've
  circulated in docs).

## 7. Website repo state (context for VaNi work landing here)

- This branch's CRO overhaul is merged to `main` (production deploys from `main` →
  `www.vikuna.io`). Routes: `/` (wound hero + bento offers grid + narrative sections),
  `/assessment` (client-only readiness quiz, soft-gated, posts to n8n `assessment-lead`),
  `/mvp`, `/training`, `/playbooks/why-ai-fails` (gated, posts to n8n `playbook-lead`),
  `/preview` (+`/:name` — internal, noindex).
- **Pending Charan (website, not VaNi):** create n8n workflows `assessment-lead` +
  `playbook-lead` on n8n.srv1096269.hstgr.cloud (payload shapes in the form components);
  produce the three playbook PDFs n8n delivers; confirm Automation Sprint ₹1.5L public
  price; GA/analytics not installed (needed for funnel tracking, WS3.4).
- Site conventions: styled-components + hardcoded dark-editorial tokens (ink #0A0F1E,
  accent #E8420A, gold #C9973A, teal #12A090; Fraunces/DM Sans). VaNi AI uses ITS OWN
  blueprint tokens (indigo/cyan, Outfit/Inter) scoped to VaNi routes — do not mix.
- Single Calendly everywhere: `calendly.com/connect-vikuna/30min`. Canonical domain
  `vikuna.io` (Vercel serves `www.vikuna.io` — apex/www alignment still to verify).

## 8. VaNiGTM — what it is, and what changed because of it (2026-07-31)

- Added as a git submodule at `vanigtm/` (`https://github.com/kamalcharan/VaNiGTM.git`,
  pinned `c991984`), read-only access in this session. It is "Vikuna GTM Engine" — a
  separate, unrelated-in-product-scope, much larger platform: multi-tenant onboarding,
  prospecting, campaigns, an agent worker polling `gt_events`. Zero mentions of
  "assessment," "ai-recovery," or the Pilot Pack anywhere in its docs — this is not the
  VaNi AI project, it just happens to own the database VaNi AI was about to build against.
- It is the actual source of `vani_gtm_db`'s schema: migrations 001–192 in
  `vanigtm/backend/migrations/`, a working Express JWT auth stack
  (`vanigtm/backend/src/auth/`: `auth.service.ts`, `login.service.ts`, `token.service.ts`),
  a db layer with the `set_tenant_context()` transaction-wrapper convention
  (`vanigtm/backend/src/db/pool.ts` / `query.ts`), and a skills pattern
  (`vanigtm/backend/src/skills/<name>/`, registered at
  `POST /api/v1/skills/:skill/:fn`). Its own `CLAUDE.md` documents the same facts WS2.1
  found independently (RLS dormant, `admin`/`vikuna_admin` BYPASSRLS runtime, `gt_`/`vn_`
  prefix convention, no Supabase) — confirms WS2.1's findings rather than contradicting
  them.
- **Direction (Charan, 2026-07-31): VaNiGTM eventually integrates INTO VaNi AI** — not
  the other way around. First said to pace this slowly; same day, then said to reuse
  VaNiGTM's login/auth/db layer directly ("it will bring down the time"). Building
  started on that basis.

### What's actually built (2026-07-31, branch `claude/vani-ai-assessment-skill` in VaNiGTM, pushed, not merged, no PR opened)

- **Migration `228_gt_assessment.sql`** (`vanigtm/backend/migrations/`): six tables —
  `gt_partner`, `gt_assessment_def`, `gt_lead`, `gt_assessment_response`, `gt_report`,
  `gt_lead_event` — `gt_` prefix, `tenant_id` + `is_live` on every row, RLS
  tenant-isolation policy matching migration 219's exact pattern. Creates the Vikuna
  Consulting tenant (real UUID) if it doesn't exist. **Not applied to the database** —
  written per this codebase's "migrations manual + guarded + idempotent" rule, applied
  via `cd backend && npm run db:migrate` when Charan is ready.
- **`assessment-skill`** (`vanigtm/backend/src/skills/assessment-skill/`) — two access
  models:
  - **Anonymous** (`assessment.routes.ts`, mounted at `/api/v1/assessment` in
    `server.ts`, no JWT): `GET /:slug`, `POST /answer`, `POST /complete`,
    `POST /capture`, `GET /report/:token`. Logic in `assessment.agent.ts`, same shape as
    the existing `StorytellerAgent` (static methods over `pool` + a tenantId resolved
    once from the `vikuna-consulting` slug, not from a JWT that doesn't exist for an
    anonymous respondent).
  - **Authenticated console** (normal `SkillContext` functions, via the existing
    JWT-gated `POST /api/v1/skills/assessment-skill/:fn` executor): `get_leads`,
    `get_lead`, `update_lead_status`, `add_lead_note`. Role (owner sees all leads in the
    tenant; partner sees only their own) resolved from `gt_partner` by `ctx.user_id`
    (`partner-context.ts`) — deliberately not coupled to `vn_roles`/`vn_user_roles`.
  - **`scoring.ts`** — deterministic scoring reimplemented in TypeScript (the
    `docs/sql/ws2.3` Postgres-function version is superseded), config-driven off any
    `gt_assessment_def.definition` JSON, nothing hardcoded to the ai-recovery instrument.
    Unit-tested against a hand-worked fixture: `tests/scoring.test.ts`, 5 tests, no DB
    needed.
- **Verified, not just written:** `npx tsc --noEmit` in `vanigtm/backend` is clean except
  the pre-existing documented `campaign-skill` error; `npm test` passes 273/273 runnable
  tests (261 skipped are DB-dependent, no live DB in this environment) including the 5
  new scoring tests.

### Deliberately not done as of this build (superseded by §9 for report generation)
- **Partner CRUD** (creating/deactivating `gt_partner` rows) — manage by hand via SQL
  until a console UI need justifies a function.
- **The `vikunawebsite` frontend side** — nothing here changed to call the new API.
  `docs/sql/ws2.2-2.6` in this repo are superseded and should be treated as historical
  (what G1's rulings looked like before VaNiGTM was in the picture), not reapplied.

## 9. Task A1 — local end-to-end proof (2026-08-01, per POA v1.1)

Task, verbatim scope: prove the assessment flow end-to-end against a locally-run Postgres
(sandbox cannot reach the VPS — 5432 times out, HTTP egress blocked, confirmed again this
session), build the SYNCHRONOUS report path only (template fallback narrative, no LLM, no
email — those are Phase B per the Agent Topology note), and report findings. Explicitly
told to stop before Task A2 (deployment artifacts) — not started.

**Result: all 24 checks pass.** Branch `claude/vani-ai-assessment-skill` in VaNiGTM,
pushed (commit after the one referenced in §8 above), no PR opened.

- **Local Postgres stood up in the sandbox** (not the VPS): system PostgreSQL 16, database
  `vani_gtm_local`, role `vikuna_admin`. All 228 migrations applied cleanly
  (`npm run db:migrate`) — this also validates the full pre-existing migration history
  (001–227) runs standalone, not just migration 228.
- **`ai-recovery-assessment-v1.json` moved into VaNiGTM**, `backend/migrations/`, alongside
  migration 228 (see §2 item 5's updated pointer). Seeded via a new idempotent script,
  `npm run db:seed-assessment` (`assessment-skill/seed-definition.ts`).
- **Migration 228 had a real bug, found by actually running it**: the Vikuna Consulting
  tenant `INSERT` listed `is_active` in its column list. `vn_tenants.is_active` is
  `GENERATED ALWAYS AS (status = 'active') STORED` — precisely the mistake this same
  VaNiGTM repo's own `CLAUDE.md` lesson #8 already warns about ("never INSERT into it").
  The migration failed immediately in the local run with exactly that Postgres error.
  Fixed by dropping `is_active` from the column list — `status = 'active'` alone makes it
  compute correctly. This is the clearest possible argument for why Task A1 came before
  A2: the bug would have hit the VPS on the first real apply otherwise.
- **Synchronous report-on-capture, built and verified**: `captureLead` now writes a
  `gt_report` row inside the same transaction as the lead, filling the assessment
  definition's `narrative_prompt.fallback` template from the recomputed score (health,
  band label/verdict, top three mode names/percentages) — no LLM call anywhere in this
  path. `GET /report/:token` is live. New file: `assessment-skill/narrative.ts`.
- **End-to-end proof script**: `backend/src/verify-assessment-flow.ts`
  (`npm run verify:assessment`) exercises `GET /:slug` → `POST /answer` ×12 → `/complete`
  → `/capture` → `GET /report/:token` directly against `AssessmentAgent` (same code path
  the HTTP routes call). What it actually proves, precisely: `scoring.test.ts` (unit, no
  DB) already proves the scoring *arithmetic*; this script proves the *DB round-trip*
  doesn't corrupt that arithmetic — the persisted health score/band, after going through
  JSONB storage, transaction handling and answer merging, is compared against
  `scoreResponse()` called directly on the same definition + answers fetched fresh from
  the DB. They matched. Also checked: re-completing or re-capturing an already-finished
  response is rejected (idempotency), a garbage report token returns `null` rather than
  leaking another response's report, and the rendered fallback narrative has no leftover
  `{{merge_field}}` placeholders.
- **Verified, not just written**: `tsc --noEmit` clean (only the pre-existing documented
  `campaign-skill` error); full test suite still 273/273 runnable tests passing; migration
  re-run confirms idempotency (`All migrations are up to date`).

## 10. Task A2 — deployment artifacts (2026-08-01)

Item 0 (small fix, done first): `scoring.ts`'s tie-break was already reproducible but
relied on `definition.modes`' incidental array order — now an explicit rule (exposure
desc, `composite_weight` desc, mode key asc). Migration 229 adds `gt_report.top_modes`,
frozen at capture time, so report rendering and any future email dispatch read the same
persisted value instead of each recomputing. Re-ran `verify:assessment`: 26/26 checks
pass (up from 24 — added assertions for the freeze).

Then `deploy/vani-main-vps/` in VaNiGTM: Dockerfile (tuned to the Topology note's ~400MB
budget, not touching the shared ProKey Dockerfile), a compose overlay service
(`vani-backend`, meant to layer onto the existing Main VPS compose file, never edited
directly since it was never shared with this session), an Nginx config that
**allowlists only** `/api/v1/assessment/`, `/api/v1/skills/assessment-skill/`, and
`/api/v1/auth/` — everything else on `api.vikuna.io`, including this same backend's
other skills, 404s at Nginx — with dynamic CORS for `vikuna.io`/`www.vikuna.io` plus the
Vercel preview pattern, `.env.example`, a `RUNBOOK.md` (swap-first per the Topology
note's hard rule, pg_dump backup, build/start/migrate/seed/deploy-nginx/verify, plus
rollback), and a laptop-runnable `smoke-test.sh` (full flow + CORS preflight incl. a
negative check + an allowlist-hole check).

**A real, deployment-blocking bug was found and fixed along the way**: `npm run build`
(plain `tsc`, not `--noEmit`) exits non-zero on the pre-existing `campaign-skill`
type error this repo's own `CLAUDE.md` already documented as known — which would have
made `docker build` fail outright before ever reaching VaNi AI's code. Fixed with a
scoped change to that one query (`RETURNING id` + `rows.length` instead of a `rowCount`
`SkillDb.query()` never actually provides) — didn't touch the shared `SkillDb` type.
`tsc --noEmit` is now fully clean, not just "clean except the known error."

Not executable in this sandbox: `docker build`, `nginx -t` (no Docker daemon, no
installable nginx package here). Compensated: ran the Dockerfile's actual build recipe
directly (`npm run build`, now exits 0; the SKILL.md/*.sql copy step simulated by hand
and confirmed correct), parsed the compose YAML, manually reviewed the Nginx config.
`RUNBOOK.md` gates on `nginx -t` before reload as the real check for what couldn't be
run here.

Full list of what was guessed (network name, build-vs-registry-pull, Nginx drop-in path,
Vercel project slug, cert tooling) is in `RUNBOOK.md`'s own "What I had to guess"
section — read that before running any step.

### Next session
- **Charan runs `RUNBOOK.md` on the Main VPS** — this session stops here per instruction.
  Paste output back for debugging on anything that doesn't match what's expected.
- After a successful deploy: LLM narrative generation and email dispatch (Phase B) are
  the next real feature work; the fallback path built in A1 stays as the permanent
  fallback, not a placeholder.
- The branch (`claude/vani-ai-assessment-skill`) is pushed but no PR was opened (not
  asked for) — diff it against VaNiGTM's `main` to review everything at once.
- **Nothing has touched the real VPS** — all of Task A1 and A2 ran/was validated against
  the local sandbox Postgres only.

---

## 11. Phases C1–C3 — the funnel got built (2026-08-02 → 08-09)

Recorded late: these ran after §10 and were never written up here. All of it is in
VaNiGTM, merged to `main` at **`a229ea4`**.

**C1 — frontend reconnaissance.** Report only, no code, per instruction. Established
that VaNiGTM's frontend is Next.js 16.2.1 App Router + React 19, with a `VdfSidebar`
shell driven by `src/config/nav.tsx`.

**C2 — the public flow.** Four decisions were given up front and shaped everything:
no middleware or host routing; **same-origin** (so no custom Dockerfile, no
`NEXT_PUBLIC_API_URL`, no CORS work); a `(vani)` route group with its own layout and
zero VDF chrome; blueprint design tokens copied verbatim. Built `/a/[slug]` (the
assessment) and `/r/[token]` (the report), scoped to `.vaniRoot`.

**C3 — the console.** Login, leads list, lead detail, partners, plus an API-level
partner-isolation test. Deliberately broken once to confirm the test actually catches
a leak.

### What went wrong, and what it cost

Worth reading — most of these were caught by Charan using the thing, not by a test:

- **The console had no way in.** It was built with no nav entry, so it could only be
  reached by typing the URL. *"you created something and it has no access to menu and
  i was going round as a headless checking."* Fixed by adding `VaNi Leads` to
  `nav.tsx`.
- **A silent partial failure.** Lead capture reported success while the contact bridge
  had failed. *"if details are not saved -- why did the UX layer did not raise hands,
  it shown sucess."* Root cause: the bridge ran inside the capture transaction, and in
  Postgres one failed statement poisons the whole transaction — so the catch-and-log
  INSERT failed too and took the lead down with it. The bridge now runs in its own
  transaction *after* capture commits.
- **The access model was backwards.** The console gated on the presence of a
  `gt_partner` row, so the owner — who has no such row — was refused from their own
  leads. *"when i am using my own space, my own leads.....what is this console
  restriction about?"* Inverted: no row = owner, `role='partner'` = a restriction.
- **The console opened outside the product shell.** *"this page opens in its own
  design, it does not confirm inside canvas of VaNiGTMl."* Moved from the `(vani)`
  route group to `(app)`.
- **The teaser gate was cosmetic.** `/complete` returned all three top modes while the
  UI only displayed one — anyone reading the network tab got the gated content free.
  Now returns only #1.
- **`gt_tags.slug` is a generated column** that maps non-alphanumerics to **spaces**,
  not hyphens, so the tag was `'vani assessment'`, not `'vani-assessment'`. Cost real
  time before it was spotted.
- **A Jest test that could never run.** `maybe()` was evaluated at collection time, so
  the suite always skipped while reporting green. Fixed with a synchronous
  availability check.
- Plus: a dev proxy pointed at port 3001 when the backend runs on **3002**, and an
  `is_live` filter that locked sandbox-mode users out with a permissions-shaped error.

**Migration-readiness audit** (read-only, no code) followed: a structured assessment of
moving to a unified namespace, an append-only fact store, and registered tools. It is
what led to the Phase 0 work order.

---

## 12. Phase 0 — clear the ground (2026-08-10)

Three items from the mentor: inventory the hidden database logic, settle the `ki_*`
tables, make RLS real. Branch **`claude/vani-phase-0-db-hygiene`** in VaNiGTM, four
commits, pushed, no PR opened. Standing constraint throughout: the assessment funnel is
live and taking LinkedIn traffic, and nothing may break `api.vikuna.io`.

Deliverables: `vanigtm/docs/db/triggers-and-functions.md`, `ki-disposition.md`,
`rls-status.md`; migrations 233–235; `deploy/vani-main-vps/rls-two-tenant-test.sql`.

### Item 1 — inventory (complete)

Far less hidden logic than the brief assumed. **28 of the 29 triggers do nothing but
stamp `updated_at`**, using five redundant copies of the same three lines. Only one
trigger has behaviour: `ki_set_session_limit` silently floors
`vn_subscriptions.max_sessions` at 5 on INSERT but not on UPDATE — and contradicts
`vn_get_max_sessions`, which documents a default of 1.

**46 of the 75 "stored functions" belong to `pgcrypto` and `uuid-ossp`.** Only 29 are
ours, and only four run at runtime: `set_tenant_context`, `gt_next_seq`,
`vani_ensure_seq_prefixes`, `vani_ensure_tag`.

Migration 180 dropped ten MFD-era tables with `CASCADE`, which does not parse plpgsql
bodies — so six functions survived pointing at relations that no longer exist, and
`ki_alias_before_upsert` is a trigger function with no trigger. Listed as candidates;
**nothing was deleted.**

Two bugs found and reproduced: `ki_contacts.normalized_name` and
`ki_normalize_contact_name()` apply `[^A-Z0-9\s]` *before* `upper()`, so lowercase input
is deleted rather than uppercased — `'Kamal Charan'` normalises to `'K C'`. The `gt_`
equivalent is correct, so **VaNi is unaffected**. Separately,
`vn_cleanup_expired_sessions` has no caller and no scheduler entry, so
`vn_refresh_tokens` likely grows without bound — the one finding with a live
operational cost.

### Item 2 — `ki_*` disposition — **RESOLVED, nothing to rename**

Production's table list arrived on 2026-08-10 and closed this item outright:
**nine `ki_*` tables, all nine live** (the ETL import pipeline and the pulse
cluster). No orphans, no KI-Prime data to export, no two-week rename clock.
Migration 233 stays a tested no-op.

The 29 "candidates" and the 4 "FK-pinned" tables in the analysis below **do not
exist in production at all** — they are artifacts of rebuilding from migration
files production was never fully built from (local: 42 `ki_*`, 114 tables;
production: 9 and 81; `gt_*` 58 and `vn_*` 14 match exactly). Two specific
claims died with them: the inference that production "must hold at least twelve"
`ki_*` tables because the pulse tables carry FKs onto `ki_clients`/`ki_contacts`
(production's pulse tables simply do not carry those constraints), and
`ki_ext_ref_types` pinning `vn_tenants` — that table does not exist there, so
the Phase 1 clean cut is available after all.

The original analysis, for the record:

9 live (the ETL import pipeline and the pulse cluster), 4 pinned by a foreign key from
a live table, 29 candidates, **zero confirmed orphans** — confirming one needs row
counts from production.

Two corrections to the brief's premise:

- **Production does not match the migration files.** 42 `ki_*` tables locally; the
  production snapshot listed nine. That snapshot is itself provably incomplete (its own
  `COUNT` said 81 while 76 names survive the paste, and the live pulse tables carry FKs
  onto `ki_clients`/`ki_contacts`/`ki_contact_snapshots`, which cannot reference absent
  tables). So the rename list must come from a fresh production listing.
- **The brief's fourth signal does not discriminate.** "Touched by a trigger or
  function" would have marked thirteen dead tables as live, because the triggers are
  `updated_at` stamps and every function touching a `ki_*` table has zero call sites.
  This is where Item 1 paid for itself.

Also found: `vn_tenants.ext_ref_type_code → ki_ext_ref_types(code)` is the **only**
foreign key from the `gt_*`/`vn_*` side into `ki_*` anywhere in the schema — the one
thing stopping "move all `ki_*` out" from being a clean cut. A Phase 1 item.

Migration 233 renames orphans to `_deprecated_ki_*`, drops nothing, and **ships with an
empty candidate list so it is a safe no-op** until real numbers arrive. Testing it
against a scratch copy surfaced an order-dependence bug (a table renamed earlier in the
loop looked like a live blocker to candidates processed later); rollback verified,
7 renamed and 7 restored.

### Item 3 — make RLS real (deployed 2026-08-10; post-switch verification outstanding)

**A correction I got wrong, then corrected back.** Mid-phase this section claimed
`vikuna_admin` does not hold `BYPASSRLS` and bypasses RLS purely by being a
`SUPERUSER`. That was read off the local rebuild. Production says
`super=true bypassrls=true` — the original brief was right. The practical point
survives: a replacement role needs `NOSUPERUSER` **and** `NOBYPASSRLS`.

**Production also disproved the migration-234 bug.** Its policies already use the
`NULLIF` form (unguarded=0, guarded=54 of 55) and no policy there reads the legacy
`app.tenant_id` GUC. So 234 is a no-op against the live database — real in the
migration files, and therefore worth keeping for any fresh build, but not a
production hazard. **Migration 235 is the one production actually needs**: it holds
1 platform tag of 4, and all 8 `gt_content_kinds` rows are platform rows, so that
whole table goes dark for every tenant the moment RLS enforces without it.

**And the role and grant script already existed.** `vanigtm_app` (non-superuser,
non-bypassrls) is live in production alongside six siblings, and VaNiGTM already
carries `scripts/grant-vanigtm-app.sql` + `docs/rls-cutover-checklist.md` — both of
which correctly described `vikuna_admin` as `rolsuper=true, rolbypassrls=true`.
Phase 0's runbook now defers to those rather than duplicating them. The checklist
had also already flagged the storyteller `gt_presentations` share route as breaking
under RLS — the same bug class as VaNi's `/r/:token`, which Phase 0 found
independently and fixed. **The storyteller one is still open.**

Switching to a genuinely restricted role broke the assessment flow on the **second
query**. 68 policies cast `current_setting(...)::uuid` unguarded, and because
`set_config(..., is_local := true)` leaves the GUC **defined and empty** after COMMIT
rather than undefined, the first tenant-scoped transaction poisons a pooled connection
with `invalid input syntax for type uuid: ""`. This is CLAUDE.md's lesson 1 — but only
half of it had been diagnosed, because RLS was dormant and the policy side never
showed. **Migration 234** rewrites all 76 policies onto
`NULLIF(current_setting(...), '')::uuid`.

**Migration 235** fixes a second, quieter failure: `gt_tags` and `gt_content_kinds` use
`tenant_id IS NULL` for platform rows, and `tenant_id = <uuid>` never matches NULL — so
platform tags vanished and `gt_content_kinds` (all 8 rows platform) became invisible
entirely. That one would not have raised an error; rows would simply have stopped
appearing.

What enforcement buys, measured on the same database with the same statements — as
`vikuna_admin`, a cross-tenant INSERT **succeeds** and a contextless read returns 14
leads across 2 tenants; as the restricted role, both are refused.

Then the code work: the ETL pipeline and the public `/r/:token` report route were
converted. `getReportByToken` ran on the raw pool by design ("a public route has no
tenant to scope to" — true of authorisation, false of RLS), joining four
policy-protected tables, so **every report link would have rendered "This report link
isn't valid."** Capture succeeded and only the read failed, so a smoke test stopping at
"lead created" would have passed the cutover as clean. Also removed
`getClientWithTenant`, which set the GUC outside a transaction and so returned a client
whose context had already expired — no callers, but a trap.

The full assessment flow now passes end to end under `vani_app`
(`NOSUPERUSER NOBYPASSRLS`), **and** under the current superuser — so all of it deploys
safely *before* the cutover. Two-tenant isolation test: 11/11, verified to fail when RLS
is disabled. Full backend suite unchanged at 510 passed / 19 failed / 11 skipped, every
failure the pre-existing `story-skill` schema drift.

### What Phase 0 is waiting on

*Item 2's two blocking queries were run on 2026-08-10 and resolved it. Migrations
235, 236 and 237 were deployed the same day and `post-deploy-check.sql` returned
7/7 OK; `DB_PRIMARY` has since been repointed at `vanigtm_app`. The list below is
what survives that.*

**Charan, on the VPS — the one thing still standing between this and done:**

1. **Post-switch verification.** Re-run `rls-two-tenant-test.sql` against
   production under the restricted role, then exercise **signup, login, the
   assessment flow and the skills executor**. Those auth paths have never run
   under `vanigtm_app`; every other path was exercised or converted deliberately.
   Rollback is repointing `DB_PRIMARY` at `vikuna_admin` — no migration reverses.

Two findings from the deployment are worth carrying forward, both in
`docs/db/PHASE-0-REPORT.md`: **eighteen tables had correct policies that were
completely inert** because a table's owner is exempt from its own RLS without
`FORCE ROW LEVEL SECURITY` (migration 236 closes seventeen; `gt_agent_runs` is a
registered exemption), and the isolation test **wrote to production twice** before
it was made to roll back — consuming a sequence number and self-seeding
`gt_seq_counters` with the wrong prefix, repaired by `realign-vani-sequences.sql`.

**Still open as tasks:**
- The storyteller `gt_presentations` `/share/:token` route breaks under a restricted
  role. The checklist recommends a `SECURITY DEFINER get_shared_deck(token)`; VaNi's
  fix does not transfer, because any tenant can own a deck.

**Still open as decisions, not tasks:**
- Admin platform-tag creation (`POST /etl/tags` with `is_platform: true`) is refused by
  235's write policy. Left refused deliberately rather than letting every tenant mint
  rows all tenants can see; it needs a maintenance role, a `SECURITY DEFINER` function,
  or an `app.is_admin` GUC.
- Signup, login and the skills executor have **not** been exercised under the restricted
  role. That is the post-switch verification above.

### Still open from earlier phases

Unchanged by Phase 0: the Main VPS deploy (§10) has not run; LLM narrative generation
and email dispatch (Phase B) are the next real feature work, with A1's fallback staying
as the permanent fallback; `{{BOOKING_URL}}` is unresolved; the `assessment-lead` and
`playbook-lead` n8n workflows still need to exist for delivery to happen.

---

## 13. After Phase 0 — the GTM app work orders (2026-08-10 → 08-11)

Two work orders followed Phase 0. **Both are now merged to `VaNiGTM/main`**
(`08d09e3`, 2026-08-11) along with two documentation branches from the incident
in §14. Neither touches `(public)` or `(vani)`, so the assessment funnel was
never affected.

### Navigation restructure — pathways (was `claude/nav-pathways`)

Eleven flat nav destinations became five groups expressing pathways versus
reference surfaces. Routes consolidated with permanent (308) redirects covering
both the bare paths and their dynamic children — an exact redirect on
`/prospects` does not catch `/prospects/acme-ltd`, and `:path*` also matches zero
segments, so the wildcards must come after the exact rules. `PathwayShell` was
extracted from the Mission Wizard and G1 wrapped in it.

Two things worth knowing before touching it:

- **The brief's redirect table lists nav labels, not routes.** `/mission-wizard`,
  `/teach-vani`, `/vani-leads` and `/follow-ups` do not exist in the app; the real
  paths are `/onboarding`, `/knowledge`, `/console` and `/pulses`. Following the
  table literally would have redirected URLs nobody holds while leaving the four
  people actually have bookmarked to 404. Both sets are in
  `frontend/src/config/route-map.js`, which records why.
- **Research, Prospects and VaNi Leads lost their nav entries** in the five-group
  structure and were restored as `kind: 'reference'`. Nothing was deleted — the
  files moved 1:1 and the backend `research-skill` was untouched — but the brief's
  G1 mapping flattens what those pages are: Research is three workflows, Prospects
  is a records browser rather than a "qualify" action, and VaNi Leads is the
  assessment funnel console.

### G3 · `/today` — quiet accounts (was `claude/today-attention`)

The gap query, the decision log behind it, and the screen. Was stacked on the nav
branch because `/today` only existed there; both went in together.

**The source-of-truth question was answered differently than the brief expected.**
It named `gt_touch_reservations`, `gt_activity_feed` and `gt_journey_events` and
warned that a wrong answer makes every item wrong. None of the three is right —
the authoritative record of an outbound touch is **`gt_touch_log`**, which the
brief did not list. Reservations are *prospective* (a claim on a future slot, keyed
on the contact, blind to manual sends) and are read only to suppress accounts
already queued. `gt_journey_events` records state transitions, only some of which
are touches. Argued in full in `vanigtm/docs/gtm/attention-query.md`.

**`gt_activity_feed`'s only writer in the entire codebase is the demo seeder.**
Which means the War Room's "live activity feed" and the analytics `meeting_booked`
counter have been reading demo data since migration 162. Out of G3's scope, not
fixed, recorded so it stops being a surprise.

**`wake_at` had never been read.** Migration 222 said a wake date would be seen
only because "the parked list is scanned for it"; nothing scanned it. Every
"remind me in three weeks" set since then has been sitting in the database, due,
invisible. `/today` is that scan.

Migration **238 · `gt_attention_decision`** is append-only with no status column —
current state is the tail of the log, folded in SQL. RLS enabled **and forced** at
creation, which is Phase 0's eighteen-table lesson applied rather than
re-learned. Append-only is enforced by a trigger, not by `DO INSTEAD NOTHING`
rules: the rules were written first and testing killed them, because a DELETE rule
also swallows the delete PostgreSQL's referential-integrity machinery issues, so
one dismissed account would have made that prospect — and through the tenant
cascade, that tenant — permanently undeletable.

Fifteen db tests. Two bugs they caught that reading did not: the cascade breakage
above, and a `LEFT JOIN` producing `NULL` rather than `false` for
`is_dismissed`, so `WHERE NOT is_dismissed` silently dropped every account nobody
had decided about — a new tenant's screen was empty *because* nothing had been
decided yet.

**Merged partly unverified, deliberately.** What is covered: 15 db tests over
every reason, both directions of every suppression, the decision fold, tenant
and environment isolation; backend `tsc` and the frontend build clean on the
merge commit. What is **not**:

- **The list and the three actions have never rendered against real data.** Only
  the `all_current` empty state has been seen. To exercise the rest, set
  `quiet_after_days: 1` in `backend/src/config/attention.config.ts`, restart,
  work through Take it on / Later / Dismiss / Reopen, then set it back to 14.
- **`deploy/vani-main-vps/attention-source-disagreement.sql` has not been run.**
  It is read-only and checks the `gt_touch_log` conclusion against production —
  the schema and call-site evidence is checkable in the repo, the row counts are
  not, and Phase 0's standing lesson is that a local rebuild is not production.
  If grid 1 shows any `is_live` rows in `gt_activity_feed`, something outside
  the repo writes to it and §3 of `attention-query.md` is wrong.
- **Three of the five reasons have only ever fired in fixtures** — `wake_due`,
  `owed_reply`, `story_unsent`.

**Migration 238 must be applied as `vikuna_admin`, not `vanigtm_app`.**
`backend/src/migrate.ts` reads `DB_PRIMARY`, which now points at the app role.
On PG15+ it fails outright (no `CREATE` on schema `public`); on PG14 or earlier
`PUBLIC` still holds `CREATE`, so it would succeed and leave the table owned by
the app role — the exact shape of the bug Phase 0 spent a day on. Verify after:

```sql
SELECT relname, pg_get_userbyid(relowner) AS owner,
       relrowsecurity, relforcerowsecurity
  FROM pg_class WHERE relname = 'gt_attention_decision';
-- want: vikuna_admin / t / t
```

**One open design question I raised and Charan has not ruled on.** `never_touched`
fires at the same 14-day threshold as `gone_quiet`, which is wrong: an account
you have just decided is worth pursuing should not go unmentioned for a
fortnight. Live data surfaced it — all four in-play accounts are qualified and
never contacted, and `/today` says "Everything is current". The fix is a
per-reason threshold map instead of one scalar, which also *simplifies* the SQL
(the `reason IN ('wake_due','owed_reply')` special case collapses into a
threshold of 0). Small: the config type, one predicate in `_candidates.sql`, and
the empty-state copy. It changes how aggressive the queue is, so it is a product
call, not a code call.

---

## 14. The `vikuna_admin` lockout (2026-08-11) — resolved, nothing was lost

Half a day went to this. It is recorded because almost every wrong turn in it
was reasonable, and the host's shape is not discoverable under pressure.

### What happened

After the RLS cutover, `vikuna_admin` stopped authenticating **across all six
databases**. It looked like the role had been damaged or deleted.

**It had not.** The role was intact the entire time:

```
vikuna_admin | rolsuper=t | rolbypassrls=t | rolcanlogin=t | rolvaliduntil=null
             | SCRAM-SHA-256$ hash | owner of 142 objects in vani_gtm_db
```

Only the **password value** had drifted out of sync with what the clients were
sending. Roles are cluster-wide (`pg_authid` is shared), which is exactly why it
presented as all six databases failing at once — one credential, every database.
One `ALTER ROLE ... PASSWORD` restored all six simultaneously.

### The proof that costs ten seconds

**PostgreSQL refuses to drop a role that owns objects.** So:

```sql
SELECT pg_get_userbyid(c.relowner) AS owner, count(*)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('r','S','v','m','p')
 GROUP BY 1 ORDER BY 2 DESC;
```

If this still names `vikuna_admin`, the role exists. A dropped role would leave
`unknown (OID=…)`. Runs from any connection, including a non-superuser one.

### How to get in — the part that is not obvious

**There is no OS user `postgres` and no Postgres role `postgres` on this host.**
`sudo -u postgres psql` fails with `unknown user`; `psql -U postgres` fails with
`role "postgres" does not exist`. Postgres runs in a container and the cluster
was initialised with `POSTGRES_USER=vikuna_admin`, so **`vikuna_admin` is the
bootstrap superuser**:

```bash
docker exec -it vikuna-postgres psql -U vikuna_admin -d vani_gtm_db
```

`pg_hba` line 117 is `local all all trust`, so the container's socket needs no
password. That is the unconditional way back in, whatever any password is.

Then, as superuser at *that* prompt (not in a GUI client):

```sql
SELECT current_user;                      -- confirm before continuing
SET password_encryption = 'scram-sha-256';
ALTER ROLE vikuna_admin PASSWORD '<strong password>';
```

### Wrong turns worth not repeating

- **A `permission denied for table pg_authid` was read as "the role lost
  SUPERUSER".** It was actually a query run in Beekeeper as `vanigtm_app`. Always
  `SELECT current_user, current_database();` first — an assertion about a role,
  made from the wrong session, sent the diagnosis sideways for two exchanges.
  `pg_roles` is readable by everyone and answers the same question; `pg_authid`
  needs superuser and only adds the hash.
- **The placeholder got pasted literally.** `ALTER ROLE vikuna_admin PASSWORD
  'your-new-password'` ran verbatim, briefly giving a SUPERUSER + BYPASSRLS role
  a trivial password on a server whose `pg_hba` line 128 is `host all all all`.
  Corrected immediately. Generate with `openssl rand -base64 48 | tr -dc
  'A-Za-z0-9' | head -c 32` — alphanumeric only, so no percent-encoding is
  needed in `DB_PRIMARY`, which is parsed as a URI.
- **`28P01` vs `28000`.** `28P01` means a `pg_hba` rule matched and the password
  failed. `28000` means no rule matched. Reading the code first saves an hour.

### Still open from this incident

- **What changed the password is unknown.** The role list (`anon`,
  `authenticated`, `service_role`, `admin`, `user`) plus a `vikuna-postgrest`
  container means this is a Supabase/PostgREST-shaped stack, and some such
  stacks re-apply role passwords from environment variables on every container
  start. If a VPS-side `.env` still holds the old value, the next restart undoes
  the fix. Check `docker inspect vikuna-postgres` env and the compose `.env`.
  Note `POSTGRES_PASSWORD` alone cannot do this — it only applies at initdb.
- **`backend/.env`'s `vikuna_admin` string** must carry the new password or the
  next `npm run db:migrate` fails with the same `28P01` and reads as a new
  incident.
- **`pg_hba` line 128 is `host all all all scram-sha-256`** — a superuser
  reachable from anywhere. Today only made it visible. Restricting it, or moving
  Postgres behind the Docker network, is its own piece of careful work: getting
  `pg_hba` wrong locks everything out at once.
- **The eighteen-table ownership question.** A query showed only `vikuna_admin`
  owning objects where Phase 0 found eighteen owned by `vanigtm_app` — but it
  was run as `vanigtm_app`, so it may be visibility rather than a real change.
  Re-run as `vikuna_admin`. If they genuinely moved, their grants went with them
  (an owner change drops grants — migration 236 chose `FORCE ROW LEVEL SECURITY`
  precisely to avoid that) and `scripts/grant-vanigtm-app.sql` needs a re-run.

`deploy/vani-main-vps/restore-vikuna-admin.sql` carries all of this as a runnable
runbook, diagnosis first. Its Part 3 warns against the obvious wrong move: a
blanket `REASSIGN OWNED BY vanigtm_app TO vikuna_admin` would undo Phase 0's
deliberate design and drop grants the app depends on.

---

## 15. Where to pick up

**Nothing is blocked.** In rough priority:

1. **Finish the Phase 0 post-switch verification.** Login is confirmed under
   `vanigtm_app`. Still never run as that role: `rls-two-tenant-test.sql`,
   **signup**, the **assessment flow**, and the **skills executor**. Do the
   isolation test first — it is read-mostly and tells you whether enforcement is
   real before you exercise anything that writes. Note it now needs a superuser
   to `SET ROLE`, which `vikuna_admin` still is.
2. **Apply migration 238 as `vikuna_admin`** and verify ownership (§13).
3. **Verify G3** — the `quiet_after_days: 1` pass, and
   `attention-source-disagreement.sql` (read-only, safe any time).
4. **Rule on the `never_touched` threshold** (§13).
5. **Close the incident's loose ends** (§14): the VPS `.env`, `backend/.env`,
   the ownership re-check.

Out of scope but recorded: the War Room activity feed and the analytics
`meeting_booked` counter read demo data (§13); `story-skill`'s db tests fail on a
pre-existing schema drift — `story.db.test.ts` hand-lists migrations and stops at
225 while `create-story.ts` writes `channel_type_id`, added by 226.

---

## Main VPS — the actual deploy paths (verified 2026-08-17)

Discovered from `docker inspect vani-backend` after two rounds of wrong
guesses. The repo's own runbook and compose file **do not match production**,
so read this first.

| Thing | Value |
|---|---|
| Source checkout | `/opt/vikuna/src/vanigtm` (on `main`) |
| Compose file — the whole config | `/opt/vikuna/docker/vani/docker-compose.vani.yml` |
| Compose working dir | `/opt/vikuna/docker/vani` |
| **Image name in production** | **`vikuna/vani-backend:latest`** |
| Port inside the container | **3001**, with no host `ports:` mapping |

Three traps, each of which has already cost a round:

- **The image name differs from the repo.**
  `deploy/vani-main-vps/docker-compose.vani.yml` declares
  `image: vani-backend:${IMAGE_TAG:-latest}`; production uses the `vikuna/`
  prefix. Building `-t vani-backend:latest` produces an image nothing deploys,
  and the build succeeds, so nothing warns you.
- **Nothing listens on a host port.** `PORT=3001` inside the container, on the
  `vikuna_shared` network, reached by nginx via the container name. `curl
  localhost:3002` on the VPS returning `000` is correct, not a fault. Probe with
  `docker exec vani-backend wget -qO- http://localhost:3001/health`.
- **The root `Dockerfile` is a signpost, not a build file** — comments only.
  The real one is `deploy/vani-main-vps/Dockerfile`, and it takes `backend/` as
  its context.

Rebuild and recreate:
```
cd /opt/vikuna/src/vanigtm
docker build -f deploy/vani-main-vps/Dockerfile -t vikuna/vani-backend:latest backend/
cd /opt/vikuna/docker/vani
docker compose -f docker-compose.vani.yml up -d --force-recreate vani-backend
```
Tag a rollback first (`docker tag vikuna/vani-backend:latest
vikuna/vani-backend:rollback-$(date +%Y%m%d)`); restoring is the same tag in
reverse plus one `--force-recreate`.

### Do not use a 401 to tell the versions apart

`GET /api/v1/onboarding/status` returns 401 unauthenticated on **both** the old
and new builds — `e494974` mounted `/api/v1/onboarding` too, from a router
inside `auth/auth.routes.ts`. The lane work only *moved* it to
`backend/src/onboarding/`. So the version check is the module's presence, not an
HTTP status:

```
docker exec vani-backend ls dist/onboarding/
```
`lanes.js  onboarding.routes.js` = the lane-aware build. Absent = pre-lane.
