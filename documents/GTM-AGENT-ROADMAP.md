# Vikuna GTM — Agent Roadmap (Phases 4–8)

> Agreed direction as of 2026-05-13 session. Companion to `HANDOVER.md` (operational
> state) and `VIKUNA_AGENT_SPEC_V1.md` (infrastructure spec). Read alongside
> `GTM-Expert-Guide.docx` for the strategic rationale.

## Intent

VaNi-GTM works as an AI GTM agent for Vikuna's products (each product = a tenant),
and potentially for any external company as a tenant.

The full loop:

1. Build a Smart Profile of the tenant (ICP and beyond)
2. Profile is built by exploring the tenant's website + uploaded documents
3. Create deep research on the tenant's market
4. Find competitors, research them
5. Create campaigns
6. Find potential customers
7. Find decision makers
8. Send them email (and other channels)
9. Storytelling: based on ICP + campaign + target prospect profile, build a
   customized story → drip marketing across customer-journey stages → funnel → leads
10. Hermes (LLM) where it speeds things up
11. FLUX.1 / Ideogram for campaign images; LTX (or similar) for explainer videos

## Plan vs. current state (audit 2026-05-13)

| # | Plan item | State | Notes |
|---|---|---|---|
| 1 | Smart Profile | ~70% | gt_tenant_profile + profile-skill + VaNi conversation→KG→profile. E2E verification in progress (HANDOVER.md). |
| 2 | Website + docs → profile | ~50% | ingestion-skill (PDF/DOCX/PPTX/text, URL, GDrive) → KG works. Missing: KNOWLEDGE_UPDATED → profile re-map; website crawler (only single-URL today). |
| 3 | Deep research | 0% | No agent. |
| 4 | Competitor research | 0% | KG label `Competitor` exists in schema (mig 181); no agent. |
| 5 | Campaigns | Built | campaign-skill (8 fns) + /campaigns UI from earlier phase. |
| 6 | Find potential customers | CRM only | contact-skill manages known contacts; no prospecting agent. |
| 7 | Find decision makers | 0% | icp-skill has personas+signals (the "who"); no enrichment agent finding actual people. |
| 8 | Send email | ~60% | sequence-skill (email/WhatsApp/LinkedIn steps, waits, conditions) + channel-skill (config+test). Missing/unverified: scheduled step EXECUTOR in worker; real send. |
| 9 | Storytelling | 0% | Only a comment in vani.agent.ts. PROFILE_COMPLETE event already fires — the hook is live, handler unbuilt. Delivery rails (sequence/pulse) exist. |
| 10 | Hermes | Decision made | See "Model strategy" below. |
| 11 | FLUX.1 / Ideogram / LTX | Discussion settled at direction level | See "Creative generation" below. |

Key architectural fact: the event bus + worker AGENT_REGISTRY + KG + prompts store
were designed for exactly this roadmap. Each item below is "write an agent, register
it on an event" — no re-architecture needed.

## Build order

### Phase 4 — Profile from ingestion + website (completes items 1–2)
- Wire `KNOWLEDGE_UPDATED` (already in EventType) → re-run KG→profile mapping.
  The Stage 6 mapping code in vani.agent.ts is reusable — extract it into
  profile-skill so both VaNi-approval and ingestion paths share it.
- Add a small website crawler to ingestion-skill: given the tenant's domain,
  fetch N key pages (home, about, pricing, product), feed the existing
  extractor → KG → profile.
- Human gate stays: profile changes surface for approval, not silent overwrite.

### Phase 5 — Research agent (items 3–4)
- One agent, two modes:
  - Deep research on the tenant's own market/category.
  - Competitor discovery + per-competitor research → `Competitor` KG nodes
    (+ edges DIFFERENTIATES_FROM), positioning notes into profile.
- Needs web search capability — decide: VPS LLM alone is NOT enough; pick a
  search API (SearXNG self-hosted / Tavily / Brave) before building.
- Trigger: PROFILE_COMPLETE (auto) + manual "run research" route.

### Phase 6 — Storyteller (item 9)
- Trigger: PROFILE_COMPLETE, later campaign-created / prospect-assigned.
- Reads: gt_tenant_profile, gt_kg_nodes (incl. competitors), icp-skill personas,
  prospect profile (when available).
- Writes: story artifacts per (campaign × persona × journey-stage), which
  populate sequence-skill step templates.
- Human gate: same `awaiting` pattern as VaNi — approve narrative before it
  enters a live sequence.
- Rationale for ordering: campaigns/sequences/channels already exist and are
  waiting for content; GTM guide pillar order = positioning/story before outreach.

### Phase 7 — Prospecting + decision makers (items 6–7)
See "Prospect sourcing" below — the architecture decision is made; build order
inside the phase: staging + upload first, BYO connector second, platform key last.

### Phase 8 — Sequence executor hardening (item 8)
- Verify/build the scheduled step-sender in the worker (sequence steps → due →
  send via channel-skill → record → advance).
- Connect a real email channel end-to-end; warm-up + sender reputation hygiene.

## Prospect sourcing (decided 2026-05-13)

Three sources, ONE intake pipeline. Ship in order **1 → 3 → 2**.

1. **User uploads (CSV/XLSX) — first.** Tenants already have lists (events,
   LinkedIn exports, old CRMs). Zero vendor cost, tenant owns the data.
   Reuse import-dashboard UX (upload → map columns → validate → commit) +
   contact-skill.
2. **BYO API key — second.** Connector per provider (Apollo, Lusha, Clay, …)
   with tenant-stored credentials in `gt_tenant_integrations` (same pattern as
   GDrive OAuth today). Usage bills to the tenant's account; data licensing is
   between tenant and provider. Wrap with rate limits + access audit trail.
3. **Platform-owned API — last.** Best UX, but Vikuna becomes data controller:
   vendor bill, per-tenant metering/quotas (extend PG rate limiter), abuse
   control, resale-terms compliance. Also a pricing-tier lever ("N platform
   credits/month"). Build when revenue justifies the vendor contract.

Pipeline (source-agnostic downstream):

```
upload CSV ──┐
BYO Apollo ──┼─→ prospect staging (tenant_id, source, external_ref, raw jsonb)
platform ────┘        │ dedup on (tenant_id, email / linkedin_url)
                      ▼
            PROSPECTS_IMPORTED event
                      ▼
        ICP-scoring agent (vs icp-skill personas + buying signals)
                      ▼
        ranked prospects → contact-skill → campaign assignment
```

Provenance is a column, not a codepath. The scoring/finder agents never care
where a prospect came from.

Compliance flags: prospect data = personal data under India DPDP Act; sender
reputation dies on bad lists; BYO shifts licensing to tenant; platform key makes
Vikuna the controller (one more reason it ships last).

## Model strategy (Hermes decision)

- Same-size Hermes (8B) is NOT faster than qwen3:8b — speed comes from parameter
  count/quant, not brand.
- Build **per-agent model selection**: a model override per prompt/agent (column
  on gt_prompts or an env map), replacing the single global LLM_PRIMARY_MODEL.
- Then: test `hermes3:3b` (or other small strict-instruction models) as the
  FAST tier for mechanical tasks (tag extraction, scoring, dedup); keep
  `qwen3:8b` as the QUALITY tier for reasoning-heavy conversation turns.
- This also permanently solves the model-juggling pain from Phase 3 testing
  (gemma paraphrases, deepseek-r1 drowns in <think>, qwen3 slow-but-correct).

## Creative generation (FLUX.1 / Ideogram / LTX)

- **Images (campaign creatives):** FLUX.1 custom-hosted or Ideogram API (strong
  at text-in-image, useful for banners). Fits the bus: `CREATIVE_REQUESTED`
  event → image agent → asset store. Input = story + persona + campaign context,
  which is why this ships AFTER Storyteller (Phase 6) — the story is the prompt.
- **Videos (explainers):** LTX or similar. Separate spike — heavy GPU, different
  pipeline (or compose slides+TTS instead). Do not bundle with image work.
- Constraint to budget for: VPS GPU capacity — same class of problem as the
  qwen3-on-laptop issue, but bigger.

## Open questions (carry into next session)

- [ ] Search API choice for Phase 5 (SearXNG self-host vs Tavily vs Brave).
- [ ] First BYO provider to support (Apollo assumed — confirm).
- [ ] Does sequence-skill have ANY executor today, or definitions only? (Audit
      at Phase 8 start; suspected definitions-only.)
- [ ] icp-skill personas are campaign-scoped; the smart profile ICP is
      tenant-scoped. Decide: derive campaign personas FROM tenant profile
      (Storyteller/ICP agent generates draft personas per campaign)?
- [ ] GPU hosting plan for FLUX/LTX (which VPS, which card, cost).
