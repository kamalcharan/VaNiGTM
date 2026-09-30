-- The funnel tenant's spend-tracking row, with its cap from .env. Without a
-- row nothing is counted and nothing is capped, so it is written before every
-- new read. Runs inside the funnel tenant's context (RLS). $1 tenant · $2 limit
INSERT INTO gt_tenant_context (tenant_id, daily_token_limit)
VALUES ($1, $2)
ON CONFLICT (tenant_id) DO UPDATE SET daily_token_limit = EXCLUDED.daily_token_limit;
