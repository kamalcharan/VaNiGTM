-- Migration 024: Fix created_by_user_id column type in snapshot tables
--
-- Problem: vn_users.id is UUID but ki_intake_tokens.created_by_user_id
-- and ki_contact_snapshots.created_by_user_id were declared as INTEGER.
-- This causes "invalid input syntax for type integer" when ctx.user_id
-- (a UUID from the JWT) is passed on snapshot save.
--
-- Fix: Drop and re-add as UUID. Safe for dev — these tables are empty
-- at this stage. IF EXISTS guards skip if table was never created.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ki_intake_tokens'
      AND column_name = 'created_by_user_id'
  ) THEN
    ALTER TABLE ki_intake_tokens DROP COLUMN created_by_user_id;
    ALTER TABLE ki_intake_tokens ADD  COLUMN created_by_user_id UUID NOT NULL DEFAULT gen_random_uuid();
    ALTER TABLE ki_intake_tokens ALTER COLUMN created_by_user_id DROP DEFAULT;
    COMMENT ON COLUMN ki_intake_tokens.created_by_user_id
      IS 'FK to vn_users.id (UUID). Not enforced — cross-schema.';
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ki_contact_snapshots'
      AND column_name = 'created_by_user_id'
  ) THEN
    ALTER TABLE ki_contact_snapshots DROP COLUMN created_by_user_id;
    ALTER TABLE ki_contact_snapshots ADD  COLUMN created_by_user_id UUID;
    COMMENT ON COLUMN ki_contact_snapshots.created_by_user_id
      IS 'FK to vn_users.id (UUID). Not enforced — cross-schema.';
  END IF;
END;
$$;
