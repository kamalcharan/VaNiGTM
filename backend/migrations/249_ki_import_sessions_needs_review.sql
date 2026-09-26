-- ============================================================
-- Migration: 249_ki_import_sessions_needs_review.sql
-- Purpose:   Let an import session end in the state the landing code has
--            written since migration 200: 'needs_review'.
--
-- Found by running the FTCCI file through the real pipeline on 2026-09-26.
-- landing.ts sets ki_import_sessions.status = 'needs_review' when any row is
-- held for a human decision (merge review, migration 200). The CHECK on
-- ki_import_sessions (migration 104) never learned that value — 200 and 201
-- only widened the STAGING row check — so the moment an import held a row,
-- the final UPDATE raised, the route caught it, marked the session 'failed'
-- and answered PROCESS_FAILED. The rows HAD landed (2,882 companies, 5,816
-- people); the counters said 0 and the person was told the import failed.
--
-- Idempotent and guarded: drops and recreates the constraint with the same
-- name, adding the one value. Nothing else changes.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ki_import_sessions') THEN
    ALTER TABLE ki_import_sessions DROP CONSTRAINT IF EXISTS ki_import_sessions_status_check;
    ALTER TABLE ki_import_sessions
      ADD CONSTRAINT ki_import_sessions_status_check
      CHECK (status IN ('pending', 'staged', 'processing', 'completed',
                        'completed_with_errors', 'needs_review', 'failed', 'cancelled'));
  END IF;
END $$;
