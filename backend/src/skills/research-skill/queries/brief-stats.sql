-- brief_stats: the health of the WHOLE research batch, not the filtered page.
--
-- Named params: $tenant_id, $is_live

SELECT
    count(*)                                                          AS total,
    count(*) FILTER (WHERE status = 'unreadable')                     AS unreadable,
    count(*) FILTER (WHERE recommended_offer IS NOT NULL)             AS with_offer,
    count(*) FILTER (WHERE status <> 'unreadable'
                       AND recommended_offer IS NULL)                 AS no_fit,
    count(*) FILTER (WHERE recommended_offer IS NOT NULL
                       AND hook IS NULL)                              AS no_hook,
    -- Claims the model could not point at. Read these first.
    count(*) FILTER (WHERE status <> 'unreadable'
                       AND jsonb_array_length(COALESCE(raw_evidence,'[]'::jsonb)) = 0) AS unevidenced,
    count(*) FILTER (WHERE decided_at IS NOT NULL)                    AS decided,
    count(*) FILTER (WHERE status = 'approved')                       AS approved,
    count(*) FILTER (WHERE status IN ('rejected','no_contact'))       AS declined
FROM   gt_account_briefs
WHERE  tenant_id = $tenant_id AND is_live = $is_live;
