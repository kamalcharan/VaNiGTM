-- ============================================================================
-- Migration 247: make vani_llm_provider's isolation real, before secrets
--                land in it
--
-- Two fixes, both prerequisites for BYOK (vani:llm_provider onboarding step).
-- Neither is a BYOK bug. Both become one the moment tenant API keys are
-- stored in vani_llm_provider.
--
-- ── FIX 1: vani_current_tenant() reads the legacy GUC ──────────────────────
--
-- Migration 240 defined it as:
--
--   select nullif(current_setting('app.tenant_id', true), '')::uuid
--
-- But set_tenant_context() — the function db/query.ts calls on every
-- connection — sets `app.current_tenant_id` as its primary. Migration 153
-- added `app.tenant_id` alongside it purely as a shim for the migration-001
-- ki_ tables, and migration 234's whole purpose was moving policies OFF that
-- legacy GUC.
--
-- So every vani_/vara_ policy (240, 241, 245, 246 — 20+ tables) currently
-- hangs off the GUC that is scheduled to die. It works today only because 153
-- sets both. The tell is in etl/tests/landing.test.ts, which sets both by
-- hand because someone already hit this.
--
-- Fixed here with coalesce rather than a straight swap, so the function keeps
-- working under any caller that sets only one of the two — including the
-- legacy ki_ paths and existing tests — while new code depends only on the
-- current GUC. Retiring `app.tenant_id` then becomes a one-line change here
-- rather than a hunt across 20 policies.
--
-- ── FIX 2: vani_llm_provider's policy does not apply to its own owner ──────
--
-- Migration 240 enables RLS and creates `tenant_isolation` on all twelve
-- vani_ tables, but never sets FORCE ROW LEVEL SECURITY. Migration 236 — the
-- migration written to close exactly this hole — ran BEFORE 240, so it could
-- not have covered them. Same for vara_ in 241 and 246. Migration 245 knows:
-- its own table comment says FORCE must be "applied by a later migration if
-- the deployment role owns this table". No later migration does it.
--
-- A table's OWNER is exempt from its own policies unless FORCE is set. The
-- runtime now connects as vanigtm_app (the cutover is done), so if that role
-- owns these tables their policies are inert — the identical defect that made
-- eighteen gt_ tables leak, found in Phase 0 by running the isolation test.
--
-- ── ⚠️ WHY ONLY ONE TABLE IS FORCED HERE ──────────────────────────────────
--
-- The obvious move is to re-run 236's blanket sweep, which would pick up the
-- whole vani_/vara_ spine automatically. That would BREAK VARA.
--
-- vara/vara.routes.ts reaches these tables through the raw pool — 22
-- pool.query call sites, no set_tenant_context anywhere in the file. Its
-- isolation is the application-layer `WHERE tenant_id = $1` on every query,
-- which is correct and is how the app runs today. But a raw pool connection
-- has no tenant GUC, so vani_current_tenant() returns NULL, and forcing RLS
-- would make all 22 queries match zero rows. The Vara compose path — shipped
-- and live as of 2026-08-19 — would stop working silently.
--
-- That is the same class of defect 236 documented for gt_agent_runs, and it
-- gets the same treatment: name it, leave it, do not quietly force it. The
-- fix is to move vara.routes.ts onto withTenantClient, which is its own slice
-- of work and does not belong inside a BYOK migration.
--
-- vani_llm_provider is safe to force NOW precisely because nothing reads or
-- writes it yet: the column exists, no code touches it. The BYOK service
-- landing alongside this migration is built on withTenantClient from its
-- first line, so it is correct under FORCE from the start rather than being
-- retrofitted later.
--
-- STILL UNFORCED after this migration, all owner-bypassed if vanigtm_app owns
-- them, all pending the vara.routes.ts conversion:
--
--   vani_tenant              vani_tenant_domain      vani_membership
--   vani_tenant_agent        vani_user_agent_role    vani_role_family
--   vani_tenant_pack_binding vani_template           vani_comms_log
--   vani_metering_event      vani_audit_log          vani_prompt
--   vara_* (241, 246)        gt_agent_runs (from 236)
--
-- Recorded in docs/db/rls-status.md rather than left to be rediscovered.
--
-- Idempotent. Inert under a superuser runtime.
-- ============================================================================

BEGIN;

-- ── Fix 1 ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION vani_current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS
$$
  SELECT nullif(
           coalesce(
             nullif(current_setting('app.current_tenant_id', true), ''),
             nullif(current_setting('app.tenant_id',         true), '')
           ),
           ''
         )::uuid
$$;

COMMENT ON FUNCTION vani_current_tenant() IS
  'Tenant for RLS on the vani_/vara_ spine. Prefers app.current_tenant_id '
  '(what set_tenant_context sets as primary); falls back to the legacy '
  'app.tenant_id from migration 153 so callers that set only that one keep '
  'working. Returns NULL with no tenant context — every policy using it is '
  'written so NULL matches no rows. Migration 247.';

-- ── Fix 2 ──────────────────────────────────────────────────────────────────

DO $migration$
DECLARE
    v_owner  text;
    v_forced boolean;
BEGIN
    SELECT pg_get_userbyid(c.relowner), c.relforcerowsecurity
      INTO v_owner, v_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND c.relname = 'vani_llm_provider';

    IF NOT FOUND THEN
        RAISE NOTICE '[247] vani_llm_provider does not exist here — skipping. '
                     'Migration 240 has not been applied to this database.';
        RETURN;
    END IF;

    -- Inside the guard, not after it. As a bare statement below the block
    -- this aborted the whole migration on any database where 240 had not
    -- run — the DO block skipped correctly and then COMMENT ON TABLE raised
    -- "relation does not exist". Found by applying 247 to an empty database,
    -- which is exactly the fresh-bootstrap case CLAUDE.md warns about.
    EXECUTE format(
        'COMMENT ON TABLE public.vani_llm_provider IS %L',
        'Per-tenant LLM credentials (BYOK). credentials_enc holds AES-256-GCM '
        'ciphertext from agent-core/secret.crypto.ts, keyed by TENANT_SECRET_KEY — '
        'the plaintext key never reaches the database. FORCE ROW LEVEL SECURITY is '
        'set (migration 247), so this table MUST be reached through '
        'withTenantClient/createTenantDb; a raw pool.query returns zero rows.');

    IF v_forced THEN
        RAISE NOTICE '[247] vani_llm_provider already FORCED — nothing to do.';
        RETURN;
    END IF;

    EXECUTE 'ALTER TABLE public.vani_llm_provider FORCE ROW LEVEL SECURITY';
    RAISE NOTICE '[247] FORCED vani_llm_provider (owner %). Its tenant_isolation '
                 'policy now applies to every role including the owner.', v_owner;
END
$migration$;

COMMIT;

-- ============================================================================
-- Verify
--
--   -- Fix 1: both spellings resolve, absent context is NULL not an error
--   BEGIN;
--     SELECT set_tenant_context('00000000-0000-0000-0000-000000000001');
--     SELECT vani_current_tenant();        -- the uuid
--   COMMIT;
--   SELECT vani_current_tenant();          -- NULL, no error
--
--   -- Fix 2: forced, and what is still outstanding
--   SELECT c.relname, pg_get_userbyid(c.relowner) AS owner, c.relforcerowsecurity
--     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
--      AND (c.relname LIKE 'vani\_%' OR c.relname LIKE 'vara\_%')
--    ORDER BY c.relforcerowsecurity DESC, c.relname;
--
-- Expect vani_llm_provider true, the rest false — and that list is the
-- backlog the vara.routes.ts conversion clears.
--
-- ROLLBACK
--   ALTER TABLE public.vani_llm_provider NO FORCE ROW LEVEL SECURITY;
-- Only if forcing broke a path. Reverting restores the owner bypass on a
-- table holding tenant API keys, so record why.
-- ============================================================================
