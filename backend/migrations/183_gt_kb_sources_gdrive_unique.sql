-- Drop redundant non-unique index from mig 182.
-- The unique partial index below covers the same lookups
-- and adds the constraint. No need for both.
DROP INDEX IF EXISTS idx_gt_kb_sources_tenant_gdrive_file;

-- Unique partial index — required for ON CONFLICT in upsert-source.sql.
CREATE UNIQUE INDEX IF NOT EXISTS idx_gt_kb_sources_gdrive_unique
  ON gt_kb_sources (tenant_id, gdrive_file_id)
  WHERE gdrive_file_id IS NOT NULL;
