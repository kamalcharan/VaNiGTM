-- ============================================================================
-- 246_vara_semantic.sql
--
-- The semantic layer for Vara: a per-tenant canonical skill dictionary,
-- vector columns on the three entities the recommender/dedup logic will
-- touch, and one audit trail for every semantic-match decision.
--
-- Requires pgvector. Guarded: if the extension is unavailable, the whole
-- migration raises loudly rather than creating half a schema. VaNiGTM
-- rule 12 (NO_SILENT_FALLBACKS) applied at the schema layer.
--
-- ── Vector dimension: 768 ─────────────────────────────────────────────
-- Matches the plan already documented on gt_semantic_clusters (migration
-- 192 header). Ollama's `nomic-embed-text` produces 768-dim vectors and
-- runs locally with no auth — the same shape as the qwen3:8b setup for
-- the LLM. If we later switch to a different embedding model, the
-- migration to widen/narrow the columns is a separate ask.
--
-- ── One rule kept hard: a vector is a column on an audit-able row ─────
-- Every embedding is anchored to a row with a tenant_id + an entity name
-- + a canonical form. No vector-only tables. This preserves the audit
-- invariant: any semantic match traces back to two named rows.
--
-- ── vara_match_log is the audit spine for semantic decisions ─────────
-- Any time a worker uses a nearest-neighbour match to influence an
-- outcome, it MUST write a row here first. Otherwise a similarity
-- match becomes a hidden input to a decision, which is exactly what
-- the "model is never a legal actor" invariant exists to prevent.
-- ============================================================================

-- Fail loud, fail early if pgvector isn't installed. Sysadmin runs
-- `apt install postgresql-16-pgvector` (or equivalent) first.
CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- vara_skill — per-tenant canonical skill dictionary
-- ---------------------------------------------------------------------------
-- A JD says its must-haves as free text ("TypeScript / Node.js"), and the
-- family-defaults deriver needs to know that "TypeScript / Node.js" and
-- "Node + TS" and "Backend JS" are the same signal. This table is where
-- that dedup lives. Rows are seeded lazily: the first time a JD publishes
-- a must-have name, we upsert a skill row and embed it. Subsequent JDs
-- with the same or near-similar text share the row (or get merged via
-- an explicit human-approved merge — never silently).

CREATE TABLE IF NOT EXISTS vara_skill (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES vani_tenant(id) ON DELETE CASCADE,

  -- The name as first seen (from a JD's must-haves, or a candidate's
  -- chat turn, or a resume extraction). Preserved verbatim.
  name            text NOT NULL,

  -- Deterministic normalisation of `name` (lowercase, whitespace collapse,
  -- punctuation stripped). Cheap exact-match dedup before we spend an
  -- embedding on it. NULL until the embedder runs.
  canonical_form  text,

  -- 768-dim embedding of the canonical_form. NULL until the embedding
  -- worker fills it. Callers must handle both cases (NULL = "no semantic
  -- match available for this row yet, fall back to exact match").
  embedding       vector(768),

  -- How many times this skill has been referenced across JDs, chat turns,
  -- extractions. Bumped by the writer paths; used by the family-defaults
  -- deriver to weight signal by frequency.
  usage_count     int NOT NULL DEFAULT 0,

  created_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, name)
);

COMMENT ON TABLE vara_skill IS
  'D8: per-tenant canonical skill dictionary. Rows are typed anchors for '
  'the embedding column; there is no separate vector table. The recommender '
  'and family-defaults deriver read here; JDs still store skills by name '
  'so a rename in this table does not silently rewrite past JDs.';

CREATE INDEX IF NOT EXISTS idx_vara_skill_tenant_canonical
  ON vara_skill (tenant_id, canonical_form);

-- HNSW on the embedding — nearest-neighbour lookup for dedup + recommender.
-- Cosine distance is the right metric for text embeddings. The index is
-- built lazily on the first WHERE embedding <=> ... query.
CREATE INDEX IF NOT EXISTS idx_vara_skill_embedding_hnsw
  ON vara_skill USING hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- vara_family_profile.axes_embedding — vector column for family recommender
-- ---------------------------------------------------------------------------
-- Embeds the family's canonical shape (name + top must-haves + typical
-- knockouts) so the recommender can pick a nearest-neighbour family when
-- a tenant onboards in an industry we don't have a pack for. Backfill of
-- existing rows is a separate one-shot script; new rows land NULL and
-- the embedder fills them.

ALTER TABLE vara_family_profile
  ADD COLUMN IF NOT EXISTS axes_embedding vector(768);

CREATE INDEX IF NOT EXISTS idx_vara_family_profile_embedding_hnsw
  ON vara_family_profile USING hnsw (axes_embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- vara_candidate.profile_embedding — vector column for silver-medalist lookback
-- ---------------------------------------------------------------------------
-- Embeds a candidate's profile summary (composite drivers, top axes,
-- narrative one-liner) so a new applicant can be scored against "reminds
-- me of X we hired 6 months ago". Sensitive — the RLS policy on
-- vara_candidate already scopes to tenant, so no cross-tenant leakage.

ALTER TABLE vara_candidate
  ADD COLUMN IF NOT EXISTS profile_embedding vector(768);

CREATE INDEX IF NOT EXISTS idx_vara_candidate_embedding_hnsw
  ON vara_candidate USING hnsw (profile_embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- vara_match_log — the audit trail for every semantic-match decision
-- ---------------------------------------------------------------------------
-- Written by any worker that uses a nearest-neighbour match to influence
-- an outcome. Without this, a similarity match becomes a hidden input to
-- a decision — which is exactly the failure mode "no silent fallbacks"
-- and "model is never a legal actor" together forbid.
--
-- Two ends of every match: matched_from (the query anchor) and matched_to
-- (the neighbour). Kind columns say what shape each end is. IDs are bare
-- uuids — no FK, because kinds vary — so integrity relies on the writing
-- worker naming its own foreign entity correctly. Callers use recordMatch()
-- which enforces both ends live in the same tenant.

CREATE TABLE IF NOT EXISTS vara_match_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES vani_tenant(id) ON DELETE CASCADE,

  matched_from_kind  text NOT NULL
                     CHECK (matched_from_kind IN ('jd','family','candidate','skill','chat_turn','extraction')),
  matched_from_id    uuid NOT NULL,

  matched_to_kind    text NOT NULL
                     CHECK (matched_to_kind IN ('jd','family','candidate','skill','chat_turn','extraction')),
  matched_to_id      uuid NOT NULL,

  -- 1.0 = exact match; 0.0 = orthogonal. Callers compute this from
  -- pgvector's cosine distance operator (1 - (a <=> b)).
  similarity         real NOT NULL CHECK (similarity >= 0 AND similarity <= 1),

  -- Which worker used the match ('vara.family_recommender',
  -- 'vara.silver_medalist_lookback', ...). Free-form to keep the schema
  -- from constraining future workers.
  used_by            text NOT NULL,

  -- What decision the match fed. Free-form for the same reason.
  -- e.g. 'family_pack_suggested', 'candidate_flagged_similar_to_hire'.
  used_for           text NOT NULL,

  -- Optional evidence blob for the decision — model name, threshold used,
  -- alternates considered. Referenced by ids only per V-13 (no PII).
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,

  decided_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE vara_match_log IS
  'Every semantic-match decision is a row here BEFORE it influences an '
  'outcome. Append-only; the "model is never a legal actor" invariant '
  'requires the match itself be auditable evidence, not silent input.';

CREATE INDEX IF NOT EXISTS idx_vara_match_log_from
  ON vara_match_log (tenant_id, matched_from_kind, matched_from_id, decided_at DESC);

CREATE INDEX IF NOT EXISTS idx_vara_match_log_used
  ON vara_match_log (tenant_id, used_by, decided_at DESC);

-- Append-only guard: same shape as vara_jd_version, vara_score_snapshot etc.
DROP TRIGGER IF EXISTS match_log_append_only ON vara_match_log;
CREATE TRIGGER match_log_append_only
  BEFORE UPDATE OR DELETE ON vara_match_log
  FOR EACH ROW EXECUTE FUNCTION vani_forbid_mutation();

-- RLS: tenant-scoped, both new tables. vara_family_profile and
-- vara_candidate already have policies from migration 241.
ALTER TABLE vara_skill ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON vara_skill;
CREATE POLICY tenant_isolation ON vara_skill
  USING (tenant_id = vani_current_tenant())
  WITH CHECK (tenant_id = vani_current_tenant());

ALTER TABLE vara_match_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON vara_match_log;
CREATE POLICY tenant_isolation ON vara_match_log
  USING (tenant_id = vani_current_tenant())
  WITH CHECK (tenant_id = vani_current_tenant());
