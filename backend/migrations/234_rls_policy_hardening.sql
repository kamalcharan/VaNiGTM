-- ============================================================================
-- Migration 234: make the tenant-isolation policies safe to actually enforce
--
-- Phase 0, Item 3. This migration does NOT switch the runtime to a restricted
-- role — that is a connection-string change and a deploy, described in
-- docs/db/rls-status.md. What it does is fix the reason the switch would
-- currently take the site down within one request.
--
-- ── THE BUG ────────────────────────────────────────────────────────────────
--
-- 68 of the 77 policies are written as:
--
--     tenant_id = (current_setting('app.current_tenant_id', true))::uuid
--
-- current_setting(..., true) returns NULL when the setting has never been
-- defined on the connection — so on a fresh connection the policy yields NULL,
-- no rows match, and the table is fail-closed. That is correct.
--
-- But set_tenant_context() uses set_config(..., is_local := true), which is
-- transaction-local. After that transaction COMMITs, the setting is not
-- undefined again — it is defined and EMPTY. current_setting then returns ''
-- rather than NULL, and ''::uuid raises:
--
--     ERROR:  invalid input syntax for type uuid: ""
--
-- Because connections are pooled and reused, the first tenant-scoped
-- transaction on a connection poisons that connection for every later query
-- that runs outside a transaction. This is invisible today only because the
-- runtime connects as a SUPERUSER, so the policy is never evaluated and the
-- cast never runs. It was reproduced immediately on switching to a
-- non-superuser role.
--
-- (This is the same error recorded as lesson 1 in CLAUDE.md. It was diagnosed
-- then as a caller mistake — "wrap with BEGIN/COMMIT". The wrap is still
-- required, but the underlying policy is also unsafe, and that half was
-- missed because RLS was dormant.)
--
-- ── THE FIX ────────────────────────────────────────────────────────────────
--
--     tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
--
-- Empty string becomes NULL, NULL compares to nothing, and the table is
-- fail-closed in both the never-set and the set-then-committed case.
--
-- The remaining 8 policies compare (tenant_id)::text to the raw setting. That
-- form never casts, so it does not have the bug — but it is a second dialect
-- doing the same job, and a uuid compared as text is sensitive to formatting.
-- They are normalised onto the same form here so there is one pattern to
-- reason about. Their behaviour is unchanged: unset or empty still matches
-- nothing.
--
-- Both GUC names are preserved. set_tenant_context() sets app.current_tenant_id
-- AND app.tenant_id, and 4 policies (ki_clients, ki_goals, ki_holdings,
-- ki_transactions, all from the original migration 001) still read the latter.
-- This migration keeps each policy on whichever name it already used — do not
-- "tidy" them onto one GUC without changing set_tenant_context to match.
--
-- ── SAFE TO RUN NOW ────────────────────────────────────────────────────────
--
-- While the runtime is still a superuser, this migration is behaviourally
-- inert: policies that are never evaluated cannot change what any query
-- returns. It is a prerequisite for the role switch, not the switch itself.
--
-- Idempotent: re-running rewrites the same policies to the same definitions.
-- No table is given RLS it did not already have, and no policy is added or
-- removed — only rewritten.
-- ============================================================================

BEGIN;

DO $migration$
DECLARE
    r          RECORD;
    v_guc      TEXT;
    v_rewrote  INT := 0;
    v_skipped  INT := 0;
BEGIN
    FOR r IN
        SELECT tablename, policyname, qual, with_check, cmd, permissive, roles
          FROM pg_policies
         WHERE schemaname = 'public'
           AND qual LIKE '%current_setting%'
         ORDER BY tablename, policyname
    LOOP
        -- Keep each policy on the GUC it already reads. See header.
        v_guc := CASE WHEN r.qual LIKE '%app.current_tenant_id%'
                      THEN 'app.current_tenant_id'
                      ELSE 'app.tenant_id'
                 END;

        -- Anything carrying a WITH CHECK is hand-written and not a plain
        -- tenant-isolation policy. Leave it alone and say so rather than
        -- flattening it — there are none today, but this migration must not
        -- silently discard one added later.
        IF r.with_check IS NOT NULL THEN
            RAISE NOTICE '[234] SKIP %.% — has a WITH CHECK clause, rewrite by hand',
                         r.tablename, r.policyname;
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        -- Likewise anything that is not the FOR ALL / PERMISSIVE / PUBLIC
        -- shape every tenant-isolation policy uses.
        IF r.cmd <> 'ALL' OR r.permissive <> 'PERMISSIVE'
           OR r.roles::text <> '{public}' THEN
            RAISE NOTICE '[234] SKIP %.% — non-standard shape (cmd=%, permissive=%, roles=%)',
                         r.tablename, r.policyname, r.cmd, r.permissive, r.roles;
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO PUBLIC '
            'USING (tenant_id = NULLIF(current_setting(%L, true), '''')::uuid)',
            r.policyname, r.tablename, v_guc);

        v_rewrote := v_rewrote + 1;
    END LOOP;

    RAISE NOTICE '[234] % policies rewritten, % skipped.', v_rewrote, v_skipped;

    -- Fail loudly if anything still carries the unguarded cast.
    IF EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public'
           AND qual LIKE '%current_setting%'
           AND qual LIKE '%::uuid%'
           AND qual NOT LIKE '%NULLIF%'
    ) THEN
        RAISE EXCEPTION '[234] policies remain with an unguarded ::uuid cast — '
                        'inspect pg_policies before switching roles';
    END IF;
END
$migration$;

COMMIT;

-- ============================================================================
-- Verify
--
--   SELECT count(*) FILTER (WHERE qual LIKE '%NULLIF%')          AS guarded,
--          count(*) FILTER (WHERE qual NOT LIKE '%NULLIF%')      AS other,
--          count(*)                                              AS total
--     FROM pg_policies WHERE schemaname = 'public';
--
-- Expect guarded = 76, other = 1 (gt_channel_types_read, a read-all lookup
-- policy with USING (true) that reads no setting), total = 77.
--
-- ROLLBACK
--
-- Restoring the previous definitions means reinstating the bug, so there is no
-- rollback block here. If this migration must be undone, the previous
-- definitions are recoverable from the pre-deploy backup
-- (docs/db/ki-disposition.md §6.1) via:
--
--   pg_restore --section=post-data -f - <backup>.dump | grep -A2 'CREATE POLICY'
--
-- The operational rollback for the Item 3 cutover is not this migration — it
-- is pointing DB_PRIMARY back at the superuser role, which makes every policy
-- inert again regardless of how it is written.
-- ============================================================================
