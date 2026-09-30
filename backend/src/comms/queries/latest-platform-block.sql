-- Is there a platform-wide block in force on this fingerprint? (A tenant can
-- see these but never lift them — only a platform operator can.)
-- $1 text fingerprint · $2 text channel
SELECT action, reason
  FROM vani_suppression
 WHERE tenant_id IS NULL AND identifier_hash = $1 AND channel IN ($2, 'all')
 ORDER BY at DESC, id DESC
 LIMIT 1;
