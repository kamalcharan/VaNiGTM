-- ============================================================
-- Migration: 193_gt_data_sources.sql
-- Purpose:   Where prospect data comes from — publishers and the
--            individual datasets they deliver.
--
-- Design notes: documents/design-notes-prospect-universe.md §4.1, §4.1a
--
-- A source is a PUBLISHER (FTCCI, Apollo, a tenant's own upload).
-- A load is ONE DATASET from that publisher: "FTCCI Hyderabad Oct 2023",
-- "Telangana Hospital Groups", "acme-prospects.csv uploaded by tenant X".
--
-- Splitting them buys three things a source-only model cannot:
--   1. Rollback — retire a bad load, not a publisher's whole history.
--   2. Free industry — every row of a vertical directory shares an
--      industry, so default_industry_id classifies thousands of rows with
--      no per-row mapping.
--   3. Trust per dataset — a specialist hospital directory's record of a
--      hospital should outrank a general chamber's, so tier_override.
--
-- NOT tenant-scoped: this is cross-tenant infrastructure, like gt_prompts.
-- Tenant uploads reference their own load via ki_import_sessions.load_id
-- (migration 197) and land in tenant-scoped tables.
-- ============================================================

CREATE TABLE IF NOT EXISTS gt_data_sources (
    id              SMALLSERIAL  PRIMARY KEY,
    code            VARCHAR(40)  NOT NULL UNIQUE,   -- 'ftcci' | 'apollo' | 'upload'
    name            VARCHAR(120) NOT NULL,
    kind            VARCHAR(20)  NOT NULL DEFAULT 'directory',

    -- Trust weight used by the field-level merge. In a table, not in code:
    -- re-tuning trust must be an UPDATE plus a re-merge, never a deploy.
    tier            SMALLINT     NOT NULL DEFAULT 50,

    default_as_of   DATE,
    is_active       BOOLEAN      NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $$ BEGIN
    ALTER TABLE gt_data_sources
        ADD CONSTRAINT gt_data_sources_kind_check
        CHECK (kind IN ('directory', 'provider', 'upload'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE  gt_data_sources IS 'Publishers of prospect data. Cross-tenant infrastructure — no tenant_id, no RLS (see gt_prompts precedent).';
COMMENT ON COLUMN gt_data_sources.tier IS 'Merge trust weight 0-100. Configurable so trust can be re-tuned and the golden records re-merged without a deploy.';

-- ── Loads: one row per dataset actually delivered ──────────────────────

CREATE TABLE IF NOT EXISTS gt_source_loads (
    id                  BIGSERIAL    PRIMARY KEY,
    source_id           SMALLINT     NOT NULL REFERENCES gt_data_sources(id),

    label               VARCHAR(160) NOT NULL,      -- 'FTCCI Hyderabad'
    region              VARCHAR(120),               -- free text, human-facing
    state_code          VARCHAR(8),                 -- normalised, filterable

    -- Freshness lives here, not on the publisher: FTCCI Hyderabad 2023 and
    -- FTCCI Warangal 2026 are the same publisher and very different data.
    as_of               DATE,

    -- Vertical directories classify themselves: every row of "hospital
    -- groups of Telangana" is healthcare. Applied at LOWER confidence than
    -- a per-row industry, so a provider that states one still wins.
    default_industry_id INTEGER,                    -- FK added in 194

    -- A specialist directory can outrank its publisher's default tier.
    tier_override       SMALLINT,

    -- Tenant uploads are loads too. NULL = platform/common-pool load.
    tenant_id           UUID         REFERENCES vn_tenants(id) ON DELETE CASCADE,

    file_checksum       VARCHAR(64),                -- sha256; re-upload detection
    row_count           INTEGER,
    status              VARCHAR(20)  NOT NULL DEFAULT 'active',

    loaded_by           UUID,                       -- vn_users.id (cross-schema, not enforced)
    loaded_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $$ BEGIN
    ALTER TABLE gt_source_loads
        ADD CONSTRAINT gt_source_loads_status_check
        CHECK (status IN ('active', 'retired', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_gt_source_loads_source ON gt_source_loads(source_id);
CREATE INDEX IF NOT EXISTS idx_gt_source_loads_tenant ON gt_source_loads(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gt_source_loads_state  ON gt_source_loads(state_code) WHERE state_code IS NOT NULL;

COMMENT ON TABLE  gt_source_loads IS 'One row per dataset delivered. Rollback unit, freshness unit, and the carrier of a vertical dataset''s default industry.';
COMMENT ON COLUMN gt_source_loads.tenant_id IS 'NULL = platform/common-pool load (admin upload). Set = a tenant''s own upload.';
COMMENT ON COLUMN gt_source_loads.status IS 'retired = superseded or withdrawn; its rows stop contributing to merges without being deleted.';

-- ── Seed the three sources we know about ───────────────────────────────

INSERT INTO gt_data_sources (code, name, kind, tier, default_as_of)
VALUES
    ('upload', 'Tenant upload',              'upload',    40, NULL),
    ('ftcci',  'FTCCI member directory',     'directory', 55, DATE '2023-10-26'),
    ('apollo', 'Apollo',                     'provider',  80, NULL)
ON CONFLICT (code) DO NOTHING;
