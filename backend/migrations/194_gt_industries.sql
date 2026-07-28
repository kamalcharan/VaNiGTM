-- ============================================================
-- Migration: 194_gt_industries.sql
-- Purpose:   A canonical industry taxonomy, per-source aliases, and the
--            industries a tenant sells to.
--
-- Design notes: documents/design-notes-prospect-universe.md §4.9
--
-- WHY THIS IS A TAXONOMY AND NOT A TEXT COLUMN — measured on the real files:
--
--   FTCCI  BUSINESS         2,825 values / 2,170 distinct / 2,071 singletons
--                           and inconsistent with itself: "Manufacturers"
--                           x213 vs "Manufacturer" x71, "Chartered
--                           Accountants" x39 vs "Chartered Accountant" x28
--   Apollo Company industry   110 values /    35 distinct — a controlled list
--
-- Directory data is prose; provider data is a taxonomy. Matching a tenant's
-- target industries against companies on raw strings would match almost
-- nothing on the directory side.
--
-- gt_tenant_profile.icp_industry (VARCHAR(200), migration 184) STAYS as the
-- agent's drafted prose. The ratified selection lives in
-- gt_tenant_target_industries. One is what VaNi guessed; the other is what
-- the human confirmed, and only the second is joinable.
-- ============================================================

CREATE TABLE IF NOT EXISTS gt_industries (
    id          SERIAL       PRIMARY KEY,
    code        VARCHAR(80)  NOT NULL UNIQUE,   -- 'it_services', 'hospitals'
    name        VARCHAR(160) NOT NULL,
    parent_id   INTEGER      REFERENCES gt_industries(id),
    sort_order  INTEGER      NOT NULL DEFAULT 0,
    is_active   BOOLEAN      NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gt_industries_parent ON gt_industries(parent_id);

COMMENT ON TABLE gt_industries IS 'Canonical industry taxonomy. Cross-tenant reference data — no tenant_id, no RLS.';

-- Now that the taxonomy exists, loads can carry a default industry.
DO $$ BEGIN
    ALTER TABLE gt_source_loads
        ADD CONSTRAINT gt_source_loads_default_industry_fk
        FOREIGN KEY (default_industry_id) REFERENCES gt_industries(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Aliases: every raw string any source ever used ─────────────────────

CREATE TABLE IF NOT EXISTS gt_industry_aliases (
    id           BIGSERIAL   PRIMARY KEY,
    source_id    SMALLINT    REFERENCES gt_data_sources(id),  -- NULL = applies to any source
    raw_value    TEXT        NOT NULL,
    raw_key      TEXT        GENERATED ALWAYS AS (
                     LOWER(REGEXP_REPLACE(REGEXP_REPLACE(raw_value, '[^A-Za-z0-9]+', ' ', 'g'), '^\s+|\s+$', '', 'g'))
                 ) STORED,
    industry_id  INTEGER     NOT NULL REFERENCES gt_industries(id),

    -- How much to trust this mapping, and who made it. With 73% of FTCCI's
    -- industry strings appearing exactly once, most will be mapped by rule
    -- or LLM rather than by hand — and that must be visible, not implied.
    confidence   NUMERIC(4,3) NOT NULL DEFAULT 1.000,
    mapped_by    VARCHAR(10)  NOT NULL DEFAULT 'human',

    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $$ BEGIN
    ALTER TABLE gt_industry_aliases
        ADD CONSTRAINT gt_industry_aliases_mapped_by_check
        CHECK (mapped_by IN ('rule', 'llm', 'human'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_gt_industry_aliases_key
    ON gt_industry_aliases(COALESCE(source_id, 0), raw_key);

COMMENT ON TABLE gt_industry_aliases IS 'Maps a source''s raw industry string to the canonical taxonomy. Unmapped strings are REPORTED, never silently dropped from matching (CLAUDE.md rule 12).';

-- ── What a tenant sells to ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_tenant_target_industries (
    id           BIGSERIAL   PRIMARY KEY,
    tenant_id    UUID        NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    is_live      BOOLEAN     NOT NULL DEFAULT false,
    industry_id  INTEGER     NOT NULL REFERENCES gt_industries(id),

    -- Agent proposes, human ratifies — same contract as gt_tenant_profile
    -- and gt_semantic_clusters.
    source       VARCHAR(10) NOT NULL DEFAULT 'agent',
    approved_at  TIMESTAMPTZ,

    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (tenant_id, is_live, industry_id)
);

DO $$ BEGIN
    ALTER TABLE gt_tenant_target_industries
        ADD CONSTRAINT gt_tenant_target_industries_source_check
        CHECK (source IN ('agent', 'human'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_gt_tenant_target_industries_tenant
    ON gt_tenant_target_industries(tenant_id, is_live);

ALTER TABLE gt_tenant_target_industries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY gt_tenant_target_industries_tenant_isolation
        ON gt_tenant_target_industries
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE gt_tenant_target_industries IS 'The industries a tenant sells to. gt_tenant_profile.icp_industry stays as the agent''s drafted prose; this is the ratified, joinable selection.';
