-- ============================================================
-- Migration: 227_channel_type_fk.sql
-- Purpose:   Point the two remaining free-text/undeclared "channel"
--            surfaces at the gt_channel_types master (mig 226).
--
--            · gt_content_kinds.channel (VARCHAR)  → channel_type_id FK
--            · gt_presentations (asset library)    → channel_type_id FK
--                                                    (new column; no
--                                                     legacy to migrate)
--
-- ── WHY THIS IS A SEPARATE, ADDITIVE MIGRATION ───────────────────────
--
-- 226 introduced the master. 225's gt_content_kinds shipped with `channel`
-- as a free VARCHAR — fine for the D7 registry but wrong once callers
-- want a stable id to filter by. This migration adds the FK column
-- alongside the legacy string; it does NOT drop the legacy column. That
-- lets old consumers keep working while new ones migrate. A follow-up
-- can drop the string once list_kinds callers have moved.
--
-- Backfill matches gt_content_kinds.channel against gt_channel_types.code
-- case-insensitively — the seeded system rows all match by construction
-- (email/whatsapp/linkedin), and any tenant row that doesn't match stays
-- NULL for the app to prompt on. Rule 12 on ambiguity: NULL is loud.
--
-- ── WHY gt_presentations GETS THE COLUMN NOW ─────────────────────────
--
-- 186's deck table becomes the asset library once D7's rename lands. A
-- deck tagged with a channel type ("this deck is a playbook", "this
-- one-pager is meant for LinkedIn") lets the asset picker in the compose
-- surface show a relevant subset. Nullable — the pilot has decks with
-- no tag yet; the app makes it required on new writes.
-- ============================================================

DO $$
DECLARE missing TEXT;
BEGIN
    SELECT string_agg(t, ', ') INTO missing
    FROM   unnest(ARRAY['gt_channel_types', 'gt_content_kinds']) AS t
    WHERE  to_regclass('public.' || t) IS NULL;

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'Missing prerequisite table(s): %', missing;
    END IF;
END $$;


-- ────────────────────────────────────────────────────────────────────────
-- 1. gt_content_kinds.channel_type_id
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE gt_content_kinds
    ADD COLUMN IF NOT EXISTS channel_type_id INT;

DO $$ BEGIN
    ALTER TABLE gt_content_kinds
        ADD CONSTRAINT gt_content_kinds_channel_type_fk
        FOREIGN KEY (channel_type_id) REFERENCES gt_channel_types(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_gt_content_kinds_channel_type
    ON gt_content_kinds(channel_type_id)
    WHERE channel_type_id IS NOT NULL;

-- Case-insensitive backfill. The seeded system rows in 225 use the same
-- codes (email, linkedin, whatsapp) as 226's master, so this fills them
-- all. Tenant rows with a channel string that doesn't match a known code
-- stay NULL — the reviewer picks explicitly next time the row is edited.
UPDATE gt_content_kinds ck
   SET channel_type_id = ct.id
  FROM gt_channel_types ct
 WHERE ck.channel_type_id IS NULL
   AND ck.channel IS NOT NULL
   AND lower(ck.channel) = lower(ct.code);


-- ────────────────────────────────────────────────────────────────────────
-- 2. gt_presentations.channel_type_id
--
-- Guarded on the table existing so this migration works both against a
-- full VPS schema and against the test bootstrap (which does not load
-- migration 186's storyteller tables). If the storyteller migrations
-- haven't been applied to this database, the ALTER is skipped with a
-- loud NOTICE — a follow-up run of 227 after 186 will pick it up. NOT
-- a silent fallback; the NOTICE is visible in the migrate output and
-- the FK is quietly deferred, not faked.
-- ────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
    IF to_regclass('public.gt_presentations') IS NOT NULL THEN
        ALTER TABLE gt_presentations
            ADD COLUMN IF NOT EXISTS channel_type_id INT;

        BEGIN
            ALTER TABLE gt_presentations
                ADD CONSTRAINT gt_presentations_channel_type_fk
                FOREIGN KEY (channel_type_id) REFERENCES gt_channel_types(id) ON DELETE RESTRICT;
        EXCEPTION WHEN duplicate_object THEN NULL; END;

        CREATE INDEX IF NOT EXISTS idx_gt_presentations_channel_type
            ON gt_presentations(channel_type_id)
            WHERE channel_type_id IS NOT NULL;

        RAISE NOTICE '[227] gt_presentations.channel_type_id in place.';
    ELSE
        RAISE NOTICE '[227] gt_presentations absent — skipping the deck FK. Re-run this migration after 186 lands.';
    END IF;
END $$;

-- No backfill on gt_presentations — the existing decks predate the tag
-- entirely, and guessing at their target medium would be exactly the
-- silent-fallback rule 12 forbids. NULL means "unclassified"; the asset
-- picker's "unclassified" bucket shows them until a human tags them.


COMMENT ON COLUMN gt_content_kinds.channel_type_id IS
    'FK to gt_channel_types (mig 226). Backfilled from the legacy channel '
    'VARCHAR where the code matched. The legacy column stays for a release '
    'so old readers keep working.';
-- gt_presentations.channel_type_id may not exist yet in this database
-- (see the guarded block above). Comment it only when the column is here.
DO $$ BEGIN
    IF to_regclass('public.gt_presentations') IS NOT NULL AND EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'gt_presentations' AND column_name = 'channel_type_id'
    ) THEN
        EXECUTE $c$COMMENT ON COLUMN gt_presentations.channel_type_id IS
            'Which channel type this asset is intended for. Nullable — the pilot has decks that predate the tag; the asset picker groups them under "unclassified" until a human classifies them.'$c$;
    END IF;
END $$;

-- ── Post-apply verification ─────────────────────────────────────────────
-- SELECT count(*) FROM gt_content_kinds WHERE channel_type_id IS NULL AND channel IS NOT NULL;
-- SELECT count(*) FROM gt_presentations WHERE channel_type_id IS NULL;
