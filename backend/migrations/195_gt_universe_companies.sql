-- ============================================================
-- Migration: 195_gt_universe_companies.sql
-- Purpose:   The common pool — companies contributed by directories and
--            providers, deduplicated into one golden record each.
--
-- Design notes: documents/design-notes-prospect-universe.md §3, §4.2-4.4, §6
--
-- SHAPE: source records are IMMUTABLE, the golden record is DERIVED.
-- Every source keeps its own row in gt_universe_company_sources; the merged
-- company in gt_universe_companies is computed from them, field by field.
--
-- Why not merge-on-write into one table: the quality rules WILL change as
-- more directories and providers land. With source rows retained the merge
-- is re-run; with merge-on-write the losing value is gone and the only
-- recovery is re-ingesting everything.
--
-- Why FIELD-level and not record-level: an FTCCI member with a good local
-- phone and address but no domain, matched later by a provider with domain,
-- headcount and LinkedIn but no India landline. Record-level discards the
-- phone. Since directories are weakest exactly where providers are
-- strongest, field-level is the only version that compounds.
--
-- CROSS-TENANT INFRASTRUCTURE. No tenant_id, RLS DISABLED BY DESIGN — the
-- same exception already granted to gt_events (185) and gt_prompts. Tenants
-- read this pool only through an entitlement, and never write to it.
-- Tenant-owned prospects live in gt_prospects (migration 196).
--
-- COMPANIES ONLY. Personal contact details are deliberately absent: a
-- shared pool of named individuals with personal mobile numbers is a
-- different proposition under DPDP/GDPR than a shared pool of businesses.
-- Universe contacts are a separate, later decision.
-- ============================================================

-- ── Immutable per-source records ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_universe_company_sources (
    id                  BIGSERIAL    PRIMARY KEY,
    source_id           SMALLINT     NOT NULL REFERENCES gt_data_sources(id),
    load_id             BIGINT       NOT NULL REFERENCES gt_source_loads(id) ON DELETE CASCADE,

    -- The source's OWN id for this record. FTCCI ships one: PANEL+Panel No
    -- is unique across all 2,913 rows. Sources without a stable id get a
    -- hash of the normalised row. This is what makes re-ingest idempotent.
    source_record_id    VARCHAR(200) NOT NULL,

    company_id          BIGINT,                      -- resolved golden record; FK below

    -- Normalised business fields
    name                VARCHAR(300) NOT NULL,
    name_key            TEXT         GENERATED ALWAYS AS (
                            BTRIM(REGEXP_REPLACE(
                              REGEXP_REPLACE(
                                REGEXP_REPLACE(UPPER(name), '[^A-Z0-9 ]', ' ', 'g'),
                                '\y(PVT|PRIVATE|LTD|LIMITED|LLP|INC|CO|COMPANY|THE)\y', ' ', 'g'),
                              '\s+', ' ', 'g'))
                        ) STORED,
    domain_normalized   VARCHAR(255),
    website             VARCHAR(500),
    email               VARCHAR(320),
    phone               VARCHAR(120),
    address_line        TEXT,
    city                VARCHAR(120),
    state_code          VARCHAR(8),
    pin                 VARCHAR(12),
    country             VARCHAR(80),
    industry_raw        TEXT,
    industry_id         INTEGER      REFERENCES gt_industries(id),
    employees_band      VARCHAR(40),
    revenue_band        VARCHAR(40),
    linkedin_url        VARCHAR(500),
    year_founded        SMALLINT,
    description         TEXT,

    raw                 JSONB        NOT NULL DEFAULT '{}'::jsonb,
    source_as_of        DATE,                        -- inherited from the load unless stated

    -- Quality as COMPONENTS, never one opaque number. Fill rate is not
    -- quality: the provider CSV read 100% populated on revenue while 60 of
    -- 119 values were the literal string 'undefined+', and its employees
    -- column held 'Nov-50' 34 times where a spreadsheet ate '11-50'.
    completeness        NUMERIC(4,3),
    validity            NUMERIC(4,3),
    field_quality       JSONB        NOT NULL DEFAULT '{}'::jsonb,

    -- domain when present, else name_key|pin — the first pass of identity
    -- resolution. Domain alone is NOT sufficient: 1,590 FTCCI rows carry a
    -- domain but only 1,559 are distinct, so 31 share a website with
    -- another member (group companies, divisions).
    blocking_key        TEXT,

    ingested_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),

    UNIQUE (source_id, source_record_id)
);

CREATE INDEX IF NOT EXISTS idx_gt_ucs_company  ON gt_universe_company_sources(company_id);
CREATE INDEX IF NOT EXISTS idx_gt_ucs_load     ON gt_universe_company_sources(load_id);
CREATE INDEX IF NOT EXISTS idx_gt_ucs_blocking ON gt_universe_company_sources(blocking_key);
CREATE INDEX IF NOT EXISTS idx_gt_ucs_domain   ON gt_universe_company_sources(domain_normalized) WHERE domain_normalized IS NOT NULL;

COMMENT ON TABLE  gt_universe_company_sources IS 'Immutable per-source company records. Upsert key (source_id, source_record_id) makes re-ingesting the same file idempotent.';
COMMENT ON COLUMN gt_universe_company_sources.field_quality IS 'Per-field score read by the merge. Values failing validation score near zero and lose to any source supplying a real one.';

-- ── The golden record ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_universe_companies (
    id                  BIGSERIAL    PRIMARY KEY,

    name                VARCHAR(300) NOT NULL,
    name_key            TEXT,
    domain_normalized   VARCHAR(255),
    website             VARCHAR(500),
    email               VARCHAR(320),
    phone               VARCHAR(120),
    address_line        TEXT,
    city                VARCHAR(120),
    state_code          VARCHAR(8),
    pin                 VARCHAR(12),
    country             VARCHAR(80),
    industry_id         INTEGER      REFERENCES gt_industries(id),
    employees_band      VARCHAR(40),
    revenue_band        VARCHAR(40),
    linkedin_url        VARCHAR(500),
    year_founded        SMALLINT,
    description         TEXT,

    -- Which source won each field. Provenance is per FIELD, not per row.
    field_sources       JSONB        NOT NULL DEFAULT '{}'::jsonb,
    source_codes        TEXT[]       NOT NULL DEFAULT '{}',  -- shown as "FTCCI · Apollo"
    quality_score       NUMERIC(5,3),
    best_as_of          DATE,

    -- Late merge: when a new source reveals two golden records are one
    -- company, the loser is NOT deleted — it keeps merged_into_id so
    -- anything already pointing at it still resolves.
    merged_into_id      BIGINT       REFERENCES gt_universe_companies(id),
    needs_review        BOOLEAN      NOT NULL DEFAULT false,

    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gt_uc_domain   ON gt_universe_companies(domain_normalized) WHERE domain_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gt_uc_name_key ON gt_universe_companies(name_key);
CREATE INDEX IF NOT EXISTS idx_gt_uc_industry ON gt_universe_companies(industry_id);
CREATE INDEX IF NOT EXISTS idx_gt_uc_state    ON gt_universe_companies(state_code);
CREATE INDEX IF NOT EXISTS idx_gt_uc_live     ON gt_universe_companies(id) WHERE merged_into_id IS NULL;

DO $$ BEGIN
    ALTER TABLE gt_universe_company_sources
        ADD CONSTRAINT gt_ucs_company_fk
        FOREIGN KEY (company_id) REFERENCES gt_universe_companies(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE  gt_universe_companies IS 'Derived golden company records. Cross-tenant infrastructure: no tenant_id, RLS disabled by design (see gt_events/gt_prompts precedent). Read-only to tenants.';
COMMENT ON COLUMN gt_universe_companies.merged_into_id IS 'Set when this record was superseded by a late merge. Never delete a merged record — adopted rows resolve through it.';

-- ── Alias trail for late merges ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_universe_company_aliases (
    alias_company_id  BIGINT      NOT NULL,
    company_id        BIGINT      NOT NULL REFERENCES gt_universe_companies(id) ON DELETE CASCADE,
    merged_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (alias_company_id)
);

CREATE INDEX IF NOT EXISTS idx_gt_uca_company ON gt_universe_company_aliases(company_id);

COMMENT ON TABLE gt_universe_company_aliases IS 'Old golden-record id → surviving id. Overlap between chambers, federations and vertical directories makes late merges routine, so this is load-bearing, not defensive.';
