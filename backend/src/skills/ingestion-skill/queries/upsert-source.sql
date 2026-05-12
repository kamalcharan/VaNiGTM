-- Upsert a kb_source by (tenant_id, gdrive_file_id).
--
-- For Drive-sourced files: when the same file is re-ingested (folder sync
-- detects a modifiedTime change), the existing row is reset to 'pending'
-- so the ingestion-skill re-processes it. display_name and modified_at
-- are refreshed from the latest Drive metadata.
--
-- For non-Drive sources (URL / direct upload / conversation), gdrive_file_id
-- is NULL → the partial unique index does not apply → ON CONFLICT skipped →
-- a fresh row is inserted on every call (caller controls deduplication).
--
-- REQUIRES migration 183 to add the UNIQUE partial index:
--   CREATE UNIQUE INDEX idx_gt_kb_sources_tenant_gdrive_file_unique
--     ON gt_kb_sources (tenant_id, gdrive_file_id)
--     WHERE gdrive_file_id IS NOT NULL;
-- Without it, the ON CONFLICT clause fails with 42P10 at runtime.

INSERT INTO gt_kb_sources (
  tenant_id,
  source_type,
  display_name,
  gdrive_file_id,
  gdrive_modified_at,
  url,
  status
)
VALUES (
  $tenant_id,
  $source_type,
  $display_name,
  $gdrive_file_id,
  $gdrive_modified_at,
  $url,
  'pending'
)
ON CONFLICT (tenant_id, gdrive_file_id)
  WHERE gdrive_file_id IS NOT NULL
DO UPDATE SET
  display_name       = EXCLUDED.display_name,
  gdrive_modified_at = EXCLUDED.gdrive_modified_at,
  status             = 'pending',
  updated_at         = NOW()
RETURNING *;
