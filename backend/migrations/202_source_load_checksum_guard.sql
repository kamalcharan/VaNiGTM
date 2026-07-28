-- ============================================================
-- Migration: 202_source_load_checksum_guard.sql
-- Purpose:   The same file cannot be loaded twice. Enforced by the database,
--            not only by a check in the route.
--
-- User ruling (2026-07-28): "keep a crypto restriction ... if user is trying
-- to import same file again, alert him it cannot be done."
--
-- This REVERSES the decision in commit ce4b7a2, which removed the duplicate
-- guard so that re-delivery could be idempotent. That was wrong in practice:
-- the user retried after a failed processing step and ended up with TWO
-- staging sessions holding the same 2,913 rows, with nothing telling them so.
--
-- The distinction that makes both concerns work is the CHECKSUM, not the
-- filename:
--   * identical bytes  -> nothing new is being delivered -> BLOCKED
--   * refreshed file   -> different sha256 -> allowed, and its clashes are
--                         resolved row by row in the merge review
--
-- So "FTCCI Oct 2026" still loads over "FTCCI Oct 2023" under the same
-- filename; re-uploading the exact same export does not.
--
-- Scoped per owner: two tenants uploading the same public directory are not
-- in conflict with each other, and a retired load (status <> 'active') does
-- not block a reload.
-- ============================================================

-- ── Prerequisite check ────────────────────────────────────────────────
--
-- gt_source_loads is created by migration 193. If it is missing, 193 did not
-- actually run here — which happens because the runner records a migration as
-- applied in vn_migrations independently of whether the schema really
-- received it, and it BASELINES every existing file as applied when
-- vn_migrations is empty but a schema exists (migrate.ts).
--
-- Bare "relation does not exist" sends you looking at THIS file. It says which
-- migration is actually missing instead.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'gt_source_loads'
    ) THEN
        RAISE EXCEPTION
            'gt_source_loads is missing, so migration 193 never actually ran on this database. Migration history can say "applied" while the schema does not have it. Check with: SELECT to_regclass(''public.gt_source_loads''); and re-apply 193_gt_data_sources.sql (psql -f), then 194-197, before this one.';
    END IF;
END $$;

-- ── Existing duplicates must be resolved before the index can exist ───
--
-- A database that already carries two active loads of the same bytes cannot
-- have this index built on it — which is precisely the database this
-- migration is for, since removing the guard is what allowed the duplicates.
--
-- Nothing is deleted. The extra loads are RETIRED (status = 'retired'), which
-- is the same lever documented at the bottom of this file for legitimately
-- reloading a file. Their rows keep their load_id and stay exactly where they
-- are; only the "this checksum is currently loaded" claim moves.
--
-- Which one survives: the load carrying the most imported records, because
-- that is the delivery the tenant's data actually came from. Ties break on the
-- oldest, i.e. the original delivery.
--
-- This is a data change, so it is announced rather than done quietly.
DO $$
DECLARE
    v_retired INT;
BEGIN
    WITH ranked AS (
        SELECT l.id,
               ROW_NUMBER() OVER (
                   PARTITION BY l.tenant_id, l.file_checksum
                   ORDER BY (
                       (SELECT COUNT(*) FROM gt_prospects p WHERE p.load_id = l.id)
                     + (SELECT COUNT(*) FROM gt_contacts  c WHERE c.load_id = l.id)
                   ) DESC,
                   l.loaded_at ASC
               ) AS rn
        FROM   gt_source_loads l
        WHERE  l.file_checksum IS NOT NULL
          AND  l.status = 'active'
    )
    UPDATE gt_source_loads t
    SET    status = 'retired'
    FROM   ranked r
    WHERE  t.id = r.id AND r.rn > 1;

    GET DIAGNOSTICS v_retired = ROW_COUNT;

    IF v_retired > 0 THEN
        RAISE NOTICE '[202] Retired % duplicate load(s) — the same file had been loaded more than once. Nothing was deleted; their rows are untouched. Review with: SELECT id, label, loaded_at, status FROM gt_source_loads ORDER BY loaded_at DESC;', v_retired;
    END IF;
END $$;

-- A tenant's own uploads: unique per tenant.
CREATE UNIQUE INDEX IF NOT EXISTS uq_gt_source_loads_tenant_checksum
    ON gt_source_loads(tenant_id, file_checksum)
    WHERE tenant_id IS NOT NULL
      AND file_checksum IS NOT NULL
      AND status = 'active';

-- Common-pool loads carry no tenant, so NULL would never collide with itself.
CREATE UNIQUE INDEX IF NOT EXISTS uq_gt_source_loads_platform_checksum
    ON gt_source_loads(file_checksum)
    WHERE tenant_id IS NULL
      AND file_checksum IS NOT NULL
      AND status = 'active';

COMMENT ON COLUMN gt_source_loads.file_checksum IS 'sha256 of the uploaded file. Unique per owner among active loads: the same bytes cannot be loaded twice (migration 202). A refreshed file has a different checksum and is allowed through to the merge review.';

-- ── Retiring a load is how you legitimately reload the same bytes ──────
-- e.g. an import that was rolled back. Documented here because the unique
-- index makes it the ONLY route, and a future session will otherwise think
-- the guard is simply in the way:
--
--   UPDATE gt_source_loads SET status = 'retired' WHERE id = <load_id>;
