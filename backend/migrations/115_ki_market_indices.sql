-- ============================================================
-- KI-Prime — Migration 015: Market Indices System
--
-- Tables: ki_market_indices, ki_market_data, ki_market_jobs
-- Function: calculate_market_metrics(index_id)
-- Seed: 55 NSE indices (broad, sectoral, thematic)
--
-- Global tables — no tenant_id. Data sourced from Yahoo Finance.
-- OHLCV data with inline metrics (same pattern as ki_nav_history).
-- ============================================================

-- ============================================================
-- 1. MARKET INDICES MASTER
-- ============================================================

CREATE TABLE IF NOT EXISTS ki_market_indices (
    id                          SERIAL PRIMARY KEY,
    index_code                  TEXT NOT NULL UNIQUE,
    index_name                  TEXT NOT NULL,
    yahoo_symbol                TEXT NOT NULL,          -- e.g. ^NSEI, ^NSEBANK
    category                    TEXT NOT NULL DEFAULT 'broad'
                                CHECK (category IN ('broad', 'sectoral', 'thematic')),
    description                 TEXT,
    priority                    INTEGER NOT NULL DEFAULT 99,
    is_active                   BOOLEAN NOT NULL DEFAULT true,
    provider_enabled            BOOLEAN NOT NULL DEFAULT true,

    -- Download tracking (denormalised for fast list queries)
    total_records               INTEGER NOT NULL DEFAULT 0,
    earliest_date               DATE,
    latest_date                 DATE,
    historical_data_available   BOOLEAN NOT NULL DEFAULT false,
    last_download_status        TEXT DEFAULT 'pending'
                                CHECK (last_download_status IN ('pending','running','success','failed')),
    last_download_at            TIMESTAMPTZ,
    last_download_error         TEXT,

    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ki_market_idx_category ON ki_market_indices(category);
CREATE INDEX IF NOT EXISTS idx_ki_market_idx_active   ON ki_market_indices(is_active);
CREATE INDEX IF NOT EXISTS idx_ki_market_idx_priority ON ki_market_indices(priority);

-- ============================================================
-- 2. MARKET OHLCV DATA (inline metrics — same pattern as ki_nav_history)
-- ============================================================

CREATE TABLE IF NOT EXISTS ki_market_data (
    id                          BIGSERIAL PRIMARY KEY,
    index_id                    INTEGER NOT NULL REFERENCES ki_market_indices(id) ON DELETE CASCADE,
    trade_date                  DATE NOT NULL,

    -- OHLCV
    open                        NUMERIC(12,4),
    high                        NUMERIC(12,4),
    low                         NUMERIC(12,4),
    close                       NUMERIC(12,4) NOT NULL,
    adj_close                   NUMERIC(12,4),
    volume                      BIGINT,

    -- Period returns (%)
    daily_return                NUMERIC(10,6),
    return_1w                   NUMERIC(10,6),
    return_1m                   NUMERIC(10,6),
    return_3m                   NUMERIC(10,6),
    return_6m                   NUMERIC(10,6),
    return_1y                   NUMERIC(10,6),
    return_ytd                  NUMERIC(10,6),
    return_all                  NUMERIC(10,6),

    -- Volatility — rolling standard deviation of daily returns
    sd_7d                       NUMERIC(10,6),
    sd_14d                      NUMERIC(10,6),
    sd_21d                      NUMERIC(10,6),
    sd_42d                      NUMERIC(10,6),
    sd_3m                       NUMERIC(10,6),
    sd_6m                       NUMERIC(10,6),

    -- Risk metrics
    sharpe_ratio                NUMERIC(10,6),
    max_drawdown                NUMERIC(10,6),
    cagr                        NUMERIC(10,6),
    total_risk                  NUMERIC(10,6),   -- annualised volatility (sd_6m * sqrt(252))

    metrics_calculated_at       TIMESTAMPTZ,

    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(index_id, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_ki_mdata_index_date ON ki_market_data(index_id, trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_ki_mdata_trade_date  ON ki_market_data(trade_date DESC);

-- ============================================================
-- 3. DOWNLOAD JOBS — tracks async download operations
-- ============================================================

CREATE TABLE IF NOT EXISTS ki_market_jobs (
    id                  SERIAL PRIMARY KEY,
    index_id            INTEGER REFERENCES ki_market_indices(id) ON DELETE SET NULL,
    job_type            TEXT NOT NULL CHECK (job_type IN ('historical', 'eod', 'eod_all', 'metrics', 'bulk_metrics')),
    status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'running', 'success', 'failed', 'cancelled')),
    start_date          DATE,
    end_date            DATE,
    records_inserted    INTEGER DEFAULT 0,
    records_updated     INTEGER DEFAULT 0,
    records_skipped     INTEGER DEFAULT 0,
    error_details       TEXT,
    execution_time_ms   INTEGER,
    triggered_by        TEXT DEFAULT 'user'
                        CHECK (triggered_by IN ('user', 'scheduler')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ki_mjobs_index  ON ki_market_jobs(index_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ki_mjobs_status ON ki_market_jobs(status) WHERE status IN ('pending','running');

-- ============================================================
-- 4. AUTO-UPDATE updated_at trigger on ki_market_indices
-- ============================================================

CREATE TRIGGER trg_ki_market_indices_updated
    BEFORE UPDATE ON ki_market_indices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_ki_market_data_updated
    BEFORE UPDATE ON ki_market_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 5. METRICS RPC — calculate_market_metrics(index_id)
--
-- Single-pass UPDATE using window functions.
-- Mirrors calculate_scheme_metrics() from migration 006 but for OHLCV.
-- Adds total_risk = annualised volatility.
-- ============================================================

DROP FUNCTION IF EXISTS calculate_market_metrics(INTEGER) CASCADE;

CREATE OR REPLACE FUNCTION calculate_market_metrics(p_index_id INTEGER)
RETURNS TABLE(records_updated INTEGER, execution_ms INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
    v_start_time    TIMESTAMP;
    v_count         INTEGER := 0;
    v_earliest_close NUMERIC;
    v_earliest_date  DATE;
BEGIN
    v_start_time := clock_timestamp();

    -- Get earliest close for all-time return & CAGR
    SELECT close, trade_date INTO v_earliest_close, v_earliest_date
    FROM ki_market_data
    WHERE index_id = p_index_id
    ORDER BY trade_date ASC
    LIMIT 1;

    IF v_earliest_close IS NULL THEN
        RETURN QUERY SELECT 0, 0;
        RETURN;
    END IF;

    WITH data_with_lookbacks AS (
        SELECT
            kmd.id,
            kmd.close,
            kmd.trade_date,

            -- Previous day close
            LAG(kmd.close, 1) OVER w AS prev_close,

            -- Lookback closes for period returns
            (SELECT d2.close FROM ki_market_data d2
             WHERE d2.index_id = p_index_id
               AND d2.trade_date <= kmd.trade_date - INTERVAL '7 days'
             ORDER BY d2.trade_date DESC LIMIT 1) AS close_1w_ago,

            (SELECT d2.close FROM ki_market_data d2
             WHERE d2.index_id = p_index_id
               AND d2.trade_date <= kmd.trade_date - INTERVAL '1 month'
             ORDER BY d2.trade_date DESC LIMIT 1) AS close_1m_ago,

            (SELECT d2.close FROM ki_market_data d2
             WHERE d2.index_id = p_index_id
               AND d2.trade_date <= kmd.trade_date - INTERVAL '3 months'
             ORDER BY d2.trade_date DESC LIMIT 1) AS close_3m_ago,

            (SELECT d2.close FROM ki_market_data d2
             WHERE d2.index_id = p_index_id
               AND d2.trade_date <= kmd.trade_date - INTERVAL '6 months'
             ORDER BY d2.trade_date DESC LIMIT 1) AS close_6m_ago,

            (SELECT d2.close FROM ki_market_data d2
             WHERE d2.index_id = p_index_id
               AND d2.trade_date <= kmd.trade_date - INTERVAL '1 year'
             ORDER BY d2.trade_date DESC LIMIT 1) AS close_1y_ago,

            (SELECT d2.close FROM ki_market_data d2
             WHERE d2.index_id = p_index_id
               AND d2.trade_date <= date_trunc('year', kmd.trade_date)::date
             ORDER BY d2.trade_date DESC LIMIT 1) AS close_ytd_start,

            -- Rolling standard deviations of daily returns
            STDDEV_SAMP(
                CASE WHEN LAG(kmd.close, 1) OVER w > 0
                     THEN ((kmd.close - LAG(kmd.close, 1) OVER w) / LAG(kmd.close, 1) OVER w) * 100
                     ELSE NULL END
            ) OVER (PARTITION BY kmd.index_id ORDER BY kmd.trade_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)  AS raw_sd_7d,

            STDDEV_SAMP(
                CASE WHEN LAG(kmd.close, 1) OVER w > 0
                     THEN ((kmd.close - LAG(kmd.close, 1) OVER w) / LAG(kmd.close, 1) OVER w) * 100
                     ELSE NULL END
            ) OVER (PARTITION BY kmd.index_id ORDER BY kmd.trade_date ROWS BETWEEN 13 PRECEDING AND CURRENT ROW) AS raw_sd_14d,

            STDDEV_SAMP(
                CASE WHEN LAG(kmd.close, 1) OVER w > 0
                     THEN ((kmd.close - LAG(kmd.close, 1) OVER w) / LAG(kmd.close, 1) OVER w) * 100
                     ELSE NULL END
            ) OVER (PARTITION BY kmd.index_id ORDER BY kmd.trade_date ROWS BETWEEN 20 PRECEDING AND CURRENT ROW) AS raw_sd_21d,

            STDDEV_SAMP(
                CASE WHEN LAG(kmd.close, 1) OVER w > 0
                     THEN ((kmd.close - LAG(kmd.close, 1) OVER w) / LAG(kmd.close, 1) OVER w) * 100
                     ELSE NULL END
            ) OVER (PARTITION BY kmd.index_id ORDER BY kmd.trade_date ROWS BETWEEN 41 PRECEDING AND CURRENT ROW) AS raw_sd_42d,

            STDDEV_SAMP(
                CASE WHEN LAG(kmd.close, 1) OVER w > 0
                     THEN ((kmd.close - LAG(kmd.close, 1) OVER w) / LAG(kmd.close, 1) OVER w) * 100
                     ELSE NULL END
            ) OVER (PARTITION BY kmd.index_id ORDER BY kmd.trade_date ROWS BETWEEN 62 PRECEDING AND CURRENT ROW) AS raw_sd_3m,

            STDDEV_SAMP(
                CASE WHEN LAG(kmd.close, 1) OVER w > 0
                     THEN ((kmd.close - LAG(kmd.close, 1) OVER w) / LAG(kmd.close, 1) OVER w) * 100
                     ELSE NULL END
            ) OVER (PARTITION BY kmd.index_id ORDER BY kmd.trade_date ROWS BETWEEN 125 PRECEDING AND CURRENT ROW) AS raw_sd_6m,

            -- Running max for max drawdown (1Y window)
            MAX(kmd.close) OVER (PARTITION BY kmd.index_id ORDER BY kmd.trade_date ROWS BETWEEN 251 PRECEDING AND CURRENT ROW) AS running_max_1y

        FROM ki_market_data kmd
        WHERE kmd.index_id = p_index_id
        WINDOW w AS (PARTITION BY kmd.index_id ORDER BY kmd.trade_date)
    )
    UPDATE ki_market_data kmd
    SET
        daily_return = CASE WHEN dl.prev_close > 0
            THEN ROUND(((dl.close - dl.prev_close) / dl.prev_close) * 100, 6)
            ELSE NULL END,

        return_1w = CASE WHEN dl.close_1w_ago > 0
            THEN ROUND(((dl.close - dl.close_1w_ago) / dl.close_1w_ago) * 100, 6)
            ELSE NULL END,
        return_1m = CASE WHEN dl.close_1m_ago > 0
            THEN ROUND(((dl.close - dl.close_1m_ago) / dl.close_1m_ago) * 100, 6)
            ELSE NULL END,
        return_3m = CASE WHEN dl.close_3m_ago > 0
            THEN ROUND(((dl.close - dl.close_3m_ago) / dl.close_3m_ago) * 100, 6)
            ELSE NULL END,
        return_6m = CASE WHEN dl.close_6m_ago > 0
            THEN ROUND(((dl.close - dl.close_6m_ago) / dl.close_6m_ago) * 100, 6)
            ELSE NULL END,
        return_1y = CASE WHEN dl.close_1y_ago > 0
            THEN ROUND(((dl.close - dl.close_1y_ago) / dl.close_1y_ago) * 100, 6)
            ELSE NULL END,
        return_ytd = CASE WHEN dl.close_ytd_start > 0
            THEN ROUND(((dl.close - dl.close_ytd_start) / dl.close_ytd_start) * 100, 6)
            ELSE NULL END,
        return_all = CASE WHEN v_earliest_close > 0
            THEN ROUND(((dl.close - v_earliest_close) / v_earliest_close) * 100, 6)
            ELSE NULL END,

        sd_7d   = ROUND(dl.raw_sd_7d,  6),
        sd_14d  = ROUND(dl.raw_sd_14d, 6),
        sd_21d  = ROUND(dl.raw_sd_21d, 6),
        sd_42d  = ROUND(dl.raw_sd_42d, 6),
        sd_3m   = ROUND(dl.raw_sd_3m,  6),
        sd_6m   = ROUND(dl.raw_sd_6m,  6),

        -- Sharpe: (1m annualised return - 6% risk-free) / (21d vol * sqrt(252))
        sharpe_ratio = CASE
            WHEN dl.raw_sd_21d > 0 AND dl.close_1m_ago > 0
            THEN ROUND(
                (((dl.close - dl.close_1m_ago) / dl.close_1m_ago * 12 * 100) - 6.0) /
                (dl.raw_sd_21d * SQRT(252)),
                6)
            ELSE NULL END,

        -- Max drawdown from 1Y running high
        max_drawdown = CASE
            WHEN dl.running_max_1y > 0
            THEN ROUND(((dl.close - dl.running_max_1y) / dl.running_max_1y) * 100, 6)
            ELSE NULL END,

        -- CAGR from earliest record
        cagr = CASE
            WHEN v_earliest_close > 0
              AND dl.trade_date > v_earliest_date
              AND (dl.trade_date - v_earliest_date) > 30
            THEN ROUND(
                (POWER(dl.close / v_earliest_close, 365.0 / (dl.trade_date - v_earliest_date)) - 1) * 100,
                6)
            ELSE NULL END,

        -- Total risk = annualised volatility
        total_risk = CASE
            WHEN dl.raw_sd_6m IS NOT NULL
            THEN ROUND(dl.raw_sd_6m * SQRT(252), 6)
            ELSE NULL END,

        metrics_calculated_at = CURRENT_TIMESTAMP

    FROM data_with_lookbacks dl
    WHERE kmd.id = dl.id;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- Update summary stats on master table
    UPDATE ki_market_indices
    SET
        total_records             = (SELECT COUNT(*) FROM ki_market_data WHERE index_id = p_index_id),
        earliest_date             = (SELECT MIN(trade_date) FROM ki_market_data WHERE index_id = p_index_id),
        latest_date               = (SELECT MAX(trade_date) FROM ki_market_data WHERE index_id = p_index_id),
        historical_data_available = (SELECT COUNT(*) > 0 FROM ki_market_data WHERE index_id = p_index_id),
        updated_at                = now()
    WHERE id = p_index_id;

    RETURN QUERY SELECT
        v_count,
        EXTRACT(MILLISECOND FROM (clock_timestamp() - v_start_time))::INTEGER;
END;
$$;

COMMENT ON FUNCTION calculate_market_metrics IS 'Calculate all metrics for a market index in one SQL pass. Mirrors calculate_scheme_metrics for OHLCV data.';

-- ============================================================
-- 6. SEED DATA — 55 NSE indices
-- ============================================================

-- BROAD MARKET (priority 1-15)
INSERT INTO ki_market_indices (index_code, index_name, yahoo_symbol, category, description, priority) VALUES
('NSEI',            'Nifty 50',                 '^NSEI',          'broad', 'Top 50 large-cap companies on NSE', 1),
('NSENEXT50',       'Nifty Next 50',             '^NSMIDCP',       'broad', 'Next 50 companies after Nifty 50', 2),
('CNX100',          'Nifty 100',                 '^CNX100',        'broad', 'Combines Nifty 50 and Nifty Next 50', 3),
('CNX200',          'Nifty 200',                 '^CNX200',        'broad', 'Top 200 companies by market cap', 4),
('CNX500',          'Nifty 500',                 '^CNX500',        'broad', 'Broad market — 95% of free float market cap', 5),
('NIFTYMID50',      'Nifty Midcap 50',           '^NSEMDCP50',     'broad', 'Top 50 mid-cap companies', 6),
('NIFTYMID100',     'Nifty Midcap 100',          '^NSEMDCP100',    'broad', 'Top 100 mid-cap companies', 7),
('NIFTYMID150',     'Nifty Midcap 150',          '^NIFTY_MIDCAP_150.NS', 'broad', 'Top 150 mid-cap companies', 8),
('NIFTYSML50',      'Nifty Smallcap 50',         '^NIFTY_SMLCAP_50.NS', 'broad', 'Top 50 small-cap companies', 9),
('NIFTYSML100',     'Nifty Smallcap 100',        '^NIFTY_SMLCAP_100.NS', 'broad', 'Top 100 small-cap companies', 10),
('NIFTYSML250',     'Nifty Smallcap 250',        '^NIFTY_SMLCAP_250.NS', 'broad', 'Top 250 small-cap companies', 11),
('NIFTYMICRO250',   'Nifty Microcap 250',        '^NIFTY_MICROCAP250.NS', 'broad', 'Top 250 micro-cap companies', 12),
('NIFTYLRGMID250',  'Nifty LargeMidcap 250',     '^NIFTY_LM250.NS', 'broad', 'Large and mid-cap combined', 13),
('NIFTYTM',         'Nifty Total Market',        '^NIFTY_TOTAL_MKT.NS', 'broad', 'Represents entire NSE market', 14),
('INDIAVIX',        'India VIX',                 '^INDIAVIX',      'broad', 'Volatility index — market fear gauge', 15)
ON CONFLICT (index_code) DO NOTHING;

-- SECTORAL (priority 20-39)
INSERT INTO ki_market_indices (index_code, index_name, yahoo_symbol, category, description, priority) VALUES
('BANKNIFTY',       'Nifty Bank',                '^NSEBANK',       'sectoral', 'Banking sector index', 20),
('NIFTYIT',         'Nifty IT',                  '^CNXIT',         'sectoral', 'Information Technology sector', 21),
('NIFTYAUTO',       'Nifty Auto',                '^CNXAUTO',       'sectoral', 'Automobile sector index', 22),
('NIFTYFMCG',       'Nifty FMCG',                '^CNXFMCG',       'sectoral', 'Fast Moving Consumer Goods sector', 23),
('NIFTYPHARMA',     'Nifty Pharma',              '^CNXPHARMA',     'sectoral', 'Pharmaceutical sector index', 24),
('NIFTYMETAL',      'Nifty Metal',               '^CNXMETAL',      'sectoral', 'Metals and mining sector', 25),
('NIFTYREALTY',     'Nifty Realty',              '^CNXREALTY',     'sectoral', 'Real estate sector index', 26),
('NIFTYENERGY',     'Nifty Energy',              '^CNXENERGY',     'sectoral', 'Energy sector index', 27),
('NIFTYFINSRV',     'Nifty Financial Services',  '^CNXFINANCE',    'sectoral', 'Financial services sector', 28),
('NIFTYMEDIA',      'Nifty Media',               '^CNXMEDIA',      'sectoral', 'Media and entertainment sector', 29),
('NIFTYPVTBANK',    'Nifty Private Bank',        '^NIFTY_PVT_BANK.NS', 'sectoral', 'Private sector banks', 30),
('NIFTYPSUBANK',    'Nifty PSU Bank',            '^NIFTY_PSU_BANK.NS', 'sectoral', 'Public sector banks', 31),
('NIFTYOILGAS',     'Nifty Oil & Gas',           '^NIFTY_OIL_AND_GAS.NS', 'sectoral', 'Oil and gas sector', 32),
('NIFTYHEALTH',     'Nifty Healthcare',          '^NIFTY_HEALTHCARE.NS', 'sectoral', 'Healthcare sector index', 33),
('NIFTYCONSDUR',    'Nifty Consumer Durables',   '^NIFTY_CONSR_DURBL.NS', 'sectoral', 'Consumer durables sector', 34),
('NIFTYCOMMODITIES','Nifty Commodities',         '^NIFTY_COMMODITIES.NS', 'sectoral', 'Commodities sector index', 35),
('NIFTYINFRA',      'Nifty Infrastructure',      '^NIFTY_INFRA.NS', 'sectoral', 'Infrastructure sector', 36),
('NIFTYSERV',       'Nifty Services',            '^NIFTY_SERV_SECTOR.NS', 'sectoral', 'Services sector index', 37),
('NIFTYMNC',        'Nifty MNC',                 '^NIFTY_MNC.NS',  'sectoral', 'Multinational corporations', 38),
('NIFTYPSE',        'Nifty PSE',                 '^NIFTY_PSE.NS',  'sectoral', 'Public sector enterprises', 39)
ON CONFLICT (index_code) DO NOTHING;

-- THEMATIC (priority 40-54)
INSERT INTO ki_market_indices (index_code, index_name, yahoo_symbol, category, description, priority) VALUES
('NIFTYDIV50',      'Nifty Dividend Opportunities 50', '^NIFTY_DIV_OPPS_50.NS', 'thematic', 'High dividend yielding stocks', 40),
('NIFTYGS15',       'Nifty Growth Sectors 15',   '^NIFTY_GROWSECT_15.NS', 'thematic', 'Growth-oriented sectors', 41),
('NIFTYCONSUM',     'Nifty India Consumption',   '^NIFTY_CONSUMPTION.NS', 'thematic', 'Consumption-driven companies', 42),
('NIFTYDIGITAL',    'Nifty India Digital',       '^NIFTY_INDIA_DIGITAL.NS', 'thematic', 'Digital economy companies', 43),
('NIFTYMFG',        'Nifty India Manufacturing', '^NIFTY_INDIA_MFG.NS', 'thematic', 'Manufacturing sector focus', 44),
('NIFTYHOUSING',    'Nifty Housing',             '^NIFTY_HOUSING.NS', 'thematic', 'Housing and real estate', 45),
('NIFTYTRANSPORT',  'Nifty Transport & Logistics', '^NIFTY_TRANSPORT.NS', 'thematic', 'Transportation and logistics', 46),
('NIFTYMOBILITY',   'Nifty Mobility',            '^NIFTY_MOBILITY.NS', 'thematic', 'Mobility and transportation theme', 47),
('NIFTYMIDSML400',  'Nifty MidSmallcap 400',     '^NIFTY_MIDSML_400.NS', 'thematic', 'Mid and small-cap blend', 48),
('NIFTYQLTY30',     'Nifty100 Quality 30',       '^NIFTY100_QUALTY30.NS', 'thematic', 'Quality factor — ROE, leverage, earnings stability', 49),
('NIFTYALPHA50',    'Nifty Alpha 50',            '^NIFTY_ALPHA_50.NS', 'thematic', 'High alpha generating stocks', 50),
('NIFTYLOWVOL30',   'Nifty100 Low Volatility 30','^NIFTY100_LOWVOL30.NS', 'thematic', 'Low volatility stocks', 51),
('NIFTYCPSE',       'Nifty CPSE',                '^NIFTY_CPSE.NS', 'thematic', 'Central public sector enterprises', 52),
('NIFTYSME',        'Nifty SME Emerge',          '^NIFTY_SME_EMERGE.NS', 'thematic', 'Small and medium enterprises', 53),
('NIFTYRURAL',      'Nifty Rural',               '^NIFTY_RURAL.NS', 'thematic', 'Rural economy focus', 54),
('NIFTYMOBILITY2',  'Nifty Mobility (Alt)',      '^NIFTYMOBILITY', 'thematic', 'Mobility alternate symbol', 55)
ON CONFLICT (index_code) DO NOTHING;
