-- ============================================================================
-- 250_vani_intent_match.sql
--
-- The router's decision log AND the catch layer's record. One table, because
-- they are the same event seen from two ends: what the router decided, and
-- what it could not decide.
--
-- ── Why not vara_match_log ───────────────────────────────────────────────
-- That table (246) is entity → entity: `matched_from_kind` is an enum of ROW
-- TYPES, both ends are ids, and its comment says "referenced by ids only per
-- V-13 (no PII)". Router matching is FREE TEXT → intent, and the free text is
-- precisely what the catch layer needs to be worth anything. Forcing it into
-- vara_match_log would mean either widening that enum with a non-row kind or
-- dropping the query — and the query is the product here.
--
-- ── Written BEFORE the outcome commits ───────────────────────────────────
-- The invariant migration 246 states: a nearest-neighbour match that
-- influences an outcome must be a row first, or the similarity becomes a
-- hidden input to a decision. Same rule, same reason, applied to routing:
-- resolveIntent() writes here and only then returns.
--
-- ── The catch layer is where the compounding is ──────────────────────────
-- Every `unmatched` row is evidence of a missing intent or a missing example.
-- Clustered over the HNSW index they become PROPOSALS for new intents — the
-- calibration loop applied to routing. The operator surface for reviewing
-- those clusters is Phase 6; this table is what makes it possible to build
-- then rather than starting the clock later.
--
-- ── PII decision (2026-08-27) ────────────────────────────────────────────
-- Visitor free text can carry personal data from someone who has consented to
-- nothing — they are a stranger on a third party's website. So the row stores:
--
--   query_embedding  what clustering actually needs
--   query_redacted   emails/phones/handles stripped, so a human can NAME a
--                    cluster once the machine has found it
--
-- and never the raw message. `retain_until` defaults to 90 days and exists to
-- force the retention decision to be explicit rather than "someday".
--
-- The table carries NO candidate id — `session_ref` is the widget session, not
-- a person — so it is deliberately NOT in vara_purge_candidate's path.
-- Retention is the control here, and that is a choice, not an oversight.
-- Revisit the moment session_ref is ever joined to an application.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS vani_intent_match (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES vani_tenant(id) ON DELETE CASCADE,

  -- The widget session that asked. Opaque, short-lived, and never a person.
  session_ref       text,

  outcome           text NOT NULL
                    CHECK (outcome IN ('routed','disambiguated','unmatched')),

  -- Nullable on `unmatched` by definition. ON DELETE SET NULL rather than
  -- CASCADE: retiring an intent must not erase the evidence of how often it
  -- was asked for — that history is an argument about the retirement.
  matched_intent    uuid REFERENCES vani_agent_intent(id) ON DELETE SET NULL,
  score             real CHECK (score >= 0 AND score <= 1),

  -- The runner-up is why `disambiguated` happened, so it is data, not colour.
  runner_up_intent  uuid REFERENCES vani_agent_intent(id) ON DELETE SET NULL,
  runner_up_score   real CHECK (runner_up_score >= 0 AND runner_up_score <= 1),

  query_embedding   vector(768),
  query_redacted    text,

  retain_until      date NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE vani_intent_match IS
  'Router decision log and catch-layer record. Stores the query embedding and '
  'a redacted form, never the raw visitor message. Written before the outcome '
  'commits, per the vara_match_log invariant.';

-- The catch layer's own query: unmatched rows for a tenant, newest first.
CREATE INDEX IF NOT EXISTS idx_vani_intent_match_outcome
  ON vani_intent_match (tenant_id, outcome, created_at DESC);

-- Retention sweep.
CREATE INDEX IF NOT EXISTS idx_vani_intent_match_retain
  ON vani_intent_match (retain_until);

-- HNSW: clustering unmatched queries against each other is the whole point.
CREATE INDEX IF NOT EXISTS idx_vani_intent_match_embedding_hnsw
  ON vani_intent_match USING hnsw (query_embedding vector_cosine_ops);

ALTER TABLE vani_intent_match ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'vani_intent_match' AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON vani_intent_match
      USING (tenant_id = vani_current_tenant())
      WITH CHECK (tenant_id = vani_current_tenant());
  END IF;
END $$;
