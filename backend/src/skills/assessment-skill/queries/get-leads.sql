SELECT l.id, l.lead_no, l.name, l.email, l.company, l.role_title, l.status,
       l.created_at, l.updated_at,
       p.display_name AS partner_name,
       r.id AS response_id, r.health_score, r.band
  FROM gt_lead l
  LEFT JOIN gt_partner p ON p.id = l.partner_id
  LEFT JOIN gt_assessment_response r ON r.lead_id = l.id
 WHERE l.tenant_id = $tenant_id AND l.is_live = $is_live
   AND ($partner_id::uuid IS NULL OR l.partner_id = $partner_id::uuid)
   AND ($status::text IS NULL OR l.status = $status::text)
 ORDER BY l.created_at DESC
 LIMIT $limit OFFSET $offset
