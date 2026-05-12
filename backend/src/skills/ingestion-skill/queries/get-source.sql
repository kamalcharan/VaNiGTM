-- Fetch a single kb_source by id with its agent run status joined.
-- Returns NULL run_* columns when no run is linked yet (source still pending).

SELECT
  s.id,
  s.source_type,
  s.display_name,
  s.gdrive_file_id,
  s.gdrive_modified_at,
  s.status,
  s.chunk_count,
  s.node_count,
  s.error_msg,
  s.raw_text,
  s.created_at,
  s.updated_at,
  r.status        AS run_status,
  r.steps         AS run_steps,
  r.error_trace   AS run_error
FROM gt_kb_sources s
LEFT JOIN gt_agent_runs r ON r.id = s.source_run_id
WHERE s.id        = $source_id
  AND s.tenant_id = $tenant_id;
