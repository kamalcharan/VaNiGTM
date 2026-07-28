-- ============================================================
-- Migration: 203_record_tags.sql
-- Purpose:   Tags on individual records, not only on the delivery.
--
-- Migration 199 put tags on the LOAD, which is right for "FTCCI Telangana" —
-- it describes a delivery, and one row per upload beats 2,913. Records
-- inherit those through load_id and always will.
--
-- But a tag is also how a user groups records AFTER the fact: "shortlist",
-- "met at the trade show", "wrong segment". That cannot live on the load,
-- because it is not true of everything in the delivery.
--
-- So: two sources of tags on a record, and the UI shows both —
--   inherited  (from gt_load_tags, via load_id)   read-only on the record
--   direct     (here)                             added and removed freely
--
-- Same gt_tags vocabulary for both, so a tenant's tag list stays one list.
-- ============================================================

-- Prerequisite check — see the same block in 202 for why a bare
-- "relation does not exist" is not good enough here.
DO $$
DECLARE missing TEXT;
BEGIN
    SELECT string_agg(t, ', ') INTO missing
    FROM   unnest(ARRAY['gt_prospects', 'gt_tags', 'gt_contacts']) AS t
    WHERE  to_regclass('public.' || t) IS NULL;

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION
            'Missing prerequisite table(s): %. gt_prospects comes from migration 196, gt_tags from 199, gt_contacts from 187 — those must really exist, not merely be recorded as applied in vn_migrations.', missing;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS gt_prospect_tags (
    prospect_id BIGINT      NOT NULL REFERENCES gt_prospects(id) ON DELETE CASCADE,
    tag_id      BIGINT      NOT NULL REFERENCES gt_tags(id) ON DELETE CASCADE,
    tenant_id   UUID        NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    created_by  UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (prospect_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_gt_prospect_tags_tag
    ON gt_prospect_tags(tenant_id, tag_id);

COMMENT ON TABLE gt_prospect_tags IS 'Tags applied directly to a company record. Separate from tags inherited through its load (gt_load_tags) — those describe the delivery, these describe the record.';

CREATE TABLE IF NOT EXISTS gt_contact_tags (
    contact_id  BIGINT      NOT NULL REFERENCES gt_contacts(id) ON DELETE CASCADE,
    tag_id      BIGINT      NOT NULL REFERENCES gt_tags(id) ON DELETE CASCADE,
    tenant_id   UUID        NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    created_by  UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (contact_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_gt_contact_tags_tag
    ON gt_contact_tags(tenant_id, tag_id);

COMMENT ON TABLE gt_contact_tags IS 'Tags applied directly to a person record.';

-- ── RLS, matching the tables they hang off ────────────────────────────

ALTER TABLE gt_prospect_tags ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY gt_prospect_tags_tenant_isolation ON gt_prospect_tags
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE gt_contact_tags ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY gt_contact_tags_tenant_isolation ON gt_contact_tags
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Finding possible duplicates AFTER import ──────────────────────────
--
-- The import blocks on dedup_key and holds clashes, but that only catches
-- what collides EXACTLY. Two rows that share a website while being different
-- businesses — 31 of FTCCI's 1,590 domain-carrying rows — are deliberately
-- NOT merged, and a user still needs to see them.
--
-- Same for name_key: it collapses only 5 of 2,913 rows, so a collision there
-- is worth a look rather than an automatic merge.

CREATE INDEX IF NOT EXISTS idx_gt_prospects_domain_dupe
    ON gt_prospects(tenant_id, is_live, domain_normalized)
    WHERE domain_normalized IS NOT NULL AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_gt_prospects_namekey_dupe
    ON gt_prospects(tenant_id, is_live, name_key)
    WHERE is_active = true;
