-- ============================================================================
-- Migration 010_vn: Customer ID Type Configuration
--
-- Adds customer_id_type_code to vn_tenants so each tenant can configure
-- what their unique client reference is called (IWELL Code, Karvy ID, etc.).
--
-- This is a VARCHAR — no FK to ki_customer_id_types — because ki_ tables
-- are applied after vn_ tables. Validation happens at the app level.
-- ============================================================================

ALTER TABLE vn_tenants
    ADD COLUMN IF NOT EXISTS customer_id_type_code VARCHAR(50) NOT NULL DEFAULT 'IWELL_CODE';

COMMENT ON COLUMN vn_tenants.customer_id_type_code IS
    'References ki_customer_id_types.code — the unique client ref type this tenant uses (e.g. IWELL_CODE, KARVY_CODE)';
