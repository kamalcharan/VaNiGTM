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
-- ─────────────────────────────────────────────────────────────────────────────

-- ki_clients
ALTER TABLE ki_clients
  ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT TRUE;

-- ki_portfolios
ALTER TABLE ki_portfolios
  ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT TRUE;

-- ki_holdings
ALTER TABLE ki_holdings
  ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT TRUE;

-- ki_transactions
ALTER TABLE ki_transactions
  ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT TRUE;

-- ki_goals
ALTER TABLE ki_goals
  ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT TRUE;

-- ki_goal_projections
ALTER TABLE ki_goal_projections
  ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT TRUE;

-- ki_alerts
ALTER TABLE ki_alerts
  ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT TRUE;

-- ki_file_uploads (upload context is environment-specific)
ALTER TABLE ki_file_uploads
  ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT TRUE;

-- ki_import_sessions
ALTER TABLE ki_import_sessions
  ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT TRUE;

-- ki_import_staging (rows follow their session's environment)
ALTER TABLE ki_import_staging
  ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT TRUE;

-- ─── Indexes for common filter pattern: WHERE tenant_id = ? AND is_live = ? ──

CREATE INDEX IF NOT EXISTS idx_ki_clients_tenant_env
  ON ki_clients (tenant_id, is_live);

CREATE INDEX IF NOT EXISTS idx_ki_portfolios_tenant_env
  ON ki_portfolios (tenant_id, is_live);

CREATE INDEX IF NOT EXISTS idx_ki_holdings_tenant_env
  ON ki_holdings (tenant_id, is_live);

CREATE INDEX IF NOT EXISTS idx_ki_transactions_tenant_env
  ON ki_transactions (tenant_id, is_live);

CREATE INDEX IF NOT EXISTS idx_ki_goals_tenant_env
  ON ki_goals (tenant_id, is_live);

CREATE INDEX IF NOT EXISTS idx_ki_alerts_tenant_env
  ON ki_alerts (tenant_id, is_live);

CREATE INDEX IF NOT EXISTS idx_ki_import_sessions_tenant_env
  ON ki_import_sessions (tenant_id, is_live);

COMMENT ON COLUMN ki_clients.is_live          IS 'TRUE = live environment, FALSE = sandbox. Set from JWT at record creation time.';
COMMENT ON COLUMN ki_portfolios.is_live        IS 'TRUE = live environment, FALSE = sandbox.';
COMMENT ON COLUMN ki_holdings.is_live          IS 'TRUE = live environment, FALSE = sandbox.';
COMMENT ON COLUMN ki_transactions.is_live      IS 'TRUE = live environment, FALSE = sandbox.';
COMMENT ON COLUMN ki_goals.is_live             IS 'TRUE = live environment, FALSE = sandbox.';
COMMENT ON COLUMN ki_goal_projections.is_live  IS 'TRUE = live environment, FALSE = sandbox.';
COMMENT ON COLUMN ki_alerts.is_live            IS 'TRUE = live environment, FALSE = sandbox.';
COMMENT ON COLUMN ki_file_uploads.is_live      IS 'TRUE = live environment, FALSE = sandbox.';
COMMENT ON COLUMN ki_import_sessions.is_live   IS 'TRUE = live environment, FALSE = sandbox.';
COMMENT ON COLUMN ki_import_staging.is_live    IS 'TRUE = live environment, FALSE = sandbox. Mirrors the parent session.';
