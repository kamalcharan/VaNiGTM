-- ============================================================
-- KI-Prime — Migration 004: ETL Import Pipeline
--
-- Tables: ki_file_uploads, ki_import_sessions, ki_import_staging
-- Functions: process_single_scheme_record, process_scheme_import_with_timing
-- Triggers: updated_at on all ETL tables
--
-- Pattern: Two-phase import (staging in Node.js, processing in PL/pgSQL)
-- Matches kewalinvest production RPC architecture.
-- ============================================================

-- ============================================================
-- 1. EXTEND ki_schemes (add missing columns from SchemeMaster)
-- ============================================================

ALTER TABLE ki_schemes
  ADD COLUMN IF NOT EXISTS nav_name          TEXT,
  ADD COLUMN IF NOT EXISTS min_amount        NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS closure_date      DATE,
  ADD COLUMN IF NOT EXISTS isin_reinvestment TEXT;

-- ============================================================
-- 2. FILE UPLOADS
-- ============================================================

CREATE TABLE IF NOT EXISTS ki_file_uploads (
    id                  SERIAL PRIMARY KEY,
    tenant_id           UUID,                                  -- NULL for global imports (schemes)
    file_type           TEXT NOT NULL,                          -- 'scheme' | 'customer' | 'transaction' | 'bookmark'
    original_filename   TEXT NOT NULL,
    stored_filename     TEXT NOT NULL,
    file_path           TEXT NOT NULL,
    file_size           BIGINT,
    mime_type           TEXT,
    file_hash           TEXT,                                   -- SHA-256 for duplicate detection
    processing_status   TEXT NOT NULL DEFAULT 'pending'
                        CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
    uploaded_by         UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ki_file_uploads_type ON ki_file_uploads(file_type);
CREATE INDEX IF NOT EXISTS idx_ki_file_uploads_hash ON ki_file_uploads(file_hash);

-- ============================================================
-- 3. IMPORT SESSIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS ki_import_sessions (
    id                      SERIAL PRIMARY KEY,
    tenant_id               UUID,                              -- NULL for global imports (schemes)
    file_upload_id          INTEGER REFERENCES ki_file_uploads(id),
    import_type             TEXT NOT NULL
                            CHECK (import_type IN ('scheme', 'customer', 'transaction', 'bookmark')),
    status                  TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'staged', 'processing', 'completed', 'completed_with_errors', 'failed', 'cancelled')),
    total_records           INTEGER NOT NULL DEFAULT 0,
    processed_records       INTEGER NOT NULL DEFAULT 0,
    successful_records      INTEGER NOT NULL DEFAULT 0,
    failed_records          INTEGER NOT NULL DEFAULT 0,
    duplicate_records       INTEGER NOT NULL DEFAULT 0,
    field_mappings          JSONB,
    batch_size              INTEGER NOT NULL DEFAULT 100,
    current_batch           INTEGER NOT NULL DEFAULT 0,
    last_processed_row      INTEGER NOT NULL DEFAULT 0,
    error_summary           TEXT,
    staging_completed_at    TIMESTAMPTZ,
    processing_started_at   TIMESTAMPTZ,
    processing_completed_at TIMESTAMPTZ,
    created_by              UUID,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ki_import_sessions_type ON ki_import_sessions(import_type);
CREATE INDEX IF NOT EXISTS idx_ki_import_sessions_status ON ki_import_sessions(status);

-- ============================================================
-- 4. IMPORT STAGING (row-level)
-- ============================================================

CREATE TABLE IF NOT EXISTS ki_import_staging (
    id                  SERIAL PRIMARY KEY,
    session_id          INTEGER NOT NULL REFERENCES ki_import_sessions(id) ON DELETE CASCADE,
    row_number          INTEGER NOT NULL,
    raw_data            JSONB NOT NULL,
    mapped_data         JSONB,
    processing_status   TEXT NOT NULL DEFAULT 'pending'
                        CHECK (processing_status IN ('pending', 'processing', 'success', 'failed', 'duplicate', 'skipped')),
    error_messages      TEXT[],
    warnings            TEXT[],
    created_record_id   TEXT,                                   -- PK of created/updated record
    created_record_type TEXT,                                   -- 'scheme', 'client', 'transaction'
    processed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(session_id, row_number)
);

CREATE INDEX IF NOT EXISTS idx_ki_import_staging_session ON ki_import_staging(session_id);
CREATE INDEX IF NOT EXISTS idx_ki_import_staging_status ON ki_import_staging(session_id, processing_status);

-- ============================================================
-- 5. TRIGGER FUNCTIONS
-- ============================================================

-- Generic updated_at trigger (if not already exists)
CREATE OR REPLACE FUNCTION ki_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach triggers
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ki_file_uploads_updated_at') THEN
        CREATE TRIGGER trg_ki_file_uploads_updated_at
            BEFORE UPDATE ON ki_file_uploads FOR EACH ROW EXECUTE FUNCTION ki_update_updated_at();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ki_import_sessions_updated_at') THEN
        CREATE TRIGGER trg_ki_import_sessions_updated_at
            BEFORE UPDATE ON ki_import_sessions FOR EACH ROW EXECUTE FUNCTION ki_update_updated_at();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ki_import_staging_updated_at') THEN
        CREATE TRIGGER trg_ki_import_staging_updated_at
            BEFORE UPDATE ON ki_import_staging FOR EACH ROW EXECUTE FUNCTION ki_update_updated_at();
    END IF;
END $$;

-- ============================================================
-- 6. RPC: process_single_scheme_record
--
-- Processes one staged row into ki_schemes.
-- Duplicate by scheme_code → UPDATE. New → INSERT.
-- Date parsing: 3 format attempts (YYYY-MM-DD, DD-MM-YYYY, MM-DD-YYYY).
-- Error: captured in staging error_messages, row marked 'failed'.
--
-- Adapted from kewalinvest process_single_scheme_record.
-- Key differences vs kewalinvest:
--   - ki_schemes uses scheme_code TEXT as PK (not INTEGER id)
--   - No tenant_id on ki_schemes (global table)
--   - No is_live flag (ProKey uses RLS + single environment)
--   - No scheme_type_id/scheme_category_id FK lookups (inline text)
--   - ISIN splitting done during staging (Node.js), not here
-- ============================================================

DROP FUNCTION IF EXISTS process_single_scheme_record(INTEGER) CASCADE;

CREATE OR REPLACE FUNCTION process_single_scheme_record(p_staging_id INTEGER)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_staging           RECORD;
    v_mapped_data       JSONB;
    v_scheme_code       TEXT;
    v_is_duplicate      BOOLEAN;
    v_error_messages    TEXT[];
    v_launch_date       DATE;
    v_closure_date      DATE;
    v_minimum_amount    NUMERIC(15,2);
    v_scheme_type       TEXT;
BEGIN
    -- 1. Get staging record
    SELECT * INTO v_staging
    FROM ki_import_staging
    WHERE id = p_staging_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- 2. Mark as processing
    UPDATE ki_import_staging
    SET processing_status = 'processing'
    WHERE id = p_staging_id;

    v_mapped_data := v_staging.mapped_data;
    v_error_messages := ARRAY[]::TEXT[];

    BEGIN
        -- 3. Extract and validate scheme_code (required)
        v_scheme_code := TRIM(v_mapped_data->>'scheme_code');
        IF v_scheme_code IS NULL OR v_scheme_code = '' THEN
            RAISE EXCEPTION 'scheme_code is required';
        END IF;

        -- 4. Normalize scheme_type to match CHECK constraint (open/close/interval)
        v_scheme_type := 'open';  -- default
        IF v_mapped_data->>'scheme_type' IS NOT NULL THEN
            CASE LOWER(TRIM(v_mapped_data->>'scheme_type'))
                WHEN 'open ended' THEN v_scheme_type := 'open';
                WHEN 'open' THEN v_scheme_type := 'open';
                WHEN 'close ended' THEN v_scheme_type := 'close';
                WHEN 'close' THEN v_scheme_type := 'close';
                WHEN 'closed' THEN v_scheme_type := 'close';
                WHEN 'interval' THEN v_scheme_type := 'interval';
                ELSE v_scheme_type := 'open';
            END CASE;
        END IF;

        -- 5. Check for duplicate by scheme_code (global, no tenant filter)
        SELECT COUNT(*) > 0 INTO v_is_duplicate
        FROM ki_schemes
        WHERE scheme_code = v_scheme_code;

        IF v_is_duplicate THEN
            -- 6a. UPDATE existing scheme
            UPDATE ki_schemes
            SET
                scheme_name      = COALESCE(NULLIF(TRIM(v_mapped_data->>'scheme_name'), ''), scheme_name),
                amc              = COALESCE(NULLIF(TRIM(v_mapped_data->>'amc'), ''), amc),
                category         = COALESCE(NULLIF(TRIM(v_mapped_data->>'category'), ''), category),
                scheme_type      = v_scheme_type,
                nav_name         = COALESCE(NULLIF(TRIM(v_mapped_data->>'nav_name'), ''), nav_name),
                min_amount       = CASE
                                     WHEN v_mapped_data->>'min_amount' IS NOT NULL
                                       AND TRIM(v_mapped_data->>'min_amount') != ''
                                     THEN (v_mapped_data->>'min_amount')::NUMERIC(15,2)
                                     ELSE min_amount
                                   END,
                isin_growth      = COALESCE(NULLIF(TRIM(v_mapped_data->>'isin_growth'), ''), isin_growth),
                isin_dividend    = COALESCE(NULLIF(TRIM(v_mapped_data->>'isin_dividend'), ''), isin_dividend),
                isin_reinvestment = COALESCE(NULLIF(TRIM(v_mapped_data->>'isin_reinvestment'), ''), isin_reinvestment),
                updated_at       = CURRENT_TIMESTAMP
            WHERE scheme_code = v_scheme_code;

            -- Mark staging as duplicate (upserted)
            UPDATE ki_import_staging
            SET processing_status = 'duplicate',
                warnings = array_append(warnings, 'Scheme already exists - updated'),
                created_record_id = v_scheme_code,
                created_record_type = 'scheme',
                processed_at = CURRENT_TIMESTAMP
            WHERE id = p_staging_id;

            RETURN;
        END IF;

        -- 6b. Parse launch_date (3 format attempts)
        v_launch_date := NULL;
        IF v_mapped_data->>'launch_date' IS NOT NULL AND TRIM(v_mapped_data->>'launch_date') != '' THEN
            BEGIN
                v_launch_date := TO_DATE(v_mapped_data->>'launch_date', 'YYYY-MM-DD');
            EXCEPTION WHEN OTHERS THEN
                BEGIN
                    v_launch_date := TO_DATE(v_mapped_data->>'launch_date', 'DD-MM-YYYY');
                EXCEPTION WHEN OTHERS THEN
                    BEGIN
                        v_launch_date := TO_DATE(v_mapped_data->>'launch_date', 'MM-DD-YYYY');
                    EXCEPTION WHEN OTHERS THEN
                        v_launch_date := NULL;
                    END;
                END;
            END;
        END IF;

        -- 6c. Parse closure_date (3 format attempts)
        v_closure_date := NULL;
        IF v_mapped_data->>'closure_date' IS NOT NULL AND TRIM(v_mapped_data->>'closure_date') != '' THEN
            BEGIN
                v_closure_date := TO_DATE(v_mapped_data->>'closure_date', 'YYYY-MM-DD');
            EXCEPTION WHEN OTHERS THEN
                BEGIN
                    v_closure_date := TO_DATE(v_mapped_data->>'closure_date', 'DD-MM-YYYY');
                EXCEPTION WHEN OTHERS THEN
                    BEGIN
                        v_closure_date := TO_DATE(v_mapped_data->>'closure_date', 'MM-DD-YYYY');
                    EXCEPTION WHEN OTHERS THEN
                        v_closure_date := NULL;
                    END;
                END;
            END;
        END IF;

        -- 6d. Parse minimum amount
        v_minimum_amount := NULL;
        IF v_mapped_data->>'min_amount' IS NOT NULL AND TRIM(v_mapped_data->>'min_amount') != '' THEN
            BEGIN
                v_minimum_amount := (v_mapped_data->>'min_amount')::NUMERIC(15,2);
            EXCEPTION WHEN OTHERS THEN
                v_minimum_amount := NULL;
            END;
        END IF;

        -- 7. INSERT new scheme
        INSERT INTO ki_schemes (
            scheme_code,
            scheme_name,
            amc,
            category,
            scheme_type,
            nav_name,
            min_amount,
            launch_date,
            closure_date,
            isin_growth,
            isin_dividend,
            isin_reinvestment,
            updated_at
        ) VALUES (
            v_scheme_code,
            COALESCE(NULLIF(TRIM(v_mapped_data->>'scheme_name'), ''), 'Unknown'),
            COALESCE(NULLIF(TRIM(v_mapped_data->>'amc'), ''), 'Unknown'),
            COALESCE(NULLIF(TRIM(v_mapped_data->>'category'), ''), 'Uncategorized'),
            v_scheme_type,
            NULLIF(TRIM(v_mapped_data->>'nav_name'), ''),
            v_minimum_amount,
            v_launch_date,
            v_closure_date,
            NULLIF(TRIM(v_mapped_data->>'isin_growth'), ''),
            NULLIF(TRIM(v_mapped_data->>'isin_dividend'), ''),
            NULLIF(TRIM(v_mapped_data->>'isin_reinvestment'), ''),
            CURRENT_TIMESTAMP
        );

        -- 8. Mark staging as success
        UPDATE ki_import_staging
        SET processing_status = 'success',
            created_record_id = v_scheme_code,
            created_record_type = 'scheme',
            processed_at = CURRENT_TIMESTAMP
        WHERE id = p_staging_id;

    EXCEPTION WHEN OTHERS THEN
        -- 9. Error handling — capture error, mark staging as failed
        v_error_messages := array_append(v_error_messages, SQLERRM);

        UPDATE ki_import_staging
        SET processing_status = 'failed',
            error_messages = v_error_messages,
            processed_at = CURRENT_TIMESTAMP
        WHERE id = p_staging_id;
    END;
END;
$$;

COMMENT ON FUNCTION process_single_scheme_record IS 'Process single scheme record from staging into ki_schemes. Adapted from kewalinvest.';

-- ============================================================
-- 7. RPC: process_scheme_import_with_timing
--
-- Batch orchestrator — loops all pending staging rows for a session,
-- calls process_single_scheme_record for each, tracks progress,
-- controls timing with pg_sleep between checkpoints.
--
-- Called from Node.js as:
--   SELECT * FROM process_scheme_import_with_timing($1, $2)
--
-- Returns a single row with counts + duration.
-- ============================================================

DROP FUNCTION IF EXISTS process_scheme_import_with_timing(INTEGER, INTEGER) CASCADE;

CREATE OR REPLACE FUNCTION process_scheme_import_with_timing(
    p_session_id INTEGER,
    p_target_duration_ms INTEGER DEFAULT 30000
) RETURNS TABLE(
    processed_count INTEGER,
    success_count INTEGER,
    failed_count INTEGER,
    duplicate_count INTEGER,
    actual_duration_ms INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_start_time        TIMESTAMP;
    v_end_time          TIMESTAMP;
    v_staging_record    RECORD;
    v_processed_count   INTEGER := 0;
    v_success_count     INTEGER := 0;
    v_failed_count      INTEGER := 0;
    v_duplicate_count   INTEGER := 0;
    v_batch_size        INTEGER := 100;
    v_sleep_ms          INTEGER;
    v_status            TEXT;
BEGIN
    v_start_time := clock_timestamp();

    -- Update session status to processing
    UPDATE ki_import_sessions
    SET status = 'processing',
        processing_started_at = v_start_time,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_session_id;

    -- Process all pending records
    FOR v_staging_record IN
        SELECT id
        FROM ki_import_staging
        WHERE session_id = p_session_id
          AND processing_status = 'pending'
        ORDER BY row_number
    LOOP
        -- Process single record via RPC
        PERFORM process_single_scheme_record(v_staging_record.id);

        -- Read back the updated status
        SELECT processing_status INTO v_status
        FROM ki_import_staging
        WHERE id = v_staging_record.id;

        -- Update counters
        v_processed_count := v_processed_count + 1;

        CASE v_status
            WHEN 'success' THEN v_success_count := v_success_count + 1;
            WHEN 'failed' THEN v_failed_count := v_failed_count + 1;
            WHEN 'duplicate' THEN v_duplicate_count := v_duplicate_count + 1;
            ELSE NULL;
        END CASE;

        -- Timing control: sleep every 10 records to spread load
        IF v_processed_count % 10 = 0 THEN
            v_end_time := clock_timestamp();
            v_sleep_ms := (p_target_duration_ms / v_batch_size) -
                          EXTRACT(MILLISECOND FROM (v_end_time - v_start_time));

            IF v_sleep_ms > 0 THEN
                PERFORM pg_sleep(v_sleep_ms / 1000.0);
            END IF;

            -- Update session progress
            UPDATE ki_import_sessions
            SET processed_records = v_processed_count,
                successful_records = v_success_count,
                failed_records = v_failed_count,
                duplicate_records = v_duplicate_count,
                last_processed_row = v_processed_count,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = p_session_id;
        END IF;
    END LOOP;

    v_end_time := clock_timestamp();

    -- Final session update
    UPDATE ki_import_sessions
    SET status = CASE
            WHEN v_failed_count > 0 THEN 'completed_with_errors'
            ELSE 'completed'
        END,
        processed_records = v_processed_count,
        successful_records = v_success_count,
        failed_records = v_failed_count,
        duplicate_records = v_duplicate_count,
        processing_completed_at = v_end_time,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_session_id;

    -- Return results
    RETURN QUERY SELECT
        v_processed_count,
        v_success_count,
        v_failed_count,
        v_duplicate_count,
        EXTRACT(MILLISECOND FROM (v_end_time - v_start_time))::INTEGER;
END;
$$;

COMMENT ON FUNCTION process_scheme_import_with_timing IS 'Process scheme import session with controlled timing. Adapted from kewalinvest.';
