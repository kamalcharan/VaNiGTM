---
name: assessment-skill
version: 0.1.0
description: VaNi AI public assessment platform — scored assessment, lead capture, console lead management
tier: starter
default_recipe: lead-list
---

# Assessment Skill

## Purpose
Backend for VaNi AI (vikuna.io/vani), a separate product from this GTM
engine that reuses this backend's auth/db-layer infrastructure rather than
standing up its own (Charan, 2026-07-31). Config-driven assessment engine —
scored assessment -> teaser -> email capture -> tokenized report ->
owner/partner console. A second assessment is one new `gt_assessment_def`
row; nothing here hardcodes a specific instrument's questions or failure
modes (see `scoring.ts`).

Tables: `gt_assessment_def`, `gt_assessment_response`, `gt_lead`, `gt_report`,
`gt_lead_event`, `gt_partner` (migration 228).

## Two halves, two access models

**Anonymous (assessment-taking):** `assessment.routes.ts`, mounted directly
in `server.ts` at `/api/v1/assessment`, NOT through the functions below.
There is no JWT for an anonymous respondent — `GET /:slug`, `POST /answer`,
`POST /complete`, `POST /capture`, `GET /report/:token`. See that file's
header comment; mirrors `storyteller.routes.ts`'s public `/share/:token`
pattern.

**Authenticated (console)** — the functions below, via the normal
`POST /api/v1/skills/assessment-skill/:fn` executor + JWT. Role (owner sees
everything in the tenant; partner sees only their own leads) is resolved
from `gt_partner` by `ctx.user_id` (`partner-context.ts`), NOT from
`vn_roles`/`vn_user_roles` — VaNi AI owns this mapping itself rather than
coupling to the GTM RBAC system, which models a different thing.

## Functions

### get_leads
Console lead list, scoped to the caller (partner: own leads only; owner: all).
- Parameters: status? (string), limit? (number, default 50, max 200), offset? (number, default 0)
- Returns: { leads: [{ id, lead_no, name, email, company, role_title, status, partner_name, response_id, health_score, band, created_at, updated_at }], total, recipe: 'lead-list' }

### get_lead
Single lead with its assessment response (answers, score) and event timeline.
- Parameters: lead_id (required, string)
- Returns: { lead: {...}, timeline: [{ event_type, payload, created_by, created_at }], recipe: 'lead-detail' }

### update_lead_status
Moves a lead through the pipeline. Logs the transition to the timeline.
- Parameters: lead_id (required, string), status (required, string: 'new' | 'contacted' | 'l2_booked' | 'engaged' | 'closed_won' | 'closed_lost')
- Returns: { lead: { id, status }, recipe: 'confirmation' }

### get_partners
Owner-only. Referral partners with lead counts, plus the published assessments their links can point at (so the console builds /a/<slug>?ref=<code> without hardcoding a slug).
- Parameters: none
- Returns: { partners: [{ id, ref_code, display_name, email, is_active, lead_count, last_lead_at, created_at }], assessments: [{ service_slug, short_title }], recipe: 'partner-list' }
- Refuses a partner caller outright (OWNER_ONLY) — a partner has one link and none of anyone else's.

### add_lead_note
Free-text timeline note. Ownership (partner can only note their own leads) is enforced inside the SQL, not just the application layer.
- Parameters: lead_id (required, string), text (required, string)
- Returns: { note_id, created_at, recipe: 'confirmation' }

## Not in this pass (deliberately)
- LLM narrative generation and email dispatch — Phase B, per Agent Topology
  v1.1 §5/§12 ("template fallback always"; report generation runs in-process
  for v1, agent-shaped for later registration on the event bus). `capture_lead`
  DOES synchronously write `gt_report` with the definition's template
  FALLBACK narrative (no LLM call) — see `narrative.ts` and Task A1's local
  end-to-end proof.
- Partner CRUD (creating/deactivating `gt_partner` rows) — manage directly
  via SQL until console UI need justifies a function for it.
- The `ai-recovery` assessment definition is not seeded by this migration —
  see `vikunawebsite` repo's `docs/vani-ai-recovery-assessment-definition.json`
  for the verbatim instrument to insert into `gt_assessment_def.definition`.
