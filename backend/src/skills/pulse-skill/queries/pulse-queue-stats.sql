-- pulse-skill: pulse_queue_stats
-- Returns aggregate counts for the Pulse Queue header strip.
-- Uses the same lateral join as list-pulse-queue for consistency.

SELECT
    COUNT(*) FILTER (
        WHERE ps.id IS NOT NULL
          AND ps.status NOT IN ('completed','cancelled')
          AND ps.scheduled_at < NOW()
    )::INT          AS overdue_count,

    COUNT(*) FILTER (
        WHERE ps.id IS NOT NULL
          AND ps.status NOT IN ('completed','cancelled','missed')
          AND ps.scheduled_at >= NOW()
          AND ps.scheduled_at <  NOW() + INTERVAL '7 days'
    )::INT          AS due_this_week_count,

    COUNT(*) FILTER (
        WHERE ps.id IS NOT NULL
          AND ps.status NOT IN ('completed','cancelled','missed')
          AND ps.scheduled_at >= NOW() + INTERVAL '7 days'
    )::INT          AS upcoming_count,

    COUNT(*) FILTER (
        WHERE ps.id IS NOT NULL
          AND ps.status = 'completed'
          AND EXTRACT(YEAR FROM ps.scheduled_at) = EXTRACT(YEAR FROM NOW())
    )::INT          AS completed_ytd,

    COUNT(pc.id)::INT AS total_configs

FROM  ki_pulse_config pc
LEFT JOIN LATERAL (
    SELECT *
    FROM   ki_pulse_sessions lps
    WHERE  lps.tenant_id = pc.tenant_id
      AND  lps.is_live   = pc.is_live
      AND  lps.config_id = pc.id
    ORDER BY lps.scheduled_at DESC
    LIMIT 1
) ps ON true

WHERE pc.tenant_id = $tenant_id
  AND pc.is_live   = $is_live
  AND pc.is_active = true;
