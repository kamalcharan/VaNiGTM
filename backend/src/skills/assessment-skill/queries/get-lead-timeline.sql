SELECT event_type, payload, created_by, created_at
  FROM gt_lead_event
 WHERE tenant_id = $tenant_id AND is_live = $is_live
   AND lead_id = $lead_id
 ORDER BY created_at ASC
