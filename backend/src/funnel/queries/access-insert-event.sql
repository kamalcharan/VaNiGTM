-- The request itself: what was read, how to reach them, and the exact words
-- they agreed to. No assessment behind it (262). $1 tenant · $2 lead · $3 payload
INSERT INTO gt_lead_event (tenant_id, is_live, lead_id, event_type, payload)
VALUES ($1, true, $2, 'access_requested', $3::jsonb);
