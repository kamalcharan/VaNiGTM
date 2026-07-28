-- ============================================================
-- Migration: 198_gt_contacts_provenance.sql
-- Purpose:   Give gt_contacts the same provenance and quality machinery
--            gt_prospects already has, and REPAIR normalized_name.
--
-- Design notes: documents/design-notes-prospect-universe.md §1.1, §5
--
-- User ruling (2026-07-28): a tenant uploads contacts, customers and
-- (admin) datasets. The design note is explicit that uploads need the same
-- machinery directories get:
--
--   "Dedup, freshness and validity are not universe-only concerns; they are
--    what stops a tenant's own import from quietly poisoning their pipeline."
--
-- gt_contacts (187) was built for manual entry by contact-skill, so it has
-- none of it: no load, no as-of, no quality components, no blocking key.
-- Uploading into it as-is would bypass every rule the prospect side obeys.
--
-- ── THE normalized_name DEFECT ────────────────────────────────────────
--
-- gt_contacts.normalized_name (187, inherited from ki_contacts 119) applies
-- the character-class filter BEFORE upper-casing:
--
--     REGEXP_REPLACE(<name>, '[^A-Z0-9\s]', '', 'g')   -- then UPPER(...)
--
-- so every LOWERCASE letter is deleted. Verified on PostgreSQL 16:
--
--     'John Smith'       -> 'J S'
--     'Mr. Ramesh Kumar' -> 'R K'
--     'priya sharma'     -> ''          <- entirely empty
--
-- Consequences today, not hypothetically:
--   * idx_gt_contacts_normalized_name indexes near-empty strings.
--   * contact-skill's search (queries/count-contacts.sql) matches
--     normalized_name ILIKE '%<term>%' — searching "PRIYA" against "P S"
--     never matches, so name search is broken.
--   * Any dedup built on it would collapse unrelated people: every
--     all-lowercase name normalises to the same empty string.
--
-- gt_prospects.name_key (196) does it in the right order (UPPER first) and
-- is unaffected. The legacy ki_contacts column and the ki_normalize_contact_name
-- function (143) share the defect but are consistent with each other and are
-- MFD code slated for removal — deliberately NOT touched here.
--
-- A generated column cannot be ALTERed, so it is dropped and re-added; the
-- values recompute for every existing row on the way back in.
-- ============================================================

-- ── 1. Repair normalized_name ─────────────────────────────────────────

DROP INDEX IF EXISTS idx_gt_contacts_normalized_name;

ALTER TABLE gt_contacts DROP COLUMN IF EXISTS normalized_name;

ALTER TABLE gt_contacts ADD COLUMN normalized_name TEXT
    GENERATED ALWAYS AS (
        UPPER(BTRIM(REGEXP_REPLACE(
            REGEXP_REPLACE(
                REGEXP_REPLACE(name, '^(MR|MRS|MS|DR|PROF|SRI|SMT)\.?\s+', '', 'i'),
                '[^A-Za-z0-9\s]', '', 'g'),
            '\s+', ' ', 'g')))
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_gt_contacts_normalized_name
    ON gt_contacts(tenant_id, is_live, normalized_name) WHERE is_active = true;

COMMENT ON COLUMN gt_contacts.normalized_name IS 'Uppercased, title- and punctuation-stripped name for search and fuzzy matching. Repaired in 198: the 187 expression filtered [^A-Z0-9\s] BEFORE upper-casing and deleted every lowercase letter.';

-- ── 2. Provenance: a contact upload is a load like any other ──────────

ALTER TABLE gt_contacts ADD COLUMN IF NOT EXISTS load_id       BIGINT;
ALTER TABLE gt_contacts ADD COLUMN IF NOT EXISTS source_as_of  DATE;

DO $$ BEGIN
    ALTER TABLE gt_contacts
        ADD CONSTRAINT gt_contacts_load_fk
        FOREIGN KEY (load_id) REFERENCES gt_source_loads(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_gt_contacts_load
    ON gt_contacts(load_id) WHERE load_id IS NOT NULL;

COMMENT ON COLUMN gt_contacts.load_id IS 'The upload/delivery this contact arrived in. NULL for manually created contacts.';
COMMENT ON COLUMN gt_contacts.source_as_of IS 'How current the SOURCE claims this row is — inherited from gt_source_loads.as_of unless the row states its own. Freshness is a scored quality component (design note §5), not a display field.';

-- ── 3. Quality components, same shape as gt_prospects ─────────────────

ALTER TABLE gt_contacts ADD COLUMN IF NOT EXISTS completeness   NUMERIC(4,3);
ALTER TABLE gt_contacts ADD COLUMN IF NOT EXISTS validity       NUMERIC(4,3);
ALTER TABLE gt_contacts ADD COLUMN IF NOT EXISTS reject_reasons JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN gt_contacts.completeness IS 'Share of tracked fields populated. Fill rate is NOT quality — see validity.';
COMMENT ON COLUMN gt_contacts.validity IS 'Share of populated fields passing validation. The provider CSV profiled for this design read 100%% populated on revenue while 60 of 119 values were the literal string ''undefined+''.';
COMMENT ON COLUMN gt_contacts.reject_reasons IS 'Per-field problems carried forward from staging. Surfaced to the user, never swallowed (CLAUDE.md rule 12).';

-- ── 4. Blocking key for person dedup ──────────────────────────────────
--
-- Companies block on domain, else name_key|pin (gt_prospects). People need
-- their own key, and it cannot be email: email lives in gt_contact_channels,
-- one row per channel, so it is not reachable from a generated column here.
--
-- So person_key is the NAME + EMPLOYER blocking key, and email matching runs
-- as a second pass against gt_contact_channels at processing time. Blocking
-- on name alone would collide every "Ramesh Kumar" in the country; pairing it
-- with the employer domain (falling back to the company name) keeps the block
-- tight enough to resolve inside.
--
-- The normalisation is INLINED rather than referencing normalized_name: a
-- generated column may not reference another generated column.

ALTER TABLE gt_contacts DROP COLUMN IF EXISTS person_key;

ALTER TABLE gt_contacts ADD COLUMN person_key TEXT
    GENERATED ALWAYS AS (
        UPPER(BTRIM(REGEXP_REPLACE(
            REGEXP_REPLACE(
                REGEXP_REPLACE(name, '^(MR|MRS|MS|DR|PROF|SRI|SMT)\.?\s+', '', 'i'),
                '[^A-Za-z0-9\s]', '', 'g'),
            '\s+', ' ', 'g')))
        || '|' ||
        COALESCE(
            NULLIF(LOWER(BTRIM(company_domain)), ''),
            UPPER(BTRIM(REGEXP_REPLACE(
                REGEXP_REPLACE(COALESCE(company_name, ''), '[^A-Za-z0-9\s]', ' ', 'g'),
                '\s+', ' ', 'g'))),
            '')
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_gt_contacts_person_key
    ON gt_contacts(tenant_id, is_live, person_key) WHERE is_active = true;

COMMENT ON COLUMN gt_contacts.person_key IS 'Blocking key for person dedup: normalised name | employer (domain, else company name). Candidates inside a block are resolved on name similarity and on email via gt_contact_channels — this narrows the search, it does not decide identity.';
