-- pulse-skill: create_pulse
-- Inserts a manual follow-up pulse and returns the full row.

INSERT INTO ki_pulses (
    tenant_id,
    is_live,
    pulse_type,
    origin,
    status,
    priority,
    title,
    body,
    notes,
    due_date,
    contact_id,
    client_id,
    snapshot_id,
    assigned_to,
    created_at
) VALUES (
    $tenant_id,
    $is_live,
    $pulse_type,
    'manual',
    'open',
    $priority,
    $title,
    $body,
    $notes,
    $due_date,
    $contact_id,
    $client_id,
    $snapshot_id,
    $assigned_to,
    NOW()
)
RETURNING
    id, pulse_type, origin, status, priority,
    title, body, notes, due_date, snoozed_until,
    contact_id, client_id, snapshot_id, assigned_to,
    completed_at, completed_by, created_at, expires_at;
