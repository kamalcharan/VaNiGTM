-- ============================================================
-- Migration: 222_gt_journeys.sql
-- Purpose:   The journey ledger — the durable record of one relationship
--            with one company.
--
-- Plan: documents/POA-journey-campaign.md Phase 1.
-- Design: documents/design-notes-journey-campaign.md §1.
--
-- ── WHY A LEDGER AND NOT A JOURNEY MAP ────────────────────────────────
--
-- A customer journey map is a template: awareness → consideration →
-- decision, drawn once per persona, describing what customers GENERALLY do.
-- This is the other thing — per account, actual state, actual history,
-- actual reasons, with a human ruling at each fork.
--
-- The difference is not vocabulary. A map makes the system's job INFERRING
-- which stage a customer is at, and inference is exactly where a silent
-- fallback creeps back in ("they opened it twice, they're probably in
-- consideration"). A ledger only ever records what happened and what a
-- human decided. The map is then a view over the ledger — a better map for
-- having been measured rather than drawn.
--
-- ── WHY PER COMPANY, NOT PER PERSON ───────────────────────────────────
--
-- The brief is per company. The offer is chosen per company. pilot_result
-- counts per company. People change jobs; the account is the stable unit.
-- Persons hang off the journey as threads (gt_journeys.contact_id and,
-- later, the stories addressed to them).
--
-- ── WHY arc SHIPS NOW WITH ONLY ONE ARC BUILT ─────────────────────────
--
-- Acquisition and LTV are both in scope, so 'won' is a DOORWAY, not a
-- terminus. Arc 2 (onboarding → active → expanding | at_risk → renewed |
-- churned | advocate) is deliberately NOT modelled yet — there are no
-- customers to learn the first state from, and every state built before it
-- can be exercised is one we get wrong and then migrate. The column costs
-- nothing today and saves a backfill later. See POA Phase 8.
--
-- ── WHY STATE IS STORED AND NOT DERIVED ───────────────────────────────
--
-- Most of Arc 1 IS derivable today (gt_prospects + gt_account_briefs.status
-- + gt_touch_log — see the backfill below, which does exactly that once).
-- It is stored anyway because a journey must carry a REASON, a WAKE DATE,
-- an OWNER and an ARC. A derivation holds none of those, and the reasons
-- are the entire learning signal.
-- ============================================================

DO $$
DECLARE missing TEXT;
BEGIN
    SELECT string_agg(t, ', ') INTO missing
    FROM   unnest(ARRAY['vn_tenants', 'gt_prospects', 'gt_account_briefs',
                        'gt_touch_log', 'gt_contacts']) AS t
    WHERE  to_regclass('public.' || t) IS NULL;

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'Missing prerequisite table(s): %', missing;
    END IF;
END $$;


-- ────────────────────────────────────────────────────────────────────────
-- TABLE: gt_journeys — one row per (tenant, is_live, prospect)
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_journeys (
    id                BIGSERIAL   PRIMARY KEY,
    tenant_id         UUID        NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    is_live           BOOLEAN     NOT NULL DEFAULT false,
    prospect_id       BIGINT      NOT NULL REFERENCES gt_prospects(id) ON DELETE CASCADE,

    -- 'won' moves the journey to the lifetime arc. Arc 2 has no states yet;
    -- a won journey parks there until there is a real customer to learn from.
    arc               VARCHAR(20) NOT NULL DEFAULT 'acquisition',

    state             VARCHAR(20) NOT NULL DEFAULT 'sourced',

    -- Required on every backward move and on every exit state. This is the
    -- column the Learning Graph eats.
    state_reason      TEXT,
    entered_state_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Only meaningful in 'parked'. Surfaces the journey for a human; it does
    -- NOT auto-send. An automatic wake is a send nobody decided.
    wake_at           TIMESTAMPTZ,

    owner_id          UUID,

    -- The offer this journey is arguing. COALESCE(human_offer,
    -- recommended_offer) at the moment the brief was decided — copied, not
    -- joined, so a later re-score cannot silently change what we are selling
    -- to an account that has already been contacted (design note R-J5 / R7).
    offer             VARCHAR(60),

    -- The person the journey is addressed to. Nullable: a journey exists
    -- long before anyone is identified.
    contact_id        BIGINT      REFERENCES gt_contacts(id) ON DELETE SET NULL,

    -- How many stories this journey has accumulated. 'ready' is repeatable —
    -- story 3 on an account is normal.
    story_count       SMALLINT    NOT NULL DEFAULT 0,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_gt_journeys_prospect UNIQUE (tenant_id, is_live, prospect_id),

    CONSTRAINT chk_gt_journeys_arc CHECK (arc IN ('acquisition', 'lifetime')),

    -- Arc 1 states. Three distinct exits on purpose: ruled_out = never a
    -- fit, parked = a fit at the wrong moment, lost = we played it out.
    -- They mean different things and the difference IS the learning signal.
    CONSTRAINT chk_gt_journeys_state CHECK (state IN (
        'sourced', 'researched', 'qualified', 'ruled_out',
        'addressed', 'ready', 'waiting', 'answered',
        'parked', 'lost', 'won'
    )),

    -- A wake date on a journey that is not parked is a reminder nobody will
    -- ever see, because only the parked list is scanned for it.
    CONSTRAINT chk_gt_journeys_wake_at CHECK (
        wake_at IS NULL OR state = 'parked')
);

-- The board reads by tenant + state; the dossier reads by prospect.
CREATE INDEX IF NOT EXISTS idx_gt_journeys_state
    ON gt_journeys(tenant_id, is_live, state, entered_state_at DESC);
CREATE INDEX IF NOT EXISTS idx_gt_journeys_prospect
    ON gt_journeys(prospect_id);
-- The parked list, scanned for journeys whose moment has come round.
CREATE INDEX IF NOT EXISTS idx_gt_journeys_wake
    ON gt_journeys(tenant_id, is_live, wake_at)
    WHERE wake_at IS NOT NULL;


-- ────────────────────────────────────────────────────────────────────────
-- TABLE: gt_journey_events — append-only. THE LEDGER.
--
-- gt_journeys.state is a cache of this table's tail. When they disagree,
-- this table is right. Nothing here is ever updated or deleted.
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_journey_events (
    id           BIGSERIAL   PRIMARY KEY,
    tenant_id    UUID        NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    is_live      BOOLEAN     NOT NULL DEFAULT false,
    journey_id   BIGINT      NOT NULL REFERENCES gt_journeys(id) ON DELETE CASCADE,

    -- NULL from_state = the journey's first event (its creation).
    from_state   VARCHAR(20),
    to_state     VARCHAR(20) NOT NULL,

    reason       TEXT,

    -- Who moved it. 'system' is reserved for backfills and derivations —
    -- if a transition cannot name a human or an agent, it must not pretend to.
    actor        VARCHAR(20) NOT NULL DEFAULT 'human',
    actor_id     UUID,

    -- Whatever the mover wants the ledger to remember: the brief id, the
    -- outcome, the story id, the run id.
    payload      JSONB       NOT NULL DEFAULT '{}'::jsonb,

    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_gt_journey_events_actor CHECK (
        actor IN ('human', 'agent', 'system'))
);

CREATE INDEX IF NOT EXISTS idx_gt_journey_events_journey
    ON gt_journey_events(journey_id, created_at DESC);


-- ────────────────────────────────────────────────────────────────────────
-- BACKFILL — one journey per existing prospect.
--
-- Derived ONCE from what already exists, then owned by the ledger and never
-- re-derived. Guarded by ON CONFLICT DO NOTHING so re-running this migration
-- cannot overwrite a state a human has since moved.
--
-- Precedence, most-advanced first:
--   a touch with an outcome        → answered
--   a touch without an outcome     → waiting
--   brief approved                 → qualified   (offer copied)
--   brief rejected / no_contact    → ruled_out   (decision_note as reason)
--   brief drafted / unreadable     → researched  (a human still must rule)
--   brief extract_failed           → sourced     (OUR failure, research still
--                                                 owed — migration 210's whole
--                                                 point; a pipeline crash must
--                                                 never read as a finding)
--   no brief                       → sourced
-- ────────────────────────────────────────────────────────────────────────

INSERT INTO gt_journeys (
    tenant_id, is_live, prospect_id, arc, state, state_reason,
    entered_state_at, offer
)
SELECT p.tenant_id,
       p.is_live,
       p.id,
       'acquisition',
       d.state,
       d.reason,
       COALESCE(d.at, p.created_at),
       d.offer
FROM   gt_prospects p
-- Newest brief and newest touch per prospect. LATERAL + LIMIT 1 rather than
-- an aggregate because several columns are needed off the SAME row.
LEFT   JOIN LATERAL (
    SELECT ab.status, ab.decision_note, ab.human_offer,
           ab.recommended_offer, ab.decided_at, ab.updated_at
    FROM   gt_account_briefs ab
    WHERE  ab.prospect_id = p.id
      AND  ab.tenant_id   = p.tenant_id
      AND  ab.is_live     = p.is_live
    ORDER  BY ab.updated_at DESC
    LIMIT  1
) b ON true
LEFT   JOIN LATERAL (
    SELECT tl.touched_at, tl.outcome_at
    FROM   gt_touch_log tl
    WHERE  tl.prospect_id = p.id
      AND  tl.tenant_id   = p.tenant_id
      AND  tl.is_live     = p.is_live
    ORDER  BY tl.touched_at DESC
    LIMIT  1
) t ON true
CROSS  JOIN LATERAL (
    SELECT
        CASE
            WHEN t.outcome_at IS NOT NULL                 THEN 'answered'
            WHEN t.touched_at IS NOT NULL                 THEN 'waiting'
            WHEN b.status = 'approved'                    THEN 'qualified'
            WHEN b.status IN ('rejected', 'no_contact')   THEN 'ruled_out'
            WHEN b.status IN ('drafted', 'unreadable')    THEN 'researched'
            ELSE 'sourced'
        END AS state,
        CASE
            WHEN t.touched_at IS NOT NULL THEN NULL
            WHEN b.status IN ('rejected', 'no_contact') THEN b.decision_note
            ELSE NULL
        END AS reason,
        CASE
            WHEN b.status = 'approved'
                THEN COALESCE(b.human_offer, b.recommended_offer)
            ELSE NULL
        END AS offer,
        COALESCE(t.outcome_at, t.touched_at, b.decided_at, b.updated_at) AS at
) d
ON CONFLICT (tenant_id, is_live, prospect_id) DO NOTHING;

-- The opening event for every journey the backfill just created. actor =
-- 'system' because no human or agent made this decision — it was inferred
-- from data that already existed, and the ledger must say so.
INSERT INTO gt_journey_events (
    tenant_id, is_live, journey_id, from_state, to_state, reason, actor, payload
)
SELECT j.tenant_id, j.is_live, j.id, NULL, j.state,
       'Backfilled from existing briefs and touches (migration 222).',
       'system',
       jsonb_build_object('migration', 222)
FROM   gt_journeys j
WHERE  NOT EXISTS (
    SELECT 1 FROM gt_journey_events e WHERE e.journey_id = j.id
);


-- ────────────────────────────────────────────────────────────────────────
-- RLS (house pattern) + updated_at
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE gt_journeys       ENABLE ROW LEVEL SECURITY;
ALTER TABLE gt_journey_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY gt_journeys_tenant_isolation ON gt_journeys
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY gt_journey_events_tenant_isolation ON gt_journey_events
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- update_updated_at() comes from migration 101; guarded because a fresh
-- bootstrap may not have run the legacy prime migration.
DO $$ BEGIN
    IF to_regprocedure('public.update_updated_at()') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS trg_gt_journeys_updated_at ON gt_journeys;
        CREATE TRIGGER trg_gt_journeys_updated_at
            BEFORE UPDATE ON gt_journeys
            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    ELSE
        RAISE NOTICE '[222] update_updated_at() absent — updated_at set in application code.';
    END IF;
END $$;


COMMENT ON TABLE gt_journeys IS
    'One durable relationship per company. A ledger, not a journey map: it records what happened and what a human decided, never what stage a customer is probably at.';
COMMENT ON TABLE gt_journey_events IS
    'Append-only. gt_journeys.state is a cache of this table''s tail; when they disagree this table is right.';
COMMENT ON COLUMN gt_journeys.arc IS
    'acquisition | lifetime. ''won'' is a doorway, not a terminus. Arc 2 has no states yet — see POA-journey-campaign.md Phase 8.';
COMMENT ON COLUMN gt_journeys.offer IS
    'Copied at decision time, not joined. A later re-score must never change what we are selling to an account already contacted (design note R-J5).';
COMMENT ON COLUMN gt_journeys.wake_at IS
    'Parked journeys only. Surfaces the journey for a human; never auto-sends — an automatic wake is a send nobody decided.';
COMMENT ON COLUMN gt_journeys.story_count IS
    '''ready'' is repeatable. A journey accumulates stories; story 3 on an account is normal.';

-- ── Post-apply verification ─────────────────────────────────────────────
-- SELECT state, count(*) FROM gt_journeys GROUP BY 1 ORDER BY 2 DESC;
-- SELECT count(*) FROM gt_prospects p
--   WHERE NOT EXISTS (SELECT 1 FROM gt_journeys j
--                      WHERE j.prospect_id = p.id AND j.is_live = p.is_live);  -- 0
-- SELECT count(*) FROM gt_journeys j
--   WHERE NOT EXISTS (SELECT 1 FROM gt_journey_events e WHERE e.journey_id = j.id);  -- 0
