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

### catalogue
Every role family Vara knows for this tenant's industry, each with its FULL starter shape — must-haves with weights and reasons, knockouts, threshold, titles — plus whether the tenant has already taken it. The shape ships with the list on purpose: a tenant choosing a family without seeing what is inside it is not choosing.
- Parameters: none
- Returns: { industry: string | null, domain: string | null, families: [{ pack_code, pack_version, name, hint, suggested_titles, starter, provenance: { researched, review_state, requested_by, at }, mine: boolean }], mine: number, reason?: 'NO_INDUSTRY', detail: string }

### take_families
Copy chosen families out of the platform catalogue into the tenant's own space — four rows each, one transaction: the pack binding, the role family, a scoring config at v1 carrying the pack's shape verbatim, and the family profile pointing at it. The tenant edits their copy; the industry pack is never touched.
- Parameters: codes (required, string[] — pack codes from `catalogue`)
- Returns: { taken: [{code, name, family_id}], already: [{code, name, family_id}], reason?: 'NO_CODES' | 'TOO_MANY' | 'NO_INDUSTRY' | 'TENANT_NOT_PROVISIONED' | 'UNKNOWN_PACK', detail: string }
- **Idempotent by construction**, not by a stored key: a family is unique on (tenant_id, name) and a second take reports it under `already` without writing. `SkillContext` carries no request headers, so there is no Idempotency-Key to honour here and none is needed.
- A code outside the caller's industry, or a retired pack, is refused for the whole batch rather than skipped — taking three of four and reporting success is how a tenant ends up missing a family they believe they have.

### update_family_shape
Change a family the tenant owns. Writes a NEW `vara_scoring_config` version and moves `active_config_id` to it — v1 stays readable, because a JD published in March was scored against the shape as it was in March and "why was this candidate rejected" is unanswerable if the contract was edited in place. The platform pack is never touched.
- Parameters: family_id (required, string), musthaves (required, [{name, weight, years?, why?}]), knockouts ([{label, rule}]), threshold (number, 0–100)
- Returns: { ok: boolean, family_id?, name?, version?, reason?: 'NO_FAMILY' | 'INVALID_SHAPE' | 'TENANT_NOT_PROVISIONED' | 'NOT_YOURS', detail: string }
- Refuses a shape with no must-haves: a family that scores nothing gives every candidate the same number, which is worse than no family because it looks like a judgement.
- `role_summary_hint`, `band_hint` and `from_pack` are carried forward rather than re-sent — the tenant is editing the scoring contract, not the pack's prose, and `from_pack` keeps "your v4 began as Software Development v2" answerable.

### my_families
The families in the tenant's own space, on the shape they are actually live on (`active_config_id`, not the highest version). This is the read that was missing: the layer has been written on every JD publish since August and read by nothing.
- Parameters: none
- Returns: { families: [{ family_id, name, hint, version, musthaves, knockouts, role_summary_hint, band_hint, threshold, axis_weights, from_pack: {code, version} | null, edited: boolean }], reason?: 'TENANT_NOT_PROVISIONED', detail: string }
- `from_pack: null` means the tenant built the family from scratch rather than taking it.

### match_title
"Senior Backend Engineer" to the starter shape Vara should open with, matched against the industry's packs. Deterministic, no model call — it runs while someone types. Returns matched:false rather than the nearest family when nothing clears the floor.
- Parameters: title (required, string)
- Returns: { matched: boolean, family_name?, matched_title?, score?, researched?, pack_code?, pack_version?, starter?, alternates?: [{family_name, matched_title, score}], reason?: 'NO_TITLE' | 'NO_INDUSTRY' | 'NO_PACKS' | 'NO_FAMILY_MATCH', detail: string }

### research_status
Where this tenant's industry stands, and where the role families came from. Separates the reasons a list is empty AND the case where it is full of Vikuna's generic starter packs — `seeded_only`, which no empty-state check can catch because the list is not empty.
- Parameters: none
- Returns: { state: 'no_industry' | 'ready' | 'seeded_only' | 'running' | 'in_review' | 'failed' | 'none', industry: string | null, domain: string | null, families: number, source: 'seeded' | 'researched' | 'mixed', unreviewed: number, researched_at: string | null, can_request: boolean, detail: string }
- `unreviewed` counts families published but not yet read by a human at Vikuna. Say so in the UI: a pack that is usable and a pack that has been checked are different things, and only the tenant can decide how much that matters to them. `in_review` is now only reachable by a run parked before 2026-09-17.

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
- **Promote or retire a pack.** A finished run publishes its own result,
  stamped `unreviewed`, so the tenant who asked gets it without waiting on
  anyone (changed 2026-09-17 — it used to park at `awaiting` for an operator,
  and run 92 sat there overnight). What a tenant cannot do is change a pack's
  review state: `--promote` and `--retire` need database access, because a
  pack is read by every tenant in the industry and the JWT's `is_admin` is a
  TENANT admin.

Pressing the button repeatedly is cheap and safe: the agent's claim answers
`pack-exists` or `in-progress` and the run completes as a no-op without
calling a model.
