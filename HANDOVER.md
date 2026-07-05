# HANDOVER — Vikuna GTM (Phase 4: Storyteller + Frontend Rebrand)

> **This doc is the sole continuity between sessions.** The next session starts
> with zero memory — read this first.
> **Branch:** `claude/project-status-check-le8eyn` · **Tip at handover:** `85796b5`
> (`feat(auth): rebrand auth copy to Vikuna GTM`)
> **Supersedes** the earlier Phase 3 handover (that content is in git history).

---

## What this product is (scope — LOCKED)
Vikuna GTM = an **agent-powered go-to-market engine**. Scope is locked to
**ICP + pitch generation** right now. **Storytelling is ONE agent; more agents
are coming** (ICP, Lead Finder, Sequence, Pulse — see `documents/VIKUNA_AGENT_SPEC_V1.md`
and the mockups in `documents/gtm-engine-ui/`).
**Nothing works without an ICP — the ICP (tenant profile) is the foundation/gate**
for every downstream agent.

---

## ✅ Verified working end-to-end this session
- **Storyteller backend** over HTTP: `POST /api/v1/storyteller/build` →
  `PATCH /api/v1/storyteller/:id/approve` → `GET /api/v1/storyteller/share/:token`.
  Deck `E0cZmJMe2Ju6qZZasiC5iTRJ6vDH1FtE` for tenant `c829c707` is approved +
  shareable.
- **Frontend auth**: login + register work against the backend; rebranded to
  Vikuna GTM (copy + brand strings).
- **Profile API** (live-verified):
  - `GET /api/v1/profile/` → full profile + `completion_score` +
    `completion_detail {product, icp, gtm, vision}`.
  - `PUT /api/v1/profile/` → partial save (whitelisted fields), recomputes score,
    upserts if absent, writes history snapshot.
  - `PATCH /api/v1/onboarding/step` → completes a step, returns `onboarding_complete`.

### ⚠️ Continuity gap — verify on next session
- **`frontend/src/app/(public)/deck/[token]/page.tsx` (public deck viewer) is NOT
  on the branch as of `85796b5`.** It was reported built locally but never
  committed/pushed. **A fresh clone will not have it.** First action next
  session: confirm whether it exists locally and push it, or rebuild it.
  (Pattern to mirror: `(public)/intake/[token]/page.tsx` — `'use client'`,
  `useParams()`, direct `fetch` to `NEXT_PUBLIC_API_URL` (no api-client/JWT),
  a Stage machine. Endpoint: `GET /api/v1/storyteller/share/:token` → `{ title, slides }`.)

---

## Key facts the next session MUST know
- **DB role / RLS:** the app connects as **`vikuna_admin`** (superuser, `BYPASSRLS`),
  so **RLS is dormant at runtime** — tenant isolation currently rests on the
  app-layer `WHERE tenant_id` only. The least-privilege cutover to `vanigtm_app`
  (grants + the `SECURITY DEFINER get_shared_deck(token)` fix for the public
  share route, which will otherwise break under RLS) is **drafted but NOT done**
  in `scripts/grant-vanigtm-app.sql` + `docs/rls-cutover-checklist.md`.
  **Deploy-time task.**
- **Frontend** is a remodelled KI-Prime (Next.js 16 App Router, **NOT Vite**).
  Brand strings centralized in **`frontend/src/constants/brand.ts`**
  (`BRAND.name = 'Vikuna GTM'`). Theme = **vikuna-black (gold-on-black)** — keep
  as-is. (Mockups use a cyan/green mission-control palette; not adopted — would
  need a new theme.)
- **`onboarding_complete` is DERIVED, not stored.** `GET /auth/me` computes it as
  `count(vn_tenant_onboarding WHERE status != 'completed') == 0`. Seeded steps at
  registration: **`user_profile`** + **`business_profile`**.
  **`POST /profile/approve` does NOT release onboarding** — it only stamps
  `gt_tenant_profile`. To release the guard you must `PATCH /onboarding/step`
  for **every** pending step until the pending count hits zero.
- **Migrations are manual** (`cd backend && npm run db:migrate`); the server never
  auto-runs them. Highest migration = **186** (`gt_storyteller`).
- **LLM:** VaNi uses an OpenAI-compatible endpoint (`/v1/chat/completions`) via
  `LLM_PRIMARY_URL`/`LLM_PRIMARY_MODEL`. Working model on the dev laptop is
  **`qwen3:8b`** (pre-warm Ollama with `keep_alive:"24h"`; it emits the required
  tags). `llm.client.ts` appends `/no_think` and sends an optional
  `Authorization: Bearer $LLM_PRIMARY_KEY` only if that env is set.
- **`gt_events` has RLS disabled** by design (migration 185) — it is the
  cross-tenant event bus polled by the worker.

---

## 🔨 Designed & LOCKED, not yet built — THE NEXT BUILD
### Dashboard (`frontend/src/app/(app)/dashboard/page.tsx` — currently MFD dummy data)
- **ICP foundation card**: completion % from `completion_score`.
- **Agent launchpad**: Storytelling **live**; other agents **"coming soon"**.
  **All agents gated on an ICP existing** (profile present / approved).

### ICP builder = the `/onboarding` screen
- **Agentic UI, structured (NOT chat).** Sections **Product / ICP / GTM / Vision**
  mirroring `completion_detail`, each showing its sub-score.
- **Blur-save** via `PUT /api/v1/profile/` with **live score update** from the
  response.
- **NO per-field provenance** ("VaNi drafted" tags) — the backend does not track
  it (only a lossy row-level `source` column). Render all fields without
  provenance.
- **"Confirm ICP" = 3 calls, in order:**
  1. `POST /api/v1/profile/approve` (requires the 5 fields: product_name,
     product_description, core_problem, icp_role, primary_pain_points).
  2. `PATCH /api/v1/onboarding/step` for **EVERY** still-pending step
     (`user_profile`, `business_profile`) until `onboarding_complete === true`.
  3. Invalidate `useMe` and navigate to `/dashboard`.

### Step A (prerequisite before building the UI)
- **Register the gtmProfile endpoints in `frontend/src/lib/serviceURLs.ts`** —
  they are NOT there yet. Add under a key **`API.gtmProfile.*`** (do NOT reuse
  `API.tenant.profile.*`, which is the *business* profile at
  `/api/v1/tenant/profile` — a different thing):
  - `gtmProfileGet` — `GET  /api/v1/profile/`
  - `gtmProfileUpdate` — `PUT  /api/v1/profile/`
  - `gtmProfileApprove` — `POST /api/v1/profile/approve`
  - `gtmProfileHistory` — `GET  /api/v1/profile/history`

---

## 👀 Watch / open
- **`completion_score` looked erratic across live test calls** (95 vs 0;
  `version` 1 vs 2 on the same profile id). Investigate whether the score is
  stable during live editing **before** wiring the blur-save meter — a jumpy
  score will read as a bug in the ICP builder. Logic:
  `backend/src/skills/profile-skill/profile.service.ts` (`calculateCompletionScore`;
  product 0-40 / icp 0-30 / gtm 0-20 / vision 0-10; `is_complete` = score ≥ 60).
  Note `upsertProfile` MERGES with the existing row then recomputes on the merged
  result — check that partial PUTs aren't nulling fields and dropping the score.
- **Debug console.logs in the storyteller share handler: already removed**
  (commit `9bed127`) — verified clean at `85796b5`. Nothing to do unless they
  reappear.
- **`deck/[token]/page.tsx` not on the branch** (see Continuity gap above).

---

## How to run (dev)
```
# backend  (port 3002 in the dev .env; 3001 is the code default)
cd backend && npm run dev            # Express + Next wrapper / API
cd backend && npm run worker         # event-bus worker (needed for VaNi / approve flows)

# frontend (Next.js 16, port 3000)
cd frontend && npm run dev
```
- **Frontend MUST set `NEXT_PUBLIC_API_URL`** (e.g. `frontend/.env.local` →
  `NEXT_PUBLIC_API_URL=http://localhost:3002`) or login/API calls hit the wrong
  origin (they fall back to the frontend's own origin). Restart the frontend
  after changing env.
- **CORS** allows `http://localhost:3000` by default (`CORS_ORIGIN`).
- **Seeded admin:** `charan@vikuna.in` / `Vikuna2026Admin` (tenant `vikuna`).
  Phase-3 test tenants use password `Test1234!`. Seed: `cd backend && npm run db:seed`.
- Live DB = `vani_gtm_db` on the VPS via `DB_PRIMARY`.

## Git hygiene (recurring pain this session)
- Local edits kept colliding with pushes. **Before every `git pull`, run
  `git status`; if anything is modified you didn't intend, `git stash` first,
  then pull.** Treat the local checkout as receive-only; branch before local
  experiments. If local and remote diverge and remote is authoritative:
  `git fetch origin && git reset --hard origin/claude/project-status-check-le8eyn`.

## Key files
```
backend/src/skills/storyteller-skill/     agent (buildDeck/approveDeck/answerQuestion) + routes + deck.schema
backend/src/skills/profile-skill/          profile.service.ts (score) + profile.routes.ts (GET/PUT/approve/history)
backend/src/auth/auth.routes.ts            /auth/me (derives onboarding_complete), /onboarding/status, /onboarding/step
backend/migrations/186_gt_storyteller.sql  gt_presentations + gt_qa_log
frontend/src/constants/brand.ts            BRAND (single source of the product name)
frontend/src/app/(public)/landing/         rebranded GTM landing (Step 1 done)
frontend/src/components/auth/              login-vault + register-page (rebranded, Step 2 done)
frontend/src/app/(app)/layout.tsx          auth + onboarding guard
frontend/src/lib/serviceURLs.ts            API registry — gtmProfile.* NOT yet added (Step A)
docs/rls-cutover-checklist.md              deploy-time RLS cutover (incl. share-route SECURITY DEFINER fix)
documents/gtm-engine-ui/                   the product UI mockups (design reference)
```
