-- ============================================================
-- Migration: 221_gt_touch_log.sql
-- Purpose:   The smallest thing that answers "did it work".
--
-- Plan: documents/POA-manufacturing-pilot.md Step 4.
--
-- ── WHY THIS IS SEVEN COLUMNS AND NOT A CRM ───────────────────────────
--
-- The pilot pre-registered its success criteria before anything was built:
-- ≥8% reply rate validates the thesis, 3-8% means the offer or channel needs
-- work, <3% says the problem is offer-market fit and NOT to build agents.
--
-- A criterion nobody can compute is not a criterion. This table exists so the
-- answer is a query rather than a spreadsheet somebody keeps on their laptop
-- and reconstructs from memory in three weeks. It is deliberately the embryo
-- of an event log and deliberately not more than that — every column here
-- earns its place by appearing in the verdict.
--
-- ── had_brief IS FROZEN AT LOG TIME ───────────────────────────────────
--
-- The criteria are about RESEARCHED sends. Deriving that at read time by
-- joining gt_account_briefs would quietly change the denominator whenever a
-- brief is deleted or a company is re-researched — and "delete the junk
-- briefs and re-run" is a thing that has already happened twice in this
-- pilot. Whether a send was researched is a fact about the moment it was
-- sent, so it is recorded then and never recomputed.
--
-- ── outcome IS NULLABLE, AND THAT IS THE POINT ────────────────────────
--
-- NULL means "no response yet", which is different from "no response" and
-- must not be counted as either a reply or a non-reply while the window is
-- open. A reply rate read on week one of a two-week window is not a small
-- number, it is a meaningless one — and pre-registering criteria is worthless
-- if the reading can be taken early and then re-taken until it looks better.
-- ============================================================

DO $$
DECLARE missing TEXT;
BEGIN
    SELECT string_agg(t, ', ') INTO missing
    FROM   unnest(ARRAY['vn_tenants', 'gt_prospects']) AS t
    WHERE  to_regclass('public.' || t) IS NULL;

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'Missing prerequisite table(s): %', missing;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS gt_touch_log (
    id            BIGSERIAL PRIMARY KEY,
    tenant_id     UUID        NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    is_live       BOOLEAN     NOT NULL DEFAULT false,
    prospect_id   BIGINT      NOT NULL REFERENCES gt_prospects(id) ON DELETE CASCADE,

    -- What was pitched. Free text rather than a FK to gt_offers: an offer can
    -- be renamed or retired, and a touch is a record of what was actually
    -- said on a date, not a pointer to what that offer is called today.
    offer         VARCHAR(60),

    --   email | phone | linkedin | whatsapp | other
    -- Reachability is the least-tested assumption in the whole thesis, so
    -- which channel earned the reply matters as much as the rate.
    channel       VARCHAR(20) NOT NULL,

    touched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    --   NULL          no response yet — NOT the same as no response
    --   replied       they answered, any sentiment
    --   meeting       a call or meeting was agreed
    --   not_interested  an explicit no. Still a reply.
    --   bounced       never reached them — a reachability failure, not a
    --                 rejection, and counted separately for that reason
    --   no_response   the window closed with nothing
    outcome       VARCHAR(20),
    outcome_at    TIMESTAMPTZ,

    notes         TEXT,

    -- Frozen at log time. See the header — deleting a brief must not silently
    -- move a send out of the researched denominator.
    had_brief     BOOLEAN     NOT NULL DEFAULT false,

    created_by    UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_gt_touch_log_outcome CHECK (
        outcome IS NULL OR outcome IN
        ('replied', 'meeting', 'not_interested', 'bounced', 'no_response')),
    CONSTRAINT chk_gt_touch_log_channel CHECK (
        channel IN ('email', 'phone', 'linkedin', 'whatsapp', 'other')),
    -- An outcome without a date makes "how long did it take" unanswerable,
    -- and that is the second thing anyone asks after the rate.
    CONSTRAINT chk_gt_touch_log_outcome_at CHECK (
        (outcome IS NULL) = (outcome_at IS NULL))
);

-- The scoreboard reads by tenant and date; the dossier reads by company.
CREATE INDEX IF NOT EXISTS idx_gt_touch_log_scope
    ON gt_touch_log(tenant_id, is_live, touched_at DESC);
CREATE INDEX IF NOT EXISTS idx_gt_touch_log_prospect
    ON gt_touch_log(prospect_id, touched_at DESC);

ALTER TABLE gt_touch_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY gt_touch_log_tenant_isolation ON gt_touch_log
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE gt_touch_log IS
    'One row per outreach touch. Exists so the pilot''s pre-registered reply-rate criteria are a query rather than a spreadsheet. Manual entry — the pilot deliberately does not automate sending.';
COMMENT ON COLUMN gt_touch_log.had_brief IS
    'Was this a RESEARCHED send? Frozen at log time — deriving it later would move the denominator whenever a brief is deleted or re-run.';
COMMENT ON COLUMN gt_touch_log.outcome IS
    'NULL = no response YET, which is not the same as no response and must not be counted as either while the window is open.';
