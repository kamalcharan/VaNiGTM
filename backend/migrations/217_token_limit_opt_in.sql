-- ============================================================
-- Migration: 217_token_limit_opt_in.sql
-- Purpose:   No tenant gets a token cap they did not choose.
--
-- ── WHAT WENT WRONG ───────────────────────────────────────────────────
--
-- gt_tenant_context.daily_token_limit was NOT NULL DEFAULT 100000 (migration
-- 181). That default was sized for a conversational agent, where 100k tokens
-- is a generous day. Account research costs about 14,000 tokens per company,
-- so the same number is SEVEN COMPANIES — and the first real batch died at
-- company eight against a limit nobody had ever set.
--
-- The column is per tenant, but a default applied to every tenant is a
-- product-level cap wearing a per-tenant column. Whoever runs a tenant gets
-- to decide what it may spend; the framework does not get to decide it for
-- them by omission.
--
-- ── AFTER THIS ────────────────────────────────────────────────────────
--
--   NULL          no cap. The new default, and what every tenant still
--                 sitting on the old 100000 is moved to.
--   a number      a cap somebody deliberately set FOR THAT TENANT.
--
-- ── WHAT IS NOT REMOVED: THE METER ────────────────────────────────────
--
-- daily_token_usage keeps counting, always. Metering and capping are
-- different things and only one of them was the problem. Usage is how anyone
-- learns what a batch of a hundred companies actually costs — and without
-- that number, a future cap would be picked by guessing, which is exactly how
-- 100000 got here.
--
-- ── WHY ONLY THE ROWS STILL ON THE DEFAULT ────────────────────────────
--
-- A tenant sitting on exactly 100000 never chose it; anything else was typed
-- by somebody, and silently deleting a limit an operator set would be a worse
-- version of the same mistake.
-- ============================================================

DO $$ BEGIN
    IF to_regclass('public.gt_tenant_context') IS NULL THEN
        RAISE EXCEPTION
            'Missing prerequisite table gt_tenant_context — it comes from migration 181.';
    END IF;
END $$;

ALTER TABLE gt_tenant_context
    ALTER COLUMN daily_token_limit DROP NOT NULL,
    ALTER COLUMN daily_token_limit DROP DEFAULT;

UPDATE gt_tenant_context
   SET daily_token_limit = NULL,
       updated_at        = now()
 WHERE daily_token_limit = 100000;

COMMENT ON COLUMN gt_tenant_context.daily_token_limit IS
    'Daily token cap for THIS tenant. NULL = no cap, and that is the default — a limit exists only because somebody set it for this tenant. Usage is metered either way (daily_token_usage).';
COMMENT ON COLUMN gt_tenant_context.daily_token_usage IS
    'Tokens spent per day, split by source: {"YYYY-MM-DD": {"vps": N, "escalation": M}}. Always recorded, cap or no cap — this is how anyone finds out what a batch costs.';
