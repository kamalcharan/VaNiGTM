-- ============================================================================
-- VaNiBase Foundation Migration: 001_vn_foundation.sql
-- ============================================================================
-- Scope: Core identity, authentication, authorization, session management
-- Tables: VN_tenants, VN_tenant_profiles, VN_users, VN_roles, VN_user_roles,
--         VN_refresh_tokens (with session/device tracking), VN_migrations
-- ============================================================================
-- Version: 1.0.0
-- Date: March 2026
-- Vikuna Technologies — Confidential
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- Extensions
-- ────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ────────────────────────────────────────────────────────────────────────────
-- 1. VN_migrations — Track applied migrations
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS VN_migrations (
    id              SERIAL PRIMARY KEY,
    filename        VARCHAR(255) NOT NULL UNIQUE,
    checksum        VARCHAR(64),
    applied_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    applied_by      VARCHAR(100) DEFAULT 'system',
    execution_ms    INTEGER,
    notes           TEXT
);

COMMENT ON TABLE VN_migrations IS 'Tracks applied database migrations for VaNiBase framework';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. VN_tenants — Core tenant identity and lifecycle
-- ────────────────────────────────────────────────────────────────────────────
-- Status lifecycle: pending → active → suspended → banned → churned
-- The Vikuna tenant (slug='vikuna') is the special superadmin tenant
-- with cross-tenant access capability.

CREATE TABLE VN_tenants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            VARCHAR(100) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'active', 'suspended', 'banned', 'churned')),
    is_active       BOOLEAN GENERATED ALWAYS AS (status = 'active') STORED,
    activated_at    TIMESTAMPTZ,
    suspended_at    TIMESTAMPTZ,
    suspension_reason TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT vn_tenants_slug_unique UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS idx_vn_tenants_status ON VN_tenants (status);
CREATE INDEX IF NOT EXISTS idx_vn_tenants_is_active ON VN_tenants (is_active);

COMMENT ON TABLE VN_tenants IS 'Core tenant identity. Each organization/business is a tenant.';
COMMENT ON COLUMN VN_tenants.slug IS 'URL-safe unique identifier. Used in login, subdomains (future), API routing.';
COMMENT ON COLUMN VN_tenants.is_active IS 'Generated column derived from status. TRUE only when status = active.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. VN_tenant_profiles — Business profile, contacts, branding
-- ────────────────────────────────────────────────────────────────────────────
-- 1:1 with VN_tenants. Separated because profile data changes independently
-- from tenant status/lifecycle. Refine fields as needed.

CREATE TABLE VN_tenant_profiles (
    tenant_id       UUID PRIMARY KEY REFERENCES VN_tenants(id) ON DELETE CASCADE,

    -- Identity
    name            VARCHAR(255) NOT NULL,             -- Full legal/business name
    short_name      VARCHAR(100),                      -- Abbreviated name
    display_name    VARCHAR(150),                      -- UI display name
    type            VARCHAR(50) NOT NULL DEFAULT 'individual',  -- From constants: individual, proprietorship, partnership, llp, pvt_ltd, etc.
    description     TEXT,

    -- Branding
    logo_url        TEXT,
    brand_color     VARCHAR(7),                        -- Hex color e.g. #E67E22
    theme_id        VARCHAR(50) DEFAULT 'ocean',       -- Default theme from the 12 available
    tagline         VARCHAR(255),

    -- Primary Contact
    email           VARCHAR(255),
    phone           VARCHAR(20),
    website         VARCHAR(255),

    -- Address
    address_line1   VARCHAR(255),
    address_line2   VARCHAR(255),
    city            VARCHAR(100),
    state           VARCHAR(100),
    country         VARCHAR(100) DEFAULT 'India',
    postal_code     VARCHAR(20),

    -- India-specific Tax IDs
    gstin           VARCHAR(15),
    pan             VARCHAR(10),

    -- Classification
    industry        VARCHAR(100),                      -- From constants: healthcare, finance, tech, etc.

    -- Preferences & Overrides
    timezone        VARCHAR(50) DEFAULT 'Asia/Kolkata',
    currency        VARCHAR(3) DEFAULT 'INR',
    locale          VARCHAR(10) DEFAULT 'en-IN',
    settings        JSONB DEFAULT '{}',                -- Product-specific config overrides

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE VN_tenant_profiles IS 'Business profile for a tenant. 1:1 with VN_tenants. Fields subject to refinement.';
COMMENT ON COLUMN VN_tenant_profiles.type IS 'Business type from constants file. Values like: individual, proprietorship, partnership, llp, pvt_ltd, public_ltd, enterprise, ngo, government.';
COMMENT ON COLUMN VN_tenant_profiles.settings IS 'Catch-all JSONB for product-specific tenant configuration that does not warrant dedicated columns.';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. VN_users — People across all tenants
-- ────────────────────────────────────────────────────────────────────────────
-- A user belongs to exactly one tenant. Same email can exist across
-- different tenants (UNIQUE on tenant_id + email).

CREATE TABLE VN_users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES VN_tenants(id) ON DELETE CASCADE,
    email           VARCHAR(255) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    avatar_url      TEXT,

    -- Preferences (theme override, color mode, language, etc.)
    preferences     JSONB DEFAULT '{}'::jsonb,
    -- Expected keys:
    --   theme_override: string | null  (overrides tenant default theme)
    --   color_mode: 'light' | 'dark' | 'system'
    --   language: string (e.g. 'en', 'hi', 'te')
    --   notifications: { email: boolean, push: boolean }

    -- Status
    is_active       BOOLEAN NOT NULL DEFAULT true,
    is_email_verified BOOLEAN NOT NULL DEFAULT false,
    email_verified_at TIMESTAMPTZ,
    last_login_at   TIMESTAMPTZ,
    failed_login_count INTEGER NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ,                       -- Account lockout after failed attempts

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT vn_users_tenant_email_unique UNIQUE (tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_vn_users_tenant_id ON VN_users (tenant_id);
CREATE INDEX IF NOT EXISTS idx_vn_users_email ON VN_users (email);
CREATE INDEX IF NOT EXISTS idx_vn_users_is_active ON VN_users (tenant_id, is_active);

COMMENT ON TABLE VN_users IS 'All users across all tenants. One user belongs to one tenant.';
COMMENT ON COLUMN VN_users.preferences IS 'User-level preferences including theme override, color mode, language. Stored as JSONB for flexibility.';
COMMENT ON COLUMN VN_users.failed_login_count IS 'Tracks consecutive failed login attempts. Reset on successful login. Used for account lockout.';
COMMENT ON COLUMN VN_users.locked_until IS 'If set and in the future, login is blocked. Set after N failed attempts (configurable).';

-- ────────────────────────────────────────────────────────────────────────────
-- 5. VN_roles — Role definitions (system + product-level)
-- ────────────────────────────────────────────────────────────────────────────
-- System    (tenant_id IS NULL): superadmin, owner, admin
--   - These exist globally and are seeded by VaNiBase.
-- Product roles (tenant_id IS NULL, is_system = false): advisor, trader, etc.
--   - These are seeded by each product's migration. Convention-based.
-- Tenant-specific roles (tenant_id IS NOT NULL): custom roles per tenant.
--   - Created by tenant admins for their organization.

CREATE TABLE VN_roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID REFERENCES VN_tenants(id) ON DELETE CASCADE,  -- NULL = global/system role
    code            VARCHAR(50) NOT NULL,
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    is_system       BOOLEAN NOT NULL DEFAULT false,    -- true for framework roles (superadmin, owner, admin)
    is_default      BOOLEAN NOT NULL DEFAULT false,    -- true = auto-assigned on user creation
    sort_order      INTEGER DEFAULT 0,                 -- Display ordering
    permissions     JSONB DEFAULT '[]'::jsonb,         -- Future: granular permission list

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- tenant_id NULL = global role, so we need a partial unique index
    CONSTRAINT vn_roles_global_code_unique UNIQUE (code) DEFERRABLE INITIALLY DEFERRED
);

-- Drop the simple unique constraint and replace with proper partial indexes
ALTER TABLE VN_roles DROP CONSTRAINT IF EXISTS vn_roles_global_code_unique;

-- Global roles: code must be unique when tenant_id IS NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_vn_roles_global_code ON VN_roles (code) WHERE tenant_id IS NULL;

-- Tenant-specific roles: code must be unique within a tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_vn_roles_tenant_code ON VN_roles (tenant_id, code) WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vn_roles_tenant_id ON VN_roles (tenant_id);
CREATE INDEX IF NOT EXISTS idx_vn_roles_is_system ON VN_roles (is_system);

COMMENT ON TABLE VN_roles IS 'Role definitions. System roles (tenant_id NULL, is_system true) are framework-level. Product roles (tenant_id NULL, is_system false) are seeded by products via convention. Tenant roles (tenant_id NOT NULL) are custom per organization.';
COMMENT ON COLUMN VN_roles.permissions IS 'Future: Array of permission strings e.g. ["users:read", "users:write", "reports:export"]. Convention-based for now.';

-- ────────────────────────────────────────────────────────────────────────────
-- 6. VN_user_roles — Many-to-many user ↔ role
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE VN_user_roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES VN_users(id) ON DELETE CASCADE,
    role_id         UUID NOT NULL REFERENCES VN_roles(id) ON DELETE CASCADE,
    assigned_by     UUID REFERENCES VN_users(id) ON DELETE SET NULL,
    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at      TIMESTAMPTZ,                       -- NULL = active assignment
    revoked_by      UUID REFERENCES VN_users(id) ON DELETE SET NULL,

    CONSTRAINT vn_user_roles_unique UNIQUE (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_vn_user_roles_user_id ON VN_user_roles (user_id);
CREATE INDEX IF NOT EXISTS idx_vn_user_roles_role_id ON VN_user_roles (role_id);
CREATE INDEX IF NOT EXISTS idx_vn_user_roles_active ON VN_user_roles (user_id) WHERE revoked_at IS NULL;

COMMENT ON TABLE VN_user_roles IS 'Many-to-many assignment of roles to users. Supports revocation tracking.';
COMMENT ON COLUMN VN_user_roles.revoked_at IS 'When set, this role assignment is no longer active. Kept for audit trail.';

-- ────────────────────────────────────────────────────────────────────────────
-- 7. VN_refresh_tokens — JWT refresh tokens + session/device tracking
-- ────────────────────────────────────────────────────────────────────────────
-- Each refresh token represents an active session on a specific device.
-- Used for:
--   1. JWT token rotation (refresh → new access token)
--   2. Session management (view active sessions, force logout)
--   3. License enforcement (max concurrent sessions per subscription plan)
--   4. Device/IP tracking for security

CREATE TABLE VN_refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES VN_users(id) ON DELETE CASCADE,
    tenant_id       UUID NOT NULL REFERENCES VN_tenants(id) ON DELETE CASCADE,
    token_hash      VARCHAR(255) NOT NULL,             -- bcrypt hash of the refresh token

    -- Session/Device Information
    ip_address      INET,
    user_agent      TEXT,                              -- Raw browser/app user agent string
    device_type     VARCHAR(20),                       -- mobile / desktop / tablet (parsed from UA)
    os              VARCHAR(50),                       -- Windows / macOS / iOS / Android / Linux
    browser         VARCHAR(50),                       -- Chrome / Safari / Firefox / Edge
    app_version     VARCHAR(50),                       -- For native apps (future)

    -- Session Lifecycle
    is_active       BOOLEAN NOT NULL DEFAULT true,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at      TIMESTAMPTZ,
    revoked_reason  VARCHAR(50),                       -- user_logout / session_replaced / admin_revoke / expired / max_sessions

    CONSTRAINT vn_refresh_tokens_token_hash_unique UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_vn_refresh_tokens_user_id ON VN_refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_vn_refresh_tokens_tenant_id ON VN_refresh_tokens (tenant_id);
CREATE INDEX IF NOT EXISTS idx_vn_refresh_tokens_active ON VN_refresh_tokens (user_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_vn_refresh_tokens_expires ON VN_refresh_tokens (expires_at) WHERE is_active = true;

COMMENT ON TABLE VN_refresh_tokens IS 'JWT refresh tokens with embedded session/device tracking. Each row = one active login session.';
COMMENT ON COLUMN VN_refresh_tokens.revoked_reason IS 'Why this session ended: user_logout (voluntary), session_replaced (user chose to end this session when hitting limit), admin_revoke (admin forced logout), expired (TTL), max_sessions (auto-revoked by system).';

-- ────────────────────────────────────────────────────────────────────────────
-- Seed: System Roles
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO VN_roles (id, tenant_id, code, name, description, is_system, sort_order) VALUES
    ('00000000-0000-0000-0000-000000000001', NULL, 'superadmin', 'Super Admin',
     'Vikuna team. Cross-tenant access for support, configuration, and platform administration.',
     true, 1),
    ('00000000-0000-0000-0000-000000000002', NULL, 'owner', 'Owner',
     'Tenant owner. The person who signed up. Cannot be removed. Full tenant control.',
     true, 2),
    ('00000000-0000-0000-0000-000000000003', NULL, 'admin', 'Admin',
     'Tenant administrator. Assigned by owner. Can manage users, settings, and configuration.',
     true, 3)
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- Seed: Vikuna Tenant (Superadmin Tenant)
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO VN_tenants (id, slug, status, activated_at) VALUES
    ('00000000-0000-0000-0000-000000000100', 'vikuna', 'active', now())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO VN_tenant_profiles (tenant_id, name, short_name, display_name, type, email, industry, theme_id) VALUES
    ('00000000-0000-0000-0000-000000000100', 'Vikuna Technologies Private Limited', 'Vikuna', 'Vikuna Tech', 'pvt_ltd',
     'admin@vikuna.com', 'technology', 'vikunaBlack')
ON CONFLICT (tenant_id) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- Utility: Updated_at trigger function
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION vn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to all tables with updated_at column
CREATE TRIGGER trg_vn_tenants_updated_at
    BEFORE UPDATE ON VN_tenants
    FOR EACH ROW EXECUTE FUNCTION vn_set_updated_at();

CREATE TRIGGER trg_vn_tenant_profiles_updated_at
    BEFORE UPDATE ON VN_tenant_profiles
    FOR EACH ROW EXECUTE FUNCTION vn_set_updated_at();

CREATE TRIGGER trg_vn_users_updated_at
    BEFORE UPDATE ON VN_users
    FOR EACH ROW EXECUTE FUNCTION vn_set_updated_at();

CREATE TRIGGER trg_vn_roles_updated_at
    BEFORE UPDATE ON VN_roles
    FOR EACH ROW EXECUTE FUNCTION vn_set_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- Record this migration
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO VN_migrations (filename, checksum, applied_by, notes) VALUES
    ('001_vn_foundation.sql', md5('001_vn_foundation_v1.0.0'), 'manual',
     'Foundation: tenants, profiles, users, roles, user_roles, refresh_tokens, migrations')
ON CONFLICT (filename) DO NOTHING;

COMMIT;

-- ============================================================================
-- Post-migration verification queries (run manually to verify)
-- ============================================================================
-- SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'vn_%' ORDER BY table_name;
-- SELECT * FROM VN_roles WHERE is_system = true;
-- SELECT t.slug, tp.name FROM VN_tenants t JOIN VN_tenant_profiles tp ON t.id = tp.tenant_id;
-- SELECT * FROM VN_migrations;
