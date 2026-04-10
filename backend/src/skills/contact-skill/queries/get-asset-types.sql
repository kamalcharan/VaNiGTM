-- get-asset-types: all active asset types for dropdown population
-- No tenant filter — global master table
-- Named params: (none)
--
-- Migration 023 added is_liquid_default column to ki_asset_types.
-- Migration 026 sets FD to liquid (FDs can be broken — near-liquid).

SELECT
    id,
    asset_type_code  AS code,
    asset_type_name  AS label,
    description,
    is_liquid_default,
    display_order    AS sort_order
FROM ki_asset_types
WHERE is_active = true
ORDER BY display_order, asset_type_name;
