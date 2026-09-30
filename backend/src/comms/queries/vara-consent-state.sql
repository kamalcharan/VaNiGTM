-- The consent a Vara candidate is contacted under. $1 uuid candidate id.
SELECT cand.id,
       cand.current_consent_id,
       cand.retention_until,
       c.withdrawn_at
  FROM vara_candidate cand
  LEFT JOIN vara_consent c ON c.id = cand.current_consent_id
 WHERE cand.id = $1
   AND cand.tenant_id = vani_current_tenant();
