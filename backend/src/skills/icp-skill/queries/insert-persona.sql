INSERT INTO gt_personas
  (campaign_id, tenant_id, is_live, title, emoji, description, tags,
   company_size_min, company_size_max, seniority_level, sort_order)
VALUES
  ($campaign_id, $tenant_id, $is_live, $title, $emoji, $description,
   $tags::jsonb, $company_size_min, $company_size_max, $seniority_level,
   COALESCE(
     (SELECT MAX(sort_order) + 1 FROM gt_personas
      WHERE campaign_id = $campaign_id AND is_live = $is_live AND is_active = true),
     0
   ))
RETURNING id, title, emoji, tags, sort_order, created_at
