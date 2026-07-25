-- ============================================================================
-- Migration 187: Phase 0 Stage 0.3 — GTM-native contact layer
--
-- Replaces the KI-Prime (MFD) contact layer with a GTM-shaped one:
--
--   gt_contacts          — prospect/contact identity (job title, company,
--                          linkedin, source provenance, score — NO financial
--                          snapshot baggage)
--   gt_contact_channels  — communication channels (email/mobile/whatsapp/
--                          linkedin/…), same semantics as before
--
-- Data is COPIED from ki_contacts / ki_contact_channels WITH IDS PRESERVED,
-- so gt_contact_assignments.contact_id values stay valid — its FK is
-- re-pointed to gt_contacts(id) at the end of this migration.
--
-- Order of operations (single transaction):
--   1. CREATE gt_contacts + gt_contact_channels
--   2. COPY rows from ki_* preserving ids (legacy is_client preserved in raw)
--   3. setval() both sequences past the copied max ids
--   4. Re-point gt_contact_assignments.contact_id FK → gt_contacts(id)
--   5. RLS + updated_at trigger + indexes
--
-- ki_contacts / ki_contact_channels / ki_contact_snapshot* are NOT dropped
-- here — that happens in migration 188 AFTER the application code re-point
-- (Stage 0.3/0.4) is deployed. Until then old tables sit unused but intact.
--
-- Apply manually: cd backend && npm run db:migrate
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. TABLE: gt_contacts
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_contacts (
    id              BIGSERIAL    PRIMARY KEY,
    tenant_id       UUID         NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    is_live         BOOLEAN      NOT NULL DEFAULT false,
    is_active       BOOLEAN      NOT NULL DEFAULT true,

    -- Identity
    prefix          VARCHAR(20),                 -- free text; no MFD honorific CHECK
    name            VARCHAR(255) NOT NULL,
    normalized_name TEXT GENERATED ALWAYS AS (
        UPPER(
            REGEXP_REPLACE(
                REGEXP_REPLACE(
                    REGEXP_REPLACE(
                        REGEXP_REPLACE(name,
                            '^(MR|MRS|MS|DR|PROF|SRI|SMT)\.?\s+', '', 'i'),
                        '[^A-Z0-9\s]', '', 'g'),
                    '\s+', ' ', 'g'),
                '^\s+|\s+$', '', 'g')
        )
    ) STORED,

    -- GTM fields
    job_title       VARCHAR(200),
    company_name    VARCHAR(255),
    company_domain  VARCHAR(255),
    linkedin_url    VARCHAR(500),
    location        VARCHAR(200),

    -- Provenance (universal-connector contract: where did this contact come from)
    source          VARCHAR(40)  NOT NULL DEFAULT 'manual',
    -- 'manual' | 'upload' | 'byo:<provider>' | 'platform:<provider>' | 'converted'
    external_ref    TEXT,                        -- id in the source system, if any
    raw             JSONB        NOT NULL DEFAULT '{}'::jsonb,
    -- raw payload from the source (CSV row / provider response) for audit

    -- Scoring (Scoring Agent writes here; composite persona-match score)
    score           INTEGER      NOT NULL DEFAULT 0,

    created_by      UUID,                        -- vn_users.id (not enforced — cross-schema)
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  gt_contacts            IS 'GTM prospect/contact identity layer. Replaces ki_contacts (migration 187).';
COMMENT ON COLUMN gt_contacts.source     IS 'Provenance: manual | upload | byo:<provider> | platform:<provider> | converted.';
COMMENT ON COLUMN gt_contacts.raw        IS 'Raw source payload (CSV row / provider JSON) for audit. Legacy ki_is_client flag preserved here on migrated rows.';
COMMENT ON COLUMN gt_contacts.score      IS 'Composite ICP/persona match score, written by the Scoring Agent.';
COMMENT ON COLUMN gt_contacts.normalized_name IS 'Auto-computed: uppercase, strip title/punctuation — used for fuzzy duplicate detection.';

CREATE INDEX IF NOT EXISTS idx_gt_contacts_tenant_live
    ON gt_contacts(tenant_id, is_live) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_gt_contacts_normalized
    ON gt_contacts(tenant_id, is_live, normalized_name) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_gt_contacts_company_domain
    ON gt_contacts(tenant_id, is_live, company_domain) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_gt_contacts_score
    ON gt_contacts(tenant_id, is_live, score DESC) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_gt_contacts_name_search
    ON gt_contacts USING gin(to_tsvector('english', name));

-- ────────────────────────────────────────────────────────────────────────────
-- 2. TABLE: gt_contact_channels
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_contact_channels (
    id              BIGSERIAL    PRIMARY KEY,
    contact_id      BIGINT       NOT NULL REFERENCES gt_contacts(id) ON DELETE CASCADE,
    tenant_id       UUID         NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    is_live         BOOLEAN      NOT NULL DEFAULT false,
    is_active       BOOLEAN      NOT NULL DEFAULT true,

    channel_type    VARCHAR(50)  NOT NULL CHECK (
        channel_type IN ('email', 'mobile', 'whatsapp', 'instagram', 'twitter', 'linkedin', 'other')
    ),
    channel_value   VARCHAR(255) NOT NULL,
    channel_subtype VARCHAR(50)  NOT NULL DEFAULT 'personal' CHECK (
        channel_subtype IN ('personal', 'work', 'other')
    ),
    is_primary      BOOLEAN      NOT NULL DEFAULT false,

    -- Enrichment provenance (which connector/provider found this channel)
    source          VARCHAR(40)  NOT NULL DEFAULT 'manual',
    verified_at     TIMESTAMPTZ,

    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT uq_gt_contact_channel UNIQUE (contact_id, channel_type, channel_value, is_live)
);

COMMENT ON TABLE  gt_contact_channels        IS 'Communication channels per contact. Replaces ki_contact_channels (migration 187).';
COMMENT ON COLUMN gt_contact_channels.source IS 'Which source/provider produced this channel (enrichment waterfall provenance).';

CREATE INDEX IF NOT EXISTS idx_gt_contact_channels_contact
    ON gt_contact_channels(contact_id, is_live) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_gt_contact_channels_tenant
    ON gt_contact_channels(tenant_id, is_live) WHERE is_active = true;

-- Only one primary per contact per channel_type
CREATE UNIQUE INDEX IF NOT EXISTS uq_gt_contact_primary_channel
    ON gt_contact_channels(contact_id, channel_type, is_live)
    WHERE is_primary = true AND is_active = true;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. COPY data from ki_contacts / ki_contact_channels (ids preserved)
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO gt_contacts
    (id, tenant_id, is_live, is_active, prefix, name,
     source, raw, created_by, created_at, updated_at)
SELECT
    c.id, c.tenant_id, c.is_live, c.is_active, c.prefix, c.name,
    'manual',
    jsonb_build_object('ki_is_client', c.is_client),   -- preserve legacy flag for audit
    c.created_by, c.created_at, c.updated_at
FROM ki_contacts c
WHERE EXISTS (SELECT 1 FROM vn_tenants t WHERE t.id = c.tenant_id)   -- skip orphans (old table had no FK)
ON CONFLICT (id) DO NOTHING;

INSERT INTO gt_contact_channels
    (id, contact_id, tenant_id, is_live, is_active,
     channel_type, channel_value, channel_subtype, is_primary, created_at)
SELECT
    ch.id, ch.contact_id, ch.tenant_id, ch.is_live, ch.is_active,
    ch.channel_type, ch.channel_value, ch.channel_subtype, ch.is_primary, ch.created_at
FROM ki_contact_channels ch
WHERE EXISTS (SELECT 1 FROM gt_contacts gc WHERE gc.id = ch.contact_id)
ON CONFLICT (id) DO NOTHING;

-- Advance sequences past copied ids
SELECT setval('gt_contacts_id_seq',         COALESCE((SELECT MAX(id) FROM gt_contacts), 0) + 1, false);
SELECT setval('gt_contact_channels_id_seq', COALESCE((SELECT MAX(id) FROM gt_contact_channels), 0) + 1, false);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Re-point gt_contact_assignments.contact_id FK → gt_contacts(id)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE gt_contact_assignments
    DROP CONSTRAINT IF EXISTS gt_contact_assignments_contact_id_fkey;

ALTER TABLE gt_contact_assignments
    ADD CONSTRAINT gt_contact_assignments_contact_id_fkey
    FOREIGN KEY (contact_id) REFERENCES gt_contacts(id) ON DELETE CASCADE;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. RLS (house pattern) + updated_at trigger
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE gt_contacts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE gt_contact_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gt_contacts_tenant_isolation         ON gt_contacts;
DROP POLICY IF EXISTS gt_contact_channels_tenant_isolation ON gt_contact_channels;

CREATE POLICY gt_contacts_tenant_isolation ON gt_contacts
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY gt_contact_channels_tenant_isolation ON gt_contact_channels
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

DROP TRIGGER IF EXISTS trg_gt_contacts_updated_at ON gt_contacts;
CREATE TRIGGER trg_gt_contacts_updated_at
    BEFORE UPDATE ON gt_contacts
    FOR EACH ROW EXECUTE FUNCTION vn_set_updated_at();

COMMIT;

-- ── Post-apply verification ─────────────────────────────────────────────────
-- SELECT (SELECT COUNT(*) FROM ki_contacts)         AS ki_contacts,
--        (SELECT COUNT(*) FROM gt_contacts)         AS gt_contacts,
--        (SELECT COUNT(*) FROM ki_contact_channels) AS ki_channels,
--        (SELECT COUNT(*) FROM gt_contact_channels) AS gt_channels;
-- Expect gt counts == ki counts (minus any orphaned tenant rows).
--
-- SELECT conname, confrelid::regclass FROM pg_constraint
--  WHERE conrelid = 'gt_contact_assignments'::regclass AND contype = 'f';
-- Expect contact_id FK → gt_contacts.
