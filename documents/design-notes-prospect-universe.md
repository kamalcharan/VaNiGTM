# Design notes — Prospect Universe (POA Phase 2 slice)

**Status:** proposal for review. No SQL written. Migrations 193+ are listed
here but not authored — per CLAUDE.md schema changes are discussed first.

**Date:** 2026-07-27 · **Highest applied migration:** 192

---

## 1. Where this lives (user ruling, 2026-07-27)

**Onboarding ends at step 3.** The tenant approves their company profile,
their competitor set, and their ideal customer — including the industries
they sell to — and that is setup complete. **Prospect discovery, campaigns
and everything downstream happen inside the product**, not in the wizard.

So this slice is *not* an onboarding feature. The wizard's job is to produce
a profile good enough to match against; the universe is what mission control
matches it to. Nothing in the model below changes as a result — the schema is
the same, it is the surface that moves.

Consequence for the wizard: the Storytelling / Campaigns / Follow-ups entries
come out of the step rail. They are destinations that unlock in mission
control, and listing them as steps implies a wizard that never finishes.

### 1.1 Two phases — the first one is much smaller than this document

User ruling, same day: *"we will show global data — like FTCCI, but that
won't create a campaign, it will only create a CRO push. Once that's in
place, we go for real prospecting."*

**Phase A — market evidence + conversion push.** The universe is shown
**read-only**: here is your market, this many companies in your industries.
It is a conversion lever aimed at the tenant, not an outreach campaign aimed
at buyers. Nothing is adopted, nothing is contacted.

Needs only: `gt_data_sources` (193), `gt_universe_company_sources` (194),
`gt_universe_companies` + aliases (195), industry taxonomy (199).
**Four migrations.**

Deferred entirely: `gt_universe_contacts` (196) — so the DPDP question in
§4.5 does not have to be answered yet, because Phase A ships **companies
only**. Also deferred: `gt_prospects` (197), `gt_connectors` (198), staging
quality columns (200).

**Phase B — real prospecting.** Adoption into a tenant working set, contacts,
Apollo, campaigns. Everything else in this document.

### 1.2 Coverage honesty is a Phase A requirement, not a polish item

FTCCI is a Telangana chamber directory: **87% of its 2,913 members are
Hyderabad or Secunderabad** (2,541 rows), 2,840 of 2,913 PINs start with
`50`, and the file is dated Oct 2023.

That is a strong hook for a Hyderabad-region tenant and close to worthless
for anyone else. So the push is **gated on the tenant's actual matched
count**, and every surface carries provenance — "FTCCI directory · Telangana
· Oct 2023". Showing a headline count to a tenant selling into US SaaS would
be worse than showing nothing, and it is precisely the kind of impressive-
looking emptiness rule 12 exists to prevent.

### Explicitly out of scope
- **No web-search buyer discovery** (user ruling, 2026-07-27): "we are not
  there yet — we will only work on available data for now." Prospects come
  from the platform universe and from BYO/upload. Nothing is sourced by
  crawling.
- **No audit / AEO schema** (user ruling): out of scope for onboarding.
- No scoring-agent v2, no outreach, no creative.

---

## 2. What the real data forced

Two files were profiled before any modelling (`Company_prospect_2.csv`,
`FTCCI_member_data_26.10.2023.xlsx`). Findings that changed the design:

| Finding | Consequence |
|---|---|
| FTCCI `PANEL + Panel No` is unique across all 2,913 rows | Sources ship stable record ids — upsert keys on them |
| FTCCI `WEB` populated on only **54%** of rows | Domain cannot be the sole identity key |
| 1,590 rows carry a domain but only **1,559 are distinct** — 31 share a website | Dedup on domain alone would merge distinct businesses (group companies, divisions) |
| Normalised company name collapses only 5 of 2,913 rows | Name normalisation is a viable fallback and blocking key |
| CSV `Company revenue` is 100% "populated" but **60 of 119 are the string `undefined+`** | Fill-rate is not quality; validity must be scored separately |
| CSV `Company number of employees` contains **`Nov-50` 34 times** (spreadsheet ate `11-50`) | Import must reject/repair loudly, not store and score |
| FTCCI is dated **Oct 2023 — 33 months stale** | Freshness is a first-class quality component and must be surfaced on the row |
| CSV is contact-first (119 people / 95 domains); FTCCI is company-first with 3 reps inline (~5,800 contacts) | Two entities: companies and contacts-at-companies |

---

## 3. Shape: source records are immutable, the golden record is derived

Every source keeps its own row. The merged ("golden") company is computed
from those rows.

```
gt_data_sources ──< gt_universe_company_sources >── gt_universe_companies
                                                       │      │
                              gt_universe_company_aliases      └──< gt_universe_contacts
                                                       │
                                              gt_prospects (tenant)
                                                       │
                                                  gt_contacts (tenant, exists)
```

**Why not merge-on-write into a single table.** The quality rules *will*
change as Apollo lands and we learn which sources to trust. With source rows
retained, the merge is re-run. With merge-on-write, the losing value is gone
and the only recovery is re-ingesting every source.

**Field-level merge, not record-level.** "Better quality record wins" has two
readings, and they diverge on exactly this data: an FTCCI member with a good
local phone and address but no domain, later matched by Apollo which has
domain, employees and LinkedIn but no India landline. Record-level loses the
phone. Field-level keeps both. Since FTCCI is weakest precisely where Apollo
is strongest, field-level is the only version that improves over time the way
intended.

---

## 4. Tables

### 4.1 `gt_data_sources` (migration 193)
The source registry and trust config. Not tenant-scoped.

| Column | Notes |
|---|---|
| `id` | surrogate |
| `code` | `'ftcci'`, `'apollo'`, `'upload'` — the mark on every record |
| `name`, `kind` | `directory` / `provider` / `upload` |
| `tier` | SMALLINT trust weight, **configurable** — provider data outranks directory data by config, never by hardcoded rule |
| `default_as_of` | fallback when a load carries no date |
| `is_active` | |

Tier lives in a table so re-tuning trust is an UPDATE plus a re-merge, not a
deploy.

### 4.2 `gt_universe_company_sources` (migration 194)
One immutable row per (source, source record). Never merged, never
overwritten by another source.

| Column | Notes |
|---|---|
| `source_id` → `gt_data_sources` | |
| `source_record_id` | FTCCI `'A-3'`; Apollo's id; for sources with no stable id, a hash of the normalised row |
| `company_id` → `gt_universe_companies` | resolved identity, nullable until resolution runs |
| normalised fields | `name`, `domain_normalized`, `website`, `email`, `phone`, `address_*`, `pin`, `city`, `state`, `country`, `industry_raw`, `employees_band`, `revenue_band`, `linkedin_url`, `year_founded`, `description` |
| `raw` JSONB | the untouched source row — audit and re-parse |
| `source_as_of` DATE | Oct 2023 for this FTCCI load |
| `completeness`, `validity` NUMERIC(4,3) | computed at ingest |
| `field_quality` JSONB | per-field score — what the merge actually reads |
| `blocking_key` | `domain_normalized`, else `name_key\|pin` |
| `ingested_at`, `updated_at` | |

**Upsert key: `(source_id, source_record_id)`.** Re-ingesting the same file is
idempotent by construction; a changed row updates in place, recomputes
quality, and marks its golden record for re-merge.

### 4.3 `gt_universe_companies` (migration 195)
The golden record. One row per resolved company.

Same business fields as above, plus `field_sources JSONB` recording which
source won each field, `quality_score` (rolled up), `source_codes TEXT[]`
(every source that contributed — so a row can be shown as "FTCCI · Apollo"),
`best_as_of`, `merged_into_id` (NULL unless superseded), `needs_review`.

### 4.4 `gt_universe_company_aliases` (migration 195)
`(alias_company_id, company_id)`. When a later source reveals two golden
records are one company, the loser is not deleted — it gets `merged_into_id`
and an alias row, so already-adopted tenant prospects keep resolving instead
of orphaning. Cheap now, painful to retrofit.

### 4.5 `gt_universe_contacts` (migration 196)
FTCCI's ~5,800 reps have to live somewhere. Structure mirrors the company
source pattern (per-source rows, resolved to a person).

**Carries `exposure`** — `'restricted'` (default) or `'shared'`. Restricted
contacts are stored and searchable by the platform but **not served to
tenants**.

> ⚠️ **Open legal decision.** Company records in a shared pool are ordinary.
> A shared pool of **named individuals with personal mobile numbers** served
> to every tenant is materially different under India's DPDP Act, and GDPR
> for any EU records. Recommended default: universe holds **companies**;
> personal contact details stay tenant-scoped, arriving via BYO or via
> enrichment the tenant triggers. The `exposure` column implements whichever
> way this is decided without a schema change.

### 4.6 `gt_prospects` (migration 197)
The tenant's working set. Tenant-scoped and environment-scoped.

`tenant_id` NOT NULL · `is_live` · `universe_company_id` (NULL for pure
uploads) · the company fields **copied at adoption** · `source` (`'universe'`
/ `'upload'` / `'byo:<provider>'`) · `status` · `score` · `score_reasons`
JSONB · `adopted_at` · `universe_version_at_adoption`.

**Adoption copies, it does not reference.** A universe refresh must never
silently change what a tenant is working on mid-campaign. Improvements
surface as an offer to refresh, with a visible diff — never as a mutation
under them.

### 4.7 `gt_contacts.prospect_id` (migration 197)
`gt_contacts` already carries the connector contract: `source` documented as
`'manual' | 'upload' | 'byo:<provider>' | 'platform:<provider>' | 'converted'`,
plus `external_ref`, `raw` JSONB and `score`. It needs **one nullable FK** to
`gt_prospects`. No parallel person model.

### 4.8 `gt_connectors` (migration 198)
The POA's universal connector registry, modelled now because it is coupled to
provenance: `provider`, `base_url`, `auth_method`, `credentials_ref` (secret
stored outside the DB per CLAUDE.md rule 11), `mapping_template` JSONB,
`tenant_id` (NULL = platform-level connector such as the Apollo feed),
`is_active`.

The `mapping_template` is the same concept the etl mapper already uses — "these
33 CSV columns map to our fields" — so BYO upload and provider sync share one
mechanism.

### 4.9 Industry taxonomy (migration 199) — required by "mark industries"

Onboarding must capture the industries the tenant sells to, so mission
control can filter the universe by them. That cannot be free text on either
side. The two real files show why:

| Source | Values | Distinct | Shape |
|---|---|---|---|
| FTCCI `BUSINESS` | 2,825 | **2,170** (2,071 singletons) | prose — and inconsistent with itself: `Manufacturers` ×213 vs `Manufacturer` ×71, `Chartered Accountants` ×39 vs `Chartered Accountant` ×28 |
| CSV `Company industry` | 110 | **35** | a real controlled vocabulary — `IT Services and IT Consulting`, `Software Development`, `Banking` |

Directory data ships prose; provider data ships a taxonomy. Joining a
tenant's industries to universe companies on strings would match almost
nothing on the FTCCI side.

- **`gt_industries`** — canonical taxonomy, seeded from the provider
  vocabulary (the CSV's 35 values are a recognisable standard list), with
  `parent_id` for grouping.
- **`gt_industry_aliases`** — `(source_id, raw_value) → industry_id` with a
  `confidence` and `mapped_by` (`rule` / `llm` / `human`). FTCCI's 2,170
  strings map here; Apollo's are near 1:1.
- **`gt_tenant_target_industries`** — tenant × industry. Today the profile
  carries `icp_industry VARCHAR(200)` (`184_gt_tenant_profile.sql:42`) —
  singular and free text. That column stays as the drafted prose; the
  ratified selection lives here.

**Unmapped is visible, never silently dropped.** With 73% of FTCCI's industry
strings appearing once, a meaningful tail will not map. Those companies must
be reported as *unmapped* rather than quietly excluded from matching — a
filter that silently omits stock is the failure mode rule 12 exists for.

### 4.10 etl staging quality columns (migration 200)
`ki_import_staging` gains per-row `validity`, `reject_reasons JSONB`. This is
what turns `etl.routes.ts:338`'s `501` into a real landing step.

---

## 5. Quality model

Stored as components, never as a single opaque number:

- **`source_tier`** — from `gt_data_sources`, configurable
- **`freshness`** — banded decay on `source_as_of` (≤6mo 1.0 · ≤18mo 0.8 ·
  ≤36mo 0.6 · older 0.4). FTCCI at 33 months scores 0.6 today and decays.
- **`completeness`** — share of tracked fields populated
- **`validity`** — share of populated fields passing validation

`undefined+` and `Nov-50` fail validation, score ~0 on those fields, and are
overwritten the moment any source supplies a real value. That behaviour falls
out of the model — no special-casing.

### Merge rule (per field)
```
field_score = field_validity × source_tier_weight × freshness_weight
```
Highest wins. Ties break on `source_as_of` desc, then tier desc, then
`source_id` asc — deterministic, so a re-merge is reproducible.

---

## 6. Identity resolution

Not a single deterministic key — the data does not support one.

1. **Block** on `blocking_key`: `domain_normalized` when present, else
   `name_key + pin`.
2. **Resolve within the block** on normalised-name similarity. Above the
   threshold → same golden record. Below → distinct golden records that
   happen to share a website, flagged `needs_review` rather than merged.

This is what protects the 31 shared-domain rows from being collapsed into
each other.

**Late merge:** when a new source supplies the missing domain and two golden
records prove to be one, merge into the higher-quality record, set
`merged_into_id` on the loser, write the alias row. Tenant prospects pointing
at the loser keep resolving through the alias.

---

## 7. Migration list (193+)

| # | What |
|---|---|
| 193 | `gt_data_sources` + seed rows for `ftcci`, `apollo`, `upload` |
| 194 | `gt_universe_company_sources` |
| 195 | `gt_universe_companies` + `gt_universe_company_aliases` |
| 196 | `gt_universe_contacts` (with `exposure`) |
| 197 | `gt_prospects` + `gt_contacts.prospect_id` |
| 198 | `gt_connectors` |
| 199 | `gt_industries` + `gt_industry_aliases` + `gt_tenant_target_industries` |
| 200 | `ki_import_staging` quality columns |

199 is the only one onboarding itself depends on — "mark industries" is a
step-3 requirement. The rest serve mission control and can land later.

All guarded and idempotent (`IF NOT EXISTS`, DO-block existence checks).
Manual apply only — `npm run db:migrate`.

### Tenant / RLS / environment review
- **Universe tables are cross-tenant infrastructure** — no `tenant_id`, RLS
  disabled **by design**, documented alongside the existing exceptions
  (`gt_events` migration 185, `gt_prompts`). They are read-only to tenants;
  only platform loads write.
- **`gt_prospects` is tenant-scoped and environment-scoped** — `tenant_id`
  NOT NULL, `is_live` from the JWT, RLS policy, every query filtered.
- Tenant-facing ids via `gt_next_seq(tenant_id, 'prospect')` → `PROS-0001`.
  Universe ids are never exposed.

### Tests (3-check pattern)
Per CLAUDE.md rule 7, for the `gt_prospects` access layer: valid data / empty
/ wrong tenant → 0 rows. The universe needs its own suite instead, since the
3-check pattern does not apply to an unscoped table: upsert idempotence,
dedup correctness on the 31 shared-domain rows, field-level merge picking the
better source, and late-merge alias resolution.

---

## 8. Decisions

1. ~~Does onboarding end at prospects?~~ **Answered 2026-07-27: no.**
   Onboarding ends at step 3 (ideal customer + target industries). Prospect
   discovery and campaigns live in the product. See §1.

### Still needed

2. **Vocabulary reorder** — its own step, or ratified on the step-1 card?
   Prospect scoring runs off *approved* clusters, so this gates the payoff of
   the final step. (Today clusters are ratified at step 3 but consumed at
   step 2, so they never fire — see `research.agent.ts:221`.)
3. ~~`gt_universe_contacts.exposure` default~~ — **deferred to Phase B.**
   Phase A ships companies only, so no personal data is shared and the DPDP
   question does not need answering to start.
4. ~~Apollo timing~~ — **Phase B.**
5. **"CRO push" reading** — taken here as a *conversion push at the tenant*
   (market evidence as an activation lever), not the CRO audit lens the PRD
   defines at line 86 (landing-page CTA/friction analysis). The screenshot
   that accompanied the ruling showed credit-claim conversion mechanics,
   which supports this reading. Correct it here if wrong — it changes what
   Phase A builds, though not the schema.
