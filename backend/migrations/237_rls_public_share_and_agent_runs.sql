-- ============================================================================
-- Migration 237: the last two RLS exceptions, made explicit
--
-- Phase 0, Item 3. Closes the two paths that would still break — or silently
-- leak — once DB_PRIMARY points at vanigtm_app. After this, the app needs no
-- bypass role for normal operation, which is the item's actual goal.
--
-- ── 1. get_shared_deck(token) — the public deck viewer ─────────────────────
--
-- GET /share/:token (storyteller.routes.ts) reads gt_presentations on the raw
-- pool with no tenant context. Its own comment says "intentionally
-- cross-tenant, scoped by the unguessable share_token" — correct about
-- authorisation, wrong about RLS: gt_presentations carries a policy, so under
-- vanigtm_app the query matches nothing and every shared deck link 404s.
--
-- docs/rls-cutover-checklist.md flagged this before Phase 0 and recommended
-- option (a), a SECURITY DEFINER function. That is what this is. It is the
-- narrowest of the three options considered: the function can only ever return
-- title and slides, only for status='approved', only for an exact token match.
-- It cannot enumerate, cannot reach an awaiting deck, and exposes no id,
-- tenant_id or share_token.
--
-- Note this is NOT the same fix VaNi's /r/:token got. There, every assessment
-- runs under one known tenant, so the route resolves that tenant and queries
-- inside it. A deck can belong to any tenant, so that approach does not
-- transfer and a definer function is the right tool.
--
-- ── 2. gt_agent_runs — an accident turned into a decision ──────────────────
--
-- gt_agent_runs is owned by vanigtm_app, so its policy never applied to the
-- app anyway (migration 236, §3.2 of docs/db/rls-status.md). Migration 236
-- deliberately left it alone because forcing it would break the worker.
--
-- The worker is genuinely cross-tenant: it polls gt_events for every tenant
-- and drives runs for all of them. Deep inside an agent, setStatus() and
-- appendStep() hold a runId and no tenant — threading tenant_id through some
-- twenty call sites across five agent files is exactly the "rewriting queries
-- for elegance" this phase puts out of scope.
--
-- So gt_agent_runs becomes an EXPLICIT exemption, mirroring gt_events
-- (migration 185, RLS disabled by design for the same reason). The effect on
-- the running system is nil — the owner already bypassed the policy. What
-- changes is that the exemption is now visible in pg_class and listed by
-- check 12 of the isolation test, instead of hiding behind table ownership
-- where the previous session found it only by accident.
--
-- The one genuinely unscoped read, getRun(runId) with no tenant filter, is
-- fixed in the same commit — it is CLI-only today, but it was the shape of an
-- IDOR and cost nothing to close.
--
-- To remove this exemption later: thread tenantId into setStatus/appendStep/
-- saveCheckpoint/loadCheckpoint, then ALTER TABLE gt_agent_runs ENABLE + FORCE
-- ROW LEVEL SECURITY. Not Phase 0 work.
--
-- Idempotent. Inert under the current superuser runtime.
-- ============================================================================

BEGIN;

-- ── 1. The public deck lookup ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_shared_deck(p_token TEXT)
RETURNS TABLE (title TEXT, slides JSONB)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp   -- never resolve through a caller's path
AS $$
    SELECT p.title::text, p.slides::jsonb
      FROM gt_presentations p
     WHERE p.share_token = p_token
       AND p.status = 'approved'
     LIMIT 1;
$$;

COMMENT ON FUNCTION get_shared_deck(TEXT) IS
    'Public share-token lookup for approved decks. SECURITY DEFINER so the '
    'anonymous /share/:token route works under a non-bypass role. Returns only '
    'title and slides, only for status=''approved'', only on an exact token '
    'match — it cannot enumerate and cannot reach an unapproved deck.';

-- Anonymous callers reach this through the app role, not directly.
REVOKE ALL ON FUNCTION get_shared_deck(TEXT) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vanigtm_app') THEN
        GRANT EXECUTE ON FUNCTION get_shared_deck(TEXT) TO vanigtm_app;
    END IF;
END $$;

-- ── 2. gt_agent_runs: name the exemption ───────────────────────────────────

DO $$
BEGIN
    IF to_regclass('public.gt_agent_runs') IS NULL THEN
        RAISE NOTICE '[237] gt_agent_runs not present — skipping';
        RETURN;
    END IF;

    IF (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.gt_agent_runs'::regclass) THEN
        ALTER TABLE public.gt_agent_runs DISABLE ROW LEVEL SECURITY;
        RAISE NOTICE '[237] gt_agent_runs — RLS disabled, now an explicit '
                     'cross-tenant exemption (was an implicit owner bypass)';
    ELSE
        RAISE NOTICE '[237] gt_agent_runs — RLS already disabled, nothing to do';
    END IF;
END $$;

COMMENT ON TABLE gt_agent_runs IS
    'Agent run ledger. RLS DISABLED BY DESIGN — the worker is cross-tenant: it '
    'polls gt_events for every tenant and drives runs for all of them, and '
    'setStatus/appendStep hold only a runId. Same exemption as gt_events '
    '(migration 185). Tenant-facing reads filter on tenant_id in the app '
    '(vani.routes.ts). See docs/db/rls-status.md section 9.';

COMMIT;

-- ============================================================================
-- Verify
--
--   -- the definer function exists and is definer:
--   SELECT proname, prosecdef FROM pg_proc WHERE proname = 'get_shared_deck';
--   -- expect: get_shared_deck | t
--
--   -- it returns an approved deck and refuses everything else:
--   SELECT * FROM get_shared_deck('<a real approved share_token>');   -- 1 row
--   SELECT * FROM get_shared_deck('nonsense');                        -- 0 rows
--
--   -- the exemption is now visible rather than hidden in ownership:
--   SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'gt_agent_runs';
--   -- expect: gt_agent_runs | f
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS get_shared_deck(TEXT);
--   ALTER TABLE public.gt_agent_runs ENABLE ROW LEVEL SECURITY;
-- Reverting part 1 breaks the public deck viewer under a non-bypass role.
-- Reverting part 2 restores the implicit owner bypass — the same effective
-- behaviour, just hidden again.
-- ============================================================================
