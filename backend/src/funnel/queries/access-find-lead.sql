-- The lead this email already is, so asking twice adds an event instead of a
-- second lead. $1 tenant · $2 email
SELECT id, lead_no
  FROM gt_lead
 WHERE tenant_id = $1 AND is_live = true AND lower(email) = lower($2)
 ORDER BY created_at
 LIMIT 1;
