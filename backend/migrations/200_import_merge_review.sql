-- ============================================================
-- Migration: 200_import_merge_review.sql
-- Purpose:   Make the import pipeline carry (a) what the tenant says the
--            data IS, (b) what the ETL detector found IN it, and (c) every
--            merge conflict, held for a human decision before landing.
--
-- Design notes: documents/design-notes-prospect-universe.md §3, §5, §6
--
-- ── USER RULINGS (2026-07-28) ─────────────────────────────────────────
--
-- 1. "field merge - let user decide ... explain to user and he will take call"
--    The quality model (field_score = validity x tier x freshness, §5) is
--    DEMOTED from decision to RECOMMENDATION. It still computes, still ranks
--    the options, still explains itself — but a human commits the merge.
--    Nothing is auto-merged (CLAUDE.md rule 12: no silent substitution).
--
-- 2. "there might already be a campaign running, and changes might impact merge"
--    The design note already forbids mutating a tenant's working set under a
--    live campaign for POOL refreshes:
--      "A universe refresh must never silently change what a tenant is
--       working on mid-campaign. Improvements surface as an offer to refresh,
--       with a visible diff — never as a mutation under them."
--    This migration extends the same rule to UPLOAD merges, which the note
--    did not cover.
--
-- 3. "contacts might be people or companies - we cant seperate right now,
--     let ETL skill identify it, user can give his own inputs if required"
--    Two orthogonal axes: the tenant declares the RELATIONSHIP, the detector
--    finds the ENTITIES. One file commonly yields both — FTCCI is
--    company-first with 3 reps inline (2,913 companies + ~5,800 people);
--    the profiled provider CSV is contact-first (119 people / 95 companies).
--
-- Conflicts live on ki_import_staging rather than in a new table: a conflict
-- IS a staged row that cannot land yet, and staging already carries
-- dedup_key, quality and per-row status (197). Working rule: extend the
-- existing ETL, do not create new.
-- ============================================================

-- ── 1. Sessions: declared relationship + detected extraction plan ─────

ALTER TABLE ki_import_sessions ADD COLUMN IF NOT EXISTS relationship    VARCHAR(16);
ALTER TABLE ki_import_sessions ADD COLUMN IF NOT EXISTS extraction_plan JSONB;

DO $$ BEGIN
    ALTER TABLE ki_import_sessions
        ADD CONSTRAINT ki_import_sessions_relationship_check
        CHECK (relationship IS NULL OR relationship IN ('contacts', 'customers', 'dataset'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN ki_import_sessions.relationship IS 'What the TENANT says this data is to them: contacts (not yet customers) | customers (they buy) | dataset (admin common-pool delivery). Context only a human has — no file can state it. Orthogonal to the entity types the detector finds.';
COMMENT ON COLUMN ki_import_sessions.extraction_plan IS 'What the ETL detector found and the human confirmed: {entities:[{kind:"company"|"person", columns:{...}, row_estimate:N}], confidence, reasons[], unresolved_columns[], overridden_by}. One file can yield both entity kinds. Ambiguity is recorded here and shown, never guessed away (rule 12).';

-- Note: `destination` (197) is deliberately unchanged. It is the tenant-vs-pool
-- axis for COMPANY rows. People always land in gt_contacts (tenant-scoped) —
-- Phase A ships no shared contact pool, so the DPDP question stays unanswered
-- by design (design note §8 decision 3).

-- ── 2. Prospects: is this a prospect or an existing customer? ──────────
--
-- A customer is company-shaped and needs every column gt_prospects already
-- has — industry, bands, quality, dedup. A separate gt_customers table would
-- duplicate ~20 columns to express one boolean, and would make "which of my
-- customers look like the common pool" a UNION instead of a predicate.
-- Uploading who ALREADY buys is the ground truth for the ideal-customer step.

ALTER TABLE gt_prospects ADD COLUMN IF NOT EXISTS relationship VARCHAR(16) NOT NULL DEFAULT 'prospect';

DO $$ BEGIN
    ALTER TABLE gt_prospects
        ADD CONSTRAINT gt_prospects_relationship_check
        CHECK (relationship IN ('prospect', 'customer'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_gt_prospects_relationship
    ON gt_prospects(tenant_id, is_live, relationship) WHERE is_active = true;

COMMENT ON COLUMN gt_prospects.relationship IS 'prospect = a target. customer = they already buy. Declared by the tenant at import, never inferred. Customer rows are the evidence base for the ideal-customer step and, later, for orders/history.';

-- ── 3. Staging: conflicts held for a human decision ───────────────────

ALTER TABLE ki_import_staging ADD COLUMN IF NOT EXISTS conflict_kind         VARCHAR(16);
ALTER TABLE ki_import_staging ADD COLUMN IF NOT EXISTS conflict_target_table VARCHAR(40);
ALTER TABLE ki_import_staging ADD COLUMN IF NOT EXISTS conflict_target_id    BIGINT;
ALTER TABLE ki_import_staging ADD COLUMN IF NOT EXISTS field_diff            JSONB;
ALTER TABLE ki_import_staging ADD COLUMN IF NOT EXISTS campaign_locked       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE ki_import_staging ADD COLUMN IF NOT EXISTS merge_decision        JSONB;
ALTER TABLE ki_import_staging ADD COLUMN IF NOT EXISTS decided_by            UUID;
ALTER TABLE ki_import_staging ADD COLUMN IF NOT EXISTS decided_at            TIMESTAMPTZ;

DO $$ BEGIN
    ALTER TABLE ki_import_staging
        ADD CONSTRAINT ki_import_staging_conflict_kind_check
        CHECK (conflict_kind IS NULL OR conflict_kind IN ('in_file', 'existing'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 'conflict' is a new terminal-until-decided status. The original CHECK
-- (migration 104) is inline and therefore auto-named; drop whatever is on the
-- column and re-add a named one so this migration is re-runnable.
DO $$
DECLARE c_name TEXT;
BEGIN
    SELECT conname INTO c_name
    FROM   pg_constraint
    WHERE  conrelid = 'ki_import_staging'::regclass
      AND  contype  = 'c'
      AND  pg_get_constraintdef(oid) ILIKE '%processing_status%';

    IF c_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE ki_import_staging DROP CONSTRAINT %I', c_name);
    END IF;

    ALTER TABLE ki_import_staging
        ADD CONSTRAINT ki_import_staging_processing_status_check
        CHECK (processing_status IN (
            'pending', 'processing', 'success', 'failed',
            'duplicate', 'skipped', 'conflict'
        ));
END $$;

-- The review queue: conflicts for a session, campaign-locked rows first.
CREATE INDEX IF NOT EXISTS idx_ki_import_staging_conflict
    ON ki_import_staging(session_id, campaign_locked)
    WHERE processing_status = 'conflict';

COMMENT ON COLUMN ki_import_staging.conflict_kind IS 'in_file = collides with another row in the same upload. existing = collides with a record already held. Both are held at ''conflict'' until a human decides.';
COMMENT ON COLUMN ki_import_staging.field_diff IS 'Per-field decision material: {field:{existing, incoming, recommended, reason, existing_score, incoming_score}}. `recommended` is the quality model''s answer (validity x tier x freshness) — a suggestion the human accepts or overrides, never an action taken.';
COMMENT ON COLUMN ki_import_staging.campaign_locked IS 'TRUE when the target record has a live gt_contact_assignments row (active campaign, stage not converted/lost). These rows are EXCLUDED from bulk accept: changing an email or phone mid-sequence misdirects outreach that has already gone out.';
COMMENT ON COLUMN ki_import_staging.merge_decision IS 'What the human chose, per field: {field: "keep"|"take"|<literal>}. Written with decided_by/decided_at so an import that changed live campaign data is auditable after the fact.';
