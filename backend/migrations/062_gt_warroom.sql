-- ============================================================================
-- Migration 062: GT War Room — Agent Runs, Campaign Metrics, Activity Feed
--
-- Creates the operational visibility layer for the GTM engine:
--
--   gt_agent_runs         — execution logs for AI agents (orchestrator, outreach,
--                           prospecting, conversion, aeo, feedback)
--   gt_campaign_metrics   — periodic snapshots of campaign KPIs
--   gt_activity_feed      — real-time event stream (emails sent, replies, visits, etc.)
--
-- Design:
--   - Agent runs track autonomous agent decisions with inputs, outputs, status
--   - Campaign metrics are time-series snapshots (hourly/daily) for trend charts
--   - Activity feed is an append-only event stream for the war room live view
--   - All tables are tenant-scoped with RLS
--
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: gt_agent_runs (tenant-scoped)
-- Tracks each autonomous agent execution with decision context.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_agent_runs (
    id              BIGSERIAL   PRIMARY KEY,
    tenant_id       UUID        NOT NULL,
    is_live         BOOLEAN     NOT NULL DEFAULT false,

    -- Agent identity
    agent_type      VARCHAR(30) NOT NULL CHECK (
        agent_type IN ('orchestrator', 'outreach', 'prospecting', 'conversion', 'aeo', 'feedback')
    ),
    agent_name      VARCHAR(100) NOT NULL,

    -- Execution context
    campaign_id     BIGINT      REFERENCES gt_campaigns(id) ON DELETE SET NULL,
    sequence_id     BIGINT      REFERENCES gt_sequences(id) ON DELETE SET NULL,

    -- What the agent did
    action          TEXT        NOT NULL,
    -- e.g. "Sent email to 12 contacts", "Scored 8 prospects", "Paused sequence — low open rate"

    -- Decision detail (structured)
    inputs          JSONB       DEFAULT '{}'::jsonb,
    -- What the agent saw: { contacts_evaluated: 50, threshold: 0.7, ... }
    outputs         JSONB       DEFAULT '{}'::jsonb,
    -- What the agent produced: { emails_sent: 12, stage_changes: 3, ... }

    -- Outcome
    status          VARCHAR(20) NOT NULL DEFAULT 'success' CHECK (
        status IN ('success', 'partial', 'error', 'skipped')
    ),
    error_message   TEXT,

    -- Duration
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    duration_ms     INTEGER,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  gt_agent_runs             IS 'Agent execution log. Each row = one autonomous agent decision cycle.';
COMMENT ON COLUMN gt_agent_runs.agent_type  IS 'orchestrator, outreach, prospecting, conversion, aeo, feedback.';
COMMENT ON COLUMN gt_agent_runs.inputs      IS 'Structured input context the agent evaluated.';
COMMENT ON COLUMN gt_agent_runs.outputs     IS 'Structured output/results of the agent action.';

CREATE INDEX IF NOT EXISTS idx_gt_agent_runs_tenant
    ON gt_agent_runs(tenant_id, is_live, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gt_agent_runs_campaign
    ON gt_agent_runs(campaign_id, created_at DESC)
    WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gt_agent_runs_type_status
    ON gt_agent_runs(tenant_id, is_live, agent_type, status);


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: gt_campaign_metrics (tenant-scoped)
-- Periodic KPI snapshots for trend analysis.
-- One row per campaign per period (hourly or daily granularity).
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_campaign_metrics (
    id              BIGSERIAL   PRIMARY KEY,
    campaign_id     BIGINT      NOT NULL REFERENCES gt_campaigns(id) ON DELETE CASCADE,
    tenant_id       UUID        NOT NULL,
    is_live         BOOLEAN     NOT NULL DEFAULT false,

    -- Time bucket
    period          VARCHAR(10) NOT NULL DEFAULT 'daily' CHECK (
        period IN ('hourly', 'daily', 'weekly')
    ),
    period_start    TIMESTAMPTZ NOT NULL,

    -- Pipeline counts at this point in time
    total_contacts      INTEGER NOT NULL DEFAULT 0,
    stage_identified    INTEGER NOT NULL DEFAULT 0,
    stage_contacted     INTEGER NOT NULL DEFAULT 0,
    stage_engaged       INTEGER NOT NULL DEFAULT 0,
    stage_interested    INTEGER NOT NULL DEFAULT 0,
    stage_qualified     INTEGER NOT NULL DEFAULT 0,
    stage_converted     INTEGER NOT NULL DEFAULT 0,
    stage_lost          INTEGER NOT NULL DEFAULT 0,

    -- Outreach metrics (cumulative for the period)
    emails_sent         INTEGER NOT NULL DEFAULT 0,
    emails_opened       INTEGER NOT NULL DEFAULT 0,
    emails_replied      INTEGER NOT NULL DEFAULT 0,
    emails_clicked      INTEGER NOT NULL DEFAULT 0,
    whatsapp_sent       INTEGER NOT NULL DEFAULT 0,
    whatsapp_replied    INTEGER NOT NULL DEFAULT 0,
    linkedin_sent       INTEGER NOT NULL DEFAULT 0,
    linkedin_replied    INTEGER NOT NULL DEFAULT 0,

    -- Derived rates (computed on insert for fast reads)
    open_rate           NUMERIC(5,2) DEFAULT 0,
    reply_rate          NUMERIC(5,2) DEFAULT 0,
    click_rate          NUMERIC(5,2) DEFAULT 0,

    -- Meetings / conversions
    meetings_booked     INTEGER NOT NULL DEFAULT 0,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_gt_metrics_period UNIQUE (campaign_id, is_live, period, period_start)
);

COMMENT ON TABLE  gt_campaign_metrics            IS 'Time-series KPI snapshots per campaign. Powers analytics trend charts.';
COMMENT ON COLUMN gt_campaign_metrics.period      IS 'Granularity: hourly, daily, weekly.';
COMMENT ON COLUMN gt_campaign_metrics.period_start IS 'Start of the time bucket (truncated to hour/day/week).';

CREATE INDEX IF NOT EXISTS idx_gt_metrics_campaign_period
    ON gt_campaign_metrics(campaign_id, is_live, period, period_start DESC);

CREATE INDEX IF NOT EXISTS idx_gt_metrics_tenant
    ON gt_campaign_metrics(tenant_id, is_live, period_start DESC);


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: gt_activity_feed (tenant-scoped, append-only)
-- Real-time event stream for the war room live view.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_activity_feed (
    id              BIGSERIAL   PRIMARY KEY,
    tenant_id       UUID        NOT NULL,
    is_live         BOOLEAN     NOT NULL DEFAULT false,

    -- Event classification
    event_type      VARCHAR(30) NOT NULL CHECK (
        event_type IN (
            'email_sent', 'email_opened', 'email_replied', 'email_clicked', 'email_bounced',
            'whatsapp_sent', 'whatsapp_replied',
            'linkedin_sent', 'linkedin_replied', 'linkedin_visit',
            'stage_change', 'score_change',
            'agent_action', 'meeting_booked',
            'contact_assigned', 'sequence_started', 'sequence_completed'
        )
    ),

    -- Context references
    campaign_id     BIGINT      REFERENCES gt_campaigns(id) ON DELETE SET NULL,
    contact_id      BIGINT,     -- FK to ki_contacts (not enforced — cross-module)
    sequence_id     BIGINT      REFERENCES gt_sequences(id) ON DELETE SET NULL,
    agent_run_id    BIGINT      REFERENCES gt_agent_runs(id) ON DELETE SET NULL,

    -- Human-readable summary
    summary         TEXT        NOT NULL,
    -- e.g. "Email sent to Rahul Mehta", "LinkedIn visit from Acme Corp", "AEO score +2"

    -- Structured detail
    detail          JSONB       DEFAULT '{}'::jsonb,
    -- e.g. { contact_name: "Rahul", scheme: "cold-outreach-v1", step: 3 }

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  gt_activity_feed           IS 'Append-only event stream. Powers the war room live activity feed.';
COMMENT ON COLUMN gt_activity_feed.event_type IS 'Typed event for filtering and icon mapping in the UI.';

CREATE INDEX IF NOT EXISTS idx_gt_feed_tenant_time
    ON gt_activity_feed(tenant_id, is_live, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gt_feed_campaign
    ON gt_activity_feed(campaign_id, created_at DESC)
    WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gt_feed_type
    ON gt_activity_feed(tenant_id, is_live, event_type, created_at DESC);


-- ────────────────────────────────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE gt_agent_runs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE gt_campaign_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE gt_activity_feed    ENABLE ROW LEVEL SECURITY;

CREATE POLICY gt_agent_runs_tenant_isolation ON gt_agent_runs
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY gt_campaign_metrics_tenant_isolation ON gt_campaign_metrics
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY gt_activity_feed_tenant_isolation ON gt_activity_feed
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
