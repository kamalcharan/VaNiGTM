-- ============================================================
-- 050_ki_customer_asset_assignments.sql
--
-- Per-customer investment plan table — one row per asset a client holds.
-- This is the bridge between raw imported transactions (MF, scheme-based)
-- and the broader multi-asset world (Gold, FD, Real Estate, etc.).
--
-- Auto-populated for MF by the import RPC (migration 051) when a new
-- holding is detected. Manually created by the advisor for non-MF assets
-- (Gold, FD, PPF, Real Estate, etc.) via the Assets tab in the dashboard.
--
-- Uniqueness rules:
--   MF assets    → unique on (tenant_id, is_live, client_id, scheme_code)
--                  One row per scheme per client environment.
--   Non-MF assets → unique on (tenant_id, is_live, client_id, asset_type_id)
--                  where scheme_code IS NULL. One plan per asset type per client.
-- ============================================================

BEGIN;

-- ── TABLE ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_customer_asset_assignments (
    id                      SERIAL          PRIMARY KEY,
    tenant_id               UUID            NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    is_live                 BOOLEAN         NOT NULL DEFAULT true,
    client_id               INTEGER         NOT NULL REFERENCES ki_clients(id) ON DELETE CASCADE,
    asset_type_id           INTEGER         NOT NULL REFERENCES ki_asset_types(id),

    -- MF only: links to a specific scheme. NULL for non-MF assets.
    scheme_code             TEXT            REFERENCES ki_schemes(scheme_code),

    -- Investment plan details
    investment_type         TEXT            CHECK (investment_type IN ('one_time', 'lumpsum', 'sip', 'recurring')),
    principal_amount        NUMERIC(15, 2),
    start_date              DATE,
    duration_months         INTEGER,                 -- investment horizon

    -- SIP / recurring
    recurring_amount        NUMERIC(12, 2),
    investment_frequency    TEXT            CHECK (investment_frequency IN ('monthly', 'quarterly', 'yearly')),

    -- Growth rate override. NULL → use ki_asset_types.default_assumption_rate.
    custom_assumption_rate  NUMERIC(5, 2),

    -- Status & meta
    is_active               BOOLEAN         NOT NULL DEFAULT true,
    notes                   TEXT,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now()
);

COMMENT ON TABLE  ki_customer_asset_assignments                             IS 'Per-customer investment plans. Auto-created for MF on first import; manually created for non-MF assets.';
COMMENT ON COLUMN ki_customer_asset_assignments.scheme_code                 IS 'Set for MF asset type (links to ki_schemes). NULL for non-MF assets (Gold, FD, etc.).';
COMMENT ON COLUMN ki_customer_asset_assignments.custom_assumption_rate      IS 'Annual growth rate % override. NULL = use ki_asset_types.default_assumption_rate.';
COMMENT ON COLUMN ki_customer_asset_assignments.principal_amount            IS 'Total principal invested. NULL for MF (calculated from transactions instead).';

-- ── INDEXES ───────────────────────────────────────────────────────────────────

-- Tenant-scoped list queries
CREATE INDEX IF NOT EXISTS idx_ki_asset_assign_tenant
    ON ki_customer_asset_assignments (tenant_id, is_live);

-- Per-client list (the primary access pattern)
CREATE INDEX IF NOT EXISTS idx_ki_asset_assign_client
    ON ki_customer_asset_assignments (tenant_id, is_live, client_id);

-- Asset type filter (for reporting: all Gold across all clients, etc.)
CREATE INDEX IF NOT EXISTS idx_ki_asset_assign_type
    ON ki_customer_asset_assignments (tenant_id, asset_type_id);

-- ── UNIQUE CONSTRAINTS (partial) ──────────────────────────────────────────────

-- MF: one assignment per scheme per client environment
CREATE UNIQUE INDEX IF NOT EXISTS uq_ki_asset_assign_mf
    ON ki_customer_asset_assignments (tenant_id, is_live, client_id, scheme_code)
    WHERE scheme_code IS NOT NULL;

-- Non-MF: one assignment per asset type per client environment
CREATE UNIQUE INDEX IF NOT EXISTS uq_ki_asset_assign_non_mf
    ON ki_customer_asset_assignments (tenant_id, is_live, client_id, asset_type_id)
    WHERE scheme_code IS NULL;

-- ── ROW LEVEL SECURITY ────────────────────────────────────────────────────────

ALTER TABLE ki_customer_asset_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY ki_asset_assign_tenant_isolation
    ON ki_customer_asset_assignments
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

-- ── UPDATED_AT TRIGGER ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ki_touch_asset_assignment()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ki_asset_assign_updated_at ON ki_customer_asset_assignments;
CREATE TRIGGER trg_ki_asset_assign_updated_at
    BEFORE UPDATE ON ki_customer_asset_assignments
    FOR EACH ROW EXECUTE FUNCTION ki_touch_asset_assignment();

COMMIT;

DO $$ BEGIN
    RAISE NOTICE '[050] ki_customer_asset_assignments: created';
    RAISE NOTICE '[050] Unique indexes: MF (scheme_code NOT NULL) + non-MF (scheme_code IS NULL)';
    RAISE NOTICE '[050] RLS enabled with tenant isolation policy';
    RAISE NOTICE '[050] Auto-population by import RPC added in migration 051';
END $$;
