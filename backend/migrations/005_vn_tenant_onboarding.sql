-- ============================================================================
-- VaNiBase Migration: 005_vn_tenant_onboarding.sql
-- ============================================================================
-- Scope: Tenant onboarding step tracking
-- Tables: VN_tenant_onboarding
-- Depends on: 001_vn_foundation.sql (VN_tenants must exist)
-- ============================================================================
-- Version: 1.0.0
-- Date: March 2026
-- Vikuna Technologies — Confidential
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. VN_tenant_onboarding — Onboarding step completion per tenant
-- ────────────────────────────────────────────────────────────────────────────
-- Tracks which onboarding steps a tenant has completed.
-- step_id is a convention-based identifier (e.g. 'profile', 'invite_team',
-- 'first_conversation'). Products can define their own steps.

CREATE TABLE VN_tenant_onboarding (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES VN_tenants(id) ON DELETE CASCADE,
    step_id         VARCHAR(50) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'completed')),
    completed_at    TIMESTAMPTZ,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT vn_tenant_onboarding_unique UNIQUE (tenant_id, step_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_onboarding_tenant ON VN_tenant_onboarding (tenant_id);

COMMENT ON TABLE VN_tenant_onboarding IS 'Tracks onboarding step completion per tenant. Products define their own step_id conventions.';

-- ────────────────────────────────────────────────────────────────────────────
-- Record this migration
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO VN_migrations (filename, checksum, applied_by, notes) VALUES
    ('005_vn_tenant_onboarding.sql', md5('005_vn_tenant_onboarding_v1.0.0'), 'manual',
     'Tenant onboarding: step-based onboarding progress tracking')
ON CONFLICT (filename) DO NOTHING;

COMMIT;

-- ============================================================================
-- Post-migration verification queries (run manually to verify)
-- ============================================================================
-- SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'vn_%' ORDER BY table_name;
-- SELECT * FROM VN_migrations ORDER BY applied_at;
