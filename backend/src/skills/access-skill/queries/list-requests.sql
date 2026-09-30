-- Access requests: leads with at least one 'access_requested' event (262),
-- each with its LATEST request and how many times the person asked.
-- Named params: $tenant_id, $is_live, $limit
SELECT l.id AS lead_id, l.lead_no, l.name, l.email, l.company, l.role_title, l.status,
       e.payload->>'country_code' AS country_code,
       e.payload->>'mobile'       AS mobile,
       e.payload->>'site'         AS site,
       e.payload->>'consent_text' AS consent_text,
       e.created_at               AS requested_at,
       n.times_asked
  FROM gt_lead l
  JOIN LATERAL (
        SELECT payload, created_at FROM gt_lead_event
         WHERE tenant_id = l.tenant_id AND lead_id = l.id AND event_type = 'access_requested'
         ORDER BY created_at DESC LIMIT 1) e ON true
  JOIN LATERAL (
        SELECT count(*)::int AS times_asked FROM gt_lead_event
         WHERE tenant_id = l.tenant_id AND lead_id = l.id AND event_type = 'access_requested') n ON true
 WHERE l.tenant_id = $tenant_id AND l.is_live = $is_live
 ORDER BY e.created_at DESC
 LIMIT $limit
