-- ============================================================================
-- Migration 231: gt_lead.contact_id — bridge VaNi leads into gt_contacts
--
-- Phase C3 decision (Charan, 2026-08-01): a VaNi lead and a GTM contact are
-- the same PERSON, so a captured lead should become a gt_contacts row and
-- pick up channels, tags, campaigns, sequences and journeys for free.
-- Prospects stay separate — gt_prospects is company-level (domain, website,
-- employees_band, revenue_band) and a lead is not a company. That half of
-- G1's ruling 5 stands.
--
-- WHY gt_lead SURVIVES RATHER THAN BEING REPLACED
-- gt_contacts cannot hold what makes a VaNi lead a VaNi lead: the band, the
-- health score, the twelve answers, the mode exposures, the report token.
-- Those are assessment facts, not contact facts, and putting them on
-- gt_contacts would push assessment-specific columns onto a table shared by
-- every other GTM path. So gt_lead remains the assessment record and points
-- at its contact; the contact is the outreach surface.
--
-- WHY THE FK LIVES HERE, NOT ON gt_contacts
-- VaNi owns this relationship. A nullable contact_id on gt_lead keeps
-- gt_contacts free of any VaNi-specific column, which matters because
-- gt_contacts is shared infrastructure and this is one consumer of it.
-- Nullable on purpose: the bridge is best-effort (see assessment.agent.ts) —
-- a lead is never lost because contact creation had a problem.
--
-- Idempotent; safe to re-run. Apply manually: cd backend && npm run db:migrate
-- ============================================================================

DO $$
DECLARE missing TEXT;
BEGIN
    SELECT string_agg(t, ', ') INTO missing
    FROM   unnest(ARRAY['gt_lead', 'gt_contacts', 'gt_tags', 'gt_contact_tags']) AS t
    WHERE  to_regclass('public.' || t) IS NULL;

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'Missing prerequisite table(s): %', missing;
    END IF;
END $$;

BEGIN;

ALTER TABLE gt_lead ADD COLUMN IF NOT EXISTS contact_id BIGINT REFERENCES gt_contacts(id);

CREATE INDEX IF NOT EXISTS idx_gt_lead_contact ON gt_lead(contact_id) WHERE contact_id IS NOT NULL;

COMMENT ON COLUMN gt_lead.contact_id IS
    'The gt_contacts row this lead was bridged to at capture time. Nullable — the bridge is best-effort and a lead is never lost because contact creation failed. gt_lead keeps the assessment facts (band, score, answers, report); the contact carries channels, tags and outreach.';

-- Tag applied to every bridged contact, so /contacts can filter to
-- assessment-sourced people without knowing anything about VaNi. Tenant-
-- scoped (gt_tags allows tenant_id NULL for platform tags; this is not one).
-- gt_tags.slug is GENERATED ALWAYS from label (lower, non-alphanumerics ->
-- space, collapsed). So the slug for label 'VaNi assessment' is
-- 'vani assessment' — with a SPACE. A hyphenated slug is not reachable
-- through this table, and code matching on 'vani-assessment' would silently
-- match nothing. Insert label only; never write slug.
INSERT INTO gt_tags (tenant_id, label)
SELECT t.id, 'VaNi assessment'
FROM vn_tenants t
WHERE t.slug = 'vikuna-consulting'
  AND NOT EXISTS (
    SELECT 1 FROM gt_tags g WHERE g.tenant_id = t.id AND g.slug = 'vani assessment'
  );

COMMIT;

-- ── Post-apply verification ─────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns WHERE table_name='gt_lead' AND column_name='contact_id';
-- SELECT slug, label FROM gt_tags WHERE slug = 'vani assessment';
