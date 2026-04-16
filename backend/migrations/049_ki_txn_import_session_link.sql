-- 049_ki_txn_import_session_link.sql
-- Add import_session_id to ki_transactions so transactions can be filtered by import session.
-- Update ki_process_txn_import_session() to stamp import_session_id on each inserted transaction.

DO $$ BEGIN

    -- ── STEP 1: Add import_session_id column ──────────────────────────────────

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ki_transactions') THEN
        ALTER TABLE ki_transactions
            ADD COLUMN IF NOT EXISTS import_session_id INTEGER REFERENCES ki_import_sessions(id);

        COMMENT ON COLUMN ki_transactions.import_session_id IS
            'FK to ki_import_sessions — set when transaction was created via an import. NULL for manual entries.';

        CREATE INDEX IF NOT EXISTS idx_ki_txn_import_session
            ON ki_transactions(tenant_id, import_session_id)
            WHERE import_session_id IS NOT NULL;
    END IF;

END $$;


-- ── STEP 2: Update ki_process_txn_import_session to stamp import_session_id ──

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

    v_tenant_id          UUID;
    v_is_live            BOOLEAN;
    v_creator_id         UUID;

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

    v_processed          INTEGER := 0;
    v_success            INTEGER := 0;
    v_failed             INTEGER := 0;
    v_duplicates         INTEGER := 0;
    v_orphans            INTEGER := 0;
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
            --
            -- iwell_code → try vendor_code, PAN fallback, error if missing
            -- customer_name → try name, PAN fallback, error if missing
            -- both → try vendor_code, then name, then PAN

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
                    v_error_msg := 'IWELL code (vendor_code) is required but not found in this row';
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
                    v_error_msg := 'Customer name is required but not found in this row';
                END IF;

            ELSE -- 'both': try vendor_code, then name, then PAN

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
                END IF;

                IF v_client_id IS NULL THEN
                    v_error_msg := 'No client found with IWELL code, name, or PAN';
                END IF;

            END IF;

            IF v_client_id IS NULL THEN
                UPDATE ki_import_staging
                SET    processing_status = 'orphan',
                       error_messages    = ARRAY[v_error_msg],
                       processed_at      = NOW()
                WHERE  id = v_staging.id;
                v_orphans   := v_orphans   + 1;
                v_processed := v_processed + 1;
                CONTINUE;
            END IF;

            -- ── STEP 2: TRANSACTION TYPE LOOKUP ──────────────────────────────

            IF v_staging.mapped_data->>'txn_code' IS NOT NULL
               AND TRIM(v_staging.mapped_data->>'txn_code') <> ''
            THEN
                SELECT id INTO v_txn_type_id
                FROM   ki_transaction_types
                WHERE  UPPER(TRIM(txn_code)) = UPPER(TRIM(v_staging.mapped_data->>'txn_code'))
                  AND  is_active = true
                LIMIT  1;

                IF v_txn_type_id IS NULL THEN
                    SELECT id INTO v_txn_type_id
                    FROM   ki_transaction_types
                    WHERE  UPPER(TRIM(txn_name)) = UPPER(TRIM(v_staging.mapped_data->>'txn_code'))
                      AND  is_active = true
                    LIMIT  1;
                END IF;
            END IF;

            IF v_txn_type_id IS NULL THEN
                UPDATE ki_import_staging
                SET    processing_status = 'failed',
                       error_messages    = ARRAY[
                           'Unknown transaction type: ' ||
                           COALESCE(v_staging.mapped_data->>'txn_code', 'NULL')
                       ],
                       processed_at = NOW()
                WHERE  id = v_staging.id;
                v_failed    := v_failed    + 1;
                v_processed := v_processed + 1;
                CONTINUE;
            END IF;

            -- ── STEP 3: SCHEME LOOKUP ─────────────────────────────────────────
            --
            -- Path A: ISIN → ki_schemes
            -- Path B: scheme_name → ki_scheme_aliases
            -- Path C: scheme_name → ki_scheme_bookmarks.alias_name

            -- Path A: ISIN lookup
            IF v_scheme_code IS NULL
               AND v_staging.mapped_data->>'isin' IS NOT NULL
               AND TRIM(v_staging.mapped_data->>'isin') <> ''
            THEN
                SELECT scheme_code, scheme_name
                INTO   v_scheme_code, v_scheme_name
                FROM   ki_schemes
                WHERE  (isin_growth    = UPPER(TRIM(v_staging.mapped_data->>'isin'))
                    OR  isin_dividend  = UPPER(TRIM(v_staging.mapped_data->>'isin'))
                    OR  isin_reinvestment = UPPER(TRIM(v_staging.mapped_data->>'isin')))
                LIMIT  1;
            END IF;

            -- Path B: global alias table
            IF v_scheme_code IS NULL
               AND v_staging.mapped_data->>'scheme_name' IS NOT NULL
               AND TRIM(v_staging.mapped_data->>'scheme_name') <> ''
            THEN
                SELECT sa.scheme_code, sa.scheme_name
                INTO   v_scheme_code, v_scheme_name
                FROM   lookup_scheme_by_alias(v_staging.mapped_data->>'scheme_name') sa;
            END IF;

            -- Path C: tenant bookmark alias_name
            IF v_scheme_code IS NULL
               AND v_staging.mapped_data->>'scheme_name' IS NOT NULL
               AND TRIM(v_staging.mapped_data->>'scheme_name') <> ''
            THEN
                SELECT b.scheme_code, s.scheme_name
                INTO   v_scheme_code, v_scheme_name
                FROM   ki_scheme_bookmarks b
                JOIN   ki_schemes s ON s.scheme_code = b.scheme_code
                WHERE  b.tenant_id = v_tenant_id
                  AND  normalize_scheme_name(b.alias_name)
                           = normalize_scheme_name(v_staging.mapped_data->>'scheme_name')
                LIMIT  1;

                IF v_scheme_code IS NOT NULL THEN
                    INSERT INTO ki_scheme_aliases (scheme_code, alias_name, source)
                    VALUES (v_scheme_code, v_staging.mapped_data->>'scheme_name', 'import')
                    ON CONFLICT (scheme_code, alias_name_normalized) DO NOTHING;
                END IF;
            END IF;

            IF v_scheme_code IS NOT NULL THEN
                IF NOT EXISTS (
                    SELECT 1 FROM ki_scheme_bookmarks
                    WHERE  tenant_id   = v_tenant_id
                      AND  scheme_code = v_scheme_code
                ) THEN
                    v_error_msg   := 'Scheme not bookmarked by tenant: ' ||
                                     COALESCE(v_scheme_name,
                                              v_staging.mapped_data->>'scheme_name');
                    v_scheme_code := NULL;
                END IF;
            ELSE
                v_error_msg := 'Scheme not found — import the scheme first. ' ||
                    CASE
                        WHEN v_staging.mapped_data->>'isin' IS NOT NULL
                        THEN 'ISIN: ' || (v_staging.mapped_data->>'isin') || ', '
                        ELSE ''
                    END ||
                    'CSV name: ' || COALESCE(v_staging.mapped_data->>'scheme_name', 'NULL');
            END IF;

            IF v_scheme_code IS NULL THEN
                UPDATE ki_import_staging
                SET    processing_status = 'failed',
                       error_messages    = ARRAY[v_error_msg],
                       processed_at      = NOW()
                WHERE  id = v_staging.id;
                v_failed    := v_failed    + 1;
                v_processed := v_processed + 1;
                CONTINUE;
            END IF;

            -- ── STEP 4: DUPLICATE CHECK ───────────────────────────────────────

            v_txn_amount := COALESCE(
                NULLIF(TRIM(v_staging.mapped_data->>'amount'), '')::NUMERIC,
                0
            );

            IF EXISTS (
                SELECT 1 FROM ki_transactions
                WHERE  tenant_id   = v_tenant_id
                  AND  is_live     = v_is_live
                  AND  client_id   = v_client_id
                  AND  scheme_code = v_scheme_code
                  AND  txn_date    = (v_staging.mapped_data->>'txn_date')::DATE
                  AND  amount      = v_txn_amount
                  AND  units       = COALESCE(
                                         NULLIF(TRIM(v_staging.mapped_data->>'units'), '')::NUMERIC,
                                         0
                                     )
            ) THEN
                UPDATE ki_import_staging
                SET    processing_status = 'duplicate',
                       processed_at      = NOW()
                WHERE  id = v_staging.id;
                v_duplicates := v_duplicates + 1;
                v_processed  := v_processed  + 1;
                CONTINUE;
            END IF;

            -- ── STEP 5: GET / CREATE CLIENT PORTFOLIO ─────────────────────────

            SELECT id INTO v_portfolio_id
            FROM   ki_portfolios
            WHERE  tenant_id = v_tenant_id
              AND  client_id = v_client_id
              AND  is_live   = v_is_live
              AND  active    = true
            ORDER  BY id
            LIMIT  1;

            IF v_portfolio_id IS NULL THEN
                INSERT INTO ki_portfolios (tenant_id, is_live, client_id, name, portfolio_type)
                VALUES (v_tenant_id, v_is_live, v_client_id, 'Default', 'regular')
                RETURNING id INTO v_portfolio_id;
            END IF;

            -- ── STEP 6: UPSERT ki_holdings ────────────────────────────────────

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
                    'New MF detected: ' || v_scheme_name,
                    'Scheme "' || v_scheme_name || '" appeared for the first time ' ||
                    'in imported transactions. Review the investment plan for this client.',
                    'transaction-skill', 'get_transactions',
                    jsonb_build_object(
                        'client_id',   v_client_id,
                        'scheme_code', v_scheme_code,
                        'txn_id',      v_txn_id,
                        'session_id',  p_session_id
                    ),
                    NOW()
                );
            END IF;

            UPDATE ki_import_staging
            SET    processing_status    = 'success',
                   created_record_id    = v_txn_id::TEXT,
                   created_record_type  = 'transaction',
                   processed_at         = NOW()
            WHERE  id = v_staging.id;

            v_success   := v_success   + 1;
            v_processed := v_processed + 1;

        EXCEPTION WHEN OTHERS THEN
            UPDATE ki_import_staging
            SET    processing_status = 'failed',
                   error_messages    = ARRAY[SQLERRM],
                   processed_at      = NOW()
            WHERE  id = v_staging.id;
            v_failed    := v_failed    + 1;
            v_processed := v_processed + 1;
        END;

        IF v_processed % v_batch_size = 0 THEN
            UPDATE ki_import_sessions
            SET    successful_records = v_success,
                   failed_records     = v_failed,
                   orphan_records     = v_orphans,
                   duplicate_records  = v_duplicates,
                   processed_records  = v_processed,
                   updated_at         = NOW()
            WHERE  id = p_session_id;
        END IF;

    END LOOP;

    UPDATE ki_import_sessions
    SET    status = CASE
               WHEN v_failed + v_orphans > 0 THEN 'completed_with_errors'
               ELSE 'completed'
           END,
           successful_records      = v_success,
           failed_records          = v_failed,
           orphan_records          = v_orphans,
           duplicate_records       = v_duplicates,
           processed_records       = v_processed,
           processing_completed_at = NOW(),
           updated_at              = NOW()
    WHERE  id = p_session_id;

    RETURN QUERY
    SELECT v_processed, v_success, v_failed, v_duplicates, v_orphans,
           EXTRACT(EPOCH FROM (NOW() - v_start_time))::NUMERIC;

END;
$$;

COMMENT ON FUNCTION ki_process_txn_import_session IS
    'Processes all pending rows in ki_import_staging for a given transaction import session. '
    'Performs client lookup (iwell_code/customer_name/both), scheme lookup, duplicate check, '
    'portfolio/holdings upsert, and transaction insert. Stamps import_session_id on each inserted '
    'transaction so they can be filtered by session in the UI. '
    'Returns aggregate counts: total_processed, successful, failed, duplicates, orphans, processing_time_s.';

DO $$ BEGIN
    RAISE NOTICE '[049] ki_transactions.import_session_id: added (FK to ki_import_sessions)';
    RAISE NOTICE '[049] ki_process_txn_import_session(): updated — stamps import_session_id on every inserted transaction';
    RAISE NOTICE '[049] Existing transactions have import_session_id = NULL (pre-migration imports)';
END $$;
