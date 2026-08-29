-- ============================================================================
-- 248_vara_answer_cache.sql
--
-- Answer once, serve many. A visitor asks "tell me about this JD"; the model
-- answers; every visitor who asks the same thing afterwards gets that answer
-- from Postgres with no LLM call at all.
--
-- ── The key is immutable, so nothing here ever needs invalidating ─────────
-- Both halves were already append-only before this table existed:
--
--   vara_jd_version   immutable by design — applications pin the version that
--                     scored them, so a version's content never changes
--   vani_prompt       append-only, one row per version, one active per scope
--
-- So (jd_version_id, prompt_id, model) names an answer that is correct
-- FOREVER. Publish JD v2 → a different jd_version_id → miss → fresh answer.
-- Edit the prompt in Prompt Studio → a new vani_prompt row → miss. Change
-- LLM_PRIMARY_MODEL → miss. There is no expiry, no bust, no stale read, and
-- no invalidation code to get wrong. That property is inherited, not designed
-- here, and it is the reason this table is safe to keep indefinitely.
--
-- ── ONLY IMPERSONAL TURNS MAY BE CACHED — the whole safety story ──────────
-- "Tell me about this JD" has one answer for everybody. "Am I a good fit?"
-- does not, and serving one candidate's assessment to the next is a data
-- leak, not a cache hit.
--
-- The rule is STRUCTURAL, never a classification: a turn is cacheable only if
-- the context that produced it contained NO candidate-scoped input. The
-- assembler knows what it put in, so the writer can prove this rather than
-- judge it. A judgement about whether a question "sounds personal" will
-- eventually be wrong; this cannot be.
--
-- Nothing in the schema can enforce that — it is a property of the caller —
-- so it is stated here, and the caller is where it must be tested.
--
-- ── Why no HNSW index, deliberately ──────────────────────────────────────
-- Every other vector column in this schema (246) carries HNSW. This one does
-- not, and that is not an oversight. Lookups are scoped to ONE key first —
-- one JD version, one prompt, one model — and that candidate set is tens of
-- rows, not thousands. A btree on the key columns followed by an exact cosine
-- over those few rows beats an approximate index at this size, and it is
-- exact rather than approximate. HNSW earns its keep at scale this table does
-- not have per key. Revisit only if a single JD ever accumulates thousands of
-- distinct questions.
--
-- ── What is NOT stored ───────────────────────────────────────────────────
-- The visitor's raw question. Cache matching needs only the embedding, and a
-- question can carry personal data ("I'm Rahul, tell me about this JD") even
-- when the answer it produced cannot. `question_redacted` exists so a human
-- reviewing the cache can read what was asked; the verbatim text is never
-- kept. Same treatment as the router's catch layer, for the same reason.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS vara_answer_cache (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES vani_tenant(id) ON DELETE CASCADE,

  -- ── the key ────────────────────────────────────────────────────────────
  -- CASCADE on both: an answer about a JD version that no longer exists, or
  -- produced by a prompt row that has been removed, is not worth keeping.
  jd_version_id       uuid NOT NULL REFERENCES vara_jd_version(id) ON DELETE CASCADE,
  prompt_id           uuid NOT NULL REFERENCES vani_prompt(id) ON DELETE CASCADE,
  -- Free text, matching LLM_PRIMARY_MODEL / the failover model as configured.
  -- Not an enum: the model set changes without a migration, and a cache keyed
  -- to a model nobody runs any more simply stops being hit.
  model               text NOT NULL,

  -- ── the question, matched not stored ───────────────────────────────────
  question_embedding  vector(768) NOT NULL,
  question_redacted   text NOT NULL,

  -- ── the answer ─────────────────────────────────────────────────────────
  answer              text NOT NULL,

  -- Which run produced it. Bare uuid, no FK: gt_agent_runs is on the gt_
  -- spine and this table is on the vani_/vara_ one, and a cache row
  -- outliving its run is fine — provenance, not a dependency.
  produced_by_run     uuid,

  -- ── economics, so the value is measurable rather than assumed ──────────
  hit_count           int NOT NULL DEFAULT 0 CHECK (hit_count >= 0),
  last_hit_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE vara_answer_cache IS
  'Cached impersonal answers about a JD version. Key is immutable so entries '
  'never go stale. Writers MUST prove the turn used no candidate-scoped '
  'context before inserting — see the migration header.';

-- The lookup path: narrow to one key, then cosine over the few rows left.
CREATE INDEX IF NOT EXISTS idx_vara_answer_cache_key
  ON vara_answer_cache (tenant_id, jd_version_id, prompt_id, model);

-- Two visitors asking the same thing at the same instant both miss and both
-- insert. That yields two rows with the same answer, which the next lookup
-- matches identically — harmless, and cheaper than serialising every miss
-- behind a lock. Deliberately NOT a unique constraint: near-duplicate
-- questions are the normal case and would fight one.

ALTER TABLE vara_answer_cache ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'vara_answer_cache' AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON vara_answer_cache
      USING (tenant_id = vani_current_tenant())
      WITH CHECK (tenant_id = vani_current_tenant());
  END IF;
END $$;
