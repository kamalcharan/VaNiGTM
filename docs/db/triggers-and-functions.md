# Database logic inventory — triggers, functions, generated columns

**Phase 0, Item 1.** Purpose: establish what logic lives in the database rather
than in application code, so that Items 2 (`ki_*` disposition) and 3 (make RLS
real) can act without discovering behaviour by breaking it.

**This document deletes nothing and proposes no deletions as actions.** Dead-code
candidates are listed in §5 as candidates only.

## How this was produced, and its one caveat

Extracted from the live PostgreSQL catalog (`pg_trigger`, `pg_proc`,
`information_schema.columns`) of a database rebuilt locally from
`backend/migrations/*.sql` — all 125 migration files applied, `vn_migrations`
shows 125 rows. Call-site counts come from grepping `backend/src` and
`frontend/src`.

> **Caveat — re-verify against production before Items 2 and 3 act on this.**
> This inventory reflects the migration files, not the production database.
> A previous session already found `vn_migrations` drift in production (the
> runner reported "up to date" while a column was missing). Production may
> therefore hold objects this list does not, or lack objects it does. The
> counts below (114 tables, 29 triggers, 75 functions, 9 generated columns)
> match the numbers previously observed in production, which is reassuring but
> not proof. Re-run the extraction queries in §7 against a production restore
> before treating §5 as actionable.

## Headline findings

1. **There is almost no hidden logic in the triggers.** 28 of the 29 triggers do
   nothing but stamp `updated_at`. Exactly one trigger has behaviour
   (§2.2), and it silently overrides a value the application sets.
2. **61% of the "75 functions" are not ours.** 46 are supplied by the `pgcrypto`
   and `uuid-ossp` extensions. Only 29 are project-authored.
3. **Of those 29, four are load-bearing.** `set_tenant_context`, `gt_next_seq`,
   `vani_ensure_seq_prefixes`, `vani_ensure_tag`. Six more are the trigger
   functions above. The remaining 19 have zero call sites.
4. **Migration 180 dropped ten tables but left their functions behind.**
   `DROP TABLE ... CASCADE` does not track plpgsql function bodies, so six
   functions still reference relations that no longer exist. They are not
   merely unused — they would raise `relation does not exist` if invoked.
5. **Two latent bugs found and reproduced** — see §6. Neither is on the VaNi AI
   path; both are in `ki_*` territory and feed directly into Item 2.

---

## 1. Classification key

| Tag | Meaning |
|---|---|
| `identity` | Computes a key or human-facing identifier other code matches on |
| `constraint` | Enforces a rule; rejects or coerces writes |
| `denorm` | Maintains a denormalised/derived value |
| `tenant` | Participates in tenant isolation |
| `unclear` | Purpose not determinable from body + call sites alone |

---

## 2. Triggers (29)

### 2.1 `updated_at` stamps — 28 of 29

All are `BEFORE UPDATE ... FOR EACH ROW`, all set `NEW.updated_at`, all
functionally identical. Classification: **`denorm`** (all).

The same three lines are duplicated across **five** separate functions. This is
redundancy, not divergence — the bodies were compared and match apart from
`now()` vs `CURRENT_TIMESTAMP`, which are equivalent here.

| Function | Body | Triggers | Tables |
|---|---|---|---|
| `update_updated_at()` | `NEW.updated_at = now()` | 11 | `gt_cadence_policy`, `gt_channel_types`, `gt_content_kinds`, `gt_journey_stories`, `gt_journeys`, `gt_touch_reservations`, `ki_clients`, `ki_contact_snapshots`, `ki_goals`, `ki_scheduler_configs`, `ki_snapshot_protection` |
| `vn_set_updated_at()` | `NEW.updated_at = now()` | 12 | `gt_contacts`, `gt_kb_sources`, `gt_kg_nodes`, `gt_presentations`, `gt_tenant_context`, `gt_tenant_integrations`, `gt_tenant_profile`, `vn_roles`, `vn_subscriptions`, `vn_tenant_profiles`, `vn_tenants`, `vn_users` |
| `ki_update_updated_at()` | `NEW.updated_at = CURRENT_TIMESTAMP` | 3 | `ki_file_uploads`, `ki_import_sessions`, `ki_import_staging` |
| `ki_corrections_updated_at()` | `NEW.updated_at = now()` | 1 | `ki_corrections` |
| `ki_touch_asset_assignment()` | `NEW.updated_at := NOW()` | 1 | `ki_customer_asset_assignments` |

Nothing here needs preserving beyond the `updated_at` behaviour itself. Any
future consolidation onto one function is cosmetic and carries no behavioural
risk — but it is **out of scope for Phase 0** and not proposed here.

### 2.2 The one trigger with behaviour

**`ki_subscription_session_limit`** — `BEFORE INSERT ON vn_subscriptions FOR EACH ROW`
→ `ki_set_session_limit()`

```sql
NEW.max_sessions := GREATEST(NEW.max_sessions, 5);
```

Classification: **`constraint`**.

This is genuine hidden logic and the only instance of it. Consequences worth
recording before anything touches `vn_subscriptions`:

- The application cannot set `max_sessions` below 5 on insert. A write of `1`
  silently becomes `5`, with no error. Any product intent to sell a
  single-session tier is defeated at the database layer.
- It contradicts `vn_get_max_sessions()`, which returns `COALESCE(v_max, 1)` —
  documented as "Default to 1 if no subscription found". So the codebase holds
  two different opinions about the floor (1 vs 5).
- It is `BEFORE INSERT` only. An `UPDATE` setting `max_sessions = 1` is **not**
  coerced. The floor is therefore not an invariant, only an insert-time default
  clamp — which means it cannot be relied on as one.
- Named `ki_*` on a `vn_*` table — a KI-Prime-era trigger on an auth table.
  Item 2 must treat this as evidence that `ki_` naming does not reliably mark
  KI-Prime-only surface.

---

## 3. Functions (75 = 46 extension + 29 project)

### 3.1 Extension-supplied (46) — not ours, do not audit

| Extension | Count | Names |
|---|---|---|
| `pgcrypto` | 36 | `armor`×2, `dearmor`, `crypt`, `digest`×2, `encrypt`, `encrypt_iv`, `decrypt`, `decrypt_iv`, `gen_random_bytes`, `gen_random_uuid`, `gen_salt`×2, `hmac`×2, `pgp_armor_headers`, `pgp_key_id`, `pgp_pub_decrypt`×3, `pgp_pub_decrypt_bytea`×3, `pgp_pub_encrypt`×2, `pgp_pub_encrypt_bytea`×2, `pgp_sym_decrypt`×2, `pgp_sym_decrypt_bytea`×2, `pgp_sym_encrypt`×2, `pgp_sym_encrypt_bytea`×2 |
| `uuid-ossp` | 10 | `uuid_generate_v1`, `uuid_generate_v1mc`, `uuid_generate_v3`, `uuid_generate_v4`, `uuid_generate_v5`, `uuid_nil`, `uuid_ns_dns`, `uuid_ns_oid`, `uuid_ns_url`, `uuid_ns_x500` |

These are installed into `public`. Item 3 note: a non-BYPASSRLS role still needs
`EXECUTE` on these, which is default (`PUBLIC`), so no grant work is expected —
but confirm rather than assume.

### 3.2 Load-bearing — called at runtime (4)

| Function | Class | What it does | Call sites |
|---|---|---|---|
| `set_tenant_context(p_tenant_id text)` | `tenant` | **The entire tenant-isolation mechanism.** `SECURITY DEFINER`. Sets *two* GUCs via `set_config(..., is_local := true)`: `app.current_tenant_id` (used by migration 017+ policies) and `app.tenant_id` (used by the original migration 001 policies). Transaction-local. | `db/query.ts:113,152`, `db/pool.ts:104`, `cohort.ts:91` |
| `gt_next_seq(p_tenant_id uuid, p_type text)` | `identity` | Human-readable per-tenant IDs (`LEAD-0001`, `VN-0001`, `CONT-0001`). Self-seeds the `gt_seq_counters` row on first use with prefix = first 4 chars of type, uppercased. Increments under the `UPDATE`'s row lock. | 14 refs incl. `assessment.agent.ts:339,385`, `contact-bridge.ts:111` |
| `vani_ensure_seq_prefixes(p_tenant_id uuid)` | `identity` | Seeds `gt_seq_counters` with the VaNi prefixes `vani_lead`→`LEAD` and `vani_report`→`VN` so `gt_next_seq` does not fall back to its 4-char default. Idempotent (`ON CONFLICT DO NOTHING`). | `assessment.agent.ts:54` |
| `vani_ensure_tag(p_tenant_id uuid)` | `denorm` | Returns the id of the tenant's `VaNi assessment` tag, creating it if absent. Looks up by `slug = 'vani assessment'` — **with a space**, because `gt_tags.slug` is generated and maps non-alphanumerics to spaces (§4). | `contact-bridge.ts:142` |

**Two of these four are on the critical path for Item 3.**
`set_tenant_context` is what makes RLS work at all; the dual-GUC design means a
policy audit must check *both* setting names, and any policy referencing only
one of them is half-wired. Note also that it is `SECURITY DEFINER` — under a
non-BYPASSRLS role it will still execute as its owner, which is what you want,
but it must be verified rather than assumed after the role change.

`gt_next_seq` is **not** `SECURITY DEFINER` and writes to `gt_seq_counters`. If
that table carries an RLS policy, the new restricted role needs `SELECT`,
`INSERT` and `UPDATE` on it or **lead creation breaks**. This is the most likely
single point of failure when Item 3 flips the role.

### 3.3 Trigger functions (6)

Covered in §2. `update_updated_at`, `vn_set_updated_at`, `ki_update_updated_at`,
`ki_corrections_updated_at`, `ki_touch_asset_assignment` (all `denorm`);
`ki_set_session_limit` (`constraint`).

### 3.4 Resolvable but uncalled (13)

Tables intact, bodies would execute, **zero call sites** in `backend/src` or
`frontend/src`. Listed here rather than in §5 because they are not broken —
they are dormant. Several are plainly KI-Prime domain and are direct input to
Item 2.

| Function | Class | Notes |
|---|---|---|
| `ki_next_seq(uuid, text)` | `identity` | Predecessor of `gt_next_seq`, against `ki_sequences` (table still exists). Unlike `gt_next_seq` it does **not** self-seed — raises `Sequence not found: ... Ensure seedTenantData ran on signup`. |
| `ki_normalize_contact_name(text)` | `identity` | **Carries a bug — see §6.1.** `backend/src/etl/field-normalizers.ts:14` describes it as a function "whose only job was to mirror" the generated column, in the past tense. |
| `normalize_scheme_name(text)` | `identity` | Uppercase/trim/collapse-space. Only consumers are `lookup_scheme_by_alias` and `ki_alias_before_upsert`, both dead (§5). |
| `ki_mark_ended_schemes()` | `denorm` | Sets `ki_schemes.active = false` past `closure_date`. Returns row count. Table exists; nothing calls it and no scheduler entry was found. |
| `ki_rebuild_holdings_from_txn(uuid, boolean, integer)` | `denorm` | Recomputes `ki_holdings` from transactions. Table exists. |
| `resolve_customer_families(uuid, boolean)` | `identity` | Links `ki_clients` into `ki_families`. Both tables exist. |
| `process_single_customer_record(integer)` | `unclear` | 10k-char ETL. Writes `ki_clients`, `ki_contacts`, `ki_client_addresses`, `ki_contact_channels`, `ki_import_staging`. Referenced only in a **comment** at `etl/customer-processor.ts:9`. |
| `process_single_scheme_record(integer)` | `unclear` | Writes `ki_schemes`, `ki_import_staging`. |
| `process_customer_import_with_timing(integer, integer)` | `unclear` | Batch driver over the above; writes `ki_import_sessions`. |
| `process_scheme_import_with_timing(integer, integer)` | `unclear` | As above for schemes. Referenced only in a comment at `etl/etl.routes.ts:6`, which describes it as "Phase 2 (PostgreSQL RPC)" — i.e. an architecture that appears to have been superseded. |
| `vn_get_max_sessions(uuid)` | `constraint` | Session cap lookup; `COALESCE(v_max, 1)`. Contradicts §2.2. |
| `vn_get_active_sessions(uuid)` | — | Lists live `vn_refresh_tokens` rows. |
| `vn_cleanup_expired_sessions(integer)` | `denorm` | Revokes expired tokens, deletes past retention. **Nothing calls it and no cron was found** — meaning `vn_refresh_tokens` likely grows without bound. Worth confirming against production row counts; that is a real operational issue, not just dead code. |

> The four `process_*` functions plus `ki_process_txn_import_session` (§5) are
> ~47,000 characters of ETL logic in the database with no caller. If Item 2
> concludes the KI import path is retired, this is the largest single block of
> DB-resident logic that goes with it.

---

## 4. Generated columns (9)

All `GENERATED ALWAYS ... STORED`. **These cannot be inserted into or updated** —
attempting it raises `cannot insert a non-DEFAULT value into column`. This has
already caused one real bug in this project (migration 228 originally inserted
into `vn_tenants.is_active`).

| Table.column | Class | Expression, in words |
|---|---|---|
| `gt_contacts.person_key` | `identity` | `normalized_name` + `'\|'` + company discriminator, where the discriminator is `lower(trim(company_domain))`, falling back to a normalised `company_name`, falling back to `''`. **This is the blocking key the VaNi assessment contact-bridge dedupes on.** |
| `gt_contacts.normalized_name` | `identity` | Strip leading honorific (`MR\|MRS\|MS\|DR\|PROF\|SRI\|SMT`), strip non-`[A-Za-z0-9\s]`, collapse spaces, trim, uppercase. Correct — see §6.1 for the `ki_` variant that is not. |
| `gt_prospects.name_key` | `identity` | Uppercase, strip non-alphanumeric, remove company-suffix words (`PVT\|PRIVATE\|LTD\|LIMITED\|LLP\|INC\|CO\|COMPANY\|THE`), collapse, trim. |
| `gt_universe_company_sources.name_key` | `identity` | Byte-identical expression to `gt_prospects.name_key`. Intentional — the two are joined on it. Any change must be made to both or the join silently stops matching. |
| `gt_tags.slug` | `identity` | `lower(trim(collapse_spaces(replace non-alphanumeric with SPACE)))`. **Non-alphanumerics become spaces, not hyphens.** `'VaNi assessment'` → `'vani assessment'`. A previous session lost time assuming `'vani-assessment'`. |
| `gt_industry_aliases.raw_key` | `identity` | `lower(...)`, non-alphanumeric → space, trim. |
| `gt_tenant_profile.is_complete` | `denorm` | `completion_score >= 60`. The threshold is in the schema, not the app. |
| `vn_tenants.is_active` | `denorm` | `status = 'active'`. Same note — the definition of "active" is a column. |
| `ki_contacts.normalized_name` | `identity` | Intended as the `gt_contacts` equivalent. **Broken — see §6.1.** |

---

## 5. Dead-code candidates (7) — listed, not actioned

**No deletion is proposed or performed here.** These are recorded so Item 2 can
decide, and so nobody mistakes them for live behaviour.

### 5.1 Functions referencing tables that no longer exist (5)

`backend/migrations/180_gt_drop_mfd_orphans.sql` dropped ten MFD-era tables —
`ki_alerts`, `ki_goal_projections`, `ki_market_data`, `ki_market_indices`,
`ki_market_jobs`, `ki_nav_history`, `ki_portfolios`, `ki_scheme_aliases`,
`ki_scheme_bookmarks`, `ki_scheme_categories`. It used `CASCADE`, which handles
dependent FKs and views but **does not** parse plpgsql bodies. These functions
survived and now point at nothing:

| Function | Dangling reference | Would fail with |
|---|---|---|
| `calculate_all_scheme_metrics()` | `ki_nav_history` | `relation "ki_nav_history" does not exist` |
| `calculate_scheme_metrics(text)` | `ki_nav_history` | ditto |
| `calculate_market_metrics(integer)` | `ki_market_data`, `ki_market_indices` | ditto |
| `lookup_scheme_by_alias(text)` | `ki_scheme_aliases` | ditto |
| `ki_process_txn_import_session(integer, text)` | `ki_portfolios`, `ki_scheme_aliases`, `ki_scheme_bookmarks` | ditto — confirmed live SQL at body lines 208, 212, 218, 249, 253, not comments |

All five have zero call sites. `ki_process_txn_import_session` is the 19k-char
one; its only mention anywhere in the codebase is a comment.

`set_tenant_context` also matches a grep for dropped table names, but **only in
a comment** listing which policies use which GUC. It is live and correct.

### 5.2 Orphaned trigger function (1)

`ki_alias_before_upsert()` — a trigger function with **no trigger attached** (the
only such function in the schema). It was attached to `ki_scheme_aliases`, which
migration 180 dropped. It is doubly dead: no trigger, and its target table is
gone.

### 5.3 Superseded (1)

`ki_next_seq(uuid, text)` — functionally replaced by `gt_next_seq`. Its table
`ki_sequences` still exists. Retire only together with a check that
`ki_sequences` holds no rows still needed for ID continuity.

---

## 6. Bugs found and reproduced

### 6.1 `ki_contacts.normalized_name` and `ki_normalize_contact_name()` destroy lowercase input

Both apply `regexp_replace(..., '[^A-Z0-9\s]', '', 'g')` **before** `upper()`.
The character class excludes lowercase letters, so every lowercase character is
deleted before the uppercase conversion runs.

Reproduced against the rebuilt schema:

| Expression | Input | Output |
|---|---|---|
| `gt_contacts.normalized_name` | `Kamal Charan` | `KAMAL CHARAN` ✅ |
| `ki_contacts.normalized_name` | `Kamal Charan` | `K C` ❌ |
| `ki_normalize_contact_name()` | `Kamal Charan` | `K C` ❌ |

The `gt_` version uses `[^A-Za-z0-9\s]` and is correct. Only initials survive in
the `ki_` version, so any dedupe or match on `ki_contacts.normalized_name`
collapses everyone sharing initials into one bucket.

**Not on the VaNi AI path** — the assessment contact-bridge uses
`gt_contacts.person_key` / `gt_contacts.normalized_name`. Impact is confined to
`ki_contacts`. Item 2 should establish whether `ki_contacts` holds real data
before deciding whether this is worth a migration; if the table is orphaned, the
bug retires with it. Fixing it would rewrite every stored value, so it is a data
migration, not a one-line change.

### 6.2 `vn_refresh_tokens` has a cleanup function that nothing calls

`vn_cleanup_expired_sessions(p_retention_days)` exists, is correct, and has no
caller and no scheduler entry. Unless cleanup happens elsewhere, expired refresh
tokens accumulate indefinitely.

**Confirmed against production, 2026-08-10:** `vn_refresh_tokens` holds **334
rows, of which 24 are expired but still flagged `is_active`**. So the function
genuinely never runs. The scale is small — this is housekeeping, not an
incident — but the 24 stale-active rows are the part worth noting: any logic
that trusts `is_active` without also checking `expires_at` is reading 24 rows
as live sessions that are not. Cheapest fix is a cron calling the function that
already exists.

---

## 7. Reproducing this inventory

Run against a production restore before Items 2 and 3 rely on §5.

```sql
-- Triggers (29) with timing, events, and function
SELECT c.relname, t.tgname,
       CASE WHEN (t.tgtype::int & 2)>0 THEN 'BEFORE' ELSE 'AFTER' END AS timing,
       concat_ws(',', CASE WHEN (t.tgtype::int & 4)>0  THEN 'INSERT' END,
                      CASE WHEN (t.tgtype::int & 8)>0  THEN 'DELETE' END,
                      CASE WHEN (t.tgtype::int & 16)>0 THEN 'UPDATE' END) AS events,
       p.proname
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_proc  p ON p.oid = t.tgfoid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal AND n.nspname = 'public'
ORDER BY c.relname, t.tgname;

-- Project-authored functions only (excludes pgcrypto / uuid-ossp)
SELECT p.proname, pg_get_function_identity_arguments(p.oid),
       p.provolatile::text, p.prosecdef, length(p.prosrc), p.prosrc
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname NOT SIMILAR TO
      '(armor|dearmor|crypt|digest|decrypt%|encrypt%|gen_random%|gen_salt|hmac|pgp_%|uuid_%)'
ORDER BY p.proname;

-- Trigger functions with no trigger attached
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.prorettype = 'trigger'::regtype
  AND NOT EXISTS (SELECT 1 FROM pg_trigger t
                  WHERE t.tgfoid = p.oid AND NOT t.tgisinternal);

-- Generated columns (9)
SELECT table_name, column_name, generation_expression
FROM information_schema.columns
WHERE table_schema='public' AND is_generated='ALWAYS'
ORDER BY table_name;
```

---

## 8. What this means for Items 2 and 3

**Item 2 (`ki_*` disposition)** gains three inputs:

- Migration 180 already performed a conservative pass and documented its
  reasoning inline, including which `ki_*` tables it deliberately kept
  (`ki_holdings`, `ki_goals`, `ki_schemes`, `ki_transactions`,
  `ki_transaction_types`) and why. Start from that list rather than from zero.
- The `ki_` prefix is **not** a reliable marker. `ki_set_session_limit` is a
  `ki_`-named trigger sitting on the `vn_subscriptions` auth table, and
  `process_single_customer_record` is an unprefixed function writing exclusively
  to `ki_*` tables. Classify by what a table is referenced by, not by its name.
- ~47k characters of uncalled ETL logic (§3.4, §5.1) retire with the KI import
  path if that is where Item 2 lands.

**Item 3 (make RLS real)** gains two:

- `set_tenant_context` sets **two** GUCs, `app.current_tenant_id` and
  `app.tenant_id`. Any policy audit must check both; a policy reading only one
  is half-wired and will behave differently depending on which migration era
  wrote it.
- `gt_next_seq` is the highest-risk function under a restricted role: not
  `SECURITY DEFINER`, and it `INSERT`s and `UPDATE`s `gt_seq_counters` on the
  lead-creation path. If that table has a policy, the new role needs
  `SELECT`/`INSERT`/`UPDATE` on it or VaNi AI lead capture breaks. Put it first
  in the triage.
