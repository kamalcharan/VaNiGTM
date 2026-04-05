-- ============================================================================
-- VaNiBase Migration: 004_vn_password_resets.sql
-- ============================================================================
-- Scope: Password reset token tracking
-- Tables: VN_password_resets
-- Depends on: 001_vn_foundation.sql (VN_users must exist)
-- ============================================================================
-- Version: 1.0.0
-- Date: March 2026
-- Vikuna Technologies — Confidential
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. VN_password_resets — Password reset tokens
-- ────────────────────────────────────────────────────────────────────────────
-- Tracks password reset requests. token_hash stores a hashed version of
-- the reset token sent via email. Each token can only be used once.

CREATE TABLE VN_password_resets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES VN_users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(255) NOT NULL UNIQUE,
    expires_at      TIMESTAMPTZ NOT NULL,
    used            BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_password_resets_token ON VN_password_resets (token_hash);
CREATE INDEX idx_password_resets_user ON VN_password_resets (user_id);

COMMENT ON TABLE VN_password_resets IS 'Password reset tokens. Each token is single-use and time-limited. Token is hashed for security.';

-- ────────────────────────────────────────────────────────────────────────────
-- Record this migration
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO VN_migrations (filename, checksum, applied_by, notes) VALUES
    ('004_vn_password_resets.sql', md5('004_vn_password_resets_v1.0.0'), 'manual',
     'Password resets: token-based password reset tracking')
ON CONFLICT (filename) DO NOTHING;

COMMIT;

-- ============================================================================
-- Post-migration verification queries (run manually to verify)
-- ============================================================================
-- SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'vn_%' ORDER BY table_name;
-- SELECT * FROM VN_migrations ORDER BY applied_at;
