-- ============================================================================
-- Migration 264: pool sources carry a licence; loads carry kind and cost
--
-- Common pool P1 (documents/POA-2026-10-01-common-pool.md;
-- documents/pool/P0-mapping.md §2.1–§2.2). Approved by Charan 2026-10-01 (S3).
--
-- WHAT IT ADDS
--   gt_data_sources.licence_class   where a source's data may land
--   gt_data_sources.may_enter_pool  the licence gate as one readable flag;
--                                   false → a tenant's own copy only
--   gt_data_sources.kind            + registry · listing · enrichment
--   gt_source_loads.load_kind       delivery · enrichment (an enrichment run
--                                   writes its outputs as a load, so it can be
--                                   retired like a bad file)
--   gt_source_loads.cost_inr        what the load cost (providers, model)
--   seed rows for the sources the spec names
--
-- WHAT IT CHANGES FOR EXISTING ROWS
--   upload  → unknown_provenance, may_enter_pool = false. A pool delivery must
--             name a real source from now on; the gate is enforced in code in
--             P1 sprint B, not by this migration.
--   ftcci   → licensed_private, may_enter_pool = true (decided 2026-09-26:
--             the chamber directory is in the pool).
--   apollo  → licensed_private, may_enter_pool = false (a tenant's own key;
--             its terms forbid redistribution — CLAUDE.md).
--
-- The enrichment_request_id FK arrives with gt_enrichment_requests (267).
-- Guarded and idempotent.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.gt_data_sources') IS NULL OR to_regclass('public.gt_source_loads') IS NULL THEN
    RAISE EXCEPTION '[264] gt_data_sources / gt_source_loads missing — migration 193 first';
  END IF;
END $$;

-- ── gt_data_sources ────────────────────────────────────────────────────────

ALTER TABLE gt_data_sources ADD COLUMN IF NOT EXISTS licence_class  VARCHAR(30);
ALTER TABLE gt_data_sources ADD COLUMN IF NOT EXISTS may_enter_pool BOOLEAN NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE gt_data_sources ADD CONSTRAINT gt_data_sources_licence_class_check
    CHECK (licence_class IS NULL OR licence_class IN (
      'open_gov', 'licensed_private', 'licensed_shareable', 'public_listing',
      'own_relationship', 'unknown_provenance', 'api_terms_no_cache'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
DECLARE c_name TEXT;
BEGIN
  SELECT conname INTO c_name FROM pg_constraint
   WHERE conrelid = 'gt_data_sources'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%kind%' AND conname <> 'gt_data_sources_licence_class_check';
  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE gt_data_sources DROP CONSTRAINT %I', c_name);
  END IF;
  ALTER TABLE gt_data_sources ADD CONSTRAINT gt_data_sources_kind_check
    CHECK (kind IN ('directory', 'provider', 'upload', 'registry', 'listing', 'enrichment'));
END $$;

UPDATE gt_data_sources SET licence_class = 'unknown_provenance', may_enter_pool = false
 WHERE code = 'upload' AND licence_class IS NULL;
UPDATE gt_data_sources SET licence_class = 'licensed_private', may_enter_pool = true
 WHERE code = 'ftcci' AND licence_class IS NULL;
UPDATE gt_data_sources SET licence_class = 'licensed_private', may_enter_pool = false
 WHERE code = 'apollo' AND licence_class IS NULL;

-- Survivorship tiers (P0 §2.1): MCA > Udyam > chamber > prospector > legacy
-- for legal fields; a verified crawl first for the domain. Tier is data —
-- re-tuning is an UPDATE and a re-merge.
INSERT INTO gt_data_sources (code, name, kind, tier, licence_class, may_enter_pool) VALUES
  ('mca',        'MCA company master data',      'registry',   90, 'open_gov',           true),
  ('udyam',      'Udyam registrations (OGD)',    'registry',   70, 'open_gov',           true),
  ('analytica',  'analytica Lab India exhibitors','listing',    45, 'public_listing',     true),
  ('prospector', 'Prospector export',            'provider',   75, 'licensed_shareable', false), -- true once the vendor clause is confirmed
  ('legacy_dir', 'Legacy business directory',    'directory',  20, 'unknown_provenance', true),
  ('crawl',      'Website crawl',                'enrichment', 65, 'public_listing',     true),
  ('llm_pass',   'Model classification',         'enrichment', 50, NULL,                 true),
  ('findymail',  'Findymail',                    'enrichment', 80, 'licensed_private',   false),
  ('places',     'Google Places',                'enrichment', 10, 'api_terms_no_cache', false),
  ('manual',     'Entered by a person',          'enrichment', 85, NULL,                 true)
ON CONFLICT (code) DO NOTHING;

COMMENT ON COLUMN gt_data_sources.licence_class IS
  'Where this source''s data may land (P0 §2.1). Read with may_enter_pool.';
COMMENT ON COLUMN gt_data_sources.may_enter_pool IS
  'false → rows from this source land only in a tenant''s own copy, never the common pool (D-P6).';

-- ── gt_source_loads ────────────────────────────────────────────────────────

ALTER TABLE gt_source_loads ADD COLUMN IF NOT EXISTS load_kind VARCHAR(12) NOT NULL DEFAULT 'delivery';
ALTER TABLE gt_source_loads ADD COLUMN IF NOT EXISTS cost_inr  NUMERIC(12,2);

DO $$ BEGIN
  ALTER TABLE gt_source_loads ADD CONSTRAINT gt_source_loads_load_kind_check
    CHECK (load_kind IN ('delivery', 'enrichment'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN gt_source_loads.load_kind IS
  'delivery = a file or pull; enrichment = the outputs of one enrichment run, retirable like a bad delivery.';
