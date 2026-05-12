-- ============================================================
-- 045_ki_process_txn_import.sql
--
-- PL/pgSQL RPC: ki_process_txn_import_session(p_session_id INTEGER)
--
-- Processes all 'pending' rows in ki_import_staging for a given
-- import session. Per-row pipeline:
--
--   1. CLIENT LOOKUP
--      vendor_code → ki_clients.ext_ref_id (tenant's platform code)
--      └─ fallback: PAN from row        → ki_clients.pan
--      └─ fallback: customer_name       → ki_normalize_contact_name()
--                                          → ki_contacts.normalized_name
--      └─ not found → status = 'orphan', CONTINUE
--
--      Vendor platform (IWELL/CAMS/etc) is on vn_tenants.ext_ref_type_code.
--      No separate ki_client_codes table needed — ext_ref_id is the code.
--
--   2. TRANSACTION TYPE LOOKUP
--      txn_code → ki_transaction_types.txn_code (UPPER match)
--      └─ fallback: match against txn_name
--      └─ not found → status = 'failed', CONTINUE
--
--   3. SCHEME LOOKUP
--      scheme_name → lookup_scheme_by_alias() → scheme_code
--      └─ must be bookmarked by tenant in ki_scheme_bookmarks
--      └─ not found / not bookmarked → status = 'failed', CONTINUE
--
--   4. DUPLICATE CHECK
--      (client_id, scheme_code, txn_date, amount, units) already exists
--      → status = 'duplicate', CONTINUE
--
--   5. GET / CREATE CLIENT PORTFOLIO
--      SELECT ki_portfolios WHERE (tenant_id, is_live, client_id, active)
--      → not found: auto-INSERT 'Default' portfolio
--
--   6. UPSERT ki_holdings (portfolio entry marker)
--      INSERT ... ON CONFLICT (tenant_id, is_live, client_id, portfolio_id, scheme_code)
--      DO UPDATE SET updated_at = NOW()
--      (unit math is done by a separate holdings reconciliation job)
--
--   7. INSERT ki_transactions (full row from mapped_data JSONB)
--
--   8. NEW SCHEME ALERT
--      If step 6 was the first insert (not a conflict) →
--      INSERT ki_alerts type='new_scheme_detected'
--      Signals the advisor: "This client now has a new MF — review investment plan."
--      NOTE: ki_alerts may be renamed ki_pulses in a future release (CLAUDE.md #15).
--
--   Batch checkpoint: UPDATE ki_import_sessions counters every 500 rows.
--   Final UPDATE: set status = 'completed' | 'completed_with_errors'.
--
-- Called by import_transactions skill function after staging is complete.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION ki_process_txn_import_session(
    p_session_id INTEGER
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
BEGIN

    -- ─────────────────────────────────────────────────────────────────────────
    -- Load session info
    -- ─────────────────────────────────────────────────────────────────────────
    SELECT s.tenant_id, s.is_live, s.created_by
    INTO   v_tenant_id, v_is_live, v_creator_id
    FROM   ki_import_sessions s
    WHERE  s.id = p_session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION '[ki_process_txn_import_session] Session % not found', p_session_id;
    END IF;

    -- Mark session as processing
    UPDATE ki_import_sessions
    SET    status               = 'processing',
           processing_started_at = NOW(),
           updated_at           = NOW()
    WHERE  id = p_session_id;

    RAISE NOTICE '[Session %] Starting. tenant=%, is_live=%',
        p_session_id, v_tenant_id, v_is_live;

    -- ─────────────────────────────────────────────────────────────────────────
    -- Main loop — one iteration per pending staging row
    -- ─────────────────────────────────────────────────────────────────────────
    FOR v_staging IN (
        SELECT id, row_number, mapped_data
        FROM   ki_import_staging
        WHERE  session_id         = p_session_id
          AND  processing_status  = 'pending'
        ORDER  BY id
    ) LOOP
        BEGIN
            -- Reset per-row state
            v_client_id      := NULL;
            v_txn_type_id    := NULL;
            v_scheme_code    := NULL;
            v_scheme_name    := NULL;
            v_portfolio_id   := NULL;
            v_txn_id         := NULL;
            v_error_msg      := NULL;
            v_is_new_holding := FALSE;
            v_txn_amount     := 0;

            -- ─────────────────────────────────────────────────────────────────
            -- STEP 1: CLIENT LOOKUP
            -- Priority: ext_ref_id (vendor code) → PAN → normalized name
            --
            -- Vendor platform is on vn_tenants.ext_ref_type_code (IWELL/CAMS/etc).
            -- The actual code per client is ki_clients.ext_ref_id.
            -- The import file's vendor_code field maps to ext_ref_id.
            -- ─────────────────────────────────────────────────────────────────

            -- 1a. ext_ref_id match (vendor code from import file)
            IF v_staging.mapped_data->>'vendor_code' IS NOT NULL
               AND TRIM(v_staging.mapped_data->>'vendor_code') <> ''
            THEN
                SELECT c.id
                INTO   v_client_id
                FROM   ki_clients c
                WHERE  c.tenant_id = v_tenant_id
                  AND  c.is_live   = v_is_live
                  AND  c.is_active = true
                  AND  UPPER(TRIM(c.ext_ref_id)) = UPPER(TRIM(v_staging.mapped_data->>'vendor_code'))
                LIMIT  1;
            END IF;

            -- 1b. PAN fallback
            IF v_client_id IS NULL
               AND v_staging.mapped_data->>'pan' IS NOT NULL
               AND TRIM(v_staging.mapped_data->>'pan') <> ''
            THEN
                SELECT c.id
                INTO   v_client_id
                FROM   ki_clients c
                WHERE  c.tenant_id = v_tenant_id
                  AND  c.is_live   = v_is_live
                  AND  c.is_active = true
                  AND  UPPER(TRIM(c.pan)) = UPPER(TRIM(v_staging.mapped_data->>'pan'))
                LIMIT  1;

                IF v_client_id IS NOT NULL THEN
                    RAISE NOTICE '[Session %] Row %: matched via PAN fallback', p_session_id, v_staging.row_number;
                END IF;
            END IF;

            -- 1c. Normalized name fallback (requires contact_id link on ki_clients)
            IF v_client_id IS NULL
               AND v_staging.mapped_data->>'customer_name' IS NOT NULL
               AND TRIM(v_staging.mapped_data->>'customer_name') <> ''
            THEN
                SELECT c.id
                INTO   v_client_id
                FROM   ki_clients  c
                JOIN   ki_contacts ct ON ct.id = c.contact_id
                WHERE  c.tenant_id  = v_tenant_id
                  AND  c.is_live    = v_is_live
                  AND  c.is_active  = true
                  AND  ct.is_active = true
                  AND  ct.normalized_name =
                           ki_normalize_contact_name(v_staging.mapped_data->>'customer_name')
                LIMIT  1;

                IF v_client_id IS NOT NULL THEN
                    RAISE NOTICE '[Session %] Row %: matched via name fallback', p_session_id, v_staging.row_number;
                END IF;
            END IF;

            -- No client found → orphan
            IF v_client_id IS NULL THEN
                UPDATE ki_import_staging
                SET    processing_status = 'orphan',
                       error_messages    = ARRAY[
                           'No matching client found. Tried vendor_code=' ||
                           COALESCE(v_staging.mapped_data->>'vendor_code', 'NULL') ||
                           ', PAN=' || COALESCE(v_staging.mapped_data->>'pan', 'NULL') ||
                           ', name=' || COALESCE(v_staging.mapped_data->>'customer_name', 'NULL')
                       ],
                       processed_at      = NOW()
                WHERE  id = v_staging.id;

                v_orphans   := v_orphans   + 1;
                v_processed := v_processed + 1;
                CONTINUE;
            END IF;

            -- ─────────────────────────────────────────────────────────────────
            -- STEP 2: TRANSACTION TYPE LOOKUP
            -- ─────────────────────────────────────────────────────────────────

            IF v_staging.mapped_data->>'txn_code' IS NOT NULL
               AND TRIM(v_staging.mapped_data->>'txn_code') <> ''
            THEN
                -- Match against txn_code (e.g. 'PURCHASE', 'SIP', 'REDEMPTION')
                SELECT id INTO v_txn_type_id
                FROM   ki_transaction_types
                WHERE  UPPER(TRIM(txn_code)) = UPPER(TRIM(v_staging.mapped_data->>'txn_code'))
                  AND  is_active = true
                LIMIT  1;

                -- Fallback: match against txn_name (e.g. 'Purchase', 'Fresh Purchase')
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

            -- ─────────────────────────────────────────────────────────────────
            -- STEP 3: SCHEME LOOKUP
            -- scheme_name from file → lookup_scheme_by_alias() → scheme_code
            -- Scheme must be bookmarked by this tenant.
            -- ─────────────────────────────────────────────────────────────────

            IF v_staging.mapped_data->>'scheme_name' IS NOT NULL
               AND TRIM(v_staging.mapped_data->>'scheme_name') <> ''
            THEN
                SELECT sa.scheme_code, sa.scheme_name
                INTO   v_scheme_code, v_scheme_name
                FROM   lookup_scheme_by_alias(v_staging.mapped_data->>'scheme_name') sa;

                IF v_scheme_code IS NOT NULL THEN
                    -- Verify bookmarked by this tenant
                    IF NOT EXISTS (
                        SELECT 1 FROM ki_scheme_bookmarks
                        WHERE tenant_id  = v_tenant_id
                          AND scheme_code = v_scheme_code
                    ) THEN
                        v_error_msg  := 'Scheme not bookmarked by tenant: ' ||
                                        COALESCE(v_scheme_name, v_staging.mapped_data->>'scheme_name');
                        v_scheme_code := NULL;
                    END IF;
                ELSE
                    v_error_msg := 'Scheme not in alias table: ' || (v_staging.mapped_data->>'scheme_name');
                END IF;
            ELSE
                v_error_msg := 'scheme_name is required but missing';
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

            -- ─────────────────────────────────────────────────────────────────
            -- STEP 4: DUPLICATE CHECK
            -- Same client + scheme + date + amount + units = duplicate.
            -- Flags potential duplicates rather than hard-blocking (to let the
            -- advisor review via Course Correction if needed).
            -- ─────────────────────────────────────────────────────────────────

            v_txn_amount := COALESCE(
                NULLIF(TRIM(v_staging.mapped_data->>'amount'), '')::NUMERIC,
                0
            );

            IF EXISTS (
                SELECT 1 FROM ki_transactions
                WHERE  tenant_id  = v_tenant_id
                  AND  is_live    = v_is_live
                  AND  client_id  = v_client_id
                  AND  scheme_code = v_scheme_code
                  AND  txn_date   = (v_staging.mapped_data->>'txn_date')::DATE
                  AND  amount     = v_txn_amount
                  AND  units      = COALESCE(
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

            -- ─────────────────────────────────────────────────────────────────
            -- STEP 5: GET / CREATE CLIENT PORTFOLIO
            -- Use the client's first active portfolio for this environment.
            -- Auto-create a 'Default' portfolio if none exists.
            -- ─────────────────────────────────────────────────────────────────

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

                RAISE NOTICE '[Session %] Row %: Auto-created portfolio for client %',
                    p_session_id, v_staging.row_number, v_client_id;
            END IF;

            -- ─────────────────────────────────────────────────────────────────
            -- STEP 6: UPSERT ki_holdings (portfolio entry marker)
            -- Records that this client holds this scheme. Unit math is NOT
            -- done here — a separate holdings reconciliation job computes
            -- current units from all transactions.
            -- Capture whether this is a brand-new holding for step 8.
            -- ─────────────────────────────────────────────────────────────────

            -- Check before upsert (to know if alert is needed)
            v_is_new_holding := NOT EXISTS (
                SELECT 1 FROM ki_holdings
                WHERE  tenant_id  = v_tenant_id
                  AND  is_live    = v_is_live
                  AND  client_id  = v_client_id
                  AND  scheme_code = v_scheme_code
            );

            INSERT INTO ki_holdings (
                tenant_id, is_live, client_id, portfolio_id, scheme_code,
                units, total_invested, is_sip,
                sip_start_date, updated_at
            ) VALUES (
                v_tenant_id, v_is_live, v_client_id, v_portfolio_id, v_scheme_code,
                0,      -- units: reconciliation job will calculate from transactions
                0,      -- total_invested: reconciliation job will sum
                false,
                (v_staging.mapped_data->>'txn_date')::DATE,
                NOW()
            )
            ON CONFLICT (tenant_id, is_live, client_id, portfolio_id, scheme_code)
            DO UPDATE SET
                updated_at = NOW();

            -- ─────────────────────────────────────────────────────────────────
            -- STEP 7: INSERT TRANSACTION
            -- txn_type left NULL (superseded by txn_type_id from migration 042).
            -- source_ref stores the staging row ID for traceability.
            -- ─────────────────────────────────────────────────────────────────

            INSERT INTO ki_transactions (
                tenant_id, is_live,
                client_id, portfolio_id, scheme_code,
                txn_type_id,
                txn_date,
                amount, units, nav,
                stamp_duty, stt, tds,
                euin, arn, folio_no,
                fund_name, category, sip_reg_date,
                description, source, source_ref,
                is_potential_duplicate, portfolio_flag,
                created_at
            ) VALUES (
                v_tenant_id, v_is_live,
                v_client_id, v_portfolio_id, v_scheme_code,
                v_txn_type_id,
                (v_staging.mapped_data->>'txn_date')::DATE,
                v_txn_amount,
                COALESCE(NULLIF(TRIM(v_staging.mapped_data->>'units'), '')::NUMERIC, 0),
                COALESCE(NULLIF(TRIM(v_staging.mapped_data->>'nav'), '')::NUMERIC, 0),
                COALESCE(NULLIF(TRIM(v_staging.mapped_data->>'stamp_duty'), '')::NUMERIC, 0),
                COALESCE(NULLIF(TRIM(v_staging.mapped_data->>'stt'), '')::NUMERIC, 0),
                COALESCE(NULLIF(TRIM(v_staging.mapped_data->>'tds'), '')::NUMERIC, 0),
                NULLIF(TRIM(COALESCE(v_staging.mapped_data->>'euin', '')), ''),
                NULLIF(TRIM(COALESCE(v_staging.mapped_data->>'arn_code', '')), ''),
                NULLIF(TRIM(COALESCE(v_staging.mapped_data->>'folio_number', '')), ''),
                NULLIF(TRIM(COALESCE(v_staging.mapped_data->>'fund_name', '')), ''),
                NULLIF(TRIM(COALESCE(v_staging.mapped_data->>'category', '')), ''),
                NULLIF(TRIM(COALESCE(v_staging.mapped_data->>'sip_reg_date', '')), '')::DATE,
                NULLIF(TRIM(COALESCE(v_staging.mapped_data->>'description', '')), ''),
                'import',
                v_staging.id::TEXT,      -- source_ref: links back to staging row
                false,                   -- is_potential_duplicate (dedup passed above)
                true,                    -- portfolio_flag: included in portfolio calcs
                NOW()
            )
            RETURNING id INTO v_txn_id;

            -- ─────────────────────────────────────────────────────────────────
            -- STEP 8: NEW SCHEME ALERT
            -- Only when this is the client's first ever transaction for this
            -- scheme — signals the advisor to review the investment plan.
            -- NOTE: ki_alerts → future rename to ki_pulses (CLAUDE.md #15)
            -- ─────────────────────────────────────────────────────────────────

            IF v_is_new_holding THEN
                INSERT INTO ki_alerts (
                    tenant_id, is_live, client_id,
                    alert_type, priority,
                    title, body,
                    action_skill, action_function, action_params,
                    created_at
                ) VALUES (
                    v_tenant_id, v_is_live, v_client_id,
                    'new_scheme_detected', 'medium',
                    'New MF detected: ' || v_scheme_name,
                    'Scheme "' || v_scheme_name || '" has appeared for the first time ' ||
                    'in imported transactions. Please review the investment plan for this client.',
                    'transaction-skill',
                    'get_transactions',
                    jsonb_build_object(
                        'client_id',   v_client_id,
                        'scheme_code', v_scheme_code,
                        'txn_id',      v_txn_id,
                        'session_id',  p_session_id
                    ),
                    NOW()
                );
            END IF;

            -- Mark staging row as success
            UPDATE ki_import_staging
            SET    processing_status = 'success',
                   created_record_id   = v_txn_id::TEXT,
                   created_record_type = 'transaction',
                   processed_at        = NOW()
            WHERE  id = v_staging.id;

            v_success   := v_success   + 1;
            v_processed := v_processed + 1;

        EXCEPTION WHEN OTHERS THEN
            -- Row-level exception: log and continue — do NOT abort the session
            UPDATE ki_import_staging
            SET    processing_status = 'failed',
                   error_messages    = ARRAY[SQLERRM],
                   processed_at      = NOW()
            WHERE  id = v_staging.id;

            v_failed    := v_failed    + 1;
            v_processed := v_processed + 1;

            RAISE NOTICE '[Session %] Row % exception: %',
                p_session_id, v_staging.row_number, SQLERRM;
        END;  -- inner BEGIN/EXCEPTION block

        -- ─────────────────────────────────────────────────────────────────────
        -- Batch checkpoint: flush counters every 500 rows
        -- ─────────────────────────────────────────────────────────────────────
        IF v_processed % v_batch_size = 0 THEN
            UPDATE ki_import_sessions
            SET    successful_records = v_success,
                   failed_records     = v_failed,
                   orphan_records     = v_orphans,
                   duplicate_records  = v_duplicates,
                   processed_records  = v_processed,
                   updated_at         = NOW()
            WHERE  id = p_session_id;

            RAISE NOTICE '[Session %] Checkpoint: % processed (%s ok, %s failed, %s orphan, %s dup)',
                p_session_id, v_processed, v_success, v_failed, v_orphans, v_duplicates;
        END IF;

    END LOOP;  -- main staging loop

    -- ─────────────────────────────────────────────────────────────────────────
    -- Final: update session to completed
    -- ─────────────────────────────────────────────────────────────────────────
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

    RAISE NOTICE '[Session %] Done. total=% ok=% failed=% orphan=% dup=% time=%s',
        p_session_id, v_processed, v_success, v_failed, v_orphans, v_duplicates,
        EXTRACT(EPOCH FROM (NOW() - v_start_time))::NUMERIC;

    RETURN QUERY
    SELECT v_processed, v_success, v_failed, v_duplicates, v_orphans,
           EXTRACT(EPOCH FROM (NOW() - v_start_time))::NUMERIC;

END;
$$;

COMMENT ON FUNCTION ki_process_txn_import_session IS
'Process all pending staging rows for a transaction import session.
 Per-row: client lookup (ext_ref_id → PAN → name) → txn type → scheme →
 dedup → holdings upsert → transaction insert → new-scheme alert.
 Called by the import_transactions skill function.
 Requires migration 043 (schema fixes) and 044 (orphan_records) to be applied first.
 Client vendor codes use ki_clients.ext_ref_id + vn_tenants.ext_ref_type_code
 (migration 033) — no separate vendor code table needed.';

-- Verify
DO $$
BEGIN
    RAISE NOTICE '[045] ki_process_txn_import_session(): created';
    RAISE NOTICE '[045] Signature: ki_process_txn_import_session(p_session_id INTEGER)';
    RAISE NOTICE '[045] Returns: (total_processed, successful, failed, duplicates, orphans, processing_time_s)';
END;
$$;

COMMIT;
