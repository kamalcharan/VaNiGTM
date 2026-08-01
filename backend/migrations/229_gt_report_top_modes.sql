-- ============================================================================
-- Migration 229: gt_report.top_modes — freeze the ordered top-three at
-- report-creation time.
--
-- Task A2, item 0 (Charan, 2026-08-01). scoreResponse()'s tie-break was
-- already deterministic run-to-run (JS stable sort over a JSON-order-
-- preserved structure), but relied on definition.modes' incidental array
-- order for ties rather than a stated rule — fixed in scoring.ts
-- (composite_weight desc, then mode key asc).
--
-- Separately: gt_assessment_response.top_modes is written once at /complete
-- and never touched again. Before this migration, the fallback narrative
-- (and, later, Phase B's email) would have recomputed top_modes fresh via
-- scoreResponse() at their own render time instead of reading that stored
-- value — fine today (pure function, same inputs), but two independent call
-- sites recomputing the same "which three modes, in what order" instead of
-- reading one persisted value is exactly the kind of thing that quietly
-- drifts the day either call site's inputs change (a definition edited in
-- place, a tie-break rule revised) between when the report was generated
-- and when the email is sent. Freezing the ordered top-three onto gt_report
-- itself, at the moment the report is created, removes that entire class of
-- disagreement: report and email both read the one column, neither
-- recomputes.
--
-- Idempotent; safe to re-run. Apply manually: cd backend && npm run db:migrate
-- ============================================================================

DO $$
DECLARE missing TEXT;
BEGIN
    SELECT string_agg(t, ', ') INTO missing
    FROM   unnest(ARRAY['gt_report']) AS t
    WHERE  to_regclass('public.' || t) IS NULL;

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'Missing prerequisite table(s): %', missing;
    END IF;
END $$;

BEGIN;

ALTER TABLE gt_report ADD COLUMN IF NOT EXISTS top_modes JSONB;

COMMENT ON COLUMN gt_report.top_modes IS
    'Ordered top-N scored modes (scoreResponse()''s tie-broken order), frozen at report-creation time by assessment-skill''s captureLead. Report rendering and any future email dispatch both read this column — neither recomputes — so they can never disagree.';

COMMIT;

-- ── Post-apply verification ─────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'gt_report' AND column_name = 'top_modes';
