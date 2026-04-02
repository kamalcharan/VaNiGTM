-- ============================================================================
-- VaNiBase Migration: 003_vn_invitations.sql
-- ============================================================================
-- Scope: Team invitation system for multi-tenant onboarding
-- Tables: VN_invitations
-- Depends on: 001_vn_foundation.sql (VN_tenants, VN_users must exist)
-- ============================================================================
-- Version: 1.0.0
-- Date: March 2026
-- Vikuna Technologies — Confidential
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. VN_invitations — Team member invitations per tenant
-- ────────────────────────────────────────────────────────────────────────────
-- Tracks invitations sent by tenant admins/owners to new team members.
-- token_hash stores a hashed version of the invite token sent via email.
-- Status lifecycle: pending → accepted | revoked | expired

CREATE TABLE VN_invitations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES VN_tenants(id) ON DELETE CASCADE,
    invited_by      UUID NOT NULL REFERENCES VN_users(id) ON DELETE CASCADE,
    email           VARCHAR(255) NOT NULL,
    role_id         VARCHAR(50) NOT NULL DEFAULT 'user',
    token_hash      VARCHAR(255) NOT NULL UNIQUE,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
    expires_at      TIMESTAMPTZ NOT NULL,
    accepted_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invitations_token ON VN_invitations (token_hash);
CREATE INDEX idx_invitations_tenant ON VN_invitations (tenant_id, status);

COMMENT ON TABLE VN_invitations IS 'Team member invitations. An admin/owner invites a user by email with a specific role. Token is hashed for security.';

-- ────────────────────────────────────────────────────────────────────────────
-- Record this migration
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO VN_migrations (filename, checksum, applied_by, notes) VALUES
    ('003_vn_invitations.sql', md5('003_vn_invitations_v1.0.0'), 'manual',
     'Invitations: team member invitation system with token-based acceptance')
ON CONFLICT (filename) DO NOTHING;

COMMIT;

-- ============================================================================
-- Post-migration verification queries (run manually to verify)
-- ============================================================================
-- SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'vn_%' ORDER BY table_name;
-- SELECT * FROM VN_migrations ORDER BY applied_at;
