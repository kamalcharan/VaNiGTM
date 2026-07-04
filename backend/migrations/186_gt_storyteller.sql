-- ============================================================================
-- Migration 186: Vikuna GTM — Storyteller (Phase 4 Stage 1)
--
-- The Storyteller agent turns an approved tenant profile (gt_tenant_profile)
-- into a validated 7-slide presentation deck, then serves it (and live Q&A)
-- via a shareable link.
--
--   gt_presentations — one row per generated deck (slides JSONB, share link)
--   gt_qa_log        — audience questions + answers during a presentation
--
-- Constraints carried forward from prior phases:
--   - gt_agent_runs.id is BIGSERIAL (from migration 162), so source_run_id
--     that references it is BIGINT, not UUID.
--   - Every tenant-scoped table: tenant_id UUID NOT NULL, FK vn_tenants(id)
--     ON DELETE CASCADE, RLS enabled (pattern from migration 184).
--   - vn_set_updated_at() is defined in 001_vn_foundation.sql.
--
-- Postgres 17.9 — partial unique index, CHECK, JSONB, RLS all supported.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: gt_presentations  (one generated deck per row)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_presentations (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID         NOT NULL
                   REFERENCES vn_tenants(id) ON DELETE CASCADE,
    source_run_id  BIGINT       REFERENCES gt_agent_runs(id),
    -- nullable: the build run that produced this deck (gt_agent_runs.id BIGINT)
    title          TEXT,
    slides         JSONB        NOT NULL,
    -- the validated slide array (title→problem→solution→icp→
    -- differentiators→traction→cta)
    status         VARCHAR(20)  NOT NULL DEFAULT 'awaiting'
                   CHECK (status IN ('awaiting', 'approved')),
    share_token    TEXT,
    -- null until approved; uniqueness enforced by partial index below
    approved_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  gt_presentations             IS 'Generated presentation decks. One row per build. slides holds the validated 7-slide array.';
COMMENT ON COLUMN gt_presentations.source_run_id IS 'gt_agent_runs.id (BIGINT) of the build run. Nullable — manual/imported decks have none.';
COMMENT ON COLUMN gt_presentations.status      IS 'awaiting (default, pending human approval) | approved (share_token issued).';
COMMENT ON COLUMN gt_presentations.share_token IS 'Public share token. Null until approved. Unique among non-null values.';

CREATE INDEX IF NOT EXISTS idx_gt_presentations_tenant
    ON gt_presentations (tenant_id);

-- Uniqueness only among issued tokens; many rows may have NULL share_token.
CREATE UNIQUE INDEX IF NOT EXISTS uq_gt_presentations_share_token
    ON gt_presentations (share_token)
    WHERE share_token IS NOT NULL;


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: gt_qa_log  (live audience Q&A during a presentation)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_qa_log (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID         NOT NULL
                    REFERENCES vn_tenants(id) ON DELETE CASCADE,
    presentation_id UUID         NOT NULL
                    REFERENCES gt_presentations(id) ON DELETE CASCADE,
    question        TEXT         NOT NULL,
    answer          TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE gt_qa_log IS 'Audience questions and VaNi answers during a presentation. Immutable — no updated_at.';

CREATE INDEX IF NOT EXISTS idx_gt_qa_log_presentation
    ON gt_qa_log (presentation_id);


-- ────────────────────────────────────────────────────────────────────────────
-- RLS  (pattern from migration 184)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE gt_presentations ENABLE ROW LEVEL SECURITY;
ALTER TABLE gt_qa_log        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gt_presentations_tenant_isolation ON gt_presentations;
DROP POLICY IF EXISTS gt_qa_log_tenant_isolation        ON gt_qa_log;

CREATE POLICY gt_presentations_tenant_isolation ON gt_presentations
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY gt_qa_log_tenant_isolation ON gt_qa_log
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);


-- ────────────────────────────────────────────────────────────────────────────
-- Updated-at trigger — gt_presentations only.
-- gt_qa_log rows are immutable; no update trigger.
-- (vn_set_updated_at() is defined in 001_vn_foundation.sql)
-- ────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_gt_presentations_updated_at ON gt_presentations;
CREATE TRIGGER trg_gt_presentations_updated_at
    BEFORE UPDATE ON gt_presentations
    FOR EACH ROW EXECUTE FUNCTION vn_set_updated_at();
