-- The session to claim, locked for the claim transaction. $1 token hash
SELECT s.id, s.bound_tenant_id, (s.bound_at IS NULL AND s.expires_at < now()) AS expired,
       r.website_host, r.website_url, r.status, r.draft, r.graph
  FROM vani_anon_session s
  JOIN vani_anon_site_read r ON r.id = s.site_read_id
 WHERE s.token_hash = $1
   FOR UPDATE OF s;
