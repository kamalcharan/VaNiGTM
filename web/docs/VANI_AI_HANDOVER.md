# VaNi AI — Session Handover

**From:** Claude Code website session (session ending 2026-07-31)
**To:** next Claude Code session in this repo
**State:** Phase A in progress · Gate G1 NOT yet passed · no application code written for VaNi AI

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
1. `VaNi_AI_App_Spec_v1.docx` — the contract (§4 partially superseded by Addendum A)
2. `VANI_AI_MENTOR_BRIEF.md` + Addendum A — guardrails; `vani_gtm` directive; Supabase prohibition
3. `vani-ai-ux-blueprint.html` v2 — design system; implement, don't reinterpret; reviewer nav + sample data excluded
4. `email-report.html` / `email-report.txt` — report email templates (merge fields)
5. `AI_Failed_Initiatives_Audit_PilotPack_v1.docx` §3 — survey instrument, seed VERBATIM (**not yet provided — request it**)
6. `VaNi_AI_POA_v1.docx` — workstreams, gates, session protocol

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
- ⚠️ WS2.1 schema inspection: **blocked in old session, unblock ready.** Direct 5432 is
  unreachable (VPS firewall + sandbox egress). Solution installed: read-only MCP channel.
  - `.mcp.json` at repo root → `gtm-postgres` (SSE, `https://mcp-db.dristiq.com/sse`).
  - Host reachability CONFIRMED (nginx 401 challenge seen from this environment).
  - Requires `GTM_MCP_BASIC` env var in the Claude environment settings (Charan sets it;
    `base64("claude:<password>")`). It was NOT set as of handover.
- ❌ WS2.2–2.5 (migrations, scoring fn, login RPC, seed): **not started — gated on G1.**

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
