-- get_pipeline: contacts assigned to a campaign grouped by pipeline stage
-- Named params: $tenant_id, $is_live, $campaign_id, $stage (nullable), $search (nullable), $limit, $offset

WITH paged AS (
    SELECT
        a.id AS assignment_id,
        a.contact_id,
        a.stage,
        a.score,
        a.first_contacted_at,
        a.last_activity_at,
        a.sequence_id,
        c.name AS contact_name,
        c.prefix,
        c.contact_no
    FROM gt_contact_assignments a
    JOIN ki_contacts c ON c.id = a.contact_id AND c.is_live = $is_live
    WHERE a.tenant_id   = $tenant_id
      AND a.is_live     = $is_live
      AND a.campaign_id = $campaign_id
      AND (
          $stage::text IS NULL
          OR a.stage = $stage::text
      )
      AND (
          $search::text IS NULL
          OR c.name ILIKE '%' || $search::text || '%'
      )
    ORDER BY a.score DESC, a.created_at DESC
    LIMIT  $limit
    OFFSET $offset
)
SELECT
    p.*,
    mob.channel_value AS primary_mobile,
    em.channel_value  AS primary_email
FROM paged p
LEFT JOIN LATERAL (
    SELECT channel_value FROM ki_contact_channels
    WHERE contact_id = p.contact_id AND is_live = $is_live AND is_active = true AND channel_type = 'mobile'
    ORDER BY is_primary DESC LIMIT 1
) mob ON true
LEFT JOIN LATERAL (
    SELECT channel_value FROM ki_contact_channels
    WHERE contact_id = p.contact_id AND is_live = $is_live AND is_active = true AND channel_type = 'email'
    ORDER BY is_primary DESC LIMIT 1
) em ON true
ORDER BY p.score DESC;
