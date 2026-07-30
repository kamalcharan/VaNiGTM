-- ============================================================
-- Migration: 224_contact_evidence.sql
-- Purpose:   Every channel carries the URL it came from — R-C1 as data.
--
-- Plan:      documents/POA-journey-campaign.md Phase 2.
-- Design:    documents/design-notes-journey-campaign.md §4.
--
-- ── WHY THIS MIGRATION IS SMALL ───────────────────────────────────────
--
-- The Phase-2 plumbing was almost all done already:
--   · gt_contacts.prospect_id                                    (mig 196)
--   · gt_contact_assignments.contact_id → gt_contacts            (mig 187)
--   · gt_account_briefs.named_contacts JSONB                     (mig 207)
--   · gt_journeys.contact_id                                     (mig 222)
--
-- What was missing is the FACT the design leans on hardest: every channel
-- knows the URL where it was found. Without that, R-C1 — "no invented
-- people" — is a promise the schema cannot enforce and R-S1 — "every
-- prospect claim traces to evidence" — has a blind spot: a person's email
-- address is a claim about them too, and "info@" guessed on the day of the
-- send is exactly the mistake that cannot be walked back.
--
-- ── WHY source_url ON THE CHANNEL AND NOT THE CONTACT ─────────────────
--
-- A contact can have several channels found on different pages — a name on
-- /leadership, an email on /contact, a LinkedIn URL in a filing. The
-- evidence belongs to the channel that carries the address, not to the
-- person as a whole. Storing it on the contact would flatten three real
-- URLs into one arbitrary winner.
--
-- ── WHY 'research' JOINS THE source ENUM AS DATA, NOT A CHECK ─────────
--
-- gt_contacts.source is a documented VARCHAR without a CHECK constraint
-- (mig 187), on purpose: new provenances arrive whenever a new source
-- lands. So this migration adds nothing to the schema — it just documents
-- 'research' as the tag the promote-from-brief flow writes.
-- ============================================================

DO $$
DECLARE missing TEXT;
BEGIN
    SELECT string_agg(t, ', ') INTO missing
    FROM   unnest(ARRAY['gt_contacts', 'gt_contact_channels', 'gt_account_briefs']) AS t
    WHERE  to_regclass('public.' || t) IS NULL;

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'Missing prerequisite table(s): %', missing;
    END IF;
END $$;


-- ────────────────────────────────────────────────────────────────────────
-- 1. gt_contact_channels.source_url — WHERE the address was found
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE gt_contact_channels
    ADD COLUMN IF NOT EXISTS source_url TEXT;

COMMENT ON COLUMN gt_contact_channels.source_url IS
    'The page (or filing / brief evidence line) the address was pulled from. NULL on rows entered manually — a human is the evidence. Non-NULL on rows the research flow promoted from a brief.';


-- ────────────────────────────────────────────────────────────────────────
-- 2. gt_contacts.brief_id — WHICH brief promoted this person
--
-- Nullable, because contacts arrive from many places (uploads, manual
-- entry, provider) and only some ride in from a brief. When it IS set,
-- it names the exact row whose named_contacts entry became this person —
-- so a deleted brief cannot silently orphan the provenance.
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE gt_contacts
    ADD COLUMN IF NOT EXISTS brief_id BIGINT;

DO $$ BEGIN
    ALTER TABLE gt_contacts
        ADD CONSTRAINT gt_contacts_brief_fk
        FOREIGN KEY (brief_id) REFERENCES gt_account_briefs(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_gt_contacts_brief
    ON gt_contacts(brief_id) WHERE brief_id IS NOT NULL;

COMMENT ON COLUMN gt_contacts.brief_id IS
    'The brief whose named_contacts entry became this contact. NULL for contacts entered by hand, uploaded, or promoted by any other path.';


-- ── Post-apply verification ─────────────────────────────────────────────
-- SELECT count(*) FROM gt_contact_channels WHERE source_url IS NOT NULL;
-- SELECT count(*) FROM gt_contacts WHERE brief_id IS NOT NULL AND source='research';
