-- ============================================================
-- Migration: 223_gt_cadence_governor.sql
-- Purpose:   The cadence governor — nobody gets touched twice in a week
--            because two opportunities each thought they were the only one.
--
-- Design: documents/ux-references/candidates/EVALUATION.md §"the cadence
--         governor". Both candidate designs surfaced this and neither the
--         journey design nor the Agents Spec had it.
--
-- ── WHY THIS IS THE FIRST THING BUILT ─────────────────────────────────
--
-- It is opportunity-AGNOSTIC. The governor arbitrates on the CONTACT, so it
-- works today, before gt_journeys grows its opportunity axis, and it keeps
-- working after. Everything downstream — ghosts, veto windows, the runway's
-- committed horizon — assumes something is already arbitrating. This is it.
--
-- ── WHY RESERVATIONS AND NOT JUST A COUNT OF gt_touch_log ─────────────
--
-- gt_touch_log records what HAPPENED. A governor that only reads history
-- can tell you afterwards that you over-touched somebody, which is useless.
-- Arbitration has to be prospective: a planned touch claims a slot, and the
-- claim is what the next planner collides with.
--
-- Sent touches and held reservations BOTH consume the window. Counting only
-- reservations would let a manual send slip past the cap; counting only
-- sends would let two agents both schedule into the same empty week.
--
-- ── WHY gt_touch_log GAINS contact_id ─────────────────────────────────
--
-- Fatigue belongs to a person, not a company. The log recorded prospect_id
-- only, so "how many times have we written to R. Menon this week" was
-- literally unanswerable. Nullable, because every existing row predates the
-- question and backfilling a guess would be worse than admitting the gap.
--
-- ── WHY THE WINDOW IS ROLLING ─────────────────────────────────────────
--
-- A calendar week permits Fri, Fri, Mon, Mon — four touches in four days,
-- every one of them "two per week". A rolling window is what a human means
-- and the only one that actually protects the recipient.
-- ============================================================

DO $$
DECLARE missing TEXT;
BEGIN
    SELECT string_agg(t, ', ') INTO missing
    FROM   unnest(ARRAY['vn_tenants', 'gt_contacts', 'gt_prospects', 'gt_touch_log']) AS t
    WHERE  to_regclass('public.' || t) IS NULL;

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'Missing prerequisite table(s): %', missing;
    END IF;
END $$;


-- ────────────────────────────────────────────────────────────────────────
-- 1. gt_touch_log.contact_id — WHICH PERSON was touched
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE gt_touch_log
    ADD COLUMN IF NOT EXISTS contact_id BIGINT;

DO $$ BEGIN
    ALTER TABLE gt_touch_log
        ADD CONSTRAINT gt_touch_log_contact_fk
        FOREIGN KEY (contact_id) REFERENCES gt_contacts(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_gt_touch_log_contact
    ON gt_touch_log(tenant_id, is_live, contact_id, touched_at DESC)
    WHERE contact_id IS NOT NULL;

COMMENT ON COLUMN gt_touch_log.contact_id IS
    'WHO was touched. Fatigue is a person''s, not a company''s. Nullable: rows logged before migration 223 never recorded it, and a guessed backfill would be worse than an admitted gap.';


-- ────────────────────────────────────────────────────────────────────────
-- 2. gt_cadence_policy — the rule, as data
--
-- Per tenant, per environment, optionally per channel. A NULL channel is
-- the default that applies where no channel-specific row exists, so a
-- tenant who wants "2 emails but 1 WhatsApp" writes two rows and a tenant
-- who does not care writes one.
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_cadence_policy (
    id            BIGSERIAL   PRIMARY KEY,
    tenant_id     UUID        NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    is_live       BOOLEAN     NOT NULL DEFAULT false,

    -- 'contact' is the fatigue that matters. 'account' is the optional
    -- second cap — don't hit five people at one company in a week either.
    scope         VARCHAR(10) NOT NULL DEFAULT 'contact',

    -- NULL = applies to every channel not named by a more specific row.
    channel       VARCHAR(20),

    max_touches   SMALLINT    NOT NULL DEFAULT 2,
    window_days   SMALLINT    NOT NULL DEFAULT 7,

    -- Days of week that are silent. 0 = Sunday … 6 = Saturday.
    quiet_dows    SMALLINT[]  NOT NULL DEFAULT '{0,6}',

    -- The silent band inside a day, in `timezone`. May wrap midnight
    -- (from 19:00 to 09:00 is a normal evening-through-morning rule).
    quiet_from    TIME,
    quiet_to      TIME,

    -- Carried on the POLICY rather than the tenant. Tenant timezone
    -- preferences are deferred (CLAUDE.md) and this is a scheduling rule,
    -- not a display one — it must not wait on that work.
    timezone      TEXT        NOT NULL DEFAULT 'Asia/Kolkata',

    is_active     BOOLEAN     NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_gt_cadence_scope CHECK (scope IN ('contact', 'account')),
    CONSTRAINT chk_gt_cadence_max   CHECK (max_touches BETWEEN 1 AND 50),
    CONSTRAINT chk_gt_cadence_win   CHECK (window_days BETWEEN 1 AND 90),
    -- Both or neither. A band with one end is not a band, and silently
    -- ignoring the half that was set would be the quietest possible way to
    -- send at 3am.
    CONSTRAINT chk_gt_cadence_quiet CHECK ((quiet_from IS NULL) = (quiet_to IS NULL))
);

-- Two partial indexes rather than one constraint: in SQL, NULL != NULL, so
-- a plain UNIQUE over (…, channel) would happily admit ten default rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_gt_cadence_policy_channel
    ON gt_cadence_policy(tenant_id, is_live, scope, channel) WHERE channel IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_gt_cadence_policy_default
    ON gt_cadence_policy(tenant_id, is_live, scope) WHERE channel IS NULL;


-- ────────────────────────────────────────────────────────────────────────
-- 3. gt_touch_reservations — a claim on a person's attention
--
-- Keyed on the CONTACT and deliberately not on the opportunity. That is
-- the whole mechanism: an opportunity cannot opt out of the queue by
-- being a different opportunity.
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_touch_reservations (
    id             BIGSERIAL   PRIMARY KEY,
    tenant_id      UUID        NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    is_live        BOOLEAN     NOT NULL DEFAULT false,

    contact_id     BIGINT      NOT NULL REFERENCES gt_contacts(id) ON DELETE CASCADE,
    prospect_id    BIGINT      REFERENCES gt_prospects(id) ON DELETE CASCADE,
    -- Which opportunity claimed the slot. Nullable today because journeys
    -- are still one-per-prospect; it becomes the opportunity reference when
    -- that axis lands, with no change to the arbitration.
    journey_id     BIGINT,

    channel        VARCHAR(20) NOT NULL,

    -- What was asked for, and what was granted. Keeping BOTH is what makes
    -- "moved +2d by the governor" a fact on the record rather than a label
    -- somebody typed. Rule 12: the move is never silent.
    requested_at   TIMESTAMPTZ NOT NULL,
    scheduled_at   TIMESTAMPTZ NOT NULL,
    moved_reason   TEXT,

    status         VARCHAR(12) NOT NULL DEFAULT 'held',
    note           TEXT,
    touch_id       BIGINT      REFERENCES gt_touch_log(id) ON DELETE SET NULL,

    created_by     UUID,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_gt_resv_status CHECK (
        status IN ('held', 'sent', 'cancelled', 'expired')),
    CONSTRAINT chk_gt_resv_channel CHECK (
        channel IN ('email', 'phone', 'linkedin', 'whatsapp', 'other')),
    -- A move without a reason is exactly the silent fallback this table
    -- exists to prevent.
    CONSTRAINT chk_gt_resv_moved CHECK (
        scheduled_at = requested_at OR moved_reason IS NOT NULL)
);

-- The hot path: "what is already claimed on this person around this time".
CREATE INDEX IF NOT EXISTS idx_gt_resv_contact_window
    ON gt_touch_reservations(tenant_id, is_live, contact_id, scheduled_at)
    WHERE status = 'held';
CREATE INDEX IF NOT EXISTS idx_gt_resv_prospect
    ON gt_touch_reservations(prospect_id, scheduled_at DESC);


-- ────────────────────────────────────────────────────────────────────────
-- 4. Seed the default policy for every existing tenant
--
-- Two per contact per rolling week, quiet at weekends. Deliberately a real
-- default rather than "unlimited until configured": a governor that starts
-- switched off protects nobody, and the first thing it would fail to stop
-- is the first double-send.
-- ────────────────────────────────────────────────────────────────────────

INSERT INTO gt_cadence_policy (tenant_id, is_live, scope, channel, max_touches, window_days, quiet_dows, quiet_from, quiet_to)
SELECT t.id, l.is_live, 'contact', NULL, 2, 7, '{0,6}'::smallint[], '19:00'::time, '09:00'::time
FROM   vn_tenants t
CROSS  JOIN (VALUES (true), (false)) AS l(is_live)
ON CONFLICT DO NOTHING;


-- ────────────────────────────────────────────────────────────────────────
-- RLS + updated_at
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE gt_cadence_policy      ENABLE ROW LEVEL SECURITY;
ALTER TABLE gt_touch_reservations  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY gt_cadence_policy_tenant_isolation ON gt_cadence_policy
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY gt_touch_reservations_tenant_isolation ON gt_touch_reservations
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    IF to_regprocedure('public.update_updated_at()') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS trg_gt_cadence_policy_updated_at ON gt_cadence_policy;
        CREATE TRIGGER trg_gt_cadence_policy_updated_at BEFORE UPDATE ON gt_cadence_policy
            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
        DROP TRIGGER IF EXISTS trg_gt_resv_updated_at ON gt_touch_reservations;
        CREATE TRIGGER trg_gt_resv_updated_at BEFORE UPDATE ON gt_touch_reservations
            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    ELSE
        RAISE NOTICE '[223] update_updated_at() absent — updated_at set in application code.';
    END IF;
END $$;

COMMENT ON TABLE gt_cadence_policy IS
    'How often one person may be touched, as data. Rolling window, not calendar: a calendar week permits Fri/Fri/Mon/Mon.';
COMMENT ON TABLE gt_touch_reservations IS
    'A prospective claim on a person''s attention. Keyed on the contact and NOT the opportunity — that is the mechanism: an opportunity cannot skip the queue by being a different opportunity.';
COMMENT ON COLUMN gt_touch_reservations.requested_at IS
    'What was asked for. Kept beside scheduled_at so "moved +2d by the governor" is a fact on the record, not a label.';

-- ── Post-apply verification ─────────────────────────────────────────────
-- SELECT tenant_id, is_live, max_touches, window_days, quiet_dows FROM gt_cadence_policy;
-- SELECT count(*) FROM gt_touch_reservations WHERE scheduled_at <> requested_at AND moved_reason IS NULL;  -- 0
