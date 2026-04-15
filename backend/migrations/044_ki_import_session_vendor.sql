-- ============================================================
-- 044_ki_import_session_vendor.sql
--
-- Extend ki_import_sessions for multi-vendor transaction import:
--
--   vendor          — which vendor's file format this session uses
--                     (investwell | cams | kfintech | mfu | nse | bse | ...)
--                     Default: 'investwell' for backward compatibility.
--
--   orphan_records  — count of staging rows where no matching client
--                     was found (vendor_code + PAN + name all failed).
--                     Different from failed_records (orphans are a
--                     data-quality issue, not a processing error).
--
-- ADDITIVE — no data loss.
-- ============================================================

BEGIN;

ALTER TABLE ki_import_sessions
    ADD COLUMN IF NOT EXISTS vendor         TEXT    NOT NULL DEFAULT 'investwell',
    ADD COLUMN IF NOT EXISTS orphan_records INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN ki_import_sessions.vendor IS
'Vendor whose file format this session uses. Used by ki_process_txn_import_session()
 to look up client codes in ki_client_codes(vendor, vendor_code).
 Common values: investwell | cams | kfintech | mfu | nse | bse.
 Defaults to investwell for backward compatibility with existing sessions.';

COMMENT ON COLUMN ki_import_sessions.orphan_records IS
'Count of staging rows where no matching client was found (vendor_code + PAN + name
 all failed to match). These rows are marked processing_status = orphan and can be
 re-processed once the missing client or vendor code mapping is added.';

-- Index for vendor-based session lookup (admin / import dashboard filters)
CREATE INDEX IF NOT EXISTS idx_ki_import_sessions_vendor
    ON ki_import_sessions(tenant_id, vendor, status)
    WHERE status IN ('processing', 'completed', 'completed_with_errors');

DO $$
BEGIN
    RAISE NOTICE '[044] ki_import_sessions: added vendor column (default = investwell)';
    RAISE NOTICE '[044] ki_import_sessions: added orphan_records column (default = 0)';
END;
$$;

COMMIT;
