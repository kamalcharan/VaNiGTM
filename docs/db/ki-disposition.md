# `ki_*` table disposition

**Phase 0, Item 2.** Classify every `ki_*` table as live, KI-Prime data, or
orphaned; rename orphans to `_deprecated_ki_*`; drop nothing.

---

## 0. RESOLVED — there is nothing to rename (2026-08-10)

The production table list arrived. It settles this item:

```
ki_file_uploads(-1)   ki_import_sessions(-1)   ki_import_staging(5945)
ki_pulse_config(-1)   ki_pulses(-1)            ki_pulse_sessions(-1)
ki_pulse_session_actions(-1)  ki_pulse_session_gaps(-1)
ki_pulse_session_observations(-1)
```

**Nine tables. Exactly the nine classified "live" in §3.1.** Every candidate in
§3.3 — all 29 of them — and every FK-pinned table in §3.2 **does not exist in
production.** They are artifacts of rebuilding the schema from migration files
that production was never fully built from.

So:

| Outcome | |
|---|---|
| Orphans to rename | **none** |
| KI-Prime data to export | **none** |
| Live `ki_*` tables to keep | **9** — the ETL import pipeline and the pulse cluster |
| Action required from migration 233 | **none.** It stays a no-op. |

**Migration 233 should not be run and does not need a candidate list.** Leave it
in the tree as the tested mechanism if a future environment ever does carry the
orphans; against this database it has no work to do. There is no two-week
rename-and-wait clock to start.

### Three claims in this document that production disproved

Recorded rather than deleted, because the reasoning is a useful warning:

1. **"Production holds at least twelve `ki_*` tables."** §1.1 inferred this from
   foreign keys: the live pulse tables carry FKs onto `ki_clients`,
   `ki_contacts` and `ki_contact_snapshots` in the rebuilt schema, and an FK
   cannot reference an absent table. Production has nine and none of those three
   exist — so the production pulse tables simply **do not carry those
   constraints**. The inference was sound about the rebuild and wrong about
   production. A constraint observed locally is not evidence about a database
   built by a different path.
2. **`ki_ext_ref_types` pins `vn_tenants`.** §3.2 called
   `vn_tenants.ext_ref_type_code → ki_ext_ref_types(code)` "the only FK from the
   `gt_*`/`vn_*` side into `ki_*` anywhere in the schema" and flagged it as the
   one thing blocking a clean Phase 1 cut. **That table does not exist in
   production, so neither does the coupling.** The clean cut is available.
3. **The near-duplicate pairs** (`ki_contact_snapshot` vs `ki_contact_snapshots`,
   `ki_scheduler_configs` vs `ki_job_scheduler_configs`) exist only in the
   rebuild. Nothing to reconcile.

`ki_import_staging` is the only `ki_*` table production has bothered to analyze
(5,945 rows); the rest show `-1`, meaning never analyzed — consistent with the
pulse cluster being provisioned but lightly used.

Everything from §1 onward is the original analysis against the local rebuild.
It is kept because §3.1's live-table reasoning is what the production list
confirms, and because the signal methodology in §1.2 is reusable. **Read §0
first and treat the rest as working.**

---

**Status: RESOLVED (§0). No rename needed.** The original analysis below reached
"29 candidates pending row counts"; the production list showed those 29 tables
do not exist there at all.

---

## 1. Two blocking corrections to the work order's premise

### 1.1 There are 42 tables, not 41 — and production has 9

> **Superseded by §0.** Production has exactly the nine tables the WS2.1
> snapshot listed. The "at least twelve" inference below was wrong — see §0.
> Kept for the reasoning.

The work order says "41 tables — roughly a third of the schema." The schema
rebuilt from `backend/migrations/*.sql` (all 125 files applied) has **42**
`ki_*` base tables. That count is listed in full in §4.

But production does not appear to match. The WS2.1 production snapshot
(`current_database = vani_gtm_db`) listed only **nine** `ki_*` tables:

```
ki_file_uploads  ki_import_sessions  ki_import_staging
ki_pulse_config  ki_pulses  ki_pulse_sessions
ki_pulse_session_actions  ki_pulse_session_gaps  ki_pulse_session_observations
```

Independently, those are almost exactly the tables that signal 1 finds
referenced in application code (§4). Two methods agreeing is worth something.

**But that snapshot is provably incomplete, so it cannot be trusted as-is.**
Its own `COUNT(*)` returned **81** while only **76** distinct table names
survive in the pasted result — roughly five names were lost. And the foreign-key
structure proves at least three more `ki_*` tables must exist in production:
`ki_pulse_config`, `ki_pulse_sessions` and `ki_pulses` carry FKs onto
`ki_clients`, `ki_contacts` and `ki_contact_snapshots` (§4). A foreign key
cannot reference a table that does not exist. So production holds **at least
twelve** `ki_*` tables, not nine — unless its pulse tables were created without
those constraints, which is itself something to check.

**Consequence:** the rename step must not be run from this document's list. It
must be generated from a fresh production listing. §6 has that query and §7 has
a migration written to rename only what actually exists and is confirmed
orphaned.

### 1.2 Signal 4, as written, does not discriminate — and signal 4's dead ends matter more

The work order's fourth signal is "touched by any trigger or function from Item
1." Applied literally it is close to useless in both directions:

- **Triggers**: Item 1 established that 28 of the 29 triggers do nothing but
  stamp `updated_at`. Seven `ki_*` tables carry one. An `updated_at` trigger is
  not evidence a table is used; it is evidence someone ran a template. Counting
  it would mark seven dead tables as live.
- **Functions**: thirteen `ki_*` tables are written to by a stored function. But
  **every one of those functions has zero call sites** (Item 1 §3.4 and §5.1),
  and five of them reference tables migration 180 already dropped, so they would
  raise `relation does not exist` if anyone invoked them. A dead function
  touching a table is not evidence of life either.

So signal 4 is applied here in its useful form: **touched by a trigger or
function that is itself reachable from application code.** Under that reading,
signal 4 returns **zero** live `ki_*` tables. Both raw and qualified readings
are shown in §4 so the judgement is visible rather than buried.

This is the specific way Item 1 paid for itself: without the call-site analysis,
thirteen tables would have looked live.

---

## 2. Signal definitions as applied

| # | Signal | How it was gathered | Status |
|---|---|---|---|
| 1 | Referenced in application code | `grep` over `backend/src` + `frontend/src` for `.ts`/`.tsx`/`.sql`, comment lines excluded | ✅ complete |
| 2 | Rows written in the last 90 days | Requires production | ❌ **blocked** — SQL in §6.2 |
| 3 | Target of an FK from any `gt_*` or `vn_*` table | `pg_constraint` | ✅ complete |
| 4 | Touched by a *reachable* trigger or function | `pg_trigger` + `pg_proc.prosrc`, qualified per §1.2 | ✅ complete |

A fifth signal was added because signals 1–4 miss it: **FK parent of a live
table.** A table with no code reference of its own still cannot be renamed if a
live table points at it — the constraint breaks. Three tables are pinned only by
this, and one pins an auth table (§3.2).

---

## 3. Classification

### 3.1 Live — keep (9)

Referenced in application code. Two clusters, both real.

| Table | Refs | Why it stays |
|---|---|---|
| `ki_import_staging` | 29 | ETL import row staging. The single most-referenced `ki_*` table. |
| `ki_import_sessions` | 19 | ETL session/batch header; import dashboard reads it. |
| `ki_file_uploads` | 6 | Uploaded-file records feeding the import pipeline. |
| `ki_pulse_config` | 16 (SQL) | pulse-skill configuration. Backs `/pulses` ("Follow-ups" in the nav). |
| `ki_pulse_sessions` | 7 (SQL) | pulse-skill session header. |
| `ki_pulses` | 4 (SQL) | The pulses themselves. |
| `ki_pulse_session_actions` | 1 (SQL) | Child of `ki_pulse_sessions`. |
| `ki_pulse_session_gaps` | 1 (SQL) | Child of `ki_pulse_sessions`. |
| `ki_pulse_session_observations` | 0 | **Kept on structure, not code.** FK child of `ki_pulse_sessions` and present in the production snapshot. Zero code references — worth confirming it is written by the pulse skill at all before the eventual drop decision, but it is not a Phase 0 rename candidate. |

`CLAUDE.md` already flags the import pipeline and pulses as intentionally
retained. This confirms it against the code rather than restating it.

### 3.2 Pinned by a foreign key — cannot be renamed (4)

No code references of their own, but a live table points at them. Renaming any
of these breaks a constraint on a live table.

| Table | Pinned by | Note |
|---|---|---|
| `ki_clients` | `ki_pulse_config`, `ki_pulse_sessions` (both live) — plus 8 more `ki_*` | The hub of the whole `ki_` cluster: ten inbound FKs. |
| `ki_contacts` | `ki_pulses`, `ki_pulse_config`, `ki_pulse_sessions` (all live) | Also carries the broken `normalized_name` generated column — Item 1 §6.1. |
| `ki_contact_snapshots` | `ki_pulses` (live) | Parent of the six `ki_snapshot_*` tables. |
| `ki_ext_ref_types` | **`vn_tenants`** | The only FK from the `gt_*`/`vn_*` side into `ki_*` in the entire schema: `vn_tenants.ext_ref_type_code → ki_ext_ref_types(code)`. A KI-Prime lookup table pinned to the tenant table. Untangling this is a Phase 1 concern, not Phase 0. |

`ki_ext_ref_types` is the single structural fact that prevents "move all `ki_*`
to the KI-Prime database" from being a clean cut. It should be recorded as a
known coupling wherever the Phase 1 schema split is planned.

### 3.3 KI-Prime data or orphaned — split needs signal 2 (29)

None of these have a code reference, an FK from `gt_*`/`vn_*`, a reachable
function, or a live table pointing at them. They are all rename candidates in
principle.

**The work order asks them to be split into "KI-Prime data" (export, hand over,
then treat as orphaned) and "orphaned" (nothing at all). That split is exactly
signal 2 — does the table hold rows — and it cannot be made from this sandbox.**
Rather than guess, they are grouped below by domain, with the row-count query in
§6.2 to settle each one.

**Financial-planning snapshots (7)** — `ki_contact_snapshot` (singular),
`ki_snapshot_assets`, `ki_snapshot_expenses`, `ki_snapshot_goals`,
`ki_snapshot_income`, `ki_snapshot_liabilities`, `ki_snapshot_protection`

> `ki_contact_snapshot` (singular, 13 columns, migration 119) is superseded by
> `ki_contact_snapshots` (plural, 25 columns, migration 121). It has zero
> inbound FKs, zero code references and no trigger. It is the **strongest
> orphan candidate in the schema** — a leftover from a rename that kept both.

**Mutual-fund / holdings domain (4)** — `ki_holdings`, `ki_transactions`,
`ki_transaction_types`, `ki_schemes`

> Migration 180 explicitly kept these four ("etl-skill scheme import infra",
> "client-skill stat counts"). Item 1 shows the functions that would use them
> (`ki_rebuild_holdings_from_txn`, `ki_process_txn_import_session`,
> `ki_mark_ended_schemes`) all have zero call sites, and the frontend endpoints
> that advertise them are dead: `/api/v1/nav/*` is **not mounted on the backend
> at all**, and `/api/v1/etl/rebuild-holdings` has no implementation. The
> "retained" rationale in 180 no longer holds. Confirm with row counts.

**Client / contact detail (5)** — `ki_client_addresses`, `ki_contact_channels`,
`ki_client_bookmarks`, `ki_bookmark_reasons`, `ki_families`

**Reference lookups (4)** — `ki_asset_types`, `ki_liability_types`,
`ki_customer_id_types`, `ki_job_types`

**Corrections (3)** — `ki_corrections`, `ki_correction_steps`,
`ki_customer_asset_assignments`

**Scheduling (3)** — `ki_scheduler_configs`, `ki_scheduler_executions`,
`ki_job_scheduler_configs`

> A second near-duplicate pair: `ki_scheduler_configs` (14 columns, migration
> 105, NAV system) vs `ki_job_scheduler_configs` (18 columns, migration 118).
> The NAV-era one belongs to the subsystem migration 180 dismantled.

**Other (3)** — `ki_goals`, `ki_intake_tokens`, `ki_sequences`

> `ki_sequences` backs `ki_next_seq()`, superseded by `gt_next_seq()`. Before
> retiring it, confirm it holds no counter still needed for ID continuity —
> renaming it would make `ki_next_seq` raise its "Ensure seedTenantData ran on
> signup" error rather than fail silently, which is at least loud.

### 3.4 Confirmed orphaned — zero on every signal (0 pending signal 2)

No table is marked confirmed-orphaned in this document. Every candidate in §3.3
is missing signal 2, and the work order's own risk note is the reason to hold:
*"the rename-and-wait step exists specifically so that nothing irreversible
happens while anyone is still guessing."* A rename is reversible, but a rename
of a table that turns out to hold live KI-Prime data still causes an outage in
KI-Prime. Row counts first.

---

## 4. Full signal matrix (42 tables)

Signal 1 = real (non-comment) code references, `.ts`/`.tsx` + `.sql`.
Signal 3 = FK from a `gt_*`/`vn_*` table. Signal 4 raw / qualified per §1.2.
Signal 5 = FK parent of a live table.

| Table | S1 code | S3 gt/vn FK | S4 raw | S4 qualified | S5 pins | Class |
|---|---|---|---|---|---|---|
| `ki_asset_types` | 0 | – | – | – | – | candidate |
| `ki_bookmark_reasons` | 0 | – | – | – | – | candidate |
| `ki_client_addresses` | 0 | – | fn (dead) | – | – | candidate |
| `ki_client_bookmarks` | 0 | – | – | – | – | candidate |
| `ki_clients` | 0 | – | 1 trg + fn (dead) | – | **live** | **pinned** |
| `ki_contact_channels` | 0 | – | fn (dead) | – | – | candidate |
| `ki_contact_snapshot` | 0 | – | – | – | – | candidate ⚠️ dup |
| `ki_contact_snapshots` | 0 | – | 1 trg | – | **live** | **pinned** |
| `ki_contacts` | 0 | – | fn (dead) | – | **live** | **pinned** |
| `ki_correction_steps` | 0 | – | – | – | – | candidate |
| `ki_corrections` | 0 | – | 1 trg | – | – | candidate |
| `ki_customer_asset_assignments` | 0 | – | 1 trg | – | – | candidate |
| `ki_customer_id_types` | 0 | – | – | – | – | candidate |
| `ki_ext_ref_types` | 0 | **`vn_tenants`** | – | – | – | **pinned** |
| `ki_families` | 0 | – | fn (dead) | – | – | candidate |
| `ki_file_uploads` | 6 | – | 1 trg | – | – | **live** |
| `ki_goals` | 0 | – | 1 trg | – | – | candidate |
| `ki_holdings` | 0 | – | fn (dead) | – | – | candidate |
| `ki_import_sessions` | 19 | – | 1 trg + fn (dead) | – | – | **live** |
| `ki_import_staging` | 29 | – | 1 trg + fn (dead) | – | – | **live** |
| `ki_intake_tokens` | 0 | – | – | – | – | candidate |
| `ki_job_scheduler_configs` | 0 | – | – | – | – | candidate ⚠️ dup |
| `ki_job_types` | 0 | – | – | – | – | candidate |
| `ki_liability_types` | 0 | – | – | – | – | candidate |
| `ki_pulse_config` | 16 | – | – | – | – | **live** |
| `ki_pulse_session_actions` | 1 | – | – | – | – | **live** |
| `ki_pulse_session_gaps` | 1 | – | – | – | – | **live** |
| `ki_pulse_session_observations` | 0 | – | – | – | – | **live** (structural) |
| `ki_pulse_sessions` | 7 | – | – | – | – | **live** |
| `ki_pulses` | 4 | – | fn (dead) | – | – | **live** |
| `ki_scheduler_configs` | 0 | – | 1 trg | – | – | candidate ⚠️ dup |
| `ki_scheduler_executions` | 0 | – | – | – | – | candidate |
| `ki_schemes` | 0 | – | fn (dead) | – | – | candidate |
| `ki_sequences` | 0 | – | fn (dead) | – | – | candidate |
| `ki_snapshot_assets` | 0 | – | – | – | – | candidate |
| `ki_snapshot_expenses` | 0 | – | – | – | – | candidate |
| `ki_snapshot_goals` | 0 | – | – | – | – | candidate |
| `ki_snapshot_income` | 0 | – | – | – | – | candidate |
| `ki_snapshot_liabilities` | 0 | – | – | – | – | candidate |
| `ki_snapshot_protection` | 0 | – | 1 trg | – | – | candidate |
| `ki_transaction_types` | 0 | – | fn (dead) | – | – | candidate |
| `ki_transactions` | 0 | – | fn (dead) | – | – | candidate |

Totals: **9 live**, **4 pinned**, **29 candidates**, **0 confirmed orphaned**
(pending signal 2). "fn (dead)" means a stored function writes to the table but
that function has no call site anywhere.

---

## 5. Findings worth acting on outside Phase 0

Recorded, not actioned — Phase 0 is explicit that no feature work happens here.

1. **`/api/v1/nav/*` is not mounted.** `frontend/src/lib/serviceURLs.ts` defines
   a whole `nav` block (`aliases`, `startBackfill`, `backfillProgress`, …) and
   `backend/src/server.ts` mounts no `/api/v1/nav` router. Every one of those
   entries 404s. The backfill it advertises targets `ki_scheme_aliases`, which
   migration 180 dropped.
2. **`/api/v1/etl/rebuild-holdings` is advertised but unimplemented.** Listed in
   `serviceURLs.ts` with a description; no matching route in the ETL router.
3. **Demo-data UI copy names a table directly.** `demo-data/page.tsx:224` tells
   the user "Your **contacts** (`ki_contacts`) will not be deleted." If
   `ki_contacts` is ever renamed or moved, that sentence becomes false to a
   user's face. Fix the copy in the same change.
4. **`ki_set_session_limit` is a `ki_`-named trigger on `vn_subscriptions`.**
   From Item 1 §2.2. Confirms the `ki_` prefix is unreliable as a boundary
   marker in both directions.

---

## 6. What Charan must run to finish Item 2

All three steps are against **production**, in this order. Step 6.1 is the work
order's own precondition and comes before everything.

### 6.1 Backup, and verify the restore — before anything else

```bash
# On the VPS
TS=$(date +%Y%m%d-%H%M)
pg_dump -Fc -d vani_gtm_db -f /var/backups/vani_gtm_db-$TS.dump

# Verify it actually restores — a backup that has not been restored is a guess
createdb vani_gtm_scratch
pg_restore -d vani_gtm_scratch /var/backups/vani_gtm_db-$TS.dump
psql -d vani_gtm_scratch -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"
# Must match production's count. If it does not, stop and investigate.
```

Keep `vani_gtm_scratch` — Item 3 needs a restored copy to work in.

### 6.2 Gather signal 2 and the real table list

Run against production (or the scratch restore, which is safer and equivalent
for counts). Paste the output back.

```sql
-- (a) The authoritative ki_* list. This supersedes §4 for the rename.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  AND table_name LIKE 'ki\_%'
ORDER BY 1;

-- (b) Signal 2 — live row counts and recent-write evidence, per table.
--     Generates one query per ki_* table; run the generated SQL.
SELECT string_agg(
  format(
    'SELECT %L AS tbl, count(*) AS rows, max(%s)::text AS last_write FROM %I',
    c.relname,
    COALESCE(
      (SELECT a.attname FROM pg_attribute a
        WHERE a.attrelid = c.oid AND a.attname IN ('updated_at','created_at')
        ORDER BY a.attname = 'updated_at' DESC LIMIT 1),
      'NULL::timestamptz'),
    c.relname),
  E'\nUNION ALL\n' ORDER BY c.relname)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'ki\_%';

-- (c) Confirm the pulse cluster's FKs really exist in production.
--     If these are absent, §1.1's inference is wrong and §3.2 needs revisiting.
SELECT conrelid::regclass AS child, confrelid::regclass AS parent, conname
FROM pg_constraint
WHERE contype = 'f'
  AND (conrelid::regclass::text LIKE 'ki_pulse%'
       OR confrelid::regclass::text LIKE 'ki\_%')
ORDER BY 1, 2;
```

### 6.3 Decide, then rename

With (a) and (b) in hand:

- **Rows > 0 and the domain is KI-Prime** → export first, hand to the KI-Prime
  database, *then* rename. The work order is explicit that export precedes
  treating it as orphaned.
- **Rows = 0, no signal** → orphaned. Rename.
- **Anything in §3.1 or §3.2** → leave alone regardless of row count.

Then run the migration in §7.

---

## 7. The rename migration

Written but **deliberately left with an empty table list.** Fill it from §6.2(a)
∩ the orphan decision — never from §4, which describes a locally rebuilt schema
and lists tables production may not have.

The migration is written to be safe on a production database that does not match
this document: it skips tables that do not exist, refuses to touch anything with
rows, and refuses to touch anything a surviving table still points at.

Saved as `backend/migrations/233_ki_deprecate_orphans.sql`.

Rollback is the inverse rename and is included in the file as a comment block —
one `ALTER TABLE ... RENAME` per table, no data movement.

### It was tested, and the test found a bug

Exercised against a scratch copy of the rebuilt schema (`CREATE DATABASE …
TEMPLATE`), not just read:

| Case | Candidate | Result |
|---|---|---|
| Empty list | — | `nothing to do`, clean no-op |
| Clean orphan | `ki_contact_snapshot` | renamed |
| Pinned by live table | `ki_clients` | skipped, blockers named |
| Holds rows | `ki_ext_ref_types` (5 rows) | skipped |
| Absent from database | `ki_does_not_exist` | skipped |
| Whole dependent cluster | 6 × `ki_snapshot_*` | all 6 renamed |
| Rollback | 7 renamed tables | all restored, 0 residual, count back to 42 |

The first run surfaced an **order-dependence bug**: once a candidate was
renamed, the blocker check saw it as `_deprecated_<name>`, which no longer
matched the candidate array, so it was reported as a live blocker for
candidates processed later. `ki_contact_snapshots` was wrongly blocked by
`_deprecated_ki_snapshot_income`. The check now strips the `_deprecated_`
prefix before the membership test, and on re-run `ki_contact_snapshots` is
blocked only by `ki_pulses` — the genuinely live table. Without the test this
would have made the migration's output depend on the order of the array,
which is exactly the kind of thing that looks fine in review.

### After it runs

1. Deploy. Confirm the assessment funnel still answers — it is live and taking
   LinkedIn traffic; that is the standing constraint on all of Phase 0.
2. Watch the logs for `relation "ki_..." does not exist` for **two weeks**.
3. Only after two clean weeks, drop — as a separate one-line change, not part of
   this one.

Start the clock in `CLAUDE.md` when the rename deploys, with the date.

---

## 8. Which `ki_*` tables remain and why — for `CLAUDE.md`

> **Retained `ki_*` tables.** Nine are live: the ETL import pipeline
> (`ki_import_staging`, `ki_import_sessions`, `ki_file_uploads`) and the pulse
> cluster (`ki_pulse_config`, `ki_pulses`, `ki_pulse_sessions`,
> `ki_pulse_session_actions`, `ki_pulse_session_gaps`,
> `ki_pulse_session_observations`). Four more cannot be renamed because a live
> table or `vn_tenants` holds a foreign key onto them: `ki_clients`,
> `ki_contacts`, `ki_contact_snapshots`, `ki_ext_ref_types`. In particular
> `vn_tenants.ext_ref_type_code → ki_ext_ref_types(code)` is the only FK from
> the `gt_*`/`vn_*` side into `ki_*` anywhere in the schema — untangling it is a
> Phase 1 item. Everything else is a rename candidate pending row counts; see
> `docs/db/ki-disposition.md`.
