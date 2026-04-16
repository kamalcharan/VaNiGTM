-- ============================================================================
-- Migration 059: Pulse Session Schema
--
-- Implements the structured client meeting workflow from the Pulses PRD:
--
--   ki_pulse_config               — per-client recurring pulse configuration
--   ki_pulse_sessions             — individual meeting instances
--   ki_pulse_session_actions      — actions raised during meetings
--   ki_pulse_session_gaps         — financial gaps tracked per session
--   ki_pulse_session_observations — VaNi pre-meeting observations
--
-- The existing ki_pulses table (follow-up / task system) is RETAINED as-is.
-- These five tables implement the structured meeting workflow:
--   Pulse Queue → Setup → Prep → In Meeting → Post Meeting → History
--
-- Session lifecycle:
--   scheduled → prep_ready (VaNi brief generated 48h before)
--             → in_progress (MFD starts meeting)
--             → completed  (notes saved, summary confirmed)
--             → missed     (auto-flagged if >3 days past scheduled_at)
--             → cancelled
--
-- All tables: tenant-scoped, environment-isolated (is_live), RLS enabled.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: ki_pulse_config
-- One active config per client per environment. Defines the recurring schedule.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_pulse_config (
    id                  BIGSERIAL   PRIMARY KEY,
    tenant_id           UUID        NOT NULL,
    is_live             BOOLEAN     NOT NULL DEFAULT false,

    client_id           INTEGER     NOT NULL REFERENCES ki_clients(id)  ON DELETE CASCADE,
    contact_id          BIGINT                REFERENCES ki_contacts(id) ON DELETE SET NULL,

    frequency           TEXT        NOT NULL DEFAULT 'monthly'
                            CHECK (frequency IN ('monthly','bimonthly','quarterly','custom')),
    custom_days         INT         CHECK (custom_days > 0 AND custom_days <= 365),

    template            TEXT        NOT NULL DEFAULT 'full_review'
                            CHECK (template IN ('full_review','quick_checkin','annual_review','gap_followup')),

    medium              TEXT        NOT NULL DEFAULT 'phone'
                            CHECK (medium IN ('phone','google_meet','in_person','whatsapp')),

    preferred_day       TEXT        CHECK (preferred_day IN
                            ('monday','tuesday','wednesday','thursday','friday')),
    preferred_time      TEXT        CHECK (preferred_time IN ('morning','afternoon','evening')),

    jtd_auto_schedule   BOOLEAN     NOT NULL DEFAULT true,
    vani_auto_brief     BOOLEAN     NOT NULL DEFAULT true,
    vani_include_gaps   BOOLEAN     NOT NULL DEFAULT true,
    client_reminder     BOOLEAN     NOT NULL DEFAULT false,

    assigned_to         TEXT,                   -- soft ref to vn_users.id
    is_active           BOOLEAN     NOT NULL DEFAULT true,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          TEXT                    -- soft ref to vn_users.id
);

COMMENT ON TABLE ki_pulse_config IS
    'Per-client recurring pulse configuration. One active config per client per environment.';
COMMENT ON COLUMN ki_pulse_config.custom_days IS
    'Used when frequency=custom. Number of days between pulses (1–365).';
COMMENT ON COLUMN ki_pulse_config.jtd_auto_schedule IS
    'When true, JTD creates the next appointment automatically on session close.';
COMMENT ON COLUMN ki_pulse_config.vani_auto_brief IS
    'When true, VaNi generates the pre-meeting brief 48h before scheduled_at.';

-- One active config per client per environment
CREATE UNIQUE INDEX IF NOT EXISTS uq_ki_pulse_config_active_client
    ON ki_pulse_config (tenant_id, client_id, is_live)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_ki_pulse_config_tenant
    ON ki_pulse_config (tenant_id, is_live, is_active);
CREATE INDEX IF NOT EXISTS idx_ki_pulse_config_client
    ON ki_pulse_config (tenant_id, client_id, is_live);


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: ki_pulse_sessions
-- One row per actual meeting instance.
-- config_id is nullable to support ad-hoc (one-off) sessions without a config.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_pulse_sessions (
    id                  BIGSERIAL   PRIMARY KEY,
    tenant_id           UUID        NOT NULL,
    is_live             BOOLEAN     NOT NULL DEFAULT false,

    config_id           BIGINT      REFERENCES ki_pulse_config(id) ON DELETE SET NULL,
    client_id           INTEGER     NOT NULL REFERENCES ki_clients(id)  ON DELETE CASCADE,
    contact_id          BIGINT               REFERENCES ki_contacts(id) ON DELETE SET NULL,

    scheduled_at        TIMESTAMPTZ NOT NULL,
    started_at          TIMESTAMPTZ,
    ended_at            TIMESTAMPTZ,
    duration_minutes    INT         CHECK (duration_minutes > 0),

    status              TEXT        NOT NULL DEFAULT 'scheduled'
                            CHECK (status IN
                                ('scheduled','prep_ready','in_progress',
                                 'completed','missed','cancelled')),

    template            TEXT        NOT NULL DEFAULT 'full_review'
                            CHECK (template IN ('full_review','quick_checkin','annual_review','gap_followup')),

    medium              TEXT        NOT NULL DEFAULT 'phone'
                            CHECK (medium IN ('phone','google_meet','in_person','whatsapp')),

    jtd_appointment_id  TEXT,                   -- external JTD appointment reference

    meeting_notes       TEXT,                   -- freeform notes captured during meeting
    vani_brief          TEXT,                   -- VaNi pre-meeting brief (generated 48h before)
    vani_summary        TEXT,                   -- VaNi post-meeting structured summary
    summary_confirmed   BOOLEAN     NOT NULL DEFAULT false,
    report_generated    BOOLEAN     NOT NULL DEFAULT false,

    -- self-reference: set when this session is closed and the next is scheduled
    next_session_id     BIGINT      REFERENCES ki_pulse_sessions(id) ON DELETE SET NULL,

    assigned_to         TEXT,                   -- soft ref to vn_users.id
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ki_pulse_sessions IS
    'Individual pulse meeting instances. Full lifecycle from scheduling through post-meeting close.';
COMMENT ON COLUMN ki_pulse_sessions.config_id IS
    'NULL for ad-hoc sessions. Set for recurring sessions created by ki_pulse_config.';
COMMENT ON COLUMN ki_pulse_sessions.vani_brief IS
    'VaNi-generated pre-meeting brief. Includes snapshot delta, gaps, suggested agenda.';
COMMENT ON COLUMN ki_pulse_sessions.vani_summary IS
    'VaNi-structured post-meeting summary. MFD confirms before it appears in client report.';
COMMENT ON COLUMN ki_pulse_sessions.next_session_id IS
    'Populated on session close. Links to the auto-scheduled next session.';

CREATE INDEX IF NOT EXISTS idx_ki_pulse_sessions_tenant_status
    ON ki_pulse_sessions (tenant_id, is_live, status);
CREATE INDEX IF NOT EXISTS idx_ki_pulse_sessions_client
    ON ki_pulse_sessions (tenant_id, client_id, is_live, scheduled_at DESC);
-- Partial index for the queue view (only active sessions need fast lookup)
CREATE INDEX IF NOT EXISTS idx_ki_pulse_sessions_queue
    ON ki_pulse_sessions (tenant_id, is_live, scheduled_at)
    WHERE status IN ('scheduled','prep_ready','in_progress');


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: ki_pulse_session_actions
-- Actions raised during a meeting: by MFD, by client, or auto (JTD).
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_pulse_session_actions (
    id                  BIGSERIAL   PRIMARY KEY,
    tenant_id           UUID        NOT NULL,

    session_id          BIGINT      NOT NULL REFERENCES ki_pulse_sessions(id) ON DELETE CASCADE,
    client_id           INTEGER     NOT NULL,   -- denormalized for cross-session queries

    text                TEXT        NOT NULL,
    owner_type          TEXT        NOT NULL DEFAULT 'mfd'
                            CHECK (owner_type IN ('mfd','client','auto')),
    due_date            DATE,

    status              TEXT        NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open','done','cancelled')),
    completed_at        TIMESTAMPTZ,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ki_pulse_session_actions IS
    'Actions raised during a pulse meeting. owner_type: mfd (advisor), client, or auto (JTD-generated).';

CREATE INDEX IF NOT EXISTS idx_ki_pulse_actions_session
    ON ki_pulse_session_actions (tenant_id, session_id);
CREATE INDEX IF NOT EXISTS idx_ki_pulse_actions_client_open
    ON ki_pulse_session_actions (tenant_id, client_id, status)
    WHERE status = 'open';


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: ki_pulse_session_gaps
-- Financial gaps identified per session by VaNi, tracked across sessions.
-- Status 'carried' means the gap was not addressed and moves to the next session.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_pulse_session_gaps (
    id                  BIGSERIAL   PRIMARY KEY,
    tenant_id           UUID        NOT NULL,

    session_id          BIGINT      NOT NULL REFERENCES ki_pulse_sessions(id) ON DELETE CASCADE,
    client_id           INTEGER     NOT NULL,   -- denormalized

    gap_type            TEXT        NOT NULL,
    -- e.g. term_cover, health_cover, emergency_fund, goal_deviation,
    --      sip_at_risk, high_concentration, illiquidity, emi_ratio

    description         TEXT        NOT NULL,
    severity            TEXT        NOT NULL DEFAULT 'medium'
                            CHECK (severity IN ('critical','high','medium','low')),

    status              TEXT        NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open','in_progress','addressed','carried')),

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ki_pulse_session_gaps IS
    'Financial gaps tracked per session. Carried gaps are copied to the next session on close.';
COMMENT ON COLUMN ki_pulse_session_gaps.gap_type IS
    'Standardized gap category: term_cover, health_cover, emergency_fund, goal_deviation, etc.';

CREATE INDEX IF NOT EXISTS idx_ki_pulse_gaps_session
    ON ki_pulse_session_gaps (tenant_id, session_id);
CREATE INDEX IF NOT EXISTS idx_ki_pulse_gaps_client
    ON ki_pulse_session_gaps (tenant_id, client_id, status);


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: ki_pulse_session_observations
-- VaNi-generated observations for the pre-meeting brief.
-- MFD confirms, adds context, or dismisses each before the meeting starts.
-- Only confirmed (and not dismissed) observations appear in the client report.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_pulse_session_observations (
    id                  BIGSERIAL   PRIMARY KEY,
    tenant_id           UUID        NOT NULL,

    session_id          BIGINT      NOT NULL REFERENCES ki_pulse_sessions(id) ON DELETE CASCADE,

    text                TEXT        NOT NULL,
    category            TEXT
                            CHECK (category IN
                                ('snapshot_delta','protection_gap',
                                 'goal_probability','risk_flag','other')),

    confirmed           BOOLEAN     NOT NULL DEFAULT false,
    dismissed           BOOLEAN     NOT NULL DEFAULT false,
    mfd_context         TEXT,                   -- additional context added by MFD

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ki_pulse_session_observations IS
    'VaNi pre-meeting observations. Only confirmed (not dismissed) ones appear in client report.';
COMMENT ON COLUMN ki_pulse_session_observations.mfd_context IS
    'MFD-added context that is stamped alongside the VaNi observation in the report.';

CREATE INDEX IF NOT EXISTS idx_ki_pulse_observations_session
    ON ki_pulse_session_observations (tenant_id, session_id);


-- ────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE ki_pulse_config               ENABLE ROW LEVEL SECURITY;
ALTER TABLE ki_pulse_sessions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ki_pulse_session_actions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ki_pulse_session_gaps         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ki_pulse_session_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY ki_pulse_config_tenant_isolation
    ON ki_pulse_config
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY ki_pulse_sessions_tenant_isolation
    ON ki_pulse_sessions
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY ki_pulse_session_actions_tenant_isolation
    ON ki_pulse_session_actions
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY ki_pulse_session_gaps_tenant_isolation
    ON ki_pulse_session_gaps
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY ki_pulse_session_observations_tenant_isolation
    ON ki_pulse_session_observations
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
