-- get-contact: single contact with channels
-- Named params: $tenant_id, $is_live, $contact_id

SELECT
    c.id,
    c.contact_no,
    c.prefix,
    c.name,
    c.normalized_name,
    c.is_active,
    c.job_title,
    c.company_name,
    c.company_domain,
    c.linkedin_url,
    c.location,
    c.source,
    c.score,
    c.created_at,
    c.updated_at,
    c.created_by,

    -- Channels as JSON array
    COALESCE(
        (
            SELECT json_agg(
                json_build_object(
                    'id',              ch.id,
                    'channel_type',    ch.channel_type,
                    'channel_value',   ch.channel_value,
                    'channel_subtype', ch.channel_subtype,
                    'is_primary',      ch.is_primary,
                    'source',          ch.source,
                    'created_at',      ch.created_at
                ) ORDER BY ch.is_primary DESC, ch.channel_type ASC, ch.created_at ASC
            )
            FROM gt_contact_channels ch
            WHERE ch.contact_id = c.id
              AND ch.is_live    = c.is_live
              AND ch.is_active  = true
        ),
        '[]'::json
    ) AS channels

FROM gt_contacts c
WHERE c.tenant_id  = $tenant_id
  AND c.is_live    = $is_live
  AND c.id         = $contact_id
  AND c.is_active  = true;
