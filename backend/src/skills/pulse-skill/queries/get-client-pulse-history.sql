-- pulse-skill: get_client_pulse_history
-- Returns pulse sessions for a specific client, newest first.
-- Actions are aggregated as JSON per session for the timeline view.

SELECT
    ps.id,
    ps.config_id,
    ps.client_id,
    ps.contact_id,
    ps.scheduled_at,
    ps.started_at,
    ps.ended_at,
    ps.duration_minutes,
    ps.status,
    ps.template,
    ps.medium,
    ps.meeting_notes,
    ps.vani_summary,
    ps.summary_confirmed,
    ps.report_generated,
    ps.next_session_id,
    ps.assigned_to,
    ps.created_at,

    -- Actions aggregated as JSON array (empty array if none)
    COALESCE(
        JSON_AGG(
            JSON_BUILD_OBJECT(
                'id',          pa.id,
                'text',        pa.text,
                'owner_type',  pa.owner_type,
                'due_date',    pa.due_date,
                'status',      pa.status,
                'completed_at', pa.completed_at
            )
            ORDER BY pa.created_at ASC
        ) FILTER (WHERE pa.id IS NOT NULL),
        '[]'::JSON
    )                   AS actions,

    -- Gap count for summary display
    COUNT(pg.id) FILTER (WHERE pg.id IS NOT NULL)::INT AS gap_count

FROM      ki_pulse_sessions ps
LEFT JOIN ki_pulse_session_actions pa
  ON  pa.tenant_id  = ps.tenant_id
  AND pa.session_id = ps.id
LEFT JOIN ki_pulse_session_gaps pg
  ON  pg.tenant_id  = ps.tenant_id
  AND pg.session_id = ps.id

WHERE ps.tenant_id = $tenant_id
  AND ps.is_live   = $is_live
  AND ps.client_id = $client_id::INT

GROUP BY
    ps.id, ps.config_id, ps.client_id, ps.contact_id,
    ps.scheduled_at, ps.started_at, ps.ended_at, ps.duration_minutes,
    ps.status, ps.template, ps.medium, ps.meeting_notes, ps.vani_summary,
    ps.summary_confirmed, ps.report_generated, ps.next_session_id,
    ps.assigned_to, ps.created_at

ORDER BY ps.scheduled_at DESC

LIMIT  $limit
OFFSET $offset;
