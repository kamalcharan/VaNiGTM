-- One visitor's session and the read it points at. $1 text token hash.
-- Never selects page_text: it is not shown to anyone.
SELECT s.id AS session_id, s.site_read_id, s.bound_tenant_id, s.bound_at, s.expires_at,
       (s.bound_at IS NULL AND s.expires_at < now()) AS expired,
       r.website_host, r.website_url, r.status, r.failure, r.draft, r.created_at AS read_created_at,
       r.finished_at
  FROM vani_anon_session s
  JOIN vani_anon_site_read r ON r.id = s.site_read_id
 WHERE s.token_hash = $1;
