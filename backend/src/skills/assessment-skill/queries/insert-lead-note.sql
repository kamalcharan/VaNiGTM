INSERT INTO gt_lead_event (tenant_id, assessment_response_id, lead_id, event_type, payload, created_by)
SELECT $tenant_id, r.id, $lead_id, 'note', $payload::jsonb, $created_by
  FROM gt_assessment_response r
 WHERE r.lead_id = $lead_id
   AND EXISTS (
     SELECT 1 FROM gt_lead l
      WHERE l.id = $lead_id AND l.tenant_id = $tenant_id AND l.is_live = $is_live
        AND ($partner_id::uuid IS NULL OR l.partner_id = $partner_id::uuid)
   )
RETURNING id, created_at
