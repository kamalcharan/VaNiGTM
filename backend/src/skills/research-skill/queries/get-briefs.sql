-- get_briefs: the research output, one row per company.
--
-- Joined to gt_prospects because a brief without the company's name and ref
-- is not readable. The tenant + environment filter is on BOTH tables: the
-- brief carries its own tenant_id, and so does the prospect, and neither is
-- optional (CLAUDE.md rules 1 and 8).
--
-- Named params: $tenant_id, $is_live, $status, $offer, $view, $search, $limit, $offset

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
    -- Three offers, three different questions, none of them overwriting
    -- another:
    --   best_fit_offer     what the model scored highest
    --   recommended_offer  what the agent decided to open with (the ladder)
    --   human_offer        what the reviewer moved it to, if they did
    -- A recommendation nobody can argue with is one nobody should trust, and
    -- the disagreements are what the Learning Graph is built from.
    b.recommended_offer,
    b.best_fit_offer,
    b.human_offer,
    COALESCE(b.human_offer, b.recommended_offer) AS effective_offer,
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
  AND  ($prospect_id::bigint IS NULL OR b.prospect_id = $prospect_id::bigint)
  AND  ($status::text IS NULL OR b.status = $status::text)
  -- ── The stat cards, as filters ──────────────────────────────────────
  -- Every number on that row is a question ("which 5 were too close to
  -- call?"), and a number you cannot click is a question you have to answer
  -- with a spreadsheet. One `view` param rather than six booleans, because
  -- the cards are mutually exclusive by construction — you are looking at one
  -- slice at a time.
  AND  ($view::text IS NULL
        OR ($view::text = 'with_offer'
            AND COALESCE(b.human_offer, b.recommended_offer) IS NOT NULL)
        OR ($view::text = 'no_fit'
            AND b.status NOT IN ('unreadable','extract_failed')
            AND COALESCE(b.human_offer, b.recommended_offer) IS NULL)
        OR ($view::text = 'smaller_ask'
            AND b.recommended_offer IS NOT NULL
            AND b.best_fit_offer IS NOT NULL
            AND b.best_fit_offer <> b.recommended_offer)
        OR ($view::text = 'fit_unclear'
            AND b.recommended_offer IS NOT NULL
            AND b.fit_margin IS NOT NULL
            AND b.fit_margin < 0.15)
        OR ($view::text = 'unevidenced'
            AND b.status NOT IN ('unreadable','extract_failed')
            AND jsonb_array_length(COALESCE(b.raw_evidence, '[]'::jsonb)) = 0)
        OR ($view::text = 'decided'   AND b.decided_at IS NOT NULL)
        OR ($view::text = 'undecided' AND b.decided_at IS NULL
            AND b.status NOT IN ('unreadable','extract_failed')))
  -- Filtered on the EFFECTIVE offer: a reviewer who moved a company onto the
  -- audit expects to find it under the audit.
  AND  ($offer::text IS NULL
        OR ($offer::text = 'none'
            AND COALESCE(b.human_offer, b.recommended_offer) IS NULL)
        OR COALESCE(b.human_offer, b.recommended_offer) = $offer::text)
  AND  ($search::text IS NULL
        OR p.name ILIKE '%' || $search::text || '%'
        OR b.domain ILIKE '%' || $search::text || '%'
        OR b.what_they_make ILIKE '%' || $search::text || '%')
-- Undecided first: this list is a queue of decisions, not an archive.
ORDER  BY (b.decided_at IS NOT NULL), b.updated_at DESC
LIMIT  $limit
OFFSET $offset;
