-- ============================================================
-- Migration: 214_gt_fit_lessons.sql
-- Purpose:   The Learning Graph for fit judgement — rules the agent DERIVES
--            from a reviewer's decisions, that the reviewer then ratifies,
--            corrects or throws out.
--
-- Plan: documents/design-notes-research.md §10.
--
-- ── WHY A TABLE AND NOT JUST THE DECISIONS ────────────────────────────
--
-- Feeding the last ten rulings into the fit prompt as examples is useful and
-- cheap, and it is what migration 213 enables. But it is not learning — it is
-- recency. Ten examples scroll: the eleventh ruling pushes out the first, and
-- the thing the reviewer taught us in week one is gone.
--
-- A LESSON is the generalisation: "single-unit companies with no exports are
-- too small for the retainer" is worth more than the three rejections it came
-- from, survives them scrolling away, and — crucially — can be argued with.
--
-- ── AGENT PROPOSES, HUMAN CONFIRMS ────────────────────────────────────
--
-- Same model as the rest of this product (CLAUDE.md rule 9). The agent reads
-- the decision history and PROPOSES lessons with the evidence attached; a
-- human accepts, edits or rejects each one; only `accepted` rows reach the
-- fit prompt. A model inferring its own rules and then obeying them, with no
-- human in between, is how a system quietly drifts into a policy nobody chose.
--
-- `evidence` is not decoration — a proposed lesson without the companies and
-- the reviewer's own words behind it cannot be checked, and an unfalsifiable
-- rule is exactly what should not be allowed to decide who gets contacted.
--
-- ── STALENESS ─────────────────────────────────────────────────────────
--
-- Accepted lessons feed judgementFingerprint() alongside the offers. Ratify a
-- lesson and every UNDECIDED brief is stale; the Research screen offers to
-- re-score them (one LLM call each, no crawling). Decided briefs are never
-- re-judged — a ruling stands until the human changes it.
-- ============================================================

DO $$
DECLARE missing TEXT;
BEGIN
    SELECT string_agg(t, ', ') INTO missing
    FROM   unnest(ARRAY['vn_tenants', 'gt_account_briefs']) AS t
    WHERE  to_regclass('public.' || t) IS NULL;

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'Missing prerequisite table(s): %', missing;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS gt_fit_lessons (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       UUID        NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    is_live         BOOLEAN     NOT NULL DEFAULT false,

    -- The rule, in the reviewer's terms. One sentence, actionable, testable
    -- against a brief. "They are picky" is not a lesson; "reject single-unit
    -- companies with no stated exports" is.
    lesson          TEXT        NOT NULL,

    -- What kind of judgement it encodes. Kept small on purpose — this is for
    -- grouping on screen, not a taxonomy anyone has to maintain.
    --   disqualifier  a reason to score something DOWN
    --   sizing        about how big or small a company must be
    --   preference    which offer to lead with when several fit
    --   signal        what to read as evidence of a real problem
    kind            VARCHAR(20) NOT NULL DEFAULT 'preference',

    -- The offer this is about, or NULL when it applies across the catalogue.
    applies_to      VARCHAR(60),

    -- The rulings it was derived from: [{company, decision, note, offer}].
    -- A lesson nobody can trace back to actual decisions cannot be checked,
    -- and is therefore not allowed to influence who gets contacted.
    evidence        JSONB       NOT NULL DEFAULT '[]'::jsonb,

    --   proposed  the agent's suggestion, waiting on a human
    --   accepted  ratified — reaches the fit prompt
    --   rejected  the human disagreed. KEPT, so the agent is not asked to
    --             re-propose the same thing next week.
    status          VARCHAR(20) NOT NULL DEFAULT 'proposed',

    -- Normalised lesson text, so the same proposal arriving twice updates the
    -- evidence rather than filling the screen with near-duplicates.
    lesson_key      VARCHAR(64) NOT NULL,

    run_id          BIGINT,
    proposed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_by      UUID,
    decided_at      TIMESTAMPTZ,
    -- The reviewer's edit, when they accepted a reworded version. The
    -- original stays in `lesson` so the difference between what the agent
    -- inferred and what the human meant is visible.
    edited_lesson   TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_gt_fit_lessons_status
        CHECK (status IN ('proposed', 'accepted', 'rejected')),
    CONSTRAINT chk_gt_fit_lessons_kind
        CHECK (kind IN ('disqualifier', 'sizing', 'preference', 'signal'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_gt_fit_lessons_key
    ON gt_fit_lessons(tenant_id, is_live, lesson_key);

-- The read on every fit-scoring run: this tenant's ratified lessons.
CREATE INDEX IF NOT EXISTS idx_gt_fit_lessons_accepted
    ON gt_fit_lessons(tenant_id, is_live, status);

-- Tenant isolation. Dormant like the rest until the vanigtm_app cutover
-- (docs/rls-cutover-checklist.md), with the application-layer WHERE clause
-- doing the work today.
ALTER TABLE gt_fit_lessons ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY gt_fit_lessons_tenant_isolation ON gt_fit_lessons
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE gt_fit_lessons IS
    'Fit-judgement rules the agent derived from a reviewer''s brief decisions, ratified by that reviewer. Only status=accepted rows reach the fit prompt. Agent proposes, human confirms.';
COMMENT ON COLUMN gt_fit_lessons.evidence IS
    'The rulings this was inferred from. A lesson that cannot be traced to real decisions cannot be checked, and does not get to decide who is contacted.';
COMMENT ON COLUMN gt_fit_lessons.edited_lesson IS
    'The reviewer''s wording when they accepted a corrected version. `lesson` keeps the agent''s original so the gap between the two stays visible.';
COMMENT ON COLUMN gt_fit_lessons.status IS
    'proposed | accepted | rejected. Rejected rows are KEPT so the same proposal is not made again next week.';
