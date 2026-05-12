-- ============================================================
-- 055_ki_rebuild_holdings_from_txn.sql
--
-- Root cause: ki_process_txn_import_session() inserts ki_holdings
-- rows with units = 0 as a portfolio entry marker, but never
-- updates them with the actual net units computed from transactions.
-- Portfolio and Assets tabs showed ₹0 for all clients because
-- units > 0 filter returned no rows.
--
-- This migration:
--   1. Creates ki_rebuild_holdings_from_txn(p_tenant_id, p_is_live, p_client_id)
--      — Aggregates ki_transactions → updates ki_holdings with:
--        net_units, net_invested, avg_nav, is_sip, sip_amount
--      — Scoped to a tenant + environment. p_client_id is optional.
--
--   2. Replaces ki_process_txn_import_session() (from migrations 045/047/048/049)
--      to call ki_rebuild_holdings_from_txn() at the end of processing.
--
--   3. Immediately backfills all existing tenants via a DO block.
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: ki_rebuild_holdings_from_txn
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ki_rebuild_holdings_from_txn(
    p_tenant_id  UUID,
    p_is_live    BOOLEAN,
    p_client_id  INTEGER DEFAULT NULL
)
RETURNS TABLE(
    updated_count  INTEGER,
    zeroed_count   INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_updated INTEGER := 0;
    v_zeroed  INTEGER := 0;
BEGIN

    -- Update ki_holdings rows with net units and amounts computed from transactions.
    -- Addition txns add units; Deduction txns subtract.
    -- Only touches rows that have at least one matched transaction.
    UPDATE ki_holdings h
    SET
        units          = GREATEST(COALESCE(agg.net_units, 0), 0),
        total_invested = GREATEST(COALESCE(agg.net_invested, 0), 0),
        avg_nav        = CASE
                           WHEN COALESCE(agg.purchase_units, 0) > 0
                           THEN ROUND(agg.purchase_invested / agg.purchase_units, 4)
                           ELSE h.avg_nav
                         END,
        is_sip         = COALESCE(agg.sip_count > 0, false),
        sip_amount     = agg.last_sip_amount,
        updated_at     = NOW()
    FROM (
        SELECT
            t.tenant_id,
            t.is_live,
            t.client_id,
            t.portfolio_id,
            t.scheme_code,
            SUM(
                CASE WHEN ktt.txn_type = 'Addition' THEN  t.units
                     ELSE                                 -t.units END
            )                                                             AS net_units,
            SUM(
                CASE WHEN ktt.txn_type = 'Addition' THEN  t.amount
                     ELSE                                 -t.amount END
            )                                                             AS net_invested,
            SUM(
                CASE WHEN ktt.txn_type = 'Addition' THEN t.units  ELSE 0 END
            )                                                             AS purchase_units,
            SUM(
                CASE WHEN ktt.txn_type = 'Addition' THEN t.amount ELSE 0 END
            )                                                             AS purchase_invested,
            COUNT(
                CASE WHEN ktt.txn_code = 'SIP' THEN 1 END
            )                                                             AS sip_count,
            MAX(
                CASE WHEN ktt.txn_code = 'SIP' THEN t.amount END
            )                                                             AS last_sip_amount
        FROM   ki_transactions t
        JOIN   ki_transaction_types ktt ON ktt.id = t.txn_type_id
        WHERE  t.tenant_id    = p_tenant_id
          AND  t.is_live      = p_is_live
          AND  t.portfolio_flag = true
          AND  (p_client_id IS NULL OR t.client_id = p_client_id)
        GROUP  BY t.tenant_id, t.is_live, t.client_id, t.portfolio_id, t.scheme_code
    ) agg
    WHERE h.tenant_id   = agg.tenant_id
      AND h.is_live     = agg.is_live
      AND h.client_id   = agg.client_id
      AND h.portfolio_id = agg.portfolio_id
      AND h.scheme_code = agg.scheme_code;

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    -- Zero out any ki_holdings rows that have no matching transactions at all
    -- (e.g. orphan placeholders created by previous imports that were later deleted).
    UPDATE ki_holdings h
    SET
        units          = 0,
        total_invested = 0,
        updated_at     = NOW()
    WHERE h.tenant_id = p_tenant_id
      AND h.is_live   = p_is_live
      AND (p_client_id IS NULL OR h.client_id = p_client_id)
      AND NOT EXISTS (
          SELECT 1
          FROM   ki_transactions t
          WHERE  t.tenant_id    = p_tenant_id
            AND  t.is_live      = p_is_live
            AND  t.client_id    = h.client_id
            AND  t.portfolio_id = h.portfolio_id
            AND  t.scheme_code  = h.scheme_code
            AND  t.portfolio_flag = true
      )
      AND h.units > 0;

    GET DIAGNOSTICS v_zeroed = ROW_COUNT;

    RAISE NOTICE '[ki_rebuild_holdings_from_txn] tenant=% live=% client=% → updated=%, zeroed=%',
        p_tenant_id, p_is_live, COALESCE(p_client_id::TEXT, 'ALL'), v_updated, v_zeroed;

    RETURN QUERY SELECT v_updated, v_zeroed;
END;
$$;

COMMENT ON FUNCTION ki_rebuild_holdings_from_txn IS
'Recomputes ki_holdings.units, total_invested, avg_nav, is_sip, sip_amount
from ki_transactions for a given tenant + environment.
p_client_id is optional — omit to rebuild all clients.
Call after every transaction import and after orphan reprocessing.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: Replace ki_process_txn_import_session to call holdings rebuild
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ki_process_txn_import_session(
    p_session_id             INTEGER,
    p_customer_lookup_method TEXT DEFAULT 'iwell_code'
)
RETURNS TABLE(
    total_processed   INTEGER,
    successful        INTEGER,
    failed            INTEGER,
    duplicates        INTEGER,
    orphans           INTEGER,
    processing_time_s NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_start_time         TIMESTAMPTZ := NOW();
    v_batch_size         INTEGER     := 500;

    -- Session info
    v_tenant_id          UUID;
    v_is_live            BOOLEAN;
    v_creator_id         UUID;

    -- Per-row variables
    v_staging            RECORD;
    v_client_id          INTEGER;
    v_txn_type_id        INTEGER;
    v_scheme_code        TEXT;
    v_scheme_name        TEXT;
    v_portfolio_id       INTEGER;
    v_txn_id             BIGINT;
    v_error_msg          TEXT;
    v_is_new_holding     BOOLEAN;
    v_txn_amount         NUMERIC;

    -- Counters
    v_processed          INTEGER := 0;
    v_success            INTEGER := 0;
    v_failed             INTEGER := 0;
    v_duplicates         INTEGER := 0;
    v_orphans            INTEGER := 0;
    v_batch_counter      INTEGER := 0;
BEGIN

    SELECT s.tenant_id, s.is_live, s.created_by
    INTO   v_tenant_id, v_is_live, v_creator_id
    FROM   ki_import_sessions s
    WHERE  s.id = p_session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION '[ki_process_txn_import_session] Session % not found', p_session_id;
    END IF;

    RAISE NOTICE '[Session %] Starting — lookup method: %', p_session_id, p_customer_lookup_method;

    UPDATE ki_import_sessions
    SET    status                = 'processing',
           processing_started_at = NOW(),
           updated_at            = NOW()
    WHERE  id = p_session_id;

    FOR v_staging IN (
        SELECT id, row_number, mapped_data
        FROM   ki_import_staging
        WHERE  session_id        = p_session_id
          AND  processing_status = 'pending'
        ORDER  BY id
    ) LOOP
        BEGIN
            v_client_id      := NULL;
            v_txn_type_id    := NULL;
            v_scheme_code    := NULL;
            v_scheme_name    := NULL;
            v_portfolio_id   := NULL;
            v_txn_id         := NULL;
            v_error_msg      := NULL;
            v_is_new_holding := FALSE;
            v_txn_amount     := 0;

            -- ── STEP 1: CLIENT LOOKUP ─────────────────────────────────────────
            IF p_customer_lookup_method = 'iwell_code' THEN

                IF v_staging.mapped_data->>'vendor_code' IS NOT NULL
                   AND TRIM(v_staging.mapped_data->>'vendor_code') <> ''
                THEN
                    SELECT c.id INTO v_client_id
                    FROM   ki_clients c
                    WHERE  c.tenant_id = v_tenant_id
                      AND  c.is_live   = v_is_live
                      AND  c.is_active = true
                      AND  UPPER(TRIM(c.ext_ref_id)) = UPPER(TRIM(v_staging.mapped_data->>'vendor_code'))
                    LIMIT  1;

                    -- PAN fallback
                    IF v_client_id IS NULL
                       AND v_staging.mapped_data->>'pan' IS NOT NULL
                       AND TRIM(v_staging.mapped_data->>'pan') <> ''
                    THEN
                        SELECT c.id INTO v_client_id
                        FROM   ki_clients c
                        WHERE  c.tenant_id = v_tenant_id
                          AND  c.is_live   = v_is_live
                          AND  c.is_active = true
                          AND  UPPER(TRIM(c.pan)) = UPPER(TRIM(v_staging.mapped_data->>'pan'))
                        LIMIT  1;

                        IF v_client_id IS NOT NULL THEN
                            RAISE NOTICE '[Session %] Row %: client found via PAN fallback', p_session_id, v_staging.row_number;
                        END IF;
                    END IF;

                    IF v_client_id IS NULL THEN
                        v_error_msg := 'No client found with IWELL code: ' ||
                            COALESCE(v_staging.mapped_data->>'vendor_code', 'NULL');
                        IF v_staging.mapped_data->>'pan' IS NOT NULL THEN
                            v_error_msg := v_error_msg || ' or PAN: ' || (v_staging.mapped_data->>'pan');
                        END IF;
                    END IF;
                ELSE
                    -- vendor_code missing → try PAN before giving up
                    IF v_staging.mapped_data->>'pan' IS NOT NULL
                       AND TRIM(v_staging.mapped_data->>'pan') <> ''
                    THEN
                        SELECT c.id INTO v_client_id
                        FROM   ki_clients c
                        WHERE  c.tenant_id = v_tenant_id
                          AND  c.is_live   = v_is_live
                          AND  c.is_active = true
                          AND  UPPER(TRIM(c.pan)) = UPPER(TRIM(v_staging.mapped_data->>'pan'))
                        LIMIT  1;

                        IF v_client_id IS NOT NULL THEN
                            RAISE NOTICE '[Session %] Row %: client found via PAN (no vendor_code)', p_session_id, v_staging.row_number;
                        ELSE
                            v_error_msg := 'No vendor_code in row; PAN fallback also failed: ' ||
                                (v_staging.mapped_data->>'pan');
                        END IF;
                    ELSE
                        v_error_msg := 'IWELL code (vendor_code) is required but not found in this row';
                    END IF;
                END IF;

            ELSIF p_customer_lookup_method = 'customer_name' THEN

                IF v_staging.mapped_data->>'customer_name' IS NOT NULL
                   AND TRIM(v_staging.mapped_data->>'customer_name') <> ''
                THEN
                    SELECT c.id INTO v_client_id
                    FROM   ki_clients  c
                    JOIN   ki_contacts ct ON ct.id = c.contact_id
                    WHERE  c.tenant_id  = v_tenant_id
                      AND  c.is_live    = v_is_live
                      AND  c.is_active  = true
                      AND  ct.is_active = true
                      AND  ct.normalized_name =
                               ki_normalize_contact_name(v_staging.mapped_data->>'customer_name')
                    LIMIT  1;

                    -- PAN fallback
                    IF v_client_id IS NULL
                       AND v_staging.mapped_data->>'pan' IS NOT NULL
                       AND TRIM(v_staging.mapped_data->>'pan') <> ''
                    THEN
                        SELECT c.id INTO v_client_id
                        FROM   ki_clients c
                        WHERE  c.tenant_id = v_tenant_id
                          AND  c.is_live   = v_is_live
                          AND  c.is_active = true
                          AND  UPPER(TRIM(c.pan)) = UPPER(TRIM(v_staging.mapped_data->>'pan'))
                        LIMIT  1;

                        IF v_client_id IS NOT NULL THEN
                            RAISE NOTICE '[Session %] Row %: client found via PAN fallback', p_session_id, v_staging.row_number;
                        END IF;
                    END IF;

                    IF v_client_id IS NULL THEN
                        v_error_msg := 'No client found with name: ' ||
                            COALESCE(v_staging.mapped_data->>'customer_name', 'NULL');
                        IF v_staging.mapped_data->>'pan' IS NOT NULL THEN
                            v_error_msg := v_error_msg || ' or PAN: ' || (v_staging.mapped_data->>'pan');
                        END IF;
                    END IF;
                ELSE
                    v_error_msg := 'customer_name is required but not found in this row';
                END IF;

            ELSIF p_customer_lookup_method = 'both' THEN

                -- Try vendor_code first
                IF v_staging.mapped_data->>'vendor_code' IS NOT NULL
                   AND TRIM(v_staging.mapped_data->>'vendor_code') <> ''
                THEN
                    SELECT c.id INTO v_client_id
                    FROM   ki_clients c
                    WHERE  c.tenant_id = v_tenant_id
                      AND  c.is_live   = v_is_live
                      AND  c.is_active = true
                      AND  UPPER(TRIM(c.ext_ref_id)) = UPPER(TRIM(v_staging.mapped_data->>'vendor_code'))
                    LIMIT  1;
                END IF;

                -- Then customer_name
                IF v_client_id IS NULL
                   AND v_staging.mapped_data->>'customer_name' IS NOT NULL
                   AND TRIM(v_staging.mapped_data->>'customer_name') <> ''
                THEN
                    SELECT c.id INTO v_client_id
                    FROM   ki_clients  c
                    JOIN   ki_contacts ct ON ct.id = c.contact_id
                    WHERE  c.tenant_id  = v_tenant_id
                      AND  c.is_live    = v_is_live
                      AND  c.is_active  = true
                      AND  ct.is_active = true
                      AND  ct.normalized_name =
                               ki_normalize_contact_name(v_staging.mapped_data->>'customer_name')
                    LIMIT  1;
                END IF;

                -- Then PAN fallback
                IF v_client_id IS NULL
                   AND v_staging.mapped_data->>'pan' IS NOT NULL
                   AND TRIM(v_staging.mapped_data->>'pan') <> ''
                THEN
                    SELECT c.id INTO v_client_id
                    FROM   ki_clients c
                    WHERE  c.tenant_id = v_tenant_id
                      AND  c.is_live   = v_is_live
                      AND  c.is_active = true
                      AND  UPPER(TRIM(c.pan)) = UPPER(TRIM(v_staging.mapped_data->>'pan'))
                    LIMIT  1;

                    IF v_client_id IS NOT NULL THEN
                        RAISE NOTICE '[Session %] Row %: client found via PAN fallback (both mode)', p_session_id, v_staging.row_number;
                    END IF;
                END IF;

                IF v_client_id IS NULL THEN
                    v_error_msg := 'No client matched by vendor_code, name, or PAN';
                END IF;

            END IF;

            -- Orphan if no client found
            IF v_client_id IS NULL THEN
                UPDATE ki_import_staging
                SET    processing_status = 'orphan',
                       error_messages    = ARRAY[COALESCE(v_error_msg, 'Client not found')],
                       processed_at      = NOW()
                WHERE  id = v_staging.id;
                v_orphans   := v_orphans + 1;
                v_processed := v_processed + 1;
                CONTINUE;
            END IF;

            -- ── STEP 2: TRANSACTION TYPE LOOKUP ──────────────────────────────

            -- Try txn_code match first
            SELECT kt.id INTO v_txn_type_id
            FROM   ki_transaction_types kt
            WHERE  UPPER(TRIM(kt.txn_code)) =
                   UPPER(TRIM(COALESCE(v_staging.mapped_data->>'txn_type', '')))
              AND  kt.is_active = true
            LIMIT  1;

            -- Fallback: txn_name match
            IF v_txn_type_id IS NULL THEN
                SELECT kt.id INTO v_txn_type_id
                FROM   ki_transaction_types kt
                WHERE  UPPER(TRIM(kt.txn_name)) =
                       UPPER(TRIM(COALESCE(v_staging.mapped_data->>'txn_type', '')))
                  AND  kt.is_active = true
                LIMIT  1;
            END IF;

            IF v_txn_type_id IS NULL THEN
                UPDATE ki_import_staging
                SET    processing_status = 'failed',
                       error_messages    = ARRAY['Unknown transaction type: ' ||
                           COALESCE(v_staging.mapped_data->>'txn_type', 'NULL')],
                       processed_at      = NOW()
                WHERE  id = v_staging.id;
                v_failed    := v_failed + 1;
                v_processed := v_processed + 1;
                CONTINUE;
            END IF;

            -- ── STEP 3: SCHEME LOOKUP ─────────────────────────────────────────

            v_scheme_code := NULL;
            v_scheme_name := COALESCE(v_staging.mapped_data->>'scheme_name', '');

            -- 3a: ISIN lookup (isin_growth or isin_dividend)
            IF v_staging.mapped_data->>'isin' IS NOT NULL
               AND TRIM(v_staging.mapped_data->>'isin') <> ''
            THEN
                SELECT s.scheme_code INTO v_scheme_code
                FROM   ki_schemes s
                WHERE  s.isin_growth   = TRIM(v_staging.mapped_data->>'isin')
                    OR s.isin_dividend = TRIM(v_staging.mapped_data->>'isin')
                LIMIT  1;
            END IF;

            -- 3b: Alias lookup
            IF v_scheme_code IS NULL AND v_scheme_name <> '' THEN
                SELECT sa.scheme_code INTO v_scheme_code
                FROM   ki_scheme_aliases sa
                WHERE  sa.alias_name_normalized =
                           LOWER(TRIM(REGEXP_REPLACE(v_scheme_name, '\s+', ' ', 'g')))
                LIMIT  1;
            END IF;

            -- 3c: Bookmark alias fallback
            IF v_scheme_code IS NULL AND v_scheme_name <> '' THEN
                SELECT sb.scheme_code INTO v_scheme_code
                FROM   ki_scheme_bookmarks sb
                WHERE  sb.tenant_id    = v_tenant_id
                  AND  LOWER(TRIM(REGEXP_REPLACE(sb.alias_name, '\s+', ' ', 'g'))) =
                       LOWER(TRIM(REGEXP_REPLACE(v_scheme_name, '\s+', ' ', 'g')))
                LIMIT  1;
            END IF;

            -- Must be bookmarked by this tenant
            IF v_scheme_code IS NOT NULL THEN
                IF NOT EXISTS (
                    SELECT 1 FROM ki_scheme_bookmarks sb
                    WHERE sb.tenant_id   = v_tenant_id
                      AND sb.scheme_code = v_scheme_code
                ) THEN
                    v_scheme_code := NULL;
                END IF;
            END IF;

            IF v_scheme_code IS NULL THEN
                UPDATE ki_import_staging
                SET    processing_status = 'failed',
                       error_messages    = ARRAY['Scheme not found or not bookmarked: ' ||
                           COALESCE(v_staging.mapped_data->>'scheme_name', 'NULL')],
                       processed_at      = NOW()
                WHERE  id = v_staging.id;
                v_failed    := v_failed + 1;
                v_processed := v_processed + 1;
                CONTINUE;
            END IF;

            -- ── STEP 4: DUPLICATE CHECK ───────────────────────────────────────

            v_txn_amount := COALESCE(
                NULLIF(TRIM(v_staging.mapped_data->>'amount'), '')::NUMERIC, 0
            );

            IF EXISTS (
                SELECT 1
                FROM   ki_transactions t
                WHERE  t.tenant_id    = v_tenant_id
                  AND  t.is_live      = v_is_live
                  AND  t.client_id    = v_client_id
                  AND  t.scheme_code  = v_scheme_code
                  AND  t.txn_date     = (v_staging.mapped_data->>'txn_date')::DATE
                  AND  t.amount       = v_txn_amount
                  AND  t.units        = COALESCE(
                                            NULLIF(TRIM(v_staging.mapped_data->>'units'), '')::NUMERIC,
                                            0
                                        )
            ) THEN
                UPDATE ki_import_staging
                SET    processing_status = 'duplicate',
                       processed_at      = NOW()
                WHERE  id = v_staging.id;
                v_duplicates := v_duplicates + 1;
                v_processed  := v_processed + 1;
                CONTINUE;
            END IF;

            -- ── STEP 5: GET / CREATE CLIENT PORTFOLIO ─────────────────────────

            SELECT p.id INTO v_portfolio_id
            FROM   ki_portfolios p
            WHERE  p.tenant_id = v_tenant_id
              AND  p.is_live   = v_is_live
              AND  p.client_id = v_client_id
              AND  p.is_active = true
            LIMIT  1;

            IF v_portfolio_id IS NULL THEN
                INSERT INTO ki_portfolios (tenant_id, is_live, client_id, name, portfolio_type)
                VALUES (v_tenant_id, v_is_live, v_client_id, 'Default', 'regular')
                RETURNING id INTO v_portfolio_id;
            END IF;

            -- ── STEP 6: UPSERT ki_holdings (placeholder) ─────────────────────

            v_is_new_holding := NOT EXISTS (
                SELECT 1 FROM ki_holdings
                WHERE  tenant_id   = v_tenant_id
                  AND  is_live     = v_is_live
                  AND  client_id   = v_client_id
                  AND  scheme_code = v_scheme_code
            );

            INSERT INTO ki_holdings (
                tenant_id, is_live, client_id, portfolio_id, scheme_code,
                units, total_invested, is_sip, sip_start_date, updated_at
            ) VALUES (
                v_tenant_id, v_is_live, v_client_id, v_portfolio_id, v_scheme_code,
                0, 0, false,
                (v_staging.mapped_data->>'txn_date')::DATE,
                NOW()
            )
            ON CONFLICT (tenant_id, is_live, client_id, portfolio_id, scheme_code)
            DO UPDATE SET updated_at = NOW();

            -- ── STEP 7: INSERT TRANSACTION ────────────────────────────────────

            INSERT INTO ki_transactions (
                tenant_id, is_live,
                client_id, portfolio_id, scheme_code,
                txn_type_id, txn_date,
                amount, units, nav,
                stamp_duty, stt, tds,
                euin, arn, folio_no,
                fund_name, category, sip_reg_date,
                description, source, source_ref,
                import_session_id,
                is_potential_duplicate, portfolio_flag,
                created_at
            ) VALUES (
                v_tenant_id, v_is_live,
                v_client_id, v_portfolio_id, v_scheme_code,
                v_txn_type_id,
                (v_staging.mapped_data->>'txn_date')::DATE,
                v_txn_amount,
                COALESCE(NULLIF(TRIM(v_staging.mapped_data->>'units'),       '')::NUMERIC, 0),
                COALESCE(NULLIF(TRIM(v_staging.mapped_data->>'nav'),          '')::NUMERIC, 0),
                COALESCE(NULLIF(TRIM(v_staging.mapped_data->>'stamp_duty'),   '')::NUMERIC, 0),
                COALESCE(NULLIF(TRIM(v_staging.mapped_data->>'stt'),          '')::NUMERIC, 0),
                COALESCE(NULLIF(TRIM(v_staging.mapped_data->>'tds'),          '')::NUMERIC, 0),
                NULLIF(TRIM(COALESCE(v_staging.mapped_data->>'euin',          '')), ''),
                NULLIF(TRIM(COALESCE(v_staging.mapped_data->>'arn_code',      '')), ''),
                NULLIF(TRIM(COALESCE(v_staging.mapped_data->>'folio_number',  '')), ''),
                NULLIF(TRIM(COALESCE(v_staging.mapped_data->>'fund_name',     '')), ''),
                NULLIF(TRIM(COALESCE(v_staging.mapped_data->>'category',      '')), ''),
                NULLIF(TRIM(COALESCE(v_staging.mapped_data->>'sip_reg_date',  '')), '')::DATE,
                NULLIF(TRIM(COALESCE(v_staging.mapped_data->>'description',   '')), ''),
                'import',
                v_staging.id::TEXT,
                p_session_id,
                false,
                true,
                NOW()
            )
            RETURNING id INTO v_txn_id;

            -- ── STEP 8: NEW SCHEME ALERT ──────────────────────────────────────

            IF v_is_new_holding THEN
                INSERT INTO ki_alerts (
                    tenant_id, is_live, client_id,
                    alert_type, priority, title, body,
                    action_skill, action_function, action_params,
                    created_at
                ) VALUES (
                    v_tenant_id, v_is_live, v_client_id,
                    'new_scheme_detected', 'medium',
                    'New MF detected: ' || v_staging.mapped_data->>'scheme_name',
                    'Scheme "' || v_staging.mapped_data->>'scheme_name' || '" appeared for the first time ' ||
                    'in imported transactions. Review the investment plan for this client.',
                    'transaction-skill', 'get_transactions',
                    jsonb_build_object(
                        'client_id',   v_client_id,
                        'scheme_code', v_scheme_code,
                        'txn_id',      v_txn_id
                    ),
                    NOW()
                )
                ON CONFLICT DO NOTHING;
            END IF;

            -- ── MARK SUCCESS ──────────────────────────────────────────────────

            UPDATE ki_import_staging
            SET    processing_status  = 'success',
                   created_record_id  = v_txn_id::TEXT,
                   processed_at       = NOW()
            WHERE  id = v_staging.id;

            v_success   := v_success + 1;
            v_processed := v_processed + 1;
            v_batch_counter := v_batch_counter + 1;

            -- Batch checkpoint
            IF v_batch_counter >= v_batch_size THEN
                UPDATE ki_import_sessions
                SET    processed_records = v_processed,
                       successful_records = v_success,
                       failed_records    = v_failed,
                       duplicate_records = v_duplicates,
                       orphan_records    = v_orphans,
                       updated_at        = NOW()
                WHERE  id = p_session_id;
                v_batch_counter := 0;
            END IF;

        EXCEPTION WHEN OTHERS THEN
            UPDATE ki_import_staging
            SET    processing_status = 'failed',
                   error_messages    = ARRAY[SQLERRM],
                   processed_at      = NOW()
            WHERE  id = v_staging.id;
            v_failed    := v_failed + 1;
            v_processed := v_processed + 1;
        END;
    END LOOP;

    -- ── STEP 9: REBUILD HOLDINGS FROM TRANSACTIONS ────────────────────────────
    -- Update ki_holdings.units and total_invested from the transactions we just
    -- inserted (and all prior ones for this tenant+environment).
    IF v_success > 0 THEN
        PERFORM ki_rebuild_holdings_from_txn(v_tenant_id, v_is_live, NULL);
        RAISE NOTICE '[Session %] Holdings rebuilt after processing %s successful rows', p_session_id, v_success;
    END IF;

    -- ── FINAL COUNTER UPDATE ──────────────────────────────────────────────────
    UPDATE ki_import_sessions
    SET    status                    = CASE
                                         WHEN v_failed > 0 OR v_orphans > 0 THEN 'completed_with_errors'
                                         ELSE 'completed'
                                       END,
           processed_records         = v_processed,
           successful_records        = v_success,
           failed_records            = v_failed,
           duplicate_records         = v_duplicates,
           orphan_records            = v_orphans,
           processing_completed_at   = NOW(),
           updated_at                = NOW()
    WHERE  id = p_session_id;

    RAISE NOTICE '[Session %] Done — processed=%, success=%, failed=%, dup=%, orphan=%',
        p_session_id, v_processed, v_success, v_failed, v_duplicates, v_orphans;

    RETURN QUERY SELECT v_processed, v_success, v_failed, v_duplicates, v_orphans,
        EXTRACT(EPOCH FROM (NOW() - v_start_time))::NUMERIC;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3: Backfill existing data
-- Run ki_rebuild_holdings_from_txn for every tenant+environment that has
-- transactions, so existing data shows immediately without re-importing.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_rec RECORD;
    v_total INTEGER := 0;
BEGIN
    FOR v_rec IN (
        SELECT DISTINCT t.tenant_id, t.is_live
        FROM   ki_transactions t
        WHERE  t.portfolio_flag = true
    ) LOOP
        PERFORM ki_rebuild_holdings_from_txn(v_rec.tenant_id, v_rec.is_live, NULL);
        v_total := v_total + 1;
    END LOOP;

    RAISE NOTICE '[055] Backfill complete — rebuilt holdings for % tenant/environment combinations', v_total;
END $$;

COMMIT;
