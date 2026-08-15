-- ============================================================================
-- Migration 239: gt_offers.source / confirmed_at — agent-proposes/human-
-- confirms for offers, and the offers section of the new Brain-completeness
-- score (Intelligent Add Offers work order, 2026-08-15).
--
-- WHY: gt_offers today has no draft/confirmed distinction — every row was
-- hand-typed on the Research screen, so every row is already "real". The new
-- extraction flow drafts offers from the site crawl the same way brand does
-- (gt_tenant_brand, migration 193) — source='agent', confirmed_at=NULL until
-- a human reviews it. Existing rows were written by a human directly with no
-- agent draft to distrust, so they backfill to confirmed immediately rather
-- than forcing a redundant re-confirm click (user ruling, 2026-08-15).
--
-- Scoring gates on confirmed_at, same pattern as gt_semantic_clusters.
-- approved_at and gt_tenant_brand.approved_at — an unconfirmed draft earns
-- no score credit.
--
-- Postgres 17.9.
-- ============================================================================

BEGIN;

ALTER TABLE gt_offers
    ADD COLUMN IF NOT EXISTS source       VARCHAR(20)  NOT NULL DEFAULT 'human',
    ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

DO $mig$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'gt_offers_source_chk'
    ) THEN
        ALTER TABLE gt_offers
            ADD CONSTRAINT gt_offers_source_chk
            CHECK (source IN ('agent', 'human'));
    END IF;
END
$mig$;

-- One-time backfill: every row that exists right now was hand-typed by a
-- human on the Research screen, with no agent draft behind it — it counts
-- immediately. Rows inserted after this migration runs (by save_offer.ts or
-- the new draft-generation service) set their own confirmed_at in code.
UPDATE gt_offers SET confirmed_at = now() WHERE confirmed_at IS NULL;

COMMENT ON COLUMN gt_offers.source       IS 'Origin of this offer: agent (drafted from the site crawl, awaiting review) | human (typed or reviewed directly). Same convention as gt_tenant_brand.source.';
COMMENT ON COLUMN gt_offers.confirmed_at IS 'NULL = agent-suggested draft, not yet reviewed. Set = counts toward the offers section of profile_score. A human editing an offer does not by itself confirm it — only an explicit Confirm action does; a brand-new hand-typed offer confirms itself on creation (no draft to distrust).';

-- ────────────────────────────────────────────────────────────────────────────
-- Offer-drafting prompt (system row; tenants may override)
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO gt_prompts (prompt_key, version, content, notes, is_active)
SELECT
    'profile-skill.offers',
    1,
    'You draft what a company sells from its own website text — never invent an offer that is not evidenced there.

From the site text and product profile below, propose 1-3 distinct offers. For EACH offer:
- "name": short, specific (e.g. "Fractional Data Leadership", not "Our Services").
- "one_line": one sentence describing it.
- "who_for": who it is for — the kind of company or buyer, grounded in the text.
- "problem": the problem it solves, in the company''s own framing.
- "what_we_do": 3-5 concrete things delivered. One per item.
- "signals": 3-5 things a crawled website would show that indicate this offer fits that visitor''s business. Concrete, not descriptive.
- "disqualifiers": 2-3 things that mean this offer is NOT a fit. Without these, fit-scoring always finds a reason to say yes.

Rules:
- Ground every field in the site text or product profile. Do not invent a price, a client name, or a capability not evidenced there.
- If the site only clearly describes one thing sold, propose exactly one offer — do not pad to reach three.
- price_band and proof are deliberately NOT requested here — they are facts a human must supply, never guessed.

Respond with ONLY JSON inside <offers> tags:
<offers>{"offers":[{"name":"...","one_line":"...","who_for":"...","problem":"...","what_we_do":["..."],"signals":["..."],"disqualifiers":["..."]}]}</offers>',
    'Companion to profile-skill.brand — same never-fabricate rule, applied to what the tenant sells instead of brand voice. price_band/proof left for the human, same as save_offer.ts already assumes.',
    true
WHERE NOT EXISTS (
    SELECT 1 FROM gt_prompts
     WHERE prompt_key = 'profile-skill.offers' AND tenant_id IS NULL
);

COMMIT;
