-- ============================================================
-- Migration: 225_gt_journey_stories.sql
-- Purpose:   The story — a first-class artifact belonging to the journey.
--
-- Plan:      documents/POA-journey-campaign.md Phase 3.
-- Design:    documents/design-notes-journey-campaign.md §3.
-- Ruling:    Human writes the words; the recommender comes later.
--
-- ── WHY THIS IS THE PHASE THAT LETS THE PILOT SEND ────────────────────
--
-- Every earlier phase built the machinery around the send: brief,
-- decision, person, cadence. Without a story artifact there is nothing
-- for a campaign run to carry. This is that artifact.
--
-- ── WHY gt_content_kinds IS AN OPEN REGISTRY, NOT A CHECK CONSTRAINT ──
--
-- D7, ruled: presentation, email, WhatsApp reminder, success story,
-- experience, gyan, LinkedIn chasing — and more will keep arriving. One
-- migration per kind is not a long game; it is a tax on one. Kinds live
-- as data, seeded like gt_prompts (system rows + tenant overrides).
-- Adding a kind is: one row + one prompt + one schema, when the schema
-- matters (it does for the agent draft, later).
--
-- ── WHY STORIES ARE A SEPARATE TABLE FROM ASSETS ──────────────────────
--
-- A story is a MOVE: about them, per journey, approved every time, never
-- reused. gt_presentations (renamed later — POA §7) is the ASSET library:
-- about us (or a third party), reused across journeys, approved once. Two
-- lifetimes, two rows-per-write patterns, two tables. Attaching a story
-- to an asset is a foreign key (story_asset_ids), not the same row.
--
-- ── WHY THE (journey_id, seq) UNIQUENESS ──────────────────────────────
--
-- 'ready' is repeatable — story 3 on an account is normal. seq is stable
-- ordering within a journey, so R-S2 ("cannot repeat a previous story's
-- argument") has something to iterate over: at write time the drafter
-- reads seq < mine.
-- ============================================================

DO $$
DECLARE missing TEXT;
BEGIN
    SELECT string_agg(t, ', ') INTO missing
    FROM   unnest(ARRAY['vn_tenants', 'gt_journeys', 'gt_contacts', 'gt_touch_log']) AS t
    WHERE  to_regclass('public.' || t) IS NULL;

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'Missing prerequisite table(s): %', missing;
    END IF;
END $$;


-- ────────────────────────────────────────────────────────────────────────
-- 1. gt_content_kinds — the open registry (D7)
--
-- System rows land with tenant_id NULL. A tenant may override or extend
-- with rows of its own, same pattern as gt_prompts. `scope` cuts the
-- library in half by the rule that matters most: an ASSET is not about
-- the recipient and is reused; a MOVE is about the recipient and is not.
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_content_kinds (
    id           BIGSERIAL   PRIMARY KEY,
    tenant_id    UUID        REFERENCES vn_tenants(id) ON DELETE CASCADE,
    kind_key     VARCHAR(60) NOT NULL,
    display_name VARCHAR(120) NOT NULL,

    scope        VARCHAR(10) NOT NULL,
    channel      VARCHAR(20),

    -- Where the drafting prompt lives (gt_prompts.key). Nullable because
    -- the pilot writes stories by hand — the prompt is what an agent
    -- draft will need later, not what a human write needs now.
    prompt_key   VARCHAR(80),

    -- Which arcs and stages of the journey this kind serves. Left empty
    -- means "any". Populated, this is what turns the library into a
    -- nurture engine (design note §3.3): the stage decision asks "given
    -- this stage, which asset next?" and reads THIS.
    arc          VARCHAR(20) NOT NULL DEFAULT 'acquisition',
    stages       TEXT[]      NOT NULL DEFAULT '{}',

    is_system    BOOLEAN     NOT NULL DEFAULT false,
    is_active    BOOLEAN     NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_gt_kind_scope CHECK (scope IN ('asset', 'move')),
    CONSTRAINT chk_gt_kind_arc   CHECK (arc   IN ('acquisition', 'lifetime')),
    -- A system row has no tenant; a tenant row has one.
    CONSTRAINT chk_gt_kind_owner CHECK (
        (is_system AND tenant_id IS NULL) OR (NOT is_system AND tenant_id IS NOT NULL))
);

-- Two partial unique indexes so system and tenant rows share a key space
-- but do not collide. Same trick used in the cadence policy (mig 223).
CREATE UNIQUE INDEX IF NOT EXISTS uq_gt_kind_system
    ON gt_content_kinds(kind_key) WHERE is_system = true;
CREATE UNIQUE INDEX IF NOT EXISTS uq_gt_kind_tenant
    ON gt_content_kinds(tenant_id, kind_key) WHERE is_system = false;

-- The kinds named in D7. Only 'email' has any writing-side plumbing in
-- Phase 3 — the others are DECLARED here so callers can browse the whole
-- registry the day it lands and know what is coming.
INSERT INTO gt_content_kinds (kind_key, display_name, scope, channel, is_system, arc, stages)
VALUES
  ('email',         'Email',            'move',  'email',    true, 'acquisition', '{addressed,ready,answered}'::text[]),
  ('linkedin',      'LinkedIn message', 'move',  'linkedin', true, 'acquisition', '{addressed,ready,answered}'::text[]),
  ('whatsapp',      'WhatsApp',         'move',  'whatsapp', true, 'acquisition', '{ready,answered}'::text[]),
  ('deck',          'Pitch deck',       'asset', NULL,       true, 'acquisition', '{}'::text[]),
  ('one_pager',     'One-pager',        'asset', NULL,       true, 'acquisition', '{addressed,ready}'::text[]),
  ('success_story', 'Success story',    'asset', NULL,       true, 'acquisition', '{qualified,addressed,ready,answered}'::text[]),
  ('experience',    'Experience note',  'asset', NULL,       true, 'acquisition', '{answered}'::text[]),
  ('gyan',          'Thought leadership','asset',NULL,       true, 'acquisition', '{sourced,researched,qualified,answered}'::text[])
ON CONFLICT DO NOTHING;


-- ────────────────────────────────────────────────────────────────────────
-- 2. gt_journey_stories — the artifact
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_journey_stories (
    id            BIGSERIAL   PRIMARY KEY,
    tenant_id     UUID        NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    is_live       BOOLEAN     NOT NULL DEFAULT false,
    journey_id    BIGINT      NOT NULL REFERENCES gt_journeys(id) ON DELETE CASCADE,

    -- Stable ordering within the journey. Filled by the writer (a trigger
    -- would race two parallel drafts of the same journey against each
    -- other, and the racing is real — a reviewer opens two tabs).
    seq           SMALLINT    NOT NULL,

    kind_key      VARCHAR(60) NOT NULL DEFAULT 'email',

    -- 'human' now, 'agent' later. Recorded so the reply-rate comparison
    -- Phase 6 needs — human baseline vs agent draft — is possible without
    -- backfilling anything.
    author        VARCHAR(10) NOT NULL DEFAULT 'human',
    author_id     UUID,

    -- What this story argues, copied from the journey at write time.
    -- Copied, not joined, so a later re-scoring cannot change the record
    -- of what we ACTUALLY argued (R-J5 / R7).
    offer         VARCHAR(60),

    -- Text. subject is nullable because not every channel has one
    -- (whatsapp, linkedin, call notes).
    subject       TEXT,
    body          TEXT        NOT NULL,

    -- Which evidence lines from the brief this story explicitly cites.
    -- An array of URLs so R-S1 has something concrete to check at approval
    -- time — the compose screen already computes this per sentence.
    evidence_refs TEXT[]      NOT NULL DEFAULT '{}',

    -- Assets this story carries. Nullable (empty by default) because a
    -- first touch may not need any — it opens on evidence, not on a deck.
    asset_ids     BIGINT[]    NOT NULL DEFAULT '{}',

    status        VARCHAR(12) NOT NULL DEFAULT 'draft',

    -- Approval notes — including the R-S2 override reason when the
    -- reviewer bypassed the similarity check with a reason. Kept on the
    -- artifact rather than only on the journey event, because an approval
    -- that does not move the journey (story N on an already-ready account)
    -- writes no event, and the reason must survive that.
    notes         TEXT,

    -- The touch that carried this story, once it went out. Written by
    -- log_touch when it consumes the story, so the ledger reads back the
    -- other way too (which touch used which story).
    sent_as_touch BIGINT      REFERENCES gt_touch_log(id) ON DELETE SET NULL,

    approved_by   UUID,
    approved_at   TIMESTAMPTZ,
    sent_at       TIMESTAMPTZ,

    created_by    UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_gt_story_status CHECK (
        status IN ('draft', 'approved', 'sent', 'archived')),
    CONSTRAINT chk_gt_story_author CHECK (author IN ('human', 'agent')),
    -- An approved status must carry the who + when. Rule 12 on state
    -- changes: an approved story with no signature is a silent approval.
    CONSTRAINT chk_gt_story_approved CHECK (
        (status IN ('draft', 'archived')) OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
    -- Same for sent.
    CONSTRAINT chk_gt_story_sent CHECK (
        (status <> 'sent') OR (sent_as_touch IS NOT NULL AND sent_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_gt_story_seq
    ON gt_journey_stories(tenant_id, is_live, journey_id, seq);
CREATE INDEX IF NOT EXISTS idx_gt_story_journey
    ON gt_journey_stories(journey_id, seq);
CREATE INDEX IF NOT EXISTS idx_gt_story_status
    ON gt_journey_stories(tenant_id, is_live, status)
    WHERE status IN ('draft', 'approved');


-- ────────────────────────────────────────────────────────────────────────
-- 3. gt_touch_log.story_id — which story a send carried
--
-- Without this, "how did story 1 do vs story 2" is unanswerable, which
-- kills the whole reason for the human baseline (Phase 6 will judge the
-- agent draft against it).
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE gt_touch_log
    ADD COLUMN IF NOT EXISTS story_id BIGINT;

DO $$ BEGIN
    ALTER TABLE gt_touch_log
        ADD CONSTRAINT gt_touch_log_story_fk
        FOREIGN KEY (story_id) REFERENCES gt_journey_stories(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_gt_touch_log_story
    ON gt_touch_log(story_id) WHERE story_id IS NOT NULL;


-- ────────────────────────────────────────────────────────────────────────
-- RLS + updated_at
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE gt_content_kinds     ENABLE ROW LEVEL SECURITY;
ALTER TABLE gt_journey_stories   ENABLE ROW LEVEL SECURITY;

-- Kinds are visible cross-tenant when they are system rows — same posture
-- as gt_prompts. Tenant rows honour isolation as usual.
DO $$ BEGIN
    CREATE POLICY gt_content_kinds_read ON gt_content_kinds
        USING (is_system OR tenant_id = current_setting('app.current_tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY gt_journey_stories_tenant_isolation ON gt_journey_stories
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    IF to_regprocedure('public.update_updated_at()') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS trg_gt_kinds_updated_at ON gt_content_kinds;
        CREATE TRIGGER trg_gt_kinds_updated_at BEFORE UPDATE ON gt_content_kinds
            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
        DROP TRIGGER IF EXISTS trg_gt_story_updated_at ON gt_journey_stories;
        CREATE TRIGGER trg_gt_story_updated_at BEFORE UPDATE ON gt_journey_stories
            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    ELSE
        RAISE NOTICE '[225] update_updated_at() absent — updated_at set in application code.';
    END IF;
END $$;

COMMENT ON TABLE gt_content_kinds IS
    'D7, ruled: content kinds live as data, not an enum. A new kind is a row + a prompt + a schema — not a migration.';
COMMENT ON TABLE gt_journey_stories IS
    'The story artifact. A MOVE (about them, per journey, approved each time). Reusable ASSETS live in gt_presentations and are referenced here by asset_ids.';
COMMENT ON COLUMN gt_journey_stories.seq IS
    'Stable ordering within a journey. story 3 on an account is normal — the loop is answered → addressed with a new angle.';
COMMENT ON COLUMN gt_journey_stories.evidence_refs IS
    'URLs from the brief this story explicitly cites. R-S1 checks against them at approval time.';
COMMENT ON COLUMN gt_touch_log.story_id IS
    'Which story this send carried. Nullable — a send may be a phone call or an unstructured touch — but populated whenever a story rode with it, so reply rate per story is a query.';

-- ── Post-apply verification ─────────────────────────────────────────────
-- SELECT kind_key, scope, channel FROM gt_content_kinds WHERE is_system ORDER BY kind_key;
-- SELECT count(*) FROM gt_journey_stories WHERE status='approved' AND (approved_by IS NULL OR approved_at IS NULL); -- 0
