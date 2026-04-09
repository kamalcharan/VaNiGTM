-- get-asset-types: all active asset types for dropdown population
-- No tenant filter — global master table
-- Named params: (none)
--
-- Migration 017 created ki_asset_types with columns:
--   asset_type_code, asset_type_name, display_order
-- Migration 023 will add: is_liquid_default, sort_order
-- This query uses the 017 columns that definitely exist, aliased for the frontend.

SELECT
    id,
    asset_type_code  AS code,
    asset_type_name  AS label,
    description,
    CASE
        WHEN asset_type_code IN ('MF', 'EQUITY', 'SILVER', 'SAVINGS_BANK', 'MUTUAL_FUNDS', 'STOCKS_EQUITY')
        THEN true
        ELSE false
    END              AS is_liquid_default,
    display_order    AS sort_order
FROM ki_asset_types
WHERE is_active = true
ORDER BY display_order, asset_type_name;
