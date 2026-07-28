-- ============================================================
-- Migration: 206_prospect_industry_canonical.sql
-- Purpose:   Somewhere to put the collapsed industry value.
--
-- Plan: documents/POA-manufacturing-pilot.md, Step 1.
--
-- ── WHY A COLUMN AND NOT A TABLE ──────────────────────────────────────
--
-- The FTCCI import landed 2,882 rows carrying 2,149 DISTINCT industry
-- strings, 2,050 of them appearing exactly once. One concept — making
-- things — arrives as "Manufacturers" (210), "Manufacturer" (68) and a tail
-- of variants. No segment can be selected from that, and no lesson can ever
-- accumulate against a segment of one.
--
-- The full taxonomy (gt_industries + aliases, a canonical list, a mapping UI)
-- is NOT this migration and is explicitly out of scope for the pilot. This is
-- the smallest honest home for "the collapsed value": one nullable column,
-- populated where a rule exists, NULL everywhere else. When the wider
-- taxonomy lands it fills the same column and nothing here is rewritten.
--
-- ── industry_raw IS NEVER TOUCHED ─────────────────────────────────────
--
-- The raw string is provenance — it is what the source file said. Collapsing
-- in place would destroy the evidence for a rule we have not yet validated
-- against a human. Both values are kept, and the UI keeps showing the raw one.
--
-- NULL is meaningful and is three different things — no rule yet, excluded by
-- a rule, or no industry at all. The distinction lives in the cohort
-- function's report, not in this column, because a column that encodes
-- "why not" invites querying it as if it were a decision.
-- ============================================================

DO $$
DECLARE missing TEXT;
BEGIN
    SELECT string_agg(t, ', ') INTO missing
    FROM   unnest(ARRAY['gt_prospects']) AS t
    WHERE  to_regclass('public.' || t) IS NULL;

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION
            'Missing prerequisite table(s): %. gt_prospects comes from migration 196 — it must really exist, not merely be recorded as applied in vn_migrations.', missing;
    END IF;
END $$;

ALTER TABLE gt_prospects
    ADD COLUMN IF NOT EXISTS industry_canonical VARCHAR(60);

-- Partial: only a fraction of rows will ever carry a value, and the cohort
-- query always asks for a specific canonical.
CREATE INDEX IF NOT EXISTS idx_gt_prospects_industry_canonical
    ON gt_prospects(tenant_id, is_live, industry_canonical)
    WHERE industry_canonical IS NOT NULL;

COMMENT ON COLUMN gt_prospects.industry_canonical IS
    'Rule-collapsed industry (e.g. manufacturing). NULL where no rule matched — which is not the same as "no industry". industry_raw is the source of truth and is never modified.';
