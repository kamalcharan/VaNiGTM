-- ============================================================================
-- Migration 191: agent run checkpoints — resume from point of failure
--
-- Long agent runs (competitor research: ~8 sequential LLM calls; ingestion:
-- one LLM call per chunk) can die mid-pipeline on an LLM timeout or the
-- daily token budget. Without persistence a retry restarts from zero,
-- re-spending every token already spent.
--
-- gt_agent_runs.checkpoint holds the run's working state, merged in as each
-- expensive stage completes (agent-core/agent.runner: saveCheckpoint /
-- loadCheckpoint / findResumableRun). A resumed run loads the latest failed
-- run's checkpoint and skips completed stages — visibly, as a 'restore'
-- step in the feed.
--
-- Apply manually: cd backend && npm run db:migrate
-- ============================================================================

BEGIN;

ALTER TABLE gt_agent_runs
    ADD COLUMN IF NOT EXISTS checkpoint JSONB;

COMMENT ON COLUMN gt_agent_runs.checkpoint IS
    'Working state saved per stage for resume-from-failure (agent.runner saveCheckpoint). NULL = no checkpoint taken.';

-- Resume lookups: latest failed run with a checkpoint for (tenant, agent).
CREATE INDEX IF NOT EXISTS idx_agent_runs_resumable
    ON gt_agent_runs (tenant_id, agent_name, created_at DESC)
    WHERE status = 'failed' AND checkpoint IS NOT NULL;

COMMIT;
