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
| + | `model` text — `provider:model` that produced the row (NULL for import) | per-model quality is measurable only if every answer says who gave it (§9) |

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
| + | `last_enriched_at` | when ANY enrichment last touched it, apart from `best_as_of` (the source's own date); per-step dates come from `gt_enrichment_items.done_at` |
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
| `llm_mode` — `realtime · batch`; `provider_batch_ids` text[] | model work through the LLM lane, or Anthropic's Message Batches (50% price, results within 24 h, usually ~1 h) — §8 |

**`gt_enrichment_items`** (P2) — the per-record queue: what lets a run roll
over the daily limit and resume after a crash.

| Column | |
|---|---|
| `request_id`, `entity_type` (`pool_company · prospect`), `entity_id`, `step` | |
| `status` — `queued · done · skipped · failed · abstained`, `attempts` | |
| `result_source_row_id`, `error`, `done_at` | `done_at` per step = "last enriched" for that step |
| `provider`, `model`, `escalated_from` (the item this re-ran), `cost_inr`, `confidence` | which lane answered, and why it went up a rung (§9) |
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

### 2.8a The industry master — one list, grown by the pool (S9–S11)

Charan, 2026-10-01: "it provides critical data infra." Today there are FOUR
industry lists and nothing joins them:

| List | Where | State |
|---|---|---|
| 10 onboarding choices | `vani-app/src/skills/onboarding/industries.ts` (hardcoded) → `vn_tenant_profiles.industry` | live; drives Vara's industry research |
| `gt_industries` + `gt_industry_aliases` (raw → industry, `confidence`, `mapped_by rule/llm/human`) | 194 | **empty** — never seeded |
| clusters + sub-clusters (manufacturing → pharma, food, chemicals…) | `etl/industry-normalizer.ts` → `gt_prospects.industry_canonical` / `_sub` (206, 218) | live for FTCCI; "not the taxonomy" by its own header |
| domain packs | `vani_domain_pack.domain` | keyed by its own code |

**One master: `gt_industries`.** Hierarchy by `parent_id` (sector →
industry → sub-segment, any depth).

| Change | What | Why |
|---|---|---|
| + | `gt_industries.nic_prefixes text[]` | each node maps to NIC 2008 code prefixes, so MCA/Udyam rows classify **by code, free** — the cheap lane is code |
| + | `gt_industries.source` — `seed · nic · proposal` and `approved_by`, `approved_at` | a node's origin and who let it in |
| seed | sectors and industries from NIC 2008 sections/divisions, named for selling (not "Manufacture of pharmaceuticals, medicinal chemical and botanical products" but "Pharmaceuticals"); the normalizer's clusters and sub-clusters as the first sub-segments; the 10 onboarding choices mapped onto top-level codes | one list from day one; existing tenants' values stay valid |
| reuse | `gt_industry_aliases` for every prose value (FTCCI's 2,149 BUSINESS strings, provider labels, model output) — raw kept, mapped into the master | prose never becomes a node by itself |
| reuse | `gt_cleanup_gap` step `taxonomy_proposal` | unmapped values pile up → the agent groups them and PROPOSES a node or an alias → admin approves; a model never creates a node |

**Two kinds of segment, kept apart:** taxonomy sub-segments are platform
(`gt_industries`, approved by admin); a tenant's segment is a private saved
filter (`gt_segments`, P9) built from them and never harvested into the
taxonomy (same ruling as role families).

**S11 — readers move onto the master** (code, P1 sprint B): the onboarding
picker reads the top level from the API instead of the hardcoded list; Vara's
domain packs key to master codes (mapping table for existing packs, nothing
renamed); the normalizer writes `industry_id` beside `industry_canonical`.

### 2.8 Listed for direction, approved at their own phase (P7–P9)

People depend on the projects decision (D-P9), so these are shown, not asked
for now.

| Table | Change | Phase |
|---|---|---|
| `gt_contacts` | + `lawful_basis` (`own_relationship · public_business_role · licensed_data · consent`), + `persona_id` | P7 |
| `gt_person_company_link` | new (ICP design note §2.2) | P7 |
| `gt_contact_channels` | + `verification_status` (`unverified · valid · risky · catch_all · invalid · unknown`), `verifier`, `is_role_based`, `is_free_mail`, `permission` (`unknown · opted_in · opted_out`) | P7–P8 |
| `gt_segments` | new — filters, frozen count, scope (`pool + own`) | P9 |
| `gt_prospects` | + `last_enriched_at` (the tenant copy's own enrichment); otherwise keep — copies with `universe_company_id` + `adopted_at` (196) | P2 (column) / P7 |
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
| `ENRICH_LLM_MODE` (`realtime · batch`), `ENRICH_BATCH_MAX_REQUESTS` | batch / 10000 | P3 |
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
| 264 | `264_pool_sources_and_loads.sql` | P1 | §2.1, §2.2 (enrichment FK added in 268) |
| 265 | `265_pool_staging_lifecycle.sql` | P1 | §2.3 |
| 266 | `266_pool_universe_lifecycle.sql` | P1 | §2.4, §2.5, `pg_trgm` (S2) |
| 267 | `267_industry_master.sql` | P1 | §2.8a columns + the seed (NIC sections/divisions, normalizer clusters, onboarding mapping) |
| 268 | `268_pool_enrichment.sql` | P2 | `gt_enrichment_requests`, `_items`, `_usage`; FK from loads (renumbered 2026-10-01: P1's four come first so the runner applies them in order) |
| 269 | `269_pool_company_signals.sql` | P4 | `gt_company_signals` |
| 270 | `270_gt_cleanup_gap.sql` | P5 | `gt_cleanup_gap` |
| 271 | `271_ontology_pool_graph.sql` | before P3 (S16) | `gt_universe_kg_nodes` / `_edges`, `gt_concepts`, `gt_concept_aliases` — written only once S16 is approved |

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
| S3 | §2.1–§2.6 column changes (migrations 264–266, 267) | yes |
| S4 | New tables `gt_enrichment_requests`, `_items`, `_usage` (268) | yes |
| S5 | New table `gt_company_signals` (269) | yes |
| S6 | `gt_cleanup_gap` as proposed (270) | yes |
| S7 | Match ladder §4 with rung 2b | yes |
| S8 | `.env` variables §5 with the suggested values | yes |
| S9 | `gt_industries` is the one industry master: `nic_prefixes`, `source`, approval columns; seeded (267) | yes |
| S10 | Taxonomy discovery through `gt_cleanup_gap` (`taxonomy_proposal`); admin approves every node and alias | yes |
| S11 | Onboarding picker, Vara domain packs and the normalizer read/write the master | yes |
| S12 | Model enrichment may run as an Anthropic batch (`llm_mode`, `provider_batch_ids`); the daily LLM limit counts records per day either way — see §8 for what that means at 50,000 | yes |
| S13 | The rotation policy of §9, including its rule-12 exception (free → Haiku escalation, declared and capped per run) | yes |
| S14 | `model` on source rows; `provider/model/escalated_from/cost_inr/confidence` on enrichment items; `last_enriched_at` on `gt_prospects`; re-enrichment cadences in `.env` | yes |
| S15 | Budgets as §10: tenant = 100,000 tokens/day + 2,000,000/month (all intelligence, every lane); admin = records per run; BYOK uncapped; + `gt_tenant_context.monthly_token_limit` | **values DECIDED 2026-10-01**; the column is part of this approval |
| S16 | **Widened 2026-10-02 (D-Q2).** Ontology v1 (`documents/design-notes-ontology.md`) has two homes now, not one: the pool company graph `gt_universe_kg_nodes` / `_edges` (no tenant_id, RLS off by design, admin-written) AND a tenant's account graph `gt_account_kg_nodes` / `_edges` (tenant_id, RLS on, keyed to `gt_prospects`) — a tenant enriches its own upload before research. Plus the concept catalogs `gt_concepts` / `gt_concept_aliases`. Node/edge contract of the note §7. Needed for P2-C | **PENDING** |
| S17 | Scoring profiles `gt_score_profiles`: tenant_id NULL = platform default, a tenant's own optional; weights of the seven parts and their items, level boundaries; versioned, append-only, one active per scope (D-Q4–D-Q7) | **PENDING** (2026-10-02) |
| S18 | Token top-ups `gt_token_topups` (tenant, tokens, added_by, reason, created_at) and `gt_tenant_context.monthly_token_limit` (S15's column): the balance is drawn after the day's/month's base is used (D-Q12) | **PENDING** (2026-10-02) |
| — | P7–P9 tables (§2.8) | approved at their own phase |

Approving S1–S15 lets P1 start; S16 is needed before P3 and does not block P1–P2. Sprint 0 (the agentic foundation) needs no
schema and can start in parallel once its platform change is approved
(`vani-app/CLAUDE.md` §5).

---

## 8. What model enrichment costs and how long it takes — 50,000 records

Prices from Anthropic's current list (Haiku 4.5: $1 / $5 per million input /
output tokens; Message Batches 50% off every token; cache reads 0.1×, but
Haiku 4.5 caches only a prefix of ≥ 4,096 tokens). Token counts per record
are ESTIMATES until the P3 100-record trial measures them.

| Shape of one call | Input | Output | 50k realtime | 50k batch |
|---|---|---|---|---|
| description only (name, raw industry, ≤ 1 paragraph) + rubric + taxonomy | ~2,000 | ~150 | ≈ $140 | **≈ $70** |
| with the crawled about-page text | ~4,000 | ~200 | ≈ $250 | **≈ $125** |
| the second shape once the taxonomy in the prompt grows to 4,500 tokens — cached | 4,500 cached + 2,500 | ~200 | ≈ $200 (uncached ≈ $400) | ≈ $100 (uncached ≈ $200; cache hits in a batch are best-effort) |

At ~₹85/$ the first two shapes are roughly **₹6,000–11,000 for 50,000 records** in batch. Caching matters only once the prompt's fixed part passes 4,096 tokens; below that Haiku 4.5 does not cache it at all.

**What the model never sees** (and so costs nothing): rows the code lane
settles — NIC codes from MCA/Udyam mapped through `nic_prefixes`, values
already in `gt_industry_aliases`, the normalizer's rules. And **distinct
values, not rows**: a directory's industry prose is classified once per
distinct string (FTCCI: 2,149 distinct of 2,913 rows), descriptions once per
company.

**Time — the binding constraint is our own daily limit, not Anthropic:**

| Mode | Throughput | 50,000 records |
|---|---|---|
| realtime through the LLM lane (Haiku, 4 at a time, ~2–4 s a call) | ~1–2 calls/s | ~7–14 hours of calls |
| batch | one or a few submissions | usually ~1 hour, at most 24 |
| **our pool LLM limit (J3: 5,000/day)** | 5,000/day | **10 days, whichever mode** |
| qwen on Vikuna's VPS, for comparison (measured 26-Sep: 3,353 + 330 tokens in 95 s) | one slot | ~5 weeks — not a bulk lane |

So for a 50k bulk job the decision is the limit, not the model: keep 5,000/day
(10 days, ≈ ₹600–1,100 a day), or raise the pool LLM limit for an approved
batch run (e.g. 25,000/day → 2 days). The estimate screen shows both before
anyone confirms (R3). Anthropic's own rate limits depend on the account's
tier and are checked on the console before the first bulk run.

---

## 9. The rotation policy — free model pools first, Haiku last (S13)

Charan, 2026-10-01: "we should use free LLM pools — Grok, OpenRouter and a few
others have free quota — use them and then come to Haiku; enrichment should
have a smart rotation policy."

### 9.1 The ladder, per record per step

```
1. code lane          NIC → master, alias table, normalizer rules        free, exact
2. known answer       this value already classified (distinct-value cache) free
3. free pool          rotate across approved free providers               free, quota-bound
     ├ validate: schema + validator + confidence ≥ the step's bar → accept
     └ fail / low confidence / quota gone everywhere ─┐
4. Haiku              batch or realtime, inside the run's ₹ cap     ◄─────┘   paid
     └ fail / low confidence → 5
5. abstain            review queue (gt_cleanup_gap) — a person decides       no guess
```

Every accepted answer records `provider:model`, confidence and the rung it
came from — on the source row and the item. A tenant or an operator can always
see that "Pharmaceuticals" came from a free Llama model at 0.91, or from Haiku
after the free answer was refused.

### 9.2 What makes it "smart"

- **Quota-aware rotation.** Each free provider has its own per-minute and
  per-day quota (from `.env`, never assumed); usage counts in
  `gt_enrichment_usage` per provider per day. The router picks the provider
  with quota left, then by **measured quality for that step**; a 429 moves to
  the next provider and marks that one cooling down. The existing LLM lane
  already queues per endpoint URL, so providers never queue behind each other.
- **Quality-weighted, measured — not trusted.** A provider is admitted to a
  step only after it passes that step's golden set (offline eval, AGENTS.md
  §7) — the Laya trial (31% agreement) is why: free does not mean usable.
- **Audit sample.** A fixed share of free answers (e.g. 5%,
  `ENRICH_AUDIT_SAMPLE`) is re-asked of Haiku. Agreement per provider per step
  is tracked continuously; a provider whose agreement falls below its bar is
  **paused for that step with an alert** in `/runs/awaiting` — a person
  resumes or removes it (never silent, never automatic re-admission).
- **Two run settings, chosen on the estimate screen:**
  - *Free only* — slower; when every free quota is spent the run waits for
    tomorrow's reset (visible as `waiting_limit`).
  - *Free first, Haiku overflow up to ₹X* — escalation allowed until the
    run's own cap; past it, the run waits.

### 9.3 What may go to a free provider — the data rule

Free tiers often keep or train on prompts. So each provider carries a
**data-terms class** in `.env` — `no_training · may_train · unknown` — and:

| Data | Free `may_train`/`unknown` | Free `no_training` | Haiku |
|---|---|---|---|
| Pool company facts (name, public description, industry prose, website text) — R0 | ✅ | ✅ | ✅ |
| People (names, titles, emails), anything personal | ❌ never | ❌ until DPDP review | ✅ |
| A tenant's Brain or its own copy | ❌ never | ❌ | ✅ (or the tenant's BYOK) |

People and tenant data never ride a free pool. That is enforced in code by
the step's declared data class, not by the caller's care.

### 9.4 Why this is an exception to rule 12, and how it stays honest

Moving from a free answer to Haiku is an automatic switch that spends money —
exactly what rule 12 forbids unless approved. It is acceptable here because:
it is **declared before the run** (the estimate names the ladder and the ₹
cap), **capped per run**, **labelled per answer** (`provider:model`, rung),
and **reversible** (an enrichment run is a load; retiring it withdraws its
answers). A validation failure does not silently become a different answer —
it becomes the next rung's question, and the last rung is abstain. Once
approved, this exception is recorded in CLAUDE.md beside the LLM failover one.

### 9.5 Candidates and configuration

Candidates to test, all OpenAI-compatible (`callEndpoint` already speaks that
shape; Groq and Together are already in the BYOK menu): OpenRouter's `:free`
models, Groq, Google AI Studio (Gemini free tier), Cerebras, Mistral's free
tier, xAI (Grok) where credits apply. **Quotas and data terms change often —
each is read from the provider's current terms when it is added, written into
`.env`, and re-checked at every phase checkout; none is taken from memory.**

`.env` (no defaults in code):

| Variable | Meaning |
|---|---|
| `ENRICH_LLM_POOL` | ordered provider codes, e.g. `groq,openrouter_free,gemini_free,haiku` |
| `LLMPOOL_<CODE>_URL`, `_MODEL`, `_KEY` | endpoint, model, key |
| `LLMPOOL_<CODE>_RPM`, `_DAILY` | quota |
| `LLMPOOL_<CODE>_DATA_TERMS` | `no_training · may_train · unknown` |
| `ENRICH_AUDIT_SAMPLE` | share re-asked of Haiku, e.g. 0.05 |
| `ENRICH_CONFIDENCE_<STEP>` | the acceptance bar per step |

What it is worth, if free models settle ~70–80% of model work at an
acceptable agreement: the 50,000-record batch of §8 drops from ≈ ₹6,000–11,000
to ≈ ₹1,500–3,500 (escalations + the audit sample), at the cost of time spent
waiting on free quotas. The P3 trial measures the real share before anyone
relies on it.

### 9.6 Last enriched, and when to enrich again

`last_enriched_at` on the golden record and on the tenant copy; per-step
`done_at` on items. Re-enrichment is **proposed, never automatic**: when a step
is older than its cadence the record shows "stale since…" and VaNi proposes a
refresh run for the affected set (the person starts it).

| Step | Cadence (`.env`) |
|---|---|
| liveness, crawl | `ENRICH_REFRESH_CRAWL_DAYS` — 90 |
| classification | when the description changed, or the taxonomy version changed |
| email verification (P8) | `ENRICH_REFRESH_VERIFY_DAYS` — 180 |
| domain lookup "none found" | `ENRICH_REFRESH_DOMAIN_DAYS` — 180 |

---

## 10. Budgets — tokens for a tenant, records for the admin (S15)

Charan, 2026-10-01: "for a tenant it will be 100,000 tokens a day (enrichment
and other intelligence); there will be a monthly cap as well. For admin, he
will enter the number of records."

### 10.1 Tenant

- **One meter for all intelligence**: enrichment, account research, story
  drafting, the wizard's reading and drafting — every model call made for the
  tenant. It already exists: `gt_tenant_context.daily_token_usage` (181/217),
  per day, split by lane.
- **Daily cap** `daily_token_limit` (exists, nullable since 217) and a
  **monthly cap** — new column `monthly_token_limit`; the month's usage is the
  sum of the daily map, so no new usage store.
- **Every lane counts** — free pool, Vikuna's qwen, Haiku — split in the meter
  (`free · vps · escalation`) so cost is visible, but one cap. A tenant must
  get the same amount of work done whichever lane happened to answer; and free
  quotas are Vikuna's shared resource, so they are part of fair share.
- **Code and crawl steps cost no tokens** and do not count; they keep only
  infrastructure rate limits (politeness to the sites crawled, J3's crawl
  number), not a business cap.
- **BYOK is uncapped** — the 2026-09-15 ruling stands: the cap exists because
  Vikuna pays. Metered all the same.
- **Where the numbers come from:** `.env` now (`TENANT_LLM_DAILY_TOKENS`,
  `TENANT_LLM_MONTHLY_TOKENS`), the tenant's tier later (`vani_entitlement`,
  POA D4). Migration 217's principle holds in a new form: the cap is a
  decision Charan made for a tier, shown to the tenant — not a schema default
  nobody chose.
- **The default and how it applies (Charan, 2026-10-01: "default exists but
  it never shows on the UI, and if BYOK this 100,000 does not impact at
  all").** Effective daily cap = the tenant's own `daily_token_limit` if
  someone set one, else `TENANT_LLM_DAILY_TOKENS` (100,000) from `.env`;
  same shape for the month. This knowingly changes 217's meaning of NULL from
  "no cap" to "the platform default" — an operator who wants a tenant uncapped
  sets a high number for it. Today the code applies NO default (217 cleared
  them all); `research-skill.set_budget` is the only setter and has no screen.
- **Not shown as a plan meter — shown as a reason.** The cap is not displayed
  on the console as a usage gauge. But the estimate accounts for it, and a run
  that reaches it says so where it waits: "Paused — today's allowance is used;
  resumes tomorrow" (rule 12, and 217's lesson: a batch died at company eight
  with nothing on screen saying why).
- **BYOK: no cap, and no Vikuna lanes.** A BYOK tenant's model calls run on
  its own provider only — never the free pools, never Vikuna's qwen or Haiku
  (the 2026-09-15 ruling: we never route BYOK onto our keys). Metered, never
  capped.
- **Shown in records, not just tokens.** A tenant thinks "enrich 200
  companies", not "60,000 tokens": the estimate says both — "≈ 60,000 tokens,
  60% of today, about 2 days at your limit" — and runs that exceed today roll
  over, visibly, as enrichment items already do.
- **Tenant data never rides a `may_train` free pool** (§9.3 extended): a
  tenant's own prospect list is that tenant's targeting (rule 13's reasoning),
  so tenant runs use `no_training` providers, Vikuna's own model, Haiku, or
  the tenant's BYOK.

**Decided (Charan, 2026-10-01):** daily **100,000** tokens
(`TENANT_LLM_DAILY_TOKENS`), monthly **2,000,000 (20 lakh)**
(`TENANT_LLM_MONTHLY_TOKENS`) — "we can always update when needed." No
onboarding allowance for now; revisit if the measured usage (§10.3) shows an
onboarding day near the cap. **Top-ups** come with the business model: a
purchased top-up adds to the month's allowance. That is a ledger (who bought
how many tokens, when, against which month), so it is a schema decision of its
own — it lands with `vani_entitlement` (POA D4), not here; until then a top-up
is an operator raising that tenant's monthly limit.

### 10.2 Admin (Vikuna, the pool)

- The admin **enters the number of records** for a run; there is no daily
  cap. The estimate turns that into tokens, ₹ and time across the rotation
  ladder (§9), and the admin confirms (R3).
- Actual spend is recorded per run (`gt_enrichment_usage`) and shown month to
  date on the Spend screen, beside the estimate it was approved against.
- Vikuna's own tenant work outside the pool (its Smart Profile, research) is
  `is_admin` and uncapped, metered the same way.

### 10.3 Red flag — check 100,000 against what a day actually uses

The number has been tried once. Migration 181 shipped
`daily_token_limit = 100000` as a default; 217 removed it because **account
research costs ~14,000 tokens per company — 100,000 is seven companies** —
and the first real batch died at company eight.

What 100,000 tokens/day buys, at the costs measured or estimated so far:

| Work | ≈ tokens each | per 100,000 |
|---|---|---|
| account research (measured) | 14,000 / company | ~7 companies |
| model enrichment, description only (§8 estimate) | 2,150 / record | ~45 records |
| model enrichment with crawled text (§8 estimate) | 4,200 / record | ~23 records |
| a Mission Wizard site read + profile draft (one call measured at 3,353 + 330; a site read is many calls) | likely tens of thousands | the onboarding day may spend most of it |

So before the number is fixed, read what tenants really use — the meter has
recorded it since 181 (read-only, run on the VPS):

```sql
SELECT t.slug, d.key AS day,
       COALESCE((d.value->>'vps')::int, 0)        AS vps_tokens,
       COALESCE((d.value->>'escalation')::int, 0) AS paid_tokens
  FROM gt_tenant_context c
  JOIN vn_tenants t ON t.id = c.tenant_id,
       jsonb_each(c.daily_token_usage) d
 ORDER BY d.key DESC, t.slug
 LIMIT 60;
```

Options if onboarding alone approaches the cap: an onboarding allowance (the
first N days, or the wizard's own calls, outside the cap), or the monthly cap
as the real limit with the daily one as pacing only. Charan decides once the
numbers are on the table.
