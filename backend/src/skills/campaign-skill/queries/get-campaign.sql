-- get_campaign: single campaign with persona count
-- Named params: $tenant_id, $is_live, $campaign_id

SELECT
    c.id,
    c.campaign_no,
    c.name,
    c.description,
    c.product_name,
    c.product_url,
    c.target_industries,
    c.sender_name,
    c.sender_email,
    c.status,
    c.launched_at,
    c.completed_at,
    c.created_at,
    c.updated_at,
    (
        SELECT COUNT(*)::int
        FROM gt_personas p
        WHERE p.campaign_id = c.id
          AND p.is_live     = $is_live
          AND p.is_active   = true
    ) AS persona_count
FROM gt_campaigns c
WHERE c.tenant_id = $tenant_id
  AND c.is_live   = $is_live
  AND c.is_active = true
  AND c.id        = $campaign_id;
