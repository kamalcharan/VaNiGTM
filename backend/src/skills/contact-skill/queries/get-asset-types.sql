-- get-asset-types: all active asset types for dropdown population
-- No tenant filter — global master table
-- Named params: (none)
--
-- NOTE: migration 017 uses asset_type_code/asset_type_name columns.
-- migration 023 adds code/label columns and back-fills them.
-- We use COALESCE so this query works both before and after 023 runs.

SELECT
    id,
    COALESCE(code, asset_type_code)          AS code,
    COALESCE(label, asset_type_name)         AS label,
    description,
    COALESCE(is_liquid_default, false)       AS is_liquid_default,
    COALESCE(sort_order, display_order, 99)  AS sort_order
FROM ki_asset_types
WHERE is_active = true
ORDER BY COALESCE(sort_order, display_order, 99), COALESCE(label, asset_type_name);
