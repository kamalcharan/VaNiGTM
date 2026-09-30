-- Unclaimed sessions past their expiry, then reads no session points at that
-- are older than the reuse window. Run on every new submission (no scheduler
-- yet — ARCH §6a). $1 int reuse hours
WITH gone AS (
  DELETE FROM vani_anon_session WHERE bound_at IS NULL AND expires_at < now() RETURNING 1
)
DELETE FROM vani_anon_site_read r
 WHERE r.created_at < now() - make_interval(hours => $1)
   AND NOT EXISTS (SELECT 1 FROM vani_anon_session s WHERE s.site_read_id = r.id);
