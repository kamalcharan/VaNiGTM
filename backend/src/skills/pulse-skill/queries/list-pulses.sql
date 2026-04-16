-- pulse-skill: list_pulses
-- Returns pulses for the tenant, optionally filtered by contact, client, status, type.
-- Joins ki_contacts (for prospect pulses) and ki_clients+ki_contacts (for client pulses)
-- to resolve display names in one query.

SELECT
    p.id,
    p.pulse_type,
    p.origin,
    p.status,
    p.priority,
    p.title,
    p.body,
    p.notes,
    p.due_date,
    p.snoozed_until,
    p.snapshot_id,
    p.assigned_to,
    p.completed_at,
    p.completed_by,
    p.created_at,
    p.expires_at,

    -- Contact (prospect path)
    p.contact_id,
    ct_direct.name        AS contact_name,
    ct_direct.prefix      AS contact_prefix,

    -- Client (client path)
    p.client_id,
    ct_client.name        AS client_name,
    ct_client.prefix      AS client_prefix,

    -- Resolved display name (whichever is set)
    COALESCE(ct_direct.name, ct_client.name) AS subject_name,
    COALESCE(ct_direct.prefix, ct_client.prefix) AS subject_prefix

FROM ki_pulses p

-- Prospect contact join
LEFT JOIN ki_contacts ct_direct
       ON ct_direct.id        = p.contact_id
      AND ct_direct.tenant_id = p.tenant_id
      AND ct_direct.is_active = true

-- Client → contact join
LEFT JOIN ki_clients cl
       ON cl.id        = p.client_id
      AND cl.tenant_id = p.tenant_id
      AND cl.is_active = true
LEFT JOIN ki_contacts ct_client
       ON ct_client.id        = cl.contact_id
      AND ct_client.tenant_id = p.tenant_id
      AND ct_client.is_active = true

WHERE p.tenant_id = $tenant_id
  AND p.is_live   = $is_live
  AND ($status    IS NULL OR p.status     = $status)
  AND ($origin    IS NULL OR p.origin     = $origin)
  AND ($pulse_type IS NULL OR p.pulse_type = $pulse_type)
  AND ($contact_id IS NULL OR p.contact_id = $contact_id)
  AND ($client_id  IS NULL OR p.client_id  = $client_id)

ORDER BY
    CASE p.status
        WHEN 'open'     THEN 1
        WHEN 'snoozed'  THEN 2
        WHEN 'done'     THEN 3
        WHEN 'dismissed' THEN 4
        ELSE 5
    END,
    CASE WHEN p.due_date IS NOT NULL THEN 0 ELSE 1 END,
    p.due_date ASC NULLS LAST,
    p.created_at DESC

LIMIT  $limit
OFFSET $offset;
