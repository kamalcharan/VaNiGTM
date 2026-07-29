-- ============================================================
-- Migration: 212_offer_commitment.sql
-- Purpose:   Separate "which offer fits best" from "which offer to actually
--            open with" — and record both on the brief.
--
-- Plan: documents/design-notes-research.md §7.
--
-- ── THE PROBLEM THIS FIXES ────────────────────────────────────────────
--
-- The first pilot run produced this, per company, on almost every row:
--
--     cdo 0.72 · ai-automations 0.68 · workshop 0.65 · audit 0.58 · caio 0.15
--     cdo 0.81 · ai-automations 0.78 · workshop 0.72 · audit 0.68 · caio 0.15
--     cdo 0.75 · ai-automations 0.72 · audit 0.68 · workshop 0.35 · caio 0.15
--
-- CDO wins every time, and it wins by 0.03. A 0.03 gap between two LLM
-- judgements is not a judgement — it is noise, and we were letting noise
-- decide which offer a real company hears about first.
--
-- Two separate things were being conflated:
--
--   FIT         which offer best matches what this company IS.
--               That is what the model scores, and it is scoring it fine.
--
--   THE ASK     which offer is the right SIZE to put in front of a company
--               that has never heard of us. A retainer and a one-day
--               workshop can fit a company equally well; only one of them is
--               a sane first message.
--
-- `commitment` is the second axis. It is NOT given to the model — the model
-- scores fit and nothing else, exactly as before. The selection rule is
-- applied deterministically in code afterwards (account.agent.ts):
--
--     among the offers within 0.15 of the top score, take the LOWEST
--     commitment; ties broken by the higher score.
--
-- So Biophore's cdo 0.81 / audit 0.68 stops being "CDO, by 0.03 over
-- ai-automations" and becomes "fits CDO best; open with the Digital Systems
-- Audit — same fit band, far smaller first ask".
--
-- ── WHY THE BRIEF STORES BOTH ─────────────────────────────────────────
--
-- best_fit_offer is what the model actually said. recommended_offer is what
-- we act on. Keeping only the second would hide the rule from the person
-- reviewing the brief, and a recommendation nobody can argue with is a
-- recommendation nobody should trust. fit_margin makes the "this was a coin
-- toss" case visible instead of implied.
-- ============================================================

DO $$
DECLARE missing TEXT;
BEGIN
    SELECT string_agg(t, ', ') INTO missing
    FROM   unnest(ARRAY['gt_offers', 'gt_account_briefs']) AS t
    WHERE  to_regclass('public.' || t) IS NULL;

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION
            'Missing prerequisite table(s): % — they come from migrations 207 and 209.',
            missing;
    END IF;
END $$;

-- ── gt_offers.commitment ──────────────────────────────────────────────
--
-- Three rungs, deliberately few. More would be a taxonomy nobody maintains;
-- fewer would not separate "buy an afternoon" from "sign for a year", which
-- is the only distinction the rule needs.
--
--   entry     a first, bounded, low-risk purchase — a workshop, an audit,
--             an assessment. Something a stranger can say yes to.
--   project   a defined piece of delivery with a start and an end.
--   retainer  an ongoing engagement. Almost never a first ask.
--
-- Default 'project': the middle rung, so an offer added without a thought
-- neither jumps the queue nor is written off.
ALTER TABLE gt_offers
    ADD COLUMN IF NOT EXISTS commitment VARCHAR(20) NOT NULL DEFAULT 'project';

DO $$ BEGIN
    ALTER TABLE gt_offers
        ADD CONSTRAINT chk_gt_offers_commitment
        CHECK (commitment IN ('entry', 'project', 'retainer'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN gt_offers.commitment IS
    'How big an ask this is: entry (workshop/audit — a stranger can say yes), project (bounded delivery), retainer (ongoing). NOT shown to the fit-scoring model; used afterwards to pick the smallest sane first ask among offers that fit equally well.';

-- Existing rows carry the default. Correct the ones we can name — matched on
-- offer_key, so a tenant who renamed or rewrote an offer is untouched, and
-- only rows still sitting on the default are moved (a human who has already
-- set this wins).
UPDATE gt_offers SET commitment = v.commitment
FROM  (VALUES
    ('ai-for-business-workshop', 'entry'),
    ('workshop',                 'entry'),
    ('digital-systems-audit',    'entry'),
    ('ai-automations',           'project'),
    ('mvp-as-a-service',         'project'),
    ('cdo-as-a-service',         'retainer'),
    ('caio-as-a-service',        'retainer'),
    ('ai-transformation',        'retainer')
) AS v(offer_key, commitment)
WHERE gt_offers.offer_key = v.offer_key
  AND gt_offers.commitment = 'project'
  AND v.commitment <> 'project';

-- ── gt_account_briefs: what the model said vs what we act on ──────────
ALTER TABLE gt_account_briefs
    -- The highest-scoring offer, untouched by the ladder rule. When it
    -- equals recommended_offer the rule changed nothing.
    ADD COLUMN IF NOT EXISTS best_fit_offer VARCHAR(60),
    -- Gap between the top two scores. Below the margin the two offers are
    -- indistinguishable and the brief says so, rather than presenting a coin
    -- toss as a decision. NULL when fewer than two offers were scored.
    ADD COLUMN IF NOT EXISTS fit_margin     NUMERIC(4,3);

COMMENT ON COLUMN gt_account_briefs.best_fit_offer IS
    'Highest-scoring offer as the model judged it. recommended_offer may differ — that is the ladder rule picking a smaller first ask among offers that fit equally well.';
COMMENT ON COLUMN gt_account_briefs.fit_margin IS
    'Top score minus second score. Under ~0.15 the two offers are not meaningfully distinguishable and the brief shows that instead of implying a clean win.';

-- Existing briefs were judged before the rule existed: whatever they
-- recommended WAS the top scorer, so that is the honest backfill. fit_margin
-- stays NULL — it was never computed, and inventing it from the stored fit
-- map here would be a guess dressed as a record. The next re-score fills it
-- in properly, and re-scoring is free (migration 211).
UPDATE gt_account_briefs
   SET best_fit_offer = recommended_offer
 WHERE recommended_offer IS NOT NULL
   AND best_fit_offer IS NULL;
