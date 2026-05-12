-- ============================================================================
-- Migration 017: KI Master Data Tables
--
-- Creates global master tables (no tenant_id — shared across all tenants):
--   ki_transaction_types  — 11 transaction type codes
--   ki_asset_types        — 10 asset type codes with default growth rates
--   ki_job_types          — 5 background job type configs
--
-- Creates tenant-scoped master table:
--   ki_bookmark_reasons   — 8 default reasons seeded per tenant on signup
--
-- Seed data matches kewalinvest/main client-deployment/database/05_seed_data.sql
-- for 100% parity with the MVP.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: ki_transaction_types (global — no tenant_id)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_transaction_types (
    id          SERIAL PRIMARY KEY,
    txn_code    VARCHAR(60)  UNIQUE NOT NULL,
    txn_name    VARCHAR(255) NOT NULL,
    txn_type    VARCHAR(20)  NOT NULL CHECK (txn_type IN ('Addition', 'Deduction')),
    is_active   BOOLEAN      NOT NULL DEFAULT true,
    description TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  ki_transaction_types               IS 'Global master: transaction types (SIP, Redemption, etc.)';
COMMENT ON COLUMN ki_transaction_types.txn_code      IS 'Unique code used in import file matching';
COMMENT ON COLUMN ki_transaction_types.txn_type      IS 'Addition = units increase, Deduction = units decrease';

CREATE INDEX IF NOT EXISTS idx_ki_txn_types_code
    ON ki_transaction_types(txn_code);

CREATE INDEX IF NOT EXISTS idx_ki_txn_types_active
    ON ki_transaction_types(is_active) WHERE is_active = true;

-- Seed: 11 transaction types (6 Addition, 5 Deduction)
INSERT INTO ki_transaction_types (txn_code, txn_name, txn_type, is_active, description) VALUES
    ('SIP',                     'Systematic Investment Plan',             'Addition',  true, 'Regular systematic investment at fixed intervals'),
    ('STP IN',                  'Systematic Transfer Plan - In',          'Addition',  true, 'Systematic transfer from another scheme (incoming)'),
    ('PURCHASE',                'One-Time Purchase',                      'Addition',  true, 'Lump sum purchase or investment transaction'),
    ('SWITCH IN',               'Switch In',                              'Addition',  true, 'Funds received from switching from another scheme'),
    ('OPENING BALANCE',         'Opening Balance',                        'Addition',  true, 'Opening balance record to align transaction history'),
    ('SYSTEMATIC TRANSFER IN',  'Systematic Transfer In',                 'Addition',  true, 'STP IN alternate code for import file compatibility'),
    ('STP OUT',                 'Systematic Transfer Plan - Out',         'Deduction', true, 'Systematic transfer to another scheme (outgoing)'),
    ('REDEMPTION',              'Redemption',                             'Deduction', true, 'Withdrawal or redemption of invested funds'),
    ('SWITCH OUT',              'Switch Out',                             'Deduction', true, 'Funds moved out by switching to another scheme'),
    ('SELL',                    'Sell',                                   'Deduction', true, 'Funds encashed from the scheme'),
    ('SYSTEMATIC TRANSFER OUT', 'Systematic Transfer Out',                'Deduction', true, 'STP OUT alternate code for import file compatibility')
ON CONFLICT (txn_code) DO UPDATE SET
    txn_name    = EXCLUDED.txn_name,
    txn_type    = EXCLUDED.txn_type,
    is_active   = EXCLUDED.is_active,
    description = EXCLUDED.description,
    updated_at  = now();

-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: ki_asset_types (global — no tenant_id)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_asset_types (
    id                     SERIAL PRIMARY KEY,
    asset_type_code        VARCHAR(50)   UNIQUE NOT NULL,
    asset_type_name        VARCHAR(100)  NOT NULL,
    category               VARCHAR(50)   CHECK (category IN ('equity', 'fixed_income', 'commodity', 'real_estate', 'insurance')),
    default_assumption_rate DECIMAL(5,2) DEFAULT 0,
    display_order          INTEGER       NOT NULL DEFAULT 0,
    is_active              BOOLEAN       NOT NULL DEFAULT true,
    description            TEXT,
    created_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE  ki_asset_types                            IS 'Global master: supported asset types with default growth rate assumptions';
COMMENT ON COLUMN ki_asset_types.asset_type_code           IS 'Unique short code (MF, GOLD, EQUITY, FD, etc.)';
COMMENT ON COLUMN ki_asset_types.default_assumption_rate   IS 'Default expected annual growth rate % (e.g. 12.00 for 12%)';

-- Seed: 10 asset types
INSERT INTO ki_asset_types (asset_type_code, asset_type_name, category, default_assumption_rate, display_order, is_active, description) VALUES
    ('MF',          'Mutual Fund',              'equity',       12.00,  1, true, 'Equity and debt mutual funds with professionally managed portfolios'),
    ('GOLD',        'Gold',                     'commodity',     8.00,  2, true, 'Physical gold, gold ETFs, Sovereign Gold Bonds, gold mutual funds'),
    ('SILVER',      'Silver',                   'commodity',     7.00,  3, true, 'Physical silver, silver ETFs, and silver-backed investments'),
    ('EQUITY',      'Equity',                   'equity',       15.00,  4, true, 'Direct equity investments in stocks and shares'),
    ('FD',          'Fixed Deposit',            'fixed_income',  6.50,  5, true, 'Bank and corporate fixed deposits with guaranteed returns'),
    ('PPF',         'Public Provident Fund',    'fixed_income',  7.10,  6, true, 'Government-backed long-term savings with tax benefits'),
    ('EPF',         'Employee Provident Fund',  'fixed_income',  8.25,  7, true, 'Mandatory retirement savings for salaried employees'),
    ('NPS',         'National Pension System',  'equity',       10.00,  8, true, 'Government-sponsored pension scheme with equity and debt options'),
    ('REAL_ESTATE', 'Real Estate',              'real_estate',   8.00,  9, true, 'Property investments: residential and commercial real estate'),
    ('INSURANCE',   'Insurance',                'insurance',     5.00, 10, true, 'Life insurance, term plans, and insurance-linked investment products')
ON CONFLICT (asset_type_code) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: ki_job_types (global — no tenant_id)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_job_types (
    code                     VARCHAR(60) PRIMARY KEY,
    name                     VARCHAR(100) NOT NULL,
    description              TEXT,
    default_cron_expression  VARCHAR(100),
    default_max_retries      INTEGER NOT NULL DEFAULT 3,
    default_schedule_type    VARCHAR(20) NOT NULL DEFAULT 'daily'
                             CHECK (default_schedule_type IN ('daily', 'weekly', 'monthly', 'custom')),
    failover_enabled         BOOLEAN NOT NULL DEFAULT false,
    failover_cron_expression VARCHAR(100),
    is_global                BOOLEAN NOT NULL DEFAULT false,
    is_active                BOOLEAN NOT NULL DEFAULT true,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  ki_job_types              IS 'Global registry of background job types';
COMMENT ON COLUMN ki_job_types.is_global    IS 'True = runs once for all tenants (NAV/Market). False = runs per-tenant.';
COMMENT ON COLUMN ki_job_types.code         IS 'Primary key code used in scheduler configs';

-- Seed: 5 job types (matching kewalinvest m_job_types)
INSERT INTO ki_job_types
    (code, name, description, default_cron_expression, default_max_retries,
     default_schedule_type, failover_enabled, failover_cron_expression, is_global, is_active)
VALUES
    -- Per-tenant jobs
    ('PORTFOLIO_SNAPSHOT',
     'Portfolio Snapshot Generation',
     'Generate weekly portfolio snapshots for all clients to enable performance tracking',
     '0 21 * * 5', 3, 'weekly', false, NULL, false, true),

    -- Global jobs (run once for all tenants)
    ('NAV_DOWNLOAD',
     'NAV Download',
     'Download daily NAV data for all bookmarked schemes',
     '0 21 * * *', 3, 'daily', true, '0 22 * * *', true, true),

    ('MARKET_OHLC_DOWNLOAD',
     'Market OHLC Download',
     'Download end-of-day OHLC data for all tracked market indices',
     '30 21 * * *', 3, 'daily', false, NULL, true, true),

    ('METRICS_CALCULATION',
     'Metrics Calculation',
     'Calculate Sharpe ratio, CAGR, max drawdown and other metrics for schemes and indices',
     '0 23 * * *', 3, 'daily', false, NULL, true, true),

    ('SCHEME_MASTER_SYNC',
     'Scheme Master Sync',
     'Sync AMC scheme master from MFAPI — adds new schemes, updates names',
     '0 2 * * 0', 3, 'weekly', false, NULL, true, true)

ON CONFLICT (code) DO UPDATE SET
    name                     = EXCLUDED.name,
    description              = EXCLUDED.description,
    default_cron_expression  = EXCLUDED.default_cron_expression,
    default_max_retries      = EXCLUDED.default_max_retries,
    default_schedule_type    = EXCLUDED.default_schedule_type,
    failover_enabled         = EXCLUDED.failover_enabled,
    failover_cron_expression = EXCLUDED.failover_cron_expression,
    is_global                = EXCLUDED.is_global,
    is_active                = EXCLUDED.is_active,
    updated_at               = now();

-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: ki_bookmark_reasons (tenant-scoped — seeded per tenant on signup)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_bookmark_reasons (
    id            SERIAL PRIMARY KEY,
    tenant_id     UUID        NOT NULL,
    is_live       BOOLEAN     NOT NULL DEFAULT true,
    reason_code   VARCHAR(60) NOT NULL,
    reason_label  VARCHAR(100) NOT NULL,
    display_order INTEGER     NOT NULL DEFAULT 0,
    is_active     BOOLEAN     NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_bookmark_reason_per_tenant UNIQUE (tenant_id, is_live, reason_code)
);

COMMENT ON TABLE  ki_bookmark_reasons              IS 'Tenant-scoped bookmark reason master data — seeded 8 defaults on signup';
COMMENT ON COLUMN ki_bookmark_reasons.tenant_id    IS 'Tenant UUID — every row is tenant-isolated';
COMMENT ON COLUMN ki_bookmark_reasons.is_live      IS 'Environment: true=live, false=sandbox';
COMMENT ON COLUMN ki_bookmark_reasons.reason_code  IS 'Short code (VIP, FOLLOW_UP, etc.)';

CREATE INDEX IF NOT EXISTS idx_ki_bookmark_reasons_tenant
    ON ki_bookmark_reasons(tenant_id, is_live);

-- RLS (tenant isolation)
ALTER TABLE ki_bookmark_reasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ki_bookmark_reasons_tenant_isolation ON ki_bookmark_reasons;
CREATE POLICY ki_bookmark_reasons_tenant_isolation
    ON ki_bookmark_reasons
    USING (tenant_id::text = current_setting('app.current_tenant_id', true));

DO $$
BEGIN
    RAISE NOTICE '[017] ki_transaction_types: % rows', (SELECT COUNT(*) FROM ki_transaction_types);
    RAISE NOTICE '[017] ki_asset_types: % rows',       (SELECT COUNT(*) FROM ki_asset_types);
    RAISE NOTICE '[017] ki_job_types: % rows',         (SELECT COUNT(*) FROM ki_job_types);
    RAISE NOTICE '[017] ki_bookmark_reasons table created (seeded per tenant on registration)';
END $$;
