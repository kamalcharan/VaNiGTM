-- ============================================================================
-- Migration 019: KI Contacts
--
-- Creates the prospect/contact layer for the MFD's client pipeline:
--
--   ki_customer_id_types  — global master: IWELL_CODE, KARVY_CODE, etc.
--   ki_contacts           — identity layer (name, prefix, normalized_name)
--   ki_contact_channels   — communication channels per contact
--   ki_contact_snapshot   — skimmed financial planning for prospects
--
-- Design:
--   - ki_contacts.is_client = false for prospects, true once converted
--   - ki_contact_snapshot is optional (MFD captures before pitching)
--   - Conversion to client happens in migration 020's ki_clients table
--
-- RLS: ki_contacts, ki_contact_channels, ki_contact_snapshot all tenant-scoped.
-- ki_customer_id_types is global (no tenant_id — shared reference data).
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: ki_customer_id_types (global master — no tenant_id)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_customer_id_types (
    id          SERIAL      PRIMARY KEY,
    code        VARCHAR(50) UNIQUE NOT NULL,
    label       VARCHAR(100) NOT NULL,
    description TEXT,
    is_active   BOOLEAN     NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ki_customer_id_types IS
    'Global master: unique client reference types used by tenants (IWELL, Karvy, CAMS, etc.)';

-- Seed: common distributor platform codes
INSERT INTO ki_customer_id_types (code, label, description) VALUES
    ('IWELL_CODE',   'IWELL Code',       'InvestWell platform client reference code'),
    ('KARVY_CODE',   'Karvy Code',        'Karvy (KFintech) client reference code'),
    ('CAMS_CODE',    'CAMS Code',         'CAMS (Computer Age Management Services) client code'),
    ('MOTILAL_CODE', 'Motilal Code',      'Motilal Oswal platform client reference code'),
    ('ANGEL_CODE',   'Angel One Code',    'Angel One platform client reference code'),
    ('ZERODHA_CODE', 'Zerodha Code',      'Zerodha Coin platform client reference code'),
    ('CUSTOM_ID',    'Custom ID',         'Tenant-defined unique client identifier')
ON CONFLICT (code) DO NOTHING;


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: ki_contacts (tenant-scoped)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_contacts (
    id              BIGSERIAL   PRIMARY KEY,
    tenant_id       UUID        NOT NULL,
    is_live         BOOLEAN     NOT NULL DEFAULT false,
    is_active       BOOLEAN     NOT NULL DEFAULT true,
    is_client       BOOLEAN     NOT NULL DEFAULT false,   -- true once converted to ki_clients

    prefix          VARCHAR(10) NOT NULL CHECK (prefix IN ('Mr', 'Mrs', 'Ms', 'Dr', 'Prof', 'Sri', 'Smt')),
    name            VARCHAR(255) NOT NULL,
    normalized_name TEXT GENERATED ALWAYS AS (
        UPPER(
            REGEXP_REPLACE(
                REGEXP_REPLACE(
                    REGEXP_REPLACE(
                        REGEXP_REPLACE(name,
                            '^(MR|MRS|MS|DR|PROF|SRI|SMT)\.?\s+', '', 'i'),
                        '[^A-Z0-9\s]', '', 'g'),
                    '\s+', ' ', 'g'),
                '^\s+|\s+$', '', 'g')
        )
    ) STORED,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID        -- FK to vn_users.id (not enforced — cross-schema)
);

COMMENT ON TABLE  ki_contacts             IS 'Prospect/contact identity layer. is_client=true once converted to ki_clients.';
COMMENT ON COLUMN ki_contacts.is_client   IS 'Set to true when a ki_clients record is created for this contact.';
COMMENT ON COLUMN ki_contacts.normalized_name IS 'Auto-computed: uppercase, strip title/punctuation — used for fuzzy duplicate detection.';

CREATE INDEX IF NOT EXISTS idx_ki_contacts_tenant_live
    ON ki_contacts(tenant_id, is_live) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_ki_contacts_normalized
    ON ki_contacts(tenant_id, is_live, normalized_name) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_ki_contacts_is_client
    ON ki_contacts(tenant_id, is_live, is_client) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_ki_contacts_name_search
    ON ki_contacts USING gin(to_tsvector('english', name));


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: ki_contact_channels (tenant-scoped, cascade from contact)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_contact_channels (
    id              BIGSERIAL   PRIMARY KEY,
    contact_id      BIGINT      NOT NULL REFERENCES ki_contacts(id) ON DELETE CASCADE,
    tenant_id       UUID        NOT NULL,
    is_live         BOOLEAN     NOT NULL DEFAULT false,
    is_active       BOOLEAN     NOT NULL DEFAULT true,

    channel_type    VARCHAR(50) NOT NULL CHECK (
        channel_type IN ('email', 'mobile', 'whatsapp', 'instagram', 'twitter', 'linkedin', 'other')
    ),
    channel_value   VARCHAR(255) NOT NULL,
    channel_subtype VARCHAR(50) NOT NULL DEFAULT 'personal' CHECK (
        channel_subtype IN ('personal', 'work', 'other')
    ),
    is_primary      BOOLEAN     NOT NULL DEFAULT false,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_ki_contact_channel UNIQUE (contact_id, channel_type, channel_value, is_live)
);

COMMENT ON TABLE ki_contact_channels IS
    'Communication channels per contact: email, mobile, whatsapp, social media.';

CREATE INDEX IF NOT EXISTS idx_ki_contact_channels_contact
    ON ki_contact_channels(contact_id, is_live) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_ki_contact_channels_tenant
    ON ki_contact_channels(tenant_id, is_live) WHERE is_active = true;

-- Partial index: enforce only one primary per contact per channel_type
CREATE UNIQUE INDEX IF NOT EXISTS uq_ki_contact_primary_channel
    ON ki_contact_channels(contact_id, channel_type, is_live)
    WHERE is_primary = true AND is_active = true;


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: ki_contact_snapshot (tenant-scoped, 1:1 with contact)
-- Skimmed financial planning — captured before contact becomes a client.
-- On conversion to client, goals_lite seeds ki_goals, risk_profile carries forward.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_contact_snapshot (
    id                          BIGSERIAL   PRIMARY KEY,
    contact_id                  BIGINT      NOT NULL UNIQUE REFERENCES ki_contacts(id) ON DELETE CASCADE,
    tenant_id                   UUID        NOT NULL,
    is_live                     BOOLEAN     NOT NULL DEFAULT false,

    -- Investment temperament
    risk_profile                VARCHAR(20) CHECK (risk_profile IN ('conservative', 'moderate', 'aggressive')),

    -- Rough financial size
    net_worth_estimate          NUMERIC(15, 2),          -- total assets - liabilities (₹)
    annual_income_estimate      NUMERIC(15, 2),          -- gross annual income (₹)
    investment_horizon_years    INTEGER,                 -- how many years they plan to invest

    -- Existing MF portfolio (rough breakdown — NOT linked to ki_holdings)
    existing_mf_breakdown       JSONB,
    -- Shape: { "equity": 500000, "debt": 200000, "hybrid": 100000, "total": 800000 }

    -- Aspirational goals (NOT linked to ki_goals — seeds them on conversion)
    goals_lite                  JSONB,
    -- Shape: [{ "name": "Retirement", "target_amount": 10000000, "timeline_years": 20 }]

    -- MFD free-form notes about this prospect
    notes                       TEXT,

    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  ki_contact_snapshot                    IS '1:1 with ki_contacts. Skimmed financial profile captured before client conversion.';
COMMENT ON COLUMN ki_contact_snapshot.existing_mf_breakdown IS 'Rough MF breakdown: {equity, debt, hybrid, total}. Manual entry — NOT linked to holdings.';
COMMENT ON COLUMN ki_contact_snapshot.goals_lite         IS 'Aspirational goals array. On client conversion, seeds ki_goals rows.';
COMMENT ON COLUMN ki_contact_snapshot.risk_profile       IS 'Investment temperament. Carries forward to ki_clients.risk_profile on conversion.';

CREATE INDEX IF NOT EXISTS idx_ki_snapshot_tenant
    ON ki_contact_snapshot(tenant_id, is_live);


-- ────────────────────────────────────────────────────────────────────────────
-- RLS: Enable on all tenant-scoped tables
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE ki_contacts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ki_contact_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE ki_contact_snapshot ENABLE ROW LEVEL SECURITY;

-- ki_contacts
CREATE POLICY ki_contacts_tenant_isolation ON ki_contacts
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ki_contact_channels
CREATE POLICY ki_contact_channels_tenant_isolation ON ki_contact_channels
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ki_contact_snapshot
CREATE POLICY ki_contact_snapshot_tenant_isolation ON ki_contact_snapshot
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
