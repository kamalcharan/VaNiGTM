-- ============================================================================
-- Migration 060: KI Campaigns & ICP (Go-To-Market)
--
-- Creates the GTM campaign and ICP (Ideal Customer Profile) layer:
--
--   gt_campaigns          — mission/campaign definitions with status lifecycle
--   gt_personas           — ICP persona definitions per campaign
--   gt_persona_signals    — buying signals / qualification criteria per persona
--
-- Design:
--   - A campaign is a GTM mission targeting a specific product/market
--   - Each campaign has one or more ICP personas (target buyer profiles)
--   - Personas carry industry, company size, title, and buying signals
--   - Status lifecycle: draft → active → paused → completed → archived
--   - Contacts are assigned to campaigns in a future migration (Phase 2)
--
-- RLS: All tables are tenant-scoped.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: gt_campaigns (tenant-scoped)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_campaigns (
    id              BIGSERIAL   PRIMARY KEY,
    tenant_id       UUID        NOT NULL,
    is_live         BOOLEAN     NOT NULL DEFAULT false,
    is_active       BOOLEAN     NOT NULL DEFAULT true,

    -- Identity
    campaign_no     TEXT        NOT NULL,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,

    -- Product context
    product_name    VARCHAR(255),
    product_url     VARCHAR(500),

    -- Targeting
    target_industries JSONB     NOT NULL DEFAULT '[]'::jsonb,
    -- Shape: ["Financial Services", "Insurance", "Wealth Management"]

    -- Outreach sender defaults
    sender_name     VARCHAR(255),
    sender_email    VARCHAR(255),

    -- Lifecycle
    status          VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (
        status IN ('draft', 'active', 'paused', 'completed', 'archived')
    ),
    launched_at     TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,

    -- Audit
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID        -- FK to vn_users.id (not enforced — cross-schema)
);

COMMENT ON TABLE  gt_campaigns             IS 'GTM campaign/mission definitions. Each campaign targets a product + market with ICP personas.';
COMMENT ON COLUMN gt_campaigns.campaign_no IS 'Tenant-scoped sequence number (e.g. GTM-001).';
COMMENT ON COLUMN gt_campaigns.status      IS 'Lifecycle: draft → active → paused → completed → archived.';
COMMENT ON COLUMN gt_campaigns.target_industries IS 'JSON array of industry names this campaign targets.';

CREATE INDEX IF NOT EXISTS idx_gt_campaigns_tenant_live
    ON gt_campaigns(tenant_id, is_live) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_gt_campaigns_status
    ON gt_campaigns(tenant_id, is_live, status) WHERE is_active = true;


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: gt_personas (tenant-scoped, belongs to campaign)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_personas (
    id              BIGSERIAL   PRIMARY KEY,
    campaign_id     BIGINT      NOT NULL REFERENCES gt_campaigns(id) ON DELETE CASCADE,
    tenant_id       UUID        NOT NULL,
    is_live         BOOLEAN     NOT NULL DEFAULT false,
    is_active       BOOLEAN     NOT NULL DEFAULT true,

    -- Persona identity
    title           VARCHAR(255) NOT NULL,
    -- e.g. "VP of Sales", "Marketing Director", "CTO"
    emoji           VARCHAR(10) DEFAULT '👤',
    description     TEXT,

    -- Qualification tags
    tags            JSONB       NOT NULL DEFAULT '[]'::jsonb,
    -- Shape: ["Budget holder", "Tech-savvy", "Decision maker"]

    -- Company targeting
    company_size_min  INTEGER,
    company_size_max  INTEGER,
    seniority_level   VARCHAR(50) CHECK (
        seniority_level IS NULL OR seniority_level IN (
            'c-suite', 'vp', 'director', 'manager', 'individual-contributor'
        )
    ),

    -- Ordering
    sort_order      INTEGER     NOT NULL DEFAULT 0,

    -- Audit
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  gt_personas           IS 'ICP persona definitions. Each campaign has one or more target buyer personas.';
COMMENT ON COLUMN gt_personas.title     IS 'Job title or role name (e.g. VP of Sales).';
COMMENT ON COLUMN gt_personas.tags      IS 'JSON array of qualification labels (e.g. Budget holder, Decision maker).';

CREATE INDEX IF NOT EXISTS idx_gt_personas_campaign
    ON gt_personas(campaign_id, is_live) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_gt_personas_tenant
    ON gt_personas(tenant_id, is_live) WHERE is_active = true;


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: gt_persona_signals (tenant-scoped, belongs to persona)
-- Buying signals / qualification criteria that indicate a prospect matches
-- this persona. Used for contact scoring in Phase 2.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_persona_signals (
    id              BIGSERIAL   PRIMARY KEY,
    persona_id      BIGINT      NOT NULL REFERENCES gt_personas(id) ON DELETE CASCADE,
    tenant_id       UUID        NOT NULL,
    is_live         BOOLEAN     NOT NULL DEFAULT false,

    signal_type     VARCHAR(50) NOT NULL CHECK (
        signal_type IN ('behavior', 'firmographic', 'technographic', 'intent')
    ),
    label           VARCHAR(255) NOT NULL,
    description     TEXT,
    weight          INTEGER     NOT NULL DEFAULT 1 CHECK (weight BETWEEN 1 AND 10),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  gt_persona_signals           IS 'Buying signals per persona. Used for prospect scoring.';
COMMENT ON COLUMN gt_persona_signals.signal_type IS 'Category: behavior, firmographic, technographic, intent.';
COMMENT ON COLUMN gt_persona_signals.weight      IS 'Signal strength 1-10. Higher = stronger qualification indicator.';

CREATE INDEX IF NOT EXISTS idx_gt_persona_signals_persona
    ON gt_persona_signals(persona_id, is_live);


-- ────────────────────────────────────────────────────────────────────────────
-- RLS: Enable on all tenant-scoped tables
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE gt_campaigns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE gt_personas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE gt_persona_signals ENABLE ROW LEVEL SECURITY;

-- gt_campaigns
CREATE POLICY gt_campaigns_tenant_isolation ON gt_campaigns
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- gt_personas
CREATE POLICY gt_personas_tenant_isolation ON gt_personas
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- gt_persona_signals
CREATE POLICY gt_persona_signals_tenant_isolation ON gt_persona_signals
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);


-- ────────────────────────────────────────────────────────────────────────────
-- SEED: campaign sequence for existing tenants
-- New tenants get this via seed-tenant.service.ts on signup.
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO ki_sequences (tenant_id, sequence_type, prefix, last_value, pad_width)
SELECT t.id, 'campaign', 'GTM', 0, 4
FROM vn_tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM ki_sequences s
    WHERE s.tenant_id = t.id AND s.sequence_type = 'campaign'
);
