-- $1 read id · $2 public failure text · $3 run id
UPDATE vani_anon_site_read SET status = 'failed', failure = $2, run_id = $3, finished_at = now()
 WHERE id = $1;
