-- Migration 030: Add demographic fields to ki_contacts
--
-- age, city, marital_status, dependents_count captured during:
--   (a) Intake wizard Step 0 — cold lead fills "about yourself"
--   (b) MFD "Add Contact" drawer — MFD fills on behalf of contact
-- All fields optional — not required for basic contact creation.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ki_contacts' AND column_name = 'age'
  ) THEN
    ALTER TABLE ki_contacts ADD COLUMN age SMALLINT;
    COMMENT ON COLUMN ki_contacts.age IS 'Age in years at time of data capture.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ki_contacts' AND column_name = 'city'
  ) THEN
    ALTER TABLE ki_contacts ADD COLUMN city VARCHAR(100);
    COMMENT ON COLUMN ki_contacts.city IS 'City the contact lives in.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ki_contacts' AND column_name = 'marital_status'
  ) THEN
    ALTER TABLE ki_contacts
      ADD COLUMN marital_status VARCHAR(20)
        CHECK (marital_status IN ('single', 'married', 'family', 'other'));
    COMMENT ON COLUMN ki_contacts.marital_status IS 'single / married / family (married with kids) / other.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ki_contacts' AND column_name = 'dependents_count'
  ) THEN
    ALTER TABLE ki_contacts ADD COLUMN dependents_count SMALLINT;
    COMMENT ON COLUMN ki_contacts.dependents_count IS 'Number of financial dependents (0–10+).';
  END IF;
END;
$$;
