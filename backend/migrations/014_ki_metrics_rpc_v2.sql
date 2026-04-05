-- ============================================================
-- KI-Prime — Migration 014: Metrics RPC v2 (runtime bug fixes)
--
-- Migration 013 created the functions but they fail at runtime:
--   1. ROUND(double precision, integer) — PG only has ROUND(numeric, int)
--      STDDEV_SAMP returns double precision — must cast ::NUMERIC
--   2. sharpe_ratio / max_drawdown divisions also return double precision
--
-- Fix: add ::NUMERIC cast on every ROUND(expression, N) call where
-- the expression may be double precision.
-- ============================================================

DROP FUNCTION IF EXISTS calculate_scheme_metrics(TEXT) CASCADE;

CREATE OR REPLACE FUNCTION calculate_scheme_metrics(p_scheme_code TEXT)
RETURNS TABLE(
    records_updated INTEGER,
    execution_ms    INTEGER
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

    SELECT nav, nav_date INTO v_earliest_nav, v_earliest_date
    FROM ki_nav_history
    WHERE scheme_code = p_scheme_code
    ORDER BY nav_date ASC
    LIMIT 1;

    IF v_earliest_nav IS NULL THEN
        RETURN QUERY SELECT 0, 0;
        RETURN;
    END IF;

    WITH

    -- Step 1: prev_nav via LAG
    nav_base AS (
        SELECT
            nh.id,
            nh.nav,
            nh.nav_date,
            nh.scheme_code,
            LAG(nh.nav, 1) OVER (PARTITION BY nh.scheme_code ORDER BY nh.nav_date) AS prev_nav
        FROM ki_nav_history nh
        WHERE nh.scheme_code = p_scheme_code
    ),

    -- Step 2: daily_return_pct as plain column (no nested window functions)
    nav_daily AS (
        SELECT
            id, nav, nav_date, scheme_code, prev_nav,
            CASE WHEN prev_nav > 0
                 THEN ((nav - prev_nav) / prev_nav) * 100
                 ELSE NULL
            END AS daily_return_pct
        FROM nav_base
    ),

    -- Step 3: lookbacks + rolling stddev over daily_return_pct + running max
    nav_with_lookbacks AS (
        SELECT
            nd.id,
            nd.nav,
            nd.nav_date,
            nd.prev_nav,

            (SELECT n2.nav FROM ki_nav_history n2
             WHERE n2.scheme_code = p_scheme_code
               AND n2.nav_date <= nd.nav_date - INTERVAL '7 days'
             ORDER BY n2.nav_date DESC LIMIT 1) AS nav_1w_ago,

            (SELECT n2.nav FROM ki_nav_history n2
             WHERE n2.scheme_code = p_scheme_code
               AND n2.nav_date <= nd.nav_date - INTERVAL '1 month'
             ORDER BY n2.nav_date DESC LIMIT 1) AS nav_1m_ago,

            (SELECT n2.nav FROM ki_nav_history n2
             WHERE n2.scheme_code = p_scheme_code
               AND n2.nav_date <= nd.nav_date - INTERVAL '3 months'
             ORDER BY n2.nav_date DESC LIMIT 1) AS nav_3m_ago,

            (SELECT n2.nav FROM ki_nav_history n2
             WHERE n2.scheme_code = p_scheme_code
               AND n2.nav_date <= nd.nav_date - INTERVAL '6 months'
             ORDER BY n2.nav_date DESC LIMIT 1) AS nav_6m_ago,

            (SELECT n2.nav FROM ki_nav_history n2
             WHERE n2.scheme_code = p_scheme_code
               AND n2.nav_date <= nd.nav_date - INTERVAL '1 year'
             ORDER BY n2.nav_date DESC LIMIT 1) AS nav_1y_ago,

            (SELECT n2.nav FROM ki_nav_history n2
             WHERE n2.scheme_code = p_scheme_code
               AND n2.nav_date <= date_trunc('year', nd.nav_date)::date
             ORDER BY n2.nav_date DESC LIMIT 1) AS nav_ytd_start,

            -- STDDEV_SAMP returns double precision — kept as-is, cast at ROUND site
            STDDEV_SAMP(nd.daily_return_pct)
                OVER (PARTITION BY nd.scheme_code ORDER BY nd.nav_date
                      ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)   AS raw_sd_7d,

            STDDEV_SAMP(nd.daily_return_pct)
                OVER (PARTITION BY nd.scheme_code ORDER BY nd.nav_date
                      ROWS BETWEEN 13 PRECEDING AND CURRENT ROW)  AS raw_sd_14d,

            STDDEV_SAMP(nd.daily_return_pct)
                OVER (PARTITION BY nd.scheme_code ORDER BY nd.nav_date
                      ROWS BETWEEN 20 PRECEDING AND CURRENT ROW)  AS raw_sd_21d,

            STDDEV_SAMP(nd.daily_return_pct)
                OVER (PARTITION BY nd.scheme_code ORDER BY nd.nav_date
                      ROWS BETWEEN 41 PRECEDING AND CURRENT ROW)  AS raw_sd_42d,

            STDDEV_SAMP(nd.daily_return_pct)
                OVER (PARTITION BY nd.scheme_code ORDER BY nd.nav_date
                      ROWS BETWEEN 62 PRECEDING AND CURRENT ROW)  AS raw_sd_3m,

            STDDEV_SAMP(nd.daily_return_pct)
                OVER (PARTITION BY nd.scheme_code ORDER BY nd.nav_date
                      ROWS BETWEEN 125 PRECEDING AND CURRENT ROW) AS raw_sd_6m,

            MAX(nd.nav)
                OVER (PARTITION BY nd.scheme_code ORDER BY nd.nav_date
                      ROWS BETWEEN 251 PRECEDING AND CURRENT ROW) AS running_max_1y

        FROM nav_daily nd
    )

    UPDATE ki_nav_history nh
    SET
        -- nav and prev_nav are NUMERIC (ki_nav_history.nav is NUMERIC) — no cast needed
        daily_return = CASE WHEN nl.prev_nav > 0
            THEN ROUND(((nl.nav - nl.prev_nav) / nl.prev_nav) * 100, 6)
            ELSE NULL END,

        return_1w  = CASE WHEN nl.nav_1w_ago  > 0 THEN ROUND(((nl.nav - nl.nav_1w_ago)  / nl.nav_1w_ago)  * 100, 6) ELSE NULL END,
        return_1m  = CASE WHEN nl.nav_1m_ago  > 0 THEN ROUND(((nl.nav - nl.nav_1m_ago)  / nl.nav_1m_ago)  * 100, 6) ELSE NULL END,
        return_3m  = CASE WHEN nl.nav_3m_ago  > 0 THEN ROUND(((nl.nav - nl.nav_3m_ago)  / nl.nav_3m_ago)  * 100, 6) ELSE NULL END,
        return_6m  = CASE WHEN nl.nav_6m_ago  > 0 THEN ROUND(((nl.nav - nl.nav_6m_ago)  / nl.nav_6m_ago)  * 100, 6) ELSE NULL END,
        return_1y  = CASE WHEN nl.nav_1y_ago  > 0 THEN ROUND(((nl.nav - nl.nav_1y_ago)  / nl.nav_1y_ago)  * 100, 6) ELSE NULL END,
        return_ytd = CASE WHEN nl.nav_ytd_start > 0 THEN ROUND(((nl.nav - nl.nav_ytd_start) / nl.nav_ytd_start) * 100, 6) ELSE NULL END,
        return_all = CASE WHEN v_earliest_nav > 0 THEN ROUND(((nl.nav - v_earliest_nav) / v_earliest_nav) * 100, 6) ELSE NULL END,

        -- STDDEV_SAMP → double precision → must cast ::NUMERIC before ROUND
        sd_7d  = ROUND(nl.raw_sd_7d::NUMERIC,  6),
        sd_14d = ROUND(nl.raw_sd_14d::NUMERIC, 6),
        sd_21d = ROUND(nl.raw_sd_21d::NUMERIC, 6),
        sd_42d = ROUND(nl.raw_sd_42d::NUMERIC, 6),
        sd_3m  = ROUND(nl.raw_sd_3m::NUMERIC,  6),
        sd_6m  = ROUND(nl.raw_sd_6m::NUMERIC,  6),

        -- sharpe: intermediate ops involve double precision (SQRT) → cast whole expr
        sharpe_ratio = CASE
            WHEN nl.raw_sd_21d > 0 AND nl.nav_1m_ago > 0
            THEN ROUND(
                ((((nl.nav - nl.nav_1m_ago) / nl.nav_1m_ago * 12 * 100) - 6.0) /
                 (nl.raw_sd_21d * SQRT(252)))::NUMERIC,
                6)
            ELSE NULL END,

        -- max_drawdown: nav is NUMERIC, running_max_1y is NUMERIC — no cast needed
        max_drawdown = CASE
            WHEN nl.running_max_1y > 0
            THEN ROUND(((nl.nav - nl.running_max_1y) / nl.running_max_1y) * 100, 6)
            ELSE NULL END,

        -- POWER returns double precision → cast ::NUMERIC
        cagr = CASE
            WHEN v_earliest_nav > 0
              AND nl.nav_date > v_earliest_date
              AND (nl.nav_date - v_earliest_date) > 30
            THEN ROUND(
                (POWER(nl.nav / v_earliest_nav, 365.0 / (nl.nav_date - v_earliest_date)) - 1) * 100,
                6)
            ELSE NULL END,

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
    'v2: fixes ROUND(double precision, int) runtime error — STDDEV_SAMP and POWER results cast ::NUMERIC before ROUND.';

-- ============================================================
-- Batch orchestrator (recreated to stay in sync)
-- ============================================================

DROP FUNCTION IF EXISTS calculate_all_scheme_metrics() CASCADE;

CREATE OR REPLACE FUNCTION calculate_all_scheme_metrics()
RETURNS TABLE(
    total_schemes         INTEGER,
    total_records_updated INTEGER,
    execution_ms          INTEGER
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
    'Calculate metrics for all schemes with stale or missing metrics.';
