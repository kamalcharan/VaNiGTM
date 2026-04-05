-- ============================================================================
-- VaNiBase Migration: 006_vn_error_log.sql
-- ============================================================================
-- Scope: Structured error logging for debugging and monitoring
-- Tables: VN_error_log
-- Depends on: 001_vn_foundation.sql (VN_tenants, VN_users must exist)
-- ============================================================================
-- Version: 1.0.0
-- Date: March 2026
-- Vikuna Technologies — Confidential
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. VN_error_log — Structured error logging
-- ────────────────────────────────────────────────────────────────────────────
-- Captures application errors with context for debugging.
-- tenant_id and user_id are nullable for errors that occur before
-- authentication or outside a tenant context.

CREATE TABLE VN_error_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID REFERENCES VN_tenants(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES VN_users(id) ON DELETE CASCADE,
    error_code      VARCHAR(50) NOT NULL,
    message         TEXT NOT NULL,
    stack           TEXT,
    endpoint        VARCHAR(255),
    method          VARCHAR(10),
    severity        VARCHAR(20) NOT NULL DEFAULT 'error'
                    CHECK (severity IN ('error', 'warning', 'critical')),
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_log_tenant_created ON VN_error_log (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_log_severity ON VN_error_log (severity, created_at DESC);

COMMENT ON TABLE VN_error_log IS 'Structured error log for application errors. Append-only. Used for debugging, monitoring, and alerting.';

-- ────────────────────────────────────────────────────────────────────────────
-- Record this migration
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO VN_migrations (filename, checksum, applied_by, notes) VALUES
    ('006_vn_error_log.sql', md5('006_vn_error_log_v1.0.0'), 'manual',
     'Error log: structured error logging with severity levels')
ON CONFLICT (filename) DO NOTHING;

COMMIT;

-- ============================================================================
-- Post-migration verification queries (run manually to verify)
-- ============================================================================
-- SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'vn_%' ORDER BY table_name;
-- SELECT * FROM VN_migrations ORDER BY applied_at;
