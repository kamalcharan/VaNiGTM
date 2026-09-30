-- A request already recorded under this key (store-and-replay, vani-app
-- CLAUDE.md §2). The key is hashed with the email, so two visitors whose
-- browsers minted the same key never replay each other. $1 tenant · $2 request key
SELECT l.lead_no
  FROM gt_lead_event e
  JOIN gt_lead l ON l.id = e.lead_id AND l.tenant_id = e.tenant_id
 WHERE e.tenant_id = $1 AND e.event_type = 'access_requested'
   AND e.payload->>'request_key' = $2
 LIMIT 1;
