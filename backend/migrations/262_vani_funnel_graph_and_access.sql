-- ============================================================================
-- Migration 262: the landing's audit + graph, and access requests
--
-- Spec: documents/design-notes-landing.md (B1, and schema option (a)).
-- Approved by Charan, 2026-09-30 ("262 is ok"; option (a): "ok").
-- Apply on the VPS with `docker exec vani-backend node dist/migrate.js`
-- (DEPLOY.md §4) — never by pasting SQL.
--
-- ── WHAT IT CHANGES ────────────────────────────────────────────────────────
--
-- 1. vani_anon_site_read gains two columns (table from 261, RLS disabled by
--    design):
--      audit  jsonb   the five crawlability checks the read already measures
--                     on the static homepage: { present: [...], missing: [...] }
--      graph  jsonb   what the homepage says, as a graph:
--                     { status: 'read', nodes: [...], edges: [...], truncated }
--                     or { status: 'failed', failure: '<the real reason>' }
--    Both NULL on reads made before this migration; the page then simply
--    does not show those blocks.
--
-- 2. gt_lead_event.assessment_response_id loses NOT NULL. Until now a lead
--    could only have a timeline if it came from an assessment. An access
--    request from vani.vikuna.io is a lead with no assessment behind it; its
--    one event ('access_requested') carries the site read and the exact
--    consent words. The foreign key stays; existing rows are untouched.
--
-- No new table, no new policy. Guarded and idempotent.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.vani_anon_site_read') IS NULL THEN
    RAISE EXCEPTION '[262] vani_anon_site_read is missing — apply 261 first';
  END IF;
  IF to_regclass('public.gt_lead_event') IS NULL THEN
    RAISE EXCEPTION '[262] gt_lead_event is missing — apply 228 first';
  END IF;
END $$;

BEGIN;

ALTER TABLE vani_anon_site_read ADD COLUMN IF NOT EXISTS audit jsonb;
ALTER TABLE vani_anon_site_read ADD COLUMN IF NOT EXISTS graph jsonb;

COMMENT ON COLUMN vani_anon_site_read.audit IS
  'Crawlability checks on the static homepage: { present: [...], missing: [...] } (262).';
COMMENT ON COLUMN vani_anon_site_read.graph IS
  'The homepage as a knowledge graph: { status: read, nodes, edges, truncated } or { status: failed, failure } (262).';

ALTER TABLE gt_lead_event ALTER COLUMN assessment_response_id DROP NOT NULL;

COMMENT ON COLUMN gt_lead_event.assessment_response_id IS
  'The assessment this event belongs to, when there is one. NULL for leads that did not come from an assessment, e.g. access requests from vani.vikuna.io (262).';

COMMIT;
