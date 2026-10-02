-- ============================================================================
-- 272 — the model router's two tables (POA 2026-10-01 D-Q13–D-Q17; P0 §9.7–9.8)
--
-- Approved by Charan 2026-10-02 ("approved, go ahead"): S19 and S20.
--
-- S19  gt_llm_calls — one row per ROUTED model call: provider, model, step,
--      route, rung, tokens, outcome, latency. Per-minute and per-day quotas,
--      the 429 cooldowns, the tenant's usage and the admin's "today by route"
--      are all COUNTED from it, so the numbers on the Models screen and the
--      numbers the router obeys are the same numbers.
--      Two outcomes are verdicts, not requests, and never count against a
--      provider's quota: `refused_context` (the prompt did not fit that
--      provider's window, nothing was sent) and `invalid` (the provider
--      answered, the answer failed validation — the call itself has its own
--      `ok` row).
--
-- S20  gt_llm_provider_switch — the admin's on/off switch per model, per
--      purpose (`enrichment` today). APPEND-ONLY: the latest row per
--      (provider, purpose) is the state, the earlier rows are who switched
--      what and when. NO ROW MEANS OFF: a provider newly added to .env is not
--      used — or paid for — until the admin switches it on.
--
-- RLS: gt_llm_calls carries tenant_id and is isolated like every gt_ table.
-- Quotas are platform-wide, though: a provider's 30 calls a minute are shared
-- by every tenant. So the cross-tenant COUNTS come from two SECURITY DEFINER
-- functions that return numbers per provider and route — never a row, never
-- a tenant. gt_llm_provider_switch has no tenant_id (platform data, like the
-- pool's tables); writes go through the admin-only model-router-skill.
--
-- Idempotent and guarded. Applied with the runner (DEPLOY.md), never pasted.
-- ============================================================================

CREATE TABLE IF NOT EXISTS gt_llm_calls (
  id              BIGSERIAL    PRIMARY KEY,
  tenant_id       UUID         NULL,           -- the tenant the call was made for (the admin's own for pool work)
  run_id          TEXT         NULL,           -- gt_agent_runs.id, when the call belongs to a run
  purpose         TEXT         NOT NULL,       -- what the switch is keyed on: 'enrichment'
  step            TEXT         NULL,           -- the agent's step name, e.g. 'classify_industry'
  route           TEXT         NOT NULL CHECK (route IN ('high', 'medium', 'low')),
  rung            SMALLINT     NOT NULL,       -- position in the route, 1-based
  provider_code   TEXT         NOT NULL,       -- as declared in LLM_PROVIDERS, or 'qwen' / 'haiku'
  model           TEXT         NOT NULL,
  data_class      TEXT         NOT NULL CHECK (data_class IN ('public_company', 'tenant', 'people')),
  prompt_tokens   INTEGER      NOT NULL DEFAULT 0,
  answer_tokens   INTEGER      NOT NULL DEFAULT 0,
  outcome         TEXT         NOT NULL CHECK (outcome IN
                    ('ok', 'rate_limited', 'timeout', 'error', 'refused_context', 'invalid')),
  truncated       BOOLEAN      NOT NULL DEFAULT false,
  latency_ms      INTEGER      NULL,
  detail          TEXT         NULL,           -- the provider's own words on a failure, first 500 chars
  cooldown_until  TIMESTAMPTZ  NULL,           -- set on rate_limited: Retry-After, else LLM_ROUTER_COOLDOWN_SECONDS
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gt_llm_calls_provider_time ON gt_llm_calls (provider_code, created_at DESC);
CREATE INDEX IF NOT EXISTS gt_llm_calls_tenant_time   ON gt_llm_calls (tenant_id, created_at DESC);

ALTER TABLE gt_llm_calls ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY gt_llm_calls_tenant_isolation ON gt_llm_calls
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS gt_llm_provider_switch (
  id             BIGSERIAL    PRIMARY KEY,
  provider_code  TEXT         NOT NULL,
  purpose        TEXT         NOT NULL CHECK (purpose IN ('enrichment')),
  enabled        BOOLEAN      NOT NULL,
  changed_by     UUID         NULL,           -- vn_users.id of the admin
  note           TEXT         NULL,
  changed_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gt_llm_provider_switch_latest
  ON gt_llm_provider_switch (provider_code, purpose, changed_at DESC, id DESC);

-- ── Append-only, held by the database rather than by the grants ────────────
-- The grants below withhold UPDATE/DELETE, but scripts/grant-vanigtm-app.sql
-- grants DML on ALL tables whenever it is re-run. A trigger holds either way:
-- a switch's history and a call's record are evidence, never edited.
-- TRUNCATE is left to the owner (tests, a deliberate reset).
CREATE OR REPLACE FUNCTION gt_llm_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only — write a new row instead', TG_TABLE_NAME;
END $$;

DROP TRIGGER IF EXISTS gt_llm_calls_append_only ON gt_llm_calls;
CREATE TRIGGER gt_llm_calls_append_only BEFORE UPDATE OR DELETE ON gt_llm_calls
  FOR EACH ROW EXECUTE FUNCTION gt_llm_append_only();
DROP TRIGGER IF EXISTS gt_llm_provider_switch_append_only ON gt_llm_provider_switch;
CREATE TRIGGER gt_llm_provider_switch_append_only BEFORE UPDATE OR DELETE ON gt_llm_provider_switch
  FOR EACH ROW EXECUTE FUNCTION gt_llm_append_only();

-- ── The platform-wide counts the router obeys (no rows, no tenants) ─────────
-- Calls that reached the provider in the last minute and since 00:00 UTC, and
-- the latest cooldown it imposed. Verdict rows (refused_context, invalid) are
-- not requests and are not counted.
CREATE OR REPLACE FUNCTION gt_llm_route_state()
RETURNS TABLE (provider_code TEXT, calls_minute INTEGER, calls_today INTEGER, cooldown_until TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.provider_code,
         count(*) FILTER (WHERE c.created_at > now() - interval '1 minute'
                            AND c.outcome NOT IN ('refused_context', 'invalid'))::int,
         count(*) FILTER (WHERE c.outcome NOT IN ('refused_context', 'invalid'))::int,
         max(c.cooldown_until)
    FROM gt_llm_calls c
   WHERE c.created_at >= (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
   GROUP BY c.provider_code
$$;

-- Today's calls per route and provider, for the admin's Models screen.
-- moved_on = the call did not answer (limit, timeout, error, too large) and the
-- route went on; bad = the provider answered and the answer failed validation.
CREATE OR REPLACE FUNCTION gt_llm_usage_today()
RETURNS TABLE (route TEXT, provider_code TEXT, calls INTEGER, ok INTEGER, moved_on INTEGER, bad INTEGER, tokens BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.route, c.provider_code,
         count(*) FILTER (WHERE c.outcome NOT IN ('invalid'))::int,
         count(*) FILTER (WHERE c.outcome = 'ok')::int,
         count(*) FILTER (WHERE c.outcome IN ('rate_limited', 'timeout', 'error', 'refused_context'))::int,
         count(*) FILTER (WHERE c.outcome = 'invalid')::int,
         coalesce(sum(c.prompt_tokens + c.answer_tokens), 0)::bigint
    FROM gt_llm_calls c
   WHERE c.created_at >= (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
   GROUP BY c.route, c.provider_code
$$;

REVOKE ALL ON FUNCTION gt_llm_route_state() FROM PUBLIC;
REVOKE ALL ON FUNCTION gt_llm_usage_today() FROM PUBLIC;

-- ── Grants for the runtime role: append-only on both tables ─────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vanigtm_app') THEN
    GRANT SELECT, INSERT ON gt_llm_calls, gt_llm_provider_switch TO vanigtm_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON gt_llm_calls, gt_llm_provider_switch FROM vanigtm_app;
    GRANT USAGE, SELECT ON SEQUENCE gt_llm_calls_id_seq, gt_llm_provider_switch_id_seq TO vanigtm_app;
    GRANT EXECUTE ON FUNCTION gt_llm_route_state(), gt_llm_usage_today() TO vanigtm_app;
  END IF;
END $$;

