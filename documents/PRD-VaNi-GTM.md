# VaNi GTM Engine — Product Requirements Document

> v1.0 · 2026-05-13 · Canonical product definition.
> Companions: `POA-VaNi-GTM.md` (execution plan), `GTM-AGENT-ROADMAP.md`
> (phase history + decisions), `VIKUNA_AGENT_SPEC_V1.md` (agent infra spec),
> `gtm-engine-ui/` (UX blueprints).

---

## 1. Vision

**An AI GTM team for any product company.** A tenant signs up, VaNi learns
their business (conversation + website + documents), builds their go-to-market
intelligence (profile, ICP, competitors, market research), runs their digital
presence audit, and then executes outreach — finding prospects, scoring them,
telling each one a customized story across a drip journey, and reporting what
works — with a human approving every consequential step.

- Each Vikuna product (ContractNest, KaalaDristi, FamilyKnows, …) is a tenant.
- Any external company can be a tenant. Nothing in the product is
  Vikuna-specific or MFD-specific.
- Positioning (April Dunford format): *For early-stage product companies who
  can build but struggle to distribute, VaNi GTM is an AI go-to-market team
  that researches, targets, and runs outreach for you. Unlike CRMs and
  sequence tools that give you empty scaffolding, VaNi fills the scaffolding —
  the profile, the story, the prospects, the content — and asks you only to
  approve.*

## 2. Users

| Role | Description | Primary surfaces |
|---|---|---|
| Founder/GTM owner | Sets up the tenant, approves profile/story/sends | Onboarding, War Room, approvals |
| Operator | Day-to-day: contacts, sequences, campaigns | Campaigns, Contacts, Sequences |
| Viewer | Stakeholder watching performance | War Room, Analytics |

One tenant = one company. Users belong to a tenant (existing vn_ auth layer).
Live/sandbox environment isolation per tenant (existing `is_live` model).

## 3. The core loop

```
  ONBOARD          LEARN                 PLAN                EXECUTE            LEARN AGAIN
┌──────────┐  ┌───────────────┐  ┌────────────────┐  ┌─────────────────┐  ┌──────────────┐
│ register │→ │ Smart Profile │→ │ Research +     │→ │ Campaigns +     │→ │ Analytics +  │
│ mission  │  │ (conversation │  │ Competitors +  │  │ Prospects +     │  │ Feedback +   │
│ setup    │  │ website, docs)│  │ Digital Audit  │  │ Story + Outreach│  │ Iterate      │
└──────────┘  └───────────────┘  └────────────────┘  └─────────────────┘  └──────────────┘
                     ▲                                                            │
                     └────────────────── continuous enrichment ───────────────────┘
```

Human approval gates: profile approval, story approval, sequence launch,
(optionally) per-send approval in early trust phase.

## 4. Modules

### M1 — Smart Profile (exists, ~70%)
Typed tenant profile (product / ICP / GTM / vision, completion score, history)
built three ways: VaNi conversation, uploaded documents, website exploration.
All three converge in the knowledge graph and map into `gt_tenant_profile`.
Human approves; approval wakes downstream agents.

### M2 — Knowledge Ingestion (exists, ~85%)
Upload (PDF/DOCX/PPTX/text), URL submit, Google Drive folder sync → parse →
chunk → extract entities → knowledge graph. KNOWLEDGE_UPDATED → profile
completion recalc is wired on the in-flight `phase-4-merge-main` branch.
**Gap to close:** website crawler (N key pages from tenant domain).

### M3 — Research & Competitors (new)
Deep research agent: market/category research on the tenant, competitor
discovery and per-competitor research → `Competitor` KG nodes + positioning
deltas into the profile. Requires a web-search capability (decision pending:
SearXNG self-host vs API).

### M4 — Digital Audit (new — supersedes standalone AEO)
One crawl + connected-analytics infrastructure, five audit lenses. Produces a
scored audit report with prioritized recommendations; Storyteller drafts the
fix content where content is the fix.

| Lens | What it checks | Source |
|---|---|---|
| SEO | Meta/schema/sitemap/robots, content structure, page speed, Core Web Vitals | Site crawl + headless browser |
| AEO | Brand visibility in ChatGPT/Perplexity/Google AI/Claude/Bing for target queries; Be-the-Source / Be-in-Context / Be-Retrievable tracks | Query probes + crawl |
| Website improvement | Content clarity, positioning match vs profile, UX heuristics | Crawl + LLM analysis vs profile |
| CRO | Landing pages: CTA presence/clarity, friction, form length, proof elements | Crawl + LLM heuristics |
| Journey analytics | Funnel drop-offs, channel effectiveness, journey stage conversion | Tenant-connected analytics (GA4 etc. via universal connector) |

Cadence: full audit on demand + weekly AEO scan + monthly re-audit.
Output: audit score per lens, trend over time, ranked recommendations feeding
the Feedback Agent digest.

### M5 — Campaigns (exists)
Campaign lifecycle, stats, per-campaign tabs (contacts / sequences / channels).
Persona configuration (icp-skill) per campaign — personas derived from the
tenant profile ICP (draft-generated, human-edited).

### M6 — Prospects (new pipeline; contact CRM exists)
Three sources, one intake: CSV upload → universal BYO connector (any provider;
Apollo preset first) → platform credits (later). Staging with provenance →
dedup → PROSPECTS_IMPORTED → Scoring Agent (vs personas + signals) → ranked
pipeline → campaign assignment. Decision-maker enrichment via the same
connector layer.

### M7 — Storyteller (v1 BUILT; v2 extension planned)
**v1 (built, verified E2E):** turns the approved profile + KG into a pitch
deck — `POST /build` (LLM output Zod-validated against DeckSchema) →
human approve mints a `share_token` → public share route → grounded audience
Q&A logged to `gt_qa_log`. Tables: `gt_presentations`, `gt_qa_log`
(migration 186). Triggered by PROFILE_COMPLETE + manual build.
**v2 (planned):** the campaign content brain — story artifacts per
(campaign × persona × journey stage) populating sequence step templates,
AEO/content recommendations, and creative briefs. Same approval gating.

### M8 — Outreach Execution (rails exist; executor new)
Sequences (email/WhatsApp/LinkedIn steps, waits, conditions) + channel config
exist. Build: the scheduled step executor in the worker (due steps → render
template with story + prospect context → send via channel → record → advance),
reply detection hooks, Orchestrator conflict resolution (one prospect, one
agent at a time), sender hygiene (warm-up, caps).

### M9 — War Room & Analytics (exists, extend)
Live dashboard (fleet status, funnel, activity feed), agent decision logs,
performance analytics. Extend with: audit scores, AEO visibility, Feedback
Agent recommendations digest.

### M10 — Creative Generation (later)
Images for campaigns via FLUX.1 (custom host) or Ideogram API, prompted by
story + persona context (`CREATIVE_REQUESTED` event → image agent → asset
store). Explainer videos (LTX or similar) as a separate GPU spike.

## 5. Agent fleet

| Agent | Trigger | Reads | Writes | Human gate |
|---|---|---|---|---|
| VaNi (profile) | TENANT_REGISTERED, conversation | prompts, KG | KG, profile | approve profile |
| Ingestion | FILE_UPLOADED, URL_SUBMITTED, FOLDER_CONNECTED | sources | KG, kb_sources | — |
| Research | PROFILE_COMPLETE, manual | profile, web | KG (Competitor), profile | review findings |
| Audit | manual, weekly cron | site crawl, analytics, AI platforms | audit reports, recommendations | — |
| Prospecting | manual, PROSPECTS_IMPORTED | staging, connectors | contacts pipeline | — |
| Scoring | PROSPECTS_IMPORTED | personas, signals | scores, ranks | — |
| Storyteller (v1 built) | PROFILE_COMPLETE, manual build | profile, KG (+v2: personas, prospect) | decks (v1); story artifacts (v2) | approve deck/story |
| Outreach | scheduled steps | sequences, stories, channels | sends, activity | launch approval |
| Conversion | engagement signals | activity, scores | alerts, priority flags | — |
| Feedback | weekly cron | analytics, audits | recommendations digest | — |
| Orchestrator | continuous | all agent intents | conflict resolutions | — |

All agents: event-driven via `gt_events` → worker `AGENT_REGISTRY`; runs logged
in `gt_agent_runs` with steps, token usage, awaiting_input; per-agent model
selection (fast tier for mechanical tasks, quality tier for reasoning).

## 6. Non-functional requirements

- **Multi-tenant isolation:** every query filters `tenant_id`; RLS as safety
  net on tenant-data tables (infrastructure tables like `gt_events` exempt —
  migration 185); environment isolation via `is_live`.
  ⚠️ Current runtime connects as `vikuna_admin` (BYPASSRLS) — RLS is dormant;
  the least-privilege cutover to `vanigtm_app` is drafted
  (`scripts/grant-vanigtm-app.sql`, `docs/rls-cutover-checklist.md`) and is a
  REQUIRED pre-production task (includes SECURITY DEFINER fix for the public
  deck share route).
- **Human-in-the-loop:** every externally visible action (send, publish) has
  an approval gate until the tenant relaxes it.
- **LLM strategy:** VPS-hosted primary (OpenAI-compatible), per-agent model
  override, token budget per tenant per day, escalation hook reserved for
  frontier models.
- **Cost control:** connector rate limits, per-tenant quotas, platform credits
  metered when introduced.
- **Compliance:** prospect data is personal data (DPDP Act India); BYO
  connectors keep data licensing with the tenant; sender reputation hygiene
  is a product feature, not an afterthought.
- **Observability:** every agent decision inspectable (agent-runs UI);
  activity feed is the audit trail.

## 7. Legacy removal (KI-Prime / kewalinvest)

VaNi GTM was bootstrapped on the KI-Prime (MFD fintech) codebase. The GTM
product must carry none of it:

- **Remove:** kewalinvest git submodule; MFD-era skills (client-skill, etl-skill
  MFD paths, pulse MFD JTBD logic, alert/report/comms stubs); MFD frontend
  pages (clients, customers, import, import-dashboard, master-data, demo-data
  MFD seeds); ki_ financial tables (schemes, holdings, snapshots, families,
  asset types, …).
- **Migrate:** the contact layer — `ki_contacts`/`ki_contact_channels` (38+
  refs, GTM engine depends on it) → GTM-native `gt_contacts` model without
  financial snapshot baggage.
- **Keep:** vn_ auth/tenant framework, VDF component library, theme system,
  agent core, all gt_ tables and GTM skills.

Scope, order, and safety checks: see POA Phase 0.

## 8. Out of scope (v1)

- Payments/billing for tenants (pricing tiers defined, enforcement later).
- Platform-owned data credits (M6 source 3) until revenue justifies.
- Explainer video generation (spike after images).
- Mobile apps (responsive web only).
- Multi-language UI (English v1; Indic languages later per GTM guide).
