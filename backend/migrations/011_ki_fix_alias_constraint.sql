-- ============================================================================
-- Migration: 011_ki_fix_alias_constraint.sql
-- Purpose:   Fix broken alias constraint + rebuild alias data + backfill bookmarks
--
-- Root cause: UNIQUE(alias_name_normalized) is GLOBAL — with 16K+ schemes,
--             similar names silently conflict on INSERT ON CONFLICT DO NOTHING,
--             leaving thousands of schemes with no alias seeded.
--             kewalinvest fixed this in their migration 005.
--
-- Changes:
--   1. Drop global UNIQUE(alias_name_normalized)
--   2. Add per-scheme UNIQUE(scheme_code, alias_name_normalized)
--   3. Expand source CHECK to include 'csv_upload' and 'master_nav'
--   4. Truncate + re-seed ki_scheme_aliases (data was incomplete)
--   5. Update lookup_scheme_by_alias() — add missing active scheme filter
--   6. Backfill ki_scheme_bookmarks.alias_name where NULL
--   7. Seed ki_scheme_aliases from existing bookmark alias_names
-- ============================================================================

DO $$ BEGIN RAISE NOTICE '== 011_ki_fix_alias_constraint: starting =='; END $$;

-- ── 1. Fix UNIQUE constraint ──────────────────────────────────────────────────

ALTER TABLE ki_scheme_aliases
  DROP CONSTRAINT IF EXISTS ki_scheme_aliases_unique_normalized;

ALTER TABLE ki_scheme_aliases
  ADD CONSTRAINT ki_scheme_aliases_unique_per_scheme
  UNIQUE (scheme_code, alias_name_normalized);

DO $$ BEGIN RAISE NOTICE '✓ Step 1: UNIQUE constraint changed to (scheme_code, alias_name_normalized)'; END $$;

-- ── 2. Expand source CHECK constraint ────────────────────────────────────────
-- kewalinvest uses 'csv_upload' (name from tenant CSV) and 'master_nav'
-- (master scheme nav_name). Add these alongside existing values.

ALTER TABLE ki_scheme_aliases
  DROP CONSTRAINT IF EXISTS ki_scheme_aliases_source_check;

-- source column was defined inline — drop via column default and re-add constraint
ALTER TABLE ki_scheme_aliases
  ADD CONSTRAINT ki_scheme_aliases_source_check
  CHECK (source IN ('auto', 'manual', 'import', 'csv_upload', 'master_nav'));

DO $$ BEGIN RAISE NOTICE '✓ Step 2: source CHECK expanded to include csv_upload, master_nav'; END $$;

-- ── 3. Rebuild lookup index to match new constraint ───────────────────────────

DROP INDEX IF EXISTS idx_ki_aliases_lookup;
CREATE INDEX idx_ki_aliases_lookup
  ON ki_scheme_aliases(alias_name_normalized)
  WHERE is_active = true;

DO $$ BEGIN RAISE NOTICE '✓ Step 3: lookup index rebuilt'; END $$;

-- ── 4. Truncate + re-seed ki_scheme_aliases ───────────────────────────────────
-- Current data is incomplete — truncate and rebuild with the correct constraint.

TRUNCATE ki_scheme_aliases RESTART IDENTITY;

-- 4a. Seed scheme_name as primary alias for every scheme
INSERT INTO ki_scheme_aliases (scheme_code, alias_name, source)
SELECT
  scheme_code,
  scheme_name,
  'auto'
FROM ki_schemes
WHERE scheme_name IS NOT NULL
  AND TRIM(scheme_name) != ''
ON CONFLICT (scheme_code, alias_name_normalized) DO NOTHING;

-- 4b. Seed nav_name as additional alias if different from scheme_name
INSERT INTO ki_scheme_aliases (scheme_code, alias_name, source)
SELECT
  scheme_code,
  nav_name,
  'auto'
FROM ki_schemes
WHERE nav_name IS NOT NULL
  AND TRIM(nav_name) != ''
  AND normalize_scheme_name(nav_name) IS DISTINCT FROM normalize_scheme_name(scheme_name)
ON CONFLICT (scheme_code, alias_name_normalized) DO NOTHING;

DO $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM ki_scheme_aliases;
  RAISE NOTICE '✓ Step 4: ki_scheme_aliases rebuilt — % aliases seeded', v_count;
END $$;

-- ── 5. Update lookup_scheme_by_alias() ───────────────────────────────────────
-- Add missing filter: ki_schemes.active = true
-- Prevents matching against closed/inactive schemes.

CREATE OR REPLACE FUNCTION lookup_scheme_by_alias(p_alias_name TEXT)
RETURNS TABLE (
  scheme_code   VARCHAR,
  scheme_name   VARCHAR,
  matched_alias VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.scheme_code::VARCHAR,
    s.scheme_name::VARCHAR,
    a.alias_name::VARCHAR
  FROM ki_scheme_aliases a
  JOIN ki_schemes        s ON s.scheme_code = a.scheme_code
  WHERE a.is_active = true
    AND s.active    = true
    AND a.alias_name_normalized = normalize_scheme_name(p_alias_name)
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION lookup_scheme_by_alias IS
'Resolve a raw scheme name to ki_schemes.scheme_code via the alias table.
 Called during CAS/CSV import as 3rd fallback (after scheme_code and ISIN).
 Filters inactive schemes. Returns empty if no alias matches.';

DO $$ BEGIN RAISE NOTICE '✓ Step 5: lookup_scheme_by_alias() updated with active scheme filter'; END $$;

-- ── 6. Backfill ki_scheme_bookmarks.alias_name ───────────────────────────────
-- Existing bookmarks have alias_name = NULL — backfill from ki_schemes.scheme_name.
-- This is required for transaction import matching (which resolves schemes by
-- matching the CSV scheme name against bookmark.alias_name).

UPDATE ki_scheme_bookmarks b
SET    alias_name = s.scheme_name,
       updated_at = now()
FROM   ki_schemes s
WHERE  b.scheme_code = s.scheme_code
  AND  b.alias_name IS NULL;

DO $$
DECLARE v_count INTEGER;
BEGIN
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '✓ Step 6: % bookmarks backfilled with alias_name', v_count;
END $$;

-- ── 7. Seed ki_scheme_aliases from existing bookmark alias_names ──────────────
-- Bookmark alias_names are tenant-specific CSV names — seed them as global aliases
-- so future imports can resolve them via lookup_scheme_by_alias().

INSERT INTO ki_scheme_aliases (scheme_code, alias_name, source)
SELECT DISTINCT
  b.scheme_code,
  b.alias_name,
  'import'
FROM ki_scheme_bookmarks b
WHERE b.alias_name IS NOT NULL
  AND TRIM(b.alias_name) != ''
ON CONFLICT (scheme_code, alias_name_normalized) DO NOTHING;

DO $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM ki_scheme_aliases WHERE source = 'import';
  RAISE NOTICE '✓ Step 7: % import-source aliases seeded from existing bookmarks', v_count;
END $$;

-- ── Verification ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_total_schemes  INTEGER;
  v_total_aliases  INTEGER;
  v_schemes_covered INTEGER;
  v_orphaned       INTEGER;
BEGIN
  SELECT COUNT(*)          INTO v_total_schemes  FROM ki_schemes WHERE active = true;
  SELECT COUNT(*)          INTO v_total_aliases  FROM ki_scheme_aliases WHERE is_active = true;
  SELECT COUNT(DISTINCT scheme_code) INTO v_schemes_covered FROM ki_scheme_aliases WHERE is_active = true;
  SELECT COUNT(*)          INTO v_orphaned
    FROM ki_scheme_aliases a
    LEFT JOIN ki_schemes s ON s.scheme_code = a.scheme_code
    WHERE s.scheme_code IS NULL;

  RAISE NOTICE '== 011_ki_fix_alias_constraint: complete ==';
  RAISE NOTICE '   Active schemes:        %', v_total_schemes;
  RAISE NOTICE '   Total aliases:         %', v_total_aliases;
  RAISE NOTICE '   Schemes with aliases:  %', v_schemes_covered;
  RAISE NOTICE '   Orphaned aliases:      %', v_orphaned;

  IF v_orphaned > 0 THEN
    RAISE WARNING '⚠ % orphaned aliases found — run cleanup', v_orphaned;
  END IF;
END $$;
