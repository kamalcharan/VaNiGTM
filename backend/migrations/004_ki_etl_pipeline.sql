-- ============================================================
-- KI-Prime — Migration 004: ETL Import Pipeline
-- Adds file uploads, import sessions, and staging tables.
-- Also extends ki_schemes with fields from SchemeMaster Excel.
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
-- 2. FILE UPLOADS (tracks every uploaded file)
-- Global table — no tenant_id for scheme imports
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
    uploaded_by         UUID,                                   -- user who uploaded
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ki_file_uploads_type ON ki_file_uploads(file_type);
CREATE INDEX idx_ki_file_uploads_hash ON ki_file_uploads(file_hash);

-- ============================================================
-- 3. IMPORT SESSIONS (one per import operation)
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
    field_mappings          JSONB,                              -- { "AMC": "amc", "Code": "scheme_code", ... }
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

CREATE INDEX idx_ki_import_sessions_type ON ki_import_sessions(import_type);
CREATE INDEX idx_ki_import_sessions_status ON ki_import_sessions(status);
CREATE INDEX idx_ki_import_sessions_tenant ON ki_import_sessions(tenant_id) WHERE tenant_id IS NOT NULL;

-- ============================================================
-- 4. IMPORT STAGING (row-level staging + processing status)
-- ============================================================

CREATE TABLE IF NOT EXISTS ki_import_staging (
    id                  SERIAL PRIMARY KEY,
    session_id          INTEGER NOT NULL REFERENCES ki_import_sessions(id) ON DELETE CASCADE,
    row_number          INTEGER NOT NULL,
    raw_data            JSONB NOT NULL,                         -- original Excel row as JSON
    mapped_data         JSONB,                                  -- after field mapping + transforms
    processing_status   TEXT NOT NULL DEFAULT 'pending'
                        CHECK (processing_status IN ('pending', 'processing', 'success', 'failed', 'duplicate', 'skipped')),
    error_messages      TEXT[],
    warnings            TEXT[],
    created_record_id   TEXT,                                   -- PK of created/updated record (e.g., scheme_code)
    processed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(session_id, row_number)
);

CREATE INDEX idx_ki_import_staging_session ON ki_import_staging(session_id);
CREATE INDEX idx_ki_import_staging_status ON ki_import_staging(session_id, processing_status);
