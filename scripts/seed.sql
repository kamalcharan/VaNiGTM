-- ════════════════════════════════════════════════════════════════════════════
-- VaNi-GTM — Seed-only SQL
-- Run AFTER all migrations have been applied.
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- SEED: Vikuna Technologies tenant + charan@vikuna.in admin user
-- Password: Vikuna2026Admin (bcrypt hash pre-computed below)
-- Idempotent — re-running does nothing if email already exists.
-- ════════════════════════════════════════════════════════════════════════════
\echo '>>> Seeding Vikuna tenant + admin user...'

DO $seed$
DECLARE
  v_tenant_id UUID;
  v_user_id   UUID;
  v_owner_role_id UUID;
BEGIN
  -- Idempotency check
  IF EXISTS (SELECT 1 FROM vn_users WHERE LOWER(email) = 'charan@vikuna.in') THEN
    RAISE NOTICE '[Seed] User charan@vikuna.in already exists — skipping.';
    RETURN;
  END IF;

  -- 1. Tenant (or reuse if slug exists)
  SELECT id INTO v_tenant_id FROM vn_tenants WHERE slug = 'vikuna';
  IF v_tenant_id IS NULL THEN
    INSERT INTO vn_tenants (id, slug, status, is_admin, activated_at, created_at, updated_at)
      VALUES (gen_random_uuid(), 'vikuna', 'active', true, now(), now(), now())
      RETURNING id INTO v_tenant_id;
    RAISE NOTICE '[Seed] Tenant created: vikuna (%)', v_tenant_id;

    -- 2. Tenant profile
    INSERT INTO vn_tenant_profiles
      (tenant_id, name, display_name, type, theme_id, currency, locale,
       email, country, settings, created_at, updated_at)
    VALUES
      (v_tenant_id, 'Vikuna Technologies', 'Vikuna Technologies', 'pvt_ltd',
       'vikuna-black', 'INR', 'en-IN', 'charan@vikuna.in', 'India',
       '{}'::jsonb, now(), now());
  ELSE
    RAISE NOTICE '[Seed] Tenant vikuna already exists — reusing (%)', v_tenant_id;
  END IF;

  -- 3. Admin user (bcrypt 12 hash for "Vikuna2026Admin")
  INSERT INTO vn_users
    (id, tenant_id, email, password_hash, name, first_name, last_name,
     preferred_theme, preferences, is_active, is_email_verified, failed_login_count,
     intake_code, created_at, updated_at)
  VALUES
    (gen_random_uuid(), v_tenant_id, 'charan@vikuna.in',
     '$2b$12$XO/dNikaLdkmGEZxbYgnC.V9LeGp7psh1xOupFvykzHO5GBhPbaXu',
     'Charan', 'Charan', '',
     'vikuna-black', '{"color_mode":"dark"}'::jsonb, true, true, 0,
     substring(encode(gen_random_bytes(5), 'hex'), 1, 8), now(), now())
    RETURNING id INTO v_user_id;
  RAISE NOTICE '[Seed] User created: charan@vikuna.in (%)', v_user_id;

  -- 4. Roles per tenant
  INSERT INTO vn_roles
    (id, tenant_id, code, name, description, is_system, is_default, sort_order, permissions, created_at, updated_at)
  VALUES
    (gen_random_uuid(), v_tenant_id, 'owner',   'Owner',   'Tenant owner with full access', true, false, 1, '{"all": true}'::jsonb, now(), now()),
    (gen_random_uuid(), v_tenant_id, 'admin',   'Admin',   'Administrator',                true, false, 2, '{"manage_users": true, "manage_settings": true}'::jsonb, now(), now()),
    (gen_random_uuid(), v_tenant_id, 'planner', 'Planner', 'Financial planner',            true, true,  3, '{"view_clients": true, "manage_portfolio": true}'::jsonb, now(), now())
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_owner_role_id FROM vn_roles WHERE tenant_id = v_tenant_id AND code = 'owner';

  -- 5. Assign owner role
  INSERT INTO vn_user_roles (id, user_id, role_id, assigned_by, assigned_at)
    VALUES (gen_random_uuid(), v_user_id, v_owner_role_id, v_user_id, now())
    ON CONFLICT (user_id, role_id) DO NOTHING;

  -- 6. Subscription
  IF NOT EXISTS (SELECT 1 FROM vn_subscriptions WHERE tenant_id = v_tenant_id AND is_current = true) THEN
    INSERT INTO vn_subscriptions
      (id, tenant_id, plan_code, plan_name, status, max_users, max_sessions, features,
       billing_cycle, is_current, started_at, created_at, updated_at)
    VALUES
      (gen_random_uuid(), v_tenant_id, 'enterprise', 'Enterprise (Seed)', 'active', 100, 50,
       '{"portfolio": true, "clients": true, "market": true, "planning": true, "import": true, "gtm": true}'::jsonb,
       'lifetime', true, now(), now(), now());
  END IF;

  -- 7. Onboarding — mark COMPLETED so admin lands on /dashboard
  INSERT INTO vn_tenant_onboarding (id, tenant_id, step_id, status, completed_at, metadata, created_at)
  VALUES
    (gen_random_uuid(), v_tenant_id, 'user_profile',     'completed', now(), '{"seeded": true}'::jsonb, now()),
    (gen_random_uuid(), v_tenant_id, 'business_profile', 'completed', now(), '{"seeded": true}'::jsonb, now())
  ON CONFLICT (tenant_id, step_id) DO UPDATE
    SET status = 'completed', completed_at = now();

  -- 8. Per-tenant KI master data: bookmark reasons (× 2 envs) + sequences
  INSERT INTO ki_bookmark_reasons (tenant_id, is_live, reason_code, reason_label, display_order)
  VALUES
    (v_tenant_id, true,  'VIP',              'VIP Customer',         1),
    (v_tenant_id, false, 'VIP',              'VIP Customer',         1),
    (v_tenant_id, true,  'FOLLOW_UP',        'Follow-up Required',   2),
    (v_tenant_id, false, 'FOLLOW_UP',        'Follow-up Required',   2),
    (v_tenant_id, true,  'IMPORTANT',        'Important',            3),
    (v_tenant_id, false, 'IMPORTANT',        'Important',            3),
    (v_tenant_id, true,  'HIGH_VALUE',       'High Value Client',    4),
    (v_tenant_id, false, 'HIGH_VALUE',       'High Value Client',    4),
    (v_tenant_id, true,  'ATTENTION',        'Requires Attention',   5),
    (v_tenant_id, false, 'ATTENTION',        'Requires Attention',   5),
    (v_tenant_id, true,  'PORTFOLIO_REVIEW', 'Portfolio Review Due', 6),
    (v_tenant_id, false, 'PORTFOLIO_REVIEW', 'Portfolio Review Due', 6),
    (v_tenant_id, true,  'TAX_PLANNING',     'Tax Planning',         7),
    (v_tenant_id, false, 'TAX_PLANNING',     'Tax Planning',         7),
    (v_tenant_id, true,  'OTHER',            'Other (Custom)',       99),
    (v_tenant_id, false, 'OTHER',            'Other (Custom)',       99)
  ON CONFLICT (tenant_id, is_live, reason_code) DO NOTHING;

  INSERT INTO ki_sequences (tenant_id, sequence_type, prefix, last_value, pad_width)
  VALUES
    (v_tenant_id, 'contact',  'CONT', 0, 4),
    (v_tenant_id, 'client',   'CLT',  0, 4),
    (v_tenant_id, 'campaign', 'GTM',  0, 4)
  ON CONFLICT (tenant_id, sequence_type) DO NOTHING;

  -- Per-tenant job scheduler configs (PORTFOLIO_SNAPSHOT × live + sandbox)
  INSERT INTO ki_job_scheduler_configs
    (tenant_id, job_type_code, is_live, schedule_type, cron_expression,
     is_enabled, max_retries, failover_enabled, failover_cron_expression)
  SELECT
    v_tenant_id, jt.code, env.is_live, jt.default_schedule_type,
    jt.default_cron_expression, true, jt.default_max_retries,
    jt.failover_enabled, jt.failover_cron_expression
  FROM ki_job_types jt
  CROSS JOIN (VALUES (true), (false)) AS env(is_live)
  WHERE jt.code = 'PORTFOLIO_SNAPSHOT' AND jt.is_active = true
  ON CONFLICT (tenant_id, job_type_code, is_live) DO NOTHING;

  RAISE NOTICE '──────────────────────────────────────────────';
  RAISE NOTICE '[Seed] ✓ Vikuna tenant (id=%) + charan@vikuna.in (id=%) ready.', v_tenant_id, v_user_id;
  RAISE NOTICE '[Seed]   Login: charan@vikuna.in / Vikuna2026Admin';
  RAISE NOTICE '──────────────────────────────────────────────';
END
$seed$;
