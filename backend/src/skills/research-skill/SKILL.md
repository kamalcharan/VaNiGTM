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
