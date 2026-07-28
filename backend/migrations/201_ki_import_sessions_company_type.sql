-- ============================================================
-- Migration: 201_ki_import_sessions_company_type.sql
-- Purpose:   Let ki_import_sessions actually accept a GTM company import.
--
-- Found by the user running the import for the first time against
-- vani_gtm_db, which failed with:
--
--   column "customer_lookup_method" of relation "ki_import_sessions"
--   does not exist
--
-- ── WHAT THE REAL DATABASE ACTUALLY HAS ───────────────────────────────
--
-- ki_import_sessions is created by migration 104 and NO migration in this
-- repo has ever altered its column list beyond orphan_records (144/146).
-- So on any database built from these migrations:
--
--   * customer_lookup_method DOES NOT EXIST. The INSERT in etl.routes.ts
--     has always written to it, which means this import path has never
--     once run here — the column exists only in the kewalinvest production
--     database the code was ported from. The fix is in the code: the column
--     is MFD transaction-matching machinery, and the only import types this
--     route accepts (customer, company) never read it. It is dropped from
--     the INSERT rather than added to a GTM table.
--
--   * import_type is CHECKed against ('scheme','customer','transaction',
--     'bookmark') — with no 'company'. That is the next failure, one line
--     further down the same statement, and it is fixed here.
--
-- This is the drift CLAUDE.md warns about: vani_gtm_db was bootstrapped
-- fresh and never carried the MFD schema, so migration history and schema
-- reality diverge. Guard everything.
-- ============================================================

-- ── import_type must allow the GTM import ─────────────────────────────
--
-- 104 declares the CHECK inline, so it is auto-named. Drop whatever is on
-- the column and re-add a named one, which also makes this re-runnable.

DO $$
DECLARE c_name TEXT;
BEGIN
    SELECT conname INTO c_name
    FROM   pg_constraint
    WHERE  conrelid = 'ki_import_sessions'::regclass
      AND  contype  = 'c'
      AND  pg_get_constraintdef(oid) ILIKE '%import_type%';

    IF c_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE ki_import_sessions DROP CONSTRAINT %I', c_name);
    END IF;

    -- 'company' is what all three GTM uploads send; which of them it is
    -- lives in `relationship` (migration 200). The MFD values are kept so
    -- any historical row still validates.
    ALTER TABLE ki_import_sessions
        ADD CONSTRAINT ki_import_sessions_import_type_check
        CHECK (import_type IN ('scheme', 'customer', 'transaction', 'bookmark', 'company'));
END $$;

COMMENT ON COLUMN ki_import_sessions.import_type IS 'Pipeline shape: company = the GTM import (people and/or companies). The MFD values are retained so historical rows validate. What a company import MEANS to the tenant is ki_import_sessions.relationship.';

-- ── Counters the routes read, ensured ─────────────────────────────────
-- 144/146 add orphan_records guarded; re-asserted here so a database that
-- skipped the MFD range still satisfies GET /sessions.

ALTER TABLE ki_import_sessions ADD COLUMN IF NOT EXISTS orphan_records INTEGER NOT NULL DEFAULT 0;

-- Deliberately NOT added: customer_lookup_method. See the header — it is
-- removed from the code instead.

-- ── Repair: migration 200 narrowed the staging status constraint ──────
--
-- 200 dropped the auto-named CHECK on ki_import_staging.processing_status and
-- re-added it from 104's original list plus 'conflict' — which silently
-- dropped 'orphan', added by migrations 143/146. reconcileSessionCounters
-- counts orphan rows and the MFD RPCs write them.
--
-- 200 is fixed at source for anyone applying it fresh; this re-asserts the
-- complete set for any database where 200 has already been applied.

DO $$
DECLARE c_name TEXT;
BEGIN
    SELECT conname INTO c_name
    FROM   pg_constraint
    WHERE  conrelid = 'ki_import_staging'::regclass
      AND  contype  = 'c'
      AND  pg_get_constraintdef(oid) ILIKE '%processing_status%';

    IF c_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE ki_import_staging DROP CONSTRAINT %I', c_name);
    END IF;

    ALTER TABLE ki_import_staging
        ADD CONSTRAINT ki_import_staging_processing_status_check
        CHECK (processing_status IN (
            'pending', 'processing', 'success', 'failed',
            'duplicate', 'skipped', 'orphan', 'conflict'
        ));
END $$;
