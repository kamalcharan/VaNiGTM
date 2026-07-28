-- batch_status: is anything actually happening?
--
-- The screen queues an event and says "queued 10 companies". If the worker
-- is not running, that message is a lie the user cannot detect — the event
-- sits at 'pending' forever and no brief ever appears. This query is how the
-- screen tells the truth instead (CLAUDE.md rule 12).
--
-- The signal is age: gt_events.status stays 'pending' only until a worker
-- polls, which happens every 3 seconds. A batch still pending after half a
-- minute means nothing is consuming the bus.
--
-- Named params: $tenant_id

WITH latest_event AS (
    SELECT id, status, created_at, processed_at, error,
           EXTRACT(EPOCH FROM (now() - created_at))::int AS age_seconds,
           payload
    FROM   gt_events
    WHERE  tenant_id  = $tenant_id
      AND  event_type = 'ACCOUNT_RESEARCH_REQUESTED'
    ORDER  BY created_at DESC
    LIMIT  1
),
latest_run AS (
    SELECT id::text AS run_id, status, steps, checkpoint, output, error_trace,
           started_at, completed_at,
           EXTRACT(EPOCH FROM (now() - COALESCE(completed_at, started_at, created_at)))::int
               AS age_seconds
    FROM   gt_agent_runs
    WHERE  tenant_id  = $tenant_id
      AND  agent_name = 'ACCOUNT_RESEARCH_REQUESTED'
    ORDER  BY created_at DESC
    LIMIT  1
)
SELECT
    e.id                                       AS event_id,
    e.status                                   AS event_status,
    e.age_seconds                              AS event_age_seconds,
    e.error                                    AS event_error,
    (e.payload->>'limit')::int                 AS requested,
    r.run_id,
    r.status                                   AS run_status,
    r.error_trace,
    r.output,
    -- How far through the batch it is: the agent checkpoints after EVERY
    -- account, so this is live progress rather than a guess.
    COALESCE(jsonb_array_length(r.checkpoint->'done'), 0) AS done_count,
    COALESCE(jsonb_array_length(r.steps), 0)             AS step_count,
    r.started_at,
    r.completed_at,
    CASE
        WHEN e.id IS NULL                              THEN 'never_run'
        -- Nothing has picked the event up long after a 3-second poll cycle.
        WHEN e.status = 'pending' AND e.age_seconds > 30 THEN 'worker_down'
        WHEN e.status = 'pending'                      THEN 'queued'
        WHEN e.status = 'processing' OR r.status = 'running' THEN 'running'
        WHEN e.status = 'failed' OR r.status = 'failed'      THEN 'failed'
        WHEN r.status = 'completed'                    THEN 'completed'
        ELSE 'unknown'
    END                                        AS verdict
FROM       latest_event e
FULL OUTER JOIN latest_run r ON true;
