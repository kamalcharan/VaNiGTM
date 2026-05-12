-- Migration 029: Add is_live to ki_intake_tokens
--
-- Intake tokens need to carry the environment context (live vs sandbox)
-- of the MFD who generated them, so that snapshot submissions are saved
-- to the correct environment and visible when the MFD views the contact.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ki_intake_tokens'
      AND column_name = 'is_live'
  ) THEN
    ALTER TABLE ki_intake_tokens
      ADD COLUMN is_live BOOLEAN NOT NULL DEFAULT true;
    COMMENT ON COLUMN ki_intake_tokens.is_live
      IS 'Environment of the MFD who generated the token. TRUE = live, FALSE = sandbox. Propagated to contact + snapshot on submission.';
  END IF;
END;
$$;
