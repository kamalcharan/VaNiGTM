-- ============================================================================
-- Migration 236: close the ownership bypass
--
-- Phase 0, Item 3. Found by running the isolation test against production —
-- not by reading anything.
--
-- ── THE HOLE ───────────────────────────────────────────────────────────────
--
-- A table's OWNER is exempt from its own row-level security policies unless
-- the table is set to FORCE ROW LEVEL SECURITY. Eighteen tables in production
-- are owned by `vanigtm_app` — the very role the cutover points the app at:
--
--   gt_activity_feed        gt_agent_runs        gt_campaign_metrics
--   gt_campaigns            gt_channels          gt_contact_assignments
--   gt_persona_signals      gt_personas          gt_sequence_steps
--   gt_sequences            gt_stage_log         gt_step_templates
--   ki_pulse_config         ki_pulses            ki_pulse_sessions
--   ki_pulse_session_actions  ki_pulse_session_gaps
--   ki_pulse_session_observations
--
-- Their policies are present, correct and guarded. They simply do not apply.
-- The isolation test caught this on gt_campaigns: one row readable AND
-- writable from the wrong tenant, and visible with no tenant context at all,
-- while every policy check passed.
--
-- Reproduced locally to confirm the mechanism:
--   owned by vikuna_admin ........ denied
--   owned by vanigtm_app ......... 2 rows visible, no tenant context
--   + FORCE ROW LEVEL SECURITY ... 0 rows
--
-- This is invisible today because the runtime connects as vikuna_admin, a
-- superuser, which bypasses RLS on everything regardless of ownership. It
-- becomes a live cross-tenant leak the moment DB_PRIMARY points at
-- vanigtm_app — i.e. exactly at cutover, on eighteen tables including
-- campaigns, sequences and the whole pulse cluster.
--
-- ── WHY FORCE RATHER THAN REASSIGNING OWNERSHIP ────────────────────────────
--
-- ALTER TABLE ... OWNER TO vikuna_admin also works and is arguably tidier.
-- FORCE is chosen because it does not disturb the existing grants (a change of
-- owner drops them and needs scripts/grant-vanigtm-app.sql re-run), and
-- because it states the intent directly: this table's policies apply to
-- everyone, including whoever owns it. Superusers still bypass, so
-- vikuna_admin keeps working exactly as now — which is what makes this safe to
-- deploy ahead of the cutover.
--
-- ── ⚠️ ONE TABLE NEEDS CODE WORK FIRST: gt_agent_runs ──────────────────────
--
-- The worker writes gt_agent_runs through the raw pool with no tenant context
-- (agent.runner.ts: `UPDATE gt_agent_runs SET ... WHERE id = $1`, 8 raw
-- pool.query call sites in that file). Forcing RLS there means those writes
-- match zero rows once the app runs as vanigtm_app — the agent run lifecycle
-- silently stops recording.
--
-- That is the same class of fix already applied to the ETL pipeline and the
-- public report route: move the call path onto withTenantClient. Until that is
-- done, gt_agent_runs is deliberately EXCLUDED below, and left as the one
-- known ownership bypass. It is listed in docs/db/rls-status.md as outstanding
-- rather than quietly forced.
--
-- gt_events is NOT affected: it has no RLS by design (the cross-tenant bus).
--
-- Idempotent, and inert under the current superuser runtime.
-- ============================================================================

BEGIN;

DO $migration$
DECLARE
    r        RECORD;
    v_forced INT := 0;
    v_skip   INT := 0;
BEGIN
    FOR r IN
        SELECT c.relname, pg_get_userbyid(c.relowner) AS owner
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relkind = 'r'
           AND c.relrowsecurity                 -- has RLS enabled
           AND NOT c.relforcerowsecurity        -- but the owner escapes it
           AND pg_get_userbyid(c.relowner) <> 'vikuna_admin'
         ORDER BY c.relname
    LOOP
        -- See the header. Forcing this one breaks the worker until
        -- agent-core is moved onto withTenantClient.
        IF r.relname = 'gt_agent_runs' THEN
            RAISE NOTICE '[236] SKIP %  — owner % bypasses RLS, but the worker '
                         'writes it with no tenant context. Convert agent-core '
                         'first, then force it.', r.relname, r.owner;
            v_skip := v_skip + 1;
            CONTINUE;
        END IF;

        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', r.relname);
        RAISE NOTICE '[236] FORCED %  (owner %)', r.relname, r.owner;
        v_forced := v_forced + 1;
    END LOOP;

    RAISE NOTICE '[236] Done. % table(s) forced, % skipped.', v_forced, v_skip;

    IF v_forced = 0 AND v_skip = 0 THEN
        RAISE NOTICE '[236] Nothing to do — no RLS table is owned by a '
                     'non-vikuna_admin role in this database.';
    END IF;
END
$migration$;

COMMIT;

-- ============================================================================
-- Verify — should return only gt_agent_runs, and only until agent-core is
-- converted:
--
--   SELECT c.relname, pg_get_userbyid(c.relowner) AS owner
--     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public' AND c.relkind = 'r'
--      AND c.relrowsecurity AND NOT c.relforcerowsecurity
--      AND pg_get_userbyid(c.relowner) <> 'vikuna_admin';
--
-- Or re-run deploy/vani-main-vps/rls-two-tenant-test.sql — check 13 covers it.
--
-- ROLLBACK
--   ALTER TABLE public.<name> NO FORCE ROW LEVEL SECURITY;
-- for each table the NOTICE output above reported as FORCED. Reverting
-- restores the bypass, so only do it if forcing broke a path that has not been
-- converted yet — and record which one, because that path is a latent
-- cross-tenant leak.
-- ============================================================================
