-- The latest row of ONE tenant-scope block history, for a lift.
-- $1 text fingerprint · $2 text channel · $3 text agent code or NULL (= every agent)
SELECT action, reason, at
  FROM vani_suppression
 WHERE tenant_id = vani_current_tenant()
   AND identifier_hash = $1
   AND channel = $2
   AND agent_code IS NOT DISTINCT FROM $3
 ORDER BY at DESC, id DESC
 LIMIT 1;
