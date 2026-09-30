-- ============================================================================
-- 249_vani_agent_intent.sql
--
-- What an agent can be ASKED for. The router's target vocabulary.
--
-- ── Platform-owned, agent-seeded ─────────────────────────────────────────
-- This table is platform (`vani_`), so the widget can ask one question —
-- "what can this workspace's live agents do?" — without knowing which agents
-- exist. But NO ROW here is written by a platform migration. Each agent seeds
-- its own intents from its own migration file, which is what "agents extend,
-- never modify" means in practice: an agent ships prefixed tables PLUS
-- registry declarations. Vara's declaration is migration 251. Nova's will be
-- Nova's, and nobody will edit this file to add it.
--
-- ── `surface` is what makes Nova cheap to be wrong about ─────────────────
-- Nova's two pathways (N1 fix the digital estate, N2 run a campaign) are
-- things Nova does FOR the tenant — not conversations with the tenant's
-- visitors. So Nova may declare only `operator` intents, or none at all.
-- **An agent contributing zero visitor intents is a first-class case**, not
-- an edge one: the widget renders nothing for it and boots normally. That is
-- the whole reason routing could be designed before Nova exists.
--
-- ── No tenant_id, and therefore no RLS ───────────────────────────────────
-- An intent is a property of the AGENT, identical for every tenant that
-- subscribes to it — the same shape as vani_agent, vani_agent_role and
-- vani_domain_pack, which migration 240 also leaves policy-free for exactly
-- this reason. What varies per tenant is which agents are live, and that is
-- vani_tenant_agent's job. Tenant-specific intents, if they are ever wanted,
-- are a schema change with an argument attached, not a column added quietly.
--
-- ── The embedding is nullable, and callers must handle that ──────────────
-- Rows seed with `embedding` NULL and a backfill fills them
-- (`npm run intents:embed`), because embedding needs the LLM host reachable
-- and `nomic-embed-text` pulled — neither of which a migration may assume.
-- A NULL embedding means one thing only: this intent cannot be reached by
-- FREE TEXT yet. It is still a perfectly good chip, because a click needs no
-- vector. The router refuses loudly rather than quietly matching against the
-- subset that happens to be embedded (rule 12).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS vani_agent_intent (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     uuid NOT NULL REFERENCES vani_agent(id) ON DELETE CASCADE,

  -- Stable identifier the agent's own code switches on. Never displayed.
  code         text NOT NULL,
  -- What the chip says. Displayed verbatim to a visitor on someone else's
  -- website, so it is the agent's words, never generated.
  label        text NOT NULL,
  -- One sentence, shown in the catch-all list ("here is what I can do").
  description  text NOT NULL,

  -- Real phrasings a visitor might use. These are the substance of the
  -- embedding — a label alone ("Open roles") is too short to match "do you
  -- have anything going in backend" reliably.
  examples     text[] NOT NULL DEFAULT '{}',

  surface      text NOT NULL DEFAULT 'visitor'
               CHECK (surface IN ('visitor','operator')),

  -- Built from label + description + examples by intentEmbedText(), which is
  -- the single definition of that composition — change it and re-run the
  -- backfill, or matches drift against rows embedded under the old rule.
  embedding    vector(768),

  sort_order   int  NOT NULL DEFAULT 100,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),

  UNIQUE (agent_id, code)
);

COMMENT ON TABLE vani_agent_intent IS
  'What an agent can be asked for. Platform-owned table, agent-seeded rows: '
  'each agent declares its own intents from its own migration. An agent with '
  'zero visitor intents is a first-class case.';

COMMENT ON COLUMN vani_agent_intent.embedding IS
  'NULL means this intent is chip-reachable but not free-text reachable yet. '
  'The router refuses loudly rather than matching against a partial set.';

-- The router narrows by agent + surface + status first; this covers it.
CREATE INDEX IF NOT EXISTS idx_vani_agent_intent_live
  ON vani_agent_intent (agent_id, surface, status, sort_order);

-- HNSW here, unlike the answer cache (248): this set is not partitioned by a
-- key, every live intent across every agent is a candidate, and the set grows
-- with the product rather than staying at tens of rows.
CREATE INDEX IF NOT EXISTS idx_vani_agent_intent_embedding_hnsw
  ON vani_agent_intent USING hnsw (embedding vector_cosine_ops);
