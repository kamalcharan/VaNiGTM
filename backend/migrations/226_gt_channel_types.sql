-- ============================================================
-- Migration: 226_gt_channel_types.sql
-- Purpose:   Master data for channel types — Email, WhatsApp, LinkedIn,
--            Blog, PlayBook, Survey, UseCase Nurturing, Facebook, Reddit,
--            Twitter, Instagram. The set of media/surfaces the product
--            will weave in over time.
--
-- Ruling:    User, 2026-07-31 — "create master data for channels ... we
--            will effectively woven it into product as we move forward".
--
-- ── WHY THIS TABLE, WHY NOW ───────────────────────────────────────────
--
-- The compose surface needs a channel picker with a stable set of codes.
-- gt_content_kinds (migration 225) carries `channel` as a free VARCHAR —
-- fine for the D7 registry pattern, wrong for the pick-list the reviewer
-- sees every time they log a send. A misspelled 'linked_in' in one row
-- and 'linkedin' in the next silently splits analytics.
--
-- Master data fixes that: a small, curated table of channel codes with
-- their human labels and a KIND grouping. A story's channel is a FK, not
-- a string.
--
-- ── WHY THE NAME IS gt_channel_types AND NOT gt_channels ──────────────
--
-- gt_channels already exists — tenant-scoped outbound connections (SMTP
-- creds, WhatsApp Business API endpoints). Two different concepts:
--   · gt_channels       = a specific tenant's outbound wire
--   · gt_channel_types  = the class of medium/surface (email, blog, …)
--
-- Later, gt_channels.channel_type could FK here to enforce that every
-- outbound connection resolves to a known type. Not doing that in this
-- migration — the tenant channel table already ships and refactoring it
-- is a separate move.
--
-- ── WHY KIND MATTERS ──────────────────────────────────────────────────
--
-- The compose UI branches by kind, not by code:
--   · direct    — 1:1 send, needs a recipient + copy (email, whatsapp, linkedin)
--   · broadcast — public post, no per-recipient copy (blog, facebook,
--                 reddit, twitter, instagram)
--   · asset     — a reusable artifact that rides ATTACHED to a direct
--                 send (playbook, survey, usecase_nurture)
--
-- Storing kind here means the frontend does not hardcode "these codes
-- are direct, those are broadcast" — one query, one truth.
--
-- ── WHY channel_type_id ON gt_journey_stories IS NULLABLE ─────────────
--
-- Migration 225 already shipped stories with kind_key='email' as the
-- default. Existing rows have no channel_type_id. Making it NOT NULL
-- would break the fresh-database path (a story insert without the new
-- field). Application-layer requires it on new writes; the schema stays
-- backward-compatible.
-- ============================================================

DO $$
DECLARE missing TEXT;
BEGIN
    SELECT string_agg(t, ', ') INTO missing
    FROM   unnest(ARRAY['vn_tenants', 'gt_journey_stories']) AS t
    WHERE  to_regclass('public.' || t) IS NULL;

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'Missing prerequisite table(s): %', missing;
    END IF;
END $$;


-- ────────────────────────────────────────────────────────────────────────
-- 1. gt_channel_types — the master list
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_channel_types (
    id           SERIAL      PRIMARY KEY,
    code         VARCHAR(40) NOT NULL UNIQUE,
    name         VARCHAR(80) NOT NULL,
    kind         VARCHAR(12) NOT NULL,
    is_active    BOOLEAN     NOT NULL DEFAULT true,
    sort_order   INT         NOT NULL DEFAULT 100,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_gt_channel_type_kind
        CHECK (kind IN ('direct', 'broadcast', 'asset'))
);

CREATE INDEX IF NOT EXISTS idx_gt_channel_types_active
    ON gt_channel_types(is_active, sort_order)
    WHERE is_active = true;

-- Seed. ON CONFLICT so re-runs are safe and a user override to a display
-- name is preserved (a later migration should NOT overwrite it — if a name
-- changes here in a future migration, do it explicitly with UPDATE, not
-- via re-seeding).
INSERT INTO gt_channel_types (code, name, kind, sort_order) VALUES
  ('email',            'Email',              'direct',    10),
  ('whatsapp',         'WhatsApp',           'direct',    20),
  ('linkedin',         'LinkedIn',           'direct',    30),
  ('blog',             'Blog',               'broadcast', 40),
  ('facebook',         'Facebook',           'broadcast', 50),
  ('twitter',          'Twitter',            'broadcast', 60),
  ('instagram',        'Instagram',          'broadcast', 70),
  ('reddit',           'Reddit',             'broadcast', 80),
  ('playbook',         'PlayBook',           'asset',     90),
  ('survey',           'Survey',             'asset',    100),
  ('usecase_nurture',  'UseCase Nurturing',  'asset',    110)
ON CONFLICT (code) DO NOTHING;


-- ────────────────────────────────────────────────────────────────────────
-- 2. gt_journey_stories.channel_type_id — the FK
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE gt_journey_stories
    ADD COLUMN IF NOT EXISTS channel_type_id INT;

DO $$ BEGIN
    ALTER TABLE gt_journey_stories
        ADD CONSTRAINT gt_journey_stories_channel_type_fk
        FOREIGN KEY (channel_type_id) REFERENCES gt_channel_types(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_gt_journey_stories_channel_type
    ON gt_journey_stories(channel_type_id)
    WHERE channel_type_id IS NOT NULL;

-- Best-effort backfill from the existing kind_key. Only rows where the
-- kind_key matches a known channel code get filled; the rest stay NULL
-- for the app layer to prompt on. Rule 12: NOT guessing on ambiguous kinds.
UPDATE gt_journey_stories s
   SET channel_type_id = ct.id
  FROM gt_channel_types ct
 WHERE s.channel_type_id IS NULL
   AND s.kind_key = ct.code;


-- ────────────────────────────────────────────────────────────────────────
-- 3. updated_at trigger
-- ────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
    IF to_regprocedure('public.update_updated_at()') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS trg_gt_channel_types_updated_at ON gt_channel_types;
        CREATE TRIGGER trg_gt_channel_types_updated_at
            BEFORE UPDATE ON gt_channel_types
            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    ELSE
        RAISE NOTICE '[226] update_updated_at() absent — updated_at set in application code.';
    END IF;
END $$;


-- ────────────────────────────────────────────────────────────────────────
-- 4. RLS — same posture as gt_content_kinds / gt_prompts: master data,
--    readable to every tenant.
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE gt_channel_types ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY gt_channel_types_read ON gt_channel_types
        FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


COMMENT ON TABLE gt_channel_types IS
    'Master list of channel types. Direct (email/whatsapp/linkedin), '
    'broadcast (blog/facebook/reddit/twitter/instagram), '
    'asset (playbook/survey/usecase_nurture). '
    'Distinct from gt_channels (tenant outbound connections).';
COMMENT ON COLUMN gt_channel_types.kind IS
    'Grouping used by the compose UI to branch behavior. '
    'direct = 1:1 send + copy body. '
    'broadcast = public post, URL after publish, no per-recipient copy. '
    'asset = reusable artifact attached to a direct send.';
COMMENT ON COLUMN gt_journey_stories.channel_type_id IS
    'Which channel type this story went out on. Backfilled from kind_key '
    'where the code matched; NULL where the pilot needs the reviewer to '
    'pick explicitly before approval.';

-- ── Post-apply verification ─────────────────────────────────────────────
-- SELECT code, name, kind FROM gt_channel_types ORDER BY sort_order;
-- SELECT count(*) FROM gt_journey_stories WHERE channel_type_id IS NULL AND status = 'approved';
