-- ============================================================
-- KI-Prime Migration 003: Create set_tenant_context + fix onboarding
--
-- Bug 1: set_tenant_context() function missing from ki_prime_db
-- Bug 2: VN_tenant_onboarding rows may be missing for existing tenants,
--         causing isOnboardingComplete() to return true (0 pending = complete)
-- ============================================================

-- 1. Create set_tenant_context function for RLS/tenant isolation
CREATE OR REPLACE FUNCTION set_tenant_context(p_tenant_id TEXT)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.current_tenant_id', p_tenant_id, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION set_tenant_context(TEXT) IS 'Sets PostgreSQL session variable for tenant isolation. Called by VaNiBase on each DB checkout.';

-- 2. Seed mandatory onboarding steps for any tenant missing them
-- This catches tenants where seedOnboardingSteps() failed during registration
INSERT INTO VN_tenant_onboarding (tenant_id, step_id, status, metadata)
SELECT t.id, s.step_id, 'pending', '{}'::jsonb
FROM VN_tenants t
CROSS JOIN (VALUES ('user_profile'), ('business_profile')) AS s(step_id)
WHERE NOT EXISTS (
  SELECT 1 FROM VN_tenant_onboarding o
  WHERE o.tenant_id = t.id AND o.step_id = s.step_id
)
ON CONFLICT (tenant_id, step_id) DO NOTHING;

-- 3. Record migration
INSERT INTO VN_migrations (filename, checksum, applied_by, notes)
VALUES ('103_ki_set_tenant_context.sql', md5('003_ki_set_tenant_context_v1.0.0'), 'manual',
        'KI-Prime: Create set_tenant_context() + seed missing onboarding steps')
ON CONFLICT (filename) DO NOTHING;
