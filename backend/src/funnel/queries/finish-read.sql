-- $1 read id · $2 page text · $3 draft json · $4 run id · $5 audit json · $6 graph json (262)
UPDATE vani_anon_site_read
   SET status = 'read', page_text = $2, draft = $3::jsonb, run_id = $4,
       audit = $5::jsonb, graph = $6::jsonb, finished_at = now()
 WHERE id = $1;
