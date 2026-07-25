-- pulse-skill: list_pulses
-- Returns pulses for the tenant, optionally filtered by contact, client, status, type.
-- Joins gt_contacts to resolve display names. client_id is legacy (nullable)
-- and no longer resolvable — client rows surface with subject from contact_id only.

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

    -- Legacy client reference (no longer resolvable post-MFD-cleanup)
    p.client_id,
    NULL::text            AS client_name,
    NULL::text            AS client_prefix,

    -- Resolved display name
    ct_direct.name        AS subject_name,
    ct_direct.prefix      AS subject_prefix

FROM ki_pulses p

-- Contact join
LEFT JOIN gt_contacts ct_direct
       ON ct_direct.id        = p.contact_id
      AND ct_direct.tenant_id = p.tenant_id
      AND ct_direct.is_active = true

WHERE p.tenant_id = $tenant_id
  AND p.is_live   = $is_live
  AND ($status::TEXT     IS NULL OR p.status     = $status::TEXT)
  AND ($origin::TEXT     IS NULL OR p.origin     = $origin::TEXT)
  AND ($pulse_type::TEXT IS NULL OR p.pulse_type = $pulse_type::TEXT)
  AND ($contact_id::INT  IS NULL OR p.contact_id = $contact_id::INT)
  AND ($client_id::INT   IS NULL OR p.client_id  = $client_id::INT)

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
