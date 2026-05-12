-- ============================================================
-- 044_ki_import_session_orphan_records.sql
--
-- Adds orphan_records counter to ki_import_sessions.
-- 'orphan' rows = staging rows where no client was matched
-- (ext_ref_id + PAN + name all failed). Tracked separately
-- from failed_records so the advisor knows how many rows need
-- client mapping fixes vs. actual processing errors.
--
-- NOTE: vendor is NOT stored here. The tenant's platform is
-- already on vn_tenants.ext_ref_type_code (migration 033).
-- The import RPC reads that directly — no duplication needed.
--
-- ADDITIVE — no data loss.
-- ============================================================

BEGIN;

ALTER TABLE ki_import_sessions
    ADD COLUMN IF NOT EXISTS orphan_records INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN ki_import_sessions.orphan_records IS
'Count of staging rows where no matching client was found (ext_ref_id + PAN + name
 all failed). Marked processing_status=orphan. Re-processable once the missing client
 record or ext_ref_id mapping is added. See ki_ext_ref_types + vn_tenants.ext_ref_type_code
 for the tenant vendor platform.';

DO $$
BEGIN
    RAISE NOTICE '[044] ki_import_sessions: added orphan_records column (default = 0)';
    RAISE NOTICE '[044] No vendor column added — using vn_tenants.ext_ref_type_code instead';
END;
$$;

COMMIT;
