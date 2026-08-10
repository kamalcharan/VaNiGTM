# RLS status — enforcement, exemptions, and what still blocks the cutover

**Phase 0, Item 3.** Goal, in the work order's words: not "turn RLS on", but
*make the bypass role unnecessary for normal operation, and make the remaining
exceptions explicit, few, and documented.*

**Status: the mechanism is proven, the blocking bug is found and fixed, the
cutover has not been performed.** Production cannot be reached from this
sandbox; the work was done in a local rebuild, which is also what step 1 of the
work order requires ("work in a restored copy, never production"). §8 is the
cutover runbook.

---

## 1. A correction to the premise

The work order says the policies do nothing "because the runtime connects as a
`BYPASSRLS` role." The attribute is not the cause.

```
rolname       | rolsuper | rolbypassrls
vikuna_admin  | t        | f
```

`vikuna_admin` does **not** have `BYPASSRLS`. It is a **SUPERUSER**, and
superusers bypass row-level security unconditionally, regardless of that flag.

This matters practically: creating a role with `NOBYPASSRLS` and stopping there
would change nothing if the role were still `SUPERUSER`. The application role
must be **`NOSUPERUSER NOBYPASSRLS`**, and the test in §6 checks both before it
asserts anything else.

---

## 2. Where the schema stands

| | Count |
|---|---|
| Base tables in `public` | 114 |
| — with a `tenant_id` column | 94 |
|  · with RLS enabled | **75** |
|  · **without RLS** | **19** ⚠️ |
| — with no `tenant_id` column | 20 |
|  · with RLS enabled | 1 (`gt_channel_types`, read-all) |
| Policies total | 77 |

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

## 3. The bug that would have taken the site down

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

## 3.1 The second bug: platform rows disappear

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
PGPASSWORD=<pw> psql -h <host> -U vani_app -d <db> -f rls-two-tenant-test.sql
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

## 8. Cutover runbook — not yet performed

Ordered. Do not reorder; step 2 is what makes step 4 survivable.

1. **Backup and verify the restore.** `docs/db/ki-disposition.md` §6.1. Keep the
   scratch database — steps 3 and 5 run against it.
2. **Deploy migrations 234 and 235 to production**, in that order, together
   with the code changes. All are inert under the current superuser, so this is
   a normal deploy with no behaviour change. Verify:
   ```sql
   SELECT count(*) FILTER (WHERE qual LIKE '%NULLIF%') AS guarded, count(*) AS total
     FROM pg_policies WHERE schemaname = 'public';
   -- 235 splits gt_tags and gt_content_kinds into 2 policies each, so total
   -- grows by 2 and one policy per table reads no setting.
   ```
3. ~~Convert the ETL files~~ — **done** (§5.2), along with the public report
   route (§5.3). No outstanding code work blocks the cutover.
4. **Create the application role.** Not in a migration — it is cluster-level and
   carries a password that must not be in git.
   ```sql
   CREATE ROLE vani_app LOGIN PASSWORD '<from the secret store>'
       NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
   GRANT CONNECT ON DATABASE vani_gtm_db TO vani_app;
   GRANT USAGE  ON SCHEMA public TO vani_app;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO vani_app;
   GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO vani_app;
   -- so future migrations do not silently create tables vani_app cannot read
   ALTER DEFAULT PRIVILEGES IN SCHEMA public
       GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vani_app;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public
       GRANT USAGE, SELECT ON SEQUENCES TO vani_app;
   ```
   `NOSUPERUSER` is not optional — see §1.
5. **Run the isolation test against the scratch restore** as `vani_app` (§6).
   All checks must pass.
6. **Exercise the live paths by hand** against the scratch restore: signup,
   login, the assessment flow end to end, an ETL import, a skills-executor call.
   The work order's step 3. Only the assessment flow has been exercised so far,
   and only against the rebuilt schema.
7. **Switch production**: point `DB_PRIMARY` at `vani_app`, deploy, re-run the
   isolation test against production, then smoke-test the funnel
   (`deploy/vani-main-vps/smoke-test.sh`).
8. **Keep `vikuna_admin` available.** Rollback is a connection-string change and
   a restart: pointing `DB_PRIMARY` back at the superuser makes every policy
   inert again regardless of how it is written. No migration needs reversing.

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
| App runs normally on a non-bypass role | ✅ **Locally.** The full assessment flow passes end to end under `vani_app` (`NOSUPERUSER NOBYPASSRLS`) — all checks including the public report page. ETL converted (§5.2); its 16 DB-backed landing tests pass. Signup/login and the skills executor are **not** yet exercised under the restricted role. |
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
