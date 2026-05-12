-- ============================================================================
-- Migration 061: GT Channels, Sequences & Contact Pipeline (Phase 2)
--
-- Creates the outreach infrastructure for GTM campaigns:
--
--   gt_channels                  — channel connections per tenant (email, whatsapp, linkedin)
--   gt_sequences                 — outreach sequence definitions per campaign
--   gt_sequence_steps            — ordered steps within a sequence
--   gt_step_templates            — message templates with A/B variants per step
--   gt_contact_assignments       — contacts assigned to campaigns with pipeline stage
--   gt_stage_log                 — audit trail of pipeline stage transitions
--
-- Design:
--   - Channels are tenant-scoped (not campaign-scoped) — reused across campaigns
--   - Sequences belong to a campaign, steps belong to a sequence
--   - Steps have types: email, whatsapp, linkedin, wait, condition
--   - Wait steps have a duration; condition steps have yes/no branches
--   - Contact assignments track pipeline stage per contact per campaign
--   - Stage log is append-only audit trail
--
-- Pipeline stages: identified → contacted → engaged → interested → qualified → converted
--
-- RLS: All tables are tenant-scoped.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: gt_channels (tenant-scoped — shared across campaigns)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_channels (
    id              BIGSERIAL   PRIMARY KEY,
    tenant_id       UUID        NOT NULL,
    is_live         BOOLEAN     NOT NULL DEFAULT false,
    is_active       BOOLEAN     NOT NULL DEFAULT true,

    channel_type    VARCHAR(20) NOT NULL CHECK (
        channel_type IN ('email', 'whatsapp', 'linkedin')
    ),
    name            VARCHAR(255) NOT NULL,

    -- Connection status
    status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (
        status IN ('connected', 'pending', 'disconnected', 'error')
    ),

    -- Channel-specific config (encrypted at rest in prod)
    config          JSONB       NOT NULL DEFAULT '{}'::jsonb,
    -- email:    { smtp_host, smtp_port, from_email, from_name, reply_to }
    -- whatsapp: { provider, api_key_ref, phone_number_id, business_account_id }
    -- linkedin: { access_token_ref, profile_url }

    -- Stats (updated by comms-skill on send/receive)
    total_sent      INTEGER     NOT NULL DEFAULT 0,
    total_replies   INTEGER     NOT NULL DEFAULT 0,

    -- Audit
    last_tested_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID,

    -- One channel type per tenant per environment (can have multiple email channels etc.)
    CONSTRAINT uq_gt_channel_name UNIQUE (tenant_id, is_live, channel_type, name)
);

COMMENT ON TABLE  gt_channels             IS 'Outreach channel connections. Shared across campaigns within a tenant.';
COMMENT ON COLUMN gt_channels.config      IS 'Channel-specific connection config. Sensitive fields reference secret store keys.';
COMMENT ON COLUMN gt_channels.status      IS 'Connection health: connected, pending, disconnected, error.';

CREATE INDEX IF NOT EXISTS idx_gt_channels_tenant_live
    ON gt_channels(tenant_id, is_live) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_gt_channels_type
    ON gt_channels(tenant_id, is_live, channel_type) WHERE is_active = true;


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: gt_sequences (tenant-scoped, belongs to campaign)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_sequences (
    id              BIGSERIAL   PRIMARY KEY,
    campaign_id     BIGINT      NOT NULL REFERENCES gt_campaigns(id) ON DELETE CASCADE,
    tenant_id       UUID        NOT NULL,
    is_live         BOOLEAN     NOT NULL DEFAULT false,
    is_active       BOOLEAN     NOT NULL DEFAULT true,

    name            VARCHAR(255) NOT NULL,
    description     TEXT,

    status          VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (
        status IN ('draft', 'live', 'paused', 'completed')
    ),

    -- Aggregate stats (updated by execution engine)
    contacts_count  INTEGER     NOT NULL DEFAULT 0,
    avg_open_rate   NUMERIC(5,2) DEFAULT 0,
    avg_reply_rate  NUMERIC(5,2) DEFAULT 0,

    -- Audit
    sort_order      INTEGER     NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID
);

COMMENT ON TABLE  gt_sequences           IS 'Multi-step outreach sequence definitions. Each campaign can have multiple sequences.';
COMMENT ON COLUMN gt_sequences.status    IS 'draft → live → paused → completed.';

CREATE INDEX IF NOT EXISTS idx_gt_sequences_campaign
    ON gt_sequences(campaign_id, is_live) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_gt_sequences_tenant
    ON gt_sequences(tenant_id, is_live) WHERE is_active = true;


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: gt_sequence_steps (tenant-scoped, belongs to sequence)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_sequence_steps (
    id              BIGSERIAL   PRIMARY KEY,
    sequence_id     BIGINT      NOT NULL REFERENCES gt_sequences(id) ON DELETE CASCADE,
    tenant_id       UUID        NOT NULL,
    is_live         BOOLEAN     NOT NULL DEFAULT false,

    -- Step definition
    step_type       VARCHAR(20) NOT NULL CHECK (
        step_type IN ('email', 'whatsapp', 'linkedin', 'wait', 'condition')
    ),
    title           VARCHAR(255) NOT NULL,
    description     TEXT,

    -- Timing
    day_offset      INTEGER     NOT NULL DEFAULT 0,
    -- Day offset from sequence start (Day 0, Day 1, Day 3, etc.)

    -- Wait step config
    wait_duration_hours INTEGER,
    -- Only for step_type = 'wait'. Duration in hours.

    -- Condition step config
    condition_type  VARCHAR(50),
    -- e.g. 'opened_email', 'clicked_link', 'replied', 'no_response'
    condition_yes_step_id BIGINT,
    -- FK to another step (set after creation). NULL = end sequence.
    condition_no_step_id  BIGINT,
    -- FK to another step (set after creation). NULL = end sequence.

    -- Channel reference (for email/whatsapp/linkedin steps)
    channel_id      BIGINT      REFERENCES gt_channels(id) ON DELETE SET NULL,

    -- Aggregate stats
    total_sent      INTEGER     NOT NULL DEFAULT 0,
    open_rate       NUMERIC(5,2) DEFAULT 0,
    reply_rate      NUMERIC(5,2) DEFAULT 0,

    -- Ordering
    sort_order      INTEGER     NOT NULL DEFAULT 0,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  gt_sequence_steps           IS 'Individual steps in an outreach sequence. Ordered by sort_order.';
COMMENT ON COLUMN gt_sequence_steps.step_type IS 'email, whatsapp, linkedin = message steps. wait = delay. condition = branch.';
COMMENT ON COLUMN gt_sequence_steps.day_offset IS 'Day offset from sequence start. Used for timeline display.';

CREATE INDEX IF NOT EXISTS idx_gt_steps_sequence
    ON gt_sequence_steps(sequence_id, is_live)
    WHERE sort_order >= 0;

CREATE INDEX IF NOT EXISTS idx_gt_steps_tenant
    ON gt_sequence_steps(tenant_id, is_live);


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: gt_step_templates (tenant-scoped, belongs to step)
-- Supports A/B variants per step.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_step_templates (
    id              BIGSERIAL   PRIMARY KEY,
    step_id         BIGINT      NOT NULL REFERENCES gt_sequence_steps(id) ON DELETE CASCADE,
    tenant_id       UUID        NOT NULL,
    is_live         BOOLEAN     NOT NULL DEFAULT false,

    variant_label   VARCHAR(10) NOT NULL DEFAULT 'A',
    -- A, B, C etc. for A/B testing

    subject         VARCHAR(500),
    -- Email subject line. NULL for whatsapp/linkedin.

    body            TEXT        NOT NULL,
    -- Message body. Supports {{first_name}}, {{company}} placeholders.

    -- Stats per variant
    total_sent      INTEGER     NOT NULL DEFAULT 0,
    open_rate       NUMERIC(5,2) DEFAULT 0,
    reply_rate      NUMERIC(5,2) DEFAULT 0,
    click_rate      NUMERIC(5,2) DEFAULT 0,

    is_active       BOOLEAN     NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_gt_template_variant UNIQUE (step_id, variant_label, is_live)
);

COMMENT ON TABLE  gt_step_templates            IS 'Message templates per step. Multiple variants for A/B testing.';
COMMENT ON COLUMN gt_step_templates.body       IS 'Message body with placeholder support: {{first_name}}, {{company}}, etc.';

CREATE INDEX IF NOT EXISTS idx_gt_templates_step
    ON gt_step_templates(step_id, is_live) WHERE is_active = true;


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: gt_contact_assignments (tenant-scoped)
-- Links contacts to campaigns with pipeline stage tracking.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_contact_assignments (
    id              BIGSERIAL   PRIMARY KEY,
    contact_id      BIGINT      NOT NULL REFERENCES ki_contacts(id) ON DELETE CASCADE,
    campaign_id     BIGINT      NOT NULL REFERENCES gt_campaigns(id) ON DELETE CASCADE,
    tenant_id       UUID        NOT NULL,
    is_live         BOOLEAN     NOT NULL DEFAULT false,

    -- Pipeline stage
    stage           VARCHAR(20) NOT NULL DEFAULT 'identified' CHECK (
        stage IN ('identified', 'contacted', 'engaged', 'interested', 'qualified', 'converted', 'lost')
    ),

    -- Sequence tracking
    sequence_id     BIGINT      REFERENCES gt_sequences(id) ON DELETE SET NULL,
    current_step_id BIGINT      REFERENCES gt_sequence_steps(id) ON DELETE SET NULL,

    -- Scoring
    score           INTEGER     NOT NULL DEFAULT 0,
    -- Composite score based on persona match, engagement, signals

    -- Timestamps
    first_contacted_at  TIMESTAMPTZ,
    last_activity_at    TIMESTAMPTZ,
    converted_at        TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_gt_contact_campaign UNIQUE (contact_id, campaign_id, is_live)
);

COMMENT ON TABLE  gt_contact_assignments       IS 'Contact-to-campaign assignments with pipeline stage tracking.';
COMMENT ON COLUMN gt_contact_assignments.stage IS 'Pipeline: identified → contacted → engaged → interested → qualified → converted | lost.';
COMMENT ON COLUMN gt_contact_assignments.score IS 'Engagement score. Higher = more qualified.';

CREATE INDEX IF NOT EXISTS idx_gt_assignments_campaign
    ON gt_contact_assignments(campaign_id, is_live, stage);

CREATE INDEX IF NOT EXISTS idx_gt_assignments_contact
    ON gt_contact_assignments(contact_id, is_live);

CREATE INDEX IF NOT EXISTS idx_gt_assignments_tenant
    ON gt_contact_assignments(tenant_id, is_live);

CREATE INDEX IF NOT EXISTS idx_gt_assignments_stage
    ON gt_contact_assignments(tenant_id, is_live, campaign_id, stage);


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: gt_stage_log (tenant-scoped, append-only audit trail)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_stage_log (
    id              BIGSERIAL   PRIMARY KEY,
    assignment_id   BIGINT      NOT NULL REFERENCES gt_contact_assignments(id) ON DELETE CASCADE,
    tenant_id       UUID        NOT NULL,
    is_live         BOOLEAN     NOT NULL DEFAULT false,

    from_stage      VARCHAR(20),
    to_stage        VARCHAR(20) NOT NULL,

    trigger_type    VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (
        trigger_type IN ('manual', 'auto', 'agent', 'import')
    ),
    trigger_detail  TEXT,
    -- e.g. "Replied to email step 3", "Agent: scoring threshold reached"

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID
);

COMMENT ON TABLE  gt_stage_log           IS 'Append-only audit trail of pipeline stage transitions.';
COMMENT ON COLUMN gt_stage_log.trigger_type IS 'What caused the transition: manual, auto (rule), agent (AI), import.';

CREATE INDEX IF NOT EXISTS idx_gt_stage_log_assignment
    ON gt_stage_log(assignment_id);

CREATE INDEX IF NOT EXISTS idx_gt_stage_log_tenant
    ON gt_stage_log(tenant_id, is_live);


-- ────────────────────────────────────────────────────────────────────────────
-- RLS: Enable on all tenant-scoped tables
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE gt_channels             ENABLE ROW LEVEL SECURITY;
ALTER TABLE gt_sequences            ENABLE ROW LEVEL SECURITY;
ALTER TABLE gt_sequence_steps       ENABLE ROW LEVEL SECURITY;
ALTER TABLE gt_step_templates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE gt_contact_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE gt_stage_log            ENABLE ROW LEVEL SECURITY;

CREATE POLICY gt_channels_tenant_isolation ON gt_channels
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY gt_sequences_tenant_isolation ON gt_sequences
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY gt_sequence_steps_tenant_isolation ON gt_sequence_steps
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY gt_step_templates_tenant_isolation ON gt_step_templates
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY gt_contact_assignments_tenant_isolation ON gt_contact_assignments
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY gt_stage_log_tenant_isolation ON gt_stage_log
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
