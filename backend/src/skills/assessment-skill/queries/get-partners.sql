-- Owner-only. Partner rows with their lead counts and the assessments they
-- can be given links for. Counting leads here (rather than in a second
-- call) keeps the console's partner screen to one round trip.
SELECT p.id, p.ref_code, p.display_name, p.role, p.is_active, p.created_at,
       u.email,
       COALESCE(l.lead_count, 0)::int AS lead_count,
       l.last_lead_at
  FROM gt_partner p
  JOIN vn_users u ON u.id = p.user_id
  LEFT JOIN (
        SELECT partner_id, count(*) AS lead_count, max(created_at) AS last_lead_at
          FROM gt_lead
         WHERE tenant_id = $tenant_id AND is_live = $is_live
         GROUP BY partner_id
       ) l ON l.partner_id = p.id
 WHERE p.tenant_id = $tenant_id
   AND p.role = 'partner'
 ORDER BY p.is_active DESC, p.display_name
