-- ============================================================
-- KI-Prime — Migration 005: NAV System
--
-- Tables: ki_scheme_bookmarks, ki_scheduler_configs, ki_scheduler_executions
-- Extends: ki_nav_history with metrics columns
-- Extends: ki_schemes with active tracking for ended schemes
-- ============================================================

-- ============================================================
-- 1. EXTEND ki_schemes — track ended schemes
-- ============================================================

-- Schemes that have closure_date in the past should not get daily NAV downloads.
-- The 'active' column already exists (boolean, default true).
-- Add a function to auto-detect ended schemes after import.

CREATE OR REPLACE FUNCTION ki_mark_ended_schemes()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE ki_schemes
  SET active = false, updated_at = now()
  WHERE closure_date IS NOT NULL
    AND closure_date < CURRENT_DATE
    AND active = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION ki_mark_ended_schemes IS 'Mark schemes with past closure_date as inactive. Run after SchemeMaster import.';

-- ============================================================
-- 2. SCHEME BOOKMARKS (tenant-scoped)
-- ============================================================

CREATE TABLE IF NOT EXISTS ki_scheme_bookmarks (
    id                          SERIAL PRIMARY KEY,
    tenant_id                   UUID NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    user_id                     UUID,
    scheme_code                 TEXT NOT NULL REFERENCES ki_schemes(scheme_code),
    -- Denormalized for fast display (avoid joins on large bookmark lists)
    scheme_name                 TEXT,
    amc                         TEXT,
    -- Alias for transaction import matching (e.g., "HDFC Top 100" → matches import data)
    alias_name                  TEXT,
    -- Download config
    daily_download_enabled      BOOLEAN NOT NULL DEFAULT true,
    download_time               TEXT DEFAULT '21:00',  -- HH:MM IST
    historical_download_done    BOOLEAN NOT NULL DEFAULT false,
    -- Timestamps
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, scheme_code)
);

CREATE INDEX IF NOT EXISTS idx_ki_bookmarks_tenant ON ki_scheme_bookmarks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ki_bookmarks_scheme ON ki_scheme_bookmarks(scheme_code);
CREATE INDEX IF NOT EXISTS idx_ki_bookmarks_daily ON ki_scheme_bookmarks(daily_download_enabled) WHERE daily_download_enabled = true;

-- RLS
ALTER TABLE ki_scheme_bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY bookmark_tenant_isolation ON ki_scheme_bookmarks
    FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true));

-- Trigger
CREATE TRIGGER trg_ki_bookmarks_updated
    BEFORE UPDATE ON ki_scheme_bookmarks FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 3. EXTEND ki_nav_history — metrics columns
--
-- Metrics are calculated ONCE and stored (not recalculated on read).
-- metrics_calculated_at tracks freshness for idempotency.
-- ============================================================

ALTER TABLE ki_nav_history
  ADD COLUMN IF NOT EXISTS daily_return       NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS return_1w          NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS return_1m          NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS return_3m          NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS return_6m          NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS return_1y          NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS return_ytd         NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS return_all         NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS sd_7d              NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS sd_14d             NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS sd_21d             NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS sd_42d             NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS sd_3m              NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS sd_6m              NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS sharpe_ratio       NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS max_drawdown       NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS cagr               NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS metrics_calculated_at TIMESTAMPTZ;

-- ============================================================
-- 4. SCHEDULER CONFIGS (generic — works for any scheduled job)
-- ============================================================

CREATE TABLE IF NOT EXISTS ki_scheduler_configs (
    id                  SERIAL PRIMARY KEY,
    tenant_id           UUID REFERENCES vn_tenants(id) ON DELETE CASCADE,  -- NULL = system-wide
    job_code            TEXT NOT NULL,                                      -- 'nav_download', 'metrics_calc', 'portfolio_snapshot', 'daily_alerts'
    is_enabled          BOOLEAN NOT NULL DEFAULT true,
    schedule_type       TEXT NOT NULL DEFAULT 'daily'
                        CHECK (schedule_type IN ('daily', 'weekly', 'custom')),
    cron_expression     TEXT NOT NULL DEFAULT '0 21 * * *',                -- Default: 9 PM daily
    download_time       TEXT DEFAULT '21:00',                              -- HH:MM for display
    max_retries         INTEGER NOT NULL DEFAULT 3,
    last_executed_at    TIMESTAMPTZ,
    next_execution_at   TIMESTAMPTZ,
    execution_count     INTEGER NOT NULL DEFAULT 0,
    failure_count       INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, job_code)
);

CREATE TRIGGER trg_ki_scheduler_configs_updated
    BEFORE UPDATE ON ki_scheduler_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 5. SCHEDULER EXECUTIONS (audit trail)
-- ============================================================

CREATE TABLE IF NOT EXISTS ki_scheduler_executions (
    id                      SERIAL PRIMARY KEY,
    scheduler_config_id     INTEGER REFERENCES ki_scheduler_configs(id) ON DELETE SET NULL,
    tenant_id               UUID,
    job_code                TEXT NOT NULL,
    trigger_source          TEXT NOT NULL DEFAULT 'manual'
                            CHECK (trigger_source IN ('scheduled', 'manual')),
    status                  TEXT NOT NULL DEFAULT 'running'
                            CHECK (status IN ('running', 'success', 'failed', 'skipped')),
    result_summary          JSONB,                                        -- { schemes_updated, failed, skipped, etc. }
    error_message           TEXT,
    execution_duration_ms   INTEGER,
    started_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at            TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ki_sched_exec_job ON ki_scheduler_executions(job_code, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ki_sched_exec_tenant ON ki_scheduler_executions(tenant_id) WHERE tenant_id IS NOT NULL;

-- ============================================================
-- 6. AUTO-MARK ENDED SCHEMES after this migration
-- ============================================================

SELECT ki_mark_ended_schemes();
