-- ============================================================
-- KI-Prime — Product-Specific Migrations
-- Task: KI-19 | Run AFTER framework base migrations
-- ============================================================

-- ============================================================
-- 001: SCHEME MASTER DATA (shared, not tenant-scoped)
-- ============================================================

CREATE TABLE IF NOT EXISTS schemes (
    scheme_code     TEXT PRIMARY KEY,
    scheme_name     TEXT NOT NULL,
    amc             TEXT NOT NULL,
    category        TEXT NOT NULL,              -- e.g., 'Large Cap', 'Mid Cap', 'Debt - Short Duration'
    sub_category    TEXT,
    scheme_type     TEXT NOT NULL CHECK (scheme_type IN ('open', 'close', 'interval')),
    plan            TEXT CHECK (plan IN ('direct', 'regular', 'both')),
    isin_growth     TEXT,
    isin_dividend   TEXT,
    expense_ratio   NUMERIC(5,2),
    aum_cr          NUMERIC(12,2),              -- AUM in crores
    risk_grade      TEXT CHECK (risk_grade IN ('low', 'moderate-low', 'moderate', 'moderate-high', 'high')),
    benchmark       TEXT,
    launch_date     DATE,
    active          BOOLEAN NOT NULL DEFAULT true,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_schemes_category ON schemes(category);
CREATE INDEX idx_schemes_amc ON schemes(amc);
CREATE INDEX idx_schemes_name_search ON schemes USING gin(to_tsvector('english', scheme_name));

-- -----------------------------------------------------------
-- NAV HISTORY (shared, not tenant-scoped)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS nav_history (
    id              BIGSERIAL PRIMARY KEY,
    scheme_code     TEXT NOT NULL REFERENCES schemes(scheme_code),
    nav_date        DATE NOT NULL,
    nav             NUMERIC(12,4) NOT NULL,
    UNIQUE(scheme_code, nav_date)
);

CREATE INDEX idx_nav_scheme_date ON nav_history(scheme_code, nav_date DESC);

-- -----------------------------------------------------------
-- SCHEME CATEGORIES (reference table)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS scheme_categories (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    parent_category TEXT,                       -- e.g., 'Equity', 'Debt', 'Hybrid'
    default_return  NUMERIC(5,2),               -- Expected annual return %
    risk_level      TEXT CHECK (risk_level IN ('low', 'moderate', 'high'))
);


-- ============================================================
-- 002: CLIENT & PORTFOLIO TABLES (tenant-scoped)
-- ============================================================

-- -----------------------------------------------------------
-- CLIENTS
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
    id              SERIAL PRIMARY KEY,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    email           TEXT,
    phone           TEXT,
    pan_encrypted   TEXT,                       -- Encrypted PAN
    pan_last4       TEXT,                       -- Last 4 chars for display
    dob             DATE,
    address         TEXT,
    city            TEXT,
    state           TEXT,
    occupation      TEXT,
    annual_income   NUMERIC(14,2),
    risk_capacity   TEXT CHECK (risk_capacity IN ('conservative', 'moderate-conservative', 'moderate', 'moderate-aggressive', 'aggressive')),
    risk_tolerance  TEXT CHECK (risk_tolerance IN ('conservative', 'moderate-conservative', 'moderate', 'moderate-aggressive', 'aggressive')),
    risk_required   TEXT,
    risk_overall    TEXT,
    family_group_id INTEGER,
    tags            TEXT[] DEFAULT '{}',
    notes           TEXT,
    active          BOOLEAN NOT NULL DEFAULT true,
    last_interaction_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clients_tenant ON clients(tenant_id);
CREATE INDEX idx_clients_tenant_name ON clients(tenant_id, name);
CREATE INDEX idx_clients_family ON clients(tenant_id, family_group_id);
CREATE INDEX idx_clients_name_search ON clients USING gin(to_tsvector('english', name));

-- -----------------------------------------------------------
-- PORTFOLIOS (a client can have multiple — regular, direct, etc.)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS portfolios (
    id              SERIAL PRIMARY KEY,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id       INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name            TEXT NOT NULL DEFAULT 'Default',
    portfolio_type  TEXT NOT NULL DEFAULT 'regular' CHECK (portfolio_type IN ('regular', 'direct', 'nps', 'other')),
    active          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_portfolios_tenant ON portfolios(tenant_id);
CREATE INDEX idx_portfolios_client ON portfolios(tenant_id, client_id);

-- -----------------------------------------------------------
-- HOLDINGS (current state — units held per scheme)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS holdings (
    id              SERIAL PRIMARY KEY,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id       INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    portfolio_id    INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    scheme_code     TEXT NOT NULL REFERENCES schemes(scheme_code),
    units           NUMERIC(14,4) NOT NULL DEFAULT 0,
    avg_nav         NUMERIC(12,4),              -- Weighted average purchase NAV
    total_invested  NUMERIC(14,2) NOT NULL DEFAULT 0,
    is_sip          BOOLEAN NOT NULL DEFAULT false,
    sip_amount      NUMERIC(12,2),
    sip_date        INTEGER,                    -- Day of month for SIP
    sip_start_date  DATE,
    sip_end_date    DATE,
    sip_status      TEXT CHECK (sip_status IN ('active', 'paused', 'completed', 'bounced')),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, client_id, portfolio_id, scheme_code)
);

CREATE INDEX idx_holdings_tenant ON holdings(tenant_id);
CREATE INDEX idx_holdings_client ON holdings(tenant_id, client_id);
CREATE INDEX idx_holdings_scheme ON holdings(scheme_code);

-- -----------------------------------------------------------
-- TRANSACTIONS (buy, sell, switch, dividend)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id       INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    portfolio_id    INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    scheme_code     TEXT NOT NULL REFERENCES schemes(scheme_code),
    txn_type        TEXT NOT NULL CHECK (txn_type IN ('purchase', 'redemption', 'switch_in', 'switch_out', 'dividend_payout', 'dividend_reinvest')),
    txn_date        DATE NOT NULL,
    amount          NUMERIC(14,2) NOT NULL,     -- Gross amount
    units           NUMERIC(14,4) NOT NULL,
    nav             NUMERIC(12,4) NOT NULL,
    stamp_duty      NUMERIC(10,2) DEFAULT 0,
    stt             NUMERIC(10,2) DEFAULT 0,
    source          TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'investwell', 'cas', 'nse', 'api')),
    source_ref      TEXT,                       -- External reference ID
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_txn_tenant ON transactions(tenant_id);
CREATE INDEX idx_txn_client ON transactions(tenant_id, client_id);
CREATE INDEX idx_txn_client_date ON transactions(tenant_id, client_id, txn_date DESC);
CREATE INDEX idx_txn_scheme ON transactions(scheme_code, txn_date);
-- Dedup index for idempotent imports
CREATE UNIQUE INDEX idx_txn_dedup ON transactions(tenant_id, client_id, scheme_code, txn_date, amount, units) WHERE source != 'manual';


-- ============================================================
-- 003: GOALS & PLANNING
-- ============================================================

CREATE TABLE IF NOT EXISTS goals (
    id              SERIAL PRIMARY KEY,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id       INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    goal_type       TEXT NOT NULL CHECK (goal_type IN ('retirement', 'education', 'house', 'wedding', 'emergency', 'vehicle', 'travel', 'custom')),
    target_amount   NUMERIC(14,2) NOT NULL,     -- Today's value
    target_date     DATE NOT NULL,
    inflation_rate  NUMERIC(5,2) NOT NULL DEFAULT 6.0,
    expected_return NUMERIC(5,2) NOT NULL DEFAULT 12.0,
    current_corpus  NUMERIC(14,2) NOT NULL DEFAULT 0,
    monthly_sip     NUMERIC(12,2) NOT NULL DEFAULT 0,
    probability     NUMERIC(5,4),               -- 0 to 1.0
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'achieved', 'abandoned', 'paused')),
    linked_schemes  TEXT[] DEFAULT '{}',         -- scheme_codes linked to this goal
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_goals_tenant ON goals(tenant_id);
CREATE INDEX idx_goals_client ON goals(tenant_id, client_id);

-- -----------------------------------------------------------
-- GOAL PROJECTIONS CACHE (pre-computed monthly projections)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS goal_projections (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    goal_id         INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    month_index     INTEGER NOT NULL,           -- Months from now (0, 1, 2, ...)
    projected_date  DATE NOT NULL,
    corpus          NUMERIC(14,2) NOT NULL,
    contributions   NUMERIC(14,2) NOT NULL,     -- Cumulative
    growth          NUMERIC(14,2) NOT NULL,     -- Cumulative
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_projections_goal ON goal_projections(goal_id);


-- ============================================================
-- 004: ALERTS
-- ============================================================

CREATE TABLE IF NOT EXISTS alerts (
    id              SERIAL PRIMARY KEY,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id       INTEGER,                    -- NULL for tenant-level alerts
    alert_type      TEXT NOT NULL CHECK (alert_type IN (
        'rebalance_needed', 'sip_at_risk', 'goal_behind',
        'tax_harvest_opportunity', 'review_due', 'large_redemption',
        'new_nfo_match', 'sip_bounced', 'nav_drop'
    )),
    priority        TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
    title           TEXT NOT NULL,
    body            TEXT NOT NULL,
    action_skill    TEXT,                       -- Skill to invoke
    action_function TEXT,                       -- Function to call
    action_params   JSONB,                      -- Parameters for the skill call
    dismissed       BOOLEAN NOT NULL DEFAULT false,
    acted_on        BOOLEAN NOT NULL DEFAULT false,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_alerts_tenant ON alerts(tenant_id);
CREATE INDEX idx_alerts_tenant_active ON alerts(tenant_id, dismissed, acted_on) WHERE dismissed = false AND acted_on = false;
CREATE INDEX idx_alerts_client ON alerts(tenant_id, client_id);


-- ============================================================
-- 005: RLS POLICIES FOR PRODUCT TABLES
-- ============================================================

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_tenant_isolation ON clients
    FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY portfolio_tenant_isolation ON portfolios
    FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY holding_tenant_isolation ON holdings
    FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY txn_tenant_isolation ON transactions
    FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY goal_tenant_isolation ON goals
    FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY projection_tenant_isolation ON goal_projections
    FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY alert_tenant_isolation ON alerts
    FOR ALL USING (tenant_id::text = current_setting('app.tenant_id', true));


-- ============================================================
-- 006: TRIGGERS
-- ============================================================

CREATE TRIGGER trg_clients_updated
    BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_goals_updated
    BEFORE UPDATE ON goals FOR EACH ROW EXECUTE FUNCTION update_updated_at();
