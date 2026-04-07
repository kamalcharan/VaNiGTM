-- ============================================================================
-- Migration 020: KI Clients
--
-- Creates the full client layer (converted from contacts or created directly):
--
--   ki_families          — family grouping (UUID-based, replaces iwell_code chain)
--   ki_clients           — full client profile (1:1 with ki_contacts)
--   ki_client_addresses  — multiple addresses per client
--   ki_client_bookmarks  — user-scoped bookmarks per client
--
-- Design:
--   - ki_clients.contact_id FK → ki_contacts (1:1, set on conversion)
--   - ki_clients.client_uid UUID — system-generated, immutable, ProKey internal ID
--   - ki_clients.ext_ref_id — tenant's platform code (KarvyID, IWELL code, etc.)
--   - ki_families.id UUID — shared across all family members
--   - ki_clients.risk_profile — copied from ki_contact_snapshot on conversion, editable after
--
-- RLS: all tables tenant-scoped.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: ki_families (tenant-scoped)
-- UUID-based family grouping. All family members share the same family_id.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_families (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID        NOT NULL,
    is_live         BOOLEAN     NOT NULL DEFAULT false,
    family_name     VARCHAR(255),        -- optional display label (e.g. "The Sharma Family")
    head_client_id  BIGINT,              -- FK to ki_clients.id — set after client is created
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID
);

COMMENT ON TABLE  ki_families              IS 'Family grouping. All family members share family_id on ki_clients.';
COMMENT ON COLUMN ki_families.head_client_id IS 'FK to ki_clients.id of the family head. Nullable — set after client creation.';

CREATE INDEX IF NOT EXISTS idx_ki_families_tenant
    ON ki_families(tenant_id, is_live);


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: ki_clients (tenant-scoped, 1:1 with ki_contacts)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_clients (
    id              BIGSERIAL   PRIMARY KEY,
    contact_id      BIGINT      NOT NULL UNIQUE REFERENCES ki_contacts(id) ON DELETE RESTRICT,
    tenant_id       UUID        NOT NULL,
    is_live         BOOLEAN     NOT NULL DEFAULT false,
    is_active       BOOLEAN     NOT NULL DEFAULT true,

    -- Immutable system ID (ProKey-internal, never shown as raw PK)
    client_uid      UUID        NOT NULL DEFAULT gen_random_uuid() UNIQUE,

    -- Tenant's platform reference code (IWELL code, Karvy ID, etc.)
    -- Type defined by vn_tenants.customer_id_type_code
    ext_ref_id      VARCHAR(100),

    -- Personal details
    pan             VARCHAR(10),
    dob             DATE,
    anniversary_date DATE,

    -- Survival
    survival_status VARCHAR(20) NOT NULL DEFAULT 'alive'
        CHECK (survival_status IN ('alive', 'deceased')),
    date_of_death   DATE,

    -- Family grouping (UUID-based)
    family_id       UUID        REFERENCES ki_families(id) ON DELETE SET NULL,
    is_family_head  BOOLEAN     NOT NULL DEFAULT false,

    -- Investment profile (carried from contact snapshot on conversion, editable)
    risk_profile    VARCHAR(20) CHECK (risk_profile IN ('conservative', 'moderate', 'aggressive')),

    -- Onboarding workflow
    onboarding_status VARCHAR(50) NOT NULL DEFAULT 'pending'
        CHECK (onboarding_status IN ('pending', 'in_progress', 'completed', 'cancelled')),

    -- Referral (free text from import — no FK)
    referred_by_name VARCHAR(255),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID,       -- FK to vn_users.id (not enforced — cross-schema)

    CONSTRAINT ki_clients_death_logic CHECK (
        (survival_status = 'alive'    AND date_of_death IS NULL) OR
        (survival_status = 'deceased' AND date_of_death IS NOT NULL)
    )
);

COMMENT ON TABLE  ki_clients               IS 'Full client profile. 1:1 with ki_contacts (contact_id). Created on contact conversion or direct onboarding.';
COMMENT ON COLUMN ki_clients.client_uid    IS 'Immutable system UUID for ProKey-internal linking. Never expose raw id PK to users.';
COMMENT ON COLUMN ki_clients.ext_ref_id    IS 'Tenant platform code (IWELL, Karvy, CAMS, etc.) — type defined by vn_tenants.customer_id_type_code.';
COMMENT ON COLUMN ki_clients.family_id     IS 'UUID from ki_families. All family members share the same family_id.';
COMMENT ON COLUMN ki_clients.risk_profile  IS 'Copied from ki_contact_snapshot.risk_profile on conversion. Independently editable after.';

CREATE INDEX IF NOT EXISTS idx_ki_clients_tenant_live
    ON ki_clients(tenant_id, is_live) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_ki_clients_ext_ref
    ON ki_clients(tenant_id, is_live, ext_ref_id) WHERE ext_ref_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ki_clients_pan
    ON ki_clients(tenant_id, is_live, pan) WHERE pan IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ki_clients_family
    ON ki_clients(tenant_id, is_live, family_id) WHERE family_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ki_clients_uid
    ON ki_clients(client_uid);


-- ────────────────────────────────────────────────────────────────────────────
-- FK: ki_families.head_client_id → ki_clients.id (deferred — table exists now)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE ki_families
    ADD CONSTRAINT fk_ki_families_head_client
    FOREIGN KEY (head_client_id) REFERENCES ki_clients(id) ON DELETE SET NULL;


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: ki_client_addresses (tenant-scoped, cascade from client)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_client_addresses (
    id              BIGSERIAL   PRIMARY KEY,
    client_id       BIGINT      NOT NULL REFERENCES ki_clients(id) ON DELETE CASCADE,
    tenant_id       UUID        NOT NULL,
    is_live         BOOLEAN     NOT NULL DEFAULT false,
    is_active       BOOLEAN     NOT NULL DEFAULT true,

    address_type    VARCHAR(50) NOT NULL DEFAULT 'residential' CHECK (
        address_type IN ('residential', 'office', 'mailing', 'permanent', 'temporary', 'other')
    ),
    line1           VARCHAR(255) NOT NULL,
    line2           VARCHAR(255),
    city            VARCHAR(100) NOT NULL,
    state           VARCHAR(100) NOT NULL,
    country         VARCHAR(100) NOT NULL DEFAULT 'India',
    pincode         VARCHAR(20)  NOT NULL,
    is_primary      BOOLEAN     NOT NULL DEFAULT false,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_ki_client_address_type UNIQUE (client_id, address_type, is_live)
);

COMMENT ON TABLE ki_client_addresses IS
    'Multiple addresses per client. One primary per type (residential, office, mailing, etc.).';

CREATE INDEX IF NOT EXISTS idx_ki_client_addresses_client
    ON ki_client_addresses(client_id, is_live) WHERE is_active = true;


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: ki_client_bookmarks (tenant-scoped, cascade from client)
-- User-scoped bookmarks — one bookmark per user per client.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_client_bookmarks (
    id              BIGSERIAL   PRIMARY KEY,
    client_id       BIGINT      NOT NULL REFERENCES ki_clients(id) ON DELETE CASCADE,
    tenant_id       UUID        NOT NULL,
    is_live         BOOLEAN     NOT NULL DEFAULT false,
    user_id         UUID        NOT NULL,   -- FK to vn_users.id (not enforced — cross-schema)
    is_active       BOOLEAN     NOT NULL DEFAULT true,

    -- Reason: either from master table OR free text (at least one required)
    reason_id       INTEGER     REFERENCES ki_bookmark_reasons(id) ON DELETE SET NULL,
    custom_reason   VARCHAR(100),
    notes           TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_ki_client_bookmark UNIQUE (tenant_id, is_live, client_id, user_id),
    CONSTRAINT ki_bookmark_reason_required CHECK (
        reason_id IS NOT NULL OR custom_reason IS NOT NULL
    )
);

COMMENT ON TABLE  ki_client_bookmarks          IS 'User-scoped bookmarks per client. One bookmark per user per client.';
COMMENT ON COLUMN ki_client_bookmarks.reason_id IS 'FK to ki_bookmark_reasons (seeded per tenant). Either reason_id OR custom_reason must be set.';

CREATE INDEX IF NOT EXISTS idx_ki_client_bookmarks_client
    ON ki_client_bookmarks(client_id, is_live) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_ki_client_bookmarks_user
    ON ki_client_bookmarks(tenant_id, is_live, user_id) WHERE is_active = true;


-- ────────────────────────────────────────────────────────────────────────────
-- RLS: Enable on all tenant-scoped tables
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE ki_families          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ki_clients           ENABLE ROW LEVEL SECURITY;
ALTER TABLE ki_client_addresses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ki_client_bookmarks  ENABLE ROW LEVEL SECURITY;

CREATE POLICY ki_families_tenant_isolation ON ki_families
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY ki_clients_tenant_isolation ON ki_clients
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY ki_client_addresses_tenant_isolation ON ki_client_addresses
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY ki_client_bookmarks_tenant_isolation ON ki_client_bookmarks
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
