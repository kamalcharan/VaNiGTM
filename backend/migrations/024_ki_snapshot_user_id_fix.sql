-- Migration 024: Fix created_by_user_id column type in snapshot tables
--
-- Problem: vn_users.id is UUID but ki_intake_tokens.created_by_user_id
-- and ki_contact_snapshots.created_by_user_id were declared as INTEGER.
-- This causes "invalid input syntax for type integer" when ctx.user_id
-- (a UUID from the JWT) is passed on snapshot save.
--
-- Fix: ALTER both columns to UUID, matching vn_users.id.

-- Table: ki_intake_tokens — created_by_user_id INTEGER → UUID
ALTER TABLE ki_intake_tokens
  ALTER COLUMN created_by_user_id TYPE UUID USING NULL;

-- Table: ki_contact_snapshots — created_by_user_id INTEGER → UUID
ALTER TABLE ki_contact_snapshots
  ALTER COLUMN created_by_user_id TYPE UUID USING NULL;

COMMENT ON COLUMN ki_intake_tokens.created_by_user_id     IS 'FK to vn_users.id (UUID). Not enforced — cross-schema.';
COMMENT ON COLUMN ki_contact_snapshots.created_by_user_id IS 'FK to vn_users.id (UUID). Not enforced — cross-schema.';
