-- brief_stats: the health of the WHOLE research batch, not the filtered page.
--
-- Named params: $tenant_id, $is_live

SELECT
    count(*)                                                          AS total,
    -- Their website is unreadable: a finding about the company.
    count(*) FILTER (WHERE status = 'unreadable')                     AS unreadable,
    -- OUR extraction fell over: retryable, and says nothing about them.
    count(*) FILTER (WHERE status = 'extract_failed')                 AS extract_failed,
    count(*) FILTER (WHERE recommended_offer IS NOT NULL)             AS with_offer,
    count(*) FILTER (WHERE status NOT IN ('unreadable','extract_failed')
                       AND recommended_offer IS NULL)                 AS no_fit,
    count(*) FILTER (WHERE recommended_offer IS NOT NULL
                       AND hook IS NULL)                              AS no_hook,
    -- Claims the model could not point at. Read these first.
    count(*) FILTER (WHERE status NOT IN ('unreadable','extract_failed')
                       AND jsonb_array_length(COALESCE(raw_evidence,'[]'::jsonb)) = 0) AS unevidenced,
    count(*) FILTER (WHERE decided_at IS NOT NULL)                    AS decided,
    count(*) FILTER (WHERE status = 'approved')                       AS approved,
    count(*) FILTER (WHERE status IN ('rejected','no_contact'))       AS declined
FROM   gt_account_briefs
WHERE  tenant_id = $tenant_id AND is_live = $is_live;
