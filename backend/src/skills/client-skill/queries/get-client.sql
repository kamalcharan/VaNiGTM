-- get-client: full client profile with contact, channels, addresses, family, bookmark
-- Named params: $tenant_id, $is_live, $client_id, $user_id

SELECT
    cl.id,
    cl.client_uid,
    cl.client_no,
    cl.contact_id,
    cl.is_active,
    cl.ext_ref_id,
    cl.pan,
    cl.dob,
    cl.anniversary_date,
    cl.survival_status,
    cl.date_of_death,
    cl.family_id,
    cl.is_family_head,
    cl.risk_profile,
    cl.onboarding_status,
    cl.referred_by_name,
    cl.created_at,
    cl.updated_at,

    -- Contact info
    c.prefix,
    c.name,
    c.normalized_name,
    c.age,
    c.city,
    c.marital_status,
    c.dependents_count,

    -- Channels (from contact)
    COALESCE(
        (
            SELECT json_agg(
                json_build_object(
                    'id',              ch.id,
                    'channel_type',    ch.channel_type,
                    'channel_value',   ch.channel_value,
                    'channel_subtype', ch.channel_subtype,
                    'is_primary',      ch.is_primary
                ) ORDER BY ch.is_primary DESC, ch.channel_type, ch.created_at
            )
            FROM ki_contact_channels ch
            WHERE ch.contact_id = c.id AND ch.is_live = cl.is_live AND ch.is_active = true
        ),
        '[]'::json
    ) AS channels,

    -- Addresses
    COALESCE(
        (
            SELECT json_agg(
                json_build_object(
                    'id',           addr.id,
                    'address_type', addr.address_type,
                    'line1',        addr.line1,
                    'line2',        addr.line2,
                    'city',         addr.city,
                    'state',        addr.state,
                    'country',      addr.country,
                    'pincode',      addr.pincode,
                    'is_primary',   addr.is_primary
                ) ORDER BY addr.is_primary DESC, addr.address_type
            )
            FROM ki_client_addresses addr
            WHERE addr.client_id = cl.id AND addr.is_live = cl.is_live AND addr.is_active = true
        ),
        '[]'::json
    ) AS addresses,

    -- Family info
    (
        SELECT json_build_object(
            'id',          f.id,
            'family_name', f.family_name,
            'member_count', (
                SELECT COUNT(*) FROM ki_clients fm
                WHERE fm.family_id = f.id AND fm.tenant_id = cl.tenant_id AND fm.is_active = true
            )
        )
        FROM ki_families f
        WHERE f.id = cl.family_id
        LIMIT 1
    ) AS family,

    -- Bookmark for requesting user
    (
        SELECT json_build_object(
            'id',            bm.id,
            'reason_id',     bm.reason_id,
            'custom_reason', bm.custom_reason,
            'notes',         bm.notes,
            'is_active',     bm.is_active
        )
        FROM ki_client_bookmarks bm
        WHERE bm.client_id = cl.id AND bm.user_id = $user_id
          AND bm.is_live = cl.is_live AND bm.is_active = true
        LIMIT 1
    ) AS bookmark

FROM ki_clients cl
JOIN ki_contacts c ON c.id = cl.contact_id
WHERE cl.id        = $client_id
  AND cl.tenant_id = $tenant_id
  AND cl.is_live   = $is_live;
