# WS2.1 — vani_gtm_db Schema Inspection Report

**Date:** 2026-07-31
**Method:** Charan ran the queries directly against `vani_gtm_db` (MCP channel still
blocked by missing `GTM_MCP_BASIC`) and pasted the results back into session.
**Purpose:** G1 input — table census, RLS/auth model facts, tenant #1 status.

## 1. Sanity check

- `SELECT current_database();` → `vani_gtm_db` ✅ confirmed correct DB, not another
  product's.
- `SELECT count(*) FROM gt_contacts;` → **81 rows**. This is a live, populated GTM
  database, not an empty shell — VaNi work happens alongside real product data.

## 2. Table census

~75 tables matching `gt_*` / `vn_*` / `ki_*`, all in `public` schema:

- **`gt_*` (52 tables)** — the GTM/prospecting engine: contacts, campaigns, sequences,
  prospects, personas, journeys, knowledge-graph (`gt_kg_nodes`/`gt_kg_edges`), semantic
  clustering, tenant profile/integrations, universe companies, etc.
- **`vn_*` (14 tables)** — the shared auth/tenant framework: `vn_tenants`, `vn_users`,
  `vn_roles`, `vn_user_roles`, `vn_invitations`, `vn_refresh_tokens`,
  `vn_password_resets`, `vn_subscriptions`(+history), `vn_tenant_onboarding`,
  `vn_tenant_profiles`, `vn_audit_log`, `vn_error_log`, `vn_migrations`.
- **`ki_*` (9 tables)** — legacy, all `ki_pulse_*` / `ki_import_*` / `ki_file_uploads`.
  **Important:** the `set_tenant_context()` function body (§4 below) comments reference
  `ki_transactions`, `ki_clients`, `ki_portfolios`, `ki_goals`, `ki_goal_projections`,
  `ki_alerts`, `ki_nav_bookmarks` as consumers of the legacy `app.tenant_id` GUC — **none
  of those tables exist in this census.** They were evidently dropped in an earlier
  migration; the comment is stale. Harmless (the function sets both GUCs unconditionally),
  but flagging so nobody goes looking for those tables later.

**No VaNi-specific tables exist yet** — no `gt_assessment_def`, `vn_assessment_*`,
`gt_leads`, or anything matching the blueprint's `gt_assessment_def` reference. Confirms
WS2.2–2.5 genuinely haven't started; this is a clean slate.

**Not yet inspected:** the "master data tables" the checklist asked for weren't named
explicitly. Best-guess candidates from the census that look like reference/lookup tables:
`gt_industries`, `gt_industry_aliases`, `gt_channel_types`, `gt_content_kinds`,
`gt_data_sources`, `gt_load_tags`, `gt_tags`. Worth a follow-up column dump if G1 wants
them, but not blocking.

## 3. Core table columns

- **`vn_tenants`**: `id` (uuid), `slug`, `status`, `is_active`, `activated_at`,
  `suspended_at`, `suspension_reason`, `created_at`, `updated_at`,
  `customer_id_type_code` (default `'IWELL_CODE'`), `is_admin` (bool),
  `ext_ref_type_code`. No `name`/`plan` column — `slug` is the working identifier.
- **`vn_users`**: `id`, `tenant_id`, `email`, `password_hash`, `name`, `avatar_url`,
  `preferences` (jsonb), `is_active`, `is_email_verified`, `email_verified_at`,
  `last_login_at`, `failed_login_count`, `locked_until`, `preferred_theme`,
  `intake_code` (**NOT NULL** — required on every row), `first_name`, `last_name`,
  `country_code`, `mobile`, `designation`, `bio`. **No `role` or `partner_id` column
  directly on `vn_users`** — role must come from `vn_user_roles`/`vn_roles` (columns not
  yet inspected). There's nowhere obvious today to hang a "partner_id" claim for the
  spec's partner-scoping model — needs a look at `vn_user_roles` before G1 finalizes auth.
- **`gt_events`**: `id`, `tenant_id` (NOT NULL), `event_type`, `source_type`,
  `source_id`, `payload` (jsonb), `status` (default `'pending'`), `processed_at`,
  `error`, `created_at`. This is the async job/event queue — plausible home for
  triggering report generation.
- **`gt_prompts`**: `id`, `tenant_id` (**nullable** — supports system-wide prompts),
  `prompt_key`, `version`, `content`, `is_active`, `notes`, `created_by`, `created_at`.
  Versioned prompt library already exists — open question for G1: should VaNi's
  `narrative_prompt` (system/user_template/fallback, currently inline in the assessment
  definition JSON) live here instead, for reuse/versioning? Or stay inline as the Pilot
  Pack JSON has it?
- **`gt_prospects`**: 41 columns, heavily company/CRM-shaped (`employees_band`,
  `revenue_band`, `industry_canonical`, `score`, `score_reasons` jsonb, `linkedin_url`,
  etc.), plus `is_live` (bool) confirming the `tenant_id + is_live` filter convention
  from the handover's "known facts" section is real and enforced by pattern, not just
  documentation. **This table doesn't fit VaNi's lead shape** (name/email/company/role
  captured per assessment respondent, not a company-level prospect record) — reinforces
  that WS2.2 needs new tables for assessment responses/leads rather than reusing
  `gt_prospects`.

## 4. `set_tenant_context()`

```sql
CREATE OR REPLACE FUNCTION public.set_tenant_context(p_tenant_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  PERFORM set_config('app.current_tenant_id', p_tenant_id, true);  -- migrations 017+/019+/020+/050+
  PERFORM set_config('app.tenant_id', p_tenant_id, true);           -- legacy migration 001 (stale table list, see §2)
END;
$function$
```

Transaction-local (`true` = is_local) — confirms the handover's note that the GUC must be
set inside the same transaction as the query (BEGIN/COMMIT wrapper mandatory if this is
ever called server-side).

## 5. RLS policies

Every `gt_*`/`ki_pulse_*` table with a `tenant_id` column has a `*_tenant_isolation`
policy of the same shape:

```sql
(tenant_id = (current_setting('app.current_tenant_id', true))::uuid)
```

roles `{public}`, cmd `ALL` — enforcement is entirely dependent on the connecting role
**not** having `BYPASSRLS` and on `set_tenant_context()` having been called this
transaction. Exceptions seen:
- `gt_channel_types` — read-only, `cmd SELECT`, `qual true` (open reference data).
- `gt_content_kinds` / `gt_tags` — `is_system OR tenant_id = ...` / `tenant_id IS NULL OR
  tenant_id = ...`, i.e. support system-wide rows alongside tenant rows.
- `ki_pulses` — casts `tenant_id::text = current_setting(...)` (text compare, not
  `::uuid`) — a minor inconsistency, not a blocker.

**No policies at all** on `vn_tenants`, `vn_users`, `vn_roles`, `vn_user_roles`,
`gt_events`, or `gt_prompts` — those tables currently have no row-level tenant scoping
in the database; any isolation on them today is enforced at the application layer, if at
all. This matters directly for the auth-model question.

*(Not queried: `pg_class.relrowsecurity`/`relforcerowsecurity` — a policy existing
doesn't by itself confirm RLS is switched on for that table. Worth a quick follow-up
before treating RLS as authoritative.)*

## 6. Roles

| role | login | bypassrls | notes |
|---|---|---|---|
| `admin` | no | **yes** | |
| `vikuna_admin` | yes | **yes** | superuser, createrole, createdb |
| `vanigtm_app` | yes | no | matches handover's "RLS cutover drafted for vanigtm_app" — **not yet granted bypass, meaning cutover hasn't happened** |
| `vn_app` | yes | no | separate app role, presumably for the `vn_*` auth framework |
| `fk_app`, `kd_app`, `kd_readonly`, `ki_app` | yes | no | **other products' app roles on this same instance** — confirms `vani_gtm_db` is shared infra, not VaNi-exclusive |
| `vikuna_api` | yes | no | |
| `anon`, `authenticated`, `service_role`, `user` | no (`anon`/`authenticated`/`service_role`) | no | **these are Supabase's standard default role names** |

**Flag for G1, not a conclusion:** the presence of `anon`/`authenticated`/`service_role`
roles is the Supabase convention. Given the hard guardrail "No Supabase for any VaNi AI
data," this needs an explicit answer before WS2.2: is `vani_gtm_db` a self-hosted Postgres
that simply copied Supabase's role-naming template (very common, and consistent with
everything else in the handover describing PostgREST + pgjwt as a manual setup), or is it
actually a Supabase-managed project? The handover's infra notes (Main VPS
187.127.136.65, PostgREST v12, manual Nginx) strongly suggest the former, but this report
shouldn't assume — confirm before G1 signs off.

Confirms the handover's note directly: the app currently connects as `admin` or
`vikuna_admin`, both `BYPASSRLS` — **RLS policies exist but are not currently enforced**
for the app's actual DB connection. The `vanigtm_app` role that's meant to replace it
still lacks the grants (`grant-vanigtm-app.sql` is drafted, not applied).

No `web_anon` / `partner` / `owner` roles exist — the spec's proposed PostgREST role
model (§3.4, App Spec) has not been implemented at all. This is greenfield.

## 7. Extensions

`pgcrypto` (1.3), `plpgsql`, `uuid-ossp`. **`pgjwt` is not installed.**

This is a real gap, not just an unstarted task: the App Spec's `vn_login(email,
password)` is specified to return "a signed JWT (pgjwt, existing PostgREST secret)" —
but the extension pgjwt depends on isn't present. Before G1 can finalize the auth
approach, need to confirm (a) whether `pgjwt` can be installed on this Postgres
(self-hosted usually yes, given `vikuna_admin` is a real superuser — managed services
sometimes restrict this), or (b) whether JWT issuance is meant to happen outside the DB
(app/edge layer) despite the spec text. `pgcrypto` is present, consistent with
`password_hash` on `vn_users` using `crypt()`/bcrypt.

## 8. `vn_tenants` rows — does "Vikuna Consulting" exist?

17 rows total. **No tenant is named or sluged "Vikuna Consulting."** Closest candidate:

- `slug: "vikuna"`, `id: 00000000-0000-0000-0000-000000000100` (all-zero UUID — looks
  like a seeded/system tenant), `is_admin: false`, `status: active`, created
  2026-05-12.

The rest are workspace-per-signup tenants from the GTM/KI-Prime product itself —
`phase3test-p6` through `p14`, `phase4-test-co-*`, `kirris-workspace-*`,
`charan-kakmals-workspace-*`, and `charans-workspace-e619cv` (this one has
`is_admin: true`, created 2026-07-25 — much more recent, likely Charan's personal
dev/test tenant for something unrelated to VaNi, not evidence of a "Vikuna Consulting"
plan already in motion).

**Open question for G1:** reuse the zero-UUID `"vikuna"` tenant as VaNi's tenant #1
("Vikuna Consulting", partners as scoped users within it), or create a fresh tenant
purpose-built for VaNi? The existing `"vikuna"` tenant's `is_admin: false` and generic
slug suggest it wasn't set up with this plan in mind — worth deciding explicitly rather
than assuming reuse is safe.

## 9. Summary for G1

1. **DB confirmed correct**, live, and shared with the GTM/KI-Prime product — not
   VaNi-exclusive infrastructure.
2. **Nothing VaNi-specific exists yet** — no tables, no roles, no seeded tenant. WS2.2–2.5
   is a genuinely clean start.
3. **Auth model reconciliation has three concrete open items**, not just the
   "spec vs GTM engine" framing from the handover:
   - `pgjwt` extension is missing — the spec's `vn_login()` JWT approach can't be
     built as written until this is resolved.
   - RLS policies exist on `gt_*` tables but are currently bypassed in practice
     (app connects as `admin`/`vikuna_admin`), and don't exist at all on `vn_users`/
     `vn_tenants` — today there is no DB-enforced tenant isolation on the auth
     framework itself.
   - `anon`/`authenticated`/`service_role` role names suggest a Supabase-style template
     was used for role naming — confirm this isn't an actual Supabase project before
     treating "No Supabase" as trivially satisfied.
4. **Tenant #1 ("Vikuna Consulting") doesn't exist under that name** — decide at G1
   whether to repurpose the `"vikuna"` slug tenant or create a new one.
5. **`gt_prospects` doesn't fit VaNi's lead shape** — WS2.2 will need new tables
   (assessment definitions, responses, leads) rather than reusing GTM's prospect model.
6. Not yet pulled: `vn_roles`/`vn_user_roles` columns (needed to see how role +
   partner scoping would attach to a user), `pg_class` RLS-enabled flags, and the
   "master data" table columns. None of these block a G1 decision, but the first one
   (`vn_roles`/`vn_user_roles`) would sharpen the auth-model proposal.

Nothing was written to the database — this was inspection only, per the WS2.1 mandate.
