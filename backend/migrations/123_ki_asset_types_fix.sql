-- ============================================================================
-- Migration 023: Add years_held to ki_snapshot_assets + fill missing asset types
--
-- ki_asset_types uses 017 schema (asset_type_code, asset_type_name, display_order).
-- Migration 021 adds is_liquid_default and snapshot-specific rows.
-- This migration:
--   1. Ensures is_liquid_default column exists (safe if 021 already added it)
--   2. Fills liquidity flag for 017 seed rows that weren't updated by 021
--   3. Inserts any missing snapshot-specific asset types
--   4. Adds years_held to ki_snapshot_assets
-- ============================================================================

-- ── Ensure is_liquid_default column exists ────────────────────────────────

ALTER TABLE ki_asset_types ADD COLUMN IF NOT EXISTS is_liquid_default BOOLEAN NOT NULL DEFAULT false;

-- ── Set liquidity for 017 seed rows ──────────────────────────────────────

UPDATE ki_asset_types
SET is_liquid_default = true
WHERE asset_type_code IN ('MF', 'EQUITY', 'SILVER', 'SAVINGS_BANK', 'MUTUAL_FUNDS', 'STOCKS_EQUITY');

-- ── Insert any missing asset types (safe — ON CONFLICT DO NOTHING) ────────

INSERT INTO ki_asset_types (asset_type_code, asset_type_name, description, is_liquid_default, display_order) VALUES
    ('SAVINGS_BANK', 'Savings / Bank',        'Savings accounts, current accounts',   true,  4),
    ('VEHICLE',      'Vehicle',               'Car, motorcycle, commercial vehicle',   false, 8),
    ('BUSINESS',     'Business / Partnership','Stake in a business or partnership',    false, 9),
    ('OTHER',        'Other Asset',           'Any other asset not listed above',      false, 99)
ON CONFLICT (asset_type_code) DO NOTHING;

-- ── Add years_held to ki_snapshot_assets ─────────────────────────────────
-- How many years ago the asset was acquired.
-- Used for LTCG eligibility and growth projection.

ALTER TABLE ki_snapshot_assets
    ADD COLUMN IF NOT EXISTS years_held SMALLINT CHECK (years_held >= 0 AND years_held <= 99);

COMMENT ON COLUMN ki_snapshot_assets.years_held IS
    'How many years ago the asset was acquired. NULL = not provided. Used for LTCG and projection.';

-- ── Done ─────────────────────────────────────────────────────────────────

DO $$
BEGIN
    RAISE NOTICE '[023] ki_asset_types total: %', (SELECT COUNT(*) FROM ki_asset_types);
    RAISE NOTICE '[023] ki_asset_types liquid=true: %', (SELECT COUNT(*) FROM ki_asset_types WHERE is_liquid_default = true);
END $$;
