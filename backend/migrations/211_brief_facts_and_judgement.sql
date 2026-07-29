-- ============================================================
-- Migration: 211_brief_facts_and_judgement.sql
-- Purpose:   Separate the half of a brief that is about the COMPANY from the
--            half that is a judgement against OUR offers.
--
-- Plan: documents/design-notes-research.md §7, NEXT item 5.
--
-- ── THE TWO HALVES ────────────────────────────────────────────────────
--
--   FACTS      what they make, scale, service, digital maturity, contacts,
--              evidence. EXPENSIVE — a crawl plus an extraction call — and
--              completely offer-independent. Aurobindo makes APIs whatever
--              we happen to sell this quarter.
--
--   JUDGEMENT  fit scores, recommended offer, hook. CHEAP — one or two
--              calls — and it changes every time an offer's wording moves.
--
-- Before this, adding or editing ONE offer re-ran everything: fetch, crawl,
-- extract, fit, hook, per company. Four calls and a crawl to answer a
-- question about one sentence. Across 101 companies that is hours.
--
-- With the halves timestamped separately, changing an offer costs ONE call
-- per company and no crawling at all. That matters because offer wording is
-- precisely the thing that gets iterated — it is the experiment.
--
-- ── HOW STALENESS IS KNOWN ────────────────────────────────────────────
--
-- offers_fingerprint records WHICH offer set produced the judgement (a hash
-- over each active offer's key and updated_at). When the current catalogue
-- hashes differently, the judgement is stale and the row is re-scored —
-- without being re-crawled. Nothing has to remember to invalidate anything.
-- ============================================================

DO $$ BEGIN
    IF to_regclass('public.gt_account_briefs') IS NULL THEN
        RAISE EXCEPTION
            'Missing prerequisite table gt_account_briefs — it comes from migration 207.';
    END IF;
END $$;

ALTER TABLE gt_account_briefs
    ADD COLUMN IF NOT EXISTS facts_at           TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS judged_at          TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS offers_fingerprint VARCHAR(64),
    -- Extracted since day one, put into the fit prompt, and then THROWN
    -- AWAY — there was no column for it. For a pharma manufacturer the
    -- certifications ARE the scale signal (WHO-GMP, USFDA, CEP, DMF), and a
    -- re-score cannot see them unless they survive the first pass.
    ADD COLUMN IF NOT EXISTS certifications     TEXT[] NOT NULL DEFAULT '{}';

-- Existing rows: everything was gathered and judged in one pass, so both
-- halves are as old as the fetch. The fingerprint stays NULL, which reads as
-- "judged against an unknown offer set" and therefore stale — so the first
-- run after this migration re-scores them WITHOUT re-crawling. That is the
-- correct outcome and it is free.
UPDATE gt_account_briefs
   SET facts_at  = COALESCE(facts_at, fetched_at),
       judged_at = COALESCE(judged_at, fetched_at)
 WHERE fetched_at IS NOT NULL
   AND (facts_at IS NULL OR judged_at IS NULL);

-- The lookup the agent makes per company: does this row need facts, need
-- re-scoring, or need nothing at all.
CREATE INDEX IF NOT EXISTS idx_gt_account_briefs_freshness
    ON gt_account_briefs(tenant_id, is_live, offers_fingerprint)
    WHERE status <> 'unreadable';

COMMENT ON COLUMN gt_account_briefs.certifications IS
    'Exact certification names as printed on their site (WHO-GMP, USFDA, CEP, DMF...). Part of the FACTS half — offer-independent.';
COMMENT ON COLUMN gt_account_briefs.facts_at IS
    'When the crawl and extraction last succeeded. Offer-independent — editing an offer does not stale this.';
COMMENT ON COLUMN gt_account_briefs.judged_at IS
    'When fit scoring and the hook last ran. Stales whenever the offer catalogue changes.';
COMMENT ON COLUMN gt_account_briefs.offers_fingerprint IS
    'Hash of the offer set this judgement was made against (key + updated_at per active offer). Differs from the current catalogue = re-score, no re-crawl. NULL = judged against an unknown set, treated as stale.';
