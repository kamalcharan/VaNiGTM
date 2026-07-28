---
name: prospect-skill
version: 1.0.0
description: The tenant's imported company records — prospects and customers — with quality, duplicate visibility and tagging
tier: starter
default_recipe: prospect-list
---

# Prospect Skill

## Purpose

`gt_prospects` is where a tenant's uploaded **companies** land: their contacts'
employers, their existing customers, and (later) companies adopted from the
common pool. Until this skill existed the import wrote 2,913 rows that no
screen could read.

People live in `gt_contacts` and are served by **contact-skill**. A company and
the people at it are linked by `gt_contacts.prospect_id`.

Tables: `gt_prospects` (196), `gt_prospect_tags` (203), `gt_tags` /
`gt_load_tags` (199), `gt_source_loads` (193).

## The three questions this skill answers

**Is the data any good?** Quality is reported as COMPONENTS, never as one
score:

- `completeness` — share of tracked fields populated
- `validity` — share of populated fields that passed validation
- `freshness` — banded from `source_as_of` (current ≤6mo · recent ≤18mo ·
  ageing ≤36mo · stale beyond · unknown when undated)

Fill rate is not quality, and blending them would hide exactly the failure
this design was built around: the profiled provider CSV was 100% "populated"
on revenue while 60 of 119 values were the literal string `undefined+`.

**Is it a duplicate?** Records that share a `domain_normalized` or a `name_key`
with another record are FLAGGED, not merged. 31 of FTCCI's 1,590
domain-carrying rows share a website with another member — group companies and
divisions that are genuinely different businesses. The import already held and
resolved exact clashes; this surfaces the near-misses for a human.

**How is it tagged?** Two sources, both shown:

- **inherited** — from the delivery, via `load_id` → `gt_load_tags`. Applied at
  import ("FTCCI Telangana"). Read-only on a record: it describes where the
  record came from.
- **direct** — `gt_prospect_tags`. Applied afterwards ("shortlist", "wrong
  segment"). Freely added and removed.

Both draw on the same `gt_tags` vocabulary, so a tenant has one tag list.

## Functions

### get_prospects
Paginated list of imported companies with quality, duplicate flags and tags.
- Parameters: search?, relationship?, tag_id?, only_duplicates?, min_quality?, limit?, offset?
- Returns: { prospects: [{ id, ref, name, relationship, domain_normalized, city, state_code, industry_raw, employees_band, completeness, validity, freshness, shares_domain, shares_name, load_label, tags }], total, recipe: 'prospect-list' }

### get_prospect
One company in full: every mapped field, every column the source file carried, the people at it, and its tags.
- Parameters: prospect_id (required)
- Returns: { prospect, people: [{ id, name, job_title, channels }], tags, source_row, recipe: 'prospect-profile' }

### get_prospect_stats
Set-level health: totals, average completeness and validity separately, freshness bands, duplicate counts.
- Parameters: none
- Returns: { stats: { total, customers, prospects, avg_completeness, avg_validity, with_rejected_fields, with_domain, undated, fresh, stale, sharing_domain, sharing_name }, recipe: 'prospect-stats' }

### get_universe_companies
The common pool — company records delivered by directories and providers, shared across tenants. Admin tenants only, checked against vn_tenants.is_admin.
- Parameters: search?, load_id?, tag_id?, only_duplicates?, limit?, offset?
- Returns: { companies: [{ id, name, source_record_id, domain_normalized, city, state_code, industry_raw, employees_band, completeness, validity, freshness, resolved, shares_block, load_label, source_code, tags }], total, stats, recipe: 'universe-list' }

### tag_prospects
Apply or remove a direct tag across many records. Tags inherited from the delivery are not removable here.
- Parameters: prospect_ids (required), tag_id (required), apply?
- Returns: { applied, removed, recipe: 'prospect-tag' }

## Rules

- Every query filters on `tenant_id` AND `is_live` from the JWT (CLAUDE.md
  rules 1 and 8). `only_duplicates` and the tag filter are scoped the same way.
- `tag_prospects` writes in a transaction and verifies the tag belongs to this
  tenant (or is a platform tag) before writing. Prospect ids naming another
  tenant's records match nothing — the filter IS the authorisation.
- Tenant-facing ids are `ref` (`PROS-0001`), never the raw PK.
- `get-prospects.sql` and `count-prospects.sql` share their filter block. A
  filter added to one must be added to the other or the pagination lies.
