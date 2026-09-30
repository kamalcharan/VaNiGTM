-- The job takes the read. Only a queued read is taken, so a retried or
-- duplicate event never reads twice. $1 read id
UPDATE vani_anon_site_read SET status = 'reading'
 WHERE id = $1 AND status = 'queued'
RETURNING website_url, website_host;
