---
name: pool-skill
version: 1.0.0
description: The common pool, for its admin — sources, deliveries by state, why each company is or is not in the core pool, the industry master, and the decisions a person makes.
tier: starter
default_recipe: pool
---

# Pool Skill

## Purpose

Common pool P1 sprint B. A delivery lands as per-source rows; the worker job
`POOL_RESOLVE_REQUESTED` (`src/etl/pool-merge.ts`) matches them into golden
companies, derives each field from the most trusted source, and runs the
Complete test (`src/etl/complete-test.ts`). A company is in the CORE POOL only
when all eight checks pass (`lifecycle_state = complete`, S1).

Every function is **admin only**: the pool's tables carry no tenant_id, so the
gate in `shared.ts` is the whole protection.

Risk classes (AGENTS.md §6a): reads are R0; `decide`, `retire_delivery` and
`resolve` write SHARED platform data (R2) — admin only, reversible (junk ↔
restore, a retired delivery keeps its rows), and every change is attributed.

## Functions

### sources
Every data source with its licence, whether it may feed the pool, its tier, and what it has delivered.
- Risk: R0
- Parameters: none
- Returns: { sources: [{ code, name, kind, tier, licence_class, may_enter_pool, deliveries, retired_deliveries, rows_staged, source_rows, in_pool }], pool: { candidate, enriching, held, complete, junk } }

### deliveries
The common pool's deliveries, newest first, with rows counted by state across staging, source rows and companies.
- Risk: R0
- Parameters: source_code (optional, string)
- Returns: { deliveries: [{ id, label, source_code, as_of, status, staged, staged_junk, staged_held, source_rows, unmatched, complete, waiting, held, junk, duplicates }] }

### delivery_rows
The companies one delivery fed, filtered by state, each with its Complete progress and open checks.
- Risk: R0
- Parameters: load_id (required, string), state (optional, string — all|waiting|complete|held|junk|duplicate|unmatched), limit (optional, number, default 50, max 200), offset (optional, number)
- Returns: { state, total, rows: [{ company_id, name, city, lifecycle_state, junk_reason, needs_review, duplicate_of_id, passed, total_checks, open: [{ key, label, status }] }] }

### company
One company in full: the Complete test, which source won each field, and every source row behind it.
- Risk: R0
- Parameters: company_id (required, string)
- Returns: { company: {...} | null, sources: [{ source_code, tier, load_label, load_kind, as_of, method, model, is_decision, ... }], provenance: { rows: [{ field, label, value, from, wins_over? }], enrichment }, reason?: 'NOT_FOUND' }

### industries
The one industry master as a tree, with how many pool companies sit under each node.
- Risk: R0
- Parameters: none
- Returns: { industries: [{ id, code, name, nic_prefixes, source, in_pool, companies, children: [...] }] }

### decide
A person's decision on one company: company, individual (junk: out of scope), not_duplicate, junk (with a reason) or restore.
- Risk: R2
- Parameters: company_id (required, string), decision (required, string — company|individual|not_duplicate|junk|restore), reason (optional, string — required for junk: placeholder|unreadable|consumer|defunct|out_of_scope|spam_source)
- Returns: { company: { id, lifecycle_state, junk_reason, needs_review, is_individual, complete_checks } }

### retire_delivery
Withdraw a common-pool delivery without deleting it; every company it fed is re-derived and re-tested.
- Risk: R2
- Parameters: load_id (required, string)
- Returns: { retired, companies_retested }

### resolve
Queue the matching job for one delivery or the whole pool; reassess also re-derives every company.
- Risk: R2
- Parameters: load_id (optional, string), reassess (optional, boolean)
- Returns: { event_id, queued }

## Enrichment (release 4 — prototype documents/prototypes/p2c-pool-enrich.html)

Reading pool companies' own websites on the model router (`src/etl/pool-enrich.ts`,
worker event `POOL_ENRICH_REQUESTED`). Pool first (D-Q19 E3), records not tokens
(E4, `ENRICH_POOL_DAILY_RECORDS`), only companies with a website (E5), JavaScript-only
sites named (E6). What a run writes is an ENRICHMENT source — ranked below every
delivery, labelled with page, model and confidence, withdrawable (E1).

### workbench
The pool by level, Qualified or better, websites, today's records, the gaps and what fills them, deliveries, runs, and VaNi's suggested slice.
- Risk: R0
- Parameters: none
- Returns: { total, levels, qualified_plus, with_website, website_from_email, profile, limit: { daily, used, left }, gaps: [{ key, label, companies, filled_by, enrich }], deliveries: [{ id, label, companies, qualified_pct, as_of, eligible }], runs: [{ event_id, run_no, delivery_label, records, status, before_avg, after_avg }], suggestion }

### enrich_estimate
How many companies a slice matches, and what a run of them would take: tokens, companies per model on today's quota, time.
- Risk: R0
- Parameters: delivery (optional, string — a delivery id or all), raw_or_identified (optional, boolean, default true), industry_missing (optional, boolean), records (optional, number, default 100)
- Returns: { slice, matched, estimate: { records, limit, per_company, tokens, providers: [{ code, model, companies, text, off, paid }], unplaced, minutes } | null }

### start_enrich
Start an enrichment run on a slice. Refused past today's record limit; the estimate is rebuilt from the quota left now.
- Risk: R2
- Parameters: delivery (optional, string), raw_or_identified (optional, boolean), industry_missing (optional, boolean), records (required, number)
- Returns: { event_id, run_no, records, estimate }

### enrich_run
One run: progress, the feed, before and now; when finished, what it did — by part, models, not read and why.
- Risk: R0
- Parameters: event_id (required, string)
- Returns: { run: { run_no, status, progress, counts, before, now, feed, models, tokens, withdrawn_at, ... } | null }

### withdraw_enrich_run
Take back everything one run wrote; the companies it touched are re-derived, re-tested and re-scored. Delivered data is untouched.
- Risk: R2
- Parameters: event_id (required, string)
- Returns: { event_id, run_no, companies_rescored, graph }

### stop_enrich_run
Stop a run between two companies: a queued run never starts; a running one finishes the company it is reading, then stops and releases the rest from today's records. What it wrote stays until withdrawn.
- Risk: R1
- Parameters: event_id (required, string)
- Returns: { event_id, stopped: 'before_start' | 'requested' }
