-- ============================================================
-- Migration: 213_brief_human_offer.sql
-- Purpose:   Stop a human's ruling from overwriting the agent's, so the
--            disagreement between them survives — and can be learned from.
--
-- Plan: documents/design-notes-research.md §10.
--
-- ── WHAT WAS BEING DESTROYED ──────────────────────────────────────────
--
-- decide_brief did this:
--
--     recommended_offer = COALESCE($offer_key, recommended_offer)
--
-- So the moment a reviewer approved a company under a DIFFERENT offer than
-- the agent proposed, the agent's proposal was gone. The single most useful
-- signal the pilot produces — "the agent said CDO, the human said the audit,
-- and here is why" — was being overwritten by the correction itself.
--
-- After this, `recommended_offer` is the agent's word and never changes
-- after judgement; `human_offer` is the reviewer's. Reads take
-- COALESCE(human_offer, recommended_offer) as the effective offer. Same
-- posture as best_fit_offer vs recommended_offer in migration 212: a
-- judgement is a record, not a mutable field.
--
-- ── WHY IT MATTERS BEYOND BOOKKEEPING ─────────────────────────────────
--
-- These pairs are what the fit prompt now shows the model as worked examples
-- (corrections.ts). At a hundred companies that is demonstration, not
-- statistics — and the prompt says so. But a reviewer who has moved three
-- companies off CDO onto the audit has told us something no amount of
-- prompt-writing would have.
-- ============================================================

DO $$ BEGIN
    IF to_regclass('public.gt_account_briefs') IS NULL THEN
        RAISE EXCEPTION
            'Missing prerequisite table gt_account_briefs — it comes from migration 207.';
    END IF;
END $$;

ALTER TABLE gt_account_briefs
    ADD COLUMN IF NOT EXISTS human_offer VARCHAR(60);

COMMENT ON COLUMN gt_account_briefs.human_offer IS
    'The offer a reviewer settled on, when it differs from the agent''s. NULL means they did not reassign. Effective offer = COALESCE(human_offer, recommended_offer).';

COMMENT ON COLUMN gt_account_briefs.recommended_offer IS
    'What the agent proposed. Never rewritten by a human decision — see human_offer.';

-- Existing decided rows: we cannot tell whether recommended_offer was the
-- agent's or a reviewer's overwrite, because the overwrite left no trace.
-- So human_offer stays NULL rather than guessing. Those rows read as
-- "reviewer agreed", which is wrong for however many were reassigned — but a
-- fabricated disagreement would go straight into the fit prompt as a worked
-- example, and a made-up lesson is worse than a missing one.

-- The corrections query: the most recent rulings for one tenant and
-- environment. Small result (10 rows) off a table that grows with every
-- company researched.
CREATE INDEX IF NOT EXISTS idx_gt_account_briefs_decided
    ON gt_account_briefs(tenant_id, is_live, decided_at DESC)
    WHERE decided_at IS NOT NULL;
