-- get_personas: all personas for a campaign with signal count
-- Named params: $tenant_id, $is_live, $campaign_id

SELECT
    p.id,
    p.title,
    p.emoji,
    p.description,
    p.tags,
    p.company_size_min,
    p.company_size_max,
    p.seniority_level,
    p.sort_order,
    p.created_at,
    COALESCE(sc.cnt, 0)::int AS signal_count
FROM gt_personas p
LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS cnt
    FROM gt_persona_signals
    WHERE persona_id = p.id
      AND is_live    = $is_live
) sc ON true
WHERE p.tenant_id   = $tenant_id
  AND p.is_live     = $is_live
  AND p.is_active   = true
  AND p.campaign_id = $campaign_id
ORDER BY p.sort_order ASC, p.created_at ASC;
