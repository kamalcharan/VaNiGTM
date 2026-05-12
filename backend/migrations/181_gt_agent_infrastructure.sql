-- ============================================================================
-- Migration 181: Vikuna GTM — Agent Core Infrastructure (Phase 0)
--
-- Per VIKUNA_AGENT_SPEC_V1.md §2.
--
-- Creates the foundation tables every future agent (VaNi, ICP, Lead Finder,
-- Sequence, Pulse, Storyteller) will read from / write to.
--
--   gt_events          — event bus (worker polls this)
--   gt_tenant_context  — shared per-tenant memory (profile / knowledge /
--                        daily token usage / flags)
--   gt_agent_runs      — ALTER existing table (added in 162_gt_warroom.sql)
--                        to add event_id, steps, awaiting_input, retry_count,
--                        last_checkpoint, output, error_trace, token_usage.
--                        Existing CHECK constraints are dropped — agent_type
--                        and status need broader value sets for the new
--                        agent state machine.
--   gt_prompts         — versioned prompts (system + tenant override)
--   gt_kg_nodes        — knowledge graph nodes (Product, ICP, PainPoint, ...)
--   gt_kg_edges        — knowledge graph edges (HAS_FEATURE, TARGETS, ...)
--
-- All tenant-scoped tables get RLS. Application code ALSO filters by
-- tenant_id in every query (belt + suspenders).
--
-- Schema reconciliation notes (different from VIKUNA_AGENT_SPEC_V1.md):
--   1. gt_agent_runs.id is BIGSERIAL (pre-existing from 162). Spec wrote UUID.
--      Downstream tables that reference it use BIGINT.
--   2. gt_events.source_id is TEXT (not UUID) — can hold a user_id UUID
--      string OR a gt_agent_runs.id BIGINT cast to text.
--   3. gt_kg_nodes.source_run_id / gt_kg_edges.source_run_id are BIGINT
--      (FK to existing BIGSERIAL gt_agent_runs.id).
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: gt_events  (event bus — polled by worker)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_events (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID         NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,

    event_type      VARCHAR(80)  NOT NULL,
    -- TENANT_REGISTERED | PROFILE_COMPLETE | ICP_APPROVED | LEADS_IMPORTED |
    -- SEQUENCE_READY  | SCHEDULED_PULSE  | AGENT_FAILED | HUMAN_APPROVED  |
    -- HUMAN_REJECTED  | WEBHOOK_RECEIVED | FILE_INGESTED |
    -- FILE_UPLOADED   | URL_SUBMITTED    | KNOWLEDGE_UPDATED

    source_type     VARCHAR(30)  NOT NULL,
    -- 'human' | 'agent' | 'cron' | 'system' | 'webhook'

    source_id       TEXT,
    -- Free-form: user_id (UUID) when human, gt_agent_runs.id (bigint as text)
    -- when agent, null when cron/system. TEXT keeps it source-agnostic.

    payload         JSONB        NOT NULL DEFAULT '{}'::jsonb,

    status          VARCHAR(20)  NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'done', 'failed')),

    processed_at    TIMESTAMPTZ,
    error           TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  gt_events             IS 'Event bus. Workers poll pending rows. Every agent trigger flows through here.';
COMMENT ON COLUMN gt_events.source_id   IS 'TEXT so it can hold user_id UUID (human) or gt_agent_runs.id BIGINT (agent).';
COMMENT ON COLUMN gt_events.event_type  IS 'Free-form event type. AGENT_REGISTRY in worker.ts maps types to handlers.';

CREATE INDEX IF NOT EXISTS idx_gt_events_polling
    ON gt_events (tenant_id, status, created_at)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_gt_events_tenant_type
    ON gt_events (tenant_id, event_type, created_at DESC);


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: gt_tenant_context  (shared per-tenant memory across all agents)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_tenant_context (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID         UNIQUE NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,

    -- Phase 1 fields (free-form JSONB so future agents can extend without migration)
    profile             JSONB        NOT NULL DEFAULT '{}'::jsonb,
    -- { product_name, product_description, icp_summary, gtm_stage, channels[],
    --   pricing_model, team_size, profile_summary, profile_approved }

    knowledge           JSONB        NOT NULL DEFAULT '{}'::jsonb,
    -- Keyed by agent: { "vani-skill": {...}, "icp-skill": {...} }

    flags               JSONB        NOT NULL DEFAULT '{}'::jsonb,
    -- Onboarding steps, feature flags, agent run counts

    daily_token_usage   JSONB        NOT NULL DEFAULT '{}'::jsonb,
    -- { "2026-05-12": { "vps": 12400, "escalation": 0 } }

    daily_token_limit   INTEGER      NOT NULL DEFAULT 100000,
    -- Tokens/day per tenant. Override per tenant if needed.

    version             INTEGER      NOT NULL DEFAULT 1,
    updated_by          VARCHAR(80),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE gt_tenant_context IS 'Shared agent memory per tenant. Daily token budget enforced here.';


-- ────────────────────────────────────────────────────────────────────────────
-- ALTER: gt_agent_runs  (extend existing table from migration 162)
--
-- The 162 schema was built for a different generation of agents
-- (orchestrator/outreach/prospecting/conversion/aeo/feedback).
-- The Vikuna spec needs a more general state machine
-- (queued/running/awaiting/completed/failed) and step logging.
-- ────────────────────────────────────────────────────────────────────────────

-- 1. Drop CHECK constraints that block new values.
ALTER TABLE gt_agent_runs DROP CONSTRAINT IF EXISTS gt_agent_runs_agent_type_check;
ALTER TABLE gt_agent_runs DROP CONSTRAINT IF EXISTS gt_agent_runs_status_check;

-- 2. Make legacy NOT NULL columns nullable (new spec code doesn't set them).
ALTER TABLE gt_agent_runs ALTER COLUMN agent_type DROP NOT NULL;
ALTER TABLE gt_agent_runs ALTER COLUMN action DROP NOT NULL;

-- 3. Default status to 'queued' for the new agent state machine.
ALTER TABLE gt_agent_runs ALTER COLUMN status SET DEFAULT 'queued';

-- 4. Add a permissive status CHECK that covers both old + new state machines.
ALTER TABLE gt_agent_runs
    ADD CONSTRAINT gt_agent_runs_status_check
    CHECK (status IN (
        -- Legacy (from migration 162)
        'success', 'partial', 'error', 'skipped',
        -- Vikuna spec state machine
        'queued', 'running', 'awaiting', 'completed', 'failed'
    ));

-- 5. Add the spec's new columns.
ALTER TABLE gt_agent_runs
    ADD COLUMN IF NOT EXISTS event_id         UUID REFERENCES gt_events(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS steps            JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Append-only: [{ts, step_name, action, input_summary, output_summary, duration_ms, status}]

    ADD COLUMN IF NOT EXISTS awaiting_input   JSONB,
    -- Null when running, populated when status='awaiting'
    -- { type: 'approval'|'input', prompt: string, options: [] }

    ADD COLUMN IF NOT EXISTS retry_count      INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_checkpoint  VARCHAR(100),
    ADD COLUMN IF NOT EXISTS output           JSONB,
    ADD COLUMN IF NOT EXISTS error_trace      TEXT,
    ADD COLUMN IF NOT EXISTS token_usage      JSONB DEFAULT '{}'::jsonb;
    -- { input_tokens, output_tokens, model, cost_usd, vps, escalation }

CREATE INDEX IF NOT EXISTS idx_gt_agent_runs_event
    ON gt_agent_runs (event_id) WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gt_agent_runs_tenant_name
    ON gt_agent_runs (tenant_id, agent_name, status, created_at DESC);

COMMENT ON COLUMN gt_agent_runs.steps           IS 'Append-only step log: [{ts, step_name, action, status, ...}]';
COMMENT ON COLUMN gt_agent_runs.awaiting_input  IS 'Set when status=awaiting. Tells UI what input the agent needs.';
COMMENT ON COLUMN gt_agent_runs.token_usage     IS 'LLM token usage for this run. Separated by source (vps vs escalation).';


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: gt_prompts  (versioned LLM prompts — system + tenant override)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_prompts (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID         REFERENCES vn_tenants(id) ON DELETE CASCADE,
    -- NULL = system prompt (applies to all tenants), UUID = tenant override

    prompt_key      VARCHAR(100) NOT NULL,
    -- 'vani-skill.gather' | 'vani-skill.generate_slides' | 'icp-skill.build' | ...

    version         INTEGER      NOT NULL DEFAULT 1,
    content         TEXT         NOT NULL,
    is_active       BOOLEAN      NOT NULL DEFAULT true,
    notes           TEXT,
    created_by      UUID,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  gt_prompts            IS 'Versioned LLM prompts. NULL tenant_id = system prompt. Loaded by prompt.store.ts.';
COMMENT ON COLUMN gt_prompts.tenant_id  IS 'NULL = system prompt (default for all tenants). UUID = tenant-specific override.';

-- One active system prompt per key (tenant_id IS NULL).
CREATE UNIQUE INDEX IF NOT EXISTS idx_gt_prompts_active_system
    ON gt_prompts (prompt_key)
    WHERE tenant_id IS NULL AND is_active = true;

-- One active tenant-override prompt per key per tenant.
CREATE UNIQUE INDEX IF NOT EXISTS idx_gt_prompts_active_tenant
    ON gt_prompts (prompt_key, tenant_id)
    WHERE tenant_id IS NOT NULL AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_gt_prompts_key
    ON gt_prompts (prompt_key, tenant_id, version DESC);


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: gt_kg_nodes  (knowledge graph nodes — JSONB; AGE deferred to Phase 2)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_kg_nodes (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID         NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,

    label           VARCHAR(50)  NOT NULL,
    -- 'Product' | 'Feature' | 'ICP' | 'UseCase' | 'PainPoint' |
    -- 'Differentiator' | 'Team' | 'Competitor'

    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    properties      JSONB        NOT NULL DEFAULT '{}'::jsonb,

    source_run_id   BIGINT       REFERENCES gt_agent_runs(id) ON DELETE SET NULL,
    -- BIGINT (not UUID) — gt_agent_runs uses BIGSERIAL PK from migration 162.

    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT gt_kg_nodes_tenant_label_name_unique UNIQUE (tenant_id, label, name)
);

COMMENT ON TABLE gt_kg_nodes IS 'Knowledge graph nodes. Source-agnostic: conversation, PDF, URL all write here.';

CREATE INDEX IF NOT EXISTS idx_gt_kg_nodes_tenant_label
    ON gt_kg_nodes (tenant_id, label);

CREATE INDEX IF NOT EXISTS idx_gt_kg_nodes_source_run
    ON gt_kg_nodes (source_run_id) WHERE source_run_id IS NOT NULL;


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: gt_kg_edges  (knowledge graph edges)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gt_kg_edges (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID         NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,

    from_node_id    UUID         NOT NULL REFERENCES gt_kg_nodes(id) ON DELETE CASCADE,
    to_node_id      UUID         NOT NULL REFERENCES gt_kg_nodes(id) ON DELETE CASCADE,

    relationship    VARCHAR(60)  NOT NULL,
    -- 'HAS_FEATURE' | 'TARGETS' | 'FEELS' | 'ADDRESSES' |
    -- 'SOLVES' | 'DIFFERENTIATES_FROM' | 'BUILT_BY'

    properties      JSONB        NOT NULL DEFAULT '{}'::jsonb,
    source_run_id   BIGINT       REFERENCES gt_agent_runs(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT gt_kg_edges_unique UNIQUE (tenant_id, from_node_id, relationship, to_node_id)
);

CREATE INDEX IF NOT EXISTS idx_gt_kg_edges_from
    ON gt_kg_edges (tenant_id, from_node_id, relationship);

CREATE INDEX IF NOT EXISTS idx_gt_kg_edges_to
    ON gt_kg_edges (tenant_id, to_node_id);


-- ────────────────────────────────────────────────────────────────────────────
-- RLS  (every tenant-scoped table)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE gt_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE gt_tenant_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE gt_kg_nodes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE gt_kg_edges       ENABLE ROW LEVEL SECURITY;
-- gt_prompts: NOT enabled. System prompts (tenant_id IS NULL) must be
-- readable by all tenants. Application layer filters by tenant_id where
-- relevant (prompt.store.ts).

DROP POLICY IF EXISTS gt_events_tenant_isolation         ON gt_events;
DROP POLICY IF EXISTS gt_tenant_context_tenant_isolation ON gt_tenant_context;
DROP POLICY IF EXISTS gt_kg_nodes_tenant_isolation       ON gt_kg_nodes;
DROP POLICY IF EXISTS gt_kg_edges_tenant_isolation       ON gt_kg_edges;

CREATE POLICY gt_events_tenant_isolation ON gt_events
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY gt_tenant_context_tenant_isolation ON gt_tenant_context
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY gt_kg_nodes_tenant_isolation ON gt_kg_nodes
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY gt_kg_edges_tenant_isolation ON gt_kg_edges
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);


-- ────────────────────────────────────────────────────────────────────────────
-- Updated-at trigger for gt_tenant_context + gt_kg_nodes
-- (vn_set_updated_at() is defined in 001_vn_foundation.sql)
-- ────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_gt_tenant_context_updated_at ON gt_tenant_context;
CREATE TRIGGER trg_gt_tenant_context_updated_at
    BEFORE UPDATE ON gt_tenant_context
    FOR EACH ROW EXECUTE FUNCTION vn_set_updated_at();

DROP TRIGGER IF EXISTS trg_gt_kg_nodes_updated_at ON gt_kg_nodes;
CREATE TRIGGER trg_gt_kg_nodes_updated_at
    BEFORE UPDATE ON gt_kg_nodes
    FOR EACH ROW EXECUTE FUNCTION vn_set_updated_at();


-- ────────────────────────────────────────────────────────────────────────────
-- SEED: 3 system prompts (vani-skill.gather / generate_slides / answer_question)
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO gt_prompts (prompt_key, version, content, notes, is_active)
VALUES
(
    'vani-skill.gather',
    1,
    'You are VaNi, an intelligent agent for the Vikuna GTM platform. Your job is to understand a new tenant''s product, ICP, and GTM context through conversation.

Ask ONE focused question per turn. Be warm and specific, not clinical.
Cover in order: product description, core problem solved, ICP, differentiators, use cases, GTM stage, channels, pricing model, team size, vision.

After EVERY response, extract structured knowledge as JSON at the end:
<extract>{"label":"Product|Feature|ICP|UseCase|PainPoint|Differentiator|Team","name":"short unique name","description":"one clear sentence","properties":{}}</extract>

Rules:
- One <extract> tag per distinct insight. Multiple tags per turn allowed.
- Keep responses to 2-3 sentences + one question.
- After 8+ exchanges with sufficient coverage, include: <profile_ready/>
- Never ask two questions in one turn.',
    'Initial system prompt v1',
    true
),
(
    'vani-skill.generate_slides',
    1,
    'You are VaNi, generating a product presentation from structured knowledge graph data.

Return ONLY a valid JSON array. No markdown fences. No explanation.

Each slide object:
{
  "id": 1,
  "type": "title|problem|solution|icp|differentiators|traction|cta",
  "title": "slide title",
  "subtitle": "one supporting line",
  "bullets": [{"icon":"emoji","head":"bold point","body":"one sentence"}],
  "narration": "3-4 sentences. Storytelling voice. Natural. Do not just read bullets."
}

Slide order: title → problem → solution → icp → differentiators → traction → cta
Be specific. Use names, numbers, real details from the knowledge graph. Generic is failure.',
    'Initial slide generation prompt v1',
    true
),
(
    'vani-skill.answer_question',
    1,
    'You are VaNi, answering a live audience question during a presentation.
Answer using ONLY the product knowledge provided in context.
If the answer is not in the knowledge base, respond: "Great question — I will make sure the team follows up on that specifically."
Be conversational and confident. Maximum 3 sentences.',
    'Initial Q&A prompt v1',
    true
)
ON CONFLICT DO NOTHING;
