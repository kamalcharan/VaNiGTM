# VaNi GTM Engine — Plan of Action

> v1.0 · 2026-05-13 · Execution plan for `PRD-VaNi-GTM.md`.
> Method per phase: **UX first (wow level, no compromise) → data modelling →
> skill building → stitching**. Every stage ends with a Definition of Done
> checklist, verified before the next stage starts (same discipline as
> Phases 0–3).

---

## Operating principles

1. **UX before schema.** For every module: pixel-final screens (extending
   `gtm-engine-ui` blueprints through the VDF system) are approved BEFORE
   tables are designed. The screen tells the schema what it needs — never
   the reverse.
2. **Data model before skills.** Migrations reviewed + applied manually
   (existing rule). No skill writes to a table that wasn't modelled for it.
3. **Skills before stitching.** Backend skill functions verified by direct
   API calls (Postman/DoD checks) before any frontend consumes them.
4. **Stitch = UI + skill + agent + events working end-to-end** with the
   human-approval gate in place. A module is DONE only when stitched.
5. **First time right.** No placeholder UI, no mock data in product code,
   no "refactor later."

---

## Phase 0 — Close-out + Legacy removal (KI-Prime / kewalinvest)

Prereqs before surgery:
- Core loop is proven (Storyteller E2E verified per HANDOVER; ICP builder +
  dashboard launchpad are in flight on `claude/phase-4-merge-main-d9tqnw` —
  land that branch first so cleanup doesn't collide with it).
- The locked scope (ICP + pitch generation, per HANDOVER) ships before this
  phase begins.

### Stage 0.1 — Baseline safety
- Merge open PR (#4). Tag `pre-cleanup` on main. Full DB backup of
  `vani_gtm_db`.

### Stage 0.2 — kewalinvest submodule removal
- `git submodule deinit kewalinvest; git rm kewalinvest; rm .gitmodules entry`
- CLAUDE.md: remove all kewalinvest/KI-Prime references (audit rules,
  MVP mapping table, repo description).
- DoD: clean clone builds with no submodule; no kewalinvest mention in
  CLAUDE.md or scripts.

### Stage 0.3 — Contact layer migration (the load-bearing change)
- UX check: contacts screens (mockup `contacts.html` + existing tabs) define
  the GTM contact shape (identity, role/title, company, channels, source
  provenance, score — NO financial snapshots).
- Data: new `gt_contacts` + `gt_contact_channels` migrations; data migration
  from ki_contacts for existing rows; provenance columns (source,
  external_ref, raw jsonb).
- Skills: contact-skill re-pointed to gt_ tables; drop snapshot/intake-token
  MFD functions.
- Stitch: contacts UI + campaign assignment green against gt_contacts.
- DoD: zero `ki_contact*` references in src; 3-check tests pass; campaign
  contact flows verified.

### Stage 0.4 — MFD skill + page removal (scope revised 2026-07-25)
Decision: etl-skill's generic import pipeline and pulse-skill are KEPT and
retargeted for GTM (prospect CSV import = M6 source 1; pulses = funnel
follow-ups + discovery/demo meeting workflow feeding the Conversion Agent).
- Remove: client-skill; etl-skill's MFD parts ONLY (scheme/NAV cruise
  control, corrections, customer→client import targets); alert/report/comms
  stubs; intake router; master-data MFD routes; frontend clients page
  (+ customers, done in 0.3); their nav entries.
- Retarget: etl-skill import types → 'prospect' (target gt_contacts);
  pulse-skill client_id references → contacts (BEFORE ki_clients drops).
- Keep tables: ki_import_sessions/staging/file_uploads + ki_pulse* — off the
  188 drop list; rename to gt_ in Phase 2 data modelling.
- DoD: `grep -r "ki_" backend/src` hits only the intentionally-kept import +
  pulse tables; tsc clean; all remaining pages load; nav has no dead links.

### Stage 0.5 — Schema sweep
- Migration dropping unused ki_ tables (after row-count + backup checks).
- Migration 185 (`gt_events` RLS disable) already codified on main — verify applied.
- DoD: information_schema shows vn_ + gt_ only (plus intentional keeps);
  app + worker run clean against swept DB.

## Phase 1 — UX Foundation (the wow pass)

The product's look is decided once, here, through the VDF system.

- 1.1 Design language: reconcile Neural Ops (gtm-engine-ui) with VDF —
  Neural Ops becomes a first-class theme; motion/glow/grid patterns become
  VDF utilities. No parallel design system.
- 1.2 Screen inventory, pixel-final (extending the 9 blueprints):
  mission onboarding, profile/ICP config (+ VaNi chat surface), knowledge
  base, research & competitors, digital audit report, campaigns suite,
  prospects pipeline + import + connector setup, sequence builder + story
  approval, war room, agent logs, analytics, settings.
  **Onboarding model:** the agent-led wizard in
  `documents/ux-references/agent-wizard-flow.pdf` (internal reference —
  patterns only, synthetic data, see its README). Agent produces → human
  confirms; accumulating left-rail mission memory; enrichment waterfall UI.
- 1.3 VDF gap build: components the screens need (flow canvas, approval
  cards, audit score rings, visibility matrix, pipeline kanban, live feed,
  wizard step rail, enrichment waterfall chips).
- 1.4 Landing explainer video: 8–10s muted autoplay loop of the wizard flow
  with synthetic data (spec in `documents/ux-references/README.md`) —
  recorded from the rebuilt wizard against a seeded synthetic tenant.
- DoD: every screen exists as an approved design (static or Storybook-style
  page) using only VDF + theme tokens; user sign-off = "wow".

## Phase 2 — Data modelling (whole-product pass)

One coherent modelling pass over every module (screens now dictate needs):

- gt_contacts (done in 0.3) · prospect staging · universal connector registry
  (provider, base_url, auth method, mapping template, tenant credentials)
- story artifacts (campaign × persona × stage, versioned, approval state)
- audit: runs, lens scores, recommendations, AEO target queries + visibility
  history · analytics connections
- creative assets · orchestrator locks (one active agent per prospect)
- Review pass: every table tenant-scoped, RLS where tenant-data,
  environment-scoped where transactional, sequence numbers tenant-scoped.
- DoD: full ERD documented; migrations 187+ (186 = gt_storyteller, taken)
  written, reviewed, applied to
  dev DB; 3-check tests for every new table's access layer.

## Phase 3 — Skill building (per-module, in dependency order)

Each skill: SKILL.md contract → queries/ SQL → functions → DoD API checks.

1. profile-skill v2 — website crawler + KNOWLEDGE_UPDATED → profile re-map
   (closes PRD M1/M2 gaps)
2. research-skill — market research + competitor discovery (search API
   decision resolved at start)
3. audit-skill — crawl infra + 5 lenses (SEO, AEO, website, CRO, journey);
   weekly AEO cron
4. prospect-skill — staging intake (CSV first), universal connector, scoring
   agent vs personas
5. story-skill v2 — extend built storyteller (deck v1 exists: build/approve/
   share/Q&A) to campaign×persona×stage artifacts + template population
6. outreach executor — worker step scheduler, render+send via channels,
   reply hooks, Orchestrator locks, sender hygiene
7. feedback-skill — weekly digest from analytics + audits
8. creative-skill — image generation (FLUX/Ideogram) off story briefs (last)

- DoD per skill: contract documented, all functions pass direct-API checks,
  3-check tests, worker events verified, token usage recorded.

## Phase 4 — Stitching (product assembly)

Module by module, in user-journey order:

1. Onboarding mission flow → profile (conversation + upload + crawl) →
   approval → PROFILE_COMPLETE
2. Research + audit surfaces live on the dashboard
3. Campaign creation → personas drafted from profile → sequences populated
   by approved stories
4. Prospect import → scoring → pipeline → assignment
5. Launch → outreach executes → war room live → analytics + feedback digest
- E2E acceptance: a brand-new tenant goes register → approved profile →
  audited site → launched campaign → first sends → analytics, entirely
  through the UI, with every approval gate exercised.
- DoD: the full loop runs for a real tenant (ContractNest as tenant #1);
  demo-able end-to-end without Postman.

## Phase 5 — Hardening & polish

- **RLS cutover (REQUIRED pre-production):** switch runtime role from
  `vikuna_admin` (BYPASSRLS — RLS currently dormant) to least-privilege
  `vanigtm_app` per `scripts/grant-vanigtm-app.sql` +
  `docs/rls-cutover-checklist.md`, incl. the SECURITY DEFINER
  `get_shared_deck(token)` fix for the public deck share route.
- Per-agent model tiers tuned (fast vs quality); prompt A/B on gt_prompts.
- Rate limits, quotas, connector abuse guards, sender warm-up schedules.
- Observability pass: agent-runs UX, error surfacing, AGENT_FAILED alerting.
- Performance: dashboard latency, worker throughput, crawl politeness.
- Remove diagnostic logs; docs refresh (CLAUDE.md reflects GTM-only repo).

---

## Sequencing summary

```
Phase 3 E2E close-out (current HANDOVER)
   └→ Phase 0  Legacy removal            ← unblocks clean naming + schema
       └→ Phase 1  UX foundation         ← the wow pass, decides everything visual
           └→ Phase 2  Data modelling    ← screens dictate schema
               └→ Phase 3  Skills        ← in dependency order 1→8
                   └→ Phase 4  Stitching ← journey order, E2E acceptance
                       └→ Phase 5  Hardening
```

## Standing decisions (do not relitigate)

- Universal BYO connector (provider-agnostic; Apollo preset first).
- Prospect sources ship upload → BYO → platform credits.
- Digital Audit is one module with five lenses over one crawl infra.
- Neural Ops = a VDF theme, not a second design system.
- Per-agent model selection; small strict models for mechanical tasks.
- Every externally visible action has a human approval gate in v1.
