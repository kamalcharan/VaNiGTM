# RLS status — enforcement, exemptions, and what still blocks the cutover

**Phase 0, Item 3.** Goal, in the work order's words: not "turn RLS on", but
*make the bypass role unnecessary for normal operation, and make the remaining
exceptions explicit, few, and documented.*

**Status: mechanism proven, code fixes done, cutover not performed.** The work
was done in a local rebuild — which is what step 1 of the work order requires
("work in a restored copy, never production").

> **Read §1, §2 and §3 first.** Production numbers arrived on 2026-08-10 and
> disproved three things this document originally asserted, including its
> headline "correction to the premise", which was itself the thing that needed
> correcting. Where local and production disagree, production wins. The net
> effect is that the cutover is **less** dangerous than this document first
> claimed: the policy bug does not exist in production, the role and grant
> script already exist, and only migration 235 is actually required.

---

## 1. The role — the work order was right, an earlier draft of this doc was not

**Corrected 2026-08-10 against production.** An earlier version of this section
claimed `vikuna_admin` does *not* hold `BYPASSRLS` and bypasses RLS purely by
being a `SUPERUSER`, and called that "a correction to the premise." That was
read off a **locally rebuilt** schema, where the role happens to be created
without the attribute. Production says otherwise:

```
vikuna_admin   super=true   bypassrls=true      <- production
vikuna_admin   super=true   bypassrls=false     <- local rebuild (the artifact)
```

The work order's original wording was accurate. There was no premise to correct.

The **practical** guidance is unchanged and still worth stating, because
production holds *both* attributes: dropping `BYPASSRLS` alone would leave the
role a superuser and change nothing. The application role must be
**`NOSUPERUSER NOBYPASSRLS`**, and check 0 of the isolation test (§6) verifies
both before asserting anything else.

### Application roles already exist — do not create a new one blind

Production also has seven non-superuser, non-bypassrls login roles that the
local rebuild does not:

```
vanigtm_app   vn_app   ki_app   fk_app   kd_app   kd_readonly   vikuna_api
      all: super=false  bypassrls=false
```

`vanigtm_app` is the role this cutover was always meant to use — the repo
already carries `scripts/grant-vanigtm-app.sql` and
`docs/rls-cutover-checklist.md` for exactly that, both of which correctly
describe `vikuna_admin` as `rolsuper=true, rolbypassrls=true`. **Do not create
a new role; see §8.**

---

## 2. Where the schema stands

**Two columns, because they disagree.** Everything in this document below §2
was measured on the local rebuild. Production is consistently *smaller* — it
was evidently bootstrapped from a subset rather than by replaying every
migration, even though `vn_migrations` records the same 125 filenames in both.
Trust the production column.

| | Local rebuild | **Production** |
|---|---|---|
| Base tables in `public` | 114 | **81** |
| — `ki_*` | 42 | **9** |
| — `gt_*` | 58 | 58 |
| — `vn_*` | 14 | 14 |
| Tables with RLS enabled | 76 | **53** |
| Policies total | 77 | **55** |
| Triggers | 29 | **22** |
| Project-authored functions | 29 | **29** ✅ |
| `GENERATED ALWAYS` columns | 9 | **8** |

The `gt_*` and `vn_*` counts match exactly; the entire divergence is `ki_*` and
what hangs off it. The missing generated column is `ki_contacts.normalized_name`
— the table does not exist in production, so the bug in §6.1 of
`triggers-and-functions.md` has no data to affect there.

Local-rebuild breakdown, retained because the `gt_*`/`vn_*` half of it holds:

| | Count (local) |
|---|---|
| — with a `tenant_id` column | 94 |
|  · with RLS enabled | **75** |
|  · **without RLS** | **19** ⚠️ |
| — with no `tenant_id` column | 20 |
|  · with RLS enabled | 1 (`gt_channel_types`, read-all) |

Policies by GUC — `set_tenant_context()` sets **both** names, and both are in
live use:

| GUC read | Policies | Which |
|---|---|---|
| `app.current_tenant_id` | 72 | Everything from migration 017 onward |
| `app.tenant_id` | 4 | `ki_clients`, `ki_goals`, `ki_holdings`, `ki_transactions` — original migration 001 |
| none (`USING (true)`) | 1 | `gt_channel_types_read`, a lookup read-all |

Do not consolidate onto one GUC without changing `set_tenant_context` in the
same commit. Migration 234 deliberately keeps each policy on the name it
already reads.

---

## 3. The bug that would have taken the site down — but not in production

> **Verified 2026-08-10: production is already safe from this one.**
>
> ```
> unguarded=0   guarded=54   total=55      <- production
> unguarded=68  guarded=0    total=77      <- local rebuild
> ```
>
> Every policy in production already uses the `NULLIF` form, and the legacy
> `app.tenant_id` GUC is used by **zero** policies there (54 of 55 read
> `app.current_tenant_id`; the remaining one is the read-all lookup). So
> **migration 234 is a no-op against production** — it rewrites 54 policies to
> definitions identical to what they already are. It stays in the tree because
> it is idempotent, because it is what makes a *fresh* database from these
> migration files correct, and because the migration files are what any new
> environment is built from.
>
> The bug below is therefore real in the **migration files**, not in the running
> database. Keep it fixed; stop treating it as a production hazard.
>
> This also removes the one thing that made the cutover look dangerous. Combined
> with §1, the picture is much better than this document originally painted.



Switching to a non-superuser role broke the assessment flow on the **second
query**, with:

```
error: invalid input syntax for type uuid: ""
```

**Mechanism.** 68 policies were written as:

```sql
tenant_id = (current_setting('app.current_tenant_id', true))::uuid
```

`current_setting(…, true)` returns `NULL` when the setting has never been
defined — so on a *fresh* connection the policy yields NULL and the table is
correctly fail-closed. But `set_tenant_context()` uses
`set_config(…, is_local := true)`, which is transaction-local. After that
transaction commits, the setting is **not undefined again — it is defined and
empty**. `current_setting` then returns `''`, and `''::uuid` raises.

Reproduced directly:

```
fresh session:                current_setting(...) IS NULL  →  t
after BEGIN/set/COMMIT:       current_setting(...) IS NULL  →  f,  value = ''
next query on an RLS table:   ERROR: invalid input syntax for type uuid: ""
```

**Why it matters more than it looks.** Connections are pooled. The *first*
tenant-scoped transaction on a connection poisons that connection for every
later query that runs outside a transaction. It is invisible today only because
the superuser never evaluates the policy, so the cast never runs.

**This is CLAUDE.md lesson 1, half-diagnosed.** That lesson records the same
error and prescribes "wrap with BEGIN/COMMIT". The wrap is still required — but
the policy is *also* unsafe, and that half went unnoticed because RLS was
dormant. Fixing only the callers would have left the landmine in place.

**Fix** — `backend/migrations/234_rls_policy_hardening.sql`:

```sql
tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
```

Empty becomes NULL, NULL matches nothing, fail-closed in both states. The
migration rewrote **76** policies (68 with the cast bug, plus 8 that compared
`(tenant_id)::text` to the raw setting — those never had the bug but were a
second dialect doing the same job). It is idempotent, verified by re-running,
and **behaviourally inert while the runtime is still a superuser**, so it is
safe to deploy ahead of the cutover.

---

## 3.1 The second bug: platform rows disappear — CONFIRMED in production

> **Verified 2026-08-10. This one is real on the live database.**
>
> ```
> gt_tags:           1 platform row of 4      <- production
> gt_content_kinds:  8 platform rows of 8     <- production
> ```
>
> All eight `gt_content_kinds` rows are platform rows, so **that entire table
> goes dark for every tenant** the moment RLS is enforced without migration 235.
> `gt_tags` loses one row — the platform tag naming common-pool deliveries.
>
> Of the two migrations, **235 is the one production actually needs.** 234 is
> housekeeping for the migration files (§3); 235 prevents a live regression.

Migration 234 made the policies safe. It also made a latent problem visible.

Two tables use `tenant_id IS NULL` to mean *"belongs to the platform, everyone
sees it"*:

| Table | Platform rows | Effect under 234's policy |
|---|---|---|
| `gt_tags` | platform tags naming common-pool deliveries | platform tags vanish; `GET /etl/tags` selects `tenant_id IS NULL OR tenant_id = $1` and loses the first half |
| `gt_content_kinds` | **all 8 rows** | the entire table becomes invisible to every tenant |

`tenant_id = <uuid>` is NULL for a NULL `tenant_id`, so those rows are filtered
out. Measured: superuser sees 3 `gt_tags` rows including 1 platform row;
`vani_app` under tenant context saw 1 row and 0 platform rows.

This one would **not have raised an error**. Rows would simply have stopped
appearing — the failure mode that gets shipped.

**`backend/migrations/235_rls_platform_rows.sql`** splits each into two
policies:

```sql
<t>_platform_read  FOR SELECT USING (tenant_id IS NULL OR tenant_id = ctx)
<t>_tenant_write   FOR ALL    USING (tenant_id = ctx) WITH CHECK (tenant_id = ctx)
```

Permissive policies OR together, so reads see own + platform while INSERT,
UPDATE and DELETE stay confined to the tenant's own rows. A single
`FOR ALL USING (tenant_id IS NULL OR …)` would have used that same expression
as the INSERT check and let **any tenant mint a row every other tenant can
see** — turning a read bug into privilege escalation. Verified after applying:
platform tag visible, `gt_content_kinds` back to 8, cross-tenant tag still
invisible, and `INSERT … (NULL, 'x')` refused.

> **Open decision before cutover.** `POST /etl/tags` lets an admin tenant
> create a platform tag (`is_platform: true`, guarded by `auth.is_admin`).
> Under the write policy that INSERT is refused, because it requires
> `tenant_id = ` the caller's tenant. Left refused deliberately — the
> alternatives are letting every tenant write NULL-tenant rows, or keying a
> policy off an `app.is_admin` GUC that `set_tenant_context` does not set
> (a new mechanism, and Phase 0 is explicit about not designing). Admin
> platform-tag creation needs a separate maintenance role, a `SECURITY DEFINER`
> function, or that GUC. It still works today under the superuser.

## 4. What enforcement actually buys — measured, not asserted

Same database, same statements, two roles.

**As `vikuna_admin` (what production runs today):**

```
-- tenant context set to vikuna-consulting, writing a row owned by another tenant
INSERT INTO gt_lead (tenant_id, …) VALUES ('<charan-workspace-test>', 'LEAK-001', …);
→ WROTE INTO OTHER TENANT: LEAK-001 / e74c8ca4-…

-- no tenant context at all
SELECT count(*), count(DISTINCT tenant_id) FROM gt_lead;
→ 14 leads across 2 tenants
```

**As `vani_app` (`NOSUPERUSER NOBYPASSRLS`), identical statements:**

```
INSERT … → ERROR: new row violates row-level security policy for table "gt_lead"
SELECT  … → 0
```

Today, a single missing `WHERE tenant_id = $1` is a cross-tenant read *and* a
cross-tenant write. Under the restricted role both are refused by the database.

---

## 5. Triage — every raw `pool.query` path

The runtime has two ways to reach the database: `createTenantDb(pool, tenantId)`
(BEGIN → `set_tenant_context` → COMMIT, tenant-scoped) and raw `pool.query`
(no context). There are **96 raw `pool.query` call sites across 11 files** that
name a tenant-scoped table. Each is triaged into the work order's three
categories.

### 5.1 Legitimate cross-tenant — named exemptions (7 files)

| Path | Tables | Justification |
|---|---|---|
| `auth/auth.routes.ts`, `auth/auth.service.ts`, `auth/login.service.ts`, `auth/token.service.ts` | `vn_users`, `vn_refresh_tokens`, `vn_tenants`, `vn_user_roles`, `vn_roles`, `vn_invitations`, `vn_password_resets`, `vn_tenant_onboarding`, `vn_tenant_profiles`, `vn_subscriptions` | **Authentication precedes tenant context.** You cannot set a tenant context in order to discover which tenant a user belongs to. These tables must be readable before a tenant is known. |
| `agent-core/worker.ts`, `agent-core/event.store.ts` | `gt_events`, `gt_tenant_integrations` | **The event bus is deliberately cross-tenant** — the work order names `gt_events` explicitly. A single worker polls pending events for all tenants and then dispatches into a tenant context. |
| `cohort.ts` | `vn_tenants`, `gt_prospects` | An operator script that iterates tenants deliberately. It already calls `set_tenant_context` per tenant (`cohort.ts:91`) — the correct pattern for a cross-tenant tool. |

All of these tables currently have **no RLS**, so the exemption is already in
force. What is new here is that it is now *written down* rather than accidental.
That is the whole point of the item: exceptions that are explicit, few, and
justified.

### 5.2 Converted ✅

Both ETL files now route their RLS-touching queries through
`withTenantClient(pool, tenantId, fn)` (§5.4). Only six RLS-protected tables
were ever involved, not the whole 96-call surface:

| Path | RLS tables reached | Change |
|---|---|---|
| `etl/landing.ts` | `gt_prospects`, `gt_contacts`, `gt_contact_assignments`, `gt_campaigns` (reads); `gt_prospects`, `gt_contacts`, `gt_contact_channels` (writes) | Read phase wrapped in one tenant-scoped transaction; the write loop now runs inside `withTenantClient` instead of its own hand-rolled BEGIN/COMMIT. Per-row SAVEPOINTs are unaffected — a SAVEPOINT nests inside the surrounding transaction. |
| `etl/etl.routes.ts` | `gt_tags` ×3, `gt_load_tags`+`gt_tags` ×1 | Each wrapped. `POST /tags` runs its INSERT and its ON-CONFLICT fallback SELECT in one transaction so the fallback can see the row it conflicted with. |

Two latent cross-tenant bugs were fixed in passing — both the work order's
third category, *"a query that should have been tenant-scoped and wasn't;
flag these loudly, each one was a latent leak"*:

- `gt_source_loads` was read by `id` alone in `landSession`. Ids are
  enumerable, so one tenant could read another's load row by guessing.
- `ki_import_sessions` was updated by `id` alone at the end of `landSession`,
  letting one tenant rewrite another's session counters. That table has no RLS
  policy, so nothing else was stopping it.

### 5.3 The public report route — found by testing, not by reading

`AssessmentAgent.getReportByToken` is the `/r/:token` page: public, no auth,
and its comment explicitly said *"Uses the RAW pool, no tenant context."* That
reasoning is right about authorisation — the unguessable token is the
capability — but wrong about RLS. The query joins **four** policy-protected
tables (`gt_report`, `gt_assessment_response`, `gt_lead`, `gt_assessment_def`),
so under a restricted role it matched nothing and **every report link would
have rendered "This report link isn't valid."**

Capture succeeded; only the read failed. A smoke test that stopped at "lead
created" would have called the cutover clean.

Fixed by resolving the tenant the same way `getPublicDefinition` already does
(`resolveTenantId` — every VaNi assessment runs under `VANI_TENANT_SLUG`,
partner-referred ones included, since `gt_partner` rows are themselves
tenant-scoped) and keeping the token as the authorisation.

### 5.4 `getClientWithTenant` was removed, not fixed

`db/pool.ts` exported a helper that acquired a client, called
`set_tenant_context()` on it, and returned it. It could not work:
`is_local := true` scopes the GUC to the surrounding transaction, and outside
an explicit BEGIN that one statement *is* the transaction, so the context was
already gone when the caller got the client. Verified against a restricted
role — the pattern returns 0 rows.

It had **no callers**, so nothing was broken in practice, but it read as though
tenant context were handled. Replaced by `withTenantClient(pool, tenantId, fn)`
in `db/query.ts`, whose callback shape makes the transaction boundary
impossible to omit.

### 5.5 Already correct

`skills/assessment-skill/assessment.agent.ts` — the live funnel. Only 3 raw
`pool.query` calls, and the single one without a `tenant_id` filter is
`resolveTenantId()` against `vn_tenants`, which is legitimately unscoped
because it is what *resolves* the tenant. Everything else goes through
`createTenantDb` **and** carries an explicit `tenant_id = $tenant_id` in the
WHERE clause — belt and braces. `getPublicDefinition` is the pattern to copy.

The standing constraint for Phase 0 is that the assessment funnel must not go
down. On this evidence it is the part of the codebase least at risk from the
cutover.

---

## 6. The two-tenant isolation test

`deploy/vani-main-vps/rls-two-tenant-test.sql`. Run it as the application role
against a restored copy, then again after the production cutover:

```bash
PGPASSWORD=<pw> psql -h <host> -U vanigtm_app -d vani_gtm_db -f rls-two-tenant-test.sql
```

Result against the rebuilt schema with migration 234 applied:

```
PASS (0)  — running as vani_app (no superuser, no bypassrls)
PASS (1)  — testing with vikuna-consulting (13 leads) and charan-workspace-test (1 leads)
PASS (2)  — 0 rows visible with no tenant context
PASS (3)  — 0 rows visible with an empty (expired) tenant context
PASS (4)  — tenant vikuna-consulting sees exactly its own 13 rows
PASS (5)  — tenant charan-workspace-test sees exactly its own 1 rows
PASS (6)  — known tenant-B row unreachable by id from tenant A
PASS (7)  — cross-tenant INSERT refused by row-level security
PASS (8)  — gt_next_seq returned LEAD-0014 under the restricted role
PASS (9)  — vani_ensure_tag resolved tag id 1 under the restricted role
PASS (10) — no policy carries an unguarded ::uuid cast
```

Checks 8 and 9 exist because Item 1 identified `gt_next_seq` as the highest-risk
function under a restricted role: it is not `SECURITY DEFINER` and it INSERTs
and UPDATEs `gt_seq_counters` on the live lead-capture path. It passes.

**The test was verified to fail.** With `ALTER TABLE gt_lead DISABLE ROW LEVEL
SECURITY`, it aborts at check 2 with `FAIL (2) — 14 rows visible with NO tenant
context`. A test that has never failed is not evidence.

**Two harness bugs were found and fixed while building it**, both worth
recording because they are the natural way to write this test wrong:

1. It first built its tenant list from `gt_lead` with no context set — which
   correctly returned zero rows under RLS, leaving every later check comparing
   against NULL and reporting failures that were artifacts. *A test for RLS
   cannot gather its own fixtures through RLS.* It now bootstraps from
   `vn_tenants`, which is deliberately unscoped.
2. It picked "the two oldest tenants", drew one with no leads, and reported a
   vacuous pass. It now counts each tenant's rows inside that tenant's own
   context and picks the two that actually hold data.

---

## 7. The 19 tenant-scoped tables with no RLS

These have a `tenant_id` column and no policy. Under a restricted role they
remain fully readable across tenants — RLS off means no restriction, not
denial.

**Exempt by design** (§5.1): `vn_users`, `vn_refresh_tokens`, `vn_roles`,
`vn_invitations`, `vn_subscriptions`, `vn_subscription_history`,
`vn_tenant_onboarding`, `vn_tenant_profiles`, `vn_audit_log`, `vn_error_log`,
`gt_events`.

**Should get a policy, but not in Phase 0**: `gt_prompts`, `gt_source_loads`,
`gt_seq_counters`, `ki_file_uploads`, `ki_import_sessions`,
`ki_correction_steps`, `ki_scheduler_configs`, `ki_scheduler_executions`.

Deliberately **not** added here. Adding a policy to a table that is only ever
reached by raw `pool.query` converts a working path into a silently empty one —
`ki_file_uploads` and `ki_import_sessions` are exactly the ETL tables in §5.2.
The order must be: convert the call path to `createTenantDb`, verify, *then* add
the policy. Doing it the other way round breaks ETL to fix a leak that the
conversion would have fixed anyway.

`gt_seq_counters` deserves its own note: it is tenant-scoped and currently
unprotected, and `gt_next_seq` (not `SECURITY DEFINER`) INSERTs and UPDATEs it
on the lead path. If a policy is ever added there, the restricted role needs
`SELECT`/`INSERT`/`UPDATE` on it or lead capture stops. Check 8 of the test
covers this.

## 7.1 The 20 tables with no `tenant_id`

Per the work order's step 5. None of these can carry a tenant policy; they need
either a read-all policy or a named exemption.

| Group | Tables | Treatment |
|---|---|---|
| Reference lookups | `gt_channel_types` (already has a read-all policy), `gt_data_sources`, `gt_industries`, `gt_industry_aliases`, `gt_load_tags`, `ki_asset_types`, `ki_customer_id_types`, `ki_ext_ref_types`, `ki_job_types`, `ki_liability_types`, `ki_transaction_types`, `ki_schemes` | Read-all. Shared reference data with no tenant dimension. |
| Shared universe pool | `gt_universe_companies`, `gt_universe_company_aliases`, `gt_universe_company_sources` | **Named exemption.** Cross-tenant by design — the work order names it. |
| Import staging | `ki_import_staging` | **Named exemption.** Scoped by `session_id`, not tenant; the session row carries the tenant. |
| Auth / infra | `vn_tenants`, `vn_user_roles`, `vn_password_resets`, `vn_migrations` | **Named exemption.** Auth precedes tenant context (§5.1); `vn_migrations` is the migration runner's own bookkeeping. |

Only `gt_channel_types` has RLS today. The rest are unprotected, which for a
lookup table is equivalent to a read-all policy. Formalising that is cosmetic
and is **not** done here — it changes no behaviour and Phase 0 is explicit about
not doing work for elegance.

---

## 8. Cutover runbook — defer to the checklist that already exists

**Corrected 2026-08-10.** An earlier version of this section told you to
`CREATE ROLE vani_app`. That was wrong, and it duplicated work already done:

- **`scripts/grant-vanigtm-app.sql`** already grants a least-privilege role
  `vanigtm_app` everything it needs — tables, sequences, EXECUTE on functions
  (including the `SECURITY DEFINER` `set_tenant_context`), plus
  `ALTER DEFAULT PRIVILEGES` so future migrations do not silently create tables
  the app cannot read. It is idempotent, refuses to run as anyone but
  `vikuna_admin`, and grants no DDL.
- **`docs/rls-cutover-checklist.md`** is the ordered cutover procedure, with
  pre-flight, required fixes, proof steps and rollback.
- **`vanigtm_app` already exists in production**, non-superuser and
  non-bypassrls, along with six sibling roles.

Both files also state `vikuna_admin` is `rolsuper=true, rolbypassrls=true` —
which production confirms and this document previously got wrong (§1).

**Use those two artifacts as the runbook.** What Phase 0 adds on top:

| Step | Source | Phase 0 change |
|---|---|---|
| Backup + verified restore | `ki-disposition.md` §6.1 | unchanged — still first |
| Grant the role | `scripts/grant-vanigtm-app.sql` | unchanged. Do **not** create a new role. |
| Deploy migration 235 | new | **Required.** Platform rows go dark without it (§3.1) — confirmed live. |
| Deploy migration 234 | new | Optional against production (already-guarded policies, §3) but harmless and keeps fresh builds correct. |
| Required pre-cutover code fixes | checklist "REQUIRED pre-cutover fixes" | ETL and VaNi's `/r/:token` are **done** (§5.2, §5.3). The storyteller `gt_presentations` share route is **still open** — see below. |
| Proof | checklist Tests 1–3, plus `deploy/vani-main-vps/rls-two-tenant-test.sql` | The Phase 0 test is stricter: 11 checks, run as the app role, verified to fail when RLS is off. Run both. |
| Rollback | checklist | unchanged — point `DB_PRIMARY` back at `vikuna_admin`. |

### The one code fix still outstanding

The checklist flagged it before Phase 0 existed, and it is still unfixed:
**`GET /share/:token` on `gt_presentations`** (storyteller-skill) reads the raw
pool with no tenant context, so under `vanigtm_app` it returns 404 for every
valid token.

This is the *same bug* as VaNi's `/r/:token` (§5.3) — unsurprising, since
`getReportByToken` was written to mirror `gt_presentations.share_token`. The
VaNi one is fixed; the storyteller one is not. The fix used for VaNi is a
fourth option beyond the checklist's (a)/(b)/(c): **resolve the owning tenant,
then query inside `withTenantClient`, keeping the token as the authorisation.**
That works for VaNi because every assessment runs under one known tenant. It
does **not** transfer to `gt_presentations`, where any tenant can own a deck —
so the checklist's recommendation (a), a `SECURITY DEFINER`
`get_shared_deck(token)` scoped to `status = 'approved'`, remains the right
answer there.

### Still to exercise under the restricted role

Signup, login and the skills executor. Only the assessment flow has been run
end to end (against a local rebuild, passing). Do this against the scratch
restore before switching production.

---

## 9. Exemption register

Every exemption, with its justification, in one place — the work order's "done
when" condition.

| Exemption | Scope | Justification |
|---|---|---|
| Auth tables unscoped | `vn_users`, `vn_refresh_tokens`, `vn_tenants`, `vn_user_roles`, `vn_roles`, `vn_invitations`, `vn_password_resets`, `vn_tenant_onboarding`, `vn_tenant_profiles`, `vn_subscriptions`, `vn_subscription_history` | Authentication must resolve *which* tenant a user belongs to before any tenant context can exist. Scoping these is circular. |
| Event bus cross-tenant | `gt_events` | One worker polls pending events for all tenants, then dispatches into a per-tenant context. Named as deliberately cross-tenant in the work order. |
| Shared universe pool | `gt_universe_companies`, `gt_universe_company_aliases`, `gt_universe_company_sources` | Cross-tenant shared directory. Not any tenant's data. Surfaced in the UI as "Common Pool" and admin-only. |
| Import staging | `ki_import_staging` | No `tenant_id`; scoped by `session_id`, and `ki_import_sessions` carries the tenant. |
| Reference lookups readable by all | 12 tables in §7.1 | No tenant dimension. Shared reference data. |
| Migration bookkeeping | `vn_migrations` | The migration runner's own table; runs before any application context. |
| Operator scripts iterate tenants | `cohort.ts` | Deliberate cross-tenant tool; already sets tenant context per tenant rather than reading across them. |
| `vn_audit_log`, `vn_error_log` | logging | Written from paths that may have no tenant context (e.g. a failed login). Revisit if either is ever exposed in a tenant-facing UI. |

No exemption below is a *global* bypass. The `BYPASSRLS`/superuser role remains
only as the documented rollback in step 8.

---

## 10. Item 3 status against its own "done when"

| Condition | Status |
|---|---|
| App runs normally on a non-bypass role | ✅ **Locally.** The full assessment flow passes end to end under a `NOSUPERUSER NOBYPASSRLS` role — all checks including the public report page. ETL converted (§5.2); its 16 DB-backed landing tests pass. Signup/login and the skills executor are **not** yet exercised under the restricted role. |
| Two-tenant test passes | ✅ 11/11, and verified to fail when isolation is broken. |
| `docs/db/rls-status.md` lists every exemption with a justification | ✅ §9. |
| Production switched | ❌ Not performed. Runbook in §8. |

**Backwards compatible.** Everything here — migrations 234 and 235 and the code
changes — was verified to pass under *both* `vani_app` and the current
`vikuna_admin` superuser. It can ship before the cutover, which is what makes
the cutover a connection-string change rather than a big-bang deploy.

Regression check: the full backend suite is 510 passed / 19 failed / 11 skipped
both with and without these changes. Every failure is the pre-existing
`story-skill` suite, which fails on `column "channel_type_id" of relation
"gt_journey_stories" does not exist` — test-schema drift (its helper does not
apply migration 227), unrelated to RLS.

What remains before production: exercise signup, login and the skills executor
under the restricted role (§8 step 6), and settle the admin platform-tag
question (§3.1).
