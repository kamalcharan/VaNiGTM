-- pulse-skill: update_pulse_session
-- Updates mutable fields on a pulse session.
-- Only non-null params are applied (COALESCE pattern).
-- started_at / ended_at / duration_minutes set automatically on status transitions.

UPDATE ki_pulse_sessions
SET
    status              = COALESCE($status::TEXT,              status),
    template            = COALESCE($template::TEXT,            template),
    medium              = COALESCE($medium::TEXT,              medium),
    scheduled_at        = COALESCE($scheduled_at::TIMESTAMPTZ, scheduled_at),
    jtd_appointment_id  = COALESCE($jtd_appointment_id::TEXT,  jtd_appointment_id),
    meeting_notes       = COALESCE($meeting_notes::TEXT,       meeting_notes),
    vani_brief          = COALESCE($vani_brief::TEXT,          vani_brief),
    vani_summary        = COALESCE($vani_summary::TEXT,        vani_summary),
    summary_confirmed   = COALESCE($summary_confirmed::BOOLEAN, summary_confirmed),
    report_generated    = COALESCE($report_generated::BOOLEAN,  report_generated),
    assigned_to         = COALESCE($assigned_to::TEXT,         assigned_to),
    next_session_id     = COALESCE($next_session_id::BIGINT,   next_session_id),

    -- Auto-set timestamps on status transitions
    started_at   = CASE
                       WHEN $status::TEXT = 'in_progress' AND started_at IS NULL THEN NOW()
                       ELSE started_at
                   END,
    ended_at     = CASE
                       WHEN $status::TEXT IN ('completed','missed','cancelled') AND ended_at IS NULL THEN NOW()
                       ELSE ended_at
                   END,
    duration_minutes = CASE
                           WHEN $status::TEXT = 'completed'
                                AND started_at IS NOT NULL
                                AND duration_minutes IS NULL
                           THEN ROUND(EXTRACT(EPOCH FROM (NOW() - started_at)) / 60)::INT
                           WHEN $duration_minutes::INT IS NOT NULL THEN $duration_minutes::INT
                           ELSE duration_minutes
                       END,

    updated_at = NOW()

WHERE id        = $id
  AND tenant_id = $tenant_id
  AND is_live   = $is_live

RETURNING
    id, tenant_id, is_live,
    config_id, client_id, contact_id,
    scheduled_at, started_at, ended_at, duration_minutes,
    status, template, medium, jtd_appointment_id,
    meeting_notes, vani_brief, vani_summary,
    summary_confirmed, report_generated,
    next_session_id, assigned_to,
    created_at, updated_at;
