# Vara — onboarding design v1

**Date:** 2026-08-17
**Status:** Design settled with Charan, no code yet.
**Companion:** `vara-specification.html` §4 (Flow D1 · activation lane), `vara-readiness-review.md`.

Purpose: capture what Vara onboarding is *actually going to be*, given the
conversation on 2026-08-17. Supersedes the checklist-of-forms sketch that
preceded it — kept here only as a footnote.

---

## The shape — not a form, a proposal loop

Onboarding is the **activation lane** the spec describes (Flow D1), but built
as a **proposal loop** rather than a form-filling checklist. The tenant does
not declare weights, thresholds, or knockout rules from scratch — Vara
proposes them from what it already knows, and the tenant confirms or tunes.
Same shape as Smart Profile itself (ingest → understand → propose → confirm).

| # | Phase | Ownership | What happens |
|---|---|---|---|
| 1 | **Inherit** | system (silent) | Read Smart Profile: industry, ICP, brand, tone, domain, people |
| 2 | **Ingest** | tenant supplies | Upload historical JDs — the training set the recommender reads |
| 3 | **Understand** | background job | Extract role families, patterns, tone → grow the per-tenant KG |
| 4 | **Recommend** | tiered resolver | Propose a playbook (weights, thresholds, JD template, comms tone) with evidence |
| 5 | **Confirm & tune** | tenant decides | Accept or edit family-by-family; consent + retention set here |
| 6 | **Go live** | system | Subscription flips `activating → live` |

Anywhere the tenant can act, they can also skip and adopt Vara's defaults.
Anywhere Vara proposes, it names its **tier** and **confidence** — the
recommender is never a black box.

---

## The recommender — a tiered resolver, not one LLM call

The engine that reshapes onboarding. Three tiers, deterministic first, LLM
last, so the system is demo-ready before the LLM path is reliable.

```
Input: (tenant industry from Smart Profile, role family the tenant is hiring for)

  ┌── Tier 1 · Direct match ─────────────────────────────────────┐
  │  Registry has a published playbook for (mining, PM)?         │
  │  → YES: propose it. Confidence: high. No LLM.                │
  └──────────────────────────────────────────────────────────────┘
                 ↓ no
  ┌── Tier 2 · Industry proximity ───────────────────────────────┐
  │  Same role family, adjacent industry (construction × PM,     │
  │  heavy manufacturing × PM). Adjacencies live inside the      │
  │  industry catalog.                                            │
  │  → propose closest, cite the neighbour as evidence.          │
  │  Confidence: medium. Still no LLM.                            │
  └──────────────────────────────────────────────────────────────┘
                 ↓ nothing near
  ┌── Tier 3 · LLM synthesis (high risk, last) ──────────────────┐
  │  Compose from first principles.                              │
  │  Confidence: low. Extra human review required.               │
  │  Marked synthesized; NOT auto-promoted to registry.          │
  └──────────────────────────────────────────────────────────────┘
```

Every tier produces the same shape (a playbook proposal) with its tier and
confidence stamped. The tenant sees:

- Tier 1 → *"Recommended from mining × project manager (verified with 12 previous tenants)"*
- Tier 2 → *"Nearest match: construction × PM (adjust as needed)"*
- Tier 3 → *"Synthesized — please review carefully"*

---

## The registry — extended `vani_domain_pack`, no new schema

The spec already defined `vani_domain_pack` as platform-level, versioned,
JSONB-payloaded, per-agent-namespaced. That is exactly the shape a playbook
registry needs. **No new tables.**

Structure, industry-first (per Charan's answer 2):

```
Industry (mining)
  ├── adjacent_to: [construction, heavy_manufacturing]
  └── RoleFamily (project_manager)
        └── Playbook v1  (published, tier: 'human_curated')
            ├── axis_weights   { skill: 55, avail: 20, exp: 25 }
            ├── default_threshold  30
            ├── knockout_templates [...]
            ├── question_bank     [...]
            ├── jd_template        {...}
            └── comms_tone         'formal / safety-first'
```

Each playbook carries a **source tag**: `human_curated`, `promoted_from_llm`,
or `derived`. Consumers see it; the tenant knows what they are adopting.

**Versioning** — matches `vara_scoring_config`: append-only, `v1 → v2` when
improved. A tenant's active `vara_scoring_config` records which playbook
version seeded it, so a later playbook improvement does not silently rewrite
what the tenant approved.

---

## The KG — global catalog + per-tenant projection

Two roles, two homes, both already exist:

- **Global catalog** (industry × role_family × skills, plus adjacencies):
  lives in `vani_domain_pack` payloads. Platform-owned, no tenant column.
- **Per-tenant KG**: `gt_kg_nodes` / `gt_kg_edges` (already present,
  tenant-scoped with RLS — verified in the readiness review).

On onboarding:

1. The chosen playbook's nodes are **cloned into** the tenant's KG (Industry,
   RoleFamily, Skills, Signals, Tone).
2. Historical JD uploads add tenant-specific nodes (their own terms, weight
   patterns, phrasing).
3. Calibration signals over time refine edges — the tenant's KG *learns*
   which skills predict fit for them.

The KG is what makes the recommender's Tier 2 possible (proximity queries),
and what future features (silver-medalist resurfacing, JD Studio autocomplete)
read from.

---

## The playbook agent — a Vikuna-operator surface, LLM-assisted

Per Charan's answer 1, playbooks are curated **by user, with LLM help** (a
"playbook agent"). This is not a tenant-facing surface — it is P5 (Vikuna
operator) work. Sits under a Vikuna-internal admin route (proposed:
`/agents/vara/playbooks`, gated to admins).

Two entry points:

- **Author from scratch** — form editor over the playbook shape.
- **Author with LLM help** — prompt: *"Draft a playbook for mining × project
  manager, safety-first, senior IC"* → LLM drafts, operator edits, publishes.

Because this is Vikuna's own tool, it uses Vikuna's LLM key, not tenant BYOK.
No dependency on the fragile BYOK encryption path.

**Promotion** (per Charan's answer 3): a Tier-3 synthesized playbook that a
tenant approved sits marked as such until a Vikuna operator explicitly
promotes it to a real registry entry. No automation, no drift.

---

## What data flows from Smart Profile (answer to Charan's #1)

Read from Smart Profile, no re-asking:

| Smart Profile field | Used by |
|---|---|
| Industry (from `business_profile`) | Registry lookup key |
| Company name, website | Tenant name in tenant-scoped surfaces, embed banner |
| Brand voice / tone | Comms template seed |
| ICP language, competitor set | Recommender's tone signals |
| Domain (`vani_tenant_domain`) | Already the bridge; unchanged |
| People (`/auth/team`) | Pre-populated for TA/HM/approver role assignment |

Onboarding sees these on mount; the tenant sees them as *already-answered*
lines they can edit if wrong, not fields they must fill.

---

## Dependencies — what must exist for this to work

Named honestly so we do not build blind. Each has a status.

| Dependency | State today | Slice that unblocks it |
|---|---|---|
| Registry playbooks (≥3 hand-seeded) | none | v1 seed |
| Historical JD ingest adapter | ingestion pipeline exists; no JD extractor | v2 |
| Per-tenant KG population | tables exist, unused | v2 |
| LLM path for Tier 3 | fragile (vocabulary step fails) | later |
| Playbook agent (P5 surface) | not built | later |
| Careers page fetch (JS-heavy sites) | needs headless browser | deferred |
| BYOK LLM encryption | `credentials_enc` unimplemented | own workstream |

**Nothing here needs a schema change.**

---

## Slice plan — strip to Tier 1 for v1

The critical realisation: **the demo-ready path only needs Tier 1**. Just
seed 3 playbooks and the whole onboarding loop works without LLM, without
ingest, without the KG being populated. Everything else is compounding value
on top.

### v1 — Registry seed + Tier-1 recommend + confirm-only UI

**Ships:** onboarding that recommends and lands `activating → live`, deterministic end to end.

- Seed 3 playbooks into `vani_domain_pack`: pick 3 realistic (industry × role_family) pairs from Charan
- Read Smart Profile industry
- New Vara-lane step: *"What role family will you hire for?"* — dropdown from the seeded 3 (or "other" → falls through to a manual skeleton form)
- Tier-1 lookup → render the playbook proposal on one page with per-family edit
- Confirm → writes `vara_family_profile` and `vara_scoring_config v1` (uses the state guard the readiness review added)
- Consent text + retention on the same page (defaults from spec: DPDP notice, 12 months)
- Approve → subscription flips `activating → live`, `vani_audit_log` records who and when

**Uses:** `OnboardingRunner` on a new `vara` lane (per settled decision).
**No LLM.** **No ingest.** **No new tables.**

### v2 — JD ingest + KG population + Tier-2 fallback

**Ships:** onboarding that adapts to tenants whose (industry × family) is not in the seed.

- Add "job description" as an artifact kind in the ingestion pipeline
- Historical JD upload step in the Vara lane (drag N docx/pdf)
- Background extractor writes into `gt_kg_nodes` for that tenant
- Industry adjacencies added to the registry payload
- Tier-2 proximity lookup implemented
- Tier 2 proposals cite the neighbour

### v3 — Playbook agent (P5 surface)

**Ships:** the tool for Vikuna operators to grow the registry.

- `/agents/vara/playbooks` route, admin-gated
- Author form, versioned publishes
- LLM-assisted drafting using Vikuna's key
- Promotion path for Tier-3 tenant playbooks

### v4 — Tier-3 LLM synthesis in tenant onboarding

Only after the BYOK path is real. Not before.

### Explicitly out of scope for onboarding

- MSG91 WhatsApp templates — needs the ContractNest adapter port (own workstream)
- BYOK LLM encryption — own workstream
- Domain pack authoring (the general one, beyond Vara playbooks) — own workstream
- Careers page fetch, LinkedIn ingest — deferred to a later slice, if at all

---

## What "activating" looks like in the console while onboarding is incomplete

The landing page already shows CODE ACCEPTED. When a tenant is `activating`
but has not yet finished the loop, the landing page adds a **continue-setup
card** that deep-links into the current phase of the Vara lane. The
tiered-resolver's proposal is preserved between visits (stored on
`vani_tenant_agent.metadata` JSONB — no schema).

No new URL for "onboarding" — same pattern as Smart Profile → `/onboarding`
already established.

---

## Settled decisions, in one place

- Onboarding shape: **proposal loop** (ingest → understand → propose → confirm), not form-filling
- Engine: **`OnboardingRunner` reused** on a new `vara` lane
- Registry: **extend `vani_domain_pack`**, no new schema
- Registry structure: **industry-first**, role family beneath, adjacencies inside the industry catalog
- Recommender: **tiered resolver** — registry match → industry proximity → LLM last
- Playbooks curated: **by user, with LLM help** (playbook agent, Vikuna-operator surface)
- Tier-3 → registry promotion: **user-invoked only**, never automatic
- Manual fallback: **skeleton family + default weights** when Tier 1/2 miss and LLM is unavailable
- v1 ingest scope: **historical JD uploads only** — no careers page or LinkedIn
- v1 build order: **Tier 1 only** — 3 seed playbooks, no LLM, no ingest, no KG

---

## Superseded — the checklist-of-forms sketch (for the record)

An earlier draft proposed 5 tiny slices — consent, family+profile,
TA-assignment, comms, gate. It made the mistake this design corrects: it
treated onboarding as *asking questions* rather than *proposing answers*.
The tenant has already told Smart Profile most of it; asking again is the
opposite of "we know the background".

The consent, TA-assignment and family-profile writes are still in the flow —
they just happen inside phase 5 (Confirm & tune), on one page alongside the
recommended playbook, not as five separate sub-pages the tenant must click
through.
