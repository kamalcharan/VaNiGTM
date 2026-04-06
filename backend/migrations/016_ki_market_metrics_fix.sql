-- ============================================================
-- KI-Prime — Migration 016: Fix calculate_market_metrics
--
-- Migration 015 defined calculate_market_metrics(integer) with
-- two bugs that were already fixed for calculate_scheme_metrics
-- in migrations 013 and 014:
--
--   Bug 1 (nested window functions):
--     STDDEV_SAMP(LAG() OVER w) OVER ...
--     → PostgreSQL rejects window functions nested inside
--       aggregate window functions at parse time.
--     Fix: pre-compute daily_return_pct in a separate CTE
--     (same pattern as migration 013 for scheme metrics).
--
--   Bug 2 (type mismatch at ROUND):
--     ROUND(double precision, integer) has no PG overload.
--     STDDEV_SAMP, SQRT, POWER all return double precision.
--     Fix: cast ::NUMERIC before every ROUND call
--     (same pattern as migration 014 for scheme metrics).
-- ============================================================

DROP FUNCTION IF EXISTS calculate_market_metrics(INTEGER) CASCADE;

CREATE OR REPLACE FUNCTION calculate_market_metrics(p_index_id INTEGER)
RETURNS TABLE(records_updated INTEGER, execution_ms INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
    v_start_time      TIMESTAMP;
    v_count           INTEGER := 0;
    v_earliest_close  NUMERIC;
    v_earliest_date   DATE;
BEGIN
    v_start_time := clock_timestamp();

    -- Earliest close for all-time return & CAGR
    SELECT close, trade_date INTO v_earliest_close, v_earliest_date
    FROM ki_market_data
    WHERE index_id = p_index_id
    ORDER BY trade_date ASC
    LIMIT 1;

    IF v_earliest_close IS NULL THEN
        RETURN QUERY SELECT 0, 0;
        RETURN;
    END IF;

    WITH

    -- Step 1: prev_close via LAG (no nesting yet)
    data_base AS (
        SELECT
            kmd.id,
            kmd.close,
            kmd.trade_date,
            LAG(kmd.close, 1) OVER (PARTITION BY kmd.index_id ORDER BY kmd.trade_date) AS prev_close
        FROM ki_market_data kmd
        WHERE kmd.index_id = p_index_id
    ),

    -- Step 2: daily_return_pct as a plain column (no window function nesting)
    data_daily AS (
        SELECT
            id, close, trade_date, prev_close,
            CASE WHEN prev_close > 0
                 THEN ((close - prev_close) / prev_close) * 100
                 ELSE NULL
            END AS daily_return_pct
        FROM data_base
    ),

    -- Step 3: lookbacks + STDDEV_SAMP over daily_return_pct + running max
    data_with_lookbacks AS (
        SELECT
            dd.id,
            dd.close,
            dd.trade_date,
            dd.prev_close,

            (SELECT d2.close FROM ki_market_data d2
             WHERE d2.index_id = p_index_id
               AND d2.trade_date <= dd.trade_date - INTERVAL '7 days'
             ORDER BY d2.trade_date DESC LIMIT 1) AS close_1w_ago,

            (SELECT d2.close FROM ki_market_data d2
             WHERE d2.index_id = p_index_id
               AND d2.trade_date <= dd.trade_date - INTERVAL '1 month'
             ORDER BY d2.trade_date DESC LIMIT 1) AS close_1m_ago,

            (SELECT d2.close FROM ki_market_data d2
             WHERE d2.index_id = p_index_id
               AND d2.trade_date <= dd.trade_date - INTERVAL '3 months'
             ORDER BY d2.trade_date DESC LIMIT 1) AS close_3m_ago,

            (SELECT d2.close FROM ki_market_data d2
             WHERE d2.index_id = p_index_id
               AND d2.trade_date <= dd.trade_date - INTERVAL '6 months'
             ORDER BY d2.trade_date DESC LIMIT 1) AS close_6m_ago,

            (SELECT d2.close FROM ki_market_data d2
             WHERE d2.index_id = p_index_id
               AND d2.trade_date <= dd.trade_date - INTERVAL '1 year'
             ORDER BY d2.trade_date DESC LIMIT 1) AS close_1y_ago,

            (SELECT d2.close FROM ki_market_data d2
             WHERE d2.index_id = p_index_id
               AND d2.trade_date <= date_trunc('year', dd.trade_date)::date
             ORDER BY d2.trade_date DESC LIMIT 1) AS close_ytd_start,

            -- Rolling stddev over pre-computed daily_return_pct (no nesting)
            STDDEV_SAMP(dd.daily_return_pct)
                OVER (PARTITION BY p_index_id ORDER BY dd.trade_date
                      ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)   AS raw_sd_7d,

            STDDEV_SAMP(dd.daily_return_pct)
                OVER (PARTITION BY p_index_id ORDER BY dd.trade_date
                      ROWS BETWEEN 13 PRECEDING AND CURRENT ROW)  AS raw_sd_14d,

            STDDEV_SAMP(dd.daily_return_pct)
                OVER (PARTITION BY p_index_id ORDER BY dd.trade_date
                      ROWS BETWEEN 20 PRECEDING AND CURRENT ROW)  AS raw_sd_21d,

            STDDEV_SAMP(dd.daily_return_pct)
                OVER (PARTITION BY p_index_id ORDER BY dd.trade_date
                      ROWS BETWEEN 41 PRECEDING AND CURRENT ROW)  AS raw_sd_42d,

            STDDEV_SAMP(dd.daily_return_pct)
                OVER (PARTITION BY p_index_id ORDER BY dd.trade_date
                      ROWS BETWEEN 62 PRECEDING AND CURRENT ROW)  AS raw_sd_3m,

            STDDEV_SAMP(dd.daily_return_pct)
                OVER (PARTITION BY p_index_id ORDER BY dd.trade_date
                      ROWS BETWEEN 125 PRECEDING AND CURRENT ROW) AS raw_sd_6m,

            -- Running 1-year max for drawdown
            MAX(dd.close)
                OVER (PARTITION BY p_index_id ORDER BY dd.trade_date
                      ROWS BETWEEN 251 PRECEDING AND CURRENT ROW) AS running_max_1y

        FROM data_daily dd
    )

    UPDATE ki_market_data kmd
    SET
        daily_return = CASE WHEN dl.prev_close > 0
            THEN ROUND(((dl.close - dl.prev_close) / dl.prev_close) * 100, 6)
            ELSE NULL END,

        return_1w  = CASE WHEN dl.close_1w_ago  > 0 THEN ROUND(((dl.close - dl.close_1w_ago)  / dl.close_1w_ago)  * 100, 6) ELSE NULL END,
        return_1m  = CASE WHEN dl.close_1m_ago  > 0 THEN ROUND(((dl.close - dl.close_1m_ago)  / dl.close_1m_ago)  * 100, 6) ELSE NULL END,
        return_3m  = CASE WHEN dl.close_3m_ago  > 0 THEN ROUND(((dl.close - dl.close_3m_ago)  / dl.close_3m_ago)  * 100, 6) ELSE NULL END,
        return_6m  = CASE WHEN dl.close_6m_ago  > 0 THEN ROUND(((dl.close - dl.close_6m_ago)  / dl.close_6m_ago)  * 100, 6) ELSE NULL END,
        return_1y  = CASE WHEN dl.close_1y_ago  > 0 THEN ROUND(((dl.close - dl.close_1y_ago)  / dl.close_1y_ago)  * 100, 6) ELSE NULL END,
        return_ytd = CASE WHEN dl.close_ytd_start > 0 THEN ROUND(((dl.close - dl.close_ytd_start) / dl.close_ytd_start) * 100, 6) ELSE NULL END,
        return_all = CASE WHEN v_earliest_close > 0 THEN ROUND(((dl.close - v_earliest_close) / v_earliest_close) * 100, 6) ELSE NULL END,

        -- STDDEV_SAMP returns double precision → cast ::NUMERIC before ROUND
        sd_7d   = ROUND(dl.raw_sd_7d::NUMERIC,   6),
        sd_14d  = ROUND(dl.raw_sd_14d::NUMERIC,  6),
        sd_21d  = ROUND(dl.raw_sd_21d::NUMERIC,  6),
        sd_42d  = ROUND(dl.raw_sd_42d::NUMERIC,  6),
        sd_3m   = ROUND(dl.raw_sd_3m::NUMERIC,   6),
        sd_6m   = ROUND(dl.raw_sd_6m::NUMERIC,   6),

        -- Sharpe: intermediate result is double precision (SQRT) → cast entire expr
        sharpe_ratio = CASE
            WHEN dl.raw_sd_21d > 0 AND dl.close_1m_ago > 0
            THEN ROUND(
                ((((dl.close - dl.close_1m_ago) / dl.close_1m_ago * 12 * 100) - 6.0) /
                 (dl.raw_sd_21d * SQRT(252)))::NUMERIC,
                6)
            ELSE NULL END,

        -- Max drawdown: close and running_max_1y are NUMERIC — no cast needed
        max_drawdown = CASE
            WHEN dl.running_max_1y > 0
            THEN ROUND(((dl.close - dl.running_max_1y) / dl.running_max_1y) * 100, 6)
            ELSE NULL END,

        -- CAGR: POWER returns double precision → cast ::NUMERIC
        cagr = CASE
            WHEN v_earliest_close > 0
              AND dl.trade_date > v_earliest_date
              AND (dl.trade_date - v_earliest_date) > 30
            THEN ROUND(
                (POWER(
                    (dl.close / v_earliest_close)::FLOAT8,
                    365.0 / (dl.trade_date - v_earliest_date)
                ) - 1)::NUMERIC * 100,
                6)
            ELSE NULL END,

        -- Total risk = annualised daily volatility (sd_6m * sqrt(252))
        total_risk = CASE
            WHEN dl.raw_sd_6m IS NOT NULL
            THEN ROUND((dl.raw_sd_6m * SQRT(252))::NUMERIC, 6)
            ELSE NULL END,

        metrics_calculated_at = CURRENT_TIMESTAMP

    FROM data_with_lookbacks dl
    WHERE kmd.id = dl.id;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- Refresh summary columns on the index master row
    UPDATE ki_market_indices
    SET
        total_records             = (SELECT COUNT(*)           FROM ki_market_data WHERE index_id = p_index_id),
        earliest_date             = (SELECT MIN(trade_date)    FROM ki_market_data WHERE index_id = p_index_id),
        latest_date               = (SELECT MAX(trade_date)    FROM ki_market_data WHERE index_id = p_index_id),
        historical_data_available = (SELECT COUNT(*) > 0       FROM ki_market_data WHERE index_id = p_index_id),
        updated_at                = now()
    WHERE id = p_index_id;

    RETURN QUERY SELECT
        v_count,
        EXTRACT(MILLISECOND FROM (clock_timestamp() - v_start_time))::INTEGER;
END;
$$;

COMMENT ON FUNCTION calculate_market_metrics IS
    'v2: fixes nested window function error (STDDEV_SAMP over pre-computed daily_return_pct) and ROUND(double precision) type mismatch. Mirrors calculate_scheme_metrics v2 (migration 014).';
