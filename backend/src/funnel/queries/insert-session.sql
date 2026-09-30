-- $1 token hash · $2 read id · $3 ip hash · $4 started a new read · $5 session days
INSERT INTO vani_anon_session (token_hash, site_read_id, ip_hash, started_read, expires_at)
VALUES ($1, $2, $3, $4, now() + make_interval(days => $5))
RETURNING id;
