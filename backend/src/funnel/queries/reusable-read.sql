-- The read a new visitor for this host can share, if any: a successful read
-- inside the reuse window, or one still running inside the read timeout.
-- $1 text host · $2 int reuse hours · $3 int read-timeout minutes
SELECT id, status
  FROM vani_anon_site_read
 WHERE website_host = $1
   AND ((status = 'read' AND finished_at > now() - make_interval(hours => $2))
     OR (status IN ('queued','reading') AND created_at > now() - make_interval(mins => $3)))
 ORDER BY (status = 'read') DESC, created_at DESC
 LIMIT 1;
