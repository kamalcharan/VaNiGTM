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
