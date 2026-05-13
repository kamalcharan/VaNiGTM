-- ============================================================================
-- Migration 184: Vikuna GTM — Tenant Profile (Phase 2 Stage 1)
--
-- Structured profile blob extracted by the VaNi agent (and edited by humans).
-- Lives alongside gt_tenant_context.profile (free-form JSONB) — this table
-- holds the typed, queryable view used by ICP / Storyteller / Lead Finder
-- downstream agents.
--
--   gt_tenant_profile         — one row per tenant, structured fields
--   gt_tenant_profile_history — append-only snapshots, one per save/version
--
-- All tenant-scoped tables get RLS (pattern from 181). Application code ALSO
-- filters by tenant_id in every query (belt + suspenders).
--
-- Postgres 17.9 — GENERATED ALWAYS AS (...) STORED is available.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: gt_tenant_profile  (structured profile — one row per tenant)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_tenant_profile (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID         UNIQUE NOT NULL
                        REFERENCES vn_tenants(id) ON DELETE CASCADE,

    -- ── PRODUCT ──────────────────────────────────────────────────────────
    product_name        VARCHAR(200),
    product_tagline     VARCHAR(300),
    product_category    VARCHAR(100),
    product_description TEXT,
    core_problem        TEXT,
    key_differentiators TEXT[],
    pricing_model       VARCHAR(50),
    pricing_range       VARCHAR(100),

    -- ── ICP ──────────────────────────────────────────────────────────────
    icp_role            VARCHAR(200),
    icp_company_type    VARCHAR(200),
    icp_company_size    VARCHAR(100),
    icp_industry        VARCHAR(200),
    icp_geography       VARCHAR(200),
    primary_pain_points TEXT[],

    -- ── GTM ──────────────────────────────────────────────────────────────
    gtm_stage           VARCHAR(50),
    active_channels     TEXT[],
    current_mrr         VARCHAR(50),
    team_size           INTEGER,

    -- ── VISION ───────────────────────────────────────────────────────────
    vision_statement    TEXT,
    target_market_size  VARCHAR(100),

    -- ── METADATA ─────────────────────────────────────────────────────────
    completion_score    INTEGER      NOT NULL DEFAULT 0,
    completion_detail   JSONB        NOT NULL DEFAULT '{}'::jsonb,
    is_complete         BOOLEAN
        GENERATED ALWAYS AS (completion_score >= 60) STORED,
    source              VARCHAR(20)  NOT NULL DEFAULT 'vani',
    version             INTEGER      NOT NULL DEFAULT 1,
    approved_at         TIMESTAMPTZ,
    approved_by         UUID,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  gt_tenant_profile                  IS 'Structured tenant profile — typed view extracted by VaNi agent, edited by humans.';
COMMENT ON COLUMN gt_tenant_profile.completion_score IS '0–100 weighted by completeness of product / ICP / GTM / vision sections.';
COMMENT ON COLUMN gt_tenant_profile.is_complete      IS 'Generated: completion_score >= 60.';
COMMENT ON COLUMN gt_tenant_profile.source           IS 'Origin of latest write: vani | human | import.';

-- UNIQUE(tenant_id) already creates a B-tree index — no explicit (tenant_id)
-- index needed. Composite index below covers is_complete filter queries.
CREATE INDEX IF NOT EXISTS idx_gt_tenant_profile_tenant_complete
    ON gt_tenant_profile (tenant_id, is_complete);


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: gt_tenant_profile_history  (immutable snapshots, append-only)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_tenant_profile_history (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID         NOT NULL
                REFERENCES vn_tenants(id) ON DELETE CASCADE,
    version     INTEGER      NOT NULL,
    snapshot    JSONB        NOT NULL,
    changed_by  VARCHAR(80),
    change_note TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  gt_tenant_profile_history IS 'Append-only history of gt_tenant_profile. One row per version bump. Rows are immutable — no updated_at, no update trigger.';

CREATE INDEX IF NOT EXISTS idx_gt_tenant_profile_history_tenant_version
    ON gt_tenant_profile_history (tenant_id, version DESC);


-- ────────────────────────────────────────────────────────────────────────────
-- RLS  (pattern from migration 181)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE gt_tenant_profile         ENABLE ROW LEVEL SECURITY;
ALTER TABLE gt_tenant_profile_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gt_tenant_profile_tenant_isolation         ON gt_tenant_profile;
DROP POLICY IF EXISTS gt_tenant_profile_history_tenant_isolation ON gt_tenant_profile_history;

CREATE POLICY gt_tenant_profile_tenant_isolation ON gt_tenant_profile
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY gt_tenant_profile_history_tenant_isolation ON gt_tenant_profile_history
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);


-- ────────────────────────────────────────────────────────────────────────────
-- Updated-at trigger — gt_tenant_profile only.
-- gt_tenant_profile_history rows are immutable; no update trigger.
-- (vn_set_updated_at() is defined in 001_vn_foundation.sql)
-- ────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_gt_tenant_profile_updated_at ON gt_tenant_profile;
CREATE TRIGGER trg_gt_tenant_profile_updated_at
    BEFORE UPDATE ON gt_tenant_profile
    FOR EACH ROW EXECUTE FUNCTION vn_set_updated_at();
