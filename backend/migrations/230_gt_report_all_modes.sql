-- ============================================================================
-- Migration 230: gt_report.all_modes — the full mode profile, frozen at
-- report-creation time.
--
-- Phase C2 (frontend). The blueprint's report screen renders a bar chart of
-- ALL ten failure modes ("All ten failure modes" card), not just the top
-- three that migration 229 froze. The frontend is forbidden from computing
-- any of it (Phase C2 rule: "no scoring, no band thresholds, no
-- failure-mode copy in the frontend — every string and every number comes
-- from the API"), so the full ordered profile has to come off the API.
--
-- Same reasoning as 229, extended: freeze it at capture time rather than
-- recomputing at render time, so the report, the email (Phase B) and the
-- console can never disagree about what the profile was.
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

ALTER TABLE gt_report ADD COLUMN IF NOT EXISTS all_modes JSONB;

COMMENT ON COLUMN gt_report.all_modes IS
    'Full ordered mode profile (every mode, scoreResponse()''s tie-broken order) frozen at report-creation time. Feeds the report screen''s ten-mode bar chart. Companion to top_modes (migration 229) — same freeze reasoning.';

COMMIT;

-- ── Post-apply verification ─────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'gt_report' AND column_name = 'all_modes';
