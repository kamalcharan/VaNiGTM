-- New reads this IP started in the last hour. $1 text ip hash
SELECT count(*)::int AS n
  FROM vani_anon_session
 WHERE ip_hash = $1 AND started_read AND created_at > now() - interval '1 hour';
