# P0 — Common pool: mapping and schema for approval · 2026-10-01

> Phase P0 of `documents/POA-2026-10-01-common-pool.md`. **No code, no
> migration.** Every schema change below waits for Charan's approval
> (CLAUDE.md: no table, column, enum or index without it). The facts about
> existing tables were read from a database built from `backend/migrations/`
> (all 157 applied, local, 2026-10-01) — not from memory. Production is not the
> migration files (CLAUDE.md, Phase 0); the P1 checkout re-checks each one on
> the VPS.
>
> UX map for the whole pool journey: `documents/prototypes/pool-journey.html`.

---

## 1. One decision this document needs first: what "staging" and "pool" are physically

Charan's rule: *everything goes to staging; it reaches the core pool only when
enrichment is complete.* Enrichment needs something to attach to — a company
identity matched across sources — or the same company is crawled and
classified once per file it appears in. So "before the pool" has three
physical layers, and "the pool" is one flag:

```
ki_import_staging          raw rows, as delivered                    ┐
gt_universe_company_sources  one normalised row per source per company│ STAGING
                             (deliveries AND enrichment outputs)      │ (not visible
gt_universe_companies        the golden record, derived;              │  to tenants)
                             lifecycle_state ≠ complete              ┘
gt_universe_companies        lifecycle_state = complete, admitted_at   ← THE CORE POOL
```

- Raw stays raw (staging rows are never edited).
- Enrichment output is **new source rows** under enrichment sources (crawl,
  model pass, provider), never an edit of a delivered row — so a bad rule is
  re-run and a bad delivery is retired.
- The golden record is derived field by field from its source rows and passes
  or fails **Complete**; tenants (and adoption into a tenant's copy) see only
  admitted records.

**Decision S1 (for approval):** the core pool = `gt_universe_companies` rows
with `lifecycle_state = 'complete'`; everything else is staging, whatever
table it sits in. *Recommended.* The alternative — keeping every
not-yet-complete company inside `ki_import_staging` — means enriching rows
before they are matched, i.e. paying twice for every company that appears in
two lists.

Note: `gt_universe_companies` exists (195) and is EMPTY — nothing in `src/`
writes it (`company-processor.ts` mentions it in a comment only). The merge
engine that fills it is P1–P2 work, not a migration of data.

---

## 2. Table by table

Legend: **keep** = no change · **+** = new column(s) · **new** = new table ·
**check** = widened CHECK.

### 2.1 `gt_data_sources` (193) — the source registry

Today: `id, code, name, kind (directory|provider|upload), tier, default_as_of,
is_active`. Seeded: `upload 40 · ftcci 55 · apollo 80`.

| Change | Column / value | Why |
|---|---|---|
| + | `licence_class` text — `open_gov · licensed_private · licensed_shareable · public_listing · own_relationship · unknown_provenance · api_terms_no_cache` | decides where a source's data may land (D-P6, spec) |
| + | `may_enter_pool` boolean NOT NULL default false | the licence gate as one readable flag; false → tenant copy only |
| check | `kind` + `registry · listing · enrichment` | MCA/Udyam are registries; trade shows are listings; crawl/model/provider outputs are enrichment sources |
| seed | `mca` (registry, open_gov, 90) · `udyam` (registry, open_gov, 70) · `analytica` (listing, public_listing, 45) · `prospector` (provider, licensed_shareable *pending vendor clause*, 75) · `legacy_dir` (directory, unknown_provenance, 20) · `crawl` (enrichment, public_listing, 65) · `llm_pass` (enrichment, —, 50) · `findymail` (enrichment, licensed_private, 80) · `places` (enrichment, api_terms_no_cache, —) · `manual` (enrichment, —, 85) | survivorship tiers (spec §Matching): MCA > Udyam > chamber > prospector > legacy for legal fields; verified crawl first for domain |

`linkedin_own` (Charan's export) is NOT a pool source — people, tenant-only
(P7).

### 2.2 `gt_source_loads` (193, 202) — one row per delivery or enrichment run

Today: `source_id, label, region, state_code, as_of, default_industry_id,
tier_override, tenant_id (NULL = pool), file_checksum, row_count, status
(active|retired|failed), loaded_by, loaded_at`.

| Change | Column | Why |
|---|---|---|
| + | `load_kind` text — `delivery · enrichment` default `delivery` | an enrichment run writes its outputs as a load, so it can be retired like a bad file |
| + | `enrichment_request_id` bigint → `gt_enrichment_requests` | which run produced it |
| + | `cost_inr` numeric | spend per load (paid providers, model) |
| keep | `loaded_by` | = the spec's "who ran it" |
| keep | `file_checksum` + 202's guard | = the spec's "same hash → refuse re-import" |

### 2.3 `ki_import_staging` (104 … 201) — raw rows

Today: `processing_status ∈ pending · processing · success · failed ·
duplicate · skipped · orphan · conflict`, plus `reject_reasons`,
`dedup_key`, `conflict_*`, `field_diff`, `merge_decision`.

| Change | Column / value | Why |
|---|---|---|
| check | `processing_status` + `junk · held` | lifecycle §1.4 of the POA; junk is a state, never a deletion (D-P10) |
| + | `junk_reason` text — `placeholder · unreadable · consumer · defunct · out_of_scope · spam_source` | the reason travels with the row |
| + | `junk_by` uuid, `junk_at` timestamptz | J5 — reversible, so who and when |

`ki_` by disposition (CLAUDE.md: do not rename, do not create new `ki_`).
Widening a CHECK is not a new table.

### 2.4 `gt_universe_company_sources` (195) — per-source rows

Today: identity, address, `industry_raw/_id`, bands, `linkedin_url`,
`year_founded`, `description`, `raw`, `source_as_of`, `completeness`,
`validity`, `field_quality`, `blocking_key`; immutable; upsert on
`(source_id, source_record_id)`.

| Change | Columns | Why |
|---|---|---|
| + | `cin`, `llpin`, `gstin` | registry identity anchors (Complete #2) |
| + | `legal_status` (`active · struck_off · dormant · unknown`), `company_class` (`private · public · llp · proprietorship · partnership · foreign`), `incorporated_on`, `paid_up_capital_inr` | MCA fields; Exit needs `active` |
| + | `nic_codes` text[] | Udyam/MCA activity; industry union |
| + | `is_individual`, `is_foreign` boolean | practitioner vs company; foreign exhibitors skip CIN |
| + | `twitter_url`, `facebook_url` | social URLs (J6 — URLs only) |
| + | `role_emails` text[], `phones` text[] | crawl and directories yield several; `email`/`phone` stay the primary |
| + | `method` text — `import · crawl · llm · provider · manual` | how the value was obtained (D-P12) |
| + | `confidence` numeric(3,2) | per row; per field stays in `field_quality` |
| + | `domain_status` — `found · none_found · not_tried` | "domain lookup attempted" is a Complete check |

### 2.5 `gt_universe_companies` (195) — the golden record and the core pool

Today: the same business fields, `field_sources`, `source_codes[]`,
`quality_score`, `best_as_of`, `merged_into_id`, `needs_review`. Empty.

| Change | Columns | Why |
|---|---|---|
| + | the identity/legal/social fields of §2.4 | derived from the sources by survivorship |
| + | `lifecycle_state` — `candidate · enriching · held · complete · junk` | §1; `complete` = in the core pool |
| + | `admitted_at` timestamptz | when it passed Complete; what tenants filter on |
| + | `complete_checks` jsonb | the 8 checks, each pass/fail with the value's source — why it is or is not in |
| + | `junk_reason`, `junk_by`, `junk_at` | junk after enrichment (defunct, B2C) |
| + | `duplicate_of_id` bigint | **flagged, never merged** (D-P3); `merged_into_id` stays for a person's explicit late merge |
| + | `coverage_score` smallint, `coverage_parts` jsonb | J4, every dimension shown |
| + | `last_enriched_at` | freshness of the enrichment, apart from `best_as_of` |
| index | `(lifecycle_state, state_code)`, GIN on `nic_codes`, trigram on `name_key` | segment filters and the match ladder |

`pg_trgm` is **not installed** on the migration-built database (only
`plpgsql, uuid-ossp, pgcrypto, vector`). The trigram rung needs it — an
extension is a schema change: **Decision S2, approve `CREATE EXTENSION
pg_trgm`.**

### 2.6 `gt_universe_company_aliases` (195) — keep.

### 2.7 New tables (P1–P5)

**`gt_company_signals`** (P4) — pool-level, time-bound facts about a company.

| Column | |
|---|---|
| `id`, `company_id` → golden, `source_row_id` → per-source row | |
| `kind` — `tradeshow · chamber_member · new_registration · website_change` | |
| `detail` jsonb — event, year, hall, booth, products[] | |
| `observed_at`, `expires_at`, `source_id`, `load_id` | |

Tenant engagement (replies, visits) is NOT here — it is the tenant-scoped
signals spine (outreach design note §9), never pooled.

**`gt_enrichment_requests`** (P2) — select → estimate → confirm → run.

| Column | |
|---|---|
| `id`, `tenant_id` (requester's), `scope` — `pool · own` (pool only for admin) | |
| `requested_by`, `selection` jsonb (the filter, frozen), `target_count` | |
| `kinds` text[] — `code · crawl · llm · paid` | |
| `estimate` jsonb — records per kind, ₹, days at today's limits | |
| `status` — `estimated · confirmed · running · waiting_limit · done · cancelled · failed` | |
| `confirmed_by`, `confirmed_at` (the R3 approval), `progress` jsonb, `run_ids` | |

**`gt_enrichment_items`** (P2) — the per-record queue: what lets a run roll
over the daily limit and resume after a crash.

| Column | |
|---|---|
| `request_id`, `entity_type` (`pool_company · prospect`), `entity_id`, `step` | |
| `status` — `queued · done · skipped · failed · abstained`, `attempts` | |
| `result_source_row_id`, `error`, `done_at` | |
| UNIQUE `(request_id, entity_type, entity_id, step)` | idempotent re-run |

**`gt_enrichment_usage`** (P2) — daily and monthly counters.

| Column | |
|---|---|
| `tenant_id`, `period` (date for daily, first-of-month for ₹), `kind`, `provider` | |
| `units`, `cost_inr` | |
| UNIQUE `(tenant_id, period, kind, provider)` | |

**`gt_cleanup_gap`** (P5) — already PROPOSED in
`design-notes-icp-data-structure.md` §2.3; approve as the review queue
(held, duplicate candidates, reported junk, model abstentions). Unchanged
shape: `entity_type, entity_id, step, reason, candidates, status
(open · model_resolved · human_resolved · dismissed), resolved_value,
resolved_by, model_cost_tokens`.

### 2.8 Listed for direction, approved at their own phase (P7–P9)

People depend on the projects decision (D-P9), so these are shown, not asked
for now.

| Table | Change | Phase |
|---|---|---|
| `gt_contacts` | + `lawful_basis` (`own_relationship · public_business_role · licensed_data · consent`), + `persona_id` | P7 |
| `gt_person_company_link` | new (ICP design note §2.2) | P7 |
| `gt_contact_channels` | + `verification_status` (`unverified · valid · risky · catch_all · invalid · unknown`), `verifier`, `is_role_based`, `is_free_mail`, `permission` (`unknown · opted_in · opted_out`) | P7–P8 |
| `gt_segments` | new — filters, frozen count, scope (`pool + own`) | P9 |
| `gt_prospects` | keep — already copies with `universe_company_id` + `adopted_at` (196) | P7 |
| `vani_suppression` | keep (260) | — |

---

## 3. The spec's tables → ours

| Spec | Ours |
|---|---|
| `pool_source` | `gt_data_sources` + §2.1 |
| `pool_ingest_batch` | `gt_source_loads` + §2.2 |
| `pool_raw_record` | `ki_import_staging` + §2.3 |
| `pool_company` | `gt_universe_companies` + §2.5 |
| `pool_company_attribute` | `gt_universe_company_sources` + §2.4 (a row per source, not per attribute: the same provenance, and the merge reads one row per source) |
| `pool_company_alias` | `gt_universe_company_aliases` |
| `pool_company_signal` | **new** `gt_company_signals` |
| `pool_match_review` | **new** `gt_cleanup_gap` (proposed) |
| `segment` | **new** `gt_segments` (P9) |
| `person` / `person_role` / `contact_point` | `gt_contacts` / `gt_person_company_link` / `gt_contact_channels` (P7–P8) |
| `suppression` | `vani_suppression` (260) |
| `enrichment_job` | **new** `gt_enrichment_requests` + `_items` + `_usage` |

---

## 4. The match ladder, adjusted to D-P3

A source row is linked to a golden company by the first rung that hits.

| Rung | Rule | Outcome |
|---|---|---|
| 1 | exact CIN / LLPIN / GSTIN | link (0.99) |
| 2 | exact domain (not free-mail) **and** name_key similarity ≥ 0.90 | link (0.97) |
| 2b | exact domain, name differs | **new company, `duplicate_of_id` flagged → review** (sister companies; FTCCI's 137) |
| 3 | name_key + PIN exact | link (0.92) |
| 4 | name_key trigram ≥ 0.90 + same city/district | link (0.86) |
| 5 | trigram 0.75–0.90 + same state | review (gap) |
| 6 | no hit | new candidate |

Thresholds come from `.env` (§5), not code.

---

## 5. `.env` variables (none have defaults in code)

| Variable | Suggested | Phase |
|---|---|---|
| `ENRICH_DAILY_CODE_PER_TENANT` | 50000 | P2 |
| `ENRICH_DAILY_CRAWL_PER_TENANT` | 2000 | P2 |
| `ENRICH_DAILY_LLM_PER_TENANT` | 500 | P3 |
| `ENRICH_DAILY_CODE_POOL` / `_CRAWL_POOL` / `_LLM_POOL` | 200000 / 5000 / 5000 | P2–P3 |
| `CRAWL_MAX_PAGES_PER_DOMAIN`, `CRAWL_TIMEOUT_MS`, `CRAWL_USER_AGENT` | 6 / 15000 / "VaNiBot/1.0 (+https://vikuna.io/bot)" | P2 |
| `MATCH_LINK_MIN`, `MATCH_REVIEW_MIN`, `MATCH_DOMAIN_NAME_MIN` | 0.86 / 0.75 / 0.90 | P1 |
| `UDYAM_OGD_API_KEY`, `UDYAM_PAGE_SIZE` | — / 100 | P4 |
| `PROVIDER_FINDYMAIL_UNIT_INR`, `PROVIDER_FINDYMAIL_MONTHLY_CAP_INR` | from the plan / **unset = refused** | P8 |
| `PROVIDER_MCA_DIRECTORS_UNIT_INR`, `_MONTHLY_CAP_INR` | provider TBD / unset | P8 |

Each goes into `backend/.env.example` with a comment and into the config
module that refuses to start without it (the `llm.config.ts` pattern), when
its phase lands.

---

## 6. Migration numbers

`263` stays reserved for the DPDP notice (`documents/drafts/263_…`).

| # | File | Phase | Contains |
|---|---|---|---|
| 264 | `264_pool_sources_and_loads.sql` | P1 | §2.1, §2.2 (enrichment FK added in 266) |
| 265 | `265_pool_staging_lifecycle.sql` | P1 | §2.3 |
| 266 | `266_pool_universe_lifecycle.sql` | P1 | §2.4, §2.5, `pg_trgm` (S2) |
| 267 | `267_pool_enrichment.sql` | P2 | `gt_enrichment_requests`, `_items`, `_usage`; FK from loads |
| 268 | `268_pool_company_signals.sql` | P4 | `gt_company_signals` |
| 269 | `269_gt_cleanup_gap.sql` | P5 | `gt_cleanup_gap` |

Each guarded and idempotent, applied with the runner on the VPS, `--status`
clean at checkout. Pool tables keep RLS **off by design** (no tenant_id, as
195 and `gt_events`); `gt_enrichment_requests/_items/_usage` carry
`tenant_id` and get RLS on with the 248 bridge pattern.

---

## 7. For approval — the list

| # | Item | Recommended |
|---|---|---|
| S1 | Core pool = golden rows with `lifecycle_state = complete`; everything earlier is staging | yes |
| S2 | `CREATE EXTENSION pg_trgm` | yes |
| S3 | §2.1–§2.6 column changes (migrations 264–266) | yes |
| S4 | New tables `gt_enrichment_requests`, `_items`, `_usage` (267) | yes |
| S5 | New table `gt_company_signals` (268) | yes |
| S6 | `gt_cleanup_gap` as proposed (269) | yes |
| S7 | Match ladder §4 with rung 2b | yes |
| S8 | `.env` variables §5 with the suggested values | yes |
| — | P7–P9 tables (§2.8) | approved at their own phase |

Approving S1–S8 lets P1 start. Sprint 0 (the agentic foundation) needs no
schema and can start in parallel once its platform change is approved
(`vani-app/CLAUDE.md` §5).
