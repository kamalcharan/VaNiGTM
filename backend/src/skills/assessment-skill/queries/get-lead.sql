SELECT l.id, l.lead_no, l.name, l.email, l.company, l.role_title, l.phone, l.status,
       l.created_at, l.updated_at,
       p.display_name AS partner_name,
       r.id AS response_id, r.health_score, r.band, r.top_modes, r.answers,
       r.started_at, r.completed_at
  FROM gt_lead l
  LEFT JOIN gt_partner p ON p.id = l.partner_id
  LEFT JOIN gt_assessment_response r ON r.lead_id = l.id
 WHERE l.tenant_id = $tenant_id AND l.is_live = $is_live
   AND l.id = $lead_id
   AND ($partner_id::uuid IS NULL OR l.partner_id = $partner_id::uuid)
