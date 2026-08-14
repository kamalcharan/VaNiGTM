-- ============================================================================
-- Migration 193: gt_tenant_brand — the tenant's Brand Brain object
--
-- WHY: the mission wizard's step 5 (Complete the Mission Wizard work order,
-- 2026-08-14) needs a place to hold voice/tone, always-say/never-say claims,
-- visual identity, and proof — pre-filled from the step-1 site crawl,
-- confirmed by the tenant. This is a tenant-level object readable by every
-- agent (Storyteller, campaigns, sequences) and NOT owned by any one of them,
-- so it gets its own table rather than living inside gt_tenant_profile or
-- being folded into another skill's schema — same shape as gt_tenant_profile
-- itself: one row per tenant, source + approved_at for the agent-proposes/
-- human-confirms gate.
--
-- Postgres 17.9.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: gt_tenant_brand  (one row per tenant)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_tenant_brand (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID         UNIQUE NOT NULL
                    REFERENCES vn_tenants(id) ON DELETE CASCADE,

    -- ── VOICE ────────────────────────────────────────────────────────────
    voice_tone      TEXT[],                          -- 3-4 adjectives
    always_say      TEXT[],                          -- core claims/phrases
    never_say       TEXT[],                          -- e.g. "never makes speed claims"

    -- ── VISUAL (agent-derived, best-effort, never fabricated) ───────────
    visual          JSONB        NOT NULL DEFAULT '{}'::jsonb,
                    -- { logo_url, colors: string[], typography }

    -- ── PROOF ────────────────────────────────────────────────────────────
    proof           TEXT[],                          -- case studies, testimonials, named clients

    -- ── METADATA ─────────────────────────────────────────────────────────
    source          VARCHAR(20)  NOT NULL DEFAULT 'agent',  -- agent | human
    approved_at     TIMESTAMPTZ,
    version         INTEGER      NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $mig$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'gt_tenant_brand_source_chk'
    ) THEN
        ALTER TABLE gt_tenant_brand
            ADD CONSTRAINT gt_tenant_brand_source_chk
            CHECK (source IN ('agent', 'human'));
    END IF;
END
$mig$;

COMMENT ON TABLE  gt_tenant_brand            IS 'Tenant Brand Brain object: voice/tone, always/never-say claims, visual identity, proof. Pre-filled from the site crawl, human-confirmed. Readable by every downstream agent.';
COMMENT ON COLUMN gt_tenant_brand.visual     IS 'Agent-derived, best-effort: {logo_url, colors: string[], typography}. Left blank rather than invented when not found on the site.';
COMMENT ON COLUMN gt_tenant_brand.approved_at IS 'NULL = agent-suggested, set = human-confirmed. Gates the brand section of profile_score.';
COMMENT ON COLUMN gt_tenant_brand.source     IS 'Origin of latest write: agent | human.';

-- UNIQUE(tenant_id) already creates a B-tree index — no explicit index needed.


-- ────────────────────────────────────────────────────────────────────────────
-- RLS  (pattern from migration 184 — dormant like the rest, app layer filters
-- by tenant_id; policy stands ready for the RLS cutover)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE gt_tenant_brand ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gt_tenant_brand_tenant_isolation ON gt_tenant_brand;

CREATE POLICY gt_tenant_brand_tenant_isolation ON gt_tenant_brand
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);


-- ────────────────────────────────────────────────────────────────────────────
-- Updated-at trigger (vn_set_updated_at() defined in 001_vn_foundation.sql)
-- ────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_gt_tenant_brand_updated_at ON gt_tenant_brand;
CREATE TRIGGER trg_gt_tenant_brand_updated_at
    BEFORE UPDATE ON gt_tenant_brand
    FOR EACH ROW EXECUTE FUNCTION vn_set_updated_at();


-- ────────────────────────────────────────────────────────────────────────────
-- Brand generation prompt (system row; tenants may override)
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO gt_prompts (prompt_key, version, content, notes, is_active)
SELECT
    'profile-skill.brand',
    1,
    'You extract a company''s brand voice from its own website text — never invent one.

From the site text and product profile below, draft:
- "voice_tone": 3-4 adjectives that describe how this company actually writes (e.g. "direct", "technical", "warm"). Ground every adjective in the text — do not guess a generic SaaS tone.
- "always_say": phrases or claims that recur across the site and are clearly core to how they describe themselves. 2-5 items.
- "never_say": claims the company conspicuously avoids or explicitly disclaims (e.g. never makes a speed claim, never names a specific price). Only include this if the text gives real evidence — an absence alone is not evidence.
- "proof": named case studies, testimonials, or client names found in the text. 0-5 items.

Rules:
- Ground every item in the text. Never invent a claim, adjective, or client name not evidenced there.
- If a category has no real evidence, return an empty array for it — do not pad with plausible-sounding guesses.
- Short, plain phrases — no marketing fluff of your own.

Respond with ONLY JSON inside <brand> tags:
<brand>{"voice_tone":["..."],"always_say":["..."],"never_say":["..."],"proof":["..."]}</brand>',
    'Companion to profile-skill.semantic_clusters — same never-fabricate rule as the clusters prompt, applied to brand voice instead of market vocabulary.',
    true
WHERE NOT EXISTS (
    SELECT 1 FROM gt_prompts
     WHERE prompt_key = 'profile-skill.brand' AND tenant_id IS NULL
);

COMMIT;
