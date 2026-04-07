-- get-contact: single contact with channels and snapshot summary
-- Named params: $tenant_id, $is_live, $contact_id

SELECT
    c.id,
    c.prefix,
    c.name,
    c.normalized_name,
    c.is_client,
    c.is_active,
    c.created_at,
    c.updated_at,
    c.created_by,
    -- client record id (non-null once converted)
    kc.id AS client_id,

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
                    'created_at',      ch.created_at
                ) ORDER BY ch.is_primary DESC, ch.channel_type ASC, ch.created_at ASC
            )
            FROM ki_contact_channels ch
            WHERE ch.contact_id = c.id
              AND ch.is_live    = c.is_live
              AND ch.is_active  = true
        ),
        '[]'::json
    ) AS channels,

    -- Snapshot summary (risk_profile + goals count only — not full snapshot)
    (
        SELECT json_build_object(
            'has_snapshot',            true,
            'risk_profile',            s.risk_profile,
            'goals_lite_count',        COALESCE(jsonb_array_length(s.goals_lite), 0),
            'net_worth_estimate',      s.net_worth_estimate,
            'investment_horizon_years', s.investment_horizon_years
        )
        FROM ki_contact_snapshot s
        WHERE s.contact_id = c.id
          AND s.is_live    = c.is_live
        LIMIT 1
    ) AS snapshot_summary

FROM ki_contacts c
LEFT JOIN ki_clients kc
       ON kc.contact_id = c.id
      AND kc.tenant_id  = c.tenant_id
      AND kc.is_live    = c.is_live
WHERE c.tenant_id  = $tenant_id
  AND c.is_live    = $is_live
  AND c.id         = $contact_id
  AND c.is_active  = true;
