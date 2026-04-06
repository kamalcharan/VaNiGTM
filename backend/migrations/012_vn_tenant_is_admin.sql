-- ============================================================================
-- Migration: 012_vn_tenant_is_admin.sql
-- Purpose:   Add is_admin flag to vn_tenants
--
-- is_admin = true  → tenant has admin privileges (alias deletion, future admin ops)
-- is_admin = false → regular tenant (default)
--
-- Deliberately on vn_tenants (not vn_users) — admin is a tenant-level privilege,
-- not a per-user role. One tenant account = one admin flag.
-- ============================================================================

ALTER TABLE vn_tenants ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN vn_tenants.is_admin IS
'Admin flag. true = this tenant has admin privileges (e.g. alias deletion).
 Set manually by the platform operator. Default false for all tenants.';

DO $$ BEGIN
  RAISE NOTICE '✓ 012_vn_tenant_is_admin: is_admin column added to vn_tenants (default false)';
END $$;
