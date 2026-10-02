-- ============================================================================
-- 274 — scoring profiles (S17) and token top-ups (S18). Approved by Charan
-- 2026-10-02 ("go ahead", after D-Q4–D-Q7, D-Q12 and the S17 discussion).
--
-- S17  gt_score_profiles — how a company's 0–100 readiness score is weighted.
--      tenant_id NULL = the PLATFORM DEFAULT (admin; the common pool always
--      uses it, and so does every tenant without its own). A tenant's own
--      profile is OPTIONAL and created only when someone in that tenant first
--      saves a change — nothing is seeded at signup, so a tenant who never
--      customises follows every improvement to the default.
--      Append-only, versioned per scope: the latest version is in force; every
--      stored score names the scope and version that produced it.
--        part_weights   the seven parts, summing to 100 (tenant may change)
--        item_weights   the split inside each part (platform rows only)
--        level_bounds   where each level starts (platform rows only — a level
--                       means the same thing across the product)
--        follows_platform  a tenant row that says "back to the platform
--                       default" (weights NULL)
--        based_on_version  the platform version a tenant row was copied from,
--                       so "the default changed since — adopt?" is answerable
--      Parts, in order: identity 20 · firmographics 20 · digital 10 ·
--      contact 20 · people 15 · research 10 · signals 5 (D-Q4).
--      Levels: raw 0 · identified 20 · qualified 40 (and passes Complete) ·
--      reachable 60 · campaign_ready 75 (and passes the Exit gate) · strong 90.
--
-- S18  gt_token_topups — a tenant's top-up LEDGER: + rows are top-ups an admin
--      added, − rows are what calls drew once the day's or month's base was
--      used. The balance is the sum. The daily and monthly limits never rise
--      (D-Q12); the top-up is spent after them.
--      gt_tenant_context.monthly_token_limit — a tenant's own monthly limit;
--      NULL = TENANT_MONTHLY_TOKEN_LIMIT from .env. (daily_token_limit NULL now
--      means TENANT_DAILY_TOKEN_LIMIT from .env, no longer "no cap".)
--
-- Idempotent and guarded. Apply with the runner.
-- ============================================================================

-- ── S17 ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gt_score_profiles (
  id                BIGSERIAL    PRIMARY KEY,
  tenant_id         UUID         NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
  version           INTEGER      NOT NULL,
  follows_platform  BOOLEAN      NOT NULL DEFAULT false,
  part_weights      JSONB        NULL,
  item_weights      JSONB        NULL,
  level_bounds      JSONB        NULL,
  based_on_version  INTEGER      NULL,
  note              TEXT         NULL,
  saved_by          UUID         NULL,
  saved_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT gt_score_profiles_shape CHECK (
    (follows_platform AND tenant_id IS NOT NULL AND part_weights IS NULL)
    OR (NOT follows_platform AND part_weights IS NOT NULL)),
  CONSTRAINT gt_score_profiles_platform_only CHECK (
    tenant_id IS NULL OR (item_weights IS NULL AND level_bounds IS NULL)),
  CONSTRAINT gt_score_profiles_platform_full CHECK (
    tenant_id IS NOT NULL OR (item_weights IS NOT NULL AND level_bounds IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS gt_score_profiles_scope_version
  ON gt_score_profiles (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), version);

ALTER TABLE gt_score_profiles ENABLE ROW LEVEL SECURITY;
-- Everyone reads the platform default and their own rows; a tenant writes
-- only its own. A platform row (tenant_id NULL) cannot pass the write policy,
-- so the admin saves the default through the SECURITY DEFINER function below,
-- and the admin check is in code (scoring-skill).
DO $$ BEGIN
  CREATE POLICY gt_score_profiles_read ON gt_score_profiles FOR SELECT
    USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY gt_score_profiles_write ON gt_score_profiles FOR INSERT
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The platform default is written only through this function; the caller
-- (scoring-skill, admin only) is checked in code. Append-only: next version.
CREATE OR REPLACE FUNCTION gt_save_platform_score_profile(
  p_part_weights JSONB, p_item_weights JSONB, p_level_bounds JSONB, p_note TEXT, p_saved_by UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('gt_score_profiles:platform'));
  SELECT COALESCE(max(version), 0) + 1 INTO v FROM gt_score_profiles WHERE tenant_id IS NULL;
  INSERT INTO gt_score_profiles (tenant_id, version, part_weights, item_weights, level_bounds, note, saved_by)
  VALUES (NULL, v, p_part_weights, p_item_weights, p_level_bounds, p_note, p_saved_by);
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION gt_save_platform_score_profile(JSONB, JSONB, JSONB, TEXT, UUID) FROM PUBLIC;

-- Append-only, as the router's tables (272): a score names its version, so a
-- version must never change under it.
CREATE OR REPLACE FUNCTION gt_score_profiles_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only — save a new version instead', TG_TABLE_NAME;
END $$;
DROP TRIGGER IF EXISTS gt_score_profiles_append_only ON gt_score_profiles;
CREATE TRIGGER gt_score_profiles_append_only BEFORE UPDATE OR DELETE ON gt_score_profiles
  FOR EACH ROW EXECUTE FUNCTION gt_score_profiles_append_only();

-- Platform v1 — the weights and levels Charan agreed on 2026-10-02 (D-Q4/D-Q5).
-- Item weights split each part by the evidence that earns it
-- (backend/src/scoring/score.ts names the items).
INSERT INTO gt_score_profiles (tenant_id, version, part_weights, item_weights, level_bounds, note)
SELECT NULL, 1,
  '{"identity":20,"firmographics":20,"digital":10,"contact":20,"people":15,"research":10,"signals":5}'::jsonb,
  '{"identity":{"name":4,"anchor":8,"location":4,"type":4},
    "firmographics":{"industry":10,"size":4,"description":4,"founded":2},
    "digital":{"domain":4,"site_verified":3,"social":3},
    "contact":{"email":8,"phone":6,"address":6},
    "people":{"named":8,"titled":7},
    "research":{"brief":10},
    "signals":{"signal":5}}'::jsonb,
  '{"identified":20,"qualified":40,"reachable":60,"campaign_ready":75,"strong":90}'::jsonb,
  'Platform default v1 — weights and levels agreed 2026-10-02 (D-Q4, D-Q5)'
WHERE NOT EXISTS (SELECT 1 FROM gt_score_profiles WHERE tenant_id IS NULL);

-- ── S18 ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gt_token_topups (
  id          BIGSERIAL    PRIMARY KEY,
  tenant_id   UUID         NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
  tokens      BIGINT       NOT NULL CHECK (tokens <> 0),   -- + added, − drawn
  added_by    UUID         NULL,                           -- the admin, on a + row
  reason      TEXT         NOT NULL,                       -- 'top-up: …' or 'drawn: …'
  run_id      TEXT         NULL,                           -- on a − row, when a run drew it
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gt_token_topups_tenant ON gt_token_topups (tenant_id, created_at DESC);

ALTER TABLE gt_token_topups ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY gt_token_topups_tenant_isolation ON gt_token_topups
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS gt_token_topups_append_only ON gt_token_topups;
CREATE TRIGGER gt_token_topups_append_only BEFORE UPDATE OR DELETE ON gt_token_topups
  FOR EACH ROW EXECUTE FUNCTION gt_score_profiles_append_only();

-- The admin's view across tenants: balance and last top-up per tenant. Numbers
-- per tenant, never a row of another tenant's ledger.
CREATE OR REPLACE FUNCTION gt_token_topup_balances()
RETURNS TABLE (tenant_id UUID, added BIGINT, drawn BIGINT, balance BIGINT, last_topup_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.tenant_id,
         coalesce(sum(t.tokens) FILTER (WHERE t.tokens > 0), 0)::bigint,
         coalesce(-sum(t.tokens) FILTER (WHERE t.tokens < 0), 0)::bigint,
         coalesce(sum(t.tokens), 0)::bigint,
         max(t.created_at) FILTER (WHERE t.tokens > 0)
    FROM gt_token_topups t GROUP BY t.tenant_id
$$;
REVOKE ALL ON FUNCTION gt_token_topup_balances() FROM PUBLIC;

ALTER TABLE gt_tenant_context ADD COLUMN IF NOT EXISTS monthly_token_limit BIGINT NULL;
COMMENT ON COLUMN gt_tenant_context.monthly_token_limit IS
  'Tokens per calendar month (UTC) for this tenant; NULL = TENANT_MONTHLY_TOKEN_LIMIT from .env (D-Q12, migration 274).';
COMMENT ON COLUMN gt_tenant_context.daily_token_limit IS
  'Tokens per UTC day for this tenant; NULL = TENANT_DAILY_TOKEN_LIMIT from .env (D-Q12, migration 274 — before it NULL meant no cap).';

-- ── Grants for the runtime role ─────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vanigtm_app') THEN
    GRANT SELECT, INSERT ON gt_score_profiles, gt_token_topups TO vanigtm_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON gt_score_profiles, gt_token_topups FROM vanigtm_app;
    GRANT USAGE, SELECT ON SEQUENCE gt_score_profiles_id_seq, gt_token_topups_id_seq TO vanigtm_app;
    GRANT EXECUTE ON FUNCTION gt_save_platform_score_profile(JSONB, JSONB, JSONB, TEXT, UUID),
                              gt_token_topup_balances() TO vanigtm_app;
  END IF;
END $$;
