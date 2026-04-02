-- ============================================================================
-- VaNiBase Migration: 007_vn_schema_updates.sql
-- ============================================================================
-- Scope: Schema type changes and additions to existing tables
-- Alters: VN_users (avatar_url type), VN_tenant_profiles (logo_url type, theme_id)
-- Depends on: 001_vn_foundation.sql
-- ============================================================================
-- Version: 1.0.0
-- Date: March 2026
-- Vikuna Technologies — Confidential
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. VN_users — Change avatar_url from TEXT to VARCHAR(500)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE VN_users ALTER COLUMN avatar_url TYPE VARCHAR(500);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. VN_tenant_profiles — Change logo_url from TEXT to VARCHAR(500), add theme_id
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE VN_tenant_profiles ALTER COLUMN logo_url TYPE VARCHAR(500);
ALTER TABLE VN_tenant_profiles ADD COLUMN IF NOT EXISTS theme_id VARCHAR(50) NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- Record this migration
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO VN_migrations (filename, checksum, applied_by, notes) VALUES
    ('007_vn_schema_updates.sql', md5('007_vn_schema_updates_v1.0.0'), 'manual',
     'Schema updates: avatar_url on users, logo_url and theme_id on tenant_profiles')
ON CONFLICT (filename) DO NOTHING;

COMMIT;

-- ============================================================================
-- Post-migration verification queries (run manually to verify)
-- ============================================================================
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'vn_users' AND column_name = 'avatar_url';
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'vn_tenant_profiles' AND column_name IN ('logo_url', 'theme_id');
-- SELECT * FROM VN_migrations ORDER BY applied_at;
