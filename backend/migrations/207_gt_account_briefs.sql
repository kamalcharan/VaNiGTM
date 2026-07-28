-- ============================================================
-- Migration: 207_gt_account_briefs.sql
-- Purpose:   What we know about ONE prospect company, and which offer (if
--            any) fits it.
--
-- Plan: documents/POA-manufacturing-pilot.md, Step 2.
--
-- ── WHY THIS TABLE EXISTS ─────────────────────────────────────────────
--
-- The pilot tests one claim: researched outreach earns replies where a mail
-- merge does not. The brief IS the research — what they make, how big they
-- are, what they are certified for, who to talk to, and the ONE specific
-- observation that earns a reply. Everything downstream reads this row.
--
-- ── EVERY CLAIM CARRIES EVIDENCE ──────────────────────────────────────
--
-- raw_evidence holds {claim, url, excerpt} for each assertion. A first touch
-- that invents a detail is worse than no touch — it is the one mistake that
-- cannot be walked back. A site that cannot be read produces
-- status='unreadable' with the real reason in `error`, NEVER a guessed brief
-- (CLAUDE.md rule 12).
--
-- ── ENVIRONMENT AND TENANT ────────────────────────────────────────────
--
-- is_live mirrors gt_prospects: a sandbox brief must never be read by a live
-- run. One brief per prospect per environment; re-running research replaces
-- it, because a brief is current knowledge, not an audit log. The run that
-- produced it is kept in run_id, and gt_agent_runs.steps holds the trail.
-- ============================================================

DO $$
DECLARE missing TEXT;
BEGIN
    SELECT string_agg(t, ', ') INTO missing
    FROM   unnest(ARRAY['gt_prospects', 'vn_tenants']) AS t
    WHERE  to_regclass('public.' || t) IS NULL;

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION
            'Missing prerequisite table(s): %. gt_prospects comes from migration 196 — it must really exist, not merely be recorded as applied in vn_migrations.', missing;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS gt_account_briefs (
    id                  BIGSERIAL    PRIMARY KEY,
    tenant_id           UUID         NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    is_live             BOOLEAN      NOT NULL DEFAULT false,
    prospect_id         BIGINT       NOT NULL REFERENCES gt_prospects(id) ON DELETE CASCADE,

    -- Provenance of the research itself
    run_id              BIGINT,
    domain              VARCHAR(255),
    fetched_at          TIMESTAMPTZ,
    pages_read          SMALLINT     NOT NULL DEFAULT 0,
    -- The static-page crawlability summary IngestionAgent.fetchUrlText
    -- already returns. Doubles as the first line of a site audit later.
    site_health         TEXT,

    -- The brief. Deliberately separate fields rather than one blob: a human
    -- reviewing 100 of these scans columns, and a message is written from
    -- specific facts, not from a paragraph.
    what_they_make      TEXT,
    scale_signals       TEXT,
    service_signals     TEXT,
    digital_maturity    TEXT,
    named_contacts      JSONB        NOT NULL DEFAULT '[]'::jsonb,

    -- Fit. `fit` holds {offer_id: {score, reason}} for EVERY offer, not just
    -- the winner — a reviewer needs to see what was rejected and why.
    fit                 JSONB        NOT NULL DEFAULT '{}'::jsonb,
    recommended_offer   VARCHAR(60),
    fit_reason          TEXT,

    -- The one specific, verifiable observation the first touch opens with.
    hook                TEXT,

    -- {claim, url, excerpt} per assertion. No claim without a source.
    raw_evidence        JSONB        NOT NULL DEFAULT '[]'::jsonb,

    -- Why a brief could not be produced. Populated ONLY for 'unreadable'.
    error               TEXT,

    status              VARCHAR(20)  NOT NULL DEFAULT 'drafted',
    decided_by          UUID,
    decided_at          TIMESTAMPTZ,
    -- Why a human said no. "No fit" is a first-class result, and the reasons
    -- are what tell us whether the segment or the offer was wrong.
    decision_note       TEXT,

    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $$ BEGIN
    ALTER TABLE gt_account_briefs
        ADD CONSTRAINT gt_account_briefs_status_check
        CHECK (status IN ('drafted', 'unreadable', 'approved', 'rejected', 'no_contact'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A brief is current knowledge, not history: one per prospect per
-- environment, replaced on re-research.
CREATE UNIQUE INDEX IF NOT EXISTS uq_gt_account_briefs_prospect
    ON gt_account_briefs(tenant_id, is_live, prospect_id);

CREATE INDEX IF NOT EXISTS idx_gt_account_briefs_status
    ON gt_account_briefs(tenant_id, is_live, status);
CREATE INDEX IF NOT EXISTS idx_gt_account_briefs_offer
    ON gt_account_briefs(tenant_id, is_live, recommended_offer)
    WHERE recommended_offer IS NOT NULL;

ALTER TABLE gt_account_briefs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY gt_account_briefs_tenant_isolation ON gt_account_briefs
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column')
       AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gt_account_briefs_updated_at') THEN
        CREATE TRIGGER trg_gt_account_briefs_updated_at
            BEFORE UPDATE ON gt_account_briefs
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

COMMENT ON TABLE  gt_account_briefs IS 'Per-company research: what they make, how big, which offer fits, and the one observation a first touch opens with. Every claim carries evidence in raw_evidence.';
COMMENT ON COLUMN gt_account_briefs.fit IS 'Score and reason for EVERY offer, not only the winner — a reviewer needs to see what was rejected and why.';
COMMENT ON COLUMN gt_account_briefs.raw_evidence IS '{claim, url, excerpt} per assertion. A brief with a claim absent from here is a hallucination and must not be sent.';
COMMENT ON COLUMN gt_account_briefs.status IS 'drafted = agent produced it · unreadable = site could not be read, see error · approved/rejected/no_contact = a human decided.';
