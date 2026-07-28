-- ============================================================
-- Migration: 196_gt_prospects.sql
-- Purpose:   A tenant's own companies — uploaded by them, or adopted from
--            the common pool.
--
-- Design notes: documents/design-notes-prospect-universe.md §4.6, §4.7
--
-- The OTHER destination. Same ETL pipeline as the common pool, same
-- quality/dedup machinery, different table and different rules:
--   gt_universe_companies  — cross-tenant, no tenant_id, admin writes only
--   gt_prospects           — tenant-scoped, environment-scoped, RLS on
--
-- ADOPTION COPIES, IT DOES NOT REFERENCE. universe_company_id records where
-- a row came from, but the values are copied at adoption. A refresh of the
-- common pool must never silently change what a tenant is working on
-- mid-campaign; improvements surface as an offer to refresh, with a visible
-- diff, never as a mutation underneath them.
--
-- universe_company_id is NULLABLE FROM DAY ONE so tenant uploads ship now
-- and adoption from the pool needs no migration of existing rows.
-- ============================================================

CREATE TABLE IF NOT EXISTS gt_prospects (
    id                    BIGSERIAL    PRIMARY KEY,
    tenant_id             UUID         NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    is_live               BOOLEAN      NOT NULL DEFAULT false,
    is_active             BOOLEAN      NOT NULL DEFAULT true,

    -- Tenant-facing id via gt_next_seq(tenant_id, 'prospect') → PROS-0001.
    -- Raw PKs are never exposed (CLAUDE.md).
    ref                   VARCHAR(24),

    -- Provenance
    load_id               BIGINT       REFERENCES gt_source_loads(id) ON DELETE SET NULL,
    universe_company_id   BIGINT       REFERENCES gt_universe_companies(id),
    source                VARCHAR(40)  NOT NULL DEFAULT 'upload',
    external_ref          TEXT,

    -- Company fields, COPIED (see header)
    name                  VARCHAR(300) NOT NULL,
    name_key              TEXT         GENERATED ALWAYS AS (
                              REGEXP_REPLACE(
                                REGEXP_REPLACE(
                                  REGEXP_REPLACE(UPPER(name), '[^A-Z0-9 ]', ' ', 'g'),
                                  '\y(PVT|PRIVATE|LTD|LIMITED|LLP|INC|CO|COMPANY|THE)\y', ' ', 'g'),
                                '\s+', ' ', 'g')
                          ) STORED,
    domain_normalized     VARCHAR(255),
    website               VARCHAR(500),
    email                 VARCHAR(320),
    phone                 VARCHAR(120),
    address_line          TEXT,
    city                  VARCHAR(120),
    state_code            VARCHAR(8),
    pin                   VARCHAR(12),
    country               VARCHAR(80),
    industry_id           INTEGER      REFERENCES gt_industries(id),
    industry_raw          TEXT,
    employees_band        VARCHAR(40),
    revenue_band          VARCHAR(40),
    linkedin_url          VARCHAR(500),
    year_founded          SMALLINT,
    description           TEXT,

    raw                   JSONB        NOT NULL DEFAULT '{}'::jsonb,

    -- Same quality components as the pool. A tenant's own file needs these
    -- as much as a directory does — the provider CSV profiled for this
    -- design was tenant-shaped and still carried 'undefined+' in 60 of 119
    -- revenue values and 'Nov-50' 34 times in the employees column.
    completeness          NUMERIC(4,3),
    validity              NUMERIC(4,3),
    source_as_of          DATE,

    -- Pipeline state
    status                VARCHAR(20)  NOT NULL DEFAULT 'new',
    score                 INTEGER      NOT NULL DEFAULT 0,
    score_reasons         JSONB        NOT NULL DEFAULT '{}'::jsonb,

    adopted_at            TIMESTAMPTZ,
    created_by            UUID,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $$ BEGIN
    ALTER TABLE gt_prospects
        ADD CONSTRAINT gt_prospects_status_check
        CHECK (status IN ('new', 'qualified', 'rejected', 'contacted', 'converted'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Same company twice in one tenant/environment is a dedup target, not a row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_gt_prospects_domain_unique
    ON gt_prospects(tenant_id, is_live, domain_normalized)
    WHERE domain_normalized IS NOT NULL AND is_active;

CREATE INDEX IF NOT EXISTS idx_gt_prospects_tenant   ON gt_prospects(tenant_id, is_live);
CREATE INDEX IF NOT EXISTS idx_gt_prospects_name_key ON gt_prospects(tenant_id, is_live, name_key);
CREATE INDEX IF NOT EXISTS idx_gt_prospects_industry ON gt_prospects(tenant_id, is_live, industry_id);
CREATE INDEX IF NOT EXISTS idx_gt_prospects_load     ON gt_prospects(load_id);
CREATE INDEX IF NOT EXISTS idx_gt_prospects_universe ON gt_prospects(universe_company_id) WHERE universe_company_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_gt_prospects_ref ON gt_prospects(tenant_id, ref) WHERE ref IS NOT NULL;

ALTER TABLE gt_prospects ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY gt_prospects_tenant_isolation ON gt_prospects
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE  gt_prospects IS 'Tenant-owned companies: uploaded, or copied from the common pool at adoption. Tenant- and environment-scoped, RLS on.';
COMMENT ON COLUMN gt_prospects.universe_company_id IS 'Where an adopted row came from. Values are COPIED, not referenced — a pool refresh must never mutate a tenant''s working set mid-campaign.';
COMMENT ON COLUMN gt_prospects.source IS 'upload | universe | byo:<provider> | platform:<provider> — mirrors the gt_contacts convention.';

-- ── People hang off companies ──────────────────────────────────────────
-- gt_contacts (187) is already person-shaped and already carries the
-- connector contract (source / external_ref / raw / score). It needs one
-- nullable FK, not a parallel person model.

ALTER TABLE gt_contacts ADD COLUMN IF NOT EXISTS prospect_id BIGINT;

DO $$ BEGIN
    ALTER TABLE gt_contacts
        ADD CONSTRAINT gt_contacts_prospect_fk
        FOREIGN KEY (prospect_id) REFERENCES gt_prospects(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_gt_contacts_prospect ON gt_contacts(prospect_id) WHERE prospect_id IS NOT NULL;

COMMENT ON COLUMN gt_contacts.prospect_id IS 'The company this person works at, when it is a tracked prospect. company_name/company_domain remain for contacts with no prospect row.';
