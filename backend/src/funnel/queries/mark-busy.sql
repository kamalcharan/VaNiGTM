-- The daily cap is already spent: fail the queued read now so nobody waits. $1 read id · $2 message
UPDATE vani_anon_site_read SET status = 'failed', failure = $2, finished_at = now()
 WHERE id = $1 AND status = 'queued';
