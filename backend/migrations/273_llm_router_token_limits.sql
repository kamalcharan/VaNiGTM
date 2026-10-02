-- ============================================================================
-- 273 — the router counts TOKENS as well as requests (Charan, 2026-10-02:
-- "we add limits").
--
-- Groq's free tier allows openai/gpt-oss-120b 30 requests a minute and 1,000
-- a day — and only 8,000 tokens a minute and 200,000 a day. The token limits
-- bind first (~55 site reads a day), so a router that counted requests alone
-- learned the limit by hitting it: 429, cooldown, retry, 429. With
-- LLM_<CODE>_TPM / _TPD it plans around them and skips with the numbers.
--
-- No new table or column: gt_llm_route_state() (272) gains two counts, summed
-- from gt_llm_calls exactly as the request counts are. Its return type
-- changes, so it is dropped and recreated (Postgres cannot replace a function
-- whose OUT columns change). Idempotent.
-- ============================================================================

DROP FUNCTION IF EXISTS gt_llm_route_state();

CREATE FUNCTION gt_llm_route_state()
RETURNS TABLE (provider_code TEXT, calls_minute INTEGER, calls_today INTEGER, cooldown_until TIMESTAMPTZ,
               tokens_minute BIGINT, tokens_today BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.provider_code,
         count(*) FILTER (WHERE c.created_at > now() - interval '1 minute'
                            AND c.outcome NOT IN ('refused_context', 'invalid'))::int,
         count(*) FILTER (WHERE c.outcome NOT IN ('refused_context', 'invalid'))::int,
         max(c.cooldown_until),
         coalesce(sum(c.prompt_tokens + c.answer_tokens) FILTER (WHERE c.created_at > now() - interval '1 minute'), 0)::bigint,
         coalesce(sum(c.prompt_tokens + c.answer_tokens), 0)::bigint
    FROM gt_llm_calls c
   WHERE c.created_at >= (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
   GROUP BY c.provider_code
$$;

REVOKE ALL ON FUNCTION gt_llm_route_state() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vanigtm_app') THEN
    GRANT EXECUTE ON FUNCTION gt_llm_route_state() TO vanigtm_app;
  END IF;
END $$;
