-- pulse-skill: list_pulse_queue
-- Returns all clients with an active pulse config and their latest/next session.
-- Ordered by urgency: overdue first, then due-soon, upcoming, completed.
-- Supports filtering by urgency and frequency.

SELECT
    pc.id                           AS config_id,
    pc.client_id,
    pc.frequency,
    pc.template,
    pc.medium,
    pc.jtd_auto_schedule,
    pc.vani_auto_brief,
    pc.assigned_to,

    -- Client display
    c.name                          AS client_name,
    c.prefix                        AS client_prefix,
    UPPER(
        LEFT(TRIM(c.name), 1) ||
        COALESCE(
            NULLIF(
                LEFT(SPLIT_PART(TRIM(c.name), ' ', -1), 1),
                LEFT(TRIM(c.name), 1)
            ),
            ''
        )
    )                               AS initials,

    -- Latest session fields (NULL if no session yet)
    ps.id                           AS session_id,
    ps.scheduled_at,
    ps.status                       AS session_status,
    ps.started_at,
    ps.ended_at,
    ps.duration_minutes,
    ps.medium                       AS session_medium,
    ps.vani_brief,

    -- Urgency classification
    CASE
        WHEN ps.id IS NULL                                                 THEN 'no_session'
        WHEN ps.status IN ('completed', 'cancelled')                       THEN 'completed'
        WHEN ps.status = 'missed'                                          THEN 'overdue'
        WHEN ps.scheduled_at < NOW()                                       THEN 'overdue'
        WHEN ps.scheduled_at < NOW() + INTERVAL '7 days'                  THEN 'due_soon'
        ELSE                                                                    'upcoming'
    END                             AS urgency,

    -- Positive = days past due, negative = days until due
    ROUND(EXTRACT(EPOCH FROM (NOW() - ps.scheduled_at)) / 86400)::INT     AS days_from_now,

    -- Last completed session
    (
        SELECT MAX(lps.scheduled_at)
        FROM   ki_pulse_sessions lps
        WHERE  lps.tenant_id  = pc.tenant_id
          AND  lps.is_live    = pc.is_live
          AND  lps.config_id  = pc.id
          AND  lps.status     = 'completed'
    )                               AS last_completed_at,

    -- Total completed sessions (YTD)
    (
        SELECT COUNT(*)
        FROM   ki_pulse_sessions lps
        WHERE  lps.tenant_id  = pc.tenant_id
          AND  lps.is_live    = pc.is_live
          AND  lps.config_id  = pc.id
          AND  lps.status     = 'completed'
          AND  EXTRACT(YEAR FROM lps.scheduled_at) = EXTRACT(YEAR FROM NOW())
    )::INT                          AS completed_ytd

FROM  ki_pulse_config pc
JOIN  ki_clients c
  ON  c.id = pc.client_id

-- Latest session per config (any status)
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
  AND pc.is_active = true
  AND (
    $urgency::TEXT IS NULL OR
    CASE
        WHEN ps.id IS NULL                                                 THEN 'no_session'
        WHEN ps.status IN ('completed', 'cancelled')                       THEN 'completed'
        WHEN ps.status = 'missed'                                          THEN 'overdue'
        WHEN ps.scheduled_at < NOW()                                       THEN 'overdue'
        WHEN ps.scheduled_at < NOW() + INTERVAL '7 days'                  THEN 'due_soon'
        ELSE                                                                    'upcoming'
    END = $urgency::TEXT
  )
  AND ($frequency::TEXT IS NULL OR pc.frequency = $frequency::TEXT)

ORDER BY
    CASE
        WHEN ps.id IS NULL                                                 THEN 5
        WHEN ps.status IN ('completed', 'cancelled')                       THEN 4
        WHEN ps.status = 'missed'                                          THEN 1
        WHEN ps.scheduled_at < NOW()                                       THEN 1
        WHEN ps.scheduled_at < NOW() + INTERVAL '7 days'                  THEN 2
        ELSE                                                                    3
    END ASC,
    ps.scheduled_at ASC NULLS LAST

LIMIT  $limit
OFFSET $offset;
