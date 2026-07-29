-- ============================================================
-- Migration: 219_gt_segments.sql
-- Purpose:   A named, saved answer to "which companies am I talking about" —
--            defined on screen, not in a CLI script.
--
-- Plan: documents/design-notes-research.md §7, NEXT item 9. Ruling R4: built
-- ON /prospects, not on a new page.
--
-- ── WHY THIS EXISTS ───────────────────────────────────────────────────
--
-- The pilot's cohort — 144 pharma manufacturers, 101 with a website — was
-- produced by `npx tsx src/cohort.ts`. It worked, and it meant the person who
-- owns the go-to-market could not see, change or repeat their own segment
-- without a developer and a terminal. That is the single clearest way this
-- product fails its user, and it is what "frankly i am lost, am not
-- understanding anything, because all is happening from backend" was about.
--
-- A segment is the filter, saved and named. Same filters as /prospects,
-- because a segment nobody can reproduce by looking at the screen is a magic
-- number.
--
-- ── DEFINITION, NOT MEMBERSHIP ────────────────────────────────────────
--
-- `definition` stores the FILTER, not the list of ids. A company that gets a
-- domain tomorrow should fall into "pharma with a website" without anyone
-- re-running anything, and a stored id list would quietly go stale while
-- looking authoritative.
--
-- The cost is real and is accepted: change an industry rule and membership
-- moves under a segment that has already been messaged. `rules_version`
-- records which classification produced the count you last saw, so the screen
-- can say "the rules have moved since you saved this" rather than silently
-- showing a different set (design-notes-research.md §8).
--
-- ── WHY NOT JUST TAGS ─────────────────────────────────────────────────
--
-- A tag is a human assertion about one company, applied by hand and true
-- until removed. A segment is a query. Both are wanted — you tag
-- "met at FTCCI 2026", you segment "pharma manufacturers with a website" —
-- and collapsing them would mean either hand-tagging 144 rows or losing the
-- ability to say something a filter cannot derive.
-- ============================================================

DO $$
DECLARE missing TEXT;
BEGIN
    SELECT string_agg(t, ', ') INTO missing
    FROM   unnest(ARRAY['vn_tenants', 'gt_prospects']) AS t
    WHERE  to_regclass('public.' || t) IS NULL;

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'Missing prerequisite table(s): %', missing;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS gt_segments (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       UUID        NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    is_live         BOOLEAN     NOT NULL DEFAULT false,

    name            VARCHAR(120) NOT NULL,
    -- Why this set is worth talking to as one group. Free text, and worth
    -- having: a segment whose rationale nobody wrote down gets re-created
    -- slightly differently six weeks later.
    note            TEXT,

    -- The filter, in the same shape /prospects sends:
    --   { search, industry_canonical, industry_sub, domain: 'has'|'none',
    --     tag_id, relationship, min_quality, city, state_code }
    -- Stored as sent so the screen can load a segment straight back into its
    -- own controls — a definition the UI cannot round-trip is a definition
    -- nobody can edit.
    definition      JSONB       NOT NULL DEFAULT '{}'::jsonb,

    -- What the definition matched when it was last counted, and when. A
    -- number with no timestamp beside it gets trusted long after it stopped
    -- being true.
    member_count    INTEGER,
    counted_at      TIMESTAMPTZ,

    -- Which industry-rule generation produced that count. When the rules move
    -- the screen says so instead of silently showing a different set.
    rules_version   VARCHAR(40),

    is_active       BOOLEAN     NOT NULL DEFAULT true,
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One name per tenant per environment. Two segments called "Pharma" is a
-- support conversation waiting to happen.
CREATE UNIQUE INDEX IF NOT EXISTS uq_gt_segments_name
    ON gt_segments(tenant_id, is_live, lower(name))
    WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_gt_segments_tenant
    ON gt_segments(tenant_id, is_live, is_active);

ALTER TABLE gt_segments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY gt_segments_tenant_isolation ON gt_segments
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE gt_segments IS
    'Named, saved /prospects filters. Stores the DEFINITION, not a member list — a company that gains a domain tomorrow joins "pharma with a website" without anyone re-running anything.';
COMMENT ON COLUMN gt_segments.definition IS
    'The filter in the shape /prospects sends it, so the screen can load a segment back into its own controls.';
COMMENT ON COLUMN gt_segments.rules_version IS
    'Which generation of the industry rules produced member_count. Differs from the current one = membership may have moved; the screen says so rather than showing a different set silently.';
