-- get-bookmark-reasons: list active bookmark reasons for the tenant + environment
-- Named params: $tenant_id, $is_live

SELECT
    id,
    reason_code,
    reason_label,
    display_order

FROM ki_bookmark_reasons

WHERE tenant_id = $tenant_id
  AND is_live   = $is_live
  AND is_active = true

ORDER BY display_order, reason_label
