-- ============================================================
-- Migration: 199_gt_tags.sql
-- Purpose:   User-creatable tags on data loads — "FTCCI Telangana",
--            "TFCCI Andhra Pradesh", "Q3 trade show list".
--
-- User ruling (2026-07-28): "1-2-3 will carry tags (ftcci telangana,
-- tfcci andhrapradesh etc — tags can be created)".
--
-- ── WHY THE LOAD AND NOT THE ROW ──────────────────────────────────────
--
-- "FTCCI Telangana" describes a DELIVERY, not a company. Tagging the load
-- writes one row per upload instead of 2,913, and every record inherits
-- through its load_id. Per-record tags remain possible later (a second join
-- table) without redoing any of this.
--
-- ── TAGS DO NOT OVERRIDE DERIVED DATA ─────────────────────────────────
--
-- gt_source_loads already carries `label`, `region`, `state_code` and
-- `default_industry_id`. Those are the load's IDENTITY and are derived or
-- curated: state_code in particular is computed from PIN at ingest, which is
-- far more reliable than any human label (2,840 of FTCCI's 2,913 PINs start
-- '50' = Telangana, while its city column spells the same metro as
-- Hyderabad / Secunderabad / R.R.Dist. / Medchal-Malkajgiri).
--
-- A tag is a human ASSERTION layered on top for grouping and filtering. If a
-- load is tagged "telangana" and its PINs say Karnataka, the PINs win and the
-- tag is a display label. Nothing in the merge, dedup or coverage model reads
-- tags.
--
-- ── SCOPING ───────────────────────────────────────────────────────────
--
-- tenant_id NULL = a PLATFORM tag, visible to every tenant (these are the
-- ones that name common-pool deliveries). tenant_id set = that tenant's own
-- vocabulary, invisible to everyone else — otherwise one tenant's
-- "manufacturing" pollutes every other tenant's tag list.
--
-- Mirrors exactly how gt_source_loads.tenant_id already separates a platform
-- load from a tenant upload.
-- ============================================================

CREATE TABLE IF NOT EXISTS gt_tags (
    id          BIGSERIAL    PRIMARY KEY,

    -- NULL = platform tag (visible to all). Set = private to that tenant.
    tenant_id   UUID         REFERENCES vn_tenants(id) ON DELETE CASCADE,

    label       VARCHAR(80)  NOT NULL,
    slug        TEXT         GENERATED ALWAYS AS (
                    LOWER(BTRIM(REGEXP_REPLACE(
                        REGEXP_REPLACE(label, '[^A-Za-z0-9]+', ' ', 'g'),
                        '\s+', ' ', 'g')))
                ) STORED,

    is_active   BOOLEAN      NOT NULL DEFAULT true,
    created_by  UUID,                        -- vn_users.id (cross-schema, not enforced)
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Uniqueness per namespace. Two partial indexes rather than one constraint,
-- because NULL tenant_id would otherwise never collide with itself.
CREATE UNIQUE INDEX IF NOT EXISTS uq_gt_tags_platform_slug
    ON gt_tags(slug) WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_gt_tags_tenant_slug
    ON gt_tags(tenant_id, slug) WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gt_tags_tenant ON gt_tags(tenant_id) WHERE is_active = true;

COMMENT ON TABLE  gt_tags IS 'User-creatable labels for data loads. tenant_id NULL = platform tag visible to every tenant; set = that tenant''s private vocabulary.';
COMMENT ON COLUMN gt_tags.slug IS 'Normalised label, the uniqueness key. "FTCCI Telangana" and "ftcci  telangana!" are the same tag.';

-- ── The join: many tags per load, many loads per tag ──────────────────

CREATE TABLE IF NOT EXISTS gt_load_tags (
    load_id     BIGINT       NOT NULL REFERENCES gt_source_loads(id) ON DELETE CASCADE,
    tag_id      BIGINT       NOT NULL REFERENCES gt_tags(id) ON DELETE CASCADE,
    created_by  UUID,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (load_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_gt_load_tags_tag ON gt_load_tags(tag_id);

COMMENT ON TABLE gt_load_tags IS 'Tags applied to a data load. Records inherit their load''s tags through load_id — tags are never copied onto rows.';

-- ── RLS ───────────────────────────────────────────────────────────────
-- Platform tags are readable by everyone (the gt_prompts precedent); a
-- tenant's own tags are visible only to them. Dormant at runtime while the
-- app connects as vikuna_admin, live after the vanigtm_app cutover.

ALTER TABLE gt_tags ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY gt_tags_tenant_isolation ON gt_tags
        USING (
            tenant_id IS NULL
            OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- gt_load_tags follows its load: gt_source_loads is cross-tenant
-- infrastructure (193) with RLS disabled by design, so this join table is
-- left unprotected for the same reason and filtered in the application layer.
COMMENT ON TABLE gt_load_tags IS 'Tags applied to a data load. Records inherit their load''s tags through load_id. No RLS — follows gt_source_loads, which is cross-tenant infrastructure (migration 193).';

-- ── updated_at trigger, matching the house pattern ────────────────────

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column')
       AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gt_tags_updated_at') THEN
        CREATE TRIGGER trg_gt_tags_updated_at
            BEFORE UPDATE ON gt_tags
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
