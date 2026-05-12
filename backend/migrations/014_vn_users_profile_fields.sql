-- ════════════════════════════════════════════════════════════════════════════
-- 014_vn_users_profile_fields.sql
-- Adds profile fields to vn_users that the /api/v1/auth/me handler and
-- profile-update endpoint reference but the schema was missing:
--   - designation (job title)
--   - bio         (short user description)
-- Idempotent (IF NOT EXISTS).
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

ALTER TABLE vn_users ADD COLUMN IF NOT EXISTS designation VARCHAR(150);
ALTER TABLE vn_users ADD COLUMN IF NOT EXISTS bio         TEXT;

COMMENT ON COLUMN vn_users.designation IS 'Job title / role in the organization (free text). Used on profile display.';
COMMENT ON COLUMN vn_users.bio         IS 'Short user-authored description. Optional. Markdown not parsed — plain text only.';

COMMIT;
