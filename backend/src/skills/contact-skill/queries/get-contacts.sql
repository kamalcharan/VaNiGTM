-- get_contacts: paginated contact list with primary channel info
-- Filters: tenant_id, is_live, is_active, optional search, optional is_client filter
-- Named params: $tenant_id, $is_live, $search (nullable), $is_client (nullable), $limit, $offset

SELECT
    c.id,
    c.contact_no,
    c.prefix,
    c.name,
    c.normalized_name,
    c.is_client,
    c.is_active,
    c.created_at,

    -- Snapshot completeness flag (for readiness ring)
    EXISTS(
        SELECT 1 FROM ki_contact_snapshots s
        WHERE s.contact_id = c.id AND s.is_live = c.is_live
    ) AS has_snapshot,

    -- Primary mobile (first active primary, or first active mobile)
    (
        SELECT ch.channel_value
        FROM ki_contact_channels ch
        WHERE ch.contact_id = c.id
          AND ch.is_live    = c.is_live
          AND ch.is_active  = true
          AND ch.channel_type = 'mobile'
        ORDER BY ch.is_primary DESC, ch.created_at ASC
        LIMIT 1
    ) AS primary_mobile,

    -- Primary email
    (
        SELECT ch.channel_value
        FROM ki_contact_channels ch
        WHERE ch.contact_id = c.id
          AND ch.is_live    = c.is_live
          AND ch.is_active  = true
          AND ch.channel_type = 'email'
        ORDER BY ch.is_primary DESC, ch.created_at ASC
        LIMIT 1
    ) AS primary_email

FROM ki_contacts c
WHERE c.tenant_id = $tenant_id
  AND c.is_live   = $is_live
  AND c.is_active = true
  AND (
      $search::text IS NULL
      OR c.normalized_name ILIKE '%' || UPPER($search::text) || '%'
      OR c.name ILIKE '%' || $search::text || '%'
  )
  AND (
      $is_client::boolean IS NULL
      OR c.is_client = $is_client::boolean
  )
ORDER BY c.name ASC
LIMIT  $limit
OFFSET $offset;
