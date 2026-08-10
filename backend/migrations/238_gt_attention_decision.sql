-- ============================================================
-- Migration: 238_gt_attention_decision.sql
-- Purpose:   The decision log behind /today. What a human decided about a
--            quiet account, and when. Append-only.
--
-- Design: docs/gtm/attention-query.md (which source is authoritative) and
--         the G3 work order.
--
-- ── WHY APPEND-ONLY, AND WHY NO STATUS COLUMN ─────────────────────────
--
-- The work order requires it, and the requirement is right. A status column
-- answers "what is true now" and destroys "what did we decide, and when, and
-- why" — which is the only part with any value a week later. Snoozing an
-- account four times is a fact about that account; a `snoozed_until` column
-- overwrites the first three snoozes and leaves you unable to notice.
--
-- Current state is FOLDED from the log: the latest row per (tenant, is_live,
-- prospect) is the standing decision. gt_journey_events already works this
-- way (migration 222 — "state is a cache of this table's tail"), so this is
-- the house pattern rather than a new idea.
--
-- Nothing here is ever UPDATEd or DELETEd. Undo is a new row saying
-- 'reopened', which is also how you find out somebody changed their mind.
--
-- ── WHY snooze_until IS NOT A STATUS COLUMN ───────────────────────────
--
-- It is an argument to the decision, not a property of the account: "on this
-- date I decided to not look at this until that date". It is written once,
-- with the row, and never touched again. Whether a snooze is currently in
-- force is read at query time by comparing the LATEST snooze row's
-- snooze_until against now(). No background job flips anything, so there is
-- no job to fail silently at 3am and no window where the table disagrees
-- with reality.
--
-- ── WHY THE ACCOUNT AXIS IS prospect_id ───────────────────────────────
--
-- Quietness is a property of a company relationship. gt_touch_log.prospect_id
-- is NOT NULL and gt_journeys is unique per (tenant, is_live, prospect), so
-- the account axis is unambiguous today. gt_touch_reservations deliberately
-- keys on contact_id instead, and journey_id is reserved for the opportunity
-- axis that does not exist yet — when it lands, this table gains a nullable
-- journey_id and the fold gains a tiebreak. It does not need one now.
--
-- ── RLS IS FORCED FROM CREATION ───────────────────────────────────────
--
-- Phase 0 found eighteen tables whose policies were present, correct and
-- completely inert because the table's OWNER is exempt from its own RLS
-- unless FORCE ROW LEVEL SECURITY is set — and the owner was the very role
-- the application runs as. Migration 236 fixed those. A table created after
-- that lesson has no excuse for arriving without it, whoever ends up owning
-- it. See docs/db/rls-status.md §3.2.
--
-- The policy expression is the hardened form from migration 234: an empty
-- GUC must read as "no tenant" and not crash. set_config(is_local := true)
-- leaves app.current_tenant_id DEFINED AND EMPTY after COMMIT rather than
-- undefined, so ''::uuid is a live failure mode on pooled connections, not
-- a hypothetical one.
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


CREATE TABLE IF NOT EXISTS gt_attention_decision (
    id            BIGSERIAL   PRIMARY KEY,
    tenant_id     UUID        NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    is_live       BOOLEAN     NOT NULL DEFAULT false,
    prospect_id   BIGINT      NOT NULL REFERENCES gt_prospects(id) ON DELETE CASCADE,

    --   acted     a touch was logged from this item. The decision log records
    --             that /today was where it happened; gt_touch_log records
    --             what was actually sent. Two facts, two tables.
    --   snoozed   not now. snooze_until says when it comes back.
    --   dismissed stop showing me this. Reversible only by 'reopened'.
    --   reopened  undo. Exists because append-only has no DELETE, and
    --             because "who un-dismissed this and when" is worth keeping.
    decision      VARCHAR(12) NOT NULL,

    -- Required on dismissal. A dismissal without a reason is a silent
    -- deletion wearing a log entry's clothes, and six weeks later nobody can
    -- tell a considered "not our market" from a mis-click.
    reason        TEXT,

    -- Only meaningful on 'snoozed'. Written with the row, never updated.
    snooze_until  TIMESTAMPTZ,

    -- What the screen was showing when the human decided. Frozen, not
    -- joined — the same reasoning as gt_touch_log.had_brief. If the ranking
    -- weights are retuned next month, this must still say what the operator
    -- was actually looking at, or the log cannot be used to judge the
    -- ranking. That is most of the point of keeping it.
    --   { days_quiet, score, journey_state, reason_code, last_touch_at }
    shown         JSONB       NOT NULL DEFAULT '{}'::jsonb,

    decided_by    UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_gt_attn_decision CHECK (
        decision IN ('acted', 'snoozed', 'dismissed', 'reopened')),

    -- A snooze with no date is an indefinite dismissal that never shows up
    -- in the dismissed list. A snooze date on anything else is a reminder
    -- nobody reads — migration 222 made exactly that mistake available with
    -- wake_at and the reminders have been invisible ever since.
    CONSTRAINT chk_gt_attn_snooze CHECK (
        (decision = 'snoozed') = (snooze_until IS NOT NULL)),

    CONSTRAINT chk_gt_attn_reason CHECK (
        decision <> 'dismissed' OR btrim(coalesce(reason, '')) <> '')
);

-- The fold: latest decision per account. DESC on both columns because the
-- query is `DISTINCT ON (prospect_id) ... ORDER BY prospect_id, created_at
-- DESC, id DESC` — id breaks the tie when two decisions share a timestamp,
-- which now() inside one transaction makes entirely possible.
CREATE INDEX IF NOT EXISTS idx_gt_attn_fold
    ON gt_attention_decision(tenant_id, is_live, prospect_id, created_at DESC, id DESC);

-- The snooze sweep: "which snoozes have come due". Partial, because snoozes
-- are a small minority of rows and this index exists for one query.
CREATE INDEX IF NOT EXISTS idx_gt_attn_snooze_due
    ON gt_attention_decision(tenant_id, is_live, snooze_until)
    WHERE snooze_until IS NOT NULL;


-- ────────────────────────────────────────────────────────────────────────
-- Append-only, enforced by the database and not by good intentions
--
-- Enforced here rather than by REVOKE: a revoked privilege has to be
-- re-revoked for every future role and is silently undone by the next
-- `GRANT ALL` in a setup script — which is exactly what
-- scripts/grant-vanigtm-app.sql does. This travels with the table.
--
-- ── WHY A TRIGGER AND NOT `DO INSTEAD NOTHING` RULES ──────────────────
--
-- The obvious implementation is two rules. It was written that way first,
-- and testing killed it: a DO INSTEAD NOTHING rule on DELETE also swallows
-- the delete that PostgreSQL's own referential-integrity machinery issues,
-- so `DELETE FROM gt_prospects` fails with
--
--   ERROR: referential integrity query on "gt_prospects" from constraint
--          "gt_attention_decision_prospect_id_fkey" gave unexpected result
--   HINT:  This is most likely due to a rule having rewritten the query.
--
-- One dismissed account would have made that prospect — and, through the
-- tenant cascade, that whole tenant — permanently undeletable. Worth
-- recording, because "append-only" and "ON DELETE CASCADE" look compatible
-- right up until you run it.
--
-- A trigger can tell the two cases apart, and does it semantically rather
-- than by counting pg_trigger_depth(): during a cascade the parent row is
-- ALREADY GONE (the RI action is an AFTER DELETE trigger on gt_prospects),
-- so a delete whose prospect no longer exists is the cascade, and a delete
-- whose prospect is still there is somebody rewriting history.
--
-- Raising beats returning NULL. A silently discarded write is the same
-- class of bug as the empty-GUC policy Phase 0 spent a day on: the caller
-- believes it succeeded. An application that tries to UPDATE this table has
-- a bug and should hear about it.
--
-- This stops the APPLICATION from rewriting history. It does not stop a
-- superuser at a psql prompt, and is not meant to.
-- ────────────────────────────────────────────────────────────────────────

-- Rules from an earlier revision of this migration, if it was ever applied.
DROP RULE IF EXISTS gt_attention_decision_no_update ON gt_attention_decision;
DROP RULE IF EXISTS gt_attention_decision_no_delete ON gt_attention_decision;

CREATE OR REPLACE FUNCTION gt_attention_decision_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION
            'gt_attention_decision is append-only: rows are never updated. '
            'To reverse a decision, insert a new one (decision = ''reopened'').'
            USING ERRCODE = 'restrict_violation';
    END IF;

    -- DELETE. Allowed only as the tail of a cascade, which is recognisable
    -- because the parent prospect has already been removed by the time this
    -- fires.
    IF EXISTS (SELECT 1 FROM gt_prospects WHERE id = OLD.prospect_id) THEN
        RAISE EXCEPTION
            'gt_attention_decision is append-only: rows are never deleted. '
            'To reverse a decision, insert a new one (decision = ''reopened'').'
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN OLD;
END
$fn$;

DROP TRIGGER IF EXISTS trg_gt_attention_decision_append_only ON gt_attention_decision;
CREATE TRIGGER trg_gt_attention_decision_append_only
    BEFORE UPDATE OR DELETE ON gt_attention_decision
    FOR EACH ROW EXECUTE FUNCTION gt_attention_decision_append_only();


-- ────────────────────────────────────────────────────────────────────────
-- RLS — enabled AND forced, from creation
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE gt_attention_decision ENABLE ROW LEVEL SECURITY;
ALTER TABLE gt_attention_decision FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gt_attention_decision_tenant_isolation ON gt_attention_decision;
CREATE POLICY gt_attention_decision_tenant_isolation ON gt_attention_decision
    USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);


COMMENT ON TABLE gt_attention_decision IS
    'Append-only log of what a human decided about a quiet account on /today. No status column: current state is the latest row per (tenant, is_live, prospect). Never UPDATEd or DELETEd — rules enforce it.';
COMMENT ON COLUMN gt_attention_decision.snooze_until IS
    'Written once with the row. Whether a snooze is in force is read by comparing the LATEST snooze row against now(), so there is no background job to fail silently.';
COMMENT ON COLUMN gt_attention_decision.shown IS
    'What the screen displayed at decision time, frozen. Retuning the ranking must not rewrite what the operator was looking at, or the log cannot be used to judge the ranking.';


-- ── Post-apply verification ─────────────────────────────────────────────
-- Expect: relrowsecurity = t, relforcerowsecurity = t
--   SELECT relrowsecurity, relforcerowsecurity FROM pg_class
--    WHERE oid = 'gt_attention_decision'::regclass;
-- Expect: ERROR "append-only: rows are never updated"
--   UPDATE gt_attention_decision SET reason = 'nope' WHERE id = <any>;
-- Expect: ERROR "append-only: rows are never deleted"
--   DELETE FROM gt_attention_decision WHERE id = <any>;
-- Expect: SUCCESS, and the decision rows go with it
--   BEGIN; DELETE FROM gt_prospects WHERE id = <one with a decision>; ROLLBACK;
