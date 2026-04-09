-- ============================================================================
-- Migration 021: KI Snapshot System
--
-- Replaces the flat ki_contact_snapshot with a fully versioned snapshot
-- system. Supports 3 intake flows:
--   Flow 1 — Known contact: MFD sends signed link → client fills wizard
--   Flow 2 — Cold lead: public URL → lead capture + wizard
--   Flow 3 — MFD fills internally (authenticated, in-app)
--
-- Tables created:
--
--   GLOBAL MASTER (no tenant_id — shared reference):
--     ki_asset_types          — Real Estate, Gold, FD, Stocks, etc.
--     ki_liability_types      — Home Loan, Car Loan, Personal Loan, etc.
--
--   INTAKE TOKENS:
--     ki_intake_tokens        — signed links for Flows 1 & 2 (5-day expiry)
--
--   VERSIONED SNAPSHOT (tenant-scoped, RLS):
--     ki_contact_snapshots    — header: version, status, who filled it
--     ki_snapshot_income      — 3 income sources per snapshot
--     ki_snapshot_expenses    — 6 expense categories per snapshot
--     ki_snapshot_assets      — N assets, linked to ki_asset_types
--     ki_snapshot_liabilities — N liabilities, linked to ki_liability_types
--     ki_snapshot_protection  — 1 row per snapshot (insurance coverage)
--     ki_snapshot_goals       — N aspirational goals (replaces goals_lite JSONB)
--
-- Design notes:
--   - ki_contact_snapshot (migration 019) is kept intact — existing data
--     preserved. New code uses ki_contact_snapshots (plural). Old table
--     deprecated and will be dropped in a future migration after data migration.
--   - Only ONE snapshot per contact has status = 'active' at a time.
--     On new submission: old active → 'archived', new → 'active'.
--   - version_number is tenant-scoped sequential per contact (not global PK).
--   - On convert_to_client: ki_snapshot_goals seeds ki_goals rows.
--   - Benchmark Pulse metrics (DTI, savings rate, etc.) computed live
--     via SQL window functions over the tenant's snapshot data.
--
-- RLS: All tenant-scoped tables use app.current_tenant_id setting.
-- ki_asset_types and ki_liability_types are global — no RLS.
-- ============================================================================


-- ============================================================================
-- SECTION 1: GLOBAL MASTER TABLES
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: ki_asset_types (global — no tenant_id)
-- Reference list of asset categories. is_liquid_default drives the
-- liquidity flag pre-fill in the intake wizard.
-- ────────────────────────────────────────────────────────────────────────────

-- ki_asset_types: migration 017 (ki_master_data) may have already created this table
-- with columns: asset_type_code, asset_type_name, display_order, is_active, description
-- CREATE TABLE IF NOT EXISTS is a no-op if 017 ran first.
-- We add the snapshot-specific columns (is_liquid_default, sort_order) if missing,
-- then insert using the 017 column names so it works regardless of which migration ran first.

CREATE TABLE IF NOT EXISTS ki_asset_types (
    id                  SERIAL       PRIMARY KEY,
    asset_type_code     VARCHAR(50)  UNIQUE NOT NULL,
    asset_type_name     VARCHAR(100) NOT NULL,
    description         TEXT,
    display_order       INTEGER      NOT NULL DEFAULT 99,
    is_active           BOOLEAN      NOT NULL DEFAULT true,
    is_liquid_default   BOOLEAN      NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE ki_asset_types IS
    'Global master: asset categories for snapshot asset capture. Shared across all tenants.';
COMMENT ON COLUMN ki_asset_types.is_liquid_default IS
    'Pre-fills the liquid/illiquid toggle in the intake wizard.';

-- Add snapshot-specific columns if they don't exist (in case 017 ran first without them)
ALTER TABLE ki_asset_types ADD COLUMN IF NOT EXISTS is_liquid_default BOOLEAN NOT NULL DEFAULT false;

-- Insert snapshot-specific asset types using the 017 column names.
-- Updates liquidity flags on existing rows (MF, GOLD, etc. from 017 seed).
-- Inserts new rows (SAVINGS_BANK, VEHICLE, BUSINESS, OTHER) not in 017.
INSERT INTO ki_asset_types (asset_type_code, asset_type_name, description, is_liquid_default, display_order) VALUES
    ('REAL_ESTATE',     'Real Estate',          'Residential or commercial property',               false,  1),
    ('GOLD',            'Gold & Jewellery',      'Physical gold, jewellery, sovereign gold bonds',   false,  2),
    ('FD',              'Fixed Deposit',         'Bank FDs, corporate FDs, RDs',                     false,  3),
    ('SAVINGS_BANK',    'Savings / Bank',        'Savings accounts, current accounts',               true,   4),
    ('MF',              'Mutual Funds',          'Existing MF investments',                          true,   5),
    ('EQUITY',          'Stocks & Equity',       'Direct equity, demat holdings',                    true,   6),
    ('PPF',             'PPF / EPF / NPS',       'Provident fund, pension corpus',                   false,  7),
    ('VEHICLE',         'Vehicle',               'Car, motorcycle, commercial vehicle',              false,  8),
    ('BUSINESS',        'Business / Partnership','Stake in a business, partnership, LLP',            false,  9),
    ('INSURANCE',       'Insurance (Cash Value)','Endowment / ULIP surrender value',                 false, 10),
    ('OTHER',           'Other Asset',           'Any other asset not listed above',                 false, 99)
ON CONFLICT (asset_type_code) DO UPDATE
    SET is_liquid_default = EXCLUDED.is_liquid_default,
        display_order     = EXCLUDED.display_order;


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: ki_liability_types (global — no tenant_id)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_liability_types (
    id          SERIAL      PRIMARY KEY,
    code        VARCHAR(50) UNIQUE NOT NULL,
    label       VARCHAR(100) NOT NULL,
    description TEXT,
    sort_order  INTEGER     NOT NULL DEFAULT 99,
    is_active   BOOLEAN     NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ki_liability_types IS
    'Global master: loan/liability categories for snapshot liability capture.';

INSERT INTO ki_liability_types (code, label, description, sort_order) VALUES
    ('HOME_LOAN',       'Home Loan',        'Housing loan from bank or NBFC',                   1),
    ('CAR_LOAN',        'Car Loan',         'Vehicle finance',                                  2),
    ('PERSONAL_LOAN',   'Personal Loan',    'Unsecured personal loan',                          3),
    ('CREDIT_CARD',     'Credit Card',      'Outstanding credit card balance',                  4),
    ('EDUCATION_LOAN',  'Education Loan',   'Student loan for self or dependent',               5),
    ('BUSINESS_LOAN',   'Business Loan',    'Loan taken for business purposes',                 6),
    ('LOAN_AGAINST_PF', 'Loan Against PF',  'Loan against provident fund or securities',        7),
    ('OTHER',           'Other Liability',  'Any other loan or liability not listed above',    99)
ON CONFLICT (code) DO NOTHING;


-- ============================================================================
-- SECTION 2: INTAKE TOKENS
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: ki_intake_tokens
-- Signed links for Flows 1 (known contact) and Flow 2 (cold lead).
-- token is a 32-byte cryptographically random hex string (64 chars).
-- URL: /intake/[token]  — public Next.js route, no JWT required.
--
-- Flow 1: contact_id IS NOT NULL (MFD sends to specific contact)
-- Flow 2: contact_id IS NULL    (MFD shares generic link; contact created on submit)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_intake_tokens (
    id                  SERIAL      PRIMARY KEY,
    tenant_id           UUID        NOT NULL,               -- FK to vn_tenants.id (not enforced — cross-schema)
    token               VARCHAR(64) UNIQUE NOT NULL,        -- hex(32 random bytes)
    contact_id          BIGINT      REFERENCES ki_contacts(id) ON DELETE SET NULL,
    created_by_user_id  INTEGER     NOT NULL,               -- FK to vn_users.id (not enforced — cross-schema)
    expires_at          TIMESTAMPTZ NOT NULL,               -- created_at + 5 days
    used_at             TIMESTAMPTZ,                        -- null until submitted
    status              VARCHAR(10) NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'used', 'expired')),
    -- Flow 2 only: captured name during lead step (before contact row exists)
    lead_name           VARCHAR(200),
    lead_mobile         VARCHAR(20),
    lead_email          VARCHAR(255),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ki_intake_tokens IS
    'Short-lived tokens for public intake links. Flow 1: contact_id set. Flow 2: contact_id null until submission.';
COMMENT ON COLUMN ki_intake_tokens.token IS
    'hex(crypto.randomBytes(32)) — 64-char hex string. Treat as secret.';
COMMENT ON COLUMN ki_intake_tokens.expires_at IS
    'Set to created_at + interval ''5 days'' by application on generation.';
COMMENT ON COLUMN ki_intake_tokens.lead_name IS
    'Flow 2 only: name captured in Step 0 (lead capture) before contact record is created.';

CREATE INDEX IF NOT EXISTS idx_ki_intake_tokens_tenant
    ON ki_intake_tokens(tenant_id);

CREATE INDEX IF NOT EXISTS idx_ki_intake_tokens_contact
    ON ki_intake_tokens(tenant_id, contact_id)
    WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ki_intake_tokens_lookup
    ON ki_intake_tokens(token, status);


-- ============================================================================
-- SECTION 3: VERSIONED SNAPSHOT HEADER
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: ki_contact_snapshots (tenant-scoped)
-- One row per snapshot version per contact.
-- Exactly ONE row per contact has status = 'active'.
-- History = all rows for that contact ordered by version_number DESC.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_contact_snapshots (
    id                  SERIAL      PRIMARY KEY,
    tenant_id           UUID        NOT NULL,               -- FK to vn_tenants.id (not enforced — cross-schema)
    contact_id          BIGINT      NOT NULL REFERENCES ki_contacts(id) ON DELETE CASCADE,
    is_live             BOOLEAN     NOT NULL DEFAULT false,

    -- Version tracking (per-contact sequential, not global)
    version_number      INTEGER     NOT NULL DEFAULT 1,

    -- Status lifecycle: draft → active → archived
    status              VARCHAR(10) NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft', 'active', 'archived')),

    -- Who filled this snapshot and how
    created_by_user_id  INTEGER,                           -- FK to vn_users.id (not enforced — cross-schema)
    intake_token_id     INTEGER     REFERENCES ki_intake_tokens(id) ON DELETE SET NULL,

    -- Risk profile (carried forward to ki_clients on conversion)
    risk_profile        VARCHAR(20) CHECK (risk_profile IN ('conservative', 'moderate', 'aggressive')),

    -- Computed metrics (cached at submission time for Benchmark Pulse)
    -- Recomputed whenever snapshot sections are updated.
    calc_monthly_income     NUMERIC(14,2),   -- sum of all income sources
    calc_monthly_expenses   NUMERIC(14,2),   -- sum of all expense categories
    calc_monthly_savings    NUMERIC(14,2),   -- income - expenses
    calc_savings_rate_pct   NUMERIC(5,2),    -- savings / income * 100
    calc_total_assets       NUMERIC(16,2),   -- sum of all asset values
    calc_total_liabilities  NUMERIC(16,2),   -- sum of all outstanding loan amounts
    calc_net_worth          NUMERIC(16,2),   -- assets - liabilities
    calc_total_emi          NUMERIC(14,2),   -- sum of all monthly EMIs
    calc_dti_pct            NUMERIC(5,2),    -- total EMI / monthly income * 100
    calc_liquid_assets      NUMERIC(16,2),   -- sum of liquid asset values
    calc_liquidity_months   NUMERIC(5,1),    -- liquid assets / monthly expenses

    -- MFD notes
    notes                   TEXT,

    submitted_at        TIMESTAMPTZ,         -- null for MFD drafts; set when client submits
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- One active snapshot per contact per environment
    CONSTRAINT uq_ki_contact_snapshots_active
        UNIQUE (tenant_id, contact_id, is_live, status)
        DEFERRABLE INITIALLY DEFERRED
);

COMMENT ON TABLE ki_contact_snapshots IS
    'Versioned snapshot header. One active per contact. History = all versions ordered by version_number.';
COMMENT ON COLUMN ki_contact_snapshots.version_number IS
    'Per-contact sequential. Set by app: SELECT COALESCE(MAX(version_number), 0) + 1 FROM ki_contact_snapshots WHERE contact_id = $x.';
COMMENT ON COLUMN ki_contact_snapshots.calc_savings_rate_pct IS
    'Cached at submission. Used by Benchmark Pulse percentile queries without re-aggregating child rows.';
COMMENT ON COLUMN ki_contact_snapshots.intake_token_id IS
    'Set for Flow 1 and Flow 2 submissions. NULL for Flow 3 (MFD fills in-app).';

CREATE INDEX IF NOT EXISTS idx_ki_snapshots_tenant
    ON ki_contact_snapshots(tenant_id, is_live);

CREATE INDEX IF NOT EXISTS idx_ki_snapshots_contact
    ON ki_contact_snapshots(tenant_id, contact_id, is_live);

CREATE INDEX IF NOT EXISTS idx_ki_snapshots_active
    ON ki_contact_snapshots(tenant_id, contact_id, is_live)
    WHERE status = 'active';

CREATE TRIGGER trg_ki_contact_snapshots_updated
    BEFORE UPDATE ON ki_contact_snapshots
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================================
-- SECTION 4: SNAPSHOT CHILD TABLES
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: ki_snapshot_income
-- Up to 3 rows per snapshot: salary, partner, rental_other.
-- source ENUM keeps queries predictable.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_snapshot_income (
    id              SERIAL      PRIMARY KEY,
    snapshot_id     INTEGER     NOT NULL REFERENCES ki_contact_snapshots(id) ON DELETE CASCADE,
    tenant_id       UUID        NOT NULL,
    source          VARCHAR(20) NOT NULL
                        CHECK (source IN ('salary', 'partner', 'rental_other')),
    amount_monthly  NUMERIC(14,2) NOT NULL DEFAULT 0,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_ki_snapshot_income_source UNIQUE (snapshot_id, source)
);

COMMENT ON TABLE ki_snapshot_income IS
    'Monthly income by source. Max 3 rows per snapshot (salary, partner, rental_other).';


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: ki_snapshot_expenses
-- Up to 6 rows per snapshot, one per category.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_snapshot_expenses (
    id              SERIAL      PRIMARY KEY,
    snapshot_id     INTEGER     NOT NULL REFERENCES ki_contact_snapshots(id) ON DELETE CASCADE,
    tenant_id       UUID        NOT NULL,
    category        VARCHAR(20) NOT NULL
                        CHECK (category IN ('housing', 'food', 'utilities', 'transport', 'education', 'lifestyle')),
    amount_monthly  NUMERIC(14,2) NOT NULL DEFAULT 0,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_ki_snapshot_expense_category UNIQUE (snapshot_id, category)
);

COMMENT ON TABLE ki_snapshot_expenses IS
    'Monthly expenses by category. Max 6 rows per snapshot.';


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: ki_snapshot_assets
-- N assets per snapshot. Linked to ki_asset_types for labelling.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_snapshot_assets (
    id              SERIAL      PRIMARY KEY,
    snapshot_id     INTEGER     NOT NULL REFERENCES ki_contact_snapshots(id) ON DELETE CASCADE,
    tenant_id       UUID        NOT NULL,
    asset_type_id   INTEGER     NOT NULL REFERENCES ki_asset_types(id),
    description     TEXT,                               -- free text (e.g. "2BHK in Koramangala")
    current_value   NUMERIC(16,2) NOT NULL,
    is_liquid       BOOLEAN     NOT NULL DEFAULT false, -- pre-filled from asset_types.is_liquid_default
    sort_order      INTEGER     NOT NULL DEFAULT 99,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ki_snapshot_assets IS
    'Assets captured in snapshot. Linked to ki_asset_types master.';
COMMENT ON COLUMN ki_snapshot_assets.is_liquid IS
    'Overrides ki_asset_types.is_liquid_default. User can toggle in wizard.';

CREATE INDEX IF NOT EXISTS idx_ki_snapshot_assets_snapshot
    ON ki_snapshot_assets(snapshot_id);


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: ki_snapshot_liabilities
-- N loans per snapshot. Linked to ki_liability_types.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_snapshot_liabilities (
    id                  SERIAL      PRIMARY KEY,
    snapshot_id         INTEGER     NOT NULL REFERENCES ki_contact_snapshots(id) ON DELETE CASCADE,
    tenant_id           UUID        NOT NULL,
    liability_type_id   INTEGER     NOT NULL REFERENCES ki_liability_types(id),
    description         TEXT,                               -- e.g. "SBI Home Loan"
    outstanding_amount  NUMERIC(16,2) NOT NULL,
    monthly_emi         NUMERIC(12,2) NOT NULL DEFAULT 0,
    interest_rate_pct   NUMERIC(5,2),                       -- annual rate (optional)
    sort_order          INTEGER     NOT NULL DEFAULT 99,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ki_snapshot_liabilities IS
    'Loans/liabilities captured in snapshot. Linked to ki_liability_types master.';

CREATE INDEX IF NOT EXISTS idx_ki_snapshot_liabilities_snapshot
    ON ki_snapshot_liabilities(snapshot_id);


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: ki_snapshot_protection
-- One row per snapshot. Tracks insurance coverage.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_snapshot_protection (
    id                  SERIAL      PRIMARY KEY,
    snapshot_id         INTEGER     NOT NULL UNIQUE REFERENCES ki_contact_snapshots(id) ON DELETE CASCADE,
    tenant_id           UUID        NOT NULL,

    -- Life cover
    life_cover_amount   NUMERIC(16,2),      -- total sum assured (₹)
    life_premium_annual NUMERIC(12,2),      -- total annual premium paid

    -- Health cover
    health_cover_amount NUMERIC(14,2),      -- total health cover (₹)
    health_premium_annual NUMERIC(12,2),

    -- Critical illness / accidental
    ci_cover_amount     NUMERIC(14,2),

    -- Computed: life_cover / annual_income (filled from ki_contact_snapshots.calc_monthly_income * 12)
    -- Stored for Benchmark Pulse — protection ratio
    protection_ratio    NUMERIC(5,2),

    has_term_plan       BOOLEAN NOT NULL DEFAULT false,
    has_health_cover    BOOLEAN NOT NULL DEFAULT false,

    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ki_snapshot_protection IS
    'Insurance/protection data for a snapshot version. 1:1 with ki_contact_snapshots.';
COMMENT ON COLUMN ki_snapshot_protection.protection_ratio IS
    'life_cover / annual_income. Benchmark Pulse: how many times income is covered.';

CREATE TRIGGER trg_ki_snapshot_protection_updated
    BEFORE UPDATE ON ki_snapshot_protection
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: ki_snapshot_goals
-- N aspirational goals per snapshot.
-- Replaces goals_lite JSONB in ki_contact_snapshot (migration 019).
-- On convert_to_client: these rows seed ki_goals.
-- After conversion: this table is historical record only.
--   (Edits go to ki_goals, not here.)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_snapshot_goals (
    id              SERIAL      PRIMARY KEY,
    snapshot_id     INTEGER     NOT NULL REFERENCES ki_contact_snapshots(id) ON DELETE CASCADE,
    tenant_id       UUID        NOT NULL,

    goal_type       VARCHAR(20) NOT NULL DEFAULT 'custom'
                        CHECK (goal_type IN (
                            'retirement', 'education', 'house', 'wedding',
                            'emergency', 'vehicle', 'travel', 'custom'
                        )),
    name            VARCHAR(200) NOT NULL,
    target_amount   NUMERIC(14,2) NOT NULL,
    timeline_years  INTEGER NOT NULL,           -- horizon in years
    priority        INTEGER NOT NULL DEFAULT 1, -- 1 = highest

    -- Set to the seeded ki_goals.id after convert_to_client
    -- Allows history view to link "this goal became that plan"
    seeded_goal_id  INTEGER     REFERENCES ki_goals(id) ON DELETE SET NULL,

    notes           TEXT,
    sort_order      INTEGER     NOT NULL DEFAULT 99,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ki_snapshot_goals IS
    'Aspirational goals in snapshot. Replaces goals_lite JSONB. Seeded into ki_goals on client conversion.';
COMMENT ON COLUMN ki_snapshot_goals.seeded_goal_id IS
    'Set by convert_to_client(). Links the aspirational goal to its live ki_goals planning record.';

CREATE INDEX IF NOT EXISTS idx_ki_snapshot_goals_snapshot
    ON ki_snapshot_goals(snapshot_id);


-- ============================================================================
-- SECTION 5: ROW LEVEL SECURITY
-- ============================================================================

-- ki_intake_tokens — tenant-scoped
ALTER TABLE ki_intake_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY ki_intake_tokens_tenant_isolation ON ki_intake_tokens
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ki_contact_snapshots — tenant-scoped
ALTER TABLE ki_contact_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY ki_contact_snapshots_tenant_isolation ON ki_contact_snapshots
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ki_snapshot_income — tenant-scoped
ALTER TABLE ki_snapshot_income ENABLE ROW LEVEL SECURITY;
CREATE POLICY ki_snapshot_income_tenant_isolation ON ki_snapshot_income
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ki_snapshot_expenses — tenant-scoped
ALTER TABLE ki_snapshot_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY ki_snapshot_expenses_tenant_isolation ON ki_snapshot_expenses
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ki_snapshot_assets — tenant-scoped
ALTER TABLE ki_snapshot_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY ki_snapshot_assets_tenant_isolation ON ki_snapshot_assets
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ki_snapshot_liabilities — tenant-scoped
ALTER TABLE ki_snapshot_liabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY ki_snapshot_liabilities_tenant_isolation ON ki_snapshot_liabilities
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ki_snapshot_protection — tenant-scoped
ALTER TABLE ki_snapshot_protection ENABLE ROW LEVEL SECURITY;
CREATE POLICY ki_snapshot_protection_tenant_isolation ON ki_snapshot_protection
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ki_snapshot_goals — tenant-scoped
ALTER TABLE ki_snapshot_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY ki_snapshot_goals_tenant_isolation ON ki_snapshot_goals
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- NOTE: ki_asset_types and ki_liability_types are global master tables.
-- No RLS — readable by all tenants, writable only by superadmin.


-- ============================================================================
-- SECTION 6: DEPRECATION NOTE
-- ============================================================================

COMMENT ON TABLE ki_contact_snapshot IS
    '[DEPRECATED — migration 021] Superseded by ki_contact_snapshots (versioned). '
    'Kept intact for data preservation. Will be dropped after data migration to new schema.';
