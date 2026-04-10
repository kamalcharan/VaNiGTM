-- Migration 031: Add intake_code to vn_users
--
-- Each user gets a permanent 8-char hex code used in their personal
-- intake URL: /intake/u/[intake_code]
-- Allows contacts to know which team member referred them.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vn_users' AND column_name = 'intake_code'
  ) THEN
    ALTER TABLE vn_users
      ADD COLUMN intake_code VARCHAR(12) UNIQUE;

    -- Populate existing users with a unique code
    UPDATE vn_users
    SET intake_code = substring(encode(gen_random_bytes(5), 'hex'), 1, 8)
    WHERE intake_code IS NULL;

    -- Make NOT NULL after populating
    ALTER TABLE vn_users ALTER COLUMN intake_code SET NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_vn_users_intake_code ON vn_users(intake_code);

    COMMENT ON COLUMN vn_users.intake_code IS
      '8-char hex code for permanent intake URL: /intake/u/[intake_code]. Never changes.';
  END IF;
END;
$$;
