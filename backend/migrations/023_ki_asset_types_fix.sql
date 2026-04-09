-- ============================================================================
-- Migration 023: Fix ki_asset_types schema + add years_held to snapshot assets
--
-- Problem:
--   Migration 017 created ki_asset_types with columns:
--     asset_type_code, asset_type_name, category, default_assumption_rate, display_order
--
--   Migration 021 assumed columns: code, label, is_liquid_default
--   Its CREATE TABLE IF NOT EXISTS was a no-op (table existed), so those
--   columns were never created, and its seed INSERTs silently failed.
--
-- Fix:
--   1. Add 'code', 'label', 'is_liquid_default', 'sort_order' columns (IF NOT EXISTS)
--   2. Back-fill from the 017 columns where the new columns are null
--   3. Insert the 021 seed rows (using code column, ON CONFLICT DO NOTHING)
--   4. Add years_held to ki_snapshot_assets for asset purchase date capture
-- ============================================================================

-- ── Step 1: Add missing columns to ki_asset_types ─────────────────────────

ALTER TABLE ki_asset_types
    ADD COLUMN IF NOT EXISTS code              VARCHAR(50),
    ADD COLUMN IF NOT EXISTS label             VARCHAR(100),
    ADD COLUMN IF NOT EXISTS is_liquid_default BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS sort_order        INTEGER NOT NULL DEFAULT 99;

-- ── Step 2: Back-fill code + label from 017's asset_type_code/asset_type_name

UPDATE ki_asset_types
SET
    code  = COALESCE(code,  asset_type_code),
    label = COALESCE(label, asset_type_name)
WHERE code IS NULL OR label IS NULL;

-- ── Step 3: Set is_liquid_default for existing rows (from 017 seed data) ──

UPDATE ki_asset_types SET is_liquid_default = true
WHERE code IN ('MF', 'EQUITY', 'SILVER');

-- GOLD, FD, PPF, EPF, NPS, REAL_ESTATE, INSURANCE stay false (default)

-- ── Step 4: Add UNIQUE constraint on code if not already there ─────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ki_asset_types_code_key' AND conrelid = 'ki_asset_types'::regclass
    ) THEN
        ALTER TABLE ki_asset_types ADD CONSTRAINT ki_asset_types_code_key UNIQUE (code);
    END IF;
END $$;

-- ── Step 5: Insert snapshot-specific asset types (021 seed) ───────────────
-- These supplement 017's generic codes with more granular snapshot categories.

INSERT INTO ki_asset_types (code, label, description, is_liquid_default, sort_order) VALUES
    ('REAL_ESTATE',     'Real Estate',          'Residential or commercial property',               false,  1),
    ('GOLD',            'Gold & Jewellery',      'Physical gold, jewellery, sovereign gold bonds',   false,  2),
    ('FIXED_DEPOSIT',   'Fixed Deposit',         'Bank FDs, corporate FDs, RDs',                     false,  3),
    ('SAVINGS_BANK',    'Savings / Bank',        'Savings accounts, current accounts',               true,   4),
    ('MUTUAL_FUNDS',    'Mutual Funds',          'Existing MF investments (not in ProKey)',           true,   5),
    ('STOCKS_EQUITY',   'Stocks & Equity',       'Direct equity, demat holdings',                    true,   6),
    ('PPF_EPF',         'PPF / EPF / NPS',       'Provident fund, pension corpus',                   false,  7),
    ('VEHICLE',         'Vehicle',               'Car, motorcycle, commercial vehicle',              false,  8),
    ('BUSINESS',        'Business / Partnership','Stake in a business, partnership, LLP',            false,  9),
    ('INSURANCE_VALUE', 'Insurance (Cash Value)','Endowment / ULIP surrender value',                 false, 10),
    ('OTHER',           'Other Asset',           'Any other asset not listed above',                 false, 99)
ON CONFLICT (code) DO UPDATE
    SET
        label             = EXCLUDED.label,
        description       = EXCLUDED.description,
        is_liquid_default = EXCLUDED.is_liquid_default,
        sort_order        = EXCLUDED.sort_order;

-- ── Step 6: Add years_held to ki_snapshot_assets ──────────────────────────
-- Captures how long the client has held this asset (in whole years).
-- Used for: growth projection, LTCG eligibility, acquisition cost estimates.

ALTER TABLE ki_snapshot_assets
    ADD COLUMN IF NOT EXISTS years_held SMALLINT CHECK (years_held >= 0 AND years_held <= 99);

COMMENT ON COLUMN ki_snapshot_assets.years_held IS
    'How many years ago the asset was acquired. NULL = not provided. Used for LTCG and projection.';

-- ── Done ──────────────────────────────────────────────────────────────────

DO $$
BEGIN
    RAISE NOTICE '[023] ki_asset_types rows: %', (SELECT COUNT(*) FROM ki_asset_types);
    RAISE NOTICE '[023] ki_asset_types with code set: %', (SELECT COUNT(*) FROM ki_asset_types WHERE code IS NOT NULL);
    RAISE NOTICE '[023] ki_snapshot_assets years_held column: added';
END $$;
