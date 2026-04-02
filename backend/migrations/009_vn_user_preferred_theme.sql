-- ============================================================================
-- VaNiBase Migration: 009_vn_user_preferred_theme.sql
-- ============================================================================
-- Scope: Add preferred_theme column to VN_users
-- Depends on: 001_vn_foundation.sql (VN_users must exist)
-- ============================================================================
-- Version: 1.0.0
-- Date: March 2026
-- Vikuna Technologies — Confidential
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- Add preferred_theme to VN_users
-- Stores user's selected theme slug (e.g., 'bharathavarsha', 'techy-simple')
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE VN_users ADD COLUMN IF NOT EXISTS preferred_theme VARCHAR(50) DEFAULT NULL;

COMMENT ON COLUMN VN_users.preferred_theme IS 'User preferred theme slug — overrides tenant default when set';

-- ────────────────────────────────────────────────────────────────────────────
-- Record this migration
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO VN_migrations (filename, checksum, applied_by, notes) VALUES
    ('009_vn_user_preferred_theme.sql', md5('009_vn_user_preferred_theme_v1.0.0'), 'manual',
     'Add preferred_theme column to VN_users for user-level theme persistence')
ON CONFLICT (filename) DO NOTHING;

COMMIT;

-- ============================================================================
-- Post-migration verification queries (run manually to verify)
-- ============================================================================
-- SELECT column_name, data_type, character_maximum_length, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'vn_users' AND column_name = 'preferred_theme';
-- SELECT * FROM VN_migrations WHERE filename = '009_vn_user_preferred_theme.sql';
