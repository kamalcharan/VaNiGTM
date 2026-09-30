-- The tenant's knowledge source for the site: the same row submit_url makes,
-- 'pending' so the normal ingestion does the full crawl. RLS applies (the
-- claiming tenant's context is set). $1 tenant · $2 url · $3 display name
WITH existing AS (
  UPDATE gt_kb_sources SET status = 'pending', error_msg = NULL, updated_at = now()
   WHERE tenant_id = $1 AND source_type = 'url' AND url = $2
  RETURNING id
), inserted AS (
  INSERT INTO gt_kb_sources (tenant_id, source_type, display_name, url, status)
  SELECT $1, 'url', $3, $2, 'pending'
   WHERE NOT EXISTS (SELECT 1 FROM existing)
  RETURNING id
)
SELECT id FROM existing UNION ALL SELECT id FROM inserted;
