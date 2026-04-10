-- ============================================================================
-- Migration 040: Backfill ki_clients risk_profile from tenant settings
--
-- default_risk_profile is stored in vn_tenant_profiles.settings JSONB
-- (set during onboarding via PATCH /auth/preferences).
--
-- This backfill applies the tenant's default to all ki_clients rows that
-- currently have risk_profile IS NULL, for tenants that have set a default.
-- ============================================================================

UPDATE ki_clients kc
SET    risk_profile = tp.settings->>'default_risk_profile',
       updated_at   = now()
FROM   vn_tenant_profiles tp
WHERE  tp.tenant_id                             = kc.tenant_id
  AND  kc.risk_profile                          IS NULL
  AND  tp.settings->>'default_risk_profile'     IS NOT NULL
  AND  tp.settings->>'default_risk_profile'     IN ('conservative', 'moderate', 'aggressive');
