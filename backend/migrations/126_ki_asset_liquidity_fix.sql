-- Migration 026: Fix asset liquidity defaults
--
-- FD (Fixed Deposit) should be liquid — it can be broken prematurely at any
-- bank branch. The 017+023 seed missed FD in the liquid list.
-- SAVINGS_BANK is already true from migration 023.
--
-- Liquid in Indian financial planning context:
--   MF, EQUITY, SAVINGS_BANK, SILVER  — already true from migration 023
--   FD                                — fixed here

UPDATE ki_asset_types
SET is_liquid_default = true
WHERE asset_type_code = 'FD';

DO $$
BEGIN
    RAISE NOTICE '[026] ki_asset_types FD is_liquid_default: %',
        (SELECT is_liquid_default FROM ki_asset_types WHERE asset_type_code = 'FD');
END $$;
