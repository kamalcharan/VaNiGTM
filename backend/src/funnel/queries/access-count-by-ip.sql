-- Access requests one IP made in the last hour (the same per-IP ceiling as
-- new site reads). Runs in the leads tenant's context. $1 tenant · $2 ip hash
SELECT count(*)::int AS n
  FROM gt_lead_event
 WHERE tenant_id = $1 AND event_type = 'access_requested'
   AND payload->>'ip_hash' = $2
   AND created_at > now() - interval '1 hour';
