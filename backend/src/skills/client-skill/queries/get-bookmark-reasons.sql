-- get-bookmark-reasons: list active bookmark reasons for the tenant
-- Bookmark reasons are master data (configuration) — treated as environment-agnostic.
-- Reasons are seeded for both is_live=true and is_live=false; DISTINCT ON deduplicates
-- by reason_code, preferring the live=true entry when both exist.
-- Named param: $tenant_id

SELECT id, reason_code, reason_label, display_order
FROM (
    SELECT DISTINCT ON (reason_code)
        id, reason_code, reason_label, display_order
    FROM ki_bookmark_reasons
    WHERE tenant_id = $tenant_id
      AND is_active = true
    ORDER BY reason_code, is_live DESC   -- prefer live=true row when duplicates exist
) deduped
ORDER BY display_order, reason_label
