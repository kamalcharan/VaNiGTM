---
name: research-skill
version: 1.0.0
description: Outward research — competitors from the profile, and per-company account briefs for a prospect cohort
tier: starter
default_recipe: brief-list
---

# research-skill — outward competitive research (GTM pipeline v2, stage 1)

## Why this skill exists
Competitors almost never appear on a tenant's own website. Real competitive
analysis is OUTWARD research framed by the drafted profile/ICP — this skill
does that research and lands the result in the knowledge graph for the human
to rule on in the wizard's confirm-competitors step.

## Agent
`research.agent.ts` — `CompetitorResearchAgent.run(pool, tenantId, payload, runId)`

Registered on the event bus (worker `AGENT_REGISTRY`):

| Event | Emitted by | Handler |
|---|---|---|
| `COMPETITOR_RESEARCH_REQUESTED` | `POST /api/v1/vani/competitors/research` (wizard auto-triggers on entering the competitors step; also re-runnable any time) | `CompetitorResearchAgent.run` |

## Pipeline (every step lands in `gt_agent_runs.steps` → wizard live feed)
1. **load_profile** — `gt_tenant_profile`; fails `PROFILE_NOT_FOUND` if no
   drafted profile (website research must run first).
2. **frame_queries** — LLM turns the profile into ≤4 web-search queries.
3. **web_search** (one step per query) — self-hosted SearXNG via
   `agent-core/search.client.ts` (`SEARXNG_URL`; JSON API must be enabled —
   `docs/searxng-setup.md`). Own domains excluded. Zero total results →
   `SEARCH_EMPTY`, run fails loudly.
4. **shortlist** — LLM extracts actual VENDOR candidates from the results.
   Directories/listicles/review sites are evidence, never candidates.
   Domains only when present in the evidence — never guessed.
5. **verify** (per candidate, cap 6 site reads) — the anti-hallucination
   gate: fetch the candidate's real site (`IngestionAgent.fetchUrlText`,
   static only) and LLM-judge fit. Outcomes:
   - real competitor → accepted with positioning + differentiation angle
   - not a competitor → dropped (visible step)
   - site unreadable / no domain / over cap → KEPT, `verified=false`
     (transparent, human gate decides — NOT a silent fallback)
6. **kg_write** — `Competitor` nodes upserted with properties
   `{source:'research', domain, verified, evidence_url, angle?, confirmed:false}`
   plus a `Company —DIFFERENTIATES_FROM→ Competitor` edge (basis = angle)
   when the tenant's Company node exists.

## Resume-from-failure (migration 191)
Working state is merged into `gt_agent_runs.checkpoint` after every
expensive stage (`queries` → `results` → `candidates` → per-candidate
`assessed`), and each accepted competitor is written to the KG **the
moment it's earned** (incremental node+edge writes, not batched at the
end). On failure (LLM timeout, `TOKEN_BUDGET_EXCEEDED`), the wizard's
failure card offers **Resume from where it stopped** →
`POST /competitors/research {resume:true}` → the route finds the latest
failed run with a checkpoint (≤24h, `findResumableRun`) and passes
`resume_run_id` in the event payload; the new run restores that state
(visible `restore` step) and re-runs only what never completed. The
profile is always reloaded fresh so edits since the failure are honoured.
"Start fresh" / "Research again" ignore checkpoints.

## Human gate
The wizard lists all Competitor nodes (crawl-found + researched);
keep/remove → `POST /api/v1/vani/competitors/confirm` stamps
`properties.confirmed=true` on kept nodes and DELETES removed ones
(edges cascade). Storyteller/campaign agents ground on confirmed nodes.

## Notes
- Does NOT emit `KNOWLEDGE_UPDATED` — competitors don't feed profile
  fields today, so no profile recalc is triggered.
- Token budget enforced per call by `llm.client` as everywhere else.
- Routes live in `vani-skill/vani.routes.ts` (the wizard's `/vani` surface):
  `POST /competitors/research` (dedupes active runs) and
  `GET /competitors/research-status` (latest run: status/steps/output/error).

## Account research (manufacturing pilot)

The same outward-research machinery pointed at a PROSPECT instead of a
competitor. `ACCOUNT_RESEARCH_REQUESTED` → `account.agent.ts` → one brief per
company in `gt_account_briefs` (migration 207).

Six stages per account, each a visible run step:
`fetch_site` → `crawl_pages` → `extract` → `fit_score` → `hook` → `write`.
Prompts are `research-skill.account_extract` / `.account_fit` / `.account_hook`
(migration 208), tenant-overridable like any other.

Event payload: `offer_catalogue` (required, a slug under `config/offers/`),
plus `tag_id` OR `prospect_ids`, optional `limit`, `is_live`, `resume_run_id`.

Three rules this agent will not break:

- **A half-written offer catalogue costs zero crawls.** It is validated before
  the first fetch, because fit scoring against a blank produces a confident
  number that then decides who gets contacted.
- **Every claim carries evidence.** The model must quote the page text it read
  from; an excerpt appearing on no page we fetched is dropped, visibly, in the
  `extract` step. An unreadable site becomes `status='unreadable'` with the
  real reason — never a guessed brief.
- **"No fit" is a first-class outcome.** Every offer is scored, disqualifiers
  are in the prompt, and an offer id absent from the catalogue is discarded as
  invented.

One run covers the whole cohort and checkpoints after every account, so a
crash at 60 of 100 keeps 59 briefs and a resume starts at 60.

## Functions

### get_offers
What this tenant sells, each with a readiness verdict, plus the exact list of what is still missing.
- Parameters: none
- Returns: { offers: [{ id, name, one_line, who_for, problem, what_we_do, signals, disqualifiers, price_band, proof, is_ready }], problems, ready, recipe: 'offer-list' }

### save_offer
Create or update one offer. A half-written offer is storable — the gate is at research time, not save time.
- Parameters: name (required, string), offer_key (optional, string), one_line (optional, string), who_for (optional, string), problem (optional, string), what_we_do (optional, array), signals (optional, array), disqualifiers (optional, array), price_band (optional, string), proof (optional, string)
- Returns: { offer_key, recipe: 'offer-card' }

### get_briefs
The research output as a queue of decisions. Stats cover the whole batch; rows cover the current filter.
- Parameters: status (optional, string), offer (optional, string), search (optional, string), page (optional, number), limit (optional, number), offset (optional, number)
- Returns: { briefs, total, page, limit, stats, recipe: 'brief-list' }

### decide_brief
A human's ruling on one brief. Ruling a company out requires a reason.
- Parameters: brief_id (required, number), decision (required, string), offer_key (optional, string), note (optional, string)
- Returns: { brief_id, decision, recipe: 'brief-card' }

### start_research
Queue the research batch for the worker. Validates the offers first, and reports the whole split — selected, reachable, already researched, to do — before anything runs. preview answers without queueing.
- Parameters: tag_id (optional, number), prospect_ids (optional, array), limit (optional, number), refresh (optional, boolean), preview (optional, boolean)
- Returns: { selected, reachable, no_website, already_researched, extraction_failed, no_address_answered, needs_rescore, to_research, queued, event_id, recipe: 'research-queued' }

### batch_status
Whether the last batch is queued, running, finished — or sitting in a queue nobody is reading because the worker is down.
- Parameters: none
- Returns: { verdict, message, healthy, done_count, requested, run_id, run_status, event_status, event_age_seconds, error, started_at, completed_at, recipe: 'batch-status' }
