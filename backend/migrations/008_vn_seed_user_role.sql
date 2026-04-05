-- ============================================================================
-- VaNiBase Migration: 008_vn_seed_user_role.sql
-- ============================================================================
-- Scope: Seed the default 'user' role for invited team members
-- Depends on: 001_vn_foundation.sql (VN_roles must exist)
-- ============================================================================
-- Version: 1.0.0
-- Date: March 2026
-- Vikuna Technologies — Confidential
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- Seed: User Role (default for invited team members)
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO VN_roles (id, tenant_id, code, name, description, is_system, sort_order) VALUES
    ('00000000-0000-0000-0000-000000000004', NULL, 'user', 'User',
     'Default role for invited team members.',
     false, 4)
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- Record this migration
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO VN_migrations (filename, checksum, applied_by, notes) VALUES
    ('008_vn_seed_user_role.sql', md5('008_vn_seed_user_role_v1.0.0'), 'manual',
     'Seed: user role for invited team members')
ON CONFLICT (filename) DO NOTHING;

COMMIT;

-- ============================================================================
-- Post-migration verification queries (run manually to verify)
-- ============================================================================
-- SELECT * FROM VN_roles WHERE code = 'user';
-- SELECT * FROM VN_migrations ORDER BY applied_at;
