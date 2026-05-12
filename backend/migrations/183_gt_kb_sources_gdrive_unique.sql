-- Add unique partial index on (tenant_id, gdrive_file_id)
-- Required for ON CONFLICT in upsert-source.sql.
-- Partial: only applies where gdrive_file_id IS NOT NULL
-- (URL and conversation sources have NULL gdrive_file_id — no conflict needed there).

CREATE UNIQUE INDEX IF NOT EXISTS idx_gt_kb_sources_gdrive_unique
  ON gt_kb_sources (tenant_id, gdrive_file_id)
  WHERE gdrive_file_id IS NOT NULL;
