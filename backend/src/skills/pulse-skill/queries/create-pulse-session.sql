-- pulse-skill: create_pulse_session
-- Creates a new pulse session instance.
-- config_id is optional (NULL for ad-hoc sessions).

INSERT INTO ki_pulse_sessions (
    tenant_id,
    is_live,
    config_id,
    client_id,
    contact_id,
    scheduled_at,
    status,
    template,
    medium,
    jtd_appointment_id,
    assigned_to
)
VALUES (
    $tenant_id,
    $is_live,
    $config_id::BIGINT,
    $client_id::INT,
    $contact_id::BIGINT,
    $scheduled_at::TIMESTAMPTZ,
    'scheduled',
    $template::TEXT,
    $medium::TEXT,
    $jtd_appointment_id::TEXT,
    $assigned_to::TEXT
)
RETURNING
    id, tenant_id, is_live,
    config_id, client_id, contact_id,
    scheduled_at, started_at, ended_at, duration_minutes,
    status, template, medium, jtd_appointment_id,
    meeting_notes, vani_brief, vani_summary,
    summary_confirmed, report_generated,
    next_session_id, assigned_to,
    created_at, updated_at;
