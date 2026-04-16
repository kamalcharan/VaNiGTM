-- pulse-skill: update_pulse
-- Updates mutable fields on a pulse. Only updates fields that are explicitly passed
-- (non-null). completed_at is set automatically when status transitions to 'done'.

UPDATE ki_pulses
SET
    status        = COALESCE($status::TEXT,        status),
    priority      = COALESCE($priority::TEXT,      priority),
    title         = COALESCE($title::TEXT,         title),
    body          = COALESCE($body::TEXT,          body),
    notes         = COALESCE($notes::TEXT,         notes),
    due_date      = CASE WHEN $clear_due_date  THEN NULL ELSE COALESCE($due_date::DATE,      due_date)  END,
    snoozed_until = CASE WHEN $clear_snooze    THEN NULL ELSE COALESCE($snoozed_until::DATE, snoozed_until) END,
    assigned_to   = COALESCE($assigned_to::TEXT,   assigned_to),
    completed_at  = CASE
                        WHEN $status::TEXT = 'done' AND completed_at IS NULL THEN NOW()
                        WHEN $status::TEXT IN ('open', 'snoozed')            THEN NULL
                        ELSE completed_at
                    END,
    completed_by  = CASE
                        WHEN $status::TEXT = 'done' AND completed_by IS NULL THEN $completed_by::TEXT
                        WHEN $status::TEXT IN ('open', 'snoozed')            THEN NULL
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
