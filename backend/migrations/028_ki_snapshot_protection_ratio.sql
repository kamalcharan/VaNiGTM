-- Migration 028: Add calc_protection_ratio_pct to ki_contact_snapshots
--
-- This calc column was referenced in the intake submit INSERT but was
-- never added to the table definition in migration 021.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ki_contact_snapshots'
      AND column_name = 'calc_protection_ratio_pct'
  ) THEN
    ALTER TABLE ki_contact_snapshots
      ADD COLUMN calc_protection_ratio_pct NUMERIC(7,2);
    COMMENT ON COLUMN ki_contact_snapshots.calc_protection_ratio_pct
      IS 'Life cover as % of annual income (life_cover / monthly_income * 12 * 100).';
  END IF;
END;
$$;
