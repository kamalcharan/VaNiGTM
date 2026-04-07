-- ============================================================================
-- Migration 020: KI Clients — ProKey schema upgrade
--
-- ki_clients already exists from migration 001 with a flat schema
-- (name, email, phone, risk_overall, active, etc.) linked to ki_portfolios,
-- ki_holdings, ki_transactions. We MUST NOT recreate or drop it.
--
-- This migration:
--   1. Creates ki_families   (new table — safe)
--   2. ALTERs ki_clients     — adds new ProKey columns, leaves old ones intact
--   3. Creates ki_client_addresses (new table — safe)
--   4. Creates ki_client_bookmarks (new table — safe)
--   5. Enables RLS on all four tables
--
-- Old columns (name, email, phone, risk_overall, active, etc.) are kept
-- for backward compatibility with ki_portfolios/ki_holdings/ki_transactions.
-- New skill code uses new columns; old portfolio queries use old columns.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: ki_families (new — safe to CREATE)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_families (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID        NOT NULL,
    is_live         BOOLEAN     NOT NULL DEFAULT false,
    family_name     VARCHAR(255),
    head_client_id  INTEGER,    -- FK to ki_clients.id added below after ALTER
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID
);

COMMENT ON TABLE  ki_families              IS 'Family grouping. All family members share family_id on ki_clients.';
COMMENT ON COLUMN ki_families.head_client_id IS 'FK to ki_clients.id of the family head. Nullable.';

CREATE INDEX IF NOT EXISTS idx_ki_families_tenant
    ON ki_families(tenant_id, is_live);


-- ────────────────────────────────────────────────────────────────────────────
-- ALTER TABLE ki_clients — add ProKey columns (idempotent ADD COLUMN IF NOT EXISTS)
-- Existing columns (name, email, phone, risk_overall, active, etc.) are untouched.
-- ────────────────────────────────────────────────────────────────────────────

-- contact link (1:1 with ki_contacts — nullable for existing legacy rows)
ALTER TABLE ki_clients ADD COLUMN IF NOT EXISTS contact_id   BIGINT UNIQUE REFERENCES ki_contacts(id) ON DELETE RESTRICT;

-- environment isolation
ALTER TABLE ki_clients ADD COLUMN IF NOT EXISTS is_live      BOOLEAN NOT NULL DEFAULT false;

-- is_active alongside existing "active" column (new skills use is_active)
ALTER TABLE ki_clients ADD COLUMN IF NOT EXISTS is_active    BOOLEAN NOT NULL DEFAULT true;

-- immutable system UUID (existing rows get a new UUID automatically via DEFAULT)
ALTER TABLE ki_clients ADD COLUMN IF NOT EXISTS client_uid   UUID DEFAULT gen_random_uuid();
-- Backfill NULLs (handles rare edge cases)
UPDATE ki_clients SET client_uid = gen_random_uuid() WHERE client_uid IS NULL;
-- Now enforce NOT NULL
ALTER TABLE ki_clients ALTER COLUMN client_uid SET NOT NULL;
-- Unique index for client_uid
CREATE UNIQUE INDEX IF NOT EXISTS uq_ki_clients_uid ON ki_clients(client_uid);

-- PAN (plain text for search/display — separate from legacy pan_encrypted/pan_last4)
ALTER TABLE ki_clients ADD COLUMN IF NOT EXISTS pan               VARCHAR(10);
CREATE INDEX IF NOT EXISTS idx_ki_clients_pan
    ON ki_clients(tenant_id, is_live, pan) WHERE pan IS NOT NULL;

-- distributor platform reference code
ALTER TABLE ki_clients ADD COLUMN IF NOT EXISTS ext_ref_id        VARCHAR(100);

-- dates (dob already exists — skip; add new ones)
ALTER TABLE ki_clients ADD COLUMN IF NOT EXISTS anniversary_date  DATE;

-- survival tracking
ALTER TABLE ki_clients ADD COLUMN IF NOT EXISTS survival_status   VARCHAR(20) NOT NULL DEFAULT 'alive'
    CHECK (survival_status IN ('alive', 'deceased'));
ALTER TABLE ki_clients ADD COLUMN IF NOT EXISTS date_of_death     DATE;

-- family grouping (UUID-based, replaces old integer family_group_id)
ALTER TABLE ki_clients ADD COLUMN IF NOT EXISTS family_id         UUID REFERENCES ki_families(id) ON DELETE SET NULL;
ALTER TABLE ki_clients ADD COLUMN IF NOT EXISTS is_family_head    BOOLEAN NOT NULL DEFAULT false;

-- slim risk profile (replaces multi-column risk_capacity/risk_tolerance/risk_required/risk_overall)
ALTER TABLE ki_clients ADD COLUMN IF NOT EXISTS risk_profile      VARCHAR(20)
    CHECK (risk_profile IN ('conservative', 'moderate', 'aggressive'));

-- onboarding workflow
ALTER TABLE ki_clients ADD COLUMN IF NOT EXISTS onboarding_status VARCHAR(50) NOT NULL DEFAULT 'pending'
    CHECK (onboarding_status IN ('pending', 'in_progress', 'completed', 'cancelled'));

-- referral (free text from import)
ALTER TABLE ki_clients ADD COLUMN IF NOT EXISTS referred_by_name  VARCHAR(255);

-- audit
ALTER TABLE ki_clients ADD COLUMN IF NOT EXISTS created_by        UUID;

-- death logic constraint (add only if not already present)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'ki_clients' AND constraint_name = 'ki_clients_death_logic'
    ) THEN
        ALTER TABLE ki_clients ADD CONSTRAINT ki_clients_death_logic CHECK (
            (survival_status = 'alive'    AND date_of_death IS NULL) OR
            (survival_status = 'deceased' AND date_of_death IS NOT NULL)
        );
    END IF;
END $$;

-- New indexes for ProKey queries
CREATE INDEX IF NOT EXISTS idx_ki_clients_tenant_live
    ON ki_clients(tenant_id, is_live) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_ki_clients_ext_ref
    ON ki_clients(tenant_id, is_live, ext_ref_id) WHERE ext_ref_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ki_clients_family_id
    ON ki_clients(tenant_id, is_live, family_id) WHERE family_id IS NOT NULL;

COMMENT ON COLUMN ki_clients.client_uid    IS 'Immutable system UUID for ProKey-internal linking. Never expose raw id PK to users.';
COMMENT ON COLUMN ki_clients.ext_ref_id    IS 'Tenant platform code (IWELL, Karvy, CAMS, etc.) — type from vn_tenants.customer_id_type_code.';
COMMENT ON COLUMN ki_clients.family_id     IS 'UUID from ki_families. All family members share the same family_id.';
COMMENT ON COLUMN ki_clients.risk_profile  IS 'Slim risk profile (conservative/moderate/aggressive). Carried from contact snapshot on conversion.';
COMMENT ON COLUMN ki_clients.is_live       IS 'Environment isolation — false=sandbox, true=live.';
COMMENT ON COLUMN ki_clients.contact_id    IS '1:1 with ki_contacts. Nullable for legacy rows not created via contact conversion.';


-- ────────────────────────────────────────────────────────────────────────────
-- FK: ki_families.head_client_id → ki_clients.id
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE ki_families
    ADD CONSTRAINT fk_ki_families_head_client
    FOREIGN KEY (head_client_id) REFERENCES ki_clients(id) ON DELETE SET NULL;


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: ki_client_addresses (new — safe to CREATE)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_client_addresses (
    id              BIGSERIAL    PRIMARY KEY,
    client_id       INTEGER      NOT NULL REFERENCES ki_clients(id) ON DELETE CASCADE,
    tenant_id       UUID         NOT NULL,
    is_live         BOOLEAN      NOT NULL DEFAULT false,
    is_active       BOOLEAN      NOT NULL DEFAULT true,

    address_type    VARCHAR(50)  NOT NULL DEFAULT 'residential' CHECK (
        address_type IN ('residential', 'office', 'mailing', 'permanent', 'temporary', 'other')
    ),
    line1           VARCHAR(255) NOT NULL,
    line2           VARCHAR(255),
    city            VARCHAR(100) NOT NULL,
    state           VARCHAR(100) NOT NULL,
    country         VARCHAR(100) NOT NULL DEFAULT 'India',
    pincode         VARCHAR(20)  NOT NULL,
    is_primary      BOOLEAN      NOT NULL DEFAULT false,

    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT uq_ki_client_address_type UNIQUE (client_id, address_type, is_live)
);

COMMENT ON TABLE ki_client_addresses IS
    'Multiple addresses per client. One per type (residential, office, mailing, etc.) per environment.';

CREATE INDEX IF NOT EXISTS idx_ki_client_addresses_client
    ON ki_client_addresses(client_id, is_live) WHERE is_active = true;


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: ki_client_bookmarks (new — safe to CREATE)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_client_bookmarks (
    id              BIGSERIAL    PRIMARY KEY,
    client_id       INTEGER      NOT NULL REFERENCES ki_clients(id) ON DELETE CASCADE,
    tenant_id       UUID         NOT NULL,
    is_live         BOOLEAN      NOT NULL DEFAULT false,
    user_id         UUID         NOT NULL,
    is_active       BOOLEAN      NOT NULL DEFAULT true,

    reason_id       INTEGER      REFERENCES ki_bookmark_reasons(id) ON DELETE SET NULL,
    custom_reason   VARCHAR(100),
    notes           TEXT,

    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT uq_ki_client_bookmark UNIQUE (tenant_id, is_live, client_id, user_id),
    CONSTRAINT ki_bookmark_reason_required CHECK (
        reason_id IS NOT NULL OR custom_reason IS NOT NULL
    )
);

COMMENT ON TABLE  ki_client_bookmarks          IS 'User-scoped bookmarks per client. One bookmark per user per client.';
COMMENT ON COLUMN ki_client_bookmarks.reason_id IS 'FK to ki_bookmark_reasons. Either reason_id OR custom_reason must be set.';

CREATE INDEX IF NOT EXISTS idx_ki_client_bookmarks_client
    ON ki_client_bookmarks(client_id, is_live) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_ki_client_bookmarks_user
    ON ki_client_bookmarks(tenant_id, is_live, user_id) WHERE is_active = true;


-- ────────────────────────────────────────────────────────────────────────────
-- RLS: Enable on all four tables
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE ki_families          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ki_clients           ENABLE ROW LEVEL SECURITY;
ALTER TABLE ki_client_addresses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ki_client_bookmarks  ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies to make this migration idempotent
DO $$ BEGIN
    DROP POLICY IF EXISTS ki_families_tenant_isolation     ON ki_families;
    DROP POLICY IF EXISTS ki_clients_tenant_isolation      ON ki_clients;
    DROP POLICY IF EXISTS ki_client_addresses_tenant_isolation ON ki_client_addresses;
    DROP POLICY IF EXISTS ki_client_bookmarks_tenant_isolation ON ki_client_bookmarks;
END $$;

CREATE POLICY ki_families_tenant_isolation ON ki_families
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY ki_clients_tenant_isolation ON ki_clients
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY ki_client_addresses_tenant_isolation ON ki_client_addresses
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY ki_client_bookmarks_tenant_isolation ON ki_client_bookmarks
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
