-- ============================================================================
-- Migration 182: Vikuna Phase 1 — Knowledge Ingestion Tables
--
-- Per VIKUNA_HANDOVER Addendum 02.
--
-- Adds:
--   gt_tenant_integrations  — OAuth tokens + folder linkage for tenant
--                             knowledge sources (Google Drive today).
--   gt_kb_sources           — every ingested document/URL/file. The
--                             ingestion-skill (built in later stages) reads
--                             status='pending', parses, chunks, extracts
--                             entities into gt_kg_nodes.
--
-- Schema invariants carried from Phase 0:
--   gt_agent_runs.id = BIGINT   → source_run_id columns here are BIGINT.
--   tenant_id        = UUID     → FK to vn_tenants(id) ON DELETE CASCADE.
--   All tenant-scoped tables get RLS using app.current_tenant_id.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: gt_tenant_integrations  (OAuth credentials + folder linkage)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_tenant_integrations (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID         NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,

    provider        VARCHAR(50)  NOT NULL,
    -- 'gdrive' only for now. Future: 'dropbox', 'notion', 'onedrive', etc.

    -- Folder linkage (provider-specific identifiers stored as strings).
    folder_id       VARCHAR(200),
    folder_name     VARCHAR(500),

    -- OAuth credentials.
    access_token    TEXT         NOT NULL,
    refresh_token   TEXT,
    expires_at      TIMESTAMPTZ,
    scope           TEXT,

    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT gt_tenant_integrations_unique UNIQUE (tenant_id, provider)
);

COMMENT ON TABLE  gt_tenant_integrations             IS 'OAuth credentials + folder linkage for tenant knowledge sources (Google Drive, etc).';
COMMENT ON COLUMN gt_tenant_integrations.provider    IS 'Provider key. ''gdrive'' only for now.';
COMMENT ON COLUMN gt_tenant_integrations.folder_id   IS 'Provider-specific folder identifier (e.g. Google Drive folder ID).';
COMMENT ON COLUMN gt_tenant_integrations.expires_at  IS 'Access token expiry timestamp from the provider.';

CREATE INDEX IF NOT EXISTS idx_gt_tenant_integrations_tenant_provider
    ON gt_tenant_integrations (tenant_id, provider);


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: gt_kb_sources  (every ingested document, URL, or file)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_kb_sources (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID         NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,

    source_type         VARCHAR(20)  NOT NULL,
    -- 'pdf' | 'docx' | 'pptx' | 'txt' | 'md' | 'url' | 'conversation'

    display_name        VARCHAR(500) NOT NULL,
    -- Filename or URL — shown to the tenant in the sources list.

    -- Google Drive linkage (null for URL / conversation sources).
    gdrive_file_id      VARCHAR(200),
    gdrive_modified_at  TIMESTAMPTZ,
    -- modifiedTime from the Drive API. Used by the change-detection poller
    -- to decide whether to re-ingest a file.

    url                 VARCHAR(2000),
    -- null for file sources.

    status              VARCHAR(20)  NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'processing', 'complete', 'error')),

    raw_text            TEXT,
    -- Extracted plain text, kept so a re-run of the extraction pipeline
    -- doesn't need to re-parse the original file.

    chunk_count         INTEGER      NOT NULL DEFAULT 0,
    node_count          INTEGER      NOT NULL DEFAULT 0,
    error_msg           TEXT,

    source_run_id       BIGINT       REFERENCES gt_agent_runs(id) ON DELETE SET NULL,
    -- BIGINT to match gt_agent_runs.id (BIGSERIAL).

    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  gt_kb_sources                     IS 'Source registry. One row per ingested document, URL, or conversation. ingestion-skill processes pending rows.';
COMMENT ON COLUMN gt_kb_sources.source_type         IS 'pdf | docx | pptx | txt | md | url | conversation';
COMMENT ON COLUMN gt_kb_sources.gdrive_modified_at  IS 'Drive API modifiedTime. Used for change detection on the next folder poll.';
COMMENT ON COLUMN gt_kb_sources.raw_text            IS 'Cached extracted text — avoids re-parsing the original file on re-ingestion.';

CREATE INDEX IF NOT EXISTS idx_gt_kb_sources_tenant_status
    ON gt_kb_sources (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gt_kb_sources_tenant_gdrive_file
    ON gt_kb_sources (tenant_id, gdrive_file_id)
    WHERE gdrive_file_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gt_kb_sources_source_run
    ON gt_kb_sources (source_run_id)
    WHERE source_run_id IS NOT NULL;


-- ────────────────────────────────────────────────────────────────────────────
-- RLS (every tenant-scoped table)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE gt_tenant_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE gt_kb_sources          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gt_tenant_integrations_tenant_isolation ON gt_tenant_integrations;
DROP POLICY IF EXISTS gt_kb_sources_tenant_isolation          ON gt_kb_sources;

CREATE POLICY gt_tenant_integrations_tenant_isolation ON gt_tenant_integrations
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY gt_kb_sources_tenant_isolation ON gt_kb_sources
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);


-- ────────────────────────────────────────────────────────────────────────────
-- updated_at triggers (vn_set_updated_at is defined in 001_vn_foundation.sql)
-- ────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_gt_tenant_integrations_updated_at ON gt_tenant_integrations;
CREATE TRIGGER trg_gt_tenant_integrations_updated_at
    BEFORE UPDATE ON gt_tenant_integrations
    FOR EACH ROW EXECUTE FUNCTION vn_set_updated_at();

DROP TRIGGER IF EXISTS trg_gt_kb_sources_updated_at ON gt_kb_sources;
CREATE TRIGGER trg_gt_kb_sources_updated_at
    BEFORE UPDATE ON gt_kb_sources
    FOR EACH ROW EXECUTE FUNCTION vn_set_updated_at();
