-- Blocks in force for a set of fingerprints, as seen by the current tenant.
-- $1 text[]  fingerprints (the person's identifiers + their email domains)
-- $2 text    channel being contacted
-- $3 text    agent code
--
-- Every block is its own history, keyed by (scope, agent scope, channel,
-- fingerprint); the LATEST row of each history decides. A tenant-scope lift
-- therefore never lifts a platform-wide bounce, and a lift on one channel
-- never lifts an 'all' block. RLS already limits rows to this tenant's and
-- platform-wide ones; the tenant predicate below is the second layer.
WITH latest AS (
  SELECT DISTINCT ON (COALESCE(tenant_id::text, 'platform'), COALESCE(agent_code, '*'),
                      channel, identifier_hash)
         tenant_id, agent_code, channel, identifier_kind, action, reason, source, at
    FROM vani_suppression
   WHERE identifier_hash = ANY($1::text[])
     AND channel IN ($2, 'all')
     AND (agent_code IS NULL OR agent_code = $3)
     AND (tenant_id = vani_current_tenant() OR tenant_id IS NULL)
   ORDER BY COALESCE(tenant_id::text, 'platform'), COALESCE(agent_code, '*'),
            channel, identifier_hash, at DESC, id DESC
)
SELECT tenant_id IS NULL AS platform_wide, agent_code, channel, identifier_kind, reason, source, at
  FROM latest
 WHERE action = 'suppress'
 ORDER BY at DESC;
