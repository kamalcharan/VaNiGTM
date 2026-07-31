UPDATE gt_lead
   SET status = $status, updated_at = now()
 WHERE tenant_id = $tenant_id AND is_live = $is_live
   AND id = $lead_id
   AND ($partner_id::uuid IS NULL OR partner_id = $partner_id::uuid)
RETURNING id, status
