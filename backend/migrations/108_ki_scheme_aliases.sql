-- ============================================================================
-- Migration: 008_ki_scheme_aliases.sql
-- Purpose:   Global scheme alias system for flexible import matching
-- Scope:     GLOBAL — no tenant_id, shared across all tenants
--
-- Creates:
--   ki_scheme_aliases              — alias name variations per scheme
--   normalize_scheme_name(text)    — normalize for case-insensitive matching
--   lookup_scheme_by_alias(text)   — RPC called during import pipeline
-- ============================================================================

-- ── Normalization function ────────────────────────────────────────────────
-- Uppercase, trim, collapse multiple spaces → single space.
-- Called by trigger (auto-populates alias_name_normalized) and by lookup.

CREATE OR REPLACE FUNCTION normalize_scheme_name(p_name TEXT)
RETURNS TEXT AS $$
BEGIN
  IF p_name IS NULL OR TRIM(p_name) = '' THEN
    RETURN NULL;
  END IF;
  RETURN REGEXP_REPLACE(TRIM(UPPER(p_name)), '\s+', ' ', 'g');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION normalize_scheme_name IS
'Normalize scheme name for alias matching: uppercase, trim, collapse spaces.
 IMMUTABLE — safe to use in indexes and generated columns.';

-- ── Main table ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_scheme_aliases (
  id                    SERIAL PRIMARY KEY,

  -- Links to ki_schemes — denormalized for fast lookup (no join needed)
  scheme_code           VARCHAR(20) NOT NULL
                          REFERENCES ki_schemes(scheme_code) ON DELETE CASCADE,

  -- Raw alias as the user/system provided it
  alias_name            VARCHAR(500) NOT NULL,

  -- Auto-maintained normalized form for case-insensitive matching
  -- Populated by trigger on INSERT/UPDATE
  alias_name_normalized VARCHAR(500) NOT NULL,

  -- How this alias was created
  source                VARCHAR(20) NOT NULL DEFAULT 'manual'
                          CHECK (source IN ('auto', 'manual', 'import')),

  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One alias → one scheme globally (prevents import ambiguity)
  CONSTRAINT ki_scheme_aliases_unique_normalized UNIQUE (alias_name_normalized)
);

COMMENT ON TABLE ki_scheme_aliases IS
'Global scheme alias mapping. Stores name variations so import pipeline can
 resolve CAS/CSV scheme names to ki_schemes.scheme_code. No tenant_id —
 aliases are shared across all tenants for consistency.';

-- ── Auto-normalize trigger ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ki_alias_before_upsert()
RETURNS TRIGGER AS $$
BEGIN
  NEW.alias_name_normalized := normalize_scheme_name(NEW.alias_name);
  IF NEW.alias_name_normalized IS NULL THEN
    RAISE EXCEPTION 'alias_name cannot be blank';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ki_alias_normalize ON ki_scheme_aliases;
CREATE TRIGGER trg_ki_alias_normalize
  BEFORE INSERT OR UPDATE ON ki_scheme_aliases
  FOR EACH ROW EXECUTE FUNCTION ki_alias_before_upsert();

-- ── Indexes ───────────────────────────────────────────────────────────────

-- Primary lookup path during import (the hot path)
CREATE INDEX IF NOT EXISTS idx_ki_aliases_lookup
  ON ki_scheme_aliases(alias_name_normalized)
  WHERE is_active = true;

-- Lookup all aliases for a given scheme (admin / My NAV alias tab)
CREATE INDEX IF NOT EXISTS idx_ki_aliases_scheme
  ON ki_scheme_aliases(scheme_code, is_active);

-- ── RPC: lookup_scheme_by_alias ───────────────────────────────────────────
-- Called during import pipeline to resolve a raw scheme name → scheme_code.
-- Returns at most 1 row (UNIQUE constraint on alias_name_normalized ensures this).

CREATE OR REPLACE FUNCTION lookup_scheme_by_alias(p_alias_name TEXT)
RETURNS TABLE (
  scheme_code  VARCHAR,
  scheme_name  VARCHAR,
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
    AND a.alias_name_normalized = normalize_scheme_name(p_alias_name)
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION lookup_scheme_by_alias IS
'Resolve a raw scheme name to ki_schemes.scheme_code via the alias table.
 Called during CAS/CSV import. Returns empty if no alias matches.
 STABLE — reads committed data, safe to call multiple times per transaction.';

-- ── Seed: auto-alias all existing ki_schemes ──────────────────────────────
-- Seeds scheme_name as the canonical alias for every scheme already in the DB.
-- Future imports will auto-seed via the bookmark hook.

INSERT INTO ki_scheme_aliases (scheme_code, alias_name, source)
SELECT
  scheme_code,
  scheme_name,
  'auto'
FROM ki_schemes
WHERE scheme_name IS NOT NULL
  AND TRIM(scheme_name) != ''
ON CONFLICT (alias_name_normalized) DO NOTHING;

-- Also seed nav_name if it differs from scheme_name
INSERT INTO ki_scheme_aliases (scheme_code, alias_name, source)
SELECT
  scheme_code,
  nav_name,
  'auto'
FROM ki_schemes
WHERE nav_name IS NOT NULL
  AND TRIM(nav_name) != ''
  AND normalize_scheme_name(nav_name) IS DISTINCT FROM normalize_scheme_name(scheme_name)
ON CONFLICT (alias_name_normalized) DO NOTHING;

-- ── Verification ─────────────────────────────────────────────────────────

DO $$
BEGIN
  RAISE NOTICE '✓ 008_ki_scheme_aliases: table created';
  RAISE NOTICE '✓ 008_ki_scheme_aliases: normalize_scheme_name() created';
  RAISE NOTICE '✓ 008_ki_scheme_aliases: lookup_scheme_by_alias() created';
  RAISE NOTICE '✓ 008_ki_scheme_aliases: seeded % aliases',
    (SELECT COUNT(*) FROM ki_scheme_aliases);
END $$;
