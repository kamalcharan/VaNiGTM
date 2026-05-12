-- Migration 027: Make asset_type_id nullable in ki_snapshot_assets
--
-- The intake wizard uses free-text asset descriptions ("What is it?") instead
-- of a type dropdown. asset_type_id should be optional — the description is
-- the primary identifier for the asset.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ki_snapshot_assets'
      AND column_name = 'asset_type_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE ki_snapshot_assets
      ALTER COLUMN asset_type_id DROP NOT NULL;
    COMMENT ON COLUMN ki_snapshot_assets.asset_type_id
      IS 'Optional FK to ki_asset_types.id. NULL when asset was entered via free-text description.';
  END IF;
END;
$$;
