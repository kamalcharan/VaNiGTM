-- ============================================================
-- Migration: 197_ki_import_destination.sql
-- Purpose:   Teach the existing ETL pipeline where a file should land, and
--            record per-row quality at staging.
--
-- Design notes: documents/design-notes-prospect-universe.md §4.10
--
-- One pipeline, two destinations (user ruling, 2026-07-27):
--   admin tenant  → gt_universe_companies  (the common pool)
--   any tenant    → gt_prospects           (their own data)
--
-- The destination is a property of the SESSION, checked against
-- vn_tenants.is_admin from the JWT. It is never read from a request body.
--
-- Quality is scored AT STAGING, before anything lands. The provider CSV
-- profiled for this design carried 'undefined+' in 60 of 119 revenue values
-- and 'Nov-50' 34 times where a spreadsheet coerced '11-50' to a date.
-- Those rows must be reported to the user, not silently stored and then
-- scored as if they were real (CLAUDE.md rule 12).
-- ============================================================

-- ── Sessions: where does this import land, and which load is it ────────

ALTER TABLE ki_import_sessions ADD COLUMN IF NOT EXISTS destination VARCHAR(24) NOT NULL DEFAULT 'prospects';
ALTER TABLE ki_import_sessions ADD COLUMN IF NOT EXISTS load_id     BIGINT;

DO $$ BEGIN
    ALTER TABLE ki_import_sessions
        ADD CONSTRAINT ki_import_sessions_destination_check
        CHECK (destination IN ('prospects', 'universe_companies'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE ki_import_sessions
        ADD CONSTRAINT ki_import_sessions_load_fk
        FOREIGN KEY (load_id) REFERENCES gt_source_loads(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_ki_import_sessions_load ON ki_import_sessions(load_id) WHERE load_id IS NOT NULL;

COMMENT ON COLUMN ki_import_sessions.destination IS 'prospects = tenant-owned (gt_prospects). universe_companies = the common pool (gt_universe_companies), admin tenants only — enforced from vn_tenants.is_admin in the JWT, never from the request body.';
COMMENT ON COLUMN ki_import_sessions.load_id IS 'Every import is a load. Gives an upload the same rollback, freshness and provenance handling as a directory delivery.';

-- ── Staging: per-row quality, visible before anything lands ────────────

ALTER TABLE ki_import_staging ADD COLUMN IF NOT EXISTS validity       NUMERIC(4,3);
ALTER TABLE ki_import_staging ADD COLUMN IF NOT EXISTS completeness   NUMERIC(4,3);
ALTER TABLE ki_import_staging ADD COLUMN IF NOT EXISTS reject_reasons JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE ki_import_staging ADD COLUMN IF NOT EXISTS dedup_key      TEXT;

CREATE INDEX IF NOT EXISTS idx_ki_import_staging_dedup ON ki_import_staging(session_id, dedup_key) WHERE dedup_key IS NOT NULL;

COMMENT ON COLUMN ki_import_staging.reject_reasons IS 'Per-field problems found at staging, e.g. ["revenue: literal ''undefined+''", "employees: ''Nov-50'' — spreadsheet date coercion"]. Surfaced to the user before processing; never swallowed.';
COMMENT ON COLUMN ki_import_staging.dedup_key IS 'Normalised domain, else name_key|pin. Lets duplicates inside one file be flagged before they reach a destination table.';
