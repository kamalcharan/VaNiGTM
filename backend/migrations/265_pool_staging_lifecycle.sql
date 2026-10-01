-- ============================================================================
-- Migration 265: staging rows can be JUNK (with a reason) or HELD
--
-- Common pool P1 (P0-mapping §2.3; POA §1.4 lifecycle). Approved by Charan
-- 2026-10-01 (S3). Junk is a STATE, never a deletion (D-P10) — and it is
-- reversible (J5), so who marked it and when travel with the row.
--
-- Widens the processing_status CHECK the way 200 and 201 did (drop by
-- definition, re-add by name). ki_ by disposition: no rename, no new ki_ table.
-- Guarded and idempotent.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.ki_import_staging') IS NULL THEN
    RAISE EXCEPTION '[265] ki_import_staging missing — migration 104 first';
  END IF;
END $$;

-- Every CHECK naming processing_status is dropped EXCEPT the junk pairing
-- below, which also names it. (The 200/201 pattern took the first match; with
-- a second constraint on the column, a re-run picked the wrong one.)
DO $$
DECLARE c_name TEXT;
BEGIN
  FOR c_name IN SELECT conname FROM pg_constraint
   WHERE conrelid = 'ki_import_staging'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%processing_status%'
     AND conname <> 'ki_import_staging_junk_reason_pairs'
  LOOP
    EXECUTE format('ALTER TABLE ki_import_staging DROP CONSTRAINT %I', c_name);
  END LOOP;
  ALTER TABLE ki_import_staging
    ADD CONSTRAINT ki_import_staging_processing_status_check
    CHECK (processing_status IN (
      'pending', 'processing', 'success', 'failed',
      'duplicate', 'skipped', 'orphan', 'conflict',
      'junk', 'held'
    ));
END $$;

ALTER TABLE ki_import_staging ADD COLUMN IF NOT EXISTS junk_reason VARCHAR(20);
ALTER TABLE ki_import_staging ADD COLUMN IF NOT EXISTS junk_by     UUID;
ALTER TABLE ki_import_staging ADD COLUMN IF NOT EXISTS junk_at     TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE ki_import_staging ADD CONSTRAINT ki_import_staging_junk_reason_check
    CHECK (junk_reason IS NULL OR junk_reason IN (
      'placeholder', 'unreadable', 'consumer', 'defunct', 'out_of_scope', 'spam_source'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A junk row names its reason; a row that is not junk carries none.
DO $$ BEGIN
  ALTER TABLE ki_import_staging ADD CONSTRAINT ki_import_staging_junk_reason_pairs
    CHECK ((processing_status = 'junk') = (junk_reason IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN ki_import_staging.junk_reason IS
  'Why the row is junk (P0 §2.3). Junk is a state: the row stays, and an admin (pool) or the tenant (own copy) can reverse it.';
