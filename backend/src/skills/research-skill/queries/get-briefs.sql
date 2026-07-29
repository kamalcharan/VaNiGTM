-- get_briefs: the research output, one row per company.
--
-- Joined to gt_prospects because a brief without the company's name and ref
-- is not readable. The tenant + environment filter is on BOTH tables: the
-- brief carries its own tenant_id, and so does the prospect, and neither is
-- optional (CLAUDE.md rules 1 and 8).
--
-- Named params: $tenant_id, $is_live, $status, $offer, $search, $limit, $offset

SELECT
    b.id,
    b.prospect_id,
    p.ref,
    p.name,
    b.domain,
    b.status,
    b.pages_read,
    b.what_they_make,
    b.scale_signals,
    b.service_signals,
    b.digital_maturity,
    b.named_contacts,
    b.fit,
    b.recommended_offer,
    -- What the model actually said, before the smallest-sane-ask rule. When
    -- these differ the brief shows both — a recommendation nobody can argue
    -- with is a recommendation nobody should trust.
    b.best_fit_offer,
    b.fit_margin,
    b.fit_reason,
    b.hook,
    b.raw_evidence,
    b.error,
    b.decision_note,
    b.decided_at,
    b.updated_at,
    -- The check a reviewer makes first: did it assert anything it could not
    -- point at on a page we actually read?
    (b.status NOT IN ('unreadable','extract_failed')
     AND jsonb_array_length(COALESCE(b.raw_evidence, '[]'::jsonb)) = 0) AS unevidenced,
    COUNT(*) OVER () AS filtered_total
FROM   gt_account_briefs b
JOIN   gt_prospects p
       ON p.id = b.prospect_id
      AND p.tenant_id = $tenant_id
      AND p.is_live   = $is_live
WHERE  b.tenant_id = $tenant_id
  AND  b.is_live   = $is_live
  AND  ($status::text IS NULL OR b.status = $status::text)
  AND  ($offer::text IS NULL
        OR ($offer::text = 'none' AND b.recommended_offer IS NULL)
        OR b.recommended_offer = $offer::text)
  AND  ($search::text IS NULL
        OR p.name ILIKE '%' || $search::text || '%'
        OR b.domain ILIKE '%' || $search::text || '%'
        OR b.what_they_make ILIKE '%' || $search::text || '%')
-- Undecided first: this list is a queue of decisions, not an archive.
ORDER  BY (b.decided_at IS NOT NULL), b.updated_at DESC
LIMIT  $limit
OFFSET $offset;
