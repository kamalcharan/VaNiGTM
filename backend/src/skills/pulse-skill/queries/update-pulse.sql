-- pulse-skill: update_pulse
-- Updates mutable fields on a pulse. Only updates fields that are explicitly passed
-- (non-null). completed_at is set automatically when status transitions to 'done'.

UPDATE ki_pulses
SET
    status        = COALESCE($status,       status),
    priority      = COALESCE($priority,     priority),
    title         = COALESCE($title,        title),
    body          = COALESCE($body,         body),
    notes         = COALESCE($notes,        notes),
    due_date      = CASE WHEN $clear_due_date  THEN NULL ELSE COALESCE($due_date,       due_date)  END,
    snoozed_until = CASE WHEN $clear_snooze    THEN NULL ELSE COALESCE($snoozed_until,  snoozed_until) END,
    assigned_to   = COALESCE($assigned_to,  assigned_to),
    completed_at  = CASE
                        WHEN $status = 'done' AND completed_at IS NULL THEN NOW()
                        WHEN $status IN ('open', 'snoozed')            THEN NULL
                        ELSE completed_at
                    END,
    completed_by  = CASE
                        WHEN $status = 'done' AND completed_by IS NULL THEN $completed_by
                        WHEN $status IN ('open', 'snoozed')            THEN NULL
                        ELSE completed_by
                    END
WHERE id        = $id
  AND tenant_id = $tenant_id
  AND is_live   = $is_live
RETURNING
    id, pulse_type, origin, status, priority,
    title, body, notes, due_date, snoozed_until,
    contact_id, client_id, snapshot_id, assigned_to,
    completed_at, completed_by, created_at, expires_at;
