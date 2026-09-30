-- One tenant-scope suppression event. clock_timestamp(), not now(): a suppress
-- and a lift in one transaction must still order correctly.
INSERT INTO vani_suppression
  (tenant_id, agent_code, channel, identifier_kind, identifier_hash,
   action, reason, source, actor_type, actor_id, at)
SELECT vani_current_tenant(), $1, $2, $3, $4, $5, $6, $7, $8, $9, clock_timestamp()
 WHERE vani_current_tenant() IS NOT NULL
RETURNING id;
