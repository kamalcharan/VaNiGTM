-- ============================================================
-- KI-Prime — Migration 006: Metrics Calculation RPC
--
-- PostgreSQL function that calculates all NAV metrics for a scheme
-- in a single pass using window functions. Replaces Node.js
-- row-by-row calculation from kewalinvest.
--
-- Metrics: daily_return, return_1w/1m/3m/6m/1y/ytd/all,
--          sd_7d/14d/21d/42d/3m/6m, sharpe_ratio, max_drawdown, cagr
-- ============================================================

DROP FUNCTION IF EXISTS calculate_scheme_metrics(TEXT) CASCADE;

CREATE OR REPLACE FUNCTION calculate_scheme_metrics(p_scheme_code TEXT)
RETURNS TABLE(
    records_updated INTEGER,
    execution_ms INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_start_time    TIMESTAMP;
    v_count         INTEGER := 0;
    v_earliest_nav  NUMERIC;
    v_earliest_date DATE;
BEGIN
    v_start_time := clock_timestamp();

    -- Get earliest NAV for CAGR calculation
    SELECT nav, nav_date INTO v_earliest_nav, v_earliest_date
    FROM ki_nav_history
    WHERE scheme_code = p_scheme_code
    ORDER BY nav_date ASC
    LIMIT 1;

    IF v_earliest_nav IS NULL THEN
        RETURN QUERY SELECT 0, 0;
        RETURN;
    END IF;

    -- Single-pass UPDATE using window functions
    WITH nav_with_lookbacks AS (
        SELECT
            nh.id,
            nh.nav,
            nh.nav_date,

            -- Previous day NAV (for daily return)
            LAG(nh.nav, 1) OVER w AS prev_nav,

            -- Lookback NAVs for period returns
            -- 1 week (~5 trading days)
            (SELECT n2.nav FROM ki_nav_history n2
             WHERE n2.scheme_code = p_scheme_code
               AND n2.nav_date <= nh.nav_date - INTERVAL '7 days'
             ORDER BY n2.nav_date DESC LIMIT 1) AS nav_1w_ago,

            -- 1 month (~21 trading days)
            (SELECT n2.nav FROM ki_nav_history n2
             WHERE n2.scheme_code = p_scheme_code
               AND n2.nav_date <= nh.nav_date - INTERVAL '1 month'
             ORDER BY n2.nav_date DESC LIMIT 1) AS nav_1m_ago,

            -- 3 months
            (SELECT n2.nav FROM ki_nav_history n2
             WHERE n2.scheme_code = p_scheme_code
               AND n2.nav_date <= nh.nav_date - INTERVAL '3 months'
             ORDER BY n2.nav_date DESC LIMIT 1) AS nav_3m_ago,

            -- 6 months
            (SELECT n2.nav FROM ki_nav_history n2
             WHERE n2.scheme_code = p_scheme_code
               AND n2.nav_date <= nh.nav_date - INTERVAL '6 months'
             ORDER BY n2.nav_date DESC LIMIT 1) AS nav_6m_ago,

            -- 1 year
            (SELECT n2.nav FROM ki_nav_history n2
             WHERE n2.scheme_code = p_scheme_code
               AND n2.nav_date <= nh.nav_date - INTERVAL '1 year'
             ORDER BY n2.nav_date DESC LIMIT 1) AS nav_1y_ago,

            -- YTD (Jan 1 of same year)
            (SELECT n2.nav FROM ki_nav_history n2
             WHERE n2.scheme_code = p_scheme_code
               AND n2.nav_date <= date_trunc('year', nh.nav_date)::date
             ORDER BY n2.nav_date DESC LIMIT 1) AS nav_ytd_start,

            -- Rolling standard deviations of daily returns
            STDDEV_SAMP(
                CASE WHEN LAG(nh.nav, 1) OVER w > 0
                     THEN ((nh.nav - LAG(nh.nav, 1) OVER w) / LAG(nh.nav, 1) OVER w) * 100
                     ELSE NULL END
            ) OVER (PARTITION BY nh.scheme_code ORDER BY nh.nav_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS raw_sd_7d,

            STDDEV_SAMP(
                CASE WHEN LAG(nh.nav, 1) OVER w > 0
                     THEN ((nh.nav - LAG(nh.nav, 1) OVER w) / LAG(nh.nav, 1) OVER w) * 100
                     ELSE NULL END
            ) OVER (PARTITION BY nh.scheme_code ORDER BY nh.nav_date ROWS BETWEEN 13 PRECEDING AND CURRENT ROW) AS raw_sd_14d,

            STDDEV_SAMP(
                CASE WHEN LAG(nh.nav, 1) OVER w > 0
                     THEN ((nh.nav - LAG(nh.nav, 1) OVER w) / LAG(nh.nav, 1) OVER w) * 100
                     ELSE NULL END
            ) OVER (PARTITION BY nh.scheme_code ORDER BY nh.nav_date ROWS BETWEEN 20 PRECEDING AND CURRENT ROW) AS raw_sd_21d,

            STDDEV_SAMP(
                CASE WHEN LAG(nh.nav, 1) OVER w > 0
                     THEN ((nh.nav - LAG(nh.nav, 1) OVER w) / LAG(nh.nav, 1) OVER w) * 100
                     ELSE NULL END
            ) OVER (PARTITION BY nh.scheme_code ORDER BY nh.nav_date ROWS BETWEEN 41 PRECEDING AND CURRENT ROW) AS raw_sd_42d,

            STDDEV_SAMP(
                CASE WHEN LAG(nh.nav, 1) OVER w > 0
                     THEN ((nh.nav - LAG(nh.nav, 1) OVER w) / LAG(nh.nav, 1) OVER w) * 100
                     ELSE NULL END
            ) OVER (PARTITION BY nh.scheme_code ORDER BY nh.nav_date ROWS BETWEEN 62 PRECEDING AND CURRENT ROW) AS raw_sd_3m,

            STDDEV_SAMP(
                CASE WHEN LAG(nh.nav, 1) OVER w > 0
                     THEN ((nh.nav - LAG(nh.nav, 1) OVER w) / LAG(nh.nav, 1) OVER w) * 100
                     ELSE NULL END
            ) OVER (PARTITION BY nh.scheme_code ORDER BY nh.nav_date ROWS BETWEEN 125 PRECEDING AND CURRENT ROW) AS raw_sd_6m,

            -- Max drawdown: running max vs current
            MAX(nh.nav) OVER (PARTITION BY nh.scheme_code ORDER BY nh.nav_date ROWS BETWEEN 251 PRECEDING AND CURRENT ROW) AS running_max_1y,

            -- Row number for counting
            ROW_NUMBER() OVER w AS rn

        FROM ki_nav_history nh
        WHERE nh.scheme_code = p_scheme_code
        WINDOW w AS (PARTITION BY nh.scheme_code ORDER BY nh.nav_date)
    )
    UPDATE ki_nav_history nh
    SET
        -- Daily return
        daily_return = CASE WHEN nl.prev_nav > 0
            THEN ROUND(((nl.nav - nl.prev_nav) / nl.prev_nav) * 100, 6)
            ELSE NULL END,

        -- Period returns
        return_1w = CASE WHEN nl.nav_1w_ago > 0
            THEN ROUND(((nl.nav - nl.nav_1w_ago) / nl.nav_1w_ago) * 100, 6)
            ELSE NULL END,
        return_1m = CASE WHEN nl.nav_1m_ago > 0
            THEN ROUND(((nl.nav - nl.nav_1m_ago) / nl.nav_1m_ago) * 100, 6)
            ELSE NULL END,
        return_3m = CASE WHEN nl.nav_3m_ago > 0
            THEN ROUND(((nl.nav - nl.nav_3m_ago) / nl.nav_3m_ago) * 100, 6)
            ELSE NULL END,
        return_6m = CASE WHEN nl.nav_6m_ago > 0
            THEN ROUND(((nl.nav - nl.nav_6m_ago) / nl.nav_6m_ago) * 100, 6)
            ELSE NULL END,
        return_1y = CASE WHEN nl.nav_1y_ago > 0
            THEN ROUND(((nl.nav - nl.nav_1y_ago) / nl.nav_1y_ago) * 100, 6)
            ELSE NULL END,
        return_ytd = CASE WHEN nl.nav_ytd_start > 0
            THEN ROUND(((nl.nav - nl.nav_ytd_start) / nl.nav_ytd_start) * 100, 6)
            ELSE NULL END,
        return_all = CASE WHEN v_earliest_nav > 0
            THEN ROUND(((nl.nav - v_earliest_nav) / v_earliest_nav) * 100, 6)
            ELSE NULL END,

        -- Volatility (standard deviation of daily returns)
        sd_7d = ROUND(nl.raw_sd_7d, 6),
        sd_14d = ROUND(nl.raw_sd_14d, 6),
        sd_21d = ROUND(nl.raw_sd_21d, 6),
        sd_42d = ROUND(nl.raw_sd_42d, 6),
        sd_3m = ROUND(nl.raw_sd_3m, 6),
        sd_6m = ROUND(nl.raw_sd_6m, 6),

        -- Sharpe ratio: (annualized return - risk free rate) / annualized volatility
        -- Using 1m return annualized / 21d vol annualized. Risk-free rate ~6% for India.
        sharpe_ratio = CASE
            WHEN nl.raw_sd_21d > 0 AND nl.nav_1m_ago > 0
            THEN ROUND(
                (((nl.nav - nl.nav_1m_ago) / nl.nav_1m_ago * 12 * 100) - 6.0) /
                (nl.raw_sd_21d * SQRT(252)),
                6)
            ELSE NULL END,

        -- Max drawdown (from 1Y running max)
        max_drawdown = CASE
            WHEN nl.running_max_1y > 0
            THEN ROUND(((nl.nav - nl.running_max_1y) / nl.running_max_1y) * 100, 6)
            ELSE NULL END,

        -- CAGR: (current / earliest) ^ (365 / days) - 1
        cagr = CASE
            WHEN v_earliest_nav > 0 AND nl.nav_date > v_earliest_date AND (nl.nav_date - v_earliest_date) > 30
            THEN ROUND(
                (POWER(nl.nav / v_earliest_nav, 365.0 / (nl.nav_date - v_earliest_date)) - 1) * 100,
                6)
            ELSE NULL END,

        -- Mark as calculated
        metrics_calculated_at = CURRENT_TIMESTAMP

    FROM nav_with_lookbacks nl
    WHERE nh.id = nl.id;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN QUERY SELECT
        v_count,
        EXTRACT(MILLISECOND FROM (clock_timestamp() - v_start_time))::INTEGER;
END;
$$;

COMMENT ON FUNCTION calculate_scheme_metrics IS
    'Calculate all NAV metrics (returns, volatility, Sharpe, CAGR, max drawdown) for a scheme in a single pass using window functions. Adapted from kewalinvest marketMetricsCalculator.';

-- ============================================================
-- Batch orchestrator: calculate metrics for all bookmarked schemes
-- ============================================================

DROP FUNCTION IF EXISTS calculate_all_scheme_metrics() CASCADE;

CREATE OR REPLACE FUNCTION calculate_all_scheme_metrics()
RETURNS TABLE(
    total_schemes INTEGER,
    total_records_updated INTEGER,
    execution_ms INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_start_time    TIMESTAMP;
    v_scheme        RECORD;
    v_total_schemes INTEGER := 0;
    v_total_records INTEGER := 0;
    v_result        RECORD;
BEGIN
    v_start_time := clock_timestamp();

    -- Process ALL schemes that have NAV data (not just bookmarked)
    FOR v_scheme IN
        SELECT DISTINCT scheme_code
        FROM ki_nav_history
        WHERE metrics_calculated_at IS NULL
           OR metrics_calculated_at < CURRENT_TIMESTAMP - INTERVAL '1 day'
        ORDER BY scheme_code
    LOOP
        SELECT * INTO v_result FROM calculate_scheme_metrics(v_scheme.scheme_code);
        v_total_schemes := v_total_schemes + 1;
        v_total_records := v_total_records + COALESCE(v_result.records_updated, 0);
    END LOOP;

    RETURN QUERY SELECT
        v_total_schemes,
        v_total_records,
        EXTRACT(MILLISECOND FROM (clock_timestamp() - v_start_time))::INTEGER;
END;
$$;

COMMENT ON FUNCTION calculate_all_scheme_metrics IS
    'Calculate metrics for all schemes with stale or missing metrics. Called by Cruise Control "Run Now".';
