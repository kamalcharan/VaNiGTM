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
    -- The top two offers scored within the margin, so the "winner" won on
    -- noise. Kept as a batch-level number because a handful is normal and a
    -- majority means the offers themselves do not discriminate — which is a
    -- problem with the offer wording, not with any one company.
    -- 0.15 mirrors FIT_MARGIN in offer-catalogue.ts; change both together.
    count(*) FILTER (WHERE recommended_offer IS NOT NULL
                       AND fit_margin IS NOT NULL
                       AND fit_margin < 0.15)                         AS fit_unclear,
    -- The smallest-sane-ask rule moved the recommendation off the best fit.
    count(*) FILTER (WHERE recommended_offer IS NOT NULL
                       AND best_fit_offer IS NOT NULL
                       AND best_fit_offer <> recommended_offer)       AS smaller_ask,
    -- Claims the model could not point at. Read these first.
    count(*) FILTER (WHERE status NOT IN ('unreadable','extract_failed')
                       AND jsonb_array_length(COALESCE(raw_evidence,'[]'::jsonb)) = 0) AS unevidenced,
    count(*) FILTER (WHERE decided_at IS NOT NULL)                    AS decided,
    -- Rulings the Learning Graph can generalise from: a company ruled out, or
    -- approved under an offer other than the one the agent proposed.
    count(*) FILTER (WHERE decided_at IS NOT NULL
                       AND status NOT IN ('unreadable','extract_failed')
                       AND (status IN ('rejected','no_contact')
                            OR (human_offer IS NOT NULL
                                AND human_offer IS DISTINCT FROM recommended_offer)))
                                                                      AS disagreements,
    count(*) FILTER (WHERE status = 'approved')                       AS approved,
    count(*) FILTER (WHERE status IN ('rejected','no_contact'))       AS declined
FROM   gt_account_briefs
WHERE  tenant_id = $tenant_id AND is_live = $is_live;
