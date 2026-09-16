---
name: domain-pack-skill
version: 1.0.0
description: Industry role-family packs — ask Vara to research your industry, and see how that research is going.
tier: starter
default_recipe: vara
---

# Domain Pack Skill

## Purpose

The tenant-facing half of domain enrichment. The research itself is
`domain-pack.agent.ts`, dispatched from the event bus; publication is an
operator action in `publish.ts`. These two functions are what the console
needs so a tenant is never stuck.

## Why a tenant can trigger this at all

Enrichment fires automatically when `business_profile` completes. That covers
exactly one moment. It does NOT cover:

- a tenant who onboarded before this shipped,
- a tenant who changed their industry afterwards,
- a run that failed — an LLM outage, a model that would not produce valid
  JSON, a worker restart mid-research.

Without a retry the tenant's only recourse is to contact us, and the screen
would say "no recommendations" forever with no way forward. That is the shape
rule 9b exists to prevent: an empty state must carry a next action.

Rule 12 governs the retry itself — it is an **explicit user-chosen** path
offered AFTER a visible failure with the real diagnosis, not an automatic
fallback. `research_status` supplies the diagnosis; `request_research` is the
action; neither ever substitutes generic content for real content.

## Functions

### research_status
Where this tenant's industry stands, and where the role families came from. Separates the reasons a list is empty AND the case where it is full of Vikuna's generic starter packs — `seeded_only`, which no empty-state check can catch because the list is not empty.
- Parameters: none
- Returns: { state: 'no_industry' | 'ready' | 'seeded_only' | 'running' | 'in_review' | 'failed' | 'none', industry: string | null, domain: string | null, families: number, source: 'seeded' | 'researched' | 'mixed', researched_at: string | null, can_request: boolean, detail: string }

### request_research
Queue enrichment for the caller's own industry. Safe to press repeatedly — the agent's claim answers pack-exists or in-progress and completes as a no-op without calling a model. Never accepts an industry or a force flag from the caller.
- Parameters: none
- Returns: { queued: boolean, industry?: string, domain?: string, event_id?: string, reason?: 'NO_INDUSTRY' | 'UNUSABLE_INDUSTRY', detail: string }

## What a tenant cannot do

- **Research another tenant's industry.** The industry is read from
  `vn_tenant_profiles` using the JWT's tenant_id, never from params.
- **Force a re-research.** `force` skips the "packs already exist" guard and
  is operator-only (`npm run packs -- --research <id> --force`). A pack is
  shared by every tenant in the industry, so letting one tenant re-roll it
  repeatedly would spend platform tokens and churn an artefact their
  competitors read.
- **Publish anything.** Research produces a draft; a human publishes it.

Pressing the button repeatedly is cheap and safe: the agent's claim answers
`pack-exists` or `in-progress` and the run completes as a no-op without
calling a model.
