-- get-asset-types: all active asset types for dropdown population
-- No tenant filter — global master table
-- Named params: (none)

SELECT
    id,
    code,
    label,
    description,
    is_liquid_default,
    sort_order
FROM ki_asset_types
WHERE is_active = true
ORDER BY sort_order, label;
