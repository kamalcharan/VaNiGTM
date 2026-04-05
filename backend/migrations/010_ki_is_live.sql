-- ─────────────────────────────────────────────────────────────────────────────
-- 010_ki_is_live.sql
--
-- Add is_live BOOLEAN NOT NULL DEFAULT TRUE to all environment-scoped KI_ tables.
--
-- is_live = TRUE  → record belongs to Live environment
-- is_live = FALSE → record belongs to Sandbox environment
--
-- Global reference tables (ki_schemes, ki_nav_history, ki_scheme_categories,
-- ki_scheme_aliases, ki_scheme_bookmarks, ki_scheduler_*) are NOT environment-
-- scoped and do NOT get this column.
--
-- All existing rows are backfilled to TRUE (live) since they were created before
-- sandbox mode existed.
--
-- Uses ALTER TABLE IF EXISTS throughout — safe to run even if a table was not yet
-- created on this DB instance (e.g. migrations 001–009 were recorded in
-- vn_migrations from a different environment but not actually applied here).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN

  -- ki_clients
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ki_clients') THEN
    ALTER TABLE ki_clients ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT TRUE;
    COMMENT ON COLUMN ki_clients.is_live IS 'TRUE = live environment, FALSE = sandbox. Set from JWT at record creation time.';
  END IF;

  -- ki_portfolios
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ki_portfolios') THEN
    ALTER TABLE ki_portfolios ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT TRUE;
    COMMENT ON COLUMN ki_portfolios.is_live IS 'TRUE = live environment, FALSE = sandbox.';
  END IF;

  -- ki_holdings
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ki_holdings') THEN
    ALTER TABLE ki_holdings ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT TRUE;
    COMMENT ON COLUMN ki_holdings.is_live IS 'TRUE = live environment, FALSE = sandbox.';
  END IF;

  -- ki_transactions
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ki_transactions') THEN
    ALTER TABLE ki_transactions ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT TRUE;
    COMMENT ON COLUMN ki_transactions.is_live IS 'TRUE = live environment, FALSE = sandbox.';
  END IF;

  -- ki_goals
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ki_goals') THEN
    ALTER TABLE ki_goals ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT TRUE;
    COMMENT ON COLUMN ki_goals.is_live IS 'TRUE = live environment, FALSE = sandbox.';
  END IF;

  -- ki_goal_projections
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ki_goal_projections') THEN
    ALTER TABLE ki_goal_projections ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT TRUE;
    COMMENT ON COLUMN ki_goal_projections.is_live IS 'TRUE = live environment, FALSE = sandbox.';
  END IF;

  -- ki_alerts
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ki_alerts') THEN
    ALTER TABLE ki_alerts ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT TRUE;
    COMMENT ON COLUMN ki_alerts.is_live IS 'TRUE = live environment, FALSE = sandbox.';
  END IF;

  -- ki_file_uploads
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ki_file_uploads') THEN
    ALTER TABLE ki_file_uploads ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT TRUE;
    COMMENT ON COLUMN ki_file_uploads.is_live IS 'TRUE = live environment, FALSE = sandbox.';
  END IF;

  -- ki_import_sessions
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ki_import_sessions') THEN
    ALTER TABLE ki_import_sessions ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT TRUE;
    COMMENT ON COLUMN ki_import_sessions.is_live IS 'TRUE = live environment, FALSE = sandbox.';
  END IF;

  -- ki_import_staging
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ki_import_staging') THEN
    ALTER TABLE ki_import_staging ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT TRUE;
    COMMENT ON COLUMN ki_import_staging.is_live IS 'TRUE = live environment, FALSE = sandbox. Mirrors the parent session.';
  END IF;

END $$;

-- ─── Indexes — only created if the table exists ───────────────────────────────

DO $$
BEGIN

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ki_clients') THEN
    CREATE INDEX IF NOT EXISTS idx_ki_clients_tenant_env ON ki_clients (tenant_id, is_live);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ki_portfolios') THEN
    CREATE INDEX IF NOT EXISTS idx_ki_portfolios_tenant_env ON ki_portfolios (tenant_id, is_live);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ki_holdings') THEN
    CREATE INDEX IF NOT EXISTS idx_ki_holdings_tenant_env ON ki_holdings (tenant_id, is_live);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ki_transactions') THEN
    CREATE INDEX IF NOT EXISTS idx_ki_transactions_tenant_env ON ki_transactions (tenant_id, is_live);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ki_goals') THEN
    CREATE INDEX IF NOT EXISTS idx_ki_goals_tenant_env ON ki_goals (tenant_id, is_live);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ki_alerts') THEN
    CREATE INDEX IF NOT EXISTS idx_ki_alerts_tenant_env ON ki_alerts (tenant_id, is_live);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ki_import_sessions') THEN
    CREATE INDEX IF NOT EXISTS idx_ki_import_sessions_tenant_env ON ki_import_sessions (tenant_id, is_live);
  END IF;

END $$;
