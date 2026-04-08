-- ============================================================================
-- Migration 018: KI Scheduler Tables
--
-- Per-tenant job scheduler configuration.
-- Each tenant gets one config row per job type per environment (live/sandbox).
-- Seeded on tenant signup by seedTenantData().
--
-- ki_job_scheduler_configs — per-tenant cron schedule overrides for each job
-- ============================================================================

CREATE TABLE IF NOT EXISTS ki_job_scheduler_configs (
    id                       SERIAL PRIMARY KEY,
    tenant_id                UUID        NOT NULL,
    job_type_code            VARCHAR(60) NOT NULL REFERENCES ki_job_types(code),
    is_live                  BOOLEAN     NOT NULL,
    schedule_type            VARCHAR(20) NOT NULL DEFAULT 'daily'
                             CHECK (schedule_type IN ('daily', 'weekly', 'monthly', 'custom')),
    cron_expression          VARCHAR(100) NOT NULL,
    is_enabled               BOOLEAN     NOT NULL DEFAULT true,
    max_retries              INTEGER     NOT NULL DEFAULT 3,
    job_config               JSONB,
    failover_enabled         BOOLEAN     NOT NULL DEFAULT false,
    failover_cron_expression VARCHAR(100),
    -- Execution tracking
    last_executed_at         TIMESTAMPTZ,
    next_execution_at        TIMESTAMPTZ,
    last_success_at          TIMESTAMPTZ,
    execution_count          INTEGER     NOT NULL DEFAULT 0,
    failure_count            INTEGER     NOT NULL DEFAULT 0,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_job_config_per_tenant UNIQUE (tenant_id, job_type_code, is_live)
);

COMMENT ON TABLE  ki_job_scheduler_configs                        IS 'Per-tenant cron schedule config for each job type';
COMMENT ON COLUMN ki_job_scheduler_configs.tenant_id              IS 'Tenant UUID — every row is tenant-isolated';
COMMENT ON COLUMN ki_job_scheduler_configs.job_type_code         IS 'FK to ki_job_types.code';
COMMENT ON COLUMN ki_job_scheduler_configs.is_live               IS 'Environment: true=live, false=sandbox';
COMMENT ON COLUMN ki_job_scheduler_configs.failover_enabled      IS 'Run failover cron if primary fails';
COMMENT ON COLUMN ki_job_scheduler_configs.execution_count       IS 'Total executions since config was created';
COMMENT ON COLUMN ki_job_scheduler_configs.failure_count         IS 'Total failures since config was created';

CREATE INDEX IF NOT EXISTS idx_ki_scheduler_configs_tenant
    ON ki_job_scheduler_configs(tenant_id, is_live);

CREATE INDEX IF NOT EXISTS idx_ki_scheduler_configs_job
    ON ki_job_scheduler_configs(job_type_code, is_enabled);

-- RLS (tenant isolation)
ALTER TABLE ki_job_scheduler_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ki_scheduler_configs_tenant_isolation ON ki_job_scheduler_configs;
CREATE POLICY ki_scheduler_configs_tenant_isolation
    ON ki_job_scheduler_configs
    USING (tenant_id::text = current_setting('app.current_tenant_id', true));

DO $$
BEGIN
    RAISE NOTICE '[018] ki_job_scheduler_configs table created (seeded per tenant on registration)';
END $$;
