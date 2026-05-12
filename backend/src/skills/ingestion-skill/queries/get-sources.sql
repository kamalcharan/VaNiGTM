-- List all knowledge sources for a tenant, most recent first.
-- raw_text is omitted here (potentially large) — use get-source.sql when
-- the caller needs the full extracted text.

SELECT
  id,
  source_type,
  display_name,
  gdrive_file_id,
  gdrive_modified_at,
  status,
  chunk_count,
  node_count,
  error_msg,
  created_at,
  updated_at
FROM gt_kb_sources
WHERE tenant_id = $tenant_id
ORDER BY created_at DESC
LIMIT $limit OFFSET $offset;
