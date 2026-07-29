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

Tables: `gt_prospects` (196), `gt_universe_company_sources` (195),
`gt_prospect_tags` (203), `gt_tags` / `gt_load_tags` (199),
`gt_source_loads` (193), and `gt_record_view` (204) — one shape over both
record tables.

**Why two tables and one view.** They share 25 columns but have OPPOSITE dedup
rules: the pool keeps one row per source per record, which is what makes the
field-level merge re-runnable, while a tenant must have exactly one row per
company. So the tables stay separate and everything derived from them —
freshness, duplicate flags, tags — is defined once in the view.

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

**Which of them are a segment?** None, until a rule says so. The FTCCI import
landed 2,149 distinct `industry_raw` strings, 2,050 of them appearing once —
"Manufacturers" (210) and "Manufacturer" (68) are the same concept arriving
twice. `build_cohort` runs the cluster rules in `etl/industry-normalizer.ts`
over a tenant's records, writes the collapsed value to `industry_canonical`
(migration 206) and tags the matches, so one tag selects the cohort.

`industry_raw` is never rewritten — it is what the file said, and the rule is
not yet validated against a human. Exclusions ("Manufacturers Association" is
not a manufacturer) are RETURNED with the term that excluded them, and a tag
is never revoked on a re-run: rows tagged but no longer matching come back as
`tagged_no_longer_matching` for a person to decide. This is not the industry
taxonomy — it is the clusters a running pilot needs.

## Functions

### get_records
Both record surfaces, one function. scope 'mine' = the tenant's prospects; scope 'pool' = the shared directory pool (admin only).
- Parameters: scope?, search?, relationship?, tag_id?, industry? (exact industry_raw), industry_canonical? (derived cluster), industry_sub? (derived segment), research? (none | done | failed | decided), segment_id? (loads a saved definition; explicit params still win), domain?, only_duplicates?, min_quality?, show_inactive?, page?, limit?, offset?
- Returns: { scope, records: [{ id, ref, name, relationship, domain_normalized, city, state_code, industry_raw, industry_canonical, industry_sub, employees_band, completeness, validity, freshness, duplicate, resolved, is_active, source_label, raw, tags, research_status, researched, research_decided, research_offer, researched_at }], total, page, limit, stats, facets: { industries, tags, clusters, segments, research, with_domain, without_domain }, recipe: 'record-list' }


### get_prospect
One company in full: every mapped field, every column the source file carried, the people at it, its tags, and its account brief. Backs the dossier page `/prospects/<ref>` — the research is returned here rather than from a second call, because a page that renders the company and pops the research in a moment later is two screens pretending to be one.
- Parameters: prospect_id (optional, number) OR ref (optional, string — PROS-0042). One is required; raw PKs are never in a URL.
- Returns: { prospect, people: [{ id, name, job_title, channels }], tags, brief, offers, source_row, recipe: 'prospect-profile' }

### get_segments
Saved segments, each with the count it was saved with AND a live count. `drifted` = the data moved; `rules_moved` = the industry rules themselves changed, so the same name may now cover different companies.
- Parameters: none
- Returns: { segments: [{ id, name, note, definition, summary, member_count, live_count, with_website, drifted, rules_moved }], rules_version, recipe: 'segment-list' }

### save_segment
Name the filter you are looking at. Stores the DEFINITION, not a member list — a company that gains a domain tomorrow joins "pharma with a website" on its own. Refuses a filter that selects everything. The member count is computed here so the card and the list can never disagree.
- Parameters: name (required, string), segment_id (optional, number — to rename or redefine), note (optional, string), definition (optional, object — search, industry_canonical, industry_sub, domain, tag_id, relationship, min_quality, city, state_code)
- Returns: { segment_id, name, member_count, summary, recipe: 'segment-card' }

### delete_segment
Soft delete. The row stays (a run or campaign may name it) and the name is freed.
- Parameters: segment_id (required, number)
- Returns: { segment_id, name, message, recipe: 'segment-card' }



### tag_prospects
Apply or remove a direct tag across many records. Tags inherited from the delivery are not removable here.
- Parameters: prospect_ids (required), tag_id (required), apply?
- Returns: { applied, removed, recipe: 'prospect-tag' }


### build_cohort
Collapse free-text industries onto a cluster rule, store the canonical value and tag the matches. dry_run reports without writing.
- Parameters: cluster (required), tag_label?, dry_run?
- Returns: { cluster, dry_run, scanned, matched, excluded, no_rule, no_industry, with_domain, without_domain, variants, excluded_samples, tag, tagged, tagged_no_longer_matching, recipe: 'cohort-report' }

## Rules

- Every query filters on `tenant_id` AND `is_live` from the JWT (CLAUDE.md
  rules 1 and 8). `only_duplicates` and the tag filter are scoped the same way.
- `tag_prospects` writes in a transaction and verifies the tag belongs to this
  tenant (or is a platform tag) before writing. Prospect ids naming another
  tenant's records match nothing — the filter IS the authorisation.
- Tenant-facing ids are `ref` (`PROS-0001`), never the raw PK.
- There is ONE list query (`get-records.sql`) and ONE stats query, both
  reading `gt_record_view`. A filter or a derived column is written once and
  both surfaces get it — the previous split is why the pool query was missing
  `raw` after the tenant side already had it.
