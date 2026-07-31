# VaNi AI — Session Handover

**From:** Claude Code website session (session ending 2026-07-31)
**To:** next Claude Code session in this repo
**State:** Phase A in progress · Gate G1 NOT yet passed · no application code written for VaNi AI

**⚠️ Architecture direction changed 2026-07-31, after G1 rulings were already drafted
into SQL — read this before touching `docs/sql/`.** `kamalcharan/VaNiGTM` (a separate,
much larger, already-built product — multi-tenant GTM/prospecting/agent engine, Express +
Next.js, migrations 001–192) was added as a git submodule at `vanigtm/`. It turns out to
be the actual owner of `vani_gtm_db` — the `gt_`/`vn_`/`ki_` tables, the `admin`/
`vikuna_admin` BYPASSRLS runtime, `set_tenant_context()`, all of it traces back to that
repo's migrations, not to anything VaNi-AI-specific. **Correction: the relationship is
VaNiGTM eventually integrates INTO VaNi AI, not VaNi AI becoming a skill inside VaNiGTM**
(Charan, 2026-07-31) — I had it backwards in my first read of this. Charan wants this
paced **deliberately slowly**, not rushed into a rebuild.

**Current status: paused here, on purpose.** No code has been written or pushed to
VaNiGTM. Session only has *read* access to it (added via `add_repo`, not push) — no
branch chosen, nothing built. The `docs/sql/ws2.2–2.6` drafts from the G1 rulings
earlier in this session are **not retired, but also not the final architecture** — they
assumed a standalone `vani` schema + PostgREST instance, built with no knowledge that
VaNiGTM's Express backend, JWT auth, and db layer already exist against the same
database. Do not resume building against either design until Charan gives the next
concrete instruction on pacing/scope. See §9 below for what's actually decided vs. open.

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
   Not yet seeded into any DB row — WS2.5 is still gated on G1.
6. `VaNi_AI_POA_v1.docx` — workstreams, gates, session protocol.
   **Received 2026-07-31**, saved at `docs/VaNi_AI_POA_v1.docx`.

Only item 2 (Mentor Brief + Addendum A) remains outstanding — it carries guardrail precedence
over the App Spec, so read it before treating anything above as final on auth model or scope.

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

1. Confirm MCP works: `SELECT current_database();` — MUST return `vani_gtm_db` (the host was
   shared during setup; verify it's not another product's DB). Then `SELECT count(*) FROM gt_contacts;`.
2. Run full WS2.1 inspection → short written report (G1 input):
   table census (`gt_*` / `vn_*` / `ki_*`), columns of `vn_tenants`, `vn_users`, `gt_events`,
   `gt_prompts`, `gt_prospects` + master data tables, `set_tenant_context()` definition,
   `pg_policies`, roles (+ BYPASSRLS), extensions (pgjwt? pgcrypto?), `vn_tenants` rows
   (does Vikuna Consulting exist → tenant #1 plan).
3. Resolve at G1 with Charan: auth model reconciliation — spec's PostgREST+pgjwt
   (`vn_login`, web_anon/partner/owner DB roles) vs GTM engine's JWT + `set_tenant_context()`
   GUC RLS. Inspect live policies before proposing.
4. Only after G1 approval: write WS2.2–2.5 as reviewable SQL files. Apply nothing until told.

## 6. Known facts for later phases (no secrets here — Charan holds credentials)

- Runtime DB access pattern (Phase B+, if server-side ever needed): Charan supplied
  `pool.ts` / `query.ts` / `skill.types.ts` from the KI-Prime backend — key gotchas:
  BEGIN/COMMIT wrapper mandatory (GUC is transaction-local), BIGINT→Number parser at pool
  level, every query `WHERE tenant_id = $tenant_id AND is_live = $is_live` (exceptions:
  `gt_events`, `gt_prompts` system rows, public share-token lookups), JSONB stringified in
  JS + cast in SQL, tenant_id/is_live from JWT never from client, named params via
  `translateParams`. Under Option A the frontend uses PostgREST, not the pool.
- `vani_gtm_db` = KI-Prime/GTM engine DB: `vn_*` auth framework, `gt_*` tenant-scoped
  product tables, `ki_*` legacy (create no new `ki_*`), ~227 migrations in the KI-Prime repo.
  Runtime today connects as admin (BYPASSRLS); RLS cutover drafted (`grant-vanigtm-app.sql`).
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
  the other way around. Paced deliberately slowly. Concretely, as of this handover:
  - Not decided: whether VaNi AI's eventual backend reuses VaNiGTM's Express
    auth/db-layer/skill pattern, stays on the standalone `vani`-schema + PostgREST design
    from `docs/sql/`, or something else entirely once "VaNiGTM integrates into VaNi AI"
    is scoped concretely.
  - Not started: no code, no migration, no branch in VaNiGTM. Session has read access
    only (`add_repo` with `access: read`) — push access was explicitly not requested
    given "slowly."
  - `docs/sql/ws2.2-2.6` (the G1-ruled standalone design) stand as they are — not applied,
    not retired, not confirmed as final. Written before this discovery, so treat as one
    candidate rather than the settled plan.
- **Next session: do not resume building either direction without a fresh, concrete
  instruction from Charan on pacing/scope.** This section exists so that instruction can
  be short — the context above is what a new session would otherwise have to
  re-discover.
