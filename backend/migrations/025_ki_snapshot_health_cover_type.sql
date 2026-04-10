-- Migration 025: Add health_cover_type to ki_snapshot_protection
--
-- health_cover_type ('individual', 'family_floater', 'employer', 'none')
-- was captured in the frontend but never stored — column was missing.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'ki_snapshot_protection'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ki_snapshot_protection'
      AND column_name = 'health_cover_type'
  ) THEN
    ALTER TABLE ki_snapshot_protection
      ADD COLUMN health_cover_type VARCHAR(20)
        CHECK (health_cover_type IN ('individual', 'family_floater', 'employer', 'none'));
    COMMENT ON COLUMN ki_snapshot_protection.health_cover_type
      IS 'Type of health insurance: individual, family_floater, employer, or none.';
  END IF;
END;
$$;
