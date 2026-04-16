-- KI: All active asset types (global — no tenant filter)
-- Used to populate the "Add Investment" form dropdown.
-- Named params: none

SELECT
    id,
    asset_type_code,
    asset_type_name,
    category,
    default_assumption_rate,
    display_order,
    description
FROM ki_asset_types
WHERE is_active = true
ORDER BY display_order, asset_type_name;
