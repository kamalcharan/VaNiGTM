    -- ============================================================================
    -- VaNiBase Operational Migration: 002_vn_operational.sql
    -- ============================================================================
    -- Scope: Subscriptions, billing history, audit logging
    -- Tables: VN_subscriptions, VN_subscription_history, VN_audit_log
    -- Depends on: 001_vn_foundation.sql (VN_tenants, VN_users must exist)
    -- ============================================================================
    -- Version: 1.0.0
    -- Date: March 2026
    -- Vikuna Technologies — Confidential
    -- ============================================================================

    BEGIN;

    -- ────────────────────────────────────────────────────────────────────────────
    -- 1. VN_subscriptions — Subscription plans per tenant
    -- ────────────────────────────────────────────────────────────────────────────
    -- Each tenant has one current (is_current = true) subscription.
    -- Historical subscriptions are kept with is_current = false.
    -- Plan codes and features are convention-based per product.
    --
    -- max_sessions controls license enforcement:
    --   free=1, starter=2, pro=3, enterprise=5 (configurable)

    CREATE TABLE VN_subscriptions (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id       UUID NOT NULL REFERENCES VN_tenants(id) ON DELETE CASCADE,

        -- Plan Details
        plan_code       VARCHAR(50) NOT NULL DEFAULT 'free',  -- free / starter / pro / enterprise / custom
        plan_name       VARCHAR(100),                          -- Display name: "Free", "Pro Monthly", etc.
        status          VARCHAR(20) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('trialing', 'active', 'past_due', 'cancelled', 'expired')),

        -- Limits
        max_users       INTEGER NOT NULL DEFAULT 1,
        max_sessions    INTEGER NOT NULL DEFAULT 1,            -- Concurrent sessions per user (license enforcement)
        features        JSONB DEFAULT '[]'::jsonb,             -- Feature flags: ["import", "export", "api_access", "white_label"]

        -- Billing
        billing_cycle   VARCHAR(20) DEFAULT 'monthly'
                        CHECK (billing_cycle IN ('monthly', 'quarterly', 'yearly', 'lifetime', 'custom')),
        amount          DECIMAL(12, 2) DEFAULT 0.00,
        currency        VARCHAR(3) DEFAULT 'INR',
        next_billing_at TIMESTAMPTZ,

        -- Lifecycle
        is_current      BOOLEAN NOT NULL DEFAULT true,         -- Only one active subscription per tenant
        started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at      TIMESTAMPTZ,
        trial_ends_at   TIMESTAMPTZ,
        cancelled_at    TIMESTAMPTZ,
        cancellation_reason TEXT,

        -- Timestamps
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Ensure only one current subscription per tenant
    CREATE UNIQUE INDEX idx_vn_subscriptions_current
        ON VN_subscriptions (tenant_id) WHERE is_current = true;

    CREATE INDEX idx_vn_subscriptions_tenant_id ON VN_subscriptions (tenant_id);
    CREATE INDEX idx_vn_subscriptions_status ON VN_subscriptions (status);
    CREATE INDEX idx_vn_subscriptions_expires ON VN_subscriptions (expires_at)
        WHERE status IN ('active', 'trialing');

    COMMENT ON TABLE VN_subscriptions IS 'Subscription plans per tenant. One is_current=true per tenant at any time. Historical records kept for audit.';
    COMMENT ON COLUMN VN_subscriptions.max_sessions IS 'Maximum concurrent login sessions per user. Used by auth middleware for license enforcement. free=1, starter=2, pro=3, enterprise=5.';
    COMMENT ON COLUMN VN_subscriptions.features IS 'Array of feature flag strings. Products check this array to gate features. E.g. ["import", "export", "api_access", "white_label", "vani_full"].';

    -- ────────────────────────────────────────────────────────────────────────────
    -- 2. VN_subscription_history — Every plan change, payment, event
    -- ────────────────────────────────────────────────────────────────────────────

    CREATE TABLE VN_subscription_history (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        subscription_id UUID NOT NULL REFERENCES VN_subscriptions(id) ON DELETE CASCADE,
        tenant_id       UUID NOT NULL REFERENCES VN_tenants(id) ON DELETE CASCADE,

        -- Event Details
        event           VARCHAR(30) NOT NULL
                        CHECK (event IN (
                            'created', 'activated', 'upgraded', 'downgraded',
                            'renewed', 'cancelled', 'expired', 'reactivated',
                            'payment_success', 'payment_failed',
                            'trial_started', 'trial_ended',
                            'limit_changed', 'feature_changed'
                        )),
        from_plan       VARCHAR(50),                           -- Previous plan code (NULL for 'created')
        to_plan         VARCHAR(50),                           -- New plan code (NULL for 'cancelled')

        -- Financial
        amount          DECIMAL(12, 2),
        currency        VARCHAR(3) DEFAULT 'INR',
        payment_ref     VARCHAR(255),                          -- External payment reference (Razorpay/Stripe ID)
        invoice_url     TEXT,

        -- Context
        performed_by    UUID REFERENCES VN_users(id) ON DELETE SET NULL,  -- Who triggered this change
        notes           TEXT,
        metadata        JSONB DEFAULT '{}',                    -- Additional context (coupon codes, promo details, etc.)

        -- Timestamp
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_vn_sub_history_subscription ON VN_subscription_history (subscription_id);
    CREATE INDEX idx_vn_sub_history_tenant ON VN_subscription_history (tenant_id);
    CREATE INDEX idx_vn_sub_history_event ON VN_subscription_history (event);
    CREATE INDEX idx_vn_sub_history_created ON VN_subscription_history (created_at);

    COMMENT ON TABLE VN_subscription_history IS 'Immutable audit trail of all subscription lifecycle events and payments.';

    -- ────────────────────────────────────────────────────────────────────────────
    -- 3. VN_audit_log — General audit trail
    -- ────────────────────────────────────────────────────────────────────────────
    -- Captures: login events, role changes, tenant status changes,
    -- user management actions, security events, configuration changes.
    -- This is an append-only table — never UPDATE or DELETE rows.

    CREATE TABLE VN_audit_log (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id       UUID REFERENCES VN_tenants(id) ON DELETE SET NULL,  -- NULL for cross-tenant/system events
        user_id         UUID REFERENCES VN_users(id) ON DELETE SET NULL,    -- Who performed the action (NULL for system)

        -- Event Classification
        category        VARCHAR(30) NOT NULL
                        CHECK (category IN (
                            'auth',           -- login, logout, token refresh, password change
                            'user',           -- user created, updated, deactivated, role changed
                            'tenant',         -- tenant status change, profile update
                            'subscription',   -- plan change (summary — detail in VN_subscription_history)
                            'security',       -- failed login, account locked, suspicious activity
                            'config',         -- settings changed, theme changed
                            'system'          -- migration applied, maintenance, superadmin actions
                        )),
        action          VARCHAR(50) NOT NULL,                  -- Specific action within category
        -- Auth actions: login_success, login_failed, logout, token_refresh, password_changed,
        --              password_reset_requested, session_revoked, session_force_logout
        -- User actions: user_created, user_updated, user_deactivated, user_reactivated,
        --              role_assigned, role_revoked
        -- Tenant actions: tenant_activated, tenant_suspended, tenant_banned,
        --                profile_updated, settings_changed
        -- Security actions: account_locked, account_unlocked, suspicious_login,
        --                  ip_blocked, max_sessions_exceeded
        -- Config actions: theme_changed, preferences_updated
        -- System actions: migration_applied, superadmin_impersonation

        -- Context
        target_type     VARCHAR(30),                           -- What was acted upon: user, tenant, role, session, etc.
        target_id       UUID,                                  -- ID of the target entity
        ip_address      INET,
        user_agent      TEXT,

        -- Change Data
        old_value       JSONB,                                 -- Previous state (for changes)
        new_value       JSONB,                                 -- New state (for changes)
        metadata        JSONB DEFAULT '{}',                    -- Additional context

        -- Result
        status          VARCHAR(10) NOT NULL DEFAULT 'success'
                        CHECK (status IN ('success', 'failure', 'warning')),
        error_message   TEXT,                                  -- For failed actions

        -- Timestamp (no updated_at — this is append-only)
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_vn_audit_log_tenant ON VN_audit_log (tenant_id, created_at);
    CREATE INDEX idx_vn_audit_log_user ON VN_audit_log (user_id, created_at);
    CREATE INDEX idx_vn_audit_log_category ON VN_audit_log (category, action);
    CREATE INDEX idx_vn_audit_log_created ON VN_audit_log (created_at);
    CREATE INDEX idx_vn_audit_log_target ON VN_audit_log (target_type, target_id);
    CREATE INDEX idx_vn_audit_log_security ON VN_audit_log (category, ip_address)
        WHERE category = 'security';

    COMMENT ON TABLE VN_audit_log IS 'Append-only audit trail for all significant system events. Never UPDATE or DELETE rows.';
    COMMENT ON COLUMN VN_audit_log.old_value IS 'Previous state before the change. NULL for create/login actions.';
    COMMENT ON COLUMN VN_audit_log.new_value IS 'New state after the change. NULL for delete/logout actions.';

    -- ────────────────────────────────────────────────────────────────────────────
    -- Seed: Default Free Subscription for Vikuna Tenant
    -- ────────────────────────────────────────────────────────────────────────────

    INSERT INTO VN_subscriptions (
        id, tenant_id, plan_code, plan_name, status,
        max_users, max_sessions, features,
        billing_cycle, amount
    ) VALUES (
        '00000000-0000-0000-0000-000000000200',
        '00000000-0000-0000-0000-000000000100',  -- Vikuna tenant from 001_foundation
        'enterprise', 'Enterprise (Internal)', 'active',
        999, 10, '["import", "export", "api_access", "white_label", "vani_full", "superadmin_tools"]'::jsonb,
        'lifetime', 0.00
    ) ON CONFLICT DO NOTHING;

    INSERT INTO VN_subscription_history (
        subscription_id, tenant_id, event, to_plan, notes
    ) VALUES (
        '00000000-0000-0000-0000-000000000200',
        '00000000-0000-0000-0000-000000000100',
        'created', 'enterprise',
        'Initial enterprise subscription for Vikuna internal tenant.'
    ) ON CONFLICT DO NOTHING;

    -- ────────────────────────────────────────────────────────────────────────────
    -- Utility: updated_at trigger for VN_subscriptions
    -- ────────────────────────────────────────────────────────────────────────────

    CREATE TRIGGER trg_vn_subscriptions_updated_at
        BEFORE UPDATE ON VN_subscriptions
        FOR EACH ROW EXECUTE FUNCTION vn_set_updated_at();

    -- ────────────────────────────────────────────────────────────────────────────
    -- Utility: Cleanup function for expired sessions (run via cron/scheduler)
    -- ────────────────────────────────────────────────────────────────────────────

    CREATE OR REPLACE FUNCTION vn_cleanup_expired_sessions(
        p_retention_days INTEGER DEFAULT 30
    )
    RETURNS INTEGER AS $$
    DECLARE
        v_count INTEGER;
    BEGIN
        -- Mark expired active sessions as revoked
        UPDATE VN_refresh_tokens
        SET is_active = false,
            revoked_at = now(),
            revoked_reason = 'expired'
        WHERE is_active = true
        AND expires_at < now();

        GET DIAGNOSTICS v_count = ROW_COUNT;

        -- Delete very old revoked sessions (beyond retention)
        DELETE FROM VN_refresh_tokens
        WHERE is_active = false
        AND revoked_at < now() - (p_retention_days || ' days')::INTERVAL;

        RETURN v_count;
    END;
    $$ LANGUAGE plpgsql;

    COMMENT ON FUNCTION vn_cleanup_expired_sessions IS 'Marks expired sessions as revoked and deletes old revoked sessions beyond retention period. Call via cron: SELECT vn_cleanup_expired_sessions(30);';

    -- ────────────────────────────────────────────────────────────────────────────
    -- Utility: Get active session count for a user (used in login flow)
    -- ────────────────────────────────────────────────────────────────────────────

    CREATE OR REPLACE FUNCTION vn_get_active_sessions(
        p_user_id UUID
    )
    RETURNS TABLE (
        session_id UUID,
        device_type VARCHAR(20),
        os VARCHAR(50),
        browser VARCHAR(50),
        ip_address INET,
        last_activity_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ
    ) AS $$
    BEGIN
        RETURN QUERY
        SELECT
            rt.id AS session_id,
            rt.device_type,
            rt.os,
            rt.browser,
            rt.ip_address,
            rt.last_activity_at,
            rt.created_at
        FROM VN_refresh_tokens rt
        WHERE rt.user_id = p_user_id
        AND rt.is_active = true
        AND rt.expires_at > now()
        ORDER BY rt.last_activity_at DESC;
    END;
    $$ LANGUAGE plpgsql;

    COMMENT ON FUNCTION vn_get_active_sessions IS 'Returns all active sessions for a user. Used in login flow when max session limit is reached — shows user which sessions to end.';

    -- ────────────────────────────────────────────────────────────────────────────
    -- Utility: Get max sessions for a user (from their tenant subscription)
    -- ────────────────────────────────────────────────────────────────────────────

    CREATE OR REPLACE FUNCTION vn_get_max_sessions(
        p_user_id UUID
    )
    RETURNS INTEGER AS $$
    DECLARE
        v_max INTEGER;
    BEGIN
        SELECT s.max_sessions INTO v_max
        FROM VN_subscriptions s
        JOIN VN_users u ON u.tenant_id = s.tenant_id
        WHERE u.id = p_user_id
        AND s.is_current = true
        AND s.status = 'active';

        RETURN COALESCE(v_max, 1);  -- Default to 1 if no subscription found
    END;
    $$ LANGUAGE plpgsql;

    COMMENT ON FUNCTION vn_get_max_sessions IS 'Returns the max concurrent sessions allowed for a user based on their tenant subscription plan. Defaults to 1 if no active subscription found.';

    -- ────────────────────────────────────────────────────────────────────────────
    -- Record this migration
    -- ────────────────────────────────────────────────────────────────────────────

    INSERT INTO VN_migrations (filename, checksum, applied_by, notes) VALUES
        ('002_vn_operational.sql', md5('002_vn_operational_v1.0.0'), 'manual',
        'Operational: subscriptions, subscription_history, audit_log, utility functions')
    ON CONFLICT (filename) DO NOTHING;

    COMMIT;

    -- ============================================================================
    -- Post-migration verification queries (run manually to verify)
    -- ============================================================================
    -- SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'vn_%' ORDER BY table_name;
    -- SELECT * FROM VN_subscriptions WHERE is_current = true;
    -- SELECT * FROM VN_subscription_history;
    -- SELECT vn_get_max_sessions('some-user-uuid');
    -- SELECT * FROM vn_get_active_sessions('some-user-uuid');
    -- SELECT * FROM VN_migrations ORDER BY applied_at;
