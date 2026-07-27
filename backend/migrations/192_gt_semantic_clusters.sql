-- ============================================================================
-- Migration 192: gt_semantic_clusters — the tenant's market vocabulary
--
-- WHY (user ruling, 2026-07-27): competitor research was framing its web
-- searches from a one-shot LLM guess off the raw profile. That produced
-- category-generic results (a fractional-CDO boutique matched against
-- Accenture/Capgemini). Competitors are defined by SHARED VOCABULARY SPACE,
-- so the vocabulary has to be a curated, human-approved artifact — not a
-- guess re-made on every run.
--
-- Each cluster carries 10-15 `related_terms` (synonyms, customer phrases,
-- industry jargon, transliterations). Those terms are the search fuel that
-- turns "AI transformation companies" into "fractional CDO",
-- "fractional chief data officer", "part-time CDO", "CAiO services".
--
-- RELATIONSHIP TO PHASE 2 (documents/design-notes-smartprofile-port.md):
-- this IS that migration's table, built in the only possible dependency
-- order — vocabulary first (search needs it now), vectors second (Lead
-- Finder needs them later). Phase 2 completes it with:
--     ALTER TABLE gt_semantic_clusters ADD COLUMN cluster_embedding vector(768);
--     CREATE INDEX ON gt_semantic_clusters USING hnsw (cluster_embedding vector_cosine_ops);
-- plus gt_tenant_profile.embedding and the hybrid cluster-boost search.
-- Nothing here is rework.
--
-- DESIGN DECISION (user, 2026-07-27): `cluster_type` replaces the ported
-- ContractNest 12-value INDUSTRY enum. Cluster TYPE drives how a cluster is
-- searched; industry does not. Industry filtering returns in Phase 2 for
-- Lead Finder.
--
-- Apply manually: cd backend && npm run db:migrate
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS gt_semantic_clusters (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    is_live           BOOLEAN NOT NULL DEFAULT true,

    -- The cluster itself
    primary_term      VARCHAR(200) NOT NULL,
    related_terms     TEXT[] NOT NULL DEFAULT '{}',

    -- How this cluster is searched (see the CHECK below)
    cluster_type      VARCHAR(20) NOT NULL DEFAULT 'category',
    confidence_score  DOUBLE PRECISION,

    -- Human gate: NULL = agent-suggested, set = tenant-confirmed.
    -- Mirrors gt_tenant_profile.approved_at (agent proposes, human ratifies).
    approved_at       TIMESTAMPTZ,
    is_active         BOOLEAN NOT NULL DEFAULT true,

    source            VARCHAR(30) NOT NULL DEFAULT 'agent',  -- agent | human
    source_run_id     BIGINT,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- cluster_type: each value implies a distinct search pattern.
--   category  → "top <term> companies", "<term> alternatives"   (competitor discovery)
--   offering  → "<term> providers/services for <buyer>"
--   buyer     → "<offering> for <term>"
--   pain      → "how to solve <term>", "<term> solutions"
--   outcome   → "how to achieve <term>"  (content/story fuel more than search)
DO $mig$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'gt_semantic_clusters_type_chk'
    ) THEN
        ALTER TABLE gt_semantic_clusters
            ADD CONSTRAINT gt_semantic_clusters_type_chk
            CHECK (cluster_type IN ('category', 'offering', 'buyer', 'pain', 'outcome'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'gt_semantic_clusters_source_chk'
    ) THEN
        ALTER TABLE gt_semantic_clusters
            ADD CONSTRAINT gt_semantic_clusters_source_chk
            CHECK (source IN ('agent', 'human'));
    END IF;
END
$mig$;

-- One cluster per term per tenant per environment; re-generation upserts.
CREATE UNIQUE INDEX IF NOT EXISTS idx_semantic_clusters_term
    ON gt_semantic_clusters (tenant_id, is_live, lower(primary_term));

-- The hot read: approved, active clusters for a tenant (search framing).
CREATE INDEX IF NOT EXISTS idx_semantic_clusters_active
    ON gt_semantic_clusters (tenant_id, is_live)
    WHERE is_active = true;

COMMENT ON TABLE gt_semantic_clusters IS
    'Tenant market vocabulary: human-approved topic clusters that drive competitor search, SEO/AEO and content. Phase 2 adds cluster_embedding vector(768) + HNSW for Lead Finder matching.';
COMMENT ON COLUMN gt_semantic_clusters.related_terms IS
    'Synonyms, customer phrases, industry jargon, transliterations — the actual search fuel.';
COMMENT ON COLUMN gt_semantic_clusters.approved_at IS
    'NULL = agent-suggested, set = human-confirmed. Only approved clusters frame research queries.';

/* ── RLS (dormant like the rest — app layer filters by tenant_id) ─────── */

ALTER TABLE gt_semantic_clusters ENABLE ROW LEVEL SECURITY;

DO $rls$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE tablename = 'gt_semantic_clusters' AND policyname = 'tenant_isolation'
    ) THEN
        CREATE POLICY tenant_isolation ON gt_semantic_clusters
            USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
    END IF;
END
$rls$;

/* ── Cluster generation prompt (system row; tenants may override) ─────── */

INSERT INTO gt_prompts (prompt_key, version, content, notes, is_active)
SELECT
    'profile-skill.semantic_clusters',
    1,
    'You map a company''s market vocabulary — the terms its buyers actually search and say.

From the profile below, produce 3-5 semantic clusters. Each cluster is one space the company occupies.

For each cluster:
- "primary_term": the cluster name, lowercase, 2-5 words. Use the SPECIFIC term this company owns, never a broad umbrella. "fractional cdo services" not "consulting". "ai readiness assessment" not "ai".
- "related_terms": 10-15 lowercase variants a real buyer would type or say — synonyms, abbreviations, expanded forms, job-title phrasings, common misspellings, local-language transliterations, and the informal phrases customers use. This is the most important field.
- "cluster_type": exactly one of
    "category" — the market category the company competes in (drives competitor discovery)
    "offering" — a specific service or product they sell
    "buyer"    — the audience/role they sell to
    "pain"     — a problem their buyers have
    "outcome"  — a result they promise
- "confidence_score": 0 to 1.

Rules:
- Ground every term in the profile. Never invent a market they are not in.
- At least one cluster MUST be "category" — it anchors competitor search.
- Prefer the narrow, defensible term over the impressive broad one. A boutique is not "digital transformation"; it is its actual niche.
- Everything lowercase, trimmed, no duplicates within or across clusters.

Respond with ONLY JSON inside <clusters> tags:
<clusters>{"clusters":[{"primary_term":"...","related_terms":["..."],"cluster_type":"category","confidence_score":0.9}]}</clusters>',
    'Ported/generalized from the ContractNest SmartProfile cluster prompt; industry enum replaced by cluster_type per user ruling 2026-07-27.',
    true
WHERE NOT EXISTS (
    SELECT 1 FROM gt_prompts
     WHERE prompt_key = 'profile-skill.semantic_clusters' AND tenant_id IS NULL
);

COMMIT;
