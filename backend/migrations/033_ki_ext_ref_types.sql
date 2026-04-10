-- ============================================================================
-- Migration 033: External Reference Types
--
-- MFDs use different platforms to track client IDs.
-- This migration:
--   1. Creates ki_ext_ref_types  — global master (CAMS, KFINTECH, IWELL, BSE_STAR, CUSTOM)
--   2. Adds ext_ref_type_code    — on vn_tenants (one platform per tenant)
--
-- Design:
--   - Global table (no tenant_id) — same list for all tenants
--   - Tenant selects ONE type during onboarding; stored on vn_tenants
--   - Selection is permanent (cannot be changed without admin intervention)
--   - New types can be added by inserting rows — no DDL required
--   - ki_ext_ref_types replaces the old ki_customer_id_types for this purpose
--     (ki_customer_id_types kept for backward compat with older code)
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: ki_ext_ref_types  (global master — no tenant_id, no RLS)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_ext_ref_types (
    code        TEXT        PRIMARY KEY,
    label       TEXT        NOT NULL,
    description TEXT        NOT NULL DEFAULT '',
    is_active   BOOLEAN     NOT NULL DEFAULT true,
    sort_order  INTEGER     NOT NULL DEFAULT 99,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  ki_ext_ref_types             IS 'Global master: MFD platform/RTA types used as client external reference IDs.';
COMMENT ON COLUMN ki_ext_ref_types.code        IS 'Short code used as FK (CAMS, KFINTECH, IWELL, BSE_STAR, CUSTOM).';
COMMENT ON COLUMN ki_ext_ref_types.label       IS 'Display name shown in UI dropdowns and onboarding.';
COMMENT ON COLUMN ki_ext_ref_types.description IS 'Short description of what this platform/RTA is.';

-- Seed: 5 most commonly used platforms by Indian MFDs
INSERT INTO ki_ext_ref_types (code, label, description, sort_order) VALUES
    ('CAMS',     'CAMS',       'Computer Age Management Services — one of the two main RTAs in India', 1),
    ('KFINTECH', 'KFintech',   'KFintech (formerly Karvy) — the other main RTA in India',              2),
    ('IWELL',    'InvestWell', 'InvestWell — popular back-office CRM platform for MFDs',               3),
    ('BSE_STAR', 'BSE StarMF', 'BSE Star MF — BSE''s direct mutual fund distribution platform',        4),
    ('CUSTOM',   'Custom ID',  'Custom reference ID defined by the distributor',                        5)
ON CONFLICT (code) DO NOTHING;


-- ────────────────────────────────────────────────────────────────────────────
-- ADD ext_ref_type_code TO vn_tenants
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE vn_tenants
    ADD COLUMN IF NOT EXISTS ext_ref_type_code TEXT REFERENCES ki_ext_ref_types(code);

COMMENT ON COLUMN vn_tenants.ext_ref_type_code IS
    'The platform/RTA the MFD uses for client ext_ref_id. Set once during onboarding; '
    'cannot be changed by tenant users — requires admin intervention.';
