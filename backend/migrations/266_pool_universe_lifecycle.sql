-- ============================================================================
-- Migration 266: the golden record gets a lifecycle; source rows say how
-- and by which model they were obtained
--
-- Common pool P1 (P0-mapping §1, §2.4, §2.5, §9; S1, S2, S3, S14). Approved by
-- Charan 2026-10-01.
--
-- THE CORE POOL (decision S1): gt_universe_companies rows whose
-- lifecycle_state = 'complete' (admitted_at set). Everything earlier — the
-- staging row, the per-source rows, a candidate golden record — is staging,
-- whichever table it sits in, and is not visible to tenants.
--
-- Duplicates are FLAGGED, never merged (D-P3): duplicate_of_id. merged_into_id
-- stays for a person's explicit late merge.
--
-- pg_trgm (S2) powers rung 4–5 of the match ladder (P0 §4).
--
-- RLS stays OFF on both tables by design (no tenant_id; platform-written —
-- the same exception as 195 and gt_events). Guarded and idempotent.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.gt_universe_companies') IS NULL
     OR to_regclass('public.gt_universe_company_sources') IS NULL THEN
    RAISE EXCEPTION '[266] gt_universe_* missing — migration 195 first';
  END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Fields both layers carry ───────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['gt_universe_company_sources', 'gt_universe_companies'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS cin                 VARCHAR(21)', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS llpin               VARCHAR(8)', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS gstin               VARCHAR(15)', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS legal_status        VARCHAR(12)', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS company_class       VARCHAR(14)', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS incorporated_on     DATE', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS paid_up_capital_inr NUMERIC(18,2)', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS nic_codes           TEXT[]', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS is_individual       BOOLEAN', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS is_foreign          BOOLEAN', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS twitter_url         VARCHAR(500)', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS facebook_url        VARCHAR(500)', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS role_emails         TEXT[]', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS phones              TEXT[]', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS domain_status       VARCHAR(12)', t);

    BEGIN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (legal_status IS NULL OR legal_status IN (''active'',''struck_off'',''dormant'',''unknown''))', t, t || '_legal_status_check');
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (company_class IS NULL OR company_class IN (''private'',''public'',''llp'',''proprietorship'',''partnership'',''foreign''))', t, t || '_company_class_check');
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (domain_status IS NULL OR domain_status IN (''found'',''none_found'',''not_tried''))', t, t || '_domain_status_check');
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END LOOP;
END $$;

-- ── Source rows: how the value was obtained, and by which model (§9) ───────
ALTER TABLE gt_universe_company_sources ADD COLUMN IF NOT EXISTS method     VARCHAR(10) NOT NULL DEFAULT 'import';
ALTER TABLE gt_universe_company_sources ADD COLUMN IF NOT EXISTS confidence NUMERIC(3,2);
ALTER TABLE gt_universe_company_sources ADD COLUMN IF NOT EXISTS model      VARCHAR(120);

DO $$ BEGIN
  ALTER TABLE gt_universe_company_sources ADD CONSTRAINT gt_universe_company_sources_method_check
    CHECK (method IN ('import', 'crawl', 'llm', 'provider', 'manual'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN gt_universe_company_sources.model IS
  'provider:model that produced this row (NULL for an import). Per-model quality is measurable only if every answer says who gave it (P0 §9).';

-- ── The golden record's lifecycle ──────────────────────────────────────────
ALTER TABLE gt_universe_companies ADD COLUMN IF NOT EXISTS lifecycle_state  VARCHAR(10) NOT NULL DEFAULT 'candidate';
ALTER TABLE gt_universe_companies ADD COLUMN IF NOT EXISTS admitted_at      TIMESTAMPTZ;
ALTER TABLE gt_universe_companies ADD COLUMN IF NOT EXISTS complete_checks  JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE gt_universe_companies ADD COLUMN IF NOT EXISTS junk_reason      VARCHAR(20);
ALTER TABLE gt_universe_companies ADD COLUMN IF NOT EXISTS junk_by          UUID;
ALTER TABLE gt_universe_companies ADD COLUMN IF NOT EXISTS junk_at          TIMESTAMPTZ;
ALTER TABLE gt_universe_companies ADD COLUMN IF NOT EXISTS duplicate_of_id  BIGINT REFERENCES gt_universe_companies(id);
ALTER TABLE gt_universe_companies ADD COLUMN IF NOT EXISTS coverage_score   SMALLINT;
ALTER TABLE gt_universe_companies ADD COLUMN IF NOT EXISTS coverage_parts   JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE gt_universe_companies ADD COLUMN IF NOT EXISTS last_enriched_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE gt_universe_companies ADD CONSTRAINT gt_universe_companies_lifecycle_check
    CHECK (lifecycle_state IN ('candidate', 'enriching', 'held', 'complete', 'junk'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE gt_universe_companies ADD CONSTRAINT gt_universe_companies_admitted_pairs
    CHECK ((lifecycle_state = 'complete') = (admitted_at IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE gt_universe_companies ADD CONSTRAINT gt_universe_companies_junk_reason_check
    CHECK (junk_reason IS NULL OR junk_reason IN (
      'placeholder', 'unreadable', 'consumer', 'defunct', 'out_of_scope', 'spam_source'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE gt_universe_companies ADD CONSTRAINT gt_universe_companies_junk_pairs
    CHECK ((lifecycle_state = 'junk') = (junk_reason IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE gt_universe_companies ADD CONSTRAINT gt_universe_companies_coverage_range
    CHECK (coverage_score IS NULL OR coverage_score BETWEEN 0 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_gt_universe_companies_lifecycle
  ON gt_universe_companies (lifecycle_state, state_code);
CREATE INDEX IF NOT EXISTS idx_gt_universe_companies_nic
  ON gt_universe_companies USING gin (nic_codes);
CREATE INDEX IF NOT EXISTS idx_gt_universe_companies_name_trgm
  ON gt_universe_companies USING gin (name_key gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_gt_universe_company_sources_name_trgm
  ON gt_universe_company_sources USING gin (name_key gin_trgm_ops);
CREATE UNIQUE INDEX IF NOT EXISTS uq_gt_universe_companies_cin
  ON gt_universe_companies (cin) WHERE cin IS NOT NULL AND lifecycle_state <> 'junk';

COMMENT ON COLUMN gt_universe_companies.lifecycle_state IS
  'candidate → enriching → complete (THE CORE POOL, admitted_at set) | held (a person decides) | junk (reason). Tenants see complete only (S1).';
COMMENT ON COLUMN gt_universe_companies.complete_checks IS
  'The Complete test (POA §1.1): each of the 8 checks with pass/fail and the source of the value that decided it.';
COMMENT ON COLUMN gt_universe_companies.duplicate_of_id IS
  'Flagged as a possible duplicate of another company — never merged automatically (D-P3).';

-- ── The tenant copy's own enrichment date (S14) ────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.gt_prospects') IS NOT NULL THEN
    ALTER TABLE gt_prospects ADD COLUMN IF NOT EXISTS last_enriched_at TIMESTAMPTZ;
  END IF;
END $$;
