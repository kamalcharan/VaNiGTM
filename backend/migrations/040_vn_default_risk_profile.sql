-- ============================================================================
-- Migration 040: Add default_risk_profile to vn_tenant_profiles
--
-- Purpose:
--   During onboarding, the MFD sets their default risk profile for clients.
--   This needs to be stored and applied automatically when:
--     (a) a client is imported via the customer import pipeline
--     (b) a prospect contact is converted to a client with no snapshot risk
--
-- Changes:
--   1. Add default_risk_profile column to vn_tenant_profiles
--   2. Backfill ki_clients: any row with risk_profile IS NULL gets the tenant's
--      default_risk_profile (if the tenant has set one)
-- ============================================================================

-- 1. Add the column
ALTER TABLE vn_tenant_profiles
    ADD COLUMN IF NOT EXISTS default_risk_profile VARCHAR(20)
        CHECK (default_risk_profile IN ('conservative', 'moderate', 'aggressive'));

COMMENT ON COLUMN vn_tenant_profiles.default_risk_profile IS
    'Tenant-level default risk profile applied to clients when none is specified. '
    'Set during onboarding (preferences step). Values: conservative | moderate | aggressive.';


-- 2. Backfill: clients with no risk_profile → use their tenant's default
--    Only updates rows where the tenant has a non-null default set.
UPDATE ki_clients kc
SET    risk_profile = tp.default_risk_profile,
       updated_at   = now()
FROM   vn_tenant_profiles tp
WHERE  tp.tenant_id              = kc.tenant_id
  AND  kc.risk_profile           IS NULL
  AND  tp.default_risk_profile   IS NOT NULL;
