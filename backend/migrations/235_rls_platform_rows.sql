-- ============================================================================
-- Migration 235: let tenants see platform rows again
--
-- Phase 0, Item 3. Follows 234. Fixes a second way the RLS cutover would have
-- broken the product — this one silently, by hiding data rather than raising.
--
-- ── THE PROBLEM ────────────────────────────────────────────────────────────
--
-- Two tables use NULL tenant_id to mean "belongs to the platform, visible to
-- everyone":
--
--   gt_tags          — platform tags naming common-pool deliveries, alongside
--                      each tenant's own tags
--   gt_content_kinds — reference data; ALL 8 rows are platform rows
--
-- Their policies read:
--
--     tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
--
-- NULL never equals anything, so every platform row is filtered out. For
-- gt_tags that hides the platform tags; for gt_content_kinds it hides the
-- entire table from every tenant.
--
-- Verified against a restricted role: superuser sees 3 gt_tags rows including
-- 1 platform row; vani_app under tenant context sees 1 row and 0 platform
-- rows. GET /etl/tags deliberately selects `tenant_id IS NULL OR tenant_id = $1`
-- — the first half of that returns nothing once RLS is enforced.
--
-- This is invisible today because the runtime is a superuser. It would not
-- have raised an error after the cutover; the rows would simply have stopped
-- appearing.
--
-- ── THE FIX, AND WHY IT IS TWO POLICIES ────────────────────────────────────
--
-- Reads must see platform rows. Writes must NOT be able to create them: a
-- single `FOR ALL USING (tenant_id IS NULL OR tenant_id = ctx)` would use that
-- same expression as the INSERT check, letting ANY tenant insert a row with
-- tenant_id NULL — a tag visible to every other tenant on the platform. That
-- turns a read bug into a privilege escalation.
--
-- So each table gets:
--   <name>_platform_read  FOR SELECT  USING (tenant_id IS NULL OR tenant_id = ctx)
--   <name>_tenant_write   FOR ALL     USING (tenant_id = ctx)
--                                     WITH CHECK (tenant_id = ctx)
--
-- Permissive policies are OR'd, so SELECT sees own + platform, while INSERT,
-- UPDATE and DELETE are confined to the tenant's own rows. Platform rows
-- become read-only to tenants, which is what "belongs to the platform" should
-- have meant all along.
--
-- ── ONE THING THIS DELIBERATELY DOES NOT FIX ───────────────────────────────
--
-- POST /etl/tags lets an admin tenant create a platform tag
-- (`is_platform: true`, guarded by auth.is_admin → 403 otherwise). Under these
-- policies that INSERT is refused, because the write policy requires
-- tenant_id = the caller's tenant.
--
-- That is left refused ON PURPOSE. The alternatives are to let every tenant
-- write NULL-tenant rows (unacceptable), or to key a policy off an
-- `app.is_admin` GUC that set_tenant_context does not currently set (a new
-- mechanism, and Phase 0 is explicit about not designing). Admin
-- platform-tag creation therefore needs a decision before the cutover:
-- a separate maintenance role, a SECURITY DEFINER function, or an is_admin
-- GUC. Flagged in docs/db/rls-status.md rather than silently granted here.
--
-- Idempotent. Behaviourally inert while the runtime is still a superuser.
-- ============================================================================

BEGIN;

DO $migration$
DECLARE
    t          TEXT;
    v_guc      CONSTANT TEXT := 'app.current_tenant_id';
    v_existing TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['gt_tags', 'gt_content_kinds'] LOOP

        IF NOT EXISTS (
            SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'r'
        ) THEN
            RAISE NOTICE '[235] SKIP % — table not present', t;
            CONTINUE;
        END IF;

        -- Guard the premise: if tenant_id is NOT NULL on this table then it
        -- holds no platform rows and this migration does not apply to it.
        IF (SELECT a.attnotnull FROM pg_attribute a
             WHERE a.attrelid = t::regclass AND a.attname = 'tenant_id'
               AND NOT a.attisdropped) THEN
            RAISE NOTICE '[235] SKIP % — tenant_id is NOT NULL, no platform rows possible', t;
            CONTINUE;
        END IF;

        -- Drop whatever tenant-isolation policy is currently there, by name,
        -- so this works regardless of what 234 or the original migration
        -- called it.
        FOR v_existing IN
            SELECT policyname FROM pg_policies
             WHERE schemaname = 'public' AND tablename = t
               AND qual LIKE '%current_setting%'
        LOOP
            EXECUTE format('DROP POLICY %I ON public.%I', v_existing, t);
        END LOOP;

        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR SELECT TO PUBLIC '
            'USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting(%L, true), '''')::uuid)',
            t || '_platform_read', t, v_guc);

        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO PUBLIC '
            'USING (tenant_id = NULLIF(current_setting(%L, true), '''')::uuid) '
            'WITH CHECK (tenant_id = NULLIF(current_setting(%L, true), '''')::uuid)',
            t || '_tenant_write', t, v_guc, v_guc);

        RAISE NOTICE '[235] % — platform rows readable, writes confined to own tenant', t;
    END LOOP;
END
$migration$;

COMMIT;

-- ============================================================================
-- Verify — as the APPLICATION role, not as postgres:
--
--   BEGIN;
--   SELECT set_tenant_context('<a real tenant uuid>');
--   SELECT count(*) FILTER (WHERE tenant_id IS NULL) AS platform,
--          count(*)                                  AS total
--     FROM gt_tags;
--   -- platform must be > 0 if any platform tag exists
--   SELECT count(*) FROM gt_content_kinds;   -- must be 8, not 0
--
--   -- and a tenant must still NOT be able to mint a platform row:
--   INSERT INTO gt_tags (tenant_id, label) VALUES (NULL, 'should be refused');
--   -- expect: ERROR  new row violates row-level security policy
--   ROLLBACK;
--
-- ROLLBACK of this migration: re-run 234, which restores the single
-- FOR ALL tenant-only policy on both tables (and re-hides platform rows).
-- ============================================================================
