# HANDOVER — Vikuna GTM (Phase 4: Storyteller + Frontend Rebrand)

> **This doc is the sole continuity between sessions.** The next session starts
> with zero memory — read this first.
> **Current state (2026-07-25):** everything is merged to `main` (tip = PR #9
> merge). Work on a fresh branch off main.
> **Supersedes** the earlier Phase 3 handover (that content is in git history).

---

## ✅ Phase 0 (legacy removal) COMPLETE — 2026-07-25
kewalinvest submodule gone; contact layer is gt_contacts/gt_contact_channels
(migrations 187/189/190 applied + verified: gt_next_seq → CONT-0001, pulse
client_id nullable); MFD skills/pages/routers removed (~27k lines); etl
pipeline + pulse-skill KEPT and retargeted to contacts (etl processing = 501
until prospect-skill); CLAUDE.md fully rewritten GTM-only. DB inventory =
vn_ + gt_ + 9 kept ki_ import/pulse tables (rename in POA Phase 2).
Read-only DB MCP connector prepared (.mcp.json + docs/mcp-db-setup.md) —
VPS-side setup pending (user runs VPS steps + claude.ai env settings).

## ▶ NEXT SESSION — start here
1. ~~**Deck-viewer gap**~~ ✅ CLOSED (2026-07-25): the public deck viewer was
   confirmed missing from main and rebuilt —
   `frontend/src/app/(public)/deck/[token]/page.tsx` + module CSS, plus
   `API.storyteller.share` registered in `serviceURLs.ts` (auth: false).
   Stage machine (loading/error/ready), keyboard + dot navigation, VDF
   loader/error-screen, theme variables only. This closes the locked scope
   (ICP + pitch generation). Smoke: route compiles and serves 200 in dev;
   verify once against a live backend with deck
   `E0cZmJMe2Ju6qZZasiC5iTRJ6vDH1FtE` (tenant `c829c707`).
2. **Phase 1 — UX wow pass** (POA Phase 1, `documents/POA-VaNi-GTM.md`):
   - ✅ **1.1 DONE (2026-07-25):** Neural Ops is a first-class theme
     (`config/theme/themes/neuralOps.ts`, id `neural-ops`, registered;
     dark = void/cyan/signal canonical, light = counterpart). Theme
     pipeline now supports per-theme fonts (`ThemeConfig.fonts`,
     emitted by ThemeProvider + ThemeScript; defaults preserved for the
     other 14 themes) — neural-ops uses Outfit / Instrument Sans /
     JetBrains Mono, loaded in the root layout font link. Mockup
     motion/glow/grid patterns are VDF utilities:
     `components/vdf/vdf-utilities.css` (`.vdf-animate-in` + delays,
     `.vdf-pulse`, `.vdf-glow-*`, `.vdf-glow-card`, `.vdf-gradient-text`,
     `.vdf-ops-label`, reduced-motion safe; imported in root layout) +
     `<VdfGridOverlay/>` (blueprint grid, pairs with VdfAtmosphere).
     All theme-token driven (color-mix over --color-*) — works under
     every theme. Verified via Playwright: /login + /landing render in
     neural-ops; vikuna-black unchanged. **Default theme stays
     vikuna-black** — flipping the product to neural-ops is a one-line
     env/default change the user makes when ready.
   - ✅ **1.2 DONE (2026-07-25):** all 12 screens exist as pixel-final
     interactive designs under **`/design`** (index page links them;
     shared `DesignShell` chrome with Neural Ops ⇄ Vikuna Black flip;
     synthetic "Solstice Metrics" data throughout): wizard (also in
     the sidebar as "Mission Wizard"), icp (+VaNi chat surface),
     knowledge, research, audit, campaigns, prospects, sequences,
     war-room, agent-logs, analytics, settings.
   - ✅ **1.3 DONE:** all 8 gap components in VDF — VdfMissionRail,
     VdfApprovalCard, VdfEnrichmentWaterfall, VdfScoreRing,
     VdfVisibilityMatrix, VdfLiveFeed, VdfPipelineKanban,
     VdfFlowCanvas (+ reused VdfWizard as the step rail). All
     theme-token driven, reduced-motion safe, exported from the index.
   - ✅ **1.4 DONE:** 9.8s muted-loop explainer recorded from the
     design wizard (Playwright walkthrough, review chrome hidden,
     wordmark close: "Your AI GTM team."). Files:
     `frontend/public/media/wizard-loop.webm` (0.45MB) + `.mp4`
     (0.52MB), embedded in the landing HeroSection (autoplay muted
     loop, playsInline). Re-record from the REAL wizard once it's
     wired to the backend.
   - **Phase 1 DoD met pending user sign-off ("wow").** Remaining
     ruling for the user: make neural-ops the product default theme
     (one line: NEXT_PUBLIC_DEFAULT_THEME or provider default).

## ▶ NEXT (PLG direction APPROVED by user 2026-07-25)
1. ✅ **Wizard wired to the live backend (2026-07-25)** — `/onboarding`
   IS now the agent-led mission wizard (old form-first page replaced;
   `/onboarding/icp-builder` kept as the refine surface; the old
   Onboard* components remain in components/onboarding for reuse).
   - **Backend added:** `POST /api/v1/ingest/url` (validates/normalizes,
     upserts gt_kb_sources url row — resubmit re-ingests, no dup rows —
     emits URL_SUBMITTED) and **URL support in IngestionAgent.run**
     (fetchUrlText: 30s-timeout fetch, HTML→text strip, 200k-char cap,
     JS-rendered pages fail with URL_EMPTY_CONTENT). Previously
     URL_SUBMITTED was registered but unimplemented (gdrive-only).
   - **Wizard flow:** step 1 domain → submit → poll source status →
     poll profile (KNOWLEDGE_UPDATED recalc) → researched card;
     error path offers retry OR "fill manually". Step 2 editable ICP
     fields (blur-save PUT, highlights `missing` fields from 400
     PROFILE_INCOMPLETE) → POST approve. Step 3 build deck →
     approve → share link (copy/open) → "Enter mission control"
     PATCHes ALL pending vn_tenant_onboarding steps → layout guard
     routes to /dashboard. Steps 4–6 locked ("agent coming soon").
     Boot resumes mid-mission (existing profile/approval/deck
     detected). serviceURLs: added `ingest.submitUrl` + `ingest.getSource`.
   - **Landing PLG hook:** hero domain input ("Watch VaNi learn your
     business") stores `gtm-domain-hint` in sessionStorage → /register;
     wizard step 1 prefills it.
   - ✅ **n8n render escalation VERIFIED LIVE (2026-07-27)** — after a
     long infra debugging session (community-node Chrome-missing on
     the Alpine n8n image → switched to the browserless docker variant
     → n8n Header-Auth credential in place of blocked `$env` access →
     cross-network container DNS failure → resolved via the
     `root_default` network gateway IP + browserless's host-published
     port, since browserless and the n8n worker container weren't on
     a mutually-resolvable network). Direct webhook test against
     `https://vikuna.io/` (a JS-only Vite/React SPA) returned
     `success:true`, 39,657 chars of fully rendered HTML — confirms
     the whole escalation chain (static crawl → health check →
     `render_page` → n8n → browserless → `render_complete`) is
     operationally live on the user's VPS. Two workflow files in
     `documents/n8n/` both patched to self-diagnose (name missing
     HTML by the actual json/binary keys returned) — keep both in
     sync if editing either's `Format Render Result` node again.
   - ⚠️ **Still NOT E2E-tested end-to-end through the WIZARD UI** —
     the render leg is proven at the n8n layer only. Next live test:
     register a fresh tenant → wizard step 1 → a real JS-rendered
     domain → confirm the drafted profile quality against rich real
     copy (worth watching: `vikuna.io`'s meta/OG/JSON-LD tags are
     injected by styled-components at runtime, not served statically —
     a real SEO/AEO finding for that site, and a good signal that the
     site_health check's "measure the static page" design is correct).
     Ollama must be pre-warmed (extractor + storyteller both hit LLM).
1a. **PIPELINE RE-SEQUENCED (user ruling, 2026-07-27) — read
   `documents/design-notes-gtm-pipeline-v2.md` before touching the
   wizard or Storyteller.** Five stages: competitive analysis →
   business-model analysis (open discussion, NOT committed) → ICP +
   pains → storytelling (stage/behaviour-aware, gated on 1+3) →
   campaigns (drip + story + journey). Journey-stage vocabulary:
   `documents/customer-journey-maps.pdf`.
   ✅ **IMPLEMENTED (2026-07-27, user "goahead"):**
   - Wizard is now research → **confirm competitors** → confirm ICP →
     mission configured. Deck step REMOVED from `/onboarding`;
     confirming the ICP finishes onboarding directly (approve →
     PATCH pending steps → /dashboard). Locked rail: Storytelling
     ("Unlocks in mission control"), Campaigns, Follow-ups.
   - New backend endpoints (vani.routes.ts): `GET /api/v1/vani/
     competitors` (KG Competitor nodes) + `POST /api/v1/vani/
     competitors/confirm` (keep → `properties.confirmed=true`,
     remove → node DELETE with edge cascade; empty keep list valid —
     "No competitors — continue"). Registered in serviceURLs
     (`API.vani.*`).
   - **Storyteller relocated to `/dashboard/storyteller`**: build
     (KG-constellation loader while drafting), **Approve & share**
     on awaiting decks (PATCH approve → share token), Copy link /
     open on approved decks. Wizard has zero storyteller code left.
   - Boot/revisit logic: approved profile ⇒ competitors+ICP marked
     confirmed, wizard lands on ICP step for enrichment revisits.
   - Smoke: both packages typecheck (only known pre-existing
     errors); `/onboarding` + `/dashboard/storyteller` serve 200.
   - **Competitor RESEARCH agent added (user ruling: competitors must
     be researched from the ICP, not scraped off the tenant's site;
     user chose self-hosted SearXNG).** New `research-skill`:
     `COMPETITOR_RESEARCH_REQUESTED` event → CompetitorResearchAgent
     (profile → LLM-framed queries → SearXNG JSON API via
     `agent-core/search.client.ts` → LLM shortlist of vendors →
     per-candidate verification against their REAL site via
     `IngestionAgent.fetchUrlText` (now public) + LLM fit-judgment →
     KG write: Competitor nodes {source:'research', domain, verified,
     angle, confirmed:false} + Company —DIFFERENTIATES_FROM→ edges).
     Unverifiable candidates are KEPT marked `verified:false` (human
     gate decides — transparent, not a fallback); dropped candidates
     are visible steps. Routes: `POST /vani/competitors/research`
     (dedupes active runs) + `GET /vani/competitors/research-status`.
     Wizard step 2 auto-starts research when the map is empty, shows
     the KG loader + live step feed, surfaces failures with the real
     cause + Retry, badges unverified rows. **DEPLOY PREREQ (user):**
     SearXNG on the VPS per `docs/searxng-setup.md` — port 3011,
     settings.yml must add `json` to search.formats (403 otherwise),
     then `SEARXNG_URL` in backend/.env (+ hard-restart worker).
     Without it research fails loudly with SEARCH_NOT_CONFIGURED.
   - **Resume-from-failure (user-requested after a live
     LLM_VPS_UNREACHABLE timeout killed a research run mid-verify).**
     ⚠️ **APPLY MIGRATION 191 before running this code** (`cd backend
     && npm run db:migrate`) — adds `gt_agent_runs.checkpoint JSONB` +
     partial index; agents now call saveCheckpoint and fail with a
     clear CHECKPOINT_COLUMN_MISSING error if it's absent. Mechanics:
     agent.runner gains saveCheckpoint (jsonb merge) / loadCheckpoint /
     findResumableRun (latest failed run w/ checkpoint, ≤24h). The
     research agent checkpoints after every stage (queries → results →
     candidates → per-candidate assessed) AND writes each accepted
     competitor to the KG the moment it's verified (incremental, not
     batched); wizard failure card now offers "Resume from where it
     stopped" (POST research {resume:true} → resume_run_id in event
     payload → visible 'restore' step) vs "Start fresh". Ingestion
     retrofitted with the same earn-it-write-it pattern: extractor
     gained an onChunk callback, nodes upsert per chunk + per-chunk
     checkpoint {chunks_done/total}; edges still resolve at the end
     (cheap, no LLM). Profile is always reloaded fresh on resume.
   - **Live-run status (2026-07-27):** SearXNG deployed + JSON API
     verified by the user (real results via curl). TWO wizard runs
     died on `LLM_VPS_UNREACHABLE: https://llm.dristiq.com —
     TimeoutError` — and the user confirmed LLM_PRIMARY_TIMEOUT_MS
     was **280000 the whole time**, meaning single qwen calls exceed
     4.6 MINUTES on that box. The VPS LLM is too slow for this
     pipeline as-is (still unknown: CPU or GPU, `curl
     https://llm.dristiq.com/api/ps` output). Prompt slimming helps;
     the real mitigation is the failover below.
   - **Claude API failover (user-directed, approved rule-12
     exception — documented in CLAUDE.md rule 12).** qwen stays
     primary; when a call fails at the TRANSPORT level
     (LLM_VPS_UNREACHABLE / LLM_VPS_ERROR) and ANTHROPIC_API_KEY is
     set, llm.client retries that one call on Claude
     (LLM_FAILOVER_MODEL, default claude-haiku-4-5 — $1/$5 per MTok;
     a full research run ≈ $0.02–0.03, full onboarding ≈ $0.10–0.15),
     then the NEXT call goes back to qwen. Never silent: one visible
     `llm_failover` step per run (with the real VPS error) + tokens
     recorded under the pre-existing 'escalation' bucket in
     gt_tenant_context. Validation failures deliberately do NOT
     escalate (quality problems stay loud). Without the key, behavior
     is unchanged (fail loudly). `@anthropic-ai/sdk` added to
     backend. **User action: put ANTHROPIC_API_KEY in backend/.env
     (env only, never repo) + hard-restart API and worker.**
     Deferred by user intent: a global LLM_PROVIDER switch
     (qwen vs claude as primary) — failover-only for now.
   - NOT yet live-tested end-to-end through the new step 2 (needs
     migration 191 applied + worker + warm LLM + SearXNG). First live
     Storyteller run verdict: deck
     generated OK end-to-end, quality needs work — deck-quality
     workstream (KG-edge-grounded prompts, competitor angles,
     stage-aware variants) starts NOW that relocation is done.
1e. **SEMANTIC CLUSTERS — the market vocabulary layer (user-directed,
   2026-07-27). ⚠️ APPLY MIGRATION 192.** The user challenged the
   research design: searching without curated vocabulary drops quality,
   and pulling only a stop-gap forward is rework ("why redo, when C
   works better?"). Agreed and built. `gt_semantic_clusters` is the
   Phase 2 table built in the only possible dependency order —
   vocabulary now (search needs it), `cluster_embedding vector(768)` +
   HNSW in Phase 2 (Lead Finder needs it). NOT rework.
   - **User design ruling:** `cluster_type`
     (category/offering/buyer/pain/outcome) replaces the ported
     ContractNest 12-value INDUSTRY enum — cluster TYPE drives how a
     cluster is searched; industry does not. Industry filtering returns
     in Phase 2 for Lead Finder.
   - Each cluster carries 10–15 `related_terms` (synonyms, customer
     phrases, jargon, transliterations) — the fuel that turns "AI
     transformation companies" into "fractional CDO"/"part-time CDO".
     This is the fix for the Accenture-vs-boutique result.
   - `approved_at` NULL = agent-suggested, set = human-confirmed
     (mirrors gt_tenant_profile). Only APPROVED clusters frame research.
   - Flow: KNOWLEDGE_UPDATED → profile recalc → `generateClusters()`
     (1 LLM call, prompt seeded as `profile-skill.semantic_clusters`)
     → tags in the wizard's ICP card → confirming the ICP ratifies them
     (no extra step, per the sprint ruling) → research frames queries
     from them, and says so in the feed. No approved vocabulary → it
     falls back to the old profile-guess and tells the user why.
   - Agent refresh never clobbers a human decision (approved or
     human-edited rows keep their terms); cluster failure is a visible
     failed STEP, never a failed profile recalc (rule 12).
   - Routes: `GET /profile/clusters`, `POST /profile/clusters/approve`.
   - NOT yet live-tested (needs migration 192 + a fresh run).
1f. **BUG FIXED — "Research again" appeared to do nothing (2026-07-27).**
   User clicked Research again and the card closed instantly. Cause:
   `GET /vani/competitors/research-status` returned the LATEST run for
   the tenant. A freshly-emitted event has no gt_agent_runs row until
   the worker polls (≤3s), so the first status poll read the PREVIOUS,
   completed run → UI jumped to 'done' with a "Research done — N
   competitors" toast while the real run was still queued and then ran
   invisibly. Fix: the status endpoint accepts `?event_id=` / `?run_id=`
   and scopes to that one run; POST already returns event_id (and run_id
   when a run is already active), so the wizard follows exactly the run
   its click produced. `run: null` now correctly means "queued", shown
   in the loader as "Waiting for an agent to pick this up…" escalating
   to the worker-not-running hint after ~24s. The resume-on-entry path
   polls by run_id. Lesson: never resolve "did my request start?" by
   reading the newest row — bind to the identifier the request returned.
1c. **Marketing playbooks captured (2026-07-27).** The user shared their
   Claude marketing plugin's full skill playbooks (campaign-plan,
   email-sequence, competitive-brief, brand-review, performance-report,
   content-creation, seo-audit) as inspiration for VaNi's agents. Raw
   text: `documents/skill-references/claude-marketing-skills.txt`;
   distilled map + recommended build order:
   `documents/design-notes-marketing-playbooks.md`. Key take: these are
   the professional spec for stage-4/5 agents — VaNi fills their
   structures from the tenant KG instead of interviewing the user.
   Proposed order (NOT yet approved): brand-voice fields + auto
   brand-review gate → research-skill v2 analysis layer (tiers +
   battlecards) → sequence/campaign agents from playbook-seeded
   gt_prompts.
1d. **Wizard UI pass from the live-run screenshot (2026-07-27, DONE).**
   - Competitor rows → **tag-style cards in a responsive grid**
     (design/research parity): status tag (Verified / Unverified /
     Ignored) + domain chip, display-font name, description, action in
     the card footer. The live "mapped so far" list uses the same card.
   - **"Not a competitor" → "Remove"** ("Keep after all" to undo). The
     old label read as a verdict — the user reported "almost all are
     tagged not competitors" when only the agent-dropped one actually
     was. Removed cards now carry an explicit `Ignored` tag, the header
     reads "N on your map / M moving to your ignore list", the confirm
     button counts ("Confirm 3 competitors"), and a hint spells out that
     removal feeds the ignore list (backend already dismisses, 57d41e9).
   - **Loop moved OUT of onboarding** to `/knowledge` ("Teach VaNi", new
     nav item under Mission Wizard): URL + paste inputs, KG loader,
     profile score ring, "what moves the needle" panel. The wizard keeps
     a one-line pointer once onboarding is complete; enrichment state +
     submitEnrichment deleted from page.tsx.
1b. **Deferred (user-agreed, 2026-07-27): full date handling.** The
   `DD-MMM-YYYY` render convention is live via `lib/format.ts` (the
   single gateway, CLAUDE.md rule). Still to come, later: tenant
   timezone preferences, server↔UI conversion beyond browser-local,
   and customer date-INPUT parsing/validation (a VDF date field).
   All of it lands inside format.ts + one VDF component — nothing
   else may grow date logic.
2. **Phase 2 — data modelling** (screens now dictate schema; rename
   kept ki_ tables to gt_). **Required input:**
   `documents/design-notes-smartprofile-port.md` — distilled from the
   ContractNest SmartProfile spec + n8n workflow the user shared
   (2026-07-27): suggested_/approved_ field provenance for
   gt_tenant_profile (replaces fill-only-empty), gt_semantic_clusters
   + pinned-dim pgvector embeddings (prereq: verify vector extension
   on vani_gtm_db), embeddings via VPS Ollama (nomic-embed-text, add
   embed() to llm.client), their production cluster prompt, and the
   hybrid vector+cluster-boost search that becomes Lead Finder's
   matching engine. AI jobs run on the worker bus, NOT n8n.
3. UI smoke state: contact CONT-0001 created through the UI post-Phase-0.

## What this product is (scope — LOCKED)
Vikuna GTM = an **agent-powered go-to-market engine**. Scope is locked to
**ICP + pitch generation** right now. **Storytelling is ONE agent; more agents
are coming** (ICP, Lead Finder, Sequence, Pulse — see `documents/VIKUNA_AGENT_SPEC_V1.md`
and the mockups in `documents/gtm-engine-ui/`).
**Nothing works without an ICP — the ICP (tenant profile) is the foundation/gate**
for every downstream agent.

> **Strategic docs (long-range, beyond the locked scope) — read after this file:**
> 1. `documents/PRD-VaNi-GTM.md` — full product definition (v1.0)
> 2. `documents/POA-VaNi-GTM.md` — execution plan (UX → data → skills → stitch,
>    with Phase 0 = KI-Prime/kewalinvest legacy removal)
> 3. `documents/GTM-AGENT-ROADMAP.md` — phase history + standing decisions
>
> These are the roadmap BEYOND the locked scope; the locked scope above wins
> for what gets built next.

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

### ✅ Continuity gap — RESOLVED (2026-07-25)
- The public deck viewer was rebuilt and pushed:
  `frontend/src/app/(public)/deck/[token]/page.tsx` (+ `deck-viewer.module.css`).
  It goes through `apiFetch` + `API.storyteller.share` (auth: false) rather
  than a raw fetch — the old `(public)/intake/[token]` pattern was removed in
  Phase 0, and serviceURLs/api-client is the house convention. Endpoint:
  `GET /api/v1/storyteller/share/:token` → `{ title, slides }` (Slide =
  `{ id, type, title, subtitle, bullets[{icon,head,body}], narration }`;
  narration is intentionally NOT rendered — speaker notes).

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

## ✅ SHIPPED via PR #8 (2026-07-25) — dashboard + ICP builder below are BUILT
The dashboard (ICP foundation card + agent launchpad), the /onboarding
icp-builder (editable, blur-save, Confirm ICP flow), the storyteller deck
list page, KNOWLEDGE_UPDATED→profile recalc wiring, and the gtmProfile
serviceURLs all landed via PR #8. The spec below is kept for reference.

## 🔨 Designed & LOCKED — shipped in PR #8 (spec kept for reference)
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
- ~~`deck/[token]/page.tsx` not on the branch~~ — rebuilt and pushed
  (see resolved Continuity gap above).

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
